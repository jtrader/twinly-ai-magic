
CREATE POLICY "post-media public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-media');

CREATE POLICY "post-media authenticated insert own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'post-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "post-media authenticated update own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'post-media' AND auth.uid() = owner)
  WITH CHECK (bucket_id = 'post-media' AND auth.uid() = owner);

CREATE POLICY "post-media authenticated delete own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'post-media' AND auth.uid() = owner);
