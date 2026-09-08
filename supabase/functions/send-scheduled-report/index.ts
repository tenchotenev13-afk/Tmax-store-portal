/* send-scheduled-report — Edge Function за АВТОМАТИЧНОТО (cron) изпращане
   на общия дневен/седмичен репорт, без нужда от отворен браузър.

   v23 (08.09.2026) — деплой с ЕДНО нещо: „Невзета стока" става четима.

   Списъкът рендираше по ред за всяка двойка обект+доставчик. На живо това
   бяха десетки почти еднакви реда „X — Доставчик — 1 поз. · най-старата от
   11 дни" — формално вярно, но не е справка: окото няма за какво да се
   хване, а един обект се повтаряше по петнайсет пъти.

   Сега РЕД = ОБЕКТ, с два текстови реда: числата отгоре („N поз. при M
   доставчика · най-старата от X дни"), доставчиците отдолу с по-дребен сив
   шрифт, по азбучен ред, с брой в скоби при повече от една позиция и
   удебелени, ако са над прага. Обектите са 18 по природа — списъкът е
   ограничен сам по себе си и няма нужда от лимит.

   ДАННИТЕ НЕ СА ПИПАНИ: collectCrossModuleWeeklySummary връща същите групи
   обект+доставчик, същия праг, същото всичко. Сменя се само представянето.

   В пълния режим броят позиции в горния ред е сборът на ПОКАЗАНИТЕ
   доставчици (тези над прага), не на всички — иначе числото отгоре нямаше
   да отговаря на списъка отдолу.

   v22 (08.09.2026) — деплой с ТРИ неща в „Стока на път" и клиентските
   заявки, изброени поотделно, защото бележката описва ЦЕЛИЯ деплой:
     1. Поправен броячът „застояли". Той филтрираше pending с
        created_at < -7d, а created_at е датата на SAP импорта, не възрастта
        на позицията: към 08.09.2026 всичките 835 отворени носят 01.09,
        тоест числото беше или всички, или нула. Възрастта вече е дни от
        doc_date до деня на отчета; отворена позиция = pending или sent.
     2. Нов списък „Стока на път" по ОБЕКТ (reportTransitListHtml) веднага
        под реда с картите. По обект, не по позиция - около 900 отворени
        позиции не се четат ред по ред. Пълният отчет показва само обекти
        със застояли, срязаният - всички от обхвата с отворени.
     3. Нова секция „Необработени от логистичен склад"
        (reportWarehousePendingHtml) след „Закъснения": клиентски заявки в
        pending, чийто fulfiller е логистичен склад. Нарочно се припокрива
        със закъсненията - двете отговарят на различни въпроси.

   v21 (08.09.2026) — деплой с ЕДНО нещо: секция „Закъснения" в седмичния.

   Два списъка под едно заглавие, защото са едно и също питане („кой срок е
   изтекъл") към два различни таба — Клиентски заявки и Транспорт. Стоят
   ПРЕДИ реда „Каса — Сторно бележки".

   Правилото „закъсняла" е дословно копие на isLate() от shared.js, но с
   опорна дата като аргумент (reportIsLate/reportLateDays): едж функцията
   няма достъп до shared.js, а два различни кода за едно правило се
   разминават мълчаливо. Тестът сверява, че копието дава СЪЩИЯ отговор като
   оригинала върху осем гранични случая.

   Режимите са като на невзетата стока:
     · срязан отчет — клиентските заявки ред по ред (№, клиент, кой
       изпълнява);
     · пълен отчет — по ОБЕКТ. Към 08.09.2026 закъснелите са 92 в 10 обекта;
       ред по ред значи писмо, което никой не отваря.
   Транспортът е ред по ред и в двата режима — той е пет записа общо.
   При 0 и в двата списъка секцията отпада изцяло.

   ВНИМАНИЕ ЗА transport_orders.from_store: колоната е празна във ВСИЧКИТЕ
   1529 записа — съществува, но нищо не я пълни (transport.js дори не я
   споменава; тя се ползва само в клиентските заявки). Затова редът рисува
   „от → до" САМО ако наистина има от какво, иначе пада на името на клиента.
   Почне ли колоната да се пълни, редът се оправя сам.

   v20 (08.09.2026) — деплой с ЕДНО нещо: списък „невзета стока" в седмичния.

   Редът „За връщане (текущо състояние)" имаше само две карти — бройка без
   адрес. Теодор поиска да се вижда КЪДЕ стои стоката и ОТКОГА. Сега под
   картите (те остават) идва списък, групиран по обект+доставчик:
   „обект — доставчик — N поз. · най-старата от X дни".

   Невзета = stock_returns.status 'pending'. Възрастта е в ЦЕЛИ ДНИ между
   две локални полунощи — иначе едно и също връщане излиза ту с 6, ту със 7
   дни според часа, в който е тръгнал кронът. doc_date НЕ се ползва:
   колоната е null във всичките 435 записа, тоест изглежда като дата, а не
   е. Прагът „застояла" идва от app_settings, ключ 'returns_stale_days';
   липсва → 7. Чете се в самия колектор, с една заявка.

   ДВАТА РЕЖИМА СА РАЗЛИЧНИ и това е същината:
     · срязан отчет (регионален, управител) — ВСИЧКИ групи; застоялите се
       открояват със стил, но нищо не се крие. Списъкът му е работен.
     · пълен отчет (цялата верига) — САМО застоялите. Към 08.09.2026 pending
       групите са 248, от които 145 над 7 дни: пълен списък значи писмо,
       което никой не отваря.
   Затова buildCrossModuleSectionHtml приема втори аргумент scoped, който
   идва от data.scoped на самото обобщение. Липсващ аргумент значи пълен
   отчет — таб „Днес" в портала вика функцията с един аргумент и вижда само
   застоялите, което е и правилното там.

   reportReturnsListHtml и промените в collectCrossModuleWeeklySummary и
   buildCrossModuleSectionHtml са споделени с report.js
   (tests/report-edge-sync.test.js) — влизат и в двата файла, дословно.

   v19 (08.09.2026) — деплой с ЕДНО нещо: секция „Каса" в дневния отчет.

   Дневният носеше само задачи. Теодор поиска „грешна каса / върната каса";
   потвърдената дефиниция е ДВЕ различни неща, затова и секцията е с две
   подсекции, а не с една обща:
     · 🧾 Върнати от счетоводството — ВСИЧКИ записи със status='returned' от
       kasa_reports и kasa_zoborot, без ограничение по дата. Това е текущо
       СЪСТОЯНИЕ: записът стои върнат, докато обектът не го преподаде, и
       ограничение по ден би го скрило точно когато е най-важен. Всеки ред
       носи от колко дни стои върнат.
     · ⚠️ Разминаване над T — записите ЗА ОТЧЕТНИЯ ДЕН, невърнати, с
       abs(razlika) >= праг. Прагът идва от app_settings, ключ
       'kasa_diff_threshold'; липсва → 10 лв. Без праг секцията е нечитаема:
       90% от потвърдените ПОС отчети имат ненулева razlika (средно 4.49).
       ВНИМАНИЕ: 10 е ВРЕМЕННО, не е потвърдено от Теодор.
   Празни ли са и двете — секцията изчезва изцяло от писмото.

   Прагът се чете ВЕДНЪЖ на изпълнение и се подава на всеки получател през
   третия аргумент на collectDailyReportData; подаден null значи „прочети го
   сам" — това е пътят на ръчното изпращане от портала, където извикването е
   едно. Самото събиране е ВЪТРЕ в колектора, а не тук в обработчика, точно
   за да мине и през ръчното изпращане от таб „Днес": две места значеше
   разминаване, въпрос само на време.

   collectDailyKasaSection, reportKasaThreshold и reportKasaSectionHtml са
   споделени с report.js (tests/report-edge-sync.test.js) — влизат и в двата
   файла, дословно.

   v18 (08.09.2026) — деплой с ЕДНО нещо: обхват и за СЕДМИЧНИЯ отчет.

   Дневният вече имаше личен цикъл; седмичният беше само общото писмо.
   Сега collectWeeklyReportData приема scope (същият механизъм като при
   дневния — срязва изведения списък обекти, не го замества) и личният
   цикъл работи за двата вида:
     · регионалните получават и личен СЕДМИЧЕН отчет за своите обекти;
     · управителите — зад ОТДЕЛЕН ключ 'weekly_report_managers', независим
       от дневния 'daily_report_managers';
     · report_recipients.scope_stores остава САМО за дневния: седмичният е
       обзорен и получателят с обхват го получава пълен, в общото "to".
   Срязаният седмичен НЕ пише snapshot и НЕ чете предходната седмица —
   report_snapshots има един ред за (weekly, седмица) и личното писмо би
   презаписало тенденцията на цялата верига. Точно както при дневния.
   Нови секции няма: трендът и без това пада при scoped, а класацията
   ТОП 3 / ВНИМАНИЕ отпада сама под 4 обекта (reportRankingIsMeaningful).
   collectWeeklyReportData е в списъка на споделените с report.js функции
   (tests/report-edge-sync.test.js), затова същата промяна влиза и там —
   иначе синхронът пада. Клиентът вика функцията без втори аргумент, тоест
   поведението в браузъра е непроменено.

   v17 (08.09.2026) — деплой с ЕДНО нещо: кой получава дневния отчет.

   Дневният имаше два списъка — report_recipients (пълният отчет, общо "to")
   и регионалните (личен отчет за assigned_stores). Сега личните са ТРИ
   източника в един цикъл:
     · регионалните — както досега;
     · получател от report_recipients с непразен scope_stores (новата колона
       text[]): NULL/празно = пълният отчет както досега, непразно = човекът
       излиза от общото "to" и получава личен отчет само за тези обекти.
       Оттам идва искането на Теодор — дневния на един регионален;
     · управителите (role='manager', 19 души), всеки за своя обект, зад
       шалтер в базата: app_settings['daily_report_managers'] = 'on'.
       Липсващ ключ = ИЗКЛЮЧЕНО, тоест списъкът се пуска, когато Теодор
       потвърди, БЕЗ нов деплой.
   Дедупликация по имейл: един и същ човек в два източника получава ЕДНО
   писмо с обединения обхват. В отговора regionalOut стана personalOut и
   всеки ред носи source: 'regional' | 'recipient' | 'manager'.
   Обхватът важи само за дневния — при седмичния scope_stores се пренебрегва
   и получателят си остава в общото писмо.
   Миграцията за колоната е в report-recipients-scope-schema.sql.

   v16 (31.08.2026) — деплой БЕЗ промяна в поведението.
   Рендирането на прикачените е изнесено в reportAttachmentsHtml(), защото
   се ползва на две места: коментарите по обекти тук и личните картички по
   задачи в report.js. Изходът е байт по байт същият — проверката по
   разширение и HTML-ът не са пипани, само преместени.
   Живата функция беше v18 по броене на Supabase и отговаряше на репото
   при 623cb75; изнасянето влезе с ff7836b и до този деплой не беше живо.

   v15 (28.08.2026) — деплой с ЕДНО нещо: обхватът на дневния отчет.

   Дневният излиза в 08:00 и брои САМО задачите със срок за отчетния ден, а
   писмото за просрочени в 08:15 гледа целия бюлетин назад. Пристигат едно
   след друго и изглеждат противоречиви: на 28.08.2026 дневният за 27.08
   показа Севлиево със 100%, а четвърт час по-късно другото писмо каза, че
   Севлиево не е изпълнило задача със срок 26.08. И двете са верни — броят
   различни неща. Сега отчетът си казва обхвата сам, с ред под тенденцията.
   Огледално на report.js (заковано от tests/report-edge-sync.test.js).

   v14 (26.08.2026) — деплой с ЕДНО нещо: върнатото равнение в справката.

   От поправката, с която връщането за корекция маркира kasa_zoborot със
   status 'returned' вместо 'draft', обобщението на равнението броеше само
   двете стари кофи. Върнатите изпадаха и от двете: draft+confirmed вече не
   даваше total и никъде не личеше празнина.

   Тук се променят две неща, и двете огледални на report.js (заковано от
   tests/report-edge-sync.test.js):
   - трета кофа returned в zoborotSummary, по образеца на stornoSummary;
   - трета карта „върнати за корекция" с предупредителен цвят при > 0.

   v13 (26.08.2026) — деплой с ЕДНО нещо: документите при отмятане.

   Видовете задача бяха четири и нито един не искаше документ, затова
   магазините качваха Excel таблици през полето за СНИМКА — accept="" е
   подсказка към диалога за избор, не проверка. В колоната photos лежат три
   такива записа (Шумен веднъж, Раднево два пъти) и досега писмото ги
   рендираше като <img src>, тоест дневният имейл излизаше със счупени
   картинки.

   Тук се променят две неща, и двете огледални на report.js (заковано от
   tests/report-edge-sync.test.js):

   1. Колоната files тръгва през двата колектора — дневния и седмичния — и
      през commentedList, за да стигне до секцията „Коментари по обекти".
      Отмятане САМО с документ вече не изчезва от писмото.

   2. Рендирането решава по разширението: снимка остава миниатюра, всичко
      останало става връзка с името на файла. Проверката важи и за старата
      колона photos, тоест трите заварени .xlsx спират да са счупени
      картинки БЕЗ миграция на данни.
      Запис без filename се рендира като миниатюра — всичките 9 заварени
      записа с photos имат filename на всеки елемент, тоест липсващото име
      значи стар или чужд запис и старото поведение е по-безопасното.
      Разширението нарочно НЕ се вади от URL-а: там има query низове и
      кавички и проверката става гадаене.

   Порталът (bulletin.js, today.js) вече показва документите правилно от
   комит 278d8da. Този деплой затваря разминаването с имейла.

   v12 (24.08.2026) — деплой с ТРИ неща. Първите две са поправки на v11:
   излязоха при обратното четене на живия код и до деплоя тук писмото
   продължава да лъже с точно описаните числа.

   1. Отмятане без completion_date вече НЕ се брои за изпълнено.
      Условието беше `!c.completion_date || c.completion_date===dayISO`,
      тоест 184-те стари записа без дата (всичките отпреди полето да се
      пълни) минаваха за изпълнени ВСЕКИ ден завинаги. За неделя 23.08 от
      21 „изпълнени" 15 бяха реални и 6 фантоми: 39% вместо верните
      15/54 = 28%. Седмичният ги изключва още от v3 със същия мотив —
      отмятане без дата не се отнася към никой период.
      ВНИМАНИЕ за първата тенденция след този деплой: snapshot-ът за
      2026-08-23 е записан с 39% от старата логика, значи „спрямо
      предходния ден" ще се мери спрямо завишена база.

   2. Дневният чете бюлетина на СЕДМИЦАТА НА ОТЧЕТНИЯ ДЕН, не последния
      публикуван. Беше `order=created_at.desc&limit=1`, но бюлетините се
      публикуват предварително: в понеделник 24.08 най-новият е за
      седмица 35 (24–30.08), а отчетът описва 23.08 — ден от седмица 34.
      Задачите на грешната седмица влизаха в набора, а тези на вярната
      липсваха. Сега минава през същия избор като седмичния
      (reportWeekOfMonday + reportPickWeeklyBulletin), но за собствената
      седмица на деня, не за предходната. Изнесен е reportMondayOfWeek().

   3. Постоянна задача с ПРОЗОРЕЦ за изпълнение (due_window). Дотук всяко
      явяване беше отделно задължение: due_weekdays=[0,1,2] значеше три
      отмятания и три единици в знаменателя. За „подай справка до сряда"
      това е грешно — свършена в понеделник е свършена. При due_window
      последният ден е СРОКЪТ, предходните са „разрешено по-рано", и една
      отметка където и да е в прозореца затваря задачата за седмицата —
      ЕДИН елемент в статистиката, не N. Виж recurringIsWindow(),
      recurringWindowDatesForDate(), recurringReportDueOnWeekday().
      Колоната е `recurring_tasks.due_window boolean not null default
      false`; към 24.08.2026 нито една от 12-те активни задачи не я
      ползва, тоест числата не се менят от само себе си.

   Всичко от v11 (датата на приключилия ден, датите в седмичния,
   решетката „обект × задача", двата среза, коментарите по обекти, темите
   с дата) остава в сила и е описано по-долу.

   v11 (24.08.2026) — деплой с ПЕТ неща наведнъж:

   1. Дневният отчет описва ПРИКЛЮЧИЛИЯ ден, не текущия. Кронът бие в
      05:00 UTC = 08:00 българско; дотук колекторът събираше задачите за
      ТЕКУЩИЯ ден, а в 8 сутринта почти нищо не е отметнато — всяка сутрин
      излизаше писмо с почти нули за ден, който още не е започнал. Целият
      прозорец се мести с ден назад през reportDailyTargetDate(): дължими
      задачи, филтър по completion_date, ключ на snapshot-а и датата в
      шапката. Етикетът на тенденцията стана „спрямо предходния ден".
      ВАЖНО: това работи докрай само с cron.job 12 сменен на „0 5 * * *".
      С „0 5 * * 1-5" петък и събота остават неотчетени.

   2. Седмичният носи датите си в подзаглавието — „Обобщение за 17.08 –
      23.08.2026" вместо „Обобщение за седмицата". Виж
      reportWeekRangeLabel().

   3. Решетка „обект × задача" в дневния, на мястото на списъка от 18 реда
      „X от Y задачи". Четири състояния: ✓ ✖ ⏳ и · за „задачата не важи за
      този обект" (не влиза нито в числителя, нито в знаменателя). Редове
      са само обектите под 100%; стопроцентовите се свиват в един зелен
      ред, но остават линкове. Над 12 колони решетката отпада и остава
      само срезът „по задачи". Виж reportGridHtml().

   4. Нов срез „по задачи" в двата отчета — хваща случая, в който цяла
      задача е пропусната навсякъде. В седмичния явяванията се СЪБИРАТ
      обратно по задача (12 реда вместо 31), затова многодневните носят
      baseTitle. Коментарите в дневния се групират ПО ОБЕКТ (досега по
      задача, тоест три коментара от един обект излизаха на три места), а
      отложените влизат в същия блок. В седмичния списъкът пада до един
      ред с брой — 187 реда за седмица 34 са неизползваеми в имейл.
      Отпадат ТОП 3 / ИЗИСКВАТ ВНИМАНИЕ от дневния; остават в седмичния.

   5. Темите на писмата носят датата: „📋 ТеМАХ — Дневен репорт 23.08.2026"
      и „📊 ТеМАХ — Седмичен репорт 17.08 – 23.08.2026". Досега всички
      дневни писма бяха с една и съща тема и в пощата се сливаха. Датата
      идва от данните, не от часовника. Виж reportDailySubject().

   v10: ЕДИН прозорец в седмичния отчет - кросмодулната секция брои
   седмицата на бюлетина, а не подвижни 7 дни назад. Дотук едно и също
   писмо със шапка "Седмица 33" смяташе процента по обекти за 17-23.08, а
   броячите под него за 14-21.08; ръчно пуснат отчет в сряда мереше трети
   интервал. Виж reportCrossWindow(). Дневният отчет остава на подвижни
   7 дни - там няма шапка с номер на седмица.

   Плюс две дребни в същия деплой:
   · ТОП 3 / ИЗИСКВАТ ВНИМАНИЕ се скриват, когато всички обекти са с
     еднакъв процент - тогава двете кутии показват едни и същи числа и
     три случайни обекта излизат похвалени, а други три посочени.
     Виж reportRankingIsMeaningful().
   · „1 постоянни задачи ... чакат преглед ... виж ги" - членуването при
     единица. Виж reportNoDueNoticeHtml().

   v4: синхронизирано със report.js след commit 193411a („ДНЕС: собствен ред
   за сторната по грешен прием, с разбивка по магазин“) - заявката тегли
   store_name,direction,reviewed; сторните излизат от числата на другите две
   посоки (иначе всяка бланка се брои два пъти); добавен
   buildWrongReceiptRowHtml() и новото заглавие на стария ред. Без това
   редът излизаше само в таб „Днес“ и в ръчното изпращане, но НЕ и в
   автоматичния седмичен имейл, който минава оттук.

   v3: синхронизирано със report.js след commit 37bcd06 („Седмичен репорт:
   постоянните задачи се броят по явяване, не завинаги“) - добавен
   reportRecurringWeekDates() + completion_date в comps normalization. Без това
   постоянна задача, отметната веднъж, се броеше за изпълнена завинаги във
   автоматичните имейли - точно както описано в commit съобщението на 37bcd06.

   Тригерира се от pg_cron с POST {"type":"daily"} всеки делничен ден в
   8:00 (Sofia) и {"type":"weekly"} всеки понеделник в 8:00 (Sofia).

   Данните/HTML логиката по-долу е ТОЧНО копие на съответните функции в
   report.js. При промяна на логиката в report.js, отрази промяната и тук.

   Разлика спрямо браузъра: sbGet/sbPost/sbPatch тук говорят директно към
   PostgREST със SERVICE ROLE ключ (обикаля RLS) вместо sbGet от shared.js.
   Получателите се четат от таблица report_recipients - редактируеми от
   таб "Днес" в портала. */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REST = SUPABASE_URL + '/rest/v1/';

function sbGet(t: string, q?: string) {
  return fetch(REST + t + (q ? '?' + q : ''), {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
  }).then(function(r){ return r.json(); });
}
function sbPost(t: string, b: any) {
  return fetch(REST + t, {
    method: 'POST',
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type':'application/json', 'Prefer':'return=minimal' },
    body: JSON.stringify(b)
  }).then(function(r){ return { ok: r.ok }; });
}
function sbPatch(t: string, f: string, b: any) {
  return fetch(REST + t + '?' + f, {
    method: 'PATCH',
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type':'application/json', 'Prefer':'return=minimal' },
    body: JSON.stringify(b)
  }).then(function(r){ return { ok: r.ok }; });
}

/* ═══════ ПОМОЩНИ ФУНКЦИИ — копие от bulletin.js/shared.js (чисти, без DOM) ═══════ */
function esc(s: any){ return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '—'; }
/* esc() покрива & < > — достатъчно за ТЕКСТ между тагове, но НЕ за стойност
   на атрибут: кавичка вътре в src="…" затваря атрибута и всичко след нея
   се чете като markup. Копие на escAttr от shared.js. */
function escAttr(s: any){ return esc(s).replace(/"/g,'&quot;'); }
function toLocalISO(d: Date){
  var y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}
function taskDueDates(t: any){
  if(t.due_dates && t.due_dates.length) return t.due_dates.map(function(d: any){return String(d).slice(0,10);});
  if(t.due_date) return [String(t.due_date).slice(0,10)];
  return [];
}
function taskIsDueOnDate(t: any, dateStr: string){
  return taskDueDates(t).indexOf(dateStr) >= 0;
}
function recurringIsMultiDay(t: any){ return !!(t.due_weekdays && t.due_weekdays.length>1); }
function recurringIsDueOnWeekday(t: any, weekdayIdx: number){
  if(t.due_weekdays && t.due_weekdays.length) return t.due_weekdays.indexOf(weekdayIdx)>=0;
  if(t.due_weekday===null||t.due_weekday===undefined){
    return !!t.due_time;
  }
  return t.due_weekday===weekdayIdx;
}
/* Прозорец за изпълнение — копие от bulletin.js. due_window превръща
   due_weekdays от N задължения в СРОК: последният ден, с разрешено
   по-рано, и една отметка за цялата седмица. Смисъл има само при 2..6
   избрани дни. */
function recurringIsWindow(t: any){
  if(!t||!t.due_window) return false;
  var d=(t.due_weekdays&&t.due_weekdays.length)?t.due_weekdays:[];
  return d.length>1 && d.length<7;
}
function recurringWindowIdxs(t: any){
  return ((t&&t.due_weekdays)||[]).slice().sort(function(a: number,b: number){return a-b;});
}
function recurringWindowDeadlineIdx(t: any){
  var d=recurringWindowIdxs(t); return d.length?d[d.length-1]:null;
}
function recurringWindowDatesForDate(t: any, d: any){
  if(!recurringIsWindow(t)) return [];
  var mon=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
  return recurringWindowIdxs(t).map(function(i: number){
    var x=new Date(mon); x.setDate(mon.getDate()+i); return toLocalISO(x);
  });
}
function recurringReportDueOnWeekday(t: any, weekdayIdx: number){
  if(recurringIsWindow(t)) return weekdayIdx===recurringWindowDeadlineIdx(t);
  return recurringIsDueOnWeekday(t,weekdayIdx);
}
function recurringIsDueToday(t: any){
  var jsDay=new Date().getDay();
  var idx=jsDay===0?6:jsDay-1;
  return recurringReportDueOnWeekday(t, idx);
}
function weekDays(wk: number, yr: number){
  var s: any = new Date(yr,0,1+7*(wk-1));
  var d=s.getDay(); if(d<=4)s.setDate(s.getDate()-d+1); else s.setDate(s.getDate()+8-d);
  return [0,1,2,3,4,5,6].map(function(i){var x=new Date(s);x.setDate(s.getDate()+i);return x;});
}

/* Обекти, които НЕ участват в статистиките по магазини. Копие на
   REPORT_EXCLUDED_STORES / isReportableStore от shared.js.
   Логистичните складове не влизат в седмичния бюлетин - нямат нито едно
   отмятане в task_completions - и стояха на 0% завинаги, теглейки надолу
   „обекта под 50%". Централният офис никога не е бил обект.
   ЕДНА проверка: преди условието `store_name!=='Централен офис'` стоеше
   преписано на 8 места в двата файла. */
var LOGISTICS_WAREHOUSES = ['Логистичен склад Добрич','Логистичен склад Търговище'];
var REPORT_EXCLUDED_STORES = ['Централен офис'].concat(LOGISTICS_WAREHOUSES);
function isReportableStore(name){
  return !!name && REPORT_EXCLUDED_STORES.indexOf(name) < 0;
}

/* ═══════ РЕПОРТ ЛОГИКА — ТОЧНО копие от report.js ═══════════════════ */
var PORTAL_URL = 'https://tenchotenev13-afk.github.io/Tmax-store-portal/';

/* Денят, който дневният отчет ОПИСВА - приключилият вчерашен, не текущият.
   Кронът "daily-report-8am" пуска функцията в 05:00 UTC = 08:00 българско.
   В 8 сутринта задачите за ТЕКУЩИЯ ден още не са отметнати, тоест писмото
   излизаше с почти нули и с днешната дата в шапката - тревога без покритие.
   Един ден за ВСИЧКО: дължими задачи, прозорец на отмятанията, ключ на
   snapshot-а и датата в шапката. Разминат ли се, писмото пак ще лъже, само
   по-тихо.
   now се подава като аргумент, за да е тестваемо без пипане на часовника. */
function reportDailyTargetDate(now){
  var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - 1);
  return d;
}
/* JS getDay() (0=Нед) -> индекса на портала (0=Пон..6=Нед). Същото
   преобразуване като в recurringIsDueToday(), но за ПРОИЗВОЛНА дата -
   дневният отчет пита за вчерашния делник, не за днешния. */
function reportWeekdayIdx(d){
  var js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

/* scope: масив с имена на обекти или null/празно = ЦЯЛАТА верига. Подава се
   отвън, защото един отчетен ден се строи по няколко пъти — веднъж за
   report_recipients и по веднъж за всеки регионален. */
function collectDailyReportData(cb, scope, kasaThreshold){
  var reportDay = reportDailyTargetDate(new Date());
  var dayISO = toLocalISO(reportDay);
  var dayIdx = reportWeekdayIdx(reportDay);
  /* Бюлетинът на СЕДМИЦАТА НА ОТЧЕТНИЯ ДЕН, не последният публикуван.
     Бюлетините се публикуват предварително: в понеделник 24.08 най-новият
     е за седмица 35 (24-30.08), а отчетът описва 23.08 - ден от седмица 34.
     Оттам задачите на грешната седмица влизаха в дневния набор, а тези на
     вярната липсваха. Същият избор като в седмичния (списък + точно
     съвпадение, иначе най-новият, който НЕ е след отчетната седмица). */
  var dayTarget = reportWeekOfMonday(reportMondayOfWeek(reportDay));
  Promise.all([
    sbGet('bulletins','status=eq.published&order=year.desc,week_number.desc&limit=20'),
    sbGet('recurring_tasks','active=eq.true&order=sort_order.asc')
  ]).then(function(results){
    var bul = reportPickWeeklyBulletin(results[0], dayTarget);
    var allRecurring = Array.isArray(results[1]) ? results[1] : [];
    /* Прозоречната задача се явява ВЕДНЪЖ — в деня на срока. Иначе обект,
       свършил я в понеделник, излиза неизпълнил във вторник и в сряда, и се
       брои три пъти. */
    var recurringToday = allRecurring.filter(function(t){ return recurringReportDueOnWeekday(t, dayIdx); });
    /* Прозорците за отчетния ден — отмятане от кой да е техен ден затваря
       задачата. Смятат се от самата дата, не през weekNum/година. */
    var recWinDates = {};
    recurringToday.forEach(function(t){ if(recurringIsWindow(t)) recWinDates[t.id]=recurringWindowDatesForDate(t, reportDay); });
    var recurringNoDue = allRecurring.filter(function(t){
      return (t.due_weekday===null || t.due_weekday===undefined) && !t.due_time;
    });

    var bulTasksPromise = bul ? sbGet('bulletin_tasks','bulletin_id=eq.'+bul.id) : Promise.resolve([]);

    bulTasksPromise.then(function(tasksRaw){
      var allBulTasks = Array.isArray(tasksRaw) ? tasksRaw : [];
      var regularToday = allBulTasks.filter(function(t){ return taskIsDueOnDate(t, dayISO); });

      var items = [];
      regularToday.forEach(function(t){ items.push({ id:t.id, kind:'regular', title:t.title, target_stores:t.target_stores||null }); });
      recurringToday.forEach(function(t){ items.push({ id:t.id, kind:'recurring', title:t.title, target_stores:t.target_stores||null }); });

      var regIds = regularToday.map(function(t){ return t.id; });
      var recIds = recurringToday.map(function(t){ return t.id; });

      Promise.all([
        regIds.length ? sbGet('task_completions','task_id=in.('+regIds.join(',')+')') : Promise.resolve([]),
        recIds.length ? sbGet('task_completions','recurring_task_id=in.('+recIds.join(',')+')') : Promise.resolve([]),
        sbGet('users','select=store_name&order=store_name')
      ]).then(function(r2){
        var regComps = Array.isArray(r2[0]) ? r2[0] : [];
        var recComps = Array.isArray(r2[1]) ? r2[1] : [];
        var users = Array.isArray(r2[2]) ? r2[2] : [];
        var seen = {};
        var stores = users.filter(function(u){
          if (!isReportableStore(u.store_name) || seen[u.store_name]) return false;
          seen[u.store_name] = 1; return true;
        }).map(function(u){ return u.store_name; });
        /* Обхватът СРЯЗВА изведения списък, а не го замества — иначе склад
           или несъществуващ обект в assigned_stores би вкарал ред. */
        if (scope && scope.length) {
          stores = stores.filter(function(s){ return scope.indexOf(s) >= 0; });
        }

        var comps = [];
        /* Само completion-и от ОТЧЕТНИЯ ден за обикновени задачи - многодневна
           задача (Пон+Ср) не бива изпълнението от Понеделник да се показва
           като "изпълнено" (или "отложено") и в сряда. */
        regComps.forEach(function(c){ if((c.completion_date||null)===dayISO) comps.push({ item_id:c.task_id, kind:'regular', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos, files:c.files }); });
        /* Постоянна задача: отмятането трябва да носи ОТЧЕТНИЯ ден.
           Дотук `!c.completion_date ||` пускаше и старите записи без дата -
           184 такива в базата, всичките отпреди полето да се пълни. Те се
           броят за изпълнени всеки ден завинаги: за неделя 23.08 от 21
           „изпълнени" в писмото 15 бяха реални и 6 фантоми, тоест 39%
           вместо верните 28%. Седмичният ги изключва нарочно още от v3
           („не могат да бъдат отнесени към коя да е седмица") - тук важи
           същото, само че за ден.
           Прозоречната задача и без това изисква реална дата. */
        recComps.forEach(function(c){
          var win = recWinDates[c.recurring_task_id];
          var hit = win ? (!!c.completion_date && win.indexOf(c.completion_date)>=0)
                        : (c.completion_date === dayISO);
          if(hit) comps.push({ item_id:c.recurring_task_id, kind:'recurring', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos, files:c.files });
        });

        var summary = reportBuildSummary(items, comps, stores, recurringNoDue.length);
        summary.reportDate = dayISO;
        summary.scoped = !!(scope && scope.length);
        /* Каса: събира се ТУК, вътре в колектора, а не в обработчика на
           крона — така секцията стига и до ръчното изпращане от таб „Днес",
           което минава през същия колектор. Две места значи разминаване,
           въпрос само на време. */
        var finish = function(){
          collectDailyKasaSection(function(kasa){
            summary.kasa = kasa;
            cb(summary);
          }, dayISO, scope, kasaThreshold);
        };
        /* Снимката е САМО за пълната верига: report_snapshots има един ред за
           (daily, дата) и срязаният отчет би презаписал тенденцията на
           всички. Затова срязаният нито пише, нито чете тенденция. */
        if (summary.scoped) {
          summary.trendYesterday = null;
          finish();
          return;
        }
        var prevISO = toLocalISO(reportDailyTargetDate(reportDay));
        reportSaveSnapshot('daily', dayISO, summary.overallPct, summary.totalDone, summary.totalAll);
        reportFetchSnapshot('daily', prevISO, function(snap){
          summary.trendYesterday = snap;
          finish();
        });
      }).catch(function(){ cb(null); });
    }).catch(function(){ cb(null); });
  }).catch(function(){ cb(null); });
}

/* „Закъсняла" е ПРИЗНАК, не статус — копие на isLate() от shared.js, но с
   ОПОРНА ДАТА като аргумент вместо глобалното TODAY. Едж функцията няма
   достъп до shared.js, а report.js не бива да вика два различни кода за
   едно и също правило: затова копието влиза и в двата файла под едно име и
   тестът сверява, че reportIsLate дава СЪЩИЯ отговор като isLate върху
   набор гранични случаи (tests/report-late-section.test.js).

   Правилото, дума по дума както в оригинала:
   · няма delivery → не закъснява;
   · приключените и отложените нямат срок, който да тече;
   · клиентска заявка, обработена от ЦО, чийто доставчик още е в срок
     (status='processed' и co_eta >= опорния ден) — виж coWaitingSupplier();
   · транспорт, чакащ стока по клиентска заявка (awaiting_stock): срокът се
     води по клиентската заявка, не по транспорта;
   · иначе закъснява, ако delivery е ПРЕДИ опорния ден.

   coWaitingSupplier() е вградена тук, а не пренесена като отделна функция:
   тя е три реда и единственият ѝ повикващ е този. */
function reportIsLate(o, refD){
  if (!o || !o.delivery) return false;
  if (['done','refused','postponed'].indexOf(o.status) >= 0) return false;
  if (o.status === 'processed' && o.co_eta) {
    var eta = new Date(o.co_eta); eta.setHours(0,0,0,0);
    if (eta >= refD) return false;
  }
  if (o.awaiting_stock) return false;
  var dl = new Date(o.delivery); dl.setHours(0,0,0,0);
  return dl < refD;
}
/* С колко дни. Същата аритметика като lateBadge() в shared.js — Math.round,
   не floor: през преминаването към лятно/зимно часово време денонощието не е
   86400000 мс и floor би отчитал един ден по-малко. */
function reportLateDays(o, refD){
  var dl = new Date(o.delivery); dl.setHours(0,0,0,0);
  return Math.round((refD - dl) / 86400000);
}

/* Прагът за „разминаване" — app_settings, ключ 'kasa_diff_threshold'.
   Стойността е ТЕКСТ (таблицата е key/value от text), затова минава през
   Number(); запетаята се приема за десетичен знак, защото е това, което
   човек пише. Липсващ ключ, празна или нечислова стойност → 10.

   ВНИМАНИЕ: 10 лв е ВРЕМЕННО и НЕ е потвърдено от Теодор. Стои като
   fallback, за да работи секцията от първия ден; истинската стойност се
   записва в базата и оттам нататък кодът не се пипа. */
function reportKasaThreshold(cb){
  sbGet('app_settings','key=eq.kasa_diff_threshold&select=value&limit=1').then(function(rows){
    var row = Array.isArray(rows) && rows.length ? rows[0] : null;
    var raw = row && row.value != null ? String(row.value).trim().replace(',', '.') : '';
    var n = raw ? Number(raw) : NaN;
    cb(isFinite(n) && n > 0 ? n : 10);
  }).catch(function(){ cb(10); });
}

/* Каса в дневния отчет: „грешна каса / върната каса" са ДВЕ различни неща
   в една секция и се четат по различен начин.

   1. ВЪРНАТИТЕ ОТ СЧЕТОВОДСТВОТО са текущо СЪСТОЯНИЕ, не събитие от деня:
      записът стои със status='returned', докато обектът не го преподаде.
      Затова се четат БЕЗ ограничение по дата — иначе върнат преди три дни
      и още непреподаден отчет изчезва от писмото точно когато е най-важен.
      Оттам и полето days: колко дни стои върнат към отчетния ден.
   2. РАЗМИНАВАНИЯТА са събитие ОТ ОТЧЕТНИЯ ДЕН и се режат по праг. Без
      праг секцията е нечитаема: 90% от потвърдените ПОС отчети имат
      ненулева razlika (средно 4.49 лв), тоест почти всеки ред влиза.
      Върнатите се изключват оттук — те вече са в списък 1 и иначе биха се
      броили два пъти.

   Филтрите по status и по дата стоят И В ЗАЯВКАТА, И В JS. Заявката пести
   трафик; JS-ът е този, който наистина решава — и е това, което тестът
   може да мери. Махне ли се вторият, D-1 влиза в разминаванията.

   scope реже по обект както навсякъде другаде. threshold се подава отвън,
   за да го чете кронът ВЕДНЪЖ за всички получатели; подаден null/undefined
   значи „прочети го сам" — това е пътят на ръчното изпращане от таб „Днес",
   където извикването е едно. */
function collectDailyKasaSection(cb, dayISO, scope, threshold){
  var hasScope = !!(scope && scope.length);
  var inScope = function(s){ return !hasScope || scope.indexOf(s) >= 0; };
  var posLabel = function(x){ return 'ПОС № ' + (x.pos_number == null ? '?' : x.pos_number); };

  var go = function(thr){
    Promise.all([
      sbGet('kasa_reports','status=eq.returned&select=store_name,date,pos_number,razlika,status,return_reason,returned_at'),
      sbGet('kasa_zoborot','status=eq.returned&select=store_name,date,razlika,status,return_reason,returned_at'),
      sbGet('kasa_reports','date=eq.'+dayISO+'&select=store_name,date,pos_number,razlika,status'),
      sbGet('kasa_zoborot','date=eq.'+dayISO+'&select=store_name,date,razlika,status')
    ]).then(function(r){
      var dayD = new Date(dayISO+'T00:00:00');

      var returned = [];
      var pushReturned = function(x, type){
        if (x.status !== 'returned' || !inScope(x.store_name)) return;
        var at = x.returned_at ? new Date(x.returned_at) : null;
        var days = (at && !isNaN(at.getTime()))
          ? Math.max(0, Math.round((dayD - new Date(toLocalISO(at)+'T00:00:00')) / 86400000))
          : null;
        returned.push({ store: x.store_name, type: type, date: x.date || null,
                        razlika: Number(x.razlika) || 0,
                        return_reason: x.return_reason || '', days: days });
      };
      (Array.isArray(r[0]) ? r[0] : []).forEach(function(x){ pushReturned(x, posLabel(x)); });
      (Array.isArray(r[1]) ? r[1] : []).forEach(function(x){ pushReturned(x, 'Равнение'); });
      /* Най-старото върнато отгоре — то е и най-спешното. При равни дни по
         обект, за да е стабилен редът между две изпращания. */
      returned.sort(function(a,b){
        return (b.days || 0) - (a.days || 0) || String(a.store).localeCompare(String(b.store));
      });

      var over = [];
      var pushOver = function(x, type){
        if (x.status === 'returned' || !inScope(x.store_name)) return;
        if ((x.date || null) !== dayISO) return;
        var v = Number(x.razlika) || 0;
        if (Math.abs(v) < thr) return;
        over.push({ store: x.store_name, type: type, razlika: v });
      };
      (Array.isArray(r[2]) ? r[2] : []).forEach(function(x){ pushOver(x, posLabel(x)); });
      (Array.isArray(r[3]) ? r[3] : []).forEach(function(x){ pushOver(x, 'Равнение'); });
      over.sort(function(a,b){
        return Math.abs(b.razlika) - Math.abs(a.razlika) || String(a.store).localeCompare(String(b.store));
      });

      cb({ returned: returned, overThreshold: over, threshold: thr });
    }).catch(function(){ cb({ returned: [], overThreshold: [], threshold: thr }); });
  };

  if (threshold === null || threshold === undefined) reportKasaThreshold(go);
  else go(threshold);
}

function reportSaveSnapshot(periodType, periodKey, overallPct, totalDone, totalAll){
  sbGet('report_snapshots','period_type=eq.'+periodType+'&period_key=eq.'+periodKey).then(function(rows){
    var existing = Array.isArray(rows) && rows.length ? rows[0] : null;
    var payload = { overall_pct: overallPct, total_done: totalDone, total_all: totalAll };
    if (existing) sbPatch('report_snapshots','id=eq.'+existing.id, payload);
    else {
      payload.period_type = periodType; payload.period_key = periodKey;
      sbPost('report_snapshots', payload);
    }
  }).catch(function(){});
}
function reportFetchSnapshot(periodType, periodKey, cb){
  sbGet('report_snapshots','period_type=eq.'+periodType+'&period_key=eq.'+periodKey).then(function(rows){
    cb(Array.isArray(rows) && rows.length ? rows[0] : null);
  }).catch(function(){ cb(null); });
}
function reportTrendHtml(currentPct, snapshot, label){
  if (!snapshot) return '';
  var diff = currentPct - snapshot.overall_pct;
  var arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
  var color = diff > 0 ? '#2F9E5C' : diff < 0 ? '#C0392B' : '#94a3b8';
  var sign = diff > 0 ? '+' : '';
  return '<div style="text-align:center;font-size:12px;color:'+color+';font-weight:700;margin:6px 0 0;">'+arrow+' '+sign+diff+'% '+label+'</div>';
}

function reportItemMatchesComp(it, c){
  if (it.id!==c.item_id || it.kind!==c.kind) return false;
  if (it.date) return (c.completion_date||null)===it.date;
  /* Явяване за цяла седмица (задача от бюлетина без собствен срок) - брои се
     отмятане ВЪТРЕ в диапазона, не кое да е. Отмятане без дата не може да се
     отнесе към седмица, затова не съвпада. */
  if (it.dateFrom) {
    var d = c.completion_date || null;
    return !!d && d >= it.dateFrom && d <= it.dateTo;
  }
  /* Нито дата, нито диапазон - дневният репорт, чиито явявания нямат дата,
     защото самият той вече е стеснил comps до днешния ден в JS. */
  return true;
}
function reportRecurringWeekDates(t, wk, yr){
  var out = [];
  weekDays(wk, yr).forEach(function(d, idx){
    if (recurringIsDueOnWeekday(t, idx)) out.push(toLocalISO(d));
  });
  return out;
}
function reportBuildSummary(items, comps, stores, noDueCount){
  var totalDone=0, totalAll=0, laggards=0;
  var doneComps = comps.filter(function(c){ return c.status==='done'; });
  var postponedComps = comps.filter(function(c){ return c.status==='postponed'; });
  var rows = stores.map(function(s){
    /* По една клетка за всяко явяване, в реда на items. Решетката в дневния
       имейл чете точно този масив по редове, а срезът „по задачи" - по
       колони, тоест двата изгледа не могат да се разминат.

       Състоянията са ЧЕТИРИ, защото „не важи за този обект" не е същото
       като „неизпълнена": задача с target_stores извън обхвата не влиза
       нито в числителя, нито в знаменателя на ТОЗИ обект. Само задачите в
       обхват се броят - същото правило като преди, само че вече се вижда
       и клетка по клетка, не само в сбора. */
    var cells = items.map(function(it){
      var inScope = !it.target_stores || !it.target_stores.length || it.target_stores.indexOf(s)>=0;
      if (!inScope) return 'na';
      if (doneComps.some(function(c){ return c.store_name===s && reportItemMatchesComp(it,c); })) return 'done';
      if (postponedComps.some(function(c){ return c.store_name===s && reportItemMatchesComp(it,c); })) return 'postponed';
      return 'missing';
    });
    /* Отложената задача НЕ се брои за изпълнена, но остава в знаменателя -
       точно както досега (в процента влизаше само status='done'). */
    var total = 0, done = 0;
    cells.forEach(function(st){
      if (st === 'na') return;
      total++;
      if (st === 'done') done++;
    });
    var pct = total ? Math.round(done/total*100) : 0;
    totalDone += done; totalAll += total;
    if (pct < 50) laggards++;
    return { name:s, done:done, total:total, pct:pct, cells:cells };
  });
  rows.sort(function(a,b){ return a.pct - b.pct; }); /* изоставащите най-отгоре */
  var overallPct = totalAll ? Math.round(totalDone/totalAll*100) : 0;
  var byPct = rows.slice().sort(function(a,b){ return b.pct - a.pct; });
  /* Прозорецът на СПИСЪЦИТЕ е същият като на процента.
     Досега двата списъка нямаха никакъв филтър по дата: процентът минаваше
     през reportItemMatchesComp (точно съвпадение на completion_date с датата
     на явяването), а списъците взимаха всяко отмятане, което заявката е
     върнала - тоест цялата история. Оттам идваше противоречието: „0 от 27"
     по обекти и 213 изброени коментара в едно и също писмо за една седмица.
     Един и същи предикат за трите места, за да не се разминат отново. */
  var inWindow = function(c){
    return items.some(function(it){ return reportItemMatchesComp(it, c); });
  };
  /* След филтъра find() винаги намира явяването, тоест „(неизвестна задача)"
     става недостижимо - точно записите, които го показваха, бяха тези извън
     прозореца. Пазим го като предпазител, не като очакван изход. */
  var titleOf = function(c){
    var it = items.find(function(x){ return reportItemMatchesComp(x,c); }) || items.find(function(x){ return x.id===c.item_id && x.kind===c.kind; });
    return it ? it.title : '(неизвестна задача)';
  };
  var postponedList = postponedComps.filter(inWindow).map(function(c){
    return { title: titleOf(c), store: c.store_name, comment: c.comment || '' };
  });
  /* Изпълнени задачи С коментар/снимка - иначе съдържанието е невидимо в
     репорта, освен ако не отвориш конкретната задача в Бюлетин. */
  var commentedList = doneComps.filter(inWindow).filter(function(c){
    return c.comment || (c.photos && c.photos.length) || (c.files && c.files.length);
  }).map(function(c){
    return { title: titleOf(c), store: c.store_name, comment: c.comment || '', photos: c.photos || [], files: c.files || [] };
  });
  return {
    overallPct: overallPct, totalDone: totalDone, totalAll: totalAll,
    laggards: laggards, storeCount: stores.length, rows: rows,
    /* Легендата на решетката и заглавията в среза „по задачи" - в СЪЩИЯ
       ред, в който са клетките на всеки ред. Номерът на колоната е просто
       индексът тук + 1. */
    items: items,
    top3: byPct.slice(0,3), bottom3: byPct.slice(-3).reverse(),
    noDueCount: noDueCount || 0, postponedList: postponedList, commentedList: commentedList
  };
}

function reportDotColor(p){ return p===100 ? '#2F9E5C' : p>=50 ? '#E0A425' : '#D4483A'; }
function reportPctColor(p){ return p===100 ? '#2F9E5C' : p>=50 ? '#B6841E' : '#C0392B'; }

function reportStatCell(num,label,color){
  return '<td style="width:25%;padding:4px;">' +
    '<div style="background:#F4F6FB;border-radius:8px;padding:14px 6px;text-align:center;">' +
    '<div style="font-size:20px;font-weight:800;color:'+color+';line-height:1.1;">'+num+'</div>' +
    '<div style="font-size:10px;color:#6B7280;margin-top:4px;">'+label+'</div></div></td>';
}
function reportStoreRow(r){
  var dc = reportDotColor(r.pct), pc = reportPctColor(r.pct);
  var href = PORTAL_URL + '?store=' + encodeURIComponent(r.name);
  return '<a href="'+href+'" style="display:table;width:100%;background:#F9FAFC;border-radius:8px;margin-bottom:8px;padding:12px 14px;box-sizing:border-box;text-decoration:none;color:inherit;">' +
    '<div style="display:table-cell;vertical-align:middle;width:20px;"><span style="width:11px;height:11px;border-radius:50%;display:inline-block;background:'+dc+';"></span></div>' +
    '<div style="display:table-cell;vertical-align:middle;"><div style="font-size:14px;font-weight:700;color:#1F2937;">'+esc(r.name)+'</div><div style="font-size:11px;color:#6B7280;margin-top:2px;">'+r.done+' от '+r.total+' задачи</div></div>' +
    '<div style="display:table-cell;vertical-align:middle;text-align:right;width:80px;"><span style="font-size:15px;font-weight:800;color:'+pc+';">'+r.pct+'%</span><span style="font-size:10px;color:#9CA3AF;margin-left:4px;">→</span></div>' +
    '</a>';
}
/* Класация има смисъл само когато има какво да се класира. При еднакъв
   процент за ВСИЧКИ обекти двете кутии показват едни и същи числа под
   заглавия "🏆 ТОП 3" и "⚠️ ИЗИСКВАТ ВНИМАНИЕ" - три случайни обекта се
   оказват похвалени, други три посочени, без нищо да ги отличава. Точно
   това се случваше всеки понеделник, докато седмичният прозорец беше
   сбъркан и всички излизаха на 0%.

   top3 е подредено по низходящ процент, bottom3 - по възходящ, тоест
   top3[0] е най-добрият, а bottom3[0] - най-слабият. Равни ли са тези
   двама, равни са всички. */
/* storeCount: колко обекта има В ОБХВАТА. При под 4 класация не се показва —
   при трима двете кутии изброяват едни и същи обекти в обратен ред. */
function reportRankingIsMeaningful(top3, bottom3, storeCount){
  if (!top3 || !bottom3 || !top3.length || !bottom3.length) return false;
  if (typeof storeCount === 'number' && storeCount < 4) return false;
  return top3[0].pct !== bottom3[0].pct;
}
function reportTopBottomTable(top3, bottom3, storeCount){
  if (!reportRankingIsMeaningful(top3, bottom3, storeCount)) return '';
  var goodRows = top3.map(function(s,i){ return '<div style="font-size:13px;color:#1f2937;margin-bottom:4px;">'+(i+1)+'. '+esc(s.name)+' — '+s.pct+'%</div>'; }).join('');
  var badRows = bottom3.map(function(s,i){ return '<div style="font-size:13px;color:#1f2937;margin-bottom:4px;">'+(i+1)+'. '+esc(s.name)+' — '+s.pct+'%</div>'; }).join('');
  return '<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px 0;margin-top:6px;"><tr>' +
    '<td style="width:50%;background:#E9F5EF;border-radius:8px;padding:12px 14px;vertical-align:top;"><div style="font-size:11px;font-weight:800;color:#2F7D5C;margin-bottom:8px;">🏆 ТОП 3</div>'+goodRows+'</td>' +
    '<td style="width:50%;background:#FDEEEA;border-radius:8px;padding:12px 14px;vertical-align:top;"><div style="font-size:11px;font-weight:800;color:#B4442E;margin-bottom:8px;">⚠️ ИЗИСКВАТ ВНИМАНИЕ</div>'+badRows+'</td>' +
    '</tr></table>';
}

/* Бележката за постоянните задачи без срок. Числото управлява прилагателното,
   съществителното, глагола И местоимението наведнъж - "1 постоянни задачи
   без конкретен срок чакат преглед ... виж ги" беше сгрешено на четири места
   в едно изречение. Затова двата варианта се пишат цели. */
function reportNoDueNoticeHtml(n, weekly){
  if (!n || n < 1) return '';
  var txt = weekly
    ? (n === 1
        ? '1 постоянна задача без конкретен срок не участва в тази статистика.'
        : n + ' постоянни задачи без конкретен срок не участват в тази статистика.')
    : (n === 1
        ? '1 постоянна задача без конкретен срок чака преглед (не участва в % по-горе) — виж я в таб „Днес".'
        : n + ' постоянни задачи без конкретен срок чакат преглед (не участват в % по-горе) — виж ги в таб „Днес".');
  return '<div style="margin-top:14px;padding:10px 14px;background:#FDF3E3;border-radius:8px;font-size:12px;color:#8A5A12;">📋 '+txt+'</div>';
}

/* Какъв период покрива дневният отчет — казано вътре в самия отчет.
   Дневният излиза в 08:00 и брои САМО задачите със срок вчера; писмото за
   просрочени в 08:15 гледа целия бюлетин назад. Двете пристигат едно след
   друго и си противоречат наглед: на 28.08.2026 дневният за 27.08 показа
   Севлиево в зеления списък със 100%, а четвърт час по-късно другото писмо
   каза, че Севлиево не е изпълнило „Зануляване" със срок 26.08. И двете са
   верни — просто броят различни неща. Затова отчетът си казва обхвата сам,
   вместо получателят да го извежда.
   Датата идва от ДАННИТЕ (reportDate), не от часовника — писмото се пише на
   следващия ден. Липсва ли или е счупена, редът пропуска датата, вместо да
   покаже „NaN.NaN" — същият избор като в reportDailySubject(). */
function reportScopeNoticeHtml(reportDate){
  var d = reportDate ? new Date(reportDate+'T00:00:00') : null;
  var scope = (d && !isNaN(d.getTime())) ? 'със срок ' + reportDayMonth(d) : 'със срок за деня';
  return '<div style="margin-top:14px;padding:10px 14px;background:#FDF3E3;border-radius:8px;font-size:12px;color:#8A5A12;">ℹ️ Този отчет покрива само задачите '+scope+'. Задачите с изтекъл срок от предишни дни идват в отделно писмо всеки делник в 08:15.</div>';
}

function reportEmailShell(headerTitle, headerSub, bodyHtml, footerText){
  return '<!DOCTYPE html><html lang="bg"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:20px;background:#e8ecf3;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;font-family:-apple-system,\'Segoe UI\',Arial,sans-serif;">' +
    '<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 18px rgba(30,39,97,.12);">' +
      '<div style="background:#1E2761;padding:26px 24px;">' +
        '<p style="color:#CADCFC;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin:0 0 6px;">ТеМАХ Портал</p>' +
        '<h1 style="color:#fff;font-size:22px;margin:0 0 4px;font-weight:700;">'+headerTitle+'</h1>' +
        '<p style="color:#9DB3E8;font-size:13px;margin:0;">'+headerSub+'</p>' +
      '</div>' +
      '<div style="padding:20px;">' + bodyHtml + '</div>' +
      '<div style="padding:20px 24px 26px;text-align:center;">' +
        '<a href="'+PORTAL_URL+'" style="display:inline-block;background:#1E2761;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:11px 26px;border-radius:7px;">Отвори в портала →</a>' +
        '<div style="font-size:11px;color:#9aa4b2;margin-top:14px;">'+footerText+'</div>' +
      '</div>' +
    '</div></body></html>';
}

function reportPostponedSectionHtml(postponedList){
  if (!postponedList || !postponedList.length) return '';
  var rows = postponedList.map(function(p){
    return '<div style="padding:8px 10px;border-bottom:1px solid #FDE68A;">' +
      '<div style="font-size:13px;font-weight:700;color:#78350f;">'+esc(p.title)+' <span style="font-weight:500;color:#92400e;">— '+esc(p.store)+'</span></div>' +
      (p.comment ? '<div style="font-size:12px;color:#92400e;margin-top:2px;">💬 '+esc(p.comment)+'</div>' : '') +
      '</div>';
  }).join('');
  return '<div style="margin-top:14px;">' +
    '<div style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">⏱ Отложени задачи ('+postponedList.length+')</div>' +
    '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;overflow:hidden;">'+rows+'</div>' +
    '</div>';
}

/* ═══════ РЕШЕТКА „ОБЕКТ × ЗАДАЧА" (дневен) ═══════════════════════════
   Досега дневният имейл казваше КОЛКО, но не и КАКВО: ред „Добрич — 0 от 6
   задачи" не показва кои са тези шест, тоест писмото носеше тревога без
   материал и всеки път трябваше да се отваря порталът.

   Ширини при 600px обвивка: reportEmailShell слага padding:20px около
   тялото, значи полезното е 560px. 110px за името на обекта (най-дългото
   отчетно име е „Гоце Делчев" - складовете и ЦО падат в isReportableStore)
   + 44px за „X/N" оставят 406px за колоните. При 12 колони това е ~34px на
   клетка, което стига за номер и икона. */
var REPORT_GRID_MAX_COLS = 12;

/* Заглавията на задачите са дълги и в колона не се събират, затова в
   решетката стоят само номера, а пълните имена - в легендата над нея. */
function reportGridLegendHtml(items){
  var rows = items.map(function(it, i){
    return '<div style="font-size:11px;color:#4B5563;margin-bottom:3px;">' +
      '<b style="color:#1F2937;">'+(i+1)+'.</b> '+esc(it.title)+'</div>';
  }).join('');
  return '<div style="background:#F4F6FB;border-radius:8px;padding:10px 12px;margin-bottom:10px;">'+rows+'</div>';
}

/* Четирите състояния на клетката. Сивата точка значи „задачата не важи за
   този обект" - показва се нарочно, защото иначе различният знаменател
   („4/5" до „5/5") се чете като бъг в отчета. */
function reportGridCellHtml(state){
  var glyph = state==='done' ? '✓' : state==='missing' ? '✖' : state==='postponed' ? '⏳' : '·';
  var color = state==='done' ? '#2F9E5C' : state==='missing' ? '#C0392B' : state==='postponed' ? '#B6841E' : '#C7CDD6';
  return '<td align="center" style="padding:7px 2px;border-bottom:1px solid #EEF1F6;font-size:13px;color:'+color+';">'+glyph+'</td>';
}

/* Линк към обекта. ?store= е ЕДИНСТВЕНИЯТ параметър, който порталът
   разбира (shared.js/today.js) - затова имената остават кликаеми и в
   решетката, и в зеления ред. */
function reportStoreLinkHtml(name, color){
  return '<a href="'+escAttr(PORTAL_URL + '?store=' + encodeURIComponent(name))+'" ' +
    'style="color:'+color+';text-decoration:none;font-weight:700;">'+esc(name)+'</a>';
}

function reportGridHtml(data){
  var items = data.items || [];
  var rows = data.rows || [];
  if (!items.length || !rows.length) return '';
  /* Резервният вариант се проверява на ВСЯКО пускане, не еднократно: броят
     дължими задачи се мени от ден на ден. Над прага решетката отпада и
     остава само срезът „по задачи". */
  if (items.length > REPORT_GRID_MAX_COLS) return '';

  var behind = rows.filter(function(r){ return r.pct < 100; });
  var perfect = rows.filter(function(r){ return r.pct === 100; })
    .map(function(r){ return r.name; }).sort();

  var h = '';
  if (behind.length) {
    h += '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin:14px 0 8px;">По обекти и задачи — изоставащите най-отгоре</div>';
    h += reportGridLegendHtml(items);
    h += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">';
    h += '<tr><td width="110" style="padding:4px 6px;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;">Обект</td>';
    items.forEach(function(it, i){
      h += '<td align="center" style="padding:4px 2px;font-size:11px;font-weight:700;color:#94a3b8;">'+(i+1)+'</td>';
    });
    h += '<td width="44" align="right" style="padding:4px 6px;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;">Общо</td></tr>';
    behind.forEach(function(r){
      h += '<tr><td width="110" style="padding:7px 6px;border-bottom:1px solid #EEF1F6;font-size:12px;">' +
        reportStoreLinkHtml(r.name, '#1F2937') + '</td>';
      (r.cells || []).forEach(function(st){ h += reportGridCellHtml(st); });
      h += '<td width="44" align="right" style="padding:7px 6px;border-bottom:1px solid #EEF1F6;font-size:12px;font-weight:800;color:'+reportPctColor(r.pct)+';">' +
        r.done+'/'+r.total+'</td></tr>';
    });
    h += '</table>';
  }
  if (perfect.length) {
    /* Стопроцентовите се свиват в един ред, но имената им остават линкове -
       иначе добре работещите обекти щяха да са единствените, до които не се
       стига с клик от писмото. */
    var names = perfect.map(function(n){ return reportStoreLinkHtml(n, '#14532d'); }).join(', ');
    h += '<div style="margin-top:10px;padding:10px 14px;background:#E9F5EF;border-radius:8px;font-size:12px;color:#14532d;">' +
      '✅ 100%: '+names+'</div>';
  }
  return h;
}

/* ═══════ „ПО ЗАДАЧИ" - обратният срез ═══════════════════════════════
   Решетката отговаря „кой изостава". Тази секция отговаря „коя задача
   изостава" - случаят, в който цяла задача е пропусната навсякъде и
   проблемът е в самата задача или в срока ѝ, не в обектите.
   weekly сменя мярката: в дневния мери пропуски, в седмичния - процент
   изпълнение през цялата седмица. */
function reportByTaskHtml(data, weekly){
  var items = data.items || [];
  var rows = data.rows || [];
  if (!items.length || !rows.length) return '';
  /* В седмичния една задача е разгъната на по едно явяване за всеки ден, в
     който е дължима („Каса (17.8)", „Каса (18.8)" …) - 31 явявания за 12
     задачи. Тук те се СЪБИРАТ обратно по задача, защото въпросът на
     секцията е „коя задача системно не се изпълнява", а не „кой ден".
     Дневният няма какво да събира: там всяка задача е точно едно явяване,
     тоест групирането по id+kind е тъждествено. */
  var groups = [], byKey = {};
  items.forEach(function(it, i){
    var key = it.kind + '|' + it.id;
    if (!byKey[key]) {
      byKey[key] = { title: it.baseTitle || it.title, scope: 0, done: 0 };
      groups.push(byKey[key]);
    }
    var g = byKey[key];
    rows.forEach(function(r){
      var st = (r.cells || [])[i];
      if (!st || st === 'na') return;   /* извън обхват - не влиза в знаменателя */
      g.scope++;
      if (st === 'done') g.done++;
    });
  });
  var stats = groups.map(function(g){
    return { title: g.title, scope: g.scope, done: g.done,
             missing: g.scope - g.done,
             pct: g.scope ? Math.round(g.done/g.scope*100) : 0 };
  }).filter(function(s){
    /* Дневният показва само задачите с поне един пропуск - пълните редове
       вече ги има в решетката. Седмичният показва всички, защото там
       въпросът е коя задача системно куца, не коя куца днес. */
    return s.scope > 0 && (weekly || s.missing > 0);
  });
  if (!stats.length) return '';
  stats.sort(function(a,b){ return weekly ? (a.pct - b.pct) : (b.missing - a.missing); });

  var body = stats.map(function(s){
    var right = weekly
      ? '<span style="font-weight:800;color:'+reportPctColor(s.pct)+';">'+s.pct+'%</span>' +
        '<span style="color:#9CA3AF;margin-left:5px;">'+s.done+'/'+s.scope+'</span>'
      : '<span style="font-weight:700;color:#C0392B;">липсва при '+s.missing+' от '+s.scope+' обекта</span>';
    return '<tr><td style="padding:7px 10px;border-bottom:1px solid #EEF1F6;font-size:12px;color:#1F2937;">' +
      esc(s.title) + '</td>' +
      '<td align="right" style="padding:7px 10px;border-bottom:1px solid #EEF1F6;font-size:12px;white-space:nowrap;">' +
      right + '</td></tr>';
  }).join('');

  return '<div style="margin-top:14px;">' +
    '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">' +
    (weekly ? 'По задачи за седмицата — най-слабата най-отгоре' : 'По задачи — най-пропусканата най-отгоре') + '</div>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">' +
    body + '</table></div>';
}

/* Прикачените към едно отмятане: снимка -> миниатюра, документ -> връзка с
   името. Проверката по разширение важи и за СТАРАТА колона photos: в нея
   лежат три .xlsx отпреди отделната колона files и досега излизаха в
   писмото като счупени картинки.

   Живее отделно, защото се ползва на ДВЕ места - коментарите по обекти в
   общия отчет и личните картички по задачи. Остане ли вградена в едното,
   другото се разминава при следващата промяна, без никой да забележи. */
function reportAttachmentsHtml(photos, files){
  var att = (photos||[]).concat(files||[]);
  if (!att.length) return '';
  var h = '<div style="margin-top:5px;">';
  att.forEach(function(ph){
    var nm = ph.filename || ph.name || '';
    var ext = nm.indexOf('.')>=0 ? nm.split('.').pop().toLowerCase() : '';
    /* Без име не съдим — виж tcAttachHtml() в bulletin.js.
       Миниатюрата е ВРЪЗКА към същия URL: 44x44 в пощата е квадратче, по
       което се вижда, че има снимка, но не се вижда самата снимка. Размерът
       остава — по-голяма миниатюра разваля подредбата на писмото. */
    if (!nm || ['jpg','jpeg','png','gif','webp','heic','heif'].indexOf(ext) >= 0) {
      h += '<a href="'+escAttr(ph.url)+'" target="_blank"><img src="'+escAttr(ph.url)+'" style="width:44px;height:44px;object-fit:cover;border-radius:5px;border:1px solid #D8DEE9;margin-right:5px;"></a>';
    } else {
      h += '<a href="'+escAttr(ph.url)+'" style="display:inline-block;font-size:12px;color:#1E2761;text-decoration:none;border:1px solid #D8DEE9;border-radius:5px;padding:3px 8px;margin:0 5px 5px 0;">📄 '+esc(nm||'документ')+'</a>';
    }
  });
  return h + '</div>';
}

/* ═══════ КОМЕНТАРИ ПО ОБЕКТИ ═══════════════════════════════════════
   Заварено: редовете бяха „Заглавие на задачата — Магазин", тоест три
   коментара от Добрич по три задачи излизаха на три различни места и
   обектът никога не се събираше на едно.

   Отложените влизат в СЪЩИЯ блок, отбелязани като отложени - те са
   съобщение от обекта точно както коментарът, само с друг статус. */
function reportCommentsByStoreHtml(data){
  var entries = [];
  (data.commentedList || []).forEach(function(c){
    entries.push({ store:c.store, title:c.title, comment:c.comment||'', photos:c.photos||[], files:c.files||[], postponed:false });
  });
  (data.postponedList || []).forEach(function(p){
    entries.push({ store:p.store, title:p.title, comment:p.comment||'', photos:[], files:[], postponed:true });
  });
  if (!entries.length) return '';

  /* Редът: изоставащите както в решетката, после стопроцентовите по азбучен
     ред. Правилото е нужно, защото решетката НЕ показва стопроцентовите -
     а точно те имат всичките си задачи изпълнени, тоест най-много редове
     тук (commentedList се строи от изпълнените отмятания). */
  var rows = data.rows || [];
  var order = rows.filter(function(r){ return r.pct < 100; }).map(function(r){ return r.name; })
    .concat(rows.filter(function(r){ return r.pct === 100; }).map(function(r){ return r.name; }).sort());
  var rank = {};
  order.forEach(function(n, i){ rank[n] = i; });

  var byStore = {}, seen = [];
  entries.forEach(function(e){
    if (!byStore[e.store]) { byStore[e.store] = []; seen.push(e.store); }
    byStore[e.store].push(e);
  });
  /* Обект извън rows (не бива да се случва) отива най-отзад, вместо
     съдържанието му да изчезне. */
  seen.sort(function(a,b){
    var ra = rank[a]===undefined ? 9999 : rank[a];
    var rb = rank[b]===undefined ? 9999 : rank[b];
    return ra - rb;
  });

  var blocks = seen.map(function(store){
    var lines = byStore[store].map(function(e){
      var h = '<div style="padding:6px 0 0;">' +
        '<div style="font-size:12px;color:#374151;">' +
        (e.postponed ? '<span style="color:#B45309;font-weight:700;">⏳ отложена · </span>' : '') +
        '<b>'+esc(e.title)+'</b></div>';
      if (e.comment) h += '<div style="font-size:12px;color:#4B5563;margin-top:2px;">💬 '+esc(e.comment)+'</div>';
      h += reportAttachmentsHtml(e.photos, e.files);
      return h + '</div>';
    }).join('');
    return '<div style="padding:10px 12px;border-bottom:1px solid #E5E9F0;">' +
      '<div style="font-size:13px;">'+reportStoreLinkHtml(store, '#1E2761')+'</div>' + lines + '</div>';
  }).join('');

  return '<div style="margin-top:14px;">' +
    '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">💬 Коментари по обекти ('+entries.length+')</div>' +
    '<div style="background:#F9FAFC;border:1px solid #E5E9F0;border-radius:8px;overflow:hidden;">'+blocks+'</div>' +
    '</div>';
}

/* Седмичният не изброява коментарите - 187 реда за седмица 34 са
   неизползваеми в имейл. Остава числото и пътят до тях. */
function reportCommentsCountHtml(commentedList){
  var n = (commentedList || []).length;
  if (!n) return '';
  var txt = n === 1
    ? '1 отмятане с коментар или снимка през седмицата — виж го в портала.'
    : n + ' отмятания с коментар или снимка през седмицата — виж ги в портала.';
  return '<div style="margin-top:14px;padding:10px 14px;background:#F4F6FB;border-radius:8px;font-size:12px;color:#4B5563;">💬 '+txt+'</div>';
}

/* Двете подсекции на „Каса". Празни ли са и двете — връща празен низ и
   секцията изчезва изцяло от писмото, вместо да стои като празна кутия.
   Примитивите са същите като на останалите секции (reportStoreLinkHtml,
   esc), за да не се появи трети стил в едно и също писмо. */
function reportKasaSectionHtml(kasa){
  if (!kasa) return '';
  var ret = kasa.returned || [];
  var over = kasa.overThreshold || [];
  if (!ret.length && !over.length) return '';

  var money = function(v){ return (v > 0 ? '+' : '') + v.toFixed(2) + ' лв'; };
  var ageLabel = function(d){
    if (d === null || d === undefined) return '';
    if (d <= 0) return 'днес';
    if (d === 1) return 'от вчера';
    return 'от ' + d + ' дни';
  };
  var out = '';

  if (ret.length) {
    var rows = ret.map(function(x){
      var age = ageLabel(x.days);
      return '<div style="padding:8px 10px;border-bottom:1px solid #FDE68A;">' +
        '<div style="font-size:13px;font-weight:700;color:#78350f;">' +
        reportStoreLinkHtml(x.store, '#78350f') +
        '<span style="font-weight:500;color:#92400e;"> — '+esc(x.type)+(x.date ? ' · '+esc(x.date) : '')+'</span>' +
        (age ? '<span style="font-weight:500;color:#b45309;"> ('+esc(age)+')</span>' : '') +
        '</div>' +
        (x.return_reason ? '<div style="font-size:12px;color:#92400e;margin-top:2px;">💬 '+esc(x.return_reason)+'</div>' : '') +
        '</div>';
    }).join('');
    out += '<div style="margin-top:14px;">' +
      '<div style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">🧾 Върнати от счетоводството ('+ret.length+')</div>' +
      '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;overflow:hidden;">'+rows+'</div>' +
      '</div>';
  }

  if (over.length) {
    var rows2 = over.map(function(x){
      return '<div style="padding:8px 10px;border-bottom:1px solid #FECACA;">' +
        '<div style="font-size:13px;font-weight:700;color:#7f1d1d;">' +
        reportStoreLinkHtml(x.store, '#7f1d1d') +
        '<span style="font-weight:500;color:#b91c1c;"> — '+esc(x.type)+'</span>' +
        '<span style="float:right;font-weight:700;color:#C0392B;">'+esc(money(x.razlika))+'</span>' +
        '</div>' +
        '</div>';
    }).join('');
    out += '<div style="margin-top:14px;">' +
      '<div style="font-size:11px;font-weight:700;color:#b91c1c;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">⚠️ Разминаване над '+esc(String(kasa.threshold))+' лв ('+over.length+')</div>' +
      '<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;overflow:hidden;">'+rows2+'</div>' +
      '</div>';
  }

  return out;
}

function buildDailyReportHtml(data){
  var body = '<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:6px;"><tr>' +
    reportStatCell(data.overallPct+'%','изпълнение за деня', data.overallPct===100?'#2F9E5C':data.overallPct>=50?'#1E2761':'#C0392B') +
    reportStatCell(data.totalDone+'/'+data.totalAll,'изпълнени задачи','#1E2761') +
    reportStatCell(String(data.laggards),'обекта без напредък', data.laggards>0?'#C0392B':'#2F9E5C') +
    reportStatCell(String(data.storeCount),'обекта общо','#1E2761') +
    '</tr></table>';
  body += reportTrendHtml(data.overallPct, data.trendYesterday, 'спрямо предходния ден');
  body += reportScopeNoticeHtml(data.reportDate);
  /* Решетката поглъща стария списък от 18 реда „X от Y задачи" - той
     повтаряше числата, без да казва кои задачи липсват. Отпадат и кутиите
     ТОП 3 / ИЗИСКВАТ ВНИМАНИЕ: те преповтаряха краищата на списък, който и
     без това беше подреден изоставащите отгоре. През един ден класация
     няма самостоятелна стойност - остава само в седмичния.
     Отложените задачи вече са вътре в „Коментари по обекти", отбелязани
     като отложени, вместо в собствена секция. */
  body += reportGridHtml(data);
  body += reportByTaskHtml(data, false);
  body += reportKasaSectionHtml(data.kasa);
  body += reportCommentsByStoreHtml(data);
  body += reportNoDueNoticeHtml(data.noDueCount, false);
  /* Датата идва от ДАННИТЕ, не от часовника: писмото се пише в 8:00 на
     следващия ден и трябва да носи датата на деня, който описва. Fallback-ът
     към часовника пази само ръчно повикване със стар обект без reportDate. */
  var reportD = data.reportDate ? new Date(data.reportDate+'T00:00:00') : new Date();
  var dateStr = reportD.toLocaleDateString('bg-BG', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  return reportEmailShell('📋 Дневен репорт — Задачи', dateStr, body,
    'Автоматичен репорт · ТеМАХ Портал');
}

/* ── Коя седмица обобщава седмичният отчет ──
   ПРИКЛЮЧИЛАТА, не текущата. Преди тук се взимаше просто последният
   публикуван бюлетин (order=created_at.desc&limit=1), а той се публикува
   ПРЕДВАРИТЕЛНО за идващата седмица. Следствие: всяко явяване имаше дата в
   бъдещето, reportItemMatchesComp не намираше нито едно съвпадение и всеки
   понеделнишки отчет излизаше 9-11% - не защото обектите не работят, а
   защото седмицата тъкмо започва. При пускане в петък същият дефект дава
   чисто 0%.
   Сега: в понеделник 24.08 отчетът покрива 17-23.08. */

/* Понеделникът на СОБСТВЕНАТА седмица на подадената дата.
   Дневният отчет пита точно това: „от коя седмица е денят, който описвам" -
   за да вземе бюлетина на ТАЗИ седмица, а не последния публикуван. */
function reportMondayOfWeek(d){
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - reportWeekdayIdx(x));
  return x;
}
/* Понеделникът на ПРЕДХОДНАТА седмица спрямо подадената дата - седмичният
   отчет обобщава приключилата, не текущата. */
function reportPrevWeekMonday(now){
  var d = reportMondayOfWeek(now);
  d.setDate(d.getDate() - 7);
  return d;
}
/* Номерът на седмицата за даден понеделник. Търси се през СЪЩАТА weekDays(),
   която после разгъва бюлетина на дати - иначе двете броения могат да се
   разминат в началото на годината.
   Редът на годините НЕ е произволен: по-късната се пробва ПЪРВА. Един и същи
   понеделник може да съвпадне с два номера - 29.12.2025 е и „седмица 53 на
   2025" (преливане на формулата), и седмица 1 на 2026. Бюлетините се номерират
   по второто, затова печели по-късната година. */
function reportWeekOfMonday(monday){
  var target = toLocalISO(monday);
  var yr = monday.getFullYear();
  var years = [yr + 1, yr, yr - 1];
  for (var i = 0; i < years.length; i++) {
    for (var w = 1; w <= 53; w++) {
      if (toLocalISO(weekDays(w, years[i])[0]) === target) return { week: w, year: years[i] };
    }
  }
  return null;
}
/* Бюлетинът за отчетната седмица. Точно съвпадение, ако го има; иначе
   най-новият публикуван, който НЕ е след нея - никога бюлетин за бъдеща
   седмица, защото точно това чупеше отчета. */
function reportPickWeeklyBulletin(list, target){
  if (!target || !Array.isArray(list)) return null;
  var exact = list.find(function(b){
    return b.year === target.year && b.week_number === target.week;
  });
  if (exact) return exact;
  return list.find(function(b){
    return b.year < target.year || (b.year === target.year && b.week_number <= target.week);
  }) || null;
}

function collectWeeklyReportData(cb, scope){
  var target = reportWeekOfMonday(reportPrevWeekMonday(new Date()));
  Promise.all([
    /* Списък, не limit=1 - изборът на правилната седмица става по-долу. */
    sbGet('bulletins','status=eq.published&order=year.desc,week_number.desc&limit=20'),
    sbGet('recurring_tasks','active=eq.true&order=sort_order.asc')
  ]).then(function(results){
    var bul = reportPickWeeklyBulletin(results[0], target);
    var allRecurring = Array.isArray(results[1]) ? results[1] : [];
    var recurringScheduled = allRecurring.filter(function(t){
      return (t.due_weekday!==null && t.due_weekday!==undefined) || !!t.due_time;
    });
    var noDueCount = allRecurring.length - recurringScheduled.length;

    var bulTasksPromise = bul ? sbGet('bulletin_tasks','bulletin_id=eq.'+bul.id) : Promise.resolve([]);

    bulTasksPromise.then(function(tasksRaw){
      var allBulTasks = Array.isArray(tasksRaw) ? tasksRaw : [];

      /* Датите на отчетната седмица - нужни са и при СТРОЕНЕТО на явяванията
         (по-долу), не само за прозореца на заявката. */
      var wkDates = bul ? weekDays(bul.week_number, bul.year).map(toLocalISO) : null;

      var items = [];
      allBulTasks.forEach(function(t){
        var dates = taskDueDates(t);
        if (dates.length > 1) {
          dates.forEach(function(d){
            var dLabel = new Date(d+'T00:00:00').toLocaleDateString('bg-BG',{day:'numeric',month:'numeric'});
            items.push({ id:t.id, kind:'regular', title:t.title+' ('+dLabel+')', baseTitle:t.title, target_stores:t.target_stores||null, date:d });
          });
        } else {
          /* 30 от 43 задачи в бюлетините НЯМАТ собствен срок - те важат за
             седмицата като цяло, не за конкретен ден. Такова явяване получава
             ДИАПАЗОН вместо дата: изпълнено е, ако има отмятане някъде в
             седмицата. Преди тук оставаше само date:null и
             reportItemMatchesComp приемаше кое да е отмятане на задачата,
             включително от други седмици. */
          var d0 = dates[0] || null;
          var reg = { id:t.id, kind:'regular', title:t.title, target_stores:t.target_stores||null, date: d0 };
          if (!d0 && wkDates) { reg.dateFrom = wkDates[0]; reg.dateTo = wkDates[6]; }
          items.push(reg);
        }
      });
      var recWithOcc = [];
      recurringScheduled.forEach(function(t){
        var occDates = bul ? reportRecurringWeekDates(t, bul.week_number, bul.year) : [];
        /* НЯМА явяване тази седмица - задачата изобщо не влиза в набора.
           Преди тук се добавяше елемент с date:null, който едновременно
           надуваше знаменателя (задача, която не е дължима) и през
           reportItemMatchesComp приемаше кое да е отмятане на същата задача.
           Оттам идваха „изпълнените" в стария snapshot. */
        if (!occDates.length) return;
        recWithOcc.push(t.id);
        /* Прозорец: ЕДИН елемент за седмицата, с ДИАПАЗОН вместо дата.
           reportItemMatchesComp() вече брои отмятане вътре в dateFrom..dateTo
           (същият механизъм като задачите от бюлетина без собствен срок),
           затова тук НЕ се разгъва на под-елементи по ден: иначе задача
           "до сряда" влиза три пъти в знаменателя, а свършена в понеделник
           излиза изпълнена само за понеделник. */
        if (recurringIsWindow(t)) {
          items.push({ id:t.id, kind:'recurring', title:t.title, target_stores:t.target_stores||null,
                       dateFrom: occDates[0], dateTo: occDates[occDates.length-1] });
          return;
        }
        if (occDates.length > 1) {
          occDates.forEach(function(d){
            var dLabel = new Date(d+'T00:00:00').toLocaleDateString('bg-BG',{day:'numeric',month:'numeric'});
            items.push({ id:t.id, kind:'recurring', title:t.title+' ('+dLabel+')', baseTitle:t.title, target_stores:t.target_stores||null, date:d });
          });
        } else {
          items.push({ id:t.id, kind:'recurring', title:t.title, target_stores:t.target_stores||null, date: occDates[0] });
        }
      });

      var regIds = allBulTasks.map(function(t){ return t.id; });
      /* Само задачите, които РЕАЛНО имат явяване тази седмица - няма смисъл
         да се теглят отмятания за задачи, които не са в набора. */
      var recIds = recWithOcc;

      /* Прозорец и на самата ЗАЯВКА, не само в JS. Без него за 10-те
         постоянни задачи се теглеше всяко отмятане, правено някога - и като
         трафик, и като материал за списъците, които после ги изброяваха
         всичките под заглавие за една седмица.
         Отмятанията с completion_date=NULL отпадат нарочно: те не могат да
         бъдат отнесени към коя да е седмица (184 такива в базата, всичките
         отпреди полето да се пълни).
         wkDates е сметнато по-горе - ползва се и при строенето на явяванията. */
      var dateQ = wkDates
        ? '&completion_date=gte.' + wkDates[0] + '&completion_date=lte.' + wkDates[6]
        : '';

      Promise.all([
        regIds.length ? sbGet('task_completions','task_id=in.('+regIds.join(',')+')'+dateQ) : Promise.resolve([]),
        recIds.length ? sbGet('task_completions','recurring_task_id=in.('+recIds.join(',')+')'+dateQ) : Promise.resolve([]),
        sbGet('users','select=store_name&order=store_name')
      ]).then(function(r2){
        var regComps = Array.isArray(r2[0]) ? r2[0] : [];
        var recComps = Array.isArray(r2[1]) ? r2[1] : [];
        var users = Array.isArray(r2[2]) ? r2[2] : [];
        var seen = {};
        var stores = users.filter(function(u){
          if (!isReportableStore(u.store_name) || seen[u.store_name]) return false;
          seen[u.store_name] = 1; return true;
        }).map(function(u){ return u.store_name; });

        /* Обхватът СРЯЗВА изведения списък, а не го замества — иначе склад
           или несъществуващ обект в assigned_stores би вкарал ред, какъвто
           пълният отчет никога не показва. Същото както в дневния. */
        if (scope && scope.length) {
          stores = stores.filter(function(s){ return scope.indexOf(s) >= 0; });
        }

        var comps = [];
        regComps.forEach(function(c){ comps.push({ item_id:c.task_id, kind:'regular', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos, files:c.files, completion_date:c.completion_date||null }); });
        recComps.forEach(function(c){ comps.push({ item_id:c.recurring_task_id, kind:'recurring', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos, files:c.files, completion_date:c.completion_date||null }); });

        var summary = reportBuildSummary(items, comps, stores, noDueCount);
        summary.weekLabel = bul ? ('Седмица ' + bul.week_number + ' · ' + bul.year) : 'Няма публикуван бюлетин';
        summary.scoped = !!(scope && scope.length);
        summary.weekDates = wkDates; /* същите дати, които стесняват задачите - в шапката */
        var finish = function(){
          /* ЕДИН прозорец за целия имейл: същите wkDates, които стесняват
             задачите и заявките за task_completions по-горе, стесняват и
             кросмодулните броячи. Без бюлетин wkDates е null и секцията
             пада обратно на подвижни 7 дни - тогава и шапката пише
             "Няма публикуван бюлетин", тоест няма с какво да се разминат. */
          collectCrossModuleWeeklySummary(function(cross){
            summary.cross = cross;
            cb(summary);
          }, wkDates ? { from: wkDates[0], to: wkDates[6] } : null, scope);
        };
        /* Срязаният отчет НИТО пише, НИТО чете тенденция — същото решение
           като при дневния: report_snapshots има ЕДИН ред за (weekly,
           седмица) и личното писмо би презаписало тенденцията на цялата
           верига с числата на четири обекта. */
        if (summary.scoped) {
          summary.trendPrevWeek = null;
          finish();
        } else if (bul) {
          var thisKey = bul.year + '-W' + String(bul.week_number).padStart(2,'0');
          var prevKey = bul.year + '-W' + String(bul.week_number-1).padStart(2,'0');
          reportSaveSnapshot('weekly', thisKey, summary.overallPct, summary.totalDone, summary.totalAll);
          reportFetchSnapshot('weekly', prevKey, function(snap){
            summary.trendPrevWeek = snap;
            finish();
          });
        } else {
          finish();
        }
      }).catch(function(){ cb(null); });
    }).catch(function(){ cb(null); });
  }).catch(function(){ cb(null); });
}

/* ── Прозорецът на кросмодулната секция ── Копие на reportCrossWindow от
   report.js. Два повикващи, два законни прозореца:

   win = {from,to} (локални ISO дати, понеделник и неделя) - СЕДМИЧНИЯТ
     отчет. Той носи шапка "Седмица 34 · 2026" и всеки ред пише "нови за
     периода", затова числата под шапката трябва да са за СЪЩАТА календарна
     седмица. Досега тук минаваха подвижни 7 дни назад от момента на
     пускането: в едно и също писмо за седмица 33 процентът по обекти
     покриваше 17-23.08, а кросмодулните броячи - 14-21.08.

   win = null - таб ДНЕС и дневният отчет (там подвижните 7 дни са верни,
     защото няма шапка с номер на седмица).

   Горната граница е ИЗКЛЮЧВАЩА (< понеделник 00:00 на следващата седмица),
   за да влезе цялата неделя. */
function reportCrossWindow(win){
  if (win && win.from && win.to) {
    var end = new Date(win.to + 'T00:00:00');
    end.setDate(end.getDate() + 1);
    return {
      fromISO: win.from, toISO: win.to,
      fromStamp: new Date(win.from + 'T00:00:00').toISOString(),
      toStamp: end.toISOString()
    };
  }
  var weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  return {
    fromISO: toLocalISO(weekAgo), toISO: null,
    fromStamp: weekAgo.toISOString(), toStamp: null
  };
}

/* scope: масив с обекти или null/празно = цялата верига. Дневният отчет не
   рендира тази секция; параметърът е тук, за да не се смятат числата втори
   път другаде. store_name влезе в четирите select-а, които взимаха само
   status/id — без него срязване по обект е невъзможно. */
function collectCrossModuleWeeklySummary(cb, win, scope){
  var W = reportCrossWindow(win);
  var hasScope = !!(scope && scope.length);
  var inScope = function(s){ return !hasScope || scope.indexOf(s) >= 0; };
  var upStamp = W.toStamp ? '&created_at=lt.' + W.toStamp : '';
  var upDate = W.toISO ? '&date=lte.' + W.toISO : '';

  /* "Застояли" и "остарели" НЕ следват прозореца - те са моментна снимка
     спрямо ДНЕС ("отворено от повече от 7 дни"), не "случило се през
     седмицата". Затова се смятат отделно и остават подвижни.
     Прагът за стоката на път вече се прилага в JS върху doc_date, а не в
     заявката върху created_at - затова тук няма отметка на времето. */

  Promise.all([
    /* store_name и direction са нужни, за да се отдели сторната по грешен
       прием от другите две посоки и да се разбие по обект. Само reviewed
       не стигаше - разбивка по магазин беше физически невъзможна. */
    sbGet('differences_reports','created_at=gte.'+W.fromStamp+upStamp+'&select=store_name,direction,reviewed'),
    sbGet('stock_returns','select=store_name,status,supplier,created_at'),
    sbGet('kasa_storno','created_at=gte.'+W.fromStamp+upStamp+'&select=store_name,status'),
    sbGet('kasa_zoborot','date=gte.'+W.fromISO+upDate+'&select=store_name,status'),
    /* Отворените позиции, БЕЗ филтър по created_at - той е датата на SAP
       импорта, не възрастта на позицията (виж пресмятането по-долу). */
    sbGet('goods_transit','status=in.(pending,sent)&select=store_name,supplier,doc_date,status,direction,remaining_qty,unit,material_name'),
    sbGet('transport_pallets','order=report_date.desc&select=store_name,report_date'),
    sbGet('users','select=store_name&order=store_name'),
    /* Прагът за „застояла" — една заявка вътре в колектора. Функцията се
       вика по веднъж на получател, тоест прагът се чете по веднъж на
       писмо; за нещо, което тече веднъж седмично, това е по-евтино от
       трети аргумент, който трябва да мине през два файла и три
       извикващи. */
    sbGet('app_settings','key=eq.returns_stale_days&select=key,value&limit=1'),
    /* Закъсненията са текущо СЪСТОЯНИЕ, не събитие от седмицата: срокът е
       изтекъл и тече, докато заявката не се затвори. Затова нито една от
       двете няма прозорец по дата — само отсяване на статусите, които
       нямат срок. Филтърът се повтаря и в JS през reportIsLate(), защото
       той е този, който наистина решава. */
    sbGet('client_orders','status=not.in.(done,refused,postponed)&select=id,in_num,store_name,customer_name,fulfiller,delivery,status,co_eta,created_at'),
    sbGet('transport_orders','status=not.in.(done,refused,postponed)&select=id,store_name,from_store,customer_name,delivery,status,awaiting_stock')
  ]).then(function(r){
    /* Всеки набор минава през ЕДИН предикат — отделни филтри на отделни
       места се разминават. */
    var diffReports = (Array.isArray(r[0]) ? r[0] : []).filter(function(x){ return inScope(x.store_name); });
    var returns = (Array.isArray(r[1]) ? r[1] : []).filter(function(x){ return inScope(x.store_name); });
    var storno = (Array.isArray(r[2]) ? r[2] : []).filter(function(x){ return inScope(x.store_name); });
    var zoborot = (Array.isArray(r[3]) ? r[3] : []).filter(function(x){ return inScope(x.store_name); });
    var transitOpen = (Array.isArray(r[4]) ? r[4] : []).filter(function(x){ return inScope(x.store_name); });
    var palletsRows = (Array.isArray(r[5]) ? r[5] : []).filter(function(x){ return inScope(x.store_name); });
    var allUsers = Array.isArray(r[6]) ? r[6] : [];

    var seenS = {};
    var storeNames = allUsers.filter(function(u){
      if (!isReportableStore(u.store_name) || seenS[u.store_name]) return false;
      seenS[u.store_name] = 1; return true;
    }).map(function(u){ return u.store_name; });
    if (hasScope) {
      storeNames = storeNames.filter(function(s){ return inScope(s); });
    }

    /* Сторната по грешен прием ИЗЛИЗА от числата за другите две посоки -
       иначе всяка бланка се брои по два пъти: веднъж в "Разлики" и втори
       път в собствения си ред. Липсваща посока пада на 'supplier', както
       навсякъде другаде (виж sdLineDirection в stock-differences.js). */
    var wrReports = diffReports.filter(function(x){ return x.direction==='wrong_receipt'; });
    var otherReports = diffReports.filter(function(x){ return x.direction!=='wrong_receipt'; });

    var diffs = {
      total: otherReports.length,
      reviewed: otherReports.filter(function(x){ return x.reviewed===true; }).length,
      unreviewed: otherReports.filter(function(x){ return x.reviewed!==true; }).length
    };
    /* Разбивка по обект - само обектите с поне една бланка, подредени по
       брой (най-натоварените отгоре), при равен брой по азбучен ред. */
    var wrByStore = {};
    wrReports.forEach(function(x){
      var s = x.store_name || '—';
      wrByStore[s] = (wrByStore[s] || 0) + 1;
    });
    var wrongReceipt = {
      total: wrReports.length,
      unreviewed: wrReports.filter(function(x){ return x.reviewed!==true; }).length,
      byStore: Object.keys(wrByStore).map(function(s){
        return { store: s, count: wrByStore[s] };
      }).sort(function(a,b){
        return b.count - a.count || a.store.localeCompare(b.store);
      })
    };
    var ret = {
      open: returns.filter(function(x){ return x.status!=='completed'; }).length,
      completed: returns.filter(function(x){ return x.status==='completed'; }).length
    };

    /* НЕВЗЕТАТА СТОКА, групирана по обект+доставчик. Картите отгоре са
       бройката; тук е кой обект колко време държи чия стока.
       Невзета = status 'pending'. Филтърът е в JS, не в заявката: същият
       набор захранва и двете карти отгоре и не бива да се реже два пъти
       по различен начин.
       Възрастта се мери в ЦЕЛИ ДНИ между две локални полунощи, не между
       два часа — иначе едно и също връщане излиза ту с 6, ту със 7 дни
       според това в колко часа е тръгнал кронът.
       doc_date НАРОЧНО не се ползва: колоната е null във всичките 435
       записа (проверено 08.09.2026), тоест изглежда като дата, а не е. */
    var refD = new Date(toLocalISO(new Date())+'T00:00:00');
    var rlMap = {};
    var returnsList = [];
    returns.forEach(function(x){
      if (x.status !== 'pending') return;
      var when = x.created_at ? new Date(x.created_at) : null;
      if (!when || isNaN(when.getTime())) return;
      var age = Math.max(0, Math.floor((refD - new Date(toLocalISO(when)+'T00:00:00')) / 86400000));
      var sup = x.supplier || '—';
      var key = x.store_name + '||' + sup;
      var g = rlMap[key];
      if (!g) {
        g = { store: x.store_name, supplier: sup, count: 0, oldestDays: age, newestDays: age };
        rlMap[key] = g; returnsList.push(g);
      }
      g.count++;
      if (age > g.oldestDays) g.oldestDays = age;
      if (age < g.newestDays) g.newestDays = age;
    });
    /* Най-дълго стоялото отгоре; при равни дни по обект, за да е стабилен
       редът между две изпращания. */
    returnsList.sort(function(a,b){
      return b.oldestDays - a.oldestDays ||
             String(a.store).localeCompare(String(b.store)) ||
             String(a.supplier).localeCompare(String(b.supplier));
    });

    /* Ключът се сверява и в JS: PostgREST връща само търсения ред, но
       един ден в app_settings ще има повече ключове и 'първият ред' спира
       да значи каквото и да е. */
    var returnsStaleDays = 7;
    (Array.isArray(r[7]) ? r[7] : []).forEach(function(s){
      if (!s || s.key !== 'returns_stale_days') return;
      var v = Number(String(s.value == null ? '' : s.value).trim().replace(',', '.'));
      if (isFinite(v) && v > 0) returnsStaleDays = v;
    });

    /* ЗАКЪСНЕНИЯТА. Опорната дата е refD (днес), същата като на невзетата
       стока — и двете са текущо състояние, не срез от седмицата.
       reportIsLate() носи правилото дума по дума от isLate() в shared.js;
       статусите се отсяват пак тук, а не само в заявката, защото заявката
       пести трафик, а решава JS-ът. */
    var byDaysDesc = function(a,b){
      return b.days - a.days || String(a.store).localeCompare(String(b.store));
    };
    var lateOrders = [];
    (Array.isArray(r[8]) ? r[8] : []).forEach(function(o){
      if (!inScope(o.store_name) || !reportIsLate(o, refD)) return;
      lateOrders.push({
        store: o.store_name, in_num: o.in_num || '', customer: o.customer_name || '',
        fulfiller: o.fulfiller || '', days: reportLateDays(o, refD)
      });
    });
    lateOrders.sort(byDaysDesc);

    var lateTransport = [];
    (Array.isArray(r[9]) ? r[9] : []).forEach(function(o){
      if (!inScope(o.store_name) || !reportIsLate(o, refD)) return;
      lateTransport.push({
        store: o.store_name, from: o.from_store || '', to: o.store_name,
        customer: o.customer_name || '', days: reportLateDays(o, refD)
      });
    });
    lateTransport.sort(byDaysDesc);

    /* Разбивка по обект за ПЪЛНИЯ отчет: 92 закъснели заявки в 10 обекта
       (08.09.2026) не се четат ред по ред. Най-натоварените отгоре; при
       равен брой — този с най-старата заявка. */
    var loMap = {};
    var lateOrdersByStore = [];
    lateOrders.forEach(function(x){
      var g = loMap[x.store];
      if (!g) { g = { store: x.store, count: 0, maxDays: 0 }; loMap[x.store] = g; lateOrdersByStore.push(g); }
      g.count++;
      if (x.days > g.maxDays) g.maxDays = x.days;
    });
    lateOrdersByStore.sort(function(a,b){
      return b.count - a.count || b.maxDays - a.maxDays ||
             String(a.store).localeCompare(String(b.store));
    });

    /* СТОКА НА ПЪТ. Възрастта е дни от doc_date до деня на отчета, НЕ от
       created_at: created_at е датата на SAP импорта, тоест към 08.09.2026
       всичките 835 отворени позиции носят 01.09 и „по-стари от 7 дни" беше
       или всички, или никой. Точно това чупеше стария брояч — заявката
       филтрираше created_at<-7d и връщаше целия набор.
       Отворена позиция = pending или sent; received/rejected са приключени. */
    var TRANSIT_STALE_DAYS = 7;
    var transitAge = function(row){
      if (!row.doc_date) return 0;
      var d = new Date(String(row.doc_date).slice(0,10)+'T00:00:00');
      if (isNaN(d.getTime())) return 0;
      return Math.round((refD - d) / 86400000);
    };
    var transitStale = 0;
    var trMap = {};
    var transitByStore = [];
    transitOpen.forEach(function(x){
      var s = x.store_name || '—';
      var age = transitAge(x);
      var g = trMap[s];
      if (!g) { g = { store: s, open: 0, stale: 0, oldestDays: 0 }; trMap[s] = g; transitByStore.push(g); }
      g.open++;
      if (age > TRANSIT_STALE_DAYS) { g.stale++; transitStale++; }
      if (age > g.oldestDays) g.oldestDays = age;
    });
    transitByStore.sort(function(a,b){
      return b.stale - a.stale || b.oldestDays - a.oldestDays ||
             String(a.store).localeCompare(String(b.store));
    });

    /* НЕОБРАБОТЕНИ ОТ ЛОГИСТИЧЕН СКЛАД. Същият набор client_orders като
       закъсненията - втора заявка за същите редове би струвала още едно
       обикаляне и би могла да върне различна снимка.
       „Чака" се мери от created_at (кога е подадена заявката), а
       просрочието - от delivery през reportLateDays, тоест двете числа
       отговарят на два различни въпроса и не се смесват. */
    var daysSince = function(stamp){
      if (!stamp) return 0;
      var d = new Date(stamp);
      if (isNaN(d.getTime())) return 0;
      d.setHours(0,0,0,0);
      return Math.round((refD - d) / 86400000);
    };
    var warehousePending = [];
    (Array.isArray(r[8]) ? r[8] : []).forEach(function(o){
      if (o.status !== 'pending') return;
      if (LOGISTICS_WAREHOUSES.indexOf(o.fulfiller || '') < 0) return;
      if (!inScope(o.store_name)) return;
      warehousePending.push({
        store: o.store_name, in_num: o.in_num || '',
        customer: o.customer_name || '', warehouse: o.fulfiller || '',
        waitDays: daysSince(o.created_at),
        lateDays: reportIsLate(o, refD) ? reportLateDays(o, refD) : 0
      });
    });
    warehousePending.sort(function(a,b){
      return b.lateDays - a.lateDays || b.waitDays - a.waitDays ||
             String(a.store).localeCompare(String(b.store));
    });
    var whMap = {};
    var warehousePendingByStore = [];
    warehousePending.forEach(function(x){
      var g = whMap[x.store];
      if (!g) { g = { store: x.store, count: 0, late: 0, oldestWait: 0 }; whMap[x.store] = g; warehousePendingByStore.push(g); }
      g.count++;
      if (x.lateDays > 0) g.late++;
      if (x.waitDays > g.oldestWait) g.oldestWait = x.waitDays;
    });
    warehousePendingByStore.sort(function(a,b){
      return b.count - a.count || b.late - a.late || b.oldestWait - a.oldestWait ||
             String(a.store).localeCompare(String(b.store));
    });

    var stornoSummary = {
      total: storno.length,
      draft: storno.filter(function(x){ return x.status==='draft'; }).length,
      returned: storno.filter(function(x){ return x.status==='returned'; }).length,
      resubmitted: storno.filter(function(x){ return x.status==='resubmitted'; }).length,
      confirmed: storno.filter(function(x){ return x.status==='confirmed'; }).length
    };
    var zoborotSummary = {
      total: zoborot.length,
      draft: zoborot.filter(function(x){ return x.status==='draft'; }).length,
      /* Трета кофа, по образеца на stornoSummary точно отгоре. От момента, в
         който връщането за корекция маркира kasa_zoborot с 'returned' вместо
         'draft', върнатите изпадаха и от двете кофи и тихо не се брояха
         никъде: draft+confirmed вече не даваше total. */
      returned: zoborot.filter(function(x){ return x.status==='returned'; }).length,
      confirmed: zoborot.filter(function(x){ return x.status==='confirmed'; }).length
    };

    var latestByStore = {};
    palletsRows.forEach(function(p){
      if (!latestByStore[p.store_name]) latestByStore[p.store_name] = p.report_date;
    });
    var todayD = new Date();
    var palletsMissing = 0, palletsStale = 0;
    storeNames.forEach(function(s){
      var d = latestByStore[s];
      if (!d) { palletsMissing++; return; }
      var diffDays = Math.floor((todayD - new Date(d+'T00:00:00')) / 86400000);
      if (diffDays > 7) palletsStale++;
    });

    cb({
      diffs: diffs, wrongReceipt: wrongReceipt,
      returns: ret, storno: stornoSummary, zoborot: zoborotSummary,
      returnsList: returnsList, returnsStaleDays: returnsStaleDays,
      lateOrders: lateOrders, lateOrdersByStore: lateOrdersByStore,
      lateTransport: lateTransport,
      transitStale: transitStale, transitByStore: transitByStore,
      warehousePending: warehousePending,
      warehousePendingByStore: warehousePendingByStore,
      pallets: { missing: palletsMissing, stale: palletsStale, total: storeNames.length },
      /* Прозорецът пътува заедно с числата, за да го изпише заглавието. */
      window: { from: W.fromISO, to: W.toISO }
    });
  }).catch(function(){ cb(null); });
}

function crossMetricCard(num, label, warn){
  return '<div style="flex:1;min-width:110px;background:'+(warn?'#FDEEEA':'#F9FAFC')+';border:1px solid '+(warn?'#F3C6BA':'#eef1f6')+';border-radius:8px;padding:10px 12px;text-align:center;">' +
    '<div style="font-size:18px;font-weight:800;color:'+(warn?'#C0392B':'#1E2761')+';">'+num+'</div>' +
    '<div style="font-size:10px;color:#6B7280;margin-top:2px;line-height:1.3;">'+label+'</div></div>';
}
function crossModuleRow(icon, title, cardsHtml){
  return '<div style="margin-top:12px;">' +
    '<div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;">'+icon+' '+title+'</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">'+cardsHtml+'</div>' +
    '</div>';
}
/* Ред "Сторна по грешен прием" - единственият с разбивка ПО МАГАЗИН.
   От тези бланки излизат глоби (удръжки от гъвкавата част на обекта),
   затова е важно кой обект колко има, не само общото число.
   Показват се САМО обектите с поне една бланка - празните редове само
   биха разредили таблото.
   Ползва същите примитиви (crossModuleRow/crossMetricCard) като другите
   редове, защото същият HTML отива и в седмичния имейл, където сложен
   лейаут не се рендира надеждно.
   Старо cross без това поле не бива да чупи секцията - тогава редът
   просто отпада. */
function buildWrongReceiptRowHtml(wr){
  if (!wr) return '';
  if (!wr.total) {
    return crossModuleRow('🧾','Сторна по грешен прием (нови за периода)',
      crossMetricCard(0,'няма нови'));
  }
  var cards = crossMetricCard(wr.total,'общо нови') +
              crossMetricCard(wr.unreviewed,'непрегледани', wr.unreviewed>0);
  cards += wr.byStore.map(function(s){
    return crossMetricCard(s.count, esc(s.store), true);
  }).join('');
  return crossModuleRow('🧾','Сторна по грешен прием (нови за периода)', cards);
}
/* "17.08 – 23.08" за затворен прозорец; "последните 7 дни" за подвижния. */
function reportCrossWindowLabel(win){
  if (!win || !win.to) return 'последните 7 дни';
  var f = function(d){
    return new Date(d + 'T00:00:00').toLocaleDateString('bg-BG', { day:'numeric', month:'numeric' });
  };
  return f(win.from) + ' – ' + f(win.to);
}
/* Списъкът „невзета стока по доставчик" под картите на реда „За връщане".
   Картите остават — те са бройката; списъкът казва КЪДЕ стои и ОТКОГА.

   РЕД = ОБЕКТ, не двойка обект+доставчик. Дотук всяка двойка имаше свой
   ред и на живо това бяха десетки почти еднакви „X — Доставчик — 1 поз. ·
   най-старата от 11 дни": формално вярно, но не е справка — окото няма за
   какво да се хване. Сега обектът е един ред с два текстови реда: числата
   отгоре, доставчиците отдолу с по-дребен сив шрифт. Обектите са 18 по
   природа, тоест списъкът е ограничен сам по себе си и няма нужда от лимит.

   ДАННИТЕ НЕ СЕ ПИПАТ: cross.returnsList си остават групи обект+доставчик
   както ги връща колекторът. Тук се сменя само подредбата им в писмото.

   Двата режима са различни НАРОЧНО:
   · scoped (регионален, управител) — ВСИЧКИ обекти в обхвата и ВСИЧКИ
     доставчици. Обхватът му е няколко обекта и списъкът е негов работен
     списък, не сводка; застоялите се открояват, но нищо не се крие.
   · пълен (цялата верига) — само обектите с ПОНЕ ЕДИН доставчик над прага,
     и в долния ред само тези доставчици. Към 08.09.2026 pending групите са
     248, от които 145 над 7 дни: без прага писмото не се чете. Следствие:
     броят позиции в горния ред е сборът на ПОКАЗАНИТЕ доставчици, не на
     всички — иначе числото отгоре не отговаря на списъка отдолу.

   Прагът влиза и в заглавието на пълния режим — иначе читателят няма как
   да знае защо едни редове ги има, а други не. */
function reportReturnsListHtml(cross, scoped){
  if (!cross) return '';
  var all = cross.returnsList || [];
  var thr = (cross.returnsStaleDays === null || cross.returnsStaleDays === undefined)
    ? 7 : cross.returnsStaleDays;
  if (!all.length) return '';

  var byStore = {};
  var stores = [];
  all.forEach(function(g){
    if (!scoped && g.oldestDays < thr) return;
    var s = byStore[g.store];
    if (!s) {
      s = { store: g.store, count: 0, oldestDays: 0, sup: [] };
      byStore[g.store] = s; stores.push(s);
    }
    s.count += g.count;
    if (g.oldestDays > s.oldestDays) s.oldestDays = g.oldestDays;
    s.sup.push(g);
  });
  if (!stores.length) return '';
  /* Най-дълго чакащият обект отгоре; при равни дни по име, за да е стабилен
     редът между две изпращания. */
  stores.sort(function(a,b){
    return b.oldestDays - a.oldestDays || String(a.store).localeCompare(String(b.store));
  });

  var body = stores.map(function(s){
    var warn = s.oldestDays >= thr;
    /* Доставчиците по азбучен ред — четат се като списък, не като класация.
       Броят се изписва само когато е повече от една позиция; застоялите се
       удебеляват, за да личат вътре в реда. */
    var supText = s.sup.slice().sort(function(a,b){
      return String(a.supplier).localeCompare(String(b.supplier));
    }).map(function(g){
      var name = esc(g.supplier) + (g.count > 1 ? ' ('+g.count+')' : '');
      return g.oldestDays >= thr ? '<b>'+name+'</b>' : name;
    }).join(', ');

    return '<div style="padding:7px 10px;border-bottom:1px solid '+(warn?'#FECACA':'#eef1f6')+';">' +
      '<div style="font-size:12px;">' +
        reportStoreLinkHtml(s.store, warn ? '#7f1d1d' : '#374151') +
        '<span style="color:'+(warn?'#b91c1c':'#6B7280')+';"> — '+s.count+' поз. при '+
        s.sup.length+(s.sup.length === 1 ? ' доставчик' : ' доставчика')+'</span>' +
        '<span style="float:right;color:'+(warn?'#C0392B':'#6B7280')+';font-weight:'+(warn?'700':'500')+';">' +
        'най-старата от '+s.oldestDays+' дни</span>' +
      '</div>' +
      '<div style="font-size:11px;color:#9CA3AF;margin-top:2px;">'+supText+'</div>' +
      '</div>';
  }).join('');

  var title = scoped
    ? '⏳ Невзета стока по доставчик'
    : '⏳ Невзета стока по доставчик (над '+esc(String(thr))+' дни)';

  return '<div style="margin-top:8px;">' +
    '<div style="font-size:11px;font-weight:700;color:#6B7280;margin-bottom:6px;">'+title+'</div>' +
    '<div style="background:#FFFFFF;border:1px solid #eef1f6;border-radius:8px;overflow:hidden;">'+body+'</div>' +
    '</div>';
}

/* Секция „Закъснения" — два списъка под едно заглавие, защото са едно и
   също питане („кой срок е изтекъл") към два различни таба.

   Клиентските заявки се държат като списъка с невзетата стока:
   · scoped (регионален, управител) — ред по ред, с номер, клиент и кой
     изпълнява; това е работен списък и има кого да подсети;
   · пълен (цялата верига) — по ОБЕКТ. Към 08.09.2026 закъснелите са 92 в
     10 обекта: ред по ред значи писмо, което никой не отваря, а разбивката
     по обект казва същото с 10 реда.
   Транспортът е ред по ред и в двата режима — той е пет записа общо, не
   деветдесет, и обобщение по обект не би спестило нищо.

   from_store НА ТРАНСПОРТА е празен във ВСИЧКИТЕ 1529 записа (проверено
   08.09.2026): колоната съществува, но нищо не я пълни — transport.js дори
   не я споменава, тя се ползва само в клиентските заявки. Затова стрелката
   „от → до" се рисува САМО ако наистина има от какво; иначе редът пада на
   клиента, който е попълнен навсякъде. Полето остава в данните — почне ли
   да се пълни, редът се оправя сам, без промяна тук. */
function reportLateSectionHtml(cross, scoped){
  if (!cross) return '';
  var orders = cross.lateOrders || [];
  var byStore = cross.lateOrdersByStore || [];
  var transport = cross.lateTransport || [];
  if (!orders.length && !transport.length) return '';

  var dayWord = function(d){ return d === 1 ? ' ден' : ' дни'; };
  var box = function(inner){
    return '<div style="background:#FFFFFF;border:1px solid #FECACA;border-radius:8px;overflow:hidden;">'+inner+'</div>';
  };
  var head = function(t){
    return '<div style="font-size:11px;font-weight:700;color:#b91c1c;margin-bottom:6px;">'+t+'</div>';
  };
  var age = function(d){
    return '<span style="float:right;font-weight:700;color:#C0392B;">+'+d+dayWord(d)+'</span>';
  };
  var row = function(inner){
    return '<div style="padding:7px 10px;border-bottom:1px solid #FECACA;font-size:12px;">'+inner+'</div>';
  };

  var out = '';

  if (orders.length) {
    var body;
    if (scoped) {
      body = orders.map(function(o){
        return row(reportStoreLinkHtml(o.store, '#7f1d1d') +
          '<span style="color:#b91c1c;"> — '+
          (o.in_num ? '№ '+esc(o.in_num)+' · ' : '')+esc(o.customer || '—')+
          (o.fulfiller ? ' — изпълнява '+esc(o.fulfiller) : '')+'</span>' + age(o.days));
      }).join('');
    } else {
      body = byStore.map(function(g){
        return row(reportStoreLinkHtml(g.store, '#7f1d1d') +
          '<span style="color:#b91c1c;"> — '+g.count+(g.count === 1 ? ' заявка' : ' заявки')+'</span>' +
          '<span style="float:right;font-weight:700;color:#C0392B;">най-старата +'+g.maxDays+dayWord(g.maxDays)+'</span>');
      }).join('');
    }
    out += '<div style="margin-top:12px;">' +
      head('🔴 Закъснели клиентски заявки ('+orders.length+')') + box(body) + '</div>';
  }

  if (transport.length) {
    var trBody = transport.map(function(t){
      var where = t.from ? esc(t.from)+' → '+esc(t.store) : esc(t.customer || '—');
      return row(reportStoreLinkHtml(t.store, '#7f1d1d') +
        '<span style="color:#b91c1c;"> — '+where+'</span>' + age(t.days));
    }).join('');
    out += '<div style="margin-top:12px;">' +
      head('🔴 Закъснял транспорт ('+transport.length+')') + box(trBody) + '</div>';
  }

  return out;
}

/* Списък „Стока на път" по ОБЕКТ, не по позиция: към 08.09.2026 отворените
   позиции (pending+sent) са около 900 и ред по ред е нечетимо в писмо.
   Затова и двата режима групират — разликата е кои обекти влизат.
   Пълният отчет показва само обектите СЪС застояли: иначе списъкът е цялата
   верига и не насочва вниманието никъде. Срязаният показва всеки обект от
   обхвата с отворени позиции, защото там обектите са един-два и „нула
   застояли" също е отговор, който управителят иска да види. */
function reportTransitListHtml(cross, scoped){
  if (!cross) return '';
  var rows = cross.transitByStore || [];
  var list = rows.filter(function(g){ return scoped ? g.open > 0 : g.stale > 0; });
  if (!list.length) return '';
  var dayWord = function(d){ return d === 1 ? ' ден' : ' дни'; };
  var openWord = function(n){ return n === 1 ? ' отворена' : ' отворени'; };
  var body = list.map(function(g){
    return '<div style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;">' +
      reportStoreLinkHtml(g.store, '#374151') +
      '<span style="color:#4b5563;"> — '+g.open+openWord(g.open)+' · '+
      '<b style="color:'+(g.stale>0?'#C0392B':'#4b5563')+';">'+g.stale+' над 7 дни</b> · '+
      'най-старата от '+g.oldestDays+dayWord(g.oldestDays)+'</span></div>';
  }).join('');
  return '<div style="margin-top:8px;background:#FFFFFF;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">'+body+'</div>';
}

/* Клиентски заявки, които чакат ЛОГИСТИЧЕН СКЛАД да ги обработи.
   Нарочно СЕ ПРИПОКРИВА със „Закъснели клиентски заявки" отгоре: там
   въпросът е „кой срок е изтекъл", тук е „кой чака склада". Една и съща
   заявка може да е и двете и това не е дублиране — вадене на едната от
   другата би скрило точно най-важните редове.
   Просрочието се показва само когато го има: заявка отпреди два дни със
   срок утре чака склада, но не е закъсняла. */
function reportWarehousePendingHtml(cross, scoped){
  if (!cross) return '';
  var items = cross.warehousePending || [];
  if (!items.length) return '';
  var byStore = cross.warehousePendingByStore || [];
  var dayWord = function(d){ return d === 1 ? ' ден' : ' дни'; };
  var row = function(inner){
    return '<div style="padding:7px 10px;border-bottom:1px solid #FDE68A;font-size:12px;">'+inner+'</div>';
  };
  var body;
  if (scoped) {
    body = items.map(function(o){
      return row(reportStoreLinkHtml(o.store, '#78350f') +
        '<span style="color:#92400e;"> — '+
        (o.in_num ? '№ '+esc(o.in_num)+' · ' : '')+esc(o.customer || '—')+
        ' — '+esc(o.warehouse)+
        ' — чака '+o.waitDays+dayWord(o.waitDays)+
        (o.lateDays > 0 ? ' · <b style="color:#C0392B;">+'+o.lateDays+' просрочие</b>' : '')+
        '</span>');
    }).join('');
  } else {
    body = byStore.map(function(g){
      return row(reportStoreLinkHtml(g.store, '#78350f') +
        '<span style="color:#92400e;"> — '+g.count+(g.count === 1 ? ' заявка' : ' заявки')+
        (g.late ? ' · <b style="color:#C0392B;">'+g.late+' просрочени</b>' : '')+
        ' · най-дълго чака '+g.oldestWait+dayWord(g.oldestWait)+'</span>');
    }).join('');
  }
  return '<div style="margin-top:12px;">' +
    '<div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:6px;">📦 Необработени от логистичен склад ('+items.length+')</div>' +
    '<div style="background:#FFFFFF;border:1px solid #FDE68A;border-radius:8px;overflow:hidden;">'+body+'</div>' +
    '</div>';
}

/* scoped казва ЧИЙ е отчетът: срязан (регионален, управител) или за
   цялата верига. Само списъкът с невзетата стока го ползва — виж
   reportReturnsListHtml. Липсващ аргумент значи пълен отчет, тоест
   таб „Днес" и старите извиквания не се променят. */
function buildCrossModuleSectionHtml(cross, scoped){
  if (!cross) return '';
  var h = '<div style="margin-top:18px;padding-top:14px;border-top:2px solid #eef1f6;">';
  h += '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">🗂 Друго от периода ('+reportCrossWindowLabel(cross.window)+') — по табове</div>';

  /* Числата тук са БЕЗ сторната по грешен прием - тя има собствен ред
     по-долу и иначе би се броила два пъти. */
  h += crossModuleRow('📋','Разлики от доставчици и междускладови (нови за периода)',
    crossMetricCard(cross.diffs.total,'нови доклада') +
    crossMetricCard(cross.diffs.reviewed,'прегледани',false) +
    crossMetricCard(cross.diffs.unreviewed,'непрегледани', cross.diffs.unreviewed>0));

  h += buildWrongReceiptRowHtml(cross.wrongReceipt);

  h += crossModuleRow('📥','За връщане (текущо състояние)',
    crossMetricCard(cross.returns.open,'отворени (чакат/взети)', cross.returns.open>0) +
    crossMetricCard(cross.returns.completed,'приключени'));
  h += reportReturnsListHtml(cross, scoped);

  h += reportLateSectionHtml(cross, scoped);
  h += reportWarehousePendingHtml(cross, scoped);

  h += crossModuleRow('💳','Каса — Сторно бележки (нови за периода)',
    crossMetricCard(cross.storno.total,'общо нови') +
    crossMetricCard(cross.storno.draft,'чакат счетоводство', cross.storno.draft>0) +
    crossMetricCard(cross.storno.returned,'върнати за коментар', cross.storno.returned>0) +
    crossMetricCard(cross.storno.confirmed,'приключени'));

  h += crossModuleRow('🧾','Каса — Равнение (за периода)',
    crossMetricCard(cross.zoborot.total,'общо записа') +
    crossMetricCard(cross.zoborot.draft,'непотвърдени от обект', cross.zoborot.draft>0) +
    crossMetricCard(cross.zoborot.returned,'върнати за корекция', cross.zoborot.returned>0) +
    crossMetricCard(cross.zoborot.confirmed,'потвърдени'));

  h += crossModuleRow('🚚','Стока на път',
    crossMetricCard(cross.transitStale,'застояли (>7 дни по документ)', cross.transitStale>0));
  h += reportTransitListHtml(cross, scoped);

  h += crossModuleRow('📦','Палети',
    crossMetricCard(cross.pallets.missing,'обекта без данни', cross.pallets.missing>0) +
    crossMetricCard(cross.pallets.stale,'остарели (>7 дни)', cross.pallets.stale>0) +
    crossMetricCard(cross.pallets.total,'обекта общо'));

  h += '</div>';
  return h;
}

/* Подзаглавието на седмичния отчет - „Обобщение за 17.08 – 23.08.2026".
   Само „Обобщение за седмицата" не казваше КОЯ седмица. Номерът стои в
   заглавието, но отчетите не се четат по номер на седмица, а по дати.
   Без бюлетин wkDates е null и се пада обратно на общия текст - тогава
   заглавието и без това пише „Няма публикуван бюлетин". */
function reportWeekRangeLabel(wkDates){
  if (!wkDates || wkDates.length < 7) return 'Обобщение за седмицата';
  var a = new Date(wkDates[0]+'T00:00:00'), b = new Date(wkDates[6]+'T00:00:00');
  return 'Обобщение за ' + reportDayMonth(a) + ' – ' + reportDayMonth(b) + '.' + b.getFullYear();
}

/* „23.08" — един формат на едно място. Ползва се и от подзаглавието, и от
   темите на писмата; разминат ли се, същата седмица излиза записана по два
   различни начина в едно и също писмо. */
function reportDayMonth(d){
  return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0');
}

/* ═══════ ТЕМИТЕ НА ПИСМАТА ═══════════════════════════════════════════
   Досега всяко дневно писмо носеше една и съща тема и в пощата се
   превръщаха в неразличима поредица — не можеш да отвориш „онзи от
   вторник", нито да видиш дали днешният изобщо е дошъл.

   След като отчетът описва ПРИКЛЮЧИЛИЯ ден, темата без дата е и
   подвеждаща: писмото идва сутринта на 24-ти, а е за 23-ти.

   Датата идва от ДАННИТЕ (същия reportDate/weekDates, които пълнят
   шапката), не от часовника на изпращането — иначе темата и шапката ще
   се разминават при всяко забавено изпращане.

   Липсват или са счупени данните — темата пада на старата. По-добре без
   дата, отколкото „NaN.NaN" в темата на писмо до управители.

   Бележка: resend-email прекарва темата през transliterate() и тя излиза
   на латиница. Цифрите оцеляват — точно те носят смисъла тук. */
function reportDailySubject(reportDate){
  var d = reportDate ? new Date(reportDate+'T00:00:00') : null;
  if (!d || isNaN(d.getTime())) return '📋 ТеМАХ — Дневен репорт';
  return '📋 ТеМАХ — Дневен репорт ' + reportDayMonth(d) + '.' + d.getFullYear();
}
function reportWeeklySubject(wkDates){
  if (!wkDates || wkDates.length < 7) return '📊 ТеМАХ — Седмичен репорт';
  var a = new Date(wkDates[0]+'T00:00:00'), b = new Date(wkDates[6]+'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return '📊 ТеМАХ — Седмичен репорт';
  return '📊 ТеМАХ — Седмичен репорт ' + reportDayMonth(a) + ' – ' + reportDayMonth(b) + '.' + b.getFullYear();
}

function buildWeeklyReportHtml(data){
  var body = '<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:6px;"><tr>' +
    reportStatCell(data.overallPct+'%','изпълнение за седмицата', data.overallPct===100?'#2F9E5C':data.overallPct>=50?'#1E2761':'#C0392B') +
    reportStatCell(data.totalDone+'/'+data.totalAll,'изпълнени задачи','#1E2761') +
    reportStatCell(String(data.laggards),'обекта под 50%', data.laggards>0?'#C0392B':'#2F9E5C') +
    reportStatCell(String(data.storeCount),'обекта общо','#1E2761') +
    '</tr></table>';
  body += reportTrendHtml(data.overallPct, data.trendPrevWeek, 'спрямо предходната седмица');
  body += '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin:14px 0 8px;">По обекти за седмицата — изоставащите най-отгоре</div>';
  body += data.rows.map(reportStoreRow).join('');
  /* Решетка не става за седмица - 31 явявания са твърде широки за 600px.
     Затова двата среза стоят поотделно: по обекти (горе) и по задачи
     (тук). Вторият липсваше изцяло, тоест не се виждаше коя задача
     системно не се изпълнява. */
  body += reportByTaskHtml(data, true);
  body += reportTopBottomTable(data.top3, data.bottom3, data.storeCount);
  body += reportPostponedSectionHtml(data.postponedList);
  body += reportCommentsCountHtml(data.commentedList);
  body += reportNoDueNoticeHtml(data.noDueCount, true);
  body += '<div style="margin-top:10px;font-size:11px;color:#94a3b8;font-style:italic;">Забележка: постоянните задачи участват с по едно явяване за всеки ден, в който са дължими през седмицата (задача „всеки ден" = 7 явявания) — точно както се отмятат в Седмичния календар. Отметка от предишна седмица не се брои за текущата.</div>';
  body += buildCrossModuleSectionHtml(data.cross, data.scoped);
  return reportEmailShell('📊 Седмичен репорт — ' + (data.weekLabel||''), reportWeekRangeLabel(data.weekDates), body,
    'Автоматичен репорт · ТеМАХ Портал');
}


Deno.serve(async (req: Request) => {
  try {
    var body: any = {};
    try { body = await req.json(); } catch(e) {}
    var type = body && body.type === 'weekly' ? 'weekly' : 'daily';

    /* Прагът за секцията „Каса" се чете ВЕДНЪЖ на изпълнение и се подава на
       всяко събиране надолу. Иначе същият ключ би се четял по веднъж за всеки
       получател — при включени управители това са 25 излишни заявки на
       сутрин за едно число, което не се мени между писмата.
       Само дневният го ползва; при седмичния остава null и не струва нищо.
       Колекторът приема null като „прочети го сам" — това е пътят на ръчното
       изпращане от портала, където извикването е едно. */
    var kasaThreshold: any = null;
    if (type === 'daily') {
      kasaThreshold = await new Promise(function(resolve){ reportKasaThreshold(resolve); });
    }

    var data: any = await new Promise(function(resolve){
      if (type === 'weekly') collectWeeklyReportData(resolve);
      else collectDailyReportData(resolve, null, kasaThreshold);
    });

    if (!data) {
      return new Response(JSON.stringify({ ok:false, error:'collect_failed', type:type }), { status:500, headers:{'Content-Type':'application/json'} });
    }

    var html = type === 'weekly' ? buildWeeklyReportHtml(data) : buildDailyReportHtml(data);

    var flagFilter = type === 'weekly' ? 'weekly=eq.true' : 'daily=eq.true';
    var recipientsRes: any = await sbGet('report_recipients', 'active=eq.true&' + flagFilter + '&select=email,name,scope_stores');
    var recipients = Array.isArray(recipientsRes) ? recipientsRes : [];
    /* scope_stores: NULL/празен = пълният отчет както досега; непразен масив =
       ЛИЧЕН отчет само за тези обекти, тоест човекът излиза от общото "to" и
       влиза в личния цикъл по-долу. Обхватът важи САМО за дневния — при
       седмичния колоната се пренебрегва и получателят си остава в общото
       писмо, вместо мълчаливо да изпадне и оттам. */
    function recipientScope(r: any): string[] {
      if (type !== 'daily') return [];
      return (Array.isArray(r.scope_stores) ? r.scope_stores : []).filter(Boolean);
    }
    var emails = recipients.filter(function(r: any){ return !recipientScope(r).length; })
                           .map(function(r: any){ return r.email; }).filter(Boolean);

    var subject = type === 'weekly' ? reportWeeklySubject(data.weekDates) : reportDailySubject(data.reportDate);

    /* ── СПИСЪК 1: report_recipients — отчет за ЦЯЛАТА верига ──────────────
       Този път не е пипан: същият html от неразрязания collect, същата тема,
       едно писмо до всички в общо поле "to". */
    var emailOk = false;
    var emailStatus = 0;
    if (emails.length) {
      var emailRes = await fetch(SUPABASE_URL + '/functions/v1/resend-email', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+SERVICE_KEY, 'apikey':SERVICE_KEY },
        body: JSON.stringify({ to: emails, subject: subject, html: html })
      });
      emailOk = emailRes.ok;
      emailStatus = emailRes.status;
    }

    /* ── ЛИЧНИТЕ ОТЧЕТИ: три източника, един цикъл ────────────────────────
       Отделен път, не разширение на първия: обхватът е различен за всеки
       човек и затова "to" е винаги с ЕДИН адрес — иначе всеки би виждал
       чуждите обекти.

       От v18 важи и за СЕДМИЧНИЯ. Изборът КОЙ получава е един и същ за
       двата отчета; различават се само събирачът и строителят на HTML.
       Затова цикълът остава ЕДИН — иначе следващата промяна по правилата
       „кой получава" трябва да се направи на две места и рано или късно се
       прави само на едното.

       Източниците са три и се внасят В ТОЗИ РЕД:
         1. регионалните — users.is_regional, обхват assigned_stores; важи
            и за двата отчета;
         2. получателите с обхват — report_recipients.scope_stores; САМО
            дневният. recipientScope() връща [] при седмичен, тоест тук
            просто няма кого да добави: седмичният е обзорен и получателят
            с обхват го получава ПЪЛЕН, в общото "to";
         3. управителите — users.role='manager', обхват собственият обект,
            зад шалтер в базата. Ключовете са ДВА и независими:
            'daily_report_managers' и 'weekly_report_managers'. Нарочно
            поотделно — 19 писма всяка сутрин и 19 писма в понеделник са две
            различни решения и се вземат поотделно.
       Образецът за 1 и 3 е send-oborot-report: признакът се чете от базата,
       а active и празният имейл се отсяват в кода (active !== false, за да
       не изпадне потребител с NULL), обхватът се приема за масив.

       Дедупликация по имейл с малки букви: един и същ човек може да е и
       регионален, и получател с обхват. Тогава получава ЕДНО писмо с
       обединения обхват, а source остава на източника, който го е внесъл
       ПРЪВ — тоест по реда отгоре.

       ЦЕНАТА: по едно събиране на данни за всеки получател, тоест N+1
       обхождания на базата. Съзнателно — кронът тече веднъж дневно, а
       алтернативата (едно събиране и пресмятане наум за всеки обхват) значи
       да се раздели събирането от агрегацията в код, който се копира на
       ръка в две места. Бяха шест събирания за шестимата регионални; с
       включени управители стават до около 25 на сутрин, и още толкова в
       понеделник за седмичния. Приемливо за нещо, което тече веднъж на ден
       — не рефакторирай събирането заради това. */
    var personalOut: any[] = [];
    var personal: any[] = [];
    var personalSeen: any = {};
    function addPersonal(email: any, name: any, stores: any, source: string) {
      var key = String(email || '').trim().toLowerCase();
      if (!key) return;
      var list = (Array.isArray(stores) ? stores : []).filter(Boolean);
      var cur = personalSeen[key];
      if (cur) {
        list.forEach(function(s: any){ if (cur.stores.indexOf(s) < 0) cur.stores.push(s); });
        if (!cur.name && name) cur.name = name;
        return;
      }
      cur = { email: email, name: name || '', stores: list, source: source };
      personalSeen[key] = cur;
      personal.push(cur);
    }

    /* Източник 1 — регионалните, обхват assigned_stores. И за двата отчета. */
    var regRes: any = await sbGet('users', 'is_regional=eq.true&select=email,display_name,assigned_stores,active');
    (Array.isArray(regRes) ? regRes : []).forEach(function(u: any){
      if (u.active === false || !u.email) return;
      addPersonal(u.email, u.display_name, u.assigned_stores, 'regional');
    });

    /* Източник 2 — получателите с непразен scope_stores. Списъкът вече е
       прочетен по-горе; тези хора са извадени от общото "to". При седмичен
       recipientScope() връща [] и оттук не влиза никой. */
    recipients.forEach(function(r: any){
      var sc = recipientScope(r);
      if (sc.length) addPersonal(r.email, r.name, sc, 'recipient');
    });

    /* Източник 3 — управителите, всеки САМО за своя обект. Липсващ ключ или
       каквато и да е друга стойност освен 'on' = ИЗКЛЮЧЕНО, тоест списъкът
       се пуска и спира от базата, без нов деплой.
       Двете четения са в свой try/catch нарочно: нова функционалност не бива
       да събори писмата на регионалните, ако app_settings или users отговорят
       с грешка. Отказът се вижда в отговора вместо да изяде целия цикъл. */
    var mgrKey = type === 'weekly' ? 'weekly_report_managers' : 'daily_report_managers';
    var managersOn = false;
    try {
      var setRes: any = await sbGet('app_settings', 'key=eq.' + mgrKey + '&select=value&limit=1');
      var setRow = Array.isArray(setRes) ? setRes[0] : null;
      managersOn = !!setRow && String(setRow.value == null ? '' : setRow.value).trim().toLowerCase() === 'on';
    } catch (e) {
      managersOn = false;
    }
    if (managersOn) {
      try {
        var mgrRes: any = await sbGet('users', 'role=eq.manager&select=email,display_name,store_name,active');
        (Array.isArray(mgrRes) ? mgrRes : []).forEach(function(u: any){
          if (u.active === false || !u.email) return;
          addPersonal(u.email, u.display_name, u.store_name ? [u.store_name] : [], 'manager');
        });
      } catch (e) {
        personalOut.push({ email:null, source:'manager', sent:false, reason:'managers_query_failed' });
      }
    }

    for (const u of personal) {
      var mine: string[] = Array.isArray(u.stores) ? u.stores : [];
      /* Празен обхват = НЯМА писмо. Празен отчет е по-лош от липсващ:
         изглежда като „обектите ти нямат нито една задача". */
      if (!mine.length) { personalOut.push({ email:u.email, source:u.source, sent:false, reason:'no_assigned_stores' }); continue; }

      var mineData: any = await new Promise(function(resolve){
        if (type === 'weekly') collectWeeklyReportData(resolve, mine);
        else collectDailyReportData(resolve, mine, kasaThreshold);
      });
      if (!mineData) { personalOut.push({ email:u.email, source:u.source, sent:false, reason:'collect_failed' }); continue; }
      /* Обхватът може да се изпразни и СЛЕД срязването — регионален само със
         склад в assigned_stores, или управител на обект, който не влиза в
         отчета. Пак без писмо. */
      if (!mineData.storeCount) { personalOut.push({ email:u.email, source:u.source, sent:false, reason:'no_reportable_stores' }); continue; }

      var mineRes = await fetch(SUPABASE_URL + '/functions/v1/resend-email', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+SERVICE_KEY, 'apikey':SERVICE_KEY },
        body: JSON.stringify({ to: [u.email], subject: subject,
                               html: type === 'weekly' ? buildWeeklyReportHtml(mineData) : buildDailyReportHtml(mineData) })
      });
      personalOut.push({ email:u.email, source:u.source, stores:mineData.storeCount, sent:mineRes.ok, status:mineRes.status });
    }

    if (!emails.length && !personalOut.length) {
      return new Response(JSON.stringify({ ok:true, sent:false, reason:'no_recipients', type:type }), { status:200, headers:{'Content-Type':'application/json'} });
    }

    return new Response(JSON.stringify({ ok:true, sent:emailOk, email_status:emailStatus, recipients:emails.length, personal:personalOut, type:type }), { status:200, headers:{'Content-Type':'application/json'} });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500, headers:{'Content-Type':'application/json'} });
  }
});
