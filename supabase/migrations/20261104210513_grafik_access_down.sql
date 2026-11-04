-- grafik-access-schema-down.sql — rollback на стъпка 1 (grafik-access-schema.sql).
-- Ако стъпка 2 вече е приложена, първо grafik-access-drop-settings-schema-down.sql
-- (връща ключовете в app_settings от таблицата), после това.
-- ВНИМАНИЕ: grafik-api от v7 чете grafik_access при всяка заявка — ПРЕДИ това функцията се
-- връща към v6 (комит fbdc0b8, чете app_settings), иначе всяка заявка към графика дава 500.
drop table if exists public.grafik_access;
