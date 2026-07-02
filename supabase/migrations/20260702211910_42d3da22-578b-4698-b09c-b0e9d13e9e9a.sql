
-- 1) Extend messages with attachment fields
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_kind text,
  ADD COLUMN IF NOT EXISTS attachment_duration_ms integer,
  ADD COLUMN IF NOT EXISTS transcript text;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_attachment_kind_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_attachment_kind_check
  CHECK (attachment_kind IS NULL OR attachment_kind IN ('audio','image'));

-- 2) Persona voice reply prefs
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS voice_reply_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tts_voice text;

-- 3) Saved messages library
CREATE TABLE IF NOT EXISTS public.persona_saved_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  label text NOT NULL,
  body text,
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','voice')),
  attachment_url text,
  attachment_duration_ms integer,
  use_as_few_shot boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.persona_saved_messages TO authenticated;
GRANT ALL ON public.persona_saved_messages TO service_role;

ALTER TABLE public.persona_saved_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creators manage saved messages"
  ON public.persona_saved_messages
  FOR ALL
  TO authenticated
  USING (public.can_manage_creator(creator_id))
  WITH CHECK (public.can_manage_creator(creator_id));

CREATE TRIGGER persona_saved_messages_updated_at
  BEFORE UPDATE ON public.persona_saved_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS persona_saved_messages_persona_idx
  ON public.persona_saved_messages(persona_id, sort_order);

-- 4) Storage policies for voice-messages bucket
--    Path convention: {conversation_id}/{sender_user_id}/{uuid}.webm
--    - Sender (fan or creator) may upload under their own user prefix in a conversation they participate in.
--    - Reads are limited to conversation participants (fan_id or owning creator).

DROP POLICY IF EXISTS "voice-messages read participants" ON storage.objects;
CREATE POLICY "voice-messages read participants"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'voice-messages'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = split_part(name, '/', 1)
        AND (
          c.fan_id = auth.uid()
          OR public.can_manage_creator(c.creator_id)
        )
    )
  );

DROP POLICY IF EXISTS "voice-messages insert own" ON storage.objects;
CREATE POLICY "voice-messages insert own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'voice-messages'
    AND split_part(name, '/', 2) = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = split_part(name, '/', 1)
        AND (
          c.fan_id = auth.uid()
          OR public.can_manage_creator(c.creator_id)
        )
    )
  );

DROP POLICY IF EXISTS "voice-messages delete own" ON storage.objects;
CREATE POLICY "voice-messages delete own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'voice-messages'
    AND split_part(name, '/', 2) = auth.uid()::text
  );
