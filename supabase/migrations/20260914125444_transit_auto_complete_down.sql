-- Rollback на 20260914125444_transit_auto_complete.sql
--
-- ⚠️ Първо се връща КЛИЕНТЪТ (transit.js, bulletin.js). Изчезнат ли колоните,
-- докато кодът ги иска, PostgREST връща 42703 за всяка заявка с reviewed_at /
-- auto_complete в select или в тялото: Стока на път и формата за задача в
-- Бюлетина спират да записват.
--
-- ⚠️ Трие отметките „проверено, не е пристигнало" (reviewed_at/reviewed_by) —
-- те НЕ се възстановяват. Виж колко са преди това:
--   select store_name, count(*) from public.goods_transit
--    where reviewed_at is not null group by 1 order by 1;
--
-- Автоматично записаните отметки в task_completions ОСТАВАТ — те са факт
-- („всички редове обработени" към момента на записа), а отчетите вече може
-- да са ги изпратили. Ако все пак трябва да паднат — отделно решение:
--   select count(*) from public.task_completions where completed_by = 'auto:transit';
-- Отложени редове, превърнати в done, НЕ се връщат в postponed, а предишните
-- им completed_by/completed_at са презаписани. Разпознават се така:
--   select * from public.task_completions
--    where completed_by = 'auto:transit' and postponed_to is not null;

drop trigger if exists bulletin_tasks_transit_sync on public.bulletin_tasks;
drop trigger if exists goods_transit_sync_del on public.goods_transit;
drop trigger if exists goods_transit_sync_upd on public.goods_transit;
drop trigger if exists goods_transit_sync_ins on public.goods_transit;

drop function if exists public.bulletin_tasks_transit_sync_trg();
drop function if exists public.goods_transit_sync_trg();
drop function if exists public.transit_sync_completions(text);
drop function if exists public.transit_store_done(text);

alter table public.bulletin_tasks
  drop column if exists auto_complete;

alter table public.goods_transit
  drop column if exists reviewed_by,
  drop column if exists reviewed_at;
