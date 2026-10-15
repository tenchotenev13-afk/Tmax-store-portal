-- 20261015090000_revision_schedule
-- Огледало: revision-schedule-schema.sql (обяснението е там).
-- Rollback: 20261015090000_revision_schedule_down.sql

create table public.revision_schedule (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null,
  ends_on date not null,
  kind text not null default 'groups',
  note text,
  groups jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz,
  constraint revision_schedule_uq unique (starts_on)
);

comment on table public.revision_schedule is
  'График на ревизиите: една седмица на ред. Поддържа го Контролинг (admin/accounting), обектите четат.';
comment on column public.revision_schedule.kind is
  'groups = ревизия на групите в groups | none = старт брошура, няма ревизии | movements = движения';
comment on column public.revision_schedule.groups is
  'jsonb масив [{"code":"30121010","name":"Навеси"}, …]; празен при none / movements.';
comment on column public.revision_schedule.note is
  'Свободна бележка: „старт брошура 04.09-няма ревизии“, „07.09 почивен ден заради 06.09“.';

alter table public.revision_schedule enable row level security;
create policy revision_schedule_select on public.revision_schedule for select to anon using (true);
create policy revision_schedule_insert on public.revision_schedule for insert to anon with check (true);
create policy revision_schedule_update on public.revision_schedule for update to anon using (true) with check (true);
create policy revision_schedule_delete on public.revision_schedule for delete to anon using (true);
