-- picking-shipments-schema.sql — Пикинг, етап 2, част Б: транспорт от склада
-- към обекта („🚚 Изпращане"), „Тръгна", известие, приемане от обекта.
-- Огледало на миграцията (версията е дадена от базата):
--   supabase/migrations/20261023085447_picking_shipments_schema.sql (+ _down.sql)
-- Ред на прилагане: схема → проверка в базата → push на кода.
--
-- ЗАЩО (Тенчо, 22.10.2026). Товарачът избира обект, отмята затворените
-- единици „на камиона" (picking_pallets.shipment_id — колоната е от част А),
-- натиска „🚚 Тръгна" → обектът получава push + имейл, приема по единица
-- (✓ Получен / ⛔ Липсва) и по артикул (получено ≠ брой → коментар).
--
-- notify_error / notified_at — ИЗВЪН спецификацията от 22.10, добавени от
-- сесията: маркерът „известието не тръгна" трябва да оцелее след
-- презареждане, иначе складът не разбира, че обектът не е известен.
-- notify_error ≠ NULL → „🔁 Прати пак"; статусът остава departed.
--
-- FK picking_pallets.shipment_id → picking_shipments ON DELETE SET NULL:
-- изтрит транспорт освобождава единиците си. Колоната вече съществува (част
-- А) и е NULL във всички редове — ограничението не засяга данни.
--
-- CHECK по status — в Supabase; огледалото на Живко не носи value CHECK-ове.
--
-- ПРАВА. RLS включено; anon select / insert / update; delete — само на
-- транспорт в status 'loading' (политиката е с using (status = 'loading')),
-- тоест тръгнал транспорт не се трие през anon. КОМПРОМИС ЗА ПИЛОТА, както
-- picking_batches: „товари само складът", „приема само обектът" и „вижда
-- само picking_users" са проверки в клиента (picking.js), не в базата.
--
-- ЗАВАРЕНИ ДАННИ (правило 9): picking_shipments е нова — 0 реда; в
-- picking_pallets shipment_id е NULL навсякъде (проверено преди миграцията).
--
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане".

create table public.picking_shipments (
  id uuid primary key default gen_random_uuid(),
  warehouse text not null,
  store_name text not null,
  status text not null default 'loading',
  vehicle text,
  driver text,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  departed_by text,
  departed_at timestamptz,
  received_by text,
  received_at timestamptz,
  notify_error text,
  notified_at timestamptz,
  constraint picking_shipments_status_check check (status in ('loading','departed','received','partial'))
);
comment on table public.picking_shipments is
  'Транспорт от логистичен склад към един обект: единиците (picking_pallets.shipment_id), „Тръгна", приемане.';
comment on column public.picking_shipments.status is 'loading | departed | received | partial (приет с отклонения)';
comment on column public.picking_shipments.notify_error is 'Защо push / имейлът при „Тръгна" не е тръгнал; NULL = тръгнало. Извън спецификацията — за „🔁 Прати пак" след презареждане.';
comment on column public.picking_shipments.notified_at is 'Кога известието до обекта е тръгнало успешно.';

alter table public.picking_pallets add constraint picking_pallets_shipment_fk
  foreign key (shipment_id) references public.picking_shipments(id) on delete set null;

create index picking_shipments_store_status_idx on public.picking_shipments (store_name, status);
create index picking_pallets_shipment_idx on public.picking_pallets (shipment_id);

alter table public.picking_shipments enable row level security;

create policy picking_shipments_select on public.picking_shipments for select to anon using (true);
create policy picking_shipments_insert on public.picking_shipments for insert to anon with check (true);
create policy picking_shipments_update on public.picking_shipments for update to anon using (true) with check (true);
create policy picking_shipments_delete on public.picking_shipments for delete to anon using (status = 'loading');

-- ROLLBACK (губи данни — всички транспорти и приемането по единица;
-- shipment_id / loaded_* / received_* в picking_pallets остават, но без връзка):
--   alter table public.picking_pallets drop constraint if exists picking_pallets_shipment_fk;
--   drop index if exists public.picking_pallets_shipment_idx;
--   drop table if exists public.picking_shipments;
