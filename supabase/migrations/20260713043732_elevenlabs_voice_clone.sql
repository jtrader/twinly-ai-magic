-- Real ElevenLabs voice cloning: one cloned voice per creator (their actual
-- voice), individually opt-in and tunable per persona. Previously
-- voice_source_recordings only tracked intake up to submitted_for_clone_at
-- with no real provider call — this adds the fields the real call and its
-- output need.
ALTER TABLE public.creators
  ADD COLUMN elevenlabs_voice_id text,
  ADD COLUMN elevenlabs_voice_requires_verification boolean,
  ADD COLUMN elevenlabs_voice_cloned_at timestamptz;

ALTER TABLE public.personas
  ADD COLUMN use_cloned_voice boolean NOT NULL DEFAULT false,
  ADD COLUMN voice_stability numeric(3,2) CHECK (voice_stability IS NULL OR (voice_stability BETWEEN 0 AND 1)),
  ADD COLUMN voice_similarity_boost numeric(3,2) CHECK (voice_similarity_boost IS NULL OR (voice_similarity_boost BETWEEN 0 AND 1)),
  ADD COLUMN voice_style numeric(3,2) CHECK (voice_style IS NULL OR (voice_style BETWEEN 0 AND 1));

-- Recordings that were actually sent to ElevenLabs and produced a voice,
-- distinct from submitted_for_clone_at (which only meant "handoff recorded").
ALTER TYPE public.voice_source_status ADD VALUE IF NOT EXISTS 'cloned';
