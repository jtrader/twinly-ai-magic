import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_FORMATS,
  MAX_DURATION_SECONDS,
  MAX_FILE_SIZE_BYTES,
  MIN_DURATION_SECONDS,
  MIN_SAMPLE_RATE,
  computeWavRmsAmplitude,
  detectFormat,
  isSilentAmplitude,
  parseWavHeader,
  validateVoiceSource,
} from "../voice-source-validation.server";

/** Builds a minimal valid 16-bit PCM WAV buffer with the given sample values, for testing parseWavHeader/computeWavRmsAmplitude without any real audio file. */
function buildWav(samples: number[], sampleRate = 44100, channels = 1): ArrayBuffer {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true); // byte rate
  view.setUint16(32, channels * bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, Math.round(samples[i] * 32767), true);
  }
  return buffer;
}

describe("parseWavHeader", () => {
  it("parses sample rate, channels, and duration from a well-formed WAV", () => {
    const sampleRate = 44100;
    const samples = new Array(sampleRate * 2).fill(0.5); // 2 seconds
    const wav = parseWavHeader(buildWav(samples, sampleRate, 1));
    expect(wav).not.toBeNull();
    expect(wav!.sampleRate).toBe(sampleRate);
    expect(wav!.channels).toBe(1);
    expect(wav!.bitsPerSample).toBe(16);
    expect(wav!.durationSeconds).toBeCloseTo(2, 1);
  });

  it("returns null for a buffer that's too short to be a WAV", () => {
    expect(parseWavHeader(new ArrayBuffer(10))).toBeNull();
  });

  it("returns null for a buffer with the wrong magic bytes (corrupted/not-a-WAV)", () => {
    const bad = new ArrayBuffer(44);
    new DataView(bad).setUint32(0, 0, false); // not "RIFF"
    expect(parseWavHeader(bad)).toBeNull();
  });
});

describe("computeWavRmsAmplitude / isSilentAmplitude", () => {
  it("reports near-zero RMS for silence, correctly flagged as silent", () => {
    const samples = new Array(1000).fill(0);
    const bytes = buildWav(samples);
    const wav = parseWavHeader(bytes)!;
    const rms = computeWavRmsAmplitude(bytes, wav);
    expect(rms).not.toBeNull();
    expect(rms!).toBeLessThan(0.001);
    expect(isSilentAmplitude(rms!)).toBe(true);
  });

  it("reports substantial RMS for a loud constant-amplitude signal, not flagged as silent", () => {
    const samples = new Array(1000).fill(0.8);
    const bytes = buildWav(samples);
    const wav = parseWavHeader(bytes)!;
    const rms = computeWavRmsAmplitude(bytes, wav);
    expect(rms!).toBeCloseTo(0.8, 1);
    expect(isSilentAmplitude(rms!)).toBe(false);
  });
});

describe("detectFormat", () => {
  it("maps common extensions and mime types to canonical formats", () => {
    expect(detectFormat("sample.wav")).toBe("wav");
    expect(detectFormat("sample.mp3")).toBe("mp3");
    expect(detectFormat("sample.m4a")).toBe("m4a");
    expect(detectFormat("blob", "audio/webm")).toBe("webm");
    expect(detectFormat("blob", "audio/ogg")).toBe("ogg");
  });
});

describe("validateVoiceSource (bound checks)", () => {
  const base = { format: "wav", durationSeconds: 60, sampleRate: 44100, fileSizeBytes: 1_000_000 };

  it("accepts a well-formed recording within all bounds", () => {
    expect(validateVoiceSource(base)).toEqual({ status: "validated" });
  });

  it("rejects an unsupported format", () => {
    const r = validateVoiceSource({ ...base, format: "flac" });
    expect(r.status).toBe("rejected");
    expect((r as any).rejectionReason).toMatch(/format/i);
  });

  it("accepts every format in ALLOWED_FORMATS", () => {
    for (const format of ALLOWED_FORMATS) {
      expect(validateVoiceSource({ ...base, format })).toEqual({ status: "validated" });
    }
  });

  it("rejects a file over the max size", () => {
    const r = validateVoiceSource({ ...base, fileSizeBytes: MAX_FILE_SIZE_BYTES + 1 });
    expect(r.status).toBe("rejected");
    expect((r as any).rejectionReason).toMatch(/too large/i);
  });

  it("rejects a recording shorter than the minimum duration", () => {
    const r = validateVoiceSource({ ...base, durationSeconds: MIN_DURATION_SECONDS - 1 });
    expect(r.status).toBe("rejected");
    expect((r as any).rejectionReason).toMatch(/too short/i);
  });

  it("rejects a recording longer than the maximum duration", () => {
    const r = validateVoiceSource({ ...base, durationSeconds: MAX_DURATION_SECONDS + 1 });
    expect(r.status).toBe("rejected");
    expect((r as any).rejectionReason).toMatch(/too long/i);
  });

  it("accepts recordings exactly at the min/max duration boundary", () => {
    expect(validateVoiceSource({ ...base, durationSeconds: MIN_DURATION_SECONDS }).status).toBe("validated");
    expect(validateVoiceSource({ ...base, durationSeconds: MAX_DURATION_SECONDS }).status).toBe("validated");
  });

  it("rejects a sample rate below ElevenLabs' documented minimum", () => {
    const r = validateVoiceSource({ ...base, sampleRate: MIN_SAMPLE_RATE - 1 });
    expect(r.status).toBe("rejected");
    expect((r as any).rejectionReason).toMatch(/sample rate/i);
  });

  it("rejects a silent recording when amplitude data is available", () => {
    const r = validateVoiceSource({ ...base, rmsAmplitude: 0.001 });
    expect(r.status).toBe("rejected");
    expect((r as any).rejectionReason).toMatch(/silent|quiet/i);
  });

  it("does not reject on silence grounds when no amplitude data is available (compressed formats)", () => {
    expect(validateVoiceSource({ ...base, format: "mp3", rmsAmplitude: undefined }).status).toBe("validated");
  });
});

describe("recorded-in-app and uploaded files share one validation path (structural)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/lib/voice-sources.functions.ts"), "utf8");
  const start = src.indexOf("export const uploadVoiceSourceRecording");
  const nextExport = src.indexOf("\nexport const", start + 1);
  const body = src.slice(start, nextExport);

  it("calls validateVoiceSource exactly once, with no separate branch per source_type", () => {
    const calls = body.match(/validateVoiceSource\(/g) ?? [];
    expect(calls.length).toBe(1);
    // No conditional dispatch like `if (data.sourceType === ...) validate...` — a
    // single shared call fed by format-specific data gathering above it.
    expect(body).not.toMatch(/sourceType\s*===\s*["']uploaded["'][\s\S]{0,200}validateVoiceSource/);
  });

  it("requires active consent before ever inserting a recording", () => {
    const consentCallIdx = body.indexOf("assertVoiceSourceConsent(");
    const firstInsertIdx = body.indexOf(".insert(");
    expect(consentCallIdx).toBeGreaterThan(-1);
    expect(firstInsertIdx).toBeGreaterThan(-1);
    expect(consentCallIdx).toBeLessThan(firstInsertIdx);
  });

  it("every insert links both persona_id and consent_record_id together", () => {
    const inserts = body.match(/\.insert\(\{[\s\S]*?\}\)/g) ?? [];
    expect(inserts.length).toBeGreaterThan(0);
    for (const ins of inserts) {
      expect(ins).toContain("persona_id");
      expect(ins).toContain("consent_record_id");
    }
  });
});

describe("rejected recordings never reach the voice-clone job queue (structural)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/lib/voice-sources.functions.ts"), "utf8");

  it("submitVoiceCloneJob rejects any recording not in 'validated' status before marking it submitted", () => {
    const start = src.indexOf("export const submitVoiceCloneJob");
    const body = src.slice(start);
    const guardIdx = body.indexOf('r.status !== "validated"');
    const updateIdx = body.indexOf('status: "cloned"');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(updateIdx);
  });

  it("only marks recordings 'cloned' after ElevenLabs actually accepts the submission, not before", () => {
    const start = src.indexOf("export const submitVoiceCloneJob");
    const body = src.slice(start);
    const cloneCallIdx = body.indexOf("await cloneVoice(");
    const statusUpdateIdx = body.indexOf('status: "cloned"');
    expect(cloneCallIdx).toBeGreaterThan(-1);
    expect(statusUpdateIdx).toBeGreaterThan(cloneCallIdx);
  });

  it("submitVoiceCloneJob re-checks consent before submission, not just at upload time", () => {
    const start = src.indexOf("export const submitVoiceCloneJob");
    const body = src.slice(start);
    expect(body).toContain("assertVoiceSourceConsent(");
  });
});

describe("consent gate reuses existing digital_twin_consent state, not a new parallel gate (structural)", () => {
  it("assertVoiceSourceConsent reads digital_twin_consent and the ai_training consent_records ledger, mirroring assertTwinPolicy's forTraining check", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/voice-sources.functions.ts"), "utf8");
    expect(src).toContain('.from("digital_twin_consent")');
    expect(src).toContain("voice_ok");
    expect(src).toContain("training_consent_signed_at");
    expect(src).toContain("training_consent_revoked_at");
    expect(src).toContain('.eq("kind", "ai_training")');
  });
});
