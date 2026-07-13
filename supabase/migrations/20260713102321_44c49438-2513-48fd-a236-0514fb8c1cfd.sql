
-- 1. Persona flag
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS requires_verified_supporter boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.personas.requires_verified_supporter IS
  'When true, fans must have an active Level 1 identity verification (has_id_level(user_id,1)) to access this persona, in addition to any other visibility/subscription/invite rules.';

-- 2. invite_grants table
CREATE TABLE IF NOT EXISTS public.invite_grants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  note text,
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses >= 1 AND max_uses <= 100),
  uses_count integer NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
  redeemed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invite_grants_persona_idx ON public.invite_grants(persona_id);
CREATE INDEX IF NOT EXISTS invite_grants_creator_idx ON public.invite_grants(creator_id);
CREATE INDEX IF NOT EXISTS invite_grants_redeemer_idx ON public.invite_grants(redeemed_by_user_id) WHERE redeemed_by_user_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invite_grants TO authenticated;
GRANT ALL ON public.invite_grants TO service_role;

ALTER TABLE public.invite_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creators manage their own invite grants"
  ON public.invite_grants FOR ALL TO authenticated
  USING (public.can_manage_creator(creator_id))
  WITH CHECK (public.can_manage_creator(creator_id));

CREATE POLICY "redeemer can read own redeemed grant"
  ON public.invite_grants FOR SELECT TO authenticated
  USING (redeemed_by_user_id = auth.uid());

CREATE TRIGGER invite_grants_updated_at
  BEFORE UPDATE ON public.invite_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Helper: does this user hold a live redeemed invite for this persona?
CREATE OR REPLACE FUNCTION public.has_active_invite_grant(_user_id uuid, _persona_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invite_grants
    WHERE persona_id = _persona_id
      AND redeemed_by_user_id = _user_id
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- 4. Auto-revocation: when a user's Level 1 drops, revoke every invite_grant
--    they have redeemed and stamp an audit entry per revocation.
CREATE OR REPLACE FUNCTION public.revoke_invites_on_identity_loss()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _prev_level int := COALESCE(OLD.id_verification_level, 0);
  _new_level  int := COALESCE(NEW.id_verification_level, 0);
  _rec RECORD;
BEGIN
  -- Only fire when Level 1 was held and is now lost.
  IF _prev_level >= 1 AND _new_level < 1 THEN
    FOR _rec IN
      SELECT id, persona_id, creator_id
      FROM public.invite_grants
      WHERE redeemed_by_user_id = NEW.id
        AND revoked_at IS NULL
    LOOP
      UPDATE public.invite_grants
        SET revoked_at = now(),
            revocation_reason = 'identity_verification_revoked'
        WHERE id = _rec.id;
      INSERT INTO public.audit_logs (actor_user_id, action, subject_type, subject_id, metadata)
      VALUES (
        NEW.id,
        'invite_grant.auto_revoked',
        'invite_grant',
        _rec.id,
        jsonb_build_object(
          'persona_id', _rec.persona_id,
          'creator_id', _rec.creator_id,
          'reason', 'identity_verification_revoked'
        )
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invite_grants_auto_revoke ON public.profiles;
CREATE TRIGGER invite_grants_auto_revoke
  AFTER UPDATE OF id_verification_level ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.revoke_invites_on_identity_loss();
