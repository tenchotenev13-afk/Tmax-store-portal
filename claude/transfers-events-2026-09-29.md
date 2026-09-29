# Нова таблица `transfer_cargo_events` — за Живко

**Дата:** 29.09.2026 · **Миграция:** `20260929195801_transfers_stage2_events`
**Rollback:** `20260929195801_transfers_stage2_events_down.sql`
**Копие на DDL-а в корена:** `transfers-events-schema.sql`

## Какво се променя

**Една нова таблица.** Нито една съществуваща таблица не получава нова колона.
(`transfers.status` вече приема и `partial` / `done` — това е стойност в
съществуваща колона, не промяна на схемата.)

### `transfer_cargo_events` — отметките по товар от трансферите

| колона | тип | null |
|---|---|---|
| `id` | `uuid` (PK) | NOT NULL |
| `cargo_id` | `uuid` | NOT NULL |
| `transfer_id` | `uuid` | NOT NULL |
| `store_name` | `text` | NOT NULL |
| `event` | `text` | NOT NULL |
| `problem_kind` | `text` | NULL |
| `comment` | `text` | NULL |
| `photos` | `jsonb` | NOT NULL |
| `waybill_no` | `text` | NULL |
| `resolves_id` | `uuid` | NULL |
| `created_by` | `text` | NULL |
| `created_at` | `timestamptz` | NOT NULL |

## Какво трябва от твоя страна

1. **`mirror-schema.sql`** — `create table transfer_cargo_events` с колоните отгоре.
2. **`sync-mirror.ps1`** — нов запис в `$TableColumns`:

   ```
   'transfer_cargo_events' = 'id,cargo_id,transfer_id,store_name,event,problem_kind,comment,photos,waybill_no,resolves_id,created_by,created_at'
   ```

## Ако пазиш FK-овете

- `cargo_id` → `transfer_cargo(id)`, `transfer_id` → `transfers(id)` —
  тогава `transfers` и `transfer_cargo` се теглят **преди** тази таблица.
- `resolves_id` → `transfer_cargo_events(id)` — сочи към СЪЩАТА таблица
  (ред „Решен" към реда „Проблем", който затваря). Ако пазиш и този FK,
  редовете трябва да влизат по `created_at`, или FK-ът да е отложен.

## Засегнати съществуващи редове

**Нула.** Таблицата е нова и е празна към 29.09.2026.

## Обратимост

Докато таблицата е празна — пълна, с `_down.sql`. След първата отметка
rollback-ът трие историята на товарите и иска отделно решение.
