-- Invite-only personas: a creator can share a specific persona with named
-- fans via a one-time link, without making it publicly discoverable.
ALTER TYPE public.visibility ADD VALUE IF NOT EXISTS 'invite_only';

CREATE TYPE public.persona_invite_status AS ENUM ('pending', 'accepted', 'revoked');

CREATE TABLE public.persona_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  invited_fan_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.persona_invite_status NOT NULL DEFAULT 'pending',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX persona_invites_persona_id_idx ON public.persona_invites(persona_id);
CREATE INDEX persona_invites_creator_id_idx ON public.persona_invites(creator_id);
CREATE INDEX persona_invites_invited_fan_id_idx ON public.persona_invites(invited_fan_id) WHERE invited_fan_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.persona_invites TO authenticated;
GRANT ALL ON public.persona_invites TO service_role;
ALTER TABLE public.persona_invites ENABLE ROW LEVEL SECURITY;

-- Creators manage invites for their own personas. Token lookup/accept for an
-- unauthenticated or not-yet-invited fan goes through server functions using
-- the service-role client (same pattern as digital_twin_consent / twin_reference_assets),
-- not direct table access, so no fan-facing RLS policy is needed here.
CREATE POLICY "Creators manage their own persona invites"
  ON public.persona_invites FOR ALL
  USING (public.can_manage_creator(creator_id))
  WITH CHECK (public.can_manage_creator(creator_id));
