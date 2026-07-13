import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";
import { screenMessage, recordModerationEvent } from "./moderation.server";

/**
 * List every conversation across the creator's personas so the creator can
 * jump into any private chat — Real Me, AI on auto-pilot, or AI handed off —
 * and take over or hand back to the AI twin at their discretion.
 */
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
      .in("creator_id", creatorIds);
    const personaIds = (personas ?? []).map((p: any) => p.id);
    if (personaIds.length === 0) return { conversations: [], creators: owned ?? [] };

    const { data: convos } = await supabase
      .from("conversations")
      .select("id, fan_id, creator_id, persona_id, started_at, last_message_at, ai_suspended")
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
      .select("id, creator_id, persona_id, fan_id, personas:persona_id(display_name, slug), creators:creator_id(handle)")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convoErr) throw convoErr;
    if (!convo) throw new Error("Conversation not found");

    const { data: canManage } = await supabase.rpc("can_manage_creator", {
      _creator_id: (convo as any).creator_id,
    });
    if (!canManage) throw new Error("Not authorized to reply to this conversation.");

    const { data: blocked } = await supabase.rpc("is_blocked", { _a: userId, _b: (convo as any).fan_id });
    if (blocked) throw new Error("Messaging is blocked between you and this fan.");

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

    const { createNotification } = await import("./notifications.functions");
    const personaName = (convo as any).personas?.display_name ?? "Real Me";
    const handle = (convo as any).creators?.handle;
    const slug = (convo as any).personas?.slug;
    await createNotification({
      userId: (convo as any).fan_id,
      type: "persona_reply",
      title: `New reply from ${personaName}`,
      body: hasVoice ? "Sent a voice note" : content.slice(0, 140),
      linkPath: handle && slug ? `/chat/${handle}/${slug}` : undefined,
      personaId: (convo as any).persona_id,
      isAiGenerated: false,
    }).catch(() => {});

    return { ok: true };
  });

/**
 * Creator jumps into any private chat and takes over from the AI twin.
 * Sets ai_suspended=true and posts a system note. Safe to call on Real Me
 * threads (no-op effect since AI wouldn't reply there anyway).
 */
export const takeOverConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { conversationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: convo, error } = await supabase
      .from("conversations")
      .select("id, ai_suspended, persona_id, creator_id, creators!inner(id, user_id, handle), personas:persona_id(display_name, kind)")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw error;
    if (!convo) throw new Error("Conversation not found");
    const { data: canManage } = await supabase.rpc("can_manage_creator", {
      _creator_id: (convo as any).creator_id,
    });
    if (!canManage) throw new Error("Only the creator of this conversation can take it over.");
    if ((convo as any).ai_suspended) return { ok: true, alreadySuspended: true };

    const s = supabase as any;
    const { data: updated, error: upErr } = await s
      .from("conversations")
      .update({ ai_suspended: true })
      .eq("id", data.conversationId)
      .select("id");
    if (upErr) throw upErr;
    if (!updated || updated.length === 0) throw new Error("Not authorized to update this conversation.");
    await s.from("messages").insert({
      conversation_id: data.conversationId,
      sender_type: "system",
      body: `${(convo as any).creators.handle} has taken over this conversation directly. ${(convo as any).personas?.display_name ?? "The AI persona"} won't reply here until auto-pilot is resumed.`,
      ai_generated: false,
      persona_id: (convo as any).persona_id,
    });
    await logAudit(userId, "inbox.takeover", { type: "conversation", id: data.conversationId }, {});
    return { ok: true };
  });

/**
 * Creator hands the conversation back to the AI twin (auto-pilot).
 * Only meaningful for AI personas; Real Me personas ignore the flag.
 */
export const resumeAutoPilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { conversationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: convo, error } = await supabase
      .from("conversations")
      .select("id, ai_suspended, persona_id, creator_id, creators!inner(id, user_id, handle), personas:persona_id(display_name, kind)")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw error;
    if (!convo) throw new Error("Conversation not found");
    const { data: canManage } = await supabase.rpc("can_manage_creator", {
      _creator_id: (convo as any).creator_id,
    });
    if (!canManage) throw new Error("Only the creator of this conversation can resume auto-pilot.");
    if ((convo as any).personas?.kind === "real_me") {
      throw new Error("Real Me conversations don't have an AI auto-pilot to resume.");
    }
    if (!(convo as any).ai_suspended) return { ok: true, alreadyActive: true };

    const s = supabase as any;
    const { data: updated, error: upErr } = await s
      .from("conversations")
      .update({ ai_suspended: false })
      .eq("id", data.conversationId)
      .select("id");
    if (upErr) throw upErr;
    if (!updated || updated.length === 0) throw new Error("Not authorized to update this conversation.");
    await s.from("messages").insert({
      conversation_id: data.conversationId,
      sender_type: "system",
      body: `${(convo as any).personas?.display_name ?? "The AI persona"} is back on auto-pilot in this conversation.`,
      ai_generated: false,
      persona_id: (convo as any).persona_id,
    });
    await logAudit(userId, "inbox.resume_autopilot", { type: "conversation", id: data.conversationId }, {});
    return { ok: true };
  });
