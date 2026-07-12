export type PersonaTemplate = "real" | "nice" | "naughty" | "wicked" | "custom";

export type SupporterJourneyAnswers = {
  adultConfirmed: boolean;
  respectfulUse: boolean;
  personaliseAllowed: boolean;
  persona: PersonaTemplate;
  displayName: string;
  relationshipStage: string;
  objective: string;
  messageDetail: number;
  playfulness: number;
  directness: number;
  humour: number;
  emojiFrequency: string;
  environment: string;
  atmosphere: string;
  immersion: number;
  interests: string[];
  formats: string[];
  teasingConsent: "comfortable" | "ask_first" | "not_comfortable";
  excludedTopics: string;
  redirectStyle: string;
  offerFrequency: string;
  savePreferences: boolean;
  retentionDays: number;
  futurePersonalisation: boolean;
};

export const DEFAULT_JOURNEY_ANSWERS: SupporterJourneyAnswers = {
  adultConfirmed: false,
  respectfulUse: false,
  personaliseAllowed: false,
  persona: "real",
  displayName: "",
  relationshipStage: "new_supporter",
  objective: "content_discovery",
  messageDetail: 50,
  playfulness: 50,
  directness: 50,
  humour: 50,
  emojiFrequency: "occasional",
  environment: "creator_studio",
  atmosphere: "realistic",
  immersion: 40,
  interests: [],
  formats: [],
  teasingConsent: "not_comfortable",
  excludedTopics: "",
  redirectStyle: "gentle",
  offerFrequency: "occasional",
  savePreferences: false,
  retentionDays: 0,
  futurePersonalisation: false,
};

const PERSONA_TONE: Record<PersonaTemplate, string> = {
  real: "natural, candid, low-pressure and grounded",
  nice: "warm, positive, reassuring and gently paced",
  naughty: "cheeky, consent-first, playful and strictly non-explicit",
  wicked: "bold, cinematic, mysterious and strictly non-explicit",
  custom: "creator-defined, transparent, boundary-aware and adaptable",
};

export function buildJourneyBriefs(answers: SupporterJourneyAnswers) {
  const prohibited = answers.excludedTopics
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const mature = answers.persona === "naughty" || answers.persona === "wicked";
  const chatExperienceBrief = {
    schemaVersion: "1.0",
    supporterProfile: {
      displayName: answers.displayName,
      relationshipStage: answers.relationshipStage,
      personaId: answers.persona,
      adultConfirmed: answers.adultConfirmed,
    },
    chatExperience: {
      objective: answers.objective,
      communicationStyle: {
        messageDetail: answers.messageDetail,
        directness: answers.directness,
        humour: answers.humour,
        playfulness: answers.playfulness,
        emojiFrequency: answers.emojiFrequency,
      },
      environment: {
        name: answers.environment,
        atmosphere: answers.atmosphere,
        immersionLevel: answers.immersion,
      },
    },
    preferences: {
      interests: answers.interests,
      preferredFormats: answers.formats,
      contentRecommendationPermission: answers.personaliseAllowed,
      offerFrequency: answers.offerFrequency,
    },
    boundaries: {
      allowed: answers.teasingConsent === "comfortable" ? ["non-explicit_playful_teasing"] : [],
      askFirst: answers.teasingConsent === "ask_first" ? ["non-explicit_playful_teasing"] : [],
      prohibited,
      redirectStyle: answers.redirectStyle,
    },
    privacy: {
      savePreferences: answers.savePreferences,
      retentionDays: answers.savePreferences ? answers.retentionDays : 0,
      allowFuturePersonalisation: answers.savePreferences && answers.futurePersonalisation,
    },
    safetyReminders: [
      "Never treat a missing answer as consent.",
      "Never use coercion, dependency language, fake exclusivity or manipulative urgency.",
      ...(mature
        ? [
            "Keep all teasing suggestive at most and strictly non-explicit; honour reduce-intensity requests immediately.",
          ]
        : []),
    ],
  };

  const tailoredContentBrief = {
    schemaVersion: "1.0",
    recommendedPersona: answers.persona,
    recommendedTone: PERSONA_TONE[answers.persona],
    recommendedThemes: answers.interests,
    recommendedFormats: answers.formats,
    recommendedEnvironment: answers.environment,
    suggestedJourneyFlow: [
      "persona_welcome",
      "boundary_confirmation",
      "mood_setup",
      "interest_discovery",
      "interactive_moment",
      ...(answers.offerFrequency === "never" ? [] : ["optional_recommendation"]),
      "feedback",
      "save_or_discard",
    ],
    offerGuidance:
      answers.offerFrequency === "never"
        ? "Do not recommend paid content."
        : `Offers may appear ${answers.offerFrequency}; use clear pricing and no pressure.`,
    personalisationTokens: answers.personaliseAllowed
      ? ["display_name", "interests", "preferred_formats"]
      : [],
    excludedThemes: prohibited,
    safetyConstraints: chatExperienceBrief.safetyReminders,
    status: "editable_draft",
  };
  return { chatExperienceBrief, tailoredContentBrief };
}
