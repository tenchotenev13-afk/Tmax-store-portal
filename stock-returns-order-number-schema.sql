-- stock-returns-order-number-schema.sql
-- Номер на поръчка върху public.stock_returns.
-- Приложено в Supabase (xiwkdiqqplgdcrkewgtv) на 04.09.2026,
-- миграция stock_returns_add_order_number (версия 20260904070448).
--
-- ЗАЩО НОВА КОЛОНА, А НЕ ПРЕИЗПОЛЗВАНЕ НА purchase_order
-- В stock_returns вече има purchase_order ("ПВ-ЕВР") и id_euro ("ИД-ЕВРО").
-- Те идват от стария ERP износ и се пълнят при импорта от Excel в подтаб
-- "По рекламации". order_number е нещо друго: номерът на поръчката в SAP,
-- преписан от изходната разлика (stock_differences.order_number). Двете
-- живеят едновременно на един и същи ред и се показват в две отделни
-- колони - "Поръчка" и "ПВ-ЕВР". Смесването им би направило невъзможно
-- да се каже кое откъде е дошло.
--
-- ЗАЩО ИЗОБЩО
-- Записите в "За връщане → По разлики" се наливат автоматично, когато
-- Цветелина маркира разлика като "Връщане". Досега номерът на поръчката
-- оставаше само в "Разлики" и в "За връщане" не се виждаше по коя поръчка
-- е дошъл излишъкът - връзката се търсеше на ръка обратно.
--
-- ГРАНТ НЕ Е НУЖЕН
-- stock_returns има ТАБЛИЧЕН грант за anon
-- (relacl = anon=arwdDxtm/postgres), тоест новата колона се покрива
-- автоматично. За сравнение users има само anon=d/postgres и затова там
-- всяка колона иска изричен grant.
-- ⚠️ information_schema.column_privileges НЕ става за тази проверка - то
-- разгъва табличния грант по колони и показва редове, каквито няма.
-- Верният източник е pg_class.relacl.

alter table stock_returns
  add column if not exists order_number text;

comment on column stock_returns.order_number is
  'Номер на поръчка (SAP) от изходната разлика; попълва се автоматично при source=diff';

-- Обратно попълване за вече налетите записи. Само source='diff' - при
-- рекламациите няма изходна разлика, от която да се вземе номер.
-- Към 04.09.2026: 311 реда общо, 11 от тях source='diff', 4 получиха номер
-- (останалите седем са от разлики без попълнена поръчка).
-- Условието order_number is null пази вече попълнено от повторно писане,
-- тоест заявката може да се пусне пак без страничен ефект.
update stock_returns sr set order_number = d.order_number
  from stock_differences d
  where sr.diff_line_id = d.id and sr.source = 'diff'
    and sr.order_number is null and d.order_number is not null and d.order_number <> '';

-- ЗА ЖИВКО (огледалото)
-- Нова колона -> трябва да влезе в mirror-schema.sql и в $TableColumns за
-- stock_returns в sync-mirror.ps1. Иначе огледалото ще тегли таблицата без
-- нея и номерът на поръчката няма да има бекъп.

-- ─── ROLLBACK ────────────────────────────────────────────────────────────
-- Обратима БЕЗ загуба на данни, които ги няма другаде: order_number е
-- препис от stock_differences.order_number и се възстановява със същия
-- update по-горе. Клиентът чете r.order_number като falsy, ако колоната
-- липсва - колоната "Поръчка" просто излиза празна.
--
--   alter table stock_returns drop column if exists order_number;
