import { describe, expect, it } from "vitest";
import { buildJourneyBriefs, DEFAULT_JOURNEY_ANSWERS } from "@/lib/supporter-journey";

describe("supporter journey briefs", () => {
  it("removes offers when the supporter selects never", () => {
    const result = buildJourneyBriefs({
      ...DEFAULT_JOURNEY_ANSWERS,
      displayName: "Sam",
      offerFrequency: "never",
      interests: ["Storytelling"],
      formats: ["Short videos"],
    });
    expect(result.tailoredContentBrief.suggestedJourneyFlow).not.toContain(
      "optional_recommendation",
    );
    expect(result.tailoredContentBrief.offerGuidance).toBe("Do not recommend paid content.");
  });

  it("maps ask-first teasing separately from consent", () => {
    const result = buildJourneyBriefs({ ...DEFAULT_JOURNEY_ANSWERS, teasingConsent: "ask_first" });
    expect(result.chatExperienceBrief.boundaries.allowed).toEqual([]);
    expect(result.chatExperienceBrief.boundaries.askFirst).toEqual([
      "non-explicit_playful_teasing",
    ]);
  });

  it("adds mature safety constraints without creating explicit content", () => {
    const result = buildJourneyBriefs({
      ...DEFAULT_JOURNEY_ANSWERS,
      persona: "wicked",
      adultConfirmed: true,
    });
    expect(result.chatExperienceBrief.safetyReminders.join(" ")).toContain("strictly non-explicit");
    expect(result.tailoredContentBrief.recommendedTone).toContain("non-explicit");
  });

  it("does not retain a one-time profile", () => {
    const result = buildJourneyBriefs({
      ...DEFAULT_JOURNEY_ANSWERS,
      retentionDays: 365,
      futurePersonalisation: true,
    });
    expect(result.chatExperienceBrief.privacy).toEqual({
      savePreferences: false,
      retentionDays: 0,
      allowFuturePersonalisation: false,
    });
  });
});
