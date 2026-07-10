import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { useSession, useUserRoles } from "@/lib/session";
import { listAgencyOverview } from "@/lib/agency.functions";

export const Route = createFileRoute("/agency")({
  component: AgencyPage,
  head: () => ({
    meta: [
      { title: "Agency dashboard — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function AgencyPage() {
  const { user, loading } = useSession();
  const roles = useUserRoles(user?.id);
  const navigate = useNavigate();
  const [data, setData] = useState<{ agencies: any[]; creators: any[] } | null>(null);
  const load = useServerFn(listAgencyOverview);

  const canAccess = roles.includes("agency") || roles.includes("admin");
  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);
  useEffect(() => {
    if (!user || !canAccess) return;
    load({}).then(setData).catch((e) => toast.error(e?.message ?? "Failed to load"));
  }, [user, roles.join(",")]);

  if (loading || !user) return <AppShell><div className="py-20 text-center text-muted-foreground">Loading...</div></AppShell>;
  if (!canAccess) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
          <h1 className="font-display text-xl font-bold">Agency only</h1>
          <p className="mt-2 text-sm text-muted-foreground">Contact Twinly.life to onboard an agency workspace.</p>
          <Link to="/app" className="mt-4 inline-block"><Button variant="outline">Back to app</Button></Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Agency</div>
        <h1 className="mt-1 font-display text-3xl font-bold">Managed creators</h1>
      </div>

      {!data && <div className="py-20 text-center text-muted-foreground">Loading...</div>}
      {data && data.agencies.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center text-muted-foreground">You don't own any agency workspace yet.</div>
      )}
      {data && data.agencies.length > 0 && (
        <div className="space-y-4">
          {data.agencies.map((a) => {
            const linked = data.creators.filter((c: any) => c.agency_id === a.id);
            return (
              <div key={a.id} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-display text-lg font-semibold">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{linked.length} managed creator{linked.length === 1 ? "" : "s"}</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {linked.map((row: any) => (
                    <Link key={row.creator_id} to="/creators/$handle" params={{ handle: row.creators.handle }} className="flex items-center justify-between rounded-xl border border-border bg-surface-elevated px-4 py-3 hover:border-brand/40">
                      <div>
                        <div className="font-semibold">{row.creators.stage_name}</div>
                        <div className="text-xs text-muted-foreground">@{row.creators.handle}</div>
                      </div>
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{row.creators.verification_status}</div>
                    </Link>
                  ))}
                  {linked.length === 0 && <div className="text-sm text-muted-foreground">No creators linked yet.</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}