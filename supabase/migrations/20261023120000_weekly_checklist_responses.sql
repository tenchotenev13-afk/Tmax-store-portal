-- Чек лист, етап 3А: становище на обекта (23.10.2026).
-- Обяснението — в weekly-checklist-responses-schema.sql (корен). Rollback: *_down.sql.

create table public.weekly_checklist_responses (
  id          uuid primary key default gen_random_uuid(),
  year        int  not null,
  week_number int  not null,
  store_name  text not null,
  metric_key  text not null references public.weekly_checklist_metrics(key) on update cascade,
  text        text not null,
  created_by  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz not null default now(),
  constraint weekly_checklist_responses_week_chk check (week_number between 1 and 53),
  constraint weekly_checklist_responses_text_chk check (length(btrim(text)) > 0),
  constraint weekly_checklist_responses_uq unique (year, week_number, store_name, metric_key)
);

create index weekly_checklist_responses_week_idx
  on public.weekly_checklist_responses (year, week_number);

comment on table public.weekly_checklist_responses is
  'Становище на обекта по клетка с „не" в седмичния чек лист. Един ред на седмица × обект × показател; пише се от таба „Чек лист" в режим на обекта.';
comment on column public.weekly_checklist_responses.year is
  'ISO година на отчетната седмица (както weekly_checklist.year).';
comment on column public.weekly_checklist_responses.week_number is
  'ISO номер на отчетната седмица, 1–53.';
comment on column public.weekly_checklist_responses.store_name is
  'Обектът — текст, не външен ключ (същата конвенция като weekly_checklist).';
comment on column public.weekly_checklist_responses.metric_key is
  'Колоната от чек листа (weekly_checklist_metrics.key), по която е становището.';
comment on column public.weekly_checklist_responses.text is
  'Текстът на становището. Празен не се записва.';
comment on column public.weekly_checklist_responses.created_by is
  'Кой е записал последно (display_name или имейл от портала).';
comment on column public.weekly_checklist_responses.updated_at is
  'Последен запис. Подава се от клиента при всеки upsert — default now() важи само при INSERT.';

alter table public.weekly_checklist_responses enable row level security;
create policy weekly_checklist_responses_select on public.weekly_checklist_responses for select to anon using (true);
create policy weekly_checklist_responses_insert on public.weekly_checklist_responses for insert to anon with check (true);
create policy weekly_checklist_responses_update on public.weekly_checklist_responses for update to anon using (true) with check (true);
