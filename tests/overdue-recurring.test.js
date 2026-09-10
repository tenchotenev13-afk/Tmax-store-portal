/* „Незавършени задачи": постоянните задачи също се проверяват.

   Дефектът (лог от 10.09.2026, 08:15): buildOverdueTasks четеше ЕДИНСТВЕНО
   bulletin_tasks — заявката в лога е `task_id=in.(2 id-та)` и нищо друго.
   Постоянните задачи не се проверяваха никога. На 09.09 „Ревизии 953" беше
   пропусната от 12 обекта, „Ревизия групи" от Троян, и не тръгна писмо.

   Правилото за постоянните е различно от това за обикновените и точно
   затова има тест: гледа се САМО ВЧЕРА. Обикновената задача от бюлетина се
   влачи назад докато не бъде отметната; постоянната се явява всяка седмица
   и „назад докъдето стигне" би повтаряло едно и също всеки ден.

   ═══ КАК СЕ ПУСКА ЕДЖ ФУНКЦИЯ ОТ NODE ═══
   Тестът НЕ преписва логиката. Реже реалния файл до края на
   buildOverdueTasks, маха двата jsr импорта, подменя Deno.env.get() със
   стъб и оставя Node да изреже типовете (v22.18+/24 го прави сам за .ts).
   Тоест изпълнява се СЪЩИЯТ код, който се деплойва — препис би значел тест,
   който минава срещу собственото си копие.

   Фалшивият supabase клиент прилага eq/in/gte/lte НАИСТИНА. Ако ги
   игнорираше, проверката „отмятане извън прозореца не се брои" щеше да
   минава заради JS филтъра надолу, а заявката спокойно можеше да няма
   филтър по дата — тоест тавтологичен тест върху точно това, което ни
   интересува.

   ⚠️ Никакви фиксирани календарни дати: котва (понеделникът от текущата
   реална седмица) + отместване.

   Пускане: node tests/overdue-recurring.test.js . */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, guard, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const SRC = path.join(ROOT, 'supabase/functions/bulletin-notify/index.ts');

/* ── Котва и дати ────────────────────────────────────────────────────────── */
const ANCHOR_MON = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
})();
function isoAt(n) {
  const d = new Date(ANCHOR_MON.getTime());
  d.setDate(d.getDate() + n);
  const p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
const MON = isoAt(0), TUE = isoAt(1), WED = isoAt(2), THU = isoAt(3);

/* bg, какъвто го строи bgNow() за българско време. Котвата е понеделник,
   затова отместването n е и индексът на деня (0=Пон..6=Нед). */
const DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function mkBg(n) {
  return {
    dateStr: isoAt(n), hours: 8, minutes: 15,
    dow: DOW[n], isoWeekday: n + 1, weekdayIdx: n,
  };
}

/* ── Изрязване на реалния buildOverdueTasks в изпълним модул ─────────────── */
/* Краят на функция, започваща на ред `start`, по БРОЯЧ на скоби — не по
   „ред, който е точно }". Същата причина като в report-edge-sync.test.js. */
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

/* Кои функции трябва да са в среза. Списъкът е ИЗРИЧЕН, а не „режи до
   buildOverdueTasks": помощниците ѝ са пръснати из файла и някои (plusDaysISO)
   стоят СЛЕД нея. Срезът стига до края на най-долната от тях — всичко между
   тях са декларации на функции, които не правят нищо при зареждане. */
const REQUIRED = ['buildOverdueTasks', 'overdueHtmlFor', 'plusDaysISO',
  'recurringDueOnWeekday'];
/* НОВИ с тази промяна. Ако ги няма, срезът пак се строи и тестът пада на
   същинските проверки с четлив изход. Иначе срещу стария код умира още на
   рязането и не се вижда КАКВО не работи — само че нещо липсва. */
const OPTIONAL = ['recurringWindowDatesForISO'];

function buildModule() {
  const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
  const found = [];
  let end = -1;
  const missing = [];
  for (const fn of REQUIRED.concat(OPTIONAL)) {
    const re = new RegExp('^(?:async )?function ' + fn + '\\b');
    const s = lines.findIndex(l => re.test(l));
    if (s < 0) {
      if (REQUIRED.indexOf(fn) >= 0) missing.push(fn);
      continue;
    }
    found.push(fn);
    const e = endOfFn(lines, s);
    if (e > end) end = e;
  }
  if (missing.length) throw new Error('липсват във файла: ' + missing.join(', '));
  if (end < 0) throw new Error('краят на нужните функции не се намери');

  const head = lines.slice(0, end + 1)
    .filter(l => !/^import\s/.test(l))
    .join('\n')
    /* Deno-специфичното на модулно ниво. Стойностите не се ползват от
       buildOverdueTasks, но липсва ли Deno, файлът гърми при зареждане. */
    .replace(/Deno\.env\.get\([^)]*\)!?/g, "''");

  const out = head + '\nexport { ' + found.join(', ') + ' };\n';
  const dir = path.join(os.tmpdir(), 'tmax-bn-overdue');
  fs.mkdirSync(dir, { recursive: true });
  /* Името носи хеш на съдържанието: Node кешира ESM модулите по URL, тоест
     един и същи път със сменено съдържание би върнал СТАРИЯ модул в рамките
     на един процес — а тестът се пуска и срещу два различни среза
     (текущия код и този от HEAD) в run-all. */
  const tag = require('crypto').createHash('sha1').update(out).digest('hex').slice(0, 12);
  const file = path.join(dir, 'slice-' + tag + '.ts');
  fs.writeFileSync(file, out);
  return file;
}

/* ── Фалшив supabase клиент, който наистина филтрира ─────────────────────── */
function fakeSb(data, log) {
  const pass = (row, f) => {
    const v = row[f[1]];
    if (f[0] === 'eq') return v === f[2];
    if (f[0] === 'in') return f[2].indexOf(v) >= 0;
    if (v === null || v === undefined) return false;  /* NULL не съвпада с range, както в SQL */
    if (f[0] === 'gte') return String(v) >= String(f[2]);
    if (f[0] === 'lte') return String(v) <= String(f[2]);
    return true;
  };
  return {
    from(table) {
      const q = { table: table, filters: [], limit: null };
      const self = {
        select(cols) { q.select = cols; return self; },
        eq(c, v) { q.filters.push(['eq', c, v]); return self; },
        in(c, v) { q.filters.push(['in', c, v]); return self; },
        gte(c, v) { q.filters.push(['gte', c, v]); return self; },
        lte(c, v) { q.filters.push(['lte', c, v]); return self; },
        limit(n) { q.limit = n; return self; },
        update() { return self; },
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

/* ── Данни ───────────────────────────────────────────────────────────────── */
const STORES = ['Троян', 'Ловеч', 'Севлиево'];
const users = STORES.map(s => ({ store_name: s, active: true }));
const BUL = { id: 'b-1', week_number: 99, year: 2026 };

function rec(over) {
  return Object.assign({
    id: 'r-1', title: 'Ревизия групи', department: 'trade', active: true,
    task_type: 'info', due_weekday: 1, due_weekdays: [1], due_time: '16:00',
    due_window: false, target_stores: null, report_groups: null,
  }, over || {});
}
function comp(over) {
  return Object.assign({
    task_id: null, recurring_task_id: 'r-1', store_name: STORES[0],
    status: 'done', completion_date: TUE,
  }, over || {});
}

let mod = null;
async function run(opts) {
  opts = opts || {};
  const log = [];
  const data = {
    bulletins: [Object.assign({ week_number: 99, year: 2026 }, BUL)],
    bulletin_tasks: opts.bulTasks || [],
    recurring_tasks: opts.recurring || [],
    task_completions: opts.comps || [],
    users: users,
  };
  /* isoWeekOf() смята истинска ISO седмица от датата; фалшивият клиент
     филтрира по week_number/year, затова бюлетинът трябва да мине. Правим
     го „универсален", за да не зависи тестът от коя седмица е реално днес. */
  data.bulletins = [{ id: 'b-1', week_number: null, year: null }];
  const sb = {
    from(t) {
      if (t === 'bulletins') {
        const self = {
          select() { return self; }, eq() { return self; }, limit() { return self; },
          then(res, rej) { log.push({ table: 'bulletins', filters: [] }); return Promise.resolve({ data: [BUL] }).then(res, rej); },
        };
        return self;
      }
      return fakeSb(data, log).from(t);
    },
  };
  const built = await mod.buildOverdueTasks(sb, mkBg(opts.at === undefined ? 2 : opts.at));
  return { built: built, log: log };
}

const titlesOf = b => (b.items || []).map(i => i.kind + ':' + i.title + '@' + i.store);
const recItems = b => (b.items || []).filter(i => i.kind === 'recurring');

(async function main() {

  section('0. Реалният buildOverdueTasks се зарежда в Node');
  {
    let file = null;
    if (!guard('изрязването на модула минава', () => { file = buildModule(); })) { report(); return; }
    try {
      mod = await import(pathToFileURL(file).href);
    } catch (e) {
      ok('модулът се импортира', false, e.message); report(); return;
    }
    ok('buildOverdueTasks е изнесена', typeof mod.buildOverdueTasks === 'function');
    ok('plusDaysISO е изнесена', typeof mod.plusDaysISO === 'function');
    if (typeof mod.plusDaysISO === 'function') {
      ok('plusDaysISO(-1) дава вчера', mod.plusDaysISO(WED, -1) === TUE,
        mod.plusDaysISO(WED, -1) + ' vs ' + TUE);
    }
  }

  /* ═══ 1. Обикновена постоянна задача ═════════════════════════════════ */
  section('1. Постоянна задача за ВТОРНИК, без отметка → влиза');
  {
    const r = await run({ at: 2, recurring: [rec()] });   /* днес сряда → вчера вторник */
    const b = r.built;
    if (ok('темата не е пропусната', !b.skip, String(b.skip))) {
      const its = recItems(b);
      ok('три реда — по един на обект', its.length === 3, JSON.stringify(titlesOf(b)));
      ok('срокът е ВЧЕРА', its.every(i => i.due === TUE), JSON.stringify(its.map(i => i.due)));
      ok('носят kind=recurring', its.every(i => i.kind === 'recurring'));
      const key = 'recurring:r-1';
      if (ok('taskStats е с ключ kind:id', !!b.taskStats[key], Object.keys(b.taskStats).join(', '))) {
        ok('kind е записан и там', b.taskStats[key].kind === 'recurring');
        ok('няма автор (recurring_tasks нямат created_by)',
          b.taskStats[key].createdBy === null, String(b.taskStats[key].createdBy));
        ok('3 от 3 не са изпълнили', b.taskStats[key].missing === 3 && b.taskStats[key].total === 3,
          b.taskStats[key].missing + '/' + b.taskStats[key].total);
      }
    }
  }

  section('1б. Същата задача с отметка за вторник → обектът отпада');
  {
    const r = await run({ at: 2, recurring: [rec()], comps: [comp({ store_name: 'Троян' })] });
    const its = recItems(r.built);
    ok('остават два обекта', its.length === 2, JSON.stringify(its.map(i => i.store)));
    ok('Троян го няма', its.every(i => i.store !== 'Троян'), JSON.stringify(its.map(i => i.store)));
  }

  section('1в. Отметка за ДРУГ ден не спасява обекта');
  {
    const r = await run({ at: 2, recurring: [rec()], comps: [comp({ completion_date: MON })] });
    const its = recItems(r.built);
    ok('пак три реда', its.length === 3, JSON.stringify(its.map(i => i.store)));
  }

  section('1г. Отложена (postponed) НЕ е подадена');
  {
    const r = await run({ at: 2, recurring: [rec()], comps: [comp({ status: 'postponed' })] });
    const its = recItems(r.built);
    ok('Троян още е в списъка', its.some(i => i.store === 'Троян'),
      JSON.stringify(its.map(i => i.store)));
  }

  section('1д. Задача, недължима вчера, не влиза');
  {
    /* due_weekdays=[3] (четвъртък), вчера е вторник. */
    const r = await run({ at: 2, recurring: [rec({ due_weekday: 3, due_weekdays: [3] })] });
    ok('темата се пропуска', !!r.built.skip, JSON.stringify(titlesOf(r.built)));
  }

  section('1е. Постоянна БЕЗ ден и БЕЗ час не влиза');
  {
    const r = await run({ at: 2, recurring: [rec({ due_weekday: null, due_weekdays: null, due_time: null })] });
    ok('темата се пропуска', !!r.built.skip, JSON.stringify(titlesOf(r.built)));
  }

  section('1ж. notice не влиза');
  {
    const r = await run({ at: 2, recurring: [rec({ task_type: 'notice' })] });
    ok('темата се пропуска', !!r.built.skip, JSON.stringify(titlesOf(r.built)));
  }

  section('1з. target_stores се зачита');
  {
    const r = await run({ at: 2, recurring: [rec({ target_stores: ['Ловеч'] })] });
    const its = recItems(r.built);
    ok('само един обект', its.length === 1, JSON.stringify(its.map(i => i.store)));
    ok('и той е Ловеч', !!its[0] && its[0].store === 'Ловеч',
      its[0] ? its[0].store : 'няма редове');
    const st1 = (r.built.taskStats || {})['recurring:r-1'];
    ok('знаменателят също е 1', !!st1 && st1.total === 1, st1 && String(st1.total));
  }

  /* ═══ 2. Прозоречна задача ═══════════════════════════════════════════ */
  const win = () => rec({ id: 'r-w', title: 'Ревизии 953', due_window: true, due_weekdays: [0, 1, 2], due_weekday: 0 });

  section('2. Прозорец Пон–Сря, днес ЧЕТВЪРТЪК (вчера = срокът), без отметка → влиза');
  {
    const r = await run({ at: 3, recurring: [win()] });
    const its = recItems(r.built);
    ok('три реда', its.length === 3, JSON.stringify(its.map(i => i.store)));
    ok('срокът е сряда (вчера)', its.every(i => i.due === WED), JSON.stringify(its.map(i => i.due)));
  }

  section('2б. Същото, но с отметка в ПОНЕДЕЛНИК → обектът отпада');
  {
    /* Ядрото на прозореца: свършена в понеделник е свършена, макар срокът
       да е сряда. При eq-сравнение по вчера този обект щеше да излезе
       неизпълнил. */
    const r = await run({
      at: 3, recurring: [win()],
      comps: [comp({ recurring_task_id: 'r-w', store_name: 'Троян', completion_date: MON })],
    });
    const its = recItems(r.built);
    ok('остават два обекта', its.length === 2, JSON.stringify(its.map(i => i.store)));
    ok('Троян го няма', its.every(i => i.store !== 'Троян'), JSON.stringify(its.map(i => i.store)));
  }

  section('2в. Отметка ИЗВЪН прозореца (четвъртък от миналата седмица) не брои');
  {
    const r = await run({
      at: 3, recurring: [win()],
      comps: [comp({ recurring_task_id: 'r-w', store_name: 'Троян', completion_date: isoAt(-4) })],
    });
    const its = recItems(r.built);
    ok('пак три реда', its.length === 3, JSON.stringify(its.map(i => i.store)));
  }

  section('2г. Днес СРЯДА (вчера = вторник, НЕ е срокът) → прозоречната не влиза');
  {
    const r = await run({ at: 2, recurring: [win()] });
    ok('темата се пропуска', !!r.built.skip, JSON.stringify(titlesOf(r.built)));
  }

  /* ═══ 3. Заявката ════════════════════════════════════════════════════ */
  section('3. Заявката за постоянните носи филтър по ДАТА (1000-row cap)');
  {
    const r = await run({ at: 3, recurring: [win()] });
    const q = r.log.filter(x => x.table === 'task_completions'
      && x.filters.some(f => f[1] === 'recurring_task_id'))[0];
    if (ok('има такава заявка', !!q, JSON.stringify(r.log.map(x => x.table)))) {
      const gte = q.filters.find(f => f[0] === 'gte' && f[1] === 'completion_date');
      const lte = q.filters.find(f => f[0] === 'lte' && f[1] === 'completion_date');
      ok('има долна граница', !!gte, JSON.stringify(q.filters));
      ok('има горна граница', !!lte, JSON.stringify(q.filters));
      ok('долната стига до началото на прозореца (понеделник)',
        !!gte && gte[2] === MON, gte && gte[2]);
      ok('горната е вчера (сряда)', !!lte && lte[2] === WED, lte && lte[2]);
    }
  }

  section('3б. Постоянните изобщо се четат — заявка към recurring_tasks');
  {
    const r = await run({ at: 2, recurring: [rec()] });
    const q = r.log.filter(x => x.table === 'recurring_tasks')[0];
    if (ok('има заявка към recurring_tasks', !!q, JSON.stringify(r.log.map(x => x.table)))) {
      ok('само активните', q.filters.some(f => f[0] === 'eq' && f[1] === 'active' && f[2] === true),
        JSON.stringify(q.filters));
    }
  }

  /* ═══ 4. Обикновените задачи не са пипани ════════════════════════════ */
  section('4. Обикновена задача от бюлетина — както преди');
  {
    const bt = {
      id: 't-1', bulletin_id: 'b-1', title: 'Опис на палетите',
      due_date: MON, due_dates: null,
      task_type: 'info', target_stores: null, report_groups: null, created_by: 'Админ',
    };
    const r = await run({ at: 2, bulTasks: [bt] });
    const b = r.built;
    if (ok('темата не е пропусната', !b.skip, String(b.skip))) {
      const its = (b.items || []).filter(i => i.kind === 'regular');
      ok('три реда', its.length === 3, JSON.stringify(its.map(i => i.store)));
      ok('срокът е нейният due_date, не вчера', its.every(i => i.due === MON),
        JSON.stringify(its.map(i => i.due)));
      const key = 'regular:t-1';
      if (ok('ключът е regular:id', !!b.taskStats[key], Object.keys(b.taskStats).join(', '))) {
        ok('авторът е запазен', b.taskStats[key].createdBy === 'Админ');
      }
      ok('групата на автора още се добавя',
        !!its[0] && its[0].groups.indexOf('creator:Админ') >= 0,
        its[0] ? JSON.stringify(its[0].groups) : 'няма редове');
    }
  }

  section('4б. Двата вида заедно — ключовете не се смесват');
  {
    /* НАРОЧНО едно и също id в двете таблици: точно това пази ключът
       kind+id. При гол id вторият вид би презаписал първия. */
    const bt = {
      id: 'same-id', bulletin_id: 'b-1', title: 'Обикновена',
      due_date: MON, due_dates: null,
      task_type: 'info', target_stores: null, report_groups: null, created_by: null,
    };
    const r = await run({ at: 2, bulTasks: [bt], recurring: [rec({ id: 'same-id', title: 'Постоянна' })] });
    const b = r.built;
    if (ok('темата не е пропусната', !b.skip, String(b.skip))) {
      ok('шест реда общо (3+3)', (b.items || []).length === 6, String((b.items || []).length));
      const sReg = b.taskStats['regular:same-id'];
      const sRec = b.taskStats['recurring:same-id'];
      if (ok('има отделен запис за всеки вид', !!sReg && !!sRec,
        Object.keys(b.taskStats).join(', '))) {
        ok('заглавията не са се презаписали',
          sReg.title === 'Обикновена' && sRec.title === 'Постоянна',
          sReg.title + ' / ' + sRec.title);
      }

      /* И самото писмо трябва да покаже ДВЕ картички, не една. */
      const html = b.items ? mod.overdueHtmlFor(b.items, BUL, b.taskStats, false) : '';
      ok('писмото показва и двете заглавия',
        html.indexOf('Обикновена') >= 0 && html.indexOf('Постоянна') >= 0);
      ok('иконата 🔁 стои пред постоянната',
        html.indexOf('🔁 Постоянна') >= 0, html.slice(html.indexOf('Постоянна') - 60, html.indexOf('Постоянна') + 20));
      ok('обикновената НЕ носи иконата',
        html.indexOf('🔁 Обикновена') < 0);
    }
  }

  section('5. Писмото показва „срок <вчера>" за постоянната');
  {
    const r = await run({ at: 2, recurring: [rec()] });
    const html = r.built.items
      ? mod.overdueHtmlFor(r.built.items, BUL, r.built.taskStats, false) : '';
    const d = TUE.split('-');
    const bgFormat = d[2] + '.' + d[1] + '.' + d[0];
    ok('срокът е вчерашната дата', html.indexOf('срок ' + bgFormat) >= 0, bgFormat);
    ok('няма „зададена от" за постоянната', html.indexOf('зададена от') < 0);
  }

  report();
})();
