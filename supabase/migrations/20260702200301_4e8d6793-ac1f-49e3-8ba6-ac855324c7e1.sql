
-- Enums
DO $$ BEGIN
  CREATE TYPE public.asset_source_type AS ENUM ('real_upload','ai_generated','edited','synthetic');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.asset_visibility AS ENUM ('private','subscribers','vip','ppv','public');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.asset_internal_label AS ENUM ('real_upload','ai_draft','approved_synthetic','restricted','do_not_use');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.generation_output_type AS ENUM ('image','audio','video','talking_head','promo_banner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.generation_request_status AS ENUM
    ('draft','queued','generating','generated','needs_review','approved','rejected','published','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend content_assets
ALTER TABLE public.content_assets
  ADD COLUMN IF NOT EXISTS source_type public.asset_source_type NOT NULL DEFAULT 'real_upload',
  ADD COLUMN IF NOT EXISTS visibility public.asset_visibility NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS usage_rights text,
  ADD COLUMN IF NOT EXISTS ai_disclosure_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_label public.asset_internal_label NOT NULL DEFAULT 'real_upload';

-- Backfill sensible defaults for existing rows
UPDATE public.content_assets SET
  source_type = CASE WHEN is_synthetic THEN 'ai_generated'::public.asset_source_type ELSE 'real_upload'::public.asset_source_type END,
  ai_disclosure_required = COALESCE(ai_generated_label, false),
  internal_label = CASE
    WHEN is_synthetic AND approval_status = 'approved' THEN 'approved_synthetic'::public.asset_internal_label
    WHEN is_synthetic THEN 'ai_draft'::public.asset_internal_label
    ELSE 'real_upload'::public.asset_internal_label
  END
WHERE source_type IS NULL OR source_type = 'real_upload';

-- Generation requests table
CREATE TABLE IF NOT EXISTS public.generation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  persona_id uuid REFERENCES public.personas(id) ON DELETE SET NULL,
  pack_id uuid REFERENCES public.content_packs(id) ON DELETE SET NULL,
  output_type public.generation_output_type NOT NULL,
  style_preset text,
  prompt_notes text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 12),
  status public.generation_request_status NOT NULL DEFAULT 'draft',
  disclosure_label text,
  produced_asset_ids uuid[] NOT NULL DEFAULT '{}',
  reviewer_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generation_requests_creator_idx ON public.generation_requests (creator_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS generation_requests_status_idx ON public.generation_requests (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generation_requests TO authenticated;
GRANT ALL ON public.generation_requests TO service_role;

ALTER TABLE public.generation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gen_req_select_owner_or_admin" ON public.generation_requests;
CREATE POLICY "gen_req_select_owner_or_admin" ON public.generation_requests
  FOR SELECT TO authenticated
  USING (public.can_manage_creator(creator_id) OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "gen_req_insert_owner" ON public.generation_requests;
CREATE POLICY "gen_req_insert_owner" ON public.generation_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_creator(creator_id));

DROP POLICY IF EXISTS "gen_req_update_owner_or_admin" ON public.generation_requests;
CREATE POLICY "gen_req_update_owner_or_admin" ON public.generation_requests
  FOR UPDATE TO authenticated
  USING (public.can_manage_creator(creator_id) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.can_manage_creator(creator_id) OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "gen_req_delete_owner" ON public.generation_requests;
CREATE POLICY "gen_req_delete_owner" ON public.generation_requests
  FOR DELETE TO authenticated
  USING (public.can_manage_creator(creator_id));

DROP TRIGGER IF EXISTS trg_gen_req_updated_at ON public.generation_requests;
CREATE TRIGGER trg_gen_req_updated_at
  BEFORE UPDATE ON public.generation_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
