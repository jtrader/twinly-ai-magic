import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { computeTwinStatus } from "../twin.functions";

const twinSrc = readFileSync(resolve(process.cwd(), "src/lib/twin.functions.ts"), "utf8");
const generateReqSrc = readFileSync(resolve(process.cwd(), "src/lib/generate-requests.functions.ts"), "utf8");

describe("computeTwinStatus (pure)", () => {
  it("stays revoked no matter what else is true — revocation is terminal until a separate re-consent flow", () => {
    expect(computeTwinStatus({ current: "revoked", pendingRefCount: 5, approvedIdentityRefCount: 5, consentActive: true })).toBe("revoked");
  });

  it("is none when nothing has been submitted", () => {
    expect(computeTwinStatus({ current: "none", pendingRefCount: 0, approvedIdentityRefCount: 0, consentActive: false })).toBe("none");
  });

  it("is pending once refs are submitted, even before any are approved", () => {
    expect(computeTwinStatus({ current: "none", pendingRefCount: 1, approvedIdentityRefCount: 0, consentActive: false })).toBe("pending");
  });

  it("is pending when an identity ref is approved but consent isn't active yet", () => {
    expect(computeTwinStatus({ current: "pending", pendingRefCount: 0, approvedIdentityRefCount: 1, consentActive: false })).toBe("pending");
  });

  it("falls back to none when consent is active but there's no ref activity to justify pending", () => {
    expect(computeTwinStatus({ current: "pending", pendingRefCount: 0, approvedIdentityRefCount: 0, consentActive: true })).toBe("none");
  });

  it("is approved once an identity ref is approved AND consent is active", () => {
    expect(computeTwinStatus({ current: "pending", pendingRefCount: 0, approvedIdentityRefCount: 1, consentActive: true })).toBe("approved");
  });

  it("stays approved even if other refs are still pending review", () => {
    expect(computeTwinStatus({ current: "approved", pendingRefCount: 2, approvedIdentityRefCount: 1, consentActive: true })).toBe("approved");
  });
});

describe("digital_twin_status recompute wiring (structural)", () => {
  it("submitTwinReferencesForReview recomputes status after marking refs pending", () => {
    const start = twinSrc.indexOf("export const submitTwinReferencesForReview");
    const end = twinSrc.indexOf("// ---------- Admin");
    const body = twinSrc.slice(start, end);
    expect(body).toContain("await recomputeDigitalTwinStatus(supabase, creator.id);");
  });

  it("adminSetTwinRefReview recomputes status for the reviewed ref's creator after approve/reject", () => {
    const start = twinSrc.indexOf("export const adminSetTwinRefReview");
    const end = twinSrc.indexOf("export const adminGetTwinRefSignedUrl");
    const body = twinSrc.slice(start, end);
    expect(body).toContain('.select("creator_id").single()');
    expect(body).toContain("await recomputeDigitalTwinStatus(supabaseAdmin, updated.creator_id);");
  });

  it("upsertTwinConsent recomputes status after consent changes", () => {
    const start = twinSrc.indexOf("export const upsertTwinConsent");
    const end = twinSrc.indexOf("export const revokeTwinConsent");
    const body = twinSrc.slice(start, end);
    expect(body).toContain("await recomputeDigitalTwinStatus(supabase, creator.id);");
  });

  it("revokeTwinConsent remains the only direct writer of 'revoked'", () => {
    const occurrences = twinSrc.match(/digital_twin_status:\s*"revoked"/g) ?? [];
    expect(occurrences.length).toBe(1);
    const start = twinSrc.indexOf("export const revokeTwinConsent");
    const end = twinSrc.indexOf("export const upsertStyleNotes");
    expect(twinSrc.slice(start, end)).toContain('digital_twin_status: "revoked"');
  });
});

describe("generation gate checks the reachable enum value (structural)", () => {
  it("assertTwinPolicy compares against 'approved', a real twin_status value, not the unreachable 'ready'", () => {
    expect(generateReqSrc).toContain('creator.digital_twin_status !== "approved"');
    expect(generateReqSrc).not.toContain('"ready"');
  });
});
