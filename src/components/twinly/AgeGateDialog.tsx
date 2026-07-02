import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { verifyAge } from "@/lib/age-gate.functions";

const KEY = "twinly.agegate.v1";

export function AgeGateDialog() {
  const [open, setOpen] = useState(false);
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verify = useServerFn(verifyAge);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(KEY)) setOpen(true);
  }, []);

  async function confirm() {
    setError(null);
    if (!dob) {
      setError("Please enter your date of birth.");
      return;
    }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        // Signed-in: persist to profile + audit.
        await verify({ data: { dob } });
      } else {
        // Anon: at least sanity-check age locally.
        const d = new Date(dob);
        const now = new Date();
        let age = now.getFullYear() - d.getFullYear();
        const m = now.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
        if (age < 18) throw new Error("You must be 18 or older to continue.");
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
        <div className="mt-4 space-y-2">
          <Label htmlFor="dob">Date of birth</Label>
          <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
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