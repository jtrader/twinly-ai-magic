-- Security hardening (retry with correct feed_visibility_tier enum values).

DROP POLICY IF EXISTS "Authenticated can list agencies" ON public.agencies;

CREATE OR REPLACE FUNCTION public.list_selectable_agencies()
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.name FROM public.agencies a ORDER BY a.name ASC
$$;
REVOKE ALL ON FUNCTION public.list_selectable_agencies() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_selectable_agencies() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_selectable_agencies() TO authenticated;

DROP POLICY IF EXISTS "Anyone can read polls" ON public.polls;
DROP POLICY IF EXISTS "Anyone can read poll options" ON public.poll_options;

CREATE POLICY "Read polls by visibility"
ON public.polls
FOR SELECT
USING (
  visibility = 'public'::feed_visibility_tier
  OR (visibility = 'logged_in'::feed_visibility_tier AND auth.uid() IS NOT NULL)
  OR public.can_manage_creator(creator_id)
  OR (
    auth.uid() IS NOT NULL
    AND visibility = 'subscribers_only'::feed_visibility_tier
    AND public.has_creator_access(auth.uid(), creator_id, 'base')
  )
);

CREATE POLICY "Read poll options by parent visibility"
ON public.poll_options
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = poll_options.poll_id
      AND (
        p.visibility = 'public'::feed_visibility_tier
        OR (p.visibility = 'logged_in'::feed_visibility_tier AND auth.uid() IS NOT NULL)
        OR public.can_manage_creator(p.creator_id)
        OR (
          auth.uid() IS NOT NULL
          AND p.visibility = 'subscribers_only'::feed_visibility_tier
          AND public.has_creator_access(auth.uid(), p.creator_id, 'base')
        )
      )
  )
);

DROP POLICY IF EXISTS "Public read profile basics" ON public.profiles;

CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = false)
AS
SELECT id, display_name, avatar_url
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.append_consent_history() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_admin_for_support_email() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_invites_on_identity_loss() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_packs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_personas() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.suspend_agency_links_on_id_loss() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_strike_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.count_active_agency_clients(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_consent_ledger_integrity(uuid) FROM PUBLIC, anon, authenticated;