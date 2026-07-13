import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";
import { assertPersonaHasRoom, resolveByteSize } from "./content-vault.functions";

/**
 * Persona-scoped teaser video, deliberately modeled as a direct FK
 * (`personas.intro_video_asset_id`), not a `persona_content_permissions`
 * row — it bypasses the included/ppv/restricted tiering entirely and is
 * either present-and-approved or not, visible to anyone who can see the
 * card at all (including logged-out visitors).
 */
const INTRO_VIDEO_CATEGORY = "persona_intro_video";
const INTRO_VIDEO_DURATION_SECONDS = 10;

async function requireCreator(supabase: any, userId: string) {
  const { data: creator, error } = await supabase
    .from("creators").select("id, digital_twin_status").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!creator) throw new Error("Create your creator profile first.");
  return creator as { id: string; digital_twin_status: string };
}

async function requireOwnedPersona(supabase: any, creatorId: string, personaId: string) {
  const { data: persona, error } = await supabase
    .from("personas").select("id, creator_id, display_name, intro_video_asset_id").eq("id", personaId).eq("creator_id", creatorId).maybeSingle();
  if (error) throw error;
  if (!persona) throw new Error("Persona not found, or you don't own it.");
  return persona;
}

/** Same monthly-spend-cap query already used in generate-requests.functions.ts, duplicated here since it's a small, self-contained guard. */
async function assertUnderSpendCap(supabase: any, creatorId: string, additionalCostCents: number) {
  const { data: creatorCap } = await supabase
    .from("creators").select("generation_spend_cap_cents").eq("id", creatorId).maybeSingle();
  const cap = creatorCap?.generation_spend_cap_cents;
  if (typeof cap !== "number" || cap <= 0) return;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data: spendRows } = await supabase
    .from("content_assets")
    .select("cost_cents")
    .eq("creator_id", creatorId)
    .gte("created_at", monthStart.toISOString())
    .not("cost_cents", "is", null);
  const spentCents = (spendRows ?? []).reduce((sum: number, r: any) => sum + (r.cost_cents ?? 0), 0);
  if (spentCents + additionalCostCents > cap) {
    throw new Error(`Monthly generation spend cap ($${(cap / 100).toFixed(2)}) reached. Contact support to raise it.`);
  }
}

/** Direct upload of a creator-provided intro video clip. */
export const uploadPersonaIntroVideo = createServerFn({ method: "POST" })
  .validator((d: { personaId: string; storagePath: string; byteSize?: number }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const persona = await requireOwnedPersona(supabase, creator.id, data.personaId);

    if (!data.storagePath.startsWith(`${creator.id}/`)) {
      throw new Error("Storage path is not owned by this creator.");
    }
    const byteSize = await resolveByteSize(data.storagePath, data.byteSize);
    await assertPersonaHasRoom(supabase, data.personaId, byteSize);

    const { data: asset, error } = await supabase
      .from("content_assets")
      .insert({
        creator_id: creator.id,
        title: `Intro video · ${persona.display_name}`,
        asset_type: "video",
        storage_path: data.storagePath,
        category: INTRO_VIDEO_CATEGORY,
        is_synthetic: false,
        ai_generated_label: false,
        approval_status: "pending",
        byte_size: byteSize || null,
      })
      .select("*").single();
    if (error) throw error;

    const { error: updErr } = await supabase
      .from("personas").update({ intro_video_asset_id: asset.id }).eq("id", data.personaId);
    if (updErr) throw updErr;

    await logAudit(userId, "persona_intro_video.uploaded", { type: "content_asset", id: asset.id }, {
      personaId: data.personaId,
    });
    return { ok: true, asset };
  });

/**
 * Generates a 10-second intro clip via Venice, skipping the
 * generation_requests pre-approval stage (that exists to control cost/policy
 * risk on batch requests of up to 4 videos at once — this is a single,
 * fixed-duration, one-at-a-time action). The resulting asset still requires
 * admin approval before it's publicly visible, same as every other
 * Venice-generated asset. The existing venice-video-poll cron finishes the
 * job — this function only needs to match its expected row shape.
 */
export const requestPersonaIntroVideoGeneration = createServerFn({ method: "POST" })
  .validator((d: { personaId: string; prompt: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const persona = await requireOwnedPersona(supabase, creator.id, data.personaId);

    const prompt = data.prompt.trim();
    if (!prompt) throw new Error("Enter a prompt for the intro video.");
    if (prompt.length > 2000) throw new Error("Prompt must be 2000 characters or fewer.");

    if (creator.digital_twin_status !== "approved") {
      throw new Error(
        "Your Digital Twin Profile must be approved (an approved identity reference plus active consent) before generating synthetic video.",
      );
    }
    const { data: consent } = await supabase
      .from("digital_twin_consent")
      .select("likeness_ok, video_ok, signed_at, revoked_at, forbidden_uses")
      .eq("creator_id", creator.id)
      .maybeSingle();
    if (!consent || !consent.signed_at || consent.revoked_at) {
      throw new Error("Active Digital Twin consent is required.");
    }
    if (!consent.likeness_ok) throw new Error("Likeness consent has not been granted.");
    if (!consent.video_ok) throw new Error("Consent for video generation has not been granted.");
    const forbidden: string[] = Array.isArray(consent.forbidden_uses)
      ? consent.forbidden_uses.map((v: any) => String(v).toLowerCase())
      : [];
    if (forbidden.includes("video")) throw new Error("Video generation is on your forbidden-uses list.");

    const perVideoCostCents = Math.round(
      Number(process.env.VENICE_COST_PER_VIDEO_SECOND_CENTS || 15) * INTRO_VIDEO_DURATION_SECONDS,
    );
    await assertUnderSpendCap(supabase, creator.id, perVideoCostCents);

    // Reference images preferred, not required — mirrors
    // generate-requests.functions.ts's own video branch exactly.
    const { data: refAssets } = await supabase
      .from("twin_reference_assets")
      .select("storage_path")
      .eq("creator_id", creator.id)
      .eq("kind", "identity_ref")
      .eq("review_status", "approved")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .limit(3);
    let referenceImageUrls: string[] | undefined;
    if (refAssets?.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const signed = await Promise.all(
        refAssets.map((r: any) => supabaseAdmin.storage.from("content-assets").createSignedUrl(r.storage_path, 600)),
      );
      referenceImageUrls = signed.map((s) => s.data?.signedUrl).filter((u): u is string => !!u);
      if (!referenceImageUrls.length) referenceImageUrls = undefined;
    }

    // Storage-cap enforcement happens now on an estimate, not the final byte
    // size (unknown until the render completes) — a generous 200MB estimate
    // mirrors applyVeniceVideoOutcome's own oversized-video rejection ceiling,
    // so a creator can't queue a render they'd immediately be over cap for.
    await assertPersonaHasRoom(supabase, data.personaId, 200 * 1024 * 1024);

    const { queueVeniceVideo } = await import("./venice.server");
    const result = await queueVeniceVideo({
      prompt,
      durationSeconds: INTRO_VIDEO_DURATION_SECONDS,
      referenceImageUrls,
    });

    const { data: asset, error } = await supabase
      .from("content_assets")
      .insert({
        creator_id: creator.id,
        title: `Intro video · ${persona.display_name}`,
        asset_type: "video",
        is_synthetic: true,
        ai_generated_label: true,
        approval_status: "pending",
        category: INTRO_VIDEO_CATEGORY,
        provider: "venice_video",
        provider_status: "processing",
        provider_job_id: result.queueId,
        provider_model: result.model,
        render_started_at: new Date().toISOString(),
        cost_cents: perVideoCostCents,
      })
      .select("*").single();
    if (error) throw error;

    const { error: updErr } = await supabase
      .from("personas").update({ intro_video_asset_id: asset.id }).eq("id", data.personaId);
    if (updErr) throw updErr;

    await logAudit(userId, "persona_intro_video.generation_requested", { type: "content_asset", id: asset.id }, {
      personaId: data.personaId, queueId: result.queueId, model: result.model,
    });
    return { ok: true, asset };
  });

export type PersonaIntroVideoStatus =
  | { state: "none" }
  | { state: "processing" }
  | { state: "pending_review"; previewUrl: string | null }
  | { state: "approved"; previewUrl: string | null }
  | { state: "rejected"; reason: string | null };

/** Creator-facing status + a signed preview URL they can see before admin approval (owner bypass, same as twin refs). */
export const getMyPersonaIntroVideoStatus = createServerFn({ method: "POST" })
  .validator((d: { personaId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<PersonaIntroVideoStatus> => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const persona = await requireOwnedPersona(supabase, creator.id, data.personaId);
    if (!persona.intro_video_asset_id) return { state: "none" };

    const { data: asset } = await supabase
      .from("content_assets")
      .select("id, storage_path, approval_status, provider_status, moderation_status")
      .eq("id", persona.intro_video_asset_id)
      .maybeSingle();
    if (!asset) return { state: "none" };

    if (asset.provider_status === "processing") return { state: "processing" };
    if (asset.approval_status === "rejected") return { state: "rejected", reason: asset.moderation_status ?? null };

    let previewUrl: string | null = null;
    if (asset.storage_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed } = await supabaseAdmin.storage
        .from("content-assets").createSignedUrl(asset.storage_path, 600);
      previewUrl = signed?.signedUrl ?? null;
    }
    if (asset.approval_status === "approved") return { state: "approved", previewUrl };
    return { state: "pending_review", previewUrl };
  });

/** Detaches the intro video from this persona — leaves the underlying asset row in place, same as an avatar replace. */
export const removePersonaIntroVideo = createServerFn({ method: "POST" })
  .validator((d: { personaId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    await requireOwnedPersona(supabase, creator.id, data.personaId);

    const { error } = await supabase
      .from("personas").update({ intro_video_asset_id: null }).eq("id", data.personaId);
    if (error) throw error;

    await logAudit(userId, "persona_intro_video.removed", { type: "persona", id: data.personaId }, {});
    return { ok: true };
  });
