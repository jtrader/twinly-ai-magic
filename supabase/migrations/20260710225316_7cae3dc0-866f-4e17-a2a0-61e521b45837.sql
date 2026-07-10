
-- Content unlocks (PPV)
CREATE TABLE public.content_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  unlockable_type text NOT NULL CHECK (unlockable_type IN ('post','pack')),
  unlockable_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  stripe_payment_intent_id text UNIQUE,
  stripe_checkout_session_id text UNIQUE,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_content_unlocks_user ON public.content_unlocks(user_id);
CREATE INDEX idx_content_unlocks_lookup ON public.content_unlocks(user_id, unlockable_type, unlockable_id, environment);
GRANT SELECT ON public.content_unlocks TO authenticated;
GRANT ALL ON public.content_unlocks TO service_role;
ALTER TABLE public.content_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own unlocks" ON public.content_unlocks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Creators see unlocks of their content" ON public.content_unlocks
  FOR SELECT TO authenticated USING (public.is_creator_owner(creator_id));

-- Pay-per-view pricing on posts and packs
ALTER TABLE public.creator_posts ADD COLUMN IF NOT EXISTS unlock_price_cents integer;
ALTER TABLE public.content_packs ADD COLUMN IF NOT EXISTS unlock_price_cents integer;

-- Twinly+ platform membership
CREATE TABLE public.platform_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price_id text NOT NULL,
  product_id text,
  status text NOT NULL DEFAULT 'active',
  stripe_subscription_id text UNIQUE,
  stripe_customer_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  amount_cents integer,
  currency text DEFAULT 'usd',
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_platform_subs_user ON public.platform_subscriptions(user_id);
GRANT SELECT ON public.platform_subscriptions TO authenticated;
GRANT ALL ON public.platform_subscriptions TO service_role;
ALTER TABLE public.platform_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own platform subs" ON public.platform_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER platform_subs_updated_at BEFORE UPDATE ON public.platform_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Access helper: active OR canceled-but-still-in-paid-period counts as access.
CREATE OR REPLACE FUNCTION public.has_creator_access(
  _user_id uuid,
  _creator_id uuid,
  _min_tier text DEFAULT 'base'
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH tier_rank AS (
    SELECT CASE lower(_min_tier)
      WHEN 'vip' THEN 3
      WHEN 'plus' THEN 2
      ELSE 1
    END AS min_rank
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s, tier_rank tr
    WHERE s.fan_id = _user_id
      AND s.creator_id = _creator_id
      AND (
        (s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now()))
        OR (s.status = 'canceled' AND s.current_period_end > now())
      )
      AND CASE lower(s.tier::text)
            WHEN 'vip' THEN 3
            WHEN 'plus' THEN 2
            WHEN 'base' THEN 1
            ELSE 0
          END >= tr.min_rank
  );
$$;

CREATE OR REPLACE FUNCTION public.has_twinly_plus(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_subscriptions
    WHERE user_id = _user_id
      AND (
        (status = 'active' AND (current_period_end IS NULL OR current_period_end > now()))
        OR (status = 'canceled' AND current_period_end > now())
      )
  );
$$;
