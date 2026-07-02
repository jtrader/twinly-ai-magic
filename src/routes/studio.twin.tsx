import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft, Upload, Trash2, ShieldCheck, ShieldAlert, User, Mic, Palette,
  Sparkles, X, Loader2, Image as ImageIcon,
} from "lucide-react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import {
  getTwinProfile, addTwinReference, updateTwinReference, removeTwinReference,
  upsertTwinConsent, revokeTwinConsent, upsertStyleNotes, getTwinRefSignedUrl,
} from "@/lib/twin.functions";

export const Route = createFileRoute("/studio/twin")({
  component: TwinProfilePage,
  head: () => ({ meta: [
    { title: "Digital twin profile — Twinly.life" },
    { name: "robots", content: "noindex" },
  ]}),
});

type Kind = "identity_ref" | "voice_ref" | "style_ref";

const ALLOWED_PRESETS: Array<{ key: string; label: string; hint: string }> = [
  { key: "ai_images",       label: "AI images",             hint: "Generate still images from likeness." },
  { key: "ai_video",        label: "AI video",              hint: "Generate short videos or clips." },
  { key: "ai_voice",        label: "AI voice replies",      hint: "Speak in your cloned voice." },
  { key: "ai_chat_persona", label: "AI chat personas",      hint: "Power text conversations." },
  { key: "sellable",        label: "Sellable synthetic",    hint: "Include AI assets in paid packs." },
  { key: "manager_gen",     label: "Manager-generated",     hint: "Managers may create AI content on your behalf." },
  { key: "post_termination",label: "Survives termination",  hint: "Keep assets active if account closes." },
];

const FORBIDDEN_PRESETS: Array<{ key: string; label: string }> = [
  { key: "no_minors",         label: "No minors / underage themes" },
  { key: "no_impersonation",  label: "No impersonation of other real people" },
  { key: "no_political",      label: "No political endorsements" },
  { key: "no_medical",        label: "No medical or health claims" },
  { key: "no_hate",           label: "No hateful or discriminatory content" },
  { key: "no_violence",       label: "No graphic violence or gore" },
];

const STYLE_FIELDS: Array<{ key: string; label: string; placeholder: string }> = [
  { key: "lighting",  label: "Lighting",  placeholder: "e.g. golden hour, softbox, moody neon" },
  { key: "wardrobe",  label: "Wardrobe",  placeholder: "e.g. lingerie, streetwear, cocktail dress" },
  { key: "setting",   label: "Setting",   placeholder: "e.g. bedroom, rooftop, poolside" },
  { key: "palette",   label: "Palette",   placeholder: "e.g. warm pastels, deep jewel tones" },
  { key: "mood",      label: "Mood",      placeholder: "e.g. flirty, cinematic, playful" },
];

function TwinProfilePage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [data, setData] = useState<Awaited<ReturnType<typeof getTwinProfile>> | null>(null);
  const [ready, setReady] = useState(false);

  const load = useServerFn(getTwinProfile);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const refresh = useCallback(async () => {
    try { setData(await load()); }
    catch (err: any) { toast.error(err?.message ?? "Failed to load"); }
    finally { setReady(true); }
  }, [load]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  const status = useMemo<{ label: string; tone: string }>(() => {
    if (!data) return { label: "Loading", tone: "border-border bg-surface text-muted-foreground" };
    if (data.consent?.revoked_at) return { label: "Revoked", tone: "border-rose-400/30 bg-rose-400/10 text-rose-300" };
    const consent = data.consent;
    const refCount = data.refs.length;
    const anyOk = consent && (consent.likeness_ok || consent.voice_ok || consent.image_ok || consent.video_ok);
    if (anyOk && refCount >= 3) return { label: "Ready", tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" };
    if (anyOk || refCount > 0) return { label: "In progress", tone: "border-amber-400/30 bg-amber-400/10 text-amber-300" };
    return { label: "Draft", tone: "border-border bg-surface text-muted-foreground" };
  }, [data]);

  if (!ready) {
    return <AppShell><div className="grid h-64 place-items-center text-muted-foreground"><Loader2 className="size-6 animate-spin" /></div></AppShell>;
  }
  if (!data) return null;

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/studio" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /></Link>
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Digital twin profile</div>
            <h1 className="mt-1 font-display text-3xl font-bold">{data.creator.stage_name}</h1>
          </div>
        </div>
        <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${status.tone}`}>
          <Sparkles className="size-3.5" /> {status.label}
        </div>
      </div>

      <nav className="mb-6 flex flex-wrap gap-2 text-xs">
        <a href="#identity"  className="rounded-full border border-border bg-surface px-3 py-1 hover:border-brand/50">Identity</a>
        <a href="#voice"     className="rounded-full border border-border bg-surface px-3 py-1 hover:border-brand/50">Voice</a>
        <a href="#style"     className="rounded-full border border-border bg-surface px-3 py-1 hover:border-brand/50">Style</a>
        <a href="#consent"   className="rounded-full border border-border bg-surface px-3 py-1 hover:border-brand/50">Consent</a>
        <a href="#allowed"   className="rounded-full border border-border bg-surface px-3 py-1 hover:border-brand/50">Allowed uses</a>
        <a href="#forbidden" className="rounded-full border border-border bg-surface px-3 py-1 hover:border-brand/50">Forbidden uses</a>
      </nav>

      <div className="grid gap-6">
        <ReferencesSection
          id="identity" title="Identity references" icon={<User className="size-4" />}
          hint="Upload 5+ clear photos: face front, 3/4 profile, side, body, expressions. Used to anchor likeness."
          kind="identity_ref" accept="image/*"
          creatorId={data.creator.id} refs={data.refs.filter((r) => r.kind === "identity_ref")}
          onChanged={refresh}
        />
        <ReferencesSection
          id="voice" title="Voice references" icon={<Mic className="size-4" />}
          hint="Upload 30–120s clean audio clips (WAV/MP3). Add a matching script in the notes for best voice cloning."
          kind="voice_ref" accept="audio/*"
          creatorId={data.creator.id} refs={data.refs.filter((r) => r.kind === "voice_ref")}
          onChanged={refresh}
          extra={data.voice ? (
            <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">Voice profile</div>
              {data.voice.tone_summary && <div className="mt-1">Tone: {data.voice.tone_summary}</div>}
              {data.voice.sales_style && <div>Sales style: {data.voice.sales_style}</div>}
              {(data.voice.banned_phrases?.length ?? 0) > 0 && (
                <div className="mt-1">Banned: {data.voice.banned_phrases.join(", ")}</div>
              )}
            </div>
          ) : null}
        />
        <StyleSection creator={data.creator} onSaved={refresh} />
        <ReferencesSection
          id="style-refs" title="Style mood board" icon={<Palette className="size-4" />}
          hint="Drop reference images for lighting, wardrobe, settings, palette, or mood."
          kind="style_ref" accept="image/*"
          creatorId={data.creator.id} refs={data.refs.filter((r) => r.kind === "style_ref")}
          onChanged={refresh}
        />
        <ConsentSection data={data} onChanged={refresh} />
        <AllowedUsesSection data={data} onChanged={refresh} />
        <ForbiddenUsesSection data={data} onChanged={refresh} />

        <div className="rounded-2xl border border-brand/20 bg-brand/5 p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold text-brand-glow">
            <ShieldCheck className="size-4" /> AI disclosure preview
          </div>
          <p className="mt-2 text-muted-foreground">
            Fans will see this label on every synthetic asset generated from your twin,
            in line with EU AI Act Article 50:
          </p>
          <div className="mt-3 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-foreground">
            AI-generated content • Official {data.creator.stage_name} persona • Made with the creator’s consent.
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ---------- References ---------- */

function ReferencesSection({
  id, title, icon, hint, kind, accept, creatorId, refs, onChanged, extra,
}: {
  id: string; title: string; icon: React.ReactNode; hint: string;
  kind: Kind; accept: string; creatorId: string;
  refs: Array<{ id: string; storage_path: string; mime_type: string | null; slot_label: string | null; notes: string | null }>;
  onChanged: () => void; extra?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const add = useServerFn(addTwinReference);

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      const files = Array.from(list).slice(0, 20);
      for (const f of files) {
        const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")) : "";
        const key = `${creatorId}/twin/${kind}/${crypto.randomUUID()}${ext}`;
        const { error } = await supabase.storage
          .from("content-assets")
          .upload(key, f, { cacheControl: "3600", upsert: false, contentType: f.type || undefined });
        if (error) { toast.error(`${f.name}: ${error.message}`); continue; }
        await add({ data: { kind, storagePath: key, mimeType: f.type || undefined, slotLabel: f.name.replace(/\.[^/.]+$/, "") } });
      }
      toast.success("Uploaded");
      onChanged();
    } finally { setBusy(false); }
  }

  return (
    <section id={id} className="rounded-2xl border border-border bg-surface p-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-display text-lg font-semibold">{icon}{title}</div>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm hover:border-brand/50">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload
          <input type="file" multiple accept={accept} className="hidden" disabled={busy}
            onChange={(e) => { onFiles(e.target.files); e.currentTarget.value = ""; }} />
        </label>
      </header>

      {extra && <div className="mt-4">{extra}</div>}

      {refs.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
          No {kind === "voice_ref" ? "clips" : "images"} yet.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {refs.map((r) => <RefCard key={r.id} r={r} onChanged={onChanged} />)}
        </div>
      )}
    </section>
  );
}

function RefCard({ r, onChanged }: {
  r: { id: string; kind?: Kind; storage_path: string; mime_type: string | null; slot_label: string | null; notes: string | null };
  onChanged: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [slot, setSlot] = useState(r.slot_label ?? "");
  const [notes, setNotes] = useState(r.notes ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const sign = useServerFn(getTwinRefSignedUrl);
  const upd = useServerFn(updateTwinReference);
  const rem = useServerFn(removeTwinReference);
  const isAudio = (r.mime_type ?? "").startsWith("audio/");

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const { url } = await sign({ data: { storagePath: r.storage_path } }); if (alive) setUrl(url); }
      catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [r.storage_path, sign]);

  async function save() {
    try { await upd({ data: { id: r.id, slotLabel: slot, notes } }); toast.success("Saved"); onChanged(); }
    catch (err: any) { toast.error(err?.message ?? "Save failed"); }
  }
  async function remove() {
    try { await rem({ data: { id: r.id } }); toast.success("Removed"); onChanged(); }
    catch (err: any) { toast.error(err?.message ?? "Remove failed"); }
  }

  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <div className="mb-2 aspect-square overflow-hidden rounded-lg bg-surface-elevated/60">
        {isAudio ? (
          url ? <audio controls src={url} className="mt-24 w-full" /> :
            <div className="grid h-full place-items-center text-muted-foreground"><Mic className="size-6" /></div>
        ) : url ? (
          <img src={url} alt={r.slot_label ?? ""} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground"><ImageIcon className="size-6" /></div>
        )}
      </div>
      <Input value={slot} onChange={(e) => setSlot(e.target.value)} placeholder="Label (e.g. front, 3/4, script A)" className="h-8 text-xs" />
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (script, direction)" className="mt-2 min-h-[60px] text-xs" />
      <div className="mt-2 flex justify-between">
        <Button size="sm" variant="ghost" onClick={save}>Save</Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove reference?</AlertDialogTitle>
            <AlertDialogDescription>The file will be deleted from storage. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------- Style ---------- */

function StyleSection({ creator, onSaved }: { creator: any; onSaved: () => void }) {
  const [notes, setNotes] = useState<Record<string, string>>(() => ({ ...(creator.style_notes ?? {}) }));
  const [saving, setSaving] = useState(false);
  const save = useServerFn(upsertStyleNotes);

  async function onSave() {
    setSaving(true);
    try { await save({ data: { notes } }); toast.success("Style saved"); onSaved(); }
    catch (err: any) { toast.error(err?.message ?? "Save failed"); }
    finally { setSaving(false); }
  }

  return (
    <section id="style" className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 font-display text-lg font-semibold">
        <Palette className="size-4" /> Visual style descriptors
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Short phrases that guide every synthetic image or video.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {STYLE_FIELDS.map((f) => (
          <div key={f.key}>
            <Label className="text-xs">{f.label}</Label>
            <Input value={notes[f.key] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [f.key]: e.target.value }))} placeholder={f.placeholder} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={onSave} disabled={saving}>{saving && <Loader2 className="mr-2 size-3.5 animate-spin" />}Save style</Button>
      </div>
    </section>
  );
}

/* ---------- Consent ---------- */

function ConsentSection({ data, onChanged }: { data: any; onChanged: () => void }) {
  const consent = data.consent;
  const [revokeOpen, setRevokeOpen] = useState(false);
  const upsert = useServerFn(upsertTwinConsent);
  const revoke = useServerFn(revokeTwinConsent);

  async function toggle(key: "likenessOk" | "voiceOk" | "imageOk" | "videoOk", value: boolean) {
    try { await upsert({ data: { [key]: value } as any }); onChanged(); }
    catch (err: any) { toast.error(err?.message ?? "Update failed"); }
  }

  const toggles: Array<{ key: any; label: string; on: boolean }> = [
    { key: "likenessOk", label: "Likeness (face & body)", on: !!consent?.likeness_ok },
    { key: "voiceOk",    label: "Voice cloning",          on: !!consent?.voice_ok },
    { key: "imageOk",    label: "AI image generation",    on: !!consent?.image_ok },
    { key: "videoOk",    label: "AI video generation",    on: !!consent?.video_ok },
  ];

  return (
    <section id="consent" className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-display text-lg font-semibold">
            <ShieldCheck className="size-4" /> Digital twin consent
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {consent?.signed_at ? <>Signed {new Date(consent.signed_at).toLocaleDateString()}.</> : <>Not yet signed. Complete onboarding to sign the base consent.</>}
            {consent?.revoked_at && <span className="ml-2 text-rose-300">Revoked {new Date(consent.revoked_at).toLocaleDateString()}.</span>}
          </p>
        </div>
        {consent && !consent.revoked_at && (
          <Button variant="outline" size="sm" className="border-rose-400/40 text-rose-300 hover:bg-rose-400/10" onClick={() => setRevokeOpen(true)}>
            <ShieldAlert className="mr-2 size-4" /> Revoke consent
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {toggles.map((t) => (
          <div key={t.key} className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2">
            <div className="text-sm">{t.label}</div>
            <Switch checked={t.on} disabled={!!consent?.revoked_at} onCheckedChange={(v) => toggle(t.key, v)} />
          </div>
        ))}
      </div>

      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke digital twin consent?</AlertDialogTitle>
            <AlertDialogDescription>All AI generation from your twin will stop. You can re-sign later from onboarding.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep active</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { try { await revoke(); toast.success("Consent revoked"); onChanged(); } catch (err: any) { toast.error(err?.message ?? "Failed"); } }}>Revoke</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/* ---------- Allowed uses ---------- */

function AllowedUsesSection({ data, onChanged }: { data: any; onChanged: () => void }) {
  const allowed: Record<string, boolean> = data.consent?.allowed_uses ?? {};
  const [local, setLocal] = useState<Record<string, boolean>>(allowed);
  const [saving, setSaving] = useState(false);
  const upsert = useServerFn(upsertTwinConsent);

  useEffect(() => { setLocal(data.consent?.allowed_uses ?? {}); }, [data.consent]);

  async function save() {
    setSaving(true);
    try { await upsert({ data: { allowedUses: local } }); toast.success("Allowed uses saved"); onChanged(); }
    catch (err: any) { toast.error(err?.message ?? "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <section id="allowed" className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 font-display text-lg font-semibold">
        <ShieldCheck className="size-4" /> Allowed uses
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Only checked items may be produced from your twin.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {ALLOWED_PRESETS.map((p) => (
          <label key={p.key} className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
            <div>
              <div className="text-sm font-medium">{p.label}</div>
              <div className="text-xs text-muted-foreground">{p.hint}</div>
            </div>
            <Switch checked={!!local[p.key]} onCheckedChange={(v) => setLocal((s) => ({ ...s, [p.key]: v }))} />
          </label>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 size-3.5 animate-spin" />}Save allowed uses</Button>
      </div>
    </section>
  );
}

/* ---------- Forbidden uses ---------- */

function ForbiddenUsesSection({ data, onChanged }: { data: any; onChanged: () => void }) {
  const initial = data.consent?.forbidden_uses ?? {};
  const [presets, setPresets] = useState<Record<string, boolean>>(initial.presets ?? {});
  const [custom, setCustom] = useState<string[]>(initial.custom ?? []);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const upsert = useServerFn(upsertTwinConsent);

  useEffect(() => {
    const f = data.consent?.forbidden_uses ?? {};
    setPresets(f.presets ?? {}); setCustom(f.custom ?? []);
  }, [data.consent]);

  async function save() {
    setSaving(true);
    try { await upsert({ data: { forbiddenUses: { presets, custom } } }); toast.success("Forbidden uses saved"); onChanged(); }
    catch (err: any) { toast.error(err?.message ?? "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <section id="forbidden" className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 font-display text-lg font-semibold">
        <ShieldAlert className="size-4" /> Forbidden uses
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Hard rules — Twinly will refuse to generate content that violates these.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {FORBIDDEN_PRESETS.map((p) => (
          <label key={p.key} className="flex cursor-pointer items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm">
            {p.label}
            <Switch checked={!!presets[p.key]} onCheckedChange={(v) => setPresets((s) => ({ ...s, [p.key]: v }))} />
          </label>
        ))}
      </div>

      <div className="mt-4">
        <Label className="text-xs">Custom rules</Label>
        <div className="mt-1 flex gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. No competitor brand mentions"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (draft.trim()) { setCustom((c) => [...c, draft.trim()]); setDraft(""); } } }} />
          <Button variant="outline" size="sm" onClick={() => { if (draft.trim()) { setCustom((c) => [...c, draft.trim()]); setDraft(""); } }}>Add</Button>
        </div>
        {custom.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {custom.map((c, i) => (
              <Badge key={i} variant="outline" className="gap-1">
                {c}
                <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setCustom((cur) => cur.filter((_, j) => j !== i))}>
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 size-3.5 animate-spin" />}Save forbidden uses</Button>
      </div>
    </section>
  );
}