import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";
import {
  fetchContentConnectionContext,
  generateOnboardingCopy,
  type PersonaType,
  type QuestionnaireAnswers,
} from "./persona-onboarding-generation.server";

const TIER_DEFAULTS: Record<Exclude<PersonaType, "real_me" | "custom">, { name: string; description: string }> = {
  nice: { name: "Nice", description: "Warm, playful, safe-for-work." },
  naughty: { name: "Naughty", description: "Flirty, with clear boundaries." },
  wicked: { name: "Wicked", description: "Bolder and more confident, still non-explicit." },
};
const SUGGESTABLE_TIERS: Array<"nice" | "naughty" | "wicked"> = ["nice", "naughty", "wicked"];
const SLUG_RE = /^[a-z0-9-]{2,40}$/;

function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

async function requireCreator(supabase: any, userId: string) {
  const { data: creator, error } = await supabase
    .from("creators").select("id, handle, stage_name").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!creator) throw new Error("Create your creator profile first.");
  return creator as { id: string; handle: string; stage_name: string };
}

async function requireOwnedPersona(supabase: any, userId: string, personaId: string) {
  const creator = await requireCreator(supabase, userId);
  const { data: persona, error } = await supabase
    .from("personas").select("id, creator_id, persona_type, kind, display_name")
    .eq("id", personaId).eq("creator_id", creator.id).maybeSingle();
  if (error) throw error;
  if (!persona) throw new Error("Persona not found, or you don't own it.");
  return { creator, persona };
}

/** Creator's personas plus which named tiers (Nice/Naughty/Wicked) aren't created yet. */
export const listPersonaTierSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const creator = await requireCreator(context.supabase, context.userId);
    const { data: personas, error } = await context.supabase
      .from("personas")
      .select("id, slug, display_name, kind, persona_type, visibility")
      .eq("creator_id", creator.id)
      .order("sort_order", { ascending: true });
    if (error) throw error;

    const existingTiers = new Set((personas ?? []).map((p: any) => p.persona_type));
    const suggestions = SUGGESTABLE_TIERS.filter((t) => !existingTiers.has(t)).map((t) => ({
      tier: t,
      ...TIER_DEFAULTS[t],
    }));

    return { personas: personas ?? [], suggestions };
  });

/** Enable a suggested tier (or add a custom persona) — creates the underlying persona row. */
export const createTierPersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { tier: "nice" | "naughty" | "wicked" | "custom"; customName?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);

    const displayName = data.tier === "custom"
      ? (data.customName ?? "").trim()
      : TIER_DEFAULTS[data.tier].name;
    if (displayName.length < 2 || displayName.length > 60) {
      throw new Error("Name must be 2–60 characters.");
    }

    let slug = slugify(displayName);
    if (!SLUG_RE.test(slug)) throw new Error("Name must contain letters or numbers.");
    const { data: existing } = await supabase.from("personas").select("slug").eq("creator_id", creator.id);
    const taken = new Set((existing ?? []).map((r: any) => r.slug as string));
    if (taken.has(slug)) {
      let n = 2;
      while (taken.has(`${slug}-${n}`) && n < 100) n++;
      slug = `${slug}-${n}`;
    }

    const { data: last } = await supabase
      .from("personas").select("sort_order").eq("creator_id", creator.id)
      .order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const nextOrder = (last?.sort_order ?? -1) + 1;

    const description = data.tier === "custom" ? null : TIER_DEFAULTS[data.tier].description;
    const { data: created, error } = await supabase
      .from("personas")
      .insert({
        creator_id: creator.id,
        slug,
        kind: "ai" as const,
        persona_type: data.tier,
        display_name: displayName,
        description,
        disclosure_label: `${displayName} — Official AI persona`,
        visibility: "draft" as const,
        sort_order: nextOrder,
      })
      .select("*").single();
    if (error) throw error;

    // Pre-fill content framework choices from the Real Me baseline (topics
    // to avoid + general discomfort areas) — defaults only, editable per
    // persona afterward, never a floor/ceiling on the platform's own
    // explicitness enforcement.
    const { data: realMeProfile } = await supabase
      .from("real_me_profiles").select("current_version_id").eq("creator_id", creator.id).maybeSingle();
    if (realMeProfile?.current_version_id) {
      const { data: version } = await supabase
        .from("real_me_profile_versions").select("responses").eq("id", realMeProfile.current_version_id).maybeSingle();
      const responses = (version?.responses ?? {}) as Record<string, unknown>;
      const avoidTopics = (responses["4.6"] as string[] | undefined) ?? [];
      const generalDiscomfortAreas = (responses["7.4"] as string | undefined) ?? "";
      if (avoidTopics.length || generalDiscomfortAreas) {
        await supabase.from("persona_onboarding_configs").insert({
          persona_id: created.id,
          content_framework_choices: { avoidTopics, generalDiscomfortAreas } as any,
        });
      }
    }

    await logAudit(userId, "persona_onboarding.tier_persona_created", { type: "persona", id: created.id }, { tier: data.tier });
    return { persona: created };
  });

/**
 * Saves a new questionnaire response version (never overwrites prior
 * versions) and points the persona's onboarding config at it.
 */
export const saveQuestionnaireResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string; answers: QuestionnaireAnswers }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOwnedPersona(supabase, userId, data.personaId);

    const { data: last } = await supabase
      .from("persona_questionnaire_responses")
      .select("version")
      .eq("persona_id", data.personaId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (last?.version ?? 0) + 1;

    const { data: response, error } = await supabase
      .from("persona_questionnaire_responses")
      .insert({ persona_id: data.personaId, version: nextVersion, answers: data.answers as any, created_by: userId })
      .select("id, version, created_at")
      .single();
    if (error) throw error;

    const { error: upsertErr } = await supabase
      .from("persona_onboarding_configs")
      .upsert(
        { persona_id: data.personaId, questionnaire_response_id: response.id, updated_by: userId, updated_at: new Date().toISOString() },
        { onConflict: "persona_id" },
      );
    if (upsertErr) throw upsertErr;

    await logAudit(userId, "persona_onboarding.questionnaire_saved", { type: "persona", id: data.personaId }, { version: nextVersion });
    return { responseId: response.id, version: response.version, createdAt: response.created_at };
  });

export const listQuestionnaireResponseHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string }) => d)
  .handler(async ({ data, context }) => {
    await requireOwnedPersona(context.supabase, context.userId, data.personaId);
    const { data: rows, error } = await context.supabase
      .from("persona_questionnaire_responses")
      .select("id, version, answers, created_at")
      .eq("persona_id", data.personaId)
      .order("version", { ascending: false });
    if (error) throw error;
    return { responses: rows ?? [] };
  });

export const getPersonaOnboardingConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string }) => d)
  .handler(async ({ data, context }) => {
    const { persona } = await requireOwnedPersona(context.supabase, context.userId, data.personaId);

    const [{ data: config }, { data: latestResponse }] = await Promise.all([
      context.supabase
        .from("persona_onboarding_configs")
        .select("id, questionnaire_response_id, tone_guidelines, opener_templates, content_framework_choices, status, updated_at")
        .eq("persona_id", data.personaId)
        .maybeSingle(),
      context.supabase
        .from("persona_questionnaire_responses")
        .select("id, version, answers, created_at")
        .eq("persona_id", data.personaId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      persona,
      config: config ?? null,
      latestResponse: latestResponse ?? null,
    };
  });

/** Generates (or regenerates — same action, called again) tone guidelines + opener templates. */
export const generatePersonaOnboardingCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { creator, persona } = await requireOwnedPersona(supabase, userId, data.personaId);

    const { data: latestResponse } = await supabase
      .from("persona_questionnaire_responses")
      .select("answers")
      .eq("persona_id", data.personaId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latestResponse) throw new Error("Complete the questionnaire before generating tone guidelines.");

    const contentContext = await fetchContentConnectionContext(creator.id);
    const generated = await generateOnboardingCopy(
      persona.persona_type as PersonaType,
      latestResponse.answers as QuestionnaireAnswers,
      contentContext,
    );

    const { error } = await supabase
      .from("persona_onboarding_configs")
      .upsert(
        {
          persona_id: data.personaId,
          tone_guidelines: generated.toneGuidelines,
          opener_templates: generated.openerTemplates,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "persona_id" },
      );
    if (error) throw error;

    await logAudit(userId, "persona_onboarding.copy_generated", { type: "persona", id: data.personaId }, {
      usedContentConnection: !!contentContext,
    });
    return generated;
  });

export const updatePersonaOnboardingCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string; toneGuidelines?: string; openerTemplates?: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOwnedPersona(supabase, userId, data.personaId);

    const patch: { tone_guidelines?: string; opener_templates?: string[]; updated_by: string; updated_at: string } = {
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (data.toneGuidelines !== undefined) {
      const v = data.toneGuidelines.trim();
      if (v.length > 2000) throw new Error("Tone guideline must be 2000 characters or fewer.");
      patch.tone_guidelines = v;
    }
    if (data.openerTemplates !== undefined) {
      const cleaned = data.openerTemplates.map((o) => o.trim()).filter(Boolean).slice(0, 10);
      patch.opener_templates = cleaned;
    }

    const { error } = await supabase
      .from("persona_onboarding_configs")
      .upsert({ persona_id: data.personaId, ...patch }, { onConflict: "persona_id" });
    if (error) throw error;

    await logAudit(userId, "persona_onboarding.copy_edited", { type: "persona", id: data.personaId }, {});
    return { ok: true };
  });

export const updateContentFrameworkChoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string; choices: Record<string, unknown> }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOwnedPersona(supabase, userId, data.personaId);
    const { error } = await supabase
      .from("persona_onboarding_configs")
      .upsert(
        { persona_id: data.personaId, content_framework_choices: data.choices as any, updated_by: userId, updated_at: new Date().toISOString() },
        { onConflict: "persona_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const setPersonaOnboardingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string; status: "draft" | "published" }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOwnedPersona(supabase, userId, data.personaId);
    const { error } = await supabase
      .from("persona_onboarding_configs")
      .upsert(
        { persona_id: data.personaId, status: data.status, updated_by: userId, updated_at: new Date().toISOString() },
        { onConflict: "persona_id" },
      );
    if (error) throw error;
    await logAudit(userId, "persona_onboarding.status_changed", { type: "persona", id: data.personaId }, { status: data.status });
    return { ok: true };
  });

/** Structured Markdown export of every persona's onboarding materials for this creator. */
export const exportPersonaOnboardingMarkdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);

    const { data: personas, error } = await supabase
      .from("personas")
      .select("id, display_name, persona_type, disclosure_label")
      .eq("creator_id", creator.id)
      .order("sort_order", { ascending: true });
    if (error) throw error;

    const personaIds = (personas ?? []).map((p: any) => p.id);
    const { data: configs } = personaIds.length
      ? await supabase
        .from("persona_onboarding_configs")
        .select("persona_id, tone_guidelines, opener_templates, content_framework_choices, status")
        .in("persona_id", personaIds)
      : { data: [] as any[] };
    const configByPersona = new Map((configs ?? []).map((c: any) => [c.persona_id, c]));

    const TIER_LABEL: Record<string, string> = { real_me: "Real Me", nice: "Nice", naughty: "Naughty", wicked: "Wicked", custom: "Custom" };
    const lines: string[] = [
      `# ${creator.stage_name} — Persona Onboarding Reference`,
      "",
      `Exported ${new Date().toISOString().slice(0, 10)}. Non-explicit tone guidance and opener templates only.`,
      "",
    ];
    for (const p of personas ?? []) {
      const cfg = configByPersona.get(p.id);
      lines.push(`## ${p.display_name} (${TIER_LABEL[p.persona_type] ?? p.persona_type})`);
      lines.push(`_Status: ${cfg?.status ?? "draft"}_`);
      lines.push("");
      lines.push("### Tone guidelines");
      lines.push(cfg?.tone_guidelines?.trim() || "_Not generated yet._");
      lines.push("");
      lines.push("### Opener templates");
      const openers = (cfg?.opener_templates ?? []) as string[];
      if (openers.length) {
        for (const o of openers) lines.push(`- ${o}`);
      } else {
        lines.push("_Not generated yet._");
      }
      lines.push("");
      lines.push("### Content framework choices");
      const choices = (cfg?.content_framework_choices ?? {}) as Record<string, unknown>;
      if (Object.keys(choices).length) {
        for (const [k, v] of Object.entries(choices)) lines.push(`- **${k}**: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
      } else {
        lines.push("_None set._");
      }
      lines.push("");
      lines.push("---");
      lines.push("");
    }

    return { markdown: lines.join("\n"), filename: `${creator.handle}-persona-onboarding.md` };
  });
