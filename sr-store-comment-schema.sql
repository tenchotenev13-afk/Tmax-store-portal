-- sr-store-comment-schema.sql
-- „Коментар обект" в „За връщане" — нова колона stock_returns.store_comment.
-- НЕ Е ПРИЛОЖЕНО. Прилага се ръчно в Supabase → SQL Editor (MCP е само за
-- четене). Кодът в stock-returns.js пише store_comment от модала — без
-- колоната PostgREST връща 400 на всеки запис. Затова: първо този SQL,
-- после push на кода.
--
-- ЗАЩО (29.09.2026, Цвети)
-- „Коментар" (control_comment) и „Коментар контролер" (controller_comment)
-- стават САМО за Цвети/admin: в първия тя отбелязва КИ, във втория дава
-- насоки към обекта. Досега всеки, който отвори модала, можеше да ги
-- презапише — вкл. магазинът. Обектът получава свое поле за свободен текст.
--
-- ДАННИТЕ (28.09.2026 → 29.09.2026)
-- 528 реда в stock_returns; 322 с control_comment, 331 с controller_comment.
-- Нито един не се пипа — новата колона тръгва празна.
--
-- ПРАВА — НИЩО НЕ СЕ ДОБАВЯ
-- pg_class.relacl: anon=arwdDxtm/postgres (табличен грант). RLS е включено
-- с една политика anon_all_sr (FOR ALL, using true, with check true) — не
-- изброява колони, тоест новата колона се покрива сама.

alter table public.stock_returns
  add column if not exists store_comment text null;

comment on column public.stock_returns.store_comment is
  'Коментар обект — свободен текст от магазина (и Цвети/admin). control_comment и controller_comment са само за Цвети/admin.';

-- Проверка: трябва да върне 1 ред.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'stock_returns'
   and column_name = 'store_comment';

-- ЗА ЖИВКО (огледалото)
-- Нова колона stock_returns.store_comment (text, null) -> трябва да влезе в
-- mirror-schema.sql и в $TableColumns за stock_returns в sync-mirror.ps1.

-- ─── ROLLBACK ────────────────────────────────────────────────────────────
-- ПЪРВО се връща кодът (иначе записът от модала пада с 400), после:
--
--   alter table public.stock_returns drop column if exists store_comment;
--
-- Губи се само написаното в „Коментар обект".
