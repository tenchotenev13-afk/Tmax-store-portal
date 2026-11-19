# 19.11 — instrukcii-readback-cache

`tools/publish-instrukcii.js`: „същият файл“ и проверката след качване са по размер + MD5 на локалния файл срещу `size` + eTag от `/storage/v1/object/info/`, не по изтегляне. Без схема, без миграция → без ред за Живко.

- **Повод:** първата замяна на сменени PDF-и (три за Клиентски заявки в товарния лист, сесия instrukcii-kz-tovaren-list) — `--go` exit 1 преди картите: изтеглянето от `/object/authenticated/` върна стария файл (`cf=HIT`), а в `storage.objects` бяха новите. Картите — ръчен PATCH на `url` (`?v=202611192229`).
- **Проба на живо (публичният ключ, само GET/list, два кръга):** `/object/info/`, HEAD на `/authenticated/` и `POST /object/list` → `cf=DYNAMIC`, size/eTag = `storage.objects`; GET `/authenticated/` (и с `?cb=`) и GET `/public/` → `cf=HIT`. Избран `info` (по един обект, 404 = същата форма като досега). Смяна на обект в пробата няма — сесията беше само за четене.
- **Тест** `tests/publish-instrukcii.test.js` — 73 проверки; нови: стари кеширани байтове + нов eTag → PATCH и exit 0; eTag ≠ MD5 след качване → exit ≠ 0 без PATCH; сухо в двете посоки на кеша; същият размер с друг MD5. Мутанти M6–M10 — убити.
- **Сухо на живо от worktree-а:** 11 в списъка · 11 непроменени · 0 за качване, exit 0.
- **Проверка на живо, която остава:** първият `--go` със сменен файл — `claude/open/19-11-instrukcii-publish-parvo-kachvane.md`.
