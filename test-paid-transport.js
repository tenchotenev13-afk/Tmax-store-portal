/* Интеграционен тест за "Платен транспорт" (клиентска заявка ⇄ транспортна заявка)
   Зарежда РЕАЛНИЯ index.html като DOM и shared.js + transport.js + client-orders.js +
   history.js + handbook.js в реалния ред от index.html, и кликa с ИСТИНСКИ кликове.

   Пускане от папката на репото:
     npm i -D jsdom
     node test-paid-transport.js
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

/* ── Данни ── */
const CLIENT_ORDERS = [
  { id: 'co-1', in_num: '0001', store_name: 'Враца', date: '2026-08-14', hour: '10:00', bon: '000111',
    customer_name: 'Иван Петров', phone: '0888111222', product: 'БОЙЛЕР 80Л', sap: '111', qty: 1, unit: 'бр.',
    items: [{ product: 'БОЙЛЕР 80Л', sap: '111', qty: 1, unit: 'бр.', color: '' }],
    from_store: 'Враца', fulfiller: 'Логистичен склад Добрич', agent: 'Управител Враца',
    delivery: '2026-08-25', status: 'pending', note: '', created_at: '2026-08-14T09:00:00Z',
    paid_transport: false, transport_id: null },
  /* заявка с вече създаден платен транспорт */
  { id: 'co-2', in_num: '0002', store_name: 'Враца', date: '2026-08-15', hour: '11:00', bon: '000222',
    customer_name: 'Мария Георгиева', phone: '0888333444', product: 'МИВКА', sap: '222', qty: 2, unit: 'бр.',
    items: [{ product: 'МИВКА', sap: '222', qty: 2, unit: 'бр.', color: 'бяла' }],
    from_store: 'Враца', fulfiller: '', agent: 'Управител Враца',
    delivery: '2026-08-20', status: 'sent', note: '', created_at: '2026-08-15T09:00:00Z',
    paid_transport: true, transport_id: 'tr-2' },
  /* СЧУПЕН случай: отметнат платен транспорт, но POST-ът се е провалил */
  { id: 'co-3', in_num: '0003', store_name: 'Враца', date: '2026-08-16', hour: '12:00', bon: '000333',
    customer_name: 'Петър Иванов', phone: '0888555666', product: 'ЛАМПА', sap: '333', qty: 1, unit: 'бр.',
    items: [{ product: 'ЛАМПА', sap: '333', qty: 1, unit: 'бр.' }],
    from_store: 'Враца', fulfiller: '', agent: 'Управител Враца',
    delivery: '2026-08-22', status: 'pending', note: '', created_at: '2026-08-16T09:00:00Z',
    paid_transport: true, transport_id: null }
];
const TRANSPORT_ORDERS = [
  /* обикновена транспортна заявка, просрочена -> ТРЯБВА да си остане просрочена */
  { id: 'tr-1', store_name: 'Враца', date: '2026-08-10', hour: '09:00', customer_name: 'Стар Клиент',
    phone: '0888000000', address: 'гр. Враца, ул. Стара 1', product: 'ВРАТА', sap: '999', qty: 1, unit: 'бр.',
    delivery: '2026-08-12', status: 'pending', awaiting_stock: false, client_order_id: null, client_order_num: null },
  /* транспорт от клиентска заявка, стоката още не е дошла -> "Чака стока", НЕ просрочен */
  { id: 'tr-2', store_name: 'Враца', date: '2026-08-15', hour: '11:00', customer_name: 'Мария Георгиева',
    phone: '0888333444', address: 'гр. Враца, ул. Нова 5', product: 'МИВКА', sap: '222', qty: 2, unit: 'бр.',
    items: [{ product: 'МИВКА', sap: '222', qty: 2, unit: 'бр.', color: 'бяла' }],
    delivery: '2026-08-01', status: 'pending', awaiting_stock: true,
    client_order_id: 'co-2', client_order_num: '0002', notes: 'Платен транспорт по клиентска заявка №0002' }
];

const STORE_USER = { email: 'vraca@temax.bg', display_name: 'Управител Враца', role: 'manager', store_name: 'Враца' };

function boot(opts) {
  opts = opts || {};
  const html = fs.readFileSync(DIR + 'index.html', 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.org/' });
  const w = dom.window;
  const calls = { get: [], post: [], patch: [], del: [], toast: [], confirm: [], scrollIntoView: [] };

  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = function (o) { calls.scrollIntoView.push({ id: this.id, opt: o }); };
  w.confirm = m => { calls.confirm.push(m); return opts.confirm !== false; };
  w.alert = () => {};

  w.fetch = function (url, init) {
    init = init || {};
    const method = init.method || 'GET';
    if (method === 'GET') {
      calls.get.push(url);
      let body = [];
      if (/\/client_orders/.test(url)) body = JSON.parse(JSON.stringify(w.__co || CLIENT_ORDERS));
      else if (/\/transport_orders/.test(url)) body = JSON.parse(JSON.stringify(w.__tr || TRANSPORT_ORDERS));
      else if (/\/stores/.test(url)) body = [{ name: 'Враца', addr: 'бул. Кънчов', phone: '092' }];
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve('') });
    }
    const failThis = opts.failPostTransport && method === 'POST' && /\/transport_orders/.test(url);
    if (method === 'POST') calls.post.push({ url, body: JSON.parse(init.body) });
    if (method === 'PATCH') calls.patch.push({ url, body: JSON.parse(init.body) });
    if (method === 'DELETE') calls.del.push(url);
    return Promise.resolve({
      ok: !failThis,
      json: () => Promise.resolve(failThis ? { message: 'boom' } : {}),
      text: () => Promise.resolve('')
    });
  };

  const load = f => w.eval(fs.readFileSync(DIR + f, 'utf8'));
  /* реалният ред от index.html (само модулите, засегнати от промяната) */
  load('shared.js');
  load('transport.js');
  load('client-orders.js');
  load('history.js');
  load('notifications.js');
  load('handbook.js');

  /* модули, които не участват в тази промяна — заглушени, за да не чупят loadAll()/showModule() */
  ['loadDocs', 'loadBulletin', 'loadKasa', 'loadAdmin', 'loadContacts', 'loadTransit', 'loadCalendar',
   'loadStockReturns', 'loadStockDiff', 'loadPallets', 'loadReference', 'loadTodayDashboard']
    .forEach(fn => { if (typeof w[fn] !== 'function') w[fn] = () => {}; });

  w.currentUser = opts.user || STORE_USER;
  w.clientOrders = JSON.parse(JSON.stringify(opts.co || CLIENT_ORDERS));
  w.transportOrders = JSON.parse(JSON.stringify(opts.tr || TRANSPORT_ORDERS));
  w.clientOrders.forEach(o => { o._status = w.calcStatus(o.delivery, o.status); o._days = w.calcElapsed(o.created_at); });
  w.transportOrders.forEach(o => {
    const st = w.calcStatus(o.delivery, o.status);
    o._status = (o.awaiting_stock && ['done', 'refused', 'postponed'].indexOf(o.status) < 0) ? 'awaiting' : st;
  });
  const origToast = w.toast;
  w.toast = (m, c) => { calls.toast.push(m); try { origToast(m, c); } catch (e) {} };
  return { w, calls, doc: w.document };
}

/* Истински клик: изпълнява onclick атрибута точно както браузърът, с this=елемента */
function realClick(w, el) {
  if (!el) throw new Error('елементът не съществува');
  const code = el.getAttribute('onclick');
  if (!code) throw new Error('няма onclick: ' + el.outerHTML.slice(0, 140));
  const fn = w.eval('(function(el){ (function(){' + code + '}).call(el); })');
  fn(el);
}
function fireChange(w, el) {
  const fn = w.eval('(function(el){ (function(){' + el.getAttribute('onchange') + '}).call(el); })');
  fn(el);
}
function btnIn(root, text) {
  return Array.from(root.querySelectorAll('button, span')).find(b => (b.textContent || '').indexOf(text) >= 0);
}
function rowOf(doc, id) { return doc.getElementById(id); }
const tick = () => new Promise(r => setTimeout(r, 0));

(async function run() {

  /* ══════════ 1. Отметката в модала за нова заявка ══════════ */
  section('1. Отметка "Платен транспорт" в модала за нова заявка');
  {
    const { w, doc } = boot();
    w.openClientModal();
    const cb = doc.getElementById('c-paid-transport');
    const wrap = doc.getElementById('c-pt-wrap');
    ok('отметката съществува в модала', !!cb);
    ok('блокът с адрес е скрит при отваряне', wrap && wrap.style.display === 'none');
    ok('отметката стартира изчистена', cb && cb.checked === false);

    cb.checked = true; fireChange(w, cb);
    ok('след отмятане блокът с адрес се показва', wrap.style.display !== 'none');
    ok('полето за адрес съществува', !!doc.getElementById('c-pt-addr'));
    ok('полето за час съществува и е 10:00', doc.getElementById('c-pt-hour').value === '10:00');

    cb.checked = false; fireChange(w, cb);
    ok('след премахване на отметката блокът пак се скрива', wrap.style.display === 'none');

    /* повторно отваряне не бива да носи стари данни */
    cb.checked = true; fireChange(w, cb);
    doc.getElementById('c-pt-addr').value = 'гр. Стара Загора';
    w.openClientModal();
    ok('повторно отваряне изчиства отметката', doc.getElementById('c-paid-transport').checked === false);
    ok('повторно отваряне изчиства адреса', doc.getElementById('c-pt-addr').value === '');
    ok('повторно отваряне скрива блока', doc.getElementById('c-pt-wrap').style.display === 'none');
  }

  /* ══════════ 2. Запис БЕЗ платен транспорт (регресия) ══════════ */
  section('2. Запис БЕЗ платен транспорт — нищо не се променя');
  {
    const { w, doc, calls } = boot();
    w.openClientModal();
    doc.getElementById('c-name').value = 'Нов Клиент';
    doc.getElementById('c-phone').value = '0899123456';
    doc.querySelector('#c-items .item-product').value = 'ТЕСТ ПРОДУКТ';
    doc.getElementById('c-delivery').value = '2026-08-30';
    realClick(w, btnIn(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick();
    ok('точно 1 POST (само клиентска заявка)', calls.post.length === 1, JSON.stringify(calls.post.map(p => p.url)));
    ok('POST-ът е към client_orders', /client_orders/.test(calls.post[0].url));
    ok('paid_transport=false', calls.post[0].body.paid_transport === false);
    ok('има генериран id', /^[0-9a-f-]{36}$/.test(calls.post[0].body.id));
    ok('НЕ се прави PATCH за връзка', calls.patch.length === 0);
    ok('SAP напомнянето се показва и без платен транспорт', !!doc.getElementById('sap-ov'));
  }

  /* ══════════ 3. Валидация: отметка без адрес ══════════ */
  section('3. Валидация — отметнат платен транспорт без адрес');
  {
    const { w, doc, calls } = boot();
    w.openClientModal();
    doc.getElementById('c-name').value = 'Нов Клиент';
    doc.getElementById('c-phone').value = '0899123456';
    doc.querySelector('#c-items .item-product').value = 'ТЕСТ';
    const cb = doc.getElementById('c-paid-transport'); cb.checked = true; fireChange(w, cb);
    realClick(w, btnIn(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick();
    ok('НЯМА никакъв запис при липсващ адрес', calls.post.length === 0);
    ok('изведено е съобщение за адреса', calls.toast.some(t => /адрес/i.test(t)), JSON.stringify(calls.toast));
    ok('модалът остава отворен', doc.getElementById('client-modal').classList.contains('open'));
  }

  /* ══════════ 4. Запис С платен транспорт — двата записа са свързани ══════════ */
  section('4. Запис С платен транспорт — създава се свързана транспортна заявка');
  {
    const { w, doc, calls } = boot();
    w.openClientModal();
    doc.getElementById('c-name').value = 'Георги Тестов';
    doc.getElementById('c-phone').value = '0899123456';
    doc.querySelector('#c-items .item-product').value = 'ДИВАН';
    doc.querySelector('#c-items .item-sap').value = '777';
    doc.querySelector('#c-items .item-qty').value = '1';
    doc.getElementById('c-delivery').value = '2026-08-30';
    doc.getElementById('c-bon').value = '000999';
    const cb = doc.getElementById('c-paid-transport'); cb.checked = true; fireChange(w, cb);
    doc.getElementById('c-pt-addr').value = 'гр. Враца, ул. Тестова 7, ет. 2';
    doc.getElementById('c-pt-hour').value = '14:00';
    realClick(w, btnIn(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick(); await tick();

    const coPost = calls.post.find(p => /client_orders/.test(p.url));
    const trPost = calls.post.find(p => /transport_orders/.test(p.url));
    ok('направени са 2 POST-а', calls.post.length === 2, JSON.stringify(calls.post.map(p => p.url)));
    ok('клиентската заявка е с paid_transport=true', coPost && coPost.body.paid_transport === true);
    ok('транспортът сочи към клиентската заявка', trPost && trPost.body.client_order_id === coPost.body.id);
    ok('транспортът пази номера на заявката', trPost && trPost.body.client_order_num === coPost.body.in_num);
    ok('транспортът е awaiting_stock=true', trPost && trPost.body.awaiting_stock === true);
    ok('адресът е записан в транспорта', trPost && trPost.body.address === 'гр. Враца, ул. Тестова 7, ет. 2');
    ok('часът е записан в транспорта', trPost && trPost.body.hour === '14:00');
    ok('датата за доставка е взета от клиентската заявка', trPost && trPost.body.delivery === '2026-08-30');
    ok('артикулите са пренесени', trPost && trPost.body.items && trPost.body.items[0].product === 'ДИВАН');
    ok('бонът е пренесен', trPost && trPost.body.bon === '000999');
    ok('бележката сочи номера на заявката', trPost && /№0/.test(trPost.body.notes || ''));

    const patch = calls.patch.find(p => /client_orders/.test(p.url));
    ok('клиентската заявка е обновена с transport_id', patch && patch.body.transport_id === trPost.body.id);
    ok('връзката е и в двете посоки', patch.body.paid_transport === true && trPost.body.client_order_id === coPost.body.id);
    ok('SAP напомнянето изскача', !!doc.getElementById('sap-ov'));
  }

  /* ══════════ 5. Провален POST на транспорта — НЕ се поглъща тихо ══════════ */
  section('5. Провален запис на транспорта — вижда се, не изчезва тихо');
  {
    const { w, doc, calls } = boot({ failPostTransport: true });
    w.openClientModal();
    doc.getElementById('c-name').value = 'Клиент Провал';
    doc.getElementById('c-phone').value = '0899000111';
    doc.querySelector('#c-items .item-product').value = 'МАСА';
    const cb = doc.getElementById('c-paid-transport'); cb.checked = true; fireChange(w, cb);
    doc.getElementById('c-pt-addr').value = 'гр. Враца, ул. Проба 1';
    realClick(w, btnIn(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick(); await tick();
    ok('изведена е ЯСНА грешка за липсващия транспорт',
      calls.toast.some(t => /ТРАНСПОРТЪТ НЕ Е СЪЗДАДЕН/i.test(t)), JSON.stringify(calls.toast));
    ok('НЯМА PATCH с transport_id (връзката не се лъже)',
      !calls.patch.some(p => p.body && p.body.transport_id));
  }

  /* ══════════ 6. Ред в таблицата — бутони и баджове ══════════ */
  section('6. Клиентски заявки — бутони и баджове по редовете');
  {
    const { w, doc } = boot();
    w.renderClientOrders();
    const r1 = rowOf(doc, 'co-row-co-1'), r2 = rowOf(doc, 'co-row-co-2'), r3 = rowOf(doc, 'co-row-co-3');
    ok('ред без платен транспорт има бутон "🚚 Платен транспорт"', !!btnIn(r1, '🚚 Платен транспорт'));
    ok('ред без платен транспорт НЯМА бадж', r1.innerHTML.indexOf('🚚 Платен транспорт</span>') < 0);
    ok('ред с транспорт има бутон "🚚 Транспорт →"', !!btnIn(r2, '🚚 Транспорт →'));
    ok('ред с транспорт има зелен бадж', r2.innerHTML.indexOf('🚚 Платен транспорт') >= 0);
    ok('СЧУПЕН ред има червено предупреждение (бутон)', !!btnIn(r3, '⚠️ Липсва транспорт'));
    ok('СЧУПЕН ред има червен бадж', r3.innerHTML.indexOf('⚠️ Транспорт липсва') >= 0);
    ok('бутонът 🖨 Бланка е запазен на всички редове',
      !!btnIn(r1, '🖨 Бланка') && !!btnIn(r2, '🖨 Бланка') && !!btnIn(r3, '🖨 Бланка'));
  }

  /* ══════════ 7. Бутонът 🚚 на съществуващ ред (истински клик) ══════════ */
  section('7. Бутон "🚚 Платен транспорт" на съществуващ ред');
  {
    const { w, doc, calls } = boot();
    w.renderClientOrders();
    realClick(w, btnIn(rowOf(doc, 'co-row-co-1'), '🚚 Платен транспорт'));
    const ov = doc.getElementById('pt-ov');
    ok('отваря се модал', !!ov);
    ok('модалът показва номера на заявката', ov.textContent.indexOf('№0001') >= 0);
    ok('датата за доставка е предварително попълнена', doc.getElementById('pt-delivery').value === '2026-08-25');

    /* първо: без адрес -> блокира */
    realClick(w, doc.getElementById('pt-submit'));
    await tick();
    ok('без адрес НЕ записва', calls.post.length === 0);
    ok('без адрес показва грешка', calls.toast.some(t => /адрес/i.test(t)));
    ok('модалът остава отворен', !!doc.getElementById('pt-ov'));

    /* после: с адрес -> записва */
    doc.getElementById('pt-addr').value = 'гр. Враца, ул. Реална 3';
    doc.getElementById('pt-hour').value = '16:00';
    realClick(w, doc.getElementById('pt-submit'));
    await tick(); await tick(); await tick();
    const trPost = calls.post.find(p => /transport_orders/.test(p.url));
    ok('създаден е транспорт', !!trPost);
    ok('вързан е за co-1', trPost && trPost.body.client_order_id === 'co-1');
    ok('номерът на заявката е записан', trPost && trPost.body.client_order_num === '0001');
    ok('awaiting_stock=true (стоката още не е дошла)', trPost && trPost.body.awaiting_stock === true);
    ok('часът от модала е приложен', trPost && trPost.body.hour === '16:00');
    ok('клиентската заявка е вързана обратно',
      calls.patch.some(p => /client_orders/.test(p.url) && p.body.transport_id === trPost.body.id));
    ok('модалът се затваря след успех', !doc.getElementById('pt-ov'));
  }

  /* ══════════ 8. Статус "Чака стока" в таб Транспорт ══════════ */
  section('8. Таб Транспорт — "Чака стока" не е просрочен');
  {
    const { w, doc } = boot();
    w.renderTransport();
    const r1 = rowOf(doc, 'tr-row-tr-1'), r2 = rowOf(doc, 'tr-row-tr-2');
    ok('обикновената просрочена заявка си остава просрочена', r1.innerHTML.indexOf('🔴 Просрочена') >= 0);
    ok('обикновената просрочена заявка пулсира', /rowPulse/.test(r1.getAttribute('style')));
    ok('транспортът към клиентска заявка е "⏳ Чака стока"', r2.innerHTML.indexOf('⏳ Чака стока') >= 0);
    ok('НЕ показва "Просрочена", въпреки че датата е минала', r2.innerHTML.indexOf('Просрочена') < 0);
    ok('НЕ пулсира', !/rowPulse/.test(r2.getAttribute('style') || ''));
    ok('има бадж към клиентската заявка', r2.innerHTML.indexOf('📋 Клиентска заявка №0002') >= 0);

    /* броячи и банери не бива да го смятат за спешен */
    w.renderMetrics(); w.updateBadges();
    const metrics = doc.getElementById('tr-metrics');
    const overdueCount = metrics ? parseInt(metrics.querySelector('.metric-val').textContent, 10) : -1;
    ok('в броячите "Просрочени" влиза само истинската просрочена (1)', overdueCount === 1, 'брой=' + overdueCount);
  }

  /* ══════════ 9. Търсене по номер на клиентска заявка ══════════ */
  section('9. Търсене в Транспорт по номер на клиентската заявка');
  {
    const { w, doc } = boot();
    doc.getElementById('tr-search').value = '0002';
    w.renderTransport();
    const body = doc.getElementById('tr-body');
    ok('намира транспорта по номера на клиентската заявка', !!rowOf(doc, 'tr-row-tr-2'));
    ok('не показва несвързаните заявки', !rowOf(doc, 'tr-row-tr-1'));
  }

  /* ══════════ 10. Филтърът "Чака стока" ══════════ */
  section('10. Филтър "⏳ Чака стока"');
  {
    const { w, doc } = boot();
    const btn = Array.from(doc.querySelectorAll('#tr-filters .filter-btn')).find(b => b.textContent.indexOf('Чака стока') >= 0);
    ok('бутонът съществува в index.html', !!btn);
    realClick(w, btn);
    ok('показва само чакащите стока', !!rowOf(doc, 'tr-row-tr-2') && !rowOf(doc, 'tr-row-tr-1'));
    ok('бутонът се маркира като активен', btn.classList.contains('active'));
  }

  /* ══════════ 11. Смяна на статус синхронизира транспорта ══════════ */
  section('11. "📦 Пристигнала" освобождава транспорта');
  {
    const { w, calls } = boot();
    w.setClientStatus('co-2', 'arrived');
    await tick(); await tick();
    const p = calls.patch.find(x => /transport_orders/.test(x.url));
    ok('транспортът е обновен', !!p);
    ok('awaiting_stock става false', p && p.body.awaiting_stock === false);
    ok('URL сочи правилния транспорт', p && /id=eq\.tr-2/.test(p.url));
  }
  {
    const { w, calls } = boot();
    w.setClientStatus('co-2', 'refused');
    await tick(); await tick();
    const p = calls.patch.find(x => /transport_orders/.test(x.url));
    ok('при отказ транспортът също се отказва', p && p.body.status === 'refused');
  }
  {
    const { w, calls } = boot();
    w.setClientStatus('co-1', 'arrived');
    await tick(); await tick();
    ok('заявка без платен транспорт не пипа transport_orders',
      !calls.patch.some(x => /transport_orders/.test(x.url)));
  }
  {
    /* връщане назад от "Пристигнала" пак заключва транспорта */
    const { w, calls } = boot();
    w.revertStatus('co-2', 'client_orders');
    await tick(); await tick();
    const p = calls.patch.find(x => /transport_orders/.test(x.url));
    ok('↩ Върни връща транспорта в "Чака стока"', p && p.body.awaiting_stock === true);
  }
  {
    /* пътят през модала "Статус" в shared.js */
    const { w, doc, calls } = boot();
    w.openStatus('co-2', 'client_orders');
    w.statusTargetId = 'co-2'; w.statusTargetTable = 'client_orders';
    w.setStatus('arrived');
    await tick(); await tick();
    const p = calls.patch.find(x => /transport_orders/.test(x.url));
    ok('и през модала "Статус" транспортът се синхронизира', p && p.body.awaiting_stock === false);
  }

  /* ══════════ 12. Навигация между двата таба ══════════ */
  section('12. Навигация по връзката в двете посоки');
  {
    const { w, doc, calls } = boot();
    w.renderClientOrders();
    realClick(w, btnIn(rowOf(doc, 'co-row-co-2'), '🚚 Транспорт →'));
    await tick(); await tick();
    ok('таб Транспорт е показан', doc.getElementById('mod-transport').style.display === 'block');
    ok('филтърът е нулиран на "Всички"', w.transportFilter === 'all');
    ok('свързаният ред е скролнат', calls.scrollIntoView.some(s => s.id === 'tr-row-tr-2'), JSON.stringify(calls.scrollIntoView));
  }
  {
    const { w, doc, calls } = boot();
    w.renderTransport();
    const badge = Array.from(rowOf(doc, 'tr-row-tr-2').querySelectorAll('span'))
      .find(s => (s.textContent || '').indexOf('📋 Клиентска заявка') >= 0);
    ok('баджът е кликаем', !!badge && !!badge.getAttribute('onclick'));
    realClick(w, badge);
    await tick(); await tick();
    ok('таб Клиентски заявки е показан', doc.getElementById('mod-client').style.display === 'block');
    ok('филтърът е нулиран', w.orderFilter === 'all');
    ok('свързаната заявка е скролната', calls.scrollIntoView.some(s => s.id === 'co-row-co-2'));
  }

  /* ══════════ 13. Изтриване — транспортът не остава сирак ══════════ */
  section('13. Изтриване на клиентска заявка със свързан транспорт');
  {
    const { w, calls } = boot();
    w.deleteClientOrder('co-2');
    await tick(); await tick(); await tick();
    ok('потвърждението предупреждава за транспорта', /транспортна заявка/i.test(calls.confirm[0] || ''));
    ok('изтрит е и транспортът', calls.del.some(u => /transport_orders.*tr-2/.test(u)), JSON.stringify(calls.del));
    ok('изтрита е и клиентската заявка', calls.del.some(u => /client_orders.*co-2/.test(u)));
  }
  {
    const { w, calls } = boot();
    w.deleteClientOrder('co-1');
    await tick(); await tick();
    ok('без свързан транспорт се трие само заявката',
      calls.del.length === 1 && /client_orders/.test(calls.del[0]));
  }

  /* ══════════ 14. SAP напомняне ══════════ */
  section('14. SAP напомняне — модал и банер');
  {
    const { w, doc } = boot();
    w.showSapReminder('0042');
    const ov = doc.getElementById('sap-ov');
    ok('модалът се показва', !!ov);
    ok('съдържа номера на заявката', ov.textContent.indexOf('0042') >= 0);
    ok('текстът идва от Наръчника (MIGO 951)', ov.textContent.indexOf('951') >= 0);
    ok('съдържа ZSTOCK / ZSTR', /ZSTOCK/.test(ov.textContent) && /ZSTR/.test(ov.textContent));
    ok('съдържа MB51', ov.textContent.indexOf('MB51') >= 0);
    ok('съдържа предупреждението за ревизия', /НЕ се ревизират/.test(ov.textContent));
    ok('показва и двата варианта (неналичен + с капаро)', /капаро/.test(ov.textContent));

    realClick(w, btnIn(ov, '📖 Отвори в Наръчника'));
    ok('отваря таб Наръчник', doc.getElementById('mod-handbook').style.display === 'block');
    ok('модалът е затворен', !doc.getElementById('sap-ov'));
    ok('Наръчникът е позициониран на категория "Клиентски"', w.hbState.cat === 'Клиентски');
    ok('картите за клиентски поръчки са отворени', w.hbState.openCards['kl-poruchki'] === true);
  }
  {
    const { w, doc } = boot();
    w.showSapReminder('0042');
    realClick(w, btnIn(doc.getElementById('sap-ov'), 'Разбрах'));
    ok('бутон "Разбрах" затваря модала', !doc.getElementById('sap-ov'));
  }
  {
    const { w, doc } = boot();
    w.renderCoSapBanner();
    const banner = doc.getElementById('co-sap-banner');
    ok('банерът съществува в таба', banner && banner.innerHTML.length > 0);
    ok('банерът е отворен по подразбиране', banner.textContent.indexOf('951') >= 0);
    const head = banner.querySelector('[onclick]');
    realClick(w, head);
    ok('свива се при клик', doc.getElementById('co-sap-banner').textContent.indexOf('▼ покажи') >= 0);
    realClick(w, doc.getElementById('co-sap-banner').querySelector('[onclick]'));
    ok('разгъва се обратно', doc.getElementById('co-sap-banner').textContent.indexOf('951') >= 0);
  }

  /* ══════════ 15. Бланка за шофьора + История ══════════ */
  section('15. Бланка за шофьора и История');
  {
    const { w, doc } = boot();
    w.renderTransportPrint(w.transportOrders.find(o => o.id === 'tr-2'));
    const html = doc.getElementById('mod-print').innerHTML;
    ok('бланката показва номера на клиентската заявка', html.indexOf('По клиентска заявка №') >= 0 && html.indexOf('0002') >= 0);
    w.renderTransportPrint(w.transportOrders.find(o => o.id === 'tr-1'));
    ok('при несвързан транспорт редът липсва', doc.getElementById('mod-print').innerHTML.indexOf('По клиентска заявка') < 0);
  }
  {
    const { w, doc } = boot();
    w.histData = { transport: JSON.parse(JSON.stringify(TRANSPORT_ORDERS)), client: [], kasa: [], storno: [], pallets: [], returns: [], diffs: [], transit: [] };
    w.renderHistoryShell();
    let html = '';
    try { w.renderHistoryResults(); html = doc.getElementById('h-results').innerHTML; } catch (e) { html = 'ГРЕШКА: ' + e.message; }
    ok('История показва номера на клиентската заявка', html.indexOf('Клиентска заявка №0002') >= 0, html.slice(0, 120));
    ok('История не отчита чакащия стока като просрочен',
      html.indexOf('⏳ Чака стока') >= 0);
  }

  /* ══════════ 16. Регресия — старите бутони работят ══════════ */
  section('16. Регресия — съществуващата функционалност');
  {
    const { w, doc, calls } = boot();
    w.renderClientOrders();
    const r2 = rowOf(doc, 'co-row-co-2');
    ok('бутон "📦 Пристигнала" още е там за статус sent', !!btnIn(r2, '📦 Пристигнала'));
    realClick(w, btnIn(r2, '📦 Пристигнала'));
    await tick(); await tick();
    ok('клик по "Пристигнала" праща PATCH', calls.patch.some(p => /client_orders/.test(p.url) && p.body.status === 'arrived'));
    ok('и синхронизира транспорта', calls.patch.some(p => /transport_orders/.test(p.url)));

    const { w: w2, doc: d2 } = boot();
    w2.openClientModal();
    realClick(w2, btnIn(d2.getElementById('client-modal'), 'Откажи'));
    ok('бутон "Откажи" в модала работи (истински клик)', !d2.getElementById('client-modal').classList.contains('open'));

    const { w: w3, doc: d3 } = boot();
    w3.openTransportModal();
    ok('модалът за транспорт още се отваря', d3.getElementById('transport-modal').classList.contains('open'));
    realClick(w3, btnIn(d3.getElementById('transport-modal'), 'Откажи'));
    ok('и се затваря', !d3.getElementById('transport-modal').classList.contains('open'));

    const { w: w4, doc: d4 } = boot();
    w4.renderTransport();
    ok('старите транспортни редове се рендират', !!rowOf(d4, 'tr-row-tr-1'));
    ok('бутон 🖨 Бланка на транспорт е запазен', !!btnIn(rowOf(d4, 'tr-row-tr-1'), '🖨 Бланка'));
  }

  /* ══════════ 17. Гранични случаи ══════════ */
  section('17. Гранични случаи');
  {
    /* клиентска заявка БЕЗ дата на доставка -> транспортът се създава с delivery=null */
    const { w, doc, calls } = boot();
    w.openClientModal();
    doc.getElementById('c-name').value = 'Без Дата';
    doc.getElementById('c-phone').value = '0899000222';
    doc.querySelector('#c-items .item-product').value = 'СТОЛ';
    doc.getElementById('c-delivery').value = '';
    const cb = doc.getElementById('c-paid-transport'); cb.checked = true; fireChange(w, cb);
    doc.getElementById('c-pt-addr').value = 'гр. Враца, ул. Без Дата 1';
    realClick(w, btnIn(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick(); await tick();
    const trPost = calls.post.find(p => /transport_orders/.test(p.url));
    ok('без дата на доставка транспортът пак се създава', !!trPost);
    ok('delivery e null, а не празен низ', trPost && trPost.body.delivery === null);
  }
  {
    /* повторно натискане на 🚚 при вече свързана заявка -> отваря транспорта, не дублира */
    const { w, doc, calls } = boot();
    w.openPaidTransportModal('co-2');
    await tick();
    ok('при вече свързана заявка НЕ отваря модал за нов транспорт', !doc.getElementById('pt-ov'));
    ok('вместо това навигира към транспорта', doc.getElementById('mod-transport').style.display === 'block');
    ok('не се създава втори транспорт', calls.post.length === 0);
  }
  {
    /* транспорт със статус done + awaiting_stock=true (стар/грешен запис) не бива да е "Чака стока" */
    const tr = JSON.parse(JSON.stringify(TRANSPORT_ORDERS));
    tr[1].status = 'done';
    const { w, doc } = boot({ tr });
    w.renderTransport();
    ok('изпълнен транспорт се показва като изпълнен, не "Чака стока"',
      rowOf(doc, 'tr-row-tr-2').innerHTML.indexOf('✅ Изпълнена') >= 0);
  }
  {
    /* uuid4 връща валидни, различни стойности */
    const { w } = boot();
    const a = w.uuid4(), b = w.uuid4();
    ok('uuid4 е валиден v4', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a), a);
    ok('uuid4 не се повтаря', a !== b);
  }
  {
    /* escape: адрес с кавички и < > не чупи модала */
    const co = JSON.parse(JSON.stringify(CLIENT_ORDERS));
    co[0].customer_name = 'Иван "Хакера" <script>';
    const { w, doc } = boot({ co });
    w.renderClientOrders();
    realClick(w, btnIn(rowOf(doc, 'co-row-co-1'), '🚚 Платен транспорт'));
    ok('модалът се отваря въпреки опасните символи', !!doc.getElementById('pt-ov'));
    ok('няма инжектиран script таг', doc.getElementById('pt-ov').querySelectorAll('script').length === 0);
    realClick(w, doc.getElementById('pt-submit'));
    ok('бутонът работи (не се чупи от escaping)', true);
  }

  console.log('\n─────────────────────────────');
  console.log(pass + ' успешни, ' + fail + ' неуспешни');
  process.exit(fail ? 1 : 0);
})();
