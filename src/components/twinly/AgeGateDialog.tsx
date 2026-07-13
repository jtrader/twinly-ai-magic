import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { verifyAge } from "@/lib/age-gate.functions";

const KEY = "twinly.agegate.v2";
const LEGAL_VERSION = "2026-07-13";

export function AgeGateDialog() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const verify = useServerFn(verifyAge);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(KEY)) setOpen(true);
  }, []);

  async function confirm() {
    if (!acceptedLegal) {
      setError("Please tick the box to accept the Terms, Privacy Policy, and Acceptable Use policy.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        // Signed-in: persist self-attestation to profile + audit.
        await verify({ data: { attested: true } });
      }
      const accepted = { at: new Date().toISOString(), version: LEGAL_VERSION };
      localStorage.setItem(KEY, JSON.stringify(accepted));
      localStorage.setItem("twinly.legal.accepted", JSON.stringify(accepted));
      setOpen(false);
    } catch (e: any) {
      setError(e?.message ?? "Could not verify age.");
    } finally {
      setBusy(false);
    }
  }

  function decline() {
    window.location.href = "https://www.google.com";
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Age check & legal acceptance</DialogTitle>
          <DialogDescription className="pt-2 text-sm text-muted-foreground">
            Twinly.life is an adult platform. By continuing, you confirm you are at least 18 years old and legally able to view adult material in your jurisdiction.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        <label className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-surface/60 p-3 text-xs text-muted-foreground">
          <Checkbox
            checked={acceptedLegal}
            onCheckedChange={(v) => setAcceptedLegal(v === true)}
            className="mt-0.5"
            aria-label="Accept legal policies"
          />
          <span>
            I am 18+ and I agree to the{" "}
            <a href="/legal/terms" target="_blank" rel="noreferrer" className="underline">Terms</a>,{" "}
            <a href="/legal/privacy" target="_blank" rel="noreferrer" className="underline">Privacy Policy</a>,{" "}
            <a href="/legal/acceptable-use" target="_blank" rel="noreferrer" className="underline">Acceptable Use</a>, and{" "}
            <a href="/legal/ai-disclosure" target="_blank" rel="noreferrer" className="underline">AI Disclosure</a>.
          </span>
        </label>
        <div className="mt-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          Self-attestation for public beta. Production launches will use a certified age-assurance provider.
        </div>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={decline} disabled={busy}>I'm under 18</Button>
          <Button onClick={confirm} disabled={busy || !acceptedLegal}>{busy ? "Checking…" : "I'm 18+ and I accept"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}