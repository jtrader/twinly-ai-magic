import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SecurePersonaSetupHub } from "@/components/twinly/SecurePersonaSetupHub";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/secure/personas")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      throw redirect({
        to: "/auth",
        search: { redirect: "/secure/personas" },
      });
    }
  },
  component: SecurePersonasRoute,
});

function SecurePersonasRoute() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 pt-6 sm:px-6 lg:px-8">
        <Button asChild variant="ghost" className="gap-2 text-muted-foreground hover:text-foreground">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </Button>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground">
          <LockKeyhole className="h-3.5 w-3.5" />
          Logged-in creator area
        </div>
      </div>
      <SecurePersonaSetupHub />
    </main>
  );
}
