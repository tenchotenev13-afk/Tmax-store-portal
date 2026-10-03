/* Клиентски: лента „Покажи:" — „Активни" по подразбиране, брой до всеки чип,
   историческите (Изпълнена / Отказана / Всички) отделени вдясно.

   Реален index.html (#co-filters), реални кликове по чиповете. Бройката до
   чипа = колко заявки биха се показали с него при текущите търсене / месец /
   магазин / изпълнява / роля (всички филтри без чипа). Чиповете НЕ се крият
   при 0. Външни извиквания: gotoLinkedClientOrder() → „Всички",
   coShowNewForMe() → „Изчаква".

   Пускане: node tests/co-filter-bar.test.js . */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, ok, guard, section, report, dayOffset, tsOffset, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
function o(id, status, delivery, extra) {
  return Object.assign({
    id, in_num: 'Троян-' + id, store_name: 'Троян', fulfiller: 'Габрово', status,
    date: dayOffset(-1), hour: '10:00', customer_name: 'К' + id, phone: '0888000000',
    product: 'ПРОДУКТ', sap: '1', qty: 1, unit: 'бр.', items: null, delivery: delivery === undefined ? dayOffset(10) : delivery,
    note: '', co_eta: null, co_note: null, paid_transport: false, transport_id: null, created_at: tsOffset(-1)
  }, extra || {});
}
const ORDERS = [
  o('a1', 'pending', dayOffset(10), { customer_name: 'Иван Петров' }),
  o('a2', 'pending', dayOffset(-3)),        /* просрочена */
  o('a3', 'pending', dayOffset(0)),         /* днес */
  o('a4', 'pending', dayOffset(1)),         /* утре */
  o('a5', 'processed'), o('a6', 'sent'), o('a7', 'arrived'), o('a8', 'postponed'),
  o('d1', 'done'), o('r1', 'refused')
];
const F = ['active', 'overdue', 'today', 'tomorrow', 'pending', 'processed', 'sent', 'arrived', 'postponed', 'done', 'refused', 'all'];
const WANT = { active: 8, overdue: 1, today: 1, tomorrow: 1, pending: 4, processed: 1, sent: 1, arrived: 1, postponed: 1, done: 1, refused: 1, all: 10 };
const IDS = {
  active: 'a1,a2,a3,a4,a5,a6,a7,a8', overdue: 'a2', today: 'a3', tomorrow: 'a4', pending: 'a1,a2,a3,a4',
  processed: 'a5', sent: 'a6', arrived: 'a7', postponed: 'a8', done: 'd1', refused: 'r1', all: 'a1,a2,a3,a4,a5,a6,a7,a8,d1,r1'
};

function env() {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: ADMIN, data: { client_orders: ORDERS, transport_orders: [], stores: [] }
  });
  const w = h.w;
  w.transportOrders = [];
  w.clientOrders = JSON.parse(JSON.stringify(ORDERS));
  w.clientOrders.forEach(x => {
    x._status = w.calcStatus(x.delivery, x.status);
    x._days = w.calcElapsed(x.created_at, x.date);
    x._isFulfiller = w.coIsMineToFulfill(x);
  });
  return h;
}
const bar = h => h.doc.getElementById('co-filters');
const chip = (h, f) => bar(h).querySelector('[data-co-f="' + f + '"]');
const count = (h, f) => parseInt(chip(h, f).querySelector('.co-chip-n').textContent, 10);
const ids = h => Array.from(h.doc.querySelectorAll('#co-body tr[id^="co-row-"]')).map(r => r.id.replace('co-row-', '')).sort().join(',');
const activeFs = h => Array.from(bar(h).querySelectorAll('.filter-btn.active')).map(b => b.getAttribute('data-co-f'));
const order = h => Array.from(bar(h).querySelectorAll('button')).map(b => b.getAttribute('data-co-f')).join(',');

(async function run() {
  section('1. лентата в index.html');
  {
    const h = env();
    guard('рендер', () => h.w.renderClientOrders());
    ok('надпис „Покажи:"', /Покажи:/.test(bar(h).textContent));
    ok('чиповете са по реда от макета', order(h) === F.join(','), order(h));
    ok('разделител преди историческите', !!bar(h).querySelector('.co-filters-sep'));
    const kids = Array.from(bar(h).children);
    const sep = kids.indexOf(bar(h).querySelector('.co-filters-sep'));
    ok('Изпълнена / Отказана / Всички са след разделителя', ['done', 'refused', 'all'].every(f => kids.indexOf(chip(h, f)) > sep));
    ok('всеки чип има .co-chip-n', F.every(f => !!chip(h, f).querySelector('.co-chip-n')));
    ok('onclick-ът на „Изчаква" е като досега (за coShowNewForMe)', /filterOrders\('pending'/.test(chip(h, 'pending').getAttribute('onclick')));
    const css = Array.from(h.doc.querySelectorAll('style')).map(s => s.textContent).join('\n');
    ok('вид само за #co-filters', /#co-filters \.filter-btn\{[^}]*border-radius:16px/.test(css) && /#co-filters \.filter-btn\.co-hist\{[^}]*dashed/.test(css));
  }

  section('2. по подразбиране „Активни"');
  {
    const h = env();
    guard('рендер', () => h.w.renderClientOrders());
    ok('orderFilter = active', h.w.orderFilter === 'active', h.w.orderFilter);
    ok('само „Активни" е маркиран', activeFs(h).join(',') === 'active', activeFs(h).join(','));
    ok('видими са pending/processed/sent/arrived/postponed, без done и refused', ids(h) === IDS.active, ids(h));
  }

  section('3. броевете');
  {
    const h = env();
    guard('рендер', () => h.w.renderClientOrders());
    F.forEach(f => ok('брой на „' + f + '" = ' + WANT[f], count(h, f) === WANT[f], String(count(h, f))));
    ok('чиповете не се крият при 0', F.every(f => chip(h, f).style.display !== 'none'));
    const s = h.doc.getElementById('co-search');
    s.value = 'Иван'; fire(h.w, s, 'input');
    const c2 = {}; F.forEach(f => { c2[f] = count(h, f); });
    ok('с търсене „Иван": all=1, active=1, pending=1', c2.all === 1 && c2.active === 1 && c2.pending === 1, JSON.stringify(c2));
    ok('с търсене: останалите са 0 и пак се виждат',
      ['overdue', 'today', 'tomorrow', 'processed', 'sent', 'arrived', 'postponed', 'done', 'refused'].every(f => c2[f] === 0 && chip(h, f).style.display !== 'none'),
      JSON.stringify(c2));
    s.value = ''; fire(h.w, s, 'input');
    ok('изчистено търсене → броевете се връщат', count(h, 'all') === 10 && count(h, 'active') === 8);
  }

  section('4. клик на всеки чип');
  {
    for (const f of F) {
      const h = env();
      guard('рендер', () => h.w.renderClientOrders());
      realClick(h.w, chip(h, f));
      ok(f + ': маркиран е само той', activeFs(h).join(',') === f, activeFs(h).join(','));
      ok(f + ': редовете', ids(h) === IDS[f], ids(h));
      ok(f + ': броят не се променя от клика', count(h, f) === WANT[f]);
    }
  }

  section('5. filterOrders() маркира по data-co-f, не по подадения btn');
  {
    const h = env();
    guard('рендер', () => h.w.renderClientOrders());
    h.w.filterOrders('sent', chip(h, 'today'));
    ok('грешен btn → маркиран е „sent"', activeFs(h).join(',') === 'sent', activeFs(h).join(','));
    h.w.filterOrders('refused');
    ok('без btn → пак по data-co-f', activeFs(h).join(',') === 'refused');
  }

  section('6. външни извиквания');
  {
    const h = env();
    guard('рендер', () => h.w.renderClientOrders());
    realClick(h.w, chip(h, 'overdue'));
    guard('gotoLinkedClientOrder(d1)', () => h.w.gotoLinkedClientOrder('d1'));
    await ticks(); await ticks();
    ok('активен е „Всички"', activeFs(h).join(',') === 'all' && h.w.orderFilter === 'all', activeFs(h).join(','));
    ok('изпълнената заявка d1 се вижда', ids(h).split(',').indexOf('d1') >= 0, ids(h));
    guard('coShowNewForMe()', () => h.w.coShowNewForMe());
    await ticks(); await ticks();
    ok('coShowNewForMe → активен е „Изчаква"', activeFs(h).join(',') === 'pending' && h.w.orderFilter === 'pending', activeFs(h).join(','));
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
