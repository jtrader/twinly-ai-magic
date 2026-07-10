
-- =========================
-- creator_posts
-- =========================
CREATE TABLE public.creator_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  image_url text,
  linked_pack_id uuid REFERENCES public.content_packs(id) ON DELETE SET NULL,
  linked_persona_id uuid REFERENCES public.personas(id) ON DELETE SET NULL,
  like_count integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  is_removed boolean NOT NULL DEFAULT false,
  removed_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX creator_posts_creator_created_idx
  ON public.creator_posts (creator_id, created_at DESC)
  WHERE is_removed = false;

GRANT SELECT ON public.creator_posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_posts TO authenticated;
GRANT ALL ON public.creator_posts TO service_role;

ALTER TABLE public.creator_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read non-removed posts"
  ON public.creator_posts FOR SELECT
  USING (is_removed = false OR public.can_manage_creator(creator_id) OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Creator owners can insert their posts"
  ON public.creator_posts FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_creator(creator_id) AND author_user_id = auth.uid());

CREATE POLICY "Creator owners can update their posts"
  ON public.creator_posts FOR UPDATE
  TO authenticated
  USING (public.can_manage_creator(creator_id) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.can_manage_creator(creator_id) OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Creator owners or admins can delete posts"
  ON public.creator_posts FOR DELETE
  TO authenticated
  USING (public.can_manage_creator(creator_id) OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER creator_posts_updated_at
  BEFORE UPDATE ON public.creator_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- post_likes
-- =========================
CREATE TABLE public.post_likes (
  post_id uuid NOT NULL REFERENCES public.creator_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

GRANT SELECT ON public.post_likes TO anon;
GRANT SELECT, INSERT, DELETE ON public.post_likes TO authenticated;
GRANT ALL ON public.post_likes TO service_role;

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read likes"
  ON public.post_likes FOR SELECT USING (true);

CREATE POLICY "Users can like as themselves"
  ON public.post_likes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unlike their own"
  ON public.post_likes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- =========================
-- post_comments
-- =========================
CREATE TABLE public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.creator_posts(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  is_removed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX post_comments_post_created_idx
  ON public.post_comments (post_id, created_at ASC)
  WHERE is_removed = false;

GRANT SELECT ON public.post_comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_comments TO authenticated;
GRANT ALL ON public.post_comments TO service_role;

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read non-removed comments"
  ON public.post_comments FOR SELECT
  USING (is_removed = false OR author_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Authenticated users can comment"
  ON public.post_comments FOR INSERT
  TO authenticated
  WITH CHECK (author_user_id = auth.uid());

CREATE POLICY "Authors, post owners or admins can remove comments"
  ON public.post_comments FOR UPDATE
  TO authenticated
  USING (
    author_user_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR EXISTS (
      SELECT 1 FROM public.creator_posts p
      WHERE p.id = post_id AND public.can_manage_creator(p.creator_id)
    )
  )
  WITH CHECK (true);

CREATE POLICY "Authors or admins can delete comments"
  ON public.post_comments FOR DELETE
  TO authenticated
  USING (author_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- =========================
-- counter triggers
-- =========================
CREATE OR REPLACE FUNCTION public.post_likes_counter()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.creator_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.creator_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

CREATE TRIGGER post_likes_counter_ins
  AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.post_likes_counter();

CREATE TRIGGER post_likes_counter_del
  AFTER DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.post_likes_counter();

CREATE OR REPLACE FUNCTION public.post_comments_counter()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_removed = false THEN
      UPDATE public.creator_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_removed = false THEN
      UPDATE public.creator_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_removed = false AND NEW.is_removed = true THEN
      UPDATE public.creator_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = NEW.post_id;
    ELSIF OLD.is_removed = true AND NEW.is_removed = false THEN
      UPDATE public.creator_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END; $$;

CREATE TRIGGER post_comments_counter_ins
  AFTER INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.post_comments_counter();

CREATE TRIGGER post_comments_counter_del
  AFTER DELETE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.post_comments_counter();

CREATE TRIGGER post_comments_counter_upd
  AFTER UPDATE OF is_removed ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.post_comments_counter();
