# Сигурност, етап 2 — стъпка 1: инвентар

Сесия `etap2-inventar`, 04.11.2026. Само четене — нищо в базата и в кода не е
променено. Тайни (ключове, секрети, пароли) не са в документа — само „има/няма“,
тип и къде се ползват. Данните от базата са към 04.11.2026 ~13:00 UTC, кодът —
`origin/main` `a48a2bb`.

## Обобщение

- **Подписване:** проектът е на **асиметрични JWT signing keys** — в
  `/auth/v1/.well-known/jwks.json` е един ключ ES256 (P-256, `kid ccdd7d71…`).
  **Legacy HS256 секретът още се приема**: anon ключът от `shared.js` е HS256 и
  всички заявки на портала минават с него. Дали е „Previously used“ или е още
  текущ за legacy ключовете, CLI-то не показва — виж т.1.
- **Едж функциите нямат с какво да подпишат JWT, който PostgREST приема:** няма
  `SUPABASE_JWT_SECRET`; частният ES256 ключ не е достъпен; `PORTAL_SESSION_SECRET`
  е HMAC за собствения пропуск, който PostgREST не познава. Стъпка 2 трябва да
  избере път (Supabase Auth / импортиран собствен ключ / друг) — виж „Открити въпроси“.
- **Таблици:** 103 в `public` + 1 изглед; 20 без RLS. Grants за `anon` и
  `authenticated` са **еднакви навсякъде**. Политиките не са: 131 за `anon`,
  13 за `public`, 2 за `authenticated` → **59 таблици имат политика само за anon**
  — при преминаване на портала към `authenticated` те ще връщат празно / отказ.
- **Кой ползва anon ключа:** порталът (~800 000 заявки/денонощие), RM-app (8
  таблици, само четене, без логин, на същия хост), огледалото `TemaxMirrorSync/1.0`
  (89 таблици, само GET), PowerShell клиент (`storage_files_index` + файловете —
  вероятно бекъпът на файлове при Живко), **13 pg_cron задачи** (викат едж
  функциите с legacy anon JWT) и локални `node`/`curl` скриптове. Checklist-Temax
  **не ползва Supabase** (Google Apps Script + Sheets).
- **Най-големите рискове за стъпка 5 (затваряне на anon върху таблиците):**
  (1) огледалото и PowerShell клиентът — чете с anon, без него спира бекъпът;
  (2) RM-app — няма логин, живее само с anon; (3) Storage — 4 публични
  bucket-а, 1894 публични URL-а в 12 колони, политиките на Storage са само за
  anon, а `storage_files_index` (SECURITY DEFINER изглед) дава на anon списъка
  на обектите, вкл. частния `kasa-docs`; (4) преди вход порталът вика само
  `auth-login` и пише в `audit_log` — anon трябва да запази само това.
- **Кроновете не са риск за стъпка 5:** викат едж функциите с anon ключа само
  заради `verify_jwt` на шлюза, а функциите ходят до базата със service_role —
  revoke на anon върху таблиците не ги засяга. Риск са само при **изключване на
  legacy ключа** — отделно решение, не част от етап 2.
- **Странични находки** (всяка в свой файл в `claude/open/`): `kasa-access-check`
  приема `user_id` + ПИН без ограничение на опитите (ВИСОК,
  `04-11-kasa-access-check-pin-bruteforce.md`); `kasaRoles` без accounting срещу
  коментара (`04-11-kasa-roles-accounting.md`); остарели текстове за едж
  функциите (`04-11-edge-docs-stale.md`).

## 1. Подписване

**а) Режим.**

| Какво | Стойност | Откъде |
|---|---|---|
| Ключ в JWKS | 1 бр., `EC` / `ES256` / `P-256`, `use: sig`, `kid ccdd7d71-6d09-40ac-a9ba-75d92c8b2673` | `GET /auth/v1/.well-known/jwks.json` (публичен) |
| anon ключ в `shared.js` | legacy JWT, `alg HS256`, `role anon`, `iss supabase`, `exp` 2036 | декодиран header/payload, без подписа |
| Приема ли се legacy HS256 | **да** — на 04.11 всички заявки на портала, огледалото, RM-app и кроновете са с него и минават | `edge_logs` |
| Списък current / standby / previously used / revoked | **не се вижда** през CLI 2.116 (няма команда) | — |

Къде да погледне Тенчо: **Dashboard → Project Settings → JWT Keys**:
- таб **„JWT Signing Keys“** — кой ключ е *Current*, има ли *Standby*, дали
  legacy секретът е *Previously used* (приема се, но не се подписва с него) или
  *Revoked*;
- таб **„Legacy JWT Secret“** — дали още е активен;
- **Project Settings → API Keys** — legacy `anon` / `service_role` и новите
  `sb_publishable_…` / `sb_secret_…`, и дали legacy ключовете могат да се изключат.

**б) Секретите на едж функциите** (`supabase secrets list`, само имена):
`ONESIGNAL_REST_KEY`, `PORTAL_ONESIGNAL_KEY`, `PORTAL_SESSION_SECRET`, `SMTP_HOST`,
`SMTP_PASSWORD`, `SMTP_PORT`, `SMTP_USER`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`,
`SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`.

- **`SUPABASE_JWT_SECRET` няма** → функция не може да подпише HS256 JWT.
- `SUPABASE_JWKS` е публичната част — става за **проверка**, не за подписване.
- `PORTAL_SESSION_SECRET` подписва пропуска на портала (HMAC, `_shared/session.ts`)
  — PostgREST не го познава.
- `SUPABASE_DB_URL` (директна връзка към Postgres) и `SUPABASE_SECRET_KEYS` /
  `SUPABASE_SERVICE_ROLE_KEY` дават пълен достъп, но не и JWT за `authenticated`.
- Код в репото ползва само `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `PORTAL_SESSION_SECRET`, `ONESIGNAL_REST_KEY`, `SMTP_*` (и `SMTP_FROM_NAME`,
  който го няма в списъка с секрети — функцията пада на стойност по подразбиране
  или празно; непроверено).
- `auth.users` = 0 — Supabase Auth не се ползва.

**Извод за стъпка 2:** за JWT, който PostgREST приема като `authenticated`, са
нужни или (а) Supabase Auth (GoTrue подписва с текущия ES256 ключ; потребителите
трябва да съществуват в `auth.users`), или (б) собствен ключ за подписване,
внесен в JWT Signing Keys, чийто частен ключ държи едж функция, или (в) legacy
JWT secret като секрет на функция — само докато legacy се приема, тоест не е
дълготраен път. Решение — на Тенчо.

## 2. Таблици в `public`

Легенда: grants `SIUD` = SELECT/INSERT/UPDATE/DELETE, `·` = няма. Колоните
„политики“ показват кои команди разрешава поне една PERMISSIVE политика за ролята
(вкл. политиките за `public`). При изключено RLS политиките не важат — решават
само grants. `users` има колонни grants (SELECT по 11 колони) — в таблицата
по-долу е показан само табличният grant.

| Таблица | RLS | grants anon | grants auth | политики anon | политики auth | политики (име → cmd → роли) |
|---|---|---|---|---|---|---|
| `app_settings` | вкл. | SIU· | SIU· | S··· | ···· | app_settings_anon_select_all → SELECT → anon |
| `audit_log` | вкл. | SIU· | SIU· | ·I·· | ···· | anon_insert_audit_log → INSERT → anon |
| `backup_log` | вкл. | SIU· | SIU· | SI·· | ···· | anon_insert_log → INSERT → anon; anon_read_backup_log → SELECT → anon |
| `backup_snapshots` | вкл. | SIU· | SIU· | SI·· | ···· | anon_insert_backup → INSERT → anon; anon_read_backup_snapshots → SELECT → anon |
| `bulletin_promotions` | **изкл.** | SIU· | SIU· | ···· | ···· | — |
| `bulletin_tasks` | вкл. | SIUD | SIUD | SIUD | ···· | anon_all_tasks → ALL → anon |
| `bulletins` | вкл. | SIU· | SIU· | SIUD | ···· | anon_all_bulletins → ALL → anon |
| `bus_routes` | вкл. | SIUD | SIUD | SIUD | ···· | anon_all_routes → ALL → anon |
| `client_order_counters` | **изкл.** | SIU· | SIU· | ···· | ···· | — |
| `client_orders` | вкл. | SIUD | SIUD | SIUD | ···· | anon_all_orders → ALL → anon |
| `companies` | вкл. | S··· | S··· | S··· | ···· | anon_select_companies → SELECT → anon |
| `completions` | вкл. | SIU· | SIU· | SIUD | SIUD | allow all → ALL → public; public read → SELECT → public; public write → ALL → public |
| `contact_topics` | вкл. | SIUD | SIUD | SIUD | SIUD | anon_all_contact_topics → ALL → anon,authenticated |
| `contacts` | вкл. | SIUD | SIUD | SIUD | ···· | anon_all_contacts → ALL → anon |
| `daily_turnover` | вкл. | SIU· | SIU· | SIUD | SIUD | anon_all_daily_turnover → ALL → public |
| `differences_reports` | **изкл.** | SIUD | SIUD | ···· | ···· | — |
| `documents` | вкл. | SIUD | SIUD | SIUD | ···· | anon_all_documents → ALL → anon |
| `goods_transit` | вкл. | SIUD | SIUD | SIUD | ···· | anon_all_transit → ALL → anon |
| `grafik_company_terms` | вкл. | ···· | ···· | ···· | ···· | — |
| `grafik_extra_days` | вкл. | ···· | ···· | ···· | ···· | — |
| `grafik_letter_map` | вкл. | ···· | ···· | ···· | ···· | — |
| `grafik_months` | вкл. | ···· | ···· | ···· | ···· | — |
| `grafik_rows` | вкл. | ···· | ···· | ···· | ···· | — |
| `grafik_sectors` | вкл. | ···· | ···· | ···· | ···· | — |
| `grafik_staff` | вкл. | ···· | ···· | ···· | ···· | — |
| `grafik_store_company` | вкл. | ···· | ···· | ···· | ···· | — |
| `grafik_vtr` | вкл. | ···· | ···· | ···· | ···· | — |
| `grafik_vtr_codes` | вкл. | ···· | ···· | ···· | ···· | — |
| `grafik_vtr_seasons` | вкл. | ···· | ···· | ···· | ···· | — |
| `kasa_documents` | вкл. | SIU· | SIU· | SIUD | ···· | anon_all_docs → ALL → anon |
| `kasa_glavna` | вкл. | SIU· | SIU· | SIUD | ···· | anon_all_glavna → ALL → anon |
| `kasa_reports` | вкл. | SIU· | SIU· | SIUD | ···· | anon_all_kasa → ALL → anon |
| `kasa_storno` | вкл. | SIUD | SIUD | SIUD | SIUD | anon_all_storno → ALL → public |
| `kasa_storno_items` | вкл. | SIUD | SIUD | SIUD | SIUD | anon_all_storno_items → ALL → public |
| `kasa_zoborot` | вкл. | SIU· | SIU· | SIUD | ···· | anon_all_zoborot → ALL → anon |
| `loading_items_bak_20261030_shumen` | вкл. | ···· | ···· | ···· | ···· | — |
| `loading_items_bak_20261102_dupnica` | вкл. | ···· | ···· | ···· | ···· | — |
| `loading_list_items` | вкл. | SIUD | SIUD | SIUD | ···· | anon_all_loading_list_items → ALL → anon |
| `loading_list_photos` | вкл. | SIUD | SIUD | SIUD | ···· | anon_all_loading_list_photos → ALL → anon |
| `loading_list_products` | вкл. | SIUD | SIUD | SIUD | ···· | anon_all_loading_list_products → ALL → anon |
| `loading_lists` | вкл. | SIU· | SIU· | SIUD | ···· | anon_all_loading_lists → ALL → anon |
| `minus_movements` | вкл. | SIU· | SIU· | SIU· | ···· | minus_movements_insert → INSERT → anon; minus_movements_select → SELECT → anon; minus_movements_update → UPDATE → anon |
| `minus_plants` | вкл. | SIU· | SIU· | SIU· | ···· | minus_plants_insert → INSERT → anon; minus_plants_select → SELECT → anon; minus_plants_update → UPDATE → anon |
| `minus_reasons` | вкл. | SIU· | SIU· | SIU· | ···· | minus_reasons_insert → INSERT → anon; minus_reasons_select → SELECT → anon; minus_reasons_update → UPDATE → anon |
| `minus_uom_thresholds` | вкл. | SIU· | SIU· | SIU· | ···· | minus_uom_thresholds_insert → INSERT → anon; minus_uom_thresholds_select → SELECT → anon; minus_uom_thresholds_update → UPDATE → anon |
| `minus_uploads` | вкл. | SIU· | SIU· | SIU· | ···· | minus_uploads_insert → INSERT → anon; minus_uploads_select → SELECT → anon; minus_uploads_update → UPDATE → anon |
| `notification_log` | **изкл.** | SIU· | SIU· | ···· | ···· | — |
| `notification_matrix` | **изкл.** | SIUD | SIUD | ···· | ···· | — |
| `notification_overrides` | **изкл.** | SIUD | SIUD | ···· | ···· | — |
| `notification_schedules` | **изкл.** | SIUD | SIUD | ···· | ···· | — |
| `notification_topics` | **изкл.** | SIU· | SIU· | ···· | ···· | — |
| `order_restrictions` | **изкл.** | SIUD | SIUD | ···· | ···· | — |
| `picking_batches` | вкл. | SIUD | SIUD | SIUD | ···· | picking_batches_delete → DELETE → anon; picking_batches_insert → INSERT → anon; picking_batches_select → SELECT → anon; picking_batches_update → UPDATE → anon |
| `picking_lines` | вкл. | SIU· | SIU· | SIU· | ···· | picking_lines_insert → INSERT → anon; picking_lines_select → SELECT → anon; picking_lines_update → UPDATE → anon |
| `picking_pallet_items` | вкл. | SIUD | SIUD | SIUD | ···· | picking_pallet_items_delete → DELETE → anon; picking_pallet_items_insert → INSERT → anon; picking_pallet_items_select → SELECT → anon; picking_pallet_items_update → UPDATE → anon |
| `picking_pallets` | вкл. | SIUD | SIUD | SIUD | ···· | picking_pallets_delete → DELETE → anon; picking_pallets_insert → INSERT → anon; picking_pallets_select → SELECT → anon; picking_pallets_update → UPDATE → anon |
| `picking_shipments` | вкл. | SIUD | SIUD | SIUD | ···· | picking_shipments_delete → DELETE → anon; picking_shipments_insert → INSERT → anon; picking_shipments_select → SELECT → anon; picking_shipments_update → UPDATE → anon |
| `product_catalog` | **изкл.** | SIUD | SIUD | ···· | ···· | — |
| `recipients` | вкл. | SIU· | SIU· | SIUD | SIUD | allow all → ALL → public; public read → SELECT → public; public write → ALL → public |
| `recurring_task_periods` | вкл. | SIUD | SIUD | SIUD | ···· | Allow delete recurring_task_periods → DELETE → anon; Allow insert recurring_task_periods → INSERT → anon; Allow select recurring_task_periods → SELECT → anon; Allow update recurring_task_periods → UPDATE → anon |
| `recurring_task_skips` | вкл. | SIUD | SIUD | SIUD | ···· | Allow delete recurring_task_skips → DELETE → anon; Allow insert recurring_task_skips → INSERT → anon; Allow select recurring_task_skips → SELECT → anon; Allow update recurring_task_skips → UPDATE → anon |
| `recurring_task_versions` | вкл. | SIUD | SIUD | SIUD | ···· | Allow delete recurring_task_versions → DELETE → anon; Allow insert recurring_task_versions → INSERT → anon; Allow select recurring_task_versions → SELECT → anon; Allow update recurring_task_versions → UPDATE → anon |
| `recurring_tasks` | вкл. | SIUD | SIUD | SIUD | ···· | Allow delete recurring_tasks → DELETE → anon; Allow insert recurring_tasks → INSERT → anon; Allow select recurring_tasks → SELECT → anon; Allow update recurring_tasks → UPDATE → anon |
| `report_recipients` | **изкл.** | SIUD | SIUD | ···· | ···· | — |
| `report_snapshots` | вкл. | SIU· | SIU· | SIUD | ···· | anon_all_report_snapshots → ALL → anon |
| `revaluation_campaigns` | вкл. | SIUD | SIUD | SIUD | ···· | revaluation_campaigns_delete → DELETE → anon; revaluation_campaigns_insert → INSERT → anon; revaluation_campaigns_select → SELECT → anon; revaluation_campaigns_update → UPDATE → anon |
| `revaluation_codes` | вкл. | SIU· | SIU· | SIU· | ···· | revaluation_codes_insert → INSERT → anon; revaluation_codes_select → SELECT → anon; revaluation_codes_update → UPDATE → anon |
| `revaluation_items` | вкл. | SIUD | SIUD | SIUD | ···· | revaluation_items_delete → DELETE → anon; revaluation_items_insert → INSERT → anon; revaluation_items_select → SELECT → anon; revaluation_items_update → UPDATE → anon |
| `revaluation_submissions` | вкл. | SIU· | SIU· | SIU· | ···· | revaluation_submissions_insert → INSERT → anon; revaluation_submissions_select → SELECT → anon; revaluation_submissions_update → UPDATE → anon |
| `revision_schedule` | вкл. | SIUD | SIUD | SIUD | ···· | revision_schedule_delete → DELETE → anon; revision_schedule_insert → INSERT → anon; revision_schedule_select → SELECT → anon; revision_schedule_update → UPDATE → anon |
| `route_templates` | вкл. | SIU· | SIU· | SIUD | ···· | anon_all_routes_tmpl → ALL → anon |
| `stock_diff_swaps` | **изкл.** | SIUD | SIUD | SIUD | ···· | anon_all_sd_swaps → ALL → anon |
| `stock_differences` | **изкл.** | SIUD | SIUD | SIUD | ···· | anon_all_sd → ALL → anon |
| `stock_returns` | вкл. | SIUD | SIUD | SIUD | ···· | anon_all_sr → ALL → anon |
| `storage_files_index` (изглед) | — | SIUD | SIUD | — | — | — |
| `stores` | вкл. | SIUD | SIUD | SI·D | ···· | anon_delete_stores → DELETE → anon; anon_read_stores → SELECT → anon; anon_write_stores → INSERT → anon |
| `storno_note_replies` | вкл. | SIU· | SIU· | SIU· | ···· | storno_note_replies_insert → INSERT → anon; storno_note_replies_select → SELECT → anon; storno_note_replies_update → UPDATE → anon |
| `storno_notes` | вкл. | SIUD | SIUD | SIUD | ···· | storno_notes_delete → DELETE → anon; storno_notes_insert → INSERT → anon; storno_notes_select → SELECT → anon; storno_notes_update → UPDATE → anon |
| `subtask_completions` | вкл. | SIUD | SIUD | SIUD | ···· | anon_all_subtask_completions → ALL → anon |
| `supply_entries` | вкл. | SIU· | SIU· | SIU· | ···· | supply_entries_insert → INSERT → anon; supply_entries_select → SELECT → anon; supply_entries_update → UPDATE → anon |
| `supply_no_need` | вкл. | SIUD | SIUD | SI·D | ···· | supply_no_need_delete → DELETE → anon; supply_no_need_insert → INSERT → anon; supply_no_need_select → SELECT → anon |
| `supply_store_notes` | вкл. | SIU· | SIU· | SIU· | ···· | supply_store_notes_insert → INSERT → anon; supply_store_notes_select → SELECT → anon; supply_store_notes_update → UPDATE → anon |
| `supply_template_items` | вкл. | SIU· | SIU· | S··· | ···· | supply_template_items_select → SELECT → anon |
| `supply_templates` | вкл. | SIU· | SIU· | S··· | ···· | supply_templates_select → SELECT → anon |
| `task_completions` | вкл. | SIUD | SIUD | SIUD | ···· | anon_all_completions → ALL → anon |
| `task_subtasks` | вкл. | SIUD | SIUD | SIUD | ···· | anon_all_subtasks → ALL → anon |
| `transfer_cargo` | вкл. | SIUD | SIUD | SIUD | ···· | anon_all_transfer_cargo → ALL → anon |
| `transfer_cargo_events` | вкл. | SIU· | SIU· | SIUD | ···· | anon_all_transfer_cargo_events → ALL → anon |
| `transfer_counters` | вкл. | S··· | S··· | S··· | ···· | anon_select_transfer_counters → SELECT → anon |
| `transfers` | вкл. | SIUD | SIUD | SIUD | ···· | anon_all_transfers → ALL → anon |
| `transport_orders` | вкл. | SIUD | SIUD | SIUD | ···· | anon_all_transport → ALL → anon |
| `transport_pallets` | вкл. | SIU· | SIU· | SIUD | SIUD | anon_all_pallets → ALL → public |
| `users` | **изкл.** | ···· | ···· | S·U· | ···· | anon_select_users → SELECT → anon; anon_update_users → UPDATE → anon |
| `warranty_brands` | **изкл.** | SIUD | SIUD | ···· | ···· | — |
| `warranty_cards` | **изкл.** | SIU· | SIU· | ···· | ···· | — |
| `warranty_entries` | **изкл.** | SIUD | SIUD | ···· | ···· | — |
| `warranty_service_locations` | **изкл.** | SIU· | SIU· | ···· | ···· | — |
| `warranty_subcategories` | **изкл.** | SIUD | SIUD | ···· | ···· | — |
| `warranty_templates` | **изкл.** | SIU· | SIU· | ···· | ···· | — |
| `weekly_checklist` | вкл. | SIU· | SIU· | SIUD | SIUD | anon_all_weekly_checklist → ALL → public |
| `weekly_checklist_freezes` | вкл. | S··· | S··· | S··· | S··· | weekly_checklist_freezes_select → SELECT → anon,authenticated |
| `weekly_checklist_metrics` | вкл. | SIU· | SIU· | SIUD | SIUD | anon_all_weekly_checklist_metrics → ALL → public |
| `weekly_checklist_responses` | вкл. | SIU· | SIU· | SIU· | ···· | weekly_checklist_responses_insert → INSERT → anon; weekly_checklist_responses_select → SELECT → anon; weekly_checklist_responses_update → UPDATE → anon |
| `weekly_checklist_sends` | вкл. | SIU· | SIU· | SIUD | SIUD | anon_all_weekly_checklist_sends → ALL → public |

### 2а. Съществува за anon, НО НЕ и за authenticated

Grants: **няма разлика** — anon и authenticated имат едни и същи права на всяка
таблица и изглед. Разликите са в политиките (само таблици с включено RLS):

- `app_settings`: политика само за anon: S
- `audit_log`: политика само за anon: I
- `backup_log`: политика само за anon: SI
- `backup_snapshots`: политика само за anon: SI
- `bulletin_tasks`: политика само за anon: SIUD
- `bulletins`: политика само за anon: SIUD
- `bus_routes`: политика само за anon: SIUD
- `client_orders`: политика само за anon: SIUD
- `companies`: политика само за anon: S
- `contacts`: политика само за anon: SIUD
- `documents`: политика само за anon: SIUD
- `goods_transit`: политика само за anon: SIUD
- `kasa_documents`: политика само за anon: SIUD
- `kasa_glavna`: политика само за anon: SIUD
- `kasa_reports`: политика само за anon: SIUD
- `kasa_zoborot`: политика само за anon: SIUD
- `loading_list_items`: политика само за anon: SIUD
- `loading_list_photos`: политика само за anon: SIUD
- `loading_list_products`: политика само за anon: SIUD
- `loading_lists`: политика само за anon: SIUD
- `minus_movements`: политика само за anon: SIU
- `minus_plants`: политика само за anon: SIU
- `minus_reasons`: политика само за anon: SIU
- `minus_uom_thresholds`: политика само за anon: SIU
- `minus_uploads`: политика само за anon: SIU
- `picking_batches`: политика само за anon: SIUD
- `picking_lines`: политика само за anon: SIU
- `picking_pallet_items`: политика само за anon: SIUD
- `picking_pallets`: политика само за anon: SIUD
- `picking_shipments`: политика само за anon: SIUD
- `recurring_task_periods`: политика само за anon: SIUD
- `recurring_task_skips`: политика само за anon: SIUD
- `recurring_task_versions`: политика само за anon: SIUD
- `recurring_tasks`: политика само за anon: SIUD
- `report_snapshots`: политика само за anon: SIUD
- `revaluation_campaigns`: политика само за anon: SIUD
- `revaluation_codes`: политика само за anon: SIU
- `revaluation_items`: политика само за anon: SIUD
- `revaluation_submissions`: политика само за anon: SIU
- `revision_schedule`: политика само за anon: SIUD
- `route_templates`: политика само за anon: SIUD
- `stock_returns`: политика само за anon: SIUD
- `stores`: политика само за anon: SID
- `storno_note_replies`: политика само за anon: SIU
- `storno_notes`: политика само за anon: SIUD
- `subtask_completions`: политика само за anon: SIUD
- `supply_entries`: политика само за anon: SIU
- `supply_no_need`: политика само за anon: SID
- `supply_store_notes`: политика само за anon: SIU
- `supply_template_items`: политика само за anon: S
- `supply_templates`: политика само за anon: S
- `task_completions`: политика само за anon: SIUD
- `task_subtasks`: политика само за anon: SIUD
- `transfer_cargo`: политика само за anon: SIUD
- `transfer_cargo_events`: политика само за anon: SIUD
- `transfer_counters`: политика само за anon: S
- `transfers`: политика само за anon: SIUD
- `transport_orders`: политика само за anon: SIUD
- `weekly_checklist_responses`: политика само за anon: SIU

### 2б. Функции в `public`

| Функция | DEFINER | volatile | anon | authenticated | ACL с PUBLIC |
|---|---|---|---|---|---|
| `assign_client_order_num()` | — | v | X | X | да |
| `assign_transfer_num()` | да | v | · | · | — |
| `bulletin_tasks_transit_sync_trg()` | да | v | · | · | — |
| `checklist_freeze_week(p_year integer, p_week integer, p_by text)` | да | v | · | · | — |
| `checklist_portal_values(p_year integer, p_week integer)` | — | s | X | X | — |
| `contacts_touch_updated_at()` | — | v | X | X | да |
| `goods_transit_sync_trg()` | да | v | · | · | — |
| `kasa_reports_strip_dash_trg()` | — | v | X | X | да |
| `keep_transfer_num()` | — | v | · | · | — |
| `pallets_store_done(p_store text, p_monday date, p_due date, p_deadline timestamp with time zone)` | да | s | · | · | — |
| `pallets_sync_completions(p_store text, p_today date)` | да | v | · | · | — |
| `pallets_sync_trg()` | да | v | · | · | — |
| `pallets_task_for_week(p_monday date)` | да | s | · | · | — |
| `perform_daily_backup(p_type text, p_by text)` | да | v | · | · | — |
| `recurring_tasks_refresh_active()` | — | v | · | · | — |
| `report_cron_schedule()` | да | s | X | X | — |
| `report_excluded_stores()` | — | s | X | X | да |
| `stock_diff_store_done(p_store text)` | да | s | · | · | — |
| `stock_diff_sync_completions(p_store text, p_today date)` | да | v | · | · | — |
| `stock_diff_sync_lines_trg()` | да | v | · | · | — |
| `stock_diff_sync_reports_trg()` | да | v | · | · | — |
| `stock_diff_sync_swaps_trg()` | да | v | · | · | — |
| `stock_diff_task_for_week(p_monday date)` | да | s | · | · | — |
| `stock_returns_store_done(p_store text, p_from date, p_upto date, p_source text, p_due date)` | да | s | · | · | — |
| `stock_returns_strip_dash_trg()` | — | v | X | X | да |
| `stock_returns_sync_completions(p_store text, p_today date)` | да | v | · | · | — |
| `stock_returns_sync_trg()` | да | v | · | · | — |
| `stock_returns_tasks_for_week(p_monday date)` | да | s | · | · | — |
| `strip_leading_dash(x text)` | — | i | X | X | да |
| `supply_no_need_trg()` | да | v | · | · | — |
| `supply_store_done(p_store text, p_monday date)` | да | s | · | · | — |
| `supply_sync_completions(p_store text, p_today date)` | да | v | · | · | — |
| `supply_sync_entries_trg()` | да | v | · | · | — |
| `supply_task_for_week(p_monday date)` | да | s | · | · | — |
| `transit_mark_empty_stores()` | да | v | · | · | — |
| `transit_store_done(p_store text)` | да | s | · | · | — |
| `transit_store_done_since(p_store text, p_since date)` | да | s | · | · | — |
| `transit_sync_completions(p_store text)` | да | v | · | · | — |

## 3. Кой ползва какво

### 3а. Порталът

От статичен анализ на всички root `*.js` (`sbGet` / `sbGetOk` / `sbGetAll` /
`sbPost` / `sbPostReturn` / `sbPatch` / `sbDelete` / `reportGetAll` / `fetch`):
81 таблици, 2 rpc, 8 едж функции, 4 bucket-а; таблица като променлива — 10
места, всички проследени. Таблици в `public`, които порталът **не** ползва:
`backup_log`, `backup_snapshots`, `client_order_counters`, `companies`,
`completions`, `notification_log`, `recipients`, `transfer_counters`,
`warranty_cards`, 11-те `grafik_*` (само през `grafik-api`) и двете резервни
`loading_items_bak_*`.

#### Инвентар: достъп до базата от браузъра (Tmax-store-portal)

Източник: worktree `wt-etap2-inventar`, HEAD `a48a2bb4f77d350fbd2a3c4432abf2ebb392cd67`. Прегледани са всички 36 root `*.js` файла (вкл. `sw.js`, `OneSignalSDK*.js`) и `index.html` / `manifest.json`. Без `node_modules`, `tests/`, `.claude/`, `supabase/`.

Метод: собствен лексер (низове, коментари, регекси, баланс на скоби — всички файлове затварят на дълбочина 0) намира всяко извикване на `sbGet/sbGetOk/sbGetAll/sbPost/sbPostReturn/sbPatch/sbDelete`, `reportGetAll` (report.js — страниране през `sbGetOk`) и `fetch(`. Брой срещу текстов grep — съвпада (разликите са само дефиниции и коментари). Двата `fetch` вътре в низове (печатен HTML) са добавени ръчно. Вътрешните `fetch` на самите помощници в `shared.js:25–162`, `sbGetAll`→`sbGetOk` (`shared.js:68`) и `reportGetAll`→`sbGetOk` (`report.js:1896`) не са броени отделно — броят се извикващите.

Суров списък (по едно извикване на ред; при променлива таблица — по ред за всяка възможна стойност): `portal_calls.tsv` (734 реда таблици + 2 rpc + 9 edge + 27 storage).

Обобщение: **81 таблици, 2 rpc, 8 едж функции (9 извиквания), 4 bucket-а в Storage (27 извиквания), 0 четения от базата преди вход.**

Колона „Модули“ = кой модул/таб ползва файла (`shared.js`, `push.js`, `email.js`, `notifications.js`, `report.js` са общи — тръгват от няколко таба или след вход за всички).

##### Таблици и rpc (обобщено)

###### Таблици (81)

| Таблица | Файлове | Операции | Модули |
|---|---|---|---|
| `app_settings` | grafik.js, loading.js, minusi.js, pallets.js, picking.js, report.js, revaluation.js, shared.js, transfers.js | sbGet, sbGetOk | График; Днес / отчети (report.js); Минуси; Общо (shared: вход, статус/корекция Транспорт/Клиентски, каталог, доставчици); Палети (Транспорт); Пикинг (Транспорт); Преоценка; Товарни листи (Транспорт); Трансфери (Транспорт) |
| `audit_log` | shared.js, stock-differences.js | sbPost | Общо (shared: вход, статус/корекция Транспорт/Клиентски, каталог, доставчици); Разлики |
| `bulletin_promotions` | admin.js, bulletin.js | sbGet, sbPatch, sbPost | Администрация; Бюлетин |
| `bulletin_tasks` | admin.js, bulletin.js, notifications.js, report.js, shared.js, today.js | fetch PATCH, sbDelete, sbGet, sbPatch, sbPostReturn | Администрация; Бюлетин; Днес; Днес / отчети (report.js); Общо (shared: вход, статус/корекция Транспорт/Клиентски, каталог, доставчици); Общо (баджове/известия) |
| `bulletins` | bulletin.js, email.js, notifications.js, report.js, today.js | sbGet, sbPatch, sbPost | Бюлетин; Днес; Днес / отчети (report.js); Общо (баджове/известия); Общо (имейл) |
| `bus_routes` | calendar.js | sbDelete, sbGet, sbPost | Календар |
| `client_orders` | calendar.js, client-orders.js, history.js, minusi.js, notifications.js, report.js, shared.js, transfers.js | sbDelete, sbGet, sbGetAll, sbGetOk, sbPatch, sbPostReturn | Днес / отчети (report.js); История; Календар; Клиентски заявки; Минуси; Общо (shared: вход, статус/корекция Транспорт/Клиентски, каталог, доставчици); Общо (баджове/известия); Трансфери (Транспорт) |
| `contact_topics` | contacts.js | sbDelete, sbGet, sbPatch, sbPost | Контакти |
| `contacts` | contacts.js, shared.js, stock-differences.js | fetch GET, sbDelete, sbGet, sbPatch, sbPost | Контакти; Общо (shared: вход, статус/корекция Транспорт/Клиентски, каталог, доставчици); Разлики |
| `daily_turnover` | daily-turnover.js | sbGet, sbPatch, sbPost | Каса (Вечерен оборот) |
| `differences_reports` | checklist.js, report.js, stock-differences.js | fetch GET, sbDelete, sbGet, sbGetOk(reportGetAll), sbPatch, sbPost | Днес / отчети (report.js); Разлики; Чек лист |
| `documents` | docs.js | sbDelete, sbGet, sbPost | Инструкции |
| `goods_transit` | bulletin.js, checklist.js, loading.js, minusi.js, report.js, transit.js | fetch GET, fetch POST, sbDelete, sbGet, sbGetAll, sbGetOk(reportGetAll), sbPatch, sbPostReturn | Бюлетин; Днес / отчети (report.js); Минуси; Стока на път; Товарни листи (Транспорт); Чек лист |
| `kasa_documents` | history.js, kasa-docs.js, kasa.js | sbGet, sbGetAll, sbPost | История; Каса |
| `kasa_glavna` | history.js, kasa-docs.js, kasa.js | sbGet, sbGetAll, sbPatch, sbPost | История; Каса |
| `kasa_reports` | history.js, kasa-docs.js, kasa.js, notifications.js, report.js | sbGet, sbGetAll, sbGetOk, sbPatch, sbPost | Днес / отчети (report.js); История; Каса; Общо (баджове/известия) |
| `kasa_storno` | history.js, kasa.js, notifications.js, report.js | sbDelete, sbGet, sbGetAll, sbGetOk(reportGetAll), sbPatch, sbPost | Днес / отчети (report.js); История; Каса; Общо (баджове/известия) |
| `kasa_storno_items` | kasa.js | sbDelete, sbGet, sbPost | Каса |
| `kasa_zoborot` | history.js, kasa-docs.js, kasa.js, report.js | fetch PATCH, sbGet, sbGetAll, sbPatch, sbPost | Днес / отчети (report.js); История; Каса |
| `loading_list_items` | loading.js, notifications.js, transfers.js | fetch PATCH, sbDelete, sbGet, sbGetAll, sbPatch, sbPost, sbPostReturn | Общо (баджове/известия); Товарни листи (Транспорт); Трансфери (Транспорт) |
| `loading_list_photos` | loading.js | sbDelete, sbGetAll, sbPost | Товарни листи (Транспорт) |
| `loading_list_products` | loading.js | sbDelete, sbPost, sbPostReturn | Товарни листи (Транспорт) |
| `loading_lists` | loading.js, notifications.js, transfers.js | sbGet, sbPatch, sbPostReturn | Общо (баджове/известия); Товарни листи (Транспорт); Трансфери (Транспорт) |
| `minus_movements` | minusi.js, report.js | fetch POST, sbGetAll, sbGetOk(reportGetAll), sbPatch | Днес / отчети (report.js); Минуси |
| `minus_plants` | minusi.js, revaluation.js | sbGetOk | Минуси; Преоценка |
| `minus_reasons` | minusi.js, report.js | sbGetOk, sbGetOk(reportGetAll) | Днес / отчети (report.js); Минуси |
| `minus_uom_thresholds` | minusi.js | sbGetOk | Минуси |
| `minus_uploads` | minusi.js | sbGetOk, sbPatch, sbPostReturn | Минуси |
| `notification_matrix` | admin.js | sbDelete, sbGet, sbPatch, sbPost | Администрация |
| `notification_overrides` | admin.js | sbDelete, sbGet, sbPost | Администрация |
| `notification_schedules` | admin.js, bulletin.js | sbDelete, sbGet, sbPatch, sbPost | Администрация; Бюлетин |
| `notification_topics` | admin.js | sbGet, sbPatch | Администрация |
| `order_restrictions` | admin.js, shared.js | sbDelete, sbGet, sbPatch, sbPost | Администрация; Общо (shared: вход, статус/корекция Транспорт/Клиентски, каталог, доставчици) |
| `picking_batches` | picking.js | sbDelete, sbGetOk, sbPatch, sbPostReturn | Пикинг (Транспорт) |
| `picking_lines` | picking.js | fetch POST, sbGetAll, sbPatch | Пикинг (Транспорт) |
| `picking_pallet_items` | picking.js | sbDelete, sbGetAll, sbPatch, sbPostReturn | Пикинг (Транспорт) |
| `picking_pallets` | picking.js | sbDelete, sbGetAll, sbGetOk, sbPatch, sbPostReturn | Пикинг (Транспорт) |
| `picking_shipments` | picking.js | sbDelete, sbGetOk, sbPatch, sbPostReturn | Пикинг (Транспорт) |
| `product_catalog` | admin.js, kasa.js, loading.js, revaluation.js, shared.js | fetch GET, fetch HEAD, fetch POST, sbDelete, sbGet, sbGetOk | Администрация; Каса; Общо (shared: вход, статус/корекция Транспорт/Клиентски, каталог, доставчици); Преоценка; Товарни листи (Транспорт) |
| `recurring_task_periods` | bulletin.js, checklist.js, report.js, shared.js | sbDelete, sbGet, sbPatch, sbPost | Бюлетин; Днес / отчети (report.js); Общо (shared: вход, статус/корекция Транспорт/Клиентски, каталог, доставчици); Чек лист |
| `recurring_task_skips` | bulletin.js, report.js, shared.js | sbDelete, sbGet, sbPost | Бюлетин; Днес / отчети (report.js); Общо (shared: вход, статус/корекция Транспорт/Клиентски, каталог, доставчици) |
| `recurring_task_versions` | bulletin.js, checklist.js, shared.js | sbDelete, sbGet, sbPatch, sbPost | Бюлетин; Общо (shared: вход, статус/корекция Транспорт/Клиентски, каталог, доставчици); Чек лист |
| `recurring_tasks` | admin.js, bulletin.js, checklist.js, notifications.js, report.js, shared.js, stock-returns.js, today.js | sbDelete, sbGet, sbPatch, sbPostReturn | Администрация; Бюлетин; Днес; Днес / отчети (report.js); За връщане; Общо (shared: вход, статус/корекция Транспорт/Клиентски, каталог, доставчици); Общо (баджове/известия); Чек лист |
| `report_recipients` | report.js | sbDelete, sbGet, sbPatch, sbPost | Днес / отчети (report.js) |
| `report_snapshots` | report.js, today.js | sbGet, sbPatch, sbPost | Днес; Днес / отчети (report.js) |
| `revaluation_campaigns` | revaluation.js | sbDelete, sbGet, sbPatch, sbPost | Преоценка |
| `revaluation_codes` | revaluation.js | sbGetAll, sbPost | Преоценка |
| `revaluation_items` | revaluation.js | sbDelete, sbGet, sbGetAll, sbPatch, sbPostReturn | Преоценка |
| `revaluation_submissions` | revaluation.js | sbGet, sbGetAll, sbGetOk, sbPatch, sbPostReturn | Преоценка |
| `revision_schedule` | revisions.js | sbDelete, sbGetOk, sbPatch, sbPostReturn | Ревизии (график) |
| `route_templates` | calendar.js | sbGet, sbPatch, sbPost | Календар |
| `stock_diff_swaps` | bulletin.js, stock-differences.js | sbDelete, sbGet, sbGetOk, sbPatch, sbPostReturn | Бюлетин; Разлики |
| `stock_differences` | bulletin.js, checklist.js, minusi.js, report.js, stock-differences.js, stock-returns.js | fetch GET, fetch POST, sbDelete, sbGet, sbGetAll, sbGetOk, sbGetOk(reportGetAll), sbPatch, sbPost, sbPostReturn | Бюлетин; Днес / отчети (report.js); За връщане; Минуси; Разлики; Чек лист |
| `stock_returns` | bulletin.js, checklist.js, report.js, stock-differences.js, stock-returns.js | fetch GET, sbDelete, sbGet, sbGetAll, sbGetOk, sbGetOk(reportGetAll), sbPatch, sbPost | Бюлетин; Днес / отчети (report.js); За връщане; Разлики; Чек лист |
| `stores` | admin.js, history.js, kasa-docs.js, revaluation.js, shared.js, transport.js | sbDelete, sbGet, sbPost | Администрация; История; Каса; Общо (shared: вход, статус/корекция Транспорт/Клиентски, каталог, доставчици); Преоценка; Транспорт |
| `storno_note_replies` | stock-differences.js | sbGetOk, sbPatch, sbPostReturn | Разлики |
| `storno_notes` | stock-differences.js | sbDelete, sbGetOk, sbPatch, sbPostReturn | Разлики |
| `subtask_completions` | bulletin.js | sbDelete, sbGet, sbPost | Бюлетин |
| `supply_entries` | bulletin.js, supply.js | fetch GET, sbGet, sbPatch, sbPost | Бюлетин; Снабдяване (Транспорт) |
| `supply_no_need` | bulletin.js, supply.js | fetch GET, sbDelete, sbGet, sbPost | Бюлетин; Снабдяване (Транспорт) |
| `supply_store_notes` | supply.js | fetch GET, fetch POST, sbGet | Снабдяване (Транспорт) |
| `supply_template_items` | supply.js | sbGet | Снабдяване (Транспорт) |
| `supply_templates` | bulletin.js, supply.js | sbGet | Бюлетин; Снабдяване (Транспорт) |
| `task_completions` | bulletin.js, checklist.js, notifications.js, report.js, shared.js, today.js | fetch GET, sbDelete, sbGet, sbPatch, sbPost | Бюлетин; Днес; Днес / отчети (report.js); Общо (shared: вход, статус/корекция Транспорт/Клиентски, каталог, доставчици); Общо (баджове/известия); Чек лист |
| `task_subtasks` | admin.js, bulletin.js | sbDelete, sbGet, sbPatch, sbPost | Администрация; Бюлетин |
| `transfer_cargo` | notifications.js, report.js, transfers.js | sbDelete, sbGet, sbPost | Днес / отчети (report.js); Общо (баджове/известия); Трансфери (Транспорт) |
| `transfer_cargo_events` | notifications.js, report.js, transfers.js | sbGet, sbPost, sbPostReturn | Днес / отчети (report.js); Общо (баджове/известия); Трансфери (Транспорт) |
| `transfers` | notifications.js, report.js, transfers.js | sbDelete, sbGet, sbPatch, sbPostReturn | Днес / отчети (report.js); Общо (баджове/известия); Трансфери (Транспорт) |
| `transport_orders` | calendar.js, client-orders.js, history.js, notifications.js, report.js, shared.js, transfers.js, transport.js | sbDelete, sbGet, sbGetAll, sbPatch, sbPost | Днес / отчети (report.js); История; Календар; Клиентски заявки; Общо (shared: вход, статус/корекция Транспорт/Клиентски, каталог, доставчици); Общо (баджове/известия); Транспорт; Трансфери (Транспорт) |
| `transport_pallets` | pallets.js, report.js | sbGet, sbPatch, sbPost | Днес / отчети (report.js); Палети (Транспорт) |
| `users` | admin.js, bulletin.js, calendar.js, checklist.js, email.js, loading.js, pallets.js, picking.js, report.js, revaluation.js, shared.js, stock-differences.js, stock-returns.js, today.js | sbGet, sbGetOk | Администрация; Бюлетин; Днес; Днес / отчети (report.js); За връщане; Календар; Общо (shared: вход, статус/корекция Транспорт/Клиентски, каталог, доставчици); Общо (имейл); Палети (Транспорт); Пикинг (Транспорт); Преоценка; Разлики; Товарни листи (Транспорт); Чек лист |
| `warranty_brands` | reference.js | sbDelete, sbGet, sbPatch, sbPost | Рекламации/Справочник |
| `warranty_entries` | reference.js | sbDelete, sbGet, sbPatch, sbPost | Рекламации/Справочник |
| `warranty_service_locations` | reference.js | sbGet, sbPatch, sbPost | Рекламации/Справочник |
| `warranty_subcategories` | reference.js | sbDelete, sbGet, sbPatch, sbPost | Рекламации/Справочник |
| `warranty_templates` | reference.js | sbGet, sbPatch | Рекламации/Справочник |
| `weekly_checklist` | checklist.js, report.js | fetch GET, fetch POST, sbGet, sbGetOk(reportGetAll) | Днес / отчети (report.js); Чек лист |
| `weekly_checklist_freezes` | checklist.js | sbGet | Чек лист |
| `weekly_checklist_metrics` | checklist.js, report.js | sbGet | Днес / отчети (report.js); Чек лист |
| `weekly_checklist_responses` | checklist.js, report.js | fetch POST, sbGet, sbGetOk | Днес / отчети (report.js); Чек лист |
| `weekly_checklist_sends` | checklist.js, report.js | sbGet, sbGetOk, sbPost | Днес / отчети (report.js); Чек лист |

###### RPC (2)

| RPC | Файлове | Операции | Модули |
|---|---|---|---|
| `rpc/checklist_portal_values` | checklist.js | sbGetOk | Чек лист |
| `rpc/report_cron_schedule` | admin.js | sbGet | Администрация |

Файлове без нито едно извикване към базата: `handbook.js` (съдържанието е вградено), `grafik-engine.js` (чисти изчисления), `OneSignalSDKWorker.js` / `OneSignalSDKUpdaterWorker.js` (само `importScripts` от cdn.onesignal.com), `sw.js` (виж „Преди вход“).

Бележки по операциите:
- `fetch POST` към `weekly_checklist`, `weekly_checklist_responses`, `goods_transit` (transit.js:1761), `supply_store_notes` (supply.js:877) е upsert с `on_conflict` + `resolution=merge-duplicates`; към `minus_movements` (minusi.js:446) и `picking_lines` (picking.js:257) — `resolution=ignore-duplicates`.
- `fetch HEAD product_catalog` (admin.js:714) — само брой редове (`Prefer: count=exact`).
- `fetch PATCH loading_list_items` (loading.js:968) — PATCH с `approval_status=eq.pending` и `count=exact`.
- `users` се чете само със `sbGet`/`sbGetOk` (никъде запис от браузъра; записите минават през едж `admin-users`).

##### Едж функции от браузъра

| Едж функция | Извиквания (файл:ред `функция`) |
|---|---|
| `admin-users` | admin.js:563 `adminUsers` |
| `auth-login` | shared.js:1649 `doLogin` |
| `auth-set-password` | admin.js:578 `setUserPassword`; shared.js:1972 `submitChangePassword` |
| `bulletin-notify` | push.js:231 `runNotifyTopic` |
| `grafik-api` | grafik.js:61 `grApi` |
| `portal-push` | push.js:37 `osSend` |
| `resend-email` | email.js:21 `sendEmail` |
| `send-scheduled-report` | report.js:4468 `sendMinusMultiReportNow` |

Всички извиквания са `POST`. `auth-login` (shared.js:1649) е единственото, което тръгва ПРЕДИ вход. `admin-users` и `grafik-api` пращат `currentSession` (пропуска от `auth-login`) в тялото. `push.js:25` дефинира `SB_NOTIFY_URL` към `resend-email`, но константата не се ползва никъде.

##### Storage от браузъра

Bucket-и: `bulletin-files` (Бюлетин, Разлики, За връщане, Товарни листи, Трансфери — споделен, с отделни префикси), `contacts`, `docs`, `kasa-docs`. Качването е `POST /storage/v1/object/<bucket>/<path>`; `kasa-docs` е частен — четене само през `POST /object/sign/kasa-docs/…` (signed URL). Останалите три се показват през публични URL-и `/storage/v1/object/public/<bucket>/…` (`BUL_PUB` bulletin.js:8, `SB_CPUB` contacts.js:16, и сглобени на място) — това са `<img src>`/линкове, не `fetch`, затова не са в таблицата; единственият `fetch` на публичен URL е stock-differences.js:5425.

| Bucket | Файл:ред | Функция | Операция |
|---|---|---|---|
| `bulletin-files` | bulletin.js:3436 | bulUploadBlockImage > onload | POST upload |
| `bulletin-files` | bulletin.js:3459 | bulUploadBlockFile > onload | POST upload |
| `bulletin-files` | bulletin.js:3687 | calUploadAttachment > onload | POST upload |
| `bulletin-files` | bulletin.js:3796 | bulUploadImg > onload | POST upload |
| `bulletin-files` | bulletin.js:3826 | bulUploadFile > onload | POST upload |
| `bulletin-files` | bulletin.js:4494 | recurringUploadAttachment > onload | POST upload |
| `bulletin-files` | bulletin.js:4717 | taskUploadAttachment > onload | POST upload |
| `bulletin-files` | bulletin.js:5722 | tcUpload > onload | POST upload |
| `bulletin-files` | bulletin.js:7771 | subtaskUploadAttachment > onload | POST upload |
| `bulletin-files` | loading.js:1469 | llUploadOnePhoto | POST upload |
| `bulletin-files` | stock-differences.js:1999 | sdDeleteReportFiles | DELETE object |
| `bulletin-files` | stock-differences.js:2303 | sdUploadLineAttachment > onload | POST upload |
| `bulletin-files` | stock-differences.js:2344 | sdUploadReportPhoto > onload | POST upload |
| `bulletin-files` | stock-differences.js:2380 | sdUploadAttachment > onload | POST upload |
| `bulletin-files` | stock-differences.js:4209 | diffUploadPhoto > onload | POST upload |
| `bulletin-files` | stock-differences.js:4566 | sdNoteUploadFile > onload | POST upload |
| `bulletin-files` | stock-differences.js:5425 | diffUrlToBase64 | GET public URL (снимки от записа, за прикачване към имейл) |
| `bulletin-files` | stock-returns.js:861 | srUploadPhoto > onload | POST upload |
| `bulletin-files` | transfers.js:2536 | tfEvUploadPhotos | POST upload |
| `contacts` | contacts.js:1280 | ctUploadOnePhoto | POST upload |
| `contacts` | contacts.js:1322 | uploadContactPhoto | POST upload |
| `docs` | docs.js:100 | uploadDocFile > onload | POST upload |
| `kasa-docs` | history.js:978 | previewKasaDoc | POST sign (signed URL) |
| `kasa-docs` | kasa-docs.js:15 | uploadKasaDoc > onload | POST upload |
| `kasa-docs` | kasa-docs.js:45 | getSignedUrl | POST sign (signed URL) |
| `kasa-docs` | kasa-docs.js:561 | (низ в печатния HTML) | POST sign (signed URL) |
| `kasa-docs` | kasa.js:1348 | (низ в печатния HTML: openDocFromPrint) | POST sign (signed URL) |

##### Преди вход

**Четения от базата преди вход: 0.** Нито една таблица/rpc не се чете, докато `currentUser` е `null`.

Доказателства:
- `shared.js:1995` — `document.addEventListener('DOMContentLoaded',initApp)`; `initApp()` (`shared.js:1638–1640`) е празна („Нищо не се зарежда автоматично — изчакваме логин“). Няма `window.onload` / друг `DOMContentLoaded` в root файловете.
- Код на най-горно ниво, който се изпълнява при зареждане: `setInterval(refreshToday,…)` и `visibilitychange` (`shared.js:1001–1002`) — само дата, без мрежа; IIFE в `handbook.js:373` (стилове + бутон на таба), `transit.js:235` (matchMedia слушател), `grafik-engine.js:11` (модул без DOM/мрежа); обвивките на `startApp` (`notifications.js:793`, `stock-differences.js:5984`) само пренаписват функцията — изпълняват се след вход. Делегирани `click` слушатели (`reference.js:173, 848`, `shared.js:1986–1993`) — без мрежа.
- Входният екран (`index.html:349+`, `#s-login`) има само `doLogin()` (onclick / Enter).
- Inline скриптовете в `index.html` (`:320` OneSignal init, `:785`, `:849` drag & drop на табове) не пипат Supabase; OneSignal говори само с onesignal.com.
- `sw.js` не се регистрира никъде (`serviceWorker.register` го няма в репото); а и неговият `fetch` слушател изрично пропуска `supabase.co` (`sw.js:54–58`). Регистрира се `OneSignalSDKWorker.js` (през OneSignal SDK, `index.html:325`) — само `importScripts` от CDN. `manifest.json` — без данни.

Мрежови заявки към Supabase ПРЕДИ вход (не са четения на таблица):
| Какво | Къде | Бележка |
|---|---|---|
| едж `auth-login` POST | `shared.js:1649` (`doLogin`) | имейл + парола в тялото |
| `audit_log` sbPost (запис, не четене) | `shared.js:1661` → `logAudit` → `shared.js:181` | само при неуспешен вход (`login_failed`, с въведения имейл); `currentUser` още е `null` |

Първите четения СЛЕД вход (в `startApp`, `shared.js:1735`, веднага щом `currentUser` е зададен на `shared.js:1664`): `users` (`rolesLoadRegional`, `shared.js:1717`), `app_settings` (`pkLoadUsers` picking.js:113, `grLoadUsers` grafik.js:48, `mnLoadStoresFlag` minusi.js:199, `rvLoadStoresFlag` revaluation.js:103), после `loadAll()` → Транспорт / Клиентски / Инструкции и стартовият таб.

##### Табове по роля

Роли в употреба (списъкът в админа, `admin.js:404`): `admin`, `accounting`, `logistics`, `manager`, `sklad`, `kasa`, `supply`, `marketing`, `info`, `user`, `controlling`. (`'store'`/`'out'` в кода са `store_role` на контакт и посока на заявка, не роли.) `isGlobal()` (`shared.js:193`) = admin, accounting, logistics — решава данни, не табове. Стартов таб: kasa→Каса, info→Клиентски, controlling→Преоценка, останалите→Транспорт (`shared.js:1747`).

Видимостта се задава в `setupTabsForRole()` (`shared.js:1770–1868`); табовете без условие са видими в `index.html` или се показват за всички.

| Таб / модул (id) | Кой го вижда | Условие в кода |
|---|---|---|
| Транспорт `tab-transport` (+ под-табове Палети `tps-pallets`, Снабдяване `tps-supply`, Товарни листи `tps-loading`, Трансфери `tps-transfers`) | всички роли | без условие (`index.html:376, 421–425`) |
| Пикинг `tps-picking` | само имейлите в `app_settings.picking_users` | `pkCanSee()` picking.js:103; скрит в shared.js:1842, `pkLoadUsers()` |
| Клиентски `tab-client` | всички | без условие (`index.html:377`) |
| Календар `tab-calendar` | всички | `display=''` shared.js:1801 |
| Бюлетин `tab-bulletin` | всички | без условие (`index.html:381`) |
| Стока на път `tab-transit` | всички | shared.js:1799 |
| За връщане `tab-stock-returns` | всички | shared.js:1803 |
| Разлики `tab-stock-diff` | всички | shared.js:1854 |
| Контакти `tab-contacts` | всички | shared.js:1795 |
| Рекламации/Справочник `tab-reference` | всички | shared.js:1797 |
| Инструкции `tab-docs` + Наръчник `tab-handbook` | всички | без условие; `.adm` бутони само admin, accounting (`admRoles`, shared.js:1863) |
| Ревизии и преоценка `tab-revaluation` (график `rvs-schedule`) | admin, accounting, supply, manager, sklad, controlling | `rsCanSee()` revisions.js:24, shared.js:1812 |
| └ Преоценка `rvs-revaluation` | admin, accounting, supply, controlling; manager/sklad само ако обектът е в `app_settings.revaluation_stores` (или `on`) | `rvCanSee()` revaluation.js:87, shared.js:1819 |
| └ Минуси `rvs-minusi` | admin, accounting, controlling; manager/sklad само ако обектът е в `app_settings.minus_stores` | `mnTabVisible()` minusi.js:159–192, shared.js:1830 |
| Каса `tab-kasa` (вкл. Вечерен оборот, kasa-docs) | kasa, admin, manager | `kasaRoles=['kasa','admin','manager']` shared.js:1772 (коментарът над него споменава accounting, масивът — не) |
| История `tab-history` | admin, accounting | `roleCanSeeHistory()` shared.js:1692 |
| Днес `tab-today` | admin, controlling; accounting само с `is_regional=true` (след `rolesLoadRegional`) | `roleCanSeeToday()` shared.js:1693, shared.js:1783 и 1723 |
| Чек лист `tab-checklist` | admin; потребител с група `controlling` в `notify_groups` (но НЕ роля controlling); manager на отчетен обект (не-глобален, само четене + становище); регионален accounting | `canSeeChecklist()` checklist.js:143 (= `checklistIsControlling` :108 / `checklistStoreMode` :124 / `checklistRegionalMode` :136), shared.js:1792 и 1727 |
| График `tab-grafik` | само имейлите в `app_settings.grafik_beta_users` | `grCanSee()` grafik.js:38; скрит в shared.js:1850 |
| Администрация `tab-admin` | admin | `roleCanSeeAdmin()` shared.js:1698, :1858; вътре `loadAdmin()` (admin.js:3) за не-admin зарежда само „Известия“ |

Таблица → таб: виж колона „Модули“ в обобщението; модул → таб е по реда отгоре. Общите файлове: `shared.js` (статус/корекция на `transport_orders`/`client_orders`, `order_restrictions`, `product_catalog`, `contacts`, `stores`, `users`, бюлетин помощници) — за всички след вход; `notifications.js` (баджове — тръгва от `startApp` за всяка роля); `report.js` (Днес, бутоните за отчети в Администрация, чек лист); `push.js`/`email.js` — от действия в различни модули.

##### Непроследено

Няма извикване с непроследена таблица. Всички променливи първи аргументи са разрешени по извикващите:

| Място | Променлива | Възможни стойности | Откъде |
|---|---|---|---|
| admin.js:2115 `loadNotifScheduleTitles` sbGet | `NOTIF_ENTITY_TABLES[t]` | bulletin_promotions, bulletin_tasks, recurring_tasks, task_subtasks | admin.js:2046 |
| bulletin.js:4676 `attSetWidth` sbPatch | `table` | bulletin_tasks, recurring_tasks | bulletin.js:4668 |
| kasa.js:151/153 `kasaUpsert` sbPost/sbPatch | `table` | kasa_glavna, kasa_zoborot | kasa.js:1019, 1780 |
| picking.js:387 `pkGetIn` sbGetAll | `table` | picking_pallet_items, picking_lines, picking_pallets | picking.js:405,412,1085,1090,1111,1136 |
| reference.js:531/558/599 sbPatch/sbDelete/sbPost | `table` | warranty_brands, warranty_subcategories | reference.js:431–440 |
| shared.js:1462/1492/1619 sbPatch | `statusTargetTable` / `table` / `correctionTargetTable` | transport_orders, client_orders | transport.js:160, client-orders.js:1162, shared.js:1377 |
| stock-differences.js:324 `sdGetAllPaged` sbGet | `table` | stock_differences, differences_reports | stock-differences.js:346–347 |
| stock-differences.js:4951 `sdNoteNotify` sbPatch | `table` | storno_note_replies, storno_notes | stock-differences.js:4950 |
| checklist.js:967 `checklistGetAll` fetch GET | `table` | weekly_checklist, differences_reports, stock_differences, goods_transit, stock_returns | checklist.js:714, 725, 2434; `CHECKLIST_MODULE_FILL` checklist.js:672, 680 |
| supply.js:512 `supplyGetAll` fetch GET | `table` | supply_entries, supply_store_notes, supply_no_need | supply.js:350, 546, 552, 557 |

Остатъчни рискове (не са непроследени, но да се знае):
- stock-differences.js:5425 `diffUrlToBase64(url)` — `fetch` на URL, взет от записа (`rep.photos[].url`); по кода това са публични URL-и от `bulletin-files`, но стойността идва от базата.
- kasa.js:1348 и kasa-docs.js:561 — `fetch` към `/storage/v1/object/sign/kasa-docs/` в генериран HTML за печат (не се вижда от лексер); kasa.js:1348 вгражда anon ключа като литерал в този низ (стойността не е показана тук).
- Лексерът определя „функция“ като най-близката обграждаща `function ИМЕ(`; при извикване в анонимна функция, присвоена на свойство/променлива (напр. `reader.onload=function`), колоната показва `външна > вътрешна`.
- Само статичен анализ на кода — нищо не е сверено с живата база или с правата на `anon` в нея.

### 3б. Едж функциите

Всички ходят към базата със `SUPABASE_SERVICE_ROLE_KEY` (supabase-js или raw
fetch). Никоя не ползва anon ключа, `SUPABASE_SECRET_KEYS`, `SUPABASE_DB_URL` или
токен, препратен от клиента. Сверено е само репото, не живите версии.

#### Edge Functions: how each one reaches the DB

Source: `C:\Users\tench\Documents\GitHub\wt-etap2-inventar\supabase\functions` (the repo mirror, not the live deploy). I left out `vendor/` and `*.test.ts`. Versions, crons and callers come from README.md lines 51-66. In that table every function is listed with JWT ✅, meaning `verify_jwt=true` at the gateway (there is no `config.toml`).

**Main finding:** no function talks to the DB with the anon key, and none forwards the caller's token. Every DB access uses `SUPABASE_SERVICE_ROLE_KEY`. Nothing reads `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEYS` or `SUPABASE_DB_URL`. There are no direct postgres connections and no `.rpc()` or `/rest/v1/rpc/` calls. None of the functions reads `req.headers` (Authorization or anything else), so apart from the gateway JWT check, the only caller authentication in code is the portal session token in `body.session`.

##### Summary

| Function | DB key | Caller auth (in code, beyond gateway verify_jwt) | Tables |
|---|---|---|---|
| `_shared/session.ts` | none (no DB) | provides `signSession` / `verifySession` / `requireAdmin` (HMAC, `PORTAL_SESSION_SECRET`) | none |
| auth-login | service_role, supabase-js | none (it is the login: bcrypt check of email+password) | users (select, including password_hash) |
| auth-set-password | service_role, supabase-js | old password (bcrypt) OR `requireAdmin(body)` | users (select password_hash, update password_hash) |
| admin-users | service_role, supabase-js | `requireAdmin(body)` + field whitelists | users (insert / update / delete) |
| set-history-pin | service_role, supabase-js | `requireAdmin(body)` | users (update history_pin_hash), audit_log (insert) |
| kasa-access-check | service_role, supabase-js | **none** (only user_id+pin in the body; README: no caller) | users (select history_pin_hash), audit_log (insert) |
| grafik-api | service_role, supabase-js (repo.ts) | `verifySession(body.session)` + users row + app_settings lists | users, app_settings, stores, grafik_*, companies, audit_log |
| bulletin-notify | service_role, supabase-js | **none** (cron 15 + portal `runNotifyTopic`) | ~22 tables, read + write notification_*/task_completions |
| dynamic-responder | service_role, supabase-js | **none** (cron 11) | notification_schedules (select/update) + bulletin reads |
| send-scheduled-report | service_role, raw fetch /rest/v1 | **none** (crons + portal "Тест до мен" button) | ~30 tables, read; report_snapshots write |
| send-routed-report | service_role, raw fetch /rest/v1 | **none** (cron 16 + dynamic-responder) | bulletin/users/supply reads; notification_topics patch |
| send-oborot-report | service_role, raw fetch /rest/v1 | **none** (cron 14) | daily_turnover, client_orders, users (read) |
| resend-email | no DB | **none** | none (SMTP + OneSignal) |
| portal-push | no DB | **none** | none (OneSignal) |
| swift-handler (rm-push-index.ts) | no DB | **none** (cron 4/5/6, RM-app) | none (OneSignal) |

##### Per function

###### _shared/session.ts
- DB: none.
- Exports: `signSession` (:51), `verifySession(token)` (:64), which checks the HMAC-SHA256 signature and `exp` (12 h TTL) and returns the payload or null, and `requireAdmin(body)` (:84), which needs a valid `body.session` with `role === "admin"`.
- Env: `PORTAL_SESSION_SECRET` (:30).
- Note: the comment at :5 says "verifySession() is not called by anyone yet". That is out of date: grafik-api calls it (handler.ts:289).

###### auth-login (v19)
- DB key: `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`, index.ts:37-39.
- Tables: `users` select `id,email,password_hash,store_name,role,display_name,assigned_stores,active` where email = …, active = true. password_hash is removed before the response.
- Calls other functions: none.
- Caller auth: none beyond the gateway. It is the login endpoint (bcrypt compare). It issues a session via `signSession`.
- Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORTAL_SESSION_SECRET (via _shared).

###### auth-set-password (v19)
- DB key: service_role, index.ts:46-48.
- Tables: `users` select `password_hash` (only when an old password is given) and update `password_hash`, by `id`.
- Calls other functions: none.
- Caller auth: with `old_password`, a bcrypt check of the old password for that user_id. Without it, `requireAdmin(body)` (:42), checked before any DB access.
- Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORTAL_SESSION_SECRET.

###### admin-users (v1)
- DB key: service_role, index.ts:9 (client injected into handler.ts).
- Tables: `users` with insert(CREATE_FIELDS).select(id), update(UPDATE_FIELDS).eq(id).select(id), and delete().eq(id).select(id) (handler.ts ~108-118). Whitelists are at handler.ts:9-13.
- Calls other functions: none.
- Caller auth: `requireAdmin(body)`, handler.ts:101, checked before validation and before DB access.
- Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORTAL_SESSION_SECRET.

###### set-history-pin (v8)
- DB key: service_role, index.ts:42-45.
- Tables: `users` update `history_pin_hash` by id (select email). `audit_log` insert (`history_pin_set`).
- Calls other functions: none.
- Caller auth: `requireAdmin(body)`, index.ts:20.
- Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORTAL_SESSION_SECRET.

###### kasa-access-check (v7)
- DB key: service_role, index.ts:29-32.
- Tables: `users` select `history_pin_hash, email, store_name` by id (.single). `audit_log` insert (`history_pin_success` / `history_pin_failed`).
- Calls other functions: none.
- Caller auth: **none in code.** Anyone who passes the gateway JWT check (the anon key is enough) can try PINs for any user_id. There is no rate limit, but every attempt is written to audit_log. README says it has no caller.
- Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

###### grafik-api (v4)
- DB key: service_role, repo.ts:24 (`makeRepo`).
- Tables (repo.ts):
  - `users` select by id, safe columns only (USER_COLS)
  - `app_settings` select key,value in (grafik_beta_users, grafik_trz_users)
  - `stores` select name,active; update `company_id` (setStoreCompanyRef)
  - `grafik_months` select, upsert (ignoreDuplicates), update with expected status
  - `grafik_rows` select, upsert on (month_id, staff_id)
  - `grafik_staff` select, insert, update
  - `grafik_sectors` select, insert
  - `grafik_store_company`, `companies`, `grafik_company_terms`, `grafik_vtr_codes`, `grafik_vtr_seasons`, `grafik_letter_map`, `grafik_extra_days` select
  - admin generic `adminList` / `adminInsert` / `adminUpdate` / `adminDelete` on AdminTable = companies, grafik_company_terms, grafik_store_company, grafik_extra_days, grafik_letter_map (handler.ts:47). Insert is allowed for the first four (handler.ts:198), delete only for grafik_extra_days (:199).
  - `audit_log` insert
- Calls other functions: none.
- Caller auth: `verifySession(body.session)` (handler.ts:289), otherwise 401. After that it loads the user from DB by uid and resolves access from the `grafik_beta_users` / `grafik_trz_users` email lists.
- Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORTAL_SESSION_SECRET.
- **Live-DB test:** `grafik-api/repo.live-test.ts` writes to the LIVE DB with the service_role key (raw client at :13 plus makeRepo): store Кърджали, month 2099-01. It cleans up afterwards and compares row counts for grafik_months, grafik_rows, grafik_staff, companies and grafik_store_company. It is a manual run, not part of npm test or CI. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

###### bulletin-notify (v30)
- DB key: service_role, `createClient(SB_URL, SB_SERVICE_KEY)` index.ts:207-208, :2618.
- Tables:
  - select only: bulletins, bulletin_tasks, bulletin_promotions, recurring_tasks, recurring_task_periods, recurring_task_versions, recurring_task_skips, users, notification_matrix, notification_overrides, loading_lists, loading_list_items, minus_movements, minus_reasons, minus_uom_thresholds, minus_uploads, app_settings
  - `task_completions` select, plus **insert** (minus auto-tick, :2527)
  - `notification_topics` select, update (last_run_at etc.)
  - `notification_log` insert, delete (rollback of the dedupe row on failure)
  - `loadTasksByIds` (:446) uses a variable table name, only ever 'bulletin_tasks' or 'recurring_tasks'
- Calls other functions: `/functions/v1/resend-email` (:209, used at :1609 and :1620) with `Authorization: Bearer SUPABASE_SERVICE_ROLE_KEY` (:215), for both email and push.
- Caller auth: **none in code.** Body `{topic_key}` runs a topic immediately; `{minus_auto_tick:true}` and `dry_run` are also accepted. Callers are cron 15 and the portal (`push.js runNotifyTopic`).
- Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

###### dynamic-responder (v23)
- DB key: service_role, index.ts:16-17, :307.
- Tables:
  - `notification_schedules` select active, update `last_sent_at` / active
  - select: recurring_tasks, recurring_task_periods, recurring_task_versions, recurring_task_skips, task_subtasks, bulletin_tasks, bulletins
  - variable table at :352: task_subtasks / bulletin_promotions / recurring_tasks / bulletin_tasks (select)
- Calls other functions: `/functions/v1/resend-email` (:18, :392) and `/functions/v1/send-routed-report` (:21, :288), both with `Authorization: Bearer SUPABASE_SERVICE_ROLE_KEY` (:31).
- Caller auth: **none in code** (cron 11, every 15 min).
- Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

###### send-scheduled-report (v76, ~398 KB)
- DB key: raw fetch to `SUPABASE_URL/rest/v1/` with `apikey` and `Authorization: Bearer SUPABASE_SERVICE_ROLE_KEY` (:787-821; helpers sbGet / sbGetOk / sbPost / sbPatch; reportGetAll pages by 1000 at :2881).
- Tables:
  - read: app_settings, bulletins, bulletin_tasks, recurring_tasks, recurring_task_periods, recurring_task_skips, recurring_task_versions, task_completions, users, client_orders, differences_reports, stock_differences, stock_returns, goods_transit, kasa_reports, kasa_zoborot, kasa_storno, minus_movements, minus_reasons, report_recipients, report_snapshots, transfers, transfer_cargo, transfer_cargo_events, transport_orders, transport_pallets, weekly_checklist, weekly_checklist_metrics, weekly_checklist_responses, weekly_checklist_sends
  - write: `report_snapshots` POST (insert) and PATCH (update)
- Calls other functions: `/functions/v1/resend-email` (:5105, 5142, 5166, 5181, 5206, 5265, 5390) with Bearer + apikey = service_role.
- Caller auth: **none in code.** Callers are crons (26, 30, …) and the portal "Тест до мен" button in admin.js, which goes through the gateway JWT only.
- Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

###### send-routed-report (v16)
- DB key: raw fetch `/rest/v1/` with service_role apikey+Bearer (:217-233; supplyRest :1156-1158).
- Tables:
  - read: users, bulletins, bulletin_tasks, recurring_tasks, recurring_task_periods, recurring_task_skips, recurring_task_versions, task_completions, notification_topics, supply_templates, supply_template_items, supply_entries (paged, :1190)
  - write: `notification_topics` PATCH
- Calls other functions: `/functions/v1/resend-email` (:1507) with service_role Bearer + apikey.
- Caller auth: **none in code.** Callers are cron 16 and dynamic-responder; the `{task_id, recipients}` body sends a per-task report.
- Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

###### send-oborot-report (v9)
- DB key: raw fetch `/rest/v1/` with service_role apikey+Bearer (:34-48).
- Tables: read daily_turnover, client_orders, users. No writes.
- Calls other functions: `/functions/v1/resend-email` (:328) with service_role Bearer + apikey.
- Caller auth: **none in code** (cron 14).
- Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

###### resend-email (v61, send-email.ts)
- DB: none (no createClient, no /rest/v1).
- External: SMTP (denomailer from vendor/) and OneSignal REST (`Authorization: Key ONESIGNAL_REST_KEY`, :374). Body `type` is 'email' (default) or 'push' (:357).
- Caller auth: **none in code.** It is called from the portal (email.js, push.js) and from the four cron functions with service_role.
- Env: ONESIGNAL_REST_KEY, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_NAME.

###### portal-push (v24)
- DB: none. OneSignal REST with ONESIGNAL_REST_KEY (:16, :51). Target is all users or filters from the body.
- Caller auth: **none in code** (portal push.js `osSend`).
- Env: ONESIGNAL_REST_KEY.

###### swift-handler (v41, rm-push-index.ts)
- DB: none. OneSignal push to one fixed RM-app user (:22, :52). README says this function is not for this portal.
- Caller auth: **none in code** (crons 4/5/6).
- Env: ONESIGNAL_REST_KEY.

##### All Deno.env.get names
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORTAL_SESSION_SECRET, ONESIGNAL_REST_KEY, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_NAME.

None of the functions uses SUPABASE_ANON_KEY, SUPABASE_SECRET_KEYS, SUPABASE_PUBLISHABLE_KEYS or SUPABASE_DB_URL.

##### Caveats
- I only read the repo files. I did not compare them with the live deployed versions (`get_edge_function`).
- README line 415 lists the functions that use SUPABASE_SERVICE_ROLE_KEY but leaves out grafik-api and send-routed-report. Both use it (repo.ts:24, send-routed-report :218).

### 3в. pg_cron

Всички 23 задачи са с потребител `postgres`. 13 от тях са `net.http_post` към
едж функция с **`Authorization: Bearer` = legacy anon JWT** (`role anon`; ключът
стои в текста на командата, не във vault) — нужен е само за `verify_jwt` на
шлюза.

| job | име | график (UTC) | потребител | какво | ключ към едж функцията |
|---|---|---|---|---|---|
| 4 | `rm-push-morning` | `0 5,6 * * 1-5` | postgres | `net.http_post` → `swift-handler` | legacy JWT, role `anon` |
| 5 | `rm-push-afternoon` | `0 11,12 * * 1-5` | postgres | `net.http_post` → `swift-handler` | legacy JWT, role `anon` |
| 6 | `rm-push-evening` | `0 14,15 * * 1-5` | postgres | `net.http_post` → `swift-handler` | legacy JWT, role `anon` |
| 7 | `temax-daily-backup` | `0 0 * * *` | postgres | `SELECT perform_daily_backup('daily', 'system')` | — |
| 8 | `temax-cleanup-old-backups` | `0 1 * * 0` | postgres | `DELETE FROM backup_snapshots WHERE created_at < now() - interval '90 days'` | — |
| 11 | `check-scheduled-notifications-every-15min` | `*/15 * * * *` | postgres | `net.http_post` → `dynamic-responder` | legacy JWT, role `anon` |
| 14 | `oborot-report-evening` | `45 17,18 * * *` | postgres | `net.http_post` → `send-oborot-report` | legacy JWT, role `anon` |
| 15 | `bulletin-notify-every-15min` | `*/15 * * * *` | postgres | `net.http_post` → `bulletin-notify` | legacy JWT, role `anon` |
| 16 | `weekly-routed-report` | `10 5,6 * * 1` | postgres | `net.http_post` → `send-routed-report` | legacy JWT, role `anon` |
| 17 | `pallets-report-friday-21` | `0 15,16 * * 5` | postgres | `net.http_post` → `send-scheduled-report` | legacy JWT, role `anon` |
| 18 | `warehouse-report-sunday-21` | `0 18,19 * * 0` | postgres | `net.http_post` → `send-scheduled-report` | legacy JWT, role `anon` |
| 19 | `daily-report-21h` | `0 18,19 * * *` | postgres | `net.http_post` → `send-scheduled-report` | legacy JWT, role `anon` |
| 20 | `weekly-report-sun-21h` | `0 18,19 * * 0` | postgres | `net.http_post` → `send-scheduled-report` | legacy JWT, role `anon` |
| 21 | `recurring-active-refresh` | `5 21,22 * * *` | postgres | `select public.recurring_tasks_refresh_active()` | — |
| 22 | `transit-empty-stores` | `0 * * * *` | postgres | `select public.transit_mark_empty_stores();` | — |
| 23 | `stock-returns-auto-complete` | `0 * * * *` | postgres | `select public.stock_returns_sync_completions();` | — |
| 24 | `stock-diff-auto-complete` | `0 * * * *` | postgres | `select public.stock_diff_sync_completions();` | — |
| 25 | `supply-auto-complete` | `0 * * * *` | postgres | `select public.supply_sync_completions();` | — |
| 26 | `co-overdue-weekdays-8h` | `0 5,6 * * 1-5` | postgres | `net.http_post` → `send-scheduled-report` | legacy JWT, role `anon` |
| 29 | `checklist-freeze-mon-0010` | `10 21,22 * * 0` | postgres | `select public.checklist_freeze_week(extract(isoyear from d)::int, extract(week from d)::in` | — |
| 30 | `minus-multi-mon-8h` | `0 8,9 * * 1` | postgres | `net.http_post` → `send-scheduled-report` | legacy JWT, role `anon` |
| 32 | `pallets-auto-complete` | `0 * * * *` | postgres | `select public.pallets_sync_completions();` | — |

### 3г. Огледалото (Живко)

`sync-mirror.ps1` не е в репото; юлската версия е в архива на Тенчо, текущата —
при Живко. Вместо списъка на 75-те (16.10) — **реалният списък от `edge_logs`**:
user-agent `TemaxMirrorSync/1.0`, A1 Bulgaria, само `GET`, всички 200, 6 756
заявки за 24 ч. (03.11 13:00 – 04.11 13:00 UTC), **89 таблици**:

`app_settings`, `audit_log`, `backup_log`, `bulletin_promotions`, `bulletin_tasks`, `bulletins`, `bus_routes`, `client_order_counters`, `client_orders`, `companies`, `completions`, `contact_topics`, `contacts`, `daily_turnover`, `differences_reports`, `documents`, `goods_transit`, `kasa_documents`, `kasa_glavna`, `kasa_reports`, `kasa_storno`, `kasa_storno_items`, `kasa_zoborot`, `loading_list_items`, `loading_list_photos`, `loading_list_products`, `loading_lists`, `minus_movements`, `minus_plants`, `minus_reasons`, `minus_uom_thresholds`, `minus_uploads`, `notification_log`, `notification_matrix`, `notification_overrides`, `notification_schedules`, `notification_topics`, `order_restrictions`, `picking_batches`, `picking_lines`, `picking_pallet_items`, `picking_pallets`, `picking_shipments`, `product_catalog`, `recipients`, `recurring_task_periods`, `recurring_task_skips`, `recurring_task_versions`, `recurring_tasks`, `report_recipients`, `report_snapshots`, `revaluation_campaigns`, `revaluation_codes`, `revaluation_items`, `revaluation_submissions`, `revision_schedule`, `route_templates`, `stock_diff_swaps`, `stock_differences`, `stock_returns`, `stores`, `storno_note_replies`, `storno_notes`, `subtask_completions`, `supply_entries`, `supply_no_need`, `supply_store_notes`, `supply_template_items`, `supply_templates`, `task_completions`, `task_subtasks`, `transfer_cargo`, `transfer_cargo_events`, `transfer_counters`, `transfers`, `transport_orders`, `transport_pallets`, `users`, `warranty_brands`, `warranty_cards`, `warranty_entries`, `warranty_service_locations`, `warranty_subcategories`, `warranty_templates`, `weekly_checklist`, `weekly_checklist_freezes`, `weekly_checklist_metrics`, `weekly_checklist_responses`, `weekly_checklist_sends`

Не се теглят: `backup_snapshots`, 11-те `grafik_*` (без права за anon) и двете
`loading_items_bak_*`. Всяка таблица, спомената в `zhivko-opashka.md` (всички
секции), освен `grafik_*`, е в списъка — тоест 89 > 75 от 16.10; дали Живко е
добавил и колоните, логът не показва (`select=*`).

Отделно — **PowerShell клиент** (`Mozilla/5.0 (Windows NT; Windows NT 10.0; bg-BG)
WindowsPowerShell/5.1`, A1 Bulgaria, Sofia), с anon: на всеки час чете
`storage_files_index` и тегли нови файлове от `bulletin-files` и `kasa-docs`
(215–321 заявки/денонощие). Най-вероятно бекъпът на файловете при Живко —
непотвърдено.

### 3д. RM-app и Checklist-Temax

#### Other apps on Supabase project xiwkdiqqplgdcrkewgtv: inventory

Read-only. Only `git fetch` was run; the code was read from `origin/main` with `git show`, and nothing in either working tree was touched.

---

##### RM-app

- Remote: https://github.com/tenchotenev13-afk/RM-app.git
- origin/main SHA: `e0ac79ca98be81a6ca3fb3a60557b0470ca6cf45` (2026-09-28, "today: notice tasks in a separate info group ...")
- Files: CLAUDE.md, OneSignalSDKWorker.js, docs/Регламент_Кърджали_без_управител.md, icon-192/512.png, index.html (2785 lines), manifest.json, sw.js

###### 1. Hosting
It is hosted on GitHub Pages at `tenchotenev13-afk.github.io/RM-app/` (CLAUDE.md:6). It is a PWA: `manifest.json` has `start_url "./"`, and `sw.js` caches `temax-vN`. A CORS hint at index.html:1697 also names `https://tenchotenev13-afk.github.io`. There is no CNAME, netlify.toml, workflow, Capacitor config or package.json.

###### 2. Key
- index.html:1273: `SB_URL = https://xiwkdiqqplgdcrkewgtv.supabase.co`
- index.html:1274: `SB_KEY` is a legacy JWT. Decoded payload: `iss=supabase`, `ref=xiwkdiqqplgdcrkewgtv`, `role=anon`, exp 2095126926.
- No publishable, secret or service_role key appears.

###### 3. Supabase client
- Raw `fetch` to `/rest/v1/` through a single helper `sbFetch(table, query)` (index.html:1285–1299). It is hard-coded to `method: 'GET'` and sends the `apikey` header and `Authorization: Bearer` with the anon key.
- There are no `/functions/v1`, `/storage/v1` or `.storage` calls, and no supabase-js.
- Other external service: OneSignal web SDK v16 (index.html:153, 1234–1268). It initialises and adds the tag `rm_user`. It does not call the OneSignal REST API.

###### 4. Tables and RPCs (all reads)
| Table | Operations | Where |
|---|---|---|
| bulletins | select | index.html:1740, 1743; also embedded as `bulletins!inner(...)` at 1362 |
| bulletin_tasks | select | index.html:1365 (spanning tasks, `select=*`), 1762 |
| recurring_tasks | select | index.html:1508 |
| recurring_task_versions | select | index.html:1509 |
| recurring_task_periods | select | index.html:1510 |
| recurring_task_skips | select | index.html:1511 |
| task_completions | select | index.html:1520 |
| weekly_checklist | select | index.html:1521 |

That is 8 tables (10 `sbFetch` calls) and no RPCs. CLAUDE.md states: "само четене от Supabase ... Никога не пиши в тази база оттук" (read only from Supabase; never write to this database from here).

###### 5. Login
- There is no login and no Supabase Auth. The app does not read `users` and does not call `auth-login`.
- The mode is chosen with the URL parameter `?m=kardzhali|radnevo|rm` and kept in localStorage `tm-mode` (index.html:746–754). Store managers get a filtered view; the default is the RM's own view.
- Ticks are stored only in localStorage (`tm-done`, `tm-store`, `tm-bulletin`).
- No request uses a user JWT. `Authorization` is always the anon key.

###### 6. Realtime
None. There is no `.channel(`, `postgres_changes` or WebSocket.

###### 7. Deletes and writes to the portal's tables
The app makes no DELETE, INSERT, PATCH or upsert calls, because the only helper is GET. All 8 tables above belong to the portal (Бюлетин / weekly checklist), and the app only reads them. `localStorage.removeItem` is local only.

---

##### Checklist-Temax

- Remote: https://github.com/tenchotenev13-afk/Checklist-Temax.git
- origin/main SHA: `5daa1fee24b3bbf0827fc31ff1d17813cecf5f08` (2026-09-29, "fix: заседнало 'uploading' качване се подновява след презареждане")
- Files: Code.gs (822 lines), dashboard.html (951), index.html (3081), logo.png, manifest.json, manifest-dashboard.json

###### 1. Hosting
- Frontend: GitHub Pages project site. `manifest.json` has `start_url /Checklist-Temax/` and `scope /Checklist-Temax/` (lines 9–10), and `manifest-dashboard.json` has `start_url /Checklist-Temax/dashboard.html`. There is no CNAME, netlify.toml or workflow. This is inferred from the path: the repo does not say "github.io" explicitly.
- Backend: Google Apps Script web app (`Code.gs`). Line 3 says to deploy it as "Execute as: Me" with "Who has access: Anyone". The frontend calls `https://script.google.com/macros/s/AKfy.../exec` (index.html:256, 1493; dashboard.html:204) through JSONP `<script src>` tags.

###### 2. Key
There is no Supabase key of any kind and no Supabase URL. A grep for `supabase`, `xiwk`, `eyJ`, `sb_publishable` and `sb_secret` returns 0 hits in every file.

###### 3. Supabase client
None. The app uses these services instead:
- Google Apps Script with Google Sheets, sheet id `SS_ID` at Code.gs:5. Actions: `getAll`, `testWrite`, `testSave`, `sendEmail` (MailApp.sendEmail at Code.gs:304), `addPhotos`, `updateNotes`, and saving with `data=`.
- Cloudinary unsigned upload. The cloud name is at index.html:257, the preset `temax_upload` at :434, and the upload call at :1926.

###### 4. Tables and RPCs
There are 0 Supabase tables and 0 RPCs. The data lives in Google Sheets tabs: the raw sheet (`SS_RAW`), `_test_` and `_errors_`. Code.gs uses `appendRow` and `setValue` on these tabs.

###### 5. Login
- There is no Supabase Auth and no portal `users` table or `auth-login`.
- Stores are chosen locally (localStorage `temax_shops` / `temax_my_shops`).
- Admin access is a `prompt()` checked against a password hard-coded in the client (index.html:1112–1114). It is plain text in the JS and only unlocks local admin features.
- No JWT of any kind is sent.

###### 6. Realtime
None.

###### 7. Deletes and writes to the portal's tables
- Supabase: none, because the app does not use the database.
- Google Sheet: the app writes rows (`appendRow`) and updates cells (`setValue`). No `deleteRow` or `clearContent` was found in Code.gs.
- It shares no tables with the portal.

---

##### Summary
| App | Hosting | Key | Login | Supabase tables | Deletes | Realtime |
|---|---|---|---|---|---|---|
| RM-app | GitHub Pages (PWA) | legacy JWT, role=anon (index.html:1274) | none (URL `?m=` mode + localStorage) | 8, all select only | no | no |
| Checklist-Temax | GitHub Pages (inferred from manifest scope) + Google Apps Script backend | none | none (local shop choice; client-side admin prompt) | 0 (Google Sheets + Cloudinary) | no | no |

### 3е. edge_logs — 7 денонощия (28.10 13:00 – 04.11 13:00 UTC, по 24 ч.)

Referer-ът носи само произхода (`https://tenchotenev13-afk.github.io/`), не
пътя — **порталът и RM-app не се различават по лога**, само по таблиците (RM-app
чете 8 таблици на Бюлетина). Извън портала/RM-app, огледалото и едж функциите
(`Deno`):

| Кой (user-agent / мрежа) | Роля | Какво | Колко | Чий е |
|---|---|---|---|---|
| `WindowsPowerShell/5.1`, A1, Sofia | anon | `storage_files_index` + `GET /storage/v1/object/<bucket>/…` | 215–321/ден, всеки ден | вероятно бекъп на файлове (Живко) — **да се потвърди** |
| `node`, A1 / Yettel / ESCOM Хасково | service_role | само `grafik_*` + `companies`, GET | 0–190/ден | живите тестове на Работния график (`repo.live-test.ts`) от машините на Тенчо — **значи service_role ключът е на локална машина** |
| `node`, A1, Sofia | anon | `app_settings`, `users`, `weekly_checklist_metrics`, `recurring_tasks` и др. (13 таблици) | 228 на 29.10 | локален скрипт / тест — неизвестен |
| `node`, A1 / Yettel / ESCOM | anon | `goods_transit` | 2–10/ден | локален скрипт — неизвестен |
| `curl/8.21.0`, A1 / Yettel / ESCOM | anon | rpc и таблици, вкл. един `DELETE bus_routes` (03.11) | единични | ръчни проверки от сесиите на Code (напр. curl пробите от етап 1) |
| `node`, Microsoft (САЩ) | — (публичен URL) | 2 файла от `bulletin-files/differences/` | 2–20/ден | проверка на линкове в имейли (Outlook/Defender) |
| браузъри, Google / Microsoft / `ms-office` / `bingbot` | — (публичен URL) | `/storage/v1/object/public/bulletin-files/…` | единични | отворени линкове от имейл / Office преглед / индексиране |
| `@supabase-infra/mgmt-api` | supabase_admin | `network-bans`, health | единични | платформата |

Непознат потребител **с право на запис** извън горните — не е открит за 7-те дни.

## 4. Преди вход

Порталът **не чете нищо** от базата преди вход:
- `initApp()` (`shared.js:1637`, от `DOMContentLoaded` на `shared.js:1995`) е празна;
- `sw.js` не се регистрира от портала, а и пропуска `supabase.co`
  (`sw.js:56`); service worker-ът на OneSignal (`OneSignalSDKWorker.js`) е за push;
- `manifest.json` — статичен.

Към Supabase преди вход отиват само:
- `POST /functions/v1/auth-login` (`shared.js:1649`) — с anon ключа заради
  `verify_jwt`;
- `POST /rest/v1/audit_log` при неуспешен вход (`shared.js:1661` → `logAudit`) —
  **запис като anon**, с въведения имейл.

Тоест в стъпка 5 anon трябва да запази: извикване на `auth-login` (или неговия
заместник) и INSERT в `audit_log` (или записът да мине в `auth-login`). Плюс
всичко на RM-app, огледалото и PowerShell клиента, докато не получат друг ключ.
Кроновете не влизат тук: anon ключът им е само за шлюза на едж функциите, не
за таблиците (виж 3в) — засяга ги само изключването на legacy ключа.

## 5. Storage

| Bucket | Публичен | Обекти | Политики в `storage.objects` (роля → команда) |
|---|---|---|---|
| `Pictures` | **да** | 1 | няма |
| `kasa-docs` | не | 3978 | anon → DELETE (`kasa_docs_delete`); anon → SELECT (`kasa_docs_read`); anon → SELECT (`kasa_docs_sign`); anon → INSERT (`kasa_docs_upload`) |
| `bulletin-files` | **да** | 3494 | anon → DELETE (`bulletin_delete`); anon → SELECT (`bulletin_read`); anon → UPDATE (`bulletin_update`); anon → INSERT (`bulletin_upload`) |
| `docs` | **да** | 15 | anon → DELETE (`docs_delete`); anon → SELECT (`docs_read`); anon → INSERT (`docs_upload`) |
| `contacts` | **да** | 79 | anon → DELETE (`contacts_delete`); anon → SELECT (`contacts_read`); anon → UPDATE (`contacts_update`); anon → INSERT (`contacts_upload`) |

Всички политики на Storage са **само за `anon`** — за `authenticated` няма нито една. Публичните bucket-и се четат по `/object/public/…` без ключ, независимо от политиките. `kasa-docs` е частен — порталът го отваря със signed URL (`kasa_docs_sign`).

`public.storage_files_index` — изглед (собственик postgres, **без** `security_invoker`, тоест работи с правата на собственика) върху `storage.objects` за `kasa-docs`, `bulletin-files`, `docs`, `contacts` (име, размер, mime, дати). anon има SELECT → **списъкът на всички файлове, вкл. частния `kasa-docs`, е четим с публичния ключ**. Чете го PowerShell клиентът (3г); Advisor го показва като `security_definer_view`.

**Публични URL-и, записани в базата** (стойности, съдържащи `/storage/v1/object/public/`, 04.11):

| Таблица.колона | Брой |
|---|---|
| `stock_returns.photos` | 465 |
| `differences_reports.photos` | 425 |
| `loading_list_photos.path` | 331 |
| `stock_differences.attachments` | 214 |
| `task_completions.photos` | 212 |
| `task_completions.files` | 90 |
| `contacts.photo_url` | 74 |
| `bulletin_tasks.attachments` | 57 |
| `documents.url` | 10 |
| `recurring_tasks.attachments` | 8 |
| `transfer_cargo_events.photos` | 5 |
| `storno_note_replies.files` | 3 |

Общо 1 894 в 12 колони на 11 таблици. Затварянето на bucket-ите ще ги счупи всичките — плюс линковете в изпратените имейли.

От кода на портала (подробно в 3а): `bulletin-files` — 19 места (качване, едно
DELETE, един GET по публичен URL); `contacts` — 2; `docs` — 1; `kasa-docs` — 5
(качване и signed URL). RM-app и Checklist-Temax не ползват Storage.

## 6. Realtime

Няма абонаменти в никое от трите приложения (няма `.channel(`,
`postgres_changes`, `WebSocket`, supabase-js в портала и RM-app; Checklist-Temax
не ползва Supabase). В базата `supabase_realtime_messages_publication` има само
служебните `realtime.messages_*` дялове от 28.05–03.06.2026 — нито една таблица
от `public`.

## Открити въпроси

Само неща, които не се установяват от кода и базата:

1. **JWT Signing Keys в Dashboard-а** — статусът на legacy HS256 секрета
   (current за legacy ключовете / previously used / revoked) и има ли standby
   ключ (т.1а).
2. **Път за стъпка 2** — Supabase Auth, внесен собствен ключ за подписване в
   едж функция, или друго (т.1б).
3. **PowerShell клиентът** с anon, който чете `storage_files_index` и тегли
   файлове всеки час — Живко ли е (бекъп на файловете)? Ако да — и той трябва да
   влезе в плана за ключовете.
4. **`node` скриптовете с anon** (29.10 — 228 заявки, вкл. `users`;
   `goods_transit` всеки ден) — чии са?
5. **service_role ключът на локалните машини** (живите тестове на графика) —
   къде е записан и кой има достъп до него.
6. **Огледалото** — текущият `sync-mirror.ps1` (списъкът и колоните) е при
   Живко; логът показва 89 таблици, не 75.
7. **RM-app** — кой я ползва и може ли да мине към вход (сега е без логин,
   режимът е в URL-а).
8. **Публичните bucket-и** — линковете от имейли (`bulletin-files`) се отварят
   без вход; при затваряне на Storage — дали писмата трябва да останат с работещи
   линкове.
