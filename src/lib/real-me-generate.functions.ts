import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  REAL_ME_QUESTIONNAIRE,
  computeOverallCompletionPercentage,
  effectiveQuestions,
  type QuestionDefinition,
} from "./real-me-questionnaire-schema";

type SavedAnswerValue = string | number | boolean | string[];
type SavedAnswers = Record<string, SavedAnswerValue>;

export type SeedInput = {
  gender: string;
  ageBracket: string;
  lifestyle: string[];
  traits: string[];
};

function schemaHintForQuestion(q: QuestionDefinition): string {
  switch (q.type) {
    case "multi_select":
      return `array of strings, each MUST be one of: ${JSON.stringify(q.options ?? [])}`;
    case "single_select":
      return q.allowCustomOption
        ? `single string; prefer one of ${JSON.stringify(q.options ?? [])} or a short custom value`
        : `single string, MUST be one of: ${JSON.stringify(q.options ?? [])}`;
    case "yes_no":
      return "boolean (true/false)";
    case "rating":
      return "integer 1-10";
    case "custom_prompt":
      return `short natural-language string, max ${q.maxLength ?? 500} chars`;
  }
}

function buildQuestionSpec(): string {
  const lines: string[] = [];
  for (const section of REAL_ME_QUESTIONNAIRE) {
    lines.push(`# Section ${section.id}: ${section.title}`);
    for (const q of section.questions) {
      lines.push(`- "${q.id}" (${q.type}): ${q.promptText}`);
      lines.push(`   -> ${schemaHintForQuestion(q)}`);
      if (q.conditionalOn) {
        lines.push(`   -> only include if answer to "${q.conditionalOn.questionId}" is ${q.conditionalOn.equals}`);
      }
    }
  }
  return lines.join("\n");
}

/** Validate + coerce AI output against the question schema; drop anything malformed. */
function sanitizeAnswers(raw: Record<string, unknown>): SavedAnswers {
  const out: SavedAnswers = {};
  // First pass: everything except conditional questions
  const byId = new Map<string, QuestionDefinition>();
  for (const s of REAL_ME_QUESTIONNAIRE) for (const q of s.questions) byId.set(q.id, q);

  for (const [id, val] of Object.entries(raw)) {
    const q = byId.get(id);
    if (!q) continue;
    switch (q.type) {
      case "multi_select": {
        if (!Array.isArray(val)) break;
        const allowed = new Set(q.options ?? []);
        const filtered = val.filter((v): v is string => typeof v === "string" && allowed.has(v));
        if (filtered.length) out[id] = filtered;
        break;
      }
      case "single_select": {
        if (typeof val !== "string") break;
        const allowed = new Set(q.options ?? []);
        if (allowed.has(val) || q.allowCustomOption) out[id] = val.slice(0, 200);
        break;
      }
      case "yes_no": {
        if (typeof val === "boolean") out[id] = val;
        break;
      }
      case "rating": {
        const n = typeof val === "number" ? val : Number(val);
        if (Number.isFinite(n)) out[id] = Math.min(10, Math.max(1, Math.round(n)));
        break;
      }
      case "custom_prompt": {
        if (typeof val === "string" && val.trim().length > 0) {
          out[id] = val.slice(0, q.maxLength ?? 500);
        }
        break;
      }
    }
  }

  // Second pass: drop answers to conditional questions whose trigger isn't met
  for (const s of REAL_ME_QUESTIONNAIRE) {
    const eff = new Set(effectiveQuestions(s, out).map((q) => q.id));
    for (const q of s.questions) {
      if (q.conditionalOn && !eff.has(q.id)) delete out[q.id];
    }
  }
  return out;
}

async function callLovableAi(
  prompt: string,
  apiKey: string,
  opts: { temperature?: number } = {},
): Promise<Record<string, unknown>> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You generate coherent, believable fictional persona profiles. Return ONLY valid JSON. The JSON is a flat object whose keys are the question ids and whose values match each question's declared type exactly. Do not add commentary, markdown, or fields not requested. Every string must be concise and in first person where appropriate.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: opts.temperature ?? 0.9,
    }),
  });
  if (res.status === 429) throw new Error("AI is rate limited right now. Try again in a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`AI request failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new Error("AI returned unparseable output.");
}

async function requireCreator(supabase: any, userId: string) {
  const { data: creator, error } = await supabase
    .from("creators").select("id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!creator) throw new Error("Create your creator profile first.");
  return creator as { id: string };
}

/** Flavor prompts per variant so alternates don't collapse to the same character. */
const VARIANT_STYLES = [
  "Lean warm, grounded, and relationship-focused. Emphasize sincerity and small everyday joys.",
  "Lean playful, sharp-witted, and pop-culture literate. A bit more edge and irreverence.",
  "Lean adventurous, ambitious, and worldly. Big goals, restless curiosity, drives conversations forward.",
  "Lean introspective, quietly confident, and creative. Values depth over spectacle.",
];

function buildPrompt(seed: SeedInput, styleHint: string): string {
  return [
    "Create a believable, internally consistent fictional creator persona.",
    "",
    "Seed traits (must be reflected coherently across the profile):",
    `- Gender: ${seed.gender}`,
    `- Age bracket: ${seed.ageBracket}`,
    `- Lifestyle tags: ${seed.lifestyle.join(", ") || "(none)"}`,
    `- Character traits: ${seed.traits.join(", ") || "(none)"}`,
    "",
    `Style direction for THIS variant: ${styleHint}`,
    "",
    "Fill EVERY question below. Multi/single-select answers MUST be picked from the given options exactly (copy the strings verbatim).",
    "Keep custom_prompt answers concise (1-3 sentences).",
    "",
    buildQuestionSpec(),
    "",
    'Return a single JSON object. Example shape: {"1.1":"Alex","1.2":"she/her","2.1":["Warm","Playful"],"2.2":6,"3.5":true,"3.5b":"NBA — Lakers"}',
  ].join("\n");
}

async function generateOneVariant(
  seed: SeedInput,
  styleHint: string,
  apiKey: string,
): Promise<SavedAnswers> {
  const raw = await callLovableAi(buildPrompt(seed, styleHint), apiKey);
  return sanitizeAnswers(raw);
}

/**
 * Generate N alternate Real Me drafts from the same seed answers WITHOUT saving.
 * The client picks one, optionally edits it, then calls saveGeneratedRealMe to persist.
 */
export const generateRealMeVariants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { seed: SeedInput; count?: number }) => d)
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured for this project.");
    await requireCreator(context.supabase, context.userId);

    const count = Math.min(Math.max(data.count ?? 3, 1), 3);
    const styles = VARIANT_STYLES.slice(0, count);

    // Run in parallel. If ALL fail, surface the first error; otherwise return the successes.
    const results = await Promise.allSettled(
      styles.map((style) => generateOneVariant(data.seed, style, apiKey)),
    );
    const variants = results
      .map((r, i) => (r.status === "fulfilled" ? { style: styles[i], answers: r.value } : null))
      .filter((v): v is { style: string; answers: SavedAnswers } => v !== null);

    if (variants.length === 0) {
      const first = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      throw new Error(first?.reason?.message ?? "AI generation failed. Please try again.");
    }

    return {
      variants: variants.map((v, i) => ({
        id: `v${i + 1}`,
        style: v.style,
        answers: v.answers,
        completion: computeOverallCompletionPercentage(REAL_ME_QUESTIONNAIRE, v.answers),
      })),
    };
  });

/** Persist an edited AI-generated draft as a NEW Real Me version, tagged with the seed. */
export const saveGeneratedRealMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { answers: SavedAnswers; seed: SeedInput }) => d)
  .handler(async ({ data, context }) => {
    const creator = await requireCreator(context.supabase, context.userId);

    // Re-sanitize on the server — never trust client-shaped payloads.
    const answers = sanitizeAnswers(data.answers as Record<string, unknown>);
    const completion = computeOverallCompletionPercentage(REAL_ME_QUESTIONNAIRE, answers);

    const { data: profile } = await context.supabase
      .from("real_me_profiles").select("id").eq("creator_id", creator.id).maybeSingle();

    let profileId = profile?.id as string | undefined;
    if (!profileId) {
      const { data: np, error: npErr } = await context.supabase
        .from("real_me_profiles").insert({ creator_id: creator.id }).select("id").single();
      if (npErr) throw npErr;
      profileId = np.id as string;
    }

    const { data: maxV } = await context.supabase
      .from("real_me_profile_versions").select("version_number")
      .eq("real_me_profile_id", profileId).order("version_number", { ascending: false }).limit(1).maybeSingle();

    const seedPayload = {
      gender: data.seed.gender,
      ageBracket: data.seed.ageBracket,
      lifestyle: data.seed.lifestyle,
      traits: data.seed.traits,
      source: "ai_generated" as const,
      generatedAt: new Date().toISOString(),
    };

    const { data: newVersion, error: vErr } = await context.supabase
      .from("real_me_profile_versions")
      .insert({
        real_me_profile_id: profileId,
        version_number: (maxV?.version_number ?? 0) + 1,
        responses: answers as any,
        completion_percentage: completion,
        generation_seed: seedPayload as any,
      } as any)
      .select("*").single();
    if (vErr) throw vErr;

    await context.supabase
      .from("real_me_profiles").update({ current_version_id: newVersion.id }).eq("id", profileId);

    return { version: newVersion, answers };
  });