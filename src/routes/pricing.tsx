import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Check, Loader2, Crown } from "lucide-react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { AuthPromptDialog } from "@/components/twinly/AuthPromptDialog";
import { EmbeddedCheckoutDialog } from "@/components/twinly/EmbeddedCheckoutDialog";
import { useSession } from "@/lib/session";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { createTwinlyPlusCheckout, createBillingPortal } from "@/lib/checkout.functions";
import { useTwinlyPlus } from "@/lib/twinly-plus";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Twinly+ · Twinly.life" },
      { name: "description", content: "Twinly+ platform membership — ad-free, 10% off tips, exclusive badge." },
    ],
  }),
  component: PricingPage,
});

const PERKS = [
  "Ad-free browsing across the site",
  "10% off every tip to every creator",
  "Twinly+ badge on your profile",
  "Early access to new features",
];

function PricingPage() {
  const { user } = useSession();
  const { hasPlus, cancelAtPeriodEnd, currentPeriodEnd } = useTwinlyPlus();
  const [busy, setBusy] = useState<"monthly" | "yearly" | "portal" | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const startCheckout = useServerFn(createTwinlyPlusCheckout);
  const openPortal = useServerFn(createBillingPortal);

  async function subscribe(interval: "monthly" | "yearly") {
    if (!isPaymentsConfigured()) { toast.error("Payments not configured yet."); return; }
    setBusy(interval);
    try {
      const res = await startCheckout({
        data: { interval, returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`, environment: getStripeEnvironment() },
      });
      if ("error" in res) throw new Error(res.error);
      setClientSecret(res.clientSecret);
      setCheckoutOpen(true);
    } catch (e: any) { toast.error(e?.message ?? "Could not start checkout"); }
    finally { setBusy(null); }
  }

  async function manage() {
    setBusy("portal");
    try {
      const res = await openPortal({ data: { returnUrl: window.location.href, environment: getStripeEnvironment() } });
      if ("error" in res) throw new Error(res.error);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e: any) { toast.error(e?.message ?? "Could not open billing portal"); }
    finally { setBusy(null); }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-brand-glow">
            <Sparkles className="size-3" /> Twinly+
          </div>
          <h1 className="font-display text-4xl font-bold">Support Twinly, get more from every creator.</h1>
          <p className="mt-2 text-sm text-muted-foreground">One membership, perks everywhere on the platform.</p>
        </header>

        {hasPlus && (
          <div className="mb-6 rounded-2xl border border-brand-glow/40 bg-brand/10 p-4 text-sm">
            <div className="flex items-center gap-2 font-semibold text-brand-glow">
              <Crown className="size-4" /> Twinly+ is active
            </div>
            {cancelAtPeriodEnd && currentPeriodEnd && (
              <p className="mt-1 text-muted-foreground">Ends {new Date(currentPeriodEnd).toLocaleDateString()}.</p>
            )}
            <Button size="sm" variant="outline" className="mt-3" onClick={manage} disabled={busy === "portal"}>
              {busy === "portal" && <Loader2 className="mr-1 size-3.5 animate-spin" />}
              Manage in billing portal
            </Button>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <PlanCard label="Monthly" price="$9.99" cadence="/mo"
            busy={busy === "monthly"} disabled={hasPlus} user={user}
            onClick={() => subscribe("monthly")} />
          <PlanCard label="Yearly" price="$99" cadence="/yr" tag="Save $20"
            busy={busy === "yearly"} disabled={hasPlus} user={user}
            onClick={() => subscribe("yearly")} />
        </div>

        <ul className="mt-8 grid gap-2 text-sm sm:grid-cols-2">
          {PERKS.map((p) => (
            <li key={p} className="flex items-start gap-2 rounded-lg border border-border bg-surface p-3">
              <Check className="mt-0.5 size-4 text-brand-glow" /> <span>{p}</span>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Your payment details are stored securely by Stripe (PCI-compliant). Cancel anytime — access continues until the end of your paid period.
        </p>
      </div>

      <EmbeddedCheckoutDialog open={checkoutOpen}
        onOpenChange={(v) => { setCheckoutOpen(v); if (!v) setClientSecret(null); }}
        clientSecret={clientSecret} title="Complete your Twinly+ membership" />
    </AppShell>
  );
}

function PlanCard({
  label, price, cadence, tag, busy, disabled, user, onClick,
}: {
  label: string; price: string; cadence: string; tag?: string;
  busy: boolean; disabled: boolean; user: any; onClick: () => void;
}) {
  const button = (
    <Button className="mt-4 w-full" disabled={busy || disabled} onClick={() => user && onClick()}>
      {busy && <Loader2 className="mr-1 size-4 animate-spin" />}
      {disabled ? "Current plan" : busy ? "Opening…" : `Get ${label.toLowerCase()}`}
    </Button>
  );
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{label}</h2>
        {tag && <span className="rounded-full bg-brand-glow/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-glow">{tag}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-display text-3xl font-bold">{price}</span>
        <span className="text-sm text-muted-foreground">{cadence}</span>
      </div>
      {user ? button : (
        <AuthPromptDialog title="Sign in to subscribe" description="Create a free account first.">{button}</AuthPromptDialog>
      )}
    </div>
  );
}