-- diff-return-order-schema.sql
-- „Поръчка за връщане" (42…) — отделна колона в stock_differences.
-- НЕ Е ПРИЛОЖЕНО. Прилага се ръчно в Supabase → SQL Editor (MCP е само за
-- четене). Две ОТДЕЛНИ стъпки: първо колоната (ЧАСТ 1), после
-- преместването на данните (ЧАСТ 2). Кодът в stock-differences.js пише
-- return_order_number — без колоната PostgREST връща 400 на всеки запис от
-- модала на Цвети. Затова: първо този SQL, после push на кода.
--
-- ЗАЩО
-- stock_differences има само order_number („Поръчка"). Цвети го ползва за
-- поръчката ЗА ВРЪЩАНЕ (42… номера), а поръчката ОТ ДОСТАВЧИКА (41…) не се
-- пази никъде. Следващата стъпка ще направи 41… задължителна при подаване —
-- затова 42… трябва първо да има свое място (точка 1 от Цвети, част 1).
--
-- ДАННИТЕ (проверено 28.09.2026, 684 реда)
--   order_number 42… : 27  (всичките 10-цифрени, 4200017097…4200017460)
--   order_number 41… : 3
--   друг непразен    : 1   (4400001203 — остава в order_number)
--   празни           : 653
-- Нито една стойност с интервали или нецифрени знаци.
--
-- ГРАНТ НЕ Е НУЖЕН — проверката е pg_class.relacl, не
-- information_schema.column_privileges (то разгъва табличния грант по колони
-- и показва редове, каквито няма). Провери преди ЧАСТ 1:
--   select relacl, relrowsecurity from pg_class
--    where oid = 'public.stock_differences'::regclass;
-- Очаквано: anon=arwdDxtm/postgres (табличен грант) — новата колона се
-- покрива автоматично.

-- ─── ЧАСТ 1: колоната ────────────────────────────────────────────────────
alter table public.stock_differences
  add column if not exists return_order_number text null;

comment on column public.stock_differences.return_order_number is
  'Поръчка за връщане (42…) — попълва ЦО (Цвети). Поръчката от доставчика (41…) остава в order_number.';

-- Проверка: трябва да върне 1 ред.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'stock_differences'
   and column_name = 'return_order_number';

-- ─── ЧАСТ 2: преместване на 42… ──────────────────────────────────────────
-- САМО '42%'. 41…, 44… и празните не се пипат. return_order_number се пише
-- само ако е празна — повторно пускане не презаписва нищо.
begin;

update public.stock_differences
   set return_order_number = btrim(order_number),
       order_number        = null
 where btrim(order_number) like '42%'
   and return_order_number is null;

-- Проверка: moved = 27, left_42 = 0, 41… (3) и 44… (1) непокътнати.
select
  count(*) filter (where return_order_number like '42%')     as moved,
  count(*) filter (where btrim(order_number) like '42%')     as left_42,
  count(*) filter (where btrim(order_number) like '41%')     as still_41,
  count(*) filter (where btrim(order_number) like '44%')     as still_44
from public.stock_differences;

-- „За връщане" (stock_returns): същото разделяне. От 28.09.2026 кодът пише
-- 41… в order_number („Поръчка") и 42… в purchase_order (ПВ-ЕВР). Два
-- заварени реда (source='diff') носят 42… в order_number:
--   418f1598… order_number 4200017243, purchase_order NULL
--   d9fc5406… order_number 4200017237, purchase_order 4200017237 (същото)
-- 42… отива в purchase_order САМО ако то е празно или вече е същото число —
-- различно ПВ-ЕВР не се презаписва (такъв ред няма към 28.09.2026).
update public.stock_returns
   set purchase_order = btrim(order_number),
       order_number   = null
 where source = 'diff'
   and btrim(order_number) like '42%'
   and (nullif(btrim(purchase_order), '') is null
        or btrim(purchase_order) = btrim(order_number));

-- Проверка: sr_left_42 = 0, sr_po_42 включва 4200017243 и 4200017237.
select
  count(*) filter (where btrim(order_number) like '42%')     as sr_left_42,
  count(*) filter (where btrim(purchase_order) in ('4200017243','4200017237')) as sr_po_42
from public.stock_returns
where source = 'diff';

commit;

-- ЗА ЖИВКО (огледалото)
-- Нова колона stock_differences.return_order_number (text, null) -> трябва
-- да влезе в mirror-schema.sql и в $TableColumns за stock_differences в
-- sync-mirror.ps1. ЧАСТ 2 мени стойности в order_number на 27 реда (стават
-- NULL) — огледалото ги изтегля само, но при сравнение по order_number
-- тези редове ще изглеждат променени.

-- ─── ROLLBACK ────────────────────────────────────────────────────────────
-- ПЪРВО се връща кодът (иначе записът от модала пада с 400), после:
--
--   begin;
--   update public.stock_differences
--      set order_number = return_order_number
--    where return_order_number like '42%'
--      and order_number is null;
--   update public.stock_returns
--      set order_number = purchase_order
--    where id in ('418f1598-b519-4709-bd9d-a5af333e1639',
--                 'd9fc5406-a93f-4650-9974-7537f78ab756')
--      and order_number is null;
--   commit;
--   alter table public.stock_differences drop column if exists return_order_number;
--
-- Връщането е без загуба, докато никой не е записал 41… в order_number на
-- ред, чиято 42… е преместена (тогава order_number вече не е null и редът
-- се пропуска — трябва ръчно решение).
