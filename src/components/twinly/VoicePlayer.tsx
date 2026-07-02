import { useEffect, useState } from "react";
import { getSignedVoiceUrl } from "@/lib/chat.functions";

type Props = {
  conversationId: string;
  path: string;
  transcript?: string | null;
  durationMs?: number | null;
};

export function VoicePlayer({ conversationId, path, transcript, durationMs }: Props) {
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
    <div className="flex flex-col gap-1">
      {error ? (
        <div className="text-xs text-red-500">{error}</div>
      ) : url ? (
        <audio src={url} controls preload="metadata" className="h-9 w-full max-w-[280px]" />
      ) : (
        <div className="text-xs text-muted-foreground">Loading voice note…</div>
      )}
      {durationMs ? <div className="text-[10px] text-muted-foreground">{mm(durationMs)}</div> : null}
      {transcript ? <div className="text-xs italic text-muted-foreground">“{transcript}”</div> : null}
    </div>
  );
}