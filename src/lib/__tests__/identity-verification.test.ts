import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertIdVerified } from "../identity-verification.functions";

const identitySrc = readFileSync(resolve(process.cwd(), "src/lib/identity-verification.functions.ts"), "utf8");
const stripeServerSrc = readFileSync(resolve(process.cwd(), "src/lib/stripe.server.ts"), "utf8");
const chatSrc = readFileSync(resolve(process.cwd(), "src/lib/chat.functions.ts"), "utf8");
const fanFeedSrc = readFileSync(resolve(process.cwd(), "src/lib/fan-feed.functions.ts"), "utf8");
const webhookSrc = readFileSync(resolve(process.cwd(), "src/routes/api/public/identity/webhook.ts"), "utf8");

function fakeSupabase(profileRow: { id_verified_at: string | null } | null) {
  return {
    from(table: string) {
      if (table !== "profiles") throw new Error(`unexpected table ${table}`);
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: profileRow, error: null }; },
      };
    },
  };
}

describe("assertIdVerified (guard)", () => {
  it("throws ID_VERIFICATION_REQUIRED when the profile has no id_verified_at", async () => {
    await expect(assertIdVerified({ supabase: fakeSupabase({ id_verified_at: null }), userId: "u1" }))
      .rejects.toThrow("ID_VERIFICATION_REQUIRED");
  });

  it("throws ID_VERIFICATION_REQUIRED when the profile row doesn't exist", async () => {
    await expect(assertIdVerified({ supabase: fakeSupabase(null), userId: "u1" }))
      .rejects.toThrow("ID_VERIFICATION_REQUIRED");
  });

  it("resolves without throwing once id_verified_at is set", async () => {
    await expect(assertIdVerified({ supabase: fakeSupabase({ id_verified_at: "2026-01-01T00:00:00Z" }), userId: "u1" }))
      .resolves.toBeUndefined();
  });
});

describe("Stripe never receives the platform's raw ID documents (structural)", () => {
  it("createIdentityVerificationSession only ever creates a session and stores pending status — no document/selfie bytes pass through this code", () => {
    const start = identitySrc.indexOf("export const createIdentityVerificationSession");
    const end = identitySrc.indexOf("export const getMyIdentityVerificationStatus");
    const body = identitySrc.slice(start, end);
    expect(body).toContain('type: "document"');
    expect(body).toContain('status: "pending"');
    expect(body).not.toMatch(/document_(front|back|image)|selfie_image|file_data/i);
  });

  it("stores the session via supabaseAdmin, not the user-scoped client (no INSERT RLS policy for authenticated on identity_verifications)", () => {
    const start = identitySrc.indexOf("export const createIdentityVerificationSession");
    const end = identitySrc.indexOf("export const getMyIdentityVerificationStatus");
    const body = identitySrc.slice(start, end);
    expect(body).toContain("supabaseAdmin");
    expect(body).toContain('supabaseAdmin.from("identity_verifications").insert(');
  });
});

describe("identity webhook only writes what Stripe's event says, never client input (structural)", () => {
  it("verification result is derived from event.type, not any request body field", () => {
    expect(webhookSrc).toContain('case "identity.verification_session.verified"');
    expect(webhookSrc).toContain('case "identity.verification_session.requires_input"');
    expect(webhookSrc).toContain('case "identity.verification_session.canceled"');
    expect(webhookSrc).toContain("verifyIdentityWebhook");
  });

  it("only a verified event ever sets profiles.id_verified_at", () => {
    const start = webhookSrc.indexOf("async function handleVerified");
    const end = webhookSrc.indexOf("async function handleNotVerified");
    const body = webhookSrc.slice(start, end);
    expect(body).toContain('.from("profiles")');
    expect(body).toContain("id_verified_at: now");
  });
});

describe("identity webhook uses a distinct signing secret from payments (structural)", () => {
  it("verifyIdentityWebhook reads IDENTITY_* env vars, verifyWebhook reads PAYMENTS_* env vars", () => {
    expect(stripeServerSrc).toContain("IDENTITY_SANDBOX_WEBHOOK_SECRET");
    expect(stripeServerSrc).toContain("IDENTITY_LIVE_WEBHOOK_SECRET");
    expect(stripeServerSrc).toContain("PAYMENTS_SANDBOX_WEBHOOK_SECRET");
    expect(stripeServerSrc).toContain("PAYMENTS_LIVE_WEBHOOK_SECRET");
  });
});

describe("explicit-tier gating wiring (structural)", () => {
  it("sendPersonaMessage requires ID verification only for explicitness_ceiling='explicit', and exempts the owning creator", () => {
    const start = chatSrc.indexOf("export const sendPersonaMessage");
    const end = chatSrc.indexOf("export const loadConversation");
    const body = chatSrc.slice(start, end);
    expect(body).toContain('userId !== creator.user_id && (persona as any).explicitness_ceiling === "explicit"');
    expect(body).toContain("assertIdVerified");
  });

  it("assetAccess gates isExplicit content behind id_verification, layered after the self-attested age_gate check", () => {
    const ageGateIdx = fanFeedSrc.indexOf('reason: "age_gate"');
    const idVerIdx = fanFeedSrc.indexOf('reason: "id_verification"');
    expect(ageGateIdx).toBeGreaterThan(-1);
    expect(idVerIdx).toBeGreaterThan(ageGateIdx);
  });

  it("the owner is exempt from their own persona's id-verification gate (checked before it in assetAccess)", () => {
    const ownerIdx = fanFeedSrc.indexOf('if (opts.isOwner) return { state: "open" }');
    const idVerIdx = fanFeedSrc.indexOf('reason: "id_verification"');
    expect(ownerIdx).toBeGreaterThan(-1);
    expect(ownerIdx).toBeLessThan(idVerIdx);
  });
});
