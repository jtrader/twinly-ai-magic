import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const KEY = "twinly.agegate.v1";

export function AgeGateDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(KEY)) setOpen(true);
  }, []);

  async function confirm() {
    localStorage.setItem(KEY, new Date().toISOString());
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      await supabase.from("age_gate_events").insert({ user_id: userData.user.id, method: "self_attest" });
    }
    setOpen(false);
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
            Twinly.ai is an adult platform. By continuing, you confirm you are at least 18 years old and legally able to view adult material in your jurisdiction.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          Placeholder self-attestation for MVP. Production launches use a certified age-assurance provider.
        </div>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={decline}>I'm under 18</Button>
          <Button onClick={confirm}>I am 18 or older</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}