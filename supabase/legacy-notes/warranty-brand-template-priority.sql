-- Добавя поле за PDF шаблон на ниво МАРКА (проверява се първо, преди под-категорийния fallback)
-- Полезно за вътрешни марки като Тайфун, чиито продукти покриват много под-категории,
-- но всички трябва да ползват една и съща гаранционна карта.
alter table warranty_brands add column if not exists card_template_file text;

-- Тайфун → винаги tayfun.pdf, независимо от под-категорията
update warranty_brands set card_template_file = 'tayfun.pdf' where name = 'Тайфун';

-- Ако имаш и други вътрешни марки, за които важи същото, добави реда тук по същия начин:
-- update warranty_brands set card_template_file = 'ИМЕ_НА_ФАЙЛ.pdf' where name = 'ИМЕ_НА_МАРКА';
