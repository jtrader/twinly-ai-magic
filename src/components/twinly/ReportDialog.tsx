import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Flag, CheckCircle2, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { reportSubject, listMyReports } from "@/lib/moderation.functions";
import { useSession } from "@/lib/session";
import { AuthPromptDialog } from "@/components/twinly/AuthPromptDialog";


type Target = "creator" | "persona" | "message" | "content_asset" | "conversation";

const CATEGORIES = [
  { value: "impersonation", label: "Impersonation / not the real creator" },
  { value: "minor_safety", label: "Minor safety concern" },
  { value: "non_consensual", label: "Non-consensual content" },
  { value: "harassment", label: "Harassment or abuse" },
  { value: "scam", label: "Scam or fraud" },
  { value: "other", label: "Other" },
];

export function ReportDialog({
  targetType,
  targetId,
  label = "Report",
  size = "sm",
  variant = "ghost",
}: {
  targetType: Target;
  targetId?: string;
  label?: string;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary" | "link";
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(CATEGORIES[0].value);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"form" | "confirmed">("form");
  const [reports, setReports] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const submit = useServerFn(reportSubject);
  const list = useServerFn(listMyReports);
  const { user, loading } = useSession();


  async function refresh() {
    if (!targetId) { setReports([]); return; }
    setLoadingReports(true);
    try {
      const { reports } = await list({ data: { targetType, targetId } });
      setReports(reports);
    } catch { /* ignore */ }
    finally { setLoadingReports(false); }
  }

  useEffect(() => {
    if (!open) return;
    setView("form");
    refresh();
  }, [open]);

  async function onSubmit() {
    setBusy(true);
    try {
      const res = await submit({ data: { targetType, targetId, category, notes: notes.trim() || undefined } });
      toast.success("Report submitted", { description: "Our safety team will review it." });
      setNotes("");
      setView("confirmed");
      const rep = res?.report;
      if (rep) setReports((prev) => [rep, ...prev.filter((r) => r.id !== rep.id)]);
      else refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to submit report");
    } finally {
      setBusy(false);
    }
  }

  const hasPrior = reports.length > 0;

  if (loading) {
    return (
      <Button type="button" size={size} variant={variant} className="gap-1.5" disabled>
        <Flag className="size-3.5" /> {label}
      </Button>
    );
  }

  if (!user) {
    return (
      <AuthPromptDialog title="Join Twinly.life to report" description="Sign up or log in to report content and help keep the community safe.">
        <Button type="button" size={size} variant={variant} className="gap-1.5">
          <Flag className="size-3.5" /> {label}
        </Button>
      </AuthPromptDialog>
    );
  }

  return (

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size={size} variant={variant} className="gap-1.5">
          <Flag className="size-3.5" /> {label}
          {hasPrior && reports.some((r) => r.status === "open") && (
            <span className="ml-1 rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-300">Open</span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {view === "confirmed" ? "Report received" : `Report ${targetType.replace("_", " ")}`}
          </DialogTitle>
        </DialogHeader>

        {view === "form" ? (
          <div className="space-y-3">
            <div>
              <Label>Reason</Label>
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Details (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened?" rows={4} />
            </div>
            <p className="text-xs text-muted-foreground">Reports are private. False reports may lead to account action.</p>

            {hasPrior && <ReportsList reports={reports} loading={loadingReports} />}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
              <div className="flex items-center gap-2 text-emerald-300">
                <CheckCircle2 className="size-5" />
                <div className="font-semibold">Thanks — your report is with our safety team.</div>
              </div>
              <p className="mt-1 text-xs text-emerald-200/80">
                You'll see status updates here and next to the Report button on this {targetType.replace("_", " ")}.
              </p>
            </div>
            <ReportsList reports={reports} loading={loadingReports} />
          </div>
        )}

        <DialogFooter>
          {view === "form" ? (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={onSubmit} disabled={busy}>{busy ? "Sending..." : "Submit report"}</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setView("form")}>File another</Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportsList({ reports, loading }: { reports: any[]; loading: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Your reports on this item {loading && "· refreshing…"}
      </div>
      {reports.length === 0 ? (
        <div className="text-xs text-muted-foreground">No prior reports.</div>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 text-xs">
              <div>
                <div className="font-semibold text-foreground">{r.category}</div>
                <div className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                {r.resolution && <div className="mt-1 text-muted-foreground">Outcome: {r.resolution}</div>}
              </div>
              <StatusChip status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: any; label: string }> = {
    open: { cls: "border-amber-400/30 bg-amber-400/10 text-amber-300", icon: Clock, label: "Under review" },
    resolved: { cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", icon: CheckCircle2, label: "Resolved" },
    dismissed: { cls: "border-rose-400/30 bg-rose-400/10 text-rose-300", icon: XCircle, label: "Dismissed" },
  };
  const s = map[status] ?? map.open;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${s.cls}`}>
      <Icon className="size-3" /> {s.label}
    </span>
  );
}