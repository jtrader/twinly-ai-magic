import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Severity = "low" | "medium" | "high" | "critical";

export async function screenMessage(text: string): Promise<Severity> {
  const { data, error } = await supabaseAdmin.rpc("screen_message", { _text: text });
  if (error) {
    console.error("[twinly] screen_message failed:", error);
    return "low";
  }
  return (data as Severity) ?? "low";
}

export async function recordModerationEvent(params: {
  reporterId?: string | null;
  targetType: string;
  targetId?: string | null;
  category: string;
  severity: Severity;
  notes?: string;
  autoFlagged?: boolean;
}) {
  await supabaseAdmin.from("moderation_events").insert({
    reporter_id: params.reporterId ?? null,
    target_type: params.targetType,
    target_id: params.targetId ?? null,
    category: params.category,
    severity: params.severity,
    status: "open",
    notes: params.notes ?? null,
    auto_flagged: params.autoFlagged ?? false,
  });
}

/**
 * Guardrail engine (design doc item 2) — checks a generated reply against
 * the persona's own explicitness_ceiling. This is the structural hook only:
 * the actual judgment of "does this text read as sfw/suggestive/explicit"
 * is content-moderation-threshold logic, which is explicitly out of scope
 * for this build (non-goal: "No explicit-content generation code, prompts,
 * or moderation thresholds"). Always reports "conforms" today — wire a real
 * classifier here as a dedicated, separately-reviewed piece of work. The
 * logging/rejection plumbing around this stub is real and wired end to end,
 * so dropping in a real classifier later requires no caller changes.
 */
export async function checkCeilingConformance(
  _replyText: string,
  _ceiling: "sfw" | "suggestive" | "explicit",
): Promise<{ conforms: true } | { conforms: false; reason: string }> {
  return { conforms: true };
}

/**
 * Output-filtering layer (defense-in-depth beyond the standing hardening
 * suffix's instructions not to repeat the system prompt): scans a generated
 * reply for a verbatim chunk matching the constructed system prompt, which
 * would indicate the model leaked its own instructions anyway. Pure/sync so
 * it's directly unit-testable without a DB or network call. Whitespace is
 * normalized before comparing so reformatting alone can't dodge detection.
 */
export function detectPromptLeakage(replyText: string, systemPrompt: string, minMatchLength = 40): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const reply = normalize(replyText);
  const prompt = normalize(systemPrompt);
  if (reply.length < minMatchLength || prompt.length < minMatchLength) return false;
  for (let i = 0; i + minMatchLength <= prompt.length; i += minMatchLength) {
    if (reply.includes(prompt.slice(i, i + minMatchLength))) return true;
  }
  return false;
}

/** Wrapper: records a moderation event when a leak is detected, mirroring the ceiling-conformance/screenMessage pattern. */
export async function checkPromptLeakage(
  replyText: string,
  systemPrompt: string,
  ids: { reporterId: string; targetId: string },
): Promise<{ leaked: boolean }> {
  const leaked = detectPromptLeakage(replyText, systemPrompt);
  if (leaked) {
    await recordModerationEvent({
      reporterId: ids.reporterId,
      targetType: "message_outbound_ai",
      targetId: ids.targetId,
      category: "prompt_leak_attempt",
      severity: "high",
      notes: "AI reply contained a verbatim chunk matching its own system prompt.",
      autoFlagged: true,
    });
  }
  return { leaked };
}

export const REPEAT_OFFENDER_THRESHOLD = 3;

/**
 * Increments a user's strike count (called whenever their own message is
 * blocked as critical/high). Crossing the threshold auto-flags a
 * higher-priority moderation event so admin review surfaces repeat
 * offenders, not just individual messages — this doesn't auto-ban; it
 * escalates for human review.
 */
export async function recordStrike(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("increment_strike_count", { _user_id: userId });
  if (error) {
    console.error("[twinly] increment_strike_count failed:", error);
    return 0;
  }
  const count = (data as number) ?? 0;
  if (count >= REPEAT_OFFENDER_THRESHOLD) {
    await recordModerationEvent({
      reporterId: userId,
      targetType: "user",
      targetId: userId,
      category: "repeat_offender",
      severity: "high",
      notes: `Account has ${count} critical/high-severity strikes.`,
      autoFlagged: true,
    });
  }
  return count;
}

/**
 * Volume signal distinct from the functional per-feature rate limiter — a
 * tighter, dedicated bucket whose only job is to flag sudden burst activity
 * for review. Never blocks by itself; the functional limiter (checkRateLimit
 * with the feature's own bucket) already handles hard blocking.
 */
export async function checkAbuseBurst(supabase: any, userId: string, bucket: string): Promise<void> {
  const { checkRateLimit } = await import("./rate-limit.server");
  const underLimit = await checkRateLimit(supabase, `abuse_burst_${bucket}`, 12, 60);
  if (!underLimit) {
    await recordModerationEvent({
      reporterId: userId,
      targetType: "user",
      targetId: userId,
      category: "spam_burst",
      severity: "medium",
      notes: `Sudden message volume in "${bucket}" — over 12 messages in 60s.`,
      autoFlagged: true,
    });
  }
}