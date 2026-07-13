ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS media_upload_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS media_upload_consent_version TEXT;