import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, ExternalLink, Wallet, Loader2 } from "lucide-react";
import { listMySubscriptions } from "@/lib/subscriptions.functions";
import { createBillingPortal } from "@/lib/checkout.functions";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";

export const Route = createFileRoute("/account/subscriptions")({ component: SubscriptionsPage });

type Sub = Awaited<ReturnType<typeof listMySubscriptions>>[number];

function SubscriptionsPage() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalBusy, setPortalBusy] = useState<string | "all" | null>(null);
  const load = useServerFn(listMySubscriptions);
  const openPortal = useServerFn(createBillingPortal);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setSubs(await load()); }
    catch (e: any) { toast.error(e?.message ?? "Failed to load subscriptions"); }
    finally { setLoading(false); }
  }, [load]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handlePortal(rowId: string | "all" = "all") {
    if (!isPaymentsConfigured()) { toast.error("Payments not configured yet."); return; }
    setPortalBusy(rowId);
    try {
      const res = await openPortal({
        data: { returnUrl: window.location.href, environment: getStripeEnvironment() },
      });
      if ("error" in res) throw new Error(res.error);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e: any) { toast.error(e?.message ?? "Couldn't open billing portal — try again"); }
    finally { setPortalBusy(null); }
  }

  const active = subs.filter((s) => s.status === "active");
  const inactive = subs.filter((s) => s.status !== "active");

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Subscriptions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your paid creator subscriptions.</p>
        </div>
        {subs.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => handlePortal("all")} disabled={portalBusy !== null}>
            {portalBusy === "all"
              ? <Loader2 className="mr-2 size-4 animate-spin" />
              : <Wallet className="mr-2 size-4" />}
            {portalBusy === "all" ? "Opening…" : "Billing portal"}
          </Button>
        )}
      </header>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      )}

      {!loading && subs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-8 text-center">
          <CreditCard className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="text-sm font-medium">No active subscriptions</p>
          <p className="mt-1 text-sm text-muted-foreground">When you subscribe to a creator, they'll appear here.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/discover">Discover creators</Link>
          </Button>
        </div>
      )}

      {!loading && active.length > 0 && (
        <Section title="Active">
          {active.map((s) => <SubRow key={s.id} sub={s} onManage={() => handlePortal(s.id)} busy={portalBusy === s.id || portalBusy === "all"} />)}
        </Section>
      )}

      {!loading && inactive.length > 0 && (
        <Section title="Past" muted>
          {inactive.map((s) => <SubRow key={s.id} sub={s} onManage={() => handlePortal(s.id)} busy={portalBusy === s.id || portalBusy === "all"} />)}
        </Section>
      )}
    </div>
  );
}

function Section({ title, muted, children }: { title: string; muted?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className={`mb-2 text-xs font-semibold uppercase tracking-widest ${muted ? "text-muted-foreground" : "text-foreground"}`}>{title}</h2>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function SubRow({ sub, onManage, busy }: { sub: Sub; onManage: () => void; busy: boolean }) {
  const canceled = sub.status !== "active";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar url={sub.avatarUrl} name={sub.stageName ?? sub.handle ?? "?"} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{sub.stageName ?? sub.handle}</span>
            {sub.verified && <Badge variant="secondary" className="text-[10px]">Verified</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="capitalize text-[10px]">{sub.tier}</Badge>
            <span className={canceled ? "text-muted-foreground" : "text-brand-glow"}>{sub.status}</span>
            {sub.currentPeriodEnd && (
              <span>· renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {sub.handle && (
          <Button asChild size="sm" variant="ghost">
            <Link to="/creators/$handle" params={{ handle: sub.handle }}><ExternalLink className="mr-1 size-3.5" />Visit</Link>
          </Button>
        )}
        {!canceled && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onManage}>
            {busy && <Loader2 className="mr-1 size-3.5 animate-spin" />}
            {busy ? "Opening…" : "Manage"}
          </Button>
        )}
      </div>
    </li>
  );
}

function Avatar({ url, name }: { url?: string | null; name: string }) {
  if (url) return <img src={url} alt="" className="size-10 rounded-full object-cover" />;
  return (
    <div className="flex size-10 items-center justify-center rounded-full bg-brand/15 text-sm font-semibold text-brand-glow">
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}