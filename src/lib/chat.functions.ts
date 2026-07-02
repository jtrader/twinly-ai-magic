import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Send a fan message to a persona. Persists user + assistant turn.
 * For Real Me personas we do NOT synthesise a reply — the creator must reply
 * (placeholder: we mark the conversation and return null).
 */
export const sendPersonaMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { conversationId?: string; creatorHandle: string; personaSlug: string; content: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Look up creator + persona (public read via admin — cheap and RLS-agnostic)
    const { data: creator } = await supabaseAdmin
      .from("creators").select("id").eq("handle", data.creatorHandle).maybeSingle();
    if (!creator) throw new Error("Creator not found");

    const { data: persona } = await supabaseAdmin
      .from("personas")
      .select("id, kind, display_name, disclosure_label, system_prompt, tone_rules, boundary_rules")
      .eq("creator_id", creator.id).eq("slug", data.personaSlug).maybeSingle();
    if (!persona) throw new Error("Persona not found");

    // Create-or-fetch conversation (RLS-scoped user client)
    let conversationId = data.conversationId;
    if (!conversationId) {
      const { data: convo, error } = await supabase
        .from("conversations")
        .insert({ fan_id: userId, creator_id: creator.id, persona_id: persona.id })
        .select("id").single();
      if (error) throw error;
      conversationId = convo.id;
    }

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_type: "fan",
      body: data.content,
      persona_id: persona.id,
    });

    let assistantText: string | null = null;
    let isSynthetic = false;

    if (persona.kind === "ai") {
      isSynthetic = true;
      assistantText = await generateAiReply(persona, data.content).catch((e) => {
        console.error("[twinly] AI reply failed:", e);
        return `(${persona.display_name} · AI persona) I'm warming up right now — try again in a moment.`;
      });

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_type: "ai",
        body: assistantText,
        ai_generated: true,
        persona_id: persona.id,
      });
    }

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    return { conversationId, assistantText, isSynthetic, kind: persona.kind };
  });

async function generateAiReply(persona: any, userMessage: string): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  const system = [
    persona.system_prompt || `You are ${persona.display_name}, an official AI persona.`,
    `Persona kind: ${persona.kind}. Disclosure label: "${persona.disclosure_label}".`,
    `Always stay in-character. Do not claim to be human. If asked, confirm you are an AI persona.`,
    persona.tone_rules ? `Tone rules: ${JSON.stringify(persona.tone_rules)}` : "",
    persona.boundary_rules ? `Boundaries (never violate): ${JSON.stringify(persona.boundary_rules)}` : "",
  ].filter(Boolean).join("\n");

  if (!key) return `(${persona.display_name} · AI persona placeholder) ${userMessage.slice(0, 120)} — I hear you. AI Gateway not yet configured; wire LOVABLE_API_KEY to enable real generation.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMessage },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}`);
  const json: any = await res.json();
  return json?.choices?.[0]?.message?.content ?? "(AI persona had no reply)";
}

export const loadConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { conversationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: convo } = await supabase.from("conversations").select("*, personas(*)").eq("id", data.conversationId).maybeSingle();
    const { data: messages } = await supabase.from("messages").select("*").eq("conversation_id", data.conversationId).order("created_at", { ascending: true });
    return { convo, messages: messages ?? [] };
  });