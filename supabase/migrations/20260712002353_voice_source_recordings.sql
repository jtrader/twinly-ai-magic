-- Voice source recording intake (Real Me / non-explicit persona voice
-- cloning). Structural intake only — does not touch explicitness ceiling,
-- disclosure, or consent-gating logic. Consent is enforced against the
-- existing public.digital_twin_consent state (voice_ok + active + training
-- consent, since cloning trains on the creator's voice — same forTraining
-- precedent already used by assertTwinPolicy in generate-requests.functions.ts),
-- and consent_record_id links each recording to the real, immutable
-- 'ai_training' entry in the existing public.consent_records ledger.
-- Reuses the existing voice-messages storage bucket (a new bucket has no
-- precedent anywhere in this repo's migrations and can't be verified to
-- apply cleanly without live Supabase access) under a distinct path prefix,
-- with its own creator-only RLS — no fan access, unlike the chat voice-note
-- policies on that same bucket.

CREATE TYPE public.voice_source_type AS ENUM ('uploaded', 'recorded_in_app');
CREATE TYPE public.voice_source_status AS ENUM ('pending_validation', 'validated', 'rejected');

CREATE TABLE public.voice_source_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  file_ref text NOT NULL,
  duration_seconds numeric(8,2) NOT NULL,
  format text NOT NULL,
  sample_rate int NOT NULL,
  source_type public.voice_source_type NOT NULL,
  status public.voice_source_status NOT NULL DEFAULT 'pending_validation',
  rejection_reason text,
  -- The specific 'ai_training' consent_records ledger entry active at
  -- upload time — proof of which consent event authorized this recording.
  consent_record_id uuid NOT NULL REFERENCES public.consent_records(id),
  submitted_for_clone_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_voice_source_recordings_persona ON public.voice_source_recordings(persona_id, status);
CREATE INDEX idx_voice_source_recordings_creator ON public.voice_source_recordings(creator_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_source_recordings TO authenticated;
GRANT ALL ON public.voice_source_recordings TO service_role;
ALTER TABLE public.voice_source_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage own voice source recordings"
  ON public.voice_source_recordings FOR ALL
  USING (public.can_manage_creator(creator_id))
  WITH CHECK (public.can_manage_creator(creator_id));

-- Storage: voice-messages bucket, path convention
--   voice-source/{creator_id}/{persona_id}/{uuid}.{ext}
-- Creator-only (via can_manage_creator) — deliberately no fan/supporter
-- access at all, unlike the existing chat voice-note policies on this
-- same bucket, since this is private training source material.
CREATE POLICY "voice-source read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'voice-messages'
    AND split_part(name, '/', 1) = 'voice-source'
    AND public.can_manage_creator(split_part(name, '/', 2)::uuid)
  );

CREATE POLICY "voice-source insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'voice-messages'
    AND split_part(name, '/', 1) = 'voice-source'
    AND public.can_manage_creator(split_part(name, '/', 2)::uuid)
  );

CREATE POLICY "voice-source delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'voice-messages'
    AND split_part(name, '/', 1) = 'voice-source'
    AND public.can_manage_creator(split_part(name, '/', 2)::uuid)
  );
