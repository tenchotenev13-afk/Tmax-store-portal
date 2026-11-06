/* Преоценка — довършване преди „Задължителна преоценка 11.2026" (06.11.2026).

   1. „✔ Приеми предложените за всички" (rvCoAcceptAll): новите кодове получават
      знака „в SAP" / „за създаване" веднага, без повторно отваряне на бланката
      (rvLoadCat за записаните кодове, после rvRender — както rvCoEdit).
      Паднала заявка към каталога → без знак, не лъжливо „за създаване".
   2. Мерни единици: всяка от 14-те SAP единици (RV_SAP_VALUES) минава
      normalizeCatalogUnit (admin.js) → rvSapUnit (revaluation.js) и се връща
      същата, с ok. Стойността след normalizeCatalogUnit е в менюто
      unitOptionsHtml (shared.js), а попълването от каталога в ред на заявка
      избира „ккт", не оставя „Бр.".

   Мутационна проверка (06.11.2026):
     M1 rvCoAcceptAll без rvLoadCat (както преди поправката) → падат
        „8097638 → „в SAP““ и „8103128 → „за създаване““;
     M2 unitOptionsHtml без новите 8 → падат „… в менюто“ и „ред на заявка: ккт“.

   Пускане: node tests/preocenka-dovarshvane.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, section, report, dayOffset, ticks, fire, guard } = H;

const CAMP = { id: 'c-1', title: 'Задължителна преоценка 11.2026', kind: 'mandatory', starts_on: dayOffset(-1), ends_on: dayOffset(1), default_pct: 50, status: 'open' };
const SUBS = [{ id: 's-sh', campaign_id: 'c-1', store_name: 'Шумен', status: 'submitted', no_items: false }];
/* Двата реда са БЕЗ записани розови полета — предложенията ги пълнят. */
const ITEMS = [
  { id: 'i-1', submission_id: 's-sh', campaign_id: 'c-1', store_name: 'Шумен', sort_order: 1, sap_code: '97638', product_name: 'В КАТАЛОГА',
    unit: 'бр.', qty: 2, std_price: 10, discount_pct: 50, proposed_price: 5, new_sap_code: null, sale_price: null, co_qty: null },
  { id: 'i-2', submission_id: 's-sh', campaign_id: 'c-1', store_name: 'Шумен', sort_order: 2, sap_code: '103128', product_name: 'ИЗВЪН КАТАЛОГА',
    unit: 'бр.', qty: 1, std_price: 20, discount_pct: 50, proposed_price: 10, new_sap_code: null, sale_price: null, co_qty: null }
];
const CATALOG = [{ sap_code: '8097638', product_name: 'x' }, { sap_code: '97638', product_name: 'x' }, { sap_code: '103128', product_name: 'x' }];
const ELICA = { email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', role: 'controlling', store_name: 'Централен офис' };

function filt(rows, url) {
  const q = decodeURIComponent(String(url).split('?')[1] || '');
  let out = rows.slice();
  q.split('&').forEach(p => {
    const m = /^([a-z_]+)=eq\.(.*)$/.exec(p);
    if (m) out = out.filter(r => String(r[m[1]]) === m[2]);
    const mi = /^([a-z_]+)=in\.\((.*)\)$/.exec(p);
    if (mi) { const vals = mi[2].split(','); out = out.filter(r => vals.indexOf(String(r[mi[1]])) >= 0); }
  });
  return out;
}
function rvEnv(o) {
  o = o || {};
  const items = ITEMS.map(x => Object.assign({}, x));   /* PATCH пипа копието */
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'push.js', 'email.js', 'revaluation.js'],
    user: ELICA, confirm: true, fail: o.fail,
    data: {
      revaluation_campaigns: [CAMP],
      revaluation_submissions: url => filt(SUBS, url),
      revaluation_items: url => filt(items, url),
      revaluation_codes: [],
      product_catalog: url => filt(CATALOG, url),
      minus_plants: [], stores: [{ name: 'Шумен' }], users: [], app_settings: []
    }
  });
  h.w.rvStoresOn = true;
  return h;
}
const rowEl = (h, id) => h.doc.getElementById('rv-row-' + id);
const badge = (h, id, cls) => { const r = rowEl(h, id); return !!r && !!r.querySelector('.' + cls); };
const acceptBtn = h => Array.from(h.doc.querySelectorAll('#mod-revaluation button')).find(b => /Приеми предложените за всички/.test(b.textContent));

(async function run() {

  section('1. „✔ Приеми предложените за всички" → знакът веднага');
  {
    const h = rvEnv();
    await h.w.loadRevaluation(); await ticks(8);
    await h.w.rvCoOpenStore('Шумен'); await ticks(10);
    ok('двата реда са на екрана', !!rowEl(h, 'i-1') && !!rowEl(h, 'i-2'));
    ok('преди: без знак (кодът още не е записан)', !badge(h, 'i-1', 'rv-in-sap') && !badge(h, 'i-2', 'rv-to-create'));
    const b = acceptBtn(h);
    if (ok('бутонът „✔ Приеми предложените за всички" е там', !!b)) {
      realClick(h.w, b); await ticks(30);
      const it1 = h.w.rvItems.find(x => x.id === 'i-1'), it2 = h.w.rvItems.find(x => x.id === 'i-2');
      ok('кодовете са записани (8097638, 8103128)', it1 && it1.new_sap_code === '8097638' && it2 && it2.new_sap_code === '8103128', it1 && it1.new_sap_code);
      ok('8097638 (в каталога) → „в SAP“ без ново отваряне', badge(h, 'i-1', 'rv-in-sap'));
      ok('8103128 (извън каталога) → „за създаване“ без ново отваряне', badge(h, 'i-2', 'rv-to-create'));
      const catGets = h.calls.get.filter(u => u.indexOf('/product_catalog') >= 0).map(decodeURIComponent);
      ok('каталогът е питан по двата нови кода (in.)', catGets.some(u => /sap_code=in\.\([^)]*8097638/.test(u)) && catGets.some(u => /sap_code=in\.\([^)]*8103128/.test(u)), catGets.join('\n'));
    }
  }
  {
    const f = rvEnv({ fail: { GET: /product_catalog/ } });
    await f.w.loadRevaluation(); await ticks(8);
    await f.w.rvCoOpenStore('Шумен'); await ticks(10);
    const b = acceptBtn(f);
    if (ok('паднал каталог: бутонът е там', !!b)) {
      realClick(f.w, b); await ticks(30);
      const it2 = f.w.rvItems.find(x => x.id === 'i-2');
      ok('паднал каталог: кодовете пак са записани', it2 && it2.new_sap_code === '8103128');
      ok('паднал каталог → без „за създаване“ и без „в SAP“', !f.doc.querySelector('#rv-rows .rv-to-create') && !f.doc.querySelector('#rv-rows .rv-in-sap'));
    }
  }

  section('2. Мерни единици: каталог → SAP, и менюто');
  {
    const h = boot({
      modules: ['client-orders.js', 'transport.js', 'stock-returns.js', 'stock-differences.js', 'admin.js', 'push.js', 'email.js', 'revaluation.js'],
      user: { email: 'vraca@temax.bg', display_name: 'Управител Враца', role: 'manager', store_name: 'Враца' },
      data: {
        stock_differences: [], differences_reports: [], stock_returns: [], client_orders: [], transport_orders: [],
        product_catalog: url => /sap_code=eq\.77777/.test(decodeURIComponent(url)) ? [{ sap_code: '77777', product_name: 'КУТИЯ ПЛОЧКИ', default_unit: 'ккт' }] : []
      }
    });
    const w = h.w;
    const SAP = w.RV_SAP_VALUES;
    ok('14 SAP единици в RV_SAP_VALUES', Array.isArray(SAP) && SAP.length === 14, SAP && SAP.join(','));
    const menu = Array.from(h.doc.createRange().createContextualFragment('<select>' + w.unitOptionsHtml('') + '</select>').querySelectorAll('option')).map(o => o.value);
    const bad = [], notInMenu = [];
    SAP.forEach(u => {
      const cat = w.normalizeCatalogUnit(u);
      const r = w.rvSapUnit(cat);
      if (!(r.ok && r.unit === u)) bad.push(u + '→' + cat + '→' + r.unit + (r.ok ? '' : '(!ok)'));
      if (menu.indexOf(cat) < 0) notInMenu.push(u + '→' + cat);
    });
    ok('всяка: normalizeCatalogUnit → rvSapUnit връща същата, ok', bad.length === 0, bad.join(' | '));
    ok('стойността след normalizeCatalogUnit е в менюто unitOptionsHtml', notInMenu.length === 0, notInMenu.join(' | '));
    ok('M3 е с латинско M → „m3“ (както в базата)', w.normalizeCatalogUnit('M3') === 'm3', w.normalizeCatalogUnit('M3'));
    ok('старите единици са на мястото си (вкл. компл.)', ['бр.', 'кашон', 'кв.м', 'л.м', 'компл.', 'пакет', 'чифт'].every(v => menu.indexOf(v) >= 0), menu.join(','));

    const host = h.doc.createElement('div');
    host.innerHTML = w.itemRowHtml({});
    h.doc.body.appendChild(host);
    const sapEl = host.querySelector('.item-sap');
    sapEl.value = '77777';
    if (guard('ред на заявка: blur не хвърля', () => fire(w, sapEl, 'blur'))) {
      await ticks(); await ticks();
      ok('ред на заявка: от каталога „ккт“ се избира, не остава „бр.“', host.querySelector('.item-unit').value === 'ккт', host.querySelector('.item-unit').value);
    }
  }

  report();
})();
