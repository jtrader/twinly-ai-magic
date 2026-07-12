import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";
import { logAudit } from "./audit.server";

/**
 * Starts a Stripe Identity verification session. The platform never
 * receives or stores the fan's raw ID document/selfie — Stripe's hosted
 * flow (opened client-side with the returned clientSecret) handles capture,
 * liveness, and OCR directly; only the pass/fail result comes back to us,
 * via the identity webhook, not this call.
 */
export const createIdentityVerificationSession = createServerFn({ method: "POST" })
  .validator((d: { environment: StripeEnv; returnUrl: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    try {
      const stripe = createStripeClient(data.environment);
      const session = await stripe.identity.verificationSessions.create({
        type: "document",
        metadata: { userId },
        options: { document: { require_matching_selfie: true } },
        return_url: data.returnUrl,
      });

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("identity_verifications").insert({
        user_id: userId,
        provider: "stripe_identity",
        provider_session_id: session.id,
        status: "pending",
        environment: data.environment,
      });

      await logAudit(userId, "identity.verification_started", { type: "profile", id: userId }, {});
      return { clientSecret: session.client_secret };
    } catch (e) {
      throw new Error(getStripeErrorMessage(e));
    }
  });

/**
 * Server-side guard for the highest-risk content: 'explicit' ceiling AI
 * personas. Layered on top of assertAdult (age-gate.functions.ts), not a
 * replacement — self-attested age still gates general 18+ access, this
 * additionally requires the un-spoofable Stripe Identity result before the
 * most explicit tier will engage.
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

export const getMyIdentityVerificationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: latest }] = await Promise.all([
      supabase.from("profiles").select("id_verified_at").eq("id", userId).maybeSingle(),
      supabase
        .from("identity_verifications")
        .select("status, created_at, updated_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return {
      idVerifiedAt: (profile as any)?.id_verified_at ?? null,
      latestSession: latest ?? null,
    };
  });
