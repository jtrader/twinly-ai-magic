-- Row 5.6: block/mute. Fans and creators can block each other's underlying
-- auth user; enforced in sendPersonaMessage / sendCreatorReply.
CREATE TABLE public.blocked_users (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocked_users_not_self CHECK (blocker_id <> blocked_id)
);

GRANT SELECT, INSERT, DELETE ON public.blocked_users TO authenticated;
GRANT ALL ON public.blocked_users TO service_role;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

-- A user can only see/create/remove blocks where THEY are the blocker.
-- (Checking whether you're blocked BY someone else goes through the
-- is_blocked() SECURITY DEFINER helper below, not direct table access.)
CREATE POLICY "Manage own blocks"
  ON public.blocked_users FOR ALL
  USING (blocker_id = auth.uid())
  WITH CHECK (blocker_id = auth.uid());

-- SECURITY DEFINER helper: checks a block in EITHER direction between two
-- users. Callers need EXECUTE to invoke it at all (SECURITY DEFINER only
-- changes privileges *inside* the function body, not whether a caller may
-- invoke it) — mirrors the working is_adult()/screen_message() pattern.
CREATE OR REPLACE FUNCTION public.is_blocked(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = _a AND blocked_id = _b)
       OR (blocker_id = _b AND blocked_id = _a)
  )
$$;
REVOKE ALL ON FUNCTION public.is_blocked(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) TO authenticated;
