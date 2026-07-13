import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const LEGAL_ACCEPTANCE_VERSION = "2026-07-13";

/** Returns the caller's current legal-acceptance state and the version the app expects. */
export const getLegalAcceptance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("legal_accepted_at, legal_accepted_version")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      acceptedAt: (data as any)?.legal_accepted_at ?? null,
      version: (data as any)?.legal_accepted_version ?? null,
      currentVersion: LEGAL_ACCEPTANCE_VERSION,
    };
  });

const AcceptSchema = z.object({
  version: z.string().trim().min(1).max(40).optional(),
  context: z.string().trim().max(120).optional(),
});

/**
 * Server-authoritative record of legal acceptance. Writes to profile + audit_logs
 * so the acceptance is visible in the admin user log — the client cannot bypass
 * this by skipping the checkbox because every legal-gated server fn calls
 * `requireLegalAcceptance` (or `assertLegalAccepted`) before mutating.
 */
export const acceptLegal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AcceptSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();
    const version = data.version ?? LEGAL_ACCEPTANCE_VERSION;
    const { error } = await supabase
      .from("profiles")
      .update({
        legal_accepted_at: nowIso,
        legal_accepted_version: version,
      } as any)
      .eq("id", userId);
    if (error) throw new Error(error.message);
    try {
      await (supabase as any).rpc("log_audit", {
        _action: "legal.accepted",
        _subject_type: "profile",
        _subject_id: userId,
        _metadata: {
          version,
          context: data.context ?? null,
          accepted_at: nowIso,
        },
      });
    } catch (e) {
      console.warn("[legal-acceptance] audit log failed", e);
    }
    return { ok: true, acceptedAt: nowIso, version };
  });

/**
 * Reusable server-side guard: throws if the caller has not accepted the current
 * legal version. Call from any server fn that must not run for users who never
 * agreed to Terms/Privacy/Acceptable-Use/AI-Disclosure.
 */
export async function assertLegalAccepted(
  context: { supabase: any; userId: string },
  minVersion: string | null = LEGAL_ACCEPTANCE_VERSION,
): Promise<void> {
  const { data, error } = await context.supabase.rpc("has_accepted_legal", {
    _user_id: context.userId,
    _min_version: minVersion,
  });
  if (error) throw new Error("Legal acceptance check failed");
  if (!data) throw new Error("LEGAL_ACCEPTANCE_REQUIRED");
}

/** Middleware form of {@link assertLegalAccepted}; chain after `requireSupabaseAuth`. */
export const requireLegalAcceptance = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    await assertLegalAccepted(context as any);
    return next();
  });