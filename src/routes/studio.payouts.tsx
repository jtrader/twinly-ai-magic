import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { getPayoutsSummary } from "@/lib/payouts.functions";
import { Wallet, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/studio/payouts")({
  component: PayoutsPage,
  head: () => ({
    meta: [
      { title: "Payouts — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function fmt(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PayoutsPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useServerFn(getPayoutsSummary);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);
  useEffect(() => {
    if (!user) return;
    load({}).then(setData).catch((e) => { setErr(e?.message ?? "Failed to load"); toast.error(e?.message ?? "Failed"); });
  }, [user]);

  if (loading || !user || !data) {
    return <AppShell><div className="py-20 text-center text-muted-foreground">{err ?? "Loading..."}</div></AppShell>;
  }

  if (!data.creator) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
          <Wallet className="mx-auto mb-2 size-6 text-brand-glow" />
          <h1 className="font-display text-xl font-bold">Payouts</h1>
          <p className="mt-2 text-sm text-muted-foreground">Complete onboarding to start earning.</p>
          <Link to="/onboarding" className="mt-4 inline-block"><Button>Start onboarding</Button></Link>
        </div>
      </AppShell>
    );
  }

  const { subscribers, totals, nextPayout, transactions, subscriptions } = data;

  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-2">
        <Link to="/studio"><Button size="sm" variant="ghost" className="gap-1"><ArrowLeft className="size-4" /> Studio</Button></Link>
      </div>
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Creator studio</div>
        <h1 className="mt-1 font-display text-3xl font-bold">Payouts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Payment history, subscribers, and next disbursement.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Revenue (MTD)" value={fmt(totals.mtd_cents)} />
        <Stat label="Lifetime" value={fmt(totals.lifetime_cents)} />
        <Stat label="Pending" value={fmt(totals.pending_cents)} tone={totals.pending_cents > 0 ? "warn" : undefined} />
        <Stat label="Active subs" value={subscribers.active} hint={`${subscribers.canceled} inactive`} />
      </div>

      <div className="mb-6 rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Next payout</div>
            <div className="mt-1 font-display text-2xl font-bold">{fmt(nextPayout.amount_cents)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Scheduled {new Date(nextPayout.scheduled_for).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
            </div>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-300">
              {nextPayout.status === "not_configured" ? "Payout method needed" : nextPayout.status}
            </span>
            <div className="mt-2">
              <Button size="sm" variant="outline" disabled>Add payout method</Button>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">Bank / Stripe Connect · Coming soon</div>
          </div>
        </div>
      </div>

      <section className="mb-6">
        <h2 className="mb-2 font-display text-lg font-semibold">Recent transactions</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-elevated text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Kind</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t: any) => (
                <tr key={t.id} className="border-b border-border/50">
                  <td className="px-4 py-2 text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2 uppercase text-xs">{t.kind}</td>
                  <td className="px-4 py-2"><StatusPill value={t.status} /></td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(t.amount_cents ?? 0)}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No transactions yet. Once fans subscribe or unlock content, they'll appear here.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg font-semibold">Subscriptions</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-elevated text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Started</th>
                <th className="px-4 py-2">Tier</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Renews</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((s: any) => (
                <tr key={s.id} className="border-b border-border/50">
                  <td className="px-4 py-2 text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2 uppercase text-xs">{s.tier}</td>
                  <td className="px-4 py-2"><StatusPill value={s.status} /></td>
                  <td className="px-4 py-2 text-muted-foreground">{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
              {subscriptions.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No subscribers yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: "warn" }) {
  const cls = tone === "warn" ? "text-amber-300" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold ${cls}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const tone =
    value === "succeeded" || value === "active" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
    : value === "stub" || value === "paused" ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
    : value === "failed" || value === "canceled" ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
    : "border-border bg-surface text-muted-foreground";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${tone}`}>{value}</span>;
}