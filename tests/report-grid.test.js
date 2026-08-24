/* Решетката „обект × задача" и двата ѝ среза.

   Заварено: дневният имейл казваше КОЛКО, но не КАКВО. Ред „Добрич — 0 от 6
   задачи" не показва кои са тези шест, коментарите бяха подредени по задача
   (три коментара от Добрич излизаха на три различни места), а кутиите
   „ТОП 3" / „ИЗИСКВАТ ВНИМАНИЕ" преповтаряха краищата на списъка точно над
   тях.

   Тук се заковават:
     · четирите състояния на клетката, вкл. „не важи за този обект" — то НЕ
       влиза в знаменателя, иначе обект с по-малко задачи изглежда изоставащ;
     · че решетката показва само обектите под 100%, а стопроцентовите се
       свиват в един ред — но с ЗАПАЗЕНИ линкове;
     · резервният вариант над 12 колони;
     · подредбата на коментарите по обекти, включително стопроцентовите,
       които решетката не показва, а точно те имат най-много отмятания;
     · какво е ОТПАДНАЛО от дневния и какво е ОСТАНАЛО в седмичния.

   Пускане:  node tests/report-grid.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

function env() {
  return boot({ modules: ['bulletin.js', 'report.js'], user: ADMIN, data: {} });
}

/* Три задачи, три обекта. „Палети" важи само за Враца — тя е случаят
   „сива точка" при другите два обекта. */
const ITEMS = [
  { id: 'a', kind: 'recurring', title: 'Каса — отчет' },
  { id: 'b', kind: 'recurring', title: 'Палети', target_stores: ['Враца'] },
  { id: 'c', kind: 'recurring', title: 'Витрина — снимка' }
];
const STORES = ['Враца', 'Троян', 'Ловеч'];
const COMPS = [
  { item_id: 'a', kind: 'recurring', store_name: 'Враца', status: 'done', comment: 'всичко ок', photos: [] },
  { item_id: 'b', kind: 'recurring', store_name: 'Враца', status: 'done', comment: '', photos: [] },
  { item_id: 'c', kind: 'recurring', store_name: 'Враца', status: 'done', comment: '', photos: [] },
  { item_id: 'a', kind: 'recurring', store_name: 'Троян', status: 'done', comment: '', photos: [] },
  { item_id: 'c', kind: 'recurring', store_name: 'Троян', status: 'postponed', comment: 'няма стока', photos: [] }
];

function summary(w) {
  return w.reportBuildSummary(ITEMS, COMPS, STORES, 0);
}
function rowOf(s, name) {
  return s.rows.filter(function (r) { return r.name === name; })[0];
}

(async function () {

  section('1. ЯДРОТО: матрицата и четирите състояния');
  {
    const { w } = env();
    const s = summary(w);

    ok('items влизат в обобщението за легендата', s.items && s.items.length === 3,
      s.items ? String(s.items.length) : 'липсват');

    const vraca = rowOf(s, 'Враца');
    const troyan = rowOf(s, 'Троян');
    const lovech = rowOf(s, 'Ловеч');

    ok('Враца: три изпълнени', vraca.cells.join(',') === 'done,done,done',
      vraca.cells.join(','));
    /* Троян: „Палети" не важи за него → сива точка, НЕ пропуск. */
    ok('Троян: done, na, postponed', troyan.cells.join(',') === 'done,na,postponed',
      troyan.cells.join(','));
    ok('Ловеч: missing, na, missing', lovech.cells.join(',') === 'missing,na,missing',
      lovech.cells.join(','));

    /* Същината на сивата точка: знаменателят на Троян е 2, не 3. */
    ok('знаменателят на Троян е 2 (не важащата задача пада)',
      troyan.total === 2, String(troyan.total));
    ok('Враца е с знаменател 3', vraca.total === 3, String(vraca.total));
    ok('отложената НЕ се брои за изпълнена', troyan.done === 1 && troyan.pct === 50,
      troyan.done + '/' + troyan.total + ' = ' + troyan.pct + '%');
    ok('общо 4 от 7', s.totalDone === 4 && s.totalAll === 7,
      s.totalDone + '/' + s.totalAll);
  }

  section('2. ЯДРОТО: решетката показва само изоставащите');
  {
    const { w } = env();
    const s = summary(w);
    const h = w.reportGridHtml(s);

    ok('има истинска <table>', h.indexOf('<table') >= 0);
    ok('НЯМА display:flex', h.indexOf('display:flex') < 0);
    ok('НЯМА <details>', h.indexOf('<details') < 0);

    /* Легендата носи пълните заглавия; решетката — само номерата. */
    ok('легендата изписва трите заглавия',
      h.indexOf('Каса — отчет') >= 0 && h.indexOf('Палети') >= 0 &&
      h.indexOf('Витрина — снимка') >= 0);

    ok('Ловеч и Троян са редове в решетката',
      h.indexOf('>Ловеч</a>') >= 0 && h.indexOf('>Троян</a>') >= 0);
    /* Враца е на 100% → не е ред, а е в зеления ред отдолу. */
    ok('Враца НЕ е ред в решетката, а е в зеления ред',
      h.indexOf('✅ 100%') >= 0 && h.indexOf('>Враца</a>') >= 0);

    ok('колоната „X/N" носи 1/2 за Троян', h.indexOf('1/2') >= 0);
    ok('и 0/2 за Ловеч', h.indexOf('0/2') >= 0);

    /* Линковете: и в решетката, и в зеления ред. */
    const links = h.match(/\?store=/g) || [];
    ok('и трите имена са линкове', links.length === 3, String(links.length));

    /* Четирите глифа. */
    ok('има ✓ (изпълнена)', h.indexOf('✓') >= 0);
    ok('има ✖ (неизпълнена)', h.indexOf('✖') >= 0);
    ok('има ⏳ (отложена)', h.indexOf('⏳') >= 0);
    ok('има · (не важи за обекта)', h.indexOf('·') >= 0);
  }

  section('3. Гранични: всички на 100% и над 12 колони');
  {
    const { w } = env();

    /* Всички изпълнени → решетката отпада, остава зеленият блок. */
    const allDone = w.reportBuildSummary(
      [ITEMS[0]], [
        { item_id: 'a', kind: 'recurring', store_name: 'Враца', status: 'done', comment: '', photos: [] },
        { item_id: 'a', kind: 'recurring', store_name: 'Троян', status: 'done', comment: '', photos: [] }
      ], ['Враца', 'Троян'], 0);
    const perfect = w.reportGridHtml(allDone);
    ok('без изоставащи няма таблица', perfect.indexOf('<table') < 0, perfect.slice(0, 200));
    ok('но зеленият ред е налице', perfect.indexOf('✅ 100%') >= 0);

    /* Точно на прага 12 решетката ОСТАВА — граничният случай, не само
       типичният. */
    const mk = function (n) {
      const items = [], comps = [];
      for (let i = 0; i < n; i++) items.push({ id: 't' + i, kind: 'recurring', title: 'Задача ' + i });
      return w.reportBuildSummary(items, comps, ['Враца'], 0);
    };
    ok('12 колони → решетката се показва', w.reportGridHtml(mk(12)).indexOf('<table') >= 0);
    ok('13 колони → решетката отпада', w.reportGridHtml(mk(13)) === '');
    /* Но срезът „по задачи" остава — иначе писмото би останало без нищо. */
    ok('при 13 колони „по задачи" още работи',
      w.reportByTaskHtml(mk(13), false).indexOf('<table') >= 0);
  }

  section('4. ЯДРОТО: срезът „по задачи"');
  {
    const { w } = env();
    const s = summary(w);
    const h = w.reportByTaskHtml(s, false);

    ok('„Витрина" липсва при 2 от 3 обекта',
      h.indexOf('липсва при 2 от 3 обекта') >= 0, h);
    ok('„Каса" липсва при 1 от 3 обекта',
      h.indexOf('липсва при 1 от 3 обекта') >= 0);
    /* „Палети" важи само за Враца и е изпълнена → няма пропуск, не се показва. */
    ok('изпълнената навсякъде задача не се показва', h.indexOf('Палети') < 0, h);

    /* Подредба: най-многото пропуски отгоре. */
    ok('Витрина е преди Каса',
      h.indexOf('Витрина — снимка') < h.indexOf('Каса — отчет'),
      'Витрина@' + h.indexOf('Витрина — снимка') + ' Каса@' + h.indexOf('Каса — отчет'));

    /* Седмичният вариант: процент, всички задачи, най-ниският отгоре. */
    const wk = w.reportByTaskHtml(s, true);
    ok('седмичният показва проценти', wk.indexOf('%') >= 0);
    ok('и включва изпълнената навсякъде задача', wk.indexOf('Палети') >= 0);
    ok('Витрина (33%) е преди Каса (67%)',
      wk.indexOf('Витрина — снимка') < wk.indexOf('Каса — отчет'));
    ok('Палети (100%) е последна',
      wk.indexOf('Палети') > wk.indexOf('Каса — отчет'));
  }

  section('4б. Седмичният събира явяванията обратно по задача');
  {
    const { w } = env();
    /* Точно както collectWeeklyReportData разгъва постоянната задача: по
       едно явяване за всеки ден, с ден в заглавието и с baseTitle. */
    const items = [
      { id: 'k', kind: 'recurring', title: 'Каса (17.8)', baseTitle: 'Каса', date: '2026-08-17' },
      { id: 'k', kind: 'recurring', title: 'Каса (18.8)', baseTitle: 'Каса', date: '2026-08-18' }
    ];
    const comps = [
      { item_id: 'k', kind: 'recurring', store_name: 'Враца', status: 'done',
        comment: '', photos: [], completion_date: '2026-08-17' }
    ];
    const s = w.reportBuildSummary(items, comps, ['Враца', 'Троян'], 0);
    const wk = w.reportByTaskHtml(s, true);

    /* Един ред за задачата, не по един на ден — иначе секцията отговаря
       „кой ден", а въпросът ѝ е „коя задача". */
    const redove = (wk.match(/<tr>/g) || []).length;
    ok('един ред, не два', redove === 1, String(redove));
    ok('заглавието е без деня', wk.indexOf('Каса</td>') >= 0 || wk.indexOf('>Каса<') >= 0,
      wk);
    ok('денят НЕ се показва', wk.indexOf('17.8') < 0 && wk.indexOf('18.8') < 0, wk);
    /* 2 дни × 2 обекта = 4 явявания, едно изпълнено → 25%. */
    ok('процентът е по всички явявания: 1/4 = 25%',
      wk.indexOf('25%') >= 0 && wk.indexOf('1/4') >= 0, wk);
  }

  section('5. ЯДРОТО: коментарите се групират по обект');
  {
    const { w } = env();
    const s = summary(w);
    const h = w.reportCommentsByStoreHtml(s);

    ok('Троян е в блока (отложена с коментар)', h.indexOf('Троян') >= 0);
    ok('Враца е в блока (изпълнена с коментар)', h.indexOf('Враца') >= 0);
    /* Ловеч няма нито едно отмятане → не се показва изобщо. */
    ok('Ловеч не се показва — няма коментар', h.indexOf('Ловеч') < 0, h);

    ok('отложената е отбелязана като отложена', h.indexOf('отложена') >= 0);
    ok('коментарът на Троян е вътре', h.indexOf('няма стока') >= 0);
    ok('коментарът на Враца е вътре', h.indexOf('всичко ок') >= 0);

    /* Подредбата: изоставащите както в решетката, стопроцентовите след тях.
       Враца е на 100% — тя НЕ е в решетката, но има най-много изпълнени
       задачи, тоест точно тя е случаят, който правилото покрива. */
    ok('Троян (50%) е преди Враца (100%)',
      h.indexOf('Троян') < h.indexOf('Враца'),
      'Троян@' + h.indexOf('Троян') + ' Враца@' + h.indexOf('Враца'));

    /* Заглавието на задачата стои ПРЕД коментара, вътре в блока на обекта. */
    ok('името на задачата е до коментара', h.indexOf('Витрина — снимка') >= 0);
  }

  section('6. Дневният имейл: какво отпадна');
  {
    const { w } = env();
    const s = summary(w);
    s.reportDate = '2026-08-23';
    s.trendYesterday = null;
    const h = w.buildDailyReportHtml(s);

    ok('решетката е вътре', h.indexOf('По обекти и задачи') >= 0);
    ok('срезът „по задачи" е вътре', h.indexOf('По задачи') >= 0);
    ok('коментарите по обекти са вътре', h.indexOf('Коментари по обекти') >= 0);

    ok('НЯМА кутия ТОП 3', h.indexOf('ТОП 3') < 0);
    ok('НЯМА кутия ИЗИСКВАТ ВНИМАНИЕ', h.indexOf('ИЗИСКВАТ ВНИМАНИЕ') < 0);
    /* Старият ред беше „<done> от <total> задачи" под името на обекта.
       Търси се точно този подпис, а не думата „задачи" — тя стои и в
       етикета на едно от четирите числа горе („изпълнени задачи"). */
    ok('НЯМА стария ред „X от Y задачи"', !/\d+ от \d+ задачи/.test(h),
      (h.match(/\d+ от \d+ задачи/) || [''])[0]);
    ok('НЯМА отделна секция „Отложени задачи"', h.indexOf('Отложени задачи') < 0);
    /* Отложената обаче не е изчезнала — тя е вътре в коментарите. */
    ok('но отложената се вижда в коментарите', h.indexOf('няма стока') >= 0);
  }

  section('7. Седмичният имейл: какво остана');
  {
    const { w } = env();
    const s = summary(w);
    s.weekLabel = 'Седмица 34 · 2026';
    s.weekDates = null;
    s.cross = null;
    s.trendPrevWeek = null;
    const h = w.buildWeeklyReportHtml(s);

    ok('списъкът по обекти остава', h.indexOf('По обекти за седмицата') >= 0);
    ok('ТОП 3 остава само тук', h.indexOf('ТОП 3') >= 0);
    ok('новият срез „по задачи" е вътре', h.indexOf('По задачи за седмицата') >= 0);

    /* Коментарите падат до един ред с число. */
    ok('коментарите са свити до брой',
      h.indexOf('отмятания с коментар или снимка') >= 0 ||
      h.indexOf('отмятане с коментар или снимка') >= 0, h.slice(-1200));
    ok('и НЕ се изброяват', h.indexOf('всичко ок') < 0, 'списъкът още е там');

    /* Решетка в седмичния няма — 31 явявания не се събират в 600px. */
    ok('няма решетка в седмичния', h.indexOf('По обекти и задачи') < 0);
  }

  section('8. Множествено число в реда за коментарите');
  {
    const { w } = env();
    ok('1 → единствено число',
      w.reportCommentsCountHtml([{}]).indexOf('1 отмятане с коментар') >= 0,
      w.reportCommentsCountHtml([{}]));
    ok('2 → множествено число',
      w.reportCommentsCountHtml([{}, {}]).indexOf('2 отмятания с коментар') >= 0,
      w.reportCommentsCountHtml([{}, {}]));
    ok('единственото се препраща с „виж го"',
      w.reportCommentsCountHtml([{}]).indexOf('виж го') >= 0);
    ok('множественото — с „виж ги"',
      w.reportCommentsCountHtml([{}, {}]).indexOf('виж ги') >= 0);
  }

  report();
})();
