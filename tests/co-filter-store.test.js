/* Филтър по магазин-заявител (store_name) в Клиентски заявки.
   Опциите се строят през ИСТИНСКИЯ loadClientOrders() (не се вика
   coBuildStoreOptions() направо) — така се хваща и пропуснато извикване.
   Изборът минава през реалния onchange атрибут на select-а от index.html.

   Всички проверки са с null-защита: срещу стария код (без select-а) тестът
   трябва да даде ЧИСТ доклад с ❌, не хвърлена грешка.

   Пускане: node tests/co-filter-store.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btnExact, ok, guard, section, report, dayOffset, tsOffset, ticks } = H;

function order(id, store, status) {
  return {
    id, in_num: store + '-' + id, store_name: store, fulfiller: 'Централен офис',
    status, date: dayOffset(-3), hour: '10:00',
    customer_name: 'Клиент ' + id, phone: '0888111222',
    product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м',
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м' }],
    delivery: dayOffset(5), note: '', created_at: tsOffset(-3),
    co_eta: null, co_note: null, paid_transport: false, transport_id: null
  };
}

const MANY = [
  order('t1', 'Троян', 'pending'),
  order('t2', 'Троян', 'arrived'),
  /* Старо изписване с главни букви — групира се със „Троян" */
  order('t3', 'ТРОЯН', 'arrived'),
  order('v1', 'Враца', 'arrived'),
  order('v2', 'Враца', 'sent'),
  order('a1', 'Асеновград', 'done')
];
const ONE = [order('x1', 'Шумен', 'pending'), order('x2', 'Шумен', 'arrived')];

const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin', store_name: 'Централен офис' };

async function env(orders) {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: ADMIN,
    data: { client_orders: orders, transport_orders: [], stores: [] }
  });
  h.w.transportOrders = [];
  guard('loadClientOrders()', () => h.w.loadClientOrders());
  await ticks();
  return h;
}

const rowIds = doc => Array.prototype.map.call(
  doc.querySelectorAll('#co-body tr[id^="co-row-"]'), r => r.id.replace('co-row-', '')).sort();
const J = x => JSON.stringify(x);

function pick(w, sel, value) {
  sel.value = value;
  return guard('onchange на select-а', () => fire(w, sel, 'change'));
}

(async function run() {

  section('0. Select-ът е в index.html веднага след #co-role-filter');
  {
    const { doc } = await env(MANY);
    const sel = doc.getElementById('co-store-filter');
    const role = doc.getElementById('co-role-filter');
    ok('#co-store-filter съществува', !!sel);
    ok('стои непосредствено след #co-role-filter', !!sel && !!role && role.nextElementSibling === sel);
    ok('onchange вика renderClientOrders()', !!sel && /renderClientOrders\(\)/.test(sel.getAttribute('onchange') || ''));
  }

  section('1. Избор на магазин → само неговите редове');
  {
    const { w, doc } = await env(MANY);
    const sel = doc.getElementById('co-store-filter');
    ok('преди избор се виждат всички 6', rowIds(doc).length === 6, J(rowIds(doc)));
    const opts = sel ? Array.prototype.map.call(sel.options, o => o.textContent) : [];
    ok('опциите: всички + 3 магазина, по азбучен ред, с брой',
      J(opts) === J(['Магазин: всички', 'Асеновград (1)', 'Враца (2)', 'Троян (3)']), J(opts));
    if (sel) {
      pick(w, sel, 'троян');
      ok('„Троян" → t1, t2, t3 (и ТРОЯН с главни)', J(rowIds(doc)) === J(['t1', 't2', 't3']), J(rowIds(doc)));
      pick(w, sel, 'враца');
      ok('„Враца" → v1, v2', J(rowIds(doc)) === J(['v1', 'v2']), J(rowIds(doc)));
    } else ok('select-ът липсва — изборът не може да се пробва', false);
  }

  section('2. „Магазин: всички" връща всичко');
  {
    const { w, doc } = await env(MANY);
    const sel = doc.getElementById('co-store-filter');
    if (sel) {
      pick(w, sel, 'враца');
      pick(w, sel, '');
      ok('пак 6 реда', rowIds(doc).length === 6, J(rowIds(doc)));
    } else ok('select-ът липсва', false);
  }

  section('3. Заявки само от един магазин → select-ът пак е там, с 1 магазин');
  {
    const { doc } = await env(ONE);
    const sel = doc.getElementById('co-store-filter');
    ok('select-ът съществува', !!sel);
    ok('не е скрит', !!sel && sel.style.display !== 'none' && !sel.hidden);
    const opts = sel ? Array.prototype.map.call(sel.options, o => o.textContent) : [];
    ok('точно 1 опция за магазин („Шумен (2)") до „всички"',
      J(opts) === J(['Магазин: всички', 'Шумен (2)']), J(opts));
  }

  section('4. Комбинация с „📦 Пристигнала" → сечението');
  {
    const { w, doc } = await env(MANY);
    const sel = doc.getElementById('co-store-filter');
    const arrived = btnExact(doc.getElementById('co-filters'), '📦 Пристигнала');
    if (sel && arrived) {
      pick(w, sel, 'троян');
      realClick(w, arrived, '📦 Пристигнала');
      ok('Троян ∩ Пристигнала → t2, t3', J(rowIds(doc)) === J(['t2', 't3']), J(rowIds(doc)));
      pick(w, sel, 'асеновград');
      ok('Асеновград ∩ Пристигнала → празно', rowIds(doc).length === 0, J(rowIds(doc)));
      ok('изборът на магазин се пази след рендер', sel.value === 'асеновград', sel.value);
    } else ok('липсва select или бутон „Пристигнала"', false, 'sel=' + !!sel + ' arrived=' + !!arrived);
  }

  section('5. Изборът оцелява презареждане на данните');
  {
    const { w, doc } = await env(MANY);
    const sel = doc.getElementById('co-store-filter');
    if (sel) {
      pick(w, sel, 'враца');
      guard('loadClientOrders() отново', () => w.loadClientOrders());
      await ticks();
      ok('select-ът остава на „враца"', sel.value === 'враца', sel.value);
      ok('редовете са пак v1, v2', J(rowIds(doc)) === J(['v1', 'v2']), J(rowIds(doc)));
    } else ok('select-ът липсва', false);
  }

  report();
})();
