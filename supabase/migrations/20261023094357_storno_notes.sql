-- 20261023094357_storno_notes — огледало: storno-notes-schema.sql (схема + RLS).
-- Приложено 23.10.2026 с apply_migration; версията е дадена от базата.

create table public.storno_notes (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  supplier text,
  document_number text,
  body text not null,
  files jsonb not null default '[]'::jsonb,
  status text not null default 'open',
  report_id uuid references public.differences_reports(id) on delete set null,
  created_by text,
  created_at timestamptz not null default now(),
  closed_by text,
  closed_at timestamptz,
  constraint storno_notes_status_chk check (status in ('open','storno','closed'))
);

create table public.storno_note_replies (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.storno_notes(id) on delete cascade,
  body text not null,
  files jsonb not null default '[]'::jsonb,
  side text not null,
  created_by text,
  created_at timestamptz not null default now(),
  constraint storno_note_replies_side_chk check (side in ('store','accounting','co'))
);

create index storno_notes_store_status_idx on public.storno_notes (store_name, status);
create index storno_note_replies_note_idx on public.storno_note_replies (note_id);

comment on table public.storno_notes is
  'Разлики / Сторна по грешен прием: съобщение от оперативния счетоводител към обект (текст + файлове). status open/storno/closed; report_id = бланката от „Направи сторно".';
comment on table public.storno_note_replies is
  'Отговори по storno_notes. side: store / accounting / co.';

alter table public.storno_notes enable row level security;
create policy storno_notes_select on public.storno_notes for select to anon using (true);
create policy storno_notes_insert on public.storno_notes for insert to anon with check (true);
create policy storno_notes_update on public.storno_notes for update to anon using (true) with check (true);

alter table public.storno_note_replies enable row level security;
create policy storno_note_replies_select on public.storno_note_replies for select to anon using (true);
create policy storno_note_replies_insert on public.storno_note_replies for insert to anon with check (true);
create policy storno_note_replies_update on public.storno_note_replies for update to anon using (true) with check (true);
