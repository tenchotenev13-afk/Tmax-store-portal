/* Тест за номерата на клиентските заявки.
   Досега номерът се смяташе в браузъра (clientOrders.length+1) и се дублираше —
   883 от 908 заявки. Сега го раздава тригер в базата, пореден по обект
   ("Троян-0042"), а клиентът само го чете от отговора.

   Пускане от папката на репото:
     npm i -D jsdom
     node test-order-numbering.js
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

const ORDERS = [
  { id: 'a-1', in_num: 'Троян-0171', store_name: 'Троян', fulfiller: 'Габрово', status: 'pending',
    date: d(-1), hour: '10:00', customer_name: 'Иван Петров', phone: '0888111222',
    product: 'ПАРКЕТ', sap: '111', qty: 1, unit: 'бр.',
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 1, unit: 'бр.' }],
    delivery: d(5), created_at: new Date().toISOString(), group_id: null, note: '' },
  /* стара заявка с номер от преди поправката */
  { id: 'a-2', in_num: '0004', store_name: 'Троян', fulfiller: 'Враца', status: 'pending',
    date: d(-30), hour: '10:00', customer_name: 'Стар Клиент', phone: '0888999000',
    product: 'ВРАТА', sap: '222', qty: 1, unit: 'бр.',
    items: [{ product: 'ВРАТА', sap: '222', qty: 1, unit: 'бр.' }],
    delivery: d(-20), created_at: new Date().toISOString(), group_id: null, note: '' }
];

const USER = { email: 'troyan@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: 'Троян' };

function boot(opts) {
  opts = opts || {};
  const html = fs.readFileSync(DIR + 'index.html', 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.org/' });
  const w = dom.window;
  const calls = { get: [], post: [], patch: [], del: [], toast: [], postHeaders: [] };
  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = function () {};
  w.confirm = () => true;
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
    let created = null;
    if (method === 'POST') {
      const parsed = JSON.parse(init.body);
      calls.post.push({ url, body: parsed });
      calls.postHeaders.push(init.headers || {});
      if (/\/client_orders/.test(url)) {
        /* имитира тригера: пореден номер по обект */
        w.__seq = (w.__seq || 0) + 1;
        created = Object.assign({}, parsed, {
          in_num: (parsed.store_name || 'Обект') + '-' + String(w.__seq).padStart(4, '0')
        });
        if (opts.emptyResponse) created = null;
      } else {
        created = parsed;
      }
    }
    if (method === 'PATCH') calls.patch.push({ url, body: JSON.parse(init.body) });
    if (method === 'DELETE') calls.del.push(url);
    return Promise.resolve({
      ok: !opts.failPost,
      json: () => Promise.resolve(opts.failPost ? { message: 'boom' } : (created ? [created] : (method === 'POST' ? [] : {}))),
      text: () => Promise.resolve('')
    });
  };
  const load = f => w.eval(fs.readFileSync(DIR + f, 'utf8'));
  load('shared.js'); load('transport.js'); load('client-orders.js');
  load('history.js'); load('notifications.js');
  ['loadDocs', 'loadBulletin', 'loadKasa', 'loadAdmin', 'loadContacts', 'loadTransit', 'loadCalendar',
   'loadStockReturns', 'loadStockDiff', 'loadPallets', 'loadReference', 'loadTodayDashboard', 'loadHandbook']
    .forEach(fn => { if (typeof w[fn] !== 'function') w[fn] = () => {}; });
  w.currentUser = opts.user || USER;
  w.transportOrders = [];
  w.clientOrders = JSON.parse(JSON.stringify(opts.co || ORDERS));
  w.clientOrders.forEach(o => { o._status = w.calcStatus(o.delivery, o.status); o._days = w.calcElapsed(o.created_at); o._isFulfiller = false; });
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
const row = (doc, id) => doc.getElementById('co-row-' + id);
const tick = () => new Promise(r => setTimeout(r, 0));

function fillNewOrder(doc, name, phone, product) {
  doc.getElementById('c-name').value = name;
  doc.getElementById('c-phone').value = phone;
  doc.querySelector('#c-items .item-product').value = product;
}

(async function run() {

  /* ══════════ 1. Клиентът вече не измисля номер ══════════ */
  section('1. Номерът НЕ се смята в браузъра');
  {
    const { w, doc, calls } = boot();
    w.openClientModal();
    fillNewOrder(doc, 'Нов Клиент', '0899123456', 'ТЕСТ');
    realClick(w, btnOnly(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick(); await tick();
    const post = calls.post.find(p => /client_orders/.test(p.url));
    ok('прави се POST към client_orders', !!post);
    ok('НЯМА поле in_num в изпратените данни', post && !('in_num' in post.body), JSON.stringify(Object.keys(post ? post.body : {})));
    ok('id-то пак се генерира от клиента (за свързването)', post && /^[0-9a-f-]{36}$/.test(post.body.id));
    ok('магазинът се изпраща (базата брои по него)', post && post.body.store_name === 'Троян');
  }

  /* ══════════ 2. Номерът се чете от отговора ══════════ */
  section('2. Номерът идва от базата');
  {
    const { w, doc, calls } = boot();
    w.openClientModal();
    fillNewOrder(doc, 'Клиент Едно', '0899111111', 'СТОКА');
    realClick(w, btnOnly(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick(); await tick();
    ok('POST-ът иска отговор с реда (Prefer: return=representation)',
      calls.postHeaders.some(h => (h.Prefer || h.prefer) === 'return=representation'),
      JSON.stringify(calls.postHeaders));
    const sap = doc.getElementById('sap-ov');
    ok('SAP напомнянето показва номера от базата', sap && /Троян-0001/.test(sap.textContent), sap && sap.textContent.slice(0, 120));
  }
  {
    /* две последователни заявки → различни номера, без клиентът да брои */
    const { w, doc } = boot();
    w.openClientModal();
    fillNewOrder(doc, 'Клиент Едно', '0899111111', 'А');
    realClick(w, btnOnly(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick(); await tick();
    w.closeSapReminder();
    w.openClientModal();
    fillNewOrder(doc, 'Клиент Две', '0899222222', 'Б');
    realClick(w, btnOnly(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick(); await tick();
    const sap = doc.getElementById('sap-ov');
    ok('втората заявка получава следващия номер', sap && /Троян-0002/.test(sap.textContent), sap && sap.textContent.slice(0, 120));
  }

  /* ══════════ 3. Свързаният транспорт носи истинския номер ══════════ */
  section('3. Платен транспорт ползва номера от базата');
  {
    const { w, doc, calls } = boot();
    w.openClientModal();
    fillNewOrder(doc, 'Клиент Транспорт', '0899333333', 'ДИВАН');
    const cb = doc.getElementById('c-paid-transport'); cb.checked = true;
    w.eval('toggleClientPT()');
    doc.getElementById('c-pt-addr').value = 'гр. Троян, ул. Тестова 1';
    realClick(w, btnOnly(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick(); await tick(); await tick();
    const tr = calls.post.find(p => /transport_orders/.test(p.url));
    ok('транспортът е създаден', !!tr);
    ok('client_order_num е номерът от базата', tr && tr.body.client_order_num === 'Троян-0001', tr && tr.body.client_order_num);
    ok('бележката съдържа същия номер', tr && /№Троян-0001/.test(tr.body.notes || ''), tr && tr.body.notes);
  }

  /* ══════════ 4. Ако базата не върне ред — не се измисля номер ══════════ */
  section('4. Празен отговор — без измислен номер');
  {
    const { w, doc, calls } = boot({ emptyResponse: true });
    w.openClientModal();
    fillNewOrder(doc, 'Клиент Без Номер', '0899444444', 'НЕЩО');
    const cb = doc.getElementById('c-paid-transport'); cb.checked = true;
    w.eval('toggleClientPT()');
    doc.getElementById('c-pt-addr').value = 'гр. Троян, ул. Няма 1';
    realClick(w, btnOnly(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick(); await tick(); await tick();
    ok('заявката пак се записва', calls.post.some(p => /client_orders/.test(p.url)));
    const tr = calls.post.find(p => /transport_orders/.test(p.url));
    ok('client_order_num е null, а не измислен номер', tr && tr.body.client_order_num === null, tr && String(tr.body.client_order_num));
    const sap = doc.getElementById('sap-ov');
    ok('SAP напомнянето не показва фалшив номер', sap && !/Заявка №/.test(sap.textContent));
  }

  /* ══════════ 5. Провален запис ══════════ */
  section('5. Провален запис');
  {
    const { w, doc, calls } = boot({ failPost: true });
    w.openClientModal();
    fillNewOrder(doc, 'Клиент Провал', '0899555555', 'X');
    realClick(w, btnOnly(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await tick(); await tick(); await tick();
    ok('показва грешка', calls.toast.some(t => /Грешка при запис/.test(t)));
    ok('модалът остава отворен', doc.getElementById('client-modal').classList.contains('open'));
    ok('НЕ показва SAP напомняне след провал', !doc.getElementById('sap-ov'));
  }

  /* ══════════ 6. Търсене по номер ══════════ */
  section('6. Търсене по номер на заявката');
  {
    const { w, doc } = boot();
    doc.getElementById('co-search').value = 'троян-0171';
    w.renderClientOrders();
    ok('намира по пълния номер (без значение от регистъра)', !!row(doc, 'a-1') && !row(doc, 'a-2'));

    doc.getElementById('co-search').value = '0171';
    w.renderClientOrders();
    ok('намира и само по цифрите', !!row(doc, 'a-1'));

    doc.getElementById('co-search').value = '0004';
    w.renderClientOrders();
    ok('старите номера също се търсят', !!row(doc, 'a-2') && !row(doc, 'a-1'));

    doc.getElementById('co-search').value = '';
    w.renderClientOrders();
    ok('без търсене се виждат всички', !!row(doc, 'a-1') && !!row(doc, 'a-2'));
  }

  /* ══════════ 7. Показване ══════════ */
  section('7. Показване на дългия номер');
  {
    const { w, doc } = boot();
    w.renderClientOrders();
    const cell = row(doc, 'a-1').querySelector('td');
    ok('номерът се показва пълен', cell.textContent.indexOf('Троян-0171') >= 0);
    ok('клетката пренася на нов ред вместо да реже', /word-break/.test(cell.getAttribute('style') || ''), cell.getAttribute('style'));

    w.renderPrint(w.clientOrders.find(o => o.id === 'a-1'));
    ok('бланката показва пълния номер', doc.getElementById('mod-print').innerHTML.indexOf('Троян-0171') >= 0);
    ok('бланката вече не показва подразбиращо се "0001"',
      doc.getElementById('mod-print').innerHTML.indexOf('>0001<') < 0);
  }

  /* ══════════ 8. sbPostReturn ══════════ */
  section('8. Помощната функция sbPostReturn');
  {
    const { w } = boot();
    ok('съществува', typeof w.sbPostReturn === 'function');
    const r1 = await w.sbPostReturn('client_orders', { store_name: 'Троян', customer_name: 'X' });
    ok('връща ok при успех', r1.ok === true);
    ok('връща реда от масив', r1.row && r1.row.in_num === 'Троян-0001', JSON.stringify(r1.row));
    ok('sbPost остава непроменена (без ред в отговора)', typeof w.sbPost === 'function');
  }
  {
    const { w } = boot({ failPost: true });
    const r = await w.sbPostReturn('client_orders', { store_name: 'Троян' });
    ok('при грешка връща ok:false', r.ok === false);
    ok('и носи причината', !!r.error);
  }

  console.log('\n─────────────────────────────');
  console.log(pass + ' успешни, ' + fail + ' неуспешни');
  process.exit(fail ? 1 : 0);
})();
