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

   Мутационна проверка на „➕" (17.11.2026), брой ❌ в скоби:
     1) без „вече в листа" в llCoAdd и без disabled            → ПАДА (6)
     1б) само без проверката в llCoAdd (бутонът пак disabled)  → ПАДА (4)
     2) сравнение по префикс вместо точен номер                → ПАДА (3)
     3) sbPatch към client_orders при клика                     → ПАДА (2)
     4) без проверката „обектът е в списъка на листа"          → ПАДА (3)
     5) името на клиента в коментара                            → ПАДА (14)
     6) escVal() пак в полето за коментар (кавичка реже)        → ПАДА (1)
     7) без обновяване на блока при писане в коментара          → ПАДА (1)
     8) „➕" презаписва празна единица с ръчен коментар         → ПАДА (1)

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
    const s = /(?:^|&)status=not\.in\.\(([^)]*)\)/.exec(q);
    if (s) { const ex = s[1].split(','); out = out.filter(r => ex.indexOf(r.status) < 0); }
    if (/order=store_name\.asc,created_at\.asc/.test(q))
      out.sort((a, b) => a.store_name.localeCompare(b.store_name, 'bg') || (a.created_at < b.created_at ? -1 : 1));
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
      loading_list_items: () => (opts.items || []).map(r => Object.assign({}, r, { loading_list_products: [] })),
      users: [{ store_name: 'Варна' }, { store_name: 'Бургас' }, { store_name: DOB }],
      loading_list_products: [], loading_list_photos: [], stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: [], goods_transit: []
    },
    fail: opts.fail
  });
  const inner = h.w.fetch;
  h.w.fetch = function (url, init) {
    const m = ((init || {}).method || 'GET').toUpperCase();
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
    ok('изтрит коментар → c2 без „✓", бутонът е активен',
      !coRow(h, 'c2').querySelector('[data-ll-co-check]') && addBtn(h, 'c2').disabled === false);
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

  section('о) редакция на чернова с „КЗ 1001" от базата → отметката излиза');
  {
    const items = [Object.assign({}, OLD_ITEMS[0], { warehouse_comment: 'КЗ 1001 · Диван ъглов · SAP 500123 · 1 бр' })];
    const h = env({ lists: [L_DRAFT], items });
    h.w.loadLoadingLists();
    await settle();
    h.w.llOpenEdit('L9');
    await settle();
    ok('c1 е „✓ в листа"', !!coRow(h, 'c1') && !!coRow(h, 'c1').querySelector('[data-ll-co-check]'));
    ok('c1 „➕" е disabled', !!addBtn(h, 'c1') && addBtn(h, 'c1').disabled === true);
    ok('c3 не е отметната', !coRow(h, 'c3').querySelector('[data-ll-co-check]') && addBtn(h, 'c3').disabled === false);
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
    h.w.llDraft.units.forEach(u => { u.warehouse_comment = ''; });
    h.w.llDraft.units[0].warehouse_comment = 'виж КЗ Петрич-0368, спешно';
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

  report();
})();
