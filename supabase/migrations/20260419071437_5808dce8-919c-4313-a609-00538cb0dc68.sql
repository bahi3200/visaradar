-- Make receipts bucket public
UPDATE storage.buckets SET public = true WHERE id = 'receipts';

-- Public read access for receipts
DROP POLICY IF EXISTS "Public can view receipts" ON storage.objects;
CREATE POLICY "Public can view receipts"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'receipts');
