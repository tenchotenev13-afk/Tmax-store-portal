/* Разлики — компактната таблица „Решени редове“ (общият модел .tbl-compact).

   Обвивката е .tbl-wrap.tbl-compact.tbl-sd-compact: без вътрешен скрол и без
   влачене (enableDragScroll и .co-sticky-actions са махнати за тази таблица);
   под 1200px — хоризонтален скрол в кутията, от 1200px — закачен thead
   (общите правила на .tbl-compact). Ширините са по КЛАС на клетката (sd-c-*),
   не по :nth-child — „Склад · Магазин“ е само в „Междускладови“ и броят колони
   се мени по подтаб. Затова класовете се проверяват и в двата подтаба.

   jsdom не смята лейаут: CSS-ът се проверява като ТЕКСТ, а реалната ширина
   (без хоризонтален скрол на 1366) е измерена с Edge при разработката.
   scrollLeft/scrollTop са подменени с обикновени полета (jsdom ги държи 0).

   Пускане: node tests/sd-table-scroll.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const WH = 'Логистичен склад Търговище';
const clone = x => JSON.parse(JSON.stringify(x));
const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

function rep(o) {
  return Object.assign({
    id: 'rep-i', direction: 'interstore', store_name: 'Петрич', counterpart: WH,
    document_number: '4600', doc_date: '2026-09-10', submitted_by: 'Управител',
    general_comment: '', photos: [], reviewed: true, created_at: '2026-09-10T09:00:00.000Z'
  }, o);
}
function line(o) {
  return Object.assign({
    id: 'l-1', report_id: 'rep-i', store_name: 'Петрич', supplier: 'ТЕСИ ООД',
    material_code: '000123', material_name: 'ЩУЦЕР МЕТАЛЕН',
    quantity: 20, quantity_received: 0, quantity_supplier_doc: 20,
    order_number: '4500', return_order_number: null, confirmed_date: null, comment: 'к',
    resolution_comment: null, attachments: [], credit_note_issued: false,
    difference_category: 'undelivered', unit: 'бр.', status: 'pending', type: 'missing',
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null,
    store_corrected_at: null, warehouse_response: null, warehouse_comment: null,
    store_response: null, swap_id: null, created_at: '2026-09-10T09:00:00.000Z'
  }, o);
}
const REP_I = rep();
const REP_S = rep({ id: 'rep-s', direction: 'supplier', counterpart: 'ТЕСИ ООД' });

function env(dirTab) {
  const lines = dirTab === 'supplier' ? [line({ id: 'l-s', report_id: 'rep-s' })] : [line()];
  const reps = dirTab === 'supplier' ? [REP_S] : [REP_I];
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: CVETI, confirm: true,
    data: { stock_differences: lines, differences_reports: reps, stock_diff_swaps: [],
      stock_returns: [], transport_orders: [], users: [], stores: [{ name: 'Петрич' }], contacts: [{ name: 'ТЕСИ ООД' }] }
  });
  /* scrollLeft/scrollTop като обикновени полета на всеки div — иначе jsdom
     ги държи 0 и нито влаченето, нито пазенето при рендер се виждат. */
  ['scrollLeft', 'scrollTop'].forEach(p => {
    Object.defineProperty(h.w.HTMLDivElement.prototype, p, {
      configurable: true,
      get() { return this['_' + p] || 0; },
      set(v) { this['_' + p] = v; }
    });
  });
  h.w.sdData = clone(lines); h.w.diffReports = clone(reps); h.w.sdSwaps = []; h.w.transportOrders = [];
  h.w.sdView = 'rows'; /* изгледът „Редове" (таблицата) — подразбирането е „Бланки" */
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = dirTab; h.w.sdShowDone = {};
  h.w.invalidateStoreCaches(); h.w.invalidateSuppliersCache();
  h.w.renderStockDiff();
  return h;
}

const wrapEl = doc => doc.getElementById('sd-tbl-wrap');
function pe(w, target, type, x, over) {
  const ev = new w.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, clientX: x, clientY: 10, button: 0 }, over || {}));
  Object.defineProperty(ev, 'pointerType', { value: (over && over.pointerType) || 'mouse' });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  target.dispatchEvent(ev);
}
function drag(w, from, to, dx) {
  pe(w, from, 'pointerdown', 200);
  pe(w, from, 'pointermove', 200 + Math.round(dx / 2));
  pe(w, from, 'pointermove', 200 + dx);
  pe(w, to || from, 'pointerup', 200 + dx);
}
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
function wireRow(w, tr) {
  Array.prototype.forEach.call(tr.querySelectorAll('[onclick]'), el => {
    const fn = w.eval('(function(event){' + el.getAttribute('onclick') + '})');
    el.addEventListener('click', e => fn.call(el, e));
  });
}
const firstRow = doc => wrapEl(doc).querySelector('tbody tr');
const editBtn = tr => Array.prototype.find.call(tr.querySelectorAll('td.sd-c-act button'), b => b.textContent.trim() === '✏️');

(async function run() {

  section('1. CSS за .tbl-sd-compact в index.html (като текст)');
  {
    const h = env('interstore');
    const css = Array.prototype.map.call(h.doc.querySelectorAll('style'), s => s.textContent).join('\n');
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const has = (label, re) => ok(label, re.test(css), String(re));
    has('ширина по клас: Магазин · Доставчик', /\.tbl-sd-compact th\.sd-c-who\{width:\d+px;\}/);
    has('ширина по клас: Кол.', /\.tbl-sd-compact th\.sd-c-qty\{width:\d+px;\}/);
    has('ширина по клас: Поръчки', /\.tbl-sd-compact th\.sd-c-ord\{width:\d+px;\}/);
    has('ширина по клас: Статус · Кредитно', /\.tbl-sd-compact th\.sd-c-status\{width:\d+px;\}/);
    has('ширина по клас: Склад · Магазин', /\.tbl-sd-compact th\.sd-c-wh\{width:\d+px;\}/);
    has('ширина по клас: Действия', /\.tbl-sd-compact th\.sd-c-act\{width:\d+px;\}/);
    has('минимална ширина за хоризонтален скрол под 1200px', /\.tbl-sd-compact table\{min-width:\d+px;\}/);
    ok('няма :nth-child за .tbl-sd-compact (без коментарите)', !/\.tbl-sd-compact[^{}]*nth-child/.test(bare));
    ok('старите правила за .tbl-sd (sticky Тип/Магазин) са махнати',
      !/\.tbl-sd[ .]/.test(bare) && !/sd-c-(type|store|sup|code|name|rord|date|credit|photo|ctl)\b/.test(bare));
    has('общият модел .tbl-compact: закачен thead от 1200px', /@media\(min-width:1200px\)\{[\s\S]*?\.tbl-compact thead th\{position:sticky;/);
    h.close();
  }

  section('2. Обвивката: .tbl-compact, без co-sticky-actions и без влачене');
  {
    const h = env('interstore');
    const el = wrapEl(h.doc);
    ok('обвивката е .tbl-wrap.tbl-compact.tbl-sd-compact', !!el && ['tbl-wrap', 'tbl-compact', 'tbl-sd-compact'].every(c => el.classList.contains(c)), el && el.className);
    ok('няма .co-sticky-actions', !!el && !el.classList.contains('co-sticky-actions'));
    ok('таблицата вътре е .tbl-sd', !!el && !!el.querySelector('table.tbl-sd'));
    ok('id sd-rows е на tbody', !!el && !!el.querySelector('tbody#sd-rows'));
    ok('без inline min-width/overflow (идват от класа)', !!el && !/overflow|min-width/.test(el.getAttribute('style') + el.querySelector('table').getAttribute('style')), el && el.getAttribute('style'));
    ok('enableDragScroll НЕ е закачен', !!el && !el._dragScroll);
    h.w.renderStockDiff();
    ok('и след повторен рендер', !wrapEl(h.doc)._dragScroll);
    ok('картите на бланките не са засегнати', !h.doc.querySelector('.tbl-sd-compact [id^="diff-rep-"]'));
    h.close();
  }

  section('3. Класовете на клетките — и в двата подтаба');
  for (const [tab, withWh] of [['supplier', false], ['interstore', true]]) {
    const h = env(tab);
    const ths = Array.prototype.map.call(wrapEl(h.doc).querySelectorAll('thead th'), t => [t.textContent.trim(), t.className]);
    const tds = Array.prototype.map.call(firstRow(h.doc).cells, td => td.className);
    const want = [['Тип · Артикул', 'sd-c-item'], ['Магазин · Доставчик', 'sd-c-who'], ['Кол.', 'sd-c-qty'], ['Поръчки', 'sd-c-ord'],
      ['Статус · Кредитно', 'sd-c-status'], ['Коментари · Файлове', 'sd-c-cmt']].concat(withWh ? [['Склад · Магазин', 'sd-c-wh']] : []).concat([['Действия', 'sd-c-act']]);
    ok(tab + ': ' + want.length + ' колони, заглавие ↔ клас на th', JSON.stringify(ths) === JSON.stringify(want), JSON.stringify(ths));
    ok(tab + ': td-тата носят същите класове в същия ред', JSON.stringify(tds) === JSON.stringify(want.map(x => x[1])), JSON.stringify(tds));
    ok(tab + ': последната клетка е с бутоните', firstRow(h.doc).lastElementChild.className === 'sd-c-act' && !!editBtn(firstRow(h.doc)));
    h.close();
  }

  section('4. Бутонът „✏️“ в „Действия“ отваря точно този ред');
  {
    const h = env('interstore');
    const tr = firstRow(h.doc);
    wireRow(h.w, tr);
    click(h.w, editBtn(tr));
    ok('„✏️" отваря модала', !!h.doc.getElementById('sd-ov'));
    ok('и отваря точно този ред', h.w.sdEditId === 'l-1', h.w.sdEditId);
    h.close();
  }

  section('5. Позицията на скрола се пази при повторен рендер');
  {
    const h = env('interstore');
    const el = wrapEl(h.doc);
    el.scrollLeft = 333; el.scrollTop = 77;
    h.w.renderStockDiff();
    const el2 = wrapEl(h.doc);
    ok('новата обвивка е друг елемент', el2 !== el);
    ok('scrollLeft/scrollTop са пренесени (333/77)', el2.scrollLeft === 333 && el2.scrollTop === 77, el2.scrollLeft + '/' + el2.scrollTop);
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
