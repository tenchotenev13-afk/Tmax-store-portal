/* Срок по подразбиране 10 работни дни + задължителна дата от ЦО.
   Пускане: node tests/delivery-default.test.js .
   Зарежда shared.js + transport.js + client-orders.js + history.js +
   notifications.js заедно (реалният ред от index.html), с истински клик. */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, ok, guard, section, report, dayOffset, ticks } = H;

const CO = 'Централен офис';
const USER = { email: 'sn@temax.bg', display_name: 'Снабдяване ЦО', role: 'supply', store_name: CO };

const mkOrder = (id, over) => Object.assign({
  id, in_num: id, store_name: 'Троян', fulfiller: CO, status: 'pending',
  date: dayOffset(-3), hour: '10:00', customer_name: 'Иван Петров', phone: '0888111222',
  product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м',
  items: [{ product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м' }],
  delivery: dayOffset(12), delivery_reason: null, note: '', created_at: new Date().toISOString(),
  co_eta: null, co_note: null, paid_transport: false, transport_id: null, group_id: null
}, over || {});

function env(orders) {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'history.js', 'notifications.js'],
    user: USER,
    data: { client_orders: orders || [], transport_orders: [], stores: [] }
  });
  h.w.transportOrders = [];
  h.w.clientOrders = JSON.parse(JSON.stringify(orders || []));
  h.w.clientOrders.forEach(o => { o._status = h.w.calcStatus(o.delivery, o.status); o._days = 0; o._isFulfiller = false; });
  return h;
}
const el = (doc, id) => doc.getElementById(id);
function setChange(w, doc, id, val) { el(doc, id).value = val; fire(w, el(doc, id), 'change'); }
function fillValid(doc) {
  el(doc, 'c-name').value = 'Мария Тестова';
  el(doc, 'c-phone').value = '0888000111';
  const row = doc.querySelector('#c-items .item-row');
  row.querySelector('.item-product').value = 'МИВКА';
}
const orderPosts = calls => calls.post.filter(p => /client_orders/.test(p.url || p.table || ''));
const lastBody = calls => { const p = orderPosts(calls); return p.length ? p[p.length - 1].body : null; };

(async function run() {

  section('1. addBgWorkdays / bgHolidaysForYear');
  {
    const { w } = env();
    const add = (a, n) => w.addBgWorkdays(a, n);
    ok('CO_DEFAULT_WORKDAYS = 10', w.CO_DEFAULT_WORKDAYS === 10);
    ok('обикновена седмица: пн 05.10.2026 + 10 = пн 19.10', add('2026-10-05', 10) === '2026-10-19');
    ok('през уикенд: пт 09.10.2026 + 1 = пн 12.10', add('2026-10-09', 1) === '2026-10-12');
    ok('+0 връща същата дата', add('2026-10-05', 0) === '2026-10-05');
    ok('22.09.2026 (вт) е почивен', !w.isBgWorkday('2026-09-22'));
    ok('през 22.09: пт 18.09 + 3 = чт 24.09', add('2026-09-18', 3) === '2026-09-24');
    ok('06.09.2026 е неделя и е почивен', !w.isBgWorkday('2026-09-06'));
    ok('06.09 в неделя → 07.09 (пн) почивен', !w.isBgWorkday('2026-09-07'));
    ok('пт 04.09 + 1 = вт 08.09', add('2026-09-04', 1) === '2026-09-08');
    ok('Великден 2026: 10–13.04 почивни', ['2026-04-10', '2026-04-11', '2026-04-12', '2026-04-13'].every(x => !w.isBgWorkday(x)));
    ok('Великден 2026 е 12.04, вт 14.04 е работен', w.isBgWorkday('2026-04-14') && w.bgHolidaysForYear(2026)['2026-04-12']);
    ok('Великден 2027 (02.05): 30.04 и 03.05 почивни', !w.isBgWorkday('2027-04-30') && !w.isBgWorkday('2027-05-03') && w.bgHolidaysForYear(2027)['2027-05-02']);
    ok('Великденските дни не се пренасят (13.04.2026 е последният)', w.isBgWorkday('2026-04-14'));
    ok('24–26.12.2027 (пт–нд): 27 и 28.12 почивни', !w.isBgWorkday('2027-12-27') && !w.isBgWorkday('2027-12-28') && w.isBgWorkday('2027-12-29'));
    ok('чт 23.12.2027 + 1 = ср 29.12', add('2027-12-23', 1) === '2027-12-29');
    ok('01.01.2028 (сб) → 03.01 почивен, 04.01 работен', !w.isBgWorkday('2028-01-03') && w.isBgWorkday('2028-01-04'));
    ok('03.03 / 01.05 / 06.05 / 24.05 / 24.12 са почивни през 2026',
      ['2026-03-03', '2026-05-01', '2026-05-06', '2026-05-24', '2026-12-24'].every(x => !w.isBgWorkday(x)));
    ok('пн 26.10.2026 е обикновен работен ден', w.isBgWorkday('2026-10-26'));
  }

  section('2. Формата „Нова заявка" — автоматичен срок');
  {
    const { w, doc } = env();
    w.openClientModal();
    const auto = w.addBgWorkdays(w.today(), 10);
    ok('при отваряне c-delivery = автоматичната дата', el(doc, 'c-delivery').value === auto);
    ok('min = автоматичната дата', el(doc, 'c-delivery').min === auto);
    ok('текст „Автоматично: 10 работни дни"', /Автоматично: 10 работни дни \(до \d\d\.\d\d\.\d{4}\)/.test(el(doc, 'c-delivery-hint').textContent));
    ok('причината е скрита', el(doc, 'c-delivery-reason-wrap').style.display === 'none');

    setChange(w, doc, 'c-date', '2026-11-02');
    const a2 = w.addBgWorkdays('2026-11-02', 10);
    ok('смяна на c-date → преизчислена дата', el(doc, 'c-delivery').value === a2 && el(doc, 'c-delivery').min === a2);

    /* ръчно избрана по-късна дата не се пипа от смяна на c-date, ако още е ≥ min */
    setChange(w, doc, 'c-delivery', '2027-01-20');
    ok('по-късна дата → показва се причината', el(doc, 'c-delivery-reason-wrap').style.display === '');
    setChange(w, doc, 'c-date', '2026-11-03');
    ok('смяна на c-date запазва ръчната по-късна дата', el(doc, 'c-delivery').value === '2027-01-20');
    /* ръчна дата, която след смяна на c-date стане < min → автоматична */
    setChange(w, doc, 'c-date', '2027-03-01');
    ok('станала по-ранна от min → автоматична', el(doc, 'c-delivery').value === w.addBgWorkdays('2027-03-01', 10));
    ok('причината се скрива и чисти', el(doc, 'c-delivery-reason-wrap').style.display === 'none' && el(doc, 'c-delivery-reason').value === '');
  }

  section('3. Запис: по-ранна / по-късна / равна / празна');
  {
    /* по-ранна дата → отказ */
    let { w, doc, calls } = env();
    w.openClientModal(); fillValid(doc);
    el(doc, 'c-delivery').value = dayOffset(1);
    realClick(w, el(doc, 'co-submit'));
    await ticks();
    ok('по-ранна дата → няма POST', orderPosts(calls).length === 0);
    ok('по-ранна дата → червен toast', calls.toast.some(t => /по-кратък/.test(typeof t === 'string' ? t : t.msg || '')));
    ok('бутонът остава активен', el(doc, 'co-submit').disabled === false);

    /* по-късна без причина → отказ */
    ({ w, doc, calls } = env());
    w.openClientModal(); fillValid(doc);
    setChange(w, doc, 'c-delivery', w.addBgWorkdays(w.today(), 30));
    realClick(w, el(doc, 'co-submit'));
    await ticks();
    ok('по-късна без причина → няма POST', orderPosts(calls).length === 0);
    ok('по-късна без причина → toast за причина', calls.toast.some(t => /причина/.test(typeof t === 'string' ? t : t.msg || '')));

    /* по-късна с причина → запис */
    ({ w, doc, calls } = env());
    w.openClientModal(); fillValid(doc);
    const late = w.addBgWorkdays(w.today(), 30);
    setChange(w, doc, 'c-delivery', late);
    el(doc, 'c-delivery-reason').value = 'Поръчка от доставчик';
    realClick(w, el(doc, 'co-submit'));
    await ticks();
    let b = lastBody(calls);
    ok('по-късна с причина → POST', !!b);
    ok('delivery = избраната', b && b.delivery === late);
    ok('delivery_reason е записана', b && b.delivery_reason === 'Поръчка от доставчик');

    /* дата = автоматичната → reason null (дори да е останал текст) */
    ({ w, doc, calls } = env());
    w.openClientModal(); fillValid(doc);
    const auto = w.addBgWorkdays(w.today(), 10);
    el(doc, 'c-delivery-reason').value = 'остатък';
    realClick(w, el(doc, 'co-submit'));
    await ticks();
    b = lastBody(calls);
    ok('равна на автоматичната → POST', !!b && b.delivery === auto);
    ok('равна → delivery_reason null', b && b.delivery_reason === null);

    /* празно поле → автоматичната */
    ({ w, doc, calls } = env());
    w.openClientModal(); fillValid(doc);
    el(doc, 'c-delivery').value = '';
    realClick(w, el(doc, 'co-submit'));
    await ticks();
    b = lastBody(calls);
    ok('празно поле → записва автоматичната', b && b.delivery === auto && b.delivery_reason === null);
  }

  section('4. „Още една заявка за същия клиент" — prefill');
  {
    const O = mkOrder('p1', { delivery: '2099-01-15', delivery_reason: 'Внос' });
    let { w, doc } = env([O]);
    guard('coAddAnotherForCustomer', () => w.coAddAnotherForCustomer('p1'));
    ok('prefill пренася delivery', el(doc, 'c-delivery').value === '2099-01-15');
    ok('prefill пренася delivery_reason', el(doc, 'c-delivery-reason').value === 'Внос');
    ok('причината е видима', el(doc, 'c-delivery-reason-wrap').style.display === '');

    const O2 = mkOrder('p2', { delivery: '2020-01-15', delivery_reason: 'Стара' });
    ({ w, doc } = env([O2]));
    w.coAddAnotherForCustomer('p2');
    ok('по-ранна от min → автоматична', el(doc, 'c-delivery').value === w.addBgWorkdays(w.today(), 10));
    ok('и причината не се пренася', el(doc, 'c-delivery-reason').value === '');
  }

  section('5. Модал „Обработена от ЦО"');
  {
    const O = mkOrder('c1', { delivery: dayOffset(12) });
    const open = (e) => { e.w.openCoProcessedModal('c1'); return e.w.document; };
    const submit = async (e) => { realClick(e.w, e.w.document.getElementById('cop-submit')); await ticks(); };
    const patches = e => e.calls.patch.filter(p => /client_orders/.test(p.url));

    let e = env([O]); let doc = open(e);
    ok('етикетът на датата е със *', /дата за получаване в обекта \*/.test(doc.querySelector('#cop-ov label').textContent));
    await submit(e);
    ok('без co_eta → отказ', patches(e).length === 0 && !!doc.getElementById('cop-ov'));

    e = env([O]); doc = open(e);
    doc.getElementById('cop-eta').value = dayOffset(-1);
    doc.getElementById('cop-note').value = 'коментар има — пада се на датата';
    await submit(e);
    ok('co_eta в миналото → отказ', patches(e).length === 0);

    e = env([O]); doc = open(e);
    doc.getElementById('cop-eta').value = dayOffset(15);
    fire(e.w, doc.getElementById('cop-eta'), 'change');
    ok('различна дата → етикетът на коментара е със *', /\*$/.test(doc.getElementById('cop-note-lbl').textContent));
    await submit(e);
    ok('co_eta ≠ delivery без коментар → отказ', patches(e).length === 0);

    doc.getElementById('cop-note').value = 'ТЕСИ, поръчка 1';
    await submit(e);
    ok('с коментар → запис', patches(e).length === 1 && patches(e)[0].body.co_eta === dayOffset(15));
    ok('delivery не се пипа', !('delivery' in patches(e)[0].body));

    e = env([O]); doc = open(e);
    doc.getElementById('cop-eta').value = dayOffset(12);
    fire(e.w, doc.getElementById('cop-eta'), 'change');
    ok('равна на delivery → без звезда на коментара', !/\*$/.test(doc.getElementById('cop-note-lbl').textContent));
    await submit(e);
    ok('равна на delivery → записва без коментар', patches(e).length === 1 && patches(e)[0].body.co_note === null);

    /* днес (граничен случай) е позволено */
    e = env([O]); doc = open(e);
    doc.getElementById('cop-eta').value = dayOffset(0);
    doc.getElementById('cop-note').value = 'днес';
    await submit(e);
    ok('co_eta = днес → допустимо', patches(e).length === 1);

    /* редакция на стара обработена заявка без co_eta */
    const OLD = mkOrder('c1', { status: 'processed', co_eta: null, co_note: null });
    e = env([OLD]); doc = open(e);
    ok('редакция: isEdit бутон „Запази"', /Запази/.test(doc.getElementById('cop-submit').textContent));
    await submit(e);
    ok('редакция без co_eta → отказ', patches(e).length === 0);
  }

  section('6. delivery_reason се показва (детайл + История)');
  {
    const O = mkOrder('d1', { delivery_reason: 'УНИКАЛНА-ПРИЧИНА <b>' });
    const { w, doc } = env([O]);
    guard('openClientOrderDetail', () => w.openClientOrderDetail('d1'));
    const html = doc.body.innerHTML;
    ok('детайлът показва причината', html.indexOf('УНИКАЛНА-ПРИЧИНА') >= 0);
    ok('причината е ескейпната', html.indexOf('УНИКАЛНА-ПРИЧИНА <b>') < 0);
    const src = require('fs').readFileSync(__dirname + '/../history.js', 'utf8');
    ok('history.js показва delivery_reason на екран и в печат', (src.match(/delivery_reason/g) || []).length >= 2);
    w.renderClientOrders && guard('renderClientOrders', () => w.renderClientOrders());
    ok('редът в таба показва причината', doc.body.textContent.indexOf('УНИКАЛНА-ПРИЧИНА') >= 0);
  }

  report();
})();
