/* Клиентски заявки: логистичният склад (роля logistics, глобален профил) е
   ИЗПЪЛНИТЕЛ на заявките към себе си — „📤 Изпратена" / „✕ Откаже" / „Статус",
   без „Пристигнала" / „Уведомен" / „Изпълнена" / „↩ Върни". Всички останали
   (склад като заявител, admin, магазин) — както досега. Проверява се САМО <button>.

   Пускане: node tests/co-warehouse-fulfiller-buttons.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, dayOffset, tsOffset } = H;

const WH = 'Логистичен склад Добрич';
function order(id, status, extra) {
  return Object.assign({
    id, in_num: 'Карлово-' + id, store_name: 'Карлово', fulfiller: WH,
    status, date: dayOffset(-3), hour: '10:00',
    customer_name: 'Иван Петров', phone: '0888111222',
    product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м',
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м' }],
    delivery: dayOffset(5), note: '', created_at: tsOffset(-3),
    co_eta: null, co_note: null, paid_transport: false, transport_id: null,
    client_notified_at: null, client_notified_by: null
  }, extra || {});
}
const STATUSES = ['pending', 'sent', 'arrived', 'done'];

function env(user, mk) {
  const orders = STATUSES.map(s => mk('o-' + s, s));
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'history.js', 'notifications.js', 'stock-differences.js'],
    user, data: { client_orders: orders, transport_orders: [], stores: [] }
  });
  h.w.transportOrders = [];
  h.w.clientOrders = JSON.parse(JSON.stringify(orders));
  h.w.clientOrders.forEach(o => {
    o._status = h.w.calcStatus(o.delivery, o.status);
    o._days = h.w.calcElapsed(o.created_at, o.date);
    o._isFulfiller = h.w.coIsMineToFulfill(o);
  });
  guard('renderClientOrders()', () => h.w.renderClientOrders());
  return h;
}
function btns(h, id) {
  const row = h.doc.getElementById('co-row-o-' + id);
  if (!row) return null;
  return Array.prototype.map.call(row.querySelectorAll('button'), b => b.textContent);
}
const has = (list, t) => list.some(x => x.indexOf(t) >= 0);

const WH_USER = { email: 'dobrich@temax.bg', display_name: 'Склад Добрич', role: 'logistics', store_name: WH };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const MGR = { email: 'k@temax.bg', display_name: 'Управител Карлово', role: 'manager', store_name: 'Карлово' };

(async function run() {
  section('1. склад → изпълнител (заявител Карлово)');
  {
    const h = env(WH_USER, order);
    const p = btns(h, 'pending'), s = btns(h, 'sent'), a = btns(h, 'arrived'), d = btns(h, 'done');
    ok('редовете се рендират', !!(p && s && a && d));
    ok('pending: „Изпратена"', has(p, 'Изпратена'));
    ok('pending: „Откаже"', has(p, 'Откаже'));
    ok('pending: „Статус"', has(p, 'Статус'));
    ok('pending: няма „Пристигнала"', !has(p, 'Пристигнала'));
    ok('sent: няма „Пристигнала"', !has(s, 'Пристигнала'));
    ok('sent: няма „Изпълнена"', !has(s, 'Изпълнена'));
    ok('sent: „Статус" е запазен', has(s, 'Статус'));
    ok('arrived: няма „Уведомен" / „Изпълнена"', !has(a, 'Уведомен') && !has(a, 'Изпълнена'));
    ok('done: няма „Върни"', !has(d, 'Върни'));
  }

  section('2. склад като ЗАЯВИТЕЛ (store_name = склада) → като досега');
  {
    const h = env(WH_USER, (id, st) => order(id, st, { store_name: WH, fulfiller: 'Габрово' }));
    const p = btns(h, 'pending'), s = btns(h, 'sent'), a = btns(h, 'arrived'), d = btns(h, 'done');
    ok('pending: няма „Изпратена"', !has(p, 'Изпратена'));
    ok('pending: „Статус"', has(p, 'Статус'));
    ok('sent: „Пристигнала"', has(s, 'Пристигнала'));
    ok('arrived: „Изпълнена"', has(a, 'Изпълнена'));
    ok('done: „Върни"', has(d, 'Върни'));
  }

  section('3. admin към склада → като досега (заявител)');
  {
    const h = env(ADMIN, order);
    const p = btns(h, 'pending'), s = btns(h, 'sent'), a = btns(h, 'arrived'), d = btns(h, 'done');
    ok('pending: няма „Изпратена"', !has(p, 'Изпратена'));
    ok('pending: „Статус" (по един)', p.filter(t => t.indexOf('Статус') >= 0).length === 1);
    ok('sent: „Пристигнала"', has(s, 'Пристигнала'));
    ok('arrived: „Изпълнена"', has(a, 'Изпълнена'));
    ok('done: „Върни"', has(d, 'Върни'));
  }

  section('4. управител Карлово (заявител) → като досега');
  {
    const h = env(MGR, order);
    const p = btns(h, 'pending'), s = btns(h, 'sent'), a = btns(h, 'arrived'), d = btns(h, 'done');
    ok('pending: няма „Изпратена"', !has(p, 'Изпратена'));
    ok('pending: „Статус"', has(p, 'Статус'));
    ok('sent: „Пристигнала"', has(s, 'Пристигнала'));
    ok('arrived: „Изпълнена"', has(a, 'Изпълнена'));
    ok('done: „Върни"', has(d, 'Върни'));
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
