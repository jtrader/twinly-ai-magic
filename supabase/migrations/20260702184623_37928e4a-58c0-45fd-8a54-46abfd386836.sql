
-- Helper: extract creator_id (first path segment) from storage object name
-- We assume path layout: "<creator_id>/..." for all three buckets.

-- content-assets: manager (creator owner OR agency OR admin) can CRUD
DROP POLICY IF EXISTS "content-assets: manager read"   ON storage.objects;
DROP POLICY IF EXISTS "content-assets: manager write"  ON storage.objects;
DROP POLICY IF EXISTS "content-assets: manager update" ON storage.objects;
DROP POLICY IF EXISTS "content-assets: manager delete" ON storage.objects;

CREATE POLICY "content-assets: manager read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'content-assets'
    AND public.can_manage_creator( (split_part(name,'/',1))::uuid )
  );
CREATE POLICY "content-assets: manager write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'content-assets'
    AND public.can_manage_creator( (split_part(name,'/',1))::uuid )
  );
CREATE POLICY "content-assets: manager update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'content-assets'
    AND public.can_manage_creator( (split_part(name,'/',1))::uuid )
  );
CREATE POLICY "content-assets: manager delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'content-assets'
    AND public.can_manage_creator( (split_part(name,'/',1))::uuid )
  );

-- verification-evidence: creator-owner insert; owner OR admin read; no update/delete
DROP POLICY IF EXISTS "verification-evidence: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "verification-evidence: owner read"   ON storage.objects;

CREATE POLICY "verification-evidence: owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'verification-evidence'
    AND public.is_creator_owner( (split_part(name,'/',1))::uuid )
  );
CREATE POLICY "verification-evidence: owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'verification-evidence'
    AND (
      public.is_creator_owner( (split_part(name,'/',1))::uuid )
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- consent-signatures: same shape as verification-evidence
DROP POLICY IF EXISTS "consent-signatures: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "consent-signatures: owner read"   ON storage.objects;

CREATE POLICY "consent-signatures: owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'consent-signatures'
    AND public.is_creator_owner( (split_part(name,'/',1))::uuid )
  );
CREATE POLICY "consent-signatures: owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'consent-signatures'
    AND (
      public.is_creator_owner( (split_part(name,'/',1))::uuid )
      OR public.has_role(auth.uid(), 'admin')
    )
  );
