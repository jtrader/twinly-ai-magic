import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMySubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("subscriptions")
      .select("id, creator_id, tier, status, current_period_end, cancel_at_period_end, environment, created_at, creators:creator_id(id, handle, stage_name, avatar_url, verification_status)")
      .eq("fan_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      creatorId: r.creator_id,
      tier: r.tier,
      status: r.status,
      currentPeriodEnd: r.current_period_end,
      cancelAtPeriodEnd: !!r.cancel_at_period_end,
      environment: (r.environment ?? "sandbox") as "sandbox" | "live",
      createdAt: r.created_at,
      handle: r.creators?.handle,
      stageName: r.creators?.stage_name,
      avatarUrl: r.creators?.avatar_url,
      verified: r.creators?.verification_status === "verified",
    }));
  });

export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { subscriptionId: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("id", data.subscriptionId)
      .eq("fan_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });