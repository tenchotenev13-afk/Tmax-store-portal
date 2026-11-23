Отворено: 19.11 · Кой чака: Тенчо · Сесия: razliki-etap7b
Затворено: 23.11 · Как: база 23.11 — 2 записа с source 'diff' от бланка b9421650 (Петрич, грешен баркод): 87793 (source_line_id bb0a3059) и 87794 (9440ae11), created_by Миглена Павлова, 20.11. Проверено от чата 23.11.

Етап 7б на Разлики — първото реално „➕ В регистъра“ от ред „грешен баркод“
(Миглена или някой от razliki_barcode). На живо (19.11, af09026) бутонът е
проверен само симулирано — модалът е затворен с „Откажи“, защото записът в
problem_articles не се трие. Чака реалната работа.

При първия реален запис да се види:
- в базата: source 'diff', source_line_id = id на реда от stock_differences,
  note = коментарът на обекта (ако е имало), created_by — името;
- на същия ред в Разлики бутонът става надпис „🏷️ В регистъра“;
- в „🏷️ Проблемни артикули“ — новият запис; във формата за подаване и в
  Минуси — кутийката / значката за кода.

Проверка в базата:
  select p.material_code, p.source, p.source_line_id, p.created_by, p.created_at,
         d.material_code as line_code, d.difference_category
  from problem_articles p left join stock_differences d on d.id = p.source_line_id
  where p.source = 'diff' order by p.created_at;
