import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { requestEscalation, listMyEscalationRequests } from "@/lib/escalation.functions";

export function RequestRealMeButton({
  creatorHandle, personaSlug, priceCents,
}: {
  creatorHandle: string;
  personaSlug: string;
  priceCents?: number;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [checked, setChecked] = useState(false);
  const request = useServerFn(requestEscalation);
  const listMine = useServerFn(listMyEscalationRequests);

  useEffect(() => {
    let alive = true;
    listMine()
      .then((r) => {
        if (!alive) return;
        const stillPending = r.requests.some((req: any) =>
          req.status === "requested" &&
          req.creators?.handle === creatorHandle &&
          req.personas?.slug === personaSlug);
        setPending(stillPending);
      })
      .catch(() => {})
      .finally(() => alive && setChecked(true));
    return () => { alive = false; };
  }, [creatorHandle, personaSlug, listMine]);

  async function submit() {
    setBusy(true);
    try {
      const res = await request({ data: { creatorHandle, personaSlug, message: message.trim() || undefined } });
      setPending(true);
      setOpen(false);
      toast.success(res.alreadyPending ? "You already have a pending request." : "Request sent — the creator will accept or decline it.");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send request");
    } finally {
      setBusy(false);
    }
  }

  if (!checked) return null;

  if (pending) {
    return (
      <Button size="sm" variant="outline" disabled className="gap-1.5">
        <UserCheck className="size-3.5" /> Real Me requested
      </Button>
    );
  }

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <UserCheck className="size-3.5" /> Request Real Me
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request the real creator</DialogTitle>
            <DialogDescription>
              This asks the creator to open a direct Real Me conversation with you — a separate thread from this AI persona chat.
              {typeof priceCents === "number" && priceCents > 0 && ` Direct access is priced at $${(priceCents / 100).toFixed(2)}.`}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3} maxLength={500} placeholder="Optional note to the creator…"
            value={message} onChange={(e) => setMessage(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? "Sending…" : "Send request"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
