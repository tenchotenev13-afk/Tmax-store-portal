/* ЕДИН ИЗТОЧНИК НА ПОЛУЧАТЕЛИТЕ (otcheti-recipients-only, 12.11.2026, етап 2а от
   искането на Теодор за таблица „кой какво получава").

   Какво заковава:
     1. reportDailyWeeklyRecipients (report.js И копието в send-scheduled-report)
        дава СЪЩОТО като старата вградена логика в Deno.serve (v67, преписана
        дословно тук като OLD_SELECT — CI е shallow, git история няма): регионален,
        управители при 'on' / 'off' / ' ON ' / липсващ ключ, получател с обхват
        (дневен срещу седмичен), дубликат по имейл, неактивни, без имейл, управител
        без обект, регионален без assigned_stores;
     2. recipients_only в ИСТИНСКИЯ handler (index.ts във vm, типовете махнати):
        за всеки от шестте типа и без тип — нула POST-а към resend-email, нула
        записи (report_snapshots, notification_*), отговор general / personal;
        кронът (daily / weekly без recipients_only) праща общото писмо до
        същото general, а личните редове са същите имейли и източници;
     3. „📤 Изпрати сега" (истински клик): първо recipients_only, после confirm с
        броя писма; „Откажи" → нищо; „да" → {"type":"daily"} / {"type":"weekly"}
        към едж функцията, нула писма от браузъра; двоен клик = един confirm.

   Мутационна проверка (12.11.2026) — всяка СЪБАРЯ теста (exit 1):
     М1 управителите влизат и при 'off' (managersOn = true) — index.ts;
     М2 същото в report.js;
     М3 регионален без assigned_stores отива в общото писмо (получава всичко) — index.ts;
     М4 същото в report.js;
     М5 recipients_only не връща рано, а пада в пращането — index.ts.

   Пускане:  node tests/report-recipients-only.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
const EDGE = path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts');
const _w = process.emitWarning; process.emitWarning = function () {};
const JS = nodeModule.stripTypeScriptTypes(fs.readFileSync(EDGE, 'utf8'));
process.emitWarning = _w;

/* ── Старата логика (v67, Deno.serve), дословно, само без TS и await ──
   recipients — вече филтрирани от базата (active=true, флагът = true);
   regRows — is_regional=true; setRow — редът от app_settings или null;
   mgrRows — role=manager (четат се само при 'on'). */
function OLD_SELECT(type, recipients, regRows, setRow, mgrRows) {
  function recipientScope(r) {
    if (type !== 'daily') return [];
    return (Array.isArray(r.scope_stores) ? r.scope_stores : []).filter(Boolean);
  }
  var emails = recipients.filter(function (r) { return !recipientScope(r).length; })
                         .map(function (r) { return r.email; }).filter(Boolean);
  var personal = [], personalSeen = {};
  function addPersonal(email, name, stores, source) {
    var key = String(email || '').trim().toLowerCase();
    if (!key) return;
    var list = (Array.isArray(stores) ? stores : []).filter(Boolean);
    var cur = personalSeen[key];
    if (cur) {
      list.forEach(function (s) { if (cur.stores.indexOf(s) < 0) cur.stores.push(s); });
      if (!cur.name && name) cur.name = name;
      return;
    }
    cur = { email: email, name: name || '', stores: list, source: source };
    personalSeen[key] = cur;
    personal.push(cur);
  }
  (Array.isArray(regRows) ? regRows : []).forEach(function (u) {
    if (u.active === false || !u.email) return;
    addPersonal(u.email, u.display_name, u.assigned_stores, 'regional');
  });
  recipients.forEach(function (r) {
    var sc = recipientScope(r);
    if (sc.length) addPersonal(r.email, r.name, sc, 'recipient');
  });
  var managersOn = !!setRow && String(setRow.value == null ? '' : setRow.value).trim().toLowerCase() === 'on';
  if (managersOn) {
    (Array.isArray(mgrRows) ? mgrRows : []).forEach(function (u) {
      if (u.active === false || !u.email) return;
      addPersonal(u.email, u.display_name, u.store_name ? [u.store_name] : [], 'manager');
    });
  }
  return { general: emails, personal: personal };
}

/* ── Данни: какво има в базата ── */
const RCPT = [
  { email: 'teo@temax.bg', name: 'Теодор', active: true, daily: true, weekly: true, scope_stores: null },
  { email: 'reg1@temax.bg', name: 'Рег. като получател', active: true, daily: true, weekly: true, scope_stores: ['Враца'] }, /* дубликат с регионален */
  { email: 'sc@temax.bg', name: 'С обхват', active: true, daily: true, weekly: true, scope_stores: ['Плевен', 'Ловеч'] },
  { email: 'empty@temax.bg', name: 'Празен обхват', active: true, daily: true, weekly: false, scope_stores: [] },
  { email: 'w@temax.bg', name: 'Само седмичен', active: true, daily: false, weekly: true, scope_stores: null },
  { email: 'off@temax.bg', name: 'Неактивен', active: false, daily: true, weekly: true, scope_stores: null },
  { email: '', name: 'Без имейл', active: true, daily: true, weekly: true, scope_stores: null }
];
const USERS = [
  { email: 'REG1@temax.bg', display_name: 'Регионален 1', assigned_stores: ['Троян', 'Ловеч'], store_name: 'Централен офис', role: 'admin', active: true, is_regional: true },
  { email: 'reg2@temax.bg', display_name: 'Регионален без обекти', assigned_stores: null, store_name: 'Централен офис', role: 'admin', active: true, is_regional: true },
  { email: 'reg3@temax.bg', display_name: 'Регионален неактивен', assigned_stores: ['Враца'], store_name: null, role: 'admin', active: false, is_regional: true },
  { email: 'm1@temax.bg', display_name: 'Управител Троян', assigned_stores: null, store_name: 'Троян', role: 'manager', active: true, is_regional: false },
  { email: 'sc@temax.bg', display_name: 'Управител Плевен', assigned_stores: null, store_name: 'Плевен', role: 'manager', active: true, is_regional: false }, /* дубликат с получател */
  { email: 'm3@temax.bg', display_name: 'Управител без обект', assigned_stores: null, store_name: null, role: 'manager', active: true, is_regional: false },
  { email: 'reg4@temax.bg', display_name: 'Регионален и управител', assigned_stores: ['Враца'], store_name: 'Видин', role: 'manager', active: true, is_regional: true },
  { email: 'm5@temax.bg', display_name: 'Управител неактивен', assigned_stores: null, store_name: 'Русе', role: 'manager', active: false, is_regional: false }
];
/* PostgREST филтрите, които кодът ползва — емулирани тук. */
function dbRecipients(flag) { return RCPT.filter(r => r.active === true && r[flag] === true); }
function dbUsers(url) {
  if (url.indexOf('is_regional=eq.true') >= 0) return USERS.filter(u => u.is_regional === true);
  if (url.indexOf('role=eq.manager') >= 0) return USERS.filter(u => u.role === 'manager');
  if (url.indexOf('role=eq.logistics') >= 0) return [{ email: 'lt@temax.bg', display_name: 'Търговище', store_name: 'Логистичен склад Търговище', role: 'logistics', active: true }];
  return [];
}
const clone = x => JSON.parse(JSON.stringify(x));

function newVia(fn, type, mgrValue) {
  const flag = type === 'weekly' ? 'weekly' : 'daily';
  const key = flag + '_report_managers';
  const settings = {}; if (mgrValue !== undefined) settings[key] = mgrValue;
  const users = dbUsers('is_regional=eq.true').concat(dbUsers('role=eq.manager'));
  const r = fn(type, clone(dbRecipients(flag)), clone(users), settings);
  return { general: r.general, personal: r.personal };
}
function oldVia(type, mgrValue) {
  const flag = type === 'weekly' ? 'weekly' : 'daily';
  const setRow = mgrValue === undefined ? null : { value: mgrValue };
  return OLD_SELECT(type, clone(dbRecipients(flag)), clone(dbUsers('is_regional=eq.true')), setRow, clone(dbUsers('role=eq.manager')));
}

/* ── Едж функцията във vm ── */
function loadEdge(over) {
  over = over || {};
  const posts = [], gets = [], writes = [];
  let handler = null;
  const settingsRows = over.settings || { daily_report_managers: 'on', weekly_report_managers: 'off', minus_stores: 'Троян,Ловеч' };
  const tables = {
    report_recipients: url => {
      const m = /&([a-z_]+)=eq\.true/.exec(url.replace('active=eq.true', ''));
      const flag = m ? m[1] : null;
      return RCPT.map(r => Object.assign({ pallets: r.weekly, warehouse: false, co_overdue: r.daily, minus_multi: r.weekly }, r))
        .filter(r => r.active === true && (!flag || r[flag] === true));
    },
    users: dbUsers,
    app_settings: url => {
      const m = /key=eq\.([a-z_]+)/.exec(url);
      if (m) return settingsRows[m[1]] !== undefined ? [{ key: m[1], value: settingsRows[m[1]] }] : [];
      return Object.keys(settingsRows).map(k => ({ key: k, value: settingsRows[k] }));
    }
  };
  const ctx = {
    Response, console, Intl, JSON, Math, Object, Array, String, Number, Promise, Date, encodeURIComponent, setTimeout,
    Deno: { env: { get: k => (k === 'SUPABASE_URL' ? 'https://x.supabase.co' : 'KEY') }, serve: fn => { handler = fn; } },
    fetch: (url, init) => {
      init = init || {};
      const method = (init.method || 'GET').toUpperCase();
      if (method !== 'GET') {
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
  vm.runInContext(JS, ctx, { filename: 'send-scheduled-report.js' });
  const call = async body => {
    const res = await handler({ json: () => Promise.resolve(body) });
    return { status: res.status, data: await res.json() };
  };
  return { ctx, call, posts, gets, writes };
}

const norm = p => p.map(x => x.email + '|' + x.source + '|' + x.stores.join('+') + '|' + x.name).join(' ; ');

(async function () {

  section('1. reportDailyWeeklyRecipients = старата логика (report.js и index.ts)');
  const h0 = boot({ modules: ['email.js', 'report.js'], user: { id: 'u', email: 'a@temax.bg', role: 'admin', store_name: 'Централен офис' }, data: {} });
  const L0 = loadEdge();
  const copies = { 'report.js': h0.w.reportDailyWeeklyRecipients, 'index.ts': L0.ctx.reportDailyWeeklyRecipients };
  const CASES = [
    ['дневен, управители on', 'daily', 'on'],
    ['дневен, управители off', 'daily', 'off'],
    ['дневен, ключ „ ON “ (интервал, главни)', 'daily', ' ON '],
    ['дневен, ключът липсва', 'daily', undefined],
    ['седмичен, управители on', 'weekly', 'on'],
    ['седмичен, управители off', 'weekly', 'off'],
    ['седмичен, ключът null', 'weekly', null]
  ];
  Object.keys(copies).forEach(function (where) {
    const fn = copies[where];
    if (!ok(where + ': функцията я има', typeof fn === 'function')) return;
    CASES.forEach(function (c) {
      const o = oldVia(c[1], c[2]), n = newVia(fn, c[1], c[2]);
      ok(where + ' · ' + c[0] + ': general е същото', JSON.stringify(n.general) === JSON.stringify(o.general), JSON.stringify(n.general) + ' ≠ ' + JSON.stringify(o.general));
      ok(where + ' · ' + c[0] + ': personal е същото (ред, обхват, източник, име)', norm(n.personal) === norm(o.personal), norm(n.personal) + '\n      ≠ ' + norm(o.personal));
    });
  });
  {
    /* Конкретните правила — изрично, не само „като старото“. */
    const fn = copies['report.js'];
    const on = newVia(fn, 'daily', 'on'), off = newVia(fn, 'daily', 'off'), wk = newVia(fn, 'weekly', 'off');
    const find = (r, e) => r.personal.filter(p => p.email.toLowerCase() === e)[0];
    ok('регионален: личен, обхват assigned_stores + обхвата от report_recipients (дубликат → едно писмо)',
      !!find(on, 'reg1@temax.bg') && find(on, 'reg1@temax.bg').source === 'regional' &&
      find(on, 'reg1@temax.bg').stores.join('+') === 'Троян+Ловеч+Враца' &&
      on.personal.filter(p => p.email.toLowerCase() === 'reg1@temax.bg').length === 1, norm(on.personal));
    ok('регионален без assigned_stores: в личните с празен обхват, НЕ в общото писмо',
      !!find(on, 'reg2@temax.bg') && find(on, 'reg2@temax.bg').stores.length === 0 && on.general.indexOf('reg2@temax.bg') < 0);
    ok('неактивен регионален / управител — никъде', !find(on, 'reg3@temax.bg') && !find(on, 'm5@temax.bg'));
    ok('управители при on: m1 (Троян), m3 без обект с празен обхват', !!find(on, 'm1@temax.bg') && find(on, 'm1@temax.bg').stores.join() === 'Троян' &&
      !!find(on, 'm3@temax.bg') && find(on, 'm3@temax.bg').stores.length === 0);
    ok('управители при off: нито един', !off.personal.some(p => p.source === 'manager'), norm(off.personal));
    ok('получател с обхват и управител със същия имейл → един ред, source recipient, обединен обхват',
      find(on, 'sc@temax.bg').source === 'recipient' && find(on, 'sc@temax.bg').stores.join('+') === 'Плевен+Ловеч' &&
      on.personal.filter(p => p.email === 'sc@temax.bg').length === 1, norm(on.personal));
    ok('регионален и управител: един ред, source regional, Враца + Видин', find(on, 'reg4@temax.bg').source === 'regional' &&
      find(on, 'reg4@temax.bg').stores.join('+') === 'Враца+Видин');
    ok('дневен: получател с обхват НЕ е в общото писмо; празен обхват е', on.general.indexOf('sc@temax.bg') < 0 && on.general.indexOf('empty@temax.bg') >= 0);
    ok('седмичен: обхватът се пренебрегва — sc е в общото писмо, не в личните', wk.general.indexOf('sc@temax.bg') >= 0 && !find(wk, 'sc@temax.bg'));
    ok('седмичен: само weekly=true', wk.general.indexOf('w@temax.bg') >= 0 && wk.general.indexOf('empty@temax.bg') < 0);
    ok('неактивен получател и без имейл — не са в общото', on.general.indexOf('off@temax.bg') < 0 && on.general.indexOf('') < 0);
    ok('managers_on се връща', fn('daily', [], [], { daily_report_managers: 'on' }).managers_on === true &&
      fn('daily', [], [], { daily_report_managers: 'on' , weekly_report_managers: 'off' }).managers_on === true &&
      fn('weekly', [], [], { daily_report_managers: 'on' }).managers_on === false);
    ok('празни входове не гърмят', JSON.stringify(fn('daily', null, null, null)) === JSON.stringify({ general: [], personal: [], managers_on: false }));
  }
  h0.close();

  section('2. recipients_only в истинския handler — нищо не се праща и не се пише');
  {
    const TYPES = ['daily', 'weekly', 'pallets', 'warehouse', 'co_overdue', 'minus_multi'];
    for (const t of TYPES) {
      const L = loadEdge();
      const r = await L.call({ type: t, recipients_only: true });
      ok(t + ': 200, ok, recipients_only, type', r.status === 200 && r.data.ok === true && r.data.recipients_only === true && r.data.type === t, JSON.stringify(r.data).slice(0, 200));
      ok(t + ': general и personal са масиви', Array.isArray(r.data.general) && Array.isArray(r.data.personal));
      ok(t + ': НУЛА писма към resend-email', L.posts.length === 0, L.posts.length);
      ok(t + ': НУЛА записа (POST/PATCH към базата)', L.writes.length === 0, JSON.stringify(L.writes).slice(0, 200));
      ok(t + ': не се събират данни за отчета (нито bulletin_tasks, нито client_orders, нито stock_minus)',
        !L.gets.some(u => /\/rest\/v1\/(bulletin_tasks|client_orders|stock_minus|stock_differences|pallets|report_snapshots)/.test(u)), L.gets.join('\n').slice(0, 300));
    }
    const L = loadEdge();
    const all = await L.call({ recipients_only: true });
    ok('без тип → и шестте в types', all.data.ok === true && TYPES.every(t => all.data.types && all.data.types[t] && all.data.types[t].type === t), Object.keys(all.data.types || {}).join(','));
    ok('без тип → нула писма, нула записа', L.posts.length === 0 && L.writes.length === 0);
    const bad = await loadEdge().call({ type: 'nope', recipients_only: true });
    ok('непознат тип → 400 unknown_type, не дневният', bad.status === 400 && bad.data.error === 'unknown_type', JSON.stringify(bad.data));

    const d = all.data.types.daily;
    const expect = newVia(copies['index.ts'] || L.ctx.reportDailyWeeklyRecipients, 'daily', 'on');
    ok('daily: = reportDailyWeeklyRecipients върху данните от базата (управители on)',
      JSON.stringify(d.general) === JSON.stringify(expect.general) && norm(d.personal) === norm(expect.personal), norm(d.personal));
    ok('weekly: управители off → без управители', !all.data.types.weekly.personal.some(p => p.source === 'manager') && all.data.types.weekly.managers_on === false);
    const p = all.data.types.pallets;
    ok('pallets: регионалните са regional, получателят с обхват — recipient',
      p.personal.some(x => x.email === 'REG1@temax.bg' && x.source === 'regional') && p.personal.some(x => x.email === 'sc@temax.bg' && x.source === 'recipient'), norm(p.personal));
    const w = all.data.types.warehouse;
    ok('warehouse: складът си е logistics, по писмо на склад', w.general.length === 0 && w.personal.some(x => x.email === 'lt@temax.bg' && x.source === 'logistics' && x.stores[0] === 'Логистичен склад Търговище'), norm(w.personal));
    ok('co_overdue: само general', all.data.types.co_overdue.personal.length === 0 && all.data.types.co_overdue.general.indexOf('teo@temax.bg') >= 0);
    const mm = all.data.types.minus_multi;
    ok('minus_multi: обектите от minus_stores, регионалният по сечението, conditional при обхват',
      JSON.stringify(mm.minus_stores) === '["Троян","Ловеч"]' &&
      mm.personal.some(x => x.email.toLowerCase() === 'reg1@temax.bg' && x.source === 'regional' && x.stores.join('+') === 'Троян+Ловеч' && x.conditional === true), JSON.stringify(mm.personal));
  }

  section('2б. Кронът (без recipients_only) праща на същите');
  for (const t of ['daily', 'weekly']) {
    const L = loadEdge();
    const ro = (await L.call({ type: t, recipients_only: true })).data;
    const r = await L.call({ type: t });
    const gen = L.posts.filter(x => x.body && Array.isArray(x.body.to) && x.body.to.length === ro.general.length && x.body.to.join() === ro.general.join());
    ok(t + ': общото писмо е до general от recipients_only', r.data.ok === true && gen.length === 1, JSON.stringify(L.posts.map(x => x.body.to)) + ' / ' + JSON.stringify(r.data).slice(0, 200));
    const outP = (r.data.personal || []).filter(x => x.email).map(x => x.email + '|' + x.source).join(';');
    const roP = ro.personal.map(x => x.email + '|' + x.source).join(';');
    ok(t + ': личните редове на крона = personal от recipients_only (имейл и източник)', outP === roP, outP + '\n      ≠ ' + roP);
  }

  section('3. „📤 Изпрати сега" — истински клик');
  const ADMIN = { id: 'u-adm', email: 'm.ivanova@temax.bg', display_name: 'Мария', role: 'admin', store_name: 'Централен офис' };
  const RO = { ok: true, recipients_only: true, type: 'daily', general: ['teo@temax.bg', 'x@temax.bg'], managers_on: true, personal: [
    { email: 'reg1@temax.bg', name: 'Р', stores: ['Троян'], source: 'regional' },
    { email: 'reg2@temax.bg', name: 'Р2', stores: [], source: 'regional' },
    { email: 'sc@temax.bg', name: 'С', stores: ['Плевен'], source: 'recipient' },
    { email: 'm1@temax.bg', name: 'М', stores: ['Троян'], source: 'manager' },
    { email: 'm2@temax.bg', name: 'М2', stores: ['Русе'], source: 'manager' }] };
  async function env(confirmAns, edgeReply) {
    const h = boot({ modules: ['bulletin.js', 'email.js', 'admin.js', 'report.js'], user: ADMIN,
      data: { report_recipients: RCPT, users: dbUsers, notification_topics: [], notification_matrix: [], notification_overrides: [], notification_schedules: [], stores: [] },
      confirm: confirmAns });
    h.edge = [];
    h.collected = 0;
    const w = h.w, base = w.fetch;
    w.collectDailyReportData = function (cb) { h.collected++; cb({ reportDate: '2026-11-12' }); };
    w.collectWeeklyReportData = function (cb) { h.collected++; cb({ weekDates: [] }); };
    w.fetch = function (url, init) {
      if (String(url).indexOf('/functions/v1/send-scheduled-report') >= 0) {
        const b = JSON.parse(init.body); h.edge.push(b);
        const out = edgeReply ? edgeReply(b) : (b.recipients_only ? Object.assign({}, RO, { type: b.type })
          : { ok: true, sent: true, email_status: 200, recipients: 2, type: b.type, personal: [
              { email: 'reg1@temax.bg', source: 'regional', sent: true }, { email: 'reg2@temax.bg', source: 'regional', sent: false, reason: 'no_assigned_stores' }] });
        const st = out.__status || 200;
        return new Promise(res => w.setTimeout(() => res({ ok: st < 400, status: st, text: () => Promise.resolve(JSON.stringify(out)), json: () => Promise.resolve(out) }), 30));
      }
      return base(url, init);
    };
    w.loadNotificationsAdmin();
    await settle();
    return h;
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function settle() { await wait(150); for (let i = 0; i < 4; i++) await ticks(); }
  const btn = (h, kind) => {
    const row = h.doc.getElementById('report-row-' + kind);
    return row ? Array.prototype.find.call(row.querySelectorAll('button'), b => b.textContent.trim() === '📤 Изпрати сега') || null : null;
  };
  const mails = h => h.calls.post.filter(p => /\/functions\/v1\/resend-email/.test(p.url));
  const MSG = 'Ще тръгнат до 5 писма: 1 общо до 2 адреса + 4 лични (регионални 1, с обхват 1, управители 2). ' +
              'Лично писмо без данни за обектите се пропуска. Писмата са ИСТИНСКИ — сигурен ли си?';
  {
    const h = await env(false);
    const b = btn(h, 'daily');
    if (ok('бутон „📤 Изпрати сега" на Дневен', !!b)) {
      guard('клик → „Откажи"', () => realClick(h.w, b, 'Дневен: Изпрати сега'));
      await settle();
      ok('първо recipients_only за daily', h.edge.length >= 1 && JSON.stringify(h.edge[0]) === '{"type":"daily","recipients_only":true}', JSON.stringify(h.edge));
      ok('confirm с броя писма (празният обхват не се брои)', h.calls.confirm.length === 1 && h.calls.confirm[0] === MSG, JSON.stringify(h.calls.confirm));
      ok('„Откажи" → нищо не се праща', h.edge.length === 1 && mails(h).length === 0 && h.collected === 0, JSON.stringify(h.edge));
      ok('„Откажи" → бутонът е отключен', b.disabled === false);
    }
    h.close();
  }
  {
    const h = await env(true);
    const b = btn(h, 'daily');
    realClick(h.w, b, 'Дневен: Изпрати сега');
    ok('заключен веднага', b.disabled === true);
    realClick(h.w, b, 'Дневен: Изпрати сега');
    await settle(); await settle();
    ok('двоен клик → един confirm', h.calls.confirm.length === 1, h.calls.confirm.length);
    ok('„да" → {"type":"daily"} към send-scheduled-report, точно веднъж',
      h.edge.filter(x => !x.recipients_only).length === 1 && JSON.stringify(h.edge.filter(x => !x.recipients_only)[0]) === '{"type":"daily"}', JSON.stringify(h.edge));
    ok('нула писма от браузъра, данни не се събират в браузъра', mails(h).length === 0 && h.collected === 0, mails(h).length + '/' + h.collected);
    ok('toast с резултата', h.calls.toast.some(t => String(t) === '✅ Дневен репорт: общо писмо до 2 адреса · лични 1'), JSON.stringify(h.calls.toast));
    ok('отключен след края', b.disabled === false);
    h.close();
  }
  {
    const h = await env(true);
    realClick(h.w, btn(h, 'weekly'), 'Седмичен: Изпрати сега');
    await settle(); await settle();
    ok('седмичен: recipients_only, после {"type":"weekly"}',
      JSON.stringify(h.edge) === '[{"type":"weekly","recipients_only":true},{"type":"weekly"}]', JSON.stringify(h.edge));
    ok('седмичен: нула писма от браузъра', mails(h).length === 0);
    h.close();
  }
  {
    const h = await env(true, b => (b.recipients_only ? { __status: 500, ok: false, error: 'boom' } : { ok: true }));
    const b = btn(h, 'daily');
    realClick(h.w, b, 'Дневен: Изпрати сега');
    await settle();
    ok('recipients_only пада → няма confirm, няма пращане, червен toast', h.calls.confirm.length === 0 && h.edge.length === 1 &&
      h.calls.toast.some(t => String(t).indexOf('Получателите не се прочетоха: boom') >= 0), JSON.stringify(h.calls.toast));
    ok('и бутонът е отключен', b.disabled === false);
    h.close();
  }
  {
    const h = await env(true, b => (b.recipients_only ? { ok: true, general: [], personal: [{ email: 'r@x', stores: [], source: 'regional' }] } : { ok: true }));
    realClick(h.w, btn(h, 'daily'), 'Дневен');
    await settle();
    ok('нула писма за пращане → „Няма получатели", без confirm', h.calls.confirm.length === 0 && h.edge.length === 1 &&
      h.calls.toast.indexOf('Няма получатели за този отчет') >= 0, JSON.stringify(h.calls.toast));
    h.close();
  }
  {
    const h = await env(true, b => (b.recipients_only ? RO : { ok: true, sent: false, email_status: 500, recipients: 2, personal: [{ email: 'a', sent: false, status: 500 }] }));
    realClick(h.w, btn(h, 'daily'), 'Дневен');
    await settle(); await settle();
    ok('паднало писмо → червен toast „НЕ тръгна" и неуспешните', h.calls.toast.some(t => String(t) === '❌ Дневен репорт: общо писмо НЕ тръгна · лични 0 · неуспешни 1'), JSON.stringify(h.calls.toast));
    h.close();
  }
  {
    const h = await env(true);
    ok('старите функции ги няма', typeof h.w.sendDailyReportToRecipients === 'undefined' && typeof h.w.sendWeeklyReportToRecipients === 'undefined');
    ok('„Тест до мен" си е в браузъра', typeof h.w.sendDailyReportTest === 'function' && typeof h.w.sendWeeklyReportTest === 'function');
    h.close();
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
