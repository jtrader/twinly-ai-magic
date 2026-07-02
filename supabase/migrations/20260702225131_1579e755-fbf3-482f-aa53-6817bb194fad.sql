
-- =========================================================
-- creators: restrict full-row read; publish a safe public view
-- =========================================================
DROP POLICY IF EXISTS "Anyone can view verified creators" ON public.creators;

CREATE POLICY "Owners, agencies, admins read creators"
  ON public.creators FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.can_manage_creator(id)
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE OR REPLACE VIEW public.creators_public
WITH (security_invoker = true) AS
SELECT
  id,
  handle,
  stage_name,
  bio,
  avatar_url,
  cover_url,
  verification_status,
  away_mode,
  created_at
FROM public.creators
WHERE onboarding_completed_at IS NOT NULL;

GRANT SELECT ON public.creators_public TO anon, authenticated;

-- =========================================================
-- profiles: only owner/admin read full rows; public browsing via profiles_public view
-- =========================================================
DROP POLICY IF EXISTS "Public can read safe profile columns" ON public.profiles;
DROP POLICY IF EXISTS "Profiles readable by authenticated users" ON public.profiles;

CREATE POLICY "Owners read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- personas: public read policy for published personas
-- =========================================================
CREATE POLICY "Public can read published personas"
  ON public.personas FOR SELECT
  TO anon, authenticated
  USING (
    visibility = 'public'
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );

-- =========================================================
-- content_packs: public read policy for approved packs
-- =========================================================
CREATE POLICY "Public can read approved packs"
  ON public.content_packs FOR SELECT
  TO anon, authenticated
  USING (
    status = 'approved'
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );

-- =========================================================
-- content_assets: tighten public read to visibility + approval
-- =========================================================
DROP POLICY IF EXISTS "Signed-in users can view approved assets" ON public.content_assets;

CREATE POLICY "Anon can view public approved assets"
  ON public.content_assets FOR SELECT
  TO anon
  USING (
    approval_status = 'approved'
    AND visibility = 'public'
  );

CREATE POLICY "Authenticated can view non-private approved assets"
  ON public.content_assets FOR SELECT
  TO authenticated
  USING (
    (approval_status = 'approved' AND visibility <> 'private')
    OR public.can_manage_creator(creator_id)
  );

-- =========================================================
-- transactions: tighten insert policy
-- =========================================================
DROP POLICY IF EXISTS "Fan inserts own transactions" ON public.transactions;

CREATE POLICY "Fan inserts own stub transactions"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = fan_id
    AND status = 'stub'
    AND amount_cents >= 0
    AND EXISTS (SELECT 1 FROM public.creators c WHERE c.id = creator_id)
  );

-- =========================================================
-- SECURITY DEFINER functions: revoke EXECUTE from anon/authenticated
-- for functions that should only run via triggers or trusted server code.
-- =========================================================
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_admin_for_support_email() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_packs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_personas() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.append_consent_history() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_audit_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon;
