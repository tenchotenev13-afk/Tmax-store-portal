-- grafik-access-drop-settings-schema-down.sql — rollback на стъпка 2: ключовете обратно
-- в app_settings от grafik_access (същият формат — имейли, разделени с „, “).
insert into public.app_settings (key, value, updated_at, updated_by)
select l.key, coalesce((select string_agg(a.email, ', ' order by a.created_at, a.email) from public.grafik_access a where a.list = l.list), ''),
       now(), 'rollback grafik_access_drop_settings'
from (values ('beta', 'grafik_beta_users'), ('trz', 'grafik_trz_users')) as l(list, key)
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
