/* Броячите в таб "Разлики" и историческият статус 'capitalized'.

   Баджът на реда третираше 'capitalized' и 'taken' като едно състояние, а
   броячът и филтърът сравняваха само с 'taken'. Резултатът: ред със стария
   статус се показваше като ЗАПРИХОДЕНА в таблицата, но не влизаше в нито
   едно число, а чипът "Приключени" го скриваше. В базата такъв ред реално
   съществува (1 от 42 към 19.08.2026), затова случаят не е хипотетичен.

   Тестът покрива И ДВЕТЕ стойности: 'taken' и 'capitalized'.

   Пускане:  node tests/stock-diff-capitalized-counter.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick } = H;

function row(o) {
  return Object.assign({
    report_id: null, store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ', quantity: 1,
    confirmed_date: null, comment: null, resolution_comment: null
  }, o);
}

/* Огледало на реалното разпределение: writein редът е с историческия статус,
   return редовете са с новия. Така всеки брояч има и от двете стойности. */
const ROWS = [
  row({ id: 'w-cap', material_name: 'СТАР ЗАПИС',  type: 'writein', status: 'capitalized' }),
  row({ id: 'w-tak', material_name: 'НОВ ЗАПИС',   type: 'writein', status: 'taken' }),
  row({ id: 'w-pen', material_name: 'ЧАКАЩ',       type: 'writein', status: 'pending' }),
  row({ id: 'r-cap', material_name: 'ВЪРНАТА СТАР', type: 'return', status: 'capitalized' }),
  row({ id: 'r-tak', material_name: 'ВЪРНАТА НОВА', type: 'return', status: 'taken' }),
  row({ id: 'r-pen', material_name: 'ЗА ВЗИМАНЕ',   type: 'return', status: 'pending' })
];

const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin',
                store_name: 'Централен офис', assigned_stores: ['Раднево'] };

function env(rows) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: ADMIN,
    data: { stock_differences: rows, differences_reports: [], stock_returns: [] }
  });
  h.w.sdData = JSON.parse(JSON.stringify(rows));
  h.w.diffReports = [];
  h.w.sdTypeFilter = 'all';
  h.w.sdFilter = 'all';
  return h;
}

function typeChip(doc, type) { return doc.querySelector('button[data-f="' + type + '"]'); }

/* data-f="all" го има и при чиповете по тип; статусният е този с число в скоби. */
function statusChip(doc, which) {
  if (which !== 'all') return doc.querySelector('button[data-f="' + which + '"]');
  const cands = Array.prototype.filter.call(
    doc.querySelectorAll('button[data-f="all"]'), b => /\(\d+\)/.test(b.textContent));
  return cands[cands.length - 1] || null;
}
function chipCount(doc, which) {
  const el = statusChip(doc, which);
  const m = el && el.textContent.match(/\((\d+)\)/);
  return m ? parseInt(m[1], 10) : -1;
}
/* Числото в картата - вторият <div> вътре в картата с дадения етикет. */
function cardCount(doc, label) {
  const m = doc.getElementById('mod-stock-diff').innerHTML
    .match(new RegExp(label + '</div><div[^>]*>(\\d+)</div>'));
  return m ? parseInt(m[1], 10) : -1;
}
function rowVisible(doc, name) {
  return doc.getElementById('mod-stock-diff').innerHTML.indexOf(name) >= 0;
}

(async function () {

  section('1. Брояч "Приключени" при смесени типове брои и двете стойности');
  {
    const { w, doc } = env(ROWS);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      ok('картата брои 4 (2 taken + 2 capitalized)', cardCount(doc, 'Приключени') === 4,
         cardCount(doc, 'Приключени'));
      ok('чипът брои 4', chipCount(doc, 'taken') === 4, chipCount(doc, 'taken'));
      ok('"Чакащи" остава 2 — capitalized не изтича при чакащите',
         cardCount(doc, 'Чакащи') === 2, cardCount(doc, 'Чакащи'));
    }
  }

  section('2. Филтър "Заприхождаване" — capitalized влиза в типовия брояч');
  {
    const { w, doc } = env(ROWS);
    w.renderStockDiff();
    if (guard('превключване на типа', () => realClick(w, typeChip(doc, 'writein')))) {
      ok('филтърът е приложен', w.sdTypeFilter === 'writein');
      ok('"Заприходена" брои 2 (taken + capitalized)',
         cardCount(doc, 'Заприходена') === 2, cardCount(doc, 'Заприходена'));
      ok('"Незаприходена" брои 1', cardCount(doc, 'Незаприходена') === 1,
         cardCount(doc, 'Незаприходена'));
    }
  }

  section('3. Чипът "Приключени" показва и capitalized реда в таблицата');
  {
    const { w, doc } = env(ROWS);
    w.renderStockDiff();
    if (guard('клик по чипа за приключени', () => realClick(w, statusChip(doc, 'taken')))) {
      ok('филтърът е приложен', w.sdFilter === 'taken');
      ok('редът с taken се вижда', rowVisible(doc, 'НОВ ЗАПИС'));
      ok('редът с capitalized СЪЩО се вижда', rowVisible(doc, 'СТАР ЗАПИС'));
      ok('чакащият ред е скрит', !rowVisible(doc, 'ЧАКАЩ'));
      ok('числото на чипа = броя редове в таблицата', chipCount(doc, 'taken') === 4,
         chipCount(doc, 'taken'));
    }
  }

  section('4. Чипът "Чакащи" не поглъща capitalized');
  {
    const { w, doc } = env(ROWS);
    w.renderStockDiff();
    if (guard('клик по чипа за чакащи', () => realClick(w, statusChip(doc, 'pending')))) {
      ok('редът с capitalized е скрит', !rowVisible(doc, 'СТАР ЗАПИС'));
      ok('редът с taken е скрит', !rowVisible(doc, 'НОВ ЗАПИС'));
      ok('чакащият ред се вижда', rowVisible(doc, 'ЧАКАЩ'));
    }
  }

  section('5. Баджът на реда остава ЗАПРИХОДЕНА за capitalized');
  {
    const { w } = env(ROWS);
    w.renderStockDiff();
    ok('capitalized → ЗАПРИХОДЕНА',
       w.sdRowStatusBadge({ type: 'writein', status: 'capitalized' }).indexOf('ЗАПРИХОДЕНА') >= 0);
    ok('taken → ЗАПРИХОДЕНА (същата дума)',
       w.sdRowStatusBadge({ type: 'writein', status: 'taken' }).indexOf('ЗАПРИХОДЕНА') >= 0);
    ok('capitalized при return → ВЗЕТА',
       w.sdRowStatusBadge({ type: 'return', status: 'capitalized' }).indexOf('ВЗЕТА') >= 0);
    ok('pending не е засегнат',
       w.sdRowStatusBadge({ type: 'writein', status: 'pending' }).indexOf('НЕЗАПРИХОДЕНА') >= 0);
  }

  section('6. Граница: САМО capitalized редове — броячът е 1, не 0');
  {
    const ONLY = [row({ id: 'only', material_name: 'ЕДИНСТВЕН', type: 'writein', status: 'capitalized' })];
    const { w, doc } = env(ONLY);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      ok('картата брои 1', cardCount(doc, 'Приключени') === 1, cardCount(doc, 'Приключени'));
      ok('редът се вижда', rowVisible(doc, 'ЕДИНСТВЕН'));
      ok('"Чакащи" е 0', cardCount(doc, 'Чакащи') === 0, cardCount(doc, 'Чакащи'));
    }
  }

  section('7. Празни/липсващи данни — нищо не се брои погрешно');
  {
    const MESSY = [
      row({ id: 'no-status', material_name: 'БЕЗ СТАТУС', type: 'writein', status: null }),
      row({ id: 'new-row',   material_name: 'НОВ РЕД',    type: 'writein', status: 'new' }),
      row({ id: 'recv',      material_name: 'ПРИЕТА',     type: 'return',  status: 'received' })
    ];
    const { w, doc } = env(MESSY);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      ok('"Приключени" е 0', cardCount(doc, 'Приключени') === 0, cardCount(doc, 'Приключени'));
      ok('"Чакащи" е 0', cardCount(doc, 'Чакащи') === 0, cardCount(doc, 'Чакащи'));
    }
    ok('sdIsTaken(ред без status) е false', w.sdIsTaken({ status: null }) === false);
    ok('sdIsTaken(празен обект) е false', w.sdIsTaken({}) === false);
  }

  section('8. Помощникът пряко');
  {
    const { w } = env(ROWS);
    ok('sdIsTaken съществува', typeof w.sdIsTaken === 'function');
    ok('taken → true', w.sdIsTaken({ status: 'taken' }) === true);
    ok('capitalized → true', w.sdIsTaken({ status: 'capitalized' }) === true);
    ok('pending → false', w.sdIsTaken({ status: 'pending' }) === false);
    ok('new → false', w.sdIsTaken({ status: 'new' }) === false);
    ok('received → false', w.sdIsTaken({ status: 'received' }) === false);
  }

  report();
})();
