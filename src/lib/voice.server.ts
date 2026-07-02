/**
 * Voice helpers (server-only). Speech-to-text + text-to-speech via Lovable AI Gateway.
 * Keep out of client bundles — reads LOVABLE_API_KEY from process.env.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function apiKey(): string {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY is not configured");
  return k;
}

/** Transcribe an audio buffer. Returns plain-text transcript or empty string. */
export async function transcribeAudio(
  bytes: ArrayBuffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const form = new FormData();
  form.append("model", "openai/gpt-4o-mini-transcribe");
  form.append("file", new Blob([bytes], { type: mimeType }), filename);
  const res = await fetch(`${GATEWAY}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`STT failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const json: any = await res.json().catch(() => ({}));
  return (json?.text ?? "").toString();
}

/** Generate an mp3 audio buffer from text. Returns { bytes, mimeType }. */
export async function synthesizeSpeech(
  text: string,
  voice = "alloy",
): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  const res = await fetch(`${GATEWAY}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      input: text.slice(0, 2000),
      voice,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`TTS failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const bytes = await res.arrayBuffer();
  return { bytes, mimeType: "audio/mpeg" };
}