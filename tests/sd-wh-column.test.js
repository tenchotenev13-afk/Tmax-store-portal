/* Разлики — „Отговор на склада" само там, където има склад (30.09.2026).

   Колоната носи бутоните на логистичния склад (междускладов поток). При
   бланка към доставчик и при сторно по грешен прием склад няма — там в нея
   вечно стоеше „чака склада" и само стесняваше таблицата.

   Правилото:
     · карта на бланка — междускладова: колоната винаги; доставчик/сторно: само
       ако поне един ред носи warehouse_response, store_response или размяна
       (иначе реални данни изчезват от екрана);
     · долната таблица и Excel — колоната само в подтаб „Междускладови";
     · colspan на „✓ N приключени реда" следва броя заглавия.

   Всяка проверка „няма колона" има обратна „има колона", за да не мине срещу
   празен екран.

   Пускане:  node tests/sd-wh-column.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn } = H;

const WH = 'Логистичен склад Търговище';
const COL = 'Отговор на склада';
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
const REP_W = rep({ id: 'rep-w', direction: 'wrong_receipt', counterpart: 'ТЕСИ ООД' });

const CVETI     = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
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
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all';
  h.w.sdStoreFilter = ''; h.w.sdSearch = ''; h.w.sdDirTab = dirTab;
  h.w.sdShowDone = {};
  h.w.invalidateStoreCaches(); h.w.invalidateSuppliersCache();
  h.cap = { aoas: [] };
  h.w.XLSX = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: aoa => { h.cap.aoas.push(aoa); return {}; },
      book_append_sheet: (wb, ws, n) => { wb.SheetNames.push(n); }
    },
    writeFile: () => {}
  };
  h.w.renderStockDiff();
  return h;
}

const card = (h, id) => h.doc.getElementById('diff-rep-' + id);
const ths = (h, id) => Array.prototype.map.call(card(h, id).querySelectorAll('th'), x => x.textContent.trim());
const dataRows = (h, id) => Array.prototype.filter.call(card(h, id).querySelectorAll('tr'),
  tr => tr.querySelectorAll('td').length > 1 && !tr.classList.contains('sd-done-toggle'));
const whBtns = (h, id) => Array.prototype.filter.call(card(h, id).querySelectorAll('button'),
  x => /openWarehouseResponseModal\(/.test(x.getAttribute('onclick') || ''));
/* Долната таблица — последната таблица в модула, която НЕ е в карта на бланка. */
function bottomTable(h) {
  const t = Array.prototype.filter.call(h.doc.querySelectorAll('#mod-stock-diff table'),
    x => !x.closest('[id^="diff-rep-"]'));
  return t[t.length - 1] || null;
}
const bottomThs = h => bottomTable(h)
  ? Array.prototype.map.call(bottomTable(h).querySelectorAll('th'), x => x.textContent.trim()) : [];
const bottomRow = h => bottomTable(h)
  ? Array.prototype.find.call(bottomTable(h).querySelectorAll('tr'), tr => tr.querySelector('td')) : null;
async function excel(h) {
  const b = btn(h.doc.getElementById('mod-stock-diff'), '📥 Excel');
  if (!b) return null;
  realClick(h.w, b);
  const aoa = h.cap.aoas[h.cap.aoas.length - 1];
  return aoa ? { head: aoa[0], rows: aoa.slice(1) } : null;
}

(async function run() {

  section('1. Карта на бланка към доставчик — без колоната');
  {
    const h = env(CVETI, [line({ id: 'l-s', report_id: 'rep-s', supplier: 'ТЕСИ ООД' })], [REP_S], 'supplier');
    if (ok('картата е на екрана', !!card(h, 'rep-s'))) {
      ok('няма <th> „' + COL + '"', ths(h, 'rep-s').indexOf(COL) < 0, ths(h, 'rep-s').join(' | '));
      ok('никъде не пише „чака склада"', card(h, 'rep-s').textContent.indexOf('чака склада') < 0);
      const r = dataRows(h, 'rep-s')[0];
      ok('td = th', !!r && r.cells.length === ths(h, 'rep-s').length,
        'td=' + (r && r.cells.length) + ' th=' + ths(h, 'rep-s').length);
    }
    h.close();
  }

  section('2. Сторно по грешен прием — също без колоната');
  {
    const h = env(CVETI, [line({ id: 'l-w', report_id: 'rep-w', supplier: 'ТЕСИ ООД' })], [REP_W], 'wrong_receipt');
    if (ok('картата е на екрана', !!card(h, 'rep-w'))) {
      ok('няма <th> „' + COL + '"', ths(h, 'rep-w').indexOf(COL) < 0, ths(h, 'rep-w').join(' | '));
      ok('никъде не пише „чака склада"', card(h, 'rep-w').textContent.indexOf('чака склада') < 0);
      const r = dataRows(h, 'rep-w')[0];
      ok('td = th', !!r && r.cells.length === ths(h, 'rep-w').length,
        'td=' + (r && r.cells.length) + ' th=' + ths(h, 'rep-w').length);
    }
    h.close();
  }

  section('3. Междускладова — колоната и бутоните на склада са там');
  {
    const h = env(CVETI, [line()], [REP_I], 'interstore');
    if (ok('картата е на екрана (Цвети)', !!card(h, 'rep-i'))) {
      ok('последната колона е „' + COL + '"', ths(h, 'rep-i')[ths(h, 'rep-i').length - 1] === COL, ths(h, 'rep-i').join(' | '));
      ok('Цвети вижда „чака склада"', card(h, 'rep-i').textContent.indexOf('чака склада') >= 0);
    }
    h.close();
    const hw = env(WAREHOUSE, [line()], [REP_I], 'interstore');
    if (ok('картата е на екрана (складът)', !!card(hw, 'rep-i'))) {
      ok('складът: колоната е там', ths(hw, 'rep-i').indexOf(COL) >= 0, ths(hw, 'rep-i').join(' | '));
      ok('складът: четирите му бутона са там', whBtns(hw, 'rep-i').length === 4,
        whBtns(hw, 'rep-i').map(b => b.textContent).join(' | '));
    }
    hw.close();
  }

  section('4. Доставчик с ред, който НОСИ данни за склада — колоната остава');
  [['warehouse_response', { warehouse_response: 'sent' }],
   ['store_response', { store_response: 'accepted' }]].forEach(function (c) {
    const h = env(CVETI, [line({ id: 'l-s', report_id: 'rep-s', supplier: 'ТЕСИ ООД' }),
      line(Object.assign({ id: 'l-s2', report_id: 'rep-s', supplier: 'ТЕСИ ООД', material_code: '000124' }, c[1]))],
      [REP_S], 'supplier');
    if (ok(c[0] + ': картата е на екрана', !!card(h, 'rep-s'))) {
      ok(c[0] + ': колоната е там', ths(h, 'rep-s').indexOf(COL) >= 0, ths(h, 'rep-s').join(' | '));
      const rs = dataRows(h, 'rep-s');
      ok(c[0] + ': всеки ред td = th', rs.length === 2 && rs.every(r => r.cells.length === ths(h, 'rep-s').length),
        rs.map(r => r.cells.length).join(',') + ' th=' + ths(h, 'rep-s').length);
    }
    h.close();
  });

  section('5. colspan на „приключени реда" = броя заглавия');
  [['доставчик', 'rep-s', REP_S, 'supplier'], ['сторно', 'rep-w', REP_W, 'wrong_receipt'],
   ['междускладова', 'rep-i', REP_I, 'interstore']].forEach(function (c) {
    const lines = [line({ id: 'x-1', report_id: c[1], supplier: 'ТЕСИ ООД' }),
      line({ id: 'x-2', report_id: c[1], supplier: 'ТЕСИ ООД', material_code: '000124',
        status: 'received', completed_by: 'Управител Петрич', completed_at: '2026-09-12T10:00:00.000Z' })];
    const h = env(CVETI, lines, [c[2]], c[3]);
    const tr = card(h, c[1]) && card(h, c[1]).querySelector('tr.sd-done-toggle');
    if (ok(c[0] + ': има ред „приключени"', !!tr)) {
      const n = ths(h, c[1]).length;
      ok(c[0] + ': colspan = ' + n, tr.cells[0].getAttribute('colspan') === String(n),
        'colspan=' + tr.cells[0].getAttribute('colspan') + ' th=' + n);
    }
    h.close();
  });

  section('6. Долната таблица и Excel');
  for (const c of [['Доставчици', 'rep-s', REP_S, 'supplier', false],
                   ['Сторна', 'rep-w', REP_W, 'wrong_receipt', false],
                   ['Междускладови', 'rep-i', REP_I, 'interstore', true]]) {
    const h = env(CVETI, [line({ id: 'b-1', report_id: c[1], supplier: 'ТЕСИ ООД', type: 'Липса', status: 'pending' })],
      [Object.assign({}, c[2], { reviewed: true })], c[3]);
    const bt = bottomThs(h);
    if (ok(c[0] + ': долната таблица е на екрана', bt.length > 0)) {
      ok(c[0] + ': колоната ' + (c[4] ? 'Е' : 'НЕ е') + ' в долната таблица', (bt.indexOf(COL) >= 0) === c[4], bt.join(' | '));
      const r = bottomRow(h);
      ok(c[0] + ': долу td = th', !!r && r.cells.length === bt.length, 'td=' + (r && r.cells.length) + ' th=' + bt.length);
    }
    const x = await excel(h);
    if (ok(c[0] + ': Excel изтеглен с 1 ред', !!x && x.rows.length === 1, x && x.rows.length)) {
      ok(c[0] + ': колоната ' + (c[4] ? 'Е' : 'НЕ е') + ' в Excel', (x.head.indexOf(COL) >= 0) === c[4], x.head.join(' | '));
      ok(c[0] + ': Excel ред = заглавия', x.rows[0].length === x.head.length, x.rows[0].length + ' / ' + x.head.length);
    }
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
