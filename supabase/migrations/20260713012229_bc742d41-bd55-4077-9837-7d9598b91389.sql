-- 1) creators_public_read_sensitive_columns:
-- Drop the broad public SELECT policy on creators. All app code that shows
-- public creator info uses supabaseAdmin server-side (bypasses RLS) or the
-- safe `creators_public` view. Owner/agency/admin reads remain covered by
-- the existing "Owners, agencies, admins read creators" policy.
DROP POLICY IF EXISTS "Public read onboarded creators" ON public.creators;

-- 2) messages_fan_sender_type_spoof:
-- Recreate the fan INSERT policy with a sender_type='fan' guard so fans
-- cannot spoof creator/persona messages in their own conversations.
DROP POLICY IF EXISTS "Fan writes own messages" ON public.messages;
CREATE POLICY "Fan writes own messages"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_type = 'fan'::sender_type
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.fan_id = auth.uid()
    )
  );

-- 3) SUPA_authenticated_security_definer_function_executable:
-- Revoke EXECUTE from PUBLIC/anon on internal SECURITY DEFINER helpers.
-- Re-grant to `authenticated` only where a policy or client RPC needs it,
-- and always to `service_role` for server-side callers.
-- Helpers referenced by RLS policies must stay callable by `authenticated`
-- (Postgres evaluates policy expressions as the querying role).

-- Fully internal helpers: no direct caller in client or policy.
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_strike_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_strike_count(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.verify_consent_ledger_integrity(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.verify_consent_ledger_integrity(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.has_twinly_plus(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.has_twinly_plus(uuid) TO service_role;

-- Trigger-only functions.
REVOKE EXECUTE ON FUNCTION public.append_consent_history() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.append_consent_history() TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE EXECUTE ON FUNCTION public.grant_admin_for_support_email() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.grant_admin_for_support_email() TO service_role;

REVOKE EXECUTE ON FUNCTION public.seed_default_packs() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.seed_default_packs() TO service_role;

REVOKE EXECUTE ON FUNCTION public.seed_default_personas() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.seed_default_personas() TO service_role;

-- Policy/RPC helpers: revoke from PUBLIC and anon, keep authenticated.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.can_manage_creator(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_manage_creator(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_creator_owner(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_creator_owner(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_creator_access(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_creator_access(uuid, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_adult(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_adult(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_profile() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_my_profile_status() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_profile_status() TO authenticated, service_role;