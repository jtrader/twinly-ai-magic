import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertIdLevel } from "./identity-verification.functions";

export const getPayoutsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: creator } = await supabase
      .from("creators")
      .select("id, handle, stage_name")
      .eq("user_id", userId)
      .maybeSingle();

    if (!creator) {
      return {
        creator: null,
        subscribers: { active: 0, canceled: 0 },
        totals: { mtd_cents: 0, lifetime_cents: 0, pending_cents: 0 },
        nextPayout: null,
        transactions: [] as any[],
        subscriptions: [] as any[],
      };
    }

    // §4 point-of-action: receiving payouts requires Level 2 (verified
    // adult + monetizing creator). Non-creator callers short-circuit above,
    // so this only runs for the creator's own account. Fail closed if the
    // verification lapsed, was redacted, or the level was never granted.
    await assertIdLevel(context as any, 2);

    const [{ data: txs }, { data: subs }] = await Promise.all([
      supabase
        .from("transactions")
        .select("id, created_at, kind, status, amount_cents, persona_id, asset_id, fan_id")
        .eq("creator_id", creator.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("subscriptions")
        .select("id, created_at, tier, status, current_period_end, fan_id")
        .eq("creator_id", creator.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    let mtd = 0;
    let lifetime = 0;
    let pending = 0;
    for (const t of txs ?? []) {
      const amt = t.amount_cents ?? 0;
      if (t.status === "succeeded") {
        lifetime += amt;
        if (new Date(t.created_at) >= monthStart) mtd += amt;
      } else if (t.status === "stub") {
        pending += amt;
      }
    }

    const active = (subs ?? []).filter((s) => s.status === "active").length;
    const canceled = (subs ?? []).filter((s) => s.status !== "active").length;

    // Placeholder payout: 1st of next month
    const nextPayoutDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    return {
      creator,
      subscribers: { active, canceled },
      totals: { mtd_cents: mtd, lifetime_cents: lifetime, pending_cents: pending },
      nextPayout: {
        scheduled_for: nextPayoutDate.toISOString(),
        amount_cents: mtd,
        status: "not_configured" as const,
        method: null as string | null,
      },
      transactions: txs ?? [],
      subscriptions: subs ?? [],
    };
  });