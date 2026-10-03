/* Клиентски: компактен ред — 6 колони вместо 13.

   № · Пусната / Клиент / Артикул / От → Изпълнява / Статус · Доставка / Действия.
   Бутоните в „Действия" са ТОЧНО същите като преди (същите условия по роля и
   статус) — затова наборът бутони за всеки случай е зададен тук явно и е
   проверен срещу стария 13-колонен ред (минава и там). Проверките за бутони
   гледат само <button>.

   Пускане: node tests/co-compact-row.test.js . */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, bubbleClick, ok, guard, section, report, dayOffset, tsOffset } = H;

const CO = 'Централен офис';
const WH = 'Логистичен склад Добрич';
function order(id, extra) {
  return Object.assign({
    id, in_num: 'Троян-' + id, store_name: 'Троян', fulfiller: 'Габрово', status: 'pending',
    date: dayOffset(-1), hour: '10:30', customer_name: 'Иван Петров', phone: '0888111222', bon: 'Б-77',
    product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м', color: 'дъб',
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м', color: 'дъб' }],
    delivery: dayOffset(8), note: '', created_at: tsOffset(-1), co_eta: null, co_note: null,
    paid_transport: false, transport_id: null, client_notified_at: null, client_notified_by: null, group_id: null
  }, extra || {});
}
const user = (role, store) => ({ email: role + '@temax.bg', display_name: role, role, store_name: store, assigned_stores: role === 'manager' ? [store] : [] });

function env(u, orders) {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'stock-differences.js', 'notifications.js'],
    user: u, data: { client_orders: orders, transport_orders: [], stores: [] }
  });
  const w = h.w;
  w.transportOrders = [];
  w.clientOrders = JSON.parse(JSON.stringify(orders));
  w.clientOrders.forEach(o => {
    o._status = w.calcStatus(o.delivery, o.status);
    o._days = o._daysOverride !== undefined ? o._daysOverride : w.calcElapsed(o.created_at, o.date);
    o._isFulfiller = w.coIsMineToFulfill(o);
  });
  w.orderFilter = 'all';
  guard('renderClientOrders()', () => w.renderClientOrders());
  return h;
}
const row = (h, id) => h.doc.getElementById('co-row-' + id);
const tds = (h, id) => Array.from(row(h, id).children);
const btns = (h, id) => Array.from(row(h, id).querySelectorAll('button')).map(b => b.textContent.trim()).sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b.slice().sort());

(async function run() {
  section('1. шест колони');
  {
    const h = env(user('admin', CO), [order('a1')]);
    const th = Array.from(h.doc.getElementById('co-body').closest('table').querySelectorAll('thead th')).map(t => t.textContent.trim());
    ok('thead: 6 колони по реда от макета', JSON.stringify(th) === JSON.stringify(['№ · Пусната', 'Клиент', 'Артикул', 'От → Изпълнява', 'Статус · Доставка', 'Действия']), JSON.stringify(th));
    ok('редът има точно 6 <td>', tds(h, 'a1').length === 6, tds(h, 'a1').length);
    const t = tds(h, 'a1');
    ok('колона 1: № и дата/час', /Троян-a1/.test(t[0].textContent) && t[0].textContent.indexOf(order('x').date) >= 0 && /10:30/.test(t[0].textContent), t[0].textContent);
    ok('колона 2: име, телефон и бон', /Иван Петров/.test(t[1].textContent) && /0888111222 · Бон: Б-77/.test(t[1].textContent), t[1].textContent);
    ok('колона 4: „Троян → Габрово" (магазин → изпълнител)', /Троян\s*→\s*Габрово/.test(t[3].textContent), t[3].textContent);
    ok('колона 5: статус и дата на доставка', /Изчаква/.test(t[4].textContent) && t[4].innerHTML.indexOf('<b>') >= 0, t[4].textContent);
    const same2 = env(user('admin', CO), [order('s1', { fulfiller: 'Троян' })]);
    ok('без друг изпълнител — само магазинът', tds(same2, 's1')[3].textContent.trim() === 'Троян', tds(same2, 's1')[3].textContent);
  }

  section('2. бутоните са като преди');
  {
    let h = env(user('admin', CO), [order('p', { fulfiller: CO })]);
    ok('admin в ЦО, заявка към ЦО, pending',
      same(btns(h, 'p'), ['✅ Обработена от ЦО', '📤 Изпратена', '✕ Откаже', 'Статус', '🚚 Платен транспорт', '🖨 Бланка', '✕']), JSON.stringify(btns(h, 'p')));

    h = env(user('manager', 'Троян'), [order('s', { status: 'sent' }), order('r', { status: 'arrived' })]);
    ok('магазин заявител, sent', same(btns(h, 's'), ['📦 Пристигнала', 'Статус', '🚚 Платен транспорт', '🖨 Бланка']), JSON.stringify(btns(h, 's')));
    ok('магазин заявител, arrived', same(btns(h, 'r'), ['📞 Уведомен', '✅ Изпълнена', 'Статус', '🚚 Платен транспорт', '🖨 Бланка']), JSON.stringify(btns(h, 'r')));

    h = env(user('manager', 'Габрово'), [order('f')]);
    ok('магазин изпълнител, pending', same(btns(h, 'f'), ['📤 Изпратена', '✕ Откаже', '🚚 Платен транспорт', '🖨 Бланка']), JSON.stringify(btns(h, 'f')));

    h = env(user('logistics', WH), [order('w', { fulfiller: WH })]);
    ok('склад изпълнител, pending', same(btns(h, 'w'), ['📤 Изпратена', '✕ Откаже', 'Статус', '🚚 Платен транспорт', '🖨 Бланка']), JSON.stringify(btns(h, 'w')));

    h = env(user('admin', CO), [order('d', { status: 'done' })]);
    ok('admin, done: Върни и Корекция', same(btns(h, 'd'), ['↩ Върни', '✏️ Корекция', '🖨 Бланка', '✕']), JSON.stringify(btns(h, 'd')));
    ok('бутоните са в последната колона', Array.from(tds(h, 'd')[5].querySelectorAll('button')).length === 4);
  }

  section('3. кликове');
  {
    const h = env(user('admin', CO), [order('c1')]);
    const t = tds(h, 'c1');
    const seen = { detail: [], cust: [] };
    h.w.openClientOrderDetail = id => seen.detail.push(id);
    h.w.openCustomerOrders = id => seen.cust.push(id);
    [0, 2, 3, 4].forEach(i => guard('клик на колона ' + (i + 1), () => bubbleClick(h.w, t[i])));
    ok('клик на колони 1, 3, 4, 5 отваря детайла (по веднъж)', seen.detail.length === 4 && seen.detail.every(x => x === 'c1'), JSON.stringify(seen.detail));
    seen.detail.length = 0;
    const name = t[1].querySelector('b[onclick]');
    ok('името е кликаемо', !!name);
    if (name) guard('клик на името', () => bubbleClick(h.w, name));
    ok('името отваря панела на клиента', seen.cust.length === 1 && seen.cust[0] === 'c1', JSON.stringify(seen.cust));
    ok('и НЕ отваря детайла', seen.detail.length === 0, JSON.stringify(seen.detail));
    guard('клик на колона 2 (извън името)', () => bubbleClick(h.w, t[1].querySelector('small')));
    ok('клик на телефона/бона не отваря детайла (клетката спира bubbling-а)', seen.detail.length === 0);
    const bl = t[5].querySelector('button');
    guard('клик на бутон', () => bubbleClick(h.w, bl));
    ok('клик в „Действия" не отваря детайла', seen.detail.length === 0);
  }

  section('4. артикули: 5 → 3 + „+2 още"');
  {
    const items = [1, 2, 3, 4, 5].map(n => ({ product: 'АРТ' + n, sap: 'S' + n, qty: n, unit: 'бр.', color: '' }));
    const h = env(user('admin', CO), [order('m', { items, product: 'АРТ1', sap: 'S1', qty: 1, unit: 'бр.' })]);
    const cell = tds(h, 'm')[2];
    ok('три блока', cell.querySelectorAll('.co-it').length === 3, cell.querySelectorAll('.co-it').length);
    ok('„+2 още"', /\+2 още/.test(cell.textContent), cell.textContent);
    ok('АРТ4/АРТ5 ги няма', !/АРТ4|АРТ5/.test(cell.textContent));
    ok('„име — бройка мярка" и „SAP …" на два реда', /АРТ1 — 1 бр\./.test(cell.textContent) && /SAP S1/.test(cell.textContent));
    const long = env(user('admin', CO), [order('l', { items: [{ product: 'ДЪЛГО ИМЕ '.repeat(10), sap: '1', qty: 1, unit: 'бр.' }] })]);
    const line = tds(long, 'l')[2].querySelector('.co-it > div');
    const nm = line.children[0];
    ok('дългото име се реже с …, а бройката е в отделен елемент, който не се реже', /text-overflow:ellipsis/.test(nm.getAttribute('style')) && /flex:none/.test(line.children[1].getAttribute('style')) && /1 бр./.test(line.children[1].textContent));
    ok('title с пълното име', line.getAttribute('title').length > 90);
  }

  section('5. „Изминало": само от 5 дни и когато НЕ чака доставчика');
  {
    const old7 = order('e7', { created_at: tsOffset(-7), date: dayOffset(-7) });
    const new2 = order('e2', { created_at: tsOffset(-2), date: dayOffset(-2) });
    const h = env(user('admin', CO), [old7, new2]);
    ok('7 дни → има бадж „дни"', /\d+ дни/.test(tds(h, 'e7')[4].textContent) && /🔶|⚠️|🔴/.test(tds(h, 'e7')[4].textContent), tds(h, 'e7')[4].textContent);
    ok('2 дни → няма', !/\d+ дни/.test(tds(h, 'e2')[4].textContent), tds(h, 'e2')[4].textContent);
    const sup = order('sup', { status: 'processed', fulfiller: CO, co_eta: dayOffset(6), created_at: tsOffset(-1), date: dayOffset(-1) });
    const h2 = env(user('admin', CO), [sup]);
    const c5 = tds(h2, 'sup')[4].textContent;
    ok('ЦО със срок (processed, бъдещ co_eta) → НЯМА „🏭 до"', !/🏭 до/.test(c5), c5);
    ok('срокът се вижда веднъж — „🏭 очаквана …" от coEtaCell', (c5.match(/🏭/g) || []).length === 1 && /очаквана/.test(c5), c5);
    const supOld = order('supOld', { status: 'processed', fulfiller: CO, co_eta: dayOffset(6), created_at: tsOffset(-8), date: dayOffset(-8) });
    const h3 = env(user('admin', CO), [supOld]);
    ok('и 8-дневна ЦО заявка със срок — без „дни" бадж, докато чака доставчика', !/d+ дни/.test(tds(h3, 'supOld')[4].textContent), tds(h3, 'supOld')[4].textContent);
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
