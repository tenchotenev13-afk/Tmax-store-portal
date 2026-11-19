/* Минуси — известието minus_unfilled (bulletin-notify v27) казва и колко
   минуса са с отворена разлика, по която ходът е на обекта (19.11.2026, сесия
   minusi-open-diff-notify; Теодор 18–19.11, стъпка 2 от 3).

   Правилото (решения на Тенчо 19.11): N = брой УНИКАЛНИ кодове с поне един
   ред 955 на обекта — ЗАКРИТ ИЛИ НЕ (както знакът в таб Минуси; случаят
   Пирдоп е закрит минус с отворена разлика) — за които обектът има
   НЕприключен ред в Разлики (sdIsClosed) с ход на обекта = А ∪ Б:
     А — sdStoreMustAct (stock-differences.js; копие в .ts от v24);
     Б — diffLineWaitsStore (shared.js) + размените (bulDiffStoreWaiting,
         bulletin.js) — стоката на път не се брои.
   В .ts стоят КОПИЯ под същите имена. Тук те се пускат срещу ИСТИНСКИТЕ
   функции на портала (jsdom: shared.js + bulletin.js + stock-differences.js)
   върху едни и същи редове, и двете — срещу ръчно очакваното.

   Пуска се РЕАЛНИЯТ .ts — срез от началото до края на последната нужна
   функция (техниката на minusi-notify-sync.test.js).

   Мутационна проверка (19.11.2026) — всеки вариант върху чистия .ts:
     M1 ход на склада се брои (mnuDiffStoreTurn → всеки неприключен ред);
     M2 приключена се брои (без sdIsClosed в mnuDiffStoreTurn И без .not в
        заявката) — L11 (received + размяна към обекта) влиза;
     M3 известието не тръгва при само N (todo = n > 0);
     M4 само незакритите (кодът влиза само при нетно 955 + 956 > 0);
     M5 по ред, не по код (всеки ред 955 се брои).
   Броят паднали — в отчета на сесията. */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const SRC = path.join(ROOT, 'supabase/functions/bulletin-notify/index.ts');
const J = JSON.stringify;

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
const REQUIRED = ['mnuCountByStore', 'buildMinusUnfilled', 'runMinusUnfilled', 'minusPushText', 'minusDetail', 'sdIsClosed',
  'diffLineWaitsStore', 'bulDiffStoreWaiting', 'mnuDiffStoreTurn', 'mnuOdCodes', 'mnuOdCount', 'mnuMinusCodes', 'mnuLoadOd', 'sdStoreMustAct', 'mnuCountByStore'];
function buildModule() {
  const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
  const missing = [];
  let end = -1;
  for (const fn of REQUIRED) {
    const s = lines.findIndex(l => new RegExp('^(?:async )?function ' + fn + '\\b').test(l));
    if (s < 0) { missing.push(fn); continue; }
    const e = endOfFn(lines, s);
    if (e > end) end = e;
  }
  if (missing.length) throw new Error('липсват във файла: ' + missing.join(', '));
  const head = lines.slice(0, end + 1).filter(l => !/^import\s/.test(l)).join('\n')
    .replace(/Deno\.env\.get\([^)]*\)!?/g, "''");
  const names = Array.from(new Set(REQUIRED));
  const out = head + '\nexport { ' + names.join(', ') + ', SD_CLOSED_STATUSES };\n';
  const dir = path.join(os.tmpdir(), 'tmax-minusi-open-diff-notify');
  fs.mkdirSync(dir, { recursive: true });
  const tag = require('crypto').createHash('sha1').update(out).digest('hex').slice(0, 12);
  const file = path.join(dir, 'slice-' + tag + '.ts');
  fs.writeFileSync(file, out);
  return file;
}

/* ── Фикстури ────────────────────────────────────────────────────────── */
const MT = 'Монтана', PE = 'Петрич', SH = 'Шумен';
const rep = (store, direction, reviewed) => ({ store_name: store, reviewed: !!reviewed, direction });
let ln = 0;
const L = (store, code, dir, reviewed, o) => Object.assign({ id: 'L' + (++ln), store_name: store, material_code: code, type: null, status: 'new',
  warehouse_response: null, store_response: null, difference_category: null, differences_reports: rep(store, dir, reviewed) }, o || {});
const LINES = [
  /* L1 */ L(MT, '98572', 'interstore', false, { warehouse_response: 'return', difference_category: 'excess' }),     /* Б → брои се */
  /* L2 */ L(MT, '91019', 'interstore', false, { difference_category: 'excess' }),                                  /* ход на склада */
  /* L3 */ L(MT, '17236', 'supplier', true, { type: 'missing', status: 'pending', difference_category: 'undelivered' }), /* при офиса */
  /* L4 */ L(MT, ' W1 ', 'supplier', true, { type: 'writein', status: 'pending' }),                                 /* А → брои се */
  /* L5 */ L(MT, 'S1', 'interstore', false, { warehouse_response: 'sent', difference_category: 'undelivered' }),     /* стока на път */
  /* L6 */ L(MT, 'C1', 'supplier', true, { type: 'writein', status: 'taken' }),                                     /* приключена */
  /* L7 */ L(MT, 'R2', 'interstore', false, { warehouse_response: 'return', store_response: 'sap_done' }),           /* ход на склада */
  /* L8 */ L(MT, 'SW1', 'interstore', false, { warehouse_response: 'sent' }),                                       /* размяна към мен → брои се */
  /* L9 */ L(SH, 'W1', 'supplier', true, { type: 'writein', status: 'pending' }),                                   /* друг обект */
  /* L10 */ L(MT, 'WB1', 'interstore', false, { warehouse_response: 'return', difference_category: 'wrong_barcode' }), /* ЦО (баркод) */
  /* L11 */ L(MT, 'RC1', 'interstore', false, { status: 'received' }),                                              /* приключена, но с размяна */
  /* L12 */ L(MT, 'Z1', 'supplier', true, { type: 'return', status: 'pending' }),                                   /* А, но минусът е закрит */
  /* L13 */ L(PE, 'P1', 'supplier', true, { type: 'return', status: 'pending' }),                                   /* само N в Петрич */
  /* L14 */ L(MT, 'CP1', 'supplier', true, { type: 'writein', status: 'completed' }),                               /* приключена */
  /* L15 */ L(MT, 'Z2', 'interstore', false, { warehouse_response: 'return' }),                                    /* Б, минусът е закрит (Пирдоп) */
  /* L16 */ L(MT, 'N956', 'supplier', true, { type: 'writein', status: 'pending' })                                /* А, но само 956 — няма минус */
];
const SWAPS = [
  { from_line_id: 'Lx', to_line_id: 'L8', from_store: 'Добрич', to_store: MT, status: 'sent' },
  { from_line_id: 'Ly', to_line_id: 'L11', from_store: 'Добрич', to_store: MT, status: 'sent' }
];
/* Очаквано по ред (за обекта на реда): ходът е на обекта и редът е неприключен. */
const HAND_TURN = { L1: true, L2: false, L3: false, L4: true, L5: false, L6: false, L7: false, L8: true, L9: true, L10: false, L11: false, L12: true, L13: true, L14: false, L15: true, L16: true };

let sq = 0;
const mv = (store, material, type, qty, o) => { sq++; return Object.assign({ id: 'm' + sq, store_name: store, material, mvt_type: type, qty, uom: 'БР',
  mat_doc: 'D' + sq, doc_item: '1', posting_date: '2026-11-1' + (sq % 9), reason_id: null, note: null, action: null }, o || {}); };
const MOVS = [
  mv(MT, '98572', '955', 1), mv(MT, '91019', '955', 1), mv(MT, '17236', '955', 1),
  mv(MT, 'W1', '955', 1), mv(MT, 'W1', '955', 1),
  mv(MT, 'S1', '955', 1), mv(MT, 'C1', '955', 1), mv(MT, 'R2', '955', 1), mv(MT, 'SW1', '955', 1),
  mv(MT, 'WB1', '955', 1), mv(MT, 'RC1', '955', 1), mv(MT, 'CP1', '955', 1),
  mv(MT, 'Z1', '955', 1), mv(MT, 'Z1', '956', -1),            /* закрит */
  mv(MT, 'Z2', '955', 2), mv(MT, 'Z2', '956', -2),            /* закрит */
  mv(MT, 'N956', '956', -1),                                   /* само сторно */
  mv(PE, 'P1', '955', 1, { reason_id: 2 }),                    /* попълнен → n = 0, N = 1 */
  mv(SH, 'Q1', '955', 1, { reason_id: 2 })                     /* Шумен: нищо */
];
/* Монтана: N = кодовете 98572, W1, SW1, Z1, Z2 = 5 (W1 с два реда — веднъж; Z1 и Z2 —
   закрити; N956 — само 956); по старото „незакрити редове“ щеше да е 4, по ред — 6.
   Непопълнени — 12 (всички незакрити без причина). */

function fakeSb(data, log, fail) {
  const pass = (row, f) => {
    if (f[0] === 'eq') return row[f[1]] === f[2];
    if (f[0] === 'in') return f[2].indexOf(row[f[1]]) >= 0;
    if (f[0] === 'not' && f[2] === 'in') return String(f[3]).replace(/^\(|\)$/g, '').split(',').indexOf(String(row[f[1]])) < 0;
    return true;
  };
  return {
    from(table) {
      const q = { table, filters: [], range: null, op: 'select' };
      const self = {
        select(c) { q.select = c; return self; },
        eq(c, v) { q.filters.push(['eq', c, v]); return self; },
        in(c, v) { q.filters.push(['in', c, v]); return self; },
        not(c, op, v) { q.filters.push(['not', c, op, v]); return self; },
        order() { return self; },
        range(a, b) { q.range = [a, b]; return self; },
        insert(row) { q.op = 'insert'; q.row = row; return self; },
        delete() { q.op = 'delete'; return self; },
        update(row) { q.op = 'update'; q.row = row; return self; },
        then(res, rej) {
          log.push(q);
          if (fail && fail[table] && q.op === 'select') return Promise.resolve({ data: null, error: { message: 'boom' } }).then(res, rej);
          if (q.op === 'insert') {
            const arr = data[table] || (data[table] = []);
            if (arr.some(r => r.topic_key === q.row.topic_key && r.ref_key === q.row.ref_key)) return Promise.resolve({ error: { message: 'duplicate' } }).then(res, rej);
            arr.push(q.row); return Promise.resolve({ error: null }).then(res, rej);
          }
          if (q.op !== 'select') return Promise.resolve({ error: null }).then(res, rej);
          let rows = (data[table] || []).filter(r => q.filters.every(f => pass(r, f)));
          if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
          return Promise.resolve({ data: JSON.parse(JSON.stringify(rows)), error: null }).then(res, rej);
        },
      };
      return self;
    },
  };
}
const mkData = () => ({
  app_settings: [{ key: 'minus_stores', value: MT + ', ' + PE + ', ' + SH }],
  minus_reasons: [{ id: 1, requires_note: true }, { id: 2, requires_note: false }],
  minus_uom_thresholds: [],
  minus_movements: MOVS.map(m => Object.assign({}, m)),
  stock_differences: LINES.map(l => JSON.parse(JSON.stringify(l))),
  stock_diff_swaps: SWAPS.map(s => Object.assign({}, s)),
  notification_log: [],
});
const bg = { dateStr: '2026-11-20', hours: 10, minutes: 0, isoWeekday: 4, weekdayIdx: 3 };

(async function run() {
  let mod = null;
  section('1. Срез от реалния bulletin-notify/index.ts');
  try { mod = await import(pathToFileURL(buildModule()).href); ok('срезът се импортира', !!mod); }
  catch (e) { ok('срезът се импортира', false, e.message); }
  if (!mod) { report(); return; }

  section('2. Копията = порталът (shared.js + bulletin.js + stock-differences.js)');
  {
    const h = boot({ modules: ['bulletin.js', 'stock-returns.js', 'stock-differences.js'], user: { email: 'a@temax.bg', role: 'admin', store_name: 'Централен офис' }, data: {} });
    const w = h.w;
    ok('SD_CLOSED_STATUSES — същият списък', J(mod.SD_CLOSED_STATUSES) === J(w.SD_CLOSED_STATUSES), J(mod.SD_CLOSED_STATUSES) + ' / ' + J(w.SD_CLOSED_STATUSES));
    const sts = ['new', 'pending', 'received', 'taken', 'capitalized', 'completed', null];
    ok('sdIsClosed — еднакво за всеки статус', sts.every(s => mod.sdIsClosed({ status: s }) === w.sdIsClosed({ status: s })));
    ok('diffLineWaitsStore — еднакво за всеки ред', LINES.every(l => mod.diffLineWaitsStore(l) === w.diffLineWaitsStore(l)), J(LINES.map(l => [l.id, mod.diffLineWaitsStore(l), w.diffLineWaitsStore(l)])));
    ok('sdStoreMustAct — еднакво за всеки ред', LINES.every(l => mod.sdStoreMustAct(l) === w.sdStoreMustAct(l)));
    ok('bulDiffStoreWaiting — същите id-та за Монтана', J(mod.bulDiffStoreWaiting(LINES, SWAPS, MT).map(l => l.id)) === J(w.bulDiffStoreWaiting(LINES, SWAPS, MT).map(l => l.id)), J(w.bulDiffStoreWaiting(LINES, SWAPS, MT).map(l => l.id)));
    const portalTurn = l => !w.sdIsClosed(l) && (w.sdStoreMustAct(l) || w.bulDiffStoreWaiting([l], SWAPS, l.store_name).length > 0);
    const got = {}, gotP = {};
    LINES.forEach(l => { got[l.id] = mod.mnuDiffStoreTurn(l, SWAPS, l.store_name); gotP[l.id] = portalTurn(l); });
    ok('ходът на обекта (А ∪ Б, неприключен): .ts = порталът', J(got) === J(gotP), J(got) + ' / ' + J(gotP));
    ok('… = ръчното очакване', J(got) === J(HAND_TURN), J(got));
    ok('ред за ДРУГ обект не е ход на Монтана', mod.mnuDiffStoreTurn(LINES[8], SWAPS, MT) === false);
    h.close();
  }

  section('3. Текстът');
  ok('само непопълнени — както преди v27', mod.minusPushText(5, MT) === '➖ Минуси: 5 непопълнени · Монтана' && mod.minusPushText(5, MT, 0) === '➖ Минуси: 5 непопълнени · Монтана');
  ok('непопълнени + N', mod.minusPushText(3, MT, 2) === '➖ Минуси: 3 непопълнени · 2 минуса с отворена разлика · Монтана', mod.minusPushText(3, MT, 2));
  ok('само N = 1 — „1 минус“', mod.minusPushText(0, PE, 1) === '➖ Минуси: 1 минус с отворена разлика · Петрич', mod.minusPushText(0, PE, 1));
  ok('detail без „➖ Минуси:“', mod.minusDetail(0, PE, 1) === '1 минус с отворена разлика · Петрич' && mod.minusDetail(4, MT) === '4 непопълнени · Монтана');

  section('3б. Кодовете с минус — закрити и незакрити, по код');
  {
    const mc = mod.mnuMinusCodes(MOVS);
    ok('закрит минус (Z1, Z2) е в кодовете', mc[MT].Z1 === 1 && mc[MT].Z2 === 1);
    ok('код само с 956 (N956) не е', !mc[MT].N956);
    ok('код с два реда 955 (W1) — веднъж', mc[MT].W1 === 1);
    const codes = mod.mnuOdCodes(LINES, SWAPS, [MT, PE, SH]);
    ok('закрит минус + отворена разлика с ход на обекта → брои се (Z2, Б)', !!codes[MT].Z2 && mod.mnuOdCount(mc, { [MT]: { Z2: 1 } }, MT) === 1);
    ok('N за Монтана = 5 (98572, W1, SW1, Z1, Z2)', mod.mnuOdCount(mc, codes, MT) === 5, mod.mnuOdCount(mc, codes, MT));
  }

  section('4. dry_run — броят по обект');
  {
    const log = [];
    const dry = await mod.runMinusUnfilled(fakeSb(mkData(), log), { key: 'minus_unfilled' }, bg, true);
    const p = s => (dry.planned || []).find(x => x.obekt === s) || {};
    ok('Монтана: 12 непопълнени, N = 5 (по код, вкл. закритите)', p(MT).nepopalneni === 12 && p(MT).otvoreni_razliki === 5, J(p(MT)));
    ok('Монтана: текстът', p(MT).text === '➖ Минуси: 12 непопълнени · 5 минуса с отворена разлика · Монтана', p(MT).text);
    ok('Петрич: 0 непопълнени, N = 1 → известие само с N', p(PE).nepopalneni === 0 && p(PE).otvoreni_razliki === 1 && p(PE).text === '➖ Минуси: 1 минус с отворена разлика · Петрич', J(p(PE)));
    ok('Шумен: 0 / 0 → без известие (разликата W1 е без минус там)', p(SH).nepopalneni === 0 && p(SH).otvoreni_razliki === 0 && p(SH).text === null, J(p(SH)));
    ok('получатели: 2 (Монтана, Петрич)', dry.recipients === 2, dry.recipients);
    ok('без запис при dry_run', !log.some(q => q.op !== 'select'));
    const sd = log.filter(q => q.table === 'stock_differences');
    ok('заявката: само включените обекти, без приключените (not in)', sd.length === 1 && sd[0].filters.some(f => f[0] === 'in' && f[1] === 'store_name' && f[2].join('|') === [MT, PE, SH].join('|')) &&
      sd[0].filters.some(f => f[0] === 'not' && f[1] === 'status' && f[2] === 'in' && f[3] === '(received,taken,capitalized,completed)'), J(sd.map(q => q.filters)));
    ok('od_error = null', dry.od_error === null);
    const b = await mod.buildMinusUnfilled(fakeSb(mkData(), []), bg);
    ok('buildMinusUnfilled: n (за авто-отметката) — непроменен, без N', J(b.entries.map(e => [e.store, e.n])) === J([[MT, 12], [PE, 0], [SH, 0]]) && b.entries.every(e => !('od' in e)), J(b.entries));
  }

  section('5. Истинско пускане: push и notification_log');
  {
    const pushes = [];
    globalThis.fetch = async (url, init) => { pushes.push(JSON.parse(init.body)); return { ok: true, status: 200, text: async () => '', json: async () => ({}) }; };
    const data = mkData();
    const res = await mod.runMinusUnfilled(fakeSb(data, []), { key: 'minus_unfilled' }, bg, false);
    ok('2 push-а: Монтана и Петрич', pushes.length === 2 && pushes.map(p => p.filters[0].value).join('|') === MT + '|' + PE, J(pushes.map(p => p.filters)));
    ok('Петрич (само N) — текстът в push-а', pushes[1] && pushes[1].message === '➖ Минуси: 1 минус с отворена разлика · Петрич', pushes[1] && pushes[1].message);
    ok('notification_log.detail — същият текст', J(data.notification_log.map(r => r.detail)) === J(['12 непопълнени · 5 минуса с отворена разлика · Монтана', '1 минус с отворена разлика · Петрич']), J(data.notification_log.map(r => r.detail)));
    ok('резултат: obekti 2', res.obekti === 2, J(res).slice(0, 200));
  }

  section('6. Разликите не се заредиха → известието тръгва без N');
  {
    const data = mkData();
    const dry = await mod.runMinusUnfilled(fakeSb(data, [], { stock_differences: true }), { key: 'minus_unfilled' }, bg, true);
    const p = s => (dry.planned || []).find(x => x.obekt === s) || {};
    ok('od_error е попълнен', /stock_differences/.test(dry.od_error || ''), dry.od_error);
    ok('Монтана: само непопълнените, N = 0', p(MT).text === '➖ Минуси: 12 непопълнени · Монтана' && p(MT).otvoreni_razliki === 0, J(p(MT)));
    ok('Петрич: без известие (без N няма какво да каже)', p(PE).text === null && dry.recipients === 1, J(p(PE)));
    const dry2 = await mod.runMinusUnfilled(fakeSb(mkData(), [], { stock_diff_swaps: true }), { key: 'minus_unfilled' }, bg, true);
    ok('паднали размени → също без N', /stock_diff_swaps/.test(dry2.od_error || '') && dry2.recipients === 1, dry2.od_error);
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
