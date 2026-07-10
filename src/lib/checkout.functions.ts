import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";

type CheckoutResult = { clientSecret: string } | { error: string };
type PortalResult = { url: string } | { error: string };

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
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("fan_id", userId)
        .eq("environment", data.environment)
        .not("stripe_customer_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!sub || !(sub as any).stripe_customer_id) {
        return { error: "No billing account found yet. Subscribe to a creator first." };
      }
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({
        customer: (sub as any).stripe_customer_id,
        return_url: data.returnUrl,
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });