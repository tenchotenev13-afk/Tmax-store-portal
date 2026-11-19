Отворено: 19.11 · Кой чака: Тенчо · Сесия: minusi-open-diff-notify

- **Некомитната поправка от 29.10 за bulletin-notify, тема deadline_passed — отметките да се търсят в ПРОЗОРЕЦА на задачата, не само с днешна дата.** Повод в нея: седмица 44, РЕВИЗИЯ ГРУПИ (пн–ср, срок сряда 16:00) — в базата 18 от 18 подали, писмото каза „3 от 18“, защото броеше само отметките от сряда.
- В main (`94a53ae`, 19.11) `buildDeadlinePassed` още е `.eq('completion_date', bg.dateStr)` — поправката не е влизала. Прозорецът, който е в main от 01.10 (v11, `94faabc`), е в ДРУГА тема — `today_deadlines` (`recWin` / `doneFor`).
- Работата стои в worktree `C:/Users/tench/Documents/GitHub/wt-deadline-window` (база `ba82e9c`, 29.10; без локални комити), некомитната:
  - `supabase/functions/bulletin-notify/index.ts` — бележка v15 + `dpWin` / `compsFor` / `movedAwayHere` в `buildDeadlinePassed`;
  - `tests/run-all.js` — ред за теста;
  - стажирано: `claude/open/28-10-bul-supply-view-all-live.md` → `closed/` (в main точката е още отворена);
  - неследени: `tests/deadline-window.test.js`, `claude/log/2026-10-29-deadline-window.md`, `claude/open/29-10-deadline-window-live.md`.
- Копие на промените по следените файлове: `C:\Users\tench\AppData\Local\Temp\claude\e814df13b34111ca\8497969f-c6f4-48d6-a88f-34f290e3b7f2\scratchpad\wt-deadline-window-uncommitted.patch` (140 реда; scratchpad-ът не е трайно място — трите неследени файла ги има само в worktree-а).
- Базата е 3 седмици назад: `bulletin-notify` оттогава е v16 → v27 (версия 42). Довършването = пренасяне върху текущия main, не merge на стария файл. worktree-ът НЕ се маха, докато това не е решено.
