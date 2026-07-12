/**
 * Voice source intake validation — pure, dependency-free checks so they're
 * directly unit-testable (no ffmpeg/ffprobe or audio-decoding library is
 * available in this project's serverless deploy target, so this
 * deliberately does its own minimal parsing rather than shelling out).
 *
 * Real, exact analysis (duration, sample rate, RMS/silence) is only
 * possible here for WAV, since its header/PCM layout is simple enough to
 * parse by hand. For compressed formats (MP3/M4A/WebM/OGG — the last two
 * being what browser MediaRecorder actually produces) exact duration/sample
 * rate require full audio decoding, which is out of reach without a real
 * media-processing dependency; those values are trusted from the client
 * (which already knows them precisely — MediaRecorder's own timer for
 * recordings, HTMLAudioElement metadata for file picks) and still run
 * through the same bound checks below. This is a stated limitation, not a
 * silent gap.
 */

export type VoiceSourceFormat = "wav" | "mp3" | "m4a" | "webm" | "ogg";
export const ALLOWED_FORMATS: ReadonlySet<VoiceSourceFormat> = new Set(["wav", "mp3", "m4a", "webm", "ogg"]);

export const MIN_DURATION_SECONDS = 30;
export const MAX_DURATION_SECONDS = 30 * 60;
export const MAX_FILE_SIZE_BYTES = 60 * 1024 * 1024;
/** ElevenLabs' documented voice-cloning minimum sample rate. */
export const MIN_SAMPLE_RATE = 16_000;
/** Below this normalized RMS (0-1 scale), a recording is treated as silent/unusable. */
const SILENCE_RMS_THRESHOLD = 0.01;

export type WavInfo = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  durationSeconds: number;
  dataChunkOffset: number;
  dataChunkLength: number;
};

/** Parses a WAV file's RIFF/fmt/data chunks. Returns null for anything malformed/truncated/non-WAV. */
export function parseWavHeader(bytes: ArrayBuffer): WavInfo | null {
  if (bytes.byteLength < 44) return null;
  const view = new DataView(bytes);
  const readTag = (offset: number) => String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));

  if (readTag(0) !== "RIFF" || readTag(8) !== "WAVE") return null;

  let offset = 12;
  let sampleRate: number | null = null;
  let channels: number | null = null;
  let bitsPerSample: number | null = null;
  let dataOffset: number | null = null;
  let dataLength: number | null = null;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = readTag(offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const bodyStart = offset + 8;

    if (chunkId === "fmt " && bodyStart + 16 <= bytes.byteLength) {
      channels = view.getUint16(bodyStart + 2, true);
      sampleRate = view.getUint32(bodyStart + 4, true);
      bitsPerSample = view.getUint16(bodyStart + 14, true);
    } else if (chunkId === "data") {
      dataOffset = bodyStart;
      dataLength = Math.min(chunkSize, bytes.byteLength - bodyStart);
    }

    offset = bodyStart + chunkSize + (chunkSize % 2);
  }

  if (!sampleRate || !channels || !bitsPerSample || dataOffset === null || dataLength === null || dataLength <= 0) {
    return null;
  }
  const bytesPerSample = bitsPerSample / 8;
  const durationSeconds = dataLength / (sampleRate * channels * bytesPerSample);
  return { sampleRate, channels, bitsPerSample, durationSeconds, dataChunkOffset: dataOffset, dataChunkLength: dataLength };
}

/** Normalized (0-1) RMS amplitude of a WAV's PCM data. Only supports 16-bit PCM — returns null otherwise. */
export function computeWavRmsAmplitude(bytes: ArrayBuffer, wav: WavInfo): number | null {
  if (wav.bitsPerSample !== 16) return null;
  const view = new DataView(bytes, wav.dataChunkOffset, wav.dataChunkLength);
  const sampleCount = Math.floor(wav.dataChunkLength / 2);
  if (sampleCount === 0) return null;

  // Sampling stride keeps this fast for long files without needing every sample.
  const stride = Math.max(1, Math.floor(sampleCount / 200_000));
  let sumSquares = 0;
  let counted = 0;
  for (let i = 0; i < sampleCount; i += stride) {
    const sample = view.getInt16(i * 2, true) / 32768;
    sumSquares += sample * sample;
    counted++;
  }
  return Math.sqrt(sumSquares / counted);
}

export function isSilentAmplitude(rmsAmplitude: number): boolean {
  return rmsAmplitude < SILENCE_RMS_THRESHOLD;
}

export type ValidationInput = {
  format: string;
  durationSeconds: number;
  sampleRate: number;
  fileSizeBytes: number;
  /** Present only when real amplitude analysis was possible (WAV) or the client reported one for recorded_in_app. */
  rmsAmplitude?: number | null;
};
export type ValidationResult = { status: "validated" } | { status: "rejected"; rejectionReason: string };

/** The single decision point for accept/reject — every bound check in one place, fully unit-testable. */
export function validateVoiceSource(input: ValidationInput): ValidationResult {
  if (!ALLOWED_FORMATS.has(input.format as VoiceSourceFormat)) {
    return { status: "rejected", rejectionReason: `Unsupported audio format "${input.format}". Use WAV, MP3, M4A, or a browser recording.` };
  }
  if (input.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    return { status: "rejected", rejectionReason: `File is too large (max ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB).` };
  }
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < MIN_DURATION_SECONDS) {
    return { status: "rejected", rejectionReason: `Recording is too short — need at least ${MIN_DURATION_SECONDS} seconds of usable voice.` };
  }
  if (input.durationSeconds > MAX_DURATION_SECONDS) {
    return { status: "rejected", rejectionReason: `Recording is too long — keep it under ${MAX_DURATION_SECONDS / 60} minutes.` };
  }
  if (!Number.isFinite(input.sampleRate) || input.sampleRate < MIN_SAMPLE_RATE) {
    return { status: "rejected", rejectionReason: `Sample rate too low (${input.sampleRate}Hz) — need at least ${MIN_SAMPLE_RATE}Hz for voice cloning.` };
  }
  if (input.rmsAmplitude != null && isSilentAmplitude(input.rmsAmplitude)) {
    return { status: "rejected", rejectionReason: "Recording sounds silent or too quiet to use — please re-record closer to the mic." };
  }
  return { status: "validated" };
}

/** Canonicalizes a filename/mimetype into one of ALLOWED_FORMATS' keys (or the raw extension if unrecognized, so validateVoiceSource can still reject it with a clear message). */
export function detectFormat(filename: string, mimeType?: string | null): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "wav" || mimeType?.includes("wav")) return "wav";
  if (ext === "mp3" || mimeType?.includes("mpeg")) return "mp3";
  if (ext === "m4a" || mimeType?.includes("mp4") || mimeType?.includes("m4a")) return "m4a";
  if (ext === "webm" || mimeType?.includes("webm")) return "webm";
  if (ext === "ogg" || mimeType?.includes("ogg")) return "ogg";
  return ext || (mimeType ?? "unknown");
}
