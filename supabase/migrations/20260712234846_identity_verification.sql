-- Supporter ID vetting via Stripe Identity. profiles.id_verified_at is the
-- quick-check column (mirrors age_verified_at); identity_verifications is
-- the detailed ledger. Neither is directly writable by the authenticated
-- user's own client — only the Stripe Identity webhook (service_role) sets
-- verification results, otherwise a fan could self-attest their way past a
-- gate that's specifically meant to be un-spoofable.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id_verified_at timestamptz;

CREATE TABLE public.identity_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stripe_identity',
  provider_session_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'requires_input', 'canceled')),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);

CREATE INDEX identity_verifications_user_id_idx ON public.identity_verifications(user_id);

GRANT SELECT ON public.identity_verifications TO authenticated;
GRANT ALL ON public.identity_verifications TO service_role;
ALTER TABLE public.identity_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own identity verification rows"
  ON public.identity_verifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins read all identity verification rows"
  ON public.identity_verifications FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
