-- grafik-daily-schema-down.sql — rollback на grafik-daily-schema.sql (пакет 2А, дневна присъствена).
-- ПРЕДИ него: grafik-api върнат на версия без daily_* (иначе repo.ts вика липсваща функция / таблица).
-- Губят се отметките (кой кога е отбелязал деня). Промените от „✅ Днес“ ОСТАВАТ в grafik_changes като
-- обикновени промени — губи се само колоната source (кое е от дневната присъствена).

begin;
drop function public.grafik_daily_save(jsonb);
drop table public.grafik_daily_marks;
drop table public.grafik_daily;
alter table public.grafik_changes drop constraint grafik_changes_source_check;
alter table public.grafik_changes drop column source;
commit;
