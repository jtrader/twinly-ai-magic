
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox';
