/* Признак "закъсняла" (isLate/lateBadge) отделно от статуса.

   Защо изобщо съществува: calcStatus() връща статуса непроменен за
   ['done','refused','postponed','approved','arrived','sent','processed'],
   тоест заявка, която веднъж е тръгнала, НИКОГА не получава
   _status==='overdue'. Чипът "Просрочени" затова връщаше празна таблица
   дори при изтекли дати на доставка.

   Тестът кликa ИСТИНСКИ по чипа (inline onclick="filterOrders('overdue',this)")
   и в Клиентски заявки, и в Транспорт, и проверява, че статусният бадж
   ОСТАВА до новия чип, а не е заменен от него.

   Пускане от корена на репото:
     node tests/late-flag.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, dayOffset, tsOffset } = H;

const USER = {
  email: 'troyan@temax.bg', display_name: 'Магазин Троян',
  role: 'store', store_name: 'Троян'
};

function co(over) {
  return Object.assign({
    id: 'x', in_num: '0000', store_name: 'Троян', fulfiller: 'Централен офис',
    status: 'pending', date: dayOffset(-10), hour: '10:00',
    customer_name: 'Иван Петров', phone: '0888111222',
    product: 'ПАРКЕТ', sap: '111', qty: 1, unit: 'бр.',
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 1, unit: 'бр.' }],
    delivery: dayOffset(-1), note: '', created_at: tsOffset(-10),
    co_eta: null, co_note: null, paid_transport: false, transport_id: null
  }, over);
}

/* Клиентски заявки. Доставката е ВЧЕРА навсякъде, освен където е казано —
   така единствената променлива е статусът. */
const ORDERS = [
  co({ id: 'c-sent', in_num: '0001', status: 'sent' }),
  co({ id: 'c-arrived', in_num: '0002', status: 'arrived' }),
  co({ id: 'c-proc-future', in_num: '0003', status: 'processed', co_eta: dayOffset(1) }),
  co({ id: 'c-proc-past', in_num: '0004', status: 'processed', co_eta: dayOffset(-1) }),
  co({ id: 'c-postponed', in_num: '0005', status: 'postponed' }),
  co({ id: 'c-done', in_num: '0006', status: 'done' }),
  co({ id: 'c-refused', in_num: '0007', status: 'refused' }),
  co({ id: 'c-nodate', in_num: '0008', status: 'sent', delivery: null }),
  co({ id: 'c-pending', in_num: '0009', status: 'pending' }),
  /* Контрола отгоре: бъдеща доставка не е закъсняла при никакъв статус. */
  co({ id: 'c-future', in_num: '0010', status: 'sent', delivery: dayOffset(3) })
];

/* Очакваният признак за всяка заявка — таблицата е самият тест. */
const EXPECT = {
  'c-sent': true, 'c-arrived': true, 'c-proc-future': false, 'c-proc-past': true,
  'c-postponed': false, 'c-done': false, 'c-refused': false, 'c-nodate': false,
  'c-pending': true, 'c-future': false
};
const LATE_IDS = Object.keys(EXPECT).filter(k => EXPECT[k]).sort();

const TRANSPORT = [
  { id: 't-await', in_num: 'T-1', store_name: 'Троян', status: 'sent',
    date: dayOffset(-10), hour: '09:00', customer_name: 'Петър Тестов', phone: '0888999000',
    product: 'ДИВАН', sap: '900', qty: 1, unit: 'бр.',
    items: [{ product: 'ДИВАН', sap: '900', qty: 1, unit: 'бр.' }],
    address: 'ул. Тестова 1', delivery: dayOffset(-1), created_at: tsOffset(-10),
    awaiting_stock: true, client_order_num: 'Троян-0042' },
  { id: 't-late', in_num: 'T-2', store_name: 'Троян', status: 'sent',
    date: dayOffset(-10), hour: '09:00', customer_name: 'Мария Тестова', phone: '0888999111',
    product: 'МАСА', sap: '901', qty: 1, unit: 'бр.',
    items: [{ product: 'МАСА', sap: '901', qty: 1, unit: 'бр.' }],
    address: 'ул. Тестова 2', delivery: dayOffset(-1), created_at: tsOffset(-10),
    awaiting_stock: false, client_order_num: null }
];

function env(over) {
  over = over || {};
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'history.js', 'notifications.js'],
    user: USER,
    data: { client_orders: ORDERS, transport_orders: TRANSPORT, stores: [] }
  });

  h.w.clientOrders = JSON.parse(JSON.stringify(over.orders || ORDERS));
  h.w.clientOrders.forEach(o => {
    o._status = h.w.calcStatus(o.delivery, o.status);
    o._days = h.w.calcElapsed(o.created_at);
    o._isFulfiller = false;
  });
  h.w.transportOrders = JSON.parse(JSON.stringify(over.transport || TRANSPORT));
  h.w.transportOrders.forEach(o => {
    const st = h.w.calcStatus(o.delivery, o.status);
    o._status = (o.awaiting_stock && ['done', 'refused', 'postponed'].indexOf(o.status) < 0) ? 'awaiting' : st;
    o._days = h.w.calcElapsed(o.created_at);
  });
  return h;
}

function rowIds(doc, bodyId) {
  const body = doc.getElementById(bodyId);
  if (!body) return null;
  return Array.prototype.slice.call(body.getElementsByTagName('tr'))
    .map(tr => tr.id).filter(id => id && id.indexOf('co-row-') === 0)
    .map(id => id.slice('co-row-'.length));
}

(async function run() {

  section('1. isLate() — по един случай на ред от заявката');
  {
    const { w } = env();
    const byId = {};
    w.clientOrders.forEach(o => { byId[o.id] = o; });

    ok('sent + доставка вчера → true', w.isLate(byId['c-sent']) === true);
    ok('arrived + доставка вчера → true', w.isLate(byId['c-arrived']) === true);
    ok('processed + co_eta УТРЕ → false (доставчикът е в срок)',
      w.isLate(byId['c-proc-future']) === false);
    ok('processed + co_eta ВЧЕРА → true (срокът на доставчика мина)',
      w.isLate(byId['c-proc-past']) === true);
    ok('postponed → false', w.isLate(byId['c-postponed']) === false);
    ok('done → false', w.isLate(byId['c-done']) === false);
    ok('refused → false', w.isLate(byId['c-refused']) === false);
    ok('pending + доставка вчера → true (както старото overdue)',
      w.isLate(byId['c-pending']) === true);
    ok('бъдеща доставка → false', w.isLate(byId['c-future']) === false);
  }

  section('2. Липсващи данни — не хвърля');
  {
    const { w } = env();
    const byId = {};
    w.clientOrders.forEach(o => { byId[o.id] = o; });

    ok('delivery=null → false', w.isLate(byId['c-nodate']) === false);
    guard('isLate(null) не хвърля', () => { if (w.isLate(null) !== false) throw new Error('не е false'); });
    guard('isLate(undefined) не хвърля', () => { if (w.isLate(undefined) !== false) throw new Error('не е false'); });
    guard('isLate({}) не хвърля', () => { if (w.isLate({}) !== false) throw new Error('не е false'); });
    ok('заявка без status, но с изтекла доставка → true',
      w.isLate({ delivery: dayOffset(-2) }) === true);
    ok('доставка ДНЕС не е закъсняла (граница)',
      w.isLate({ delivery: dayOffset(0), status: 'sent' }) === false);
    ok('доставка вчера е закъсняла (границата от другата страна)',
      w.isLate({ delivery: dayOffset(-1), status: 'sent' }) === true);
  }

  section('3. Транспорт, чакащ стока — изключен');
  {
    const { w } = env();
    const byId = {};
    w.transportOrders.forEach(o => { byId[o.id] = o; });

    ok('awaiting_stock=true + доставка вчера → false',
      w.isLate(byId['t-await']) === false);
    ok('същият транспорт БЕЗ awaiting_stock → true',
      w.isLate(byId['t-late']) === true);
    ok('awaiting_stock, но вече done → пак false (приключените не текат)',
      w.isLate({ delivery: dayOffset(-1), status: 'done', awaiting_stock: true }) === false);
  }

  section('4. lateBadge() — съдържание и множествено число');
  {
    const { w } = env();
    ok('не закъсняла → празен низ', w.lateBadge({ delivery: dayOffset(3), status: 'sent' }) === '');
    const b8 = w.lateBadge({ delivery: dayOffset(-8), status: 'sent' });
    ok('8 дни → "🔴 +8 дни"', b8.indexOf('🔴 +8 дни') >= 0, b8);
    const b1 = w.lateBadge({ delivery: dayOffset(-1), status: 'sent' });
    ok('1 ден → "+1 ден", не "+1 дни"', b1.indexOf('+1 ден<') >= 0, b1);
    ok('носи червения фон на statusBadge', b8.indexOf('background:#fee2e2') >= 0, b8);
    ok('има margin-left, за да не се лепне за статуса',
      b8.indexOf('margin-left:4px') >= 0, b8);
  }

  /* ── Истински клик по чипа ─────────────────────────────────────────────── */
  section('5. Клиентски заявки — истински клик по "🔴 Просрочени"');
  {
    const { w, doc } = env();
    w.renderClientOrders();
    ok('преди клика се виждат всичките 10', (rowIds(doc, 'co-body') || []).length === 10);

    const chip = btn(doc.getElementById('co-filters'), 'Просрочени');
    if (ok('чипът съществува', !!chip) &&
        guard('кликът не хвърля', () => realClick(w, chip))) {
      const ids = (rowIds(doc, 'co-body') || []).sort();
      ok('orderFilter стана overdue', w.orderFilter === 'overdue');
      ok('излизат точно закъснелите 4', ids.join(',') === LATE_IDS.join(','),
        'получено: ' + ids.join(',') + ' | очаквано: ' + LATE_IDS.join(','));
      ok('c-sent излиза — точно случаят, който старият критерий изпускаше',
        ids.indexOf('c-sent') >= 0);
      ok('c-proc-future НЕ излиза (доставчикът е в срок)', ids.indexOf('c-proc-future') < 0);
      ok('c-postponed НЕ излиза', ids.indexOf('c-postponed') < 0);
      ok('c-nodate НЕ излиза', ids.indexOf('c-nodate') < 0);

      /* Баджът за статус НЕ е заменен от новия чип. */
      const row = doc.getElementById('co-row-c-sent');
      if (ok('редът на c-sent е изрисуван', !!row)) {
        ok('статусният бадж "📤 Изпратена" ВСЕ ОЩЕ се вижда',
          row.textContent.indexOf('Изпратена') >= 0, row.textContent);
        ok('до него стои и чипът за закъснение',
          /\+\d+ (ден|дни)/.test(row.textContent), row.textContent);
        ok('двата са в една клетка, статусът е първи',
          row.textContent.indexOf('Изпратена') < row.textContent.search(/\+\d+ (ден|дни)/));
      }
    }

    /* Другите чипове не са пипани. */
    const chipAll = btn(doc.getElementById('co-filters'), 'Всички');
    realClick(w, chipAll);
    ok('чипът "Всички" пак дава 10', (rowIds(doc, 'co-body') || []).length === 10);
    const chipDone = btn(doc.getElementById('co-filters'), 'Изпълнена');
    realClick(w, chipDone);
    ok('чипът "Изпълнена" остава непроменен — само c-done',
      (rowIds(doc, 'co-body') || []).join(',') === 'c-done',
      (rowIds(doc, 'co-body') || []).join(','));
  }

  section('6. Транспорт — истински клик по "🔴 Просрочени"');
  {
    const { w, doc } = env();
    if (guard('renderTransport() не хвърля', () => w.renderTransport())) {
      const chip = btn(doc.getElementById('tr-filters'), 'Просрочени');
      if (ok('чипът съществува', !!chip) &&
          guard('кликът не хвърля', () => realClick(w, chip))) {
        const body = doc.getElementById('tr-body');
        const txt = body ? body.textContent : '';
        ok('transportFilter стана overdue', w.transportFilter === 'overdue');
        /* Таблицата на Транспорт не изписва in_num — разпознаваме реда по клиента. */
        ok('закъснелият транспорт (Мария/МАСА) излиза',
          txt.indexOf('Мария Тестова') >= 0, txt.slice(0, 200));
        ok('чакащият стока (Петър/ДИВАН) НЕ излиза',
          txt.indexOf('Петър Тестов') < 0, txt.slice(0, 200));
        ok('чипът за закъснение е на реда', /\+\d+ (ден|дни)/.test(txt), txt.slice(0, 200));
      }
    }
  }

  section('7. История — същите данни, същият чип (правило 7)');
  {
    const { w, doc } = env();
    w.renderHistoryShell();   /* създава #h-results */
    w.histData = {
      transport: [Object.assign({}, TRANSPORT[1])],
      client: [Object.assign({}, ORDERS[0])],
      kasa: [], storno: []
    };
    if (guard('renderHistoryResults() не хвърля', () => w.renderHistoryResults())) {
      const wrap = doc.getElementById('h-results');
      const txt = wrap ? wrap.textContent : '';
      ok('клиентската заявка в История носи чипа',
        /\+\d+ (ден|дни)/.test(txt), txt.slice(0, 300));
      ok('статусът ѝ пак се вижда', txt.indexOf('Изпратена') >= 0);
    }
  }

  section('8. История — чакащият стока транспорт НЕ получава чип');
  {
    const { w, doc } = env();
    w.renderHistoryShell();
    w.histData = {
      transport: [Object.assign({}, TRANSPORT[0])],  /* awaiting_stock:true */
      client: [], kasa: [], storno: []
    };
    if (guard('renderHistoryResults() не хвърля', () => w.renderHistoryResults())) {
      const wrap = doc.getElementById('h-results');
      const txt = wrap ? wrap.textContent : '';
      ok('баджът "Чака стока" стои', txt.indexOf('Чака стока') >= 0, txt.slice(0, 300));
      ok('чип за закъснение НЯМА', !/\+\d+ (ден|дни)/.test(txt), txt.slice(0, 300));
    }
  }

  /* ── КОНТРОЛЕН ТЕСТ ────────────────────────────────────────────────────── */
  section('9. Контролен тест — със стария критерий c-sent ИЗПАДА от чипа');
  {
    const { w, doc } = env();
    /* Връщаме точно предишното поведение: критерият е статусът, не датата. */
    w.isLate = function (o) { return !!o && o._status === 'overdue'; };
    w.renderClientOrders();

    const chip = btn(doc.getElementById('co-filters'), 'Просрочени');
    realClick(w, chip);
    const ids = (rowIds(doc, 'co-body') || []).sort();

    ok('СЪС стария критерий c-sent изпада', ids.indexOf('c-sent') < 0, ids.join(','));
    ok('СЪС стария критерий c-arrived изпада', ids.indexOf('c-arrived') < 0, ids.join(','));
    ok('СЪС стария критерий c-proc-past изпада', ids.indexOf('c-proc-past') < 0, ids.join(','));
    ok('остава само c-pending — единственото, което старият критерий хващаше',
      ids.join(',') === 'c-pending', ids.join(','));
    ok('тоест новият критерий добавя 3 заявки, които преди се губеха',
      LATE_IDS.length - ids.length === 3, LATE_IDS.length + ' срещу ' + ids.length);
  }

  report();
})();
