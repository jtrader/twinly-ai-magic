import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";
import { logAudit } from "./audit.server";

/** Stripe Identity client-secret validity window. */
const CLIENT_SECRET_TTL_MS = 24 * 60 * 60 * 1000;
export const LEVEL_ADULT = 1 as const;
export const LEVEL_MONETIZE = 2 as const;

/**
 * Starts (or reuses) a Stripe Identity verification session. The platform
 * never receives or stores the fan's raw ID document, selfie, DOB, or
 * document number (§3 data-minimization) — Stripe's hosted flow handles
 * capture, liveness, and OCR; only the pass/fail result comes back via the
 * signed identity webhook (§2), never from this call's return value.
 *
 * §1 requirements enforced here:
 *   - Server-side only (createServerFn), never exposes the secret key.
 *   - Client reference is the internal user UUID via metadata.userId, never PII.
 *   - Same-day retries reuse the same Stripe session via an idempotency key.
 *   - Existing in-flight sessions are reused rather than duplicated.
 *   - Rate-limited per user via check_rate_limit('identity_session_create').
 */
export const createIdentityVerificationSession = createServerFn({ method: "POST" })
  .validator((d: { environment: StripeEnv; returnUrl: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    // §1: per-user creation rate limit (10 attempts / hour). Fail closed.
    const { data: allowed, error: rlError } = await supabase.rpc("check_rate_limit", {
      _bucket: "identity_session_create",
      _limit: 10,
      _window_seconds: 3600,
    });
    if (rlError || allowed === false) {
      throw new Error("Too many verification attempts. Please try again later.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // §1 reuse: reuse an in-flight pending session (client_secret still valid)
    // rather than minting a new Stripe session on retry.
    const { data: existingPending } = await (supabaseAdmin.from("identity_verifications") as any)
      .select("provider_session_id, client_secret_expires_at")
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .in("status", ["session_created", "pending", "processing", "requires_input"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    try {
      const stripe = createStripeClient(data.environment);

      if (existingPending?.provider_session_id) {
        const csExp = existingPending.client_secret_expires_at
          ? new Date(existingPending.client_secret_expires_at as string).getTime()
          : 0;
        if (csExp > Date.now()) {
          const reused = await stripe.identity.verificationSessions.retrieve(
            existingPending.provider_session_id as string,
          );
          if (reused.client_secret && (reused.status === "requires_input" || reused.status === "processing")) {
            return { clientSecret: reused.client_secret, reused: true } as const;
          }
        }
      }

      // §1: idempotency key — same-day retry for the same user+env hits the
      // same Stripe session; a different day mints fresh.
      const idemKey = `id-vs-${userId}-${data.environment}-${new Date().toISOString().slice(0, 10)}`;
      const session = await stripe.identity.verificationSessions.create(
        {
          type: "document",
          metadata: { userId },
          options: { document: { require_matching_selfie: true } },
          return_url: data.returnUrl,
        },
        { idempotencyKey: idemKey },
      );

      const clientSecretExpires = new Date(Date.now() + CLIENT_SECRET_TTL_MS).toISOString();
      await (supabaseAdmin.from("identity_verifications") as any).upsert(
        {
          user_id: userId,
          provider: "stripe_identity",
          provider_session_id: session.id,
          status: "session_created",
          environment: data.environment,
          client_secret_expires_at: clientSecretExpires,
          verification_method: "document+selfie",
        },
        { onConflict: "provider_session_id" },
      );

      await logAudit(userId, "identity.verification_started", { type: "profile", id: userId }, {});
      return { clientSecret: session.client_secret, reused: false } as const;
    } catch (e) {
      throw new Error(getStripeErrorMessage(e));
    }
  });

/**
 * Server-side guard for content that requires ANY level of Stripe Identity
 * verification (Level 1: verified adult). Layered on top of assertAdult
 * (age-gate.functions.ts), not a replacement — self-attested age still gates
 * general 18+ access; this additionally requires the un-spoofable Stripe
 * Identity result before the most explicit tier will engage.
 *
 * Kept for backwards compatibility with existing call sites; prefer
 * `assertIdLevel(context, 1)` in new code.
 */
export async function assertIdVerified(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("id_verified_at")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) throw new Error("Identity verification check failed");
  if (!(data as any)?.id_verified_at) throw new Error("ID_VERIFICATION_REQUIRED");
}

/**
 * §4 point-of-action check — every Level-1/Level-2 gated action calls this
 * at the moment of the action, not just at signup. Delegates to the
 * SECURITY DEFINER `has_id_level` RPC, which fails closed on expired,
 * redacted, or ambiguous verification.
 */
export async function assertIdLevel(
  context: { supabase: any; userId: string },
  level: 1 | 2,
) {
  const { data, error } = await context.supabase.rpc("has_id_level", {
    _user_id: context.userId,
    _level: level,
  });
  if (error) throw new Error("Verification level check failed");
  if (!data) throw new Error(level === 2 ? "ID_LEVEL_2_REQUIRED" : "ID_VERIFICATION_REQUIRED");
}

/**
 * Read the caller's current verification level, adult status, and expiry so
 * the client can render contextual prompts (§4a "verification is required for
 * <persona>" messaging). Informational only, never a gate — every gate
 * lives server-side via `assertIdLevel`.
 */
export const getMyVerificationLevel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id_verification_level, is_adult_verified, id_verification_expires_at, id_verified_at, id_verification_method",
      )
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = (data ?? {}) as any;
    const notExpired = !row.id_verification_expires_at
      || new Date(row.id_verification_expires_at as string).getTime() > Date.now();
    return {
      level: (row.id_verification_level ?? 0) as 0 | 1 | 2,
      isAdultVerified: !!row.is_adult_verified,
      expiresAt: row.id_verification_expires_at ?? null,
      verifiedAt: row.id_verified_at ?? null,
      method: row.id_verification_method ?? null,
      isCurrent: !!row.is_adult_verified && notExpired,
    };
  });

export const getMyIdentityVerificationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: latest }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id_verified_at, id_verification_level, id_verification_expires_at, is_adult_verified")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("identity_verifications")
        .select("status, created_at, updated_at, expires_at, is_adult_verified")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return {
      idVerifiedAt: (profile as any)?.id_verified_at ?? null,
      level: ((profile as any)?.id_verification_level ?? 0) as 0 | 1 | 2,
      expiresAt: (profile as any)?.id_verification_expires_at ?? null,
      isAdultVerified: !!(profile as any)?.is_adult_verified,
      latestSession: latest ?? null,
    };
  });