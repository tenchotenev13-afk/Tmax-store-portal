# Опашка за Живко (огледалото)

Тук се записва всяка промяна в схемата, която огледалото трябва да повтори:
нова колона, нова таблица или нова стойност на статус. Чете го Тенчо и праща
на Живко ЕДИН имейл на ден със съдържанието на „Чака изпращане", после
премества редовете под „Изпратено <дата>".

Формат на ред: `дата · таблица.колона — тип, NULL/NOT NULL, default` · или
`дата · таблица.колона — нова стойност на статус 'x'` · или
`дата · нова таблица X — колона тип, …`. Без CHECK, индекси, функции,
тригери, кронове и RLS — в огледалото ги няма. Новите стойности на статус
се записват винаги; ако огледалото не проверява стойности, Живко само ги
отбелязва.

## Чака изпращане

(в базата от миграцията storage_files_index_readonly, storage-files-index-readonly-schema.sql, версия 20261124125709, приложена 24.11.2026)
- 24.11 · storage_files_index — без промяна за огледалото, остава само за четене

(в базата от миграцията revaluation_units, revaluation-units-schema.sql, версия 20261123201403, приложена 23.11.2026)
- 23.11 · нова таблица revaluation_units — id uuid NOT NULL, default gen_random_uuid() (PK) · item_id uuid NOT NULL (→ revaluation_items.id) · submission_id uuid NOT NULL (→ revaluation_submissions.id) · store_name text NOT NULL · unit_no text NOT NULL, уникален · created_at timestamptz NOT NULL, default now()
- 23.11 · нова таблица revaluation_unit_counters — store_name text NOT NULL (PK) · last_num integer NOT NULL, default 0
- 23.11 · revaluation_items.photos — text[], NULL, без default

(промяна само в данни, weekly-checklist-label-razliki-schema.sql; миграция weekly_checklist_label_razliki — версия 20261124100125, приложена 24.11.2026)
- 23.11 · weekly_checklist_metrics — промяна само в данни (label на razliki_dostavka → „Разлики логистични складове"), без промяна за огледалото

(промяна само в данни, weekly-checklist-stoka-vrashtane-task-schema.sql; миграция weekly_checklist_stoka_vrashtane_task — версия 20261124151504, приложена 24.11.2026)
- 24.11 · weekly_checklist_metrics — промяна само в данни (stoka_vrashtane: source → recurring:e9d418af…, portal_mode → 'any'), без промяна за огледалото

(изтриване на данни, без схемна промяна — огледалото прави UPSERT и не трие)
- 23.11 · kasa_reports — РЪЧНО ИЗТРИВАНЕ на ред id e6cc5cfd-f9d0-47bc-a1c5-7d0b3e41bb8a (дублиран отчет Шумен 20.11.2026, каса 2; изтрит в основната база на 23.11.2026, остава eebfd0b1-f6fd-44b1-855a-caea59fb0cdf)

(в базата от миграцията checklist_transit_deadline, weekly-checklist-transit-deadline-schema.sql, версия 20261123123732, приложена 23.11.2026; data миграцията checklist_transit_history_data — версия 20261123132452, приложена 23.11.2026: 108 клетки stoka_na_pat в седмици 40, 42–45, 47 → NULL)
- 23.11 · нова таблица weekly_checklist_snapshots — year int NOT NULL · week_number int NOT NULL · metric_key text NOT NULL (PK: year, week_number, metric_key) · taken_at timestamptz NOT NULL, default now() · taken_by text NULL (стойности 'cron' / 'freeze-late')
- 23.11 · weekly_checklist.portal_value за metric_key 'stoka_na_pat' — нови стойности 'da' / 'ne' вместо „N/M"; в седмиците без 10-то число — NULL (колоната не се мени, само съдържанието)

(в базата от миграцията bulletin_problem_articles, bulletin-problem-articles-schema.sql, версия 20261123130220, приложена 23.11.2026)
- 23.11 · problem_articles.bulletin_on — boolean, NOT NULL, default false
- 23.11 · problem_articles.bulletin_stores — jsonb, NULL, без default
- 23.11 · problem_articles.photo_required — boolean, NOT NULL, default false
- 23.11 · нова таблица problem_article_done — id uuid PK, article_id uuid NOT NULL, store_name text NOT NULL, done_by text NULL, done_at timestamptz NOT NULL default now(), photos jsonb NOT NULL default '[]'; уникалност article_id + store_name

(в базата от миграцията grafik_sector_coverage, grafik-sector-coverage-schema.sql, версия 20261124081201, приложена 24.11.2026; таблицата е без anon — виж бележката при grafik_schema)
- 24.11 · grafik_sectors.track_coverage — boolean, NOT NULL, default true

(в базата от миграцията grafik_approve, grafik-approve-schema.sql, версия 20261124103940, приложена 24.11.2026; таблицата е без anon — виж бележката при grafik_schema)
- 24.11 · grafik_months.status — нова стойност на статус 'approved' (одобрен от ТРЗ)
- 24.11 · grafik_months.approved_at — timestamptz, NULL, без default
- 24.11 · grafik_months.approved_by — text, NULL, без default
- 24.11 · grafik_months.approved_by_name — text, NULL, без default
- 24.11 · grafik_months.return_comment — text, NULL, без default
- 24.11 · grafik_months.returned_at — timestamptz, NULL, без default
- 24.11 · grafik_months.returned_by_name — text, NULL, без default

(в базата от миграцията warranty_templates_sector, warranty-templates-sector-schema.sql, версия 20261124110821, приложена 24.11.2026; данни 24.11.2026 — 5 реда със стойност 'Машини' / 'Баня', останалите 7 NULL)
- 24.11 · warranty_templates.sector — text, NULL, без default

## Потвърдено 23.11.2026

(в базата от миграцията reads_as_code, reads-as-code-schema.sql, версия 20261123113626, приложена 23.11.2026)
- 23.11 · stock_differences.reads_as_code — text, NULL, без default
(Живко, 23.11: колоната е в огледалото, синхронът мина (2680 реда), пълният синхрон в 14:00 — чист)

## Потвърдено 20.11.2026

(информативно, не схема — миграцията loading_list_delete_draft, loading-list-delete-draft-schema.sql, версия 20261118095818, приложена 18.11.2026)
- 18.11 · loading_lists, loading_list_items — нова колона НЯМА. От тази дата черновите (status 'draft') на товарни листи могат да се трият от портала („🗑 Изтрий черновата"): редове от loading_lists и loading_list_items (+ loading_list_products, loading_list_photos по каскада) изчезват от базата. Огледалото ги пази — ако синхронизацията трие изчезналите редове, черновата изчезва и там; ако не — остава като сирак със status 'draft'.
(Живко, имейл 20.11: синхронът трие изчезналите редове в loading_lists, loading_list_items, loading_list_products и loading_list_photos — изтрита чернова изчезва и от огледалото при следващия часов синхрон; проверени сираци в трите таблици — 0.)

(Живко, имейл 20.11: таблицата е в огледалото с всички колони и default-и, photos jsonb; първият синхрон — 23 реда (active / seed); без NOT NULL и CHECK по политиката на огледалото; индекси по material_code, status, source_line_id; синхрон на всеки час от 23:00.)

(в базата от миграцията problem_articles, problem-articles-schema.sql, версия 20261119102207, приложена 19.11.2026; началните 23 реда — миграцията problem_articles_seed, версия 20261119102729)
- 19.11 · нова таблица problem_articles — id uuid NOT NULL (PK), default gen_random_uuid() · material_code text NOT NULL · material_name text NULL · reads_as_code text NULL · reads_as_name text NULL · store_action text NOT NULL, default 'за преналепяне' · note text NULL · photos jsonb NOT NULL, default '[]' · valid_from date NOT NULL, default current_date · status text NOT NULL, default 'active' (стойности 'active' / 'closed') · source text NOT NULL, default 'office' (стойности 'seed' / 'office' / 'diff') · source_line_id uuid NULL · created_by text NULL · created_at timestamptz NULL, default now() · updated_by text NULL · updated_at timestamptz NULL · closed_by text NULL · closed_at timestamptz NULL

## Потвърдено 19.11.2026

(в базата от миграцията loading_client_order_link, loading-client-order-link-schema.sql, версия 20261117125425, приложена 17.11.2026)
- 17.11 · loading_list_items.client_order_id — uuid, NULL, без default
(Живко, 19.11 17:19: колоната е добавена и проверена, с обикновен индекс; 0 попълнени реда — сверено с базата на 19.11: и там 0)

(данни, не схема — миграцията transferi_zachistvane_20261116, transferi-zachistvane-2026-11-16.sql, версия 20261116105503, приложена 16.11.2026)
- 16.11 · transfers, transfer_cargo, transfer_cargo_events — ВСИЧКИ редове изтрити (старт на чисто от 17.11; 144 / 482 / 794 реда). Огледалото трябва да изтрие своите стари редове в тези три таблици; схемата им не е пипана. Таблиците transfers_archive_20261116, transfer_cargo_archive_20261116, transfer_cargo_events_archive_20261116 НЕ се огледалят (без права за anon). transfer_counters не е пипан — номерата продължават.
(Живко, 19.11: старите редове са изтрити при него на 16.11; към 17:17 — 27 / 82 / 76 реда, сверено с базата: същите)

## Потвърдено 18.11.2026

(в базата от миграцията loading_wrong_store, loading-wrong-store-schema.sql, версия 20261117083038, приложена 17.11.2026)
- 17.11 · loading_list_items.wrong_store — text, NULL, без default
- 17.11 · loading_list_items.wrong_store_by — text, NULL, без default
- 17.11 · loading_list_items.wrong_store_at — timestamptz, NULL, без default
- 17.11 · loading_list_items.wrong_store_note — text, NULL, без default
- 17.11 · loading_list_items.wrong_store_done_by — text, NULL, без default
- 17.11 · loading_list_items.wrong_store_done_at — timestamptz, NULL, без default
- 17.11 · loading_list_items.wrong_store_done_note — text, NULL, без default

(в базата от миграцията differences_reports_no_inbound, differences-no-inbound-schema.sql, версия 20261117095851, приложена 17.11.2026)
- 17.11 · differences_reports.no_inbound — boolean, NOT NULL, default false

(в базата от миграцията revaluation_approve, revaluation-approve-schema.sql, версия 20261114203015, приложена 14.11.2026)
- 13.11 · revaluation_submissions.approved_at — timestamptz, NULL, без default
- 13.11 · revaluation_submissions.approved_by — text, NULL, без default
- 13.11 · revaluation_submissions.return_note — text, NULL, без default
- 13.11 · revaluation_submissions.returned_at — timestamptz, NULL, без default
- 13.11 · revaluation_submissions.returned_by — text, NULL, без default
- 13.11 · revaluation_submissions.status — нова стойност на статус 'approved'

(в базата от миграцията minusi_co_comment, minusi-co-comment-schema.sql, версия 20261109102704, приложена 09.11.2026)
- 09.11 · minus_movements.co_comment — text, NULL, без default (коментар на офиса)
(потвърдено от Живко с писмо на 18.11: синхронът без грешки — loading_list_items 3051 реда, differences_reports 1229 реда (no_inbound false); revaluation_submissions и minus_movements.co_comment — при него от 15.11)

## Потвърдено 09.11.2026

(в базата от миграцията sap_prices_vkp2, sap-prices-vkp2-schema.sql, версия 20261108150623, приложена 08.11.2026; функцията catalog_set_sale_prices — не за огледалото)
- 08.11 · product_catalog.sale_price — numeric, NULL, без default
- 08.11 · product_catalog.sale_price_unit — text, NULL, без default
- 08.11 · product_catalog.sale_price_valid_from — date, NULL, без default
- 08.11 · product_catalog.sale_price_uploaded_at — timestamptz, NULL, без default

(в базата от миграцията grafik_changes, grafik-changes-schema.sql, версия 20261105103650, приложена 05.11.2026; таблицата е без anon — виж бележката при grafik_schema)
- 05.11 · нова таблица grafik_changes — id uuid, month_id uuid NOT NULL, staff_id uuid NOT NULL, day int NOT NULL, planned_letter text, planned_code text, actual text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL default now(), created_by text, updated_at timestamptz NOT NULL default now(), updated_by text, trz_done boolean NOT NULL default false, trz_done_at timestamptz, trz_done_by text

(в базата от миграцията transit-status-split-schema.sql, версия 20261104114441, приложена 04.11.2026. Данните — transit-status-split-data.sql — минават сами с UPSERT)
- 04.11 · goods_transit.sender_status — text, NULL, без default ('sent' / NULL — статусът на изпращача)
- 04.11 · goods_transit.sender_status_at — timestamptz, NULL, без default
- 04.11 · goods_transit.sender_status_by — text, NULL, без default
- 04.11 · goods_transit.recon_at — timestamptz, NULL, без default („Чака засечка“)
- 04.11 · goods_transit.recon_by — text, NULL, без default
- 04.11 · goods_transit.recon_side — text, NULL, без default ('sender' / 'receiver')
- 04.11 · goods_transit.status — стойността 'sent' отпада (след data-миграцията); остават 'pending' / 'received' / 'rejected'

(в базата от миграциите grafik_access, grafik-access-schema.sql, версия 20261104210513, и grafik_access_drop_settings, версия 20261104214147, приложени 04.11.2026; таблицата е без anon — виж бележката при grafik_schema)
- 04.11 · нова таблица grafik_access — id uuid, list text NOT NULL ('beta' / 'trz'), email text NOT NULL, note text, created_at timestamptz NOT NULL default now(), created_by text
- 04.11 · app_settings — ключовете grafik_beta_users и grafik_trz_users отпадат (редовете са изтрити; списъците са в grafik_access)

(в базата от миграцията grafik_shift_times, grafik-shift-times-schema.sql, версия 20261104073847, приложена 04.11.2026; таблиците grafik_* са без anon)
- 04.11 · grafik_vtr_codes.start_time — time, NULL, без default
- 04.11 · grafik_vtr_codes.end_time — time, NULL, без default

(в базата от миграцията grafik_sectors, grafik-sectors-schema.sql, версия 20261103135820, приложена 03.11.2026; таблиците grafik_* са без anon — виж бележката при grafik_schema)
- 03.11 · нова таблица grafik_sectors — id uuid, store_name text NOT NULL, name text NOT NULL, sort_order int NOT NULL default 0, active boolean NOT NULL default true, created_at timestamptz NOT NULL default now(), created_by text
- 03.11 · grafik_staff.sector_id — uuid, NULL, без default
- 03.11 · grafik_vtr_seasons.labels — jsonb, NULL, без default

(в базата от миграцията grafik_letters_contract, grafik-letters-contract-schema.sql, версия 20261102095558, приложена 02.11.2026; таблицата е без anon — виж бележката при grafik_schema)
- 02.11 · grafik_letter_map.hours_per_day — numeric(3,1), NULL, без default

(в базата от миграцията transit_vd_import, transit-vd-schema.sql, версия 20261103122006, приложена 03.11.2026)
- 03.11 · goods_transit.inbound_delivery — text, NULL, без default (ВД)
- 03.11 · goods_transit.outbound_delivery — text, NULL, без default (ИД, без водещите нули)
- 03.11 · goods_transit.delivery_position — text, NULL, без default (позиция в доставката)
- 03.11 · goods_transit.delivery_qty — numeric, NULL, без default
- 03.11 · goods_transit.archived_at — timestamptz, NULL, без default
- 03.11 · goods_transit.imported_at — timestamptz, NOT NULL, default now() (кога импортът последно е видял реда)
- 03.11 · goods_transit — уникалност (inbound_delivery, delivery_position); NULL-ите не се сблъскват (ръчните редове са без ВД). Нужна е за UPSERT-а на импорта.
(потвърдено от Живко на 09.11.2026: product_catalog sale_*, goods_transit, grafik_*)

## Изпратено 02.11.2026

Живко моли (02.11) промените, близки по време, да се събират в един имейл; спешните — веднага.

(в базата от миграцията loading_items_nested_codes, loading-stoka-v-stoka-schema.sql, версия 20261101220220, приложена 02.11.2026)
- 01.11 · loading_list_items.nested_codes — text, NULL, без default

(в базата от миграцията users_drop_password, users-drop-password-schema.sql, версия 20261101213607, приложена 01.11.2026)
- 01.11 · users.password — text, колоната е ПРЕМАХНАТА (огледалото никога не е имало стойности: anon няма select върху нея)

(в базата от миграцията grafik_schema, grafik-schema.sql, версия 20261101205213, приложена 01.11.2026)
(ВНИМАНИЕ: таблиците grafik_* са БЕЗ права за anon — огледалото НЕ МОЖЕ да ги тегли с anon ключа. Прието за етап 1 (beta), решение 01.11.2026; преди пускане за всички — решение за бекъп. Редовете са за схемата.)
- 01.11 · нова таблица grafik_vtr — id uuid, name text NOT NULL, note text, created_at timestamptz NOT NULL default now()
- 01.11 · нова таблица grafik_vtr_codes — id uuid, vtr_id uuid NOT NULL, code text NOT NULL, hours numeric(4,1), kind text NOT NULL default 'work', seasons text[], legend text, sort_order int NOT NULL default 0, valid_from date, valid_to date
- 01.11 · нова таблица grafik_vtr_seasons — id uuid, vtr_id uuid NOT NULL, months jsonb NOT NULL, valid_from date, valid_to date
- 01.11 · нова таблица grafik_letter_map — id uuid, vtr_id uuid NOT NULL, letter text NOT NULL, day_kind text NOT NULL, code text NOT NULL, valid_from date, valid_to date
- 01.11 · нова таблица grafik_company_terms — id uuid, company_id uuid NOT NULL, vtr_id uuid NOT NULL, approver text NOT NULL, valid_from date, valid_to date
- 01.11 · нова таблица grafik_store_company — id uuid, store_name text NOT NULL, company_id uuid NOT NULL, blank_name text NOT NULL, address text, valid_from date, valid_to date
- 01.11 · нова таблица grafik_extra_days — id uuid, day date NOT NULL, store_name text, note text, created_by text, created_at timestamptz NOT NULL default now()
- 01.11 · нова таблица grafik_staff — id uuid, store_name text NOT NULL, short_name text NOT NULL, full_name text NOT NULL, contract_title text, position text, sector text, hours_per_day numeric(3,1) NOT NULL default 8, hired_on date, left_on date, sort_order int NOT NULL default 0, note text, prev_staff_id uuid, created_at timestamptz NOT NULL default now(), created_by text, updated_at timestamptz NOT NULL default now(), updated_by text
- 01.11 · нова таблица grafik_months — id uuid, store_name text NOT NULL, month date NOT NULL, status text NOT NULL default 'draft', submitted_at timestamptz, submitted_by text, submitted_by_name text, snapshot jsonb, created_at timestamptz NOT NULL default now(), updated_at timestamptz NOT NULL default now()
- 01.11 · grafik_months.status — нови стойности на статус 'draft', 'submitted'
- 01.11 · нова таблица grafik_rows — id uuid, month_id uuid NOT NULL, staff_id uuid NOT NULL, letters text[] NOT NULL default '{}', locked jsonb NOT NULL default '{}', sort_order int NOT NULL default 0, updated_at timestamptz NOT NULL default now(), updated_by text
- 01.11 · companies — 2 реда (ТЦД 3, Темакс Юг); stores.company_id попълнено за Кърджали, Шумен, Раднево (колоните съществуват отпреди)
- 01.11 · app_settings — нови ключове grafik_beta_users, grafik_trz_users (списъци имейли)

(в базата от миграцията revaluation_codes_store, revaluation-codes-store-schema.sql, версия 20261030123801, приложена 30.10.2026)
- 30.10 · revaluation_codes.store_name — text, NULL, без default (11-те заварени реда → 'Кърджали')

(в базата от миграцията minusi_multi_report, версия 20261028104053, приложена 28.10.2026)
- 28.10 · report_recipients.minus_multi — boolean, NOT NULL, default false
- 28.10 · app_settings — нов ключ minus_multi_count (праг „многократен минус"; начална стойност '3')
- 28.10 · app_settings — нов ключ minus_multi_days (прозорец в дни за „многократен минус"; начална стойност '30')

## Потвърдено 02.11.2026

(миграция bul_allow_postpone, bul-allow-postpone-schema.sql — в базата от миграцията bul_allow_postpone, версия 20261028093135, приложена 28.10.2026)
- 28.10 · recurring_tasks.allow_postpone — boolean, NOT NULL, default true
- 28.10 · recurring_tasks.allow_not_applicable — boolean, NOT NULL, default true

(в базата от миграцията bul_allow_postpone_oneoff, bul-allow-postpone-oneoff-schema.sql, версия 20261028124513, приложена 28.10.2026)
- 28.10 · bulletin_tasks.allow_postpone — boolean, NOT NULL, default true
- 28.10 · bulletin_tasks.allow_not_applicable — boolean, NOT NULL, default true
(потвърдено от Живко с писмо на 02.11: recurring_tasks 26 реда, bulletin_tasks 94 реда; огледалото 89 таблици, 0 грешки)

## Потвърдено 27.10.2026

(в базата от миграцията 20261026210000_weekly_checklist_freezes, версия 20261026210148, приложена 26.10.2026)
- 26.10 · нова таблица weekly_checklist_freezes — year int NOT NULL, week_number int NOT NULL, frozen_at timestamptz NOT NULL default now(), frozen_by text NULL; PK (year, week_number)

(в базата от миграцията 20261026120000_weekly_checklist_portal_mode, версия 20261026125017, приложена 26.10.2026)
- 26.10 · weekly_checklist_metrics.portal_mode — text, NULL, без default (стойности 'any' / 'count' / 'file_none')

(в базата от миграцията 20261024090000_storno_notes_notify, версия 20261024125100, приложена 24.10.2026)
- 24.10 · storno_notes.notify_error — text, NULL, без default
- 24.10 · storno_notes.notified_at — timestamptz, NULL, без default
- 24.10 · storno_note_replies.notify_error — text, NULL, без default
- 24.10 · storno_note_replies.notified_at — timestamptz, NULL, без default
(потвърдено от Живко с писмо на 27.10: огледалото 89 таблици, 0 грешки)

## Потвърдено 24.10.2026

- 21.10 · stock_differences.type — нова стойност 'storno' (text, без промяна в схемата)
- 22.10 · нова таблица picking_pallets (миграция 20261022133218_picking_pallets_schema) — id uuid PK default gen_random_uuid(), warehouse text NOT NULL, store_name text NOT NULL, kind text NOT NULL default 'pallet' (стойности 'pallet' / 'bulk' / 'carton'), no int NOT NULL, created_on date NOT NULL default current_date, status text NOT NULL default 'open' (стойности 'open' / 'closed'), note text NULL, created_by text NULL, created_at timestamptz NOT NULL default now(), closed_by text NULL, closed_at timestamptz NULL, shipment_id uuid NULL (връзка към picking_shipments идва с част Б), loaded_by text NULL, loaded_at timestamptz NULL, received_status text NULL (стойности 'received' / 'missing'), received_by text NULL, received_at timestamptz NULL, receive_note text NULL; уникалност (warehouse, store_name, kind, no, created_on)
- 22.10 · нова таблица picking_pallet_items (същата миграция) — id uuid PK default gen_random_uuid(), pallet_id uuid NOT NULL → picking_pallets (on delete cascade), line_id uuid NOT NULL → picking_lines (on delete cascade), qty numeric NOT NULL, qty_received numeric NULL, receive_comment text NULL, created_at timestamptz NOT NULL default now(); уникалност (pallet_id, line_id)

(в базата от миграцията 20261022133937_minusi_note_required, приложена 22.10.2026)
- 22.10 · minus_reasons.requires_note — boolean, NOT NULL, default false (true за „клиентска поръчка (номер/дата)")

- 23.10 · нова таблица weekly_checklist_responses (миграция 20261023120000_weekly_checklist_responses, в базата версия 20261023093627, приложена 23.10.2026) — id uuid PK default gen_random_uuid(), year int NOT NULL, week_number int NOT NULL, store_name text NOT NULL, metric_key text NOT NULL (→ weekly_checklist_metrics.key), text text NOT NULL, created_by text NULL, created_at timestamptz NULL default now(), updated_at timestamptz NOT NULL default now(); уникалност (year, week_number, store_name, metric_key) — за UPSERT
- 23.10 · нова таблица picking_shipments (миграция 20261023085447_picking_shipments_schema) — id uuid PK default gen_random_uuid(), warehouse text NOT NULL, store_name text NOT NULL, status text NOT NULL default 'loading' (стойности 'loading' / 'departed' / 'received' / 'partial'), vehicle text NULL, driver text NULL, note text NULL, created_by text NULL, created_at timestamptz NOT NULL default now(), departed_by text NULL, departed_at timestamptz NULL, received_by text NULL, received_at timestamptz NULL, notify_error text NULL, notified_at timestamptz NULL
- 23.10 · picking_pallets.shipment_id — колоната е пратена с реда от 22.10 (под „Потвърдено 24.10.2026“, заедно с останалите колони за част Б на picking_pallets и picking_pallet_items); от тази миграция сочи → picking_shipments (on delete set null), нова колона няма

(в базата от миграцията 20261023094357_storno_notes, приложена 23.10.2026)
- 23.10 · нова таблица storno_notes — id uuid PK default gen_random_uuid(), store_name text NOT NULL, supplier text NULL, document_number text NULL, body text NOT NULL, files jsonb NOT NULL default '[]', status text NOT NULL default 'open' (стойности 'open' / 'storno' / 'closed'), report_id uuid NULL → differences_reports(id) (on delete set null), created_by text NULL, created_at timestamptz NOT NULL default now(), closed_by text NULL, closed_at timestamptz NULL
- 23.10 · нова таблица storno_note_replies — id uuid PK default gen_random_uuid(), note_id uuid NOT NULL → storno_notes(id) (on delete cascade), body text NOT NULL, files jsonb NOT NULL default '[]', side text NOT NULL (стойности 'store' / 'accounting' / 'co'), created_by text NULL, created_at timestamptz NOT NULL default now()
(потвърдено от Живко на 24.10: в огледалото, първото пълно изпълнение без грешки; таблиците стават 88; броят на редовете в 8-те засегнати места съвпада с базата — сверено от чата на 24.10; уникалностите не са копирани като ограничения, огледалото синхронизира по id и има обикновени индекси по същите колони)

## Потвърдено 23.10.2026

(в базата от миграцията 20261022130434_minusi_repeat, приложена 22.10.2026)
- 22.10 · minus_movements.action — text, NULL, без default
- 22.10 · app_settings — нов ключ minus_repeat_days (брой дни за повторение на минус; начална стойност '10')
(потвърдено от Живко на 23.10: в огледалото, първото пълно изпълнение без грешки; таблиците остават 82; синхронизирането е сменено от 30 на 60 минути (огледалото е най-много час назад))

## Потвърдено 22.10.2026

- 21.10 · нова таблица picking_batches (миграция 20261021090405_picking_schema) — id uuid PK default gen_random_uuid(), warehouse text NOT NULL, source text NOT NULL (стойности 'planned' / 'unplanned'), file_name text NULL, rows_total int NULL, rows_imported int NULL, rows_skipped int NULL, uploaded_by text NULL, uploaded_at timestamptz NOT NULL default now()
- 21.10 · нова таблица picking_lines (същата миграция) — id uuid PK default gen_random_uuid(), batch_id uuid NOT NULL → picking_batches (on delete cascade), warehouse text NOT NULL, store_name text NOT NULL, sap_code text NOT NULL, product_name text NULL, unit text NULL, qty_requested numeric NOT NULL, supply_group text NULL, sap_order text NULL, sap_item text NULL, line_no int NULL, status text NOT NULL default 'open' (стойности 'open' / 'picked' / 'skipped'), qty_picked numeric NULL, comment text NULL, done_by text NULL, done_at timestamptz NULL, created_at timestamptz NOT NULL default now(); уникалност (warehouse, sap_order, sap_item)
- 21.10 · app_settings — нов ключ picking_users (списък имейли, разделени със запетая)
(потвърдено от Живко с писмо на 22.10: 82 таблици, 0 грешки; уникалността по warehouse, sap_order, sap_item — обикновен индекс в огледалото)

## Потвърдено 21.10.2026

(в базата от миграциите 20261021050541_minusi_schema и 20261021050606_minusi_seed, приложени 21.10.2026)
- 20.10 · нова таблица minus_plants — plant text PK, store_name text NOT NULL, role text NOT NULL (стойности 'доставка' / 'продажби' / 'наличност')
- 20.10 · нова таблица minus_uploads — id uuid PK default gen_random_uuid(), uploaded_at timestamptz NOT NULL default now(), uploaded_by text NULL, file_name text NULL, rows_total int NULL, rows_new int NULL, date_from date NULL, date_to date NULL
- 20.10 · нова таблица minus_reasons — id serial PK, label text NOT NULL, excluded_from_revision boolean NOT NULL default false, active boolean NOT NULL default true, sort int NULL
- 20.10 · нова таблица minus_uom_thresholds — uom text PK, min_qty numeric NOT NULL
- 20.10 · нова таблица minus_movements — id uuid PK default gen_random_uuid(), upload_id uuid NULL → minus_uploads, plant text NOT NULL, store_name text NOT NULL, material text NOT NULL, material_desc text NULL, mvt_type text NOT NULL (стойности '955' / '956'), qty numeric NOT NULL, uom text NULL, mat_doc text NOT NULL, doc_item text NOT NULL, doc_year int NOT NULL, posting_date date NOT NULL, header_text text NULL, real_code text NULL, reason_id int NULL → minus_reasons, employee_name text NULL, note text NULL, filled_by text NULL, filled_at timestamptz NULL, created_at timestamptz NOT NULL default now(); уникалност (mat_doc, doc_item, doc_year) (в огледалото — обикновен индекс вместо UNIQUE; дубликатите се спират само в Supabase, ограничение minus_movements_doc_uq)
- 20.10 · app_settings — нов ключ minus_stores (списък имена на обекти, разделени със запетая; начална стойност 'Гоце Делчев')
(потвърдено от Живко с писмо на 21.10: 80 таблици, 0 грешки; minus_plants, minus_reasons, minus_uom_thresholds се презареждат цялостно на всеки цикъл)

## Потвърдено 19.10.2026

- 18.10 · transfers.departed_at — timestamptz, NULL, без default (кога е тръгнал бусът / камионът)
  (в базата от миграцията 20261018151927)
- 18.10 · transfers.departed_by — text, NULL, без default (кой е отбелязал „Тръгна")
  (в базата от миграцията 20261018151927)
- 18.10 · transfers.status — нова стойност на статус 'sent' („Изпратен"; досега 'planned' / 'partial' / 'done')
- 15.10 · transfer_cargo_events.unit — integer, NULL, без default (номер на единицата 1..qty; null = целият товар) (индекс transfer_cargo_events_unit_once — само в Supabase, не е в огледалото)
  (в базата от миграцията 20261015132314)

## Потвърдено 16.10.2026

- 15.10 · нова таблица revision_schedule — id uuid PK default gen_random_uuid(), starts_on date NOT NULL, ends_on date NOT NULL, kind text NOT NULL default 'groups' (стойности 'groups' / 'none' / 'movements'), note text NULL, groups jsonb NOT NULL default '[]', created_by text NULL, created_at timestamptz NOT NULL default now(), updated_by text NULL, updated_at timestamptz NULL; уникалност (starts_on)
  (в базата от миграцията 20261015075210; файл 20261015090000_revision_schedule)
- 15.10 · revaluation_items.co_qty — numeric(12,3), NULL, без default (прехвърлено количество, ЦО)
- 15.10 · revaluation_submissions.processed_at — timestamptz, NULL, без default
- 15.10 · revaluation_submissions.processed_by — text, NULL, без default
- 15.10 · revaluation_submissions.status — нова стойност на статус 'processed' (обработена от ЦО; досега 'draft' / 'submitted')
  (в базата от миграцията 20261015102839; файл 20261015140000_revaluation_co)
- 15.10 · нова таблица revaluation_codes — new_sap_code text PK, sap_code text NOT NULL, product_name text NULL, unit text NULL, std_price numeric(10,2) NULL, campaign_id uuid NULL → revaluation_campaigns (при изтриване на кампанията → NULL), created_in_sap_at timestamptz NOT NULL default now(), created_by text NULL
  (в базата от миграцията 20261015132455; файл 20261015180000_revaluation_codes)
  (потвърдено от Живко с писмо на 16.10 в 10:33: 75 таблици, 0 грешки)

## Потвърдено 15.10.2026

- 14.10 · transfers.plate_no — text, NULL, без default (регистрационен номер на камиона)
  (в базата от миграцията 20261014113103)
- 14.10 · transfers.mode — нова стойност на статус 'truck' (камион; досега 'bus' / 'courier')
  (потвърдено от Живко на 15.10: в огледалото)
- 11.10 · нова таблица revaluation_campaigns — id uuid PK, title text NOT NULL, kind text NOT NULL default 'mandatory' (стойности 'mandatory' / 'optional'), starts_on date NOT NULL, ends_on date NOT NULL, default_pct numeric(5,2) NULL, note text NULL, status text NOT NULL default 'open' (стойности 'open' / 'closed'), created_by text NULL, created_at timestamptz NOT NULL default now(), closed_at timestamptz NULL, closed_by text NULL
  (в базата от миграцията 20261011204320)
- 11.10 · нова таблица revaluation_submissions — id uuid PK, campaign_id uuid NOT NULL → revaluation_campaigns, store_name text NOT NULL, default_pct numeric(5,2) NULL, no_items boolean NOT NULL default false, store_note text NULL, status text NOT NULL default 'draft' (стойности 'draft' / 'submitted'), submitted_at timestamptz NULL, submitted_by text NULL, reopened_at timestamptz NULL, reopened_by text NULL, created_at timestamptz NOT NULL default now(); уникалност (campaign_id, store_name) (в огледалото — обикновен индекс вместо UNIQUE)
  (в базата от миграцията 20261011204320)
- 11.10 · нова таблица revaluation_items — id uuid PK, submission_id uuid NOT NULL → revaluation_submissions, campaign_id uuid NOT NULL → revaluation_campaigns, store_name text NOT NULL, sort_order integer NOT NULL default 0, sap_code text NOT NULL, product_name text NULL, unit text NULL, qty numeric(12,3) NOT NULL default 0, store_comment text NULL, std_price numeric(10,2) NULL, discount_pct numeric(5,2) NULL, proposed_price numeric(10,2) NULL, new_sap_code text NULL, sale_price numeric(10,2) NULL, co_comment text NULL, co_by text NULL, co_at timestamptz NULL, created_by text NULL, created_at timestamptz NOT NULL default now(), updated_at timestamptz NULL
  (в базата от миграцията 20261011204320)
- 13.10 · нова таблица supply_no_need — id uuid PK, template_id uuid NOT NULL → supply_templates, store_name text NOT NULL, week_start date NOT NULL, created_by text NULL, created_at timestamptz NOT NULL default now(); уникалност (template_id, store_name, week_start) (в огледалото — обикновен индекс вместо UNIQUE)
  (в базата от миграцията 20261013062446)

## Потвърдено 12.10.2026

- 11.10 · supply_entries.note — text, NULL, без default
  (в базата от миграцията 20261011144917)
- 11.10 · recurring_tasks.store_hints — jsonb, NULL, без default
  (жокер по обект под постоянната задача; recurring-task-store-hints-schema.sql)
- 11.10 · нова таблица supply_store_notes — id uuid PK, template_id uuid, store_name text, week_start date, co_note text NULL, co_note_by text NULL, co_note_at timestamptz; уникалност (template_id, store_name, week_start) (в огледалото — обикновен индекс вместо UNIQUE)
  (в базата от миграцията 20261011185952)
  (потвърдено от Живко на 12.10 в 13:48: огледалото е наваксало)

## Потвърдено 11.10.2026

- 06.10 · report_recipients.co_overdue — boolean, NOT NULL, default false
- 06.10 · client_orders.delivery_reason — text, NULL, без default
- 30.09 · stock_differences.warehouse_response — нова стойност на статус 'sent_sap'
- 30.09 · stock_differences.store_response — нова стойност на статус 'sap_accepted'
  (миграцията 20260930120000_stock_differences_sent_sap)
  (потвърдено от Живко: огледалото е наваксало)

## Изпратено 04.10.2026

- 02.10 · stock_returns.confirmed_by — text, NULL
- 02.10 · stock_returns.confirmed_at — timestamptz, NULL
- 01.10 · task_completions.status — нова стойност на статус 'not_applicable'

## Изпратено 01.10.2026

- 01.10 · bulletin_tasks.due_window — boolean, NOT NULL, default false
  (потвърдено от Живко: 68 таблици, 0 грешки)
