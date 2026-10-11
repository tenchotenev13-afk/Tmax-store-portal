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

- 11.10 · нова таблица supply_store_notes — id uuid PK, template_id uuid, store_name text, week_start date, co_note text NULL, co_note_by text NULL, co_note_at timestamptz; уникалност (template_id, store_name, week_start)

## Изпратено 11.10.2026

- 11.10 · supply_entries.note — text, NULL, без default
  (в базата от миграцията 20261011144917)
- 11.10 · recurring_tasks.store_hints — jsonb, NULL, без default
  (жокер по обект под постоянната задача; recurring-task-store-hints-schema.sql)

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
