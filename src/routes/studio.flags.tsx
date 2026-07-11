import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session";
import {
  listCreatorFlags, loadFlagContext, resolveFlag, handoffFlag,
} from "@/lib/conversation-flags.functions";
import { ArrowLeft, Flag, CheckCircle2, XCircle, UserCheck, Clock, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/studio/flags")({
  component: FlagsPage,
  head: () => ({
    meta: [
      { title: "Flagged AI chats — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Flag = Awaited<ReturnType<typeof listCreatorFlags>>["flags"][number];

const REASON_LABEL: Record<string, string> = {
  off_tone: "Off tone",
  inaccurate: "Inaccurate",
  uncomfortable: "Uncomfortable",
  wants_human: "Wants creator",
  other: "Other",
};

const STATUS_META: Record<string, { icon: any; cls: string; label: string }> = {
  open: { icon: Clock, cls: "border-amber-400/30 bg-amber-400/10 text-amber-300", label: "Open" },
  acknowledged: { icon: CheckCircle2, cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", label: "Acknowledged" },
  handed_off: { icon: UserCheck, cls: "border-brand/40 bg-brand/10 text-brand-glow", label: "Handed off" },
  dismissed: { icon: XCircle, cls: "border-border bg-surface text-muted-foreground", label: "Dismissed" },
};

function FlagsPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const load = useServerFn(listCreatorFlags);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const refresh = useCallback(async () => {
    try {
      const res = await load({});
      setFlags(res.flags as Flag[]);
      setSelectedId((prev) => prev ?? (res.flags[0]?.id ?? null));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load flags");
    } finally {
      setReady(true);
    }
  }, [load]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  const open = useMemo(() => flags.filter((f) => f.status === "open"), [flags]);
  const history = useMemo(() => flags.filter((f) => f.status !== "open"), [flags]);
  const selected = flags.find((f) => f.id === selectedId) ?? null;

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
          <h1 className="font-display text-2xl font-bold">Flagged AI chats</h1>
        </div>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Supporters can flag an AI conversation for your review. Acknowledge to close the loop, dismiss if it's a non-issue, or take over the chat directly — the AI stops replying and it moves to your direct inbox.
      </p>

      <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr]">
        <div className="space-y-4">
          <FlagList title={`Open (${open.length})`} flags={open} selectedId={selectedId} onSelect={setSelectedId} emptyText="No open flags." />
          {history.length > 0 && (
            <FlagList title="History" flags={history} selectedId={selectedId} onSelect={setSelectedId} muted />
          )}
        </div>
        <div>
          {selected ? (
            <FlagDetail key={selected.id} flag={selected} onChanged={refresh} />
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Select a flag to review it.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function FlagList({
  title, flags, selectedId, onSelect, emptyText, muted,
}: {
  title: string; flags: Flag[]; selectedId: string | null;
  onSelect: (id: string) => void; emptyText?: string; muted?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</div>
      {flags.length === 0 && emptyText ? (
        <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{emptyText}</div>
      ) : (
        <div className="space-y-2">
          {flags.map((f) => {
            const meta = STATUS_META[f.status] ?? STATUS_META.open;
            const Icon = meta.icon;
            const active = f.id === selectedId;
            return (
              <button
                key={f.id}
                onClick={() => onSelect(f.id)}
                className={"block w-full rounded-2xl border p-3 text-left transition " + (
                  active ? "border-brand/50 bg-surface-elevated" : "border-border bg-surface hover:border-brand/30"
                ) + (muted && !active ? " opacity-80" : "")}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <Badge variant="outline" className={"gap-1 text-[10px] uppercase " + meta.cls}>
                    <Icon className="size-3" /> {meta.label}
                  </Badge>
                  <span className="text-muted-foreground">{new Date(f.created_at).toLocaleDateString()}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <Flag className="size-3.5 text-brand-glow" />
                  <span className="font-semibold">{REASON_LABEL[f.reason] ?? f.reason}</span>
                  <span className="truncate text-xs text-muted-foreground">via {(f as any).persona?.display_name ?? "AI persona"}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  From {(f as any).supporter?.display_name ?? "supporter"}
                </div>
                {f.note && <div className="mt-1 line-clamp-2 text-xs text-foreground/80">"{f.note}"</div>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FlagDetail({ flag, onChanged }: { flag: Flag; onChanged: () => void }) {
  const loadCtx = useServerFn(loadFlagContext);
  const resolve = useServerFn(resolveFlag);
  const handoff = useServerFn(handoffFlag);
  const [ctx, setCtx] = useState<Awaited<ReturnType<typeof loadFlagContext>> | null>(null);
  const [busy, setBusy] = useState<"acknowledge" | "dismiss" | "handoff" | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let alive = true;
    setCtx(null);
    loadCtx({ data: { flagId: flag.id } })
      .then((r) => { if (alive) setCtx(r); })
      .catch((e: any) => toast.error(e?.message ?? "Failed to load flag"));
    return () => { alive = false; };
  }, [flag.id, loadCtx]);

  const isOpen = flag.status === "open";
  const meta = STATUS_META[flag.status] ?? STATUS_META.open;
  const Icon = meta.icon;

  async function act(action: "acknowledge" | "dismiss") {
    setBusy(action);
    try {
      await resolve({ data: { flagId: flag.id, action, note: note.trim() || undefined } });
      toast.success(action === "acknowledge" ? "Marked as acknowledged" : "Dismissed");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally { setBusy(null); }
  }

  async function doHandoff() {
    setBusy("handoff");
    try {
      await handoff({ data: { flagId: flag.id, note: note.trim() || undefined } });
      toast.success("You've taken over this chat.", {
        description: "The AI won't reply here anymore — open your direct inbox to reply.",
      });
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to hand off");
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <Flag className="size-4 text-brand-glow" />
            <span className="font-semibold">{REASON_LABEL[flag.reason] ?? flag.reason}</span>
            <span className="text-xs text-muted-foreground">
              from {(flag as any).supporter?.display_name ?? "supporter"} · via {(flag as any).persona?.display_name ?? "AI persona"}
            </span>
            <Badge variant="outline" className={"gap-1 text-[10px] uppercase " + meta.cls}>
              <Icon className="size-3" /> {meta.label}
            </Badge>
          </div>
          {flag.note && <p className="mt-2 text-sm text-foreground/85">"{flag.note}"</p>}
          <div className="mt-1 text-[11px] text-muted-foreground">
            Flagged {new Date(flag.created_at).toLocaleString()}
            {flag.resolved_at && ` · resolved ${new Date(flag.resolved_at).toLocaleString()}`}
          </div>
          {flag.resolution_note && (
            <div className="mt-1 text-xs text-muted-foreground">Your note: {flag.resolution_note}</div>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Conversation</div>
        {!ctx ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center text-xs text-muted-foreground">Loading thread…</div>
        ) : ctx.messages.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center text-xs text-muted-foreground">No messages in this thread.</div>
        ) : (
          <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-xl border border-border bg-background/40 p-3">
            {ctx.messages.map((m: any) => {
              const flagged = m.id === flag.message_id;
              const mine = m.sender_type === "ai";
              return (
                <div key={m.id} className={"flex " + (mine ? "justify-start" : "justify-end")}>
                  <div className={"max-w-[85%] rounded-2xl px-3 py-2 text-sm " + (
                    mine ? "border border-ai/20 bg-surface-elevated" : "bg-brand/20 border border-brand/30"
                  ) + (flagged ? " ring-2 ring-amber-400/60" : "")}>
                    <div className="mb-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                      {m.sender_type === "ai" ? "AI" : m.sender_type === "fan" ? "Supporter" : m.sender_type}
                      {flagged && <span className="text-amber-300">· flagged</span>}
                    </div>
                    <div className="whitespace-pre-wrap">{m.body}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isOpen ? (
        <div className="space-y-3">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            placeholder="Optional note recorded on this flag (not shown to the supporter)…"
            rows={2}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={doHandoff} disabled={!!busy}>
              <UserCheck className="mr-1 size-4" /> {busy === "handoff" ? "Taking over…" : "Take over this chat"}
            </Button>
            <Button variant="outline" onClick={() => act("acknowledge")} disabled={!!busy}>
              <CheckCircle2 className="mr-1 size-4" /> Acknowledge
            </Button>
            <Button variant="ghost" onClick={() => act("dismiss")} disabled={!!busy}>
              <XCircle className="mr-1 size-4" /> Dismiss
            </Button>
            <Link to="/studio/ai-review" className="ml-auto">
              <Button variant="ghost" size="sm">
                <MessageCircle className="mr-1 size-4" /> Open AI review
              </Button>
            </Link>
          </div>
        </div>
      ) : flag.status === "handed_off" ? (
        <Link to="/studio/inbox">
          <Button variant="outline"><MessageCircle className="mr-1 size-4" /> Open direct inbox</Button>
        </Link>
      ) : null}
    </div>
  );
}