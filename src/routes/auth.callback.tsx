import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: AuthCallback,
  head: () => ({
    meta: [{ title: "Signing you in — Twinly.life" }],
  }),
});

function sanitizeRedirect(value: string | null): string {
  if (!value) return "/app";
  if (!value.startsWith("/") || value.startsWith("//")) return "/app";
  return value;
}

async function resolveDestination(fallback: string): Promise<string> {
  try {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) return fallback;
    const { data: rows } = await (supabase as any).rpc("get_my_profile_status");
    const data = Array.isArray(rows) ? rows[0] : rows;
    if (!data || !data.profile_completed_at) return "/account/setup";
  } catch { /* fall through */ }
  return fallback;
}

function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const stored = typeof window !== "undefined" ? window.sessionStorage.getItem("twinly:postAuthRedirect") : null;
    const target = sanitizeRedirect(stored);
    if (typeof window !== "undefined") window.sessionStorage.removeItem("twinly:postAuthRedirect");

    async function go() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const dest = await resolveDestination(target);
        navigate({ to: dest });
        return;
      }
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (cancelled) return;
        if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
          sub.subscription.unsubscribe();
          resolveDestination(target).then((dest) => navigate({ to: dest }));
        }
      });
      // Fallback timeout
      setTimeout(() => {
        if (cancelled) return;
        supabase.auth.getSession().then(({ data }) => {
          if (!data.session) setError("We couldn't complete sign-in. Please try again.");
        });
      }, 6000);
    }
    go();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-sm text-destructive">{error}</p>
            <a href="/auth" className="mt-4 inline-block text-sm underline">Back to sign in</a>
          </>
        ) : (
          <>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <p className="mt-4 text-sm text-muted-foreground">Signing you in…</p>
          </>
        )}
      </div>
    </div>
  );
}