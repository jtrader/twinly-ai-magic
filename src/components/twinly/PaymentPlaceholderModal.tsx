import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

export function PaymentPlaceholderModal({ open, onOpenChange, action }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  action: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-brand/15 text-brand-glow">
            <Lock className="size-5" />
          </div>
          <DialogTitle className="font-display">Payments coming soon</DialogTitle>
          <DialogDescription>
            {action} will unlock once billing is enabled. Twinly.ai uses adult-compliant processors — no card is charged during preview.
          </DialogDescription>
        </DialogHeader>
        <Button onClick={() => onOpenChange(false)}>Got it</Button>
      </DialogContent>
    </Dialog>
  );
}