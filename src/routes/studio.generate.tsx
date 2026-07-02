import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { Wand2, ImageIcon, Mic, Video, Save, Loader2, RefreshCw, X, AlertTriangle, Clock, CheckCircle2, ShieldCheck, Download, ExternalLink, Copy, Square, Play, Pause, RotateCcw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/session";
import {
  listGenerateTargets, saveGeneratedImage, generateVoiceNote, queueTalkingHead,
  listTalkingHeadJobs,
} from "@/lib/ai-generate.functions";

export const Route = createFileRoute("/studio/generate")({
  component: GeneratePage,
  head: () => ({
    meta: [
      { title: "AI generate — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Persona = { id: string; display_name: string; slug: string; kind: string };
type Pack = { id: string; name: string; pack_type: string; status: string };

const VOICES = [
  { id: "alloy", label: "Alloy — balanced" },
  { id: "verse", label: "Verse — warm" },
  { id: "coral", label: "Coral — expressive" },
  { id: "ash", label: "Ash — deep" },
  { id: "sage", label: "Sage — smooth" },
];
const VOICE_IDS = new Set(VOICES.map((v) => v.id));

/* ----------------- Preview helpers ----------------- */

function slugify(s: string) {
  return (s || "generation").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "generation";
}
function timestampStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ----------------- Shared error model ----------------- */

type GenError = {
  code: "validation" | "moderation" | "rate_limit" | "credits" | "network" | "stream_incomplete" | "server";
  title: string;
  detail: string;
  retryable: boolean;
};

function classifyError(e: unknown, kind: "image" | "voice" | "video"): GenError {
  const raw = e instanceof Error ? e : new Error(typeof e === "string" ? e : "Unknown error");
  const msg = raw.message ?? "";
  const lower = msg.toLowerCase();

  // Explicit tagged errors we throw ourselves
  if ((raw as any).__code) {
    const code = (raw as any).__code as GenError["code"];
    return buildFromCode(code, msg, kind);
  }

  // HTTP-style prefixes we throw from fetch paths: "HTTP 429: ..." or "Generation failed: 402 ..."
  const statusMatch = msg.match(/\b(4\d{2}|5\d{2})\b/);
  const status = statusMatch ? Number(statusMatch[1]) : null;

  if (lower.includes("content_policy") || lower.includes("moderation") || lower.includes("safety")) {
    return {
      code: "moderation",
      title: "Prompt blocked by safety filters",
      detail: "Rephrase the prompt without named public figures, copyrighted characters, or explicit terms and try again.",
      retryable: false,
    };
  }
  if (status === 429 || lower.includes("rate limit")) {
    return { code: "rate_limit", title: "Too many requests", detail: "You're going faster than the model can keep up. Wait a few seconds and retry.", retryable: true };
  }
  if (status === 402 || lower.includes("credit") || lower.includes("quota") || lower.includes("insufficient")) {
    return { code: "credits", title: "Out of AI credits", detail: "Your workspace has run out of AI credits. Top up from workspace billing, then retry.", retryable: false };
  }
  if (lower.includes("networkerror") || lower.includes("failed to fetch") || lower.includes("aborterror") || lower.includes("network")) {
    return { code: "network", title: "Network issue", detail: "The request didn't reach the server. Check your connection and retry.", retryable: true };
  }
  if (lower.includes("stream ended")) {
    return { code: "stream_incomplete", title: "Stream ended early", detail: "The image finished streaming without a completed frame. This is usually transient — retry.", retryable: true };
  }
  if (status && status >= 500) {
    return { code: "server", title: "Server error", detail: `Upstream returned ${status}. Try again in a moment.`, retryable: true };
  }
  return { code: "server", title: labelFor(kind) + " failed", detail: msg || "Something went wrong. Retry, or adjust the prompt.", retryable: true };
}

function buildFromCode(code: GenError["code"], msg: string, kind: "image" | "voice" | "video"): GenError {
  if (code === "validation") return { code, title: "Fix these details", detail: msg, retryable: false };
  return classifyError(new Error(msg), kind);
}

function labelFor(kind: "image" | "voice" | "video") {
  return kind === "image" ? "Image generation" : kind === "voice" ? "Voice generation" : "Talking-head queue";
}

function ErrorCard({ error, onRetry, onDismiss }: { error: GenError; onRetry?: () => void; onDismiss: () => void }) {
  return (
    <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-rose-100">{error.title}</div>
          <div className="mt-0.5 text-rose-200/90">{error.detail}</div>
          <div className="mt-2 flex gap-2">
            {error.retryable && onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry} className="h-7 border-rose-300/40 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20">
                <RefreshCw className="mr-1 size-3.5" /> Retry
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onDismiss} className="h-7 text-rose-200 hover:bg-rose-400/10">
              <X className="mr-1 size-3.5" /> Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="mt-1 text-[11px] text-rose-300">{msg}</div>;
}

function validationError(msg: string): Error {
  const e = new Error(msg);
  (e as any).__code = "validation";
  return e;
}

function useLastAttempt<T>() {
  return useRef<T | null>(null);
}

function GeneratePage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [personaId, setPersonaId] = useState<string>("");
  const [packId, setPackId] = useState<string>("");
  const [tab, setTab] = useState<"image" | "voice" | "video">("image");

  const load = useServerFn(listGenerateTargets);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const refresh = useCallback(async () => {
    try {
      const res = await load();
      setPersonas(res.personas as Persona[]);
      setPacks(res.packs as Pack[]);
      setReady(true);
    } catch (e: any) {
      if (String(e?.message ?? "").includes("Create your creator")) {
        navigate({ to: "/onboarding" });
        return;
      }
      toast.error(e.message ?? "Could not load studio");
      setReady(true);
    }
  }, [load, navigate]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  if (loading || !ready) {
    return <AppShell><div className="text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  const targetProps = { personas, packs, personaId, setPersonaId, packId, setPackId };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <Wand2 className="size-3.5" /> AI generate
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold">Generate synthetic assets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything you generate is auto-labeled <strong>AI-generated</strong> and lands in your vault as
          <em> pending review</em>. Nothing goes live to fans until you approve it.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-4">
          <TargetPicker {...targetProps} />
        </div>

        <div className="mt-4 flex gap-1 border-b border-border">
          {([
            ["image", "Images", <ImageIcon className="size-3.5" />],
            ["voice", "Voice notes", <Mic className="size-3.5" />],
            ["video", "Talking head", <Video className="size-3.5" />],
          ] as const).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id as any)}
              className={"flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-widest " + (tab === id ? "border-b-2 border-brand text-foreground" : "text-muted-foreground")}
            >{icon} {label}</button>
          ))}
        </div>

        <div className="mt-4">
          {tab === "image" && <ImageTab personaId={personaId} packId={packId} />}
          {tab === "voice" && <VoiceTab personaId={personaId} packId={packId} />}
          {tab === "video" && <VideoTab personaId={personaId} packId={packId} />}
        </div>

        <div className="mt-6 rounded-lg border border-border bg-surface/60 p-3 text-xs text-muted-foreground">
          Manage results in the{" "}
          <Link to="/studio/content" className="text-brand-glow hover:underline">content vault</Link>{" "}
          or attach them via the{" "}
          <Link to="/studio/packs" className="text-brand-glow hover:underline">pack studio</Link>.
        </div>
      </div>
    </AppShell>
  );
}

function TargetPicker({
  personas, packs, personaId, setPersonaId, packId, setPackId,
}: {
  personas: Persona[]; packs: Pack[];
  personaId: string; setPersonaId: (v: string) => void;
  packId: string; setPackId: (v: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <Label className="text-xs">Attach to persona (optional)</Label>
        <Select value={personaId || "__none"} onValueChange={(v) => setPersonaId(v === "__none" ? "" : v)}>
          <SelectTrigger className="mt-1.5"><SelectValue placeholder="No persona" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">No persona</SelectItem>
            {personas.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Add to pack (optional)</Label>
        <Select value={packId || "__none"} onValueChange={(v) => setPackId(v === "__none" ? "" : v)}>
          <SelectTrigger className="mt-1.5"><SelectValue placeholder="No pack" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">No pack</SelectItem>
            {packs.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name} · {p.status}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/* ----------------- IMAGES ----------------- */

function ImageTab({ personaId, packId }: { personaId: string; packId: string }) {
  const save = useServerFn(saveGeneratedImage);
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [b64, setB64] = useState<string | null>(null);
  const [isFinal, setIsFinal] = useState(false);
  const [error, setError] = useState<GenError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastAttempt = useLastAttempt<{ prompt: string }>();

  const promptTrim = prompt.trim();
  const promptError =
    prompt.length === 0 ? null
    : promptTrim.length < 8 ? "Prompts need at least 8 characters so the model has something to work with."
    : prompt.length > 2000 ? `Prompt is ${prompt.length}/2000 — shorten it.`
    : null;
  const titleError = title.length > 120 ? `Title is ${title.length}/120.` : null;
  const canGenerate = !busy && !saving && promptTrim.length >= 8 && !promptError && !titleError;

  async function runGenerate(p: string) {
    setBusy(true); setError(null); setDataUrl(null); setB64(null); setIsFinal(false);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      });
      if (!res.ok || !res.body) throw new Error(`Generation failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
      await parseImageSSE(res.body, (frame, final, err) => {
        if (err) { setError(classifyError(new Error(err), "image")); return; }
        flushSync(() => {
          if (frame) {
            setDataUrl(`data:image/png;base64,${frame}`);
            setB64(frame);
          }
          setIsFinal(final);
        });
      });
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(classifyError(e, "image"));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function generate() {
    if (promptError) { setError(classifyError(validationError(promptError), "image")); return; }
    if (promptTrim.length < 8) { setError(classifyError(validationError("Prompts need at least 8 characters."), "image")); return; }
    lastAttempt.current = { prompt: promptTrim };
    await runGenerate(promptTrim);
  }
  async function retry() {
    if (!lastAttempt.current) return;
    await runGenerate(lastAttempt.current.prompt);
  }

  async function onSave() {
    if (!b64) return;
    setSaving(true);
    try {
      await save({ data: {
        title: title.trim() || `AI image — ${new Date().toISOString().slice(0,10)}`,
        base64: b64, prompt,
        personaId: personaId || undefined,
        packId: packId || undefined,
      }});
      toast.success("Saved to vault — pending your approval.");
      setDataUrl(null); setB64(null); setIsFinal(false); setPrompt(""); setTitle("");
    } catch (e: any) {
      toast.error(e.message ?? "Could not save image");
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Prompt</Label>
        <Textarea className="mt-1.5" rows={3} maxLength={2000} value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A cinematic close-up portrait, warm rim light, film grain…" />
        <FieldError msg={promptError} />
      </div>
      <div>
        <Label>Title (optional)</Label>
        <Input className="mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        <FieldError msg={titleError} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={generate} disabled={!canGenerate} title={!canGenerate ? (promptError ?? titleError ?? "Add a prompt to generate.") : undefined}>
          {busy ? <><Loader2 className="mr-1 size-4 animate-spin" /> Generating…</> : <>Generate</>}
        </Button>
        {busy && (
          <Button variant="outline" onClick={() => abortRef.current?.abort()}>
            <Square className="mr-1 size-4" /> Stop
          </Button>
        )}
        {dataUrl && b64 && !error && (
          <Button variant="outline" onClick={onSave} disabled={saving || busy || !isFinal}>
            {saving ? <><Loader2 className="mr-1 size-4 animate-spin" /> Saving…</> : <><Save className="mr-1 size-4" /> Save to vault</>}
          </Button>
        )}
      </div>
      {error && <ErrorCard error={error} onRetry={lastAttempt.current ? retry : undefined} onDismiss={() => setError(null)} />}
      {dataUrl && (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-elevated">
          <img
            src={dataUrl}
            alt="AI preview"
            className={"h-auto w-full object-contain transition-[filter] duration-300 " + (isFinal ? "blur-0" : "blur-2xl")}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 p-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Badge variant="outline" className="text-[10px] uppercase">AI-generated</Badge>
              {!isFinal ? <span>Preview frame · streaming…</span> : <span>Final frame ready.</span>}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <Button size="sm" variant="ghost" disabled={busy || !lastAttempt.current} onClick={retry} title="Re-stream with the same prompt">
                <RefreshCw className="mr-1 size-3.5" /> Re-stream
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { const u = dataUrl; setDataUrl(null); requestAnimationFrame(() => setDataUrl(u)); }} title="Reload the preview image">
                <RotateCcw className="mr-1 size-3.5" /> Reload
              </Button>
              <Button size="sm" variant="ghost" onClick={() => window.open(dataUrl, "_blank", "noopener")} title="Open full size in a new tab">
                <ExternalLink className="mr-1 size-3.5" /> Open
              </Button>
              <Button size="sm" variant="ghost" disabled={!isFinal || !b64} onClick={() => triggerDownload(dataUrl, `${slugify(title || prompt)}-${timestampStamp()}.png`)} title={isFinal ? "Download PNG" : "Available once the final frame arrives"}>
                <Download className="mr-1 size-3.5" /> Download
              </Button>
              <Button size="sm" variant="ghost" disabled={!prompt} onClick={async () => { try { await navigator.clipboard.writeText(prompt); toast.success("Prompt copied"); } catch { toast.error("Could not copy"); } }} title="Copy prompt">
                <Copy className="mr-1 size-3.5" /> Copy prompt
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Minimal SSE parser for the image gateway (no external dep). */
async function parseImageSSE(
  body: ReadableStream<Uint8Array>,
  onFrame: (b64: string | null, isFinal: boolean, error: string | null) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let sawCompleted = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // Split complete SSE events on blank line
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let event = "message";
        const dataLines: string[] = [];
        for (const line of raw.split(/\r?\n/)) {
          if (line.startsWith(":")) continue;
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
        const data = dataLines.join("\n");
        if (!data || data === "[DONE]") continue;
        let payload: any;
        try { payload = JSON.parse(data); } catch { continue; }
        const type = payload?.type ?? event;
        if (event === "error" || type === "error") {
          onFrame(null, false, payload?.error?.message ?? "Image generation failed");
          return;
        }
        if (type === "image_generation.partial_image" || type === "image_generation.completed") {
          const final = type === "image_generation.completed";
          if (final) sawCompleted = true;
          onFrame(payload.b64_json ?? null, final, null);
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  if (!sawCompleted) onFrame(null, false, "Stream ended without a completed image.");
}

/* ----------------- VOICE ----------------- */

function VoiceTab({ personaId, packId }: { personaId: string; packId: string }) {
  const gen = useServerFn(generateVoiceNote);
  const [script, setScript] = useState("");
  const [title, setTitle] = useState("");
  const [voice, setVoice] = useState("alloy");
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<GenError | null>(null);
  const lastAttempt = useLastAttempt<{ script: string; title: string; voice: string }>();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioReloadKey, setAudioReloadKey] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const scriptTrim = script.trim();
  const scriptError =
    script.length === 0 ? null
    : scriptTrim.length < 4 ? "Add a sentence or two — 4+ characters."
    : script.length > 4000 ? `Script is ${script.length}/4000 — shorten it.`
    : null;
  const titleError = title.length > 120 ? `Title is ${title.length}/120.` : null;
  const voiceError = VOICE_IDS.has(voice) ? null : "Pick a voice from the list.";
  const canGenerate = !busy && scriptTrim.length >= 4 && !scriptError && !titleError && !voiceError;

  async function runGenerate(payload: { script: string; title: string; voice: string }) {
    setBusy(true); setError(null); setPreviewUrl(null);
    try {
      const res = await gen({ data: {
        prompt: payload.script, title: payload.title, voice: payload.voice,
        personaId: personaId || undefined,
        packId: packId || undefined,
      }});
      setPreviewUrl(res.previewUrl ?? null);
      setDuration(null); setIsPlaying(false); setAudioReloadKey((k) => k + 1);
      toast.success("Voice note saved — pending your approval.");
    } catch (e: any) {
      setError(classifyError(e, "voice"));
    } finally { setBusy(false); }
  }

  async function generate() {
    const firstError = scriptError ?? voiceError ?? titleError;
    if (firstError) { setError(classifyError(validationError(firstError), "voice")); return; }
    const payload = { script: scriptTrim, title, voice };
    lastAttempt.current = payload;
    await runGenerate(payload);
  }
  async function retry() { if (lastAttempt.current) await runGenerate(lastAttempt.current); }

  return (
    <div className="space-y-4">
      <div>
        <Label>Script</Label>
        <Textarea className="mt-1.5" rows={4} maxLength={4000} value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Hey — thanks for subscribing. I recorded this quick voice note just for you…" />
        <div className={"mt-1 text-[11px] " + (script.length > 4000 ? "text-rose-300" : "text-muted-foreground")}>{script.length}/4000 characters</div>
        <FieldError msg={scriptError} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Voice</Label>
          <Select value={voice} onValueChange={setVoice}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VOICES.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldError msg={voiceError} />
        </div>
        <div>
          <Label>Title (optional)</Label>
          <Input className="mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          <FieldError msg={titleError} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={generate} disabled={!canGenerate} title={!canGenerate ? (scriptError ?? voiceError ?? titleError ?? "Add a script to generate.") : undefined}>
          {busy ? <><Loader2 className="mr-1 size-4 animate-spin" /> Generating…</> : <>Generate voice note</>}
        </Button>
      </div>
      {error && <ErrorCard error={error} onRetry={lastAttempt.current ? retry : undefined} onDismiss={() => setError(null)} />}
      {previewUrl && (() => {
        const voiceLabel = VOICES.find((v) => v.id === voice)?.label ?? voice;
        const durLabel = duration != null && Number.isFinite(duration)
          ? `${Math.floor(duration / 60)}:${String(Math.round(duration % 60)).padStart(2, "0")}`
          : "—";
        const playbackSrc = previewUrl + (previewUrl.includes("?") ? "&" : "?") + "r=" + audioReloadKey;
        const downloadName = `${slugify(title || "voice-note")}-${voice}-${timestampStamp()}.mp3`;
        return (
          <div className="rounded-2xl border border-border bg-surface-elevated p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] uppercase">AI-generated</Badge>
                <span className="text-xs text-muted-foreground">{voiceLabel} · {durLabel}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">Signed URL (1h) — Reload if playback fails.</span>
            </div>
            <audio
              key={audioReloadKey}
              ref={audioRef}
              controls
              src={playbackSrc}
              className="w-full"
              onLoadedMetadata={(e) => setDuration((e.currentTarget as HTMLAudioElement).duration)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => {
                const a = audioRef.current; if (!a) return;
                if (a.paused) a.play().catch(() => {}); else a.pause();
              }}>
                {isPlaying ? <><Pause className="mr-1 size-3.5" /> Pause</> : <><Play className="mr-1 size-3.5" /> Play</>}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => {
                const a = audioRef.current; if (!a) return;
                a.currentTime = 0; a.play().catch(() => {});
              }}>
                <RotateCcw className="mr-1 size-3.5" /> Restart
              </Button>
              <Button size="sm" variant="ghost" disabled={busy || !lastAttempt.current} onClick={retry} title="Re-generate with the same script and voice">
                <RefreshCw className="mr-1 size-3.5" /> Re-generate
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAudioReloadKey((k) => k + 1)} title="Reload the player (re-fetch signed URL)">
                <RotateCcw className="mr-1 size-3.5" /> Reload
              </Button>
              <Button size="sm" variant="ghost" onClick={() => window.open(previewUrl, "_blank", "noopener")} title="Open in a new tab">
                <ExternalLink className="mr-1 size-3.5" /> Open
              </Button>
              <Button size="sm" variant="ghost" onClick={() => triggerDownload(previewUrl, downloadName)} title="Download MP3">
                <Download className="mr-1 size-3.5" /> Download
              </Button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ----------------- TALKING HEAD ----------------- */

function VideoTab({ personaId, packId }: { personaId: string; packId: string }) {
  const queue = useServerFn(queueTalkingHead);
  const listJobs = useServerFn(listTalkingHeadJobs);
  const qc = useQueryClient();
  const [script, setScript] = useState("");
  const [title, setTitle] = useState("");
  const [seconds, setSeconds] = useState<string>("15");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<GenError | null>(null);
  const lastAttempt = useLastAttempt<{ script: string; title: string; seconds: number }>();

  type Job = {
    id: string;
    title: string;
    created_at: string;
    status: "queued" | "rendering" | "completed" | "approved" | "failed";
    provider?: string | null;
    provider_status?: string | null;
    provider_error?: string | null;
    render_started_at?: string | null;
  };
  const jobsQuery = useQuery({
    queryKey: ["talking-head-jobs"],
    queryFn: async () => (await listJobs()) as { jobs: Job[] },
    refetchInterval: (q) => {
      const jobs = q.state.data?.jobs ?? [];
      return jobs.some((j) => j.status === "queued" || j.status === "rendering") ? 4000 : false;
    },
    refetchOnWindowFocus: true,
  });
  const jobs = jobsQuery.data?.jobs ?? [];
  const isLive = jobs.some((j) => j.status === "queued" || j.status === "rendering");

  const scriptTrim = script.trim();
  const secondsNum = Number(seconds) || 0;
  const scriptError =
    script.length === 0 ? null
    : scriptTrim.length < 10 ? "Talking-head scripts need at least 10 characters."
    : script.length > 1000 ? `Script is ${script.length}/1000 — shorten it.`
    : null;
  const titleError = title.length > 120 ? `Title is ${title.length}/120.` : null;
  const durationError = secondsNum < 5 || secondsNum > 60 ? "Pick a duration between 5 and 60 seconds." : null;
  const canSubmit = !busy && scriptTrim.length >= 10 && !scriptError && !titleError && !durationError;

  async function runSubmit(payload: { script: string; title: string; seconds: number }) {
    setBusy(true); setError(null);
    try {
      await queue({ data: {
        script: payload.script, title: payload.title,
        durationSeconds: payload.seconds,
        personaId: personaId || undefined,
        packId: packId || undefined,
      }});
      toast.success("Talking-head clip queued. You'll be notified when the render is ready.");
      setScript(""); setTitle("");
      lastAttempt.current = null;
      qc.invalidateQueries({ queryKey: ["talking-head-jobs"] });
    } catch (e: any) {
      setError(classifyError(e, "video"));
    } finally { setBusy(false); }
  }

  async function submit() {
    const firstError = scriptError ?? durationError ?? titleError;
    if (firstError) { setError(classifyError(validationError(firstError), "video")); return; }
    const payload = { script: scriptTrim, title, seconds: secondsNum };
    lastAttempt.current = payload;
    await runSubmit(payload);
  }
  async function retry() { if (lastAttempt.current) await runSubmit(lastAttempt.current); }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-brand/30 bg-brand/5 p-3 text-xs text-muted-foreground">
        <div className="mb-1 font-semibold text-foreground">Powered by HeyGen</div>
        Submissions render on HeyGen. Set your persona's <em>Avatar ID</em> in the Persona editor → <strong>Twin</strong> tab.
        Add this webhook in HeyGen → <strong>Webhooks</strong> so completed renders land back in your vault:
        <code className="mt-1 block break-all rounded bg-background/60 px-2 py-1 text-[10px] text-foreground">https://twinly.life/api/public/hooks/heygen</code>
        Signing secret env: <code className="text-[10px]">HEYGEN_WEBHOOK_SECRET</code>.
      </div>
      <div>
        <Label>Script (what the persona says)</Label>
        <Textarea className="mt-1.5" rows={4} maxLength={1000} value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Hi babe, welcome to my world. I've got something special for you tonight…" />
        <div className={"mt-1 text-[11px] " + (script.length > 1000 ? "text-rose-300" : "text-muted-foreground")}>{script.length}/1000 characters</div>
        <FieldError msg={scriptError} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Duration</Label>
          <Select value={seconds} onValueChange={setSeconds}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 seconds</SelectItem>
              <SelectItem value="10">10 seconds</SelectItem>
              <SelectItem value="15">15 seconds</SelectItem>
              <SelectItem value="30">30 seconds</SelectItem>
              <SelectItem value="60">60 seconds</SelectItem>
            </SelectContent>
          </Select>
          <FieldError msg={durationError} />
        </div>
        <div>
          <Label>Title (optional)</Label>
          <Input className="mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          <FieldError msg={titleError} />
        </div>
      </div>
      <Button onClick={submit} disabled={!canSubmit} title={!canSubmit ? (scriptError ?? durationError ?? titleError ?? "Add a script to queue.") : undefined}>
        {busy ? <><Loader2 className="mr-1 size-4 animate-spin" /> Queuing…</> : <>Queue talking-head clip</>}
      </Button>
      {error && <ErrorCard error={error} onRetry={lastAttempt.current ? retry : undefined} onDismiss={() => setError(null)} />}
      <TalkingHeadJobs jobs={jobs} isLive={isLive} loading={jobsQuery.isLoading} />
    </div>
  );
}

function TalkingHeadJobs({ jobs, isLive, loading }: { jobs: Array<{ id: string; title: string; created_at: string; status: "queued" | "rendering" | "completed" | "approved" | "failed"; provider?: string | null; provider_status?: string | null; provider_error?: string | null; render_started_at?: string | null }>; isLive: boolean; loading: boolean }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recent renders</div>
        <div className="flex items-center gap-1.5 text-[11px]" aria-live="polite">
          {isLive ? (
            <>
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-emerald-300">Live</span>
            </>
          ) : (
            <>
              <span className="size-2 rounded-full bg-muted-foreground/40" />
              <span className="text-muted-foreground">Idle</span>
            </>
          )}
        </div>
      </div>
      <div className="mt-3 divide-y divide-border">
        {loading && jobs.length === 0 && (
          <div className="py-4 text-xs text-muted-foreground">Loading recent jobs…</div>
        )}
        {!loading && jobs.length === 0 && (
          <div className="py-4 text-xs text-muted-foreground">No talking-head jobs yet. Queue a clip above to see it here.</div>
        )}
        {jobs.slice(0, 10).map((j) => (
          <div key={j.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-foreground">{j.title}</div>
              <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                <time dateTime={j.created_at}>{relTime(j.created_at)}</time>
                {j.status === "rendering" && j.render_started_at && (
                  <span>· rendering on {j.provider ?? "provider"} · {relTime(j.render_started_at)}</span>
                )}
                {j.status === "failed" && j.provider_error && (
                  <span className="text-rose-300">· {j.provider_error}</span>
                )}
              </div>
            </div>
            <JobStatusPill status={j.status} />
            {(j.status === "completed" || j.status === "approved") && (
              <Link to="/studio/content" className="text-[11px] text-brand-glow hover:underline">Open in vault</Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function JobStatusPill({ status }: { status: "queued" | "rendering" | "completed" | "approved" | "failed" }) {
  const config = {
    queued:    { label: "Queued",           cls: "border-amber-400/30 bg-amber-400/10 text-amber-300",     icon: <Clock className="size-3" /> },
    rendering: { label: "Rendering…",       cls: "border-brand/40 bg-brand/10 text-brand-glow",             icon: <Loader2 className="size-3 animate-spin" /> },
    completed: { label: "Ready for review", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", icon: <CheckCircle2 className="size-3" /> },
    approved:  { label: "Approved",         cls: "border-emerald-400/40 bg-transparent text-emerald-300",   icon: <ShieldCheck className="size-3" /> },
    failed:    { label: "Failed",           cls: "border-rose-400/30 bg-rose-400/10 text-rose-300",         icon: <AlertTriangle className="size-3" /> },
  }[status];
  return (
    <span aria-label={config.label} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${config.cls}`}>
      {config.icon} {config.label}
    </span>
  );
}

function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const s = Math.round(diffMs / 1000);
  if (s < 60) return rtf.format(-s, "second");
  const m = Math.round(s / 60);
  if (m < 60) return rtf.format(-m, "minute");
  const h = Math.round(m / 60);
  if (h < 24) return rtf.format(-h, "hour");
  const d = Math.round(h / 24);
  return rtf.format(-d, "day");
}