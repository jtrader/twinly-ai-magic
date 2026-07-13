
ALTER TABLE public.personas
  ADD COLUMN intro_video_asset_id uuid REFERENCES public.content_assets(id) ON DELETE SET NULL;

ALTER TABLE public.real_me_profile_versions RENAME COLUMN answers TO responses;
ALTER TABLE public.real_me_profile_versions
  ADD COLUMN completion_percentage int NOT NULL DEFAULT 0;

ALTER TABLE public.persona_real_me_references
  ADD COLUMN synced_at timestamptz;
