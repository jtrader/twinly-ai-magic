import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyIdentityWebhook } from "@/lib/stripe.server";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

/**
 * §3 age decision + data minimization. We inspect Stripe's `verified_outputs`
 * to derive `is_adult_verified` here on the server, then retain ONLY the
 * minimized field set (§3 explicit list). We NEVER store: DOB, document
 * number, document images, selfie images, full address. Fail-closed: if we
 * can't confidently derive adult=true from verified_outputs, do NOT set
 * is_adult_verified and do NOT promote the profile to Level 1.
 */
function deriveIsAdult(session: any, minAgeYears: number): boolean {
  const dob = session?.verified_outputs?.dob;
  if (!dob || typeof dob.year !== "number" || typeof dob.month !== "number" || typeof dob.day !== "number") {
    return false; // ambiguous → fail closed
  }
  const birth = Date.UTC(dob.year, dob.month - 1, dob.day);
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - minAgeYears);
  return birth <= cutoff.getTime();
}

/**
 * §5 verification expiry: Level-1 grant is not permanent. Re-verify annually
 * by default; risk-based triggers can force re-verification earlier.
 */
const VERIFICATION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

async function handleProcessing(session: any) {
  const sb = getSupabase();
  await (sb.from("identity_verifications") as any)
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("provider_session_id", session.id);
}

async function handleVerified(session: any, stripeEventId: string) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  // §3: 18+ is the platform-wide floor (jurisdiction note: some markets are 21;
  // confirm per-launch and configure at the assertion sites — this is the floor).
  const isAdult = deriveIsAdult(session, 18);
  const country: string | null = session?.verified_outputs?.address?.country
    ?? session?.verified_outputs?.id_number_country
    ?? null;

  // §3: retention set — status, verified_at, is_adult_verified, expiry,
  //     country (operational), method. Nothing more.
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();
  const { data: row } = await (sb.from("identity_verifications") as any)
    .update({
      status: isAdult ? "verified_adult" : "rejected_underage",
      verified_at: now,
      updated_at: now,
      is_adult_verified: isAdult,
      document_country: country,
      expires_at: expiresAt,
      last_stripe_event_id: stripeEventId,
    })
    .eq("provider_session_id", session.id)
    .select("user_id")
    .maybeSingle();
  const userId = row?.user_id ?? session.metadata?.userId;
  if (!userId) return;

  // Fail-closed: only grant Level 1 when Stripe confirmed adult.
  if (!isAdult) {
    await (sb.from("profiles") as any)
      .update({ is_adult_verified: false })
      .eq("id", userId);
    return;
  }

  await (sb.from("profiles") as any).update({
    id_verified_at: now,
    id_verification_expires_at: expiresAt,
    id_verification_method: "document+selfie",
    is_adult_verified: true,
    // Bump to Level 1. Level 2 promotion happens elsewhere (creator/agency
    // onboarding — Pass 3), not from an identity webhook alone.
    id_verification_level: 1,
  }).eq("id", userId);
}

async function handleNotVerified(session: any, status: "requires_input" | "canceled", stripeEventId: string) {
  const sb = getSupabase();
  await (sb.from("identity_verifications") as any)
    .update({ status, updated_at: new Date().toISOString(), last_stripe_event_id: stripeEventId })
    .eq("provider_session_id", session.id);
}

/**
 * §7 redaction: Stripe emits `verification_session.redacted` when we (or a
 * retention job) purge PII from Stripe's side. Mirror that: mark the row
 * redacted and REVOKE Level 1 on the associated profile so previously-open
 * capabilities close immediately (§4 point-of-action re-check will see it).
 */
async function handleRedacted(session: any, stripeEventId: string) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { data: row } = await (sb.from("identity_verifications") as any)
    .update({ status: "redacted", redacted_at: now, updated_at: now, last_stripe_event_id: stripeEventId })
    .eq("provider_session_id", session.id)
    .select("user_id")
    .maybeSingle();
  const userId = row?.user_id ?? session.metadata?.userId;
  if (!userId) return;
  await (sb.from("profiles") as any).update({
    id_verified_at: null,
    id_verification_expires_at: null,
    is_adult_verified: false,
    id_verification_level: 0,
  }).eq("id", userId);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyIdentityWebhook(req, env);

  // §2 idempotency: skip events we've already processed. `event.id` is Stripe's
  // unique event UUID; inserting into the processed-event ledger is an atomic
  // idempotency check (PK conflict = duplicate).
  const evId = (event as any).id;
  if (evId) {
    const sb = getSupabase();
    const { error: dupError } = await (sb.from("identity_webhook_events") as any).insert({
      event_id: evId,
      event_type: event.type,
      environment: env,
    });
    if (dupError && (dupError as any).code === "23505") {
      // Already processed. Ack + return so Stripe stops retrying.
      return;
    }
  }

  switch (event.type) {
    case "identity.verification_session.processing":
      await handleProcessing(event.data.object);
      break;
    case "identity.verification_session.verified":
      await handleVerified(event.data.object, evId ?? "");
      break;
    case "identity.verification_session.requires_input":
      await handleNotVerified(event.data.object, "requires_input", evId ?? "");
      break;
    case "identity.verification_session.canceled":
      await handleNotVerified(event.data.object, "canceled", evId ?? "");
      break;
    case "identity.verification_session.redacted":
      await handleRedacted(event.data.object, evId ?? "");
      break;
    default:
      console.log("Unhandled identity event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/identity/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Identity webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
