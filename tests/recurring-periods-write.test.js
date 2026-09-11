/* Постоянните задачи по седмици (recurring_task_periods) — ПИСАНЕ.

   Бутоните в блока „Постоянни задачи" (bulletin.js), САМО в бюлетина на
   текущата седмица W:
     „⏸ Спри"       → отвореният период: to_monday = W−7; започнал в самата W
                      → периодът се трие. После active=false.
     „▶ Активирай"  → нов период from_monday = W; старият остава. active=true.
     „+ Добави"     → задача + период from_monday = W.
   В стар и бъдещ бюлетин трите са скрити, със сив текст.

   Какво заковава тестът (всичко с РЕАЛЕН клик; „базата" наистина пише):
     1. Спри в W → минала седмица я има, W и W+1 — не; бутонът се заключва
        веднага; active=false; тя е в „Спрени (N)";
     2. Активирай → нов период от W, старият остава; active=true;
     3. празнина: активирана задача, спряна преди три седмици → W−2 и W−1 я
        нямат, W я има;
     4. спряна в първата си седмица → периодът е ИЗТРИТ, не записан с
        to < from; не важи никъде;
     5. задача без период (от стар кеширан клиент), спряна → затворен
        период от седмицата на създаването ѝ до W−1;
     6. нова задача → период от W; миналата седмица я няма;
     7. стар и бъдещ бюлетин: без Спри/Активирай/Добави и без секцията
        „Спрени", със сивия текст; ✏️ и ✕ си стоят;
     8. провал на ПЪРВАТА заявка (периода) → червен тост, active НЕ се пипа;
     9. провал на ВТОРАТА (active) → червен тост „периодът Е записан" и
        презареждане, не тихо;
    10. кешът active = „има отворен период" след всяко действие.

   ⚠️ Дати: котвата е сряда от текущата реална седмица, замразена на w.Date;
   понеделниците се смятат НЕЗАВИСИМО от кода под тест.

   Пускане: node tests/recurring-periods-write.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

/* ── Котва и понеделници ─────────────────────────────────────────────────── */
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
const MON = k => isoOf(shifted(-2 + 7 * k));     /* понеделник на седмица W+k */
const W0 = MON(0), W_1 = MON(-1), W_2 = MON(-2), W_3 = MON(-3), W_OLD = MON(-5), W1 = MON(1);

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function rec(id, title, over) {
  return Object.assign({
    id: id, title: title, department: 'admin', task_type: 'info', description: null,
    target_stores: null, due_weekday: null, due_weekdays: [2], due_time: '10:00', due_window: false,
    linked_module: null, report_groups: null, attachments: null, active: true, sort_order: 0,
    created_at: shifted(-40).toISOString()
  }, over || {});
}
function freshDb() {
  return {
    seq: 0,
    tasks: [
      rec('r-a', 'Задача А (дълга)', { sort_order: 1 }),
      rec('r-new', 'Задача от тази седмица', { sort_order: 2 }),
      rec('r-gap', 'Задача спряна отдавна', { active: false, sort_order: 3 }),
      /* От кеширан стар клиент — без период; създадена преди ~2 седмици. */
      rec('r-leg', 'Задача без период', { sort_order: 4, created_at: shifted(-12).toISOString() })
    ],
    periods: [
      { id: 'p-a', recurring_task_id: 'r-a', from_monday: W_OLD, to_monday: null },
      { id: 'p-new', recurring_task_id: 'r-new', from_monday: W0, to_monday: null },
      { id: 'p-gap', recurring_task_id: 'r-gap', from_monday: W_OLD, to_monday: W_3 }
    ]
  };
}

/* „Базата": GET чете db; POST/PATCH/DELETE към двете таблици наистина пишат.
   rtp_open_uq: втори отворен период → 409. POST recurring_tasks връща реда
   (Prefer: return=representation), както sbPostReturn очаква. */
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
          return { ok: false, status: 409, json: () => Promise.resolve({ code: '23505', message: 'duplicate key value violates unique constraint "rtp_open_uq"' }), text: () => Promise.resolve('') };
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
function env(bulId, db, extra) {
  extra = extra || {};
  const h = boot(Object.assign({
    modules: ['bulletin.js'],
    user: ADMIN,
    data: {
      users: [{ store_name: 'Троян' }],
      recurring_tasks: url => { const m = /[?&]active=eq\.(true|false)/.exec(url);
        return db.tasks.filter(t => !m || String(!!t.active) === m[1]).slice().sort((a, b) => a.sort_order - b.sort_order); },
      recurring_task_periods: () => db.periods,
      recurring_task_skips: [],
      bulletins: url => { const m = /[?&]id=eq\.([^&]+)/.exec(url); return m ? h.buls.filter(b => b.id === m[1]) : h.buls; },
      bulletin_tasks: [],
      task_completions: [],
      subtask_completions: [],
      task_subtasks: []
    }
  }, extra.fail ? { fail: extra.fail } : {}));
  freezeDate(h.w);
  h.buls = [bulOf(h.w, 'b-prev2', -2), bulOf(h.w, 'b-prev', -1), bulOf(h.w, 'b-cur', 0), bulOf(h.w, 'b-next', 1)];
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
async function loaded(h) {
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return false;
  return settle(() => !!h.doc.getElementById('sec-calendar') && !!h.doc.getElementById('dept-panel-admin'));
}
/* Кешът active = „има отворен период" — за всяка задача С ПЕРИОДИ. Задача без
   нито един период се води по active (кеширан стар клиент — виж
   recurringTasksForWeek); спряната в първата си седмица се проверява отделно. */
function cacheOk(db) {
  const bad = db.tasks.filter(t => db.periods.some(p => p.recurring_task_id === t.id) &&
    !!t.active !== db.periods.some(p => p.recurring_task_id === t.id && p.to_monday == null));
  return { ok: bad.length === 0, bad: bad.map(t => t.id + ':' + t.active).join(',') };
}
function checkCache(db, label) { const c = cacheOk(db); ok(label + ': кешът active = „има отворен период" (всички с периоди)', c.ok, c.bad); }
async function view(bulId, db) { const h = env(bulId, db); await loaded(h); return h; }
const periodsOf = (db, id) => db.periods.filter(p => p.recurring_task_id === id).map(p => p.from_monday + '..' + (p.to_monday || '∞')).sort().join(' | ');

(async function () {

  /* ═══ 1. Спри в текущата седмица ════════════════════════════════════════ */
  section('1. „⏸ Спри" от текущата седмица → W−1 я има, W и W+1 — не');
  const db = freshDb();
  {
    const h = env('b-cur', db);
    if (await loaded(h)) {
      const row = blockRow(h.doc, 'r-a');
      const btn = row && H.btn(row, '⏸ Спри');
      if (ok('„⏸ Спри" е в реда на задача А', !!btn)) {
        realClick(h.w, btn, 'Спри');
        ok('бутонът се ЗАКЛЮЧВА веднага (двоен клик не праща втора заявка)', btn.disabled === true);
        await settle(() => h.calls.toast.some(t => String(t).indexOf('Спряна') >= 0));
        const pp = h.calls.patch.filter(x => x.table === 'recurring_task_periods');
        ok('PATCH на ОТВОРЕНИЯ период p-a с to_monday = W−1', pp.length === 1 && pp[0].url.indexOf('id=eq.p-a') >= 0 &&
          pp[0].body.to_monday === W_1, JSON.stringify(pp.map(x => [x.url.split('?')[1], x.body])));
        const pt = h.calls.patch.filter(x => x.table === 'recurring_tasks');
        ok('после PATCH recurring_tasks active=false', pt.length === 1 && pt[0].body.active === false, JSON.stringify(pt.map(x => x.body)));
        ok('в базата: ' + W_OLD + '..' + W_1, periodsOf(db, 'r-a') === W_OLD + '..' + W_1, periodsOf(db, 'r-a'));
        checkCache(db, 'след Спри');
        await settle(() => !blockRow(h.doc, 'r-a'));
        ok('текуща: задачата не е в основния списък', !blockRow(h.doc, 'r-a'));
        ok('текуща: тя е в „Спрени (N)"', !!stoppedRow(h.doc, 'r-a'));
      }
    }
    const hp = await view('b-prev', db);
    ok('МИНАЛА седмица: задача А Е в блока', !!blockRow(hp.doc, 'r-a'));
    const hn = await view('b-next', db);
    ok('СЛЕДВАЩА седмица: задача А НЕ е в блока', !blockRow(hn.doc, 'r-a'));
  }

  /* ═══ 2. Активирай ═══════════════════════════════════════════════════════ */
  section('2. „▶ Активирай" → нов период от W, старият остава');
  {
    const h = env('b-cur', db);
    if (await loaded(h)) {
      const sr = stoppedRow(h.doc, 'r-a');
      const btn = sr && H.btn(sr, '▶ Активирай');
      if (ok('„▶ Активирай" е в „Спрени" за задача А', !!btn)) {
        realClick(h.w, btn, 'Активирай');
        ok('бутонът се заключва', btn.disabled === true);
        await settle(() => h.calls.toast.some(t => String(t).indexOf('Активирана') >= 0));
        const pp = h.calls.post.filter(x => x.table === 'recurring_task_periods');
        ok('POST на нов период from_monday = W, to_monday = null', pp.length === 1 && pp[0].body.from_monday === W0 &&
          pp[0].body.to_monday === null && pp[0].body.recurring_task_id === 'r-a', JSON.stringify(pp.map(x => x.body)));
        ok('created_by = display_name', pp.length === 1 && pp[0].body.created_by === 'Админ');
        ok('в базата: старият период остава + новият', periodsOf(db, 'r-a') === W_OLD + '..' + W_1 + ' | ' + W0 + '..∞', periodsOf(db, 'r-a'));
        checkCache(db, 'след Активирай');
        await settle(() => !!blockRow(h.doc, 'r-a'));
        ok('текуща: задача А пак е в основния списък', !!blockRow(h.doc, 'r-a'));
        ok('текуща: и не е в „Спрени"', !stoppedRow(h.doc, 'r-a'));
      }
    }
    const hp = await view('b-prev', db);
    ok('МИНАЛА седмица: задача А пак Е (старият период)', !!blockRow(hp.doc, 'r-a'));
  }

  /* ═══ 3. Празнина ═════════════════════════════════════════════════════════ */
  section('3. Активирана задача, спряна преди три седмици → W−2 и W−1 я нямат, W я има');
  {
    const h = env('b-cur', db);
    if (await loaded(h)) {
      const btn = stoppedRow(h.doc, 'r-gap') && H.btn(stoppedRow(h.doc, 'r-gap'), '▶ Активирай');
      if (ok('„▶ Активирай" за спряната отдавна', !!btn)) {
        realClick(h.w, btn, 'Активирай');
        await settle(() => db.tasks.find(t => t.id === 'r-gap').active === true && !!blockRow(h.doc, 'r-gap'));
        ok('в базата: ' + W_OLD + '..' + W_3 + ' и ' + W0 + '..∞', periodsOf(db, 'r-gap') === W_OLD + '..' + W_3 + ' | ' + W0 + '..∞', periodsOf(db, 'r-gap'));
        ok('текуща: я има', !!blockRow(h.doc, 'r-gap'));
        checkCache(db, 'след активиране с празнина');
      }
    }
    const h1 = await view('b-prev', db), h2 = await view('b-prev2', db);
    ok('W−1: я НЯМА (празнината)', !blockRow(h1.doc, 'r-gap'));
    ok('W−2: я НЯМА (празнината)', !blockRow(h2.doc, 'r-gap'));
  }

  /* ═══ 4. Спряна в първата си седмица ═════════════════════════════════════ */
  section('4. Спряна в първата си седмица → периодът се ТРИЕ');
  {
    const h = env('b-cur', db);
    if (await loaded(h)) {
      const btn = blockRow(h.doc, 'r-new') && H.btn(blockRow(h.doc, 'r-new'), '⏸ Спри');
      if (ok('„⏸ Спри" за задачата от тази седмица', !!btn)) {
        realClick(h.w, btn, 'Спри');
        await settle(() => h.calls.del.some(u => u.indexOf('/recurring_task_periods') >= 0) && db.tasks.find(t => t.id === 'r-new').active === false);
        ok('DELETE на периода p-new (не PATCH с to < from)', h.calls.del.some(u => u.indexOf('/recurring_task_periods') >= 0 && u.indexOf('id=eq.p-new') >= 0),
          h.calls.del.join(' | '));
        ok('няма PATCH на периода', !h.calls.patch.some(x => x.table === 'recurring_task_periods'));
        ok('в базата: без нито един период', periodsOf(db, 'r-new') === '', periodsOf(db, 'r-new'));
        ok('и active=false (не важи никъде)', db.tasks.find(t => t.id === 'r-new').active === false);
        checkCache(db, 'след Спри в първата седмица');
        await settle(() => !!stoppedRow(h.doc, 'r-new'));
        ok('в „Спрени"', !!stoppedRow(h.doc, 'r-new'));
      }
    }
    const hp = await view('b-prev', db);
    ok('W−1: я няма', !blockRow(hp.doc, 'r-new'));
  }

  /* ═══ 5. Задача без период ═══════════════════════════════════════════════ */
  section('5. Задача БЕЗ период (стар клиент), спряна → затворен период до W−1');
  {
    const h = env('b-cur', db);
    if (await loaded(h)) {
      const btn = blockRow(h.doc, 'r-leg') && H.btn(blockRow(h.doc, 'r-leg'), '⏸ Спри');
      if (ok('„⏸ Спри" (кешът active=true)', !!btn)) {
        realClick(h.w, btn, 'Спри');
        await settle(() => db.tasks.find(t => t.id === 'r-leg').active === false);
        const created = isoOf((function () { const d = shifted(-12); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })());
        ok('в базата: ' + created + '..' + W_1 + ' (от седмицата на създаването)', periodsOf(db, 'r-leg') === created + '..' + W_1, periodsOf(db, 'r-leg'));
        checkCache(db, 'след Спри на задача без период');
        ok('и active=false', db.tasks.find(t => t.id === 'r-leg').active === false);
      }
    }
    const hp = await view('b-prev', db);
    ok('W−1: я има (не е изчезнала от историята)', !!blockRow(hp.doc, 'r-leg'));
  }

  /* ═══ 6. Нова задача ════════════════════════════════════════════════════ */
  section('6. „+ Добави" → задача + период от W');
  {
    const h = env('b-cur', db);
    if (await loaded(h)) {
      const add = H.btnExact(h.doc.getElementById('dept-panel-admin'), '+ Добави');
      if (ok('„+ Добави" е в блока (текуща седмица)', !!add)) {
        realClick(h.w, add, '+ Добави');
        const ov = h.doc.getElementById('rec-modal-ov');
        if (ok('модалът е отворен', !!ov)) {
          h.doc.getElementById('rec-title').value = 'Съвсем нова';
          const save = H.btnExact(ov, 'Добави');
          realClick(h.w, save, 'Добави');
          ok('„Добави" в модала се заключва', save.disabled === true);
          await settle(() => h.calls.post.some(x => x.table === 'recurring_task_periods'));
          const nt = h.calls.post.filter(x => x.table === 'recurring_tasks');
          const np = h.calls.post.filter(x => x.table === 'recurring_task_periods');
          const row = db.tasks.find(t => t.title === 'Съвсем нова');
          ok('задачата е записана', nt.length === 1 && !!row);
          ok('периодът: from = W, отворен, за НЕЙНОТО id', np.length === 1 && !!row && np[0].body.recurring_task_id === row.id &&
            np[0].body.from_monday === W0 && np[0].body.to_monday === null, JSON.stringify(np.map(x => x.body)));
          checkCache(db, 'след Добави');
          await settle(() => h.calls.toast.some(t => String(t).indexOf('добавена') >= 0));
          ok('тост „добавена" (зелен, без грешка)', h.calls.toast.some(t => String(t).indexOf('Постоянната задача е добавена') >= 0), JSON.stringify(h.calls.toast));
          if (row) {
            const hc = await view('b-cur', db), hp = await view('b-prev', db);
            ok('текуща: новата Е в блока', !!blockRow(hc.doc, row.id));
            ok('W−1: новата НЕ е', !blockRow(hp.doc, row.id));
          }
        }
      }
    }
  }

  /* ═══ 7. Стар и бъдещ бюлетин ═══════════════════════════════════════════ */
  section('7. Стар и бъдещ бюлетин — без Спри/Активирай/Добави, със сивия текст');
  for (const [bulId, label] of [['b-prev', 'минала'], ['b-next', 'следваща']]) {
    const h = await view(bulId, db);
    const panel = h.doc.getElementById('dept-panel-admin');
    ok(label + ': нито един „⏸ Спри"', !!panel && H.allBtns(panel, '⏸ Спри').length === 0);
    ok(label + ': нито един „▶ Активирай"', !!panel && H.allBtns(panel, '▶ Активирай').length === 0);
    ok(label + ': няма „+ Добави" в блока „Постоянни задачи"', !!panel && !H.btnExact(panel, '+ Добави'));
    ok(label + ': секцията „Спрени" изобщо я няма', !!panel && !panel.querySelector('.rec-stopped-toggle') && !panel.querySelector('[data-rec-stopped]'));
    const note = panel && panel.querySelector('.rec-only-current');
    ok(label + ': сивият текст е там', !!note && txt(note) === 'Промени по постоянните задачи — само от текущата седмица', txt(note));
    const anyRow = panel && panel.querySelector('[data-rec-row]');
    ok(label + ': ✏️ и ✕ си стоят', !!anyRow && !!H.btn(anyRow, '✏️') && !!H.btnExact(anyRow, '✕'));
    /* Втора защита: извикване отдругаде (конзолата) — нищо не се пише. */
    const writesBefore = h.calls.post.length + h.calls.patch.length + h.calls.del.length;
    guard(label + ': toggleRecurringActive() директно не хвърля', () => h.w.toggleRecurringActive('r-a', false));
    for (let i = 0; i < 5; i++) await ticks();
    ok(label + ': директно извикване → нула записа', h.calls.post.length + h.calls.patch.length + h.calls.del.length === writesBefore);
    ok(label + ': и тост „само от текущата седмица"', h.calls.toast.some(t => String(t).indexOf('само от текущата седмица') >= 0));
  }
  {
    const h = await view('b-cur', db);
    ok('КОНТРОЛА — текуща: сивият текст го няма', !h.doc.querySelector('.rec-only-current'));
    ok('КОНТРОЛА — текуща: „⏸ Спри" има', H.allBtns(h.doc.getElementById('dept-panel-admin'), '⏸ Спри').length > 0);
  }

  /* ═══ 8. Провал на първата заявка ════════════════════════════════════════ */
  section('8. Провал на ПЕРИОДА → червен тост, active не се пипа');
  {
    const db2 = freshDb();
    const h = env('b-cur', db2, { fail: { PATCH: /\/recurring_task_periods\?/ } });
    if (await loaded(h)) {
      realClick(h.w, H.btn(blockRow(h.doc, 'r-a'), '⏸ Спри'), 'Спри');
      await settle(() => h.calls.toast.length > 0);
      for (let i = 0; i < 5; i++) await ticks();
      ok('червен тост за периода', h.calls.toast.some(t => String(t).indexOf('Грешка при запис на периода') >= 0), JSON.stringify(h.calls.toast));
      ok('БЕЗ PATCH на recurring_tasks', !h.calls.patch.some(x => x.table === 'recurring_tasks'));
      ok('БЕЗ „Спряна"', !h.calls.toast.some(t => String(t).indexOf('⏸ Спряна') >= 0));
      checkCache(db2, 'след провал на периода');
    }
  }

  /* ═══ 9. Провал на втората заявка ════════════════════════════════════════ */
  section('9. Провал на ACTIVE (периодът е записан) → червен тост + презареждане');
  {
    const db3 = freshDb();
    const h = env('b-cur', db3, { fail: { PATCH: /\/recurring_tasks\?/ } });
    if (await loaded(h)) {
      realClick(h.w, H.btn(blockRow(h.doc, 'r-a'), '⏸ Спри'), 'Спри');
      await settle(() => h.calls.toast.length > 0);
      const getsAt = h.calls.get.length;
      await settle(() => h.calls.get.slice(getsAt).some(u => u.indexOf('/recurring_task_periods') >= 0) || h.calls.get.some(u => u.indexOf('/recurring_task_periods') >= 0));
      for (let i = 0; i < 5; i++) await ticks();
      ok('червен тост „периодът Е записан"', h.calls.toast.some(t => String(t).indexOf('периодът Е записан') >= 0), JSON.stringify(h.calls.toast));
      ok('БЕЗ „Спряна"', !h.calls.toast.some(t => String(t).indexOf('⏸ Спряна') >= 0));
      ok('периодът в базата е затворен', periodsOf(db3, 'r-a') === W_OLD + '..' + W_1, periodsOf(db3, 'r-a'));
      const pGets = h.calls.get.filter(u => u.indexOf('/recurring_task_periods') >= 0);
      ok('презаредено: периодите се теглят втори път', pGets.length >= 2, String(pGets.length));
      ok('екранът следва базата: задача А е в „Спрени"', !!stoppedRow(h.doc, 'r-a'));
    }
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
