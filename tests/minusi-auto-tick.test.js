/* Минуси, етап 5а — автоматична отметка на „СПРАВКА МИНУСИ" (29.10.2026).

   Повод: Миглена 29.10. Решения на Тенчо 29.10:
   · денят D е изпълнен, когато обектът няма незакрит непопълнен минус (броят
     на buildMinusUnfilled — същото като известието minus_unfilled) СЛЕД
     първото качване в minus_uploads за D (по българско време);
   · без качване на D — при всяко пускане на крона от due_time (20:00) до
     края на деня (23:59 София); с качване — от качването до края на деня
     (решение на Тенчо 29.10, второ — до него беше само [20:00; 20:15));
   · предишен ден не се отмята — completion_date е винаги днешният;
   · отметка не се маха; съществуващ ред за деня не се пипа;
   · включените обекти (minus_stores) НЕ отмятат ръчно — вместо квадратчето
     „⏳ N непопълнени" + „Отвори →" към Минуси; невключените — ръчно.

   ЧАСТ А пуска РЕАЛНИЯ bulletin-notify/index.ts — срез до края на
   runMinusAutoTick (техниката на minusi-notify-sync.test.js), с реалния
   bgNow върху моменти по София. Данните са с формата от базата към 29.10:
   в recurring_tasks linked_module е NULL, 'minusi' идва от
   recurring_task_versions (ГД — само Гоце Делчев; общата — 17 обекта без ГД).

   ЧАСТ Б — jsdom за Бюлетина (bulletin.js + minusi.js, реален ред).

   Мутационна проверка (29.10.2026) — всеки вариант пуснат срещу .ts/.js:
     M1 условието „unfilled > 0" махнато (mnuTickDecide): пада 2.3;
     M2 горна граница на прозореца (+15 мин, старото правило): пада 2.4 „20:15“ / „20:05 след попълване“;
     M2b долната граница махната (due_time пренебрегнат): пада 2.4 „19:45“ / „19:59“;
     M3 качването не по българско време (slice(0,10) на UTC низа): пада 2.6;
     M4 съществуващият ред не се проверява: пада 2.5 (втори ред / отложеното);
     M5 storeOn махнат от регистъра: пада Б.2 (невключеният е заключен);
     M6 target_stores пренебрегнат: пада 2.2 (ГД по общата задача).
     M7 стъпката след темите в Deno.serve: пада 2.10.
     M4b съществуващият ред не се гледа при подбора на кандидати (само при
         записа): пада 2.5 „движенията не се четат".
   Пускане: node tests/minusi-auto-tick.test.js . */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick } = H;

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
const REQUIRED = ['runMinusAutoTick', 'mnuTickDecide', 'bgNow'];
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
  const out = head + '\nexport { ' + REQUIRED.join(', ') + ' };\n';
  const dir = path.join(os.tmpdir(), 'tmax-minusi-auto-tick');
  fs.mkdirSync(dir, { recursive: true });
  const tag = require('crypto').createHash('sha1').update(out).digest('hex').slice(0, 12);
  const file = path.join(dir, 'slice-' + tag + '.ts');
  fs.writeFileSync(file, out);
  return file;
}

/* ── Фалшив supabase клиент ──────────────────────────────────────────── */
function fakeSb(data, log, failTables) {
  const pass = (row, f) => f[0] === 'eq' ? row[f[1]] === f[2]
    : f[0] === 'in' ? f[2].indexOf(row[f[1]]) >= 0
    : f[0] === 'gte' ? String(row[f[1]]) >= String(f[2]) : true;
  return {
    from(table) {
      const q = { table: table, filters: [], range: null, op: 'select' };
      const self = {
        select(c) { q.select = c; return self; },
        eq(c, v) { q.filters.push(['eq', c, v]); return self; },
        in(c, v) { q.filters.push(['in', c, v]); return self; },
        gte(c, v) { q.filters.push(['gte', c, v]); return self; },
        order() { return self; },
        range(a, b) { q.range = [a, b]; return self; },
        insert(row) { q.op = 'insert'; q.row = row; return self; },
        delete() { q.op = 'delete'; return self; },
        update(row) { q.op = 'update'; q.row = row; return self; },
        then(res, rej) {
          log.push(q);
          if (failTables && failTables.indexOf(table) >= 0) return Promise.resolve({ data: null, error: { message: 'boom ' + table } }).then(res, rej);
          if (q.op === 'insert') {
            const arr = data[table] || (data[table] = []);
            if (table === 'task_completions' && arr.some(r => r.recurring_task_id === q.row.recurring_task_id && r.store_name === q.row.store_name && r.completion_date === q.row.completion_date)) {
              return Promise.resolve({ error: { message: 'duplicate key value violates unique constraint', code: '23505' } }).then(res, rej);
            }
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

/* ── Данни с формата от базата към 29.10.2026 ────────────────────────── */
const GD = 'Гоце Делчев', MO = 'Монтана', SH = 'Шумен';
const T_GD = '5a4e0562-619a-4dc4-bd02-5b111d73b5db', T_ALL = '03c44560-9572-4274-ad53-5228d61b4de7';
const BASE_TASKS = [
  { id: T_GD, title: 'СПРАВКА МИНУСИ', department: 'admin', task_type: 'info', active: true, due_weekday: 0, due_weekdays: [0, 1, 2, 3, 4], due_time: '20:00', due_window: false, target_stores: [GD], linked_module: null },
  { id: T_ALL, title: 'СПРАВКА МИНУСИ', department: 'admin', task_type: 'comment', active: true, due_weekday: 0, due_weekdays: [0, 1, 2, 3, 4], due_time: '20:00', due_window: false, target_stores: null, linked_module: null },
  { id: 'other', title: 'Друга', department: 'admin', task_type: 'info', active: true, due_weekdays: [0, 1, 2, 3, 4], due_time: '20:00', target_stores: null, linked_module: 'stock-diff' },
];
function ver(id, stores, over) {
  return Object.assign({ id: 'v-' + id.slice(0, 4), recurring_task_id: id, from_monday: '2026-10-26', to_monday: null, title: 'СПРАВКА МИНУСИ',
    description: '', due_weekday: 0, due_weekdays: [0, 1, 2, 3, 4], due_window: false, due_time: '20:00',
    task_type: id === T_GD ? 'info' : 'comment', department: 'admin', target_stores: stores, report_groups: null, linked_module: 'minusi' }, over || {});
}
const VERSIONS = [ver(T_GD, [GD]), ver(T_ALL, ['Враца', MO, SH, 'Троян'])];
let seq = 0;
function mv(store, material, o) {
  seq++;
  return Object.assign({ id: 'm' + String(seq).padStart(4, '0'), store_name: store, material: material, mvt_type: '955', qty: 1, uom: 'БР',
    mat_doc: 'D' + seq, doc_item: '1', posting_date: '2026-10-28', reason_id: null, note: null, action: null }, o || {});
}
const FILLED_GD = [mv(GD, '1', { reason_id: 2 }), mv(GD, '2', { reason_id: 2 })];
const ONE_OPEN_GD = [mv(GD, '1', { reason_id: 2 }), mv(GD, '3')];
const UP_TODAY = [{ uploaded_at: '2026-10-28T06:44:00+00:00' }, { uploaded_at: '2026-10-29T07:04:00+00:00' }]; /* 09:04 София */
const UP_YDAY = [{ uploaded_at: '2026-10-28T06:44:00+00:00' }];
function mkData(o) {
  o = o || {};
  return {
    app_settings: [{ key: 'minus_stores', value: 'Гоце Делчев,Монтана' }],
    minus_reasons: [{ id: 1, requires_note: true }, { id: 2, requires_note: false }],
    minus_uom_thresholds: [],
    minus_movements: o.movs || FILLED_GD,
    minus_uploads: o.uploads || UP_TODAY,
    recurring_tasks: BASE_TASKS, recurring_task_periods: [],
    recurring_task_versions: o.versions || VERSIONS,
    recurring_task_skips: o.skips || [],
    task_completions: o.comps ? o.comps.slice() : [],
  };
}
/* Момент по София (29.10 е след смяната на часа → UTC+2). */
const at = (d, hm) => new Date(d + 'T' + hm + ':00+02:00');

(async function run() {
  let mod = null;
  section('А1. Срез от реалния bulletin-notify/index.ts');
  try { mod = await import(pathToFileURL(buildModule()).href); ok('срезът се импортира', !!mod); }
  catch (e) { ok('срезът се импортира', false, e.message); }
  if (!mod) { report(); return; }
  const tick = async (data, when, dry, fail) => {
    const log = [];
    const res = await mod.runMinusAutoTick(fakeSb(data, log, fail), mod.bgNow(when), !!dry);
    return { res, log, rows: data.task_completions.filter(r => r.completed_by === 'auto:minusi') };
  };
  const pair = r => (r.recurring_task_id === T_GD ? 'ГД-задача' : 'обща') + ':' + r.store_name;

  section('2.1 Преди качване на D (10:00, качване само вчера) → няма отметка, движенията не се четат');
  {
    const d = mkData({ uploads: UP_YDAY });
    const r = await tick(d, at('2026-10-29', '10:00'));
    ok('0 отметки', r.rows.length === 0, JSON.stringify(r.res).slice(0, 300));
    ok('minus_movements не е четен (евтините проверки първо)', !r.log.some(q => q.table === 'minus_movements'));
    ok('решението е „чака качване"', (r.res.planned || []).every(p => p.reshenie === 'chaka_kachvane'), JSON.stringify(r.res.planned));
  }

  section('2.2 След качване и 0 непопълнени → по една отметка, всяка задача за своите обекти');
  {
    const d = mkData();
    const r = await tick(d, at('2026-10-29', '09:15'));
    const got = r.rows.map(pair).sort().join(' | ');
    ok('ГД по ГД-задачата, Монтана по общата — и нищо друго', got === 'ГД-задача:Гоце Делчев | обща:Монтана', got);
    ok('Шумен (в общата, но НЕ в minus_stores) — нищо', !r.rows.some(x => x.store_name === SH));
    ok('ГД НЕ е отметнат по общата задача (не е в target_stores ѝ)', !r.rows.some(x => x.recurring_task_id === T_ALL && x.store_name === GD));
    const row = r.rows[0] || {};
    ok('полетата: completed_by auto:minusi, status done, completion_date D, completed_at',
      row.completed_by === 'auto:minusi' && row.status === 'done' && row.completion_date === '2026-10-29' && !!row.completed_at && !('task_id' in row), JSON.stringify(row));
    ok('резултатът: ticked 2, failed 0', r.res.ticked === 2 && r.res.failed === 0, JSON.stringify(r.res).slice(0, 200));
    const r2 = await tick(d, at('2026-10-29', '09:30'));
    ok('второ пускане → без втори ред', r2.rows.length === 2 && r2.res.ticked === 0, JSON.stringify(r2.res).slice(0, 200));
  }

  section('2.3 След качване и 1 непопълнен в ГД → ГД без отметка, Монтана с');
  {
    const d = mkData({ movs: ONE_OPEN_GD });
    const r = await tick(d, at('2026-10-29', '12:00'));
    ok('само Монтана', r.rows.map(pair).join('|') === 'обща:Монтана', r.rows.map(pair).join('|'));
    const pGd = (r.res.planned || []).find(p => p.obekt === GD) || {};
    ok('планът за ГД: 1 непопълнен, „nepopalneni"', pGd.nepopalneni === 1 && pGd.reshenie === 'nepopalneni', JSON.stringify(pGd));
    /* Попълни го — следващото пускане отмята. */
    d.minus_movements = d.minus_movements.map(m => m.material === '3' ? Object.assign({}, m, { reason_id: 2 }) : m);
    const r2 = await tick(d, at('2026-10-29', '16:15'));
    ok('след попълване — следващият крон отмята ГД', r2.rows.some(x => x.store_name === GD), r2.rows.map(pair).join('|'));
  }

  section('2.4 Без качване на D — от 20:00 до края на деня');
  {
    for (const [hm, exp] of [['19:45', 0], ['19:59', 0], ['20:00', 2], ['20:15', 2], ['21:30', 2], ['23:59', 2]]) {
      const d = mkData({ uploads: UP_YDAY });
      const r = await tick(d, at('2026-10-29', hm));
      ok(hm + ' → ' + exp + ' отметки', r.rows.length === exp, r.rows.map(pair).join('|') + ' ' + JSON.stringify((r.res.planned || []).map(p => p.reshenie)));
    }
    const d = mkData({ uploads: UP_YDAY, movs: ONE_OPEN_GD });
    const r = await tick(d, at('2026-10-29', '20:00'));
    ok('20:00 с 1 непопълнен в ГД → само Монтана', r.rows.map(pair).join('|') === 'обща:Монтана', r.rows.map(pair).join('|'));
    /* Попълнено в 20:05 → кронът в 20:15 отмята ГД. */
    d.minus_movements = d.minus_movements.map(m => m.material === '3' ? Object.assign({}, m, { reason_id: 2 }) : m);
    const r2 = await tick(d, at('2026-10-29', '20:15'));
    ok('попълнено в 20:05 → отметка в 20:15 (ГД)', r2.rows.some(x => x.store_name === GD && x.completion_date === '2026-10-29'), r2.rows.map(pair).join('|'));
    ok('… без втори ред за Монтана', r2.rows.filter(x => x.store_name === MO).length === 1);
    /* Следващият ден не отмята предишния. */
    const d3 = mkData({ uploads: UP_YDAY, movs: ONE_OPEN_GD });
    await tick(d3, at('2026-10-29', '23:59'));
    ok('23:59 с 1 непопълнен в ГД → ГД без отметка за 29.10', !d3.task_completions.some(x => x.store_name === GD));
    d3.minus_movements = d3.minus_movements.map(m => m.material === '3' ? Object.assign({}, m, { reason_id: 2 }) : m);
    const r4 = await tick(d3, at('2026-10-30', '00:05'));
    ok('попълнено след полунощ → в 00:05 на 30.10 НЕ се отмята 29.10', !d3.task_completions.some(x => x.store_name === GD && x.completion_date === '2026-10-29'), JSON.stringify(d3.task_completions.map(x => x.store_name + '@' + x.completion_date)));
    ok('… и 30.10 преди 20:00 без качване — още не', r4.rows.filter(x => x.completion_date === '2026-10-30').length === 0, JSON.stringify((r4.res.planned || []).map(p => p.reshenie)));
    const r5 = await tick(d3, at('2026-10-30', '20:00'));
    ok('… 30.10 в 20:00 → отметка с completion_date 30.10', r5.rows.some(x => x.store_name === GD && x.completion_date === '2026-10-30'), r5.rows.map(x => x.store_name + '@' + x.completion_date).join('|'));
  }

  section('2.5 Вече има ред за деня → не се пипа');
  {
    const comps = [
      { recurring_task_id: T_GD, store_name: GD, completion_date: '2026-10-29', status: 'done', completed_by: 'Управител Гоце Делчев' },
      { recurring_task_id: T_ALL, store_name: MO, completion_date: '2026-10-29', status: 'postponed', postponed_to: '2026-10-30', completed_by: 'Склад Монтана' },
    ];
    const d = mkData({ comps: comps });
    const r = await tick(d, at('2026-10-29', '10:00'));
    ok('0 нови редове', d.task_completions.length === 2 && r.rows.length === 0, JSON.stringify(d.task_completions.map(pair)));
    ok('без insert изобщо', !r.log.some(q => q.op === 'insert'));
    ok('и движенията не се четат (няма кандидат)', !r.log.some(q => q.table === 'minus_movements'));
    ok('планът казва „вече има ред"', (r.res.planned || []).every(p => /^veche_ima_red:/.test(p.reshenie)), JSON.stringify((r.res.planned || []).map(p => p.reshenie)));
    /* Ред, вмъкнат между четенето и записа → дубликат, не грешка. */
    const d2 = mkData();
    const sb = fakeSb(d2, []);
    const orig = sb.from.bind(sb);
    let raced = false;
    sb.from = t => {
      const q = orig(t);
      if (t === 'task_completions' && !raced) {
        const oi = q.insert;
        q.insert = row => { raced = true; d2.task_completions.push(Object.assign({}, row, { completed_by: 'ръчно' })); return oi(row); };
      }
      return q;
    };
    const rr = await mod.runMinusAutoTick(sb, mod.bgNow(at('2026-10-29', '10:00')), false);
    ok('надбягване → failed 0 (дубликатът не е грешка)', rr.failed === 0 && rr.ticked === 1, JSON.stringify(rr).slice(0, 200));
  }

  section('2.6 Качването се сверява по БЪЛГАРСКО време');
  {
    let d = mkData({ uploads: [{ uploaded_at: '2026-10-28T22:30:00+00:00' }] }); /* 00:30 София, 29.10 */
    let r = await tick(d, at('2026-10-29', '10:00'));
    ok('22:30 UTC на 28.10 = 00:30 на 29.10 София → брои се за днес', r.rows.length === 2, JSON.stringify(r.res.first_upload));
    d = mkData({ uploads: [{ uploaded_at: '2026-10-28T21:30:00+00:00' }] }); /* 23:30 София, 28.10 */
    r = await tick(d, at('2026-10-29', '10:00'));
    ok('21:30 UTC на 28.10 = 23:30 на 28.10 София → НЕ е днес', r.rows.length === 0, JSON.stringify(r.res.first_upload));
  }

  section('2.7 Уикенд, ден извън due_weekdays, изключена седмица, невключен обект');
  {
    let d = mkData({ uploads: [{ uploaded_at: '2026-10-31T07:00:00+00:00' }] });
    let r = await tick(d, at('2026-10-31', '10:00'));
    ok('събота → нищо', r.rows.length === 0 && !!r.res.skipped, JSON.stringify(r.res));
    d = mkData({ versions: [ver(T_GD, [GD], { due_weekdays: [0, 2] }), ver(T_ALL, [MO], { due_weekdays: [0, 2] })] });
    r = await tick(d, at('2026-10-29', '10:00'));
    ok('четвъртък при due_weekdays Пон+Сря → нищо', r.rows.length === 0, JSON.stringify(r.res).slice(0, 200));
    d = mkData({ skips: [{ recurring_task_id: T_GD, store_name: GD, year: 2026, week_number: 44 }] });
    r = await tick(d, at('2026-10-29', '10:00'));
    ok('изключена за ГД тази седмица → само Монтана', r.rows.map(pair).join('|') === 'обща:Монтана', r.rows.map(pair).join('|'));
    d = mkData();
    d.app_settings = [{ key: 'minus_stores', value: 'Монтана' }];
    r = await tick(d, at('2026-10-29', '10:00'));
    ok('ГД извън minus_stores → само Монтана', r.rows.map(pair).join('|') === 'обща:Монтана', r.rows.map(pair).join('|'));
    d = mkData({ versions: [] });
    r = await tick(d, at('2026-10-29', '10:00'));
    ok('без версиите (linked_module NULL в recurring_tasks) → нищо', r.rows.length === 0);
  }

  section('2.8 dry_run и грешки при четене');
  {
    let d = mkData();
    let r = await tick(d, at('2026-10-29', '10:00'), true);
    ok('dry_run: would_tick 2, без нито един запис', r.res.dry_run === true && r.res.would_tick === 2 && r.rows.length === 0 && !r.log.some(q => q.op !== 'select'), JSON.stringify(r.res).slice(0, 300));
    ok('dry_run: планът носи обект, задача, брой и решение', (r.res.planned || []).some(p => p.obekt === GD && p.nepopalneni === 0 && p.reshenie === 'tick' && p.task_id === T_GD));
    for (const t of ['minus_movements', 'task_completions', 'minus_uploads', 'recurring_task_versions', 'app_settings']) {
      d = mkData();
      r = await tick(d, at('2026-10-29', '10:00'), false, [t]);
      ok('грешка в ' + t + ' → 0 отметки и error', r.rows.length === 0 && !!r.res.error && !r.log.some(q => q.op === 'insert'), JSON.stringify(r.res).slice(0, 160));
    }
  }

  section('2.10 В крона стъпката тече ПРЕДИ темите (deadline_passed чете отметката)');
  {
    const src = fs.readFileSync(SRC, 'utf8');
    const serve = src.slice(src.indexOf('Deno.serve('));
    const iTick = serve.indexOf('await runMinusAutoTick(supabase, bg, dryRun)', serve.indexOf('notification_topics'));
    const iTopics = serve.indexOf('results.push(await runTopic(supabase, t, bg, dryRun))');
    ok('в планирания клон runMinusAutoTick е преди runTopic', iTick > 0 && iTopics > 0 && iTick < iTopics, iTick + ' / ' + iTopics);
  }

  section('2.9 mnuTickDecide — граници');
  {
    const D = (o) => mod.mnuTickDecide(Object.assign({ unfilled: 0, uploadedToday: false, dueMin: 1200, nowMin: 1200 }, o));
    ok('1199 → чака', D({ nowMin: 1199 }) === 'chaka_kachvane');
    ok('1200 → tick', D({}) === 'tick');
    ok('1215 → tick', D({ nowMin: 1215 }) === 'tick');
    ok('1439 (23:59) → tick', D({ nowMin: 1439 }) === 'tick');
    ok('без due_time и без качване → чака', D({ dueMin: null }) === 'chaka_kachvane');
    ok('с качване, 08:00 → tick', D({ uploadedToday: true, nowMin: 480 }) === 'tick');
    ok('с качване, 1 непопълнен → не', D({ uploadedToday: true, unfilled: 1 }) === 'nepopalneni');
  }

  /* ═══ ЧАСТ Б — Бюлетинът (jsdom) ═══════════════════════════════════════ */
  const ANCHOR = (function () { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7))); return d; })();
  const p2 = n => String(n).padStart(2, '0');
  const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const MON = (function () { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() - 2); return isoOf(d); })();
  function isoWeekYear(d) { const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); return t.getFullYear(); }
  function freezeDate(w) {
    const Real = w.Date, ms = ANCHOR.getTime();
    class F extends Real { constructor(...a) { if (!a.length) super(ms); else super(...a); } static now() { return ms; } }
    w.Date = F;
  }
  function settingsFor(url) {
    const all = [{ key: 'minus_stores', value: 'Гоце Делчев,Монтана' }];
    const u = decodeURIComponent(String(url));
    const eq = u.match(/key=eq\.([A-Za-z_]+)/), inn = u.match(/key=in\.\(([^)]*)\)/);
    if (eq) return all.filter(r => r.key === eq[1]);
    if (inn) { const ks = inn[1].split(','); return all.filter(r => ks.indexOf(r.key) >= 0); }
    return all;
  }
  async function settle(cond, max) { for (let i = 0; i < (max || 120); i++) { if (cond()) return true; await ticks(); } return cond(); }
  async function bul(store, movs) {
    const h = boot({
      modules: ['bulletin.js', 'today.js', 'report.js', 'minusi.js'],
      user: { email: 'm@temax.bg', display_name: 'Управител ' + store, role: 'manager', store_name: store },
      data: {
        app_settings: settingsFor,
        users: [{ store_name: store }], stores: [{ name: store }],
        recurring_tasks: BASE_TASKS.slice(0, 2), recurring_task_periods: [], recurring_task_skips: [],
        recurring_task_versions: [ver(T_GD, [GD], { from_monday: MON }), ver(T_ALL, [MO, SH], { from_monday: MON })],
        bulletins: () => [{ id: 'b-1', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published', created_at: MON,
          content: { calendar: (function () { const c = {}; h.w.DKEYS.forEach(k => { c[k] = []; }); return c; })(), columns: { trade: [], warehouse: [], admin: [] } } }],
        bulletin_tasks: [], task_completions: [],
        minus_reasons: [{ id: 2, label: 'последна бройка', active: true, sort: 1, requires_note: false }],
        minus_uom_thresholds: [], minus_plants: [], minus_uploads: [],
        minus_movements: () => movs.filter(m => m.store_name === store).map(m => Object.assign({ plant: '1', material_desc: 'Т', doc_year: 2026, real_code: null, employee_name: null, filled_by: null, filled_at: null }, m)),
        stock_returns: [], goods_transit: [], bulletin_promotions: [], task_subtasks: [], subtask_completions: [],
        notification_schedules: [], report_snapshots: [], client_orders: [], stock_differences: [], stock_diff_swaps: []
      }
    });
    freezeDate(h.w);
    h.w.bulSelectedId = 'b-1';
    h.w.bulActiveDept = 'admin';
    h.w.reportableStoresCache = [store];
    h.w.allStoresCache = [store];
    h.w.mnLoadStoresFlag(); /* както при входа (setupTabsForRole) */
    h.w.loadBulletin();
    await settle(() => !!h.doc.getElementById('sec-calendar'));
    return h;
  }
  const cbOf = (h, id) => Array.prototype.slice.call(h.doc.querySelectorAll('input[type=checkbox][data-rtid="' + id + '"]'));

  section('Б.1 Включен обект (Гоце Делчев, 2 непопълнени) → без квадратче за отмятане, „⏳ 2 непопълнени" + „Отвори →"');
  {
    const h = await bul(GD, [mv(GD, '10'), mv(GD, '11'), mv(GD, '12', { reason_id: 2 })]);
    const w = h.w;
    await settle(() => w.bulAutoPending['minusi'] === 2);
    ok('брояч bulAutoPending.minusi = 2 (mnLoadSummary)', w.bulAutoPending['minusi'] === 2, String(w.bulAutoPending['minusi']));
    const cbs = cbOf(h, T_GD);
    ok('квадратчето на ГД-задачата е заключено (' + cbs.length + ' бр.)', cbs.length > 0 && cbs.every(c => c.disabled), cbs.map(c => c.disabled).join(','));
    ok('… с етикета на модула', cbs.length > 0 && cbs.every(c => /Отмята се автоматично от Минуси/.test(c.getAttribute('title') || '')), cbs[0] && cbs[0].getAttribute('title'));
    const note = h.doc.querySelector('.bul-auto-minusi.bul-auto-pending');
    ok('надпис „⏳ 2 непопълнени"', !!note && note.textContent.trim() === '⏳ 2 непопълнени', note && note.textContent);
    const open = h.doc.querySelector('.bul-auto-open[data-linked="minusi"]');
    ok('бутон „Отвори →"', !!open && /Отвори/.test(open.textContent));
    ok('без „⏱ Отложи" за задачата', !Array.prototype.slice.call(h.doc.querySelectorAll('button[data-task-id="' + T_GD + '"]')).some(b => /Отложи/.test(b.textContent)));
    /* Ръчен опит през обработчика (втората защита) → отказ. */
    if (cbs[0]) { cbs[0].disabled = false; cbs[0].checked = true; w.bulRecurringCheckboxChanged(cbs[0]); }
    ok('принудителен клик по квадратчето → без запис в task_completions', !h.calls.post.some(p => p.table === 'task_completions'), JSON.stringify(h.calls.post.map(p => p.table)));
    if (open) realClick(w, open);
    await settle(() => { const m = h.doc.getElementById('mod-minusi'); return m && m.style.display !== 'none' && /Минуси/.test(m.textContent); });
    const mod2 = h.doc.getElementById('mod-minusi');
    ok('клик → под-табът „➖ Минуси" е отворен', !!mod2 && mod2.style.display !== 'none', mod2 && mod2.style.display);
    ok('… с „само непопълнени" и изглед „Дневен"', w.mnOnlyUnfilled === true && w.mnView === 'daily');
    const sub = h.doc.getElementById('rvs-minusi');
    ok('… и под-бутонът е активен', !!sub && sub.classList.contains('active'));
    for (let i = 0; i < 60; i++) await ticks(); /* loadMinusi да довърши преди close */
    ok('completed_by auto:minusi → „автоматично от Минуси"', w.bulCompletedByLabel('auto:minusi') === 'автоматично от Минуси');
    h.close();
  }

  section('Б.1б Включен обект с 0 непопълнени → пак заключено, сив надпис без „Отвори"');
  {
    const h = await bul(GD, [mv(GD, '12', { reason_id: 2 })]);
    await settle(() => h.w.bulAutoPending['minusi'] === 0);
    const cbs = cbOf(h, T_GD);
    ok('заключено', cbs.length > 0 && cbs.every(c => c.disabled));
    ok('без „Отвори →" (нищо не чака)', !h.doc.querySelector('.bul-auto-open[data-linked="minusi"]'));
    const note = h.doc.querySelector('.bul-auto-minusi');
    ok('сив надпис „⏳ отмята се от Минуси"', !!note && /отмята се от Минуси/.test(note.textContent), note && note.textContent);
    h.close();
  }

  section('Б.2 Невключен обект (Шумен) → квадратчето си е ръчно');
  {
    const h = await bul(SH, []);
    const w = h.w;
    await settle(() => w.mnStoresDone === true);
    for (let i = 0; i < 20; i++) await ticks();
    const cbs = cbOf(h, T_ALL);
    const todayCbs = cbs.filter(c => c.getAttribute('data-cdate') === isoOf(ANCHOR));
    ok('днешното квадратче на общата задача е активно (' + todayCbs.length + ' бр.)', todayCbs.length > 0 && todayCbs.every(c => !c.disabled), todayCbs.map(c => c.disabled).join(','));
    ok('нито едно не носи етикета на Минуси (другите дни са заключени по дата)', cbs.length > 0 && !cbs.some(c => /Минуси/.test(c.getAttribute('title') || '')));
    ok('без надпис на Минуси', !h.doc.querySelector('.bul-auto-minusi'));
    ok('bulAutoLocked(minusi) = false', w.bulAutoLocked('minusi') === false);
    ok('без заявка към minus_movements', !h.calls.get.some(u => /minus_movements/.test(u)));
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
