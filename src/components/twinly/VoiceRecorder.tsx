import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Trash2, Send } from "lucide-react";

type Props = {
  disabled?: boolean;
  maxSeconds?: number;
  onSend: (payload: { blob: Blob; durationMs: number; mimeType: string }) => void | Promise<void>;
};

/** Simple push-to-record voice capture. Uses MediaRecorder. */
export function VoiceRecorder({ disabled, maxSeconds = 60, onSend }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [sending, setSending] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => stopAll(), []);

  function stopAll() {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    try { recorderRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        const b = new Blob(chunksRef.current, { type });
        setBlob(b);
        setDurationMs(Date.now() - startedAtRef.current);
      };
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      setElapsed(0);
      rec.start();
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsed(s);
        if (s >= maxSeconds) stop();
      }, 250);
    } catch (e) {
      console.error(e);
      alert("Microphone access is needed to record.");
    }
  }

  function stop() {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    try { recorderRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
  }

  function discard() {
    setBlob(null);
    setDurationMs(0);
    setElapsed(0);
  }

  async function send() {
    if (!blob) return;
    setSending(true);
    try {
      await onSend({ blob, durationMs, mimeType: blob.type || "audio/webm" });
      discard();
    } finally { setSending(false); }
  }

  const mm = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  if (blob) {
    const url = URL.createObjectURL(blob);
    return (
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-2 py-1">
        <audio src={url} controls className="h-8 max-w-[180px]" />
        <span className="text-[10px] text-muted-foreground">{mm(durationMs)}</span>
        <Button type="button" size="icon" variant="ghost" onClick={discard} disabled={sending} title="Discard">
          <Trash2 className="size-4" />
        </Button>
        <Button type="button" size="icon" onClick={send} disabled={sending} title="Send">
          <Send className="size-4" />
        </Button>
      </div>
    );
  }

  return recording ? (
    <div className="flex items-center gap-2 rounded-full border border-red/40 bg-red/10 px-2 py-1">
      <span className="inline-block size-2 animate-pulse rounded-full bg-red-500" />
      <span className="text-xs tabular-nums">{mm(elapsed * 1000)} / {mm(maxSeconds * 1000)}</span>
      <Button type="button" size="icon" variant="ghost" onClick={stop} title="Stop">
        <Square className="size-4" />
      </Button>
    </div>
  ) : (
    <Button type="button" size="icon" variant="ghost" onClick={start} disabled={disabled} title="Record voice message">
      <Mic className="size-4" />
    </Button>
  );
}