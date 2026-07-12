import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REAL_ME_QUESTIONNAIRE,
  computeOverallCompletionPercentage,
  computeSectionCompletionPercentage,
  computeSectionStatus,
  effectiveQuestions,
} from "../real-me-questionnaire-schema";
import { shouldStartNewVersion } from "../real-me.functions";

const section3 = REAL_ME_QUESTIONNAIRE.find((s) => s.id === "3")!; // has 3.5 -> 3.5b conditional
const section5 = REAL_ME_QUESTIONNAIRE.find((s) => s.id === "5")!; // has 5.2 -> 5.2b conditional

describe("effectiveQuestions (conditional rendering)", () => {
  it("excludes a conditional follow-up when its trigger answer is false", () => {
    const qs = effectiveQuestions(section3, { "3.5": false });
    expect(qs.some((q) => q.id === "3.5b")).toBe(false);
  });

  it("excludes a conditional follow-up when the trigger hasn't been answered at all", () => {
    const qs = effectiveQuestions(section3, {});
    expect(qs.some((q) => q.id === "3.5b")).toBe(false);
  });

  it("includes a conditional follow-up once its trigger answer is true", () => {
    const qs = effectiveQuestions(section3, { "3.5": true });
    expect(qs.some((q) => q.id === "3.5b")).toBe(true);
  });

  it("applies independently across different conditional pairs in different sections", () => {
    expect(effectiveQuestions(section5, { "5.2": true }).some((q) => q.id === "5.2b")).toBe(true);
    expect(effectiveQuestions(section5, { "5.2": false }).some((q) => q.id === "5.2b")).toBe(false);
  });
});

describe("progress calculation across partial completion states", () => {
  it("a section with no answers at all is not_started at 0%", () => {
    expect(computeSectionStatus(section3, {})).toBe("not_started");
    expect(computeSectionCompletionPercentage(section3, {})).toBe(0);
  });

  it("a section with some but not all required answers is in_progress", () => {
    const answers = { "3.1": ["Music"], "3.2": "Movies, food, travel" };
    expect(computeSectionStatus(section3, answers)).toBe("in_progress");
    const pct = computeSectionCompletionPercentage(section3, answers);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(100);
  });

  it("conditional follow-ups don't count against completion when their trigger is 'no'", () => {
    // Answering everything in section 3 EXCEPT 3.5b, with 3.5 = false, should
    // still reach 100% since 3.5b isn't an effective (required) question here.
    const answers: Record<string, unknown> = {
      "3.1": ["Music"], "3.2": "x", "3.3": "x", "3.4": "x", "3.5": false,
      "3.6": ["Pop"], "3.6b": "x", "3.7": ["Movies"], "3.7b": "x",
    };
    expect(computeSectionStatus(section3, answers)).toBe("complete");
    expect(computeSectionCompletionPercentage(section3, answers)).toBe(100);
  });

  it("a fully answered section (including its now-relevant conditional) is complete at 100%", () => {
    const answers: Record<string, unknown> = {
      "3.1": ["Music"], "3.2": "x", "3.3": "x", "3.4": "x", "3.5": true, "3.5b": "Lakers",
      "3.6": ["Pop"], "3.6b": "x", "3.7": ["Movies"], "3.7b": "x",
    };
    expect(computeSectionStatus(section3, answers)).toBe("complete");
    expect(computeSectionCompletionPercentage(section3, answers)).toBe(100);
  });

  it("the 'anything else' field in every section is optional and never blocks 100% completion", () => {
    const anythingElseId = section3.questions.find((q) => q.optional)!.id;
    const answers: Record<string, unknown> = {
      "3.1": ["Music"], "3.2": "x", "3.3": "x", "3.4": "x", "3.5": false,
      "3.6": ["Pop"], "3.6b": "x", "3.7": ["Movies"], "3.7b": "x",
    };
    expect(answers[anythingElseId]).toBeUndefined();
    expect(computeSectionCompletionPercentage(section3, answers)).toBe(100);
  });

  it("overall completion averages across all sections' required questions, not just one", () => {
    const noAnswers = computeOverallCompletionPercentage(REAL_ME_QUESTIONNAIRE, {});
    expect(noAnswers).toBe(0);
    // Answering just one section fully still leaves overall well under 100%.
    const oneSectionAnswers: Record<string, unknown> = {
      "3.1": ["Music"], "3.2": "x", "3.3": "x", "3.4": "x", "3.5": false,
      "3.6": ["Pop"], "3.6b": "x", "3.7": ["Movies"], "3.7b": "x",
    };
    const partial = computeOverallCompletionPercentage(REAL_ME_QUESTIONNAIRE, oneSectionAnswers);
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(100);
  });
});

describe("shouldStartNewVersion (session-based versioning granularity)", () => {
  it("does not start a new version immediately after the current one was created", () => {
    expect(shouldStartNewVersion(new Date().toISOString(), Date.now())).toBe(false);
  });

  it("does not start a new version a few minutes into the same session", () => {
    const createdAt = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(shouldStartNewVersion(createdAt, Date.now())).toBe(false);
  });

  it("starts a new version once the session gap has passed", () => {
    const createdAt = new Date(Date.now() - 25 * 60_000).toISOString();
    expect(shouldStartNewVersion(createdAt, Date.now())).toBe(true);
  });
});

describe("autosave persists per-question without requiring section completion (structural)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/lib/real-me.functions.ts"), "utf8");

  it("saveRealMeAnswer updates a single question's value with no completeness gate before writing", () => {
    const start = src.indexOf("export const saveRealMeAnswer");
    const nextExport = src.indexOf("\nexport const", start + 1);
    const body = src.slice(start, nextExport);
    expect(body).toContain("[data.questionId]: data.value");
    expect(body).not.toMatch(/if\s*\(.*completion/i);
  });
});

describe("persona references stay pinned until explicit resync (structural)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/lib/real-me.functions.ts"), "utf8");

  it("only resyncPersonaToRealMe writes to persona_real_me_references — no automatic write elsewhere", () => {
    const writeSites = [...src.matchAll(/\.from\("persona_real_me_references"\)\s*\.(upsert|insert|update)\(/g)];
    expect(writeSites.length).toBe(1);
    const idx = src.indexOf(writeSites[0][0]);
    const containingFn = src.lastIndexOf("export const", idx);
    expect(src.slice(containingFn, containingFn + 60)).toContain("resyncPersonaToRealMe");
  });

  it("getOrCreateCurrentVersion (called on every page load/autosave) never touches persona_real_me_references", () => {
    const start = src.indexOf("async function getOrCreateCurrentVersion");
    const end = src.indexOf("\nexport const getRealMeProfile");
    const body = src.slice(start, end);
    expect(body).not.toContain("persona_real_me_references");
  });
});

describe("new persona creation pre-fills defaults from the latest Real Me version (structural)", () => {
  it("createTierPersona reads real_me_profiles/4.6/7.4 and writes them into content_framework_choices", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/persona-onboarding.functions.ts"), "utf8");
    const start = src.indexOf("export const createTierPersona");
    const nextExport = src.indexOf("\nexport const", start + 1);
    const body = src.slice(start, nextExport);
    expect(body).toContain('.from("real_me_profiles")');
    expect(body).toContain('responses["4.6"]');
    expect(body).toContain('responses["7.4"]');
    expect(body).toContain("avoidTopics");
    expect(body).toContain("generalDiscomfortAreas");
  });
});
