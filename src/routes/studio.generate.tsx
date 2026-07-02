import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { Wand2, ImageIcon, Mic, Video, Save, Loader2 } from "lucide-react";
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
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function generate() {
    const p = prompt.trim();
    if (p.length < 3) { toast.error("Add a longer prompt."); return; }
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
        if (err) { setError(err); return; }
        flushSync(() => {
          if (frame) {
            setDataUrl(`data:image/png;base64,${frame}`);
            setB64(frame);
          }
          setIsFinal(final);
        });
      });
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e.message ?? "Generation failed");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
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
      </div>
      <div>
        <Label>Title (optional)</Label>
        <Input className="mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={generate} disabled={busy || saving}>
          {busy ? <><Loader2 className="mr-1 size-4 animate-spin" /> Generating…</> : <>Generate</>}
        </Button>
        {dataUrl && b64 && (
          <Button variant="outline" onClick={onSave} disabled={saving || busy || !isFinal}>
            {saving ? <><Loader2 className="mr-1 size-4 animate-spin" /> Saving…</> : <><Save className="mr-1 size-4" /> Save to vault</>}
          </Button>
        )}
      </div>
      {error && <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-300">{error}</div>}
      {dataUrl && (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-elevated">
          <img
            src={dataUrl}
            alt="AI preview"
            className={"h-auto w-full object-contain transition-[filter] duration-300 " + (isFinal ? "blur-0" : "blur-2xl")}
          />
          <div className="flex items-center justify-between p-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Badge variant="outline" className="text-[10px] uppercase">AI-generated</Badge>
              {!isFinal && <span>Streaming preview…</span>}
              {isFinal && <span>Final frame ready.</span>}
            </span>
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
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let sawCompleted = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
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

  async function generate() {
    const t = script.trim();
    if (t.length < 2) { toast.error("Say something first."); return; }
    setBusy(true); setPreviewUrl(null);
    try {
      const res = await gen({ data: {
        prompt: t, title, voice,
        personaId: personaId || undefined,
        packId: packId || undefined,
      }});
      setPreviewUrl(res.previewUrl ?? null);
      toast.success("Voice note saved — pending your approval.");
    } catch (e: any) {
      toast.error(e.message ?? "Voice generation failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Script</Label>
        <Textarea className="mt-1.5" rows={4} maxLength={4000} value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Hey — thanks for subscribing. I recorded this quick voice note just for you…" />
        <div className="mt-1 text-[11px] text-muted-foreground">{script.length}/4000 characters</div>
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
        </div>
        <div>
          <Label>Title (optional)</Label>
          <Input className="mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </div>
      </div>
      <Button onClick={generate} disabled={busy}>
        {busy ? <><Loader2 className="mr-1 size-4 animate-spin" /> Generating…</> : <>Generate voice note</>}
      </Button>
      {previewUrl && (
        <div className="rounded-2xl border border-border bg-surface-elevated p-3">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase">AI-generated</Badge>
            <span className="text-xs text-muted-foreground">Preview (signed URL, 1h)</span>
          </div>
          <audio controls src={previewUrl} className="w-full" />
        </div>
      )}
    </div>
  );
}

/* ----------------- TALKING HEAD ----------------- */

function VideoTab({ personaId, packId }: { personaId: string; packId: string }) {
  const queue = useServerFn(queueTalkingHead);
  const [script, setScript] = useState("");
  const [title, setTitle] = useState("");
  const [seconds, setSeconds] = useState<string>("15");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const t = script.trim();
    if (t.length < 4) { toast.error("Add a short script."); return; }
    setBusy(true);
    try {
      await queue({ data: {
        script: t, title,
        durationSeconds: Number(seconds) || 15,
        personaId: personaId || undefined,
        packId: packId || undefined,
      }});
      toast.success("Talking-head clip queued. You'll be notified when the render is ready.");
      setScript(""); setTitle("");
    } catch (e: any) {
      toast.error(e.message ?? "Could not queue clip");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
        <strong>Preview integration.</strong> Talking-head render provider isn't wired yet — submitting queues a
        pending video asset in your vault so you can wire consent, approvals, and delivery end-to-end.
        The rendered clip attaches automatically when the provider is enabled.
      </div>
      <div>
        <Label>Script (what the persona says)</Label>
        <Textarea className="mt-1.5" rows={4} maxLength={1000} value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Hi babe, welcome to my world. I've got something special for you tonight…" />
        <div className="mt-1 text-[11px] text-muted-foreground">{script.length}/1000 characters</div>
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
        </div>
        <div>
          <Label>Title (optional)</Label>
          <Input className="mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </div>
      </div>
      <Button onClick={submit} disabled={busy}>
        {busy ? <><Loader2 className="mr-1 size-4 animate-spin" /> Queuing…</> : <>Queue talking-head clip</>}
      </Button>
    </div>
  );
}