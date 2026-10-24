# 24.10 — razliki-schetovoditel-etap2

- Разлики → „✍️ Счетоводител“, етап 2: push + имейл при „Запиши“ (ново съобщение) и „Изпрати“ (отговор) — `sdNoteNotify` в `stock-differences.js`; при зареждане — нищо (правило 14).
- Получатели: съобщение и отговор от счетоводител/ЦО → активните manager + sklad на обекта (касата — не); отговор от обекта → авторът (`users.display_name = storno_notes.created_by`). Push през `pushToPeople` (тагът display_name; `pushToStores` стига и до касата). Имейл през `sendEmail`, `from_name` като до доставчик. Отговорилият не получава себе си.
- Провал → запис остава, `notify_error`, червен знак „⚠️ Известието не тръгна“ + „🔁 Прати пак“ (авторът на записа, Цвети, admin); успех → `notified_at`.
- Миграция `20261024090000_storno_notes_notify` (в базата версия `20261024125100`, приложена 24.10; 4 колони nullable, проверено в information_schema) (+ `_down.sql`, огледало `storno-notes-notify-schema.sql`): `notify_error text`, `notified_at timestamptz` в `storno_notes` и `storno_note_replies`; ред в `zhivko-opashka.md`.
- Тест `tests/storno-notes-notify.test.js` (64 проверки; мутации 8/9 убити, M2 — еквивалентен). SHA е комитът, който добавя този файл.
