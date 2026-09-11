/* bulletin-notify: постоянна задача, изключена за седмица (recurring_task_skips).

   Трите теми с постоянни задачи:
     · overdue_tasks   — ключът е седмицата на ВЧЕРА (isoWeekOf(yISO)): в
                          понеделник вчера е неделя от МИНАЛАТА седмица;
     · today_deadlines — седмицата на днес; push по обект;
     · deadline_passed — седмицата на днес; писмо „кой подаде / кой не".
   Изключена за всички → задачата не влиза в темата. Изключена за обект →
   обектът излиза от обхвата (не е „пропуснал", не е в total, не получава
   push). Изключване за СЪСЕДНА седмица не се прилага.

   ═══ КАК СЕ ПУСКА ЕДЖ ФУНКЦИЯТА ═══
   Същият механизъм като tests/overdue-recurring.test.js: реже се РЕАЛНИЯТ
   файл до края на нужните функции, махат се jsr импортите, Deno.env.get()
   става '' и Node изрязва типовете. Изпълнява се кодът, който се деплойва.
   Фалшивият supabase клиент прилага eq/in/gte/lte НАИСТИНА — иначе
   проверката „ключът е седмицата на вчера" би минавала и с грешен ключ.

   Отделно: isoWeekOf() в едж функцията и recurringSkipWeekOf() в shared.js
   трябва да дават една и съща двойка — Бюлетинът записва с второто,
   функцията чете с първото. И копията на recurringIsSkipped/
   recurringSkipStores трябва да съвпадат с оригинала в shared.js.

   ⚠️ Никакви фиксирани дати освен двете граници на годината, които са
   точно смисълът на проверката; всичко останало е котва + отместване.

   Пускане: node tests/recurring-task-skips-notify.test.js . */
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

/* ── Котва: понеделникът на текущата реална седмица ────────────────────── */
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
/* ISO двойка, сметната НЕЗАВИСИМО от кода под тест: годината на четвъртъка. */
function isoKey(d) {
  const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const y = t.getFullYear(), jan4 = new Date(y, 0, 4);
  const mon1 = new Date(jan4); mon1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const w = 1 + Math.round((t - mon1) / 86400000 / 7 - 3 / 7);
  return { week: w, year: y };
}
const DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
/* bg, какъвто го строи bgNow(). n = отместване от понеделника = индекс на деня. */
function mkBg(n, hh, mm) {
  const idx = ((n % 7) + 7) % 7;
  return { dateStr: isoAt(n), hours: hh, minutes: mm, dow: DOW[idx], isoWeekday: idx + 1, weekdayIdx: idx };
}

/* ── Срез от реалния файл (както в overdue-recurring.test.js) ─────────── */
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
  const e = endOfFn(lines, s);
  return lines.slice(s, e + 1).join('\n');
}
const REQUIRED = ['buildOverdueTasks', 'buildTodayDeadlines', 'buildDeadlinePassed',
  'isoWeekOf', 'plusDaysISO', 'recurringDueOnWeekday'];
/* НОВИ с тази промяна: липсват ли, срезът пак се строи и тестът пада на
   същинските проверки с четлив изход, вместо да умре още на рязането. */
const OPTIONAL = ['recurringIsSkipped', 'recurringSkipStores', 'loadSkipsForWeek'];
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
  const dir = path.join(os.tmpdir(), 'tmax-bn-skips');
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
/* „Всеки ден" до 10:00: дължима и вчера, и днес. today_deadlines я напомня
   в 08:00 (два часа по-рано), deadline_passed я докладва в 10:15. */
function rec(id, over) {
  return Object.assign({
    id: id, title: 'Постоянна ' + id, department: 'trade', active: true, task_type: 'info',
    due_weekday: null, due_weekdays: null, due_time: '10:00', due_window: false,
    target_stores: null, report_groups: null,
  }, over || {});
}
const RECS = [rec('r-g'), rec('r-s'), rec('r-n'), rec('r-p'), rec('r-a')];
function skip(id, taskId, k, store) {
  return { id: id, recurring_task_id: taskId, year: k.year, week_number: k.week, store_name: store || null };
}
/* thisWk = седмицата на котвата; prevWk = миналата. */
const thisWk = isoKey(dateAt(0)), prevWk = isoKey(dateAt(-7));
function dataFor(skips) {
  return {
    bulletins: [{ id: 'b-1', week_number: thisWk.week, year: thisWk.year }],
    bulletin_tasks: [],
    recurring_tasks: RECS,
    task_completions: [],
    users: STORES.map(s => ({ store_name: s, active: true })),
    recurring_task_skips: skips,
  };
}
const skipQueries = log => log.filter(q => q.table === 'recurring_task_skips');
const hasEq = (q, c, v) => q.filters.some(f => f[0] === 'eq' && f[1] === c && f[2] === v);

let mod = null;
(async function main() {

  section('0. Реалният код се зарежда в Node');
  {
    let file = null;
    if (!guard('изрязването на модула минава', () => { file = buildModule(); })) { report(); return; }
    try { mod = await import(pathToFileURL(file).href); }
    catch (e) { ok('модулът се импортира', false, e && e.message); report(); return; }
    ok('модулът се импортира', true);
    ok('новите функции ги има', typeof mod.recurringIsSkipped === 'function' && typeof mod.loadSkipsForWeek === 'function');
  }

  section('1. isoWeekOf() в едж функцията = recurringSkipWeekOf() в shared.js');
  {
    const shared = fs.readFileSync(SHARED, 'utf8');
    const src = fnText(shared, 'recurringSkipWeekOf');
    let skipWeekOf = null;
    guard('recurringSkipWeekOf се взима от shared.js', () => { skipWeekOf = new Function(src + '\nreturn recurringSkipWeekOf;')(); });
    if (skipWeekOf) {
      const a1 = mod.isoWeekOf('2025-12-29'), b1 = skipWeekOf(new Date(2025, 11, 29));
      ok('29.12.2025: и двете → 2026 С1', a1.year === 2026 && a1.week === 1 && b1.year === 2026 && b1.week === 1,
        JSON.stringify({ isoWeekOf: a1, recurringSkipWeekOf: b1 }));
      const a2 = mod.isoWeekOf('2027-01-01'), b2 = skipWeekOf(new Date(2027, 0, 1));
      ok('01.01.2027: и двете → 2026 С53', a2.year === 2026 && a2.week === 53 && b2.year === 2026 && b2.week === 53,
        JSON.stringify({ isoWeekOf: a2, recurringSkipWeekOf: b2 }));
      /* Всеки ден 2024–2031: Бюлетинът записва с едното, функцията чете с другото. */
      let bad = 0, n = 0, first = '';
      for (let d = new Date(2024, 0, 1); d <= new Date(2031, 11, 31); d.setDate(d.getDate() + 1)) {
        n++;
        const p = x => String(x).padStart(2, '0');
        const s = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
        const a = mod.isoWeekOf(s), b = skipWeekOf(new Date(d));
        if (a.week !== b.week || a.year !== b.year) { bad++; if (!first) first = s + ' ' + JSON.stringify([a, b]); }
      }
      ok('съвпадат за всеки ден 2024–2031 (' + n + ' дни)', bad === 0, first);
    }
  }

  section('2. Копията на recurringIsSkipped / recurringSkipStores = shared.js');
  {
    const shared = fs.readFileSync(SHARED, 'utf8'), edge = fs.readFileSync(SRC, 'utf8');
    const norm = s => (s || '').replace(/\s+/g, '');
    ['recurringIsSkipped', 'recurringSkipStores'].forEach(fn => {
      const a = fnText(shared, fn), b = fnText(edge, fn);
      ok(fn + ' я има в bulletin-notify', !!b);
      ok(fn + ' съвпада с shared.js', !!a && !!b && norm(a) === norm(b));
    });
  }

  section('3. overdue_tasks в ПОНЕДЕЛНИК: ключът е седмицата на вчера (миналата)');
  {
    /* Вчера е неделя от миналата седмица. Изключванията за НЕЯ важат;
       изключването на r-p за ТЕКУЩАТА седмица — не. */
    const skips = [
      skip('s1', 'r-g', prevWk),        /* глобално, миналата */
      skip('s2', 'r-s', prevWk, TR),    /* Троян, миналата */
      skip('s3', 'r-p', thisWk, TR),    /* Троян, ТЕКУЩАТА — не бива да важи вчера */
      skip('s4', 'r-a', prevWk, TR), skip('s5', 'r-a', prevWk, LO), skip('s6', 'r-a', prevWk, SE)
    ];
    const log = [];
    const b = await mod.buildOverdueTasks(fakeSb(dataFor(skips), log), mkBg(0, 8, 15));
    const q = skipQueries(log);
    ok('една заявка за изключванията', q.length === 1, q.length);
    ok('тя е за седмицата на ВЧЕРА (' + prevWk.week + '/' + prevWk.year + '), не на днес',
      q.length === 1 && hasEq(q[0], 'week_number', prevWk.week) && hasEq(q[0], 'year', prevWk.year), JSON.stringify(q[0] && q[0].filters));
    const items = (b.items || []).filter(i => i.kind === 'recurring');
    const by = id => items.filter(i => i.taskId === id).map(i => i.store).sort();
    ok('r-g (глобално) я няма', by('r-g').length === 0, JSON.stringify(by('r-g')));
    ok('r-s: без Троян — Ловеч и Севлиево', JSON.stringify(by('r-s')) === JSON.stringify([LO, SE].sort()), JSON.stringify(by('r-s')));
    ok('r-s: total = 2 (Троян не е в знаменателя)', b.taskStats && b.taskStats['recurring:r-s'] && b.taskStats['recurring:r-s'].total === 2,
      JSON.stringify(b.taskStats && b.taskStats['recurring:r-s']));
    ok('r-n: и трите обекта', by('r-n').length === 3);
    ok('r-p: и трите — изключването за текущата седмица НЕ важи вчера', JSON.stringify(by('r-p')) === JSON.stringify(STORES.slice().sort()), JSON.stringify(by('r-p')));
    ok('r-a (изключена за трите поотделно): няма редове и няма запис в taskStats', by('r-a').length === 0 && !(b.taskStats || {})['recurring:r-a']);
  }

  section('3б. overdue_tasks във ВТОРНИК: вчера е понеделник — текущата седмица');
  {
    const skips = [skip('s1', 'r-g', prevWk), skip('s2', 'r-s', prevWk, TR), skip('s3', 'r-p', thisWk, TR)];
    const log = [];
    const b = await mod.buildOverdueTasks(fakeSb(dataFor(skips), log), mkBg(1, 8, 15));
    const q = skipQueries(log);
    ok('заявката е за ТЕКУЩАТА седмица', q.length === 1 && hasEq(q[0], 'week_number', thisWk.week) && hasEq(q[0], 'year', thisWk.year));
    const items = (b.items || []).filter(i => i.kind === 'recurring');
    const by = id => items.filter(i => i.taskId === id).map(i => i.store).sort();
    ok('r-g и r-s отново са за всички (изключванията им са за миналата)', by('r-g').length === 3 && by('r-s').length === 3);
    ok('r-p: без Троян', JSON.stringify(by('r-p')) === JSON.stringify([LO, SE].sort()), JSON.stringify(by('r-p')));
  }

  section('4. today_deadlines в сряда 08:00: седмицата на днес');
  {
    const skips = [
      skip('s1', 'r-g', thisWk), skip('s2', 'r-s', thisWk, TR),
      skip('s3', 'r-p', prevWk, TR),    /* миналата — не важи днес */
      skip('s4', 'r-a', thisWk, TR), skip('s5', 'r-a', thisWk, LO), skip('s6', 'r-a', thisWk, SE)
    ];
    const log = [];
    const b = await mod.buildTodayDeadlines(fakeSb(dataFor(skips), log), mkBg(2, 8, 0));
    const q = skipQueries(log);
    ok('заявката е за седмицата на днес', q.length === 1 && hasEq(q[0], 'week_number', thisWk.week) && hasEq(q[0], 'year', thisWk.year), JSON.stringify(q[0] && q[0].filters));
    const lines = s => ((b.byStore || {})[s] || { lines: [] }).lines.map(x => x.replace(/ \(до .*\)$/, '')).sort();
    ok('Троян: r-n и r-p (без r-g, r-s, r-a)', JSON.stringify(lines(TR)) === JSON.stringify(['Постоянна r-n', 'Постоянна r-p']), JSON.stringify(lines(TR)));
    ok('Ловеч: r-n, r-p, r-s (без r-g, r-a)', JSON.stringify(lines(LO)) === JSON.stringify(['Постоянна r-n', 'Постоянна r-p', 'Постоянна r-s']), JSON.stringify(lines(LO)));
    ok('получателите са трите обекта', JSON.stringify((b.targets || []).slice().sort()) === JSON.stringify(STORES.slice().sort()));
  }

  section('4б. today_deadlines: единствената задача е изключена за всички → няма push');
  {
    const d = dataFor([skip('s1', 'r-g', thisWk)]);
    d.recurring_tasks = [rec('r-g')];
    const b = await mod.buildTodayDeadlines(fakeSb(d, []), mkBg(2, 8, 0));
    ok('връща skip, не получатели', !!b.skip && !b.targets, JSON.stringify(b));
  }

  section('5. deadline_passed в сряда 10:15: кой подаде / кой не');
  {
    const skips = [
      skip('s1', 'r-g', thisWk), skip('s2', 'r-s', thisWk, TR), skip('s3', 'r-p', prevWk, TR),
      skip('s4', 'r-a', thisWk, TR), skip('s5', 'r-a', thisWk, LO), skip('s6', 'r-a', thisWk, SE)
    ];
    const d = dataFor(skips);
    /* Троян е подал r-s преди изключването — не бива да излезе и като „подал". */
    d.task_completions = [{ recurring_task_id: 'r-s', store_name: TR, status: 'done', completion_date: isoAt(2), comment: 'от Троян' }];
    const log = [];
    const b = await mod.buildDeadlinePassed(fakeSb(d, log), mkBg(2, 10, 15));
    const q = skipQueries(log);
    ok('заявката е за седмицата на днес', q.length === 1 && hasEq(q[0], 'week_number', thisWk.week));
    const e = id => (b.entries || []).find(x => x.task.id === id);
    ok('r-g (глобално): няма писмо', !e('r-g'));
    ok('r-a (изключена за всички поотделно): няма писмо', !e('r-a'));
    const es = e('r-s');
    ok('r-s: total 2, „не са подали" = Ловеч и Севлиево', !!es && es.total === 2 && JSON.stringify(es.missing.slice().sort()) === JSON.stringify([LO, SE].sort()), JSON.stringify(es && { t: es.total, m: es.missing }));
    ok('r-s: Троян не е и сред „подали"', !!es && !es.submitted.some(x => x.store === TR));
    ok('r-p: total 3 (изключването е за миналата седмица)', !!e('r-p') && e('r-p').total === 3);
    ok('r-n: total 3', !!e('r-n') && e('r-n').total === 3);
  }

  section('6. Провал на заявката за изключванията → поведение като преди');
  {
    const skips = [skip('s1', 'r-g', thisWk)];
    const b = await mod.buildTodayDeadlines(fakeSb(dataFor(skips), [], { failTable: 'recurring_task_skips' }), mkBg(2, 8, 0));
    const lines = ((b.byStore || {})[TR] || { lines: [] }).lines.map(x => x.replace(/ \(до .*\)$/, ''));
    ok('r-g пак се напомня (известие в повече, не пропуснато)', lines.indexOf('Постоянна r-g') >= 0, JSON.stringify(lines));
  }

  report();
})().catch(function (e) {
  ok('тестът стига до края без необработено изключение', false, e && e.stack);
  report();
});
