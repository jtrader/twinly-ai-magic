import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export const acknowledgeMediaUploadConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AckSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("profiles")
      .update({
        media_upload_consent_at: nowIso,
        media_upload_consent_version: MEDIA_UPLOAD_CONSENT_VERSION,
      } as any)
      .eq("id", userId);
    if (error) throw new Error(error.message);
    // Audit log (best-effort). Uses SECURITY DEFINER function log_audit.
    try {
      await (supabase as any).rpc("log_audit", {
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
  });