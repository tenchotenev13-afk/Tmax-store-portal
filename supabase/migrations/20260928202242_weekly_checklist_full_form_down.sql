-- Rollback на 20260928202242_weekly_checklist_full_form
--
-- Връща стойностите отпреди миграцията (сверени на 28.09.2026 преди прилагане).
--
-- ⚠ Петте нови колони се МАХАТ. weekly_checklist.metric_key има FK към
-- weekly_checklist_metrics(key) без ON DELETE CASCADE, тоест ако контролингът
-- вече е отметнал нещо в тях, delete-ът долу пада. Тогава първо реши какво
-- става с тези отметки — изтриването им е загуба на ръчна работа:
--   select metric_key, count(*) from public.weekly_checklist
--    where metric_key in ('razhodi','zanulyavane_lm','razliki_dostavka','srok_godnost','dogovoreni_returi')
--    group by 1;
-- Вместо delete може и active = false — колоните изчезват от таба и писмото,
-- отметките остават.
--
-- portal_value, записани по новите правила (revizia_grupi, storna_priem,
-- preocenka), НЕ се чистят — те са в weekly_checklist, не тук. Старият код не
-- пълни тези три показателя, тоест записаното остава видимо като бледа
-- стойност, докато някой не го изчисти.

delete from public.weekly_checklist_metrics
 where key in ('razhodi','zanulyavane_lm','razliki_dostavka','srok_godnost','dogovoreni_returi');

update public.weekly_checklist_metrics
   set source = 'bulletin_marker:revizii_grupi', active = false, sort_order = 2
 where key = 'revizia_grupi';

update public.weekly_checklist_metrics
   set source = 'module:kasa', sort_order = 5
 where key = 'storna_priem';

update public.weekly_checklist_metrics
   set source = 'manual', sort_order = 7
 where key = 'preocenka';

update public.weekly_checklist_metrics set sort_order = 6 where key = 'stoka_na_pat';
