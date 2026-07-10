import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";

type CheckoutResult = { clientSecret: string } | { error: string };
type PortalResult = { url: string } | { error: string };
type OkResult = { ok: true } | { error: string };
type UpgradePreview = { amountDueCents: number; currency: string } | { error: string };

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId: string },
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error("Invalid userId");
  const found = await stripe.customers.search({
    query: `metadata['userId']:'${options.userId}'`,
    limit: 1,
  });
  if (found.data.length) return found.data[0].id;
  if (options.email) {
    const byEmail = await stripe.customers.list({ email: options.email, limit: 1 });
    if (byEmail.data.length) {
      const c = byEmail.data[0];
      if (c.metadata?.userId !== options.userId) {
        await stripe.customers.update(c.id, { metadata: { ...c.metadata, userId: options.userId } });
      }
      return c.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    metadata: { userId: options.userId },
  });
  return created.id;
}

const TIER_RANK: Record<string, number> = { base: 1, plus: 2, vip: 3 };

async function getSupabaseAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const createCreatorSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    creatorId: string;
    tier: "base" | "plus" | "vip";
    returnUrl: string;
    environment: StripeEnv;
  }) => {
    if (!["base", "plus", "vip"].includes(d.tier)) throw new Error("Invalid tier");
    return d;
  })
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    try {
      const { supabase, userId } = context;

      const { data: price, error: priceErr } = await supabase
        .from("creator_tier_prices")
        .select("amount_cents, currency, active")
        .eq("creator_id", data.creatorId)
        .eq("tier", data.tier)
        .maybeSingle();
      if (priceErr) return { error: priceErr.message };
      if (!price || !(price as any).active) return { error: "This tier is not available for this creator." };

      const { data: creator, error: creatorErr } = await supabase
        .from("creators")
        .select("stage_name, handle")
        .eq("id", data.creatorId)
        .maybeSingle();
      if (creatorErr) return { error: creatorErr.message };
      if (!creator) return { error: "Creator not found." };

      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email ?? undefined;

      const stripe = createStripeClient(data.environment);
      const customerId = await resolveOrCreateCustomer(stripe, { email, userId });

      const tierLabel = data.tier.charAt(0).toUpperCase() + data.tier.slice(1);
      const productName = `${(creator as any).stage_name ?? (creator as any).handle} — ${tierLabel} tier`;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        ui_mode: "embedded_page" as any,
        return_url: data.returnUrl,
        customer: customerId,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: (price as any).currency ?? "usd",
            unit_amount: (price as any).amount_cents,
            recurring: { interval: "month" },
            product_data: { name: productName },
          } as any,
        }],
        automatic_tax: { enabled: true },
        subscription_data: {
          metadata: {
            userId,
            creatorId: data.creatorId,
            tier: data.tier,
          },
        },
        metadata: {
          userId,
          creatorId: data.creatorId,
          tier: data.tier,
        },
      });

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const createBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { returnUrl: string; environment: StripeEnv }) => d)
  .handler(async ({ data, context }): Promise<PortalResult> => {
    try {
      const { supabase, userId } = context;
      // Any Stripe customer we have on file works — creator subs OR Twinly+.
      const [creatorSub, platformSub] = await Promise.all([
        supabase.from("subscriptions").select("stripe_customer_id").eq("fan_id", userId).eq("environment", data.environment).not("stripe_customer_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("platform_subscriptions").select("stripe_customer_id").eq("user_id", userId).eq("environment", data.environment).not("stripe_customer_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const customerId = ((creatorSub.data as any)?.stripe_customer_id) ?? ((platformSub.data as any)?.stripe_customer_id);
      if (!customerId) {
        return { error: "No billing account found yet. Subscribe to a creator first." };
      }
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: data.returnUrl,
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

/** Twinly+ platform membership. */
export const createTwinlyPlusCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { interval: "monthly" | "yearly"; returnUrl: string; environment: StripeEnv }) => {
    if (!["monthly", "yearly"].includes(d.interval)) throw new Error("Invalid interval");
    return d;
  })
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    try {
      const { supabase, userId } = context;
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email ?? undefined;
      const stripe = createStripeClient(data.environment);
      const customerId = await resolveOrCreateCustomer(stripe, { email, userId });
      const lookupKey = data.interval === "monthly" ? "twinly_plus_monthly" : "twinly_plus_yearly";
      const prices = await stripe.prices.list({ lookup_keys: [lookupKey], expand: ["data.product"] });
      if (!prices.data.length) return { error: "Twinly+ pricing not configured yet." };
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        ui_mode: "embedded_page" as any,
        return_url: data.returnUrl,
        customer: customerId,
        line_items: [{ price: prices.data[0].id, quantity: 1 }],
        automatic_tax: { enabled: true },
        subscription_data: {
          metadata: { userId, kind: "twinly_plus" },
        },
        metadata: { userId, kind: "twinly_plus" },
      });
      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

/** Pay-per-view unlock for a content asset. */
export const createAssetUnlockCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { assetId: string; returnUrl: string; environment: StripeEnv }) => d)
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    try {
      const { supabase, userId } = context;
      const admin = await getSupabaseAdmin();
      const { data: asset } = await admin
        .from("content_assets")
        .select("id, creator_id, price_cents, internal_label, approval_status, moderation_status")
        .eq("id", data.assetId)
        .maybeSingle();
      if (!asset) return { error: "Asset not found" };
      if (asset.approval_status !== "approved" || asset.moderation_status === "removed") {
        return { error: "This item isn't available." };
      }
      const amount = Math.max(50, asset.price_cents ?? 0);
      const { data: creator } = await admin.from("creators").select("stage_name, handle").eq("id", asset.creator_id).maybeSingle();
      const { data: { user } } = await supabase.auth.getUser();
      const stripe = createStripeClient(data.environment);
      const customerId = await resolveOrCreateCustomer(stripe, { email: user?.email ?? undefined, userId });
      const label = (asset as any).internal_label || "Content unlock";
      const productName = `${(creator as any)?.stage_name ?? (creator as any)?.handle ?? "Creator"} — ${label}`;
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ui_mode: "embedded_page" as any,
        return_url: data.returnUrl,
        customer: customerId,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amount,
            product_data: { name: productName },
          } as any,
        }],
        automatic_tax: { enabled: true },
        payment_intent_data: { description: productName },
        metadata: {
          userId,
          creatorId: asset.creator_id,
          assetId: asset.id,
          kind: "ppv",
        },
      });
      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

/** Tip / pay-what-you-want. */
export const createTipCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId: string; amountCents: number; returnUrl: string; environment: StripeEnv }) => {
    if (d.amountCents < 100) throw new Error("Minimum tip is $1.00");
    if (d.amountCents > 50000) throw new Error("Maximum tip is $500.00");
    return d;
  })
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    try {
      const { supabase, userId } = context;
      const admin = await getSupabaseAdmin();
      const { data: creator } = await admin.from("creators").select("stage_name, handle").eq("id", data.creatorId).maybeSingle();
      if (!creator) return { error: "Creator not found" };

      // Twinly+ members get a 10% discount.
      const { data: hasPlus } = await admin.rpc("has_twinly_plus", { _user_id: userId });
      const finalAmount = hasPlus === true
        ? Math.max(100, Math.round(data.amountCents * 0.9))
        : data.amountCents;

      const { data: { user } } = await supabase.auth.getUser();
      const stripe = createStripeClient(data.environment);
      const customerId = await resolveOrCreateCustomer(stripe, { email: user?.email ?? undefined, userId });
      const productName = `Tip for ${(creator as any).stage_name ?? (creator as any).handle}`;
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ui_mode: "embedded_page" as any,
        return_url: data.returnUrl,
        customer: customerId,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: finalAmount,
            product_data: { name: productName },
          } as any,
        }],
        automatic_tax: { enabled: true },
        payment_intent_data: { description: productName },
        metadata: {
          userId,
          creatorId: data.creatorId,
          kind: "tip",
          originalAmountCents: String(data.amountCents),
          twinlyPlusDiscount: hasPlus === true ? "true" : "false",
        },
      });
      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

/** Change tier on an existing creator subscription, with proration.
 *  - Upgrade → Stripe charges the difference immediately.
 *  - Downgrade → route the user to the billing portal instead (avoids surprise refunds). */
export const changeSubscriptionTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { subscriptionId: string; newTier: "base" | "plus" | "vip"; environment: StripeEnv }) => {
    if (!["base", "plus", "vip"].includes(d.newTier)) throw new Error("Invalid tier");
    return d;
  })
  .handler(async ({ data, context }): Promise<OkResult> => {
    try {
      const { supabase, userId } = context;
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("id, creator_id, tier, stripe_subscription_id, environment")
        .eq("id", data.subscriptionId)
        .eq("fan_id", userId)
        .maybeSingle();
      if (!sub || !(sub as any).stripe_subscription_id) return { error: "Subscription not found" };
      const currentRank = TIER_RANK[(sub as any).tier] ?? 0;
      const newRank = TIER_RANK[data.newTier];
      if (newRank === currentRank) return { error: "Already on this plan" };
      if (newRank < currentRank) return { error: "For downgrades, open the billing portal — the change takes effect next renewal." };

      const { data: price } = await supabase
        .from("creator_tier_prices")
        .select("amount_cents, currency, active")
        .eq("creator_id", (sub as any).creator_id)
        .eq("tier", data.newTier)
        .maybeSingle();
      if (!price || !(price as any).active) return { error: "This tier isn't available for this creator." };

      const stripe = createStripeClient(data.environment);
      const stripeSub = await stripe.subscriptions.retrieve((sub as any).stripe_subscription_id);
      const itemId = stripeSub.items.data[0]?.id;
      if (!itemId) return { error: "Subscription item not found" };

      const { data: creator } = await supabase.from("creators").select("stage_name, handle").eq("id", (sub as any).creator_id).maybeSingle();
      const tierLabel = data.newTier.charAt(0).toUpperCase() + data.newTier.slice(1);
      const productName = `${(creator as any)?.stage_name ?? (creator as any)?.handle} — ${tierLabel} tier`;

      await stripe.subscriptions.update((sub as any).stripe_subscription_id, {
        proration_behavior: "always_invoice",
        items: [{
          id: itemId,
          price_data: {
            currency: (price as any).currency ?? "usd",
            unit_amount: (price as any).amount_cents,
            recurring: { interval: "month" },
            product_data: { name: productName },
          } as any,
        } as any],
        metadata: {
          ...(stripeSub.metadata ?? {}),
          userId,
          creatorId: (sub as any).creator_id,
          tier: data.newTier,
        },
      });
      return { ok: true };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

/** Preview the prorated amount that would be charged on upgrade. */
export const previewUpgradeAmount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { subscriptionId: string; newTier: "base" | "plus" | "vip"; environment: StripeEnv }) => d)
  .handler(async ({ data, context }): Promise<UpgradePreview> => {
    try {
      const { supabase, userId } = context;
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("id, creator_id, tier, stripe_subscription_id, stripe_customer_id")
        .eq("id", data.subscriptionId).eq("fan_id", userId).maybeSingle();
      if (!sub || !(sub as any).stripe_subscription_id) return { error: "Subscription not found" };
      const { data: price } = await supabase
        .from("creator_tier_prices")
        .select("amount_cents, currency")
        .eq("creator_id", (sub as any).creator_id).eq("tier", data.newTier).maybeSingle();
      if (!price) return { error: "Price not found" };
      const stripe = createStripeClient(data.environment);
      const stripeSub = await stripe.subscriptions.retrieve((sub as any).stripe_subscription_id);
      const itemId = stripeSub.items.data[0]?.id;
      try {
        const upcoming = await (stripe.invoices as any).createPreview({
          customer: (sub as any).stripe_customer_id,
          subscription: (sub as any).stripe_subscription_id,
          subscription_details: {
            items: [{
              id: itemId,
              price_data: {
                currency: (price as any).currency ?? "usd",
                unit_amount: (price as any).amount_cents,
                recurring: { interval: "month" },
                product: stripeSub.items.data[0].price.product,
              },
            }],
            proration_behavior: "always_invoice",
          },
        });
        return { amountDueCents: upcoming.amount_due ?? 0, currency: upcoming.currency ?? "usd" };
      } catch {
        // Fall back to a naive delta estimate if preview API isn't available.
        return { amountDueCents: (price as any).amount_cents, currency: (price as any).currency ?? "usd" };
      }
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

/** Un-schedule a pending cancellation. */
export const reactivateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { subscriptionId: string; environment: StripeEnv }) => d)
  .handler(async ({ data, context }): Promise<OkResult> => {
    try {
      const { supabase, userId } = context;
      const { data: sub } = await supabase
        .from("subscriptions").select("stripe_subscription_id")
        .eq("id", data.subscriptionId).eq("fan_id", userId).maybeSingle();
      if (!sub || !(sub as any).stripe_subscription_id) return { error: "Subscription not found" };
      const stripe = createStripeClient(data.environment);
      await stripe.subscriptions.update((sub as any).stripe_subscription_id, { cancel_at_period_end: false });
      return { ok: true };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });