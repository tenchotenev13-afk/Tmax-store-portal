/* Разлики — междускладовата бланка е без колоните на Цвети.

   Цвети не решава междускладови разлики: те се разбират директно между
   магазина и логистичния склад. Въпреки това „Коментар (Цвети)" и „Решение
   (Цвети)" стояха в бланката празни през цялата ѝ дължина и само стесняваха
   останалите колони. По-лошото: при canReviewDiff в тях излизаха трите бутона
   Заприх./Връщане/Липса — решение, което по този поток не бива да се взима.

   Скриването е по същото правило като „По стокова": колоната се рендира само
   за своята посока, и заглавието, и клетките.

   ТРИ неща, които се проверяват и в ОБРАТНАТА посока, за да не мине проверката
   срещу празен екран:
     · доставчиковата бланка запазва двете колони — 2 <th> с „Цвети";
     · броят <td> на реда съвпада с броя <th> и в двата случая (иначе редът се
       разминава с главата, без нищо да гръмне);
     · colspan на реда „✓ K приключени реда" следва същия брой — той се смята
       от заглавния ред, не е заковано число.

   И една засада: бутонът „✏️ Коригирай количество/SAP код" е на МАГАЗИНА, а
   живееше в клетката на Цвети. Скрие ли се колоната, без да се премести, на
   междускладовата бланка не остава НИКАКЪВ път за корекция. Затова се мести
   при артикула и това е заковано тук.

   Пускане:  node tests/sd-interstore-columns.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, allBtns } = H;

const WH = 'Логистичен склад Търговище';
const clone = x => JSON.parse(JSON.stringify(x));

function rep(o) {
  return Object.assign({
    id: 'rep-i', direction: 'interstore', store_name: 'Петрич', counterpart: WH,
    document_number: '4600', doc_date: '2026-09-10', submitted_by: 'Управител',
    general_comment: '', photos: [], reviewed: false, created_at: '2026-09-10T09:00:00.000Z'
  }, o);
}
function line(o) {
  return Object.assign({
    id: 'l-1', report_id: 'rep-i', store_name: 'Петрич', supplier: null,
    material_code: '000123', material_name: 'ЩУЦЕР МЕТАЛЕН',
    quantity: 20, quantity_received: 0, quantity_supplier_doc: 20,
    order_number: null, confirmed_date: null, comment: null,
    resolution_comment: null, attachments: [], credit_note_issued: false,
    difference_category: 'undelivered', unit: 'бр.', status: 'new', type: null,
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null,
    store_corrected_at: null, warehouse_response: null, warehouse_comment: null,
    store_response: null, store_response_by: null, store_response_at: null,
    store_response_comment: null, swap_id: null, created_at: '2026-09-10T09:00:00.000Z'
  }, o);
}

const REP_I = rep();
const REP_S = rep({ id: 'rep-s', direction: 'supplier', counterpart: 'ТЕСИ ООД' });

const CVETI   = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const PETRICH = { email: 'petrich@temax.bg', display_name: 'Управител Петрич', role: 'manager', store_name: 'Петрич', assigned_stores: [] };
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище', role: 'sklad', store_name: WH, assigned_stores: [] };

function env(user, lines, reports, dirTab) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user, confirm: true,
    data: {
      stock_differences: lines, differences_reports: reports, stock_diff_swaps: [],
      stock_returns: [], transport_orders: [], users: [],
      stores: [{ name: 'Петрич' }], contacts: [{ name: 'ТЕСИ ООД' }]
    }
  });
  h.w.sdData = clone(lines);
  h.w.diffReports = clone(reports);
  h.w.sdSwaps = [];
  h.w.transportOrders = [];
  h.w.sdFilter = 'pending'; h.w.sdTypeFilter = 'all';
  h.w.sdStoreFilter = ''; h.w.sdSearch = ''; h.w.sdDirTab = dirTab || 'interstore';
  h.w.sdShowDone = {};
  h.w.invalidateStoreCaches(); h.w.invalidateSuppliersCache();
  h.w.renderStockDiff();
  return h;
}

const card = (h, id) => h.doc.getElementById('diff-rep-' + (id || 'rep-i'));
const ths = (h, id) => Array.prototype.map.call(card(h, id).querySelectorAll('th'), x => x.textContent);
const cvetiThs = (h, id) => ths(h, id).filter(t => t.indexOf('Цвети') >= 0);
/* Редовете с данни: по <td>, не по cells — cells съдържа и <th>. */
const dataRows = (h, id) => Array.prototype.filter.call(card(h, id).querySelectorAll('tr'),
  tr => tr.querySelectorAll('td').length > 1 && !tr.classList.contains('sd-done-toggle'));
const toggleRow = (h, id) => card(h, id).querySelector('tr.sd-done-toggle');
const resolveBtns = (h, id) => Array.prototype.filter.call(card(h, id).querySelectorAll('button'),
  x => /resolveDiffLine\(/.test(x.getAttribute('onclick') || ''));
const correctBtns = (h, id) => Array.prototype.filter.call(card(h, id).querySelectorAll('button'),
  x => /openSDCorrectModal\(/.test(x.getAttribute('onclick') || ''));

(async function run() {

  /* ── 1. Заглавният ред ──────────────────────────────────────────────────── */
  section('1. Междускладова → 0 <th> с „Цвети"; доставчикова → 2');
  {
    [['Цвети', CVETI], ['магазинът', PETRICH], ['складът', WAREHOUSE]].forEach(function (c) {
      const h = env(c[1], [line()], [REP_I], 'interstore');
      if (ok(c[0] + ': междускладовата карта е на екрана', !!card(h))) {
        ok(c[0] + ': нула <th> с „Цвети"', cvetiThs(h).length === 0, ths(h).join(' | '));
        ok(c[0] + ': последната колона е „Отговор на склада"',
          ths(h)[ths(h).length - 1] === 'Отговор на склада', ths(h).join(' | '));
      }
      h.close();
    });
  }
  {
    /* Обратната посока — иначе „нула колони" не доказва нищо. */
    const h = env(CVETI, [line({ id: 'l-s', report_id: 'rep-s', supplier: 'ТЕСИ ООД' })], [REP_S], 'supplier');
    if (ok('доставчиковата карта е на екрана', !!card(h, 'rep-s'))) {
      ok('доставчик: ТОЧНО 2 <th> с „Цвети"', cvetiThs(h, 'rep-s').length === 2, ths(h, 'rep-s').join(' | '));
      ok('доставчик: това са „Коментар (Цвети)" и „Решение (Цвети)"',
        cvetiThs(h, 'rep-s').join('|') === 'Коментар (Цвети)|Решение (Цвети)', cvetiThs(h, 'rep-s').join('|'));
    }
    h.close();
  }

  /* ── 2. Клетките следват главата ────────────────────────────────────────── */
  section('2. Броят <td> на реда съвпада с броя <th> — и в двете посоки');
  {
    const h = env(CVETI, [line()], [REP_I], 'interstore');
    const r = dataRows(h)[0];
    ok('междускладов: ред има', !!r);
    ok('междускладов: td = th', !!r && r.cells.length === ths(h).length,
      'td=' + (r && r.cells.length) + ' th=' + ths(h).length);
    /* SAP, Артикул, Категория, Кол. по док., Реално, Коментар (магазин),
       Снимки, Отговор на склада. */
    ok('междускладов: 8 колони', ths(h).length === 8, ths(h).join(' | '));
    h.close();
  }
  {
    const h = env(CVETI, [line({ id: 'l-s', report_id: 'rep-s', supplier: 'ТЕСИ ООД' })], [REP_S], 'supplier');
    const r = dataRows(h, 'rep-s')[0];
    ok('доставчик: td = th', !!r && r.cells.length === ths(h, 'rep-s').length,
      'td=' + (r && r.cells.length) + ' th=' + ths(h, 'rep-s').length);
    ok('доставчик: с 3 колони повече от междускладовата (По стокова + двете на Цвети)',
      ths(h, 'rep-s').length === 11, 'реално: ' + ths(h, 'rep-s').length);
    h.close();
  }

  /* ── 3. colspan на превключвателя следва ────────────────────────────────── */
  section('3. colspan на „✓ K приключени реда" = броят <th>, и в двете посоки');
  {
    const lines = [line({ id: 'l-1', status: 'received' }), line({ id: 'l-2', material_name: 'ВТОРИ' })];
    const h = env(CVETI, lines, [REP_I], 'interstore');
    const t = toggleRow(h);
    if (ok('междускладов: превключвателят е на екрана', !!t)) {
      ok('междускладов: colspan = брой th', t.cells[0].getAttribute('colspan') === String(ths(h).length),
        'colspan=' + t.cells[0].getAttribute('colspan') + ' th=' + ths(h).length);
    }
    h.close();
  }
  {
    const lines = [line({ id: 'l-s1', report_id: 'rep-s', supplier: 'ТЕСИ ООД', status: 'received' }),
                   line({ id: 'l-s2', report_id: 'rep-s', supplier: 'ТЕСИ ООД', material_name: 'ВТОРИ' })];
    const h = env(CVETI, lines, [REP_S], 'supplier');
    const t = toggleRow(h, 'rep-s');
    if (ok('доставчик: превключвателят е на екрана', !!t)) {
      ok('доставчик: colspan = брой th', t.cells[0].getAttribute('colspan') === String(ths(h, 'rep-s').length),
        'colspan=' + t.cells[0].getAttribute('colspan') + ' th=' + ths(h, 'rep-s').length);
    }
    h.close();
  }

  /* ── 4. Бутоните на Цвети ───────────────────────────────────────────────── */
  section('4. Цвети в междускладова бланка — нула бутона Заприх./Връщане/Липса');
  {
    const h = env(CVETI, [line()], [REP_I], 'interstore');
    ok('нула бутона resolveDiffLine', resolveBtns(h).length === 0,
      resolveBtns(h).map(x => x.textContent).join(' | '));
    ['Заприх', 'Връщане', 'Липса'].forEach(function (lbl) {
      ok('няма бутон „' + lbl + '"', allBtns(card(h), lbl).length === 0);
    });
    ok('няма и бутон 💬 (коментар на Цвети)',
      Array.prototype.filter.call(card(h).querySelectorAll('button'),
        x => /openSDModal\(/.test(x.getAttribute('onclick') || '')).length === 0);
    h.close();
  }
  {
    /* Обратната посока: при доставчикова бланка Цвети си ги има. */
    const h = env(CVETI, [line({ id: 'l-s', report_id: 'rep-s', supplier: 'ТЕСИ ООД' })], [REP_S], 'supplier');
    ok('доставчик: трите бутона са на място', resolveBtns(h, 'rep-s').length >= 3,
      'реално: ' + resolveBtns(h, 'rep-s').length);
    ok('доставчик: „Заприх." го има', allBtns(card(h, 'rep-s'), 'Заприх').length === 1);
    h.close();
  }

  /* ── 5. Бутонът за корекция на магазина оцелява ─────────────────────────── */
  section('5. „✏️ Коригирай" на магазина оцелява — мести се при артикула');
  {
    const h = env(PETRICH, [line()], [REP_I], 'interstore');
    const cb = correctBtns(h);
    if (ok('междускладов: бутонът за корекция Е на екрана', cb.length === 1, 'реално: ' + cb.length)) {
      const cell = cb[0].closest('td');
      const row = dataRows(h)[0];
      ok('и стои в клетката на АРТИКУЛА (втората)',
        !!cell && !!row && cell === row.cells[1],
        cell && cell.textContent);
    }
    h.close();
  }
  {
    /* При доставчикова бланка бутонът си остава там, където беше — в клетката
       на решението, тоест предпоследната. */
    const h = env(PETRICH, [line({ id: 'l-s', report_id: 'rep-s', store_name: 'Петрич', supplier: 'ТЕСИ ООД' })], [REP_S], 'supplier');
    const cb = correctBtns(h, 'rep-s');
    if (ok('доставчик: бутонът за корекция Е на екрана', cb.length === 1, 'реално: ' + cb.length)) {
      const row = dataRows(h, 'rep-s')[0];
      ok('и стои в клетката на решението (предпоследната)',
        cb[0].closest('td') === row.cells[row.cells.length - 2],
        cb[0].closest('td') && cb[0].closest('td').textContent);
    }
    h.close();
  }
  {
    /* Чужд магазин няма какво да коригира — правилото не се е разхлабило. */
    const h = env(WAREHOUSE, [line()], [REP_I], 'interstore');
    ok('складът НЯМА бутон за корекция', correctBtns(h).length === 0, 'реално: ' + correctBtns(h).length);
    h.close();
  }

  report();
})();
