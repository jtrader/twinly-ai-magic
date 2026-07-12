import { createFileRoute } from "@tanstack/react-router";
import { closePollAndNotify } from "@/lib/polls.functions";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const MAX_ROWS_PER_RUN = 50;

/**
 * Scheduled poll auto-close. This app has no background job runner, so —
 * same pattern as api/public/cron/heygen-poll.ts — point any external
 * scheduler (cron-job.org, GitHub Actions schedule, host cron, etc.) at this
 * URL every few minutes with:
 *   Authorization: Bearer <POLL_AUTO_CLOSE_SECRET>
 *
 * This is a bulk safety net; individual votes/checkouts also lazily close an
 * overdue poll the moment anyone tries to interact with it
 * (closeIfPastDeadline in polls.functions.ts), so correctness doesn't
 * actually depend on this endpoint ever being called — it just means a poll
 * with no further activity closes and notifies voters in a timely way.
 */
export const Route = createFileRoute("/api/public/cron/close-polls")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const secret = process.env.POLL_AUTO_CLOSE_SECRET;
  if (!secret) return json(500, { error: "POLL_AUTO_CLOSE_SECRET is not configured." });

  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (provided !== secret) return json(401, { error: "Unauthorized" });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: due, error } = await supabaseAdmin
    .from("polls")
    .select("id")
    .eq("status", "active")
    .not("closes_at", "is", null)
    .lt("closes_at", new Date().toISOString())
    .limit(MAX_ROWS_PER_RUN);
  if (error) return json(500, { error: error.message });
  if (!due?.length) return json(200, { checked: 0, closed: 0 });

  let closed = 0;
  for (const row of due) {
    try {
      await closePollAndNotify(supabaseAdmin, row.id);
      closed++;
    } catch (e: any) {
      console.error("close-polls: failed to close", row.id, e);
    }
  }
  return json(200, { checked: due.length, closed });
}
