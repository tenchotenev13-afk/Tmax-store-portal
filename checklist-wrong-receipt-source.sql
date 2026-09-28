-- checklist-wrong-receipt-source.sql
-- „Сторна по грешни приеми" в чек листа: source 'module:kasa' → 'module:wrong_receipt'.
-- НЕ Е ПРИЛОЖЕНО. Прилага се ръчно след преглед.
--
-- ЗАЩО
-- Показателят стоеше с source 'module:kasa' и празна колона: в
-- CHECKLIST_MODULE_FILL (checklist.js) нарочно нямаше запис за 'kasa',
-- защото правилото не беше договорено. Правилото (28.09.2026):
--   · източник — бланките с direction='wrong_receipt' (differences_reports)
--     и редовете им (stock_differences); касата няма нищо общо;
--   · клетката е „бланки/редове" (напр. „2/5") за бланките, ПОДАДЕНИ в
--     показаната седмица; обект без сторна → „0/0";
--   · всички сторна еднакво — от ЦО и от магазина.
-- Кодът е в checklist.js под ключа 'wrong_receipt'. Докато source е
-- 'module:kasa', той не се задейства и колоната остава празна.
--
-- ЗАСЕГНАТИ ДАННИ (проверено 28.09.2026)
-- Един ред в weekly_checklist_metrics (key='storna_priem'). Записите в
-- weekly_checklist не се пипат: чек листът пише portal_value при отваряне
-- на седмица и никога не пипа control_value / control_num / comment.
-- В базата към 28.09.2026 няма нито една бланка wrong_receipt, тоест
-- първото отваряне ще запише „0/0" за всички обекти.
--
-- ОГЛЕДАЛОТО (Живко): няма нова таблица и нова колона — само стойност в
-- съществуваща колона. Синхронизацията я тегли сама.

begin;

update public.weekly_checklist_metrics
   set source = 'module:wrong_receipt'
 where key = 'storna_priem'
   and source = 'module:kasa';

-- Трябва да е точно 1 ред. Ако е 0, source вече е друг — спри и провери.
select key, label, source, active, value_type
  from public.weekly_checklist_metrics
 where key = 'storna_priem';

commit;

-- ---------------------------------------------------------------------
-- ОТКАТ (при нужда)
-- ---------------------------------------------------------------------
-- Обратимо без загуба на ръчна работа: връща празната колона. Вече
-- записаните portal_value („0/0", „2/5") остават в weekly_checklist, но
-- спират да се обновяват; control_* не са пипани никога.
--
-- update public.weekly_checklist_metrics
--    set source = 'module:kasa'
--  where key = 'storna_priem'
--    and source = 'module:wrong_receipt';
