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

async function handleVerified(session: any) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { data: row } = await (sb.from("identity_verifications") as any)
    .update({ status: "verified", verified_at: now, updated_at: now })
    .eq("provider_session_id", session.id)
    .select("user_id")
    .maybeSingle();
  const userId = row?.user_id ?? session.metadata?.userId;
  if (!userId) return;
  await (sb.from("profiles") as any).update({ id_verified_at: now }).eq("id", userId);
}

async function handleNotVerified(session: any, status: "requires_input" | "canceled") {
  const sb = getSupabase();
  await (sb.from("identity_verifications") as any)
    .update({ status, updated_at: new Date().toISOString() })
    .eq("provider_session_id", session.id);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyIdentityWebhook(req, env);
  switch (event.type) {
    case "identity.verification_session.verified":
      await handleVerified(event.data.object);
      break;
    case "identity.verification_session.requires_input":
      await handleNotVerified(event.data.object, "requires_input");
      break;
    case "identity.verification_session.canceled":
      await handleNotVerified(event.data.object, "canceled");
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
