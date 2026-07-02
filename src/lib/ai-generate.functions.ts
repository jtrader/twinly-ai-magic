import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

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
    const seconds = Math.min(60, Math.max(5, Math.floor(data.durationSeconds ?? 15)));

    const title = (data.title?.trim() || `AI talking-head — ${new Date().toISOString().slice(0, 10)}`).slice(0, 120);
    const { data: asset, error } = await supabase
      .from("content_assets").insert({
        creator_id: creator.id,
        title,
        asset_type: "video",
        is_synthetic: true,
        ai_generated_label: true,
        approval_status: "pending",
        category: "ai_talking_head_queued",
      }).select("*").single();
    if (error) throw error;

    await attachPersonaAndPack(supabase, asset.id, data.personaId, data.packId);
    await logAudit(userId, "ai.talking_head_queued", { type: "asset", id: asset.id }, {
      chars: script.length, seconds,
    });
    return { asset, status: "queued" as const };
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
      .select("id, title, created_at, approval_status, category, storage_path")
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
      else if (r.category === "ai_talking_head_queued") status = "queued";
      return {
        id: r.id as string,
        title: r.title as string,
        created_at: r.created_at as string,
        approval_status: r.approval_status as string | null,
        status,
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