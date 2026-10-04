/* Списъкът „в срок" в седмичния отчет на крона (reportSpanPendingHtml) вика
   fmtDate2(), а той беше само в bulletin.js. На 04.10.2026 в 21:00
   send-scheduled-report върна 500 „ReferenceError: fmtDate2 is not defined",
   щом в С40 имаше задача със срок в по-късна седмица.

   Тук функциите се вадят от ЕДЖ файла и се изпълняват изолирано — само със
   собствените си зависимости, точно както ги вижда Deno. Ако пак извикат
   нещо, което файлът не дефинира, ще има ReferenceError и тестът пада.

   Пускане: node tests/report-span-pending-fmtdate.test.js . */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, section, report, guard } = H;

const root = process.argv[2] || '.';
const SRC = fs.readFileSync(path.join(root, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');

/* Функция на най-горно ниво → текст; затваря се по брояч на скоби.
   Анотациите на типове се махат с просто правило (само `: any`/`: Date`). */
function fn(name) {
  let i = SRC.indexOf('\nfunction ' + name + '(');
  if (i < 0) throw new Error('няма функция ' + name);
  i += 1;
  let depth = 0, started = false, j = i;
  for (; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) { j++; break; } }
  }
  return SRC.slice(i, j).replace(/: ?(any|Date)(?![A-Za-z])/g, '');
}

function load(names) {
  return new Function(names.map(fn).join('\n') + '\nreturn {' + names.join(',') + '};')();
}

const NEEDED = ['esc', 'fmtDate2', 'reportMondayOfWeek', 'reportWeekOfMonday',
  'reportSpanDueWeekLabel', 'reportSpanPendingHtml'];

guard('тест', () => {
  section('1. reportSpanPendingHtml с реален пример (срок 2026-10-15, С42)');
  let M;
  guard('функциите се зареждат изолирано', () => { M = load(NEEDED); });
  ok('заредени', !!M);
  if (!M) return;

  const list = [{ title: 'Надстройка в буса…', due: '2026-10-15', dueWeek: 'С42', done: 3, total: 18 }];
  let html = '';
  guard('не хвърля ReferenceError', () => { html = M.reportSpanPendingHtml(list); });
  ok('датата е ДД.ММ.ГГГГ', html.indexOf('срок 15.10.2026') !== -1);
  ok('седмицата е в скоби', html.indexOf('(С42)') !== -1);
  ok('брой обекти', html.indexOf('<b>3/18</b>') !== -1);
  ok('заглавието е в писмото', html.indexOf('Надстройка в буса') !== -1);

  section('2. fmtDate2 — поведение като в bulletin.js');
  ok('ISO → ДД.ММ.ГГГГ', M.fmtDate2('2026-10-15') === '15.10.2026');
  ok('ISO с час', M.fmtDate2('2026-10-15T08:00:00Z') === '15.10.2026');
  ok('празно → тире', M.fmtDate2('') === '—' && M.fmtDate2(null) === '—' && M.fmtDate2(undefined) === '—');
  ok('неразпознат формат се връща като е', M.fmtDate2('утре') === 'утре');

  section('3. Гранични случаи');
  ok('празен списък → празен низ', M.reportSpanPendingHtml([]) === '');
  ok('не-масив → празен низ', M.reportSpanPendingHtml(null) === '');
  const noDue = M.reportSpanPendingHtml([{ title: 'X', due: null, done: 0, total: 5 }]);
  ok('без срок → тире, не гръмва', noDue.indexOf('срок —') !== -1);
});
report();
