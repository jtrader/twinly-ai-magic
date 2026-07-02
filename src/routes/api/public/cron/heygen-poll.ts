import { createFileRoute } from "@tanstack/react-router";
import { fetchHeygenStatus, applyHeygenOutcome } from "@/lib/heygen.server";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// How long a render can sit in "processing" before we treat the webhook as
// possibly lost and poll HeyGen directly. HeyGen renders are usually done
// in 1-5 minutes; 10 gives real headroom before we spend an API call.
const STUCK_AFTER_MINUTES = 10;
const MAX_ROWS_PER_RUN = 25;

/**
 * Safety-net for HeyGen webhook delivery. HeyGen's webhook is push-based and
 * can be dropped (network blip, endpoint briefly down, misconfigured
 * dashboard URL) — this route pulls status for any render stuck in
 * "processing" past a threshold and reconciles it through the exact same
 * `applyHeygenOutcome` path the webhook uses, so nothing is ever a second
 * code path with different consent/dedup handling.
 *
 * Point any external scheduler (cron-job.org, GitHub Actions schedule,
 * Vercel/host cron, etc.) at this URL every few minutes with:
 *   Authorization: Bearer <HEYGEN_POLL_SECRET>
 */
export const Route = createFileRoute("/api/public/cron/heygen-poll")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const secret = process.env.HEYGEN_POLL_SECRET;
  if (!secret) return json(500, { error: "HEYGEN_POLL_SECRET is not configured." });

  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (provided !== secret) return json(401, { error: "Unauthorized" });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cutoff = new Date(Date.now() - STUCK_AFTER_MINUTES * 60 * 1000).toISOString();

  const { data: stuck, error } = await supabaseAdmin
    .from("content_assets")
    .select("id, provider_job_id, render_started_at")
    .eq("provider", "heygen")
    .eq("provider_status", "processing")
    .lt("render_started_at", cutoff)
    .order("render_started_at", { ascending: true })
    .limit(MAX_ROWS_PER_RUN);
  if (error) return json(500, { error: error.message });
  if (!stuck?.length) return json(200, { checked: 0, reconciled: 0 });

  let reconciled = 0;
  const results: { videoId: string; outcome: string }[] = [];

  for (const row of stuck) {
    const videoId = (row as any).provider_job_id as string | null;
    if (!videoId) continue;
    try {
      const status = await fetchHeygenStatus(videoId);
      if (status.status === "completed" && status.videoUrl) {
        const r = await applyHeygenOutcome(videoId, { kind: "success", videoUrl: status.videoUrl });
        results.push({ videoId, outcome: r.ok ? "reconciled" : `failed:${r.reason}` });
        if (r.ok) reconciled++;
      } else if (status.status === "failed") {
        const r = await applyHeygenOutcome(videoId, {
          kind: "failure",
          message: status.error ?? "HeyGen render failed (discovered via poll)",
        });
        results.push({ videoId, outcome: r.ok ? "reconciled_failure" : `failed:${r.reason}` });
        if (r.ok) reconciled++;
      } else {
        // Still genuinely processing on HeyGen's side — leave it, don't
        // spam status flips. It'll be re-checked next run.
        results.push({ videoId, outcome: `still_${status.status}` });
      }
    } catch (e: any) {
      results.push({ videoId, outcome: `poll_error:${e?.message?.slice(0, 120) ?? "unknown"}` });
    }
  }

  return json(200, { checked: stuck.length, reconciled, results });
}
