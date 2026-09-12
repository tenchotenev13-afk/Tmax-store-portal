/* bulletin-notify: постоянните задачи по седмици (recurring_task_periods).

   Пипната е САМО темата overdue_tasks. Тя докладва ВЧЕРАШНИЯ ден, а
   recurring_tasks.active е кеш „важи ТАЗИ седмица":
     · в ПОНЕДЕЛНИК вчера е неделя от МИНАЛАТА седмица — задача, спряна тази
       седмица, още е била дължима вчера; активирана тази седмица — не е;
     · във ВТОРНИК вчера е понеделник от текущата — огледалният набор.
   Задача без нито един период се решава по active (резервата в
   recurringTasksForWeek). Другите три теми са за ДНЕС и остават на
   active=eq.true — тук се проверява и това.

   ═══ КАК СЕ ПУСКА ЕДЖ ФУНКЦИЯТА ═══
   Като tests/recurring-task-skips-notify.test.js: реже се РЕАЛНИЯТ файл,
   махат се jsr импортите, Deno.env.get() става '' и Node изрязва типовете.
   Фалшивият supabase клиент НАИСТИНА прилага eq/in — иначе „заявката е без
   active" и „ключът е понеделникът на вчера" биха минавали и срещу грешен код.

   ⚠️ Никакви фиксирани дати: котва (понеделникът на текущата седмица) +
   отместване; понеделниците на периодите се смятат независимо от кода.

   Пускане: node tests/recurring-periods-notify.test.js . */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, guard, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const SRC = path.join(ROOT, 'supabase/functions/bulletin-notify/index.ts');
const SHARED = path.join(ROOT, 'shared.js');

const ANCHOR_MON = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
})();
function dateAt(n) { const d = new Date(ANCHOR_MON.getTime()); d.setDate(d.getDate() + n); return d; }
function isoAt(n) {
  const d = dateAt(n), p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
/* ISO двойката, сметната НЕЗАВИСИМО от кода под тест: годината на четвъртъка. */
function isoKey(d) {
  const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const y = t.getFullYear(), jan4 = new Date(y, 0, 4);
  const mon1 = new Date(jan4); mon1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const w = 1 + Math.round((t - mon1) / 86400000 / 7 - 3 / 7);
  return { week: w, year: y };
}
const DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function mkBg(n, hh, mm) {
  const idx = ((n % 7) + 7) % 7;
  return { dateStr: isoAt(n), hours: hh, minutes: mm, dow: DOW[idx], isoWeekday: idx + 1, weekdayIdx: idx };
}

/* ── Срез от реалния файл ────────────────────────────────────────────── */
function endOfFn(lines, start) {
  let depth = 0, started = false;
  for (let i = start; i < lines.length; i++) {
    const bare = lines[i]
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
    for (const ch of bare) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') depth--;
    }
    if (started && depth <= 0) return i;
  }
  return -1;
}
function fnText(src, name) {
  const lines = src.split(/\r?\n/);
  const s = lines.findIndex(l => new RegExp('^(?:async )?function ' + name + '\\b').test(l));
  if (s < 0) return null;
  return lines.slice(s, endOfFn(lines, s) + 1).join('\n');
}
const REQUIRED = ['buildOverdueTasks', 'buildTodayDeadlines', 'buildDeadlinePassed',
  'isoWeekOf', 'plusDaysISO', 'recurringDueOnWeekday', 'recurringIsSkipped', 'loadSkipsForWeek'];
const OPTIONAL = ['recurringValidForWeek', 'recurringTasksForWeek', 'loadRecurringPeriods'];
function buildModule() {
  const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
  const found = [], missing = [];
  let end = -1;
  for (const fn of REQUIRED.concat(OPTIONAL)) {
    const s = lines.findIndex(l => new RegExp('^(?:async )?function ' + fn + '\\b').test(l));
    if (s < 0) { if (REQUIRED.indexOf(fn) >= 0) missing.push(fn); continue; }
    found.push(fn);
    const e = endOfFn(lines, s);
    if (e > end) end = e;
  }
  if (missing.length) throw new Error('липсват във файла: ' + missing.join(', '));
  const head = lines.slice(0, end + 1).filter(l => !/^import\s/.test(l)).join('\n')
    .replace(/Deno\.env\.get\([^)]*\)!?/g, "''");
  const out = head + '\nexport { ' + found.join(', ') + ' };\n';
  const dir = path.join(os.tmpdir(), 'tmax-bn-periods');
  fs.mkdirSync(dir, { recursive: true });
  const tag = require('crypto').createHash('sha1').update(out).digest('hex').slice(0, 12);
  const file = path.join(dir, 'slice-' + tag + '.ts');
  fs.writeFileSync(file, out);
  return file;
}

/* ── Фалшив supabase клиент, който наистина филтрира ─────────────────── */
function fakeSb(data, log, opts) {
  opts = opts || {};
  const pass = (row, f) => {
    const v = row[f[1]];
    if (f[0] === 'eq') return v === f[2];
    if (f[0] === 'in') return f[2].indexOf(v) >= 0;
    if (v === null || v === undefined) return false;
    if (f[0] === 'gte') return String(v) >= String(f[2]);
    if (f[0] === 'lte') return String(v) <= String(f[2]);
    return true;
  };
  return {
    from(table) {
      const q = { table: table, filters: [], limit: null };
      const self = {
        select(c) { q.select = c; return self; },
        eq(c, v) { q.filters.push(['eq', c, v]); return self; },
        in(c, v) { q.filters.push(['in', c, v]); return self; },
        gte(c, v) { q.filters.push(['gte', c, v]); return self; },
        lte(c, v) { q.filters.push(['lte', c, v]); return self; },
        limit(n) { q.limit = n; return self; },
        then(res, rej) {
          log.push(q);
          if (opts.failTable === table) return Promise.resolve({ data: null, error: { message: 'boom' } }).then(res, rej);
          let rows = (data[table] || []).filter(r => q.filters.every(f => pass(r, f)));
          if (q.limit !== null) rows = rows.slice(0, q.limit);
          return Promise.resolve({ data: rows }).then(res, rej);
        },
      };
      return self;
    },
  };
}

/* ── Данни ──────────────────────────────────────────────────────────────── */
const TR = 'Троян', LO = 'Ловеч', SE = 'Севлиево';
const STORES = [TR, LO, SE];
const MON_PREV = isoAt(-7), MON_NOW = isoAt(0), MON_OLD = isoAt(-35);
/* „Всеки ден" до 10:00 — дължима и вчера, и днес, кой ден и да е. */
function rec(id, over) {
  return Object.assign({
    id: id, title: 'Постоянна ' + id, department: 'trade', active: true, task_type: 'info',
    due_weekday: null, due_weekdays: null, due_time: '10:00', due_window: false,
    target_stores: null, report_groups: null,
  }, over || {});
}
/* r-stop  — спряна ТАЗИ седмица: период до миналия понеделник, active=false;
   r-new   — активирана ТАЗИ седмица: период от този понеделник;
   r-live  — отворен период отдавна;
   r-legacy— БЕЗ период, active=true (стар кеширан клиент);
   r-dead  — БЕЗ период, active=false. */
const RECS = [
  rec('r-stop', { active: false }), rec('r-new'), rec('r-live'), rec('r-legacy'), rec('r-dead', { active: false })
];
const PERIODS = [
  { recurring_task_id: 'r-stop', from_monday: MON_OLD, to_monday: MON_PREV },
  { recurring_task_id: 'r-new', from_monday: MON_NOW, to_monday: null },
  { recurring_task_id: 'r-live', from_monday: MON_OLD, to_monday: null }
];
function data() {
  return {
    /* Бюлетин за седмицата на котвата — иначе темата излиза още в началото. */
    bulletins: [{ id: 'b-1', week_number: isoKey(dateAt(0)).week, year: isoKey(dateAt(0)).year }],
    bulletin_tasks: [],
    recurring_tasks: RECS,
    recurring_task_periods: PERIODS,
    recurring_task_skips: [],
    task_completions: [],
    users: STORES.map(s => ({ store_name: s, active: true }))
  };
}
const qOf = (log, t) => log.filter(q => q.table === t);
const hasEq = (q, c, v) => q.filters.some(f => f[0] === 'eq' && f[1] === c && f[2] === v);
const idsOf = b => {
  const out = {};
  ((b && b.items) || []).filter(i => i.kind === 'recurring').forEach(i => { out[i.taskId] = 1; });
  return Object.keys(out).sort();
};

let mod = null;
(async function main() {

  section('0. Реалният код се зарежда в Node');
  {
    let file = null;
    if (!guard('изрязването на модула минава', () => { file = buildModule(); })) { report(); return; }
    try { mod = await import(pathToFileURL(file).href); }
    catch (e) { ok('модулът се импортира', false, e && e.message); report(); return; }
    ok('модулът се импортира', true);
    ok('новите функции ги има', typeof mod.recurringValidForWeek === 'function' &&
      typeof mod.recurringTasksForWeek === 'function' && typeof mod.loadRecurringPeriods === 'function');
  }

  section('1. Копията съвпадат ДОСЛОВНО с shared.js');
  {
    const shared = fs.readFileSync(SHARED, 'utf8');
    const edge = fs.readFileSync(SRC, 'utf8');
    ['recurringValidForWeek', 'recurringTasksForWeek'].forEach(fn => {
      const a = fnText(shared, fn), b = fnText(edge, fn);
      ok(fn + ': копието е байт по байт същото', !!a && a === b,
        !a ? 'няма я в shared.js' : (a === b ? '' : 'разминаване'));
    });
  }

  section('2. ПОНЕДЕЛНИК: вчера е неделя от МИНАЛАТА седмица');
  {
    const log = [];
    const b = await mod.buildOverdueTasks(fakeSb(data(), log), mkBg(0, 8, 15));
    const rq = qOf(log, 'recurring_tasks');
    ok('една заявка за recurring_tasks', rq.length === 1, String(rq.length));
    ok('тя е БЕЗ active=eq.true', rq.length === 1 && !hasEq(rq[0], 'active', true), JSON.stringify(rq[0] && rq[0].filters));
    ok('периодите се теглят', qOf(log, 'recurring_task_periods').length === 1);
    const ids = idsOf(b);
    ok('спряната ТАЗИ седмица (r-stop) Е просрочена за неделя', ids.indexOf('r-stop') >= 0, ids.join(','));
    ok('активираната ТАЗИ седмица (r-new) НЕ е', ids.indexOf('r-new') < 0, ids.join(','));
    ok('r-live и r-legacy са там', ids.indexOf('r-live') >= 0 && ids.indexOf('r-legacy') >= 0, ids.join(','));
    ok('без период и спряна (r-dead) я няма', ids.indexOf('r-dead') < 0, ids.join(','));
  }

  section('3. ВТОРНИК: вчера е понеделник от ТЕКУЩАТА седмица');
  {
    const log = [];
    const b = await mod.buildOverdueTasks(fakeSb(data(), log), mkBg(1, 8, 15));
    const ids = idsOf(b);
    ok('активираната тази седмица (r-new) Е просрочена за понеделник', ids.indexOf('r-new') >= 0, ids.join(','));
    ok('спряната тази седмица (r-stop) НЕ е', ids.indexOf('r-stop') < 0, ids.join(','));
    ok('r-live и r-legacy пак са там', ids.indexOf('r-live') >= 0 && ids.indexOf('r-legacy') >= 0, ids.join(','));
  }

  section('4. Провалена заявка за периодите → решава кешът active');
  {
    const log = [];
    const b = await mod.buildOverdueTasks(fakeSb(data(), log, { failTable: 'recurring_task_periods' }), mkBg(0, 8, 15));
    const ids = idsOf(b);
    ok('активните са там (r-new, r-live, r-legacy)',
      ids.indexOf('r-new') >= 0 && ids.indexOf('r-live') >= 0 && ids.indexOf('r-legacy') >= 0, ids.join(','));
    ok('спрените ги няма (r-stop, r-dead)', ids.indexOf('r-stop') < 0 && ids.indexOf('r-dead') < 0, ids.join(','));
  }

  section('5. Другите две теми с постоянни задачи остават на active=eq.true');
  {
    const log1 = [];
    await mod.buildTodayDeadlines(fakeSb(data(), log1), mkBg(2, 8, 0));
    const r1 = qOf(log1, 'recurring_tasks');
    ok('today_deadlines: заявката е с active=eq.true', r1.length === 1 && hasEq(r1[0], 'active', true), JSON.stringify(r1[0] && r1[0].filters));
    ok('today_deadlines: НЕ тегли периоди', qOf(log1, 'recurring_task_periods').length === 0);

    const log2 = [];
    await mod.buildDeadlinePassed(fakeSb(data(), log2), mkBg(2, 10, 15));
    const r2 = qOf(log2, 'recurring_tasks');
    ok('deadline_passed: заявката е с active=eq.true', r2.length === 1 && hasEq(r2[0], 'active', true), JSON.stringify(r2[0] && r2[0].filters));
    ok('deadline_passed: НЕ тегли периоди', qOf(log2, 'recurring_task_periods').length === 0);
  }

  report();
})().catch(function (e) {
  ok('тестът стига до края без необработено изключение', false, e && e.stack);
  report();
});
