-- weekly-checklist-portal-mode-schema.sql
-- Огледало на supabase/migrations/20261026120000_weekly_checklist_portal_mode.sql.
--
-- ЗАЩО (checklist-live-calc, етап 1 от 3; решение на Тенчо 26.10.2026).
-- Стойностите в чек листа ще се смятат при четене от ЕДНА функция в базата
-- (checklist_portal_values), не от браузъра при отваряне на таба. За да
-- знае функцията в какъв вид е всяка колона от постоянна задача, режимът
-- минава от JS (CHECKLIST_PORTAL_MODE в checklist.js) в базата:
--   'any'       — има ли поне едно отмятане в срока → da / ne;
--   'count'     — колко РАЗЛИЧНИ дни са отметнати → „3/5";
--   'file_none' — отмятане с прикачен файл → da, иначе ne (nyamat — само ръчно).
-- NULL — колоната не е от постоянна задача (module: / manual) или режим няма.
-- Режимът е формат на КОЛОНАТА от бланката на контролинга, не свойство на
-- задачата — затова е тук, а не в recurring_tasks.
--
-- В този етап НИКОЙ не чете колоната: checklist.js още ползва своя
-- CHECKLIST_PORTAL_MODE. Етап 2 (табът чете от функцията) я прави
-- единствения източник. Данните долу са ТОЧНО сегашният CHECKLIST_PORTAL_MODE.
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9): nullable, без default — 12 реда, нито един
-- не става невалиден; 7 получават стойност.
--
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане".
-- Rollback: supabase/migrations/20261026120000_weekly_checklist_portal_mode_down.sql
--   alter table public.weekly_checklist_metrics drop column portal_mode;

alter table public.weekly_checklist_metrics add column portal_mode text;

alter table public.weekly_checklist_metrics
  add constraint weekly_checklist_metrics_portal_mode_chk
  check (portal_mode is null or portal_mode in ('any', 'count', 'file_none'));

comment on column public.weekly_checklist_metrics.portal_mode is
  'Вид на автоматичната стойност за колона от постоянна задача: any (da/ne) | count („3/5") | file_none (файл → da, иначе ne). NULL — не е от постоянна задача. Чете се от checklist_portal_values().';

update public.weekly_checklist_metrics m
   set portal_mode = v.mode
  from (values
    ('revizia_953',      'any'),
    ('revizia_grupi',    'any'),
    ('spravka_minusi',   'count'),
    ('preocenka',        'file_none'),
    ('srok_godnost',     'any'),
    ('zanulyavane_lm',   'any'),
    ('razliki_dostavka', 'count')
  ) as v(key, mode)
 where m.key = v.key;
