import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/session";
import {
  bulkSetFeedItemVisibility,
  clearFeedItemVisibilityOverride,
  getPersonaVisibilityPolicy,
  listFeedItemsForCuration,
  listFeedVisibilityAuditLog,
  listMyFeedVisibilityScope,
  previewFeedForTier,
  setFeedItemVisibilityOverride,
  setPersonaDefaultVisibility,
} from "@/lib/feed-visibility.functions";
import { ArrowLeft, Eye, History, Layers, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/studio/feed-visibility")({
  component: FeedVisibilityPage,
  head: () => ({
    meta: [
      { title: "Feed visibility — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Tier = "public" | "logged_in" | "subscribers_only";
const TIER_LABEL: Record<Tier, string> = {
  public: "Public visitors",
  logged_in: "Logged-in (non-paying)",
  subscribers_only: "Paying subscribers",
};
const TIER_TONE: Record<Tier, string> = {
  public: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  logged_in: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  subscribers_only: "border-brand/40 bg-brand/10 text-brand-glow",
};
type Scope = Awaited<ReturnType<typeof listMyFeedVisibilityScope>>;

function FeedVisibilityPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const loadScope = useServerFn(listMyFeedVisibilityScope);
  const [scope, setScope] = useState<Scope | null>(null);
  const [ready, setReady] = useState(false);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [tab, setTab] = useState<"settings" | "curation" | "preview" | "audit">("settings");

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    loadScope({})
      .then((r) => {
        setScope(r);
        setCreatorId(r.creators[0]?.id ?? null);
      })
      .catch((e: any) => toast.error(e?.message ?? "Failed to load"))
      .finally(() => setReady(true));
  }, [user, loadScope]);

  const creator = useMemo(() => scope?.creators.find((c) => c.id === creatorId) ?? null, [scope, creatorId]);

  if (loading || !ready) {
    return <AppShell><div className="py-16 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  if (!scope || scope.role === null || scope.creators.length === 0) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
          <ShieldCheck className="mx-auto mb-3 size-6 text-muted-foreground" />
          <h1 className="font-display text-xl font-bold">No access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Feed visibility management is available to creators (own personas), agencies (managed creators), and admins.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-3">
        <Link to="/studio" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Creator studio</div>
          <h1 className="font-display text-2xl font-bold">Feed visibility</h1>
        </div>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Set a default audience per persona, curate individual posts, preview the feed as each tier would see it, and review every change in the audit log.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {scope.creators.length > 1 && (
          <Select value={creatorId ?? undefined} onValueChange={setCreatorId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Choose a creator" /></SelectTrigger>
            <SelectContent>
              {scope.creators.map((c) => (
                <SelectItem key={c.id} value={c.id}>@{c.handle} · {c.stageName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Badge variant="outline" className="text-[10px] uppercase tracking-widest">
          Acting as: {creator?.viaRole ?? scope.role}
        </Badge>
      </div>

      <div className="mb-4 flex gap-2 border-b border-border">
        {([
          { id: "settings", label: "Persona defaults", icon: ShieldCheck },
          { id: "curation", label: "Post curation", icon: Layers },
          { id: "preview", label: "Tier preview", icon: Eye },
          { id: "audit", label: "Audit log", icon: History },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={"flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition " + (
              tab === t.id ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="size-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {creator && tab === "settings" && <PersonaDefaultsPanel creator={creator} />}
      {creator && tab === "curation" && <CurationPanel creator={creator} />}
      {creator && tab === "preview" && <PreviewPanel creatorId={creator.id} />}
      {creator && tab === "audit" && <AuditLogPanel creatorId={creator.id} />}
    </AppShell>
  );
}

function PersonaDefaultsPanel({ creator }: { creator: Scope["creators"][number] }) {
  const setDefault = useServerFn(setPersonaDefaultVisibility);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, Tier>>({});

  async function onChange(personaId: string, tier: Tier) {
    setBusyId(personaId);
    try {
      await setDefault({ data: { personaId, defaultVisibility: tier } });
      setValues((v) => ({ ...v, [personaId]: tier }));
      toast.success("Default visibility updated");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update");
    } finally {
      setBusyId(null);
    }
  }

  if (creator.personas.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">This creator has no personas yet.</div>;
  }

  return (
    <div className="space-y-2">
      {creator.personas.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
          <div>
            <div className="font-semibold">{p.displayName}</div>
            <div className="text-xs text-muted-foreground">/{p.slug}</div>
          </div>
          <Select
            value={values[p.id] ?? undefined}
            onValueChange={(v) => onChange(p.id, v as Tier)}
            disabled={busyId === p.id}
          >
            <SelectTrigger className="w-56"><SelectValue placeholder="Loading…" /></SelectTrigger>
            <SelectContent>
              {(Object.keys(TIER_LABEL) as Tier[]).map((t) => (
                <SelectItem key={t} value={t}>{TIER_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PersonaDefaultLoader personaId={p.id} onLoaded={(t) => setValues((v) => (p.id in v ? v : { ...v, [p.id]: t }))} />
        </div>
      ))}
    </div>
  );
}

/** Fire-and-forget loader that seeds the Select's initial value once, without a full data-fetching library. */
function PersonaDefaultLoader({ personaId, onLoaded }: { personaId: string; onLoaded: (t: Tier) => void }) {
  const getPolicy = useServerFn(getPersonaVisibilityPolicy);
  useEffect(() => {
    getPolicy({ data: { personaId } }).then((r) => onLoaded(r.defaultVisibility as Tier)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);
  return null;
}

function CurationPanel({ creator }: { creator: Scope["creators"][number] }) {
  const list = useServerFn(listFeedItemsForCuration);
  const setOverride = useServerFn(setFeedItemVisibilityOverride);
  const clearOverride = useServerFn(clearFeedItemVisibilityOverride);
  const bulkSet = useServerFn(bulkSetFeedItemVisibility);

  const [personaFilter, setPersonaFilter] = useState<string>("all");
  const [items, setItems] = useState<Awaited<ReturnType<typeof listFeedItemsForCuration>>["items"]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTier, setBulkTier] = useState<Tier>("subscribers_only");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await list({ data: { creatorId: creator.id, personaId: personaFilter === "all" ? undefined : personaFilter } });
      setItems(r.items);
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load posts");
    }
  }, [list, creator.id, personaFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function onItemTierChange(postId: string, tier: Tier) {
    setBusy(true);
    try {
      await setOverride({ data: { postId, visibility: tier } });
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to set override");
    } finally { setBusy(false); }
  }

  async function onClear(postId: string) {
    setBusy(true);
    try {
      await clearOverride({ data: { postId } });
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to clear override");
    } finally { setBusy(false); }
  }

  async function onBulkApply() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await bulkSet({ data: { creatorId: creator.id, postIds: [...selected], visibility: bulkTier } });
      toast.success(`Updated ${res.updated} post${res.updated === 1 ? "" : "s"}`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Bulk update failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={personaFilter} onValueChange={setPersonaFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All posts</SelectItem>
            {creator.personas.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.displayName}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-3 py-1.5">
            <span className="text-xs font-semibold">{selected.size} selected</span>
            <Select value={bulkTier} onValueChange={(v) => setBulkTier(v as Tier)}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TIER_LABEL) as Tier[]).map((t) => (
                  <SelectItem key={t} value={t}>{TIER_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={onBulkApply} disabled={busy}>Apply to selected</Button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No posts to curate.</div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3">
              <Checkbox checked={selected.has(it.id)} onCheckedChange={() => toggle(it.id)} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{it.body || "(image post)"}</div>
                <div className="text-[11px] text-muted-foreground">{new Date(it.createdAt).toLocaleString()}</div>
              </div>
              <Badge variant="outline" className={"text-[10px] uppercase tracking-widest " + TIER_TONE[it.resolvedVisibility as Tier]}>
                {TIER_LABEL[it.resolvedVisibility as Tier]}
              </Badge>
              {it.hasOverride && (
                <Badge variant="outline" className="text-[10px] uppercase tracking-widest border-amber-400/30 bg-amber-400/10 text-amber-300">
                  Override
                </Badge>
              )}
              <Select value={it.overrideTier ?? undefined} onValueChange={(v) => onItemTierChange(it.id, v as Tier)} disabled={busy}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Set override…" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIER_LABEL) as Tier[]).map((t) => (
                    <SelectItem key={t} value={t}>{TIER_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {it.hasOverride && (
                <Button size="sm" variant="ghost" onClick={() => onClear(it.id)} disabled={busy}>Clear</Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewPanel({ creatorId }: { creatorId: string }) {
  const preview = useServerFn(previewFeedForTier);
  const [tier, setTier] = useState<Tier>("public");
  const [items, setItems] = useState<Awaited<ReturnType<typeof previewFeedForTier>>["items"]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (t: Tier) => {
    setLoading(true);
    try {
      const r = await preview({ data: { creatorId, tier: t } });
      setItems(r.items);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load preview");
    } finally { setLoading(false); }
  }, [preview, creatorId]);

  useEffect(() => { refresh(tier); }, [refresh, tier]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(TIER_LABEL) as Tier[]).map((t) => (
          <Button key={t} size="sm" variant={tier === t ? "default" : "outline"} onClick={() => setTier(t)}>
            {TIER_LABEL[t]}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Showing exactly what a viewer at this tier would see in the feed right now.</p>
      {loading ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nothing visible at this tier.</div>
      ) : (
        <div className="space-y-2">
          {items.map((it: any) => (
            <div key={it.id} className="rounded-2xl border border-border bg-surface p-3">
              <div className="text-sm">{it.body || "(image post)"}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{new Date(it.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditLogPanel({ creatorId }: { creatorId: string }) {
  const list = useServerFn(listFeedVisibilityAuditLog);
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof listFeedVisibilityAuditLog>>["entries"]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    list({ data: { creatorId } })
      .then((r) => setEntries(r.entries))
      .catch((e: any) => toast.error(e?.message ?? "Failed to load audit log"))
      .finally(() => setLoading(false));
  }, [list, creatorId]);

  if (loading) return <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (entries.length === 0) return <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No visibility changes yet.</div>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
            <th className="p-3">When</th>
            <th className="p-3">Actor</th>
            <th className="p-3">Role</th>
            <th className="p-3">Target</th>
            <th className="p-3">Before → After</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-border/60 last:border-0">
              <td className="p-3 text-xs text-muted-foreground">{new Date(e.changedAt).toLocaleString()}</td>
              <td className="p-3">{e.actorName}</td>
              <td className="p-3"><Badge variant="outline" className="text-[10px] uppercase">{e.actorRole}</Badge></td>
              <td className="p-3 text-xs">{e.targetType === "persona_default" ? "Persona default" : "Post override"}</td>
              <td className="p-3 text-xs font-mono">
                {JSON.stringify(e.beforeValue)} → {JSON.stringify(e.afterValue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
