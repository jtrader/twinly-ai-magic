import { createFileRoute } from "@tanstack/react-router";
import { verifyHeygenSignature, applyHeygenOutcome } from "@/lib/heygen.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Webhook-Signature, X-Heygen-Signature",
  "Access-Control-Max-Age": "86400",
} as const;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/**
 * HeyGen webhook receiver. HeyGen posts `avatar_video.success` /
 * `avatar_video.fail` events (and legacy `video_generate.*` for some
 * accounts). We verify the shared-secret HMAC, download the finished MP4
 * into `content-assets`, and update the placeholder asset row so the
 * creator can review it in the vault.
 */
export const Route = createFileRoute("/api/public/hooks/heygen")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        const rawBody = await request.text();
        const sig =
          request.headers.get("x-webhook-signature") ??
          request.headers.get("x-heygen-signature") ??
          request.headers.get("signature");
        if (!verifyHeygenSignature(rawBody, sig)) {
          return json(401, { error: "Invalid signature" });
        }

        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return json(400, { error: "Invalid JSON" });
        }

        const eventType: string = payload?.event_type ?? payload?.type ?? "";
        const eventData = payload?.event_data ?? payload?.data ?? payload ?? {};
        const videoId: string | undefined = eventData?.video_id ?? eventData?.videoId;
        if (!videoId) return json(400, { error: "Missing video_id" });

        const isSuccess = eventType.includes("success") || eventType.includes("completed");
        const isFailure = eventType.includes("fail") || eventType.includes("error");
        if (!isSuccess && !isFailure) {
          // Accept but ignore intermediate events.
          return json(200, { ok: true, ignored: eventType });
        }

        if (isFailure) {
          const msg =
            eventData?.msg ?? eventData?.error ?? eventData?.message ?? "HeyGen render failed";
          const result = await applyHeygenOutcome(videoId, {
            kind: "failure",
            message: String(msg),
          });
          if (!result.ok)
            return json(result.reason === "unknown_video_id" ? 404 : 500, { error: result.reason });
          return json(200, { ok: true });
        }

        const videoUrl: string | undefined = eventData?.url ?? eventData?.video_url;
        if (!videoUrl) return json(400, { error: "Missing video URL" });

        const result = await applyHeygenOutcome(videoId, { kind: "success", videoUrl });
        if (!result.ok) {
          const status =
            result.reason === "unknown_video_id"
              ? 404
              : result.reason === "download_failed"
                ? 502
                : 500;
          return json(status, { error: result.reason });
        }
        return json(200, { ok: true, ...(result.reason ? { note: result.reason } : {}) });
      },
    },
  },
});
