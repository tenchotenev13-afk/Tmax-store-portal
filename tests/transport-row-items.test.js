/* Транспорт: редът показва ВСИЧКИ артикули (до 3 + „+N още"), като в Клиентски —
   през coItemCells(). Колоните са все 11, на старите места (SAP=3, Телефон=4,
   Адрес=5, Продукт=6, Бр.=7). Клик по реда пак отваря детайла.

   Пускане: node tests/transport-row-items.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, bubbleClick, ok, guard, section, report, dayOffset, tsOffset } = H;

function t(id, extra) {
  return Object.assign({
    id, store_name: 'Троян', date: dayOffset(-1), hour: '14:30', bon: 'Б-1',
    customer_name: 'Иван Петров', phone: '0888111222', address: 'гр. Троян',
    product: null, color: null, sap: null, qty: null, unit: null, items: null,
    delivery: dayOffset(2), status: 'pending', notes: null,
    client_order_id: null, client_order_num: null, awaiting_stock: false, created_at: tsOffset(-1)
  }, extra || {});
}
const item = n => ({ sap: 'S' + n, product: 'АРТИКУЛ' + n, color: 'цвят' + n, qty: n, unit: 'бр.' });
const ORDERS = [
  t('one', { items: [{ sap: '111', product: 'ПАРКЕТ', color: 'дъб', qty: 5, unit: 'кв.м' }] }),
  t('old', { sap: '555', product: 'ВРАТА', color: 'орех', qty: 2, unit: 'бр.' }),
  t('two', { items: [item(1), item(2)] }),
  t('five', { items: [1, 2, 3, 4, 5].map(item) })
];

function env() {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' },
    data: { transport_orders: ORDERS, client_orders: [], stores: [] }
  });
  h.w.transportOrders = JSON.parse(JSON.stringify(ORDERS));
  h.w.transportOrders.forEach(o => { o._status = h.w.calcStatus(o.delivery, o.status); });
  h.w.clientOrders = [];
  guard('renderTransport()', () => h.w.renderTransport());
  return h;
}
const cells = (h, id) => { const r = h.doc.getElementById('tr-row-' + id); return r ? Array.from(r.children) : []; };

(async function run() {
  const h = env();

  section('1. 1 артикул → като досега');
  {
    const c = cells(h, 'one');
    ok('11 <td>', c.length === 11, c.length);
    ok('SAP в колона 3', c[2] && c[2].textContent === '111', c[2] && c[2].textContent);
    ok('Продукт + цвят в колона 6', c[5] && c[5].textContent === 'ПАРКЕТдъб', c[5] && c[5].textContent);
    ok('Бр. + мерна единица в колона 7', c[6] && c[6].textContent === '5кв.м', c[6] && c[6].textContent);
    ok('Телефон/Адрес са си на местата', c[3] && c[3].textContent === '0888111222' && c[4] && c[4].textContent === 'гр. Троян');
    ok('няма „още"', !/още/.test(c.map(x => x.textContent).join('')));
  }

  section('2. стар запис без items → старите полета');
  {
    const c = cells(h, 'old');
    ok('11 <td>', c.length === 11, c.length);
    ok('SAP 555', c[2] && c[2].textContent === '555');
    ok('ВРАТА + орех', c[5] && c[5].textContent === 'ВРАТАорех');
    ok('брой 2', c[6] && c[6].textContent === '2');
  }

  section('3. 2 артикула → и двата в реда');
  {
    const c = cells(h, 'two');
    ok('11 <td>', c.length === 11, c.length);
    ok('и двата SAP', c[2] && /S1/.test(c[2].textContent) && /S2/.test(c[2].textContent));
    ok('и двата продукта', c[5] && /АРТИКУЛ1/.test(c[5].textContent) && /АРТИКУЛ2/.test(c[5].textContent));
    ok('и двете бройки', c[6] && /1/.test(c[6].textContent) && /2/.test(c[6].textContent));
    ok('няма „още"', !/още/.test(c[5].textContent));
  }

  section('4. 5 артикула → първите 3 + „+2 още"');
  {
    const c = cells(h, 'five');
    ok('11 <td>', c.length === 11, c.length);
    ok('SAP S1..S3, без S4', c[2] && /S3/.test(c[2].textContent) && !/S4/.test(c[2].textContent));
    ok('продукти 1..3, без 4', c[5] && /АРТИКУЛ3/.test(c[5].textContent) && !/АРТИКУЛ4/.test(c[5].textContent));
    ok('„+2 още" в колона Продукт', c[5] && /\+2 още/.test(c[5].textContent), c[5] && c[5].textContent);
  }

  section('5. клик по реда → детайл');
  {
    const w = h.w;
    const td = cells(h, 'five')[0];
    guard('клик', () => bubbleClick(w, td));
    ok('отворен е #trd-ov', !!h.doc.getElementById('trd-ov'));
  }

  section('6. fallback без coItemCells → старият markup');
  {
    const h2 = env();
    h2.w.coItemCells = undefined;
    guard('renderTransport()', () => h2.w.renderTransport());
    const c = cells(h2, 'old');
    ok('11 <td>', c.length === 11, c.length);
    ok('SAP + продукт + брой', c[2].textContent === '555' && c[5].textContent === 'ВРАТАорех' && c[6].textContent === '2');
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
