
-- Persona ↔ twin reference linking
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS twin_link_mode text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS linked_twin_ref_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.personas
  DROP CONSTRAINT IF EXISTS personas_twin_link_mode_chk;
ALTER TABLE public.personas
  ADD CONSTRAINT personas_twin_link_mode_chk
  CHECK (twin_link_mode IN ('all','selected','none'));

-- Twin reference review workflow + soft-delete version history
ALTER TABLE public.twin_reference_assets
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS replaces_id uuid;

ALTER TABLE public.twin_reference_assets
  DROP CONSTRAINT IF EXISTS twin_refs_review_status_chk;
ALTER TABLE public.twin_reference_assets
  ADD CONSTRAINT twin_refs_review_status_chk
  CHECK (review_status IN ('draft','pending','approved','rejected'));

CREATE INDEX IF NOT EXISTS twin_refs_review_idx
  ON public.twin_reference_assets (review_status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS twin_refs_deleted_idx
  ON public.twin_reference_assets (creator_id, kind, deleted_at);
