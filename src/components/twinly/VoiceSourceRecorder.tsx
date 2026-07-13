import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { uploadVoiceSourceRecording } from "@/lib/voice-sources.functions";
import { Mic, Square, Upload, RotateCcw } from "lucide-react";

type MicPermission = "idle" | "requesting" | "granted" | "denied";

/** Reads exact duration + sample rate from a browser-decoded audio buffer — no server-side dependency needed for this. */
async function decodeAudioMeta(bytes: ArrayBuffer): Promise<{ durationSeconds: number; sampleRate: number } | null> {
  try {
    const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextCtor();
    const buffer = await ctx.decodeAudioData(bytes.slice(0));
    const meta = { durationSeconds: buffer.duration, sampleRate: buffer.sampleRate };
    ctx.close?.();
    return meta;
  } catch {
    return null;
  }
}

export function VoiceSourceRecorder({
  creatorId,
  personaId,
  onUploaded,
}: {
  creatorId: string;
  personaId: string;
  onUploaded?: () => void;
}) {
  const [permission, setPermission] = useState<MicPermission>("idle");
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const durationRef = useRef<number>(0);

  const upload = useServerFn(uploadVoiceSourceRecording);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close?.();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function meterLoop(analyser: AnalyserNode) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sumSquares += v * v;
      }
      setLevel(Math.sqrt(sumSquares / data.length));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  async function startRecording() {
    setPermission("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setPermission("granted");

      const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
      const audioCtx: AudioContext = new AudioContextCtor();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      meterLoop(analyser);

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        durationRef.current = (Date.now() - startedAtRef.current) / 1000;
        setRecordedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        setLevel(0);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        audioCtxRef.current?.close?.();
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start();
      setRecording(true);
    } catch (e: any) {
      setPermission("denied");
      toast.error(e?.message ?? "Microphone access was denied.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  function reRecord() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setRecordedBlob(null);
    setPermission("idle");
  }

  async function submitBlob(blob: Blob, sourceType: "uploaded" | "recorded_in_app", fallbackDurationSeconds?: number) {
    setBusy(true);
    try {
      const bytes = await blob.arrayBuffer();
      const meta = await decodeAudioMeta(bytes);
      const ext = blob.type.includes("mpeg") ? "mp3" : blob.type.includes("wav") ? "wav" : blob.type.includes("mp4") || blob.type.includes("m4a") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const path = `voice-source/${creatorId}/${personaId}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage.from("voice-messages").upload(path, blob, { contentType: blob.type || undefined, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const res = await upload({
        data: {
          personaId,
          filePath: path,
          sourceType,
          clientDurationSeconds: meta?.durationSeconds ?? fallbackDurationSeconds,
          clientSampleRate: meta?.sampleRate,
        },
      });

      const rec = res.recording as { status?: string; rejection_reason?: string | null } | null | undefined;
      if (rec && rec.status === "rejected") {
        toast.error(`Rejected: ${rec.rejection_reason ?? "Recording did not pass validation."}`);
      } else {
        toast.success("Recording validated and ready for voice cloning");
      }
      reRecord();
      onUploaded?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await submitBlob(file, "uploaded");
    e.target.value = "";
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Add a voice sample</div>

      {previewUrl ? (
        <div className="space-y-2">
          <audio controls src={previewUrl} className="w-full" />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => recordedBlob && submitBlob(recordedBlob, "recorded_in_app", durationRef.current)} disabled={busy}>
              {busy ? "Uploading…" : "Use this recording"}
            </Button>
            <Button size="sm" variant="ghost" onClick={reRecord} disabled={busy}>
              <RotateCcw className="mr-1 size-3.5" /> Re-record
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {recording ? (
            <>
              <Button size="sm" variant="destructive" onClick={stopRecording}>
                <Square className="mr-1 size-3.5" /> Stop
              </Button>
              <div className="h-2 w-32 overflow-hidden rounded-full bg-surface-elevated">
                <div className="h-full bg-brand-glow transition-[width]" style={{ width: `${Math.min(100, level * 300)}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">Recording… speak normally</span>
            </>
          ) : (
            <>
              <Button size="sm" onClick={startRecording} disabled={permission === "requesting"}>
                <Mic className="mr-1 size-3.5" /> {permission === "requesting" ? "Requesting mic…" : "Record"}
              </Button>
              <label>
                <input type="file" accept="audio/wav,audio/mpeg,audio/mp4,.wav,.mp3,.m4a" className="hidden" onChange={onFilePicked} />
                <Button size="sm" variant="outline" asChild>
                  <span><Upload className="mr-1 size-3.5" /> Upload file</span>
                </Button>
              </label>
              {permission === "denied" && (
                <span className="text-xs text-destructive">Microphone access denied — check your browser's site permissions, or upload a file instead.</span>
              )}
            </>
          )}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        30 seconds to 30 minutes, WAV/MP3/M4A or a browser recording. Speak clearly and avoid background noise.
      </p>
    </div>
  );
}
