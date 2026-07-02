import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session";
import { listInboxConversations, loadInboxThread, sendCreatorReply } from "@/lib/inbox.functions";
import { transcribeVoiceObject } from "@/lib/chat.functions";
import { listSavedMessagesForConversation } from "@/lib/saved-messages.functions";
import { VoiceRecorder } from "@/components/twinly/VoiceRecorder";
import { VoicePlayer } from "@/components/twinly/VoicePlayer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, BookmarkCheck, MessageCircle, Send, User } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/studio/inbox")({
  component: InboxPage,
  head: () => ({
    meta: [
      { title: "Real Me inbox — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Convo = Awaited<ReturnType<typeof listInboxConversations>>["conversations"][number];

function InboxPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [convos, setConvos] = useState<Convo[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const refresh = async () => {
    setLoadingList(true);
    try {
      const res = await listInboxConversations();
      setConvos(res.conversations);
      if (!activeId && res.conversations[0]) setActiveId(res.conversations[0].id);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load inbox");
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
          <h1 className="font-display text-2xl font-bold">Real Me inbox</h1>
        </div>
      </div>

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
                No inbound Real Me messages yet. When a fan messages your Real Me persona, it will appear here.
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
                      <div className="truncate text-[11px] text-muted-foreground">
                        {c.creator?.stage_name} · {c.persona?.display_name}
                      </div>
                    </div>
                  </div>
                  {c.unread > 0 && (
                    <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-brand-foreground">
                      {c.unread}
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
          <ThreadPane key={active.id} conversationId={active.id} onReplied={refresh} />
        ) : (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
            <MessageCircle className="mx-auto mb-3 size-6 opacity-60" />
            Select a conversation to view messages.
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ThreadPane({ conversationId, onReplied }: { conversationId: string; onReplied: () => void }) {
  const [state, setState] = useState<Awaited<ReturnType<typeof loadInboxThread>> | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
  }, []);

  const load = async () => {
    try {
      const res = await loadInboxThread({ data: { conversationId } });
      setState(res);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load thread");
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [conversationId]);

  useEffect(() => {
    listSavedMessagesForConversation({ data: { conversationId } })
      .then((r) => setSaved(r.items ?? []))
      .catch(() => setSaved([]));
  }, [conversationId]);

  // Realtime: refresh on new messages in this conversation
  useEffect(() => {
    const ch = supabase
      .channel(`inbox:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [conversationId]);

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await sendCreatorReply({ data: { conversationId, content } });
      setText("");
      await load();
      onReplied();
    } catch (e: any) {
      toast.error(e.message ?? "Send failed");
    } finally {
      setSending(false);
    }
  };

  const sendVoice = async ({ blob, durationMs, mimeType }: { blob: Blob; durationMs: number; mimeType: string }) => {
    if (!userId || sending) return;
    setSending(true);
    try {
      const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("mpeg") ? "mp3" : mimeType.includes("wav") ? "wav" : "webm";
      const path = `${conversationId}/${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("voice-messages").upload(path, blob, { contentType: mimeType, upsert: false });
      if (error) throw error;
      const { transcript } = await transcribeVoiceObject({ data: { conversationId, path, mimeType } });
      await sendCreatorReply({ data: { conversationId, content: "", attachmentUrl: path, attachmentDurationMs: durationMs, transcript } });
      await load();
      onReplied();
    } catch (e: any) {
      toast.error(e.message ?? "Voice reply failed");
    } finally {
      setSending(false);
    }
  };

  if (!state) {
    return <div className="rounded-2xl border border-border bg-surface p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  const { convo, messages, fan } = state as any;

  return (
    <section className="flex h-[70vh] flex-col rounded-2xl border border-border bg-surface">
      <header className="flex items-center gap-3 border-b border-border p-3">
        <div className="size-9 rounded-full bg-brand/20 grid place-items-center">
          <User className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold">{fan?.display_name ?? "Fan"}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {convo.creators?.stage_name} · Real Me — {convo.personas?.display_name}
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="text-center text-xs text-muted-foreground">No messages yet.</div>
        )}
        {messages.map((m: any) => {
          const mine = m.sender_type === "creator";
          return (
            <div key={m.id} className={"flex " + (mine ? "justify-end" : "justify-start")}>
              <div
                className={
                  "max-w-[75%] rounded-2xl px-3 py-2 text-sm " +
                  (mine
                    ? "bg-brand text-brand-foreground"
                    : m.sender_type === "ai"
                    ? "bg-surface-elevated border border-border"
                    : "bg-surface-elevated")
                }
              >
                {m.attachment_kind === "audio" && m.attachment_url ? (
                  <VoicePlayer conversationId={conversationId} path={m.attachment_url} transcript={m.transcript} durationMs={m.attachment_duration_ms} />
                ) : (
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                )}
                <div className={"mt-1 text-[10px] " + (mine ? "text-brand-foreground/70" : "text-muted-foreground")}>
                  {m.sender_type === "fan" ? "Fan" : m.sender_type === "ai" ? "AI persona" : "You"} ·{" "}
                  {new Date(m.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Reply as your Real Me…"
            className="min-h-[44px] max-h-40 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" title="Saved replies" disabled={saved.length === 0}>
                <BookmarkCheck className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="end">
              <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Saved replies
              </div>
              {saved.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">
                  No saved replies yet. Add some in <Link to="/studio/personas" className="underline">Persona Studio</Link>.
                </div>
              ) : (
                <ul className="max-h-64 overflow-y-auto">
                  {saved.map((s: any) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-surface-elevated"
                        onClick={() => setText((t) => (t ? `${t}\n${s.body ?? ""}` : (s.body ?? "")))}
                      >
                        <div className="text-xs font-semibold">{s.label}</div>
                        {s.body && <div className="line-clamp-2 text-[11px] text-muted-foreground">{s.body}</div>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </PopoverContent>
          </Popover>
          <VoiceRecorder disabled={sending || !userId} onSend={sendVoice} />
          <Button onClick={send} disabled={sending || !text.trim()}>
            <Send className="size-4" />
          </Button>
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          Replies are sent as you (human creator). ⌘/Ctrl + Enter to send.
        </div>
      </div>
    </section>
  );
}
