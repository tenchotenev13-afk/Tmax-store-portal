/* Спрени постоянни задачи (active=false) — секция „Спрени (N)" в блока
   „Постоянни задачи" на Бюлетина.

   До 11.09.2026 всяко зареждане на recurring_tasks беше active=eq.true, а
   „⏸ Спри" пише active=false — тоест спряната задача изчезваше от екрана и
   „▶ Активирай" никога не се показваше. Връщаше се само през SQL (реален
   случай: „Преоценка-задължителна").

   Какво заковава тестът:
     1. админ: отделна заявка active=eq.false; секцията „Спрени (1)" е в
        блока на отдела, СГЪНАТА по подразбиране; редът е сив, без чекбокс,
        „Отложи", „Не за тази седмица", 🔔, ✏️ — само „▶ Активирай" и ✕;
        задачата я няма в основния списък;
     2. реален клик на заглавието разгъва/сгъва секцията;
     3. докато е спряна: календарът и loadTasksStats НЕ я броят;
     4. реален клик на „▶ Активирай" → PATCH active=true по id-то ѝ; двата
        списъка се теглят НАНОВО от базата (PATCH-ът наистина пише в нея);
        задачата е в основния списък, секцията изчезва; сега календарът и
        loadTasksStats я броят (контрола, че 3. не минава по случайност);
     4б. ✕ в секцията трие и секцията се тегли наново;
     5. провален PATCH → тост за грешка, без „Активирана", задачата остава
        в секцията;
     6. управител: нито заявка active=eq.false, нито секция.

   ⚠️ Дати: котвата е сряда от текущата реална седмица, замразена на w.Date.

   Пускане: node tests/recurring-stopped.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

/* ── Котва ─────────────────────────────────────────────────────────────── */
const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
  return d;
})();
function isoWeekYear(d) {
  const t = new Date(d.getTime());
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  return t.getFullYear();
}
function isoOf(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
/* Понеделникът на седмицата на котвата — денят на активната задача. */
const MON = (function () { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() - 2); return isoOf(d); })();
function freezeDate(w) {
  const Real = w.Date, fixedMs = ANCHOR.getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  }
  w.Date = Frozen;
}

const TR = 'Троян';
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const MANAGER = { email: 'm@temax.bg', display_name: 'Управител', role: 'manager', store_name: TR };

const ACTIVE_TITLE = 'Работна активна';
const STOP_TITLE = 'Преоценка-задължителна';

function rec(id, over) {
  return Object.assign({
    id: id, title: 'Работна ' + id, department: 'admin', task_type: 'info',
    description: null, target_stores: null, due_weekday: null, due_weekdays: null,
    due_time: '20:00', due_window: false, linked_module: null, report_groups: null,
    attachments: null, active: true, sort_order: 0
  }, over || {});
}
/* Активната е дължима в понеделник (1 единица в статистиката), спряната —
   вторник и сряда (2 единици). Така знаменателят в клетката на отдела е
   1/1 без спряната и 1/3 с нея — разлика, която не може да е случайна. */
function seed() {
  return [
    rec('r-act', { title: ACTIVE_TITLE, due_weekdays: [0], due_weekday: 0, sort_order: 1 }),
    rec('r-stop', { title: STOP_TITLE, due_weekdays: [1, 2], due_weekday: 1, active: false, sort_order: 2 })
  ];
}

/* PostgREST: active=eq.true / active=eq.false — огледално на базата, за да
   минат истинските заявки, а не подменен масив. */
function recRoute(db) {
  return function (url) {
    const m = /[?&]active=eq\.(true|false)/.exec(url);
    return db.rows.filter(r => !m || String(!!r.active) === m[1])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  };
}
/* PATCH към recurring_tasks наистина пише в „базата" — иначе проверката
   „след активиране се тегли наново" би минавала и срещу код, който не тегли. */
function wireDb(h) {
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const m = (init.method || 'GET').toUpperCase();
    const p = orig.call(this, url, init);
    if ((m !== 'PATCH' && m !== 'DELETE') || url.indexOf('/recurring_tasks') < 0) return p;
    return p.then(function (r) {
      if (r && r.ok) {
        const id = /id=eq\.([^&]+)/.exec(url);
        if (m === 'DELETE') h.db.rows = h.db.rows.filter(x => !(id && x.id === id[1]));
        else {
          const body = JSON.parse(init.body || '{}');
          h.db.rows.forEach(x => { if (id && x.id === id[1]) Object.assign(x, body); });
        }
      }
      return r;
    });
  };
}

function env(user, extra) {
  extra = extra || {};
  const db = { rows: seed() };
  const h = boot(Object.assign({
    modules: ['bulletin.js'],
    user: user,
    data: {
      users: [{ store_name: TR }],
      recurring_tasks: recRoute(db),
      recurring_task_skips: [],
      bulletins: () => [h.bul],
      /* Една обикновена задача — иначе loadTasksStats() излиза веднага. */
      bulletin_tasks: [{ id: 't-1', bulletin_id: 'b-1', title: 'Обикновена', department: 'trade',
        due_date: null, due_dates: null, task_type: 'info', target_stores: null, sort_order: 1 }],
      /* Филтър recurring_task_id=eq.X — deleteRecurring() брои историята на
         ТРИТАТА задача, не всички отметки. */
      task_completions: function (url) {
        const all = [{ id: 'c1', task_id: null, recurring_task_id: 'r-act', store_name: TR, status: 'done',
          completion_date: MON, completed_by: TR }];
        const m = /[?&]recurring_task_id=eq\.([^&]+)/.exec(url);
        return m ? all.filter(c => c.recurring_task_id === m[1]) : all;
      }
    }
  }, extra.fail ? { fail: extra.fail } : {}));
  h.db = db;
  freezeDate(h.w);
  const cal = {};
  h.w.DKEYS.forEach(k => { cal[k] = []; });
  h.bul = { id: 'b-1', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published',
            content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
  h.w.bulActiveDept = 'admin';
  h.w.reportableStoresCache = [TR];
  wireDb(h);
  return h;
}

async function settle(cond, max) {
  for (let i = 0; i < (max || 40); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
function txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
function blockRow(doc, id) {
  return Array.prototype.find.call(doc.querySelectorAll('[data-rec-row="' + id + '"]'),
    r => !r.closest('#sec-calendar')) || null;
}
const stoppedRow = (doc, id) => doc.querySelector('[data-rec-stopped="' + id + '"]');
const toggleBtn = doc => doc.querySelector('.rec-stopped-toggle');
const calText = doc => txt(doc.getElementById('sec-calendar'));

/* loadTasksStats() в клетката „Администрация" за Троян: „отметнати/всички". */
async function statsAdminCell(h) {
  const doc = h.doc;
  let wrap = doc.getElementById('tasks-stat-wrap');
  if (!wrap) { wrap = doc.createElement('div'); wrap.id = 'tasks-stat-wrap'; doc.body.appendChild(wrap); }
  wrap.innerHTML = '';
  h.w.loadTasksStats();
  await settle(() => !!wrap.querySelector('tbody tr'));
  const heads = Array.prototype.map.call(wrap.querySelectorAll('thead th'), th => txt(th));
  const col = heads.findIndex(t => t.indexOf('Администрация') >= 0);
  const row = wrap.querySelector('tbody tr');
  return row && col >= 0 ? txt(row.children[col]) : '(няма клетка: ' + heads.join('|') + ')';
}

async function loaded(h) {
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return false;
  return settle(() => !!blockRow(h.doc, 'r-act'));
}

(async function () {

  /* ═══ 1. Админ: заявка и секция ════════════════════════════════════════ */
  section('1. Админ: active=eq.false се тегли отделно; „Спрени (1)" — сгъната');
  const ha = env(ADMIN);
  if (await loaded(ha)) {
    const doc = ha.doc, w = ha.w;
    const qs = ha.calls.get.filter(u => u.indexOf('/recurring_tasks') >= 0);
    ok('заявка active=eq.true', qs.some(u => u.indexOf('active=eq.true') >= 0), qs.join(' | '));
    ok('ОТДЕЛНА заявка active=eq.false', qs.some(u => u.indexOf('active=eq.false') >= 0), qs.join(' | '));
    ok('recurringTasks = само активните', w.recurringTasks.length === 1 && w.recurringTasks[0].id === 'r-act',
      w.recurringTasks.map(t => t.id).join(','));
    ok('recurringStopped = спряната', Array.isArray(w.recurringStopped) && w.recurringStopped.length === 1 &&
      w.recurringStopped[0].id === 'r-stop');
    ok('спряната я няма в основния списък', !blockRow(doc, 'r-stop'));

    const tg = toggleBtn(doc);
    if (ok('бутонът „Спрени (1)" е в блока', !!tg && txt(tg).indexOf('Спрени (1)') >= 0, txt(tg))) {
      const body = doc.getElementById('rec-stopped-admin');
      ok('секцията е СГЪНАТА по подразбиране', !!body && body.hidden === true);
      ok('стрелката е ▸', txt(tg).indexOf('▸') === 0, txt(tg));
    }
    const sr = stoppedRow(doc, 'r-stop');
    if (ok('редът на спряната е в секцията', !!sr && sr.closest('#rec-stopped-admin'))) {
      ok('заглавието ѝ', txt(sr).indexOf(STOP_TITLE) >= 0);
      ok('сиво (#94a3b8)', sr.innerHTML.indexOf('color:#94a3b8;">' + STOP_TITLE) >= 0);
      ok('без чекбокс', !sr.querySelector('input[type=checkbox]'));
      ok('„▶ Активирай"', !!H.btn(sr, '▶ Активирай'));
      ok('✕', !!H.btnExact(sr, '✕'));
      ok('без „Отложи"', !H.btn(sr, 'Отложи'));
      ok('без „Не за тази седмица"', !H.btn(sr, 'Не за тази седмица'));
      ok('без 🔔', !H.btn(sr, '🔔'));
      ok('без ✏️', !H.btn(sr, '✏️'));
      ok('без „⏸ Спри"', !H.btn(sr, 'Спри'));
      ok('точно два бутона', sr.querySelectorAll('button').length === 2,
        Array.prototype.map.call(sr.querySelectorAll('button'), b => b.textContent).join(' | '));
      ok('баджът не е кликаем', sr.innerHTML.indexOf('taskTypeBadgeClick') < 0);
    }
  }

  /* ═══ 2. Сгъване / разгъване ═══════════════════════════════════════════ */
  section('2. Реален клик на „Спрени (1)" разгъва и сгъва');
  {
    const doc = ha.doc, w = ha.w;
    const tg = toggleBtn(doc);
    if (ok('бутонът съществува', !!tg)) {
      guard('клик (разгъни)', () => realClick(w, tg, 'Спрени'));
      ok('разгъната', doc.getElementById('rec-stopped-admin').hidden === false);
      ok('стрелката е ▾', txt(toggleBtn(doc)).indexOf('▾') === 0, txt(toggleBtn(doc)));
      guard('клик (сгъни)', () => realClick(w, toggleBtn(doc), 'Спрени'));
      ok('пак сгъната', doc.getElementById('rec-stopped-admin').hidden === true);
      guard('клик (разгъни пак)', () => realClick(w, toggleBtn(doc), 'Спрени'));
      w.renderBulletin();
      ok('разгънатото оцелява прерисуване', doc.getElementById('rec-stopped-admin').hidden === false);
    }
  }

  /* ═══ 3. Докато е спряна — не се брои ═════════════════════════════════ */
  section('3. Докато е спряна: календарът и loadTasksStats не я броят');
  {
    const doc = ha.doc;
    ok('календарът е нарисуван', !!doc.getElementById('sec-calendar'));
    ok('спряната я няма в календара', calText(doc).indexOf(STOP_TITLE) < 0);
    ok('активната Е в календара (контрола)', calText(doc).indexOf(ACTIVE_TITLE) >= 0);
    const cell = await statsAdminCell(ha);
    ok('Администрация за Троян = 1/1 (без спряната)', cell === '1/1', cell);
  }

  /* ═══ 4. „▶ Активирай" ═════════════════════════════════════════════════ */
  section('4. Реален клик на „▶ Активирай" → PATCH active=true, връща се в списъка');
  {
    const doc = ha.doc, w = ha.w;
    const sr = stoppedRow(doc, 'r-stop');
    const act = sr && H.btn(sr, '▶ Активирай');
    if (ok('бутонът съществува', !!act)) {
      ha.calls.patch.length = 0;
      const getsBefore = ha.calls.get.length;
      guard('клик не хвърля', () => realClick(w, act, 'Активирай'));
      await settle(() => !!blockRow(doc, 'r-stop'));
      const p = ha.calls.patch.filter(x => x.table === 'recurring_tasks');
      if (ok('един PATCH към recurring_tasks', p.length === 1, String(p.length))) {
        ok('по id на спряната', p[0].url.indexOf('id=eq.r-stop') >= 0, p[0].url);
        ok('тяло {active:true}', JSON.stringify(p[0].body) === '{"active":true}', JSON.stringify(p[0].body));
      }
      const after = ha.calls.get.slice(getsBefore).filter(u => u.indexOf('/recurring_tasks') >= 0);
      ok('теглят се НАНОВО и двата списъка', after.some(u => u.indexOf('active=eq.true') >= 0) &&
        after.some(u => u.indexOf('active=eq.false') >= 0), after.join(' | '));
      ok('тост „▶ Активирана"', ha.calls.toast.some(t => String(t).indexOf('Активирана') >= 0));
      ok('задачата е в основния списък', !!blockRow(doc, 'r-stop'));
      const br = blockRow(doc, 'r-stop');
      ok('с „⏸ Спри" (вече е обикновена активна)', !!br && !!H.btn(br, '⏸ Спри'));
      ok('секцията „Спрени" изчезна (няма спрени)', !toggleBtn(doc) && !stoppedRow(doc, 'r-stop'));
      ok('recurringStopped е празен', Array.isArray(w.recurringStopped) && w.recurringStopped.length === 0);
      ok('КОНТРОЛА: сега календарът я показва', calText(doc).indexOf(STOP_TITLE) >= 0);
      const cell = await statsAdminCell(ha);
      ok('КОНТРОЛА: loadTasksStats я брои (1/3)', cell === '1/3', cell);
    }
  }

  /* ═══ 4б. ✕ в секцията ═════════════════════════════════════════════════ */
  section('4б. Реален клик на ✕ в „Спрени" → DELETE; секцията се тегли наново');
  {
    const h = env(ADMIN);
    if (await loaded(h)) {
      const doc = h.doc, w = h.w;
      const sr = stoppedRow(doc, 'r-stop');
      const del = sr && H.btnExact(sr, '✕');
      if (ok('бутонът ✕ съществува', !!del)) {
        guard('клик не хвърля', () => realClick(w, del, '✕'));
        await settle(() => !stoppedRow(doc, 'r-stop'));
        ok('поиска потвърждение', h.calls.confirm.length === 1, JSON.stringify(h.calls.confirm));
        ok('DELETE по id на спряната', h.calls.del.some(u => u.indexOf('/recurring_tasks') >= 0 && u.indexOf('id=eq.r-stop') >= 0),
          h.calls.del.join(' | '));
        ok('историята на ДРУГАТА задача не е пипната',
          !h.calls.del.some(u => u.indexOf('/task_completions') >= 0), h.calls.del.join(' | '));
        ok('редът изчезна от секцията', !stoppedRow(doc, 'r-stop'));
        ok('и бутонът „Спрени" също', !toggleBtn(doc));
        ok('активната си стои (контрола)', !!blockRow(doc, 'r-act'));
      }
    }
  }

  /* ═══ 5. Провален PATCH ════════════════════════════════════════════════ */
  section('5. Провален PATCH → тост за грешка, задачата остава спряна');
  {
    const h = env(ADMIN, { fail: { PATCH: /recurring_tasks/ } });
    if (await loaded(h)) {
      const doc = h.doc, w = h.w;
      const sr = stoppedRow(doc, 'r-stop');
      const act = sr && H.btn(sr, '▶ Активирай');
      if (ok('бутонът съществува', !!act)) {
        guard('клик не хвърля', () => realClick(w, act, 'Активирай'));
        await settle(() => h.calls.toast.length > 0);
        await ticks();
        ok('тост за грешка', h.calls.toast.some(t => String(t).indexOf('Грешка при запис') >= 0),
          JSON.stringify(h.calls.toast));
        ok('БЕЗ „Активирана"', !h.calls.toast.some(t => String(t).indexOf('Активирана') >= 0),
          JSON.stringify(h.calls.toast));
        ok('задачата я няма в основния списък', !blockRow(doc, 'r-stop'));
        ok('и е още в секцията', !!stoppedRow(doc, 'r-stop'));
      }
    }
  }

  /* ═══ 6. Управител ═════════════════════════════════════════════════════ */
  section('6. Управител: нито заявка active=eq.false, нито секция');
  {
    const h = env(MANAGER);
    if (await loaded(h)) {
      const doc = h.doc;
      const qs = h.calls.get.filter(u => u.indexOf('/recurring_tasks') >= 0);
      ok('нула заявки active=eq.false', !qs.some(u => u.indexOf('active=eq.false') >= 0), qs.join(' | '));
      ok('заявката за активните е там (контрола)', qs.some(u => u.indexOf('active=eq.true') >= 0));
      ok('няма бутон „Спрени"', !toggleBtn(doc));
      ok('няма ред на спряната', !stoppedRow(doc, 'r-stop'));
      ok('заглавието ѝ го няма никъде', txt(doc.getElementById('mod-bulletin')).indexOf(STOP_TITLE) < 0);
      ok('активната Е в блока (контрола)', !!blockRow(doc, 'r-act'));
      /* Втори слой: рендерът сам проверява canEdit(), не разчита само на
         това, че масивът е празен. */
      h.w.recurringStopped = [h.db.rows.find(r => r.id === 'r-stop')];
      guard('renderBulletin() с насила пълен recurringStopped', () => h.w.renderBulletin());
      ok('пак няма секция (рендерът проверява canEdit)', !toggleBtn(doc) && !stoppedRow(doc, 'r-stop'));
    }
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
