-- Revert receipts bucket to private
UPDATE storage.buckets SET public = false WHERE id = 'receipts';

-- Remove public read policy
DROP POLICY IF EXISTS "Public can read receipt objects" ON storage.objects;
DROP POLICY IF EXISTS "Public can view receipts" ON storage.objects;