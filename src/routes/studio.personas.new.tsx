import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/lib/session";
import { createPersona } from "@/lib/persona-studio.functions";
import { listMyPersonas } from "@/lib/onboarding.functions";
import { matchesRealName } from "@/lib/persona-name-privacy";
import {
  CONTENT_THEME_KEYS, CONTENT_THEME_LABELS, ExternalModelIdsPanel, VoiceSettingSlider,
  dollarsInputToCents,
} from "@/components/twinly/persona-form-shared";

export const Route = createFileRoute("/studio/personas/new")({
  component: NewPersonaPage,
  head: () => ({
    meta: [
      { title: "New persona — Creator Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function NewPersonaPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const load = useServerFn(listMyPersonas);
  const create = useServerFn(createPersona);

  const [creator, setCreator] = useState<{
    fullName: string | null;
    elevenlabsVoiceId: string | null;
    hasRealMeProfile: boolean;
    baselineVeniceSlug: string | null;
  } | null>(null);
  const [ready, setReady] = useState(false);

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
  const [requiresVerifiedSupporter, setRequiresVerifiedSupporter] = useState(false);
  const [veniceCharacterSlug, setVeniceCharacterSlug] = useState("");
  const [heygenAvatarId, setHeygenAvatarId] = useState("");
  const [heygenVoiceId, setHeygenVoiceId] = useState("");
  const [elevenlabsVoiceId, setElevenlabsVoiceId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    load()
      .then((r) => {
        if (!r.creator) { navigate({ to: "/onboarding" }); return; }
        setCreator({
          fullName: (r.creator as any).fullName ?? null,
          elevenlabsVoiceId: (r.creator as any).elevenlabs_voice_id ?? null,
          hasRealMeProfile: !!(r.creator as any).hasRealMeProfile,
          baselineVeniceSlug: (r.creator as any).venice_character_slug ?? null,
        });
        setReady(true);
      })
      .catch(() => setReady(true));
  }, [user, load, navigate]);

  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault();
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
          requiresVerifiedSupporter: kind === "ai" ? requiresVerifiedSupporter : undefined,
          veniceCharacterSlug: kind === "ai" ? veniceCharacterSlug : undefined,
          heygenAvatarId: kind === "ai" ? heygenAvatarId : undefined,
          heygenVoiceId: kind === "ai" ? heygenVoiceId : undefined,
          elevenlabsVoiceId: kind === "ai" ? elevenlabsVoiceId : undefined,
        },
      });
      toast.success("Persona created — it's in draft.");
      navigate({ to: "/studio/personas" });
    } catch (err: any) {
      toast.error(err.message ?? "Could not create persona");
    } finally { setBusy(false); }
  }

  if (loading || !ready) {
    return <AppShell><div className="text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-2xl pb-28">
        <header className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <Link to="/studio/personas" className="hover:underline">Persona studio</Link> &rsaquo; New
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold">New persona</h1>
          <p className="mt-1 text-sm text-muted-foreground">Starts as a draft — publish it when it's ready.</p>
        </header>

        <form onSubmit={submit} className="space-y-6">
          <section aria-labelledby="basics-heading" className="space-y-4">
            <h2 id="basics-heading" className="sr-only">Basics</h2>
            <div>
              <Label htmlFor="new-persona-name">Name</Label>
              <Input id="new-persona-name" className="mt-1.5" value={displayName} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
              {matchesRealName(displayName, creator?.fullName ?? null) && (
                <p className="mt-1.5 text-xs text-amber-500">
                  This name may reduce your privacy separation between Real Me and this persona.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="new-persona-kind">Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                <SelectTrigger id="new-persona-kind" className="mt-1.5"><SelectValue /></SelectTrigger>
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
            {kind === "ai" && !creator?.hasRealMeProfile && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
                Complete your Real Me baseline first — AI personas can auto-generate their tone and opening lines from it.{" "}
                <Link to="/studio/real-me" className="underline">Set up Real Me &rarr;</Link>
              </div>
            )}
            <div>
              <Label htmlFor="new-persona-description">Description</Label>
              <Textarea id="new-persona-description" className="mt-1.5" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="new-persona-price">Price</Label>
              <div className="relative mt-1.5">
                <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input id="new-persona-price" className="pl-6" type="number" min="0" step="0.01" value={priceDollars}
                  onChange={(e) => setPriceDollars(e.target.value)} placeholder="0.00" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Shown to fans on this persona's card. Leave blank for "Included".</p>
            </div>
          </section>

          {kind === "ai" && (
            <section aria-labelledby="ai-heading" className="space-y-4 border-t border-border pt-6">
              <h2 id="ai-heading" className="font-display text-xl font-semibold">AI persona</h2>

              <ExternalModelIdsPanel
                idPrefix="new-persona"
                venice={veniceCharacterSlug} onVenice={setVeniceCharacterSlug}
                heygenAvatar={heygenAvatarId} onHeygenAvatar={setHeygenAvatarId}
                heygenVoice={heygenVoiceId} onHeygenVoice={setHeygenVoiceId}
                elevenlabsVoice={elevenlabsVoiceId} onElevenlabsVoice={setElevenlabsVoiceId}
                baselineVeniceSlug={creator?.baselineVeniceSlug ?? null}
              />

              <div>
                <Label htmlFor="new-persona-system-prompt">System prompt</Label>
                <Textarea id="new-persona-system-prompt" className="mt-1.5" rows={4} maxLength={4000} value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Define voice, tone, and hard limits." />
              </div>
              <div>
                <Label htmlFor="new-persona-personality">Personality / tone</Label>
                <Input id="new-persona-personality" className="mt-1.5" maxLength={300} value={personality} onChange={(e) => setPersonality(e.target.value)}
                  placeholder="e.g. Playful, teasing, warm — never sarcastic." />
              </div>
              <div>
                <Label htmlFor="new-persona-boundary">Boundary ceiling — one hard limit per line</Label>
                <Textarea id="new-persona-boundary" className="mt-1.5" rows={3} maxLength={6000} value={hardLimitsText}
                  onChange={(e) => setHardLimitsText(e.target.value)}
                  placeholder={"Never discuss meeting in person\nNever claim to be human"} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Platform-enforced and non-negotiable — the AI can't be talked past these no matter what a fan says. Required before this persona can be published.
                </p>
              </div>
              <div>
                <Label htmlFor="new-persona-explicitness">Explicitness level</Label>
                <Select value={explicitnessCeiling} onValueChange={(v) => setExplicitnessCeiling(v as any)}>
                  <SelectTrigger id="new-persona-explicitness" className="mt-1.5"><SelectValue /></SelectTrigger>
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
                    <Label htmlFor="new-persona-venice-opt-in">Use Venice AI for chat</Label>
                    <p className="mt-1 text-xs text-muted-foreground">Optional at this tier. Off uses the default AI Gateway.</p>
                  </div>
                  <Switch id="new-persona-venice-opt-in" checked={veniceChatOptIn} onCheckedChange={setVeniceChatOptIn} />
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="new-persona-require-id-verification">Require ID verification</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fans must complete identity verification before chatting or viewing this persona's feed content — regardless of explicitness tier.
                  </p>
                </div>
                <Switch id="new-persona-require-id-verification" checked={requireIdVerification} onCheckedChange={setRequireIdVerification} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="new-persona-requires-verified-supporter">Verified supporters only</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Only fans with an active Level 1 identity verification can enter this persona. Unverified visitors see a friendly prompt directing them to verify — or to redeem a supporter invite you've sent them.
                  </p>
                </div>
                <Switch id="new-persona-requires-verified-supporter" checked={requiresVerifiedSupporter} onCheckedChange={setRequiresVerifiedSupporter} />
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
                {creator?.elevenlabsVoiceId ? (
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
            </section>
          )}

          <div
            role="region"
            aria-label="Form actions"
            className="sticky bottom-0 -mx-4 mt-8 flex items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70"
          >
            <Button asChild variant="ghost" disabled={busy}>
              <Link to="/studio/personas">Cancel</Link>
            </Button>
            <Button type="submit" disabled={busy} className="min-h-11">
              {busy ? "Creating…" : "Create draft"}
            </Button>
          </div>
        </form>
      </main>
    </AppShell>
  );
}