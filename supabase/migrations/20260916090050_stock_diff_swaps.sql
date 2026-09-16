-- Разлики (междускладови): размяна на артикул между два магазина
--
-- from = ИЗПРАЩАЩИЯТ = редът с ИЗЛИШЪК; to = ПОЛУЧАВАЩИЯТ = редът с ЛИПСА.
-- Статуси: linked (складът свързва) -> sent (изпращащият изпраща, van/truck,
-- sap_doc_num) -> received (получаващият приема физически) -> closed (складът
-- приключва и двата реда).
--
-- Partial unique САМО по to_line_id: 4 реда с излишък стоят срещу по две
-- липси (8 от 16 заварени двойки, 16.09.2026), тоест един излишък може да
-- захрани няколко размени. swap_id в stock_differences сочи размяната, в
-- която редът е ЛИПСА.
--
-- RLS: ТОЧНО като stock_differences - изключен, пълни права, неактивна anon
-- политика. Изричен компромис: съседната таблица, към която сочи, е със
-- същия режим; затягането е за двете заедно. Подробности и заварените данни:
-- stock-diff-swaps-schema.sql в корена.
--
-- Файлът е записан СЛЕД прилагането (версията се дава при apply_migration);
-- бележката в корена е написана ПРЕДИ него. SQL-ът отдолу е сверен машинно
-- (md5 + дължина) със statements в supabase_migrations.schema_migrations.
--
-- Нова таблица + нова колона -> огледалото (Живко).
-- Rollback: supabase/migrations/20260916090050_stock_diff_swaps_down.sql

create table public.stock_diff_swaps (
  id uuid primary key default gen_random_uuid(),
  from_line_id uuid not null references public.stock_differences(id),
  to_line_id   uuid not null references public.stock_differences(id),
  from_store   text not null,
  to_store     text not null,
  warehouse    text not null,
  material_code text,
  material_name text,
  qty numeric not null check (qty > 0),
  status text not null default 'linked'
    check (status in ('linked','sent','received','closed')),
  transport_mode text check (transport_mode in ('van','truck')),
  sap_doc_num text,
  note text,
  created_by text,  created_at timestamptz not null default now(),
  sent_by text,     sent_at timestamptz,
  received_by text, received_at timestamptz,
  closed_by text,   closed_at timestamptz,
  constraint stock_diff_swaps_distinct_lines check (from_line_id <> to_line_id)
);

create unique index stock_diff_swaps_to_open
  on public.stock_diff_swaps(to_line_id) where status <> 'closed';

alter table public.stock_differences add column swap_id uuid
  references public.stock_diff_swaps(id);

comment on table public.stock_diff_swaps is 'Размяна на артикул между два магазина през логистичния склад: from = магазинът с излишък (изпраща), to = магазинът с липса (получава).';
comment on column public.stock_diff_swaps.status is 'linked = складът е свързал двата реда; sent = изпращащият магазин е изпратил (van/truck, sap_doc_num); received = получаващият е приел физически; closed = складът е приключил и двата реда.';
comment on column public.stock_diff_swaps.transport_mode is 'Как е изпратено при sent: van = бус, truck = камион.';
comment on column public.stock_differences.swap_id is 'Отворената размяна, в която редът е ЛИПСА (to_line_id). Ред с излишък може да захрани няколко размени - те се търсят през stock_diff_swaps.from_line_id.';

-- RLS: като stock_differences - изключен, пълни права, неактивна anon политика.
alter table public.stock_diff_swaps disable row level security;
grant all on table public.stock_diff_swaps to anon, authenticated, service_role;
create policy anon_all_sd_swaps on public.stock_diff_swaps
  for all to anon using (true) with check (true);
