import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertAgencyClientAuthorized,
  CURRENT_AGENCY_CONSENT_POLICY_VERSION,
  VALID_AGENCY_SCOPES,
} from "../agency-consent.functions";

const consentSrc = readFileSync(
  resolve(process.cwd(), "src/lib/agency-consent.functions.ts"),
  "utf8",
);
const billingSrc = readFileSync(
  resolve(process.cwd(), "src/lib/agency-billing.functions.ts"),
  "utf8",
);

function fakeRpc(returnValue: unknown, error: any = null) {
  return { rpc: vi.fn().mockResolvedValue({ data: returnValue, error }) } as any;
}

describe("assertAgencyClientAuthorized — server-side gate", () => {
  it("throws when has_active_agency_consent returns false (fail-closed)", async () => {
    await expect(
      assertAgencyClientAuthorized(fakeRpc(false), "a1", "c1"),
    ).rejects.toThrow(/not authorized/i);
  });

  it("throws when the RPC errors — never permits on ambiguous check", async () => {
    await expect(
      assertAgencyClientAuthorized(fakeRpc(null, { message: "boom" }), "a1", "c1"),
    ).rejects.toBeTruthy();
  });

  it("resolves when the RPC returns true", async () => {
    await expect(
      assertAgencyClientAuthorized(fakeRpc(true), "a1", "c1"),
    ).resolves.toBeUndefined();
  });

  it("routes through has_active_agency_consent (SECURITY DEFINER) — not a bare RLS-shadowed read", async () => {
    const supabase = fakeRpc(true);
    await assertAgencyClientAuthorized(supabase, "agency-x", "creator-y");
    expect(supabase.rpc).toHaveBeenCalledWith("has_active_agency_consent", {
      _agency_id: "agency-x",
      _creator_id: "creator-y",
    });
  });
});

describe("Client-verify-then-consent invariants (§4b)", () => {
  it("acceptAgencyClientLink refuses without Level 1 identity — cannot bypass by direct request", () => {
    // Look for the level-1 gate BEFORE the consent upsert.
    const gateIdx = consentSrc.indexOf("has_id_level");
    const upsertIdx = consentSrc.indexOf('agency_client_consents');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(upsertIdx).toBeGreaterThan(gateIdx);
    expect(consentSrc).toMatch(/must complete identity verification/i);
  });

  it("stores the policy version + agreed scopes on consent (audit-grade)", () => {
    expect(consentSrc).toContain("policy_version: CURRENT_AGENCY_CONSENT_POLICY_VERSION");
    expect(consentSrc).toContain("agreed_scopes: data.scopes");
  });

  it("only recognises whitelisted scope strings — no arbitrary write-through", () => {
    expect(VALID_AGENCY_SCOPES).toContain("manage_personas");
    expect(VALID_AGENCY_SCOPES).toContain("manage_payouts");
    // The normalizer rejects unknown scopes.
    expect(consentSrc).toMatch(/Unknown scope/);
  });

  it("writes an audit_logs entry for request / accept / revoke — with agency + policy metadata", () => {
    for (const action of [
      "agency_client_link_requested",
      "agency_client_link_accepted",
      "agency_client_link_revoked",
    ]) {
      expect(consentSrc).toContain(`action: "${action}"`);
    }
    expect(consentSrc).toContain("policy_version: CURRENT_AGENCY_CONSENT_POLICY_VERSION");
  });

  it("revoke path accepts either the agency owner OR the client — but no one else", () => {
    expect(consentSrc).toMatch(/isAgencyOwner[\s\S]{0,100}isClient/);
    expect(consentSrc).toMatch(/Only the agency owner or the client may revoke/);
  });

  it("has a current policy version constant so re-consent can be triggered on bumps", () => {
    expect(CURRENT_AGENCY_CONSENT_POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Agency billing wiring (§4c — $25 base + $25 per client)", () => {
  it("uses two line items: one flat base + one per-client quantity", () => {
    expect(billingSrc).toMatch(/Twinly Agency — base/);
    expect(billingSrc).toMatch(/Twinly Agency — per-client seat/);
    expect(billingSrc).toMatch(/quantity:\s*Math\.max\(1,\s*activeCount\)/);
  });

  it("derives billed quantity from count_active_agency_clients RPC — the DB is source of truth", () => {
    expect(billingSrc).toContain('"count_active_agency_clients"');
    // Must run both in checkout create AND in sync path.
    const occurrences = billingSrc.match(/count_active_agency_clients/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("scopes the Stripe customer by agencyId metadata — never mixes with fan billing", () => {
    expect(billingSrc).toMatch(/metadata\['agencyId'\]/);
    expect(billingSrc).toMatch(/kind:\s*"agency"/);
  });

  it("sync path emits create_prorations so mid-cycle client changes are billed fairly", () => {
    expect(billingSrc).toMatch(/proration_behavior:\s*"create_prorations"/);
  });

  it("both billing entry points gate on agency ownership (defence-in-depth over RLS)", () => {
    const gates = billingSrc.match(/Not the agency owner/g) ?? [];
    expect(gates.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Migration invariants — schema shape survives future edits", () => {
  it("has the latest agency-consent migration file present with trigger + billing tables", () => {
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const files = readdirSync(resolve(process.cwd(), "supabase/migrations"));
    const target = files.find((f) => /agency.*consent|agency_client_consent|client_consent/i.test(f));
    expect(target, "expected an agency-consent migration file").toBeTruthy();
    if (!target) return;
    const body = readFileSync(resolve(process.cwd(), "supabase/migrations", target), "utf8");
    expect(body).toMatch(/CREATE TABLE[\s\S]*agency_client_consents/);
    expect(body).toMatch(/CREATE TABLE[\s\S]*agency_subscriptions/);
    expect(body).toMatch(/suspend_agency_links_on_id_loss/);
    expect(body).toMatch(/has_active_agency_consent/);
  });
});