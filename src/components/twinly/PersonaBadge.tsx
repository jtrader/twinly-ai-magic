import { cn } from "@/lib/utils";

export function PersonaBadge({ kind, className }: { kind: "real_me" | "ai"; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
      kind === "ai"
        ? "border-brand/40 bg-brand/15 text-brand-glow"
        : "border-real/40 bg-real/15 text-real",
      className,
    )}>
      {kind === "ai" ? "AI persona" : "Real Me"}
    </span>
  );
}