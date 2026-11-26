# Ключ само за четене за огледалото (mirror_reader)

Ключът дава на огледалото на Живко само четене на всичките 93 таблици от
`mirror-tables.txt` (списъкът е от Живко, tables-93.txt, 26.11.2026),
изгледа `storage_files_index` и файловете в bucket `kasa-docs`. Нищо
друго — нито запис, нито таблиците извън списъка (`grafik_*`, бекъпи,
архиви). `users` и `stores` — само изброени колони: без `password_hash`,
`history_pin_hash` и `pass`; `select=*` върху тях е отказ, затова се четат с
изричен списък колони.

Миграциите: `mirror-reader-schema.sql` (ролята + касата + `kasa-docs`),
`mirror-reader-audit-log-schema.sql` (`audit_log`),
`mirror-reader-all-schema.sql` (останалите 85). Без приложените миграции
самопроверката пада и файл не се пише.

Ключът се прави от Тенчо. Сесиите на Claude не пускат скрипта и не искат
тайната.

## Откъде е тайната

Supabase Dashboard → проектът → **Project Settings → JWT Keys** →
**Legacy JWT Secret** → Reveal / Copy. (Ключовете на проекта са legacy JWT,
`eyJ…`, HS256 — същата тайна подписва и anon ключа.)

## Команди (PowerShell, от корена на репото)

```powershell
$env:SUPABASE_JWT_SECRET = 'тайната'
```

```powershell
node tools\mirror-key\make-mirror-key.js
```

```powershell
Remove-Item Env:SUPABASE_JWT_SECRET
```

По подразбиране файлът `mirror-key.txt` отива на работния плот. Друга папка —
като аргумент: `node tools\mirror-key\make-mirror-key.js D:\usb`. Никога в
репото (`mirror-key.txt` е в `.gitignore`).

Скриптът печата датата на изтичане (+2 години) и по един ред за всяка
проверка — само статуси и броеве:

- а) GET на всяка таблица от `mirror-tables.txt` и на `storage_files_index`
  → 200/206 и брой редове (`users`/`stores` — с изброените колони);
- б) сваляне на един файл от `kasa-docs` → 200;
- в) GET на `users.password_hash`, `users.history_pin_hash`, `stores.pass` и
  на `grafik_staff` (извън списъка) → отказ (401/403);
- г) PATCH (с реална колона — при празно тяло PostgREST връща 204, без да
  стигне до правата) и POST към `kasa_reports` (без засегнати редове) → отказ;
- д) списък на bucket `docs` (Storage list) → 0 обекта или отказ 4xx. Не сваляне:
  `docs` е публичен bucket и се сваля от всеки и без ключ.

Пише файла САМО ако всички минат. Exit 0 = записан; 1 = провалена
самопроверка; 2 = липсва тайна / папка / fetch (нужен е Node 18+).

## За Живко

Ключът се дава лично, не по имейл. В `sync-mirror.ps1` и
`sync-storage-files.ps1` се сменя **само** `Authorization: Bearer <ключ>`;
заглавният ред `apikey` остава публичният anon ключ (шлюзът на Supabase иска
познат ключ там, а ролята се взема от `Authorization`). Самопроверката е
пусната точно с тази комбинация.

С този ключ `users` и `stores` **не** се четат със `select=*` (отказ 401/403
— ролята няма права за `password_hash`, `history_pin_hash`, `pass`). Скриптът
трябва да ги иска с изричен списък — колоните са в `COLS` на
`make-mirror-key.js`.

## Ако ключът изтече или трябва да се спре

- Изтичане: пусни скрипта пак, дай новия ключ.
- Спиране преди срока: няма списък за отнемане на отделен JWT. Варианти —
  `drop role mirror_reader` (rollback в `mirror-reader-schema.sql`; спира
  ключа веднага) или смяна на JWT тайната на проекта (спира и anon ключа на
  портала — не се прави без отделно решение).
