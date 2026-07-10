import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Heart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AuthPromptDialog } from "@/components/twinly/AuthPromptDialog";
import { EmbeddedCheckoutDialog } from "@/components/twinly/EmbeddedCheckoutDialog";
import { useSession } from "@/lib/session";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { createTipCheckout } from "@/lib/checkout.functions";
import { useTwinlyPlus } from "@/lib/twinly-plus";

const PRESETS = [300, 500, 1000, 2500];

export function TipButton({ creatorId, creatorName }: { creatorId: string; creatorName: string }) {
  const { user } = useSession();
  const { hasPlus } = useTwinlyPlus();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number>(500);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const startTip = useServerFn(createTipCheckout);

  async function handleStart() {
    if (!isPaymentsConfigured()) { toast.error("Payments not configured yet."); return; }
    const cents = custom ? Math.round(parseFloat(custom) * 100) : amount;
    if (!cents || cents < 100) { toast.error("Minimum tip is $1.00"); return; }
    setBusy(true);
    try {
      const res = await startTip({
        data: {
          creatorId, amountCents: cents,
          returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
          environment: getStripeEnvironment(),
        },
      });
      if ("error" in res) throw new Error(res.error);
      setOpen(false);
      setClientSecret(res.clientSecret);
      setCheckoutOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start tip");
    } finally { setBusy(false); }
  }

  const trigger = (
    <Button size="sm" variant="outline" onClick={() => user && setOpen(true)}>
      <Heart className="mr-1 size-3.5" /> Tip
    </Button>
  );

  return (
    <>
      {user ? trigger : (
        <AuthPromptDialog title="Sign in to tip" description="Create a free account to send tips to your favorite creators.">
          {trigger}
        </AuthPromptDialog>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tip {creatorName}</DialogTitle>
            <DialogDescription>
              100% goes to the creator (minus payment fees).
              {hasPlus && <span className="mt-1 block text-brand-glow">Twinly+ perk: 10% off applied at checkout.</span>}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((c) => (
              <Button key={c} type="button" size="sm"
                variant={amount === c && !custom ? "default" : "outline"}
                onClick={() => { setAmount(c); setCustom(""); }}>
                ${(c / 100).toFixed(0)}
              </Button>
            ))}
          </div>
          <Input inputMode="decimal" placeholder="Custom amount ($1–$500)" value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ""))} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleStart} disabled={busy}>
              {busy && <Loader2 className="mr-1 size-3.5 animate-spin" />}
              {busy ? "Opening…" : "Continue to checkout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <EmbeddedCheckoutDialog open={checkoutOpen}
        onOpenChange={(v) => { setCheckoutOpen(v); if (!v) setClientSecret(null); }}
        clientSecret={clientSecret} title={`Tip ${creatorName}`} />
    </>
  );
}