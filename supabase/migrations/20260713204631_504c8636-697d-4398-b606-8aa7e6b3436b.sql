ALTER TABLE public.real_me_profile_versions
  ADD COLUMN IF NOT EXISTS generation_seed jsonb;