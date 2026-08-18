-- Плосък изглед на файловете в Storage buckets, за да може огледалния
-- сървър да ги листва през същия REST механизъм като обикновените
-- таблици (Storage list API не листва рекурсивно по папки, това е
-- заобиколен път през storage.objects директно).
CREATE OR REPLACE VIEW public.storage_files_index AS
SELECT
  bucket_id,
  name,
  updated_at,
  created_at,
  (metadata->>'size')::bigint AS size_bytes,
  metadata->>'mimetype' AS mime_type
FROM storage.objects
WHERE bucket_id IN ('kasa-docs','bulletin-files','docs','contacts');

GRANT SELECT ON public.storage_files_index TO anon;
