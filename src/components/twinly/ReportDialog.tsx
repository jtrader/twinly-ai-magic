import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { reportSubject } from "@/lib/moderation.functions";

type Target = "creator" | "persona" | "message" | "content_asset" | "conversation";

const CATEGORIES = [
  { value: "impersonation", label: "Impersonation / not the real creator" },
  { value: "minor_safety", label: "Minor safety concern" },
  { value: "non_consensual", label: "Non-consensual content" },
  { value: "harassment", label: "Harassment or abuse" },
  { value: "scam", label: "Scam or fraud" },
  { value: "other", label: "Other" },
];

export function ReportDialog({
  targetType,
  targetId,
  label = "Report",
  size = "sm",
  variant = "ghost",
}: {
  targetType: Target;
  targetId?: string;
  label?: string;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary" | "link";
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(CATEGORIES[0].value);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = useServerFn(reportSubject);

  async function onSubmit() {
    setBusy(true);
    try {
      await submit({ data: { targetType, targetId, category, notes: notes.trim() || undefined } });
      toast.success("Report submitted", { description: "Our safety team will review it." });
      setOpen(false);
      setNotes("");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to submit report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size={size} variant={variant} className="gap-1.5">
          <Flag className="size-3.5" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report {targetType.replace("_", " ")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Reason</Label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Details (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened?" rows={4} />
          </div>
          <p className="text-xs text-muted-foreground">Reports are private. False reports may lead to account action.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={onSubmit} disabled={busy}>{busy ? "Sending..." : "Submit report"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}