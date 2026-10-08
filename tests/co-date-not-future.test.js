/* Клиентски заявки — датата на заявката не може да е в бъдещето.

   Автоматичният срок (10 работни дни) се смята от „Дата", така че бъдеща дата
   скрито го удължава.
     · Нова заявка: date <= today(). Минала дата остава с confirm.
     · Корекция: date <= местната дата на created_at (не днес — иначе късна
       корекция би позволила преместване напред). Липсващ created_at → today().
       Непроменена дата на стар запис не се блокира.

   Пускане:  node tests/co-date-not-future.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btnExact, btn, ok, section, report,
        dayOffset, ticks } = H;

const USER = {
  email: 'p.georgieva@temax.bg', display_name: 'П. Георгиева',
  role: 'accounting', store_name: 'Централен офис',
  assigned_stores: ['Карлово', 'Пирдоп']
};
const STORES = [{ name: 'Карлово' }, { name: 'Пирдоп' }, { name: 'Централен офис' }];
const FUTURE_MSG = 'не може да е в бъдещето';
const AFTER_MSG = 'не може да е след';

/* Заявка, създадена преди 5 дни в обед (без зона на ръба). */
const CREATED = dayOffset(-5);
function oldOrder(over) {
  return Object.assign({
    id: 'o-1', in_num: 'Централен офис-0001', store_name: 'Централен офис',
    from_store: 'Пирдоп', fulfiller: 'Централен офис', status: 'pending',
    date: CREATED, hour: '10:00', customer_name: 'Иван Петров', phone: '0888111222',
    product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м',
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м' }],
    delivery: dayOffset(20), note: '', agent: 'П. Георгиева',
    created_at: CREATED + 'T12:00:00',
    co_eta: null, co_note: null, paid_transport: false, transport_id: null, group_id: null
  }, over);
}

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: USER, confirm: opts.confirm === undefined ? true : opts.confirm,
    data: { client_orders: [], transport_orders: [], stores: STORES }
  });
  h.w.clientOrders = JSON.parse(JSON.stringify([opts.order || oldOrder()]));
  h.w.transportOrders = [];
  h.w.clientOrders.forEach(o => { o._status = h.w.calcStatus(o.delivery, o.status); });
  return h;
}
const posted = calls => calls.post.some(p => /client_orders/.test(p.url));
const toasted = (calls, s) => calls.toast.some(m => String(m).indexOf(s) >= 0);

function newForm(confirmVal, dateVal) {
  const h = env({ confirm: confirmVal });
  h.w.openClientModal();
  if (dateVal !== undefined) {
    h.doc.getElementById('c-date').value = dateVal;
    fire(h.w, h.doc.getElementById('c-date'), 'change');
  }
  h.doc.getElementById('c-name').value = 'Нов Клиент';
  h.doc.getElementById('c-phone').value = '0899123456';
  h.doc.querySelector('#c-items .item-product').value = 'ТЕСТ ПРОДУКТ';
  h.doc.querySelector('#c-items .item-qty').value = '1';
  return h;
}
function submitNew(h) {
  realClick(h.w, btnExact(h.doc.getElementById('client-modal'), '✓ Запази заявката'));
}

function stubPatch(w) {
  const s = { n: 0, bodies: [] };
  w.sbPatch = function (t, f, b) { s.n++; s.bodies.push(JSON.parse(JSON.stringify(b))); return Promise.resolve({ ok: true }); };
  return s;
}
async function correct(h, dateVal) {
  const patch = stubPatch(h.w);
  h.w.openCorrection('o-1', 'client_orders');
  await ticks(4);
  h.doc.getElementById('edt-date').value = dateVal;
  realClick(h.w, btn(h.doc.getElementById('correction-modal'), 'Запази корекцията'), 'Запази корекцията');
  await ticks(6);
  return patch;
}

(async function run() {

  section('1. Нова заявка — max на полето');
  {
    const h = newForm(true);
    ok('c-date.max = today()', h.doc.getElementById('c-date').max === h.w.today(),
      h.doc.getElementById('c-date').max);
  }

  section('2. Нова заявка — реален клик на „Запази"');
  {
    const h = newForm(true, dayOffset(1));
    submitNew(h); await ticks();
    ok('дата УТРЕ → отказ (червен toast)', toasted(h.calls, FUTURE_MSG), JSON.stringify(h.calls.toast));
    ok('дата УТРЕ → записът НЕ се праща', !posted(h.calls));
    ok('дата УТРЕ → без confirm', h.calls.confirm.length === 0);
    ok('модалът остава отворен', h.doc.getElementById('client-modal').classList.contains('open'));
  }
  {
    const h = newForm(true, dayOffset(0));
    submitNew(h); await ticks();
    ok('дата ДНЕС (границата) → минава', posted(h.calls) && !toasted(h.calls, FUTURE_MSG));
    ok('дата ДНЕС → без confirm', h.calls.confirm.length === 0);
  }
  {
    const h = newForm(true, dayOffset(-1));
    submitNew(h); await ticks();
    ok('дата ВЧЕРА → confirm се вика', h.calls.confirm.some(m => String(m).indexOf('преди днес') >= 0));
    ok('след потвърждение → минава', posted(h.calls));
  }
  {
    const h = newForm(false, dayOffset(-1));
    submitNew(h); await ticks();
    ok('дата ВЧЕРА + отказ на confirm → не се записва', !posted(h.calls));
  }

  section('3. Корекция — max на полето');
  {
    const h = env();
    h.w.openCorrection('o-1', 'client_orders');
    await ticks(4);
    ok('edt-date.max = датата на създаване', h.doc.getElementById('edt-date').max === CREATED,
      h.doc.getElementById('edt-date').max + ' ≠ ' + CREATED);
    ok('не е днес', h.doc.getElementById('edt-date').max !== h.w.today());
  }
  {
    const h = env({ order: oldOrder({ created_at: null }) });
    h.w.openCorrection('o-1', 'client_orders');
    await ticks(4);
    ok('липсващ created_at → max = today()', h.doc.getElementById('edt-date').max === h.w.today(),
      h.doc.getElementById('edt-date').max);
  }

  section('4. Корекция — реален клик на „Запази корекцията"');
  {
    const h = env();
    const p = await correct(h, CREATED);
    ok('date = created_at (границата) → минава', p.n === 1 && !toasted(h.calls, AFTER_MSG), 'n=' + p.n);
  }
  {
    const h = env();
    const p = await correct(h, dayOffset(-4));
    ok('date = created_at+1 → отказ', p.n === 0 && toasted(h.calls, AFTER_MSG),
      'n=' + p.n + ' ' + JSON.stringify(h.calls.toast));
  }
  {
    const h = env();
    const p = await correct(h, dayOffset(1));
    ok('date = утре → отказ', p.n === 0 && toasted(h.calls, AFTER_MSG));
  }
  {
    const h = env();
    const p = await correct(h, dayOffset(-8));
    ok('по-стара дата → минава', p.n === 1);
  }
  {
    const h = env({ order: oldOrder({ created_at: null, date: dayOffset(-3) }) });
    let p = await correct(h, dayOffset(0));
    ok('липсващ created_at: date = днес → минава', p.n === 1, 'n=' + p.n);
    const h2 = env({ order: oldOrder({ created_at: null, date: dayOffset(-3) }) });
    p = await correct(h2, dayOffset(1));
    ok('липсващ created_at: date = утре → отказ', p.n === 0 && toasted(h2.calls, AFTER_MSG));
  }
  {
    /* Стар запис, чиято дата вече е след създаването (напр. 0029) — корекция
       с непроменена дата не се блокира. */
    const h = env({ order: oldOrder({ date: dayOffset(-2) }) });
    const p = await correct(h, dayOffset(-2));
    ok('непроменена дата, вече след created_at → не се блокира', p.n === 1, 'n=' + p.n);
  }

  report();
})();
