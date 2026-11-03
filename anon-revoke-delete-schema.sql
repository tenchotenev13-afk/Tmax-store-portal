-- anon-revoke-delete-schema.sql
-- anon и authenticated губят DELETE върху 45 таблици в public, от които
-- порталът (браузърът) НЕ трие. Кодът на модулите не се променя.
--
-- Защо: към 01.11.2026 anon има DELETE почти навсякъде (вкл. таблиците без
-- RLS). Anon ключът е публичен в shared.js — всеки с него може да трие.
--
-- ОСТАВАТ с DELETE (45 — DELETE_ALLOWED в tests/delete-tables-whitelist.test.js):
--   admin.js:     stores, order_restrictions, product_catalog,
--                 notification_matrix, notification_overrides,
--                 notification_schedules
--   bulletin.js:  bulletin_tasks, task_completions, recurring_tasks,
--                 recurring_task_skips, recurring_task_periods,
--                 recurring_task_versions, subtask_completions,
--                 task_subtasks, notification_schedules
--   calendar.js:  bus_routes
--   client-orders.js: client_orders, transport_orders
--   contacts.js:  contacts, contact_topics
--   docs.js:      documents
--   kasa.js:      kasa_storno, kasa_storno_items
--   loading.js:   loading_list_items, loading_list_photos,
--                 loading_list_products
--   picking.js:   picking_batches, picking_pallets, picking_pallet_items,
--                 picking_shipments
--   reference.js: warranty_entries, warranty_brands, warranty_subcategories
--                 (последните две — refDeletePrompt(table, …), стойностите
--                 идват от refAdminListHtml)
--   report.js:    report_recipients
--   revaluation.js: revaluation_items, revaluation_campaigns
--   revisions.js: revision_schedule
--   stock-differences.js: stock_differences, differences_reports,
--                 stock_diff_swaps, storno_notes, stock_returns
--   stock-returns.js: stock_returns
--   supply.js:    supply_no_need
--   transfers.js: transfers, transfer_cargo
--   transit.js:   goods_transit (sbDelete + директен fetch DELETE в
--                 confirmClearTransit)
--
-- Проверено преди (02.11.2026):
--   - едж функциите трият само със service_role (createClient със
--     SUPABASE_SERVICE_ROLE_KEY); pg_cron (job 8, backup_snapshots) — postgres;
--   - edge_logs за 24 ч: DELETE с роля anon само към kasa_storno_items,
--     supply_no_need, task_completions, bus_routes (портала) и един ръчен
--     DELETE към loading_lists от конзолата (филтър comment=like.проверка
--     02.11*) — не е код на портала;
--   - функциите в public с DELETE FROM са SECURITY DEFINER и трият само
--     task_completions;
--   - FK каскадите (напр. transfers → transfer_cargo_events,
--     picking_batches → picking_lines, storno_notes → storno_note_replies,
--     warranty_brands → warranty_service_locations,
--     revaluation_campaigns → revaluation_submissions) минават като
--     собственика на таблицата — доказано с временни таблици в транзакция с
--     rollback: anon трие родител, детето без DELETE право се изтрива.
--   - completions (0 реда), recipients (1), warranty_cards (0) — никой
--     .js / едж функция не ги споменава; влизат в revoke.

revoke delete on public.app_settings from anon, authenticated;
revoke delete on public.audit_log from anon, authenticated;
revoke delete on public.backup_log from anon, authenticated;
revoke delete on public.backup_snapshots from anon, authenticated;
revoke delete on public.bulletin_promotions from anon, authenticated;
revoke delete on public.bulletins from anon, authenticated;
revoke delete on public.client_order_counters from anon, authenticated;
revoke delete on public.completions from anon, authenticated;
revoke delete on public.daily_turnover from anon, authenticated;
revoke delete on public.kasa_cleanup_bak_20260920 from anon, authenticated;
revoke delete on public.kasa_cleanup_bak_20260928 from anon, authenticated;
revoke delete on public.kasa_documents from anon, authenticated;
revoke delete on public.kasa_glavna from anon, authenticated;
revoke delete on public.kasa_reports from anon, authenticated;
revoke delete on public.kasa_zoborot from anon, authenticated;
revoke delete on public.loading_lists from anon, authenticated;
revoke delete on public.minus_movements from anon, authenticated;
revoke delete on public.minus_plants from anon, authenticated;
revoke delete on public.minus_reasons from anon, authenticated;
revoke delete on public.minus_uom_thresholds from anon, authenticated;
revoke delete on public.minus_uploads from anon, authenticated;
revoke delete on public.notification_log from anon, authenticated;
revoke delete on public.notification_topics from anon, authenticated;
revoke delete on public.picking_lines from anon, authenticated;
revoke delete on public.recipients from anon, authenticated;
revoke delete on public.report_snapshots from anon, authenticated;
revoke delete on public.revaluation_codes from anon, authenticated;
revoke delete on public.revaluation_submissions from anon, authenticated;
revoke delete on public.route_templates from anon, authenticated;
revoke delete on public.stock_returns_auto_bak_20261007 from anon, authenticated;
revoke delete on public.storno_note_replies from anon, authenticated;
revoke delete on public.supply_entries from anon, authenticated;
revoke delete on public.supply_store_notes from anon, authenticated;
revoke delete on public.supply_template_items from anon, authenticated;
revoke delete on public.supply_templates from anon, authenticated;
revoke delete on public.task_completions_bak_20260910 from anon, authenticated;
revoke delete on public.transfer_cargo_events from anon, authenticated;
revoke delete on public.transport_pallets from anon, authenticated;
revoke delete on public.warranty_cards from anon, authenticated;
revoke delete on public.warranty_service_locations from anon, authenticated;
revoke delete on public.warranty_templates from anon, authenticated;
revoke delete on public.weekly_checklist from anon, authenticated;
revoke delete on public.weekly_checklist_metrics from anon, authenticated;
revoke delete on public.weekly_checklist_responses from anon, authenticated;
revoke delete on public.weekly_checklist_sends from anon, authenticated;

-- ROLLBACK (връща DELETE точно на същите 45):
-- grant delete on public.app_settings to anon, authenticated;
-- grant delete on public.audit_log to anon, authenticated;
-- grant delete on public.backup_log to anon, authenticated;
-- grant delete on public.backup_snapshots to anon, authenticated;
-- grant delete on public.bulletin_promotions to anon, authenticated;
-- grant delete on public.bulletins to anon, authenticated;
-- grant delete on public.client_order_counters to anon, authenticated;
-- grant delete on public.completions to anon, authenticated;
-- grant delete on public.daily_turnover to anon, authenticated;
-- grant delete on public.kasa_cleanup_bak_20260920 to anon, authenticated;
-- grant delete on public.kasa_cleanup_bak_20260928 to anon, authenticated;
-- grant delete on public.kasa_documents to anon, authenticated;
-- grant delete on public.kasa_glavna to anon, authenticated;
-- grant delete on public.kasa_reports to anon, authenticated;
-- grant delete on public.kasa_zoborot to anon, authenticated;
-- grant delete on public.loading_lists to anon, authenticated;
-- grant delete on public.minus_movements to anon, authenticated;
-- grant delete on public.minus_plants to anon, authenticated;
-- grant delete on public.minus_reasons to anon, authenticated;
-- grant delete on public.minus_uom_thresholds to anon, authenticated;
-- grant delete on public.minus_uploads to anon, authenticated;
-- grant delete on public.notification_log to anon, authenticated;
-- grant delete on public.notification_topics to anon, authenticated;
-- grant delete on public.picking_lines to anon, authenticated;
-- grant delete on public.recipients to anon, authenticated;
-- grant delete on public.report_snapshots to anon, authenticated;
-- grant delete on public.revaluation_codes to anon, authenticated;
-- grant delete on public.revaluation_submissions to anon, authenticated;
-- grant delete on public.route_templates to anon, authenticated;
-- grant delete on public.stock_returns_auto_bak_20261007 to anon, authenticated;
-- grant delete on public.storno_note_replies to anon, authenticated;
-- grant delete on public.supply_entries to anon, authenticated;
-- grant delete on public.supply_store_notes to anon, authenticated;
-- grant delete on public.supply_template_items to anon, authenticated;
-- grant delete on public.supply_templates to anon, authenticated;
-- grant delete on public.task_completions_bak_20260910 to anon, authenticated;
-- grant delete on public.transfer_cargo_events to anon, authenticated;
-- grant delete on public.transport_pallets to anon, authenticated;
-- grant delete on public.warranty_cards to anon, authenticated;
-- grant delete on public.warranty_service_locations to anon, authenticated;
-- grant delete on public.warranty_templates to anon, authenticated;
-- grant delete on public.weekly_checklist to anon, authenticated;
-- grant delete on public.weekly_checklist_metrics to anon, authenticated;
-- grant delete on public.weekly_checklist_responses to anon, authenticated;
-- grant delete on public.weekly_checklist_sends to anon, authenticated;
