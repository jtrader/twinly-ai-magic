ALTER TABLE public.profiles ADD COLUMN strike_count INT NOT NULL DEFAULT 0;

-- Atomic increment, called only from moderation.server.ts via the
-- service-role client (screenMessage already flagged the message
-- critical/high before this ever fires) — mirrors the working is_adult()
-- grant pattern: REVOKE ALL then an explicit, narrow GRANT, not the mistake
-- that broke has_role() earlier (this one only needs service_role, never
-- authenticated/anon, since it's never called from a client request).
CREATE OR REPLACE FUNCTION public.increment_strike_count(_user_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _count int;
BEGIN
  UPDATE public.profiles SET strike_count = strike_count + 1 WHERE id = _user_id
  RETURNING strike_count INTO _count;
  RETURN COALESCE(_count, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.increment_strike_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_strike_count(uuid) TO service_role;
