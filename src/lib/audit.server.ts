import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Server-only audit log helper. Fires-and-forgets on failure (log + swallow). */
export async function logAudit(
  actorUserId: string | null,
  action: string,
  subject: { type?: string; id?: string } = {},
  metadata: Record<string, any> = {},
) {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: actorUserId,
      action,
      subject_type: subject.type ?? null,
      subject_id: subject.id ?? null,
      metadata: metadata as any,
    });
  } catch (e) {
    console.error("[twinly] audit log failed:", e);
  }
}