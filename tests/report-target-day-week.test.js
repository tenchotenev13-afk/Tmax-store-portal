/* Отчетите в 21:00: дневният описва ДНЕШНИЯ ден, седмичният — ТЕКУЩАТА
   седмица (излиза в неделя 21:00).

   До 13.09.2026 кронът беше 08:00 и затова reportDailyTargetDate връщаше
   днес−1, а седмичният минаваше през reportPrevWeekMonday (понеделник−7).
   В 21:00 текущият ден и в неделя текущата седмица вече са приключили.

     a) reportDailyTargetDate(13.09 21:00)            → 13.09
     b) reportTargetWeekMonday(неделя 13.09 21:00)     → понеделник 07.09
     c) reportTargetWeekMonday(понеделник 14.09 08:00) → 14.09
     d) тенденцията при отчетен ден 13.09 чете snapshot-а за 12.09, а
        записва за 13.09 — мерено през истинския колектор със замразен
        часовник, не през преписана формула
     e) reportWeekOfMonday(reportTargetWeekMonday(13.09)) → седмица 37 · 2026

   Личният седмичен (collectWeeklyRoutingData / send-routed-report) остава
   на ПРЕДХОДНАТА седмица — заковано в секция 3.

   Пускане:  node tests/report-target-day-week.test.js .
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
      users: [], bulletins: [], recurring_tasks: [], recurring_task_periods: [],
      recurring_task_skips: [], bulletin_tasks: [], task_completions: [],
      report_snapshots: [], kasa_reports: [], kasa_zoborot: [], app_settings: []
    }, data || {})
  });
}

/* new Date() без аргументи връща FROZEN; с аргументи — истинският конструктор.
   Файловете са заредени с w.eval() и виждат w.Date. */
function freezeDate(w, frozen) {
  const RealDate = w.Date;
  const fixedMs = new RealDate(frozen).getTime();
  function FakeDate(a, b, c, d, e, f, g) {
    switch (arguments.length) {
      case 0: return new RealDate(fixedMs);
      case 1: return new RealDate(a);
      case 2: return new RealDate(a, b);
      case 3: return new RealDate(a, b, c);
      case 4: return new RealDate(a, b, c, d);
      case 5: return new RealDate(a, b, c, d, e);
      case 6: return new RealDate(a, b, c, d, e, f);
      default: return new RealDate(a, b, c, d, e, f, g);
    }
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => fixedMs;
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  w.Date = FakeDate;
}

(async function () {

  section('a) reportDailyTargetDate връща самия ден');
  {
    const { w } = env();
    const iso = d => w.toLocalISO(d);
    ok('13.09.2026 21:00 → 2026-09-13',
      iso(w.reportDailyTargetDate(new Date(2026, 8, 13, 21, 0))) === '2026-09-13',
      iso(w.reportDailyTargetDate(new Date(2026, 8, 13, 21, 0))));
    const early = iso(w.reportDailyTargetDate(new Date(2026, 8, 13, 0, 5)));
    const late = iso(w.reportDailyTargetDate(new Date(2026, 8, 13, 23, 55)));
    ok('часът не влияе: 00:05 и 23:55 дават 13.09', early === '2026-09-13' && late === '2026-09-13',
      early + ' / ' + late);
    const d = w.reportDailyTargetDate(new Date(2026, 8, 13, 21, 0));
    ok('връща полунощ локално', d.getHours() === 0 && d.getMinutes() === 0,
      d.getHours() + ':' + d.getMinutes());
  }

  section('b) + c) + e) reportTargetWeekMonday — текущата седмица');
  {
    const { w } = env();
    const iso = d => w.toLocalISO(d);
    ok('старото име в общия отчет го няма — reportTargetWeekMonday е функция',
      typeof w.reportTargetWeekMonday === 'function');

    ok('b) неделя 13.09.2026 21:00 → понеделник 07.09',
      iso(w.reportTargetWeekMonday(new Date(2026, 8, 13, 21, 0))) === '2026-09-07',
      iso(w.reportTargetWeekMonday(new Date(2026, 8, 13, 21, 0))));
    ok('c) понеделник 14.09.2026 08:00 → 14.09',
      iso(w.reportTargetWeekMonday(new Date(2026, 8, 14, 8, 0))) === '2026-09-14',
      iso(w.reportTargetWeekMonday(new Date(2026, 8, 14, 8, 0))));

    const bad = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
                 '2026-09-11', '2026-09-12', '2026-09-13']
      .filter(d => iso(w.reportTargetWeekMonday(new Date(d + 'T21:00:00'))) !== '2026-09-07');
    ok('всичките 7 дни от седмица 37 сочат към 07.09', bad.length === 0, bad.join(', '));

    ok('e) reportWeekOfMonday(reportTargetWeekMonday(13.09)) → {week:37, year:2026}',
      JSON.stringify(w.reportWeekOfMonday(w.reportTargetWeekMonday(new Date(2026, 8, 13, 21, 0)))) ===
        '{"week":37,"year":2026}',
      JSON.stringify(w.reportWeekOfMonday(w.reportTargetWeekMonday(new Date(2026, 8, 13, 21, 0)))));
  }

  section('d) тенденцията чете ВЧЕРАШНИЯ snapshot, записва днешния');
  {
    const h = env({
      users: [{ store_name: 'Враца' }],
      /* неделя = idx 6, за да има какво да се брои в отчетния ден */
      recurring_tasks: [{ id: 'r-1', active: true, due_weekdays: [6], title: 'Неделна' }],
      /* Празно: стъбът връща цялата таблица независимо от филтъра, тоест засят
         ред би се намерил и за 13.09 и записът щеше да е PATCH, не POST. */
      report_snapshots: []
    });
    freezeDate(h.w, '2026-09-13T21:00:00');

    let summary = null;
    h.w.collectDailyReportData(function (d) { summary = d; }, null, 10);
    await ticks();
    await ticks();

    if (ok('колекторът връща обобщение', !!summary)) {
      ok('отчетният ден е 13.09', summary.reportDate === '2026-09-13', String(summary.reportDate));
    }
    const snapGets = h.calls.get.filter(u => u.indexOf('report_snapshots') >= 0);
    ok('prevISO: snapshot-ът се чете за 2026-09-12',
      snapGets.some(u => u.indexOf('period_key=eq.2026-09-12') >= 0), snapGets.join(' | '));
    ok('и НЕ се чете тенденция за самия ден 13.09 (единственият GET за 13.09 е проверката при запис)',
      snapGets.filter(u => u.indexOf('period_key=eq.2026-09-13') >= 0).length <= 1,
      snapGets.join(' | '));
    const posts = h.calls.post.filter(p => JSON.stringify(p).indexOf('report_snapshots') >= 0);
    ok('snapshot-ът се ЗАПИСВА с ключ 2026-09-13',
      posts.some(p => JSON.stringify(p).indexOf('"period_key":"2026-09-13"') >= 0),
      JSON.stringify(posts));
    h.close();
  }

  section('3. Личният седмичен остава на ПРЕДХОДНАТА седмица');
  {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'report.js'), 'utf8');
    const routing = (src.match(/function collectWeeklyRoutingData\([\s\S]*?\n}/) || [''])[0];
    const weekly = (src.match(/function collectWeeklyReportData\([\s\S]*?\n}/) || [''])[0];
    ok('collectWeeklyRoutingData още минава през reportPrevWeekMonday',
      routing.indexOf('reportWeekOfMonday(reportPrevWeekMonday(new Date()))') >= 0);
    ok('collectWeeklyReportData минава през reportTargetWeekMonday',
      weekly.indexOf('reportWeekOfMonday(reportTargetWeekMonday(new Date()))') >= 0 &&
      weekly.indexOf('reportPrevWeekMonday') < 0);
    const { w } = env();
    ok('reportPrevWeekMonday(неделя 13.09) още дава 31.08',
      w.toLocalISO(w.reportPrevWeekMonday(new Date(2026, 8, 13, 21, 0))) === '2026-08-31',
      w.toLocalISO(w.reportPrevWeekMonday(new Date(2026, 8, 13, 21, 0))));
  }

  report();
})();
