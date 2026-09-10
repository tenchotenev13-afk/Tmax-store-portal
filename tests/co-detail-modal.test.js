/* Клиентски заявки — модал с ПЪЛНИТЕ данни при клик върху реда.

   Редът показва част от полетата; останалото се четеше само от печатната
   бланка или от базата. openClientOrderDetail() е само за ЧЕТЕНЕ — бутоните
   за действие остават в реда, за да няма два пътя за една и съща промяна.

   Какво заковава тестът:
     1. кликат се САМО Дата/Час, SAP и Продукт; клетката „Клиент" пази своя
        openCustomerOrders, а колоната с бутоните не отваря модала;
     2. пълният списък артикули — заявка с 3 реда показва и трите, не само
        първия (127 заявки в базата имат повече от един артикул, до 10);
     3. fallback при items=null (22 такива записа, последният 14.07.2026);
     4. co_note и note излизат ЦЕЛИ — 200 знака без отрязване;
     5. Escape, „Затвори" и ✕ затварят; слушателят за Escape се маха;
     6. escaping — note с <script> не се изпълнява и не става markup;
     7. нула заявки към базата, докато модалът се отваря и затваря;
     8. СЪЩАТА функция и в История: ред, който е само в histData.client и го
        няма в clientOrders, пак се отваря (CLAUDE.md т.7 — не копие).

   Пускане:  node tests/co-detail-modal.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btnExact, ok, guard, section, report,
        dayOffset, tsOffset, ticks } = H;

const CO = 'Централен офис';
const USER = {
  email: 'co@temax.bg', display_name: 'Снабдяване ЦО',
  role: 'supply', store_name: CO
};

/* 200 знака — проверката за „цял текст" иска число, не „дълъг". */
const LONG_NOTE = 'ТЕСИ поръчка 4500123 — доставчикът потвърди по телефона, че стоката тръгва '
  + 'следващата седмица, но без точна дата; ако не дойде до петък, да се звънне на Мария от '
  + 'отдел снабдяване и да се провери дали.';
const XSS_NOTE = 'Преди <script>window.__pwned=1;</script> след';

function order(over) {
  return Object.assign({
    store_name: 'Троян', from_store: 'Троян', fulfiller: CO,
    status: 'pending', date: dayOffset(-3), hour: '10:00', bon: '000123',
    customer_name: 'Иван Петров', phone: '0888 111 222',
    agent: 'Мария Иванова',
    product: 'ПАРКЕТ', color: 'дъб', sap: '111222', qty: 5, unit: 'кв.м',
    items: null, delivery: dayOffset(7), note: '',
    co_eta: null, co_note: null, co_processed_at: null, co_processed_by: null,
    paid_transport: false, transport_id: null, group_id: null,
    created_at: tsOffset(-3)
  }, over);
}

/* o-multi: три артикула — ядрото на „не само първия" */
const O_MULTI = order({
  id: 'o-multi', in_num: 'Троян-0001',
  items: [
    { product: 'ПАРКЕТ', color: 'дъб', sap: '111222', qty: 5, unit: 'кв.м' },
    { product: 'ЛАЙСНА', color: 'сребро', sap: '333444', qty: 2, unit: 'бр.' },
    { product: 'ПОДЛОЖКА', color: '', sap: '555666', qty: 12, unit: 'кв.м' }
  ]
});
/* o-old: стар запис без items → fallback към полетата на заявката */
const O_OLD = order({
  id: 'o-old', in_num: 'Троян-0002', items: null,
  product: 'МИВКА', color: 'бял', sap: '999000', qty: 1, unit: 'бр.'
});
/* o-full: всичко попълнено — ЦО, дълги текстове, платен транспорт, група */
const O_FULL = order({
  id: 'o-full', in_num: 'Троян-0003', status: 'processed',
  co_eta: dayOffset(10), co_note: LONG_NOTE,
  co_processed_at: tsOffset(-1), co_processed_by: 'Снабдяване ЦО',
  note: LONG_NOTE,
  paid_transport: true, transport_id: 't-77', group_id: 'g-1',
  items: [{ product: 'ВРАТА', color: 'венге', sap: '777888', qty: 1, unit: 'бр.' }]
});
/* o-xss: note със <script> */
const O_XSS = order({
  id: 'o-xss', in_num: 'Троян-0004', note: XSS_NOTE,
  items: [{ product: 'СТОЛ', color: '', sap: '1', qty: 1, unit: 'бр.' }]
});

const ORDERS = [O_MULTI, O_OLD, O_FULL, O_XSS];

function env(over) {
  over = over || {};
  const h = boot(Object.assign({}, over, {
    modules: ['transport.js', 'client-orders.js', 'kasa.js', 'kasa-docs.js',
              'history.js', 'notifications.js'],
    user: USER,
    data: Object.assign({
      client_orders: ORDERS, transport_orders: [], stores: [], users: [],
      order_restrictions: [], sap_catalog: [], kasa_reports: []
    }, over.data || {})
  }));
  h.w.transportOrders = [];
  h.w.clientOrders = JSON.parse(JSON.stringify(over.orders || ORDERS));
  h.w.clientOrders.forEach(o => {
    o._status = h.w.calcStatus(o.delivery, o.status);
    o._days = h.w.calcElapsed(o.created_at, o.date);
    o._isFulfiller = !h.w.isGlobal() &&
      o.fulfiller === h.w.currentUser.store_name &&
      o.store_name !== h.w.currentUser.store_name;
  });
  return h;
}

/* renderHistoryResults() връща веднага, ако #h-results липсва, и ако всички
   масиви са празни рисува „Няма записи". И двете минават безшумно, затова
   подготовката е в отделен помощник, който ПРОВЕРЯВА, че таблицата е излязла. */
function bootHistory(h, rows) {
  h.w.clientOrders = [];
  h.w.histFilter = { from: dayOffset(-30), to: dayOffset(1), store: '', type: 'all' };
  h.w.histData = { transport: [], client: rows, kasa: [], storno: [] };
  h.w.renderHistoryShell();
  ok('History shell е рендиран (#h-results съществува)',
    !!h.doc.getElementById('h-results'));
  h.w.renderHistoryResults();
  const tbl = h.doc.querySelector('#h-results table');
  ok('таблицата с клиентските заявки е рендирана', !!tbl);
  return tbl;
}

const modal = doc => doc.getElementById('cod-ov');
const modalText = doc => { const m = modal(doc); return m ? m.textContent : ''; };
function cells(doc, id) { return doc.getElementById('co-row-' + id).querySelectorAll('td'); }
function pressEsc(w) {
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

(async function run() {

  /* ══════════ 1. Кои клетки отварят модала ══════════ */
  section('1. Клик-целите в реда — Дата/Час, SAP и Продукт, и нищо друго');
  {
    const { w, doc } = env();
    if (guard('renderClientOrders() не хвърля', () => w.renderClientOrders())) {
      const td = cells(doc, 'o-multi');
      ok('редът има 13 клетки', td.length === 13, String(td.length));

      const opensDetail = i => /openClientOrderDetail/.test(td[i].getAttribute('onclick') || '');
      ok('клетка „Дата / Час" (1) отваря пълните данни', opensDetail(1));
      ok('клетка „SAP" (4) отваря пълните данни', opensDetail(4));
      ok('клетка „Продукт" (5) отваря пълните данни', opensDetail(5));

      ok('клетка „Клиент" (2) НЕ отваря пълните данни', !opensDetail(2));
      ok('клетка „Клиент" (2) пази своя openCustomerOrders',
        /openCustomerOrders/.test(td[2].innerHTML));
      ok('колоната с бутоните (12) НЕ отваря пълните данни', !opensDetail(12));
      ok('клетка „№" (0) НЕ отваря пълните данни', !opensDetail(0));
      ok('клетка „Телефон" (3) НЕ отваря пълните данни', !opensDetail(3));

      ok('кликаемите клетки са с cursor:pointer',
        /cursor:pointer/.test(td[1].getAttribute('style') || '') &&
        /cursor:pointer/.test(td[4].getAttribute('style') || '') &&
        /cursor:pointer/.test(td[5].getAttribute('style') || ''));
      ok('и с title „Отвори заявката"', td[5].getAttribute('title') === 'Отвори заявката');
      ok('SAP клетката пази вътрешния title с целия код',
        (td[4].querySelector('div') || {}).outerHTML &&
        /title="111222"/.test(td[4].innerHTML), td[4].innerHTML);
    }
  }
  {
    /* ИСТИНСКИ клик, не само инспекция на markup-а */
    const { w, doc } = env();
    w.renderClientOrders();
    ok('преди клика модал няма', !modal(doc));
    realClick(w, cells(doc, 'o-multi')[5], 'клетка Продукт');
    ok('клик по „Продукт" отваря модала', !!modal(doc));
    ok('модалът е отворен (class open)', !!modal(doc) && modal(doc).classList.contains('open'));
    ok('показва номера на заявката', modalText(doc).indexOf('Троян-0001') >= 0);
  }
  {
    const { w, doc } = env();
    w.renderClientOrders();
    realClick(w, cells(doc, 'o-multi')[1], 'клетка Дата');
    ok('клик по „Дата / Час" също отваря модала', !!modal(doc));
  }
  {
    const { w, doc } = env();
    w.renderClientOrders();
    realClick(w, cells(doc, 'o-multi')[4], 'клетка SAP');
    ok('клик по „SAP" също отваря модала', !!modal(doc));
  }
  {
    /* Клиентът отваря СВОЯ панел, не пълните данни */
    const { w, doc } = env();
    w.renderClientOrders();
    const b = cells(doc, 'o-multi')[2].querySelector('b[onclick]');
    if (ok('клетката „Клиент" има кликаем <b>', !!b)) {
      realClick(w, b, 'Клиент');
      ok('клик по „Клиент" НЕ отваря пълните данни', !modal(doc));
      ok('вместо това отваря панела на клиента', !!doc.getElementById('cust-ov'));
    }
  }

  /* ══════════ 2. Артикулите — целият списък ══════════ */
  section('2. Артикули — пълният списък, не само първият');
  {
    const { w, doc } = env();
    w.openClientOrderDetail('o-multi');
    const t = modalText(doc);
    ok('заглавието казва 3 артикула', t.indexOf('Артикули (3)') >= 0, t.slice(0, 400));
    ok('първият артикул е вътре', t.indexOf('ПАРКЕТ') >= 0);
    ok('ВТОРИЯТ артикул е вътре', t.indexOf('ЛАЙСНА') >= 0);
    ok('ТРЕТИЯТ артикул е вътре', t.indexOf('ПОДЛОЖКА') >= 0);
    ok('вторият SAP е вътре', t.indexOf('333444') >= 0);
    ok('третият SAP е вътре', t.indexOf('555666') >= 0);
    ok('количествата и мерните единици са показани',
      t.indexOf('2 бр.') >= 0 && t.indexOf('12 кв.м') >= 0, t);
    const rows = modal(doc).querySelectorAll('tbody tr');
    ok('таблицата има точно 3 реда', rows.length === 3, String(rows.length));
  }
  {
    /* items=null → fallback към полетата на самата заявка */
    const { w, doc } = env();
    w.openClientOrderDetail('o-old');
    const t = modalText(doc);
    ok('при items=null заглавието казва 1 артикул', t.indexOf('Артикули (1)') >= 0);
    ok('fallback показва продукта от заявката', t.indexOf('МИВКА') >= 0);
    ok('fallback показва SAP от заявката', t.indexOf('999000') >= 0);
    ok('fallback показва цвета от заявката', t.indexOf('бял') >= 0);
    ok('и казва, че записът е стар', t.indexOf('Стар запис без списък с артикули') >= 0);
    ok('таблицата има точно 1 ред',
      modal(doc).querySelectorAll('tbody tr').length === 1);
  }

  /* ══════════ 3. Дълги текстове — без отрязване ══════════ */
  section('3. co_note и note излизат ЦЕЛИ');
  {
    const { w, doc } = env();
    w.openClientOrderDetail('o-full');
    const t = modalText(doc);
    ok('co_note е точно 200 знака', LONG_NOTE.length === 200, String(LONG_NOTE.length));
    ok('co_note излиза ЦЯЛ, без отрязване', t.indexOf(LONG_NOTE) >= 0);
    ok('note излиза ЦЯЛ, без отрязване', t.indexOf(LONG_NOTE) >= 0);
    ok('никъде няма многоточие от рязане', t.indexOf('…') < 0 && t.indexOf('...') < 0, t);
    ok('секцията „От Централен офис" я има', t.indexOf('От Централен офис') >= 0);
    ok('показва кой е обработил', t.indexOf('Снабдяване ЦО') >= 0);
    ok('показва очакваната дата', t.indexOf('Очаквана дата') >= 0);
  }
  {
    /* Без данни от ЦО секцията изобщо не се показва */
    const { w, doc } = env();
    w.openClientOrderDetail('o-multi');
    ok('без данни от ЦО секцията НЕ се показва',
      modalText(doc).indexOf('От Централен офис') < 0);
  }
  {
    /* Останалите полета от групите */
    const { w, doc } = env();
    w.openClientOrderDetail('o-full');
    const t = modalText(doc);
    ok('показва бона', t.indexOf('000123') >= 0);
    ok('показва въвелия', t.indexOf('Мария Иванова') >= 0);
    ok('показва „Създадена" с дата и час', /Създадена/.test(t) && /\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}/.test(t), t);
    ok('телефонът е кликаем tel: линк',
      !!modal(doc).querySelector('a[href^="tel:"]'));
    ok('tel: href носи само цифри', (modal(doc).querySelector('a[href^="tel:"]') || {}).getAttribute &&
      /^tel:[\d+]+$/.test(modal(doc).querySelector('a[href^="tel:"]').getAttribute('href')),
      modal(doc).querySelector('a[href^="tel:"]') && modal(doc).querySelector('a[href^="tel:"]').getAttribute('href'));
    ok('платеният транспорт дава бутон към транспорта',
      /gotoLinkedTransport/.test(modal(doc).innerHTML));
    ok('group_id дава бутон към заявките на клиента',
      /openCustomerOrders/.test(modal(doc).innerHTML));
    ok('показва „Изминало" в дни', /Изминало/.test(t) && /\d+ дни/.test(t));
  }

  /* ══════════ 4. Затваряне ══════════ */
  section('4. Затваряне — бутон, ✕ и Escape');
  {
    const { w, doc } = env();
    w.openClientOrderDetail('o-multi');
    ok('модалът е отворен', !!modal(doc));
    realClick(w, btnExact(modal(doc), 'Затвори'), 'Затвори');
    ok('бутонът „Затвори" го затваря', !modal(doc));
  }
  {
    const { w, doc } = env();
    w.openClientOrderDetail('o-multi');
    realClick(w, btnExact(modal(doc), '✕'), '✕');
    ok('✕ го затваря', !modal(doc));
  }
  {
    const { w, doc } = env();
    w.openClientOrderDetail('o-multi');
    ok('модалът е отворен преди Escape', !!modal(doc));
    pressEsc(w);
    ok('Escape го затваря', !modal(doc));
  }
  {
    /* Слушателят за Escape трябва да се маха — иначе се трупа по един на
       отваряне и Escape започва да пипа модали, които вече ги няма. */
    const { w, doc } = env();
    w.openClientOrderDetail('o-multi');
    pressEsc(w);
    ok('след затваряне модал няма', !modal(doc));
    let broke = null;
    try { pressEsc(w); } catch (e) { broke = e.message; }
    ok('втори Escape при затворен модал не хвърля', !broke, broke);
    w.openClientOrderDetail('o-old');
    ok('модалът се отваря повторно', !!modal(doc));
    pressEsc(w);
    ok('и Escape пак го затваря', !modal(doc));
  }
  {
    /* Две последователни отваряния не оставят два overlay-а */
    const { w, doc } = env();
    w.openClientOrderDetail('o-multi');
    w.openClientOrderDetail('o-old');
    ok('има точно един overlay', doc.querySelectorAll('#cod-ov').length === 1,
      String(doc.querySelectorAll('#cod-ov').length));
    ok('и той е на втората заявка', modalText(doc).indexOf('Троян-0002') >= 0);
  }

  /* ══════════ 5. Escaping ══════════ */
  section('5. Escaping — note със <script> не се изпълнява');
  {
    const { w, doc } = env();
    w.openClientOrderDetail('o-xss');
    ok('няма <script> елемент в модала',
      modal(doc).querySelectorAll('script').length === 0);
    ok('скриптът НЕ се е изпълнил', typeof w.__pwned === 'undefined', String(w.__pwned));
    ok('текстът е избягнат, не е markup',
      modal(doc).innerHTML.indexOf('&lt;script&gt;') >= 0);
    ok('и се вижда като текст', modalText(doc).indexOf('<script>') >= 0);
    ok('съседният текст е запазен', modalText(doc).indexOf('Преди') >= 0 &&
      modalText(doc).indexOf('след') >= 0);
  }
  {
    /* Апостроф в име на клиент — класическият капан за inline onclick */
    const APO = order({ id: 'o-apo', in_num: 'Троян-0005',
      customer_name: "Д'Артанян О'Брайън",
      items: [{ product: 'МАСА', color: '', sap: '2', qty: 1, unit: 'бр.' }] });
    const { w, doc } = env({ orders: [APO], data: { client_orders: [APO] } });
    w.renderClientOrders();
    const td = cells(doc, 'o-apo')[5];
    let broke = null;
    try { w.eval('(function(){' + td.getAttribute('onclick') + '})'); }
    catch (e) { broke = e.message; }
    ok('onclick-ът е валиден JS при апостроф в името', !broke, broke);
    realClick(w, td, 'Продукт при апостроф');
    ok('и модалът се отваря', !!modal(doc));
    ok('името излиза цяло', modalText(doc).indexOf("Д'Артанян О'Брайън") >= 0);
  }

  /* ══════════ 6. Само за четене ══════════ */
  section('6. Модалът не записва нищо');
  {
    const { w, doc, calls } = env();
    const before = calls.post.length + calls.patch.length + calls.del.length;
    w.openClientOrderDetail('o-full');
    pressEsc(w);
    w.openClientOrderDetail('o-multi');
    realClick(w, btnExact(modal(doc), 'Затвори'), 'Затвори');
    await ticks();
    const after = calls.post.length + calls.patch.length + calls.del.length;
    ok('нула POST/PATCH/DELETE при отваряне и затваряне', after === before,
      'преди ' + before + ', след ' + after);
    ok('бутоните за действие остават в РЕДА, не в модала',
      !/submitCoProcessed|setClientStatus|deleteClientOrder/.test(
        (doc.getElementById('cod-ov') || { innerHTML: '' }).innerHTML));
  }

  /* ══════════ 7. История — СЪЩАТА функция, не копие ══════════ */
  section('7. История — същият клик върху клиентските заявки');
  {
    /* Редът съществува САМО в histData.client. Ако coFindOrder() търсеше само
       в clientOrders, модалът тук би казал „Заявката не е намерена" — точно
       това прави копието в history.js ненужно. */
    const HIST_ONLY = order({
      id: 'h-only', in_num: 'Троян-9001', customer_name: 'Само в История',
      items: [
        { product: 'ГАРДЕРОБ', color: 'бук', sap: '424242', qty: 1, unit: 'бр.' },
        { product: 'РАФТ', color: '', sap: '434343', qty: 4, unit: 'бр.' }
      ]
    });
    const h = env({ orders: [], data: { client_orders: [] } });
    const { w, doc, calls } = h;
    if (guard('подготовка на История', () => bootHistory(h, [HIST_ONLY]))) {
      const tds = doc.querySelectorAll('#h-results td[onclick*="openClientOrderDetail"]');
      ok('в История има кликаеми клетки към пълните данни', tds.length >= 2,
        String(tds.length));
      realClick(w, tds[0], 'клетка в История');
      ok('модалът се отваря и от История', !!modal(doc));
      ok('намира ред, който го НЯМА в clientOrders',
        modalText(doc).indexOf('Троян-9001') >= 0, modalText(doc).slice(0, 200));
      ok('показва и двата артикула', modalText(doc).indexOf('ГАРДЕРОБ') >= 0 &&
        modalText(doc).indexOf('РАФТ') >= 0);
      ok('не прави заявки към базата', calls.post.length === 0 && calls.patch.length === 0);
    }
  }
  {
    /* Клетката „Клиент" в История не бива да е станала кликаема */
    const h2 = env({ orders: [], data: { client_orders: [] } });
    const { doc } = h2;
    guard('подготовка на История за проверката на Клиент', () => bootHistory(h2, [O_MULTI]));
    const tds = [].slice.call(doc.querySelectorAll('#h-results td'));
    const custTd = tds.filter(td => td.textContent.indexOf('Иван Петров') >= 0)[0];
    if (ok('клетката „Клиент" в История е намерена', !!custTd)) {
      ok('и НЕ отваря модала',
        !/openClientOrderDetail/.test(custTd.getAttribute('onclick') || ''));
    }
  }

  report();
})();
