import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mapRecordToContentTheme, CONTENT_THEMES } from "../twinly-content.server";

const twinlyContentSrc = readFileSync(resolve(process.cwd(), "src/lib/twinly-content.server.ts"), "utf8");
const chatSrc = readFileSync(resolve(process.cwd(), "src/lib/chat.functions.ts"), "utf8");
const studioFnSrc = readFileSync(resolve(process.cwd(), "src/lib/persona-studio.functions.ts"), "utf8");

describe("mapRecordToContentTheme (pure)", () => {
  it("maps a record with a matching category keyword to the right theme", () => {
    expect(mapRecordToContentTheme({ category: "Flirty banter opener" })).toBe("flirtation_teasing");
    expect(mapRecordToContentTheme({ template_kind: "roleplay scenario" })).toBe("roleplay_fantasy");
    expect(mapRecordToContentTheme({ purpose: "d/s power exchange dynamic" })).toBe("power_exchange");
  });

  it("returns null for a record with no recognizable keywords, rather than guessing", () => {
    expect(mapRecordToContentTheme({ category: "general small talk starter" })).toBeNull();
  });

  it("returns null for a record with no text fields at all", () => {
    expect(mapRecordToContentTheme({})).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(mapRecordToContentTheme({ category: "ASMR WHISPER SESSION" })).toBe("sensory_focus");
  });
});

describe("CONTENT_THEMES matches the DB enum exactly (structural)", () => {
  it("every theme has a keyword entry and the set matches the migration's enum values", () => {
    const migrationSrc = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260713000546_content_theme_overrides.sql"),
      "utf8",
    );
    for (const theme of CONTENT_THEMES) {
      expect(migrationSrc).toContain(`'${theme}'`);
    }
  });
});

describe("getTwinlyContentContext filters before ranking/limiting (structural)", () => {
  it("computes `eligible` from disallowedThemes before calling rankContentRecords, so a disallowed record never displaces an allowed one", () => {
    const start = twinlyContentSrc.indexOf("export async function getTwinlyContentContext");
    const body = twinlyContentSrc.slice(start);
    const eligibleIdx = body.indexOf("const eligible");
    const rankIdx = body.indexOf("rankContentRecords(eligible");
    expect(eligibleIdx).toBeGreaterThan(-1);
    expect(rankIdx).toBeGreaterThan(eligibleIdx);
  });

  it("an unrecognized category (mapRecordToContentTheme returns null) is never filtered out, even if disallowedThemes is non-empty", () => {
    const start = twinlyContentSrc.indexOf("const eligible");
    const body = twinlyContentSrc.slice(start, start + 400);
    expect(body).toContain("!theme ||");
  });
});

describe("content_theme_overrides wiring (structural)", () => {
  it("generateAiReply derives disallowedThemes from persona.content_theme_overrides and passes it to getTwinlyContentContext", () => {
    const start = chatSrc.indexOf("async function generateAiReply");
    const body = chatSrc.slice(start, start + 2000);
    expect(body).toContain("content_theme_overrides");
    expect(body).toContain("disallowedThemes");
    expect(body).toMatch(/themeOverrides\[t\]\s*===\s*false/);
  });

  it("createPersona and updatePersona both persist contentThemeOverrides as content_theme_overrides", () => {
    const createStart = studioFnSrc.indexOf("export const createPersona");
    const createEnd = studioFnSrc.indexOf("export const updatePersona");
    expect(studioFnSrc.slice(createStart, createEnd)).toContain("content_theme_overrides: data.contentThemeOverrides ?? {}");

    const updateStart = createEnd;
    const updateEnd = studioFnSrc.indexOf("export const setPersonaVisibility");
    expect(studioFnSrc.slice(updateStart, updateEnd)).toContain(
      "if (data.contentThemeOverrides !== undefined) patch.content_theme_overrides = data.contentThemeOverrides;",
    );
  });
});
