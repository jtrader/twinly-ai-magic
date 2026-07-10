-- Design doc item 2: twin guardrail engine.
CREATE TYPE public.explicitness_level AS ENUM ('sfw', 'suggestive', 'explicit');

-- Singleton row (id is always `true`) so there's exactly one platform config.
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
CREATE POLICY "Anyone can read platform settings"
  ON public.platform_settings FOR SELECT USING (true);
-- Writes happen only via supabaseAdmin from adminSetPlatformSettings — no
-- authenticated/anon INSERT or UPDATE policy on purpose.

ALTER TABLE public.personas
  ADD COLUMN explicitness_ceiling public.explicitness_level NOT NULL DEFAULT 'sfw';
  -- is_explicit stays as-is (a display convenience derivable from the
  -- ceiling); not dropped, to avoid a breaking change to existing reads.
