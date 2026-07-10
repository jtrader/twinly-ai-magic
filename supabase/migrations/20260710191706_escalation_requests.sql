CREATE TYPE public.escalation_status AS ENUM ('requested', 'accepted', 'declined', 'expired');

CREATE TABLE public.escalation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  from_persona_id UUID NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  status public.escalation_status NOT NULL DEFAULT 'requested',
  price_cents INT NOT NULL DEFAULT 0,
  message TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  -- Lazily expired at read time (this app has no background job runner) —
  -- see expireStaleEscalations() in escalation.functions.ts.
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours')
);
CREATE INDEX idx_escalation_creator_status ON public.escalation_requests(creator_id, status);
CREATE INDEX idx_escalation_supporter ON public.escalation_requests(supporter_id);

GRANT SELECT, INSERT, UPDATE ON public.escalation_requests TO authenticated;
GRANT ALL ON public.escalation_requests TO service_role;
ALTER TABLE public.escalation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supporters manage own escalation requests"
  ON public.escalation_requests FOR ALL
  USING (supporter_id = auth.uid())
  WITH CHECK (supporter_id = auth.uid());

CREATE POLICY "Creators manage escalation requests for their personas"
  ON public.escalation_requests FOR ALL
  USING (public.can_manage_creator(creator_id))
  WITH CHECK (public.can_manage_creator(creator_id));
