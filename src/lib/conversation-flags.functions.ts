import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

type Reason = "off_tone" | "inaccurate" | "uncomfortable" | "wants_human" | "other";
const REASONS: Reason[] = ["off_tone", "inaccurate", "uncomfortable", "wants_human", "other"];

/**
 * Sentinel `flagged_by` actor for auto-detected flags — never a real
 * `auth.uid()`, so the existing "Supporter can view own flags" RLS policy
 * (flagged_by = auth.uid()) can never match it and expose an auto-flag to
 * the fan whose message triggered it.
 */
export const SYSTEM_FLAG_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Creates (or reuses, if one is already open for the same conversation +
 * reason) an auto-detected flag, feeding automatic AI-misbehavior detection
 * (severity screening, prompt-leak detection — see chat.functions.ts) into
 * the same creator-facing queue supporter-reported flags already use,
 * rather than building a second, parallel review surface.
 *
 * Fire-and-forget by design: never throws, so a detection failure can never
 * break the chat response path it's called from. Writes via supabaseAdmin
 * because the RLS insert policy requires flagged_by = auth.uid(), which the
 * system sentinel can never satisfy.
 */
export async function autoFlagConversation(params: {
  conversationId: string;
  creatorId: string;
  personaId: string;
  reason: "auto_high_severity" | "auto_prompt_leak";
  severity?: "high" | "critical";
  note?: string;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("conversation_flags")
      .select("id")
      .eq("conversation_id", params.conversationId)
      .eq("flagged_by", SYSTEM_FLAG_ACTOR_ID)
      .eq("reason", params.reason)
      .eq("status", "open")
      .maybeSingle();
    if (existing) return;
    await supabaseAdmin.from("conversation_flags").insert({
      conversation_id: params.conversationId,
      creator_id: params.creatorId,
      persona_id: params.personaId,
      flagged_by: SYSTEM_FLAG_ACTOR_ID,
      reason: params.reason,
      severity: params.severity ?? null,
      note: params.note?.slice(0, 500) ?? null,
    });
  } catch (e) {
    console.error("[twinly] autoFlagConversation failed (non-fatal):", e);
  }
}

async function requireCreatorForUser(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("creators")
    .select("id, handle")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Complete your creator profile first.");
  return data as { id: string; handle: string };
}

/** Supporter flags an AI conversation (or a specific AI message) for creator review. */
export const flagConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { conversationId: string; messageId?: string; reason: Reason; note?: string }) => {
    if (!REASONS.includes(d.reason)) throw new Error("Invalid reason");
    if (d.note && d.note.length > 500) throw new Error("Note must be 500 characters or fewer.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const s = supabase as any;

    // Rate limit: 10 flags per hour per supporter
    const { data: allowed } = await s.rpc("check_rate_limit", {
      _bucket: "conversation_flag",
      _limit: 10,
      _window_seconds: 3600,
    });
    if (allowed === false) throw new Error("You're flagging very quickly — please wait a moment.");

    const { data: convo, error: convoErr } = await s
      .from("conversations")
      .select("id, fan_id, creator_id, persona_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convoErr) throw convoErr;
    if (!convo) throw new Error("Conversation not found");
    if (convo.fan_id !== userId) throw new Error("You can only flag your own conversations.");

    // Only AI personas can be flagged for handoff review
    const { data: persona } = await s
      .from("personas")
      .select("id, kind")
      .eq("id", convo.persona_id)
      .maybeSingle();
    if (!persona || persona.kind !== "ai") {
      throw new Error("Only AI persona conversations can be flagged for creator review.");
    }

    // If a specific message is provided, ensure it belongs to this conversation and is AI
    if (data.messageId) {
      const { data: msg } = await s
        .from("messages")
        .select("id, conversation_id, sender_type")
        .eq("id", data.messageId)
        .maybeSingle();
      if (!msg || msg.conversation_id !== convo.id) throw new Error("Message not found in this conversation.");
      if (msg.sender_type !== "ai") throw new Error("Only AI messages can be flagged.");
    }

    // Prevent duplicate open flags on the same target
    const dedupe = s
      .from("conversation_flags")
      .select("id")
      .eq("flagged_by", userId)
      .eq("conversation_id", convo.id)
      .eq("status", "open");
    const { data: existing } = await (data.messageId
      ? dedupe.eq("message_id", data.messageId)
      : dedupe.is("message_id", null)
    ).maybeSingle();
    if (existing) return { flag: existing, alreadyPending: true };

    const { data: row, error: insErr } = await s
      .from("conversation_flags")
      .insert({
        conversation_id: convo.id,
        message_id: data.messageId ?? null,
        creator_id: convo.creator_id,
        persona_id: convo.persona_id,
        flagged_by: userId,
        reason: data.reason,
        note: data.note?.trim() || null,
      })
      .select("*")
      .single();
    if (insErr) throw insErr;

    await logAudit(userId, "conversation_flag.created", { type: "conversation_flag", id: row.id }, {
      creatorId: convo.creator_id,
      reason: data.reason,
    });

    return { flag: row, alreadyPending: false };
  });

/** Supporter lists their own flags. */
export const listMyConversationFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase as any;
    const { data, error } = await s
      .from("conversation_flags")
      .select("id, status, reason, note, created_at, resolved_at, resolution_note, handoff_conversation_id, creator_id, persona_id, conversation_id")
      .eq("flagged_by", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const flags = data ?? [];
    const creatorIds = [...new Set(flags.map((f: any) => f.creator_id))];
    const personaIds = [...new Set(flags.map((f: any) => f.persona_id))];
    const [{ data: creators }, { data: personas }] = await Promise.all([
      creatorIds.length
        ? s.from("creators").select("id, handle, stage_name").in("id", creatorIds)
        : Promise.resolve({ data: [] }),
      personaIds.length
        ? s.from("personas").select("id, slug, display_name").in("id", personaIds)
        : Promise.resolve({ data: [] }),
    ]);
    const cmap = new Map((creators ?? []).map((c: any) => [c.id, c]));
    const pmap = new Map((personas ?? []).map((p: any) => [p.id, p]));
    return {
      flags: flags.map((f: any) => ({
        ...f,
        creator: cmap.get(f.creator_id) ?? null,
        persona: pmap.get(f.persona_id) ?? null,
      })),
    };
  });

/** Creator queue: all flags for creators they manage. */
export const listCreatorFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreatorForUser(supabase, userId);
    const s = supabase as any;

    const { data, error } = await s
      .from("conversation_flags")
      .select("id, status, reason, note, severity, created_at, resolved_at, resolution_note, handoff_conversation_id, conversation_id, message_id, persona_id, flagged_by")
      .eq("creator_id", creator.id)
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const flags = data ?? [];
    const supporterIds = [...new Set(flags.map((f: any) => f.flagged_by))];
    const personaIds = [...new Set(flags.map((f: any) => f.persona_id))];
    const messageIds = flags.map((f: any) => f.message_id).filter(Boolean);

    const [{ data: profiles }, { data: personas }, { data: messages }] = await Promise.all([
      supporterIds.length
        ? s.from("profiles_public" as any).select("id, display_name, avatar_url").in("id", supporterIds)
        : Promise.resolve({ data: [] }),
      personaIds.length
        ? s.from("personas").select("id, slug, display_name").in("id", personaIds)
        : Promise.resolve({ data: [] }),
      messageIds.length
        ? s.from("messages").select("id, body, created_at").in("id", messageIds)
        : Promise.resolve({ data: [] }),
    ]);
    const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const perMap = new Map((personas ?? []).map((p: any) => [p.id, p]));
    const msgMap = new Map((messages ?? []).map((m: any) => [m.id, m]));

    return {
      creatorId: creator.id,
      flags: flags.map((f: any) => ({
        ...f,
        supporter: pmap.get(f.flagged_by) ?? null,
        persona: perMap.get(f.persona_id) ?? null,
        flagged_message: f.message_id ? msgMap.get(f.message_id) ?? null : null,
      })),
    };
  });

async function loadFlagForCreator(supabase: any, userId: string, flagId: string) {
  const creator = await requireCreatorForUser(supabase, userId);
  const { data: flag, error } = await supabase
    .from("conversation_flags")
    .select("*")
    .eq("id", flagId)
    .eq("creator_id", creator.id)
    .maybeSingle();
  if (error) throw error;
  if (!flag) throw new Error("Flag not found");
  return { creator, flag };
}

/** Creator loads full context (thread + supporter + persona) for a single flag. */
export const loadFlagContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { flagId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { flag } = await loadFlagForCreator(supabase, userId, data.flagId);
    const s = supabase as any;
    const [{ data: messages }, { data: supporter }, { data: persona }] = await Promise.all([
      s.from("messages").select("id, sender_type, body, created_at, ai_generated, moderation_status")
        .eq("conversation_id", flag.conversation_id)
        .order("created_at", { ascending: true }),
      s.from("profiles_public" as any).select("id, display_name, avatar_url").eq("id", flag.flagged_by).maybeSingle(),
      s.from("personas").select("id, slug, display_name, kind").eq("id", flag.persona_id).maybeSingle(),
    ]);
    return { flag, messages: messages ?? [], supporter, persona };
  });

/** Creator resolves a flag without a handoff (acknowledge or dismiss). */
export const resolveFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { flagId: string; action: "acknowledge" | "dismiss"; note?: string }) => {
    if (!["acknowledge", "dismiss"].includes(d.action)) throw new Error("Invalid action");
    if (d.note && d.note.length > 500) throw new Error("Note must be 500 characters or fewer.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { flag } = await loadFlagForCreator(supabase, userId, data.flagId);
    if (flag.status !== "open") throw new Error("This flag has already been resolved.");

    const status = data.action === "acknowledge" ? "acknowledged" : "dismissed";
    const s = supabase as any;
    const { error } = await s
      .from("conversation_flags")
      .update({
        status,
        resolution_note: data.note?.trim() || null,
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", data.flagId);
    if (error) throw error;

    await logAudit(userId, `conversation_flag.${status}`, { type: "conversation_flag", id: data.flagId }, {});
    return { ok: true, status };
  });

/**
 * Creator takes over the flagged conversation directly, in place.
 * This is a same-thread handoff, not a new conversation: AI auto-reply is
 * suspended on this conversation, a system message announces the takeover,
 * and the thread moves into the creator's inbox for manual replies. This is
 * deliberately different from escalation_requests, which opens a separate
 * Real Me thread — repurposing that pattern here would break the AI/Real-Me
 * disclosure-history separation escalation_requests exists to preserve.
 */
export const handoffFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { flagId: string; note?: string }) => {
    if (d.note && d.note.length > 500) throw new Error("Note must be 500 characters or fewer.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { creator, flag } = await loadFlagForCreator(supabase, userId, data.flagId);
    if (flag.status !== "open") throw new Error("This flag has already been resolved.");
    const s = supabase as any;

    const { data: persona } = await s
      .from("personas")
      .select("display_name")
      .eq("id", flag.persona_id)
      .maybeSingle();

    const { error: suspendErr } = await s
      .from("conversations")
      .update({ ai_suspended: true })
      .eq("id", flag.conversation_id);
    if (suspendErr) throw suspendErr;

    await s.from("messages").insert({
      conversation_id: flag.conversation_id,
      sender_type: "system",
      body: `${creator.handle} has taken over this conversation directly. ${persona?.display_name ?? "The AI persona"} won't reply here anymore.`,
      ai_generated: false,
      persona_id: flag.persona_id,
    });

    const { error } = await s
      .from("conversation_flags")
      .update({
        status: "handed_off",
        resolution_note: data.note?.trim() || null,
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
        handoff_conversation_id: flag.conversation_id,
      })
      .eq("id", flag.id);
    if (error) throw error;

    await logAudit(userId, "conversation_flag.handed_off", { type: "conversation_flag", id: flag.id }, {
      conversationId: flag.conversation_id,
    });

    return { ok: true, conversationId: flag.conversation_id, creatorHandle: creator.handle };
  });

/** Small helper used by the studio dashboard to badge the queue. */
export const countOpenCreatorFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: creator } = await (supabase as any)
      .from("creators").select("id").eq("user_id", userId).maybeSingle();
    if (!creator) return { count: 0 };
    const { count, error } = await (supabase as any)
      .from("conversation_flags")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", creator.id)
      .eq("status", "open");
    if (error) throw error;
    return { count: count ?? 0 };
  });