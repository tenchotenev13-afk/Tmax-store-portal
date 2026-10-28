/* Минуси — многократен минус и седмичното писмо „Минуси — повтарящи се
   артикули" (28.10.2026, сесия minusi-repeat-report; Теодор 27.10, решения
   на Тенчо 27.10).

   Правилото (едно, на всички места): за обект + материал редът 955 е
   „многократен", ако е N-тият 955 с дата в [дата − (D − 1); дата] до себе си
   включително (по реда дата → документ → позиция), N ≥ C. C и D —
   app_settings minus_multi_count / minus_multi_days, липсва / невалидно → 3
   и 30. Писмото: артикул с C+ реда 955 в последните D дни към неделята.

   Секции:
     1. правилото в minusi.js (mnCompute): 2 → не; 3 в 30 дни → да; първият на
        31-вия ден → не; 3 в един ден → само третият; праг и дни от настройката;
        невалидно → 3 и 30;
     2. обектът: „Становище" (етикет и placeholder), чип „🔁 N за 30 дни" вместо
        „×N", РЕАЛЕН клик „Запази" без текст → 0 PATCH, с текст → PATCH с action;
        mnUnfilled / брояч; контролингът чете „Становище: …";
     3. bulletin-notify (minus_unfilled) — срезът от реалния .ts брои ЕДНАКВО с
        портала при двата прага, и чете двата ключа от app_settings;
     4. писмото (report.js): неделята, групирането (граници на прозореца, 956,
        чужд обект, последното непразно становище, ред по брой), „няма
        становище", празният случай, ескейпване на описанието, темата,
        получателите по флага, колекторът (заявката, непълни данни → null),
        „Тест до мен".

   Мутационна проверка (28.10.2026) — всеки вариант пуснат и паднал:
     M1 minusi.js: прозорецът d <= MD (31 дни вместо 30)        → пада 1 и 3
     M2 minusi.js: s955 вместо s955.slice(0, i + 1) (броят и по-късните
        от същия ден)                                            → пада 1
     M3 minusi.js: mnUnfilled без r._multi                       → пада 2 и 3
     M4 minusi.js: mnSave без проверката за становище           → пада 2
     M5 bulletin-notify: multiN >= MC махнато от noAction        → пада 3
     M6 bulletin-notify: ключовете minus_multi_* не се четат     → пада 3
     M7 report.js: становището — първото, не последното          → пада 4
     M8 report.js: esc(g.desc) → g.desc                          → пада 4
     M9 report.js: получател без проверка на minus_multi         → пада 4
     M10 report.js: празният случай без реда „Няма артикул…"     → пада 4
   Пускане: node tests/minusi-multi.test.js . */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, section, report, ticks } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const SRC = path.join(ROOT, 'supabase/functions/bulletin-notify/index.ts');

const GD = 'Гоце Делчев', SH = 'Шумен', LO = 'Ловеч';
let seq = 0;
function mv(store, material, type, date, o) {
  seq++;
  return Object.assign({ id: 'm' + String(seq).padStart(4, '0'), store_name: store, plant: '5519', material: material,
    material_desc: 'ТЕСТ ' + material, mvt_type: type, qty: type === '956' ? -1 : 1, uom: 'БР', mat_doc: 'D' + String(seq).padStart(4, '0'),
    doc_item: '1', doc_year: 2026, posting_date: date, real_code: null, reason_id: null, employee_name: null, note: null, action: null,
    filled_by: null, filled_at: null }, o || {});
}
const copy = a => a.map(x => Object.assign({}, x));

/* Правилото — фикстури (всички в Гоце Делчев, причина 2, без 956):
   A 3 реда: 01.10, 15.10, 30.10 — 30.10 е 30-ият ден от 01.10 → многократен
   B 2 реда: 01.10, 20.10 → не
   C 3 реда: 01.10, 15.10, 31.10 — 01.10 е на 31-вия ден → 31.10 е само 2-ри
   D 3 реда в един ден (10.10, D…, D…, D…) → само третият
   E 4 реда: 05.10, 12.10, 19.10, 26.10 → 3-ти и 4-ти (N = 3, 4) */
const R = { reason_id: 2 };
const RULE = [
  mv(GD, '80001', '955', '2026-10-01', R), mv(GD, '80001', '955', '2026-10-15', R), mv(GD, '80001', '955', '2026-10-30', R),
  mv(GD, '80002', '955', '2026-10-01', R), mv(GD, '80002', '955', '2026-10-20', R),
  mv(GD, '80003', '955', '2026-10-01', R), mv(GD, '80003', '955', '2026-10-15', R), mv(GD, '80003', '955', '2026-10-31', R),
  mv(GD, '80004', '955', '2026-10-10', R), mv(GD, '80004', '955', '2026-10-10', R), mv(GD, '80004', '955', '2026-10-10', R),
  mv(GD, '80005', '955', '2026-10-05', R), mv(GD, '80005', '955', '2026-10-12', R), mv(GD, '80005', '955', '2026-10-19', R), mv(GD, '80005', '955', '2026-10-26', R)
];
const REASONS = [{ id: 1, label: 'клиентска поръчка (номер/дата)', active: true, sort: 1, requires_note: true },
  { id: 2, label: 'последна бройка, липсва код', active: true, sort: 2, requires_note: false }];

function resp(status, body) {
  const t = body == null ? '' : JSON.stringify(body);
  return Promise.resolve({ ok: status < 300, status, json: () => t ? Promise.resolve(JSON.parse(t)) : Promise.reject(new SyntaxError('empty')), text: () => Promise.resolve(t) });
}
/* db.settings — масив {key,value}; movs; log. */
function install(h, db) {
  h.w.fetch = function (url, init) {
    const m = ((init && init.method) || 'GET').toUpperCase();
    const u = String(url);
    const tbl = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    const q = decodeURIComponent(u.split('?')[1] || '');
    const body = init && init.body ? JSON.parse(init.body) : null;
    db.log.push({ m, tbl, url: u, q, body });
    if (m === 'GET') {
      if (tbl === 'app_settings') return resp(200, db.settings);
      if (tbl === 'minus_plants') return resp(200, [{ plant: '5519', store_name: GD }]);
      if (tbl === 'minus_reasons') return resp(200, REASONS);
      if (tbl === 'minus_uom_thresholds') return resp(200, []);
      if (tbl === 'minus_uploads') return resp(200, []);
      if (tbl === 'minus_movements') {
        if (db.failMovs) return resp(500, { message: 'boom' });
        if (/offset=[1-9]/.test(q)) return resp(200, []);
        const st = (q.match(/store_name=eq\.([^&]+)/) || [])[1];
        return resp(200, db.movs.filter(x => !st || x.store_name === st).map(x => Object.assign({}, x)));
      }
      if (tbl === 'report_recipients') return resp(200, db.recipients || []);
      return resp(200, []);
    }
    if (m === 'PATCH') {
      const id = (q.match(/id=eq\.([^&]+)/) || [])[1];
      db.movs.filter(x => x.id === id).forEach(x => Object.assign(x, body));
      return resp(204, null);
    }
    return resp(405, { message: 'not in fake' });
  };
}
function settings(o) {
  o = o || {};
  const s = [{ key: 'minus_stores', value: o.stores != null ? o.stores : GD }];
  if (o.count !== undefined) s.push({ key: 'minus_multi_count', value: o.count });
  if (o.days !== undefined) s.push({ key: 'minus_multi_days', value: o.days });
  return s;
}
function env(user, db) {
  const h = boot({ modules: ['revaluation.js', 'revisions.js', 'minusi.js'], user, data: {} });
  install(h, db);
  return h;
}
async function open(h) { await h.w.loadMinusi(); await ticks(6); }
const ADMIN = { email: 'm.pavlova@temax.bg', display_name: 'Миглена', role: 'admin', store_name: 'Централен офис' };
const GDU = { email: 'managergdelchev@temax.bg', display_name: 'Управител ГД', role: 'manager', store_name: GD };

/* ── Срез от реалния bulletin-notify (техниката на minusi-notify-sync) ── */
function endOfFn(lines, start) {
  let depth = 0, started = false;
  for (let i = start; i < lines.length; i++) {
    const bare = lines[i]
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
    for (const ch of bare) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') { depth--; if (started && depth === 0) return i; }
    }
  }
  return lines.length - 1;
}
const REQUIRED = ['mnuCountByStore', 'buildMinusUnfilled', 'mnuParsePosInt', 'mnuNormUom'];
function buildModule() {
  const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
  let end = -1;
  for (const fn of REQUIRED) {
    const s = lines.findIndex(l => new RegExp('^(?:async )?function ' + fn + '\\b').test(l));
    if (s < 0) throw new Error('липсва във файла: ' + fn);
    const e = endOfFn(lines, s);
    if (e > end) end = e;
  }
  const head = lines.slice(0, end + 1).filter(l => !/^import\s/.test(l)).join('\n').replace(/Deno\.env\.get\([^)]*\)!?/g, "''");
  const out = head + '\nexport { ' + REQUIRED.join(', ') + ' };\n';
  const dir = path.join(os.tmpdir(), 'tmax-minusi-multi');
  fs.mkdirSync(dir, { recursive: true });
  const tag = require('crypto').createHash('sha1').update(out).digest('hex').slice(0, 12);
  const file = path.join(dir, 'slice-' + tag + '.ts');
  fs.writeFileSync(file, out);
  return file;
}
function fakeSb(data) {
  return {
    from(table) {
      const q = { filters: [], range: null };
      const self = {
        select() { return self; },
        eq(c, v) { q.filters.push(['eq', c, v]); return self; },
        in(c, v) { q.filters.push(['in', c, v]); return self; },
        order() { return self; },
        range(a, b) { q.range = [a, b]; return self; },
        then(res, rej) {
          let rows = (data[table] || []).filter(r => q.filters.every(f => f[0] === 'eq' ? r[f[1]] === f[2] : f[2].indexOf(r[f[1]]) >= 0));
          if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
          return Promise.resolve({ data: rows, error: null }).then(res, rej);
        }
      };
      return self;
    }
  };
}

(async function run() {
  section('1. Правилото в minusi.js (mnCompute)');
  {
    const h = boot({ modules: ['minusi.js'], user: ADMIN, data: {} });
    const w = h.w;
    const by = (calc, mat) => calc.all.filter(r => r.material === mat).sort((a, b) => w.mnCmp955(a, b));
    const flags = (calc, mat) => by(calc, mat).map(r => (r._multi ? 'M' : '-') + r._multiN).join(' ');
    const c = w.mnCompute(copy(RULE), {});
    ok('по подразбиране 3 и 30', w.mnMultiCount === 3 && w.mnMultiDays === 30);
    ok('A: 01.10, 15.10, 30.10 (30-ият ден) → третият е многократен', flags(c, '80001') === '-1 -2 M3', flags(c, '80001'));
    ok('B: 2 минуса → нито един', flags(c, '80002') === '-1 -2', flags(c, '80002'));
    ok('C: първият на 31-вия ден → 31.10 е само 2-ри, не е многократен', flags(c, '80003') === '-1 -2 -2', flags(c, '80003'));
    ok('D: три в един ден → само третият (по-късните не се броят)', flags(c, '80004') === '-1 -2 M3', flags(c, '80004'));
    ok('E: четири за 22 дни → 3-тият и 4-тият (N = 3, 4)', flags(c, '80005') === '-1 -2 M3 M4', flags(c, '80005'));
    const c2 = w.mnCompute(copy(RULE), {}, null, { count: 2, days: 30 });
    ok('праг 2 → и B (20.10) е многократен', flags(c2, '80002') === '-1 M2', flags(c2, '80002'));
    const c10 = w.mnCompute(copy(RULE), {}, null, { count: 3, days: 10 });
    ok('10 дни → A вече не е; D (един ден) — още е', flags(c10, '80001') === '-1 -1 -1' && flags(c10, '80004') === '-1 -2 M3', flags(c10, '80001') + ' / ' + flags(c10, '80004'));
    ok('mnParsePosInt: „3“ → 3, „ 7 “ → 7, „0“ / „abc“ / null / „2.5“ → по подразбиране',
      w.mnParsePosInt('3', 9) === 3 && w.mnParsePosInt(' 7 ', 9) === 7 && w.mnParsePosInt('0', 9) === 9 &&
      w.mnParsePosInt('abc', 9) === 9 && w.mnParsePosInt(null, 9) === 9 && w.mnParsePosInt('2.5', 9) === 9);
    h.close();

    /* Ключовете от app_settings — през истинския loadMinusi. */
    const hs = env(ADMIN, { settings: settings({ count: '2', days: '10' }), movs: copy(RULE), log: [] }); await open(hs);
    ok('настройка „2“ / „10“ → mnMultiCount 2, mnMultiDays 10', hs.w.mnMultiCount === 2 && hs.w.mnMultiDays === 10, hs.w.mnMultiCount + '/' + hs.w.mnMultiDays);
    hs.close();
    const hb = env(ADMIN, { settings: settings({ count: 'x', days: '0' }), movs: copy(RULE), log: [] }); await open(hb);
    ok('невалидни „x“ / „0“ → 3 и 30', hb.w.mnMultiCount === 3 && hb.w.mnMultiDays === 30);
    hb.close();
    const dbq = { settings: settings(), movs: copy(RULE), log: [] };
    const hq = env(ADMIN, dbq); await open(hq);
    const sq = dbq.log.filter(x => x.tbl === 'app_settings').map(x => x.q);
    ok('заявката за настройките иска и двата ключа', sq.length > 0 && sq.every(s => /minus_multi_count/.test(s) && /minus_multi_days/.test(s)), sq.join(' | '));
    ok('липсващи ключове → 3 и 30', hq.w.mnMultiCount === 3 && hq.w.mnMultiDays === 30);
    hq.close();
  }

  section('2. Обектът: „Становище", чип, реален клик „Запази"');
  {
    const db = { settings: settings(), movs: copy(RULE), log: [] };
    const h = env(GDU, db); await open(h);
    const row3 = RULE[2].id, row1 = RULE[0].id, rowC3 = RULE[7].id, rowE4 = RULE[14].id;
    const tr = id => h.doc.getElementById('mn-row-' + id);
    const act = id => h.doc.getElementById('mn-action-' + id);
    ok('многократният ред (A, 30.10) има поле с placeholder „Становище“', !!act(row3) && act(row3).getAttribute('placeholder') === 'Становище');
    const lbl = tr(row3) && tr(row3).querySelector('.mn-action-lbl');
    ok('… и етикет „Становище“ над него', !!lbl && lbl.textContent === 'Становище');
    ok('първият ред (A, 01.10) — без поле', !act(row1));
    ok('C (31.10, 16 дни, не е повторение, 2-ри за 30) — без поле', !act(rowC3));
    const chip = tr(row3) && tr(row3).querySelector('.mn-multi');
    ok('чип „🔁 3 за 30 дни“', !!chip && chip.textContent === '🔁 3 за 30 дни', chip && chip.textContent);
    ok('… и без лилавото „×N“ на същия ред', !tr(row3).querySelector('.mn-cnt30'));
    ok('E 26.10 — „🔁 4 за 30 дни“', tr(rowE4) && tr(rowE4).querySelector('.mn-multi') && tr(rowE4).querySelector('.mn-multi').textContent === '🔁 4 за 30 дни');
    ok('B 20.10 (2 за 30 дни) — лилавото „×2“, без 🔁', tr(RULE[4].id) && !tr(RULE[4].id).querySelector('.mn-multi') && tr(RULE[4].id).querySelector('.mn-cnt30').textContent === '×2 за 30 дни');

    /* Брояч: многократният без становище е непопълнен (причината е попълнена). */
    const calc = h.w.mnCompute(h.w.mnMovs, h.w.mnThresholds);
    const unf = calc.open.filter(h.w.mnUnfilled).map(r => r.id);
    ok('mnUnfilled: многократните без становище (A3, D3, E3, E4) — непопълнени', [row3, RULE[10].id, RULE[13].id, rowE4].every(id => unf.indexOf(id) >= 0), unf.join(','));
    ok('… а 01.10 с причина — попълнен', unf.indexOf(row1) < 0);

    const pBefore = db.log.filter(x => x.m === 'PATCH').length;
    h.doc.getElementById('mn-reason-' + row3).value = '2';
    h.doc.getElementById('mn-emp-' + row3).value = 'Здравка';
    act(row3).value = '   ';
    realClick(h.w, btn(tr(row3), 'Запази')); await ticks(4);
    ok('„Запази“ без становище → 0 PATCH', db.log.filter(x => x.m === 'PATCH').length === pBefore);
    ok('… toast „🔁 3 минуса за 30 дни — попълни становище“', h.calls.toast.slice(-1)[0] === '🔁 3 минуса за 30 дни — попълни становище', h.calls.toast.slice(-1)[0]);
    act(row3).value = ' грешен етикет на рафта — ще го сменим ';
    realClick(h.w, btn(tr(row3), 'Запази')); await ticks(4);
    const pp = db.log.filter(x => x.m === 'PATCH');
    ok('с текст → PATCH с action (trim)', pp.length === pBefore + 1 && pp[pp.length - 1].q === 'id=eq.' + row3 && pp[pp.length - 1].body.action === 'грешен етикет на рафта — ще го сменим', pp.length && JSON.stringify(pp[pp.length - 1].body));
    const calc2 = h.w.mnCompute(h.w.mnMovs, h.w.mnThresholds);
    ok('… и редът вече не е непопълнен', calc2.open.filter(h.w.mnUnfilled).map(r => r.id).indexOf(row3) < 0);
    /* Нито повторение, нито многократен → PATCH без action. */
    h.doc.getElementById('mn-reason-' + rowC3).value = '2';
    h.doc.getElementById('mn-emp-' + rowC3).value = 'Здравка';
    realClick(h.w, btn(tr(rowC3), 'Запази')); await ticks(4);
    const pc = db.log.filter(x => x.m === 'PATCH').slice(-1)[0];
    ok('обикновен ред → PATCH без action', pc && pc.q === 'id=eq.' + rowC3 && !('action' in pc.body), pc && JSON.stringify(pc.body));
    h.close();

    /* Контролингът чете „Становище: …". */
    const m2 = copy(RULE); m2[2].action = 'ще преетикираме';
    const hc = env(ADMIN, { settings: settings(), movs: m2, log: [] }); await open(hc);
    const t = hc.doc.getElementById('mn-row-' + row3);
    ok('контролингът вижда „Становище: ще преетикираме“', t && t.querySelector('.mn-action-txt') && t.querySelector('.mn-action-txt').textContent === 'Становище: ще преетикираме');
    hc.close();

    /* „Днес" / брояч — mnLoadSummary брои многократния без становище. */
    const hsum = env(ADMIN, { settings: settings(), movs: copy(RULE), log: [] });
    const sum = await hsum.w.mnLoadSummary(null);
    const gd = sum.ok && sum.rows.filter(r => r.store === GD)[0];
    ok('mnLoadSummary: unfilled = 6 (многократни A3, D3, E3, E4 + повторения до 10 дни D2, E2)', !!gd && gd.unfilled === 6, gd && JSON.stringify(gd));
    hsum.close();
  }

  section('3. bulletin-notify (minus_unfilled) брои като портала');
  {
    let mod = null;
    try { mod = await import(pathToFileURL(buildModule()).href); } catch (e) { ok('срезът се импортира', false, String(e && e.message)); }
    if (mod) {
      const portal = (count, days) => {
        const h = boot({ modules: ['minusi.js'], user: ADMIN, data: {} });
        h.w.mnReasons = REASONS; h.w.mnRepeatDays = 10;
        const c = h.w.mnCompute(copy(RULE), {}, null, { count, days });
        h.w.mnMultiCount = count; h.w.mnMultiDays = days;
        const n = c.open.filter(h.w.mnUnfilled).length;
        h.close();
        return n;
      };
      [[3, 30], [2, 30], [3, 10]].forEach(([cn, dy]) => {
        const edge = mod.mnuCountByStore(copy(RULE), {}, 10, ['1'], { count: cn, days: dy })[GD].unfilled;
        ok('праг ' + cn + ' / ' + dy + ' дни: портал = функция (' + portal(cn, dy) + ')', edge === portal(cn, dy), 'функция ' + edge);
      });
      ok('3 / 30: 6 непопълнени (ръчно: многократни A3, D3, E3, E4 + повторения D2, E2)', mod.mnuCountByStore(copy(RULE), {}, 10, ['1'], { count: 3, days: 30 })[GD].unfilled === 6);
      ok('без multi → 3 и 30', mod.mnuCountByStore(copy(RULE), {}, 10, ['1'])[GD].unfilled === 6);
      const data = { app_settings: [{ key: 'minus_stores', value: GD }, { key: 'minus_repeat_days', value: '10' }, { key: 'minus_multi_count', value: '2' }, { key: 'minus_multi_days', value: '30' }],
        minus_reasons: REASONS, minus_uom_thresholds: [], minus_movements: copy(RULE) };
      const built = await mod.buildMinusUnfilled(fakeSb(data), { dateStr: '2026-10-28' });
      ok('buildMinusUnfilled чете minus_multi_count / _days → multi {2, 30}', built.multi && built.multi.count === 2 && built.multi.days === 30, JSON.stringify(built.multi));
      ok('… и брои с тях (= портала при 2 / 30)', built.entries && built.entries[0].n === portal(2, 30), built.entries && built.entries[0].n);
      const built0 = await mod.buildMinusUnfilled(fakeSb(Object.assign({}, data, { app_settings: data.app_settings.slice(0, 2) })), { dateStr: '2026-10-28' });
      ok('липсващи ключове → 3 и 30', built0.multi && built0.multi.count === 3 && built0.multi.days === 30 && built0.entries[0].n === 6);
    }
  }

  section('4. Писмото „Минуси — повтарящи се артикули“ (report.js)');
  {
    const h = boot({ modules: ['minusi.js', 'report.js'], user: ADMIN, data: {} });
    const w = h.w;
    ok('неделята: пон 26.10 → 25.10; нед 25.10 → 18.10; ср 28.10 → 25.10; пон 02.11 → 01.11',
      w.reportMinusMultiRefSunday('2026-10-26') === '2026-10-25' && w.reportMinusMultiRefSunday('2026-10-25') === '2026-10-18' &&
      w.reportMinusMultiRefSunday('2026-10-28') === '2026-10-25' && w.reportMinusMultiRefSunday('2026-11-02') === '2026-11-01');
    const REP = [
      /* Гоце Делчев: 70001 — точно на двете граници (26.09 и 25.10) + 10.10; становищата — последното непразно */
      mv(GD, '70001', '955', '2026-09-26', { action: 'старо' }), mv(GD, '70001', '955', '2026-10-10', { action: 'ново' }), mv(GD, '70001', '955', '2026-10-25', { action: '  ' }),
      /* 70002 — първият на 25.09 (извън) → само 2 в прозореца */
      mv(GD, '70002', '955', '2026-09-25'), mv(GD, '70002', '955', '2026-10-01'), mv(GD, '70002', '955', '2026-10-20'),
      /* 70003 — 3 без становище, описание с HTML; 956 не се брои */
      mv(GD, '70003', '955', '2026-10-05', { material_desc: 'ВИНТ <b>M6</b> & „гайка“' }), mv(GD, '70003', '955', '2026-10-06', { material_desc: 'ВИНТ <b>M6</b> & „гайка“' }),
      mv(GD, '70003', '955', '2026-10-07', { material_desc: 'ВИНТ <b>M6</b> & „гайка“' }), mv(GD, '70003', '956', '2026-10-08'),
      /* 70004 — 2×955 + 1×956 → не */
      mv(GD, '70004', '955', '2026-10-05'), mv(GD, '70004', '955', '2026-10-06'), mv(GD, '70004', '956', '2026-10-07'),
      /* 70005 — 26.10 е след неделята → не */
      mv(GD, '70005', '955', '2026-10-20'), mv(GD, '70005', '955', '2026-10-21'), mv(GD, '70005', '955', '2026-10-26'),
      /* Шумен: 71001 — 4 реда (първи в групата по брой), 71002 — 3 реда */
      mv(SH, '71002', '955', '2026-10-01'), mv(SH, '71002', '955', '2026-10-02'), mv(SH, '71002', '955', '2026-10-03'),
      mv(SH, '71001', '955', '2026-10-11'), mv(SH, '71001', '955', '2026-10-12'), mv(SH, '71001', '955', '2026-10-13'), mv(SH, '71001', '955', '2026-10-14', { action: 'кражба — подадено в РПУ' }),
      /* Ловеч — не е в списъка */
      mv(LO, '72001', '955', '2026-10-01'), mv(LO, '72001', '955', '2026-10-02'), mv(LO, '72001', '955', '2026-10-03')
    ];
    const g = w.reportMinusMultiGroup(copy(REP), [SH, GD], 3, 30, '2026-10-25');
    const list = g.stores.map(s => s.store + ':' + s.items.map(i => i.material + '×' + i.dates.length).join(',')).join(' | ');
    ok('групиране: обектите по реда на minus_stores, артикулите по брой', list === 'Шумен:71001×4,71002×3 | Гоце Делчев:70001×3,70003×3', list);
    ok('прозорецът 26.09 – 25.10 (двете граници включени)', g.from === '2026-09-26' && g.ref === '2026-10-25');
    const it = (s, m) => g.stores.filter(x => x.store === s)[0].items.filter(x => x.material === m)[0];
    ok('датите са всички 955 в прозореца, по ред', it(GD, '70001').dates.join(',') === '2026-09-26,2026-10-10,2026-10-25', it(GD, '70001').dates.join(','));
    ok('становището е последното НЕПРАЗНО („ново“)', it(GD, '70001').action === 'ново', it(GD, '70001').action);
    ok('общо 4, без становище 2 (71002, 70003)', g.total === 4 && g.noStatement === 2, g.total + '/' + g.noStatement);
    const g2 = w.reportMinusMultiGroup(copy(REP), [GD], 2, 30, '2026-10-25');
    ok('праг 2 → и 70002 (2 в прозореца), 70004 (2×955), 70005 (2 до неделята), не и Шумен (не е подаден)', g2.stores.length === 1 && g2.stores[0].items.map(i => i.material).sort().join(',') === '70001,70002,70003,70004,70005', g2.stores.map(s => s.items.map(i => i.material).join(',')).join('|'));

    const html = w.reportMinusMultiHtml(g);
    const d = new (w.DOMParser)().parseFromString(html, 'text/html');
    const rows = Array.from(d.querySelectorAll('tr.mm-item'));
    ok('4 реда артикули', rows.length === 4, rows.length);
    const rowOf = m => rows.filter(r => r.querySelector('td').textContent === m)[0];
    const cells = m => Array.from(rowOf(m).querySelectorAll('td')).map(x => x.textContent);
    ok('70001: код | описание | 3 | 26.09, 10.10, 25.10 | ново', cells('70001').join(' | ') === '70001 | ТЕСТ 70001 | 3 | 26.09, 10.10, 25.10 | ново', cells('70001').join(' | '));
    ok('70003: червено „няма становище“', rowOf('70003').querySelector('.mm-none') && rowOf('70003').querySelector('.mm-none').textContent === 'няма становище' && /color:#dc2626/.test(rowOf('70003').querySelector('.mm-none').getAttribute('style')));
    ok('описанието е ескейпнато (текст, не HTML)', cells('70003')[1] === 'ВИНТ <b>M6</b> & „гайка“' && !rowOf('70003').querySelector('td b') && html.indexOf('ВИНТ &lt;b&gt;M6&lt;/b&gt; &amp; „гайка“') >= 0);
    ok('заглавия на обектите: „Шумен (2)“, „Гоце Делчев (2)“', Array.from(d.querySelectorAll('.mm-store')).map(x => x.textContent).join(' / ') === 'Шумен (2) / Гоце Делчев (2)');
    ok('обобщение: 4 артикула, без становище 2', /Артикули с 3 или повече минуса \(955\) за 30 дни: 4 · без становище: 2/.test(d.body.textContent), d.body.textContent.slice(0, 200));
    ok('периодът в заглавката: „Последните 30 дни: 26.09 – 25.10.2026“', html.indexOf('Последните 30 дни: 26.09 – 25.10.2026') >= 0);
    ok('без суми (няма колона „Сума“)', html.indexOf('Сума') < 0);
    ok('темата: „Минуси — повтарящи се артикули — до 25.10.2026“', w.reportMinusMultiSubject(g) === 'Минуси — повтарящи се артикули — до 25.10.2026', w.reportMinusMultiSubject(g));

    const empty = w.reportMinusMultiGroup([], [GD], 3, 30, '2026-10-25');
    const eh = w.reportMinusMultiHtml(empty);
    ok('празният случай: един ред „Няма артикул с 3+ минуса за 30 дни“, без таблица', eh.indexOf('Няма артикул с 3+ минуса за 30 дни') >= 0 && eh.indexOf('mm-item') < 0 && eh.indexOf('<table style="width:100%;border-collapse') < 0);

    const rc = w.reportMinusMultiRecipients([
      { email: 't.tenev@temax.bg', minus_multi: true, active: true }, { email: 'ten.tenev@temax.bg', minus_multi: true, active: true },
      { email: 'm.pavlova@temax.bg', minus_multi: true }, { email: 'T.Tenev@temax.bg ', minus_multi: true, active: true },
      { email: 'x@temax.bg', minus_multi: false, active: true }, { email: 'y@temax.bg', minus_multi: true, active: false },
      { email: 'z@temax.bg', active: true }, { email: '', minus_multi: true }, null]);
    ok('получатели: само minus_multi=true и активните, по един път на имейл', rc.join(',') === 't.tenev@temax.bg,ten.tenev@temax.bg,m.pavlova@temax.bg', rc.join(','));

    /* Колекторът — истинската заявка през fetch. */
    const db = { settings: [{ key: 'minus_stores', value: GD + ', ' + SH }, { key: 'minus_multi_count', value: '3' }], movs: copy(REP), log: [] };
    install(h, db);
    const got = await new Promise(res => w.collectMinusMultiReportData('2026-10-25', res));
    const mq = db.log.filter(x => x.tbl === 'minus_movements').map(x => x.q)[0] || '';
    ok('заявката: само 955, двата обекта, прозорецът', /mvt_type=eq\.955/.test(mq) && mq.indexOf('store_name=in.("Гоце Делчев","Шумен")') >= 0 && /posting_date=gte\.2026-09-26/.test(mq) && /posting_date=lte\.2026-10-25/.test(mq), mq);
    ok('… и иска action и material_desc', /select=[^&]*action/.test(mq) && /select=[^&]*material_desc/.test(mq));
    ok('колекторът връща групирането (фалшивата база не филтрира — JS филтърът държи)', got && got.total === 4, got && got.total);
    const sq = db.log.filter(x => x.tbl === 'app_settings').map(x => x.q)[0] || '';
    ok('настройките: minus_stores, minus_multi_count, minus_multi_days', /minus_stores/.test(sq) && /minus_multi_count/.test(sq) && /minus_multi_days/.test(sq), sq);
    db.failMovs = true;
    const bad = await new Promise(res => w.collectMinusMultiReportData('2026-10-25', res));
    ok('непълни движения → null (без писмо)', bad === null);
    db.failMovs = false;
    db.settings = [];
    const none = await new Promise(res => w.collectMinusMultiReportData('2026-10-25', res));
    ok('без включени обекти → празно писмо, не грешка', none && none.total === 0 && none.stores.length === 0);

    /* „Тест до мен". */
    db.settings = [{ key: 'minus_stores', value: GD }];
    const sent = [];
    w.sendEmail = (to, subj, body) => { sent.push({ to, subj, body }); return Promise.resolve({ ok: true, status: 200 }); };
    w.today = () => '2026-10-28';
    let doneN = 0;
    w.sendMinusMultiReportTest('ten.tenev@temax.bg', () => { doneN++; });
    await ticks(10);
    ok('„Тест до мен“: едно писмо до натисналия, „(тест)“ в темата, неделя 25.10',
      sent.length === 1 && sent[0].to === 'ten.tenev@temax.bg' && sent[0].subj === 'Минуси — повтарящи се артикули — до 25.10.2026 (тест)' && doneN === 1,
      sent[0] && sent[0].subj);
    ok('… с артикулите на Гоце Делчев', sent[0] && sent[0].body.indexOf('70003') >= 0 && sent[0].body.indexOf('71001') < 0);
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
