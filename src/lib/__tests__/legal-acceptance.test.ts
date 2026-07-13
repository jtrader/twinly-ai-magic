import { describe, expect, it, vi, beforeEach } from "vitest";

// Server-side enforcement: assertLegalAccepted() must throw
// LEGAL_ACCEPTANCE_REQUIRED when the RPC says the user has not
// accepted the current version — preventing direct-request bypass.

import { assertLegalAccepted, LEGAL_ACCEPTANCE_VERSION } from "../legal-acceptance.functions";

function makeContext(rpcResult: { data: any; error: any }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  return {
    context: { supabase: { rpc }, userId: "user-1" },
    rpc,
  };
}

describe("assertLegalAccepted (server-side bypass guard)", () => {
  it("throws LEGAL_ACCEPTANCE_REQUIRED when the user has no acceptance on file", async () => {
    const { context, rpc } = makeContext({ data: false, error: null });
    await expect(assertLegalAccepted(context as any)).rejects.toThrow(/LEGAL_ACCEPTANCE_REQUIRED/);
    expect(rpc).toHaveBeenCalledWith("has_accepted_legal", {
      _user_id: "user-1",
      _min_version: LEGAL_ACCEPTANCE_VERSION,
    });
  });

  it("resolves silently when the RPC confirms an accepted version", async () => {
    const { context } = makeContext({ data: true, error: null });
    await expect(assertLegalAccepted(context as any)).resolves.toBeUndefined();
  });

  it("bubbles a generic error if the RPC itself fails", async () => {
    const { context } = makeContext({ data: null, error: { message: "boom" } });
    await expect(assertLegalAccepted(context as any)).rejects.toThrow(/Legal acceptance check failed/);
  });

  it("accepts a custom minimum version when re-prompting on policy updates", async () => {
    const { context, rpc } = makeContext({ data: true, error: null });
    await assertLegalAccepted(context as any, "2027-01-01");
    expect(rpc).toHaveBeenCalledWith("has_accepted_legal", {
      _user_id: "user-1",
      _min_version: "2027-01-01",
    });
  });
});