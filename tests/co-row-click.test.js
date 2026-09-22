/* Клиентски заявки: целият ред отваря детайла (#cod-ov).
   По образец на transport-detail.test.js: realClick() от harness-а не
   симулира bubbling, затова bubbleClick() минава от клетката нагоре по
   родителите с истински обект event и спира при event.stopPropagation().

   Клетката с клиента (име → панел „заявките на клиента", бадж на групата)
   и клетката с бутоните спират bubbling-а — те НЕ отварят #cod-ov.

   Всички проверки са с null-защита — срещу стария код тестът дава ЧИСТ
   доклад с ❌, не хвърлена грешка.

   Пускане: node tests/co-row-click.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, dayOffset, tsOffset } = H;

function order(id, extra) {
  return Object.assign({
    id, in_num: 'Троян-' + id, store_name: 'Троян', fulfiller: 'Габрово',
    status: 'pending', date: dayOffset(-3), hour: '10:00',
    customer_name: 'Иван Петров', phone: '0888111222', bon: 'Б-1',
    product: 'ПАРКЕТ', color: 'дъб', sap: '111', qty: 5, unit: 'кв.м',
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м' }],
    delivery: dayOffset(5), note: '', created_at: tsOffset(-3),
    co_eta: null, co_note: null, paid_transport: false, transport_id: null, group_id: null
  }, extra || {});
}

const ORDERS = [
  /* Част от обща поръчка → има бадж „👥 1 от 2" в клетката на клиента */
  order('g1', { group_id: 'grp-1', status: 'sent' }),
  order('g2', { group_id: 'grp-1', in_num: 'Троян-g2', product: 'ПЕРВАЗ' }),
  /* Приключена — бутоните „↩ Върни" / „Корекция" */
  order('d1', { status: 'done', customer_name: 'Мария Иванова', phone: '0899000111' })
];

const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin', store_name: 'Централен офис' };

function env() {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: ADMIN,
    data: { client_orders: ORDERS, transport_orders: [], stores: [] }
  });
  const w = h.w;
  w.transportOrders = [];
  w.clientOrders = JSON.parse(JSON.stringify(ORDERS));
  w.clientOrders.forEach(o => {
    o._status = w.calcStatus(o.delivery, o.status);
    o._days = w.calcElapsed(o.created_at, o.date);
    o._isFulfiller = w.coIsMineToFulfill(o);
  });
  guard('renderClientOrders()', () => w.renderClientOrders());
  return h;
}

function bubbleClick(w, el) {
  const ran = [];
  let stopped = false;
  const ev = { type: 'click', target: el, stopPropagation() { stopped = true; }, preventDefault() {} };
  for (let n = el; n && n.getAttribute && !stopped; n = n.parentElement) {
    const code = n.getAttribute('onclick');
    if (!code) continue;
    ran.push(code);
    w.eval('(function(event){' + code + '})').call(n, ev);
  }
  return ran;
}

/* Клетките се намират по заглавие на колона, не по номер */
function colIndex(doc, name) {
  const body = doc.getElementById('co-body');
  const table = body && body.closest('table');
  const heads = table ? Array.prototype.map.call(table.querySelectorAll('thead th'), th => th.textContent.trim()) : [];
  return heads.findIndex(h => h === name || h.indexOf(name) === 0);
}
const cell = (doc, id, name) => {
  const row = doc.getElementById('co-row-' + id);
  const i = colIndex(doc, name);
  return row && i >= 0 ? row.querySelectorAll('td')[i] || null : null;
};
const cod = doc => !!doc.getElementById('cod-ov');
const reset = (w, doc) => {
  guard('затвори детайла', () => w.closeClientOrderDetail());
  const c = doc.getElementById('cust-ov'); if (c) c.remove();
};

(async function run() {

  section('1. onclick стои на <tr>, не на клетките');
  {
    const { doc } = env();
    const tr = doc.getElementById('co-row-g1');
    ok('редът g1 съществува', !!tr);
    ok('<tr> вика openClientOrderDetail(this.dataset.id)',
      !!tr && tr.getAttribute('onclick') === 'openClientOrderDetail(this.dataset.id)', tr && tr.getAttribute('onclick'));
    ok('data-id="g1"', !!tr && tr.getAttribute('data-id') === 'g1');
    ok('title „Отвори заявката"', !!tr && tr.getAttribute('title') === 'Отвори заявката');
    ok('class row-click', !!tr && tr.classList.contains('row-click'));
    ok('cursor:pointer в стила на реда', !!tr && /cursor:pointer/.test(tr.getAttribute('style') || ''));
    const cells = tr ? Array.prototype.filter.call(tr.querySelectorAll('td'),
      c => /openClientOrderDetail/.test(c.getAttribute('onclick') || '')) : [];
    ok('никоя клетка няма собствен openClientOrderDetail', !!tr && cells.length === 0, cells.length);
    ok('Дата/Час, SAP и Продукт са без title „Отвори заявката"',
      ['Дата', 'SAP', 'Продукт'].every(n => { const c = cell(doc, 'g1', n); return !!c && c.getAttribute('title') !== 'Отвори заявката'; }));
    const sapDiv = cell(doc, 'g1', 'SAP') && cell(doc, 'g1', 'SAP').querySelector('div[title]');
    ok('вътрешният title с целия SAP код остава', !!sapDiv && sapDiv.getAttribute('title') === '111');
  }

  section('2. Подсветката _coHighlightId и стилът на реда остават');
  {
    const { w, doc } = env();
    w._coHighlightId = 'g2';
    guard('рендер с подсветка', () => w.renderClientOrders());
    const st = (doc.getElementById('co-row-g2') || { getAttribute: () => '' }).getAttribute('style') || '';
    ok('жълт фон на подсветения ред', /background:#fef9c3/.test(st), st);
    ok('border-left и cursor:pointer заедно с него', /border-left:3px solid/.test(st) && /cursor:pointer/.test(st), st);
  }

  section('3. Клик по Бр., Доставка, Статус, Дата/Час, Продукт → #cod-ov');
  {
    const { w, doc } = env();
    ['Бр.', 'Доставка', 'Статус', 'Дата', 'Продукт', 'SAP', 'Телефон', '№'].forEach(name => {
      const c = cell(doc, 'g1', name);
      ok('колона „' + name + '" се намира', !!c);
      if (c) guard('клик по „' + name + '"', () => bubbleClick(w, c));
      const ov = doc.getElementById('cod-ov');
      ok('„' + name + '" → #cod-ov на заявка g1', !!ov && ov.textContent.indexOf('Троян-g1') >= 0);
      reset(w, doc);
    });
  }

  section('4. Клик по името на клиента → панелът на клиента, НЕ #cod-ov');
  {
    const { w, doc } = env();
    const name = doc.querySelector('#co-row-g1 b[onclick*="openCustomerOrders"]');
    ok('името вика openCustomerOrders', !!name);
    if (name) {
      guard('клик по името', () => bubbleClick(w, name));
      ok('панелът #cust-ov се отваря', !!doc.getElementById('cust-ov'));
      ok('#cod-ov НЕ се отваря', !cod(doc));
    }
    reset(w, doc);
    const badge = doc.querySelector('#co-row-g1 span[onclick*="openCustomerOrders"]');
    ok('баджът на групата „👥" е в реда', !!badge && badge.textContent.indexOf('👥') >= 0);
    if (badge) guard('клик по баджа', () => bubbleClick(w, badge));
    ok('баджът отваря панела на клиента', !!doc.getElementById('cust-ov'));
    ok('баджът НЕ отваря #cod-ov', !cod(doc));
    reset(w, doc);
    const bon = cell(doc, 'g1', 'Клиент') && cell(doc, 'g1', 'Клиент').querySelector('small');
    if (bon) guard('клик по „Бон:" в клетката на клиента', () => bubbleClick(w, bon));
    ok('„Бон:" в клетката на клиента също не отваря #cod-ov', !!bon && !cod(doc));
  }

  section('5. Бутоните в реда не отварят #cod-ov');
  {
    const { w, doc } = env();
    /* Действията се подменят — проверява се САМО дали детайлът се отваря */
    ['openStatus', 'loadPrint', 'setClientStatus', 'openPaidTransportModal', 'revertStatus',
     'openCorrection', 'deleteClientOrder'].forEach(fn => { w[fn] = () => {}; });
    const all = [];
    ['g1', 'd1'].forEach(id => {
      const tr = doc.getElementById('co-row-' + id);
      if (tr) Array.prototype.forEach.call(tr.querySelectorAll('button'), b => all.push([id, b]));
    });
    const labels = all.map(([id, b]) => id + ':' + b.textContent.trim());
    ok('„Статус" и „Бланка" са сред бутоните',
      labels.indexOf('g1:Статус') >= 0 && labels.some(l => /^g1:.*Бланка/.test(l)), JSON.stringify(labels));
    ok('има и бутони на приключена заявка (↩ Върни)', labels.some(l => /^d1:.*Върни/.test(l)), JSON.stringify(labels));
    all.forEach(([id, b]) => {
      const lbl = id + ':' + b.textContent.trim();
      guard('клик ' + lbl, () => bubbleClick(w, b));
      ok(lbl + ' → #cod-ov НЕ се отваря', !cod(doc));
      reset(w, doc);
    });
    ok('проверени са поне 6 бутона', all.length >= 6, all.length);
  }

  section('6. index.html: по-видим hover, общ и за Транспорт');
  {
    const { doc } = env();
    const css = Array.prototype.map.call(doc.querySelectorAll('style'), s => s.textContent).join('\n');
    ok('.row-click:hover td{background:#eef2ff;}', /\.row-click:hover td\{background:#eef2ff;\}/.test(css));
    ok('старият #f8fafc е махнат', !/\.row-click:hover td\{background:#f8fafc;\}/.test(css));
    ok('глобалното tr:hover td е непипнато', /(^|\})\s*tr:hover td\{background:#fafafa;\}/m.test(css));
  }

  report();
})();
