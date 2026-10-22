-- Rollback на 20261022120000_weekly_checklist_portal_columns
--
-- Връща стойностите отпреди миграцията (сверени в базата на 22.10.2026 преди
-- прилагане: трите колони source='manual', sublabel NULL; stoka_vrashtane
-- sublabel 'актуализирано от обекта').
--
-- portal_value, записани вече по новите правила, НЕ се чистят — те са в
-- weekly_checklist. При source='manual' кодът не ги пълни повече, тоест
-- записаното остава видимо като бледа стойност, докато някой не го изчисти.
-- Филтърът source=eq.diff за stoka_vrashtane е в checklist.js и rollback-ът
-- тук не го връща — за него трябва и връщане на кода.

update public.weekly_checklist_metrics
   set source = 'manual', sublabel = null
 where key in ('srok_godnost', 'razliki_dostavka', 'zanulyavane_lm');

update public.weekly_checklist_metrics
   set sublabel = 'актуализирано от обекта'
 where key = 'stoka_vrashtane';
