import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { lookupVeniceCharacter, type LookupVeniceCharacterResult } from "@/lib/venice-character.functions";
import type { listMyPersonas } from "@/lib/onboarding.functions";
import { z } from "zod";

export type Persona = Awaited<ReturnType<typeof listMyPersonas>>["personas"][number];
export type Visibility = Persona["visibility"];

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  draft: "Draft",
  public: "Public",
  subscribers: "Subscribers",
  vip: "VIP",
  hidden: "Hidden",
  invite_only: "Invite only",
};

// Per-persona content-category allow/disallow (see content_theme_overrides
// migration). Generalized from this platform's own category primitives, not
// pulled from the external Twinly Content service's real categories — that
// service was never actually connected in this environment.
export const CONTENT_THEME_LABELS: Record<string, string> = {
  romantic_affection: "Romantic / affection",
  flirtation_teasing: "Flirtation / teasing",
  roleplay_fantasy: "Roleplay / fantasy",
  power_exchange: "Power exchange (D/s)",
  fetish_general: "Fetish / kink (general)",
  group_dynamics: "Group dynamics",
  exhibitionism_voyeurism: "Exhibitionism / voyeurism",
  sensory_focus: "Sensory focus (ASMR etc.)",
};
export const CONTENT_THEME_KEYS = Object.keys(CONTENT_THEME_LABELS);

export function centsToDollarsInput(cents: number | null | undefined): string {
  return cents ? (cents / 100).toFixed(2) : "";
}

export function dollarsInputToCents(input: string): number {
  const n = Number.parseFloat(input);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

/** Downscale an image to fit within maxSize (px, longest edge) and encode as JPEG. */
export async function resizeImageToBlob(file: File, maxSize = 512, quality = 0.9): Promise<Blob> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Could not decode image"));
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(img, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Encode failed")), "image/jpeg", quality);
  });
}

export function VoiceSettingSlider({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <Label className="text-xs">{label}</Label>
        <span className="tabular-nums text-muted-foreground">{value.toFixed(2)}</span>
      </div>
      <Slider
        className="mt-2"
        aria-label={label}
        value={[value]}
        min={0}
        max={1}
        step={0.05}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

export function VeniceCharacterField({
  idPrefix, value, onChange, label, help, autoValidate = true, onPreview,
}: {
  idPrefix: string;
  value: string;
  onChange: (v: string) => void;
  label?: string;
  help?: React.ReactNode;
  /** Debounced automatic lookup as the user types/pastes. Defaults on. */
  autoValidate?: boolean;
  /** Fires whenever a successful preview (auto or manual) is resolved, so
   *  a parent (e.g. the onboarding wizard) can render its own echo card. */
  onPreview?: (preview: {
    slug: string; name: string; description: string | null;
    photoUrl: string | null; author: string; adult: boolean;
    source: "venice" | "manual";
  } | null) => void;
}) {
  const lookup = useServerFn(lookupVeniceCharacter);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LookupVeniceCharacterResult | null>(null);
  const [checkedSlug, setCheckedSlug] = useState<string | null>(null);
  const [failCount, setFailCount] = useState(0);
  const [showManual, setShowManual] = useState(false);
  const [manualJson, setManualJson] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualVerified, setManualVerified] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [draftFilename, setDraftFilename] = useState<string | null>(null);
  const reqIdRef = useRef(0);
  const draftKey = `venice-character-draft:${idPrefix}`;
  const hydratedRef = useRef(false);

  async function check(slugArg?: string, opts: { silent?: boolean } = {}) {
    const slug = (slugArg ?? value).trim();
    if (!slug) return;
    const myReq = ++reqIdRef.current;
    setBusy(true);
    try {
      const r = await lookup({ data: { slug } });
      if (myReq !== reqIdRef.current) return; // a newer lookup superseded us
      setResult(r);
      setCheckedSlug(slug);
      setManualVerified(false);
      if ("error" in r && r.error) {
        setFailCount((n) => {
          const next = n + 1;
          if (next >= 2) setShowManual(true);
          return next;
        });
        onPreview?.(null);
      } else if ("found" in r && r.found) {
        setFailCount(0);
        onPreview?.({ ...r.character, source: "venice" });
      } else {
        onPreview?.(null);
      }
    } catch (e: any) {
      if (myReq !== reqIdRef.current) return;
      if (!opts.silent) toast.error(e?.message ?? "Could not look up that character");
    } finally {
      if (myReq === reqIdRef.current) setBusy(false);
    }
  }

  // Strict schema with human-readable messages. Accepts a couple of common
  // shape variants exported by Venice (photoUrl vs photo_url, id vs slug).
  const manualSchema = z.object({
    slug: z.string({ error: "`slug` is required" })
      .trim().min(1, "`slug` cannot be empty")
      .regex(/^[a-z0-9][a-z0-9-]*$/i, "`slug` must be a URL-safe id (letters, numbers, hyphens)")
      .max(120, "`slug` must be 120 characters or fewer"),
    name: z.string({ error: "`name` is required" })
      .trim().min(1, "`name` cannot be empty").max(200, "`name` is too long"),
    description: z.string().max(4000, "`description` is too long").nullable().optional(),
    photoUrl: z.string().url("`photoUrl` must be a valid URL").nullable().optional(),
    author: z.string().max(200, "`author` is too long").optional(),
    adult: z.boolean().optional(),
  });

  function normalizeRaw(raw: unknown): unknown {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const r = raw as Record<string, unknown>;
    // Unwrap `{ character: {...} }` or `{ data: {...} }` exports.
    if (r.character && typeof r.character === "object") return normalizeRaw(r.character);
    if (r.data && typeof r.data === "object" && !("slug" in r)) return normalizeRaw(r.data);
    return {
      slug: r.slug ?? r.id ?? r.publicId ?? r.public_id,
      name: r.name ?? r.displayName ?? r.display_name ?? r.title,
      description: r.description ?? r.bio ?? r.summary ?? null,
      photoUrl: r.photoUrl ?? r.photo_url ?? r.avatar ?? r.avatarUrl ?? r.image ?? null,
      author: r.author ?? r.createdBy ?? r.owner,
      adult: r.adult ?? r.isAdult ?? r.nsfw,
    };
  }

  function parseAndApply(text: string, opts: { filename?: string; announce?: boolean } = {}) {
    setManualError(null);
    if (!text.trim()) {
      setManualError("The file appears to be empty.");
      return false;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e: any) {
      setManualError(`Not valid JSON — ${e?.message ?? "could not parse"}. Check for trailing commas or unescaped quotes.`);
      return false;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      setManualError("Expected a JSON object at the top level, not an array or primitive.");
      return false;
    }
    const result = manualSchema.safeParse(normalizeRaw(raw));
    if (!result.success) {
      const issues = result.error.issues;
      const missing = issues.filter((i) => i.code === "invalid_type" && i.message.includes("required"))
        .map((i) => i.path.join(".") || "value");
      const detail = issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; ");
      setManualError(
        missing.length
          ? `Missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. ${detail}`
          : detail,
      );
      return false;
    }
    const parsed = result.data;
    const character = {
      slug: parsed.slug,
      name: parsed.name,
      description: parsed.description ?? null,
      photoUrl: parsed.photoUrl ?? null,
      author: parsed.author ?? "unknown",
      adult: !!parsed.adult,
    };
    onChange(character.slug);
    setResult({ found: true, character });
    setCheckedSlug(character.slug);
    setManualVerified(true);
    setManualJson(text);
    if (opts.filename) setDraftFilename(opts.filename);
    onPreview?.({ ...character, source: "manual" });
    if (opts.announce !== false) {
      toast.success(opts.filename ? `Loaded ${opts.filename}` : "Manual preview loaded");
    }
    return true;
  }

  function parseManual() { parseAndApply(manualJson); }

  async function ingestFile(file: File) {
    if (!/\.json$/i.test(file.name) && file.type && !/json/i.test(file.type)) {
      setManualError(`"${file.name}" is not a .json file.`);
      setShowManual(true);
      return;
    }
    if (file.size > 512 * 1024) {
      setManualError("File is larger than 512 KB — please upload a Character JSON export.");
      setShowManual(true);
      return;
    }
    try {
      const text = await file.text();
      setShowManual(true);
      setManualJson(text);
      parseAndApply(text, { filename: file.name });
    } catch (err: any) {
      setManualError(err?.message ?? "Could not read file");
      setShowManual(true);
    }
  }

  // ---- Draft persistence (Creator Studio survives refresh & nav) ----
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        manualJson?: string; showManual?: boolean; filename?: string | null;
        verifiedCharacter?: { slug: string; name: string; description: string | null;
          photoUrl: string | null; author: string; adult: boolean } | null;
      };
      if (draft.manualJson) setManualJson(draft.manualJson);
      if (draft.showManual) setShowManual(true);
      if (draft.filename) setDraftFilename(draft.filename);
      if (draft.verifiedCharacter) {
        setResult({ found: true, character: draft.verifiedCharacter });
        setCheckedSlug(draft.verifiedCharacter.slug);
        setManualVerified(true);
        onPreview?.({ ...draft.verifiedCharacter, source: "manual" });
      }
    } catch {
      // Corrupt draft — ignore and let the user re-upload.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || typeof window === "undefined") return;
    const verifiedCharacter =
      manualVerified && result && "found" in result && result.found ? result.character : null;
    const empty = !manualJson && !showManual && !verifiedCharacter;
    try {
      if (empty) window.localStorage.removeItem(draftKey);
      else window.localStorage.setItem(draftKey, JSON.stringify({
        manualJson, showManual, filename: draftFilename, verifiedCharacter,
      }));
    } catch {
      // Quota or private mode — best-effort only.
    }
  }, [manualJson, showManual, manualVerified, result, draftFilename, draftKey]);

  function clearDraft() {
    setManualJson("");
    setManualError(null);
    setDraftFilename(null);
    setManualVerified(false);
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ }
    }
  }

  // Debounced auto-validation on paste/type — surfaces "found/not found" live
  // before save without spamming the API on every keystroke.
  useEffect(() => {
    if (!autoValidate) return;
    const slug = value.trim();
    if (!slug || slug.length < 2) return;
    if (checkedSlug === slug) return;
    const t = setTimeout(() => { check(slug, { silent: true }); }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, autoValidate]);

  const trimmed = value.trim();
  const stale = !!checkedSlug && checkedSlug !== trimmed;
  const helpId = `${idPrefix}-venice-character-help`;
  const showFound = result && "found" in result && result.found && checkedSlug === trimmed && !stale;
  const showNotFound = result && "found" in result && !result.found && checkedSlug === trimmed && !stale;
  const showLookupErr = result && "error" in result && result.error && checkedSlug === trimmed && !stale;

  return (
    <div>
      <Label htmlFor={`${idPrefix}-venice-character`}>{label ?? "Venice Character ID (optional)"}</Label>
      <div id={helpId} className="mt-1 space-y-1 text-xs text-muted-foreground">
        {help ?? (
          <>
            <p>
              Give this persona an established look and voice from a Character you've already published on Venice.
              To find its ID:
            </p>
            <ol className="ml-4 list-decimal space-y-0.5">
              <li>Sign in at <span className="font-mono">venice.ai</span> and open your Character.</li>
              <li>
                The last segment of the URL <span className="font-mono">venice.ai/c/&lt;id&gt;</span> is the Character ID
                (also shown as <em>Public ID</em> on the Character page).
              </li>
              <li>
                Paste it below (e.g. <span className="font-mono">alan-watts</span>) — validation runs automatically
                and shows a live preview before you save.
              </li>
            </ol>
            <p>Only takes effect on replies actually routed through Venice.</p>
          </>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          id={`${idPrefix}-venice-character`}
          value={value}
          onChange={(e) => { onChange(e.target.value); setResult(null); setManualVerified(false); onPreview?.(null); }}
          placeholder="e.g. alan-watts"
          maxLength={120}
          aria-describedby={`${helpId} ${idPrefix}-venice-status`}
          aria-invalid={showNotFound || showLookupErr || undefined}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="search"
          onKeyDown={(e) => {
            if (e.key === "Enter" && trimmed && !busy) {
              e.preventDefault();
              check();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || !trimmed}
          onClick={() => check()}
          aria-label={busy ? "Checking Venice Character" : "Preview Venice Character"}
          aria-busy={busy || undefined}
        >
          {busy ? "Checking…" : "Preview"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowManual(true)}
          aria-label="Paste or upload character JSON"
        >
          Upload JSON
        </Button>
      </div>
      <div id={`${idPrefix}-venice-status`} className="sr-only" aria-live="polite">
        {busy ? "Checking Venice…"
          : showFound && result && "found" in result && result.found ? `Match: ${result.character.name}${result.character.adult ? ", 18 plus" : ""}`
          : showNotFound ? "No Venice Character found with that ID."
          : showLookupErr ? "Venice lookup failed. You can retry or paste the character JSON."
          : ""}
      </div>
      {busy && !result && (
        <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">Checking Venice…</p>
      )}
      {showFound && result && "found" in result && result.found && (
        <div className="mt-2 flex items-start gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3" aria-live="polite">
          {result.character.photoUrl ? (
            <img src={result.character.photoUrl} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="size-16 shrink-0 rounded-lg bg-emerald-400/20" aria-hidden />
          )}
          <div className="min-w-0 flex-1 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-emerald-300">✓ {result.character.name}</span>
              {result.character.adult && (
                <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-300">18+</span>
              )}
              {manualVerified && (
                <span className="rounded-full border border-sky-400/40 bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-sky-300">Manual</span>
              )}
            </div>
            <div className="mt-0.5 truncate text-muted-foreground">by {result.character.author || "unknown"}</div>
            {result.character.description && (
              <p className="mt-1 line-clamp-3 text-muted-foreground">{result.character.description}</p>
            )}
            {manualVerified && (
              <p className="mt-1 text-[11px] text-sky-300">Manually verified — Twinly will re-check with Venice on save.</p>
            )}
          </div>
        </div>
      )}
      {showNotFound && (
        <div className="mt-2 rounded-lg border border-rose-400/30 bg-rose-400/10 p-2.5" role="alert">
          <p className="text-xs text-rose-300">No published Venice Character found with that ID.</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Double-check the ID on venice.ai — the slug is the last segment of the Character URL.</p>
          <div className="mt-2">
            <Button type="button" variant="outline" size="sm" aria-label="Retry Venice lookup" onClick={() => check()} disabled={busy}>
              {busy ? "Retrying…" : "Retry lookup"}
            </Button>
          </div>
        </div>
      )}
      {showLookupErr && result && "error" in result && (
        <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2.5" role="alert">
          <p className="text-xs font-semibold text-amber-300">Couldn't reach Venice</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{result.message}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" aria-label="Retry Venice lookup" onClick={() => check()} disabled={busy}>
              {busy ? "Retrying…" : "Retry lookup"}
            </Button>
            {!showManual && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowManual(true)}>
                Paste JSON instead
              </Button>
            )}
          </div>
        </div>
      )}
      {stale && !busy && (
        <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">Validating new ID…</p>
      )}
      {showManual && (
        <details open className="mt-3 rounded-lg border border-border bg-surface p-3">
          <summary className="cursor-pointer text-xs font-semibold">Paste character JSON instead</summary>
          <p className="mt-2 text-[11px] text-muted-foreground">
            If Venice keeps failing, paste the raw character JSON here (from venice.ai's export or your browser's
            Network tab). Required keys: <span className="font-mono">slug</span>, <span className="font-mono">name</span>.
            Optional: <span className="font-mono">description</span>, <span className="font-mono">photoUrl</span>,
            <span className="font-mono"> author</span>, <span className="font-mono">adult</span>.
          </p>
          <div
            role="button"
            tabIndex={0}
            aria-label="Drop a character JSON file here or paste JSON below"
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
            onDrop={(e) => {
              e.preventDefault(); e.stopPropagation(); setDragActive(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void ingestFile(file);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                document.getElementById(`${idPrefix}-venice-json-file`)?.click();
              }
            }}
            className={`mt-2 rounded-lg border-2 border-dashed p-2 transition-colors ${
              dragActive
                ? "border-emerald-400/60 bg-emerald-400/5"
                : "border-border/60 bg-background/30 hover:border-border"
            }`}
          >
            <p className="px-1 pb-2 pt-1 text-center text-[11px] text-muted-foreground">
              Drag & drop a <span className="font-mono">.json</span> file here, or paste its contents below.
            </p>
            <Textarea
              className="min-h-28 font-mono text-xs"
              value={manualJson}
              onChange={(e) => { setManualJson(e.target.value); setManualError(null); setManualVerified(false); }}
              placeholder='{"slug":"alan-watts","name":"Alan Watts","description":"…","photoUrl":"https://…","author":"you","adult":false}'
              aria-label="Character JSON"
              aria-invalid={manualError ? true : undefined}
              spellCheck={false}
            />
          </div>
          {draftFilename && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Loaded from <span className="font-mono">{draftFilename}</span> — saved as draft for this workspace.
            </p>
          )}
          {manualError && (
            <div className="mt-1 rounded-md border border-rose-400/30 bg-rose-400/10 p-2 text-[11px] text-rose-200" role="alert" aria-live="polite">
              <p className="font-semibold text-rose-300">Couldn't load that Character JSON</p>
              <p className="mt-0.5 whitespace-pre-line">{manualError}</p>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={parseManual} disabled={!manualJson.trim()}>
              Parse & preview
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => document.getElementById(`${idPrefix}-venice-json-file`)?.click()}
            >
              Upload JSON file
            </Button>
            <input
              id={`${idPrefix}-venice-json-file`}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) await ingestFile(file);
              }}
            />
            <Button type="button" variant="ghost" size="sm" onClick={clearDraft}>
              Clear draft
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowManual(false)}>
              Back to auto-lookup
            </Button>
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Grouped "External model IDs" panel — Venice Character (with live lookup),
 * HeyGen avatar/voice, and ElevenLabs voice. All optional; leaving a field
 * blank falls back to the creator's baseline defaults.
 */
export function ExternalModelIdsPanel({
  idPrefix,
  venice, onVenice,
  heygenAvatar, onHeygenAvatar,
  heygenVoice, onHeygenVoice,
  elevenlabsVoice, onElevenlabsVoice,
  baselineVeniceSlug,
}: {
  idPrefix: string;
  venice: string; onVenice: (v: string) => void;
  heygenAvatar: string; onHeygenAvatar: (v: string) => void;
  heygenVoice: string; onHeygenVoice: (v: string) => void;
  elevenlabsVoice: string; onElevenlabsVoice: (v: string) => void;
  /** If set, shown as the fallback that will apply when Venice ID is blank. */
  baselineVeniceSlug?: string | null;
}) {
  return (
    <section aria-labelledby={`${idPrefix}-external-ids-heading`} className="space-y-4 rounded-lg border border-border bg-surface/50 p-4">
      <div>
        <h3 id={`${idPrefix}-external-ids-heading`} className="font-display text-base font-semibold">External model IDs</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Optional. Pin specific Venice, HeyGen, or ElevenLabs identities for this persona.
          Leave a field blank to fall back to your workspace defaults.
        </p>
      </div>

      <VeniceCharacterField idPrefix={idPrefix} value={venice} onChange={onVenice} />

      {baselineVeniceSlug && !venice.trim() && (
        <p className="text-[11px] text-muted-foreground">
          Falling back to your baseline Venice Character:{" "}
          <span className="font-mono">{baselineVeniceSlug}</span>
        </p>
      )}

      <div className="rounded-lg border border-border/60 bg-background/40 p-3">
        <div className="text-xs font-semibold">HeyGen (talking-head video)</div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Paste the avatar and (optional) voice IDs from your HeyGen account.
          Used when this persona renders a talking-head clip.
        </p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div>
            <Label htmlFor={`${idPrefix}-heygen-avatar-id`} className="text-[11px]">Avatar ID</Label>
            <Input
              id={`${idPrefix}-heygen-avatar-id`}
              className="mt-1"
              value={heygenAvatar}
              onChange={(e) => onHeygenAvatar(e.target.value)}
              placeholder="e.g. Daisy_sitting_sofa_side_public"
              maxLength={120}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-heygen-voice-id`} className="text-[11px]">Voice ID (optional)</Label>
            <Input
              id={`${idPrefix}-heygen-voice-id`}
              className="mt-1"
              value={heygenVoice}
              onChange={(e) => onHeygenVoice(e.target.value)}
              placeholder="Blank falls back to workspace default"
              maxLength={120}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-background/40 p-3">
        <Label htmlFor={`${idPrefix}-elevenlabs-voice-id`} className="text-xs font-semibold">
          ElevenLabs voice ID (optional)
        </Label>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Overrides the cloned-voice setting for this persona's spoken replies. Find it in your
          ElevenLabs dashboard under <span className="font-mono">Voices → &lt;voice&gt; → ID</span>.
        </p>
        <Input
          id={`${idPrefix}-elevenlabs-voice-id`}
          className="mt-2"
          value={elevenlabsVoice}
          onChange={(e) => onElevenlabsVoice(e.target.value)}
          placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
          maxLength={120}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </div>
    </section>
  );
}