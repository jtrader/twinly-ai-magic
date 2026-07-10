import { Bot, User2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * `personaName`, when provided, renders the standardized "Chatting with X ·
 * AI persona / Real Me" line as the primary disclosure — this exact phrasing
 * is a platform invariant, not creator-customizable. `label` (the creator's
 * own disclosure_label text) is always shown too, as supplementary detail.
 */
export function AiDisclosureBanner({ kind, label, personaName, className }: {
  kind: "real_me" | "ai";
  label: string;
  personaName?: string;
  className?: string;
}) {
  const isAi = kind === "ai";
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
      isAi ? "border-ai/30 bg-ai/10 text-foreground" : "border-real/30 bg-real/10 text-foreground",
      className,
    )}>
      {isAi ? <Bot className="size-4 text-ai" /> : <User2 className="size-4 text-real" />}
      <div className="min-w-0">
        {personaName ? (
          <>
            <div className="font-semibold tracking-wide">
              Chatting with {personaName} · {isAi ? "AI persona" : "Real Me"}
            </div>
            <div className="text-[11px] text-muted-foreground">{label}</div>
          </>
        ) : (
          <span className="tracking-wide">{label}</span>
        )}
      </div>
      {isAi && (
        <span className="ml-auto shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">AI · not a human</span>
      )}
    </div>
  );
}