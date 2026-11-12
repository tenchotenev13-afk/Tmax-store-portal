Отворено: 12.11 · Кой чака: чат · Сесия: otcheti-inventar

# Опис на автоматичните писма — етап 1 (Теодор, 11.11)

Сесия: otcheti-inventar · основа `origin/main` `fb3dabd` · само преглед: нищо в
кода, базата или едж функциите не е пипано. Данните са от живата база (MCP,
само SELECT) към 12.11.2026 ~10:00 София. Живите версии на шестте функции, които
пращат писма (`send-scheduled-report` v80, `send-routed-report` v21,
`send-oborot-report` v13, `bulletin-notify` v32, `dynamic-responder` v27,
`resend-email` v61), са свалени с `supabase functions download --use-api` и
сравнени с `cmp`: **и шестте са байт в байт с репото**.

Групите в `users.notify_groups` (днес): **controlling** = Миглена Павлова,
Цветелина Тенева · **co** = Василка Шикова, Жеко Желязков · **regional** =
П. Георгиева, Т. Талева, Т. Иванова, С. Стефанова, Н. Колева, В. Филев (същите
шестима са с `users.is_regional=true`) · **owner** = Теодор Тенев ·
**revaluation** = Елица Гюрова.
„Управители“ = 19 активни акаунта с `role='manager'` (по един на обект; за
Кърджали са ДВА: реалният и тестовият `tencho.tenev13@gmail.com`).

## 1. По крон (сървър)

Всички кронове са в `cron.job`, извикват функцията с `net.http_post`. Часът в
София е от условието `where extract(hour …'Europe/Sofia') = N` в командата.
`report_cron_schedule()` връща само daily / weekly / pallets / warehouse /
minus_multi — **няма `co_overdue`**.

| Писмо | Кога (София) | Крон → функция, тяло | Откъде са получателите (код) | Кой го получава днес |
|---|---|---|---|---|
| Дневен репорт — общ | всеки ден 21:00 | 19 `daily-report-21h` → `send-scheduled-report` `{"type":"daily"}` | `report_recipients` `active` + `daily=true` + празен `scope_stores` → едно писмо, общо „до“ | Теодор Тенев (t.tenev@), Тен Тенев (ten.tenev@) |
| Дневен репорт — личен | същото | същото | 1) `users.is_regional` → `assigned_stores`; 2) `report_recipients.daily` с непразен `scope_stores`; 3) `role='manager'` → собственият обект, само ако `app_settings.daily_report_managers='on'`. Отделно писмо на човек, дедупликация по имейл | 6-имата регионални (по техните обекти) + 19 управители (`daily_report_managers=on`), вкл. **тестовият gmail за Кърджали**. С обхват по `daily` — никой |
| Седмичен репорт — общ | неделя 21:00 | 20 `weekly-report-sun-21h` → `{"type":"weekly"}` | `report_recipients.weekly=true` (`scope_stores` се пренебрегва) | Теодор, Тен |
| Седмичен репорт — личен | същото | същото | регионалните + управителите при `weekly_report_managers='on'` | 6 регионални + 19 управители (вкл. тестовия gmail) |
| Палети | петък 18:00 | 17 `pallets-report-friday-21` → `{"type":"pallets"}` | общо: `report_recipients.pallets=true` без обхват; лично: регионалните (`assigned_stores`) + `pallets=true` с обхват (`reportPalletsRecipients`) | общо: Теодор, Тен, Стефан Георгиев (s.georgiev@); лично: 6 регионални |
| Логистичен склад — необработени заявки | неделя 21:00 | 18 `warehouse-report-sunday-21` → `{"type":"warehouse"}` | `users.role='logistics'` → за своя склад (`store_name`); + `report_recipients.warehouse=true` → по писмо за всеки склад (`reportWarehouseRecipients`) | logistichen@ (Добрич), logistichen2@ (Търговище); `warehouse=true` — никой |
| Просрочени клиентски заявки — ЦО | пн–пт 08:00, без празници | 26 `co-overdue-weekdays-8h` → `{"type":"co_overdue"}` | `report_recipients.co_overdue=true` — едно общо писмо | Теодор, Василка Шикова |
| Минуси — повтарящи се артикули | понеделник 11:00 | 30 `minus-multi-mon-8h` → `{"type":"minus_multi"}` | `report_recipients.minus_multi=true` (обхват = `scope_stores` ∩ `app_settings.minus_stores`; без обхват — всички) + регионалните (`assigned_stores` ∩ `minus_stores`) — `reportMinusMultiPlan`, писмо на човек | без обхват: Миглена Павлова, Теодор. С обхват (изведено от данните, не с dry_run): Стефанова (Монтана, Троян), Колева (Гоце Делчев, Петрич), Георгиева (Пирдоп), Талева (Габрово), Т. Иванова (Добрич, Търговище, Шумен), Филев (Добрич, Търговище, Шумен). С обхват се праща само ако има минус в неговите обекти |
| Вечерен оборот | всеки ден 20:45 | 14 `oborot-report-evening` → `send-oborot-report` `{}` | `users.oborot_report` = `'all'` (всички обекти) / `'assigned'` (`assigned_stores`) | all: Теодор, Тен; assigned: 6-имата регионални |
| Личен седмичен отчет по задачи | понеделник 08:10 | 16 `weekly-routed-report` → `send-routed-report` `{}`; тема `weekly_routed` в `notification_topics` (вкл./изкл.) | `report_groups` на задачите от приключилата седмица (`bulletin_tasks` + `recurring_tasks`): група → `users.notify_groups`; `user:<имейл>` → поименно; + създателят на задачата | групите отгоре + поименно: Н. Борисов, П. Великова, С. Недялкова, М. Йорданова, Е. Гюрова, ТРЗ (trz@), Д. Иванова, Ц. Тенева. Последно 09.11: 16 писма, 18 задачи |
| Отчет по задача | по график на реда | 11 (всеки 15 мин) → `dynamic-responder` → `send-routed-report` `{task_id, recipients, run_date, run_time}` | `notification_schedules.target_recipients` (`entity_type='task_report'`): `groups[]` → `notify_groups`, `user_ids[]` → `users.id` | 30 активни реда; 5 изпратени за 7 дни. Получателите са различни на всеки ред |
| Просрочени задачи | пн–пт 08:15 | 15 (всеки 15 мин) → `bulletin-notify`, тема `overdue_tasks` | `notification_matrix` (co: имейл, само своите; controlling: имейл+push, всички; regional: имейл, своите обекти) + `notification_overrides` + създателите на задачите | Шикова, Желязков, Павлова, Тенева, 6 регионални, Тен Тенев (override „include, all“) + създателите. Писмо тръгва само при неотметнато „за него“ — 12.11: 4 писма |
| Изтекъл срок | 15 мин след `due_time` на задачата, всеки ден | 15 → `bulletin-notify`, `deadline_passed` | `recurring_tasks.report_groups` (група → `notify_groups`, `user:` → поименно) — `resolveTaskRecipients`, НЕ матрицата | 16 постоянни задачи с `due_time` и `report_groups`; 11.11: 10 писма |
| Изтичащи промоции | всеки ден 08:30 | 15 → `bulletin-notify`, `promo_expiring` | матрица: controlling — имейл; store — push | имейл: Павлова, Тенева; push до обектите. Праща само при промоция, изтичаща днес |
| Товарни листи — неприети 48 ч | пн–пт 09:00 | 15 → `bulletin-notify`, `loading_lists_pending` | всички активни акаунти с `store_name` = обекта (имейл) + push по таг `store_name` | акаунтите на обекта; 12.11: 3 обекта, 6 писма |
| Напомняне до обекта | 2 ч преди часа на задачата | 15 → `today_deadlines` | матрица store → **само push** | без имейл |
| Минуси — непопълнени | пн–пт 10:00 | 15 → `minus_unfilled` | push по таг `store_name` за обектите от `minus_stores` | **само push**, без имейл |
| Напомняния по задача / подзадача | по график | 11 → `dynamic-responder` → `resend-email` (`type: push`) | `notification_schedules` (`task` — 2 активни реда; `promotion` / `recurring_task` — неактивни) | push, не имейл |
| RM-app напомняния | пн–пт 08 / 14 / 17 | 4, 5, 6 → `swift-handler` | — | **не е за портала** (push към RM-app) |

**Твърд имейл в код, който праща:** няма. Изпращачът `portal@temax.bg` е в
`resend-email`. Твърдите адреси в `*.js` (`c.teneva@`, `m.pavlova@`,
`j.jeliazkov@`, `minus@`, `ten.tenev@` в коментар) са проверки за права или
надписи в бланката, не получатели. Поименни адреси има в ДАННИТЕ:
`report_groups` (`user:…`), `app_settings.picking_users`,
`app_settings.revaluation_done_cc`.

## 1б. По действие в браузъра (`sendEmail` в `email.js` → `resend-email`)

| Писмо | При какво | Получатели (код) | Днес |
|---|---|---|---|
| Товарен лист от склад | „Изпрати“ лист (`loading.js` `llNotifySent`) | акаунтите на обекта (`users.store_name`, `llStoreEmails`) + push + PDF | акаунтите на всеки обект в листа |
| Извънреден ред | обектът добавя ред (`llNotifyRowAdded`) | акаунтите на склада + регионалните на обекта (`is_regional` + `assigned_stores`, `llRegionalEmails`) | |
| Одобрен / отхвърлен ред | складът решава (`llNotifyRowDecided`) | акаунтите на обекта | |
| Товарен лист приключен / с липси | `llNotifyClosed` | акаунтите на склада | |
| Пикинг — „🚚 Тръгна“ | `picking.js` `pkNotifyShipment` | акаунтите на обекта, които са и в `app_settings.picking_users` | `picking_users` = ten.tenev@, v.filev@, tencho.tenev13@gmail.com → на практика само тестовият акаунт на Кърджали |
| Разлики — до доставчик | ръчно „✉️ Изпрати“ (`sendDiffEmail`) | ръчно въведени до / копие / отговор; бутонът е само за Ц. Тенева и admin | ръчно |
| Разлики — Сторно бележка / отговор | `sdNoteNotify` | обектът: `role in ('manager','sklad')` на обекта; отговор → авторът по `display_name` | |
| Преоценка — подадено | `revaluation.js` `rvNotify` | `notify_groups` ∋ `revaluation` + регионалните на обекта | Е. Гюрова + регионалния |
| Преоценка — обработено | `revaluation.js` ~1160 | имейлите на обекта + копие `app_settings.revaluation_done_cc` | копие: t.tenev@ |
| Чек лист | „✉️ Изпрати“ (`checklist.js`) | по един адрес на обект (първо manager, първо @temax.bg), ръчно отметнат списък | |
| Бюлетин — седмичен дайджест | меню „Имейл“ / понеделнишки банер (`sendWeeklyDigest`) | всички активни `role='manager'` | 19 управители |
| Дневен / седмичен — „📤 Изпрати сега“ | Администрация → Известия (`report.js` `sendDaily/WeeklyReportToRecipients`) | `report_recipients.daily` / `weekly` — **всички в едно общо писмо** | Теодор, Тен |
| „Тест до мен“ (всички общи отчети) | бутон | `currentUser.email`, тема с „(тест)“ | натисналия |

**Без имейл:** Трансфери (в `transfers.js` няма нито push, нито писмо — няма
„🚚 Тръгна“ с известие), Клиентски заявки и Каса (само push), Стока на път,
Палети, Минуси, За връщане (нищо от браузъра).

## 2. Има ли списък на получателите без пращане (dry_run)

| Тип | dry_run | Връща ли получателите |
|---|---|---|
| `minus_multi` | да | **да** — имейл, име, обхват, `send` по човек |
| `bulletin-notify` (`overdue_tasks`, `today_deadlines`, `deadline_passed`, `promo_expiring`, `loading_lists_pending`, `minus_unfilled`) | да (`{"topic_key":…, "dry_run":true}`) | **да** — `planned` по човек / обект |
| `send-routed-report` (седмичен и по задача) | да | да (по получател) — да се провери формата преди етап 2 |
| `co_overdue` | да | **само броя** (`recipients: N`), без имената |
| `weekly` | да | **не** — само броевете на две секции, без получатели |
| `daily`, `pallets`, `warehouse` | **не** | — |
| `send-oborot-report` | да | **не** — връща HTML-а, не получателите |
| Писмата от браузъра | — | няма; правилата са в самите `*.js` |

Изводът за етап 2: изборът кой получава вече е в отделни функции
(`reportPalletsRecipients`, `reportWarehouseRecipients`,
`reportCoOverdueRecipients`, `reportMinusMultiPlan`, `resolveRecipients`,
`resolveTaskRecipients`, `buildRecipientMap`). Липсва режим „само
получатели“ за daily / weekly / pallets / warehouse / co_overdue / oborot. За
daily и weekly логиката е **вградена в `Deno.serve`** (не е отделна функция) —
трябва да се изнесе (`reportDailyWeeklyRecipients`), иначе таблицата ще е второ
копие на правилата.

## 3. Код срещу логове (5.11–12.11)

`cron.job_run_details`: всички задания с писма — 0 неуспешни за 7 дни.
`function_edge_logs` по дни съвпада с графика: daily 1/ден в 19 UTC, oborot
1/ден в 18:45 UTC, co_overdue пн–пт 06 UTC, pallets петък 16 UTC, minus_multi
понеделник 09 UTC, weekly_routed понеделник 06:10 UTC.

- **Седмичният на 08.11 липсва в `function_edge_logs`** (в неделя има 2 реда за
  `send-scheduled-report` вместо 3; на 01.11 са 3). Писмото **е тръгнало**:
  има `report_snapshots` `weekly 2026-W45` в 19:00:02 UTC, а `resend-email`
  има извиквания до 19:00:49, след края на дневния (34 сек). Тоест това е
  дупка в лога, не липсващо писмо. Отсъствие в `function_edge_logs` не
  доказва, че писмото не е тръгнало.
- **`net._http_response` не става за проверка.** Отговорите на дългите функции
  са `Timeout of 5000 ms` (pg_net чака 5 сек, функцията продължава), а таблицата
  се чисти след ~6 ч. Записът за изпратено е `function_edge_logs`,
  `notification_topics.last_status`, `notification_log` и `report_snapshots`.
- `promo_expiring` — последно 08.11. Не е повреда: няма промоция, изтичаща
  днес (`bulletin_promotions.end_date`).
- Ръчни извиквания на `send-scheduled-report` извън графика (06.11 в 12 и
  13 UTC, 11.11 в 11 UTC) — бутоните от портала.
- Обратното (писмо в логовете без код): не е открито.

## 4. Разминавания, излезли при описа (не са поправяни)

1. **„📤 Изпрати сега“ (дневен/седмичен) ≠ кронът.** Браузърът праща на ВСИЧКИ
   с `daily=true` в едно писмо, без `scope_stores`, без регионалните и без
   управителите. Това е второ копие на правилата, което вече се разминава с
   крона.
2. **Тестовият акаунт `tencho.tenev13@gmail.com`** (role manager, Кърджали)
   получава дневния и седмичния репорт за Кърджали всяка вечер и е в
   `picking_users`.
3. `report_cron_schedule()` не показва `co_overdue`. README-то на функциите
   пише, че крон 26 е „СЪЗДАДЕН НЕАКТИВЕН“, а той е активен и праща всеки
   делник. Колоната „ver.“ в README изостава (`send-routed-report` 16 → живо
   21, `dynamic-responder` 23 → 27, `send-oborot-report` 9 → 13,
   `portal-push` 24 → 27). Съдържанието съвпада, разлика има само в брояча.
4. Две задачи „СПРАВКА МИНУСИ“ и „ПРЕОЦЕНКА ЗАДЪЛЖИТЕЛНА“ / „ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА“
   имат еднакви `report_groups`. Възможно е двойно писмо на `deadline_passed` —
   непроверено.

## 5. Предложение за етап 2

- **Къде:** Администрация → карта „Известия“, нов раздел „📋 Кой какво получава“
  — таблица писмо × човек (редове: хора, колони: писма; клетка = обхват).
  Филтър по отдел / обект / роля.
- **Кой я вижда:** admin и accounting (вече виждат картата „Известия“).
- **Как се поддържа сама:** нов режим `{"recipients_only":true}` в
  `send-scheduled-report`, `send-oborot-report` и `send-routed-report`, плюс
  съществуващият `dry_run` на `bulletin-notify`. Режимът вика СЪЩИТЕ функции за
  избор на получатели, по които се праща. За daily/weekly първо се изнася
  `reportDailyWeeklyRecipients` от `Deno.serve`, после двата пътя ползват нея.
- Писмата от браузъра се описват с отделна функция в `report.js`, която вика
  същите `llStoreEmails` / `pkPilotRecipients` / `rvRecipients`, за типов
  обект. Тест сверява списъка писма в таблицата с `cron.job` и с
  `notification_topics`, за да не изостане тихо (CLAUDE.md, „Политика, която
  изброява ключове…“).
- Първо — поправката на т.4.1 (бутонът да вика едж функцията), за да има един
  източник.

## Какво не е проверено / какво остава

- Получателите по `minus_multi` и `overdue_tasks` са изведени от данните и
  кода, не с dry_run (не съм викал функции).
- `send-routed-report` dry_run — форматът на отговора не е прочетен изцяло.
- Писмата от браузъра — описани по кода, без тест на живо. Конкретните
  получатели по товарни листи / сторно бележки зависят от обекта; не са
  изброени поименно.
- Дупката в `function_edge_logs` за седмичния на 08.11 — причината не е
  изяснена (логът на Supabase или нещо в самата функция).
- т.4.4 (двойни задачи → двойно писмо?) — непроверено.
