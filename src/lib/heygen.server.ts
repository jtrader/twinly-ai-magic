import { createHmac, timingSafeEqual } from "node:crypto";

const API_BASE = "https://api.heygen.com";

/** Submit a talking-head render backed by our own uploaded audio track. */
export async function submitTalkingHead(input: {
  avatarId: string;
  audioUrl: string;
  title: string;
  callbackUrl?: string;
}): Promise<{ videoId: string }> {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY is not configured.");

  const body = {
    video_inputs: [
      {
        character: {
          type: "avatar",
          avatar_id: input.avatarId,
          avatar_style: "normal",
        },
        voice: {
          type: "audio",
          audio_url: input.audioUrl,
        },
      },
    ],
    title: input.title.slice(0, 120),
    dimension: { width: 720, height: 1280 },
    callback_url: input.callbackUrl,
  };

  const res = await fetch(`${API_BASE}/v2/video/generate`, {
    method: "POST",
    headers: {
      "X-Api-Key": key,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HeyGen submit failed (${res.status}): ${text.slice(0, 300)}`);
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("HeyGen returned non-JSON response.");
  }
  const videoId = json?.data?.video_id ?? json?.video_id;
  if (!videoId) throw new Error(`HeyGen response missing video_id: ${text.slice(0, 200)}`);
  return { videoId: String(videoId) };
}

/** Poll HeyGen for a render's status. Used by the safety-net poller. */
export async function fetchHeygenStatus(videoId: string): Promise<{
  status: "waiting" | "pending" | "processing" | "completed" | "failed" | string;
  videoUrl: string | null;
  error: string | null;
}> {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY is not configured.");
  const res = await fetch(
    `${API_BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
    {
      headers: { "X-Api-Key": key, Accept: "application/json" },
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`HeyGen status failed (${res.status}): ${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  const data = json?.data ?? {};
  return {
    status: String(data.status ?? "pending"),
    videoUrl: (data.video_url as string | null) ?? null,
    error: data.error ? String(data.error?.message ?? data.error) : null,
  };
}

/** List avatars available to this HeyGen account, for a picker UI instead of pasting raw IDs. */
export async function listHeygenAvatars(): Promise<
  { avatarId: string; name: string; previewImageUrl: string | null }[]
> {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY is not configured.");
  const res = await fetch(`${API_BASE}/v2/avatars`, {
    headers: { "X-Api-Key": key, Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HeyGen avatar list failed (${res.status}): ${text.slice(0, 200)}`);
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("HeyGen returned non-JSON response.");
  }
  const avatars = json?.data?.avatars ?? [];
  return avatars.map((a: any) => ({
    avatarId: String(a.avatar_id),
    name: String(a.avatar_name ?? a.avatar_id),
    previewImageUrl: (a.preview_image_url as string | null) ?? null,
  }));
}

/**
 * Applies a HeyGen render outcome (success or failure) to its content_assets
 * row. Shared by the webhook route (push) and the safety-net poller (pull)
 * so consent re-verification, dedup, download and storage handling live in
 * exactly one place regardless of which path discovers the result first.
 */
export async function applyHeygenOutcome(
  videoId: string,
  outcome: { kind: "success"; videoUrl: string } | { kind: "failure"; message: string },
): Promise<{ ok: boolean; reason?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: asset, error: findErr } = await supabaseAdmin
    .from("content_assets")
    .select("*")
    .eq("provider", "heygen")
    .eq("provider_job_id", videoId)
    .maybeSingle();
  if (findErr) return { ok: false, reason: findErr.message };
  if (!asset) return { ok: false, reason: "unknown_video_id" };

  // Dedupe: webhook and poller can both discover the same completed render.
  if ((asset as any).storage_path && outcome.kind === "success") {
    return { ok: true, reason: "dedup" };
  }

  if (outcome.kind === "failure") {
    await supabaseAdmin
      .from("content_assets")
      .update({
        approval_status: "rejected",
        category: "ai_talking_head_failed",
        provider_status: "failed",
        provider_error: outcome.message.slice(0, 500),
        render_completed_at: new Date().toISOString(),
      } as any)
      .eq("id", (asset as any).id);
    return { ok: true };
  }

  // Success — re-verify twin consent (creator may have revoked mid-render).
  const { data: consent } = await supabaseAdmin
    .from("digital_twin_consent")
    .select("signed_at, revoked_at, video_ok, likeness_ok")
    .eq("creator_id", (asset as any).creator_id)
    .maybeSingle();
  const consentOk =
    !!consent?.signed_at && !consent?.revoked_at && !!consent?.video_ok && !!consent?.likeness_ok;
  if (!consentOk) {
    await supabaseAdmin
      .from("content_assets")
      .update({
        approval_status: "rejected",
        category: "ai_talking_head_failed",
        provider_status: "consent_revoked",
        provider_error: "Digital Twin consent for video was revoked before render completion.",
        render_completed_at: new Date().toISOString(),
      } as any)
      .eq("id", (asset as any).id);
    return { ok: true, reason: "consent_revoked" };
  }

  const dl = await fetch(outcome.videoUrl);
  if (!dl.ok) {
    await supabaseAdmin
      .from("content_assets")
      .update({
        provider_status: "download_failed",
        provider_error: `Download failed (${dl.status})`,
      } as any)
      .eq("id", (asset as any).id);
    return { ok: false, reason: "download_failed" };
  }
  const contentType = dl.headers.get("content-type") ?? "video/mp4";
  if (!contentType.startsWith("video/")) {
    return { ok: false, reason: `unexpected_content_type:${contentType}` };
  }
  const buf = new Uint8Array(await dl.arrayBuffer());
  if (buf.byteLength > 200 * 1024 * 1024) {
    await supabaseAdmin
      .from("content_assets")
      .update({
        approval_status: "rejected",
        category: "ai_talking_head_failed",
        provider_status: "failed",
        provider_error: "oversize",
      } as any)
      .eq("id", (asset as any).id);
    return { ok: false, reason: "oversize" };
  }

  const path = `${(asset as any).creator_id}/generated/talking-head-${(asset as any).id}.mp4`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("content-assets")
    .upload(path, buf, { contentType, upsert: true });
  if (upErr) {
    await supabaseAdmin
      .from("content_assets")
      .update({
        provider_status: "storage_failed",
        provider_error: upErr.message.slice(0, 500),
      } as any)
      .eq("id", (asset as any).id);
    return { ok: false, reason: upErr.message };
  }

  await supabaseAdmin
    .from("content_assets")
    .update({
      storage_path: path,
      category: "ai_talking_head_ready",
      provider_status: "completed",
      provider_error: null,
      render_completed_at: new Date().toISOString(),
    } as any)
    .eq("id", (asset as any).id);

  return { ok: true };
}

/** Verify HeyGen webhook signature using our shared secret (HMAC-SHA256 over the raw body). */
export function verifyHeygenSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.HEYGEN_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  // HeyGen sends "sha256=<hex>" style headers in most configs — support both raw and prefixed.
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7).trim()
    : signatureHeader.trim();
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
