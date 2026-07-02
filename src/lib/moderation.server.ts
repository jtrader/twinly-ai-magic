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