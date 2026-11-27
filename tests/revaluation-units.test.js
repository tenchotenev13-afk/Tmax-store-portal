/* Преоценка — етап 2 от 3 (23.11.2026): пореден номер на бройка
   (revaluation_units, тригер '<обект>-П0042'; от 27.11.2026 — 'KJ42',
   stores.unit_prefix + число, revaluation-unit-prefix-schema.sql) и снимки на реда
   (revaluation_items.photos, bucket-ът bulletin-files, префикс revaluation/).

   Интеграционно: shared.js + admin.js + stock-returns.js + push.js +
   email.js + loading.js + revaluation.js + revisions.js, в реда от
   index.html. Базата е симулирана в env(): revaluation_units с брояч по
   обект като тригера в revaluation-units-schema.sql (стойност от клиента се
   игнорира), cascade при изтрит ред, Content-Range при DELETE.
   stock-differences.js НЕ е зареден: diffCompressImage чака Image.onload, а
   jsdom не зарежда картинки — rvPhotoPut минава по резервния път (файлът
   без компресия). В браузъра stock-differences.js е поз. 19, преди
   revaluation.js (поз. 28).

   Мутационна проверка (23.11.2026) — чистият код: exit 0, 48 успешни; всеки
   вариант е пуснат срещу този тест и е паднал с exit 1:
     M1 rvUnitsWant връща 1 и за БР (без qty)
        → „POST … с 3 реда", „„бр." се нормализира като БР", импортът 2 → 4;
     M2 при намаление трие НАЙ-МАЛКИТЕ номера
        → „5 → 2: остават KJ1 и KJ2";
     M3 провалът без червен toast (грешката се поглъща)
        → „червен toast за номерата";
     M4 rvUnitsHtml без маркера „без номер — опитай пак"
        → „маркер …", „бутон „🔁 Опитай пак"";
     M5 rvCanPhoto без проверката за чернова
        → „без 📷 и без ✕ (бланката е подадена)";
     M6 rvUnitsLabel без свиване на поредиците
        → „под кода: „№ KJ1 … KJ3"" и още 3;
     M7 rvLoadSheet не пълни rvUnits от четенето
        → „регионалният вижда номера".
   Добавка (cross-file преглед, 23.11) — секция 9, чистият код: exit 0, 52
   успешни:
     M8 rvCoUnlock не номерира редовете на отключената бланка
        → „след „Отключи": БР 2 → 2 номера, M2 → 1", „без маркер … след отключването".
   Камера / галерия (24.11.2026) — 📷 „Снимай" → вход с capture, 🖼 „От
   галерията" → вход с multiple; чистият код: exit 0, 62 успешни:
     M9  махнат capture="environment" → „📷 → вход с capture…", „след пререндера 📷 пак…";
     M10 разменени входове в rvPhotoPick → „📷 → вход с capture…", „🖼 → вход без capture…";
     M11 rvCanPhoto без проверката за чернова → „без право: нито 📷 …, нито 🖼 …".
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, ok, section, report, dayOffset, ticks } = H;

const CAMP = { id: 'c-1', title: 'Ноември', kind: 'mandatory', starts_on: dayOffset(-1), ends_on: dayOffset(5), default_pct: 50, status: 'open', note: null };
const STORE_USER = { email: 'kardzhali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };
const REG_USER = { email: 'reg@temax.bg', display_name: 'Регионален', role: 'accounting', store_name: 'Централен офис', is_regional: true, assigned_stores: ['Кърджали'] };

let idSeq = 0;
/* stores.unit_prefix (27.11.2026) — „тригерът" дава префикс + число без нули. */
const PFX = { 'Кърджали': 'KJ', 'Шумен': 'SH', 'Габрово': 'GB' };
function env(o) {
  o = o || {};
  const db = {
    subs: (o.subs || []).map(x => Object.assign({}, x)),
    items: (o.items || []).map(x => Object.assign({}, x)),
    units: (o.units || []).map(x => Object.assign({}, x)),
    counters: Object.assign({}, o.counters || {}),
    uploads: []
  };
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'push.js', 'email.js', 'loading.js', 'revaluation.js', 'revisions.js'],
    user: o.user || STORE_USER,
    data: {
      revaluation_campaigns: [CAMP],
      revaluation_submissions: () => db.subs,
      revaluation_items: () => db.items,
      stores: [{ name: 'Кърджали' }],
      users: [],
      product_catalog: [],
      app_settings: [{ key: 'revaluation_stores', value: 'Кърджали' }]
    },
    fail: o.fail,
    confirm: true,
    globals: {
      pushToPeople: () => Promise.resolve({ ok: true }),
      sendEmail: () => Promise.resolve({ ok: true })
    }
  });
  h.db = db;
  h.colors = [];
  const t0 = h.w.toast;
  h.w.toast = (msg, c) => { h.colors.push(c); return t0(msg, c); };
  h.w.rvStoresOn = false; h.w.rvStoresList = ['Кърджали'];
  const orig = h.w.fetch;
  const res = (status, body, headers) => ({
    ok: status < 400, status,
    headers: { get: k => (headers || {})[k] || null },
    json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body))
  });
  const q = (url, k) => { const m = new RegExp('[?&]' + k + '=eq\\.([^&]+)').exec(url); return m ? decodeURIComponent(m[1]) : null; };
  h.w.fetch = function (url, init) {
    const m = (init && init.method || 'GET').toUpperCase();
    url = String(url);
    if (/\/storage\/v1\/object\//.test(url)) {
      db.uploads.push(url);
      return Promise.resolve(o.storageFail ? res(500, { message: 'boom' }) : res(200, { Key: 'x' }));
    }
    const p = orig(url, init);   /* harness: calls.* и fail */
    if (/\/rest\/v1\/revaluation_units/.test(url)) {
      return p.then(r => {
        if (!r.ok) return r;
        if (m === 'GET') {
          const it = q(url, 'item_id'), sub = q(url, 'submission_id');
          return res(200, db.units.filter(u => (it ? u.item_id === it : true) && (sub ? u.submission_id === sub : true))
            .sort((a, b) => a.created_at < b.created_at ? -1 : 1).map(u => Object.assign({}, u)));
        }
        if (m === 'POST') {
          const rows = [].concat(JSON.parse(init.body)).map(b => {
            const item = db.items.find(x => x.id === b.item_id);
            const st = item.store_name;
            db.counters[st] = (db.counters[st] || 0) + 1;
            const u = { id: 'u-' + (++idSeq), item_id: b.item_id, submission_id: item.submission_id, store_name: st,
              unit_no: PFX[st] + db.counters[st], created_at: new Date(Date.now() + idSeq).toISOString() };
            db.units.push(u); return u;
          });
          return res(201, rows);
        }
        if (m === 'DELETE') {
          const mm = /id=in\.\(([^)]*)\)/.exec(url);
          const ids = mm ? mm[1].split(',') : [];
          const before = db.units.length;
          db.units = db.units.filter(u => ids.indexOf(u.id) < 0);
          return res(204, null, { 'Content-Range': '*/' + (before - db.units.length) });
        }
        return r;
      });
    }
    if (/\/rest\/v1\/revaluation_items/.test(url) && m === 'DELETE') {
      return p.then(r => {
        if (!r.ok) return r;
        const id = q(url, 'id');
        db.items = db.items.filter(x => x.id !== id);
        db.units = db.units.filter(u => u.item_id !== id);   /* on delete cascade */
        return res(204, null, { 'Content-Range': '*/1' });
      });
    }
    if (m === 'PATCH' && /\/rest\/v1\/revaluation_items/.test(url)) {
      return p.then(r => {
        if (r.ok) { const it = db.items.find(x => x.id === q(url, 'id')); if (it) Object.assign(it, JSON.parse(init.body)); }
        return r;
      });
    }
    if (m !== 'POST' || !/revaluation_(submissions|items)/.test(url)) return p;
    return p.then(r => {
      if (!r.ok) return r;
      const defs = /revaluation_submissions/.test(url) ? { status: 'draft', no_items: false } : {};
      const row = Object.assign({ id: 'id-' + (++idSeq) }, defs, JSON.parse(init.body));
      if (/revaluation_submissions/.test(url)) db.subs.push(row);
      if (/revaluation_items/.test(url)) db.items.push(row);
      return res(201, [row]);
    });
  };
  return h;
}
const mod = h => h.doc.getElementById('mod-revaluation');
const $ = (h, id) => h.doc.getElementById(id);
const row = (h, id) => $(h, 'rv-row-' + id);
const unitsTxt = (h, id) => { const el = row(h, id) && row(h, id).querySelector('.rv-units'); return el ? el.textContent : ''; };
const unitPosts = h => h.calls.post.filter(x => x.table === 'revaluation_units');
const lastToast = h => { const t = h.calls.toast[h.calls.toast.length - 1]; return t ? [].concat(t).join(' ') : ''; };
/* 27.11.2026: прозорецът „➕ Добави артикул" — снимката е задължителна,
   слага се през скрития вход за камерата (истински change). */
async function addRow(h, code, unit, qty) {
  if (!$(h, 'rv-form')) { realClick(h.w, btn(mod(h), 'Добави артикул')); await ticks(1); }
  else if ($(h, 'rv-f-next')) { realClick(h.w, $(h, 'rv-f-next')); await ticks(1); }
  $(h, 'rv-a-code').value = code; $(h, 'rv-a-name').value = 'Артикул ' + code;
  $(h, 'rv-a-unit').value = unit; $(h, 'rv-a-qty').value = qty;
  $(h, 'rv-a-std').value = '10'; $(h, 'rv-a-comment').value = 'дефект';
  const inp = $(h, 'rv-f-cam');
  Object.defineProperty(inp, 'files', { value: [new h.w.File(['x'], 'p.jpg', { type: 'image/jpeg' })], configurable: true });
  fire(h.w, inp, 'change');
  realClick(h.w, $(h, 'rv-f-save')); await ticks(8);
  return h.db.items[h.db.items.length - 1];
}
async function editQty(h, id, val) {
  const inp = row(h, id).querySelector('input[data-f="qty"]');
  inp.value = val; fire(h.w, inp, 'change'); await ticks(8);
}
const SUB_DRAFT = { id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', status: 'draft', no_items: false, default_pct: 50 };

(async function run() {

  section('1. Нов ред: БР qty 3 → 3 номера; M2 9,33 → 1 номер');
  {
    const h = env();
    await h.w.loadRevaluation(); await ticks(5);
    const a = await addRow(h, '53531', 'БР', '3');
    ok('POST към revaluation_units с 3 реда', unitPosts(h).length === 1 && unitPosts(h)[0].body.length === 3, JSON.stringify(unitPosts(h).map(x => x.body)));
    ok('клиентът НЕ праща unit_no (дава го тригерът)', unitPosts(h)[0].body.every(b => !('unit_no' in b)));
    ok('тялото: item_id / submission_id / store_name на реда', unitPosts(h)[0].body.every(b => b.item_id === a.id && b.submission_id === a.submission_id && b.store_name === 'Кърджали'));
    ok('под кода: „№ KJ1 … KJ3"', unitsTxt(h, a.id) === '№ KJ1 … KJ3', unitsTxt(h, a.id));
    ok('toast „Редът е добавен"', /Редът е добавен/.test(lastToast(h)), lastToast(h));
    /* Г. (25.11.2026) — видима бележка под формата, не само toast */
    const note = () => { const e = $(h, 'rv-add-note'); return e ? e.textContent : ''; };
    ok('бележка на страницата: „Запиши на стоката: № KJ1 … KJ3"', /Запиши на стоката: № KJ1 … KJ3$/.test(note()), note());
    ok('…и в прозореца (27.11.2026): „✍ Запиши на стоката: № KJ1 … KJ3"', !!$(h, 'rv-f-note') && /Запиши на стоката: № KJ1 … KJ3$/.test($(h, 'rv-f-note').textContent), $(h, 'rv-f-note') && $(h, 'rv-f-note').textContent);
    const b = await addRow(h, '61000', 'M2', '9,33');
    ok('M2 9,33 → 1 номер', h.db.units.filter(u => u.item_id === b.id).length === 1);
    ok('под кода: „№ KJ4"', unitsTxt(h, b.id) === '№ KJ4', unitsTxt(h, b.id));
    ok('бележката се сменя със следващото добавяне: „… № KJ4"', /Запиши на стоката: № KJ4$/.test(note()), note());
    realClick(h.w, $(h, 'rv-f-done')); await ticks(1);
    ok('остава и при затворен прозорец (до следващото добавяне)', !$(h, 'rv-form') && /KJ4$/.test(note()), note());
    const c = await addRow(h, '61001', 'бр.', '2');
    ok('„бр." се нормализира като БР → 2 номера', h.db.units.filter(u => u.item_id === c.id).length === 2);
    ok('без маркер „без номер" на нито един ред', !mod(h).querySelector('.rv-unit-miss'));
  }

  section('2. Промяна на qty: увеличение → нови номера; намаление → трият се най-големите');
  {
    const h = env();
    await h.w.loadRevaluation(); await ticks(5);
    const a = await addRow(h, '53531', 'БР', '3');
    const b = await addRow(h, '61000', 'M2', '2');
    await editQty(h, a.id, '5');
    ok('3 → 5: два нови номера', h.db.units.filter(u => u.item_id === a.id).length === 5);
    ok('номерата не се преизползват — дупка за реда на M2', unitsTxt(h, a.id) === '№ KJ1 … KJ3, KJ5 … KJ6', unitsTxt(h, a.id));
    await editQty(h, a.id, '2');
    const left = h.db.units.filter(u => u.item_id === a.id).map(u => u.unit_no).sort();
    ok('5 → 2: остават KJ1 и KJ2', JSON.stringify(left) === JSON.stringify(['KJ1', 'KJ2']), JSON.stringify(left));
    const del = h.calls.del.filter(u => /revaluation_units/.test(u));
    ok('един DELETE с трите най-големи id-та', del.length === 1 && (del[0].match(/u-/g) || []).length === 3, del.join(' | '));
    ok('екранът: „№ KJ1 … KJ2"', unitsTxt(h, a.id) === '№ KJ1 … KJ2', unitsTxt(h, a.id));
    await editQty(h, b.id, '7');
    ok('M2: промяна на qty не дава нов номер', h.db.units.filter(u => u.item_id === b.id).length === 1);
    await editQty(h, a.id, '0');
    ok('БР qty 0 → 0 номера, без маркер', h.db.units.filter(u => u.item_id === a.id).length === 0 && !row(h, a.id).querySelector('.rv-unit-miss'));
    const nextNo = await (async () => { await editQty(h, a.id, '1'); return h.db.units.filter(u => u.item_id === a.id).map(u => u.unit_no)[0]; })();
    ok('след триене следващият номер е нов (KJ7), не KJ3', nextNo === 'KJ7', nextNo);
  }

  section('3. Изтрит ред → номерата му падат (cascade), без отделен DELETE');
  {
    const h = env();
    await h.w.loadRevaluation(); await ticks(5);
    const a = await addRow(h, '53531', 'БР', '2');
    const b = await addRow(h, '61000', 'БР', '1');
    realClick(h.w, row(h, a.id).querySelector('button[onclick^="rvDeleteRow"]')); await ticks(6);
    ok('редът е изтрит', !row(h, a.id) && !h.db.items.some(x => x.id === a.id));
    ok('номерата му ги няма в базата', !h.db.units.some(u => u.item_id === a.id));
    ok('клиентът не праща DELETE към revaluation_units', !h.calls.del.some(u => /revaluation_units/.test(u)));
    ok('другият ред си пази номера', unitsTxt(h, b.id) === '№ KJ3', unitsTxt(h, b.id));
  }

  section('4. Провалено създаване на номерата → червен toast, маркер и бутон; „Опитай пак" ги създава');
  {
    const h = env({ fail: { POST: /revaluation_units/ } });
    await h.w.loadRevaluation(); await ticks(5);
    const a = await addRow(h, '53531', 'БР', '2');
    ok('редът е записан', h.db.items.some(x => x.id === a.id));
    ok('червен toast за номерата', /Номерата на бройките/.test(lastToast(h)) && h.colors[h.colors.length - 1] === '#dc2626', lastToast(h) + ' / ' + h.colors[h.colors.length - 1]);
    ok('НЕ пише „Редът е добавен" (грешката не се поглъща)', !/Редът е добавен/.test(lastToast(h)));
    ok('без номера → без бележка „Запиши на стоката"', !$(h, 'rv-add-note'));
    const miss = row(h, a.id).querySelector('.rv-unit-miss');
    ok('маркер „без номер — опитай пак"', !!miss && /без номер — опитай пак/.test(miss.textContent), miss && miss.textContent);
    const retry = row(h, a.id).querySelector('.rv-unit-retry');
    ok('бутон „🔁 Опитай пак"', !!retry);
    /* базата се оправя — без fail */
    const h2fetch = h.w.fetch;
    h.w.fetch = function (url, init) {
      if (/revaluation_units/.test(url) && (init && init.method) === 'POST') {
        const item = h.db.items.find(x => x.id === JSON.parse(init.body)[0].item_id);
        const rows = JSON.parse(init.body).map(() => {
          h.db.counters['Кърджали'] = (h.db.counters['Кърджали'] || 0) + 1;
          const u = { id: 'u-r' + h.db.counters['Кърджали'], item_id: item.id, submission_id: item.submission_id, store_name: 'Кърджали', unit_no: 'KJ' + h.db.counters['Кърджали'], created_at: new Date().toISOString() };
          h.db.units.push(u); return u;
        });
        return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve(rows), text: () => Promise.resolve('') });
      }
      return h2fetch(url, init);
    };
    realClick(h.w, retry); await ticks(8);
    ok('след „Опитай пак": 2 номера', h.db.units.filter(u => u.item_id === a.id).length === 2);
    ok('маркерът изчезва', !row(h, a.id).querySelector('.rv-unit-miss'));
    ok('номерата са под кода', unitsTxt(h, a.id) === '№ KJ1 … KJ2', unitsTxt(h, a.id));
  }

  section('5. Заварени: processed без номера → без маркер; паднало четене → банер, не маркери');
  {
    const items = [{ id: 'i-1', submission_id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', sap_code: '53531', unit: 'БР', qty: 2, sort_order: 1 }];
    const h = env({ subs: [Object.assign({}, SUB_DRAFT, { status: 'processed' })], items });
    await h.w.loadRevaluation(); await ticks(6);
    ok('processed: няма маркер „без номер"', !!row(h, 'i-1') && !row(h, 'i-1').querySelector('.rv-unit-miss'));
    const h2 = env({ subs: [SUB_DRAFT], items, fail: { GET: /revaluation_units/ } });
    await h2.w.loadRevaluation(); await ticks(6);
    ok('паднало четене: банер „Номерата … не се заредиха"', !!$(h2, 'rv-units-load-fail'));
    ok('паднало четене: без маркери по редовете', !row(h2, 'i-1').querySelector('.rv-unit-miss'));
    const h3 = env({ subs: [SUB_DRAFT], items });
    await h3.w.loadRevaluation(); await ticks(6);
    ok('чернова без номера → маркер с бутон', !!row(h3, 'i-1').querySelector('.rv-unit-retry'));
  }

  section('6. ZSTOCK импорт: нови редове получават номера; повторен импорт с по-голямо количество — още');
  {
    const h = env();
    await h.w.loadRevaluation(); await ticks(5);
    const hdr = ['Материал', 'Описание на материал', 'Неограничен', 'Базова мерна единица', 'Продажна цена', 'Завод'];
    await h.w.rvImportAoa([hdr, ['53531', 'Арка', 2, 'БР', 17.79, '1508'], ['61000', 'Плочки', 1.5, 'M2', 20, '1508']]); await ticks(10);
    const a = h.db.items.find(x => x.sap_code === '53531'), b = h.db.items.find(x => x.sap_code === '61000');
    ok('БР 2 → 2 номера', h.db.units.filter(u => u.item_id === a.id).length === 2);
    ok('M2 1,5 → 1 номер', h.db.units.filter(u => u.item_id === b.id).length === 1);
    const n = $(h, 'rv-add-note');
    ok('след импорта — една обща бележка „Запиши номерата върху бройките — виж под кода на всеки ред"', !!n && /Запиши номерата върху бройките — виж под кода на всеки ред/.test(n.textContent), n && n.textContent);
    await h.w.rvImportAoa([hdr, ['53531', 'Арка', 4, 'БР', 17.79, '1508']]); await ticks(10);
    ok('повторен импорт 2 → 4: още 2 номера', h.db.units.filter(u => u.item_id === a.id).length === 4);
  }

  section('7. Снимки: 📷 в чернова → bulletin-files/revaluation/ → photos на реда');
  {
    const h = env();
    await h.w.loadRevaluation(); await ticks(5);
    const a = await addRow(h, '53531', 'БР', '1');
    realClick(h.w, $(h, 'rv-f-done')); await ticks(1);
    /* От 27.11.2026 редът идва от прозореца с 1 снимка — броим спрямо нея. */
    const up0 = h.db.uploads.length;
    ok('прозорецът качи 1 снимка и я записа в реда', up0 === 1 && h.w.rvPhotoList(a).length === 1, up0);
    // Два бутона (24.11.2026): 📷 „Снимай" → вход с capture; 🖼 „От галерията" → вход с multiple, без capture.
    const camBtn = () => row(h, a.id).querySelector('button[title="Снимай"]');
    const galBtn = () => row(h, a.id).querySelector('button[title="От галерията"]');
    ok('бутон 📷 „Снимай" на реда в чернова', !!camBtn() && camBtn().textContent === '📷');
    ok('бутон 🖼 „От галерията" на реда в чернова', !!galBtn() && galBtn().textContent === '🖼');
    let hits = [];
    const hook = () => mod(h).querySelectorAll('input[type=file]').forEach(el => { el.click = () => { hits.push(el); }; });
    hook();
    realClick(h.w, camBtn());
    ok('📷 отваря точно един вход', hits.length === 1, String(hits.length));
    const camInp = hits[0];
    ok('📷 → вход с capture="environment", accept image/*, без multiple', !!camInp && camInp.getAttribute('capture') === 'environment' && camInp.getAttribute('accept') === 'image/*' && !camInp.multiple, camInp && camInp.outerHTML);
    hits = [];
    realClick(h.w, galBtn());
    ok('🖼 отваря точно един вход', hits.length === 1, String(hits.length));
    const galInp = hits[0];
    ok('🖼 → вход без capture, с multiple, accept image/*', !!galInp && !galInp.hasAttribute('capture') && galInp.multiple && galInp.getAttribute('accept') === 'image/*', galInp && galInp.outerHTML);
    ok('двата бутона водят до различни входове', !!camInp && camInp !== galInp);
    // Качване през 🖼 (две снимки)
    const f1 = new h.w.File(['a'], 'a.jpg', { type: 'image/jpeg' }), f2 = new h.w.File(['b'], 'b.jpg', { type: 'image/jpeg' });
    Object.defineProperty(galInp, 'files', { value: [f1, f2], configurable: true });
    fire(h.w, galInp, 'change'); await ticks(10);
    ok('🖼: две качвания в bulletin-files/revaluation/', h.db.uploads.length === up0 + 2 && h.db.uploads.slice(up0).every(u => /\/storage\/v1\/object\/bulletin-files\/revaluation\/\d+_[a-z0-9]+\.jpg$/.test(u)), h.db.uploads.join(' | '));
    const patch = h.calls.patch.filter(x => x.table === 'revaluation_items' && x.body.photos).pop();
    ok('🖼: PATCH на реда с 3 публични адреса (1 + 2)', !!patch && patch.body.photos.length === 3 && patch.body.photos.every(u => /\/object\/public\/bulletin-files\/revaluation\//.test(u)), patch && JSON.stringify(patch.body));
    ok('3 миниатюри на реда', row(h, a.id).querySelectorAll('.rv-thumb').length === 3);
    // Качване през 📷 (след пререндера — новите елементи)
    hits = []; hook();
    realClick(h.w, camBtn());
    const camInp2 = hits[0];
    ok('след пререндера 📷 пак → входът с capture', !!camInp2 && camInp2.getAttribute('capture') === 'environment');
    const f3 = new h.w.File(['c'], 'c.jpg', { type: 'image/jpeg' });
    Object.defineProperty(camInp2, 'files', { value: [f3], configurable: true });
    fire(h.w, camInp2, 'change'); await ticks(10);
    ok('📷: трето качване в bulletin-files/revaluation/', h.db.uploads.length === up0 + 3 && /\/bulletin-files\/revaluation\//.test(h.db.uploads[up0 + 2]), h.db.uploads.join(' | '));
    const patch3 = h.calls.patch.filter(x => x.table === 'revaluation_items' && x.body.photos).pop();
    ok('📷: снимката е в photos на реда (4 адреса, първите 3 запазени)', !!patch3 && patch3.body.photos.length === 4 && patch3.body.photos.slice(0, 3).join() === patch.body.photos.join(), patch3 && JSON.stringify(patch3.body));
    ok('4 миниатюри на реда', row(h, a.id).querySelectorAll('.rv-thumb').length === 4);
    realClick(h.w, row(h, a.id).querySelector('.rv-photo-rm')); await ticks(5);
    const p2 = h.calls.patch.filter(x => x.table === 'revaluation_items' && 'photos' in x.body).pop();
    ok('✕ маха снимката само от масива (без DELETE към storage)', p2.body.photos.length === 3 && !h.calls.del.some(u => /storage/.test(u)));
    /* От 27.11.2026 снимката е задължителна (решение на Тенчо). */
    ok('„Подай" иска снимка: без нея → „няма снимка"', h.w.rvRowProblems({ qty: 1, store_comment: 'x', proposed_price: 5 }).join() === 'няма снимка');
    ok('…със снимка → чисто', h.w.rvRowProblems({ qty: 1, store_comment: 'x', proposed_price: 5, photos: ['https://x/a.jpg'] }).length === 0);
  }

  section('8. Регионалният: миниатюра → клик → цял екран; без 📷 и ✕ в подадена');
  {
    const items = [{ id: 'i-1', submission_id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', sap_code: '53531', unit: 'БР', qty: 1, sort_order: 1,
      store_comment: 'дефект', std_price: 10, discount_pct: 50, proposed_price: 5, photos: ['https://x/storage/v1/object/public/bulletin-files/revaluation/1_a.jpg'] }];
    const units = [{ id: 'u-1', item_id: 'i-1', submission_id: 's-1', store_name: 'Кърджали', unit_no: 'KJ42', created_at: '2026-11-23T08:00:00Z' }];
    const h = env({ user: REG_USER, subs: [Object.assign({}, SUB_DRAFT, { status: 'submitted' })], items, units });
    await h.w.loadRevaluation(); await ticks(6);
    await h.w.rvCoOpenStore('Кърджали'); await ticks(6);
    ok('регионалният вижда номера', unitsTxt(h, 'i-1') === '№ KJ42', unitsTxt(h, 'i-1'));
    const th = row(h, 'i-1') && row(h, 'i-1').querySelector('.rv-thumb');
    ok('регионалният вижда миниатюрата', !!th);
    ok('без 📷 и без ✕ (бланката е подадена)', !row(h, 'i-1').querySelector('.rv-photo-btn') && !row(h, 'i-1').querySelector('.rv-photo-rm'));
    const photoBtns = [].filter.call(mod(h).querySelectorAll('button'), b => b.title === 'Снимай' || b.title === 'От галерията' || /📷|🖼/.test(b.textContent));
    ok('без право: нито 📷 „Снимай", нито 🖼 „От галерията" (<button>)', photoBtns.length === 0, photoBtns.map(b => b.outerHTML).join(' | '));
    realClick(h.w, th);
    const view = $(h, 'rv-photo-view');
    ok('клик → снимката на цял екран', !!view && view.querySelector('img').getAttribute('src') === items[0].photos[0]);
    realClick(h.w, view);
    ok('клик върху нея → затваря', !$(h, 'rv-photo-view'));
  }

  section('9. „Отключи бланката“ на обработена отпреди етап 2 → редовете се номерират наведнъж');
  {
    const CO_USER = { email: 'elica@temax.bg', display_name: 'Елица', role: 'accounting', store_name: 'Централен офис', is_regional: false, assigned_stores: [] };
    const items = [
      { id: 'i-1', submission_id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', sap_code: '53531', unit: 'БР', qty: 2, sort_order: 1 },
      { id: 'i-2', submission_id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', sap_code: '61000', unit: 'M2', qty: 3.5, sort_order: 2 }
    ];
    const h = env({ user: CO_USER, subs: [Object.assign({}, SUB_DRAFT, { status: 'processed' })], items });
    await h.w.loadRevaluation(); await ticks(6);
    await h.w.rvCoOpenStore('Кърджали'); await ticks(6);
    ok('processed: без номера и без маркер', !row(h, 'i-1').querySelector('.rv-unit-miss') && unitsTxt(h, 'i-1') === '');
    realClick(h.w, btn(mod(h), 'Отключи бланката')); await ticks(12);
    ok('след „Отключи": БР 2 → 2 номера, M2 → 1', h.db.units.filter(u => u.item_id === 'i-1').length === 2 && h.db.units.filter(u => u.item_id === 'i-2').length === 1);
    ok('без маркер „без номер" след отключването', !mod(h).querySelector('.rv-unit-miss'));
    ok('toast „Бланката е отключена" (без грешка)', lastToast(h) === 'Бланката е отключена' && h.colors[h.colors.length - 1] !== '#dc2626', lastToast(h));
  }

  report();
})();
