/* Преоценка на телефон — т.1, 2, 5, 6 на Теодор (27.11.2026) и задължителна
   снимка (решение на Тенчо 27.11.2026).

   - „➕ Добави артикул" (голям, червен) НАЙ-ГОРЕ в бланката — над жълтото
     предупреждение, таблицата и картите (молба на Теодор 27.11.2026;
     дотогава беше под таблицата), и при празна бланка;
     лентата „＋ Ред" я няма. Бутонът отваря прозорец #rv-form (в body):
     скенер / SAP код / EAN, описание, МЕ, ст. цена, кол., %, нова цена,
     причина, снимки („📷 Снимай" / „🖼 От галерията", миниатюри с ✕).
   - „💾 Запази": проверка → качване на снимките → запис на реда с photos →
     номерата → бележката „✍ Запиши на стоката: № KJ1" и „➕ Следващ".
     Паднало качване → нищо не се записва.
   - Под 700 px: карти вместо таблицата (обект / регионален), с
     „✏️ Промени" / „🗑 Изтрий" само в чернова. ЦО — без карти.
   - „✅ Подай" спира ред без снимка („няма снимка" под кода).

   Интеграционно: shared.js + admin.js + stock-returns.js + push.js +
   email.js + loading.js + revaluation.js + revisions.js, в реда от
   index.html. Лейаутът (≥ 44 px, 16 px, без хоризонтален скрол) jsdom не го
   смята — правилата са заковани с регекс срещу index.html (раздел 9), а
   размерите са мерени в истински браузър (отчетът на сесията).

   Мутационна проверка — виж края на файла (MUTATIONS).
*/
'use strict';

const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, ok, section, report, dayOffset, ticks } = H;

const DIR = process.argv[2] || path.join(__dirname, '..');
const CAMP = { id: 'c-1', title: 'Ноември', kind: 'mandatory', starts_on: dayOffset(-1), ends_on: dayOffset(5), default_pct: 50, status: 'open', note: null };
const STORE_USER = { email: 'kardzhali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };
const REG_USER = { email: 'reg@temax.bg', display_name: 'Регионален', role: 'accounting', store_name: 'Централен офис', is_regional: true, assigned_stores: ['Кърджали'] };
const CO_USER = { email: 'co@temax.bg', display_name: 'Контролинг', role: 'controlling', store_name: 'Централен офис' };
const CATALOG = [{ sap_code: '53531', product_name: 'АРКА ГРАДИНСКА МЕТАЛНА', default_unit: 'БР', sale_price: 17.79, ean_code: '3800123456789' }];
const SUB_DRAFT = { id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', status: 'draft', no_items: false, default_pct: 50 };
const PHOTO = 'https://x/storage/v1/object/public/bulletin-files/revaluation/1_a.jpg';
const ITEM = (id, extra) => Object.assign({ id, submission_id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', sap_code: '53531',
  product_name: 'АРКА ГРАДИНСКА МЕТАЛНА', unit: 'БР', qty: 1, std_price: 17.79, discount_pct: 50, proposed_price: 8.9,
  store_comment: 'счупен крак', sort_order: 1, photos: [PHOTO] }, extra || {});

let idSeq = 0;
function env(o) {
  o = o || {};
  const db = {
    subs: (o.subs || []).map(x => Object.assign({}, x)),
    items: (o.items || []).map(x => Object.assign({}, x)),
    units: (o.units || []).map(x => Object.assign({}, x)),
    counter: 0,
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
      product_catalog: url => /sap_code=eq\.53531|ean_code=eq\.3800123456789/.test(url) ? CATALOG : [],
      app_settings: [{ key: 'revaluation_stores', value: 'Кърджали' }]
    },
    confirm: true,
    globals: {
      pushToPeople: () => Promise.resolve({ ok: true }),
      sendEmail: () => Promise.resolve({ ok: true })
    }
  });
  h.db = db;
  h.uploadFail = () => false;   /* (n — поредното качване, от 1) → true = 500 */
  h.colors = [];
  const t0 = h.w.toast;
  h.w.toast = (msg, c) => { h.colors.push([msg, c]); return t0(msg, c); };
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
      return Promise.resolve(h.uploadFail(db.uploads.length) ? res(500, { message: 'boom' }) : res(200, { Key: 'x' }));
    }
    const p = orig(url, init);
    if (/\/rest\/v1\/revaluation_units/.test(url)) {
      return p.then(r => {
        if (!r.ok) return r;
        if (m === 'GET') {
          const it = q(url, 'item_id'), sub = q(url, 'submission_id');
          return res(200, db.units.filter(u => (it ? u.item_id === it : true) && (sub ? u.submission_id === sub : true)).map(u => Object.assign({}, u)));
        }
        if (m === 'POST') {
          const rows = [].concat(JSON.parse(init.body)).map(b => {
            const item = db.items.find(x => x.id === b.item_id);
            const u = { id: 'u-' + (++idSeq), item_id: b.item_id, submission_id: item.submission_id, store_name: item.store_name,
              unit_no: 'KJ' + (++db.counter), created_at: new Date(Date.now() + idSeq).toISOString() };
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
        db.units = db.units.filter(u => u.item_id !== id);
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
const itemPosts = h => h.calls.post.filter(x => x.table === 'revaluation_items');
const itemPatches = h => h.calls.patch.filter(x => x.table === 'revaluation_items');
const subPatches = h => h.calls.patch.filter(x => x.table === 'revaluation_submissions' && x.body.status);
const lastRed = h => { const r = h.colors.filter(c => c[1] === '#dc2626').pop(); return r ? r[0] : ''; };
const errTxt = h => { const e = $(h, 'rv-f-err'); return e && e.style.display !== 'none' ? e.textContent : ''; };
function files(h, inputId, names) {
  const inp = $(h, inputId);
  Object.defineProperty(inp, 'files', { value: names.map(n => new h.w.File([n], n + '.jpg', { type: 'image/jpeg' })), configurable: true });
  fire(h.w, inp, 'change');
}
async function enter(h, code) {
  const el = $(h, 'rv-a-code');
  el.value = code; fire(h.w, el, 'input');
  const ev = { key: 'Enter', keyCode: 13, preventDefault() {} };
  h.w.eval('(function(event){' + el.getAttribute('onkeydown') + '})').call(el, ev);
  await ticks(4);
}
/* Истинско писане в поле с oninput (% / нова цена / ст. цена). */
function type(h, id, val) { const el = $(h, id); el.value = val; fire(h.w, el, 'input'); }
async function openAdd(h) { realClick(h.w, $(h, 'rv-add-btn')); await ticks(1); }
async function save(h) { realClick(h.w, $(h, 'rv-f-save')); await ticks(10); }
/* Молба на Теодор 27.11.2026: бутонът е НАЙ-ГОРЕ — преди жълтото
   „Не се подават артикули…", преди таблицата и преди картите. */
function checkOrder(h, b, label) {
  const before = (x, y) => !!x && !!y && (x.compareDocumentPosition(y) & 4) !== 0;
  const warn = [...mod(h).querySelectorAll('div')].find(d => /^Не се подават артикули от проверка на срокове/.test(d.textContent));
  ok(label + ': бутонът е ПРЕДИ жълтото предупреждение', before(b, warn));
  ok(label + ': …ПРЕДИ таблицата (.tbl-rv-sheet table)', before(b, mod(h).querySelector('.tbl-rv-sheet table')));
  ok(label + ': …ПРЕДИ картите (#rv-cards)', before(b, $(h, 'rv-cards')));
}

(async function run() {

  section('1. Бутонът „➕ Добави артикул" — най-горе (над предупреждението и таблицата), и при празна бланка; „＋ Ред" го няма');
  {
    const h = env(); await h.w.loadRevaluation(); await ticks(5);
    const b = $(h, 'rv-add-btn');
    ok('празна бланка → бутонът е там', !!b && b.textContent === '➕ Добави артикул');
    ok('…червен, голям (клас rv-add-big)', b && b.className === 'rv-add-big');
    ok('…точно един бутон rv-add-btn', mod(h).querySelectorAll('button#rv-add-btn').length === 1);
    checkOrder(h, b, 'празна бланка');
    ok('старият „＋ Ред" го няма', !btn(mod(h), '＋ Ред'));
    ok('лентата #rv-add я няма', !$(h, 'rv-add') && !$(h, 'rv-a-code'));
    await openAdd(h);
    const f = $(h, 'rv-form');
    ok('прозорецът се отваря в body, не в модула', !!f && f.parentNode === h.doc.body && !mod(h).contains(f));
    ok('клас rv-form-bg (не modal-bg — клик встрани не го затваря)', f.className === 'rv-form-bg');
    ok('заглавие „➕ Добави артикул"', f.querySelector('.rv-f-head b').textContent === '➕ Добави артикул');
    ok('„📷 Сканирай", „📷 Снимай", „🖼 От галерията", „💾 Запази", „Отказ"',
      !!btn(f, '📷 Сканирай') && !!btn(f, '📷 Снимай') && !!btn(f, '🖼 От галерията') && !!btn(f, '💾 Запази') && !!btn(f, 'Отказ'));
    ok('полета: код, описание, МЕ, ст. цена, кол., %, нова цена, причина',
      ['rv-a-code', 'rv-a-name', 'rv-a-unit', 'rv-a-std', 'rv-a-qty', 'rv-a-pct', 'rv-a-price', 'rv-a-comment'].every(id => !!f.querySelector('#' + id)));
    ok('кол. = 1, % = процентът на бланката (50)', $(h, 'rv-a-qty').value === '1' && $(h, 'rv-a-pct').value === '50');
    ok('снимки: „Няма снимка"', $(h, 'rv-f-photos').textContent === 'Няма снимка');
    ok('входът за камерата: capture="environment", за галерията — multiple',
      $(h, 'rv-f-cam').getAttribute('capture') === 'environment' && !$(h, 'rv-f-cam').multiple && $(h, 'rv-f-file').multiple && !$(h, 'rv-f-file').hasAttribute('capture'));
    realClick(h.w, btn(f, 'Отказ')); await ticks(1);
    ok('„Отказ" затваря без запис', !$(h, 'rv-form') && itemPosts(h).length === 0);
  }

  section('2. Целият път: код + Enter → цена → % → снимка → „💾 Запази" → номерата → „➕ Следващ"');
  {
    const h = env(); await h.w.loadRevaluation(); await ticks(5);
    await openAdd(h);
    await enter(h, '53531');
    ok('кодът зарежда описание, МЕ, ст. цена', $(h, 'rv-a-name').value === 'АРКА ГРАДИНСКА МЕТАЛНА' && $(h, 'rv-a-unit').value === 'БР' && $(h, 'rv-a-std').value === '17,79');
    ok('…и новата цена по % на бланката (50 % → 8,90)', $(h, 'rv-a-price').value === '8,90', $(h, 'rv-a-price').value);
    type(h, 'rv-a-pct', '60');
    ok('% 60 → нова цена 7,12', $(h, 'rv-a-price').value === '7,12', $(h, 'rv-a-price').value);
    type(h, 'rv-a-price', '10,00');
    ok('нова цена 10,00 → % 43,79', $(h, 'rv-a-pct').value === '43,79', $(h, 'rv-a-pct').value);
    $(h, 'rv-a-qty').value = '2';
    $(h, 'rv-a-comment').value = 'одраскан';
    files(h, 'rv-f-cam', ['a']);
    ok('снимката е в прозореца като миниатюра с ✕', $(h, 'rv-f-photos').querySelectorAll('.rv-f-tile').length === 1 && !!$(h, 'rv-f-photos').querySelector('.rv-f-tile-x'));
    ok('…още нищо не е качено', h.db.uploads.length === 0);
    await save(h);
    ok('1 качване в bulletin-files/revaluation/', h.db.uploads.length === 1 && /\/bulletin-files\/revaluation\//.test(h.db.uploads[0]), h.db.uploads.join(' | '));
    const p = itemPosts(h)[0];
    ok('1 POST на реда', itemPosts(h).length === 1);
    ok('…с photos (публичният адрес)', p && Array.isArray(p.body.photos) && p.body.photos.length === 1 && /\/object\/public\/bulletin-files\/revaluation\//.test(p.body.photos[0]), JSON.stringify(p && p.body.photos));
    ok('…последно пипнатото решава: цена 10, % 43,79', p && p.body.proposed_price === 10 && p.body.discount_pct === 43.79, JSON.stringify(p && p.body));
    ok('…кол. 2, ст. 17,79, причина', p && p.body.qty === 2 && p.body.std_price === 17.79 && p.body.store_comment === 'одраскан');
    ok('2 номера (БР × 2)', h.db.units.length === 2);
    const note = $(h, 'rv-f-note');
    ok('в прозореца: „✍ Запиши на стоката: № KJ1 … KJ2"', !!note && note.textContent === '✍ Запиши на стоката: № KJ1 … KJ2', note && note.textContent);
    ok('прозорецът остава отворен, с „➕ Следващ"', !!$(h, 'rv-form') && !!$(h, 'rv-f-next'));
    ok('редът е в таблицата', h.doc.querySelectorAll('#rv-rows tr[id^="rv-row-"]').length === 1);
    realClick(h.w, $(h, 'rv-f-next')); await ticks(1);
    ok('„➕ Следващ" — празни полета, без да затваря', !!$(h, 'rv-form') && $(h, 'rv-a-code').value === '' && $(h, 'rv-a-name').value === '' &&
      $(h, 'rv-a-comment').value === '' && $(h, 'rv-a-price').value === '' && $(h, 'rv-a-qty').value === '1' && $(h, 'rv-a-pct').value === '50');
    ok('…и без снимка', $(h, 'rv-f-photos').textContent === 'Няма снимка');
    ok('…фокусът е в кода (компютър)', h.doc.activeElement === $(h, 'rv-a-code'));
    /* втори артикул, снимки от галерията (2), без oninput на % — % решава */
    $(h, 'rv-a-code').value = '11111'; $(h, 'rv-a-name').value = 'НОВ'; $(h, 'rv-a-std').value = '2'; $(h, 'rv-a-comment').value = 'ръждясал';
    files(h, 'rv-f-file', ['b', 'c']);
    await save(h);
    const p2 = itemPosts(h)[1];
    ok('втори ред: 2 снимки, цена 1,00 от 50 %', p2 && p2.body.photos.length === 2 && p2.body.proposed_price === 1 && p2.body.discount_pct === 50, JSON.stringify(p2 && p2.body));
    ok('…номер KJ3', $(h, 'rv-f-note').textContent === '✍ Запиши на стоката: № KJ3');
    realClick(h.w, $(h, 'rv-f-done')); await ticks(1);
    ok('„Затвори" затваря', !$(h, 'rv-form'));
    ok('нула notOk', h.calls.notOk.length === 0, JSON.stringify(h.calls.notOk));
  }

  section('3. Без снимка / без причина / кол. 0 → нищо не се записва, червено съобщение');
  {
    const h = env(); await h.w.loadRevaluation(); await ticks(5);
    await openAdd(h);
    await enter(h, '53531');
    $(h, 'rv-a-comment').value = 'одраскан';
    await save(h);
    ok('без снимка → 0 POST, 0 качвания', itemPosts(h).length === 0 && h.db.uploads.length === 0);
    ok('…„няма снимка" в прозореца', /няма снимка/.test(errTxt(h)), errTxt(h));
    ok('…и червен toast', /няма снимка/.test(lastRed(h)), lastRed(h));
    files(h, 'rv-f-cam', ['a']);
    ok('нова снимка маха съобщението', errTxt(h) === '');
    $(h, 'rv-a-comment').value = ''; $(h, 'rv-a-qty').value = '0';
    await save(h);
    ok('кол. 0 и без причина → отказ с двете', itemPosts(h).length === 0 && /количеството трябва да е над 0/.test(errTxt(h)) && /няма причина/.test(errTxt(h)), errTxt(h));
    $(h, 'rv-a-qty').value = '1'; $(h, 'rv-a-comment').value = 'х';
    realClick(h.w, h.doc.querySelector('#rv-f-photos .rv-f-tile-x')); await ticks(1);
    ok('✕ маха снимката в прозореца', $(h, 'rv-f-photos').textContent === 'Няма снимка');
    await save(h);
    ok('…и пак не записва', itemPosts(h).length === 0 && /няма снимка/.test(errTxt(h)));
    /* граница: кол. 0,5 (над 0) минава */
    files(h, 'rv-f-cam', ['a']);
    $(h, 'rv-a-qty').value = '0,5';
    await save(h);
    ok('кол. 0,5 → записва (граница > 0)', itemPosts(h).length === 1 && itemPosts(h)[0].body.qty === 0.5);
  }

  section('4. Паднало качване → нищо не се записва; повторният опит качва само падналата');
  {
    const h = env(); await h.w.loadRevaluation(); await ticks(5);
    await openAdd(h);
    await enter(h, '53531');
    $(h, 'rv-a-comment').value = 'одраскан';
    files(h, 'rv-f-file', ['a', 'b']);
    h.uploadFail = n => n === 2;          /* втората от двете пада */
    await save(h);
    ok('1 от 2 падна → 0 POST на реда', itemPosts(h).length === 0, itemPosts(h).length);
    ok('…и 0 заявки за номера', h.calls.post.filter(x => x.table === 'revaluation_units').length === 0);
    ok('…червено в прозореца „Снимките не са качени — нищо не е записано"', /Снимките не са качени — нищо не е записано/.test(errTxt(h)), errTxt(h));
    ok('…бланката не е създадена (без празна чернова)', h.calls.post.filter(x => x.table === 'revaluation_submissions').length === 0);
    ok('…полетата и снимките остават', $(h, 'rv-a-code').value === '53531' && $(h, 'rv-f-photos').querySelectorAll('.rv-f-tile').length === 2);
    ok('…„💾 Запази" пак е активен', !$(h, 'rv-f-save').disabled && $(h, 'rv-f-save').textContent === '💾 Запази');
    h.uploadFail = () => false;
    await save(h);
    ok('повторен опит → качва само падналата (общо 3 качвания)', h.db.uploads.length === 3, h.db.uploads.length);
    ok('…и записва реда с 2 различни адреса', itemPosts(h).length === 1 && itemPosts(h)[0].body.photos.length === 2 &&
      itemPosts(h)[0].body.photos[0] !== itemPosts(h)[0].body.photos[1]);
    /* всички падат */
    realClick(h.w, $(h, 'rv-f-next')); await ticks(1);
    await enter(h, '53531'); $(h, 'rv-a-comment').value = 'х';
    files(h, 'rv-f-cam', ['c']);
    h.uploadFail = () => true;
    await save(h);
    ok('всички паднали → пак 1 ред общо', itemPosts(h).length === 1);
  }

  section('5. Записан ред без номера → маркерът „без номер — опитай пак", както досега');
  {
    const h = env(); await h.w.loadRevaluation(); await ticks(5);
    h.w.fetch = (f => function (url, init) {
      if (/revaluation_units/.test(String(url)) && (init && init.method) === 'POST') return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }), text: () => Promise.resolve('boom') });
      return f(url, init);
    })(h.w.fetch);
    await openAdd(h);
    await enter(h, '53531'); $(h, 'rv-a-comment').value = 'х';
    files(h, 'rv-f-cam', ['a']);
    await save(h);
    ok('редът е записан', itemPosts(h).length === 1);
    ok('в прозореца: „без номер — „🔁 Опитай пак" на реда"', /без номер/.test($(h, 'rv-f-note').textContent), $(h, 'rv-f-note').textContent);
    const id = h.w.rvItems[0].id;
    ok('редът има маркера „без номер — опитай пак"', /без номер — опитай пак/.test($(h, 'rv-row-' + id).textContent));
    ok('…и картата', /без номер — опитай пак/.test($(h, 'rv-card-' + id).textContent));
  }

  section('6. Карти (под 700 px): съдържание и бутони; „✏️ Промени" кол. 1 → 3 дава 3 номера');
  {
    const items = [ITEM('i-1'), ITEM('i-2', { sap_code: '8025298', product_name: 'ПРЕОЦ.ЛАМПА', qty: 2, unit: 'бр.', photos: null, sort_order: 2, store_comment: '' })];
    const units = [{ id: 'u-1', item_id: 'i-1', submission_id: 's-1', store_name: 'Кърджали', unit_no: 'KJ7', created_at: '2026-11-27T08:00:00Z' }];
    const h = env({ subs: [SUB_DRAFT], items, units });
    h.db.counter = 7;
    await h.w.loadRevaluation(); await ticks(6);
    const wrap = mod(h).querySelector('.tbl-rv-sheet');
    ok('обектът: таблицата е с rv-has-cards (под 700 px се скрива)', wrap.classList.contains('rv-has-cards'));
    const c1 = $(h, 'rv-card-i-1'), c2 = $(h, 'rv-card-i-2');
    ok('2 карти', !!c1 && !!c2 && mod(h).querySelectorAll('.rv-card').length === 2);
    ok('с редове: точно един бутон rv-add-btn', mod(h).querySelectorAll('button#rv-add-btn').length === 1);
    checkOrder(h, $(h, 'rv-add-btn'), 'с редове');
    ok('карта 1: код, № KJ7, описание', c1.querySelector('.rv-card-code').textContent === '53531' && c1.querySelector('.rv-units').textContent === '№ KJ7' && c1.querySelector('.rv-card-name').textContent === 'АРКА ГРАДИНСКА МЕТАЛНА');
    ok('…„1 БР · 50 % → 8,90 (ст. 17,79)"', c1.querySelector('.rv-card-line').textContent === '1 БР · 50 % → 8,90 (ст. 17,79)', c1.querySelector('.rv-card-line').textContent);
    ok('…причина и миниатюра', c1.querySelector('.rv-card-why').textContent === 'счупен крак' && c1.querySelectorAll('.rv-thumb').length === 1);
    ok('…„✏️ Промени" и „🗑 Изтрий"', !!btn(c1, '✏️ Промени') && !!btn(c1, '🗑 Изтрий'));
    ok('карта 2: бадж „вече преоценен", без причина, без снимка', !!c2.querySelector('.rv-repeat') && !c2.querySelector('.rv-card-why') && !c2.querySelector('.rv-thumb'));
    /* ✏️ Промени на ред 1 */
    realClick(h.w, btn(c1, '✏️ Промени')); await ticks(1);
    const f = $(h, 'rv-form');
    ok('прозорецът: „✏️ Промени ред", данните на реда', f.querySelector('.rv-f-head b').textContent === '✏️ Промени ред' &&
      $(h, 'rv-a-code').value === '53531' && $(h, 'rv-a-qty').value === '1' && $(h, 'rv-a-price').value === '8,90' && $(h, 'rv-a-comment').value === 'счупен крак');
    ok('…код, описание и МЕ — само за четене; без „📷 Сканирай"', $(h, 'rv-a-code').readOnly && $(h, 'rv-a-name').readOnly && $(h, 'rv-a-unit').readOnly && !btn(f, 'Сканирай'));
    ok('…номерата се виждат: „№ KJ7"', f.querySelector('.rv-f-units').textContent === '№ KJ7');
    ok('…наличната снимка е в прозореца', $(h, 'rv-f-photos').querySelectorAll('img').length === 1);
    $(h, 'rv-a-qty').value = '3';
    await save(h);
    const pt = itemPatches(h).pop();
    ok('PATCH на реда: qty 3, снимката запазена, без ново качване', pt && /id=eq\.i-1$/.test(pt.url) && pt.body.qty === 3 && pt.body.photos.length === 1 && pt.body.photos[0] === PHOTO && h.db.uploads.length === 0, JSON.stringify(pt && pt.body));
    ok('без нов ред (0 POST на редове)', itemPosts(h).length === 0);
    const mine = h.db.units.filter(u => u.item_id === 'i-1');
    ok('кол. 1 → 3 дава 3 номера (KJ7 + 2 нови)', mine.length === 3, mine.map(u => u.unit_no).join(','));
    ok('в прозореца: „✍ Запиши на стоката: № KJ7 … KJ9"', $(h, 'rv-f-note').textContent === '✍ Запиши на стоката: № KJ7 … KJ9', $(h, 'rv-f-note').textContent);
    ok('…без „➕ Следващ" при промяна', !$(h, 'rv-f-next') && !!$(h, 'rv-f-done'));
    ok('картата показва „№ KJ7 … KJ9" и „3 БР"', $(h, 'rv-card-i-1').querySelector('.rv-units').textContent === '№ KJ7 … KJ9' && /^3 БР/.test($(h, 'rv-card-i-1').querySelector('.rv-card-line').textContent));
    realClick(h.w, $(h, 'rv-f-done')); await ticks(1);
    /* промяна без кол. → без заявка за номерата */
    const nGet = h.calls.get.filter(u => /revaluation_units/.test(u)).length;
    realClick(h.w, btn($(h, 'rv-card-i-1'), '✏️ Промени')); await ticks(1);
    $(h, 'rv-a-comment').value = 'счупен крак и ъгъл';
    await save(h);
    ok('само причината → PATCH, без четене на номерата', itemPatches(h).pop().body.store_comment === 'счупен крак и ъгъл' && h.calls.get.filter(u => /revaluation_units/.test(u)).length === nGet);
    realClick(h.w, $(h, 'rv-f-done')); await ticks(1);
    /* махане на единствената снимка при промяна → отказ */
    realClick(h.w, btn($(h, 'rv-card-i-1'), '✏️ Промени')); await ticks(1);
    realClick(h.w, h.doc.querySelector('#rv-f-photos .rv-f-tile-x')); await ticks(1);
    const nP = itemPatches(h).length;
    await save(h);
    ok('без снимка при промяна → отказ, без PATCH', itemPatches(h).length === nP && /няма снимка/.test(errTxt(h)));
    realClick(h.w, btn($(h, 'rv-form'), 'Отказ')); await ticks(1);
    ok('„Отказ" не маха снимката от реда', h.w.rvItems[0].photos.length === 1);
    /* 🗑 Изтрий от картата */
    realClick(h.w, btn($(h, 'rv-card-i-2'), '🗑 Изтрий')); await ticks(5);
    ok('🗑 Изтрий от картата → DELETE на реда', h.calls.del.some(u => /revaluation_items\?id=eq\.i-2/.test(u)) && !$(h, 'rv-card-i-2'));
  }

  section('7. „✅ Подай": ред без снимка спира — „няма снимка" под кода и в картата');
  {
    const items = [ITEM('i-1'), ITEM('i-2', { photos: null, sort_order: 2 }), ITEM('i-3', { photos: [], sort_order: 3 })];
    const h = env({ subs: [SUB_DRAFT], items });
    await h.w.loadRevaluation(); await ticks(6);
    realClick(h.w, btn(mod(h), '✅ Подай')); await ticks(6);
    ok('бланката НЕ е подадена', subPatches(h).length === 0);
    const bad = id => { const e = h.doc.querySelector('#rv-row-' + id + ' .rv-bad'); return e ? e.textContent : ''; };
    ok('i-2 (null) и i-3 ([]) → „няма снимка" под кода', bad('i-2') === 'няма снимка' && bad('i-3') === 'няма снимка', bad('i-2') + ' / ' + bad('i-3'));
    ok('i-1 (със снимка) — чист', bad('i-1') === '');
    ok('картата на i-2 — червена, с „няма снимка"', $(h, 'rv-card-i-2').classList.contains('rv-card-bad') && $(h, 'rv-card-i-2').querySelector('.rv-bad').textContent === 'няма снимка');
    ok('toast „2 реда не минават"', h.calls.toast.some(t => String(t).indexOf('2 реда не минават') >= 0));
    /* снимка от картата (✏️ Промени) → минава */
    for (const id of ['i-2', 'i-3']) {
      realClick(h.w, btn($(h, 'rv-card-' + id), '✏️ Промени')); await ticks(1);
      files(h, 'rv-f-cam', [id]);
      await save(h);
      realClick(h.w, $(h, 'rv-f-done')); await ticks(1);
    }
    ok('след снимките маркерите падат', !h.doc.querySelector('#rv-rows .rv-bad'));
    realClick(h.w, btn(mod(h), '✅ Подай')); await ticks(10);
    ok('…и бланката е подадена', subPatches(h).length === 1 && subPatches(h)[0].body.status !== 'draft', JSON.stringify(subPatches(h).map(x => x.body.status)));
  }

  section('8. ZSTOCK ред без снимка също спира; „Нямаме за преоценка" — без промяна');
  {
    const h = env({ subs: [SUB_DRAFT] });
    await h.w.loadRevaluation(); await ticks(5);
    const HDR = ['Завод', 'Материал', 'Описание на материал', 'Неограничен', 'Базова мерна единица', 'Продажна Цена'];
    await h.w.rvImportAoa([HDR, ['1508', 53531, 'АРКА', 1, 'БР', 17.79]]); await ticks(8);
    const it = h.w.rvItems[0];
    it.store_comment = 'стар'; it.proposed_price = 8.9;
    h.w.rvRender();
    realClick(h.w, btn(mod(h), '✅ Подай')); await ticks(6);
    ok('ZSTOCK ред без снимка → „няма снимка", не е подадена', subPatches(h).length === 0 && h.doc.querySelector('#rv-row-' + it.id + ' .rv-bad').textContent === 'няма снимка');
    ok('и на реда (компютър) има 📷 / 🖼 за снимка', !!h.doc.querySelector('#rv-row-' + it.id + ' button[title="Снимай"]'));
    const e = env({ subs: [SUB_DRAFT] });
    await e.w.loadRevaluation(); await ticks(5);
    realClick(e.w, btn(mod(e), 'Нямаме за преоценка')); await ticks(10);
    ok('„🚫 Нямаме за преоценка" при празна бланка → подадена, без проверка за снимки', subPatches(e).length === 1 && subPatches(e)[0].body.no_items === true);
    ok('…и „➕ Добави артикул" изчезва', !$(e, 'rv-add-btn'));
  }

  section('9. Регионалният, ЦО, извън прозореца; CSS правилата за телефон');
  {
    const items = [ITEM('i-1')];
    const r = env({ user: REG_USER, subs: [Object.assign({}, SUB_DRAFT, { status: 'submitted' })], items });
    await r.w.loadRevaluation(); await ticks(6);
    await r.w.rvCoOpenStore('Кърджали'); await ticks(6);
    /* Регионалните са admin / accounting → изгледът на ЦО (rvIsCoViewer):
       таблицата остава и на телефон, без карти — „без промяна" по задачата. */
    ok('регионалният: без карти, таблицата остава', !r.doc.querySelector('.rv-card') && !mod(r).querySelector('.rv-has-cards') && !!$(r, 'rv-row-i-1'));
    ok('…в таблицата редакцията е както досега (полета в реда)', r.doc.querySelectorAll('#rv-rows input').length > 0);
    const c = env({ user: CO_USER, subs: [Object.assign({}, SUB_DRAFT, { status: 'approved' })], items });
    await c.w.loadRevaluation(); await ticks(6);
    c.w.rvCoOpenStore('Кърджали'); await ticks(8);
    ok('ЦО: без карти и без rv-has-cards (таблицата остава)', !c.doc.querySelector('.rv-card') && !mod(c).querySelector('.rv-has-cards') && !!mod(c).querySelector('.tbl-rv-sheet'));
    ok('ЦО: без „➕ Добави артикул"', !$(c, 'rv-add-btn'));
    ok('ЦО: rvFormOpen → false', c.w.rvFormOpen() === false && !$(c, 'rv-form'));
    const x = env({ subs: [SUB_DRAFT], items });
    await x.w.loadRevaluation(); await ticks(5);
    x.w.rvCampaigns[0].ends_on = dayOffset(-1); x.w.rvRender();
    ok('извън прозореца: без бутона, без „✏️ Промени", rvFormOpen → false', !$(x, 'rv-add-btn') && !btn($(x, 'rv-card-i-1'), 'Промени') && x.w.rvFormOpen() === false);
    /* отворен прозорец, после кампанията изтича → „Запази" отказва */
    const y = env({ subs: [SUB_DRAFT], items });
    await y.w.loadRevaluation(); await ticks(5);
    await openAdd(y); await enter(y, '53531'); $(y, 'rv-a-comment').value = 'х'; files(y, 'rv-f-cam', ['a']);
    y.w.rvCampaigns[0].ends_on = dayOffset(-1);
    await save(y);
    ok('изтекла кампания при отворен прозорец → отказ, без качване', itemPosts(y).length === 0 && y.db.uploads.length === 0 && /само за четене/.test(errTxt(y)));
    /* EAN в полето + „Запази" → първо каталогът, без запис */
    const z = env({ subs: [SUB_DRAFT] });
    await z.w.loadRevaluation(); await ticks(5);
    await openAdd(z);
    $(z, 'rv-a-code').value = '3800123456789';
    files(z, 'rv-f-cam', ['a']);
    await save(z);
    ok('EAN + „Запази" → попълва 53531, 0 POST, 0 качвания', $(z, 'rv-a-code').value === '53531' && itemPosts(z).length === 0 && z.db.uploads.length === 0);

    /* Последно пипнатото решава: цена 12 (oninput), после % сменен без
       oninput (напр. автопопълване) → пак цена 12, % от нея; обратно — % печели. */
    const w = env({ subs: [SUB_DRAFT] });
    await w.w.loadRevaluation(); await ticks(5);
    await openAdd(w); await enter(w, '53531'); $(w, 'rv-a-comment').value = 'х'; files(w, 'rv-f-cam', ['a']);
    type(w, 'rv-a-price', '12');
    $(w, 'rv-a-pct').value = '20';
    await save(w);
    const pw = itemPosts(w)[0];
    ok('цената пипната последна → 12,00 и % 32,55 (не 20 % → 14,23)', pw && pw.body.proposed_price === 12 && pw.body.discount_pct === 32.55, JSON.stringify(pw && [pw.body.proposed_price, pw.body.discount_pct]));
    realClick(w.w, $(w, 'rv-f-next')); await ticks(1);
    await enter(w, '53531'); $(w, 'rv-a-comment').value = 'х'; files(w, 'rv-f-cam', ['b']);
    type(w, 'rv-a-price', '12');
    type(w, 'rv-a-pct', '20');
    await save(w);
    const pw2 = itemPosts(w)[1];
    ok('% пипнат последен → 20 % → 14,23', pw2 && pw2.body.proposed_price === 14.23 && pw2.body.discount_pct === 20, JSON.stringify(pw2 && [pw2.body.proposed_price, pw2.body.discount_pct]));

    const css = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    ok('CSS: полетата в прозореца 16px и ≥ 44px', /\.rv-form input\[type=text\]\{[^}]*font-size:16px;[^}]*min-height:44px/.test(css));
    ok('CSS: бутоните в прозореца ≥ 44px, 16px', /\.rv-f-btn\{min-height:44px;font-size:16px/.test(css));
    ok('CSS: ✕ на миниатюрата ≥ 44px', /\.rv-f-tile-x\{min-height:44px/.test(css));
    ok('CSS: под 700px прозорецът е на цял екран', /@media\(max-width:699px\)\{\s*\.rv-form-bg\{padding:0;\}\s*\.rv-form\{max-width:none;height:100%;border-radius:0;\}/.test(css));
    ok('CSS: под 700px картите се показват, таблицата с rv-has-cards се крие',
      /@media\(max-width:699px\)\{[\s\S]*?#mod-revaluation \.rv-cards\{display:block;\}[\s\S]*?#mod-revaluation \.tbl-rv-sheet\.rv-has-cards\{display:none;\}/.test(css));
    ok('CSS: картите по подразбиране скрити (компютър)', /#mod-revaluation \.rv-cards\{display:none;\}/.test(css));
    ok('CSS: прозорецът под скенера (z-index 300 < 400)', /\.rv-form-bg\{position:fixed;inset:0;z-index:300;/.test(css));
  }

  report();
})();

/* MUTATIONS (27.11.2026) — чистият код: exit 0, 106 успешни; всеки вариант на
   revaluation.js е пуснат срещу този тест и е паднал с exit 1:
     M1 rvRowProblems без „няма снимка" → „бланката НЕ е подадена", „i-2 … „няма снимка" под кода";
     M2 „Запази" без проверката за снимка → „без снимка → 0 POST, 0 качвания";
     M3 паднало качване се поглъща → „1 от 2 падна → 0 POST на реда";
     M4 промяна на кол. без rvUnitsSync → „кол. 1 → 3 дава 3 номера";
     M5 „➕ Следващ" затваря вместо да чисти → „„➕ Следващ" — празни полета, без да затваря";
     M6 винаги % (без form.last) → „цената пипната последна → 12,00";
     M7 картите с бутони и извън черновата → „извън прозореца: без бутона, без „✏️ Промени"";
     M8 карти и за ЦО → „ЦО: без карти и без rv-has-cards";
     M9 повторният опит качва всичко наново → „повторен опит → качва само падналата".

   Бутонът най-горе (молба на Теодор, 27.11.2026) — чистият код: exit 0,
   113 успешни; всеки вариант на revaluation.js е паднал с exit 1:
     Ма бутонът върнат най-долу (след rvCardsHtml) → „… ПРЕДИ жълтото
        предупреждение / таблицата / картите" (празна бланка и с редове);
     Мб бутонът и горе, и долу → „…точно един бутон rv-add-btn" (и двата случая);
     Мв бутонът махнат изцяло → „празна бланка → бутонът е там" + редът. */
