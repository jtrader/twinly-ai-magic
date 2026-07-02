import { createFileRoute } from "@tanstack/react-router";

const SUPPORT_EMAIL = "support@lovekey.com.au";

/**
 * Idempotent bootstrap endpoint. Creates the support@lovekey.com.au auth
 * user (if missing) and ensures the `admin` role is granted, so the account
 * exists even before the first sign-in. Safe to call multiple times.
 *
 * Only ever affects the single hardcoded support email.
 */
export const Route = createFileRoute("/api/public/bootstrap-support-admin")({
  server: {
    handlers: {
      GET: async () => run(),
      POST: async () => run(),
    },
  },
});

async function run() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Find existing user
  let userId: string | null = null;
  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) return json(500, { error: listErr.message });
  const existing = list.users.find((u) => (u.email ?? "").toLowerCase() === SUPPORT_EMAIL);
  if (existing) userId = existing.id;

  // 2. Create if missing
  let created = false;
  if (!userId) {
    const tempPassword = crypto.randomUUID() + "!Aa1";
    const { data: c, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: SUPPORT_EMAIL,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { display_name: "Twinly Support" },
    });
    if (cErr || !c.user) return json(500, { error: cErr?.message ?? "Failed to create user" });
    userId = c.user.id;
    created = true;
  }

  // 3. Ensure admin role (trigger already grants on confirm, but be defensive)
  const { error: roleErr } = await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
  if (roleErr) return json(500, { error: roleErr.message });

  return json(200, {
    ok: true,
    created,
    userId,
    email: SUPPORT_EMAIL,
    note: created
      ? "Account created. Use the password-reset flow on /auth to set a password."
      : "Account already existed; admin role ensured.",
  });
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}