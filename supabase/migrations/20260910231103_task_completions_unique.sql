-- Дублирани отметки: чистене на датираните групи + два частични уникални индекса
--
-- ═══ КАКВО СЕ БЕШЕ СЛУЧИЛО ═══════════════════════════════════════════════
-- Към 10.09.2026 в task_completions има 34 групи
-- (store_name + task_id/recurring_task_id + completion_date) с повече от
-- един ред, общо 53 излишни:
--     18 групи с ДАТА      → 19 излишни реда   (тази миграция ги чисти)
--     16 групи с NULL дата → 34 излишни реда   (НЕ се пипат, виж долу)
--
-- Нито един дубликат не е от двойно натискане: най-малката разлика между два
-- реда в група е над 10 секунди, 19 групи са с над ЧАС разлика, а 7 са от
-- двама различни потребители на един обект. Причината е в клиента:
-- toggleTask()/toggleRecurringTask() избираха PATCH или POST според bulComps
-- В ПАМЕТТА. Отворен отдавна таб, друго устройство или втори човек на същия
-- обект значи стар bulComps → клиентът не вижда съществуващия ред и POST-ва
-- втори. Оттам и часовете разлика.
--
-- ═══ ЗАЩО NULL-ДАТА ГРУПИТЕ НЕ СЕ ПИПАТ ══════════════════════════════════
-- Редовете с completion_date IS NULL са отпреди полето да се пълни и не могат
-- да бъдат отнесени към конкретен ден. Отчетите вече ги изключват нарочно
-- (виж „184 фантома" в report.js и taskIsNotice-коментара в today.js).
-- Индексите долу също са ЧАСТИЧНИ и не ги обхващат: уникалност върху NULL
-- дата би значела „един ред завинаги", а точно това е погрешният модел, от
-- който проектът се измъкна.
--
-- ═══ КОЙ РЕД ОЦЕЛЯВА В ГРУПАТА ═══════════════════════════════════════════
--   1. този със снимки или документи (към 10.09.2026 в датираните групи няма
--      НИТО ЕДНА с прикачено — проверено; блокът долу пази това);
--   2. иначе с непразен коментар;
--   3. иначе последният по completed_at;
--   4. при пълно равенство — по-големият id, за да е детерминирано.
--
-- Коментарите, които падат, са прегледани поименно: „изпратено"/„качена",
-- „Изпълнено"/„ИЗПЪЛНЕНО", „качена ревизия"/„Качена" — един и същи смисъл с
-- други думи. Нищо съществено не се губи. Ако някога това престане да е
-- вярно, блокът „ПРОВЕРКА 2" долу няма да го хване — той пази само
-- прикачените файлове.
--
-- ═══ ПРЕДИ ДА ПРИЛОЖИШ ═══════════════════════════════════════════════════
-- Пусни това и виж числото. Очаква се 19 към 10.09.2026; всяко разминаване
-- значи, че оттогава са се появили нови дубликати — прочети ги, преди да
-- продължиш (клиентската поправка ги спира, но само след като е на живо):
--
--   with grp as (
--     select task_id, recurring_task_id, store_name, completion_date, count(*) n
--     from public.task_completions
--     where completion_date is not null
--     group by 1,2,3,4 having count(*) > 1
--   ) select count(*) as grupi, sum(n-1) as za_triene from grp;
--
-- Rollback: supabase/migrations/20260910231103_task_completions_unique_down.sql
-- ⚠️ Изтритите редове НЕ се възстановяват от rollback-а.

-- ── ПРОВЕРКА 1: колко ще паднат (влиза в изхода на apply_migration) ──────
do $$
declare v_grupi int; v_redove int;
begin
  select count(*), coalesce(sum(n - 1), 0) into v_grupi, v_redove
  from (
    select count(*) as n
    from public.task_completions
    where completion_date is not null
    group by task_id, recurring_task_id, store_name, completion_date
    having count(*) > 1
  ) g;
  raise notice 'Датирани групи с дубликати: %, редове за триене: %', v_grupi, v_redove;
end $$;

-- ── ПРОВЕРКА 2: спира, ако в датирана група има ПОВЕЧЕ ОТ ЕДИН ред с
--    прикачено. Тогава „кой оцелява" не е еднозначно и някой ще загуби
--    снимка. Днес такива няма; ако се появят, миграцията пада нарочно,
--    вместо да реши сама. Това е инвариант, не число — не остарява. ──────
do $$
declare v int;
begin
  select count(*) into v
  from (
    select count(*) filter (
             where (photos is not null and jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) > 0)
                or (files  is not null and jsonb_typeof(files)  = 'array' and jsonb_array_length(files)  > 0)
           ) as n_att
    from public.task_completions
    where completion_date is not null
    group by task_id, recurring_task_id, store_name, completion_date
    having count(*) > 1
  ) g
  where g.n_att > 1;
  if v > 0 then
    raise exception 'СПИРАМ: % датирани групи имат по повече от един ред с прикачен файл. Реши на ръка кой остава.', v;
  end if;
end $$;

-- ── ЧИСТЕНЕТО ────────────────────────────────────────────────────────────
-- PARTITION BY третира NULL като равни, тоест обикновените (recurring_task_id
-- е NULL) и постоянните (task_id е NULL) се групират правилно, без отделни
-- заявки за двата вида.
delete from public.task_completions t
using (
  select id,
         row_number() over (
           partition by task_id, recurring_task_id, store_name, completion_date
           order by
             case when (photos is not null and jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) > 0)
                    or (files  is not null and jsonb_typeof(files)  = 'array' and jsonb_array_length(files)  > 0)
                  then 0 else 1 end,
             case when coalesce(btrim(comment), '') <> '' then 0 else 1 end,
             completed_at desc nulls last,
             id desc
         ) as rn
  from public.task_completions
  where completion_date is not null
) r
where t.id = r.id and r.rn > 1;

-- ── ПРОВЕРКА 3: чисто ли е СЕГА. Ако не е, индексите долу и без това биха
--    паднали — но с неясно съобщение за конфликт вместо с това. ──────────
do $$
declare v int;
begin
  select count(*) into v
  from (
    select 1
    from public.task_completions
    where completion_date is not null
    group by task_id, recurring_task_id, store_name, completion_date
    having count(*) > 1
  ) g;
  if v > 0 then
    raise exception 'СПИРАМ: след чистенето още има % датирани групи с дубликати', v;
  end if;
end $$;

-- ── ИНДЕКСИТЕ ────────────────────────────────────────────────────────────
-- Частични, защото NULL дата е извън обхвата (виж горе). Два отделни, а не
-- един по coalesce: обикновената и постоянната задача пазят id-то си в
-- различна колона и общ израз би скрил кое е нарушено при конфликт.
create unique index if not exists task_completions_uniq_task
  on public.task_completions (task_id, store_name, completion_date)
  where task_id is not null and completion_date is not null;

create unique index if not exists task_completions_uniq_recurring
  on public.task_completions (recurring_task_id, store_name, completion_date)
  where recurring_task_id is not null and completion_date is not null;

comment on index public.task_completions_uniq_task is
  'Един ред на (задача от бюлетин, обект, ден). Частичен: NULL дата е извън обхвата. Клиентът (bulletin.js) поема 409 от него и минава в PATCH.';
comment on index public.task_completions_uniq_recurring is
  'Един ред на (постоянна задача, обект, ден). Частичен: NULL дата е извън обхвата. Клиентът (bulletin.js) поема 409 от него и минава в PATCH.';
