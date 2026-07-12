import { describe, expect, it } from "vitest";
import {
  buildRuntimeContext,
  buildVaultQuery,
  decryptQuestionnaire,
  encryptQuestionnaire,
  extractPrivacySafeProfile,
  processIntake,
  validateRuntimeMessage,
  type Intake,
} from "../rsp-bridge.server";
import { DEFAULT_JOURNEY_ANSWERS } from "../supporter-journey";
const key = Buffer.alloc(32, 7).toString("base64");
type Input = Intake;
const sample: Input = {
  schemaVersion: "2.0",
  questionnaire: {
    ...DEFAULT_JOURNEY_ANSWERS,
    adultConfirmed: true,
    respectfulUse: true,
    personaliseAllowed: true,
    persona: "nice",
    relationshipStage: "returning_supporter",
    messageDetail: 55,
    playfulness: 60,
    directness: 25,
    humour: 50,
    environment: "welcoming_relaxed",
    atmosphere: "realistic",
    immersion: 55,
    interests: ["behind_the_scenes", "content_discovery"],
    formats: ["chat", "short_video"],
    teasingConsent: "ask_first",
    offerFrequency: "never",
  },
  consentReceipt: {
    consentVersion: "1",
    acceptedAt: "2026-07-13T00:00:00Z",
    adultConfirmed: true,
    respectfulUseAccepted: true,
    personalisationAllowed: true,
    preferencesMayBeSaved: false,
  },
  sessionContext: {
    questionnaireId: "00000000-0000-4000-8000-000000000001",
    questionnaireVersion: "1",
    source: "supporter_onboarding",
    locale: "en-AU",
  },
};
describe("RSP questionnaire-to-vault bridge", () => {
  it("encrypts with envelope keys and binds associated data", () => {
    const envelope = encryptQuestionnaire(sample.questionnaire, {
      creatorId: "creator-a",
      submissionId: "submission-a",
      schemaVersion: "2.0",
      retentionExpiry: "2026-07-13T00:00:00Z",
      keyVersion: "test",
      masterKey: key,
    });
    expect(envelope.ciphertext).not.toContain("returning_supporter");
    expect(
      decryptQuestionnaire(envelope, {
        creatorId: "creator-a",
        submissionId: "submission-a",
        masterKey: key,
      }),
    ).toEqual(sample.questionnaire);
    expect(() =>
      decryptQuestionnaire(envelope, {
        creatorId: "creator-b",
        submissionId: "submission-a",
        masterKey: key,
      }),
    ).toThrow();
  });
  it("creates authoritative minimized outputs and suppresses offers", () => {
    const result = processIntake(sample, {
      creatorScope: "creator-scope-token",
      tier: "plus",
      submissionId: "submission-a",
      now: new Date("2026-07-13T00:00:00Z"),
    });
    expect(result.policy.offers.allowed).toBe(false);
    expect(result.query.journeyRequirements.optionalStages).not.toContain("journey.offer");
    expect(result.query.journeyRequirements.prohibitedStages).toContain("journey.offer");
    expect(JSON.stringify(result.profile)).not.toContain("displayName");
    expect(JSON.stringify(result)).not.toContain("excludedTopics");
    expect(result.profile.profileToken).toBeUndefined();
    expect(result.contentLibraryMatch.rankingWeights.stateAffinity).toBe(0.2);
    expect(JSON.stringify(result.contentLibraryMatch)).not.toContain("displayName");
  });
  it("inserts boundary calibration for ask-first teasing", () => {
    const result = processIntake(sample, { creatorScope: "creator", tier: "base" });
    expect(result.query.journeyRequirements.requiredStages).toContain(
      "journey.boundary_calibration",
    );
  });
  it("uses generic defaults when personalisation is disabled", () => {
    const changed = {
      ...sample,
      questionnaire: {
        ...sample.questionnaire,
        personaliseAllowed: false,
        persona: "wicked" as const,
        interests: ["rare_private_interest"],
      },
      consentReceipt: { ...sample.consentReceipt, personalisationAllowed: false },
    };
    const result = processIntake(changed, { creatorScope: "creator", tier: "base" });
    expect(result.profile.persona).toBe("real");
    expect(result.profile.interestTaxonomyIds).toEqual([]);
    expect(result.profile.formatIds).toEqual(["format.chat"]);
  });
  it("stops mature processing without adult confirmation", () => {
    const changed = {
      ...sample,
      questionnaire: { ...sample.questionnaire, persona: "wicked" as const, adultConfirmed: false },
      consentReceipt: { ...sample.consentReceipt, adultConfirmed: false },
    };
    expect(() => processIntake(changed, { creatorScope: "creator", tier: "base" })).toThrow(
      "ADULT_GATE_REQUIRED",
    );
  });
  it("validates runtime responses and provides a safe fallback", () => {
    const result = processIntake(sample, { creatorScope: "creator", tier: "base" });
    expect(validateRuntimeMessage("Buy this now", result.policy, "journey.interaction")).toEqual(
      expect.objectContaining({ valid: false, fallbackStage: "journey.safe_redirect" }),
    );
    const context = buildRuntimeContext(
      {
        persona: "nice",
        currentStage: "journey.interaction",
        approvedAsset: { purpose: "Ask a preference", template: "Which would you prefer?" },
        environment: { family: "welcoming_relaxed", immersion: "medium" },
        allowedNextStages: ["journey.recommendation"],
      },
      result.policy,
    );
    expect(context.hardRules.offersAllowedAtThisStage).toBe(false);
    expect(JSON.stringify(context)).not.toContain("questionnaire");
  });
});
