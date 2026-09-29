-- transfers-events-schema.sql
-- Междускладови трансфери — етап 2: отметки по товар (transfer_cargo_events).
-- ПРИЛОЖЕНО В SUPABASE НА 29.09.2026 като миграция
-- 20260929195801_transfers_stage2_events и прочетено обратно (колони, FK,
-- политика, ACL). Този файл е ОГЛЕДАЛО на миграцията, не източник.
-- Rollback: supabase/migrations/20260929195801_transfers_stage2_events_down.sql.
-- Бележка за огледалото (Живко): claude/transfers-events-2026-09-29.md.
-- Етап 1 (transfers / transfer_cargo / transfer_counters): transfers-schema.sql.
--
-- transfers НЕ получава нова колона. transfers.status (text, без CHECK)
-- вече приема 'planned' | 'partial' | 'done' — пише ги клиентът
-- (tfSyncStatus в transfers.js) след всяка отметка; при „Предаден на куриер"
-- същият запис попълва и transfers.waybill_no, ако е бил празен.
--
-- Междускладови трансфери — етап 2: отметки по товар.
-- Нова таблица transfer_cargo_events — един ред на събитие.
-- transfers НЕ се променя схемно: transfers.status (text, без CHECK от
-- етап 1) започва да приема и 'partial' и 'done' — пише ги клиентът
-- (tfSyncStatus в transfers.js) след всяка отметка.
--
-- Видове (event):
--   unloaded          — „Разтоварен — чака прехвърляне": само в ПЪРВАТА точка
--                       на прехвърляне на товара (следващата за ТОЗИ транспорт)
--   received          — „Получен": при крайния получател
--   handed_to_courier — „Предаден на куриер": изпращачът; снимка ИЛИ № товарителница
--   problem           — „Проблем": всеки обект по маршрута на товара;
--                       problem_kind + задължителен коментар; НЕ спира товара
--   resolved          — „Решен": затваря проблем (resolves_id); изпращач или админ
-- „Премина" НЕ се пише — транзитът не е събитие.
-- Без value CHECK-ове (конвенцията на loading_*); правилата са в
-- tfEventAllowed() / tfValidateEvent() в transfers.js.

create table public.transfer_cargo_events (
  id           uuid primary key default gen_random_uuid(),
  cargo_id     uuid not null references public.transfer_cargo(id) on delete cascade,
  transfer_id  uuid not null references public.transfers(id) on delete cascade,
  store_name   text not null,                    -- обектът, който отбелязва
  event        text not null,                    -- unloaded | received | handed_to_courier | problem | resolved
  problem_kind text,                             -- само при problem: damaged | missing | incomplete
  comment      text,
  photos       jsonb not null default '[]'::jsonb, -- [{url,name}] — като differences_reports.photos
  waybill_no   text,                             -- при handed_to_courier
  resolves_id  uuid references public.transfer_cargo_events(id) on delete set null, -- при resolved
  created_by   text,
  created_at   timestamptz not null default now()
);
create index transfer_cargo_events_transfer_idx on public.transfer_cargo_events (transfer_id, created_at);
create index transfer_cargo_events_cargo_idx    on public.transfer_cargo_events (cargo_id);
create index transfer_cargo_events_resolves_idx on public.transfer_cargo_events (resolves_id);

grant all on table public.transfer_cargo_events to anon, authenticated, service_role;
alter table public.transfer_cargo_events enable row level security;
create policy anon_all_transfer_cargo_events on public.transfer_cargo_events
  for all to anon using (true) with check (true);
