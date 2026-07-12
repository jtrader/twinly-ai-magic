-- Feed visibility model (persona default + per-post override), RBAC-scoped
-- management, and an append-only audit log. Reuses public.can_manage_creator
-- (creator owner / assigned agency / admin) as the authority for who may
-- view or mutate visibility settings — see that function's definition in
-- 20260702181921_b3e50a86-5a53-4e8f-8b5a-305bc0c38589.sql. Does not touch
-- personas, content generation, or disclosure logic.

CREATE TYPE public.feed_visibility_tier AS ENUM ('public', 'logged_in', 'subscribers_only');
CREATE TYPE public.feed_visibility_target_type AS ENUM ('persona_default', 'feed_item_override');

-- Persona-level default. One row per persona; upserted via (persona_id).
CREATE TABLE public.feed_visibility_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL UNIQUE REFERENCES public.personas(id) ON DELETE CASCADE,
  default_visibility public.feed_visibility_tier NOT NULL DEFAULT 'subscribers_only',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Per-post override. Presence of a row = override active; deleting it clears
-- the override and falls back to the persona default (then platform default).
CREATE TABLE public.feed_item_visibility_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_post_id uuid NOT NULL UNIQUE REFERENCES public.creator_posts(id) ON DELETE CASCADE,
  visibility public.feed_visibility_tier NOT NULL,
  overrides_default boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_feed_visibility_policies_persona ON public.feed_visibility_policies(persona_id);
CREATE INDEX idx_feed_item_overrides_post ON public.feed_item_visibility_overrides(feed_post_id);

-- public.set_updated_at() already exists (20260702181921_...sql) — reused, not redeclared.
CREATE TRIGGER trg_feed_visibility_policies_updated
BEFORE UPDATE ON public.feed_visibility_policies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_feed_item_overrides_updated
BEFORE UPDATE ON public.feed_item_visibility_overrides
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.feed_visibility_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_item_visibility_overrides TO authenticated;
GRANT ALL ON public.feed_visibility_policies TO service_role;
GRANT ALL ON public.feed_item_visibility_overrides TO service_role;

ALTER TABLE public.feed_visibility_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_item_visibility_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage own/managed persona visibility policy"
  ON public.feed_visibility_policies FOR ALL
  USING (public.can_manage_creator((SELECT creator_id FROM public.personas WHERE id = persona_id)))
  WITH CHECK (public.can_manage_creator((SELECT creator_id FROM public.personas WHERE id = persona_id)));

CREATE POLICY "Manage own/managed post visibility override"
  ON public.feed_item_visibility_overrides FOR ALL
  USING (public.can_manage_creator((SELECT creator_id FROM public.creator_posts WHERE id = feed_post_id)))
  WITH CHECK (public.can_manage_creator((SELECT creator_id FROM public.creator_posts WHERE id = feed_post_id)));

-- Append-only audit log. actor_role is captured explicitly (not re-derived
-- from current role later) since roles can change after the fact. No
-- UPDATE/DELETE grant or policy exists for any role, including admin/
-- service_role via the API surface — immutability is enforced at the grant
-- level, not just by omitting an update/delete endpoint in application code.
CREATE TABLE public.feed_visibility_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  actor_role public.app_role NOT NULL,
  target_type public.feed_visibility_target_type NOT NULL,
  target_id uuid NOT NULL,
  before_value jsonb,
  after_value jsonb,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feed_visibility_audit_target ON public.feed_visibility_audit_log(target_type, target_id, changed_at DESC);
CREATE INDEX idx_feed_visibility_audit_actor ON public.feed_visibility_audit_log(actor_id, changed_at DESC);

GRANT SELECT, INSERT ON public.feed_visibility_audit_log TO authenticated;
GRANT SELECT, INSERT ON public.feed_visibility_audit_log TO service_role;

ALTER TABLE public.feed_visibility_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Insert own audit entries"
  ON public.feed_visibility_audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- Read scope mirrors the RBAC table: admin sees all; creator/agency see
-- entries whose target resolves to a persona/post they can manage.
CREATE POLICY "Read audit log within managed scope"
  ON public.feed_visibility_audit_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      target_type = 'persona_default'
      AND public.can_manage_creator((SELECT creator_id FROM public.personas WHERE id = target_id))
    )
    OR (
      target_type = 'feed_item_override'
      AND public.can_manage_creator((SELECT creator_id FROM public.creator_posts WHERE id = target_id))
    )
  );
