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
