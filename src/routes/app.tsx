import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useUserRoles } from "@/lib/session";

export const Route = createFileRoute("/app")({ component: AppHome });

function AppHome() {
  const { user, loading } = useSession();
  const roles = useUserRoles(user?.id);
  const navigate = useNavigate();
  const [creator, setCreator] = useState<any>(null);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);
  useEffect(() => {
    if (!user) return;
    supabase.from("creators").select("handle, stage_name").eq("user_id", user.id).maybeSingle().then(({ data }) => setCreator(data));
  }, [user]);

  const isAdmin = roles.includes("admin");
  const isAgency = roles.includes("agency");
  const isCreator = roles.includes("creator");

  return (
    <AppShell>
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Signed in</div>
        <h1 className="mt-1 font-display text-3xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Tile title="Discover creators" desc="Browse verified creators and their personas." to="/discover" cta="Explore" />
        {isCreator && creator && (
          <Tile title="Your creator profile" desc={`@${creator.handle} — manage personas, vault, and disclosures.`} to="/creators/$handle" params={{ handle: creator.handle }} cta="Open" />
        )}
        {isCreator && creator && (
          <Tile title="Persona studio" desc="Create, edit, publish, and reorder your personas." to="/studio/personas" cta="Open studio" />
        )}
        {isCreator && creator && (
          <Tile title="Content vault" desc="Upload assets and control which personas can use them." to="/studio/content" cta="Manage vault" />
        )}
        {isCreator && !creator && <Tile title="Complete creator onboarding" desc="Set a handle, stage name, and consent to launch." to="/onboarding" cta="Start onboarding" />}
        {isCreator && creator && (
          <Tile title="Creator studio" desc="Dashboard with personas, vault, verification, and payouts." to="/studio" cta="Open studio" />
        )}
        {isAgency && <Tile title="Agency dashboard" desc="Managed creators & permissions." to="/agency" cta="Open dashboard" />}
        {isAdmin && <Tile title="Admin console" desc="Verifications, moderation queue, audit log." to="/admin" cta="Open console" />}
      </div>
      <div className="mt-6 flex justify-end">
        <Button variant="ghost" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>Sign out</Button>
      </div>
    </AppShell>
  );
}

function Tile({ title, desc, to, cta, disabled, params }: any) {
  const body = (
    <div className={"h-full rounded-2xl border border-border bg-surface p-5 transition " + (disabled ? "opacity-60" : "hover:border-brand/40 hover:bg-surface-elevated")}>
      <div className="font-display text-lg font-semibold">{title}</div>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-4 text-xs font-semibold text-brand-glow">{cta} →</div>
    </div>
  );
  if (disabled || !to) return <div>{body}</div>;
  return <Link to={to} params={params}>{body}</Link>;
}