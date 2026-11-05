# 05.11 — preocenka-buletin-vrazka

- Само данни, код не е пипан. Без нова таблица / колона / статус → ред в `zhivko-opashka.md` не трябва.
- Постоянната „ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА“ (`recurring_tasks.id = a5e1e6f8-5b47-43ce-bfa4-5ab3ee7f70a6`) свързана с 🏷️ Преоценка от седмица 09.11.2026 — както „нататък“ от интерфейса (`bulSaveRecurringContent`): версия `a5d15b86-3794-4532-84f4-68141dfa18d2` (19.10..null) затворена на `to_monday = 2026-11-02`; нова версия 09.11..null — копие с `linked_module = 'revaluation'`. Бутонът се вижда по `rvCanSee()` — обектите от `revaluation_stores` + admin/accounting/supply/controlling. `recurring_tasks.linked_module` (базовият ред, седмици преди 12.10) не е пипан.
- Жокер (`recurring_tasks.store_hints`) за Кърджали, Шумен, Габрово: „Попълни и подай бланката в 🏷️ Преоценка (бутонът долу). После прикачи тук файла от „📥 Изтегли моята бланка“.“
- Rollback (стойностите ПРЕДИ промяната):
  - `delete from recurring_task_versions where recurring_task_id = 'a5e1e6f8-5b47-43ce-bfa4-5ab3ee7f70a6' and from_monday = '2026-11-09';`
  - `update recurring_task_versions set to_monday = null where id = 'a5d15b86-3794-4532-84f4-68141dfa18d2';`
  - `update recurring_tasks set store_hints = null where id = 'a5e1e6f8-5b47-43ce-bfa4-5ab3ee7f70a6';` (беше `null`)
  - Версия `a5d15b86` преди промяната: from_monday 2026-10-19, to_monday null, title „ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА“, description „Подаване на файл с преоценка към Елица Гюрова-прикачена бланка“, due_weekday 0, due_weekdays [0,1], due_window true, due_time null, task_type file_comment, department admin, target_stores null, report_groups ["controlling","user:e.gurova@temax.bg"], linked_module null, created_by „Миглена Павлова“.
- Изпълнено в една транзакция (DO блок с проверка на броя редове); сверка: три версии (12.10..12.10, 19.10..02.11, 09.11..null с `revaluation`), новата съвпада със старата във всичко освен `linked_module` (jsonb сравнение); `store_hints` — jsonb с трите обекта.
- **`store_hints` не се версионира** — жокерът на трите обекта се вижда ВЕДНАГА, и в седмица 02.11 (там без бутона). Прието от Тенчо на 05.11: задачата за 02–03.11 вече е минала.
- Бутонът към модула е в картата на деня (календар) и „План за деня“, не в реда на списъка „Постоянни“ — така е за всяка свързана задача.
- Тест: нов `tests/preocenka-buletin-vrazka.test.js` (27 проверки, данните — копие на реалните): 09.11 Шумен — бутон + клик → mod-revaluation + жокер; 09.11 Добрич — без бутон, без жокер; 02.11 Шумен — без бутон, жокер има; 02.11 Добрич — непроменено. Мутанти (v3 без `linked_module`; `revaluation_stores` = само Кърджали) падат.
- Проверка на живо (от предишната задача): Преоценка за Шумен — минала на 05.11 (чатът, акаунт управител Шумен: табът се вижда, тестовите кампании ги няма, „Следваща: задължителна 09.11–10.11.2026“). Габрово — не е проверен, виж `claude/open/05-11-preocenka-gabrovo-live.md`.
