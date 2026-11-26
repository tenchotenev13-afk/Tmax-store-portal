Отворено: 27.11 · Кой чака: Тенчо · Сесия: mirror-reader-all

`stores.pass` — да се махне. Колоната е празна в 23-те реда, anon още я чете
(колонен SELECT), `mirror_reader` — не (`mirror-reader-all-schema.sql`).
Преди drop: grep из клиента и едж функциите за `pass` върху stores, сверка
че е празна, ред в `zhivko-opashka.md` (махната колона) — огледалото и
`$TableColumns` в `sync-mirror.ps1` трябва да я изпуснат.
