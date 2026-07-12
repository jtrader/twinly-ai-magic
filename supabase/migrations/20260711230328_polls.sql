-- Polls & interactive choice options. Visibility reuses the existing
-- feed_visibility_tier enum and its resolution logic (canViewerSeeTier /
-- isPayingSubscriber in feed-visibility-access.server.ts) rather than a new
-- gating mechanism — a poll's `visibility` is a direct tier value (no
-- override/default split; polls aren't creator_posts rows, they're their
-- own content type). RLS reuses public.can_manage_creator throughout.

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
  -- Default aggregate-only: the safer default, reduces social pressure on voters.
  anonymous boolean NOT NULL DEFAULT true,
  -- false (default) = show results immediately after voting; true = hide
  -- results from the voter until the poll closes, to avoid anchoring later votes.
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
  -- Only meaningful when the parent poll's poll_type = 'tip_to_vote'.
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
  -- Denormalized from polls.poll_type at insert time, purely so a partial
  -- unique index can enforce "one response per supporter" for single_choice
  -- polls without blocking multi_choice/tip_to_vote polls, which legitimately
  -- allow more than one row per (poll_id, supporter_id).
  poll_type public.poll_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_poll_responses_single_choice_unique
  ON public.poll_responses(poll_id, supporter_id) WHERE poll_type = 'single_choice';
CREATE INDEX idx_poll_responses_poll ON public.poll_responses(poll_id);
CREATE INDEX idx_poll_responses_supporter ON public.poll_responses(supporter_id);

-- Feed-attached polls: a post may optionally carry a poll, same shape as
-- linked_pack_id/linked_persona_id already on this table. Standalone polls
-- (not attached to any post) simply leave this null on every post and are
-- surfaced directly via listCreatorPollsPublic.
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

-- Supporters insert only their own vote; creators/agencies/admins can read
-- every response for polls they manage (needed for the results dashboard —
-- the `anonymous` flag governs what's shown to OTHER supporters/the public,
-- not what the poll's own creator can see about their own poll).
CREATE POLICY "Supporter inserts own poll response" ON public.poll_responses FOR INSERT TO authenticated
  WITH CHECK (supporter_id = auth.uid());
CREATE POLICY "Supporter reads own poll responses" ON public.poll_responses FOR SELECT TO authenticated
  USING (supporter_id = auth.uid());
CREATE POLICY "Creator reads responses for managed polls" ON public.poll_responses FOR SELECT TO authenticated
  USING (public.can_manage_creator((SELECT creator_id FROM public.polls WHERE id = poll_id)));

CREATE TRIGGER trg_polls_updated BEFORE UPDATE ON public.polls
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
