-- weekly-checklist-responses-schema.sql
-- Огледало на supabase/migrations/20261023120000_weekly_checklist_responses.sql.
--
-- ЗАЩО (Теодор 13.10 и 22.10; решение на Тенчо 23.10.2026). Обект с „не" в
-- седмичния чек лист дава становище — защо и какво ще направи. Пише се в
-- портала (таб „Чек лист", режим на обекта), не по имейл, за да влезе после
-- в автоматичния отчет и в проследяването на поредни седмици с „не"
-- (етап 3Б). Този етап (3А) е само таблицата, екранът на обекта и 📝 за
-- контролинга.
--
-- Един ред на (year, week_number, store_name, metric_key) — checklist.js
-- пише с UPSERT (Prefer: resolution=merge-duplicates, on_conflict по
-- уникалността). updated_at се праща изрично от клиента: default now() важи
-- само при INSERT. Празен текст не се записва (CHECK + проверка в клиента).
-- Числовите колони („Сторна по грешни приеми") засега НЕ искат становище —
-- прагът чака Теодор; таблицата не ги забранява, забранява ги клиентът.
--
-- metric_key → weekly_checklist_metrics(key) с on update cascade: преименуван
-- ключ на колона не къса становищата. Без on delete — колона със становища
-- не се трие, а се изключва (active = false), както при weekly_checklist.
--
-- ПРАВА. RLS включено; политики за anon: select / insert / update, БЕЗ
-- delete — както при supply_store_notes. Компромисът е същият: anon ключът е
-- общ, тоест „обектът пише само за себе си" е проверка в клиента
-- (checklistStoreMode + assignedStores), не в базата.
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9): таблицата е нова — 0 засегнати реда.
--
-- ПОРЕДНОСТ: миграцията ПРЕДИ push на checklist.js — кодът чете таблицата при
-- всяко отваряне на таба (за обекта и за контролинга).
--
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане".
-- Rollback: supabase/migrations/20261023120000_weekly_checklist_responses_down.sql
--   drop table public.weekly_checklist_responses;

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
