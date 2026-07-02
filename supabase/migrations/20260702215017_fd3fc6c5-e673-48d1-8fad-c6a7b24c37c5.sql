
ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS away_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS away_message text NOT NULL DEFAULT $$Hey! I'm away right now — I'll reply personally when I'm back. In the meantime, you can chat with my AI personas.$$,
  ADD COLUMN IF NOT EXISTS away_auto_reply_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS away_allow_ai_personas boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS away_started_at timestamptz;
