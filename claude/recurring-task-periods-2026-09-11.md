# Нова таблица `recurring_task_periods` — за Живко

**Дата:** 11.09.2026 · **Миграция:** `20260911204550_recurring_task_periods`
**Rollback:** `20260911204550_recurring_task_periods_down.sql`
**Копие на DDL-а в корена:** `recurring-task-periods-schema.sql`
**Приложена в Supabase:** 11.09.2026 (версия `20260911204550`), с backfill

## Какво е

Постоянните задачи от Бюлетина (`recurring_tasks`) досега бяха една обща
листа с `active` да/не и всеки бюлетин я четеше наново: спряна задача
изчезваше от старите седмици, нова се появяваше в тях. Сега всяка задача има
**периоди** — седмиците, в които важи:

```
важи за седмица W  ⇔  има период с  from_monday <= W.понеделник
                                    и (to_monday IS NULL или to_monday >= W.понеделник)
```

Двете граници са **понеделници**, включително. `to_monday` NULL = отворен
период (важи напред).

- **„⏸ Спри"** (само от бюлетина на текущата седмица W) затваря отворения
  период с `to_monday = W − 7 дни`. Ако периодът е започнал в самата W —
  редът се **трие**.
- **„▶ Активирай"** добавя **нов** ред `from_monday = W`, `to_monday` NULL.
  Старият затворен ред остава.
- **Нова задача** → ред `from_monday = W`.
- Редакция на текста на задачата важи навсякъде (периодите не пазят текст).

`recurring_tasks.active` **остава** и означава „има отворен период". Кодът го
поддържа при всяка промяна.

Очакван обем: по един-два реда на задача; 14 реда след backfill-а.

## Таблицата

| колона | тип | NULL | по подразбиране |
|---|---|---|---|
| `id` | `uuid` | не | `gen_random_uuid()` — PK |
| `recurring_task_id` | `uuid` | не | — FK към `recurring_tasks(id)` **ON DELETE CASCADE** |
| `from_monday` | `date` | не | — |
| `to_monday` | `date` | да | — (NULL = отворен) |
| `created_by` | `text` | да | — |
| `created_at` | `timestamptz` | да | `now()` |

## Ограничения и индекси

```sql
constraint recurring_task_periods_range_chk    check (to_monday is null or to_monday >= from_monday)
constraint recurring_task_periods_from_mon_chk check (extract(isodow from from_monday) = 1)
constraint recurring_task_periods_to_mon_chk   check (to_monday is null or extract(isodow from to_monday) = 1)

create index rtp_task_from_idx on public.recurring_task_periods (recurring_task_id, from_monday);
create unique index rtp_open_uq on public.recurring_task_periods (recurring_task_id) where to_monday is null;
```

**За огледалото:** `rtp_open_uq` е **частичен** (с `WHERE`). Обикновен
`UNIQUE (recurring_task_id)` би отхвърлил легитимни редове — задача с
празнина има два реда (затворен + отворен). Ако огледалото не пази уникални
индекси изобщо, това не е проблем.

## Backfill (в самата миграция)

Всяка от 14-те задачи получи един ред:
- `from_monday` = понеделникът на седмицата на `created_at` (Europe/Sofia);
- активните (12) — `to_monday` NULL;
- двете спрени („Ревизии 953" `e83f53fa…`, „Промоция 1+1" `bc34a4c4…`) —
  `to_monday = 2026-08-31` (спрени от потребителя в С37 → важат до С36);
- `created_by = 'backfill 11.09.2026'`.

## RLS

Включено, четири `anon` политики (`Allow select/insert/update/delete
recurring_task_periods`), огледални на `recurring_tasks`. `anon` има
SELECT/INSERT/UPDATE/DELETE в `role_table_grants` (проверено 11.09.2026) —
огледалото, което тегли с anon ключа, може да чете.

## Какво трябва от твоя страна

1. **`mirror-schema.sql`** — `CREATE TABLE recurring_task_periods` с колоните
   горе. FK към `recurring_tasks` по избор — същата уговорка като при
   `recurring_task_skips` (ако редът на синхронизация може да донесе периода
   преди задачата, без FK).
2. **`$TableColumns` в `sync-mirror.ps1`** — нов ключ:

   ```
   'recurring_task_periods' = 'id,recurring_task_id,from_monday,to_monday,created_by,created_at'
   ```

3. **Промени и триене.** Редовете СЕ ПРОМЕНЯТ (`to_monday` се попълва при
   „Спри") и СЕ ТРИЯТ (задача, спряна в първата си седмица; ✕ на задачата
   трие всичките ѝ периоди по cascade). Ако синхронизацията е само
   insert/upsert без триене, огледалото ще пази отворени периоди на спрени
   задачи — и ще показва задачите като валидни там, където не са.
4. **`recurring_tasks.active`** продължава да съществува и да се синхронизира
   както досега; за конкретна минала седмица обаче вярното е в периодите.

**Задачата не е приключена, преди да дойде потвърждение, че е приложено.**
