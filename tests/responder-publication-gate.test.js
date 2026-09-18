/* dynamic-responder: насрочено напомняне НЕ тръгва за непубликуван бюлетин
   и за постоянна задача, която не важи за седмицата на напомнянето.

     · задача / под-задача → бюлетинът ѝ трябва да е status='published';
     · постоянна задача → recurringTasksForWeek([задачата], периоди,
       понеделника на деня на напомнянето): бъдещ / приключил период → не;
       без нито един период → по active (резервата от shared.js);
     · изтрита задача / под-задача / постоянна → не;
     · промоция → без проверка и без заявки;
     · провал на заявка → тръгва (fail-open, както при изключванията).

   Плюс: публикационната проверка стои в цикъла ПРЕДИ изпращането;
   копията recurringValidForWeek / recurringTasksForWeek = shared.js;
   mondayOfISO() = recurringMondayOf() от shared.js за всеки ден 2024–2031.

   Как се пуска едж функцията — като recurring-task-skips-responder.test.js:
   реже се реалният index.ts до края на нужните функции, махат се jsr
   импортите, Deno.env.get() → '', Node изрязва типовете.

   Пускане: node tests/responder-publication-gate.test.js . */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, guard, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const SRC = path.join(ROOT, 'supabase/functions/dynamic-responder/index.ts');
const SHARED = path.join(ROOT, 'shared.js');

function endOfFn(lines, start) {
  let depth = 0, started = false;
  for (let i = start; i < lines.length; i++) {
    const bare = lines[i]
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, '``');
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
const WANT = ['mondayOfISO', 'recurringValidForWeek', 'recurringTasksForWeek', 'publicationScheduleGate'];
function buildModule() {
  const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
  const found = [], missing = [];
  let end = -1;
  for (const fn of WANT) {
    const s = lines.findIndex(l => new RegExp('^(?:async )?function ' + fn + '\\b').test(l));
    if (s < 0) { missing.push(fn); continue; }
    found.push(fn);
    const e = endOfFn(lines, s);
    if (e > end) end = e;
  }
  if (missing.length) throw new Error('липсват във файла: ' + missing.join(', '));
  const head = lines.slice(0, end + 1).filter(l => !/^import\s/.test(l)).join('\n')
    .replace(/Deno\.env\.get\([^)]*\)!?/g, "''");
  const out = head + '\nexport { ' + found.join(', ') + ' };\n';
  const dir = path.join(os.tmpdir(), 'tmax-dr-pub');
  fs.mkdirSync(dir, { recursive: true });
  const tag = require('crypto').createHash('sha1').update(out).digest('hex').slice(0, 12);
  const file = path.join(dir, 'slice-' + tag + '.ts');
  fs.writeFileSync(file, out);
  return file;
}

/* Фалшив клиент: eq() се прилага НАИСТИНА; maybeSingle() → първия ред или null. */
function fakeSb(data, log, failTable) {
  return {
    from(table) {
      const q = { table: table, filters: [], single: false };
      const run = () => {
        log.push(q);
        if (failTable === table) return { data: null, error: { message: 'boom' } };
        const rows = (data[table] || []).filter(r => q.filters.every(f => String(r[f[1]]) === String(f[2])));
        return { data: q.single ? (rows[0] || null) : rows, error: null };
      };
      const self = {
        select() { return self; },
        eq(c, v) { q.filters.push(['eq', c, v]); return self; },
        maybeSingle() { q.single = true; return Promise.resolve(run()); },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return self;
    },
  };
}

/* Седмица С38: пн 14.09.2026 … нд 20.09; С39 започва на 21.09. */
const MON38 = '2026-09-14', FRI38 = '2026-09-18', SUN38 = '2026-09-20', MON39 = '2026-09-21', MON37 = '2026-09-07';
function base() {
  return {
    bulletins: [{ id: 'b-pub', status: 'published' }, { id: 'b-draft', status: 'draft' }],
    bulletin_tasks: [{ id: 't-pub', bulletin_id: 'b-pub' }, { id: 't-draft', bulletin_id: 'b-draft' },
                     { id: 't-orphan', bulletin_id: 'b-gone' }],
    task_subtasks: [{ id: 's-pub', task_id: 't-pub' }, { id: 's-draft', task_id: 't-draft' }],
    recurring_tasks: [
      { id: 'r-now', active: true }, { id: 'r-future', active: false }, { id: 'r-ended', active: false },
      { id: 'r-noper-on', active: true }, { id: 'r-noper-off', active: false }
    ],
    recurring_task_periods: [
      { recurring_task_id: 'r-now', from_monday: MON38, to_monday: null },
      { recurring_task_id: 'r-future', from_monday: MON39, to_monday: null },
      { recurring_task_id: 'r-ended', from_monday: '2026-08-31', to_monday: MON37 }
    ]
  };
}
const sched = (type, id) => ({ id: 'n-1', entity_type: type, entity_id: id });

let mod = null;
async function gate(type, id, day, opts) {
  opts = opts || {};
  const log = [];
  const r = await mod.publicationScheduleGate(fakeSb(opts.data || base(), log, opts.fail), sched(type, id), day || FRI38);
  return { r: r || {}, log: log };
}
const sent = g => !g.r.skip;

(async function main() {

  section('0. Реалният код се зарежда в Node');
  {
    let file = null;
    if (!guard('изрязването на модула минава', () => { file = buildModule(); })) { report(); return; }
    try { mod = await import(pathToFileURL(file).href); }
    catch (e) { ok('модулът се импортира', false, e && e.message); report(); return; }
    ok('publicationScheduleGate е изнесена', typeof mod.publicationScheduleGate === 'function');
  }

  section('1. Копията съвпадат ДОСЛОВНО с shared.js');
  {
    const shared = fs.readFileSync(SHARED, 'utf8'), edge = fs.readFileSync(SRC, 'utf8');
    ['recurringValidForWeek', 'recurringTasksForWeek'].forEach(fn => {
      const a = fnText(shared, fn), b = fnText(edge, fn);
      ok(fn + ': байт по байт', !!a && a === b, !a ? 'няма я в shared.js' : 'разминаване');
    });
    /* mondayOfISO срещу recurringMondayOf от shared.js, за всеки ден. */
    const ctx = {}; vm.createContext(ctx);
    vm.runInContext(fnText(shared, 'recurringMondayOf'), ctx);
    let bad = [];
    for (let d = new Date(2024, 0, 1, 12); d.getFullYear() < 2032; d.setDate(d.getDate() + 1)) {
      const p = x => String(x).padStart(2, '0');
      const iso = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      const want = ctx.recurringMondayOf(new Date(d.getTime()));
      if (mod.mondayOfISO(iso) !== want) bad.push(iso + '→' + mod.mondayOfISO(iso) + '≠' + want);
    }
    ok('mondayOfISO = recurringMondayOf за всеки ден 2024–2031', bad.length === 0, bad.slice(0, 3).join(' '));
  }

  section('2. Задача от бюлетина');
  {
    ok('публикуван → тръгва', sent(await gate('task', 't-pub')));
    const d = await gate('task', 't-draft');
    ok('чернова → НЕ тръгва', !sent(d), JSON.stringify(d.r));
    ok('причината е „бюлетинът не е публикуван"', d.r.skip === 'бюлетинът не е публикуван', String(d.r.skip));
    ok('бюлетинът изчезнал → НЕ тръгва', !sent(await gate('task', 't-orphan')));
    const g = await gate('task', 't-deleted');
    ok('изтрита задача → НЕ тръгва', !sent(g) && /не е намерена/.test(g.r.skip), JSON.stringify(g.r));
    const f = await gate('task', 't-draft', FRI38, { fail: 'bulletins' });
    ok('провал на заявката към bulletins → тръгва (fail-open)', sent(f), JSON.stringify(f.r));
  }

  section('3. Под-задача → задачата ѝ → бюлетинът');
  {
    ok('под-задача на публикуван → тръгва', sent(await gate('subtask', 's-pub')));
    const d = await gate('subtask', 's-draft');
    ok('под-задача на чернова → НЕ тръгва', !sent(d), JSON.stringify(d.r));
    ok('веригата минава през task_subtasks → bulletin_tasks → bulletins',
      d.log.map(q => q.table).join('>') === 'task_subtasks>bulletin_tasks>bulletins', d.log.map(q => q.table).join('>'));
    ok('изтрита под-задача → НЕ тръгва', !sent(await gate('subtask', 's-deleted')));
  }

  section('4. Постоянна задача — седмицата на напомнянето');
  {
    ok('период от този понеделник → тръгва', sent(await gate('recurring_task', 'r-now', FRI38)));
    ok('граница: в самия понеделник на периода → тръгва', sent(await gate('recurring_task', 'r-now', MON38)));
    const f = await gate('recurring_task', 'r-future', FRI38);
    ok('период от следващия понеделник → НЕ тръгва', !sent(f), JSON.stringify(f.r));
    ok('граница: неделя преди периода → НЕ тръгва', !sent(await gate('recurring_task', 'r-future', SUN38)));
    ok('граница: понеделникът на периода → тръгва', sent(await gate('recurring_task', 'r-future', MON39)));
    ok('приключил период (до С37) → НЕ тръгва', !sent(await gate('recurring_task', 'r-ended', FRI38)));
    ok('в последната седмица на приключилия период → тръгва', sent(await gate('recurring_task', 'r-ended', '2026-09-09')));
    ok('без период, active=true → тръгва (резервата)', sent(await gate('recurring_task', 'r-noper-on')));
    ok('без период, active=false → НЕ тръгва', !sent(await gate('recurring_task', 'r-noper-off')));
    ok('изтрита постоянна → НЕ тръгва', !sent(await gate('recurring_task', 'r-deleted')));
    const pf = await gate('recurring_task', 'r-noper-on', FRI38, { fail: 'recurring_task_periods' });
    ok('провал на периодите → пада към active (true → тръгва)', sent(pf), JSON.stringify(pf.r));
    const q = (await gate('recurring_task', 'r-now')).log.find(x => x.table === 'recurring_task_periods');
    ok('периодите се теглят само за тази задача', !!q && q.filters.some(f => f[1] === 'recurring_task_id' && f[2] === 'r-now'),
      JSON.stringify(q && q.filters));
  }

  section('5. Промоция — без проверка и без заявки');
  {
    const g = await gate('promotion', 'p-1');
    ok('тръгва', sent(g));
    ok('нула заявки', g.log.length === 0, g.log.map(x => x.table).join(','));
  }

  section('6. В цикъла проверката стои ПРЕДИ изпращането');
  {
    const src = fs.readFileSync(SRC, 'utf8');
    const serve = src.slice(src.indexOf('Deno.serve('));
    const call = serve.search(/const pub: any = await publicationScheduleGate\(supabase, s, todayStr\);\s*\n\s*if \(pub\.skip\) \{ skipped\.push\(\{ id: s\.id, reason: pub\.skip \}\); continue; \}/);
    const send = serve.indexOf('await fetch(SEND_FN_URL');
    const stamp = serve.indexOf('last_sent_at: now.toISOString()');
    ok('извикването и continue са в Deno.serve', call >= 0);
    ok('преди fetch към resend-email', call >= 0 && send > call, call + ' / ' + send);
    ok('преди записа на last_sent_at', call >= 0 && stamp > call);
  }

  report();
})().catch(function (e) {
  ok('тестът стига до края без необработено изключение', false, e && e.stack);
  report();
});
