CREATE POLICY "Creator writes own conversation messages" ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_type = 'creator'
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND public.can_manage_creator(c.creator_id)
  )
);