import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isReviewOverdue } from "../provider-data-handling.functions";

const chatSrc = readFileSync(resolve(process.cwd(), "src/lib/chat.functions.ts"), "utf8");
const migrationSrc = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260713011757_provider_data_handling.sql"),
  "utf8",
);
const providerFnSrc = readFileSync(resolve(process.cwd(), "src/lib/provider-data-handling.functions.ts"), "utf8");

describe("isReviewOverdue (pure)", () => {
  const now = new Date("2026-07-13T00:00:00Z");

  it("is overdue when never reviewed, regardless of next_review_due", () => {
    expect(isReviewOverdue({ reviewed_at: null, next_review_due: "2027-01-01" }, now)).toBe(true);
  });

  it("is overdue once next_review_due has passed", () => {
    expect(isReviewOverdue({ reviewed_at: "2026-01-01T00:00:00Z", next_review_due: "2026-06-01" }, now)).toBe(true);
  });

  it("is not overdue when reviewed and next_review_due is in the future", () => {
    expect(isReviewOverdue({ reviewed_at: "2026-07-01T00:00:00Z", next_review_due: "2027-01-01" }, now)).toBe(false);
  });
});

describe("seed data is honest about review state (structural)", () => {
  it("both seeded providers (lovable_gateway, venice) start with reviewed_at/reviewed_by unset — not fabricated as reviewed", () => {
    expect(migrationSrc).toContain("'lovable_gateway'");
    expect(migrationSrc).toContain("'venice'");
    // The INSERT's explicit column list has no reviewed_at/reviewed_by column
    // at all, so both default to NULL rather than being set to a fabricated value.
    const insertStart = migrationSrc.indexOf("INSERT INTO public.provider_data_handling_records");
    const insertBody = migrationSrc.slice(insertStart);
    const columnListMatch = insertBody.match(/\(([^)]+)\)\s*\n?VALUES/);
    expect(columnListMatch).not.toBeNull();
    expect(columnListMatch![1]).not.toContain("reviewed_at");
    expect(columnListMatch![1]).not.toContain("reviewed_by");
  });
});

describe("provider activation gate (structural)", () => {
  it("assertProviderDataHandlingReviewed gates on existence of a row, not on reviewed_at, so seeded-but-unreviewed providers keep working", () => {
    const start = providerFnSrc.indexOf("export async function assertProviderDataHandlingReviewed");
    const body = providerFnSrc.slice(start);
    expect(body).toContain("if (!data)");
    expect(body).not.toContain("reviewed_at");
  });

  it("generateAiReply calls the gate after engine selection and before calling either provider", () => {
    const engineIdx = chatSrc.indexOf("const engine = resolveChatEngine(");
    const gateIdx = chatSrc.indexOf("assertProviderDataHandlingReviewed(");
    const veniceCallIdx = chatSrc.indexOf('if (engine === "venice") {');
    expect(engineIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(engineIdx);
    expect(gateIdx).toBeLessThan(veniceCallIdx);
  });
});
