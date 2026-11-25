-- razliki-dovarshvane-schema.sql — Разлики: номер на ZSTR заявката и
-- „➡️ Към Контролинг" (25.11.2026, сесия razliki-dovarshvane; решения на
-- Тенчо 25.11.2026, claude/razliki-reshenia-2026-11-22.md).
--
-- Миграция 20261125122242 razliki_dovarshvane_columns (приложена 25.11.2026).
--
-- Четири nullable колони в stock_differences, без default, без CHECK.
-- Кодът само ги чете, докато не е push-нат → миграцията върви ПРЕДИ push-а.
--
--   zstr_number    — номерът на заявката ZSTR тип 4, който обектът пуска при
--                    излишък + return („📝 ЗАЯВКАТА Е ПУСНАТА", sap_done).
--                    НЕ е return_order_number: тя е поръчката за връщане към
--                    доставчик (За връщане / sdLineTouchedByOthers).
--   to_co_at       — кога складът е предал междускладовия ред на Контролинг.
--   to_co_by       — кой от склада го е предал.
--   to_co_comment  — задължителният коментар на склада.
--
-- Права: anon/authenticated имат табличен SELECT/INSERT/UPDATE върху
-- stock_differences (проверено 25.11.2026) — новите колони ги наследяват,
-- отделен grant не е нужен.
--
-- Правило 9 (25.11.2026, отворени междускладови редове, status <> 'received'),
-- по warehouse_response / store_response:
--   без отговор на склада ........................ 118
--   will_send, без отговор на обекта ............. 49
--   sent, без отговор на обекта .................. 48
--   return, без отговор на обекта ................ 28
--   return + no_stock ............................ 28
--   return + sap_done ............................ 14
--   sent_sap, без отговор на обекта .............. 6
--   общо 291; return_order_number попълнено — 0 от тях.
-- Кандидати за „➡️ Към Контролинг" (ход на склада): 118 + 49 + 14 = 181 преди
-- изключенията за насочени по 5а / отворена размяна / късно получени.
-- Нито един ред не става невалиден — колоните са nullable и празни.
--
-- Огледало (Живко): stock_differences + zstr_number text, to_co_at timestamptz,
-- to_co_by text, to_co_comment text — всички NULL.
--
-- ROLLBACK:
--   alter table public.stock_differences
--     drop column if exists zstr_number,
--     drop column if exists to_co_at,
--     drop column if exists to_co_by,
--     drop column if exists to_co_comment;

alter table public.stock_differences
  add column if not exists zstr_number   text,
  add column if not exists to_co_at      timestamptz,
  add column if not exists to_co_by      text,
  add column if not exists to_co_comment text;
