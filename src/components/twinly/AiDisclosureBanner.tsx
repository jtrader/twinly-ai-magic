import { Bot, User2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function AiDisclosureBanner({ kind, label, className }: {
  kind: "real_me" | "ai";
  label: string;
  className?: string;
}) {
  const isAi = kind === "ai";
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
      isAi ? "border-brand/30 bg-brand/10 text-brand-foreground" : "border-real/30 bg-real/10 text-foreground",
      className,
    )}>
      {isAi ? <Bot className="size-4 text-brand-glow" /> : <User2 className="size-4 text-real" />}
      <span className="tracking-wide">{label}</span>
      {isAi && (
        <span className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">AI · not a human</span>
      )}
    </div>
  );
}