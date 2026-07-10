
-- Supporter-initiated flags on AI conversations
CREATE TYPE public.conversation_flag_reason AS ENUM ('off_tone','inaccurate','uncomfortable','wants_human','other');
CREATE TYPE public.conversation_flag_status AS ENUM ('open','acknowledged','handed_off','dismissed');

CREATE TABLE public.conversation_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  flagged_by uuid NOT NULL,
  reason public.conversation_flag_reason NOT NULL,
  note text,
  status public.conversation_flag_status NOT NULL DEFAULT 'open',
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  handoff_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_flags_note_len CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT conversation_flags_resnote_len CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 500)
);

CREATE INDEX conversation_flags_creator_status_idx ON public.conversation_flags (creator_id, status, created_at DESC);
CREATE INDEX conversation_flags_flagged_by_idx ON public.conversation_flags (flagged_by, created_at DESC);
CREATE INDEX conversation_flags_conversation_idx ON public.conversation_flags (conversation_id);

GRANT SELECT, INSERT, UPDATE ON public.conversation_flags TO authenticated;
GRANT ALL ON public.conversation_flags TO service_role;

ALTER TABLE public.conversation_flags ENABLE ROW LEVEL SECURITY;

-- Supporter can insert their own flag (only for conversations they participate in)
CREATE POLICY "Supporter can insert own flag"
ON public.conversation_flags
FOR INSERT TO authenticated
WITH CHECK (
  flagged_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id AND c.fan_id = auth.uid()
  )
);

-- Supporter sees their own flags
CREATE POLICY "Supporter can view own flags"
ON public.conversation_flags
FOR SELECT TO authenticated
USING (flagged_by = auth.uid());

-- Creator (or their agency, or admin) can view/manage flags for their creator
CREATE POLICY "Creator can view flags"
ON public.conversation_flags
FOR SELECT TO authenticated
USING (public.can_manage_creator(creator_id));

CREATE POLICY "Creator can update flags"
ON public.conversation_flags
FOR UPDATE TO authenticated
USING (public.can_manage_creator(creator_id))
WITH CHECK (public.can_manage_creator(creator_id));

CREATE TRIGGER trg_conversation_flags_updated
BEFORE UPDATE ON public.conversation_flags
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
