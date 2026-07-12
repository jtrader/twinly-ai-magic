/**
 * Generation service for the persona onboarding studio: questionnaire
 * answers -> a short tone guideline + 5-10 opener templates. Non-explicit by
 * design regardless of persona_type — Naughty/Wicked get a bolder, flirtier
 * baseline than Nice, never an explicit one. Uses the same Lovable AI
 * gateway already wired for chat replies (chat.functions.ts), not a
 * separate/unmoderated provider — this is short marketing-style copy, not
 * in-character explicit generation.
 */

export type PersonaType = "real_me" | "nice" | "naughty" | "wicked" | "custom";

export type QuestionnaireAnswers = {
  voicePersonality?: { toneWords?: string[]; pacing?: string; humorStyle?: string };
  boundariesPreferences?: {
    topicsToAvoid?: string[];
    topicsToLeanInto?: string[];
    phrasesWanted?: string[];
    phrasesAvoided?: string[];
  };
  audienceFraming?: { selfDescription?: string; relationshipToRealMe?: string };
  contentThemes?: { subjectAreas?: string[] };
};

export type ContentConnectionContext = {
  items: Array<{ title: string; tags?: string[]; summary?: string }>;
} | null;

export type GeneratedOnboardingCopy = {
  toneGuidelines: string;
  openerTemplates: string[];
};

/** Tier intensity baseline — a vibe descriptor, never an explicitness escalation. */
const TIER_BASELINE: Record<PersonaType, string> = {
  real_me: "Authentic and personal — this is the verified creator's own voice, not a character.",
  nice: "Warm, wholesome, encouraging — safe-for-work in every sense.",
  naughty: "Playful and flirty, with a teasing wink — suggestive at most, never explicit.",
  wicked: "Bolder and more confident than Naughty, still strictly non-explicit — sultry tone and innuendo, not explicit content.",
  custom: "Follows the creator's own questionnaire answers with no preset intensity baseline.",
};

const NON_EXPLICIT_INSTRUCTION =
  "Hard rule, regardless of tier name: never write explicit sexual content. " +
  "\"Naughty\" and \"Wicked\" mean flirty/suggestive/teasing at most — innuendo is fine, explicit description is not. " +
  "This applies to both the tone guideline and every opener template.";

function listOrNone(items: string[] | undefined, label: string): string {
  if (!items || items.length === 0) return `${label}: (none given)`;
  return `${label}: ${items.join(", ")}`;
}

/**
 * Builds the LLM prompt from questionnaire answers + tier baseline +
 * optional content-connection context. Pure/deterministic given its inputs
 * — no network calls — so it's directly unit-testable.
 */
export function buildOnboardingPrompt(
  personaType: PersonaType,
  answers: QuestionnaireAnswers,
  contentContext: ContentConnectionContext,
): { system: string; user: string } {
  const v = answers.voicePersonality ?? {};
  const b = answers.boundariesPreferences ?? {};
  const a = answers.audienceFraming ?? {};
  const c = answers.contentThemes ?? {};

  const system = [
    "You write short, brand-safe persona onboarding copy for a creator platform.",
    `Persona tier: ${personaType}. Tier baseline: ${TIER_BASELINE[personaType]}`,
    NON_EXPLICIT_INSTRUCTION,
    "Respond with ONLY a JSON object of the exact shape " +
      '{"toneGuidelines": "<2-4 sentence prose paragraph>", "openerTemplates": ["<line>", ...]}' +
      " with between 5 and 10 openerTemplates. No markdown fences, no extra commentary.",
  ].join("\n");

  const user = [
    "Questionnaire answers:",
    listOrNone(v.toneWords, "Tone words"),
    `Pacing: ${v.pacing || "(not given)"}`,
    `Humor style: ${v.humorStyle || "(not given)"}`,
    listOrNone(b.topicsToAvoid, "Topics to avoid"),
    listOrNone(b.topicsToLeanInto, "Topics to lean into"),
    listOrNone(b.phrasesWanted, "Phrases/pet names to use"),
    listOrNone(b.phrasesAvoided, "Phrases/pet names to avoid"),
    `Self-description if asked what this persona is: ${a.selfDescription || "(not given)"}`,
    `How it should describe its relationship to Real Me: ${a.relationshipToRealMe || "(not given)"}`,
    listOrNone(c.subjectAreas, "Content subject areas"),
    contentContext && contentContext.items.length
      ? "Reference — existing published content themes from this creator (for tone inspiration only, do not copy):\n" +
        contentContext.items.map((i) => `- ${i.title}${i.tags?.length ? ` (${i.tags.join(", ")})` : ""}`).join("\n")
      : "No published-content reference available — base this entirely on the questionnaire answers above.",
  ].join("\n");

  return { system, user };
}

/**
 * Parses the model's response into structured copy. Tries strict JSON
 * first, then a best-effort JSON substring extraction, then falls back to a
 * safe placeholder built directly from the answers — generation should
 * never hard-fail the caller.
 */
export function parseGeneratedCopy(raw: string, answers: QuestionnaireAnswers): GeneratedOnboardingCopy {
  const tryParse = (text: string): GeneratedOnboardingCopy | null => {
    try {
      const obj = JSON.parse(text);
      const toneGuidelines = typeof obj.toneGuidelines === "string" ? obj.toneGuidelines.trim() : "";
      const openerTemplates = Array.isArray(obj.openerTemplates)
        ? obj.openerTemplates.filter((o: unknown): o is string => typeof o === "string" && o.trim().length > 0).map((o: string) => o.trim())
        : [];
      if (!toneGuidelines || openerTemplates.length === 0) return null;
      return { toneGuidelines, openerTemplates: openerTemplates.slice(0, 10) };
    } catch {
      return null;
    }
  };

  const direct = tryParse(raw.trim());
  if (direct) return direct;

  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    const extracted = tryParse(match[0]);
    if (extracted) return extracted;
  }

  return fallbackCopy(answers);
}

/** Deterministic, always-safe fallback used when generation fails or is unavailable entirely. */
export function fallbackCopy(answers: QuestionnaireAnswers): GeneratedOnboardingCopy {
  const toneWords = answers.voicePersonality?.toneWords?.filter(Boolean) ?? [];
  const toneGuidelines = toneWords.length
    ? `This persona comes across as ${toneWords.join(", ")}. Generation isn't available right now — edit this draft directly or try regenerating in a moment.`
    : "Generation isn't available right now. Describe the tone here, or fill in the questionnaire and try regenerating.";
  return {
    toneGuidelines,
    openerTemplates: [
      "Hey! Good to see you here 👋",
      "Hi there — what's on your mind today?",
    ],
  };
}

async function callGateway(system: string, user: string): Promise<string | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.error("[twinly] persona onboarding generation failed:", e);
    return null;
  }
}

export async function generateOnboardingCopy(
  personaType: PersonaType,
  answers: QuestionnaireAnswers,
  contentContext: ContentConnectionContext,
): Promise<GeneratedOnboardingCopy> {
  const { system, user } = buildOnboardingPrompt(personaType, answers, contentContext);
  const raw = await callGateway(system, user);
  if (!raw) return fallbackCopy(answers);
  return parseGeneratedCopy(raw, answers);
}

/**
 * Read-only reference source: twinly-content.lovable.app. NOT connected in
 * this environment (no API key, MCP connector, or docs available) — the
 * data contract below is a documented ASSUMPTION, not a confirmed API
 * shape, pending real connection details. Set TWINLY_CONTENT_CONNECTION_URL
 * to point at a real endpoint; until then this always returns null and
 * generation proceeds from questionnaire answers alone, per spec (never a
 * hard dependency). Assumed contract: GET <url>?creatorId=<id> ->
 * { items: Array<{ title: string; tags?: string[]; summary?: string }> }.
 */
export async function fetchContentConnectionContext(creatorId: string): Promise<ContentConnectionContext> {
  const base = process.env.TWINLY_CONTENT_CONNECTION_URL;
  if (!base) return null;
  try {
    const res = await fetch(`${base}?creatorId=${encodeURIComponent(creatorId)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    if (!json || !Array.isArray(json.items)) return null;
    return { items: json.items };
  } catch (e) {
    console.error("[twinly] content connection unreachable, falling back to questionnaire-only:", e);
    return null;
  }
}
