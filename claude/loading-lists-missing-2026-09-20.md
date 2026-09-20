# Товарни листи: три нови колони + нова стойност на `status` — за Живко

**Дата:** 20.09.2026 · **Миграция:** `20260920142158_loading_missing`
**Rollback:** `20260920142158_loading_missing_down.sql`
**Копие на DDL-а в корена:** `loading-lists-missing-schema.sql`

## Какво се променя

### 1. Три нови колони в `loading_list_items`

| колона | тип | null | default |
|---|---|---|---|
| `missing` | `boolean` | NOT NULL | `false` |
| `missing_by` | `text` | NULL | — |
| `missing_at` | `timestamptz` | NULL | — |

Огледални на `received` / `received_by` / `received_at`. Обектът заявява с тях,
че редът **не е пристигнал** (различно от „още не е отметнат").

Списъкът с колони на `loading_list_items` става:

```
id, list_id, position, kind, pallet_no, pallet_total, purchase_doc, clears_doc,
store_name, warehouse_comment, store_comment, received, received_by, received_at,
created_at, partial, material_code, material_name, qty, unit, diff_line_id,
missing, missing_by, missing_at
```

### 2. Нова стойност `partial` на `loading_lists.status`

| преди | след |
|---|---|
| `draft, sent, done` | `draft, sent, done, partial` |

`partial` = листът е приключен, но в него има редове с `missing = true`.

**Няма нова таблица, няма нов индекс, няма промяна по RLS.**

## Какво трябва от твоя страна

1. **`mirror-schema.sql`** — трите нови колони по `loading_list_items`
   (`missing boolean not null default false`, `missing_by text`,
   `missing_at timestamptz`).
2. **`sync-mirror.ps1`** — `$TableColumns` за `loading_list_items` се допълва с
   `missing, missing_by, missing_at`. За `loading_lists` няма нова колона.

По правилото ти от 13.09 огледалото не носи value CHECK-ове, тоест новата
стойност `partial` не изисква нищо от твоя страна. Ако все пак имаш CHECK по
`loading_lists.status`, добави `partial` в списъка — иначе първият лист,
приключен с липси, няма да се копира.

## Кое от двете има значение

**Колоните.** Ред без `missing` ще се копира успешно — не гърми, а **лъже**:
огледалото ще твърди „всичко е получено" за лист, в който има липси. Затова
добавянето им не е по желание.

## Защо няма CHECK за взаимното изключване

`received` и `missing` не могат да са едновременно `true`, но **нарочно не се
налага от базата** — CHECK от страната на огледалото би отхвърлял редове,
които в Supabase са минали, а точно този клас тих провал вече сме имали.
Правилото живее в клиента (`loading.js`).

За справки от твоя страна това значи: **`missing and not received`**, а не
само `missing`.

## Внимание с думата „partial"

В `loading_list_items` вече има колона `partial` (от 03.09.2026) — тя значи
„с този товар тръгва само част от стоковия документ". Новата стойност
`loading_lists.status = 'partial'` значи нещо друго: „листът е приключен с
липси". Едната е на ред, другата на лист; не се извеждат една от друга.

## Засегнати съществуващи редове

**Нула.** Проверено непосредствено преди прилагането:

| таблица | редове |
|---|---|
| `loading_lists` | 0 (`group by status` върна празен резултат) |
| `loading_list_items` | 0 |

Разширяването на CHECK-а е надмножество на старото, тоест по конструкция не
може да обезсили заварен ред, дори да имаше такива.

## Обратимост

Откатът е без загуба само докато таблиците са празни. След първия лист със
`status='partial'` стесняването на CHECK-а **гърми** — броят им се проверява
преди отката и какво става с тях е решение на човек. Drop-ът на трите колони
заличава заявените липси безвъзвратно: `received = false` значи само „още не
е отметнат", а не „обектът заяви, че липсва".
