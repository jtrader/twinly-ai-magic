import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { unlockAsset } from "@/lib/fan-feed.functions";

/** Above this price, require an explicit second confirm — protects against
 * accidental taps on higher-priced content. */
const CONFIRM_THRESHOLD_CENTS = 2000;

export function PaywallModal({
  open, onOpenChange, assetId, assetTitle, assetType, priceCents, onUnlocked,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  assetId: string;
  assetTitle: string;
  assetType: string;
  priceCents: number;
  onUnlocked: () => void;
}) {
  const [step, setStep] = useState<"confirm" | "double-confirm" | "receipt">("confirm");
  const [busy, setBusy] = useState(false);
  const [receiptAmount, setReceiptAmount] = useState<number | null>(null);
  const unlock = useServerFn(unlockAsset);

  useEffect(() => {
    if (open) { setStep("confirm"); setBusy(false); setReceiptAmount(null); }
  }, [open]);

  async function doUnlock() {
    setBusy(true);
    try {
      const res = await unlock({ data: { assetId } });
      setReceiptAmount(res.amountCents);
      setStep("receipt");
      onUnlocked();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not unlock");
    } finally {
      setBusy(false);
    }
  }

  function handlePrimary() {
    if (step === "confirm" && priceCents >= CONFIRM_THRESHOLD_CENTS) {
      setStep("double-confirm");
      return;
    }
    doUnlock();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        {step !== "receipt" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Lock className="size-4" /> Unlock {assetTitle}</DialogTitle>
              <DialogDescription>
                {step === "double-confirm"
                  ? "This is a higher-priced item — confirm to continue."
                  : `Unlocks this ${assetType} for you, permanently. It stays in your history — you can revisit it any time.`}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-border bg-surface-elevated p-4 text-center">
              <div className="text-3xl font-bold">${(priceCents / 100).toFixed(2)}</div>
              <div className="mt-1 text-xs text-muted-foreground">one-time unlock</div>
            </div>
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-2.5 text-[11px] text-amber-100">
              <span className="font-semibold">Demo mode.</span> No payment processor is connected yet — unlocking here records intent but doesn't charge a real card.
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={handlePrimary} disabled={busy}>
                {busy ? "Unlocking…" : step === "double-confirm" ? "Yes, unlock — demo" : "Unlock — demo"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-400"><CheckCircle2 className="size-4" /> Unlocked</DialogTitle>
              <DialogDescription>{assetTitle} is now in your history.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Item</span><span className="max-w-[60%] truncate text-right">{assetTitle}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span>${((receiptAmount ?? 0) / 100).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span>Demo — not a real charge</span></div>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
