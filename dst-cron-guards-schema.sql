-- dst-cron-guards-schema.sql — 25/26.10.2026, сесия dst-cron
--
-- Защо: след края на лятното време (25.10.2026) пет pg_cron задачи тръгват с
-- час по-рано, защото са на фиксиран UTC час без проверка за софийски час.
-- Решение на Тенчо (25.10 вечерта): старите (летни) български часове се пазят
-- трайно — и зимно, и лятно.
--
-- Моделът е този на задачи 17–20 и 26: два UTC часа в графика + условие
-- `where extract(hour from now() at time zone 'Europe/Sofia') = N` в края на
-- командата. В единия от двата UTC часа условието е невярно и select-ът
-- връща 0 реда — net.http_post изобщо не се вика.
--
--   jobid  име                     стар график     нов график        час София
--   14     oborot-report-evening   45 17 * * *     45 17,18 * * *    20 (20:45)
--   16     weekly-routed-report    10 5 * * 1      10 5,6 * * 1       8 (08:10, пон.)
--    4     rm-push-morning         0 5 * * 1-5     0 5,6 * * 1-5      8 (RM-app)
--    5     rm-push-afternoon       0 11 * * 1-5    0 11,12 * * 1-5   14 (RM-app)
--    6     rm-push-evening         0 14 * * 1-5    0 14,15 * * 1-5   17 (RM-app)
--
-- 4–6 са RM-app (swift-handler), не порталът — Тенчо изрично реши да се
-- поправят и те.
--
-- Командите НЕ се преписват на ръка (носят ключа): гради се от текущата
-- команда — маха се крайната `;` (ако я има; 4–6 нямат) и се добавя where-а.
--
-- Идемпотентност: задача, чиято команда вече съдържа 'Europe/Sofia', се
-- прескача. Задача без 'Europe/Sofia', но с график, различен от стария
-- очакван, спира миграцията с грешка — някой я е пипал, не гадаем.
--
-- report_cron_schedule() не се засяга: чете само задачите на
-- send-scheduled-report (daily/weekly/pallets/warehouse).
--
-- Огледалото (Живко): нищо — cron.job не е в огледалото, няма нови колони,
-- таблици или статуси.

do $$
declare
  r record;
  cur_schedule text;
  cur_command  text;
begin
  for r in
    select * from (values
      (14, '45 17 * * *',  '45 17,18 * * *',  20),
      (16, '10 5 * * 1',   '10 5,6 * * 1',     8),
      ( 4, '0 5 * * 1-5',  '0 5,6 * * 1-5',    8),
      ( 5, '0 11 * * 1-5', '0 11,12 * * 1-5', 14),
      ( 6, '0 14 * * 1-5', '0 14,15 * * 1-5', 17)
    ) as t(jobid, old_schedule, new_schedule, sofia_hour)
  loop
    select schedule, command into cur_schedule, cur_command
      from cron.job where jobid = r.jobid;

    if not found then
      raise exception 'dst-cron: задача % липсва в cron.job', r.jobid;
    end if;

    if position('Europe/Sofia' in cur_command) > 0 then
      raise notice 'dst-cron: задача % вече има guard — прескачам', r.jobid;
      continue;
    end if;

    if cur_schedule <> r.old_schedule then
      raise exception 'dst-cron: задача % има график "%" вместо "%"',
        r.jobid, cur_schedule, r.old_schedule;
    end if;

    perform cron.alter_job(r.jobid,
      schedule := r.new_schedule,
      command  := regexp_replace(cur_command, ';\s*$', '')
                  || E'\n  where extract(hour from now() at time zone ''Europe/Sofia'') = '
                  || r.sofia_hour || ';');
  end loop;
end
$$;

-- ROLLBACK (ръчно, не се пуска с миграцията):
-- Връща старите графици и маха where-а. Внимание: при 4–6 оригиналната
-- команда е без крайна `;` — след rollback ще завършва с `;`. Семантично
-- е същото (една select заявка).
--
-- do $$
-- declare r record;
-- begin
--   for r in
--     select * from (values
--       (14, '45 17 * * *'), (16, '10 5 * * 1'),
--       ( 4, '0 5 * * 1-5'), ( 5, '0 11 * * 1-5'), ( 6, '0 14 * * 1-5')
--     ) as t(jobid, old_schedule)
--   loop
--     perform cron.alter_job(r.jobid,
--       schedule := r.old_schedule,
--       command  := regexp_replace(
--                     (select command from cron.job where jobid = r.jobid),
--                     '\s*where extract\(hour from now\(\) at time zone ''Europe/Sofia''\) = \d+;\s*$',
--                     ';'));
--   end loop;
-- end
-- $$;
