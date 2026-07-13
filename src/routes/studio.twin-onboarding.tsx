import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, Upload, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { getTwinProfile, addTwinReference, upsertTwinConsent, submitTwinReferencesForReview } from "@/lib/twin.functions";
import { getBaselineVeniceCharacter, setBaselineVeniceCharacter } from "@/lib/venice-character.functions";
import { VeniceCharacterField } from "@/components/twinly/persona-form-shared";
import { useMediaUploadConsent } from "@/components/twinly/MediaUploadConsentGate";

export const Route = createFileRoute("/studio/twin-onboarding")({
  component: TwinOnboardingWizard,
  validateSearch: z.object({
    step: z.coerce.number().int().min(1).max(5).optional(),
  }),
  head: () => ({ meta: [{ title: "Set up your AI Twin — Twinly.life" }, { name: "robots", content: "noindex" }] }),
});

// Non-explicit, angle/expression/lighting variety — no nudity requirement.
// These become identity_ref slot labels, matched back for progress tracking.
const RECOMMENDED_SHOTS = [
  { key: "front-neutral", label: "Front, neutral" },
  { key: "front-smile", label: "Front, smile" },
  { key: "3q-left", label: "3/4 left" },
  { key: "3q-right", label: "3/4 right" },
  { key: "profile-left", label: "Profile left" },
  { key: "profile-right", label: "Profile right" },
  { key: "closeup-eyes", label: "Close-up, eyes" },
  { key: "closeup-lips", label: "Close-up, lips" },
] as const;

type Profile = Awaited<ReturnType<typeof getTwinProfile>>;

function TwinOnboardingWizard() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const load = useServerFn(getTwinProfile);
  const add = useServerFn(addTwinReference);
  const upsertConsent = useServerFn(upsertTwinConsent);
  const submitReview = useServerFn(submitTwinReferencesForReview);
  const loadBaseline = useServerFn(getBaselineVeniceCharacter);
  const saveBaseline = useServerFn(setBaselineVeniceCharacter);
  const { ensureConsent } = useMediaUploadConsent();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>((search.step as 1 | 2 | 3 | 4 | 5 | undefined) ?? 1);
  const [data, setData] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [likenessOk, setLikenessOk] = useState(false);
  const [imageOk, setImageOk] = useState(true);
  const [voiceOk, setVoiceOk] = useState(false);
  const [videoOk, setVideoOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [baselineSlug, setBaselineSlug] = useState("");
  const [baselineInitial, setBaselineInitial] = useState<string | null>(null);
  const [savingBaseline, setSavingBaseline] = useState(false);
  const [baselinePreview, setBaselinePreview] = useState<{
    slug: string; name: string; description: string | null;
    photoUrl: string | null; author: string; adult: boolean;
    source: "venice" | "manual";
  } | null>(null);
  const [baselineStatus, setBaselineStatus] = useState<"idle" | "ok" | "not_found" | "error">("idle");

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  // Keep local step synced with ?step=N on subsequent navigations from the
  // dashboard checklist (arriving mid-session with a new deep link).
  useEffect(() => {
    if (search.step && search.step >= 1 && search.step <= 5) {
      setStep(search.step as 1 | 2 | 3 | 4 | 5);
    }
  }, [search.step]);

  // Mirror local step -> URL so back/forward navigation and refresh land the
  // user back on the same wizard step. `replace` avoids piling up history
  // entries for each Next/Back click while still updating the URL.
  useEffect(() => {
    if (search.step === step) return;
    navigate({
      to: "/studio/twin-onboarding",
      search: { step },
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const refresh = async () => {
    try {
      const res = await load();
      setData(res);
      if (res.consent) {
        setLikenessOk(!!res.consent.likeness_ok);
        setImageOk(!!res.consent.image_ok);
        setVoiceOk(!!res.consent.voice_ok);
        setVideoOk(!!res.consent.video_ok);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Could not load your twin profile");
    } finally { setReady(true); }
  };

  useEffect(() => { if (user) refresh(); }, [user]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const r = await loadBaseline();
        if (!alive) return;
        setBaselineSlug(r.slug ?? "");
        setBaselineInitial(r.slug);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [user, loadBaseline]);

  async function saveBaselineAndContinue() {
    const next = baselineSlug.trim() || null;
    const currentSaved = baselineInitial?.trim() || null;
    if (next === currentSaved) {
      setStep(3);
      return;
    }
    if (currentSaved && !next) {
      const ok = typeof window !== "undefined"
        ? window.confirm(`Clear your saved baseline Character ID "${currentSaved}"? Personas already using it keep the value; only the workspace default is removed.`)
        : true;
      if (!ok) return;
    }
    setSavingBaseline(true);
    try {
      const r = await saveBaseline({ data: { slug: next } });
      setBaselineInitial(r.slug);
      toast.success(r.slug ? "Baseline Character ID saved" : "Baseline Character ID cleared");
      setStep(3);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save Character ID");
    } finally {
      setSavingBaseline(false);
    }
  }

  const identityRefs = useMemo(() => (data?.refs ?? []).filter((r: any) => r.kind === "identity_ref"), [data]);
  const filledShots = useMemo(() => {
    const labels = new Set(identityRefs.map((r: any) => r.slot_label));
    return RECOMMENDED_SHOTS.filter((s) => labels.has(s.label));
  }, [identityRefs]);

  async function uploadShot(shotLabel: string, file: File) {
    if (!data?.creator) return;
    if (!(await ensureConsent({ context: "twin.onboarding.reference" }))) return;
    setUploading(shotLabel);
    try {
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const key = `${data.creator.id}/twin/identity_ref/${crypto.randomUUID()}${ext}`;
      const { error } = await supabase.storage
        .from("content-assets")
        .upload(key, file, { cacheControl: "3600", upsert: false, contentType: file.type || undefined });
      if (error) { toast.error(error.message); return; }
      await add({ data: { kind: "identity_ref", storagePath: key, mimeType: file.type || undefined, slotLabel: shotLabel } });
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function saveConsentAndContinue() {
    if (!likenessOk) return toast.error("Likeness consent is required to generate any synthetic content.");
    try {
      await upsertConsent({ data: { likenessOk, imageOk, voiceOk, videoOk } });
      setStep(5);
    } catch (e: any) {
      toast.error(e.message ?? "Could not save consent");
    }
  }

  async function finishAndSubmit() {
    setSubmitting(true);
    try {
      await submitReview({ data: {} });
      setSubmitted(true);
      toast.success("Submitted for review");
    } catch (e: any) {
      toast.error(e.message ?? "Could not submit for review");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return <AppShell><div className="py-20 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }
  if (!data?.creator) {
    return (
      <AppShell>
        <div className="py-20 text-center">
          <p className="text-muted-foreground">Create your creator profile first.</p>
          <Link to="/onboarding" className="mt-4 inline-block text-sm text-brand-glow underline">Get started →</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-2">
          {([1, 2, 3, 4, 5] as const).map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-brand" : "bg-border"}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold">Set up your AI Twin</h1>
            <p className="text-sm text-muted-foreground">
              Your Digital Twin is a baseline of reference photos and consent settings, owned by you — not any one persona. Once it's approved, you can create as many stylised personas as you like (Nice, Naughty, Wicked, or custom) at whatever explicitness level you're comfortable with, and each one draws on this same approved baseline.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Nothing here is nude or explicit — just angle, expression, and lighting variety.</li>
              <li>An admin reviews your photos before anything can be generated from them.</li>
              <li>Consent is granular and revocable at any time from your Digital Twin Profile.</li>
            </ul>
            <Button onClick={() => setStep(2)}>Get started<ArrowRight className="ml-2 size-4" /></Button>
          </div>
        )}

        {step === 2 && (
          <section aria-labelledby="onboarding-venice-heading" className="space-y-4">
            <div className="flex items-baseline justify-between">
              <h1 id="onboarding-venice-heading" className="font-display text-2xl font-bold">Character ID (optional)</h1>
              <span className="text-xs text-muted-foreground">Step 2 of 5</span>
            </div>
            <p className="text-sm text-muted-foreground">
              If you've already built a Venice Character, paste its ID here and every new AI persona will
              pick it up as the default — no need to paste it into each persona later. You can skip this
              and add or change it any time from your Digital Twin Profile.
            </p>
            <p className="text-xs text-muted-foreground">
              A live preview of the Character's name, avatar and description appears below once the ID checks out.
              If Venice can't be reached after a couple of tries, you can paste the raw character JSON as a fallback.
            </p>
            {baselineInitial && (
              <p
                id="onboarding-venice-current"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground"
                role="status"
              >
                Currently saved baseline: <span className="font-mono text-foreground">{baselineInitial}</span>.
                Skip keeps it untouched — clearing the field and choosing Save &amp; continue is the only way to remove it.
              </p>
            )}
            <VeniceCharacterField
              idPrefix="onboarding-baseline"
              value={baselineSlug}
              onChange={setBaselineSlug}
              onPreview={(p) => {
                setBaselinePreview(p);
                setBaselineStatus(p ? "ok" : baselineSlug.trim() ? baselineStatus : "idle");
              }}
            />
            <div aria-live="polite" aria-atomic="true">
              {baselinePreview && (
                <aside
                  aria-label={`Character preview: ${baselinePreview.name}`}
                  className="flex items-start gap-4 rounded-2xl border border-brand/30 bg-brand/5 p-4"
                >
                {baselinePreview.photoUrl ? (
                  <img
                    src={baselinePreview.photoUrl}
                    alt={`${baselinePreview.name} avatar`}
                    className="size-20 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="size-20 shrink-0 rounded-xl bg-brand/20" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg font-semibold">{baselinePreview.name}</span>
                    {baselinePreview.adult && (
                      <span aria-label="Adult content, 18 and over" className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-300">18+</span>
                    )}
                    {baselinePreview.source === "manual" && (
                      <span aria-label="Manually verified from pasted JSON" className="rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-sky-300">Manual</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    by {baselinePreview.author || "unknown"} · <span className="font-mono">{baselinePreview.slug}</span>
                  </div>
                  {baselinePreview.description && (
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{baselinePreview.description}</p>
                  )}
                </div>
                </aside>
              )}
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    // Persist a per-creator "skipped" flag so the dashboard
                    // checklist stops nagging across sessions on this browser.
                    if (!baselineInitial && data?.creator?.id) {
                      try { window.localStorage.setItem(`twinly:setup:skip-venice:${data.creator.id}`, "1"); }
                      catch { /* ignore */ }
                    }
                    setStep(3);
                  }}
                  disabled={savingBaseline}
                  aria-label={baselineInitial ? `Skip this step and keep the saved baseline ${baselineInitial}` : "Skip this step"}
                >
                  Skip
                </Button>
                <Button
                  onClick={saveBaselineAndContinue}
                  disabled={savingBaseline || (!!baselineSlug.trim() && !baselinePreview)}
                  aria-describedby={
                    !!baselineSlug.trim() && !baselinePreview
                      ? "onboarding-venice-savehint"
                      : baselineInitial && !baselineSlug.trim()
                        ? "onboarding-venice-clearhint"
                        : undefined
                  }
                >
                  {savingBaseline ? "Saving…" : "Save & continue"}
                  <ArrowRight className="ml-2 size-4" aria-hidden />
                </Button>
              </div>
            </div>
            {!!baselineSlug.trim() && !baselinePreview && (
              <p id="onboarding-venice-savehint" className="text-[11px] text-muted-foreground">
                Fix or skip this step before continuing — the ID hasn't been verified yet.
              </p>
            )}
            {baselineInitial && !baselineSlug.trim() && (
              <p id="onboarding-venice-clearhint" className="text-[11px] text-amber-300" role="status">
                Saving now will clear your baseline (<span className="font-mono">{baselineInitial}</span>). Choose Skip to keep it.
              </p>
            )}
          </section>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <h1 className="font-display text-2xl font-bold">Reference photos</h1>
              <span className="text-xs text-muted-foreground">{filledShots.length} of {RECOMMENDED_SHOTS.length} recommended</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Fill in as many as you're comfortable with — more angles means more consistent results, but you can continue with just one and add the rest later from your Digital Twin Profile.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {RECOMMENDED_SHOTS.map((shot) => {
                const filled = filledShots.some((s) => s.key === shot.key);
                const busy = uploading === shot.label;
                return (
                  <label
                    key={shot.key}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 text-sm ${filled ? "border-emerald-400/40 bg-emerald-400/10" : "border-border bg-surface hover:border-brand/50"}`}
                  >
                    <span className="flex items-center gap-2">
                      {filled ? <CheckCircle2 className="size-4 text-emerald-400" /> : busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4 text-muted-foreground" />}
                      {shot.label}
                    </span>
                    <input
                      type="file" accept="image/*" className="hidden" disabled={busy}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadShot(shot.label, f); e.currentTarget.value = ""; }}
                    />
                  </label>
                );
              })}
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={() => setStep(4)} disabled={identityRefs.length === 0}>
                Continue<ArrowRight className="ml-2 size-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold">Consent</h1>
            <p className="text-sm text-muted-foreground">
              Choose what your photos can be used for. You can change or revoke any of this later — it never applies retroactively to content already generated.
            </p>
            <div className="space-y-2">
              <ConsentRow label="Likeness consent (required)" hint="The base permission every other toggle depends on." checked={likenessOk} onChange={setLikenessOk} />
              <ConsentRow label="AI images" hint="Generate still images from your likeness." checked={imageOk} onChange={setImageOk} />
              <ConsentRow label="AI voice" hint="Speak in a cloned version of your voice." checked={voiceOk} onChange={setVoiceOk} />
              <ConsentRow label="AI video" hint="Generate short video clips." checked={videoOk} onChange={setVideoOk} />
            </div>
            <p className="text-xs text-muted-foreground">
              Need finer control (forbidden uses, training consent)? Handle that on your{" "}
              <Link to="/studio/twin" className="text-brand-glow underline">full Digital Twin Profile</Link> any time.
            </p>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(3)}>Back</Button>
              <Button onClick={saveConsentAndContinue}>Continue<ArrowRight className="ml-2 size-4" /></Button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold">Submit for review</h1>
            {!submitted ? (
              <>
                <p className="text-sm text-muted-foreground">
                  An admin will review your {identityRefs.length} photo{identityRefs.length === 1 ? "" : "s"} before they can be used to generate anything. This is usually quick, and you can keep working in the meantime.
                </p>
                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep(4)}>Back</Button>
                  <Button onClick={finishAndSubmit} disabled={submitting}>
                    {submitting ? "Submitting…" : "Submit for review"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">
                  <ShieldCheck className="size-5" /> Submitted — you'll see the status update on your Digital Twin Profile once it's reviewed.
                </div>
                <p className="text-sm text-muted-foreground">
                  You don't need to wait to keep going — create your first persona now, at whatever explicitness level feels right, and it'll pick up your approved baseline automatically once review is done.
                </p>
                <Button onClick={() => navigate({ to: "/studio/personas" })}>
                  Create your first persona<ArrowRight className="ml-2 size-4" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ConsentRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
