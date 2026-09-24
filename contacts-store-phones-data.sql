-- contacts-store-phones-data.sql
-- Общите (стационарни) телефони на 18-те обекта — като ред в contacts
-- със store_role = 'store' (виж contacts-directory-schema.sql).
-- Показват се в заглавието на картата на обекта в „Контакти → Магазини“.
--
-- ИЗТОЧНИК: https://temax.bg/shops, прочетено на 23.09.2026, два пъти
-- независимо — номерата съвпадат. Записани са точно както са на сайта.
-- Имената на обектите съвпадат с contacts.store_name (проверено).
--
-- САМО ДАННИ, без промяна по схемата → не засяга огледалото на Живко.
-- Повторно пускане не дублира: обект, който вече има ред 'store', се
-- пропуска.

insert into public.contacts (type, name, category, store_name, store_role, phone, notes, updated_by)
select 'contact', 'Обект ' || v.store, 'Персонал магазини', v.store, 'store', v.phone,
       'Общ телефон на обекта. Източник: temax.bg/shops (23.09.2026).', 'temax.bg'
  from (values
    ('Враца',        '092 620 027'),
    ('Габрово',      '0 6680 0002'),
    ('Гоце Делчев',  '0 7512 9028'),
    ('Добрич',       '0 5860 3564'),
    ('Дупница',      '0 7015 6077'),
    ('Карлово',      '033 138 225'),
    ('Козлодуй',     '0885306610'),
    ('Кърджали',     '0 3612 2146'),
    ('Монтана',      '0 9630 0058'),
    ('Петрич',       '0 7455 0045'),
    ('Пирдоп',       '0 7142 6923'),
    ('Раднево',      '0 4178 2049'),
    ('Севлиево',     '0 675 300 11'),
    ('Силистра',     '0 8682 0198'),
    ('Сливен',       '0 4466 7312'),
    ('Троян',        '067 092 093'),
    ('Търговище',    '+35960039933'),
    ('Шумен',        '0 54 830 399')
  ) as v(store, phone)
 where not exists (
   select 1 from public.contacts c
    where c.store_role = 'store' and c.store_name = v.store
 );

-- Проверка след пускане (трябва 18):
-- select count(*) from public.contacts where store_role = 'store';

-- ОТКАТ:
-- delete from public.contacts where store_role = 'store' and updated_by = 'temax.bg';
