ALTER TABLE public.personas
  ADD COLUMN intro_video_asset_id uuid REFERENCES public.content_assets(id) ON DELETE SET NULL;
