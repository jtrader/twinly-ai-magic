
DROP POLICY IF EXISTS "Read likes on visible posts" ON public.post_likes;
DROP POLICY IF EXISTS "Authenticated read likes" ON public.post_likes;

CREATE POLICY "Read own or managed likes"
  ON public.post_likes
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.creator_posts p
      WHERE p.id = post_likes.post_id
        AND public.can_manage_creator(p.creator_id)
    )
  );
