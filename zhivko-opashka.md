# Опашка за Живко (огледалото)

Тук се записва всяка промяна в схемата, която огледалото трябва да повтори:
нова колона, нова таблица или нова стойност на статус. Чете го Тенчо и праща
на Живко ЕДИН имейл на ден със съдържанието на „Чака изпращане", после
премества редовете под „Изпратено <дата>".

Формат на ред: `дата · таблица.колона — тип, NULL/NOT NULL, default` · или
`дата · таблица.колона — нова стойност на статус 'x'` · или
`дата · нова таблица X — колона тип, …`. Без CHECK, индекси, функции,
тригери, кронове и RLS — в огледалото ги няма. Новите стойности на статус
се записват винаги; ако огледалото не проверява стойности, Живко само ги
отбелязва.

## Чака изпращане

(в базата от миграцията 20261026210000_weekly_checklist_freezes, версия 20261026210148, приложена 26.10.2026)
- 26.10 · нова таблица weekly_checklist_freezes — year int NOT NULL, week_number int NOT NULL, frozen_at timestamptz NOT NULL default now(), frozen_by text NULL; PK (year, week_number)

(в базата от миграцията 20261026120000_weekly_checklist_portal_mode, версия 20261026125017, приложена 26.10.2026)
- 26.10 · weekly_checklist_metrics.portal_mode — text, NULL, без default (стойности 'any' / 'count' / 'file_none')

(в базата от миграцията 20261024090000_storno_notes_notify, версия 20261024125100, приложена 24.10.2026)
- 24.10 · storno_notes.notify_error — text, NULL, без default
- 24.10 · storno_notes.notified_at — timestamptz, NULL, без default
- 24.10 · storno_note_replies.notify_error — text, NULL, без default
- 24.10 · storno_note_replies.notified_at — timestamptz, NULL, без default

## Потвърдено 24.10.2026

- 21.10 · stock_differences.type — нова стойност 'storno' (text, без промяна в схемата)
- 22.10 · нова таблица picking_pallets (миграция 20261022133218_picking_pallets_schema) — id uuid PK default gen_random_uuid(), warehouse text NOT NULL, store_name text NOT NULL, kind text NOT NULL default 'pallet' (стойности 'pallet' / 'bulk' / 'carton'), no int NOT NULL, created_on date NOT NULL default current_date, status text NOT NULL default 'open' (стойности 'open' / 'closed'), note text NULL, created_by text NULL, created_at timestamptz NOT NULL default now(), closed_by text NULL, closed_at timestamptz NULL, shipment_id uuid NULL (връзка към picking_shipments идва с част Б), loaded_by text NULL, loaded_at timestamptz NULL, received_status text NULL (стойности 'received' / 'missing'), received_by text NULL, received_at timestamptz NULL, receive_note text NULL; уникалност (warehouse, store_name, kind, no, created_on)
- 22.10 · нова таблица picking_pallet_items (същата миграция) — id uuid PK default gen_random_uuid(), pallet_id uuid NOT NULL → picking_pallets (on delete cascade), line_id uuid NOT NULL → picking_lines (on delete cascade), qty numeric NOT NULL, qty_received numeric NULL, receive_comment text NULL, created_at timestamptz NOT NULL default now(); уникалност (pallet_id, line_id)

(в базата от миграцията 20261022133937_minusi_note_required, приложена 22.10.2026)
- 22.10 · minus_reasons.requires_note — boolean, NOT NULL, default false (true за „клиентска поръчка (номер/дата)")

- 23.10 · нова таблица weekly_checklist_responses (миграция 20261023120000_weekly_checklist_responses, в базата версия 20261023093627, приложена 23.10.2026) — id uuid PK default gen_random_uuid(), year int NOT NULL, week_number int NOT NULL, store_name text NOT NULL, metric_key text NOT NULL (→ weekly_checklist_metrics.key), text text NOT NULL, created_by text NULL, created_at timestamptz NULL default now(), updated_at timestamptz NOT NULL default now(); уникалност (year, week_number, store_name, metric_key) — за UPSERT
- 23.10 · нова таблица picking_shipments (миграция 20261023085447_picking_shipments_schema) — id uuid PK default gen_random_uuid(), warehouse text NOT NULL, store_name text NOT NULL, status text NOT NULL default 'loading' (стойности 'loading' / 'departed' / 'received' / 'partial'), vehicle text NULL, driver text NULL, note text NULL, created_by text NULL, created_at timestamptz NOT NULL default now(), departed_by text NULL, departed_at timestamptz NULL, received_by text NULL, received_at timestamptz NULL, notify_error text NULL, notified_at timestamptz NULL
- 23.10 · picking_pallets.shipment_id — колоната е пратена с реда от 22.10 (под „Потвърдено 24.10.2026“, заедно с останалите колони за част Б на picking_pallets и picking_pallet_items); от тази миграция сочи → picking_shipments (on delete set null), нова колона няма

(в базата от миграцията 20261023094357_storno_notes, приложена 23.10.2026)
- 23.10 · нова таблица storno_notes — id uuid PK default gen_random_uuid(), store_name text NOT NULL, supplier text NULL, document_number text NULL, body text NOT NULL, files jsonb NOT NULL default '[]', status text NOT NULL default 'open' (стойности 'open' / 'storno' / 'closed'), report_id uuid NULL → differences_reports(id) (on delete set null), created_by text NULL, created_at timestamptz NOT NULL default now(), closed_by text NULL, closed_at timestamptz NULL
- 23.10 · нова таблица storno_note_replies — id uuid PK default gen_random_uuid(), note_id uuid NOT NULL → storno_notes(id) (on delete cascade), body text NOT NULL, files jsonb NOT NULL default '[]', side text NOT NULL (стойности 'store' / 'accounting' / 'co'), created_by text NULL, created_at timestamptz NOT NULL default now()
(потвърдено от Живко на 24.10: в огледалото, първото пълно изпълнение без грешки; таблиците стават 88; броят на редовете в 8-те засегнати места съвпада с базата — сверено от чата на 24.10; уникалностите не са копирани като ограничения, огледалото синхронизира по id и има обикновени индекси по същите колони)

## Потвърдено 23.10.2026

(в базата от миграцията 20261022130434_minusi_repeat, приложена 22.10.2026)
- 22.10 · minus_movements.action — text, NULL, без default
- 22.10 · app_settings — нов ключ minus_repeat_days (брой дни за повторение на минус; начална стойност '10')
(потвърдено от Живко на 23.10: в огледалото, първото пълно изпълнение без грешки; таблиците остават 82; синхронизирането е сменено от 30 на 60 минути (огледалото е най-много час назад))

## Потвърдено 22.10.2026

- 21.10 · нова таблица picking_batches (миграция 20261021090405_picking_schema) — id uuid PK default gen_random_uuid(), warehouse text NOT NULL, source text NOT NULL (стойности 'planned' / 'unplanned'), file_name text NULL, rows_total int NULL, rows_imported int NULL, rows_skipped int NULL, uploaded_by text NULL, uploaded_at timestamptz NOT NULL default now()
- 21.10 · нова таблица picking_lines (същата миграция) — id uuid PK default gen_random_uuid(), batch_id uuid NOT NULL → picking_batches (on delete cascade), warehouse text NOT NULL, store_name text NOT NULL, sap_code text NOT NULL, product_name text NULL, unit text NULL, qty_requested numeric NOT NULL, supply_group text NULL, sap_order text NULL, sap_item text NULL, line_no int NULL, status text NOT NULL default 'open' (стойности 'open' / 'picked' / 'skipped'), qty_picked numeric NULL, comment text NULL, done_by text NULL, done_at timestamptz NULL, created_at timestamptz NOT NULL default now(); уникалност (warehouse, sap_order, sap_item)
- 21.10 · app_settings — нов ключ picking_users (списък имейли, разделени със запетая)
(потвърдено от Живко с писмо на 22.10: 82 таблици, 0 грешки; уникалността по warehouse, sap_order, sap_item — обикновен индекс в огледалото)

## Потвърдено 21.10.2026

(в базата от миграциите 20261021050541_minusi_schema и 20261021050606_minusi_seed, приложени 21.10.2026)
- 20.10 · нова таблица minus_plants — plant text PK, store_name text NOT NULL, role text NOT NULL (стойности 'доставка' / 'продажби' / 'наличност')
- 20.10 · нова таблица minus_uploads — id uuid PK default gen_random_uuid(), uploaded_at timestamptz NOT NULL default now(), uploaded_by text NULL, file_name text NULL, rows_total int NULL, rows_new int NULL, date_from date NULL, date_to date NULL
- 20.10 · нова таблица minus_reasons — id serial PK, label text NOT NULL, excluded_from_revision boolean NOT NULL default false, active boolean NOT NULL default true, sort int NULL
- 20.10 · нова таблица minus_uom_thresholds — uom text PK, min_qty numeric NOT NULL
- 20.10 · нова таблица minus_movements — id uuid PK default gen_random_uuid(), upload_id uuid NULL → minus_uploads, plant text NOT NULL, store_name text NOT NULL, material text NOT NULL, material_desc text NULL, mvt_type text NOT NULL (стойности '955' / '956'), qty numeric NOT NULL, uom text NULL, mat_doc text NOT NULL, doc_item text NOT NULL, doc_year int NOT NULL, posting_date date NOT NULL, header_text text NULL, real_code text NULL, reason_id int NULL → minus_reasons, employee_name text NULL, note text NULL, filled_by text NULL, filled_at timestamptz NULL, created_at timestamptz NOT NULL default now(); уникалност (mat_doc, doc_item, doc_year) (в огледалото — обикновен индекс вместо UNIQUE; дубликатите се спират само в Supabase, ограничение minus_movements_doc_uq)
- 20.10 · app_settings — нов ключ minus_stores (списък имена на обекти, разделени със запетая; начална стойност 'Гоце Делчев')
(потвърдено от Живко с писмо на 21.10: 80 таблици, 0 грешки; minus_plants, minus_reasons, minus_uom_thresholds се презареждат цялостно на всеки цикъл)

## Потвърдено 19.10.2026

- 18.10 · transfers.departed_at — timestamptz, NULL, без default (кога е тръгнал бусът / камионът)
  (в базата от миграцията 20261018151927)
- 18.10 · transfers.departed_by — text, NULL, без default (кой е отбелязал „Тръгна")
  (в базата от миграцията 20261018151927)
- 18.10 · transfers.status — нова стойност на статус 'sent' („Изпратен"; досега 'planned' / 'partial' / 'done')
- 15.10 · transfer_cargo_events.unit — integer, NULL, без default (номер на единицата 1..qty; null = целият товар) (индекс transfer_cargo_events_unit_once — само в Supabase, не е в огледалото)
  (в базата от миграцията 20261015132314)

## Потвърдено 16.10.2026

- 15.10 · нова таблица revision_schedule — id uuid PK default gen_random_uuid(), starts_on date NOT NULL, ends_on date NOT NULL, kind text NOT NULL default 'groups' (стойности 'groups' / 'none' / 'movements'), note text NULL, groups jsonb NOT NULL default '[]', created_by text NULL, created_at timestamptz NOT NULL default now(), updated_by text NULL, updated_at timestamptz NULL; уникалност (starts_on)
  (в базата от миграцията 20261015075210; файл 20261015090000_revision_schedule)
- 15.10 · revaluation_items.co_qty — numeric(12,3), NULL, без default (прехвърлено количество, ЦО)
- 15.10 · revaluation_submissions.processed_at — timestamptz, NULL, без default
- 15.10 · revaluation_submissions.processed_by — text, NULL, без default
- 15.10 · revaluation_submissions.status — нова стойност на статус 'processed' (обработена от ЦО; досега 'draft' / 'submitted')
  (в базата от миграцията 20261015102839; файл 20261015140000_revaluation_co)
- 15.10 · нова таблица revaluation_codes — new_sap_code text PK, sap_code text NOT NULL, product_name text NULL, unit text NULL, std_price numeric(10,2) NULL, campaign_id uuid NULL → revaluation_campaigns (при изтриване на кампанията → NULL), created_in_sap_at timestamptz NOT NULL default now(), created_by text NULL
  (в базата от миграцията 20261015132455; файл 20261015180000_revaluation_codes)
  (потвърдено от Живко с писмо на 16.10 в 10:33: 75 таблици, 0 грешки)

## Потвърдено 15.10.2026

- 14.10 · transfers.plate_no — text, NULL, без default (регистрационен номер на камиона)
  (в базата от миграцията 20261014113103)
- 14.10 · transfers.mode — нова стойност на статус 'truck' (камион; досега 'bus' / 'courier')
  (потвърдено от Живко на 15.10: в огледалото)
- 11.10 · нова таблица revaluation_campaigns — id uuid PK, title text NOT NULL, kind text NOT NULL default 'mandatory' (стойности 'mandatory' / 'optional'), starts_on date NOT NULL, ends_on date NOT NULL, default_pct numeric(5,2) NULL, note text NULL, status text NOT NULL default 'open' (стойности 'open' / 'closed'), created_by text NULL, created_at timestamptz NOT NULL default now(), closed_at timestamptz NULL, closed_by text NULL
  (в базата от миграцията 20261011204320)
- 11.10 · нова таблица revaluation_submissions — id uuid PK, campaign_id uuid NOT NULL → revaluation_campaigns, store_name text NOT NULL, default_pct numeric(5,2) NULL, no_items boolean NOT NULL default false, store_note text NULL, status text NOT NULL default 'draft' (стойности 'draft' / 'submitted'), submitted_at timestamptz NULL, submitted_by text NULL, reopened_at timestamptz NULL, reopened_by text NULL, created_at timestamptz NOT NULL default now(); уникалност (campaign_id, store_name) (в огледалото — обикновен индекс вместо UNIQUE)
  (в базата от миграцията 20261011204320)
- 11.10 · нова таблица revaluation_items — id uuid PK, submission_id uuid NOT NULL → revaluation_submissions, campaign_id uuid NOT NULL → revaluation_campaigns, store_name text NOT NULL, sort_order integer NOT NULL default 0, sap_code text NOT NULL, product_name text NULL, unit text NULL, qty numeric(12,3) NOT NULL default 0, store_comment text NULL, std_price numeric(10,2) NULL, discount_pct numeric(5,2) NULL, proposed_price numeric(10,2) NULL, new_sap_code text NULL, sale_price numeric(10,2) NULL, co_comment text NULL, co_by text NULL, co_at timestamptz NULL, created_by text NULL, created_at timestamptz NOT NULL default now(), updated_at timestamptz NULL
  (в базата от миграцията 20261011204320)
- 13.10 · нова таблица supply_no_need — id uuid PK, template_id uuid NOT NULL → supply_templates, store_name text NOT NULL, week_start date NOT NULL, created_by text NULL, created_at timestamptz NOT NULL default now(); уникалност (template_id, store_name, week_start) (в огледалото — обикновен индекс вместо UNIQUE)
  (в базата от миграцията 20261013062446)

## Потвърдено 12.10.2026

- 11.10 · supply_entries.note — text, NULL, без default
  (в базата от миграцията 20261011144917)
- 11.10 · recurring_tasks.store_hints — jsonb, NULL, без default
  (жокер по обект под постоянната задача; recurring-task-store-hints-schema.sql)
- 11.10 · нова таблица supply_store_notes — id uuid PK, template_id uuid, store_name text, week_start date, co_note text NULL, co_note_by text NULL, co_note_at timestamptz; уникалност (template_id, store_name, week_start) (в огледалото — обикновен индекс вместо UNIQUE)
  (в базата от миграцията 20261011185952)
  (потвърдено от Живко на 12.10 в 13:48: огледалото е наваксало)

## Потвърдено 11.10.2026

- 06.10 · report_recipients.co_overdue — boolean, NOT NULL, default false
- 06.10 · client_orders.delivery_reason — text, NULL, без default
- 30.09 · stock_differences.warehouse_response — нова стойност на статус 'sent_sap'
- 30.09 · stock_differences.store_response — нова стойност на статус 'sap_accepted'
  (миграцията 20260930120000_stock_differences_sent_sap)
  (потвърдено от Живко: огледалото е наваксало)

## Изпратено 04.10.2026

- 02.10 · stock_returns.confirmed_by — text, NULL
- 02.10 · stock_returns.confirmed_at — timestamptz, NULL
- 01.10 · task_completions.status — нова стойност на статус 'not_applicable'

## Изпратено 01.10.2026

- 01.10 · bulletin_tasks.due_window — boolean, NOT NULL, default false
  (потвърдено от Живко: 68 таблици, 0 грешки)
