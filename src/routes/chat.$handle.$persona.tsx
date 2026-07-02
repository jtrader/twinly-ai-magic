import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/twinly/AppShell";
import { AiDisclosureBanner } from "@/components/twinly/AiDisclosureBanner";
import { PersonaBadge } from "@/components/twinly/PersonaBadge";
import { ReportDialog } from "@/components/twinly/ReportDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { sendPersonaMessage, ensurePersonaConversation, transcribeVoiceObject } from "@/lib/chat.functions";
import { VoiceRecorder } from "@/components/twinly/VoiceRecorder";
import { VoicePlayer } from "@/components/twinly/VoicePlayer";
import { toast } from "sonner";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const loadPersonaChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { handle: string; persona: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: creator } = await supabaseAdmin.from("creators").select("id, handle, stage_name").eq("handle", data.handle).maybeSingle();
    if (!creator) return null;
    const { data: persona } = await supabaseAdmin.from("personas")
      .select("id, slug, display_name, description, kind, disclosure_label")
      .eq("creator_id", creator.id).eq("slug", data.persona).maybeSingle();
    if (!persona) return null;
    const { data: convo } = await supabase.from("conversations")
      .select("id").eq("fan_id", userId).eq("persona_id", persona.id).maybeSingle();
    let messages: any[] = [];
    if (convo) {
      const { data: m } = await supabase.from("messages").select("*").eq("conversation_id", convo.id).order("created_at", { ascending: true });
      messages = m ?? [];
    }
    return { creator, persona, conversationId: convo?.id ?? null, messages };
  });

export const Route = createFileRoute("/chat/$handle/$persona")({
  loader: ({ params }) => loadPersonaChat({ data: { handle: params.handle, persona: params.persona } }),
  component: ChatPage,
});

function ChatPage() {
  const initial = Route.useLoaderData();
  const params = Route.useParams();
  const [conversationId, setConversationId] = useState<string | null>(initial?.conversationId ?? null);
  const [messages, setMessages] = useState<any[]>(initial?.messages ?? []);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
      setUserId(data.session?.user?.id ?? null);
    });
  }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  if (!initial) return <AppShell><div className="py-20 text-center text-muted-foreground">Persona not found.</div></AppShell>;
  const { creator, persona } = initial;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    if (!authed) { toast.error("Sign in to chat"); return; }
    const content = input;
    setInput("");
    setSending(true);
    const optimistic = { id: crypto.randomUUID(), sender_type: "fan", body: content, created_at: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    try {
      const res = await sendPersonaMessage({ data: { conversationId: conversationId ?? undefined, creatorHandle: params.handle, personaSlug: params.persona, content } });
      setConversationId(res.conversationId);
      if (res.assistantText) {
        setMessages((m) => [...m, { id: crypto.randomUUID(), sender_type: "ai", body: res.assistantText, ai_generated: true, created_at: new Date().toISOString() }]);
      } else if (res.kind === "real_me") {
        toast.message("Message delivered to creator", { description: "Real Me replies come from the verified creator directly." });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send");
    } finally { setSending(false); }
  }

  async function sendVoice({ blob, durationMs, mimeType }: { blob: Blob; durationMs: number; mimeType: string }) {
    if (!authed || !userId) { toast.error("Sign in to chat"); return; }
    if (sending) return;
    setSending(true);
    try {
      let convoId = conversationId;
      if (!convoId) {
        const r = await ensurePersonaConversation({ data: { creatorHandle: params.handle, personaSlug: params.persona } });
        convoId = r.conversationId;
        setConversationId(convoId);
      }
      const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("mpeg") ? "mp3" : mimeType.includes("wav") ? "wav" : "webm";
      const path = `${convoId}/${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("voice-messages").upload(path, blob, { contentType: mimeType, upsert: false });
      if (upErr) throw upErr;
      const { transcript } = await transcribeVoiceObject({ data: { conversationId: convoId, path, mimeType } });
      const optimistic = { id: crypto.randomUUID(), sender_type: "fan", body: transcript ?? "", attachment_url: path, attachment_kind: "audio", attachment_duration_ms: durationMs, transcript, created_at: new Date().toISOString() };
      setMessages((m) => [...m, optimistic]);
      const res = await sendPersonaMessage({ data: { conversationId: convoId, creatorHandle: params.handle, personaSlug: params.persona, content: "", attachmentUrl: path, attachmentDurationMs: durationMs, transcript } });
      setConversationId(res.conversationId);
      if (res.assistantText) {
        setMessages((m) => [...m, {
          id: crypto.randomUUID(),
          sender_type: "ai",
          body: res.assistantText,
          ai_generated: true,
          attachment_url: res.assistantVoiceUrl ?? null,
          attachment_kind: res.assistantVoiceUrl ? "audio" : null,
          transcript: res.assistantVoiceUrl ? res.assistantText : null,
          created_at: new Date().toISOString(),
        }]);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send voice note");
    } finally { setSending(false); }
  }

  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col">
        <Link to="/creators/$handle" params={{ handle: creator.handle }} className="mb-3 text-xs text-muted-foreground hover:text-foreground">← Back to {creator.stage_name}</Link>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">{persona.display_name}</h1>
            <div className="text-xs text-muted-foreground">@{creator.handle}</div>
          </div>
          <div className="flex items-center gap-2">
            <PersonaBadge kind={persona.kind as any} />
            <ReportDialog targetType="persona" targetId={persona.id} label="Report" />
          </div>
        </div>
        <AiDisclosureBanner kind={persona.kind as any} label={persona.disclosure_label} className="mb-4" />

        <div ref={scrollRef} className="min-h-[50vh] flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-surface/60 p-4">
          {messages.length === 0 && (
            <div className="pt-8 text-center text-sm text-muted-foreground">
              Say hi to {persona.display_name}.
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={"flex " + (m.sender_type === "fan" ? "justify-end" : "justify-start")}>
              <div className={"max-w-[80%] rounded-2xl px-4 py-2 text-sm " + (
                m.sender_type === "fan"
                  ? "bg-brand text-brand-foreground"
                  : m.sender_type === "ai"
                    ? "bg-surface-elevated border border-brand/20"
                    : "bg-surface-elevated border border-real/30"
              )}>
                {m.sender_type !== "fan" && (
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {m.sender_type === "ai" ? `${persona.display_name} · AI` : persona.display_name}
                  </div>
                )}
                {m.attachment_kind === "audio" && m.attachment_url && conversationId ? (
                  <VoicePlayer
                    conversationId={conversationId}
                    path={m.attachment_url}
                    transcript={m.transcript}
                    durationMs={m.attachment_duration_ms}
                  />
                ) : (
                  <div className="whitespace-pre-wrap">{m.body}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={send} className="mt-3 flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={authed ? "Type a message..." : "Sign in to chat"} disabled={!authed || sending} />
          <VoiceRecorder disabled={!authed || sending} onSend={sendVoice} />
          <Button type="submit" disabled={!authed || sending || !input.trim()}>Send</Button>
        </form>
        {authed === false && (
          <div className="mt-3 rounded-lg border border-border bg-surface p-3 text-center text-sm">
            <Link to="/auth" className="text-brand-glow underline">Sign in</Link> to start chatting with {persona.display_name}.
          </div>
        )}
      </div>
    </AppShell>
  );
}