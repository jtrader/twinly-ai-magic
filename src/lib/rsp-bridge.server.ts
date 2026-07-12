import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { SupporterJourneyAnswers } from "./supporter-journey";

export const RSP_INPUT_VERSION = "2.0";
export type Tier = "base" | "plus" | "vip";
export type ConsentReceipt = {
  consentVersion: string;
  acceptedAt: string;
  adultConfirmed: boolean;
  respectfulUseAccepted: boolean;
  personalisationAllowed: boolean;
  preferencesMayBeSaved: boolean;
};
export type Intake = {
  schemaVersion: "2.0";
  questionnaire: SupporterJourneyAnswers;
  consentReceipt: ConsentReceipt;
  sessionContext: {
    questionnaireId: string;
    questionnaireVersion: string;
    source: "supporter_onboarding" | "chat_check_in" | "content_enquiry";
    locale: string;
  };
};
export type EncryptedEnvelope = {
  ciphertext: string;
  nonce: string;
  authenticationTag: string;
  wrappedDataKey: string;
  wrapNonce: string;
  wrapAuthenticationTag: string;
  encryptionAlgorithm: "AES-256-GCM";
  keyVersion: string;
  schemaVersion: string;
  retentionExpiry: string;
  associatedDataHash: string;
};
export type StateVector = {
  fire: number;
  air: number;
  earth: number;
  water: number;
  ether: number;
};
const STATES = Object.keys({ fire: 0, air: 0, earth: 0, water: 0, ether: 0 }) as Array<
  keyof StateVector
>;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const stable = (value: unknown) => JSON.stringify(value, Object.keys(value as object).sort());
function masterKey(encoded: string) {
  const key = /^[a-f0-9]{64}$/i.test(encoded)
    ? Buffer.from(encoded, "hex")
    : Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("RSP_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}
function aad(creatorId: string, submissionId: string, path: string, schemaVersion: string) {
  return Buffer.from(`${creatorId}|${submissionId}|${path}|${schemaVersion}`);
}
function seal(value: Buffer, key: Buffer, associated: Buffer) {
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(associated);
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return { ciphertext, nonce, tag: cipher.getAuthTag() };
}
function open(ciphertext: Buffer, key: Buffer, nonce: Buffer, tag: Buffer, associated: Buffer) {
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(associated);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
export function encryptQuestionnaire(
  questionnaire: SupporterJourneyAnswers,
  context: {
    creatorId: string;
    submissionId: string;
    schemaVersion: string;
    retentionExpiry: string;
    keyVersion: string;
    masterKey: string;
  },
): EncryptedEnvelope {
  const dataKey = randomBytes(32),
    associated = aad(
      context.creatorId,
      context.submissionId,
      "questionnaire",
      context.schemaVersion,
    ),
    sealed = seal(Buffer.from(JSON.stringify(questionnaire)), dataKey, associated),
    wrapped = seal(dataKey, masterKey(context.masterKey), associated);
  return {
    ciphertext: sealed.ciphertext.toString("base64"),
    nonce: sealed.nonce.toString("base64"),
    authenticationTag: sealed.tag.toString("base64"),
    wrappedDataKey: wrapped.ciphertext.toString("base64"),
    wrapNonce: wrapped.nonce.toString("base64"),
    wrapAuthenticationTag: wrapped.tag.toString("base64"),
    encryptionAlgorithm: "AES-256-GCM",
    keyVersion: context.keyVersion,
    schemaVersion: context.schemaVersion,
    retentionExpiry: context.retentionExpiry,
    associatedDataHash: sha(associated.toString()),
  };
}
export function decryptQuestionnaire(
  envelope: EncryptedEnvelope,
  context: { creatorId: string; submissionId: string; masterKey: string },
) {
  const associated = aad(
    context.creatorId,
    context.submissionId,
    "questionnaire",
    envelope.schemaVersion,
  );
  if (sha(associated.toString()) !== envelope.associatedDataHash)
    throw new Error("ASSOCIATED_DATA_MISMATCH");
  const dataKey = open(
    Buffer.from(envelope.wrappedDataKey, "base64"),
    masterKey(context.masterKey),
    Buffer.from(envelope.wrapNonce, "base64"),
    Buffer.from(envelope.wrapAuthenticationTag, "base64"),
    associated,
  );
  return JSON.parse(
    open(
      Buffer.from(envelope.ciphertext, "base64"),
      dataKey,
      Buffer.from(envelope.nonce, "base64"),
      Buffer.from(envelope.authenticationTag, "base64"),
      associated,
    ).toString(),
  ) as SupporterJourneyAnswers;
}

export function validateIntake(input: Intake) {
  const errors: string[] = [];
  if (input.schemaVersion !== RSP_INPUT_VERSION) errors.push("UNSUPPORTED_SCHEMA");
  if (!input.consentReceipt.respectfulUseAccepted || !input.questionnaire.respectfulUse)
    errors.push("RESPECTFUL_USE_REQUIRED");
  if (input.consentReceipt.adultConfirmed !== input.questionnaire.adultConfirmed)
    errors.push("ADULT_CONFIRMATION_MISMATCH");
  if (input.consentReceipt.personalisationAllowed !== input.questionnaire.personaliseAllowed)
    errors.push("PERSONALISATION_CONSENT_MISMATCH");
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(input.sessionContext.locale)) errors.push("INVALID_LOCALE");
  return errors;
}
const band = (value: number, low = 34, high = 67) =>
  value < low ? "low" : value < high ? "medium" : "high";
const mapIds = (values: string[], prefix: string) =>
  values
    .map(
      (v) =>
        `${prefix}.${v
          .toLowerCase()
          .trim()
          .replace(/[\s-]+/g, "_")
          .replace(/[^a-z0-9_]/g, "")}`,
    )
    .filter((v) => !v.endsWith("."));
function normalise(vector: StateVector) {
  const total = STATES.reduce((s, k) => s + Math.max(0, vector[k]), 0) || 1;
  return Object.fromEntries(
    STATES.map((k) => [k, Number((Math.max(0, vector[k]) / total).toFixed(6))]),
  ) as StateVector;
}
export function buildPolicy(
  answers: SupporterJourneyAnswers,
  receipt: ConsentReceipt,
  server: { creatorScope: string; tier: Tier; submissionId: string; now: Date },
) {
  const mature = ["naughty", "wicked"].includes(answers.persona);
  if (!receipt.respectfulUseAccepted) throw new Error("RESPECTFUL_USE_REQUIRED");
  if (mature && !receipt.adultConfirmed) throw new Error("ADULT_GATE_REQUIRED");
  const save =
      receipt.preferencesMayBeSaved && answers.savePreferences && answers.retentionDays > 0,
    expiresAt = new Date(
      server.now.getTime() + (save ? answers.retentionDays : 0) * 86400000,
    ).toISOString();
  const visibility =
    server.tier === "vip"
      ? ["public", "logged_in", "subscribers_only", "vip"]
      : server.tier === "plus"
        ? ["public", "logged_in", "subscribers_only"]
        : ["public", "logged_in"];
  const policy = {
    policyVersion: "1.0",
    submissionId: server.submissionId,
    creatorScope: server.creatorScope,
    adultGate: { required: mature, passed: receipt.adultConfirmed },
    respectfulUse: { accepted: true },
    personalisation: {
      allowed: receipt.personalisationAllowed,
      futurePersonalisationAllowed: save && answers.futurePersonalisation,
    },
    recommendations: { contentRecommendationsAllowed: receipt.personalisationAllowed },
    offers: {
      allowed: answers.offerFrequency !== "never",
      frequency: answers.offerFrequency,
      allowedOfferTypes: [] as string[],
    },
    interaction: { teasingPolicy: answers.teasingConsent, redirectStyle: answers.redirectStyle },
    contact: { futureContactAllowed: false },
    entitlements: { subscriptionTier: server.tier, visibilityTiers: visibility },
    // Wired from the supporter's own stated boundaries (excludedTopics) —
    // previously always empty regardless of what was typed here, meaning
    // "topics to never include" was collected but never actually enforced
    // anywhere downstream.
    exclusions: {
      prohibitedThemeIds: mapIds(
        answers.excludedTopics.split(",").map((s) => s.trim()).filter(Boolean),
        "theme",
      ),
      prohibitedContentTagIds: answers.excludedTopics
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      prohibitedAssetIds: [] as string[],
    },
    retention: {
      savePreferences: save,
      retentionDays: save ? answers.retentionDays : 0,
      expiresAt: save ? expiresAt : server.now.toISOString(),
    },
  };
  return { ...policy, policyHash: sha(stable(policy)) };
}
export function extractPrivacySafeProfile(
  answers: SupporterJourneyAnswers,
  policy: ReturnType<typeof buildPolicy>,
) {
  const generic = !policy.personalisation.allowed;
  return {
    profileVersion: "1.0",
    profileToken: policy.retention.savePreferences ? randomUUID() : undefined,
    persona: generic ? "real" : answers.persona,
    relationshipStage: generic ? "new_supporter" : answers.relationshipStage,
    objective: generic ? "casual_chat" : answers.objective,
    communication: {
      detailBand: generic ? "medium" : band(answers.messageDetail),
      playfulnessBand: generic ? "low" : band(answers.playfulness),
      directnessBand: generic ? "medium" : band(answers.directness),
      humourBand: generic ? "low" : band(answers.humour),
      emojiBand: generic ? "minimal" : answers.emojiFrequency,
    },
    environment: {
      environmentFamily: `environment.${generic ? "welcoming_relaxed" : answers.environment}`,
      atmosphere: generic ? "realistic" : answers.atmosphere,
      immersionBand: generic ? "low" : band(answers.immersion),
      energyBand: generic ? "relaxed" : "adaptive",
      sensoryDetail: !generic && answers.immersion >= 50,
    },
    interestTaxonomyIds: generic ? [] : mapIds(answers.interests, "theme"),
    formatIds: generic ? ["format.chat"] : mapIds(answers.formats, "format"),
    offerPreferences: {
      cadence: policy.offers.allowed ? answers.offerFrequency : "never",
      typeIds: [] as string[],
      priceBand: "unknown",
    },
  };
}
export function interpretStates(
  answers: SupporterJourneyAnswers,
  profile: ReturnType<typeof extractPrivacySafeProfile>,
) {
  const raw: StateVector = {
    fire: 0.2 + (answers.directness / 100) * 0.5 + (answers.playfulness / 100) * 0.2,
    air:
      0.2 +
      (answers.playfulness / 100) * 0.5 +
      (answers.humour / 100) * 0.3 +
      profile.interestTaxonomyIds.length * 0.05,
    earth:
      0.3 +
      ((100 - answers.playfulness) / 100) * 0.25 +
      (answers.teasingConsent !== "comfortable" ? 0.35 : 0),
    water:
      0.25 + ((100 - answers.directness) / 100) * 0.3 + (answers.persona === "nice" ? 0.35 : 0),
    ether: 0.15 + (answers.immersion / 100) * 0.55 + (answers.atmosphere === "cinematic" ? 0.3 : 0),
  };
  const states = normalise(raw),
    values = Object.values(states),
    mean = 0.2,
    variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / 5;
  return {
    stateVersion: "1.0",
    states,
    quality: {
      intensity: Number(Math.max(...values).toFixed(3)),
      ambiguity: Number((1 - Math.sqrt(variance) / 0.4).toFixed(3)),
      consistency: Number(
        Math.max(0, 1 - Math.abs(answers.playfulness - answers.directness) / 100).toFixed(3),
      ),
      coverage: Number(
        Math.min(
          1,
          (profile.interestTaxonomyIds.length + profile.formatIds.length + 5) / 12,
        ).toFixed(3),
      ),
      confidence: policyConfidence(profile),
    },
    clusterSummaries: {
      communication: top(states),
      boundaries: { primary: "earth", secondary: "water" },
      environment: { primary: answers.immersion > 60 ? "ether" : "water", secondary: "earth" },
      content: { primary: "air", secondary: "fire" },
    },
  };
}
function policyConfidence(profile: ReturnType<typeof extractPrivacySafeProfile>) {
  return Number(
    Math.min(
      0.95,
      0.65 + (profile.interestTaxonomyIds.length + profile.formatIds.length) * 0.03,
    ).toFixed(3),
  );
}
function top(states: StateVector) {
  // Copy before sorting — STATES is a shared module-level array; sorting it
  // in place would corrupt ordering for every subsequent call.
  const sorted = [...STATES].sort((a, b) => states[b] - states[a]);
  return { primary: sorted[0], secondary: sorted[1] };
}
export function buildVaultQuery(
  policy: ReturnType<typeof buildPolicy>,
  profile: ReturnType<typeof extractPrivacySafeProfile>,
  state: ReturnType<typeof interpretStates>,
  server: { requestId: string },
) {
  const required = [
      "journey.welcome",
      "journey.environment_setup",
      "journey.interest_discovery",
      "journey.interaction",
      "journey.recommendation",
      "journey.feedback",
      "journey.close",
    ],
    optional = policy.offers.allowed ? ["journey.offer"] : [];
  if (policy.interaction.teasingPolicy === "ask_first")
    required.splice(2, 0, "journey.boundary_calibration");
  return {
    retrievalVersion: "1.0",
    requestId: server.requestId,
    creatorScope: policy.creatorScope,
    policyHash: policy.policyHash,
    tagSchemaVersion: "2.0",
    hardFilters: {
      reviewStatus: ["review.approved"],
      licenseStatus: ["license.cleared"],
      safetyStatus: [
        "safety.general_creator",
        ...(policy.adultGate.passed ? ["safety.mature_non_explicit"] : []),
      ],
      visibilityTiers: policy.entitlements.visibilityTiers.map((v) => `visibility.${v}`),
      adultGatePassed: policy.adultGate.passed,
      platform: "platform.twinly_chat",
      prohibitedThemeIds: policy.exclusions.prohibitedThemeIds,
      prohibitedContentTagIds: policy.exclusions.prohibitedContentTagIds,
      prohibitedAssetIds: policy.exclusions.prohibitedAssetIds,
      offersAllowed: policy.offers.allowed,
    },
    softMatch: {
      personaIds: [`persona.${profile.persona}`],
      relationshipStageIds: [`relationship_stage.${profile.relationshipStage}`],
      objectiveIds: [`objective.${profile.objective}`],
      themeIds: profile.interestTaxonomyIds,
      formatIds: profile.formatIds,
      environmentIds: [profile.environment.environmentFamily],
      toneIds: profile.persona === "nice" ? ["tone.warm", "tone.reassuring"] : [],
      communicationIds: [`communication.${profile.communication.detailBand}`],
    },
    stateProfile: state.states,
    profileQuality: state.quality,
    journeyRequirements: {
      requiredStages: required,
      optionalStages: optional,
      prohibitedStages: policy.offers.allowed
        ? []
        : ["journey.offer", "journey.follow_up_permission"],
      maximumOfferStages: policy.offers.allowed ? 1 : 0,
    },
    rankingWeights: {
      stateAffinity: 0.2,
      persona: 0.18,
      journeyStage: 0.17,
      theme: 0.12,
      format: 0.1,
      environment: 0.08,
      communication: 0.06,
      objective: 0.05,
      quality: 0.02,
      recency: 0.02,
    },
  };
}
// ── Vault matching ───────────────────────────────────────────────────────────
// Real content_assets has a flat `asset_type` ("image"|"video"|"audio"|"text")
// and free-form `tags`, not the namespaced taxonomy (theme.xxx, format.xxx)
// buildVaultQuery's ids imply — there is no separate curated tag vocabulary
// in this codebase to match against. This bridges the two: normalise the
// namespaced query ids back to plain terms and match them against the
// asset's own real tags/type, rather than inventing a new tagging system
// creators would have to backfill every existing asset into.
const FORMAT_TO_ASSET_TYPE: Record<string, "image" | "video" | "audio" | "text"> = {
  photos: "image",
  photo_sets: "image",
  short_videos: "video",
  longer_videos: "video",
  livestreams: "video",
  audio_messages: "audio",
  voice_notes: "audio",
  written_stories: "text",
};

function normaliseTagId(id: string): string {
  return id.includes(".") ? id.slice(id.indexOf(".") + 1) : id;
}

export type VaultAssetCandidate = {
  id: string;
  title: string;
  assetType: "image" | "video" | "audio" | "text";
  tags: string[];
  permissionType: "included" | "ppv" | "restricted";
  createdAt: string;
};

export type VaultMatch = {
  assetId: string;
  title: string;
  assetType: string;
  matchScore: number;
  matchExplanation: { themeOverlap: number; formatMatch: boolean; recency: number };
};

/**
 * Pure — ranks already-fetched candidate assets against a vault query.
 * Mirrors twinly-content.server.ts's rankContentRecords: fetching is the
 * caller's job, this only scores and filters. Only theme/format/recency are
 * computed against real asset metadata — the other rankingWeights dimensions
 * (persona, journeyStage, environment, communication, objective, quality,
 * stateAffinity) describe conversational context content assets don't carry,
 * so they aren't applicable here and aren't silently faked into the score.
 */
export function rankVaultAssets(
  assets: VaultAssetCandidate[],
  query: ReturnType<typeof buildVaultQuery>,
  now: Date = new Date(),
  limit = 6,
): VaultMatch[] {
  const prohibitedAssetIds = new Set(query.hardFilters.prohibitedAssetIds);
  const prohibitedTags = new Set(query.hardFilters.prohibitedContentTagIds.map(normaliseTagId));
  const themeIds = new Set(query.softMatch.themeIds.map(normaliseTagId));
  const formatTypes = new Set(
    query.softMatch.formatIds.map(normaliseTagId).map((id) => FORMAT_TO_ASSET_TYPE[id]).filter(Boolean),
  );
  const weights = query.rankingWeights;
  const maxScore = weights.theme + weights.format + weights.recency;

  return assets
    .filter((asset) => {
      if (prohibitedAssetIds.has(asset.id)) return false;
      if (asset.permissionType === "restricted") return false;
      if (asset.permissionType === "ppv" && !query.hardFilters.offersAllowed) return false;
      const tagSet = asset.tags.map((t) => t.toLowerCase());
      if (tagSet.some((t) => prohibitedTags.has(t))) return false;
      return true;
    })
    .map((asset) => {
      const tagSet = new Set(asset.tags.map((t) => t.toLowerCase()));
      const themeOverlap = [...tagSet].filter((t) => themeIds.has(t)).length;
      const themeScore = themeIds.size ? Math.min(1, themeOverlap / themeIds.size) : 0;
      const formatMatch = formatTypes.has(asset.assetType);
      const ageDays = Math.max(0, (now.getTime() - new Date(asset.createdAt).getTime()) / 86_400_000);
      const recency = Math.max(0, 1 - ageDays / 180);
      const rawScore = themeScore * weights.theme + (formatMatch ? weights.format : 0) + recency * weights.recency;
      return {
        assetId: asset.id,
        title: asset.title,
        assetType: asset.assetType,
        matchScore: maxScore > 0 ? Number((rawScore / maxScore).toFixed(4)) : 0,
        matchExplanation: { themeOverlap, formatMatch, recency: Number(recency.toFixed(4)) },
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

export function generateBriefs(
  policy: ReturnType<typeof buildPolicy>,
  profile: ReturnType<typeof extractPrivacySafeProfile>,
  query: ReturnType<typeof buildVaultQuery>,
  matchedAssets: VaultMatch[] = [],
) {
  return {
    chatExperienceBrief: {
      schemaVersion: "2.0",
      persona: profile.persona,
      relationshipStage: profile.relationshipStage,
      objective: profile.objective,
      communication: {
        detail: profile.communication.detailBand,
        playfulness: profile.communication.playfulnessBand,
        directness: profile.communication.directnessBand,
        humour: profile.communication.humourBand,
        emojiFrequency: profile.communication.emojiBand,
      },
      environment: {
        family: profile.environment.environmentFamily.replace("environment.", ""),
        atmosphere: profile.environment.atmosphere,
        immersion: profile.environment.immersionBand,
        energy: profile.environment.energyBand,
        sensoryDetail: profile.environment.sensoryDetail ? "subtle" : "none",
      },
      interactionGuidance: [
        "Ask no more than one preference question at a time.",
        "Offer choices rather than assumptions.",
        "Use low-pressure content recommendations.",
      ],
      hardConstraints: [
        ...(policy.interaction.teasingPolicy === "ask_first"
          ? ["Ask before increasing playful teasing."]
          : []),
        ...(!policy.contact.futureContactAllowed ? ["Do not initiate future contact."] : []),
        ...(!policy.offers.allowed ? ["Do not present offers."] : []),
        `Use a ${policy.interaction.redirectStyle} redirect for excluded topics.`,
      ],
    },
    tailoredContentBrief: {
      schemaVersion: "2.0",
      status: "editable_draft",
      recommendedPersona: profile.persona,
      recommendedToneIds: query.softMatch.toneIds,
      recommendedThemeIds: query.softMatch.themeIds,
      recommendedFormatIds: query.softMatch.formatIds,
      recommendedEnvironmentId: profile.environment.environmentFamily,
      journeyPlan: [
        ...query.journeyRequirements.requiredStages,
        ...query.journeyRequirements.optionalStages,
      ],
      offerGuidance: {
        allowed: policy.offers.allowed,
        maximumCount: query.journeyRequirements.maximumOfferStages,
        preferredOfferTypes: policy.offers.allowedOfferTypes,
        presentationStyle: "gentle_optional",
      },
      matchedVaultAssets: matchedAssets,
      excludedThemeIds: policy.exclusions.prohibitedThemeIds,
      safetyConstraintIds: query.hardFilters.safetyStatus,
      requiresCreatorReview: true,
    },
  };
}
export function processIntake(
  input: Intake,
  server: { creatorScope: string; tier: Tier; submissionId?: string; now?: Date },
) {
  const errors = validateIntake(input);
  if (errors.length) throw new Error(errors.join(","));
  const now = server.now ?? new Date(),
    submissionId = server.submissionId ?? randomUUID(),
    policy = buildPolicy(input.questionnaire, input.consentReceipt, {
      ...server,
      submissionId,
      now,
    }),
    profile = extractPrivacySafeProfile(input.questionnaire, policy),
    state = interpretStates(input.questionnaire, profile),
    query = buildVaultQuery(policy, profile, state, { requestId: randomUUID() }),
    briefs = generateBriefs(policy, profile, query);
  const contentLibraryMatch = {
    personaTemplates: query.softMatch.personaIds,
    themes: query.softMatch.themeIds,
    formats: query.softMatch.formatIds,
    environments: query.softMatch.environmentIds,
    tones: query.softMatch.toneIds,
    contentTags: [...query.softMatch.objectiveIds, ...query.softMatch.relationshipStageIds],
    visibilityTiers: query.hardFilters.visibilityTiers,
    exclusions: [
      ...query.hardFilters.prohibitedThemeIds,
      ...query.hardFilters.prohibitedContentTagIds,
      ...query.hardFilters.prohibitedAssetIds,
    ],
    rankingWeights: query.rankingWeights,
  };
  return { submissionId, policy, profile, state, query, contentLibraryMatch, ...briefs };
}
export function validateRuntimeMessage(
  message: string,
  policy: ReturnType<typeof buildPolicy>,
  stage: string,
) {
  const failures: string[] = [];
  if (/prove you love me|you need me|only i understand/i.test(message))
    failures.push("EMOTIONAL_MANIPULATION");
  if (/limited time|act now/i.test(message)) failures.push("FALSE_SCARCITY");
  if (!policy.offers.allowed && /buy|purchase|offer|unlock/i.test(message))
    failures.push("OFFER_NOT_ALLOWED");
  if (stage !== "journey.offer" && /buy|purchase|offer|unlock/i.test(message))
    failures.push("OFFER_STAGE_INVALID");
  if (/cock|pussy|\bcum\b|blowjob|genital/i.test(message)) failures.push("EXPLICIT_CONTENT");
  return {
    valid: failures.length === 0,
    failures,
    fallbackStage: failures.length ? "journey.safe_redirect" : undefined,
  };
}
export function buildRuntimeContext(
  sequence: {
    persona: string;
    currentStage: string;
    approvedAsset: { purpose: string; template: string };
    environment: { family: string; immersion: string };
    allowedNextStages: string[];
  },
  policy: ReturnType<typeof buildPolicy>,
) {
  return {
    ...sequence,
    hardRules: {
      askBeforeTeasing: policy.interaction.teasingPolicy === "ask_first",
      offersAllowedAtThisStage: policy.offers.allowed && sequence.currentStage === "journey.offer",
      prohibitedTagIds: [
        ...policy.exclusions.prohibitedThemeIds,
        ...policy.exclusions.prohibitedContentTagIds,
      ],
      redirectStyle: policy.interaction.redirectStyle,
    },
  };
}
