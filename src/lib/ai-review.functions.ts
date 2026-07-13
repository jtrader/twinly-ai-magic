import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

/** List AI-persona conversations for the signed-in creator, for review/QA. */
export const listAiConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: owned } = await supabase
      .from("creators")
      .select("id, handle, stage_name")
      .eq("user_id", userId);
    const creatorIds = (owned ?? []).map((c: any) => c.id);
    if (creatorIds.length === 0) return { conversations: [] };

    const { data: personas } = await supabase
      .from("personas")
      .select("id, creator_id, display_name, slug, kind")
      .in("creator_id", creatorIds)
      .eq("kind", "ai");
    const personaIds = (personas ?? []).map((p: any) => p.id);
    if (personaIds.length === 0) return { conversations: [] };

    const { data: convos } = await supabase
      .from("conversations")
      .select("id, fan_id, creator_id, persona_id, started_at, last_message_at")
      .in("persona_id", personaIds)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (!convos || convos.length === 0) return { conversations: [] };

    const fanIds = [...new Set(convos.map((c: any) => c.fan_id))];
    const { data: fans } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", fanIds);
    const fanMap = new Map((fans ?? []).map((f: any) => [f.id, f]));
    const personaMap = new Map((personas ?? []).map((p: any) => [p.id, p]));

    const convoIds = convos.map((c: any) => c.id);
    const { data: lastMsgs } = await supabase
      .from("messages")
      .select("conversation_id, body, sender_type, created_at, moderation_status")
      .in("conversation_id", convoIds)
      .order("created_at", { ascending: false })
      .limit(1000);
    const lastByConvo = new Map<string, any>();
    const flaggedByConvo = new Map<string, number>();
    for (const m of lastMsgs ?? []) {
      if (!lastByConvo.has(m.conversation_id)) lastByConvo.set(m.conversation_id, m);
      if (m.moderation_status === "flagged") {
        flaggedByConvo.set(m.conversation_id, (flaggedByConvo.get(m.conversation_id) ?? 0) + 1);
      }
    }

    return {
      conversations: convos.map((c: any) => ({
        ...c,
        fan: fanMap.get(c.fan_id) ?? null,
        persona: personaMap.get(c.persona_id) ?? null,
        last: lastByConvo.get(c.id) ?? null,
        flaggedCount: flaggedByConvo.get(c.id) ?? 0,
      })),
    };
  });

async function requireConversationOwnership(supabase: any, userId: string, conversationId: string) {
  const { data: convo, error } = await supabase
    .from("conversations")
    .select("id, creator_id, persona_id, fan_id, creators!inner(id, user_id)")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!convo) throw new Error("Conversation not found");
  if ((convo as any).creators.user_id !== userId) throw new Error("Not authorized");
  return convo as { id: string; creator_id: string; persona_id: string; fan_id: string };
}

export const loadAiConversationThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { conversationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const convo = await requireConversationOwnership(supabase, userId, data.conversationId);
    const [{ data: messages }, { data: fan }, { data: persona }] = await Promise.all([
      supabase.from("messages").select("*").eq("conversation_id", data.conversationId).order("created_at", { ascending: true }),
      supabase.from("profiles_public" as any).select("id, display_name, avatar_url").eq("id", convo.fan_id).maybeSingle(),
      supabase.from("personas").select("id, display_name, slug").eq("id", convo.persona_id).maybeSingle(),
    ]);
    return { messages: messages ?? [], fan, persona };
  });

/** Flag or unflag an AI-generated message for QA purposes. */
export const flagAiMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { messageId: string; flagged: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: message, error } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_type")
      .eq("id", data.messageId)
      .maybeSingle();
    if (error) throw error;
    if (!message) throw new Error("Message not found");
    if (message.sender_type !== "ai") throw new Error("Only AI-generated messages can be flagged.");
    await requireConversationOwnership(supabase, userId, message.conversation_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: updErr } = await supabaseAdmin
      .from("messages")
      .update({ moderation_status: data.flagged ? "flagged" : "clean" })
      .eq("id", data.messageId);
    if (updErr) throw updErr;

    await logAudit(userId, data.flagged ? "ai_review.message_flagged" : "ai_review.message_unflagged", { type: "message", id: data.messageId }, {});
    return { ok: true };
  });

/**
 * Save a corrected reply as a few-shot training example for the persona,
 * so future generations follow it. Closes the loop on a flagged bad response.
 */
export const saveCorrectionAsTrainingExample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { messageId: string; correctedBody: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const correctedBody = data.correctedBody.trim();
    if (correctedBody.length < 2) throw new Error("Corrected reply is too short.");
    if (correctedBody.length > 4000) throw new Error("Corrected reply must be 4000 characters or fewer.");

    const { data: message, error } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_type, persona_id, body")
      .eq("id", data.messageId)
      .maybeSingle();
    if (error) throw error;
    if (!message) throw new Error("Message not found");
    if (message.sender_type !== "ai") throw new Error("Only AI-generated messages can be corrected.");
    if (!message.persona_id) throw new Error("Message has no persona.");
    const convo = await requireConversationOwnership(supabase, userId, message.conversation_id);

    const { data: existing } = await supabase
      .from("persona_saved_messages")
      .select("sort_order")
      .eq("persona_id", message.persona_id)
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextSort = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1;

    const { data: row, error: insErr } = await supabase
      .from("persona_saved_messages")
      .insert({
        creator_id: convo.creator_id,
        persona_id: message.persona_id,
        label: `Correction — ${new Date().toLocaleDateString()}`,
        body: correctedBody,
        kind: "text",
        use_as_few_shot: true,
        sort_order: nextSort,
      })
      .select("*")
      .single();
    if (insErr) throw insErr;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("messages").update({ moderation_status: "flagged" }).eq("id", data.messageId);

    await logAudit(userId, "ai_review.correction_saved", { type: "message", id: data.messageId }, { personaId: message.persona_id });
    return { item: row };
  });
