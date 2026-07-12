type ContentPersona = "nice" | "naughty" | "wicked";

type LibraryRecord = Record<string, unknown>;

type LibraryResponse = {
  data?: LibraryRecord[];
};

const CACHE_TTL_MS = 5 * 60_000;
const MAX_CONTEXT_ITEMS = 6;
const cache = new Map<string, { expiresAt: number; records: LibraryRecord[] }>();

export function contentPersonaForCeiling(
  ceiling: "sfw" | "suggestive" | "explicit",
): ContentPersona {
  if (ceiling === "explicit") return "wicked";
  if (ceiling === "suggestive") return "naughty";
  return "nice";
}

function words(value: string): string[] {
  return [...new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
}

function searchableText(record: LibraryRecord): string {
  return [
    record.title,
    record.name,
    record.base_text,
    record.description,
    record.purpose,
    record.category,
    record.template_kind,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

export function rankContentRecords(
  records: LibraryRecord[],
  query: string,
  limit = MAX_CONTEXT_ITEMS,
): LibraryRecord[] {
  const queryWords = words(query);
  return records
    .map((record, index) => {
      const haystackWords = new Set(words(searchableText(record)));
      const score = queryWords.reduce(
        (total, word) => total + (haystackWords.has(word) ? 1 : 0),
        0,
      );
      return { record, score, index };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ record }) => record);
}

function contentHeaders(apiKey: string, persona: ContentPersona): HeadersInit {
  return {
    "x-agent-key": apiKey,
    ...(persona === "wicked"
      ? {
          "x-twinly-explicit-content": "allowed",
          "x-twinly-adult-audience": "21+",
        }
      : {}),
  };
}

async function fetchCollection(
  baseUrl: string,
  apiKey: string,
  path: string,
  persona: ContentPersona,
): Promise<LibraryRecord[]> {
  const cacheKey = `${baseUrl}:${path}:${persona}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.records;

  const url = new URL(`/api/public/agent/${path}`, baseUrl);
  url.searchParams.set("limit", "200");
  if (path === "templates" || path === "frameworks") {
    url.searchParams.set("persona", persona);
  }

  const response = await fetch(url, {
    headers: contentHeaders(apiKey, persona),
    signal: AbortSignal.timeout(2_500),
  });
  if (!response.ok) {
    throw new Error(`Twinly Content ${path} request failed (${response.status})`);
  }

  const body = (await response.json()) as LibraryResponse;
  const records = Array.isArray(body.data) ? body.data : [];
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, records });
  return records;
}

// Per-persona content-category allow/disallow taxonomy (see the
// content_theme_overrides migration). Generalized from this platform's own
// category primitives (persona tiers, digital_twin_consent's allowed/
// forbidden-use presets) — NOT derived from the external Twinly Content
// service's real category vocabulary, since that service was never actually
// connected in this environment (no API key, MCP connector, or docs
// available — see persona-onboarding-generation.server.ts). The keyword
// lists below are a best-effort heuristic pending real sample records.
export const CONTENT_THEMES = [
  "romantic_affection",
  "flirtation_teasing",
  "roleplay_fantasy",
  "power_exchange",
  "fetish_general",
  "group_dynamics",
  "exhibitionism_voyeurism",
  "sensory_focus",
] as const;
export type ContentTheme = (typeof CONTENT_THEMES)[number];

const THEME_KEYWORDS: Record<ContentTheme, string[]> = {
  romantic_affection: ["romance", "romantic", "affection", "intimacy", "cuddle", "tender"],
  flirtation_teasing: ["flirt", "tease", "playful", "banter", "suggestive"],
  roleplay_fantasy: ["roleplay", "role-play", "fantasy", "scenario", "character play"],
  power_exchange: ["dominant", "submissive", "domme", "dom/sub", "power exchange", "obedience", "bdsm"],
  fetish_general: ["fetish", "kink"],
  group_dynamics: ["group", "threesome", "multiple partners", "orgy"],
  exhibitionism_voyeurism: ["exhibition", "voyeur", "public play", "watching"],
  sensory_focus: ["asmr", "whisper", "sensory", "sensation"],
};

/**
 * Pure — maps a Twinly Content record's loosely-typed category/template_kind/
 * purpose text into the fixed content-theme taxonomy via keyword match.
 * Returns null when nothing matches (the record is left unfiltered, not
 * blocked, so an unrecognized category never gets silently dropped).
 */
export function mapRecordToContentTheme(record: LibraryRecord): ContentTheme | null {
  const haystack = [record.category, record.template_kind, record.purpose]
    .filter((v): v is string => typeof v === "string")
    .join(" ")
    .toLowerCase();
  if (!haystack) return null;
  for (const theme of CONTENT_THEMES) {
    if (THEME_KEYWORDS[theme].some((kw) => haystack.includes(kw))) return theme;
  }
  return null;
}

function summarize(record: LibraryRecord): string {
  const label = String(record.title ?? record.name ?? record.template_kind ?? "Resource");
  const detail = String(
    record.base_text ?? record.description ?? record.purpose ?? record.category ?? "",
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  return `- ${label}${detail ? `: ${detail}` : ""}`;
}

export async function getTwinlyContentContext(input: {
  query: string;
  ceiling: "sfw" | "suggestive" | "explicit";
  disallowedThemes?: ReadonlySet<ContentTheme>;
}): Promise<string | null> {
  const baseUrl = process.env.TWINLY_CONTENT_API_URL;
  const apiKey = process.env.TWINLY_CONTENT_AGENT_API_KEY;
  if (!baseUrl || !apiKey) return null;

  const persona = contentPersonaForCeiling(input.ceiling);
  const collections = await Promise.allSettled(
    ["templates", "frameworks", "themes", "resources"].map((path) =>
      fetchCollection(baseUrl, apiKey, path, persona),
    ),
  );
  const records = collections.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  // Filter before ranking/limiting so a disallowed record never displaces an
  // allowed one from the final top-N context slots.
  const eligible = input.disallowedThemes?.size
    ? records.filter((r) => {
        const theme = mapRecordToContentTheme(r);
        return !theme || !input.disallowedThemes!.has(theme);
      })
    : records;
  const ranked = rankContentRecords(eligible, input.query);
  if (ranked.length === 0) return null;

  return [`Twinly Content reference (${persona} edition):`, ...ranked.map(summarize)].join("\n");
}
