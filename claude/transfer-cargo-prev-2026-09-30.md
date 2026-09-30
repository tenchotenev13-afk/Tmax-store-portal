# Нова колона `transfer_cargo.prev_cargo_id` — за Живко

**Дата:** 30.09.2026 · **Миграция:** `20260930114103_transfer_cargo_prev_cargo_id`
**Rollback:** `20260930114103_transfer_cargo_prev_cargo_id_down.sql`
**Копие на DDL-а в корена:** `transfer-cargo-prev-schema.sql`

## Какво се променя

**Една нова колона** в съществуваща таблица. Нови таблици няма.

| таблица | колона | тип | null |
|---|---|---|---|
| `transfer_cargo` | `prev_cargo_id` | `uuid` | NULL |

Смисъл: товарът е прехвърлен от друг ред `transfer_cargo` (етап 3 на
трансферите) — `prev_cargo_id` сочи предишното звено. `NULL` = товарът
започва в този транспорт.

Плюс FK `prev_cargo_id → transfer_cargo(id) ON DELETE SET NULL` и уникален
частичен индекс `transfer_cargo_prev_uidx` (`where prev_cargo_id is not null`).

## Какво трябва от твоя страна

1. **`mirror-schema.sql`** — `alter table transfer_cargo add column prev_cargo_id uuid;`
2. **`sync-mirror.ps1`** — в `$TableColumns` записът за `transfer_cargo` става:

   ```
   'transfer_cargo'    = 'id,transfer_id,position,kind,qty,recipient_store,transfer_points,note,client_order_ids,transport_order_ids,claim_numbers,goods_doc,loading_item_id,created_at,loaded_at_store,prev_cargo_id'
   ```

## Ако пазиш FK-овете

`prev_cargo_id` сочи към СЪЩАТА таблица. Ако пазиш и този FK, редовете
трябва да влизат по `created_at` (предишното звено винаги е по-старо), или
FK-ът да е отложен. Уникалният индекс не е нужен в огледалото.

## Засегнати съществуващи редове

**Нула попълнени.** Всички 5 съществуващи товара остават с `NULL`.

## Обратимост

Докато колоната е празна — пълна, с `_down.sql`. След първото прехвърляне
rollback-ът къса веригите.
