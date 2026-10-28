Отворено: 28.10 · Кой чака: Тенчо · Сесия: bul-allow-postpone
Затворено: 28.10 · Как: направено в сесия bul-allow-postpone-oneoff — колони bulletin_tasks.allow_*, формата на задачата, tests/bul-allow-postpone-oneoff.test.js (SHA — комитът, който мести този файл); проверката на живо — 28-10-bul-allow-postpone-oneoff-live

Забраната за „⏱ Отложи“ / „🚫 Не се отнася“ е направена само за ПОСТОЯННИТЕ
задачи (recurring_tasks, 28.10.2026). Еднократните (bulletin_tasks) нямат
такива колони — бутоните им са както досега. Ако трябва и за тях: две
колони в bulletin_tasks + полето във формата на задачата + същите проверки
(`bulRecAllows` / `bulRecBlocked` в bulletin.js сега връщат „разрешено“ за
kind 'regular') + ред за Живко. Чака решение на Тенчо дали е нужно.
