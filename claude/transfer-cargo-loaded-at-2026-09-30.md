# Нова колона `transfer_cargo.loaded_at_store` — за Живко

**Дата:** 29.09.2026 · **Миграция:** `20260929211854_transfer_cargo_loaded_at_store`
**Rollback:** `20260929211854_transfer_cargo_loaded_at_store_down.sql`
**Копие на DDL-а в корена:** `transfer-cargo-loaded-at-schema.sql`

## Какво се променя

**Една нова колона** в съществуваща таблица. Нови таблици няма.

| таблица | колона | тип | null |
|---|---|---|---|
| `transfer_cargo` | `loaded_at_store` | `text` | NULL |

Смисъл: обектът-спирка, в който товарът е дотоварен на вече тръгнал бус.
`NULL` = товарът е на създателя на транспорта (`transfers.from_store`).
Плюс частичен индекс `transfer_cargo_loaded_at_idx` — за огледалото не е нужен.

## Какво трябва от твоя страна

1. **`mirror-schema.sql`** — `alter table transfer_cargo add column loaded_at_store text;`
2. **`sync-mirror.ps1`** — в `$TableColumns` записът за `transfer_cargo` става:

   ```
   'transfer_cargo'    = 'id,transfer_id,position,kind,qty,recipient_store,transfer_points,note,client_order_ids,transport_order_ids,claim_numbers,goods_doc,loading_item_id,created_at,loaded_at_store'
   ```

## Засегнати съществуващи редове

**Нула попълнени.** Всички 4 съществуващи товара остават с `NULL` —
товари на създателя, както досега.

## Обратимост

Докато колоната е празна — пълна, с `_down.sql`. След първото дотоварване
rollback-ът губи кой е качил товара.
