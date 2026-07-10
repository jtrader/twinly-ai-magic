import { Bot, User2 } from "lucide-react";

/**
 * Per-message AI/Real-Me marker. Driven entirely by the server-set
 * `senderType` ("ai" | "creator" | "system" | "fan") — never a client
 * toggle, and not customizable per persona. This is the platform-wide
 * disclosure invariant: any AI-generated message renders with this tag.
 */
export function MessageDisclosureTag({
  senderType, personaName,
}: {
  senderType: "fan" | "ai" | "creator" | "system" | string;
  personaName: string;
}) {
  if (senderType === "ai") {
    return (
      <span
        data-testid="ai-disclosure-tag"
        className="mb-1 inline-flex items-center gap-1 rounded-full border border-ai/40 bg-ai/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ai"
      >
        <Bot className="size-3" /> {personaName} · AI
      </span>
    );
  }
  if (senderType === "system") {
    return (
      <span className="mb-1 inline-block text-[10px] font-bold uppercase tracking-widest text-amber-300">
        Away auto-reply
      </span>
    );
  }
  if (senderType === "creator") {
    return (
      <span
        data-testid="real-me-disclosure-tag"
        className="mb-1 inline-flex items-center gap-1 rounded-full border border-real/40 bg-real/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-real"
      >
        <User2 className="size-3" /> {personaName}
      </span>
    );
  }
  return null;
}
