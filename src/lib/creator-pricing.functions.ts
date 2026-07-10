import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Tier = "base" | "plus" | "vip";
const ALLOWED_TIERS: readonly Tier[] = ["base", "plus", "vip"];

export const getCreatorPricing = createServerFn({ method: "GET" })
  .validator((d: { creatorId: string }) => d)
  .handler(async ({ data }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: rows, error } = await supabase
      .from("creator_tier_prices")
      .select("tier, amount_cents, currency")
      .eq("creator_id", data.creatorId)
      .eq("active", true);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      tier: r.tier as Tier,
      amountCents: r.amount_cents as number,
      currency: r.currency as string,
    }));
  });

export const listMyCreatorPricing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("creator_tier_prices")
      .select("tier, amount_cents, currency, active")
      .eq("creator_id", data.creatorId);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      tier: r.tier as Tier,
      amountCents: r.amount_cents as number,
      currency: r.currency as string,
      active: !!r.active,
    }));
  });

export const upsertCreatorPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId: string; tier: Tier; amountCents: number; active?: boolean }) => {
    if (!ALLOWED_TIERS.includes(d.tier)) throw new Error("Invalid tier");
    if (!Number.isInteger(d.amountCents) || d.amountCents < 50) throw new Error("Amount must be at least 50 cents");
    if (d.amountCents > 100000000) throw new Error("Amount too high");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("creator_tier_prices").upsert(
      {
        creator_id: data.creatorId,
        tier: data.tier,
        amount_cents: data.amountCents,
        currency: "usd",
        active: data.active ?? true,
      },
      { onConflict: "creator_id,tier" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });