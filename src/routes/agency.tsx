import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LogIn } from "lucide-react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { useSession, useUserRoles } from "@/lib/session";
import { listAgencyOverview } from "@/lib/agency.functions";
import { impersonateManagedCreator } from "@/lib/demo.functions";
import { setImpersonationContext } from "@/components/twinly/ImpersonationBanner";

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
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const load = useServerFn(listAgencyOverview);
  const impersonate = useServerFn(impersonateManagedCreator);

  const canAccess = roles.includes("agency") || roles.includes("admin");
  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);
  useEffect(() => {
    if (!user || !canAccess) return;
    load({}).then(setData).catch((e) => toast.error(e?.message ?? "Failed to load"));
  }, [user, roles.join(",")]);

  async function enterStudio(creatorId: string, handle: string, stageName: string | null) {
    setEnteringId(creatorId);
    try {
      const res = await impersonate({ data: { creatorId, redirectPath: "/studio/personas" } });
      setImpersonationContext({
        returnUrl: res.returnUrl,
        adminEmail: res.callerEmail,
        handle,
        kind: "creator",
        targetName: stageName,
      });
      window.location.href = res.url;
    } catch (e: any) {
      toast.error(e?.message ?? "Could not enter studio");
      setEnteringId(null);
    }
  }

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
                    <div key={row.creator_id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
                      <Link to="/creators/$handle" params={{ handle: row.creators.handle }} className="min-w-0 flex-1 hover:text-brand-glow">
                        <div className="truncate font-semibold">{row.creators.stage_name}</div>
                        <div className="truncate text-xs text-muted-foreground">@{row.creators.handle}</div>
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="hidden text-[10px] font-semibold uppercase tracking-widest text-muted-foreground sm:block">{row.creators.verification_status}</div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={enteringId === row.creator_id}
                          onClick={() => enterStudio(row.creator_id, row.creators.handle, row.creators.stage_name)}
                        >
                          <LogIn className="mr-1 size-3.5" />
                          {enteringId === row.creator_id ? "Opening…" : "Enter Studio"}
                        </Button>
                      </div>
                    </div>
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