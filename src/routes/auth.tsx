import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RoleSignupForm } from "@/components/twinly/RoleSignupForm";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <Link to="/" className="mb-8 text-center font-display text-2xl font-bold">
          Twinly<span className="text-brand-glow">.ai</span>
        </Link>
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h1 className="font-display text-2xl font-bold">Enter Twinly.ai</h1>
          <p className="mt-1 text-sm text-muted-foreground">18+ only. Every AI persona is clearly disclosed.</p>
          <div className="mt-6"><RoleSignupForm /></div>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          By continuing you agree to our <Link to="/legal/terms" className="underline">Terms</Link> and <Link to="/legal/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}