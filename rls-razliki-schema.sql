-- rls-razliki-schema.sql
-- Миграция 3 от описа rls-15-opis (28.11.2026): трите таблици на Разлики.
-- RLS on БЕЗ промяна в кода и в това, което порталът може да прави днес.
-- Истинското затваряне (запис през функция) е стъпка (б) —
-- claude/open/27-11-rls-ostanali-15.md.
--
-- Сверка преди (28.11.2026, сесия rls-spravochnici-razliki):
-- - RLS изключено на трите. ACL anon / authenticated = arwdDxtm (S/I/U/D),
--   mirror_reader = r.
-- - differences_reports — без политики → portal_* за anon и authenticated.
-- - stock_differences / stock_diff_swaps — вече имат anon_all_sd /
--   anon_all_sd_swaps (FOR ALL TO anon using (true) with check (true)); те
--   покриват anon и НЕ се дублират. authenticated (има същите grants) не е
--   покрит → portal_* само за authenticated.
-- - Тригери stock_diff_sync_reports_* / _lines_* / _swaps_* —
--   SECURITY DEFINER (собственик postgres, bypassrls) — RLS не ги спира.
--   checklist_portal_values() — INVOKER, чете като anon → покрива се от
--   select политиките. Крон 24 stock_diff_sync_completions() — като postgres.
-- - DELETE_ALLOWED съвпада с DELETE в ACL-а за трите.
-- - edge_logs за 24 ч: differences_reports GET 8781 / PATCH 14 / POST 11,
--   stock_differences GET 968 / PATCH 63 / POST 11, stock_diff_swaps
--   GET 8321 / PATCH 6 — всички 2xx.
-- - Нови колони / таблици / стойности на статус — няма; нов ред за Живко няма.
--
-- Advisor след прилагане: rls_policy_always_true за трите — очаквано.

revoke truncate, references, trigger on public.differences_reports from anon, authenticated;
revoke truncate, references, trigger on public.stock_differences   from anon, authenticated;
revoke truncate, references, trigger on public.stock_diff_swaps    from anon, authenticated;

create policy portal_select on public.differences_reports for select to anon, authenticated using (true);
create policy portal_insert on public.differences_reports for insert to anon, authenticated with check (true);
create policy portal_update on public.differences_reports for update to anon, authenticated using (true) with check (true);
create policy portal_delete on public.differences_reports for delete to anon, authenticated using (true);
create policy portal_select on public.stock_differences for select to authenticated using (true);
create policy portal_insert on public.stock_differences for insert to authenticated with check (true);
create policy portal_update on public.stock_differences for update to authenticated using (true) with check (true);
create policy portal_delete on public.stock_differences for delete to authenticated using (true);
create policy portal_select on public.stock_diff_swaps for select to authenticated using (true);
create policy portal_insert on public.stock_diff_swaps for insert to authenticated with check (true);
create policy portal_update on public.stock_diff_swaps for update to authenticated using (true) with check (true);
create policy portal_delete on public.stock_diff_swaps for delete to authenticated using (true);

create policy mirror_reader_select on public.differences_reports for select to mirror_reader using (true);
create policy mirror_reader_select on public.stock_differences   for select to mirror_reader using (true);
create policy mirror_reader_select on public.stock_diff_swaps    for select to mirror_reader using (true);

alter table public.differences_reports enable row level security;
alter table public.stock_differences   enable row level security;
alter table public.stock_diff_swaps    enable row level security;

-- ROLLBACK (дословно обратното, в обратен ред):
-- alter table public.stock_diff_swaps    disable row level security;
-- alter table public.stock_differences   disable row level security;
-- alter table public.differences_reports disable row level security;
-- drop policy mirror_reader_select on public.stock_diff_swaps;
-- drop policy mirror_reader_select on public.stock_differences;
-- drop policy mirror_reader_select on public.differences_reports;
-- drop policy portal_delete on public.stock_diff_swaps;
-- drop policy portal_update on public.stock_diff_swaps;
-- drop policy portal_insert on public.stock_diff_swaps;
-- drop policy portal_select on public.stock_diff_swaps;
-- drop policy portal_delete on public.stock_differences;
-- drop policy portal_update on public.stock_differences;
-- drop policy portal_insert on public.stock_differences;
-- drop policy portal_select on public.stock_differences;
-- drop policy portal_delete on public.differences_reports;
-- drop policy portal_update on public.differences_reports;
-- drop policy portal_insert on public.differences_reports;
-- drop policy portal_select on public.differences_reports;
-- grant truncate, references, trigger on public.stock_diff_swaps    to anon, authenticated;
-- grant truncate, references, trigger on public.stock_differences   to anon, authenticated;
-- grant truncate, references, trigger on public.differences_reports to anon, authenticated;
