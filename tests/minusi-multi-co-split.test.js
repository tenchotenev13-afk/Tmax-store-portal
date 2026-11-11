/* Минуси — клиентските поръчки отделно (11.11.2026, сесия minusi-multi-co-split;
   Теодор 09–11.11, Тенчо 11.11). „Клиентска поръчка“ = причина с
   minus_reasons.requires_note (флагът, не id / етикет); без причина — не е.

   Заковано:
     1. портал (minusi.js, истински клик): клиентска поръчка не иска „Становище“
        → „Запази“ минава; не-клиентска многократна без становище → отказ; „🔁“
        брои само не-клиентските и редът с клиентска поръчка не носи баджа;
        смяна на причината към клиентска поръчка → проверката е с избраната;
     2. портал ↔ bulletin-notify (срез от истинския .ts): еднакъв брой непопълнени;
     3. писмо (report.js и истинският .ts): двете секции, „без становище“ само за
        не-клиентските, артикул с двата вида — и в двете със свой брой; „Общи
        проблеми“ без клиентските (и артикули, и причини); „Минуси за седмицата“
        брои всички;
     4. сумите за офиса: „Разлика“ от закръглените стойности (0,85 ЛМ: 2,97 − 3,39
        = −0,42, не −0,43).

   Мутационна проверка (11.11.2026) — всеки вариант пуснат и паднал:
     S1 _multi брои и клиентските поръчки (minusi.js)            → пада
     S2 mnUnfilled иска становище и при клиентска поръчка         → пада
     S3 mnSave проверява със записаната, не с избраната причина   → пада
     S4 bulletin-notify брои и клиентските в многократния          → пада
     S5 основната секция на писмото включва и клиентските          → пада
     S6 „Общи проблеми“ броят и клиентските                        → пада
     S7 разликата — от незакръглените стойности                    → пада
   Пускане:  node tests/minusi-multi-co-split.test.js .
*/
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, section, report, ticks } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const GD = 'Гоце Делчев', SH = 'Шумен';
const GDU = { email: 'managergdelchev@temax.bg', display_name: 'Управител ГД', role: 'manager', store_name: GD };
const ADMIN = { email: 'a@temax.bg', display_name: 'Офис', role: 'admin', store_name: 'Централен офис' };
/* id 7 — нарочно не 1: правилото е по флага requires_note, не по id. */
const REASONS = [
  { id: 7, label: 'Клиентска поръчка', active: true, sort: 1, requires_note: true, excluded_from_revision: true },
  { id: 2, label: 'Не е преналепено', active: true, sort: 2, requires_note: false, excluded_from_revision: false }
];
let seq = 0;
const mv = (store, material, date, o) => Object.assign({
  id: 'mv-' + (++seq), plant: '7519', store_name: store, material, material_desc: 'АРТИКУЛ ' + material,
  mvt_type: '955', qty: 1, uom: 'БР', mat_doc: '49033' + String(seq).padStart(5, '0'), doc_item: '1', doc_year: 2026, posting_date: '2026-' + date,
  real_code: null, reason_id: null, employee_name: null, note: null, action: null, filled_by: null, filled_at: null
}, o || {});
const CO = n => ({ reason_id: 7, note: 'КЗ ' + n });
function portalMovs() {
  seq = 0;
  return [
    /* 30001 — три клиентски поръчки за 30 дни, без становище */
    mv(GD, '30001', '11-01', CO('ГД-1')), mv(GD, '30001', '11-03', CO('ГД-2')), mv(GD, '30001', '11-05'),          /* mv-1..3 (3-ти — непопълнен) */
    /* 30002 — три не-клиентски, третият без становище */
    mv(GD, '30002', '10-10', { reason_id: 2, action: 'x' }), mv(GD, '30002', '10-20', { reason_id: 2, action: 'y' }), mv(GD, '30002', '11-02'), /* mv-4..6 */
    /* 30003 — смесени: К, Н, К, Н → не-клиентските са 2 → без „🔁“ */
    mv(GD, '30003', '10-20', CO('a')), mv(GD, '30003', '10-25', { reason_id: 2, action: 'q' }), mv(GD, '30003', '10-30', CO('b')),
    mv(GD, '30003', '11-04', { reason_id: 2, action: 'r' })                                                       /* mv-7..10 */
  ];
}
function resp(status, body) {
  const t = body == null ? '' : JSON.stringify(body);
  return Promise.resolve({ ok: status < 300, status, json: () => t ? Promise.resolve(JSON.parse(t)) : Promise.reject(new SyntaxError('empty')), text: () => Promise.resolve(t) });
}
function install(h, db) {
  h.w.fetch = function (url, init) {
    const m = ((init && init.method) || 'GET').toUpperCase();
    const u = String(url), tbl = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1], q = decodeURIComponent(u.split('?')[1] || '');
    const body = init && init.body ? JSON.parse(init.body) : null;
    db.log.push({ m, tbl, q, body });
    if (m === 'GET') {
      if (tbl === 'app_settings') return resp(200, [{ key: 'minus_stores', value: GD }]);
      if (tbl === 'minus_plants') return resp(200, [{ plant: '7519', store_name: GD }]);
      if (tbl === 'minus_reasons') return resp(200, REASONS);
      if (tbl === 'minus_movements') return /offset=[1-9]/.test(q) ? resp(200, []) : resp(200, db.movs.map(x => Object.assign({}, x)));
      return resp(200, []);
    }
    if (m === 'PATCH') { const id = (q.match(/id=eq\.([^&]+)/) || [])[1]; db.movs.filter(x => x.id === id).forEach(x => Object.assign(x, body)); return resp(204, null); }
    return resp(405, {});
  };
}
async function portal(user) {
  const h = boot({ modules: ['client-orders.js', 'revaluation.js', 'revisions.js', 'notifications.js', 'minusi.js'], user, data: {} });
  const db = { movs: portalMovs(), log: [] };
  install(h, db);
  await h.w.loadMinusi(); for (let i = 0; i < 8; i++) await ticks();
  return { h, db };
}
const patches = db => db.log.filter(x => x.m === 'PATCH');
async function save(h, id) {
  const b = Array.from(h.doc.getElementById('mn-row-' + id).querySelectorAll('button')).filter(x => x.textContent === 'Запази')[0];
  await realClick(h.w, b, 'Запази ' + id); for (let i = 0; i < 6; i++) await ticks();
}

/* ── Срез от bulletin-notify (същият похват като minusi-notify-sync) ── */
function endOfFn(lines, start) {
  let depth = 0, started = false;
  for (let i = start; i < lines.length; i++) {
    const bare = lines[i].replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
    for (const ch of bare) { if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; if (started && depth === 0) return i; } }
  }
  return lines.length - 1;
}
function notifySlice() {
  const lines = fs.readFileSync(path.join(ROOT, 'supabase/functions/bulletin-notify/index.ts'), 'utf8').split(/\r?\n/);
  const REQ = ['mnuCountByStore', 'buildMinusUnfilled', 'runMinusUnfilled', 'minusPushText', 'mnuParseRepeatDays', 'mnuNormUom'];
  let end = -1;
  for (const fn of REQ) { const s = lines.findIndex(l => new RegExp('^(?:async )?function ' + fn + '\\b').test(l)); if (s < 0) throw new Error('няма ' + fn); end = Math.max(end, endOfFn(lines, s)); }
  const out = lines.slice(0, end + 1).filter(l => !/^import\s/.test(l)).join('\n').replace(/Deno\.env\.get\([^)]*\)!?/g, "''") + '\nexport { ' + REQ.join(', ') + ' };\n';
  const dir = path.join(os.tmpdir(), 'tmax-minusi-multi-co-split'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'slice-' + require('crypto').createHash('sha1').update(out).digest('hex').slice(0, 12) + '.ts');
  fs.writeFileSync(file, out);
  return file;
}

/* ── Писмото: фикстура ── */
function mailRows() {
  seq = 100;
  return [
    /* 40001 — 3 не-клиентски + 3 клиентски в ГД → и в двете секции, по 3 */
    mv(GD, '40001', '10-20', { reason_id: 2 }), mv(GD, '40001', '10-25', { reason_id: 2, action: 'становище А' }), mv(GD, '40001', '11-01', { reason_id: 2 }),
    mv(GD, '40001', '10-21', CO('ГД-0101 / 21.10')), mv(GD, '40001', '10-26', CO('ГД-0102 / 26.10')), mv(GD, '40001', '11-02', CO('ГД-0102 / 26.10')),
    /* 40002 — само клиентски, 3 → само във втората */
    mv(GD, '40002', '10-15', CO('ГД-0200')), mv(GD, '40002', '10-16', CO('ГД-0201')), mv(GD, '40002', '10-17', CO('ГД-0202')),
    /* 40003 — клиентски в ГД и в Шумен → НЕ е общ проблем */
    mv(GD, '40003', '11-03', CO('x')), mv(SH, '40003', '11-03', CO('y')),
    /* 40004 — не-клиентски в ГД и в Шумен → общ проблем; причина 2 в двата */
    mv(GD, '40004', '11-04', { reason_id: 2 }), mv(SH, '40004', '11-04', { reason_id: 2 }),
    /* 40005 — без причина, 3 → в основната (непопълнен не е клиентска поръчка) */
    mv(SH, '40005', '10-10'), mv(SH, '40005', '10-11'), mv(SH, '40005', '10-12')
  ];
}
const MREASONS = REASONS.map(r => ({ id: r.id, label: r.label, requires_note: r.requires_note }));
function mailChecks(label, F) {
  const rows = mailRows(), ST = [GD, SH];
  const g = F.reportMinusMultiGroup(JSON.parse(JSON.stringify(rows)), ST, 3, 30, '2026-11-08', MREASONS);
  const co = F.reportMinusMultiCoGroup(JSON.parse(JSON.stringify(rows)), ST, 3, 30, '2026-11-08', MREASONS);
  const cm = F.reportMinusMultiCommon(JSON.parse(JSON.stringify(rows)), ST, 30, '2026-11-08', MREASONS);
  const mats = d => d.stores.map(s => s.store + ':' + s.items.map(i => i.material + '×' + i.dates.length).join(',')).join(' | ');
  ok(label + ': „Повтарящи се“ — само не-клиентските (40001×3 в ГД, 40005×3 в Шумен)', mats(g) === GD + ':40001×3 | ' + SH + ':40005×3', mats(g));
  ok(label + ': „без становище“ брои само тях (40005 — да; 40001 има становище А)', g.total === 2 && g.noStatement === 1, g.total + '/' + g.noStatement);
  ok(label + ': „по клиентски поръчки“ — 40001×3 и 40002×3 в ГД', mats(co) === GD + ':40001×3,40002×3' && co.total === 2, mats(co));
  const n1 = co.stores[0] && co.stores[0].items.filter(i => i.material === '40001')[0];
  ok(label + ': колона „Поръчки“ — бележките без повторение', !!n1 && n1.notes.join('; ') === 'КЗ ГД-0101 / 21.10; КЗ ГД-0102 / 26.10', n1 && n1.notes.join('; '));
  ok(label + ': „Общи проблеми“ — артикули: само 40004 (40003 е клиентски)', cm.items.map(i => i.material).join(',') === '40004', cm.items.map(i => i.material).join(','));
  ok(label + ': „Общи проблеми“ — причини без „Клиентска поръчка“', cm.reasons.map(r => r.label).join(',') === 'Не е преналепено', cm.reasons.map(r => r.label).join(','));
  const wk = F.reportMinusMultiWeek(JSON.parse(JSON.stringify(rows)), ST, '2026-11-08');
  const gdw = wk.rows.filter(r => r.store === GD)[0];
  ok(label + ': „Минуси за седмицата“ брои всички (ГД 02–08.11: 40001×1, 40003, 40004 → 3)', gdw && gdw.cur === 3, gdw && gdw.cur);
  const data = Object.assign(g, { week: wk, common: cm, co: co });
  const html = F.reportMinusMultiHtml(F.reportMinusMultiForStores(data, ST, false));
  ok(label + ': HTML — секция „Повтарящи се по клиентски поръчки“ с колона „Поръчки“, след основната и преди общите',
    html.indexOf('Повтарящи се по клиентски поръчки') > html.indexOf('mm-store') && html.indexOf('Повтарящи се по клиентски поръчки') < html.indexOf('Общи проблеми') && /Поръчки<\/th>/.test(html));
  const sc = F.reportMinusMultiForStores(data, [SH], true);
  ok(label + ': обхват [Шумен] → без секция по клиентски поръчки (0), основната — 40005', sc.co && sc.co.total === 0 && sc.total === 1);
  ok(label + ': без reasons (стар вход) — нищо не се изключва', F.reportMinusMultiGroup(JSON.parse(JSON.stringify(rows)), ST, 3, 30, '2026-11-08').stores[0].items.length === 2);
}

(async function run() {
  section('1. Портал — клиентска поръчка без становище');
  {
    const { h, db } = await portal(GDU);
    const w = h.w;
    ok('непопълненият 3-ти ред на 30001 — без „🔁“ (двата преди него са клиентски → брои 1)', !h.doc.querySelector('#mn-row-mv-3 .mn-multi'));
    const s3 = h.doc.getElementById('mn-reason-mv-3'); s3.value = '7';
    h.doc.getElementById('mn-note-mv-3').value = 'КЗ ГД-3';
    const n0 = patches(db).length;
    await save(h, 'mv-3');
    const p = patches(db).slice(n0);
    ok('клиентска поръчка, 3-та за 30 дни, без становище → „Запази“ минава', p.length === 1 && p[0].body.reason_id === 7, JSON.stringify(h.calls.toast.slice(-1)));
    ok('ред с клиентска поръчка не носи „🔁“', !h.doc.querySelector('#mn-row-mv-3 .mn-multi') && !h.doc.querySelector('#mn-row-mv-1 .mn-multi'));
    const c = w.mnCompute(w.mnMovs, w.mnThresholds);
    ok('mnUnfilled = false за трите клиентски', c.all.filter(r => r.material === '30001').every(r => !w.mnUnfilled(r)));

    section('2. Портал — не-клиентска многократна');
    h.doc.getElementById('mn-reason-mv-6').value = '2';
    const n1 = patches(db).length;
    await save(h, 'mv-6');
    ok('не-клиентска, 3-та за 30 дни, без становище → отказ', patches(db).length === n1 && /становище/.test(h.calls.toast[h.calls.toast.length - 1]), h.calls.toast.slice(-1)[0]);
    ok('… и носи „🔁 3“', !!h.doc.querySelector('#mn-row-mv-6 .mn-multi') && /🔁 3 за 30 дни/.test(h.doc.querySelector('#mn-row-mv-6 .mn-multi').textContent));
    h.doc.getElementById('mn-reason-mv-6').value = '7'; h.doc.getElementById('mn-note-mv-6').value = 'КЗ ГД-6';
    await save(h, 'mv-6');
    ok('смяна към клиентска поръчка → проверката е с избраната причина, „Запази“ минава', patches(db).length === n1 + 1);
    const c2 = w.mnCompute(w.mnMovs, w.mnThresholds);
    const r10 = c2.all.filter(r => r.id === 'mv-10')[0];
    ok('смесен артикул 30003: 4-тият (не-клиентски) брои само не-клиентските → 2, без „🔁“', r10 && r10._multiN === 2 && !r10._multi, r10 && r10._multiN);
    ok('… клиентските в него — _multiN 0', c2.all.filter(r => r.material === '30003' && r.reason_id === 7).every(r => r._multiN === 0 && !r._multi));

    section('3. Портал ↔ bulletin-notify — еднакъв брой непопълнени');
    let mod = null;
    try { mod = await import(pathToFileURL(notifySlice()).href); } catch (e) { ok('срезът от bulletin-notify се импортира', false, e.message); }
    if (mod) {
      /* 30004: К (08.10), К (19.10), Н без действие (30.10) — разлики > 10 дни (не е повторение); многократен
         е САМО ако се броят и клиентските → попълнен. */
      const movs = portalMovs().map(m => m.id === 'mv-3' ? Object.assign({}, m, CO('3')) : m.id === 'mv-6' ? Object.assign({}, m, { reason_id: 2 }) : m)
        .concat([mv(GD, '30004', '10-08', CO('c1')), mv(GD, '30004', '10-19', CO('c2')), mv(GD, '30004', '10-30', { reason_id: 2 })]);
      w.mnMovs = movs;
      const js = w.mnCompute(movs, {}).open.filter(w.mnUnfilled).length;
      const ts = mod.mnuCountByStore(movs, {}, 10, ['7'])[GD].unfilled;
      ok('portal = .ts (непопълнен е само 30002 / mv-6) → 1', js === 1 && ts === 1, 'portal ' + js + ', .ts ' + ts);
      const movs2 = movs.map(m => m.id === 'mv-6' ? Object.assign({}, m, CO('6')) : m);
      ok('и след смяна към клиентска поръчка → 0 и в двете', w.mnCompute(movs2, {}).open.filter(w.mnUnfilled).length === 0 && mod.mnuCountByStore(movs2, {}, 10, ['7'])[GD].unfilled === 0);
    }
    h.close();
  }

  section('4. Писмото — report.js');
  {
    const h = boot({ modules: ['report.js'], user: ADMIN, data: {} });
    mailChecks('report.js', h.w);
    h.close();
  }

  section('5. Писмото — истинският send-scheduled-report/index.ts');
  {
    const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');
    const grab = name => { const i = src.indexOf('\nfunction ' + name + '('); if (i < 0) throw new Error('няма ' + name); const j = src.indexOf('\n}\n', i); return src.slice(i, j + 3); };
    const names = ['reportMinusMultiAddDays', 'reportMinusMultiDM', 'reportMinusMultiCoIds', 'reportMinusMultiIsCo', 'reportMinusMultiCoGroup', 'reportMinusMultiCoHtml',
      'reportMinusMultiGroup', 'reportMinusMultiPct', 'reportMinusMultiWeekTotal', 'reportMinusMultiWeek', 'reportMinusMultiWeekHtml', 'reportMinusMultiCommon',
      'reportMinusMultiCommonHtml', 'reportMinusMultiHtml', 'reportMinusMultiForStores'];
    const ctx = { esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
      reportEmailShell: (t, s, b) => '<h1>' + t + '</h1>' + b, REPORT_MINUS_MULTI_COUNT: 3, REPORT_MINUS_MULTI_DAYS: 30 };
    vm.createContext(ctx);
    let okRun = true;
    try { vm.runInContext(names.map(grab).join('\n'), ctx); } catch (e) { okRun = false; console.log(e.message); }
    ok('функциите от .ts се изпълняват', okRun);
    if (okRun) mailChecks('.ts', ctx);
    const m = src.match(/if \(type === 'minus_multi'\) \{[\s\S]*?\n    \}\n/);
    ok('dry_run носи co_total и co_stores', !!m && /co_total: j\.sub\.co \? j\.sub\.co\.total : null/.test(m[0]) && /co_stores:/.test(m[0]));
    ok('v67 бележка най-отгоре', /^\/\*[\s\S]{0,200}v67 \(11\.11\.2026\)/.test(src));
  }

  section('6. Сумите за офиса — „Разлика“ от закръглените');
  {
    const h = boot({ modules: ['minusi.js'], user: ADMIN, data: {} });
    const w = h.w;
    w.mnReasons = REASONS;
    w.mnPrices = { '50001': { price: 3.49, unit: 'ЛМ' }, '50002': { price: 3.99, unit: 'ЛМ' } };
    w.mnPriceState = 'ok';
    const v = w.mnValRow({ material: '50001', real_code: '50002', uom: 'ЛМ', _rest: 0.85 });
    ok('0,85 ЛМ: минус 2,97 €, заметнат 3,39 €', w.mnFmtEur(v.minus) === '2,97 €' && w.mnFmtEur(v.real) === '3,39 €', w.mnFmtEur(v.minus) + ' / ' + w.mnFmtEur(v.real));
    ok('разлика −0,42 € (2,97 − 3,39), не −0,43', w.mnFmtEur(v.diff) === '−0,42 €', w.mnFmtEur(v.diff));
    h.close();
  }

  report();
})();
