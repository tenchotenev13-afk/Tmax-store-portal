/* Разлики — таблицата на решените като в Транспорт / Клиентски заявки.

   Обвивката е .tbl-wrap.co-sticky-actions (скролът е в нея, лентата винаги
   долу на екрана), таблицата е .tbl-sd, влаченето е enableDragScroll от
   shared.js. Закачени: заглавията, „Магазин" вляво (на широк екран и „Тип"
   преди него), бутоните вдясно.

   Разликата спрямо .tbl-tr/.tbl-co: закачването и ширините са по КЛАС на
   клетката (sd-c-*), не по :nth-child — „Отговор на склада" е само в
   „Междускладови" и броят колони се мени по подтаб. Затова класовете се
   проверяват и в двата подтаба.

   jsdom не смята лейаут: CSS-ът се проверява като ТЕКСТ, а залепването и
   ширините са измерени в Chrome при разработката (30.09.2026: при 1400px
   „Тип" 160px побира и най-широкия бадж 131px, „Магазин" стои на 160px,
   бутоните вдясно; при 375px „Тип" се скролва, „Магазин" стои на 0).
   scrollLeft/scrollTop са подменени с обикновени полета (jsdom ги държи 0),
   а inline onclick-ите в реда се закачат като истински listener-и — както
   в tests/table-scroll.test.js.

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

  section('1. CSS за .tbl-sd в index.html (като текст)');
  {
    const h = env('interstore');
    const css = Array.prototype.map.call(h.doc.querySelectorAll('style'), s => s.textContent).join('\n');
    const has = (label, re) => ok(label, re.test(css), String(re));
    has('nowrap: Кол./Поръчка/Поръчка за връщане/Дата/Статус/Кредитно',
      /\.tbl-sd \.sd-c-qty,\.tbl-sd \.sd-c-ord,\.tbl-sd \.sd-c-rord,\.tbl-sd \.sd-c-date,\.tbl-sd \.sd-c-status,\.tbl-sd \.sd-c-credit\{white-space:nowrap;\}/);
    has('Наименование/Коментар/Контролер/Склад: пренасят се, 160–260px',
      /\.tbl-sd td\.sd-c-name,\.tbl-sd td\.sd-c-cmt,\.tbl-sd td\.sd-c-ctl,\.tbl-sd td\.sd-c-wh\{width:260px;min-width:160px;max-width:260px;white-space:normal;\}/);
    has('Магазин закачен вляво: td наследява фона на реда',
      /\.tbl-sd td\.sd-c-store\{position:sticky;left:0;z-index:1;background:inherit;box-shadow:6px 0 6px -6px/);
    has('Магазин закачен вляво: th със z-index:3', /\.tbl-sd th\.sd-c-store\{position:sticky;left:0;z-index:3;/);
    has('Тип фиксиран на 160px', /\.tbl-sd th\.sd-c-type,\.tbl-sd td\.sd-c-type\{box-sizing:border-box;width:160px;min-width:160px;max-width:160px;\}/);
    has('широк екран: Тип закачен на left:0',
      /@media\(min-width:768px\)\{[\s\S]*?\.tbl-sd td\.sd-c-type\{position:sticky;left:0;z-index:1;background:inherit;\}/);
    has('широк екран: Магазин на left:160px',
      /@media\(min-width:768px\)\{[\s\S]*?\.tbl-sd th\.sd-c-store,\.tbl-sd td\.sd-c-store\{left:160px;\}/);
    ok('няма :nth-child за .tbl-sd (без коментарите)',
      !/\.tbl-sd[^{}]*nth-child/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')));
    /* Общите правила, които .tbl-sd наследява — редът е плътен, бутоните закачени. */
    has('редът е плътно бял (.co-sticky-actions)', /\.co-sticky-actions tbody tr\{background:#fff;\}/);
    has('бутоните вдясно наследяват фона', /\.co-sticky-actions table td:last-child\{z-index:1;background:inherit;\}/);
    ok('.tbl-sd не е с твърд background:#fff в закачена td',
      !/\.tbl-sd td[^{]*\{[^}]*background:#fff/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')));
    h.close();
  }

  section('2. Обвивката и enableDragScroll');
  {
    const h = env('interstore');
    const el = wrapEl(h.doc);
    ok('обвивката е .tbl-wrap.co-sticky-actions', !!el && el.classList.contains('tbl-wrap') && el.classList.contains('co-sticky-actions'));
    ok('таблицата вътре е .tbl-sd', !!el && !!el.querySelector('table.tbl-sd'));
    ok('без inline min-width/overflow (идват от класа)', !!el && !/overflow|min-width/.test(el.getAttribute('style') + el.querySelector('table').getAttribute('style')),
      el && el.getAttribute('style'));
    ok('enableDragScroll е закачен след рендер', !!el && el._dragScroll === true);
    h.w.renderStockDiff();
    ok('и след повторен рендер — на новата обвивка', wrapEl(h.doc)._dragScroll === true);
    ok('картите на бланките не са засегнати (не са в .co-sticky-actions)',
      !h.doc.querySelector('.co-sticky-actions [id^="diff-rep-"]'));
    h.close();
  }

  section('3. Класовете на клетките — и в двата подтаба');
  for (const [tab, withWh] of [['supplier', false], ['interstore', true]]) {
    const h = env(tab);
    const ths = Array.prototype.map.call(wrapEl(h.doc).querySelectorAll('thead th'), t => [t.textContent.trim(), t.className]);
    const tds = Array.prototype.map.call(firstRow(h.doc).cells, td => td.className);
    const want = [['Тип', 'sd-c-type'], ['Магазин', 'sd-c-store'], ['Доставчик', 'sd-c-sup'], ['Материал', 'sd-c-code'],
      ['Наименование', 'sd-c-name'], ['Кол.', 'sd-c-qty'], ['Поръчка', 'sd-c-ord'], ['Поръчка за връщане', 'sd-c-rord'],
      ['Дата потвърд.', 'sd-c-date'], ['Статус', 'sd-c-status'], ['Кредитно', 'sd-c-credit'], ['Снимки', 'sd-c-photo'],
      ['Коментар', 'sd-c-cmt'], ['Коментар Контролер', 'sd-c-ctl']].concat(withWh ? [['Отговор на склада', 'sd-c-wh']] : []).concat([['', 'sd-c-act']]);
    ok(tab + ': заглавие ↔ клас на th', JSON.stringify(ths) === JSON.stringify(want), JSON.stringify(ths));
    ok(tab + ': td-тата носят същите класове в същия ред', JSON.stringify(tds) === JSON.stringify(want.map(x => x[1])), JSON.stringify(tds));
    ok(tab + ': последната клетка (закачената) е с бутоните', firstRow(h.doc).lastElementChild.className === 'sd-c-act' && !!editBtn(firstRow(h.doc)));
    h.close();
  }

  section('4. Влачене мести scrollLeft; клик в закачената колона работи');
  {
    const h = env('interstore');
    const el = wrapEl(h.doc);
    el.scrollLeft = 100;
    const tr = firstRow(h.doc);
    wireRow(h.w, tr);
    const cell = tr.querySelector('td.sd-c-name');
    drag(h.w, cell, null, -40);
    ok('scrollLeft: 100 → 140', el.scrollLeft === 140, el.scrollLeft);
    ok('класът dragging е махнат след pointerup', !el.classList.contains('dragging'));
    /* Click-ът веднага след влачене се изяжда — но САМО той. Бутонът в
       закачената колона работи при следващия истински клик. */
    click(h.w, cell);
    await ticks();
    const b = editBtn(tr);
    click(h.w, b);
    ok('след влачене: „✏️" в закачената колона отваря модала', !!h.doc.getElementById('sd-ov'));
    ok('и отваря точно този ред', h.w.sdEditId === 'l-1', h.w.sdEditId);
    h.close();
  }
  {
    const h = env('interstore');
    const el = wrapEl(h.doc);
    el.scrollLeft = 100;
    const tr = firstRow(h.doc);
    wireRow(h.w, tr);
    const b = editBtn(tr);
    /* Трепване върху самия бутон (8px) — не влачи и клик-ът минава. */
    drag(h.w, b, b, 8);
    ok('натискане върху бутон не влачи', el.scrollLeft === 100, el.scrollLeft);
    click(h.w, b);
    ok('клик-ът по „✏️" НЕ се губи след трепването', !!h.doc.getElementById('sd-ov'));
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
