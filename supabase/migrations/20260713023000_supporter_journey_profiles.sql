CREATE TABLE public.supporter_journey_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  tier public.sub_tier NOT NULL DEFAULT 'base',
  persona_template text NOT NULL CHECK (persona_template IN ('real','nice','naughty','wicked','custom')),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  chat_experience_brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  tailored_content_brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  creator_visible boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fan_id, creator_id)
);

ALTER TABLE public.supporter_journey_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supporter_journey_profiles TO authenticated;
GRANT ALL ON public.supporter_journey_profiles TO service_role;

CREATE POLICY "Fans manage their own supporter journey"
  ON public.supporter_journey_profiles FOR ALL
  USING (auth.uid() = fan_id)
  WITH CHECK (auth.uid() = fan_id);

CREATE POLICY "Creators read submitted supporter journeys"
  ON public.supporter_journey_profiles FOR SELECT
  USING (creator_visible AND public.can_manage_creator(creator_id));
