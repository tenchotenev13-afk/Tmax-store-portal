# Нова таблица `recurring_task_skips` — за Живко

**Дата:** 11.09.2026 · **Миграция:** `20260911080537_recurring_task_skips`
**Rollback:** `20260911080537_recurring_task_skips_down.sql`
**Копие на DDL-а в корена:** `recurring-task-skips-schema.sql`
**Приложена в Supabase:** 11.09.2026 (версия `20260911080537`)

## Какво е

Постоянна задача от Бюлетина (`recurring_tasks`) важи всяка седмица. Ред в
новата таблица казва „тази седмица задачата не се изисква" — за всички
обекти (`store_name` NULL) или само за посочения обект. Самата задача остава
активна; следващата седмица важи отново.

Пишат се от портала (админ/счетоводство, бутон „Не за тази седмица" в
Бюлетина) и се четат от Бюлетина, таб „Днес", банера при вход, чек листа, а
по-късно и от отчетните и нотификационните едж функции.

Очакван обем: няколко реда на седмица.

## Таблицата

| колона | тип | NULL | по подразбиране |
|---|---|---|---|
| `id` | `uuid` | не | `gen_random_uuid()` — PK |
| `recurring_task_id` | `uuid` | не | — FK към `recurring_tasks(id)` **ON DELETE CASCADE** |
| `year` | `integer` | не | — |
| `week_number` | `integer` | не | — |
| `store_name` | `text` | да | — (NULL = за всички обекти) |
| `reason` | `text` | да | — |
| `created_by` | `text` | да | — |
| `created_at` | `timestamptz` | да | `now()` |

`year` + `week_number` са **ISO седмица**, а `year` е годината на
четвъртъка от нея — същата двойка като в `bulletins`. Около Нова година
тя НЕ съвпада с календарната година (01.01.2027 е седмица 53 на 2026).

## Ограничения

```sql
constraint recurring_task_skips_week_chk  check (week_number between 1 and 53)
constraint recurring_task_skips_year_chk  check (year between 2024 and 2100)
constraint recurring_task_skips_store_chk check (store_name is null or btrim(store_name) <> '')
```

## Двата индекса — ЧАСТИЧНИ

```sql
create unique index rts_global_uq
  on public.recurring_task_skips (recurring_task_id, year, week_number)
  where store_name is null;

create unique index rts_store_uq
  on public.recurring_task_skips (recurring_task_id, year, week_number, store_name)
  where store_name is not null;
```

Защо два, а не един `UNIQUE`: обикновеният уникален индекс третира NULL-ите
като различни и би допуснал два глобални реда за една и съща седмица.

**За огледалото:** ако `mirror-schema.sql` създава индексите, те трябва да
останат **частични** (с `WHERE`). Обикновен `UNIQUE (recurring_task_id, year,
week_number)` в огледалото би отхвърлил легитимен ред — глобален и магазинен
ред за една и съща задача/седмица съществуват едновременно. Ако огледалото
не пази уникални индекси изобщо, това не е проблем.

## RLS

Включено, четири `anon` политики (`Allow select/insert/update/delete
recurring_task_skips`), огледални на `recurring_tasks`. Огледалото тегли с
anon ключа — SELECT е разрешен. Проверено на 11.09.2026: `GET
/rest/v1/recurring_task_skips?year=eq.2026&week_number=eq.37&select=…` с
anon ключа връща `200 []`; anon има SELECT/INSERT/UPDATE/DELETE в
`role_table_grants`.

## Какво трябва от твоя страна

1. **`mirror-schema.sql`** — `CREATE TABLE recurring_task_skips` с колоните
   горе. FK към `recurring_tasks` по избор: ако огледалото синхронизира
   таблиците в ред, при който `recurring_task_skips` може да дойде преди
   `recurring_tasks`, FK-то ще отхвърли редове — тогава без него.
2. **`$TableColumns` в `sync-mirror.ps1`** — нов ключ:

   ```
   'recurring_task_skips' = 'id,recurring_task_id,year,week_number,store_name,reason,created_by,created_at'
   ```

3. **Триене.** Редовете СЕ ТРИЯТ от портала (бутон „Върни" / ✕ до обект), не
   само се добавят. Ако синхронизацията е само upsert, изтритите изключвания
   ще останат в огледалото като „живи". Кажи как огледалото се държи при
   изтрити редове в другите таблици — ако не ги трие, тук е същото и поне
   трябва да се знае.

**Задачата не е приключена, преди да дойде потвърждение, че е приложено.**
