import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/twinly/AppShell";
import { PersonaBadge } from "@/components/twinly/PersonaBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/session";
import { listMyPersonas } from "@/lib/onboarding.functions";
import {
  createPersona, updatePersona, setPersonaVisibility, deletePersona, reorderPersonas,
} from "@/lib/persona-studio.functions";
import {
  listPacks, attachPackToPersona, detachPackFromPersona,
} from "@/lib/content-packs.functions";

export const Route = createFileRoute("/studio/personas")({ component: PersonaStudioPage });

type Persona = Awaited<ReturnType<typeof listMyPersonas>>["personas"][number];
type Visibility = Persona["visibility"];

const VISIBILITY_LABEL: Record<Visibility, string> = {
  draft: "Draft",
  public: "Public",
  subscribers: "Subscribers",
  vip: "VIP",
  hidden: "Hidden",
};

function PersonaStudioPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [creator, setCreator] = useState<{ handle: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Persona | null>(null);
  const [deleting, setDeleting] = useState<Persona | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useServerFn(listMyPersonas);
  const setVis = useServerFn(setPersonaVisibility);
  const reorder = useServerFn(reorderPersonas);
  const remove = useServerFn(deletePersona);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const refresh = useCallback(async () => {
    const res = await load();
    if (!res.creator) {
      navigate({ to: "/onboarding" });
      return;
    }
    setCreator({ handle: res.creator.handle });
    setPersonas(res.personas);
    setReady(true);
  }, [load, navigate]);

  useEffect(() => { if (user) refresh().catch(() => setReady(true)); }, [user, refresh]);

  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= personas.length) return;
    const next = personas.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setPersonas(next); // optimistic
    try {
      await reorder({
        data: { order: next.map((p, i) => ({ id: p.id, sortOrder: i })) },
      });
    } catch (e: any) {
      toast.error(e.message ?? "Reorder failed");
      refresh();
    }
  }

  async function changeVisibility(persona: Persona, visibility: Visibility) {
    setPersonas((s) => s.map((p) => (p.id === persona.id ? { ...p, visibility } : p)));
    try {
      await setVis({ data: { personaId: persona.id, visibility } });
      toast.success(`Set to ${VISIBILITY_LABEL[visibility].toLowerCase()}`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not update visibility");
      refresh();
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await remove({ data: { personaId: deleting.id } });
      toast.success("Persona deleted");
      setDeleting(null);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete persona");
    } finally { setBusy(false); }
  }

  if (loading || !ready) {
    return <AppShell><div className="text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Persona studio</div>
            <h1 className="mt-1 font-display text-3xl font-bold">Your personas</h1>
            {creator && (
              <p className="mt-1 text-sm text-muted-foreground">
                Public page:{" "}
                <Link to="/creators/$handle" params={{ handle: creator.handle }} className="text-brand-glow hover:underline">
                  /creators/{creator.handle}
                </Link>
              </p>
            )}
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 size-4" /> New persona
          </Button>
        </div>

        <div className="mt-6 space-y-3">
          {personas.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
              <p className="text-sm text-muted-foreground">No personas yet.</p>
            </div>
          )}
          {personas.map((p, i) => (
            <div key={p.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-1 pt-1">
                  <button
                    className="rounded-md border border-border p-1 text-muted-foreground hover:bg-surface-elevated disabled:opacity-40"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label="Move up"
                  ><ArrowUp className="size-3.5" /></button>
                  <button
                    className="rounded-md border border-border p-1 text-muted-foreground hover:bg-surface-elevated disabled:opacity-40"
                    disabled={i === personas.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="Move down"
                  ><ArrowDown className="size-3.5" /></button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg font-semibold">{p.display_name}</span>
                    <PersonaBadge kind={p.kind} />
                    {p.visibility !== "public" && (
                      <Badge variant="outline" className="text-xs">{VISIBILITY_LABEL[p.visibility]}</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{p.disclosure_label}</p>
                  {p.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Select
                      value={p.visibility}
                      onValueChange={(v) => changeVisibility(p, v as Visibility)}
                    >
                      <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((v) => (
                          <SelectItem key={v} value={v}>{VISIBILITY_LABEL[v]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                      <Pencil className="mr-1 size-3.5" /> Edit
                    </Button>
                    {p.visibility === "public" ? (
                      <Button size="sm" variant="ghost" onClick={() => changeVisibility(p, "hidden")}>
                        <EyeOff className="mr-1 size-3.5" /> Hide
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => changeVisibility(p, "public")}>
                        <Eye className="mr-1 size-3.5" /> Publish
                      </Button>
                    )}
                    {!(p as any).is_default_seed && (
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                        onClick={() => setDeleting(p)}>
                        <Trash2 className="mr-1 size-3.5" /> Delete
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <CreatePersonaDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => { setCreateOpen(false); refresh(); }}
      />
      <EditPersonaDialog
        persona={editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        onSaved={() => { setEditing(null); refresh(); }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this persona?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleting?.display_name}</strong> and its chat history is retained for audit. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={confirmDelete}>
              {busy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function CreatePersonaDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const create = useServerFn(createPersona);
  const [displayName, setName] = useState("");
  const [kind, setKind] = useState<"real_me" | "ai">("ai");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isExplicit, setExplicit] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(""); setKind("ai"); setDescription(""); setSystemPrompt(""); setExplicit(false);
    }
  }, [open]);

  async function submit() {
    if (displayName.trim().length < 2) return toast.error("Name must be at least 2 characters.");
    setBusy(true);
    try {
      await create({ data: { displayName, kind, description, systemPrompt, isExplicit } });
      toast.success("Persona created — it's in draft.");
      onCreated();
    } catch (e: any) {
      toast.error(e.message ?? "Could not create persona");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New persona</DialogTitle>
          <DialogDescription>Starts as a draft — publish it when it's ready.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input className="mt-1.5" value={displayName} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </div>
          <div>
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as any)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ai">AI persona</SelectItem>
                <SelectItem value="real_me">Real Me (human-led)</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {kind === "ai"
                ? "Fan-facing AI disclosure is required and set automatically."
                : "Human replies only. AI Gateway is not used."}
            </p>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea className="mt-1.5" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {kind === "ai" && (
            <>
              <div>
                <Label>System prompt</Label>
                <Textarea className="mt-1.5" rows={4} maxLength={4000} value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Define voice, tone, and hard limits." />
              </div>
              <label className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <div className="text-sm font-medium">Explicit content</div>
                  <div className="text-xs text-muted-foreground">Requires fan 18+ acknowledgement.</div>
                </div>
                <Switch checked={isExplicit} onCheckedChange={setExplicit} />
              </label>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create draft"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPersonaDialog({
  persona, onOpenChange, onSaved,
}: { persona: Persona | null; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const update = useServerFn(updatePersona);
  const [displayName, setName] = useState("");
  const [description, setDescription] = useState("");
  const [disclosureLabel, setDisclosure] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isExplicit, setExplicit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toneExamples, setToneExamples] = useState("");
  const [dos, setDos] = useState("");
  const [donts, setDonts] = useState("");
  const [samplePhrasings, setSamplePhrasings] = useState("");
  const [voiceRefUrl, setVoiceRefUrl] = useState("");
  const [tab, setTab] = useState<"basics" | "training" | "packs">("basics");

  // Packs state
  const loadPacks = useServerFn(listPacks);
  const attachPack = useServerFn(attachPackToPersona);
  const detachPack = useServerFn(detachPackFromPersona);
  const [packs, setPacks] = useState<any[]>([]);
  const [attachRows, setAttachRows] = useState<Array<{ pack_id: string; persona_id: string; permission_type: string }>>([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [packBusy, setPackBusy] = useState<string | null>(null);

  const refreshPacks = useCallback(async () => {
    setPacksLoading(true);
    try {
      const res = await loadPacks();
      setPacks(res.packs ?? []);
      setAttachRows(res.attach ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Could not load packs");
    } finally {
      setPacksLoading(false);
    }
  }, [loadPacks]);

  useEffect(() => {
    if (persona && tab === "packs") refreshPacks();
  }, [persona, tab, refreshPacks]);

  useEffect(() => {
    if (persona) {
      setName(persona.display_name);
      setDescription(persona.description ?? "");
      setDisclosure(persona.disclosure_label);
      setSystemPrompt((persona as any).system_prompt ?? "");
      setExplicit(!!(persona as any).is_explicit);
      const tn = ((persona as any).training_notes ?? {}) as Record<string, string>;
      setToneExamples(tn.tone_examples ?? "");
      setDos(tn.dos ?? "");
      setDonts(tn.donts ?? "");
      setSamplePhrasings(tn.sample_phrasings ?? "");
      setVoiceRefUrl(tn.voice_ref_url ?? "");
      setTab("basics");
    }
  }, [persona]);

  async function togglePack(packId: string, attached: boolean, permission: string) {
    if (!persona) return;
    setPackBusy(packId);
    try {
      if (attached) {
        await detachPack({ data: { packId, personaId: persona.id } });
        setAttachRows((s) => s.filter((r) => !(r.pack_id === packId && r.persona_id === persona.id)));
        toast.success("Pack detached");
      } else {
        await attachPack({ data: { packId, personaId: persona.id, permissionType: permission as any } });
        setAttachRows((s) => [...s, { pack_id: packId, persona_id: persona.id, permission_type: permission }]);
        toast.success("Pack attached");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Could not update pack");
    } finally {
      setPackBusy(null);
    }
  }

  async function changePermission(packId: string, permission: string) {
    if (!persona) return;
    setPackBusy(packId);
    try {
      await attachPack({ data: { packId, personaId: persona.id, permissionType: permission as any } });
      setAttachRows((s) => s.map((r) =>
        r.pack_id === packId && r.persona_id === persona.id ? { ...r, permission_type: permission } : r
      ));
      toast.success("Access updated");
    } catch (e: any) {
      toast.error(e.message ?? "Could not update access");
    } finally {
      setPackBusy(null);
    }
  }

  async function submit() {
    if (!persona) return;
    setBusy(true);
    try {
      await update({ data: {
        personaId: persona.id,
        displayName, description, disclosureLabel,
        systemPrompt: persona.kind === "ai" ? systemPrompt : undefined,
        isExplicit: persona.kind === "ai" ? isExplicit : undefined,
        trainingNotes: {
          tone_examples: toneExamples,
          dos, donts,
          sample_phrasings: samplePhrasings,
          voice_ref_url: voiceRefUrl,
        },
      }});
      toast.success("Persona saved");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save persona");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={!!persona} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit persona</DialogTitle>
          <DialogDescription>
            {persona?.kind === "ai" ? "AI persona — disclosure is required." : "Real Me — human-led replies."}
          </DialogDescription>
        </DialogHeader>
        <div className="mb-3 flex gap-1 border-b border-border">
          {(["basics", "training", "packs"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={"px-3 py-1.5 text-xs font-semibold uppercase tracking-widest " + (tab === t ? "border-b-2 border-brand text-foreground" : "text-muted-foreground")}
            >{t === "basics" ? "Basics" : t === "training" ? "Training" : "Packs"}</button>
          ))}
        </div>
        {tab === "basics" && (
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input className="mt-1.5" value={displayName} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea className="mt-1.5" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label>Disclosure label</Label>
            <Input className="mt-1.5" value={disclosureLabel} onChange={(e) => setDisclosure(e.target.value)} maxLength={120} />
            <p className="mt-1 text-xs text-muted-foreground">Shown to every fan before they interact.</p>
          </div>
          {persona?.kind === "ai" && (
            <>
              <div>
                <Label>System prompt</Label>
                <Textarea className="mt-1.5" rows={5} maxLength={4000} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
              </div>
              <label className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <div className="text-sm font-medium">Explicit content</div>
                  <div className="text-xs text-muted-foreground">Requires fan 18+ acknowledgement.</div>
                </div>
                <Switch checked={isExplicit} onCheckedChange={setExplicit} />
              </label>
            </>
          )}
        </div>
        )}
        {tab === "training" && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            These inputs shape how the persona sounds. They're merged into the AI system prompt at chat time and are only visible to you.
          </p>
          <div>
            <Label>Tone & voice examples</Label>
            <Textarea className="mt-1.5" rows={3} maxLength={4000} value={toneExamples} onChange={(e) => setToneExamples(e.target.value)}
              placeholder="Playful, teasing, uses emojis sparingly. Never sarcastic." />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Do's</Label>
              <Textarea className="mt-1.5" rows={4} maxLength={4000} value={dos} onChange={(e) => setDos(e.target.value)}
                placeholder="- Address fans by name&#10;- Offer VIP upsells naturally" />
            </div>
            <div>
              <Label>Don'ts</Label>
              <Textarea className="mt-1.5" rows={4} maxLength={4000} value={donts} onChange={(e) => setDonts(e.target.value)}
                placeholder="- Never claim to be human&#10;- No political topics" />
            </div>
          </div>
          <div>
            <Label>Sample phrasings</Label>
            <Textarea className="mt-1.5" rows={3} maxLength={4000} value={samplePhrasings} onChange={(e) => setSamplePhrasings(e.target.value)}
              placeholder={"“hey babe 💜 what are we getting into tonight?”"} />
          </div>
          <div>
            <Label>Voice reference URL (optional)</Label>
            <Input className="mt-1.5" value={voiceRefUrl} onChange={(e) => setVoiceRefUrl(e.target.value)}
              placeholder="https://…/voice-sample.mp3" />
            <p className="mt-1 text-xs text-muted-foreground">Placeholder for future voice-clone training input.</p>
          </div>
        </div>
        )}
        {tab === "packs" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Attach approved content packs to this persona. Choose how fans access each pack: included with a subscription, pay-per-view, or restricted (locked preview).
          </p>
          {packsLoading && <div className="text-sm text-muted-foreground">Loading packs…</div>}
          {!packsLoading && packs.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No content packs yet.{" "}
              <Link to="/studio/packs" className="text-brand-glow hover:underline">Create a pack</Link>
            </div>
          )}
          {!packsLoading && packs.length > 0 && (
            <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
              {packs.map((p) => {
                const row = attachRows.find((r) => r.pack_id === p.id && r.persona_id === persona!.id);
                const attached = !!row;
                const permission = row?.permission_type ?? "included";
                const canAttach = p.status === "approved";
                return (
                  <div key={p.id} className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium">{p.name}</span>
                          <Badge variant="outline" className="text-[10px] uppercase">{p.pack_type}</Badge>
                          <Badge
                            variant={p.status === "approved" ? "default" : "outline"}
                            className="text-[10px] uppercase"
                          >{p.status.replace("_", " ")}</Badge>
                        </div>
                        {p.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                        )}
                        {!canAttach && !attached && (
                          <p className="mt-1 text-[11px] text-muted-foreground">Only approved packs can be attached.</p>
                        )}
                      </div>
                      <Switch
                        checked={attached}
                        disabled={packBusy === p.id || (!canAttach && !attached)}
                        onCheckedChange={() => togglePack(p.id, attached, permission)}
                      />
                    </div>
                    {attached && (
                      <div className="mt-3 flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Access</Label>
                        <Select
                          value={permission}
                          onValueChange={(v) => changePermission(p.id, v)}
                          disabled={packBusy === p.id}
                        >
                          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="included">Included</SelectItem>
                            <SelectItem value="ppv">Pay-per-view</SelectItem>
                            <SelectItem value="restricted">Restricted</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}