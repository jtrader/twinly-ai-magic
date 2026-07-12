import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2, Camera, X as XIcon } from "lucide-react";
import { AppShell } from "@/components/twinly/AppShell";
import { PersonaBadge } from "@/components/twinly/PersonaBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAvatarUrl } from "@/lib/useAvatarUrl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
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
import { getTwinProfile } from "@/lib/twin.functions";
import {
  listSavedMessages, createSavedMessage, updateSavedMessage, deleteSavedMessage,
} from "@/lib/saved-messages.functions";
import {
  createPersonaInvite, listPersonaInvites, revokePersonaInvite,
} from "@/lib/persona-invites.functions";
import { matchesRealName } from "@/lib/persona-name-privacy";
import { getPersonaVisibilityPolicy, setPersonaDefaultVisibility } from "@/lib/feed-visibility.functions";
import type { FeedVisibilityTier } from "@/lib/feed-visibility-access.server";
import { nextFeedTierForToggle } from "@/lib/feed-visibility-tier-toggle";
import { lookupVeniceCharacter } from "@/lib/venice-character.functions";

export const Route = createFileRoute("/studio/personas")({ component: PersonaStudioPage });

function PersonaCardAvatar({ path, name }: { path: string | null; name: string }) {
  const src = useAvatarUrl(path);
  return (
    <div className="size-12 shrink-0 overflow-hidden rounded-full border border-border bg-surface-elevated">
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-sm font-semibold text-muted-foreground">
          {(name || "?").slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}

type Persona = Awaited<ReturnType<typeof listMyPersonas>>["personas"][number];
type Visibility = Persona["visibility"];

const VISIBILITY_LABEL: Record<Visibility, string> = {
  draft: "Draft",
  public: "Public",
  subscribers: "Subscribers",
  vip: "VIP",
  hidden: "Hidden",
  invite_only: "Invite only",
};

// Per-persona content-category allow/disallow (see content_theme_overrides
// migration). Generalized from this platform's own category primitives, not
// pulled from the external Twinly Content service's real categories — that
// service was never actually connected in this environment.
const CONTENT_THEME_LABELS: Record<string, string> = {
  romantic_affection: "Romantic / affection",
  flirtation_teasing: "Flirtation / teasing",
  roleplay_fantasy: "Roleplay / fantasy",
  power_exchange: "Power exchange (D/s)",
  fetish_general: "Fetish / kink (general)",
  group_dynamics: "Group dynamics",
  exhibitionism_voyeurism: "Exhibitionism / voyeurism",
  sensory_focus: "Sensory focus (ASMR etc.)",
};
const CONTENT_THEME_KEYS = Object.keys(CONTENT_THEME_LABELS);

function centsToDollarsInput(cents: number | null | undefined): string {
  return cents ? (cents / 100).toFixed(2) : "";
}

function dollarsInputToCents(input: string): number {
  const n = Number.parseFloat(input);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

/** Downscale an image to fit within maxSize (px, longest edge) and encode as JPEG. */
async function resizeImageToBlob(file: File, maxSize = 512, quality = 0.9): Promise<Blob> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Could not decode image"));
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(img, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Encode failed")), "image/jpeg", quality);
  });
}

function PersonaStudioPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [creator, setCreator] = useState<{ handle: string; verification_status?: string; fullName?: string | null; elevenlabsVoiceId?: string | null; hasRealMeProfile?: boolean } | null>(null);
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
    setCreator({
      handle: res.creator.handle,
      verification_status: (res.creator as any).verification_status,
      fullName: (res.creator as any).fullName ?? null,
      elevenlabsVoiceId: (res.creator as any).elevenlabs_voice_id ?? null,
      hasRealMeProfile: !!(res.creator as any).hasRealMeProfile,
    });
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
    const snapshot = personas;
    const target = deleting;
    // Optimistic remove — card disappears instantly.
    setPersonas((s) => s.filter((p) => p.id !== target.id));
    setBusy(true);
    try {
      await remove({ data: { personaId: target.id } });
      toast.success("Persona deleted");
      setDeleting(null);
    } catch (e: any) {
      setPersonas(snapshot); // rollback
      toast.error(e.message ?? "Could not delete persona");
    } finally { setBusy(false); }
  }

  const patchPersona = useCallback((id: string, patch: Partial<Persona>) => {
    setPersonas((s) => s.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

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

        {creator && creator.verification_status !== "verified" && (
          <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">
            Your identity isn't verified yet — you can build and edit personas, but publishing them (Public / Subscribers / VIP) is blocked until verification is complete.
          </div>
        )}

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
                <PersonaCardAvatar path={(p as any).avatar_url ?? null} name={p.display_name} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg font-semibold">{p.display_name}</span>
                    <PersonaBadge kind={p.kind} />
                    {p.visibility !== "public" && (
                      <Badge variant="outline" className="text-xs">{VISIBILITY_LABEL[p.visibility]}</Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {(p as any).price_cents ? `$${((p as any).price_cents / 100).toFixed(2)}` : "Included"}
                    </Badge>
                    {p.kind === "ai" && !((p as any).boundary_rules?.hard_limits ?? []).length && (
                      <Badge variant="outline" className="border-amber-400/40 text-[10px] text-amber-300">
                        No boundary rules — can't publish
                      </Badge>
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
        realFullName={creator?.fullName ?? null}
        elevenlabsVoiceId={creator?.elevenlabsVoiceId ?? null}
        hasRealMeProfile={creator?.hasRealMeProfile ?? false}
      />
      <EditPersonaDialog
        persona={editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        onSaved={() => { setEditing(null); refresh(); }}
        onLocalPatch={patchPersona}
        elevenlabsVoiceId={creator?.elevenlabsVoiceId ?? null}
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
  open, onOpenChange, onCreated, realFullName, elevenlabsVoiceId, hasRealMeProfile,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void; realFullName?: string | null; elevenlabsVoiceId?: string | null; hasRealMeProfile?: boolean }) {
  const create = useServerFn(createPersona);
  const [displayName, setName] = useState("");
  const [kind, setKind] = useState<"real_me" | "ai">("ai");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [explicitnessCeiling, setExplicitnessCeiling] = useState<"sfw" | "suggestive" | "explicit">("sfw");
  const [personality, setPersonality] = useState("");
  const [hardLimitsText, setHardLimitsText] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [veniceChatOptIn, setVeniceChatOptIn] = useState(false);
  const [contentThemeOverrides, setContentThemeOverrides] = useState<Record<string, boolean>>({});
  const [useClonedVoice, setUseClonedVoice] = useState(false);
  const [voiceStability, setVoiceStability] = useState(0.5);
  const [voiceSimilarityBoost, setVoiceSimilarityBoost] = useState(0.75);
  const [voiceStyle, setVoiceStyle] = useState(0);
  const [requireIdVerification, setRequireIdVerification] = useState(false);
  const [veniceCharacterSlug, setVeniceCharacterSlug] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(""); setKind("ai"); setDescription(""); setSystemPrompt(""); setExplicitnessCeiling("sfw");
      setPersonality(""); setHardLimitsText(""); setPriceDollars(""); setVeniceChatOptIn(false);
      setContentThemeOverrides({});
      setUseClonedVoice(false); setVoiceStability(0.5); setVoiceSimilarityBoost(0.75); setVoiceStyle(0);
      setRequireIdVerification(false);
      setVeniceCharacterSlug("");
    }
  }, [open]);

  async function submit() {
    if (displayName.trim().length < 2) return toast.error("Name must be at least 2 characters.");
    setBusy(true);
    try {
      const hardLimits = hardLimitsText.split("\n").map((s) => s.trim()).filter(Boolean);
      await create({
        data: {
          displayName, kind, description, systemPrompt,
          isExplicit: explicitnessCeiling !== "sfw",
          explicitnessCeiling: kind === "ai" ? explicitnessCeiling : undefined,
          priceCents: dollarsInputToCents(priceDollars),
          contentThemeOverrides: kind === "ai" ? contentThemeOverrides : undefined,
          toneRules: kind === "ai" ? { personality } : undefined,
          boundaryRules: kind === "ai" ? { hardLimits } : undefined,
          veniceChatOptIn: kind === "ai" ? veniceChatOptIn : undefined,
          useClonedVoice: kind === "ai" ? useClonedVoice : undefined,
          voiceStability: kind === "ai" && useClonedVoice ? voiceStability : undefined,
          voiceSimilarityBoost: kind === "ai" && useClonedVoice ? voiceSimilarityBoost : undefined,
          voiceStyle: kind === "ai" && useClonedVoice ? voiceStyle : undefined,
          requireIdVerification: kind === "ai" ? requireIdVerification : undefined,
          veniceCharacterSlug: kind === "ai" ? veniceCharacterSlug : undefined,
        },
      });
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
            <Label htmlFor="create-persona-name">Name</Label>
            <Input id="create-persona-name" className="mt-1.5" value={displayName} onChange={(e) => setName(e.target.value)} maxLength={60} />
            {matchesRealName(displayName, realFullName) && (
              <p className="mt-1.5 text-xs text-amber-500">
                This name may reduce your privacy separation between Real Me and this persona.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="create-persona-kind">Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as any)}>
              <SelectTrigger id="create-persona-kind" className="mt-1.5"><SelectValue /></SelectTrigger>
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
          {kind === "ai" && !hasRealMeProfile && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
              Complete your Real Me baseline first — AI personas can auto-generate their tone and opening lines from it.{" "}
              <Link to="/studio/real-me" className="underline">Set up Real Me →</Link>
            </div>
          )}
          <div>
            <Label htmlFor="create-persona-description">Description</Label>
            <Textarea id="create-persona-description" className="mt-1.5" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="create-persona-price">Price</Label>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input id="create-persona-price" className="pl-6" type="number" min="0" step="0.01" value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)} placeholder="0.00" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Shown to fans on this persona's card. Leave blank for "Included".</p>
          </div>
          {kind === "ai" && (
            <>
              <VeniceCharacterField
                idPrefix="create-persona"
                value={veniceCharacterSlug}
                onChange={setVeniceCharacterSlug}
              />
              <div>
                <Label htmlFor="create-persona-system-prompt">System prompt</Label>
                <Textarea id="create-persona-system-prompt" className="mt-1.5" rows={4} maxLength={4000} value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Define voice, tone, and hard limits." />
              </div>
              <div>
                <Label htmlFor="create-persona-personality">Personality / tone</Label>
                <Input id="create-persona-personality" className="mt-1.5" maxLength={300} value={personality} onChange={(e) => setPersonality(e.target.value)}
                  placeholder="e.g. Playful, teasing, warm — never sarcastic." />
              </div>
              <div>
                <Label htmlFor="create-persona-boundary">Boundary ceiling — one hard limit per line</Label>
                <Textarea id="create-persona-boundary" className="mt-1.5" rows={3} maxLength={6000} value={hardLimitsText}
                  onChange={(e) => setHardLimitsText(e.target.value)}
                  placeholder={"Never discuss meeting in person\nNever claim to be human"} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Platform-enforced and non-negotiable — the AI can't be talked past these no matter what a fan says. Required before this persona can be published.
                </p>
              </div>
              <div>
                <Label htmlFor="create-persona-explicitness">Explicitness level</Label>
                <Select value={explicitnessCeiling} onValueChange={(v) => setExplicitnessCeiling(v as any)}>
                  <SelectTrigger id="create-persona-explicitness" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sfw">SFW</SelectItem>
                    <SelectItem value="suggestive">Suggestive</SelectItem>
                    <SelectItem value="explicit">Explicit</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Enforced on every reply, independent of what a fan says. Above "SFW" requires fan 18+ acknowledgement. Can't exceed the platform-wide maximum.
                </p>
              </div>
              {explicitnessCeiling === "explicit" && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Venice AI (mandatory)</Badge>
                  <p className="text-xs text-muted-foreground">
                    Explicit-tier chat always runs on Venice AI — the default AI Gateway is moderated and can't produce this tier of content.
                  </p>
                </div>
              )}
              {explicitnessCeiling === "suggestive" && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label htmlFor="create-persona-venice-opt-in">Use Venice AI for chat</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Optional at this tier. Off uses the default AI Gateway.
                    </p>
                  </div>
                  <Switch id="create-persona-venice-opt-in" checked={veniceChatOptIn} onCheckedChange={setVeniceChatOptIn} />
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="create-persona-require-id-verification">Require ID verification</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fans must complete identity verification before chatting or viewing this persona's feed content — regardless of explicitness tier.
                  </p>
                </div>
                <Switch id="create-persona-require-id-verification" checked={requireIdVerification} onCheckedChange={setRequireIdVerification} />
              </div>
              <div>
                <Label>Content categories</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Off means this persona won't draw on that theme from the reference content library. Doesn't override your boundary ceiling above — this only narrows within it.
                </p>
                <div className="mt-2 space-y-1.5">
                  {CONTENT_THEME_KEYS.map((key) => {
                    const allowed = contentThemeOverrides[key] !== false;
                    return (
                      <label key={key} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 text-xs">
                        <span>{CONTENT_THEME_LABELS[key]}</span>
                        <Switch checked={allowed} onCheckedChange={(v) => setContentThemeOverrides((s) => ({ ...s, [key]: v }))} />
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Voice replies</Label>
                {elevenlabsVoiceId ? (
                  <div className="mt-1.5 space-y-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm">Use your cloned voice</div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Off falls back to a generic preset voice for this persona's spoken replies.
                        </p>
                      </div>
                      <Switch checked={useClonedVoice} onCheckedChange={setUseClonedVoice} />
                    </div>
                    {useClonedVoice && (
                      <div className="space-y-3 border-t pt-3">
                        <VoiceSettingSlider label="Closeness to your voice" value={voiceSimilarityBoost} onChange={setVoiceSimilarityBoost} />
                        <VoiceSettingSlider label="Stability" value={voiceStability} onChange={setVoiceStability} />
                        <VoiceSettingSlider label="Style exaggeration" value={voiceStyle} onChange={setVoiceStyle} />
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Record and clone your voice first from this persona's onboarding page ("Voice samples" step) to enable spoken replies that sound like you.
                  </p>
                )}
              </div>
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

function VoiceSettingSlider({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <Label className="text-xs">{label}</Label>
        <span className="tabular-nums text-muted-foreground">{value.toFixed(2)}</span>
      </div>
      <Slider
        className="mt-2"
        aria-label={label}
        value={[value]}
        min={0}
        max={1}
        step={0.05}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

function VeniceCharacterField({
  idPrefix, value, onChange,
}: { idPrefix: string; value: string; onChange: (v: string) => void }) {
  const lookup = useServerFn(lookupVeniceCharacter);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof lookupVeniceCharacter>> | null>(null);
  const [checkedSlug, setCheckedSlug] = useState<string | null>(null);

  async function check() {
    const slug = value.trim();
    if (!slug) return;
    setBusy(true);
    try {
      const r = await lookup({ data: { slug } });
      setResult(r);
      setCheckedSlug(slug);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not look up that character");
    } finally { setBusy(false); }
  }

  return (
    <div>
      <Label htmlFor={`${idPrefix}-venice-character`}>Quick-start from a Venice Character (optional)</Label>
      <p className="mt-1 text-xs text-muted-foreground">
        Already published a Character on Venice? Paste its slug (the "Public ID" shown on the character's page) to
        give this persona an established look and voice to draw from, instead of starting from a blank system
        prompt. Only takes effect on replies actually routed through Venice.
      </p>
      <div className="mt-1.5 flex gap-2">
        <Input
          id={`${idPrefix}-venice-character`}
          value={value}
          onChange={(e) => { onChange(e.target.value); setResult(null); }}
          placeholder="e.g. alan-watts"
          maxLength={120}
        />
        <Button type="button" variant="outline" size="sm" disabled={busy || !value.trim()} onClick={check}>
          {busy ? "Checking…" : "Preview"}
        </Button>
      </div>
      {result && checkedSlug === value.trim() && (
        result.found ? (
          <div className="mt-2 flex items-center gap-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-2.5">
            {result.character.photoUrl && (
              <img src={result.character.photoUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
            )}
            <div className="min-w-0 text-xs">
              <div className="font-semibold text-emerald-300">{result.character.name}</div>
              <div className="truncate text-muted-foreground">
                by {result.character.author || "unknown"}{result.character.adult ? " · 18+" : ""}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-rose-300">No published Venice Character found with that slug.</p>
        )
      )}
    </div>
  );
}

function EditPersonaDialog({
  persona, onOpenChange, onSaved, onLocalPatch, elevenlabsVoiceId,
}: {
  persona: Persona | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  onLocalPatch?: (id: string, patch: Partial<Persona>) => void;
  elevenlabsVoiceId?: string | null;
}) {
  const { user } = useSession();
  const update = useServerFn(updatePersona);
  const setVis = useServerFn(setPersonaVisibility);
  const getFeedPolicy = useServerFn(getPersonaVisibilityPolicy);
  const setFeedPolicy = useServerFn(setPersonaDefaultVisibility);
  const [feedTier, setFeedTier] = useState<FeedVisibilityTier>("subscribers_only");
  const [feedTierBusy, setFeedTierBusy] = useState(false);
  const [displayName, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>("draft");
  const [visBusy, setVisBusy] = useState(false);
  const avatarSrc = useAvatarUrl(avatarUrl);
  const [description, setDescription] = useState("");
  const [disclosureLabel, setDisclosure] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [explicitnessCeiling, setExplicitnessCeiling] = useState<"sfw" | "suggestive" | "explicit">("sfw");
  const [personality, setPersonality] = useState("");
  const [hardLimitsText, setHardLimitsText] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [veniceChatOptIn, setVeniceChatOptIn] = useState(false);
  const [contentThemeOverrides, setContentThemeOverrides] = useState<Record<string, boolean>>({});
  const [useClonedVoice, setUseClonedVoice] = useState(false);
  const [voiceStability, setVoiceStability] = useState(0.5);
  const [voiceSimilarityBoost, setVoiceSimilarityBoost] = useState(0.75);
  const [voiceStyle, setVoiceStyle] = useState(0);
  const [requireIdVerification, setRequireIdVerification] = useState(false);
  const [veniceCharacterSlug, setVeniceCharacterSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [toneExamples, setToneExamples] = useState("");
  const [dos, setDos] = useState("");
  const [donts, setDonts] = useState("");
  const [samplePhrasings, setSamplePhrasings] = useState("");
  const [voiceRefUrl, setVoiceRefUrl] = useState("");
  const [tab, setTab] = useState<"basics" | "training" | "packs" | "twin" | "invites" | "saved">("basics");
  const [savedItems, setSavedItems] = useState<any[] | null>(null);
  const [savedLoading, setSavedLoading] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newFewShot, setNewFewShot] = useState(false);
  const [savedBusy, setSavedBusy] = useState<string | null>(null);

  const refreshSaved = useCallback(async () => {
    if (!persona) return;
    setSavedLoading(true);
    try {
      const res = await listSavedMessages({ data: { personaId: persona.id } });
      setSavedItems(res.items ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Could not load saved replies");
    } finally { setSavedLoading(false); }
  }, [persona]);

  useEffect(() => {
    if (persona && tab === "saved" && savedItems === null) refreshSaved();
  }, [persona, tab, savedItems, refreshSaved]);

  // Invite-only access management
  const createInvite = useServerFn(createPersonaInvite);
  const listInvites = useServerFn(listPersonaInvites);
  const revokeInvite = useServerFn(revokePersonaInvite);
  const [invites, setInvites] = useState<any[] | null>(null);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);

  const refreshInvites = useCallback(async () => {
    if (!persona) return;
    setInvitesLoading(true);
    try {
      const res = await listInvites({ data: { personaId: persona.id } });
      setInvites(res.invites ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Could not load invites");
    } finally { setInvitesLoading(false); }
  }, [persona, listInvites]);

  useEffect(() => {
    if (persona && tab === "invites" && invites === null) refreshInvites();
  }, [persona, tab, invites, refreshInvites]);

  async function generateInvite() {
    if (!persona) return;
    setInviteBusy(true);
    try {
      await createInvite({ data: { personaId: persona.id } });
      setInvites(null);
      refreshInvites();
    } catch (e: any) {
      toast.error(e.message ?? "Could not create invite");
    } finally { setInviteBusy(false); }
  }

  async function handleRevokeInvite(inviteId: string) {
    setInviteBusy(true);
    try {
      await revokeInvite({ data: { inviteId } });
      setInvites((s) => s?.map((i) => i.id === inviteId ? { ...i, status: "revoked" } : i) ?? null);
    } catch (e: any) {
      toast.error(e.message ?? "Could not revoke invite");
    } finally { setInviteBusy(false); }
  }

  async function addSaved() {
    if (!persona || !newLabel.trim()) return;
    setSavedBusy("new");
    try {
      await createSavedMessage({ data: {
        personaId: persona.id,
        label: newLabel.trim(),
        body: newBody.trim() || undefined,
        useAsFewShot: newFewShot,
      }});
      setNewLabel(""); setNewBody(""); setNewFewShot(false);
      setSavedItems(null); refreshSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save reply");
    } finally { setSavedBusy(null); }
  }
  async function toggleFewShot(item: any, v: boolean) {
    setSavedBusy(item.id);
    try {
      await updateSavedMessage({ data: { id: item.id, useAsFewShot: v } });
      setSavedItems((s) => s?.map((r) => r.id === item.id ? { ...r, use_as_few_shot: v } : r) ?? null);
    } catch (e: any) { toast.error(e.message ?? "Update failed"); }
    finally { setSavedBusy(null); }
  }
  async function removeSaved(id: string) {
    setSavedBusy(id);
    try {
      await deleteSavedMessage({ data: { id } });
      setSavedItems((s) => s?.filter((r) => r.id !== id) ?? null);
    } catch (e: any) { toast.error(e.message ?? "Delete failed"); }
    finally { setSavedBusy(null); }
  }

  // Twin linking
  const [twinLinkMode, setTwinLinkMode] = useState<"all" | "selected" | "none">("all");
  const [linkedRefIds, setLinkedRefIds] = useState<string[]>([]);
  const [heygenAvatarId, setHeygenAvatarId] = useState("");
  const [heygenVoiceId, setHeygenVoiceId] = useState("");
  const [twinRefs, setTwinRefs] = useState<any[] | null>(null);
  const loadTwin = useServerFn(getTwinProfile);

  useEffect(() => {
    if (!persona || tab !== "twin" || twinRefs) return;
    (async () => {
      try { const r = await loadTwin(); setTwinRefs(r.refs as any[]); }
      catch (e: any) { toast.error(e?.message ?? "Failed to load twin refs"); }
    })();
  }, [persona, tab, twinRefs, loadTwin]);

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
      setExplicitnessCeiling(((persona as any).explicitness_ceiling as any) ?? "sfw");
      setPersonality((persona as any).tone_rules?.personality ?? "");
      setHardLimitsText((((persona as any).boundary_rules?.hard_limits ?? []) as string[]).join("\n"));
      setPriceDollars(centsToDollarsInput((persona as any).price_cents));
      setVeniceChatOptIn(!!(persona as any).venice_chat_opt_in);
      setContentThemeOverrides(((persona as any).content_theme_overrides as Record<string, boolean> | null) ?? {});
      setUseClonedVoice(!!(persona as any).use_cloned_voice);
      setVoiceStability(((persona as any).voice_stability as number | null) ?? 0.5);
      setVoiceSimilarityBoost(((persona as any).voice_similarity_boost as number | null) ?? 0.75);
      setVoiceStyle(((persona as any).voice_style as number | null) ?? 0);
      setRequireIdVerification(!!(persona as any).require_id_verification);
      setVeniceCharacterSlug(((persona as any).venice_character_slug as string | null) ?? "");
      const tn = ((persona as any).training_notes ?? {}) as Record<string, string>;
      setToneExamples(tn.tone_examples ?? "");
      setDos(tn.dos ?? "");
      setDonts(tn.donts ?? "");
      setSamplePhrasings(tn.sample_phrasings ?? "");
      setVoiceRefUrl(tn.voice_ref_url ?? "");
      setTwinLinkMode(((persona as any).twin_link_mode as any) ?? "all");
      setLinkedRefIds(((persona as any).linked_twin_ref_ids as string[] | null) ?? []);
      setHeygenAvatarId(((persona as any).heygen_avatar_id as string | null) ?? "");
      setHeygenVoiceId(((persona as any).heygen_voice_id as string | null) ?? "");
      setAvatarUrl(((persona as any).avatar_url as string | null) ?? null);
      setVisibility(persona.visibility);
      setTwinRefs(null);
      setSavedItems(null);
      setTab("basics");
    }
  }, [persona]);

  useEffect(() => {
    if (!persona) return;
    getFeedPolicy({ data: { personaId: persona.id } })
      .then((r) => setFeedTier(r.defaultVisibility))
      .catch(() => {});
  }, [persona, getFeedPolicy]);

  async function applyFeedTier(next: FeedVisibilityTier) {
    if (!persona) return;
    const prev = feedTier;
    setFeedTier(next); // optimistic
    setFeedTierBusy(true);
    try {
      await setFeedPolicy({ data: { personaId: persona.id, defaultVisibility: next } });
      toast.success("Feed audience updated");
    } catch (e: any) {
      setFeedTier(prev);
      toast.error(e.message ?? "Could not update feed audience");
    } finally { setFeedTierBusy(false); }
  }

  const feedLoggedOutVisible = feedTier === "public";
  const feedLoggedInVisible = feedTier === "public" || feedTier === "logged_in";

  function onToggleFeedLoggedOut(v: boolean) {
    applyFeedTier(nextFeedTierForToggle(feedTier, "loggedOut", v));
  }
  function onToggleFeedLoggedIn(v: boolean) {
    applyFeedTier(nextFeedTierForToggle(feedTier, "loggedIn", v));
  }

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
      const hardLimits = hardLimitsText.split("\n").map((s) => s.trim()).filter(Boolean);
      await update({ data: {
        personaId: persona.id,
        displayName, description, disclosureLabel,
        priceCents: dollarsInputToCents(priceDollars),
        systemPrompt: persona.kind === "ai" ? systemPrompt : undefined,
        isExplicit: persona.kind === "ai" ? explicitnessCeiling !== "sfw" : undefined,
        explicitnessCeiling: persona.kind === "ai" ? explicitnessCeiling : undefined,
        toneRules: persona.kind === "ai" ? { personality } : undefined,
        boundaryRules: persona.kind === "ai" ? { hardLimits } : undefined,
        veniceChatOptIn: persona.kind === "ai" ? veniceChatOptIn : undefined,
        contentThemeOverrides: persona.kind === "ai" ? contentThemeOverrides : undefined,
        useClonedVoice: persona.kind === "ai" ? useClonedVoice : undefined,
        voiceStability: persona.kind === "ai" && useClonedVoice ? voiceStability : undefined,
        voiceSimilarityBoost: persona.kind === "ai" && useClonedVoice ? voiceSimilarityBoost : undefined,
        voiceStyle: persona.kind === "ai" && useClonedVoice ? voiceStyle : undefined,
        requireIdVerification: persona.kind === "ai" ? requireIdVerification : undefined,
        veniceCharacterSlug: persona.kind === "ai" ? veniceCharacterSlug : undefined,
        trainingNotes: {
          tone_examples: toneExamples,
          dos, donts,
          sample_phrasings: samplePhrasings,
          voice_ref_url: voiceRefUrl,
        },
        twinLinkMode,
        linkedTwinRefIds: twinLinkMode === "selected" ? linkedRefIds : [],
        heygenAvatarId,
        heygenVoiceId,
        avatarUrl,
      }});
      toast.success("Persona saved");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save persona");
    } finally { setBusy(false); }
  }

  async function handleAvatarPick(file: File) {
    if (!persona || !user) return;
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) { toast.error("Use a PNG, JPG, or WebP image."); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Image must be under 8MB."); return; }
    setAvatarBusy(true);
    try {
      const resized = await resizeImageToBlob(file, 512, 0.9).catch(() => null);
      const blob: Blob = resized ?? file;
      const contentType = resized ? "image/jpeg" : file.type;
      const ext = resized ? "jpg" : (file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg");
      const path = `${user.id}/personas/${persona.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, {
        upsert: true,
        contentType,
      });
      if (upErr) throw upErr;
      setAvatarUrl(path);
      await update({ data: { personaId: persona.id, avatarUrl: path } });
      onLocalPatch?.(persona.id, { avatar_url: path } as any);
      toast.success("Avatar updated");
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally { setAvatarBusy(false); }
  }

  async function handleAvatarRemove() {
    if (!persona) return;
    setAvatarBusy(true);
    try {
      setAvatarUrl(null);
      await update({ data: { personaId: persona.id, avatarUrl: null } });
      onLocalPatch?.(persona.id, { avatar_url: null } as any);
      toast.success("Avatar removed");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not remove avatar");
    } finally { setAvatarBusy(false); }
  }

  async function changeVisibilityInline(v: Visibility) {
    if (!persona || v === visibility) return;
    const prev = visibility;
    setVisibility(v); // optimistic
    onLocalPatch?.(persona.id, { visibility: v });
    setVisBusy(true);
    try {
      await setVis({ data: { personaId: persona.id, visibility: v } });
      toast.success(`Set to ${VISIBILITY_LABEL[v].toLowerCase()}`);
    } catch (e: any) {
      setVisibility(prev);
      onLocalPatch?.(persona.id, { visibility: prev });
      toast.error(e?.message ?? "Could not update visibility");
    } finally { setVisBusy(false); }
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
          {(["basics", "training", "packs", "twin", "invites", "saved"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={"px-3 py-1.5 text-xs font-semibold uppercase tracking-widest " + (tab === t ? "border-b-2 border-brand text-foreground" : "text-muted-foreground")}
            >{t === "basics" ? "Basics" : t === "training" ? "Training" : t === "packs" ? "Packs" : t === "twin" ? "Twin" : t === "invites" ? "Invites" : "Saved"}</button>
          ))}
        </div>
        {tab === "basics" && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-3">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-full border border-border bg-surface-elevated">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-lg font-semibold text-muted-foreground">
                  {(displayName || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Profile picture</div>
              <p className="mt-0.5 text-xs text-muted-foreground">PNG or JPG, up to 5MB. Shown on this persona's card and chat header.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium hover:border-brand/40">
                  <Camera className="mr-1 size-3.5" />
                  {avatarBusy ? "Uploading…" : avatarUrl ? "Replace" : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={avatarBusy}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarPick(f); e.target.value = ""; }}
                  />
                </label>
                {avatarUrl && (
                  <Button type="button" size="sm" variant="ghost" disabled={avatarBusy} onClick={handleAvatarRemove}>
                    <XIcon className="mr-1 size-3.5" /> Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="edit-persona-name">Name</Label>
            <Input id="edit-persona-name" className="mt-1.5" value={displayName} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </div>
          <div>
            <Label htmlFor="edit-persona-visibility">Visibility</Label>
            <Select value={visibility} onValueChange={(v) => changeVisibilityInline(v as Visibility)} disabled={visBusy}>
              <SelectTrigger id="edit-persona-visibility" className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((v) => (
                  <SelectItem key={v} value={v}>{VISIBILITY_LABEL[v]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Applies instantly. Draft & Hidden are only visible to you. Public shows to everyone; Subscribers & VIP only to fans in that tier.
            </p>
          </div>
          <div className="rounded-lg border p-3 space-y-2">
            <Label>Feed audience</Label>
            <label className="flex items-center justify-between gap-2 text-xs">
              <span>Visible to logged-out visitors</span>
              <Switch checked={feedLoggedOutVisible} disabled={feedTierBusy} onCheckedChange={onToggleFeedLoggedOut} />
            </label>
            <label className="flex items-center justify-between gap-2 text-xs">
              <span>Visible to logged-in visitors (non-subscribers)</span>
              <Switch checked={feedLoggedInVisible} disabled={feedTierBusy} onCheckedChange={onToggleFeedLoggedIn} />
            </label>
            <p className="text-[11px] text-muted-foreground">
              Subscribers can always see everything. This sets the default for new feed posts — for per-post overrides and full control, see{" "}
              <Link to="/studio/feed-visibility" className="underline">Feed visibility →</Link>
            </p>
          </div>
          <div>
            <Label htmlFor="edit-persona-description">Description</Label>
            <Textarea id="edit-persona-description" className="mt-1.5" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-persona-disclosure">Disclosure label</Label>
            <Input id="edit-persona-disclosure" className="mt-1.5" value={disclosureLabel} onChange={(e) => setDisclosure(e.target.value)} maxLength={120} />
            <p className="mt-1 text-xs text-muted-foreground">Shown to every fan before they interact.</p>
          </div>
          <div>
            <Label htmlFor="edit-persona-price">Price</Label>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input id="edit-persona-price" className="pl-6" type="number" min="0" step="0.01" value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)} placeholder="0.00" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Shown to fans on this persona's card. Leave blank for "Included".</p>
          </div>
          {persona?.kind === "ai" && (
            <>
              <VeniceCharacterField
                idPrefix="edit-persona"
                value={veniceCharacterSlug}
                onChange={setVeniceCharacterSlug}
              />
              <div>
                <Label htmlFor="edit-persona-system-prompt">System prompt</Label>
                <Textarea id="edit-persona-system-prompt" className="mt-1.5" rows={5} maxLength={4000} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="edit-persona-personality">Personality / tone</Label>
                <Input id="edit-persona-personality" className="mt-1.5" maxLength={300} value={personality} onChange={(e) => setPersonality(e.target.value)}
                  placeholder="e.g. Playful, teasing, warm — never sarcastic." />
              </div>
              <div>
                <Label htmlFor="edit-persona-boundary">Boundary ceiling — one hard limit per line</Label>
                <Textarea id="edit-persona-boundary" className="mt-1.5" rows={3} maxLength={6000} value={hardLimitsText}
                  onChange={(e) => setHardLimitsText(e.target.value)}
                  placeholder={"Never discuss meeting in person\nNever claim to be human"} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Platform-enforced and non-negotiable. Required before this persona can be published.
                </p>
              </div>
              <div>
                <Label htmlFor="edit-persona-explicitness">Explicitness level</Label>
                <Select value={explicitnessCeiling} onValueChange={(v) => setExplicitnessCeiling(v as any)}>
                  <SelectTrigger id="edit-persona-explicitness" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sfw">SFW</SelectItem>
                    <SelectItem value="suggestive">Suggestive</SelectItem>
                    <SelectItem value="explicit">Explicit</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Enforced on every reply, independent of what a fan says. Above "SFW" requires fan 18+ acknowledgement. Can't exceed the platform-wide maximum.
                </p>
              </div>
              {explicitnessCeiling === "explicit" && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Venice AI (mandatory)</Badge>
                  <p className="text-xs text-muted-foreground">
                    Explicit-tier chat always runs on Venice AI — the default AI Gateway is moderated and can't produce this tier of content.
                  </p>
                </div>
              )}
              {explicitnessCeiling === "suggestive" && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label htmlFor="edit-persona-venice-opt-in">Use Venice AI for chat</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Optional at this tier. Off uses the default AI Gateway.
                    </p>
                  </div>
                  <Switch id="edit-persona-venice-opt-in" checked={veniceChatOptIn} onCheckedChange={setVeniceChatOptIn} />
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="edit-persona-require-id-verification">Require ID verification</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fans must complete identity verification before chatting or viewing this persona's feed content — regardless of explicitness tier.
                  </p>
                </div>
                <Switch id="edit-persona-require-id-verification" checked={requireIdVerification} onCheckedChange={setRequireIdVerification} />
              </div>
              <div>
                <Label>Content categories</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Off means this persona won't draw on that theme from the reference content library. Doesn't override your boundary ceiling above — this only narrows within it.
                </p>
                <div className="mt-2 space-y-1.5">
                  {CONTENT_THEME_KEYS.map((key) => {
                    const allowed = contentThemeOverrides[key] !== false;
                    return (
                      <label key={key} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 text-xs">
                        <span>{CONTENT_THEME_LABELS[key]}</span>
                        <Switch checked={allowed} onCheckedChange={(v) => setContentThemeOverrides((s) => ({ ...s, [key]: v }))} />
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Voice replies</Label>
                {elevenlabsVoiceId ? (
                  <div className="mt-1.5 space-y-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm">Use your cloned voice</div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Off falls back to a generic preset voice for this persona's spoken replies.
                        </p>
                      </div>
                      <Switch checked={useClonedVoice} onCheckedChange={setUseClonedVoice} />
                    </div>
                    {useClonedVoice && (
                      <div className="space-y-3 border-t pt-3">
                        <VoiceSettingSlider label="Closeness to your voice" value={voiceSimilarityBoost} onChange={setVoiceSimilarityBoost} />
                        <VoiceSettingSlider label="Stability" value={voiceStability} onChange={setVoiceStability} />
                        <VoiceSettingSlider label="Style exaggeration" value={voiceStyle} onChange={setVoiceStyle} />
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Record and clone your voice first from this persona's onboarding page ("Voice samples" step) to enable spoken replies that sound like you.
                  </p>
                )}
              </div>
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
            <Label htmlFor="edit-persona-tone-examples">Tone & voice examples</Label>
            <Textarea id="edit-persona-tone-examples" className="mt-1.5" rows={3} maxLength={4000} value={toneExamples} onChange={(e) => setToneExamples(e.target.value)}
              placeholder="Playful, teasing, uses emojis sparingly. Never sarcastic." />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="edit-persona-dos">Do's</Label>
              <Textarea id="edit-persona-dos" className="mt-1.5" rows={4} maxLength={4000} value={dos} onChange={(e) => setDos(e.target.value)}
                placeholder="- Address fans by name&#10;- Offer VIP upsells naturally" />
            </div>
            <div>
              <Label htmlFor="edit-persona-donts">Don'ts</Label>
              <Textarea id="edit-persona-donts" className="mt-1.5" rows={4} maxLength={4000} value={donts} onChange={(e) => setDonts(e.target.value)}
                placeholder="- Never claim to be human&#10;- No political topics" />
            </div>
          </div>
          <div>
            <Label htmlFor="edit-persona-sample-phrasings">Sample phrasings</Label>
            <Textarea id="edit-persona-sample-phrasings" className="mt-1.5" rows={3} maxLength={4000} value={samplePhrasings} onChange={(e) => setSamplePhrasings(e.target.value)}
              placeholder={"“hey babe 💜 what are we getting into tonight?”"} />
          </div>
          <div>
            <Label htmlFor="edit-persona-voice-ref-url">Voice reference URL (optional)</Label>
            <Input id="edit-persona-voice-ref-url" className="mt-1.5" value={voiceRefUrl} onChange={(e) => setVoiceRefUrl(e.target.value)}
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
        {tab === "twin" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Choose which identity, voice, and style references from your <Link to="/studio/twin" className="text-brand-glow hover:underline">Digital Twin Profile</Link> this persona uses.
          </p>
          <div className="rounded-lg border border-border bg-surface p-3 text-xs">
            <div className="mb-2 font-semibold">Reference scope</div>
            <div className="space-y-2">
              {([
                { v: "all", label: "Use all approved twin references", hint: "Broadest — inherits every approved identity, voice, and style ref." },
                { v: "selected", label: "Use only selected references", hint: "Pick specific refs below. Great for a tightly styled persona." },
                { v: "none", label: "Do not use twin references", hint: "The persona won't draw from your digital twin." },
              ] as const).map((opt) => (
                <label key={opt.v} className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 bg-background/40 p-2">
                  <input type="radio" name="twin-mode" className="mt-1" checked={twinLinkMode === opt.v}
                    onChange={() => setTwinLinkMode(opt.v)} />
                  <div>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.hint}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {twinLinkMode === "selected" && (
            twinRefs === null ? (
              <div className="text-sm text-muted-foreground">Loading references…</div>
            ) : twinRefs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No twin references yet.{" "}
                <Link to="/studio/twin" className="text-brand-glow hover:underline">Upload some</Link>
              </div>
            ) : (
              <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {(["identity_ref", "voice_ref", "style_ref"] as const).map((k) => {
                  const group = twinRefs.filter((r: any) => r.kind === k);
                  if (!group.length) return null;
                  return (
                    <div key={k}>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {k === "identity_ref" ? "Identity" : k === "voice_ref" ? "Voice" : "Style"}
                      </div>
                      <div className="space-y-1">
                        {group.map((r: any) => {
                          const on = linkedRefIds.includes(r.id);
                          const approved = r.review_status === "approved";
                          return (
                            <label key={r.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1.5 text-xs">
                              <div className="min-w-0 flex-1 truncate">
                                <span className="font-medium">{r.slot_label || "Untitled"}</span>{" "}
                                <span className={`ml-1 rounded-full border px-1.5 py-0.5 text-[9px] uppercase ${approved ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-border bg-surface text-muted-foreground"}`}>
                                  {r.review_status ?? "draft"}
                                </span>
                              </div>
                              <Switch checked={on} onCheckedChange={(v) => setLinkedRefIds((s) => v ? [...s, r.id] : s.filter((i) => i !== r.id))} />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
          <div className="rounded-lg border border-border bg-surface p-3 text-xs">
            <div className="mb-1 font-semibold">HeyGen render IDs (talking-head)</div>
            <p className="mb-2 text-muted-foreground">
              Paste the avatar and (optional) voice IDs from your HeyGen account. Used when this persona queues a talking-head clip. Leave blank to fall back to workspace defaults.
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <Label htmlFor="edit-persona-heygen-avatar-id" className="text-[11px]">Avatar ID</Label>
                <Input id="edit-persona-heygen-avatar-id" className="mt-1" value={heygenAvatarId} onChange={(e) => setHeygenAvatarId(e.target.value)} placeholder="e.g. Daisy_sitting_sofa_side_public" maxLength={120} />
              </div>
              <div>
                <Label htmlFor="edit-persona-heygen-voice-id" className="text-[11px]">Voice ID (optional)</Label>
                <Input id="edit-persona-heygen-voice-id" className="mt-1" value={heygenVoiceId} onChange={(e) => setHeygenVoiceId(e.target.value)} placeholder="Leave blank to use our TTS voice selection" maxLength={120} />
              </div>
            </div>
          </div>
        </div>
        )}
        {tab === "invites" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Share this persona privately with specific people you trust, without listing it publicly. Only takes effect once this persona's{" "}
            <button type="button" className="text-brand-glow underline" onClick={() => setTab("basics")}>visibility</button> is set to "Invite only".
          </p>
          {visibility !== "invite_only" && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
              Set visibility to "Invite only" in the Basics tab to make invite links functional.
            </div>
          )}
          <Button size="sm" onClick={generateInvite} disabled={inviteBusy}>
            {inviteBusy ? "Creating…" : "Generate invite link"}
          </Button>
          {invitesLoading || invites === null ? (
            <div className="text-sm text-muted-foreground">Loading invites…</div>
          ) : invites.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No invites yet. Generate one above and send the link to someone you trust.
            </div>
          ) : (
            <div className="space-y-2">
              {invites.map((inv) => {
                const url = typeof window !== "undefined" ? `${window.location.origin}/invite/${inv.token}` : `/invite/${inv.token}`;
                const tone = inv.status === "accepted" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                  : inv.status === "revoked" ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                  : "border-border bg-surface text-muted-foreground";
                return (
                  <div key={inv.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-2.5 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${tone}`}>{inv.status}</span>
                        <span className="text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</span>
                      </div>
                      {inv.status === "pending" && (
                        <button
                          type="button"
                          className="mt-1 block truncate text-left text-brand-glow underline"
                          onClick={() => { navigator.clipboard.writeText(url); toast.success("Invite link copied"); }}
                          title={url}
                        >{url}</button>
                      )}
                    </div>
                    {inv.status !== "revoked" && (
                      <Button size="sm" variant="ghost" disabled={inviteBusy} onClick={() => handleRevokeInvite(inv.id)}>Revoke</Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}
        {tab === "saved" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Reusable replies for this persona. Available in the Real Me inbox composer. Mark items as “Few-shot examples” to also feed them into the AI persona's tone at chat time.
          </p>
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="mb-1 text-xs font-semibold">New saved reply</div>
            <Input placeholder="Label (e.g. Welcome DM)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={120} />
            <Textarea className="mt-2" rows={3} maxLength={4000} placeholder="Body — the reply text" value={newBody} onChange={(e) => setNewBody(e.target.value)} />
            <label className="mt-2 flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-2 py-1.5 text-xs">
              <span>Use as few-shot example for AI persona</span>
              <Switch checked={newFewShot} onCheckedChange={setNewFewShot} />
            </label>
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={addSaved} disabled={!newLabel.trim() || savedBusy === "new"}>
                <Plus className="mr-1 size-3" /> Add
              </Button>
            </div>
          </div>
          {savedLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!savedLoading && savedItems && savedItems.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No saved replies yet.
            </div>
          )}
          {!savedLoading && savedItems && savedItems.length > 0 && (
            <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {savedItems.map((s: any) => (
                <div key={s.id} className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{s.label}</div>
                      {s.body && <div className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{s.body}</div>}
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removeSaved(s.id)} disabled={savedBusy === s.id} title="Delete">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <label className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Few-shot example for AI</span>
                    <Switch checked={!!s.use_as_few_shot} onCheckedChange={(v) => toggleFewShot(s, v)} disabled={savedBusy === s.id} />
                  </label>
                </div>
              ))}
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