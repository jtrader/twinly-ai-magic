import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type NotificationType = "new_content" | "persona_reply" | "escalation_requested" | "escalation_accepted" | "escalation_declined";

const PREF_FIELD: Partial<Record<NotificationType, "new_content" | "persona_reply" | "escalation_updates">> = {
  new_content: "new_content",
  persona_reply: "persona_reply",
  escalation_requested: "escalation_updates",
  escalation_accepted: "escalation_updates",
  escalation_declined: "escalation_updates",
};

/**
 * Internal helper, called from other server modules (not exposed as a
 * server fn itself). Respects the recipient's notification preferences —
 * a disabled channel/category is a silent no-op, not an error.
 */
export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  linkPath?: string;
  personaId?: string | null;
  isAiGenerated?: boolean;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: prefs } = await supabaseAdmin
    .from("notification_preferences")
    .select("in_app_enabled, new_content, persona_reply, escalation_updates")
    .eq("user_id", params.userId)
    .maybeSingle();

  // No row yet = defaults (all on) apply, matching the column defaults.
  const inAppEnabled = prefs?.in_app_enabled ?? true;
  const categoryField = PREF_FIELD[params.type];
  const categoryEnabled = categoryField ? (prefs?.[categoryField] ?? true) : true;
  if (!inAppEnabled || !categoryEnabled) return { skipped: true };

  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    link_path: params.linkPath ?? null,
    persona_id: params.personaId ?? null,
    is_ai_generated: !!params.isAiGenerated,
  });
  if (error) throw error;
  return { skipped: false };
}

/** Fan out a notification to every follower of a creator (used for "new content published"). */
export async function notifyFollowers(params: {
  creatorId: string;
  type: NotificationType;
  title: string;
  body?: string;
  linkPath?: string;
  personaId?: string | null;
  isAiGenerated?: boolean;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: followers } = await supabaseAdmin
    .from("creator_follows")
    .select("fan_id")
    .eq("creator_id", params.creatorId);
  await Promise.all(
    (followers ?? []).map((f: any) =>
      createNotification({ ...params, userId: f.fan_id }).catch(() => {}),
    ),
  );
}

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id, type, title, body, link_path, persona_id, is_ai_generated, read_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return { notifications: data ?? [] };
  });

export const getUnreadNotificationCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw error;
    return { count: count ?? 0 };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw error;
    return { ok: true };
  });

export const getMyNotificationPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    return {
      preferences: data ?? {
        user_id: context.userId,
        in_app_enabled: true, email_enabled: false, push_enabled: false,
        new_content: true, persona_reply: true, escalation_updates: true,
      },
    };
  });

export const updateMyNotificationPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: Partial<{
    inAppEnabled: boolean; emailEnabled: boolean; pushEnabled: boolean;
    newContent: boolean; personaReply: boolean; escalationUpdates: boolean;
  }>) => d)
  .handler(async ({ data, context }) => {
    const patch: any = { user_id: context.userId, updated_at: new Date().toISOString() };
    if (data.inAppEnabled !== undefined) patch.in_app_enabled = data.inAppEnabled;
    if (data.emailEnabled !== undefined) patch.email_enabled = data.emailEnabled;
    if (data.pushEnabled !== undefined) patch.push_enabled = data.pushEnabled;
    if (data.newContent !== undefined) patch.new_content = data.newContent;
    if (data.personaReply !== undefined) patch.persona_reply = data.personaReply;
    if (data.escalationUpdates !== undefined) patch.escalation_updates = data.escalationUpdates;
    const { error } = await context.supabase
      .from("notification_preferences")
      .upsert(patch, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true };
  });
