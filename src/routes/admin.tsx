import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { useSession, useUserRoles } from "@/lib/session";
import { adminOverview, adminListVerifications, adminSetVerification, adminRecentAudit } from "@/lib/admin.functions";
import { adminListModeration, adminResolveModeration } from "@/lib/moderation.functions";
import { adminListPendingAssets, adminSetAssetApproval } from "@/lib/admin.functions";
import { adminListPendingPacks, adminSetPackApproval } from "@/lib/admin.functions";
import { adminListPendingTwinRefs, adminSetTwinRefReview, adminGetTwinRefSignedUrl } from "@/lib/twin.functions";
import { adminListDemoCreators, adminSeedDemoCreators, adminImpersonateCreator } from "@/lib/demo.functions";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Admin console — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function AdminPage() {
  const { user, loading } = useSession();
  const roles = useUserRoles(user?.id);
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const [tab, setTab] = useState<"overview" | "verifications" | "moderation" | "synthetic" | "packs" | "twin" | "audit" | "demo">("overview");
  const [stats, setStats] = useState<any>(null);
  const [creators, setCreators] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [pendingAssets, setPendingAssets] = useState<any[]>([]);
  const [pendingPacks, setPendingPacks] = useState<any[]>([]);
  const [pendingTwin, setPendingTwin] = useState<any[]>([]);
  const [twinPreviews, setTwinPreviews] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [demo, setDemo] = useState<{ seeded: any[]; available: any[]; emails: Record<string, string | null> } | null>(null);

  const overview = useServerFn(adminOverview);
  const listVer = useServerFn(adminListVerifications);
  const setVer = useServerFn(adminSetVerification);
  const listMod = useServerFn(adminListModeration);
  const resolveMod = useServerFn(adminResolveModeration);
  const listAudit = useServerFn(adminRecentAudit);
  const listPending = useServerFn(adminListPendingAssets);
  const setApproval = useServerFn(adminSetAssetApproval);
  const listPendingPacks_ = useServerFn(adminListPendingPacks);
  const setPackApproval = useServerFn(adminSetPackApproval);
  const listPendingTwin = useServerFn(adminListPendingTwinRefs);
  const setTwinReview = useServerFn(adminSetTwinRefReview);
  const signTwin = useServerFn(adminGetTwinRefSignedUrl);
  const listDemo = useServerFn(adminListDemoCreators);
  const seedDemo = useServerFn(adminSeedDemoCreators);
  const impersonate = useServerFn(adminImpersonateCreator);

  useEffect(() => {
    if (!user || !roles.includes("admin")) return;
    (async () => {
      try {
        if (tab === "overview") setStats(await overview({}));
        if (tab === "verifications") setCreators((await listVer({})).creators);
        if (tab === "moderation") setEvents((await listMod({ data: {} })).events);
        if (tab === "audit") setAudit((await listAudit({})).events);
        if (tab === "synthetic") setPendingAssets((await listPending({})).assets);
        if (tab === "packs") setPendingPacks((await listPendingPacks_({})).packs);
        if (tab === "twin") {
          const r = (await listPendingTwin({})).refs;
          setPendingTwin(r);
          const entries: Array<[string, string]> = [];
          for (const it of r.slice(0, 30)) {
            try { const { url } = await signTwin({ data: { id: it.id } }); entries.push([it.id, url]); } catch { /* ignore */ }
          }
          setTwinPreviews(Object.fromEntries(entries));
        }
        if (tab === "demo") setDemo(await listDemo({}));
      } catch (e: any) { toast.error(e?.message ?? "Failed to load"); }
    })();
  }, [tab, user, roles.join(",")]);

  if (loading || !user) return <AppShell><div className="py-20 text-center text-muted-foreground">Loading...</div></AppShell>;
  if (!roles.includes("admin")) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
          <h1 className="font-display text-xl font-bold">Admin only</h1>
          <p className="mt-2 text-sm text-muted-foreground">You don't have admin access.</p>
          <Link to="/app" className="mt-4 inline-block"><Button variant="outline">Back to app</Button></Link>
        </div>
      </AppShell>
    );
  }

  async function updateVerification(creatorId: string, status: any) {
    setBusy(creatorId);
    try {
      await setVer({ data: { creatorId, status } });
      setCreators((prev) => prev.map((c) => c.id === creatorId ? { ...c, verification_status: status } : c));
      toast.success(`Marked ${status}`);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  }

  async function resolve(id: string, status: "resolved" | "dismissed") {
    setBusy(id);
    try {
      const resolution = window.prompt(`Optional note visible to reporter (${status}):`, "") ?? undefined;
      await resolveMod({ data: { id, status, resolution: resolution || undefined } });
      setEvents((prev) => prev.map((e) => e.id === id ? { ...e, status, resolution: resolution || e.resolution } : e));
      toast.success(status);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  }

  async function decideAsset(id: string, status: "approved" | "rejected") {
    setBusy(id);
    try {
      await setApproval({ data: { assetId: id, status } });
      setPendingAssets((prev) => prev.filter((a) => a.id !== id));
      toast.success(status);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  }

  async function decidePack(id: string, status: "approved" | "rejected") {
    setBusy(id);
    try {
      const note = status === "rejected" ? (window.prompt("Optional reviewer note visible to creator:", "") ?? undefined) : undefined;
      await setPackApproval({ data: { packId: id, status, note: note || undefined } });
      setPendingPacks((prev) => prev.filter((p) => p.id !== id));
      toast.success(status);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  }

  async function decideTwin(id: string, status: "approved" | "rejected") {
    setBusy(id);
    try {
      const note = status === "rejected" ? (window.prompt("Optional reviewer note visible to creator:", "") ?? undefined) : undefined;
      await setTwinReview({ data: { id, status, note: note || undefined } });
      setPendingTwin((prev) => prev.filter((r) => r.id !== id));
      toast.success(status);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  }

  async function runSeed() {
    setBusy("seed");
    try {
      const { results } = await seedDemo({});
      const created = results.filter((r: any) => r.status === "created").length;
      const existed = results.filter((r: any) => r.status === "existed").length;
      const errored = results.filter((r: any) => r.status === "error");
      if (errored.length) toast.error(`Some demo creators failed: ${errored.map((e: any) => e.handle).join(", ")}`);
      toast.success(`Seeded ${created} new · ${existed} already existed`);
      setDemo(await listDemo({}));
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  }

  async function signInAs(creatorId: string, handle: string) {
    if (!window.confirm(`Sign in as @${handle}?\n\nThis will REPLACE your current admin session in this browser. Open the link in a private/incognito window to keep your admin session.`)) return;
    setBusy(creatorId);
    try {
      const { url } = await impersonate({ data: { creatorId } });
      window.open(url, "_blank", "noopener");
      toast.success(`Impersonation link opened for @${handle}`);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  }

  return (
    <AppShell>
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Admin</div>
        <h1 className="mt-1 font-display text-3xl font-bold">Console</h1>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-2">
        {(["overview","verifications","moderation","synthetic","packs","twin","audit","demo"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={"rounded-md px-3 py-1.5 text-sm font-medium " + (tab === t ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-surface")}
          >{t}</button>
        ))}
      </div>

      {tab === "overview" && stats && (
        <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Users" value={stats.users} />
          <Stat label="Creators" value={stats.creators} />
          <Stat label="Pending verifications" value={stats.pendingVerifications} tone={stats.pendingVerifications > 0 ? "warn" : "ok"} />
          <Stat label="Personas" value={stats.personas} />
          <Stat label="Open reports" value={stats.openReports} tone={stats.openReports > 0 ? "warn" : "ok"} />
        </div>
        <div className="mt-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Analytics (placeholders)</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="DAU" value="—" />
            <Stat label="Messages / day" value="—" />
            <Stat label="GMV (MTD)" value="—" />
            <Stat label="Age-gate pass rate" value="—" />
          </div>
        </div>
        </>
      )}

      {tab === "synthetic" && (
        <div className="space-y-2">
          {pendingAssets.map((a) => (
            <div key={a.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{a.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.asset_type} · {a.creator ? `@${a.creator.handle}` : "unknown"} · {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="inline-flex gap-1">
                  <Button size="sm" variant="outline" disabled={busy === a.id} onClick={() => decideAsset(a.id, "approved")}>Approve</Button>
                  <Button size="sm" variant="ghost" disabled={busy === a.id} onClick={() => decideAsset(a.id, "rejected")}>Reject</Button>
                </div>
              </div>
            </div>
          ))}
          {pendingAssets.length === 0 && <div className="rounded-2xl border border-border bg-surface p-8 text-center text-muted-foreground">No synthetic assets awaiting review.</div>}
        </div>
      )}

      {tab === "packs" && (
        <div className="space-y-2">
          {pendingPacks.map((p) => (
            <div key={p.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{p.name} <span className="ml-2 rounded-full border border-border bg-background/40 px-2 py-0.5 text-[10px] uppercase text-muted-foreground">{p.pack_type}</span></div>
                  <div className="text-xs text-muted-foreground">
                    {p.item_count} item{p.item_count === 1 ? "" : "s"} · {p.creator ? `@${p.creator.handle}` : "unknown"} · {new Date(p.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="inline-flex gap-1">
                  <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => decidePack(p.id, "approved")}>Approve</Button>
                  <Button size="sm" variant="ghost" disabled={busy === p.id} onClick={() => decidePack(p.id, "rejected")}>Reject</Button>
                </div>
              </div>
            </div>
          ))}
          {pendingPacks.length === 0 && <div className="rounded-2xl border border-border bg-surface p-8 text-center text-muted-foreground">No packs awaiting review.</div>}
        </div>
      )}

      {tab === "twin" && (
        <div className="space-y-2">
          {pendingTwin.map((r) => {
            const isAudio = (r.mime_type ?? "").startsWith("audio/");
            const url = twinPreviews[r.id];
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3">
                <div className="size-20 overflow-hidden rounded-lg bg-surface-elevated/60">
                  {isAudio ? (
                    url ? <audio controls src={url} className="mt-10 w-full" /> : null
                  ) : url ? (
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">
                    {r.slot_label || "Untitled"} <span className="ml-1 text-[10px] uppercase text-muted-foreground">{r.kind.replace("_ref", "")}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.creator ? `@${r.creator.handle}` : "unknown"} · submitted {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}
                  </div>
                  {r.notes && <div className="mt-1 line-clamp-2 text-xs">{r.notes}</div>}
                </div>
                <div className="inline-flex gap-1">
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => decideTwin(r.id, "approved")}>Approve</Button>
                  <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => decideTwin(r.id, "rejected")}>Reject</Button>
                </div>
              </div>
            );
          })}
          {pendingTwin.length === 0 && <div className="rounded-2xl border border-border bg-surface p-8 text-center text-muted-foreground">No twin references awaiting review.</div>}
        </div>
      )}

      {tab === "verifications" && (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-elevated text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr><th className="px-4 py-2">Creator</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Twin</th><th className="px-4 py-2 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {creators.map((c) => (
                <tr key={c.id} className="border-b border-border/50">
                  <td className="px-4 py-3">
                    <Link to="/creators/$handle" params={{ handle: c.handle }} className="font-semibold hover:text-brand-glow">{c.stage_name}</Link>
                    <div className="text-xs text-muted-foreground">@{c.handle}</div>
                  </td>
                  <td className="px-4 py-3"><Pill value={c.verification_status} /></td>
                  <td className="px-4 py-3"><Pill value={c.digital_twin_status} /></td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => updateVerification(c.id, "verified")}>Verify</Button>
                      <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => updateVerification(c.id, "pending")}>Pending</Button>
                      <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => updateVerification(c.id, "rejected")}>Reject</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {creators.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No creators yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "moderation" && (
        <div className="space-y-2">
          {events.map((e) => (
            <div key={e.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold">{e.category}</span>
                    <Pill value={e.severity} />
                    <Pill value={e.status} />
                    {e.auto_flagged && <span className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] uppercase text-brand-glow">auto</span>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{e.target_type} · {e.target_id ?? "—"} · {new Date(e.created_at).toLocaleString()}</div>
                  {e.notes && <div className="mt-2 text-sm">{e.notes}</div>}
                </div>
                {e.status === "open" && (
                  <div className="inline-flex gap-1">
                    <Button size="sm" variant="outline" disabled={busy === e.id} onClick={() => resolve(e.id, "resolved")}>Resolve</Button>
                    <Button size="sm" variant="ghost" disabled={busy === e.id} onClick={() => resolve(e.id, "dismissed")}>Dismiss</Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {events.length === 0 && <div className="rounded-2xl border border-border bg-surface p-8 text-center text-muted-foreground">No moderation events.</div>}
        </div>
      )}

      {tab === "audit" && (
        <div className="rounded-2xl border border-border bg-surface">
          <ul className="divide-y divide-border">
            {audit.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <div>
                  <div className="font-mono text-xs text-brand-glow">{a.action}</div>
                  <div className="text-xs text-muted-foreground">{a.subject_type ?? "—"} · {a.subject_id ?? ""}</div>
                </div>
                <div className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
              </li>
            ))}
            {audit.length === 0 && <li className="px-4 py-8 text-center text-muted-foreground">No audit events.</li>}
          </ul>
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "ok" | "warn" }) {
  const cls = tone === "warn" ? "text-amber-300" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}

function Pill({ value }: { value: string }) {
  const tone =
    value === "verified" || value === "resolved" || value === "low" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
    : value === "pending" || value === "open" || value === "medium" ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
    : value === "rejected" || value === "high" || value === "critical" ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
    : "border-border bg-surface text-muted-foreground";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${tone}`}>{value}</span>;
}