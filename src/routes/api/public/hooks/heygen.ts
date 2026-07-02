import { createFileRoute } from "@tanstack/react-router";
import { verifyHeygenSignature } from "@/lib/heygen.server";

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
        try { payload = JSON.parse(rawBody); } catch { return json(400, { error: "Invalid JSON" }); }

        const eventType: string =
          payload?.event_type ?? payload?.type ?? "";
        const eventData = payload?.event_data ?? payload?.data ?? payload ?? {};
        const videoId: string | undefined = eventData?.video_id ?? eventData?.videoId;
        if (!videoId) return json(400, { error: "Missing video_id" });

        const isSuccess = eventType.includes("success") || eventType.includes("completed");
        const isFailure = eventType.includes("fail") || eventType.includes("error");
        if (!isSuccess && !isFailure) {
          // Accept but ignore intermediate events.
          return json(200, { ok: true, ignored: eventType });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: asset, error: findErr } = await supabaseAdmin
          .from("content_assets")
          .select("*")
          .eq("provider", "heygen")
          .eq("provider_job_id", videoId)
          .maybeSingle();
        if (findErr) return json(500, { error: findErr.message });
        if (!asset) return json(404, { error: "Unknown video_id" });
        // Dedupe repeat deliveries.
        if ((asset as any).storage_path && isSuccess) {
          return json(200, { ok: true, dedup: true });
        }

        if (isFailure) {
          const msg = eventData?.msg ?? eventData?.error ?? eventData?.message ?? "HeyGen render failed";
          await supabaseAdmin.from("content_assets").update({
            approval_status: "rejected",
            category: "ai_talking_head_failed",
            provider_status: "failed",
            provider_error: String(msg).slice(0, 500),
            render_completed_at: new Date().toISOString(),
          } as any).eq("id", (asset as any).id);
          return json(200, { ok: true });
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
          await supabaseAdmin.from("content_assets").update({
            approval_status: "rejected",
            category: "ai_talking_head_failed",
            provider_status: "consent_revoked",
            provider_error: "Digital Twin consent for video was revoked before render completion.",
            render_completed_at: new Date().toISOString(),
          } as any).eq("id", (asset as any).id);
          return json(200, { ok: true, discarded: "consent_revoked" });
        }

        const videoUrl: string | undefined = eventData?.url ?? eventData?.video_url;
        if (!videoUrl) return json(400, { error: "Missing video URL" });

        // Download the finished MP4 with a size cap.
        const dl = await fetch(videoUrl);
        if (!dl.ok) {
          await supabaseAdmin.from("content_assets").update({
            provider_status: "download_failed",
            provider_error: `Download failed (${dl.status})`,
          } as any).eq("id", (asset as any).id);
          return json(502, { error: "Download failed" });
        }
        const contentType = dl.headers.get("content-type") ?? "video/mp4";
        if (!contentType.startsWith("video/")) {
          return json(415, { error: `Unexpected content-type ${contentType}` });
        }
        const buf = new Uint8Array(await dl.arrayBuffer());
        if (buf.byteLength > 200 * 1024 * 1024) {
          await supabaseAdmin.from("content_assets").update({
            approval_status: "rejected",
            category: "ai_talking_head_failed",
            provider_status: "failed",
            provider_error: "oversize",
          } as any).eq("id", (asset as any).id);
          return json(413, { error: "Video too large" });
        }

        const path = `${(asset as any).creator_id}/generated/talking-head-${(asset as any).id}.mp4`;
        const { error: upErr } = await supabaseAdmin.storage
          .from("content-assets")
          .upload(path, buf, { contentType, upsert: true });
        if (upErr) {
          await supabaseAdmin.from("content_assets").update({
            provider_status: "storage_failed",
            provider_error: upErr.message.slice(0, 500),
          } as any).eq("id", (asset as any).id);
          return json(500, { error: upErr.message });
        }

        await supabaseAdmin.from("content_assets").update({
          storage_path: path,
          category: "ai_talking_head_ready",
          provider_status: "completed",
          provider_error: null,
          render_completed_at: new Date().toISOString(),
          size_bytes: buf.byteLength,
          mime_type: contentType,
        } as any).eq("id", (asset as any).id);

        return json(200, { ok: true });
      },
    },
  },
});