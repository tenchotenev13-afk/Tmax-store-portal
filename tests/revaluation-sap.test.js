/* Преоценка, етап 3б — файловете за SAP (MM41, VK11), регистър на създадените
   кодове, график на кампаниите (revaluation.js).
   Интеграционно: shared.js + admin.js + stock-returns.js (SR_SHEET_TO_STORE)
   + push.js + email.js + revaluation.js, в реда от index.html. window.XLSX е
   фалшив и хваща aoa-тата, опциите и имената на листовете/файловете.
   GET-овете се филтрират по „кол=eq.стойност" от URL-а — иначе проверката
   „има ли бланки" преди изтриване би виждала цялата таблица.

   Мутационна проверка (15.10.2026) — всеки вариант е пуснат и е паднал:
     S1 MAKTX без отрязване на 40 знака → пада „MAKTX = ПРЕОЦ.+име, отрязано на 40";
     S2 MM41 не изключва повторната преоценка → пада „8025298 не влиза";
     S3 MM41 не изключва регистъра → пада „код в регистъра не влиза";
     S4 rvOverlaps винаги празен → пада „припокриване със съществуваща → 0 POST";
     S5 „Валидна до" като низ → пада „„Валидна до" = Date 31.12.9999";
     S6 rvSchedDelete без четенето на бланките → пада „директно извикване при кампания с бланка → отказ";
     S7 обектът вижда и неактивна кампания → пада „без активна → „Следваща" и без бланка";
     S8 (решение А) обектът не вижда изтекла кампания със своя обработена
        бланка → пада „изтекла кампания с processed бланка → вижда я".
   Мутационна проверка на картата на МЕ (18.10.2026, EXPORT.XLSX от Елица):
     U1 'кг' → латинско 'KG' вместо 'КГ' → пада „„кг“ → КГ" и „на кирилица";
     U2 'л.м' → 'M' вместо 'ЛМ' → пада „„л.м“ → ЛМ" и „на кирилица (не M)".
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, ok, guard, section, report, dayOffset, ticks } = H;

const ACTIVE = { id: 'c-1', title: 'Тестова преоценка Кърджали 10.2026', kind: 'mandatory', starts_on: dayOffset(-2), ends_on: dayOffset(2), default_pct: 50, status: 'open' };
const NEXT = { id: 'c-2', title: 'Пожелателна преоценка', kind: 'optional', starts_on: dayOffset(20), ends_on: dayOffset(21), default_pct: 30, status: 'open' };
const PAST = { id: 'c-0', title: 'Минала', kind: 'mandatory', starts_on: dayOffset(-40), ends_on: dayOffset(-38), default_pct: 50, status: 'closed' };
const LONG = 'ВРАТА БАНЯ PVC ОРЕХ 200/70/КАСА 7СМ ЛЯВА ДЪБ'; /* 45 знака */
const SUBS = [
  { id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', status: 'processed', no_items: false },
  { id: 's-2', campaign_id: 'c-1', store_name: 'Шумен', status: 'submitted', no_items: false },
  { id: 's-3', campaign_id: 'c-1', store_name: 'Добрич', status: 'draft', no_items: false },
  { id: 's-4', campaign_id: 'c-1', store_name: 'Габрово', status: 'processed', no_items: true }
];
const it = (o) => Object.assign({ campaign_id: 'c-1', sort_order: 1, qty: 1, std_price: 10, proposed_price: 5, unit: 'БР' }, o);
const ITEMS = [
  it({ id: 'i-1', submission_id: 's-1', store_name: 'Кърджали', sap_code: '14557', product_name: LONG, std_price: 139.99, new_sap_code: '8014557', sale_price: 69.99, unit: 'бр.' }),
  it({ id: 'i-2', submission_id: 's-1', store_name: 'Кърджали', sap_code: '8025298', product_name: 'ПРЕОЦ. ЛАМПА', new_sap_code: '8025298', sale_price: 3, sort_order: 2 }),
  it({ id: 'i-3', submission_id: 's-1', store_name: 'Кърджали', sap_code: '33333', product_name: 'В РЕГИСТЪРА', new_sap_code: '8033333', sale_price: 4, sort_order: 3 }),
  it({ id: 'i-4', submission_id: 's-1', store_name: 'Кърджали', sap_code: '44444', product_name: 'БЕЗ ЦЕНА', new_sap_code: '8044444', sale_price: null, unit: 'пале', sort_order: 4 }),
  it({ id: 'i-5', submission_id: 's-2', store_name: 'Шумен', sap_code: '14557', product_name: LONG, std_price: 139.99, new_sap_code: '8014557', sale_price: 79.99 }),
  it({ id: 'i-6', submission_id: 's-2', store_name: 'Шумен', sap_code: '55555', product_name: 'БЕЗ КОД', new_sap_code: null, sale_price: null, sort_order: 2 }),
  it({ id: 'i-7', submission_id: 's-3', store_name: 'Добрич', sap_code: '77777', product_name: 'ЧЕРНОВА', new_sap_code: '8077777', sale_price: 1 })
];
const CODES = [{ new_sap_code: '8033333' }];
const ADMIN = { email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', role: 'admin', store_name: 'Централен офис' };
const STORE = { email: 'managerkardjali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };

/* rows, отфилтрирани по всички „кол=eq.стойност" от URL-а */
function filt(rows, url) {
  const q = decodeURIComponent(String(url).split('?')[1] || '');
  let out = rows.slice();
  q.split('&').forEach(p => {
    const m = /^([a-z_]+)=eq\.(.*)$/.exec(p);
    if (m && m[1] !== 'select') out = out.filter(r => String(r[m[1]]) === m[2]);
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
    confirm: o.confirm,
    fail: o.fail,
    data: {
      revaluation_campaigns: () => o.campaigns || [ACTIVE, NEXT, PAST],
      revaluation_submissions: url => filt(o.subs || SUBS, url),
      revaluation_items: url => filt(o.items || ITEMS, url),
      revaluation_codes: () => o.codes || CODES,
      stores: [{ name: 'Кърджали' }, { name: 'Шумен' }, { name: 'Добрич' }],
      users: url => filt([{ email: 'e.gurova@temax.bg', is_regional: false, assigned_stores: [] }, { email: 'managerkardjali@temax.bg', is_regional: false, assigned_stores: [] }], url),
      app_settings: []
    }
  });
  h.aoas = []; h.opts = []; h.sheets = []; h.files = [];
  h.w.rvStoresOn = true;
  h.w.XLSX = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: (a, op) => { h.aoas.push(a); h.opts.push(op); return { __aoa: a }; },
      book_append_sheet: (wb, ws, n) => { wb.SheetNames.push(n); h.sheets.push(n); }
    },
    write: () => 'QkFTRTY0',
    writeFile: (wb, f) => { h.files.push(f); }
  };
  return h;
}
const mod = h => h.doc.getElementById('mod-revaluation');
const isDate = x => Object.prototype.toString.call(x) === '[object Date]';
async function open(h, store) { await h.w.loadRevaluation(); await ticks(6); if (store) { await h.w.rvCoOpenStore(store); await ticks(6); } }
function setVal(h, id, val) { const el = h.doc.getElementById(id); el.value = val; fire(h.w, el, 'change'); }

(async function run() {

  section('1. MM41 — нови кодове');
  {
    const h = env(); await open(h);
    realClick(h.w, btn(mod(h), 'MM41 — нови кодове')); await ticks(8);
    const a = h.aoas[0] || [];
    ok('заглавията точно MATNR/MAKTX/MEINH_01/ENDPR', JSON.stringify(a[0]) === '["MATNR","MAKTX","MEINH_01","ENDPR"]', JSON.stringify(a[0]));
    ok('листът е като в шаблона', h.sheets[0] === 'MM41RAZPR Създаване на преоцене');
    const r = a.find(x => x[0] === '8014557');
    ok('MAKTX = ПРЕОЦ.+име, отрязано на 40', r && r[1] === ('ПРЕОЦ.' + LONG).slice(0, 40) && r[1].length === 40, r && JSON.stringify(r[1]));
    ok('ENDPR = стандартната цена на оригинала (139,99, не новата)', r && r[3] === 139.99);
    ok('MEINH_01 по SAP („бр.“ → БР)', r && r[2] === 'БР');
    ok('дубликат по код (Кърджали + Шумен) → 1 ред', a.filter(x => x[0] === '8014557').length === 1);
    ok('8025298 не влиза (повторна преоценка)', !a.some(x => x[0] === '8025298'));
    ok('код в регистъра не влиза (8033333)', !a.some(x => x[0] === '8033333'));
    ok('чернова не влиза (8077777)', !a.some(x => x[0] === '8077777'));
    ok('ред без new_sap_code не влиза', a.length === 3, a.length);
    ok('„пале“ (непозната МЕ) влиза, но toast го изброява', a.some(x => x[0] === '8044444') && h.calls.toast.some(t => t.indexOf('МЕ не е по SAP: 8044444 (пале)') >= 0), h.calls.toast.join(' | '));
    ok('файл MM41-preocenka-…', /^MM41-preocenka-/.test(h.files[0] || ''));
    const e = env({ subs: [Object.assign({}, SUBS[2])], items: [ITEMS[6]] }); await open(e);
    realClick(e.w, btn(mod(e), 'MM41 — нови кодове')); await ticks(8);
    ok('кампания без обработени/подадени бланки → „Няма нови кодове за MM41“, без файл', !e.files.length && e.calls.toast.some(t => t.indexOf('Няма нови кодове за MM41') >= 0));
    const f = env({ fail: { GET: /revaluation_codes/ } }); await open(f);
    realClick(f.w, btn(mod(f), 'MM41 — нови кодове')); await ticks(8);
    ok('паднал регистър → файлът НЕ е направен', !f.files.length && f.calls.toast.some(t => t.indexOf('MM41 НЕ е направен') >= 0));
  }

  section('1б. Картата на МЕ по SAP (EXPORT.XLSX, 16.10.2026)');
  {
    const h = env();
    const u = h.w.rvSapUnit;
    const PAIRS = [['бр.', 'БР'], ['бр', 'БР'], ['кв.м', 'M2'], ['кв.м.', 'M2'], ['м2', 'M2'],
      ['л.м', 'ЛМ'], ['л.м.', 'ЛМ'], ['лм', 'ЛМ'], ['м', 'ЛМ'], ['пакет', 'ПАК'], ['пак', 'ПАК'],
      ['чифт', 'ЧФТ'], ['чфт', 'ЧФТ'], ['ккт', 'ККТ'], ['к-кт', 'ККТ'], ['бли', 'БЛИ'], ['блистер', 'БЛИ'],
      ['кг', 'КГ'], ['кут', 'КУТ'], ['кутия', 'КУТ'], ['кашон', 'КАШ'], ['каш', 'КАШ'], ['топ', 'ТОП'],
      ['рол', 'РОЛ'], ['ролка', 'РОЛ'], ['тон', 'ТОН'], ['m3', 'M3'], ['м3', 'M3']];
    PAIRS.forEach(p => { const r = u(p[0]); ok('„' + p[0] + '“ → ' + p[1], r.unit === p[1] && r.ok, JSON.stringify(r)); });
    ok('всичките 14 SAP стойности са покрити', new Set(PAIRS.map(p => p[1])).size === 14);
    ok('ключовете в картата = точно тези', Object.keys(h.w.RV_SAP_UNITS).sort().join('|') === PAIRS.map(p => p[0]).sort().join('|'));
    ok('„кг“ → КГ на кирилица (не латинско KG)', u('кг').unit.charCodeAt(0) === 0x41A && u('кг').unit.charCodeAt(1) === 0x413);
    ok('„л.м“ → ЛМ на кирилица (не M)', u('л.м').unit.charCodeAt(0) === 0x41B && u('л.м').unit.charCodeAt(1) === 0x41C);
    ok('M2 — първата буква е латинско M (0x4D)', u('кв.м').unit.charCodeAt(0) === 0x4D && u('м3').unit.charCodeAt(0) === 0x4D);
    ok('M2 / M3 — с латинско M', u('кв.м').unit === 'M2' && u('m3').unit === 'M3' && u('м3').unit === 'M3');
    ok('„л“ вече НЕ е ок (в SAP няма L)', !u('л').ok && u('л').unit === 'л');
    ok('главни главни: „ПАК“, „ТОН“ → без промяна, ок', u('ПАК').unit === 'ПАК' && u('ПАК').ok && u('ТОН').ok);
    ok('регистърът не пречи: „ПАКЕТ“ → ПАК', u('ПАКЕТ').unit === 'ПАК');
    ok('„пале“ → остава, НЕ е ок', u('пале').unit === 'пале' && !u('пале').ok);
  }

  section('2. „Кодовете са създадени в SAP“ → регистър');
  {
    const h = env(); await open(h);
    realClick(h.w, btn(mod(h), 'Кодовете са създадени в SAP')); await ticks(8);
    const p = h.calls.post.find(x => x.table === 'revaluation_codes');
    ok('confirm с броя (2)', h.calls.confirm.some(m => m.indexOf('2 кода') >= 0));
    ok('POST с точните редове (8014557, 8044444)', p && Array.isArray(p.body) && p.body.map(x => x.new_sap_code).join(',') === '8014557,8044444', p && JSON.stringify(p.body.map(x => x.new_sap_code)));
    const b = p && p.body.find(x => x.new_sap_code === '8014557');
    ok('редът: sap_code, MAKTX, МЕ, ENDPR, кампания, кой', b && b.sap_code === '14557' && b.product_name.length === 40 && b.unit === 'БР' && b.std_price === 139.99 && b.campaign_id === 'c-1' && b.created_by === 'Елица Гюрова');
    ok('без повторната и без регистъра', p && !p.body.some(x => x.new_sap_code === '8025298' || x.new_sap_code === '8033333'));
    const c = env({ confirm: false }); await open(c);
    realClick(c.w, btn(mod(c), 'Кодовете са създадени в SAP')); await ticks(8);
    ok('без потвърждение → нищо', !c.calls.post.length);
    const f = env({ fail: { POST: /revaluation_codes/ } }); await open(f);
    realClick(f.w, btn(mod(f), 'Кодовете са създадени в SAP')); await ticks(8);
    ok('провален POST → червен toast', f.calls.toast.some(t => t.indexOf('Кодовете НЕ са записани') >= 0));
    const s = env({ user: { email: 'sn@temax.bg', display_name: 'Снаб', role: 'supply', store_name: 'Централен офис' } }); await open(s);
    ok('supply: MM41 има, „създадени“ няма', !!btn(mod(s), 'MM41') && !btn(mod(s), 'Кодовете са създадени'));
  }

  section('3. Баджове на реда в бланката на ЦО');
  {
    const h = env(); await open(h, 'Кърджали');
    ok('„в SAP“ на 8033333 (в регистъра)', !!h.doc.querySelector('#rv-row-i-3 .rv-in-sap'));
    ok('„за създаване“ на 8014557', !!h.doc.querySelector('#rv-row-i-1 .rv-to-create'));
    ok('повторна: „вече преоценен“, без „за създаване“/„в SAP“', !!h.doc.querySelector('#rv-row-i-2 .rv-repeat') && !h.doc.querySelector('#rv-row-i-2 .rv-to-create') && !h.doc.querySelector('#rv-row-i-2 .rv-in-sap'));
  }

  section('4. VK11 — цената по обект');
  {
    const h = env(); await open(h, 'Кърджали');
    ok('поле „Валидна от“ по подразбиране днес', h.doc.getElementById('rv-vk-from').value === dayOffset(0));
    h.doc.getElementById('rv-vk-from').value = '2026-10-20';
    realClick(h.w, btn(mod(h), 'VK11 — Кърджали')); await ticks(3);
    const a = h.aoas[0] || [];
    ok('заглавията точно', JSON.stringify(a[0]) === JSON.stringify(['Материал', 'МЕ', 'Прод,цена нова', 'Валидна от', 'Валидна до']), JSON.stringify(a[0]));
    ok('листът е като в шаблона (с интервала)', h.sheets[0] === 'смяна на продажна цена ');
    const r = a.find(x => x[0] === '8014557');
    ok('ред: код, МЕ по SAP, нова цена', r && r[1] === 'БР' && r[2] === 69.99);
    ok('„Валидна от“ = Date 20.10.2026', r && isDate(r[3]) && r[3].getFullYear() === 2026 && r[3].getMonth() === 9 && r[3].getDate() === 20);
    ok('„Валидна до“ = Date 31.12.9999', r && isDate(r[4]) && r[4].getFullYear() === 9999 && r[4].getMonth() === 11 && r[4].getDate() === 31);
    ok('ред без sale_price не влиза (8044444)', !a.some(x => x[0] === '8044444'));
    ok('повторната влиза (цената се сменя)', a.some(x => x[0] === '8025298'));
    ok('3 реда + заглавие', a.length === 4, a.length);
    ok('датите се пишат с формат за дата (dateNF)', h.opts[0] && h.opts[0].dateNF === 'dd.mm.yyyy');
    ok('файл VK11-8-2026-10-20.xlsx', h.files[0] === 'VK11-8-2026-10-20.xlsx', h.files[0]);
    const n = env(); await open(n, 'Габрово');
    ok('бланка „нямат“ → без бутон VK11', !btn(mod(n), 'VK11'));
    n.w.rvVk11(); await ticks(2);
    ok('…и извикан отвън → отказ, без файл', !n.files.length && n.calls.toast.some(t => t.indexOf('VK11 НЕ е направен') >= 0));
  }

  section('5. График на кампаниите — няколко наведнъж');
  {
    const h = env({ campaigns: [ACTIVE] }); await open(h);
    realClick(h.w, btn(mod(h), 'График на кампаниите')); await ticks(6);
    ok('панелът се отваря', !!h.doc.getElementById('rv-schedule'));
    const m1 = dayOffset(30), m2 = dayOffset(40), m3 = dayOffset(50);
    setVal(h, 'rv-s-from-0', m1); setVal(h, 'rv-s-to-0', m1); /* един ден */
    setVal(h, 'rv-s-pct-0', '0');
    realClick(h.w, btn(h.doc.getElementById('rv-schedule'), '＋ Ред'));
    setVal(h, 'rv-s-from-1', m2); setVal(h, 'rv-s-to-1', dayOffset(41)); setVal(h, 'rv-s-kind-1', 'optional'); setVal(h, 'rv-s-pct-1', '100');
    realClick(h.w, btn(h.doc.getElementById('rv-schedule'), '＋ Ред'));
    setVal(h, 'rv-s-from-2', m3); setVal(h, 'rv-s-to-2', dayOffset(52)); setVal(h, 'rv-s-title-2', 'Специална');
    ok('подсказка за заглавие по вид и месец', h.doc.getElementById('rv-s-title-1').getAttribute('placeholder') === 'Пожелателна преоценка ' + m2.slice(5, 7) + '.' + m2.slice(0, 4));
    realClick(h.w, btn(h.doc.getElementById('rv-schedule'), 'Запази всички')); await ticks(8);
    const ps = h.calls.post.filter(x => x.table === 'revaluation_campaigns');
    ok('една заявка с 3 кампании (атомарно)', ps.length === 1 && Array.isArray(ps[0].body) && ps[0].body.length === 3, ps.length);
    const b = ps[0] ? ps[0].body : [];
    ok('заглавие по подразбиране „Задължителна преоценка мм.гггг“', b[0] && b[0].title === 'Задължителна преоценка ' + m1.slice(5, 7) + '.' + m1.slice(0, 4));
    ok('кампания от един ден (от = до) се приема', b[0] && b[0].starts_on === m1 && b[0].ends_on === m1);
    ok('% 0 и 100 се приемат', b[0] && b[0].default_pct === 0 && b[1] && b[1].default_pct === 100);
    ok('вид optional, заглавие на ръка, status open, created_by', b[1].kind === 'optional' && b[2].title === 'Специална' && b.every(x => x.status === 'open' && x.created_by === 'Елица Гюрова'));
    ok('след запис кампаниите се четат наново', h.calls.get.filter(u => u.indexOf('/revaluation_campaigns?') >= 0).length >= 2);
  }

  section('6. График — проверки и припокриване');
  {
    const h = env({ campaigns: [ACTIVE, NEXT] }); await open(h);
    realClick(h.w, btn(mod(h), 'График на кампаниите')); await ticks(6);
    setVal(h, 'rv-s-from-0', dayOffset(21)); setVal(h, 'rv-s-to-0', dayOffset(25));
    realClick(h.w, btn(h.doc.getElementById('rv-schedule'), 'Запази всички')); await ticks(6);
    ok('припокриване със съществуваща → 0 POST + toast с нея', !h.calls.post.length && h.calls.toast.some(t => t.indexOf('Припокриване') >= 0 && t.indexOf('Пожелателна преоценка') >= 0), h.calls.toast.join(' | '));
    setVal(h, 'rv-s-from-0', dayOffset(60)); setVal(h, 'rv-s-to-0', dayOffset(62));
    realClick(h.w, btn(h.doc.getElementById('rv-schedule'), '＋ Ред'));
    setVal(h, 'rv-s-from-1', dayOffset(62)); setVal(h, 'rv-s-to-1', dayOffset(64));
    realClick(h.w, btn(h.doc.getElementById('rv-schedule'), 'Запази всички')); await ticks(6);
    ok('припокриване между новите (общ ден) → 0 POST', !h.calls.post.length);
    setVal(h, 'rv-s-from-1', dayOffset(65)); setVal(h, 'rv-s-to-1', dayOffset(64));
    realClick(h.w, btn(h.doc.getElementById('rv-schedule'), 'Запази всички')); await ticks(6);
    ok('„до“ преди „от“ → 0 POST', !h.calls.post.length && h.calls.toast.some(t => t.indexOf('ред 2') >= 0));
    setVal(h, 'rv-s-to-1', dayOffset(66)); setVal(h, 'rv-s-pct-1', '101');
    realClick(h.w, btn(h.doc.getElementById('rv-schedule'), 'Запази всички')); await ticks(6);
    ok('% 101 → 0 POST', !h.calls.post.length);
  }

  section('7. Редакция и изтриване от графика');
  {
    const h = env({ campaigns: [ACTIVE, NEXT, PAST], subs: SUBS }); await open(h);
    realClick(h.w, btn(mod(h), 'График на кампаниите')); await ticks(8);
    const rowN = () => h.doc.getElementById('rv-sched-c-2');
    ok('предстояща без бланки: ✏️ и 🗑', !!btn(rowN(), '✏️') && !!btn(rowN(), '🗑'));
    ok('активна с бланки: ✏️, без 🗑', !!btn(h.doc.getElementById('rv-sched-c-1'), '✏️') && !btn(h.doc.getElementById('rv-sched-c-1'), '🗑'));
    ok('минала: без ✏️', !btn(h.doc.getElementById('rv-sched-c-0'), '✏️'));
    realClick(h.w, btn(rowN(), '✏️'));
    setVal(h, 'rv-se-pct', '35');
    realClick(h.w, btn(rowN(), 'Запази')); await ticks(5);
    const p = h.calls.patch.find(x => x.table === 'revaluation_campaigns');
    ok('редакция → PATCH на c-2 с % 35', p && p.url.indexOf('id=eq.c-2') >= 0 && p.body.default_pct === 35);
    realClick(h.w, btn(rowN(), '✏️'));
    setVal(h, 'rv-se-from', dayOffset(1));
    const np = h.calls.patch.length;
    realClick(h.w, btn(rowN(), 'Запази')); await ticks(5);
    ok('редакция, която застъпва активната → отказ', h.calls.patch.length === np && h.calls.toast.some(t => t.indexOf('Припокриване') >= 0));
    realClick(h.w, btn(rowN(), 'Откажи'));
    realClick(h.w, btn(rowN(), '🗑')); await ticks(6);
    ok('🗑 → проверка за бланки, confirm, DELETE', h.calls.del.some(u => u.indexOf('/revaluation_campaigns?id=eq.c-2') >= 0));
    ok('кампанията изчезва', !h.doc.getElementById('rv-sched-c-2'));
    const d = env({ campaigns: [ACTIVE, NEXT], subs: SUBS }); await open(d);
    await d.w.rvSchedDelete('c-1'); await ticks(5);
    ok('директно извикване при кампания с бланка → отказ, без DELETE', !d.calls.del.length && d.calls.toast.some(t => t.indexOf('има бланки') >= 0));
    const f = env({ campaigns: [ACTIVE, NEXT], fail: { GET: /revaluation_submissions\?campaign_id=eq\.c-2/ } }); await open(f);
    await f.w.rvSchedDelete('c-2'); await ticks(5);
    ok('паднало четене на бланките → НЕ трие', !f.calls.del.length && f.calls.toast.some(t => t.indexOf('НЕ е изтрита') >= 0));
  }

  section('8. Обектът вижда само активната кампания');
  {
    const h = env({ user: STORE }); await open(h);
    ok('активна → показана, без избор', !!h.doc.getElementById('rv-active') && !h.doc.getElementById('rv-campaign') && h.w.rvCampaignId === 'c-1');
    ok('бланката е там', !!h.doc.getElementById('rv-rows'));
    const n = env({ user: STORE, campaigns: [NEXT, PAST] }); await open(n);
    const t = n.doc.getElementById('rv-next');
    ok('без активна → „Следваща: пожелателна …“ и без бланка', t && t.textContent.indexOf('Следваща: пожелателна') === 0 && !n.doc.getElementById('rv-rows') && !btn(mod(n), 'Качи файл'), t && t.textContent);
    const z = env({ user: STORE, campaigns: [PAST] }); await open(z);
    ok('без активна и без следваща → „Няма активна кампания.“', z.doc.getElementById('rv-next').textContent === 'Няма активна кампания.' && !z.doc.getElementById('rv-rows'));
    const co = env(); await open(co);
    const groups = Array.from(co.doc.querySelectorAll('#rv-campaign optgroup')).map(g => g.getAttribute('label'));
    ok('ЦО вижда всички: Активна · Предстоящи · Минали', groups.join(',') === 'Активна,Предстоящи,Минали и затворени', groups.join(','));
    ok('ЦО по подразбиране — активната', co.w.rvCampaignId === 'c-1');
  }

  section('9. Решение А: изтекла кампания със своя бланка — само за четене');
  {
    const OLD = { id: 'c-9', title: 'Октомври', kind: 'mandatory', starts_on: dayOffset(-12), ends_on: dayOffset(-10), default_pct: 50, status: 'open' };
    const OLDD = { id: 'c-8', title: 'Чернова стара', kind: 'mandatory', starts_on: dayOffset(-30), ends_on: dayOffset(-28), default_pct: 50, status: 'open' };
    const subs = [
      { id: 's-9', campaign_id: 'c-9', store_name: 'Кърджали', status: 'processed', no_items: false, processed_at: new Date().toISOString() },
      { id: 's-8', campaign_id: 'c-8', store_name: 'Кърджали', status: 'draft', no_items: false },
      { id: 's-7', campaign_id: 'c-9', store_name: 'Шумен', status: 'processed', no_items: false }
    ];
    const items = [
      it({ id: 'p-1', submission_id: 's-9', campaign_id: 'c-9', store_name: 'Кърджали', sap_code: '14557', product_name: 'ЛАМПА', new_sap_code: '8014557', sale_price: 60, co_qty: 1, store_comment: 'x' }),
      it({ id: 'p-2', submission_id: 's-9', campaign_id: 'c-9', store_name: 'Кърджали', sap_code: '82216', product_name: 'КОФА', new_sap_code: '8082216', sale_price: 7, co_qty: 1, store_comment: 'y', sort_order: 2 })
    ];
    const h = env({ user: STORE, campaigns: [OLD, OLDD, NEXT], subs, items });
    let clip = null;
    Object.defineProperty(h.w.navigator, 'clipboard', { configurable: true, value: { writeText: t => { clip = t; return Promise.resolve(); } } });
    await open(h);
    ok('изтекла кампания с processed бланка → вижда я', h.w.rvCampaignId === 'c-9' && !!h.doc.getElementById('rv-row-p-1'), h.w.rvCampaignId);
    ok('статус „Обработена“ и розовите колони', h.doc.getElementById('rv-status').textContent.indexOf('Обработена') === 0 && h.doc.getElementById('rv-row-p-1').textContent.indexOf('8014557') >= 0);
    ok('без бутони за редакция', !btn(mod(h), 'Изтрий ред') && !btn(mod(h), 'Подай') && !btn(mod(h), '＋ Ред') && !btn(mod(h), 'Качи файл') && !btn(mod(h), 'Нямаме') && !btn(mod(h), 'Приложи %'));
    ok('без полета в редовете', h.doc.querySelectorAll('#rv-rows input').length === 0);
    realClick(h.w, btn(mod(h), 'Копирай новите кодове')); await ticks(3);
    ok('„Копирай новите кодове“ → „8014557\n8082216“', clip === '8014557\n8082216', JSON.stringify(clip));
    const opts = Array.from(h.doc.querySelectorAll('#rv-campaign option')).map(o => o.value);
    ok('изборът: само своята кампания (без черновата, без предстоящата)', opts.join(',') === 'c-9', opts.join(','));
    ok('и „Следваща: …“ до него (няма активна)', !!h.doc.getElementById('rv-next') && h.doc.getElementById('rv-next').textContent.indexOf('Следваща') === 0);
    ok('заявката за своите бланки е само за обекта и submitted/processed', h.calls.get.some(u => u.indexOf('store_name=eq.' + encodeURIComponent('Кърджали') + '&status=in.(submitted,processed)') >= 0));
    const both = env({ user: STORE, campaigns: [ACTIVE, OLD], subs: subs.concat([{ id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', status: 'draft', no_items: false }]), items });
    await open(both);
    const o2 = Array.from(both.doc.querySelectorAll('#rv-campaign option')).map(o => o.value);
    ok('активна + своя изтекла: активната е първа и по подразбиране', o2.join(',') === 'c-1,c-9' && both.w.rvCampaignId === 'c-1', o2.join(','));
    await both.w.rvPickCampaign('c-9'); await ticks(6);
    ok('превключване към изтеклата → само четене', !!both.doc.getElementById('rv-row-p-1') && !btn(mod(both), 'Изтрий ред') && !!btn(mod(both), 'Копирай новите кодове'));
  }

  report();
})();
