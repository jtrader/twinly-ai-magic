import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  FileText, Image as ImageIcon, Music, Trash2, Upload, Video, Sparkles, Link2, Loader2,
  History, Eye, Layers, Lock, DollarSign, Check, X,
} from "lucide-react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import {
  listVault, createAsset, updateAsset, deleteAsset,
  setAssetPersonaPermission, removeAssetFromPersona, getAssetSignedUrl,
  bulkCreateAssets, listAssetAudit, submitAssetForReview,
} from "@/lib/content-vault.functions";

export const Route = createFileRoute("/studio/content")({ component: ContentVaultPage });

type Vault = Awaited<ReturnType<typeof listVault>>;
type Asset = Vault["assets"][number];
type Persona = Vault["personas"][number];
type Permission = Vault["permissions"][number];
type AssetType = Asset["asset_type"];
type PermissionType = Permission["permission_type"];

const ASSET_ICON: Record<AssetType, typeof ImageIcon> = {
  image: ImageIcon, video: Video, audio: Music, text: FileText,
};

const PERMISSION_LABEL: Record<PermissionType, string> = {
  included: "Included",
  ppv: "Pay-per-view",
  restricted: "Restricted",
};

function detectAssetType(file: File): AssetType {
  const t = file.type;
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  return "text";
}

function ContentVaultPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [vault, setVault] = useState<Vault | null>(null);
  const [ready, setReady] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | "all">("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [auditing, setAuditing] = useState<Asset | null>(null);

  const load = useServerFn(listVault);
  const remove = useServerFn(deleteAsset);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const refresh = useCallback(async () => {
    try {
      const res = await load();
      setVault(res);
    } catch (err: any) {
      if (`${err?.message ?? ""}`.includes("creator profile")) {
        navigate({ to: "/onboarding" });
        return;
      }
      toast.error(err?.message ?? "Failed to load vault");
    } finally {
      setReady(true);
    }
  }, [load, navigate]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  const permissionsByAsset = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of vault?.permissions ?? []) {
      if (!map.has(p.asset_id)) map.set(p.asset_id, []);
      map.get(p.asset_id)!.push(p);
    }
    return map;
  }, [vault]);

  const filteredAssets = useMemo(() => {
    if (!vault) return [];
    if (selectedPersonaId === "all") return vault.assets;
    return vault.assets.filter((a) => permissionsByAsset.get(a.id)?.some((p) => p.persona_id === selectedPersonaId));
  }, [vault, selectedPersonaId, permissionsByAsset]);

  async function handleDelete() {
    if (!deleting) return;
    try {
      await remove({ data: { assetId: deleting.id } });
      toast.success("Asset deleted");
      setDeleting(null);
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Delete failed");
    }
  }

  if (loading || !ready) {
    return <AppShell><div className="py-16 text-center text-sm text-muted-foreground">Loading vault…</div></AppShell>;
  }
  if (!vault) return null;

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Content vault</div>
          <h1 className="mt-1 font-display text-3xl font-bold">Per-persona library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload assets and control which personas can use them. Synthetic content stays labelled.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/studio/personas"><Button variant="ghost">Personas</Button></Link>
          <Link to="/studio/packs"><Button variant="ghost">Packs</Button></Link>
          <Button variant="ghost" onClick={() => setPreviewOpen(true)}>
            <Eye className="mr-2 h-4 w-4" />Preview
          </Button>
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <Layers className="mr-2 h-4 w-4" />Bulk import
          </Button>
          <Button onClick={() => setUploadOpen(true)}><Upload className="mr-2 h-4 w-4" />New upload</Button>
        </div>
      </div>

      <PersonaFilterBar
        personas={vault.personas}
        assets={vault.assets}
        permissionsByAsset={permissionsByAsset}
        selected={selectedPersonaId}
        onSelect={setSelectedPersonaId}
      />

      {filteredAssets.length === 0 ? (
        <EmptyState onUpload={() => setUploadOpen(true)} filtered={selectedPersonaId !== "all"} />
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAssets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              personas={vault.personas}
              permissions={permissionsByAsset.get(asset.id) ?? []}
              onChanged={refresh}
              onDelete={() => setDeleting(asset)}
              onEdit={() => setEditing(asset)}
              onAudit={() => setAuditing(asset)}
            />
          ))}
        </div>
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        creatorId={vault.creator.id}
        personas={vault.personas}
        defaultPersonaId={selectedPersonaId === "all" ? null : selectedPersonaId}
        onDone={refresh}
      />
      <BulkUploadDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        creatorId={vault.creator.id}
        personas={vault.personas}
        defaultPersonaId={selectedPersonaId === "all" ? null : selectedPersonaId}
        onDone={refresh}
      />
      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        personas={vault.personas}
        assets={vault.assets}
        permissionsByAsset={permissionsByAsset}
        initialPersonaId={selectedPersonaId === "all" ? vault.personas[0]?.id ?? null : selectedPersonaId}
      />
      <AuditDialog asset={auditing} onClose={() => setAuditing(null)} personas={vault.personas} />
      <EditDialog
        asset={editing}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete asset?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes “{deleting?.title}” from your vault, the storage file, and every persona it was attached to.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function PersonaFilterBar({
  personas, assets, permissionsByAsset, selected, onSelect,
}: {
  personas: Persona[];
  assets: Asset[];
  permissionsByAsset: Map<string, Permission[]>;
  selected: string | "all";
  onSelect: (id: string | "all") => void;
}) {
  const countFor = (personaId: string) =>
    assets.filter((a) => permissionsByAsset.get(a.id)?.some((p) => p.persona_id === personaId)).length;

  return (
    <div className="flex flex-wrap gap-2">
      <FilterChip active={selected === "all"} onClick={() => onSelect("all")}>
        All assets <span className="ml-1 text-muted-foreground">· {assets.length}</span>
      </FilterChip>
      {personas.map((p) => (
        <FilterChip key={p.id} active={selected === p.id} onClick={() => onSelect(p.id)}>
          {p.kind === "ai" ? "🤖 " : "👤 "}{p.display_name}
          <span className="ml-1 text-muted-foreground">· {countFor(p.id)}</span>
        </FilterChip>
      ))}
    </div>
  );
}

function FilterChip({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1.5 text-xs font-medium transition " +
        (active
          ? "border-brand bg-brand/10 text-brand-glow"
          : "border-border bg-surface text-muted-foreground hover:border-brand/40 hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

function EmptyState({ onUpload, filtered }: { onUpload: () => void; filtered: boolean }) {
  return (
    <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center">
      <p className="text-sm text-muted-foreground">
        {filtered
          ? "No assets attached to this persona yet."
          : "Your vault is empty. Upload your first asset to get started."}
      </p>
      <Button className="mt-4" onClick={onUpload}><Upload className="mr-2 h-4 w-4" />Upload</Button>
    </div>
  );
}

function AssetCard({
  asset, personas, permissions, onChanged, onDelete, onEdit, onAudit,
}: {
  asset: Asset;
  personas: Persona[];
  permissions: Permission[];
  onChanged: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onAudit: () => void;
}) {
  const Icon = ASSET_ICON[asset.asset_type] ?? FileText;
  const [preview, setPreview] = useState<string | null>(null);
  const signUrl = useServerFn(getAssetSignedUrl);
  const setPerm = useServerFn(setAssetPersonaPermission);
  const removePerm = useServerFn(removeAssetFromPersona);

  useEffect(() => {
    let alive = true;
    if (asset.asset_type === "image" && asset.storage_path) {
      signUrl({ data: { storagePath: asset.storage_path, expiresIn: 900 } })
        .then((r) => alive && setPreview(r.url))
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [asset.storage_path, asset.asset_type, signUrl]);

  const permByPersona = new Map(permissions.map((p) => [p.persona_id, p.permission_type]));

  async function togglePersona(personaId: string, checked: boolean) {
    try {
      if (checked) {
        await setPerm({ data: { assetId: asset.id, personaId, permissionType: "included" } });
      } else {
        await removePerm({ data: { assetId: asset.id, personaId } });
      }
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Update failed");
    }
  }

  async function changePermission(personaId: string, permissionType: PermissionType) {
    try {
      await setPerm({ data: { assetId: asset.id, personaId, permissionType } });
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Update failed");
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="relative aspect-video w-full overflow-hidden bg-surface-elevated">
        {preview ? (
          <img src={preview} alt={asset.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Icon className="h-10 w-10" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <Badge variant="outline" className="bg-background/70 backdrop-blur">{asset.asset_type}</Badge>
          {asset.is_synthetic && (
            <Badge className="bg-brand/20 text-brand-glow"><Sparkles className="mr-1 h-3 w-3" />Synthetic</Badge>
          )}
          {asset.external_url && !asset.storage_path && (
            <Badge variant="outline" className="bg-background/70 backdrop-blur"><Link2 className="mr-1 h-3 w-3" />External</Badge>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="line-clamp-1 font-display text-base font-semibold">{asset.title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {asset.category || "Uncategorised"} · {asset.moderation_status} · consent {asset.consent_status.replace("_"," ")}
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-background/40 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Persona access
          </div>
          {personas.length === 0 ? (
            <div className="text-xs text-muted-foreground">No personas yet.</div>
          ) : (
            <div className="space-y-2">
              {personas.map((p) => {
                const attached = permByPersona.has(p.id);
                const perm = permByPersona.get(p.id);
                return (
                  <div key={p.id} className="flex items-center gap-2">
                    <Switch
                      checked={attached}
                      onCheckedChange={(v) => togglePersona(p.id, v)}
                      aria-label={`Attach ${asset.title} to ${p.display_name}`}
                    />
                    <div className="flex-1 truncate text-xs">
                      <span className="text-foreground">{p.display_name}</span>
                      <span className="ml-1 text-muted-foreground">· {p.kind === "ai" ? "AI" : "Real Me"}</span>
                    </div>
                    {attached && (
                      <Select value={perm ?? "included"} onValueChange={(v) => changePermission(p.id, v as PermissionType)}>
                        <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue /></SelectTrigger>
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

        <div className="mt-auto flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onAudit} title="Audit trail">
            <History className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function UploadDialog({
  open, onOpenChange, creatorId, personas, defaultPersonaId, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  creatorId: string;
  personas: Persona[];
  defaultPersonaId: string | null;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"file" | "external">("file");
  const [file, setFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [externalType, setExternalType] = useState<AssetType>("image");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [isSynthetic, setIsSynthetic] = useState(false);
  const [selectedPersonas, setSelectedPersonas] = useState<Set<string>>(new Set());
  const [permission, setPermission] = useState<PermissionType>("included");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createFn = useServerFn(createAsset);

  useEffect(() => {
    if (open) {
      setMode("file"); setFile(null); setExternalUrl(""); setExternalType("image");
      setTitle(""); setCategory(""); setIsSynthetic(false);
      setSelectedPersonas(defaultPersonaId ? new Set([defaultPersonaId]) : new Set());
      setPermission("included"); setBusy(false);
    }
  }, [open, defaultPersonaId]);

  function togglePersona(id: string) {
    setSelectedPersonas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error("Give the asset a title."); return; }
    if (mode === "file" && !file) { toast.error("Pick a file first."); return; }
    if (mode === "external" && !externalUrl.trim()) { toast.error("Paste an external URL."); return; }

    setBusy(true);
    try {
      let storagePath: string | undefined;
      let assetType: AssetType = externalType;

      if (mode === "file" && file) {
        assetType = detectAssetType(file);
        const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
        const key = `${creatorId}/${crypto.randomUUID()}${ext}`;
        const { error: upErr } = await supabase.storage
          .from("content-assets")
          .upload(key, file, { cacheControl: "3600", upsert: false, contentType: file.type || undefined });
        if (upErr) throw upErr;
        storagePath = key;
      }

      await createFn({
        data: {
          title: title.trim(),
          assetType,
          storagePath,
          externalUrl: mode === "external" ? externalUrl.trim() : undefined,
          category: category.trim() || undefined,
          isSynthetic,
          aiGeneratedLabel: isSynthetic,
          attachPersonaIds: Array.from(selectedPersonas),
          permissionType: permission,
        },
      });
      toast.success("Asset added to vault");
      onOpenChange(false);
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add asset</DialogTitle>
          <DialogDescription>
            Files stay in your private storage bucket. Attach to personas to make them usable in chats.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="flex gap-2">
            <FilterChip active={mode === "file"} onClick={() => setMode("file")}>Upload file</FilterChip>
            <FilterChip active={mode === "external"} onClick={() => setMode("external")}>External link</FilterChip>
          </div>

          {mode === "file" ? (
            <div>
              <Label>File</Label>
              <input
                ref={inputRef}
                type="file"
                accept="image/*,video/*,audio/*,.txt,.md,.pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !title) setTitle(f.name.replace(/\.[^/.]+$/, ""));
                }}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-foreground"
              />
              {file && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {detectAssetType(file)} · {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <div>
                <Label htmlFor="ext-url">External URL</Label>
                <Input id="ext-url" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://…" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={externalType} onValueChange={(v) => setExternalType(v as AssetType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="audio">Audio</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
          </div>
          <div>
            <Label htmlFor="category">Category (optional)</Label>
            <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. behind-the-scenes" />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Synthetic / AI-generated</div>
              <div className="text-xs text-muted-foreground">Adds an AI disclosure label whenever this asset is shown.</div>
            </div>
            <Switch checked={isSynthetic} onCheckedChange={setIsSynthetic} />
          </div>

          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Attach to personas</div>
              <Select value={permission} onValueChange={(v) => setPermission(v as PermissionType)}>
                <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PERMISSION_LABEL) as PermissionType[]).map((k) => (
                    <SelectItem key={k} value={k}>{PERMISSION_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {personas.length === 0 ? (
              <div className="text-xs text-muted-foreground">Create a persona first to attach assets.</div>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {personas.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-surface-elevated">
                    <input
                      type="checkbox"
                      checked={selectedPersonas.has(p.id)}
                      onChange={() => togglePersona(p.id)}
                      className="h-4 w-4 accent-brand"
                    />
                    <span className="truncate">{p.display_name}</span>
                    <span className="text-xs text-muted-foreground">{p.kind === "ai" ? "AI" : "Real Me"}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : "Add asset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  asset, onClose, onSaved,
}: {
  asset: Asset | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [isSynthetic, setIsSynthetic] = useState(false);
  const [busy, setBusy] = useState(false);
  const update = useServerFn(updateAsset);
  const submitReview = useServerFn(submitAssetForReview);
  const status = asset?.approval_status ?? "draft";

  useEffect(() => {
    if (asset) {
      setTitle(asset.title);
      setCategory(asset.category ?? "");
      setIsSynthetic(asset.is_synthetic);
    }
  }, [asset]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!asset) return;
    setBusy(true);
    try {
      await update({
        data: {
          assetId: asset.id, title, category, isSynthetic,
          aiGeneratedLabel: isSynthetic,
        },
      });
      toast.success("Asset updated");
      onClose();
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit asset</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {asset && (
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2">
              <div>
                <div className="text-sm font-medium">Review status</div>
                <div className="text-xs text-muted-foreground">
                  {status === "approved" ? "Approved by admin — cleared for fan-facing use."
                    : status === "pending" ? "Awaiting admin review."
                    : status === "rejected" ? "Rejected — see moderation notes."
                    : "Draft — not yet submitted."}
                </div>
              </div>
              <Badge
                variant="outline"
                className={
                  status === "approved" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                  : status === "pending" ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                  : status === "rejected" ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                  : ""
                }
              >{status}</Badge>
            </div>
          )}
          {asset && isSynthetic && status !== "approved" && status !== "pending" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await submitReview({ data: { assetId: asset.id } });
                  toast.success("Submitted for review");
                  onSaved();
                  onClose();
                } catch (e: any) { toast.error(e?.message ?? "Failed"); }
              }}
            >Submit for review</Button>
          )}
          <div>
            <Label htmlFor="e-title">Title</Label>
            <Input id="e-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label htmlFor="e-cat">Category</Label>
            <Input id="e-cat" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Synthetic / AI-generated</div>
              <div className="text-xs text-muted-foreground">Keeps this asset labelled in fan-facing surfaces.</div>
            </div>
            <Switch checked={isSynthetic} onCheckedChange={setIsSynthetic} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Bulk upload ----------------

type BulkRow = {
  file: File;
  title: string;
  category: string;
  isSynthetic: boolean;
  status: "pending" | "uploading" | "uploaded" | "failed";
  error?: string;
  storagePath?: string;
  assetType: AssetType;
};

function BulkUploadDialog({
  open, onOpenChange, creatorId, personas, defaultPersonaId, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  creatorId: string;
  personas: Persona[];
  defaultPersonaId: string | null;
  onDone: () => void;
}) {
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [sharedCategory, setSharedCategory] = useState("");
  const [sharedSynthetic, setSharedSynthetic] = useState(false);
  const [selectedPersonas, setSelectedPersonas] = useState<Set<string>>(new Set());
  const [permission, setPermission] = useState<PermissionType>("included");
  const [busy, setBusy] = useState(false);
  const bulkFn = useServerFn(bulkCreateAssets);

  useEffect(() => {
    if (open) {
      setRows([]);
      setSharedCategory("");
      setSharedSynthetic(false);
      setSelectedPersonas(defaultPersonaId ? new Set([defaultPersonaId]) : new Set());
      setPermission("included");
      setBusy(false);
    }
  }, [open, defaultPersonaId]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next: BulkRow[] = [];
    for (const f of Array.from(files).slice(0, 50 - rows.length)) {
      next.push({
        file: f,
        title: f.name.replace(/\.[^/.]+$/, ""),
        category: sharedCategory,
        isSynthetic: sharedSynthetic,
        status: "pending",
        assetType: detectAssetType(f),
      });
    }
    setRows((prev) => [...prev, ...next]);
  }

  function updateRow(idx: number, patch: Partial<BulkRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }
  function toggleP(id: string) {
    setSelectedPersonas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (rows.length === 0) { toast.error("Add files first."); return; }
    for (const r of rows) {
      if (!r.title.trim()) { toast.error("Every file needs a title."); return; }
    }
    setBusy(true);
    let uploaded = 0;
    try {
      // Upload files in parallel (capped concurrency = 4)
      const queue = rows.map((_, i) => i);
      const worker = async () => {
        while (queue.length) {
          const i = queue.shift()!;
          const r = rows[i];
          if (r.status === "uploaded") continue;
          updateRow(i, { status: "uploading", error: undefined });
          try {
            const ext = r.file.name.includes(".") ? r.file.name.slice(r.file.name.lastIndexOf(".")) : "";
            const key = `${creatorId}/${crypto.randomUUID()}${ext}`;
            const { error: upErr } = await supabase.storage
              .from("content-assets")
              .upload(key, r.file, { cacheControl: "3600", upsert: false, contentType: r.file.type || undefined });
            if (upErr) throw upErr;
            r.storagePath = key;
            r.status = "uploaded";
            uploaded++;
            updateRow(i, { status: "uploaded", storagePath: key });
          } catch (err: any) {
            updateRow(i, { status: "failed", error: err?.message ?? "Upload failed" });
          }
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);

      const goodRows = rows.filter((r) => r.status === "uploaded" && r.storagePath);
      if (!goodRows.length) throw new Error("No files uploaded successfully.");

      const res = await bulkFn({
        data: {
          items: goodRows.map((r) => ({
            title: r.title.trim(),
            assetType: r.assetType,
            storagePath: r.storagePath!,
            category: r.category.trim() || undefined,
            isSynthetic: r.isSynthetic,
          })),
          attachPersonaIds: Array.from(selectedPersonas),
          permissionType: permission,
        },
      });
      toast.success(`Imported ${res.count} asset${res.count === 1 ? "" : "s"}`);
      onOpenChange(false);
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? "Bulk import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk import</DialogTitle>
          <DialogDescription>
            Drop up to 50 files. Titles come from filenames — edit any before importing. Shared category, disclosure, and persona attachments apply to every file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface/40 p-6 text-center hover:border-brand/50">
            <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
            <span className="text-sm">Click to add files</span>
            <span className="text-xs text-muted-foreground">image, video, audio, or text — up to 50 total</span>
            <input
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.txt,.md,.pdf"
              className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ""; }}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Shared category</Label>
              <Input value={sharedCategory} onChange={(e) => {
                setSharedCategory(e.target.value);
                setRows((prev) => prev.map((r) => ({ ...r, category: e.target.value })));
              }} placeholder="e.g. photoshoot-2026" />
            </div>
            <div className="flex items-end justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
              <div>
                <div className="text-sm font-medium">Mark all as synthetic</div>
                <div className="text-xs text-muted-foreground">Adds AI disclosure to every imported asset.</div>
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
                    <th className="px-2 py-2">Title</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Size</th>
                    <th className="px-2 py-2">Status</th>
                    <th />
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
                        <button type="button" onClick={() => removeRow(i)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Attach to personas</div>
              <Select value={permission} onValueChange={(v) => setPermission(v as PermissionType)}>
                <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PERMISSION_LABEL) as PermissionType[]).map((k) => (
                    <SelectItem key={k} value={k}>{PERMISSION_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {personas.length === 0 ? (
              <div className="text-xs text-muted-foreground">Create a persona first to attach assets.</div>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {personas.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-surface-elevated">
                    <input type="checkbox" checked={selectedPersonas.has(p.id)} onChange={() => toggleP(p.id)} className="h-4 w-4 accent-brand" />
                    <span className="truncate">{p.display_name}</span>
                    <span className="text-xs text-muted-foreground">{p.kind === "ai" ? "AI" : "Real Me"}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
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

// ---------------- Preview / access testing ----------------

type Audience = "subscriber" | "vip" | "ppv";

const AUDIENCE_LABEL: Record<Audience, string> = {
  subscriber: "Subscriber",
  vip: "VIP",
  ppv: "Pay-per-view viewer",
};

/**
 * Access rules used for the preview simulator:
 *  - included    → visible to Subscribers and VIPs; locked for PPV viewers (they buy à la carte)
 *  - ppv         → locked (blurred) to Subscribers; unlocked to PPV viewers; locked to VIPs unless they pay
 *  - restricted  → visible only to VIPs
 */
function accessFor(perm: PermissionType, audience: Audience): "visible" | "locked" | "hidden" {
  if (perm === "included") {
    if (audience === "ppv") return "locked";
    return "visible";
  }
  if (perm === "ppv") {
    if (audience === "ppv") return "visible";
    return "locked";
  }
  // restricted
  if (audience === "vip") return "visible";
  return "hidden";
}

function PreviewDialog({
  open, onOpenChange, personas, assets, permissionsByAsset, initialPersonaId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  personas: Persona[];
  assets: Asset[];
  permissionsByAsset: Map<string, Permission[]>;
  initialPersonaId: string | null;
}) {
  const [personaId, setPersonaId] = useState<string | null>(initialPersonaId);
  const [audience, setAudience] = useState<Audience>("subscriber");

  useEffect(() => { if (open) setPersonaId(initialPersonaId); }, [open, initialPersonaId]);

  const persona = personas.find((p) => p.id === personaId) ?? null;

  const rows = useMemo(() => {
    if (!persona) return [] as { asset: Asset; perm: PermissionType; state: "visible" | "locked" | "hidden" }[];
    const out: { asset: Asset; perm: PermissionType; state: "visible" | "locked" | "hidden" }[] = [];
    for (const a of assets) {
      const link = permissionsByAsset.get(a.id)?.find((p) => p.persona_id === persona.id);
      if (!link) continue;
      out.push({ asset: a, perm: link.permission_type, state: accessFor(link.permission_type, audience) });
    }
    return out;
  }, [persona, assets, permissionsByAsset, audience]);

  const visible = rows.filter((r) => r.state === "visible");
  const locked = rows.filter((r) => r.state === "locked");
  const hidden = rows.filter((r) => r.state === "hidden");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Preview persona access</DialogTitle>
          <DialogDescription>
            Simulate what fans see for each persona × audience tier. Access rules mirror the fan-facing feed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Persona</Label>
            <Select value={personaId ?? ""} onValueChange={(v) => setPersonaId(v)}>
              <SelectTrigger><SelectValue placeholder="Pick a persona" /></SelectTrigger>
              <SelectContent>
                {personas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.kind === "ai" ? "🤖 " : "👤 "}{p.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Viewing as</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((k) => (
                  <SelectItem key={k} value={k}>{AUDIENCE_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!persona ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Pick a persona to run the simulation.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline"><Check className="mr-1 h-3 w-3 text-emerald-400" />{visible.length} visible</Badge>
              <Badge variant="outline"><Lock className="mr-1 h-3 w-3 text-amber-400" />{locked.length} locked</Badge>
              <Badge variant="outline"><X className="mr-1 h-3 w-3 text-muted-foreground" />{hidden.length} hidden</Badge>
            </div>

            {rows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No assets are attached to this persona yet.
              </div>
            ) : (
              <div className="max-h-80 overflow-auto rounded-lg border border-border/60">
                <table className="w-full text-xs">
                  <thead className="bg-surface-elevated/70 text-left uppercase tracking-widest text-[10px] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Asset</th>
                      <th className="px-3 py-2">Permission</th>
                      <th className="px-3 py-2">{AUDIENCE_LABEL[audience]} sees</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ asset, perm, state }) => (
                      <tr key={asset.id} className="border-t border-border/40">
                        <td className="px-3 py-2">
                          <div className="font-medium">{asset.title}</div>
                          <div className="text-muted-foreground">
                            {asset.asset_type}{asset.is_synthetic && " · synthetic"}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline">{PERMISSION_LABEL[perm]}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          {state === "visible" && (
                            <span className="inline-flex items-center gap-1 text-emerald-400">
                              <Check className="h-3 w-3" />Full access
                            </span>
                          )}
                          {state === "locked" && (
                            <span className="inline-flex items-center gap-1 text-amber-400">
                              {perm === "ppv" ? <DollarSign className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                              {perm === "ppv" ? "Locked — buy to unlock" : "Locked"}
                            </span>
                          )}
                          {state === "hidden" && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <X className="h-3 w-3" />Not shown
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Audit trail ----------------

const ACTION_LABEL: Record<string, string> = {
  "asset.created": "Uploaded",
  "asset.bulk_created": "Bulk imported",
  "asset.updated": "Edited",
  "asset.deleted": "Deleted",
  "asset.permission_set": "Attached to persona",
  "asset.permission_removed": "Removed from persona",
};

function humanizeEntry(action: string, metadata: any, personas: Persona[]): { label: string; detail: string } {
  const label = ACTION_LABEL[action] ?? action;
  const personaName = (id: string) => personas.find((p) => p.id === id)?.display_name ?? id.slice(0, 8);
  if (action === "asset.created") {
    const bits = [metadata?.type && `type: ${metadata.type}`, metadata?.synthetic && "marked synthetic (AI disclosure applied)"].filter(Boolean);
    return { label, detail: bits.join(" · ") || "Initial upload" };
  }
  if (action === "asset.updated") {
    const fields: string[] = metadata?.fields ?? [];
    const nice = fields.map((f) => {
      if (f === "is_synthetic" || f === "ai_generated_label") return "AI disclosure";
      if (f === "title") return "title";
      if (f === "category") return "category";
      if (f === "price_cents") return "price";
      return f;
    });
    return { label, detail: nice.length ? `Changed ${nice.join(", ")}` : "Edited" };
  }
  if (action === "asset.permission_set") {
    return { label, detail: `${personaName(metadata?.persona)} · ${metadata?.permission ?? "included"}` };
  }
  if (action === "asset.permission_removed") {
    return { label, detail: personaName(metadata?.persona) };
  }
  return { label, detail: metadata ? JSON.stringify(metadata) : "" };
}

function AuditDialog({
  asset, onClose, personas,
}: {
  asset: Asset | null;
  onClose: () => void;
  personas: Persona[];
}) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const loadFn = useServerFn(listAssetAudit);

  useEffect(() => {
    if (!asset) return;
    let alive = true;
    setLoading(true);
    loadFn({ data: { assetId: asset.id } })
      .then((r) => alive && setEntries(r.entries))
      .catch((err: any) => toast.error(err?.message ?? "Could not load audit trail"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [asset, loadFn]);

  return (
    <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Audit trail</DialogTitle>
          <DialogDescription>{asset?.title}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />Loading…
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No audit entries yet.
          </div>
        ) : (
          <ol className="relative max-h-96 space-y-4 overflow-auto border-l border-border/60 pl-4">
            {entries.map((e) => {
              const { label, detail } = humanizeEntry(e.action, e.metadata, personas);
              return (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand" />
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </div>
                  <div className="text-sm font-medium">{label}</div>
                  {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
                </li>
              );
            })}
          </ol>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}