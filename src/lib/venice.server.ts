const API_BASE = "https://api.venice.ai/api/v1";

// Venice caps `variants` per single call; we batch above that transparently.
const MAX_VARIANTS_PER_CALL = 4;

// Static per-image cost estimate used for budgeting/analytics until we wire
// live pricing from GET /models (model_spec.pricing.quality). Override via
// env so ops can correct this without a deploy.
const DEFAULT_COST_PER_IMAGE_CENTS = Number(process.env.VENICE_COST_PER_IMAGE_CENTS || 4);

export type VeniceImageResult = {
  images: { bytes: Uint8Array; format: string }[];
  costCents: number;
  model: string;
};

/**
 * Generate one or more images via Venice.ai. Synchronous (no webhook) —
 * Venice returns image bytes directly in the response.
 *
 * safe_mode is a single global toggle (VENICE_SAFE_MODE env var, default
 * "true"). This is a deliberate product/legal decision, not something to
 * flip per-request from client input — whoever operates this deployment
 * should set it explicitly per their age-verification and consent posture
 * rather than trusting a client-supplied flag.
 */
export async function generateVeniceImages(input: {
  prompt: string;
  negativePrompt?: string;
  count?: number;
  width?: number;
  height?: number;
  stylePreset?: string;
  model?: string;
}): Promise<VeniceImageResult> {
  const key = process.env.VENICE_API_KEY;
  if (!key) throw new Error("VENICE_API_KEY is not configured.");

  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("Prompt is required for image generation.");
  if (prompt.length > 4000) throw new Error("Prompt too long for Venice image generation.");

  const total = Math.max(1, Math.min(12, Math.floor(input.count ?? 1)));
  const safeMode = (process.env.VENICE_SAFE_MODE ?? "true").toLowerCase() !== "false";
  const model = input.model || process.env.VENICE_IMAGE_MODEL || "gpt-image-2";

  const images: { bytes: Uint8Array; format: string }[] = [];
  let remaining = total;

  while (remaining > 0) {
    const batch = Math.min(MAX_VARIANTS_PER_CALL, remaining);
    const res = await fetch(`${API_BASE}/image/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        negative_prompt: input.negativePrompt?.slice(0, 1500) || undefined,
        width: input.width ?? 1024,
        height: input.height ?? 1024,
        variants: batch,
        format: "png",
        safe_mode: safeMode,
        hide_watermark: true,
        return_binary: false,
        embed_exif_metadata: false,
        style_preset: input.stylePreset || undefined,
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      if (res.status === 429) throw new Error("Venice rate limit hit — try again shortly.");
      if (res.status === 402)
        throw new Error("Venice balance/credits exhausted. Top up in Venice billing.");
      throw new Error(`Venice image generation failed (${res.status}): ${text.slice(0, 300)}`);
    }

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("Venice returned a non-JSON response.");
    }

    // Response shape per Venice docs uses an `images` array of base64
    // strings when return_binary=false; fall back defensively in case of
    // the alternate `data[].b64_json` shape seen on some model families.
    const items: string[] =
      json?.images ?? json?.data?.map((d: any) => d.b64_json ?? d.image) ?? [];
    if (!items.length) throw new Error("Venice response contained no images.");

    for (const b64 of items) {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      images.push({ bytes, format: "png" });
    }
    remaining -= batch;
  }

  return { images, costCents: total * DEFAULT_COST_PER_IMAGE_CENTS, model };
}
