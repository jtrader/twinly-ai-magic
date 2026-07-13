
-- 1. Fix SECURITY DEFINER view: profiles_public
ALTER VIEW public.profiles_public SET (security_invoker = true);

-- 2. Lock down SECURITY DEFINER function execute grants.
-- Revoke from PUBLIC and anon on all; grant to authenticated only where needed.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;
END $$;

-- Grant EXECUTE to authenticated for functions used by signed-in users
-- (RLS helpers evaluated by the querying role, and legitimate RPCs).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_id_level(uuid, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_creator_access(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_creator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_creator_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_agency_consent(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_invite_grant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_adult(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_accepted_legal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_twinly_plus(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_active_agency_clients(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_selectable_agencies() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_consent_ledger_integrity(uuid) TO authenticated;

-- Anon needs a couple for public-view RLS / age-gate
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.is_adult(uuid) TO anon;

-- Trigger/internal-only functions: no grants (only table owner needs to call).
-- increment_strike_count, screen_message, seed_*, handle_new_user, append_consent_history,
-- grant_admin_for_support_email, revoke_invites_on_identity_loss, suspend_agency_links_on_id_loss,
-- prevent_audit_mutation, post_likes_counter, post_comments_counter, set_updated_at -- left with no grants.

-- 3. Admin-read policies for fail-closed internal tables.
GRANT SELECT ON public.identity_webhook_events TO authenticated;
CREATE POLICY "Admins can view identity webhook events"
  ON public.identity_webhook_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.rate_limits TO authenticated;
CREATE POLICY "Admins can view rate limits"
  ON public.rate_limits FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RSP + questionnaire tables: admin read only
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'rsp_questionnaire_submissions','rsp_privacy_safe_profiles','rsp_state_profiles',
    'rsp_curated_sequences','rsp_curated_sequence_steps','rsp_generated_briefs',
    'rsp_policy_envelopes','rsp_vault_retrieval_requests','rsp_consent_receipts',
    'rsp_audit_events','rsp_retention_deletion_jobs','questionnaire_metatag_mappings'
  ]) LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format($f$CREATE POLICY "Admins can view %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'))$f$, t);
  END LOOP;
END $$;
