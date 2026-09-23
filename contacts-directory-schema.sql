-- contacts-directory-schema.sql
-- Етап 1 от обновяването на „Контакти" (вътрешен указател).
-- Само ДОБАВЯ колони към public.contacts — нищо съществуващо не се
-- изтрива и не се пренаписва. role_title остава както е въведен.
--
-- НОВИ КОЛОНИ
--   direction   — „Направление" в отдела (Транспорт, ERP / SAP, Подбор...).
--   deputy_id   — заместник: връзка към друг запис в contacts.
--                 При изтриване на заместника полето става NULL.
--   store_role  — стандартизирана длъжност в обект, за подреждане и
--                 групиране. role_title е свободен текст и е изписан по
--                 различни начини („снабдител" / „Снабдители"), затова не
--                 става за подреждане. Позволени стойности:
--                   manager        Управител
--                   deputy_mtz     Зам. управител (МТЗ)
--                   deputy_supply  Зам. управител (снабдител)
--                   otz            ОТЗ
--                   warehouse      Началник склад
--                   supplier       Снабдител
--                   store          Общ телефон на обекта (не е човек)
--                   other          Друго
--                 NULL = не е магазинен персонал (Централен офис).
--   sort_order  — ръчна подредба в рамките на отдела/обекта.
--   updated_at  — кога е променян записът за последно. Попълва се от
--                 тригер при всяка промяна, не от браузъра.
--   updated_by  — кой го е променил (името от портала; попълва клиентът).
--
-- ЗАЩО ОБЩИЯТ ТЕЛЕФОН НА ОБЕКТА Е РЕД В contacts, А НЕ stores.phone
-- stores.phone съществува, но е празен навсякъде, а anon няма UPDATE
-- политика върху stores. Таблицата съдържа и колона pass, затова
-- отварянето ѝ за редакция само заради телефон не си заслужава.
-- Телефонът на обекта е ред с store_role = 'store'.
--
-- ПРАВА: contacts е с таблични грантове за anon/authenticated (не колонни),
-- политика anon_all_contacts. Новите колони са достъпни без нов грант.
--
-- ДАННИ: backfill на store_role само за категория „Персонал магазини"
-- (43 реда към 23.09.2026) по текста на role_title. Всичко, което не
-- разпознае, остава NULL — не се гадае. „Снабдител" се мапва към
-- supplier, НЕ към deputy_supply: от данните не личи кой снабдител е
-- заместник-управител — това се коригира ръчно.

alter table public.contacts
  add column if not exists direction  text,
  add column if not exists deputy_id  uuid references public.contacts(id) on delete set null,
  add column if not exists store_role text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by text;

alter table public.contacts
  drop constraint if exists contacts_store_role_check;
alter table public.contacts
  add constraint contacts_store_role_check check (
    store_role is null or store_role in
      ('manager','deputy_mtz','deputy_supply','otz','warehouse','supplier','store','other')
  );

comment on column public.contacts.direction  is 'Направление в отдела (свободен текст).';
comment on column public.contacts.deputy_id  is 'Заместник — друг запис в contacts.';
comment on column public.contacts.store_role is 'Стандартизирана длъжност в обект; NULL = не е магазинен персонал.';
comment on column public.contacts.updated_at is 'Последна промяна; от тригер contacts_touch_updated_at.';
comment on column public.contacts.updated_by is 'Кой е направил последната промяна (име от портала).';

-- Старите записи нямат история: updated_at започва от created_at,
-- а не от момента на миграцията, иначе всички биха изглеждали „пресни".
update public.contacts set updated_at = created_at where created_at is not null;

create or replace function public.contacts_touch_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contacts_touch_updated_at on public.contacts;
create trigger contacts_touch_updated_at
  before update on public.contacts
  for each row execute function public.contacts_touch_updated_at();

-- Backfill на store_role. ВАЖНО: тригерът по-горе вече е активен, затова
-- се изключва за backfill-а — иначе 43 реда биха получили днешна дата
-- като „последна промяна", без никой да ги е пипал.
alter table public.contacts disable trigger contacts_touch_updated_at;

update public.contacts set store_role = case
    when role_title ilike 'управител%'                        then 'manager'
    when role_title ilike '%мтз%'                             then 'deputy_mtz'
    when role_title ilike 'отз%'                              then 'otz'
    when role_title ilike 'нач%склад%'                        then 'warehouse'
    when role_title ilike 'снабдител%'                        then 'supplier'
    else null
  end
 where category = 'Персонал магазини'
   and store_role is null;

alter table public.contacts enable trigger contacts_touch_updated_at;

create index if not exists contacts_store_name_idx on public.contacts (store_name);


-- ---------------------------------------------------------------------
-- ОТКАТ (при нужда)
-- ---------------------------------------------------------------------
-- drop trigger if exists contacts_touch_updated_at on public.contacts;
-- drop function if exists public.contacts_touch_updated_at();
-- drop index if exists public.contacts_store_name_idx;
-- alter table public.contacts
--   drop constraint if exists contacts_store_role_check,
--   drop column if exists direction,
--   drop column if exists deputy_id,
--   drop column if exists store_role,
--   drop column if exists sort_order,
--   drop column if exists updated_at,
--   drop column if exists updated_by;
