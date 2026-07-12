import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { clampVoiceSetting } from "../elevenlabs.server";

const elevenlabsSrc = readFileSync(resolve(process.cwd(), "src/lib/elevenlabs.server.ts"), "utf8");
const voiceSourcesSrc = readFileSync(resolve(process.cwd(), "src/lib/voice-sources.functions.ts"), "utf8");
const chatSrc = readFileSync(resolve(process.cwd(), "src/lib/chat.functions.ts"), "utf8");
const personaStudioSrc = readFileSync(resolve(process.cwd(), "src/lib/persona-studio.functions.ts"), "utf8");

describe("clampVoiceSetting (pure)", () => {
  it("clamps values into the documented 0-1 range", () => {
    expect(clampVoiceSetting(-0.5)).toBe(0);
    expect(clampVoiceSetting(1.5)).toBe(1);
    expect(clampVoiceSetting(0.42)).toBe(0.42);
  });

  it("lets null/undefined pass through so ElevenLabs' own default applies", () => {
    expect(clampVoiceSetting(null)).toBeUndefined();
    expect(clampVoiceSetting(undefined)).toBeUndefined();
  });

  it("treats NaN as absent rather than clamping it to a boundary", () => {
    expect(clampVoiceSetting(Number.NaN)).toBeUndefined();
  });

  it("keeps exact boundary values", () => {
    expect(clampVoiceSetting(0)).toBe(0);
    expect(clampVoiceSetting(1)).toBe(1);
  });
});

describe("cloneVoice request shape (structural)", () => {
  const start = elevenlabsSrc.indexOf("export async function cloneVoice");
  const nextExport = elevenlabsSrc.indexOf("\nexport ", start + 1);
  const body = elevenlabsSrc.slice(start, nextExport);

  it("posts multipart form data to the documented Instant Voice Cloning endpoint", () => {
    expect(body).toContain("${API_BASE}/voices/add");
    expect(body).toContain("new FormData()");
    expect(body).toContain('headers: { "xi-api-key": key }');
  });

  it("rejects a clone attempt with zero audio samples rather than sending an empty request", () => {
    expect(body).toContain("if (!input.files.length)");
  });

  it("surfaces distinct, actionable errors for auth, validation, and rate-limit failures", () => {
    expect(body).toContain("res.status === 401");
    expect(body).toContain("res.status === 422");
    expect(body).toContain("res.status === 429");
  });

  it("returns requiresVerification from ElevenLabs' response rather than assuming false", () => {
    expect(body).toContain("requiresVerification: !!json.requires_verification");
  });
});

describe("synthesizeSpeechElevenLabs request shape (structural)", () => {
  const start = elevenlabsSrc.indexOf("export async function synthesizeSpeechElevenLabs");
  const body = elevenlabsSrc.slice(start);

  it("posts to the documented per-voice text-to-speech endpoint", () => {
    expect(body).toContain("${API_BASE}/text-to-speech/${encodeURIComponent(input.voiceId)}");
  });

  it("only includes voice_settings fields that were actually provided, letting ElevenLabs default the rest", () => {
    expect(body).toContain("if (stability !== undefined) voiceSettings.stability = stability;");
    expect(body).toContain("if (similarityBoost !== undefined) voiceSettings.similarity_boost = similarityBoost;");
    expect(body).toContain("if (style !== undefined) voiceSettings.style = style;");
    expect(body).toMatch(/Object\.keys\(voiceSettings\)\.length \? \{ voice_settings: voiceSettings \} : \{\}/);
  });

  it("runs every numeric voice setting through clampVoiceSetting before sending it", () => {
    expect(body).toContain("clampVoiceSetting(input.stability)");
    expect(body).toContain("clampVoiceSetting(input.similarityBoost)");
    expect(body).toContain("clampVoiceSetting(input.style)");
  });
});

describe("submitVoiceCloneJob wiring (structural)", () => {
  const start = voiceSourcesSrc.indexOf("export const submitVoiceCloneJob");
  const body = voiceSourcesSrc.slice(start);

  it("re-checks ownership and consent before ever touching ElevenLabs", () => {
    expect(body.indexOf("requireOwnedPersona")).toBeLessThan(body.indexOf("cloneVoice"));
    expect(body.indexOf("assertVoiceSourceConsent")).toBeLessThan(body.indexOf("cloneVoice"));
  });

  it("only submits recordings that are actually validated", () => {
    expect(body).toContain('r.status !== "validated"');
    expect(body).toContain("Only validated recordings can be submitted for voice cloning");
  });

  it("stores the resulting voice on the creator, not the persona", () => {
    const updateIdx = body.indexOf('.from("creators")');
    const section = body.slice(updateIdx, updateIdx + 300);
    expect(section).toContain("elevenlabs_voice_id: result.voiceId");
    expect(section).toContain("elevenlabs_voice_requires_verification: result.requiresVerification");
  });

  it("only marks recordings 'cloned' after ElevenLabs actually accepts them, not before", () => {
    const cloneCallIdx = body.indexOf("await cloneVoice(");
    const statusUpdateIdx = body.indexOf('status: "cloned"');
    expect(cloneCallIdx).toBeGreaterThan(-1);
    expect(statusUpdateIdx).toBeGreaterThan(cloneCallIdx);
  });
});

describe("chat TTS engine selection (structural)", () => {
  const start = chatSrc.indexOf("if ((persona as any).voice_reply_enabled)");
  const body = chatSrc.slice(start, start + 1500);

  it("only uses the cloned voice when both the persona opted in AND the creator actually has one", () => {
    expect(body).toContain("(persona as any).use_cloned_voice && creator.elevenlabs_voice_id");
  });

  it("never falls back from ElevenLabs to the generic preset (or vice versa) within a single reply", () => {
    // Each engine is invoked exactly once, in mutually exclusive ternary branches —
    // no catch-and-retry-with-the-other-engine path exists.
    const tryStart = body.indexOf("try {");
    const catchStart = body.indexOf("} catch");
    const tryBody = body.slice(tryStart, catchStart);
    expect(tryBody.match(/synthesizeSpeechElevenLabs\(\{/g)?.length).toBe(1);
    expect(tryBody.match(/synthesizeSpeech\(assistantText/g)?.length).toBe(1);
  });

  it("passes the persona's own voice_stability/similarity/style through to ElevenLabs", () => {
    expect(body).toContain("stability: (persona as any).voice_stability");
    expect(body).toContain("similarityBoost: (persona as any).voice_similarity_boost");
    expect(body).toContain("style: (persona as any).voice_style");
  });
});

describe("persona-studio validators + patch wiring for cloned-voice fields (structural)", () => {
  it("createPersona accepts and persists the four cloned-voice fields", () => {
    const start = personaStudioSrc.indexOf("export const createPersona");
    const end = personaStudioSrc.indexOf("export const updatePersona");
    const body = personaStudioSrc.slice(start, end);
    expect(body).toContain("useClonedVoice?: boolean;");
    expect(body).toContain("use_cloned_voice: !!data.useClonedVoice,");
    expect(body).toContain("voice_stability: data.voiceStability ?? null,");
    expect(body).toContain("voice_similarity_boost: data.voiceSimilarityBoost ?? null,");
    expect(body).toContain("voice_style: data.voiceStyle ?? null,");
  });

  it("updatePersona only patches cloned-voice fields when explicitly provided, mirroring contentThemeOverrides", () => {
    const start = personaStudioSrc.indexOf("export const updatePersona");
    const body = personaStudioSrc.slice(start);
    expect(body).toContain("if (data.useClonedVoice !== undefined) patch.use_cloned_voice = !!data.useClonedVoice;");
    expect(body).toContain("if (data.voiceStability !== undefined) {");
    expect(body).toContain("if (data.voiceSimilarityBoost !== undefined) {");
    expect(body).toContain("if (data.voiceStyle !== undefined) {");
  });

  it("clamps updatePersona's voice settings through the same clampVoiceSetting used by the TTS call itself", () => {
    expect(personaStudioSrc).toContain('import { clampVoiceSetting } from "./elevenlabs.server";');
    const start = personaStudioSrc.indexOf("export const updatePersona");
    const body = personaStudioSrc.slice(start);
    expect(body.match(/clampVoiceSetting\(/g)?.length).toBe(3);
  });
});
