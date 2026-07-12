/**
 * ElevenLabs voice cloning + text-to-speech (server-only). Request/response
 * shapes verified directly against ElevenLabs' published API docs
 * (elevenlabs.io/docs/api-reference/voices/ivc/create and
 * .../text-to-speech/convert) rather than assumed.
 */

const API_BASE = "https://api.elevenlabs.io/v1";

function apiKey(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error("ELEVENLABS_API_KEY is not configured.");
  return k;
}

/** Clamps a voice-setting value into ElevenLabs' documented 0-1 range. Undefined passes through so the API's own default applies. */
export function clampVoiceSetting(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (Number.isNaN(value)) return undefined;
  return Math.max(0, Math.min(1, value));
}

export type CloneVoiceResult = { voiceId: string; requiresVerification: boolean };

/**
 * Instant Voice Cloning — POST /v1/voices/add. Multipart: name (required),
 * files[] (required, the creator's own consented recordings), optional
 * description/remove_background_noise. Returns { voice_id, requires_verification }.
 */
export async function cloneVoice(input: {
  name: string;
  files: { bytes: ArrayBuffer; filename: string; mimeType: string }[];
  description?: string;
  removeBackgroundNoise?: boolean;
}): Promise<CloneVoiceResult> {
  if (!input.files.length) throw new Error("At least one audio sample is required to clone a voice.");
  const key = apiKey();

  const form = new FormData();
  form.append("name", input.name.slice(0, 100));
  if (input.description) form.append("description", input.description.slice(0, 500));
  if (input.removeBackgroundNoise !== undefined) {
    form.append("remove_background_noise", String(input.removeBackgroundNoise));
  }
  for (const file of input.files) {
    form.append("files", new Blob([file.bytes], { type: file.mimeType }), file.filename);
  }

  const res = await fetch(`${API_BASE}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": key },
    body: form,
  });

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) throw new Error("ElevenLabs authentication failed — check ELEVENLABS_API_KEY.");
    if (res.status === 422) throw new Error(`ElevenLabs rejected the voice samples: ${text.slice(0, 300)}`);
    if (res.status === 429) throw new Error("ElevenLabs rate limit hit — try again shortly.");
    throw new Error(`ElevenLabs voice cloning failed (${res.status}): ${text.slice(0, 300)}`);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("ElevenLabs returned a non-JSON response.");
  }
  if (!json?.voice_id) throw new Error(`ElevenLabs response missing voice_id: ${text.slice(0, 200)}`);
  return { voiceId: String(json.voice_id), requiresVerification: !!json.requires_verification };
}

/**
 * Text-to-speech via a cloned voice — POST /v1/text-to-speech/{voice_id}.
 * voice_settings fields (stability/similarity_boost/style/use_speaker_boost)
 * are ElevenLabs' actual documented voice-tuning knobs: similarity_boost is
 * "how closely the AI should adhere to the original voice" (the "closeness"
 * control), stability is expressiveness-vs-consistency (not literally
 * "temperature", but the closest analogue ElevenLabs exposes).
 */
export async function synthesizeSpeechElevenLabs(input: {
  text: string;
  voiceId: string;
  modelId?: string;
  stability?: number | null;
  similarityBoost?: number | null;
  style?: number | null;
  useSpeakerBoost?: boolean;
}): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  const key = apiKey();
  const voiceSettings: Record<string, unknown> = {};
  const stability = clampVoiceSetting(input.stability);
  const similarityBoost = clampVoiceSetting(input.similarityBoost);
  const style = clampVoiceSetting(input.style);
  if (stability !== undefined) voiceSettings.stability = stability;
  if (similarityBoost !== undefined) voiceSettings.similarity_boost = similarityBoost;
  if (style !== undefined) voiceSettings.style = style;
  if (input.useSpeakerBoost !== undefined) voiceSettings.use_speaker_boost = input.useSpeakerBoost;

  const res = await fetch(
    `${API_BASE}/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": key },
      body: JSON.stringify({
        text: input.text.slice(0, 5000),
        model_id: input.modelId ?? "eleven_multilingual_v2",
        ...(Object.keys(voiceSettings).length ? { voice_settings: voiceSettings } : {}),
      }),
    },
  );

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("ElevenLabs authentication failed — check ELEVENLABS_API_KEY.");
    if (res.status === 422) throw new Error(`ElevenLabs rejected the request: ${t.slice(0, 300)}`);
    if (res.status === 429) throw new Error("ElevenLabs rate limit hit — try again shortly.");
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${t.slice(0, 300)}`);
  }
  const bytes = await res.arrayBuffer();
  return { bytes, mimeType: "audio/mpeg" };
}
