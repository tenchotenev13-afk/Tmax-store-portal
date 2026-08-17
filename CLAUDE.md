# ТеМАХ — Вътрешна платформа (Tmax-store-portal)

## Контекст

Вътрешен портал за верига хипермаркети за дома в България — 18+ обекта, централен
офис, два логистични склада. Стек: vanilla JS (ES5, global scope, string-concat
HTML), Supabase (PostgREST + Storage + Edge Functions), GitHub Pages hosting.
Netlify се ползва само за тестване/staging.

- **Supabase project ID:** `xiwkdiqqplgdcrkewgtv`
- **GitHub repo:** `tenchotenev13-afk/Tmax-store-portal`
- **Production:** GitHub Pages · **Testing:** Netlify

## Ключови хора

- **Живко** — IT/сървър админ; управлява local mirror/backup сървъра и sync скриптовете
- **Теодор Тенев** — собственик; взима стратегическите решения
- **Цветелина Тенева** (`c.teneva@temax.bg`) — счетоводство/контролинг; supplier email
  комуникация, разлики, специални права в няколко модула (finalize рекламации,
  storno връщания и т.н.)
- Друг офис персонал: Жеко Желязков, Василка Шикова, Миглена Павлова

## Модули и файлове

- `shared.js` — конфиг, auth, utils (`esc`, `v`, `toast`, `fmtDate`, `today`,
  `closeModal`, `sbGet`/`sbPost`/`sbPatch`/`sbDelete`, `showModule`, `assignedStores`)
- `transport.js` / `client-orders.js` — Транспорт и Клиентски заявки
- `pallets.js` — Палети (subtab на Транспорт)
- `bulletin.js` — Бюлетин / Седмичен планер (задачи, приоритети, recurring,
  push нотификации, календар)
- `kasa.js` / `kasa-docs.js` — Каса (ПОС отчети / Главна каса / Равнение / Сторно)
- `admin.js` — Администрация (потребители, магазини, SAP каталог)
- `reference.js` — Рекламации / Гаранционен справочник
- `handbook.js` + `docs.js` — обединени в 1 таб (под-навигация в `showModule()`)
- `history.js`, `contacts.js`, `transit.js`, `calendar.js`, `stock-returns.js`,
  `stock-differences.js`, `push.js`, `email.js`, `notifications.js`, `report.js`

**Script load order в `index.html` е фиксиран и важен — не пренарежда.**
(Пример: `kasa.js` зарежда преди `history.js`, защото history.js ползва
споделени storno helper функции, дефинирани в kasa.js.)

## ЗАДЪЛЖИТЕЛЕН процес при всяка промяна на код

1. **Винаги градя върху последната си собствена изходна версия / текущото
   състояние на локалния git clone**, не върху стар/непълен working tree —
   освен ако потребителят изрично не е потвърдил друго.
2. Преди да предложа промяна за commit: `node --check`, `git diff` спрямо
   текущия HEAD, брой функции преди/след (нищо изгубено), проверка за
   колизии на имена с останалите ~20 JS файла.
3. **Реални функционални тестове (jsdom), не само преглед на кода** —
   включително симулиран истински клик за бутони, не само инспекция на
   markup-а. (История: стар счупен "Откажи" бутон — escaping бъг, изглеждаше
   наред на четене, чупеше се при реален клик.)
4. При голяма/многостранна заявка — предлагам разбивка на приоритети и
   питам за ред, вместо да имплементирам всичко наведнъж.
5. Когато потребителят каже "не работи" — първо давам диагностика (проверка
   на живия файл / `git log` / `git diff`), за да разграничим deployment
   проблем от реален бъг, преди да гадая.
6. Минимални, хирургични промени — показвам точно diff-а, нищо друго не пипам.
7. **Търсене на едни и същи данни на повече от едно място** — при промяна на
   поле/функционалност, която може да се показва и другаде (модул + История +
   Excel износ и т.н.), претърсвам ВСИЧКИ засегнати файлове, не само този,
   който редактирам, преди да смятам промяната за завършена.
8. **Интеграционен тест при споделени глобални функции** — когато промяна
   засяга повече от един файл (напр. kasa.js + history.js), тествам ги
   заредени ЗАЕДНО в реалния ред от index.html, не само поотделно.
9. **Проверка на съществуващи данни преди ново задължително поле/ограничение**
   — SQL проверка (Supabase MCP) колко записи биха били засегнати/невалидни,
   преди да активирам изискването.
10. **Явен чеклист преди доставка**: нов запис + редакция на съществуващ —
    тествани и двата пътя; празни/липсващи данни — fallback тестван;
    гранични случаи (точно на лимита) — тествани явно, не само типичния случай.
11. **Git операции** — `git add`/`git commit` мога да предложа директно, но
    `git push` към remote (GitHub) **само след изрично потвърждение** на
    всяко отделно push, дори в Auto/Accept режим.

## Специфични особености на проекта

- Supabase RLS: понякога е активиран без INSERT policy → 401 Unauthorized.
  Стандартна поправка (за консистентност с останалите таблици):
  `alter table X disable row level security;` — но винаги отбелязвам
  security компромиса (anon ключът е публично видим в клиента). Всички
  таблици следват permissive `anon_all_*` policy pattern (`for all using
  (true) with check (true)`), освен ако не е нарочно ограничено.
- `users` таблицата пази пароли в чист текст — известен, приет риск в момента.
  `users.password`, `users.password_hash`, `stores.pass` никога не влизат в
  mirror schemas или външни износи.
- GitHub Pages + Service Worker кешират агресивно — при "не виждам промяната"
  първо: hard refresh + Application → Service Workers → Unregister.
- Известна безобидна колизия: `fmtMoney` дефинирана и в kasa.js, и в
  history.js (history.js версията печели заради реда на зареждане —
  козметично, не е поправено).
- Supabase FK 409 при DELETE = child record блокира изтриването. Поправка:
  изтрий child records първо в JS, или safety dialog.
- UNIQUE constraint при multi-dimensional tracking (напр. per-store per-date)
  → upsert логика (check-then-patch-or-post), не нов constraint без мисъл.
- Supplier filter bug pattern: винаги `type=eq.supplier`, НЕ
  `category=eq.supplier` при заявки към `contacts` — повтаряща се грешка.
- Timezone bug pattern: никога `.toISOString()` за сравнение на дати в
  България (UTC+2/+3) — местни getter методи за `today()`/`yesterday()`,
  или ръчно разбиване на `YYYY-MM-DD` стрингове по компоненти.
- Silent error pattern: 184+ извиквания на `sbGet()` не проверяват
  `res.ok` — систематичен проблем, да се има предвид при debugging.
- `calcStatus()` трябва да връща само валидни lifecycle статуси, никога
  date-bucket стойности.

## Схемни промени

- Винаги `apply_migration` (не `execute_sql`) за DDL.
- **Всяка нова таблица/колона → изрично уведомявам Живко** да обнови
  `mirror-schema.sql` и `sync-mirror.ps1`.

## Тестване

jsdom-базирани функционални тестове за всяка значима фийчър:
```bash
npm install jsdom --silent   # веднъж, в работната директория
```
Зареждам `shared.js` + засегнатите module файлове чрез `window.eval()` (не
обикновен Node `eval` — inline `onclick` атрибути в jsdom изискват
`runScripts: 'dangerously'` и функции, закачени на `window`, не на Node
`global`), после override-вам `sbGet`/`sbPost`/`sbPatch`/`sbDelete`/
`currentUser` след зареждането.

## Инструменти

- **Supabase MCP** — `apply_migration` за DDL, `execute_sql` за inspection/DML,
  `get_logs` с `service: "storage"` за egress диагностика
- **SheetJS (xlsx)** — Excel import/export
- **OneSignal** — push нотификации
- **pg_cron + Edge Functions** — server-side notification scheduling
- PowerShell 5.1 скриптове на сървъра на Живко: `sync-mirror.ps1` (SQL
  таблици), `sync-storage.ps1` (Storage buckets) — UTF-8 BOM за Cyrillic,
  `$PG_PASS` само с единични кавички

## Тон и работен стил на потребителя

Директен, стъпка по стъпка, иска потвърждение преди рискови промени,
предпочита да тества сам на живо и да докладва резултат. Не обича code
да се чупи между сесии — затова горните проверки не са по избор.
