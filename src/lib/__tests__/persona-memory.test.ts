import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldUpdateMemory, buildMemoryPromptLine } from "../persona-memory.functions";

describe("shouldUpdateMemory", () => {
  it("does not update before the interval is reached (cost control)", () => {
    expect(shouldUpdateMemory(5, 0, 8)).toBe(false);
    expect(shouldUpdateMemory(7, 0, 8)).toBe(false);
  });

  it("updates once enough new messages accumulate", () => {
    expect(shouldUpdateMemory(8, 0, 8)).toBe(true);
    expect(shouldUpdateMemory(20, 12, 8)).toBe(true);
  });

  it("resets the window relative to the last summary point, not from zero", () => {
    // 8 new messages since the last summary at count=10 → due again at 18.
    expect(shouldUpdateMemory(17, 10, 8)).toBe(false);
    expect(shouldUpdateMemory(18, 10, 8)).toBe(true);
  });
});

describe("buildMemoryPromptLine", () => {
  it("returns null for empty/missing summaries — nothing gets injected", () => {
    expect(buildMemoryPromptLine(null)).toBeNull();
    expect(buildMemoryPromptLine(undefined)).toBeNull();
    expect(buildMemoryPromptLine("")).toBeNull();
    expect(buildMemoryPromptLine("   ")).toBeNull();
  });

  it("formats a non-empty summary as a system-prompt line", () => {
    const line = buildMemoryPromptLine("Prefers being called Sam; asked about hiking trips twice.");
    expect(line).toContain("Sam");
    expect(line?.toLowerCase()).toContain("remember");
  });
});

describe("memory isolation (structural)", () => {
  it("memory is only ever built from a single persona's own summary — never merges across personas or supporters", () => {
    // buildMemoryPromptLine takes exactly one summary string; there is no
    // code path that concatenates multiple fans' or multiple personas'
    // summaries together. Combined with the DB's UNIQUE(persona_id, fan_id)
    // constraint and fan_id-scoped RLS, isolation is structural, not just
    // an application-level convention.
    const fanASummary = "Fan A likes jazz.";
    const fanBSummary = "Fan B likes rock.";
    const lineForA = buildMemoryPromptLine(fanASummary);
    const lineForB = buildMemoryPromptLine(fanBSummary);
    expect(lineForA).not.toContain("rock");
    expect(lineForB).not.toContain("jazz");
  });

  it("the real_me reply branch in chat.functions.ts never touches persona_memory/updateMemoryIfDue", () => {
    // Static check on the actual call-site wiring, not just the pure
    // helpers: the real_me auto-reply block runs before the `if
    // (persona.kind === "ai")` branch and returns/continues without ever
    // reaching the memory update call, which lives entirely inside that
    // AI-only branch.
    const chatFnPath = resolve(process.cwd(), "src/lib/chat.functions.ts");
    const src = readFileSync(chatFnPath, "utf8");

    const realMeBranchStart = src.indexOf('persona.kind === "real_me"');
    const aiBranchStart = src.indexOf('persona.kind === "ai"');
    expect(realMeBranchStart).toBeGreaterThan(-1);
    expect(aiBranchStart).toBeGreaterThan(-1);

    const realMeBranchSrc = src.slice(realMeBranchStart, aiBranchStart);
    expect(realMeBranchSrc).not.toContain("updateMemoryIfDue");
    expect(realMeBranchSrc).not.toContain("persona_memory");

    const aiBranchSrc = src.slice(aiBranchStart);
    expect(aiBranchSrc).toContain("updateMemoryIfDue");
  });
});
