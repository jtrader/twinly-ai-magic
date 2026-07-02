import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdult } from "./age-gate.functions";
import { checkRateLimit } from "./rate-limit.server";
import { screenMessage, recordModerationEvent } from "./moderation.server";
import { logAudit } from "./audit.server";

/**
 * Send a fan message to a persona. Persists user + assistant turn.
 * For Real Me personas we do NOT synthesise a reply — the creator must reply
 * (placeholder: we mark the conversation and return null).
 */
export const sendPersonaMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    conversationId?: string;
    creatorHandle: string;
    personaSlug: string;
    content: string;
    attachmentUrl?: string;
    attachmentDurationMs?: number;
    transcript?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdult(context);

    const allowed = await checkRateLimit(supabase, "chat", 30, 300);
    if (!allowed) throw new Error("Too many messages. Please slow down.");

    const hasVoice = !!data.attachmentUrl;
    const screenText = hasVoice ? (data.transcript ?? "") : data.content;
    const severity = await screenMessage(screenText);
    if (severity === "critical" || severity === "high") {
      await recordModerationEvent({
        reporterId: userId,
        targetType: "message_outbound",
        category: "chat_screener",
        severity,
        notes: `Blocked: ${(screenText || data.content).slice(0, 200)}`,
        autoFlagged: true,
      });
      await logAudit(userId, "chat.blocked", { type: "message" }, { severity });
      throw new Error("This message can't be sent. Please rephrase.");
    }

    if (hasVoice && (data.attachmentDurationMs ?? 0) > 60_000) {
      throw new Error("Voice notes are limited to 60 seconds.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Look up creator + persona (public read via admin — cheap and RLS-agnostic)
    const { data: creator } = await supabaseAdmin
      .from("creators").select("id").eq("handle", data.creatorHandle).maybeSingle();
    if (!creator) throw new Error("Creator not found");

    const { data: persona } = await supabaseAdmin
      .from("personas")
      .select("id, kind, display_name, disclosure_label, system_prompt, tone_rules, boundary_rules, voice_reply_enabled, tts_voice")
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
      body: hasVoice ? (data.transcript ?? "") : data.content,
      persona_id: persona.id,
      attachment_url: data.attachmentUrl ?? null,
      attachment_kind: hasVoice ? "audio" : null,
      attachment_duration_ms: data.attachmentDurationMs ?? null,
      transcript: hasVoice ? (data.transcript ?? null) : null,
    });

    let assistantText: string | null = null;
    let isSynthetic = false;
    let assistantVoiceUrl: string | null = null;

    if (persona.kind === "ai") {
      isSynthetic = true;
      const promptText = hasVoice ? (data.transcript || "(voice note)") : data.content;
      // Pull saved few-shot examples for this persona (best-effort)
      const { data: fewshot } = await supabaseAdmin
        .from("persona_saved_messages")
        .select("label, body")
        .eq("persona_id", persona.id)
        .eq("use_as_few_shot", true)
        .eq("kind", "text")
        .order("sort_order", { ascending: true })
        .limit(6);
      assistantText = await generateAiReply(persona, promptText, fewshot ?? []).catch((e) => {
        console.error("[twinly] AI reply failed:", e);
        return `(${persona.display_name} · AI persona) I'm warming up right now — try again in a moment.`;
      });

      // Optional TTS voice reply
      if ((persona as any).voice_reply_enabled) {
        try {
          const { synthesizeSpeech } = await import("./voice.server");
          const { bytes } = await synthesizeSpeech(assistantText, (persona as any).tts_voice ?? "alloy");
          const path = `${conversationId}/${userId}/ai-${crypto.randomUUID()}.mp3`;
          const { error: upErr } = await supabaseAdmin.storage
            .from("voice-messages")
            .upload(path, new Uint8Array(bytes), { contentType: "audio/mpeg", upsert: false });
          if (!upErr) assistantVoiceUrl = path;
        } catch (e) {
          console.error("[twinly] TTS failed:", e);
        }
      }

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_type: "ai",
        body: assistantText,
        ai_generated: true,
        persona_id: persona.id,
        attachment_url: assistantVoiceUrl,
        attachment_kind: assistantVoiceUrl ? "audio" : null,
        transcript: assistantVoiceUrl ? assistantText : null,
      });
    }

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    await logAudit(userId, "chat.message_sent", { type: "conversation", id: conversationId }, {
      persona_kind: persona.kind,
      severity,
      voice: hasVoice,
    });

    return { conversationId, assistantText, assistantVoiceUrl, isSynthetic, kind: persona.kind };
  });

async function generateAiReply(persona: any, userMessage: string, fewshot: Array<{ label: string; body: string | null }> = []): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  const system = [
    persona.system_prompt || `You are ${persona.display_name}, an official AI persona.`,
    `Persona kind: ${persona.kind}. Disclosure label: "${persona.disclosure_label}".`,
    `Always stay in-character. Do not claim to be human. If asked, confirm you are an AI persona.`,
    persona.tone_rules ? `Tone rules: ${JSON.stringify(persona.tone_rules)}` : "",
    persona.boundary_rules ? `Boundaries (never violate): ${JSON.stringify(persona.boundary_rules)}` : "",
    fewshot.length
      ? `Reference replies (mimic tone/voice, do not copy verbatim):\n${fewshot.map((f) => `- ${f.label}: ${f.body ?? ""}`).join("\n")}`
      : "",
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