import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

const HANDLE_RE = /^[a-z0-9_]{3,24}$/;

export const checkHandleAvailable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { handle: string }) => d)
  .handler(async ({ data, context }) => {
    const handle = data.handle.trim().toLowerCase();
    if (!HANDLE_RE.test(handle)) {
      return { available: false, reason: "Use 3–24 lowercase letters, numbers, or underscores." };
    }
    const { data: row } = await context.supabase
      .from("creators").select("id").eq("handle", handle).maybeSingle();
    return { available: !row, handle };
  });

export const createCreatorProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { handle: string; stageName: string; bio?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const handle = data.handle.trim().toLowerCase();
    const stageName = data.stageName.trim();
    if (!HANDLE_RE.test(handle)) throw new Error("Invalid handle.");
    if (stageName.length < 2 || stageName.length > 60) throw new Error("Stage name must be 2–60 characters.");

    // Idempotent: return existing creator if user already has one.
    const { data: existing } = await supabase
      .from("creators").select("*").eq("user_id", userId).maybeSingle();
    if (existing) return { creator: existing, created: false };

    const { data: conflict } = await supabase
      .from("creators").select("id").eq("handle", handle).maybeSingle();
    if (conflict) throw new Error("That handle is taken.");

    const { data: creator, error } = await supabase
      .from("creators")
      .insert({
        user_id: userId,
        handle,
        stage_name: stageName,
        bio: data.bio?.trim() || null,
      })
      .select("*").single();
    if (error) throw error;

    // Grant creator role (idempotent via unique constraint).
    await supabase.from("user_roles").insert({ user_id: userId, role: "creator" as const })
      .then(() => undefined, () => undefined);

    // Real Me is always present per creator (persona-onboarding studio) —
    // seeded here so it exists before the creator ever visits persona
    // studio, matching what escalation/away-mode already assume is there.
    // is_default_seed protects it from deletion (see deletePersona).
    await supabase.from("personas").insert({
      creator_id: creator.id,
      slug: "real-me",
      kind: "real_me" as const,
      persona_type: "real_me" as const,
      display_name: "Real Me",
      disclosure_label: `${stageName} — Human creator/team`,
      is_default_seed: true,
      visibility: "draft" as const,
      sort_order: 0,
    }).then(() => undefined, () => undefined);

    await logAudit(userId, "creator.created", { type: "creator", id: creator.id }, { handle });
    return { creator, created: true };
  });

export const listMyPersonas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: creator } = await supabase
      .from("creators").select("id, handle, stage_name, onboarding_completed_at, verification_status")
      .eq("user_id", userId).maybeSingle();
    if (!creator) return { creator: null, personas: [] };
    // Real (legal) name, distinct from the public stage_name — used only for
    // the persona-naming privacy-separation warning in the studio UI, never
    // sent anywhere else.
    const { data: profile } = await supabase
      .from("profiles").select("full_name").eq("id", userId).maybeSingle();
    const { data: personas } = await supabase
      .from("personas")
      .select("id, slug, display_name, kind, description, disclosure_label, visibility, sort_order, twin_link_mode, linked_twin_ref_ids, training_notes, system_prompt, is_explicit, explicitness_ceiling, tone_rules, boundary_rules, price_cents, is_default_seed")
      .eq("creator_id", creator.id)
      .order("sort_order", { ascending: true });
    return { creator: { ...creator, fullName: (profile as any)?.full_name ?? null }, personas: personas ?? [] };
  });

export const updatePersonaBasics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string; displayName?: string; description?: string }) => d)
  .handler(async ({ data, context }) => {
    const patch: { display_name?: string; description?: string | null } = {};
    if (data.displayName !== undefined) {
      const v = data.displayName.trim();
      if (v.length < 2 || v.length > 60) throw new Error("Persona name must be 2–60 characters.");
      patch.display_name = v;
    }
    if (data.description !== undefined) {
      const v = data.description.trim();
      if (v.length > 500) throw new Error("Description must be 500 characters or fewer.");
      patch.description = v || null;
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("personas").update(patch).eq("id", data.personaId);
    if (error) throw error;
    return { ok: true };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { publishPersonaIds: string[]; consentName: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const consentName = data.consentName.trim();
    if (consentName.length < 2) throw new Error("Type your legal name to sign consent.");

    const { data: creator } = await supabase
      .from("creators").select("id, handle").eq("user_id", userId).maybeSingle();
    if (!creator) throw new Error("Create your creator profile first.");

    if (data.publishPersonaIds.length) {
      const { error } = await supabase
        .from("personas")
        .update({ visibility: "public" as const })
        .in("id", data.publishPersonaIds)
        .eq("creator_id", creator.id);
      if (error) throw error;
    }

    await supabase.from("digital_twin_consent").insert({
      creator_id: creator.id,
      signed_by_name: consentName,
      signed_at: new Date().toISOString(),
    } as any).then(() => undefined, () => undefined);

    const { error: upErr } = await supabase
      .from("creators")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", creator.id);
    if (upErr) throw upErr;

    await logAudit(userId, "creator.onboarding_completed", { type: "creator", id: creator.id }, {
      published: data.publishPersonaIds.length,
    });
    return { handle: creator.handle };
  });