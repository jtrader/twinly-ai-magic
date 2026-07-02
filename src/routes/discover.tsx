import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/twinly/AppShell";
import { PersonaBadge } from "@/components/twinly/PersonaBadge";
import { ShieldCheck } from "lucide-react";

const listCreators = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("creators")
    .select("id, handle, stage_name, bio, verification_status")
    .not("onboarding_completed_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
});

export const Route = createFileRoute("/discover")({
  loader: () => listCreators(),
  component: Discover,
});

function Discover() {
  const creators = Route.useLoaderData();
  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Discover creators</h1>
        <p className="mt-1 text-sm text-muted-foreground">Verified creators. Real Me and official AI personas — always disclosed.</p>
      </div>
      {creators.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center">
          <div className="font-display text-xl font-semibold">No creators yet</div>
          <p className="mt-2 text-sm text-muted-foreground">Twinly.ai is invite-only during preview. Verified creators launching soon.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {creators.map((c: any) => (
            <Link key={c.id} to="/creators/$handle" params={{ handle: c.handle }}
              className="group rounded-2xl border border-border bg-surface p-5 transition hover:border-brand/40 hover:bg-surface-elevated">
              <div className="flex items-center justify-between">
                <div className="font-display text-lg font-semibold">{c.stage_name}</div>
                {c.verification_status === "verified" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-glow">
                    <ShieldCheck className="size-3" /> Verified
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">@{c.handle}</div>
              {c.bio && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{c.bio}</p>}
              <div className="mt-4 flex gap-2">
                <PersonaBadge kind="real_me" />
                <PersonaBadge kind="ai" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}