import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";
import { screenMessage, recordModerationEvent } from "./moderation.server";

/** List Real Me conversations for the signed-in creator. */
export const listInboxConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: owned } = await supabase
      .from("creators")
      .select("id, handle, stage_name")
      .eq("user_id", userId);
    const creatorIds = (owned ?? []).map((c: any) => c.id);
    if (creatorIds.length === 0) return { conversations: [], creators: [] };

    const { data: personas } = await supabase
      .from("personas")
      .select("id, creator_id, display_name, slug, kind")
      .in("creator_id", creatorIds)
      .eq("kind", "real_me");
    const personaIds = (personas ?? []).map((p: any) => p.id);
    if (personaIds.length === 0) return { conversations: [], creators: owned ?? [] };

    const { data: convos } = await supabase
      .from("conversations")
      .select("id, fan_id, creator_id, persona_id, started_at, last_message_at")
      .in("persona_id", personaIds)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (!convos || convos.length === 0) return { conversations: [], creators: owned ?? [] };

    const fanIds = [...new Set(convos.map((c: any) => c.fan_id))];
    const { data: fans } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", fanIds);
    const fanMap = new Map((fans ?? []).map((f: any) => [f.id, f]));
    const personaMap = new Map((personas ?? []).map((p: any) => [p.id, p]));
    const creatorMap = new Map((owned ?? []).map((c: any) => [c.id, c]));

    const convoIds = convos.map((c: any) => c.id);
    const { data: lastMsgs } = await supabase
      .from("messages")
      .select("conversation_id, body, sender_type, created_at")
      .in("conversation_id", convoIds)
      .order("created_at", { ascending: false })
      .limit(500);
    const lastByConvo = new Map<string, any>();
    for (const m of lastMsgs ?? []) {
      if (!lastByConvo.has(m.conversation_id)) lastByConvo.set(m.conversation_id, m);
    }

    const unreadByConvo = new Map<string, number>();
    for (const cid of convoIds) {
      const msgs = (lastMsgs ?? []).filter((m: any) => m.conversation_id === cid);
      const lastCreator = msgs.find((m: any) => m.sender_type === "creator");
      const cutoff = lastCreator ? new Date(lastCreator.created_at).getTime() : 0;
      const unread = msgs.filter((m: any) => m.sender_type === "fan" && new Date(m.created_at).getTime() > cutoff).length;
      unreadByConvo.set(cid, unread);
    }

    return {
      creators: owned ?? [],
      conversations: convos.map((c: any) => ({
        ...c,
        fan: fanMap.get(c.fan_id) ?? null,
        persona: personaMap.get(c.persona_id) ?? null,
        creator: creatorMap.get(c.creator_id) ?? null,
        last: lastByConvo.get(c.id) ?? null,
        unread: unreadByConvo.get(c.id) ?? 0,
      })),
    };
  });

export const loadInboxThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { conversationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: convo, error } = await supabase
      .from("conversations")
      .select("*, personas(*), creators!inner(id, user_id, handle, stage_name)")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw error;
    if (!convo) throw new Error("Conversation not found");
    if ((convo as any).creators.user_id !== userId) throw new Error("Not authorized");

    const [{ data: messages }, { data: fan }] = await Promise.all([
      supabase.from("messages").select("*").eq("conversation_id", data.conversationId).order("created_at", { ascending: true }),
      supabase.from("profiles").select("id, display_name, avatar_url").eq("id", (convo as any).fan_id).maybeSingle(),
    ]);
    return { convo, messages: messages ?? [], fan };
  });

export const sendCreatorReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    conversationId: string;
    content: string;
    attachmentUrl?: string;
    attachmentDurationMs?: number;
    transcript?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const hasVoice = !!data.attachmentUrl;
    const content = (data.content ?? "").trim();
    if (!hasVoice && !content) throw new Error("Message is empty.");
    if (content.length > 4000) throw new Error("Message too long.");
    if (hasVoice && (data.attachmentDurationMs ?? 0) > 60_000) {
      throw new Error("Voice notes are limited to 60 seconds.");
    }

    const { data: convo, error: convoErr } = await supabase
      .from("conversations")
      .select("id, creator_id, persona_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convoErr) throw convoErr;
    if (!convo) throw new Error("Conversation not found");

    const screenText = hasVoice ? (data.transcript ?? "") : content;
    const severity = await screenMessage(screenText);
    if (severity === "critical" || severity === "high") {
      await recordModerationEvent({
        reporterId: userId,
        targetType: "message_outbound",
        category: "creator_reply_screener",
        severity,
        notes: `Blocked: ${(screenText || content).slice(0, 200)}`,
        autoFlagged: true,
      });
      throw new Error("This reply can't be sent. Please rephrase.");
    }

    const { error: insErr } = await supabase.from("messages").insert({
      conversation_id: data.conversationId,
      sender_type: "creator",
      body: hasVoice ? (data.transcript ?? "") : content,
      persona_id: (convo as any).persona_id,
      ai_generated: false,
      attachment_url: data.attachmentUrl ?? null,
      attachment_kind: hasVoice ? "audio" : null,
      attachment_duration_ms: data.attachmentDurationMs ?? null,
      transcript: hasVoice ? (data.transcript ?? null) : null,
    });
    if (insErr) throw insErr;

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", data.conversationId);

    await logAudit(userId, "inbox.reply_sent", { type: "conversation", id: data.conversationId }, { severity, voice: hasVoice });

    return { ok: true };
  });
