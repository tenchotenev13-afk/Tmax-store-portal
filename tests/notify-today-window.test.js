/* Тема „срокове днес" (bulletin-notify) и ПРОЗОРЕЦЪТ — 01.10.2026.

   Еднократната задача с due_window се отмята ВЕДНЪЖ, значи и напомняне ѝ се
   праща веднъж: САМО в деня на срока (последния ден от прозореца), и то само
   на обект, който още не я е отметнал — където и да е в прозореца. Дотук
   темата питаше dueDatesOf(t).indexOf(днес) и пращаше push на всеки от
   четирите дни на С39, включително на обект, свършил работата в понеделник.

   ВТОРИЯТ, скрит дефект от същия клас е в ПОСТОЯННАТА с прозорец: наборът ѝ
   беше наред (recurringDueOnWeekday връща true само за последния ден), но
   отметката се търсеше със completion_date = ДНЕС. Тоест РЕВИЗИЯ 953,
   свършена в понеделник, пак получаваше напомняне в сряда. Заявката вече тегли
   от началото на прозореца — и точно затова условието за НЕпрозоречната
   постоянна задача е изписано изрично (секция 5): по-широката заявка иначе
   би минала вчерашно отмятане за днешно.

   Тестът пуска РЕАЛНИЯ .ts (техниката на postpone-date-notify.test.js) срещу
   фалшив клиент, който наистина филтрира eq/in/gte/lte — така се проверява и
   самата заявка, не само JS условието.

   Еднократна задача без час влиза в прозореца на 08:00 (slotFor(null) =
   EARLIEST_MINUTE), постоянна с due_time 16:00 — на 14:00 (минус LEAD_MINUTES).

   Пускане: node tests/notify-today-window.test.js . */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, guard, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const SRC = path.join(ROOT, 'supabase/functions/bulletin-notify/index.ts');
const BULLETIN = path.join(ROOT, 'bulletin.js');

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
const REQUIRED = ['buildTodayDeadlines', 'taskIsWindow', 'taskWindowDates',
  'dueTodayOneTime', 'promoLabel', 'plusDaysISO', 'loadCarriedTo', 'loadTasksByIds'];
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
  const dir = path.join(os.tmpdir(), 'tmax-bn-window');
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

const TR = 'Троян', LO = 'Ловеч';
const STORES = [TR, LO];
const MON = isoAt(0), TUE = isoAt(1), WED = isoAt(2);

function winTask(over) {
  return Object.assign({
    id: 't-win', bulletin_id: 'b-1', title: 'Излагане палето зони',
    department: 'trade', task_type: 'info',
    due_date: MON, due_dates: [MON, TUE, WED], due_window: true,
    spans_from: null, starts_on: null,
    target_stores: null, report_groups: null, created_by: null
  }, over || {});
}
function recWin(over) {
  return Object.assign({
    id: 'r-win', title: 'РЕВИЗИЯ 953', department: 'trade', active: true, task_type: 'info',
    due_weekday: null, due_weekdays: [0, 1, 2], due_time: '16:00', due_window: true,
    target_stores: null, report_groups: ['controlling']
  }, over || {});
}
function comp(o) {
  return Object.assign({ task_id: null, recurring_task_id: null, status: 'done',
    completion_date: null, postponed_to: null, comment: '', photos: [], files: [] }, o);
}
function data(over) {
  const wk = isoKey(dateAt(0));
  return Object.assign({
    bulletins: [{ id: 'b-1', week_number: wk.week, year: wk.year, status: 'published' }],
    bulletin_tasks: [winTask()],
    recurring_tasks: [],
    recurring_task_periods: [], recurring_task_skips: [], recurring_task_versions: [],
    task_completions: [],
    users: STORES.map(s => ({ store_name: s, active: true }))
  }, over || {});
}
const linesOf = (b, s) => ((b && b.byStore && b.byStore[s]) ? b.byStore[s].lines : []);
const has = (b, s, title) => linesOf(b, s).some(l => l.indexOf(title) === 0);

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

  section('1. taskIsWindow в едж функцията решава като в bulletin.js');
  {
    ok('два дни + флаг → прозорец', mod.taskIsWindow(winTask()) === true);
    ok('без флага → не', mod.taskIsWindow(winTask({ due_window: false })) === false);
    ok('един ден + флаг → ИГНОРИРА се',
      mod.taskIsWindow(winTask({ due_dates: [WED] })) === false);
    ok('notice → не се прилага',
      mod.taskIsWindow(winTask({ task_type: 'notice' })) === false);
    ok('многоседмична → не се прилага',
      mod.taskIsWindow(winTask({ spans_from: MON })) === false);
    ok('срокът е ПОСЛЕДНИЯТ ден',
      mod.taskWindowDates(winTask()).slice(-1)[0] === WED,
      JSON.stringify(mod.taskWindowDates(winTask())));
    /* Кодът тук е КОПИЕ и не е под гейта на report-edge-sync (той сверява
       другите две функции). Поне структурата се сверява с оригинала. */
    const bul = fs.readFileSync(BULLETIN, 'utf8');
    ok('bulletin.js още носи оригинала', /function taskIsWindow\(t\)\{/.test(bul.replace(/\s+/g, '')) ||
      bul.indexOf('function taskIsWindow(t){') >= 0);
  }

  section('2. dueTodayOneTime: прозоречната е дължима САМО в деня на срока');
  {
    ok('в понеделник → не', mod.dueTodayOneTime(winTask(), MON) === false);
    ok('във вторник → не', mod.dueTodayOneTime(winTask(), TUE) === false);
    ok('в сряда (срокът) → ДА', mod.dueTodayOneTime(winTask(), WED) === true);
    /* КОНТРОЛА: без флага всеки ден си е ден. */
    const plain = winTask({ due_window: false });
    ok('без флага: понеделник → да', mod.dueTodayOneTime(plain, MON) === true);
    ok('без флага: вторник → да', mod.dueTodayOneTime(plain, TUE) === true);
    ok('без флага: сряда → да', mod.dueTodayOneTime(plain, WED) === true);
  }

  section('3. ТЕМАТА: push само в деня на срока');
  {
    for (const [n, name, want] of [[0, 'понеделник', false], [1, 'вторник', false], [2, 'сряда', true]]) {
      const b = await mod.buildTodayDeadlines(fakeSb(data(), []), mkBg(n, 8, 0));
      const got = has(b, TR, 'Излагане палето зони');
      ok('в ' + name + ' Троян ' + (want ? 'ПОЛУЧАВА' : 'НЕ получава') + ' напомняне',
        got === want, JSON.stringify(b && (b.skip || linesOf(b, TR))));
    }
    /* КОНТРОЛА: без флага напомнянето идва и в трите дни. */
    for (const [n, name] of [[0, 'понеделник'], [1, 'вторник'], [2, 'сряда']]) {
      const d = data({ bulletin_tasks: [winTask({ due_window: false })] });
      const b = await mod.buildTodayDeadlines(fakeSb(d, []), mkBg(n, 8, 0));
      ok('без флага в ' + name + ' Троян получава', has(b, TR, 'Излагане палето зони'),
        JSON.stringify(b && (b.skip || linesOf(b, TR))));
    }
  }

  section('4. ТЕМАТА: отметка в ПРОЗОРЕЦА спира напомнянето');
  {
    const d = data({ task_completions: [comp({ task_id: 't-win', store_name: TR, completion_date: MON })] });
    const b = await mod.buildTodayDeadlines(fakeSb(d, []), mkBg(2, 8, 0));
    ok('Троян е отметнал в понеделник → НЕ получава в сряда',
      !has(b, TR, 'Излагане палето зони'), JSON.stringify(linesOf(b, TR)));
    ok('Ловеч не е отметнал → получава',
      has(b, LO, 'Излагане палето зони'), JSON.stringify(linesOf(b, LO)));

    /* Отметка ИЗВЪН прозореца не затваря задачата. */
    const d2 = data({ task_completions: [comp({ task_id: 't-win', store_name: TR, completion_date: isoAt(-3) })] });
    const b2 = await mod.buildTodayDeadlines(fakeSb(d2, []), mkBg(2, 8, 0));
    ok('отметка от минала седмица НЕ брои', has(b2, TR, 'Излагане палето зони'),
      JSON.stringify(linesOf(b2, TR)));

    /* КОНТРОЛА: без флага отметката от понеделник не важи за сряда. */
    const d3 = data({
      bulletin_tasks: [winTask({ due_window: false })],
      task_completions: [comp({ task_id: 't-win', store_name: TR, completion_date: MON })]
    });
    const b3 = await mod.buildTodayDeadlines(fakeSb(d3, []), mkBg(2, 8, 0));
    ok('без флага Троян ПАК получава в сряда', has(b3, TR, 'Излагане палето зони'),
      JSON.stringify(linesOf(b3, TR)));
  }

  section('5. ПОСТОЯННАТА с прозорец: вторият, скрит дефект');
  {
    /* Наборът и преди беше наред; счупена беше заявката за отмятането. */
    const d = data({
      bulletin_tasks: [],
      recurring_tasks: [recWin()],
      task_completions: [comp({ recurring_task_id: 'r-win', store_name: TR, completion_date: MON })]
    });
    const log = [];
    const b = await mod.buildTodayDeadlines(fakeSb(d, log), mkBg(2, 14, 0));
    ok('Троян е отметнал в понеделник → НЕ получава в сряда',
      !has(b, TR, 'РЕВИЗИЯ 953'), JSON.stringify(linesOf(b, TR)));
    ok('Ловеч не е отметнал → получава', has(b, LO, 'РЕВИЗИЯ 953'),
      JSON.stringify(linesOf(b, LO)));
    /* САМАТА ЗАЯВКА тегли от началото на прозореца, не само днес. */
    /* От 01.10.2026 има ВТОРА заявка за постоянните — тази за „не се отнася"
       (status=eq.not_applicable, прозорец цялата седмица). Тук се проверява
       заявката за ОТМЯТАНИЯТА, затова се изключва по status филтъра; иначе
       твърдението „има точно една" пада заради несвързана промяна. */
    const q = log.filter(x => x.table === 'task_completions' &&
      x.filters.some(f => f[1] === 'recurring_task_id') &&
      !x.filters.some(f => f[1] === 'status'));
    if (ok('има заявка за отмятанията на постоянните', q.length === 1, JSON.stringify(q.map(x => x.filters)))) {
      ok('долната граница е НАЧАЛОТО на прозореца',
        q[0].filters.some(f => f[0] === 'gte' && f[1] === 'completion_date' && f[2] === MON),
        JSON.stringify(q[0].filters));
      ok('и вече НЕ е тясното eq.ДНЕС',
        !q[0].filters.some(f => f[0] === 'eq' && f[1] === 'completion_date'),
        JSON.stringify(q[0].filters));
    }

    /* Отметка ВЪТРЕ в диапазона на заявката, но ИЗВЪН самия прозорец, не
       затваря задачата. Случаят иска прозорец С ДУПКА — пон+сря: заявката тегли
       пон..сря, а вторник НЕ е ден на задачата. При прозорец без дупка такава
       дата няма и твърдението „брои се само ден ОТ НАБОРА" остава непроверено:
       вътре в прозореца „кой да е ред" и „ред от набора" не се различават. */
    const dHole = data({
      bulletin_tasks: [],
      recurring_tasks: [recWin({ due_weekdays: [0, 2] })],
      task_completions: [comp({ recurring_task_id: 'r-win', store_name: TR, completion_date: TUE })]
    });
    const bHole = await mod.buildTodayDeadlines(fakeSb(dHole, []), mkBg(2, 14, 0));
    ok('отметка във ВТОРНИК при прозорец пон+сря НЕ затваря задачата',
      has(bHole, TR, 'РЕВИЗИЯ 953'), JSON.stringify(linesOf(bHole, TR)));
    /* А отметка в самия понеделник я затваря — същият набор, друга дата. */
    const dHit = data({
      bulletin_tasks: [],
      recurring_tasks: [recWin({ due_weekdays: [0, 2] })],
      task_completions: [comp({ recurring_task_id: 'r-win', store_name: TR, completion_date: MON })]
    });
    const bHit = await mod.buildTodayDeadlines(fakeSb(dHit, []), mkBg(2, 14, 0));
    ok('а отметка в ПОНЕДЕЛНИК (ден от набора) я затваря',
      !has(bHit, TR, 'РЕВИЗИЯ 953'), JSON.stringify(linesOf(bHit, TR)));

    /* КОНТРОЛА, която пази от обратната грешка: по-широката заявка не бива да
       мине ВЧЕРАШНО отмятане за днешно при задача БЕЗ прозорец. Задачата е за
       всеки ден (due_time без избрани дни), отметната е вчера, и днес още се
       иска. Прозоречната в същия набор разширява заявката. */
    const d2 = data({
      bulletin_tasks: [],
      recurring_tasks: [recWin(), recWin({ id: 'r-day', title: 'ВСЕКИ ДЕН', due_weekdays: null, due_window: false })],
      task_completions: [comp({ recurring_task_id: 'r-day', store_name: TR, completion_date: TUE })]
    });
    const b2 = await mod.buildTodayDeadlines(fakeSb(d2, []), mkBg(2, 14, 0));
    ok('непрозоречна, отметната ВЧЕРА → пак получава днес',
      has(b2, TR, 'ВСЕКИ ДЕН'), JSON.stringify(linesOf(b2, TR)));
    const d3 = data({
      bulletin_tasks: [],
      recurring_tasks: [recWin(), recWin({ id: 'r-day', title: 'ВСЕКИ ДЕН', due_weekdays: null, due_window: false })],
      task_completions: [comp({ recurring_task_id: 'r-day', store_name: TR, completion_date: WED })]
    });
    const b3 = await mod.buildTodayDeadlines(fakeSb(d3, []), mkBg(2, 14, 0));
    ok('а отметната ДНЕС → не получава', !has(b3, TR, 'ВСЕКИ ДЕН'),
      JSON.stringify(linesOf(b3, TR)));
  }

  section('6. promoLabel разгъва кратката форма (висящото от 28.09.2026)');
  {
    ok('заглавието бие описанието',
      mod.promoLabel({ title: 'Промо', description: '[Инструкцията](https://a.bg/x)' }) === 'Промо');
    ok('без заглавие адресът се изписва',
      mod.promoLabel({ title: '', description: '[Инструкцията](https://a.bg/x)' })
        === 'Инструкцията (https://a.bg/x)',
      mod.promoLabel({ title: '', description: '[Инструкцията](https://a.bg/x)' }));
    ok('скобите вече не излизат сурови',
      mod.promoLabel({ title: null, description: '[Виж](https://a.bg)' }).indexOf('[') < 0);
    ok('mailto също се разгъва',
      mod.promoLabel({ description: '[Пиши](mailto:a@b.bg)' }) === 'Пиши (mailto:a@b.bg)',
      mod.promoLabel({ description: '[Пиши](mailto:a@b.bg)' }));
    ok('непозволена схема остава както е написана',
      mod.promoLabel({ description: '[Х](javascript:alert(1))' }).indexOf('[Х]') === 0,
      mod.promoLabel({ description: '[Х](javascript:alert(1))' }));
    ok('обикновен текст не се пипа',
      mod.promoLabel({ description: 'Намаление 20%' }) === 'Намаление 20%');
    ok('без нищо → резервното заглавие',
      mod.promoLabel({}) === 'Промоция без заглавие');
    /* Разгъването е ПРЕДИ отрязването. Дължината не стига като твърдение: и
       двата реда дават 61 знака. Разликата е в СЪДЪРЖАНИЕТО — обърнат ли се
       стъпките, срезът пада вътре в адреса, формата остава неразпозната и в
       push-а излиза „[текст](h…". */
    const long = mod.promoLabel({ description: '[' + 'и'.repeat(55) + '](https://a.bg/dalgo/dalgo)' });
    ok('отрязва се СЛЕД разгъването: няма скоби в текста', long.indexOf('[') < 0, long);
    /* 55 знака етикет + „ (" оставят място за точно три знака от адреса. */
    ok('и адресът е почнал да се изписва', long.indexOf(' (htt') >= 0, long);
    ok('дължината е 61 с многоточието', long.length === 61 && long.slice(-1) === '…',
      long.length + ': ' + long);
  }

  section('7. Коментарът над IMPLEMENTED_TOPICS вече не лъже');
  {
    /* Беше: „Копие на този списък живее в admin.js … чете и ДВАТА списъка".
       И двете половини са неточни от 28.09.2026 — admin.js държи двойки
       ключ→функция, а източниците са ТРИ. Тестът пази твърдението, защото
       следващият го чете вместо кода. */
    const src = fs.readFileSync(SRC, 'utf8');
    const i = src.indexOf('const IMPLEMENTED_TOPICS');
    const before = i > 0 ? src.slice(Math.max(0, i - 1400), i) : '';
    ok('намерен е коментарът', before.length > 100);
    ok('не твърди „ДВАТА списъка"', before.indexOf('ДВАТА списъка') < 0);
    ok('казва, че източниците са ТРИ', before.indexOf('ТРИ') >= 0, before.slice(-300));
    ok('посочва send-routed-report', before.indexOf('send-routed-report') >= 0);
    ok('посочва weekly_routed', before.indexOf('weekly_routed') >= 0);
  }

  report();
})();
