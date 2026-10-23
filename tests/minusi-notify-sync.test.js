/* Минуси — известието minus_unfilled (bulletin-notify) и порталът броят
   ЕДНАКВО (23.10.2026).

   „Непопълнен" = НЕЗАКРИТ (calc.open от mnCompute) и mnUnfilled. В
   bulletin-notify стои КОПИЕ (mnuCountByStore и помощните mnu*) — порталът е
   ES5 в браузъра, функцията е Deno, общ файл няма. Този тест пуска двете
   върху едни и същи фикстури и сравнява броя по обект; и двете се сверяват и
   с ръчно сметнатите числа долу, за да не минат, ако сгрешат еднакво.

   Пуска се РЕАЛНИЯТ .ts — срез от началото на файла до края на последната
   нужна функция (техниката на notify-today-window.test.js), импортиран от
   Node 24 направо като .ts. buildMinusUnfilled и runMinusUnfilled се пускат
   срещу фалшив клиент с in / order / range — проверява се и самата заявка
   (само включените обекти, страници по 1000), и dry_run.

   Фикстури — Гоце Делчев (включен), N = 10:
     90001  955 ×5 (10.10), 956 −2 (11.10) — частично закрит, без причина → незакрит, непопълнен
     90002  955 1,005 M2, 956 −1 — остатък 0,005 под прага M2 0,01 → не е незакрит
     90003  955 0,5 „лм.“ с причина 2 — над прага ЛМ, попълнен → незакрит, попълнен
     90004  955 ×1, 956 −3 — свръхсторно, закрит → over 1
     90005  956 −1 (09.10) преди 955 ×2 (10.10), без причина → сторно преди минуса, остатък 1 → незакрит, непопълнен
     90006  955 01.10 (причина 2), 955 05.10 (причина 2, без действие) → вторият е повторение без действие → непопълнен
     90007  955 с причина 1 (requires_note) и празна бележка → непопълнен
     90008  955 с причина 1 и бележка → попълнен
     90009  955 15.10, 955 18.10 с действие → попълнени
     90010  955 01.10 и 20.10 (19 дни) с причина 2 → не е повторение при N=10, Е при N=20 (без действие)
     90011  955 10.10 и 20.10 (точно 10 дни) с причина 2, без действие → повторение → непопълнен
   Незакрити: 90001, 90003, 90005, 90006×2, 90007, 90008, 90009×2, 90010×2, 90011×2 = 13.
   Непопълнени при N=10: 90001, 90005, 90006(2-ри), 90007, 90011(2-ри) = 5; при N=20 + 90010(2-ри) = 6.
   Свръхсторно: 1 (90004).
   Шумен (включен в един от случаите): 91001 955 без причина → 1 / 1 / 0.
   Ловеч (НЕ е в minus_stores): има ред, но не влиза никъде.

   Мутационна проверка (23.10.2026) — копието в .ts, всеки вариант пуснат и паднал:
     T1 <= repeatDays → <  : пада (90011 — точно 10 дни);
     T2 прагът пренебрегнат (mnuPassThreshold → true): пада (90002);
     T3 requires_note пренебрегнат (noNote = false): пада (90007);
     T4 броят и закритите (open++ преди проверката за остатък): пада;
     T5 всички причини „искат бележка“: пада (90003, 90008…).
     T6 и невключени обекти (Ловеч) в обхвата: падат „само включените“ и заявката in(...).
   Всеки пада и на „portal = .ts“, и на „= ръчната сметка“.
   Пускане: node tests/minusi-notify-sync.test.js . */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const SRC = path.join(ROOT, 'supabase/functions/bulletin-notify/index.ts');

/* ── Срез от реалния .ts ─────────────────────────────────────────────── */
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
const REQUIRED = ['mnuCountByStore', 'buildMinusUnfilled', 'runMinusUnfilled', 'minusPushText', 'mnuParseRepeatDays', 'mnuNormUom'];
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
  /* sendPushFilters вика fetch — подменя се през globalThis.__push. */
  const out = head + '\nexport { ' + REQUIRED.join(', ') + ' };\n';
  const dir = path.join(os.tmpdir(), 'tmax-minusi-notify-sync');
  fs.mkdirSync(dir, { recursive: true });
  const tag = require('crypto').createHash('sha1').update(out).digest('hex').slice(0, 12);
  const file = path.join(dir, 'slice-' + tag + '.ts');
  fs.writeFileSync(file, out);
  return file;
}

/* ── Фикстури ────────────────────────────────────────────────────────── */
const GD = 'Гоце Делчев', SH = 'Шумен', LO = 'Ловеч';
let seq = 0;
function mv(store, material, type, qty, date, o) {
  seq++;
  return Object.assign({ id: 'm' + String(seq).padStart(4, '0'), store_name: store, plant: '5519', material: material,
    material_desc: 'ТЕСТ ' + material, mvt_type: type, qty: qty, uom: 'БР', mat_doc: 'D' + seq, doc_item: '1', doc_year: 2026,
    posting_date: '2026-' + date, reason_id: null, note: null, action: null }, o || {});
}
const MOVS = [
  mv(GD, '90001', '955', 5, '10-10'), mv(GD, '90001', '956', -2, '10-11'),
  mv(GD, '90002', '955', 1.005, '10-10', { uom: 'M2' }), mv(GD, '90002', '956', -1, '10-11', { uom: 'M2' }),
  mv(GD, '90003', '955', 0.5, '10-10', { uom: 'лм.', reason_id: 2 }),
  mv(GD, '90004', '955', 1, '10-10'), mv(GD, '90004', '956', -3, '10-11'),
  mv(GD, '90005', '956', -1, '10-09'), mv(GD, '90005', '955', 2, '10-10'),
  mv(GD, '90006', '955', 1, '10-01', { reason_id: 2 }), mv(GD, '90006', '955', 1, '10-05', { reason_id: 2, action: '  ' }),
  mv(GD, '90007', '955', 1, '10-10', { reason_id: 1, note: '' }),
  mv(GD, '90008', '955', 1, '10-10', { reason_id: 1, note: 'КЗ 1 / 10.10' }),
  mv(GD, '90009', '955', 1, '10-15', { reason_id: 2 }), mv(GD, '90009', '955', 1, '10-18', { reason_id: 2, action: 'преетикирано' }),
  mv(GD, '90010', '955', 1, '10-01', { reason_id: 2 }), mv(GD, '90010', '955', 1, '10-20', { reason_id: 2 }),
  mv(GD, '90011', '955', 1, '10-10', { reason_id: 2 }), mv(GD, '90011', '955', 1, '10-20', { reason_id: 2 }),
  mv(SH, '91001', '955', 1, '10-10'),
  mv(LO, '92001', '955', 1, '10-10')
];
const REASONS = [{ id: 1, label: 'клиентска поръчка (номер/дата)', active: true, sort: 1, requires_note: true },
  { id: 2, label: 'последна бройка, липсва код', active: true, sort: 2, requires_note: false }];
const THR = [{ uom: 'M2', min_qty: 0.01 }, { uom: 'ЛМ', min_qty: 0.01 }];
const HAND = { 10: { [GD]: { open: 13, unfilled: 5, over: 1 }, [SH]: { open: 1, unfilled: 1, over: 0 } },
  20: { [GD]: { open: 13, unfilled: 6, over: 1 }, [SH]: { open: 1, unfilled: 1, over: 0 } } };

/* ── JS страна: истинският minusi.js в jsdom ─────────────────────────── */
function jsCounts(N) {
  const h = boot({ modules: ['minusi.js'], user: { email: 'a@temax.bg', role: 'admin', store_name: 'Централен офис' }, data: {} });
  const w = h.w;
  w.mnReasons = REASONS; w.mnRepeatDays = N;
  const thr = {}; THR.forEach(t => { thr[w.mnNormUom(t.uom)] = t.min_qty; });
  const out = {};
  [GD, SH].forEach(s => {
    const c = w.mnCompute(MOVS.filter(m => m.store_name === s), thr);
    out[s] = { open: c.open.length, unfilled: c.open.filter(w.mnUnfilled).length, over: c.over.length };
  });
  h.close();
  return out;
}

/* ── Фалшив supabase клиент: select / eq / in / order / range / insert / delete / update ── */
function fakeSb(data, log) {
  const pass = (row, f) => f[0] === 'eq' ? row[f[1]] === f[2] : f[0] === 'in' ? f[2].indexOf(row[f[1]]) >= 0 : true;
  return {
    from(table) {
      const q = { table: table, filters: [], range: null, op: 'select' };
      const self = {
        select(c) { q.select = c; return self; },
        eq(c, v) { q.filters.push(['eq', c, v]); return self; },
        in(c, v) { q.filters.push(['in', c, v]); return self; },
        order() { return self; },
        range(a, b) { q.range = [a, b]; return self; },
        insert(row) { q.op = 'insert'; q.row = row; return self; },
        delete() { q.op = 'delete'; return self; },
        update(row) { q.op = 'update'; q.row = row; return self; },
        then(res, rej) {
          log.push(q);
          if (q.op === 'insert') {
            const arr = data[table] || (data[table] = []);
            const dup = arr.some(r => r.topic_key === q.row.topic_key && r.ref_key === q.row.ref_key);
            if (dup) return Promise.resolve({ error: { message: 'duplicate' } }).then(res, rej);
            arr.push(q.row); return Promise.resolve({ error: null }).then(res, rej);
          }
          if (q.op !== 'select') return Promise.resolve({ error: null }).then(res, rej);
          let rows = (data[table] || []).filter(r => q.filters.every(f => pass(r, f)));
          if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
          return Promise.resolve({ data: rows, error: null }).then(res, rej);
        },
      };
      return self;
    },
  };
}

(async function run() {
  let mod = null;
  section('1. Срез от реалния bulletin-notify/index.ts');
  try { mod = await import(pathToFileURL(buildModule()).href); ok('срезът се импортира', !!mod); }
  catch (e) { ok('срезът се импортира', false, e.message); }
  if (!mod) { report(); return; }

  section('2. Порталът и копието броят еднакво (и като ръчната сметка)');
  for (const N of [10, 20]) {
    const js = jsCounts(N);
    const thr = {}; THR.forEach(t => { thr[mod.mnuNormUom(t.uom)] = t.min_qty; });
    const ts = mod.mnuCountByStore(MOVS.filter(m => m.store_name !== LO), thr, N, ['1']);
    for (const s of [GD, SH]) {
      const a = JSON.stringify(js[s]), b = JSON.stringify(ts[s]), e = JSON.stringify(HAND[N][s]);
      ok('N=' + N + ' · ' + s + ': portal = ' + a + ', .ts = ' + b, a === b, a + ' ≠ ' + b);
      ok('N=' + N + ' · ' + s + ': = ръчната сметка ' + e, a === e && b === e, a + ' / ' + b);
    }
  }
  ok('mnuParseRepeatDays: липсва / боклук → 10, „20“ → 20', mod.mnuParseRepeatDays(undefined) === 10 && mod.mnuParseRepeatDays('x') === 10 && mod.mnuParseRepeatDays('20') === 20 && mod.mnuParseRepeatDays('0') === 10);

  section('3. buildMinusUnfilled / runMinusUnfilled срещу фалшив клиент');
  const many = [];
  for (let i = 0; i < 1500; i++) many.push(mv(GD, 'P' + i, '955', 1, '10-10', { reason_id: 2 })); /* попълнени — само за страниците */
  const mkData = (stores, repeat) => ({
    app_settings: [{ key: 'minus_stores', value: stores }].concat(repeat === undefined ? [] : [{ key: 'minus_repeat_days', value: repeat }]),
    minus_reasons: REASONS.map(r => ({ id: r.id, requires_note: r.requires_note })),
    minus_uom_thresholds: THR,
    minus_movements: MOVS.concat(many),
    notification_log: [],
  });
  const bg = { dateStr: '2026-10-23', hours: 10, minutes: 0, isoWeekday: 5 };
  let log = [];
  let data = mkData('Гоце Делчев, Шумен');
  const built = await mod.buildMinusUnfilled(fakeSb(data, log), bg);
  const e = built.entries || [];
  ok('само включените обекти (без Ловеч)', JSON.stringify(e.map(x => x.store)) === JSON.stringify([GD, SH]), JSON.stringify(e.map(x => x.store)));
  ok('заявката е с in(store_name, включените)', log.some(q => q.table === 'minus_movements' && q.filters.some(f => f[0] === 'in' && f[1] === 'store_name' && f[2].join('|') === GD + '|' + SH)));
  ok('страници по 1000: ' + log.filter(q => q.table === 'minus_movements').length + ' заявки, ' + built.rows_read + ' реда', log.filter(q => q.table === 'minus_movements').length === 2 && built.rows_read === MOVS.length - 1 + 1500, built.rows_read);
  const gd = e.find(x => x.store === GD) || {};
  ok('Гоце Делчев: N = 5 (ключът липсва → 10), незакрити 13 + 1500 попълнени', gd.n === 5 && gd.open === 1513 && gd.over === 1, JSON.stringify(gd));
  ok('ref_key = minus:<обект>:<дата>', gd.ref_key === 'minus:Гоце Делчев:2026-10-23', gd.ref_key);
  ok('текстът: „➖ Минуси: 5 непопълнени · Гоце Делчев“', mod.minusPushText(5, GD) === '➖ Минуси: 5 непопълнени · Гоце Делчев');
  const b20 = await mod.buildMinusUnfilled(fakeSb(mkData('Гоце Делчев', '20'), []), bg);
  ok('minus_repeat_days = „20“ → N = 6', (b20.entries || [])[0] && b20.entries[0].n === 6, JSON.stringify(b20.entries));
  const none = await mod.buildMinusUnfilled(fakeSb(mkData(''), []), bg);
  ok('без включени обекти → skip', !!none.skip, JSON.stringify(none));

  log = [];
  data = mkData('Гоце Делчев, Шумен, Ловеч');
  data.minus_movements = MOVS.filter(m => m.store_name !== LO); /* Ловеч включен, но с 0 */
  const dry = await mod.runMinusUnfilled(fakeSb(data, log), { key: 'minus_unfilled' }, bg, true);
  ok('dry_run: 2 получатели (Ловеч с 0 — без известие), без запис', dry.dry_run === true && dry.recipients === 2 && !log.some(q => q.op !== 'select'), JSON.stringify(dry).slice(0, 200));
  const lov = (dry.planned || []).find(p => p.obekt === LO);
  ok('dry_run: Ловеч е в плана с 0 и без текст', lov && lov.nepopalneni === 0 && lov.text === null, JSON.stringify(lov));
  const pGd = (dry.planned || []).find(p => p.obekt === GD);
  ok('dry_run: текстът за Гоце Делчев', pGd && pGd.text === '➖ Минуси: 5 непопълнени · Гоце Делчев', pGd && pGd.text);

  /* Истинско пускане: push се хваща през fetch. */
  const pushes = [];
  globalThis.fetch = async (url, init) => { pushes.push(JSON.parse(init.body)); return { ok: true, status: 200, text: async () => '', json: async () => ({}) }; };
  log = [];
  const res1 = await mod.runMinusUnfilled(fakeSb(data, log), { key: 'minus_unfilled' }, bg, false);
  ok('пускане: 2 push-а (Гоце Делчев, Шумен), по tag store_name', pushes.length === 2 && pushes.every(p => p.type === 'push' && p.filters[0].key === 'store_name') && pushes.map(p => p.filters[0].value).join('|') === GD + '|' + SH, JSON.stringify(pushes.map(p => p.filters)));
  ok('… с url към #mn и текста', pushes.every(p => /#mn$/.test(p.url)) && pushes[0].message === '➖ Минуси: 5 непопълнени · Гоце Делчев', JSON.stringify(pushes[0]));
  ok('… notification_log с ref_key за деня', data.notification_log.length === 2 && data.notification_log[0].ref_key === 'minus:Гоце Делчев:2026-10-23');
  const res2 = await mod.runMinusUnfilled(fakeSb(data, []), { key: 'minus_unfilled' }, bg, false);
  ok('второ пускане същия ден → 0 нови push-а (вече пратени)', pushes.length === 2 && res2.already_sent === 2, JSON.stringify(res2).slice(0, 160));
  ok('резултатът на първото: obekti 2', res1.obekti === 2, JSON.stringify(res1).slice(0, 160));

  report();
})().catch(e => { console.error(e); process.exit(1); });
