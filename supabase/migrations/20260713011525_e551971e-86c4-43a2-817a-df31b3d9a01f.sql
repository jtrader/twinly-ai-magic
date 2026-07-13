
-- Same-thread handoff support (design doc item 4): a moderator taking over a
-- flagged AI conversation suspends AI auto-reply in place rather than
-- opening a separate thread — that separate-thread behavior already exists
-- for escalation_requests and is deliberately not reused here.
ALTER TABLE public.conversations
  ADD COLUMN ai_suspended boolean NOT NULL DEFAULT false;
-- Feed visibility model (persona default + per-post override), RBAC-scoped
-- management, and an append-only audit log.

CREATE TYPE public.feed_visibility_tier AS ENUM ('public', 'logged_in', 'subscribers_only');
CREATE TYPE public.feed_visibility_target_type AS ENUM ('persona_default', 'feed_item_override');

CREATE TABLE public.feed_visibility_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL UNIQUE REFERENCES public.personas(id) ON DELETE CASCADE,
  default_visibility public.feed_visibility_tier NOT NULL DEFAULT 'subscribers_only',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.feed_item_visibility_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_post_id uuid NOT NULL UNIQUE REFERENCES public.creator_posts(id) ON DELETE CASCADE,
  visibility public.feed_visibility_tier NOT NULL,
  overrides_default boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_feed_visibility_policies_persona ON public.feed_visibility_policies(persona_id);
CREATE INDEX idx_feed_item_overrides_post ON public.feed_item_visibility_overrides(feed_post_id);

CREATE TRIGGER trg_feed_visibility_policies_updated
BEFORE UPDATE ON public.feed_visibility_policies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_feed_item_overrides_updated
BEFORE UPDATE ON public.feed_item_visibility_overrides
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.feed_visibility_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_item_visibility_overrides TO authenticated;
GRANT ALL ON public.feed_visibility_policies TO service_role;
GRANT ALL ON public.feed_item_visibility_overrides TO service_role;

ALTER TABLE public.feed_visibility_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_item_visibility_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage own/managed persona visibility policy"
  ON public.feed_visibility_policies FOR ALL
  USING (public.can_manage_creator((SELECT creator_id FROM public.personas WHERE id = persona_id)))
  WITH CHECK (public.can_manage_creator((SELECT creator_id FROM public.personas WHERE id = persona_id)));

CREATE POLICY "Manage own/managed post visibility override"
  ON public.feed_item_visibility_overrides FOR ALL
  USING (public.can_manage_creator((SELECT creator_id FROM public.creator_posts WHERE id = feed_post_id)))
  WITH CHECK (public.can_manage_creator((SELECT creator_id FROM public.creator_posts WHERE id = feed_post_id)));

CREATE TABLE public.feed_visibility_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  actor_role public.app_role NOT NULL,
  target_type public.feed_visibility_target_type NOT NULL,
  target_id uuid NOT NULL,
  before_value jsonb,
  after_value jsonb,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feed_visibility_audit_target ON public.feed_visibility_audit_log(target_type, target_id, changed_at DESC);
CREATE INDEX idx_feed_visibility_audit_actor ON public.feed_visibility_audit_log(actor_id, changed_at DESC);

GRANT SELECT, INSERT ON public.feed_visibility_audit_log TO authenticated;
GRANT SELECT, INSERT ON public.feed_visibility_audit_log TO service_role;

ALTER TABLE public.feed_visibility_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Insert own audit entries"
  ON public.feed_visibility_audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

CREATE POLICY "Read audit log within managed scope"
  ON public.feed_visibility_audit_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      target_type = 'persona_default'
      AND public.can_manage_creator((SELECT creator_id FROM public.personas WHERE id = target_id))
    )
    OR (
      target_type = 'feed_item_override'
      AND public.can_manage_creator((SELECT creator_id FROM public.creator_posts WHERE id = target_id))
    )
  );

-- Persona onboarding studio.
CREATE TYPE public.persona_type AS ENUM ('real_me', 'nice', 'naughty', 'wicked', 'custom');
CREATE TYPE public.persona_onboarding_status AS ENUM ('draft', 'published');

ALTER TABLE public.personas ADD COLUMN persona_type public.persona_type NOT NULL DEFAULT 'custom';
UPDATE public.personas SET persona_type='real_me' WHERE kind='real_me';
ALTER TABLE public.personas ADD CONSTRAINT personas_real_me_type_matches_kind
  CHECK ((kind = 'real_me') = (persona_type = 'real_me'));

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

-- Polls.
CREATE TYPE public.poll_type AS ENUM ('single_choice', 'multi_choice', 'tip_to_vote');
CREATE TYPE public.poll_status AS ENUM ('draft', 'active', 'closed');

CREATE TABLE public.polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  persona_id uuid REFERENCES public.personas(id) ON DELETE SET NULL,
  question text NOT NULL,
  poll_type public.poll_type NOT NULL,
  visibility public.feed_visibility_tier NOT NULL DEFAULT 'public',
  status public.poll_status NOT NULL DEFAULT 'draft',
  anonymous boolean NOT NULL DEFAULT true,
  results_visible_after_close boolean NOT NULL DEFAULT false,
  closes_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT polls_question_len CHECK (char_length(question) BETWEEN 1 AND 500)
);
CREATE INDEX idx_polls_creator ON public.polls(creator_id, status, created_at DESC);
CREATE INDEX idx_polls_persona ON public.polls(persona_id) WHERE persona_id IS NOT NULL;
CREATE INDEX idx_polls_closes_at ON public.polls(closes_at) WHERE status = 'active' AND closes_at IS NOT NULL;

CREATE TABLE public.poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  label text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  linked_tip_amount_usd numeric(10,2),
  CONSTRAINT poll_options_label_len CHECK (char_length(label) BETWEEN 1 AND 200),
  CONSTRAINT poll_options_tip_amount_positive CHECK (linked_tip_amount_usd IS NULL OR linked_tip_amount_usd >= 1)
);
CREATE INDEX idx_poll_options_poll ON public.poll_options(poll_id, display_order);

CREATE TABLE public.poll_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  poll_option_id uuid NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  supporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tip_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  poll_type public.poll_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_poll_responses_single_choice_unique
  ON public.poll_responses(poll_id, supporter_id) WHERE poll_type = 'single_choice';
CREATE INDEX idx_poll_responses_poll ON public.poll_responses(poll_id);
CREATE INDEX idx_poll_responses_supporter ON public.poll_responses(supporter_id);

ALTER TABLE public.creator_posts ADD COLUMN linked_poll_id uuid REFERENCES public.polls(id) ON DELETE SET NULL;

GRANT SELECT, INSERT, UPDATE ON public.polls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poll_options TO authenticated;
GRANT SELECT, INSERT ON public.poll_responses TO authenticated;
GRANT ALL ON public.polls TO service_role;
GRANT ALL ON public.poll_options TO service_role;
GRANT ALL ON public.poll_responses TO service_role;

ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read polls" ON public.polls FOR SELECT USING (true);
CREATE POLICY "Manage own/managed polls" ON public.polls FOR ALL
  USING (public.can_manage_creator(creator_id)) WITH CHECK (public.can_manage_creator(creator_id));

CREATE POLICY "Anyone can read poll options" ON public.poll_options FOR SELECT USING (true);
CREATE POLICY "Manage own/managed poll options" ON public.poll_options FOR ALL
  USING (public.can_manage_creator((SELECT creator_id FROM public.polls WHERE id = poll_id)))
  WITH CHECK (public.can_manage_creator((SELECT creator_id FROM public.polls WHERE id = poll_id)));

CREATE POLICY "Supporter inserts own poll response" ON public.poll_responses FOR INSERT TO authenticated
  WITH CHECK (supporter_id = auth.uid());
CREATE POLICY "Supporter reads own poll responses" ON public.poll_responses FOR SELECT TO authenticated
  USING (supporter_id = auth.uid());
CREATE POLICY "Creator reads responses for managed polls" ON public.poll_responses FOR SELECT TO authenticated
  USING (public.can_manage_creator((SELECT creator_id FROM public.polls WHERE id = poll_id)));

CREATE TRIGGER trg_polls_updated BEFORE UPDATE ON public.polls
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Notification types for polls.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'poll_response';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'poll_closed';

-- Voice source recordings.
CREATE TYPE public.voice_source_type AS ENUM ('uploaded', 'recorded_in_app');
CREATE TYPE public.voice_source_status AS ENUM ('pending_validation', 'validated', 'rejected');

CREATE TABLE public.voice_source_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  consent_record_id uuid REFERENCES public.consent_records(id) ON DELETE SET NULL,
  source_type public.voice_source_type NOT NULL,
  file_ref text NOT NULL,
  format text NOT NULL,
  duration_seconds numeric NOT NULL DEFAULT 0,
  sample_rate int NOT NULL DEFAULT 0,
  status public.voice_source_status NOT NULL DEFAULT 'pending_validation',
  rejection_reason text,
  submitted_for_clone_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_voice_source_recordings_persona ON public.voice_source_recordings(persona_id, status);
CREATE INDEX idx_voice_source_recordings_creator ON public.voice_source_recordings(creator_id);

GRANT SELECT, INSERT, UPDATE ON public.voice_source_recordings TO authenticated;
GRANT ALL ON public.voice_source_recordings TO service_role;
ALTER TABLE public.voice_source_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage own/managed voice source recordings"
  ON public.voice_source_recordings FOR ALL
  USING (public.can_manage_creator(creator_id))
  WITH CHECK (public.can_manage_creator(creator_id));

CREATE TRIGGER trg_voice_source_recordings_updated
BEFORE UPDATE ON public.voice_source_recordings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Real Me profiles.
CREATE TABLE public.real_me_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL UNIQUE REFERENCES public.creators(id) ON DELETE CASCADE,
  current_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.real_me_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  real_me_profile_id uuid NOT NULL REFERENCES public.real_me_profiles(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (real_me_profile_id, version_number)
);
CREATE INDEX idx_real_me_versions_profile ON public.real_me_profile_versions(real_me_profile_id, version_number DESC);

ALTER TABLE public.real_me_profiles
  ADD COLUMN current_version_id uuid REFERENCES public.real_me_profile_versions(id) ON DELETE SET NULL;

CREATE TABLE public.persona_real_me_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL UNIQUE REFERENCES public.personas(id) ON DELETE CASCADE,
  real_me_profile_version_id uuid NOT NULL REFERENCES public.real_me_profile_versions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
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

-- Content assets provider model.
ALTER TABLE public.content_assets ADD COLUMN provider_model text;

-- Persona Venice chat opt-in.
ALTER TABLE public.personas ADD COLUMN venice_chat_opt_in boolean NOT NULL DEFAULT false;

-- Persona invites.
ALTER TYPE public.visibility ADD VALUE IF NOT EXISTS 'invite_only';

CREATE TYPE public.persona_invite_status AS ENUM ('pending', 'accepted', 'revoked');

CREATE TABLE public.persona_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  invited_fan_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.persona_invite_status NOT NULL DEFAULT 'pending',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX persona_invites_persona_id_idx ON public.persona_invites(persona_id);
CREATE INDEX persona_invites_creator_id_idx ON public.persona_invites(creator_id);
CREATE INDEX persona_invites_invited_fan_id_idx ON public.persona_invites(invited_fan_id) WHERE invited_fan_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.persona_invites TO authenticated;
GRANT ALL ON public.persona_invites TO service_role;
ALTER TABLE public.persona_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators manage their own persona invites"
  ON public.persona_invites FOR ALL
  USING (public.can_manage_creator(creator_id))
  WITH CHECK (public.can_manage_creator(creator_id));

-- Identity verification.
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

-- Content theme overrides.
CREATE TYPE public.content_theme AS ENUM (
  'romantic_affection',
  'flirtation_teasing',
  'roleplay_fantasy',
  'power_exchange',
  'fetish_general',
  'group_dynamics',
  'exhibitionism_voyeurism',
  'sensory_focus'
);
ALTER TABLE public.personas ADD COLUMN content_theme_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Provider data handling records.
CREATE TABLE public.provider_data_handling_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL UNIQUE,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  zero_data_retention boolean,
  used_for_training boolean,
  covers_creator_data boolean,
  covers_supporter_data boolean,
  contract_reference text,
  notes text,
  next_review_due date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_data_handling_records TO authenticated;
GRANT ALL ON public.provider_data_handling_records TO service_role;
ALTER TABLE public.provider_data_handling_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage provider data-handling records"
  ON public.provider_data_handling_records FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.provider_data_handling_records
  (provider_name, zero_data_retention, used_for_training, covers_creator_data, covers_supporter_data, contract_reference, notes)
VALUES
  ('lovable_gateway', false, true, true, true, 'docs/PROVIDER_DATA_HANDLING.md',
   'Per Lovable docs: customer data may be used for model training by default. Zero data retention not offered. ACTION NEEDED: confirm plan tier and enable opt-out if available.'),
  ('venice', true, false, true, true, 'docs/PROVIDER_DATA_HANDLING.md',
   'Per Venice privacy policy: states zero data retention and no training use of prompts/outputs. Vendor-stated, not independently audited.');

-- Supporter journey profiles.
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

-- RSP questionnaire vault bridge.
create table public.rsp_questionnaire_submissions (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.creators(id), supporter_id uuid not null references auth.users(id),
 schema_version text not null, questionnaire_version text not null, source text not null, locale text not null, status text not null default 'received',
 ciphertext text not null, nonce text not null, authentication_tag text not null, wrapped_data_key text not null, wrap_nonce text not null,
 wrap_authentication_tag text not null, encryption_algorithm text not null check(encryption_algorithm='AES-256-GCM'), key_version text not null,
 associated_data_hash text not null, expires_at timestamptz not null, created_at timestamptz not null default now(), processed_at timestamptz, deleted_at timestamptz
);
create table public.rsp_consent_receipts (
 id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.rsp_questionnaire_submissions(id) on delete cascade,
 consent_version text not null, accepted_at timestamptz not null, adult_confirmed boolean not null, respectful_use_accepted boolean not null,
 personalisation_allowed boolean not null, preferences_may_be_saved boolean not null, receipt_hash text not null unique, created_at timestamptz not null default now()
);
create table public.rsp_policy_envelopes (
 id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.rsp_questionnaire_submissions(id) on delete cascade,
 creator_id uuid not null references public.creators(id), policy_version text not null, policy_hash text not null unique, envelope jsonb not null,
 active boolean not null default true, created_at timestamptz not null default now(), expires_at timestamptz not null
);
create table public.rsp_privacy_safe_profiles (
 id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.rsp_questionnaire_submissions(id) on delete cascade,
 creator_id uuid not null references public.creators(id), profile_token uuid unique, profile_version text not null, profile jsonb not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null, deleted_at timestamptz,
 check(profile ? 'displayName' = false and profile ? 'email' = false and profile ? 'supporterId' = false)
);
create table public.rsp_state_profiles (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.rsp_privacy_safe_profiles(id) on delete cascade,
 state_version text not null, states jsonb not null, quality jsonb not null, cluster_summaries jsonb not null, created_at timestamptz not null default now(),
 check(abs(((states->>'fire')::numeric+(states->>'air')::numeric+(states->>'earth')::numeric+(states->>'water')::numeric+(states->>'ether')::numeric)-1)<=0.001)
);
create table public.questionnaire_metatag_mappings (
 id uuid primary key default gen_random_uuid(), mapping_version text not null, questionnaire_schema_version text not null,
 field_path text not null, source_value text, source_range_min numeric, source_range_max numeric, output_namespace text not null,
 output_tag_id text, state_contribution_json jsonb not null default '{}', hard_policy_effect jsonb not null default '{}',
 confidence numeric(4,3) not null check(confidence between 0 and 1), status text not null default 'draft', reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(mapping_version,field_path,source_value,source_range_min,source_range_max,output_tag_id)
);
create table public.rsp_vault_retrieval_requests (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.rsp_privacy_safe_profiles(id) on delete cascade,
 creator_id uuid not null references public.creators(id), request_id uuid not null unique, policy_hash text not null, retrieval_version text not null,
 tag_schema_version text not null, request_projection jsonb not null, created_at timestamptz not null default now(), expires_at timestamptz not null
);
create table public.rsp_curated_sequences (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.rsp_privacy_safe_profiles(id) on delete cascade,
 creator_id uuid not null references public.creators(id), sequence_version text not null, policy_hash text not null, persona text not null,
 relationship_stage text not null, objective text not null, runtime_rules jsonb not null, status text not null default 'draft',
 approved_by uuid references auth.users(id), approved_at timestamptz, created_at timestamptz not null default now(), expires_at timestamptz not null
);
create table public.rsp_curated_sequence_steps (
 id uuid primary key default gen_random_uuid(), sequence_id uuid not null references public.rsp_curated_sequences(id) on delete cascade,
 position integer not null check(position>0), journey_stage text not null, asset_id uuid not null, asset_version integer not null check(asset_version>0),
 fallback_asset_id uuid, match_score numeric(5,4) not null check(match_score between 0 and 1), match_explanation jsonb not null,
 transition_rules jsonb not null, unique(sequence_id,position)
);
create table public.rsp_generated_briefs (
 id uuid primary key default gen_random_uuid(), sequence_id uuid not null references public.rsp_curated_sequences(id) on delete cascade,
 brief_type text not null check(brief_type in ('chat_experience','tailored_content')), schema_version text not null, brief jsonb not null,
 status text not null default 'editable_draft', created_at timestamptz not null default now(), unique(sequence_id,brief_type)
);
create table public.rsp_audit_events (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.creators(id), actor_id uuid,
 submission_id uuid references public.rsp_questionnaire_submissions(id) on delete set null, event_type text not null, purpose text not null,
 category_metadata jsonb not null default '{}', occurred_at timestamptz not null default now()
);
create table public.rsp_retention_deletion_jobs (
 id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.rsp_questionnaire_submissions(id) on delete cascade,
 idempotency_key text not null unique, status text not null default 'queued', attempts integer not null default 0, run_after timestamptz not null,
 completed_at timestamptz, error_class text, created_at timestamptz not null default now()
);
create index rsp_submission_scope_idx on public.rsp_questionnaire_submissions(creator_id,supporter_id,status);
create index rsp_submission_expiry_idx on public.rsp_questionnaire_submissions(expires_at) where deleted_at is null;
create index rsp_profile_scope_idx on public.rsp_privacy_safe_profiles(creator_id,expires_at) where deleted_at is null;
create index rsp_sequence_scope_idx on public.rsp_curated_sequences(creator_id,status,expires_at);
create index rsp_deletion_due_idx on public.rsp_retention_deletion_jobs(status,run_after);

grant select, insert, update, delete on public.rsp_questionnaire_submissions to authenticated;
grant select, insert, update, delete on public.rsp_consent_receipts to authenticated;
grant select, insert, update, delete on public.rsp_policy_envelopes to authenticated;
grant select, insert, update, delete on public.rsp_privacy_safe_profiles to authenticated;
grant select, insert, update, delete on public.rsp_state_profiles to authenticated;
grant select, insert, update, delete on public.questionnaire_metatag_mappings to authenticated;
grant select, insert, update, delete on public.rsp_vault_retrieval_requests to authenticated;
grant select, insert, update, delete on public.rsp_curated_sequences to authenticated;
grant select, insert, update, delete on public.rsp_curated_sequence_steps to authenticated;
grant select, insert, update, delete on public.rsp_generated_briefs to authenticated;
grant select, insert, update, delete on public.rsp_audit_events to authenticated;
grant select, insert, update, delete on public.rsp_retention_deletion_jobs to authenticated;
grant all on public.rsp_questionnaire_submissions to service_role;
grant all on public.rsp_consent_receipts to service_role;
grant all on public.rsp_policy_envelopes to service_role;
grant all on public.rsp_privacy_safe_profiles to service_role;
grant all on public.rsp_state_profiles to service_role;
grant all on public.questionnaire_metatag_mappings to service_role;
grant all on public.rsp_vault_retrieval_requests to service_role;
grant all on public.rsp_curated_sequences to service_role;
grant all on public.rsp_curated_sequence_steps to service_role;
grant all on public.rsp_generated_briefs to service_role;
grant all on public.rsp_audit_events to service_role;
grant all on public.rsp_retention_deletion_jobs to service_role;

alter table public.rsp_questionnaire_submissions enable row level security;
alter table public.rsp_consent_receipts enable row level security;
alter table public.rsp_policy_envelopes enable row level security;
alter table public.rsp_privacy_safe_profiles enable row level security;
alter table public.rsp_state_profiles enable row level security;
alter table public.questionnaire_metatag_mappings enable row level security;
alter table public.rsp_vault_retrieval_requests enable row level security;
alter table public.rsp_curated_sequences enable row level security;
alter table public.rsp_curated_sequence_steps enable row level security;
alter table public.rsp_generated_briefs enable row level security;
alter table public.rsp_audit_events enable row level security;
alter table public.rsp_retention_deletion_jobs enable row level security;

-- ElevenLabs voice clone.
ALTER TABLE public.creators
  ADD COLUMN elevenlabs_voice_id text,
  ADD COLUMN elevenlabs_voice_requires_verification boolean,
  ADD COLUMN elevenlabs_voice_cloned_at timestamptz;

ALTER TABLE public.personas
  ADD COLUMN use_cloned_voice boolean NOT NULL DEFAULT false,
  ADD COLUMN voice_stability numeric(3,2) CHECK (voice_stability IS NULL OR (voice_stability BETWEEN 0 AND 1)),
  ADD COLUMN voice_similarity_boost numeric(3,2) CHECK (voice_similarity_boost IS NULL OR (voice_similarity_boost BETWEEN 0 AND 1)),
  ADD COLUMN voice_style numeric(3,2) CHECK (voice_style IS NULL OR (voice_style BETWEEN 0 AND 1));

ALTER TYPE public.voice_source_status ADD VALUE IF NOT EXISTS 'cloned';

-- Persona require ID verification.
ALTER TABLE public.personas
  ADD COLUMN require_id_verification boolean NOT NULL DEFAULT false;

-- Conversation flags auto-detect.
ALTER TYPE public.conversation_flag_reason ADD VALUE IF NOT EXISTS 'auto_high_severity';
ALTER TYPE public.conversation_flag_reason ADD VALUE IF NOT EXISTS 'auto_prompt_leak';
ALTER TABLE public.conversation_flags ADD COLUMN severity text;

-- Persona Venice character slug.
ALTER TABLE public.personas
  ADD COLUMN venice_character_slug text;

-- Persona intro video.
ALTER TABLE public.personas
  ADD COLUMN intro_video_url text,
  ADD COLUMN intro_video_uploaded_at timestamptz;
