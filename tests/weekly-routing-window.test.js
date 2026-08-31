/* Прозорецът на ЛИЧНИТЕ седмични имейли — collectWeeklyRoutingData().

   Маршрутизацията (report_groups → личен имейл на Жеко/Васка/Меги/Цвети/
   Теодор) носеше и трите дефекта, които общият седмичен отчет вече няма:

     1. избираше последния публикуван бюлетин (created_at.desc&limit=1), а
        той се публикува ПРЕДВАРИТЕЛНО за идващата седмица — всяка картичка
        описваше седмица, която още не е започнала;
     2. разбивката по обекти съвпадаше само по item_id+kind+store_name, без
        никаква дата — обект, отметнал задачата преди месец, излизаше като
        „изпълнил я" тази седмица;
     3. task_completions се теглеха без филтър по дата — всяко отмятане,
        правено някога, влизаше в набора.

   2 и 3 компенсираха 1 и точно затова имейлът изглеждаше правдоподобен:
   грешната седмица дърпаше числата надолу, липсващият прозорец — нагоре.

   Тестът заковава, че маршрутизацията ползва СЪЩИТЕ функции като общия
   отчет (reportPickWeeklyBulletin / reportRecurringWeekDates /
   reportItemMatchesComp), а не свой втори прозорец.

   Пускане:  node tests/weekly-routing-window.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
/* bd.done е масив от { store, comment, photos, files } — картичката показва
   коментарите и прикачените на изпълнилите, не само имената им. */
const doneNames = bd => bd.done.map(d => d.store);
const { boot, ok, section, report, guard, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

const STORES = ['Раднево', 'Габрово', 'Троян'];
const USERS = STORES.map(s => ({ store_name: s }))
  .concat([{ store_name: 'Централен офис' }, { store_name: 'Логистичен склад Добрич' }]);

/* Мини-PostgREST за task_completions: harness-ът връща цялата фикстура
   независимо от филтрите, затова completion_date се прилага тук. Само така
   се проверява РЕЗУЛТАТЪТ, а не само че URL-ът съдържа правилния низ. */
function byCompletionDate(rows) {
  return function (url) {
    const gte = (url.match(/completion_date=gte\.([^&]+)/) || [])[1];
    const lte = (url.match(/completion_date=lte\.([^&]+)/) || [])[1];
    return rows.filter(function (r) {
      if (!gte && !lte) return true;
      if (!r.completion_date) return false;   /* NULL не се отнася към седмица */
      if (gte && r.completion_date < decodeURIComponent(gte)) return false;
      if (lte && r.completion_date > decodeURIComponent(lte)) return false;
      return true;
    });
  };
}

function weekUnderTest(w) {
  const target = w.reportWeekOfMonday(w.reportPrevWeekMonday(new Date()));
  return { target, dates: w.weekDays(target.week, target.year).map(w.toLocalISO) };
}

function env(over) {
  return boot(Object.assign({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: {
      bulletins: [], recurring_tasks: [], bulletin_tasks: [],
      task_completions: [], users: USERS, report_snapshots: []
    }
  }, over || {}));
}

function urlsFor(calls, table) {
  return calls.get.filter(u => u.indexOf('/' + table + '?') >= 0);
}

(async function () {

  section('1. reportRoutedTaskWindow — един прозорец на задача');
  {
    const { w } = env();
    const wkDates = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20',
                     '2026-08-21', '2026-08-22', '2026-08-23'];
    const bul = { week_number: 34, year: 2026 };

    /* Обикновена задача с ЕДИН срок → точна дата. */
    const one = w.reportRoutedTaskWindow(
      { kind: 'regular', due_date: '2026-08-19' }, wkDates, bul);
    ok('един срок → точна дата', one.date === '2026-08-19' && !one.dateFrom,
      JSON.stringify(one));

    /* Няколко срока → диапазонът на седмицата (една картичка на задача,
       не на явяване). */
    const many = w.reportRoutedTaskWindow(
      { kind: 'regular', due_dates: ['2026-08-18', '2026-08-20'] }, wkDates, bul);
    ok('няколко срока → диапазон',
      many.date === null && many.dateFrom === '2026-08-17' && many.dateTo === '2026-08-23',
      JSON.stringify(many));

    /* Без срок → пак диапазонът, не wildcard. */
    const none = w.reportRoutedTaskWindow({ kind: 'regular' }, wkDates, bul);
    ok('без срок → диапазон, не wildcard',
      none.dateFrom === '2026-08-17' && none.dateTo === '2026-08-23',
      JSON.stringify(none));

    /* Постоянна задача — явяванията идват от reportRecurringWeekDates. */
    const recOne = w.reportRoutedTaskWindow(
      { kind: 'recurring', due_weekday: 2 }, wkDates, bul);   /* сряда */
    ok('постоянна с едно явяване → точната дата', recOne.date === '2026-08-19',
      JSON.stringify(recOne));

    const recMany = w.reportRoutedTaskWindow(
      { kind: 'recurring', due_weekdays: [0, 3] }, wkDates, bul);
    ok('постоянна с две явявания → диапазон',
      recMany.date === null && recMany.dateFrom === '2026-08-17',
      JSON.stringify(recMany));

    /* ЯДРОТО на трета точка: постоянна задача, която НЕ е дължима тази
       седмица, изобщо не влиза. */
    ok('постоянна без явяване тази седмица → null (отпада)',
      w.reportRoutedTaskWindow(
        { kind: 'recurring', due_weekday: null, due_time: null }, wkDates, bul) === null);

    /* Без бюлетин старото поведение се пази — иначе имейлът остава празен. */
    const noBul = w.reportRoutedTaskWindow({ kind: 'recurring', due_weekday: 1 }, null, null);
    ok('без бюлетин → wildcard, не null',
      noBul && noBul.date === null && !noBul.dateFrom, JSON.stringify(noBul));
  }

  section('2. ЯДРОТО: избира се бюлетинът на ПРИКЛЮЧИЛАТА седмица');
  {
    const probe = env();
    const wk = weekUnderTest(probe.w);
    probe.close();

    /* Бюлетинът за ИДВАЩАТА седмица е публикуван последен — точно той
       се избираше преди. */
    const next = wk.target.week + 1;
    const h = env({
      data: {
        bulletins: [
          { id: 'b-next', week_number: next, year: wk.target.year, status: 'published',
            created_at: '2099-01-01T00:00:00Z' },
          { id: 'b-cur', week_number: wk.target.week, year: wk.target.year, status: 'published',
            created_at: '2000-01-01T00:00:00Z' }
        ],
        bulletin_tasks: [
          { id: 't-1', bulletin_id: 'b-cur', title: 'Инвентаризация',
            report_groups: ['owner'], target_stores: null, due_date: wk.dates[2] }
        ],
        recurring_tasks: [], task_completions: [], users: USERS
      }
    });

    let data = null;
    h.w.collectWeeklyRoutingData(function (d) { data = d; });
    await ticks();

    if (ok('маршрутизацията връща данни', !!data)) {
      ok('избран е бюлетинът на приключилата седмица, не най-новият',
        data.bul && data.bul.id === 'b-cur', data.bul && data.bul.id);
      ok('шапката носи седмицата',
        data.weekLabel === 'Седмица ' + wk.target.week + ' · ' + wk.target.year,
        data.weekLabel);
      /* Задачите се теглят от ИЗБРАНИЯ бюлетин. */
      ok('bulletin_tasks се искат за b-cur',
        urlsFor(h.calls, 'bulletin_tasks').join(' ').indexOf('bulletin_id=eq.b-cur') >= 0,
        urlsFor(h.calls, 'bulletin_tasks').join(' '));
      ok('и НЕ за b-next',
        urlsFor(h.calls, 'bulletin_tasks').join(' ').indexOf('b-next') < 0);
      ok('заявката за бюлетини вече не е limit=1',
        urlsFor(h.calls, 'bulletins').join(' ').indexOf('limit=1') < 0,
        urlsFor(h.calls, 'bulletins').join(' '));
      ok('складовете не влизат в обхвата', data.stores.length === 3,
        data.stores.join(', '));
    }
    h.close();
  }

  section('3. Заявките за отмятания носят прозорец по дата');
  {
    const probe = env();
    const wk = weekUnderTest(probe.w);
    probe.close();

    const h = env({
      data: {
        bulletins: [{ id: 'b-1', week_number: wk.target.week, year: wk.target.year,
                      status: 'published' }],
        bulletin_tasks: [
          { id: 't-1', bulletin_id: 'b-1', title: 'Инвентаризация',
            report_groups: ['owner'], due_date: wk.dates[2] }
        ],
        recurring_tasks: [
          { id: 'r-1', active: true, title: 'Каса', report_groups: ['co'], due_weekday: 1 },
          /* Не е дължима тази седмица — не бива да се появи изобщо. */
          { id: 'r-2', active: true, title: 'Без срок', report_groups: ['co'],
            due_weekday: null, due_time: null }
        ],
        task_completions: [], users: USERS
      }
    });
    let data = null;
    h.w.collectWeeklyRoutingData(function (d) { data = d; });
    await ticks();

    const compUrls = urlsFor(h.calls, 'task_completions');
    ok('има две заявки за отмятания (обикновени + постоянни)',
      compUrls.length === 2, String(compUrls.length));
    const missing = compUrls.filter(u =>
      u.indexOf('completion_date=gte.' + wk.dates[0]) < 0 ||
      u.indexOf('completion_date=lte.' + wk.dates[6]) < 0);
    ok('и двете носят прозореца на седмицата', missing.length === 0,
      missing.join(' | '));

    if (ok('данните се събират', !!data)) {
      const ids = data.tasks.map(t => t.id).sort();
      ok('r-2 не влиза в набора (няма явяване тази седмица)',
        ids.indexOf('r-2') < 0, ids.join(', '));
      ok('t-1 и r-1 влизат', ids.join(',') === 'r-1,t-1', ids.join(','));
      /* И заявката не тегли отмятания за r-2. */
      ok('r-2 не се иска и от базата',
        compUrls.join(' ').indexOf('r-2') < 0, compUrls.join(' '));
    }
    h.close();
  }

  section('4. ЯДРОТО: старо отмятане вече не се брои за изпълнено');
  {
    const probe = env();
    const wk = weekUnderTest(probe.w);
    probe.close();

    /* Задачата е с ТОЧЕН срок — сряда (wk.dates[2]). Раднево е отметнало
       на срока, Габрово — преди месец, Троян е отложил на срока. */
    const old = '2026-01-15';
    const COMPS = [
      { task_id: 't-1', store_name: 'Раднево', status: 'done', comment: '',
        completion_date: wk.dates[2] },
      { task_id: 't-1', store_name: 'Габрово', status: 'done', comment: '',
        completion_date: old },
      { task_id: 't-1', store_name: 'Троян', status: 'postponed', comment: 'няма стока',
        completion_date: wk.dates[2] }
    ];

    const h = env({
      data: {
        bulletins: [{ id: 'b-1', week_number: wk.target.week, year: wk.target.year,
                      status: 'published' }],
        bulletin_tasks: [
          { id: 't-1', bulletin_id: 'b-1', title: 'Инвентаризация',
            report_groups: ['owner'], target_stores: null, due_date: wk.dates[2] }
        ],
        recurring_tasks: [],
        task_completions: byCompletionDate(COMPS),
        users: USERS
      }
    });
    let data = null;
    h.w.collectWeeklyRoutingData(function (d) { data = d; });
    await ticks();

    if (ok('данните се събират', !!(data && data.tasks.length))) {
      const bd = h.w.taskStoreBreakdown(data.tasks[0], data.comps, data.stores);
      ok('изпълнил е само Раднево',
        bd.done.length === 1 && bd.done[0].store === 'Раднево', doneNames(bd).join(', '));
      ok('Габрово (отметка от януари) е в „чакащи", не в „изпълнили"',
        bd.pending.indexOf('Габрово') >= 0 && doneNames(bd).indexOf('Габрово') < 0,
        'done=' + doneNames(bd).join(',') + ' pending=' + bd.pending.join(','));
      ok('Троян е отложил, с коментара си',
        bd.postponed.length === 1 && bd.postponed[0].store === 'Троян' &&
        bd.postponed[0].comment === 'няма стока', JSON.stringify(bd.postponed));
      ok('обхватът е трите обекта', bd.scope.length === 3, bd.scope.join(', '));

      /* Картичката, която реално отива в имейла. */
      const card = h.w.personalizedTaskCardHtml(data.tasks[0], data.comps, data.stores);
      ok('картичката казва 1 от 3, не 2 от 3',
        card.indexOf('1 от 3 обекта изпълнили') >= 0, card);

      /* Задача с ТОЧЕН срок мери точно него, не цялата седмица. Отмятане
         в друг ден от същата седмица не съвпада — същото, което прави и
         процентът в общия отчет. */
      const otherDay = [{ item_id: 't-1', kind: 'regular', store_name: 'Раднево',
                          status: 'done', comment: '', completion_date: wk.dates[4] }];
      const bd2 = h.w.taskStoreBreakdown(data.tasks[0], otherDay, ['Раднево']);
      ok('отмятане в друг ден от седмицата не покрива точен срок',
        bd2.pending.join(',') === 'Раднево',
        'done=' + doneNames(bd2).join(',') + ' pending=' + bd2.pending.join(','));
    }
    h.close();
  }

  section('5. Диапазон: „изпълнено" бие „отложено" за същия обект');
  {
    const { w } = env();
    /* Задача за седмицата като цяло — обект, който е отложил във вторник и
       изпълнил в четвъртък, е ИЗПЪЛНИЛ. Преди резултатът зависеше от реда,
       в който PostgREST е върнал редовете. */
    const task = { id: 't-9', kind: 'regular', title: 'Ревизия', target_stores: null,
                   date: null, dateFrom: '2026-08-17', dateTo: '2026-08-23' };
    const comps = [
      { item_id: 't-9', kind: 'regular', store_name: 'Раднево', status: 'postponed',
        comment: 'утре', completion_date: '2026-08-18' },
      { item_id: 't-9', kind: 'regular', store_name: 'Раднево', status: 'done',
        comment: '', completion_date: '2026-08-20' }
    ];
    const bd = w.taskStoreBreakdown(task, comps, ['Раднево']);
    ok('обектът излиза изпълнил', doneNames(bd).join(',') === 'Раднево',
      'done=' + doneNames(bd).join(',') + ' postponed=' + JSON.stringify(bd.postponed));
    ok('и не се дублира в отложените', bd.postponed.length === 0);

    /* Обърнат ред на същите редове дава същия резултат. */
    const bd2 = w.taskStoreBreakdown(task, comps.slice().reverse(), ['Раднево']);
    ok('редът на редовете не променя резултата',
      JSON.stringify(doneNames(bd2)) === JSON.stringify(doneNames(bd)),
      JSON.stringify(doneNames(bd2)));

    /* Отмятане ИЗВЪН диапазона не се брои дори да е 'done'. */
    const outside = [{ item_id: 't-9', kind: 'regular', store_name: 'Раднево',
                       status: 'done', comment: '', completion_date: '2026-08-10' }];
    ok('отметка от предната седмица не влиза',
      w.taskStoreBreakdown(task, outside, ['Раднево']).pending.join(',') === 'Раднево');

    /* Отмятане без дата също не може да се отнесе към седмица. */
    const noDate = [{ item_id: 't-9', kind: 'regular', store_name: 'Раднево',
                      status: 'done', comment: '', completion_date: null }];
    ok('отметка без дата не влиза в диапазон',
      w.taskStoreBreakdown(task, noDate, ['Раднево']).pending.join(',') === 'Раднево');
  }

  section('6. Ползват се СЪЩИТЕ функции, не втори прозорец');
  {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'report.js'), 'utf8');
    const fn = (src.match(/function collectWeeklyRoutingData\([\s\S]*?\n}/) || [''])[0];

    ok('избира бюлетина през reportPickWeeklyBulletin',
      fn.indexOf('reportPickWeeklyBulletin') >= 0);
    ok('и целевата седмица през reportPrevWeekMonday/reportWeekOfMonday',
      fn.indexOf('reportPrevWeekMonday') >= 0 && fn.indexOf('reportWeekOfMonday') >= 0);
    ok('вече не тегли последния бюлетин с created_at.desc&limit=1',
      fn.indexOf('created_at.desc&limit=1') < 0);
    ok('разгъва седмицата през weekDays, не със своя сметка',
      fn.indexOf('weekDays(') >= 0);
    ok('taskStoreBreakdown минава през reportItemMatchesComp',
      /function taskStoreBreakdown[\s\S]*?reportItemMatchesComp/.test(src));
    ok('и вече не сравнява само item_id+kind+store_name',
      !/function taskStoreBreakdown[\s\S]*?x\.item_id===task\.id && x\.kind===taskKind/.test(src));

    /* Общият отчет не е пипан — двата колектора четат едни и същи помощници. */
    const wk = (src.match(/function collectWeeklyReportData\([\s\S]*?\n}/) || [''])[0];
    ok('общият отчет продължава да ползва същите функции',
      wk.indexOf('reportPickWeeklyBulletin') >= 0 && wk.indexOf('weekDays(') >= 0);
  }

  section('7. Празни/липсващи данни не чупят маршрутизацията');
  {
    /* Няма публикуван бюлетин изобщо. */
    const h = env();
    let data = null;
    h.w.collectWeeklyRoutingData(function (d) { data = d; });
    await ticks();
    if (ok('без бюлетин пак се връща обект, не null', !!data)) {
      ok('няма задачи', data.tasks.length === 0, String(data.tasks.length));
      ok('шапката го казва', data.weekLabel === 'Няма публикуван бюлетин', data.weekLabel);
    }
    h.close();

    /* Задача без нито едно отмятане. */
    const probe = env(); const wk = weekUnderTest(probe.w); probe.close();
    const h2 = env({
      data: {
        bulletins: [{ id: 'b-1', week_number: wk.target.week, year: wk.target.year,
                      status: 'published' }],
        bulletin_tasks: [{ id: 't-1', bulletin_id: 'b-1', title: 'Х',
                           report_groups: ['owner'], due_date: wk.dates[1] }],
        recurring_tasks: [], task_completions: [], users: USERS
      }
    });
    let d2 = null;
    h2.w.collectWeeklyRoutingData(function (d) { d2 = d; });
    await ticks();
    if (ok('събира се', !!(d2 && d2.tasks.length))) {
      let card = '';
      if (guard('картичката се рендира без отмятания', function () {
        card = h2.w.personalizedTaskCardHtml(d2.tasks[0], d2.comps, d2.stores);
      })) {
        ok('и показва 0 от 3', card.indexOf('0 от 3 обекта изпълнили') >= 0, card);
      }
      ok('празният личен списък дава съобщение, не празнина',
        h2.w.personalizedSectionHtml([], d2.comps, d2.stores).indexOf('Няма задачи') >= 0);
    }
    h2.close();
  }

  report();
})();
