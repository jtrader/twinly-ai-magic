/**
 * Real Me baseline questionnaire — structured question config.
 *
 * Deliberately a typed data module, not a DB-seeded config table: this is a
 * single, fixed, platform-wide question set (not creator-editable, unlike
 * per-persona settings elsewhere in this app), so the "structured, not
 * hardcoded per question" requirement is satisfied by the UI rendering
 * generically off this data — editing a question still means touching code,
 * but doesn't require a migration/seed step or an admin editing surface
 * that doesn't otherwise exist for this. Imported by both client (rendering)
 * and server (progress calculation) code, so it carries no ".server.ts"
 * suffix and must stay side-effect-free.
 */

export type QuestionType = "multi_select" | "single_select" | "yes_no" | "rating" | "custom_prompt";

export type QuestionDefinition = {
  id: string;
  promptText: string;
  type: QuestionType;
  options?: string[];
  allowCustomOption?: boolean;
  /** Only rendered when the referenced question's answer equals this value. */
  conditionalOn?: { questionId: string; equals: boolean };
  maxLength?: number;
  /** Excluded from completion-percentage math — always optional. */
  optional?: boolean;
};

export type QuestionnaireSection = {
  id: string;
  title: string;
  questions: QuestionDefinition[];
};

function anythingElse(sectionId: string): QuestionDefinition {
  return { id: `${sectionId}.99`, promptText: "Anything else you'd like to add?", type: "custom_prompt", maxLength: 1000, optional: true };
}

export const REAL_ME_QUESTIONNAIRE: QuestionnaireSection[] = [
  {
    id: "1",
    title: "Identity Basics",
    questions: [
      { id: "1.1", promptText: "Preferred name/nickname for how Real Me refers to themselves", type: "custom_prompt", maxLength: 100 },
      { id: "1.2", promptText: "Pronouns", type: "single_select", options: ["she/her", "he/him", "they/them"], allowCustomOption: true },
      { id: "1.3", promptText: "Where they're based (general region, not exact location)", type: "custom_prompt", maxLength: 150 },
      { id: "1.4", promptText: "How they'd describe their life stage right now", type: "single_select", options: ["Student", "Early career", "Established career", "Parent", "Retired"], allowCustomOption: true },
      anythingElse("1"),
    ],
  },
  {
    id: "2",
    title: "Personality & Temperament",
    questions: [
      { id: "2.1", promptText: "Which words describe you best (pick as many as fit)", type: "multi_select", options: ["Warm", "Dry-witted", "Adventurous", "Calm", "Intense", "Playful", "Thoughtful", "Blunt", "Romantic", "Guarded", "Confident", "Curious", "Empathetic", "Sarcastic"] },
      { id: "2.2", promptText: "Introvert ↔ Extrovert", type: "rating" },
      { id: "2.3", promptText: "Spontaneous ↔ Planner", type: "rating" },
      { id: "2.4", promptText: "Serious ↔ Playful, in general conversation", type: "rating" },
      { id: "2.5", promptText: "How do you handle conflict?", type: "single_select", options: ["Address it directly", "Need space first", "Avoid it", "Depends on the person"], allowCustomOption: true },
      { id: "2.6", promptText: "What makes you laugh?", type: "custom_prompt", maxLength: 500 },
      { id: "2.7", promptText: "What's a value you won't compromise on?", type: "custom_prompt", maxLength: 500 },
      anythingElse("2"),
    ],
  },
  {
    id: "3",
    title: "Interests & Hobbies",
    questions: [
      { id: "3.1", promptText: "Which of these do you actively enjoy", type: "multi_select", options: ["Music", "Sports", "Gaming", "Reading", "Cooking", "Travel", "Art", "Fitness", "Outdoors", "Film/TV", "Fashion", "Tech", "Cars", "Animals/pets", "Gardening", "DIY", "Dance", "Photography", "Writing", "Collecting", "Volunteering"] },
      { id: "3.2", promptText: "Top 3 things you'd talk about for hours if someone asked", type: "custom_prompt", maxLength: 500 },
      { id: "3.3", promptText: "Any hobbies you're currently learning or want to get into", type: "custom_prompt", maxLength: 500 },
      { id: "3.4", promptText: "Favorite way to spend a weekend", type: "custom_prompt", maxLength: 500 },
      { id: "3.5", promptText: "Do you follow sports?", type: "yes_no" },
      { id: "3.5b", promptText: "Which ones/teams?", type: "custom_prompt", maxLength: 300, conditionalOn: { questionId: "3.5", equals: true } },
      { id: "3.6", promptText: "Music taste", type: "multi_select", options: ["Pop", "Hip-hop/R&B", "Rock", "Indie", "Electronic/Dance", "Country", "Classical", "Jazz", "Metal", "Folk", "Latin", "K-pop"] },
      { id: "3.6b", promptText: "Favorite artists", type: "custom_prompt", maxLength: 300 },
      { id: "3.7", promptText: "Favorite type of media", type: "multi_select", options: ["Movies", "TV shows", "Books", "Podcasts"] },
      { id: "3.7b", promptText: "Favorites", type: "custom_prompt", maxLength: 300 },
      anythingElse("3"),
    ],
  },
  {
    id: "4",
    title: "Views & Outlook",
    questions: [
      { id: "4.1", promptText: "How would you describe your general outlook on life", type: "single_select", options: ["Optimistic", "Realistic", "Pragmatic", "Idealistic", "Skeptical"], allowCustomOption: true },
      { id: "4.2", promptText: "What's something you believe that most people don't?", type: "custom_prompt", maxLength: 500 },
      { id: "4.3", promptText: "How important is humor in how you connect with people", type: "rating" },
      { id: "4.4", promptText: "How open are you about your opinions with people you've just met", type: "rating" },
      { id: "4.5", promptText: "Topics you're happy to talk about openly", type: "multi_select", options: ["Travel", "Career", "Relationships", "Hobbies", "Current events", "Philosophy", "Humor/memes", "Food", "Fitness", "Pop culture"] },
      { id: "4.6", promptText: "Topics you'd rather steer away from", type: "multi_select", options: ["Travel", "Career", "Relationships", "Hobbies", "Current events", "Philosophy", "Humor/memes", "Food", "Fitness", "Pop culture"] },
      anythingElse("4"),
    ],
  },
  {
    id: "5",
    title: "Communication Style",
    questions: [
      { id: "5.1", promptText: "How do you naturally text/chat — style", type: "single_select", options: ["Short and punchy", "Long and detailed", "Lots of emoji", "Minimal emoji", "Formal", "Casual/slangy"], allowCustomOption: true },
      { id: "5.2", promptText: "Do you use pet names or nicknames for people you're close to?", type: "yes_no" },
      { id: "5.2b", promptText: "Examples", type: "custom_prompt", maxLength: 300, conditionalOn: { questionId: "5.2", equals: true } },
      { id: "5.3", promptText: "How quickly do you typically reply to messages, realistically", type: "single_select", options: ["Instantly", "Within the hour", "Same day", "Whenever I get to it"] },
      { id: "5.4", promptText: "Favorite expressions, phrases, or verbal habits", type: "custom_prompt", maxLength: 500 },
      { id: "5.5", promptText: "How direct vs. diplomatic are you when giving an opinion", type: "rating" },
      anythingElse("5"),
    ],
  },
  {
    id: "6",
    title: "Physical & Presentation Preferences",
    questions: [
      { id: "6.1", promptText: "How would you describe your general style/aesthetic", type: "single_select", options: ["Casual", "Glam", "Sporty", "Alternative", "Classic", "Eclectic"], allowCustomOption: true },
      { id: "6.2", promptText: "Any signature look or thing people always notice about you", type: "custom_prompt", maxLength: 500 },
      { id: "6.3", promptText: "Favorite colors", type: "multi_select", options: ["Black", "White", "Red", "Pink", "Purple", "Blue", "Green", "Yellow", "Orange", "Brown", "Neutrals/earth tones", "Pastels"] },
      anythingElse("6"),
    ],
  },
  {
    id: "7",
    title: "Relationships & Social Preferences",
    questions: [
      { id: "7.1", promptText: "How would you describe your ideal type of connection with supporters", type: "single_select", options: ["Friendly and casual", "Warm and personal", "Playful and teasing", "Deep and attentive"], allowCustomOption: true },
      { id: "7.2", promptText: "How important is one-on-one attention vs. broader community feel", type: "rating" },
      { id: "7.3", promptText: "What kind of supporter do you enjoy interacting with most", type: "custom_prompt", maxLength: 500 },
      { id: "7.4", promptText: "Are there types of interactions or requests you're not comfortable with, in general?", type: "custom_prompt", maxLength: 500 },
      anythingElse("7"),
    ],
  },
  {
    id: "8",
    title: "Daily Life & Authenticity Details",
    questions: [
      { id: "8.1", promptText: "What does a normal day look like for you", type: "custom_prompt", maxLength: 500 },
      { id: "8.2", promptText: "Do you have pets?", type: "yes_no" },
      { id: "8.2b", promptText: "Names, type", type: "custom_prompt", maxLength: 300, conditionalOn: { questionId: "8.2", equals: true } },
      { id: "8.3", promptText: "Coffee, tea, or neither", type: "single_select", options: ["Coffee", "Tea", "Neither"] },
      { id: "8.4", promptText: "Morning person or night owl", type: "single_select", options: ["Morning person", "Night owl"] },
      { id: "8.5", promptText: "Any quirky habits or small things people find endearing/funny about you", type: "custom_prompt", maxLength: 500 },
      { id: "8.6", promptText: "Favorite food/cuisine", type: "custom_prompt", maxLength: 300 },
      { id: "8.7", promptText: "Something you're proud of, big or small", type: "custom_prompt", maxLength: 500 },
      anythingElse("8"),
    ],
  },
  {
    id: "9",
    title: "Goals for This Profile",
    questions: [
      { id: "9.1", promptText: "What do you want supporters to come away feeling after talking to you", type: "custom_prompt", maxLength: 500 },
      { id: "9.2", promptText: "Anything you specifically want your personas to always stay true to, no matter which tone they take on", type: "custom_prompt", maxLength: 500 },
      { id: "9.3", promptText: "Overall, how important is it that your AI personas feel \"just like you\" vs. distinct characters", type: "rating" },
      anythingElse("9"),
    ],
  },
];

export type SectionStatus = "not_started" | "in_progress" | "complete";
export type Answers = Record<string, unknown>;

function isAnswered(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** The questions that actually apply given current answers — conditional questions whose trigger wasn't met are excluded entirely, not just hidden. */
export function effectiveQuestions(section: QuestionnaireSection, answers: Answers): QuestionDefinition[] {
  return section.questions.filter((q) => {
    if (!q.conditionalOn) return true;
    return answers[q.conditionalOn.questionId] === q.conditionalOn.equals;
  });
}

/** Required (non-optional) effective questions only — what completion is measured against. */
function requiredEffectiveQuestions(section: QuestionnaireSection, answers: Answers): QuestionDefinition[] {
  return effectiveQuestions(section, answers).filter((q) => !q.optional);
}

export function computeSectionStatus(section: QuestionnaireSection, answers: Answers): SectionStatus {
  const required = requiredEffectiveQuestions(section, answers);
  if (required.length === 0) return "complete";
  const answeredCount = required.filter((q) => isAnswered(answers[q.id])).length;
  if (answeredCount === 0) return "not_started";
  if (answeredCount === required.length) return "complete";
  return "in_progress";
}

export function computeSectionCompletionPercentage(section: QuestionnaireSection, answers: Answers): number {
  const required = requiredEffectiveQuestions(section, answers);
  if (required.length === 0) return 100;
  const answeredCount = required.filter((q) => isAnswered(answers[q.id])).length;
  return Math.round((answeredCount / required.length) * 1000) / 10;
}

/** Overall completion across every section, respecting each section's own conditional/optional exclusions. */
export function computeOverallCompletionPercentage(sections: QuestionnaireSection[], answers: Answers): number {
  let totalRequired = 0;
  let totalAnswered = 0;
  for (const section of sections) {
    const required = requiredEffectiveQuestions(section, answers);
    totalRequired += required.length;
    totalAnswered += required.filter((q) => isAnswered(answers[q.id])).length;
  }
  if (totalRequired === 0) return 100;
  return Math.round((totalAnswered / totalRequired) * 1000) / 10;
}
