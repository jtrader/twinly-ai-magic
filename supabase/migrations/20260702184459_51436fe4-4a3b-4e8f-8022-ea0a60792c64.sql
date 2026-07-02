
-- ============ profiles: age + explicit ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS age_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS explicit_content_opt_in boolean NOT NULL DEFAULT false;

-- ============ personas: explicit flag ============
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS is_explicit boolean NOT NULL DEFAULT false;

-- ============ creators: lowercase handle enforcement ============
ALTER TABLE public.creators
  DROP CONSTRAINT IF EXISTS creators_handle_lowercase_chk;
ALTER TABLE public.creators
  ADD CONSTRAINT creators_handle_lowercase_chk CHECK (handle = lower(handle));

-- ============ public profiles view ============
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
  WITH (security_invoker = true)
  AS SELECT id, display_name, avatar_url FROM public.profiles;
GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- Allow anon SELECT of just the safe cols via the view (RLS on base still restricts).
-- Since security_invoker=true, view runs under caller; add a permissive-for-anon policy limited to those columns via a policy on base table? Simpler: use security_definer view.
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
  WITH (security_invoker = false)
  AS SELECT id, display_name, avatar_url FROM public.profiles;
GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- ============ creator-owner helper (consent gate) ============
CREATE OR REPLACE FUNCTION public.is_creator_owner(_creator_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.creators
    WHERE id = _creator_id AND user_id = auth.uid()
  )
$$;
REVOKE ALL ON FUNCTION public.is_creator_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_creator_owner(uuid) TO authenticated;

-- Retighten digital_twin_consent policies (drop existing then recreate)
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='digital_twin_consent' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.digital_twin_consent', p.policyname);
  END LOOP;
END$$;

CREATE POLICY "Creator owner can view consent"
  ON public.digital_twin_consent FOR SELECT TO authenticated
  USING (public.is_creator_owner(creator_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Creator owner can insert consent"
  ON public.digital_twin_consent FOR INSERT TO authenticated
  WITH CHECK (public.is_creator_owner(creator_id));

CREATE POLICY "Creator owner can update consent"
  ON public.digital_twin_consent FOR UPDATE TO authenticated
  USING (public.is_creator_owner(creator_id))
  WITH CHECK (public.is_creator_owner(creator_id));

-- ============ consent history trigger ============
CREATE OR REPLACE FUNCTION public.append_consent_history()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.consent_records (creator_id, kind, valid_from, revoked_at)
  VALUES (
    NEW.creator_id,
    'digital_twin',
    NEW.signed_at,
    NEW.revoked_at
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consent_history ON public.digital_twin_consent;
CREATE TRIGGER trg_consent_history
  AFTER INSERT OR UPDATE ON public.digital_twin_consent
  FOR EACH ROW EXECUTE FUNCTION public.append_consent_history();

-- ============ audit_logs ============
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  action text NOT NULL,
  subject_type text,
  subject_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Prevent update/delete on audit_logs (append-only)
CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END;
$$;
DROP TRIGGER IF EXISTS trg_audit_no_update ON public.audit_logs;
CREATE TRIGGER trg_audit_no_update
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

CREATE OR REPLACE FUNCTION public.log_audit(
  _action text, _subject_type text DEFAULT NULL,
  _subject_id uuid DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.audit_logs (actor_user_id, action, subject_type, subject_id, metadata)
  VALUES (auth.uid(), _action, _subject_type, _subject_id, COALESCE(_metadata, '{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.log_audit(text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_audit(text,text,uuid,jsonb) TO authenticated, service_role;

-- ============ rate_limits ============
CREATE TABLE IF NOT EXISTS public.rate_limits (
  user_id uuid NOT NULL,
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket, window_start)
);
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only accessible via SECURITY DEFINER helper below.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket text, _limit int, _window_seconds int
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _win timestamptz := date_trunc('second', now()) - make_interval(secs => (extract(epoch from now())::int % _window_seconds));
  _cur int;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  INSERT INTO public.rate_limits (user_id, bucket, window_start, count)
    VALUES (auth.uid(), _bucket, _win, 1)
  ON CONFLICT (user_id, bucket, window_start)
    DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO _cur;
  RETURN _cur <= _limit;
END;
$$;
REVOKE ALL ON FUNCTION public.check_rate_limit(text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text,int,int) TO authenticated;

-- ============ moderation: severity + auto_flagged + screener ============
ALTER TABLE public.moderation_events
  ADD COLUMN IF NOT EXISTS auto_flagged boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.screen_message(_text text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  t text := lower(coalesce(_text, ''));
BEGIN
  -- Critical: hard-block terms (illegal content indicators). Keep short + editable.
  IF t ~ '(child|minor|underage|cp)\s*(porn|sex|nude)' THEN RETURN 'critical'; END IF;
  IF t ~ '(rape|kill\s+yourself|suicide\s+method)' THEN RETURN 'high'; END IF;
  IF t ~ '(scam|phish|credit\s*card\s*number)' THEN RETURN 'medium'; END IF;
  RETURN 'low';
END;
$$;
REVOKE ALL ON FUNCTION public.screen_message(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.screen_message(text) TO authenticated, service_role;

-- ============ age gate helper (server-side) ============
CREATE OR REPLACE FUNCTION public.is_adult(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT age_verified_at IS NOT NULL FROM public.profiles WHERE id = _user_id),
    false
  )
$$;
REVOKE ALL ON FUNCTION public.is_adult(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_adult(uuid) TO authenticated;
