import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { assertIdLevel } from "../identity-verification.functions";

const identitySrc = readFileSync(resolve(process.cwd(), "src/lib/identity-verification.functions.ts"), "utf8");
const webhookSrc = readFileSync(resolve(process.cwd(), "src/routes/api/public/identity/webhook.ts"), "utf8");
const payoutsSrc = readFileSync(resolve(process.cwd(), "src/lib/payouts.functions.ts"), "utf8");

function fakeSupabaseRpc(returnValue: boolean | null, error: any = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: returnValue, error }),
  };
}

describe("assertIdLevel (§4 point-of-action)", () => {
  it("throws ID_VERIFICATION_REQUIRED for level 1 when has_id_level RPC returns false", async () => {
    await expect(
      assertIdLevel({ supabase: fakeSupabaseRpc(false) as any, userId: "u1" }, 1),
    ).rejects.toThrow("ID_VERIFICATION_REQUIRED");
  });

  it("throws ID_LEVEL_2_REQUIRED for level 2 when the RPC returns false — distinct sentinel so the client can prompt for the higher tier", async () => {
    await expect(
      assertIdLevel({ supabase: fakeSupabaseRpc(false) as any, userId: "u1" }, 2),
    ).rejects.toThrow("ID_LEVEL_2_REQUIRED");
  });

  it("resolves when the RPC returns true", async () => {
    await expect(
      assertIdLevel({ supabase: fakeSupabaseRpc(true) as any, userId: "u1" }, 1),
    ).resolves.toBeUndefined();
  });

  it("fails closed if the RPC itself errors — never grants access on ambiguous check (§3 non-negotiable)", async () => {
    await expect(
      assertIdLevel({ supabase: fakeSupabaseRpc(null, { message: "boom" }) as any, userId: "u1" }, 1),
    ).rejects.toThrow("Verification level check failed");
  });

  it("routes through the SECURITY DEFINER has_id_level RPC (not a client-side profile read that RLS could shadow)", async () => {
    const supabase = fakeSupabaseRpc(true);
    await assertIdLevel({ supabase: supabase as any, userId: "u42" }, 2);
    expect(supabase.rpc).toHaveBeenCalledWith("has_id_level", { _user_id: "u42", _level: 2 });
  });
});

describe("Session creation hardening (§1)", () => {
  it("rate-limits per user via check_rate_limit before touching Stripe", () => {
    expect(identitySrc).toContain('_bucket: "identity_session_create"');
    expect(identitySrc).toMatch(/check_rate_limit[\s\S]{0,200}Too many verification attempts/);
  });

  it("uses a deterministic idempotency key so same-day retries reuse the same Stripe session", () => {
    expect(identitySrc).toContain("idempotencyKey");
    expect(identitySrc).toMatch(/id-vs-\$\{userId\}-\$\{data\.environment\}/);
  });

  it("reuses an in-flight pending session with a fresh client-secret instead of creating a duplicate", () => {
    expect(identitySrc).toContain('reused: true');
    expect(identitySrc).toMatch(/verificationSessions\.retrieve/);
  });

  it("stores retention-minimized fields only — never DOB, document images, selfie bytes, or full address", () => {
    // Whitelist check: the insert payload names only fields on §3's minimized set.
    const start = identitySrc.indexOf("supabaseAdmin.from(\"identity_verifications\")");
    const end = identitySrc.indexOf("onConflict: \"provider_session_id\"");
    const body = identitySrc.slice(start, end);
    expect(body).not.toMatch(/dob|document_number|document_front|document_back|selfie|address_line/i);
  });
});

describe("Webhook state machine (§2 + §3)", () => {
  it("handles processing, verified, requires_input, canceled, and redacted event types", () => {
    for (const evt of [
      "identity.verification_session.processing",
      "identity.verification_session.verified",
      "identity.verification_session.requires_input",
      "identity.verification_session.canceled",
      "identity.verification_session.redacted",
    ]) {
      expect(webhookSrc).toContain(`case "${evt}"`);
    }
  });

  it("§2 idempotency: inserts into identity_webhook_events keyed by Stripe event id, short-circuits duplicates", () => {
    expect(webhookSrc).toContain('from("identity_webhook_events")');
    expect(webhookSrc).toContain('code === "23505"'); // PK conflict = already processed
  });

  it("§3 fail-closed: is_adult_verified is derived from Stripe verified_outputs.dob server-side and never trusted from a client callback", () => {
    expect(webhookSrc).toContain("deriveIsAdult");
    expect(webhookSrc).toContain("verified_outputs?.dob");
    // ambiguous DOB -> returns false, so the profile is NOT promoted to Level 1
    expect(webhookSrc).toMatch(/if \(!isAdult\)[\s\S]{0,200}id_verification_level/);
  });

  it("§3 fail-closed: only a verified adult event ever sets id_verification_level=1", () => {
    const start = webhookSrc.indexOf("async function handleVerified");
    const end = webhookSrc.indexOf("async function handleNotVerified");
    const body = webhookSrc.slice(start, end);
    // Must set the level to 1 only on the isAdult=true branch
    expect(body).toMatch(/id_verification_level: 1/);
    expect(body).toContain('is_adult_verified: true');
  });

  it("§7 redaction: redacted event revokes Level 1 and clears id_verified_at so previously-open capabilities close on next §4 re-check", () => {
    const start = webhookSrc.indexOf("async function handleRedacted");
    const end = webhookSrc.indexOf("async function handleWebhook");
    const body = webhookSrc.slice(start, end);
    expect(body).toContain("id_verified_at: null");
    expect(body).toContain("id_verification_level: 0");
    expect(body).toContain("is_adult_verified: false");
  });

  it("§3 retention: webhook never persists DOB, document number/images, selfie, or full address", () => {
    expect(webhookSrc).not.toMatch(/dob:|document_number|document_front|document_back|selfie_image|address_line/);
  });
});

describe("Point-of-action wiring (§4)", () => {
  it("getPayoutsSummary requires Level 2 before reading transactions (monetization gate)", () => {
    expect(payoutsSrc).toContain('assertIdLevel(context as any, 2)');
    // Guard must be BEFORE the transaction read.
    const guardIdx = payoutsSrc.indexOf("assertIdLevel");
    const txReadIdx = payoutsSrc.indexOf('from("transactions")');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(txReadIdx);
  });
});
