import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function yearsBetween(dob: Date, now: Date) {
  let y = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) y--;
  return y;
}

/** Fan submits DOB; stores it and stamps age_verified_at when ≥18. */
export const verifyAge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { dob: string }) => d)
  .handler(async ({ data, context }) => {
    const dob = new Date(data.dob);
    if (Number.isNaN(dob.getTime())) throw new Error("Invalid date of birth");
    const age = yearsBetween(dob, new Date());
    if (age < 18) throw new Error("You must be 18 or older to use Twinly.ai");

    const { error } = await context.supabase
      .from("profiles")
      .update({ date_of_birth: data.dob, age_verified_at: new Date().toISOString() })
      .eq("id", context.userId);
    if (error) throw error;

    await context.supabase.from("age_gate_events").insert({
      user_id: context.userId,
      method: "self_attest_dob",
    });
    await context.supabase.rpc("log_audit", {
      _action: "age.verified",
      _subject_type: "profile",
      _subject_id: context.userId,
      _metadata: { age },
    });
    return { ok: true, age };
  });

/** Server-side guard callable from other server fns. Throws 403-ish if not adult. */
export async function assertAdult(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_adult", { _user_id: context.userId });
  if (error) throw new Error("Age check failed");
  if (!data) throw new Error("AGE_GATE_REQUIRED");
}