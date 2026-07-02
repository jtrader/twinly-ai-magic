import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";
import { assertTwinPolicy } from "./generate-requests.functions";

async function requireCreator(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("creators").select("id, handle").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Create your creator profile first.");
  return data as { id: string; handle: string };
}

async function attachPersonaAndPack(
  supabase: any,
  assetId: string,
  personaId?: string,
  packId?: string,
) {
  if (personaId) {
    await supabase.from("persona_content_permissions").upsert(
      { persona_id: personaId, asset_id: assetId, permission_type: "included" },
      { onConflict: "persona_id,asset_id" },
    );
  }
  if (packId) {
    const { data: max } = await supabase
      .from("content_pack_items").select("position").eq("pack_id", packId)
      .order("position", { ascending: false }).limit(1);
    const pos = (max?.[0]?.position ?? -1) + 1;
    await supabase.from("content_pack_items")
      .upsert({ pack_id: packId, asset_id: assetId, position: pos }, { onConflict: "pack_id,asset_id", ignoreDuplicates: true });
    const { data: attach } = await supabase
      .from("content_pack_personas").select("persona_id, permission_type").eq("pack_id", packId);
    if (attach?.length) {
      const links = attach.map((a: any) => ({ asset_id: assetId, persona_id: a.persona_id, permission_type: a.permission_type }));
      await supabase.from("persona_content_permissions").upsert(links, { onConflict: "persona_id,asset_id" });
    }
  }
}

/**
 * Persist a client-generated AI image (streamed via /api/generate-image)
 * as a synthetic asset in the vault. The base64 payload is the final PNG frame.
 */
export const saveGeneratedImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    title: string;
    base64: string;
    prompt: string;
    personaId?: string;
    packId?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    if (!data.base64) throw new Error("Missing image data.");

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    } catch {
      throw new Error("Invalid image payload.");
    }
    if (bytes.byteLength < 1024) throw new Error("Image data too small.");
    if (bytes.byteLength > 15 * 1024 * 1024) throw new Error("Image too large.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${creator.id}/generated/image-${Date.now()}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("content-assets")
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (upErr) throw upErr;

    const title = (data.title.trim() || "AI image").slice(0, 120);
    const { data: asset, error } = await supabase
      .from("content_assets").insert({
        creator_id: creator.id,
        title,
        asset_type: "image",
        storage_path: path,
        is_synthetic: true,
        ai_generated_label: true,
        approval_status: "pending",
        category: "ai_image",
      }).select("*").single();
    if (error) throw error;

    await attachPersonaAndPack(supabase, asset.id, data.personaId, data.packId);
    await logAudit(userId, "ai.image_saved", { type: "asset", id: asset.id }, {
      prompt: data.prompt.slice(0, 200), bytes: bytes.byteLength,
    });
    return { asset };
  });

/**
 * Generate a short AI voice note (TTS) via Lovable AI Gateway and save it as
 * a synthetic audio asset. The creator must explicitly review/approve before
 * fans can access it.
 */
export const generateVoiceNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    prompt: string;
    title?: string;
    voice?: string;
    personaId?: string;
    packId?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);

    const text = data.prompt.trim();
    if (text.length < 2) throw new Error("Voice note must be at least 2 characters.");
    if (text.length > 4000) throw new Error("Voice note must be under 4000 characters.");
    const voice = (data.voice || "alloy").toLowerCase();

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: text,
        voice,
        response_format: "mp3",
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Rate limited — try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Top up in workspace billing.");
      throw new Error(`Voice generation failed (${res.status}): ${err.slice(0, 200)}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${creator.id}/generated/voice-${Date.now()}.mp3`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("content-assets")
      .upload(path, buf, { contentType: "audio/mpeg", upsert: false });
    if (upErr) throw upErr;

    const title = (data.title?.trim() || `AI voice note — ${new Date().toISOString().slice(0, 10)}`).slice(0, 120);
    const { data: asset, error } = await supabase
      .from("content_assets").insert({
        creator_id: creator.id,
        title,
        asset_type: "audio",
        storage_path: path,
        is_synthetic: true,
        ai_generated_label: true,
        approval_status: "pending",
        category: "ai_voice_note",
      }).select("*").single();
    if (error) throw error;

    await attachPersonaAndPack(supabase, asset.id, data.personaId, data.packId);
    await logAudit(userId, "ai.voice_generated", { type: "asset", id: asset.id }, {
      voice, chars: text.length,
    });

    // Signed URL so the UI can preview the result immediately
    const { data: signed } = await supabaseAdmin.storage
      .from("content-assets").createSignedUrl(path, 60 * 60);
    return { asset, previewUrl: signed?.signedUrl ?? null };
  });

/**
 * Queue an AI talking-head clip. Provider integration is deferred (MVP 4
 * scope): we insert a placeholder synthetic video asset in `pending`
 * approval so the workflow is testable end-to-end. A future job will
 * render the actual clip and attach the storage path.
 */
export const queueTalkingHead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    script: string;
    title?: string;
    personaId?: string;
    packId?: string;
    durationSeconds?: number;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const script = data.script.trim();
    if (script.length < 4) throw new Error("Script must be at least 4 characters.");
    if (script.length > 1000) throw new Error("Script must be under 1000 characters.");
    if (!data.personaId) throw new Error("Pick a persona so we know which avatar/voice to render.");
    const seconds = Math.min(60, Math.max(5, Math.floor(data.durationSeconds ?? 15)));

    // Twin consent + persona ownership + pack membership (video modality).
    await assertTwinPolicy(supabase, creator.id, "video", data.personaId, data.packId ?? null);

    // Resolve HeyGen avatar/voice: persona override → workspace defaults → error.
    const { data: persona, error: pErr } = await supabase
      .from("personas")
      .select("id, heygen_avatar_id, heygen_voice_id")
      .eq("id", data.personaId)
      .maybeSingle();
    if (pErr) throw pErr;
    const avatarId =
      (persona?.heygen_avatar_id?.trim() as string | undefined) ||
      process.env.HEYGEN_DEFAULT_AVATAR_ID ||
      null;
    const voiceId =
      (persona?.heygen_voice_id?.trim() as string | undefined) ||
      process.env.HEYGEN_DEFAULT_VOICE_ID ||
      null;
    if (!avatarId) throw new Error("This persona has no HeyGen avatar ID — set one in Persona → Twin tab, or configure HEYGEN_DEFAULT_AVATAR_ID.");

    // 1) Generate TTS audio via existing Lovable AI gateway pipeline.
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const ttsRes = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: script,
        voice: (voiceId as string) || "alloy",
        response_format: "mp3",
      }),
    });
    if (!ttsRes.ok) {
      const err = await ttsRes.text().catch(() => "");
      if (ttsRes.status === 429) throw new Error("Rate limited — try again in a moment.");
      if (ttsRes.status === 402) throw new Error("AI credits exhausted. Top up in workspace billing.");
      throw new Error(`Voice generation failed (${ttsRes.status}): ${err.slice(0, 200)}`);
    }
    const audioBuf = new Uint8Array(await ttsRes.arrayBuffer());

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ttsPath = `${creator.id}/generated/tts-${Date.now()}.mp3`;
    const { error: ttsUpErr } = await supabaseAdmin.storage
      .from("content-assets")
      .upload(ttsPath, audioBuf, { contentType: "audio/mpeg", upsert: false });
    if (ttsUpErr) throw ttsUpErr;

    // HeyGen needs a publicly-fetchable URL for the audio — signed URL, 6h.
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("content-assets")
      .createSignedUrl(ttsPath, 60 * 60 * 6);
    if (signErr || !signed?.signedUrl) throw signErr ?? new Error("Failed to sign TTS URL");

    const title = (data.title?.trim() || `AI talking-head — ${new Date().toISOString().slice(0, 10)}`).slice(0, 120);

    // 2) Create the placeholder asset (rendering) so we can correlate the webhook.
    const { data: asset, error: insErr } = await supabase
      .from("content_assets").insert({
        creator_id: creator.id,
        title,
        asset_type: "video",
        is_synthetic: true,
        ai_generated_label: true,
        approval_status: "pending",
        category: "ai_talking_head_rendering",
        provider: "heygen",
        provider_status: "submitted",
        render_started_at: new Date().toISOString(),
        metadata: { tts_path: ttsPath, seconds, avatar_id: avatarId, voice_id: voiceId ?? null } as any,
      }).select("*").single();
    if (insErr) throw insErr;
    await attachPersonaAndPack(supabase, asset.id, data.personaId, data.packId);

    // 3) Submit to HeyGen. On failure, mark the asset failed but keep the TTS for retry visibility.
    try {
      const { submitTalkingHead } = await import("./heygen.server");
      const { videoId } = await submitTalkingHead({
        avatarId,
        audioUrl: signed.signedUrl,
        title,
      });
      await supabase.from("content_assets")
        .update({ provider_job_id: videoId, provider_status: "processing" })
        .eq("id", asset.id);
      await logAudit(userId, "ai.talking_head_submitted", { type: "asset", id: asset.id }, {
        chars: script.length, seconds, provider: "heygen", video_id: videoId,
      });
      return { asset: { ...asset, provider_job_id: videoId }, status: "rendering" as const };
    } catch (e: any) {
      const msg = e?.message ?? "HeyGen submit failed";
      await supabase.from("content_assets")
        .update({
          approval_status: "rejected",
          category: "ai_talking_head_failed",
          provider_status: "failed",
          provider_error: msg.slice(0, 500),
        })
        .eq("id", asset.id);
      // Best-effort cleanup of the orphan TTS
      await supabaseAdmin.storage.from("content-assets").remove([ttsPath]).catch(() => {});
      throw new Error(msg);
    }
  });

/**
 * List recent talking-head jobs for the current creator with a derived
 * UI status ("queued" | "rendering" | "completed" | "approved" | "failed").
 * The Talking head tab polls this while any job is non-terminal.
 */
export const listTalkingHeadJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const { data, error } = await supabase
      .from("content_assets")
      .select("id, title, created_at, approval_status, category, storage_path, provider, provider_status, provider_error, provider_job_id, render_started_at, render_completed_at")
      .eq("creator_id", creator.id)
      .eq("asset_type", "video")
      .eq("is_synthetic", true)
      .ilike("category", "ai_talking_head%")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;

    type Status = "queued" | "rendering" | "completed" | "approved" | "failed";
    const jobs = (data ?? []).map((r: any) => {
      let status: Status = "queued";
      if (r.approval_status === "approved") status = "approved";
      else if (r.approval_status === "rejected" || r.approval_status === "blocked") status = "failed";
      else if (r.storage_path && r.approval_status === "pending") status = "completed";
      else if (r.category === "ai_talking_head_rendering") status = "rendering";
      else if (r.category === "ai_talking_head_failed") status = "failed";
      else if (r.category === "ai_talking_head_queued") status = "queued";
      return {
        id: r.id as string,
        title: r.title as string,
        created_at: r.created_at as string,
        approval_status: r.approval_status as string | null,
        status,
        provider: (r.provider as string | null) ?? null,
        provider_status: (r.provider_status as string | null) ?? null,
        provider_error: (r.provider_error as string | null) ?? null,
        render_started_at: (r.render_started_at as string | null) ?? null,
        render_completed_at: (r.render_completed_at as string | null) ?? null,
      };
    });
    return { jobs };
  });

/**
 * List personas + packs for the AI generate picker.
 */
export const listGenerateTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const [{ data: personas }, { data: packs }] = await Promise.all([
      supabase.from("personas")
        .select("id, slug, display_name, kind, sort_order")
        .eq("creator_id", creator.id).order("sort_order"),
      supabase.from("content_packs")
        .select("id, name, pack_type, status")
        .eq("creator_id", creator.id).order("sort_order"),
    ]);
    return { creator, personas: personas ?? [], packs: packs ?? [] };
  });