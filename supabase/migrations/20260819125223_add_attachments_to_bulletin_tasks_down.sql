-- 20260819125223_add_attachments_to_bulletin_tasks_down.sql
-- ВНИМАНИЕ: разрушителен. Към 19.08.2026 изтрива данни в 31 от 41 реда —
-- прикачените файлове на задачите в бюлетина. jsonb-ът е единственият запис
-- за връзката задача → файл в Storage; самите файлове остават висящи там,
-- без референция, и не могат да се възстановят от този rollback.
-- По избор, преди drop-а — резервно копие:
-- create table if not exists public._bak_bulletin_tasks_attachments as
--   select id, attachments from public.bulletin_tasks
--   where attachments is not null and attachments <> '[]'::jsonb;
alter table public.bulletin_tasks
  drop column if exists attachments;
