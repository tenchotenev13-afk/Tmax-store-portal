/* Отчет по задача — и за ПОСТОЯННА задача (send-routed-report v11 +
   dynamic-responder, 19.09.2026).

   Моделът: без нова колона. notification_schedules.entity_type остава
   'task_report', entity_id сочи ИЛИ bulletin_tasks.id, ИЛИ recurring_tasks.id;
   и двете функции търсят първо в bulletin_tasks, после в recurring_tasks.

   Какво заковава тестът:
     · постоянна задача → картичка с 🔁, прозорецът е СЕДМИЦАТА на run_date
       (не бюлетин); отметките — по recurring_task_id и само от седмицата;
     · пренесено извън седмицата → обектът излиза от обхвата; вътре → остава
       (⏱ → дата); пренесено ОТ миналата седмица В тази → брои се;
     · run_date в следващата седмица → нейният прозорец, не този;
     · не е дължима тази седмица / не важи (период) / изключена за всички /
       „само за информация" / няма я → skipped, 0 писма, console.warn;
       изключена за един обект → той не е в „Не са изпълнили";
     · linked_module='supply' от recurring_tasks → секцията „Зареждане" с
       week_start = понеделникът на същия прозорец;
     · обикновената задача — както преди (регресия);
     · dynamic-responder: гейтът за task_report пуска постоянна задача по
       правилото за период, не я спира с „задачата не е намерена".

   Пускане: node tests/task-report-recurring.test.js . */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, guard, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const ROUTED = path.join(ROOT, 'supabase/functions/send-routed-report/index.ts');
const RESP = path.join(ROOT, 'supabase/functions/dynamic-responder/index.ts');

/* Същото рязане като в task-report-responder.test.js: .mjs с изрязани типове
   за send-routed-report, .ts (Node сам изрязва типовете) за responder-а. */
function slice(file, exportsList, tag, asTs) {
  let s = fs.readFileSync(file, 'utf8');
  s = s.slice(0, s.indexOf('Deno.serve('));
  s = s.split(/\r?\n/).filter(l => !/^import\s/.test(l)).join('\n')
    .replace(/Deno\.env\.get\([^)]*\)!?/g, "''");
  if (!asTs) {
    s = s.replace(/:\s*Record<[^>]*>/g, '')
      .replace(/:\s*\{ skips: any\[\] \| null \}/g, '')
      .replace(/:\s*(string|number|any)\[\]/g, '')
      .replace(/\((\w+)\?:\s*(string|number|any)\)/g, '($1)')
      .replace(/(\w)\?:\s*(string|number|any)\b/g, '$1')
      .replace(/:\s*(string|number|boolean|any)\b/g, '')
      .replace(/\bq\?/g, 'q');
  }
  s += '\nexport { ' + exportsList.join(', ') + ' };\n';
  const dir = path.join(os.tmpdir(), 'tmax-task-report-recurring');
  fs.mkdirSync(dir, { recursive: true });
  const h = require('crypto').createHash('sha1').update(s).digest('hex').slice(0, 12);
  const out = path.join(dir, tag + '-' + h + (asTs ? '.ts' : '.mjs'));
  fs.writeFileSync(out, s);
  return out;
}

const MON = '2026-09-14', WED = '2026-09-16', FRI = '2026-09-18', SAT = '2026-09-19', SUN = '2026-09-20';
const PREV_FRI = '2026-09-11', NEXT_MON = '2026-09-21', NEXT_FRI = '2026-09-25';
const PER = id => ({ recurring_task_id: id, from_monday: '2026-01-05', to_monday: null });
function rt(id, over) {
  return Object.assign({ id: id, title: 'ЗАРЕЖДАНЕ', department: 'admin', task_type: 'check', active: true,
    due_weekdays: [4], due_weekday: 4, due_time: null, target_stores: null, report_groups: null,
    linked_module: null, created_by: 'Миглена Павлова' }, over || {});
}
function db(over) {
  return Object.assign({
    notification_topics: [{ key: 'weekly_routed', active: true, test_email: null }],
    bulletin_tasks: [
      { id: 't-pub', bulletin_id: 'b-pub', title: 'Витрина', target_stores: ['Троян', 'Ловеч'], due_date: FRI, due_dates: [FRI], linked_module: null, task_type: 'comment' }
    ],
    bulletins: [{ id: 'b-pub', status: 'published', week_number: 38, year: 2026 }],
    recurring_tasks: [
      rt('r-zar', { linked_module: 'supply' }),
      rt('r-multi', { title: 'Два дни', due_weekdays: [0, 2], due_weekday: 0 }),
      rt('r-none', { title: 'Без ден', due_weekdays: null, due_weekday: null, due_time: null }),
      rt('r-stop', { title: 'Спряна', active: false }),
      rt('r-future', { title: 'Бъдеща', active: false }),
      rt('r-skipall', { title: 'Изключена' }),
      rt('r-skip1', { title: 'Без Ловеч' }),
      rt('r-notice', { title: 'Инфо', task_type: 'notice' })
    ],
    recurring_task_periods: [PER('r-zar'), PER('r-multi'), PER('r-none'), PER('r-skipall'), PER('r-skip1'), PER('r-notice'),
      { recurring_task_id: 'r-stop', from_monday: '2026-01-05', to_monday: '2026-09-07' },
      { recurring_task_id: 'r-future', from_monday: NEXT_MON, to_monday: null }],
    recurring_task_skips: [
      { recurring_task_id: 'r-skipall', store_name: null, year: 2026, week_number: 38 },
      { recurring_task_id: 'r-skip1', store_name: 'Ловеч', year: 2026, week_number: 38 },
      /* друга седмица — не важи */
      { recurring_task_id: 'r-zar', store_name: null, year: 2026, week_number: 37 }
    ],
    task_completions: [
      { id: 'c1', task_id: null, recurring_task_id: 'r-zar', store_name: 'Троян', status: 'done', completion_date: FRI, comment: 'Попълнено', photos: null, files: null },
      { id: 'c-old', task_id: null, recurring_task_id: 'r-zar', store_name: 'Ловеч', status: 'done', completion_date: PREV_FRI, comment: 'миналата', photos: null, files: null },
      { id: 'c-away', task_id: null, recurring_task_id: 'r-zar', store_name: 'Габрово', status: 'postponed', completion_date: FRI, postponed_to: NEXT_FRI, comment: 'след седмица' },
      { id: 'c-reg', task_id: 't-pub', recurring_task_id: null, store_name: 'Троян', status: 'done', completion_date: FRI, comment: 'Готово' },
      { id: 'c-m', task_id: null, recurring_task_id: 'r-multi', store_name: 'Троян', status: 'done', completion_date: WED, comment: null },
      { id: 'c-next', task_id: null, recurring_task_id: 'r-zar', store_name: 'Ловеч', status: 'done', completion_date: NEXT_FRI, comment: 'следващата' }
    ],
    users: [
      { id: 'u-zh', email: 'j.jeliazkov@temax.bg', display_name: 'Жеко Желязков', notify_groups: ['co'], active: true, store_name: 'Централен офис' },
      { id: 'u-tr', email: 'tr@temax.bg', display_name: 'Троян', notify_groups: [], active: true, store_name: 'Троян' },
      { id: 'u-lo', email: 'lo@temax.bg', display_name: 'Ловеч', notify_groups: [], active: true, store_name: 'Ловеч' },
      { id: 'u-ga', email: 'ga@temax.bg', display_name: 'Габрово', notify_groups: [], active: true, store_name: 'Габрово' }
    ],
    supply_templates: [{ id: 'tpl-cab', name: 'Кабели на макара', slug: 'cables-reels', col1_label: 'Налична макара', col2_label: null, target_stores: null, active: true, sort_order: 2 }],
    supply_template_items: [{ id: 'k-1', template_id: 'tpl-cab', sap_code: '23237', name: 'ПВВ-МБ1 2X1', active: true, sort_order: 1 }],
    supply_entries: [
      { id: 's1', template_id: 'tpl-cab', item_id: 'k-1', store_name: 'Троян', week_start: MON, qty1: 2, qty2: null },
      { id: 's2', template_id: 'tpl-cab', item_id: 'k-1', store_name: 'Ловеч', week_start: NEXT_MON, qty1: 7, qty2: null }
    ]
  }, over || {});
}
/* Мини-PostgREST (eq / in / gte / lte / is.null / not.is.null; limit/offset). */
function pgFetch(data, log) {
  return function (url, init) {
    init = init || {};
    const u = new URL(url, 'http://x');
    const method = (init.method || 'GET').toUpperCase();
    if (u.pathname.indexOf('/functions/v1/resend-email') >= 0) {
      log.mail.push(JSON.parse(init.body));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
    }
    const table = u.pathname.split('/').pop();
    log.get.push(table + '?' + decodeURIComponent(u.search.slice(1)));
    if (method !== 'GET') return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(null) });
    let rows = (data[table] || []).slice();
    let limit = null, offset = 0;
    u.searchParams.forEach((v, k) => {
      if (k === 'limit') { limit = Number(v); return; }
      if (k === 'offset') { offset = Number(v); return; }
      if (['select', 'order'].indexOf(k) >= 0) return;
      const val = x => String(x == null ? '' : x);
      if (v.indexOf('eq.') === 0) rows = rows.filter(r => val(r[k]) === v.slice(3));
      else if (v.indexOf('in.(') === 0) { const set = v.slice(4, -1).split(','); rows = rows.filter(r => set.indexOf(val(r[k])) >= 0); }
      else if (v.indexOf('gte.') === 0) rows = rows.filter(r => r[k] != null && val(r[k]) >= v.slice(4));
      else if (v.indexOf('lte.') === 0) rows = rows.filter(r => r[k] != null && val(r[k]) <= v.slice(4));
      else if (v === 'not.is.null') rows = rows.filter(r => r[k] != null);
      else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
    });
    rows = rows.slice(offset, limit == null ? undefined : offset + limit);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
  };
}
function quiet(fn) {
  const w = console.warn, e = console.error, got = [];
  console.warn = function () { got.push(Array.prototype.join.call(arguments, ' ')); };
  console.error = function () { got.push(Array.prototype.join.call(arguments, ' ')); };
  return Promise.resolve().then(fn).then(r => { console.warn = w; console.error = e; return { r, got }; },
    x => { console.warn = w; console.error = e; throw x; });
}
const text = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
/* Фалшив supabase клиент за гейта на responder-а: eq() се прилага наистина. */
function fakeSb(data) {
  return { from(table) {
    const q = { filters: [] };
    const run = single => {
      const rows = (data[table] || []).filter(r => q.filters.every(f => String(r[f[0]]) === String(f[1])));
      return { data: single ? (rows[0] || null) : rows, error: null };
    };
    const self = { select() { return self; }, eq(c, v) { q.filters.push([c, v]); return self; },
      maybeSingle() { return Promise.resolve(run(true)); }, then(a, b) { return Promise.resolve(run(false)).then(a, b); } };
    return self;
  } };
}

(async function () {
  let T = null, R = null;
  section('0. Реалният код се зарежда');
  {
    let f1 = null, f2 = null;
    guard('routed се реже', () => { f1 = slice(ROUTED, ['routedTaskReportResponse', 'collectTaskReportData', 'taskReportWeekOf'], 'routed', false); });
    guard('responder се реже', () => { f2 = slice(RESP, ['publicationScheduleGate', 'taskReportRequestBody'], 'resp', true); });
    try { T = await import(pathToFileURL(f1).href); } catch (e) { ok('routed се внася', false, e && e.message); }
    try { R = await import(pathToFileURL(f2).href); } catch (e) { ok('responder се внася', false, e && e.message); }
    if (!ok('и двата модула са заредени', !!T && !!R)) { report(); return; }
  }

  const run = async (taskId, runDate, over, dry) => {
    const log = { get: [], mail: [] };
    globalThis.fetch = pgFetch(db(over), log);
    const body = { task_id: taskId, recipients: { groups: ['co'], user_ids: [] }, run_date: runDate, run_time: '18:00' };
    const { r, got } = await quiet(() => T.routedTaskReportResponse(body, !!dry, null));
    const j = await r.json();
    return { j, log, warns: got, html: (log.mail[0] || {}).html || '' };
  };

  section('1. Седмицата на run_date (понеделник–неделя)');
  {
    const w = d => JSON.stringify(T.taskReportWeekOf(d));
    ok('петък 18.09 → седмица 38/2026', w(FRI) === JSON.stringify({ week_number: 38, year: 2026 }), w(FRI));
    ok('неделя 20.09 → пак 38', w(SUN) === JSON.stringify({ week_number: 38, year: 2026 }), w(SUN));
    ok('понеделник 21.09 → 39', w(NEXT_MON) === JSON.stringify({ week_number: 39, year: 2026 }), w(NEXT_MON));
    ok('през Нова година: чт 31.12.2026 → седмица 53/2026 (номерацията на бюлетините)', w('2026-12-31') === JSON.stringify({ week_number: 53, year: 2026 }), w('2026-12-31'));
  }

  section('2. Постоянна задача → картичка с 🔁, само отметките от седмицата');
  {
    const a = await run('r-zar', FRI);
    const t = text(a.html);
    ok('едно писмо', a.log.mail.length === 1 && a.j.sent === 1, JSON.stringify(a.j));
    ok('темата е „Отчет: ЗАРЕЖДАНЕ — 18.09.2026 18:00"', (a.log.mail[0] || {}).subject === 'Отчет: ЗАРЕЖДАНЕ — 18.09.2026 18:00', (a.log.mail[0] || {}).subject);
    ok('🔁 пред заглавието в картичката', /🔁 ЗАРЕЖДАНЕ<\/div>/.test(a.html), (a.html.match(/.{0,20}ЗАРЕЖДАНЕ<\/div>/) || [''])[0]);
    ok('търси първо в bulletin_tasks, после в recurring_tasks',
      a.log.get.findIndex(g => /^bulletin_tasks\?id=eq\.r-zar/.test(g)) >= 0 &&
      a.log.get.findIndex(g => /^bulletin_tasks\?id=eq\.r-zar/.test(g)) < a.log.get.findIndex(g => /^recurring_tasks\?id=eq\.r-zar/.test(g)), a.log.get.slice(0, 4).join(' | '));
    ok('бюлетин НЕ се чете (прозорецът не е бюлетин)', !a.log.get.some(g => /^bulletins\?/.test(g)));
    ok('отметките по recurring_task_id за 14.09–20.09',
      a.log.get.some(g => g === 'task_completions?recurring_task_id=eq.r-zar&completion_date=gte.' + MON + '&completion_date=lte.' + SUN), a.log.get.filter(g => /task_completions/.test(g)).join(' | '));
    ok('и пренесените в седмицата (postponed_to)',
      a.log.get.some(g => g === 'task_completions?recurring_task_id=eq.r-zar&postponed_to=gte.' + MON + '&postponed_to=lte.' + SUN));
    ok('„1 от 2 обекта изпълнили" (Габрово е пренесен извън седмицата — излиза)', t.indexOf('1 от 2 обекта изпълнили') >= 0, t.slice(0, 300));
    const card = text(a.html.slice(0, a.html.indexOf('🎨 Зареждане')));
    ok('Ловеч е в „Не са изпълнили" (отметката от миналата седмица не се брои), Габрово го няма в картичката', /Не са изпълнили: Ловеч /.test(card) && card.indexOf('Габрово') < 0, card);
    ok('отметката от следващата седмица също не се брои', t.indexOf('следващата') < 0);
    ok('коментарът на Троян е в картичката', t.indexOf('Попълнено') >= 0);
    ok('изключването от друга седмица (37) не важи', a.j.sent === 1);
  }

  section('3. Пренесено вътре в седмицата и пренесено ОТ миналата');
  {
    const over = db();
    over.task_completions = [
      { id: 'c1', recurring_task_id: 'r-zar', store_name: 'Троян', status: 'done', completion_date: FRI, comment: 'Попълнено' },
      /* отложено за събота — вътре в седмицата: остава, със стрелка */
      { id: 'c-in', recurring_task_id: 'r-zar', store_name: 'Габрово', status: 'postponed', completion_date: FRI, postponed_to: SAT, comment: 'утре' },
      /* миналото петъчно явяване, пренесено за ТОЗИ петък и изпълнено */
      { id: 'c-carry', recurring_task_id: 'r-zar', store_name: 'Ловеч', status: 'done', completion_date: PREV_FRI, postponed_to: FRI, comment: 'наваксано' }
    ];
    const a = await run('r-zar', FRI, over);
    const t = text(a.html);
    ok('„2 от 3 обекта изпълнили" (Ловеч чрез пренесеното)', t.indexOf('2 от 3 обекта изпълнили') >= 0, t.slice(0, 300));
    ok('Габрово е ⏱ → 19.09 (вътре в седмицата — остава)', t.indexOf('⏱ Габрово → 19.09') >= 0, t);
    ok('„наваксано" от пренесеното е в картичката', t.indexOf('наваксано') >= 0);
    ok('няма „Не са изпълнили"', t.indexOf('Не са изпълнили') < 0);
  }

  section('4. run_date в следващата седмица → нейният прозорец');
  {
    const a = await run('r-zar', NEXT_MON);
    const t = text(a.html);
    ok('отметки за 21.09–27.09', a.log.get.some(g => g === 'task_completions?recurring_task_id=eq.r-zar&completion_date=gte.' + NEXT_MON + '&completion_date=lte.2026-09-27'),
      a.log.get.filter(g => /task_completions/.test(g)).join(' | '));
    ok('Ловеч е изпълнил (25.09), Троян не (отметката му е от 18.09)', /Не са изпълнили: [^<]*Троян/.test(t) && t.indexOf('следващата') >= 0, t);
  }

  section('5. Няколко дни → прозорецът е цялата седмица');
  {
    const a = await run('r-multi', FRI);
    const t = text(a.html);
    ok('отметката от сряда се брои („1 от 3")', t.indexOf('1 от 3 обекта изпълнили') >= 0, t.slice(0, 200));
  }

  section('6. Пропуски: не е дължима / не важи / изключена / инфо / няма я');
  {
    const cases = [
      ['r-none', 'задачата не е дължима тази седмица'],
      ['r-stop', 'постоянната задача не важи за седмицата'],
      ['r-future', 'постоянната задача не важи за седмицата'],
      ['r-skipall', 'изключена за седмицата (за всички обекти)'],
      ['r-notice', 'задачата е само за информация']
    ];
    for (const [id, why] of cases) {
      const a = await run(id, FRI);
      ok(id + ' → skipped „' + why + '", 0 писма', a.j.skipped === why && a.j.sent === 0 && a.log.mail.length === 0, JSON.stringify(a.j));
      ok(id + ' → console.warn', a.warns.some(x => x.indexOf(why) >= 0), a.warns.join(' | '));
      ok(id + ' → отметки дори не се теглят', !a.log.get.some(g => /^task_completions/.test(g)));
    }
    const fut = await run('r-future', NEXT_MON);
    ok('r-future в собствената си седмица (21.09) → писмо', fut.j.sent === 1, JSON.stringify(fut.j));
    const gone = await run('r-gone', FRI);
    ok('няма я в нито една таблица → skipped „задачата не е намерена"', gone.j.skipped === 'задачата не е намерена' && gone.log.mail.length === 0, JSON.stringify(gone.j));
    ok('и console.warn', gone.warns.some(x => /не е намерена/.test(x)));
    const one = await run('r-skip1', FRI);
    const t = text(one.html);
    ok('изключена за Ловеч → Ловеч не е в обхвата („0 от 2")', t.indexOf('0 от 2 обекта изпълнили') >= 0 && /Не са изпълнили: (Габрово, Троян|Троян, Габрово) /.test(t), t.slice(0, 300));
  }

  section('7. linked_module=supply от recurring_tasks → секцията за същата седмица');
  {
    const a = await run('r-zar', FRI);
    const t = text(a.html);
    ok('секцията „🎨 Зареждане — седмица от 14.09.2026"', t.indexOf('🎨 Зареждане — седмица от 14.09.2026') >= 0);
    ok('supply_entries за week_start=2026-09-14', a.log.get.some(g => /^supply_entries\?week_start=eq\.2026-09-14&/.test(g)));
    ok('„Троян 2", без стойността от следващата седмица', t.indexOf('Троян 2') >= 0 && t.indexOf('Ловеч 7') < 0, t);
    ok('секцията е след картичката', a.html.indexOf('обекта изпълнили') < a.html.indexOf('🎨 Зареждане'));
    const b = await run('r-zar', NEXT_MON);
    ok('run_date 21.09 → week_start=2026-09-21 и „Ловеч 7"', b.log.get.some(g => /^supply_entries\?week_start=eq\.2026-09-21&/.test(g)) && text(b.html).indexOf('Ловеч 7') >= 0);
    const c = await run('r-multi', FRI);
    ok('постоянна БЕЗ linked_module → без секция и без supply_* заявки', c.html.indexOf('🎨 Зареждане') < 0 && !c.log.get.some(g => /^supply_/.test(g)));
    const d = await run('r-zar', FRI, null, true);
    ok('dry_run: supply за 14.09, без писма', d.j.dry_run === true && d.log.mail.length === 0 && d.j.supply && d.j.supply.week === MON, JSON.stringify(d.j.supply));
  }

  section('8. Регресия: обикновената задача — както преди (бюлетин)');
  {
    const a = await run('t-pub', FRI);
    const t = text(a.html);
    ok('едно писмо, без 🔁', a.log.mail.length === 1 && a.html.indexOf('🔁') < 0);
    ok('прозорецът е бюлетинът', a.log.get.some(g => /^bulletins\?id=eq\.b-pub/.test(g)) && a.log.get.some(g => g === 'task_completions?task_id=eq.t-pub&completion_date=gte.' + MON + '&completion_date=lte.' + SUN));
    ok('recurring_tasks НЕ се чете', !a.log.get.some(g => /^recurring_tasks\?/.test(g)));
    ok('„1 от 2 обекта изпълнили"', t.indexOf('1 от 2 обекта изпълнили') >= 0);
  }

  section('8б. Многоседмична задача (spans_from): прозорецът е седмицата на СРОКА');
  {
    /* Поставена в бюлетина за С38, срок четвъртък от С39 (24.09). Отметките ѝ
       носят completion_date = СРОКА, тоест прозорецът на бюлетина (14–20.09)
       не вижда нито една и картичката би изредила ВСИЧКИ обекти като „не
       изпълнили" задача, свършена от тях. run_date нарочно е в С38 — той не
       определя прозореца при обикновена задача, срокът го определя. */
    const SPAN_DUE = '2026-09-24', SPAN_SUN = '2026-09-27';
    const over = {
      bulletin_tasks: [
        { id: 't-span', bulletin_id: 'b-pub', title: 'Клетка надувно', target_stores: ['Троян', 'Ловеч'],
          due_date: SPAN_DUE, due_dates: [SPAN_DUE], spans_from: MON, linked_module: null, task_type: 'comment' }
      ],
      task_completions: [
        { id: 'c-span', task_id: 't-span', recurring_task_id: null, store_name: 'Троян',
          status: 'done', completion_date: SPAN_DUE, comment: 'Сглобена', photos: null, files: null }
      ]
    };
    const a2 = await run('t-span', FRI, over);
    const t2 = text(a2.html);
    ok('заявката за отметки е за седмицата на срока',
      a2.log.get.some(g => g === 'task_completions?task_id=eq.t-span&completion_date=gte.' + NEXT_MON + '&completion_date=lte.' + SPAN_SUN),
      JSON.stringify(a2.log.get.filter(g => /^task_completions/.test(g))));
    ok('Троян излиза ИЗПЪЛНИЛ, не „не изпълнил"', t2.indexOf('1 от 2 обекта изпълнили') >= 0, t2.slice(0, 220));
    ok('коментарът му е в картичката', t2.indexOf('Сглобена') >= 0);
  }

  section('9. dynamic-responder: гейтът за task_report и постоянна задача');
  {
    const GD = db();
    const s = (id, type) => ({ id: 'n', entity_type: type || 'task_report', entity_id: id });
    const g = async (id, day, type) => R.publicationScheduleGate(fakeSb(GD), s(id, type), day);
    ok('постоянна, важи за седмицата → пуска ({})', JSON.stringify(await g('r-zar', FRI)) === '{}');
    ok('постоянна с бъдещ период → пропуск (правилото за период)', /не важи за седмицата/.test((await g('r-future', FRI)).skip || ''), JSON.stringify(await g('r-future', FRI)));
    ok('същата в собствената си седмица → пуска', JSON.stringify(await g('r-future', NEXT_MON)) === '{}');
    ok('спряна (период до 07.09) → пропуск', /не важи за седмицата/.test((await g('r-stop', FRI)).skip || ''));
    ok('няма я в нито една таблица → „задачата не е намерена"', (await g('r-gone', FRI)).skip === 'задачата не е намерена');
    ok('обикновена задача — пак по бюлетина (публикуван → пуска)', JSON.stringify(await g('t-pub', FRI)) === '{}');
    const draft = db({ bulletins: [{ id: 'b-pub', status: 'draft', week_number: 38, year: 2026 }] });
    ok('обикновена в чернова → „бюлетинът не е публикуван"', (await R.publicationScheduleGate(fakeSb(draft), s('t-pub'), FRI)).skip === 'бюлетинът не е публикуван');
    ok('напомняне по постоянна (recurring_task) — същото правило', /не важи за седмицата/.test((await g('r-future', FRI, 'recurring_task')).skip || ''));
    ok('заявката към send-routed-report е същата (task_id = id-то на постоянната)',
      R.taskReportRequestBody({ entity_id: 'r-zar', target_recipients: { groups: ['co'], user_ids: [] }, scheduled_date: FRI, scheduled_time: '18:00:00' }, FRI).task_id === 'r-zar');
  }

  section('10. Шапките и точките на включване (закотвено)');
  {
    const src = fs.readFileSync(ROUTED, 'utf8');
    const head = src.slice(0, src.indexOf('*/'));
    ok('v11 е първият запис, преди v10', /v11 \(19\.09\.2026\)/.test(head) && head.indexOf('v11 (') < head.indexOf('v10 ('));
    ok('решението по модела е в шапката (без нова колона, gen_random_uuid)', /без нова колона/.test(head) && /gen_random_uuid/.test(head));
    ok('collectTaskReportData → collectRecurringTaskReportData, когато id-то не е в bulletin_tasks',
      /if \(!t\) return await collectRecurringTaskReportData\(taskId, recipients, runDate\);/.test(src));
    ok('run_date стига до колектора', /collectTaskReportData\(taskId, body\.recipients, body\.run_date\)/.test(src));
    const rsrc = fs.readFileSync(RESP, 'utf8');
    ok('responder: шапка за 19.09.2026', /19\.09\.2026 \(деплой след v22\)/.test(rsrc.slice(0, 1500)));
    ok('responder: task_report без bulletin_tasks → recurringPeriodGate',
      /if \(!t && s\.entity_type === 'task_report'\) return await recurringPeriodGate\(/.test(rsrc));
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
