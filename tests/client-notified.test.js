/* „📞 Уведомен" — отметка, че клиентът е уведомен за пристигнала стока.
   Бутонът е само при arrived и само докато client_notified_at е празно;
   след това на негово място стои бадж (span) с името и часа, който остава
   видим и при done. Проверява се САМО <button> — баджът е span и не бива да
   се брои за бутон.

   Пускане: node tests/client-notified.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, dayOffset, tsOffset, ticks } = H;

function order(id, status, extra) {
  return Object.assign({
    id, in_num: 'Троян-' + id, store_name: 'Троян', fulfiller: 'Габрово',
    status, date: dayOffset(-3), hour: '10:00',
    customer_name: 'Иван Петров', phone: '0888111222',
    product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м',
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м' }],
    delivery: dayOffset(5), note: '', created_at: tsOffset(-3),
    co_eta: null, co_note: null, paid_transport: false, transport_id: null,
    client_notified_at: null, client_notified_by: null
  }, extra || {});
}

/* Фиксиран момент — очакваният текст в баджа се смята от него през
   локалните getter-и, както го прави coFmtStamp(). */
const NOTIFIED_AT = '2026-09-21T08:05:00.000Z';
const nd = new Date(NOTIFIED_AT);
const p2 = n => (n < 10 ? '0' : '') + n;
const SHORT = p2(nd.getDate()) + '.' + p2(nd.getMonth() + 1) + ' ' + p2(nd.getHours()) + ':' + p2(nd.getMinutes());

const ORDERS = [
  order('a1', 'arrived'),
  order('a2', 'arrived', { client_notified_at: NOTIFIED_AT, client_notified_by: 'Мария Каса' }),
  order('s1', 'sent'),
  order('d1', 'done', { client_notified_at: NOTIFIED_AT, client_notified_by: 'Мария Каса' }),
  order('d2', 'done')
];

const TROYAN = { email: 'troyan@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: 'Троян' };

function env(over) {
  over = over || {};
  const h = boot(Object.assign({
    modules: ['transport.js', 'client-orders.js', 'history.js', 'notifications.js'],
    user: TROYAN,
    data: { client_orders: ORDERS, transport_orders: [], stores: [] }
  }, over));
  h.w.transportOrders = [];
  h.w.clientOrders = JSON.parse(JSON.stringify(ORDERS));
  h.w.clientOrders.forEach(o => {
    o._status = h.w.calcStatus(o.delivery, o.status);
    o._days = h.w.calcElapsed(o.created_at, o.date);
    o._isFulfiller = h.w.coIsMineToFulfill(o);
  });
  return h;
}

/* Само <button> — span/div с „уведомен" НЕ се брои. */
const notifyBtns = row => Array.prototype.filter.call(row.querySelectorAll('button'),
  b => b.textContent.indexOf('Уведомен') >= 0);
const badgeOf = row => Array.prototype.filter.call(row.querySelectorAll('span'),
  s => s.textContent.indexOf('📞 уведомен') >= 0)[0] || null;

(async function run() {

  section('1. arrived без отметка → бутон „📞 Уведомен"; реален клик → PATCH');
  {
    const { w, doc, calls } = env();
    guard('renderClientOrders()', () => w.renderClientOrders());
    const row = doc.getElementById('co-row-a1');
    ok('редът a1 съществува', !!row);
    const b = row && notifyBtns(row);
    ok('точно един <button> „📞 Уведомен"', b && b.length === 1, b && b.length);
    ok('няма бадж, докато не е отбелязано', row && !badgeOf(row));
    ok('„✅ Изпълнена" си стои до него', row && !!btn(row, 'Изпълнена'));
    if (b && b.length) {
      const before = Date.now();
      realClick(w, b[0], '📞 Уведомен');
      await ticks();
      const p = calls.patch.filter(x => x.table === 'client_orders');
      ok('точно един PATCH към client_orders', p.length === 1, p.length);
      if (p.length) {
        ok('PATCH-ът е по id=eq.a1', /id=eq\.a1(&|$)/.test(p[0].url), p[0].url);
        const t = Date.parse(p[0].body.client_notified_at);
        ok('client_notified_at е ISO време от момента на клика',
          !isNaN(t) && t >= before - 1000 && t <= Date.now() + 1000, p[0].body.client_notified_at);
        ok('client_notified_by = display_name на потребителя',
          p[0].body.client_notified_by === 'Управител Троян', p[0].body.client_notified_by);
        ok('статусът НЕ се пипа', !('status' in p[0].body), JSON.stringify(p[0].body));
      }
      ok('зелен toast за успех', calls.toast.some(m => String(m.msg || m).indexOf('отбелязан като уведомен') >= 0),
        JSON.stringify(calls.toast));
      ok('след записа данните се презареждат (GET client_orders)',
        calls.get.some(u => /\/client_orders/.test(u)));
    }
  }

  section('2. Провален запис → червен toast, без „успех"');
  {
    const { w, doc, calls } = env({ fail: { PATCH: true } });
    guard('renderClientOrders()', () => w.renderClientOrders());
    const b = notifyBtns(doc.getElementById('co-row-a1'));
    if (ok('бутонът е там', b.length === 1)) {
      realClick(w, b[0], '📞 Уведомен');
      await ticks();
      const msgs = calls.toast.map(m => String(m.msg || m));
      ok('toast „Грешка при запис"', msgs.some(m => m.indexOf('Грешка при запис') >= 0), JSON.stringify(msgs));
      ok('няма toast за успех', !msgs.some(m => m.indexOf('отбелязан като уведомен') >= 0));
    }
  }

  section('3. arrived с отметка → бадж с името, без бутон');
  {
    const { w, doc } = env();
    guard('renderClientOrders()', () => w.renderClientOrders());
    const row = doc.getElementById('co-row-a2');
    ok('няма <button> „📞 Уведомен"', row && notifyBtns(row).length === 0);
    const s = row && badgeOf(row);
    ok('има бадж (span)', !!s);
    if (s) {
      ok('баджът носи името', s.textContent.indexOf('Мария Каса') >= 0, s.textContent);
      ok('баджът носи дд.мм чч:мм (' + SHORT + ')', s.textContent.indexOf(SHORT) >= 0, s.textContent);
      ok('title съдържа пълната дата с година', (s.getAttribute('title') || '').indexOf(String(nd.getFullYear())) >= 0,
        s.getAttribute('title'));
    }
  }

  section('4. sent → нито бутон, нито бадж');
  {
    const { w, doc } = env();
    guard('renderClientOrders()', () => w.renderClientOrders());
    const row = doc.getElementById('co-row-s1');
    ok('редът s1 съществува', !!row);
    ok('няма <button> „📞 Уведомен"', row && notifyBtns(row).length === 0);
    ok('няма бадж', row && !badgeOf(row));
    ok('„📦 Пристигнала" си е на мястото', row && !!btn(row, 'Пристигнала'));
  }

  section('5. done с отметка → бадж остава, бутон няма; done без отметка → нищо');
  {
    const { w, doc } = env();
    guard('renderClientOrders()', () => w.renderClientOrders());
    const r1 = doc.getElementById('co-row-d1');
    ok('d1: няма <button> „📞 Уведомен"', r1 && notifyBtns(r1).length === 0);
    const s = r1 && badgeOf(r1);
    ok('d1: баджът е видим', !!s && s.textContent.indexOf('Мария Каса') >= 0);
    const r2 = doc.getElementById('co-row-d2');
    ok('d2: няма бутон', r2 && notifyBtns(r2).length === 0);
    ok('d2: няма бадж', r2 && !badgeOf(r2));
  }

  section('6. Детайлен изглед — ред „Клиентът уведомен"');
  {
    const { w, doc } = env();
    const rowText = id => {
      guard('openClientOrderDetail(' + id + ')', () => w.openClientOrderDetail(id));
      const ov = doc.getElementById('cod-ov');
      const lbl = ov && Array.prototype.filter.call(ov.querySelectorAll('div'),
        d => d.children.length === 0 && d.textContent === 'Клиентът уведомен')[0];
      return lbl ? lbl.nextElementSibling.textContent : null;
    };
    const t2 = rowText('a2');
    ok('a2: редът съществува', t2 !== null);
    ok('a2: име + дата', t2 && t2.indexOf('Мария Каса') >= 0 && t2.indexOf(String(nd.getFullYear())) >= 0, t2);
    const t1 = rowText('a1');
    ok('a1 (без отметка): „—"', t1 === '—', t1);
  }

  report();
})();
