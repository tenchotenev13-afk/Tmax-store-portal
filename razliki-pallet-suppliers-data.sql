-- razliki-pallet-suppliers-data.sql
-- Разлики: категория „🟫 Входяща за палет“ (pallet_inbound) при посока
-- Доставчик — решение Д1 от срещата на 12.11.2026 + решение на Тенчо 26.11.2026.
-- САМО ДАННИ — без нова таблица, колона или стойност на статус. За огледалото:
-- „промяна само в данни, без промяна за огледалото“.
--
-- Ключ app_settings 'diff_pallet_suppliers' — JSON масив като ТЕКСТ (колоната
-- value е text; същото оформление като report_excluded_stores и
-- soi_regional_extra). Всеки елемент: label (в падащото „Палет на *“), code
-- (SAP код, попълва се в реда), name (наименование, от product_catalog).
-- Имената са сверени с product_catalog на 26.11.2026.
-- Билка, Рубин и Вибробетон се добавят тук (update на value), когато
-- Цветелина прати кодовете — без промяна в кода.
--
-- app_settings е публичен за четене (политика app_settings_anon_select_all,
-- using (true)) — тук стоят само имена и кодове на палети.
--
-- Преди (прочетено 26.11.2026): ключът го няма. Друго → грешка.

do $$
begin
  if exists (select 1 from public.app_settings where key = 'diff_pallet_suppliers') then
    raise exception 'diff_pallet_suppliers: ключът вече съществува';
  end if;

  insert into public.app_settings (key, value, updated_by)
  values (
    'diff_pallet_suppliers',
    '[{"label":"Оргахим","code":"41247","name":"ПАЛЕТ ОРГАХИМ"},'
    '{"label":"Интер Керамик Трейдинг","code":"66740","name":"СКАРА ДЪРВЕНА ИНТЕР КЕРАМИК"},'
    '{"label":"Боро Теракол","code":"92373","name":"ПАЛЕ БОРО 120Х80СМ"},'
    '{"label":"Сен-Гобен (Вебер)","code":"73869","name":"ПАЛЕТ WEBER 120X80СМ"}]',
    'migration razliki_pallet_suppliers'
  );
end $$;

-- ROLLBACK
-- delete from public.app_settings where key = 'diff_pallet_suppliers';
