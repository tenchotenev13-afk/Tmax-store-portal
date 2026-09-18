/* Постоянни задачи — „+ Добави" и „▶ Активирай" в БЪДЕЩ бюлетин.

   Правилата (bulletin.js, 18.09.2026):
     · текуща седмица W   — Добави, Активирай, Спри, „Спрени (N)";
     · бъдеща (W+1)       — Добави, Активирай, „Спрени (N)"; БЕЗ Спри;
     · минала (W−1)       — нищо от четирите.
   Периодът тръгва от понеделника на показания бюлетин. recurring_tasks.active
   при запис = (from_monday <= понеделника на текущата седмица) — бъдещ
   период остава false, докато кронът recurring_tasks_refresh_active() не го
   вдигне в понеделник 00:05 (виж recurring-active-cron-schema.sql).
   В бъдещия бюлетин задачата се вижда веднага (по периода) с бадж „от ДД.ММ".

   Какво заковава тестът (РЕАЛЕН клик; „базата" наистина пише):
     1. W+1: Добави и Активирай — да; Спри — не; сивият текст го няма;
     2. нова задача в W+1 → active=false, период от W+1; не е в W и W−1,
        не е в „Днес"; в W+1 е с бадж „от ДД.ММ";
     3. Активирай в W+1 → период от W+1, active=false; W я няма (и не е в
        „Спрени"), W+1 я има с баджа;
     4. W−1: без бутони и без „Спрени"; директно извикване → нула записа;
     5. W+1: директно „Спри" → нула записа;
     6. КОНТРОЛА — в текущата седмица Добави и Активирай пишат active=true
        и там бадж няма.

   ⚠️ Дати: котвата е сряда от текущата реална седмица, замразена на w.Date.

   Пускане: node tests/recurring-future-week.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
  return d;
})();
function shifted(days) { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() + days); return d; }
function isoOf(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function isoWeekYear(d) {
  const t = new Date(d.getTime());
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  return t.getFullYear();
}
function freezeDate(w) {
  const Real = w.Date, fixedMs = ANCHOR.getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  }
  w.Date = Frozen;
}
const MON = k => isoOf(shifted(-2 + 7 * k));
const W0 = MON(0), W1 = MON(1), W_OLD = MON(-5), W_3 = MON(-3);
const BADGE_W1 = 'от ' + W1.slice(8, 10) + '.' + W1.slice(5, 7);

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function rec(id, title, over) {
  return Object.assign({
    id: id, title: title, department: 'admin', task_type: 'info', description: null,
    target_stores: null, due_weekday: null, due_weekdays: [0, 1, 2, 3, 4, 5, 6], due_time: '10:00', due_window: false,
    linked_module: null, report_groups: null, attachments: null, active: true, sort_order: 0,
    created_at: shifted(-40).toISOString()
  }, over || {});
}
function freshDb() {
  return {
    seq: 0,
    tasks: [
      rec('r-a', 'Задача А (дълга)', { sort_order: 1 }),
      rec('r-gap', 'Задача спряна отдавна', { active: false, sort_order: 2 })
    ],
    periods: [
      { id: 'p-a', recurring_task_id: 'r-a', from_monday: W_OLD, to_monday: null },
      { id: 'p-gap', recurring_task_id: 'r-gap', from_monday: W_OLD, to_monday: W_3 }
    ]
  };
}

/* „Базата" — същата като в recurring-periods-write.test.js. */
function wireDb(h, db) {
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const m = (init.method || 'GET').toUpperCase();
    const onTasks = url.indexOf('/recurring_tasks') >= 0, onPer = url.indexOf('/recurring_task_periods') >= 0;
    if (m === 'GET' || (!onTasks && !onPer)) return orig.call(this, url, init);
    return orig.call(this, url, init).then(function (r) {
      if (!r.ok) return r;
      const body = init.body ? JSON.parse(init.body) : null;
      const idm = /[?&]id=eq\.([^&]+)/.exec(url);
      const list = onPer ? db.periods : db.tasks;
      if (m === 'POST') {
        if (onPer && body.to_monday == null && db.periods.some(p => p.recurring_task_id === body.recurring_task_id && p.to_monday == null)) {
          return { ok: false, status: 409, json: () => Promise.resolve({ code: '23505', message: 'rtp_open_uq' }), text: () => Promise.resolve('') };
        }
        const row = Object.assign({ id: (onPer ? 'p-n' : 'r-n') + (++db.seq), created_at: ANCHOR.toISOString() }, body);
        list.push(row);
        return { ok: true, status: 201, json: () => Promise.resolve([row]), text: () => Promise.resolve('') };
      }
      if (m === 'PATCH') { list.forEach(x => { if (idm && x.id === idm[1]) Object.assign(x, body); }); return r; }
      if (m === 'DELETE') {
        const before = list.length;
        const keep = list.filter(x => !(idm && x.id === idm[1]));
        if (onPer) db.periods = keep; else db.tasks = keep;
        const n = before - keep.length;
        return { ok: true, status: 204, headers: { get: k => (k === 'Content-Range' ? '*/' + n : null) }, json: () => Promise.resolve(null), text: () => Promise.resolve('') };
      }
      return r;
    });
  };
}

function bulOf(w, id, k) {
  const d = shifted(7 * k);
  const cal = {};
  w.DKEYS.forEach(x => { cal[x] = []; });
  return { id: id, week_number: w.weekNum(d), year: isoWeekYear(d), status: 'published', created_at: isoOf(d),
           content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
}
const recRoute = db => url => {
  const m = /[?&]active=eq\.(true|false)/.exec(url);
  return db.tasks.filter(t => !m || String(!!t.active) === m[1]).slice().sort((a, b) => a.sort_order - b.sort_order);
};
function env(bulId, db) {
  const h = boot({
    modules: ['bulletin.js', 'today.js', 'report.js'],
    user: ADMIN,
    data: {
      users: [{ store_name: 'Троян' }],
      recurring_tasks: recRoute(db),
      recurring_task_periods: () => db.periods,
      recurring_task_skips: [],
      bulletins: url => { const m = /[?&]id=eq\.([^&]+)/.exec(url); return m ? h.buls.filter(b => b.id === m[1]) : h.buls; },
      bulletin_tasks: [],
      task_completions: [],
      subtask_completions: [],
      task_subtasks: []
    }
  });
  freezeDate(h.w);
  h.buls = [bulOf(h.w, 'b-prev', -1), bulOf(h.w, 'b-cur', 0), bulOf(h.w, 'b-next', 1)];
  h.w.bulSelectedId = bulId;
  h.w.bulActiveDept = 'admin';
  h.w.reportableStoresCache = ['Троян'];
  wireDb(h, db);
  return h;
}

async function settle(cond, max) {
  for (let i = 0; i < (max || 60); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
function blockRow(doc, id) {
  return Array.prototype.find.call(doc.querySelectorAll('[data-rec-row="' + id + '"]'),
    r => !r.closest('#sec-calendar')) || null;
}
const stoppedRow = (doc, id) => doc.querySelector('[data-rec-stopped="' + id + '"]');
const panelOf = h => h.doc.getElementById('dept-panel-admin');
async function loaded(h) {
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return false;
  return settle(() => !!h.doc.getElementById('sec-calendar') && !!panelOf(h));
}
async function view(bulId, db) { const h = env(bulId, db); await loaded(h); return h; }
const periodsOf = (db, id) => db.periods.filter(p => p.recurring_task_id === id).map(p => p.from_monday + '..' + (p.to_monday || '∞')).sort().join(' | ');
const badgeOf = row => txt(row && row.querySelector('.rec-from-badge'));
const writes = h => h.calls.post.length + h.calls.patch.length + h.calls.del.length;

async function addTask(h, title) {
  const add = H.btnExact(panelOf(h), '+ Добави');
  if (!ok('„+ Добави" е в блока', !!add)) return null;
  realClick(h.w, add, '+ Добави');
  const ov = h.doc.getElementById('rec-modal-ov');
  if (!ok('модалът е отворен', !!ov)) return null;
  h.doc.getElementById('rec-title').value = title;
  realClick(h.w, H.btnExact(ov, 'Добави'), 'Добави');
  await settle(() => h.calls.toast.some(t => String(t).indexOf('добавена') >= 0 || String(t).indexOf('НЕ е записан') >= 0));
  return true;
}
async function todayTitles(db) {
  const h = env('b-cur', db), w = h.w;
  ['report_snapshots', 'differences_reports', 'stock_returns', 'kasa_storno', 'kasa_zoborot', 'goods_transit',
    'transport_pallets', 'stock_differences', 'client_orders', 'transport_orders',
    'daily_turnover', 'report_recipients', 'kasa_reports'].forEach(t => h.setData(t, []));
  h.setData('bulletins', [h.buls[1]]);
  if (!guard('loadTodayDashboard() не хвърля', () => w.loadTodayDashboard())) return [];
  await settle(() => !!w.todayCache);
  const c = w.todayCache || { items: [], noDueItems: [] };
  return c.items.concat(c.noDueItems || []).map(i => i.title);
}

(async function () {
  const db = freshDb();

  /* ═══ 1. Бъдещ бюлетин: бутоните ═════════════════════════════════════ */
  section('1. W+1: „+ Добави" и „▶ Активирай" — да; „⏸ Спри" — не');
  {
    const h = await view('b-next', db);
    const panel = panelOf(h);
    ok('„+ Добави" има', !!panel && !!H.btnExact(panel, '+ Добави'));
    ok('„Спрени (N)" има, с „▶ Активирай" за спряната', !!stoppedRow(h.doc, 'r-gap') && !!H.btn(stoppedRow(h.doc, 'r-gap'), '▶ Активирай'));
    ok('задача А е в списъка', !!blockRow(h.doc, 'r-a'));
    ok('нито един „⏸ Спри"', !!panel && H.allBtns(panel, '⏸ Спри').length === 0);
    ok('сивият текст „само от текущата…" го няма', !!panel && !panel.querySelector('.rec-only-current'));
    ok('задача А (започнала отдавна) — без бадж „от"', !!blockRow(h.doc, 'r-a') && !blockRow(h.doc, 'r-a').querySelector('.rec-from-badge'));
  }

  /* ═══ 2. Нова задача в бъдещ бюлетин ═════════════════════════════════ */
  section('2. „+ Добави" в W+1 → active=false, период от W+1');
  let newId = null;
  {
    const h = await view('b-next', db);
    if (await addTask(h, 'Нова от следващата')) {
      const nt = h.calls.post.filter(x => x.table === 'recurring_tasks');
      const np = h.calls.post.filter(x => x.table === 'recurring_task_periods');
      const row = db.tasks.find(t => t.title === 'Нова от следващата');
      newId = row && row.id;
      ok('POST recurring_tasks с active=false', nt.length === 1 && nt[0].body.active === false, JSON.stringify(nt.map(x => x.body.active)));
      ok('периодът: from = W+1 (' + W1 + '), отворен, за нейното id', np.length === 1 && !!row && np[0].body.recurring_task_id === row.id &&
        np[0].body.from_monday === W1 && np[0].body.to_monday === null, JSON.stringify(np.map(x => x.body)));
      ok('зелен тост „добавена"', h.calls.toast.some(t => String(t).indexOf('Постоянната задача е добавена') >= 0), JSON.stringify(h.calls.toast));
      await settle(() => !!newId && !!blockRow(h.doc, newId));
      ok('W+1: веднага след записа Е в списъка', !!newId && !!blockRow(h.doc, newId));
      ok('W+1: с бадж „' + BADGE_W1 + '"', badgeOf(blockRow(h.doc, newId)) === BADGE_W1, badgeOf(blockRow(h.doc, newId)));
    }
  }
  if (newId) {
    const hc = await view('b-cur', db);
    ok('W (текуща): новата НЕ е в списъка', !blockRow(hc.doc, newId));
    ok('W (текуща): и не е в „Спрени" (има отворен период)', !stoppedRow(hc.doc, newId));
    ok('КОНТРОЛА — W: задача А е в списъка', !!blockRow(hc.doc, 'r-a'));
    const hp = await view('b-prev', db);
    ok('W−1: новата НЕ е в списъка', !blockRow(hp.doc, newId));
    const hn = await view('b-next', db);
    ok('W+1 (презаредено): новата Е, с баджа', !!blockRow(hn.doc, newId) && badgeOf(blockRow(hn.doc, newId)) === BADGE_W1);
    const titles = await todayTitles(db);
    ok('„Днес": новата я няма', titles.indexOf('Нова от следващата') < 0, titles.join(', '));
    ok('КОНТРОЛА — „Днес": задача А я има', titles.indexOf('Задача А (дълга)') >= 0, titles.join(', '));
  }

  /* ═══ 3. Активирай в бъдещ бюлетин ═══════════════════════════════════ */
  section('3. „▶ Активирай" в W+1 → период от W+1, active остава false');
  {
    const h = await view('b-next', db);
    const btn = stoppedRow(h.doc, 'r-gap') && H.btn(stoppedRow(h.doc, 'r-gap'), '▶ Активирай');
    if (ok('„▶ Активирай" за спряната', !!btn)) {
      realClick(h.w, btn, 'Активирай');
      await settle(() => h.calls.toast.some(t => String(t).indexOf('Активирана') >= 0));
      const pp = h.calls.post.filter(x => x.table === 'recurring_task_periods');
      ok('POST период from = W+1, отворен', pp.length === 1 && pp[0].body.from_monday === W1 && pp[0].body.to_monday === null, JSON.stringify(pp.map(x => x.body)));
      const pt = h.calls.patch.filter(x => x.table === 'recurring_tasks');
      ok('PATCH active=false (още не важи)', pt.length === 1 && pt[0].body.active === false, JSON.stringify(pt.map(x => x.body)));
      ok('в базата: старият + новият', periodsOf(db, 'r-gap') === W_OLD + '..' + W_3 + ' | ' + W1 + '..∞', periodsOf(db, 'r-gap'));
      await settle(() => !!blockRow(h.doc, 'r-gap'));
      ok('W+1: вече е в списъка, с баджа', !!blockRow(h.doc, 'r-gap') && badgeOf(blockRow(h.doc, 'r-gap')) === BADGE_W1, badgeOf(blockRow(h.doc, 'r-gap')));
      ok('W+1: и не е в „Спрени"', !stoppedRow(h.doc, 'r-gap'));
    }
    const hc = await view('b-cur', db);
    ok('W: не е в списъка', !blockRow(hc.doc, 'r-gap'));
    const titles = await todayTitles(db);
    ok('„Днес": я няма', titles.indexOf('Задача спряна отдавна') < 0, titles.join(', '));
  }

  /* ═══ 4. Минал бюлетин ════════════════════════════════════════════════ */
  section('4. W−1: без Добави / Активирай / Спри / „Спрени"');
  {
    const dbp = freshDb();
    const h = await view('b-prev', dbp);
    const panel = panelOf(h);
    ok('няма „+ Добави"', !!panel && !H.btnExact(panel, '+ Добави'));
    ok('нито един „▶ Активирай"', !!panel && H.allBtns(panel, '▶ Активирай').length === 0);
    ok('нито един „⏸ Спри"', !!panel && H.allBtns(panel, '⏸ Спри').length === 0);
    ok('секцията „Спрени" я няма', !!panel && !panel.querySelector('.rec-stopped-toggle'));
    ok('сивият текст е там', txt(panel && panel.querySelector('.rec-only-current')) === 'Промени по постоянните задачи — само от текущата и бъдещите седмици');
    const before = writes(h);
    guard('директно Активирай не хвърля', () => h.w.toggleRecurringActive('r-gap', true));
    guard('директно Спри не хвърля', () => h.w.toggleRecurringActive('r-a', false));
    for (let i = 0; i < 5; i++) await ticks();
    ok('директно извикване → нула записа', writes(h) === before);
    ok('тост „Активиране — само от текущата и бъдещите"', h.calls.toast.some(t => String(t).indexOf('Активиране — само от текущата и бъдещите седмици') >= 0), JSON.stringify(h.calls.toast));
  }

  /* ═══ 5. Бъдещ: директно „Спри" ═══════════════════════════════════════ */
  section('5. W+1: директно „Спри" → нула записа');
  {
    const dbn = freshDb();
    const h = await view('b-next', dbn);
    const before = writes(h);
    guard('директно Спри не хвърля', () => h.w.toggleRecurringActive('r-a', false));
    for (let i = 0; i < 5; i++) await ticks();
    ok('нула записа', writes(h) === before);
    ok('тост „Спиране — само от текущата седмица"', h.calls.toast.some(t => String(t).indexOf('Спиране — само от текущата седмица') >= 0), JSON.stringify(h.calls.toast));
    ok('периодът на А е непокътнат', periodsOf(dbn, 'r-a') === W_OLD + '..∞');
  }

  /* ═══ 6. КОНТРОЛА — текуща седмица ═══════════════════════════════════ */
  section('6. КОНТРОЛА — в текущата седмица Добави и Активирай пишат active=true');
  {
    const dbc = freshDb();
    const h = await view('b-cur', dbc);
    ok('W: „⏸ Спри" има', H.allBtns(panelOf(h), '⏸ Спри').length > 0);
    if (await addTask(h, 'Нова от тази')) {
      const nt = h.calls.post.filter(x => x.table === 'recurring_tasks');
      const np = h.calls.post.filter(x => x.table === 'recurring_task_periods');
      ok('POST recurring_tasks с active=true', nt.length === 1 && nt[0].body.active === true);
      ok('период от W (' + W0 + ')', np.length === 1 && np[0].body.from_monday === W0);
      const row = dbc.tasks.find(t => t.title === 'Нова от тази');
      await settle(() => !!row && !!blockRow(h.doc, row.id));
      ok('в W е в списъка и БЕЗ бадж „от"', !!row && !!blockRow(h.doc, row.id) && !blockRow(h.doc, row.id).querySelector('.rec-from-badge'));
    }
    const h2 = await view('b-cur', dbc);
    const btn = stoppedRow(h2.doc, 'r-gap') && H.btn(stoppedRow(h2.doc, 'r-gap'), '▶ Активирай');
    if (ok('W: „▶ Активирай" за спряната', !!btn)) {
      realClick(h2.w, btn, 'Активирай');
      await settle(() => h2.calls.patch.some(x => x.table === 'recurring_tasks'));
      const pt = h2.calls.patch.filter(x => x.table === 'recurring_tasks');
      ok('PATCH active=true', pt.length === 1 && pt[0].body.active === true, JSON.stringify(pt.map(x => x.body)));
    }
    const titles = await todayTitles(dbc);
    ok('„Днес": новата от тази седмица Я ИМА', titles.indexOf('Нова от тази') >= 0, titles.join(', '));
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
