import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PersonaBadge } from "@/components/twinly/PersonaBadge";
import { useSession } from "@/lib/session";
import {
  checkHandleAvailable,
  createCreatorProfile,
  listMyPersonas,
  updatePersonaBasics,
  completeOnboarding,
} from "@/lib/onboarding.functions";

export const Route = createFileRoute("/onboarding")({ component: OnboardingPage });

type Persona = Awaited<ReturnType<typeof listMyPersonas>>["personas"][number];

function OnboardingPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);

  // Step 1
  const [handle, setHandle] = useState("");
  const [stageName, setStageName] = useState("");
  const [bio, setBio] = useState("");
  const [handleState, setHandleState] = useState<{ available?: boolean; reason?: string }>({});

  // Step 2
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [publish, setPublish] = useState<Record<string, boolean>>({});
  const [realMeDesc, setRealMeDesc] = useState("");

  // Step 3
  const [consentName, setConsentName] = useState("");
  const [consentAgree, setConsentAgree] = useState(false);

  const check = useServerFn(checkHandleAvailable);
  const createProfile = useServerFn(createCreatorProfile);
  const listPersonas = useServerFn(listMyPersonas);
  const updatePersona = useServerFn(updatePersonaBasics);
  const finish = useServerFn(completeOnboarding);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  // Debounced handle check.
  useEffect(() => {
    if (!handle) { setHandleState({}); return; }
    const t = setTimeout(async () => {
      try {
        const res = await check({ data: { handle } });
        setHandleState({ available: res.available, reason: (res as any).reason });
      } catch { /* noop */ }
    }, 350);
    return () => clearTimeout(t);
  }, [handle, check]);

  // If user already has a creator profile, jump to step 2 and hydrate.
  useEffect(() => {
    if (!user) return;
    listPersonas().then((res) => {
      if (res.creator) {
        if (res.creator.onboarding_completed_at) {
          navigate({ to: "/creators/$handle", params: { handle: res.creator.handle } });
          return;
        }
        setHandle(res.creator.handle);
        setStageName(res.creator.stage_name);
        setPersonas(res.personas);
        const initPublish: Record<string, boolean> = {};
        for (const p of res.personas) initPublish[p.id] = p.kind === "real_me";
        setPublish(initPublish);
        const realMe = res.personas.find((p) => p.kind === "real_me");
        if (realMe) setRealMeDesc(realMe.description ?? "");
        setStep(2);
      }
    }).catch(() => undefined);
  }, [user, listPersonas, navigate]);

  const canNext1 = useMemo(
    () => handleState.available === true && stageName.trim().length >= 2,
    [handleState, stageName],
  );
  const realMePersona = personas.find((p) => p.kind === "real_me");

  async function submitStep1() {
    setBusy(true);
    try {
      const res = await createProfile({ data: { handle, stageName, bio } });
      const list = await listPersonas();
      setPersonas(list.personas);
      const initPublish: Record<string, boolean> = {};
      for (const p of list.personas) initPublish[p.id] = p.kind === "real_me";
      setPublish(initPublish);
      const realMe = list.personas.find((p) => p.kind === "real_me");
      if (realMe) setRealMeDesc(realMe.description ?? "");
      toast.success(res.created ? "Creator profile created" : "Profile loaded");
      setStep(2);
    } catch (e: any) {
      toast.error(e.message ?? "Could not save profile");
    } finally { setBusy(false); }
  }

  async function submitStep2() {
    setBusy(true);
    try {
      if (realMePersona) {
        await updatePersona({ data: { personaId: realMePersona.id, description: realMeDesc } });
      }
      setStep(3);
    } catch (e: any) {
      toast.error(e.message ?? "Could not update persona");
    } finally { setBusy(false); }
  }

  async function submitStep3() {
    if (!consentAgree) return toast.error("Please confirm the consent statement.");
    setBusy(true);
    try {
      const publishIds = Object.entries(publish).filter(([, v]) => v).map(([k]) => k);
      const res = await finish({ data: { publishPersonaIds: publishIds, consentName } });
      toast.success("You're live");
      navigate({ to: "/creators/$handle", params: { handle: res.handle } });
    } catch (e: any) {
      toast.error(e.message ?? "Could not complete onboarding");
    } finally { setBusy(false); }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Creator onboarding · Step {step} of 3
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold">
          {step === 1 ? "Your profile basics" : step === 2 ? "Set up your personas" : "Consent & go live"}
        </h1>

        <div className="mt-4 flex gap-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className={"h-1 flex-1 rounded-full " + (n <= step ? "bg-brand" : "bg-border")} />
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
          {step === 1 && (
            <div className="space-y-5">
              <Field label="Handle" hint="Your public URL: /creators/your-handle">
                <Input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase())}
                  placeholder="yourname"
                  autoComplete="off"
                />
                {handle && (
                  <p className={"mt-1 text-xs " + (handleState.available ? "text-emerald-500" : "text-destructive")}>
                    {handleState.available === true && "Handle is available"}
                    {handleState.available === false && (handleState.reason ?? "Handle is taken")}
                    {handleState.available === undefined && "Checking…"}
                  </p>
                )}
              </Field>
              <Field label="Stage name" hint="Shown across your profile and personas.">
                <Input value={stageName} onChange={(e) => setStageName(e.target.value)} placeholder="Alex Rivera" maxLength={60} />
              </Field>
              <Field label="Short bio" hint="Optional. 1–2 sentences for your public profile.">
                <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={3} />
                <div className="mt-1 text-right text-xs text-muted-foreground">{bio.length}/280</div>
              </Field>
              <div className="flex justify-end">
                <Button disabled={!canNext1 || busy} onClick={submitStep1}>
                  {busy ? "Saving…" : "Continue"}
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                We seeded four default personas for you. Publish the ones you want live now — keep the rest as drafts and finish them from the Persona Studio later.
              </p>
              {realMePersona && (
                <Field label="Real Me description" hint="How fans should think of your human persona.">
                  <Textarea
                    value={realMeDesc}
                    onChange={(e) => setRealMeDesc(e.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="Human-led replies from me and my team."
                  />
                </Field>
              )}
              <div className="space-y-2">
                <Label>Publish now</Label>
                <div className="space-y-2">
                  {personas.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface-elevated p-3 hover:border-brand/40"
                    >
                      <Checkbox
                        checked={!!publish[p.id]}
                        onCheckedChange={(v) => setPublish((s) => ({ ...s, [p.id]: !!v }))}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.display_name}</span>
                          <PersonaBadge kind={p.kind} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{p.disclosure_label}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)} disabled={busy}>Back</Button>
                <Button onClick={submitStep2} disabled={busy}>{busy ? "Saving…" : "Continue"}</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-surface-elevated p-4 text-sm text-muted-foreground">
                By signing, you confirm you are the person represented by these personas, and you consent to Twinly.life hosting official AI personas that clearly disclose themselves as AI to fans. You can revoke consent from your account at any time.
              </div>
              <Field label="Type your legal name to sign" hint="This is recorded in your consent history.">
                <Input value={consentName} onChange={(e) => setConsentName(e.target.value)} placeholder="Your legal name" maxLength={120} />
              </Field>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={consentAgree} onCheckedChange={(v) => setConsentAgree(!!v)} className="mt-0.5" />
                <span>I agree to the Twinly.life creator terms and AI disclosure policy.</span>
              </label>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(2)} disabled={busy}>Back</Button>
                <Button onClick={submitStep3} disabled={busy || !consentAgree || consentName.trim().length < 2}>
                  {busy ? "Finishing…" : "Go live"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}