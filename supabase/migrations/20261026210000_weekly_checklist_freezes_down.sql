-- Rollback на 20261026210000_weekly_checklist_freezes
--
-- Маха крона, функцията и таблицата. portal_value-тата, записани от
-- затварянията, ОСТАВАТ в weekly_checklist (те са последните изчислени
-- стойности). От етап 2 checklist.js чете weekly_checklist_freezes при
-- отваряне на таба — без таблицата всяка седмица изглежда незатворена и се
-- показва живо. Затова rollback-ът върви заедно с връщане на checklist.js.

select cron.unschedule('checklist-freeze-mon-0010')
 where exists (select 1 from cron.job where jobname = 'checklist-freeze-mon-0010');
drop function if exists public.checklist_freeze_week(int, int, text);
drop table if exists public.weekly_checklist_freezes;
