/* Преоценка — обратна връзка от Елица (13.11.2026), решения на Тенчо 14.11.2026
   (revaluation.js):
   1. Повторно преоценен код (rvIsRepeat — 8 + 6 цифри): Контролинг само сменя
      цената, не прехвърля. „Прехвърлено" — без поле и без предложение, текст
      „само цена" (ЦО, обработената бланка на обекта, имейлът „обработена");
      „Готово" не го изисква; „⬇ Прехвърляне" не го включва; тоталите — по qty.
      Заварените (co_qty = 1 при Кърджали) се показват като „само цена".
   2. Excel — 14 колони: „Прехвърлено" веднага след „Количество". Двата тотала
      по ЕДНО ефективно количество: co_qty; при повторен — qty; без него —
      „Тотал ст.пр.цена" = qty × ст. цена, „Тотал преоценка" празно. Данните на
      Шумен от базата (80291 6,178 → 5,738; 90706 9,33 → 6,48). „Общо" — без
      втора „Прехвърлено", TOTAL = „Тотал преоценка".
   Файловете се правят и четат с ИСТИНСКИЯ SheetJS от node_modules.

   Мутационна проверка (14.11.2026) — всеки вариант е пуснат и е паднал:
     R1 rvCoProposal предлага co_qty и за повторен → пада „без предложение за
        Прехвърлено" / „„Приеми“ не пише co_qty на повторния";
     R2 rvCoDone пак иска co_qty от повторния → пада „„Готово“ минава без
        „Прехвърлено“ на повторния";
     R3 rvCoDone не иска co_qty и от обикновения → пада „обикновен ред —
        „Готово“ пак иска „Прехвърлено“";
     R4 rvTransferAoa без изключването → пада „„Прехвърляне“ — без повторния";
     R5 rvPinkCells без „само цена" → пада „заварен повторен (co_qty 1) →
        „само цена“";
     R6 rvItemExportRow: „Тотал ст.пр.цена" пак по qty → пада „80291 —
        Тотал ст.пр.цена 74,48";
     R7 rvEffQty при повторен по co_qty → пада „повторен — тоталите по qty";
     R8 „Общо" с втора „Прехвърлено" → пада „„Общо“ — една „Прехвърлено“";
     R9 имейлът без „само цена" → пада „имейл: „само цена“ за повторния".
*/
'use strict';

const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, section, report, dayOffset, ticks } = H;

const ROOT = path.resolve(process.argv[2] || '.');
const XLSX_SRC = fs.readFileSync(path.join(ROOT, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'), 'utf8');

const CAMP = { id: 'c-1', title: 'Задължителна преоценка 11.2026', kind: 'mandatory', starts_on: dayOffset(-1), ends_on: dayOffset(1), default_pct: 50, status: 'open' };
const it = (id, sub, store, o) => Object.assign({ id, submission_id: sub, campaign_id: 'c-1', store_name: store, sort_order: 1,
  product_name: 'АРТИКУЛ', unit: 'бр.', qty: 1, std_price: 10, discount_pct: 50, proposed_price: 5, store_comment: 'стар',
  new_sap_code: null, sale_price: null, co_qty: null, co_comment: null }, o);
/* Кърджали — одобрена, за обработка: повторен без co_qty + обикновен */
const K_REP = () => it('k-rep', 's-k', 'Кърджали', { sap_code: '8086397', qty: 1, std_price: 29.99, proposed_price: 9, new_sap_code: '8086397', sale_price: 9 });
const K_NORM = o => it('k-norm', 's-k', 'Кърджали', Object.assign({ sap_code: '14557', qty: 2, std_price: 120, proposed_price: 60, new_sap_code: '8014557', sale_price: 60, sort_order: 2 }, o || {}));
/* Шумен — обработена, данните от базата (14.11.2026) */
const SH = [
  it('sh-1', 's-sh', 'Шумен', { sap_code: '80291', unit: 'M2', qty: 6.178, std_price: 12.98, proposed_price: 3, new_sap_code: '8080291', sale_price: 3, co_qty: 5.738 }),
  it('sh-2', 's-sh', 'Шумен', { sap_code: '90706', unit: 'M2', qty: 9.33, std_price: 15.98, proposed_price: 4, new_sap_code: '8090706', sale_price: 4, co_qty: 6.48, sort_order: 2 })
];
const ELITSA = { email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', role: 'controlling', store_name: 'Централен офис' };
const MGR_K = { email: 'managerkardjali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };
const USERS = [{ email: 'managerkardjali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали', active: true }];

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
  const subs = o.subs || [{ id: 's-k', campaign_id: 'c-1', store_name: 'Кърджали', status: 'approved', no_items: false },
    { id: 's-sh', campaign_id: 'c-1', store_name: 'Шумен', status: 'processed', no_items: false }];
  const items = o.items || [K_REP(), K_NORM()].concat(SH.map(x => Object.assign({}, x)));
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'push.js', 'email.js', 'revaluation.js'],
    user: o.user || ELITSA,
    data: {
      revaluation_campaigns: [CAMP],
      revaluation_submissions: url => filt(subs, url),
      revaluation_items: url => filt(items, url),
      revaluation_codes: [], product_catalog: [],
      minus_plants: [{ plant: '6508', store_name: 'Кърджали', role: 'наличност' }],
      stores: [{ name: 'Кърджали' }, { name: 'Шумен' }],
      users: url => filt(USERS, url),
      app_settings: url => filt([{ key: 'revaluation_done_cc', value: 'cc@temax.bg' }], url)
    },
    globals: {
      pushToPeople: () => Promise.resolve({ ok: true }),
      sendEmail: (to, subj, html, extra) => { h.mail.push({ to, subj, html, extra: extra || {} }); return Promise.resolve({ ok: true }); }
    }
  });
  h.mail = []; h.items = items;
  h.w.rvStoresOn = true;
  h.w.eval(XLSX_SRC);
  h.X = h.w.XLSX;
  h.written = [];
  h.X.writeFile = (wb, name) => { h.written.push({ wb, name }); };
  return h;
}
function sheetAoa(h, wb, name) {
  const back = h.X.read(h.X.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
  return h.X.utils.sheet_to_json(back.Sheets[name || back.SheetNames[0]], { header: 1, defval: '', raw: true });
}
const mod = h => h.doc.getElementById('mod-revaluation');
const row = (h, id) => h.doc.getElementById('rv-row-' + id);
const subPatch = h => h.calls.patch.filter(x => x.table === 'revaluation_submissions');
async function openCo(h, store) { await h.w.loadRevaluation(); await ticks(8); await h.w.rvCoOpenStore(store); await ticks(10); }

(async function run() {
  section('1. Повторен ред при Контролинг — „само цена“, без поле и предложение');
  {
    const h = env(); await openCo(h, 'Кърджали');
    const rep = row(h, 'k-rep'), norm = row(h, 'k-norm');
    ok('повторен: няма поле „Прехвърлено“', !rep.querySelector('input[data-f="co_qty"]'));
    ok('повторен: клетка „само цена“', !!rep.querySelector('.rv-price-only') && rep.querySelector('.rv-price-only').textContent === 'само цена');
    ok('повторен: без предложение за Прехвърлено', !('co_qty' in h.w.rvCoProposal(h.items[0])));
    ok('обикновен: полето е там с предложение = qty', !!norm.querySelector('input[data-f="co_qty"]') && norm.querySelector('input[data-f="co_qty"]').value === '2');
    ok('rvCoEdit(co_qty) на повторния → отказ, без PATCH', (await h.w.rvCoEdit('k-rep', 'co_qty', '5')) === false && !h.calls.patch.some(x => x.table === 'revaluation_items'));
    realClick(h.w, btn(mod(h), 'Приеми предложените')); await ticks(10);
    const pRep = h.calls.patch.filter(x => x.table === 'revaluation_items' && /id=eq\.k-rep/.test(x.url));
    const pNorm = h.calls.patch.filter(x => x.table === 'revaluation_items' && /id=eq\.k-norm/.test(x.url));
    /* Кодът и цената на повторния са попълнени, а co_qty не се предлага → няма какво да се запише. */
    ok('„Приеми“ не пише co_qty на повторния (0 PATCH-а за него)', pRep.length === 0, JSON.stringify(pRep.map(x => x.body)));
    ok('…а на обикновения пише co_qty = 2', pNorm.some(x => x.body.co_qty === 2), JSON.stringify(pNorm.map(x => x.body)));
  }

  section('2. „✅ Готово за обект“');
  {
    const h = env(); await openCo(h, 'Кърджали');
    realClick(h.w, btn(mod(h), 'Готово за обект')); await ticks(8);
    ok('обикновен ред — „Готово“ пак иска „Прехвърлено“ (без PATCH)', subPatch(h).length === 0 && !!h.w.rvBad['k-norm'] && h.w.rvBad['k-norm'].join(' ').indexOf('прехвърлено') >= 0);
    ok('…повторният не е маркиран', !h.w.rvBad['k-rep']);
    const g = env({ items: [K_REP(), K_NORM({ co_qty: 2 })] }); await openCo(g, 'Кърджали');
    realClick(g.w, btn(mod(g), 'Готово за обект')); await ticks(15);
    const p = subPatch(g)[0];
    ok('„Готово“ минава без „Прехвърлено“ на повторния', p && p.body.status === 'processed', JSON.stringify(g.w.rvBad));
    const m = g.mail[0];
    ok('имейл: „само цена“ за повторния', m && /<td>8086397<\/td><td>АРТИКУЛ<\/td><td>само цена<\/td>/.test(m.html), m && m.html.slice(0, 400));
    ok('имейл: „14 колони“ в текста', m && m.html.indexOf('14 колони') >= 0);
    const att = m && m.extra.attachments && m.extra.attachments[0];
    const aoa = att ? g.X.utils.sheet_to_json(g.X.read(att.content, { type: 'base64' }).Sheets[g.X.read(att.content, { type: 'base64' }).SheetNames[0]], { header: 1, defval: '', raw: true }) : null;
    ok('прикаченият файл — 14 колони, „Прехвърлено“ на [4]', aoa && aoa[0].length === 14 && aoa[0][4] === 'Прехвърлено', aoa && JSON.stringify(aoa[0]));
    const ar = aoa && aoa.find(r => String(r[1]) === '8086397');
    ok('прикаченият: повторен — „само цена“, тотали по qty (1 × 29,99 / 1 × 9)', ar && ar[4] === 'само цена' && ar[12] === 29.99 && ar[13] === 9, ar && JSON.stringify(ar));
  }

  section('3. „⬇ Прехвърляне“ — без повторния (и при заварен co_qty = 1)');
  {
    const h = env({ items: [K_REP(), K_NORM({ co_qty: 2 })].map((x, i) => i === 0 ? Object.assign(x, { co_qty: 1 }) : x) });
    await openCo(h, 'Кърджали');
    realClick(h.w, btn(mod(h), '⬇ Прехвърляне')); await ticks(10);
    const aoa = h.written[0] && sheetAoa(h, h.written[0].wb);
    ok('файлът е направен', !!aoa, h.calls.toast.join(' | '));
    ok('„Прехвърляне“ — без повторния', aoa && !aoa.slice(1).some(r => String(r[0]) === '8086397' || String(r[2]) === '8086397'), aoa && JSON.stringify(aoa));
    ok('…обикновеният е там (14557 → 8014557, 2)', aoa && aoa.slice(1).length === 1 && String(aoa[1][0]) === '14557' && aoa[1][1] === 2);
    const mm = await h.w.rvMm41Collect();
    ok('MM41 — също без повторния', mm.ok && !mm.rows.some(r => r.sap_code === '8086397'), JSON.stringify(mm));
  }

  section('4. Заварен повторен (co_qty 1) в обработената бланка на обекта');
  {
    const subs = [{ id: 's-k', campaign_id: 'c-1', store_name: 'Кърджали', status: 'processed', no_items: false }];
    /* qty 2 ≠ co_qty 1 — иначе правилото „по qty“ не се различава от „по co_qty“ */
    const h = env({ user: MGR_K, subs, items: [Object.assign(K_REP(), { qty: 2, co_qty: 1 }), K_NORM({ co_qty: 2 })] });
    await h.w.loadRevaluation(); await ticks(10);
    const rep = row(h, 'k-rep');
    ok('заварен повторен (co_qty 1) → „само цена“', !!rep && !!rep.querySelector('.rv-price-only') && rep.textContent.indexOf('само цена') >= 0, rep && rep.textContent);
    ok('обикновеният показва 2', row(h, 'k-norm').textContent.indexOf('само цена') < 0);
    realClick(h.w, btn(mod(h), 'Изтегли моята бланка'));
    const aoa = h.written[0] && sheetAoa(h, h.written[0].wb);
    const r = aoa && aoa.find(x => String(x[1]) === '8086397');
    ok('„Изтегли моята бланка“ — 14 колони, повторен „само цена“', aoa && aoa[0].length === 14 && r && r[4] === 'само цена', aoa && JSON.stringify(aoa[0]));
    ok('повторен — тоталите по qty, не по co_qty (2 × 29,99 = 59,98 / 2 × 9 = 18)', r && r[3] === 2 && r[12] === 59.98 && r[13] === 18, r && JSON.stringify(r));
  }

  section('5. „📥 Excel — този обект“ — Шумен с данните от базата');
  {
    const h = env(); await openCo(h, 'Шумен');
    realClick(h.w, btn(mod(h), 'Excel — този обект'));
    const aoa = h.written[0] && sheetAoa(h, h.written[0].wb);
    ok('14 колони, „Прехвърлено“ на място 3 (след „Количество“)', aoa && aoa[0].length === 14 && aoa[0][3] === 'Количество' && aoa[0][4] === 'Прехвърлено', aoa && JSON.stringify(aoa[0]));
    const a = aoa && aoa.find(r => String(r[1]) === '80291'), b = aoa && aoa.find(r => String(r[1]) === '90706');
    ok('80291 — Количество 6,178, Прехвърлено 5,738', a && a[3] === 6.178 && a[4] === 5.738, a && JSON.stringify(a));
    ok('80291 — Тотал ст.пр.цена 74,48 (5,738 × 12,98)', a && a[12] === 74.48, a && a[12]);
    ok('80291 — Тотал преоценка 17,21 (5,738 × 3)', a && a[13] === 17.21, a && a[13]);
    ok('90706 — 9,33 → 6,48; тотали 103,55 / 25,92', b && b[3] === 9.33 && b[4] === 6.48 && b[12] === 103.55 && b[13] === 25.92, b && JSON.stringify(b));
    ok('МЕ остава на [5] (M2)', a && a[5] === 'M2');
  }

  section('6. „📥 Excel — кампания“ и лист „Общо“');
  {
    const h = env({ items: [Object.assign(K_REP(), { co_qty: 1 }), K_NORM({ co_qty: 2 })].concat(SH.map(x => Object.assign({}, x))) });
    await h.w.loadRevaluation(); await ticks(8);
    realClick(h.w, btn(mod(h), 'Excel — кампания')); await ticks(10);
    const wb = h.written[0] && h.written[0].wb;
    ok('листове: 8, 14, Общо', wb && wb.SheetNames.join(',') === '8,14,Общо', wb && wb.SheetNames.join(','));
    const tot = wb && sheetAoa(h, wb, 'Общо');
    ok('„Общо“ — една „Прехвърлено“, 14 + TOTAL', tot && tot[0].length === 15 && tot[0].filter(x => x === 'Прехвърлено').length === 1 && tot[0][14] === 'TOTAL', tot && JSON.stringify(tot[0]));
    const body = tot ? tot.slice(1, -1) : [];
    ok('TOTAL = „Тотал преоценка“ на всеки ред', body.length === 4 && body.every(r => r[14] === r[13]), JSON.stringify(body.map(r => [r[1], r[13], r[14]])));
    const rp = body.find(r => String(r[1]) === '8086397');
    ok('повторен — тоталите по qty (TOTAL 1 × 9 = 9)', rp && rp[4] === 'само цена' && rp[14] === 9);
    const last = tot && tot[tot.length - 1];
    /* 9 + 2×60 + 17,21 + 25,92 = 172,13 */
    ok('ОБЩО = 172,13', last && last[0] === 'ОБЩО' && last[14] === 172.13, last && last[14]);
  }

  section('7. Необработена бланка — „Тотал ст.пр.цена“ по qty, „Тотал преоценка“ празно');
  {
    const h = env(); await openCo(h, 'Кърджали');
    realClick(h.w, btn(mod(h), 'Excel — този обект'));
    const aoa = h.written[0] && sheetAoa(h, h.written[0].wb);
    const n = aoa && aoa.find(r => String(r[1]) === '14557');
    ok('без co_qty: Прехвърлено празно, Тотал ст. = 2 × 120 = 240, Тотал преоценка празно', n && n[4] === '' && n[12] === 240 && n[13] === '', n && JSON.stringify(n));
  }

  report();
})().catch(e => {
  console.log('  ❌ тестът гръмна: ' + ((e && e.stack) || e));
  process.exit(1);
});
