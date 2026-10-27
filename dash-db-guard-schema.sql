-- dash-db-guard-schema.sql — водещо „—" в празни полета: предпазител в базата.
-- Сесия dash-db-guard, 27.10.2026. Продължение на 39914e2 (escAttrVal, 16.10)
-- и почистването от 18.10 (claude/open/18-10-dash-empty-fields-live.md).
--
-- ФАКТИ (база, 27.10.2026, преди миграцията):
--   kasa_reports.cashier_name с водещо „—" — 95 реда (19.10–27.10), 1 точно „—".
--   stock_returns с водещо „—": store_comment 10, reason 14, courier_info 17,
--   control_comment 1, controller_comment 0, product_name 0.
--   Всички 7 колони са nullable (information_schema) — затова NULL е допустим
--   резултат и няма нужда от „остави оригинала".
--   Живите shared.js / kasa.js / stock-returns.js на Pages са байт в байт с
--   HEAD (ae96925) — кодът на сървъра не пише „—". Откъде идва — виж
--   claude/open/27-10-store-cache-version.md.
--
-- ПРАВИЛОТО — strip_leading_dash(x):
--   NULL → NULL; празно / само интервали / само „—" и интервали → NULL;
--   иначе маха ВОДЕЩИТЕ „—" (с интервалите между тях) и прави btrim.
--   Тире в средата („Излишък от разлика — ДЕНИКОМ ЕООД") НЕ се пипа — regex-ът
--   е закотвен с ^. Само em dash „—" (U+2014): тиретата „-" / „–" отпред
--   (15 касиера към 27.10) не са от esc() и не са в обхвата.
--   Следствие, което е нарочно: всеки запис в тези колони минава през btrim и
--   празен низ става NULL — клиентът показва и двете като празно (r.x||'').
--
-- ОБХВАТ: само kasa_reports и stock_returns. warranty_entries,
-- warranty_service_locations, bulletin_promotions НЕ — там има нарочни „—"
-- отпреди (решение 18.10.2026).
--
-- СИНХРОНИЗАЦИЯТА НЕ СЕ СЪБУЖДА. stock_returns_sync_upd е AFTER UPDATE … FOR
-- EACH STATEMENT и при UPDATE вика stock_returns_sync_completions() само за
-- редове, при които status или confirmed_date са се ПРОМЕНИЛИ по стойност
-- (сверено с pg_get_functiondef на 27.10.2026). BEFORE тригерът тук пипа само
-- текстовите колони отдолу, значи при почистването списъкът обекти е празен.
-- При INSERT синхронизацията тече както и досега — тригерът тук не я добавя.
--
-- ОГЛЕДАЛОТО: ред за Живко НЯМА — функция и тригер не са в mirror-schema.sql;
-- колоните са същите, огледалото изтегля почистените стойности само.

create or replace function public.strip_leading_dash(x text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(x, '^(\s*—)+', ''), E' \t\r\n'), '')
$$;

create or replace function public.kasa_reports_strip_dash_trg()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.cashier_name := public.strip_leading_dash(new.cashier_name);
  return new;
end
$$;

create or replace function public.stock_returns_strip_dash_trg()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.store_comment      := public.strip_leading_dash(new.store_comment);
  new.reason             := public.strip_leading_dash(new.reason);
  new.courier_info       := public.strip_leading_dash(new.courier_info);
  new.control_comment    := public.strip_leading_dash(new.control_comment);
  new.controller_comment := public.strip_leading_dash(new.controller_comment);
  new.product_name       := public.strip_leading_dash(new.product_name);
  return new;
end
$$;

drop trigger if exists kasa_reports_strip_dash on public.kasa_reports;
create trigger kasa_reports_strip_dash
  before insert or update on public.kasa_reports
  for each row execute function public.kasa_reports_strip_dash_trg();

drop trigger if exists stock_returns_strip_dash on public.stock_returns;
create trigger stock_returns_strip_dash
  before insert or update on public.stock_returns
  for each row execute function public.stock_returns_strip_dash_trg();

-- ── ROLLBACK ──────────────────────────────────────────────────────────────
-- drop trigger if exists kasa_reports_strip_dash on public.kasa_reports;
-- drop trigger if exists stock_returns_strip_dash on public.stock_returns;
-- drop function if exists public.kasa_reports_strip_dash_trg();
-- drop function if exists public.stock_returns_strip_dash_trg();
-- drop function if exists public.strip_leading_dash(text);
-- Данните (т.3, dash-db-guard-data.sql) се връщат отделно — от
-- dash_guard_bak_20261027, виж rollback-а в онзи файл.
