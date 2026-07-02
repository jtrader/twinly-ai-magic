
-- Lock search_path on the two helpers still missing it and the trigger util
ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- Revoke broad execute on all SECURITY DEFINER helpers; they're only used
-- inside RLS policies and triggers, which run with definer rights regardless.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_manage_creator(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_personas() FROM PUBLIC, anon, authenticated;
