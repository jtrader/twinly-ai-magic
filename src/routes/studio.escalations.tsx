import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/session";
import { listCreatorEscalationRequests, respondToEscalation } from "@/lib/escalation.functions";
import { ArrowLeft, UserCheck, Clock, CheckCircle2, XCircle, Hourglass } from "lucide-react";

export const Route = createFileRoute("/studio/escalations")({
  component: EscalationsPage,
  head: () => ({
    meta: [
      { title: "Real Me requests — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Request = Awaited<ReturnType<typeof listCreatorEscalationRequests>>["requests"][number];

const STATUS_META: Record<string, { icon: any; cls: string; label: string }> = {
  requested: { icon: Clock, cls: "border-amber-400/30 bg-amber-400/10 text-amber-300", label: "Pending" },
  accepted: { icon: CheckCircle2, cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", label: "Accepted" },
  declined: { icon: XCircle, cls: "border-rose-400/30 bg-rose-400/10 text-rose-300", label: "Declined" },
  expired: { icon: Hourglass, cls: "border-border bg-surface text-muted-foreground", label: "Expired" },
};

function EscalationsPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const load = useServerFn(listCreatorEscalationRequests);
  const respond = useServerFn(respondToEscalation);
  const [requests, setRequests] = useState<Request[]>([]);
  const [ready, setReady] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const refresh = useCallback(async () => {
    try {
      const res = await load({});
      setRequests(res.requests as Request[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load requests");
    } finally {
      setReady(true);
    }
  }, [load]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  async function act(id: string, action: "accept" | "decline") {
    setBusyId(id);
    try {
      await respond({ data: { id, action } });
      toast.success(action === "accept" ? "Accepted — a Real Me thread is ready." : "Declined");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusyId(null);
    }
  }

  const pending = requests.filter((r) => r.status === "requested");
  const resolved = requests.filter((r) => r.status !== "requested");

  if (loading || !ready) {
    return <AppShell><div className="py-16 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-3">
        <Link to="/studio" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Creator studio</div>
          <h1 className="font-display text-2xl font-bold">Real Me requests</h1>
        </div>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Supporters asking to move from an AI persona to a direct conversation with you. Accepting opens a separate Real Me thread — it never relabels the AI chat.
      </p>

      <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Pending ({pending.length})
      </div>
      {pending.length === 0 ? (
        <div className="mb-6 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No pending requests.
        </div>
      ) : (
        <div className="mb-6 space-y-2">
          {pending.map((r) => (
            <RequestCard key={r.id} r={r} busy={busyId === r.id} onAccept={() => act(r.id, "accept")} onDecline={() => act(r.id, "decline")} />
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <>
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">History</div>
          <div className="space-y-2">
            {resolved.map((r) => <RequestCard key={r.id} r={r} busy={false} />)}
          </div>
        </>
      )}
    </AppShell>
  );
}

function RequestCard({ r, busy, onAccept, onDecline }: {
  r: Request; busy: boolean; onAccept?: () => void; onDecline?: () => void;
}) {
  const meta = STATUS_META[r.status] ?? STATUS_META.requested;
  const Icon = meta.icon;
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <UserCheck className="size-4 text-brand-glow" />
            <span className="font-semibold">{(r as any).supporter?.display_name ?? "Supporter"}</span>
            <span className="text-xs text-muted-foreground">via {(r as any).personas?.display_name}</span>
            <Badge variant="outline" className={"gap-1 text-[10px] uppercase " + meta.cls}>
              <Icon className="size-3" /> {meta.label}
            </Badge>
          </div>
          {r.message && <p className="mt-1.5 text-sm text-foreground/80">"{r.message}"</p>}
          <div className="mt-1 text-[11px] text-muted-foreground">
            Requested {new Date(r.requested_at).toLocaleString()}
            {r.price_cents > 0 && ` · $${(r.price_cents / 100).toFixed(2)} direct access`}
          </div>
        </div>
        {r.status === "requested" && (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={busy} onClick={onAccept}>Accept</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={onDecline}>Decline</Button>
          </div>
        )}
      </div>
    </div>
  );
}
