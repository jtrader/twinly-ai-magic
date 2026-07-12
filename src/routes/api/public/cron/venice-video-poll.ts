import { createFileRoute } from "@tanstack/react-router";
import { fetchVeniceVideoStatus, applyVeniceVideoOutcome } from "@/lib/venice.server";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const MAX_ROWS_PER_RUN = 25;

/**
 * Venice video generation is inherently async (POST /video/queue returns a
 * queue_id immediately; the render itself takes minutes) and Venice has no
 * documented webhook for completion — unlike HeyGen, polling is the only
 * completion-discovery mechanism, not just a safety net for a dropped push.
 *
 * Point any external scheduler (cron-job.org, GitHub Actions schedule,
 * host cron, etc.) at this URL every minute or two with:
 *   Authorization: Bearer <VENICE_VIDEO_POLL_SECRET>
 */
export const Route = createFileRoute("/api/public/cron/venice-video-poll")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const secret = process.env.VENICE_VIDEO_POLL_SECRET;
  if (!secret) return json(500, { error: "VENICE_VIDEO_POLL_SECRET is not configured." });

  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (provided !== secret) return json(401, { error: "Unauthorized" });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: processing, error } = await supabaseAdmin
    .from("content_assets")
    .select("id, provider_job_id, provider_model")
    .eq("provider", "venice_video")
    .eq("provider_status", "processing")
    .order("render_started_at", { ascending: true })
    .limit(MAX_ROWS_PER_RUN);
  if (error) return json(500, { error: error.message });
  if (!processing?.length) return json(200, { checked: 0, resolved: 0 });

  let resolved = 0;
  const results: { queueId: string; outcome: string }[] = [];

  for (const row of processing) {
    const queueId = (row as any).provider_job_id as string | null;
    const model = (row as any).provider_model as string | null;
    if (!queueId || !model) continue;
    try {
      const status = await fetchVeniceVideoStatus(queueId, model);
      if (status.status === "completed") {
        const r = await applyVeniceVideoOutcome(queueId, { kind: "success", videoBytes: status.videoBytes });
        results.push({ queueId, outcome: r.ok ? "resolved" : `failed:${r.reason}` });
        if (r.ok) resolved++;
      } else if (status.status === "failed") {
        const r = await applyVeniceVideoOutcome(queueId, { kind: "failure", message: status.error ?? "Venice video render failed" });
        results.push({ queueId, outcome: r.ok ? "resolved_failure" : `failed:${r.reason}` });
        if (r.ok) resolved++;
      } else {
        // Still genuinely rendering — leave it, re-check next run.
        results.push({ queueId, outcome: `still_${status.status}` });
      }
    } catch (e: any) {
      results.push({ queueId, outcome: `poll_error:${e?.message?.slice(0, 120) ?? "unknown"}` });
    }
  }

  return json(200, { checked: processing.length, resolved, results });
}
