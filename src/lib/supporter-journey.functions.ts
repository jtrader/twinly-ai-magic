import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildJourneyBriefs, type SupporterJourneyAnswers } from "@/lib/supporter-journey";

type SaveInput = {
  creatorId: string;
  tier: "base" | "plus" | "vip";
  answers: SupporterJourneyAnswers;
  submitted: boolean;
};

export const getSupporterJourneyDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId: string }) => d)
  .handler(async ({ data, context }) => {
    // The generated database type is updated after this migration is applied remotely.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (context.supabase as any)
      .from("supporter_journey_profiles")
      .select("answers, status, tier")
      .eq("fan_id", context.userId)
      .eq("creator_id", data.creatorId)
      .maybeSingle();
    if (error && error.code !== "PGRST116") throw new Error(error.message);
    return row ?? null;
  });

export const saveSupporterJourney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: SaveInput) => d)
  .handler(async ({ data, context }) => {
    if (!data.creatorId || !["base", "plus", "vip"].includes(data.tier))
      throw new Error("Invalid journey");
    if (data.submitted && (!data.answers.respectfulUse || !data.answers.personaliseAllowed)) {
      throw new Error("Consent confirmation is required before continuing.");
    }
    if (
      data.submitted &&
      ["naughty", "wicked"].includes(data.answers.persona) &&
      !data.answers.adultConfirmed
    ) {
      throw new Error("Adult confirmation is required for this persona.");
    }
    const briefs = buildJourneyBriefs(data.answers);
    const expiresAt =
      data.answers.savePreferences && data.answers.retentionDays > 0
        ? new Date(Date.now() + data.answers.retentionDays * 86_400_000).toISOString()
        : null;
    // The generated database type is updated after this migration is applied remotely.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase as any).from("supporter_journey_profiles").upsert(
      {
        fan_id: context.userId,
        creator_id: data.creatorId,
        tier: data.tier,
        persona_template: data.answers.persona,
        answers: data.answers,
        chat_experience_brief: briefs.chatExperienceBrief,
        tailored_content_brief: briefs.tailoredContentBrief,
        status: data.submitted ? "submitted" : "draft",
        creator_visible: data.submitted,
        expires_at: expiresAt,
        submitted_at: data.submitted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "fan_id,creator_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, ...briefs };
  });
