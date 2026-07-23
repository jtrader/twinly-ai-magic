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

// ============================================================================
// Video generation (Seedance 2.0). Unlike images, video renders take
// minutes, not seconds — Venice's own docs describe this as an inherently
// async queue: POST /video/queue returns a queue_id immediately, then you
// poll POST /video/retrieve until the response body switches from a JSON
// status object to raw video/mp4 bytes. That means this can't be handled
// synchronously inside one request/response cycle the way images are —
// it follows the same submit-then-poll shape already used for HeyGen
// talking-head renders (see heygen.server.ts / cron/heygen-poll.ts), not
// the synchronous generateVeniceImages() above.
//
// Model IDs and request/response shapes below were verified directly
// against Venice's published API docs (docs.venice.ai) rather than assumed.

const FACE_ELIGIBLE_MODELS = new Set([
  "seedance-2-0-image-to-video",
  "seedance-2-0-reference-to-video",
  "seedance-2-0-fast-image-to-video",
  "seedance-2-0-fast-reference-to-video",
]);

/** Pure model-selection decision, extracted for direct unit testing. */
export function selectVeniceVideoModel(hasReferences: boolean, fast = false): string {
  if (hasReferences) return fast ? "seedance-2-0-fast-reference-to-video" : "seedance-2-0-reference-to-video";
  return fast ? "seedance-2-0-fast-text-to-video" : "seedance-2-0-text-to-video";
}

export type VeniceVideoQueueResult = { queueId: string; model: string };

/**
 * Queues a Seedance 2.0 video render. When reference_image_urls are given
 * (grounding the video in a real likeness), Venice may return a 409
 * needs_consent the first time it sees a given image — a face-media
 * attestation it requires regardless of who's calling. This is handled
 * transparently here: the caller (generate-requests.functions.ts) has
 * already run assertTwinPolicy against the creator's own
 * digital_twin_consent (signed, not revoked, likeness_ok + video_ok) before
 * this function is ever invoked, so the three-field attestation below
 * re-affirms a decision the creator already made through Twinly's own
 * consent flow — it is not a new or separate consent decision made by this
 * code. Venice's own content-policy checks (minors, public figures, etc.)
 * still apply on top of this and cannot be bypassed by attesting.
 *
 * Prompt syntax note: for reference_to_video, Venice's canonical prompt
 * format references uploaded images as "<Image 1>", "<Image 2>", etc.
 * (e.g. "Refer to <Subject 1> in <Image 1> to generate ..."). Callers
 * passing reference_image_urls are responsible for phrasing prompts this
 * way — this function does not rewrite prompts.
 */
export async function queueVeniceVideo(input: {
  prompt: string;
  durationSeconds: number;
  aspectRatio?: string;
  resolution?: string;
  negativePrompt?: string;
  referenceImageUrls?: string[];
  fast?: boolean;
}): Promise<VeniceVideoQueueResult> {
  const key = process.env.VENICE_API_KEY;
  if (!key) throw new Error("VENICE_API_KEY is not configured.");

  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("Prompt is required for video generation.");
  if (prompt.length > 2500) throw new Error("Prompt too long for Venice video generation.");

  const hasReferences = !!input.referenceImageUrls?.length;
  const model = selectVeniceVideoModel(hasReferences, input.fast);

  const durationSeconds = Math.max(1, Math.min(30, Math.round(input.durationSeconds)));
  const duration = `${durationSeconds}s`;

  const body: Record<string, unknown> = {
    model,
    prompt,
    duration,
    aspect_ratio: input.aspectRatio || "9:16",
    resolution: input.resolution || "720p",
    negative_prompt: input.negativePrompt?.slice(0, 2500) || undefined,
  };
  if (hasReferences) body.reference_image_urls = input.referenceImageUrls!.slice(0, 9);

  async function submit(consents?: Record<string, unknown>): Promise<Response> {
    return fetch(`${API_BASE}/video/queue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(consents ? { ...body, consents } : body),
    });
  }

  let res = await submit();
  if (res.status === 409 && FACE_ELIGIBLE_MODELS.has(model)) {
    const errJson: any = await res.json().catch(() => ({}));
    if (errJson?.error?.code !== "needs_consent") {
      throw new Error(`Venice video generation failed (409): ${JSON.stringify(errJson).slice(0, 300)}`);
    }
    res = await submit({
      seedance: {
        confirmed_terms_and_privacy: true,
        confirmed_legal_right: true,
        confirmed_screening_acknowledged: true,
      },
    });
  }

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 422) throw new Error(`Venice rejected this request on content-policy grounds and consent cannot override it: ${text.slice(0, 300)}`);
    if (res.status === 429) throw new Error("Venice rate limit hit — try again shortly.");
    if (res.status === 402) throw new Error("Venice balance/credits exhausted. Top up in Venice billing.");
    throw new Error(`Venice video generation failed (${res.status}): ${text.slice(0, 300)}`);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Venice returned a non-JSON response.");
  }
  if (!json?.queue_id) throw new Error(`Venice response missing queue_id: ${text.slice(0, 200)}`);
  return { queueId: String(json.queue_id), model: String(json.model ?? model) };
}

export type VeniceVideoStatusResult =
  | { status: "queued" | "running"; videoBytes: null; error: null }
  | { status: "completed"; videoBytes: Uint8Array; error: null }
  | { status: "failed"; videoBytes: null; error: string };

/** Polls a queued render. Used by the safety-net cron poller (Venice has no documented webhook for video). */
export async function fetchVeniceVideoStatus(queueId: string, model: string): Promise<VeniceVideoStatusResult> {
  const key = process.env.VENICE_API_KEY;
  if (!key) throw new Error("VENICE_API_KEY is not configured.");

  const res = await fetch(`${API_BASE}/video/retrieve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, queue_id: queueId }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (res.ok && contentType.startsWith("video/")) {
    const videoBytes = new Uint8Array(await res.arrayBuffer());
    return { status: "completed", videoBytes, error: null };
  }

  const text = await res.text();
  if (!res.ok) {
    return { status: "failed", videoBytes: null, error: `Venice retrieve failed (${res.status}): ${text.slice(0, 300)}` };
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: "failed", videoBytes: null, error: "Venice retrieve returned a non-JSON, non-video response." };
  }
  const status = String(json?.status ?? "queued");
  if (status === "failed") {
    return { status: "failed", videoBytes: null, error: String(json?.error ?? json?.message ?? "Venice video generation failed") };
  }
  return { status: status === "running" ? "running" : "queued", videoBytes: null, error: null };
}

/**
 * Applies a Venice video render outcome to its content_assets row. Shared
 * by the cron poller so consent re-verification, dedup, and storage
 * handling live in one place — mirrors applyHeygenOutcome's shape exactly.
 */
export async function applyVeniceVideoOutcome(
  queueId: string,
  outcome: { kind: "success"; videoBytes: Uint8Array } | { kind: "failure"; message: string },
): Promise<{ ok: boolean; reason?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: asset, error: findErr } = await supabaseAdmin
    .from("content_assets")
    .select("*")
    .eq("provider", "venice_video")
    .eq("provider_job_id", queueId)
    .maybeSingle();
  if (findErr) return { ok: false, reason: findErr.message };
  if (!asset) return { ok: false, reason: "unknown_queue_id" };

  if ((asset as any).storage_path && outcome.kind === "success") {
    return { ok: true, reason: "dedup" };
  }

  if (outcome.kind === "failure") {
    await supabaseAdmin
      .from("content_assets")
      .update({
        approval_status: "rejected",
        category: "ai_video_failed",
        provider_status: "failed",
        provider_error: outcome.message.slice(0, 500),
        render_completed_at: new Date().toISOString(),
      } as any)
      .eq("id", (asset as any).id);
    return { ok: true };
  }

  const { data: consent } = await supabaseAdmin
    .from("digital_twin_consent")
    .select("signed_at, revoked_at, video_ok, likeness_ok")
    .eq("creator_id", (asset as any).creator_id)
    .maybeSingle();
  const consentOk =
    !!consent?.signed_at && !consent?.revoked_at && !!consent?.video_ok && !!consent?.likeness_ok;
  if (!consentOk) {
    await supabaseAdmin
      .from("content_assets")
      .update({
        approval_status: "rejected",
        category: "ai_video_failed",
        provider_status: "consent_revoked",
        provider_error: "Digital Twin consent for video was revoked before render completion.",
        render_completed_at: new Date().toISOString(),
      } as any)
      .eq("id", (asset as any).id);
    return { ok: true, reason: "consent_revoked" };
  }

  if (outcome.videoBytes.byteLength > 200 * 1024 * 1024) {
    await supabaseAdmin
      .from("content_assets")
      .update({
        approval_status: "rejected",
        category: "ai_video_failed",
        provider_status: "failed",
        provider_error: "oversize",
      } as any)
      .eq("id", (asset as any).id);
    return { ok: false, reason: "oversize" };
  }

  const path = `${(asset as any).creator_id}/generated/venice-video-${(asset as any).id}.mp4`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("content-assets")
    .upload(path, outcome.videoBytes, { contentType: "video/mp4", upsert: true });
  if (upErr) {
    await supabaseAdmin
      .from("content_assets")
      .update({ provider_status: "storage_failed", provider_error: upErr.message.slice(0, 500) } as any)
      .eq("id", (asset as any).id);
    return { ok: false, reason: upErr.message };
  }

  await supabaseAdmin
    .from("content_assets")
    .update({
      storage_path: path,
      category: "ai_video_ready",
      provider_status: "completed",
      provider_error: null,
      render_completed_at: new Date().toISOString(),
    } as any)
    .eq("id", (asset as any).id);

  return { ok: true };
}

// ============================================================================
// Chat text generation. Venice's /chat/completions is a real, working,
// OpenAI-compatible endpoint (verified against docs.venice.ai) — same
// request/response shape as the Lovable AI Gateway call in
// chat.functions.ts's generateAiReply, just a different provider. Engine
// selection (which provider a given persona's replies go through) is a
// separate, pure decision — see resolveChatEngine below — kept independent
// of this HTTP call so it can be unit tested without a network dependency.
//
// No specific "uncensored" model ID is hardcoded here — Venice's model
// catalog changes over time and picking one without live access to GET
// /models to confirm it's still current would be guessing. VENICE_CHAT_MODEL
// must be set by whoever operates this deployment, the same way
// VENICE_IMAGE_MODEL already works above.

export type ExplicitnessLevel = "sfw" | "suggestive" | "explicit";
export type ChatEngine = "venice" | "lovable";

/**
 * Pure — which chat engine a persona's replies should use. Gated on the
 * persona's actual explicitness_ceiling (the platform-enforced value used
 * everywhere else in the app), not the persona_type label, so a "Wicked"
 * persona a creator has deliberately kept at a lower ceiling is never
 * force-routed to an uncensored engine it hasn't actually been raised to.
 */
export function resolveChatEngine(ceiling: ExplicitnessLevel, veniceOptIn: boolean): ChatEngine {
  if (ceiling === "explicit") return "venice";
  if (ceiling === "suggestive" && veniceOptIn) return "venice";
  return "lovable";
}

/**
 * Generates one chat reply via Venice. Callers are responsible for running
 * the exact same downstream safety checks on the result as any other
 * engine's output (illegal-content screening, ceiling-conformance check) —
 * this function has no special exemption from either.
 */
export async function generateVeniceChatReply(input: {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  /** Slug of a published Venice Character to bias this reply toward — see getVeniceCharacter. */
  characterSlug?: string | null;
}): Promise<string> {
  const key = process.env.VENICE_API_KEY;
  if (!key) throw new Error("VENICE_API_KEY is not configured.");
  const model = input.model || process.env.VENICE_CHAT_MODEL;
  if (!model) throw new Error("VENICE_CHAT_MODEL is not configured.");

  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userMessage },
      ],
      ...(input.characterSlug ? { venice_parameters: { character_slug: input.characterSlug } } : {}),
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 429) throw new Error("Venice rate limit hit — try again shortly.");
    if (res.status === 402) throw new Error("Venice balance/credits exhausted. Top up in Venice billing.");
    throw new Error(`Venice chat completion failed (${res.status}): ${text.slice(0, 300)}`);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Venice returned a non-JSON response.");
  }
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Venice chat completion returned no content.");
  }
  return content;
}

export type VeniceCharacter = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  photoUrl: string | null;
  author: string;
  adult: boolean;
};

/**
 * Looks up a published Venice Character by its public slug — GET
 * /characters/{slug}. Venice has no general media-library/asset-by-ID API
 * (verified against their docs); this is the one real, documented lookup
 * that lets a creator "import" an existing Venice identity by ID rather
 * than starting a persona from a blank slate. Returns null on a genuine
 * 404 (not found) rather than throwing, since that's an expected outcome
 * a caller needs to render, not an error condition.
 */
export async function getVeniceCharacter(slug: string): Promise<VeniceCharacter | null> {
  const key = process.env.VENICE_API_KEY;
  if (!key) throw new Error("VENICE_API_KEY is not configured.");

  const res = await fetch(`${API_BASE}/characters/${encodeURIComponent(slug)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
  });

  if (res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 429) throw new Error("Venice rate limit hit — try again shortly.");
    throw new Error(`Venice character lookup failed (${res.status}): ${text.slice(0, 300)}`);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Venice returned a non-JSON response.");
  }
  const c = json?.data;
  if (!c?.slug || !c?.name) {
    throw new Error("Venice character response missing expected fields.");
  }
  return {
    id: String(c.id),
    slug: String(c.slug),
    name: String(c.name),
    description: c.description ?? null,
    photoUrl: c.photoUrl ?? null,
    author: String(c.author ?? ""),
    adult: !!c.adult,
  };
}

export type VeniceCharacterSummary = VeniceCharacter & {
  tags: string[];
  averageRating: number;
  imports: number;
};

/**
 * Browses published Venice Characters — GET /characters (a preview API per
 * Venice's own docs, filterable by search/tags/categories/isAdult). Lets a
 * creator find their own published character by name instead of needing to
 * already know its exact slug, which the single-lookup getVeniceCharacter
 * above requires.
 */
export async function searchVeniceCharacters(params: {
  search?: string;
  isAdult?: boolean;
  limit?: number;
}): Promise<VeniceCharacterSummary[]> {
  const key = process.env.VENICE_API_KEY;
  if (!key) throw new Error("VENICE_API_KEY is not configured.");

  const qs = new URLSearchParams();
  const search = params.search?.trim();
  if (search) qs.set("search", search.slice(0, 200));
  if (params.isAdult !== undefined) qs.set("isAdult", params.isAdult ? "true" : "false");
  qs.set("limit", String(Math.min(Math.max(params.limit ?? 20, 1), 100)));

  const res = await fetch(`${API_BASE}/characters?${qs.toString()}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
  });

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 429) throw new Error("Venice rate limit hit — try again shortly.");
    throw new Error(`Venice character search failed (${res.status}): ${text.slice(0, 300)}`);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Venice returned a non-JSON response.");
  }
  const list = Array.isArray(json?.data) ? json.data : [];
  return list
    .filter((c: any) => c?.slug && c?.name)
    .map((c: any) => ({
      id: String(c.id),
      slug: String(c.slug),
      name: String(c.name),
      description: c.description ?? null,
      photoUrl: c.photoUrl ?? null,
      author: String(c.author ?? ""),
      adult: !!c.adult,
      tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
      averageRating: Number(c.stats?.averageRating ?? 0),
      imports: Number(c.stats?.imports ?? 0),
    }));
}
