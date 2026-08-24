-- users-is-regional-schema.sql
-- Явен признак „регионален мениджър" върху public.users.
-- Приложено в Supabase (xiwkdiqqplgdcrkewgtv) на 24.08.2026,
-- миграция users_is_regional.
--
-- ЗАЩО НОВА КОЛОНА, А НЕ НОВА РОЛЯ
-- Групата „Регионален (по магазин)" в Бюлетина се извеждаше от ролята:
-- всеки активен accounting с непразни assigned_stores. Това е грешно и в
-- двете посоки (към 24.08.2026):
--   · 9 счетоводителки получаваха задачите като „регионални", без да са;
--   · В. Филев е регионален, но е с роля admin и никога не ги получаваше.
-- Ролята accounting не може да се смени — тя е ключ за достъп на 43 места
-- в 17 файла (каса, главна каса, сторно без ограничение по възраст на бона,
-- разлики, връщания, История, Днес, isGlobal() в shared.js). Смяната би
-- отнела всичко това на седмината.
--
-- ЗАЩО НЕ oborot_report
-- oborot_report значи „какъв вечерен оборот получава", а не „каква длъжност
-- заема". Теодор е с 'all', без да е регионален. Двете понятия НЕ се
-- смесват в едно поле: началните стойности по-долу съвпадат със списъка
-- 'assigned' днес, но оттам нататък двете полета са НЕЗАВИСИМИ и нищо в
-- кода не извежда едното от другото.

alter table public.users
  add column if not exists is_regional boolean not null default false;

comment on column public.users.is_regional is
  'Длъжност: регионален мениджър. Независима от role и от oborot_report.';

-- КОЛОННИ ГРАНТОВЕ — задължителни.
-- От 24.08.2026 users е с колонни права (миграция users_column_grants);
-- табличен грант за anon няма, затова нова колона е недостъпна, докато не
-- получи явен грант. Без тях PostgREST не я връща и PATCH-ът от admin.js
-- би падал.
grant select (is_regional) on public.users to anon, authenticated;
grant update (is_regional) on public.users to anon, authenticated;

-- INSERT НАРОЧНО НЕ СЕ ДАВА. При създаване на потребител admin.js не подава
-- колоната — стойността се задава после с PATCH. Същият модел като
-- oborot_report и assigned_stores.

-- Началните седем. Изброени поименно, не изведени от oborot_report:
-- еднократно съвпадение, не правило.
update public.users
   set is_regional = true
 where email in (
   'n.koleva@temax.bg',
   'p.georgieva@temax.bg',
   'p.indjova@temax.bg',
   's.stefanova@temax.bg',
   't.ivanova@temax.bg',
   't.taleva@temax.bg',
   'v.filev@temax.bg'
 );


-- ---------------------------------------------------------------------
-- ОТКАТ (при нужда)
-- ---------------------------------------------------------------------
-- revoke select (is_regional) on public.users from anon, authenticated;
-- revoke update (is_regional) on public.users from anon, authenticated;
-- alter table public.users drop column if exists is_regional;
