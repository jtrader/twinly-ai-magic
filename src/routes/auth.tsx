import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RoleSignupForm } from "@/components/twinly/RoleSignupForm";
import { TwinlyWordmark } from "@/components/twinly/TwinlyWordmark";

function sanitizeRedirect(value: string | null) {
  if (!value) return "/app";
  if (!value.startsWith("/") || value.startsWith("//")) return "/app";
  return value;
}

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  useEffect(() => {
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const redirectTarget = sanitizeRedirect(params?.get("redirect") ?? null);
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const uid = data.session.user.id;
      const { data: rows } = await (supabase as any).rpc("get_my_profile_status");
      const p = Array.isArray(rows) ? rows[0] : rows;
      const dest = !p || !p.profile_completed_at ? "/account/setup" : redirectTarget;
      navigate({ to: dest as any });
    });
  }, [navigate]);

  // Fire-and-forget: ensure the support admin account exists before any OAuth attempt.
  useEffect(() => {
    const KEY = "twinly:supportAdminBootstrapped";
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(KEY)) return;
    fetch("/api/public/bootstrap-support-admin", { method: "POST" })
      .then(() => window.sessionStorage.setItem(KEY, "1"))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <Link to="/" className="mb-8 text-center font-display text-2xl font-bold">
          <TwinlyWordmark />
        </Link>
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h1 className="font-display text-2xl font-bold"><TwinlyWordmark /></h1>
          <p className="mt-1 text-sm text-muted-foreground">18+ only. Every AI persona is clearly disclosed.</p>
          <div className="mt-4 rounded-xl border border-brand/25 bg-brand/10 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Creators: secure persona setup is connected.</p>
            <p className="mt-1">
              Choose creator or agency during signup to continue into default persona creation, custom persona setup, training inputs, and content-pack assignment.
            </p>
          </div>
          <div className="mt-6"><RoleSignupForm /></div>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          By continuing you agree to our <Link to="/legal/terms" className="underline">Terms</Link> and <Link to="/legal/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
