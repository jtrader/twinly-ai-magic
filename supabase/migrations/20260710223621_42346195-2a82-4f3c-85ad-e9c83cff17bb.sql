
-- 1. New table: per-creator tier pricing
CREATE TABLE public.creator_tier_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  tier public.sub_tier NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 50),
  currency TEXT NOT NULL DEFAULT 'usd',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creator_id, tier)
);

GRANT SELECT ON public.creator_tier_prices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_tier_prices TO authenticated;
GRANT ALL ON public.creator_tier_prices TO service_role;

ALTER TABLE public.creator_tier_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active tier prices"
  ON public.creator_tier_prices FOR SELECT
  USING (active = true);

CREATE POLICY "Creators view own tier prices"
  ON public.creator_tier_prices FOR SELECT
  TO authenticated
  USING (public.can_manage_creator(creator_id));

CREATE POLICY "Creators insert own tier prices"
  ON public.creator_tier_prices FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_creator(creator_id));

CREATE POLICY "Creators update own tier prices"
  ON public.creator_tier_prices FOR UPDATE
  TO authenticated
  USING (public.can_manage_creator(creator_id))
  WITH CHECK (public.can_manage_creator(creator_id));

CREATE POLICY "Creators delete own tier prices"
  ON public.creator_tier_prices FOR DELETE
  TO authenticated
  USING (public.can_manage_creator(creator_id));

CREATE TRIGGER creator_tier_prices_updated_at
  BEFORE UPDATE ON public.creator_tier_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Extend subscriptions table for Stripe
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'usd',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id
  ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_fan_creator
  ON public.subscriptions(fan_id, creator_id);

DROP TRIGGER IF EXISTS subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Seed defaults for existing creators (Base $4.99, Plus $9.99, VIP $49.99)
INSERT INTO public.creator_tier_prices (creator_id, tier, amount_cents, currency, active)
SELECT c.id, 'base'::public.sub_tier, 499, 'usd', true FROM public.creators c
ON CONFLICT (creator_id, tier) DO NOTHING;

INSERT INTO public.creator_tier_prices (creator_id, tier, amount_cents, currency, active)
SELECT c.id, 'plus'::public.sub_tier, 999, 'usd', true FROM public.creators c
ON CONFLICT (creator_id, tier) DO NOTHING;

INSERT INTO public.creator_tier_prices (creator_id, tier, amount_cents, currency, active)
SELECT c.id, 'vip'::public.sub_tier, 4999, 'usd', true FROM public.creators c
ON CONFLICT (creator_id, tier) DO NOTHING;
