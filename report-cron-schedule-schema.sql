-- report-cron-schedule-schema.sql
-- Разписанието на общите отчети — само за четене, за админ панела.
-- Приложено в Supabase (xiwkdiqqplgdcrkewgtv) на 18.09.2026.
-- Миграция: 20260918120256_report_cron_schedule
--
-- ЗАЩО
-- Колоната „Разписание" в Администрация → Известия → „📧 Общи отчети"
-- беше текст в admin.js ('петък 21:00'), който остана верен след смяната
-- на крона в базата само защото някой го поправи на ръка. Сега се чете от
-- cron.job: ден от седмицата (5-то поле на schedule) и часът по София от
-- условието в командата (extract(hour ... 'Europe/Sofia') = N).
--
-- ЗАЩО САМО ЧЕТЕНЕ
-- Поисканото беше и report_cron_set(kind, dow, hour) за смяна от админ
-- панела. НЕ е направена: порталът вика базата с публичния anon ключ, а
-- ролята се проверява само в браузъра (auth-login не дава сесия). RPC,
-- която вика cron.alter_job, би била достъпна за всеки с ключа. Смяната
-- остава ръчна — през Claude Code. Виж claude/open-tasks.md „Сървърна
-- проверка на самоличност".
--
-- КАКВО ВРЪЩА (без command — в него стои ключ):
--   kind        'daily' | 'weekly' | 'pallets' | 'warehouse' (от "type" в тялото)
--   dow         петото поле на cron: '*' = всеки ден, '0'..'6' (0 = неделя)
--   minute      минутата (UTC и София са с една и съща минута)
--   hour_sofia  часът по София от условието в командата
--   active      cron.job.active
-- Проверено на 18.09.2026 с anon ключа (GET /rest/v1/rpc/report_cron_schedule):
--   daily * 0 21 · pallets 5 0 18 · warehouse 0 0 21 · weekly 0 0 21.
--
-- ДОСТЪП: security definer (собственик postgres — anon няма USAGE върху
-- схемата cron, а RLS на cron.job показва само собствените задания);
-- search_path фиксиран; execute само за anon и authenticated.
-- SQL тест: tests/sql/report-cron-schedule.test.sql.
--
-- ОГЛЕДАЛО (Живко): нова ФУНКЦИЯ, без таблици и колони — за огледалото
-- нищо не се мени.

create or replace function public.report_cron_schedule()
returns table(kind text, dow text, minute int, hour_sofia int, active boolean)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select substring(j.command from '"type":"([a-z]+)"'),
         split_part(j.schedule, ' ', 5),
         case when split_part(j.schedule, ' ', 1) ~ '^\d+$' then split_part(j.schedule, ' ', 1)::int end,
         substring(j.command from 'Europe/Sofia''\)\s*=\s*(\d+)')::int,
         j.active
    from cron.job j
   where j.command ilike '%/functions/v1/send-scheduled-report%'
     and substring(j.command from '"type":"([a-z]+)"') in ('daily','weekly','pallets','warehouse');
$$;

revoke all on function public.report_cron_schedule() from public;
grant execute on function public.report_cron_schedule() to anon, authenticated;
