-- problem-articles-schema.sql
-- Огледало на supabase/migrations/20261119102207_problem_articles.sql (приложена 19.11.2026).
--
-- ЗАЩО (Разлики, етап 7а, сесия razliki-etap7a, 19.11.2026; решения на
-- Миглена 14.10 и 22.10 — файлът „проблемни артикули.xlsx“; Тенчо 22.10 —
-- отделен под-таб в Разлики, Минуси само чете оттам; claude/razliki-reshenia-
-- 2026-11.md т.5): регистър на артикулите, чийто баркод се чете като друг
-- артикул (за преналепяне). Порталът го показва в под-таб „🏷️ Проблемни
-- артикули“ и предупреждава във формата за подаване на разлика.
--
-- · Един АКТИВЕН запис на код — уникален частичен индекс по material_code
--   при status = 'active'. Затворен запис остава (status 'closed', closed_by /
--   closed_at) — не се трие.
-- · RLS включен; политики select / insert / update за anon и authenticated.
--   БЕЗ delete — конвенцията на новите таблици (default privileges от
--   04.11.2026 не дават DELETE; тук и изрично revoke). Пишат от браузъра
--   групите 'razliki_co' / 'razliki_barcode' — правото е в портала, както при
--   останалите таблици на Разлики (anon ключът е публичен).
-- · source: 'seed' (началните 23 от файла на Миглена), 'office' (въведен от
--   ЦО в портала), 'diff' (от ред „грешен баркод“ — етап 7б); source_line_id —
--   stock_differences.id за 7б. photos — готово за снимки (качването — по-късно).
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9): таблицата е нова — засегнати редове няма.
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане“ — нова таблица.
--
-- Rollback (supabase/migrations/20261119102207_problem_articles_down.sql):
--   drop table if exists public.problem_articles;

create table public.problem_articles (
  id              uuid primary key default gen_random_uuid(),
  material_code   text not null,
  material_name   text,
  reads_as_code   text,
  reads_as_name   text,
  store_action    text not null default 'за преналепяне',
  note            text,
  photos          jsonb not null default '[]'::jsonb,
  valid_from      date not null default current_date,
  status          text not null default 'active',
  source          text not null default 'office',
  source_line_id  uuid,
  created_by      text,
  created_at      timestamptz default now(),
  updated_by      text,
  updated_at      timestamptz,
  closed_by       text,
  closed_at       timestamptz
);

comment on table public.problem_articles is
  'Разлики — проблемни артикули (баркодът се чете като друг артикул). Един активен запис на код; затваря се (status closed), не се трие. Етап 7а, 19.11.2026.';
comment on column public.problem_articles.material_code is 'Кодът по система (SAP) на артикула.';
comment on column public.problem_articles.reads_as_code is 'Кодът, на който чете баркодът (NULL — не се чете / неизвестно).';
comment on column public.problem_articles.store_action is 'Какво прави обектът, напр. „за преналепяне“.';
comment on column public.problem_articles.status is '''active'' / ''closed''.';
comment on column public.problem_articles.source is '''seed'' (началните от файла) / ''office'' (ЦО в портала) / ''diff'' (от ред „грешен баркод“, 7б).';
comment on column public.problem_articles.source_line_id is 'stock_differences.id, от който е създаден записът (7б).';

create unique index problem_articles_active_code_uq
  on public.problem_articles (material_code)
  where status = 'active';

alter table public.problem_articles enable row level security;
create policy problem_articles_select on public.problem_articles
  for select to anon, authenticated using (true);
create policy problem_articles_insert on public.problem_articles
  for insert to anon, authenticated with check (true);
create policy problem_articles_update on public.problem_articles
  for update to anon, authenticated using (true) with check (true);

revoke delete, truncate on table public.problem_articles from anon, authenticated;
grant select, insert, update on table public.problem_articles to anon, authenticated;
