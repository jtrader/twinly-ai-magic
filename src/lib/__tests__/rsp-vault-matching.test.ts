import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPolicy,
  buildVaultQuery,
  extractPrivacySafeProfile,
  rankVaultAssets,
  type VaultAssetCandidate,
} from "../rsp-bridge.server";
import { DEFAULT_JOURNEY_ANSWERS } from "../supporter-journey";

const bridgeFnSrc = readFileSync(resolve(process.cwd(), "src/lib/rsp-bridge.functions.ts"), "utf8");

const consentReceipt = {
  consentVersion: "1",
  acceptedAt: "2026-07-13T00:00:00Z",
  adultConfirmed: true,
  respectfulUseAccepted: true,
  personalisationAllowed: true,
  preferencesMayBeSaved: false,
};

describe("buildPolicy exclusion wiring (regression: previously always empty)", () => {
  it("populates prohibitedContentTagIds from the supporter's stated excludedTopics", () => {
    const answers = { ...DEFAULT_JOURNEY_ANSWERS, respectfulUse: true, excludedTopics: "Feet, Roleplay" };
    const policy = buildPolicy(answers, consentReceipt, {
      creatorScope: "creator-a",
      tier: "base",
      submissionId: "s1",
      now: new Date("2026-07-13T00:00:00Z"),
    });
    expect(policy.exclusions.prohibitedContentTagIds).toEqual(["feet", "roleplay"]);
    expect(policy.exclusions.prohibitedThemeIds.length).toBeGreaterThan(0);
  });

  it("is empty when no topics were excluded", () => {
    const answers = { ...DEFAULT_JOURNEY_ANSWERS, respectfulUse: true, excludedTopics: "" };
    const policy = buildPolicy(answers, consentReceipt, {
      creatorScope: "creator-a",
      tier: "base",
      submissionId: "s1",
      now: new Date("2026-07-13T00:00:00Z"),
    });
    expect(policy.exclusions.prohibitedContentTagIds).toEqual([]);
  });
});

function buildSampleQuery(overrides: Partial<Parameters<typeof buildPolicy>[0]> = {}) {
  const answers = {
    ...DEFAULT_JOURNEY_ANSWERS,
    respectfulUse: true,
    personaliseAllowed: true,
    interests: ["Travel", "Fitness"],
    formats: ["Photos", "Short videos"],
    excludedTopics: "unwanted_theme",
    ...overrides,
  };
  const policy = buildPolicy(answers, consentReceipt, {
    creatorScope: "creator-a",
    tier: "base",
    submissionId: "s1",
    now: new Date("2026-07-13T00:00:00Z"),
  });
  const profile = extractPrivacySafeProfile(answers, policy);
  return buildVaultQuery(policy, profile, {
    stateVersion: "1.0",
    states: { fire: 0.2, air: 0.2, earth: 0.2, water: 0.2, ether: 0.2 },
    quality: { intensity: 0.3, ambiguity: 0.5, consistency: 0.5, coverage: 0.5, confidence: 0.7 },
    clusterSummaries: {} as any,
  }, { requestId: "req-1" });
}

function asset(overrides: Partial<VaultAssetCandidate>): VaultAssetCandidate {
  return {
    id: "asset-1",
    title: "Untitled",
    assetType: "image",
    tags: [],
    permissionType: "included",
    createdAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("rankVaultAssets (pure)", () => {
  const query = buildSampleQuery();

  it("excludes an asset on the prohibited-asset-id hard filter", () => {
    const q = buildSampleQuery({});
    (q.hardFilters.prohibitedAssetIds as string[]).push("blocked-1");
    const result = rankVaultAssets([asset({ id: "blocked-1" })], q);
    expect(result).toHaveLength(0);
  });

  it("excludes an asset whose tag matches a prohibited content tag", () => {
    const result = rankVaultAssets(
      [asset({ id: "a1", tags: ["unwanted_theme"] })],
      query,
    );
    expect(result).toHaveLength(0);
  });

  it("excludes restricted-permission assets outright", () => {
    const result = rankVaultAssets([asset({ id: "a1", permissionType: "restricted" })], query);
    expect(result).toHaveLength(0);
  });

  it("excludes ppv assets when the supporter said offers are never allowed", () => {
    const noOffersQuery = buildSampleQuery({ offerFrequency: "never" });
    const result = rankVaultAssets([asset({ id: "a1", permissionType: "ppv" })], noOffersQuery);
    expect(result).toHaveLength(0);
  });

  it("includes ppv assets when offers are allowed", () => {
    const offerQuery = buildSampleQuery({ offerFrequency: "occasionally" });
    const result = rankVaultAssets([asset({ id: "a1", permissionType: "ppv" })], offerQuery);
    expect(result).toHaveLength(1);
  });

  it("scores a theme+format matching asset higher than a non-matching one", () => {
    const matching = asset({ id: "match", tags: ["travel"], assetType: "image" });
    const nonMatching = asset({ id: "no-match", tags: ["unrelated"], assetType: "audio" });
    const result = rankVaultAssets([nonMatching, matching], query);
    expect(result[0].assetId).toBe("match");
    expect(result[0].matchScore).toBeGreaterThan(result.find((r) => r.assetId === "no-match")!.matchScore);
  });

  it("caps results at the given limit", () => {
    const many = Array.from({ length: 10 }, (_, i) => asset({ id: `a${i}`, tags: ["travel"] }));
    const result = rankVaultAssets(many, query, new Date("2026-07-13T00:00:00Z"), 3);
    expect(result).toHaveLength(3);
  });

  it("never returns a score outside [0, 1]", () => {
    const result = rankVaultAssets(
      [asset({ id: "a1", tags: ["travel", "fitness"], assetType: "image", createdAt: "2026-07-13T00:00:00Z" })],
      query,
    );
    expect(result[0].matchScore).toBeGreaterThanOrEqual(0);
    expect(result[0].matchScore).toBeLessThanOrEqual(1);
  });
});

describe("vault matching wiring in rsp-bridge.functions.ts (structural)", () => {
  it("resolves the target persona by persona_type, mapping 'real' to 'real_me'", () => {
    expect(bridgeFnSrc).toContain('personaTemplate === "real" ? "real_me" : personaTemplate');
    expect(bridgeFnSrc).toContain('.eq("persona_type", personaType)');
  });

  it("fetches assets via the same permission-resolution shape as fan-feed.functions.ts (direct grant OR shared_across_personas)", () => {
    expect(bridgeFnSrc).toContain('.from("persona_content_permissions")');
    expect(bridgeFnSrc).toContain("shared_across_personas");
  });

  it("only considers approved, non-removed, non-restricted, non-private assets", () => {
    const start = bridgeFnSrc.indexOf("async function matchVaultAssets");
    const body = bridgeFnSrc.slice(start);
    expect(body).toContain('.eq("approval_status", "approved")');
    expect(body).toContain('.neq("moderation_status", "removed")');
    expect(body).toContain('.neq("visibility", "private")');
  });

  it("vault matching is wrapped so it can never fail the questionnaire submission itself", () => {
    const start = bridgeFnSrc.indexOf("// Vault matching is enrichment");
    const tryIdx = bridgeFnSrc.indexOf("try {", start);
    const catchIdx = bridgeFnSrc.indexOf("} catch (e) {", start);
    expect(start).toBeGreaterThan(-1);
    expect(tryIdx).toBeGreaterThan(start);
    expect(catchIdx).toBeGreaterThan(tryIdx);
  });

  it("requiresCreatorReview is never overridden when real matches are populated", () => {
    expect(bridgeFnSrc).not.toContain("requiresCreatorReview: false");
  });

  it("persists real curated sequences, steps, and generated briefs — the previously-unused tables", () => {
    expect(bridgeFnSrc).toContain('.from("rsp_curated_sequences")');
    expect(bridgeFnSrc).toContain('.from("rsp_curated_sequence_steps")');
    expect(bridgeFnSrc).toContain('.from("rsp_generated_briefs")');
  });
});
