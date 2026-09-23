-- Приложено в Supabase на 23.09.2026, проект xiwkdiqqplgdcrkewgtv
-- Миграция: loading_store_added_rows (version 20260923075159) — Пакет Г2
--
-- Файлът е записан СЛЕД прилагането. Обратното четене потвърди петте колони:
--   added_by_store    boolean NOT NULL default false
--   approval_status   text
--   approval_by       text
--   approval_at       timestamptz
--   approval_comment  text
--
-- ЗА ЖИВКО: ПЕТ НОВИ КОЛОНИ в loading_list_items → mirror-schema.sql и
-- $TableColumns в sync-mirror.ps1. Нова таблица няма.
-- Бележка: claude/loading-store-rows-2026-09-23.md
-- Копие на DDL-а в корена: loading-list-store-rows-schema.sql
--
-- Rollback: supabase/migrations/20260923075159_loading_store_added_rows_down.sql
--
-- Правило 9 (проверено непосредствено преди прилагане):
--   loading_list_items = 8 реда. Нито един не става невалиден: added_by_store
--   има DEFAULT false и се попълва за заварените, останалите четири са
--   nullable. След прилагането: 0 реда с added_by_store, 0 с approval_status.
--
-- БЕЗ CHECK ПО approval_status — НАРОЧНО.
-- Същата причина като при loading_missing (20.09.2026): огледалото на Живко не
-- носи value CHECK-ове, а стойностите тук са четири и се пишат на ЕДНО място в
-- клиента (llDecideRow в loading.js). CHECK би дал 409 при следващата
-- стойност, а ползата е нула, докато единственият писач е този код.
--
-- ЗАЩО added_by_store Е ОТДЕЛНА КОЛОНА, А НЕ „approval_status is not null"
-- Двете щяха да съвпадат ДНЕС и да се разминат при първото решение да може
-- складът също да добавя ред след изпращане. „Кой е добавил реда" е факт за
-- произхода; „чака ли одобрение" е състояние на процеса. Слети в едно поле,
-- одобреният ред губи следата, че е дошъл отвън — а точно това се отпечатва
-- в бланката като „добавен от обекта".
--
-- ЗАЩО НЕ СЕ ПИПА received
-- Редът се записва с received=true в момента на добавянето: стоката Е при
-- обекта и това не подлежи на одобрение. Одобрява се дали влиза в
-- ДОКУМЕНТИТЕ на листа — броячи, печат, PDF, писмо до склада.

alter table public.loading_list_items
  add column if not exists added_by_store   boolean not null default false,
  add column if not exists approval_status  text,
  add column if not exists approval_by      text,
  add column if not exists approval_at      timestamptz,
  add column if not exists approval_comment text;

comment on column public.loading_list_items.added_by_store is
  'Редът е добавен от ОБЕКТА след изпращането на листа (получено в повече или неописано), не от склада. Заварените редове са false.';
comment on column public.loading_list_items.approval_status is
  'null (ред на склада) | pending | approved | rejected. БЕЗ check в базата — стойностите се пазят в клиента (loading.js), по модела на loading_missing и заради огледалото на Живко.';
comment on column public.loading_list_items.approval_by is
  'Кой е решил — складът-изпращач, регионалният на обекта или admin. Пълни се от клиента в момента на решението.';
comment on column public.loading_list_items.approval_at is
  'Кога е решено. Пълни се заедно с approval_by.';
comment on column public.loading_list_items.approval_comment is
  'Коментарът на решаващия. Задължителен при отхвърляне — иначе обектът не знае защо.';
