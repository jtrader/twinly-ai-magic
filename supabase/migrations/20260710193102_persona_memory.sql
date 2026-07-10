-- Configurable per persona (creator-facing on/off; platform default is on).
ALTER TABLE public.personas ADD COLUMN memory_enabled BOOLEAN NOT NULL DEFAULT true;

-- One row per (persona, fan) pair — a periodically-summarized memory, not a
-- replay of full history. Never shared across supporters (unique per fan),
-- never created for real_me personas (summarization only fires for AI
-- turns — see updateMemoryIfDue in chat.functions.ts), so the Real Me /
-- AI-persona boundary is structural, not just app logic.
CREATE TABLE public.persona_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  fan_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  message_count_at_summary INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (persona_id, fan_id)
);

-- Only SELECT/DELETE granted to authenticated — fans can view and reset
-- their own memory, but never write it directly; summarization only
-- happens server-side via service_role.
GRANT SELECT, DELETE ON public.persona_memory TO authenticated;
GRANT ALL ON public.persona_memory TO service_role;
ALTER TABLE public.persona_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Fans manage own persona memory"
  ON public.persona_memory FOR ALL
  USING (fan_id = auth.uid())
  WITH CHECK (fan_id = auth.uid());
