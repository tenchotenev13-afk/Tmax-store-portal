/* Минуси — „Общи проблеми в няколко обекта" в писмото „повтарящи се артикули"
   (minus_multi), 30.10.2026, сесия minusi-common-problems (искане на Теодор, 29.10).

   Правилото (report.js и send-scheduled-report v64, еднакво — report-edge-sync):
   същият прозорец като повтарящите се (minus_multi_days към неделята от
   reportMinusMultiRefSunday), само 955, само обектите от minus_stores.
     а) артикул (материал) с минус в 2+ обекта — брой обекти, брой минуси, обектите;
     б) попълнена причина (reason_id не е null) в 2+ обекта — брой редове, обекти.
   Подредба: брой обекти ↓, после брой минуси / редове ↓. Празно → сив ред.
   Частта е САМО за получател без обхват (scope_stores NULL); с обхват я няма в
   HTML-а и тя не пипа reportMinusMultiShouldSend. Колекторът тегли и
   minus_reasons — непълно → null (без писмо).

   Мутационна проверка (30.10.2026) — всеки вариант пуснат срещу report.js и паднал:
     C1 прагът 1 обект вместо 2 (`>= 2` → `>= 1`)                          → пада
     C2 брои и 956 (без проверката за mvt_type в reportMinusMultiCommon)   → пада
     C3 частта и на получател с обхват (ForStores пази common винаги)      → пада
     C4 ред без причина се брои (reason_id null → „причина #null")         → пада
     C5 подредба първо по брой минуси, после по обекти                     → пада
   Пускане:  node tests/minusi-multi-common.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const GD = 'Гоце Делчев', MO = 'Монтана', SH = 'Шумен', TR = 'Троян', PE = 'Петрич';
const STORES = [GD, MO, SH, TR, PE];
const REF = '2026-11-01';   /* неделя; 30 дни → 03.10–01.11 */
const REASONS = [
  { id: 1, label: 'клиентска поръчка (номер/дата)' }, { id: 2, label: 'последна бройка, липсва код' },
  { id: 7, label: 'грешен етикет' }, { id: 15, label: 'заметнати с другия цвят' },
  { id: 19, label: 'продаден преди да се заведе, имаме го' }
];
let seq = 0;
function mv(store, material, date, o) {
  seq++;
  return Object.assign({ id: seq, store_name: store, material: material, material_desc: 'ОПИСАНИЕ ' + material, mvt_type: '955',
    posting_date: date, mat_doc: 'D' + String(seq).padStart(4, '0'), doc_item: '1', action: null, reason_id: null }, o || {});
}
const rep = (n, store, mat, date, o) => Array.from({ length: n }, () => mv(store, mat, date, o));
/* причина на уникален материал — да не прави „артикул в 2+ обекта" */
const rs = (n, store, rid, o) => Array.from({ length: n }, () => mv(store, 'R' + (seq + 1), '2026-10-20', Object.assign({ reason_id: rid }, o || {})));
const ROWS = [].concat(
  /* 111: Гоце Делчев ×2 + Монтана ×1 → 2 обекта, 3 минуса */
  rep(2, GD, '111', '2026-10-10'), rep(1, MO, '111', '2026-10-28'),
  /* 222: Гоце Делчев, Монтана, Шумен → 3 обекта, 3 минуса (първи) */
  rep(1, GD, '222', '2026-10-03'), rep(1, MO, '222', '2026-10-29'), rep(1, SH, '222', '2026-11-01'),
  /* 777: Гоце Делчев ×1 + Петрич ×3 → 2 обекта, 4 минуса (преди 111) */
  rep(1, GD, '777', '2026-10-15'), rep(3, PE, '777', '2026-10-30'),
  /* 333: само Гоце Делчев ×5 → не влиза */
  rep(5, GD, '333', '2026-10-12'),
  /* 444: Гоце Делчев 955 + Монтана 956 → 956 не се брои, не влиза */
  rep(1, GD, '444', '2026-10-12'), rep(2, MO, '444', '2026-10-28', { mvt_type: '956' }),
  /* 555: Гоце Делчев в прозореца, Монтана на 02.10 и 02.11 (извън) → не влиза */
  rep(1, GD, '555', '2026-10-12'), rep(1, MO, '555', '2026-10-02'), rep(1, MO, '555', '2026-11-02'),
  /* 666: Гоце Делчев + Враца (не е в minus_stores) → не влиза */
  rep(1, GD, '666', '2026-10-12'), rep(1, 'Враца', '666', '2026-10-12'),
  /* причини: 1 в 4 обекта (4 реда); 2 в 2 обекта (4 реда); 19 в 2 обекта (2 реда);
     7 само в Гоце Делчев ×5 → не; 15 в Гоце Делчев + Монтана 956 → не */
  rs(1, GD, 1), rs(1, MO, 1), rs(1, SH, 1), rs(1, TR, 1),
  rs(3, GD, 2), rs(1, MO, 2),
  rs(1, GD, 19), rs(1, PE, 19),
  rs(5, GD, 7),
  rs(1, GD, 15), rs(1, MO, 15, { mvt_type: '956' }),
  /* причина 7 в Монтана, но извън прозореца → 7 остава в 1 обект */
  rs(1, MO, 7, { posting_date: '2026-10-01' })
);
const copy = x => JSON.parse(JSON.stringify(x));
const ADMIN = { id: 'u-1', email: 'ten.tenev@temax.bg', display_name: 'Тен', role: 'admin', store_name: 'Централен офис' };
const RC = [
  { email: 't.tenev@temax.bg',   name: 'Теодор',   active: true, minus_multi: true, scope_stores: null },
  { email: 'm.pavlova@temax.bg', name: 'Миглена',  active: true, minus_multi: true },
  { email: 'n.koleva@temax.bg',  name: 'Колева',   active: true, minus_multi: true, scope_stores: [GD, 'Дупница'] },
  { email: 'all@temax.bg',       name: 'Всички 5', active: true, minus_multi: true, scope_stores: STORES.slice() },
  { email: 'tr@temax.bg',        name: 'Троян',    active: true, minus_multi: true, scope_stores: [TR] }
];

function resp(status, body) {
  const t = body == null ? '' : JSON.stringify(body);
  return Promise.resolve({ ok: status < 300, status, json: () => t ? Promise.resolve(JSON.parse(t)) : Promise.reject(new SyntaxError('empty')), text: () => Promise.resolve(t) });
}
function install(h, db) {
  h.w.fetch = function (url) {
    const u = String(url);
    const tbl = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    const q = decodeURIComponent(u.split('?')[1] || '');
    db.log.push({ tbl, q });
    if (tbl === 'app_settings') return resp(200, db.settings);
    if (/offset=[1-9]/.test(q)) return resp(200, []);
    if (tbl === 'minus_reasons') return db.failReasons ? resp(500, { message: 'boom' }) : resp(200, copy(REASONS));
    if (tbl === 'minus_movements') {
      const mt = (q.match(/mvt_type=eq\.(\d+)/) || [])[1];
      const gte = (q.match(/posting_date=gte\.([\d-]+)/) || [])[1];
      const lte = (q.match(/posting_date=lte\.([\d-]+)/) || [])[1];
      const inS = ((q.match(/store_name=in\.\(([^)]*)\)/) || [])[1] || '').split(',').map(s => s.replace(/"/g, ''));
      return resp(200, copy(ROWS.filter(x => (!mt || x.mvt_type === mt) && (!gte || x.posting_date >= gte) &&
        (!lte || x.posting_date <= lte) && inS.indexOf(x.store_name) >= 0)));
    }
    return resp(200, []);
  };
}

(async function () {
  const h = boot({ modules: ['minusi.js', 'report.js'], user: ADMIN, data: {} });
  const w = h.w;
  const c = w.reportMinusMultiCommon(copy(ROWS), STORES, 30, REF, REASONS);

  section('1. Артикули с минус в 2+ обекта');
  const mats = c.items.map(g => g.material);
  ok('прозорецът 03.10–01.11', c.from === '2026-10-03' && c.ref === REF, c.from + '–' + c.ref);
  ok('точно 222, 777, 111 — в този ред (обекти ↓, после минуси ↓)', mats.join(',') === '222,777,111', mats.join(','));
  const g = m => c.items.filter(x => x.material === m)[0];
  ok('222: 3 обекта, 3 минуса, „Гоце Делчев, Монтана, Шумен" (вкл. 03.10 и 01.11 — границите)', g('222') && g('222').stores.join(', ') === GD + ', ' + MO + ', ' + SH && g('222').n === 3, JSON.stringify(g('222')));
  ok('777: 2 обекта, 4 минуса; 111: 2 обекта, 3 минуса', g('777').stores.length === 2 && g('777').n === 4 && g('111').stores.length === 2 && g('111').n === 3);
  ok('описанието е в реда', g('111').desc === 'ОПИСАНИЕ 111');
  ok('333 (само в един обект) — не', !g('333'));
  ok('444 (втори обект само с 956) — не', !g('444'));
  ok('555 (вторият обект извън прозореца) — не', !g('555'));
  ok('666 (вторият обект не е в minus_stores) — не', !g('666'));
  ok('редовете с причина (уникален материал) не правят артикул', !c.items.some(x => /^R/.test(x.material)));

  section('2. Причини в 2+ обекта');
  const rl = c.reasons.map(r => r.label + ' ' + r.n + '/' + r.stores.length);
  ok('точно три причини в реда: клиентска поръчка 4/4, последна бройка 4/2, продаден преди 2/2',
    rl.join(' | ') === 'клиентска поръчка (номер/дата) 4/4 | последна бройка, липсва код 4/2 | продаден преди да се заведе, имаме го 2/2', rl.join(' | '));
  ok('обектите в реда на minus_stores', c.reasons[0].stores.join(', ') === [GD, MO, SH, TR].join(', '));
  ok('„грешен етикет" (1 обект в прозореца) — не', !c.reasons.some(r => r.label === 'грешен етикет'));
  ok('„заметнати с другия цвят" (вторият обект — 956) — не', !c.reasons.some(r => r.label === 'заметнати с другия цвят'));
  ok('редовете без причина не правят ред (няма „причина #…")', !c.reasons.some(r => /причина #/.test(r.label)));
  const c0 = w.reportMinusMultiCommon(copy(ROWS).map(x => Object.assign(x, { reason_id: null })), STORES, 30, REF, REASONS);
  ok('всички без причина → 0 причини (артикулите си остават)', c0.reasons.length === 0 && c0.items.length === 3);

  section('3. Подредбата при равни обекти');
  const tie = w.reportMinusMultiCommon([
    mv(GD, 'A1', '2026-10-10'), mv(MO, 'A1', '2026-10-10'),
    mv(GD, 'B2', '2026-10-10'), mv(MO, 'B2', '2026-10-10'), mv(MO, 'B2', '2026-10-11'),
    mv(GD, 'C3', '2026-10-10'), mv(MO, 'C3', '2026-10-10'), mv(SH, 'C3', '2026-10-10')
  ], STORES, 30, REF, []);
  ok('C3 (3 обекта, 3) → B2 (2 обекта, 3) → A1 (2 обекта, 2)', tie.items.map(x => x.material).join(',') === 'C3,B2,A1', tie.items.map(x => x.material).join(','));

  section('4. HTML-ът');
  const data = Object.assign(w.reportMinusMultiGroup(copy(ROWS), STORES, 3, 30, REF), { week: w.reportMinusMultiWeek(copy(ROWS), STORES, REF), common: c });
  const html = w.reportMinusMultiHtml(data);
  ok('заглавие „Общи проблеми в няколко обекта (за 30 дни, до нд 01.11)"', html.indexOf('Общи проблеми в няколко обекта (за 30 дни, до нд 01.11)') >= 0);
  const iC = html.indexOf('class="mm-common"'), iLastItem = html.lastIndexOf('class="mm-item"');
  ok('частта е СЛЕД повтарящите се', iLastItem > 0 && iC > iLastItem, iLastItem + ' / ' + iC);
  ok('3 реда артикули и 3 реда причини', (html.match(/class="mm-common-item"/g) || []).length === 3 && (html.match(/class="mm-common-reason"/g) || []).length === 3);
  ok('редът на 222 носи „Гоце Делчев, Монтана, Шумен"', /class="mm-common-item">.*?222.*?Гоце Делчев, Монтана, Шумен/.test(html));
  ok('без сиви празни редове при данни', html.indexOf('mm-common-empty') < 0);
  ok('без суми (няма „лв" / „сума")', !/лв\.?<|сума/i.test(html.slice(iC)));
  const empty = w.reportMinusMultiCommonHtml(w.reportMinusMultiCommon([], STORES, 30, REF, REASONS));
  ok('празно → сив ред „Няма артикул с минус в повече от един обект."', /mm-common-empty[^>]*><td colspan="5"[^>]*color:#94a3b8;[^>]*>Няма артикул с минус в повече от един обект\.</.test(empty));
  ok('празно → сив ред „Няма причина, повторена в повече от един обект."', /mm-common-empty[^>]*><td colspan="4"[^>]*color:#94a3b8;[^>]*>Няма причина, повторена в повече от един обект\.</.test(empty));
  ok('без common → нищо', w.reportMinusMultiCommonHtml(null) === '' && w.reportMinusMultiHtml(Object.assign({}, data, { common: null })).indexOf('mm-common') < 0);

  section('5. Кой я вижда — по обхвата');
  const plan = w.reportMinusMultiPlan(RC, STORES);
  const job = e => { const p = plan.filter(x => x.email === e)[0]; const sub = w.reportMinusMultiForStores(data, p.stores, p.scoped); return { p, sub, html: w.reportMinusMultiHtml(sub) }; };
  const t = job('t.tenev@temax.bg'), m = job('m.pavlova@temax.bg'), k = job('n.koleva@temax.bg'), a = job('all@temax.bg');
  ok('Теодор (NULL) — частта я има', t.sub.common && t.html.indexOf('Общи проблеми в няколко обекта') >= 0);
  ok('Миглена (без колона = NULL) — частта я има', m.sub.common && m.html.indexOf('mm-common') >= 0);
  ok('Колева (обхват) — частта я НЯМА изобщо (нито заглавие, нито празни редове)', k.sub.common === null && k.html.indexOf('mm-common') < 0 && k.html.indexOf('Общи проблеми') < 0);
  ok('обхват с всичките 5 обекта — пак я НЯМА', a.sub.common === null && a.html.indexOf('mm-common') < 0);
  ok('ForStores без третия аргумент — без частта (по подразбиране скрита)', w.reportMinusMultiForStores(data, STORES).common === null);
  ok('общите данни не са пипнати', data.common === c);

  section('6. reportMinusMultiShouldSend не се променя от частта');
  const noCommon = Object.assign({}, data); delete noCommon.common;
  const sends = d => plan.map(p => w.reportMinusMultiShouldSend(p, w.reportMinusMultiForStores(d, p.stores, p.scoped)));
  ok('същите решения с и без common', JSON.stringify(sends(data)) === JSON.stringify(sends(noCommon)), JSON.stringify(sends(data)));
  const pTr = plan.filter(x => x.email === 'tr@temax.bg')[0];
  const onlyCommon = Object.assign(w.reportMinusMultiGroup([], STORES, 3, 30, REF), { week: w.reportMinusMultiWeek([], STORES, REF), common: c });
  ok('с обхват [Троян], 0 повтарящи се и 0 за седмицата, а общи има → НЕ праща', w.reportMinusMultiShouldSend(pTr, w.reportMinusMultiForStores(onlyCommon, pTr.stores, pTr.scoped)) === false);

  section('7. Колекторът (фалшива база)');
  const db = { settings: [{ key: 'minus_stores', value: STORES.join(',') }, { key: 'minus_multi_days', value: '30' }], log: [] };
  install(h, db);
  const got = await new Promise(res => w.collectMinusMultiReportData(REF, res));
  const mq = db.log.filter(x => x.tbl === 'minus_movements').map(x => x.q);
  ok('заявките към minus_movements са пак две', mq.length === 2, mq.length);
  ok('първата иска и reason_id', /select=[^&]*reason_id/.test(mq[0]), mq[0]);
  ok('една заявка към minus_reasons (id, label)', db.log.filter(x => x.tbl === 'minus_reasons' && /select=id,label/.test(x.q)).length === 1);
  ok('данните носят common: 3 артикула, 3 причини, етикетите от minus_reasons',
    got && got.common && got.common.items.length === 3 && got.common.reasons.length === 3 && got.common.reasons[0].label === 'клиентска поръчка (номер/дата)', got && JSON.stringify(got.common && got.common.reasons.map(r => r.label)));
  db.failReasons = true;
  const bad = await new Promise(res => w.collectMinusMultiReportData(REF, res));
  ok('паднала заявка към minus_reasons → null (без писмо)', bad === null);
  db.failReasons = false; db.settings = [];
  const none = await new Promise(res => w.collectMinusMultiReportData(REF, res));
  ok('без включени обекти → празен common, не гърми', none && none.common && none.common.items.length === 0 && none.common.reasons.length === 0);
  h.close();
})().then(function () {
  section('8. Едж функцията (send-scheduled-report)');
  const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');
  const m = src.match(/if \(type === 'minus_multi'\) \{[\s\S]*?\n    \}\n/);
  const br = m ? m[0] : '';
  ok('срязването подава обхвата: reportMinusMultiForStores(mmData, p.stores, p.scoped)', /reportMinusMultiForStores\(mmData, p\.stores, p\.scoped\)/.test(br));
  ok('dry_run по получател: common { items, reasons } или null', /common: j\.sub\.common \? \{ items:j\.sub\.common\.items\.length, reasons:j\.sub\.common\.reasons\.length \} : null/.test(br));
  ok('бележката v64 описва частта', /v64 \(01\.11\.2026\)[^\n]*\n[^\n]*Общи проблеми в няколко обекта/.test(src));
  report();
}).catch(function (e) { console.error(e); process.exit(1); });
