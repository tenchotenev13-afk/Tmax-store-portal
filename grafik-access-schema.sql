-- grafik-access-schema.sql — Работен график, етап 1е-3, стъпка 1 от 2 (решение на Тенчо 04.11.2026, Б).
-- Списъците „beta“ (кой вижда таба) и „ТРЗ“ (чете само подадените) се местят от
-- app_settings (публични за четене с anon ключа, политика using (true)) в grafik_access:
-- RLS без политики и без права за anon/authenticated — достъп САМО през grafik-api (service ключ),
-- както останалите grafik_*. Стъпка 2 (grafik-access-drop-settings-schema.sql) маха ключовете
-- от app_settings СЛЕД деплоя на grafik-api, който чете оттук — иначе табът се затваря за всички.
-- Rollback: grafik-access-schema-down.sql.

create table public.grafik_access (
  id uuid primary key default gen_random_uuid(),
  list text not null check (list in ('beta', 'trz')),
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  note text,
  created_at timestamptz not null default now(),
  created_by text
);
create unique index grafik_access_list_email on public.grafik_access (list, email);

alter table public.grafik_access enable row level security;
revoke all on public.grafik_access from anon, authenticated;

-- Данните — от текущите ключове (имейли, разделени със запетая; главни букви и интервали — нормализирани).
insert into public.grafik_access (list, email, created_by)
select l.list, lower(btrim(e)), 'migration grafik_access (app_settings.' || l.key || ')'
from (values ('beta', 'grafik_beta_users'), ('trz', 'grafik_trz_users')) as l(list, key)
join public.app_settings s on s.key = l.key
cross join lateral unnest(string_to_array(s.value, ',')) as e
where btrim(e) <> ''
on conflict (list, email) do nothing;
