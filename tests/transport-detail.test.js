/* Детайл на транспортна заявка при клик по клетката Дата/Час.
   По образец на co-detail-modal: истински клик по onclick атрибута на
   клетката, истински keydown за Escape, listener-ите се броят през обвивка
   на document.addEventListener/removeEventListener.

   Всички проверки са с null-защита — срещу стария код (без модала) тестът
   трябва да даде ЧИСТ доклад с ❌, не хвърлена грешка.

   Пускане: node tests/transport-detail.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btnExact, ok, guard, section, report, dayOffset, tsOffset } = H;

const TRANSPORT = [
  { id: 't-1', store_name: 'Троян', date: dayOffset(-1), hour: '14:30', bon: 'Б-7781',
    customer_name: 'Иван Петров', phone: '0888 111 222', address: 'гр. Троян, ул. Васил Левски 12',
    product: 'ПАРКЕТ', color: 'дъб', sap: '111', qty: 5, unit: 'кв.м',
    items: [
      { sap: '111', product: 'ПАРКЕТ ДЪБ', color: 'натурален', qty: 5, unit: 'кв.м' },
      { sap: '222', product: 'ПЕРВАЗ', color: 'бял', qty: 12, unit: 'бр.' },
      { sap: '333', product: 'ПОДЛОЖКА', color: '', qty: 1, unit: 'ролка' }
    ],
    delivery: dayOffset(2), status: 'pending', notes: 'Звъни преди доставка',
    client_order_id: 'co-9', client_order_num: 'Троян-0042', awaiting_stock: true,
    created_at: tsOffset(-1) },
  /* Стар запис: без items, без свързана клиентска заявка, без забележка */
  { id: 't-2', store_name: 'Враца', date: dayOffset(-5), hour: '09:00', bon: '',
    customer_name: 'Стар Клиент', phone: '', address: 'с. Долно',
    product: 'ВРАТА', color: 'орех', sap: '555', qty: 1, unit: 'бр.', items: null,
    delivery: dayOffset(1), status: 'pending', notes: null,
    client_order_id: null, client_order_num: null, awaiting_stock: false,
    created_at: tsOffset(-5) }
];

const CLIENT = [
  { id: 'co-9', in_num: 'Троян-0042', store_name: 'Троян', fulfiller: 'Централен офис',
    status: 'arrived', date: dayOffset(-4), hour: '10:00', customer_name: 'Иван Петров',
    phone: '0888111222', items: [{ product: 'ПАРКЕТ ДЪБ', sap: '111', qty: 5, unit: 'кв.м' }],
    delivery: dayOffset(3), note: '', created_at: tsOffset(-4), paid_transport: true, transport_id: 't-1' }
];

const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin', store_name: 'Централен офис' };

function env() {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: ADMIN,
    data: { transport_orders: TRANSPORT, client_orders: CLIENT, stores: [] }
  });
  const w = h.w;
  /* Брои активните keydown listener-и на document */
  const live = new Set();
  const add = w.document.addEventListener.bind(w.document);
  const rem = w.document.removeEventListener.bind(w.document);
  w.document.addEventListener = (t, fn, o) => { if (t === 'keydown') live.add(fn); return add(t, fn, o); };
  w.document.removeEventListener = (t, fn, o) => { if (t === 'keydown') live.delete(fn); return rem(t, fn, o); };
  h.keydownCount = () => live.size;

  w.transportOrders = JSON.parse(JSON.stringify(TRANSPORT));
  w.transportOrders.forEach(o => { o._status = w.calcStatus(o.delivery, o.status); });
  w.clientOrders = JSON.parse(JSON.stringify(CLIENT));
  w.clientOrders.forEach(o => { o._status = w.calcStatus(o.delivery, o.status); });
  guard('renderTransport()', () => w.renderTransport());
  return h;
}

const esc = w => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const dateCell = (doc, id) => {
  const row = doc.getElementById('tr-row-' + id);
  return row ? row.querySelector('td') : null;
};

(async function run() {

  section('1. Клетката Дата/Час е кликаема — само тя');
  {
    const { doc } = env();
    const td = dateCell(doc, 't-1');
    ok('редът t-1 съществува', !!td);
    ok('първата клетка вика openTransportDetail(this.dataset.id)',
      !!td && td.getAttribute('onclick') === 'openTransportDetail(this.dataset.id)', td && td.getAttribute('onclick'));
    ok('data-id="t-1"', !!td && td.getAttribute('data-id') === 't-1');
    ok('title „Отвори заявката" и cursor:pointer',
      !!td && td.getAttribute('title') === 'Отвори заявката' && /cursor:pointer/.test(td.getAttribute('style') || ''));
    const row = doc.getElementById('tr-row-t-1');
    const others = row ? Array.prototype.filter.call(row.querySelectorAll('td'),
      c => /openTransportDetail/.test(c.getAttribute('onclick') || '')) : [];
    ok('никоя друга клетка не отваря детайла', others.length === 1, others.length);
  }

  section('2. Клик → #trd-ov с клиента и ВСИЧКИ артикули');
  {
    const { w, doc, keydownCount } = env();
    const td = dateCell(doc, 't-1');
    const before = keydownCount();
    if (td) guard('клик по Дата/Час', () => realClick(w, td, 'Дата/Час'));
    const ov = doc.getElementById('trd-ov');
    ok('#trd-ov се появява', !!ov);
    ok('не е cod-ov', !doc.getElementById('cod-ov'));
    const t = ov ? ov.textContent : '';
    ok('заглавие „🚚 Транспорт · Иван Петров"', t.indexOf('🚚 Транспорт · Иван Петров') >= 0);
    ok('обектът Троян', t.indexOf('Троян') >= 0);
    ['ПАРКЕТ ДЪБ', 'ПЕРВАЗ', 'ПОДЛОЖКА', '111', '222', '333', 'ролка'].forEach(s =>
      ok('артикули: ' + s, t.indexOf(s) >= 0));
    ok('„Артикули (3)"', t.indexOf('Артикули (3)') >= 0);
    ok('без предупреждение за стар запис', t.indexOf('Стар запис') < 0);
    ok('касов бон Б-7781', t.indexOf('Б-7781') >= 0);
    ok('адрес', t.indexOf('ул. Васил Левски 12') >= 0);
    const tel = ov && ov.querySelector('a[href^="tel:"]');
    ok('телефонът е tel: само с цифри', !!tel && tel.getAttribute('href') === 'tel:0888111222', tel && tel.getAttribute('href'));
    ok('забележката (notes)', t.indexOf('Звъни преди доставка') >= 0);
    ok('„⏳ чака стока по клиентска заявка"', t.indexOf('⏳ чака стока по клиентска заявка') >= 0);
    ok('№ на клиентската заявка', t.indexOf('№Троян-0042') >= 0);
    ok('добавен е точно един keydown listener', keydownCount() === before + 1, keydownCount() - before);
  }

  section('3. Escape затваря и маха listener-а; втори Escape не хвърля');
  {
    const { w, doc, keydownCount } = env();
    const before = keydownCount();
    const td = dateCell(doc, 't-1');
    if (td) guard('клик', () => realClick(w, td, 'Дата/Час'));
    ok('отворен', !!doc.getElementById('trd-ov'));
    guard('Escape', () => esc(w));
    ok('Escape го затваря', !doc.getElementById('trd-ov'));
    ok('listener-ът е махнат', keydownCount() === before, keydownCount() - before);
    ok('втори Escape не хвърля', guard('втори Escape', () => esc(w)));
    /* Отваряне два пъти поред не трупа listener-и */
    if (td) { guard('клик 1', () => realClick(w, td, 'Дата/Час')); guard('клик 2', () => realClick(w, td, 'Дата/Час')); }
    ok('двойно отваряне → пак един listener', keydownCount() === before + 1, keydownCount() - before);
    ok('и само един #trd-ov', doc.querySelectorAll('#trd-ov').length === 1);
    const x = doc.getElementById('trd-ov') && btnExact(doc.getElementById('trd-ov'), 'Затвори');
    if (x) guard('„Затвори"', () => realClick(w, x, 'Затвори'));
    ok('„Затвори" също маха listener-а', !!x && keydownCount() === before && !doc.getElementById('trd-ov'));
  }

  section('4. Стар запис без items → fallback ред');
  {
    const { w, doc } = env();
    const td = dateCell(doc, 't-2');
    if (td) guard('клик', () => realClick(w, td, 'Дата/Час'));
    const ov = doc.getElementById('trd-ov');
    const t = ov ? ov.textContent : '';
    ok('модалът се отваря', !!ov);
    ok('„Артикули (1)"', t.indexOf('Артикули (1)') >= 0);
    ok('fallback артикулът ВРАТА / 555 / орех', t.indexOf('ВРАТА') >= 0 && t.indexOf('555') >= 0 && t.indexOf('орех') >= 0);
    ok('предупреждение за стар запис', t.indexOf('Стар запис без списък с артикули') >= 0);
    ok('няма „→ отвори" без клиентска заявка', !!ov && !btnExact(ov, '→ отвори'));
    ok('няма ред „чака стока"', t.indexOf('чака стока') < 0);
    ok('няма секция „Забележка"', t.indexOf('Забележка') < 0);
    ok('телефон „—"', !!ov && !ov.querySelector('a[href^="tel:"]'));
  }

  section('5. „→ отвори" вика openClientOrderDetail(client_order_id)');
  {
    const { w, doc } = env();
    const td = dateCell(doc, 't-1');
    if (td) guard('клик', () => realClick(w, td, 'Дата/Час'));
    const ov = doc.getElementById('trd-ov');
    const b = ov && btnExact(ov, '→ отвори');
    ok('бутонът „→ отвори" е <button>', !!b && b.tagName === 'BUTTON');
    const seen = [];
    const real = w.openClientOrderDetail;
    w.openClientOrderDetail = id => { seen.push(id); return real(id); };
    if (b) guard('клик „→ отвори"', () => realClick(w, b, '→ отвори'));
    ok('openClientOrderDetail е извикана с co-9', JSON.stringify(seen) === '["co-9"]', JSON.stringify(seen));
    ok('транспортният модал е затворен', !doc.getElementById('trd-ov'));
    const cod = doc.getElementById('cod-ov');
    ok('отворен е cod-ov на заявка Троян-0042', !!cod && cod.textContent.indexOf('Троян-0042') >= 0);
  }

  section('6. Двата модала не се бият за Escape');
  {
    const { w, doc } = env();
    const td = dateCell(doc, 't-1');
    if (td) guard('клик', () => realClick(w, td, 'Дата/Час'));
    guard('openClientOrderDetail(co-9) отгоре', () => w.openClientOrderDetail('co-9'));
    ok('и двата са отворени', !!doc.getElementById('trd-ov') && !!doc.getElementById('cod-ov'));
    guard('Escape', () => esc(w));
    ok('Escape затваря горния (cod-ov)', !doc.getElementById('cod-ov'));
    ok('транспортният остава', !!doc.getElementById('trd-ov'));
    guard('Escape 2', () => esc(w));
    ok('втори Escape затваря и транспортния', !doc.getElementById('trd-ov'));
  }

  report();
})();
