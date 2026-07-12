ALTER TABLE public.personas
  ADD COLUMN require_id_verification boolean NOT NULL DEFAULT false;
