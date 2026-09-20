/* Разлики — приключените редове в бланката се свиват.

   Бланка с 20 реда, от които 17 вече приключени, караше човека да търси трите,
   по които още се работи. Затова редовете със status='received' се скриват, а
   над таблицата стои един ред: „✓ K приключени реда — [покажи]".

   ДВЕ условия, и второто е по-важното:
     · има и НЕприключени редове — бланка, в която всичко е приключено, се
       показва ЦЯЛА, иначе картата излиза празна и няма какво да се отвори;
     · превключвателят се рендира при K≥1 ВИНАГИ, включително разгънато
       (правило 11) — иначе разгъването е еднопосочно и няма връщане.

   colspan се брои от заглавния ред, не е заковано число: посоката „доставчик"
   има колона повече („По стокова") и заковано 10 би оставило реда къс тихо.

   Свиването е чисто рендер — нула заявки към мрежата.

   Пускане:  node tests/sd-done-collapse.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

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
    id: 'l-x', report_id: 'rep-i', store_name: 'Петрич', supplier: null,
    material_code: '000123', material_name: 'АРТИКУЛ',
    quantity: 20, quantity_received: 0, quantity_supplier_doc: null,
    order_number: null, confirmed_date: null, comment: null,
    resolution_comment: null, attachments: [], credit_note_issued: false,
    difference_category: 'undelivered', unit: 'бр.', status: 'new', type: null,
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null,
    store_corrected_at: null, warehouse_response: null, warehouse_comment: null,
    store_response: null, store_response_by: null, store_response_at: null,
    store_response_comment: null, swap_id: null, created_at: '2026-09-10T09:00:00.000Z'
  }, o);
}
/* n реда, първите `done` на брой приключени. Имената са различими, за да се
   брои по РЕДОВЕ, а не по текст. */
function mkLines(n, done, over) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push(line(Object.assign({
      id: 'l-' + i, material_code: '10' + i, material_name: 'АРТИКУЛ-' + i,
      status: i <= done ? 'received' : 'new',
      completed_by: i <= done ? 'Управител Петрич' : null,
      completed_at: i <= done ? '2026-09-12T10:00:00.000Z' : null
    }, over || {})));
  }
  return out;
}

const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище', role: 'sklad', store_name: WH, assigned_stores: [] };

function env(lines, opts) {
  opts = opts || {};
  const reports = opts.reports || [rep()];
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: opts.user || WAREHOUSE, confirm: true,
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
  h.w.sdStoreFilter = ''; h.w.sdSearch = ''; h.w.sdDirTab = opts.dirTab || 'interstore';
  h.w.sdShowDone = {};
  h.w.invalidateStoreCaches(); h.w.invalidateSuppliersCache();
  return h;
}

const card = (h, id) => h.doc.getElementById('diff-rep-' + (id || 'rep-i'));
/* Редовете с артикули. Броят се по <td>, НЕ по tr.cells: cells съдържа и
   <th>, тоест заглавният ред би се броил като данни и всяко число щеше да е
   с едно нагоре. Редът на превключвателя има един <td> и клас. */
const dataRows = (h, id) => {
  const c = card(h, id);
  if (!c) return [];
  return Array.prototype.filter.call(c.querySelectorAll('tr'), tr =>
    tr.querySelectorAll('td').length > 1 && !tr.classList.contains('sd-done-toggle'));
};
const toggleRow = (h, id) => { const c = card(h, id); return c && c.querySelector('tr.sd-done-toggle'); };
const netCount = h => h.calls.get.length + h.calls.post.length + h.calls.patch.length + h.calls.del.length;
/* Клик, който при ЛИПСВАЩ бутон дава ❌, вместо да убие процеса — виж
   анти-тавтологичния пуск срещу стария код, където превключвател няма. */
const clickOr = (h, el, label) => {
  if (!ok(label, !!el)) return false;
  realClick(h.w, el);
  return true;
};
const settle = async () => { await ticks(); await ticks(); };

(async function run() {

  /* ── 1. Основният случай ────────────────────────────────────────────────── */
  section('1. 5 реда, 2 приключени → 3 видими + превключвател');
  {
    const h = env(mkLines(5, 2));
    h.w.renderStockDiff();
    ok('3 видими реда', dataRows(h).length === 3, 'реално: ' + dataRows(h).length);
    const t = toggleRow(h);
    if (ok('превключвателят е на екрана', !!t)) {
      ok('казва колко са', /✓ 2 приключени реда/.test(t.textContent), t.textContent);
      ok('бутонът пише „покажи"', !!btn(t, 'покажи'), t.textContent);
    }
    ok('приключените ги няма', card(h).textContent.indexOf('АРТИКУЛ-1') < 0, card(h).textContent);
    ok('неприключените ги има', card(h).textContent.indexOf('АРТИКУЛ-3') >= 0);
    h.close();
  }

  section('2. Клик „покажи" → 5 видими и бутонът става „скрий"; втори клик → пак 3');
  {
    const h = env(mkLines(5, 2));
    h.w.renderStockDiff();
    const before = netCount(h);
    clickOr(h, toggleRow(h) && btn(toggleRow(h), 'покажи'), 'има какво да се разгъне');
    await settle();
    ok('5 видими реда', dataRows(h).length === 5, 'реално: ' + dataRows(h).length);
    ok('приключеният вече се вижда', card(h).textContent.indexOf('АРТИКУЛ-1') >= 0);
    const t = toggleRow(h);
    if (ok('превключвателят ОСТАВА при разгънато', !!t, card(h).textContent.slice(0, 200))) {
      ok('бутонът пише „скрий"', !!btn(t, 'скрий'), t.textContent);
      ok('броят пак е верен', /✓ 2 приключени реда/.test(t.textContent), t.textContent);
    }
    ok('свиването е чист рендер — нула заявки', netCount(h) === before,
      'реално: ' + (netCount(h) - before));

    clickOr(h, toggleRow(h) && btn(toggleRow(h), 'скрий'), 'има какво да се свие обратно');
    await settle();
    ok('втори клик връща на 3', dataRows(h).length === 3, 'реално: ' + dataRows(h).length);
    ok('и бутонът пак е „покажи"', !!btn(toggleRow(h), 'покажи'));
    h.close();
  }

  /* ── 3. Границите ───────────────────────────────────────────────────────── */
  section('3. Граници: 1 приключен, 0 приключени, всички приключени');
  {
    const h = env(mkLines(5, 1));
    h.w.renderStockDiff();
    const t1 = toggleRow(h);
    ok('K=1 → превключвателят го има', !!t1);
    ok('K=1 → „✓ 1 приключени реда"', !!t1 && /✓ 1 приключени реда/.test(t1.textContent), t1 && t1.textContent);
    ok('K=1 → 4 видими', dataRows(h).length === 4, 'реално: ' + dataRows(h).length);
    h.close();
  }
  {
    const h = env(mkLines(5, 0));
    h.w.renderStockDiff();
    ok('K=0 → няма превключвател', !toggleRow(h));
    ok('K=0 → всичките 5 се виждат', dataRows(h).length === 5, 'реално: ' + dataRows(h).length);
    h.close();
  }
  {
    /* Изцяло приключена бланка се показва ЦЯЛА — иначе картата излиза празна. */
    const h = env(mkLines(5, 5));
    h.w.renderStockDiff();
    ok('всички приключени → 5 видими', dataRows(h).length === 5, 'реално: ' + dataRows(h).length);
    ok('всички приключени → БЕЗ превключвател', !toggleRow(h),
      toggleRow(h) && toggleRow(h).textContent);
    h.close();
  }

  /* ── 4. colspan ─────────────────────────────────────────────────────────── */
  section('4. colspan = реалният брой <th> за посоката');
  {
    const h = env(mkLines(4, 2));
    h.w.renderStockDiff();
    const c = card(h);
    const ths = c.querySelectorAll('th').length;
    const tr = toggleRow(h);
    if (ok('междускладова: има ред на превключвателя', !!tr)) {
      const td = tr.cells[0];
      ok('междускладова: colspan съвпада с броя th', String(ths) === td.getAttribute('colspan'),
        'th=' + ths + ' colspan=' + td.getAttribute('colspan'));
    }
    h.close();
  }
  {
    /* Доставчиковата посока има колона „По стокова" повече — ако числото беше
       заковано, редът щеше да е къс точно тук и никъде другаде. */
    const REP_S = rep({ id: 'rep-s', direction: 'supplier', counterpart: 'ТЕСИ ООД' });
    const lines = mkLines(4, 2, { report_id: 'rep-s', supplier: 'ТЕСИ ООД' });
    /* Складът вижда САМО междускладови бланки към себе си — доставковата
       посока е на Цвети, затова тук потребителят е друг. */
    const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
    const h = env(lines, { reports: [REP_S], dirTab: 'supplier', user: CVETI });
    h.w.renderStockDiff();
    const c = card(h, 'rep-s');
    if (ok('доставковата карта е на екрана', !!c)) {
      const ths = c.querySelectorAll('th').length;
      const tr = toggleRow(h, 'rep-s');
      if (ok('доставчик: има ред на превключвателя', !!tr)) {
        const td = tr.cells[0];
        ok('доставчик: colspan съвпада с броя th', String(ths) === td.getAttribute('colspan'),
          'th=' + ths + ' colspan=' + td.getAttribute('colspan'));
      }
      ok('и е с ЕДНА колона повече от междускладовата', ths === 11, 'реално: ' + ths);
    }
    h.close();
  }

  /* ── 5. Паметта е по бланка ─────────────────────────────────────────────── */
  section('5. Изборът се помни поотделно за всяка бланка');
  {
    const REP_A = rep({ id: 'rep-a' });
    const REP_B = rep({ id: 'rep-b', store_name: 'Гоце Делчев' });
    const lines = mkLines(4, 2).map(l => Object.assign({}, l, { report_id: 'rep-a' }))
      .concat(mkLines(4, 2).map(l => Object.assign({}, l, { id: 'b-' + l.id, report_id: 'rep-b' })));
    const h = env(lines, { reports: [REP_A, REP_B] });
    h.w.renderStockDiff();
    ok('и двете са свити', dataRows(h, 'rep-a').length === 2 && dataRows(h, 'rep-b').length === 2,
      dataRows(h, 'rep-a').length + '|' + dataRows(h, 'rep-b').length);
    clickOr(h, toggleRow(h, 'rep-a') && btn(toggleRow(h, 'rep-a'), 'покажи'), 'първата бланка има превключвател');
    await settle();
    ok('разгъната е САМО първата', dataRows(h, 'rep-a').length === 4 && dataRows(h, 'rep-b').length === 2,
      dataRows(h, 'rep-a').length + '|' + dataRows(h, 'rep-b').length);
    h.close();
  }

  report();
})();
