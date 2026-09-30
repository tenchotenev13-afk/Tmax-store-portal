/* Междускладов ред: път „Изпратено по система“ (sent_sap -> sap_accepted) и
   нулиране на store_response при НЕСЪВМЕСТНА смяна на отговора на склада.
   Случаят Троян: sent -> return при store_response='sap_done' е съвместим и
   sap_done се пази.
   Пускане:  node tests/sd-sent-sap.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, btnExact, ticks } = H;

const REP_INT = {
  id: 'rep-int', direction: 'interstore', store_name: 'Петрич',
  counterpart: 'Логистичен склад Търговище', document_number: '180491138',
  doc_date: '2026-09-10', submitted_by: 'Управител Петрич', general_comment: '',
  photos: [], reviewed: false, created_at: '2026-09-10T09:00:00.000Z'
};
const REP_SUP = {
  id: 'rep-sup', direction: 'supplier', store_name: 'Петрич',
  counterpart: 'ТЕСИ ООД', document_number: '180489966', doc_date: '2026-09-09',
  submitted_by: 'Управител Петрич', general_comment: '', photos: [],
  reviewed: false, created_at: '2026-09-09T09:00:00.000Z'
};

function line(o) {
  return Object.assign({
    store_name: 'Петрич', supplier: null, report_id: 'rep-int',
    material_code: '34989', material_name: 'ЩУЦЕР МЕТАЛЕН',
    quantity: 10, quantity_received: 8, quantity_supplier_doc: null,
    order_number: null, confirmed_date: null, comment: null,
    resolution_comment: null, attachments: [], credit_note_issued: false,
    difference_category: 'shortage', unit: 'бр.', status: 'new', type: null,
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null,
    store_corrected_at: null, warehouse_response: null, warehouse_comment: null,
    store_response: null, store_response_by: null, store_response_at: null,
    store_response_comment: null
  }, o);
}

const WAREHOUSE = {
  email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
  role: 'sklad', store_name: 'Логистичен склад Търговище', assigned_stores: []
};
const STORE = {
  email: 'petrich@temax.bg', display_name: 'Управител Петрич',
  role: 'manager', store_name: 'Петрич', assigned_stores: []
};
/* Цвети: admin без Петрич в assigned_stores - не е "магазинът". */
const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: []
};

function env(user, lines, opts) {
  opts = opts || {};
  const reports = opts.reports || [REP_INT, REP_SUP];
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user,
    confirm: true,
    data: {
      stock_differences: lines, differences_reports: reports,
      stock_returns: [], transport_orders: [], users: [],
      stores: [{ name: 'Петрич' }, { name: 'Логистичен склад Търговище' }],
      contacts: [{ name: 'ТЕСИ ООД' }]
    }
  });
  h.w.sdData = JSON.parse(JSON.stringify(lines));
  h.w.diffReports = JSON.parse(JSON.stringify(reports));
  h.w.transportOrders = [];
  h.w.sdFilter = 'pending';
  h.w.sdTypeFilter = 'all';
  h.w.sdStoreFilter = '';
  h.w.sdSearch = '';
  h.w.sdDirTab = opts.dirTab || 'interstore';
  h.w.invalidateStoreCaches();
  h.w.invalidateSuppliersCache();
  return h;
}

const card = (doc, id) => doc.getElementById('diff-rep-' + (id || 'rep-int'));
/* Редовете на картата: [0] е заглавието на таблицата. */
const lineRow = (c, i) => c.querySelectorAll('table tr')[1 + (i || 0)];
/* Последната клетка = "Отговор на склада" + потвърждението под него. */
const respCell = (c, i) => { const r = lineRow(c, i); return r.cells[r.cells.length - 1]; };
const btnTexts = el => Array.prototype.map.call(el.querySelectorAll('button'), b => b.textContent.trim());
const sdPatches = h => h.calls.patch.filter(p => p.table === 'stock_differences');
const ISO = /^\d{4}-\d{2}-\d{2}T/;

const ACCEPT = '✅ ПРИЕТО';
const SAP = '📄 ПУСНАТО В SAP';
const NOSTOCK = '⛔ НЯМА НАЛИЧНОСТ В ЛОГИСТИКА';
const BACK = '📬 Прието обратно';
const OLD = '✅ Получено';


const SAPACC = '📄 ПРИЕТО В SAP';
const whClick = async (h, cell, val, label) => {
  realClick(h.w, cell.querySelector('button[data-val="' + val + '"]'));
  await ticks();
  const ov = h.doc.getElementById('whr-ov');
  realClick(h.w, ov.querySelector('button[data-val="' + val + '"][onclick^="submitWarehouseResponse"]'));
  await ticks(); await ticks();
};

(async function () {

  section('1. Магазин, sent_sap — "ПРИЕТО В SAP" записва received + sap_accepted');
  {
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'sent_sap' })]);
    h.w.renderStockDiff();
    const c = card(h.doc), cell = respCell(c);
    ok('има "' + SAPACC + '"', !!btn(cell, SAPACC), btnTexts(cell).join(' | '));
    ok('няма "' + ACCEPT + '"', !btn(c, ACCEPT));
    realClick(h.w, btn(cell, SAPACC));
    await ticks(); await ticks();
    const p = sdPatches(h);
    if (ok('един PATCH', p.length === 1)) {
      const b = p[0].body;
      ok('status=received', b.status === 'received');
      ok('store_response=sap_accepted', b.store_response === 'sap_accepted', JSON.stringify(b));
      ok('store_response_by/at', b.store_response_by === 'Управител Петрич' && ISO.test(b.store_response_at || ''));
      ok('completed_at = store_response_at', b.completed_at === b.store_response_at);
    }
    ok('бланката се затваря', h.calls.patch.some(x => x.table === 'differences_reports' && x.body.reviewed === true));
  }

  section('1б. Две линии - бланката НЕ се затваря, докато има отворен ред');
  {
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'sent_sap' }), line({ id: 'l-2', warehouse_response: 'sent_sap' })]);
    h.w.renderStockDiff();
    realClick(h.w, btn(respCell(card(h.doc), 0), SAPACC));
    await ticks(); await ticks();
    ok('един ред PATCH', sdPatches(h).length === 1);
    ok('бланката не е затворена', !h.calls.patch.some(x => x.table === 'differences_reports'));
  }

  section('2. Склад и admin при sent_sap - само текст, без бутон');
  {
    for (const [name, u] of [['склад', WAREHOUSE], ['admin', CVETI]]) {
      const h = env(u, [line({ id: 'l-1', warehouse_response: 'sent_sap' })]);
      h.w.renderStockDiff();
      const cell = respCell(card(h.doc));
      ok(name + ': няма "' + SAPACC + '"', !btn(cell, SAPACC), btnTexts(cell).join(' | '));
      ok(name + ': няма "' + ACCEPT + '"', !btn(cell, ACCEPT));
      ok(name + ': етикет „Изпратено по система“ (без суров текст)',
        cell.textContent.indexOf('Изпратено по система') >= 0 && cell.textContent.indexOf('sent_sap') < 0, cell.textContent);
    }
    const h = env(WAREHOUSE, [line({ id: 'l-1', warehouse_response: 'sent_sap', store_response: 'sap_accepted', store_response_by: 'Иван' })]);
    h.w.renderStockDiff();
    ok('sap_accepted -> „Прието в SAP“', respCell(card(h.doc)).textContent.indexOf('Прието в SAP') >= 0);
  }

  section('2б. Складът има 4-ти бутон');
  {
    const h = env(WAREHOUSE, [line({ id: 'l-1' })]);
    h.w.renderStockDiff();
    ok('бутон „📄 Изпратено по система“', !!btn(respCell(card(h.doc)), '📄 Изпратено по система'), btnTexts(respCell(card(h.doc))).join(' | '));
  }

  section('3. Троян: sent -> return при sap_done - sap_done се пази');
  {
    const h = env(WAREHOUSE, [line({ id: 'l-1', warehouse_response: 'sent', store_response: 'sap_done', store_response_by: 'Иван', store_response_at: '2026-09-20T10:00:00.000Z' })]);
    h.w.renderStockDiff();
    await whClick(h, respCell(card(h.doc)), 'return');
    const p = sdPatches(h);
    if (ok('един PATCH', p.length === 1)) {
      const b = p[0].body;
      ok('warehouse_response=return', b.warehouse_response === 'return');
      ok('store_response НЕ се пипа', !('store_response' in b), Object.keys(b).join(','));
    }
    h.w.sdData[0].warehouse_response = 'return';
    h.w.renderStockDiff();
    ok('складът вижда „📬 Прието обратно“', !!btn(respCell(card(h.doc)), BACK));
  }

  section('4. return -> sent при sap_done - нулира се; магазинът вижда ПРИЕТО');
  {
    const h = env(WAREHOUSE, [line({ id: 'l-1', warehouse_response: 'return', store_response: 'sap_done', store_response_by: 'Иван', store_response_at: '2026-09-20T10:00:00.000Z', store_response_comment: 'x' })]);
    h.w.renderStockDiff();
    await whClick(h, respCell(card(h.doc)), 'sent');
    const b = sdPatches(h)[0].body;
    ok('store_response=null + by/at/comment', b.store_response === null && b.store_response_by === null &&
      b.store_response_at === null && b.store_response_comment === null, JSON.stringify(b));
    const h2 = env(STORE, [line({ id: 'l-1', warehouse_response: 'sent' })]);
    h2.w.renderStockDiff();
    ok('магазинът вижда ✅ ПРИЕТО', !!btn(respCell(card(h2.doc)), ACCEPT));
  }

  section('5. sent -> sent_sap при accepted - нулира се; no_stock: return -> sent_sap нулира');
  {
    const h = env(WAREHOUSE, [line({ id: 'l-1', warehouse_response: 'sent', store_response: 'accepted' })]);
    h.w.renderStockDiff();
    await whClick(h, respCell(card(h.doc)), 'sent_sap');
    const b = sdPatches(h)[0].body;
    ok('warehouse_response=sent_sap', b.warehouse_response === 'sent_sap');
    ok('store_response=null', b.store_response === null, JSON.stringify(b));
    const h2 = env(WAREHOUSE, [line({ id: 'l-1', warehouse_response: 'return', store_response: 'no_stock' })]);
    h2.w.renderStockDiff();
    await whClick(h2, respCell(card(h2.doc)), 'sent_sap');
    ok('no_stock -> sent_sap нулира', sdPatches(h2)[0].body.store_response === null);
    const h3 = env(WAREHOUSE, [line({ id: 'l-1', warehouse_response: 'sent', store_response: null })]);
    h3.w.renderStockDiff();
    await whClick(h3, respCell(card(h3.doc)), 'return');
    ok('без store_response - само warehouse полетата', !('store_response' in sdPatches(h3)[0].body));
  }

  section('6. Бройка за непрегледани: sent_sap се брои като sent');
  {
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'sent_sap' })]);
    const n = h.w.sdUnreviewedCountFor(JSON.parse(JSON.stringify([REP_INT])), h.w.sdData);
    ok('брои 1', n === 1, String(n));
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
