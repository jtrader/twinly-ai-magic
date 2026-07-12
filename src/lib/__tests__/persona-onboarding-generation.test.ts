import { describe, expect, it } from "vitest";
import {
  buildOnboardingPrompt,
  fallbackCopy,
  parseGeneratedCopy,
  type PersonaType,
  type QuestionnaireAnswers,
} from "../persona-onboarding-generation.server";

const sampleAnswers: QuestionnaireAnswers = {
  voicePersonality: { toneWords: ["confident", "playful"], pacing: "quick", humorStyle: "dry-witted" },
  boundariesPreferences: {
    topicsToAvoid: ["politics"],
    topicsToLeanInto: ["travel"],
    phrasesWanted: ["babe"],
    phrasesAvoided: ["honey"],
  },
  audienceFraming: { selfDescription: "an AI persona", relationshipToRealMe: "a separate character" },
  contentThemes: { subjectAreas: ["gym", "coffee"] },
};

const TIERS: PersonaType[] = ["real_me", "nice", "naughty", "wicked", "custom"];

describe("buildOnboardingPrompt", () => {
  it("includes the non-explicit hard rule regardless of tier, including Naughty/Wicked", () => {
    for (const tier of TIERS) {
      const { system } = buildOnboardingPrompt(tier, sampleAnswers, null);
      expect(system.toLowerCase()).toContain("never write explicit sexual content");
    }
  });

  it("gives each tier a distinct baseline description", () => {
    const baselines = TIERS.map((t) => buildOnboardingPrompt(t, sampleAnswers, null).system);
    const unique = new Set(baselines.map((s) => s.split("\n")[1]));
    expect(unique.size).toBe(TIERS.length);
  });

  it("Naughty and Wicked baselines are explicitly non-explicit, not just unmentioned", () => {
    const naughty = buildOnboardingPrompt("naughty", sampleAnswers, null).system;
    const wicked = buildOnboardingPrompt("wicked", sampleAnswers, null).system;
    expect(naughty.toLowerCase()).toContain("never explicit");
    expect(wicked.toLowerCase()).toContain("non-explicit");
  });

  it("folds the questionnaire answers into the user prompt", () => {
    const { user } = buildOnboardingPrompt("nice", sampleAnswers, null);
    expect(user).toContain("confident, playful");
    expect(user).toContain("quick");
    expect(user).toContain("politics");
    expect(user).toContain("gym, coffee");
  });

  it("includes content-connection context only when provided, and never hard-depends on it", () => {
    const withContext = buildOnboardingPrompt("nice", sampleAnswers, { items: [{ title: "Morning routine", tags: ["lifestyle"] }] });
    expect(withContext.user).toContain("Morning routine");

    const withoutContext = buildOnboardingPrompt("nice", sampleAnswers, null);
    expect(withoutContext.user).toContain("No published-content reference available");
    expect(withoutContext.user).not.toContain("Morning routine");
  });
});

describe("parseGeneratedCopy", () => {
  it("parses clean JSON directly", () => {
    const raw = JSON.stringify({ toneGuidelines: "Warm and playful.", openerTemplates: ["Hey there!", "How's your day going?"] });
    const result = parseGeneratedCopy(raw, sampleAnswers);
    expect(result.toneGuidelines).toBe("Warm and playful.");
    expect(result.openerTemplates).toEqual(["Hey there!", "How's your day going?"]);
  });

  it("extracts JSON embedded in surrounding text (e.g. markdown fences)", () => {
    const raw = "```json\n" + JSON.stringify({ toneGuidelines: "Bold and confident.", openerTemplates: ["Hi!"] }) + "\n```";
    const result = parseGeneratedCopy(raw, sampleAnswers);
    expect(result.toneGuidelines).toBe("Bold and confident.");
    expect(result.openerTemplates).toEqual(["Hi!"]);
  });

  it("caps opener templates at 10", () => {
    const openers = Array.from({ length: 15 }, (_, i) => `Opener ${i}`);
    const raw = JSON.stringify({ toneGuidelines: "Something.", openerTemplates: openers });
    const result = parseGeneratedCopy(raw, sampleAnswers);
    expect(result.openerTemplates.length).toBe(10);
  });

  it("falls back safely on garbage input instead of throwing", () => {
    expect(() => parseGeneratedCopy("not json at all, sorry", sampleAnswers)).not.toThrow();
    const result = parseGeneratedCopy("not json at all, sorry", sampleAnswers);
    expect(result.toneGuidelines.length).toBeGreaterThan(0);
    expect(result.openerTemplates.length).toBeGreaterThan(0);
  });

  it("falls back when JSON is well-formed but missing required fields", () => {
    const raw = JSON.stringify({ somethingElse: true });
    const result = parseGeneratedCopy(raw, sampleAnswers);
    expect(result.toneGuidelines.length).toBeGreaterThan(0);
    expect(result.openerTemplates.length).toBeGreaterThan(0);
  });
});

describe("fallbackCopy", () => {
  it("always returns non-empty tone guidelines and at least one opener, even with no answers at all", () => {
    const result = fallbackCopy({});
    expect(result.toneGuidelines.length).toBeGreaterThan(0);
    expect(result.openerTemplates.length).toBeGreaterThan(0);
  });

  it("reflects the creator's tone words when given", () => {
    const result = fallbackCopy({ voicePersonality: { toneWords: ["dry-witted", "warm"] } });
    expect(result.toneGuidelines).toContain("dry-witted");
    expect(result.toneGuidelines).toContain("warm");
  });
});
