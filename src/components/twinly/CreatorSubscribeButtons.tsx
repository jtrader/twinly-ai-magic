import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { toast } from "sonner";
import { Sparkles, Crown, Star, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AuthPromptDialog } from "@/components/twinly/AuthPromptDialog";
import { useSession } from "@/lib/session";
import { getStripe, getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { getCreatorPricing, type Tier } from "@/lib/creator-pricing.functions";
import { createCreatorSubscriptionCheckout, createBillingPortal } from "@/lib/checkout.functions";
import { supabase } from "@/integrations/supabase/client";

const TIER_META: Record<Tier, { label: string; blurb: string; icon: typeof Star; accent: string }> = {
  base: { label: "Base", blurb: "Support the creator + posts", icon: Star, accent: "text-sky-300" },
  plus: { label: "Plus", blurb: "Everything in Base + extras", icon: Sparkles, accent: "text-brand-glow" },
  vip: { label: "VIP", blurb: "Full access, priority replies", icon: Crown, accent: "text-amber-300" },
};

type Price = { tier: Tier; amountCents: number; currency: string };

export function CreatorSubscribeButtons({ creatorId, creatorName }: { creatorId: string; creatorName: string }) {
  const { user } = useSession();
  const [prices, setPrices] = useState<Price[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTiers, setActiveTiers] = useState<Set<Tier>>(new Set());
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [busyTier, setBusyTier] = useState<Tier | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);

  const loadPricing = useServerFn(getCreatorPricing);
  const startCheckout = useServerFn(createCreatorSubscriptionCheckout);
  const openPortal = useServerFn(createBillingPortal);

  useEffect(() => {
    loadPricing({ data: { creatorId } })
      .then((rows) => setPrices(rows.filter((r) => ["base", "plus", "vip"].includes(r.tier))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loadPricing, creatorId]);

  useEffect(() => {
    if (!user) { setActiveTiers(new Set()); return; }
    (async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("tier, status, current_period_end")
        .eq("fan_id", user.id)
        .eq("creator_id", creatorId);
      const now = new Date();
      const s = new Set<Tier>();
      for (const row of (data ?? []) as any[]) {
        const end = row.current_period_end ? new Date(row.current_period_end) : null;
        const stillValid = !end || end > now;
        if ((row.status === "active" || (row.status === "canceled" && stillValid)) && ["base","plus","vip"].includes(row.tier)) {
          s.add(row.tier as Tier);
        }
      }
      setActiveTiers(s);
    })();
  }, [user, creatorId, checkoutOpen]);

  async function handleSubscribe(tier: Tier) {
    if (!isPaymentsConfigured()) { toast.error("Payments not configured yet."); return; }
    setBusyTier(tier);
    try {
      const result = await startCheckout({
        data: {
          creatorId,
          tier,
          returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
          environment: getStripeEnvironment(),
        },
      });
      if ("error" in result) throw new Error(result.error);
      setClientSecret(result.clientSecret);
      setCheckoutOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start checkout");
    } finally {
      setBusyTier(null);
    }
  }

  async function handleManage() {
    setPortalBusy(true);
    try {
      const res = await openPortal({
        data: { returnUrl: window.location.href, environment: getStripeEnvironment() },
      });
      if ("error" in res) throw new Error(res.error);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open billing portal");
    } finally {
      setPortalBusy(false);
    }
  }

  if (loading) return null;
  if (prices.length === 0) return null;

  return (
    <section className="mt-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Subscribe to {creatorName}</h3>
        {user && activeTiers.size > 0 && (
          <Button size="sm" variant="ghost" disabled={portalBusy} onClick={handleManage}>
            {portalBusy ? "…" : "Manage billing"}
          </Button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {prices
          .sort((a, b) => a.amountCents - b.amountCents)
          .map((p) => {
            const meta = TIER_META[p.tier];
            const Icon = meta.icon;
            const subscribed = activeTiers.has(p.tier);
            const label = subscribed ? "Subscribed" : `$${(p.amountCents / 100).toFixed(2)}/mo`;
            const button = (
              <Button
                key={p.tier}
                variant={subscribed ? "secondary" : "outline"}
                className="flex h-auto w-full flex-col items-start gap-1 rounded-xl border-border bg-surface p-3 text-left hover:bg-surface-elevated"
                disabled={busyTier === p.tier || subscribed}
                onClick={() => user && handleSubscribe(p.tier)}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <Icon className={`size-3.5 ${meta.accent}`} />
                    {meta.label}
                  </span>
                  {busyTier === p.tier && <Loader2 className="size-3.5 animate-spin" />}
                </div>
                <span className="text-xs text-muted-foreground">{meta.blurb}</span>
                <span className={`mt-1 text-sm font-semibold ${subscribed ? "text-brand-glow" : ""}`}>{label}</span>
              </Button>
            );
            if (!user) {
              return (
                <AuthPromptDialog
                  key={p.tier}
                  title="Join Twinly.life to subscribe"
                  description="Create a free account to subscribe to your favorite creators."
                >
                  {button}
                </AuthPromptDialog>
              );
            }
            return button;
          })}
      </div>

      <Dialog open={checkoutOpen} onOpenChange={(v) => { setCheckoutOpen(v); if (!v) setClientSecret(null); }}>
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Complete your subscription</DialogTitle>
          </DialogHeader>
          <div id="checkout" className="max-h-[80vh] overflow-y-auto p-4">
            {clientSecret && (
              <EmbeddedCheckoutProvider stripe={getStripe()} options={{ clientSecret }}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}