import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wand2, Sparkles, ImageIcon, Mic, Video, Megaphone, Send, CheckCircle2, XCircle, Package, User, Loader2, ShieldCheck, ListChecks, PlayCircle } from "lucide-react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/lib/session";
import {
  listCreateTargets, listGenerationRequests, createGenerationRequest,
  updateRequestStatus, publishRequestPlaceholders,
} from "@/lib/generate-requests.functions";

export const Route = createFileRoute("/studio/create")({
  component: CreatePage,
  head: () => ({
    meta: [
      { title: "Twinly Create — AI content workflow" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Persona = { id: string; display_name: string; slug: string; kind: string };
type Pack = { id: string; name: string; slug: string; pack_type: string; status: string };
type ReqRow = {
  id: string; persona_id: string | null; pack_id: string | null;
  output_type: string; style_preset: string | null; prompt_notes: string;
  quantity: number; status: string; disclosure_label: string | null;
  produced_asset_ids: string[]; reviewer_note: string | null;
  submitted_at: string | null; reviewed_at: string | null; created_at: string;
  personas?: { display_name: string; slug: string } | null;
  content_packs?: { name: string; slug: string } | null;
};

const OUTPUT_META: Record<string, { label: string; icon: any; hint: string }> = {
  image:        { label: "AI image",        icon: ImageIcon, hint: "Static image · portrait/scene" },
  audio:        { label: "AI voice note",   icon: Mic,       hint: "Short spoken clip · 5–30 s" },
  video:        { label: "AI video clip",   icon: Video,     hint: "Short generated scene" },
  talking_head: { label: "Talking head",    icon: Video,     hint: "Lip-synced twin clip" },
  promo_banner: { label: "Promo banner",    icon: Megaphone, hint: "Marketing / cover art" },
};

const STATUS_STYLES: Record<string, string> = {
  draft:        "border-border bg-surface text-muted-foreground",
  queued:       "border-sky-400/30 bg-sky-400/10 text-sky-300",
  generating:   "border-violet-400/30 bg-violet-400/10 text-violet-300",
  generated:    "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
  needs_review: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  approved:     "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  rejected:     "border-red-400/30 bg-red-400/10 text-red-300",
  published:    "border-brand-glow/40 bg-brand-glow/10 text-brand-glow",
  failed:       "border-red-500/40 bg-red-500/10 text-red-400",
};

function CreatePage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"new" | "queue">("new");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [requests, setRequests] = useState<ReqRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // form state
  const [personaId, setPersonaId] = useState<string>("");
  const [packId, setPackId] = useState<string>("");
  const [outputType, setOutputType] = useState<keyof typeof OUTPUT_META>("image");
  const [stylePreset, setStylePreset] = useState<string>("cinematic");
  const [promptNotes, setPromptNotes] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(4);

  const loadTargets = useServerFn(listCreateTargets);
  const loadRequests = useServerFn(listGenerationRequests);
  const create = useServerFn(createGenerationRequest);
  const update = useServerFn(updateRequestStatus);
  const publish = useServerFn(publishRequestPlaceholders);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const refresh = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([loadTargets({ data: {} }), loadRequests({ data: {} })]);
      setPersonas(t.personas as Persona[]);
      setPacks(t.packs as Pack[]);
      setRequests(r.requests as ReqRow[]);
    } catch (e: any) { toast.error(e?.message ?? "Failed to load"); }
  }, [loadTargets, loadRequests]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  const disclosureLabel = useMemo(() => {
    const p = personas.find((x) => x.id === personaId);
    if (p) return `Generated with AI — ${p.display_name}`;
    return "Generated with AI";
  }, [personaId, personas]);

  async function submitNew(saveDraft: boolean) {
    if (!promptNotes.trim()) { toast.error("Add prompt notes."); return; }
    setBusy("new");
    try {
      await create({ data: {
        personaId: personaId || undefined,
        packId: packId || undefined,
        outputType: outputType as any,
        stylePreset,
        promptNotes,
        quantity,
        disclosureLabel,
        submit: !saveDraft,
      } });
      toast.success(saveDraft ? "Draft saved" : "Request submitted");
      setPromptNotes("");
      await refresh();
      setTab("queue");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  }

  async function act(id: string, action: Parameters<typeof update>[0]["data"]["action"], note?: string) {
    setBusy(id);
    try { await update({ data: { id, action, note } }); await refresh(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  }

  async function doPublish(id: string) {
    setBusy(id);
    try {
      const res = await publish({ data: { id } });
      toast.success(`Published ${res.count} draft asset${res.count === 1 ? "" : "s"} to your vault`);
      await refresh();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  }

  const approvedPacks = packs.filter((p) => p.status === "approved");

  return (
    <AppShell>
      <div className="mb-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <Sparkles className="size-3.5" /> Twinly Create
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold">AI content workflow</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Draft synthetic image, audio, and video jobs for future generation. Placeholder pipeline — real providers connect later. Nothing publishes without your approval.
        </p>
      </div>

      <div className="mb-4 flex gap-2 rounded-full border border-border bg-surface p-1">
        <TabBtn active={tab === "new"} onClick={() => setTab("new")} icon={<Wand2 className="size-4" />} label="New request" />
        <TabBtn active={tab === "queue"} onClick={() => setTab("queue")} icon={<ListChecks className="size-4" />} label={`Review queue (${requests.length})`} />
      </div>

      {tab === "new" && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-border bg-surface p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Target</div>
            <div className="space-y-2">
              <Label className="text-xs">Persona</Label>
              <Select value={personaId || "__none"} onValueChange={(v) => setPersonaId(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="No persona (creator library)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No persona (creator library)</SelectItem>
                  {personas.map((p) => <SelectItem key={p.id} value={p.id}>{p.display_name} · {p.kind}</SelectItem>)}
                </SelectContent>
              </Select>
              {personas.length === 0 && <p className="text-[11px] text-muted-foreground">No personas yet — <Link to="/studio/personas" className="text-brand-glow underline">create one</Link>.</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Content pack</Label>
              <Select value={packId || "__none"} onValueChange={(v) => setPackId(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="No pack" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No pack</SelectItem>
                  {approvedPacks.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.pack_type}</SelectItem>)}
                </SelectContent>
              </Select>
              {approvedPacks.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Only approved packs can receive assets. <Link to="/studio/packs" className="text-brand-glow underline">Manage packs</Link>.</p>
              )}
            </div>
            <div className="rounded-lg border border-border/60 bg-background/40 p-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="mr-1 inline size-3.5 text-brand-glow" />
              Disclosure will be shown to fans: <span className="font-medium text-foreground">{disclosureLabel}</span>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Output</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 md:grid-cols-2 lg:grid-cols-5">
              {(Object.keys(OUTPUT_META) as Array<keyof typeof OUTPUT_META>).map((k) => {
                const M = OUTPUT_META[k];
                const on = outputType === k;
                return (
                  <button key={k} type="button" onClick={() => setOutputType(k)}
                    className={"flex flex-col items-start gap-1 rounded-xl border p-2 text-left text-xs transition " + (on ? "border-brand-glow bg-brand-glow/10 text-foreground" : "border-border bg-background/40 text-muted-foreground hover:text-foreground")}>
                    <M.icon className="size-4" />
                    <span className="font-semibold">{M.label}</span>
                    <span className="text-[10px] opacity-70">{M.hint}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Style preset</Label>
                <Select value={stylePreset} onValueChange={setStylePreset}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["cinematic","editorial","soft-glow","neon","film-grain","studio-lit","dreamy","natural"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantity</Label>
                <Input type="number" min={1} max={12} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Prompt notes</Label>
              <Textarea rows={4} maxLength={2000} value={promptNotes} onChange={(e) => setPromptNotes(e.target.value)}
                placeholder="Describe scene, mood, wardrobe, lighting, forbidden elements…" />
              <p className="text-[10px] text-muted-foreground">{promptNotes.length}/2000</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" disabled={busy === "new"} onClick={() => submitNew(true)}>Save draft</Button>
              <Button disabled={busy === "new"} onClick={() => submitNew(false)}>
                {busy === "new" ? <Loader2 className="size-4 animate-spin" /> : <><Send className="mr-1 size-4" /> Submit</>}
              </Button>
            </div>
          </section>
        </div>
      )}

      {tab === "queue" && (
        <div className="space-y-2">
          {requests.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No generation requests yet. Create one from the <button className="text-brand-glow underline" onClick={() => setTab("new")}>New request</button> tab.
            </div>
          )}
          {requests.map((r) => {
            const M = OUTPUT_META[r.output_type] ?? OUTPUT_META.image;
            const canApprove = ["generated","needs_review","queued","generating"].includes(r.status);
            return (
              <article key={r.id} className="rounded-2xl border border-border bg-surface p-3">
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <M.icon className="size-4 text-brand-glow" />
                      <span className="font-semibold">{M.label}</span>
                      <span className="text-xs text-muted-foreground">× {r.quantity}</span>
                      <span className={"ml-1 rounded-full border px-2 py-0.5 text-[10px] uppercase " + (STATUS_STYLES[r.status] ?? STATUS_STYLES.draft)}>{r.status.replace("_"," ")}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {r.personas?.display_name && <span className="inline-flex items-center gap-1"><User className="size-3" /> {r.personas.display_name}</span>}
                      {r.content_packs?.name && <span className="inline-flex items-center gap-1"><Package className="size-3" /> {r.content_packs.name}</span>}
                      {r.style_preset && <span>· {r.style_preset}</span>}
                      <span>· {new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-foreground/80">{r.prompt_notes}</p>
                    {r.disclosure_label && (
                      <div className="mt-1 text-[10px] text-muted-foreground">Disclosure: <span className="text-foreground">{r.disclosure_label}</span></div>
                    )}
                    {r.reviewer_note && (
                      <div className="mt-1 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-[11px] text-muted-foreground">Reviewer note: {r.reviewer_note}</div>
                    )}
                    {r.status === "published" && r.produced_asset_ids.length > 0 && (
                      <div className="mt-1 text-[11px] text-brand-glow">Published {r.produced_asset_ids.length} draft asset{r.produced_asset_ids.length === 1 ? "" : "s"} to your vault.</div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {r.status === "draft" && (
                      <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r.id, "submit")}><Send className="mr-1 size-3.5" /> Submit</Button>
                    )}
                    {(r.status === "queued" || r.status === "generating") && (
                      <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r.id, "mark_generated")}><PlayCircle className="mr-1 size-3.5" /> Mark generated</Button>
                    )}
                    {canApprove && (
                      <>
                        <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r.id, "approve")}><CheckCircle2 className="mr-1 size-3.5" /> Approve</Button>
                        <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => {
                          const n = window.prompt("Rejection reason (optional):", "") ?? undefined; act(r.id, "reject", n);
                        }}><XCircle className="mr-1 size-3.5" /> Reject</Button>
                      </>
                    )}
                    {r.status === "approved" && (
                      <Button size="sm" disabled={busy === r.id} onClick={() => doPublish(r.id)}>
                        <Sparkles className="mr-1 size-3.5" /> Publish placeholders
                      </Button>
                    )}
                    {r.status !== "published" && r.status !== "rejected" && r.status !== "draft" && (
                      <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => act(r.id, "cancel", "Cancelled by creator")}>Cancel</Button>
                    )}
                  </div>
                </header>
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-border/60 bg-surface/60 p-3 text-[11px] text-muted-foreground">
        <div className="mb-1 font-semibold text-foreground">Internal labels used across the vault</div>
        <div className="flex flex-wrap gap-1">
          {["real_upload","ai_draft","approved_synthetic","restricted","do_not_use"].map((l) => (
            <Badge key={l} variant="outline" className="text-[10px] uppercase">{l.replace("_"," ")}</Badge>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={"flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition " + (active ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground")}>
      {icon} {label}
    </button>
  );
}
