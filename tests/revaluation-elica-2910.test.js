/* Преоценка — обратната връзка от Елица след Кърджали, „Пожелателна преоценка
   10.2026" (29.10.2026; поправките 30.10.2026, revaluation.js):
     1. баджът „в SAP" / „за създаване" гледа и product_catalog (само кодовете
        на бланката, in.(…) на порции) и стои под новия код в розовата колона;
     2. VK11 — колона „Обект" след „Валидна до", цената остава число;
     3. MM41 и „Кодовете са създадени" — по бланката на обекта, без кодовете
        от каталога; регистърът пише и обекта (store_name);
     4. „⬇ Прехвърляне" — Основен код / Количество / Код 8 / Количество / Завод
        (minus_plants, role 'наличност'); без завод → празно + жълт toast.
   Данните за Кърджали са 11-те реални реда (8 в каталога, 3 не — сверено със
   SQL на 30.10.2026). Регистърът тук е ПРАЗЕН, за да се види, че каталогът
   сам по себе си изключва (на живо и 11-те вече са в регистъра).

   Excel-ите минават през ИСТИНСКИЯ SheetJS 0.18.5 от node_modules, зареден
   вътре в jsdom прозореца (както xlsx-real-datenf.test.js), и се четат обратно
   с XLSX.read — проверява се файлът, не aoa-то.

   Мутационна проверка (30.10.2026) — всеки вариант е пуснат и е паднал:
     M1 rvCodeBadge без rvCat (само регистъра) → пада „8 кода от каталога → „в SAP““;
     M2 rvMm41Collect без проверката rvCat → пада „MM41: точно 3-те кода извън каталога“;
     M3 MM41 по кампанията (submission_id → campaign_id) → пада „Шумен не влиза“;
     M4 VK11 без store → пада „F2 = Кърджали“;
     M5 Завод от role 'доставка' → пада „Завод = 6508“;
     M6 rvLoadCat без порции (всички в една заявка) → пада „150 кода → 2 заявки“.
*/
'use strict';

const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, section, report, dayOffset, ticks } = H;

const ROOT = path.resolve(process.argv[2] || '.');
const XLSX_SRC = fs.readFileSync(path.join(ROOT, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'), 'utf8');

const CAMP = { id: 'c-1', title: 'Пожелателна преоценка 10.2026', kind: 'optional', starts_on: dayOffset(-2), ends_on: dayOffset(2), default_pct: 30, status: 'open' };
const SUBS = [
  { id: 's-k', campaign_id: 'c-1', store_name: 'Кърджали', status: 'processed', no_items: false },
  { id: 's-sh', campaign_id: 'c-1', store_name: 'Шумен', status: 'submitted', no_items: false },
  { id: 's-pz', campaign_id: 'c-1', store_name: 'Пазарджик', status: 'submitted', no_items: false }
];
const IN_CAT = ['8097638', '8099404', '8096295', '8092880', '8100913', '8103124', '8103126', '8104074'];
const NOT_CAT = ['8103128', '8103131', '8104871'];
const REAL = ['8097638', '8099404', '8096295', '8092880', '8100913', '8103124', '8103126', '8103128', '8103131', '8104074', '8104871'];
let n = 0;
const item = (sub, store, sap, nw, o) => Object.assign({ id: 'i-' + (++n), submission_id: sub, campaign_id: 'c-1', store_name: store, sort_order: n,
  sap_code: sap, product_name: 'АРТИКУЛ ' + sap, unit: 'бр.', qty: 1, std_price: 10, discount_pct: 50, proposed_price: 5,
  new_sap_code: nw, sale_price: 1.79, co_qty: 1 }, o || {});
const ITEMS = REAL.map(c => item('s-k', 'Кърджали', c.slice(1).replace(/^0+/, ''), c))
  .concat([
    item('s-k', 'Кърджали', '8025298', '8025298', { co_qty: 2, sale_price: 3.5 }),   /* повторна преоценка */
    item('s-k', 'Кърджали', '55555', '8055555', { co_qty: 0 }),                     /* нищо за прехвърляне */
    item('s-sh', 'Шумен', '200001', '8200001'),                                       /* друга бланка */
    item('s-pz', 'Пазарджик', '300001', '8300001', { co_qty: 4 })
  ]);
const CATALOG = IN_CAT.concat(['8025298', '8055555', '14557']).map(c => ({ sap_code: c, product_name: 'x' }));
const PLANTS = [
  { plant: '5508', store_name: 'Кърджали', role: 'доставка' }, { plant: '6508', store_name: 'Кърджали', role: 'наличност' },
  { plant: '5514', store_name: 'Шумен', role: 'наличност' }
];
const ADMIN = { email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', role: 'controlling', store_name: 'Централен офис' };
const SUPPLY = { email: 'sn@temax.bg', display_name: 'Снаб', role: 'supply', store_name: 'Централен офис' };

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
function env(o) {
  o = o || {};
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'push.js', 'email.js', 'revaluation.js'],
    user: o.user || ADMIN,
    fail: o.fail,
    data: {
      revaluation_campaigns: [CAMP],
      revaluation_submissions: url => filt(SUBS, url),
      revaluation_items: url => filt(ITEMS, url),
      revaluation_codes: () => o.codes || [],
      product_catalog: url => filt(CATALOG, url),
      minus_plants: url => filt(PLANTS, url),
      stores: [{ name: 'Кърджали' }, { name: 'Шумен' }, { name: 'Пазарджик' }],
      users: [], app_settings: []
    }
  });
  h.w.rvStoresOn = true;
  h.w.eval(XLSX_SRC);
  h.X = h.w.XLSX;
  h.written = [];
  h.X.writeFile = (wb, name) => { h.written.push({ wb, name }); };
  return h;
}
/* истински запис и четене — каквото ще отвори Excel */
function readBack(h, k) {
  const wb = h.X.read(h.X.write(h.written[k || 0].wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return { ws, name: wb.SheetNames[0], aoa: h.X.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) };
}
const mod = h => h.doc.getElementById('mod-revaluation');
const row = (h, code) => { const it = ITEMS.find(x => x.new_sap_code === code && x.submission_id === 's-k'); return h.doc.getElementById('rv-row-' + it.id); };
async function open(h, store) { await h.w.loadRevaluation(); await ticks(8); if (store) { await h.w.rvCoOpenStore(store); await ticks(10); } }

(async function run() {

  section('1. Баджът гледа и каталога — под новия код');
  {
    const h = env(); await open(h, 'Кърджали');
    const inSap = IN_CAT.filter(c => { const r = row(h, c); return r && r.children[8].querySelector('.rv-in-sap'); });
    ok('8 кода от каталога → „в SAP“ (в розовата колона)', inSap.length === 8, inSap.join(','));
    const toCreate = NOT_CAT.filter(c => { const r = row(h, c); return r && r.children[8].querySelector('.rv-to-create'); });
    ok('8103128, 8103131, 8104871 → „за създаване“', toCreate.length === 3, toCreate.join(','));
    ok('баджът е под кода (div след стойността)', !!row(h, '8103128').children[8].querySelector('.rv-code-badge .rv-to-create'));
    const inCode = REAL.filter(c => row(h, c).children[0].querySelector('.rv-in-sap,.rv-to-create'));
    ok('колоната „Код“ вече няма бадж', inCode.length === 0, inCode.join(','));
    const cat = h.calls.get.filter(u => u.indexOf('/product_catalog') >= 0);
    ok('каталогът се чете само по кодовете (in.), не целият', cat.length > 0 && cat.every(u => /sap_code=in\./.test(decodeURIComponent(u))), cat.join('\n'));
    ok('…и без кода от Шумен', cat.every(u => decodeURIComponent(u).indexOf('8200001') < 0));
    ok('регистърът сам → „в SAP“ (без каталог)', (() => { h.w.rvCodes['8103128'] = true; h.w.rvRender(); return !!row(h, '8103128').children[8].querySelector('.rv-in-sap'); })());

    const big = env();
    const codes = Array.from({ length: 150 }, (_, i) => String(8900000 + i));
    const before = big.calls.get.length;
    const r = await big.w.rvLoadCat(codes);
    const g = big.calls.get.slice(before).filter(u => u.indexOf('/product_catalog') >= 0);
    ok('150 кода → 2 заявки по ≤100', r.ok && g.length === 2 && g.every(u => decodeURIComponent(u).split('in.(')[1].split(')')[0].split(',').length <= 100), g.length);
    const again = big.calls.get.length; await big.w.rvLoadCat(codes);
    ok('проверените не се питат пак', big.calls.get.length === again);

    const f = env({ fail: { GET: /product_catalog/ } }); await open(f, 'Кърджали');
    ok('паднал каталог → няма лъжливо „за създаване“', !f.doc.querySelector('#rv-rows .rv-to-create'));
  }

  section('2. VK11 — колона „Обект“ след „Валидна до“');
  {
    const h = env(); await open(h, 'Кърджали');
    h.doc.getElementById('rv-vk-from').value = '2026-10-30';
    realClick(h.w, btn(mod(h), 'VK11')); await ticks(3);
    ok('файлът е направен', h.written.length === 1, h.written.map(x => x.name).join(','));
    const { ws, aoa } = readBack(h);
    ok('първите 5 колони точно като шаблона', JSON.stringify(aoa[0].slice(0, 5)) === JSON.stringify(['Материал', 'МЕ', 'Прод,цена нова', 'Валидна от', 'Валидна до']), JSON.stringify(aoa[0]));
    ok('F1 = „Обект“', ws.F1 && ws.F1.v === 'Обект', ws.F1 && ws.F1.v);
    ok('F2 = Кърджали', ws.F2 && ws.F2.v === 'Кърджали', ws.F2 && ws.F2.v);
    ok('цената е числова клетка (C2 t=n, 1.79)', ws.C2 && ws.C2.t === 'n' && ws.C2.v === 1.79, ws.C2 && (ws.C2.t + ' ' + ws.C2.v));
    ok('само 6 колони', ws['!ref'] && /^A1:F\d+$/.test(ws['!ref']), ws['!ref']);
  }

  section('3. MM41 по бланката на обекта');
  {
    const h = env(); await open(h);
    ok('обзор на кампанията: без MM41 и без „създадени“', !btn(mod(h), 'MM41') && !btn(mod(h), 'Кодовете са създадени'));
    await h.w.rvCoOpenStore('Кърджали'); await ticks(10);
    realClick(h.w, btn(mod(h), '⬇ MM41')); await ticks(12);
    ok('файлът е направен', h.written.length === 1);
    const { aoa } = readBack(h);
    const got = aoa.slice(1).map(r => String(r[0]));
    ok('MM41: точно 3-те кода извън каталога', got.join(',') === NOT_CAT.join(','), got.join(','));
    ok('Шумен не влиза (8200001)', got.indexOf('8200001') < 0);
    ok('повторната не влиза (8025298)', got.indexOf('8025298') < 0);
    ok('името носи обекта и кампанията', /Кърджали/.test(h.written[0].name) && /Пожелателна_преоценка_10\.2026/.test(h.written[0].name), h.written[0].name);

    realClick(h.w, btn(mod(h), 'Кодовете са създадени в SAP')); await ticks(12);
    const p = h.calls.post.find(x => x.table === 'revaluation_codes');
    ok('регистър: 3-те кода', p && p.body.map(x => x.new_sap_code).join(',') === NOT_CAT.join(','), p && JSON.stringify(p.body.map(x => x.new_sap_code)));
    ok('регистър: записва и обекта', p && p.body.every(x => x.store_name === 'Кърджали'));

    const reg = env({ codes: [{ new_sap_code: '8103131' }] }); await open(reg, 'Кърджали');
    realClick(reg.w, btn(mod(reg), '⬇ MM41')); await ticks(12);
    const g2 = reg.written.length ? readBack(reg).aoa.slice(1).map(r => String(r[0])) : [];
    ok('код в регистъра не влиза', g2.join(',') === '8103128,8104871', g2.join(','));

    const f = env({ fail: { GET: /product_catalog/ } }); await open(f, 'Кърджали');
    realClick(f.w, btn(mod(f), '⬇ MM41')); await ticks(12);
    ok('паднал каталог → MM41 НЕ е направен', !f.written.length && f.calls.toast.some(t => t.indexOf('MM41 НЕ е направен') >= 0), f.calls.toast.join(' | '));
  }

  section('4. „⬇ Прехвърляне“');
  {
    const h = env(); await open(h, 'Кърджали');
    realClick(h.w, btn(mod(h), '⬇ Прехвърляне')); await ticks(10);
    ok('файлът е направен', h.written.length === 1, h.calls.toast.join(' | '));
    const { ws, aoa } = readBack(h);
    ok('заглавията', JSON.stringify(aoa[0]) === JSON.stringify(['Основен код', 'Количество', 'Код 8', 'Количество', 'Завод']), JSON.stringify(aoa[0]));
    const body = aoa.slice(1);
    ok('12 реда (11 + повторната; co_qty 0 не влиза)', body.length === 12, body.length);
    const r1 = body.find(r => String(r[2]) === '8097638');
    ok('ред: 97638 · 1 · 8097638 · 1 · 6508', r1 && String(r1[0]) === '97638' && r1[1] === 1 && r1[3] === 1 && String(r1[4]) === '6508', JSON.stringify(r1));
    ok('Завод = 6508 на всички (наличност, не доставка 5508)', body.every(r => String(r[4]) === '6508'));
    const rp = body.find(r => String(r[0]) === '8025298');
    ok('повторна преоценка влиза (8025298 → 8025298, 2)', rp && String(rp[2]) === '8025298' && rp[1] === 2 && rp[3] === 2, JSON.stringify(rp));
    ok('количествата са числа', ws.B2.t === 'n' && ws.D2.t === 'n');
    ok('без код 8055555 (co_qty 0)', !body.some(r => String(r[2]) === '8055555'));

    const pz = env(); await open(pz, 'Пазарджик');
    realClick(pz.w, btn(mod(pz), '⬇ Прехвърляне')); await ticks(10);
    ok('Пазарджик: файлът пак е направен', pz.written.length === 1);
    const b2 = pz.written.length ? readBack(pz).aoa.slice(1) : [];
    ok('Пазарджик: „Завод“ е празна', b2.length === 1 && b2[0][4] === '' && b2[0][1] === 4, JSON.stringify(b2));
    ok('Пазарджик: предупреждение „няма завод“', pz.calls.toast.some(t => t.indexOf('няма завод') >= 0 && t.indexOf('Пазарджик') >= 0), pz.calls.toast.join(' | '));

    const f = env({ fail: { GET: /minus_plants/ } }); await open(f, 'Кърджали');
    realClick(f.w, btn(mod(f), '⬇ Прехвърляне')); await ticks(10);
    ok('паднали заводи → файлът НЕ е направен', !f.written.length && f.calls.toast.some(t => t.indexOf('НЕ е направен') >= 0));

    const s = env({ user: SUPPLY }); await open(s, 'Кърджали');
    ok('supply: без „Прехвърляне“ и без MM41', !btn(mod(s), 'Прехвърляне') && !btn(mod(s), 'MM41'));
    const r = await s.w.rvTransfer();
    ok('supply: rvTransfer() → отказ', r === false && !s.written.length);
  }

  report();
})();
