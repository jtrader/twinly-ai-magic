import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const reportSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    targetType: "creator" | "persona" | "message" | "content_asset" | "conversation";
    targetId?: string;
    category: string;
    notes?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { recordModerationEvent } = await import("@/lib/moderation.server");
    const { logAudit } = await import("@/lib/audit.server");
    await recordModerationEvent({
      reporterId: context.userId,
      targetType: data.targetType,
      targetId: data.targetId ?? null,
      category: data.category,
      severity: "medium",
      notes: data.notes,
      autoFlagged: false,
    });
    await logAudit(context.userId, "moderation.report", { type: data.targetType, id: data.targetId }, { category: data.category });
    return { ok: true };
  });

async function requireAdmin(context: { userId: string; supabase: any }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden");
}

export const adminListModeration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { status?: "open" | "resolved" | "dismissed" } = {}) => d)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = supabaseAdmin
      .from("moderation_events")
      .select("id, created_at, category, severity, status, target_type, target_id, notes, reporter_id, auto_flagged, resolution")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { events: rows ?? [] };
  });

export const adminResolveModeration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; status: "resolved" | "dismissed"; resolution?: string }) => d)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("@/lib/audit.server");
    const { error } = await supabaseAdmin
      .from("moderation_events")
      .update({ status: data.status, resolution: data.resolution ?? null })
      .eq("id", data.id);
    if (error) throw error;
    await logAudit(context.userId, "moderation.resolve", { type: "moderation_event", id: data.id }, { status: data.status });
    return { ok: true };
  });