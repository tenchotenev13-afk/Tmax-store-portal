-- grafik-access-roles-schema-down.sql — rollback на grafik-access-roles-schema.sql.
-- view / edit → beta (старият grafik-api ги чете като „вижда таба“; view губи „само четене“ —
-- Теодор отново пише като admin). can_reset_pin остава (маха го grafik-zashtita-schema-down.sql).

begin;
alter table public.grafik_access drop constraint grafik_access_list_check;
update public.grafik_access set list = 'beta' where list in ('view', 'edit');
drop index public.grafik_access_email;
create unique index grafik_access_list_email on public.grafik_access (list, email);
alter table public.grafik_access add constraint grafik_access_list_check check (list in ('beta', 'view', 'trz', 'edit'));
commit;
