import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft, Upload, Trash2, Send, Loader2, X, Users, Plus, Image as ImageIcon, Video, Music, FileText, History, Star, Sparkles, CheckCircle2, Clock, AlertTriangle, RotateCw, Tag,
} from "lucide-react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import {
  getPack, updatePack, deletePack, bulkUploadToPack,
  addAssetsToPack, removeAssetsFromPack, attachPackToPersona, detachPackFromPersona,
  submitPackForReview, listPackAudit,
} from "@/lib/content-packs.functions";
import { getAssetSignedUrl } from "@/lib/content-vault.functions";

export const Route = createFileRoute("/studio/packs/$packId")({
  component: PackDetailPage,
  head: () => ({ meta: [
    { title: "Pack — Twinly.life" },
    { name: "robots", content: "noindex" },
  ]}),
});

type AssetType = "image" | "video" | "audio" | "text";
type PermissionType = "included" | "ppv" | "restricted";
type PackStatus = "draft" | "in_review" | "approved" | "rejected" | "archived";

const ASSET_ICON: Record<AssetType, any> = { image: ImageIcon, video: Video, audio: Music, text: FileText };

const PERMISSION_LABEL: Record<PermissionType, string> = {
  included: "Included", ppv: "Pay-per-view", restricted: "Restricted",
};

const STATUS_TONE: Record<PackStatus, string> = {
  draft:     "border-border bg-surface text-muted-foreground",
  in_review: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  approved:  "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  rejected:  "border-rose-400/30 bg-rose-400/10 text-rose-300",
  archived:  "border-border bg-surface text-muted-foreground",
};

function detectAssetType(file: File): AssetType {
  const t = file.type;
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  return "text";
}

function PackDetailPage() {
  const { packId } = Route.useParams();
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [data, setData] = useState<Awaited<ReturnType<typeof getPack>> | null>(null);
  const [ready, setReady] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [addFromVaultOpen, setAddFromVaultOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useServerFn(getPack);
  const submit = useServerFn(submitPackForReview);
  const attachFn = useServerFn(attachPackToPersona);
  const detachFn = useServerFn(detachPackFromPersona);
  const removeItems = useServerFn(removeAssetsFromPack);
  const updateFn = useServerFn(updatePack);
  const del = useServerFn(deletePack);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const refresh = useCallback(async () => {
    try { setData(await load({ data: { packId } })); }
    catch (err: any) { toast.error(err?.message ?? "Failed to load"); }
    finally { setReady(true); }
  }, [load, packId]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  const itemAssets = useMemo(() => {
    if (!data) return [] as any[];
    const vaultById = new Map(data.vault.map((v) => [v.id, v]));
    return data.items
      .map((it) => ({ ...it, asset: vaultById.get(it.asset_id) }))
      .filter((it) => it.asset);
  }, [data]);

  const attachedPersonaIds = useMemo(() => new Set((data?.attach ?? []).map((a) => a.persona_id)), [data]);
  const permissionByPersona = useMemo(() => new Map((data?.attach ?? []).map((a) => [a.persona_id, a.permission_type])), [data]);

  async function togglePersona(personaId: string, checked: boolean, permissionType: PermissionType = "included") {
    try {
      if (checked) await attachFn({ data: { packId, personaId, permissionType } });
      else await detachFn({ data: { packId, personaId } });
      refresh();
    } catch (err: any) { toast.error(err?.message ?? "Update failed"); }
  }

  async function changePermission(personaId: string, permissionType: PermissionType) {
    try { await attachFn({ data: { packId, personaId, permissionType } }); refresh(); }
    catch (err: any) { toast.error(err?.message ?? "Update failed"); }
  }

  async function handleSubmitForReview() {
    if (!data) return;
    if (data.items.length === 0) { toast.error("Add at least one asset before submitting."); return; }
    try {
      await submit({ data: { packId } });
      toast.success("Submitted for review");
      refresh();
    } catch (err: any) { toast.error(err?.message ?? "Submit failed"); }
  }

  async function handleRemoveItem(assetId: string) {
    try {
      await removeItems({ data: { packId, assetIds: [assetId] } });
      refresh();
    } catch (err: any) { toast.error(err?.message ?? "Remove failed"); }
  }

  async function handleSetCover(assetId: string) {
    try {
      await updateFn({ data: { packId, coverAssetId: assetId } });
      toast.success("Cover updated");
      refresh();
    } catch (err: any) { toast.error(err?.message ?? "Update failed"); }
  }

  async function handleDelete() {
    try {
      const res = await del({ data: { packId } });
      toast.success(res.archived ? "Archived" : "Deleted");
      navigate({ to: "/studio/packs" });
    } catch (err: any) { toast.error(err?.message ?? "Delete failed"); }
  }

  if (loading || !ready) return <AppShell><div className="py-16 text-center text-sm text-muted-foreground">Loading pack…</div></AppShell>;
  if (!data) return null;

  const p = data.pack;
  const status = p.status as PackStatus;
  const canEdit = status === "draft" || status === "rejected";

  return (
    <AppShell>
      <div className="mb-4">
        <Link to="/studio/packs" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> All packs
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground capitalize">{p.pack_type} pack</div>
          <h1 className="mt-1 font-display text-3xl font-bold">{p.name}</h1>
          {p.description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{p.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={STATUS_TONE[status]}>{status.replace("_"," ")}</Badge>
          <Button variant="ghost" size="sm" onClick={() => setAuditOpen(true)}><History className="mr-2 h-4 w-4" />Audit</Button>
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>Edit</Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>Delete</Button>
          {canEdit && (
            <Button size="sm" onClick={handleSubmitForReview}><Send className="mr-2 h-4 w-4" />Submit for review</Button>
          )}
        </div>
      </div>

      <StatusBanner pack={p} status={status} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Assets in pack <span className="text-muted-foreground">· {itemAssets.length}</span></div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAddFromVaultOpen(true)}><Plus className="mr-2 h-4 w-4" />Add from vault</Button>
              <Button size="sm" onClick={() => setUploadOpen(true)}><Upload className="mr-2 h-4 w-4" />Bulk upload</Button>
            </div>
          </div>
          {itemAssets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center">
              <p className="text-sm text-muted-foreground">This pack is empty. Upload files or add existing vault assets.</p>
              <Button className="mt-4" onClick={() => setUploadOpen(true)}><Upload className="mr-2 h-4 w-4" />Bulk upload</Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {itemAssets.map((it: any) => (
                <PackAssetCard
                  key={it.asset_id}
                  asset={it.asset}
                  isCover={p.cover_asset_id === it.asset_id}
                  onRemove={() => handleRemoveItem(it.asset_id)}
                  onSetCover={() => handleSetCover(it.asset_id)}
                />
              ))}
            </div>
          )}
        </section>

        <aside>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-brand-glow" /> Attached personas
            </div>
            <p className="mb-3 text-xs text-muted-foreground">Fans of the persona get access to this pack's assets.</p>
            {data.personas.length === 0 ? (
              <div className="text-xs text-muted-foreground">Create a persona first in the studio.</div>
            ) : (
              <div className="space-y-2">
                {data.personas.map((persona) => {
                  const attached = attachedPersonaIds.has(persona.id);
                  const perm = (permissionByPersona.get(persona.id) as PermissionType) ?? "included";
                  return (
                    <div key={persona.id} className="flex items-center gap-2">
                      <Switch checked={attached} onCheckedChange={(v) => togglePersona(persona.id, v, perm)} />
                      <div className="flex-1 truncate text-xs">
                        <span className="text-foreground">{persona.display_name}</span>
                        <span className="ml-1 text-muted-foreground">· {persona.kind === "ai" ? "AI" : "Real Me"}</span>
                      </div>
                      {attached && (
                        <Select value={perm} onValueChange={(v) => changePermission(persona.id, v as PermissionType)}>
                          <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(PERMISSION_LABEL) as PermissionType[]).map((k) => (
                              <SelectItem key={k} value={k}>{PERMISSION_LABEL[k]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-surface p-4 text-xs text-muted-foreground">
            <div className="mb-1 font-semibold text-foreground">Approval flow</div>
            <p>Draft → Submit for review → Admin approves. Rejected packs get a note you can act on before resubmitting.</p>
          </div>
        </aside>
      </div>

      <BulkUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        creatorId={data.creator.id}
        packId={packId}
        onDone={refresh}
      />
      <AddFromVaultDialog
        open={addFromVaultOpen}
        onOpenChange={setAddFromVaultOpen}
        packId={packId}
        vault={data.vault}
        existingIds={new Set(data.items.map((i) => i.asset_id))}
        onDone={refresh}
      />
      <EditPackDialog open={editOpen} onOpenChange={setEditOpen} pack={p} onDone={refresh} />
      <AuditDialog open={auditOpen} onOpenChange={setAuditOpen} packId={packId} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete pack?</AlertDialogTitle>
            <AlertDialogDescription>
              {itemAssets.length > 0
                ? "This pack has items, so it will be archived instead of permanently removed. Its assets stay in the vault."
                : "The pack has no items and will be permanently removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function PackAssetCard({ asset, isCover, onRemove, onSetCover }: any) {
  const Icon = ASSET_ICON[asset.asset_type as AssetType] ?? FileText;
  const [preview, setPreview] = useState<string | null>(null);
  const signUrl = useServerFn(getAssetSignedUrl);

  useEffect(() => {
    let alive = true;
    if (["image", "video", "audio"].includes(asset.asset_type) && asset.storage_path) {
      signUrl({ data: { storagePath: asset.storage_path, expiresIn: 900 } })
        .then((r) => alive && setPreview(r.url)).catch(() => {});
    }
    return () => { alive = false; };
  }, [asset.storage_path, asset.asset_type, signUrl]);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="relative aspect-video w-full overflow-hidden bg-surface-elevated">
        {preview && asset.asset_type === "image" ? (
          <img src={preview} alt={asset.title} className="h-full w-full object-cover" loading="lazy" />
        ) : preview && asset.asset_type === "video" ? (
          <video src={preview} controls preload="metadata" className="h-full w-full bg-black object-contain" />
        ) : preview && asset.asset_type === "audio" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3">
            <Music className="h-8 w-8 text-muted-foreground" />
            <audio src={preview} controls className="w-full" />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Icon className="h-10 w-10" /></div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <Badge variant="outline" className="bg-background/70 backdrop-blur">{asset.asset_type}</Badge>
          {asset.is_synthetic && <Badge className="bg-brand/20 text-brand-glow"><Sparkles className="mr-1 h-3 w-3" />Synthetic</Badge>}
          {isCover && <Badge className="bg-amber-400/20 text-amber-200"><Star className="mr-1 h-3 w-3" />Cover</Badge>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="line-clamp-1 text-sm font-semibold">{asset.title}</div>
        <div className="text-[11px] text-muted-foreground">{asset.category || "Uncategorised"} · {asset.moderation_status}</div>
        {asset.tags && asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {asset.tags.slice(0, 6).map((t: string) => (
              <span key={t} className="rounded-full border border-border/60 bg-background/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">#{t}</span>
            ))}
          </div>
        )}
        <div className="mt-auto flex justify-end gap-1">
          {!isCover && <Button variant="ghost" size="sm" onClick={onSetCover} title="Set cover"><Star className="h-4 w-4" /></Button>}
          <Button variant="ghost" size="sm" onClick={onRemove} className="text-destructive hover:text-destructive" title="Remove from pack">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusBanner({ pack, status }: { pack: any; status: PackStatus }) {
  const reviewedAt = pack.reviewed_at ? new Date(pack.reviewed_at).toLocaleString() : null;
  if (status === "approved") {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="flex-1">
          <div className="font-semibold">Approved{reviewedAt ? ` · ${reviewedAt}` : ""}</div>
          <div className="text-emerald-200/80">This pack is live for attached personas.</div>
          {pack.review_feedback && <div className="mt-1 text-emerald-100/90">Reviewer: {pack.review_feedback}</div>}
        </div>
      </div>
    );
  }
  if (status === "in_review") {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
        <Clock className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="flex-1">
          <div className="font-semibold">Pending review</div>
          <div className="text-amber-200/80">Admins will review shortly. You can't edit until a decision is made.</div>
        </div>
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="flex-1">
          <div className="font-semibold">Rejected{reviewedAt ? ` · ${reviewedAt}` : ""}</div>
          {pack.review_note && <div className="mt-1"><strong>Reason:</strong> {pack.review_note}</div>}
          {pack.review_feedback && <div className="mt-1"><strong>Feedback:</strong> {pack.review_feedback}</div>}
          <div className="mt-1 text-rose-200/80">Address the notes above, then resubmit.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-border bg-surface/60 p-3 text-sm text-muted-foreground">
      <FileText className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex-1">
        <div className="font-semibold text-foreground">Draft</div>
        <div>Add assets, tag them, then submit for admin approval.</div>
      </div>
    </div>
  );
}

type UploadRow = {
  file: File;
  title: string;
  isSynthetic: boolean;
  status: "pending" | "uploading" | "uploaded" | "failed";
  error?: string;
  storagePath?: string;
  assetType: AssetType;
};

function BulkUploadDialog({ open, onOpenChange, creatorId, packId, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; creatorId: string; packId: string; onDone: () => void;
}) {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [sharedCategory, setSharedCategory] = useState("");
  const [sharedSynthetic, setSharedSynthetic] = useState(false);
  const [busy, setBusy] = useState(false);
  const uploadFn = useServerFn(bulkUploadToPack);

  useEffect(() => { if (open) { setRows([]); setSharedCategory(""); setSharedSynthetic(false); setBusy(false); } }, [open]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next: UploadRow[] = [];
    for (const f of Array.from(files).slice(0, 50 - rows.length)) {
      next.push({
        file: f,
        title: f.name.replace(/\.[^/.]+$/, ""),
        isSynthetic: sharedSynthetic,
        status: "pending",
        assetType: detectAssetType(f),
      });
    }
    setRows((prev) => [...prev, ...next]);
  }

  function updateRow(idx: number, patch: Partial<UploadRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function submit() {
    if (rows.length === 0) { toast.error("Add files first."); return; }
    setBusy(true);
    try {
      const queue = rows.map((_, i) => i);
      const worker = async () => {
        while (queue.length) {
          const i = queue.shift()!;
          const r = rows[i];
          updateRow(i, { status: "uploading", error: undefined });
          try {
            const ext = r.file.name.includes(".") ? r.file.name.slice(r.file.name.lastIndexOf(".")) : "";
            const key = `${creatorId}/${crypto.randomUUID()}${ext}`;
            const { error: upErr } = await supabase.storage
              .from("content-assets")
              .upload(key, r.file, { cacheControl: "3600", upsert: false, contentType: r.file.type || undefined });
            if (upErr) throw upErr;
            r.storagePath = key; r.status = "uploaded";
            updateRow(i, { status: "uploaded", storagePath: key });
          } catch (err: any) {
            updateRow(i, { status: "failed", error: err?.message ?? "Upload failed" });
          }
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);

      const good = rows.filter((r) => r.status === "uploaded" && r.storagePath);
      if (!good.length) throw new Error("No files uploaded successfully.");

      const res = await uploadFn({ data: {
        packId,
        items: good.map((r) => ({
          title: r.title.trim() || r.file.name,
          assetType: r.assetType,
          storagePath: r.storagePath!,
          category: sharedCategory.trim() || undefined,
          isSynthetic: r.isSynthetic,
        })),
      }});
      toast.success(`Added ${res.count} asset${res.count === 1 ? "" : "s"} to pack`);
      onOpenChange(false);
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? "Import failed");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk upload to pack</DialogTitle>
          <DialogDescription>Drop up to 50 files. They'll be added to this pack.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface/40 p-6 text-center hover:border-brand/50">
            <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
            <span className="text-sm">Click to add files</span>
            <span className="text-xs text-muted-foreground">image, video, audio, or text — up to 50 total</span>
            <input type="file" multiple accept="image/*,video/*,audio/*,.txt,.md,.pdf" className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ""; }} />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Shared category</Label>
              <Input value={sharedCategory} onChange={(e) => setSharedCategory(e.target.value)} placeholder="e.g. dec-2026" />
            </div>
            <div className="flex items-end justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
              <div>
                <div className="text-sm font-medium">Mark all synthetic</div>
                <div className="text-xs text-muted-foreground">Adds AI disclosure to every file.</div>
              </div>
              <Switch checked={sharedSynthetic} onCheckedChange={(v) => {
                setSharedSynthetic(v);
                setRows((prev) => prev.map((r) => ({ ...r, isSynthetic: v })));
              }} />
            </div>
          </div>

          {rows.length > 0 && (
            <div className="max-h-72 overflow-auto rounded-lg border border-border/60">
              <table className="w-full text-xs">
                <thead className="bg-surface-elevated/70 text-left uppercase tracking-widest text-[10px] text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2">Title</th><th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Size</th><th className="px-2 py-2">Status</th><th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-border/40">
                      <td className="px-2 py-1">
                        <Input value={r.title} onChange={(e) => updateRow(i, { title: e.target.value })} className="h-7 text-xs" />
                      </td>
                      <td className="px-2 py-1">{r.assetType}</td>
                      <td className="px-2 py-1 text-muted-foreground">{(r.file.size/1024/1024).toFixed(1)} MB</td>
                      <td className="px-2 py-1">
                        {r.status === "pending" && <span className="text-muted-foreground">queued</span>}
                        {r.status === "uploading" && <span className="text-brand-glow">uploading…</span>}
                        {r.status === "uploaded" && <span className="text-emerald-400">uploaded</span>}
                        {r.status === "failed" && <span className="text-destructive" title={r.error}>failed</span>}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <button type="button" onClick={() => setRows((p) => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || rows.length === 0}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importing…</> : `Import ${rows.length || ""} file${rows.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddFromVaultDialog({ open, onOpenChange, packId, vault, existingIds, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; packId: string;
  vault: any[]; existingIds: Set<string>; onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const addFn = useServerFn(addAssetsToPack);
  const available = useMemo(() => vault.filter((a) => !existingIds.has(a.id) && (query ? a.title.toLowerCase().includes(query.toLowerCase()) : true)), [vault, existingIds, query]);

  useEffect(() => { if (open) { setSelected(new Set()); setQuery(""); setBusy(false); } }, [open]);

  async function submit() {
    if (selected.size === 0) { toast.error("Pick at least one asset."); return; }
    setBusy(true);
    try {
      await addFn({ data: { packId, assetIds: Array.from(selected) } });
      toast.success(`Added ${selected.size} asset${selected.size === 1 ? "" : "s"}`);
      onOpenChange(false); onDone();
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add from vault</DialogTitle>
          <DialogDescription>Add existing vault assets to this pack.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Search assets…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-border/60">
          {available.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Nothing available to add.</div>
          ) : available.map((a) => {
            const Icon = ASSET_ICON[a.asset_type as AssetType] ?? FileText;
            const checked = selected.has(a.id);
            return (
              <label key={a.id} className="flex cursor-pointer items-center gap-3 border-b border-border/40 p-2 hover:bg-surface-elevated/40">
                <input type="checkbox" checked={checked} onChange={() => toggle(a.id)} className="h-4 w-4 accent-brand" />
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 truncate text-sm">{a.title}</div>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{a.asset_type}</span>
                {a.is_synthetic && <Badge className="bg-brand/20 text-brand-glow"><Sparkles className="mr-1 h-3 w-3" />AI</Badge>}
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || selected.size === 0}>Add {selected.size || ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPackDialog({ open, onOpenChange, pack, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; pack: any; onDone: () => void;
}) {
  const [name, setName] = useState(pack.name);
  const [description, setDescription] = useState(pack.description ?? "");
  const [startsAt, setStartsAt] = useState(pack.starts_at ? pack.starts_at.slice(0,10) : "");
  const [endsAt, setEndsAt] = useState(pack.ends_at ? pack.ends_at.slice(0,10) : "");
  const [busy, setBusy] = useState(false);
  const updateFn = useServerFn(updatePack);

  useEffect(() => {
    if (open) {
      setName(pack.name); setDescription(pack.description ?? "");
      setStartsAt(pack.starts_at ? pack.starts_at.slice(0,10) : "");
      setEndsAt(pack.ends_at ? pack.ends_at.slice(0,10) : "");
      setBusy(false);
    }
  }, [open, pack]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await updateFn({ data: {
        packId: pack.id, name, description,
        startsAt: startsAt || null, endsAt: endsAt || null,
      }});
      toast.success("Pack updated");
      onOpenChange(false); onDone();
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit pack</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <Label htmlFor="ep-name">Name</Label>
            <Input id="ep-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <div>
            <Label htmlFor="ep-desc">Description</Label>
            <Textarea id="ep-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ep-start">Starts</Label>
              <Input id="ep-start" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ep-end">Ends</Label>
              <Input id="ep-end" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AuditDialog({ open, onOpenChange, packId }: { open: boolean; onOpenChange: (o: boolean) => void; packId: string }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const listFn = useServerFn(listPackAudit);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listFn({ data: { packId } })
      .then((r) => setEntries(r.entries))
      .catch((e) => toast.error(e?.message ?? "Failed to load audit"))
      .finally(() => setLoading(false));
  }, [open, packId, listFn]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pack audit trail</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No events yet.</div>
        ) : (
          <ul className="max-h-96 divide-y divide-border overflow-auto">
            {entries.map((e) => (
              <li key={e.id} className="py-2 text-sm">
                <div className="font-mono text-xs text-brand-glow">{e.action}</div>
                <div className="text-[11px] text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
                {e.metadata && Object.keys(e.metadata).length > 0 && (
                  <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] text-muted-foreground">{JSON.stringify(e.metadata, null, 2)}</pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}