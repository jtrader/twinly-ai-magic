ALTER TABLE public.agency_creators
  ADD COLUMN IF NOT EXISTS requested_by TEXT NOT NULL DEFAULT 'agency'
    CHECK (requested_by IN ('agency','creator')),
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS agreement_version TEXT,
  ADD COLUMN IF NOT EXISTS agreement_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS request_note TEXT,
  ADD COLUMN IF NOT EXISTS requested_scopes JSONB;

DROP POLICY IF EXISTS "Creator requests own agency link" ON public.agency_creators;
CREATE POLICY "Creator requests own agency link"
  ON public.agency_creators FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND requested_by = 'creator'
    AND EXISTS (SELECT 1 FROM public.creators WHERE id = creator_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Creator cancels own pending request" ON public.agency_creators;
CREATE POLICY "Creator cancels own pending request"
  ON public.agency_creators FOR DELETE TO authenticated
  USING (
    status = 'pending'
    AND requested_by = 'creator'
    AND EXISTS (SELECT 1 FROM public.creators WHERE id = creator_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated can list agencies" ON public.agencies;
CREATE POLICY "Authenticated can list agencies"
  ON public.agencies FOR SELECT TO authenticated USING (true);