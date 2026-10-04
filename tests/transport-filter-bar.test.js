/* Транспорт: лента „Покажи:" („Активни" по подразбиране, брой до всеки чип,
   историческите вдясно) и компактен ред от 6 колони.

   Реален index.html (#tr-filters), реални кликове по чиповете. Бройката до
   чипа = колко заявки биха се показали с него при текущите търсене / месец
   (всички филтри без чипа). Атрибутът е data-tr-f (НЕ data-f — сблъсък с
   Разлики). gotoLinkedTransport() → „Всички".

   Пускане: node tests/transport-filter-bar.test.js . */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, bubbleClick, fire, ok, guard, section, report, dayOffset, tsOffset, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
function t(id, status, delivery, extra) {
  return Object.assign({
    id, store_name: 'Троян', date: dayOffset(-1), hour: '14:30', bon: 'Б-' + id,
    customer_name: 'К' + id, phone: '0888111222', address: 'гр. Троян, ул. ' + id,
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м', color: 'дъб' }],
    delivery: delivery === undefined ? dayOffset(10) : delivery, status, notes: null,
    client_order_id: null, client_order_num: null, awaiting_stock: false, created_at: tsOffset(-1)
  }, extra || {});
}
const five = [1, 2, 3, 4, 5].map(n => ({ product: 'АРТ' + n, sap: 'S' + n, qty: n, unit: 'бр.', color: '' }));
const ORDERS = [
  t('p1', 'pending', dayOffset(10), { customer_name: 'Иван Петров' }),
  t('p2', 'pending', dayOffset(-3)),
  t('p3', 'pending', dayOffset(0)),
  t('p4', 'pending', dayOffset(1)),
  t('w1', 'pending', dayOffset(10), { awaiting_stock: true, client_order_id: 'co-9', client_order_num: 'Троян-0042' }),
  t('po1', 'postponed'),
  t('d1', 'done'), t('r1', 'refused'),
  t('m5', 'pending', dayOffset(10), { items: five, customer_name: 'Пет Артикула' })
];
const F = ['active', 'overdue', 'today', 'tomorrow', 'pending', 'awaiting', 'postponed', 'done', 'refused', 'all'];
const WANT = { active: 7, overdue: 1, today: 1, tomorrow: 1, pending: 6, awaiting: 1, postponed: 1, done: 1, refused: 1, all: 9 };
const IDS = {
  active: 'm5,p1,p2,p3,p4,po1,w1', overdue: 'p2', today: 'p3', tomorrow: 'p4', pending: 'm5,p1,p2,p3,p4,w1', awaiting: 'w1',
  postponed: 'po1', done: 'd1', refused: 'r1', all: 'd1,m5,p1,p2,p3,p4,po1,r1,w1'
};

function env() {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: ADMIN, data: { transport_orders: ORDERS, client_orders: [], stores: [] }
  });
  const w = h.w;
  w.clientOrders = [];
  w.transportOrders = JSON.parse(JSON.stringify(ORDERS));
  w.transportOrders.forEach(o => {
    const st = w.calcStatus(o.delivery, o.status);
    o._status = (o.awaiting_stock && ['done', 'refused', 'postponed'].indexOf(o.status) < 0) ? 'awaiting' : st;
  });
  return h;
}
const bar = h => h.doc.getElementById('tr-filters');
const chip = (h, f) => bar(h).querySelector('[data-tr-f="' + f + '"]');
const count = (h, f) => parseInt(chip(h, f).querySelector('.chips-n').textContent, 10);
const ids = h => Array.from(h.doc.querySelectorAll('#tr-body tr[id^="tr-row-"]')).map(r => r.id.replace('tr-row-', '')).sort().join(',');
const activeFs = h => Array.from(bar(h).querySelectorAll('.filter-btn.active')).map(b => b.getAttribute('data-tr-f'));
const order = h => Array.from(bar(h).querySelectorAll('button')).map(b => b.getAttribute('data-tr-f')).join(',');
const row = (h, id) => h.doc.getElementById('tr-row-' + id);
const btns = (h, id) => Array.from(row(h, id).querySelectorAll('button')).map(b => b.textContent.trim()).sort();

(async function run() {
  section('1. лентата в index.html');
  {
    const h = env();
    guard('рендер', () => h.w.renderTransport());
    ok('надпис „Покажи:"', /Покажи:/.test(bar(h).textContent));
    ok('#tr-filters е с общия клас .chips', bar(h).classList.contains('chips') && bar(h).classList.contains('filter-bar'));
    ok('чиповете са по реда от макета', order(h) === F.join(','), order(h));
    const kids = Array.from(bar(h).children);
    const sep = kids.indexOf(bar(h).querySelector('.chips-sep'));
    ok('разделител, а Изпълнена / Отказана / Всички са след него', sep > 0 && ['done', 'refused', 'all'].every(f => kids.indexOf(chip(h, f)) > sep));
    ok('всеки чип има .chips-n', F.every(f => !!chip(h, f).querySelector('.chips-n')));
    ok('няма data-f в #tr-filters (сблъсък с Разлики)', !bar(h).querySelector('[data-f]'));
    ok('текстовете на чиповете са непроменени', /Чака стока/.test(chip(h, 'awaiting').textContent) && /Просрочени/.test(chip(h, 'overdue').textContent) && /Изчаква/.test(chip(h, 'pending').textContent));
    ok('вторият чип пази onclick="filterTransport(…)"', /filterTransport\('overdue'/.test(chip(h, 'overdue').getAttribute('onclick')));
  }

  section('2. по подразбиране „Активни"');
  {
    const h = env();
    guard('рендер', () => h.w.renderTransport());
    ok('transportFilter = active', h.w.transportFilter === 'active', h.w.transportFilter);
    ok('само „Активни" е маркиран', activeFs(h).join(',') === 'active', activeFs(h).join(','));
    ok('done и refused не се виждат', ids(h) === IDS.active, ids(h));
  }

  section('3. броевете');
  {
    const h = env();
    guard('рендер', () => h.w.renderTransport());
    F.forEach(f => ok('брой на „' + f + '" = ' + WANT[f], count(h, f) === WANT[f], String(count(h, f))));
    ok('чиповете не се крият при 0', F.every(f => chip(h, f).style.display !== 'none'));
    const s = h.doc.getElementById('tr-search');
    s.value = 'Иван'; fire(h.w, s, 'input');
    const c2 = {}; F.forEach(f => { c2[f] = count(h, f); });
    ok('с търсене „Иван": all=1, active=1, pending=1', c2.all === 1 && c2.active === 1 && c2.pending === 1, JSON.stringify(c2));
    ok('останалите са 0 и пак се виждат', ['overdue', 'today', 'tomorrow', 'awaiting', 'postponed', 'done', 'refused'].every(f => c2[f] === 0 && chip(h, f).style.display !== 'none'), JSON.stringify(c2));
    s.value = ''; fire(h.w, s, 'input');
    ok('изчистено търсене → броевете се връщат', count(h, 'all') === 9 && count(h, 'active') === 7);
  }

  section('4. клик на всеки чип');
  {
    for (const f of F) {
      const h = env();
      guard('рендер', () => h.w.renderTransport());
      realClick(h.w, chip(h, f));
      ok(f + ': маркиран е само той', activeFs(h).join(',') === f, activeFs(h).join(','));
      ok(f + ': редовете', ids(h) === IDS[f], ids(h));
      ok(f + ': броят не се променя от клика', count(h, f) === WANT[f]);
    }
    const h = env();
    guard('рендер', () => h.w.renderTransport());
    h.w.filterTransport('sent_x', chip(h, 'today'));
    ok('filterTransport() маркира по data-tr-f, не по подадения btn', activeFs(h).join(',') === '', activeFs(h).join(','));
  }

  section('5. редът: 6 колони, бутони, ивица');
  {
    const h = env();
    guard('рендер', () => h.w.renderTransport());
    const th = Array.from(h.doc.getElementById('tr-body').closest('table').querySelectorAll('thead th')).map(x => x.textContent.trim());
    ok('thead: 6 колони', JSON.stringify(th) === JSON.stringify(['Дата · Час', 'Клиент', 'Адрес', 'Артикул', 'Статус · Доставка', 'Действия']), JSON.stringify(th));
    ok('обвивката е .tbl-compact.tbl-tr-compact', !!h.doc.querySelector('.tbl-wrap.tbl-compact.tbl-tr-compact #tr-body'));
    const r = Array.from(row(h, 'p1').children);
    ok('редът има точно 6 <td>', r.length === 6, r.length);
    ok('колона 1: дата, час и магазин (сив)', /14:30/.test(r[0].textContent) && /Троян/.test(r[0].textContent) && !!r[0].querySelector('div'), r[0].textContent);
    ok('колона 2: име, телефон · бон', /Иван Петров/.test(r[1].textContent) && /0888111222 · Бон: Б-p1/.test(r[1].textContent), r[1].textContent);
    ok('колона 3: адрес', /ул\. p1/.test(r[2].textContent));
    ok('колона 5: статус и дата на доставка', /Изчаква/.test(r[4].textContent) && r[4].innerHTML.indexOf('<b>') >= 0, r[4].textContent);
    ok('бутони, pending (admin): Статус и Бланка', JSON.stringify(btns(h, 'p1')) === JSON.stringify(['Статус', '🖨 Бланка'].sort()), JSON.stringify(btns(h, 'p1')));
    realClick(h.w, chip(h, 'done'));
    ok('бутони, done (admin): Върни, Корекция, Бланка', JSON.stringify(btns(h, 'd1')) === JSON.stringify(['↩ Върни', '✏️ Корекция', '🖨 Бланка'].sort()), JSON.stringify(btns(h, 'd1')));
    realClick(h.w, chip(h, 'all'));
    const five5 = Array.from(row(h, 'm5').children)[3];
    ok('5 артикула → 3 блока + „+2 още"', five5.querySelectorAll('.co-it').length === 3 && /\+2 още/.test(five5.textContent), five5.textContent);
    const aw = row(h, 'w1');
    ok('awaiting: жълта ивица #eab308', /border-left:3px solid #eab308/.test(aw.getAttribute('style')), aw.getAttribute('style'));
    ok('awaiting: без мигане', !/animation/.test(aw.getAttribute('style')), aw.getAttribute('style'));
    ok('awaiting: бадж 📋 на клиентската заявка в клиента', /Клиентска заявка/.test(Array.from(aw.children)[1].textContent));
    ok('просрочен (p2): мигане rowPulseOpaque', /animation:rowPulseOpaque/.test(row(h, 'p2').getAttribute('style')));
  }

  section('6. кликове в реда');
  {
    const h = env();
    guard('рендер', () => h.w.renderTransport());
    guard('клик на клетка', () => bubbleClick(h.w, Array.from(row(h, 'p1').children)[2]));
    ok('клик по реда отваря детайла', !!h.doc.getElementById('trd-ov'));
  }

  section('7. gotoLinkedTransport() → „Всички"');
  {
    const h = env();
    guard('рендер', () => h.w.renderTransport());
    realClick(h.w, chip(h, 'overdue'));
    guard('gotoLinkedTransport(d1)', () => h.w.gotoLinkedTransport('d1'));
    await ticks(); await ticks();
    ok('активен е „Всички"', activeFs(h).join(',') === 'all' && h.w.transportFilter === 'all', activeFs(h).join(','));
    ok('изпълненият транспорт d1 се вижда', ids(h).split(',').indexOf('d1') >= 0, ids(h));
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
