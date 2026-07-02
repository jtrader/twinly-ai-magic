
-- 1. profiles: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "Profiles readable by anyone signed in or anon" ON public.profiles;
CREATE POLICY "Profiles readable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- 2. personas: restrict base-table SELECT to managers only; expose public-safe view
DROP POLICY IF EXISTS "Anyone views public personas" ON public.personas;
CREATE POLICY "Managers read own personas"
  ON public.personas FOR SELECT
  USING (can_manage_creator(creator_id));

CREATE OR REPLACE VIEW public.personas_public
WITH (security_invoker = off) AS
SELECT id, creator_id, slug, display_name, description, kind,
       disclosure_label, price_cents, visibility, starts_at, ends_at,
       sort_order, is_default_seed, created_at, updated_at
FROM public.personas
WHERE visibility IN ('public','subscribers','vip');

GRANT SELECT ON public.personas_public TO anon, authenticated;

-- 3. persona_content_permissions: restrict SELECT to managers of the persona's creator
DROP POLICY IF EXISTS "Anyone signed in can read persona-asset links" ON public.persona_content_permissions;
CREATE POLICY "Managers read persona-asset links"
  ON public.persona_content_permissions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.personas p
    WHERE p.id = persona_content_permissions.persona_id
      AND can_manage_creator(p.creator_id)
  ));
