-- grafik-changes-schema-down.sql — rollback на grafik-changes-schema.sql.
-- ВНИМАНИЕ: grafik-api от v9 чете grafik_changes — ПРЕДИ това функцията се връща към v8
-- (комит 0fa8448), иначе действията changes_* дават 500. Въведените промени се губят.
drop table if exists public.grafik_changes;
