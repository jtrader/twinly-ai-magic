import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreditCard, ExternalLink, Wallet, Loader2, AlertCircle, RotateCcw, XCircle } from "lucide-react";
import { listMySubscriptions } from "@/lib/subscriptions.functions";
import { createBillingPortal, reactivateSubscription, scheduleCancelSubscription } from "@/lib/checkout.functions";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";

export const Route = createFileRoute("/account/subscriptions")({ component: SubscriptionsPage });

type Sub = Awaited<ReturnType<typeof listMySubscriptions>>[number];

function SubscriptionsPage() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalBusy, setPortalBusy] = useState<string | "all" | null>(null);
  const [reactivateBusy, setReactivateBusy] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Sub | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const load = useServerFn(listMySubscriptions);
  const openPortal = useServerFn(createBillingPortal);
  const reactivate = useServerFn(reactivateSubscription);
  const cancel = useServerFn(scheduleCancelSubscription);

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

  async function handleReactivate(sub: Sub) {
    setReactivateBusy(sub.id);
    const prev = subs;
    setSubs((s) => s.map((r) => r.id === sub.id ? { ...r, cancelAtPeriodEnd: false } : r));
    try {
      const res = await reactivate({ data: { subscriptionId: sub.id, environment: sub.environment } });
      if ("error" in res) throw new Error(res.error);
      toast.success("Subscription reactivated");
    } catch (e: any) {
      setSubs(prev);
      toast.error(e?.message ?? "Could not reactivate");
    } finally { setReactivateBusy(null); }
  }

  async function handleConfirmCancel() {
    if (!cancelTarget) return;
    setCancelBusy(true);
    const target = cancelTarget;
    const prev = subs;
    setSubs((s) => s.map((r) => r.id === target.id ? { ...r, cancelAtPeriodEnd: true } : r));
    try {
      const res = await cancel({ data: { subscriptionId: target.id, environment: target.environment } });
      if ("error" in res) throw new Error(res.error);
      toast.success(`Cancellation scheduled — access ends ${target.currentPeriodEnd ? new Date(target.currentPeriodEnd).toLocaleDateString() : "at period end"}`);
      setCancelTarget(null);
    } catch (e: any) {
      setSubs(prev);
      toast.error(e?.message ?? "Could not cancel");
    } finally { setCancelBusy(false); }
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
          {active.map((s) => (
            <SubRow key={s.id} sub={s}
              onManage={() => handlePortal(s.id)}
              busy={portalBusy === s.id || portalBusy === "all"}
              onReactivate={() => handleReactivate(s)}
              reactivating={reactivateBusy === s.id}
              onCancel={() => setCancelTarget(s)} />
          ))}
        </Section>
      )}

      {!loading && inactive.length > 0 && (
        <Section title="Past" muted>
          {inactive.map((s) => (
            <SubRow key={s.id} sub={s}
              onManage={() => handlePortal(s.id)}
              busy={portalBusy === s.id || portalBusy === "all"} />
          ))}
        </Section>
      )}

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) setCancelTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this subscription?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {cancelTarget && (
                  <div className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {cancelTarget.stageName ?? cancelTarget.handle}
                      </span>
                      <Badge variant="outline" className="capitalize text-[10px]">{cancelTarget.tier}</Badge>
                    </div>
                    {cancelTarget.currentPeriodEnd && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Access remains until{" "}
                        <span className="font-medium text-foreground">
                          {new Date(cancelTarget.currentPeriodEnd).toLocaleDateString(undefined, {
                            year: "numeric", month: "long", day: "numeric",
                          })}
                        </span>.
                      </div>
                    )}
                  </div>
                )}
                <p>
                  You won't be charged again. You can reactivate any time before the end date to keep your access.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelBusy}>Keep subscription</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmCancel(); }}
              disabled={cancelBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <XCircle className="mr-2 size-4" />}
              {cancelBusy ? "Cancelling…" : "Yes, cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function SubRow({
  sub, onManage, busy, onReactivate, reactivating, onCancel,
}: {
  sub: Sub; onManage: () => void; busy: boolean;
  onReactivate?: () => void; reactivating?: boolean;
  onCancel?: () => void;
}) {
  const canceled = sub.status !== "active";
  const endingSoon = !canceled && sub.cancelAtPeriodEnd;
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
              <span>· {endingSoon ? "ends" : "renews"} {new Date(sub.currentPeriodEnd).toLocaleDateString()}</span>
            )}
          </div>
          {endingSoon && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-300">
              <AlertCircle className="size-3" /> Set to end at period close — you can reactivate below.
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {sub.handle && (
          <Button asChild size="sm" variant="ghost">
            <Link to="/creators/$handle" params={{ handle: sub.handle }}><ExternalLink className="mr-1 size-3.5" />Visit</Link>
          </Button>
        )}
        {endingSoon && onReactivate && (
          <Button size="sm" variant="default" disabled={reactivating} onClick={onReactivate}>
            {reactivating ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <RotateCcw className="mr-1 size-3.5" />}
            Reactivate
          </Button>
        )}
        {!canceled && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onManage}>
            {busy && <Loader2 className="mr-1 size-3.5 animate-spin" />}
            {busy ? "Opening…" : "Manage"}
          </Button>
        )}
        {!canceled && !endingSoon && onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel} className="text-destructive hover:text-destructive">
            <XCircle className="mr-1 size-3.5" /> Cancel
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