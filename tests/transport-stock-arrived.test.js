/* „📦 Стоката е в магазина" — транспорт по клиентска заявка, чиято стока
   вече е пристигнала (syncLinkedTransport() нулира awaiting_stock).
   Статусът остава по дата; баджът стои ДО него, не вместо него.

   Условие (stockArrivedBadge в shared.js):
     client_order_id && awaiting_stock===false && status ∉ done/refused/postponed

   Зареждат се shared.js + transport.js + history.js заедно (реда от
   index.html). Транспортът минава през истинския loadTransport(), тоест
   _status се смята от реалния код, не от копие на правилото тук.

   Мутационна проверка (15.10.2026) — всеки от вариантите събаря теста:
     1) махнато `!o.client_order_id||`          → пада (транспорт без заявка)
     2) `awaiting_stock!==false` → `!==true`     → пада (обърнат флаг)
     3) махнато изключването на done/refused/... → пада (приключен транспорт)
     4) махнат stockArrivedBadge(o) от реда в transport.js → пада
     5) махнат stockArrivedBadge(o) от history.js → пада
     6) махнат клонът „Стока" в детайла          → пада

   Пускане: node tests/transport-stock-arrived.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, bubbleClick, ok, guard, section, report, dayOffset, tsOffset, ticks } = H;

const BADGE = '📦 Стоката е в магазина';
const DETAIL = '📦 пристигнала в магазина';

function tr(id, over) {
  return Object.assign({
    id: id, store_name: 'Петрич', date: dayOffset(-2), hour: '10:00', bon: 'Б-1',
    customer_name: 'Клиент ' + id, phone: '0888000000', address: 'гр. Петрич',
    product: 'ПЛОЧКИ', color: '', sap: '111', qty: 1, unit: 'бр.',
    items: [{ sap: '111', product: 'ПЛОЧКИ', color: '', qty: 1, unit: 'бр.' }],
    delivery: dayOffset(3), status: 'pending', notes: null,
    client_order_id: null, client_order_num: null, awaiting_stock: null,
    created_at: tsOffset(-2)
  }, over);
}

const TRANSPORT = [
  /* стоката е дошла, статус по дата → БАДЖ */
  tr('t-arr',  { client_order_id: 'co-1', client_order_num: 'Петрич-0001', awaiting_stock: false }),
  /* още чака стока → „Чака стока", без бадж */
  tr('t-wait', { client_order_id: 'co-2', client_order_num: 'Петрич-0002', awaiting_stock: true }),
  /* без клиентска заявка, но с false (стари записи) → без бадж */
  tr('t-plain', { awaiting_stock: false }),
  /* без клиентска заявка, null → без бадж */
  tr('t-null', {}),
  /* приключени по клиентска заявка → без бадж */
  tr('t-done', { client_order_id: 'co-3', awaiting_stock: false, status: 'done' }),
  tr('t-ref',  { client_order_id: 'co-4', awaiting_stock: false, status: 'refused' }),
  tr('t-post', { client_order_id: 'co-5', awaiting_stock: false, status: 'postponed' }),
  /* стоката е дошла, а доставката е утре → бадж до „Утре" */
  tr('t-tom',  { client_order_id: 'co-6', awaiting_stock: false, delivery: dayOffset(1) })
];

const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin', store_name: 'Централен офис' };

function env() {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'kasa.js', 'kasa-docs.js', 'history.js', 'notifications.js'],
    user: ADMIN,
    data: { transport_orders: TRANSPORT, client_orders: [], stores: [] }
  });
  h.w.clientOrders = [];
  return h;
}

const row = (doc, id) => doc.getElementById('tr-row-' + id);
const txt = el => el ? el.textContent : '';

(async function run() {

  section('0. функцията съществува — пряко срещу условието');
  {
    const { w } = env();
    if (ok('stockArrivedBadge е глобална функция', typeof w.stockArrivedBadge === 'function')) {
      const b = w.stockArrivedBadge;
      ok('пристигнала → бадж', b(TRANSPORT[0]).indexOf(BADGE) >= 0);
      ok('чака стока → празно', b(TRANSPORT[1]) === '');
      ok('без client_order_id, false → празно', b(TRANSPORT[2]) === '');
      ok('без client_order_id, null → празно', b(TRANSPORT[3]) === '');
      ok('done → празно', b(TRANSPORT[4]) === '');
      ok('refused → празно', b(TRANSPORT[5]) === '');
      ok('postponed → празно', b(TRANSPORT[6]) === '');
      ok('с client_order_id, но awaiting_stock липсва (undefined) → празно',
        b({ client_order_id: 'x', status: 'pending' }) === '');
      ok('null/undefined вход → празно, без грешка', b(null) === '' && b(undefined) === '');
      ok('стилът: 10px, 20px радиус, #dcfce7 / #14532d',
        /font-size:10px/.test(b(TRANSPORT[0])) && /border-radius:20px/.test(b(TRANSPORT[0])) &&
        /#dcfce7/.test(b(TRANSPORT[0])) && /#14532d/.test(b(TRANSPORT[0])));
    }
  }

  section('1. Транспорт — редът в таблицата (през истинския loadTransport)');
  const h1 = env();
  {
    const { w, doc } = h1;
    guard('loadTransport()', () => w.loadTransport());
    for (let i = 0; i < 8; i++) await ticks();
    ok('заредени са всички транспорти', (w.transportOrders || []).length === TRANSPORT.length,
      String((w.transportOrders || []).length));
    const arr = (w.transportOrders || []).find(o => o.id === 't-arr');
    ok('_status на пристигналия остава по дата (pending, не awaiting)', !!arr && arr._status === 'pending',
      arr && arr._status);

    const rArr = row(doc, 't-arr');
    ok('t-arr: баджът го има', txt(rArr).indexOf(BADGE) >= 0);
    ok('t-arr: статусът е „Изчаква" (по дата)', txt(rArr).indexOf('Изчаква') >= 0);
    ok('t-arr: НЯМА „Чака стока"', txt(rArr).indexOf('Чака стока') < 0);
    ok('t-arr: баджът е в същата клетка, веднага след статуса',
      !!rArr && Array.from(rArr.querySelectorAll('td')).some(td => {
        const sp = td.querySelectorAll('span');
        return sp.length >= 2 && /Изчаква/.test(sp[0].textContent) && sp[1].textContent === BADGE;
      }));

    const rWait = row(doc, 't-wait');
    ok('t-wait: има „Чака стока"', txt(rWait).indexOf('Чака стока') >= 0);
    ok('t-wait: НЯМА бадж', !!rWait && txt(rWait).indexOf(BADGE) < 0);

    ['t-plain', 't-null', 't-post'].forEach(id => {
      const r = row(doc, id);
      ok(id + ': редът е на екрана и НЯМА бадж', !!r && txt(r).indexOf(BADGE) < 0);
    });
    /* done/refused не са в подразбиращия се чип „Активни" — истински клик на „Всички". */
    const allChip = doc.querySelector('#tr-filters .filter-btn[data-tr-f="all"]');
    ok('чипът „Всички" съществува', !!allChip);
    if (allChip) guard('клик „Всички"', () => realClick(w, allChip, 'Всички'));
    ['t-done', 't-ref'].forEach(id => {
      const r = row(doc, id);
      ok(id + ': с „Всички" редът е на екрана и НЯМА бадж', !!r && txt(r).indexOf(BADGE) < 0);
    });
    const rDone = row(doc, 't-done');
    ok('t-done: статусът е „Изпълнена"', txt(rDone).indexOf('Изпълнена') >= 0);

    const rTom = row(doc, 't-tom');
    ok('t-tom: „Утре" + бадж', txt(rTom).indexOf('Утре') >= 0 && txt(rTom).indexOf(BADGE) >= 0);
  }

  section('2. Транспорт — детайлът при истински клик по реда');
  {
    const { w, doc } = h1;
    const openDetail = id => {
      const old = doc.getElementById('trd-ov'); if (old) old.remove();
      const r = row(doc, id);
      const td = r ? r.querySelector('td') : null;
      if (td) guard('клик по реда ' + id, () => bubbleClick(w, td));
      return doc.getElementById('trd-ov');
    };
    const dArr = openDetail('t-arr');
    ok('t-arr: детайлът се отваря', !!dArr);
    ok('t-arr: ред „Стока" = пристигнала в магазина', txt(dArr).indexOf(DETAIL) >= 0);
    ok('t-arr: НЯМА „чака стока"', !!dArr && txt(dArr).indexOf('чака стока') < 0);

    const dWait = openDetail('t-wait');
    ok('t-wait: „чака стока по клиентска заявка"', txt(dWait).indexOf('чака стока по клиентска заявка') >= 0);
    ok('t-wait: НЯМА „пристигнала в магазина"', !!dWait && txt(dWait).indexOf(DETAIL) < 0);

    ['t-plain', 't-null', 't-done'].forEach(id => {
      const d = openDetail(id);
      ok(id + ': детайлът се отваря, без ред „пристигнала"', !!d && txt(d).indexOf(DETAIL) < 0);
    });
  }

  section('3. История — редът на транспорта');
  {
    const { w, doc } = env();
    guard('renderHistoryShell()', () => w.renderHistoryShell());
    w.eval('histFilter.from=' + JSON.stringify(dayOffset(-10)) + ';histFilter.to=' + JSON.stringify(dayOffset(0)) + ';histFilter.store="";');
    w.histData.transport = JSON.parse(JSON.stringify(TRANSPORT));
    w.histData.client = []; w.histData.kasa = []; w.histData.storno = [];
    guard('renderHistoryResults()', () => w.renderHistoryResults());
    const wrap = doc.getElementById('h-results');
    const hRow = id => wrap ? Array.from(wrap.querySelectorAll('tr')).find(r => r.textContent.indexOf('Клиент ' + id) >= 0) : null;

    const a = hRow('t-arr');
    ok('t-arr: редът е в Историята', !!a);
    ok('t-arr: баджът го има', txt(a).indexOf(BADGE) >= 0);
    ok('t-arr: статус по дата („Изчаква"), не „Чака стока"',
      txt(a).indexOf('Изчаква') >= 0 && txt(a).indexOf('Чака стока') < 0);

    const wt = hRow('t-wait');
    ok('t-wait: „Чака стока", без бадж', txt(wt).indexOf('Чака стока') >= 0 && txt(wt).indexOf(BADGE) < 0);

    ['t-plain', 't-null', 't-done', 't-ref', 't-post'].forEach(id => {
      const r = hRow(id);
      ok(id + ': в Историята, без бадж', !!r && txt(r).indexOf(BADGE) < 0);
    });
  }

  report();
})();
