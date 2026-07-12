-- Creator onboarding & persona configuration studio: tier tagging, a
-- versioned brand-safe questionnaire, and generated (non-explicit) tone
-- guidelines + opener templates. Reuses public.can_manage_creator for RLS,
-- same as the feed-visibility work. Does not touch disclosure/consent logic
-- or the explicit-content ceiling (personas.explicitness_ceiling, untouched).

CREATE TYPE public.persona_type AS ENUM ('real_me', 'nice', 'naughty', 'wicked', 'custom');
CREATE TYPE public.persona_onboarding_status AS ENUM ('draft', 'published');

ALTER TABLE public.personas ADD COLUMN persona_type public.persona_type NOT NULL DEFAULT 'custom';
-- Data integrity: only a real_me-kind persona may carry the real_me tier tag,
-- and a real_me-kind persona must carry it (keeps the tag and the existing
-- `kind` column from silently disagreeing).
ALTER TABLE public.personas ADD CONSTRAINT personas_real_me_type_matches_kind
  CHECK ((kind = 'real_me') = (persona_type = 'real_me'));

-- Append-only, versioned questionnaire responses — re-completing the
-- questionnaire creates a new row rather than overwriting history.
CREATE TABLE public.persona_questionnaire_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  version int NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (persona_id, version)
);
CREATE INDEX idx_persona_questionnaire_responses_persona ON public.persona_questionnaire_responses(persona_id, version DESC);

GRANT SELECT, INSERT ON public.persona_questionnaire_responses TO authenticated;
GRANT ALL ON public.persona_questionnaire_responses TO service_role;
ALTER TABLE public.persona_questionnaire_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage own/managed persona questionnaire responses"
  ON public.persona_questionnaire_responses FOR SELECT
  USING (public.can_manage_creator((SELECT creator_id FROM public.personas WHERE id = persona_id)));
CREATE POLICY "Insert own/managed persona questionnaire responses"
  ON public.persona_questionnaire_responses FOR INSERT
  WITH CHECK (public.can_manage_creator((SELECT creator_id FROM public.personas WHERE id = persona_id)));

-- One row per persona: the current (editable, regeneratable) onboarding
-- draft — tone guidelines + opener templates + content framework taste
-- choices, plus a pointer to the questionnaire version it was generated
-- from. Unlike the questionnaire responses above, this is mutable — it's a
-- working draft, not a historical record.
CREATE TABLE public.persona_onboarding_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL UNIQUE REFERENCES public.personas(id) ON DELETE CASCADE,
  questionnaire_response_id uuid REFERENCES public.persona_questionnaire_responses(id) ON DELETE SET NULL,
  tone_guidelines text,
  opener_templates text[] NOT NULL DEFAULT '{}',
  content_framework_choices jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.persona_onboarding_status NOT NULL DEFAULT 'draft',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE ON public.persona_onboarding_configs TO authenticated;
GRANT ALL ON public.persona_onboarding_configs TO service_role;
ALTER TABLE public.persona_onboarding_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage own/managed persona onboarding config"
  ON public.persona_onboarding_configs FOR ALL
  USING (public.can_manage_creator((SELECT creator_id FROM public.personas WHERE id = persona_id)))
  WITH CHECK (public.can_manage_creator((SELECT creator_id FROM public.personas WHERE id = persona_id)));

CREATE TRIGGER trg_persona_onboarding_configs_updated
BEFORE UPDATE ON public.persona_onboarding_configs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
