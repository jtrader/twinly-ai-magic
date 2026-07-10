import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { getSignedVoiceUrl } from "@/lib/chat.functions";

type Props = {
  conversationId: string;
  path: string;
  transcript?: string | null;
  durationMs?: number | null;
  /** AI-generated voice notes get a distinct waveform tint + icon — the
   * disclosure has to hold even if someone's not reading the text label. */
  isAiGenerated?: boolean;
};

export function VoicePlayer({ conversationId, path, transcript, durationMs, isAiGenerated }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setError(null);
    getSignedVoiceUrl({ data: { conversationId, path } })
      .then((r) => { if (!cancelled) setUrl(r.url); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Playback unavailable"); });
    return () => { cancelled = true; };
  }, [conversationId, path]);

  const mm = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <div
      className={
        "flex flex-col gap-1 rounded-lg p-1.5 " +
        (isAiGenerated ? "border border-ai/30 bg-ai/5" : "")
      }
      data-testid={isAiGenerated ? "ai-voice-player" : undefined}
    >
      {isAiGenerated && (
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-ai">
          <Bot className="size-3" /> AI voice
        </div>
      )}
      {error ? (
        <div className="text-xs text-red-500">{error}</div>
      ) : url ? (
        <audio
          src={url}
          controls
          preload="metadata"
          className={"h-9 w-full max-w-[280px]" + (isAiGenerated ? " accent-ai" : "")}
        />
      ) : (
        <div className="text-xs text-muted-foreground">Loading voice note…</div>
      )}
      {durationMs ? <div className="text-[10px] text-muted-foreground">{mm(durationMs)}</div> : null}
      {transcript ? <div className="text-xs italic text-muted-foreground">“{transcript}”</div> : null}
    </div>
  );
}