ALTER TABLE public.content_assets
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_job_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_error text,
  ADD COLUMN IF NOT EXISTS render_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS render_completed_at timestamptz;

CREATE INDEX IF NOT EXISTS content_assets_provider_job_id_idx
  ON public.content_assets(provider, provider_job_id)
  WHERE provider_job_id IS NOT NULL;

ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS heygen_avatar_id text,
  ADD COLUMN IF NOT EXISTS heygen_voice_id text;