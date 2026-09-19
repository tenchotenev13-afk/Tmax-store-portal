-- Rollback на 20260919132946_supply_photos_floor_cables.sql
--
-- Ред: попълнените записи по двете бланки (FK към артикули и шаблони без
-- cascade), после шаблоните (артикулите падат с on delete cascade), после
-- колоната photos. Всичко попълнено по floor-lm и cables-reels се губи
-- безвъзвратно. Колорантите не се пипат. Преди пускане: уведоми Живко
-- (огледалото очаква колоната).

delete from public.supply_entries
 where template_id in (select id from public.supply_templates where slug in ('floor-lm','cables-reels'));
delete from public.supply_templates where slug in ('floor-lm','cables-reels');
alter table public.supply_templates drop column photos;
