-- Pass 1 (Stripe Identity RBAC): data-minimized retention + level mechanism.
-- Adds only the small set of fields we're allowed to retain per §3
-- (no DOB, no document number, no images, no selfie, no full address).

ALTER TABLE public.identity_verifications
  ADD COLUMN IF NOT EXISTS is_adult_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS document_country TEXT,
  ADD COLUMN IF NOT EXISTS verification_method TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_secret_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_stripe_event_id TEXT,
  ADD COLUMN IF NOT EXISTS redacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS policy_version TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS identity_verifications_provider_session_id_uniq
  ON public.identity_verifications(provider_session_id);

CREATE INDEX IF NOT EXISTS identity_verifications_user_env_status_idx
  ON public.identity_verifications(user_id, environment, status);

-- Processed-event ledger for webhook idempotency (§2).
CREATE TABLE IF NOT EXISTS public.identity_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  environment TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.identity_webhook_events TO service_role;
ALTER TABLE public.identity_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies -> only service_role (webhook) can read/write; RLS blocks all other roles.

-- Level bookkeeping on the profile. Level: 0=none, 1=verified adult, 2=verified adult + monetizing/agency.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS id_verification_level SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS id_verification_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS id_verification_method TEXT,
  ADD COLUMN IF NOT EXISTS is_adult_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Server-side "does this user have at least level N?" — respects expiry, fail-closed on ambiguous.
CREATE OR REPLACE FUNCTION public.has_id_level(_user_id UUID, _level SMALLINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT id_verification_level >= _level
      AND is_adult_verified = TRUE
      AND (id_verification_expires_at IS NULL OR id_verification_expires_at > now())
    FROM public.profiles WHERE id = _user_id
  ), FALSE);
$$;

-- Compatibility view: current has_id_level(1) mirrors id_verified_at being set.
COMMENT ON FUNCTION public.has_id_level IS
  'Per §4 role-gate enforcement: server-side point-of-action check. Fails closed if profile missing or verification expired/redacted.';
