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
  try { json = JSON.parse(text); } catch { throw new Error("HeyGen returned non-JSON response."); }
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
  const res = await fetch(`${API_BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
    headers: { "X-Api-Key": key, Accept: "application/json" },
  });
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
  try { return timingSafeEqual(a, b); } catch { return false; }
}