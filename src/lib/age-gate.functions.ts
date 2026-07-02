import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Fan self-attests they are 18+. Stamps age_verified_at on the profile. */
export const verifyAge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { attested: boolean }) => d)
  .handler(async ({ data, context }) => {
    if (!data.attested) throw new Error("You must confirm you are 18 or older");

    const { error } = await context.supabase
      .from("profiles")
      .update({ age_verified_at: new Date().toISOString() })
      .eq("id", context.userId);
    if (error) throw error;

    await context.supabase.from("age_gate_events").insert({
      user_id: context.userId,
      method: "self_attest",
    });
    await context.supabase.rpc("log_audit", {
      _action: "age.verified",
      _subject_type: "profile",
      _subject_id: context.userId,
      _metadata: { method: "self_attest" },
    });
    return { ok: true };
  });

/** Server-side guard callable from other server fns. Throws 403-ish if not adult. */
export async function assertAdult(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_adult", { _user_id: context.userId });
  if (error) throw new Error("Age check failed");
  if (!data) throw new Error("AGE_GATE_REQUIRED");
}