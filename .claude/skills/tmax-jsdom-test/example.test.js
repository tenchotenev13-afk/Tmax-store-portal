/* Примерен тест — копирай го като test-<фийчър>.js в КОРЕНА на репото и
   пренапиши секциите. Показва целия шаблон: данни → boot → рендер →
   истински клик → проверка на PATCH/POST → доклад.

   Пускане както е (от корена на репото):
     node .claude/skills/tmax-jsdom-test/example.test.js .

   ⚠️ След копиране в корена смени require-а на:
     const H = require('./.claude/skills/tmax-jsdom-test/harness');
*/
'use strict';

const H = require('./harness');
const { boot, realClick, btn, btnExact, ok, guard, section, report, dayOffset, tsOffset, ticks } = H;

/* ── 1. Данни в същата форма като в Supabase ─────────────────────────────── */
const ORDERS = [
  {
    id: 'o-1', in_num: '9001', store_name: 'Троян', fulfiller: 'Централен офис',
    status: 'pending', date: dayOffset(-3), hour: '10:00',
    customer_name: 'Иван Петров', phone: '0888111222',
    product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м',
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м' }],
    delivery: dayOffset(10), note: '', created_at: tsOffset(-3),
    co_eta: null, co_note: null, paid_transport: false, transport_id: null
  },
  /* Клиент с апостроф в името — класическият escaping капан за inline onclick */
  {
    id: 'o-2', in_num: '9002', store_name: 'Троян', fulfiller: 'Централен офис',
    status: 'pending', date: dayOffset(-1), hour: '11:00',
    customer_name: "Д'Артанян О'Брайън", phone: '0888333444',
    product: 'МИВКА', sap: '222', qty: 1, unit: 'бр.',
    items: [{ product: 'МИВКА', sap: '222', qty: 1, unit: 'бр.' }],
    delivery: dayOffset(6), note: '', created_at: tsOffset(-1),
    co_eta: null, co_note: null, paid_transport: false, transport_id: null
  }
];

const CO_USER = {
  email: 'sn@temax.bg', display_name: 'Снабдяване ЦО',
  role: 'supply', store_name: 'Централен офис'
};

/* ── 2. Помощна обвивка над boot() за този тест ──────────────────────────── */
function env(over) {
  over = over || {};
  const h = boot(Object.assign({
    /* notifications.js е тук, защото client-orders.js вика updateBadges() от
       него след PATCH. Без него в списъка тестът минава, но в конзолата тихо
       седи "updateBadges is not defined" — точно това е причината модулите да
       се зареждат заедно, а не поотделно. */
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: CO_USER,
    data: { client_orders: ORDERS, transport_orders: [], stores: [] }
  }, over));

  /* Модулните файлове държат данните в глобални масиви — попълваме ги както
     истинският loadClientOrders() би направил след sbGet. */
  h.w.transportOrders = [];
  h.w.clientOrders = JSON.parse(JSON.stringify(over.orders || ORDERS));
  h.w.clientOrders.forEach(o => {
    o._status = h.w.calcStatus(o.delivery, o.status);
    o._days = h.w.calcElapsed(o.created_at);
    o._isFulfiller = !h.w.isGlobal() &&
      o.fulfiller === h.w.currentUser.store_name &&
      o.store_name !== h.w.currentUser.store_name;
  });
  return h;
}

(async function run() {

  section('1. Средата се вдига и реалният код се зарежда');
  {
    const { w } = env();
    ok('shared.js е зареден (esc съществува)', typeof w.esc === 'function');
    ok('client-orders.js е зареден (renderClientOrders съществува)',
      typeof w.renderClientOrders === 'function');
    ok('currentUser е зададен', w.currentUser.store_name === 'Централен офис');
    ok('липсващите load* функции са stub-нати', typeof w.loadKasa === 'function');
  }

  section('2. Рендерът пълни DOM-а');
  {
    const { w, doc } = env();
    /* guard() вместо гол извиква — един ReferenceError в модула се докладва
       като паднала проверка, а не убива останалите секции. */
    if (guard('renderClientOrders() не хвърля', () => w.renderClientOrders())) {
      const row = doc.getElementById('co-row-o-1');
      ok('редът за o-1 съществува', !!row);
      ok('показва номера на заявката', !!row && row.textContent.indexOf('9001') >= 0);
      ok('показва името на клиента', !!row && row.textContent.indexOf('Иван Петров') >= 0);
    }
  }

  section('3. Истински клик — не само наличие на markup');
  {
    const { w, doc } = env();
    w.openClientModal();
    const modal = doc.getElementById('client-modal');
    ok('модалът за нова заявка се отваря', modal.classList.contains('open'));

    const cancel = btnExact(modal, 'Откажи');
    ok('бутонът "Откажи" съществува', !!cancel);
    realClick(w, cancel, 'Откажи');
    ok('и наистина затваря модала при клик', !modal.classList.contains('open'));
  }

  section('4. Escaping — клиент с апостроф в името');
  {
    const { w, doc } = env();
    guard('рендер за escaping проверката', () => w.renderClientOrders());
    const row = doc.getElementById('co-row-o-2');
    if (ok('редът се рендерира', !!row)) {
      const anyBtn = row.querySelector('button[onclick]');
      if (ok('редът има поне един бутон с onclick', !!anyBtn)) {
        let broke = null;
        try { w.eval('(function(){' + anyBtn.getAttribute('onclick') + '})'); }
        catch (e) { broke = e.message; }
        ok('onclick-ът е валиден JS въпреки апострофа', !broke, broke);
      }
    }
  }

  section('5. Мутациите се хващат');
  {
    const { w, doc, calls } = env();
    guard('рендер преди клика', () => w.renderClientOrders());
    const sent = btn(doc.getElementById('co-row-o-1'), 'Изпратена');
    if (sent) {
      realClick(w, sent, 'Изпратена');
      await ticks();
      ok('клик по "Изпратена" праща PATCH към client_orders',
        calls.patch.some(p => p.table === 'client_orders'));
    } else {
      ok('бутон "Изпратена" се намира в реда', false, 'няма такъв бутон');
    }
  }

  report();
})();
