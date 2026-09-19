/* Отчет по задача — СЪРВЪРЪТ (етап 3, 19.09.2026).

   dynamic-responder: ред в notification_schedules с entity_type='task_report'
   в часа си → ЕДНА заявка към send-routed-report с {task_id, recipients}
   (не push). Преди часа — нищо; чернова — нищо; изтрита задача — нищо +
   console.warn. last_sent_at само ако поне едно писмо е тръгнало.

   send-routed-report: вход {task_id, recipients:{groups,user_ids}, run_date,
   run_time} → една картичка (personalizedSectionHtml) до получателите:
   групите по users.notify_groups / is_regional, хората по users.id. Тема
   „Отчет: <заглавие> — <дд.мм.гггг чч:мм>". Изтрита задача / чернова /
   0 получатели → нищо, с console.warn.

   Как се пускат едж функциите: реже се РЕАЛНИЯТ index.ts преди Deno.serve,
   махат се импортите, Deno.env.get() → '', типовете се изрязват; модулът се
   внася в Node. fetch се подменя с фалшив, който записва всяка заявка.

   Пускане: node tests/task-report-responder.test.js . */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, guard, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const RESP = path.join(ROOT, 'supabase/functions/dynamic-responder/index.ts');
const ROUTED = path.join(ROOT, 'supabase/functions/send-routed-report/index.ts');

/* Реже до Deno.serve, маха импортите и Deno.env, изрязва типовете → .mjs */
function slice(file, exportsList, tag, asTs) {
  let s = fs.readFileSync(file, 'utf8');
  s = s.slice(0, s.indexOf('Deno.serve('));
  s = s.split(/\r?\n/).filter(l => !/^import\s/.test(l)).join('\n')
    .replace(/Deno\.env\.get\([^)]*\)!?/g, "''");
  /* .ts → Node сам изрязва типовете (както responder-publication-gate). */
  if (asTs) return writeSlice(s, exportsList, tag, '.ts');
  s = s.replace(/:\s*Record<[^>]*>/g, '')
    .replace(/:\s*\{ skips: any\[\] \| null \}/g, '')
    .replace(/:\s*(string|number|any)\[\]/g, '')
    .replace(/\((\w+)\?:\s*(string|number|any)\)/g, '($1)')
    .replace(/(\w)\?:\s*(string|number|any)\b/g, '$1')
    .replace(/:\s*(string|number|boolean|any)\b/g, '')
    .replace(/\bq\?/g, 'q');
  return writeSlice(s, exportsList, tag, '.mjs');
}
function writeSlice(s, exportsList, tag, ext) {
  s += '\nexport { ' + exportsList.join(', ') + ' };\n';
  const dir = path.join(os.tmpdir(), 'tmax-task-report');
  fs.mkdirSync(dir, { recursive: true });
  const h = require('crypto').createHash('sha1').update(s).digest('hex').slice(0, 12);
  const out = path.join(dir, tag + '-' + h + ext);
  fs.writeFileSync(out, s);
  return out;
}

/* Фалшив supabase клиент за publicationScheduleGate: eq() се прилага наистина. */
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

const TODAY = '2026-09-18';
const bgAt = (h, m) => ({ hours: h, minutes: m, dateStr: TODAY, hhmm: String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'), dow: 'fri' });
function row(over) {
  return Object.assign({ id: 'n-1', entity_type: 'task_report', entity_id: 't-pub', schedule_type: 'once',
    scheduled_date: TODAY, scheduled_time: '18:00:00', last_sent_at: null, active: true,
    target_recipients: { groups: ['co'], user_ids: ['u-mp'] } }, over || {});
}
const GATE_DATA = {
  bulletins: [{ id: 'b-pub', status: 'published' }, { id: 'b-draft', status: 'draft' }],
  bulletin_tasks: [{ id: 't-pub', bulletin_id: 'b-pub' }, { id: 't-draft', bulletin_id: 'b-draft' }]
};

/* Същият ред като в обработчика: срок → гейт → отчет. (Редът е закотвен в
   секция 4 срещу истинския Deno.serve.) */
async function tick(R, rows, bg, fetchFn) {
  const out = { sent: [], skipped: [] };
  for (const s of rows.filter(s => R.scheduleIsDue(s, bg, TODAY, 'fri'))) {
    const pub = await R.publicationScheduleGate(fakeSb(GATE_DATA), s, TODAY);
    if (pub.skip) { out.skipped.push(pub.skip); continue; }
    if (s.entity_type === 'task_report') out.sent.push(await R.sendTaskReport(s, TODAY, fetchFn));
  }
  return out;
}
function fakeFetch(reply) {
  const calls = [];
  const f = function (url, init) {
    calls.push({ url: url, init: init, body: init && init.body ? JSON.parse(init.body) : null });
    if (reply instanceof Error) return Promise.reject(reply);
    const r = typeof reply === 'function' ? reply(url, init) : reply;
    return Promise.resolve({ ok: r.status < 400, status: r.status, json: () => Promise.resolve(r.body) });
  };
  f.calls = calls;
  return f;
}
function captureWarn(fn) {
  const orig = console.warn, got = [];
  console.warn = function () { got.push(Array.prototype.join.call(arguments, ' ')); };
  return Promise.resolve().then(fn).then(r => { console.warn = orig; return { r, got }; }, e => { console.warn = orig; throw e; });
}

/* ── „база" за send-routed-report ── */
const MP_ID = '5b1e0000-0000-4000-8000-000000000001';   /* users.id е uuid */
const WK = { week_number: 38, year: 2026 };   /* 14.09–20.09.2026 */
function routedDb(over) {
  return Object.assign({
    notification_topics: [{ key: 'weekly_routed', active: true, test_email: null }],
    bulletin_tasks: [
      { id: 't-pub', bulletin_id: 'b-pub', title: 'Витрина', target_stores: ['Троян', 'Ловеч'], due_date: '2026-09-18', due_dates: ['2026-09-18'], created_by: 'Миглена Павлова', task_type: 'comment' },
      { id: 't-draft', bulletin_id: 'b-draft', title: 'Чернова', target_stores: null, due_date: null, due_dates: null }
    ],
    bulletins: [Object.assign({ id: 'b-pub', status: 'published' }, WK), Object.assign({ id: 'b-draft', status: 'draft' }, WK)],
    task_completions: [
      { id: 'c1', task_id: 't-pub', store_name: 'Троян', status: 'done', completion_date: '2026-09-18', comment: 'Готово', photos: null, files: null },
      { id: 'c-old', task_id: 't-pub', store_name: 'Ловеч', status: 'done', completion_date: '2026-09-01', comment: null }
    ],
    users: [
      { id: 'u-zh', email: 'j.jeliazkov@temax.bg', display_name: 'Жеко Желязков', notify_groups: ['co'], active: true, store_name: 'Централен офис' },
      { id: 'u-vs', email: 'v.shikova@temax.bg', display_name: 'Василка Шикова', notify_groups: ['co'], active: true, store_name: 'Централен офис' },
      { id: MP_ID, email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', notify_groups: ['controlling'], active: true, store_name: 'Централен офис' },
      { id: 'u-off', email: 'off@temax.bg', display_name: 'Неактивен', notify_groups: [], active: false, store_name: 'Централен офис' },
      { id: 'u-tr', email: 'tr@temax.bg', display_name: 'Троян', notify_groups: [], active: true, store_name: 'Троян' },
      { id: 'u-lo', email: 'lo@temax.bg', display_name: 'Ловеч', notify_groups: [], active: true, store_name: 'Ловеч' }
    ]
  }, over || {});
}
/* Мини-PostgREST: eq / in / gte / lte / is.null / not.is.null / select. */
function pgFetch(db, log) {
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
    let rows = (db[table] || []).slice();
    u.searchParams.forEach((v, k) => {
      if (['select', 'order', 'limit'].indexOf(k) >= 0) return;
      const val = x => String(x == null ? '' : x);
      if (v.indexOf('eq.') === 0) rows = rows.filter(r => val(r[k]) === v.slice(3));
      else if (v.indexOf('in.(') === 0) { const set = v.slice(4, -1).split(','); rows = rows.filter(r => set.indexOf(val(r[k])) >= 0); }
      else if (v.indexOf('gte.') === 0) rows = rows.filter(r => r[k] != null && val(r[k]) >= v.slice(4));
      else if (v.indexOf('lte.') === 0) rows = rows.filter(r => r[k] != null && val(r[k]) <= v.slice(4));
      else if (v === 'not.is.null') rows = rows.filter(r => r[k] != null);
      else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
    });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
  };
}

(async function () {
  let R = null, T = null;

  section('0. Реалният код се зарежда');
  {
    let f1 = null, f2 = null;
    guard('responder се реже', () => { f1 = slice(RESP, ['scheduleIsDue', 'publicationScheduleGate', 'taskReportRequestBody', 'sendTaskReport', 'ROUTED_FN_URL'], 'resp', true); });
    guard('routed се реже', () => { f2 = slice(ROUTED, ['routedTaskReportSubject', 'routedTaskReportRecipients', 'collectTaskReportData', 'routedTaskReportResponse', 'coPeopleCache'], 'routed'); });
    try { R = await import(pathToFileURL(f1).href); } catch (e) { ok('responder се внася', false, e && e.message); }
    try { T = await import(pathToFileURL(f2).href); } catch (e) { ok('routed се внася', false, e && e.message); }
    if (!ok('и двата модула са заредени', !!R && !!T)) { report(); return; }
    ok('ROUTED_FN_URL сочи send-routed-report', /\/functions\/v1\/send-routed-report$/.test(R.ROUTED_FN_URL), R.ROUTED_FN_URL);
  }

  section('1. Responder: в часа → ЕДНА заявка към send-routed-report с получателите');
  {
    const f = fakeFetch({ status: 200, body: { ok: true, sent: 3 } });
    const out = await tick(R, [row()], bgAt(18, 0), f);
    ok('точно една заявка', f.calls.length === 1, String(f.calls.length));
    const c = f.calls[0] || {};
    ok('към send-routed-report, не към resend-email', /\/functions\/v1\/send-routed-report$/.test(c.url || ''), c.url);
    ok('POST с Authorization', c.init && c.init.method === 'POST' && /^Bearer /.test(c.init.headers.Authorization));
    ok('тяло {task_id, recipients, run_date, run_time}', JSON.stringify(c.body) === JSON.stringify({
      task_id: 't-pub', recipients: { groups: ['co'], user_ids: ['u-mp'] }, run_date: TODAY, run_time: '18:00' }), JSON.stringify(c.body));
    ok('успех → ok (ще се запише last_sent_at)', out.sent[0] && out.sent[0].ok === true);
    const f2 = fakeFetch({ status: 200, body: { ok: true, sent: 1 } });
    await tick(R, [row()], bgAt(18, 15), f2);
    ok('в края на прозореца (18:15) — още тръгва', f2.calls.length === 1);
  }

  section('2. Преди часа / след прозореца / друг ден / вече пратен → нищо');
  {
    const cases = [['17:59', bgAt(17, 59), row()], ['18:16', bgAt(18, 16), row()],
      ['друг ден', bgAt(18, 0), row({ scheduled_date: '2026-09-19' })],
      ['вече пратен', bgAt(18, 5), row({ last_sent_at: TODAY + 'T15:00:00Z' })]];
    for (const [label, bg, r] of cases) {
      const f = fakeFetch({ status: 200, body: { ok: true, sent: 1 } });
      await tick(R, [r], bg, f);
      ok(label + ' → нула заявки', f.calls.length === 0, String(f.calls.length));
    }
  }

  section('3. Чернова / изтрита задача → нищо; изтритата се логва');
  {
    const f = fakeFetch({ status: 200, body: { ok: true, sent: 1 } });
    const d = await tick(R, [row({ entity_id: 't-draft' })], bgAt(18, 0), f);
    ok('чернова → нула заявки', f.calls.length === 0);
    ok('причина „бюлетинът не е публикуван"', d.skipped[0] === 'бюлетинът не е публикуван', JSON.stringify(d.skipped));
    const g = fakeFetch({ status: 200, body: { ok: true, sent: 1 } });
    const x = await tick(R, [row({ entity_id: 't-gone' })], bgAt(18, 0), g);
    ok('изтрита → нула заявки', g.calls.length === 0);
    ok('причина „задачата не е намерена"', x.skipped[0] === 'задачата не е намерена', JSON.stringify(x.skipped));
  }

  section('4. Резултатът от send-routed-report решава last_sent_at');
  {
    const cases = [['sent:0 (няма получатели)', { status: 200, body: { ok: true, sent: 0, skipped: 'няма получатели' } }, false],
      ['HTTP 500', { status: 500, body: { ok: false } }, false], ['ok:false', { status: 200, body: { ok: false, sent: 0 } }, false],
      ['sent:2', { status: 200, body: { ok: true, sent: 2 } }, true]];
    for (const [label, reply, want] of cases) {
      const { r } = await captureWarn(() => R.sendTaskReport(row(), TODAY, fakeFetch(reply)));
      ok(label + ' → ok=' + want, r.ok === want, JSON.stringify(r));
    }
    const { r, got } = await captureWarn(() => R.sendTaskReport(row(), TODAY, fakeFetch(new Error('мрежа'))));
    ok('мрежова грешка → ok=false, не хвърля', r.ok === false);
    ok('празен target_recipients → празни масиви, не грешка',
      JSON.stringify(R.taskReportRequestBody(row({ target_recipients: null }), TODAY).recipients) === '{"groups":[],"user_ids":[]}');
  }

  section('5. Обработчикът (закотвено в Deno.serve)');
  {
    const src = fs.readFileSync(RESP, 'utf8');
    const serve = src.slice(src.indexOf('Deno.serve('));
    ok('филтърът е scheduleIsDue', /\.filter\(\(s: any\) => scheduleIsDue\(s, bg, todayStr, todayDow\)\)/.test(serve));
    const gate = serve.indexOf('await publicationScheduleGate(supabase, s, todayStr)');
    const warn = serve.search(/if \(s\.entity_type === 'task_report'\) console\.warn\(/);
    const br = serve.indexOf("if (s.entity_type === 'task_report') {");
    const push = serve.indexOf('await fetch(SEND_FN_URL');
    ok('пропуснатият task_report се логва (console.warn) в гейта', gate >= 0 && warn > gate && warn < br);
    ok('разклонението е СЛЕД гейта и ПРЕДИ push-а', gate >= 0 && br > gate && push > br, gate + ' / ' + br + ' / ' + push);
    const block = serve.slice(br, serve.indexOf('continue;', br) + 9);
    ok('вика sendTaskReport(s, todayStr, fetch)', /await sendTaskReport\(s, todayStr, fetch\)/.test(block));
    ok('last_sent_at само при tr.ok', /if \(tr\.ok\) \{[\s\S]*last_sent_at: now\.toISOString\(\)/.test(block));
    /* Веднага след results.push на отчета — иначе котвата хваща следващото
       continue по-надолу и мълчи, ако push-ът тръгне след писмото. */
    ok('и continue веднага след него — push не тръгва',
      /results\.push\(\{ id: s\.id, ok: tr\.ok, task_report: true, detail: tr\.detail \}\);\s*continue;\s*\}/.test(serve));
    ok('гейтът покрива task_report', /s\.entity_type === 'task' \|\| s\.entity_type === 'subtask' \|\| s\.entity_type === 'task_report'/.test(src));
  }

  section('6. Routed: тема и получатели');
  {
    ok('тема „Отчет: Витрина — 18.09.2026 18:00"', T.routedTaskReportSubject('Витрина', '2026-09-18', '18:00') === 'Отчет: Витрина — 18.09.2026 18:00', T.routedTaskReportSubject('Витрина', '2026-09-18', '18:00'));
    ok('без дата → „Отчет: Витрина"', T.routedTaskReportSubject('Витрина', null, '18:00') === 'Отчет: Витрина');
    const db = routedDb();
    const groupUsers = db.users.filter(u => u.active);
    const w = [];
    const got = T.routedTaskReportRecipients({ id: 't', title: 'X', target_stores: null, created_by: 'Миглена Павлова' },
      { groups: ['co', 'owner'], user_ids: [MP_ID, 'u-zh', 'u-off', 'u-нема'] }, groupUsers, db.users, w);
    const em = got.map(x => x.email).sort().join(',');
    ok('co (двама) + Миглена по id; Жеко веднъж; неактивният — не', em === 'j.jeliazkov@temax.bg,m.pavlova@temax.bg,v.shikova@temax.bg', em);
    ok('owner без членове → предупреждение', w.length === 1 && w[0].group === 'owner', JSON.stringify(w));
    const noAuthor = T.routedTaskReportRecipients({ id: 't', created_by: 'Миглена Павлова' }, { groups: ['co'], user_ids: [] }, groupUsers, db.users, []);
    ok('авторът НЕ се добавя сам (само ако е в user_ids)', noAuthor.every(x => x.email !== 'm.pavlova@temax.bg'), noAuthor.map(x => x.email).join(','));
    const reg = [{ email: 'r1@t.bg', is_regional: true, assigned_stores: ['Троян'], active: true }, { email: 'r2@t.bg', is_regional: true, assigned_stores: ['Русе'], active: true }];
    const rr = T.routedTaskReportRecipients({ id: 't', target_stores: ['Троян'] }, { groups: ['regional'] }, reg, [], []);
    ok('regional — по обектите на задачата', rr.map(x => x.email).join(',') === 'r1@t.bg', rr.map(x => x.email).join(','));
  }

  section('7. Routed: целият път с фалшива база');
  {
    const run = async (body, dbOver, dry) => {
      const log = { get: [], mail: [] };
      globalThis.fetch = pgFetch(routedDb(dbOver), log);
      const topic = (dbOver && dbOver.notification_topics) ? dbOver.notification_topics[0] : { test_email: null };
      const { r, got } = await captureWarn(() => T.routedTaskReportResponse(body, !!dry, topic.test_email || null));
      const j = await r.json();
      return { j, log, warns: got };
    };
    const body = { task_id: 't-pub', recipients: { groups: ['co'], user_ids: [MP_ID] }, run_date: '2026-09-18', run_time: '18:00' };
    const a = await run(body);
    ok('3 писма', a.log.mail.length === 3 && a.j.sent === 3, JSON.stringify(a.j));
    ok('до Жеко, Васка, Миглена', a.log.mail.map(m => m.to[0]).sort().join(',') === 'j.jeliazkov@temax.bg,m.pavlova@temax.bg,v.shikova@temax.bg');
    ok('темата е „Отчет: Витрина — 18.09.2026 18:00"', a.log.mail.every(m => m.subject === 'Отчет: Витрина — 18.09.2026 18:00'), a.log.mail[0] && a.log.mail[0].subject);
    const html = (a.log.mail[0] || {}).html || '';
    ok('ЕДНА картичка за задачата', (html.match(/Витрина<\/div>/g) || []).length === 1);
    ok('„1 от 2 обекта изпълнили"', html.indexOf('1 от 2 обекта изпълнили') >= 0);
    ok('Ловеч е в „Не са изпълнили" (старата отметка от 01.09 не се брои)', /Не са изпълнили: Ловеч/.test(html));
    ok('коментарът на Троян е в картичката', html.indexOf('Готово') >= 0);
    ok('отметките са в прозореца на бюлетина (14.09–20.09)', a.log.get.some(g => /task_completions\?task_id=eq\.t-pub&completion_date=gte\.2026-09-14&completion_date=lte\.2026-09-20/.test(g)), a.log.get.join(' | '));
    ok('хората по id — с явен select, без password', a.log.get.some(g => g === 'users?id=in.(' + MP_ID + ')&select=id,email,display_name,active') && !a.log.get.some(g => /password|select=\*/.test(g)));

    const junk = await run({ task_id: 't-pub', recipients: { groups: [], user_ids: ['1),or=(id.not.is.null', 'x'] } });
    ok('не-uuid id не влиза в заявката (и не прави получател)', !junk.log.get.some(g => /^users\?id=in/.test(g)) && junk.log.mail.length === 0, junk.log.get.join(' | '));
    const gone = await run(Object.assign({}, body, { task_id: 't-gone' }));
    ok('изтрита → 0 писма, skipped', gone.log.mail.length === 0 && gone.j.skipped === 'задачата не е намерена', JSON.stringify(gone.j));
    ok('и console.warn', gone.warns.some(x => /не е намерена/.test(x)));
    const dr = await run(Object.assign({}, body, { task_id: 't-draft' }));
    ok('чернова → 0 писма, skipped', dr.log.mail.length === 0 && dr.j.skipped === 'бюлетинът не е публикуван');
    const none = await run({ task_id: 't-pub', recipients: { groups: ['owner'], user_ids: [] } });
    ok('0 получатели → 0 писма, skipped „няма получатели"', none.log.mail.length === 0 && none.j.skipped === 'няма получатели', JSON.stringify(none.j));
    ok('празната група е в empty_groups и в лога', none.j.empty_groups.length === 1 && none.warns.some(x => /owner/.test(x)));
    const dry = await run(body, null, true);
    ok('dry_run → план без писма', dry.log.mail.length === 0 && dry.j.dry_run === true && dry.j.recipients === 3);
    const test = await run(body, { notification_topics: [{ key: 'weekly_routed', active: true, test_email: 'test@temax.bg' }] });
    ok('test_email → и трите писма към него, с лента', test.log.mail.length === 3 && test.log.mail.every(m => m.to[0] === 'test@temax.bg' && m.html.indexOf('ТЕСТОВ РЕЖИМ') >= 0));
  }

  section('8. Routed обработчикът (закотвено)');
  {
    const src = fs.readFileSync(ROUTED, 'utf8');
    const serve = src.slice(src.indexOf('Deno.serve('));
    const inactive = serve.indexOf('if (!topic.active)');
    const branch = serve.indexOf('if (body && body.task_id) {');
    const weekly = serve.indexOf('collectWeeklyRoutingData(resolve)');
    ok('режимът е СЛЕД проверката на темата и ПРЕДИ седмичния колектор', inactive >= 0 && branch > inactive && weekly > branch, inactive + ' / ' + branch + ' / ' + weekly);
    ok('return await routedTaskReportResponse(body, dryRun, testEmail)', /if \(body && body\.task_id\) \{\s*return await routedTaskReportResponse\(body, dryRun, testEmail\);/.test(serve));
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
