import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LogIn, Building2, Mail, Check, X, Clock } from "lucide-react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession, useUserRoles } from "@/lib/session";
import { listAgencyOverview, createMyAgencyWorkspace } from "@/lib/agency.functions";
import { listPendingCreatorRequests, decideCreatorAgencyRequest } from "@/lib/agency-connect.functions";
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
  const [pendingByAgency, setPendingByAgency] = useState<Record<string, any[]>>({});
  const [decidingKey, setDecidingKey] = useState<string | null>(null);
  const load = useServerFn(listAgencyOverview);
  const impersonate = useServerFn(impersonateManagedCreator);
  const createWorkspace = useServerFn(createMyAgencyWorkspace);
  const loadPending = useServerFn(listPendingCreatorRequests);
  const decideRequest = useServerFn(decideCreatorAgencyRequest);
  const [workspaceName, setWorkspaceName] = useState("");
  const [creating, setCreating] = useState(false);

  const canAccess = roles.includes("agency") || roles.includes("admin");
  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);
  useEffect(() => {
    if (!user || !canAccess) return;
    load({}).then(setData).catch((e) => toast.error(e?.message ?? "Failed to load"));
  }, [user, roles.join(",")]);

  useEffect(() => {
    if (!data?.agencies?.length) return;
    (async () => {
      const entries = await Promise.all(
        data.agencies.map(async (a: any) => {
          try {
            const r = await loadPending({ data: { agencyId: a.id } });
            return [a.id, r.requests] as const;
          } catch { return [a.id, []] as const; }
        }),
      );
      setPendingByAgency(Object.fromEntries(entries));
    })();
  }, [data?.agencies?.map((a: any) => a.id).join(",")]);

  async function refresh() {
    try { setData(await load({})); } catch (e: any) { toast.error(e?.message ?? "Failed to load"); }
  }

  async function decide(agencyId: string, creatorId: string, decision: "approved" | "declined") {
    const key = `${agencyId}:${creatorId}:${decision}`;
    setDecidingKey(key);
    try {
      await decideRequest({ data: { agencyId, creatorId, decision } });
      toast.success(decision === "approved" ? "Creator approved and linked" : "Request declined");
      setPendingByAgency((cur) => ({
        ...cur,
        [agencyId]: (cur[agencyId] ?? []).filter((r) => r.creator_id !== creatorId),
      }));
      if (decision === "approved") await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update request");
    } finally {
      setDecidingKey(null);
    }
  }

  async function submitCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await createWorkspace({ data: { name: workspaceName.trim() } });
      toast.success("Workspace created");
      setWorkspaceName("");
      await refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not create workspace");
    } finally {
      setCreating(false);
    }
  }

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
          <p className="mt-2 text-sm text-muted-foreground">
            Agency workspaces are invite-only right now. Contact the Twinly team to request access.
          </p>
          <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
            <a href="mailto:support@lovekey.com.au?subject=Agency%20workspace%20request">
              <Button className="w-full sm:w-auto"><Mail className="mr-2 size-4" />Request access</Button>
            </a>
            <Link to="/app"><Button variant="outline" className="w-full sm:w-auto">Back to app</Button></Link>
          </div>
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
        <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <Building2 className="size-5 text-brand-glow" />
            <div>
              <div className="font-display text-lg font-semibold">Create your agency workspace</div>
              <p className="text-sm text-muted-foreground">Name it now — you can link creators to it afterward, or ask Twinly support to attach existing creators.</p>
            </div>
          </div>
          <form onSubmit={submitCreateWorkspace} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="e.g. Nova Talent Group"
              maxLength={80}
              minLength={2}
              required
              className="flex-1"
            />
            <Button type="submit" disabled={creating || workspaceName.trim().length < 2}>
              {creating ? "Creating…" : "Create workspace"}
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Need help onboarding managed creators?{" "}
            <a href="mailto:support@lovekey.com.au?subject=Agency%20onboarding" className="text-brand-glow underline">
              Email Twinly support
            </a>.
          </p>
        </div>
      )}
      {data && data.agencies.length > 0 && (
        <div className="space-y-4">
          {data.agencies.map((a) => {
            const linked = data.creators.filter((c: any) => c.agency_id === a.id);
            const pending = pendingByAgency[a.id] ?? [];
            return (
              <div key={a.id} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-display text-lg font-semibold">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{linked.length} managed creator{linked.length === 1 ? "" : "s"}</div>
                  </div>
                </div>

                {pending.length > 0 && (
                  <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-300">
                      <Clock className="size-3.5" /> Pending creator requests ({pending.length})
                    </div>
                    <div className="space-y-2">
                      {pending.map((r: any) => (
                        <div key={r.creator_id} className="rounded-lg border border-border bg-surface-elevated p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-semibold">{r.creators.stage_name}</div>
                              <div className="truncate text-xs text-muted-foreground">@{r.creators.handle}</div>
                              <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                                <div><span className="text-muted-foreground">Email:</span> {r.contact_email ?? "—"}</div>
                                <div><span className="text-muted-foreground">Phone:</span> {r.contact_phone ?? "—"}</div>
                              </div>
                              {Array.isArray(r.requested_scopes) && r.requested_scopes.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {r.requested_scopes.map((s: string) => (
                                    <span key={s} className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] uppercase tracking-widest">{s.replace(/_/g, " ")}</span>
                                  ))}
                                </div>
                              )}
                              {r.request_note && (
                                <p className="mt-2 rounded-md border border-border bg-surface p-2 text-xs italic text-muted-foreground">"{r.request_note}"</p>
                              )}
                              <div className="mt-1 text-[10px] text-muted-foreground">
                                Agreement {r.agreement_version} accepted {r.agreement_accepted_at ? new Date(r.agreement_accepted_at).toLocaleString() : ""}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                              <Button
                                size="sm"
                                disabled={decidingKey?.startsWith(`${a.id}:${r.creator_id}:`)}
                                onClick={() => decide(a.id, r.creator_id, "approved")}
                              >
                                <Check className="mr-1 size-3.5" />
                                {decidingKey === `${a.id}:${r.creator_id}:approved` ? "Approving…" : "Approve"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={decidingKey?.startsWith(`${a.id}:${r.creator_id}:`)}
                                onClick={() => decide(a.id, r.creator_id, "declined")}
                              >
                                <X className="mr-1 size-3.5" />
                                {decidingKey === `${a.id}:${r.creator_id}:declined` ? "Declining…" : "Decline"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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