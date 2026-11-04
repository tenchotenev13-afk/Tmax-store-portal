-- definer-functions-anon-schema.sql
-- Етап 1 от сигурността, последна стъпка: SECURITY DEFINER функциите, които
-- Advisor показва като изпълними от anon (04.11.2026). Кодът не се променя.
--
-- transit_mark_empty_stores() — volatile, ПИШЕ (отмята transit задачите).
--   Вика я само pg_cron job 22 („0 * * * *“, като postgres). Нито .js, нито
--   едж функция; в edge_logs за 24 ч. няма rpc/transit_mark_empty_stores.
--   → revoke execute от public, anon, authenticated (postgres и service_role
--   остават).
-- report_excluded_stores() — stable, само чете app_settings (публична за
--   anon, политика app_settings_anon_select_all). Вика я
--   checklist_portal_values() (SECURITY INVOKER, от браузъра с anon) и
--   SECURITY DEFINER функциите transit_mark_empty_stores и четирите
--   *_sync_completions (те я викат като postgres). Затова НЕ губи EXECUTE за
--   anon — става SECURITY INVOKER. search_path=public вече е зададен
--   (proconfig), името app_settings е неквалифицирано — допълнителен set не
--   трябва. Граница: политиката на app_settings е само за роля anon —
--   извикана като authenticated, функцията ще върне NULL (порталът ползва
--   само anon).
-- report_cron_schedule() — остава SECURITY DEFINER с EXECUTE за anon:
--   admin.js я чете (sbGet('rpc/report_cron_schedule')), издава само дни/часове
--   на отчетите. Решение до етап 2 (самоличност в базата).
--
-- Проверено преди (04.11.2026), пробно прилагане в транзакция с rollback:
--   като anon checklist_portal_values(2026,45) — md5 и 162 реда еднакви
--   преди и след; report_excluded_stores — еднакъв списък; report_cron_schedule
--   — 5 реда; transit_mark_empty_stores като anon → 42501 permission denied.

revoke execute on function public.transit_mark_empty_stores() from public, anon, authenticated;
alter function public.report_excluded_stores() security invoker;

-- ROLLBACK
-- grant execute on function public.transit_mark_empty_stores() to public, anon, authenticated;
-- alter function public.report_excluded_stores() security definer;
