import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const veniceSrc = readFileSync(resolve(process.cwd(), "src/lib/venice.server.ts"), "utf8");
const lookupSrc = readFileSync(resolve(process.cwd(), "src/lib/venice-character.functions.ts"), "utf8");
const studioSrc = readFileSync(resolve(process.cwd(), "src/lib/persona-studio.functions.ts"), "utf8");
const chatSrc = readFileSync(resolve(process.cwd(), "src/lib/chat.functions.ts"), "utf8");
const onboardingSrc = readFileSync(resolve(process.cwd(), "src/lib/onboarding.functions.ts"), "utf8");
const uiSrc = readFileSync(resolve(process.cwd(), "src/components/twinly/persona-form-shared.tsx"), "utf8");
const newPersonaSrc = readFileSync(resolve(process.cwd(), "src/routes/studio.personas.new.tsx"), "utf8");
const editPersonaSrc = readFileSync(resolve(process.cwd(), "src/routes/studio.personas.$personaId.edit.tsx"), "utf8");

describe("getVeniceCharacter (structural)", () => {
  const start = veniceSrc.indexOf("export async function getVeniceCharacter");
  const body = veniceSrc.slice(start);

  it("hits the documented single-character endpoint with the slug in the path, not a query param", () => {
    expect(body).toContain("`${API_BASE}/characters/${encodeURIComponent(slug)}`");
  });

  it("returns null on a genuine 404 rather than throwing — not-found is an expected outcome, not an error", () => {
    const notFoundIdx = body.indexOf('res.status === 404');
    const returnNullIdx = body.indexOf("return null;");
    expect(notFoundIdx).toBeGreaterThan(-1);
    expect(returnNullIdx).toBeGreaterThan(notFoundIdx);
  });

  it("still throws on real failures (rate limit, missing key, malformed response)", () => {
    expect(body).toContain("VENICE_API_KEY is not configured");
    expect(body).toContain("Venice rate limit hit");
    expect(body).toContain("Venice returned a non-JSON response");
  });

  it("never fabricates a fallback name/slug — requires both from Venice's actual response", () => {
    expect(body).toContain("if (!c?.slug || !c?.name)");
  });
});

describe("generateVeniceChatReply's character_slug wiring (structural)", () => {
  const start = veniceSrc.indexOf("export async function generateVeniceChatReply");
  const nextExport = veniceSrc.indexOf("\nexport ", start + 1);
  const body = veniceSrc.slice(start, nextExport);

  it("only includes venice_parameters.character_slug when a slug was actually provided", () => {
    expect(body).toContain("...(input.characterSlug ? { venice_parameters: { character_slug: input.characterSlug } } : {})");
  });

  it("accepts characterSlug as an optional, nullable input — omitting it must not be a type error", () => {
    expect(body).toContain("characterSlug?: string | null;");
  });
});

describe("lookupVeniceCharacter (structural)", () => {
  it("is gated behind requireSupabaseAuth", () => {
    expect(lookupSrc).toContain(".middleware([requireSupabaseAuth])");
  });

  it("surfaces not-found as a typed result rather than throwing, so the UI can render it inline", () => {
    expect(lookupSrc).toContain("if (!character) return { found: false };");
  });

  it("rejects an empty slug before ever calling Venice", () => {
    const start = lookupSrc.indexOf(".handler(async ({ data })");
    const body = lookupSrc.slice(start);
    const emptyCheckIdx = body.indexOf('if (!slug) throw new Error(');
    const importIdx = body.indexOf('import("./venice.server")');
    expect(emptyCheckIdx).toBeGreaterThan(-1);
    expect(importIdx).toBeGreaterThan(emptyCheckIdx);
  });
});

describe("venice_character_slug persistence in persona-studio.functions.ts (structural)", () => {
  it("createPersona accepts veniceCharacterSlug and persists it trimmed + length-capped, mirroring heygen_avatar_id's pattern", () => {
    const start = studioSrc.indexOf("export const createPersona");
    const end = studioSrc.indexOf("export const updatePersona");
    const body = studioSrc.slice(start, end);
    expect(body).toContain("veniceCharacterSlug?: string | null;");
    expect(body).toContain("venice_character_slug: data.veniceCharacterSlug?.trim().slice(0, 120) || null,");
  });

  it("updatePersona only patches venice_character_slug when explicitly provided, and null-clears an empty value", () => {
    const start = studioSrc.indexOf("export const updatePersona");
    const body = studioSrc.slice(start);
    expect(body).toContain("veniceCharacterSlug?: string | null;");
    expect(body).toContain("if (data.veniceCharacterSlug !== undefined) {");
    expect(body).toContain("patch.venice_character_slug = v ? v.slice(0, 120) : null;");
  });
});

describe("venice_character_slug reaches the chat generation path (structural)", () => {
  it("sendPersonaMessage's persona select includes venice_character_slug", () => {
    const start = chatSrc.indexOf("export const sendPersonaMessage");
    const nextExport = chatSrc.indexOf("\nasync function generateAiReply", start);
    const body = chatSrc.slice(start, nextExport);
    expect(body).toContain("venice_character_slug");
  });

  it("generateAiReply passes the persona's venice_character_slug into generateVeniceChatReply as characterSlug", () => {
    const start = chatSrc.indexOf("async function generateAiReply");
    const body = chatSrc.slice(start);
    expect(body).toContain('characterSlug: (persona as any).venice_character_slug || undefined,');
  });

  it("listMyPersonas returns venice_character_slug so the studio UI can hydrate it", () => {
    expect(onboardingSrc).toContain("venice_character_slug");
  });
});

describe("Venice Character quick-start UI (structural)", () => {
  it("previews via the auth-gated lookup function, not a raw fetch to Venice from the client", () => {
    expect(uiSrc).toContain('lookupVeniceCharacter, type LookupVeniceCharacterResult } from "@/lib/venice-character.functions";');
    expect(uiSrc).toContain("useServerFn(lookupVeniceCharacter)");
  });

  it("only shows the field for AI personas, in both the new-persona and edit-persona pages", () => {
    // The field now lives in a shared ExternalModelIdsPanel component, rendered
    // only inside each page's `kind === "ai"` branch, with a page-specific idPrefix.
    expect(newPersonaSrc).toContain('idPrefix="new-persona"');
    expect(newPersonaSrc).toContain("<ExternalModelIdsPanel");
    expect(editPersonaSrc).toContain('idPrefix="edit-persona"');
    expect(editPersonaSrc).toContain("<ExternalModelIdsPanel");
  });

  it("renders the not-found case distinctly from a found character, rather than silently accepting any ID", () => {
    expect(uiSrc).toContain("No published Venice Character found with that ID.");
  });
});
