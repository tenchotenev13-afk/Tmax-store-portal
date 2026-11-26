Отворено: 26.11 · Кой чака: Цвети · Сесия: razliki-vhodyashta-palet

Кодовете на палетите на Билка, Рубин и Вибробетон (SAP код + наименование от
product_catalog) — за списъка на „🟫 Входяща за палет“ в Разлики.

Когато дойдат: нов елемент `{"label":"…","code":"…","name":"…"}` в
`app_settings` ключ `diff_pallet_suppliers` (JSON масив като текст) — update
на value през миграция с rollback към предишната стойност. Код не се пипа;
падащото „Палет на *“ го показва само (тест
`tests/razliki-vhodyashta-palet.test.js` §8). Наименованието се сверява с
product_catalog по sap_code.
