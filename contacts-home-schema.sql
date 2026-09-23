-- contacts-home-schema.sql
-- Начален екран на „Контакти“ (по макета от 23.09.2026). Второ SQL след
-- contacts-directory-schema.sql. Само добавя — нищо не се трие/пренаписва.
--
-- 1) contacts.featured — „Често търсени контакти“ на началния екран.
--    Ръчна отметка в редакцията на човека, не брояч на кликове: списъкът
--    трябва да е стабилен и подреден от някой, който знае кого търсят.
--
-- 2) public.contact_topics — „Кой за какво отговаря?“: проблем → отдел →
--    (по избор) конкретен човек. Редактира се от портала.
--      topic       — текстът на проблема („Грешна цена“, „SAP проблем“)
--      icon        — емоджи за реда
--      category    — отделът, както е в contacts.category (свободен текст,
--                    НЕ foreign key — contacts.category също е текст)
--      contact_id  — отговорникът; при изтриване на човека → NULL
--      sort_order  — ред на показване
--
-- ПРАВА — СЪЗНАТЕЛЕН КОМПРОМИС
-- Същият модел като contacts: RLS включен + политика anon_all_contact_topics
-- (четене и писане с публичния anon ключ). Съдържанието е нечувствително —
-- заглавия на проблеми и връзка към вече публичен контакт. Ограничението
-- „кой редактира“ е в клиента (isAdminContacts), не в базата — както за
-- contacts днес.
--
-- ОГЛЕДАЛО (Живко): нова таблица + нова колона → трябва да влязат в
-- mirror-schema.sql и sync-mirror.ps1.

-- ── 1. Често търсени ─────────────────────────────────────────────────────
alter table public.contacts
  add column if not exists featured boolean not null default false;
comment on column public.contacts.featured is 'Показва се в „Често търсени контакти“ на началния екран.';

-- ── 2. Кой за какво отговаря ────────────────────────────────────────────
create table if not exists public.contact_topics (
  id          uuid primary key default gen_random_uuid(),
  topic       text not null,
  icon        text,
  category    text,
  contact_id  uuid references public.contacts(id) on delete set null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);
comment on table public.contact_topics is 'Кой за какво отговаря: проблем → отдел → отговорник. Начален екран на Контакти.';

-- updated_at от същата функция като contacts (тя е обща: само new.updated_at := now()).
drop trigger if exists contact_topics_touch_updated_at on public.contact_topics;
create trigger contact_topics_touch_updated_at
  before update on public.contact_topics
  for each row execute function public.contacts_touch_updated_at();

alter table public.contact_topics enable row level security;
drop policy if exists anon_all_contact_topics on public.contact_topics;
create policy anon_all_contact_topics on public.contact_topics
  for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.contact_topics to anon, authenticated;

-- ── 3. Начални теми (от макета) ─────────────────────────────────────────
-- Отдел е попълнен САМО където съвпадението с реален отдел в базата е
-- еднозначно. Останалите са с category NULL и се довършват от портала —
-- не се гадае кой отговаря за „Грешна цена“ или „Липса на стока“.
-- Вмъква се само ако таблицата е празна (повторно пускане не дублира).
insert into public.contact_topics (topic, icon, category, sort_order)
select v.topic, v.icon, v.category, v.ord
  from (values
    ('Доставка към магазин',   '🚚', null,               10),
    ('Липса на стока',         '📦', null,               20),
    ('Грешна цена',            '🏷️', null,               30),
    ('Рекламация',             '📣', null,               40),
    ('SAP проблем',            '🖥️', 'IT',               50),
    ('Персонал',               '👥', 'Човешки ресурси',  60),
    ('Маркетингова активност', '📢', 'Отдел Реклама',    70),
    ('Повредена техника',      '🔧', null,               80),
    ('Транспорт',              '🚛', null,               90),
    ('Онлайн поръчка',         '🛒', 'Онлайн магазин',  100)
  ) as v(topic, icon, category, ord)
 where not exists (select 1 from public.contact_topics);


-- ---------------------------------------------------------------------
-- ОТКАТ (при нужда)
-- ---------------------------------------------------------------------
-- drop table if exists public.contact_topics;
-- alter table public.contacts drop column if exists featured;
