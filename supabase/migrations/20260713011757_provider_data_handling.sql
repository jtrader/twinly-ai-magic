-- Formal, versioned record of each LLM/generation provider's data-retention
-- and training-use terms, replacing "review it once in a doc and never
-- again" with a tracked, admin-reviewed, re-reviewable record. See
-- docs/PROVIDER_DATA_HANDLING.md for the human-readable findings behind the
-- seed rows below.
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

-- Seed the two providers already live in production. Deliberately left
-- unreviewed (reviewed_at/reviewed_by NULL, next_review_due = today) —
-- nobody has actually confirmed these in the required sense yet, so the
-- honest state is "overdue", not a fabricated pass. The boolean/notes
-- fields below reflect what was found in each provider's public
-- documentation at time of writing, pending that human confirmation.
INSERT INTO public.provider_data_handling_records
  (provider_name, zero_data_retention, used_for_training, covers_creator_data, covers_supporter_data, contract_reference, notes)
VALUES
  (
    'lovable_gateway',
    false,
    true,
    true,
    true,
    'docs/PROVIDER_DATA_HANDLING.md',
    'Per Lovable docs (docs.lovable.dev/features/business/data-opt-out): customer data may be used for model training by default. Business/Enterprise workspaces can opt out in Settings; Free/Pro must contact support. Zero data retention not offered. ACTION NEEDED: confirm plan tier and enable opt-out if available.'
  ),
  (
    'venice',
    true,
    false,
    true,
    true,
    'docs/PROVIDER_DATA_HANDLING.md',
    'Per Venice''s privacy policy (venice.ai/legal/privacy-policy): states zero data retention and no training use of prompts/outputs. Vendor-stated, not independently audited.'
  );
