import { describe, expect, it, vi } from "vitest";
import { recordLegalAcceptance, LEGAL_ACCEPTANCE_VERSION } from "../legal-acceptance.functions";

function makeSupabaseMock() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  return { supabase: { from, update, eq, rpc } };
}

describe("recordLegalAcceptance → admin audit log", () => {
  it("writes an audit_logs entry with the current policy version, timestamp, and user id", async () => {
    const { supabase } = makeSupabaseMock();
    const before = Date.now();
    const result = await recordLegalAcceptance(
      { supabase, userId: "user-42" },
      { context: "signup_form" },
    );
    const after = Date.now();

    // Profile write scoped to the caller.
    expect(supabase.from).toHaveBeenCalledWith("profiles");
    expect(supabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        legal_accepted_version: LEGAL_ACCEPTANCE_VERSION,
        legal_accepted_at: expect.any(String),
      }),
    );
    expect(supabase.eq).toHaveBeenCalledWith("id", "user-42");

    // Admin-visible audit row via SECURITY DEFINER log_audit RPC.
    expect(supabase.rpc).toHaveBeenCalledWith(
      "log_audit",
      expect.objectContaining({
        _action: "legal.accepted",
        _subject_type: "profile",
        _subject_id: "user-42",
        _metadata: expect.objectContaining({
          version: LEGAL_ACCEPTANCE_VERSION,
          context: "signup_form",
          accepted_at: expect.any(String),
        }),
      }),
    );

    const acceptedMs = new Date(result.acceptedAt).getTime();
    expect(acceptedMs).toBeGreaterThanOrEqual(before);
    expect(acceptedMs).toBeLessThanOrEqual(after);
    expect(result.version).toBe(LEGAL_ACCEPTANCE_VERSION);
  });

  it("honours a caller-supplied policy version when re-prompting", async () => {
    const { supabase } = makeSupabaseMock();
    await recordLegalAcceptance(
      { supabase, userId: "user-9" },
      { version: "2027-01-01", context: "reprompt" },
    );
    expect(supabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ legal_accepted_version: "2027-01-01" }),
    );
    expect(supabase.rpc.mock.calls[0][1]._metadata.version).toBe("2027-01-01");
  });
});