
-- Tighten post_likes SELECT: only likes on posts visible to the requester
DROP POLICY IF EXISTS "Authenticated read likes" ON public.post_likes;
CREATE POLICY "Read likes on visible posts"
  ON public.post_likes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.creator_posts p
      WHERE p.id = post_likes.post_id
        AND (
          p.is_removed = false
          OR public.can_manage_creator(p.creator_id)
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
        )
    )
  );

-- Revoke direct signed-in-user execute on SECURITY DEFINER helpers
-- that are only invoked by trusted server code (service role).
REVOKE EXECUTE ON FUNCTION public.has_twinly_plus(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_strike_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_consent_ledger_integrity(uuid) FROM PUBLIC, anon, authenticated;
