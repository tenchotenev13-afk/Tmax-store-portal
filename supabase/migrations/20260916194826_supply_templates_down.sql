-- Rollback на 20260916194826_supply_templates.sql
--
-- Ред: записите (FK към артикули и шаблони), после артикулите, после
-- шаблоните. Политиките падат с таблиците. Всички попълнени бланки се губят
-- безвъзвратно. Преди пускане: уведоми Живко (огледалото очаква таблиците).

drop table public.supply_entries;
drop table public.supply_template_items;
drop table public.supply_templates;
