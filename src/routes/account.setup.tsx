import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, User as UserIcon, Loader2, CreditCard, Wallet, Check, Trash2, ExternalLink } from "lucide-react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { useAvatarUrl } from "@/lib/useAvatarUrl";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { createBillingPortal, createSetupIntentCheckout } from "@/lib/checkout.functions";
import { getStripe, getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";

export const Route = createFileRoute("/account/setup")({ component: AccountSetupPage });

const TOTAL_STEPS = 4;

function AccountSetupPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const load = useServerFn(getMyProfile);
  const save = useServerFn(updateMyProfile);

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarUrl = useAvatarUrl(avatarPath);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("card") === "saved") {
      toast.success("Card saved. You're all set for one-tap purchases.");
      setStep(4);
      params.delete("card");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    load().then((r) => {
      const p = r.profile;
      if (p) {
        setAvatarPath(p.avatar_url ?? null);
        setDisplayName(p.display_name ?? "");
        setFullName(p.full_name ?? "");
        setBio(p.bio ?? "");
        setCountry(p.country ?? "");
      }
      setHydrated(true);
    }).catch(() => setHydrated(true));
  }, [user, load]);

  async function handleAvatarPick(file: File) {
    if (!user) return;
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      toast.error("Please choose a PNG, JPG, WebP or GIF image");
      return;
    }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true, cacheControl: "3600", contentType: file.type,
      });
      if (error) throw error;
      await save({ data: { avatar_url: path } });
      setAvatarPath(path);
      toast.success("Profile picture updated");
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally { setBusy(false); }
  }

  async function handleAvatarRemove() {
    if (!user || !avatarPath) return;
    setBusy(true);
    try {
      await save({ data: { avatar_url: null } });
      // Best-effort delete of the storage object; ignore errors.
      supabase.storage.from("avatars").remove([avatarPath]).catch(() => {});
      setAvatarPath(null);
      if (fileRef.current) fileRef.current.value = "";
      toast.success("Avatar removed");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not remove");
    } finally { setBusy(false); }
  }

  async function persistCurrentStep() {
    setBusy(true);
    try {
      if (step === 2) {
        if (!displayName.trim()) { toast.error("Display name is required"); return false; }
        await save({ data: { display_name: displayName.trim(), full_name: fullName.trim() || null } });
      } else if (step === 3) {
        await save({ data: { bio: bio.trim() || null, country: country.trim() || null } });
      }
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
      return false;
    } finally { setBusy(false); }
  }

  // Per-step gating for the "Continue" button.
  const canContinue = (() => {
    if (step === 1) return !!avatarPath;
    if (step === 2) return displayName.trim().length >= 2;
    if (step === 3) return true;
    return true;
  })();

  async function goNext() {
    const ok = await persistCurrentStep();
    if (!ok) return;
    setStep((s) => Math.min(TOTAL_STEPS, s + 1) as any);
  }

  async function finish() {
    setBusy(true);
    try {
      await save({ data: { markComplete: true } });
      toast.success("Profile complete");
      navigate({ to: "/account" });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally { setBusy(false); }
  }

  if (loading || !hydrated) {
    return <AppShell><div className="mx-auto max-w-xl py-16 text-center text-muted-foreground"><Loader2 className="mx-auto size-6 animate-spin" /></div></AppShell>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Welcome · Step {step} of {TOTAL_STEPS}
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold">
          {step === 1 && "Add a profile picture"}
          {step === 2 && "What should we call you?"}
          {step === 3 && "Tell us a bit about you"}
          {step === 4 && "Payment method"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {step === 1 && "Help others recognise you. You can change this anytime."}
          {step === 2 && "Your display name is public. Your real name stays private."}
          {step === 3 && "A short bio and country help creators know their audience."}
          {step === 4 && "Add a card now to subscribe or tip in one tap. You can skip this."}
        </p>

        <div className="mt-4 flex gap-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className={"h-1 flex-1 rounded-full " + (i < step ? "bg-brand" : "bg-border")} />
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
          {step === 1 && (
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="group relative flex size-32 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border bg-surface-elevated"
                aria-label={avatarPath ? "Change profile picture" : "Upload profile picture"}
              >
                {avatarUrl
                  ? <img src={avatarUrl} alt="Your avatar" className="size-full object-cover" />
                  : <UserIcon className="size-12 text-muted-foreground" />}
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera className="size-6 text-white" />
                </div>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarPick(f); }}
              />
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                  {busy ? "Uploading…" : avatarPath ? "Change picture" : "Upload picture"}
                </Button>
                {avatarPath && (
                  <Button variant="ghost" size="sm" onClick={handleAvatarRemove} disabled={busy}>
                    <Trash2 className="mr-1.5 size-4" /> Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG, WebP or GIF · max 5 MB</p>
              {!avatarPath && (
                <p className="text-xs text-muted-foreground">A profile picture is required to continue.</p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Field label="Display name *" hint="Public. This is what everyone sees. At least 2 characters.">
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} placeholder="e.g. Alex" />
                {displayName.trim().length > 0 && displayName.trim().length < 2 && (
                  <p className="mt-1 text-xs text-destructive">Display name must be at least 2 characters.</p>
                )}
              </Field>
              <Field label="Real name" hint="Private. Only visible to you and used for payments.">
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} placeholder="e.g. Alex Rivera" />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <Field label="Bio" hint="Optional. Up to 500 characters.">
                <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={4} placeholder="Say something about yourself…" />
                <div className="mt-1 text-right text-xs text-muted-foreground">{bio.length}/500</div>
              </Field>
              <Field label="Country" hint="Optional.">
                <Input value={country} onChange={(e) => setCountry(e.target.value)} maxLength={60} placeholder="e.g. Australia" />
              </Field>
            </div>
          )}

          {step === 4 && <PaymentStep />}

          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1) as any)} disabled={busy || step === 1}>
              Back
            </Button>
            {step < TOTAL_STEPS ? (
              <Button onClick={goNext} disabled={busy || !canContinue}>{busy ? "Saving…" : "Continue"}</Button>
            ) : (
              <Button onClick={finish} disabled={busy}><Check className="mr-2 size-4" />{busy ? "Saving…" : "Finish"}</Button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-sm font-medium">{label}</Label>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function PaymentStep() {
  const openPortal = useServerFn(createBillingPortal);
  const startSetup = useServerFn(createSetupIntentCheckout);
  const [busy, setBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const configured = isPaymentsConfigured();

  async function handleAddCard() {
    if (!configured) { toast.error("Payments not configured yet"); return; }
    setBusy(true);
    try {
      const returnUrl = `${window.location.origin}/account/setup?card=saved`;
      const res = await startSetup({ data: { returnUrl, environment: getStripeEnvironment() } });
      if ("error" in res) throw new Error(res.error);
      if (!res.clientSecret) throw new Error("Stripe did not return a client secret");
      setClientSecret(res.clientSecret);
      setOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open card entry");
    } finally { setBusy(false); }
  }

  async function handlePortal() {
    if (!configured) { toast.error("Payments not configured yet"); return; }
    setPortalBusy(true);
    try {
      const res = await openPortal({ data: { returnUrl: window.location.href, environment: getStripeEnvironment() } });
      if ("error" in res) throw new Error(res.error);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open billing portal");
    } finally { setPortalBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-elevated p-4">
        <CreditCard className="mt-0.5 size-5 text-brand-glow" />
        <div className="flex-1 text-sm">
          <div className="font-medium">Save a card for one-tap purchases</div>
          <p className="mt-1 text-muted-foreground">
            We'll create your billing account with Stripe and save your card securely.
            No charge is made now — your card is only used when you subscribe or tip.
            Skipping is fine; you can add one later from your Account.
          </p>
        </div>
      </div>
      <Button onClick={handleAddCard} disabled={busy || !configured} className="w-full">
        <Wallet className="mr-2 size-4" />
        {busy ? "Preparing…" : "Add payment method"}
      </Button>
      <Button variant="ghost" onClick={handlePortal} disabled={portalBusy || !configured} className="w-full">
        <ExternalLink className="mr-2 size-4" />
        {portalBusy ? "Opening…" : "Manage existing cards in Stripe portal"}
      </Button>
      {!configured && (
        <p className="text-xs text-muted-foreground">
          Payments are not configured in this environment yet. You can still finish setup.
        </p>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setClientSecret(null); }}>
        <DialogContent className="max-w-lg overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Add payment method</DialogTitle>
          </DialogHeader>
          <div className="max-h-[75vh] overflow-y-auto p-4">
            {clientSecret && (
              <EmbeddedCheckoutProvider stripe={getStripe()} options={{ clientSecret }}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}