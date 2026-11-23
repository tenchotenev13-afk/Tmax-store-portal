/* „★ Дата на доставка" е задължителна в транспортната заявка (23.11.2026).

   Без delivery заявката не се брои за закъсняла (reportIsLate) и изчезва
   от седмичния отчет и от „Днес". Колоната остава nullable — заварените
   редове не се пипат, но:
   · НОВА заявка (transport.js/submitTransport) без дата → няма запис,
     червен toast, полето се маркира; проверката за конфликт НЕ тръгва;
   · КОРЕКЦИЯ на транспорт (shared.js/submitCorrection) — датата не може да
     се изчисти, а заварен ред без нея трябва да я получи;
   · платеният транспорт от клиентска заявка (client-orders.js) — непроменен.

   Пускане:
     node tests/transport-delivery-required.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, ticks, dayOffset, tsOffset } = H;

const STORE_USER = {
  email: 'petrich@temax.bg', display_name: 'Магазин Петрич',
  role: 'user', store_name: 'Петрич'
};
/* accounting → canCorrectRecord()===true за чужда заявка */
const CO_USER = {
  email: 'p.georgieva@temax.bg', display_name: 'П. Георгиева',
  role: 'accounting', store_name: 'Централен офис',
  assigned_stores: ['Карлово', 'Пирдоп']
};
const STORES = [{ name: 'Карлово' }, { name: 'Петрич' }, { name: 'Централен офис' }];

const D_DEL = dayOffset(5);
const TR_WITH = {
  id: 't-1', store_name: 'Карлово', status: 'pending',
  date: dayOffset(-2), hour: '10:00',
  customer_name: 'Мария Георгиева', phone: '0888333444',
  address: 'Карлово, ул. Тест 2',
  product: 'МИВКА', sap: '222', qty: 1, unit: 'бр.',
  items: [{ product: 'МИВКА', sap: '222', qty: 1, unit: 'бр.' }],
  delivery: D_DEL, notes: '', agent: 'П. Георгиева', created_at: tsOffset(-2)
};
/* Заварен ред отпреди правилото — без delivery */
const TR_LEGACY = Object.assign({}, TR_WITH, { id: 't-2', delivery: null });

const CO_ORDER = {
  id: 'o-1', in_num: 'Карлово-0001', store_name: 'Карлово', from_store: 'Карлово',
  fulfiller: 'Централен офис', status: 'pending', date: dayOffset(-1), hour: '11:00',
  customer_name: 'Иван Петров', phone: '0888111222',
  product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м',
  items: [{ product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м' }],
  delivery: dayOffset(9), note: '', agent: 'П. Георгиева', created_at: tsOffset(-1),
  paid_transport: false, transport_id: null
};

function env(user) {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: user,
    data: { client_orders: [], transport_orders: [], stores: STORES }
  });
  h.w.transportOrders = JSON.parse(JSON.stringify([TR_WITH, TR_LEGACY]));
  h.w.clientOrders = JSON.parse(JSON.stringify([CO_ORDER]));
  h.w.clientOrders.forEach(o => { o._status = h.w.calcStatus(o.delivery, o.status); });
  return h;
}

const trPosts = calls => calls.post.filter(p => p.table === 'transport_orders');
const trPatches = calls => calls.patch.filter(p => p.table === 'transport_orders');

function fillNew(doc, delivery) {
  doc.getElementById('o-name').value = 'Георги Тестов';
  doc.getElementById('o-phone').value = '0899123456';
  doc.getElementById('o-addr').value = 'гр. Петрич, ул. Тестова 7';
  const row = doc.querySelector('#o-items .item-row');
  row.querySelector('.item-product').value = 'ДИВАН';
  row.querySelector('.item-qty').value = '1';
  doc.getElementById('o-delivery').value = delivery;
}
async function clickSubmitNew(w, doc) {
  const b = btn(doc.getElementById('transport-modal'), 'Подай заявката');
  if (!b) throw new Error('няма бутон „Подай заявката"');
  realClick(w, b, 'Подай заявката');
  await ticks(8);
}
async function clickSaveCorrection(w, doc) {
  const b = btn(doc.getElementById('correction-modal'), 'Запази корекцията');
  if (!b) throw new Error('няма бутон „Запази корекцията"');
  realClick(w, b, 'Запази корекцията');
  await ticks(8);
}
const RED = /220,\s*38,\s*38|#dc2626/i;

(async function run() {

  section('0. Етикетите маркират полето като задължително (*)');
  {
    const { doc } = env(STORE_USER);
    const lbl = id => doc.getElementById(id).parentElement.querySelector('label').textContent;
    ok('нова заявка: „★ Дата на доставка *"', lbl('o-delivery') === '★ Дата на доставка *', lbl('o-delivery'));
    ok('корекция: „★ Дата на доставка *"', lbl('edt-delivery') === '★ Дата на доставка *', lbl('edt-delivery'));
  }

  section('1. Нова заявка БЕЗ дата → няма запис, червен toast, полето е маркирано');
  {
    const { w, doc, calls } = env(STORE_USER);
    guard('openTransportModal() не хвърля', () => w.openTransportModal());
    await ticks(4);
    fillNew(doc, '');
    const getsBefore = calls.get.length;
    await clickSubmitNew(w, doc);
    ok('няма POST към transport_orders', trPosts(calls).length === 0, trPosts(calls).length);
    ok('toast „Попълни дата на доставка"', calls.toast.indexOf('Попълни дата на доставка') >= 0, JSON.stringify(calls.toast));
    ok('проверката за конфликт НЕ е пусната (няма GET)',
      !calls.get.slice(getsBefore).some(u => /transport_orders/.test(u)),
      JSON.stringify(calls.get.slice(getsBefore)));
    ok('полето е с червена рамка', RED.test(doc.getElementById('o-delivery').style.borderColor),
      doc.getElementById('o-delivery').style.borderColor);
    ok('модалът остава отворен', doc.getElementById('transport-modal').classList.contains('open'));

    /* Попълва датата и подава пак — същият модал */
    doc.getElementById('o-delivery').value = D_DEL;
    await clickSubmitNew(w, doc);
    const p = trPosts(calls);
    if (ok('след попълване: точно 1 POST', p.length === 1, p.length)) {
      ok('POST-ът носи delivery', p[0].body.delivery === D_DEL, p[0].body.delivery);
    }
    ok('червената рамка е махната', !doc.getElementById('o-delivery').style.borderColor,
      doc.getElementById('o-delivery').style.borderColor);
  }

  section('2. Нова заявка С дата → POST с delivery; повторно отваряне чисти рамката');
  {
    const { w, doc, calls } = env(STORE_USER);
    w.openTransportModal(); await ticks(4);
    fillNew(doc, D_DEL);
    await clickSubmitNew(w, doc);
    const p = trPosts(calls);
    if (ok('точно 1 POST', p.length === 1, p.length)) {
      ok('delivery = попълнената дата', p[0].body.delivery === D_DEL, p[0].body.delivery);
      ok('другите полета са на място', p[0].body.customer_name === 'Георги Тестов' && p[0].body.address === 'гр. Петрич, ул. Тестова 7');
    }
    doc.getElementById('o-delivery').style.borderColor = '#dc2626';
    w.openTransportModal(); await ticks(4);
    ok('openTransportModal() маха останала червена рамка', !doc.getElementById('o-delivery').style.borderColor);
  }

  section('3. Корекция: изчистена дата → няма запис');
  {
    const { w, doc, calls } = env(CO_USER);
    guard('openCorrection(t-1) не хвърля', () => w.openCorrection('t-1', 'transport_orders'));
    await ticks(4);
    ok('полето е попълнено от записа', doc.getElementById('edt-delivery').value === D_DEL);
    doc.getElementById('edt-delivery').value = '';
    await clickSaveCorrection(w, doc);
    ok('няма PATCH към transport_orders', trPatches(calls).length === 0, trPatches(calls).length);
    ok('toast „Попълни дата на доставка"', calls.toast.indexOf('Попълни дата на доставка') >= 0, JSON.stringify(calls.toast));
    ok('полето е с червена рамка', RED.test(doc.getElementById('edt-delivery').style.borderColor));
  }

  section('4. Корекция на ЗАВАРЕН ред без дата → иска дата; с дата → записва');
  {
    const { w, doc, calls } = env(CO_USER);
    w.openCorrection('t-2', 'transport_orders'); await ticks(4);
    ok('полето е празно (заварен ред)', doc.getElementById('edt-delivery').value === '');
    await clickSaveCorrection(w, doc);
    ok('без дата: няма PATCH', trPatches(calls).length === 0, trPatches(calls).length);
    ok('без дата: toast', calls.toast.indexOf('Попълни дата на доставка') >= 0, JSON.stringify(calls.toast));

    doc.getElementById('edt-delivery').value = D_DEL;
    await clickSaveCorrection(w, doc);
    const p = trPatches(calls);
    if (ok('с дата: точно 1 PATCH', p.length === 1, p.length)) {
      ok('PATCH-ът е за t-2', /id=eq\.t-2/.test(decodeURIComponent(p[0].url)), p[0].url);
      ok('PATCH-ът носи delivery', p[0].body.delivery === D_DEL, p[0].body.delivery);
    }
    ok('червената рамка е махната', !doc.getElementById('edt-delivery').style.borderColor);
  }

  section('5. Корекция с непроменена дата → записва както досега');
  {
    const { w, doc, calls } = env(CO_USER);
    w.openCorrection('t-1', 'transport_orders'); await ticks(4);
    doc.getElementById('edt-name').value = 'Мария Петрова';
    await clickSaveCorrection(w, doc);
    const p = trPatches(calls);
    if (ok('1 PATCH', p.length === 1, p.length)) {
      ok('delivery е запазен', p[0].body.delivery === D_DEL, p[0].body.delivery);
      ok('името е сменено', p[0].body.customer_name === 'Мария Петрова');
    }
  }

  section('6. Клиентска корекция НЕ е засегната от новата проверка');
  {
    const { w, doc, calls } = env(CO_USER);
    w.openCorrection('o-1', 'client_orders'); await ticks(4);
    await clickSaveCorrection(w, doc);
    ok('клиентската корекция с непроменени данни минава (1 PATCH)',
      calls.patch.filter(p => p.table === 'client_orders').length === 1, JSON.stringify(calls.toast));
    ok('без toast „Попълни дата на доставка"', calls.toast.indexOf('Попълни дата на доставка') < 0);
  }

  section('7. Платен транспорт от клиентска заявка — непроменен, праща delivery');
  {
    const { w, doc, calls } = env(CO_USER);
    guard('openPaidTransportModal() не хвърля', () => w.openPaidTransportModal('o-1'));
    ok('датата е попълнена от клиентската заявка', doc.getElementById('pt-delivery').value === CO_ORDER.delivery);
    doc.getElementById('pt-addr').value = 'Карлово, ул. Платена 3';
    const b = doc.getElementById('pt-submit');
    realClick(w, b, 'Създай транспорт');
    await ticks(8);
    const p = trPosts(calls);
    if (ok('1 POST към transport_orders', p.length === 1, p.length)) {
      ok('delivery = датата от клиентската заявка', p[0].body.delivery === CO_ORDER.delivery, p[0].body.delivery);
      ok('client_order_id сочи заявката', p[0].body.client_order_id === 'o-1');
    }
  }

  report();
})();
