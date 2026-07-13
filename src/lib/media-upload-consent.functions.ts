import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertLegalAccepted } from "./legal-acceptance.functions";

export const MEDIA_UPLOAD_CONSENT_VERSION = "2026-07-13";

export const getMediaUploadConsent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("media_upload_consent_at, media_upload_consent_version")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      acceptedAt: (data as any)?.media_upload_consent_at ?? null,
      version: (data as any)?.media_upload_consent_version ?? null,
      currentVersion: MEDIA_UPLOAD_CONSENT_VERSION,
    };
  });

const AckSchema = z.object({
  context: z.string().trim().max(120).optional(),
});

/**
 * Testable helper that enforces legal acceptance, writes the media-upload
 * consent record, and logs to audit. Exposed for integration tests that
 * assert `requireLegalAcceptance` blocks direct requests when the caller
 * has not accepted the current legal version.
 */
export async function acknowledgeMediaUploadConsentImpl(
  context: { supabase: any; userId: string },
  data: { context?: string } = {},
) {
  await assertLegalAccepted(context);
  const { supabase, userId } = context;
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("profiles")
    .update({
      media_upload_consent_at: nowIso,
      media_upload_consent_version: MEDIA_UPLOAD_CONSENT_VERSION,
    })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  try {
    await supabase.rpc("log_audit", {
      _action: "media_upload_consent.accepted",
      _subject_type: "profile",
      _subject_id: userId,
      _metadata: {
        version: MEDIA_UPLOAD_CONSENT_VERSION,
        context: data.context ?? null,
        accepted_at: nowIso,
      },
    });
  } catch (e) {
    console.warn("[media-upload-consent] audit log failed", e);
  }
  return { ok: true, acceptedAt: nowIso, version: MEDIA_UPLOAD_CONSENT_VERSION };
}

export const acknowledgeMediaUploadConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AckSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => acknowledgeMediaUploadConsentImpl(context as any, data));