import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { lookupVeniceCharacter } from "@/lib/venice-character.functions";
import type { listMyPersonas } from "@/lib/onboarding.functions";

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
  idPrefix, value, onChange,
}: { idPrefix: string; value: string; onChange: (v: string) => void }) {
  const lookup = useServerFn(lookupVeniceCharacter);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof lookupVeniceCharacter>> | null>(null);
  const [checkedSlug, setCheckedSlug] = useState<string | null>(null);

  async function check() {
    const slug = value.trim();
    if (!slug) return;
    setBusy(true);
    try {
      const r = await lookup({ data: { slug } });
      setResult(r);
      setCheckedSlug(slug);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not look up that character");
    } finally { setBusy(false); }
  }

  return (
    <div>
      <Label htmlFor={`${idPrefix}-venice-character`}>Venice Character ID (optional)</Label>
      <div className="mt-1 space-y-1 text-xs text-muted-foreground">
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
          <li>Paste it below (e.g. <span className="font-mono">alan-watts</span>) and press <strong>Preview</strong> to confirm.</li>
        </ol>
        <p>Only takes effect on replies actually routed through Venice.</p>
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          id={`${idPrefix}-venice-character`}
          value={value}
          onChange={(e) => { onChange(e.target.value); setResult(null); }}
          placeholder="e.g. alan-watts"
          maxLength={120}
          aria-describedby={`${idPrefix}-venice-character-help`}
        />
        <Button type="button" variant="outline" size="sm" disabled={busy || !value.trim()} onClick={check}>
          {busy ? "Checking…" : "Preview"}
        </Button>
      </div>
      {result && checkedSlug === value.trim() && (
        result.found ? (
          <div className="mt-2 flex items-center gap-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-2.5">
            {result.character.photoUrl && (
              <img src={result.character.photoUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
            )}
            <div className="min-w-0 text-xs">
              <div className="font-semibold text-emerald-300">{result.character.name}</div>
              <div className="truncate text-muted-foreground">
                by {result.character.author || "unknown"}{result.character.adult ? " · 18+" : ""}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-rose-300" role="alert">No published Venice Character found with that ID.</p>
        )
      )}
    </div>
  );
}