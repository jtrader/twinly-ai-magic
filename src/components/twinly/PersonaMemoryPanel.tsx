import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Brain, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMyPersonaMemory, resetMyPersonaMemory } from "@/lib/persona-memory.functions";

export function PersonaMemoryPanel({ personaId }: { personaId: string }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useServerFn(getMyPersonaMemory);
  const reset = useServerFn(resetMyPersonaMemory);

  useEffect(() => {
    let alive = true;
    load({ data: { personaId } })
      .then((r) => { if (alive) setSummary(r.memory?.summary ?? null); })
      .catch(() => {})
      .finally(() => alive && setChecked(true));
    return () => { alive = false; };
  }, [personaId, load]);

  async function doReset() {
    setBusy(true);
    try {
      await reset({ data: { personaId } });
      setSummary(null);
      toast.success("Memory cleared");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not clear memory");
    } finally {
      setBusy(false);
    }
  }

  if (!checked || !summary) return null;

  return (
    <div className="mb-4 rounded-lg border border-border bg-surface/60 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground"
      >
        <Brain className="size-3.5" />
        <span className="flex-1 text-left">What this persona remembers about you</span>
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>
      {open && (
        <div className="border-t border-border/60 px-3 py-2">
          <p className="text-foreground/80">{summary}</p>
          <Button size="sm" variant="ghost" className="mt-2 gap-1 text-destructive hover:text-destructive" disabled={busy} onClick={doReset}>
            <X className="size-3" /> Clear memory
          </Button>
        </div>
      )}
    </div>
  );
}
