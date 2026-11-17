/* Товарни листи: „📋 Дължими клиентски заявки" в редактора (етап 1, 17.11.2026).

   Само показване. Пази се тук:
     а) нов лист за склад Добрич → заявките на склада, групирани по обект, с брой;
     б) чужд изпълнител и статуси sent/arrived/done/refused не се показват —
        и самият низ на заявката носи fulfiller=eq.<склад> и not.in.(…);
     в) празен резултат → „Няма дължими клиентски заявки", блокът е на екрана;
     г) паднала заявка → червен toast + „не се заредиха", листът се записва;
     д) редакция на чернова → блокът е там;
     е) вход като обект → няма блок и няма заявка към client_orders;
     ж) <script> в клиент/артикул излиза ескейпнат;
     з) интеграционно: shared.js + client-orders.js + loading.js + transfers.js
        в реда от index.html; блокът е само четене (нула PATCH/POST към
        client_orders).
   Фикстурата ФИЛТРИРА по URL-а (fulfiller / status), както PostgREST — затова
   махнат филтър в кода вкарва чуждите редове на екрана.

   Мутационна проверка (17.11.2026, всеки мутант срещу този тест):
     1) махнат &fulfiller=eq.<склад> от заявката              → ПАДА (б)
     2) махнат &status=not.in.(…) от заявката                  → ПАДА (б)
     3) .catch поглъща грешката без llCoError / toast          → ПАДА (г)
     4) llCoBlockHtml() без esc() около етикета                → ПАДА (ж)
     5) без проверката llCanEdit() в llLoadClientOrders        → ОЦЕЛЯВА —
        еквивалентен: за обект llActiveWarehouse() е '' и заявка не тръгва и
        без нея; проверката е втора защита, (е) пази резултата.

   „➕" до заявката (сесия ll-co-add, 17.11.2026) — секции и)–т): реален клик
   попълва първата празна единица (обект + „КЗ <№> · артикул · SAP · к-во" в
   коментара на склада, без клиента), иначе нова; „✓ в листа" + disabled при
   вече добавена (и за редове от базата), точен номер, не префикс; обект
   извън листа → червен toast; запис само при „💾 Запази черновата".

   Мутационна проверка на „➕" (17.11.2026; пусната наново след етап 2), брой ❌ в скоби:
     1) без „вече в листа" в llCoAdd и без disabled            → ПАДА (10)
     1б) само без проверката в llCoAdd (бутонът пак disabled)  → ПАДА (5)
     2) сравнение по префикс вместо точен номер (стари редове) → ПАДА (1)
     3) sbPatch към client_orders при клика                     → ПАДА (1)
     4) без проверката „обектът е в списъка на листа"          → ПАДА (3)
     5) името на клиента в коментара                            → ПАДА (14)
     6) escVal() пак в полето за коментар (кавичка реже)        → ПАДА (1)
     7) без обновяване на блока при писане (стари редове)       → ПАДА (1)
     8) „➕" презаписва празна единица с ръчен коментар         → ПАДА (1)

   Етап 2 (сесия ll-co-link, 17.11.2026) — секции у)–ю): колоната
   loading_list_items.client_order_id. „➕" я слага на единицата, записът я
   пише на всичките ѝ редове (и null на редовете без заявка), редакцията я
   чете обратно (чип „🧾 КЗ <№>" + „✓ в листа"), „✕" маха само връзката;
   текстът в коментара не решава (освен за редове отпреди колоната);
   друг неприключен лист на склада → „✓ в лист от дд.мм (чернова|изпратен)";
   изпращане → „Изпратена" само за pending/processed/approved с изпълнител
   складът, + syncLinkedTransport; паднал PATCH → червен toast и червен ред
   с „🔁 Опитай пак" в изгледа, сметнат от базата.

   Мутационна проверка на етап 2 (17.11.2026), брой ❌ в скоби:
     1) без проверка на изпълнителя (llCoAutoSent)            → ПАДА (4)
     2) без проверка на статуса                               → ПАДА (5)
     3) погълнат провал на PATCH по заявката                  → ПАДА (1)
     4) връзката се губи при запис (llBuildItemRows)          → ПАДА (1)
     4б) връзката не минава през llDraftFlat                  → ПАДА (1)
     5) редакцията не чете колоната                           → ПАДА (4)
     6) текстът пак решава (не само за стари редове)          → ПАДА (4)
     7) блокът не гледа другите листи                         → ПАДА (3)
     8) паднала проверка за другите листи се мълчи            → ПАДА (2)
     9) червеният ред без проверка на изпълнителя             → ПАДА (1)
     10) „✕" не маха връзката                                → ПАДА (4)
     11) изтрита заявка = „няма какво"                       → ПАДА (1)
     12) изпращането не вика llCoAutoSent                     → ПАДА (12)
     13) без syncLinkedTransport                              → ПАДА (1)
     14) текущият лист се брои за „друг"                     → ПАДА (1)

   Пускане:  node tests/loading-client-orders.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, btn } = H;

const DOB = 'Логистичен склад Добрич';
const TG = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.dob@temax.bg', display_name: 'Склад Добрич',
                    role: 'sklad', store_name: DOB, assigned_stores: [] };
const STORE = { email: 'varna@temax.bg', display_name: 'Варна', role: 'store',
                store_name: 'Варна', assigned_stores: [] };
const NEW_ID = 'L-NEW';

const ORDERS = [
  { id: 'c1', in_num: '1001', store_name: 'Варна', customer_name: 'Иван Петров', status: 'pending',
    created_at: '2026-11-10T09:00:00+00:00', delivery: '2026-11-20', fulfiller: DOB,
    product: 'Диван ъглов', sap: '500123', qty: 1, unit: 'бр', items: null },
  { id: 'c2', in_num: '1002', store_name: 'Варна', customer_name: 'Мария', status: 'pending',
    created_at: '2026-11-11T09:00:00+00:00', delivery: null, fulfiller: DOB,
    product: null, sap: null, qty: null, unit: null,
    items: [{ product: 'Маса', sap: '700', qty: 2, unit: 'бр' }, { product: 'Стол', sap: '701', qty: 4, unit: 'бр' }] },
  { id: 'c3', in_num: '1003', store_name: 'Бургас', customer_name: 'Георги', status: 'pending',
    created_at: '2026-11-12T09:00:00+00:00', delivery: '2026-11-25', fulfiller: DOB,
    product: 'Гардероб', sap: '800', qty: 1, unit: 'бр', items: null },
  /* не трябва да се виждат */
  { id: 'x-tg', in_num: '9001', store_name: 'Варна', customer_name: 'ЧУЖД-СКЛАД', status: 'pending',
    created_at: '2026-11-12T09:00:00+00:00', delivery: null, fulfiller: TG, product: 'А', items: null },
  { id: 'x-sent', in_num: '9002', store_name: 'Варна', customer_name: 'СТАТУС-SENT', status: 'sent',
    created_at: '2026-11-12T09:00:00+00:00', delivery: null, fulfiller: DOB, product: 'А', items: null },
  { id: 'x-arr', in_num: '9003', store_name: 'Варна', customer_name: 'СТАТУС-ARRIVED', status: 'arrived',
    created_at: '2026-11-12T09:00:00+00:00', delivery: null, fulfiller: DOB, product: 'А', items: null },
  { id: 'x-done', in_num: '9004', store_name: 'Варна', customer_name: 'СТАТУС-DONE', status: 'done',
    created_at: '2026-11-12T09:00:00+00:00', delivery: null, fulfiller: DOB, product: 'А', items: null },
  { id: 'x-ref', in_num: '9005', store_name: 'Варна', customer_name: 'СТАТУС-REFUSED', status: 'refused',
    created_at: '2026-11-12T09:00:00+00:00', delivery: null, fulfiller: DOB, product: 'А', items: null }
];

/* PostgREST накратко: fulfiller=eq.X и status=not.in.(a,b) — колкото ползва кодът. */
function coRoute(rows) {
  return function (url) {
    const q = decodeURIComponent(String(url).split('?')[1] || '');
    let out = rows.slice();
    const f = /(?:^|&)fulfiller=eq\.([^&]*)/.exec(q);
    if (f) out = out.filter(r => r.fulfiller === f[1]);
    const ids = /(?:^|&)id=in\.\(([^)]*)\)/.exec(q);
    if (ids) { const want = ids[1].split(','); out = out.filter(r => want.indexOf(String(r.id)) >= 0); }
    const s = /(?:^|&)status=not\.in\.\(([^)]*)\)/.exec(q);
    if (s) { const ex = s[1].split(','); out = out.filter(r => ex.indexOf(r.status) < 0); }
    if (/order=store_name\.asc,created_at\.asc/.test(q))
      out.sort((a, b) => a.store_name.localeCompare(b.store_name, 'bg') || (a.created_at < b.created_at ? -1 : 1));
    const off = /(?:^|&)offset=(\d+)/.exec(q);
    return off && +off[1] > 0 ? [] : out;
  };
}

/* loading_list_items: list_id=eq / in, client_order_id=not.is.null и
   вграждането loading_lists!inner с филтри по склад и статус. */
function itemsRoute(items, lists) {
  return function (url) {
    const q = decodeURIComponent(String(url).split('?')[1] || '');
    let out = items.map(r => Object.assign({}, r));
    const le = /(?:^|&)list_id=eq\.([^&]*)/.exec(q);
    if (le) out = out.filter(r => r.list_id === le[1]);
    const li = /(?:^|&)list_id=in\.\(([^)]*)\)/.exec(q);
    if (li) { const w = li[1].split(','); out = out.filter(r => w.indexOf(r.list_id) >= 0); }
    if (/(?:^|&)client_order_id=not\.is\.null/.test(q)) out = out.filter(r => r.client_order_id);
    if (/loading_lists!inner/.test(q)) {
      const wh = /loading_lists\.warehouse=eq\.([^&]*)/.exec(q);
      const st = /loading_lists\.status=in\.\(([^)]*)\)/.exec(q);
      out = out.map(r => Object.assign(r, { loading_lists: lists.find(l => l.id === r.list_id) || null }))
        .filter(r => r.loading_lists && (!wh || r.loading_lists.warehouse === wh[1]) &&
          (!st || st[1].split(',').indexOf(r.loading_lists.status) >= 0));
    } else {
      out = out.map(r => Object.assign(r, { loading_list_products: [] }));
    }
    const off = /(?:^|&)offset=(\d+)/.exec(q);
    return off && +off[1] > 0 ? [] : out;
  };
}

const L_DRAFT = { id: 'L9', warehouse: DOB, list_date: '2026-11-16', status: 'draft',
                  executed_by: 'Иван', comment: '', created_at: 'x', sent_at: null, done_at: null };
const OLD_ITEMS = [
  { id: 'I1', list_id: 'L9', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 1,
    purchase_doc: 'ИЗХ-1', clears_doc: null, store_name: 'Варна', warehouse_comment: null,
    store_comment: null, partial: false, received: false, missing: false, created_at: 'x' }
];

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['client-orders.js', 'transport.js', 'bulletin.js', 'stock-returns.js',
              'stock-differences.js', 'loading.js', 'transfers.js'],
    user: opts.user || WAREHOUSE, confirm: true,
    data: {
      app_settings: [],
      client_orders: coRoute(opts.orders || ORDERS),
      loading_lists: opts.lists || [],
      loading_list_items: itemsRoute(opts.items || [], opts.lists || []),
      users: [{ store_name: 'Варна' }, { store_name: 'Бургас' }, { store_name: DOB }],
      loading_list_products: [], loading_list_photos: [], stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: [], goods_transit: []
    },
    fail: opts.fail
  });
  const inner = h.w.fetch;
  h.failSpec = opts.fail || null;
  h.w.fetch = function (url, init) {
    const m = ((init || {}).method || 'GET').toUpperCase();
    /* Записът „остава" във фикстурата — следващото четене го вижда, както
       в базата (статус на заявката, статус на листа). */
    if (m === 'PATCH' && /\/rest\/v1\/(client_orders|loading_lists)\?/.test(String(url))) {
      return inner(url, init).then(function (res) {
        if (res && res.ok) {
          const id = (/id=eq\.([^&]*)/.exec(String(url)) || [])[1];
          let body = {}; try { body = JSON.parse(init.body); } catch (e) {}
          const arr = /client_orders/.test(String(url)) ? (opts.orders || ORDERS) : (opts.lists || []);
          arr.forEach(r => { if (String(r.id) === decodeURIComponent(id || '')) Object.assign(r, body); });
        }
        return res;
      });
    }
    if (m === 'POST' && /\/rest\/v1\/loading_lists(\?|$)/.test(String(url))) {
      return inner(url, init).then(function () {
        let body = {}; try { body = JSON.parse(init.body); } catch (e) {}
        const row = Object.assign({ id: NEW_ID }, Array.isArray(body) ? body[0] : body);
        return { ok: true, status: 201, json: () => Promise.resolve([row]),
                 text: () => Promise.resolve(JSON.stringify([row])), headers: { get: () => null } };
      });
    }
    return inner(url, init);
  };
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: m, col: c }); return orig(m, c); };
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
const block = h => mod(h).querySelector('[data-ll-co]');
const coGets = h => h.calls.get.filter(u => /\/client_orders\?/.test(u));
async function settle() { for (let k = 0; k < 6; k++) await ticks(); }

(async function () {

  section('а) Нов лист, склад Добрич — заявките, групирани по обект');
  {
    const h = env();
    h.w.llNewList();
    await settle();
    const b = block(h);
    if (ok('блокът е на екрана', !!b)) {
      ok('заглавие с брой 3', /Дължими клиентски заявки \(3\)/.test(b.textContent), b.textContent.slice(0, 80));
      const st = Array.from(b.querySelectorAll('[data-ll-co-store]')).map(e => e.textContent);
      ok('две групи: Бургас (1), Варна (2)', JSON.stringify(st) === JSON.stringify(['Бургас (1)', 'Варна (2)']), JSON.stringify(st));
      ok('3 реда', b.querySelectorAll('[data-ll-co-row]').length === 3);
      const r1 = b.querySelector('[data-ll-co-row="c1"]');
      if (ok('ред c1', !!r1)) {
        const t = r1.textContent;
        ok('№ · клиент · артикул · SAP · к-во', t.indexOf('1001 · Иван Петров · Диван ъглов · SAP 500123 · 1 бр') >= 0, t);
        ok('дата на заявката 10.11.2026', t.indexOf('заявена 10.11.2026') >= 0, t);
        ok('дата на доставка 20.11.2026', t.indexOf('доставка 20.11.2026') >= 0, t);
      }
      const r2 = b.querySelector('[data-ll-co-row="c2"]');
      if (ok('ред c2', !!r2)) {
        ok('артикул от items + „+1 арт."', r2.textContent.indexOf('Маса · SAP 700 · 2 бр +1 арт.') >= 0, r2.textContent);
        ok('без доставка → „доставка —"', r2.textContent.indexOf('доставка —') >= 0, r2.textContent);
      }
      ok('над „📦 Редове"', !!mod(h).querySelector('tr[data-ll-unit]') &&
        !!(mod(h).querySelector('tr[data-ll-unit]').compareDocumentPosition(b) & 2));
      ok('без чекбокс/поле в блока', !b.querySelector('input,select,textarea'));
      ok('бутоните в блока са само „➕" — по един на заявка',
        b.querySelectorAll('button').length === 3 && b.querySelectorAll('button[data-ll-co-add]').length === 3);
    }
    ok('една заявка към client_orders', coGets(h).length === 1, JSON.stringify(coGets(h)));
  }

  section('б) Чужд склад и отминали статуси не се показват; низът на заявката');
  {
    const h = env();
    h.w.llNewList();
    await settle();
    const txt = block(h) ? block(h).textContent : '';
    ['ЧУЖД-СКЛАД', 'СТАТУС-SENT', 'СТАТУС-ARRIVED', 'СТАТУС-DONE', 'СТАТУС-REFUSED'].forEach(n =>
      ok('няма ' + n, txt.indexOf(n) < 0, txt.slice(0, 200)));
    const u = decodeURIComponent(coGets(h)[0] || '');
    ok('fulfiller=eq.' + DOB, u.indexOf('fulfiller=eq.' + DOB) >= 0, u);
    ok('status=not.in.(sent,arrived,done,refused)', u.indexOf('status=not.in.(sent,arrived,done,refused)') >= 0, u);
    ok('order=store_name.asc,created_at.asc', u.indexOf('order=store_name.asc,created_at.asc') >= 0, u);
    ok('select носи delivery и items', /select=[^&]*delivery/.test(u) && /select=[^&]*items/.test(u), u);
  }

  section('в) Празен резултат → „Няма дължими клиентски заявки"');
  {
    const h = env({ orders: [] });
    h.w.llNewList();
    await settle();
    const b = block(h);
    if (ok('блокът е на екрана', !!b)) {
      ok('текстът „Няма дължими клиентски заявки"', !!b.querySelector('[data-ll-co-empty]') &&
        b.textContent.indexOf('Няма дължими клиентски заявки') >= 0, b.textContent);
      ok('без текст за грешка', !b.querySelector('[data-ll-co-error]'));
    }
    ok('без червен toast', !h.toasts.some(t => t.col === '#dc2626'), JSON.stringify(h.toasts));
  }

  section('г) Паднала заявка → червен toast + „не се заредиха"; листът се записва');
  {
    const h = env({ fail: { GET: /client_orders/ } });
    h.w.llNewList();
    await settle();
    const b = block(h);
    if (ok('блокът е на екрана', !!b)) {
      ok('„Клиентските заявки не се заредиха"', !!b.querySelector('[data-ll-co-error]') &&
        b.textContent.indexOf('Клиентските заявки не се заредиха') >= 0, b.textContent);
      ok('НЕ „Няма дължими"', b.textContent.indexOf('Няма дължими') < 0, b.textContent);
    }
    ok('червен toast за заявките', h.toasts.some(t => t.col === '#dc2626' && /Клиентските заявки/.test(t.msg)), JSON.stringify(h.toasts));
    ok('редакторът е там (30 реда)', mod(h).querySelectorAll('tr[data-ll-unit]').length === 30);
    h.w.llDraft.units[0].store_name = 'Варна';
    h.w.llDraft.units[0].docs = ['ИЗХ-5'];
    realClick(h.w, btn(mod(h), 'Запази черновата'));
    await settle();
    const ip = h.calls.post.filter(p => /loading_list_items/.test(p.url));
    ok('записът на листа минава', h.calls.post.some(p => p.table === 'loading_lists') && ip.length === 1,
      JSON.stringify(h.calls.post.map(p => p.table)));
  }

  section('д) Редакция на чернова — блокът е там');
  {
    const h = env({ lists: [L_DRAFT], items: OLD_ITEMS });
    h.w.loadLoadingLists();
    await settle();
    h.w.llOpenEdit('L9');
    await settle();
    ok('редакторът е отворен', h.w.llView === 'edit' && /Редакция на товарен лист/.test(mod(h).textContent));
    const b = block(h);
    ok('блокът е там с 3 заявки', !!b && b.querySelectorAll('[data-ll-co-row]').length === 3,
      b ? b.textContent.slice(0, 120) : 'няма');
  }

  section('е) Вход като обект — няма блок, няма заявка към client_orders');
  {
    const h = env({ user: STORE, lists: [Object.assign({}, L_DRAFT, { status: 'sent' })], items: OLD_ITEMS });
    h.w.loadLoadingLists();
    await settle();
    ok('няма блок', !block(h));
    ok('няма „Дължими клиентски заявки" в текста', mod(h).textContent.indexOf('Дължими клиентски заявки') < 0);
    /* Дори при пряко извикване на зареждането — заявка не тръгва. */
    h.w.llLoadEditorData();
    await settle();
    ok('нула GET към client_orders', coGets(h).length === 0, JSON.stringify(coGets(h)));
  }

  section('ж) <script> в име на клиент / артикул — ескейпнат');
  {
    const evil = [{ id: 'e1', in_num: '66', store_name: 'Варна<b>x</b>', customer_name: '<script>alert(1)</script>',
                    status: 'pending', created_at: '2026-11-12T09:00:00+00:00', delivery: null, fulfiller: DOB,
                    product: '<img src=x onerror=alert(2)>', sap: '1', qty: 1, unit: 'бр', items: null }];
    const h = env({ orders: evil });
    h.w.llNewList();
    await settle();
    const b = block(h);
    if (ok('блокът е там', !!b)) {
      ok('няма <script> елемент', !b.querySelector('script'));
      ok('няма <img> елемент', !b.querySelector('img'));
      ok('няма <b> елемент от името на обекта', !b.querySelector('b'));
      ok('текстът стои буквално', b.textContent.indexOf('<script>alert(1)</script>') >= 0 &&
        b.textContent.indexOf('<img src=x onerror=alert(2)>') >= 0, b.textContent);
    }
  }

  section('з) Интеграционно: заедно с transfers.js; само четене');
  {
    const h = env();
    ok('tfCoLabel и llCoLabel съществуват', typeof h.w.tfCoLabel === 'function' && typeof h.w.llCoLabel === 'function');
    ORDERS.slice(0, 3).forEach(o =>
      ok('llCoLabel = tfCoLabel за ' + o.id, h.w.llCoLabel(o) === h.w.tfCoLabel(o), h.w.llCoLabel(o) + ' | ' + h.w.tfCoLabel(o)));
    h.w.llNewList();
    await settle();
    ok('блокът е там', !!block(h));
    ok('нула PATCH/POST към client_orders',
      !h.calls.patch.some(p => /client_orders/.test(p.url)) && !h.calls.post.some(p => /client_orders/.test(p.url)));
    ok('без notOk заявки', h.calls.notOk.length === 0, JSON.stringify(h.calls.notOk));
  }

  /* ─── „➕" (сесия ll-co-add, 17.11.2026) ─────────────────────────── */
  const addBtn = (h, id) => mod(h).querySelector('[data-ll-co-add="' + id + '"]');
  const coRow = (h, id) => mod(h).querySelector('[data-ll-co-row="' + id + '"]');
  const filled = h => h.w.llDraft.units.filter(u => !h.w.llBlankRow(u));
  const coWrites = h => h.calls.patch.concat(h.calls.post).filter(p => /client_orders/.test(p.url));

  section('и) „➕" при нов лист — първата празна единица, броят не расте');
  {
    const h = env();
    h.w.llNewList();
    await settle();
    const before = h.w.llDraft.units.length;
    const b1 = addBtn(h, 'c1');
    if (ok('бутон „➕" с title „Добави в листа"', !!b1 && b1.tagName === 'BUTTON' && b1.title === 'Добави в листа')) {
      realClick(h.w, b1);
      await ticks();
      const u0 = h.w.llDraft.units[0];
      ok('единица 0 получава обекта Варна', u0.store_name === 'Варна', u0.store_name);
      ok('коментар „КЗ 1001 · Диван ъглов · SAP 500123 · 1 бр"',
        u0.warehouse_comment === 'КЗ 1001 · Диван ъглов · SAP 500123 · 1 бр', JSON.stringify(u0.warehouse_comment));
      ok('без името на клиента', String(u0.warehouse_comment).indexOf('Иван Петров') < 0);
      ok('видът е по подразбиране (палет), с № 1', u0.kind === 'pallet' && u0.pallet_no === 1, u0.kind + ' ' + u0.pallet_no);
      ok('броят единици не расте', h.w.llDraft.units.length === before, String(h.w.llDraft.units.length));
      ok('една попълнена единица', filled(h).length === 1);
      ok('toast „Добавена: КЗ 1001 → Варна"', h.toasts.some(t => t.msg === 'Добавена: КЗ 1001 → Варна'), JSON.stringify(h.toasts));
      const inp = mod(h).querySelector('#ll-wc-0');
      ok('полето за коментар показва текста', !!inp && inp.value === 'КЗ 1001 · Диван ъглов · SAP 500123 · 1 бр', inp && inp.value);
      ok('нищо не е записано в базата при клика', h.calls.post.length === 0 && h.calls.patch.length === 0,
        JSON.stringify(h.calls.post.concat(h.calls.patch).map(p => p.table)));
    }

    section('й) втори клик на същата заявка — без втори ред; „✓ в листа", disabled, в DOM-а');
    const b1b = addBtn(h, 'c1');
    ok('редът е „✓ в листа"', !!coRow(h, 'c1').querySelector('[data-ll-co-check]') && /✓ в листа/.test(coRow(h, 'c1').textContent));
    ok('бутонът е в DOM-а и е disabled', !!b1b && b1b.disabled === true);
    h.w.llCoAdd('c1');
    await ticks();
    ok('пак една попълнена единица', filled(h).length === 1, String(filled(h).length));

    section('к) две заявки на един обект → два отделни реда');
    realClick(h.w, addBtn(h, 'c2'));
    await ticks();
    const varna = h.w.llDraft.units.filter(u => u.store_name === 'Варна');
    ok('два реда за Варна', varna.length === 2, String(varna.length));
    ok('вторият е палет № 2', varna[1].pallet_no === 2, String(varna[1].pallet_no));
    ok('коментар от items: „КЗ 1002 · Маса · SAP 700 · 2 бр +1 арт."',
      varna[1].warehouse_comment === 'КЗ 1002 · Маса · SAP 700 · 2 бр +1 арт.', varna[1].warehouse_comment);
    ok('без името „Мария"', varna[1].warehouse_comment.indexOf('Мария') < 0);

    section('л) изтрит коментар / махнат ред → отметката изчезва');
    const i2 = h.w.llDraft.units.indexOf(varna[1]);
    const wc = mod(h).querySelector('#ll-wc-' + i2);
    wc.value = '';
    H.fire(h.w, wc, 'input');
    /* Етап 2: текстът не решава — изтрит коментар НЕ маха връзката. */
    ok('изтрит коментар → c2 остава „✓", бутонът е disabled (връзката е в колоната)',
      !!coRow(h, 'c2').querySelector('[data-ll-co-check]') && addBtn(h, 'c2').disabled === true);
    ok('връзката на единицата е непокътната', varna[1].client_order_id === 'c2', String(varna[1].client_order_id));
    ok('полето още е на екрана (без пълно прерисуване)', mod(h).querySelector('#ll-wc-' + i2) === wc);
    realClick(h.w, mod(h).querySelector('button[onclick^="llRemoveRow"][data-i="' + h.w.llDraft.units.indexOf(varna[0]) + '"]'));
    await ticks();
    ok('махнат ред → c1 без „✓"', !coRow(h, 'c1').querySelector('[data-ll-co-check]') && addBtn(h, 'c1').disabled === false);
  }

  section('м) лист без празни единици → добавя се нова');
  {
    const h = env();
    h.w.llNewList();
    await settle();
    h.w.llDraft.units = [Object.assign(h.w.llBlankUnit(), { store_name: 'Бургас', pallet_no: 1 }),
                         Object.assign(h.w.llBlankUnit(), { warehouse_comment: 'чужд коментар' })];
    h.w.renderLoadingLists();
    realClick(h.w, addBtn(h, 'c1'));
    await ticks();
    ok('3 единици (нова в края)', h.w.llDraft.units.length === 3, String(h.w.llDraft.units.length));
    ok('новата е за Варна с „КЗ 1001"', h.w.llDraft.units[2].store_name === 'Варна' &&
      /^КЗ 1001 /.test(h.w.llDraft.units[2].warehouse_comment));
    ok('единицата с ръчен коментар не е презаписана', h.w.llDraft.units[1].warehouse_comment === 'чужд коментар');
  }

  section('н) „💾 Запази черновата" след „➕" → редът е в POST-а; client_orders не се пипа');
  {
    const h = env();
    h.w.llNewList();
    await settle();
    realClick(h.w, addBtn(h, 'c3'));
    await ticks();
    realClick(h.w, btn(mod(h), 'Запази черновата'));
    await settle();
    const ip = h.calls.post.filter(p => /loading_list_items/.test(p.url));
    if (ok('един POST към loading_list_items', ip.length === 1, JSON.stringify(h.calls.post.map(p => p.table)))) {
      const r = ip[0].body.find(x => x.store_name === 'Бургас');
      ok('ред Бургас с „КЗ 1003 · Гардероб · SAP 800 · 1 бр"',
        !!r && r.warehouse_comment === 'КЗ 1003 · Гардероб · SAP 800 · 1 бр', JSON.stringify(ip[0].body));
    }
    ok('нула PATCH/POST към client_orders', coWrites(h).length === 0, JSON.stringify(coWrites(h)));
  }

  section('о) редакция на чернова: стар ред (отпреди колоната) с „КЗ 1001" → отметката излиза по текста');
  {
    const items = [Object.assign({}, OLD_ITEMS[0], { warehouse_comment: 'КЗ 1001 · Диван ъглов · SAP 500123 · 1 бр',
                                                     created_at: '2026-11-10T09:00:00+00:00' })];
    const h = env({ lists: [L_DRAFT], items });
    h.w.loadLoadingLists();
    await settle();
    h.w.llOpenEdit('L9');
    await settle();
    ok('c1 е „✓ в листа"', !!coRow(h, 'c1') && !!coRow(h, 'c1').querySelector('[data-ll-co-check]'));
    ok('c1 „➕" е disabled', !!addBtn(h, 'c1') && addBtn(h, 'c1').disabled === true);
    ok('c3 не е отметната', !coRow(h, 'c3').querySelector('[data-ll-co-check]') && addBtn(h, 'c3').disabled === false);
    /* Стар ред: текстът решава — изтриването му маха отметката веднага (блокът
       се обновява при писане, полето пази фокуса). */
    const wc0 = mod(h).querySelector('#ll-wc-0');
    wc0.value = '';
    H.fire(h.w, wc0, 'input');
    ok('стар ред: изтрит „КЗ 1001" → c1 без „✓", „➕" активен', !coRow(h, 'c1').querySelector('[data-ll-co-check]') &&
      addBtn(h, 'c1').disabled === false);
    ok('полето още е на екрана', mod(h).querySelector('#ll-wc-0') === wc0);
  }
  {
    /* Ред СЛЕД колоната, без връзка, само с текст (напр. махната с „✕") — НЕ. */
    const items = [Object.assign({}, OLD_ITEMS[0], { warehouse_comment: 'КЗ 1001 · Диван ъглов · SAP 500123 · 1 бр',
                                                     created_at: '2026-11-17T15:00:00+00:00', client_order_id: null })];
    const h = env({ lists: [L_DRAFT], items });
    h.w.loadLoadingLists();
    await settle();
    h.w.llOpenEdit('L9');
    await settle();
    ok('нов ред само с текст „КЗ 1001" → c1 НЕ е „✓"', !!coRow(h, 'c1') && !coRow(h, 'c1').querySelector('[data-ll-co-check]') &&
      addBtn(h, 'c1').disabled === false);
  }

  section('п) префикс на номера не дава фалшива отметка');
  {
    const PFX = [
      { id: 'p36', in_num: 'Петрич-036', store_name: 'Варна', customer_name: 'А', status: 'pending',
        created_at: '2026-11-12T09:00:00+00:00', delivery: null, fulfiller: DOB, product: 'Лампа', sap: '1', qty: 1, unit: 'бр', items: null },
      { id: 'p368', in_num: 'Петрич-0368', store_name: 'Варна', customer_name: 'Б', status: 'pending',
        created_at: '2026-11-12T10:00:00+00:00', delivery: null, fulfiller: DOB, product: 'Килим', sap: '2', qty: 1, unit: 'бр', items: null }
    ];
    const h = env({ orders: PFX });
    h.w.llNewList();
    await settle();
    realClick(h.w, addBtn(h, 'p368'));
    await ticks();
    ok('Петрич-0368 е „✓"', !!coRow(h, 'p368').querySelector('[data-ll-co-check]'));
    ok('Петрич-036 НЕ е „✓"', !coRow(h, 'p36').querySelector('[data-ll-co-check]') && addBtn(h, 'p36').disabled === false);
    realClick(h.w, addBtn(h, 'p36'));
    await ticks();
    ok('и Петрич-036 се добавя като отделен ред', h.w.llDraft.units.filter(u => u.store_name === 'Варна').length === 2);
    h.w.llDraft.units.forEach(u => { u.warehouse_comment = ''; u.client_order_id = null; });
    h.w.llDraft.units[0].warehouse_comment = 'виж КЗ Петрич-0368, спешно';
    ok('нова единица само с текст → не се брои', h.w.llCoInDraft(PFX[1]) === false);
    h.w.llDraft.units[0]._coLegacy = true; /* единица от редове отпреди колоната */
    ok('„КЗ Петрич-0368," в текст → 0368 да, 036 не', h.w.llCoInDraft(PFX[1]) === true && h.w.llCoInDraft(PFX[0]) === false);
  }

  section('р) обект извън списъка на листа → червен toast, нищо не се добавя');
  {
    const ALIEN = [{ id: 'al', in_num: '777', store_name: 'Несъществуващ', customer_name: 'А', status: 'pending',
      created_at: '2026-11-12T09:00:00+00:00', delivery: null, fulfiller: DOB, product: 'Х', sap: '1', qty: 1, unit: 'бр', items: null }];
    const h = env({ orders: ALIEN });
    h.w.llNewList();
    await settle();
    const n0 = h.w.llDraft.units.length;
    realClick(h.w, addBtn(h, 'al'));
    await ticks();
    ok('червен toast', h.toasts.some(t => t.col === '#dc2626' && /Несъществуващ/.test(t.msg)), JSON.stringify(h.toasts));
    ok('нищо не е добавено', filled(h).length === 0 && h.w.llDraft.units.length === n0);
    ok('без „Добавена"', !h.toasts.some(t => /^Добавена/.test(t.msg)));
  }

  section('с) <script> / кавичка в номер и артикул — ескейпнати в блока и в полето');
  {
    const EV = [{ id: 'ev', in_num: '<script>x()</script>', store_name: 'Варна', customer_name: 'К', status: 'pending',
      created_at: '2026-11-12T09:00:00+00:00', delivery: null, fulfiller: DOB,
      product: 'Маса "Лукс" \'2\' <img src=x onerror=y()>', sap: '9', qty: 1, unit: 'бр', items: null }];
    const h = env({ orders: EV });
    h.w.llNewList();
    await settle();
    const b = addBtn(h, 'ev');
    ok('бутонът е цял (data-co = id)', !!b && b.dataset.co === 'ev' && b.title === 'Добави в листа');
    realClick(h.w, b);
    await ticks();
    ok('няма <script>/<img> в модула', !mod(h).querySelector('script') && !mod(h).querySelector('img'));
    const want = 'КЗ <script>x()</script> · Маса "Лукс" \'2\' <img src=x onerror=y()> · SAP 9 · 1 бр';
    ok('коментарът в данните е буквален', h.w.llDraft.units[0].warehouse_comment === want, h.w.llDraft.units[0].warehouse_comment);
    const inp = mod(h).querySelector('#ll-wc-0');
    ok('полето показва буквалния текст', !!inp && inp.value === want, inp && inp.value);
    ok('редът в блока е „✓ в листа"', !!coRow(h, 'ev').querySelector('[data-ll-co-check]'));
  }

  section('т) стар запис без items, празни полета → смислен коментар без „—"/„undefined"');
  {
    const OLD = [
      { id: 'o1', in_num: 'Шумен-0240', store_name: 'Варна', customer_name: 'Клиент Стоянов', status: 'pending',
        created_at: '2026-11-12T09:00:00+00:00', delivery: null, fulfiller: DOB, product: 'Матрак', sap: null, qty: null, unit: null },
      { id: 'o2', in_num: 'Шумен-0241', store_name: 'Варна', customer_name: 'Клиент Димова', status: 'pending',
        created_at: '2026-11-12T10:00:00+00:00', delivery: null, fulfiller: DOB, product: '—', sap: '', qty: 3, unit: undefined, items: [] }
    ];
    const h = env({ orders: OLD });
    ok('o1 → „КЗ Шумен-0240 · Матрак"', h.w.llCoComment(OLD[0]) === 'КЗ Шумен-0240 · Матрак', h.w.llCoComment(OLD[0]));
    ok('o2 → „КЗ Шумен-0241 · 3"', h.w.llCoComment(OLD[1]) === 'КЗ Шумен-0241 · 3', h.w.llCoComment(OLD[1]));
    [OLD[0], OLD[1], ORDERS[0], ORDERS[1]].forEach(o => {
      const c = h.w.llCoComment(o);
      ok('без —/undefined/null: ' + o.id, !/—|undefined|null/.test(c), c);
      ok('без името на клиента: ' + o.id, c.indexOf(o.customer_name) < 0, c);
    });
  }

  /* ─── Етап 2: връзка ред ↔ заявка (сесия ll-co-link, 17.11.2026) ─── */
  const clone = a => JSON.parse(JSON.stringify(a));
  const itemPosts = h => h.calls.post.filter(p => /loading_list_items/.test(p.url));
  const itemPatches = h => h.calls.patch.filter(p => /loading_list_items/.test(p.url));
  const coPatches = h => h.calls.patch.filter(p => /client_orders/.test(p.url));
  const NEW_AT = '2026-11-17T15:00:00+00:00';

  section('у) „➕" → единицата носи client_order_id; „💾 Запази" → POST-ът го носи, редът без заявка — null');
  {
    const h = env({ orders: clone(ORDERS) });
    h.w.llNewList();
    await settle();
    realClick(h.w, addBtn(h, 'c1'));
    await ticks();
    ok('единица 0 → client_order_id c1', h.w.llDraft.units[0].client_order_id === 'c1', String(h.w.llDraft.units[0].client_order_id));
    ok('чип „🧾 КЗ 1001" в редактора', !!mod(h).querySelector('[data-ll-co-chip="0"]') &&
      /🧾 КЗ 1001/.test(mod(h).querySelector('[data-ll-co-chip="0"]').textContent));
    /* единица с ДВА документа + свободен ред без заявка */
    h.w.llDraft.units[0].docs = ['ИЗХ-A', 'ИЗХ-B'];
    Object.assign(h.w.llDraft.units[1], { store_name: 'Бургас', docs: ['ИЗХ-C'] });
    h.w.renderLoadingLists();
    realClick(h.w, btn(mod(h), 'Запази черновата'));
    await settle();
    const ip = itemPosts(h);
    if (ok('един POST към loading_list_items', ip.length === 1, JSON.stringify(h.calls.post.map(p => p.table)))) {
      const rows = ip[0].body;
      const varna = rows.filter(r => r.store_name === 'Варна');
      ok('единицата с 2 документа → 2 реда, И ДВАТА с c1', varna.length === 2 && varna.every(r => r.client_order_id === 'c1'),
        JSON.stringify(varna.map(r => [r.purchase_doc, r.client_order_id])));
      const bg = rows.filter(r => r.store_name === 'Бургас');
      ok('редът без заявка праща client_order_id: null (ключът е там)', bg.length === 1 &&
        Object.prototype.hasOwnProperty.call(bg[0], 'client_order_id') && bg[0].client_order_id === null, JSON.stringify(bg));
    }
    ok('нула записи към client_orders при запис на черновата', coWrites(h).length === 0, JSON.stringify(coWrites(h)));
  }

  section('ф) редакция на чернова → чипът и „✓ в листа" идват от колоната; „✕" маха само връзката');
  {
    const items = [Object.assign({}, OLD_ITEMS[0], { warehouse_comment: 'Ръчен текст без номер', created_at: NEW_AT, client_order_id: 'c1' }),
                   Object.assign({}, OLD_ITEMS[0], { id: 'I1b', position: 2, purchase_doc: 'ИЗХ-2', created_at: NEW_AT, client_order_id: 'c1' })];
    const h = env({ lists: [Object.assign({}, L_DRAFT)], items, orders: clone(ORDERS) });
    h.w.loadLoadingLists();
    await settle();
    h.w.llOpenEdit('L9');
    await settle();
    const u = h.w.llDraft.units[0];
    ok('единицата е една (палет 1 с 2 документа) и носи c1', h.w.llDraft.units.length === 1 && u.client_order_id === 'c1' &&
      u.docs.length === 2, JSON.stringify(h.w.llDraft.units.map(x => [x.docs, x.client_order_id])));
    const chip = mod(h).querySelector('[data-ll-co-chip="0"]');
    ok('чип „🧾 КЗ 1001" (номерът от блока)', !!chip && /🧾 КЗ 1001/.test(chip.textContent), chip && chip.textContent);
    ok('c1 е „✓ в листа" и „➕" disabled — без „КЗ" в текста', !!coRow(h, 'c1').querySelector('[data-ll-co-check="1"]') &&
      addBtn(h, 'c1').disabled === true);
    const x = mod(h).querySelector('[data-ll-co-unlink="0"]');
    ok('„✕" е истински <button>', !!x && x.tagName === 'BUTTON');
    realClick(h.w, x);
    await ticks();
    ok('„✕" → връзката пада', h.w.llDraft.units[0].client_order_id === null);
    ok('„✕" → коментарът остава', h.w.llDraft.units[0].warehouse_comment === 'Ръчен текст без номер');
    ok('„✕" → чипът изчезва, „➕" на c1 е активен', !mod(h).querySelector('[data-ll-co-chip]') && addBtn(h, 'c1').disabled === false &&
      !coRow(h, 'c1').querySelector('[data-ll-co-check]'));
    realClick(h.w, btn(mod(h), 'Запази черновата'));
    await settle();
    const ps = itemPatches(h);
    ok('записът PATCH-ва и двата реда с client_order_id: null', ps.length === 2 &&
      ps.every(p => Object.prototype.hasOwnProperty.call(p.body, 'client_order_id') && p.body.client_order_id === null),
      JSON.stringify(ps.map(p => [p.url.slice(-12), p.body.client_order_id])));
  }

  section('х) „✕" при ред с „КЗ <№>" в текста — „➕" пак е активен (текстът не връща отметката)');
  {
    const h = env({ orders: clone(ORDERS) });
    h.w.llNewList();
    await settle();
    realClick(h.w, addBtn(h, 'c3'));
    await ticks();
    realClick(h.w, mod(h).querySelector('[data-ll-co-unlink="0"]'));
    await ticks();
    ok('коментарът „КЗ 1003 …" стои', /^КЗ 1003 /.test(h.w.llDraft.units[0].warehouse_comment));
    ok('c3 не е „✓", „➕" е активен', !coRow(h, 'c3').querySelector('[data-ll-co-check]') && addBtn(h, 'c3').disabled === false);
    realClick(h.w, addBtn(h, 'c3'));
    await ticks();
    ok('нов клик → връзката се слага пак (в нова/празна единица)', h.w.llDraft.units.some(x => x.client_order_id === 'c3'));
  }

  section('ц) заявка в друг неприключен лист на склада → „✓ в лист от …"; приключен лист не блокира');
  {
    const lists = [Object.assign({}, L_DRAFT, { id: 'L8', list_date: '2026-11-15', status: 'draft' }),
                   Object.assign({}, L_DRAFT, { id: 'L7', list_date: '2026-11-14', status: 'sent' }),
                   Object.assign({}, L_DRAFT, { id: 'L6', list_date: '2026-11-13', status: 'done' }),
                   Object.assign({}, L_DRAFT, { id: 'LT', list_date: '2026-11-13', status: 'draft', warehouse: TG })];
    const mk = (id, list, co) => Object.assign({}, OLD_ITEMS[0], { id, list_id: list, created_at: NEW_AT, client_order_id: co });
    const items = [mk('a', 'L8', 'c1'), mk('b', 'L7', 'c2'), mk('c', 'L6', 'c3'), mk('d', 'LT', 'c3')];
    const h = env({ lists, items, orders: clone(ORDERS) });
    h.w.llNewList();
    await settle();
    const r1 = coRow(h, 'c1'), r2 = coRow(h, 'c2'), r3 = coRow(h, 'c3');
    ok('c1 → „✓ в лист от 15.11 (чернова)"', /✓ в лист от 15\.11 \(чернова\)/.test(r1.textContent), r1.textContent);
    ok('c2 → „✓ в лист от 14.11 (изпратен)"', /✓ в лист от 14\.11 \(изпратен\)/.test(r2.textContent), r2.textContent);
    ok('c1 и c2: „➕" е в DOM-а и disabled', addBtn(h, 'c1').disabled === true && addBtn(h, 'c2').disabled === true);
    ok('c3 (само в приключен лист и в лист на ДРУГ склад) — активен, без отметка',
      addBtn(h, 'c3').disabled === false && !r3.querySelector('[data-ll-co-check]'), r3.textContent);
    h.w.llCoAdd('c1');
    await ticks();
    ok('пряко llCoAdd на c1 → нищо не се добавя', filled(h).length === 0);
    const g = h.calls.get.filter(u => /loading_list_items\?/.test(u) && /loading_lists!inner/.test(u));
    ok('ЕДНА заявка за редовете на другите листи (вграждане, склад, статуси)', g.length === 1 &&
      decodeURIComponent(g[0]).indexOf('loading_lists.warehouse=eq.' + DOB) >= 0 &&
      decodeURIComponent(g[0]).indexOf('loading_lists.status=in.(draft,sent,partial)') >= 0 &&
      /limit=1000&offset=0/.test(g[0]), JSON.stringify(g));
  }

  section('ч) текущата чернова не се брои за „друг лист"');
  {
    const lists = [Object.assign({}, L_DRAFT)];
    const items = [Object.assign({}, OLD_ITEMS[0], { created_at: NEW_AT, client_order_id: 'c1' })];
    const h = env({ lists, items, orders: clone(ORDERS) });
    h.w.loadLoadingLists();
    await settle();
    h.w.llOpenEdit('L9');
    await settle();
    ok('c1 е „✓ в листа", не „в лист от"', /✓ в листа/.test(coRow(h, 'c1').textContent) && !/в лист от/.test(coRow(h, 'c1').textContent),
      coRow(h, 'c1').textContent);
  }

  section('ш) паднала проверка за другите листи → блокът го казва, „➕" е активен');
  {
    const lists = [Object.assign({}, L_DRAFT, { id: 'L8', list_date: '2026-11-15', status: 'draft' })];
    const items = [Object.assign({}, OLD_ITEMS[0], { id: 'a', list_id: 'L8', created_at: NEW_AT, client_order_id: 'c1' })];
    const h = env({ lists, items, orders: clone(ORDERS), fail: { GET: /loading_lists!inner/ } });
    h.w.llNewList();
    await settle();
    const b = block(h);
    ok('„Проверката … НЕ мина" в блока', !!b.querySelector('[data-ll-co-other-error]'), b.textContent.slice(0, 200));
    ok('c1 „➕" е активен (не се твърди нищо)', addBtn(h, 'c1').disabled === false && !coRow(h, 'c1').querySelector('[data-ll-co-check]'));
    ok('червен toast', h.toasts.some(t => t.col === '#dc2626' && /друг лист/.test(t.msg)), JSON.stringify(h.toasts));
  }

  /* ── изпращане ── */
  const SEND_ORDERS = () => [
    { id: 'c1', in_num: '1001', store_name: 'Варна', status: 'pending', fulfiller: DOB, paid_transport: true, transport_id: 'T1' },
    { id: 'cp', in_num: '1010', store_name: 'Варна', status: 'processed', fulfiller: ' логистичен склад добрич ', paid_transport: false },
    { id: 'ca', in_num: '1011', store_name: 'Варна', status: 'approved', fulfiller: DOB },
    { id: 'cs', in_num: '1012', store_name: 'Варна', status: 'sent', fulfiller: DOB },
    { id: 'cr', in_num: '1013', store_name: 'Варна', status: 'arrived', fulfiller: DOB },
    { id: 'cd', in_num: '1014', store_name: 'Варна', status: 'done', fulfiller: DOB },
    { id: 'cf', in_num: '1015', store_name: 'Варна', status: 'refused', fulfiller: DOB },
    { id: 'cq', in_num: '1016', store_name: 'Варна', status: 'postponed', fulfiller: DOB },
    { id: 'cx', in_num: '1017', store_name: 'Варна', status: 'pending', fulfiller: TG }
  ];
  async function sendEnv(links, extra) {
    extra = extra || {};
    const lists = [Object.assign({}, L_DRAFT, extra.list || {})];
    const items = links.map((cid, k) => Object.assign({}, OLD_ITEMS[0], {
      id: 'S' + k, position: k + 1, pallet_no: k + 1, purchase_doc: 'ИЗХ-' + k, created_at: NEW_AT, client_order_id: cid }));
    const h = env(Object.assign({ lists, items, orders: extra.orders || SEND_ORDERS() }, extra.env || {}));
    h.w.LL_PHOTO_MIN = 0;
    h.sync = [];
    h.w.syncLinkedTransport = function (id, st, row) { h.sync.push([id, st, row && row.id]); return Promise.resolve(true); };
    h.w.loadLoadingLists();
    await settle();
    h.w.llOpenView('L9');
    await settle();
    return h;
  }
  const lastToast = h => (h.toasts[h.toasts.length - 1] || {});

  section('щ) „📤 Изпрати" → pending/processed/approved на склада → „Изпратена" + syncLinkedTransport; другите не се пипат');
  {
    const h = await sendEnv(['c1', 'cp', 'ca', 'cs', 'cr', 'cd', 'cf', 'cq', 'cx', null, 'c1']);
    realClick(h.w, btn(mod(h), 'Изпрати към обектите'));
    await settle(); await settle();
    ok('листът е PATCH-нат на sent', h.calls.patch.some(p => /loading_lists\?id=eq\.L9/.test(p.url) && p.body.status === 'sent'));
    const ids = coPatches(h).map(p => /id=eq\.([^&]*)/.exec(p.url)[1]).sort();
    ok('PATCH само за c1, ca, cp (по веднъж, и при два реда с c1)', JSON.stringify(ids) === JSON.stringify(['c1', 'ca', 'cp']), JSON.stringify(ids));
    ok('тялото е {status:"sent"}', coPatches(h).every(p => JSON.stringify(p.body) === '{"status":"sent"}'));
    ok('syncLinkedTransport(id,"sent",ред) за трите', JSON.stringify(h.sync.map(x => x[0]).sort()) === JSON.stringify(['c1', 'ca', 'cp']) &&
      h.sync.every(x => x[1] === 'sent' && x[0] === x[2]), JSON.stringify(h.sync));
    const t = lastToast(h);
    ok('toast: 3 → Изпратена', /3 клиентски заявки → Изпратена/.test(t.msg), t.msg);
    ok('toast изброява вече с друг статус (1012…1016)', /вече с друг статус: .*1012 \(Изпратена\).*1013.*1014.*1015.*1016 \(Отложена\)/.test(t.msg), t.msg);
    ok('toast изброява чуждия изпълнител 1017', /изпълнител е друг: 1017 \(Логистичен склад Търговище\)/.test(t.msg), t.msg);
    ok('toast не е червен (няма провал)', t.col !== '#dc2626', t.col);
    const cRead = h.calls.get.filter(u => /client_orders\?select=id,in_num,status,fulfiller/.test(u));
    /* Едно четене за изпращането + едно за червения ред в изгледа, който се
       смята наново от базата, щом изпращането приключи. */
    ok('две четения: изпращане + проверка в изгледа', cRead.length === 2, JSON.stringify(cRead));
    ok('след изпращането — без червен ред (всичко, което може, е sent)', !mod(h).querySelector('[data-ll-co-pending]'), mod(h).textContent.slice(0, 200));
  }

  section('ъ) лист без свързани редове → нула заявки към client_orders');
  {
    const h = await sendEnv([null, null]);
    const before = coGets(h).length;
    realClick(h.w, btn(mod(h), 'Изпрати към обектите'));
    await settle(); await settle();
    ok('листът е изпратен', h.calls.patch.some(p => /loading_lists/.test(p.url) && p.body.status === 'sent'));
    ok('нула GET/PATCH към client_orders', coGets(h).length === before && coPatches(h).length === 0,
      JSON.stringify(coGets(h)));
  }

  section('ь) паднал PATCH по заявката → листът е изпратен, червен toast; в изгледа „🔁 Опитай пак"');
  {
    const h = await sendEnv(['c1', 'ca'], { env: { fail: { PATCH: /client_orders\?id=eq\.c1/ } } });
    realClick(h.w, btn(mod(h), 'Изпрати към обектите'));
    await settle(); await settle();
    ok('листът е изпратен (статусът е sent)', h.calls.patch.some(p => /loading_lists/.test(p.url) && p.body.status === 'sent'));
    const t = lastToast(h);
    ok('червен toast с 1001', t.col === '#dc2626' && /НЕ са обновени на „Изпратена“: 1001/.test(t.msg), JSON.stringify(t));
    ok('ca все пак е обновена', coPatches(h).some(p => /id=eq\.ca/.test(p.url)));
    /* Отваряне на листа (и след презареждане — смята се от базата). */
    h.w.loadLoadingLists();
    await settle();
    h.w.llOpenView('L9');
    await settle(); await settle();
    const pend = mod(h).querySelector('[data-ll-co-pending="1001"]');
    ok('червен ред „КЗ 1001 не стана „Изпратена““', !!pend && /КЗ 1001 не стана „Изпратена“/.test(pend.textContent), mod(h).textContent.slice(0, 300));
    ok('ca го няма (вече е sent)', !mod(h).querySelector('[data-ll-co-pending="1011"]'));
    const rb = pend && pend.querySelector('button[data-ll-co-retry]');
    ok('„🔁 Опитай пак" е <button>', !!rb && /🔁 Опитай пак/.test(rb.textContent));
    delete h.failSpec.PATCH;
    const n0 = coPatches(h).length;
    realClick(h.w, rb);
    await settle(); await settle();
    ok('реален клик → PATCH по c1', coPatches(h).length === n0 + 1 && /id=eq\.c1/.test(coPatches(h)[n0].url));
    ok('редът изчезва', !mod(h).querySelector('[data-ll-co-pending]'), mod(h).textContent.slice(0, 300));
  }

  section('ю) изтрита заявка (id не се връща) → непроверена; паднало четене → казва се; обектът не вижда нищо');
  {
    const h = await sendEnv(['c1', 'gone-123456789']);
    realClick(h.w, btn(mod(h), 'Изпрати към обектите'));
    await settle(); await settle();
    const t = lastToast(h);
    ok('червен toast — изтритата е „НЕ са обновени"', t.col === '#dc2626' && /НЕ са обновени.*gone-123/.test(t.msg), t.msg);
    h.w.loadLoadingLists();
    await settle();
    h.w.llOpenView('L9');
    await settle(); await settle();
    ok('в изгледа: „не се намира в базата; не е проверена"', !!mod(h).querySelector('[data-ll-co-unverified]') &&
      /не се намира в базата; не е проверена/.test(mod(h).textContent));
    ok('без „🔁" за изтритата', !mod(h).querySelector('[data-ll-co-unverified] button'));
  }
  {
    const h = await sendEnv(['c1'], { list: { status: 'sent' }, env: { fail: { GET: /client_orders\?select=id,in_num,status,fulfiller/ } } });
    await settle();
    ok('паднало четене в изгледа → „не се провериха"', !!mod(h).querySelector('[data-ll-co-sync-error]') &&
      /не се провериха/.test(mod(h).textContent), mod(h).textContent.slice(0, 300));
    ok('без „🔁" и без мълчание', !mod(h).querySelector('[data-ll-co-retry]'));
  }
  {
    /* партиално приключен лист с висяща заявка → червеният ред и там */
    const h = await sendEnv(['c1'], { list: { status: 'partial' } });
    ok('partial → „КЗ 1001 не стана „Изпратена““', !!mod(h).querySelector('[data-ll-co-pending="1001"]'));
  }
  {
    const h = await sendEnv(['c1'], { list: { status: 'done' } });
    ok('done → без червения ред и без четене на заявките',
      !mod(h).querySelector('[data-ll-co-sync],[data-ll-co-pending]') && coGets(h).length === 0, JSON.stringify(coGets(h)));
  }
  {
    /* обектът: изпратен лист с връзка — нито чип, нито червен ред, нито блок */
    const lists = [Object.assign({}, L_DRAFT, { status: 'sent' })];
    const items = [Object.assign({}, OLD_ITEMS[0], { created_at: NEW_AT, client_order_id: 'c1', warehouse_comment: 'КЗ 1001 · Диван' })];
    const h = env({ user: STORE, lists, items, orders: SEND_ORDERS() });
    h.w.loadLoadingLists();
    await settle();
    ok('обектът вижда коментара „КЗ 1001"', /КЗ 1001/.test(mod(h).textContent));
    ok('обектът: без чип, червен ред и блок', !mod(h).querySelector('[data-ll-co-chip],[data-ll-co-sync],[data-ll-co-pending],[data-ll-co]'));
    ok('обектът: нула GET към client_orders', coGets(h).length === 0, JSON.stringify(coGets(h)));
    h.w.llStoreAddOpen('L9');
    h.w.llStoreAddField('store_comment', 'дойде палет');
    await h.w.llStoreAddSubmit();
    await settle();
    const sp = itemPosts(h);
    ok('редът, добавен от обекта — без client_order_id', sp.length === 1 && !sp[0].body.client_order_id,
      JSON.stringify(sp.map(p => p.body)));
  }

  section('я) интеграционно: tfCoAutoSent (transfers.js) работи до llCoAutoSent');
  {
    const orders = SEND_ORDERS();
    const h = env({ orders });
    ok('двете функции съществуват', typeof h.w.tfCoAutoSent === 'function' && typeof h.w.llCoAutoSent === 'function');
    ok('тф и лл: едни и същи начални статуси', JSON.stringify(h.w.TF_CO_AUTO_FROM) === JSON.stringify(h.w.LL_CO_AUTO_FROM));
    await h.w.tfCoAutoSent({ from_store: DOB }, [{ id: 'g1', client_order_ids: ['c1', 'cx'] }], 'Тест');
    await settle();
    ok('tfCoAutoSent → PATCH само по c1', coPatches(h).length === 1 && /id=eq\.c1/.test(coPatches(h)[0].url),
      JSON.stringify(coPatches(h).map(p => p.url)));
    ok('c1 във фикстурата вече е sent', orders[0].status === 'sent');
  }

  report();
})();
