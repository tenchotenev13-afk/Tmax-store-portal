# 26.11 — mirror-reader-audit-log

- Ролята `mirror_reader` чете и `public.audit_log`: `grant select` + политика `mirror_reader_select` FOR SELECT TO mirror_reader using (true). Нищо за anon, нищо за запис. Повод — писмо на Живко 25.11 (огледалото чете `audit_log` със service_role, защото anon вижда 0 реда). Ключът на Живко не се сменя.
- Схема: `mirror-reader-audit-log-schema.sql` (rollback вътре). Миграция `mirror_reader_audit_log`, версия **20261126062013**, приложена 26.11.
- Сверка преди (26.11): RLS включен, единствената политика `anon_insert_audit_log` (INSERT, anon), mirror_reader без SELECT. След нея (set local role, връщане назад): mirror_reader 29866 = postgres 29866, anon 0, users → 42501, INSERT/UPDATE/DELETE за ролята false, ACL `mirror_reader=r/postgres`, anon — непроменен.
- `tools/mirror-key/make-mirror-key.js`: `audit_log` е в самопроверката а) (GET → 200/206); README обновено. Скриптът не е пускан от сесията.
- Тест `tests/mirror-reader-audit-log.test.js` (12 проверки); `tests/mirror-reader-key.test.js` — а) GET audit_log + провал при 401/403 (85 проверки). Мутации 9/9 съборени: FOR ALL, grant към anon, + grant insert, махната политика, политика към anon, users вместо audit_log, rollback без revoke, скрипт без audit_log (срещу двата теста). Базата преди кръга: exit 0.
