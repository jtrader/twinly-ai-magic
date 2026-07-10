import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session";
import {
  listAiConversations, loadAiConversationThread, flagAiMessage, saveCorrectionAsTrainingExample,
} from "@/lib/ai-review.functions";
import { BlockButton } from "@/components/twinly/BlockButton";
import { ArrowLeft, Bot, Flag, MessageCircle, PencilLine } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/studio/ai-review")({
  component: AiReviewPage,
  head: () => ({
    meta: [
      { title: "AI persona review — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Convo = Awaited<ReturnType<typeof listAiConversations>>["conversations"][number];

function AiReviewPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [convos, setConvos] = useState<Convo[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const refresh = async () => {
    setLoadingList(true);
    try {
      const res = await listAiConversations();
      setConvos(res.conversations);
      if (!activeId && res.conversations[0]) setActiveId(res.conversations[0].id);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load conversations");
    } finally {
      setLoadingList(false);
    }
  };
  useEffect(() => { if (user) refresh(); /* eslint-disable-next-line */ }, [user]);

  const active = useMemo(() => convos.find((c) => c.id === activeId) ?? null, [convos, activeId]);

  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-3">
        <Link to="/studio" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Creator studio</div>
          <h1 className="font-display text-2xl font-bold">AI persona review</h1>
        </div>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Review conversations your AI personas had with fans. Flag bad replies and save a corrected version — it's fed back to that persona as a training example.
      </p>

      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border p-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Conversations
            </div>
            <span className="text-xs text-muted-foreground">{convos.length}</span>
          </div>
          <div className="max-h-[70vh] divide-y divide-border overflow-y-auto">
            {loadingList && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
            {!loadingList && convos.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">
                No AI persona conversations yet. Once fans chat with an AI persona, they'll appear here for review.
              </div>
            )}
            {convos.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={
                  "w-full text-left p-3 transition " +
                  (activeId === c.id ? "bg-surface-elevated" : "hover:bg-surface-elevated/60")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="size-8 shrink-0 rounded-full bg-brand/20 grid place-items-center text-xs font-bold">
                      {(c.fan?.display_name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{c.fan?.display_name ?? "Fan"}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{c.persona?.display_name}</div>
                    </div>
                  </div>
                  {c.flaggedCount > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                      <Flag className="size-3" /> {c.flaggedCount}
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {c.last?.body ?? "No messages yet"}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {active ? (
          <ThreadPane key={active.id} conversationId={active.id} onChanged={refresh} />
        ) : (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
            <MessageCircle className="mx-auto mb-3 size-6 opacity-60" />
            Select a conversation to review.
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ThreadPane({ conversationId, onChanged }: { conversationId: string; onChanged: () => void }) {
  const [state, setState] = useState<Awaited<ReturnType<typeof loadAiConversationThread>> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await loadAiConversationThread({ data: { conversationId } });
      setState(res);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load conversation");
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [conversationId]);

  async function toggleFlag(messageId: string, flagged: boolean) {
    setBusyId(messageId);
    try {
      await flagAiMessage({ data: { messageId, flagged } });
      setState((s) => s ? {
        ...s,
        messages: s.messages.map((m: any) => m.id === messageId ? { ...m, moderation_status: flagged ? "flagged" : "clean" } : m),
      } : s);
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Could not update flag");
    } finally {
      setBusyId(null);
    }
  }

  function startCorrection(messageId: string, currentBody: string) {
    setCorrectingId(messageId);
    setCorrectionText(currentBody);
  }

  async function saveCorrection(messageId: string) {
    setBusyId(messageId);
    try {
      await saveCorrectionAsTrainingExample({ data: { messageId, correctedBody: correctionText } });
      toast.success("Saved as a training example for this persona.");
      setCorrectingId(null);
      setCorrectionText("");
      await load();
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save correction");
    } finally {
      setBusyId(null);
    }
  }

  if (!state) {
    return <div className="rounded-2xl border border-border bg-surface p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  const { messages, fan, persona } = state as any;

  return (
    <section className="flex h-[70vh] flex-col rounded-2xl border border-border bg-surface">
      <header className="flex items-center gap-3 border-b border-border p-3">
        <div className="size-9 rounded-full bg-brand/20 grid place-items-center">
          <Bot className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{fan?.display_name ?? "Fan"}</div>
          <div className="truncate text-[11px] text-muted-foreground">AI persona — {persona?.display_name}</div>
        </div>
        <BlockButton targetType="fan" targetId={fan?.id} size="sm" variant="ghost" />
      </header>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="text-center text-xs text-muted-foreground">No messages yet.</div>
        )}
        {messages.map((m: any) => {
          const isFan = m.sender_type === "fan";
          const isAi = m.sender_type === "ai";
          const flagged = m.moderation_status === "flagged";
          return (
            <div key={m.id} className={"flex flex-col " + (isFan ? "items-start" : "items-end")}>
              <div
                className={
                  "max-w-[80%] rounded-2xl px-3 py-2 text-sm " +
                  (isFan
                    ? "bg-surface-elevated"
                    : flagged
                    ? "border border-destructive/40 bg-destructive/10"
                    : "bg-brand text-brand-foreground")
                }
              >
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div className={"mt-1 text-[10px] " + (isFan ? "text-muted-foreground" : "text-brand-foreground/70")}>
                  {isFan ? "Fan" : isAi ? "AI persona" : m.sender_type} · {new Date(m.created_at).toLocaleString()}
                </div>
              </div>
              {isAi && (
                <div className="mt-1 flex items-center gap-1">
                  <Button
                    size="sm" variant="ghost"
                    className={"h-6 px-2 text-[11px] " + (flagged ? "text-destructive" : "text-muted-foreground")}
                    disabled={busyId === m.id}
                    onClick={() => toggleFlag(m.id, !flagged)}
                  >
                    <Flag className="mr-1 size-3" /> {flagged ? "Flagged" : "Flag"}
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-muted-foreground"
                    disabled={busyId === m.id}
                    onClick={() => startCorrection(m.id, m.body)}
                  >
                    <PencilLine className="mr-1 size-3" /> Correct
                  </Button>
                </div>
              )}
              {isAi && correctingId === m.id && (
                <div className="mt-2 w-full max-w-[80%] rounded-xl border border-border bg-surface-elevated p-3">
                  <div className="mb-1 text-[11px] font-semibold text-muted-foreground">
                    What should {persona?.display_name} have said?
                  </div>
                  <Textarea
                    rows={3} maxLength={4000} value={correctionText}
                    onChange={(e) => setCorrectionText(e.target.value)}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setCorrectingId(null)} disabled={busyId === m.id}>Cancel</Button>
                    <Button size="sm" onClick={() => saveCorrection(m.id)} disabled={busyId === m.id || correctionText.trim().length < 2}>
                      {busyId === m.id ? "Saving…" : "Save as training example"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
