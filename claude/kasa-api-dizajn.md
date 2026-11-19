# Каса — kasa-api: опис и проект (етап 1а)

Сесия: kasa-api-opis · 19.11.2026 · база: `origin/main` f6276ae · САМО опис и
проект — нито ред код, база или едж функция не е променен.

Числата в този файл са проверени на 19.11.2026: кодът — с grep в worktree на
f6276ae (без `tests/`, `tools/`, `.claude/worktrees/`), базата — с четене през
MCP (`execute_sql`, само SELECT). Където е предположение, пише „предположение“.

## 0. Изходно състояние (проверено в базата 19.11.2026)

| Таблица | Редове | Обекти | За 30 дни | Политика | anon S/I/U/D |
|---|---:|---:|---:|---|---|
| `kasa_reports` | 4 375 | 19 | 974 | `anon_all_kasa` (ALL, anon) | ✓ ✓ ✓ ✗ |
| `kasa_glavna` | 2 353 | 19 | 537 | `anon_all_glavna` (ALL, anon) | ✓ ✓ ✓ ✗ |
| `kasa_zoborot` | 2 339 | 19 | 537 | `anon_all_zoborot` (ALL, anon) | ✓ ✓ ✓ ✗ |
| `kasa_documents` | 4 664 | 19 | 1 043 | `anon_all_docs` (ALL, anon) | ✓ ✓ ✓ ✗ |
| `kasa_storno` | 7 704 | 18 | 2 124 | `anon_all_storno` (ALL, public) | ✓ ✓ ✓ ✓ |
| `kasa_storno_items` | 29 126 | — | — | `anon_all_storno_items` (ALL, public) | ✓ ✓ ✓ ✓ |
| `daily_turnover` | 1 567 | 18 | 558 | `anon_all_daily_turnover` (ALL, public) | ✓ ✓ ✓ ✗ |

Bucket `kasa-docs`: `public=false`, без лимит за размер и тип; 4 515 файла,
~3.9 GB, 1 034 за последните 30 дни. Storage политики за **anon**:
`kasa_docs_read` (SELECT), `kasa_docs_sign` (SELECT), `kasa_docs_upload`
(INSERT), `kasa_docs_delete` (DELETE) — всички само с `bucket_id = 'kasa-docs'`,
без условие за обект. UPDATE политика няма (затова `x-upsert: true` при
качването не може да презапише чужд файл — предположение по документацията на
Storage, не е пробвано).

Две находки за файловете, важни за т.4:
- **Пътят не носи обекта.** `uploadKasaDoc` (kasa-docs.js:9) прави
  `store_name.replace(/[^a-zA-Z0-9]/g,'_')` — кирилицата става подчертавки.
  В bucket-а има точно 6 префикса: `_______` (1263), `_____` (1215),
  `________` (852), `______` (812), `_________` (256), `___________` (117) —
  тоест префиксът е само ДЪЛЖИНАТА на името. Собственикът на файла се знае
  единствено от `kasa_documents.file_url → store_name`.
- 11 файла в bucket-а нямат ред в `kasa_documents` (сираци), 1 ред в
  `kasa_documents` няма файл; няма `file_url`, вписан на два обекта.
  1 ред в `kasa_documents` е с дата в бъдещето (07.12.2026).

Резервно копие: `perform_daily_backup` включва `kasa_reports`, `kasa_glavna`,
`kasa_zoborot` (+ `*_data`), но **не** `kasa_storno`, `kasa_storno_items`,
`kasa_documents`, `daily_turnover` (regex по `prosrc`, 19.11.2026).

## 1. Опис

### 1.1 Четения

Колона „Кой“ = кой стига до кода по видимостта на табовете в `shared.js`
(`setupTabsForRole`): таб Каса — `kasa`, `manager`, `admin` (shared.js:383;
коментарът над него казва и accounting, кодът — не); История — `admin`,
`accounting` (`roleCanSeeHistory`); Днес — `admin`, `controlling`, регионален
`accounting`. `storeQ()` = `assignedStores()`: не-глобален → само своя обект;
глобален (`admin`, `accounting`, `logistics`) → `assigned_stores`, ако е
непразен, иначе всички.

| # | Файл:ред | Функция | Таблица | Филтри / колони | Кой | Кога |
|---|---|---|---|---|---|---|
| R1 | kasa.js:162 | `loadKasa` | kasa_reports | `order=date.desc,pos_number.asc` + `storeQ()`; всички колони; **без дата и без лимит** | kasa, manager, admin | отваряне на таб Каса и всяко вътрешно презареждане |
| R2 | kasa.js:180 | `loadKasa` | kasa_glavna | собствен `store_name` + активна дата | същите | същото |
| R3 | kasa.js:199-200 | `kasaTab('glavna')` | kasa_reports, kasa_glavna | собствен обект + активна дата | същите | бутон „Главна каса“ |
| R4 | kasa.js:659 | `submitKasaForm` | kasa_reports | собствен обект + дата + ПОС; `id,status,cashier_name` | същите | „Запази“ (проверка за дубликат) |
| R5 | kasa.js:756 | `kasaCloseReturnedDay` | kasa_reports | обект + дата; `status,confirmed_at,returned_at` | същите | след потвърждение на ПОС |
| R6 | kasa.js:1068, 1090, 1104 | `saveGlavna` / `confirmGlavna` / `unlockGlavna` | kasa_glavna | собствен обект + дата | същите (unlock — admin, accounting) | след запис |
| R7 | kasa.js:1127-1129 | `printKasaReport` | kasa_zoborot, kasa_glavna, kasa_documents | собствен обект + дата | kasa, manager, admin | бутон „🖨 Разпечатай“ |
| R8 | kasa.js:1391 | `_doPrintKasaReport` (вграден `<script>` в печата) | Storage `sign` | път от kasa_documents; **anon ключът е вписан в печатния HTML** | същите | клик на документ в печата |
| R9 | kasa.js:1535-1536 | `loadZoborot` | kasa_zoborot, kasa_reports | собствен обект + дата | kasa, manager, admin | бутон „Равнение“ |
| R10 | kasa.js:2035 | `loadStorno` | kasa_storno + вложени kasa_storno_items (`STORNO_SELECT`, kasa.js:1981) | собствен обект, **без дата и без лимит** | kasa, manager, admin | бутон „Сторно бележки“ |
| R11 | kasa.js:2177 | `openStornoForm` | kasa_storno_items | `storno_id=eq.<id>` — **без обект** | същите | ✏️ на сторно |
| R12 | kasa-docs.js:52 | `getSignedUrl` ← `openKasaDoc` | Storage `sign`, 3600 сек | всеки път | kasa, manager, admin (+accounting в детайла) | клик на документ |
| R13 | kasa-docs.js:66 | `loadKasaDocs` | kasa_documents | собствен обект + дата | kasa, manager, admin | рендер на ПОС, след качване |
| R14 | kasa-docs.js:251-253 | `loadDailyOverview` | kasa_reports, kasa_zoborot, kasa_documents | дата + `storeQ()` | admin, accounting (История → „Дневен преглед“) | отваряне на История; бутоните ден |
| R15 | kasa-docs.js:375-378 | `openKasaDetail(store,date)` | kasa_reports, kasa_glavna, kasa_zoborot, kasa_documents | **обект от аргумента**, без проверка | admin, accounting | „Детайли →“ |
| R16 | kasa-docs.js:602 | вграден `<script>` в прозореца на детайла | Storage `sign` | anon ключът е вписан в HTML-а | admin, accounting | клик на документ |
| R17 | kasa-docs.js:628 | `returnKasaForRevision` | kasa_reports | обект + дата | admin, accounting | „↩ Върни“ |
| R18 | history.js:115 | `runHistorySearch` | kasa_reports | период + обект от падащото меню ИЛИ `storeQ()`; `sbGetAll` | admin, accounting | „Търси →“ |
| R19 | history.js:122 | `runHistorySearch` | kasa_storno (+items) | същото по `storno_date` | admin, accounting | „Търси →“; банерът (N6) |
| R20 | history.js:432 | `renderHistoryResults` | kasa_documents | период + обект/`storeQ()`; `sbGetAll` | admin, accounting | след търсене |
| R21 | history.js:657-676 | `exportKasaToExcel` | kasa_storno(+items), kasa_zoborot, kasa_glavna, kasa_documents, kasa_reports (`id,store_name,date,`+купюри) | период + обект/`storeQ()`; `sbGetAll`, при `.partial` файлът не се прави | admin, accounting | бутон „📊 Excel“ |
| R22 | history.js:1019 | `previewKasaDoc` | Storage `sign`, 3600 сек | път от реда | admin, accounting | „👁“ в История |
| R23 | daily-turnover.js:308 | `loadOborot` (ЦО) | daily_turnover | дата, **всички обекти** | admin, accounting от ЦО (`OBOROT_CO_ROLES` + `isCentralOfficeUser`) | „💰 Вечерен оборот“ |
| R24 | daily-turnover.js:321 | `loadOborot` (обект) | daily_turnover | собствен обект, последните 30 дни | kasa, manager, admin (`OBOROT_ROLES`) | същото |
| R25 | daily-turnover.js:976 | `submitOborotEdit` | daily_turnover | обект на реда + нова дата; `id` | admin, accounting от ЦО | корекция с нова дата |
| R26 | report.js:476, 481, 496, 498, 499 | `collectDailyKasaSection` ← `collectDailyReportData` | kasa_zoborot, kasa_reports | `status=eq.returned` (**цялата таблица**), `date=in.(…)`, `date=eq.<ден>`; тесни select-и | admin (бутон „Тест до мен“, admin.js:1423) | бутон |
| R27 | report.js:1939, 1940, 1968 | `collectCrossModuleWeeklySummary` ← `collectWeeklyReportData` и `todayLoadCross` (today.js:458) | kasa_storno, kasa_zoborot | прозорец по дата, **всички обекти** — `scope` се прилага в JS след четенето (report.js:1920) | admin (тест); admin, controlling, регионален accounting (Днес) | бутон; отваряне на „Днес“ |
| R28 | notifications.js:177 | `showLoginBanner` | kasa_reports | собствен обект + `status=eq.returned` | **всеки потребител** (не само касовите роли) | вход |
| R29 | notifications.js:198 | `showLoginBanner` | kasa_storno | последните 30 дни, **всички обекти** (без `storeQ`) | admin, accounting | вход |

`bulletin.js`, `today.js`, `shared.js`, `sw.js` споменават таблиците само в
коментари / кеш списък — собствени заявки нямат (today.js минава през R27).

### 1.2 Записи и триене (за етап 3 — само списък)

| # | Файл:ред | Функция | Таблица | Операция |
|---|---|---|---|---|
| W1 | kasa.js:633 / 636 | `submitKasaForm` | kasa_reports | PATCH по id / POST |
| W2 | kasa.js:711 | `confirmKasaReport` | kasa_reports | PATCH status=confirmed |
| W3 | kasa.js:768, 770 | `kasaCloseReturnedDay` | kasa_glavna, kasa_zoborot | PATCH `status=eq.returned` по обект+дата |
| W4 | kasa.js:1061 / 1062 | `saveGlavna` | kasa_glavna | PATCH / `kasaUpsert` (POST → 409 → PATCH) |
| W5 | kasa.js:1081 | `confirmGlavna` | kasa_glavna | PATCH |
| W6 | kasa.js:1100 | `unlockGlavna` | kasa_glavna | PATCH обратно в draft |
| W7 | kasa.js:1400 | `unlockKasaReport` | kasa_reports | PATCH обратно в draft |
| W8 | kasa.js:1802 | `saveZoborot` | kasa_zoborot | PATCH / `kasaUpsert` |
| W9 | kasa.js:1842 | `confirmZoborot` | kasa_zoborot | суров `fetch` PATCH (не през sbPatch) |
| W10 | kasa.js:1862 | `unlockZoborot` | kasa_zoborot | PATCH |
| W11 | kasa.js:2130 | `returnStornoForComment` | kasa_storno | PATCH |
| W12 | kasa.js:2150 | `resubmitStorno` | kasa_storno | PATCH |
| W13 | kasa.js:2400 | `submitStornoForm` | kasa_storno | PATCH / POST |
| W14 | kasa.js:2415 | `stornoSaveItems` | kasa_storno_items | **DELETE** по storno_id |
| W15 | kasa.js:2431 | `stornoSaveItems` | kasa_storno_items | POST (масив) |
| W16 | kasa.js:2449 | `deleteStornoEntry` | kasa_storno | **DELETE** по id |
| W17 | kasa-docs.js:15 | `uploadKasaDoc` | Storage kasa-docs | POST обект, `x-upsert: true` |
| W18 | kasa-docs.js:25 | `uploadKasaDoc` | kasa_documents | POST |
| W19 | kasa-docs.js:204 | `markReady` | kasa_reports | PATCH ready_at/ready_by |
| W20 | kasa-docs.js:634, 646, 656 | `returnKasaForRevision` | kasa_reports, kasa_glavna, kasa_zoborot | PATCH status=returned |
| W21 | daily-turnover.js:762 | `submitOborot` | daily_turnover | POST |
| W22 | daily-turnover.js:838 | `submitOborotCO` | daily_turnover | POST |
| W23 | daily-turnover.js:989 | `submitOborotEdit` | daily_turnover | PATCH |

Storage DELETE от браузъра **няма никъде** (grep за `DELETE` в kasa-docs.js /
kasa.js / history.js) — политиката `kasa_docs_delete` за anon не се ползва от
кода. Същото за DELETE на `kasa_documents` (anon и без това няма права).

## 2. Кой какво вижда днес по кода

Легенда: **свой** = само `currentUser.store_name`; **своите** =
`assigned_stores`; **всички** = цялата верига; **—** = кодът не стига до
таблицата. Това е какво ПОКАЗВА браузърът; самата база дава всичко на всеки,
който има публичния ключ (т.0).

| Роля | reports | glavna | zoborot | documents + файлове | storno (+items) | daily_turnover |
|---|---|---|---|---|---|---|
| kasa | свой (R1) | свой | свой | свой | свой | свой, 30 дни |
| manager | свой | свой | свой | свой | свой | свой, 30 дни |
| sklad | свой — само банерът „върнат“ (R28) | — | — | — | — | — |
| info, user, marketing, supply, controlling | свой — само банерът (R28) | — | — | — | — | — |
| controlling („Днес“) | — | — | всички* (R27) | — | всички* (R27) | — |
| logistics | свой — банерът | — | — | — | — | — |
| admin, без assigned | **всички** (R1 без дата, R14, R18, R26) | свой (ЦО) в Каса; всички в История/детайл | всички | всички | свой в Каса; всички в История, банер | ЦО: всички; иначе свой |
| admin с assigned (1 акаунт) | своите (storeQ) в Каса/История; всички в R26/R27/R29 | своите | своите / всички* | своите | своите / всички (R29) | всички (ЦО) |
| accounting, без assigned (4) | всички (История, детайл) | всички | всички | всички | всички | ЦО: всички |
| accounting с assigned (13, от тях 5 `is_regional`) | своите (История) | своите | своите; всички* (R27 „Днес“, само регионалните) | своите | своите; **всички** в банера R29 | ЦО: **всички** (R23 без storeQ) |

\* „всички“ = браузърът ТЕГЛИ всички обекти, а отсява в JS (`scope` в R27 —
report.js:1920). Данните са в паметта/мрежовия раздел, само не се рисуват.

Разминавания между кода и очакваното (отбелязани, НЕ поправени):
1. **История „с PIN“ — в клиента няма PIN.** `history_pin_hash` се пише от
   `set-history-pin`, но никой `.js` извън `supabase/` не го проверява (grep
   `history.?pin|hist.?pin` — 0 попадения). Табът се пази само с
   `roleCanSeeHistory()`.
2. Коментарът в shared.js:382 казва, че таб Каса е и за accounting; кодът
   (`kasaRoles`) не го включва. Accounting стига до касата само през История.
3. Коментарът в history.js:2 („Видим за: accounting, admin, logistics“) е
   остарял — logistics е вън от 18.10.2026.
4. **R1: admin без assigned тегли `kasa_reports` за всички обекти без дата и
   лимит** — 4 375 реда, а PostgREST реже на 1000 (предположение: `max_rows`
   е подразбиращото се 1000; не е сверено в настройките на проекта). Екранът
   на admin в Каса показва първите 1000 по дата.
5. `storeQ()` ограничава по `assigned_stores` ВСЕКИ глобален потребител, а
   `roleRegionalScope()` — само `accounting` с `is_regional`. 8 accounting
   акаунта имат `assigned_stores`, без да са регионални (13 − 5): в История
   виждат своите, в „Днес“ — нищо (табът е скрит). admin с assigned е
   ограничен в История, но не в „Днес“. Същото като паметта „Регионален има
   три значения“.
6. R29 (банерът за сторно) и R23 (оборотът за ЦО) не гледат `assigned_stores`
   — регионалният accounting вижда всички обекти, докато в История вижда
   своите.
7. R15 `openKasaDetail(store,date)` приема всякакъв обект — пазят го само
   бутоните, които се рисуват.
8. R11 чете `kasa_storno_items` само по `storno_id`, без обект.
9. R28 тече за всеки потребител, вкл. роли без таб Каса (sklad, supply…), и
   показва само първия върнат отчет.

## 3. Проект на kasa-api

### 3.1 Рамка (по образеца на grafik-api)

- Едж функция `kasa-api`: `index.ts` + `handler.ts` (логика, без база) +
  `repo.ts` (supabase-js със service ключа). Само POST, тяло
  `{action, session, …}`; CORS като grafik-api.
- Стъпки при всяка заявка, в този ред:
  1. `verifySession(body.session)` от `_shared/session.ts` — **преди базата**.
     Невалиден или изтекъл → `401 {ok:false, reason:"session_expired",
     message:"Сесията е изтекла — влез отново."}` (същият текст като grafik-api).
  2. `users` по `sess.uid` с `id,email,display_name,store_name,role,
     is_regional,assigned_stores,active` (USER_COLS от grafik-api).
     Няма го или `active=false` → `403 forbidden`. **Ролята и обектът се
     вземат от реда в `users`, не от пропуска и не от тялото** — смяна на
     ролята важи веднага, без да чака 12-те часа.
  3. `scope = resolveScope(user)` — чиста функция в `handler.ts` (тества се
     без база), връща `{stores: string[] | "all", can: {...}}`.
  4. `dispatch(action)`; всяко действие, което получи `store` от браузъра,
     минава през `needStore(scope, store)` → 403 `forbidden_store`, ако
     обектът не е в обхвата. Без `store` → целият обхват.
- `resolveScope` повтаря **днешното** поведение на `storeQ()` (т.2), докато
  Тенчо не реши друго (въпроси 2–4 в т.7): не-глобален → `[store_name]`;
  `admin`/`accounting`/`logistics` → `assigned_stores` или `"all"`. Отделно
  гейт по роля за всяко действие (например `report_rows` само admin).
- Лимити: максимален период в едно четене 400 дни (История/Excel; година +
  запас — числото е предложение); вътре функцията чете на страници по 1000 с
  `order … ,id` (като `sbGetAll`) и връща `{rows, partial}`. Горен таван на
  отговора — 20 000 реда на таблица; над него `413 too_many` с подсказка за
  по-къс период (предложение; днес най-голямото реално е сторно за година
  ~18 000 реда — 7 704 общо за 4.5 месеца, предположение по линейно
  нарастване).
- Одит: `audit_log` само за записите (етап 3) и за `doc_url`
  (кой отвори кой файл). Четенията — само `console.log` с действие и време,
  без лични данни (като grafik-api).

### 3.2 Действия за етап 2 (четене) — 6 на брой

| Действие | Вход | Връща | Покрива |
|---|---|---|---|
| `day` | `store?`, `date` | `{reports, glavna, zoborot, documents}` за обект+ден; `store` по подразбиране своя | R2–R7, R9, R13, R15, R17, проверката R4/R5 |
| `range` | `from`, `to`, `store?`, `kinds[]` (`reports`, `glavna`, `zoborot`, `documents`, `storno`, `oborot`), `cols?` (само бял списък, напр. купюрите за Excel) | `{<kind>: {rows, partial}}` | R1 (с прозорец, виж въпрос 6), R10, R14, R18–R21, R23–R25 |
| `storno_items` | `storno_id` | редовете — само ако сторното е в обхвата | R11 |
| `banner` | — | `{returned_reports: [...], storno_flagged: {count, by_store, partial}}` — второто само за admin/accounting, в обхвата им | R28, R29 |
| `report_rows` | `kind: "daily_kasa" \| "cross_kasa"`, `day` / `window` | редовете с тесните колони, които днес чете report.js | R26, R27 |
| `doc_url` | `document_id` (не път) | `{url, expires_in: 300}` | R8, R12, R16, R22 |

`stornoIndicator` и останалите сметки остават в браузъра — функцията връща
редове, не HTML. Изключение е `banner.storno_flagged`: правилото
`stornoIndicator` се копира в `handler.ts` със синхронизиращ тест (като
`report-edge-sync`), за да не тегли браузърът 2 000+ реда само за брояч.
Ако Тенчо предпочете без копие — `range kinds:["storno"]` с тесни колони.

### 3.3 Действия за етап 3 (запис) — само списък

`report_save`, `report_confirm`, `report_unlock`, `glavna_save`,
`glavna_confirm`, `glavna_unlock`, `zoborot_save`, `zoborot_confirm`,
`zoborot_unlock`, `day_mark_ready`, `day_return` (W20), `storno_save` (W13–W15
в една транзакция — днес DELETE + POST са две заявки), `storno_return`,
`storno_resubmit`, `storno_delete`, `doc_upload_url` + `doc_register`,
`oborot_save`, `oborot_edit`. Кой може какво — по днешните проверки в кода
(`canConfirm`, `canUnlock`, `OBOROT_*`), пренесени в `resolveScope.can`.

### 3.4 Изтекъл пропуск — без загуба на въведеното

- Пропускът е 12 ч. и само в паметта; презареждане на страницата и без това
  значи нов вход (няма session restore). Проблемът е само дълго отворен таб.
- В `shared.js` една обща `kasaApi(action, data)` (по образеца на `grApi`,
  grafik.js:85): връща `{ok, status, data}`; при 401 НЕ пипа DOM-а на модула.
- При 401 се отваря **малък модал „Сесията изтече — въведи паролата“** над
  текущия екран: имейлът е попълнен и заключен, POST към `auth-login`, при
  успех се сменя САМО `currentSession` (без `startApp()`, който рисува
  всичко наново) и последната заявка се праща отново автоматично.
  Отворената форма (ПОС отчет, сторно, оборот) остава непокътната, защото
  нищо не я пре-рендерира. Друг имейл в модала → отказ и пълен изход.
- Предпазна мрежа: при 401 по време на запис полетата на формата се пазят в
  `sessionStorage` (try/catch) под ключ по форма — ако човек все пак
  презареди, формата предлага „Възстанови въведеното“. (Предложение; днес
  нито една касова форма не пази чернова.)
- Проактивно: 10 мин преди `exp` (браузърът знае `exp` от payload-а) — тиха
  лента „Сесията изтича след 10 мин — влез отново“. По желание.

## 4. Файловете в kasa-docs

- Отваряне: браузърът праща `doc_url {document_id}`; функцията чете реда от
  `kasa_documents` (service ключ), проверява `store_name` срещу обхвата и
  връща `createSignedUrl(file_url, 300)` — 5 минути вместо днешните 60.
  Пътят идва от базата, не от браузъра — така префиксите с подчертавки (т.0)
  не пречат.
- Кой кой файл вижда: точно като ред от `kasa_documents` по т.2 — обектът
  своите, регионалният своите обекти, admin/accounting без assigned всички.
- Двата вградени `<script>` (R8 печатът, R16 детайлът) с вписан anon ключ
  стават `window.opener.kasaOpenDoc(id)` — новият прозорец не носи ключ и
  пропуск.
- Сираците (11 файла без ред) остават недостъпни през портала след етап 2 —
  отворен въпрос 9.
- Качване (етап 3): `doc_upload_url {date, report_type, doc_type, file_name}`
  → `createSignedUploadUrl` за път, който функцията сама сглобява (с id на
  обекта или транслитерация, не подчертавки), после `doc_register`. Политиките
  `kasa_docs_*` за anon се махат чак тогава.

## 5. Ред на преминаване

Етап 2 (четене) — функцията първо, после файловете; anon SELECT се отнема
чак когато ВСИЧКИ четения са минали и живите файлове са сверени (CLAUDE.md
т.5).

1. **kasa-api v1** (`me` не трябва — обхватът идва в отговора на всяко
   действие): `handler.ts` + `repo.ts` + Deno тестове (`handler.test.ts`) с
   фалшиво repo, вкл.:
   - обект А иска `day {store:"Б"}` → 403 `forbidden_store`;
   - обект А, `range` без store → в отговора няма нито един ред с
     `store_name ≠ А` (фалшивото repo връща смес, филтърът е във функцията);
   - регионален accounting → само assigned; admin без assigned → всички;
   - `storno_items` за сторно на Б от потребител на А → 403;
   - `doc_url` за документ на Б → 403, за своя → URL с 300 сек;
   - изтекъл/подправен пропуск → 401 преди каквото и да е извикване на repo
     (броячът на repo = 0);
   - `active=false` → 403; ролята в пропуска ≠ ролята в users → важи users.
   Плюс `repo.live-test.ts` (като grafik-api) — четене на живо, само SELECT.
2. **shared.js** — `kasaApi()` + модалът за повторен вход. jsdom тест: 401 →
   модалът, формата с въведени стойности е непокътната, след успешен вход
   заявката се повтаря.
3. Файловете — **паралелно след т.2** (различни файлове, общо е само
   `shared.js`, който вече е готов):
   - `kasa.js` + `kasa-docs.js` — заедно (споделят `kasaReports`,
     `zoborotData`, печата). Тест: таб Каса за `kasa` → само `kasaApi`,
     нула `fetch` към `/rest/v1/kasa_*` и към `/storage/v1/` (шпионин на
     `fetch`).
   - `history.js` — тест: търсене + Excel за регионален → редовете в листа
     са само неговите; `.partial` спира файла както днес.
   - `daily-turnover.js` — тест за двата пътя (обект / ЦО).
   - `notifications.js` — тест за банера (обект с върнат отчет; admin със
     сторна с разминаване).
   - `report.js` — **последен**: `tests/report-edge-sync.test.js` заковава
     съвпадението с `send-scheduled-report`; смяна на заявките в report.js
     иска и решение дали синхронният тест сравнява и `report_rows`.
4. Общ тест-капан: `tests/no-anon-kasa-reads.test.js` — grep по всички
   `.js` извън `supabase/`, `tests/`, `tools/` за `kasa_` / `daily_turnover`
   / `kasa-docs` в `sbGet|sbGetAll|sbGetOk|fetch(` → 0. Регистрира се в
   `tests/run-all.js` в същия комит.
5. Миграция етап 2: `revoke select` за anon/authenticated от седемте таблици +
   махане на `kasa_docs_read`/`kasa_docs_sign`; rollback = обратните `grant`
   и политиките. Само след решението за огледалото (т.6).
6. `tools/regression/*` четат таблиците с anon ключа — минават на kasa-api
   или на service ключ локално (въпрос 10).

## 6. Огледалото (Живко)

Какво губи при етап 2 (`revoke select` от anon): **и седемте таблици** —
огледалото спира да получава нови редове за `kasa_reports`, `kasa_glavna`,
`kasa_zoborot`, `kasa_documents`, `kasa_storno`, `kasa_storno_items`,
`daily_turnover`. Файловете от bucket-а — предположение, че огледалото не ги
тегли изобщо (bucket-ът е `public=false`, а `mirror-schema.sql` не е в това
репо, за да се провери). Четири от седемте (`kasa_storno`, `kasa_storno_items`,
`kasa_documents`, `daily_turnover`) не са и в `perform_daily_backup` — без
огледалото за тях няма друго копие извън Supabase.

Варианти (без решение):
- **А. Отделен ключ само за четене за огледалото** — Postgres роля
  `mirror_reader` с `SELECT` върху нужните таблици и JWT с `role:
  mirror_reader`, подписан с JWT секрета на проекта; PostgREST го приема
  без промяна в `sync-mirror.ps1` освен ключа. Ключът живее само на сървъра
  на Живко. Риск: изтече ли, дава пълното четене, което махаме от anon.
- **Б. Едж функция `mirror-export`** със собствен секрет в заглавен ред —
  връща редовете след `updated_at/created_at`. Изисква промяна в
  `sync-mirror.ps1` (не е PostgREST формат).
- **В. Нощен дъмп** вместо дърпане на всеки 1–5 мин — `perform_daily_backup`
  се разширява с четирите липсващи таблици, а огледалото за Каса изостава до
  денонощие.
- **Г. Огледалото остава без Каса** — прието като компромис (както за
  `grafik_*`, `claude/open/01-11-grafik-backup-before-release.md`).

Предварителен коментар (не решение): А е най-малката промяна за Живко; Б и А
могат да покрият и `grafik_*` с един и същ механизъм.

## 7. Рискове и отворени въпроси към Тенчо

**Решено 19.11 (Тенчо)** — важи пред препоръките по-долу:

1. DELETE за `kasa_storno` / `kasa_storno_items` се отнема в етап 2;
   `deleteStornoEntry` и `stornoSaveItems` минават през kasa-api в етап 2. В
   етап 1б — само подготовка, записът не се превключва.
2. `assigned_stores` ограничава всеки, който го има (като `storeQ`) — без
   промяна в поведението.
3. admin вижда всички обекти винаги (assigned не го ограничава).
4. controlling — само `report_rows`, за всички обекти; `day` / `range` — не.
   logistics — само `banner` за своя обект.
5. PIN за История — извън обхвата.
6. Списъкът в Каса за admin — последните 60 дни + всички върнати.
7. Огледалото — вариант А (отделна роля/ключ само за четене), НЕ в етап 1б;
   отворена точка за етап 2 (`claude/open/19-11-kasa-mirror-role.md`).
8. Подписан линк — 300 сек.
9. Сираците в bucket-а — само списък.
10. `tools/regression` — отделна точка, не сега.
11. Модал за повторен вход в `shared.js` — да.
12. Пилот: kasa-api първо за 2 обекта (Кърджали, Раднево) и admin, с мерене
    по `function_edge_logs`.
13. Копие на `stornoIndicator` в функцията + синхронизиращ тест.

1. **Етап 2 без етап 3 затваря само половината.** Ако се отнеме SELECT, а
   INSERT/UPDATE (и DELETE за сторно) останат, публичният ключ още може да
   пише и трие, вкл. `kasa_storno` по id. *Препоръка:* одобри етап 2 като
   „четене“, но насрочи етап 3 веднага след него; DELETE за `kasa_storno` и
   `kasa_storno_items` да се отнеме още в етап 2 и `deleteStornoEntry` /
   `stornoSaveItems` да минат на kasa-api в същата стъпка (2 места).
2. **Обхватът на `accounting` с assigned, но не регионален (8 акаунта).**
   Днес История ги ограничава, „Днес“ — не им се показва. *Препоръка:* за
   kasa-api — `assigned_stores` ограничава всеки, който го има (както
   `storeQ`), т.е. без промяна в поведението; изчистването на трите значения
   на „регионален“ — отделно решение.
3. **admin с assigned (1 акаунт).** Днес ограничен в История, не в „Днес“
   и банера. *Препоръка:* admin = всички, винаги (както
   `roleRegionalScope`) — едно правило вместо три.
4. **controlling и logistics в касовите данни.** controlling чете сторно и
   равнение за всички през „Днес“ (R27), logistics — нищо освен банера.
   *Препоръка:* controlling — `report_rows` cross да, `day`/`range` — не;
   logistics — само `banner` за своя обект.
5. **PIN за История.** Описанието го споменава, кодът го няма (т.2, 1).
   *Препоръка:* не влиза в kasa-api етап 2; ако се иска — отделна задача
   (проверка в `set-history-pin` / нов `history_unlock`, който удължава
   пропуска с флаг).
6. **R1 — admin тегли цялата `kasa_reports` при всяко отваряне на Каса.**
   *Препоръка:* в kasa-api `range` за списъка в Каса — последните 60 дни +
   всички върнати (`histInWindow` показва 7 дни + върнатите; 60 е запас за
   филтъра по дата). Промяна в поведението за admin — затова питам.
7. **Огледалото** (т.6). *Препоръка:* вариант А, ключът се дава на Живко
   ръчно, плюс разширяване на `perform_daily_backup` с четирите липсващи
   таблици (независимо от огледалото).
8. **Срок на подписания линк към файл.** Днес 3600 сек. *Препоръка:* 300 сек
   — ползва се веднага след клика; печатът, отворен по-късно, пак вика
   функцията.
9. **11 сираци в bucket-а + 1 ред без файл + 1 документ с дата 07.12.2026.**
   *Препоръка:* само списък за Тенчо/счетоводството; нищо не се трие в
   етап 2.
10. **`tools/regression/*` четат с anon ключа.** След етап 2 ще връщат празно.
    *Препоръка:* минават на service ключ от локална `.env` (никога в репото)
    или на kasa-api с пропуск на тестов акаунт.
11. **Повторният вход в модал** е нов UX и пипа `shared.js` (общ файл —
    последователно с други сесии). *Препоръка:* да; алтернатива е
    „Сесията изтече — излез и влез“ като в графика, но тогава въведеното в
    отворена форма се губи.
12. **Студен старт на едж функцията.** Касата се отваря от 18 обекта сутрин;
    grafik-api мери ~80–90 ms на стъпка към базата (коментар в handler.ts).
    Предположение: `day` ще е 2 паралелни нива (users + 4 таблици) ≈ 200–400
    ms топло. *Препоръка:* мерене по `function_edge_logs` в пилот с 2 обекта
    преди всички.
13. **Ключът за `banner.storno_flagged`** — копие на `stornoIndicator` в
    TypeScript (със синхронизиращ тест) или браузърът тегли редовете.
    *Препоръка:* копие + тест — иначе 2 000+ реда при всеки вход на admin.

## Какво не е проверено

- `max_rows` на PostgREST в проекта (приех 1000 по поведението, описано в
  shared.js:57).
- Дали огледалото тегли файлове от `kasa-docs` и как точно е написан
  `sync-mirror.ps1` (не е в репото).
- Поведението на `x-upsert` без UPDATE политика — по документация, не пробвано.
- Времената на kasa-api — няма функция, няма мерене.
