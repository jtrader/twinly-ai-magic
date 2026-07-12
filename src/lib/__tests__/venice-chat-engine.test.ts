import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveChatEngine } from "../venice.server";

const veniceSrc = readFileSync(resolve(process.cwd(), "src/lib/venice.server.ts"), "utf8");
const chatSrc = readFileSync(resolve(process.cwd(), "src/lib/chat.functions.ts"), "utf8");
const studioSrc = readFileSync(resolve(process.cwd(), "src/lib/persona-studio.functions.ts"), "utf8");

describe("resolveChatEngine (pure)", () => {
  it("sfw never uses Venice, regardless of the opt-in flag", () => {
    expect(resolveChatEngine("sfw", false)).toBe("lovable");
    expect(resolveChatEngine("sfw", true)).toBe("lovable");
  });

  it("suggestive follows the creator's opt-in toggle", () => {
    expect(resolveChatEngine("suggestive", false)).toBe("lovable");
    expect(resolveChatEngine("suggestive", true)).toBe("venice");
  });

  it("explicit always uses Venice, regardless of the opt-in flag", () => {
    expect(resolveChatEngine("explicit", false)).toBe("venice");
    expect(resolveChatEngine("explicit", true)).toBe("venice");
  });
});

describe("engine selection is gated on explicitness_ceiling, not persona_type (structural)", () => {
  it("generateAiReply reads explicitness_ceiling and venice_chat_opt_in, never persona_type, to pick the engine", () => {
    const start = chatSrc.indexOf("async function generateAiReply");
    const body = chatSrc.slice(start);
    expect(body).toContain("resolveChatEngine(ceiling, !!(persona as any).venice_chat_opt_in)");
    expect(body).toContain('(persona as any).explicitness_ceiling ?? "sfw"');
    expect(body).not.toContain("persona.persona_type");
    expect(body).not.toContain("persona_type ===");
  });

  it("sendPersonaMessage's persona select fetches both gating fields", () => {
    const start = chatSrc.indexOf("export const sendPersonaMessage");
    const nextExport = chatSrc.indexOf("\nasync function generateAiReply", start);
    const body = chatSrc.slice(start, nextExport);
    expect(body).toContain("explicitness_ceiling");
    expect(body).toContain("venice_chat_opt_in");
  });
});

describe("no hardcoded Venice chat model (structural)", () => {
  it("generateVeniceChatReply only reads the model from input.model or the VENICE_CHAT_MODEL env var", () => {
    const start = veniceSrc.indexOf("export async function generateVeniceChatReply");
    const nextExport = veniceSrc.indexOf("\nexport ", start + 1);
    const body = veniceSrc.slice(start, nextExport === -1 ? undefined : nextExport);
    expect(body).toContain("input.model || process.env.VENICE_CHAT_MODEL");
    expect(body).toContain('if (!model) throw new Error("VENICE_CHAT_MODEL is not configured.")');
    // No literal Venice/Seedance-style model id string assigned as a fallback.
    expect(body).not.toMatch(/["'][a-z0-9-]+-(chat|uncensored|glm|llama|qwen)[a-z0-9-]*["']/i);
  });
});

describe("Venice-engine replies still go through the same safety pipeline as Lovable replies (structural)", () => {
  it("screenMessage and checkCeilingConformance run on assistantText after generateAiReply returns, unconditional on engine", () => {
    const genIdx = chatSrc.indexOf("const generated = await generateAiReply(");
    const screenIdx = chatSrc.indexOf("const replySeverity = await screenMessage(assistantText)");
    const conformIdx = chatSrc.indexOf("checkCeilingConformance(assistantText, ceiling)");
    expect(genIdx).toBeGreaterThan(-1);
    expect(screenIdx).toBeGreaterThan(genIdx);
    expect(conformIdx).toBeGreaterThan(screenIdx);
    // Neither check is nested inside an engine-specific branch — both sit in
    // sendPersonaMessage's shared post-generation flow, not generateAiReply.
    const generateAiReplyStart = chatSrc.indexOf("async function generateAiReply");
    expect(screenIdx).toBeLessThan(generateAiReplyStart);
    expect(conformIdx).toBeLessThan(generateAiReplyStart);
  });
});

describe("venice_chat_opt_in persistence in persona-studio.functions.ts (structural)", () => {
  it("createPersona accepts veniceChatOptIn and persists it as venice_chat_opt_in", () => {
    const start = studioSrc.indexOf("export const createPersona");
    const end = studioSrc.indexOf("export const updatePersona");
    const body = studioSrc.slice(start, end);
    expect(body).toContain("veniceChatOptIn?: boolean");
    expect(body).toContain("venice_chat_opt_in: !!data.veniceChatOptIn");
  });

  it("updatePersona only patches venice_chat_opt_in when the field is explicitly provided", () => {
    const start = studioSrc.indexOf("export const updatePersona");
    const end = studioSrc.indexOf("export const setPersonaVisibility");
    const body = studioSrc.slice(start, end);
    expect(body).toContain("veniceChatOptIn?: boolean");
    expect(body).toContain("if (data.veniceChatOptIn !== undefined) patch.venice_chat_opt_in = !!data.veniceChatOptIn;");
  });
});
