import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(context: { userId: string; supabase: any }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden");
}

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [creators, pending, personas, openReports, users] = await Promise.all([
      supabaseAdmin.from("creators").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("creators").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
      supabaseAdmin.from("personas").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("moderation_events").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
    ]);
    return {
      creators: creators.count ?? 0,
      pendingVerifications: pending.count ?? 0,
      personas: personas.count ?? 0,
      openReports: openReports.count ?? 0,
      users: users.count ?? 0,
    };
  });

export const adminListVerifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("creators")
      .select("id, handle, stage_name, verification_status, digital_twin_status, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return { creators: data ?? [] };
  });

export const adminSetVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId: string; status: "unverified" | "pending" | "verified" | "rejected" }) => d)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("@/lib/audit.server");
    const { error } = await supabaseAdmin
      .from("creators")
      .update({ verification_status: data.status })
      .eq("id", data.creatorId);
    if (error) throw error;
    await logAudit(context.userId, "admin.verification_set", { type: "creator", id: data.creatorId }, { status: data.status });
    return { ok: true };
  });

export const adminRecentAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("audit_logs")
      .select("id, created_at, actor_user_id, action, subject_type, subject_id, metadata")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return { events: data ?? [] };
  });