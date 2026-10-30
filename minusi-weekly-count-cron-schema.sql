-- minusi-weekly-count-cron-schema.sql
-- Крон 30 (minus-multi-mon-8h, send-scheduled-report type 'minus_multi'):
-- понеделник 08:00 → 11:00 по София (сесия minusi-weekly-count, 30.10.2026).
-- Повод: движенията от петък–неделя влизат в понеделник между 08:34 и 09:25
-- (26.10 в 08:34, 27.10 в 09:25) — в 08:00 последните 3 дни от седмицата липсват
-- и в „Минуси за седмицата", и в повтарящите се.
--
-- Моделът (CLAUDE.md, „Схемни промени"; dst_cron_guards 25.10): два UTC часа
-- + условие за часа в София. 11:00 София = 08:00 UTC лятно (UTC+3) / 09:00 UTC
-- зимно (UTC+2) → '0 8,9 * * 1' и `= 11`. Едното събуждане праща, другото дава 0 реда.
-- Името на заданието остава minus-multi-mon-8h (cron.alter_job не преименува;
-- jobid 30 се пази, report_cron_schedule() чете часа от условието, не от името).
-- Командата се сменя САМО в числото на условието — Authorization (service ключ)
-- не минава през този файл.
--
-- ПРИЛОЖЕНО 30.10.2026 през apply_migration: версия 20261030120628, minus_multi_cron_mon_11h
-- (supabase/migrations/20261030120628_minus_multi_cron_mon_11h.sql + _down.sql). Проверено след
-- това: job 30 — 0 8,9 * * 1, active, условие = 11, type/url/Authorization непокътнати;
-- report_cron_schedule() → {minus_multi, dow 1, minute 0, hour_sofia 11, active}.
--
-- Up:
do $$
declare c text;
begin
  select command into c from cron.job where jobid = 30 and jobname = 'minus-multi-mon-8h' and schedule = '0 5,6 * * 1';
  if c is null or position('Europe/Sofia'') = 8;' in c) = 0 or position('"type":"minus_multi"' in c) = 0 then
    raise exception 'job 30 не е в очакваното състояние (0 5,6 * * 1, = 8, minus_multi)';
  end if;
  perform cron.alter_job(30, schedule := '0 8,9 * * 1',
    command := replace(c, 'Europe/Sofia'') = 8;', 'Europe/Sofia'') = 11;'));
end $$;

-- Rollback (обратно на 08:00 с guard):
-- do $$
-- declare c text;
-- begin
--   select command into c from cron.job where jobid = 30 and schedule = '0 8,9 * * 1';
--   if c is null or position('Europe/Sofia'') = 11;' in c) = 0 then
--     raise exception 'job 30 не е в очакваното състояние (0 8,9 * * 1, = 11)';
--   end if;
--   perform cron.alter_job(30, schedule := '0 5,6 * * 1',
--     command := replace(c, 'Europe/Sofia'') = 11;', 'Europe/Sofia'') = 8;'));
-- end $$;
--
-- Проверка след прилагане: select jobid, schedule, active, command ~ '= 11;' from cron.job where jobid = 30;
-- и select * from report_cron_schedule() where kind = 'minus_multi'; → hour_sofia 11, dow 1.
--
-- ОГЛЕДАЛО (Живко): нищо — крон задание, без таблици и колони.
