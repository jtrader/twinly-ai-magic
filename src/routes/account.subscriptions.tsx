import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, ExternalLink } from "lucide-react";
import { listMySubscriptions, cancelMySubscription } from "@/lib/subscriptions.functions";

export const Route = createFileRoute("/account/subscriptions")({ component: SubscriptionsPage });

type Sub = Awaited<ReturnType<typeof listMySubscriptions>>[number];

function SubscriptionsPage() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useServerFn(listMySubscriptions);
  const cancel = useServerFn(cancelMySubscription);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setSubs(await load()); }
    catch (e: any) { toast.error(e?.message ?? "Failed to load subscriptions"); }
    finally { setLoading(false); }
  }, [load]);

  useEffect(() => { refresh(); }, [refresh]);

  async function doCancel(id: string) {
    if (!confirm("Cancel this subscription? You'll keep access until the end of the current period.")) return;
    setBusyId(id);
    try {
      await cancel({ data: { subscriptionId: id } });
      setSubs((s) => s.map((x) => x.id === id ? { ...x, status: "canceled" } : x));
      toast.success("Subscription canceled");
    } catch (e: any) { toast.error(e?.message ?? "Could not cancel"); }
    finally { setBusyId(null); }
  }

  const active = subs.filter((s) => s.status === "active");
  const inactive = subs.filter((s) => s.status !== "active");

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold">Subscriptions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your paid creator subscriptions.</p>
      </header>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

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
          {active.map((s) => <SubRow key={s.id} sub={s} busy={busyId === s.id} onCancel={() => doCancel(s.id)} />)}
        </Section>
      )}

      {!loading && inactive.length > 0 && (
        <Section title="Past" muted>
          {inactive.map((s) => <SubRow key={s.id} sub={s} busy={false} onCancel={() => {}} />)}
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

function SubRow({ sub, busy, onCancel }: { sub: Sub; busy: boolean; onCancel: () => void }) {
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
          <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>
            {busy ? "…" : "Cancel"}
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