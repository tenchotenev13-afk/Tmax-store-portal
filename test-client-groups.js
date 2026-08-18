/* Интеграционен тест за свързани заявки на един клиент (client_orders.group_id).
   Зарежда РЕАЛНИЯ index.html и shared.js + transport.js + client-orders.js +
   history.js + notifications.js в реалния ред, с ИСТИНСКИ кликове.

   Пускане от папката на репото:
     npm i -D jsdom
     node test-client-groups.js
*/
const fs = require('fs');
const { JSDOM } = require('jsdom');
const DIR = process.argv[2] ? process.argv[2].replace(/\/*$/, '/') : __dirname + '/';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  →  ' + extra : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

const d = n => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const ago = n => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString(); };
const G1 = '11111111-1111-4111-8111-111111111111';

const ORDERS = [
  /* Обща поръчка на Панка: 3 заявки от Карлово към 3 различни изпълнителя */
  { id: 'g-1', in_num: '0101', store_name: 'Карлово', fulfiller: 'Петрич', status: 'arrived',
    date: d(-3), hour: '10:00', customer_name: 'Панка Кръшкова', phone: '0893 68 44 44',
    product: 'ПЛОЧКИ', sap: '111', qty: 4, unit: 'кв.м',
    items: [{ product: 'ПЛОЧКИ', sap: '111', qty: 4, unit: 'кв.м' }],
    delivery: d(4), created_at: ago(3), group_id: G1, note: '' },
  { id: 'g-2', in_num: '0102', store_name: 'Карлово', fulfiller: 'Раднево', status: 'pending',
    date: d(-3), hour: '10:00', customer_name: 'Панка Кръшкова', phone: '0893684444',
    product: 'ФУГА', sap: '222', qty: 2, unit: 'бр.',
    items: [{ product: 'ФУГА', sap: '222', qty: 2, unit: 'бр.' }],
    delivery: d(6), created_at: ago(3), group_id: G1, note: '' },
  { id: 'g-3', in_num: '0103', store_name: 'Карлово', fulfiller: 'Троян', status: 'sent',
    date: d(-3), hour: '10:00', customer_name: 'Панка Кръшкова', phone: '+359893684444',
    product: 'ЛЕПИЛО', sap: '333', qty: 3, unit: 'бр.',
    items: [{ product: 'ЛЕПИЛО', sap: '333', qty: 3, unit: 'бр.' }],
    delivery: d(5), created_at: ago(3), group_id: G1, note: '' },
  /* Несвързана заявка на СЪЩИЯ телефон — кандидат за свързване */
  { id: 'c-1', in_num: '0104', store_name: 'Карлово', fulfiller: 'Шумен', status: 'pending',
    date: d(-1), hour: '11:00', customer_name: 'Панка Кръшкова', phone: '0893-684-444',
    product: 'ЛАЙСНА', sap: '444', qty: 1, unit: 'бр.',
    items: [{ product: 'ЛАЙСНА', sap: '444', qty: 1, unit: 'бр.' }],
    delivery: d(8), created_at: ago(1), group_id: null, note: '' },
  /* Самостоятелна заявка, друг клиент */
  { id: 's-1', in_num: '0105', store_name: 'Враца', fulfiller: 'Габрово', status: 'pending',
    date: d(-1), hour: '12:00', customer_name: 'Иван Петров', phone: '0888123456',
    product: 'ВРАТА', sap: '555', qty: 1, unit: 'бр.',
    items: [{ product: 'ВРАТА', sap: '555', qty: 1, unit: 'бр.' }],
    delivery: d(7), created_at: ago(1), group_id: null, note: '' },
  /* ПРИКЛЮЧЕНА заявка на телефона на Панка — НЕ бива да се предлага за свързване */
  { id: 'x-1', in_num: '0099', store_name: 'Карлово', fulfiller: 'Троян', status: 'done',
    date: d(-40), hour: '09:00', customer_name: 'Панка Кръшкова', phone: '0893684444',
    product: 'СТАРА ПОРЪЧКА', sap: '999', qty: 1, unit: 'бр.',
    items: [{ product: 'СТАРА ПОРЪЧКА', sap: '999', qty: 1, unit: 'бр.' }],
    delivery: d(-35), created_at: ago(40), group_id: null, note: '' }
];

const KARLOVO = { email: 'karlovo@temax.bg', display_name: 'Управител Карлово', role: 'manager', store_name: 'Карлово' };

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
      else if (/\/stores/.test(url)) body = [{ name: 'Карлово' }];
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
  w.currentUser = opts.user || KARLOVO;
  w.transportOrders = [];
  w.clientOrders = JSON.parse(JSON.stringify(opts.co || ORDERS));
  w.clientOrders.forEach(o => {
    o._status = w.calcStatus(o.delivery, o.status);
    o._days = w.calcElapsed(o.created_at);
    o._isFulfiller = false;
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
function btnOnly(root, text) {
  return Array.from(root.querySelectorAll('button')).find(b => (b.textContent || '').indexOf(text) >= 0);
}
function anyWith(root, text) {
  return Array.from(root.querySelectorAll('button, span, b')).find(b => (b.textContent || '').indexOf(text) >= 0);
}
const row = (doc, id) => doc.getElementById('co-row-' + id);
const tick = () => new Promise(r => setTimeout(r, 0));

(async function run() {

  /* ══════════ 1. Нормализация на телефона ══════════ */
  section('1. Разпознаване на един и същ телефон');
  {
    const { w } = boot();
    ok('интервали се игнорират', w.normPhone('0893 68 44 44') === '0893684444');
    ok('тирета се игнорират', w.normPhone('0893-684-444') === '0893684444');
    ok('+359 се свежда до 0', w.normPhone('+359893684444') === '0893684444');
    ok('359 без плюс също', w.normPhone('359893684444') === '0893684444');
    ok('и трите форми съвпадат',
      w.normPhone('0893 68 44 44') === w.normPhone('+359893684444') &&
      w.normPhone('0893-684-444') === w.normPhone('0893684444'));
    ok('празно дава празно', w.normPhone('') === '' && w.normPhone(null) === '');
  }

  /* ══════════ 2. Групата се брои правилно ══════════ */
  section('2. Групата и позицията в нея');
  {
    const { w } = boot();
    const g1 = w.clientOrders.find(o => o.id === 'g-1');
    const s1 = w.clientOrders.find(o => o.id === 's-1');
    ok('групата има 3 заявки', w.coGroupMembers(g1).length === 3);
    ok('позицията е по номер на заявката', w.coGroupPos(g1) === 1 && w.coGroupPos(w.clientOrders.find(o => o.id === 'g-3')) === 3);
    ok('заявка без група е "сама"', w.coGroupMembers(s1).length === 1);
    ok('приключена заявка не се брои за отворена', w.coIsOpen(w.clientOrders.find(o => o.id === 'x-1')) === false);
    ok('незавършена се брои за отворена', w.coIsOpen(g1) === true);
  }

  /* ══════════ 3. Предложения по телефон ══════════ */
  section('3. Кандидати за свързване (по телефон)');
  {
    const { w } = boot();
    const c1 = w.clientOrders.find(o => o.id === 'c-1');
    const cand = w.coSameCustomerCandidates(c1);
    ok('намира 3-те заявки от групата въпреки различния формат на телефона', cand.length === 3, JSON.stringify(cand.map(x => x.in_num)));
    ok('НЕ включва приключената стара заявка', !cand.some(x => x.id === 'x-1'));
    ok('НЕ включва себе си', !cand.some(x => x.id === 'c-1'));

    const g1 = w.clientOrders.find(o => o.id === 'g-1');
    const cand2 = w.coSameCustomerCandidates(g1);
    ok('за заявка в група се предлага само тази извън групата', cand2.length === 1 && cand2[0].id === 'c-1');

    const s1 = w.clientOrders.find(o => o.id === 's-1');
    ok('самостоятелен клиент няма кандидати', w.coSameCustomerCandidates(s1).length === 0);
  }

  /* ══════════ 4. Баджът на реда ══════════ */
  section('4. Баджът до името на клиента');
  {
    const { w, doc } = boot();
    w.renderClientOrders();
    ok('заявка в група показва "👥 1 от 3"', row(doc, 'g-1').innerHTML.indexOf('👥 1 от 3') >= 0);
    ok('трета заявка показва "👥 3 от 3"', row(doc, 'g-3').innerHTML.indexOf('👥 3 от 3') >= 0);
    ok('несвързана заявка със същия телефон показва намек', row(doc, 'c-1').innerHTML.indexOf('👥 още') >= 0);
    ok('самостоятелна заявка няма бадж', row(doc, 's-1').innerHTML.indexOf('👥') < 0);
    ok('името на клиента е кликаемо', !!row(doc, 'g-1').querySelector('b[onclick*="openCustomerOrders"]'));
    ok('приключена стара заявка не носи намек', row(doc, 'x-1').innerHTML.indexOf('👥') < 0);
  }

  /* ══════════ 5. Панелът "Заявки на клиента" ══════════ */
  section('5. Панел "Заявки на клиента"');
  {
    const { w, doc } = boot();
    w.renderClientOrders();
    realClick(w, row(doc, 'g-1').querySelector('b[onclick*="openCustomerOrders"]'));
    const ov = doc.getElementById('cust-ov');
    ok('панелът се отваря', !!ov);
    ok('показва името и телефона', ov.textContent.indexOf('Панка Кръшкова') >= 0);
    ok('изброява и трите заявки от групата',
      ov.textContent.indexOf('№0101') >= 0 && ov.textContent.indexOf('№0102') >= 0 && ov.textContent.indexOf('№0103') >= 0);
    ok('показва изпълнителите', ov.textContent.indexOf('Петрич') >= 0 && ov.textContent.indexOf('Раднево') >= 0);
    ok('казва колко още не са готови', /не са готови/.test(ov.textContent));
    ok('показва несвързаната заявка отделно', ov.textContent.indexOf('№0104') >= 0);
    ok('предупреждава да се проверят имената', /Провери имената/.test(ov.textContent));
    ok('има бутон за свързване', !!btnOnly(ov, '🔗 Свържи ги'));
    ok('има бутон за още една заявка', !!btnOnly(ov, '➕ Още една заявка'));
  }
  {
    const { w, doc } = boot();
    w.renderClientOrders();
    realClick(w, row(doc, 's-1').querySelector('b[onclick*="openCustomerOrders"]'));
    const ov = doc.getElementById('cust-ov');
    ok('за самостоятелен клиент няма бутон за свързване', !btnOnly(ov, '🔗 Свържи ги'));
    ok('но пак може да се добави още една заявка', !!btnOnly(ov, '➕ Още една заявка'));
  }

  /* ══════════ 6. Свързване ══════════ */
  section('6. Свързване на заявки');
  {
    const { w, doc, calls } = boot();
    w.renderClientOrders();
    realClick(w, row(doc, 'c-1').querySelector('b[onclick*="openCustomerOrders"]'));
    realClick(w, btnOnly(doc.getElementById('cust-ov'), '🔗 Свържи ги'));
    await tick(); await tick();
    const p = calls.patch.find(x => /client_orders/.test(x.url));
    ok('прави един PATCH за всички заявки', !!p);
    ok('ползва съществуващата група, не създава нова', p && p.body.group_id === G1);
    ok('URL включва всички 4 заявки', p && (p.url.match(/g-1|g-2|g-3|c-1/g) || []).length === 4, p && p.url);
    ok('панелът се затваря', !doc.getElementById('cust-ov'));
    ok('има потвърждение', calls.toast.some(t => /свързани/.test(t)));
  }
  {
    /* две несвързани заявки на един телефон → създава се НОВА група */
    const co = JSON.parse(JSON.stringify(ORDERS)).filter(o => ['c-1', 's-1'].indexOf(o.id) >= 0);
    co.push(Object.assign({}, co[0], { id: 'c-2', in_num: '0106', group_id: null }));
    const { w, doc, calls } = boot({ co });
    w.renderClientOrders();
    realClick(w, row(doc, 'c-1').querySelector('b[onclick*="openCustomerOrders"]'));
    realClick(w, btnOnly(doc.getElementById('cust-ov'), '🔗 Свържи ги'));
    await tick(); await tick();
    const p = calls.patch.find(x => /client_orders/.test(x.url));
    ok('създава нов group_id', p && /^[0-9a-f-]{36}$/.test(p.body.group_id));
    ok('свързва точно 2 заявки', p && (p.url.match(/c-1|c-2/g) || []).length === 2);
  }
  {
    const { w, doc, calls } = boot({ failPatch: true });
    w.renderClientOrders();
    realClick(w, row(doc, 'c-1').querySelector('b[onclick*="openCustomerOrders"]'));
    realClick(w, btnOnly(doc.getElementById('cust-ov'), '🔗 Свържи ги'));
    await tick(); await tick();
    ok('при грешка панелът остава отворен', !!doc.getElementById('cust-ov'));
    ok('при грешка има съобщение', calls.toast.some(t => /Грешка при свързване/.test(t)));
  }


  {
    /* сливане: приключен член на старата група НЕ бива да остане настрана */
    const co = JSON.parse(JSON.stringify(ORDERS));
    co.find(o => o.id === 'x-1').group_id = G1;   /* приключена, но в групата */
    const { w, doc, calls } = boot({ co });
    w.renderClientOrders();
    realClick(w, row(doc, 'c-1').querySelector('b[onclick*="openCustomerOrders"]'));
    realClick(w, btnOnly(doc.getElementById('cust-ov'), '🔗 Свържи ги'));
    await tick(); await tick();
    const p = calls.patch.find(x => /client_orders/.test(x.url));
    ok('приключеният член на групата също се влачи', p && /x-1/.test(p.url), p && p.url);
    ok('групата се запазва, не се прави нова', p && p.body.group_id === G1);
  }

  /* ══════════ 7. "Още една заявка за същия клиент" ══════════ */
  section('7. Още една заявка за същия клиент');
  {
    const { w, doc, calls } = boot();
    w.renderClientOrders();
    realClick(w, row(doc, 'g-1').querySelector('b[onclick*="openCustomerOrders"]'));
    realClick(w, btnOnly(doc.getElementById('cust-ov'), '➕ Още една заявка'));
    await tick();
    ok('панелът се затваря', !doc.getElementById('cust-ov'));
    ok('модалът за нова заявка се отваря', doc.getElementById('client-modal').classList.contains('open'));
    ok('името е пренесено', doc.getElementById('c-name').value === 'Панка Кръшкова');
    ok('телефонът е пренесен', doc.getElementById('c-phone').value === '0893 68 44 44');
    ok('артикулите СА празни (различни са)', doc.querySelector('#c-items .item-product').value === '');
    ok('вижда се, че заявката влиза в обща поръчка',
      doc.getElementById('c-group-hint').style.display !== 'none' &&
      /обща поръчка/.test(doc.getElementById('c-group-hint').textContent));

    doc.querySelector('#c-items .item-product').value = 'ПРОФИЛ';
    realClick(w, btnOnly(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick(); await tick();
    const post = calls.post.find(x => /client_orders/.test(x.url));
    ok('новата заявка се записва със същата група', post && post.body.group_id === G1);
    ok('НЕ пита пак за свързване (вече е в групата)', !doc.getElementById('link-ov'));
    ok('SAP напомнянето излиза', !!doc.getElementById('sap-ov'));
  }
  {
    /* от заявка БЕЗ група — групата се създава и се записва и на двете */
    const { w, doc, calls } = boot();
    w.renderClientOrders();
    realClick(w, row(doc, 's-1').querySelector('b[onclick*="openCustomerOrders"]'));
    realClick(w, btnOnly(doc.getElementById('cust-ov'), '➕ Още една заявка'));
    await tick(); await tick();
    const p = calls.patch.find(x => /client_orders.*s-1/.test(x.url));
    ok('изходната заявка също получава група', p && /^[0-9a-f-]{36}$/.test(p.body.group_id));
    doc.querySelector('#c-items .item-product').value = 'КАНТ';
    realClick(w, btnOnly(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick(); await tick();
    const post = calls.post.find(x => /client_orders/.test(x.url));
    ok('новата заявка е в същата група', post && post.body.group_id === p.body.group_id);
  }
  {
    /* обикновена нова заявка не носи група от предишно отваряне */
    const { w, doc, calls } = boot();
    w.renderClientOrders();
    realClick(w, row(doc, 'g-1').querySelector('b[onclick*="openCustomerOrders"]'));
    realClick(w, btnOnly(doc.getElementById('cust-ov'), '➕ Още една заявка'));
    await tick();
    w.openClientModal(); /* сега отваряме "чиста" нова заявка */
    ok('името е изчистено', doc.getElementById('c-name').value === '');
    ok('подсказката за група е скрита', doc.getElementById('c-group-hint').style.display === 'none');
    doc.getElementById('c-name').value = 'Нов Клиент';
    doc.getElementById('c-phone').value = '0877000111';
    doc.querySelector('#c-items .item-product').value = 'НЕЩО';
    realClick(w, btnOnly(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick(); await tick();
    const post = calls.post.find(x => /client_orders/.test(x.url));
    ok('новата заявка НЕ влиза в стара група', post && post.body.group_id === null);
  }

  /* ══════════ 8. Предложение веднага след запис ══════════ */
  section('8. Предложение за свързване след запис');
  {
    const { w, doc, calls } = boot();
    w.openClientModal();
    doc.getElementById('c-name').value = 'Панка Кръшкова';
    doc.getElementById('c-phone').value = '0893684444';
    doc.querySelector('#c-items .item-product').value = 'ЦИМЕНТ';
    realClick(w, btnOnly(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick(); await tick();
    const ov = doc.getElementById('link-ov');
    ok('предлага свързване', !!ov);
    ok('изброява съществуващите заявки', ov.textContent.indexOf('№0101') >= 0 && ov.textContent.indexOf('№0104') >= 0);
    ok('НЕ показва SAP напомнянето отгоре', !doc.getElementById('sap-ov'));
    ok('предупреждава за служебни телефони', /служебен/.test(ov.textContent));

    realClick(w, btnOnly(ov, '🔗 Свържи ги'));
    await tick(); await tick();
    const p = calls.patch.find(x => /client_orders/.test(x.url));
    ok('свързва новата с останалите', !!p && !!p.body.group_id);
    ok('след това идва SAP напомнянето', !!doc.getElementById('sap-ov'));
  }
  {
    const { w, doc, calls } = boot();
    w.openClientModal();
    doc.getElementById('c-name').value = 'Панка Кръшкова';
    doc.getElementById('c-phone').value = '0893684444';
    doc.querySelector('#c-items .item-product').value = 'ЦИМЕНТ';
    realClick(w, btnOnly(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick(); await tick();
    realClick(w, btnOnly(doc.getElementById('link-ov'), 'Не, отделни са'));
    await tick();
    ok('"Не, отделни са" не свързва нищо', !calls.patch.some(x => x.body && x.body.group_id));
    ok('но SAP напомнянето пак излиза', !!doc.getElementById('sap-ov'));
  }
  {
    const { w, doc, calls } = boot();
    w.openClientModal();
    doc.getElementById('c-name').value = 'Съвсем Нов';
    doc.getElementById('c-phone').value = '0899000111';
    doc.querySelector('#c-items .item-product').value = 'НЕЩО';
    realClick(w, btnOnly(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick(); await tick();
    ok('при непознат телефон НЕ пита за свързване', !doc.getElementById('link-ov'));
    ok('SAP напомнянето излиза направо', !!doc.getElementById('sap-ov'));
  }

  /* ══════════ 9. Предупреждение при "Изпълнена" ══════════ */
  section('9. Предупреждение при "Изпълнена"');
  {
    const { w, doc, calls } = boot();
    w.setClientStatus('g-1', 'done');
    await tick();
    const ov = doc.getElementById('gdone-ov');
    ok('спира и предупреждава', !!ov);
    ok('НЕ е записало нищо още', calls.patch.length === 0);
    ok('изброява незавършените заявки', ov.textContent.indexOf('№0102') >= 0 && ov.textContent.indexOf('№0103') >= 0);
    ok('обяснява последствието', /част от поръчката/.test(ov.textContent));

    realClick(w, btnOnly(ov, 'Отказ, ще изчакам'));
    await tick();
    ok('"Отказ" не записва', calls.patch.length === 0);
    ok('прозорецът се затваря', !doc.getElementById('gdone-ov'));
  }
  {
    const { w, doc, calls } = boot();
    w.setClientStatus('g-1', 'done');
    await tick();
    realClick(w, btnOnly(doc.getElementById('gdone-ov'), 'Въпреки това'));
    await tick(); await tick();
    ok('"Въпреки това" записва', calls.patch.some(p => p.body.status === 'done'));
    ok('прозорецът се затваря', !doc.getElementById('gdone-ov'));
  }
  {
    /* последната незавършена от групата — няма какво да се предупреждава */
    const co = JSON.parse(JSON.stringify(ORDERS));
    co.find(o => o.id === 'g-2').status = 'done';
    co.find(o => o.id === 'g-3').status = 'done';
    const { w, doc, calls } = boot({ co });
    w.setClientStatus('g-1', 'done');
    await tick(); await tick();
    ok('при готови останали заявки минава направо', !doc.getElementById('gdone-ov'));
    ok('и записва', calls.patch.some(p => p.body.status === 'done'));
  }
  {
    const { w, calls } = boot();
    w.setClientStatus('s-1', 'done');
    await tick(); await tick();
    ok('заявка без група минава направо', calls.patch.some(p => p.body.status === 'done'));
  }
  {
    /* другите статуси не се прекъсват */
    const { w, doc, calls } = boot();
    w.setClientStatus('g-1', 'sent');
    await tick(); await tick();
    ok('"Изпратена" не се прекъсва от предупреждението', !doc.getElementById('gdone-ov'));
    ok('и се записва', calls.patch.some(p => p.body.status === 'sent'));
  }
  {
    /* същата проверка и през модала "Статус" */
    const { w, doc, calls } = boot();
    w.openStatus('g-1', 'client_orders');
    w.statusTargetId = 'g-1'; w.statusTargetTable = 'client_orders';
    w.setStatus('done');
    await tick();
    ok('и през модала "Статус" предупреждава', !!doc.getElementById('gdone-ov'));
    ok('и там не записва преди потвърждение', calls.patch.length === 0);
  }

  /* ══════════ 10. Бланка и История ══════════ */
  section('10. Бланка за клиента и История');
  {
    const { w, doc } = boot();
    w.renderPrint(w.clientOrders.find(o => o.id === 'g-1'));
    const html = doc.getElementById('mod-print').innerHTML;
    ok('бланката казва, че поръчката е на части', html.indexOf('Заявка 1 от 3') >= 0);
    ok('обяснява го с думи', /пристига на части/.test(html));
    w.renderPrint(w.clientOrders.find(o => o.id === 's-1'));
    ok('при самостоятелна заявка няма такъв текст',
      doc.getElementById('mod-print').innerHTML.indexOf('Обща поръчка') < 0);
  }
  {
    const { w, doc } = boot();
    w.histData = { transport: [], client: JSON.parse(JSON.stringify(ORDERS)), kasa: [], storno: [], pallets: [], returns: [], diffs: [], transit: [] };
    w.renderHistoryShell();
    let html = '';
    try { w.renderHistoryResults(); html = doc.getElementById('h-results').innerHTML; } catch (e) { html = 'ГРЕШКА: ' + e.message; }
    ok('История показва "👥 1 от 3"', html.indexOf('👥 1 от 3') >= 0, html.slice(0, 120));
    ok('самостоятелната заявка е без бадж в История',
      (html.match(/👥/g) || []).length === 3);
  }
  {
    /* част от групата извън периода → честен надпис вместо грешно "1 от 1" */
    const { w, doc } = boot();
    w.histData = { transport: [], client: [JSON.parse(JSON.stringify(ORDERS)).find(o => o.id === 'g-1')], kasa: [], storno: [], pallets: [], returns: [], diffs: [], transit: [] };
    w.renderHistoryShell();
    w.renderHistoryResults();
    const html = doc.getElementById('h-results').innerHTML;
    ok('не твърди "1 от 1", а казва "обща поръчка"',
      html.indexOf('👥 обща поръчка') >= 0 && html.indexOf('1 от 1') < 0);
  }

  /* ══════════ 11. Регресия ══════════ */
  section('11. Регресия');
  {
    const { w, doc, calls } = boot();
    w.renderClientOrders();
    ok('бутонът 🖨 Бланка е запазен', !!btnOnly(row(doc, 'g-1'), '🖨 Бланка'));
    ok('бутонът 🚚 Платен транспорт е запазен', !!btnOnly(row(doc, 'g-2'), '🚚 Платен транспорт'));
    ok('статусите се показват както преди', row(doc, 'g-3').innerHTML.indexOf('Изпратена') >= 0);
    realClick(w, btnOnly(row(doc, 'g-3'), '📦 Пристигнала'));
    await tick(); await tick();
    ok('"Пристигнала" още работи', calls.patch.some(p => p.body.status === 'arrived'));

    w.openClientModal();
    realClick(w, Array.from(doc.getElementById('client-modal').querySelectorAll('button')).find(b => b.textContent.trim() === 'Откажи'));
    ok('"Откажи" в модала работи', !doc.getElementById('client-modal').classList.contains('open'));
  }

  console.log('\n─────────────────────────────');
  console.log(pass + ' успешни, ' + fail + ' неуспешни');
  process.exit(fail ? 1 : 0);
})();
