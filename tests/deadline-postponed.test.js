/* „⏱ Отложили" в писмото deadline_passed — bulletin-notify v14.

   Повод: Миглена, „ТеМАХ — РЕВИЗИЯ ГРУПИ (21.10.2026)": Севлиево е отложил с
   коментар, а в писмото го нямаше нито в „Подадени", нито в „Не са подали".

   ТВЪРДЕНИЯТА:
   · отложилият излиза в отделен блок „⏱ Отложили (N)" с „→ дд.мм — коментар";
   · без коментар → „без коментар"; всичко минава през esc();
   · обект, подал за деня, не е отложил;
   · няма отложили → блокът го няма;
   · броенето НЕ е пипано: „X от Y" и „Не са подали" са същите като преди
     (случаят 21.10: 18 обекта, 2 подали, Севлиево отложил → „2 от 17").

   Тестът пуска РЕАЛНИЯ .ts (техниката на tests/postpone-date-notify.test.js)
   срещу фалшив клиент, който наистина филтрира eq/in/gte/lte.

   Пускане: node tests/deadline-postponed.test.js . */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, guard, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const SRC = path.join(ROOT, 'supabase/functions/bulletin-notify/index.ts');

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
const REQUIRED = ['buildDeadlinePassed', 'deadlinePassedHtmlFor', 'taskIsMovedAway',
  'loadCarriedTo', 'loadTasksByIds', 'plusDaysISO'];
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
  const dir = path.join(os.tmpdir(), 'tmax-bn-deadline-postponed');
  fs.mkdirSync(dir, { recursive: true });
  const tag = require('crypto').createHash('sha1').update(out).digest('hex').slice(0, 12);
  const file = path.join(dir, 'slice-' + tag + '.ts');
  fs.writeFileSync(file, out);
  return file;
}

/* ── Фалшив supabase клиент, който наистина филтрира ─────────────────── */
function fakeSb(data) {
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
        select() { return self; },
        eq(c, v) { q.filters.push(['eq', c, v]); return self; },
        in(c, v) { q.filters.push(['in', c, v]); return self; },
        gte(c, v) { q.filters.push(['gte', c, v]); return self; },
        lte(c, v) { q.filters.push(['lte', c, v]); return self; },
        limit(n) { q.limit = n; return self; },
        then(res, rej) {
          let rows = (data[table] || []).filter(r => q.filters.every(f => pass(r, f)));
          if (q.limit !== null) rows = rows.slice(0, q.limit);
          return Promise.resolve({ data: rows }).then(res, rej);
        },
      };
      return self;
    },
  };
}

/* ── Данни: случаят от 21.10.2026 (сряда), РЕВИЗИЯ ГРУПИ 16:00 ────────── */
const DAY = '2026-10-21';
const BG = { dateStr: DAY, hours: 16, minutes: 15, dow: 'wed', isoWeekday: 3, weekdayIdx: 2 };
const SE = 'Севлиево', GA = 'Габрово', DU = 'Дупница', LO = 'Ловеч';
const STORES = ['Благоевград', 'Бургас', DU, GA, 'Горна Оряховица', 'Кърджали', LO, 'Монтана',
  'Плевен', 'Раднево', SE, 'Силистра', 'Сливен', 'Стара Загора', 'Троян', 'Хасково', 'Шумен', 'Ямбол'];
const COMMENT = 'В намален състав сме, има камион и няма колега в склада и подреждаме коледно';

function rec(over) {
  return Object.assign({
    id: 'r-rev', title: 'РЕВИЗИЯ ГРУПИ', department: 'trade', active: true, task_type: 'info',
    due_weekday: null, due_weekdays: [2], due_time: '16:00', due_window: false,
    target_stores: null, report_groups: ['controlling'],
  }, over || {});
}
function row(store, status, over) {
  return Object.assign({ id: 'c-' + store, task_id: null, recurring_task_id: 'r-rev', store_name: store,
    status: status, completion_date: DAY, postponed_to: null, comment: '', photos: [], files: [] }, over || {});
}
function data(comps) {
  return {
    recurring_tasks: [rec()],
    recurring_task_versions: [],
    recurring_task_periods: [],
    recurring_task_skips: [],
    task_completions: comps,
    users: STORES.map(s => ({ store_name: s, active: true })),
  };
}
const CASE_2110 = () => [
  row(GA, 'done', { comment: 'качена ревизия' }),
  row(DU, 'done', { comment: 'направена и качена' }),
  row(SE, 'postponed', { postponed_to: '2026-10-28', comment: COMMENT }),
];

let mod = null;
async function mail(comps) {
  const b = await mod.buildDeadlinePassed(fakeSb(data(comps)), BG);
  const e = b && b.entries && b.entries[0];
  if (!e) return { e: null, html: '', b: b };
  return { e: e, b: b, html: mod.deadlinePassedHtmlFor(e.task, e.slot, e.submitted, e.missing, DAY, e.notApplicable, e.postponed) };
}
/* Текстът на блок, започващ със заглавието, до края на неговия <div>. */
function blockAfter(html, head) {
  const i = html.indexOf(head);
  if (i < 0) return '';
  const j = html.indexOf('</div></div>', i);
  return html.slice(i, j < 0 ? undefined : j);
}

(async function main() {

  section('0. Реалният код се зарежда в Node');
  {
    let file = null;
    if (!guard('изрязването на модула минава', () => { file = buildModule(); })) { report(); return; }
    try { mod = await import(pathToFileURL(file).href); }
    catch (e) { ok('модулът се импортира', false, e && e.message); report(); return; }
    ok('модулът се импортира', true);
  }

  section('1. Случаят 21.10: подали, отложил, неподали — три блока');
  {
    const { e, html } = await mail(CASE_2110());
    if (ok('има запис за задачата', !!e)) {
      ok('„X от Y" е 2 от 17 — както преди', html.indexOf('Подадени: 2 от 17 обекта') >= 0,
        (html.match(/Подадени: [^<]*/) || [''])[0]);
      ok('total е 17', e.total === 17, String(e.total));
      ok('Севлиево НЕ е в „Не са подали"', e.missing.indexOf(SE) < 0, JSON.stringify(e.missing));
      ok('„Не са подали" са 15', e.missing.length === 15, String(e.missing.length));
      ok('Севлиево НЕ е в подадените', !e.submitted.some(s => s.store === SE));
      ok('блок „Не са подали" го има', html.indexOf('Не са подали:') >= 0);
      ok('блок „⏱ Отложили (1)" го има', html.indexOf('⏱ Отложили (1):') >= 0);
      const blk = blockAfter(html, '⏱ Отложили');
      ok('редът е „Севлиево → 28.10 — <коментар>"',
        blk.indexOf(SE + ' → 28.10 — ' + COMMENT) >= 0, blk.slice(0, 300));
      ok('сивият ред „не влизат в бройката" е в блока',
        blk.indexOf('Тези обекти не влизат в бройката по-горе.') >= 0, blk.slice(-200));
      const ns = blockAfter(html, 'Не са подали:');
      ok('Севлиево не е в текста на „Не са подали"', ns.indexOf(SE) < 0, ns.slice(0, 300));
      ok('блокът е след „Не са подали"', html.indexOf('⏱ Отложили') > html.indexOf('Не са подали:'));
    }
  }

  section('1б. КОНТРОЛА: същият случай БЕЗ ред за Севлиево — Севлиево е „Не е подал"');
  {
    const { e, html } = await mail(CASE_2110().filter(r => r.store_name !== SE));
    ok('2 от 18', !!e && html.indexOf('Подадени: 2 от 18 обекта') >= 0);
    ok('Севлиево е в „Не са подали"', !!e && e.missing.indexOf(SE) >= 0);
  }

  section('2. Отложил без коментар → „без коментар"');
  {
    const { html } = await mail([row(SE, 'postponed', { postponed_to: '2026-10-28', comment: null })]);
    ok('„Севлиево → 28.10 — без коментар"', html.indexOf(SE + ' → 28.10 — без коментар') >= 0,
      blockAfter(html, '⏱ Отложили').slice(0, 200));
  }

  section('3. Отложил И подал същия ден → не е в „Отложили"');
  {
    /* Уникалният индекс (recurring_task_id, store_name, completion_date) не
       позволява двата реда в базата; тестът пази показването, ако това някога
       се промени. Броенето НЕ е пипано: обектът с отложен ред остава извън
       обхвата (taskIsMovedAway) — не влиза и в „Подадени". */
    const comps = [row(GA, 'done'), row(SE, 'postponed', { id: 'c-se-p', postponed_to: '2026-10-28', comment: 'отложено' }),
                   row(SE, 'done', { id: 'c-se-d', comment: 'все пак готово' })];
    const { e, html } = await mail(comps);
    ok('блокът „⏱ Отложили" го няма', !!e && html.indexOf('⏱ Отложили') < 0, blockAfter(html, '⏱ Отложили').slice(0, 200));
    ok('Севлиево не е в „Не са подали"', !!e && e.missing.indexOf(SE) < 0);
    /* Ред „done" с postponed_to (отложено и после отметнато) — статусът е done. */
    const r2 = await mail([row(SE, 'done', { postponed_to: '2026-10-28', comment: 'направено след отлагане' })]);
    ok('done с postponed_to не е „Отложили"', !!r2.e && r2.html.indexOf('⏱ Отложили') < 0);
  }

  section('4. Коментар с <script> — ескейпнат');
  {
    const { html } = await mail([row(SE, 'postponed', { postponed_to: '2026-10-28', comment: '<script>alert(1)</script>' }),
                                 row('<b>X</b>', 'postponed', { postponed_to: '2026-10-28' })]);
    ok('суров <script> го няма', html.indexOf('<script>') < 0);
    ok('ескейпнатият е там', html.indexOf('&lt;script&gt;alert(1)&lt;/script&gt;') >= 0,
      blockAfter(html, '⏱ Отложили').slice(0, 300));
    /* Името на обекта идва от users.store_name; '<b>X</b>' не е в STORES,
       затова не е в обхвата и не излиза — проверката за esc на името е през
       функцията направо. */
    const h2 = mod.deadlinePassedHtmlFor({ title: 'Т', due_time: '16:00' }, 975, [], [], DAY, [],
      [{ store: '<b>X</b>', comment: 'к', postponed_to: '2026-10-28' }]);
    ok('името на обекта е ескейпнато', h2.indexOf('&lt;b&gt;X&lt;/b&gt; → 28.10') >= 0 && h2.indexOf('<b>X</b>') < 0);
  }

  section('5. Няма отложили → блокът го няма');
  {
    const { e, html } = await mail([row(GA, 'done'), row(DU, 'done')]);
    ok('писмото е построено', !!e);
    ok('„⏱ Отложили" го няма', html.indexOf('⏱ Отложили') < 0);
    ok('postponed е празен масив', !!e && Array.isArray(e.postponed) && e.postponed.length === 0,
      JSON.stringify(e && e.postponed));
    const h0 = mod.deadlinePassedHtmlFor({ title: 'Т', due_time: '16:00' }, 975, [], ['А'], DAY);
    ok('стар извикващ без 7-и параметър — без блок и без грешка', h0.indexOf('⏱ Отложили') < 0);
  }

  section('6. Целеви обекти и „Не се отнася" важат и за отложилите');
  {
    const d = data([row(SE, 'postponed', { postponed_to: '2026-10-28', comment: 'к1' }),
                     row(LO, 'postponed', { postponed_to: '2026-10-28', comment: 'к2' }),
                     row(GA, 'done')]);
    d.recurring_tasks = [rec({ target_stores: [GA, LO, DU] })];
    const b = await mod.buildDeadlinePassed(fakeSb(d), BG);
    const e = b && b.entries && b.entries[0];
    ok('само Ловеч (Севлиево не е целеви)', !!e && e.postponed.length === 1 && e.postponed[0].store === LO,
      JSON.stringify(e && e.postponed));
    ok('и броенето е 1 от 2 (Габрово, Дупница)', !!e && e.total === 2, String(e && e.total));
    /* „Не се отнася" от понеделник на същата седмица — обектът е извън
       задачата и не се изброява като отложил. */
    d.task_completions.push(row(LO, 'not_applicable', { id: 'c-lo-na', completion_date: '2026-10-19', comment: 'нямаме групата' }));
    const b2 = await mod.buildDeadlinePassed(fakeSb(d), BG);
    const e2 = b2 && b2.entries && b2.entries[0];
    ok('Ловеч с „Не се отнася" не е отложил', !!e2 && e2.postponed.length === 0, JSON.stringify(e2 && e2.postponed));
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
