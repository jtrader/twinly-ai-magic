-- Real Me baseline questionnaire: the foundational creator profile other
-- personas are built from. Versioned (edits create new versions, never
-- overwritten); personas reference a specific version and only advance to a
-- newer one via an explicit resync action, never automatically.
-- Question definitions themselves are NOT stored here — see the documented
-- decision in real-me-questionnaire-schema.ts for why (fixed, platform-wide,
-- not creator-editable). Only responses/versions live in the DB.

CREATE TABLE public.real_me_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL UNIQUE REFERENCES public.creators(id) ON DELETE CASCADE,
  current_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.real_me_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  real_me_profile_id uuid NOT NULL REFERENCES public.real_me_profiles(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  completion_percentage numeric(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (real_me_profile_id, version_number)
);
CREATE INDEX idx_real_me_versions_profile ON public.real_me_profile_versions(real_me_profile_id, version_number DESC);

ALTER TABLE public.real_me_profiles
  ADD CONSTRAINT real_me_profiles_current_version_fkey
  FOREIGN KEY (current_version_id) REFERENCES public.real_me_profile_versions(id) ON DELETE SET NULL;

CREATE TABLE public.persona_real_me_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL UNIQUE REFERENCES public.personas(id) ON DELETE CASCADE,
  real_me_profile_version_id uuid NOT NULL REFERENCES public.real_me_profile_versions(id),
  synced_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.real_me_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.real_me_profile_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.persona_real_me_references TO authenticated;
GRANT ALL ON public.real_me_profiles TO service_role;
GRANT ALL ON public.real_me_profile_versions TO service_role;
GRANT ALL ON public.persona_real_me_references TO service_role;

ALTER TABLE public.real_me_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.real_me_profile_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_real_me_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage own real me profile"
  ON public.real_me_profiles FOR ALL
  USING (public.can_manage_creator(creator_id)) WITH CHECK (public.can_manage_creator(creator_id));

CREATE POLICY "Manage own real me versions"
  ON public.real_me_profile_versions FOR ALL
  USING (public.can_manage_creator((SELECT creator_id FROM public.real_me_profiles WHERE id = real_me_profile_id)))
  WITH CHECK (public.can_manage_creator((SELECT creator_id FROM public.real_me_profiles WHERE id = real_me_profile_id)));

CREATE POLICY "Manage own persona real me references"
  ON public.persona_real_me_references FOR ALL
  USING (public.can_manage_creator((SELECT creator_id FROM public.personas WHERE id = persona_id)))
  WITH CHECK (public.can_manage_creator((SELECT creator_id FROM public.personas WHERE id = persona_id)));

CREATE TRIGGER trg_real_me_versions_updated
BEFORE UPDATE ON public.real_me_profile_versions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
