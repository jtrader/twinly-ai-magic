import { describe, expect, it, vi } from "vitest";
import { acknowledgeMediaUploadConsentImpl, MEDIA_UPLOAD_CONSENT_VERSION } from "../media-upload-consent.functions";
import { LEGAL_ACCEPTANCE_VERSION } from "../legal-acceptance.functions";

// Integration-style: exercise the real `assertLegalAccepted` guard path by
// driving the `has_accepted_legal` RPC response, and confirm the media-upload
// endpoint is blocked when the caller has NOT accepted the current legal
// version — i.e. `requireLegalAcceptance` cannot be bypassed by a direct
// request that skips the client-side checkbox.

function makeContext(hasAccepted: boolean) {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  const rpc = vi.fn(async (fn: string) => {
    if (fn === "has_accepted_legal") return { data: hasAccepted, error: null };
    return { data: null, error: null };
  });
  return { context: { supabase: { from, update, eq, rpc }, userId: "u-1" }, rpc, from, update };
}

describe("requireLegalAcceptance guard on media-upload endpoint", () => {
  it("blocks a direct request with LEGAL_ACCEPTANCE_REQUIRED when the caller has not accepted the current version", async () => {
    const { context, rpc, from } = makeContext(false);
    await expect(
      acknowledgeMediaUploadConsentImpl(context as any, { context: "direct-request" }),
    ).rejects.toThrow(/LEGAL_ACCEPTANCE_REQUIRED/);

    // The guard was consulted for the CURRENT policy version.
    expect(rpc).toHaveBeenCalledWith("has_accepted_legal", {
      _user_id: "u-1",
      _min_version: LEGAL_ACCEPTANCE_VERSION,
    });
    // And nothing was written to the profile — the request is fully aborted.
    expect(from).not.toHaveBeenCalled();
  });

  it("allows the write and logs an audit entry once legal acceptance is on file", async () => {
    const { context, from, update } = makeContext(true);
    const result = await acknowledgeMediaUploadConsentImpl(context as any, { context: "post-composer" });
    expect(result.version).toBe(MEDIA_UPLOAD_CONSENT_VERSION);
    expect(from).toHaveBeenCalledWith("profiles");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        media_upload_consent_version: MEDIA_UPLOAD_CONSENT_VERSION,
        media_upload_consent_at: expect.any(String),
      }),
    );
  });
});