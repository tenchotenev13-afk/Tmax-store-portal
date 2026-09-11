/* dynamic-responder: насрочено напомняне по постоянна задача, изключена за
   седмицата (recurring_task_skips), НЕ тръгва.

     · изключена за всички → никакво напомняне;
     · изключена за обект  → обектът излиза от адресатите; не остане ли
       нито един — напомняне няма;
     · напомняне без адресати (до всички) остава до всички — магазинното
       изключване не се изразява в push без филтър (решение, заковано тук);
     · ключът е седмицата на ДНЕС; изключване за съседна седмица не важи;
     · напомнянията по други неща (задача от бюлетина, промоция) не се пипат
       и не пращат заявка към recurring_task_skips.

   ═══ КАК СЕ ПУСКА ЕДЖ ФУНКЦИЯТА ═══
   Като overdue-recurring / recurring-task-skips-notify: реже се РЕАЛНИЯТ
   index.ts до края на recurringScheduleGate() (преди Deno.serve), махат се
   jsr импортите, Deno.env.get() → '', Node изрязва типовете. Фалшивият
   клиент прилага eq() НАИСТИНА — иначе проверката за седмицата е декор.

   Плюс: isoWeekOf() тук = recurringSkipWeekOf() в shared.js за всеки ден
   2024–2031; копията на recurringIsSkipped/recurringSkipStores = shared.js.

   Пускане: node tests/recurring-task-skips-responder.test.js . */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, guard, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const SRC = path.join(ROOT, 'supabase/functions/dynamic-responder/index.ts');
const SHARED = path.join(ROOT, 'shared.js');

/* ── Дати: котва = понеделникът на текущата реална седмица ────────────── */
const ANCHOR_MON = (function () {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
})();
function dateAt(n) { const d = new Date(ANCHOR_MON.getTime()); d.setDate(d.getDate() + n); return d; }
function isoAt(n) {
  const d = dateAt(n), p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
/* ISO двойка, сметната НЕЗАВИСИМО от кода под тест. */
function isoKey(d) {
  const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const y = t.getFullYear(), jan4 = new Date(y, 0, 4);
  const mon1 = new Date(jan4); mon1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  return { week: 1 + Math.round((t - mon1) / 86400000 / 7 - 3 / 7), year: y };
}

/* ── Срез от реалния файл ─────────────────────────────────────────────── */
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
const WANT = ['isoWeekOf', 'recurringIsSkipped', 'recurringSkipStores', 'recurringScheduleGate'];
function buildModule() {
  const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
  const found = [];
  let end = -1;
  for (const fn of WANT) {
    const s = lines.findIndex(l => new RegExp('^(?:async )?function ' + fn + '\\b').test(l));
    if (s < 0) continue;
    found.push(fn);
    const e = endOfFn(lines, s);
    if (e > end) end = e;
  }
  if (!found.length) return null;   /* старият файл: нищо за рязане */
  const head = lines.slice(0, end + 1).filter(l => !/^import\s/.test(l)).join('\n')
    .replace(/Deno\.env\.get\([^)]*\)!?/g, "''");
  const out = head + '\nexport { ' + found.join(', ') + ' };\n';
  const dir = path.join(os.tmpdir(), 'tmax-dr-skips');
  fs.mkdirSync(dir, { recursive: true });
  const tag = require('crypto').createHash('sha1').update(out).digest('hex').slice(0, 12);
  const file = path.join(dir, 'slice-' + tag + '.ts');
  fs.writeFileSync(file, out);
  return file;
}

/* ── Фалшив клиент ────────────────────────────────────────────────────── */
function fakeSb(rows, log, fail) {
  return {
    from(table) {
      const q = { table: table, filters: [] };
      const self = {
        select(c) { q.select = c; return self; },
        eq(c, v) { q.filters.push(['eq', c, v]); return self; },
        then(res, rej) {
          log.push(q);
          if (fail) return Promise.resolve({ data: null, error: { message: 'boom' } }).then(res, rej);
          const out = (table === 'recurring_task_skips' ? rows : [])
            .filter(r => q.filters.every(f => r[f[1]] === f[2]));
          return Promise.resolve({ data: out }).then(res, rej);
        },
      };
      return self;
    },
  };
}
const TR = 'Троян', LO = 'Ловеч', SE = 'Севлиево';
const thisWk = isoKey(dateAt(0)), nextWk = isoKey(dateAt(7)), prevWk = isoKey(dateAt(-7));
const sk = (task, k, store) => ({ recurring_task_id: task, year: k.year, week_number: k.week, store_name: store || null });
const sched = (over) => Object.assign({ id: 'n-1', entity_type: 'recurring_task', entity_id: 'r-x' }, over || {});

let mod = null;
async function gate(s, stores, todayStr, rows, cache, fail) {
  const log = [];
  const c = cache || { skips: null };
  const r = await mod.recurringScheduleGate(fakeSb(rows, log, fail), s, stores, todayStr, c);
  return { r: r, log: log, cache: c };
}
const skipQ = log => log.filter(q => q.table === 'recurring_task_skips');

(async function main() {

  section('0. Реалният код се зарежда в Node');
  {
    let file = null;
    guard('изрязването минава', () => { file = buildModule(); });
    ok('recurringScheduleGate я има във файла', !!file);
    if (!file) { report(); return; }
    try { mod = await import(pathToFileURL(file).href); }
    catch (e) { ok('модулът се импортира', false, e && e.message); report(); return; }
    ok('модулът се импортира', typeof mod.recurringScheduleGate === 'function');
  }

  section('1. isoWeekOf() = recurringSkipWeekOf() в shared.js; копията = shared.js');
  {
    const shared = fs.readFileSync(SHARED, 'utf8'), edge = fs.readFileSync(SRC, 'utf8');
    let skipWeekOf = null;
    guard('recurringSkipWeekOf се взима от shared.js', () => {
      skipWeekOf = new Function(fnText(shared, 'recurringSkipWeekOf') + '\nreturn recurringSkipWeekOf;')();
    });
    if (skipWeekOf) {
      const e1 = mod.isoWeekOf('2025-12-29'), e2 = mod.isoWeekOf('2027-01-01');
      ok('29.12.2025 → 2026 С1', e1.year === 2026 && e1.week === 1, JSON.stringify(e1));
      ok('01.01.2027 → 2026 С53', e2.year === 2026 && e2.week === 53, JSON.stringify(e2));
      let bad = 0, first = '';
      for (let d = new Date(2024, 0, 1); d <= new Date(2031, 11, 31); d.setDate(d.getDate() + 1)) {
        const p = x => String(x).padStart(2, '0');
        const s = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
        const a = mod.isoWeekOf(s), b = skipWeekOf(new Date(d));
        if (a.week !== b.week || a.year !== b.year) { bad++; if (!first) first = s; }
      }
      ok('съвпадат за всеки ден 2024–2031', bad === 0, first);
    }
    const norm = s => (s || '').replace(/\s+/g, '');
    ['recurringIsSkipped', 'recurringSkipStores'].forEach(fn => {
      ok(fn + ' е дословно копие на shared.js', !!fnText(edge, fn) && norm(fnText(edge, fn)) === norm(fnText(shared, fn)));
    });
  }

  section('2. Глобално изключване за седмицата на днес → не тръгва');
  {
    const { r, log } = await gate(sched(), [TR, LO], isoAt(2), [sk('r-x', thisWk)]);
    ok('връща skip', !!r.skip, JSON.stringify(r));
    const q = skipQ(log);
    ok('една заявка — за СЕДМИЦАТА НА ДНЕС', q.length === 1 &&
      q[0].filters.some(f => f[1] === 'year' && f[2] === thisWk.year) &&
      q[0].filters.some(f => f[1] === 'week_number' && f[2] === thisWk.week), JSON.stringify(q[0] && q[0].filters));
    const b = await gate(sched(), [], isoAt(2), [sk('r-x', thisWk)]);
    ok('и до всички (без адресати) не тръгва', !!b.r.skip);
  }

  section('3. Магазинно изключване → обектът излиза от адресатите');
  {
    const rows = [sk('r-x', thisWk, TR)];
    const a = await gate(sched(), [TR, LO, SE], isoAt(2), rows);
    ok('Троян излиза, остават Ловеч и Севлиево', JSON.stringify(a.r.stores) === JSON.stringify([LO, SE]), JSON.stringify(a.r));
    const b = await gate(sched(), [TR], isoAt(2), rows);
    ok('единственият адресат е изключен → не тръгва', !!b.r.skip, JSON.stringify(b.r));
    const c = await gate(sched(), [], isoAt(2), rows);
    ok('без адресати (до всички) → остава до всички (решение)', !c.r.skip && Array.isArray(c.r.stores) && c.r.stores.length === 0, JSON.stringify(c.r));
    const d = await gate(sched({ entity_id: 'r-other' }), [TR, LO], isoAt(2), rows);
    ok('друга постоянна задача не е засегната', JSON.stringify(d.r.stores) === JSON.stringify([TR, LO]));
  }

  section('4. Съседна седмица не важи');
  {
    const rows = [sk('r-x', nextWk), sk('r-x', prevWk, TR)];
    const a = await gate(sched(), [TR, LO], isoAt(2), rows);
    ok('изключване за следващата и миналата седмица → тръгва към всички адресати', JSON.stringify(a.r.stores) === JSON.stringify([TR, LO]), JSON.stringify(a.r));
    /* Неделя е последният ден на седмицата: изключването за нея (текущата)
       важи; в понеделник вече е следващата. */
    const sun = await gate(sched(), [TR], isoAt(6), [sk('r-x', thisWk, TR)]);
    ok('в неделя изключването за текущата седмица важи', !!sun.r.skip);
    const mon = await gate(sched(), [TR], isoAt(7), [sk('r-x', thisWk, TR)]);
    ok('в следващия понеделник вече не важи', !mon.r.skip && JSON.stringify(mon.r.stores) === JSON.stringify([TR]));
  }

  section('5. Други напомняния не се пипат и не питат базата');
  {
    for (const et of ['task', 'subtask', 'promotion']) {
      const { r, log } = await gate(sched({ entity_type: et }), [TR], isoAt(2), [sk('r-x', thisWk)]);
      ok(et + ': адресатите са непокътнати, заявка няма', JSON.stringify(r.stores) === JSON.stringify([TR]) && skipQ(log).length === 0);
    }
  }

  section('6. Кеш: изключванията се теглят веднъж на събуждане');
  {
    const cache = { skips: null }, log = [];
    const sb = fakeSb([sk('r-x', thisWk, TR)], log);
    await mod.recurringScheduleGate(sb, sched({ id: 'a' }), [TR, LO], isoAt(2), cache);
    await mod.recurringScheduleGate(sb, sched({ id: 'b', entity_id: 'r-y' }), [TR], isoAt(2), cache);
    ok('две напомняния по постоянни задачи → една заявка', skipQ(log).length === 1, skipQ(log).length);
  }

  section('7. Провал на заявката → напомнянето тръгва както преди');
  {
    const { r } = await gate(sched(), [TR, LO], isoAt(2), [sk('r-x', thisWk)], null, true);
    ok('няма skip, адресатите са непокътнати', !r.skip && JSON.stringify(r.stores) === JSON.stringify([TR, LO]), JSON.stringify(r));
  }

  section('8. Обработчикът ползва гейта и не пише last_sent_at за пропуснатото');
  {
    const src = fs.readFileSync(SRC, 'utf8');
    const iGate = src.indexOf('await recurringScheduleGate(');
    const iFilters = src.indexOf('if (stores.length) {', iGate);
    const iFetch = src.indexOf('await fetch(SEND_FN_URL', iGate);
    ok('гейтът се вика в Deno.serve', iGate > src.indexOf('Deno.serve('));
    ok('преди строенето на филтъра и преди изпращането', iGate > 0 && iFilters > iGate && iFetch > iGate);
    ok('при skip — continue (без изпращане и без last_sent_at)', /if \(gate\.skip\) \{ skipped\.push\(\{ id: s\.id, reason: gate\.skip \}\); continue; \}/.test(src));
    ok('отговорът носи skipped', /results, skipped, debug_bg_time/.test(src));
  }

  report();
})().catch(function (e) {
  ok('тестът стига до края без необработено изключение', false, e && e.stack);
  report();
});
