-- Чек лист, checklist-live-calc етап 1: режимът на колоната от JS в базата (26.10.2026).
-- Обяснението — в weekly-checklist-portal-mode-schema.sql (корен). Rollback: *_down.sql.

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
