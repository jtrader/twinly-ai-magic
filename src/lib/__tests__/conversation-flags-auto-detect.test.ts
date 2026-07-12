import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SYSTEM_FLAG_ACTOR_ID } from "../conversation-flags.functions";

const flagsSrc = readFileSync(resolve(process.cwd(), "src/lib/conversation-flags.functions.ts"), "utf8");
const chatSrc = readFileSync(resolve(process.cwd(), "src/lib/chat.functions.ts"), "utf8");
const flagsUiSrc = readFileSync(resolve(process.cwd(), "src/routes/studio.flags.tsx"), "utf8");

describe("SYSTEM_FLAG_ACTOR_ID sentinel", () => {
  it("is a well-known UUID that can never equal a real auth.uid()", () => {
    expect(SYSTEM_FLAG_ACTOR_ID).toBe("00000000-0000-0000-0000-000000000000");
  });
});

describe("autoFlagConversation (structural)", () => {
  const start = flagsSrc.indexOf("export async function autoFlagConversation");
  const nextExport = flagsSrc.indexOf("\nexport ", start + 1);
  const body = flagsSrc.slice(start, nextExport);

  it("writes via supabaseAdmin, not the RLS-scoped client — the insert policy requires flagged_by = auth.uid()", () => {
    expect(body).toContain("supabaseAdmin");
    expect(body).toContain('import("@/integrations/supabase/client.server")');
  });

  it("uses the system sentinel as flagged_by, never a real user id", () => {
    expect(body).toContain("flagged_by: SYSTEM_FLAG_ACTOR_ID");
  });

  it("dedupes by checking for an existing open flag on the same conversation+reason before inserting", () => {
    const existingCheckIdx = body.indexOf('.eq("status", "open")');
    const insertIdx = body.indexOf(".insert(");
    expect(existingCheckIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(existingCheckIdx);
    expect(body).toContain("if (existing) return;");
  });

  it("never throws — wrapped in try/catch so a detection failure can't break the chat response path", () => {
    expect(body).toContain("try {");
    expect(body).toContain("} catch (e) {");
    expect(body).not.toMatch(/catch \(e\) \{\s*throw/);
  });
});

describe("auto-flagging wired into chat.functions.ts's post-AI-reply signals (structural)", () => {
  it("is called at exactly the 3 post-reply signal sites (critical severity, ceiling non-conformance, prompt leak), fire-and-forget", () => {
    const occurrences = chatSrc.match(/autoFlagConversation\(/g) ?? [];
    expect(occurrences.length).toBe(3);
    // Each call site is a `.then(...).catch(() => {})` off a dynamic import,
    // never `await`ed into the response-blocking path.
    const calls = chatSrc.match(/import\("\.\/conversation-flags\.functions"\)\.then\([\s\S]*?\)\.catch\(\(\) => \{\}\);/g) ?? [];
    expect(calls.length).toBe(3);
  });

  it("uses auto_high_severity for the critical-severity block and the ceiling-conformance block, and auto_prompt_leak for the leak block", () => {
    expect(chatSrc.match(/reason: "auto_high_severity"/g)?.length).toBe(2);
    expect(chatSrc.match(/reason: "auto_prompt_leak"/g)?.length).toBe(1);
  });

  it("passes severity 'critical' for the blocked-reply case and 'high' for the other two", () => {
    const autoFlagCalls = chatSrc.match(/autoFlagConversation\(\{[\s\S]*?\}\),/g) ?? [];
    expect(autoFlagCalls.length).toBe(3);
    const severities = autoFlagCalls.map((c) => c.match(/severity: "(\w+)"/)?.[1]);
    expect(severities).toEqual(["critical", "high", "high"]);
  });
});

describe("studio.flags.tsx unified control-centre UI (structural)", () => {
  it("labels both new auto-detected reasons", () => {
    expect(flagsUiSrc).toContain("auto_high_severity");
    expect(flagsUiSrc).toContain("auto_prompt_leak");
  });

  it("sorts the open queue by severity rank before recency", () => {
    const idx = flagsUiSrc.indexOf("SEVERITY_RANK");
    expect(idx).toBeGreaterThan(-1);
    expect(flagsUiSrc).toContain('.sort((a, b) =>');
  });

  it("never attributes an auto-detected flag to a supporter in the UI copy", () => {
    expect(flagsUiSrc).toContain("isAutoFlag");
    expect(flagsUiSrc).toContain("Detected automatically");
  });
});
