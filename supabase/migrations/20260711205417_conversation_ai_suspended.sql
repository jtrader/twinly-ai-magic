
-- Same-thread handoff support (design doc item 4): a moderator taking over a
-- flagged AI conversation suspends AI auto-reply in place rather than
-- opening a separate thread — that separate-thread behavior already exists
-- for escalation_requests and is deliberately not reused here.
ALTER TABLE public.conversations
  ADD COLUMN ai_suspended boolean NOT NULL DEFAULT false;
