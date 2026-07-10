import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { flagConversation } from "@/lib/conversation-flags.functions";

type Reason = "off_tone" | "inaccurate" | "uncomfortable" | "wants_human" | "other";

const REASON_OPTIONS: { value: Reason; label: string; hint: string }[] = [
  { value: "off_tone", label: "Off tone / out of character", hint: "The AI didn't sound like the creator." },
  { value: "inaccurate", label: "Inaccurate or misleading", hint: "The reply got facts wrong." },
  { value: "uncomfortable", label: "Made me uncomfortable", hint: "Content felt off or crossed a line." },
  { value: "wants_human", label: "I want to talk to the real creator", hint: "Ask the creator to take over." },
  { value: "other", label: "Something else", hint: "Add a note below." },
];

export function FlagConversationButton({
  conversationId, messageId, variant = "outline", size = "sm", label = "Flag for review", compact = false,
}: {
  conversationId: string | null | undefined;
  messageId?: string;
  variant?: "outline" | "ghost";
  size?: "sm" | "icon";
  label?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>("wants_human");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const flag = useServerFn(flagConversation);

  async function submit() {
    if (!conversationId) {
      toast.error("Send a message first, then you can flag the conversation.");
      return;
    }
    setBusy(true);
    try {
      const res = await flag({ data: { conversationId, messageId, reason, note: note.trim() || undefined } });
      if (res.alreadyPending) {
        toast.message("You already have a pending flag on this.");
      } else {
        toast.success("Sent to the creator for review.", {
          description: "They can respond, hand off to Real Me, or acknowledge.",
        });
      }
      setOpen(false);
      setNote("");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not flag this conversation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground opacity-70 transition hover:opacity-100 hover:text-foreground"
            title="Flag this AI reply for creator review"
          >
            <Flag className="size-3" /> Flag
          </button>
        ) : (
          <Button variant={variant} size={size} className="gap-1">
            <Flag className="size-3.5" /> {size === "icon" ? "" : label}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Flag this AI conversation</DialogTitle>
          <DialogDescription>
            Send this thread to the real creator for review. They can take over the conversation on Real Me if they choose.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Reason
            </Label>
            <RadioGroup value={reason} onValueChange={(v) => setReason(v as Reason)} className="mt-2 space-y-2">
              {REASON_OPTIONS.map((r) => (
                <label
                  key={r.value}
                  htmlFor={`reason-${r.value}`}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-3 hover:border-brand/40"
                >
                  <RadioGroupItem id={`reason-${r.value}`} value={r.value} className="mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold">{r.label}</div>
                    <div className="text-xs text-muted-foreground">{r.hint}</div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="flag-note" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Note (optional)
            </Label>
            <Textarea
              id="flag-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder="Any extra context for the creator…"
              className="mt-2"
              rows={3}
            />
            <div className="mt-1 text-right text-[11px] text-muted-foreground">{note.length}/500</div>
          </div>

          {messageId && (
            <div className="rounded-lg border border-border bg-surface p-2 text-[11px] text-muted-foreground">
              This flag is attached to a specific AI reply.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Sending…" : "Send to creator"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}