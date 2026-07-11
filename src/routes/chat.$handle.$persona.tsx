import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/twinly/AppShell";
import { AiDisclosureBanner } from "@/components/twinly/AiDisclosureBanner";
import { MessageDisclosureTag } from "@/components/twinly/MessageDisclosureTag";
import { PersonaBadge } from "@/components/twinly/PersonaBadge";
import { ReportDialog } from "@/components/twinly/ReportDialog";
import { BlockButton } from "@/components/twinly/BlockButton";
import { RequestRealMeButton } from "@/components/twinly/RequestRealMeButton";
import { FlagConversationButton } from "@/components/twinly/FlagConversationButton";
import { PersonaMemoryPanel } from "@/components/twinly/PersonaMemoryPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { sendPersonaMessage, ensurePersonaConversation, transcribeVoiceObject } from "@/lib/chat.functions";
import { getCreatorAvailability } from "@/lib/away.functions";
import { VoiceRecorder } from "@/components/twinly/VoiceRecorder";
import { VoicePlayer } from "@/components/twinly/VoicePlayer";
import { toast } from "sonner";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Moon } from "lucide-react";

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
    const { data: aiPersonas } = await supabaseAdmin.from("personas")
      .select("slug, display_name, kind, disclosure_label")
      .eq("creator_id", creator.id)
      .eq("kind", "ai")
      .in("visibility", ["public", "subscribers", "vip"])
      .neq("slug", data.persona)
      .order("sort_order", { ascending: true });
    const { data: convo } = await supabase.from("conversations")
      .select("id, ai_suspended").eq("fan_id", userId).eq("persona_id", persona.id).maybeSingle();
    let messages: any[] = [];
    if (convo) {
      const { data: m } = await supabase.from("messages").select("*").eq("conversation_id", convo.id).order("created_at", { ascending: true });
      messages = m ?? [];
    }
    const availability = await getCreatorAvailability({ data: { handle: data.handle } });
    return {
      creator, persona, conversationId: convo?.id ?? null, messages, availability, aiPersonas: aiPersonas ?? [],
      aiSuspended: !!(convo as any)?.ai_suspended,
    };
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
  const [switchedFrom, setSwitchedFrom] = useState<string | null>(null);
  const [aiSuspended, setAiSuspended] = useState(!!initial?.aiSuspended);
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

  // Each persona (and Real Me) is a fully separate conversation thread by
  // design — this doesn't merge histories, it just tells a fan who they're
  // now looking at when they arrive here from another persona's chat page.
  useEffect(() => {
    if (typeof window === "undefined" || !initial) return;
    const key = `twinly:lastPersona:${initial.creator.handle}`;
    const prevSlug = window.sessionStorage.getItem(key);
    if (prevSlug && prevSlug !== initial.persona.slug) {
      setSwitchedFrom(prevSlug);
    }
    window.sessionStorage.setItem(key, initial.persona.slug);
  }, [initial]);

  if (!initial) return <AppShell><div className="py-20 text-center text-muted-foreground">Persona not found.</div></AppShell>;
  const { creator, persona, availability, aiPersonas } = initial;
  const isAway = !!availability?.away_mode;
  const aiPaused = isAway && persona.kind === "ai" && !availability?.away_allow_ai_personas;

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
      if (res.aiSuspended) setAiSuspended(true);
      if (res.assistantText) {
        setMessages((m) => [...m, { id: crypto.randomUUID(), sender_type: "ai", body: res.assistantText, ai_generated: true, created_at: new Date().toISOString() }]);
      } else if (res.kind === "real_me" && !res.awayAutoReply) {
        toast.message("Message delivered to creator", { description: "Real Me replies come from the verified creator directly." });
      } else if (res.aiSuspended) {
        toast.message("Message delivered to creator", { description: "A team member is handling this conversation directly now." });
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
          sender_type: res.awayAutoReply ? "system" : "ai",
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
            <AvailabilityPill away={isAway} />
            <PersonaBadge kind={persona.kind as any} />
            {persona.kind === "ai" && (
              <RequestRealMeButton creatorHandle={creator.handle} personaSlug={persona.slug} />
            )}
            {persona.kind === "ai" && authed && !aiSuspended && (
              <FlagConversationButton conversationId={conversationId} />
            )}
            <ReportDialog targetType="persona" targetId={persona.id} label="Report" />
            <BlockButton targetType="creator" targetId={creator.id} />
          </div>
        </div>
        <AiDisclosureBanner
          kind={persona.kind as any}
          label={persona.disclosure_label}
          personaName={persona.kind === "real_me" ? creator.stage_name : persona.display_name}
          className="sticky top-2 z-10 mb-4 shadow-lg backdrop-blur"
        />
        {persona.kind === "ai" && <PersonaMemoryPanel personaId={persona.id} />}
        {isAway && persona.kind === "real_me" && (
          <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
            <span className="font-semibold">{creator.stage_name} is away.</span>{" "}
            {availability?.away_auto_reply_enabled ? "You'll get an auto-reply on Real Me. " : "Real Me replies are paused. "}
            {availability?.away_allow_ai_personas && aiPersonas.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="self-center">Chat with an AI persona instead:</span>
                {aiPersonas.map((p: any) => (
                  <Link
                    key={p.slug}
                    to="/chat/$handle/$persona"
                    params={{ handle: creator.handle, persona: p.slug }}
                    className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold text-amber-50 hover:bg-amber-400/20"
                  >
                    {p.display_name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
        {aiPaused && (
          <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
            <span className="font-semibold">{creator.stage_name}</span> has paused AI personas while away.
          </div>
        )}
        {aiSuspended && persona.kind === "ai" && (
          <div className="mb-3 rounded-xl border border-real/30 bg-real/5 p-3 text-xs text-foreground/85">
            <span className="font-semibold">{creator.stage_name}</span> is handling this conversation directly — {persona.display_name} won't auto-reply here.
          </div>
        )}

        <div ref={scrollRef} className="min-h-[50vh] flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-surface/60 p-4">
          {messages.length === 0 && (
            <div className="pt-8 text-center text-sm text-muted-foreground">
              Say hi to {persona.display_name}.
            </div>
          )}
          {switchedFrom && (
            <div className="py-1 text-center text-[11px] uppercase tracking-widest text-muted-foreground">
              — Now chatting with {persona.display_name} · {persona.kind === "ai" ? "AI persona" : "Real Me"} —
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={"flex " + (m.sender_type === "fan" ? "justify-end" : "justify-start")}>
              <div className={"max-w-[80%] rounded-2xl px-4 py-2 text-sm " + (
                m.sender_type === "fan"
                  ? "bg-brand text-brand-foreground"
                  : m.sender_type === "ai"
                    ? "bg-surface-elevated border border-ai/20"
                    : m.sender_type === "system"
                      ? "bg-amber-400/5 border border-amber-400/30"
                      : "bg-surface-elevated border border-real/30"
              )}>
                {m.sender_type !== "fan" && (
                  <MessageDisclosureTag senderType={m.sender_type} personaName={persona.display_name} />
                )}
                {m.attachment_kind === "audio" && m.attachment_url && conversationId ? (
                  <VoicePlayer
                    conversationId={conversationId}
                    path={m.attachment_url}
                    transcript={m.transcript}
                    isAiGenerated={m.sender_type === "ai"}
                    durationMs={m.attachment_duration_ms}
                  />
                ) : (
                  <div className="whitespace-pre-wrap">{m.body}</div>
                )}
                {m.sender_type === "ai" && persona.kind === "ai" && authed && conversationId && (
                  <div className="mt-1.5 flex justify-end">
                    <FlagConversationButton conversationId={conversationId} messageId={m.id} compact />
                  </div>
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

function AvailabilityPill({ away }: { away: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${away ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"}`}>
      {away ? <Moon className="size-3" /> : <span className="size-2 rounded-full bg-emerald-400" />}
      {away ? "Away" : "Online"}
    </span>
  );
}