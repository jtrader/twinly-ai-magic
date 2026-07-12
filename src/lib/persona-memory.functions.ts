import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { redactObviousPii } from "./prompt-classification.server";

/** How many new messages accumulate before the summary is refreshed — cost
 * control: we summarize periodically instead of replaying full history into
 * every generation call. Pure so it's unit-testable without a DB. */
export function shouldUpdateMemory(messageCount: number, lastCountAtSummary: number, interval = 8): boolean {
  return messageCount - lastCountAtSummary >= interval;
}

/** Formats the memory summary as a system-prompt line, or null if there's
 * nothing worth injecting. Pure so it's unit-testable without a DB. */
export function buildMemoryPromptLine(summary: string | null | undefined): string | null {
  const trimmed = redactObviousPii((summary ?? "").trim());
  if (!trimmed) return null;
  return `What you remember about this supporter (from past conversations): ${trimmed}`;
}

/**
 * Refreshes the (persona, fan) memory summary if enough new messages have
 * accumulated. Only ever called for AI personas (see chat.functions.ts) —
 * Real Me conversations never get a persona_memory row, so the AI/Real-Me
 * boundary is structural, not just an app-level check. Best-effort: never
 * throws into the caller, a failed summarization shouldn't break the chat.
 */
export async function updateMemoryIfDue(personaId: string, fanId: string, conversationId: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: persona } = await supabaseAdmin
      .from("personas").select("memory_enabled, kind, display_name").eq("id", personaId).maybeSingle();
    if (!persona || persona.kind !== "ai" || !persona.memory_enabled) return;

    const { count } = await supabaseAdmin
      .from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId);
    const messageCount = count ?? 0;

    const { data: mem } = await supabaseAdmin
      .from("persona_memory").select("summary, message_count_at_summary")
      .eq("persona_id", personaId).eq("fan_id", fanId).maybeSingle();
    const lastCount = mem?.message_count_at_summary ?? 0;
    if (!shouldUpdateMemory(messageCount, lastCount)) return;

    const key = process.env.LOVABLE_API_KEY;
    if (!key) return; // gateway not configured — skip silently, same fallback as generateAiReply

    const { data: recent } = await supabaseAdmin
      .from("messages").select("sender_type, body").eq("conversation_id", conversationId)
      .order("created_at", { ascending: false }).limit(16);
    const transcript = (recent ?? [])
      .reverse()
      .map((m: any) => `${m.sender_type === "fan" ? "Supporter" : persona.display_name}: ${(m.body ?? "").slice(0, 300)}`)
      .join("\n");

    const system = [
      "You maintain a short, factual memory of what a supporter has told an AI persona across a conversation.",
      "Update the prior summary with new facts from the transcript below — preferences, interests, recurring topics.",
      "Do NOT record the supporter's real name, exact location, contact details (email/phone/social handles), or any other identifying information, even if they share it — capture only their preferences and interests.",
      "Third person, under 400 characters, factual only. If nothing new and notable, return the prior summary unchanged.",
      "Reply with only the updated summary text, nothing else.",
    ].join(" ");
    const user = `Prior summary: ${mem?.summary || "(none yet)"}\n\nRecent transcript:\n${transcript}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (!res.ok) return;
    const json: any = await res.json();
    // The instruction above is the primary control; this is defense-in-depth
    // for the specific PII patterns a regex can actually catch reliably
    // (free-text real-name detection can't be done safely with a regex, so
    // that part rests on the instruction alone).
    const newSummary = redactObviousPii((json?.choices?.[0]?.message?.content ?? "").trim()).slice(0, 600);
    if (!newSummary) return;

    await supabaseAdmin.from("persona_memory").upsert({
      persona_id: personaId,
      fan_id: fanId,
      summary: newSummary,
      message_count_at_summary: messageCount,
      updated_at: new Date().toISOString(),
    }, { onConflict: "persona_id,fan_id" });
  } catch (e) {
    console.error("[twinly] memory summarization failed:", e);
  }
}

/** Supporter-facing: what this persona remembers about the caller. */
export const getMyPersonaMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: mem, error } = await context.supabase
      .from("persona_memory")
      .select("summary, updated_at")
      .eq("persona_id", data.personaId).eq("fan_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    return { memory: mem ?? null };
  });

/** Supporter-facing: clear what this persona remembers about the caller. */
export const resetMyPersonaMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("persona_memory")
      .delete()
      .eq("persona_id", data.personaId).eq("fan_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
