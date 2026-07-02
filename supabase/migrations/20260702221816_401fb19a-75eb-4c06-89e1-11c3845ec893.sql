
CREATE TABLE public.creator_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fan_id, creator_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_follows TO authenticated;
GRANT ALL ON public.creator_follows TO service_role;

ALTER TABLE public.creator_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fans manage their own follows"
  ON public.creator_follows FOR ALL
  USING (auth.uid() = fan_id)
  WITH CHECK (auth.uid() = fan_id);

CREATE POLICY "Creators can see their followers"
  ON public.creator_follows FOR SELECT
  USING (public.can_manage_creator(creator_id));

CREATE INDEX creator_follows_fan_idx ON public.creator_follows(fan_id, favorite DESC, created_at DESC);
CREATE INDEX creator_follows_creator_idx ON public.creator_follows(creator_id);

CREATE TRIGGER creator_follows_set_updated_at
  BEFORE UPDATE ON public.creator_follows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
