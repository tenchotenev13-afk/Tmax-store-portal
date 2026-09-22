/* Филтър „📦 Пристигнала" в Клиентски заявки.
   Бутонът е в реалния index.html (#co-filters) — кликва се истински, не се
   вика filterOrders() направо. Клик → остават само редове със status
   'arrived'; клик на „Всички" → връщат се всички.

   Пускане: node tests/co-filter-arrived.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btnExact, ok, guard, section, report, dayOffset, tsOffset } = H;

function order(id, status) {
  return {
    id, in_num: 'Троян-' + id, store_name: 'Троян', fulfiller: 'Габрово',
    status, date: dayOffset(-3), hour: '10:00',
    customer_name: 'Клиент ' + id, phone: '0888111222',
    product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м',
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м' }],
    delivery: dayOffset(5), note: '', created_at: tsOffset(-3),
    co_eta: null, co_note: null, paid_transport: false, transport_id: null
  };
}

const ORDERS = [
  order('p1', 'pending'), order('s1', 'sent'), order('a1', 'arrived'),
  order('a2', 'arrived'), order('d1', 'done'), order('r1', 'refused')
];

const TROYAN = { email: 'troyan@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: 'Троян' };

function env() {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: TROYAN,
    data: { client_orders: ORDERS, transport_orders: [], stores: [] }
  });
  h.w.transportOrders = [];
  h.w.clientOrders = JSON.parse(JSON.stringify(ORDERS));
  h.w.clientOrders.forEach(o => {
    o._status = h.w.calcStatus(o.delivery, o.status);
    o._days = h.w.calcElapsed(o.created_at, o.date);
    o._isFulfiller = h.w.coIsMineToFulfill(o);
  });
  return h;
}

const rowIds = doc => Array.prototype.map.call(
  doc.querySelectorAll('#co-body tr[id^="co-row-"]'), r => r.id.replace('co-row-', '')).sort();

(async function run() {
  const { w, doc } = env();
  guard('първоначален рендер', () => w.renderClientOrders());
  const bar = doc.getElementById('co-filters');

  section('1. Бутонът е в index.html, между „Изпратена" и „Отложена"');
  const labels = Array.prototype.map.call(bar.querySelectorAll('button'), b => b.textContent.trim());
  const i = labels.indexOf('📦 Пристигнала');
  ok('бутон „📦 Пристигнала" съществува', i >= 0, JSON.stringify(labels));
  ok('непосредствено след „📤 Изпратена"', labels[i - 1] === '📤 Изпратена', labels[i - 1]);
  ok('непосредствено преди „Отложена"', labels[i + 1] === 'Отложена', labels[i + 1]);
  ok('всички 6 реда се виждат преди филтъра', rowIds(doc).length === 6, JSON.stringify(rowIds(doc)));

  section('2. Клик → само arrived');
  const arrived = btnExact(bar, '📦 Пристигнала');
  if (ok('бутонът се намира', !!arrived)) {
    realClick(w, arrived, '📦 Пристигнала');
    ok('остават точно a1 и a2', JSON.stringify(rowIds(doc)) === '["a1","a2"]', JSON.stringify(rowIds(doc)));
    ok('бутонът става active', arrived.classList.contains('active'));
    ok('„Всички" вече не е active', !btnExact(bar, 'Всички').classList.contains('active'));
  }

  section('3. Клик на „Всички" → връщат се всички');
  const all = btnExact(bar, 'Всички');
  realClick(w, all, 'Всички');
  ok('пак 6 реда', rowIds(doc).length === 6, JSON.stringify(rowIds(doc)));
  ok('„Всички" е active', all.classList.contains('active'));
  ok('„Пристигнала" не е active', !!arrived && !arrived.classList.contains('active'));

  report();
})();
