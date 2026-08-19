/* Числата по чиповете в таб "Разлики" срещу реалния брой редове в таблицата.

   Чипът "Всички" показваше counted.length, тоест целия sdData - включително
   редовете без попълнен тип, които стоят в секцията "За преглед" и никога не
   влизат в главната таблица. При реалните данни (19.08.2026) това е 42 срещу
   най-много 7 видими реда. Чиповете по тип имаха по-тиха версия на същото:
   брояха през целия sdData, без да зачитат активния филтър по статус, магазин,
   търсене и посока.

   Тестът НЕ проверява числата срещу очаквана константа - сравнява ги с това,
   което таблицата реално рендира след клик върху самия чип.

   Пускане:  node tests/stock-diff-chip-counts.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, fire } = H;

function row(o) {
  return Object.assign({
    report_id: null, store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ', quantity: 1,
    confirmed_date: null, comment: null, resolution_comment: null,
    order_number: null
  }, o);
}

/* 7 прегледани реда (с тип) + 5 непрегледани (без тип, в отчет с reviewed=false).
   Огледало на реалното съотношение, където мнозинството е без тип. */
const REVIEWED = [
  row({ id: 'w-p1', material_name: 'ПРОФИЛ ПВЦ',  type: 'writein', status: 'pending' }),
  row({ id: 'w-t1', material_name: 'БОЙЛЕР 80Л',  type: 'writein', status: 'taken' }),
  row({ id: 'w-c1', material_name: 'СТАР ЗАПИС',  type: 'writein', status: 'capitalized' }),
  row({ id: 'r-p1', material_name: 'КРАН',        type: 'return',  status: 'pending' }),
  row({ id: 'r-t1', material_name: 'МАРКУЧ 10М',  type: 'return',  status: 'taken' }),
  row({ id: 'm-p1', material_name: 'ГАЙКА М8',    type: 'missing', status: 'pending' }),
  row({ id: 'm-p2', material_name: 'ВИНТ М6', store_name: 'Гълъбово', type: 'missing', status: 'pending' })
];

/* Без тип - принадлежат на непрегледан отчет. Статусите им са нарочно РАЗЛИЧНИ:
   'new' е това, което базата има днес, но схемата има default 'pending', така че
   утре такъв ред може да се появи и не бива да изтича в чипа "Чакащи". */
const UNREVIEWED = [
  row({ id: 'u1', report_id: 'rep-new', material_name: 'НЕПРЕГЛЕДАН 1', type: null, status: 'new' }),
  row({ id: 'u2', report_id: 'rep-new', material_name: 'НЕПРЕГЛЕДАН 2', type: null, status: 'new' }),
  row({ id: 'u3', report_id: 'rep-new', material_name: 'НЕПРЕГЛЕДАН 3', type: null, status: 'pending' }),
  row({ id: 'u4', report_id: 'rep-new', material_name: 'НЕПРЕГЛЕДАН 4', type: null, status: 'taken' }),
  row({ id: 'u5', report_id: 'rep-new', material_name: 'НЕПРЕГЛЕДАН 5', type: null, status: null })
];

const REPORTS = [{
  id: 'rep-new', store_name: 'Раднево', direction: 'supplier', reviewed: false,
  report_date: '2026-08-18', created_by: 'Раднево', supplier: 'ТЕСИ ООД'
}];

const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin',
                store_name: 'Централен офис', assigned_stores: ['Раднево', 'Гълъбово'] };

function env(rows, reports) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: ADMIN,
    data: { stock_differences: rows, differences_reports: reports || [], stock_returns: [] }
  });
  h.w.sdData = JSON.parse(JSON.stringify(rows));
  h.w.diffReports = JSON.parse(JSON.stringify(reports || []));
  h.w.sdTypeFilter = 'all';
  h.w.sdFilter = 'all';
  h.w.sdStoreFilter = '';
  h.w.sdSearch = '';
  return h;
}

/* Главната таблица се разпознава по заглавието "Кредитно" - то е само нейно.
   Броим редовете в нейния tbody, не текст в контейнер. */
function tableRowCount(doc) {
  const tables = doc.querySelectorAll('#mod-stock-diff table');
  for (let i = 0; i < tables.length; i++) {
    const head = tables[i].querySelector('thead');
    if (head && head.textContent.indexOf('Кредитно') >= 0) {
      return tables[i].querySelectorAll('tbody tr').length;
    }
  }
  return 0; /* няма таблица = празно състояние */
}

function typeChip(doc, type) {
  const all = doc.querySelectorAll('button[data-f="' + type + '"]');
  for (let i = 0; i < all.length; i++) {
    if (/setSDTypeFilter/.test(all[i].getAttribute('onclick'))) return all[i];
  }
  return null;
}
function statusChip(doc, which) {
  const all = doc.querySelectorAll('button[data-f="' + which + '"]');
  for (let i = 0; i < all.length; i++) {
    if (/setSDFilter/.test(all[i].getAttribute('onclick'))) return all[i];
  }
  return null;
}
function chipNumber(el) {
  const m = el && el.textContent.match(/\((\d+)\)/);
  return m ? parseInt(m[1], 10) : -1;
}

/* Сърцевината: прочети числото на чипа, кликни го, преброй редовете. */
function chipMatchesTable(w, doc, chip, label) {
  if (!ok(label + ' — чипът съществува', !!chip)) return;
  const promised = chipNumber(chip);
  realClick(w, chip);
  const actual = tableRowCount(doc);
  ok(label + ' — обещани ' + promised + ', показани ' + actual, promised === actual);
}

(async function () {

  section('1. Чипът "Всички" не брои редовете без тип');
  {
    const { w, doc } = env(REVIEWED.concat(UNREVIEWED), REPORTS);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const all = statusChip(doc, 'all');
      ok('НЕ показва 12 (целия sdData)', chipNumber(all) !== 12, chipNumber(all));
      chipMatchesTable(w, doc, all, 'Всички');
    }
  }

  section('2. Всеки статусен чип съвпада с таблицата');
  {
    ['all', 'pending', 'taken'].forEach(function (s) {
      const { w, doc } = env(REVIEWED.concat(UNREVIEWED), REPORTS);
      w.renderStockDiff();
      chipMatchesTable(w, doc, statusChip(doc, s), 'статус "' + s + '"');
    });
  }

  section('3. Всеки типов чип съвпада с таблицата');
  {
    ['writein', 'return', 'missing'].forEach(function (t) {
      const { w, doc } = env(REVIEWED.concat(UNREVIEWED), REPORTS);
      w.renderStockDiff();
      chipMatchesTable(w, doc, typeChip(doc, t), 'тип "' + t + '"');
    });
  }

  section('4. Типовият чип зачита активния филтър по статус');
  {
    const { w, doc } = env(REVIEWED.concat(UNREVIEWED), REPORTS);
    w.renderStockDiff();
    realClick(w, statusChip(doc, 'taken'));   /* първо стесняваме по статус */
    ok('филтърът по статус е активен', w.sdFilter === 'taken');
    chipMatchesTable(w, doc, typeChip(doc, 'writein'), 'writein при статус taken');
    ok('и типът е активен', w.sdTypeFilter === 'writein');
  }

  section('5. Статусният чип зачита активния филтър по тип');
  {
    const { w, doc } = env(REVIEWED.concat(UNREVIEWED), REPORTS);
    w.renderStockDiff();
    realClick(w, typeChip(doc, 'missing'));
    ok('типът е активен', w.sdTypeFilter === 'missing');
    chipMatchesTable(w, doc, statusChip(doc, 'all'), 'Всички при тип missing');
  }

  section('6. Чиповете зачитат филтъра по магазин');
  {
    const { w, doc } = env(REVIEWED.concat(UNREVIEWED), REPORTS);
    w.renderStockDiff();
    if (guard('избор на магазин', () => w.setSDStoreFilter('Гълъбово'))) {
      ok('филтърът е приложен', w.sdStoreFilter === 'Гълъбово');
      chipMatchesTable(w, doc, statusChip(doc, 'all'), 'Всички при магазин Гълъбово');
      chipMatchesTable(w, doc, typeChip(doc, 'missing'), 'missing при магазин Гълъбово');
    }
  }

  section('7. Чиповете зачитат търсенето');
  {
    const { w, doc } = env(REVIEWED.concat(UNREVIEWED), REPORTS);
    w.renderStockDiff();
    const inp = doc.getElementById('sd-search-input');
    if (ok('полето за търсене съществува', !!inp)) {
      inp.value = 'БОЙЛЕР';
      fire(w, inp, 'input');
      ok('търсенето е приложено', w.sdSearch === 'БОЙЛЕР');
      chipMatchesTable(w, doc, statusChip(doc, 'all'), 'Всички при търсене "БОЙЛЕР"');
    }
  }

  section('8. Граница: САМО непрегледани редове — всички чипове са 0');
  {
    const { w, doc } = env(UNREVIEWED, REPORTS);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      ok('"Всички" е 0', chipNumber(statusChip(doc, 'all')) === 0, chipNumber(statusChip(doc, 'all')));
      ok('"Чакащи" е 0', chipNumber(statusChip(doc, 'pending')) === 0);
      ok('"Приключени" е 0', chipNumber(statusChip(doc, 'taken')) === 0);
      ok('типът writein е 0', chipNumber(typeChip(doc, 'writein')) === 0);
      ok('таблицата е празна', tableRowCount(doc) === 0);
      ok('секцията "За преглед" пак показва непрегледаните',
         doc.getElementById('mod-stock-diff').innerHTML.indexOf('НЕПРЕГЛЕДАН 1') >= 0);
    }
  }

  section('9. Празни данни — нищо не хвърля и всичко е 0');
  {
    const { w, doc } = env([], []);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      ok('"Всички" е 0', chipNumber(statusChip(doc, 'all')) === 0);
      ok('таблицата е празна', tableRowCount(doc) === 0);
    }
  }

  section('10. sdTableRows пряко');
  {
    const { w } = env(REVIEWED.concat(UNREVIEWED), REPORTS);
    w.renderStockDiff();
    ok('без аргумент = текущият изглед', w.sdTableRows().length === 7, w.sdTableRows().length);
    ok('нито един ред без тип не влиза',
       w.sdTableRows({ status: 'all' }).every(r => !!r.type));
    ok('over={type} подменя само типа', w.sdTableRows({ type: 'missing' }).length === 2,
       w.sdTableRows({ type: 'missing' }).length);
    ok('over={status} подменя само статуса', w.sdTableRows({ status: 'taken' }).length === 3,
       w.sdTableRows({ status: 'taken' }).length);
    ok('двете заедно', w.sdTableRows({ type: 'writein', status: 'taken' }).length === 2,
       w.sdTableRows({ type: 'writein', status: 'taken' }).length);
  }

  report();
})();
