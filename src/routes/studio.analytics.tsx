import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/session";
import { getCreatorAnalytics } from "@/lib/analytics.functions";
import { BarChart3, CheckCircle2, XCircle, Clock, Sparkles, Users, MessageCircle, Wallet, Image as ImageIcon } from "lucide-react";

export const Route = createFileRoute("/studio/analytics")({
  component: AnalyticsPage,
  head: () => ({
    meta: [
      { title: "Analytics — Twinly.life studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Data = NonNullable<Awaited<ReturnType<typeof getCreatorAnalytics>>>;

function AnalyticsPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const load = useServerFn(getCreatorAnalytics);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<Data | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setReady(false);
    (async () => {
      try {
        const res = await load({ data: { days } });
        if (alive) setData(res);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, [user, days, load]);

  if (!ready) {
    return <AppShell><div className="py-20 text-center text-sm text-muted-foreground">Loading analytics…</div></AppShell>;
  }

  if (!data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
          <h1 className="font-display text-xl font-bold">Analytics</h1>
          <p className="mt-2 text-sm text-muted-foreground">Complete onboarding first.</p>
          <Link to="/onboarding" className="mt-4 inline-block"><Button>Start onboarding</Button></Link>
        </div>
      </AppShell>
    );
  }

  const { generation: g, assets, engagement: e, subscribers: s, revenue } = data;
  const approvalPct = g.approvalRate != null ? Math.round(g.approvalRate * 100) : null;
  const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Creator studio</div>
          <h1 className="mt-1 font-display text-3xl font-bold">Analytics</h1>
          <div className="mt-1 text-sm text-muted-foreground">Last {data.windowDays} days</div>
        </div>
        <div className="flex gap-1 rounded-full border border-border bg-surface p-1 text-xs">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d as 7 | 30 | 90)}
              className={"rounded-full px-3 py-1 font-semibold transition " + (days === d ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground")}
            >{d}d</button>
          ))}
        </div>
      </div>

      {/* Top KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={<Sparkles className="size-4" />} label="Generation jobs" value={g.total} sub={`${g.reviewed} reviewed`} />
        <Kpi icon={<CheckCircle2 className="size-4" />} label="Approval rate" value={approvalPct != null ? `${approvalPct}%` : "—"} sub={`${g.approved} approved / ${g.rejected} rejected`} />
        <Kpi icon={<MessageCircle className="size-4" />} label="Chats started" value={e.chats} sub={`${e.uniqueFans} unique fans`} />
        <Kpi icon={<Wallet className="size-4" />} label="Revenue" value={usd(revenue.totalCents)} sub={`${s.active} active subs`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Generation volume */}
        <Card title="Generation volume" icon={<BarChart3 className="size-4" />}>
          <MiniBars data={g.perDay} unit="jobs" />
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            <MiniStat label="Images" value={g.byType.image ?? 0} />
            <MiniStat label="Audio" value={g.byType.audio ?? 0} />
            <MiniStat label="Video" value={g.byType.video ?? 0} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {Object.entries(g.byStatus).map(([k, v]) => (
              <Badge key={k} variant="outline" className="border-border text-[10px] uppercase tracking-widest">{k}: {v}</Badge>
            ))}
          </div>
        </Card>

        {/* Approval funnel */}
        <Card title="Approval funnel" icon={<CheckCircle2 className="size-4" />}>
          <FunnelRow label="Submitted" value={g.total} total={g.total} tone="brand" />
          <FunnelRow label="Reviewed" value={g.reviewed} total={g.total} tone="amber" />
          <FunnelRow label="Approved" value={g.approved} total={g.total || 1} tone="emerald" />
          <FunnelRow label="Rejected" value={g.rejected} total={g.total || 1} tone="rose" />
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            Avg review latency: {g.avgReviewHours != null ? `${g.avgReviewHours.toFixed(1)}h` : "—"}
          </div>
        </Card>

        {/* Engagement per day */}
        <Card title="Chat engagement" icon={<MessageCircle className="size-4" />}>
          <MiniBars data={e.perDay} unit="chats" tone="brand" />
          <div className="mt-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Top personas</div>
            {e.topPersonas.length === 0 ? (
              <div className="text-xs text-muted-foreground">No chats yet in this window.</div>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border bg-background/40">
                {e.topPersonas.map((p) => (
                  <li key={p.personaId} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.displayName}</span>
                      <Badge variant="outline" className="border-border text-[9px] uppercase tracking-widest">{p.kind}</Badge>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{p.chats}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* Subscribers + revenue */}
        <Card title="Subscribers & revenue" icon={<Users className="size-4" />}>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Active" value={s.active} />
            <MiniStat label={`New (${data.windowDays}d)`} value={s.newInWindow} />
            <MiniStat label="Revenue" value={usd(revenue.totalCents)} />
          </div>
          <div className="mt-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">By tier</div>
            <div className="flex flex-wrap gap-1">
              {Object.keys(s.byTier).length === 0 ? (
                <span className="text-xs text-muted-foreground">No active subscribers yet.</span>
              ) : Object.entries(s.byTier).map(([t, n]) => (
                <Badge key={t} variant="outline" className="border-brand/40 bg-brand/10 text-[10px] uppercase tracking-widest text-brand-glow">{t}: {n}</Badge>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Revenue by kind</div>
            <div className="flex flex-wrap gap-1">
              {Object.keys(revenue.byKind).length === 0 ? (
                <span className="text-xs text-muted-foreground">No successful transactions yet.</span>
              ) : Object.entries(revenue.byKind).map(([k, c]) => (
                <Badge key={k} variant="outline" className="border-border text-[10px] uppercase tracking-widest">{k}: {usd(c)}</Badge>
              ))}
            </div>
          </div>
        </Card>

        {/* Assets */}
        <Card title="Content vault" icon={<ImageIcon className="size-4" />}>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label={`New (${data.windowDays}d)`} value={assets.total} />
            <MiniStat label="Approved" value={assets.approved} />
            <MiniStat label="Synthetic" value={assets.synthetic} />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Counts reflect assets created inside the selected window.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        {icon && <span className="text-brand-glow">{icon}</span>}
        <h2 className="font-display text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        <span className="text-brand-glow">{icon}</span>{label}
      </div>
      <div className="mt-1 font-display text-2xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-2 text-center">
      <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-display text-lg font-bold">{value}</div>
    </div>
  );
}

function MiniBars({ data, unit, tone = "brand" }: { data: { day: string; count: number }[]; unit: string; tone?: "brand" }) {
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.count)), [data]);
  const total = data.reduce((a, d) => a + d.count, 0);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Per day</div>
        <div className="text-xs text-muted-foreground">{total} {unit}</div>
      </div>
      <div className="flex h-24 items-end gap-[2px]">
        {data.map((d) => {
          const h = Math.max(2, Math.round((d.count / max) * 100));
          return (
            <div
              key={d.day}
              title={`${d.day} — ${d.count}`}
              className={"flex-1 rounded-sm " + (tone === "brand" ? "bg-brand/70" : "bg-brand/70")}
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
        <span>{data[0]?.day.slice(5) ?? ""}</span>
        <span>{data[data.length - 1]?.day.slice(5) ?? ""}</span>
      </div>
    </div>
  );
}

function FunnelRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: "brand" | "amber" | "emerald" | "rose" }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const bar =
    tone === "brand" ? "bg-brand/70"
    : tone === "amber" ? "bg-amber-400/70"
    : tone === "emerald" ? "bg-emerald-400/70"
    : "bg-rose-400/70";
  const Icon = tone === "rose" ? XCircle : CheckCircle2;
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Icon className="size-3.5" />{label}
        </span>
        <span className="font-mono">{value} <span className="text-muted-foreground">({pct}%)</span></span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-background/60">
        <div className={"h-full " + bar} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}