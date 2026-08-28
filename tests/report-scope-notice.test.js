/* Дневният отчет казва какъв период покрива.

   Симптом (28.08.2026): дневният отчет в 08:00 за 27.08 показа Севлиево в
   зеления списък със 100%, а писмото за просрочени в 08:15 каза, че Севлиево
   не е изпълнило „Зануляване" със срок 26.08. Двете пристигат едно след друго
   и изглеждат противоречиви. И двете са верни — дневният брои САМО задачите
   със срок за деня, който описва, а другото писмо гледа целия бюлетин назад.

   Поправката не пипа броенето (то е коректно), а добавя един приглушен ред,
   който казва обхвата на глас. Тук се заковава:
     1. дневният HTML носи реда, с датата ОТ ДАННИТЕ;
     2. седмичният НЕ го носи — там периодът е ясен от заглавието;
     3. липсва/счупена reportDate → редът остава, но без счупена дата
        (нито „NaN", нито „undefined", нито увиснало „със срок .").

   Тавтологичен контрол за (1): същият търсач се пуска и срещу седмичното
   писмо, където реда го НЯМА — тоест проверката различава. Плюс: датата се
   мени заедно с reportDate (27.08 → 26.08), значи не минава срещу закован
   низ, който би стоял верен и при изтрита логика.

   Пускане:  node tests/report-scope-notice.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

function env() {
  return boot({ modules: ['bulletin.js', 'report.js'], user: ADMIN, data: {} });
}

/* Търсачът е един и същ за всички проверки — за да значи нещо, че някъде
   намира, а другаде не. */
const MARKER = 'покрива само задачите';
const SECOND_LETTER = '08:15';

function dailyData(reportDate) {
  return {
    overallPct: 87, totalDone: 13, totalAll: 15, laggards: 1, storeCount: 2,
    /* Решетката трябва РЕАЛНО да се построи — иначе проверката за реда
       на секциите минава срещу празен низ. */
    items: [{ id: 'i1', kind: 'task', title: 'Зануляване' }],
    rows: [{ name: 'Севлиево', done: 8, total: 8, pct: 100, cells: ['done'] },
           { name: 'Габрово', done: 5, total: 7, pct: 71, cells: ['missed'] }],
    comps: [], noDueCount: 0,
    trendYesterday: null, cross: null, reportDate: reportDate
  };
}

function weeklyData() {
  return {
    overallPct: 50, totalDone: 3, totalAll: 6, laggards: 1, storeCount: 2,
    rows: [{ name: 'Севлиево', done: 2, total: 3, pct: 67 },
           { name: 'Габрово', done: 1, total: 3, pct: 33 }],
    top3: [{ name: 'Севлиево', pct: 67 }], bottom3: [{ name: 'Габрово', pct: 33 }],
    items: [], comps: [], noDueCount: 1,
    postponedList: [], commentedList: [],
    weekLabel: 'Седмица 35 · 2026', weekDates: null, cross: null
  };
}

(async function () {

  section('1. Дневният носи реда, с датата от данните');
  {
    const { w } = env();
    const html = w.buildDailyReportHtml(dailyData('2026-08-27'));

    ok('редът е в дневния отчет', html.indexOf(MARKER) >= 0);
    ok('носи датата на отчета — 27.08',
      html.indexOf('със срок 27.08') >= 0,
      (html.match(/със срок [^.<]*/) || ['(няма)'])[0]);
    ok('сочи другото писмо и часа му',
      html.indexOf(SECOND_LETTER) >= 0 && html.indexOf('изтекъл срок') >= 0);
    ok('датата НЕ е от часовника — 28.08 не се появява',
      html.indexOf('със срок 28.08') < 0);
  }

  section('1б. Датата се мени заедно с данните (не е закован низ)');
  {
    const { w } = env();
    const html = w.buildDailyReportHtml(dailyData('2026-08-26'));
    ok('26.08 → „със срок 26.08"', html.indexOf('със срок 26.08') >= 0);
    ok('и 27.08 вече го няма', html.indexOf('със срок 27.08') < 0);
  }

  section('2. Мястото е след статистиките и тенденцията, преди решетката');
  {
    const { w } = env();
    const data = dailyData('2026-08-27');
    data.trendYesterday = { overall_pct: 80 };
    const html = w.buildDailyReportHtml(data);

    const iTrend = html.indexOf('спрямо предходния ден');
    const iNote = html.indexOf(MARKER);
    const iStores = html.indexOf('Севлиево');
    ok('тенденцията е преди реда', iTrend >= 0 && iTrend < iNote,
      iTrend + ' / ' + iNote);
    ok('редът е преди изброяването по обекти', iNote >= 0 && iNote < iStores,
      iNote + ' / ' + iStores);
  }

  section('3. ТАВТОЛОГИЧЕН КОНТРОЛ: седмичният НЕ носи реда');
  {
    const { w } = env();
    const html = w.buildWeeklyReportHtml(weeklyData());
    /* Ако тези две паднеха заедно с проверката от секция 1, търсачът щеше
       да лови нещо, което го има навсякъде. */
    ok('седмичният няма реда', html.indexOf(MARKER) < 0);
    ok('седмичният не споменава 08:15', html.indexOf(SECOND_LETTER) < 0);
    /* И че писмото изобщо е построено — иначе горните две минават срещу
       празен низ. */
    ok('седмичният все пак е пълноценно писмо',
      html.length > 1000 && html.indexOf('Севлиево') >= 0, String(html.length));
  }

  section('4. Липсваща/счупена дата — редът остава, датата не се чупи');
  {
    const { w } = env();
    [undefined, null, '', 'не-дата'].forEach(function (bad) {
      const label = bad === undefined ? 'undefined' : bad === null ? 'null'
        : bad === '' ? "''" : bad;
      const html = w.buildDailyReportHtml(dailyData(bad));
      const note = (html.match(/ℹ️[^<]*/) || [''])[0];

      ok(label + ': редът пак излиза', note.indexOf(MARKER) >= 0, note);
      ok(label + ': няма NaN', note.indexOf('NaN') < 0, note);
      ok(label + ': няма undefined/null', !/undefined|null/.test(note), note);
      ok(label + ': няма увиснало „със срок ."',
        !/със срок\s*[.,]/.test(note), note);
      ok(label + ': изречението е цяло', /задачите със срок .+\./.test(note), note);
    });
  }

  section('5. Стилът е приглушен, като на бележката за задачите без срок');
  {
    const { w } = env();
    const html = w.reportScopeNoticeHtml('2026-08-27');
    ok('същият фон като reportNoDueNoticeHtml', html.indexOf('background:#FDF3E3') >= 0, html);
    ok('същият цвят на текста', html.indexOf('color:#8A5A12') >= 0, html);
    ok('дребен шрифт, не заглавие', html.indexOf('font-size:12px') >= 0, html);
    ok('няма тревожно червено', html.indexOf('#C0392B') < 0, html);
  }

  report();
})();
