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
    // Pass 1: the initial state was renamed to session_created as part of the
    // formal state machine (§2). The invariant this test guards is that no
    // document/selfie bytes ever cross this code path.
    expect(body).toContain('status: "session_created"');
    expect(body).not.toMatch(/document_(front|back|image)|selfie_image|file_data/i);
  });

  it("stores the session via supabaseAdmin, not the user-scoped client (no INSERT RLS policy for authenticated on identity_verifications)", () => {
    const start = identitySrc.indexOf("export const createIdentityVerificationSession");
    const end = identitySrc.indexOf("export const getMyIdentityVerificationStatus");
    const body = identitySrc.slice(start, end);
    expect(body).toContain("supabaseAdmin");
    // Pass 1: switched from insert to upsert(onConflict: provider_session_id)
    // so same-day idempotent retries don't duplicate rows.
    expect(body).toMatch(/supabaseAdmin\.from\("identity_verifications"\) as any\)\.upsert\(/);
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
  it("sendPersonaMessage requires ID verification for explicitness_ceiling='explicit' OR a persona-level require_id_verification opt-in, and exempts the owning creator", () => {
    const start = chatSrc.indexOf("export const sendPersonaMessage");
    const end = chatSrc.indexOf("export const loadConversation");
    const body = chatSrc.slice(start, end);
    expect(body).toContain(
      'userId !== creator.user_id && ((persona as any).explicitness_ceiling === "explicit" || (persona as any).require_id_verification)',
    );
    expect(body).toContain("assertIdVerified");
    expect(body).toContain("require_id_verification");
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

  it("assetAccess's locked-state branch checks requireIdVerification in addition to isExplicit, independent of explicitness tier", () => {
    const start = fanFeedSrc.indexOf("function assetAccess");
    const end = fanFeedSrc.indexOf('reason: "id_verification"');
    const body = fanFeedSrc.slice(start, end);
    expect(body).toContain("requireIdVerification: boolean");
    expect(fanFeedSrc.slice(start, end + 60)).toContain(
      '(opts.isExplicit || opts.requireIdVerification) && !opts.idVerified',
    );
  });

  it("a persona opting into require_id_verification is reflected end-to-end: fetched, passed into assetAccess, and returned to the viewer", () => {
    expect(fanFeedSrc).toContain("require_id_verification");
    expect(fanFeedSrc).toContain("requireIdVerification: !!persona.require_id_verification");
  });
});

describe("Creator 'Require ID verification' setting consistently drives BOTH the chat error prompt and the supporter join gate (regression)", () => {
  const creatorsRouteSrc = readFileSync(
    resolve(process.cwd(), "src/routes/creators.$handle.$persona.tsx"),
    "utf8",
  );
  const chatRouteSrc = readFileSync(
    resolve(process.cwd(), "src/routes/chat.$handle.$persona.tsx"),
    "utf8",
  );

  it("chat.functions.ts server guard triggers on require_id_verification even when the tier is NOT explicit", () => {
    // The predicate uses OR — a persona with explicitness_ceiling='suggestive'
    // but require_id_verification=true still throws ID_VERIFICATION_REQUIRED.
    // If someone rewrites this to AND (or drops the require_id_verification
    // clause), the creator setting stops gating anything and this fails.
    const idx = chatSrc.indexOf(
      '(persona as any).explicitness_ceiling === "explicit" || (persona as any).require_id_verification',
    );
    expect(idx).toBeGreaterThan(-1);
  });

  it("fan-feed asset access predicate uses the SAME OR-shape (isExplicit || requireIdVerification)", () => {
    // Both gates must key off the same disjunction so a creator toggling the
    // switch produces one behaviour, not two subtly different ones.
    expect(fanFeedSrc).toContain(
      "(opts.isExplicit || opts.requireIdVerification) && !opts.idVerified",
    );
  });

  it("creators/$handle/$persona page shows a verify prompt with the same disjunction (isExplicit || requireIdVerification)", () => {
    expect(creatorsRouteSrc).toMatch(
      /persona\.isExplicit \|\| \(persona as any\)\.requireIdVerification/,
    );
    // And the prompt must link to /account (the single verification surface).
    expect(creatorsRouteSrc).toMatch(/Link to="\/account"[^>]*>[^<]*Verify your identity/);
  });

  it("chat error handler maps the ID_VERIFICATION_REQUIRED sentinel to a supporter-facing prompt with a verify action", () => {
    // The sentinel string is the contract between server (throws) and client
    // (shows prompt). If it drifts, unverified fans get a generic "Failed to
    // send" and never learn how to unblock themselves.
    expect(chatRouteSrc).toContain('message === "ID_VERIFICATION_REQUIRED"');
    expect(chatRouteSrc).toContain("needsIdVerify: true");
    // Prompt must reinforce that ID verification is a per-creator choice,
    // not a platform-wide requirement.
    expect(chatRouteSrc).toMatch(/isn't required to use Twinly|not required to use Twinly/i);
  });
});
