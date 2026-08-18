# Edge Functions — ТеМАХ Портал

Изходният код на деветте Edge Functions на проекта `xiwkdiqqplgdcrkewgtv`,
изтеглен от Supabase на **18.08.2026**.

## ⚠️ Репото е ЗАПИС, не механизъм за деплой

**Промяна в тази папка НЕ стига до Supabase.** Няма CI стъпка, няма
`supabase functions deploy` в GitHub Action-а, а `supabase` CLI не е инсталиран
на машината за разработка. Деплойът се прави **ръчно през Supabase** (Dashboard
или CLI от машина, на която е инсталиран).

Практическото следствие: тези файлове могат да изостанат от това, което реално
работи. **Преди да редактираш която и да е функция, изтегли актуалната версия
от Supabase и я сравни с тази тук** — иначе рискуваш да презапишеш промяна,
направена директно в Dashboard-а.

Обратното също важи: след ръчен деплой обнови файла тук, иначе записът губи
смисъл.

## Имената на файловете не са еднакви

Entrypoint-ът се взима от `get_edge_function` и при два от тях **не е**
`index.ts`. Имената по-долу са реалните — не ги „нормализирай".

| Функция | Файл | verify_jwt |
|---|---|---|
| `auth-login` | `index.ts` | ✅ |
| `auth-set-password` | `index.ts` | ✅ |
| `kasa-access-check` | `index.ts` | ✅ |
| `set-history-pin` | `index.ts` | ✅ |
| `portal-push` | `index.ts` | ✅ |
| `resend-email` | **`send-email.ts`** | ❌ **не** |
| `send-scheduled-report` | `index.ts` | ✅ |
| `swift-handler` | **`rm-push-index.ts`** | ✅ |
| `dynamic-responder` | `index.ts` | ✅ |

## Какво прави всяка

### Викат се от портала

**`auth-login`** — логин. Чете `users` със service role ключ, сравнява bcrypt
хеш срещу `password_hash`. Ако човекът е още на стара парола в чист вид, при
успешен логин я мигрира към хеш и зачиства `password`. Връща потребителя без
двете полета с парола.
→ `shared.js:513`

**`auth-set-password`** — смяна на парола. Със стара парола (потребителят си я
сменя сам) или без нея (админ ресетва). Минимум 4 символа.
→ `shared.js:663`, `admin.js:339`

**`resend-email`** — **изпраща И имейли, И push**, според поле `type` в тялото
(`'email'` по подразбиране, или `'push'`). Имейлите минават през SMTP
(`mail.temax.bg`), не през Resend, въпреки името. Темата се транслитерира на
латиница заради бъг в denomailer с кирилица; тялото е `base64`, за да не се реже
многобайтов UTF-8.
→ `email.js:19`, `push.js:25`

**`portal-push`** — push през OneSignal към целия портал или по таг `store_name`.
→ `push.js:37`

### Викат се по график (pg_cron), не от браузър

**`send-scheduled-report`** — дневният и седмичният репорт по имейл, без нужда от
отворен браузър. `{"type":"daily"}` всеки делник в 8:00 (Sofia),
`{"type":"weekly"}` в понеделник 8:00. Получателите идват от таблица
`report_recipients`, редактируема от таб „Днес".
Изпраща през `resend-email`.

> **Дублирана логика.** Файлът е ТОЧНО копие на репорт функциите от `report.js`.
> При промяна в `report.js` промяната трябва да се отрази и тук ръчно — вече
> веднъж се е разминала (виж коментара за commit `37bcd06` в началото на файла).

**`dynamic-responder`** — разпраща насрочените напомняния от Бюлетина. Чете
`notification_schedules`, взима дължимите за текущия момент по софийско време
(с прозорец от 15 минути) и ги праща като push през `resend-email`.

**`swift-handler`** — **не е за този портал.** Праща напомняния в 8:00 / 14:00 /
17:00 към **RM-app** (`tenchotenev13-afk.github.io/RM-app/`), към един-единствен
получател по `onesignal_id`. Живее в същия Supabase проект, затова е тук.

### Готови на сървъра, но без клиентска част (недовършен фийчър)

**`kasa-access-check`** — проверява индивидуален PIN срещу
`users.history_pin_hash` (bcrypt) преди достъп до таб История и пише одит запис
в `audit_log`.

**`set-history-pin`** — админ задава/ресетва PIN на колега (4–6 цифри), пази се
само като bcrypt хеш.

> **Това е недовършен фийчър, не счупен.** Сървърната част е налице и работи:
> двете функции са ACTIVE, а `users.history_pin_hash` съществува в базата.
> Липсва само клиентската част — към 18.08.2026 нито един файл в корена не
> споменава `history_pin`, `kasa-access-check` или `set-history-pin`.
>
> Достъпът до таб История в момента е **само по роля**, не по PIN:
> `shared.js:575` показва таба при `isGlobal()`, тоест за `admin`,
> `accounting` и `logistics` (`shared.js:49`). Който има такава роля, влиза без
> PIN; който няма — не вижда таба изобщо. Не разчитай на PIN защита, докато
> клиентската част не бъде свързана.

## Секрети

Нито един ключ не е в кода — всички се четат от `Deno.env`:

| Променлива | Ползва се от |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | auth-login, auth-set-password, kasa-access-check, set-history-pin, send-scheduled-report, dynamic-responder |
| `ONESIGNAL_REST_KEY` | portal-push, resend-email, swift-handler |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_NAME` | resend-email |

Задават се в Supabase → Project Settings → Edge Functions → Secrets.
**Не ги слагай във файл в тази папка.**

OneSignal App ID (`a326639e-…`) стои в кода нарочно — публичен идентификатор е,
не ключ.
