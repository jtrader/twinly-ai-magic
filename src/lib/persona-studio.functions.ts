import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

type PersonaKind = "real_me" | "ai";
type Visibility = "draft" | "public" | "subscribers" | "vip" | "hidden" | "invite_only";
type ExplicitnessLevel = "sfw" | "suggestive" | "explicit";
type PersonaType = "real_me" | "nice" | "naughty" | "wicked" | "custom";

const SLUG_RE = /^[a-z0-9-]{2,40}$/;
const FAN_FACING_VISIBILITY: ReadonlySet<Visibility> = new Set(["public", "subscribers", "vip", "invite_only"]);
const CEILING_RANK: Record<ExplicitnessLevel, number> = { sfw: 0, suggestive: 1, explicit: 2 };

/** A creator's persona ceiling may never exceed the platform-wide maximum — set only via admin settings, never via chat. */
async function assertCeilingWithinPlatformMax(supabase: any, ceiling: ExplicitnessLevel) {
  const { data: settings } = await supabase
    .from("platform_settings").select("max_explicitness_ceiling").eq("id", true).maybeSingle();
  const max = (settings?.max_explicitness_ceiling ?? "explicit") as ExplicitnessLevel;
  if (CEILING_RANK[ceiling] > CEILING_RANK[max]) {
    throw new Error(`This persona's explicitness ceiling ("${ceiling}") exceeds the platform maximum ("${max}").`);
  }
}

function sanitizeToneRules(input?: { personality?: string }): { personality: string } {
  const personality = (input?.personality ?? "").trim().slice(0, 300);
  return { personality };
}

function sanitizeBoundaryRules(input?: { hardLimits?: string[] }): { hard_limits: string[] } {
  const hardLimits = (input?.hardLimits ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((s) => s.slice(0, 300));
  return { hard_limits: hardLimits };
}

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
    toneRules?: { personality?: string };
    boundaryRules?: { hardLimits?: string[] };
    explicitnessCeiling?: ExplicitnessLevel;
    personaType?: PersonaType;
    veniceChatOptIn?: boolean;
    contentThemeOverrides?: Record<string, boolean>;
  }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const ceiling = data.explicitnessCeiling ?? "sfw";
    // persona_type must agree with kind (DB CHECK enforces this too): only a
    // real_me-kind persona may carry the real_me tag; everything else picks
    // a named tier or defaults to "custom".
    const personaType: PersonaType = data.kind === "real_me" ? "real_me" : (data.personaType ?? "custom");
    if (personaType === "real_me" && data.kind !== "real_me") {
      throw new Error("Only a Real Me persona can use the real_me tier.");
    }
    await assertCeilingWithinPlatformMax(supabase, ceiling);

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

    const sanitizedTone = sanitizeToneRules(data.toneRules);
    const sanitizedBoundary = sanitizeBoundaryRules(data.boundaryRules);
    {
      const { checkPersonaConfigForHardeningRegressions } = await import("./prompt-classification.server");
      const check = checkPersonaConfigForHardeningRegressions({
        systemPrompt: data.systemPrompt,
        personality: sanitizedTone.personality,
        hardLimits: sanitizedBoundary.hard_limits,
      });
      if (!check.ok) {
        throw new Error(
          `This persona can't be created: its configuration would ${check.reason}, which conflicts with required safety instructions. Please rephrase and try again.`,
        );
      }
    }

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
        tone_rules: sanitizedTone,
        boundary_rules: sanitizedBoundary,
        explicitness_ceiling: ceiling,
        persona_type: personaType,
        // Only meaningful at ceiling='suggestive' (resolveChatEngine ignores
        // this flag at 'explicit', where Venice is mandatory, and at 'sfw',
        // where Venice is never used for chat).
        venice_chat_opt_in: !!data.veniceChatOptIn,
        content_theme_overrides: data.contentThemeOverrides ?? {},
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
    toneRules?: { personality?: string };
    boundaryRules?: { hardLimits?: string[] };
    explicitnessCeiling?: ExplicitnessLevel;
    trainingNotes?: {
      tone_examples?: string;
      dos?: string;
      donts?: string;
      sample_phrasings?: string;
      voice_ref_url?: string;
    };
    twinLinkMode?: "all" | "selected" | "none";
    linkedTwinRefIds?: string[];
    heygenAvatarId?: string | null;
    heygenVoiceId?: string | null;
    avatarUrl?: string | null;
    veniceChatOptIn?: boolean;
    contentThemeOverrides?: Record<string, boolean>;
  }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.explicitnessCeiling !== undefined) {
      await assertCeilingWithinPlatformMax(supabase, data.explicitnessCeiling);
    }
    const patch: {
      display_name?: string;
      description?: string | null;
      disclosure_label?: string;
      system_prompt?: string | null;
      is_explicit?: boolean;
      price_cents?: number;
      tone_rules?: { personality: string };
      boundary_rules?: { hard_limits: string[] };
      explicitness_ceiling?: ExplicitnessLevel;
      training_notes?: Record<string, string>;
      twin_link_mode?: "all" | "selected" | "none";
      linked_twin_ref_ids?: string[];
      heygen_avatar_id?: string | null;
      heygen_voice_id?: string | null;
      avatar_url?: string | null;
      venice_chat_opt_in?: boolean;
      content_theme_overrides?: Record<string, boolean>;
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
    if (data.toneRules !== undefined) patch.tone_rules = sanitizeToneRules(data.toneRules);
    if (data.boundaryRules !== undefined) patch.boundary_rules = sanitizeBoundaryRules(data.boundaryRules);
    if (data.explicitnessCeiling !== undefined) patch.explicitness_ceiling = data.explicitnessCeiling;
    if (data.trainingNotes !== undefined) {
      const t = data.trainingNotes;
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(t)) {
        if (typeof v === "string" && v.trim()) clean[k] = v.trim().slice(0, 4000);
      }
      patch.training_notes = clean;
    }
    if (data.twinLinkMode !== undefined) patch.twin_link_mode = data.twinLinkMode;
    if (data.linkedTwinRefIds !== undefined) {
      patch.linked_twin_ref_ids = Array.from(new Set(data.linkedTwinRefIds));
    }
    if (data.heygenAvatarId !== undefined) {
      const v = (data.heygenAvatarId ?? "").trim();
      patch.heygen_avatar_id = v ? v.slice(0, 120) : null;
    }
    if (data.heygenVoiceId !== undefined) {
      const v = (data.heygenVoiceId ?? "").trim();
      patch.heygen_voice_id = v ? v.slice(0, 120) : null;
    }
    if (data.avatarUrl !== undefined) {
      const v = (data.avatarUrl ?? "").trim();
      patch.avatar_url = v ? v.slice(0, 500) : null;
    }
    if (data.veniceChatOptIn !== undefined) patch.venice_chat_opt_in = !!data.veniceChatOptIn;
    if (data.contentThemeOverrides !== undefined) patch.content_theme_overrides = data.contentThemeOverrides;

    // Per-persona save-time regression gate: re-check the freshly-merged
    // config against known hardening-regression patterns whenever any of
    // the prompt-construction-relevant fields change. Runs against the
    // FINAL merged state (existing + this patch), not just the delta, so
    // editing only tone_rules still catches a regression introduced by an
    // earlier, still-active system_prompt/training_notes/boundary_rules.
    if (
      patch.system_prompt !== undefined ||
      patch.tone_rules !== undefined ||
      patch.training_notes !== undefined ||
      patch.boundary_rules !== undefined
    ) {
      const { data: current } = await supabase
        .from("personas")
        .select("system_prompt, tone_rules, training_notes, boundary_rules")
        .eq("id", data.personaId)
        .maybeSingle();
      const merged = {
        systemPrompt: patch.system_prompt !== undefined ? patch.system_prompt : (current as any)?.system_prompt,
        personality: patch.tone_rules !== undefined ? patch.tone_rules.personality : (current as any)?.tone_rules?.personality,
        trainingNotes: patch.training_notes !== undefined ? patch.training_notes : (current as any)?.training_notes,
        hardLimits: patch.boundary_rules !== undefined ? patch.boundary_rules.hard_limits : (current as any)?.boundary_rules?.hard_limits,
      };
      const { checkPersonaConfigForHardeningRegressions } = await import("./prompt-classification.server");
      const check = checkPersonaConfigForHardeningRegressions(merged);
      await logAudit(userId, "persona.config_hardening_check", { type: "persona", id: data.personaId }, {
        passed: check.ok, reason: check.ok ? null : check.reason,
      });
      if (!check.ok) {
        throw new Error(
          `This change can't be saved: your persona's configuration would ${check.reason}, which conflicts with required safety instructions. Please rephrase and try again.`,
        );
      }
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
    const { supabase, userId } = context;

    if (FAN_FACING_VISIBILITY.has(data.visibility)) {
      const { data: persona, error: personaErr } = await supabase
        .from("personas")
        .select("id, kind, creator_id, boundary_rules")
        .eq("id", data.personaId).maybeSingle();
      if (personaErr) throw personaErr;
      if (!persona) throw new Error("Persona not found.");

      if (persona.kind === "ai") {
        const hardLimits = ((persona.boundary_rules as any)?.hard_limits ?? []) as string[];
        if (!hardLimits.length) {
          throw new Error("Set at least one boundary rule for this AI persona before publishing it.");
        }
      }

      const { data: creator, error: creatorErr } = await supabase
        .from("creators").select("verification_status").eq("id", persona.creator_id).maybeSingle();
      if (creatorErr) throw creatorErr;
      if (creator?.verification_status !== "verified") {
        throw new Error("Your identity must be verified before you can publish personas.");
      }
    }

    const { error } = await supabase
      .from("personas").update({ visibility: data.visibility }).eq("id", data.personaId);
    if (error) throw error;
    await logAudit(userId, "persona.visibility_changed", { type: "persona", id: data.personaId }, { visibility: data.visibility });
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