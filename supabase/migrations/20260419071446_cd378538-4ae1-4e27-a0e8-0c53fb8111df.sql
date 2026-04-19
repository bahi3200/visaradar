DROP POLICY IF EXISTS "Public can view receipts" ON storage.objects;

-- Allow reading individual objects in receipts bucket, but not listing
CREATE POLICY "Public can read receipt objects"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts'
    AND name IS NOT NULL
    AND length(name) > 0
  );
