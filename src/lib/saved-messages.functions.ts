import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertCanManagePersona(supabase: any, personaId: string) {
  const { data: persona, error } = await supabase
    .from("personas")
    .select("id, creator_id")
    .eq("id", personaId)
    .maybeSingle();
  if (error) throw error;
  if (!persona) throw new Error("Persona not found");
  const { data: canManage } = await supabase.rpc("can_manage_creator", { _creator_id: persona.creator_id });
  if (!canManage) throw new Error("Not authorized for this persona");
  return persona as { id: string; creator_id: string };
}

export const listSavedMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertCanManagePersona(context.supabase, data.personaId);
    const { data: rows, error } = await context.supabase
      .from("persona_saved_messages")
      .select("*")
      .eq("persona_id", data.personaId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return { items: rows ?? [] };
  });

export const createSavedMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    personaId: string;
    label: string;
    body?: string;
    kind?: "text" | "voice";
    attachmentUrl?: string;
    attachmentDurationMs?: number;
    useAsFewShot?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const persona = await assertCanManagePersona(context.supabase, data.personaId);
    const label = data.label.trim();
    if (!label) throw new Error("Label is required");
    if (label.length > 120) throw new Error("Label too long");
    const { data: existing } = await context.supabase
      .from("persona_saved_messages")
      .select("sort_order")
      .eq("persona_id", data.personaId)
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextSort = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1;
    const { data: row, error } = await context.supabase
      .from("persona_saved_messages")
      .insert({
        creator_id: persona.creator_id,
        persona_id: persona.id,
        label,
        body: data.body ?? null,
        kind: data.kind ?? "text",
        attachment_url: data.attachmentUrl ?? null,
        attachment_duration_ms: data.attachmentDurationMs ?? null,
        use_as_few_shot: !!data.useAsFewShot,
        sort_order: nextSort,
      })
      .select("*")
      .single();
    if (error) throw error;
    return { item: row };
  });

export const updateSavedMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    id: string;
    label?: string;
    body?: string | null;
    useAsFewShot?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.label !== undefined) patch.label = data.label.trim();
    if (data.body !== undefined) patch.body = data.body;
    if (data.useAsFewShot !== undefined) patch.use_as_few_shot = data.useAsFewShot;
    const { data: row, error } = await context.supabase
      .from("persona_saved_messages")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return { item: row };
  });

export const deleteSavedMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("persona_saved_messages")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/**
 * List saved messages for a conversation (looked up via the conversation's persona),
 * scoped to the creator who owns the conversation. Used by the inbox composer.
 */
export const listSavedMessagesForConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { conversationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: convo } = await context.supabase
      .from("conversations")
      .select("persona_id, creator_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!convo) throw new Error("Conversation not found");
    const { data: canManage } = await context.supabase.rpc("can_manage_creator", { _creator_id: (convo as any).creator_id });
    if (!canManage) throw new Error("Not authorized");
    const { data: rows } = await context.supabase
      .from("persona_saved_messages")
      .select("id, label, body, kind, attachment_url, attachment_duration_ms, sort_order")
      .eq("persona_id", (convo as any).persona_id)
      .order("sort_order", { ascending: true });
    return { items: rows ?? [] };
  });