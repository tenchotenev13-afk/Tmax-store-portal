-- Rollback на 20261024150000_storno_notes_delete.
-- Данни не се губят. След него „🗑 Изтрий" трие 0 реда и казва „НЕ е изтрито".
drop policy if exists storno_notes_delete on public.storno_notes;
