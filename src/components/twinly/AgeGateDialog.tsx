import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { verifyAge } from "@/lib/age-gate.functions";

const KEY = "twinly.agegate.v1";

export function AgeGateDialog() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verify = useServerFn(verifyAge);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(KEY)) setOpen(true);
  }, []);

  async function confirm() {
    setError(null);
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        // Signed-in: persist self-attestation to profile + audit.
        await verify({ data: { attested: true } });
      }
      localStorage.setItem(KEY, new Date().toISOString());
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
          <DialogTitle className="font-display text-2xl">You must be 18+ to continue</DialogTitle>
          <DialogDescription className="pt-2 text-sm text-muted-foreground">
            Twinly.life is an adult platform. By continuing, you confirm you are at least 18 years old and legally able to view adult material in your jurisdiction.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        <div className="mt-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          Self-attestation for public beta. Production launches will use a certified age-assurance provider.
        </div>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={decline} disabled={busy}>I'm under 18</Button>
          <Button onClick={confirm} disabled={busy}>{busy ? "Checking…" : "I am 18 or older"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}