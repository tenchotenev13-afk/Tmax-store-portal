-- dash-db-guard-data.sql — почистване на водещото „—" в заварените редове.
-- Сесия dash-db-guard, 27.10.2026. Пуска се СЛЕД dash-db-guard-schema.sql:
-- самият update е „x = x", а стойността я чисти тригерът (strip_leading_dash),
-- тоест правилото е на ЕДНО място — в базата.
--
-- Пуска се през apply_migration: execute_sql е само за четене (25006 при запис).
-- Всичко е ЕДИН DO блок = една транзакция. Гардове (raise → нищо не остава):
--   - тригерите съществуват;
--   - редовете в резервата = засегнатите от update редове, по таблица;
--   - след update — 0 реда с водещо „—" в осемте колони.
--
-- ФАКТИ ПРЕДИ (база, 27.10.2026 ~12:00): kasa_reports.cashier_name 95;
-- stock_returns: store_comment 10, reason 14, courier_info 17,
-- control_comment 1, controller_comment 0, product_name 0. Броят може да е
-- нараснал до пускането (обектите пишат) — затова гардът е по съответствие,
-- не по закован брой, а реалните числа се отчитат от резервата.
--
-- РЕЗЕРВА: dash_guard_bak_20261027 (tbl, id, col, old_value) — по ред на
-- КОЛОНА, само колоните с водещо „—". RLS включено без политики: anon и
-- authenticated не я виждат през PostgREST (вътре има имена на касиери).
-- Временна е — не е за огледалото; трие се след проверката на 28.10.

-- ── 1. ПРОВЕРКА ПРЕДИ ─────────────────────────────────────────────────────
-- select c, count(*) from (
--   select 'kasa_reports.cashier_name' c from kasa_reports where cashier_name ~ '^\s*—'
--   union all select 'stock_returns.' || v.c from stock_returns,
--     lateral (values ('store_comment',store_comment),('reason',reason),
--       ('courier_info',courier_info),('control_comment',control_comment),
--       ('controller_comment',controller_comment),('product_name',product_name)) v(c,x)
--    where v.x ~ '^\s*—') q group by c order by c;

-- ── 2. РЕЗЕРВА + UPDATE (една транзакция) ─────────────────────────────────
create table public.dash_guard_bak_20261027 (
  tbl       text not null,
  id        uuid not null,
  col       text not null,
  old_value text,
  saved_at  timestamptz not null default now(),
  primary key (tbl, id, col)
);
alter table public.dash_guard_bak_20261027 enable row level security;
revoke all on public.dash_guard_bak_20261027 from anon, authenticated;

do $$
declare
  n_bak_k int; n_bak_s_rows int; n_upd_k int; n_upd_s int; n_left int;
begin
  if not exists (select 1 from pg_trigger where tgname = 'kasa_reports_strip_dash')
     or not exists (select 1 from pg_trigger where tgname = 'stock_returns_strip_dash') then
    raise exception 'dash-db-guard-data: няма тригер — първо dash-db-guard-schema.sql';
  end if;

  insert into public.dash_guard_bak_20261027 (tbl, id, col, old_value)
  select 'kasa_reports', id, 'cashier_name', cashier_name
    from public.kasa_reports where cashier_name ~ '^\s*—';

  insert into public.dash_guard_bak_20261027 (tbl, id, col, old_value)
  select 'stock_returns', r.id, v.c, v.x
    from public.stock_returns r,
         lateral (values ('store_comment', r.store_comment), ('reason', r.reason),
                         ('courier_info', r.courier_info), ('control_comment', r.control_comment),
                         ('controller_comment', r.controller_comment), ('product_name', r.product_name)) v(c, x)
   where v.x ~ '^\s*—';

  select count(*) into n_bak_k from public.dash_guard_bak_20261027 where tbl = 'kasa_reports';
  select count(distinct id) into n_bak_s_rows from public.dash_guard_bak_20261027 where tbl = 'stock_returns';

  with u as (
    update public.kasa_reports set cashier_name = cashier_name
     where cashier_name ~ '^\s*—' returning 1
  ) select count(*) into n_upd_k from u;

  with u as (
    update public.stock_returns
       set store_comment = store_comment, reason = reason, courier_info = courier_info,
           control_comment = control_comment, controller_comment = controller_comment,
           product_name = product_name
     where store_comment ~ '^\s*—' or reason ~ '^\s*—' or courier_info ~ '^\s*—'
        or control_comment ~ '^\s*—' or controller_comment ~ '^\s*—' or product_name ~ '^\s*—'
    returning 1
  ) select count(*) into n_upd_s from u;

  if n_upd_k <> n_bak_k or n_upd_s <> n_bak_s_rows then
    raise exception 'dash-db-guard-data: резерва ≠ update (kasa % / %, stock_returns % / %) — нищо не е записано',
      n_bak_k, n_upd_k, n_bak_s_rows, n_upd_s;
  end if;

  select (select count(*) from public.kasa_reports where cashier_name ~ '^\s*—')
       + (select count(*) from public.stock_returns
           where store_comment ~ '^\s*—' or reason ~ '^\s*—' or courier_info ~ '^\s*—'
              or control_comment ~ '^\s*—' or controller_comment ~ '^\s*—' or product_name ~ '^\s*—')
    into n_left;
  if n_left <> 0 then
    raise exception 'dash-db-guard-data: след update остават % реда с водещо „—" — нищо не е записано', n_left;
  end if;

  raise notice 'dash-db-guard-data: kasa_reports %, stock_returns % реда', n_upd_k, n_upd_s;
end $$;

-- ── 3. ПРОВЕРКА СЛЕД (очаква се 0 и броеве по колона = проверката преди) ───
-- (заявката от т.1 → празен резултат)
-- select tbl, col, count(*), count(*) filter (where old_value ~ '^\s*—\s*$') само_тире
--   from dash_guard_bak_20261027 group by 1,2 order by 1,2;

-- ── ROLLBACK НА ДАННИТЕ ───────────────────────────────────────────────────
-- Тригерът ще изчисти върнатото „—" отново — затова първо се маха той
-- (rollback-ът в dash-db-guard-schema.sql), после:
-- update public.kasa_reports k set cashier_name = b.old_value
--   from public.dash_guard_bak_20261027 b
--  where b.tbl = 'kasa_reports' and b.id = k.id and b.col = 'cashier_name';
-- update public.stock_returns s set
--   store_comment      = coalesce((select old_value from public.dash_guard_bak_20261027 b where b.tbl='stock_returns' and b.id=s.id and b.col='store_comment'), s.store_comment),
--   reason             = coalesce((select old_value from public.dash_guard_bak_20261027 b where b.tbl='stock_returns' and b.id=s.id and b.col='reason'), s.reason),
--   courier_info       = coalesce((select old_value from public.dash_guard_bak_20261027 b where b.tbl='stock_returns' and b.id=s.id and b.col='courier_info'), s.courier_info),
--   control_comment    = coalesce((select old_value from public.dash_guard_bak_20261027 b where b.tbl='stock_returns' and b.id=s.id and b.col='control_comment'), s.control_comment),
--   controller_comment = coalesce((select old_value from public.dash_guard_bak_20261027 b where b.tbl='stock_returns' and b.id=s.id and b.col='controller_comment'), s.controller_comment),
--   product_name       = coalesce((select old_value from public.dash_guard_bak_20261027 b where b.tbl='stock_returns' and b.id=s.id and b.col='product_name'), s.product_name)
--  where s.id in (select id from public.dash_guard_bak_20261027 where tbl = 'stock_returns');
-- drop table public.dash_guard_bak_20261027;   -- само след като rollback-ът е проверен
