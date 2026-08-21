/* Две дребни в общия отчет — reportTopBottomTable() и бележката за
   постоянните задачи без срок.

   1. „🏆 ТОП 3" / „⚠️ ИЗИСКВАТ ВНИМАНИЕ" се рендираха винаги. При еднакъв
      процент за всички обекти двете кутии показват едни и същи числа: три
      случайни обекта излизат похвалени, други три — посочени, без нищо да
      ги отличава. Точно това идваше всеки понеделник, докато седмичният
      прозорец беше сбъркан и всички стояха на 0%.

   2. „1 постоянни задачи без конкретен срок чакат преглед … виж ги" —
      числото управлява прилагателното, съществителното, глагола И
      местоимението, тоест едно изречение сгрешено на четири места.

   Пускане:  node tests/report-ranking-plural.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

function env() {
  return boot({ modules: ['bulletin.js', 'report.js'], user: ADMIN, data: {} });
}

/* Пълен набор данни за буилдърите — само процентите се менят. */
function data(rows, over) {
  const byPct = rows.slice().sort((a, b) => b.pct - a.pct);
  return Object.assign({
    overallPct: 50, totalDone: 3, totalAll: 6,
    laggards: rows.filter(r => r.pct < 50).length, storeCount: rows.length,
    rows: rows.slice().sort((a, b) => a.pct - b.pct),
    top3: byPct.slice(0, 3), bottom3: byPct.slice(-3).reverse(),
    noDueCount: 0, postponedList: [], commentedList: [],
    weekLabel: 'Седмица 34 · 2026', cross: null
  }, over || {});
}
const st = (name, pct) => ({ name, done: pct ? 1 : 0, total: 1, pct });

(async function () {

  section('1. ЯДРОТО: еднакви проценти → няма класация');
  {
    const { w } = env();

    /* Осемнайсет обекта, всички на 0% — понеделнишкият случай. */
    const allZero = ['Враца', 'Габрово', 'Добрич', 'Дупница', 'Карлово',
                     'Козлодуй', 'Кърджали', 'Монтана', 'Петрич', 'Пирдоп',
                     'Раднево', 'Севлиево', 'Силистра', 'Сливен', 'Троян',
                     'Търговище', 'Шумен', 'Ямбол'].map(n => st(n, 0));
    const d0 = data(allZero);
    ok('всички на 0% → празен низ',
      w.reportTopBottomTable(d0.top3, d0.bottom3) === '',
      w.reportTopBottomTable(d0.top3, d0.bottom3).slice(0, 120));

    /* Същото и когато всички са на 100% — „ТОП 3" пак не значи нищо. */
    const d100 = data(allZero.map(s => st(s.name, 100)));
    ok('всички на 100% → празен низ',
      w.reportTopBottomTable(d100.top3, d100.bottom3) === '');

    /* И при друга обща стойност. */
    const d67 = data(allZero.map(s => st(s.name, 67)));
    ok('всички на 67% → празен низ',
      w.reportTopBottomTable(d67.top3, d67.bottom3) === '');
  }

  section('2. Има ли разлика — класацията си остава');
  {
    const { w } = env();
    const mixed = data([st('Раднево', 100), st('Габрово', 80), st('Троян', 40),
                        st('Сливен', 0)]);
    const html = w.reportTopBottomTable(mixed.top3, mixed.bottom3);
    ok('рендира се', html.length > 0);
    ok('носи ТОП 3', html.indexOf('ТОП 3') >= 0);
    ok('носи ИЗИСКВАТ ВНИМАНИЕ', html.indexOf('ИЗИСКВАТ ВНИМАНИЕ') >= 0);
    ok('най-добрият е първи в лявата кутия',
      html.indexOf('1. Раднево') >= 0, html.slice(0, 400));
    ok('най-слабият е първи в дясната',
      html.indexOf('1. Сливен') >= 0, html.slice(-500));

    /* Дори минимална разлика е разлика. */
    const tiny = data([st('А', 1), st('Б', 0), st('В', 0), st('Г', 0)]);
    ok('разлика от 1% е достатъчна',
      w.reportTopBottomTable(tiny.top3, tiny.bottom3).length > 0);
  }

  section('3. Гранични случаи на класацията');
  {
    const { w } = env();
    ok('празни списъци → празен низ', w.reportTopBottomTable([], []) === '');
    ok('null не хвърля и дава празен низ', w.reportTopBottomTable(null, null) === '');
    ok('undefined също', w.reportTopBottomTable(undefined, undefined) === '');

    /* Един обект не е класация — сам на себе си е и най-добър, и най-слаб. */
    const one = data([st('Раднево', 73)]);
    ok('един обект → празен низ',
      w.reportTopBottomTable(one.top3, one.bottom3) === '');

    ok('reportRankingIsMeaningful е достъпна отделно',
      typeof w.reportRankingIsMeaningful === 'function');
    ok('и връща false при равенство',
      w.reportRankingIsMeaningful([{ pct: 0 }], [{ pct: 0 }]) === false);
    ok('и true при разлика',
      w.reportRankingIsMeaningful([{ pct: 100 }], [{ pct: 0 }]) === true);
  }

  section('4. Дневният и седмичният имейл наистина я скриват');
  {
    const { w } = env();
    const flat = data(['Раднево', 'Габрово', 'Троян'].map(n => st(n, 0)),
      { overallPct: 0, totalDone: 0, totalAll: 3 });

    const weekly = w.buildWeeklyReportHtml(flat);
    ok('седмичният няма ТОП 3', weekly.indexOf('ТОП 3') < 0);
    ok('седмичният няма ИЗИСКВАТ ВНИМАНИЕ', weekly.indexOf('ИЗИСКВАТ ВНИМАНИЕ') < 0);
    /* Останалото писмо е непокътнато. */
    ok('но обектите си остават', weekly.indexOf('Раднево') >= 0);
    ok('и шапката също', weekly.indexOf('Седмица 34 · 2026') >= 0);

    const daily = w.buildDailyReportHtml(flat);
    ok('дневният няма ТОП 3', daily.indexOf('ТОП 3') < 0);
    ok('дневният също пази обектите', daily.indexOf('Раднево') >= 0);

    /* При разлика двата пак я показват. */
    const mixed = data([st('Раднево', 100), st('Габрово', 0), st('Троян', 50)]);
    ok('седмичният я връща при разлика',
      w.buildWeeklyReportHtml(mixed).indexOf('ТОП 3') >= 0);
    ok('дневният също',
      w.buildDailyReportHtml(mixed).indexOf('ТОП 3') >= 0);
  }

  section('5. ЯДРОТО: членуване при единица');
  {
    const { w } = env();

    const d1 = w.reportNoDueNoticeHtml(1, false);
    ok('дневен, 1: „постоянна задача", не „постоянни задачи"',
      d1.indexOf('1 постоянна задача без конкретен срок') >= 0, d1);
    ok('дневен, 1: глаголът е в единствено число („чака")',
      d1.indexOf('чака преглед') >= 0 && d1.indexOf('чакат') < 0, d1);
    ok('дневен, 1: скобата също („не участва")',
      d1.indexOf('не участва в %') >= 0 && d1.indexOf('не участват') < 0, d1);
    ok('дневен, 1: местоимението също („виж я")',
      d1.indexOf('виж я в таб') >= 0 && d1.indexOf('виж ги') < 0, d1);

    const w1 = w.reportNoDueNoticeHtml(1, true);
    ok('седмичен, 1: „постоянна задача … не участва"',
      w1.indexOf('1 постоянна задача без конкретен срок не участва в тази статистика.') >= 0, w1);
    ok('седмичен, 1: без „участват"', w1.indexOf('участват') < 0, w1);
  }

  section('6. Множественото число не е счупено');
  {
    const { w } = env();
    [0, 2, 3, 5, 11, 21].forEach(function (n) {
      const d = w.reportNoDueNoticeHtml(n, false);
      const s = w.reportNoDueNoticeHtml(n, true);
      if (n === 0) {
        ok('0 → нищо не се показва (дневен)', d === '');
        ok('0 → нищо не се показва (седмичен)', s === '');
        return;
      }
      ok(n + ' → „постоянни задачи … чакат … виж ги"',
        d.indexOf(n + ' постоянни задачи') >= 0 && d.indexOf('чакат преглед') >= 0 &&
        d.indexOf('виж ги') >= 0, d);
      ok(n + ' → седмичен „не участват"',
        s.indexOf(n + ' постоянни задачи') >= 0 && s.indexOf('не участват') >= 0, s);
    });
    /* 21 е капанът в български („двайсет и една задача"), но текстът се
       чете като брой, не като бройна форма — 21 остава в множествено. */
    ok('21 не пада в единствено число',
      w.reportNoDueNoticeHtml(21, false).indexOf('21 постоянна ') < 0);

    ok('липсващ брой не чупи', w.reportNoDueNoticeHtml(null, false) === '');
    ok('undefined също', w.reportNoDueNoticeHtml(undefined, true) === '');
  }

  section('7. Бележката стига до самите писма');
  {
    const { w } = env();
    const mixed = ['Раднево', 'Габрово'].map((n, i) => st(n, i ? 100 : 0));

    const one = w.buildDailyReportHtml(data(mixed, { noDueCount: 1 }));
    ok('дневният носи единственото число',
      one.indexOf('1 постоянна задача') >= 0 && one.indexOf('виж я') >= 0,
      one.slice(one.indexOf('📋'), one.indexOf('📋') + 200));

    const many = w.buildWeeklyReportHtml(data(mixed, { noDueCount: 4 }));
    ok('седмичният носи множественото',
      many.indexOf('4 постоянни задачи') >= 0 && many.indexOf('не участват') >= 0);

    const none = w.buildWeeklyReportHtml(data(mixed, { noDueCount: 0 }));
    ok('при 0 бележката липсва изцяло',
      none.indexOf('постоянни задачи без конкретен срок') < 0 &&
      none.indexOf('постоянна задача без конкретен срок') < 0);
  }

  section('8. Двата файла казват едно и също');
  {
    const fs = require('fs'), path = require('path');
    const root = path.join(__dirname, '..');
    const js = fs.readFileSync(path.join(root, 'report.js'), 'utf8');
    const ts = fs.readFileSync(
      path.join(root, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');

    const grab = (src, name) => {
      const m = src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
      return m ? m[0] : '';
    };
    ['reportRankingIsMeaningful', 'reportNoDueNoticeHtml'].forEach(function (fn) {
      const a = grab(js, fn), b = grab(ts, fn);
      ok(fn + ' я има и в двата файла', !!a && !!b);
      ok(fn + ' е идентична', a === b, 'разминаване между report.js и едж функцията');
    });
    ok('едж функцията вече не лепи числото директно',
      ts.indexOf("'📋 '+data.noDueCount+' постоянни задачи") < 0);
    ok('и report.js също',
      js.indexOf("'📋 '+data.noDueCount+' постоянни задачи") < 0);
    ok('reportTopBottomTable пази изхода си зад проверката (едж)',
      /function reportTopBottomTable\([\s\S]{0,120}reportRankingIsMeaningful/.test(ts));
    ok('reportTopBottomTable пази изхода си зад проверката (report.js)',
      /function reportTopBottomTable\([\s\S]{0,120}reportRankingIsMeaningful/.test(js));
  }

  report();
})();
