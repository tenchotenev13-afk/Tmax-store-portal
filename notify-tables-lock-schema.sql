-- notify-tables-lock-schema.sql
-- Таблиците, които решават КОЙ КАКВО ПОЛУЧАВА — публичният ключ (anon,
-- authenticated) губи ВСИЧКИ права върху тях, вкл. SELECT (решение на Тенчо
-- 27.11.2026, вариант А). Четене и запис от портала — само през едж
-- функцията notify-admin (пропуск + роля от users: admin; schedules — и
-- accounting). Повод: всеки с ключа от сайта можеше да добави свой имейл в
-- report_recipients и да получава отчетите; писмо от Supabase Advisor
-- (rls_disabled_in_public, 22.11.2026) — за тези пет и още 15 таблици
-- (останалите — claude/open/27-11-rls-ostanali-15.md).
--
-- Миграция notify_tables_lock — НЕ Е ПРИЛОЖЕНА. Ред: деплой на notify-admin →
-- push на клиента (Pages сверен) → час без anon/браузър заявки към петте в
-- edge_logs (и без TemaxMirrorSync с anon) → тази миграция.
--
-- Сверка преди (27.11.2026):
-- - RLS изключено и на петте; политики — няма.
-- - ACL: anon / authenticated = arwdDxtm на report_recipients,
--   notification_matrix, notification_overrides, notification_schedules;
--   arwDxtm на notification_topics (DELETE отнет на 03.11.2026);
--   mirror_reader = r (20261126222936); service_role = arwdDxtm.
-- - Тригери, изгледи, SQL функции, които ги четат — няма.
-- - Едж функциите (bulletin-notify, dynamic-responder, send-routed-report,
--   send-scheduled-report, notify-admin) — service ключ (BYPASSRLS).
--   Кроновете 11, 15–20, 26, 30 само викат функциите (anon JWT е за шлюза).
-- - Огледалото — mirror_reader (без BYPASSRLS). При включено RLS без
--   политика за него би виждало 0 реда, затова тук се добавя
--   mirror_reader_select (както в mirror-reader-all-schema.sql); правата му
--   (grant select) не се пипат.
-- - Нови колони / стойности на статус — няма; ред за Живко само за
--   сведение, че петте вече не се четат с anon.
--
-- Проверка след прилагане:
-- - ACL: anon/authenticated — нищо на петте; mirror_reader=r; RLS on.
-- - set local role anon: select от всяка от петте → 42501.
-- - set local role mirror_reader: броевете = като postgres.
-- - HTTP с anon ключа: GET <таблица>?select=id → 401; POST report_recipients → 401.
-- - notify-admin като admin: list на петте = броевете в базата.

alter table public.report_recipients      enable row level security;
alter table public.notification_topics    enable row level security;
alter table public.notification_matrix    enable row level security;
alter table public.notification_overrides enable row level security;
alter table public.notification_schedules enable row level security;

revoke all on public.report_recipients      from anon, authenticated;
revoke all on public.notification_topics    from anon, authenticated;
revoke all on public.notification_matrix    from anon, authenticated;
revoke all on public.notification_overrides from anon, authenticated;
revoke all on public.notification_schedules from anon, authenticated;

create policy mirror_reader_select on public.report_recipients      for select to mirror_reader using (true);
create policy mirror_reader_select on public.notification_topics    for select to mirror_reader using (true);
create policy mirror_reader_select on public.notification_matrix    for select to mirror_reader using (true);
create policy mirror_reader_select on public.notification_overrides for select to mirror_reader using (true);
create policy mirror_reader_select on public.notification_schedules for select to mirror_reader using (true);

-- ROLLBACK (дословно обратното; ACL-ът се връща на arwdDxtm / arwDxtm):
-- drop policy mirror_reader_select on public.report_recipients;
-- drop policy mirror_reader_select on public.notification_topics;
-- drop policy mirror_reader_select on public.notification_matrix;
-- drop policy mirror_reader_select on public.notification_overrides;
-- drop policy mirror_reader_select on public.notification_schedules;
-- grant all on public.report_recipients      to anon, authenticated;
-- grant select, insert, update, truncate, references, trigger, maintain on public.notification_topics to anon, authenticated;
-- grant all on public.notification_matrix    to anon, authenticated;
-- grant all on public.notification_overrides to anon, authenticated;
-- grant all on public.notification_schedules to anon, authenticated;
-- alter table public.report_recipients      disable row level security;
-- alter table public.notification_topics    disable row level security;
-- alter table public.notification_matrix    disable row level security;
-- alter table public.notification_overrides disable row level security;
-- alter table public.notification_schedules disable row level security;
-- След rollback клиентът (naList/naInsert/…) продължава да работи през
-- notify-admin — той не зависи от правата на anon.
