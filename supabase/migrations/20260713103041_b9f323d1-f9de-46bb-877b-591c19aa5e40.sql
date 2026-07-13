
ALTER TABLE public.agency_creators
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','suspended','revoked')),
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_agency_creators_status
  ON public.agency_creators(status);

CREATE TABLE IF NOT EXISTS public.agency_client_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  agreed_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  policy_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  UNIQUE (agency_id, creator_id)
);
GRANT SELECT ON public.agency_client_consents TO authenticated;
GRANT ALL ON public.agency_client_consents TO service_role;
ALTER TABLE public.agency_client_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Client reads own consents" ON public.agency_client_consents;
CREATE POLICY "Client reads own consents"
  ON public.agency_client_consents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.creators c
    WHERE c.id = agency_client_consents.creator_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "Agency reads own consents" ON public.agency_client_consents;
CREATE POLICY "Agency reads own consents"
  ON public.agency_client_consents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agencies a
    WHERE a.id = agency_client_consents.agency_id AND a.owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins read consents" ON public.agency_client_consents;
CREATE POLICY "Admins read consents"
  ON public.agency_client_consents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.agency_subscriptions (
  agency_id UUID PRIMARY KEY REFERENCES public.agencies(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','live')),
  status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('inactive','trialing','active','past_due','canceled','incomplete')),
  base_price_cents INTEGER NOT NULL DEFAULT 2500,
  per_client_price_cents INTEGER NOT NULL DEFAULT 2500,
  currency TEXT NOT NULL DEFAULT 'usd',
  billed_client_count INTEGER NOT NULL DEFAULT 0,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agency_subscriptions TO authenticated;
GRANT ALL ON public.agency_subscriptions TO service_role;
ALTER TABLE public.agency_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency owner reads own subscription" ON public.agency_subscriptions;
CREATE POLICY "Agency owner reads own subscription"
  ON public.agency_subscriptions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agencies a
    WHERE a.id = agency_subscriptions.agency_id AND a.owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins read agency subscriptions" ON public.agency_subscriptions;
CREATE POLICY "Admins read agency subscriptions"
  ON public.agency_subscriptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.has_active_agency_consent(
  _agency_id UUID, _creator_id UUID
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_client_consents acc
    JOIN public.creators c ON c.id = acc.creator_id
    WHERE acc.agency_id = _agency_id
      AND acc.creator_id = _creator_id
      AND acc.revoked_at IS NULL
      AND public.has_id_level(c.user_id, 1::smallint)
  );
$$;
GRANT EXECUTE ON FUNCTION public.has_active_agency_consent(uuid, uuid)
  TO authenticated, service_role;

-- Trigger on profiles: id level lives on profiles.id_verification_level.
CREATE OR REPLACE FUNCTION public.suspend_agency_links_on_id_loss()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _creator_id UUID;
BEGIN
  IF public.has_id_level(NEW.id, 1::smallint) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _creator_id FROM public.creators WHERE user_id = NEW.id;
  IF _creator_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.agency_creators
     SET status = 'suspended',
         suspended_at = COALESCE(suspended_at, now()),
         suspended_reason = COALESCE(suspended_reason, 'client_identity_lapsed')
   WHERE creator_id = _creator_id AND status = 'active';

  UPDATE public.agency_client_consents
     SET revoked_at = COALESCE(revoked_at, now()),
         revoked_reason = COALESCE(revoked_reason, 'client_identity_lapsed')
   WHERE creator_id = _creator_id AND revoked_at IS NULL;

  INSERT INTO public.audit_logs (actor_user_id, action, subject_type, subject_id, metadata)
  VALUES (NULL, 'agency_client_auto_suspended', 'creator', _creator_id,
          jsonb_build_object('reason', 'identity_lapsed', 'user_id', NEW.id));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suspend_agency_links_on_id_loss ON public.profiles;
CREATE TRIGGER trg_suspend_agency_links_on_id_loss
  AFTER UPDATE OF id_verification_level, id_verification_expires_at, is_adult_verified
    ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.suspend_agency_links_on_id_loss();

CREATE OR REPLACE FUNCTION public.count_active_agency_clients(_agency_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.agency_creators
   WHERE agency_id = _agency_id AND status = 'active'
$$;
GRANT EXECUTE ON FUNCTION public.count_active_agency_clients(uuid)
  TO authenticated, service_role;
