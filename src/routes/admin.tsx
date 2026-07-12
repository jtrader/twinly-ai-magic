import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession, useUserRoles } from "@/lib/session";
import { adminOverview, adminListVerifications, adminSetVerification, adminSetGenerationCap, adminRecentAudit, adminGetPlatformSettings, adminSetPlatformSettings, adminVerifyConsentLedger } from "@/lib/admin.functions";
import { adminListModeration, adminResolveModeration } from "@/lib/moderation.functions";
import { adminListPendingAssets, adminSetAssetApproval } from "@/lib/admin.functions";
import { adminListPendingPacks, adminSetPackApproval } from "@/lib/admin.functions";
import { adminListPendingTwinRefs, adminSetTwinRefReview, adminGetTwinRefSignedUrl } from "@/lib/twin.functions";
import { adminListDemoCreators, adminSeedDemoCreators, adminImpersonateCreator, adminListAllCreators, adminListAllAgencies, adminImpersonateUser } from "@/lib/demo.functions";
import { setImpersonationContext } from "@/components/twinly/ImpersonationBanner";

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

  const [tab, setTab] = useState<"overview" | "verifications" | "moderation" | "synthetic" | "packs" | "twin" | "audit" | "demo" | "creators" | "agencies" | "settings">("overview");
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
  const [allCreators, setAllCreators] = useState<{ creators: any[]; emails: Record<string, string | null> } | null>(null);
  const [allAgencies, setAllAgencies] = useState<{ agencies: any[] } | null>(null);
  const [platformSettings, setPlatformSettings] = useState<{ max_explicitness_ceiling: string } | null>(null);
  const [creatorsQuery, setCreatorsQuery] = useState("");
  const [creatorsPage, setCreatorsPage] = useState(1);
  const [agenciesQuery, setAgenciesQuery] = useState("");
  const [agenciesPage, setAgenciesPage] = useState(1);
  const PAGE_SIZE = 20;

  const overview = useServerFn(adminOverview);
  const listVer = useServerFn(adminListVerifications);
  const setVer = useServerFn(adminSetVerification);
  const setGenCap = useServerFn(adminSetGenerationCap);
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
  const listAllCreatorsFn = useServerFn(adminListAllCreators);
  const listAllAgenciesFn = useServerFn(adminListAllAgencies);
  const impersonateUserFn = useServerFn(adminImpersonateUser);
  const getSettings = useServerFn(adminGetPlatformSettings);
  const setSettings = useServerFn(adminSetPlatformSettings);
  const verifyLedger = useServerFn(adminVerifyConsentLedger);
  const [ledgerCreatorId, setLedgerCreatorId] = useState("");
  const [ledgerResult, setLedgerResult] = useState<{ checked: number; broken: number; brokenIds: string[] } | null>(null);

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
        if (tab === "creators") setAllCreators(await listAllCreatorsFn({}));
        if (tab === "agencies") setAllAgencies(await listAllAgenciesFn({}));
        if (tab === "settings") setPlatformSettings((await getSettings({})).settings);
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
    const reason = window.prompt(`Reason for marking this creator "${status}"?`, "");
    if (reason === null) return;
    if (reason.trim().length < 3) { toast.error("A reason is required."); return; }
    setBusy(creatorId);
    try {
      await setVer({ data: { creatorId, status, reason: reason.trim() } });
      setCreators((prev) => prev.map((c) => c.id === creatorId ? { ...c, verification_status: status } : c));
      toast.success(`Marked ${status}`);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  }

  async function updateGenerationCap(creatorId: string, current: number | null) {
    const input = window.prompt(
      "Monthly generation spend cap in USD (blank = no cap):",
      current != null ? String(current / 100) : "",
    );
    if (input === null) return;
    const trimmed = input.trim();
    const capCents = trimmed === "" ? null : Math.round(Number.parseFloat(trimmed) * 100);
    if (trimmed !== "" && (!Number.isFinite(capCents) || (capCents as number) < 0)) {
      toast.error("Enter a valid non-negative dollar amount, or leave blank for no cap.");
      return;
    }
    setBusy(creatorId);
    try {
      await setGenCap({ data: { creatorId, capCents } });
      setCreators((prev) => prev.map((c) => c.id === creatorId ? { ...c, generation_spend_cap_cents: capCents } : c));
      toast.success(capCents === null ? "Cap removed" : `Cap set to $${(capCents / 100).toFixed(2)}/mo`);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  }

  async function updateMaxCeiling(level: "sfw" | "suggestive" | "explicit") {
    setBusy("platform_settings");
    try {
      await setSettings({ data: { maxExplicitnessCeiling: level } });
      setPlatformSettings({ max_explicitness_ceiling: level });
      toast.success(`Platform maximum set to "${level}"`);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  }

  async function runLedgerCheck() {
    if (!ledgerCreatorId.trim()) { toast.error("Paste a creator ID first."); return; }
    setBusy("ledger");
    setLedgerResult(null);
    try {
      const res = await verifyLedger({ data: { creatorId: ledgerCreatorId.trim() } });
      setLedgerResult(res);
      if (res.broken > 0) toast.error(`${res.broken} of ${res.checked} consent records failed integrity check`);
      else toast.success(`All ${res.checked} consent records verified`);
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

  async function signInAs(creatorId: string, handle: string, stageName?: string) {
    if (!window.confirm(`Sign in as @${handle}?\n\nYour admin session will be replaced in this tab. A "Return to admin" banner will appear so you can bounce back with one click.`)) return;
    setBusy(creatorId);
    try {
      const { url, returnUrl, adminEmail } = await impersonate({ data: { creatorId } });
      setImpersonationContext({ returnUrl, adminEmail, handle, kind: "creator", targetName: stageName ?? null });
      toast.success(`Signing in as @${handle}…`);
      window.location.href = url;
    } catch (e: any) { toast.error(e?.message ?? "Failed"); setBusy(null); }
  }

  async function signInAsAgencyOwner(userId: string, name: string) {
    if (!window.confirm(`Sign in as owner of "${name}"?\n\nYour admin session will be replaced in this tab. Use the "Return to admin" banner to bounce back.`)) return;
    setBusy(userId);
    try {
      const { url, returnUrl, adminEmail } = await impersonateUserFn({ data: { userId, redirectPath: "/agency", label: `agency:${name}` } });
      setImpersonationContext({ returnUrl, adminEmail, handle: name, kind: "agency", targetName: name });
      toast.success(`Signing in as ${name}…`);
      window.location.href = url;
    } catch (e: any) { toast.error(e?.message ?? "Failed"); setBusy(null); }
  }

  return (
    <AppShell>
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Admin</div>
        <h1 className="mt-1 font-display text-3xl font-bold">Console</h1>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-2">
        {(["overview","verifications","moderation","synthetic","packs","twin","audit","demo","creators","agencies","settings"] as const).map((t) => (
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
          <Stat label="Repeat offenders" value={stats.repeatOffenders} tone={stats.repeatOffenders > 0 ? "warn" : "ok"} />
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
        <div className="mt-4">
          <Link to="/studio/feed-visibility">
            <Button variant="outline" size="sm">Manage feed visibility (any creator) →</Button>
          </Link>
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
              <tr><th className="px-4 py-2">Creator</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Twin</th><th className="px-4 py-2">Gen cap/mo</th><th className="px-4 py-2 text-right">Actions</th></tr>
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
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                      disabled={busy === c.id}
                      onClick={() => updateGenerationCap(c.id, c.generation_spend_cap_cents ?? null)}
                    >
                      {c.generation_spend_cap_cents != null ? `$${(c.generation_spend_cap_cents / 100).toFixed(2)}` : "No cap"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => updateVerification(c.id, "verified")}>Verify</Button>
                      <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => updateVerification(c.id, "pending")}>Pending</Button>
                      <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => updateVerification(c.id, "rejected")}>Reject</Button>
                      {c.verification_status === "verified" && (
                        <Button size="sm" variant="destructive" disabled={busy === c.id} onClick={() => updateVerification(c.id, "revoked")}>Revoke</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {creators.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No creators yet.</td></tr>}
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

      {tab === "demo" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-display text-lg font-bold">Demo creator accounts</div>
                <div className="text-xs text-muted-foreground">Seed 3 fully-prefilled demo creators (Aurora Vale, Kai Wolf, Luna Marie). Idempotent — safe to re-run.</div>
              </div>
              <Button size="sm" onClick={runSeed} disabled={busy === "seed"}>{busy === "seed" ? "Seeding…" : "Seed demo creators"}</Button>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-100">
            <span className="font-semibold">Heads up:</span> "Sign in as" replaces your admin session in this tab and stores a one-click "Return to admin" link. Prefer an incognito window? Right-click the button and copy the link instead.
          </div>

          {demo && (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface-elevated text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <tr><th className="px-4 py-2">Creator</th><th className="px-4 py-2">Email</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Actions</th></tr>
                </thead>
                <tbody>
                  {demo.seeded.map((c: any) => (
                    <tr key={c.id} className="border-b border-border/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {c.avatar_url && <img src={c.avatar_url} alt="" className="size-9 rounded-full object-cover" />}
                          <div>
                            <Link to="/creators/$handle" params={{ handle: c.handle }} className="font-semibold hover:text-brand-glow">{c.stage_name}</Link>
                            <div className="text-xs text-muted-foreground">@{c.handle}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{demo.emails[c.id] ?? "—"}</td>
                      <td className="px-4 py-3"><Pill value={c.verification_status} /></td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => signInAs(c.id, c.handle)}>
                          {busy === c.id ? "Minting…" : "Sign in as"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {demo.seeded.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No demo creators yet — click "Seed demo creators" above.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "creators" && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-100">
            <span className="font-semibold">Impersonation:</span> Sign in as any creator to access their studio, personas, content, and payouts. Your admin session is replaced in this tab — use the return banner to bounce back.
          </div>
          {allCreators && (() => {
            const q = creatorsQuery.trim().toLowerCase();
            const filtered = q
              ? allCreators.creators.filter((c: any) =>
                  (c.handle ?? "").toLowerCase().includes(q) ||
                  (c.stage_name ?? "").toLowerCase().includes(q) ||
                  (allCreators.emails[c.id] ?? "").toLowerCase().includes(q))
              : allCreators.creators;
            const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
            const page = Math.min(creatorsPage, totalPages);
            const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            return (
            <>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="max-w-xs"
                placeholder="Search handle, stage name, or email…"
                value={creatorsQuery}
                onChange={(e) => { setCreatorsQuery(e.target.value); setCreatorsPage(1); }}
              />
              <div className="text-xs text-muted-foreground">
                {filtered.length} of {allCreators.creators.length}
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface-elevated text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <tr><th className="px-4 py-2">Creator</th><th className="px-4 py-2">Email</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Actions</th></tr>
                </thead>
                <tbody>
                  {rows.map((c: any) => (
                    <tr key={c.id} className="border-b border-border/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {c.avatar_url && <img src={c.avatar_url} alt="" className="size-9 rounded-full object-cover" />}
                          <div className="min-w-0">
                            <Link to="/creators/$handle" params={{ handle: c.handle }} className="font-semibold hover:text-brand-glow">{c.stage_name}</Link>
                            <div className="text-xs text-muted-foreground">@{c.handle}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{allCreators.emails[c.id] ?? "—"}</td>
                      <td className="px-4 py-3"><Pill value={c.verification_status} /></td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" disabled={busy === c.id || !c.user_id} onClick={() => signInAs(c.id, c.handle, c.stage_name)}>
                          {busy === c.id ? "Minting…" : "Sign in as"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">{q ? "No creators match this search." : "No creators yet."}</td></tr>}
                </tbody>
              </table>
            </div>
            <Pager page={page} totalPages={totalPages} onChange={setCreatorsPage} />
            </>
            );
          })()}
        </div>
      )}

      {tab === "agencies" && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-100">
            <span className="font-semibold">Impersonation:</span> Sign in as any agency owner to access their dashboard and managed creators.
          </div>
          {allAgencies && (() => {
            const q = agenciesQuery.trim().toLowerCase();
            const filtered = q
              ? allAgencies.agencies.filter((a: any) =>
                  (a.name ?? "").toLowerCase().includes(q) ||
                  (a.owner_email ?? "").toLowerCase().includes(q))
              : allAgencies.agencies;
            const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
            const page = Math.min(agenciesPage, totalPages);
            const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            return (
            <>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="max-w-xs"
                placeholder="Search agency name or owner email…"
                value={agenciesQuery}
                onChange={(e) => { setAgenciesQuery(e.target.value); setAgenciesPage(1); }}
              />
              <div className="text-xs text-muted-foreground">
                {filtered.length} of {allAgencies.agencies.length}
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface-elevated text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <tr><th className="px-4 py-2">Agency</th><th className="px-4 py-2">Owner email</th><th className="px-4 py-2">Creators</th><th className="px-4 py-2 text-right">Actions</th></tr>
                </thead>
                <tbody>
                  {rows.map((a: any) => (
                    <tr key={a.id} className="border-b border-border/50">
                      <td className="px-4 py-3 font-semibold">{a.name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{a.owner_email ?? "—"}</td>
                      <td className="px-4 py-3">{a.creator_count}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" disabled={busy === a.owner_user_id || !a.owner_user_id} onClick={() => signInAsAgencyOwner(a.owner_user_id, a.name)}>
                          {busy === a.owner_user_id ? "Minting…" : "Sign in as owner"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">{q ? "No agencies match this search." : "No agencies yet."}</td></tr>}
                </tbody>
              </table>
            </div>
            <Pager page={page} totalPages={totalPages} onChange={setAgenciesPage} />
            </>
            );
          })()}
        </div>
      )}

      {tab === "settings" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="font-display text-lg font-bold">Twin guardrail engine</div>
            <div className="mt-1 text-xs text-muted-foreground">
              The platform-wide maximum explicitness ceiling. No persona's own ceiling — set by the creator in Persona Studio — can exceed this. Changing it is logged with the previous value.
            </div>
            {platformSettings && (
              <div className="mt-4 flex flex-wrap gap-2">
                {(["sfw", "suggestive", "explicit"] as const).map((level) => (
                  <Button
                    key={level}
                    size="sm"
                    variant={platformSettings.max_explicitness_ceiling === level ? "default" : "outline"}
                    disabled={busy === "platform_settings"}
                    onClick={() => updateMaxCeiling(level)}
                  >
                    {level}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="font-display text-lg font-bold">Consent ledger integrity</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Recomputes the hash chain for a creator's consent history and reports any break. Paste a creator ID from the Verifications tab.
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Input
                className="max-w-xs"
                placeholder="creator UUID"
                value={ledgerCreatorId}
                onChange={(e) => setLedgerCreatorId(e.target.value)}
              />
              <Button size="sm" variant="outline" disabled={busy === "ledger"} onClick={runLedgerCheck}>
                {busy === "ledger" ? "Checking…" : "Check integrity"}
              </Button>
            </div>
            {ledgerResult && (
              <div className={"mt-3 rounded-lg border p-3 text-xs " + (ledgerResult.broken > 0 ? "border-rose-400/30 bg-rose-400/10 text-rose-300" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300")}>
                {ledgerResult.checked} record(s) checked, {ledgerResult.broken} broken.
                {ledgerResult.broken > 0 && <div className="mt-1 font-mono">{ledgerResult.brokenIds.join(", ")}</div>}
              </div>
            )}
          </div>
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
    : value === "rejected" || value === "revoked" || value === "high" || value === "critical" ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
    : "border-border bg-surface text-muted-foreground";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${tone}`}>{value}</span>;
}

function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</Button>
      <div className="text-muted-foreground">Page {page} of {totalPages}</div>
      <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next →</Button>
    </div>
  );
}