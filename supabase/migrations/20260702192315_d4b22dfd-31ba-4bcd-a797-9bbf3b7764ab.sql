-- Add structured training notes for personas (voice, do's, don'ts, sample phrasings)
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS training_notes jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.personas.training_notes IS
  'Structured persona training inputs: tone_examples, dos, donts, sample_phrasings, voice_ref_url';
