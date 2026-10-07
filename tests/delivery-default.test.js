/* Срок по подразбиране 10 работни дни + задължителна дата от ЦО.
   Пускане: node tests/delivery-default.test.js .
   Зарежда shared.js + transport.js + client-orders.js + history.js +
   notifications.js заедно (реалният ред от index.html), с истински клик. */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, ok, guard, section, report, dayOffset, ticks } = H;

const CO = 'Централен офис';
const USER = { email: 'sn@temax.bg', display_name: 'Снабдяване ЦО', role: 'supply', store_name: CO };

/* Първият РАБОТЕН ден на или след днес+n — датата от ЦО не може да е почивен ден,
   а фикстурите са относителни към днес; без това тестът мига според деня от седмицата. */
const PROBE = boot({ modules: [], user: USER, data: {} }).w;
const iso = dt => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
const wk = n => { let dt = new Date(dayOffset(n) + 'T00:00:00'); while (!PROBE.isBgWorkday(iso(dt))) dt.setDate(dt.getDate() + 1); return iso(dt); };
/* Първата събота/неделя на или след днес+30 и първото 22.09 във делник след днес */
const nextDow = (dow) => { const dt = new Date(dayOffset(30) + 'T00:00:00'); while (dt.getDay() !== dow) dt.setDate(dt.getDate() + 1); return iso(dt); };
const nextIndep = () => { for (let y = new Date().getFullYear(); ; y++) { const dt = new Date(y, 8, 22); const w = dt.getDay(); if (w >= 1 && w <= 5 && iso(dt) > dayOffset(0)) return iso(dt); } };

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
    const O = mkOrder('c1', { delivery: wk(12) });
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
    doc.getElementById('cop-eta').value = wk(15);
    fire(e.w, doc.getElementById('cop-eta'), 'change');
    ok('различна дата → етикетът на коментара е със *', /\*$/.test(doc.getElementById('cop-note-lbl').textContent));
    await submit(e);
    ok('co_eta ≠ delivery без коментар → отказ', patches(e).length === 0);

    doc.getElementById('cop-note').value = 'ТЕСИ, поръчка 1';
    await submit(e);
    ok('с коментар → запис', patches(e).length === 1 && patches(e)[0].body.co_eta === wk(15));
    ok('delivery не се пипа', !('delivery' in patches(e)[0].body));

    e = env([O]); doc = open(e);
    doc.getElementById('cop-eta').value = wk(12);
    fire(e.w, doc.getElementById('cop-eta'), 'change');
    ok('равна на delivery → без звезда на коментара', !/\*$/.test(doc.getElementById('cop-note-lbl').textContent));
    await submit(e);
    ok('равна на delivery → записва без коментар', patches(e).length === 1 && patches(e)[0].body.co_note === null);

    /* днес (граничен случай) е позволено */
    e = env([O]); doc = open(e);
    doc.getElementById('cop-eta').value = wk(0);
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

  section('5б. Датата от ЦО — само работни дни');
  {
    const open = (e, id) => { e.w.openCoProcessedModal(id || 'c1'); return e.w.document; };
    const submit = async (e) => { realClick(e.w, e.w.document.getElementById('cop-submit')); await ticks(); };
    const patches = e => e.calls.patch.filter(p => /client_orders/.test(p.url));
    const fmt = s => s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4);
    const toasts = e => e.calls.toast.map(t => (typeof t === 'string' ? t : t.msg || '')).join(' | ');
    const WD = wk(12);                      /* работен срок на заявката */
    const O = mkOrder('c1', { delivery: WD });
    const SAT = nextDow(6), SUN = nextDow(0), IND = nextIndep();

    /* всяка от трите дати има коментар, за да не пада на коментара, а на дата */
    for (const [name, date] of [['събота', SAT], ['неделя', SUN], ['22.09 (празник, делник)', IND]]) {
      const e = env([O]); const doc = open(e);
      doc.getElementById('cop-eta').value = date;
      doc.getElementById('cop-note').value = 'има коментар';
      await submit(e);
      ok(name + ' (' + date + ') → отказ, няма PATCH', patches(e).length === 0 && !!doc.getElementById('cop-ov'));
      ok(name + ' → червен toast „' + fmt(date) + ' е почивен ден — избери работен ден"',
        toasts(e).indexOf(fmt(date) + ' е почивен ден — избери работен ден') >= 0, toasts(e));
    }
    ok('22.09 е действително делник и празник (проверка на самия тест)',
      new Date(IND + 'T00:00:00').getDay() % 6 !== 0 && !PROBE.isBgWorkday(IND), IND);

    /* работен ден = срока → минава без коментар */
    let e = env([O]); let doc = open(e);
    doc.getElementById('cop-eta').value = WD;
    fire(e.w, doc.getElementById('cop-eta'), 'change');
    await submit(e);
    ok('работен ден = срока → записва без коментар', patches(e).length === 1 && patches(e)[0].body.co_eta === WD && patches(e)[0].body.co_note === null);

    /* работен ден ≠ срока без коментар → отказ (правилото за коментара е същото) */
    e = env([O]); doc = open(e);
    doc.getElementById('cop-eta').value = wk(20);
    fire(e.w, doc.getElementById('cop-eta'), 'change');
    await submit(e);
    ok('работен ден ≠ срока без коментар → отказ', patches(e).length === 0 && /коментар/.test(toasts(e)), toasts(e));

    /* подсказката */
    e = env([O]); doc = open(e);
    ok('под полето: „Само работни дни"', doc.getElementById('cop-eta-hint').textContent.indexOf('Само работни дни') === 0);
    ok('срокът е работен → няма съобщение за почивен срок', doc.getElementById('cop-eta-hint').textContent.indexOf('почивен') < 0);
    doc.getElementById('cop-eta').value = SAT;
    fire(e.w, doc.getElementById('cop-eta'), 'change');
    ok('избрана събота → червено съобщение в подсказката',
      doc.getElementById('cop-eta-hint').textContent === fmt(SAT) + ' е почивен ден — избери работен ден');

    /* срокът на заявката е почивен ден: нищо не се попълва, само съобщение */
    const O2 = mkOrder('c1', { delivery: SAT });
    e = env([O2]); doc = open(e);
    ok('срок почивен → cop-eta остава празно (без автоматично попълване)', doc.getElementById('cop-eta').value === '');
    ok('срок почивен → „Срокът на заявката (ДД.ММ) е почивен ден"',
      doc.getElementById('cop-eta-hint').textContent.indexOf('Срокът на заявката (' + fmt(SAT).slice(0, 5) + ') е почивен ден') >= 0,
      doc.getElementById('cop-eta-hint').textContent);
    await submit(e);
    ok('без избрана дата пак → отказ (задължителна)', patches(e).length === 0);

    /* редакция („✏️ Дата от ЦО") на заявка със съхранена почивна co_eta — като Пирдоп-0258 */
    const OLD = mkOrder('c1', { status: 'processed', delivery: SUN, co_eta: SUN, co_note: 'стар' });
    e = env([OLD]); doc = open(e);
    ok('редакция: съхранената неделя се показва в червено', /почивен ден/.test(doc.getElementById('cop-eta-hint').textContent));
    await submit(e);
    ok('редакция с неделя (= срока) → отказ', patches(e).length === 0 && toasts(e).indexOf(fmt(SUN) + ' е почивен ден') >= 0, toasts(e));
    doc.getElementById('cop-eta').value = wk(14);
    fire(e.w, doc.getElementById('cop-eta'), 'change');
    await submit(e);
    ok('редакция с поправена работна дата (коментарът е вече попълнен) → записва', patches(e).length === 1 && patches(e)[0].body.co_eta === wk(14));
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

  section('7. Корекция на клиентска заявка — срок и причина');
  {
    const ADMIN = { email: 'ad@temax.bg', display_name: 'Админ', role: 'admin', store_name: CO };
    const REQ = dayOffset(-3);
    const MINC = (w, d) => w.addBgWorkdays(d || REQ, 10);
    const cenv = (over) => {
      const O = mkOrder('k1', Object.assign({ date: REQ, delivery: dayOffset(20), delivery_reason: 'Стара причина' }, over || {}));
      const h = boot({ modules: ['transport.js', 'client-orders.js', 'history.js', 'notifications.js'], user: ADMIN,
        data: { client_orders: [O], transport_orders: [{ id: 't1', store_name: 'Троян', date: REQ, delivery: dayOffset(1), customer_name: 'Т', phone: '1', items: [], notes: '' }], stores: [] } });
      h.w.transportOrders = [{ id: 't1', store_name: 'Троян', date: REQ, delivery: dayOffset(1), customer_name: 'Т', phone: '1', hour: '10:00', items: [{ product: 'Х', qty: 1, unit: 'бр' }], notes: '' }];
      h.w.clientOrders = JSON.parse(JSON.stringify([O]));
      h.w.clientOrders.forEach(o => { o._status = h.w.calcStatus(o.delivery, o.status); });
      return h;
    };
    const cpatch = e => e.calls.patch.filter(p => /client_orders/.test(p.url));
    const hasToast = (e, re) => e.calls.toast.some(t => re.test(typeof t === 'string' ? t : t.msg || ''));
    const save = async (e) => {
      const btn = Array.from(e.doc.querySelectorAll('#correction-modal .btn-green')).find(b => /submitCorrection/.test(b.getAttribute('onclick')));
      realClick(e.w, btn); await ticks();
    };

    /* без смяна на датата → минава както досега */
    let e = cenv(); e.w.openCorrection('k1', 'client_orders');
    ok('отваряне: срокът е зареден', el(e.doc, 'edt-delivery').value === dayOffset(20));
    ok('отваряне: причината е скрита', el(e.doc, 'edt-delivery-reason-wrap').style.display === 'none');
    ok('отваряне: причината е попълнена с текущата', el(e.doc, 'edt-delivery-reason').value === 'Стара причина');
    ok('отваряне: min = дата на заявката + 10 р.д.', el(e.doc, 'edt-delivery').min === MINC(e.w));
    el(e.doc, 'edt-name').value = 'Нов Клиент';
    await save(e);
    ok('без смяна на срока → PATCH', cpatch(e).length === 1 && cpatch(e)[0].body.customer_name === 'Нов Клиент');
    ok('без смяна → delivery непроменен, delivery_reason не се пипа', cpatch(e)[0].body.delivery === dayOffset(20) && !('delivery_reason' in cpatch(e)[0].body));

    /* смяна без причина → отказ */
    e = cenv(); e.w.openCorrection('k1', 'client_orders');
    setChange(e.w, e.doc, 'edt-delivery', dayOffset(25));
    ok('смяна → причината се показва', el(e.doc, 'edt-delivery-reason-wrap').style.display === '');
    el(e.doc, 'edt-delivery-reason').value = '';
    await save(e);
    ok('смяна без причина → няма PATCH', cpatch(e).length === 0);
    ok('смяна без причина → червен toast', hasToast(e, /причина/));

    /* по-ранна от минимума → отказ (границата −1 ден) */
    e = cenv(); e.w.openCorrection('k1', 'client_orders');
    const minD = MINC(e.w), before = e.w.localDateISO(new Date(new Date(minD + 'T00:00:00').getTime() - 86400000));
    setChange(e.w, e.doc, 'edt-delivery', before);
    el(e.doc, 'edt-delivery-reason').value = 'искам по-рано';
    await save(e);
    ok('ден преди минимума → отказ', cpatch(e).length === 0 && hasToast(e, /по-кратък/));

    /* точно минимумът → допустим, причината се чисти (null) */
    e = cenv(); e.w.openCorrection('k1', 'client_orders');
    setChange(e.w, e.doc, 'edt-delivery', minD);
    await save(e);
    ok('точно минимумът → PATCH с delivery_reason null', cpatch(e).length === 1 && cpatch(e)[0].body.delivery === minD && cpatch(e)[0].body.delivery_reason === null);

    /* празна → отказ */
    e = cenv(); e.w.openCorrection('k1', 'client_orders');
    setChange(e.w, e.doc, 'edt-delivery', '');
    el(e.doc, 'edt-delivery-reason').value = 'х';
    await save(e);
    ok('празна дата → отказ', cpatch(e).length === 0 && hasToast(e, /празен/));

    /* с причина → patch носи delivery и delivery_reason (презаписва старата) */
    e = cenv(); e.w.openCorrection('k1', 'client_orders');
    setChange(e.w, e.doc, 'edt-delivery', dayOffset(30));
    el(e.doc, 'edt-delivery-reason').value = 'Нова причина';
    await save(e);
    ok('с причина → PATCH', cpatch(e).length === 1);
    ok('patch.delivery и patch.delivery_reason', cpatch(e)[0].body.delivery === dayOffset(30) && cpatch(e)[0].body.delivery_reason === 'Нова причина');

    /* смяна на датата на заявката → минимумът се смята от новата */
    e = cenv(); e.w.openCorrection('k1', 'client_orders');
    setChange(e.w, e.doc, 'edt-date', dayOffset(10));
    const m2 = MINC(e.w, dayOffset(10));
    ok('смяна на edt-date → преизчислен min', el(e.doc, 'edt-delivery').min === m2);
    setChange(e.w, e.doc, 'edt-delivery', dayOffset(21));
    el(e.doc, 'edt-delivery-reason').value = 'причина';
    await save(e);
    ok('срок по-ранен от новия минимум → отказ', cpatch(e).length === 0 && hasToast(e, /по-кратък/));

    /* сменена дата, срокът НЕ е пипан и е по-ранен от новия минимум → отказ */
    e = cenv(); e.w.openCorrection('k1', 'client_orders');
    setChange(e.w, e.doc, 'edt-date', dayOffset(10));
    await save(e);
    ok('сменена дата + стар срок под новия минимум → отказ', cpatch(e).length === 0 && hasToast(e, /по-кратък/));
    ok('toast носи минимума', hasToast(e, new RegExp(e.w.fmtDate(MINC(e.w, dayOffset(10))).replace(/./g, '\.'))));

    /* сменена дата, срокът още е ≥ новия минимум → минава без причина */
    e = cenv({ delivery: dayOffset(60) }); e.w.openCorrection('k1', 'client_orders');
    setChange(e.w, e.doc, 'edt-date', dayOffset(10));
    await save(e);
    ok('сменена дата, срок над минимума → PATCH без причина', cpatch(e).length === 1 && !('delivery_reason' in cpatch(e)[0].body));

    /* нито датата, нито срокът → минава дори при кратък стар срок */
    e = cenv({ delivery: dayOffset(1) }); e.w.openCorrection('k1', 'client_orders');
    el(e.doc, 'edt-phone').value = '0899123456';
    await save(e);
    ok('нито дата, нито срок (стар кратък срок) → PATCH минава', cpatch(e).length === 1 && cpatch(e)[0].body.phone === '0899123456');

    /* transport_orders — непроменена */
    e = cenv(); e.w.openCorrection('t1', 'transport_orders');
    ok('транспорт: причината е скрита', el(e.doc, 'edt-delivery-reason-wrap').style.display === 'none');
    ok('транспорт: няма min', !el(e.doc, 'edt-delivery').min);
    setChange(e.w, e.doc, 'edt-delivery', dayOffset(-5));
    await save(e);
    const tp = e.calls.patch.filter(p => /transport_orders/.test(p.url));
    ok('транспорт: по-ранна дата без причина → PATCH минава', tp.length === 1 && tp[0].body.delivery === dayOffset(-5) && !('delivery_reason' in tp[0].body));
  }

  report();
})();
