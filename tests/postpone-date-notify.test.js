/* Отлагане с точна дата — bulletin-notify (трите теми със задачи).

   Денят на задачата е postponed_to, ако редът е пренесен; completion_date
   остава първоначалният срок. Тестът пуска РЕАЛНИЯ .ts (техниката на
   tests/recurring-periods-notify.test.js) срещу фалшив клиент, който
   наистина филтрира eq/in/gte/lte.

   Три случая, всеки в трите теми:
     А) пренесено в СЪЩАТА седмица — постоянна r-mon (пон → ср) от Троян и
        Ловеч (Ловеч е отметнал); r-wed (ср → пет) и обикновена t-wed
        (ср → пет) от Троян; обикновена t-mon (пон → вт) от Троян;
     Б) пренесено ОТ МИНАЛАТА седмица — обикновена t-old от ЧУЖД бюлетин
        (Севлиево, миналия четвъртък → ср) и постоянна r-wed (Севлиево,
        миналата сряда → ср: слято с днешното ѝ явяване);
     В) СТАР отложен ред без дата — r-wed и t-wed от Ловеч за сряда.

   Дни: котва понеделник на текущата седмица. today_deadlines и
   deadline_passed се пускат в СРЯДА, overdue_tasks — в ЧЕТВЪРТЪК (докладва
   сряда).

   Пускане: node tests/postpone-date-notify.test.js . */
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
  'taskDueDateFor', 'taskIsMovedAway', 'loadCarriedTo', 'loadTasksByIds', 'plusDaysISO'];
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
  const dir = path.join(os.tmpdir(), 'tmax-bn-postpone');
  fs.mkdirSync(dir, { recursive: true });
  const tag = require('crypto').createHash('sha1').update(out).digest('hex').slice(0, 12);
  const file = path.join(dir, 'slice-' + tag + '.ts');
  fs.writeFileSync(file, out);
  return file;
}

/* ── Фалшив supabase клиент, който наистина филтрира ─────────────────── */
function fakeSb(data, log) {
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
const MON = isoAt(0), TUE = isoAt(1), WED = isoAt(2), FRI = isoAt(4);
const PREV_WED = isoAt(-5), PREV_THU = isoAt(-4);

function rec(id, days, over) {
  return Object.assign({
    id: id, title: 'Постоянна ' + id, department: 'trade', active: true, task_type: 'info',
    due_weekday: null, due_weekdays: days, due_time: '10:00', due_window: false,
    target_stores: null, report_groups: ['controlling'],
  }, over || {});
}
function task(id, bulletinId, dates) {
  return { id: id, bulletin_id: bulletinId, title: 'Задача ' + id, department: 'trade', task_type: 'info',
           due_date: null, due_dates: dates, target_stores: null, report_groups: null, created_by: null };
}
function row(o) {
  return Object.assign({ task_id: null, recurring_task_id: null, status: 'postponed',
    completion_date: null, postponed_to: null, comment: '', photos: [], files: [] }, o);
}

const COMPS = [
  /* А) същата седмица */
  row({ recurring_task_id: 'r-mon', store_name: TR, completion_date: MON, postponed_to: WED }),
  row({ recurring_task_id: 'r-mon', store_name: LO, completion_date: MON, postponed_to: WED, status: 'done', comment: 'готово' }),
  row({ recurring_task_id: 'r-wed', store_name: TR, completion_date: WED, postponed_to: FRI }),
  row({ task_id: 't-wed', store_name: TR, completion_date: WED, postponed_to: FRI }),
  row({ task_id: 't-mon', store_name: TR, completion_date: MON, postponed_to: TUE }),
  /* Б) от миналата седмица */
  row({ task_id: 't-old', store_name: SE, completion_date: PREV_THU, postponed_to: WED }),
  row({ recurring_task_id: 'r-wed', store_name: SE, completion_date: PREV_WED, postponed_to: WED }),
  /* В) стар ред без дата */
  row({ recurring_task_id: 'r-wed', store_name: LO, completion_date: WED, postponed_to: null }),
  row({ task_id: 't-wed', store_name: LO, completion_date: WED, postponed_to: null })
];

function data() {
  const wk = isoKey(dateAt(0));
  return {
    bulletins: [{ id: 'b-1', week_number: wk.week, year: wk.year }],
    bulletin_tasks: [task('t-wed', 'b-1', [WED]), task('t-mon', 'b-1', [MON]), task('t-old', 'b-0', [PREV_THU])],
    recurring_tasks: [rec('r-mon', [0]), rec('r-wed', [2])],
    recurring_task_periods: [],
    recurring_task_skips: [],
    task_completions: COMPS.map(c => Object.assign({}, c)),
    users: STORES.map(s => ({ store_name: s, active: true }))
  };
}

const linesOf = (b, s) => ((b && b.byStore && b.byStore[s]) ? b.byStore[s].lines : []);
const hasLine = (b, s, id) => linesOf(b, s).some(l => l.indexOf('Постоянна ' + id) === 0 || l.indexOf('Задача ' + id) === 0);
const countLine = (b, s, id) => linesOf(b, s).filter(l => l.indexOf('Постоянна ' + id) === 0 || l.indexOf('Задача ' + id) === 0).length;
const itemsOf = (b, id) => ((b && b.items) || []).filter(i => i.taskId === id);
const storesOf = (b, id) => itemsOf(b, id).map(i => i.store).sort();
const entryOf = (b, id) => ((b && b.entries) || []).find(e => e.task.id === id) || null;

let mod = null;
(async function main() {

  section('0. Реалният код се зарежда в Node');
  {
    let file = null;
    if (!guard('изрязването на модула минава', () => { file = buildModule(); })) { report(); return; }
    try { mod = await import(pathToFileURL(file).href); }
    catch (e) { ok('модулът се импортира', false, e && e.message); report(); return; }
    ok('модулът се импортира', true);
  }

  section('1. Копията съвпадат ДОСЛОВНО с shared.js');
  {
    const shared = fs.readFileSync(SHARED, 'utf8');
    const edge = fs.readFileSync(SRC, 'utf8');
    ['taskDueDateFor', 'taskIsMovedAway'].forEach(fn => {
      const a = fnText(shared, fn), b = fnText(edge, fn);
      ok(fn + ': копието е байт по байт същото', !!a && a === b,
        !a ? 'няма я в shared.js' : (a === b ? '' : 'разминаване'));
    });
  }

  /* ═══ today_deadlines — сряда 08:00 ═══════════════════════════════════ */
  section('2. today_deadlines (сряда 08:00)');
  {
    const log = [];
    const b = await mod.buildTodayDeadlines(fakeSb(data(), log), mkBg(2, 8, 0));
    ok('темата има адресати', !!(b && b.byStore), JSON.stringify(b && b.skip));
    /* А) */
    ok('А: Троян получава r-mon (пренесена от понеделник за днес)', hasLine(b, TR, 'r-mon'), JSON.stringify(linesOf(b, TR)));
    ok('А: редът казва, че е пренесена', linesOf(b, TR).some(l => l.indexOf('Постоянна r-mon') === 0 && l.indexOf('пренесена') >= 0),
      JSON.stringify(linesOf(b, TR)));
    ok('А: Ловеч НЕ получава r-mon — отметнал е пренесеното', !hasLine(b, LO, 'r-mon'), JSON.stringify(linesOf(b, LO)));
    ok('А: Севлиево НЕ получава r-mon — не я е отлагал', !hasLine(b, SE, 'r-mon'), JSON.stringify(linesOf(b, SE)));
    ok('А: Троян НЕ получава r-wed — пренесъл я е за петък', !hasLine(b, TR, 'r-wed'), JSON.stringify(linesOf(b, TR)));
    ok('А: Троян НЕ получава t-wed — пренесъл я е за петък', !hasLine(b, TR, 't-wed'), JSON.stringify(linesOf(b, TR)));
    /* Б) */
    ok('Б: Севлиево получава t-old от ЧУЖД бюлетин', hasLine(b, SE, 't-old'), JSON.stringify(linesOf(b, SE)));
    const byId = log.filter(q => q.table === 'bulletin_tasks' && q.filters.some(f => f[0] === 'in' && f[1] === 'id'));
    ok('Б: задачата се дотегля по id', byId.length === 1 && byId[0].filters.some(f => f[0] === 'in' && f[2].indexOf('t-old') >= 0),
      JSON.stringify(byId.map(q => q.filters)));
    ok('Б: слято явяване — r-wed е ЕДИН ред за Севлиево', countLine(b, SE, 'r-wed') === 1, JSON.stringify(linesOf(b, SE)));
    const carriedQ = log.filter(q => q.table === 'task_completions' && q.filters.some(f => f[0] === 'eq' && f[1] === 'postponed_to'));
    ok('пренесените се теглят по postponed_to = днес',
      carriedQ.length === 1 && carriedQ[0].filters.some(f => f[2] === WED), JSON.stringify(carriedQ.map(q => q.filters)));
    /* В) */
    ok('В: Ловеч със стар ред без дата — както досега (редът брои, няма напомняне за r-wed)',
      !hasLine(b, LO, 'r-wed'), JSON.stringify(linesOf(b, LO)));
  }

  section('2б. КОНТРОЛА: без редове за отлагане всички получават днешните');
  {
    const d = data(); d.task_completions = [];
    const b = await mod.buildTodayDeadlines(fakeSb(d, []), mkBg(2, 8, 0));
    ok('Троян получава r-wed и t-wed', hasLine(b, TR, 'r-wed') && hasLine(b, TR, 't-wed'), JSON.stringify(linesOf(b, TR)));
    ok('никой не получава r-mon', !hasLine(b, TR, 'r-mon') && !hasLine(b, LO, 'r-mon'));
  }

  /* ═══ deadline_passed — сряда 10:15 ═══════════════════════════════════ */
  section('3. deadline_passed (сряда 10:15)');
  {
    const log = [];
    const b = await mod.buildDeadlinePassed(fakeSb(data(), log), mkBg(2, 10, 15));
    ok('темата има записи', !!(b && b.entries), JSON.stringify(b && b.skip));
    const eMon = entryOf(b, 'r-mon'), eWed = entryOf(b, 'r-wed');
    /* А) */
    if (ok('А: r-mon (не е днешна) влиза заради пренесените', !!eMon)) {
      ok('А: обхватът е САМО отложилите — Троян и Ловеч', eMon.total === 2, String(eMon.total));
      ok('А: Ловеч е подал — отметката е от пренесения ред',
        eMon.submitted.length === 1 && eMon.submitted[0].store === LO && eMon.submitted[0].comment === 'готово',
        JSON.stringify(eMon.submitted));
      ok('А: Троян не е подал', JSON.stringify(eMon.missing) === JSON.stringify([TR]), JSON.stringify(eMon.missing));
    }
    if (ok('r-wed (днешна) си има запис', !!eWed)) {
      ok('А: Троян е ИЗВЪН обхвата — пренесъл я е за петък', eWed.missing.indexOf(TR) < 0 &&
        !eWed.submitted.some(x => x.store === TR), JSON.stringify(eWed));
      /* В) Ловеч: стар ред без дата — остава в обхвата и не е подал. */
      ok('В: Ловеч със стар ред без дата остава „не е подал"', eWed.missing.indexOf(LO) >= 0, JSON.stringify(eWed.missing));
      /* Б) Севлиево: слято явяване — брои се веднъж, в собствения запис. */
      ok('Б: Севлиево е в обхвата веднъж', eWed.missing.filter(s => s === SE).length === 1, JSON.stringify(eWed.missing));
      ok('обхватът на r-wed е 2 (Ловеч и Севлиево)', eWed.total === 2, String(eWed.total));
    }
    ok('има само два записа (r-mon и r-wed)', (b.entries || []).length === 2, JSON.stringify((b.entries || []).map(e => e.task.id)));
  }

  /* ═══ overdue_tasks — четвъртък 08:15, докладва сряда ═════════════════ */
  section('4. overdue_tasks (четвъртък; вчера е сряда)');
  {
    const log = [];
    const b = await mod.buildOverdueTasks(fakeSb(data(), log), mkBg(3, 8, 15));
    ok('темата има просрочени', !!(b && b.items), JSON.stringify(b && b.skip));
    /* А) обикновени */
    ok('А: t-wed — Троян НЕ е просрочен (пренесено за петък, още не е дошло)',
      storesOf(b, 't-wed').indexOf(TR) < 0, JSON.stringify(storesOf(b, 't-wed')));
    const tMonTR = itemsOf(b, 't-mon').find(i => i.store === TR);
    ok('А: t-mon — Троян Е просрочен (пренесено за вторник, минало, неотметнато)', !!tMonTR,
      JSON.stringify(storesOf(b, 't-mon')));
    if (tMonTR) ok('А: срокът на Троян е НОВАТА дата (вторник), не понеделник', tMonTR.due === TUE, String(tMonTR.due));
    const tMonLO = itemsOf(b, 't-mon').find(i => i.store === LO);
    ok('А: t-mon — чуждият обект е със срок понеделник', !!tMonLO && tMonLO.due === MON, JSON.stringify(tMonLO));
    /* А) постоянни */
    ok('А: r-wed — Троян НЕ е просрочен за сряда (пренесъл я е)',
      storesOf(b, 'r-wed').indexOf(TR) < 0, JSON.stringify(storesOf(b, 'r-wed')));
    ok('А: r-mon — Троян Е просрочен (пренесена ЗА сряда, неотметната)',
      JSON.stringify(storesOf(b, 'r-mon')) === JSON.stringify([TR]), JSON.stringify(storesOf(b, 'r-mon')));
    /* Б) */
    const tOld = itemsOf(b, 't-old');
    ok('Б: t-old от ЧУЖД бюлетин — Севлиево е просрочен', tOld.length === 1 && tOld[0].store === SE, JSON.stringify(tOld));
    if (tOld.length) ok('Б: срокът му е новата дата (сряда)', tOld[0].due === WED, String(tOld[0].due));
    ok('Б: r-wed — Севлиево (слято) е просрочен веднъж',
      storesOf(b, 'r-wed').filter(s => s === SE).length === 1, JSON.stringify(storesOf(b, 'r-wed')));
    /* В) */
    ok('В: r-wed — Ловеч със стар ред без дата остава просрочен (както досега)',
      storesOf(b, 'r-wed').indexOf(LO) >= 0, JSON.stringify(storesOf(b, 'r-wed')));
    ok('В: t-wed — Ловеч със стар ред без дата НЕ е просрочен (редът брои, както досега)',
      storesOf(b, 't-wed').indexOf(LO) < 0, JSON.stringify(storesOf(b, 't-wed')));
    ok('t-wed — Севлиево без ред е просрочен', storesOf(b, 't-wed').indexOf(SE) >= 0, JSON.stringify(storesOf(b, 't-wed')));
  }

  section('4б. КОНТРОЛА: без редове всички са просрочени по срока');
  {
    const d = data(); d.task_completions = [];
    const b = await mod.buildOverdueTasks(fakeSb(d, []), mkBg(3, 8, 15));
    ok('t-mon: и тримата, срок понеделник', storesOf(b, 't-mon').length === 3 && itemsOf(b, 't-mon').every(i => i.due === MON),
      JSON.stringify(itemsOf(b, 't-mon')));
    ok('r-wed: и тримата', storesOf(b, 'r-wed').length === 3, JSON.stringify(storesOf(b, 'r-wed')));
    ok('r-mon и t-old ги няма', itemsOf(b, 'r-mon').length === 0 && itemsOf(b, 't-old').length === 0);
  }

  report();
})().catch(function (e) {
  ok('тестът стига до края без необработено изключение', false, e && e.stack);
  report();
});
