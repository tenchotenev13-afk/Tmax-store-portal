# 19.11 — instrukcii-publish

Инструкциите (PDF) — качване в таб „Инструкции“ с една команда: `npm run instrukcii` (сухо, само GET) / `-- --go`. Списък `tools/instrukcii.json` (11 инструкции, всички „Само за офиса“), скрипт `tools/publish-instrukcii.js`, папка `%USERPROFILE%\Documents\Temax-instrukcii` (създадена празна). Без схема, без DDL, без docs.js, без едж функции; ред за Живко няма (documents получава редове, не колони). SHA — в комита „Предавка“.

- Постоянен път `instrukcii/<модул>-<роля>.pdf`; същият файл → нищо; иначе DELETE + POST (няма UPDATE политика за anon) → обратно четене → PATCH на картата с `?v=` (INSERT само ако няма; две карти за пътя → отказ). Сменена само `category` → само PATCH.
- Защита: пипа само `instrukcii/` и картите с url там; ключът — публичният от `docs.js`, проверен role=anon.
- Тест `tests/publish-instrukcii.test.js` (фалшив fetch, временна папка). Мутанти M1–M4 (без сверка с живия обект, INSERT вместо PATCH, без защитата за `instrukcii/`, без сверката на обратното четене) — всички exit 1.
- Компромисът (публичен bucket, отгатваеми пътища) — прието от Тенчо 19.11; записано в CLAUDE.md и handover секция 5.
- Проба в истинското хранилище и първо качване — `claude/open/19-11-instrukcii-publish-parvo-kachvane.md`.
