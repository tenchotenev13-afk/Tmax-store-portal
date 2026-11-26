-- mirror-reader-all-schema.sql
-- Ролята mirror_reader (mirror-reader-schema.sql, 20261125122939) чете
-- всичките 93 таблици, които огледалото на Живко тегли
-- (tools/mirror-key/mirror-tables.txt — списъкът е от Живко, tables-93.txt,
-- имейл 26.11.2026). Така скриптът му чете САМО с нейния ключ и бъдещото
-- затваряне на anon не го засяга. Правата на anon НЕ се пипат.
-- Нищо за anon, нищо за запис.
--
-- Осемте, които ролята вече чете, не се повтарят тук: седемте касови
-- (mirror-reader-schema.sql) и audit_log (mirror-reader-audit-log-schema.sql).
-- Извън списъка и без права: grafik_* (13), backup_snapshots,
-- loading_items_bak_*, *_archive_20261116, revaluation_unit_counters.
--
-- users и stores — САМО колонен SELECT:
-- - users: същите 11 колони като за anon (без password_hash, history_pin_hash);
-- - stores: без колоната pass (празна в 23-те реда; отворена точка да се махне).
--
-- Миграция mirror_reader_all, версия 20261126222936, приложена 27.11.2026.
--
-- Сверка преди (26.11.2026):
-- - и 93-те са таблици (relkind r) в public;
-- - has_table_privilege('mirror_reader', …, 'SELECT') = true само за осемте горе;
-- - 65 от останалите 85 са с включено RLS → grant + политика FOR SELECT
--   TO mirror_reader using (true). Някои имат политики TO public
--   (completions, recipients, transport_pallets, weekly_checklist*), но
--   изрична политика се добавя и там — затварянето на anon може да ги смени;
-- - 20 са без RLS → само grant (политика там не важи):
-- БЕЗ RLS: bulletin_promotions client_order_counters differences_reports
-- БЕЗ RLS: notification_log notification_matrix notification_overrides
-- БЕЗ RLS: notification_schedules notification_topics order_restrictions
-- БЕЗ RLS: product_catalog report_recipients stock_diff_swaps stock_differences
-- БЕЗ RLS: users warranty_brands warranty_cards warranty_entries
-- БЕЗ RLS: warranty_service_locations warranty_subcategories warranty_templates
--   (stock_differences и stock_diff_swaps имат политики TO anon, но RLS е
--   изключено — включи ли се някога, там трябва и политика за mirror_reader.)
-- - колоните на users и stores — сверени в information_schema.columns.
--
-- Проверка след прилагане (set local role mirror_reader в транзакция):
--   count(*) на всяка от 93-те = count(*) като postgres;
--   select password_hash from users → 42501; select pass from stores → 42501;
--   INSERT/UPDATE/DELETE за mirror_reader = false навсякъде.
-- Резултат 27.11.2026: 93 от 93 с равен count(*) (общо 237 003 реда); users
-- (count(id)) и stores (count(id)) — също; password_hash, history_pin_hash,
-- stores.pass, grafik_staff и UPDATE на app_settings → 42501; права за запис
-- (таблични и колонни) — 0; извън списъка ролята чете само
-- storage_files_index; политиките на ролята — 73 (65 + 8 отпреди), всички
-- SELECT. anon — непокътнат (password_hash false, stores.pass true както
-- преди).

grant select on
  public.app_settings,
  public.backup_log,
  public.bulletin_promotions,
  public.bulletin_tasks,
  public.bulletins,
  public.bus_routes,
  public.client_order_counters,
  public.client_orders,
  public.companies,
  public.completions,
  public.contact_topics,
  public.contacts,
  public.differences_reports,
  public.documents,
  public.goods_transit,
  public.loading_list_items,
  public.loading_list_photos,
  public.loading_list_products,
  public.loading_lists,
  public.minus_movements,
  public.minus_plants,
  public.minus_reasons,
  public.minus_uom_thresholds,
  public.minus_uploads,
  public.notification_log,
  public.notification_matrix,
  public.notification_overrides,
  public.notification_schedules,
  public.notification_topics,
  public.order_restrictions,
  public.picking_batches,
  public.picking_lines,
  public.picking_pallet_items,
  public.picking_pallets,
  public.picking_shipments,
  public.problem_article_done,
  public.problem_articles,
  public.product_catalog,
  public.recipients,
  public.recurring_task_periods,
  public.recurring_task_skips,
  public.recurring_task_versions,
  public.recurring_tasks,
  public.report_recipients,
  public.report_snapshots,
  public.revaluation_campaigns,
  public.revaluation_codes,
  public.revaluation_items,
  public.revaluation_submissions,
  public.revaluation_units,
  public.revision_schedule,
  public.route_templates,
  public.stock_diff_swaps,
  public.stock_differences,
  public.stock_returns,
  public.storno_note_replies,
  public.storno_notes,
  public.subtask_completions,
  public.supply_entries,
  public.supply_no_need,
  public.supply_store_notes,
  public.supply_template_items,
  public.supply_templates,
  public.task_completions,
  public.task_subtasks,
  public.transfer_cargo,
  public.transfer_cargo_events,
  public.transfer_counters,
  public.transfers,
  public.transport_orders,
  public.transport_pallets,
  public.warranty_brands,
  public.warranty_cards,
  public.warranty_entries,
  public.warranty_service_locations,
  public.warranty_subcategories,
  public.warranty_templates,
  public.weekly_checklist,
  public.weekly_checklist_freezes,
  public.weekly_checklist_metrics,
  public.weekly_checklist_responses,
  public.weekly_checklist_sends,
  public.weekly_checklist_snapshots
to mirror_reader;

grant select (id, email, store_name, role, display_name, active, created_at,
  assigned_stores, notify_groups, oborot_report, is_regional)
  on public.users to mirror_reader;
grant select (id, name, city, phone, active, company_id, addr)
  on public.stores to mirror_reader;

create policy mirror_reader_select on public.app_settings               for select to mirror_reader using (true);
create policy mirror_reader_select on public.backup_log                 for select to mirror_reader using (true);
create policy mirror_reader_select on public.bulletin_tasks             for select to mirror_reader using (true);
create policy mirror_reader_select on public.bulletins                  for select to mirror_reader using (true);
create policy mirror_reader_select on public.bus_routes                 for select to mirror_reader using (true);
create policy mirror_reader_select on public.client_orders              for select to mirror_reader using (true);
create policy mirror_reader_select on public.companies                  for select to mirror_reader using (true);
create policy mirror_reader_select on public.completions                for select to mirror_reader using (true);
create policy mirror_reader_select on public.contact_topics             for select to mirror_reader using (true);
create policy mirror_reader_select on public.contacts                   for select to mirror_reader using (true);
create policy mirror_reader_select on public.documents                  for select to mirror_reader using (true);
create policy mirror_reader_select on public.goods_transit              for select to mirror_reader using (true);
create policy mirror_reader_select on public.loading_list_items         for select to mirror_reader using (true);
create policy mirror_reader_select on public.loading_list_photos        for select to mirror_reader using (true);
create policy mirror_reader_select on public.loading_list_products      for select to mirror_reader using (true);
create policy mirror_reader_select on public.loading_lists              for select to mirror_reader using (true);
create policy mirror_reader_select on public.minus_movements            for select to mirror_reader using (true);
create policy mirror_reader_select on public.minus_plants               for select to mirror_reader using (true);
create policy mirror_reader_select on public.minus_reasons              for select to mirror_reader using (true);
create policy mirror_reader_select on public.minus_uom_thresholds       for select to mirror_reader using (true);
create policy mirror_reader_select on public.minus_uploads              for select to mirror_reader using (true);
create policy mirror_reader_select on public.picking_batches            for select to mirror_reader using (true);
create policy mirror_reader_select on public.picking_lines              for select to mirror_reader using (true);
create policy mirror_reader_select on public.picking_pallet_items       for select to mirror_reader using (true);
create policy mirror_reader_select on public.picking_pallets            for select to mirror_reader using (true);
create policy mirror_reader_select on public.picking_shipments          for select to mirror_reader using (true);
create policy mirror_reader_select on public.problem_article_done       for select to mirror_reader using (true);
create policy mirror_reader_select on public.problem_articles           for select to mirror_reader using (true);
create policy mirror_reader_select on public.recipients                 for select to mirror_reader using (true);
create policy mirror_reader_select on public.recurring_task_periods     for select to mirror_reader using (true);
create policy mirror_reader_select on public.recurring_task_skips       for select to mirror_reader using (true);
create policy mirror_reader_select on public.recurring_task_versions    for select to mirror_reader using (true);
create policy mirror_reader_select on public.recurring_tasks            for select to mirror_reader using (true);
create policy mirror_reader_select on public.report_snapshots           for select to mirror_reader using (true);
create policy mirror_reader_select on public.revaluation_campaigns      for select to mirror_reader using (true);
create policy mirror_reader_select on public.revaluation_codes          for select to mirror_reader using (true);
create policy mirror_reader_select on public.revaluation_items          for select to mirror_reader using (true);
create policy mirror_reader_select on public.revaluation_submissions    for select to mirror_reader using (true);
create policy mirror_reader_select on public.revaluation_units          for select to mirror_reader using (true);
create policy mirror_reader_select on public.revision_schedule          for select to mirror_reader using (true);
create policy mirror_reader_select on public.route_templates            for select to mirror_reader using (true);
create policy mirror_reader_select on public.stock_returns              for select to mirror_reader using (true);
create policy mirror_reader_select on public.stores                     for select to mirror_reader using (true);
create policy mirror_reader_select on public.storno_note_replies        for select to mirror_reader using (true);
create policy mirror_reader_select on public.storno_notes               for select to mirror_reader using (true);
create policy mirror_reader_select on public.subtask_completions        for select to mirror_reader using (true);
create policy mirror_reader_select on public.supply_entries             for select to mirror_reader using (true);
create policy mirror_reader_select on public.supply_no_need             for select to mirror_reader using (true);
create policy mirror_reader_select on public.supply_store_notes         for select to mirror_reader using (true);
create policy mirror_reader_select on public.supply_template_items      for select to mirror_reader using (true);
create policy mirror_reader_select on public.supply_templates           for select to mirror_reader using (true);
create policy mirror_reader_select on public.task_completions           for select to mirror_reader using (true);
create policy mirror_reader_select on public.task_subtasks              for select to mirror_reader using (true);
create policy mirror_reader_select on public.transfer_cargo             for select to mirror_reader using (true);
create policy mirror_reader_select on public.transfer_cargo_events      for select to mirror_reader using (true);
create policy mirror_reader_select on public.transfer_counters          for select to mirror_reader using (true);
create policy mirror_reader_select on public.transfers                  for select to mirror_reader using (true);
create policy mirror_reader_select on public.transport_orders           for select to mirror_reader using (true);
create policy mirror_reader_select on public.transport_pallets          for select to mirror_reader using (true);
create policy mirror_reader_select on public.weekly_checklist           for select to mirror_reader using (true);
create policy mirror_reader_select on public.weekly_checklist_freezes   for select to mirror_reader using (true);
create policy mirror_reader_select on public.weekly_checklist_metrics   for select to mirror_reader using (true);
create policy mirror_reader_select on public.weekly_checklist_responses for select to mirror_reader using (true);
create policy mirror_reader_select on public.weekly_checklist_sends     for select to mirror_reader using (true);
create policy mirror_reader_select on public.weekly_checklist_snapshots for select to mirror_reader using (true);

-- Rollback:
-- drop policy if exists mirror_reader_select on public.app_settings;
-- drop policy if exists mirror_reader_select on public.backup_log;
-- drop policy if exists mirror_reader_select on public.bulletin_tasks;
-- drop policy if exists mirror_reader_select on public.bulletins;
-- drop policy if exists mirror_reader_select on public.bus_routes;
-- drop policy if exists mirror_reader_select on public.client_orders;
-- drop policy if exists mirror_reader_select on public.companies;
-- drop policy if exists mirror_reader_select on public.completions;
-- drop policy if exists mirror_reader_select on public.contact_topics;
-- drop policy if exists mirror_reader_select on public.contacts;
-- drop policy if exists mirror_reader_select on public.documents;
-- drop policy if exists mirror_reader_select on public.goods_transit;
-- drop policy if exists mirror_reader_select on public.loading_list_items;
-- drop policy if exists mirror_reader_select on public.loading_list_photos;
-- drop policy if exists mirror_reader_select on public.loading_list_products;
-- drop policy if exists mirror_reader_select on public.loading_lists;
-- drop policy if exists mirror_reader_select on public.minus_movements;
-- drop policy if exists mirror_reader_select on public.minus_plants;
-- drop policy if exists mirror_reader_select on public.minus_reasons;
-- drop policy if exists mirror_reader_select on public.minus_uom_thresholds;
-- drop policy if exists mirror_reader_select on public.minus_uploads;
-- drop policy if exists mirror_reader_select on public.picking_batches;
-- drop policy if exists mirror_reader_select on public.picking_lines;
-- drop policy if exists mirror_reader_select on public.picking_pallet_items;
-- drop policy if exists mirror_reader_select on public.picking_pallets;
-- drop policy if exists mirror_reader_select on public.picking_shipments;
-- drop policy if exists mirror_reader_select on public.problem_article_done;
-- drop policy if exists mirror_reader_select on public.problem_articles;
-- drop policy if exists mirror_reader_select on public.recipients;
-- drop policy if exists mirror_reader_select on public.recurring_task_periods;
-- drop policy if exists mirror_reader_select on public.recurring_task_skips;
-- drop policy if exists mirror_reader_select on public.recurring_task_versions;
-- drop policy if exists mirror_reader_select on public.recurring_tasks;
-- drop policy if exists mirror_reader_select on public.report_snapshots;
-- drop policy if exists mirror_reader_select on public.revaluation_campaigns;
-- drop policy if exists mirror_reader_select on public.revaluation_codes;
-- drop policy if exists mirror_reader_select on public.revaluation_items;
-- drop policy if exists mirror_reader_select on public.revaluation_submissions;
-- drop policy if exists mirror_reader_select on public.revaluation_units;
-- drop policy if exists mirror_reader_select on public.revision_schedule;
-- drop policy if exists mirror_reader_select on public.route_templates;
-- drop policy if exists mirror_reader_select on public.stock_returns;
-- drop policy if exists mirror_reader_select on public.stores;
-- drop policy if exists mirror_reader_select on public.storno_note_replies;
-- drop policy if exists mirror_reader_select on public.storno_notes;
-- drop policy if exists mirror_reader_select on public.subtask_completions;
-- drop policy if exists mirror_reader_select on public.supply_entries;
-- drop policy if exists mirror_reader_select on public.supply_no_need;
-- drop policy if exists mirror_reader_select on public.supply_store_notes;
-- drop policy if exists mirror_reader_select on public.supply_template_items;
-- drop policy if exists mirror_reader_select on public.supply_templates;
-- drop policy if exists mirror_reader_select on public.task_completions;
-- drop policy if exists mirror_reader_select on public.task_subtasks;
-- drop policy if exists mirror_reader_select on public.transfer_cargo;
-- drop policy if exists mirror_reader_select on public.transfer_cargo_events;
-- drop policy if exists mirror_reader_select on public.transfer_counters;
-- drop policy if exists mirror_reader_select on public.transfers;
-- drop policy if exists mirror_reader_select on public.transport_orders;
-- drop policy if exists mirror_reader_select on public.transport_pallets;
-- drop policy if exists mirror_reader_select on public.weekly_checklist;
-- drop policy if exists mirror_reader_select on public.weekly_checklist_freezes;
-- drop policy if exists mirror_reader_select on public.weekly_checklist_metrics;
-- drop policy if exists mirror_reader_select on public.weekly_checklist_responses;
-- drop policy if exists mirror_reader_select on public.weekly_checklist_sends;
-- drop policy if exists mirror_reader_select on public.weekly_checklist_snapshots;
-- revoke select (id, name, city, phone, active, company_id, addr) on public.stores from mirror_reader;
-- revoke select (id, email, store_name, role, display_name, active, created_at,
--   assigned_stores, notify_groups, oborot_report, is_regional) on public.users from mirror_reader;
-- revoke select on
--   public.app_settings,
--   public.backup_log,
--   public.bulletin_promotions,
--   public.bulletin_tasks,
--   public.bulletins,
--   public.bus_routes,
--   public.client_order_counters,
--   public.client_orders,
--   public.companies,
--   public.completions,
--   public.contact_topics,
--   public.contacts,
--   public.differences_reports,
--   public.documents,
--   public.goods_transit,
--   public.loading_list_items,
--   public.loading_list_photos,
--   public.loading_list_products,
--   public.loading_lists,
--   public.minus_movements,
--   public.minus_plants,
--   public.minus_reasons,
--   public.minus_uom_thresholds,
--   public.minus_uploads,
--   public.notification_log,
--   public.notification_matrix,
--   public.notification_overrides,
--   public.notification_schedules,
--   public.notification_topics,
--   public.order_restrictions,
--   public.picking_batches,
--   public.picking_lines,
--   public.picking_pallet_items,
--   public.picking_pallets,
--   public.picking_shipments,
--   public.problem_article_done,
--   public.problem_articles,
--   public.product_catalog,
--   public.recipients,
--   public.recurring_task_periods,
--   public.recurring_task_skips,
--   public.recurring_task_versions,
--   public.recurring_tasks,
--   public.report_recipients,
--   public.report_snapshots,
--   public.revaluation_campaigns,
--   public.revaluation_codes,
--   public.revaluation_items,
--   public.revaluation_submissions,
--   public.revaluation_units,
--   public.revision_schedule,
--   public.route_templates,
--   public.stock_diff_swaps,
--   public.stock_differences,
--   public.stock_returns,
--   public.storno_note_replies,
--   public.storno_notes,
--   public.subtask_completions,
--   public.supply_entries,
--   public.supply_no_need,
--   public.supply_store_notes,
--   public.supply_template_items,
--   public.supply_templates,
--   public.task_completions,
--   public.task_subtasks,
--   public.transfer_cargo,
--   public.transfer_cargo_events,
--   public.transfer_counters,
--   public.transfers,
--   public.transport_orders,
--   public.transport_pallets,
--   public.warranty_brands,
--   public.warranty_cards,
--   public.warranty_entries,
--   public.warranty_service_locations,
--   public.warranty_subcategories,
--   public.warranty_templates,
--   public.weekly_checklist,
--   public.weekly_checklist_freezes,
--   public.weekly_checklist_metrics,
--   public.weekly_checklist_responses,
--   public.weekly_checklist_sends,
--   public.weekly_checklist_snapshots
-- from mirror_reader;
