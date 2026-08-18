/* Интеграционен тест за статус "✅ Обработена от ЦО" и филтъра по изпълнител.
   Зарежда РЕАЛНИЯ index.html като DOM и shared.js + transport.js + client-orders.js +
   history.js + notifications.js в реалния ред от index.html, с ИСТИНСКИ кликове.

   Пускане от папката на репото:
     npm i -D jsdom
     node test-co-processed.js
*/
const fs = require('fs');
const { JSDOM } = require('jsdom');
const DIR = process.argv[2] ? process.argv[2].replace(/\/*$/, '/') : __dirname + '/../';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  →  ' + extra : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

/* Дати спрямо днес, за да не гният тестовете */
const d = n => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const daysAgoISO = n => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString(); };

const CO = 'Централен офис';

const ORDERS = [
  /* 1) Заявка към ЦО, още необработена, стара 9 дни -> трябва да алармира */
  { id: 'o-1', in_num: '0001', store_name: 'Троян', fulfiller: CO, status: 'pending',
    date: d(-9), hour: '10:00', customer_name: 'Иван Петров', phone: '0888111222',
    product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м',
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м' }],
    delivery: d(12), note: '', created_at: daysAgoISO(9), co_eta: null, co_note: null,
    paid_transport: false, transport_id: null },
  /* 2) Заявка към ЦО, обработена, доставчикът има срок напред -> НЕ алармира */
  { id: 'o-2', in_num: '0002', store_name: 'Монтана', fulfiller: CO, status: 'processed',
    date: d(-11), hour: '11:00', customer_name: 'Мария Георгиева', phone: '0888333444',
    product: 'МИВКА', sap: '222', qty: 1, unit: 'бр.',
    items: [{ product: 'МИВКА', sap: '222', qty: 1, unit: 'бр.' }],
    delivery: d(14), note: '', created_at: daysAgoISO(11),
    co_eta: d(10), co_note: 'ТЕСИ, поръчка 4500123', paid_transport: false, transport_id: null },
  /* 3) Заявка към ЦО, обработена, но очакваната дата е МИНАЛА -> пак алармира */
  { id: 'o-3', in_num: '0003', store_name: 'Добрич', fulfiller: CO, status: 'processed',
    date: d(-20), hour: '12:00', customer_name: 'Петър Иванов', phone: '0888555666',
    product: 'ВРАТА', sap: '333', qty: 1, unit: 'бр.',
    items: [{ product: 'ВРАТА', sap: '333', qty: 1, unit: 'бр.' }],
    delivery: d(5), note: '', created_at: daysAgoISO(20),
    co_eta: d(-3), co_note: '', paid_transport: false, transport_id: null },
  /* 4) Заявка към ДРУГ магазин (не ЦО) -> ЦО няма работа по нея */
  { id: 'o-4', in_num: '0004', store_name: 'Враца', fulfiller: 'Габрово', status: 'pending',
    date: d(-2), hour: '09:00', customer_name: 'Георги Тестов', phone: '0888777888',
    product: 'ЛАМПА', sap: '444', qty: 2, unit: 'бр.',
    items: [{ product: 'ЛАМПА', sap: '444', qty: 2, unit: 'бр.' }],
    delivery: d(6), note: '', created_at: daysAgoISO(2), co_eta: null, co_note: null,
    paid_transport: false, transport_id: null },
  /* 5) Стар запис с различно изписване на ЦО -> сравнението е без регистър */
  { id: 'o-5', in_num: '0005', store_name: 'Шумен', fulfiller: 'ЦЕНТРАЛЕН ОФИС', status: 'pending',
    date: d(-1), hour: '14:00', customer_name: 'Стоян Стоянов', phone: '0888999000',
    product: 'ПЛОЧКИ', sap: '555', qty: 10, unit: 'кв.м',
    items: [{ product: 'ПЛОЧКИ', sap: '555', qty: 10, unit: 'кв.м' }],
    delivery: d(9), note: '', created_at: daysAgoISO(1), co_eta: null, co_note: null,
    paid_transport: false, transport_id: null }
];

const CO_SUPPLY = { email: 'sn@temax.bg', display_name: 'Снабдяване ЦО', role: 'supply', store_name: CO };
const CO_ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin', store_name: CO };
const STORE_TROYAN = { email: 'troyan@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: 'Троян' };

function boot(opts) {
  opts = opts || {};
  const html = fs.readFileSync(DIR + 'index.html', 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.org/' });
  const w = dom.window;
  const calls = { get: [], post: [], patch: [], del: [], toast: [], confirm: [] };

  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = function () {};
  w.confirm = m => { calls.confirm.push(m); return true; };
  w.alert = () => {};
  w.fetch = function (url, init) {
    init = init || {};
    const method = init.method || 'GET';
    if (method === 'GET') {
      calls.get.push(url);
      let body = [];
      if (/\/client_orders/.test(url)) body = JSON.parse(JSON.stringify(w.__co || ORDERS));
      else if (/\/transport_orders/.test(url)) body = [];
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve('') });
    }
    const failThis = !!opts.failPatch && method === 'PATCH';
    if (method === 'POST') calls.post.push({ url, body: JSON.parse(init.body) });
    if (method === 'PATCH') calls.patch.push({ url, body: JSON.parse(init.body) });
    if (method === 'DELETE') calls.del.push(url);
    return Promise.resolve({ ok: !failThis, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
  };

  const load = f => w.eval(fs.readFileSync(DIR + f, 'utf8'));
  load('shared.js'); load('transport.js'); load('client-orders.js');
  load('history.js'); load('notifications.js');
  ['loadDocs', 'loadBulletin', 'loadKasa', 'loadAdmin', 'loadContacts', 'loadTransit', 'loadCalendar',
   'loadStockReturns', 'loadStockDiff', 'loadPallets', 'loadReference', 'loadTodayDashboard', 'loadHandbook']
    .forEach(fn => { if (typeof w[fn] !== 'function') w[fn] = () => {}; });

  w.currentUser = opts.user || CO_SUPPLY;
  w.transportOrders = [];
  w.clientOrders = JSON.parse(JSON.stringify(opts.co || ORDERS));
  w.clientOrders.forEach(o => {
    o._status = w.calcStatus(o.delivery, o.status);
    o._days = w.calcElapsed(o.created_at);
    o._isFulfiller = !w.isGlobal() && o.fulfiller === w.currentUser.store_name && o.store_name !== w.currentUser.store_name;
  });
  const origToast = w.toast;
  w.toast = (m, c) => { calls.toast.push(m); try { origToast(m, c); } catch (e) {} };
  return { w, calls, doc: w.document };
}

function realClick(w, el) {
  if (!el) throw new Error('елементът не съществува');
  const code = el.getAttribute('onclick');
  if (!code) throw new Error('няма onclick: ' + el.outerHTML.slice(0, 140));
  w.eval('(function(el){ (function(){' + code + '}).call(el); })')(el);
}
/* Само реални контроли (бутони/баджове), не съдържащи ги контейнери — иначе
   обвиващият <div> "съдържа" текста на всеки бутон в реда и тестът лъже. */
function btnIn(root, text) {
  return Array.from(root.querySelectorAll('button, span')).find(b => (b.textContent || '').indexOf(text) >= 0);
}
function exactBtn(root, text) {
  return Array.from(root.querySelectorAll('button')).find(b => (b.textContent || '').trim() === text);
}
/* САМО бутони — баджът на статуса също съдържа "✅ Обработена от ЦО" като <span>,
   така че проверката "няма такъв бутон" трябва да гледа само <button>. */
function btnOnly(root, text) {
  return Array.from(root.querySelectorAll('button')).find(b => (b.textContent || '').indexOf(text) >= 0);
}
const row = (doc, id) => doc.getElementById('co-row-' + id);
const tick = () => new Promise(r => setTimeout(r, 0));

(async function run() {

  /* ══════════ 1. Новият статус е познат на системата ══════════ */
  section('1. Статусът "Обработена от ЦО"');
  {
    const { w } = boot();
    ok('calcStatus го пропуска, не го превръща в "просрочена"', w.calcStatus(d(-30), 'processed') === 'processed');
    ok('statusBadge има етикет на български', w.statusBadge('processed').indexOf('Обработена от ЦО') >= 0);
    ok('НЕ се бърка с "Изпратена"', w.statusBadge('processed').indexOf('Изпратена') < 0);
    ok('statusLabel дава чист текст за печат', w.statusLabel('processed') === 'Обработена от ЦО');
    ok('statusLabel покрива и старите статуси', w.statusLabel('done') === 'Изпълнена' && w.statusLabel('pending') === 'Изчаква');
  }

  /* ══════════ 2. Разпознаване на Централен офис ══════════ */
  section('2. Разпознаване на Централен офис');
  {
    const { w } = boot();
    ok('точно изписване', w.isCentralOffice('Централен офис') === true);
    ok('различен регистър (стари записи)', w.isCentralOffice('ЦЕНТРАЛЕН ОФИС') === true);
    ok('с интервали', w.isCentralOffice('  Централен офис ') === true);
    ok('магазин не е ЦО', w.isCentralOffice('Троян') === false);
    ok('празно не е ЦО', w.isCentralOffice('') === false && w.isCentralOffice(null) === false);
    ok('потребител от ЦО се разпознава', w.isCentralOfficeUser() === true);
    const b2 = boot({ user: STORE_TROYAN });
    ok('потребител от магазин не се разпознава като ЦО', b2.w.isCentralOfficeUser() === false);
  }

  /* ══════════ 3. Кой вижда бутона ══════════ */
  section('3. Бутонът "✅ Обработена от ЦО" — кой го вижда');
  {
    const { w, doc } = boot({ user: CO_SUPPLY });
    w.renderClientOrders();
    ok('ЦО вижда бутона за заявка към ЦО', !!btnIn(row(doc, 'o-1'), '✅ Обработена от ЦО'));
    ok('ЦО НЕ вижда бутона за чужда заявка (към Габрово)', !btnIn(row(doc, 'o-4'), '✅ Обработена от ЦО'));
    ok('работи и при старо изписване "ЦЕНТРАЛЕН ОФИС"', !!btnIn(row(doc, 'o-5'), '✅ Обработена от ЦО'));
    ok('на вече обработена заявка бутонът става "✏️ Дата от ЦО"',
      !!btnOnly(row(doc, 'o-2'), '✏️ Дата от ЦО') && !btnOnly(row(doc, 'o-2'), '✅ Обработена от ЦО'));
    ok('ЦО вижда "📤 Изпратена" и СЛЕД обработка', !!btnIn(row(doc, 'o-2'), '📤 Изпратена'));
  }
  {
    const { w, doc } = boot({ user: STORE_TROYAN });
    w.renderClientOrders();
    ok('магазинът-заявител НЕ вижда бутона', !btnIn(row(doc, 'o-1'), 'Обработена от ЦО'));
    ok('но си вижда бутона "Статус"', !!btnIn(row(doc, 'o-1'), 'Статус'));
  }
  {
    const { w, doc } = boot({ user: CO_ADMIN });
    w.renderClientOrders();
    ok('admin от ЦО също вижда бутона (не само роля supply)', !!btnIn(row(doc, 'o-1'), '✅ Обработена от ЦО'));
  }

  /* ══════════ 4. Модалът и записът ══════════ */
  section('4. Модал "Обработена от ЦО" — истински клик и запис');
  {
    const { w, doc, calls } = boot();
    w.renderClientOrders();
    realClick(w, btnIn(row(doc, 'o-1'), '✅ Обработена от ЦО'));
    const ov = doc.getElementById('cop-ov');
    ok('модалът се отваря', !!ov);
    ok('показва номера и магазина', ov.textContent.indexOf('№0001') >= 0 && ov.textContent.indexOf('Троян') >= 0);
    ok('показва артикулите', ov.textContent.indexOf('ПАРКЕТ') >= 0);
    ok('има поле за очаквана дата', !!doc.getElementById('cop-eta'));
    ok('има поле за коментар', !!doc.getElementById('cop-note'));
    ok('обяснява, че няма да алармира', ov.textContent.indexOf('няма да се брои за закъсняла') >= 0);

    doc.getElementById('cop-eta').value = d(15);
    doc.getElementById('cop-note').value = 'ТЕСИ, поръчка 4500999';
    realClick(w, doc.getElementById('cop-submit'));
    await tick(); await tick();

    const p = calls.patch.find(x => /client_orders/.test(x.url));
    ok('прави PATCH към client_orders', !!p);
    ok('статусът е processed', p && p.body.status === 'processed');
    ok('записва очакваната дата', p && p.body.co_eta === d(15));
    ok('записва коментара', p && p.body.co_note === 'ТЕСИ, поръчка 4500999');
    ok('записва кой е обработил', p && p.body.co_processed_by === 'Снабдяване ЦО');
    ok('записва кога', p && !!p.body.co_processed_at);
    ok('URL сочи правилната заявка', p && /id=eq\.o-1/.test(p.url));
    ok('модалът се затваря', !doc.getElementById('cop-ov'));
    ok('съобщението показва датата', calls.toast.some(t => /Обработена от ЦО/.test(t)));
  }
  {
    /* без дата — пак се записва, датата просто е null */
    const { w, doc, calls } = boot();
    w.renderClientOrders();
    realClick(w, btnIn(row(doc, 'o-1'), '✅ Обработена от ЦО'));
    realClick(w, doc.getElementById('cop-submit'));
    await tick(); await tick();
    const p = calls.patch.find(x => /client_orders/.test(x.url));
    ok('без дата статусът пак се записва', p && p.body.status === 'processed');
    ok('датата е null, не празен низ', p && p.body.co_eta === null);
  }
  {
    /* редакция на вече обработена заявка — полетата са предварително попълнени */
    const { w, doc } = boot();
    w.renderClientOrders();
    realClick(w, btnIn(row(doc, 'o-2'), '✏️ Дата от ЦО'));
    ok('датата е предварително попълнена', doc.getElementById('cop-eta').value === d(10));
    ok('коментарът е предварително попълнен', doc.getElementById('cop-note').value === 'ТЕСИ, поръчка 4500123');
  }
  {
    /* провален запис — не се затваря тихо */
    const { w, doc, calls } = boot({ failPatch: true });
    w.renderClientOrders();
    realClick(w, btnIn(row(doc, 'o-1'), '✅ Обработена от ЦО'));
    realClick(w, doc.getElementById('cop-submit'));
    await tick(); await tick();
    ok('при грешка модалът ОСТАВА отворен', !!doc.getElementById('cop-ov'));
    ok('при грешка има съобщение', calls.toast.some(t => /Грешка/.test(t)));
    ok('бутонът се отключва за нов опит', doc.getElementById('cop-submit').disabled === false);
  }

  /* ══════════ 5. Защита: чужд потребител / чужда заявка ══════════ */
  section('5. Защита срещу маркиране от грешен човек');
  {
    const { w, doc, calls } = boot({ user: STORE_TROYAN });
    w.openCoProcessedModal('o-1');
    ok('магазин не може да отвори модала', !doc.getElementById('cop-ov'));
    ok('получава ясно съобщение', calls.toast.some(t => /Само Централен офис/.test(t)), JSON.stringify(calls.toast));
  }
  {
    const { w, doc, calls } = boot({ user: CO_SUPPLY });
    w.openCoProcessedModal('o-4');
    ok('ЦО не може да обработи заявка към друг магазин', !doc.getElementById('cop-ov'));
    ok('получава ясно съобщение', calls.toast.some(t => /не е насочена към Централен офис/.test(t)));
  }

  /* ══════════ 6. Броячът "Изминало" не алармира без причина ══════════ */
  section('6. Броячът "Изминало" изчаква доставчика');
  {
    const { w, doc } = boot();
    w.renderClientOrders();
    const r1 = row(doc, 'o-1'), r2 = row(doc, 'o-2'), r3 = row(doc, 'o-3');
    ok('необработена заявка на 9 дни е оранжева', r1.innerHTML.indexOf('🔶') >= 0 || r1.innerHTML.indexOf('9 дни') >= 0);
    ok('обработена + бъдеща дата показва 🏭, не червено',
      r2.innerHTML.indexOf('🏭 до') >= 0 && r2.innerHTML.indexOf('🔴') < 0);
    ok('обработена + бъдеща дата НЕ пулсира', !/rowPulse/.test(r2.innerHTML));
    ok('обработена + МИНАЛА дата пак алармира (20 дни)', r3.innerHTML.indexOf('🔴') >= 0);
    ok('coWaitingSupplier: бъдеща дата → true', w.coWaitingSupplier(w.clientOrders.find(o => o.id === 'o-2')) === true);
    ok('coWaitingSupplier: минала дата → false', w.coWaitingSupplier(w.clientOrders.find(o => o.id === 'o-3')) === false);
    ok('coWaitingSupplier: без дата → false',
      w.coWaitingSupplier({ status: 'processed', co_eta: null }) === false);
    ok('coWaitingSupplier: друг статус → false',
      w.coWaitingSupplier({ status: 'pending', co_eta: d(10) }) === false);
  }

  /* ══════════ 7. Банерът при вход ══════════ */
  section('7. Банерът при вход не вика фалшива тревога');
  {
    const { w, doc } = boot();
    w.showLoginBanner();
    const txt = (doc.getElementById('notif-banner') || {}).textContent || '';
    /* o-1 (9 дни, необработена) и o-3 (20 дни, просрочена дата) трябва да влязат;
       o-2 (11 дни, обработена с бъдеща дата) — не. */
    ok('банерът брои 2 заявки, не 3', /2 просрочени заявки/.test(txt), txt.slice(0, 160));
  }
  {
    const co = JSON.parse(JSON.stringify(ORDERS)).filter(o => o.id === 'o-2');
    const { w, doc } = boot({ co });
    w.showLoginBanner();
    const txt = (doc.getElementById('notif-banner') || {}).textContent || '';
    ok('само обработена заявка → никаква тревога', !/\d+ просрочен/.test(txt), txt.slice(0, 160));
    ok('вместо това показва "Всичко е наред"', /Всичко е наред/.test(txt), txt.slice(0, 160));
  }

  /* ══════════ 8. Ориентировъчната дата се вижда ══════════ */
  section('8. Ориентировъчната дата в таблицата');
  {
    const { w, doc } = boot();
    w.renderClientOrders();
    ok('датата от ЦО се показва под датата за доставка', row(doc, 'o-2').innerHTML.indexOf('🏭 очаквана') >= 0);
    ok('коментарът от ЦО също се вижда', row(doc, 'o-2').textContent.indexOf('ТЕСИ') >= 0);
    ok('просрочена очаквана дата е отбелязана отделно', row(doc, 'o-3').innerHTML.indexOf('🏭 просрочена от') >= 0);
    ok('заявка без дата от ЦО не показва нищо излишно', row(doc, 'o-1').innerHTML.indexOf('🏭') < 0);
  }

  /* ══════════ 9. Филтърът "Изпълнява" ══════════ */
  section('9. Падащо меню "Изпълнява"');
  {
    const { w, doc } = boot();
    w.coBuildFulfillerOptions();
    const sel = doc.getElementById('co-fulfiller-filter');
    ok('менюто съществува в index.html', !!sel);
    const opts = Array.from(sel.options).map(o => o.value);
    const labels = Array.from(sel.options).map(o => o.textContent);
    ok('първа опция е "всички"', opts[0] === '');
    ok('Централен офис е най-отгоре след "всички"', opts[1] === CO.toLowerCase(), JSON.stringify(opts));
    ok('съдържа и останалите изпълнители', opts.indexOf('габрово') > 0);
    ok('НЯМА дублирана опция за същия обект с главни букви', opts.length === 3, JSON.stringify(opts));
    ok('показва четливото изписване, не ALL CAPS', labels[1].indexOf('Централен офис') >= 0, JSON.stringify(labels));
    ok('показва и брой заявки', /\(\d+\)/.test(labels[1]), labels[1]);

    sel.value = CO.toLowerCase();
    w.renderClientOrders();
    ok('филтрира само заявките към ЦО', !!row(doc, 'o-1') && !!row(doc, 'o-2') && !row(doc, 'o-4'));
    ok('хваща и старото изписване "ЦЕНТРАЛЕН ОФИС"', !!row(doc, 'o-5'));

    sel.value = '';
    w.renderClientOrders();
    ok('без филтър се виждат всички', !!row(doc, 'o-1') && !!row(doc, 'o-4') && !!row(doc, 'o-5'));
  }
  {
    /* филтърът работи заедно с търсачката и месеца, не вместо тях */
    const { w, doc } = boot();
    w.coBuildFulfillerOptions();
    doc.getElementById('co-fulfiller-filter').value = CO.toLowerCase();
    doc.getElementById('co-search').value = 'мивка';
    w.renderClientOrders();
    ok('филтър + търсене работят заедно', !!row(doc, 'o-2') && !row(doc, 'o-1'));
  }

  /* ══════════ 10. Бутон-филтър по статус ══════════ */
  section('10. Филтър по статус "Обработена от ЦО"');
  {
    const { w, doc } = boot();
    const btn = Array.from(doc.querySelectorAll('#co-filters .filter-btn'))
      .find(b => b.textContent.indexOf('Обработена от ЦО') >= 0);
    ok('бутонът съществува', !!btn);
    realClick(w, btn);
    ok('показва само обработените', !!row(doc, 'o-2') && !!row(doc, 'o-3') && !row(doc, 'o-1'));
    ok('бутонът е активен', btn.classList.contains('active'));
    const sentBtn = Array.from(doc.querySelectorAll('#co-filters .filter-btn'))
      .find(b => b.textContent.indexOf('📤 Изпратена') >= 0);
    ok('добавен е и филтър "Изпратена" (липсваше досега)', !!sentBtn);
  }

  /* ══════════ 11. Модалът "Статус" ══════════ */
  section('11. Бутонът в модала "Статус"');
  {
    const { w, doc } = boot({ user: CO_SUPPLY });
    w.openStatus('o-1', 'client_orders');
    const b = doc.getElementById('status-btn-processed');
    ok('бутонът съществува', !!b);
    ok('вижда се за ЦО + заявка към ЦО', b.style.display !== 'none');
    realClick(w, b);
    ok('отваря модала на ЦО', !!doc.getElementById('cop-ov'));
    ok('модалът "Статус" се затваря', !doc.getElementById('status-modal').classList.contains('open'));
    ok('отваря правилната заявка', doc.getElementById('cop-ov').textContent.indexOf('№0001') >= 0);
  }
  {
    const { w, doc } = boot({ user: STORE_TROYAN });
    w.openStatus('o-1', 'client_orders');
    ok('скрит е за магазин', doc.getElementById('status-btn-processed').style.display === 'none');
  }
  {
    const { w, doc } = boot({ user: CO_SUPPLY });
    w.openStatus('o-4', 'client_orders');
    ok('скрит е за заявка към друг магазин', doc.getElementById('status-btn-processed').style.display === 'none');
  }
  {
    const { w, doc } = boot({ user: CO_SUPPLY });
    w.transportOrders = [{ id: 't-1', store_name: 'Троян', customer_name: 'X', delivery: d(1), status: 'pending' }];
    w.openStatus('t-1', 'transport_orders');
    ok('скрит е за транспортни заявки', doc.getElementById('status-btn-processed').style.display === 'none');
  }

  /* ══════════ 12. Връщане назад ══════════ */
  section('12. "↩ Върни" от "Обработена от ЦО"');
  {
    const { w, calls } = boot();
    w.revertStatus('o-2', 'client_orders');
    await tick(); await tick();
    const p = calls.patch.find(x => /client_orders/.test(x.url));
    ok('връща се в "Изчаква"', p && p.body.status === 'pending');
    ok('изчиства очакваната дата', p && p.body.co_eta === null);
    ok('изчиства коментара', p && p.body.co_note === null);
  }
  {
    const { w, calls } = boot();
    w.revertStatus('o-1', 'client_orders');
    await tick(); await tick();
    const p = calls.patch.find(x => /client_orders/.test(x.url));
    ok('при необработена заявка НЕ пипа полетата на ЦО',
      p && !('co_eta' in p.body) && !('co_note' in p.body));
  }

  /* ══════════ 13. История и печат ══════════ */
  section('13. История и печатна справка');
  {
    const { w, doc } = boot();
    w.histData = { transport: [], client: JSON.parse(JSON.stringify(ORDERS)), kasa: [], storno: [], pallets: [], returns: [], diffs: [], transit: [] };
    w.renderHistoryShell();
    let html = '';
    try { w.renderHistoryResults(); html = doc.getElementById('h-results').innerHTML; } catch (e) { html = 'ГРЕШКА: ' + e.message; }
    ok('История показва статуса на български', html.indexOf('Обработена от ЦО') >= 0, html.slice(0, 120));
    ok('История показва датата от ЦО', html.indexOf('🏭 ЦО:') >= 0);
    ok('История показва коментара от ЦО', html.indexOf('ТЕСИ') >= 0);
  }
  {
    const { w } = boot();
    ok('печатната справка вече не дава суров английски статус',
      w.statusLabel('processed') !== 'processed' && w.statusLabel('pending') !== 'pending');
  }

  /* ══════════ 14. Регресия ══════════ */
  section('14. Регресия — старият поток остава непокътнат');
  {
    const { w, doc, calls } = boot({ user: STORE_TROYAN });
    const co = JSON.parse(JSON.stringify(ORDERS));
    co[0].status = 'sent';
    const b = boot({ user: STORE_TROYAN, co });
    b.w.renderClientOrders();
    ok('заявителят вижда "📦 Пристигнала" при статус "Изпратена"', !!btnIn(row(b.doc, 'o-1'), '📦 Пристигнала'));
    realClick(b.w, btnIn(row(b.doc, 'o-1'), '📦 Пристигнала'));
    await tick(); await tick();
    ok('клик по "Пристигнала" праща PATCH',
      b.calls.patch.some(p => /client_orders/.test(p.url) && p.body.status === 'arrived'));

    w.renderClientOrders();
    ok('бутонът 🖨 Бланка е запазен', !!btnIn(row(doc, 'o-1'), '🖨 Бланка'));
    ok('бутонът 🚚 Платен транспорт е запазен', !!btnIn(row(doc, 'o-1'), '🚚 Платен транспорт'));
    ok('статусът "Изчаква" още се показва нормално', row(doc, 'o-1').innerHTML.indexOf('Изчаква') >= 0);
  }
  {
    const { w, doc } = boot({ user: CO_SUPPLY });
    w.openClientModal();
    ok('модалът за нова заявка още се отваря', doc.getElementById('client-modal').classList.contains('open'));
    realClick(w, exactBtn(doc.getElementById('client-modal'), 'Откажи'));
    ok('и се затваря с истински клик', !doc.getElementById('client-modal').classList.contains('open'));
  }

  console.log('\n─────────────────────────────');
  console.log(pass + ' успешни, ' + fail + ' неуспешни');
  process.exit(fail ? 1 : 0);
})();
