import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useUserRoles } from "@/lib/session";
import { useEffect } from "react";

export const Route = createFileRoute("/account")({ component: AccountPage });

function AccountPage() {
  const { user, loading } = useSession();
  const roles = useUserRoles(user?.id);
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);
  return (
    <AppShell>
      <h1 className="font-display text-3xl font-bold">Account</h1>
      <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Roles</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {roles.length === 0
            ? <span className="text-sm text-muted-foreground">—</span>
            : roles.map((r) => (
                <span key={r} className="rounded-full border border-border bg-surface-elevated px-3 py-1 text-xs font-semibold uppercase tracking-widest">{r}</span>
              ))}
        </div>
      </div>
      <div className="mt-6">
        <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>Sign out</Button>
      </div>
    </AppShell>
  );
}