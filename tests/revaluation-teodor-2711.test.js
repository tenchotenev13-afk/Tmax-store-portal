/* Преоценка — предложенията на Теодор от 27.11.2026, т.3 и т.4:
   т.3 — пълният SAP код + Enter (или излизане от полето) зарежда артикула
         от каталога (точен sap_code), както досега само EAN-ът;
   т.4 — стандартната цена идва от каталога и при избор от автодопълването
         (досега изборът изрично чистеше „Ст. цена").
   Т.7 (кратък номер GB7) е в revaluation-units / -labels / -etiketi-proces.

   Интеграционно: shared.js + admin.js + stock-returns.js + push.js +
   email.js + loading.js + revaluation.js + revisions.js, в реда от
   index.html. Enter / blur / input се пускат през inline атрибутите на
   полето (fire / onkeydown), изборът и „Добави" — с realClick.

   Мутационна проверка (27.11.2026) — чистият код: exit 0, 38 успешни; всеки
   вариант е пуснат срещу този тест и revaluation-etiketi-proces / -scan /
   -units и е паднал с exit 1:
     M1 rvUnitsSort сравнява unit_no като низ ('GB10' < 'GB2')
        → etiketi-proces „под кода: „№ GB2, GB9 … GB10"", „rvUnitsSort: GB2 < GB10 < GB11";
     M2 rvAcPick пак чисти цената след rvFillFromCat
        → „изборът попълва цената 17,79 (не я чисти)";
     M3 rvCodeKey само за EAN (без rvSapLookup)
        → „заявката е по ТОЧЕН sap_code", „…и взима sale_price" и още;
     M4 rvAcFetch без sale_price в select
        → „автодопълването иска и sale_price";
     M5 rvAddRow не чака заявката в ход
        → „първото „Добави" не записва ред", „…но артикулът е попълнен с цената".

   Пускане:  node tests/revaluation-teodor-2711.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, ok, section, report, dayOffset, ticks } = H;

const CAMP = { id: 'c-1', title: 'Ноември', kind: 'mandatory', starts_on: dayOffset(-1), ends_on: dayOffset(5), default_pct: 50, status: 'open', note: null };
const STORE_USER = { email: 'gabrovo@temax.bg', display_name: 'Управител Габрово', role: 'manager', store_name: 'Габрово' };

const CAT = [
  { sap_code: '53531', product_name: 'АРКА ГРАДИНСКА МЕТАЛНА', default_unit: 'БР', sale_price: 17.79, ean_code: '3800123456789' },
  { sap_code: '8025298', product_name: 'ПРЕОЦ.ЛАМПА СОЛАРНА', default_unit: 'БР', sale_price: 5.99, ean_code: '3800999000111' },
  { sap_code: '77929', product_name: 'ЛАМПА СОЛАРНА СТИК', default_unit: 'М', sale_price: 3.19, ean_code: '3800555000222' },
  { sap_code: '61540', product_name: 'БЕЗ ЦЕНА В КАТАЛОГА', default_unit: 'БР', sale_price: null, ean_code: null }
];
function catalog(url) {
  const u = decodeURIComponent(url);
  let m;
  if ((m = /sap_code=eq\.([^&]+)/.exec(u))) return CAT.filter(r => r.sap_code === m[1]);
  if ((m = /ean_code=eq\.([^&]+)/.exec(u))) return CAT.filter(r => r.ean_code === m[1]);
  if ((m = /or=\(sap_code\.ilike\.([^*]*)\*,product_name\.ilike\.\*([^*]*)\*\)/.exec(u))) {
    const t = m[1].toLowerCase();
    return CAT.filter(r => r.sap_code.indexOf(t) === 0 || r.product_name.toLowerCase().indexOf(t) >= 0);
  }
  return [];
}

let idSeq = 0;
function env() {
  const db = { subs: [], items: [] };
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'push.js', 'email.js', 'loading.js', 'revaluation.js', 'revisions.js'],
    user: STORE_USER,
    data: {
      revaluation_campaigns: [CAMP],
      revaluation_submissions: () => db.subs,
      revaluation_items: () => db.items,
      revaluation_units: [],
      stores: [{ name: 'Габрово' }],
      users: [],
      product_catalog: catalog,
      app_settings: [{ key: 'revaluation_stores', value: 'Габрово' }]
    },
    globals: {
      pushToPeople: () => Promise.resolve({ ok: true }),
      sendEmail: () => Promise.resolve({ ok: true })
    }
  });
  h.db = db;
  h.w.rvStoresOn = false; h.w.rvStoresList = ['Габрово'];
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    const p = orig(url, init);
    const m = (init && init.method || 'GET').toUpperCase();
    if (m !== 'POST' || !/revaluation_/.test(url)) return p;
    return p.then(r => {
      if (!r.ok) return r;
      if (/revaluation_units/.test(url)) {
        const rows = [].concat(JSON.parse(init.body)).map(b => Object.assign({ id: 'u-' + (++idSeq), unit_no: 'GB' + idSeq }, b));
        return { ok: true, status: 201, json: () => Promise.resolve(rows), text: () => Promise.resolve(JSON.stringify(rows)) };
      }
      const defs = /revaluation_submissions/.test(url) ? { status: 'draft', no_items: false } : {};
      const row = Object.assign({ id: 'id-' + (++idSeq) }, defs, JSON.parse(init.body));
      if (/revaluation_submissions/.test(url)) db.subs.push(row);
      if (/revaluation_items/.test(url)) db.items.push(row);
      return { ok: true, status: 201, json: () => Promise.resolve([row]), text: () => Promise.resolve(JSON.stringify([row])) };
    });
  };
  /* цветът на toast-а (harness-ът пази само текста) */
  h.colors = [];
  const t = h.w.toast;
  h.w.toast = function (msg, c) { h.colors.push([msg, c]); return t(msg, c); };
  return h;
}
const mod = h => h.doc.getElementById('mod-revaluation');
const $ = (h, id) => h.doc.getElementById(id);
const itemPosts = h => h.calls.post.filter(x => x.table === 'revaluation_items');
const catGets = h => h.calls.get.filter(u => /product_catalog/.test(u));
const addBtn = h => btn($(h, 'rv-add'), 'Добави');
async function openForm(h) {
  await h.w.loadRevaluation(); await ticks(5);
  realClick(h.w, btn(mod(h), '＋ Ред')); await ticks(1);
}
function typeCode(h, code) {
  const el = $(h, 'rv-a-code');
  el.value = code;
  fire(h.w, el, 'input');
  return el;
}
async function enter(h) {
  const el = $(h, 'rv-a-code');
  const ev = { key: 'Enter', keyCode: 13, preventDefault() { ev.prevented = true; } };
  h.w.eval('(function(event){' + el.getAttribute('onkeydown') + '})').call(el, ev);
  await ticks(4);
  return ev;
}
async function blur(h) { fire(h.w, $(h, 'rv-a-code'), 'blur'); await ticks(4); }

(async function run() {

  section('1. т.3: SAP код + Enter → код, описание, МЕ и цена от каталога');
  {
    const h = env(); await openForm(h);
    typeCode(h, '53531');
    const ev = await enter(h);
    ok('Enter не изпраща формата (preventDefault)', ev.prevented === true);
    ok('заявката е по ТОЧЕН sap_code', catGets(h).some(u => /product_catalog\?sap_code=eq\.53531&/.test(u)), catGets(h).join(' | '));
    ok('…и взима sale_price', catGets(h).some(u => /sap_code=eq\.53531&select=[^&]*sale_price/.test(u)));
    ok('описание', $(h, 'rv-a-name').value === 'АРКА ГРАДИНСКА МЕТАЛНА', $(h, 'rv-a-name').value);
    ok('МЕ', $(h, 'rv-a-unit').value === 'БР');
    ok('т.4: ст. цена = sale_price (17,79)', $(h, 'rv-a-std').value === '17,79', $(h, 'rv-a-std').value);
    ok('фокусът — в „Причина / дефект"', h.doc.activeElement === $(h, 'rv-a-comment'));
    ok('нула POST-а — Enter само попълва', itemPosts(h).length === 0);
    /* после blur (фокусът мръдна) — същият код, втора заявка няма */
    const n = catGets(h).length;
    await blur(h);
    ok('blur след Enter със същия код → без втора заявка', catGets(h).length === n, catGets(h).length - n);
  }

  section('2. т.3: SAP код + излизане от полето → същото');
  {
    const h = env(); await openForm(h);
    typeCode(h, '77929');
    await blur(h);
    ok('blur зарежда артикула (МЕ М, цена 3,19)', $(h, 'rv-a-name').value === 'ЛАМПА СОЛАРНА СТИК' && $(h, 'rv-a-unit').value === 'М' && $(h, 'rv-a-std').value === '3,19',
      [$(h, 'rv-a-name').value, $(h, 'rv-a-unit').value, $(h, 'rv-a-std').value].join(' / '));
    const n = catGets(h).length;
    await blur(h);
    ok('втори blur без промяна на кода → без заявка', catGets(h).length === n);
    ok('празно поле + blur → без заявка', (() => { $(h, 'rv-a-code').value = ''; fire(h.w, $(h, 'rv-a-code'), 'blur'); return catGets(h).length === n; })());
  }

  section('3. т.3: непознат код → жълт toast, кодът остава, старото описание и цена се махат');
  {
    const h = env(); await openForm(h);
    typeCode(h, '53531'); await enter(h);
    typeCode(h, '99999'); await enter(h);
    const last = h.colors[h.colors.length - 1] || [];
    ok('toast „Кодът не е в каталога — попълни описанието на ръка"', last[0] === 'Кодът не е в каталога — попълни описанието на ръка', last[0]);
    ok('…жълт (#d97706)', last[1] === '#d97706', last[1]);
    ok('кодът остава в полето', $(h, 'rv-a-code').value === '99999');
    ok('описанието, МЕ и цената от 53531 са изчистени', $(h, 'rv-a-name').value === '' && $(h, 'rv-a-unit').value === '' && $(h, 'rv-a-std').value === '');
    /* ръчно попълване и „Добави" — минава */
    $(h, 'rv-a-name').value = 'Ръчно описание'; $(h, 'rv-a-std').value = '10';
    realClick(h.w, addBtn(h)); await ticks(6);
    const p = itemPosts(h)[0];
    ok('ръчният ред се записва с кода 99999', p && p.body.sap_code === '99999' && p.body.product_name === 'Ръчно описание' && p.body.std_price === 10, JSON.stringify(p && p.body));
  }

  section('4. т.3: 8xxxxxx → цената остава празна, с подсказката');
  {
    const h = env(); await openForm(h);
    typeCode(h, '8025298'); await enter(h);
    ok('описанието е от каталога', $(h, 'rv-a-name').value === 'ПРЕОЦ.ЛАМПА СОЛАРНА');
    ok('цената е празна (не 5,99)', $(h, 'rv-a-std').value === '', $(h, 'rv-a-std').value);
    ok('подсказката е показана, фокусът — в цената', $(h, 'rv-a-std-hint').style.display === 'block' && h.doc.activeElement === $(h, 'rv-a-std'));
  }

  section('5. EAN — както досега: Enter търси по ean_code; blur не прави нищо');
  {
    const h = env(); await openForm(h);
    typeCode(h, '3800123456789'); await blur(h);
    ok('EAN + blur → без заявка към каталога', catGets(h).length === 0, catGets(h).join(' | '));
    await enter(h);
    ok('EAN + Enter → заявка по ean_code, не по sap_code', catGets(h).some(u => /ean_code=eq\.3800123456789/.test(u)) && !catGets(h).some(u => /sap_code=eq\./.test(u)), catGets(h).join(' | '));
    ok('…и попълва 53531 с цена 17,79', $(h, 'rv-a-code').value === '53531' && $(h, 'rv-a-std').value === '17,79');
  }

  section('6. т.4: изборът от автодопълването носи цената');
  {
    const h = env(); await openForm(h);
    await h.w.rvAcFetch('арка'); await ticks(2);
    ok('автодопълването иска и sale_price', catGets(h).some(u => /or=\(.*select=[^&]*sale_price/.test(decodeURIComponent(u))), catGets(h).join(' | '));
    const items = h.doc.querySelectorAll('#rv-ac div[data-k]');
    ok('1 предложение (53531)', items.length === 1, items.length);
    realClick(h.w, items[0]); await ticks(2);
    ok('изборът попълва цената 17,79 (не я чисти)', $(h, 'rv-a-std').value === '17,79', $(h, 'rv-a-std').value);
    ok('…и описанието, МЕ', $(h, 'rv-a-name').value === 'АРКА ГРАДИНСКА МЕТАЛНА' && $(h, 'rv-a-unit').value === 'БР');
    ok('списъкът е затворен', $(h, 'rv-ac').style.display === 'none');
    /* 8xxxxxx от списъка — празна цена с подсказка */
    await h.w.rvAcFetch('преоц'); await ticks(2);
    realClick(h.w, h.doc.querySelector('#rv-ac div[data-k="0"]')); await ticks(2);
    ok('8025298 от списъка → цената е празна (не остава 17,79), подсказката е показана',
      $(h, 'rv-a-code').value === '8025298' && $(h, 'rv-a-std').value === '' && $(h, 'rv-a-std-hint').style.display === 'block', $(h, 'rv-a-std').value);
    /* артикул без цена в каталога → празно, не „null" */
    await h.w.rvAcFetch('без цена'); await ticks(2);
    $(h, 'rv-a-std').value = '3,19';
    realClick(h.w, h.doc.querySelector('#rv-ac div[data-k="0"]')); await ticks(2);
    ok('ред без sale_price → цената е празна (предишната 3,19 не остава)', $(h, 'rv-a-std').value === '', $(h, 'rv-a-std').value);
  }

  section('7. „Добави" веднага след кода (blur от натискането) → първо попълва, второто записва');
  {
    const h = env(); await openForm(h);
    typeCode(h, '53531');
    fire(h.w, $(h, 'rv-a-code'), 'blur');          /* mousedown на бутона = blur на полето */
    realClick(h.w, addBtn(h)); await ticks(6);
    ok('първото „Добави" не записва ред', itemPosts(h).length === 0, itemPosts(h).length);
    ok('…но артикулът е попълнен с цената', $(h, 'rv-a-name').value === 'АРКА ГРАДИНСКА МЕТАЛНА' && $(h, 'rv-a-std').value === '17,79');
    $(h, 'rv-a-comment').value = 'дефект';
    realClick(h.w, addBtn(h)); await ticks(6);
    const p = itemPosts(h)[0];
    ok('второто „Добави" записва ред с описание и цена 17,79', itemPosts(h).length === 1 && p.body.product_name === 'АРКА ГРАДИНСКА МЕТАЛНА' && p.body.std_price === 17.79, JSON.stringify(p && p.body));
    ok('формата е празна след добавянето', $(h, 'rv-a-code').value === '' && $(h, 'rv-a-name').value === '' && $(h, 'rv-a-std').value === '');
    /* същият код пак → пак се търси (не се „помни" от предишния ред) */
    const n = catGets(h).length;
    typeCode(h, '53531'); await blur(h);
    ok('същият код за нова бройка → пак се зарежда', catGets(h).length === n + 1 && $(h, 'rv-a-std').value === '17,79');
  }

  section('8. Остарял отговор: кодът е сменен, докато заявката тече → нищо не се попълва');
  {
    const h = env(); await openForm(h);
    typeCode(h, '53531');
    const pr = h.w.rvSapLookup('53531');
    $(h, 'rv-a-code').value = '77929';
    await pr; await ticks(2);
    ok('описанието и цената НЕ са от 53531', $(h, 'rv-a-name').value === '' && $(h, 'rv-a-std').value === '', $(h, 'rv-a-name').value);
    ok('без toast за „не е в каталога"', !h.calls.toast.some(t => /не е в каталога/.test(t)));
  }

  section('9. Нищо не се е провалило тихо');
  {
    const h = env(); await openForm(h);
    typeCode(h, '53531'); await enter(h);
    realClick(h.w, addBtn(h)); await ticks(6);
    ok('нула notOk', h.calls.notOk.length === 0, JSON.stringify(h.calls.notOk));
  }

  report();
})();
