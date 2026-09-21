# Нова таблица `loading_list_products` — за Живко

**Дата:** 21.09.2026 · **Миграция:** `20260921065736_loading_list_products`
**Rollback:** `20260921065736_loading_list_products_down.sql`
**Копие на DDL-а в корена:** `loading-list-products-schema.sql`

## Какво се променя

**Една нова таблица.** Нито една съществуваща таблица не получава нова колона.

`loading_list_products` — артикулите по ред (палет / руло / насип) от товарен
лист. Всеки ред сочи към `loading_list_items` през `item_id`.

| колона | тип | null |
|---|---|---|
| `id` | `uuid` (PK) | NOT NULL |
| `item_id` | `uuid` | NOT NULL |
| `position` | `integer` | NOT NULL |
| `sap_code` | `text` | NOT NULL |
| `product_name` | `text` | NOT NULL |
| `unit` | `text` | NULL |
| `qty` | `numeric` | NOT NULL |
| `cartons` | `integer` | NULL |
| `received_qty` | `numeric` | NULL |
| `created_at` | `timestamptz` | NOT NULL |

PK е `id`. `item_id` сочи към `loading_list_items(id)`.

## Какво трябва от твоя страна

1. **`mirror-schema.sql`** — `create table loading_list_products` с десетте
   колони отгоре.
2. **`sync-mirror.ps1`** — нов запис в `$TableColumns`:

   ```
   'loading_list_products' = 'id,item_id,position,sap_code,product_name,unit,qty,cartons,received_qty,created_at'
   ```

Другите таблици не се пипат.

## Ако пазиш и FK-а

Ако в огледалото сложиш връзката `item_id → loading_list_items(id)`, тогава
`loading_list_items` трябва да се тегли **преди** `loading_list_products` —
иначе артикул за ред, който още не е копиран, ще бъде отхвърлен. Ако FK-а
не го пазиш, редът на теглене няма значение.

## Защо не е спешно, но не е и по желание

Докато таблицата я няма в огледалото, то просто **не пази артикулите** —
нищо не гърми, другите таблици се копират както досега. Но бекъпът на
товарните листи е без съдържание: знае, че е тръгнал палет 2 от 5, но не и
какво има на него.

## Засегнати съществуващи редове

**Нула.** Таблицата е нова. Към 21.09.2026 `loading_lists` има 2 реда,
`loading_list_items` — 3; никой от тях не се променя.

## Обратимост

Откатът е `drop table`. След първия записан артикул той **трие данни
безвъзвратно** — имената и мерките са копия към момента на товаренето и не се
възстановяват от каталога. Ако се наложи откат, първо ще ти кажа: след drop
PostgREST връща 404 за таблицата и `sync-mirror.ps1` ще гърми, докато тя не
бъде махната от `$TableColumns`.
