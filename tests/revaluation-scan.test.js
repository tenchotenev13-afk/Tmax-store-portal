/* Преоценка — сканиране, етап 1/3 (23.11.2026): ръчният ред приема EAN
   (ръчен скенер = цифри + Enter, „Добави", камерата) и попълва код,
   описание, МЕ и стандартна цена от product_catalog.

   Интеграционно: shared.js + admin.js + stock-returns.js + push.js +
   email.js + loading.js (скенерът и llEanVariants) + revaluation.js +
   revisions.js, в реда от index.html. Камерата е стъб на Html5Qrcode —
   проверява се връзката „прочетен код → rvScanRead", не самата библиотека.

   Мутационна проверка (23.11.2026) — всеки вариант е пуснат срещу този тест
   (чистият код: exit 0, 52 успешни) и е паднал с exit 1:
     M1 rvFillFromCat попълва цената и за повторна преоценка (rep = false)
        → пада „8xxxxxx → цената е празна" (5,99), placeholder, подсказка, фокус;
     M2 rvAddRow отново отказва код, който вече е в бланката
        → пада „същият EAN два пъти → 2 реда (2 POST-а)" (1 / 1);
     M3 rvEanLookup при 2+ реда взима тихо първия (rvFillFromCat(r[0]))
        → пада „2 реда в каталога → избор, полетата НЕ са попълнени";
     M4 rvAddRow без проверката rvIsEan (EAN с „Добави" се записва като код)
        → пада „и двата са 53531" и „свой % и цена" ([[50,null],[50,null]]);
     M5 llScanOnRead без llScan.onRead (винаги llHandleScannedEan)
        → пада „камерата: прочетеният EAN попълва формата на Преоценка".
   Добавка 23.11 — един артикул = един 8-код = една цена (секции 11–13),
   чистият код: exit 0, 75 успешни; всеки мутант — exit 1:
     M6  rvSubmit без RV_SAME_CODE_MSG → 7 неуспешни („различен % → грешка на ред a", „…подаването е спряно");
     M7  сравнява само %, не и предложената цена → 3 („еднакъв %, различна предложена цена…", импортът в секция 13);
     M8  маркира само първия ред от групата → 4 („…и на ред b", „2 реда не минават");
     M9  сравнение като низ (50 ≠ „50.0") → 1 („еднакъв % и цена … → подадена");
     M10 rvFillFromCat / rvAcPick без rvPctFromExisting → 4 („EAN на 53531 … → % = 30");
     M11 rvAcPick не чисти цената → 1 („цената от предишния артикул (3,19) е изчистена").
   ОБЪРНАТО 25.11.2026 (решение на Тенчо): еднакъв артикул с различен % / цена
   ВЕЧЕ минава „Подай" — правилото „един код = една цена" е при Контролинга
   (tests/revaluation-diff-pct.test.js). Секции 11–12 заковават новото:
   30 % и 60 % за един код се подават, а % във формата е винаги на бланката.
   M6–M10 описват махнатия код и не важат.
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, ok, section, report, dayOffset, ticks } = H;

const CAMP = { id: 'c-1', title: 'Ноември', kind: 'mandatory', starts_on: dayOffset(-1), ends_on: dayOffset(5), default_pct: 50, status: 'open', note: null };
const STORE_USER = { email: 'kardzhali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };

/* Каталогът: обикновен артикул, повторно преоценен (8xxxxxx) и EAN на два реда. */
const CAT = [
  { sap_code: '53531', product_name: 'АРКА ГРАДИНСКА МЕТАЛНА', default_unit: 'БР', sale_price: 17.79, ean_code: '3800123456789' },
  { sap_code: '8025298', product_name: 'ПРЕОЦ.ЛАМПА СОЛАРНА', default_unit: 'БР', sale_price: 5.99, ean_code: '3800999000111' },
  { sap_code: '77929', product_name: 'ЛАМПА СОЛАРНА СТИК', default_unit: 'БР', sale_price: 3.19, ean_code: '3800555000222' },
  { sap_code: '77930', product_name: 'ЛАМПА СОЛАРНА СТИК (2)', default_unit: 'БР', sale_price: 3.29, ean_code: '3800555000222' }
];
function catalog(url) {
  const m = /ean_code=eq\.([^&]+)/.exec(url);
  const inn = /ean_code=in\.\(([^)]+)\)/.exec(url);
  const want = m ? [decodeURIComponent(m[1])] : inn ? inn[1].split(',').map(decodeURIComponent) : null;
  if (!want) return [];
  return CAT.filter(r => want.indexOf(r.ean_code) >= 0);
}

let idSeq = 0;
function env(o) {
  o = o || {};
  const db = { subs: (o.subs || []).map(x => Object.assign({}, x)), items: (o.items || []).map(x => Object.assign({}, x)) };
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'push.js', 'email.js', 'loading.js', 'revaluation.js', 'revisions.js'],
    user: STORE_USER,
    data: {
      revaluation_campaigns: [CAMP],
      revaluation_submissions: () => db.subs,
      revaluation_items: () => db.items,
      stores: [{ name: 'Кърджали' }],
      users: [],
      product_catalog: catalog,
      app_settings: [{ key: 'revaluation_stores', value: 'Кърджали' }]
    },
    globals: {
      pushToPeople: () => Promise.resolve({ ok: true }),
      sendEmail: () => Promise.resolve({ ok: true })
    }
  });
  h.db = db;
  h.w.rvStoresOn = false; h.w.rvStoresList = ['Кърджали'];
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    const p = orig(url, init);
    const m = (init && init.method || 'GET').toUpperCase();
    if (m !== 'POST' || !/revaluation_/.test(url)) return p;
    return p.then(r => {
      if (!r.ok) return r;
      const defs = /revaluation_submissions/.test(url) ? { status: 'draft', no_items: false } : {};
      const row = Object.assign({ id: 'id-' + (++idSeq) }, defs, JSON.parse(init.body));
      if (/revaluation_submissions/.test(url)) db.subs.push(row);
      if (/revaluation_items/.test(url)) db.items.push(row);
      return { ok: true, status: 201, json: () => Promise.resolve([row]), text: () => Promise.resolve(JSON.stringify([row])) };
    });
  };
  return h;
}
const mod = h => h.doc.getElementById('mod-revaluation');
const $ = (h, id) => h.doc.getElementById(id);
const itemPosts = h => h.calls.post.filter(x => x.table === 'revaluation_items');
async function openForm(h) {
  await h.w.loadRevaluation(); await ticks(5);
  realClick(h.w, btn(mod(h), '＋ Ред')); await ticks(1);
}
/* Ръчен скенер: пише цифрите и натиска Enter → onkeydown на полето. */
async function typeAndEnter(h, code) {
  const el = $(h, 'rv-a-code');
  el.value = code;
  fire(h.w, el, 'input');
  const ev = { key: 'Enter', keyCode: 13, preventDefault() { ev.prevented = true; } };
  h.w.eval('(function(event){' + el.getAttribute('onkeydown') + '})').call(el, ev);
  await ticks(4);
  return ev;
}
const addBtn = h => btn($(h, 'rv-add'), 'Добави');

(async function run() {

  section('1. Формата: EAN, камера, % и количество по подразбиране');
  {
    const h = env(); await openForm(h);
    ok('полето за код приема EAN (placeholder)', $(h, 'rv-a-code').placeholder === 'SAP код или EAN');
    ok('бутон „📷 Сканирай" във формата', !!btn($(h, 'rv-add'), '📷 Сканирай'));
    ok('% по подразбиране = процентът на бланката (50)', $(h, 'rv-a-pct').value === '50');
    ok('количество по подразбиране 1', $(h, 'rv-a-qty').value === '1');
    ok('коментар — placeholder „Причина / дефект"', $(h, 'rv-a-comment').placeholder === 'Причина / дефект');
  }

  section('2. EAN + Enter → четирите полета от каталога');
  {
    const h = env(); await openForm(h);
    const ev = await typeAndEnter(h, '3800123456789');
    ok('Enter не изпраща нищо друго (preventDefault)', ev.prevented === true);
    ok('заявката е по ean_code', h.calls.get.some(u => /product_catalog\?ean_code=eq\.3800123456789&/.test(u)), h.calls.get.filter(u => /product_catalog/.test(u)).join(' | '));
    ok('код = 53531', $(h, 'rv-a-code').value === '53531');
    ok('описание', $(h, 'rv-a-name').value === 'АРКА ГРАДИНСКА МЕТАЛНА');
    ok('мерна единица', $(h, 'rv-a-unit').value === 'БР');
    ok('стандартна цена = sale_price (17,79)', $(h, 'rv-a-std').value === '17,79', $(h, 'rv-a-std').value);
    ok('подсказката за повторна НЕ е показана', $(h, 'rv-a-std-hint').style.display === 'none');
    ok('фокусът е в „Причина / дефект"', h.doc.activeElement === $(h, 'rv-a-comment'));
    ok('нула POST-а — Enter само попълва', itemPosts(h).length === 0);
  }

  section('3. Повторна преоценка (8xxxxxx) → цената НЕ идва от каталога');
  {
    const h = env(); await openForm(h);
    await typeAndEnter(h, '3800999000111');
    ok('код 8025298', $(h, 'rv-a-code').value === '8025298');
    ok('8xxxxxx → цената е празна', $(h, 'rv-a-std').value === '', $(h, 'rv-a-std').value);
    ok('…placeholder „въведи текущата цена на обекта"', $(h, 'rv-a-std').placeholder === 'въведи текущата цена на обекта');
    ok('…подсказката е показана', $(h, 'rv-a-std-hint').style.display === 'block');
    ok('…фокусът е в цената', h.doc.activeElement === $(h, 'rv-a-std'));
    /* после обикновен артикул връща placeholder-а и крие подсказката */
    await typeAndEnter(h, '3800123456789');
    ok('следващ обикновен → подсказката се скрива', $(h, 'rv-a-std-hint').style.display === 'none' && $(h, 'rv-a-std').placeholder === 'Ст. цена');
  }

  section('4. Същият EAN два пъти с „Добави" → 2 реда, без сливане');
  {
    const h = env(); await openForm(h);
    for (const pct of ['50', '70']) {
      $(h, 'rv-a-code').value = '3800123456789';
      realClick(h.w, addBtn(h)); await ticks(4);            /* EAN + „Добави" → само попълва */
      $(h, 'rv-a-pct').value = pct;
      $(h, 'rv-a-comment').value = pct === '50' ? 'счупен ъгъл' : 'липсва капак';
      realClick(h.w, addBtn(h)); await ticks(4);            /* второто „Добави" записва */
    }
    const posts = itemPosts(h);
    ok('същият EAN два пъти → 2 реда (2 POST-а)', posts.length === 2 && h.w.rvItems.length === 2, posts.length + ' / ' + h.w.rvItems.length);
    ok('и двата са 53531, количество 1', posts.every(p => p.body.sap_code === '53531' && p.body.qty === 1));
    ok('свой % и цена: 50 % → 8,90; 70 % → 5,34', posts[0] && posts[0].body.discount_pct === 50 && posts[0].body.proposed_price === 8.9 &&
      posts[1] && posts[1].body.discount_pct === 70 && posts[1].body.proposed_price === 5.34, JSON.stringify(posts.map(p => [p.body.discount_pct, p.body.proposed_price])));
    ok('свой дефект в store_comment', posts[0].body.store_comment === 'счупен ъгъл' && posts[1].body.store_comment === 'липсва капак');
    ok('няма toast „вече е в бланката"', !h.calls.toast.some(t => t.indexOf('вече е в бланката') >= 0));
    ok('след „Добави" формата остава отворена и празна', !!$(h, 'rv-add') && $(h, 'rv-a-code').value === '' && $(h, 'rv-a-name').value === '' && $(h, 'rv-a-comment').value === '');
    ok('…% и количество — пак по подразбиране', $(h, 'rv-a-pct').value === '50' && $(h, 'rv-a-qty').value === '1');
    ok('…фокусът е в полето за код (следващо сканиране)', h.doc.activeElement === $(h, 'rv-a-code'));
    ok('два реда в таблицата', h.doc.querySelectorAll('#rv-rows tr[id^="rv-row-"]').length === 2);
  }

  section('5. Непознат EAN → 0 реда и жълт toast');
  {
    const h = env(); await openForm(h);
    await typeAndEnter(h, '4006381333931');
    ok('toast „Баркодът не е в каталога — въведи кода на ръка"', h.calls.toast.indexOf('Баркодът не е в каталога — въведи кода на ръка') >= 0, h.calls.toast.join(' | '));
    $(h, 'rv-a-code').value = '4006381333931';
    realClick(h.w, addBtn(h)); await ticks(4);
    ok('непознат EAN → 0 реда (и с „Добави")', itemPosts(h).length === 0 && h.w.rvItems.length === 0);
    ok('полето за код е изчистено и на фокус', $(h, 'rv-a-code').value === '' && h.doc.activeElement === $(h, 'rv-a-code'));
  }

  section('6. EAN на 2 реда в каталога → избор, не тихо първия');
  {
    const h = env(); await openForm(h);
    await typeAndEnter(h, '3800555000222');
    const picks = h.doc.querySelectorAll('#rv-ac .rv-ean-pick');
    ok('2 реда в каталога → избор, полетата НЕ са попълнени', picks.length === 2 && $(h, 'rv-a-name').value === '' && $(h, 'rv-a-std').value === '', picks.length);
    ok('изборът е видим', $(h, 'rv-ac').style.display === 'block' && $(h, 'rv-ac').textContent.indexOf('съвпада с 2 артикула') >= 0);
    realClick(h.w, picks[1]); await ticks(1);
    ok('избран вторият → 77930, 3,29', $(h, 'rv-a-code').value === '77930' && $(h, 'rv-a-std').value === '3,29');
    ok('изборът се затваря', $(h, 'rv-ac').style.display === 'none');
  }

  section('7. SAP код (5–7 цифри) — старият път, без търсене по EAN');
  {
    const h = env(); await openForm(h);
    $(h, 'rv-a-code').value = '11111'; $(h, 'rv-a-name').value = 'НОВ'; $(h, 'rv-a-std').value = '1,29';
    $(h, 'rv-a-comment').value = 'повреден';
    realClick(h.w, addBtn(h)); await ticks(4);
    const p = itemPosts(h)[0];
    ok('SAP код → директно ред, % от формата (50 → 0,65)', p && p.body.sap_code === '11111' && p.body.proposed_price === 0.65 && p.body.qty === 1, JSON.stringify(p && p.body));
    ok('без заявка по ean_code', !h.calls.get.some(u => /ean_code=/.test(u)));
    $(h, 'rv-a-code').value = '11111'; $(h, 'rv-a-pct').value = '120';
    realClick(h.w, addBtn(h)); await ticks(4);
    ok('% 120 → отказ, без POST', itemPosts(h).length === 1 && h.calls.toast.indexOf('Процентът е от 0 до 100') >= 0);
    $(h, 'rv-a-pct').value = '100'; $(h, 'rv-a-std').value = '2';
    realClick(h.w, addBtn(h)); await ticks(4);
    ok('% точно 100 → приет (граница)', itemPosts(h).length === 2 && itemPosts(h)[1].body.discount_pct === 100);
    ok('12 цифри (UPC-A) → търси и с водеща 0', h.w.llEanVariants('380012345678').join(',') === '380012345678,0380012345678');
    ok('rvIsEan: 7 цифри не, 8 и 14 да, 15 не', !h.w.rvIsEan('8025298') && h.w.rvIsEan('12345678') && h.w.rvIsEan('12345678901234') && !h.w.rvIsEan('123456789012345'));
  }

  section('8. Камерата: скенерът на Товарни листи, свой обработчик');
  {
    const h = env(); await openForm(h);
    let onOk = null;
    h.w.Html5QrcodeSupportedFormats = { EAN_13: 1, EAN_8: 2, UPC_A: 3, UPC_E: 4, CODE_128: 5 };
    h.w.Html5Qrcode = function () {};
    h.w.Html5Qrcode.prototype.start = function (c, cfg, ok1) { onOk = ok1; return Promise.resolve(); };
    h.w.Html5Qrcode.prototype.pause = function () {};
    h.w.Html5Qrcode.prototype.resume = function () {};
    h.w.Html5Qrcode.prototype.stop = function () { return Promise.resolve(); };
    h.w.Html5Qrcode.prototype.clear = function () {};
    const scriptsBefore = h.doc.querySelectorAll('script').length;
    realClick(h.w, btn($(h, 'rv-add'), '📷 Сканирай')); await ticks(3);
    ok('модалът е отворен със заглавие на Преоценка', !!$(h, 'll-scan-modal') && $(h, 'll-scan-modal').textContent.indexOf('Сканиране — Преоценка') >= 0);
    ok('библиотеката не е заредена втори път (вече е в window)', h.doc.querySelectorAll('script').length === scriptsBefore);
    ok('камерата е стартирана', typeof onOk === 'function');
    onOk && onOk('3800123456789'); await ticks(4);
    ok('камерата: прочетеният EAN попълва формата на Преоценка', $(h, 'rv-a-code').value === '53531' && $(h, 'rv-a-std').value === '17,79', $(h, 'rv-a-code').value);
    ok('скенерът се затваря след едно четене', !$(h, 'll-scan-modal') && h.w.llScan === null);
    ok('камерата не добавя ред сама', itemPosts(h).length === 0);
    /* Товарни листи: без opts — старото заглавие и llHandleScannedEan */
    h.w.llScanShowModal(0);
    ok('Товарни листи: заглавието е непроменено', $(h, 'll-scan-modal').textContent.indexOf('Сканиране — поредно') >= 0 && h.w.llScan.onRead === null);
    h.w.llScanClose();
  }

  section('9. Обект без права (извън прозореца) — няма форма, rvScanOpen не прави нищо');
  {
    const h = env(); await h.w.loadRevaluation(); await ticks(5);
    h.w.rvCampaigns[0].ends_on = dayOffset(-1);
    h.w.rvRender();
    ok('извън прозореца → няма „＋ Ред"', !btn(mod(h), '＋ Ред'));
    const r = await h.w.rvScanOpen();
    ok('rvScanOpen → false, без модал', r === false && !$(h, 'll-scan-modal'));
  }

  /* ─── Добавка 23.11 (т.1–3): един артикул = един 8-код = една цена ─── */
  const SUB = { id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', status: 'draft', no_items: false, default_pct: 50 };
  const row = (id, code, pct, std, sort, extra) => Object.assign({ id, submission_id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали',
    sap_code: code, product_name: 'АРТ ' + code, unit: 'БР', qty: 1, std_price: std, discount_pct: pct,
    proposed_price: Math.round(std * (1 - pct / 100) * 100) / 100, store_comment: 'дефект ' + id, sort_order: sort }, extra || {});
  const subPatch = h => h.calls.patch.filter(x => x.table === 'revaluation_submissions' && x.body.status);
  const badOf = (h, id) => { const el = h.doc.querySelector('#rv-row-' + id + ' .rv-bad'); return el ? el.textContent : ''; };
  const OLD_MSG = 'Еднакъв артикул с различен %';

  section('11. „Подай": един код с различен % (30 / 60) → минава (25.11.2026)');
  {
    const h = env({ subs: [SUB], items: [row('a', '53531', 30, 17.79, 1), row('b', '53531', 60, 17.79, 2), row('c', '77929', 50, 3.19, 3)] });
    await h.w.loadRevaluation(); await ticks(5);
    realClick(h.w, btn(mod(h), '✅ Подай')); await ticks(8);
    ok('30 % и 60 % за 53531 → бланката е подадена (1 PATCH)', subPatch(h).length === 1, JSON.stringify(h.calls.toast));
    ok('…без грешка на редовете', badOf(h, 'a') === '' && badOf(h, 'b') === '' && badOf(h, 'c') === '');
    ok('…и без старото съобщение в toast', !h.calls.toast.some(t => String(t).indexOf(OLD_MSG) >= 0));
  }
  {
    /* същият %, различна стандартна цена → различна предложена цена → пак минава */
    const h = env({ subs: [SUB], items: [row('a', '53531', 50, 17.79, 1), row('b', '53531', 50, 18.00, 2)] });
    await h.w.loadRevaluation(); await ticks(5);
    realClick(h.w, btn(mod(h), '✅ Подай')); await ticks(8);
    ok('еднакъв %, различна предложена цена (8,90 / 9,00) → подадена', subPatch(h).length === 1 && !badOf(h, 'a') && !badOf(h, 'b'));
  }
  {
    /* ред с истински проблем пак спира — проверката по ред не е пипана */
    const h = env({ subs: [SUB], items: [row('a', '53531', 30, 17.79, 1), row('b', '53531', 60, 17.79, 2, { store_comment: '' })] });
    await h.w.loadRevaluation(); await ticks(5);
    realClick(h.w, btn(mod(h), '✅ Подай')); await ticks(5);
    ok('ред без коментар пак спира „Подай" (само ред b)', subPatch(h).length === 0 && badOf(h, 'a') === '' && badOf(h, 'b').indexOf('няма коментар') >= 0);
  }
  {
    const h = env({ subs: [SUB], items: [row('a', '25298', 50, 5, 1), row('b', '8025298', 70, 5, 2)] });
    await h.w.loadRevaluation(); await ticks(5);
    realClick(h.w, btn(mod(h), '✅ Подай')); await ticks(8);
    ok('25298 и 8025298 с различен % → подадена', subPatch(h).length === 1);
  }

  section('12. Формата: същият код → % по подразбиране е на БЛАНКАТА (50), не на реда');
  {
    const h = env({ subs: [SUB], items: [row('a', '53531', 30, 17.79, 1)] });
    await openForm(h);
    ok('нова форма → % на бланката (50)', $(h, 'rv-a-pct').value === '50');
    await typeAndEnter(h, '3800123456789');
    ok('EAN на 53531 (вече в бланката с 30 %) → % остава 50', $(h, 'rv-a-pct').value === '50', $(h, 'rv-a-pct').value);
    ok('полето за код вече няма onchange (без % от съществуващ ред)', !$(h, 'rv-a-code').getAttribute('onchange'));
    /* избор от автодопълването */
    h.w.rvAcRes = [{ sap_code: '53531', product_name: 'АРКА', default_unit: 'БР' }];
    $(h, 'rv-a-std').value = '3,19'; h.w.rvAcRender();
    realClick(h.w, h.doc.querySelector('#rv-ac div[data-k="0"]')); await ticks(1);
    ok('избор от автодопълването → % остава 50', $(h, 'rv-a-pct').value === '50');
    /* От 27.11.2026 (т.4 на Теодор) изборът носи sale_price; този ред е без
       цена в каталога → полето пак е празно, предишната 3,19 не остава. */
    ok('…и цената от предишния артикул (3,19) е изчистена', $(h, 'rv-a-std').value === '', $(h, 'rv-a-std').value);
    $(h, 'rv-a-std').value = '17,79';
    $(h, 'rv-a-pct').value = '60';
    $(h, 'rv-a-comment').value = 'втора бройка, по-тежък дефект';
    realClick(h.w, addBtn(h)); await ticks(4);
    const p = itemPosts(h).pop();
    ok('добавеният ред е със своя % (60) и цена (7,12)', p && p.body.discount_pct === 60 && p.body.proposed_price === 7.12, JSON.stringify(p && p.body));
    realClick(h.w, btn(mod(h), '✅ Подай')); await ticks(8);
    ok('…и бланката (30 % и 60 % за 53531) минава „Подай"', subPatch(h).length === 1, JSON.stringify(h.w.rvBad));
  }

  section('13. ZSTOCK импорт при два реда с един код — обновява САМО последния по ред');
  {
    /* Текущото поведение (rvImportAoa: forEach, последният с кода печели),
       заковано изрично — не е пипано, виж отчета на сесията. */
    const HDR = ['Завод', 'Материал', 'Описание на материал', 'Неограничен', 'Базова мерна единица', 'Продажна Цена'];
    const plant = '1508';   /* Кърджали = 8 в SR_SHEET_TO_STORE */
    const h = env({ subs: [SUB], items: [row('a', '53531', 50, 17.79, 1), row('b', '53531', 50, 17.79, 2), row('c', '77929', 50, 3.19, 3)] });
    await h.w.loadRevaluation(); await ticks(5);
    ok('номерът на Кърджали е 8', h.w.rvStoreNo('Кърджали') === '8');
    const out = await h.w.rvImportAoa([HDR, [plant, 53531, 'АРКА', 4, 'БР', 18.5]]); await ticks(3);
    const pt = h.calls.patch.filter(x => x.table === 'revaluation_items');
    ok('точно 1 PATCH, без нов ред', pt.length === 1 && itemPosts(h).length === 0 && out.updated === 1 && out.added === 0, JSON.stringify(out));
    ok('обновен е последният по sort_order (b)', pt[0] && /id=eq\.b$/.test(pt[0].url), pt[0] && pt[0].url);
    const a = h.w.rvItems.find(x => x.id === 'a'), b = h.w.rvItems.find(x => x.id === 'b');
    ok('b: qty 4, std 18,5', b.qty === 4 && b.std_price === 18.5);
    ok('a: непокътнат (qty 1, std 17,79)', a.qty === 1 && a.std_price === 17.79);
    realClick(h.w, btn(mod(h), '✅ Подай')); await ticks(8);
    ok('след импорта цените на a и b се разминават → „Подай" пак минава (25.11.2026)', !badOf(h, 'a') && !badOf(h, 'b') && subPatch(h).length === 1);
  }

  section('10. Нищо не се е провалило тихо');
  {
    const h = env(); await openForm(h);
    await typeAndEnter(h, '3800123456789');
    $(h, 'rv-a-comment').value = 'х';
    realClick(h.w, addBtn(h)); await ticks(4);
    ok('нула notOk', h.calls.notOk.length === 0, JSON.stringify(h.calls.notOk));
  }

  report();
})();
