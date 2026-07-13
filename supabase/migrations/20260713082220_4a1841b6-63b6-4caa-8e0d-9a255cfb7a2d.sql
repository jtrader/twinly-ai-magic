
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS legal_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS legal_accepted_version text;

CREATE OR REPLACE FUNCTION public.has_accepted_legal(_user_id uuid, _min_version text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT legal_accepted_at IS NOT NULL
        AND (_min_version IS NULL OR legal_accepted_version = _min_version)
      FROM public.profiles
      WHERE id = _user_id
    ),
    false
  )
$$;
