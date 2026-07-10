import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

function isoFromUnix(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

async function notify(userId: string, type: string, title: string, body?: string, linkPath?: string) {
  const sb = getSupabase();
  try {
    await (sb.from("notifications") as any).insert({
      user_id: userId, type, title, body: body ?? null, link_path: linkPath ?? null,
    });
  } catch (e) {
    console.error("notify failed", type, e);
  }
}

function tierLabel(tier: string) {
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : tier;
}

async function handleSubscriptionUpsert(subscription: any, env: StripeEnv) {
  const meta = subscription.metadata ?? {};

  // Twinly+ platform membership.
  if (meta.kind === "twinly_plus") {
    const userId = meta.userId;
    if (!userId) return;
    const item = subscription.items?.data?.[0];
    const price = item?.price;
    const priceId = price?.lookup_key ?? price?.id;
    const productId = typeof price?.product === "string" ? price.product : price?.product?.id;
    const periodStart = item?.current_period_start ?? subscription.current_period_start;
    const periodEnd = item?.current_period_end ?? subscription.current_period_end;
    const sb = getSupabase();
    const { data: prev } = await (sb.from("platform_subscriptions") as any)
      .select("id").eq("stripe_subscription_id", subscription.id).maybeSingle();
    await (sb.from("platform_subscriptions") as any).upsert({
      user_id: userId,
      price_id: priceId,
      product_id: productId,
      status: subscription.status,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      cancel_at_period_end: !!subscription.cancel_at_period_end,
      current_period_start: isoFromUnix(periodStart),
      current_period_end: isoFromUnix(periodEnd),
      amount_cents: price?.unit_amount ?? null,
      currency: price?.currency ?? "usd",
      environment: env,
      updated_at: new Date().toISOString(),
    }, { onConflict: "stripe_subscription_id" });
    if (!prev) {
      await notify(userId, "twinly_plus_active", "Twinly+ is active", "You now get 10% off tips, ad-free browsing, and the Twinly+ badge.", "/pricing");
    }
    return;
  }

  const userId = meta.userId;
  const creatorId = meta.creatorId;
  const tier = meta.tier;
  if (!userId || !creatorId || !tier) {
    console.error("Missing metadata on subscription", subscription.id);
    return;
  }
  const item = subscription.items?.data?.[0];
  const price = item?.price;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  const sb = getSupabase();
  const { data: prev } = await (sb.from("subscriptions") as any)
    .select("id, tier, cancel_at_period_end").eq("stripe_subscription_id", subscription.id).maybeSingle();
  const isNew = !prev;
  const tierChanged = prev && prev.tier !== tier;
  const cancelScheduledNow = !!subscription.cancel_at_period_end && !(prev?.cancel_at_period_end);
  const reactivated = prev?.cancel_at_period_end && !subscription.cancel_at_period_end;

  await (sb.from("subscriptions") as any).upsert(
    {
      fan_id: userId,
      creator_id: creatorId,
      tier,
      status: subscription.status,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      environment: env,
      cancel_at_period_end: !!subscription.cancel_at_period_end,
      current_period_start: isoFromUnix(periodStart),
      current_period_end: isoFromUnix(periodEnd),
      amount_cents: price?.unit_amount ?? null,
      currency: price?.currency ?? "usd",
      provider_ref: subscription.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );

  // On brand-new subscription: auto-follow creator + notify both sides.
  if (isNew) {
    try {
      await (sb.from("creator_follows") as any).upsert(
        { fan_id: userId, creator_id: creatorId },
        { onConflict: "fan_id,creator_id" },
      );
    } catch (e) { console.error("auto-follow failed", e); }

    const { data: creator } = await (sb.from("creators") as any)
      .select("user_id, stage_name, handle").eq("id", creatorId).maybeSingle();
    const creatorName = creator?.stage_name ?? creator?.handle ?? "Creator";
    await notify(userId, "subscription_started",
      `You're now subscribed to ${creatorName}`,
      `${tierLabel(tier)} tier active. Renews automatically — cancel anytime from Billing portal.`,
      `/creators/${creator?.handle ?? ""}`);
    if (creator?.user_id) {
      const { data: fan } = await (sb.from("profiles") as any)
        .select("display_name").eq("id", userId).maybeSingle();
      const fanName = fan?.display_name ?? "A fan";
      await notify(creator.user_id, "new_subscriber",
        `${fanName} subscribed to ${tierLabel(tier)}`,
        undefined, "/studio");
    }
  } else if (tierChanged) {
    const { data: creator } = await (sb.from("creators") as any)
      .select("user_id, stage_name, handle").eq("id", creatorId).maybeSingle();
    const creatorName = creator?.stage_name ?? creator?.handle ?? "Creator";
    await notify(userId, "subscription_changed",
      `Plan changed for ${creatorName}`,
      `Now on the ${tierLabel(tier)} tier.`,
      `/creators/${creator?.handle ?? ""}`);
    if (creator?.user_id) {
      await notify(creator.user_id, "subscriber_changed",
        `A subscriber changed plan to ${tierLabel(tier)}`,
        undefined, "/studio");
    }
  } else if (cancelScheduledNow) {
    await notify(userId, "subscription_ending",
      "Subscription set to end",
      periodEnd ? `Access continues until ${new Date(periodEnd * 1000).toLocaleDateString()}.` : "Access continues until the end of your paid period.",
      "/account/subscriptions");
  } else if (reactivated) {
    await notify(userId, "subscription_reactivated",
      "Subscription reactivated",
      "Renewal is back on — thanks!",
      "/account/subscriptions");
  }
}

async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
  const sb = getSupabase();
  const meta = subscription.metadata ?? {};
  if (meta.kind === "twinly_plus") {
    await (sb.from("platform_subscriptions") as any)
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("stripe_subscription_id", subscription.id).eq("environment", env);
    if (meta.userId) await notify(meta.userId, "twinly_plus_ended", "Twinly+ ended", "You can resubscribe anytime from the Pricing page.", "/pricing");
    return;
  }
  await (sb.from("subscriptions") as any)
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

async function handleCheckoutCompleted(session: any, env: StripeEnv) {
  if (session.mode !== "payment") return; // subs are handled via customer.subscription.* events
  const meta = session.metadata ?? {};
  const kind = meta.kind;
  if (!kind) return;
  const sb = getSupabase();
  const amount = session.amount_total ?? 0;
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

  if (kind === "ppv") {
    const { userId, creatorId, assetId } = meta;
    if (!userId || !creatorId || !assetId) return;
    try {
      const { data: dup } = await (sb.from("transactions") as any)
        .select("id").eq("stripe_checkout_session_id", session.id).maybeSingle();
      if (dup) return;
      await (sb.from("transactions") as any).insert({
        fan_id: userId, creator_id: creatorId, asset_id: assetId,
        amount_cents: amount, kind: "ppv", status: "succeeded",
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId ?? null,
        environment: env,
      });
      await notify(userId, "unlock_purchased", "Unlock complete", "You've unlocked new content. Enjoy!", "/fan/unlocks");
      const { data: creator } = await (sb.from("creators") as any).select("user_id").eq("id", creatorId).maybeSingle();
      if (creator?.user_id) {
        await notify(creator.user_id, "content_unlocked", "Someone unlocked your content", `$${(amount / 100).toFixed(2)} · thanks for the sale.`, "/studio");
      }
    } catch (e) { console.error("ppv insert failed", e); }
    return;
  }

  if (kind === "tip") {
    const { userId, creatorId } = meta;
    if (!userId || !creatorId) return;
    try {
      const { data: dup } = await (sb.from("transactions") as any)
        .select("id").eq("stripe_checkout_session_id", session.id).maybeSingle();
      if (dup) return;
      await (sb.from("transactions") as any).insert({
        fan_id: userId, creator_id: creatorId,
        amount_cents: amount, kind: "tip", status: "succeeded",
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId ?? null,
        environment: env,
      });
      const { data: creator } = await (sb.from("creators") as any).select("user_id, stage_name, handle").eq("id", creatorId).maybeSingle();
      const creatorName = creator?.stage_name ?? creator?.handle ?? "Creator";
      await notify(userId, "tip_sent", `Tip sent to ${creatorName}`, `$${(amount / 100).toFixed(2)}. Thanks for supporting creators!`, `/creators/${creator?.handle ?? ""}`);
      if (creator?.user_id) {
        const { data: fan } = await (sb.from("profiles") as any).select("display_name").eq("id", userId).maybeSingle();
        await notify(creator.user_id, "tip_received", `${fan?.display_name ?? "A fan"} tipped $${(amount / 100).toFixed(2)}`, undefined, "/studio");
      }
    } catch (e) { console.error("tip insert failed", e); }
    return;
  }
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpsert(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object, env);
      break;
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object, env);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});