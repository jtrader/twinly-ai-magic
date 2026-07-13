import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";

/**
 * Pass 3 — Agency billing via Stripe Billing.
 *   Base: $25/mo    (agency_subscriptions.base_price_cents)
 *   Per-client: $25/mo × number of ACTIVE (verified + consented) clients
 *
 * We model this as a single Stripe subscription with two line items:
 *   - base    (quantity: 1)
 *   - client  (quantity: N — the count of active clients)
 *
 * `syncAgencyBillingQuantity` is called after activation / revocation to
 * keep Stripe's quantity in sync with reality (proration on).
 */

type CheckoutResult = { clientSecret: string } | { error: string };
type OkResult = { ok: true; billedClientCount: number } | { error: string };

async function resolveAgencyCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  opts: { agencyId: string; ownerEmail?: string; agencyName?: string },
): Promise<string> {
  const q = `metadata['agencyId']:'${opts.agencyId}'`;
  const found = await stripe.customers.search({ query: q, limit: 1 });
  if (found.data.length) return found.data[0].id;
  const created = await stripe.customers.create({
    ...(opts.ownerEmail && { email: opts.ownerEmail }),
    ...(opts.agencyName && { name: opts.agencyName }),
    metadata: { agencyId: opts.agencyId, kind: "agency" },
  });
  return created.id;
}

export const getMyAgencyBillingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { agencyId: string }) => d)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: agency } = await supabaseAdmin
      .from("agencies").select("owner_user_id, name").eq("id", data.agencyId).maybeSingle();
    if (!agency || agency.owner_user_id !== userId) throw new Error("Not the agency owner.");

    const { data: sub } = await supabaseAdmin
      .from("agency_subscriptions").select("*").eq("agency_id", data.agencyId).maybeSingle();
    const { data: activeCount } = await supabaseAdmin
      .rpc("count_active_agency_clients", { _agency_id: data.agencyId });

    return {
      status: sub?.status ?? "inactive",
      environment: sub?.environment ?? "sandbox",
      basePriceCents: sub?.base_price_cents ?? 2500,
      perClientPriceCents: sub?.per_client_price_cents ?? 2500,
      currency: sub?.currency ?? "usd",
      billedClientCount: sub?.billed_client_count ?? 0,
      activeClientCount: (activeCount as number | null) ?? 0,
      currentPeriodEnd: sub?.current_period_end ?? null,
      hasStripeSubscription: !!sub?.stripe_subscription_id,
    };
  });

/** Start (or resume) the Stripe subscription. Creates two line items, seeded
 *  from the current active client count. Idempotent — reuses existing sub. */
export const createAgencySubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { agencyId: string; returnUrl: string; environment: StripeEnv }) => {
    if (!d?.returnUrl?.startsWith("http")) throw new Error("returnUrl must be an absolute URL");
    return d;
  })
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    try {
      const { supabase, userId } = context;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: agency } = await supabaseAdmin
        .from("agencies").select("owner_user_id, name").eq("id", data.agencyId).maybeSingle();
      if (!agency || agency.owner_user_id !== userId) return { error: "Not the agency owner." };

      const { data: { user } } = await supabase.auth.getUser();
      const stripe = createStripeClient(data.environment);
      const customerId = await resolveAgencyCustomer(stripe, {
        agencyId: data.agencyId,
        ownerEmail: user?.email ?? undefined,
        agencyName: (agency as any).name,
      });

      const { data: existing } = await supabaseAdmin
        .from("agency_subscriptions").select("*").eq("agency_id", data.agencyId).maybeSingle();
      const basePrice = existing?.base_price_cents ?? 2500;
      const perClient = existing?.per_client_price_cents ?? 2500;
      const currency = existing?.currency ?? "usd";
      const { data: countRaw } = await supabaseAdmin
        .rpc("count_active_agency_clients", { _agency_id: data.agencyId });
      const activeCount = Math.max(0, Number(countRaw ?? 0));

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        ui_mode: "embedded_page" as any,
        return_url: data.returnUrl,
        customer: customerId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: basePrice,
              recurring: { interval: "month" },
              product_data: { name: "Twinly Agency — base" },
            } as any,
          },
          {
            quantity: Math.max(1, activeCount), // Stripe requires quantity >= 1
            price_data: {
              currency,
              unit_amount: perClient,
              recurring: { interval: "month" },
              product_data: { name: "Twinly Agency — per-client seat" },
            } as any,
          },
        ],
        automatic_tax: { enabled: true },
        subscription_data: {
          metadata: { agencyId: data.agencyId, kind: "agency_billing" },
        },
        metadata: { agencyId: data.agencyId, kind: "agency_billing" },
      });

      await supabaseAdmin.from("agency_subscriptions").upsert({
        agency_id: data.agencyId,
        stripe_customer_id: customerId,
        environment: data.environment,
        status: existing?.status ?? "incomplete",
        base_price_cents: basePrice,
        per_client_price_cents: perClient,
        currency,
        billed_client_count: activeCount,
        updated_at: new Date().toISOString(),
      }, { onConflict: "agency_id" });

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

/**
 * Sync the Stripe subscription's per-client quantity to the current active
 * client count. Call after acceptAgencyClientLink / revokeAgencyClientLink.
 */
export const syncAgencyBillingQuantity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { agencyId: string }) => d)
  .handler(async ({ data, context }): Promise<OkResult> => {
    try {
      const { userId } = context;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: agency } = await supabaseAdmin
        .from("agencies").select("owner_user_id").eq("id", data.agencyId).maybeSingle();
      if (!agency || agency.owner_user_id !== userId) return { error: "Not the agency owner." };

      const { data: sub } = await supabaseAdmin
        .from("agency_subscriptions").select("*").eq("agency_id", data.agencyId).maybeSingle();
      const { data: countRaw } = await supabaseAdmin
        .rpc("count_active_agency_clients", { _agency_id: data.agencyId });
      const activeCount = Math.max(0, Number(countRaw ?? 0));

      // Reflect the count locally even if we can't touch Stripe (no live sub).
      await supabaseAdmin.from("agency_subscriptions").upsert({
        agency_id: data.agencyId,
        billed_client_count: activeCount,
        updated_at: new Date().toISOString(),
      }, { onConflict: "agency_id" });

      if (!sub?.stripe_subscription_id) {
        return { ok: true, billedClientCount: activeCount };
      }

      const stripe = createStripeClient((sub.environment ?? "sandbox") as StripeEnv);
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      const perClientItem = stripeSub.items.data.find(
        (i) => i.price?.recurring?.interval === "month" && (i.price?.unit_amount ?? 0) === (sub.per_client_price_cents ?? 2500),
      );
      if (perClientItem) {
        await stripe.subscriptions.update(sub.stripe_subscription_id, {
          items: [{ id: perClientItem.id, quantity: Math.max(1, activeCount) }],
          proration_behavior: "create_prorations",
        });
      }

      return { ok: true, billedClientCount: activeCount };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });