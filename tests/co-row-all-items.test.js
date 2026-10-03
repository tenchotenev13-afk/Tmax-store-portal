/* Клиентски заявки: редът показва ВСИЧКИ артикули, не само първия.

   o.sap / o.product / o.color / o.qty носят само items[0] (записът ги пълни
   за съвместимост). Редът в таблицата, История (екран + печатна справка) и
   Календарът вече строят артикулите от resolveItems().

   В компактния ред (6 колони) артикулите са в ЕДНА клетка „Артикул"
   (coItemCellCompact): всеки е .co-it с два реда — „име — бройка мярка" и
   „SAP …"; цветът е в title.
   Случаи: 1 артикул, 2 артикула (реален
   случай Сливен-0120), 5 артикула (първите 3 + „+2 още"), стар запис с
   items=null (fallback към единичните колони).

   Пускане: node tests/co-row-all-items.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, dayOffset, tsOffset } = H;

function order(id, extra) {
  return Object.assign({
    id, in_num: 'Сливен-' + id, store_name: 'Сливен', from_store: 'Сливен', fulfiller: 'Централен офис',
    status: 'pending', date: dayOffset(0), hour: '10:00',
    customer_name: 'Иван Петров', phone: '0888111222', bon: 'Б-1',
    delivery: dayOffset(5), note: '', created_at: tsOffset(-1),
    co_eta: null, co_note: null, paid_transport: false, transport_id: null, group_id: null
  }, extra || {});
}

const ONE = order('0001', {
  product: 'ПАРКЕТ', color: 'дъб', sap: '111', qty: 5, unit: 'кв.м',
  items: [{ product: 'ПАРКЕТ', color: 'дъб', sap: '111', qty: 5, unit: 'кв.м' }]
});
const TWO = order('0120', {
  product: 'ПЛАФОН', color: 'бял', sap: '78644', qty: 1, unit: 'бр.',
  items: [
    { product: 'ПЛАФОН', color: 'бял', sap: '78644', qty: 1, unit: 'бр.' },
    { product: 'АПЛИК', color: '', sap: '78643', qty: 2, unit: 'бр.' }
  ]
});
const FIVE = order('0005', {
  product: 'А1', color: '', sap: '1001', qty: 1, unit: 'бр.',
  items: [1, 2, 3, 4, 5].map(i => ({ product: 'А' + i, color: i === 2 ? 'сив' : '', sap: '100' + i, qty: i, unit: i === 3 ? 'м' : 'бр.' }))
});
const OLD = order('0009', { items: null, product: 'МИВКА', color: 'бял', sap: '999000', qty: 3, unit: 'бр.' });
const ORDERS = [ONE, TWO, FIVE, OLD];

const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin', store_name: 'Централен офис' };

function env(modules) {
  const h = boot({
    modules: modules || ['transport.js', 'client-orders.js', 'kasa.js', 'kasa-docs.js', 'history.js', 'calendar.js', 'notifications.js'],
    user: ADMIN,
    data: { client_orders: ORDERS, transport_orders: [], stores: [], users: [], bus_routes: [], route_templates: [] }
  });
  const w = h.w;
  w.transportOrders = [];
  w.clientOrders = JSON.parse(JSON.stringify(ORDERS));
  w.clientOrders.forEach(o => {
    o._status = w.calcStatus(o.delivery, o.status);
    o._days = w.calcElapsed(o.created_at, o.date);
    o._isFulfiller = w.coIsMineToFulfill(o);
  });
  return h;
}

function colIndex(doc, name) {
  const body = doc.getElementById('co-body');
  const table = body && body.closest('table');
  const heads = table ? Array.prototype.map.call(table.querySelectorAll('thead th'), th => th.textContent.trim()) : [];
  return heads.findIndex(x => x === name || x.indexOf(name) === 0);
}
const cell = (doc, id, name) => {
  const row = doc.getElementById('co-row-' + id);
  const i = colIndex(doc, name);
  return row && i >= 0 ? row.querySelectorAll('td')[i] || null : null;
};
const html = c => (c ? c.innerHTML : '');
const txt = c => (c ? c.textContent : '');
/* Блоковете на артикулите в клетка — всеки е .co-it с ДВА вътрешни реда */
const blocks = c => (c ? Array.prototype.slice.call(c.querySelectorAll('.co-it')) : []);

(async function run() {

  const { w, doc } = env();
  guard('renderClientOrders()', () => w.renderClientOrders());

  section('1. Един артикул — един ред „име — бройка мярка" и „SAP …"');
  {
    const it = cell(doc, '0001', 'Артикул');
    const b = blocks(it);
    ok('точно един блок', b.length === 1, b.length);
    ok('ПАРКЕТ — 5 кв.м', b[0] && b[0].children[0].textContent === 'ПАРКЕТ — 5 кв.м', b[0] && b[0].children[0].textContent);
    ok('SAP 111 (сиво) под него', b[0] && b[0].children[1].textContent === 'SAP 111', b[0] && b[0].children[1].textContent);
    ok('цветът е в title на името', b[0] && b[0].children[0].getAttribute('title') === 'ПАРКЕТ (дъб)', b[0] && b[0].children[0].getAttribute('title'));
    ok('целият SAP код е в title', b[0] && b[0].children[1].getAttribute('title') === '111');
    ok('няма „още"', !/още/.test(txt(it)));
  }

  section('2. Два артикула (Сливен-0120) — и двата');
  {
    const it = cell(doc, '0120', 'Артикул');
    const b = blocks(it);
    ok('2 блока', b.length === 2, b.length);
    ok('ПЛАФОН — 1 …, после АПЛИК — 2 …', b.length === 2 && /^ПЛАФОН — 1/.test(b[0].children[0].textContent) && /^АПЛИК — 2/.test(b[1].children[0].textContent));
    ok('SAP: 78644, после 78643', b.length === 2 && b[0].children[1].textContent === 'SAP 78644' && b[1].children[1].textContent === 'SAP 78643');
    ok('цветът „бял" е в title на ПЛАФОН', b.length === 2 && /бял/.test(b[0].children[0].getAttribute('title')));
    ok('без „още" при 2 артикула', !/още/.test(txt(it)));
  }

  section('3. Пет артикула — първите 3 + „+2 още"');
  {
    const it = cell(doc, '0005', 'Артикул');
    ok('3 блока', blocks(it).length === 3, blocks(it).length);
    ok('А4 и А5 ги няма в реда', !/А4|А5/.test(txt(it)) && !/1004|1005/.test(txt(it)));
    const more = it && it.querySelector('.co-it-more');
    ok('„+2 още" под артикулите', !!more && more.textContent.trim() === '+2 още', more && more.textContent);
    ok('мярката „м" на третия е в реда му', blocks(it)[2] && / м$/.test(blocks(it)[2].children[0].textContent), blocks(it)[2] && blocks(it)[2].children[0].textContent);
    ok('цветът „сив" е в title на А2', blocks(it)[1] && /сив/.test(blocks(it)[1].children[0].getAttribute('title')));
  }

  section('4. Стар запис без items (items=null) — fallback');
  {
    const it = cell(doc, '0009', 'Артикул');
    const b = blocks(it);
    ok('един блок: МИВКА — 3 бр.', b.length === 1 && b[0].children[0].textContent === 'МИВКА — 3 бр.', b[0] && b[0].children[0].textContent);
    ok('SAP 999000', b.length === 1 && b[0].children[1].textContent === 'SAP 999000');
    ok('цветът „бял" е в title', b.length === 1 && /бял/.test(b[0].children[0].getAttribute('title')));
  }

  section('5. Клик по многоартикулен ред още отваря детайла');
  {
    const it = cell(doc, '0120', 'Артикул');
    if (it) guard('клик по Артикул', () => H.bubbleClick(w, blocks(it)[1] || it));
    const ov = doc.getElementById('cod-ov');
    ok('#cod-ov на Сливен-0120', !!ov && ov.textContent.indexOf('Сливен-0120') >= 0);
    if (ov) guard('затвори', () => w.closeClientOrderDetail());
  }

  section('6. История — екранът');
  {
    w.clientOrders = [];
    w.histFilter = { from: dayOffset(-30), to: dayOffset(1), store: '', type: 'all' };
    w.histData = { transport: [], client: JSON.parse(JSON.stringify(ORDERS)), kasa: [], storno: [] };
    guard('renderHistoryShell()', () => w.renderHistoryShell());
    guard('renderHistoryResults()', () => w.renderHistoryResults());
    const res = doc.getElementById('h-results');
    const rowOf = num => res && Array.prototype.find.call(res.querySelectorAll('tr'), tr => tr.textContent.indexOf(num) >= 0);
    const prodCell = num => { const r = rowOf(num); return r ? r.querySelectorAll('td')[4] : null; };
    ok('1 артикул: ПАРКЕТ + SAP: 111, без „×"', /ПАРКЕТ/.test(txt(prodCell('Сливен-0001'))) && /SAP: 111/.test(txt(prodCell('Сливен-0001'))) && !/×/.test(txt(prodCell('Сливен-0001'))), txt(prodCell('Сливен-0001')));
    const t2 = txt(prodCell('Сливен-0120'));
    ok('2 артикула: ПЛАФОН × 1 и АПЛИК × 2 с SAP кодовете', /ПЛАФОН × 1/.test(t2) && /АПЛИК × 2/.test(t2) && /78644/.test(t2) && /78643/.test(t2), t2);
    const t5 = txt(prodCell('Сливен-0005'));
    ok('5 артикула: А1–А3 + „+2 още", без А4', /А1/.test(t5) && /А3/.test(t5) && !/А4/.test(t5) && /\+2 още/.test(t5), t5);
    ok('стар запис: МИВКА + SAP: 999000', /МИВКА/.test(txt(prodCell('Сливен-0009'))) && /999000/.test(txt(prodCell('Сливен-0009'))));
    const c = prodCell('Сливен-0120');
    ok('клетката още отваря детайла', !!c && c.getAttribute('onclick') === 'openClientOrderDetail(this.dataset.id)');
  }

  section('7. История — печатната справка показва ВСИЧКИ артикули');
  {
    let written = '';
    w.open = () => ({ document: { write: s => { written += s; }, close: () => {} }, focus: () => {} });
    guard('printHistoryReport()', () => w.printHistoryReport());
    ok('справката е написана', written.length > 0);
    ok('и петте артикула (А5 × 5)', /А4 × 4/.test(written) && /А5 × 5/.test(written));
    ok('и двата от Сливен-0120', /78644 — ПЛАФОН × 1/.test(written) && /78643 — АПЛИК × 2/.test(written));
    ok('единичен без „×"', /111 — ПАРКЕТ</.test(written));
    ok('стар запис: 999000 — МИВКА', /999000 — МИВКА</.test(written));
  }

  section('8. Календар — първият артикул + „+N"');
  {
    w.calWeekOffset = 0; w.calRoutes = []; w.calTransport = []; w.calTemplates = [];
    /* Календарът слага заявките по ДОСТАВКА (delivery), не по date — затова днес. */
    w.calClients = JSON.parse(JSON.stringify(ORDERS)).map(o => Object.assign(o, { delivery: w.localDateISO(new Date()) }));
    guard('renderCalendar()', () => w.renderCalendar());
    const t = txt(doc.getElementById('mod-calendar'));
    ok('ПЛАФОН +1', /ПЛАФОН\s*\+1/.test(t), t.slice(0, 400));
    ok('ПАРКЕТ без „+"', /ПАРКЕТ(?!\s*\+)/.test(t));
    ok('А1 +4', /А1\s*\+4/.test(t));
  }

  report();
})();
