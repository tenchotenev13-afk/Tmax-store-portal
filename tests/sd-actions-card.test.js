/* Разлики — картата „Действия на магазините" (само за логистичния склад).

   Складът трябваше да обходи всяка бланка, за да разбере какво се е случило по
   нея. Картата събира събитията от ВЕЧЕ ЗАРЕДЕНИТЕ данни и ги подрежда по
   време, най-новото отгоре. Нула нови заявки — затова и кликът по ред е чист
   рендер, не fetch.

   Кои събития влизат: отговор на магазина (accepted / sap_done / no_stock),
   приемане без store_response, корекция от магазина, изпращане и приемане на
   размяна. Всичко — само към МОЯ склад.

   Проверките вървят и в обратната посока: магазин и Цвети НЕ виждат картата,
   чужд склад не вижда чужди събития, а чиповете стоят и при нула събития
   (правило 11) — иначе от „няма нищо" няма изход към по-широк прозорец.

   Пускане:  node tests/sd-actions-card.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const clone = x => JSON.parse(JSON.stringify(x));
const ago = h => new Date(Date.now() - h * 3600000).toISOString();

function rep(o) {
  return Object.assign({
    id: 'rep-p', direction: 'interstore', store_name: 'Петрич', counterpart: WH,
    document_number: '4600', doc_date: '2026-09-10', submitted_by: 'Управител',
    general_comment: '', photos: [], reviewed: false, created_at: '2026-09-10T09:00:00.000Z'
  }, o);
}
function line(o) {
  return Object.assign({
    id: 'l-x', report_id: 'rep-p', store_name: 'Петрич', supplier: null,
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
function swap(o) {
  return Object.assign({
    id: 'sw-1', from_line_id: 'l-g', to_line_id: 'l-p',
    from_store: 'Гоце Делчев', to_store: 'Петрич', warehouse: WH,
    material_code: '123', material_name: 'РАЗМЕНЕН', qty: 20,
    status: 'linked', kind: 'doc', transport_mode: null, sap_doc_num: null,
    note: null, created_by: 'Склад Търговище', created_at: '2026-09-12T09:00:00.000Z',
    sent_by: null, sent_at: null, received_by: null, received_at: null,
    closed_by: null, closed_at: null
  }, o);
}

const REP_P = rep();
const REP_G = rep({ id: 'rep-g', store_name: 'Гоце Делчев' });

const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище', role: 'sklad', store_name: WH, assigned_stores: [] };
/* ВТОРИЯТ реален склад от LOGISTICS_WAREHOUSES в shared.js. Измислено име
   не става: isLogisticsWarehouseUser() чете точно този списък и профилът щеше
   да мине за магазин, тоест „картата я има" би падало по грешна причина. */
const OTHER_WH  = { email: 'sklad.db@temax.bg', display_name: 'Склад Добрич', role: 'sklad', store_name: 'Логистичен склад Добрич', assigned_stores: [] };
const PETRICH   = { email: 'petrich@temax.bg', display_name: 'Управител Петрич', role: 'manager', store_name: 'Петрич', assigned_stores: [] };
const CVETI     = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

function env(user, lines, swaps, reports) {
  lines = lines || []; swaps = swaps || []; reports = reports || [REP_P, REP_G];
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user, confirm: true,
    data: {
      stock_differences: lines, differences_reports: reports, stock_diff_swaps: swaps,
      stock_returns: [], transport_orders: [], users: [],
      stores: [{ name: 'Петрич' }, { name: 'Гоце Делчев' }], contacts: []
    }
  });
  h.w.sdData = clone(lines);
  h.w.diffReports = clone(reports);
  h.w.sdSwaps = clone(swaps);
  h.w.transportOrders = [];
  h.w.sdFilter = 'pending'; h.w.sdTypeFilter = 'all';
  h.w.sdStoreFilter = ''; h.w.sdSearch = ''; h.w.sdDirTab = 'interstore';
  h.w.sdShowDone = {}; h.w.sdActionsDays = 3; h.w.sdActionsOpen = true;
  h.w.invalidateStoreCaches(); h.w.invalidateSuppliersCache();
  h.w.renderStockDiff();
  return h;
}

const cardOf = h => h.doc.getElementById('sd-actions-card');
/* Текстът на картата, безопасно. Срещу код без картата cardOf() е null и
   всяко .textContent би убило процеса преди report() — с нула ❌ в изхода,
   тоест точно случаят, срещу който пазим при анти-тавтологичния пуск. */
const cardText = h => { const c = cardOf(h); return c ? c.textContent : ''; };
const rows = h => { const c = cardOf(h); return c ? Array.prototype.filter.call(c.querySelectorAll('button'),
  x => /sdActionsGoto\(/.test(x.getAttribute('onclick') || '')) : []; };
const texts = h => rows(h).map(x => x.textContent);
const chips = h => { const c = cardOf(h); return c ? Array.prototype.filter.call(c.querySelectorAll('button'),
  x => /sdSetActionsDays\(/.test(x.getAttribute('onclick') || '')).map(x => x.textContent) : []; };
const netCount = h => h.calls.get.length + h.calls.post.length + h.calls.patch.length + h.calls.del.length;
const settle = async () => { await ticks(); await ticks(); };

/* Пет събития от четирите вида, с различна възраст — редът им е част от
   проверката, затова часовете не се повтарят. */
const LINES = [
  line({ id: 'l-p', store_response: 'no_stock', store_response_at: ago(1),
         store_response_by: 'Управител Петрич', store_response_comment: 'няма в SAP',
         material_name: 'БЕЗ НАЛИЧНОСТ', warehouse_response: 'return' }),
  line({ id: 'l-p2', store_response: 'sap_done', store_response_at: ago(5),
         store_response_by: 'Управител Петрич', material_name: 'ПУСНАТ',
         warehouse_response: 'return' }),
  line({ id: 'l-p3', status: 'received', completed_at: ago(30), completed_by: 'Управител Петрич',
         material_name: 'ПРИЕТ БЕЗ ОТГОВОР' }),
  line({ id: 'l-p4', store_corrected_at: ago(40), material_name: 'КОРИГИРАН' }),
  line({ id: 'l-g', report_id: 'rep-g', store_name: 'Гоце Делчев', material_name: 'РАЗМЕНЕН' })
];
const SWAPS = [swap({ status: 'sent', sent_at: ago(12), sap_doc_num: '4900777' })];

(async function run() {

  /* ── 1. Кой я вижда ─────────────────────────────────────────────────────── */
  section('1. Картата е САМО за логистичния склад');
  {
    const h = env(WAREHOUSE, LINES, SWAPS);
    ok('складът я вижда', !!cardOf(h));
    ok('и заглавието е „📋 Действия на магазините"',
      /📋 Действия на магазините/.test(cardText(h)), cardText(h).slice(0, 80));
    h.close();
  }
  {
    const h = env(PETRICH, LINES, SWAPS);
    ok('магазинът НЕ я вижда', !cardOf(h));
    h.close();
  }
  {
    const h = env(CVETI, LINES, SWAPS);
    ok('Цвети НЕ я вижда', !cardOf(h));
    h.close();
  }
  {
    /* Чужд склад — картата я има, но е празна: събитията са към друг склад. */
    const h = env(OTHER_WH, LINES, SWAPS);
    ok('чужд склад: картата я има', !!cardOf(h));
    ok('но е празна', rows(h).length === 0, texts(h).join(' // '));
    h.close();
  }

  /* ── 2. Събитията и редът им ────────────────────────────────────────────── */
  section('2. Пет събития от четирите вида, най-новото отгоре');
  {
    const h = env(WAREHOUSE, LINES, SWAPS);
    const t = texts(h);
    ok('пет реда', t.length === 5, 'реално: ' + t.length + ' // ' + t.join(' // '));
    ok('броячът в заглавието казва 5', /\(5\)/.test(cardText(h)), cardText(h).slice(0, 80));
    if (t.length === 5) {
      ok('1. няма наличност (преди 1ч)', /Петрич/.test(t[0]) && /Няма наличност/.test(t[0]) && /БЕЗ НАЛИЧНОСТ/.test(t[0]), t[0]);
      ok('2. пуснато в SAP (преди 5ч)', /Пуснато в SAP/.test(t[1]) && /ПУСНАТ/.test(t[1]), t[1]);
      ok('3. размяна: пуснато в SAP → Петрич (преди 12ч)',
        /Гоце Делчев/.test(t[2]) && /пуснато в SAP → Петрич/.test(t[2]) && /РАЗМЕНЕН/.test(t[2]), t[2]);
      ok('4. прието без store_response (преди 30ч)', /ПРИЕТО/.test(t[3]) && /ПРИЕТ БЕЗ ОТГОВОР/.test(t[3]), t[3]);
      ok('5. корекция (преди 40ч)', /коригира количество\/код/.test(t[4]) && /КОРИГИРАН/.test(t[4]), t[4]);
    }
    ok('no_stock редът е в червено', !!rows(h)[0] && /#dc2626/.test(rows(h)[0].getAttribute('style') || ''),
      rows(h)[0] && rows(h)[0].getAttribute('style'));
    ok('останалите НЕ са червени', !!rows(h)[1] && !/#dc2626/.test(rows(h)[1].getAttribute('style') || ''),
      rows(h)[1] && rows(h)[1].getAttribute('style'));
    h.close();
  }
  {
    /* Приемането на размяна е петият вид събитие. */
    const h = env(WAREHOUSE, LINES, [swap({ status: 'received', sent_at: ago(12), received_at: ago(2), sap_doc_num: '4900777' })]);
    ok('приемането на размяна също е събитие',
      texts(h).some(x => /Петрич/.test(x) && /прието от Гоце Делчев/.test(x)), texts(h).join(' // '));
    h.close();
  }

  /* ── 3. Чиповете ────────────────────────────────────────────────────────── */
  section('3. Чиповете за период — филтрират и стоят винаги');
  {
    const h = env(WAREHOUSE, LINES, SWAPS);
    ok('три чипа', chips(h).join('|') === 'Днес|3 дни|7 дни', chips(h).join('|'));
    const before = netCount(h);
    if (ok('чипът „Днес" е на екрана', !!cardOf(h) && !!btn(cardOf(h), 'Днес'))) {
      realClick(h.w, btn(cardOf(h), 'Днес'));
      await settle();
      const t = texts(h);
      ok('събитията отпреди 30 и 40 часа изчезват', t.length === 3, 'реално: ' + t.length + ' // ' + t.join(' // '));
      ok('и точно те: остават 1ч, 5ч и 12ч',
        !t.some(x => /ПРИЕТ БЕЗ ОТГОВОР|КОРИГИРАН/.test(x)), t.join(' // '));
      ok('броячът следва', /\(3\)/.test(cardText(h)), cardText(h).slice(0, 80));
      ok('смяната на периода е чист рендер — нула заявки', netCount(h) === before,
        'реално: ' + (netCount(h) - before));
    }
    h.close();
  }
  {
    const h = env(WAREHOUSE, [], []);
    ok('нула събития: картата я има', !!cardOf(h));
    ok('нула събития: чиповете ПАК са тук', chips(h).join('|') === 'Днес|3 дни|7 дни', chips(h).join('|'));
    ok('нула събития: пише „Няма действия за периода"',
      /Няма действия за периода/.test(cardText(h)), cardText(h));
    ok('и броячът е (0)', /\(0\)/.test(cardText(h)), cardText(h).slice(0, 80));
    h.close();
  }

  /* ── 4. Клик по ред ─────────────────────────────────────────────────────── */
  section('4. Клик по ред → котва към бланката, нула заявки');
  {
    const h = env(WAREHOUSE, LINES, SWAPS);
    const before = netCount(h);
    const r = rows(h)[0];
    if (ok('първият ред е кликаем', !!r)) {
      ok('носи report_id на бланката', r.getAttribute('data-rid') === 'rep-p', r.getAttribute('data-rid'));
      realClick(h.w, r);
      await settle();
      ok('котвата е сложена към rep-p', h.w.sdScrollAnchor === 'rep-p' || h.doc.getElementById('diff-rep-rep-p'),
        String(h.w.sdScrollAnchor));
      ok('нула заявки при клика', netCount(h) === before, 'реално: ' + (netCount(h) - before));
    }
    h.close();
  }
  {
    /* Редът на размяната сочи бланката на ДЕЙСТВАЩИЯ магазин (изпращача). */
    const h = env(WAREHOUSE, LINES, SWAPS);
    const swapRow = rows(h).filter(x => /РАЗМЕНЕН/.test(x.textContent))[0];
    ok('редът на размяната сочи бланката на изпращача',
      !!swapRow && swapRow.getAttribute('data-rid') === 'rep-g',
      swapRow && swapRow.getAttribute('data-rid'));
    h.close();
  }

  /* ── 5. Свиване ─────────────────────────────────────────────────────────── */
  section('5. Картата се свива, чиповете остават');
  {
    const h = env(WAREHOUSE, LINES, SWAPS);
    if (ok('бутонът „скрий" е на екрана', !!cardOf(h) && !!btn(cardOf(h), 'скрий'))) {
      realClick(h.w, btn(cardOf(h), 'скрий'));
      await settle();
      ok('редовете изчезват', rows(h).length === 0, 'реално: ' + rows(h).length);
      ok('чиповете остават', chips(h).join('|') === 'Днес|3 дни|7 дни', chips(h).join('|'));
      ok('броячът остава (5)', /\(5\)/.test(cardText(h)), cardText(h).slice(0, 80));
      ok('и бутонът става „покажи"', !!cardOf(h) && !!btn(cardOf(h), 'покажи'));
    }
    h.close();
  }

  report();
})();
