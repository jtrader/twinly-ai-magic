import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

/** Block another user directly by their auth user id (used for fan targets, where profile id === user id). */
export const blockUserId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.userId === userId) throw new Error("You can't block yourself.");
    const { error } = await supabase
      .from("blocked_users")
      .upsert({ blocker_id: userId, blocked_id: data.userId }, { onConflict: "blocker_id,blocked_id" });
    if (error) throw error;
    await logAudit(userId, "user.blocked", { type: "user", id: data.userId }, {});
    return { ok: true };
  });

export const unblockUserId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("blocked_users")
      .delete()
      .eq("blocker_id", userId).eq("blocked_id", data.userId);
    if (error) throw error;
    await logAudit(userId, "user.unblocked", { type: "user", id: data.userId }, {});
    return { ok: true };
  });

export const isBlockingUserId = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("blocked_users")
      .select("blocker_id")
      .eq("blocker_id", context.userId).eq("blocked_id", data.userId)
      .maybeSingle();
    return { blocking: !!row };
  });

/** Block a creator by their creator-profile id (resolves to the underlying auth user server-side). */
export const blockCreator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: creator, error: cErr } = await supabase
      .from("creators").select("user_id").eq("id", data.creatorId).maybeSingle();
    if (cErr) throw cErr;
    if (!creator) throw new Error("Creator not found");
    if (creator.user_id === userId) throw new Error("You can't block yourself.");
    const { error } = await supabase
      .from("blocked_users")
      .upsert({ blocker_id: userId, blocked_id: creator.user_id }, { onConflict: "blocker_id,blocked_id" });
    if (error) throw error;
    await logAudit(userId, "user.blocked", { type: "creator", id: data.creatorId }, {});
    return { ok: true };
  });

export const unblockCreator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: creator, error: cErr } = await supabase
      .from("creators").select("user_id").eq("id", data.creatorId).maybeSingle();
    if (cErr) throw cErr;
    if (!creator) throw new Error("Creator not found");
    const { error } = await supabase
      .from("blocked_users")
      .delete()
      .eq("blocker_id", userId).eq("blocked_id", creator.user_id);
    if (error) throw error;
    await logAudit(userId, "user.unblocked", { type: "creator", id: data.creatorId }, {});
    return { ok: true };
  });

export const isBlockingCreator = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: creator } = await supabase
      .from("creators").select("user_id").eq("id", data.creatorId).maybeSingle();
    if (!creator) return { blocking: false };
    const { data: row } = await supabase
      .from("blocked_users")
      .select("blocker_id")
      .eq("blocker_id", userId).eq("blocked_id", creator.user_id)
      .maybeSingle();
    return { blocking: !!row };
  });

/** List everyone the signed-in user has blocked, for the account settings page. */
export const listMyBlocks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("blocked_users")
      .select("blocked_id, created_at")
      .eq("blocker_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (!rows || rows.length === 0) return { blocks: [] };
    const blockedIds = rows.map((r: any) => r.blocked_id);
    const { data: profiles } = await supabase
      .from("profiles_public" as any)
      .select("id, display_name, avatar_url")
      .in("id", blockedIds);
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return {
      blocks: rows.map((r: any) => ({
        userId: r.blocked_id,
        createdAt: r.created_at,
        profile: profileMap.get(r.blocked_id) ?? null,
      })),
    };
  });
