/* Обикновена задача със СРОК В ПО-КЪСНА СЕДМИЦА (bulletin_tasks.spans_from).

   Правилата (25.09.2026):
     · задачата е ЕДНА — един ред, едно отмятане на обект, едно X/18;
     · ВИЖДА СЕ от седмицата, в която е поставена (W), до седмицата на срока;
     · БРОИ СЕ само в седмицата на срока — дотогава е „в срок", не неизпълнена;
     · отмятането е отключено от понеделника на W до срока включително и пише
       completion_date = СРОКЪТ (оттам е „едно X/18");
     · редакция/изтриване/подредба — само от бюлетина на W.

   Какво заковава тестът (РЕАЛНИ кликове; „базата" наистина пише):
     1. формата: отметката гаси дните; записът носи spans_from и един ден срок;
     2. валидации: дата в същата седмица, над 4 седмици, липсваща дата —
        грешка и НУЛА записа;
     3. видимост: W (лента под календара, не в клетка), междинна седмица,
        седмицата на срока (в клетката на деня); НЕ в W−1 и не след срока;
     4. броене: в W панелът и таблицата я пропускат; в седмицата на срока я
        броят — и то веднъж;
     5. отмятане ОТ W: чекбоксът е отключен, редът носи срока като
        completion_date и бюлетина на ЗАДАЧАТА, не показания;
     6. след срока чекбоксът е заключен;
     7. само за четене в по-късна седмица: без ✏️/✕/🔔/▲▼, а директните
        извиквания не пишат нищо;
     8. отчетите: дневният я брои САМО в деня на срока; седмичният за W я дава
        в „в срок" с напредъка, а в седмицата на срока — в самите явявания.

   ⚠️ Датите са спрямо ЗАМРАЗЕНА сряда от текущата реална седмица.

   Пускане: node tests/task-span-weeks.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, ok, guard, section, report, ticks } = H;

/* ── котва: сряда 12:00 от текущата реална седмица ───────────────────────── */
const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
  return d;
})();
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
function shifted(days) { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() + days); return d; }
function isoWeekYear(d) {
  const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  return t.getFullYear();
}
function freezeAt(w, ms) {
  const Real = w.Date;
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = Frozen;
}
/* понеделник на седмица W+k спрямо котвата (котвата е сряда, тоест −2) */
const MON = k => isoOf(shifted(-2 + 7 * k));
const W0 = MON(0), W1 = MON(1), W2 = MON(2), W3 = MON(3);
/* четвъртък от седмица k */
const THU = k => isoOf(shifted(1 + 7 * k));
const DUE_NEXT = THU(1);      /* срок: четвъртък на следващата седмица */
const DUE_FAR = THU(3);       /* срок: четвъртък след три седмици */
const TUE0 = isoOf(shifted(-1));  /* вторник от ТАЗИ седмица — минал срок */

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const STORE = { email: 't@temax.bg', display_name: 'Троян', role: 'store', store_name: 'Троян' };
const STORES = ['Троян', 'Ловеч'];

function task(id, over) {
  return Object.assign({
    id: id, bulletin_id: 'b-0', week_number: 0, year: 2026, department: 'admin',
    title: 'Задача ' + id, description: null, due_date: null, due_dates: null,
    spans_from: null, target_stores: null, task_type: 'info', report_groups: null,
    linked_module: null, auto_complete: false, attachments: null, sort_order: 1,
    created_by: 'Админ', created_at: isoOf(shifted(-2))
  }, over || {});
}

function freshDb() {
  return {
    seq: 0,
    tasks: [
      task('t-norm', { title: 'Обикновена в W', due_date: THU(0), due_dates: [THU(0)], sort_order: 1 }),
      task('t-span', { title: 'Клетка надувно', due_date: DUE_NEXT, due_dates: [DUE_NEXT], spans_from: W0, sort_order: 2 }),
      task('t-far', { title: 'Три седмици напред', due_date: DUE_FAR, due_dates: [DUE_FAR], spans_from: W0, sort_order: 3 })
    ],
    comps: []
  };
}

/* ── „базата" ───────────────────────────────────────────────────────────────
   bulletin_tasks има ДВА пътя на четене и тестът трябва да различава точно
   тях: по bulletin_id (задачите на показания бюлетин) и многоседмичните по
   дати с вграден bulletins!inner. Вторият връща и обекта bulletins, защото
   точно по него минава гейтът за публикуване. */
function tasksRoute(db, buls) {
  return function (url) {
    const byBul = /[?&]bulletin_id=eq\.([^&]+)/.exec(url);
    if (byBul) return db.tasks.filter(t => t.bulletin_id === byBul[1]).slice().sort((a, b) => a.sort_order - b.sort_order);
    const byIds = /[?&]id=in\.\(([^)]*)\)/.exec(url);
    if (byIds) { const ids = byIds[1].split(','); return db.tasks.filter(t => ids.indexOf(t.id) >= 0); }
    if (url.indexOf('spans_from=not.is.null') >= 0) {
      const lte = /[?&]spans_from=lte\.([0-9-]+)/.exec(url);
      const gte = /[?&]due_date=gte\.([0-9-]+)/.exec(url);
      const pub = url.indexOf('bulletins.status=eq.published') >= 0;
      return db.tasks.filter(t => {
        if (!t.spans_from) return false;
        if (lte && !(t.spans_from <= lte[1])) return false;
        if (gte && !(String(t.due_date) >= gte[1])) return false;
        const b = buls.find(x => x.id === t.bulletin_id) || null;
        if (!b) return false;                               /* !inner */
        if (pub && b.status !== 'published') return false;
        return true;
      }).map(t => Object.assign({}, t, { bulletins: { id: t.bulletin_id, status: (buls.find(x => x.id === t.bulletin_id) || {}).status, week_number: (buls.find(x => x.id === t.bulletin_id) || {}).week_number, year: (buls.find(x => x.id === t.bulletin_id) || {}).year } }));
    }
    return db.tasks;
  };
}
function compsRoute(db) {
  return function (url) {
    let out = db.comps.slice();
    const tid = /[?&]task_id=eq\.([^&]+)/.exec(url);
    if (tid) out = out.filter(c => c.task_id === tid[1]);
    const tin = /[?&]task_id=in\.\(([^)]*)\)/.exec(url);
    if (tin) { const ids = tin[1].split(','); out = out.filter(c => ids.indexOf(String(c.task_id)) >= 0); }
    if (url.indexOf('recurring_task_id=not.is.null') >= 0) return [];
    if (url.indexOf('postponed_to=') >= 0) return [];
    const st = /[?&]store_name=eq\.([^&]+)/.exec(url);
    if (st) out = out.filter(c => c.store_name === decodeURIComponent(st[1]));
    const cd = /[?&]completion_date=eq\.([0-9-]+)/.exec(url);
    if (cd) out = out.filter(c => (c.completion_date || null) === cd[1]);
    const gte = /[?&]completion_date=gte\.([0-9-]+)/.exec(url);
    if (gte) out = out.filter(c => (c.completion_date || '') >= gte[1]);
    const lte = /[?&]completion_date=lte\.([0-9-]+)/.exec(url);
    if (lte) out = out.filter(c => (c.completion_date || '') <= lte[1]);
    const stat = /[?&]status=eq\.([a-z]+)/.exec(url);
    if (stat) out = out.filter(c => c.status === stat[1]);
    return out;
  };
}
function wireDb(h, db) {
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const m = (init.method || 'GET').toUpperCase();
    const onTasks = url.indexOf('/bulletin_tasks') >= 0;
    const onComps = url.indexOf('/task_completions') >= 0;
    if (m === 'GET' || (!onTasks && !onComps)) return orig.call(this, url, init);
    return orig.call(this, url, init).then(function (r) {
      const body = init.body ? JSON.parse(init.body) : null;
      const idm = /[?&]id=eq\.([^&]+)/.exec(url);
      const list = onTasks ? db.tasks : db.comps;
      if (m === 'POST') {
        const row = Object.assign({ id: (onTasks ? 't-n' : 'c-n') + (++db.seq) }, body);
        list.push(row);
        return { ok: true, status: 201, headers: { get: () => null }, json: () => Promise.resolve([row]), text: () => Promise.resolve('') };
      }
      if (m === 'PATCH') { list.forEach(x => { if (idm && x.id === idm[1]) Object.assign(x, body); }); return { ok: true, status: 204, headers: { get: () => null }, json: () => Promise.resolve(null), text: () => Promise.resolve('') }; }
      if (m === 'DELETE') {
        const keep = list.filter(x => !(idm && x.id === idm[1]));
        const n = list.length - keep.length;
        if (onTasks) db.tasks = keep; else db.comps = keep;
        return { ok: true, status: 204, headers: { get: k => (k === 'Content-Range' ? '*/' + n : null) }, json: () => Promise.resolve(null), text: () => Promise.resolve('') };
      }
      return r;
    });
  };
}

function bulOf(w, id, k, status) {
  const d = shifted(7 * k);
  const cal = {}; w.DKEYS.forEach(x => { cal[x] = []; });
  return {
    id: id, week_number: w.weekNum(d), year: isoWeekYear(d), status: status || 'published',
    created_at: isoOf(d), content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } }
  };
}

function env(bulId, db, over) {
  over = over || {};
  const h = boot({
    modules: ['bulletin.js', 'today.js', 'report.js', 'email.js'],
    user: over.user || ADMIN,
    data: {
      users: STORES.map(s => ({ store_name: s })),
      stores: STORES.map(s => ({ name: s })),
      recurring_tasks: [], recurring_task_periods: [], recurring_task_skips: [],
      recurring_task_versions: [],
      bulletins: url => {
        const m = /[?&]id=eq\.([^&]+)/.exec(url);
        if (m) return h.buls.filter(b => b.id === m[1]);
        if (url.indexOf('status=eq.published') >= 0) return h.buls.filter(b => b.status === 'published');
        return h.buls;
      },
      bulletin_promotions: [], task_subtasks: [], subtask_completions: [],
      notification_schedules: [], report_snapshots: [], goods_transit: []
    }
  });
  h.buls = [bulOf(h.w, 'b-prev', -1), bulOf(h.w, 'b-0', 0), bulOf(h.w, 'b-1', 1), bulOf(h.w, 'b-2', 2), bulOf(h.w, 'b-3', 3)];
  if (over.bulStatus) h.buls.forEach(b => { if (b.id === over.bulStatus.id) b.status = over.bulStatus.status; });
  h.setData('bulletin_tasks', tasksRoute(db, h.buls));
  h.setData('task_completions', compsRoute(db));
  freezeAt(h.w, over.nowMs || ANCHOR.getTime());
  h.w.bulSelectedId = bulId;
  h.w.bulActiveDept = 'admin';
  h.w.reportableStoresCache = STORES.slice();
  h.w.allStoresCache = STORES.slice();
  wireDb(h, db);
  return h;
}

async function settle(cond, max) {
  for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const panelOf = h => h.doc.getElementById('dept-panel-admin');
const calOf = h => h.doc.getElementById('sec-calendar');
async function view(bulId, db, over) {
  const h = env(bulId, db, over);
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return h;
  await settle(() => !!calOf(h) && !!panelOf(h));
  return h;
}
const writes = h => h.calls.post.length + h.calls.patch.length + h.calls.del.length;
/* редът на задачата в блока по отдел (не в календара, не в лентата) */
function deptRow(h, title) {
  const panel = panelOf(h);
  if (!panel) return null;
  return Array.prototype.find.call(panel.querySelectorAll('div'),
    d => d.children.length && txt(d.children[0] && d.children[0].tagName === 'INPUT' ? d : d).indexOf(title) === 0) || null;
}
/* по-надеждно: намираме чекбокса по data-tid и се качваме до реда */
function rowOf(root, tid) {
  const cb = root && root.querySelector('input[data-tid="' + tid + '"]');
  if (!cb) return null;
  let n = cb.parentElement;
  while (n && n.textContent.indexOf('Задача') < 0 && n.textContent.length < 10) n = n.parentElement;
  return cb.closest('div[style*="border-bottom"]') || cb.parentElement;
}
const cbOf = (root, tid) => (root ? root.querySelector('input[data-tid="' + tid + '"]') : null);
const stripOf = h => h.doc.getElementById('sec-span-strip');
/* Числото в картата „📋 Задачи" на таба Анализ — то е в следващия div след
   етикета, затова се взима по структура, а не с регекс по целия текст. */
function anCard(h) {
  const lbl = Array.prototype.find.call(h.doc.querySelectorAll('div'), d => txt(d) === '📋 Задачи');
  return lbl && lbl.nextElementSibling ? txt(lbl.nextElementSibling) : null;
}
const deptCount = h => txt(h.doc.querySelector('[data-dept-count="admin"]'));

(async function () {

  /* ═══ 1. ФОРМАТА ═══════════════════════════════════════════════════════ */
  section('1. Формата: „🗓 Срок в следваща седмица" гаси дните и пише spans_from');
  {
    const db = freshDb();
    const h = await view('b-0', db);
    const w = h.w;
    if (guard('openTaskModal() не хвърля', () => w.openTaskModal())) {
      const on = h.doc.getElementById('tk-span-on');
      ok('контролът съществува във формата', !!on);
      ok('по подразбиране е изключен', !!on && !on.checked);
      ok('полето за дата е скрито', (h.doc.getElementById('tk-span-wrap') || {}).style.display === 'none');

      /* реален клик по отметката */
      on.checked = true;
      fire(w, on, 'change');
      ok('полето за дата се показва', (h.doc.getElementById('tk-span-wrap') || {}).style.display === 'block');
      const days = h.doc.getElementById('tk-due-dates');
      const dayBoxes = Array.prototype.slice.call(days.querySelectorAll('input[type=checkbox]'));
      ok('седемте дни са изключени', dayBoxes.every(x => x.disabled));

      const inp = h.doc.getElementById('tk-span-due');
      ok('долната граница е понеделникът на следващата седмица', inp.getAttribute('min') === W1, inp.getAttribute('min'));
      ok('горната граница е 4 седмици напред', inp.getAttribute('max') === isoOf(shifted(-2 + 27)), inp.getAttribute('max'));

      h.doc.getElementById('tk-title').value = 'Нова многоседмична';
      inp.value = DUE_NEXT;
      const before = db.tasks.length;
      realClick(w, H.btnExact(h.doc.getElementById('tk-ov'), 'Добави задача'), 'Добави задача');
      await settle(() => db.tasks.length > before || h.calls.toast.length);
      const row = db.tasks.find(t => t.title === 'Нова многоседмична');
      ok('задачата е записана', !!row);
      ok('spans_from е понеделникът на показания бюлетин', !!row && row.spans_from === W0, row && String(row.spans_from));
      ok('due_date е избраната дата', !!row && String(row.due_date) === DUE_NEXT, row && String(row.due_date));
      ok('due_dates е ЕДИН ден', !!row && Array.isArray(row.due_dates) && row.due_dates.length === 1 && row.due_dates[0] === DUE_NEXT,
        row && JSON.stringify(row.due_dates));
    }
  }

  /* ═══ 2. ВАЛИДАЦИИ ═════════════════════════════════════════════════════ */
  section('2. Невалидните срокове не пишат нищо');
  {
    const cases = [
      ['дата в СЪЩАТА седмица', THU(0), 'обикновена задача'],
      ['дата над 4 седмици', isoOf(shifted(-2 + 28)), '4 седмици'],
      ['липсваща дата', '', 'Избери дата']
    ];
    for (const [name, value, expect] of cases) {
      const db = freshDb();
      const h = await view('b-0', db);
      const w = h.w;
      if (!guard('openTaskModal() не хвърля (' + name + ')', () => w.openTaskModal())) continue;
      const on = h.doc.getElementById('tk-span-on');
      on.checked = true; fire(w, on, 'change');
      h.doc.getElementById('tk-title').value = 'Невалидна';
      h.doc.getElementById('tk-span-due').value = value;
      const before = db.tasks.length, w0 = writes(h);
      realClick(w, H.btnExact(h.doc.getElementById('tk-ov'), 'Добави задача'), 'Добави задача');
      await ticks();
      ok(name + ' → нула нови задачи', db.tasks.length === before);
      ok(name + ' → нула записа', writes(h) === w0, String(writes(h) - w0));
      ok(name + ' → обяснена грешка', h.calls.toast.some(t => String(t).indexOf(expect) >= 0),
        JSON.stringify(h.calls.toast));
    }
  }

  /* ═══ 3. ВИДИМОСТ ══════════════════════════════════════════════════════ */
  section('3. Вижда се от W до седмицата на срока, и никъде другаде');
  {
    const db = freshDb();

    const hW = await view('b-0', db);
    ok('W: задачата е в блока по отдел', !!cbOf(panelOf(hW), 't-span'));
    ok('W: лентата под календара я показва', !!stripOf(hW) && txt(stripOf(hW)).indexOf('Клетка надувно') >= 0);
    ok('W: НЕ е в клетка на календара (няма ден тази седмица)',
      !!calOf(hW) && Array.prototype.every.call(calOf(hW).querySelectorAll('input[data-tid="t-span"]'),
        cb => !!cb.closest('div') && !!stripOf(hW) && stripOf(hW).contains(cb)));
    ok('W: лентата показва и задачата за три седмици напред', !!stripOf(hW) && txt(stripOf(hW)).indexOf('Три седмици') >= 0);

    const hW1 = await view('b-1', db);
    ok('W+1 (седмицата на срока): задачата е в блока', !!cbOf(panelOf(hW1), 't-span'));
    ok('W+1: има значка „↔ от"', txt(panelOf(hW1)).indexOf('↔ от С') >= 0, txt(panelOf(hW1)).slice(0, 200));
    ok('W+1: в лентата я НЯМА (срокът е в тази седмица)',
      !stripOf(hW1) || txt(stripOf(hW1)).indexOf('Клетка надувно') < 0);
    ok('W+1: задачата за три седмици напред е в лентата',
      !!stripOf(hW1) && txt(stripOf(hW1)).indexOf('Три седмици') >= 0);
    ok('W+1: обикновената задача на W я НЯМА', !cbOf(panelOf(hW1), 't-norm'));

    const hW2 = await view('b-2', db);
    ok('W+2 (междинна за далечната): в лентата',
      !!stripOf(hW2) && txt(stripOf(hW2)).indexOf('Три седмици') >= 0);
    ok('W+2: задачата с близък срок вече я няма', !cbOf(panelOf(hW2), 't-span'));

    const hW3 = await view('b-3', db);
    ok('W+3 (седмицата на далечния срок): в блока', !!cbOf(panelOf(hW3), 't-far'));

    const hPrev = await view('b-prev', db);
    ok('W−1: нито една многоседмична не се вижда',
      !cbOf(panelOf(hPrev), 't-span') && !cbOf(panelOf(hPrev), 't-far'));
  }

  /* ═══ 4. БРОЕНЕ ════════════════════════════════════════════════════════ */
  section('4. Брои се САМО в седмицата на срока');
  {
    const db = freshDb();
    const w0 = (await view('b-0', db)).w;
    ok('taskCountsInWeek: в W не се брои',
      w0.taskCountsInWeek(db.tasks.find(t => t.id === 't-span'), w0.weekDays(w0.weekNum(shifted(0)), isoWeekYear(shifted(0))).map(w0.toLocalISO)) === false);
    ok('taskCountsInWeek: в седмицата на срока се брои',
      w0.taskCountsInWeek(db.tasks.find(t => t.id === 't-span'), w0.weekDays(w0.weekNum(shifted(7)), isoWeekYear(shifted(7))).map(w0.toLocalISO)) === true);
    ok('taskCountsInWeek: обикновената задача се брои винаги',
      w0.taskCountsInWeek(db.tasks.find(t => t.id === 't-norm'), []) === true);
    /* Непозната седмица (колектор без публикуван бюлетин) НЕ брои
       многоседмичната: „не знам кога" не е „брои се сега". */
    ok('taskCountsInWeek: без седмица многоседмичната НЕ се брои',
      w0.taskCountsInWeek(db.tasks.find(t => t.id === 't-span'), []) === false);
    ok('taskCountsInWeek: без седмица — и с null вместо масив',
      w0.taskCountsInWeek(db.tasks.find(t => t.id === 't-span'), null) === false);

    /* панелът на обекта: броячът в W не включва многоседмичните */
    const hs = await view('b-0', db, { user: STORE });
    ok('W, обект: броячът е 0/1 — само обикновената задача', deptCount(hs) === '0/1', deptCount(hs));
    ok('W, обект: многоседмичната пак се ВИЖДА', !!cbOf(panelOf(hs), 't-span'));

    const hs1 = await view('b-1', db, { user: STORE });
    ok('седмицата на срока, обект: броячът е 0/1 за многоседмичната', deptCount(hs1) === '0/1', deptCount(hs1));

    /* таблицата на офиса */
    const ha = await view('b-0', db);
    await settle(() => !!(h => h)(ha) && !!ha.doc.getElementById('tasks-stat-wrap') && ha.doc.getElementById('tasks-stat-wrap').innerHTML.indexOf('Магазин') >= 0);
    const stat = ha.doc.getElementById('tasks-stat-wrap');
    ok('W, таблицата брои 1 задача на обект (без многоседмичните)',
      !!stat && /0\/1/.test(stat.textContent), stat && stat.textContent.replace(/\s+/g, ' ').slice(0, 200));
  }

  /* ═══ 5. ОТМЯТАНЕ ОТ W (ПО-РАНО ОТ СРОКА) ══════════════════════════════ */
  section('5. Отмятане от W: отключено, с completion_date = СРОКЪТ');
  {
    const db = freshDb();
    const h = await view('b-0', db, { user: STORE });
    const cb = cbOf(panelOf(h), 't-span');
    if (ok('чекбоксът съществува', !!cb)) {
      ok('НЕ е заключен, макар срокът да е следващата седмица', !cb.disabled);
      ok('носи data-cdate = срока', cb.getAttribute('data-cdate') === DUE_NEXT, cb.getAttribute('data-cdate'));
      ok('носи data-span = понеделника на W', cb.getAttribute('data-span') === W0, cb.getAttribute('data-span'));
      cb.checked = true;
      fire(h.w, cb, 'change');
      await settle(() => db.comps.length > 0);
      const c = db.comps[0];
      ok('записан е ЕДИН ред', db.comps.length === 1, String(db.comps.length));
      ok('completion_date е СРОКЪТ, не днес', !!c && c.completion_date === DUE_NEXT, c && String(c.completion_date));
      ok('status е done', !!c && c.status === 'done');
      ok('bulletin_id е този на ЗАДАЧАТА (b-0), не показаният', !!c && c.bulletin_id === 'b-0', c && String(c.bulletin_id));
    }

    /* Отмятане ОТ СЕДМИЦАТА НА СРОКА: редът пак трябва да носи бюлетина на
       ЗАДАЧАТА (b-0), не показания (b-1). Тук се вижда разликата — при
       отмятане от самата W двете съвпадат и грешката не лъсва. */
    {
      const db2 = freshDb();
      const h2 = await view('b-1', db2, { user: STORE });
      const cb2 = cbOf(panelOf(h2), 't-span');
      if (ok('в седмицата на срока има чекбокс', !!cb2)) {
        cb2.checked = true;
        fire(h2.w, cb2, 'change');
        await settle(() => db2.comps.length > 0);
        const c2 = db2.comps[0];
        ok('отмятане от W+1: bulletin_id е b-0 (на задачата)', !!c2 && c2.bulletin_id === 'b-0', c2 && String(c2.bulletin_id));
        ok('отмятане от W+1: completion_date пак е срокът', !!c2 && c2.completion_date === DUE_NEXT, c2 && String(c2.completion_date));
      }
    }

    /* и се вижда като отметната в седмицата на срока — същото явяване */
    const h1 = await view('b-1', db, { user: STORE });
    const cb1 = cbOf(panelOf(h1), 't-span');
    ok('в седмицата на срока излиза отметната', !!cb1 && cb1.checked);
  }

  /* ═══ 6. СЛЕД СРОКА ════════════════════════════════════════════════════ */
  section('6. След срока чекбоксът е заключен');
  {
    const db = freshDb();
    /* срок вторник от ТАЗИ седмица, поставена преди две седмици → минал срок */
    db.tasks.push(task('t-late', { title: 'Минал срок', bulletin_id: 'b-prev', due_date: TUE0, due_dates: [TUE0], spans_from: MON(-1), sort_order: 4 }));
    const h = await view('b-0', db, { user: STORE });
    const cb = cbOf(panelOf(h), 't-late');
    if (ok('задачата с минал срок се вижда в седмицата на срока', !!cb)) {
      ok('чекбоксът е заключен', !!cb.disabled);
      ok('обяснението е „Денят е приключил"', (cb.getAttribute('title') || '').indexOf('приключил') >= 0, cb.getAttribute('title'));
    }
    ok('bulSpanLockReason: преди W → future', h.w.bulSpanLockReason(DUE_NEXT, MON(1)) === 'future');
    ok('bulSpanLockReason: вътре в периода → отключено', h.w.bulSpanLockReason(DUE_NEXT, W0) === null);
    ok('bulSpanLockReason: след срока → past', h.w.bulSpanLockReason(TUE0, MON(-1)) === 'past');
  }

  /* ═══ 7. САМО ЗА ЧЕТЕНЕ В ПО-КЪСНА СЕДМИЦА ═════════════════════════════ */
  section('7. В по-късна седмица задачата не се редактира');
  {
    const db = freshDb();
    const h = await view('b-1', db);           /* админ, седмицата на срока */
    const row = rowOf(panelOf(h), 't-span');
    ok('редът съществува', !!row);
    ok('няма ✏️', !!row && txt(row).indexOf('✏️') < 0);
    ok('няма ✕', !!row && !H.btnExact(row, '✕'));
    ok('няма ▲', !!row && !H.btnExact(row, '▲'));
    ok('има бутон към седмицата на поставяне', !!row && txt(row).indexOf('Поставена в С') >= 0, txt(row).slice(0, 200));

    const wr = writes(h);
    if (guard('openEditTaskModal() не хвърля', () => h.w.openEditTaskModal('t-span'))) {
      ok('формата за редакция НЕ се отваря', !h.doc.getElementById('edit-tk-ov'));
      ok('казва къде се редактира', h.calls.toast.some(t => String(t).indexOf('редактирай я там') >= 0),
        JSON.stringify(h.calls.toast));
    }
    guard('moveTaskInDept() не хвърля', () => h.w.moveTaskInDept('t-span', -1));
    await ticks();
    ok('нито едно записване от по-късната седмица', writes(h) === wr, String(writes(h) - wr));

    /* в СВОЯТА седмица бутоните са налице */
    const h0 = await view('b-0', db);
    const row0 = rowOf(panelOf(h0), 't-span');
    ok('в W редът има ✏️', !!row0 && txt(row0).indexOf('✏️') >= 0);
    if (guard('openEditTaskModal() в W не хвърля', () => h0.w.openEditTaskModal('t-span'))) {
      ok('в W формата се отваря', !!h0.doc.getElementById('edit-tk-ov'));
      const on = h0.doc.getElementById('etk-span-on');
      ok('отметката е включена', !!on && on.checked);
      ok('датата е срокът', (h0.doc.getElementById('etk-span-due') || {}).value === DUE_NEXT);
      ok('седемте дни са заключени',
        Array.prototype.every.call(h0.doc.getElementById('etk-due-dates').querySelectorAll('input'), x => x.disabled));
    }
  }

  /* ═══ 8. ОТЧЕТИТЕ ══════════════════════════════════════════════════════ */
  section('8. Дневният само в деня на срока; седмичният — „в срок" преди него');
  {
    /* 8а. дневен за днес (сряда от W) — задачата НЕ участва */
    {
      const db = freshDb();
      const h = env('b-0', db);
      let daily = null;
      if (guard('collectDailyReportData() не хвърля', () => h.w.collectDailyReportData(d => { daily = d; }))) {
        await settle(() => !!daily);
        const titles = (daily && daily.items || []).map(i => i.title);
        ok('дневен в W: многоседмичната я няма', titles.indexOf('Клетка надувно') < 0, JSON.stringify(titles));
      }
    }
    /* 8б. дневен за ДЕНЯ НА СРОКА — участва */
    {
      const db = freshDb();
      const dueMs = new Date(DUE_NEXT + 'T12:00:00').getTime();
      const h = env('b-1', db, { nowMs: dueMs });
      let daily = null;
      if (guard('collectDailyReportData() в деня на срока не хвърля', () => h.w.collectDailyReportData(d => { daily = d; }))) {
        await settle(() => !!daily);
        const titles = (daily && daily.items || []).map(i => i.title);
        ok('дневен в деня на срока: задачата е вътре', titles.indexOf('Клетка надувно') >= 0, JSON.stringify(titles));
      }
    }
    /* 8в. седмичен за W — в „в срок", не в явяванията, с напредък */
    {
      const db = freshDb();
      db.comps.push({ id: 'c-1', task_id: 't-span', store_name: 'Троян', status: 'done', completion_date: DUE_NEXT, completed_by: 'Троян' });
      const h = env('b-0', db);
      let wk = null;
      if (guard('collectWeeklyReportData() не хвърля', () => h.w.collectWeeklyReportData(d => { wk = d; }))) {
        await settle(() => !!wk);
        const titles = (wk && wk.items || []).map(i => i.title);
        ok('седмичен за W: НЕ е в явяванията', titles.indexOf('Клетка надувно') < 0, JSON.stringify(titles));
        const sp = (wk && wk.spanPending) || [];
        const mine = sp.find(x => x.title === 'Клетка надувно');
        ok('седмичен за W: в списъка „в срок"', !!mine, JSON.stringify(sp));
        ok('носи срока и седмицата му', !!mine && mine.due === DUE_NEXT && /^С\d+$/.test(mine.dueWeek), mine && JSON.stringify(mine));
        ok('показва напредъка 1 от 2 обекта', !!mine && mine.done === 1 && mine.total === 2, mine && (mine.done + '/' + mine.total));
        const html = h.w.buildWeeklyReportHtml ? h.w.buildWeeklyReportHtml(wk) : '';
        ok('имейлът носи секцията „В срок"', html.indexOf('В срок (краен срок по-късно)') >= 0);
        ok('имейлът показва 1/2', html.indexOf('1/2') >= 0);
      }
    }
    /* 8г. седмичен за седмицата на срока — нормално явяване */
    {
      const db = freshDb();
      const h = env('b-1', db, { nowMs: new Date(DUE_NEXT + 'T12:00:00').getTime() });
      let wk = null;
      if (guard('collectWeeklyReportData() в седмицата на срока не хвърля', () => h.w.collectWeeklyReportData(d => { wk = d; }))) {
        await settle(() => !!wk);
        const titles = (wk && wk.items || []).map(i => i.title);
        ok('седмичен за седмицата на срока: задачата е явяване', titles.indexOf('Клетка надувно') >= 0, JSON.stringify(titles));
        ok('и НЕ е в „в срок"', !((wk.spanPending || []).some(x => x.title === 'Клетка надувно')));
        ok('явяването е ЕДНО', titles.filter(t => t === 'Клетка надувно').length === 1);
      }
    }
  }

  /* ═══ 9. ЧЕРНОВА В W ═══════════════════════════════════════════════════ */
  section('9. Задача от ЧЕРНОВА не изтича в по-късните седмици');
  {
    const db = freshDb();
    /* Бюлетинът на W става чернова: обектите още не виждат задачите му. */
    const hs = await view('b-1', db, { user: STORE, bulStatus: { id: 'b-0', status: 'draft' } });
    ok('обект в W+1: многоседмичната от черновата я НЯМА', !cbOf(panelOf(hs), 't-span'));
    ok('обект в W+1: и в лентата я няма',
      !stripOf(hs) || txt(stripOf(hs)).indexOf('Три седмици') < 0);

    const ha = await view('b-1', db, { bulStatus: { id: 'b-0', status: 'draft' } });
    ok('админ в W+1: вижда я (той вижда и черновите)', !!cbOf(panelOf(ha), 't-span'));

    /* Публикуван W → обектът я вижда. Контролата за горните две. */
    const hp = await view('b-1', db, { user: STORE });
    ok('КОНТРОЛА: при публикуван W обектът я вижда', !!cbOf(panelOf(hp), 't-span'));
  }

  /* ═══ 10. ЛИЧНИЯТ СЕДМИЧЕН ОТЧЕТ ═══════════════════════════════════════ */
  section('10. Личният отчет: картичка само в седмицата на срока');
  {
    /* Личният отчет е за ПРИКЛЮЧИЛАТА седмица (reportPrevWeekMonday), затова
       „днес" е в следващата спрямо отчетната. */
    const mk = (nowShift) => {
      const db = freshDb();
      db.tasks.push(task('t-rg', { title: 'Многоседмична с група', due_date: DUE_NEXT, due_dates: [DUE_NEXT], spans_from: W0, report_groups: ['managers'], sort_order: 5 }));
      return env('b-0', db, { nowMs: shifted(nowShift).getTime() });
    };
    {
      const h = mk(7);                       /* отчетна седмица = W */
      let data = null;
      h.w.collectWeeklyRoutingData(d => { data = d; });
      await settle(() => !!data);
      const ids = (data && data.tasks || []).map(t => t.id);
      ok('отчет за W: многоседмичната НЯМА картичка', ids.indexOf('t-rg') < 0, ids.join(','));
    }
    {
      const h = mk(14);                      /* отчетна седмица = W+1 = седмицата на срока */
      let data = null;
      h.w.collectWeeklyRoutingData(d => { data = d; });
      await settle(() => !!data);
      const ids = (data && data.tasks || []).map(t => t.id);
      ok('отчет за седмицата на срока: картичката е налице', ids.indexOf('t-rg') >= 0, ids.join(','));
      const t = (data && data.tasks || []).find(x => x.id === 't-rg');
      ok('явяването е на деня на срока', !!t && t.date === DUE_NEXT, t && String(t.date));
    }
  }

  /* ═══ 11. ОСТАЛИТЕ ЧЕТИРИ МЕСТА, КЪДЕТО СЕ БРОИ ИЛИ ГОВОРИ ═══════════════
     Намерени с кръстосан преглед (правило 7): същите данни се показват на
     повече от едно място и всяко от тях има собствен брояч. */
  section('11. Анализ, дайджест, push при публикуване, опашка със снимки');
  {
    /* 11а. табът „Анализ" — задачата се брои веднъж, в седмицата на срока */
    {
      const db = freshDb();
      const h = await view('b-0', db);
      h.w.bulMode = 'analysis';
      if (guard('renderBulAnalysis() не хвърля', () => h.w.renderBulAnalysis())) {
        ok('W: „Задачи" брои само обикновената (1)', anCard(h) === '1', anCard(h) + ' | ' + txt(h.doc.getElementById('mod-bulletin')).slice(0, 120));
      }
      const h1 = await view('b-1', db);
      h1.w.bulMode = 'analysis';
      if (guard('renderBulAnalysis() в седмицата на срока не хвърля', () => h1.w.renderBulAnalysis())) {
        ok('седмицата на срока: брои многоседмичната (1)', anCard(h1) === '1', anCard(h1));
      }
    }
    /* 11б. bulWeekTasks() — числото в push-а „бюлетинът е публикуван" */
    {
      const db = freshDb();
      const h = await view('b-0', db);
      ok('bulWeekTasks() в W дава само дължимите (1)', h.w.bulWeekTasks().length === 1,
        JSON.stringify(h.w.bulWeekTasks().map(t => t.title)));
      ok('bulTasks съдържа и трите (показват се)', h.w.bulTasks.length === 3, String(h.w.bulTasks.length));
      const h1 = await view('b-1', db);
      ok('bulWeekTasks() в седмицата на срока дава многоседмичната', h1.w.bulWeekTasks().length === 1,
        JSON.stringify(h1.w.bulWeekTasks().map(t => t.title)));
    }
    /* 11в. седмичният дайджест до обектите */
    {
      const db = freshDb();
      const h = await view('b-0', db);
      const w = h.w;
      const wk = h.buls[1].week_number, yr = h.buls[1].year;
      const html = w.buildWeeklyDigestHtml('Троян', w.bulTasks, wk, yr);
      ok('дайджестът има секция „Със срок в следваща седмица"',
        html.indexOf('Със срок в следваща седмица') >= 0);
      ok('многоседмичната е в нея, с датата', html.indexOf('Клетка надувно') >= 0 && html.indexOf('Срок: ') >= 0);
      /* Тук е същината: НЕ бива да стои под ден от ТАЗИ седмица. */
      const beforeDays = html.slice(0, html.indexOf('Със срок в следваща седмица'));
      ok('НЕ е под ден от тази седмица', beforeDays.indexOf('Клетка надувно') < 0,
        beforeDays.slice(-200));
      ok('обикновената задача си остава под своя ден',
        beforeDays.indexOf('Задача t-norm') >= 0 || beforeDays.indexOf('Обикновена в W') >= 0);
    }
    /* 11г. опашката със снимки в „Днес" пита и за многоседмичните */
    {
      const db = freshDb();
      const h = env('b-0', db);
      ['report_snapshots','differences_reports','stock_returns','kasa_storno','kasa_zoborot',
       'transport_pallets','stock_differences','client_orders','transport_orders',
       'daily_turnover','report_recipients','kasa_reports'].forEach(t => h.setData(t, []));
      if (guard('todayLoadPhotoQueue() не хвърля', () => h.w.todayLoadPhotoQueue(function(){}))) {
        await settle(() => h.calls.get.some(u => /bulletin_tasks/.test(u) && /spans_from=not.is.null/.test(u)));
        ok('има заявка за многоседмичните',
          h.calls.get.some(u => /bulletin_tasks/.test(u) && /spans_from=not.is.null/.test(u)),
          JSON.stringify(h.calls.get.filter(u => /bulletin_tasks/.test(u))));
      }
    }
  }

  report();
})();
