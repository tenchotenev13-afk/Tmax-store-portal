Отворено: 18.11 · Кой чака: Тенчо · Сесия: razliki-etap6b
Затворено: 23.11 · Как: база 23.11 — 15 реални отговора на обекти на междускладов ред „липса“ (undelivered) с отговор на склада return, 18.11–22.11, от 5 обекта (store_response accepted / sap_done). Проверено от чата 23.11.

Етап 6б на Разлики — бутоните на обекта при липса + return не са видени на
реален ред: към 18.11 няма отворен междускладов ред „липса“ (undelivered) с
отговор на склада „📄 Приемете по документи, пускам нова заявка“ (return) и без
отговор на обекта (липса + return са само със sap_done — 7 реда).

При първия реален случай да се провери у обекта:
- бутоните „📄 ИЗПИСАНО В SAP“ / „⛔ НЕ МОГА ДА ИЗПИША“;
- „Ход: обекта — да изпише в SAP или да отбележи, че не може“;
- банерът „Отговорете с „📄 ИЗПИСАНО В SAP“ или „⛔ НЕ МОГА ДА ИЗПИША““;
- след отговора — push до склада със заглавие „📄 Разлика: Изписано в SAP“ /
  „⛔ Разлика: Не мога да изпиша“, а у склада — надписът на отговора.

Проверка в базата за такъв ред:
  select d.id, r.store_name from stock_differences d
  join differences_reports r on r.id = d.report_id
  where r.direction = 'interstore' and d.difference_category = 'undelivered'
    and d.warehouse_response = 'return' and d.store_response is null
    and coalesce(d.status, '') <> 'received';
