-- blocked_users
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
CREATE POLICY "Manage own blocks" ON public.blocked_users FOR ALL
  USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_blocked(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = _a AND blocked_id = _b) OR (blocker_id = _b AND blocked_id = _a)
  )
$$;
REVOKE ALL ON FUNCTION public.is_blocked(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) TO authenticated;

-- generation caps + regen lineage
ALTER TABLE public.creators ADD COLUMN generation_spend_cap_cents INT;
ALTER TABLE public.generation_requests
  ADD COLUMN regenerated_from_id UUID REFERENCES public.generation_requests(id) ON DELETE SET NULL,
  ADD COLUMN regeneration_count INT NOT NULL DEFAULT 0;

-- has_role / can_manage_creator execute grants
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_creator(uuid) TO authenticated, anon;

-- content asset storage + sharing
ALTER TABLE public.content_assets
  ADD COLUMN byte_size BIGINT,
  ADD COLUMN shared_across_personas BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_content_assets_shared ON public.content_assets(creator_id) WHERE shared_across_personas = true;

-- notifications
CREATE TYPE public.notification_type AS ENUM (
  'new_content','persona_reply','escalation_requested','escalation_accepted','escalation_declined'
);
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link_path TEXT,
  persona_id UUID REFERENCES public.personas(id) ON DELETE SET NULL,
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users mark own notifications read" ON public.notifications FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  push_enabled BOOLEAN NOT NULL DEFAULT false,
  new_content BOOLEAN NOT NULL DEFAULT true,
  persona_reply BOOLEAN NOT NULL DEFAULT true,
  escalation_updates BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notification preferences" ON public.notification_preferences FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- escalation_requests
CREATE TYPE public.escalation_status AS ENUM ('requested','accepted','declined','expired');
CREATE TABLE public.escalation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  from_persona_id UUID NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  status public.escalation_status NOT NULL DEFAULT 'requested',
  price_cents INT NOT NULL DEFAULT 0,
  message TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours')
);
CREATE INDEX idx_escalation_creator_status ON public.escalation_requests(creator_id, status);
CREATE INDEX idx_escalation_supporter ON public.escalation_requests(supporter_id);
GRANT SELECT, INSERT, UPDATE ON public.escalation_requests TO authenticated;
GRANT ALL ON public.escalation_requests TO service_role;
ALTER TABLE public.escalation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Supporters manage own escalation requests" ON public.escalation_requests FOR ALL
  USING (supporter_id = auth.uid()) WITH CHECK (supporter_id = auth.uid());
CREATE POLICY "Creators manage escalation requests for their personas" ON public.escalation_requests FOR ALL
  USING (public.can_manage_creator(creator_id)) WITH CHECK (public.can_manage_creator(creator_id));

-- persona_memory
ALTER TABLE public.personas ADD COLUMN memory_enabled BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE public.persona_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  fan_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  message_count_at_summary INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (persona_id, fan_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.persona_memory TO authenticated;
GRANT ALL ON public.persona_memory TO service_role;
ALTER TABLE public.persona_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Fan reads own persona memory" ON public.persona_memory FOR SELECT USING (fan_id = auth.uid());
CREATE POLICY "Fan clears own persona memory" ON public.persona_memory FOR DELETE USING (fan_id = auth.uid());
CREATE POLICY "Creator reads persona memory for own persona" ON public.persona_memory FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.personas p WHERE p.id = persona_id AND public.can_manage_creator(p.creator_id)));

-- abuse strikes
ALTER TABLE public.profiles ADD COLUMN strike_count INT NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.increment_strike_count(_user_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _count int;
BEGIN
  UPDATE public.profiles SET strike_count = strike_count + 1 WHERE id = _user_id
  RETURNING strike_count INTO _count;
  RETURN COALESCE(_count, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.increment_strike_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_strike_count(uuid) TO service_role;

-- verification revoked + provider
ALTER TYPE public.verification_status ADD VALUE IF NOT EXISTS 'revoked';
ALTER TABLE public.creators
  ADD COLUMN verification_provider TEXT,
  ADD COLUMN verification_provider_ref TEXT;

-- explicitness + platform_settings
CREATE TYPE public.explicitness_level AS ENUM ('sfw','suggestive','explicit');
CREATE TABLE public.platform_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  max_explicitness_ceiling public.explicitness_level NOT NULL DEFAULT 'explicit',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
INSERT INTO public.platform_settings (id) VALUES (true);
GRANT SELECT ON public.platform_settings TO authenticated, anon;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read platform settings" ON public.platform_settings FOR SELECT USING (true);
ALTER TABLE public.personas ADD COLUMN explicitness_ceiling public.explicitness_level NOT NULL DEFAULT 'sfw';

-- consent ledger hash chain + integrity check
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE public.digital_twin_consent
  ADD COLUMN training_consent_signed_at TIMESTAMPTZ,
  ADD COLUMN training_consent_revoked_at TIMESTAMPTZ;
ALTER TABLE public.consent_records
  ADD COLUMN record_hash TEXT,
  ADD COLUMN prev_hash TEXT;
REVOKE INSERT, UPDATE, DELETE ON public.consent_records FROM authenticated;
DROP POLICY IF EXISTS "Creator/agency manages consent records" ON public.consent_records;
CREATE POLICY "Creator/agency reads own consent records" ON public.consent_records FOR SELECT
  USING (public.can_manage_creator(creator_id));

CREATE OR REPLACE FUNCTION public.append_consent_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _prev_hash TEXT;
  _payload TEXT;
  _new_hash TEXT;
  _now TIMESTAMPTZ := now();
  _training_changed BOOLEAN := (TG_OP = 'INSERT');
BEGIN
  IF TG_OP = 'UPDATE' THEN
    _training_changed := (NEW.training_consent_signed_at IS DISTINCT FROM OLD.training_consent_signed_at)
                       OR (NEW.training_consent_revoked_at IS DISTINCT FROM OLD.training_consent_revoked_at);
  END IF;
  SELECT record_hash INTO _prev_hash FROM public.consent_records
    WHERE creator_id = NEW.creator_id ORDER BY created_at DESC, id DESC LIMIT 1;
  _payload := coalesce(_prev_hash,'') || '|' || NEW.creator_id::text || '|digital_twin|' ||
              coalesce(NEW.signed_at::text,'') || '|' || coalesce(NEW.revoked_at::text,'') || '|' || _now::text;
  _new_hash := encode(digest(_payload,'sha256'),'hex');
  INSERT INTO public.consent_records (creator_id, kind, valid_from, revoked_at, prev_hash, record_hash, created_at)
  VALUES (NEW.creator_id,'digital_twin',NEW.signed_at,NEW.revoked_at,_prev_hash,_new_hash,_now);
  IF _training_changed THEN
    SELECT record_hash INTO _prev_hash FROM public.consent_records
      WHERE creator_id = NEW.creator_id ORDER BY created_at DESC, id DESC LIMIT 1;
    _payload := coalesce(_prev_hash,'') || '|' || NEW.creator_id::text || '|ai_training|' ||
                coalesce(NEW.training_consent_signed_at::text,'') || '|' || coalesce(NEW.training_consent_revoked_at::text,'') || '|' || _now::text;
    _new_hash := encode(digest(_payload,'sha256'),'hex');
    INSERT INTO public.consent_records (creator_id, kind, valid_from, revoked_at, prev_hash, record_hash, created_at)
    VALUES (NEW.creator_id,'ai_training',NEW.training_consent_signed_at,NEW.training_consent_revoked_at,_prev_hash,_new_hash,_now);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_consent_ledger_integrity(_creator_id UUID)
RETURNS TABLE(record_id UUID, ok BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  _running_prev TEXT := NULL;
  _payload TEXT;
  _expected_hash TEXT;
BEGIN
  FOR r IN
    SELECT id, creator_id, kind, valid_from, revoked_at, prev_hash, record_hash, created_at
    FROM public.consent_records WHERE creator_id = _creator_id
    ORDER BY created_at ASC, id ASC
  LOOP
    IF r.record_hash IS NULL THEN CONTINUE; END IF;
    _payload := coalesce(_running_prev,'') || '|' || r.creator_id::text || '|' || r.kind || '|' ||
                coalesce(r.valid_from::text,'') || '|' || coalesce(r.revoked_at::text,'') || '|' || r.created_at::text;
    _expected_hash := encode(digest(_payload,'sha256'),'hex');
    record_id := r.id;
    ok := (r.prev_hash IS NOT DISTINCT FROM _running_prev) AND (r.record_hash = _expected_hash);
    _running_prev := r.record_hash;
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_consent_ledger_integrity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_consent_ledger_integrity(uuid) TO service_role;