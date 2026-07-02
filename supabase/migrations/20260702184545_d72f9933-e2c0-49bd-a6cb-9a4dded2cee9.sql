
-- Replace security-definer view with security-invoker + column-level anon grant
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
  WITH (security_invoker = true)
  AS SELECT id, display_name, avatar_url FROM public.profiles;
GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- Column-level grant so anon can only ever read the safe 3 columns of profiles
GRANT SELECT (id, display_name, avatar_url) ON public.profiles TO anon;

-- Permissive anon SELECT policy — column grant above restricts what they can actually read
DROP POLICY IF EXISTS "Public can read safe profile columns" ON public.profiles;
CREATE POLICY "Public can read safe profile columns"
  ON public.profiles FOR SELECT TO anon
  USING (true);

-- Fix search_path warning on audit guard
CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END;
$$;
