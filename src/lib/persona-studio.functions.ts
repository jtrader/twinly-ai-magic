import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

type PersonaKind = "real_me" | "ai";
type Visibility = "draft" | "public" | "subscribers" | "vip" | "hidden";

const SLUG_RE = /^[a-z0-9-]{2,40}$/;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function requireCreator(supabase: any, userId: string) {
  const { data: creator, error } = await supabase
    .from("creators").select("id, handle").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!creator) throw new Error("Create your creator profile first.");
  return creator as { id: string; handle: string };
}

export const createPersona = createServerFn({ method: "POST" })
  .validator((d: {
    displayName: string;
    kind: PersonaKind;
    description?: string;
    disclosureLabel?: string;
    systemPrompt?: string;
    isExplicit?: boolean;
    priceCents?: number;
  }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);

    const displayName = data.displayName.trim();
    if (displayName.length < 2 || displayName.length > 60) {
      throw new Error("Name must be 2–60 characters.");
    }
    let slug = slugify(displayName);
    if (!SLUG_RE.test(slug)) throw new Error("Name must contain letters or numbers.");

    // Ensure slug uniqueness within the creator.
    const { data: existing } = await supabase
      .from("personas").select("slug").eq("creator_id", creator.id);
    const taken = new Set((existing ?? []).map((r: any) => r.slug as string));
    if (taken.has(slug)) {
      let n = 2;
      while (taken.has(`${slug}-${n}`) && n < 100) n++;
      slug = `${slug}-${n}`;
    }

    const disclosureLabel = data.disclosureLabel?.trim() || (
      data.kind === "ai"
        ? `${displayName} — Official AI persona`
        : `${displayName} — Human creator/team`
    );

    // Place new personas at the end.
    const { data: last } = await supabase
      .from("personas").select("sort_order").eq("creator_id", creator.id)
      .order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const nextOrder = (last?.sort_order ?? -1) + 1;

    const { data: created, error } = await supabase
      .from("personas")
      .insert({
        creator_id: creator.id,
        slug,
        kind: data.kind,
        display_name: displayName,
        description: data.description?.trim() || null,
        disclosure_label: disclosureLabel,
        system_prompt: data.systemPrompt?.trim() || null,
        is_explicit: !!data.isExplicit,
        price_cents: Math.max(0, Math.floor(data.priceCents ?? 0)),
        visibility: "draft" as Visibility,
        sort_order: nextOrder,
      })
      .select("*").single();
    if (error) throw error;

    await logAudit(userId, "persona.created", { type: "persona", id: created.id }, {
      kind: data.kind, slug,
    });
    return { persona: created };
  });

export const updatePersona = createServerFn({ method: "POST" })
  .validator((d: {
    personaId: string;
    displayName?: string;
    description?: string;
    disclosureLabel?: string;
    systemPrompt?: string;
    isExplicit?: boolean;
    priceCents?: number;
    trainingNotes?: {
      tone_examples?: string;
      dos?: string;
      donts?: string;
      sample_phrasings?: string;
      voice_ref_url?: string;
    };
  }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: {
      display_name?: string;
      description?: string | null;
      disclosure_label?: string;
      system_prompt?: string | null;
      is_explicit?: boolean;
      price_cents?: number;
      training_notes?: Record<string, string>;
    } = {};
    if (data.displayName !== undefined) {
      const v = data.displayName.trim();
      if (v.length < 2 || v.length > 60) throw new Error("Name must be 2–60 characters.");
      patch.display_name = v;
    }
    if (data.description !== undefined) {
      const v = data.description.trim();
      if (v.length > 500) throw new Error("Description must be 500 characters or fewer.");
      patch.description = v || null;
    }
    if (data.disclosureLabel !== undefined) {
      const v = data.disclosureLabel.trim();
      if (v.length < 4 || v.length > 120) throw new Error("Disclosure label must be 4–120 characters.");
      patch.disclosure_label = v;
    }
    if (data.systemPrompt !== undefined) {
      const v = data.systemPrompt.trim();
      if (v.length > 4000) throw new Error("System prompt must be 4000 characters or fewer.");
      patch.system_prompt = v || null;
    }
    if (data.isExplicit !== undefined) patch.is_explicit = !!data.isExplicit;
    if (data.priceCents !== undefined) patch.price_cents = Math.max(0, Math.floor(data.priceCents));
    if (data.trainingNotes !== undefined) {
      const t = data.trainingNotes;
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(t)) {
        if (typeof v === "string" && v.trim()) clean[k] = v.trim().slice(0, 4000);
      }
      patch.training_notes = clean;
    }

    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await supabase.from("personas").update(patch).eq("id", data.personaId);
    if (error) throw error;
    await logAudit(userId, "persona.updated", { type: "persona", id: data.personaId }, { fields: Object.keys(patch) });
    return { ok: true };
  });

export const setPersonaVisibility = createServerFn({ method: "POST" })
  .validator((d: { personaId: string; visibility: Visibility }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("personas").update({ visibility: data.visibility }).eq("id", data.personaId);
    if (error) throw error;
    await logAudit(context.userId, "persona.visibility_changed", { type: "persona", id: data.personaId }, { visibility: data.visibility });
    return { ok: true };
  });

export const deletePersona = createServerFn({ method: "POST" })
  .validator((d: { personaId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: persona, error: readErr } = await supabase
      .from("personas").select("id, is_default_seed, creator_id").eq("id", data.personaId).maybeSingle();
    if (readErr) throw readErr;
    if (!persona) throw new Error("Persona not found.");
    if (persona.is_default_seed) throw new Error("Default personas can't be deleted — hide them instead.");
    const { error } = await supabase.from("personas").delete().eq("id", data.personaId);
    if (error) throw error;
    await logAudit(userId, "persona.deleted", { type: "persona", id: data.personaId }, {});
    return { ok: true };
  });

export const reorderPersonas = createServerFn({ method: "POST" })
  .validator((d: { order: { id: string; sortOrder: number }[] }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    for (const item of data.order) {
      const { error } = await supabase
        .from("personas")
        .update({ sort_order: Math.max(0, Math.floor(item.sortOrder)) })
        .eq("id", item.id).eq("creator_id", creator.id);
      if (error) throw error;
    }
    await logAudit(userId, "persona.reordered", { type: "creator", id: creator.id }, { count: data.order.length });
    return { ok: true };
  });