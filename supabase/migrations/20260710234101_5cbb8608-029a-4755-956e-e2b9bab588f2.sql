
-- ============================================================
-- Security hardening migration
-- ============================================================

-- 1) profiles: remove overly permissive read policy; restrict via column grants
DROP POLICY IF EXISTS "Public read profiles basic" ON public.profiles;

REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, display_name, avatar_url) ON public.profiles TO anon, authenticated;
GRANT UPDATE (display_name, full_name, bio, avatar_url, country, profile_completed_at, age_verified_at, handle)
  ON public.profiles TO authenticated;
GRANT INSERT ON public.profiles TO authenticated;

-- Broad SELECT policy is safe because column grants restrict what non-owners can actually select
CREATE POLICY "Public read profile basics" ON public.profiles
  FOR SELECT TO anon, authenticated USING (true);

-- Owner reads of extra columns via SECURITY DEFINER helper (only self)
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_profile_status()
RETURNS TABLE(profile_completed_at timestamptz, age_verified_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT profile_completed_at, age_verified_at FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_profile_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile_status() TO authenticated;

-- 2) Convert curated views to SECURITY INVOKER
ALTER VIEW public.profiles_public SET (security_invoker = true);
ALTER VIEW public.creators_public SET (security_invoker = true);
-- Ensure the views themselves are readable
GRANT SELECT ON public.profiles_public TO anon, authenticated;
GRANT SELECT ON public.creators_public TO anon, authenticated;

-- 3) creators: allow public read of onboarded creators via the invoker-view
-- (Existing owner/agency/admin policy still handles management surfaces.)
CREATE POLICY "Public read onboarded creators" ON public.creators
  FOR SELECT TO anon, authenticated USING (onboarding_completed_at IS NOT NULL);

-- 4) post_likes: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "Anyone can read likes" ON public.post_likes;
CREATE POLICY "Authenticated read likes" ON public.post_likes
  FOR SELECT TO authenticated USING (true);

-- 5) avatars bucket: avatars are public-facing images, allow public read
DROP POLICY IF EXISTS "avatars read authenticated" ON storage.objects;
CREATE POLICY "avatars public read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'avatars');

-- 6) post-media bucket: only expose media for free, non-removed posts
DROP POLICY IF EXISTS "post-media public read" ON storage.objects;
CREATE POLICY "post-media conditional public read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (
    bucket_id = 'post-media'
    AND EXISTS (
      SELECT 1 FROM public.creator_posts p
      WHERE p.is_removed = false
        AND COALESCE(p.unlock_price_cents, 0) = 0
        AND p.image_url IS NOT NULL
        AND position(storage.objects.name in p.image_url) > 0
    )
  );
CREATE POLICY "post-media owner read" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'post-media' AND auth.uid() = owner
  );

-- 7) Tighten always-true WITH CHECK on post_comments UPDATE
DROP POLICY IF EXISTS "Authors, post owners or admins can remove comments" ON public.post_comments;
CREATE POLICY "Authors, post owners or admins can remove comments"
  ON public.post_comments FOR UPDATE TO authenticated
  USING (
    author_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.creator_posts p
      WHERE p.id = post_comments.post_id AND public.can_manage_creator(p.creator_id)
    )
  )
  WITH CHECK (
    author_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.creator_posts p
      WHERE p.id = post_comments.post_id AND public.can_manage_creator(p.creator_id)
    )
  );

-- 8) Revoke EXECUTE from anon on internal SECURITY DEFINER helpers.
--    Functions used in RLS policies must remain executable by `authenticated`
--    (the query planner still requires EXECUTE for the querying role).
REVOKE EXECUTE ON FUNCTION public.can_manage_creator(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_creator_access(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_twinly_plus(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_adult(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_creator_owner(uuid) FROM PUBLIC, anon;

-- Server-only helpers: revoke from both anon and authenticated (called via service_role)
REVOKE EXECUTE ON FUNCTION public.increment_strike_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_consent_ledger_integrity(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) FROM PUBLIC, anon;
-- log_audit is called from RLS-adjacent flows by authenticated users via RPC; keep authenticated EXECUTE
