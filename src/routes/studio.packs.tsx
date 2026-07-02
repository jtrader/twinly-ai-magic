import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Package, Plus, Sparkles, Snowflake, Flame, Heart, Wand2, Users } from "lucide-react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/session";
import { listPacks, createPack } from "@/lib/content-packs.functions";

export const Route = createFileRoute("/studio/packs")({
  component: PacksPage,
  head: () => ({ meta: [
    { title: "Content packs — Twinly.life" },
    { name: "robots", content: "noindex" },
  ]}),
});

type PackType = "nice" | "naughty" | "wicked" | "seasonal" | "custom";
type PackStatus = "draft" | "in_review" | "approved" | "rejected" | "archived";

const TYPE_META: Record<PackType, { label: string; icon: any; tone: string }> = {
  nice:     { label: "Nice",     icon: Heart,     tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  naughty:  { label: "Naughty",  icon: Sparkles,  tone: "border-pink-400/30 bg-pink-400/10 text-pink-300" },
  wicked:   { label: "Wicked",   icon: Flame,     tone: "border-rose-400/30 bg-rose-400/10 text-rose-300" },
  seasonal: { label: "Seasonal", icon: Snowflake, tone: "border-sky-400/30 bg-sky-400/10 text-sky-300" },
  custom:   { label: "Custom",   icon: Wand2,     tone: "border-violet-400/30 bg-violet-400/10 text-violet-300" },
};

const STATUS_TONE: Record<PackStatus, string> = {
  draft:     "border-border bg-surface text-muted-foreground",
  in_review: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  approved:  "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  rejected:  "border-rose-400/30 bg-rose-400/10 text-rose-300",
  archived:  "border-border bg-surface text-muted-foreground",
};

function PacksPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [data, setData] = useState<Awaited<ReturnType<typeof listPacks>> | null>(null);
  const [ready, setReady] = useState(false);
  const [openNew, setOpenNew] = useState(false);
  const [filterType, setFilterType] = useState<"all" | PackType>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | PackStatus>("all");

  const load = useServerFn(listPacks);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const refresh = useCallback(async () => {
    try { setData(await load()); }
    catch (err: any) {
      if (`${err?.message ?? ""}`.includes("creator profile")) { navigate({ to: "/onboarding" }); return; }
      toast.error(err?.message ?? "Failed to load packs");
    } finally { setReady(true); }
  }, [load, navigate]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  const itemCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of data?.items ?? []) m.set(it.pack_id, (m.get(it.pack_id) ?? 0) + 1);
    return m;
  }, [data]);

  const attachByPack = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of data?.attach ?? []) {
      if (!m.has(a.pack_id)) m.set(a.pack_id, []);
      m.get(a.pack_id)!.push(a.persona_id);
    }
    return m;
  }, [data]);

  const personaById = useMemo(() => new Map((data?.personas ?? []).map((p) => [p.id, p])), [data]);

  const filtered = useMemo(() => (data?.packs ?? []).filter((p) => {
    if (filterType !== "all" && p.pack_type !== filterType) return false;
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    return true;
  }), [data, filterType, filterStatus]);

  if (loading || !ready) {
    return <AppShell><div className="py-16 text-center text-sm text-muted-foreground">Loading packs…</div></AppShell>;
  }
  if (!data) return null;

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Content packs</div>
          <h1 className="mt-1 font-display text-3xl font-bold">Named bundles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Group uploads into packs, attach them to personas, and submit for review.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/studio/content"><Button variant="ghost">Vault</Button></Link>
          <Button onClick={() => setOpenNew(true)}><Plus className="mr-2 h-4 w-4" />New pack</Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Chip active={filterType === "all"} onClick={() => setFilterType("all")}>All types</Chip>
        {(Object.keys(TYPE_META) as PackType[]).map((t) => (
          <Chip key={t} active={filterType === t} onClick={() => setFilterType(t)}>{TYPE_META[t].label}</Chip>
        ))}
        <span className="mx-2 h-6 w-px bg-border" />
        <Chip active={filterStatus === "all"} onClick={() => setFilterStatus("all")}>All status</Chip>
        {(["draft","in_review","approved","rejected","archived"] as PackStatus[]).map((s) => (
          <Chip key={s} active={filterStatus === s} onClick={() => setFilterStatus(s)}>{s.replace("_"," ")}</Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center">
          <Package className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No packs match your filters.</p>
          <Button className="mt-4" onClick={() => setOpenNew(true)}><Plus className="mr-2 h-4 w-4" />New pack</Button>
        </div>
      ) : (
        <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const meta = TYPE_META[p.pack_type as PackType];
            const Icon = meta.icon;
            const attached = (attachByPack.get(p.id) ?? []).map((id) => personaById.get(id)).filter(Boolean) as any[];
            return (
              <Link key={p.id} to="/studio/packs/$packId" params={{ packId: p.id }} className="group">
                <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 transition hover:border-brand/40 hover:bg-surface-elevated">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`grid h-9 w-9 place-items-center rounded-lg border ${meta.tone}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-display text-base font-semibold leading-tight">{p.name}</div>
                        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{meta.label} · {itemCounts.get(p.id) ?? 0} item{(itemCounts.get(p.id) ?? 0) === 1 ? "" : "s"}</div>
                      </div>
                    </div>
                    <Badge variant="outline" className={STATUS_TONE[p.status as PackStatus]}>{p.status.replace("_"," ")}</Badge>
                  </div>
                  {p.description && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {attached.length === 0 ? "Not attached" : attached.slice(0,3).map((a) => (
                      <span key={a.id} className="rounded-full border border-border bg-background/40 px-2 py-0.5">{a.display_name}</span>
                    ))}
                    {attached.length > 3 && <span>+{attached.length - 3}</span>}
                  </div>
                  {p.review_note && p.status === "rejected" && (
                    <div className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/10 p-2 text-xs text-rose-200">
                      Reviewer: {p.review_note}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <NewPackDialog open={openNew} onOpenChange={setOpenNew} onCreated={(id) => { setOpenNew(false); navigate({ to: "/studio/packs/$packId", params: { packId: id } }); }} />
    </AppShell>
  );
}

function Chip({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={"rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition " +
        (active ? "border-brand bg-brand/10 text-brand-glow" : "border-border bg-surface text-muted-foreground hover:border-brand/40 hover:text-foreground")}
    >{children}</button>
  );
}

function NewPackDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [packType, setPackType] = useState<PackType>("custom");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const create = useServerFn(createPack);

  useEffect(() => { if (open) { setName(""); setPackType("custom"); setDescription(""); setStartsAt(""); setEndsAt(""); setBusy(false); } }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Give the pack a name."); return; }
    setBusy(true);
    try {
      const { pack } = await create({ data: {
        name: name.trim(), packType, description: description.trim() || undefined,
        startsAt: startsAt || null, endsAt: endsAt || null,
      }});
      toast.success("Pack created");
      onCreated(pack.id);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create pack");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New content pack</DialogTitle>
          <DialogDescription>Group uploads together. You can attach the pack to personas after creating it.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Christmas Special Pack" />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={packType} onValueChange={(v) => setPackType(v as PackType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_META) as PackType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="p-desc">Description (optional)</Label>
            <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          {packType === "seasonal" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="p-start">Starts</Label>
                <Input id="p-start" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="p-end">Ends</Label>
                <Input id="p-end" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create pack"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}