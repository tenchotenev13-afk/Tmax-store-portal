-- rls-server-only-schema.sql
-- Миграция 1 от описа rls-15-opis (28.11.2026): трите таблици от Supabase
-- Advisor (rls_disabled_in_public), които браузърът НЕ пипа. RLS on, anon и
-- authenticated губят ВСИЧКИ права, политика само mirror_reader_select.
-- Без промяна в портала. Останалите 12 — claude/open/27-11-rls-ostanali-15.md.
--
-- Сверка преди (28.11.2026):
-- - RLS изключено и на трите; политики — няма.
-- - ACL на трите: anon / authenticated = arwDxtm (DELETE отнет 02.11.2026),
--   service_role = arwdDxtm, mirror_reader = r.
-- - notification_log (3669 реда): чете и пише само bulletin-notify
--   (SUPABASE_SERVICE_ROLE_KEY). edge_logs за 24 ч: GET 96 — mirror_reader
--   (TemaxMirrorSync), POST 28 — Deno (едж функцията); от браузъра — 0.
-- - warranty_cards (0 реда): GET 24 — само mirror_reader. НЕ се трие тук —
--   само се заключва (триенето е отделно решение на Тенчо). FK към
--   warranty_brands / warranty_subcategories — RI проверките вървят с
--   правата на собственика, не на anon.
-- - client_order_counters (19 реда): пише я тригерът
--   trg_assign_client_order_num на client_orders чрез
--   assign_client_order_num() — SECURITY INVOKER, тоест пишеше с правата на
--   anon. Затова функцията става SECURITY DEFINER (собственик postgres) с
--   фиксиран search_path; тялото е непроменено (таблицата в него е с
--   квалифицирано име public.client_order_counters). GET 24 за 24 ч — само
--   mirror_reader.
-- - ACL на assign_client_order_num(): =X/postgres (EXECUTE за PUBLIC), плюс
--   anon / authenticated / service_role = X. Тригерна функция — не се вика
--   пряко; EXECUTE не се проверява при задействане на тригер, затова се
--   отнема от PUBLIC, anon и authenticated (иначе revoke само от anon не
--   върши нищо — CLAUDE.md, „Сигурност“).
-- - Изгледи, кронове, други SQL функции, които пипат трите — няма.
-- - Проверка като anon ПРЕДИ миграцията (транзакция, отменена с
--   изключение): INSERT client_orders(store_name='Карлово') → in_num
--   „Карлово-0511“, броячът 510 → 511, после rollback.
-- - Нови колони / таблици / стойности на статус — няма; нов ред за Живко
--   няма (огледалото чете трите с mirror_reader — правата му не се пипат,
--   а политиката mirror_reader_select пази броевете му).
--
-- Миграция rls_server_only, версия 20261128115146, приложена 28.11.2026
-- (≈13:51 София).
--
-- Резултат след прилагане (28.11.2026, в транзакции, отменени с изключение):
-- - ACL на трите: postgres, service_role, mirror_reader=r; RLS on; политика
--   само mirror_reader_select. Функцията: prosecdef = true,
--   search_path=public, pg_temp, ACL postgres=X, service_role=X.
-- - като anon INSERT client_orders(store_name='Карлово') → „Карлово-0512“,
--   броячът 511 → 512, без 42501.
-- - като anon SELECT / INSERT в трите → 42501; select assign_client_order_num() → 42501.
-- - като mirror_reader: 3669 / 0 / 19 = като postgres
--   (notification_log / warranty_cards / client_order_counters).
--
-- Проверка след прилагане (в транзакция с rollback):
-- - като anon INSERT client_orders → следващият номер „Обект-NNNN“, без 42501;
-- - като anon SELECT / INSERT в трите → 42501;
-- - като mirror_reader → броевете = като postgres;
-- - edge_logs: POST notification_log от bulletin-notify при следващия крон → 201.

alter function public.assign_client_order_num() security definer;
alter function public.assign_client_order_num() set search_path = public, pg_temp;
revoke execute on function public.assign_client_order_num() from public, anon, authenticated;

alter table public.notification_log      enable row level security;
alter table public.warranty_cards        enable row level security;
alter table public.client_order_counters enable row level security;

revoke all on public.notification_log      from anon, authenticated;
revoke all on public.warranty_cards        from anon, authenticated;
revoke all on public.client_order_counters from anon, authenticated;

create policy mirror_reader_select on public.notification_log      for select to mirror_reader using (true);
create policy mirror_reader_select on public.warranty_cards        for select to mirror_reader using (true);
create policy mirror_reader_select on public.client_order_counters for select to mirror_reader using (true);

-- ROLLBACK (дословно обратното; ACL-ът се връща на arwDxtm, EXECUTE — на PUBLIC/anon/authenticated):
-- drop policy mirror_reader_select on public.notification_log;
-- drop policy mirror_reader_select on public.warranty_cards;
-- drop policy mirror_reader_select on public.client_order_counters;
-- grant select, insert, update, truncate, references, trigger, maintain on public.notification_log      to anon, authenticated;
-- grant select, insert, update, truncate, references, trigger, maintain on public.warranty_cards        to anon, authenticated;
-- grant select, insert, update, truncate, references, trigger, maintain on public.client_order_counters to anon, authenticated;
-- alter table public.notification_log      disable row level security;
-- alter table public.warranty_cards        disable row level security;
-- alter table public.client_order_counters disable row level security;
-- grant execute on function public.assign_client_order_num() to public, anon, authenticated;
-- alter function public.assign_client_order_num() reset search_path;
-- alter function public.assign_client_order_num() security invoker;
