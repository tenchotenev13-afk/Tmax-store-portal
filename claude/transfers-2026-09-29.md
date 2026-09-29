# Три нови таблици за междускладови трансфери — за Живко

**Дата:** 29.09.2026 · **Миграция:** `20260929080339_transfers_stage1`
**Rollback:** `20260929080339_transfers_stage1_down.sql`
**Копие на DDL-а в корена:** `transfers-schema.sql`

## Какво се променя

**Три нови таблици.** Нито една съществуваща таблица не получава нова колона.

### `transfers` — транспорт (бус или куриер)

| колона | тип | null |
|---|---|---|
| `id` | `uuid` (PK) | NOT NULL |
| `transfer_num` | `text` | NOT NULL |
| `from_store` | `text` | NOT NULL |
| `mode` | `text` | NOT NULL |
| `depart_date` | `date` | NULL |
| `depart_time` | `text` | NULL |
| `driver` | `text` | NULL |
| `stops` | `text[]` | NOT NULL |
| `end_store` | `text` | NOT NULL |
| `courier_company` | `text` | NULL |
| `waybill_no` | `text` | NULL |
| `status` | `text` | NOT NULL |
| `note` | `text` | NULL |
| `created_by` | `text` | NULL |
| `created_at` | `timestamptz` | NOT NULL |

### `transfer_cargo` — товарите на транспорта

| колона | тип | null |
|---|---|---|
| `id` | `uuid` (PK) | NOT NULL |
| `transfer_id` | `uuid` | NOT NULL |
| `position` | `integer` | NOT NULL |
| `kind` | `text` | NOT NULL |
| `qty` | `integer` | NOT NULL |
| `recipient_store` | `text` | NOT NULL |
| `transfer_points` | `text[]` | NOT NULL |
| `note` | `text` | NULL |
| `client_order_ids` | `uuid[]` | NOT NULL |
| `transport_order_ids` | `uuid[]` | NOT NULL |
| `claim_numbers` | `text[]` | NOT NULL |
| `goods_doc` | `text` | NULL |
| `loading_item_id` | `uuid` | NULL |
| `created_at` | `timestamptz` | NOT NULL |

### `transfer_counters` — брояч на номерата по обект

| колона | тип | null |
|---|---|---|
| `store_name` | `text` (PK) | NOT NULL |
| `last_num` | `integer` | NOT NULL |

## Какво трябва от твоя страна

1. **`mirror-schema.sql`** — трите таблици с колоните отгоре.
2. **`sync-mirror.ps1`** — три нови записа в `$TableColumns`:

   ```
   'transfers'         = 'id,transfer_num,from_store,mode,depart_date,depart_time,driver,stops,end_store,courier_company,waybill_no,status,note,created_by,created_at'
   'transfer_cargo'    = 'id,transfer_id,position,kind,qty,recipient_store,transfer_points,note,client_order_ids,transport_order_ids,claim_numbers,goods_doc,loading_item_id,created_at'
   'transfer_counters' = 'store_name,last_num'
   ```

## Ново за огледалото: масиви

Досега масивите бяха само `text[]`. Тук има и **`uuid[]`**
(`client_order_ids`, `transport_order_ids`). PostgREST ги връща като JSON
масив (`["…","…"]`). В огледалото трябва да влязат като Postgres масив, а не
като JSON низ.

## Ако пазиш FK-овете

- `transfer_cargo.transfer_id` сочи към `transfers(id)`.
- `transfer_cargo.loading_item_id` сочи към `loading_list_items(id)`.

Ако ги пазиш, `transfers` и `loading_list_items` се теглят **преди**
`transfer_cargo`.

## Броячът

`transfer_counters` е четим през anon точно за бекъпа. Номерът
„Добрич-0007“ се раздава от тригер по `from_store`. Ако базата някога се
възстанови без брояча, първият нов трансфер ще удари уникалния индекс на
`transfer_num`. Тогава `last_num` за всеки обект се възстановява от
най-големия суфикс на `transfer_num` за този `from_store`.

## Засегнати съществуващи редове

**Нула.** Таблиците са нови. Към 29.09.2026 и трите са празни.

## Обратимост

Докато таблиците са празни — пълна, с `_down.sql`. След първия въведен
трансфер rollback-ът трие данни и иска отделно решение.
