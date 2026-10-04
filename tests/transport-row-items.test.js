/* Транспорт: редът показва ВСИЧКИ артикули (до 3 + „+N още"), като в Клиентски —
   през coItemCellCompact(). От компактния ред (6 колони) артикулите са в ЕДНА
   клетка „Артикул" (4-та): всеки е .co-it с два реда — „име — бройка мярка" и
   „SAP …". Клик по реда пак отваря детайла.

   Пускане: node tests/transport-row-items.test.js . */
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
const blocks = c => (c ? Array.from(c.querySelectorAll('.co-it')) : []);

(async function run() {
  const h = env();

  section('1. 1 артикул');
  {
    const c = cells(h, 'one');
    ok('6 <td>', c.length === 6, c.length);
    const b = blocks(c[3]);
    ok('един блок: ПАРКЕТ — 5 кв.м', b.length === 1 && b[0].children[0].textContent === 'ПАРКЕТ — 5 кв.м', b[0] && b[0].children[0].textContent);
    ok('SAP 111 под него', b[0] && b[0].children[1].textContent === 'SAP 111');
    ok('цветът е в title', b[0] && b[0].children[0].getAttribute('title') === 'ПАРКЕТ (дъб)');
    ok('Адрес е в 3-та клетка', c[2] && c[2].textContent === 'гр. Троян', c[2] && c[2].textContent);
    ok('Клиент: име + телефон · бон', c[1] && /Иван Петров/.test(c[1].textContent) && /0888111222 · Бон: Б-1/.test(c[1].textContent), c[1] && c[1].textContent);
    ok('няма „още"', !/още/.test(c[3].textContent));
  }

  section('2. стар запис без items → старите полета');
  {
    const c = cells(h, 'old');
    const b = blocks(c[3]);
    ok('6 <td>', c.length === 6, c.length);
    ok('един блок: ВРАТА — 2 бр.', b.length === 1 && b[0].children[0].textContent === 'ВРАТА — 2 бр.', b[0] && b[0].children[0].textContent);
    ok('SAP 555', b.length === 1 && b[0].children[1].textContent === 'SAP 555');
  }

  section('3. 2 артикула → и двата в реда');
  {
    const c = cells(h, 'two');
    const b = blocks(c[3]);
    ok('6 <td>', c.length === 6, c.length);
    ok('два блока', b.length === 2, b.length);
    ok('и двата SAP', /SAP S1/.test(c[3].textContent) && /SAP S2/.test(c[3].textContent));
    ok('и двата продукта', /АРТИКУЛ1/.test(c[3].textContent) && /АРТИКУЛ2/.test(c[3].textContent));
    ok('няма „още"', !/още/.test(c[3].textContent));
  }

  section('4. 5 артикула → първите 3 + „+2 още"');
  {
    const c = cells(h, 'five');
    ok('6 <td>', c.length === 6, c.length);
    ok('три блока', blocks(c[3]).length === 3, blocks(c[3]).length);
    ok('SAP S1..S3, без S4', /SAP S3/.test(c[3].textContent) && !/S4/.test(c[3].textContent));
    ok('„+2 още"', /\+2 още/.test(c[3].textContent), c[3].textContent);
  }

  section('5. клик по реда → детайл');
  {
    const w = h.w;
    guard('клик', () => bubbleClick(w, cells(h, 'five')[3]));
    ok('отворен е #trd-ov', !!h.doc.getElementById('trd-ov'));
  }

  section('6. fallback без coItemCellCompact → една клетка със старите полета');
  {
    const h2 = env();
    h2.w.coItemCellCompact = undefined;
    guard('renderTransport()', () => h2.w.renderTransport());
    const c = cells(h2, 'old');
    ok('пак 6 <td>', c.length === 6, c.length);
    ok('продукт, брой и SAP', /ВРАТА — 2 бр\./.test(c[3].textContent) && /SAP 555/.test(c[3].textContent), c[3].textContent);
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
