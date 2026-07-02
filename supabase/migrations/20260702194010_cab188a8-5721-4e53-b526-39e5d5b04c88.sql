
-- twin reference kind enum
DO $$ BEGIN
  CREATE TYPE public.twin_ref_kind AS ENUM ('identity_ref','voice_ref','style_ref');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.twin_reference_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  kind public.twin_ref_kind NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  slot_label text,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.twin_reference_assets TO authenticated;
GRANT ALL ON public.twin_reference_assets TO service_role;

ALTER TABLE public.twin_reference_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "twin refs manageable by creator/manager"
  ON public.twin_reference_assets FOR ALL
  TO authenticated
  USING (public.can_manage_creator(creator_id))
  WITH CHECK (public.can_manage_creator(creator_id));

CREATE INDEX IF NOT EXISTS twin_reference_assets_creator_kind_idx
  ON public.twin_reference_assets(creator_id, kind, sort_order);

CREATE TRIGGER trg_twin_refs_updated
  BEFORE UPDATE ON public.twin_reference_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- extend consent + creators
ALTER TABLE public.digital_twin_consent
  ADD COLUMN IF NOT EXISTS forbidden_uses jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS style_notes jsonb NOT NULL DEFAULT '{}'::jsonb;
