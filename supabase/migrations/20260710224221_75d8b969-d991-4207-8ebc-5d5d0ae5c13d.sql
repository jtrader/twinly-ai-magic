
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;

-- Allow authenticated users to read any profile (needed for showing display names/avatars across the app).
-- Existing "Owners read own profile" stays; we broaden with a permissive companion.
DROP POLICY IF EXISTS "Public read profiles basic" ON public.profiles;
CREATE POLICY "Public read profiles basic" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);
