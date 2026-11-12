/* „📋 КОЙ КАКВО ПОЛУЧАВА" (otcheti-tablica, 12.11.2026, етап 2б от искането на
   Теодор 11.11): таблица човек × писмо в Администрация → Известия, построена
   САМО от отговорите на функциите в режим recipients_only.

   Какво заковава:
     1. recipients_only в ИСТИНСКИТЕ handler-и (index.ts във vm, типовете махнати):
        send-oborot-report, send-routed-report и bulletin-notify — нула POST-а към
        resend-email (и към push), нула записи; получателите са СЪЩИТЕ като при
        пращането (oborot: кронът праща точно на send:true; routed: седмичният
        план = dry_run; task_report = routedTaskReportRecipients); routed отговаря
        и при изключена тема, а кронът при нея пак не праща;
     2. таблицата (истински клик „Зареди" и „⬇ Excel"): едно извикване на всяка
        функция; човек в две колони; филтър по обект / роля / търсене;
        minus_multi с обхват е „условно · …", не „✓"; грешка в един източник →
        САМО неговите колони са „—" + „не се зареди", останалото се показва;
        не-admin не вижда раздела и нищо не вика;
     2б. предпазителят: тялото е {recipients_only, dry_run} — стара версия на
        функция (без клона recipients_only) само симулира, нищо не праща;
     3. закотвени списъци: колоните = типовете с имейл (send-scheduled-report
        REPORT_RO_TYPES, bulletin-notify RO_TOPIC_KEYS без само-push, oborot,
        weekly_routed, task_report) и = EMAIL_KINDS по-долу (cron.job и
        notification_topics към 12.11.2026); RO_TOPIC_KEYS = IMPLEMENTED_TOPICS;
        блокът „При действие в портала" = извикванията на sendEmail / llMailTo в *.js.

   Мутационна проверка (12.11.2026) — всяка СЪБАРЯ теста (exit 1):
     М1 грешка в един източник скрива цялата таблица (whoRender връща рано при err);
     М2 minus_multi „условно" се показва като ✓ (whoCellText без c.cond);
     М3 раздела го вижда и не-admin (whoCanSee → true);
     М4 send-oborot-report recipients_only пада в пращането (без ранното return);
     М5 send-routed-report recipients_only пада в пращането;
     М6 bulletin-notify recipients_only пада в пращането (без ранното return);
     М7 таблицата вика функциите без dry_run (предпазителят срещу стара версия);
     и отделно: UI_BODY без dry_run → „старите“ oborot и routed пращат (3б пада).
     „Обекти“ / „✓ своите“ (otcheti-tablica-vid, 12.11.2026): М8 сравнение като масив по
     ред вместо като множество; М9 „✓ своите“ и при подмножество; М10 Excel с „✓ своите“.

   Пускане:  node tests/admin-who-gets.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
const _w = process.emitWarning; process.emitWarning = function () {};
const edgeJs = name => nodeModule.stripTypeScriptTypes(
  fs.readFileSync(path.join(ROOT, 'supabase/functions', name, 'index.ts'), 'utf8').replace(/^import\s.*$/mg, ''));
const JS_OB = edgeJs('send-oborot-report');
const JS_RR = edgeJs('send-routed-report');
const JS_BN = edgeJs('bulletin-notify');
process.emitWarning = _w;
const clone = x => JSON.parse(JSON.stringify(x));

/* Типовете с ИМЕЙЛ по крон към 12.11.2026 — от cron.job (19, 20, 17, 18, 26, 30 →
   send-scheduled-report; 14 → send-oborot-report; 16 → send-routed-report
   weekly_routed; 11 → dynamic-responder → send-routed-report task_report) и от
   notification_topics с имейл (overdue_tasks, deadline_passed, promo_expiring,
   loading_lists_pending; today_deadlines и minus_unfilled са само push).
   Нов тип с писмо → ред тук И колона в WHO_COLS (admin.js). */
const EMAIL_KINDS = ['daily', 'weekly', 'pallets', 'warehouse', 'co_overdue', 'minus_multi', 'oborot',
  'weekly_routed', 'task_report', 'overdue_tasks', 'deadline_passed', 'promo_expiring', 'loading_lists_pending'];
const PUSH_ONLY = ['today_deadlines', 'minus_unfilled'];
/* Тялото, което таблицата праща (whoLoad): recipients_only + dry_run предпазител. */
const UI_BODY = { recipients_only: true, dry_run: true };

/* ── Общ vm за функциите, които четат през fetch към REST ── */
function vmRest(js, tables, file) {
  const posts = [], writes = [], gets = [];
  let handler = null;
  const ctx = {
    Response, console: { log() {}, warn() {}, error() {} }, Intl, JSON, Math, Object, Array, String, Number, Promise, Date,
    encodeURIComponent, setTimeout, RegExp,
    Deno: { env: { get: k => (k === 'SUPABASE_URL' ? 'https://x.supabase.co' : 'KEY') }, serve: fn => { handler = fn; } },
    fetch: (url, init) => {
      init = init || {};
      const method = (init.method || 'GET').toUpperCase();
      if (method !== 'GET' || /\/functions\/v1\//.test(url)) {
        let b = null; try { b = JSON.parse(init.body); } catch (e) { b = init.body; }
        if (/\/functions\/v1\/resend-email/.test(url)) posts.push({ url, body: b });
        else writes.push({ method, url, body: b });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('{}') });
      }
      gets.push(url);
      const t = /\/rest\/v1\/([a-z_]+)/.exec(url);
      let rows = t ? tables[t[1]] : null;
      if (typeof rows === 'function') rows = rows(url);
      rows = rows || [];
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(clone(rows)), text: () => Promise.resolve(JSON.stringify(rows)) });
    }
  };
  vm.createContext(ctx);
  vm.runInContext(js, ctx, { filename: file });
  const call = async body => {
    const res = await handler({ method: 'POST', json: () => Promise.resolve(body) });
    return { status: res.status, data: await res.json() };
  };
  return { ctx, call, posts, writes, gets };
}

/* ── Фалшив supabase клиент за bulletin-notify ── */
function fakeSb(data, log) {
  const pass = (row, f) => f[0] === 'eq' ? row[f[1]] === f[2] : f[0] === 'in' ? f[2].indexOf(row[f[1]]) >= 0 : true;
  return {
    from(table) {
      const q = { table, filters: [], op: 'select' };
      const self = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') {
            return (res, rej) => {
              log.push(q);
              if (q.op !== 'select') return Promise.resolve({ error: null }).then(res, rej);
              const rows = (data[table] || []).filter(r => q.filters.every(f => pass(r, f)));
              return Promise.resolve({ data: clone(rows), error: null }).then(res, rej);
            };
          }
          if (prop === 'eq' || prop === 'in') return (c, v) => { q.filters.push([prop, c, v]); return self; };
          if (prop === 'insert' || prop === 'update' || prop === 'delete' || prop === 'upsert') return () => { q.op = prop; return self; };
          return () => self;
        }
      });
      return self;
    }
  };
}
function vmBulletin(data) {
  const log = [], fetches = [];
  let handler = null;
  const ctx = {
    Response, console: { log() {}, warn() {}, error() {} }, Intl, JSON, Math, Object, Array, String, Number, Promise, Date,
    encodeURIComponent, setTimeout, RegExp, Set, Map, Error,
    Deno: { env: { get: k => (k === 'SUPABASE_URL' ? 'https://x.supabase.co' : 'KEY') }, serve: fn => { handler = fn; } },
    createClient: () => fakeSb(data, log),
    fetch: (url, init) => { fetches.push({ url, init }); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('{}') }); }
  };
  vm.createContext(ctx);
  vm.runInContext(JS_BN, ctx, { filename: 'bulletin-notify.js' });
  const call = async body => {
    const res = await handler({ method: 'POST', json: () => Promise.resolve(body) });
    return { status: res.status, data: await res.json() };
  };
  return { ctx, call, log, fetches };
}

/* ── Данните ── */
const USERS = [
  { id: 'u-tt', email: 't.tenev@temax.bg', display_name: 'Теодор Тенев', role: 'admin', store_name: 'Централен офис', active: true, is_regional: false, notify_groups: ['owner'], assigned_stores: null, oborot_report: 'all' },
  { id: 'u-mp', email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', role: 'accounting', store_name: 'Централен офис', active: true, is_regional: false, notify_groups: ['controlling'], assigned_stores: null, oborot_report: null },
  { id: 'u-r1', email: 'reg1@temax.bg', display_name: 'Регионален Едно', role: 'accounting', store_name: 'Централен офис', active: true, is_regional: true, notify_groups: ['regional'], assigned_stores: ['Троян', 'Ловеч'], oborot_report: 'assigned' },
  { id: 'u-r2', email: 'reg2@temax.bg', display_name: 'Регионален Две', role: 'accounting', store_name: 'Централен офис', active: true, is_regional: true, notify_groups: [], assigned_stores: [], oborot_report: 'assigned' },
  { id: 'u-co', email: 'co@temax.bg', display_name: 'Ко Офис', role: 'supply', store_name: 'Централен офис', active: true, is_regional: false, notify_groups: ['co'], assigned_stores: null, oborot_report: null },
  { id: '0a7e0000-0000-4000-8000-0000000000a1', email: 'm1@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: 'Троян', active: true, is_regional: false, notify_groups: [], assigned_stores: null, oborot_report: null },
  { id: 'u-m2', email: 'm2@temax.bg', display_name: 'Управител Ловеч', role: 'manager', store_name: 'Ловеч', active: true, is_regional: false, notify_groups: [], assigned_stores: null, oborot_report: null },
  { id: 'u-wh', email: 'wh@temax.bg', display_name: 'Склад Добрич', role: 'logistics', store_name: 'Логистичен склад Добрич', active: true, is_regional: false, notify_groups: [], assigned_stores: null, oborot_report: null },
  { id: 'u-off', email: 'off@temax.bg', display_name: 'Неактивен', role: 'manager', store_name: 'Враца', active: false, is_regional: false, notify_groups: [], assigned_stores: null, oborot_report: 'all' }
];
const activeUsers = () => USERS.filter(u => u.active);

(async function () {

  section('1. send-oborot-report — recipients_only = кронът, нищо не се праща');
  {
    const tables = { users: USERS, daily_turnover: [], client_orders: [] };
    const L = vmRest(JS_OB, tables, 'send-oborot-report.js');
    const r = await L.call(UI_BODY);
    ok('HTTP 200, ok, recipients_only', r.status === 200 && r.data.ok === true && r.data.recipients_only === true, JSON.stringify(r.data).slice(0, 200));
    ok('нула писма, нула записи', L.posts.length === 0 && L.writes.length === 0, JSON.stringify(L.posts.concat(L.writes)).slice(0, 200));
    ok('чете само users (без оборот)', L.gets.length === 1 && /\/users\?/.test(L.gets[0]), JSON.stringify(L.gets));
    const P = r.data.personal || [];
    const by = e => P.filter(p => p.email === e)[0];
    ok('all → всички обекти; assigned → assigned ∩ обектите; без обекти → send:false; неактивният — никъде',
      by('t.tenev@temax.bg') && by('t.tenev@temax.bg').all === true && by('t.tenev@temax.bg').stores.join('+') === 'Ловеч+Троян' &&
      by('reg1@temax.bg') && by('reg1@temax.bg').stores.join('+') === 'Ловеч+Троян' && by('reg1@temax.bg').send === true &&
      by('reg2@temax.bg') && by('reg2@temax.bg').send === false && !by('off@temax.bg') && P.length === 3, JSON.stringify(P));
    const L2 = vmRest(JS_OB, tables, 'send-oborot-report.js');
    await L2.call({});
    const sentTo = L2.posts.map(p => p.body.to.join(',')).sort();
    ok('кронът праща точно на send:true от recipients_only', JSON.stringify(sentTo) === JSON.stringify(P.filter(p => p.send).map(p => p.email).sort()), JSON.stringify(sentTo));
  }

  section('2. send-routed-report — седмичният план = dry_run; task_report; изключена тема');
  {
    const L0 = vmRest(JS_RR, {}, 'send-routed-report.js');
    const target = L0.ctx.reportWeekOfMonday(L0.ctx.reportPrevWeekMonday(new Date()));
    const mkTables = active => ({
      notification_topics: [{ key: 'weekly_routed', active, scheduled_time: '08:10:00', day_of_week: 'mon', test_email: null }],
      users: activeUsers(),
      bulletins: [{ id: 'b1', status: 'published', week_number: target.week, year: target.year }],
      bulletin_tasks: url => /id=in\./.test(url)
        ? [{ id: '0b7e0000-0000-4000-8000-000000000001', title: 'Еднократна', target_stores: ['Ловеч'] }]
        : [{ id: '0b7e0000-0000-4000-8000-000000000001', bulletin_id: 'b1', title: 'Еднократна', report_groups: ['co', 'regional'], target_stores: ['Ловеч'], created_by: 'Миглена Павлова', task_type: 'info' }],
      recurring_tasks: url => /id=in\./.test(url)
        ? [{ id: '0f7e0000-0000-4000-8000-000000000002', title: 'Постоянна', target_stores: null, report_groups: ['controlling'] }]
        : [{ id: '0f7e0000-0000-4000-8000-000000000002', title: 'Постоянна', active: true, report_groups: ['controlling', 'user:ext@partner.bg'], due_weekdays: [0], due_time: '10:00', task_type: 'info', target_stores: null }],
      recurring_task_periods: [], recurring_task_versions: [], recurring_task_skips: [], task_completions: [],
      notification_schedules: [
        { id: 's1', entity_id: '0b7e0000-0000-4000-8000-000000000001', schedule_type: 'weekly', day_of_week: 'fri', scheduled_time: '16:00:00', target_recipients: { groups: ['co'], user_ids: ['0a7e0000-0000-4000-8000-0000000000a1'] } },
        { id: 's2', entity_id: '0f7e0000-0000-4000-8000-000000000002', schedule_type: 'weekly', day_of_week: 'mon', scheduled_time: '09:00:00', target_recipients: { groups: ['regional'], user_ids: [] } }
      ]
    });
    const L = vmRest(JS_RR, mkTables(true), 'send-routed-report.js');
    const r = await L.call(UI_BODY);
    ok('HTTP 200, recipients_only, weekly и task_reports', r.status === 200 && r.data.recipients_only === true && !!r.data.weekly && Array.isArray(r.data.task_reports), JSON.stringify(r.data).slice(0, 300));
    ok('нула писма, нула записи (без last_status)', L.posts.length === 0 && L.writes.length === 0, JSON.stringify(L.writes).slice(0, 200));
    const D = vmRest(JS_RR, mkTables(true), 'send-routed-report.js');
    const dr = await D.call({ dry_run: true });
    const ro = (r.data.weekly.personal || []).map(p => p.email + ':' + p.zadachi).sort();
    const dp = (dr.data.planned || []).map(p => p.email + ':' + p.zadachi).sort();
    ok('седмичният: recipients_only = dry_run (същият план), и не е празен', ro.length > 0 && JSON.stringify(ro) === JSON.stringify(dp), JSON.stringify(ro) + ' ≠ ' + JSON.stringify(dp));
    const s1 = r.data.task_reports.filter(t => t.schedule_id === 's1')[0], s2 = r.data.task_reports.filter(t => t.schedule_id === 's2')[0];
    ok('task_report s1: групата co + поименно по user_ids', s1 && s1.personal.map(p => p.email).sort().join(',') === 'co@temax.bg,m1@temax.bg', JSON.stringify(s1));
    ok('task_report s2 (постоянна, за всички обекти): regional → регионалните с обекти', s2 && s2.kind === 'recurring' && s2.personal.map(p => p.email).join(',') === 'reg1@temax.bg', JSON.stringify(s2));
    const LI = vmRest(JS_RR, mkTables(false), 'send-routed-report.js');
    const ri = await LI.call(UI_BODY);
    ok('test_email на темата се връща (null тук)', r.data.test_email === null);
    ok('изключена тема: recipients_only пак отговаря, active:false', ri.data.recipients_only === true && ri.data.active === false && LI.posts.length === 0);
    const LC = vmRest(JS_RR, mkTables(false), 'send-routed-report.js');
    const rc = await LC.call({});
    ok('изключена тема: кронът пак не праща', rc.data.skipped === 'темата е изключена' && LC.posts.length === 0, JSON.stringify(rc.data));
  }

  section('3. bulletin-notify — recipients_only по правилото, нищо не се праща и пише');
  {
    const topic = (key, o) => Object.assign({ key, label: key, active: true, schedule_type: 'daily', scheduled_time: '08:15:00', weekdays: [1, 2, 3, 4, 5], day_of_week: null, test_email: null }, o || {});
    const data = {
      notification_topics: [topic('overdue_tasks'), topic('deadline_passed', { scheduled_time: null }), topic('promo_expiring', { scheduled_time: '08:30:00', weekdays: [1, 2, 3, 4, 5, 6, 7] }),
        topic('loading_lists_pending', { scheduled_time: '09:00:00', test_email: 'test@temax.bg' }), topic('today_deadlines'), topic('minus_unfilled', { active: false }), topic('weekly_routed')],
      notification_matrix: [
        { topic_key: 'overdue_tasks', group_key: 'controlling', channel: 'both', scope: 'all' },
        { topic_key: 'overdue_tasks', group_key: 'regional', channel: 'email', scope: 'own_stores' },
        { topic_key: 'overdue_tasks', group_key: 'co', channel: 'push', scope: 'own_tasks' },
        { topic_key: 'promo_expiring', group_key: 'controlling', channel: 'email', scope: 'all' },
        { topic_key: 'promo_expiring', group_key: 'store', channel: 'push', scope: 'own_stores' },
        { topic_key: 'loading_lists_pending', group_key: 'regional', channel: 'email', scope: 'own_stores' },
        { topic_key: 'today_deadlines', group_key: 'store', channel: 'push', scope: 'own_stores' }
      ],
      notification_overrides: [{ topic_key: 'overdue_tasks', user_email: 't.tenev@temax.bg', mode: 'include', channel: 'email', scope: 'all' }],
      users: activeUsers(),
      recurring_tasks: [
        { id: 'r1', title: 'Вечерен оборот', active: true, due_weekdays: [0, 1, 2, 3, 4], due_time: '20:00', report_groups: ['controlling', 'user:ext@partner.bg'], task_type: 'info' },
        { id: 'r2', title: 'Само информация', active: true, due_weekdays: [0], due_time: '10:00', report_groups: ['controlling'], task_type: 'notice' },
        { id: 'r3', title: 'Без час', active: true, due_weekdays: [0], due_time: null, report_groups: ['controlling'], task_type: 'info' },
        { id: 'r4', title: 'Без групи', active: true, due_weekdays: [0], due_time: '11:00', report_groups: [], task_type: 'info' }
      ],
      recurring_task_versions: [],
      app_settings: [{ key: 'minus_stores', value: 'Троян, Ловеч' }]
    };
    const L = vmBulletin(data);
    const r = await L.call(UI_BODY);
    const T = (r.data && r.data.topics) || {};
    ok('HTTP 200, recipients_only, шестте теми (без weekly_routed)', r.status === 200 && r.data.recipients_only === true &&
      Object.keys(T).sort().join(',') === 'deadline_passed,loading_lists_pending,minus_unfilled,overdue_tasks,promo_expiring,today_deadlines', JSON.stringify(Object.keys(T)));
    ok('всяка тема има строител (без error)', Object.keys(T).every(k => !T[k].error), JSON.stringify(Object.keys(T).filter(k => T[k].error)));
    ok('нула fetch (нито имейл, нито push)', L.fetches.length === 0, JSON.stringify(L.fetches.map(f => f.url)));
    ok('нула insert / update / delete (notification_log, notification_topics, task_completions)', L.log.every(q => q.op === 'select'), JSON.stringify(L.log.filter(q => q.op !== 'select')));
    const ov = T.overdue_tasks.personal || [];
    const ovBy = e => ov.filter(p => p.email === e)[0];
    ok('overdue_tasks: матрица + override — контролинг all, регионален own_stores, ЦО push, Теодор (override) all',
      ovBy('m.pavlova@temax.bg').scope === 'all' && ovBy('reg1@temax.bg').scope === 'own_stores' && ovBy('reg1@temax.bg').stores.join('+') === 'Троян+Ловеч' &&
      ovBy('co@temax.bg').channel === 'push' && ovBy('t.tenev@temax.bg').scope === 'all' && T.overdue_tasks.conditional === 'creators', JSON.stringify(ov));
    const dp = T.deadline_passed;
    ok('deadline_passed: само задачата с час и групи, не notice; слот +15 мин', dp.tasks.length === 1 && dp.tasks[0].title === 'Вечерен оборот' && dp.tasks[0].slot === '20:15' &&
      dp.personal.map(p => p.email).sort().join(',') === 'ext@partner.bg,m.pavlova@temax.bg', JSON.stringify(dp));
    ok('promo_expiring: имейл само контролинг; push до обектите', T.promo_expiring.personal.map(p => p.email).join(',') === 'm.pavlova@temax.bg' &&
      T.promo_expiring.push_stores.join('+') === 'Ловеч+Троян', JSON.stringify(T.promo_expiring));
    ok('loading_lists_pending: наблюдаващ регионален + акаунтите на обектите (без склада); test_email се връща',
      T.loading_lists_pending.personal.map(p => p.email).join(',') === 'reg1@temax.bg' &&
      T.loading_lists_pending.store_accounts.map(a => a.email).sort().join(',') === 'm1@temax.bg,m2@temax.bg' && T.loading_lists_pending.test_email === 'test@temax.bg', JSON.stringify(T.loading_lists_pending));
    ok('minus_unfilled: само push, обектите от minus_stores, изключена → active:false', T.minus_unfilled.push === true && T.minus_unfilled.push_stores.join('+') === 'Троян+Ловеч' && T.minus_unfilled.active === false);
    ok('today_deadlines: push, без имейл', T.today_deadlines.push === true && T.today_deadlines.personal.length === 0);
    const one = await vmBulletin(data).call({ recipients_only: true, topic_key: 'promo_expiring' });
    ok('с topic_key — само тази тема', Object.keys(one.data.topics).join() === 'promo_expiring');
    const bad = await vmBulletin(data).call({ recipients_only: true, topic_key: 'няма' });
    ok('непозната тема → 404, не празно', bad.status === 404 && bad.data.ok === false);
  }

  section('3б. Предпазителят dry_run: стара версия (без recipients_only) с тялото от таблицата НЕ праща');
  {
    /* „Стара" = същият файл без клона recipients_only — така изглежда живата
       функция преди деплоя или след връщане назад. */
    const old = js => js.replace(/body\.recipients_only === true/g, 'false');
    const OB = vmRest(old(JS_OB), { users: USERS, daily_turnover: [], client_orders: [] }, 'old-oborot.js');
    await OB.call(UI_BODY);
    ok('send-oborot-report (стара): нула писма, нула записи', OB.posts.length === 0 && OB.writes.length === 0, JSON.stringify(OB.posts).slice(0, 200));
    const L0 = vmRest(JS_RR, {}, 'x.js');
    const tg = L0.ctx.reportWeekOfMonday(L0.ctx.reportPrevWeekMonday(new Date()));
    const RRo = vmRest(old(JS_RR), {
      notification_topics: [{ key: 'weekly_routed', active: true }], users: activeUsers(),
      bulletins: [{ id: 'b1', status: 'published', week_number: tg.week, year: tg.year }],
      bulletin_tasks: [{ id: '0b7e0000-0000-4000-8000-000000000001', bulletin_id: 'b1', title: 'Т', report_groups: ['co'], task_type: 'info' }]
    }, 'old-routed.js');
    const rro = await RRo.call(UI_BODY);
    ok('send-routed-report (стара): нула писма, без last_status (dry_run с план)', RRo.posts.length === 0 && RRo.writes.length === 0 && rro.data.dry_run === true && rro.data.recipients > 0,
      JSON.stringify(rro.data).slice(0, 200));
    const BNd = { notification_topics: [{ key: 'overdue_tasks', active: true, schedule_type: 'daily', scheduled_time: '00:00:00', weekdays: [1, 2, 3, 4, 5, 6, 7] }],
      notification_matrix: [{ topic_key: 'overdue_tasks', group_key: 'controlling', channel: 'email', scope: 'all' }], users: activeUsers(), app_settings: [] };
    const log = [], fetches = [];
    let hnd = null;
    const ctx = { Response, console: { log() {}, warn() {}, error() {} }, Intl, JSON, Math, Object, Array, String, Number, Promise, Date, encodeURIComponent, setTimeout, RegExp, Set, Map, Error,
      Deno: { env: { get: () => 'https://x.supabase.co' }, serve: fn => { hnd = fn; } }, createClient: () => fakeSb(BNd, log),
      fetch: (url) => { fetches.push(url); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('{}') }); } };
    vm.createContext(ctx); vm.runInContext(old(JS_BN), ctx, { filename: 'old-bn.js' });
    await hnd({ method: 'POST', json: () => Promise.resolve(UI_BODY) });
    ok('bulletin-notify (стара): нула fetch, нула записи (и без автоматична отметка)', fetches.length === 0 && log.every(q => q.op === 'select'),
      JSON.stringify(fetches) + ' ' + JSON.stringify(log.filter(q => q.op !== 'select')));
  }

  section('4. Закотвени списъци — колоните, темите, писмата от браузъра');
  {
    const h = boot({ modules: ['admin.js'], user: { id: 'u', email: 'a@temax.bg', role: 'admin', store_name: 'Централен офис' }, data: {} });
    const cols = h.w.WHO_COLS.map(c => c.key);
    const ssr = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');
    const bn = fs.readFileSync(path.join(ROOT, 'supabase/functions/bulletin-notify/index.ts'), 'utf8');
    const roTypes = JSON.parse(/var REPORT_RO_TYPES = (\[[^\]]*\])/.exec(ssr)[1].replace(/'/g, '"'));
    const roTopics = JSON.parse(/const RO_TOPIC_KEYS = (\[[^\]]*\])/.exec(bn)[1].replace(/'/g, '"'));
    const impl = /const IMPLEMENTED_TOPICS = \[([\s\S]*?)\];/.exec(bn)[1].match(/key: '([a-z_]+)'/g).map(s => s.slice(6, -1));
    const fromCode = roTypes.concat(['oborot', 'weekly_routed', 'task_report'], roTopics.filter(k => PUSH_ONLY.indexOf(k) < 0));
    ok('колоните = типовете с имейл в кода на функциите', JSON.stringify(cols.slice().sort()) === JSON.stringify(fromCode.slice().sort()), cols + ' ≠ ' + fromCode);
    ok('колоните = EMAIL_KINDS (cron.job + notification_topics, 12.11.2026)', JSON.stringify(cols.slice().sort()) === JSON.stringify(EMAIL_KINDS.slice().sort()), String(cols));
    ok('RO_TOPIC_KEYS = IMPLEMENTED_TOPICS (нова тема не изпада от таблицата)', JSON.stringify(roTopics.slice().sort()) === JSON.stringify(impl.slice().sort()), roTopics + ' ≠ ' + impl);
    ok('само-push темите = WHO_PUSH_ONLY', JSON.stringify(h.w.WHO_PUSH_ONLY.slice().sort()) === JSON.stringify(PUSH_ONLY.slice().sort()));
    /* Извикванията на sendEmail / llMailTo в *.js, без коментарите и без тялото на llMailTo. */
    const sites = [];
    fs.readdirSync(ROOT).filter(f => /\.js$/.test(f)).forEach(f => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
      let fn = null;
      src.split(/\r?\n/).forEach(l => {
        const m = /^(?:async\s+)?function\s+([A-Za-z0-9_$]+)/.exec(l); if (m) fn = m[1];
        const code = l.replace(/\/\/.*$/, '');
        if (/\b(sendEmail|llMailTo)\(/.test(code) && !/function (sendEmail|llMailTo)\b/.test(code) && fn !== 'llMailTo') {
          const s = f + ':' + fn; if (sites.indexOf(s) < 0) sites.push(s);
        }
      });
    });
    const listed = [].concat.apply([], h.w.WHO_BROWSER_MAILS.map(m => m.sites));
    ok('„При действие в портала" = извикванията на sendEmail / llMailTo (' + sites.length + ')',
      JSON.stringify(listed.slice().sort()) === JSON.stringify(sites.slice().sort()), 'в кода: ' + sites.sort().join(' ') + '\n      в таблицата: ' + listed.sort().join(' '));
    h.close();
  }

  section('5. Таблицата — истински клик, едно извикване на функция, грешка в един източник');
  const SSR = { ok: true, recipients_only: true, types: {
    daily: { type: 'daily', general: ['t.tenev@temax.bg', 'ten.tenev@temax.bg'], personal: [{ email: 'reg1@temax.bg', name: 'Р1', stores: ['Троян', 'Ловеч'], source: 'regional' }, { email: 'm1@temax.bg', name: 'М1', stores: ['Троян'], source: 'manager' }] },
    weekly: { type: 'weekly', general: ['t.tenev@temax.bg'], personal: [] },
    pallets: { type: 'pallets', general: ['t.tenev@temax.bg'], personal: [] },
    warehouse: { type: 'warehouse', general: [], personal: [{ email: 'wh@temax.bg', name: 'С', stores: ['Логистичен склад Добрич'], source: 'logistics' }] },
    co_overdue: { type: 'co_overdue', general: ['t.tenev@temax.bg', 'co@temax.bg'], personal: [] },
    minus_multi: { type: 'minus_multi', general: [], personal: [
      { email: 'm.pavlova@temax.bg', name: 'МП', stores: ['Троян', 'Ловеч'], source: 'recipient', scoped: false, conditional: false },
      { email: 'reg1@temax.bg', name: 'Р1', stores: ['Троян'], source: 'regional', scoped: true, conditional: true }] }
  } };
  const OB = { ok: true, recipients_only: true, type: 'oborot', general: [], personal: [
    { email: 't.tenev@temax.bg', name: 'ТТ', stores: ['Ловеч', 'Троян'], all: true, source: 'all', send: true },
    { email: 'reg1@temax.bg', name: 'Р1', stores: ['Троян', 'Ловеч'], all: false, source: 'assigned', send: true }] };
  const RR = { ok: true, recipients_only: true, topic: 'weekly_routed', active: true, scheduled_time: '08:10:00', day_of_week: 'mon',
    weekly: { week: 'С45', personal: [{ email: 'm.pavlova@temax.bg', name: 'МП', zadachi: 3, titles: ['А', 'Б', 'В'] }] },
    task_reports: [{ schedule_id: 's1', title: 'Задача X', scheduled_time: '16:00:00', personal: [{ email: 'co@temax.bg', name: 'КО' }] }] };
  const BN = { ok: true, recipients_only: true, topics: {
    overdue_tasks: { topic: 'overdue_tasks', label: 'Просрочени задачи', active: true, schedule_type: 'daily', scheduled_time: '08:15:00', weekdays: [1, 2, 3, 4, 5], personal: [{ email: 'm.pavlova@temax.bg', name: 'МП', channel: 'both', scope: 'all', stores: [] }, { email: 'reg1@temax.bg', name: 'Р1', channel: 'email', scope: 'own_stores', stores: ['Троян', 'Ловеч'] }], conditional: 'creators' },
    deadline_passed: { topic: 'deadline_passed', active: true, scheduled_time: null, tasks: [], personal: [{ email: 'm.pavlova@temax.bg', name: 'МП', tasks: [{ title: 'Вечерен оборот', slot: '20:15', days: [0] }] }] },
    promo_expiring: { topic: 'promo_expiring', active: true, schedule_type: 'daily', scheduled_time: '08:30:00', weekdays: [1, 2, 3, 4, 5, 6, 7], personal: [{ email: 'm.pavlova@temax.bg', name: 'МП', channel: 'email', scope: 'all', stores: [] }], push_stores: ['Ловеч', 'Троян'] },
    loading_lists_pending: { topic: 'loading_lists_pending', active: true, schedule_type: 'daily', scheduled_time: '09:00:00', weekdays: [1, 2, 3, 4, 5], personal: [], store_accounts: [{ email: 'm2@temax.bg', name: 'М2', store: 'Ловеч' }] },
    today_deadlines: { topic: 'today_deadlines', label: 'Напомняне до обекта', active: true, scheduled_time: '08:00:00', weekdays: [1, 2, 3, 4, 5, 6, 7], personal: [], push: true, push_stores: ['Ловеч', 'Троян'] },
    minus_unfilled: { topic: 'minus_unfilled', label: 'Минуси — непопълнени', active: true, scheduled_time: '10:00:00', weekdays: [1, 2, 3, 4, 5], personal: [], push: true, push_stores: ['Троян'] }
  } };
  const CRON = [{ kind: 'daily', dow: '*', minute: 0, hour_sofia: 21, active: true }, { kind: 'co_overdue', dow: '1-5', minute: 0, hour_sofia: 8, active: true }];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function settle() { await wait(120); for (let i = 0; i < 4; i++) await ticks(); }
  function env(user, replies, users) {
    const h = boot({ modules: ['bulletin.js', 'email.js', 'admin.js', 'report.js'], user,
      data: { users: (users || USERS).map(u => { const c = Object.assign({}, u); delete c.oborot_report; delete c.id; return c; }), rpc: CRON,
        report_recipients: [], notification_topics: [], notification_matrix: [], notification_overrides: [], notification_schedules: [], app_settings: [] } });
    h.edge = {};
    const w = h.w, base = w.fetch;
    w.fetch = function (url, init) {
      const m = /\/functions\/v1\/(send-scheduled-report|send-oborot-report|send-routed-report|bulletin-notify)/.exec(String(url));
      if (m) {
        const b = JSON.parse(init.body);
        (h.edge[m[1]] = h.edge[m[1]] || []).push(b);
        const rep = replies[m[1]];
        const st = rep.__status || 200;
        const txt = rep.__raw !== undefined ? rep.__raw : JSON.stringify(rep);
        return new Promise(res => w.setTimeout(() => res({ ok: st < 400, status: st, text: () => Promise.resolve(txt) }), 20));
      }
      return base(url, init);
    };
    h.xlsx = [];
    w.XLSX = { utils: { book_new: () => ({ sheets: [] }), aoa_to_sheet: aoa => ({ aoa }), book_append_sheet: (wb, ws, n) => wb.sheets.push({ ws, n }) },
      writeFile: (wb, name) => h.xlsx.push({ wb, name }) };
    return h;
  }
  const ADMIN = { id: 'ua', email: 'ten.tenev@temax.bg', role: 'admin', store_name: 'Централен офис' };
  const REPLIES = { 'send-scheduled-report': SSR, 'send-oborot-report': OB, 'send-routed-report': RR, 'bulletin-notify': BN };
  const cell = (h, email, col) => { const tr = h.doc.querySelector('tr.who-row[data-email="' + email + '"]'); const td = tr && tr.querySelector('td[data-col="' + col + '"]'); return td ? td.textContent : null; };
  {
    const h = env(ADMIN, REPLIES);
    h.w.loadNotificationsAdmin();
    await settle();
    ok('преди „Зареди" — нито една функция не е викана', Object.keys(h.edge).length === 0, JSON.stringify(h.edge));
    const b = h.doc.getElementById('who-load-btn');
    if (ok('бутон „📋 Зареди"', !!b)) {
      guard('клик „Зареди" (двоен)', () => { realClick(h.w, b, 'Зареди'); realClick(h.w, b, 'Зареди 2'); });
      await settle();
      ok('по ЕДНО извикване на всяка от четирите функции, тяло {"recipients_only":true,"dry_run":true}',
        ['send-scheduled-report', 'send-oborot-report', 'send-routed-report', 'bulletin-notify'].every(f => h.edge[f] && h.edge[f].length === 1 && JSON.stringify(h.edge[f][0]) === '{"recipients_only":true,"dry_run":true}'), JSON.stringify(h.edge));
      ok('нула писма от браузъра', h.calls.post.filter(p => /resend-email/.test(p.url)).length === 0);
      ok('„Данни към дд.мм чч:мм"', /^Данни към \d\d\.\d\d \d\d:\d\d$/.test((h.doc.getElementById('who-at') || {}).textContent || ''));
      ok('Теодор: Дневен ✓ всички и Оборот ✓ всички (човек в две колони)', cell(h, 't.tenev@temax.bg', 'daily') === '✓ всички' && cell(h, 't.tenev@temax.bg', 'oborot') === '✓ всички');
      ok('външен адрес без акаунт (ten.tenev) — ред с роля „външен адрес"', /външен адрес/.test((h.doc.querySelector('tr.who-row[data-email="ten.tenev@temax.bg"]') || {}).textContent || ''));
      ok('регионален: Дневен = своите обекти → „✓ своите“, роля „регионален"', cell(h, 'reg1@temax.bg', 'daily') === '✓ своите' && /регионален/.test(h.doc.querySelector('tr.who-row[data-email="reg1@temax.bg"]').textContent));
      ok('minus_multi с обхват → „условно · Троян", не ✓', cell(h, 'reg1@temax.bg', 'minus_multi') === 'условно · Троян', cell(h, 'reg1@temax.bg', 'minus_multi'));
      ok('minus_multi без обхват → обектите, без „условно"', cell(h, 'm.pavlova@temax.bg', 'minus_multi') === 'Троян, Ловеч');
      ok('Задачи седмично: „3 задачи"; Отчети по задача: „1 отчет"; Изтекъл срок: „1 задача"',
        cell(h, 'm.pavlova@temax.bg', 'weekly_routed') === '3 задачи' && cell(h, 'co@temax.bg', 'task_report') === '1 отчет' && cell(h, 'm.pavlova@temax.bg', 'deadline_passed') === '1 задача');
      ok('Товарни листи: акаунтът на обекта (Ловеч = своят) — „условно · своите“', cell(h, 'm2@temax.bg', 'loading_lists_pending') === 'условно · своите');
      const th = col => (h.doc.querySelector('#who-table th[data-col="' + col + '"]') || {}).textContent || '';
      ok('часът от report_cron_schedule (Просрочени КЗ „пн–пт 08:00", Дневен „21:00")', /пн–пт 08:00/.test(th('co_overdue')) && /21:00/.test(th('daily')), th('co_overdue'));
      ok('часът на темите от notification_topics (Промоции 08:30, Просрочени задачи пн–пт 08:15)', /08:30/.test(th('promo_expiring')) && /пн–пт 08:15/.test(th('overdue_tasks')));
      ok('само push — два реда под таблицата', h.doc.querySelectorAll('.who-push-row').length === 2);
      ok('„При действие в портала" — по ред на писмо', h.doc.querySelectorAll('.who-browser-row').length === h.w.WHO_BROWSER_MAILS.length);
      ok('без грешки → няма „не се зареди"', !h.doc.getElementById('who-errors') && h.doc.querySelectorAll('.who-col-err').length === 0);

      /* Филтри */
      const rows = () => Array.prototype.map.call(h.doc.querySelectorAll('tr.who-row'), tr => tr.getAttribute('data-email')).sort();
      const all = rows();
      const fs1 = h.doc.getElementById('who-f-store');
      fs1.value = 'Ловеч'; H.fire(h.w, fs1, 'change');
      const lov = rows();
      ok('филтър обект „Ловеч" → всички, които получават нещо за него (вкл. „всички"), без склада и управителя на Троян',
        lov.indexOf('m2@temax.bg') >= 0 && lov.indexOf('t.tenev@temax.bg') >= 0 && lov.indexOf('reg1@temax.bg') >= 0 && lov.indexOf('wh@temax.bg') < 0 && lov.indexOf('m1@temax.bg') < 0 && lov.length < all.length, JSON.stringify(lov));
      fs1.value = ''; H.fire(h.w, fs1, 'change');
      const fr = h.doc.getElementById('who-f-role');
      fr.value = 'управител'; H.fire(h.w, fr, 'change');
      ok('филтър роля „управител"', JSON.stringify(rows()) === JSON.stringify(['m1@temax.bg', 'm2@temax.bg']), JSON.stringify(rows()));
      fr.value = ''; H.fire(h.w, fr, 'change');
      const q = h.doc.getElementById('who-f-q');
      q.value = 'миглена'; H.fire(h.w, q, 'input');
      ok('търсене по име', JSON.stringify(rows()) === JSON.stringify(['m.pavlova@temax.bg']), JSON.stringify(rows()));
      q.value = ''; H.fire(h.w, q, 'input');
      ok('без филтри — пак всички', JSON.stringify(rows()) === JSON.stringify(all));

      /* Excel */
      const xb = h.doc.getElementById('who-xlsx-btn');
      guard('клик „⬇ Excel"', () => realClick(h.w, xb, 'Excel'));
      const x = h.xlsx[0];
      const aoa = x && x.wb.sheets[0].ws.aoa;
      ok('Excel: един файл, заглавие „данни към", редовете = таблицата', !!x && /^koy-kakvo-poluchava-\d{4}-\d\d-\d\d\.xlsx$/.test(x.name) &&
        /данни към/.test(aoa[0][0]) && aoa.length === 2 + all.length, x ? x.name + ' ' + aoa.length : 'няма файл');
      const hdr = aoa[1], ri = aoa.filter(rw => rw[1] === 'reg1@temax.bg')[0];
      ok('Excel: клетката minus_multi е „условно · Троян"', ri && ri[hdr.findIndex(c => /^Минуси повтарящи се/.test(c))] === 'условно · Троян', JSON.stringify(ri));
    }
    h.close();
  }
  {
    /* „Обекти" и „✓ своите" (otcheti-tablica-vid, 12.11.2026). Регионален със 7
       обекта, отчетите връщат обектите в ДРУГ ред (функциите сортират) — пак е
       „своите"; подмножество → пълният списък; Excel — винаги пълният. */
    const SEVEN = ['Добрич', 'Силистра', 'Сливен', 'Търговище', 'Шумен', 'Варна', 'Разград'];
    const SORTED = SEVEN.slice().sort((a, b) => a.localeCompare(b, 'bg'));
    const U7 = USERS.concat([
      { email: 'filev@temax.bg', display_name: 'В. Филев', role: 'admin', store_name: 'Централен офис', active: true, is_regional: true, notify_groups: [], assigned_stores: SEVEN }
    ]);
    const R7 = Object.assign({}, REPLIES, {
      'send-scheduled-report': Object.assign({}, SSR, { types: Object.assign({}, SSR.types, {
        daily: { type: 'daily', general: SSR.types.daily.general, personal: SSR.types.daily.personal.concat([{ email: 'filev@temax.bg', name: 'ВФ', stores: SORTED, source: 'regional' }]) },
        minus_multi: { type: 'minus_multi', general: [], personal: SSR.types.minus_multi.personal.concat([{ email: 'filev@temax.bg', name: 'ВФ', stores: ['Шумен', 'Добрич', 'Търговище'], source: 'regional', scoped: true, conditional: true }]) },
        pallets: { type: 'pallets', general: SSR.types.pallets.general, personal: [{ email: 'filev@temax.bg', name: 'ВФ', stores: SORTED, source: 'regional' }] }
      }) }),
      'send-oborot-report': Object.assign({}, OB, { personal: OB.personal.concat([{ email: 'filev@temax.bg', name: 'ВФ', stores: SEVEN.slice(0, 6).concat(['Габрово']), all: false, source: 'assigned', send: true }]) }),
      'bulletin-notify': Object.assign({}, BN, { topics: Object.assign({}, BN.topics, {
        loading_lists_pending: Object.assign({}, BN.topics.loading_lists_pending, { store_accounts: [{ email: 'm2@temax.bg', name: 'М2', store: 'Ловеч' }, { email: 'm1@temax.bg', name: 'М1', store: 'Троян' }] })
      }) })
    });
    const h = env(ADMIN, R7, U7);
    h.w.loadNotificationsAdmin(); await settle();
    realClick(h.w, h.doc.getElementById('who-load-btn'), 'Зареди'); await settle();
    const td = (e, col) => { const tr = h.doc.querySelector('tr.who-row[data-email="' + e + '"]'); return tr && tr.querySelector('td[data-col="' + col + '"]'); };
    ok('колона „Обекти" веднага след „Роля / отдел"', (() => { const ths = Array.prototype.map.call(h.doc.querySelectorAll('#who-table thead th'), t => t.textContent.trim().split('\n')[0]); return ths[2] === 'Роля / отдел' && ths[3] === 'Обекти'; })());
    ok('регионален: „Обекти" = assigned_stores (7)', td('filev@temax.bg', 'own').textContent === SEVEN.join(', '), td('filev@temax.bg', 'own').textContent);
    ok('регионален: Дневен = същите 7 в друг ред → „✓ своите", пълният списък в title',
      td('filev@temax.bg', 'daily').textContent === '✓ своите' && td('filev@temax.bg', 'daily').getAttribute('title') === SORTED.join(', '), td('filev@temax.bg', 'daily').outerHTML.slice(0, 200));
    ok('регионален: Палети — също „✓ своите"', td('filev@temax.bg', 'pallets').textContent === '✓ своите');
    ok('регионален: Минуси (подмножество, условно) → пълният списък', td('filev@temax.bg', 'minus_multi').textContent === 'условно · Шумен, Добрич, Търговище');
    ok('регионален: Оборот — различни (6 свои + Габрово) → пълният списък', td('filev@temax.bg', 'oborot').textContent === SEVEN.slice(0, 6).concat(['Габрово']).join(', '));
    ok('управител: „Обекти" = обектът; Товарни листи на своя обект → „условно · своите"', td('m1@temax.bg', 'own').textContent === 'Троян' && td('m1@temax.bg', 'loading_lists_pending').textContent === 'условно · своите' &&
      td('m1@temax.bg', 'daily').textContent === '✓ своите');
    ok('ЦО: „Обекти" е празно; ✓ всички остава', td('co@temax.bg', 'own').textContent === '' && td('co@temax.bg', 'co_overdue').textContent === '✓ всички');
    ok('външен адрес: „Обекти" е празно', td('ten.tenev@temax.bg', 'own').textContent === '');
    ok('имейлът се пренася в клетката си (overflow-wrap:anywhere), не се реже', /overflow-wrap:\s*anywhere/.test(td('filev@temax.bg', 'own').previousElementSibling.previousElementSibling.getAttribute('style')) &&
      td('filev@temax.bg', 'own').previousElementSibling.previousElementSibling.textContent === 'filev@temax.bg');
    ok('таблицата е tbl-wrap tbl-compact tbl-auto (лейаут по съдържанието) и превърта в кутията (overflow-x:auto inline)', (() => {
      const wr = h.doc.querySelector('#who-table').closest('.tbl-wrap');
      return !!wr && wr.classList.contains('tbl-compact') && wr.classList.contains('tbl-auto') && /overflow-x:\s*auto/.test(wr.getAttribute('style') || '');
    })());
    /* Закаченият thead на tbl-compact (≥1200px) в кутия с overflow-x се измества и
       покрива първия ред — мерено в браузър на 1600px; тук — заковано по стил. */
    ok('заглавките на таблицата са position:static (без закачане)', Array.prototype.every.call(h.doc.querySelectorAll('#who-table thead th'), t => /position:\s*static/.test(t.getAttribute('style') || '')));
    realClick(h.w, h.doc.getElementById('who-xlsx-btn'), 'Excel');
    const aoa = h.xlsx[0] && h.xlsx[0].wb.sheets[0].ws.aoa;
    const hdr = aoa && aoa[1], fr = aoa && aoa.filter(r => r[1] === 'filev@temax.bg')[0], mr = aoa && aoa.filter(r => r[1] === 'm1@temax.bg')[0];
    const col = re => hdr.findIndex(c => re.test(c));
    ok('Excel: пълният списък, не „✓ своите" (Дневен, Палети, Товарни листи)', !!fr && fr[col(/^Дневен/)] === SORTED.join(', ') && fr[col(/^Палети/)] === SORTED.join(', ') &&
      mr[col(/^Товарни листи/)] === 'условно · Троян' && aoa.every(r => r.indexOf('✓ своите') < 0 && r.indexOf('условно · своите') < 0), JSON.stringify(fr));
    ok('Excel: колоните са непроменени (няма „Обекти")', hdr.indexOf('Обекти') < 0 && hdr.length === 3 + 13);
    h.close();
  }
  {
    /* Един източник пада → само неговите колони са „—", останалото е тук. */
    const h = env(ADMIN, Object.assign({}, REPLIES, { 'send-routed-report': { __status: 500, ok: false, error: 'boom routed' } }));
    h.w.loadNotificationsAdmin();
    await settle();
    realClick(h.w, h.doc.getElementById('who-load-btn'), 'Зареди');
    await settle();
    ok('таблицата е показана', !!h.doc.getElementById('who-table') && h.doc.querySelectorAll('tr.who-row').length > 0);
    ok('червеният ред назовава функцията и грешката', /send-routed-report \(boom routed\)/.test((h.doc.getElementById('who-errors') || {}).textContent || ''));
    const errCols = Array.prototype.map.call(h.doc.querySelectorAll('.who-col-err'), e => e.parentNode.getAttribute('data-col')).sort();
    ok('„не се зареди" само при weekly_routed и task_report', JSON.stringify(errCols) === '["task_report","weekly_routed"]', JSON.stringify(errCols));
    ok('клетките им са „—"', cell(h, 'm.pavlova@temax.bg', 'weekly_routed') === '—' && cell(h, 't.tenev@temax.bg', 'task_report') === '—');
    ok('останалите колони са с данни', cell(h, 't.tenev@temax.bg', 'daily') === '✓ всички' && cell(h, 'reg1@temax.bg', 'minus_multi') === 'условно · Троян');
    h.close();
  }
  {
    /* Отговор без recipients_only (стара функция, преди деплоя) → грешка, не празна колона. */
    const h = env(ADMIN, Object.assign({}, REPLIES, { 'send-oborot-report': { ok: true, date: '2026-11-12', results: [] } }));
    h.w.loadNotificationsAdmin(); await settle();
    realClick(h.w, h.doc.getElementById('who-load-btn'), 'Зареди'); await settle();
    ok('стар отговор на send-oborot-report → „не се зареди", не празно', cell(h, 't.tenev@temax.bg', 'oborot') === '—' && /send-oborot-report/.test((h.doc.getElementById('who-errors') || {}).textContent || ''));
    h.close();
  }
  {
    /* bulletin-notify с не-JSON 401 (gateway) */
    const h = env(ADMIN, Object.assign({}, REPLIES, { 'bulletin-notify': { __status: 401, __raw: 'Unauthorized' } }));
    h.w.loadNotificationsAdmin(); await settle();
    realClick(h.w, h.doc.getElementById('who-load-btn'), 'Зареди'); await settle();
    ok('401 без JSON → колоните на bulletin-notify „—", push редовете червени', cell(h, 'm.pavlova@temax.bg', 'promo_expiring') === '—' &&
      Array.prototype.every.call(h.doc.querySelectorAll('.who-push-row'), li => /не се зареди/.test(li.textContent)) && cell(h, 't.tenev@temax.bg', 'daily') === '✓ всички');
    h.close();
  }
  {
    /* Не-admin (accounting) — картата от 18.10.2026 е само за admin; разделът също. */
    const h = env({ id: 'ux', email: 'acc@temax.bg', role: 'accounting', store_name: 'Централен офис' }, REPLIES);
    h.w.loadNotificationsAdmin(); await settle();
    const body = h.doc.getElementById('notif-whogets-body');
    ok('accounting: разделът е скрит и без бутон', !h.doc.getElementById('who-load-btn') && (!body || body.style.display === 'none' || body.innerHTML === ''));
    if (typeof h.w.whoLoad === 'function') { h.w.whoLoad(null); await settle(); }
    ok('accounting: whoLoad от конзолата не вика функциите', Object.keys(h.edge).length === 0, JSON.stringify(h.edge));
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
