/* Товарни листи — АРТИКУЛИ ПО ПАЛЕТ (Пакет В1).

   Складът въвежда какво има на всеки палет: сканира баркод или пише SAP код
   с автодопълване от каталога. Артикулите се записват в loading_list_products
   към РЕДА (палета), показват се в прегледа, при обекта и в „Разлика".

   Тук се пази онова, което се чупи ТИХО:
     · новите редове се вмъкват със sbPost (return=minimal) и id-тата им НЕ се
       връщат — артикулите им трябва да получат правилния item_id;
     · повторен запис трябва да ЗАМЕНИ старите артикули, не да ги дублира и не
       да ги изгуби. Редът е „вмъкни, после изтрий по-старите": провал по
       средата не бива да остави палета без опис;
     · 1542 имена в каталога съдържат кавичка (инчове) — escVal() не я бяга и
       би скъсал value="…" на полето;
     · бройки 0 / празно / боклук не минават.

   Сървърът в теста е СЪСТОЯНИЕ, не списък с отговори: POST вмъква, DELETE
   маха, GET чете оттам. Без това „повторният запис изтрива старите" би било
   проверка на мока, не на кода.

   Пускане:  node tests/loading-lists-products.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, fire, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                role: 'manager', store_name: 'Петрич', assigned_stores: [] };

const CATALOG = [
  { sap_code: '3200123', product_name: 'ШУРУП 4X40', default_unit: 'бр.', ean_code: '3800001000011' },
  { sap_code: '3200124', product_name: 'ШУРУП 4X50', default_unit: 'бр.', ean_code: '3800001000028' },
  /* Кавичката е в ИМЕТО — точно това, което escVal() не бяга. */
  { sap_code: '5001',    product_name: 'ТРЪБА 1/2" PPR', default_unit: 'л.м', ean_code: '3800001000035' },
  /* UPC-A, записан с 12 цифри: скенерът може да го върне и като 13 с 0. */
  { sap_code: '7001',    product_name: 'ЛЕПИЛО UPC', default_unit: 'бр.', ean_code: '012345678905' },
  /* Два артикула с един баркод — пътят „2+", който днес го няма в данните,
     но каталогът се налива наново всеки месец. */
  { sap_code: '8001',    product_name: 'БОЯ БЯЛА 1Л', default_unit: 'бр.', ean_code: '3800009999990' },
  { sap_code: '8002',    product_name: 'БОЯ БЯЛА 1Л (стар код)', default_unit: 'бр.', ean_code: '3800009999990' }
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Мъничкият сървър ─────────────────────────────────────────────────── */
function makeDb(seed) {
  return {
    loading_lists: (seed.lists || []).map(r => Object.assign({}, r)),
    loading_list_items: (seed.items || []).map(r => Object.assign({}, r)),
    loading_list_products: (seed.products || []).map(r => Object.assign({}, r)),
    product_catalog: CATALOG.map(r => Object.assign({}, r)),
    goods_transit: (seed.transit || []).map(r => Object.assign({}, r)),
    users: [{ store_name: 'Петрич', active: true }, { store_name: 'Гоце Делчев', active: true },
            { store_name: WH, active: true }]
  };
}
const TABLES = ['loading_lists', 'loading_list_items', 'loading_list_products',
                'product_catalog', 'goods_transit'];

function inList(v) {                       /* "in.(a,b)" -> ['a','b'] */
  const m = /^in\.\((.*)\)$/.exec(v || '');
  return m ? m[1].split(',').map(x => decodeURIComponent(x)) : null;
}
function applyFilters(rows, sp) {
  let out = rows.slice();
  sp.forEach((val, key) => {
    if (['select', 'order', 'limit', 'or'].indexOf(key) >= 0) return;
    if (/^eq\./.test(val)) { const w = val.slice(3); out = out.filter(r => String(r[key]) === w); return; }
    if (/^in\./.test(val)) { const w = inList(val); out = out.filter(r => w.indexOf(String(r[key])) >= 0); return; }
    if (/^lt\./.test(val)) { const w = val.slice(3); out = out.filter(r => String(r[key]) < w); return; }
  });
  const orv = sp.get('or');
  if (orv) {
    /* or=(sap_code.ilike.X*,product_name.ilike.*X*) */
    const m = /^\(sap_code\.ilike\.(.*)\*,product_name\.ilike\.\*(.*)\*\)$/.exec(orv);
    if (m) {
      const a = m[1].toLowerCase(), b = m[2].toLowerCase();
      out = out.filter(r => String(r.sap_code).toLowerCase().indexOf(a) === 0 ||
                            String(r.product_name).toLowerCase().indexOf(b) >= 0);
    }
  }
  const ord = sp.get('order');
  if (ord && /^position\./.test(ord)) out.sort((x, y) => (x.position || 0) - (y.position || 0));
  if (ord && /^sap_code\./.test(ord)) out.sort((x, y) => String(x.sap_code).localeCompare(String(y.sap_code)));
  const lim = parseInt(sp.get('limit'), 10);
  if (!isNaN(lim)) out = out.slice(0, lim);
  return out;
}

function env(user, seed, opts) {
  opts = opts || {};
  const db = makeDb(seed);
  const h = boot({
    modules: ['transport.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js', 'loading.js'],
    user: user, confirm: true,
    data: {
      /* GET-овете към тези таблици се обслужват от обвивката долу; тук само
         за да ги знае harness-ът. */
      loading_lists: [], loading_list_items: [], loading_list_products: [],
      /* Блокът „Документи от Стока на път" е зад app_settings
         'loading_transit_docs' (по подразбиране ИЗКЛЮЧЕН). Този тест описва
         включения блок, затова флагът е изричен. Изключеното състояние е
         в loading-transit-toggle.test.js. */
      app_settings: [{ key: 'loading_transit_docs', value: 'on' }],
      product_catalog: [], goods_transit: [],
      users: db.users, stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  let idSeq = 0, clock = 0;
  /* Един час на ЗАЯВКА: всички редове от едно INSERT получават едно и също
     now(), както в Postgres (началото на транзакцията). */
  const serverNow = () => new Date(Date.UTC(2026, 8, 21, 8, 0, clock++)).toISOString();
  const resp = (status, data, extra) => ({
    ok: status >= 200 && status < 300, status: status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(data == null ? '' : JSON.stringify(data)),
    headers: { get: k => (extra && extra[k.toLowerCase()]) || null }
  });
  const inner = h.w.fetch;
  h.w.fetch = function (url, init) {
    const u = new URL(String(url));
    const table = u.pathname.split('/').pop();
    if (TABLES.indexOf(table) < 0) return inner(url, init);
    const method = ((init || {}).method || 'GET').toUpperCase();
    return inner(url, init).then(function () {
      const sp = u.searchParams;
      h.ops.push(method + ' ' + table);
      if (opts.failPost && !h.healPost && method === 'POST' && opts.failPost.test(table))
        return resp(500, { message: 'boom' });
      if (opts.failDelete && method === 'DELETE' && opts.failDelete.test(table))
        return resp(500, { message: 'boom' });

      if (method === 'GET') {
        let rows = applyFilters(db[table], sp);
        const sel = sp.get('select') || '';
        if (table === 'loading_list_items' && /loading_list_products\(/.test(sel)) {
          rows = rows.map(r => Object.assign({}, r, {
            loading_list_products: db.loading_list_products.filter(p => p.item_id === r.id)
              .map(p => Object.assign({}, p))
          }));
        } else {
          rows = rows.map(r => Object.assign({}, r));
        }
        return resp(200, rows);
      }
      if (method === 'POST') {
        const body = JSON.parse(init.body);
        const arr = Array.isArray(body) ? body : [body];
        const t = serverNow();
        const made = arr.map(r => Object.assign({ id: table + '-new-' + (++idSeq), created_at: t }, r));
        made.forEach(r => db[table].push(r));
        const prefer = ((init.headers || {}).Prefer || '');
        return /representation/.test(prefer) ? resp(201, made.map(r => Object.assign({}, r))) : resp(201, null);
      }
      if (method === 'PATCH') {
        const body = JSON.parse(init.body);
        applyFilters(db[table], sp).forEach(r => {
          const live = db[table].find(x => x.id === r.id);
          if (live) Object.assign(live, body);
        });
        return resp(204, null);
      }
      if (method === 'DELETE') {
        const hit = applyFilters(db[table], sp);
        const ids = hit.map(r => r.id);
        db[table] = db[table].filter(r => ids.indexOf(r.id) < 0);
        return resp(204, null, { 'content-range': '*/' + ids.length });
      }
      return resp(200, null);
    });
  };
  h.db = db;
  h.ops = [];
  h.toasts = [];
  const origToast = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: m, col: c }); return origToast(m, c); };
  return h;
}

/* Enter в поле с onkeydown="…(event)". fire() от harness-а изпълнява кода БЕЗ
   `event` в обхвата — браузърът го слага сам. Тук е сложен изрично. */
function pressEnter(w, el) {
  const code = el.getAttribute('onkeydown');
  if (!code) throw new Error('няма onkeydown: ' + el.outerHTML.slice(0, 120));
  const ev = { key: 'Enter', keyCode: 13, preventDefault() {} };
  w.eval('(function(el, event){ (function(){' + code + '}).call(el); })')(el, ev);
}
/* Пише в полето и пуска неговия oninput — както клавиатурата. */
function typeInto(w, el, val) { el.value = val; fire(w, el, 'input'); }

const $ = (h, id) => h.doc.getElementById(id);
const mod = h => h.doc.getElementById('mod-loading');
const toastHas = (h, re) => h.toasts.some(t => re.test(String(t.msg)));
const getsTo = (h, table) => h.calls.get.filter(u => new RegExp('/rest/v1/' + table + '\\?').test(u));

const L_DRAFT = { id: 'L1', warehouse: WH, list_date: '2026-09-21', status: 'draft',
                  executed_by: 'Иван', comment: '', created_at: '2026-09-21T06:00:00.000Z',
                  sent_at: null, done_at: null };
function item(o) {
  return Object.assign({
    id: 'I1', list_id: 'L1', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 1,
    purchase_doc: null, clears_doc: null, store_name: 'Петрич', warehouse_comment: null,
    store_comment: null, partial: false, received: false, received_by: null, received_at: null,
    missing: false, missing_by: null, missing_at: null, created_at: '2026-09-21T06:00:00.000Z'
  }, o);
}
async function openDraft(h) {
  h.w.loadLoadingLists();
  await ticks(); await ticks();
  h.w.llOpenEdit('L1');
  await ticks(); await ticks();
}
async function openProducts(h, i) {
  realClick(h.w, btn(mod(h), 'Артикули'));   /* първият ред */
  await ticks();
  return $(h, 'll-pf-sap-' + (i || 0));
}

(async function () {

  section('а) Автодопълване → избор → Enter в „Бройки" добавя и връща фокуса');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [item()] });
    await openDraft(h);

    const sap = await openProducts(h, 0);
    if (ok('полето „SAP код" е на екрана', !!sap)) {
      ok('и фокусът е в него при отваряне', h.doc.activeElement === sap,
        h.doc.activeElement && h.doc.activeElement.id);

      /* Две букви — никаква заявка. */
      typeInto(h.w, sap, '32');
      await sleep(350);
      ok('под 3 символа — нула заявки към каталога', getsTo(h, 'product_catalog').length === 0,
        getsTo(h, 'product_catalog').join(' | '));

      typeInto(h.w, sap, '320');
      ok('преди 300 ms — още нищо (debounce)', getsTo(h, 'product_catalog').length === 0);
      await sleep(350); await ticks();
      const q = getsTo(h, 'product_catalog');
      if (ok('една заявка след паузата', q.length === 1, q.join(' | '))) {
        const dq = decodeURIComponent(q[0]);
        ok('търси по код (префикс) ИЛИ по име (съдържа)',
          dq.indexOf('or=(sap_code.ilike.320*,product_name.ilike.*320*)') >= 0, dq);
        ok('limit=8', /limit=8/.test(q[0]), q[0]);
      }
      const box = $(h, 'll-pf-ac-0');
      const opts = box ? box.querySelectorAll('[onclick]') : [];
      ok('падащият списък показва двата шурупа', opts.length === 2, box && box.innerHTML.slice(0, 300));

      realClick(h.w, opts[0]);
      ok('името е попълнено', $(h, 'll-pf-name-0').value === 'ШУРУП 4X40', $(h, 'll-pf-name-0').value);
      ok('мярката е попълнена', $(h, 'll-pf-unit-0').value === 'бр.', $(h, 'll-pf-unit-0').value);
      ok('кодът е попълнен', $(h, 'll-pf-sap-0').value === '3200123', $(h, 'll-pf-sap-0').value);
      ok('фокусът е в „Бройки"', h.doc.activeElement === $(h, 'll-pf-qty-0'),
        h.doc.activeElement && h.doc.activeElement.id);
      ok('списъкът се скрива след избор', $(h, 'll-pf-ac-0').style.display === 'none');

      typeInto(h.w, $(h, 'll-pf-qty-0'), '12');
      typeInto(h.w, $(h, 'll-pf-ctn-0'), '2');
      pressEnter(h.w, $(h, 'll-pf-qty-0'));
      await ticks(); await ticks();

      const pr = h.w.llDraft.items[0].products;
      if (ok('артикулът е добавен', pr.length === 1, JSON.stringify(pr))) {
        ok('с кода', pr[0].sap_code === '3200123');
        ok('с името — КОПИЕ от каталога', pr[0].product_name === 'ШУРУП 4X40');
        ok('с бройките като число', pr[0].qty === 12, JSON.stringify(pr[0].qty));
        ok('с кашоните', pr[0].cartons === 2, JSON.stringify(pr[0].cartons));
      }
      ok('избраният от каталога НЯМА маркер „не е в каталога"',
        !mod(h).querySelector('[data-not-in-catalog]'));
      ok('фокусът се връща в „SAP код"', h.doc.activeElement === $(h, 'll-pf-sap-0'),
        h.doc.activeElement && h.doc.activeElement.id);
      ok('и формата е изчистена', $(h, 'll-pf-sap-0').value === '' && $(h, 'll-pf-qty-0').value === '');
      ok('бутонът брои 1 артикул', /Артикули \(1\)/.test(mod(h).textContent), mod(h).textContent.slice(0, 200));
      /* Точно избраният от падащия списък НЕ се проверява втори път. */
      ok('без втора заявка за точна проверка на кода',
        !getsTo(h, 'product_catalog').some(u => /sap_code=eq\./.test(u)),
        getsTo(h, 'product_catalog').join(' | '));
    }
  }

  section('а2) Разбъркани отговори — печели ПОСЛЕДНАТА заявка');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [item()] });
    await openDraft(h);
    await openProducts(h, 0);
    /* Директно, без debounce: две заявки една след друга. llAcSeq отрязва
       отговора на първата, ако дойде по-късно. */
    const p1 = h.w.llAcFetch(0, 'шуруп');
    const p2 = h.w.llAcFetch(0, 'тръба');
    await p2; await p1; await ticks();
    const r = h.w.llAcResults[0] || [];
    ok('в списъка е отговорът на втората заявка', r.length === 1 && r[0].sap_code === '5001',
      JSON.stringify(r.map(x => x.sap_code)));
  }

  section('а3) Преместен ред — чакащата подсказка НЕ пада върху чужд ред');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [
      item({ id: 'I1', position: 1, pallet_no: 1, pallet_total: 2 }),
      item({ id: 'I2', position: 2, pallet_no: 2, pallet_total: 2 })
    ] });
    await openDraft(h);
    h.w.llDraft.items[1]._prodOpen = true;
    h.w.renderLoadingLists();
    /* Пише в реда с индекс 1 и, преди да минат 300 ms, го мести нагоре. */
    typeInto(h.w, $(h, 'll-pf-sap-1'), '320');
    realClick(h.w, h.doc.querySelector('button[data-i="1"][title="Нагоре"]'));
    await sleep(350); await ticks();
    ok('заявката е отменена — нула към каталога', getsTo(h, 'product_catalog').length === 0,
      getsTo(h, 'product_catalog').join(' | '));
    ok('нито един ред няма чужди подсказки', !Object.keys(h.w.llAcResults).some(k => (h.w.llAcResults[k] || []).length),
      JSON.stringify(h.w.llAcResults));
    ok('написаното пътува с реда си', h.w.llDraft.items[0]._pf && h.w.llDraft.items[0]._pf.sap_code === '320',
      JSON.stringify(h.w.llDraft.items.map(x => x._pf && x._pf.sap_code)));
  }

  section('б) Валидация на бройките');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [item()] });
    await openDraft(h);
    const sap = await openProducts(h, 0);
    for (const bad of ['', '0', '-3', 'abc', '1.2.3']) {
      typeInto(h.w, $(h, 'll-pf-sap-0'), '3200123');
      typeInto(h.w, $(h, 'll-pf-qty-0'), bad);
      h.toasts.length = 0;
      await h.w.llAddProduct(0); await ticks();
      ok('„' + bad + '" НЕ се приема', h.w.llDraft.items[0].products.length === 0,
        JSON.stringify(h.w.llDraft.items[0].products));
      ok('и казва защо', toastHas(h, /Бройките трябва да са число по-голямо от 0/), JSON.stringify(h.toasts));
    }
    ok('фокусът е в „Бройки"', h.doc.activeElement === $(h, 'll-pf-qty-0'),
      h.doc.activeElement && h.doc.activeElement.id);
    /* Запетаята е десетичният знак в България. */
    typeInto(h.w, $(h, 'll-pf-qty-0'), '2,5');
    await h.w.llAddProduct(0); await ticks();
    ok('„2,5" се приема като 2.5', h.w.llDraft.items[0].products.length === 1 &&
      h.w.llDraft.items[0].products[0].qty === 2.5, JSON.stringify(h.w.llDraft.items[0].products));

    /* Кашоните са по желание, но ако са попълнени — цяло число. */
    typeInto(h.w, $(h, 'll-pf-sap-0'), '3200124');
    typeInto(h.w, $(h, 'll-pf-qty-0'), '3');
    typeInto(h.w, $(h, 'll-pf-ctn-0'), '1,5');
    h.toasts.length = 0;
    await h.w.llAddProduct(0); await ticks();
    ok('кашони „1,5" НЕ се приемат', h.w.llDraft.items[0].products.length === 1);
    ok('и казва защо', toastHas(h, /Кашоните са цяло число/), JSON.stringify(h.toasts));
    typeInto(h.w, $(h, 'll-pf-ctn-0'), '');
    await h.w.llAddProduct(0); await ticks();
    ok('празни кашони са позволени → null', h.w.llDraft.items[0].products.length === 2 &&
      h.w.llDraft.items[0].products[1].cartons === null, JSON.stringify(h.w.llDraft.items[0].products[1]));

    typeInto(h.w, $(h, 'll-pf-qty-0'), '5');
    h.toasts.length = 0;
    await h.w.llAddProduct(0); await ticks();
    ok('без SAP код — отказ', h.w.llDraft.items[0].products.length === 2);
    ok('„Въведи SAP код"', toastHas(h, /Въведи SAP код/), JSON.stringify(h.toasts));
  }

  section('в) Код, въведен на ръка: в каталога → името оттам; извън него → име на ръка + маркер');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [item()] });
    await openDraft(h);
    await openProducts(h, 0);

    /* Точен код от каталога, но без избор от падащия списък. */
    typeInto(h.w, $(h, 'll-pf-sap-0'), '3200124');
    typeInto(h.w, $(h, 'll-pf-qty-0'), '4');
    await h.w.llAddProduct(0); await ticks();
    ok('проверката е ТОЧНА (sap_code=eq)',
      getsTo(h, 'product_catalog').some(u => /sap_code=eq\.3200124/.test(u)),
      getsTo(h, 'product_catalog').join(' | '));
    const p0 = h.w.llDraft.items[0].products[0];
    ok('името идва от каталога', p0 && p0.product_name === 'ШУРУП 4X50', JSON.stringify(p0));
    ok('мярката също', p0 && p0.unit === 'бр.');
    ok('и НЯМА маркер', !mod(h).querySelector('[data-not-in-catalog]'));

    /* Код, който го няма. Без име — спира, но НЕ блокира. */
    typeInto(h.w, $(h, 'll-pf-sap-0'), '999999');
    typeInto(h.w, $(h, 'll-pf-qty-0'), '1');
    h.toasts.length = 0;
    await h.w.llAddProduct(0); await ticks();
    ok('без име — не се добавя', h.w.llDraft.items[0].products.length === 1);
    ok('жълто „въведи име на ръка", не червено',
      h.toasts.some(t => /въведи име на ръка/.test(t.msg) && t.col === '#d97706'), JSON.stringify(h.toasts));
    ok('фокусът е в „Име"', h.doc.activeElement === $(h, 'll-pf-name-0'),
      h.doc.activeElement && h.doc.activeElement.id);

    typeInto(h.w, $(h, 'll-pf-name-0'), 'МОСТРА ОТ ДОСТАВЧИК');
    await h.w.llAddProduct(0); await ticks();
    const p1 = h.w.llDraft.items[0].products[1];
    ok('с име — добавен', p1 && p1.sap_code === '999999' && p1.product_name === 'МОСТРА ОТ ДОСТАВЧИК',
      JSON.stringify(p1));
    ok('и маркиран „не е в каталога"',
      mod(h).querySelectorAll('[data-not-in-catalog]').length === 1,
      String(mod(h).querySelectorAll('[data-not-in-catalog]').length));
  }

  section('г) Един SAP код два пъти на ЕДИН палет — предупреждение, но позволено');
  {
    /* Два реда (два документа) на палет 1 за Петрич — един физически палет. */
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [
      item({ id: 'I1', position: 1, pallet_no: 1, pallet_total: 1, purchase_doc: 'D-1' }),
      item({ id: 'I2', position: 2, pallet_no: 1, pallet_total: 1, purchase_doc: 'D-2' })
    ] });
    await openDraft(h);
    h.w.llDraft.items[0].products.push({ sap_code: '3200123', product_name: 'ШУРУП 4X40',
                                          unit: 'бр.', qty: 5, cartons: null, _inCat: true });
    h.w.llDraft.items[1]._prodOpen = true;
    h.w.renderLoadingLists();

    h.w.llAcResults[1] = [CATALOG[0]];
    realClick(h.w, (function () {
      h.w.llAcRender(1);
      return $(h, 'll-pf-ac-1').querySelector('[onclick]');
    })());
    typeInto(h.w, $(h, 'll-pf-qty-1'), '7');
    h.toasts.length = 0;
    pressEnter(h.w, $(h, 'll-pf-qty-1'));
    await ticks(); await ticks();
    ok('добавен въпреки дубликата', h.w.llDraft.items[1].products.length === 1,
      JSON.stringify(h.w.llDraft.items[1].products));
    ok('жълто предупреждение с кода',
      h.toasts.some(t => /3200123 вече е на този палет/.test(t.msg) && t.col === '#d97706'),
      JSON.stringify(h.toasts));
    ok('в таблицата стои маркер „×2"', /×2/.test(mod(h).textContent), mod(h).textContent.slice(0, 300));

    /* КОНТРОЛ: същият код на ДРУГ палет не е дубликат. */
    const h2 = env(WAREHOUSE, { lists: [L_DRAFT], items: [
      item({ id: 'I1', position: 1, pallet_no: 1, pallet_total: 2 }),
      item({ id: 'I2', position: 2, pallet_no: 2, pallet_total: 2 })
    ] });
    await openDraft(h2);
    h2.w.llDraft.items[0].products.push({ sap_code: '3200123', product_name: 'ШУРУП 4X40',
                                           unit: 'бр.', qty: 5, cartons: null, _inCat: true });
    h2.w.llPfFromCatalog(1, CATALOG[0]);
    h2.w.llDraft.items[1]._pf.qty = '3';
    h2.toasts.length = 0;
    await h2.w.llAddProduct(1); await ticks();
    ok('КОНТРОЛ: на друг палет — без предупреждение',
      !h2.toasts.some(t => /вече е на този палет/.test(t.msg)), JSON.stringify(h2.toasts));
  }

  section('д) Кавичка в името не къса полето (1542 такива в каталога)');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [item()] });
    await openDraft(h);
    await openProducts(h, 0);
    h.w.llPfFromCatalog(0, CATALOG[2]);
    /* Пре-рендирането строи полето наново от it._pf — там е капанът. */
    h.w.renderLoadingLists();
    const nm = $(h, 'll-pf-name-0');
    ok('полето е едно и цяло', !!nm && nm.value === 'ТРЪБА 1/2" PPR', nm && JSON.stringify(nm.value));
    ok('полето е ЕДНО — кавичката не е родила втори елемент',
      mod(h).querySelectorAll('#ll-pf-name-0').length === 1);
    /* КОНТРОЛ: escVal наистина би го скъсал — иначе проверката горе е празна. */
    const brokenDiv = h.doc.createElement('div');
    brokenDiv.innerHTML = '<input id="x" value="' + h.w.escVal('ТРЪБА 1/2" PPR') + '">';
    ok('КОНТРОЛ: escVal() би дал „ТРЪБА 1/2" — скъсано',
      brokenDiv.querySelector('#x').value === 'ТРЪБА 1/2', brokenDiv.querySelector('#x').value);
  }

  section('е) Запис: нов и съществуващ ред, артикулите с правилния item_id и position');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [item()] });
    await openDraft(h);
    /* Съществуващият ред I1 — два артикула. */
    h.w.llDraft.items[0].products.push(
      { sap_code: '3200123', product_name: 'ШУРУП 4X40', unit: 'бр.', qty: 12, cartons: 2, _inCat: true },
      { sap_code: '5001', product_name: 'ТРЪБА 1/2" PPR', unit: 'л.м', qty: 6.5, cartons: null, _inCat: true });
    /* Нов ред без id — един артикул. id-то му НЕ се връща от sbPost. */
    h.w.llAddFreeRow();
    const fresh = h.w.llDraft.items[1];
    fresh.store_name = 'Гоце Делчев'; fresh.kind = 'bulk'; fresh.pallet_no = null;
    fresh.products.push({ sap_code: '3200124', product_name: 'ШУРУП 4X50', unit: 'бр.', qty: 100, cartons: 4, _inCat: true });

    h.w.llSaveDraft();
    await ticks(); await ticks(); await ticks(); await ticks(); await ticks(); await ticks();

    const newItem = h.db.loading_list_items.find(r => r.store_name === 'Гоце Делчев');
    ok('новият ред е вмъкнат', !!newItem, JSON.stringify(h.db.loading_list_items.map(r => r.id)));
    ok('редовете са прочетени наново за id-тата',
      getsTo(h, 'loading_list_items').some(u => /list_id=eq\.L1/.test(u) && /select=id,position/.test(u)),
      getsTo(h, 'loading_list_items').join(' | '));

    const pp = h.calls.post.filter(p => p.table === 'loading_list_products');
    if (ok('артикулите са записани с ЕДИН POST', pp.length === 1, JSON.stringify(h.calls.post.map(p => p.table)))) {
      const rows = pp[0].body;
      ok('три реда', rows.length === 3, JSON.stringify(rows));
      const onI1 = rows.filter(r => r.item_id === 'I1');
      const onNew = rows.filter(r => newItem && r.item_id === newItem.id);
      ok('два към съществуващия I1', onI1.length === 2, JSON.stringify(rows.map(r => r.item_id)));
      ok('позиции 1,2 в I1', onI1.map(r => r.position).join(',') === '1,2');
      ok('един към НОВИЯ ред — с id-то, дадено от базата', onNew.length === 1,
        JSON.stringify(rows.map(r => r.item_id)) + ' нов=' + (newItem && newItem.id));
      ok('позиция 1 в новия', onNew[0] && onNew[0].position === 1);
      ok('полетата са пренесени', onI1[0].sap_code === '3200123' && onI1[0].product_name === 'ШУРУП 4X40' &&
        onI1[0].unit === 'бр.' && onI1[0].qty === 12 && onI1[0].cartons === 2, JSON.stringify(onI1[0]));
      ok('кавичката в името е запазена', onI1[1].product_name === 'ТРЪБА 1/2" PPR', onI1[1].product_name);
      ok('празни кашони → null', onI1[1].cartons === null, JSON.stringify(onI1[1]));
      ok('без received_qty (това е В2)', !('received_qty' in onI1[0]), JSON.stringify(Object.keys(onI1[0])));
      ok('_inCat НЕ отива в базата', !('_inCat' in onI1[0]));
    }
    ok('в базата има три артикула', h.db.loading_list_products.length === 3,
      JSON.stringify(h.db.loading_list_products.map(p => p.sap_code)));
    ok('записът е довършен — обратно в списъка', h.w.llView === 'list', h.w.llView);
    ok('без маркер за непълен запис', !h.w.llIncompleteSaves['L1']);
  }

  section('ж) Повторен запис ЗАМЕНЯ старите — вмъкни, после изтрий по-старите');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [item()], products: [
      { id: 'P-old-1', item_id: 'I1', position: 1, sap_code: '3200123', product_name: 'ШУРУП 4X40',
        unit: 'бр.', qty: 10, cartons: null, received_qty: null, created_at: '2026-09-20T10:00:00.000Z' },
      { id: 'P-old-2', item_id: 'I1', position: 2, sap_code: '3200124', product_name: 'ШУРУП 4X50',
        unit: 'бр.', qty: 20, cartons: null, received_qty: null, created_at: '2026-09-20T10:00:00.000Z' }
    ] });
    await openDraft(h);
    ok('старите артикули са в черновата', h.w.llDraft.items[0].products.length === 2,
      JSON.stringify(h.w.llDraft.items[0].products));
    ok('и са дошли с ЕДНА заявка (embed)', getsTo(h, 'loading_list_products').length === 0 &&
      getsTo(h, 'loading_list_items').some(u => /loading_list_products\(\*\)/.test(decodeURIComponent(u))),
      getsTo(h, 'loading_list_items').join(' | '));

    /* Махаме втория, променяме първия, добавяме нов. */
    h.w.llDraft.items[0].products.splice(1, 1);
    h.w.llDraft.items[0].products[0].qty = 11;
    h.w.llDraft.items[0].products.push({ sap_code: '5001', product_name: 'ТРЪБА 1/2" PPR', unit: 'л.м', qty: 3, cartons: 1, _inCat: true });

    h.w.llSaveDraft();
    for (let k = 0; k < 8; k++) await ticks();

    const ids = h.db.loading_list_products.map(p => p.id);
    ok('старите ги няма', ids.indexOf('P-old-1') < 0 && ids.indexOf('P-old-2') < 0, JSON.stringify(ids));
    ok('остават точно двата нови', h.db.loading_list_products.length === 2,
      JSON.stringify(h.db.loading_list_products.map(p => p.sap_code + ':' + p.qty)));
    ok('с новите стойности', h.db.loading_list_products.some(p => p.sap_code === '3200123' && p.qty === 11) &&
      h.db.loading_list_products.some(p => p.sap_code === '5001' && p.qty === 3));

    /* РЕДЪТ на операциите — вмъкване ПРЕДИ триене. Обратният ред при паднала
       връзка по средата би оставил палета без опис. */
    const iPost = h.ops.indexOf('POST loading_list_products');
    const iDel  = h.ops.indexOf('DELETE loading_list_products');
    ok('вмъкването е ПРЕДИ триенето', iPost >= 0 && iDel > iPost, JSON.stringify(h.ops));
    const pIdx = iPost;
    const del = h.calls.del.filter(u => /loading_list_products/.test(u));
    if (ok('едно триене', del.length === 1, JSON.stringify(h.calls.del))) {
      const dq = decodeURIComponent(del[0]);
      ok('по item_id на редовете от листа', /item_id=in\.\(I1\)/.test(dq), dq);
      ok('и САМО по-старите от новия запис (created_at=lt)', /created_at=lt\.2026-09-21T/.test(dq), dq);
    }
    ok('има POST на артикулите', pIdx >= 0);
  }

  section('ж2) Махане на ВСИЧКИ артикули → трие старите, без POST');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [item()], products: [
      { id: 'P-old-1', item_id: 'I1', position: 1, sap_code: '3200123', product_name: 'ШУРУП 4X40',
        unit: 'бр.', qty: 10, cartons: null, received_qty: null, created_at: '2026-09-20T10:00:00.000Z' }
    ] });
    await openDraft(h);
    h.w.llDraft.items[0].products = [];
    h.w.llSaveDraft();
    for (let k = 0; k < 8; k++) await ticks();
    ok('нула POST към артикулите', !h.calls.post.some(p => p.table === 'loading_list_products'));
    ok('старият е изтрит', h.db.loading_list_products.length === 0,
      JSON.stringify(h.db.loading_list_products));
  }

  section('ж3) Лист без артикули нито сега, нито преди — нула нови заявки');
  {
    /* Записът на всички заварени листи трябва да остане ТОЧНО какъвто беше. */
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [item()] });
    await openDraft(h);
    const getsBefore = getsTo(h, 'loading_list_items').length;
    h.w.llSaveDraft();
    for (let k = 0; k < 6; k++) await ticks();
    ok('нула заявки към loading_list_products', !h.calls.post.concat(h.calls.patch)
      .some(p => p.table === 'loading_list_products') &&
      !h.calls.del.some(u => /loading_list_products/.test(u)));
    ok('и нито една повторна за id-тата',
      !getsTo(h, 'loading_list_items').some(u => /select=id,position/.test(u)),
      getsTo(h, 'loading_list_items').join(' | '));
    ok('записът е довършен', h.w.llView === 'list', h.w.llView);
  }

  section('з) Провал на вмъкването — червен toast, маркер, черновата ОСТАВА, старите НЕ се трият');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [item()], products: [
      { id: 'P-old-1', item_id: 'I1', position: 1, sap_code: '3200123', product_name: 'ШУРУП 4X40',
        unit: 'бр.', qty: 10, cartons: null, received_qty: null, created_at: '2026-09-20T10:00:00.000Z' }
    ] }, { failPost: /^loading_list_products$/ });
    await openDraft(h);
    h.w.llDraft.items[0].products.push({ sap_code: '5001', product_name: 'ТРЪБА 1/2" PPR', unit: 'л.м', qty: 3, cartons: null, _inCat: true });
    h.w.llSaveDraft();
    for (let k = 0; k < 8; k++) await ticks();

    ok('червен toast', h.toasts.some(t => /артикулите НЕ бяха записани/.test(t.msg) && t.col === '#dc2626'),
      JSON.stringify(h.toasts));
    ok('маркер за непълен запис', h.w.llIncompleteSaves['L1'] === true, JSON.stringify(h.w.llIncompleteSaves));
    ok('ОСТАВА в редактора', h.w.llView === 'edit', h.w.llView);
    ok('банерът в редактора го казва', !!mod(h).querySelector('[data-ll-incomplete]'));
    ok('артикулите са в паметта', h.w.llDraft && h.w.llDraft.items[0].products.length === 2,
      JSON.stringify(h.w.llDraft && h.w.llDraft.items[0].products));
    ok('НЕ е изпратено триене', !h.calls.del.some(u => /loading_list_products/.test(u)), JSON.stringify(h.calls.del));
    ok('старият артикул е ЦЯЛ в базата', h.db.loading_list_products.length === 1 &&
      h.db.loading_list_products[0].id === 'P-old-1');

    /* Повторният запис довършва — черновата вече знае id-тата на редовете. */
    h.w.llSaveDraft();
    for (let k = 0; k < 8; k++) await ticks();
    /* Мрежата е още „паднала" в този env, затова само: не е изгубено нищо. */
    ok('и втори провал не трие стария', h.db.loading_list_products.some(p => p.id === 'P-old-1'));
  }

  section('з3) След провал: оправена мрежа → „Запази" довършва');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [item()], products: [
      { id: 'P-old-1', item_id: 'I1', position: 1, sap_code: '3200123', product_name: 'ШУРУП 4X40',
        unit: 'бр.', qty: 10, cartons: null, received_qty: null, created_at: '2026-09-20T10:00:00.000Z' }
    ] }, { failPost: /^loading_list_products$/ });
    await openDraft(h);
    h.w.llDraft.items[0].products.push({ sap_code: '5001', product_name: 'ТРЪБА 1/2" PPR', unit: 'л.м', qty: 3, cartons: null, _inCat: true });
    h.w.llSaveDraft();
    for (let k = 0; k < 8; k++) await ticks();
    ok('първият запис се проваля', h.w.llView === 'edit' && h.w.llIncompleteSaves['L1'] === true);
    /* Мрежата се връща. */
    h.healPost = true;
    h.w.llSaveDraft();
    for (let k = 0; k < 8; k++) await ticks();
    ok('вторият довършва — обратно в списъка', h.w.llView === 'list', h.w.llView);
    ok('маркерът е изчистен', !h.w.llIncompleteSaves['L1'], JSON.stringify(h.w.llIncompleteSaves));
    ok('в базата са точно двата артикула от екрана', h.db.loading_list_products.length === 2 &&
      !h.db.loading_list_products.some(p => p.id === 'P-old-1'),
      JSON.stringify(h.db.loading_list_products.map(p => p.id + ':' + p.sap_code)));
  }

  section('з2) Провал на ТРИЕНЕТО след успешно вмъкване — дубликат се казва на глас');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [item()], products: [
      { id: 'P-old-1', item_id: 'I1', position: 1, sap_code: '3200123', product_name: 'ШУРУП 4X40',
        unit: 'бр.', qty: 10, cartons: null, received_qty: null, created_at: '2026-09-20T10:00:00.000Z' }
    ] }, { failDelete: /^loading_list_products$/ });
    await openDraft(h);
    h.w.llSaveDraft();
    for (let k = 0; k < 8; k++) await ticks();
    ok('червен toast за дублираните', h.toasts.some(t => /дублирани/.test(t.msg) && t.col === '#dc2626'),
      JSON.stringify(h.toasts));
    ok('маркер', h.w.llIncompleteSaves['L1'] === true);
    ok('остава в редактора', h.w.llView === 'edit');
  }

  section('и) Преглед на склада: брой и сума в обобщението, списък под реда, „Изходящ №"');
  {
    const L_SENT = Object.assign({}, L_DRAFT, { status: 'sent', sent_at: '2026-09-21T07:00:00.000Z' });
    const h = env(WAREHOUSE, { lists: [L_SENT], items: [
      item({ id: 'I1', position: 1, purchase_doc: 'ИЗХ-100' }),
      item({ id: 'I2', position: 2, pallet_no: 2, pallet_total: 2, purchase_doc: 'ИЗХ-101' })
    ], products: [
      { id: 'P1', item_id: 'I1', position: 1, sap_code: '3200123', product_name: 'ШУРУП 4X40', unit: 'бр.', qty: 12, cartons: 2, created_at: 'x' },
      { id: 'P2', item_id: 'I1', position: 2, sap_code: '5001', product_name: 'ТРЪБА 1/2" PPR', unit: 'л.м', qty: 6.5, cartons: null, created_at: 'x' },
      { id: 'P3', item_id: 'I2', position: 1, sap_code: '3200124', product_name: 'ШУРУП 4X50', unit: 'бр.', qty: 100, cartons: 4, created_at: 'x' }
    ] });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    const t = mod(h).textContent;
    ok('колона „Изходящ №"', t.indexOf('Изходящ №') >= 0);
    ok('„Стокова №" вече я няма в прегледа', t.indexOf('Стокова №') < 0);
    const sum = mod(h).querySelector('#ll-summary');
    ok('обобщението има „Артикули" и „Бройки"', /Артикули/.test(sum.textContent) && /Бройки/.test(sum.textContent));
    const srow = sum.querySelectorAll('tr')[1];
    const cells = Array.from(srow.querySelectorAll('td')).map(td => td.textContent.trim());
    ok('3 артикула за Петрич', cells[cells.length - 2] === '3', JSON.stringify(cells));
    ok('сума 118,5', cells[cells.length - 1] === '118,5', JSON.stringify(cells));

    const vprod = mod(h).querySelectorAll('tr[data-ll-vprod]');
    ok('под-ред с артикулите за двата реда', vprod.length === 2, String(vprod.length));
    ok('свит по подразбиране', !mod(h).querySelector('[data-ll-prodlist]'));
    realClick(h.w, vprod[0].querySelector('button'));
    const list = mod(h).querySelector('[data-ll-prodlist]');
    if (ok('разгънат показва таблицата', !!list)) {
      ok('с кода и името', /3200123/.test(list.textContent) && /ШУРУП 4X40/.test(list.textContent));
      ok('и кавичката в името', /ТРЪБА 1\/2" PPR/.test(list.textContent));
      ok('десетичната запетая', /6,5/.test(list.textContent), list.textContent);
    }
    ok('бутон „🖨 Опис" по един на палет', mod(h).querySelectorAll('button[onclick^="llPrint"][data-u]').length === 2,
      String(mod(h).querySelectorAll('button[data-u]').length));
  }

  section('к) Картата на обекта: артикулите — само четене');
  {
    const L_SENT = Object.assign({}, L_DRAFT, { status: 'sent', sent_at: '2026-09-21T07:00:00.000Z' });
    const h = env(STORE, { lists: [L_SENT], items: [item({ id: 'I1', purchase_doc: 'ИЗХ-100' })], products: [
      { id: 'P1', item_id: 'I1', position: 1, sap_code: '3200123', product_name: 'ШУРУП 4X40', unit: 'бр.', qty: 12, cartons: 2, created_at: 'x' }
    ] });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('заявката на обекта взима артикулите с ЕДИН embed',
      getsTo(h, 'loading_list_items').some(u => /loading_list_products\(\*\)/.test(decodeURIComponent(u)) && /store_name=eq\./.test(u)),
      getsTo(h, 'loading_list_items').join(' | '));
    const sprod = h.doc.querySelector('tr[data-ll-sprod="I1"]');
    if (ok('под-ред с артикулите', !!sprod)) {
      ok('брои ги', /Артикули \(1\)/.test(sprod.textContent), sprod.textContent);
      realClick(h.w, sprod.querySelector('button'));
      const tbl = h.doc.querySelector('tr[data-ll-sprod="I1"] [data-ll-prodlist]');
      if (ok('разгънат показва таблицата', !!tbl)) {
        ok('код, име, бройки, кашони', /3200123/.test(tbl.textContent) && /ШУРУП 4X40/.test(tbl.textContent) &&
          /12/.test(tbl.textContent) && /2/.test(tbl.textContent));
        ok('само четене — без полета', tbl.querySelectorAll('input').length === 0);
        ok('и без бутони за махане', tbl.querySelectorAll('button').length === 0);
      }
    }
    ok('отмятането остава по ред', !!btn(h.doc.getElementById('ll-card-L1'), '✅ Получено'));
  }

  section('л) „⚠️ Разлика" се пълни от артикулите на реда, без да пита Стока на път');
  {
    const L_SENT = Object.assign({}, L_DRAFT, { status: 'sent', sent_at: '2026-09-21T07:00:00.000Z' });
    const h = env(STORE, { lists: [L_SENT], items: [item({ id: 'I1', purchase_doc: 'ИЗХ-100' })], products: [
      { id: 'P1', item_id: 'I1', position: 1, sap_code: '3200123', product_name: 'ШУРУП 4X40', unit: 'бр.', qty: 12, cartons: 2, created_at: 'x' },
      { id: 'P2', item_id: 'I1', position: 2, sap_code: '5001', product_name: 'ТРЪБА 1/2" PPR', unit: 'л.м', qty: 6.5, cartons: null, created_at: 'x' }
    ], transit: [
      { purchase_doc: 'ИЗХ-100', store_name: 'Петрич', material_code: 'СНИМКА', material_name: 'ОТ СНИМКАТА',
        ordered_qty: 1, unit: 'бр.', position: '1', status: 'pending', supplier: WH }
    ] });
    let got = null;
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.openDiffSubmitModal = function (p) { got = p; };
    realClick(h.w, btn(h.doc.getElementById('ll-card-L1'), '⚠️ Разлика'));
    await ticks(); await ticks();
    if (ok('бланката е отворена', !!got)) {
      ok('с двата артикула на реда', got.items.length === 2, JSON.stringify(got.items));
      ok('кодът и количеството са от реда', got.items[0].sap === '3200123' && got.items[0].qty === 12,
        JSON.stringify(got.items[0]));
      ok('мярката също', got.items[1].unit === 'л.м');
      ok('нищо от снимката', !got.items.some(x => x.sap === 'СНИМКА'));
    }
    ok('goods_transit изобщо не е питан', getsTo(h, 'goods_transit').length === 0, getsTo(h, 'goods_transit').join(' | '));
  }

  section('л2) КОНТРОЛ: ред БЕЗ артикули — пак от Стока на път, както досега');
  {
    const L_SENT = Object.assign({}, L_DRAFT, { status: 'sent', sent_at: '2026-09-21T07:00:00.000Z' });
    const h = env(STORE, { lists: [L_SENT], items: [item({ id: 'I1', purchase_doc: 'ИЗХ-100' })], transit: [
      { purchase_doc: 'ИЗХ-100', store_name: 'Петрич', material_code: 'СНИМКА', material_name: 'ОТ СНИМКАТА',
        ordered_qty: 1, unit: 'бр.', position: '1', status: 'pending', supplier: WH }
    ] });
    let got = null;
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.openDiffSubmitModal = function (p) { got = p; };
    realClick(h.w, btn(h.doc.getElementById('ll-card-L1'), '⚠️ Разлика'));
    await ticks(); await ticks();
    ok('бланката е от снимката', !!got && got.items.length === 1 && got.items[0].sap === 'СНИМКА',
      JSON.stringify(got && got.items));
  }

  section('м) „↺ Отново от Стока на път" — от снимката, подредени по позиция като ЧИСЛО');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [item({ id: 'I1', purchase_doc: 'ИЗХ-100' })], transit: [
      { purchase_doc: 'ИЗХ-100', store_name: 'Петрич', material_code: 'A10', material_name: 'ДЕСЕТИ', ordered_qty: 10, unit: 'бр.', position: '10', status: 'pending', supplier: WH },
      { purchase_doc: 'ИЗХ-100', store_name: 'Петрич', material_code: 'A2', material_name: 'ВТОРИ', ordered_qty: 2, unit: 'бр.', position: '2', status: 'pending', supplier: WH },
      /* Друг обект със същия номер — не е наш. */
      { purchase_doc: 'ИЗХ-100', store_name: 'Гоце Делчев', material_code: 'X', material_name: 'ЧУЖД', ordered_qty: 1, unit: 'бр.', position: '1', status: 'pending', supplier: WH }
    ] });
    await openDraft(h);
    await openProducts(h, 0);
    const getsBefore = getsTo(h, 'goods_transit').length;
    /* Етикетът е сменен: бутонът е за „отначало", не за първо вземане —
       първото става само при отмятане на документа. */
    ok('старият етикет „Вземи артикулите" го няма', !btn(mod(h), 'Вземи артикулите'));
    realClick(h.w, btn(mod(h), '↺ Отново от Стока на път'));
    await ticks(); await ticks();
    ok('взето от ВЕЧЕ заредената снимка — без нова заявка',
      getsTo(h, 'goods_transit').length === getsBefore, getsTo(h, 'goods_transit').join(' | '));
    const pr = h.w.llDraft.items[0].products;
    ok('два артикула — само на този обект', pr.length === 2, JSON.stringify(pr.map(p => p.sap_code)));
    ok('„2" преди „10" (числово, не като текст)', pr[0] && pr[0].sap_code === 'A2' && pr[1].sap_code === 'A10',
      JSON.stringify(pr.map(p => p.sap_code)));
    ok('количеството е пренесено', pr[1] && pr[1].qty === 10);
    ok('нищо не е записано още — само в черновата', !h.calls.post.some(p => p.table === 'loading_list_products'));
  }

  section('н) Етикетът на снимката: „Документи от Стока на път · снимка към …"');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [item()], transit: [
      { purchase_doc: 'ИЗХ-100', store_name: 'Петрич', doc_date: '2026-08-20', status: 'pending', supplier: WH, created_at: '2026-09-01T05:00:00.000Z' },
      { purchase_doc: 'ИЗХ-101', store_name: 'Петрич', doc_date: '2026-08-25', status: 'pending', supplier: WH, created_at: '2026-08-15T05:00:00.000Z' }
    ] });
    await openDraft(h);
    const t = mod(h).textContent;
    ok('новото заглавие', /Документи от Стока на път/.test(t), t.slice(0, 400));
    ok('„снимка към" с НАЙ-новата дата', /снимка към 01\.09\.2026/.test(t), t.slice(0, 400));
    ok('старото „Чакащи стокови документи" го няма', t.indexOf('Чакащи стокови документи') < 0);
    ok('редакторът казва „Изходящ №"', t.indexOf('Изходящ №') >= 0);
  }

  section('п) Писмото към обекта носи артикулите под реда — сиво, само неговите');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [] });
    /* email.js не е в модулите — llSentHtmlFor иска само emailWrap. */
    h.w.emailWrap = function (body) { return '<!DOCTYPE html>' + body; };
    const list = Object.assign({}, L_DRAFT);
    const rows = [
      item({ id: 'I1', position: 1, purchase_doc: 'ИЗХ-100', products: [
        { sap_code: '3200123', product_name: 'ШУРУП 4X40', unit: 'бр.', qty: 12, cartons: 2 },
        { sap_code: '5001', product_name: 'ТРЪБА 1/2" PPR', unit: 'л.м', qty: 6.5, cartons: null }
      ] }),
      item({ id: 'I2', position: 2, pallet_no: 2, purchase_doc: 'ИЗХ-101', products: [] })
    ];
    const html = h.w.llSentHtmlFor(list, 'Петрич', rows);
    ok('кодовете и имената са вътре', html.indexOf('3200123') >= 0 && html.indexOf('ШУРУП 4X40') >= 0);
    ok('кавичката е в текста, не в атрибут', html.indexOf('ТРЪБА 1/2" PPR') >= 0);
    ok('бройките с мярката', /12 бр\./.test(html) && /6,5 л\.м/.test(html), html.slice(0, 900));
    ok('кашоните', html.indexOf('(2 каш.)') >= 0);
    ok('сиво и компактно', /font-size:11px;color:#64748b/.test(html));
    ok('ред без артикули НЕ получава празен под-ред',
      (html.match(/colspan="4"/g) || []).length === 1, String((html.match(/colspan="4"/g) || []).length));
    /* Писмото до СКЛАДА при приключване — без промяна (точка 8). */
    const closed = h.w.llClosedHtmlFor(list, rows);
    ok('писмото до склада НЕ носи артикулите', closed.indexOf('ШУРУП 4X40') < 0);
  }

  section('о) Скенер: прочетен код → 0 / 1 / 2+ резултата');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [item()] });
    await openDraft(h);
    await openProducts(h, 0);

    /* 1 резултат — попълва кода, името и мярката. */
    let n = await h.w.llHandleScannedEan(0, '3800001000011');
    ok('1 резултат', n === 1, String(n));
    const pf = h.w.llDraft.items[0]._pf;
    ok('кодът/името/мярката са в паметта', pf.sap_code === '3200123' && pf.product_name === 'ШУРУП 4X40' && pf.unit === 'бр.',
      JSON.stringify(pf));
    ok('и в полетата', $(h, 'll-pf-sap-0').value === '3200123' && $(h, 'll-pf-name-0').value === 'ШУРУП 4X40');
    ok('заявката е по ean_code с limit=2',
      getsTo(h, 'product_catalog').some(u => /ean_code=eq\.3800001000011/.test(u) && /limit=2/.test(u)),
      getsTo(h, 'product_catalog').join(' | '));

    /* 0 резултата — казва го и фокусът отива в „SAP код". */
    h.toasts.length = 0;
    n = await h.w.llHandleScannedEan(0, '4000000000000');
    ok('0 резултата', n === 0, String(n));
    ok('„Няма такъв баркод в каталога"', toastHas(h, /Няма такъв баркод в каталога/), JSON.stringify(h.toasts));
    ok('фокусът е в „SAP код"', h.doc.activeElement === $(h, 'll-pf-sap-0'),
      h.doc.activeElement && h.doc.activeElement.id);

    /* UPC-A: каталогът пази 12 цифри, скенерът може да върне 13 с водеща 0. */
    n = await h.w.llHandleScannedEan(0, '0012345678905');
    ok('13 цифри с водеща 0 намира 12-цифрения', n === 1 && h.w.llDraft.items[0]._pf.sap_code === '7001',
      JSON.stringify(h.w.llDraft.items[0]._pf));
    ok('търси по двете форми с in.(…)',
      getsTo(h, 'product_catalog').some(u => /ean_code=in\.\(0012345678905,012345678905\)/.test(u)),
      getsTo(h, 'product_catalog').join(' | '));

    /* Боклук (QR с текст) — не е баркод, без заявка. */
    const before = getsTo(h, 'product_catalog').length;
    h.toasts.length = 0;
    n = await h.w.llHandleScannedEan(0, 'https://example.com');
    ok('текст без цифри — без заявка', n === 0 && getsTo(h, 'product_catalog').length === before);
  }

  section('о2) Скенер: 2+ резултата → избор; режим „поредно" добавя и продължава');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [item()] });
    await openDraft(h);
    await openProducts(h, 0);
    /* Модалът без камерата: само панелът и състоянието. */
    const panel = h.doc.createElement('div');
    panel.id = 'll-scan-panel';
    h.doc.body.appendChild(panel);
    let resumed = 0, paused = 0;
    h.w.llScan = { row: 0, inst: { pause() { paused++; }, resume() { resumed++; } },
                   pending: null, choices: null, busy: false, last: '', lastAt: 0 };

    const n = await h.w.llHandleScannedEan(0, '3800009999990');
    ok('2 резултата', n === 2, String(n));
    const choices = panel.querySelectorAll('button[onclick^="llScanPick"]');
    ok('два бутона за избор', choices.length === 2, panel.innerHTML.slice(0, 200));
    realClick(h.w, choices[1]);
    ok('изборът попълва формата', h.w.llDraft.items[0]._pf.sap_code === '8002',
      JSON.stringify(h.w.llDraft.items[0]._pf));
    const q = h.doc.getElementById('ll-scan-qty');
    ok('модалът пита за бройки', !!q);
    ok('и фокусът е там', h.doc.activeElement === q, h.doc.activeElement && h.doc.activeElement.id);

    typeInto(h.w, q, '4');
    pressEnter(h.w, q);
    await ticks(); await ticks(); await ticks();
    const pr = h.w.llDraft.items[0].products;
    ok('Enter в модала добавя артикула', pr.length === 1 && pr[0].sap_code === '8002' && pr[0].qty === 4,
      JSON.stringify(pr));
    ok('скенерът продължава (resume)', resumed === 1, String(resumed));
    ok('и чака следващ код', h.w.llScan && !h.w.llScan.pending && !h.w.llScan.choices);

    /* Един и същ кадър два пъти подред не добавя два пъти. */
    h.w.llScan.busy = false;
    let calls = 0;
    const orig = h.w.llHandleScannedEan;
    h.w.llHandleScannedEan = function () { calls++; return Promise.resolve(1); };
    h.w.llScanOnRead('3800001000011');
    await ticks();
    h.w.llScan.busy = false; h.w.llScan.pending = null;
    h.w.llScanOnRead('3800001000011');
    await ticks();
    ok('един и същ код в две поредни четения → една обработка', calls === 1, String(calls));
    ok('и камерата е спряна на пауза при четенето', paused >= 1, String(paused));
    h.w.llHandleScannedEan = orig;
  }

  section('о3) Библиотеката: зарежда се с SRI и само веднъж; провалът е червен');
  {
    const h = env(WAREHOUSE, { lists: [L_DRAFT], items: [item()] });
    await openDraft(h);
    await openProducts(h, 0);
    ok('преди първото „Сканирай" — няма скрипт', !h.doc.querySelector('script[src*="html5-qrcode"]'));
    realClick(h.w, btn(mod(h), '📷 Сканирай'));
    realClick(h.w, btn(mod(h), '📷 Сканирай'));   /* второ натискане, докато зарежда */
    const scripts = h.doc.querySelectorAll('script[src*="html5-qrcode"]');
    ok('ЕДИН скрипт при две натискания', scripts.length === 1, String(scripts.length));
    const sc = scripts[0];
    ok('от cdnjs, версия 2.3.8',
      sc.getAttribute('src') === 'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
      sc.getAttribute('src'));
    ok('с integrity (SRI)', /^sha512-r6rDA7W6ZeQhvl8S7yRVQUKVHdexq/.test(sc.integrity || sc.getAttribute('integrity') || ''),
      sc.getAttribute('integrity'));
    ok('crossorigin=anonymous', (sc.crossOrigin || sc.getAttribute('crossorigin')) === 'anonymous');

    h.toasts.length = 0;
    sc.onerror();
    await ticks(); await ticks();
    ok('провалът е червен toast', h.toasts.some(t => /Скенерът не се зареди/.test(t.msg) && t.col === '#dc2626'),
      JSON.stringify(h.toasts));
    ok('полето за код остава и фокусът е там', h.doc.activeElement === $(h, 'll-pf-sap-0'),
      h.doc.activeElement && h.doc.activeElement.id);
    /* Провалът НЕ се кешира — мрежата на склада идва и си отива. */
    realClick(h.w, btn(mod(h), '📷 Сканирай'));
    ok('ново натискане опитва наново', h.doc.querySelectorAll('script[src*="html5-qrcode"]').length === 2,
      String(h.doc.querySelectorAll('script[src*="html5-qrcode"]').length));
    ok('библиотеката не е заредена в jsdom — глобал Html5Qrcode НЯМА', typeof h.w.Html5Qrcode === 'undefined');
  }

  report();
})();
