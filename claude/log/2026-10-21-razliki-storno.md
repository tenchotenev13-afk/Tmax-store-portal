# 21.10 — razliki-storno

- Разлики, „Сторна по грешен прием“: един бутон „🧾 Сторнирано“ вместо Заприх./Връщане/Липса (`diffLineResolveButtons`, само при `wrong_receipt`). Решение на Тенчо 19–20.10.2026: без имейл до доставчика.
- Записът: `stock_differences` получава type='storno', status='taken' („Изчистена“), resolved_by/at и completed_by/at. Бланката става прегледана с точно `{reviewed:true}` — `sdReviewedPatch` вече не слага `email_pending` при `wrong_receipt`. Доставчиковите и междускладовите бланки не са пипани.
- ✉️ до доставчика е скрит за `wrong_receipt` — и в горната карта, и в „Решени редове“ (решение на Тенчо 21.10). „✓ Без имейл“ не се показва, защото няма `email_pending`.
- Етикетът „🧾 Сторнирано“ стои в таблицата, в Excel, в печата и в модала за редакция. Модалът има опция storno, за да не изтрие типа при „Запази“.
- Без DDL: `stock-diff-storno-schema.sql` (коментар + rollback). Добавен е ред в `zhivko-opashka.md`.
- Тест: `tests/sd-wrong-receipt-storno.test.js` (52 проверки, 7 мутации падат); `diff-email-pending.test.js` — очакването за сторното е сменено на само `{reviewed:true}` (потвърдено от Тенчо). SHA е комитът, който добавя този файл (`git log -- claude/log/2026-10-21-razliki-storno.md`).
