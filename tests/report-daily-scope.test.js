/* Обхватът на ДНЕВНИЯ отчет — кои отмятания и кой бюлетин влизат в него.

   Две неща, пропуснати при преместването на отчета към приключилия ден:

   1. Отмятане без completion_date се броеше за изпълнено. Условието беше
      `!c.completion_date || c.completion_date===dayISO`, тоест старите
      записи без дата (184 в базата, всичките отпреди полето да се пълни)
      минаваха за изпълнени ВСЕКИ ден завинаги. За неделя 23.08 от 21
      „изпълнени" в писмото 15 бяха реални и 6 фантоми — 39% вместо
      верните 28%. Седмичният ги изключва нарочно още от v3, с мотива че
      не могат да бъдат отнесени към коя да е седмица; за ден важи същото,
      само по-остро.

   2. Дневният вземаше ПОСЛЕДНИЯ публикуван бюлетин
      (`order=created_at.desc&limit=1`). Бюлетините се публикуват
      предварително: в понеделник 24.08 най-новият е за седмица 35
      (24–30.08), а отчетът описва 23.08 — ден от седмица 34. Значи
      задачите на грешната седмица влизаха в набора, а тези на вярната
      липсваха.

   Пускане:  node tests/report-daily-scope.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

function env(data) {
  return boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: Object.assign({
      users: [], bulletins: [], recurring_tasks: [], bulletin_tasks: [],
      task_completions: [], report_snapshots: []
    }, data || {})
  });
}

(async function () {

  section('1. ЯДРОТО: коя седмица избира дневният (случаят 23.08)');
  {
    const { w } = env();
    const d = new Date(2026, 7, 23);   /* неделя */

    ok('понеделникът на седмицата на 23.08 е 17.08',
      w.toLocalISO(w.reportMondayOfWeek(d)) === '2026-08-17',
      w.toLocalISO(w.reportMondayOfWeek(d)));

    const target = w.reportWeekOfMonday(w.reportMondayOfWeek(d));
    ok('23.08.2026 е ден от седмица 34',
      target && target.week === 34 && target.year === 2026,
      JSON.stringify(target));

    /* И двата бюлетина са публикувани — точно ситуацията в понеделник
       сутрин, когато 35 вече е качен, а отчетът описва ден от 34. */
    const bulletins = [
      { id: 'b35', year: 2026, week_number: 35, status: 'published' },
      { id: 'b34', year: 2026, week_number: 34, status: 'published' }
    ];
    const pick = w.reportPickWeeklyBulletin(bulletins, target);
    ok('избира се бюлетинът на седмица 34, не 35',
      pick && pick.id === 'b34', pick ? pick.id : 'null');
    /* Старият избор беше просто „първият в списъка" — тоест 35. */
    ok('старият избор би дал 35', bulletins[0].week_number === 35);

    /* Понеделникът на предходната седмица (седмичният отчет) не се е
       променил от изнасянето на общия помощник. */
    ok('reportPrevWeekMonday още дава предходната седмица',
      w.toLocalISO(w.reportPrevWeekMonday(new Date(2026, 7, 24))) === '2026-08-17',
      w.toLocalISO(w.reportPrevWeekMonday(new Date(2026, 7, 24))));
  }

  section('2. ЯДРОТО: колекторът тегли задачите на ОТЧЕТНАТА седмица');
  {
    const probe = env();
    const reportDay = probe.w.reportDailyTargetDate(new Date());
    const dayISO = probe.w.toLocalISO(reportDay);
    const target = probe.w.reportWeekOfMonday(probe.w.reportMondayOfWeek(reportDay));

    /* Двата бюлетина, подредени както ги връща заявката: най-новият пръв. */
    const bulletins = [
      { id: 'b-next', year: target.year, week_number: target.week + 1, status: 'published' },
      { id: 'b-now', year: target.year, week_number: target.week, status: 'published' }
    ];
    /* Стъбът СПАЗВА филтъра по bulletin_id — иначе тестът не може да
       различи кой бюлетин е избран и би минавал и с двата. */
    const tasksByUrl = function (url) {
      if (String(url).indexOf('b-now') >= 0) {
        return [{ id: 't-now', bulletin_id: 'b-now', title: 'ЗАДАЧА ОТ ОТЧЕТНАТА СЕДМИЦА', due_date: dayISO }];
      }
      if (String(url).indexOf('b-next') >= 0) {
        return [{ id: 't-next', bulletin_id: 'b-next', title: 'ЗАДАЧА ОТ СЛЕДВАЩАТА СЕДМИЦА', due_date: dayISO }];
      }
      return [];
    };

    const h = env({
      users: [{ store_name: 'Враца' }],
      bulletins: bulletins,
      bulletin_tasks: tasksByUrl,
      recurring_tasks: [],
      task_completions: []
    });

    let daily = null;
    h.w.collectDailyReportData(function (d) { daily = d; });
    await ticks();

    if (ok('колекторът връща обобщение', !!daily)) {
      const titles = (daily.items || []).map(function (i) { return i.title; });
      ok('влиза задачата от отчетната седмица',
        titles.indexOf('ЗАДАЧА ОТ ОТЧЕТНАТА СЕДМИЦА') >= 0, titles.join(' | '));
      ok('НЕ влиза задачата от следващата седмица',
        titles.indexOf('ЗАДАЧА ОТ СЛЕДВАЩАТА СЕДМИЦА') < 0, titles.join(' | '));
    }
  }

  section('3. ЯДРОТО: отмятане без completion_date не се брои');
  {
    const probe = env();
    const reportDay = probe.w.reportDailyTargetDate(new Date());
    const dayISO = probe.w.toLocalISO(reportDay);
    const dayIdx = probe.w.reportWeekdayIdx(reportDay);

    const h = env({
      users: [{ store_name: 'Враца' }, { store_name: 'Троян' }],
      bulletins: [],
      recurring_tasks: [
        { id: 'r-1', active: true, due_weekdays: [dayIdx], title: 'Каса — отчет' }
      ],
      task_completions: [
        /* Реално отмятане за отчетния ден. */
        { recurring_task_id: 'r-1', store_name: 'Враца', status: 'done',
          comment: '', photos: [], completion_date: dayISO },
        /* Стар запис без дата — точно фантомът от писмото за 23.08. */
        { recurring_task_id: 'r-1', store_name: 'Троян', status: 'done',
          comment: '', photos: [], completion_date: null }
      ]
    });

    let daily = null;
    h.w.collectDailyReportData(function (d) { daily = d; });
    await ticks();

    if (ok('колекторът връща обобщение', !!daily)) {
      ok('брои се само реалното отмятане: 1 от 2',
        daily.totalDone === 1 && daily.totalAll === 2,
        daily.totalDone + '/' + daily.totalAll);

      const vraca = daily.rows.filter(function (r) { return r.name === 'Враца'; })[0];
      const troyan = daily.rows.filter(function (r) { return r.name === 'Троян'; })[0];
      ok('Враца е на 100%', vraca && vraca.pct === 100,
        vraca ? String(vraca.pct) : 'липсва');
      ok('Троян е на 0% — записът без дата не го спасява',
        troyan && troyan.pct === 0, troyan ? String(troyan.pct) : 'липсва');
      ok('и в решетката Троян е с пропуск, не с ✓',
        troyan && troyan.cells.join(',') === 'missing',
        troyan ? troyan.cells.join(',') : 'липсва');
    }
  }

  section('4. Отмятане от ДРУГ ден също не се брои');
  {
    const probe = env();
    const reportDay = probe.w.reportDailyTargetDate(new Date());
    const dayIdx = probe.w.reportWeekdayIdx(reportDay);
    /* Ден преди отчетния — реална дата, но не тази на отчета. */
    const other = probe.w.toLocalISO(probe.w.reportDailyTargetDate(reportDay));

    const h = env({
      users: [{ store_name: 'Враца' }],
      bulletins: [],
      recurring_tasks: [
        { id: 'r-1', active: true, due_weekdays: [dayIdx], title: 'Каса — отчет' }
      ],
      task_completions: [
        { recurring_task_id: 'r-1', store_name: 'Враца', status: 'done',
          comment: '', photos: [], completion_date: other }
      ]
    });

    let daily = null;
    h.w.collectDailyReportData(function (d) { daily = d; });
    await ticks();

    if (ok('колекторът връща обобщение', !!daily)) {
      ok('вчерашното спрямо отчета отмятане не се брои',
        daily.totalDone === 0, String(daily.totalDone));
    }
  }

  report();
})();
