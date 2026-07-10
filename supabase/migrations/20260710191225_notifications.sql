CREATE TYPE public.notification_type AS ENUM (
  'new_content', 'persona_reply', 'escalation_requested', 'escalation_accepted', 'escalation_declined'
);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link_path TEXT,
  -- Which persona this notification is "from", and whether that persona is
  -- AI — copy must never imply an AI persona's activity is from the human
  -- creator. Enforced at render time from this flag, not free text.
  persona_id UUID REFERENCES public.personas(id) ON DELETE SET NULL,
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;

-- Only service_role inserts (server-side, on behalf of the system); users
-- may only read/update (mark read) their own rows.
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notifications"
  ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users mark own notifications read"
  ON public.notifications FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  -- Stretch channels per spec — no email/push delivery infra exists yet, so
  -- these default off; toggling them on today only changes the stored
  -- preference, not actual delivery (in-app is the only wired channel).
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  push_enabled BOOLEAN NOT NULL DEFAULT false,
  new_content BOOLEAN NOT NULL DEFAULT true,
  persona_reply BOOLEAN NOT NULL DEFAULT true,
  escalation_updates BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notification preferences"
  ON public.notification_preferences FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
