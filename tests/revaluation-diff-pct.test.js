/* Преоценка — еднакъв артикул с РАЗЛИЧЕН % (решение на Тенчо 25.11.2026,
   заменя правилото от 23.11.2026 „еднакъв артикул = еднакъв %").
   Обектът и регионалният не спират (tests/revaluation-scan.test.js секции
   11–12, tests/revaluation-labels.test.js секция 8). Тук — Контролингът:
   - предложението за код: обичайният 8-код на ПЪРВИЯ ред по sort_order и на
     всички със СЪЩАТА цена; на ред с друга цена — без код, с бележка;
   - „Приеми предложените" пропуска тези кодове и казва колко остават;
   - пазачът: един new_sap_code с две различни sale_price спира „Готово за
     обект" и VK11 (свеж прочит от базата; числа, не низове).

   Интеграционно: shared.js + admin.js + stock-returns.js + push.js +
   email.js + loading.js + revaluation.js + revisions.js, в реда от index.html.

   Мутационна проверка — в лога claude/log/2026-11-25-preocenka-razlichen-procent.md.
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, section, report, dayOffset, ticks } = H;

const CAMP = { id: 'c-1', title: 'Ноември', kind: 'mandatory', starts_on: dayOffset(-1), ends_on: dayOffset(5), default_pct: 50, status: 'open', note: null };
const ADMIN = { email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', role: 'admin', store_name: 'Централен офис' };
const SUB = st => ({ id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', status: st, no_items: false, default_pct: 50,
  submitted_at: '2026-11-25T10:00:00Z', approved_at: '2026-11-25T11:00:00Z' });
const IT = (id, o) => Object.assign({ id: id, submission_id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', sort_order: 1, sap_code: '14557',
  product_name: 'КИЛИМ ' + id, unit: 'БР', qty: 1, std_price: 120, discount_pct: 30, proposed_price: 84,
  store_comment: 'дефект ' + id, new_sap_code: null, sale_price: null, co_qty: null }, o || {});

function env(o) {
  o = o || {};
  const db = { items: (o.items || []).map(x => Object.assign({}, x)) };
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'push.js', 'email.js', 'loading.js', 'revaluation.js', 'revisions.js'],
    user: ADMIN,
    data: {
      revaluation_campaigns: [CAMP],
      revaluation_submissions: [o.sub || SUB('approved')],
      /* o.fresh — какво „е в базата" за свежия прочит на пазача, ако се
         различава от екрана */
      revaluation_items: url => (o.fresh && /select=id,new_sap_code,sale_price/.test(url)) ? o.fresh : db.items,
      revaluation_units: [],
      revaluation_codes: [],
      stores: [{ name: 'Кърджали' }],
      users: [],
      product_catalog: [],
      minus_plants: [],
      app_settings: [{ key: 'revaluation_stores', value: 'Кърджали' }]
    },
    fail: o.fail,
    confirm: true,
    globals: { pushToPeople: () => Promise.resolve({ ok: true }), sendEmail: () => Promise.resolve({ ok: true }) }
  });
  h.db = db;
  h.colors = [];
  const t0 = h.w.toast;
  h.w.toast = (msg, c) => { h.colors.push(c); return t0(msg, c); };
  h.w.rvStoresOn = false; h.w.rvStoresList = ['Кърджали'];
  h.files = []; h.aoas = [];
  h.w.XLSX = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: a => { h.aoas.push(a); return { __aoa: a }; },
      book_append_sheet: (wb, ws, n) => { wb.SheetNames.push(n); }
    },
    write: () => 'QkFTRTY0',
    writeFile: (wb, f) => { h.files.push(f); }
  };
  return h;
}
const mod = h => h.doc.getElementById('mod-revaluation');
const $ = (h, id) => h.doc.getElementById(id);
const lastToast = h => { const t = h.calls.toast[h.calls.toast.length - 1]; return t ? [].concat(t).join(' ') : ''; };
const codeInp = (h, id) => { const r = $(h, 'rv-row-' + id); return r ? r.querySelector('input[data-f="new_sap_code"]') : null; };
const noteOf = (h, id) => { const r = $(h, 'rv-row-' + id); const e = r && r.querySelector('.rv-code-other'); return e ? e.textContent : ''; };
const badOf = (h, id) => { const r = $(h, 'rv-row-' + id); const e = r && r.querySelector('.rv-bad'); return e ? e.textContent : ''; };
const subPatches = h => h.calls.patch.filter(p => /revaluation_submissions/.test(p.url));
const itemPatch = (h, id) => h.calls.patch.filter(p => /revaluation_items/.test(p.url) && new RegExp('id=eq\\.' + id + '$').test(p.url));
const NOTE = 'същият артикул с друга цена — въведи отделен код';
async function open(h) {
  await h.w.loadRevaluation(); await ticks(6);
  await h.w.rvCoOpenStore('Кърджали'); await ticks(6);
}
const vkBtn = h => btn(mod(h), '📄 VK11');
const doneBtn = h => btn(mod(h), '✅ Готово за обект');
const done = (o, extra) => Object.assign({ co_qty: 1 }, o, extra || {});

(async function run() {
  section('1. Предложение: първи ред (по sort_order) — код; ред с друга цена — без код, с бележка');
  {
    /* Нарочно в обратен ред в масива: първият по sort_order е „a" (втори в списъка). */
    const h = env({ items: [IT('b', { sort_order: 2, discount_pct: 60, proposed_price: 48 }), IT('a', { sort_order: 1 })] });
    await open(h);
    const ia = codeInp(h, 'a'), ib = codeInp(h, 'b');
    ok('ред a (sort 1, 84 €) → предложен 8014557', ia && ia.value === '8014557' && ia.classList.contains('rv-prop'), ia && ia.value);
    ok('ред a — без бележка', noteOf(h, 'a') === '');
    ok('ред b (sort 2, 48 €) → празно поле за код', ib && ib.value === '', ib && ib.value);
    ok('ред b → бележка „' + NOTE + '"', noteOf(h, 'b') === NOTE, noteOf(h, 'b'));
    const sb = $(h, 'rv-row-b').querySelector('input[data-f="sale_price"]');
    ok('ред b — цената пак се предлага (48,00)', sb && sb.value === '48,00', sb && sb.value);

    section('2. „Приеми предложените за всички" пропуска кода на ред b и го казва');
    realClick(h.w, btn(mod(h), '✔ Приеми предложените за всички')); await ticks(10);
    const pa = itemPatch(h, 'a'), pb = itemPatch(h, 'b');
    ok('a: записан код 8014557 и цена 84', pa.length === 1 && pa[0].body.new_sap_code === '8014557' && pa[0].body.sale_price === 84, JSON.stringify(pa.map(p => p.body)));
    ok('b: цена 48 и прехвърлено 1, БЕЗ new_sap_code', pb.length === 1 && pb[0].body.sale_price === 48 && pb[0].body.co_qty === 1 && !('new_sap_code' in pb[0].body), JSON.stringify(pb.map(p => p.body)));
    ok('toast: „1 ред остава за ръчен код"', /1 ред остава за ръчен код/.test(lastToast(h)), lastToast(h));
    ok('…жълт', h.colors[h.colors.length - 1] === '#d97706');
    ok('след записа ред b пак е с бележката', noteOf(h, 'b') === NOTE && codeInp(h, 'b').value === '');
    /* записаният код на ред a не мести „първия" — b остава с друга цена */
    ok('бутонът „Приеми" вече го няма (няма незаписани предложения)', !btn(mod(h), '✔ Приеми предложените за всички'));
  }

  section('3. Три реда: два с еднаква цена (84), един с друга (48) → първите два с общ код');
  {
    const h = env({ items: [IT('a', { sort_order: 1 }), IT('b', { sort_order: 2, discount_pct: 60, proposed_price: 48 }), IT('c', { sort_order: 3, proposed_price: '84.0' })] });
    await open(h);
    ok('a → 8014557', codeInp(h, 'a').value === '8014557');
    ok('c (84.0 = 84, като число) → 8014557', codeInp(h, 'c').value === '8014557' && noteOf(h, 'c') === '', codeInp(h, 'c').value);
    ok('b → без код, с бележка', codeInp(h, 'b').value === '' && noteOf(h, 'b') === NOTE);
    realClick(h.w, btn(mod(h), '✔ Приеми предложените за всички')); await ticks(10);
    ok('a и c записани с 8014557, b без код', itemPatch(h, 'a')[0].body.new_sap_code === '8014557' && itemPatch(h, 'c')[0].body.new_sap_code === '8014557' && !('new_sap_code' in itemPatch(h, 'b')[0].body));
    ok('toast: 1 ред за ръчен код', /1 ред остава за ръчен код/.test(lastToast(h)), lastToast(h));
  }
  {
    /* Записаната цена (sale_price) е цената на реда — не proposed_price. */
    const h = env({ items: [IT('a', { sort_order: 1, sale_price: 50 }), IT('b', { sort_order: 2, discount_pct: 60, proposed_price: 48, sale_price: 50 })] });
    await open(h);
    ok('b с proposed 48, но ЗАПИСАНА цена 50 = като a → предложен 8014557', codeInp(h, 'b').value === '8014557' && noteOf(h, 'b') === '', codeInp(h, 'b').value);
  }
  {
    /* Един ред с кода — без промяна в поведението. */
    const h = env({ items: [IT('a', { sort_order: 1 }), IT('z', { sort_order: 2, sap_code: '77929', proposed_price: 2 })] });
    await open(h);
    ok('различни артикули → и двата с обичайния код', codeInp(h, 'a').value === '8014557' && codeInp(h, 'z').value === '8077929');
  }

  section('4. Пазачът: един код с две цени спира „Готово за обект" и VK11');
  {
    const items = [IT('a', done({ sort_order: 1, new_sap_code: '8014557', sale_price: 84 })), IT('b', done({ sort_order: 2, new_sap_code: '8014557', sale_price: 48 })),
      IT('z', done({ sort_order: 3, sap_code: '77929', new_sap_code: '8077929', sale_price: 2 }))];
    let h = env({ items });
    await open(h);
    realClick(h.w, doneBtn(h)); await ticks(8);
    ok('„Готово" → без PATCH на бланката', subPatches(h).length === 0, JSON.stringify(subPatches(h).map(p => p.body)));
    ok('…без confirm', h.calls.confirm.length === 0);
    ok('…червен toast с 8014557 (и без 8077929)', h.colors[h.colors.length - 1] === '#dc2626' && /8014557/.test(lastToast(h)) && !/8077929/.test(lastToast(h)), lastToast(h));
    ok('…маркирани a и b, не z', /две различни цени/.test(badOf(h, 'a')) && /две различни цени/.test(badOf(h, 'b')) && badOf(h, 'z') === '', badOf(h, 'a') + ' | ' + badOf(h, 'z'));
    ok('…статусът остава approved', h.w.rvSub.status === 'approved');
    ok('…свеж GET на редовете с id,new_sap_code,sale_price', h.calls.get.some(u => /revaluation_items\?submission_id=eq\.s-1&select=id,new_sap_code,sale_price/.test(u)));

    h = env({ items });
    await open(h);
    realClick(h.w, vkBtn(h)); await ticks(8);
    ok('VK11 → без файл', h.files.length === 0, h.files.join(','));
    ok('…червен toast „VK11 НЕ е направен" с 8014557', h.colors[h.colors.length - 1] === '#dc2626' && /VK11 НЕ е направен/.test(lastToast(h)) && /8014557/.test(lastToast(h)), lastToast(h));
    ok('…маркирани a и b', /две различни цени/.test(badOf(h, 'a')) && /две различни цени/.test(badOf(h, 'b')));
  }

  section('5. Два различни кода (8014557 / 8914557) → „Готово" и VK11 минават');
  {
    const items = [IT('a', done({ sort_order: 1, new_sap_code: '8014557', sale_price: 84 })), IT('b', done({ sort_order: 2, new_sap_code: '8914557', sale_price: 48 }))];
    let h = env({ items });
    await open(h);
    realClick(h.w, vkBtn(h)); await ticks(8);
    const aoa = h.aoas[h.aoas.length - 1] || [];
    ok('VK11 → 1 файл', h.files.length === 1, h.files.join(','));
    ok('…2 реда: 8014557 / 84 и 8914557 / 48', aoa.length === 3 && aoa[1][0] === '8014557' && aoa[1][2] === 84 && aoa[2][0] === '8914557' && aoa[2][2] === 48, JSON.stringify(aoa.slice(1).map(r => [r[0], r[2]])));
    ok('…без маркери', badOf(h, 'a') === '' && badOf(h, 'b') === '');
    realClick(h.w, doneBtn(h)); await ticks(10);
    ok('„Готово" → PATCH processed', subPatches(h).length === 1 && subPatches(h)[0].body.status === 'processed', JSON.stringify(subPatches(h).map(p => p.body)));
  }
  {
    /* Граница: една цена, записана различно (50 / „50.0" / 50.001 → 50,00) — сравнение като числа. */
    const items = [IT('a', done({ sort_order: 1, new_sap_code: '8014557', sale_price: 50 })), IT('b', done({ sort_order: 2, new_sap_code: '8014557', sale_price: '50.0' }))];
    let h = env({ items });
    await open(h);
    realClick(h.w, vkBtn(h)); await ticks(8);
    ok('един код, 50 и „50.0" → VK11 минава', h.files.length === 1, lastToast(h));
    realClick(h.w, doneBtn(h)); await ticks(10);
    ok('…и „Готово" минава', subPatches(h).length === 1);
  }

  section('6. Свеж прочит, не екранът');
  {
    /* На екрана — два различни кода; в базата междувременно — един код с две цени. */
    const screen = [IT('a', done({ sort_order: 1, new_sap_code: '8014557', sale_price: 84 })), IT('b', done({ sort_order: 2, new_sap_code: '8914557', sale_price: 48 }))];
    const fresh = [{ id: 'a', new_sap_code: '8014557', sale_price: 84 }, { id: 'b', new_sap_code: '8014557', sale_price: 48 }];
    let h = env({ items: screen, fresh });
    await open(h);
    realClick(h.w, doneBtn(h)); await ticks(8);
    ok('базата: един код с две цени → „Готово" спира', subPatches(h).length === 0 && /8014557/.test(lastToast(h)), lastToast(h));
    h = env({ items: screen, fresh });
    await open(h);
    realClick(h.w, vkBtn(h)); await ticks(8);
    ok('…и VK11 спира', h.files.length === 0);
  }
  {
    const items = [IT('a', done({ sort_order: 1, new_sap_code: '8014557', sale_price: 84 })), IT('b', done({ sort_order: 2, new_sap_code: '8914557', sale_price: 48 }))];
    const fail = { GET: /revaluation_items\?submission_id=eq\.s-1&select=id,new_sap_code/ };
    let h = env({ items, fail });
    await open(h);
    realClick(h.w, doneBtn(h)); await ticks(8);
    ok('паднал свеж прочит → „Готово" спира, червен toast', subPatches(h).length === 0 && h.colors[h.colors.length - 1] === '#dc2626' && /не се прочетоха/.test(lastToast(h)), lastToast(h));
    h = env({ items, fail });
    await open(h);
    realClick(h.w, vkBtn(h)); await ticks(8);
    ok('паднал свеж прочит → VK11 без файл', h.files.length === 0 && /не се прочетоха/.test(lastToast(h)), lastToast(h));
  }

  section('7. Повторна преоценка (8025298) с две цени');
  {
    const rep = (id, o) => IT(id, Object.assign({ sap_code: '8025298', std_price: 10 }, o));
    let h = env({ items: [rep('a', { sort_order: 1, proposed_price: 7 }), rep('b', { sort_order: 2, proposed_price: 4 })] });
    await open(h);
    ok('a → същият код 8025298', codeInp(h, 'a').value === '8025298');
    ok('b → без код, бележка с „повторна преоценка"', codeInp(h, 'b').value === '' && noteOf(h, 'b').indexOf(NOTE) === 0 && /повторна преоценка/.test(noteOf(h, 'b')), noteOf(h, 'b'));
    h = env({ items: [rep('a', { sort_order: 1, new_sap_code: '8025298', sale_price: 7 }), rep('b', { sort_order: 2, new_sap_code: '8025298', sale_price: 4 })] });
    await open(h);
    realClick(h.w, doneBtn(h)); await ticks(8);
    ok('един 8-код с 7 и 4 → „Готово" спира', subPatches(h).length === 0 && /8025298/.test(lastToast(h)), lastToast(h));
    h = env({ items: [rep('a', { sort_order: 1, new_sap_code: '8025298', sale_price: 7 }), rep('b', { sort_order: 2, new_sap_code: '8025298', sale_price: 4 })] });
    await open(h);
    realClick(h.w, vkBtn(h)); await ticks(8);
    ok('…и VK11 спира', h.files.length === 0);
  }

  section('8. Бланка „нямат" → „Готово" без свеж прочит на редовете');
  {
    const h = env({ sub: Object.assign(SUB('approved'), { no_items: true }), items: [] });
    await open(h);
    realClick(h.w, doneBtn(h)); await ticks(10);
    ok('„нямат" → PATCH processed', subPatches(h).length === 1 && subPatches(h)[0].body.status === 'processed');
    ok('…без GET с select=id,new_sap_code,sale_price', !h.calls.get.some(u => /select=id,new_sap_code,sale_price/.test(u)));
  }

  report();
})();
