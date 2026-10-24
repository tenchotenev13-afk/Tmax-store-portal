-- 20261024150000_storno_notes_delete — огледало: storno-notes-delete-schema.sql.
-- Приложено 24.10.2026 с apply_migration; версия в базата 20261024133040.
-- „🗑 Изтрий" на съобщение от счетоводството; отговорите — FK on delete cascade
-- (cascade не минава през RLS, политика на storno_note_replies не трябва).

create policy storno_notes_delete on public.storno_notes for delete to anon using (true);
