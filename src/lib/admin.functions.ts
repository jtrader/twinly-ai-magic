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

// Synthetic content review queue for admins.
export const adminListPendingAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("content_assets")
      .select("id, title, asset_type, is_synthetic, ai_generated_label, approval_status, created_at, creator_id")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const creatorIds = Array.from(new Set((data ?? []).map((a: any) => a.creator_id)));
    const { data: creators } = creatorIds.length
      ? await supabaseAdmin.from("creators").select("id, handle, stage_name").in("id", creatorIds)
      : { data: [] as any[] };
    const byId = new Map((creators ?? []).map((c: any) => [c.id, c]));
    return {
      assets: (data ?? []).map((a: any) => ({ ...a, creator: byId.get(a.creator_id) ?? null })),
    };
  });

export const adminSetAssetApproval = createServerFn({ method: "POST" })
  .validator((d: { assetId: string; status: "approved" | "rejected" | "pending" }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("@/lib/audit.server");
    const { error } = await supabaseAdmin
      .from("content_assets")
      .update({ approval_status: data.status })
      .eq("id", data.assetId);
    if (error) throw error;
    await logAudit(context.userId, "admin.asset_approval_set", { type: "asset", id: data.assetId }, { status: data.status });
    return { ok: true };
  });

// ================= Content Packs =================
export const adminListPendingPacks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("content_packs")
      .select("id, name, slug, pack_type, status, created_at, creator_id")
      .eq("status", "in_review")
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    const creatorIds = Array.from(new Set((data ?? []).map((p: any) => p.creator_id)));
    const { data: creators } = creatorIds.length
      ? await supabaseAdmin.from("creators").select("id, handle, stage_name").in("id", creatorIds)
      : { data: [] as any[] };
    const byId = new Map((creators ?? []).map((c: any) => [c.id, c]));
    const packIds = (data ?? []).map((p: any) => p.id);
    const { data: itemCounts } = packIds.length
      ? await supabaseAdmin.from("content_pack_items").select("pack_id").in("pack_id", packIds)
      : { data: [] as any[] };
    const counts = new Map<string, number>();
    for (const it of itemCounts ?? []) counts.set(it.pack_id, (counts.get(it.pack_id) ?? 0) + 1);
    return {
      packs: (data ?? []).map((p: any) => ({
        ...p,
        creator: byId.get(p.creator_id) ?? null,
        item_count: counts.get(p.id) ?? 0,
      })),
    };
  });

export const adminSetPackApproval = createServerFn({ method: "POST" })
  .validator((d: { packId: string; status: "approved" | "rejected"; note?: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("@/lib/audit.server");
    const { error } = await supabaseAdmin
      .from("content_packs")
      .update({ status: data.status, review_note: data.note ?? null })
      .eq("id", data.packId);
    if (error) throw error;
    await logAudit(context.userId, "admin.pack_approval_set", { type: "pack", id: data.packId }, { status: data.status, note: data.note ?? null });
    return { ok: true };
  });