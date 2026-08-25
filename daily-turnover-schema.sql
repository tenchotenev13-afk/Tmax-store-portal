-- daily-turnover-schema.sql
-- Вечерен оборот — сводка по обект и ден.
-- Приложено в Supabase (xiwkdiqqplgdcrkewgtv) на 22.08.2026.
--
-- НЕ е счетоводен запис. Истинската каса остава в kasa_reports /
-- kasa_glavna / kasa_zoborot и се попълва на следващия ден. Тази таблица
-- захранва само вечерния информативен имейл в 20:30 и справката в портала.
-- Записът не се коригира и не се връща за преработка — при грешка
-- истината идва от ПОС отчета на следващия ден.

create table if not exists public.daily_turnover (
  id             uuid primary key default gen_random_uuid(),
  store_name     text not null,
  date           date not null,
  total_turnover numeric(12,2) not null,
  cash_turnover  numeric(12,2) not null,
  card_turnover  numeric(12,2) not null,
  customers      integer not null,
  note           text,
  created_by     text,
  created_at     timestamptz not null default now(),
  -- Добавена на 25.08.2026 с плащането по банка. Стои последна, защото в
  -- живата таблица е добавена с alter table, а не при създаването.
  bank_turnover  numeric(12,2) not null default 0,

  constraint daily_turnover_store_date_uniq unique (store_name, date),

  -- Разминаването между общия оборот и сбора по начини на плащане.
  --
  -- 22.08.2026 (първоначално): толеранс 1 лв., само за закръгляния на
  --   фискалното устройство. Основание (1439 ПОС отчета за 60 дни):
  --   92,3% точно равни, 4,0% с разлика под 1 лв. (стотинки), 3,7% над
  --   1 лв. — всички грешки от типа изместена запетая (Раднево 768 125
  --   вместо 7 681,25; Силистра 100 983 вместо 1 009,83).
  -- 25.08.2026: толерансът стана greatest(1, total * 0.5) и в сбора влезе
  --   и bank_turnover. Твърдият праг от 1 правеше подаването невъзможно,
  --   когато клиент плати по банка, а касиерът маркира „в брой".
  -- 26.08.2026: прагът се свива от 50% на 10%. 50% хващаше само изместената
  --   десетична точка и пропускаше по-малките грешки в преписването;
  --   законните разлики от начина на плащане остават под 10%.
  --
  -- ⚠️ ЖИВАТА база към 26.08.2026 още пази 0.5 — този файл описва целта.
  -- Смяната се прилага отделно от Тенчо:
  --   alter table public.daily_turnover drop constraint daily_turnover_sum_chk;
  --   alter table public.daily_turnover add constraint daily_turnover_sum_chk
  --     check (abs(total_turnover - cash_turnover - card_turnover - bank_turnover)
  --            <= greatest(1, total_turnover * 0.1));
  -- Клиентът (daily-turnover.js) вече брои по 10%, тоест е ПО-СТРОГ от
  -- базата. Това е безопасната посока: отказът идва с разбираемо съобщение
  -- от интерфейса, вместо базата да върне „нарушен CHECK".
  constraint daily_turnover_sum_chk
    check (abs(total_turnover - cash_turnover - card_turnover - bank_turnover)
           <= greatest(1, total_turnover * 0.1)),

  constraint daily_turnover_nonneg_chk
    check (total_turnover >= 0 and cash_turnover >= 0
           and card_turnover >= 0 and bank_turnover >= 0 and customers >= 0)
);

create index if not exists daily_turnover_date_idx
  on public.daily_turnover (date);
create index if not exists daily_turnover_store_date_idx
  on public.daily_turnover (store_name, date desc);

alter table public.daily_turnover enable row level security;

drop policy if exists anon_all_daily_turnover on public.daily_turnover;
create policy anon_all_daily_turnover on public.daily_turnover
  for all using (true) with check (true);

comment on table public.daily_turnover is
  'Вечерна сводка на оборота по обект и ден. Информативна, не счетоводна. Захранва имейла в 20:30.';


-- Кой получава вечерния имейл.
-- Нарочно отделно от users.assigned_stores: зачисленията вече значат нещо
-- друго за счетоводството (13 души към 22.08.2026), а те НЕ получават
-- този имейл.
--   'all'      -> един имейл с всички обекти (собственик)
--   'assigned' -> един имейл само с обектите от assigned_stores (регионални)
--   NULL       -> не получава
alter table public.users
  add column if not exists oborot_report text;

alter table public.users
  drop constraint if exists users_oborot_report_chk;
alter table public.users
  add constraint users_oborot_report_chk
  check (oborot_report is null or oborot_report in ('all','assigned'));

comment on column public.users.oborot_report is
  'Получател на вечерния имейл с оборота: all | assigned | NULL.';


-- ---------------------------------------------------------------------
-- ОТКАТ (при нужда)
-- ---------------------------------------------------------------------
-- drop table if exists public.daily_turnover;
-- alter table public.users drop constraint if exists users_oborot_report_chk;
-- alter table public.users drop column if exists oborot_report;
