import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";
import { REAL_ME_QUESTIONNAIRE, computeOverallCompletionPercentage, type Answers } from "./real-me-questionnaire-schema";

/**
 * A version stays "current" and is edited in place for this long after its
 * own creation; autosaves after that gap start a fresh version (cloned
 * forward from the prior one) instead — the simplest correct reading of
 * "session-based versioning" the design spec asks for, without needing a
 * client-side session id or a background job to close out old sessions.
 */
const SESSION_GAP_MINUTES = 20;

/** Pure — whether editing should start a fresh version (a new "session") rather than continuing to edit the current one in place. */
export function shouldStartNewVersion(currentVersionCreatedAt: string, now: number): boolean {
  const ageMinutes = (now - new Date(currentVersionCreatedAt).getTime()) / 60_000;
  return ageMinutes >= SESSION_GAP_MINUTES;
}

async function requireCreator(supabase: any, userId: string) {
  const { data: creator, error } = await supabase
    .from("creators").select("id, handle").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!creator) throw new Error("Create your creator profile first.");
  return creator as { id: string; handle: string };
}

async function getOrCreateCurrentVersion(supabase: any, creatorId: string) {
  const { data: profile, error: profErr } = await supabase
    .from("real_me_profiles").select("id, current_version_id").eq("creator_id", creatorId).maybeSingle();
  if (profErr) throw profErr;

  if (!profile) {
    const { data: newProfile, error: npErr } = await supabase
      .from("real_me_profiles").insert({ creator_id: creatorId }).select("id").single();
    if (npErr) throw npErr;
    const { data: v1, error: vErr } = await supabase
      .from("real_me_profile_versions")
      .insert({ real_me_profile_id: newProfile.id, version_number: 1, responses: {}, completion_percentage: 0 })
      .select("*").single();
    if (vErr) throw vErr;
    await supabase.from("real_me_profiles").update({ current_version_id: v1.id }).eq("id", newProfile.id);
    return { profileId: newProfile.id as string, version: v1 };
  }

  const { data: currentVersion, error: cvErr } = await supabase
    .from("real_me_profile_versions").select("*").eq("id", profile.current_version_id).single();
  if (cvErr) throw cvErr;

  if (!shouldStartNewVersion(currentVersion.created_at, Date.now())) {
    return { profileId: profile.id as string, version: currentVersion };
  }

  const { data: maxV } = await supabase
    .from("real_me_profile_versions").select("version_number")
    .eq("real_me_profile_id", profile.id).order("version_number", { ascending: false }).limit(1).single();
  const { data: newVersion, error: nvErr } = await supabase
    .from("real_me_profile_versions")
    .insert({
      real_me_profile_id: profile.id,
      version_number: (maxV?.version_number ?? 0) + 1,
      responses: currentVersion.responses,
      completion_percentage: currentVersion.completion_percentage,
    })
    .select("*").single();
  if (nvErr) throw nvErr;
  await supabase.from("real_me_profiles").update({ current_version_id: newVersion.id }).eq("id", profile.id);
  return { profileId: profile.id as string, version: newVersion };
}

export const getRealMeProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const creator = await requireCreator(context.supabase, context.userId);
    const { profileId, version } = await getOrCreateCurrentVersion(context.supabase, creator.id);
    return { profileId, version };
  });

/** Debounced-autosave target: one question at a time, in place on the current version. */
export const saveRealMeAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { questionId: string; value: unknown }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const { version } = await getOrCreateCurrentVersion(supabase, creator.id);

    const nextResponses: Answers = { ...(version.responses as Answers), [data.questionId]: data.value };
    const completionPercentage = computeOverallCompletionPercentage(REAL_ME_QUESTIONNAIRE, nextResponses);

    const { data: updated, error } = await supabase
      .from("real_me_profile_versions")
      .update({ responses: nextResponses as any, completion_percentage: completionPercentage })
      .eq("id", version.id)
      .select("*").single();
    if (error) throw error;

    return { version: updated };
  });

export const listRealMeVersionHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const creator = await requireCreator(context.supabase, context.userId);
    const { data: profile } = await context.supabase
      .from("real_me_profiles").select("id").eq("creator_id", creator.id).maybeSingle();
    if (!profile) return { versions: [] };
    const { data: versions, error } = await context.supabase
      .from("real_me_profile_versions")
      .select("id, version_number, responses, completion_percentage, created_at, generation_seed")
      .eq("real_me_profile_id", profile.id)
      .order("version_number", { ascending: false });
    if (error) throw error;
    return { versions: versions ?? [] };
  });

/** Whether this persona's Real Me reference is pinned to an older version than what's current now. */
export const getPersonaRealMeSyncStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const { data: profile } = await supabase
      .from("real_me_profiles").select("id, current_version_id").eq("creator_id", creator.id).maybeSingle();
    const { data: ref } = await supabase
      .from("persona_real_me_references")
      .select("real_me_profile_version_id, synced_at")
      .eq("persona_id", data.personaId)
      .maybeSingle();

    return {
      hasProfile: !!profile,
      currentVersionId: profile?.current_version_id ?? null,
      referencedVersionId: ref?.real_me_profile_version_id ?? null,
      syncedAt: ref?.synced_at ?? null,
      needsResync: !!profile?.current_version_id && ref?.real_me_profile_version_id !== profile?.current_version_id,
    };
  });

/** Explicit creator action only — never runs automatically when a new Real Me version is created. */
export const resyncPersonaToRealMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const { data: persona } = await supabase
      .from("personas").select("id").eq("id", data.personaId).eq("creator_id", creator.id).maybeSingle();
    if (!persona) throw new Error("Persona not found, or you don't own it.");

    const { data: profile } = await supabase
      .from("real_me_profiles").select("current_version_id").eq("creator_id", creator.id).maybeSingle();
    if (!profile?.current_version_id) throw new Error("Complete the Real Me questionnaire before syncing a persona to it.");

    const { error } = await supabase
      .from("persona_real_me_references")
      .upsert(
        { persona_id: data.personaId, real_me_profile_version_id: profile.current_version_id, synced_at: new Date().toISOString() },
        { onConflict: "persona_id" },
      );
    if (error) throw error;

    await logAudit(userId, "real_me.persona_resynced", { type: "persona", id: data.personaId }, {
      versionId: profile.current_version_id,
    });
    return { ok: true, versionId: profile.current_version_id };
  });

/**
 * Pre-fill defaults for new persona creation: 4.6 (topics to steer away
 * from) and 7.4 (general discomfort areas) from the latest Real Me version.
 * Defaults only — creator can loosen/tighten per persona; this never
 * touches the platform-enforced explicitness ceiling.
 */
export const getRealMeDefaultsForNewPersona = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const creator = await requireCreator(context.supabase, context.userId);
    const { data: profile } = await context.supabase
      .from("real_me_profiles").select("current_version_id").eq("creator_id", creator.id).maybeSingle();
    if (!profile?.current_version_id) return { avoidTopics: [], generalDiscomfortAreas: "" };

    const { data: version } = await context.supabase
      .from("real_me_profile_versions").select("responses").eq("id", profile.current_version_id).maybeSingle();
    const responses = (version?.responses ?? {}) as Answers;
    return {
      avoidTopics: (responses["4.6"] as string[] | undefined) ?? [],
      generalDiscomfortAreas: (responses["7.4"] as string | undefined) ?? "",
    };
  });
