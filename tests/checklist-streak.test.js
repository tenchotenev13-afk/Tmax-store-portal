/* Чек лист — поредни седмици с „не" (етап 3Б, 23.10.2026).

   ЕДНО правило на три места: checklistNoStreak (checklist.js),
   reportChecklistNoStreak (report.js) и същото в
   supabase/functions/send-scheduled-report/index.ts.

   Какво заковава файлът:
   1. поредица 3 → „3-та седмица подред"; 1 → „нова"; 2 → „2-ра";
   2. прекъсната от „да" → 1; прекъсната от липсващ ред → 1 (липсващ ред НЕ
      е „не");
   3. през годината: седмица 2/2027 назад към 1/2027 и 53/2026 (2026 има 53
      ISO седмици — week − 1 би стигнал до „0/2027");
   4. 9 поредни → 8 → „8+ седмици подред";
   5. числова колона → 0; клетка „да" в самата седмица → 0;
   6. control бие portal (правилото на checklistEmailCellValue);
   7. трите копия дават едно и също за един и същ вход.

   Пускане:  node tests/checklist-streak.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const YN = { key: 'revizia_953', label: 'ревизия', value_type: 'yes_no' };
const NUM = { key: 'storna_priem', label: 'сторна', value_type: 'number' };

function r(store, key, year, week, f) {
  return Object.assign({ year: year, week_number: week, store_name: store, metric_key: key,
                         portal_value: null, control_value: null, control_num: null }, f || {});
}
const ne = function (y, w) { return r('Шумен', 'revizia_953', y, w, { control_value: 'ne' }); };

/* Извлича функции по име от файл — от „function ИМЕ(" до затварящата „}" на
   колона 0. Строи ги заедно в изолирана среда. */
function extract(file, names) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
  const parts = names.map(function (n) {
    const a = src.indexOf('\nfunction ' + n + '(');
    if (a < 0) throw new Error(file + ': няма ' + n);
    const b = src.indexOf('\n}\n', a + 1);
    return src.slice(a + 1, b + 2);
  });
  return new Function(parts.join('\n') + '\nreturn {' + names.map(function (n) { return n + ':' + n; }).join(',') + '};')();
}
const REPORT_NAMES = ['reportChecklistCellValue', 'reportChecklistIsoWeekMonday', 'reportChecklistIsoWeekOf',
                      'reportChecklistPrevIsoWeek', 'reportChecklistNoStreak', 'reportChecklistStreakLabel'];

(function () {
  const h = boot({ modules: ['bulletin.js', 'checklist.js', 'report.js'],
                   user: { email: 'a@temax.bg', role: 'admin', store_name: 'Централен офис' }, data: {} });
  const C = { streak: h.w.checklistNoStreak, label: h.w.checklistStreakLabel, prev: h.w.checklistPrevIsoWeek };
  const R = { streak: h.w.reportChecklistNoStreak, label: h.w.reportChecklistStreakLabel, prev: h.w.reportChecklistPrevIsoWeek };
  const E = (function () {
    const x = extract('supabase/functions/send-scheduled-report/index.ts', REPORT_NAMES);
    return { streak: x.reportChecklistNoStreak, label: x.reportChecklistStreakLabel, prev: x.reportChecklistPrevIsoWeek };
  })();
  const ALL = [['checklist.js', C], ['report.js', R], ['index.ts', E]];

  section('1. Поредица и надпис');
  {
    const rows = [ne(2026, 41), ne(2026, 42), ne(2026, 43)];
    ALL.forEach(function (p) {
      ok(p[0] + ': 41–43 „не" → 3', p[1].streak(rows, YN, 'Шумен', 2026, 43) === 3, String(p[1].streak(rows, YN, 'Шумен', 2026, 43)));
    });
    ok('3 → „3-та седмица подред"', C.label(3) === '3-та седмица подред', C.label(3));
    ok('1 → „нова"', C.label(1) === 'нова');
    ok('2 → „2-ра седмица подред"', C.label(2) === '2-ра седмица подред', C.label(2));
    ok('7 → „7-ма седмица подред"', C.label(7) === '7-ма седмица подред', C.label(7));
    ok('8 → „8+ седмици подред"', C.label(8) === '8+ седмици подред', C.label(8));
  }

  section('2. Прекъсване — „да" и липсващ ред');
  {
    const da = [ne(2026, 41), r('Шумен', 'revizia_953', 2026, 42, { control_value: 'da' }), ne(2026, 43)];
    const gap = [ne(2026, 40), ne(2026, 41), ne(2026, 43)];        /* 42 липсва */
    ALL.forEach(function (p) {
      ok(p[0] + ': прекъсната от „да" → 1', p[1].streak(da, YN, 'Шумен', 2026, 43) === 1);
      ok(p[0] + ': прекъсната от липсващ ред → 1', p[1].streak(gap, YN, 'Шумен', 2026, 43) === 1,
         String(p[1].streak(gap, YN, 'Шумен', 2026, 43)));
    });
    const portal = [r('Шумен', 'revizia_953', 2026, 42, { portal_value: 'ne', control_value: 'da' }), ne(2026, 43)];
    ok('control „да" бие portal „не" → прекъсва', C.streak(portal, YN, 'Шумен', 2026, 43) === 1);
    const pOnly = [r('Шумен', 'revizia_953', 2026, 42, { portal_value: 'ne' }), ne(2026, 43)];
    ok('само portal „не" се брои', C.streak(pOnly, YN, 'Шумен', 2026, 43) === 2);
    ok('друг обект не се брои', C.streak([ne(2026, 42), r('Враца', 'revizia_953', 2026, 43, { control_value: 'ne' })], YN, 'Шумен', 2026, 43) === 0);
  }

  section('3. През годината — 2/2027 → 1/2027 → 53/2026 → 52/2026');
  {
    ALL.forEach(function (p) {
      const a = p[1].prev(2027, 1);
      ok(p[0] + ': преди 1/2027 е 53/2026', a.year === 2026 && a.week === 53, JSON.stringify(a));
      const b = p[1].prev(2026, 1);
      ok(p[0] + ': преди 1/2026 е 52/2025', b.year === 2025 && b.week === 52, JSON.stringify(b));
    });
    const rows = [ne(2026, 52), ne(2026, 53), ne(2027, 1), ne(2027, 2)];
    ALL.forEach(function (p) {
      ok(p[0] + ': 52/2026 … 2/2027 → 4', p[1].streak(rows, YN, 'Шумен', 2027, 2) === 4, String(p[1].streak(rows, YN, 'Шумен', 2027, 2)));
    });
    /* Седмицата на checklistIsoWeekMonday съвпада с weekDays() на портала. */
    let same = true;
    [[2026, 1], [2026, 43], [2026, 53], [2027, 1], [2027, 2], [2028, 52]].forEach(function (yw) {
      if (h.w.toLocalISO(h.w.checklistIsoWeekMonday(yw[0], yw[1])) !== h.w.toLocalISO(h.w.weekDays(yw[1], yw[0])[0])) same = false;
    });
    ok('понеделникът съвпада с weekDays() на портала', same);
  }

  section('4. Таван 8');
  {
    const rows = [];
    for (let w = 35; w <= 43; w++) rows.push(ne(2026, w));          /* 9 поредни */
    ALL.forEach(function (p) {
      ok(p[0] + ': 9 поредни → 8', p[1].streak(rows, YN, 'Шумен', 2026, 43) === 8);
      ok(p[0] + ': надпис „8+ седмици подред"', p[1].label(p[1].streak(rows, YN, 'Шумен', 2026, 43)) === '8+ седмици подред');
    });
  }

  section('5. Числова колона и „да" в самата седмица');
  {
    const rows = [r('Шумен', 'storna_priem', 2026, 42, { control_num: 3 }), r('Шумен', 'storna_priem', 2026, 43, { control_num: 3 })];
    ALL.forEach(function (p) {
      ok(p[0] + ': числова колона → 0', p[1].streak(rows, NUM, 'Шумен', 2026, 43) === 0);
      ok(p[0] + ': „да" в самата седмица → 0', p[1].streak([ne(2026, 42), r('Шумен', 'revizia_953', 2026, 43, { control_value: 'da' })], YN, 'Шумен', 2026, 43) === 0);
    });
  }

  section('7. Трите копия — едно и също за един и същ вход');
  {
    const rows = [];
    const vals = ['ne', 'da', 'ne', 'ne', null, 'ne', 'ne', 'ne', 'ne', 'nyamat', 'ne'];
    ['Шумен', 'Враца'].forEach(function (s, si) {
      for (let i = 0; i < vals.length; i++) {
        const wk = h.w.checklistIsoWeekOf(new Date(2027, 0, 11 - 7 * i));
        if (vals[(i + si) % vals.length] !== null) rows.push(r(s, 'revizia_953', wk.year, wk.week, { control_value: vals[(i + si) % vals.length] }));
      }
    });
    let diff = [];
    ['Шумен', 'Враца'].forEach(function (s) {
      for (let i = 0; i < 10; i++) {
        const wk = h.w.checklistIsoWeekOf(new Date(2027, 0, 11 - 7 * i));
        const a = C.streak(rows, YN, s, wk.year, wk.week), b = R.streak(rows, YN, s, wk.year, wk.week), c = E.streak(rows, YN, s, wk.year, wk.week);
        if (a !== b || b !== c) diff.push(s + ' ' + wk.week + '/' + wk.year + ': ' + a + '/' + b + '/' + c);
      }
    });
    ok('20 входа — checklist.js = report.js = index.ts', diff.length === 0, diff.join('; '));
    let labDiff = [];
    for (let n = 0; n <= 9; n++) if (C.label(n) !== R.label(n) || R.label(n) !== E.label(n)) labDiff.push(n);
    ok('надписите 0..9 съвпадат в трите', labDiff.length === 0, labDiff.join(','));
  }

  h.close();
  report();
})();
