/* Обикновена задача „Само за информация" (task_type='notice') в блока на
   отдела — с ✏️ и ✕ (25.09.2026).

   Дотук такава задача беше САМО в Седмичния календар, а calNoticeRowHtml()
   няма бутони: тоест задачата не можеше да се редактира или изтрие от НИКЪДЕ.
   За постоянните същото е поправено на 11.09 (3ec0ce0).

   Какво заковава тестът (РЕАЛНИ кликове; „базата" наистина пише):
     1. notice е в блока на отдела: сив ред, БЕЗ чекбокс, без „Срок", без
        „Отложи"; ✏️, ✕ и 🔔 ги има (🔔 е НАПОМНЯНЕ до обектите, не отчет),
        а секцията „Отчет за изпълнението" във формата я няма;
     2. ✏️ отваря формата и записът минава (PATCH по id-то);
     3. ✕ трие (DELETE по id-то) — с потвърждение;
     4. магазинът вижда реда, но без нито един бутон и без чекбокс;
     5. броячите НЕ се променят: панелът „Задачи за седмицата" и таблицата
        X/18 броят само задачата за изпълнение;
     6. ▲▼ — notice участва в подредбата (иначе редът му е закотвен) и
        наборът в рендера съвпада с този в moveTaskInDept();
     7. регресия: notice си остава и в Седмичния календар, и продължава да
        е ИЗВЪН „Днес", дневния отчет и печата като задача за изпълнение.

   Пускане: node tests/task-notice-dept-block.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

/* ── котва: сряда 12:00 от текущата реална седмица ───────────────────────── */
const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
  return d;
})();
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const shifted = days => { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() + days); return d; };
function isoWeekYear(d) {
  const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  return t.getFullYear();
}
function freezeDate(w) {
  const Real = w.Date, ms = ANCHOR.getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = Frozen;
}
const WED = isoOf(ANCHOR);

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const STORE = { email: 't@temax.bg', display_name: 'Троян', role: 'store', store_name: 'Троян' };
const STORES = ['Троян', 'Ловеч'];

function task(id, over) {
  return Object.assign({
    id: id, bulletin_id: 'b-0', week_number: 0, year: 2026, department: 'admin',
    title: 'Задача ' + id, description: null, due_date: null, due_dates: null,
    spans_from: null, target_stores: null, task_type: 'info', report_groups: null,
    linked_module: null, auto_complete: false, attachments: null, sort_order: 1,
    created_by: 'Админ', created_at: WED
  }, over || {});
}
function freshDb() {
  return {
    seq: 0,
    tasks: [
      task('t-do', { title: 'Ревизия на щанда', due_date: WED, due_dates: [WED], sort_order: 1 }),
      task('t-info', { title: 'Нови цени от понеделник', description: 'Виж прикачения файл', task_type: 'notice', sort_order: 2 }),
      /* notice СЪС дата — тя и досега се виждаше в Седмичния календар.
         Онази без дата (t-info) не се виждаше НИКЪДЕ: календарът подрежда
         задачите по ден (taskIsDueOnDate), а тя няма ден. */
      task('t-info-d', { title: 'Инвентаризация в четвъртък', task_type: 'notice', due_date: WED, due_dates: [WED], sort_order: 3 })
    ],
    comps: []
  };
}
function wireDb(h, db) {
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const m = (init.method || 'GET').toUpperCase();
    const onTasks = url.indexOf('/bulletin_tasks') >= 0;
    if (m === 'GET' || !onTasks) return orig.call(this, url, init);
    const body = init.body ? JSON.parse(init.body) : null;
    const idm = /[?&]id=eq\.([^&]+)/.exec(url);
    /* Минава ПЪРВО през оригиналния fetch, за да влезе в h.calls.patch/del —
       иначе тестът проверява базата, но не и че е имало заявка. */
    orig.call(this, url, init);
    if (m === 'POST') {
      const row = Object.assign({ id: 't-n' + (++db.seq) }, body);
      db.tasks.push(row);
      return Promise.resolve({ ok: true, status: 201, headers: { get: () => null }, json: () => Promise.resolve([row]), text: () => Promise.resolve('') });
    }
    if (m === 'PATCH') {
      db.tasks.forEach(x => { if (idm && x.id === idm[1]) Object.assign(x, body); });
      return Promise.resolve({ ok: true, status: 204, headers: { get: () => null }, json: () => Promise.resolve(null), text: () => Promise.resolve('') });
    }
    if (m === 'DELETE') {
      const keep = db.tasks.filter(x => !(idm && x.id === idm[1]));
      const n = db.tasks.length - keep.length;
      db.tasks = keep;
      return Promise.resolve({ ok: true, status: 204, headers: { get: k => (k === 'Content-Range' ? '*/' + n : null) }, json: () => Promise.resolve(null), text: () => Promise.resolve('') });
    }
    return orig.call(this, url, init);
  };
}
function bulOf(w) {
  const cal = {}; w.DKEYS.forEach(x => { cal[x] = []; });
  return {
    id: 'b-0', week_number: w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published',
    created_at: WED, content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } }
  };
}
function env(db, over) {
  over = over || {};
  const h = boot({
    modules: ['bulletin.js', 'today.js', 'report.js'],
    user: over.user || ADMIN,
    confirm: over.confirm === undefined ? true : over.confirm,
    data: {
      users: STORES.map(s => ({ store_name: s })),
      stores: STORES.map(s => ({ name: s })),
      recurring_tasks: [], recurring_task_periods: [], recurring_task_skips: [],
      recurring_task_versions: [],
      bulletins: () => h.buls,
      bulletin_tasks: url => {
        const byBul = /[?&]bulletin_id=eq\.([^&]+)/.exec(url);
        if (byBul) return db.tasks.filter(t => t.bulletin_id === byBul[1]).slice().sort((a, b) => a.sort_order - b.sort_order);
        if (url.indexOf('spans_from=not.is.null') >= 0) return [];
        const byIds = /[?&]id=in\.\(([^)]*)\)/.exec(url);
        if (byIds) { const ids = byIds[1].split(','); return db.tasks.filter(t => ids.indexOf(t.id) >= 0); }
        return db.tasks;
      },
      task_completions: () => db.comps,
      bulletin_promotions: [], task_subtasks: [], subtask_completions: [],
      notification_schedules: [], report_snapshots: [], goods_transit: []
    }
  });
  h.buls = [bulOf(h.w)];
  freezeDate(h.w);
  h.w.bulSelectedId = 'b-0';
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
async function view(db, over) {
  const h = env(db, over);
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return h;
  await settle(() => !!calOf(h) && !!panelOf(h));
  return h;
}
/* Редът на задачата в блока по отдел — намираме го по бутона ✕/✏️ или по
   чекбокса и се качваме до реда с долната рамка. */
function deptRow(h, title) {
  const panel = panelOf(h);
  if (!panel) return null;
  const rows = Array.prototype.slice.call(panel.querySelectorAll('div[style*="border-bottom:1px solid #f1f5f9"]'));
  return rows.find(r => txt(r).indexOf(title) >= 0) || null;
}
const taskTypeOf = t => (t && t.task_type) || 'info';
const writes = h => h.calls.post.length + h.calls.patch.length + h.calls.del.length;

(async function () {

  section('1. notice е в блока на отдела — сив ред без чекбокс, с ✏️ и ✕');
  {
    const db = freshDb();
    const h = await view(db);
    const row = deptRow(h, 'Нови цени от понеделник');
    if (ok('редът съществува в блока на отдела', !!row, txt(panelOf(h)).slice(0, 200))) {
      ok('НЯМА чекбокс', !row.querySelector('input[type=checkbox]'));
      ok('носи баджа „Инфо"', txt(row).indexOf('Инфо') >= 0, txt(row).slice(0, 120));
      /* Сив ред — същият цвят като при постоянната notice: редът не е работа,
         която чака, и не бива да изглежда като неизпълнена задача. */
      const titleDiv = Array.prototype.find.call(row.querySelectorAll('div'),
        d => txt(d) === 'Нови цени от понеделник');
      ok('заглавието е сиво (#94a3b8), не черно',
        !!titleDiv && /color:\s*#94a3b8/.test(titleDiv.getAttribute('style') || ''),
        titleDiv && titleDiv.getAttribute('style'));
      ok('описанието се показва', txt(row).indexOf('Виж прикачения файл') >= 0);
      ok('няма ред „Срок"', txt(row).indexOf('Срок') < 0, txt(row).slice(0, 160));
      ok('няма „⏱ Отложи"', !H.btn(row, 'Отложи'));
      ok('✏️ го има', txt(row).indexOf('✏️') >= 0);
      ok('✕ го има', !!H.btnExact(row, '✕'));
      /* 🔔 е напомняне (push) до обектите в избран час — смислено е и за
         бележка. Скрито е ДРУГОТО: „Отчет за изпълнението" във формата,
         виж секция 8. */
      ok('🔔 го има (напомняне до обектите)', txt(row).indexOf('🔔') >= 0, txt(row).slice(-120));
      ok('▲ и ▼ ги има (участва в подредбата)', !!H.btnExact(row, '▲') && !!H.btnExact(row, '▼'));
    }
    /* Точният набор бутони — нищо повече. Така се хваща и „+ Подзадача"
       (renderSubtasks), и всеки бъдещ бутон, който би влязъл по погрешка. */
    if (row) {
      const btns = Array.prototype.map.call(row.querySelectorAll('button'), b => txt(b)).sort();
      ok('бутоните са точно ▲ ▼ ✏️ 🔔 ✕', JSON.stringify(btns) === JSON.stringify(['✏️', '🔔', '✕', '▲', '▼'].sort()),
        JSON.stringify(btns));
    }
    /* notice СЪС дата: пак без чекбокс и БЕЗ ред „Срок" — срок на нещо, което
       не се изпълнява, е подвеждащ. */
    const rowD = deptRow(h, 'Инвентаризация в четвъртък');
    if (ok('notice със срок също е в блока', !!rowD)) {
      ok('и тя е без чекбокс', !rowD.querySelector('input[type=checkbox]'));
      ok('и тя е без ред „Срок"', txt(rowD).indexOf('Срок') < 0, txt(rowD).slice(0, 160));
    }
    /* Задачата за изпълнение си остава с чекбокс и със срока си — контролата. */
    const row2 = deptRow(h, 'Ревизия на щанда');
    ok('КОНТРОЛА: обикновената задача пак има чекбокс', !!row2 && !!row2.querySelector('input[type=checkbox]'));
    ok('КОНТРОЛА: и пак показва „Срок"', !!row2 && txt(row2).indexOf('Срок') >= 0, row2 && txt(row2).slice(0, 160));
  }

  section('2. ✏️ отваря формата и записът минава');
  {
    const db = freshDb();
    const h = await view(db);
    const row = deptRow(h, 'Нови цени от понеделник');
    const edit = row && Array.prototype.find.call(row.querySelectorAll('button'), b => txt(b) === '✏️');
    if (ok('бутонът ✏️ е намерен', !!edit)) {
      realClick(h.w, edit, '✏️');
      const ov = h.doc.getElementById('edit-tk-ov');
      if (ok('формата за редакция се отваря', !!ov)) {
        ok('видът е „Само за информация"', h.doc.getElementById('etk-type').value === 'notice',
          h.doc.getElementById('etk-type').value);
        h.doc.getElementById('etk-title').value = 'Нови цени от вторник';
        realClick(h.w, H.btn(ov, '💾 Запази'), '💾 Запази');
        await settle(() => db.tasks.some(t => t.title === 'Нови цени от вторник'));
        const saved = db.tasks.find(t => t.id === 't-info');
        ok('заглавието е записано в базата', !!saved && saved.title === 'Нови цени от вторник', saved && saved.title);
        ok('видът остава notice', !!saved && saved.task_type === 'notice', saved && saved.task_type);
      }
    }
  }

  section('3. ✕ трие задачата');
  {
    const db = freshDb();
    const h = await view(db);
    const row = deptRow(h, 'Нови цени от понеделник');
    const del = row && H.btnExact(row, '✕');
    if (ok('бутонът ✕ е намерен', !!del)) {
      realClick(h.w, del, '✕');
      await settle(() => !db.tasks.some(t => t.id === 't-info'));
      ok('попитано е за потвърждение', h.calls.confirm.length === 1, JSON.stringify(h.calls.confirm));
      ok('задачата я няма в базата', !db.tasks.some(t => t.id === 't-info'),
        JSON.stringify(db.tasks.map(t => t.id)));
      ok('другата задача е непокътната', db.tasks.some(t => t.id === 't-do'));
    }
    /* Отказ на потвърждението не трие. */
    const db2 = freshDb();
    const h2 = await view(db2, { confirm: false });
    const row2 = deptRow(h2, 'Нови цени от понеделник');
    const w0 = writes(h2);
    realClick(h2.w, H.btnExact(row2, '✕'), '✕');
    await ticks();
    ok('при „Откажи" не се трие нищо', db2.tasks.some(t => t.id === 't-info') && writes(h2) === w0);
  }

  section('4. Магазинът вижда реда, но без бутони');
  {
    const db = freshDb();
    const h = await view(db, { user: STORE });
    const row = deptRow(h, 'Нови цени от понеделник');
    if (ok('редът се вижда и от обекта', !!row)) {
      ok('нито един бутон', row.querySelectorAll('button').length === 0,
        JSON.stringify(Array.prototype.map.call(row.querySelectorAll('button'), b => txt(b))));
      ok('няма чекбокс', !row.querySelector('input[type=checkbox]'));
      ok('описанието пак е там', txt(row).indexOf('Виж прикачения файл') >= 0);
    }
  }

  section('5. Броячите НЕ се променят');
  {
    const db = freshDb();
    /* Панелът на обекта „Задачи за седмицата" */
    const hs = await view(db, { user: STORE });
    const cnt = txt(hs.doc.querySelector('[data-dept-count="admin"]'));
    ok('панелът на обекта брои само задачата за изпълнение (0/1)', cnt === '0/1', cnt);
    ok('notice НЕ е в панела на обекта',
      txt(hs.doc.getElementById('bul-body') || hs.doc.body).indexOf('Нови цени') >= 0 &&
      !(hs.doc.querySelector('[data-dept-count="admin"]') || {}).parentElement
        .parentElement.parentElement.textContent.match(/Нови цени/),
      'проверката е за панела, не за блока');

    /* Таблицата X/18 на офиса */
    const ha = await view(db);
    await settle(() => {
      const w = ha.doc.getElementById('tasks-stat-wrap');
      return w && w.innerHTML.indexOf('Магазин') >= 0;
    });
    const stat = ha.doc.getElementById('tasks-stat-wrap');
    ok('X/18 брои 1 задача на обект, не 2', !!stat && /0\/1/.test(stat.textContent) && !/0\/2/.test(stat.textContent),
      stat && stat.textContent.replace(/\s+/g, ' ').slice(0, 200));

    /* Табът „Анализ" */
    ha.w.bulMode = 'analysis';
    if (guard('renderBulAnalysis() не хвърля', () => ha.w.renderBulAnalysis())) {
      const lbl = Array.prototype.find.call(ha.doc.querySelectorAll('div'), d => txt(d) === '📋 Задачи');
      const n = lbl && lbl.nextElementSibling ? txt(lbl.nextElementSibling) : null;
      ok('„Анализ" брои 1 задача, не 2', n === '1', String(n));
    }
  }

  section('6. ▲▼: notice участва в подредбата, и двата набора съвпадат');
  {
    const db = freshDb();
    const h = await view(db);
    const row = deptRow(h, 'Нови цени от понеделник');
    const up = row && H.btnExact(row, '▲');
    if (ok('▲ е активен (има какво да се размени)', !!up && !up.disabled)) {
      realClick(h.w, up, '▲');
      await settle(() => {
        const info = db.tasks.find(t => t.id === 't-info');
        const doTask = db.tasks.find(t => t.id === 't-do');
        return info && doTask && info.sort_order < doTask.sort_order;
      });
      const info = db.tasks.find(t => t.id === 't-info');
      const doTask = db.tasks.find(t => t.id === 't-do');
      ok('notice е вече ПРЕД задачата за изпълнение',
        info.sort_order === 1 && doTask.sort_order === 2,
        'notice=' + info.sort_order + ' do=' + doTask.sort_order);
      ok('и двата реда са записани', h.calls.patch.length >= 2, String(h.calls.patch.length));
    }
    /* Първият ред няма активен ▲ — това доказва, че индексът е от СЪЩИЯ
       набор, в който notice е вътре. */
    const h2 = await view(db);
    const first = deptRow(h2, 'Нови цени от понеделник');
    const up2 = first && H.btnExact(first, '▲');
    ok('на първа позиция ▲ е заключен', !!up2 && !!up2.disabled);
  }

  section('7. Регресия: календарът го показва, отчетите — не');
  {
    const db = freshDb();
    const h = await view(db);
    ok('notice СЪС дата си остава в Седмичния календар',
      txt(calOf(h)).indexOf('Инвентаризация в четвъртък') >= 0, txt(calOf(h)).slice(0, 200));
    ok('и в календара е без чекбокс',
      !Array.prototype.some.call(calOf(h).querySelectorAll('input[data-tid]'), cb => cb.getAttribute('data-tid') === 't-info-d'));
    /* Точно това беше счупено най-лошо: notice БЕЗ дата няма ден, тоест
       календарът никога не я показваше — а от блока беше изхвърлена. Не се
       виждаше НИКЪДЕ, значи и не можеше да се изтрие. */
    ok('notice БЕЗ дата я няма в календара (няма ден)',
      txt(calOf(h)).indexOf('Нови цени от понеделник') < 0);
    ok('...но е в блока на отдела', !!deptRow(h, 'Нови цени от понеделник'));

    /* „Днес" — ръчният бутон за днешните срокове */
    let items = null;
    if (guard('collectTodayDeadlineItems() не хвърля', () => h.w.collectTodayDeadlineItems(x => { items = x; }))) {
      await settle(() => !!items);
      const titles = (items || []).map(i => i.title || '');
      ok('notice не е в „днешните срокове"', titles.indexOf('Нови цени от понеделник') < 0, JSON.stringify(titles));
    }

    /* Дневният отчет */
    const hr = env(db);
    let daily = null;
    if (guard('collectDailyReportData() не хвърля', () => hr.w.collectDailyReportData(d => { daily = d; }))) {
      await settle(() => !!daily);
      const titles = (daily && daily.items || []).map(i => i.title);
      ok('notice не е в дневния отчет', titles.indexOf('Нови цени от понеделник') < 0, JSON.stringify(titles));
      ok('задачата за изпълнение Е в него', titles.indexOf('Ревизия на щанда') >= 0, JSON.stringify(titles));
    }

    /* Печатът: notice не е сред „Задачи за изпълнение" */
    /* Печатът на Бюлетина минава през window.open (не през #mod-print, както
       бланките в Разлики) — jsdom го няма, затова се подменя и се хваща
       написаното. */
    const hp = await view(db);
    let printed = '';
    hp.w.open = () => ({
      document: { write(x) { printed += String(x); }, close() {} },
      focus() {}, print() {}, close() {}
    });
    if (guard('printSection() не хвърля', () => hp.w.printSection('admin'))) {
      ok('печатът носи задачата за изпълнение', printed.indexOf('Ревизия на щанда') >= 0, printed.slice(0, 200));
      ok('печатът НЕ носи notice като задача за изпълнение',
        printed.indexOf('Нови цени от понеделник') < 0 && printed.indexOf('Инвентаризация в четвъртък') < 0,
        printed.slice(0, 300));
    }
  }

  /* ═══ 8. СЛЕДСТВИЯТА, НАМЕРЕНИ С КРЪСТОСАН ПРЕГЛЕД ══════════════════════
     Три места, където новият ред отваря път, какъвто дотук нямаше. */
  section('8. Отчет по notice не се предлага; „N задачи" не я брои; празна таблица не виси');
  {
    /* 8а. Формата за редакция НЕ предлага „Отчет за изпълнението" — отчет по
       задача, която не се отмята, е писмо, което по дефиниция мълчи
       (send-routed-report го отхвърля със skipped). */
    const db = freshDb();
    const h = await view(db);
    if (guard('openEditTaskModal(notice) не хвърля', () => h.w.openEditTaskModal('t-info'))) {
      const ov = h.doc.getElementById('edit-tk-ov');
      if (ok('формата се отваря', !!ov)) {
        ok('няма бутон „+ Насрочи"', !H.btn(ov, '+ Насрочи'), txt(h.doc.getElementById('etk-tr') || {}));
        ok('вместо това обяснява защо', txt(ov).indexOf('не важи за „Само за информация"') >= 0,
          txt(h.doc.getElementById('etk-tr') || {}).slice(0, 140));
      }
    }
    /* КОНТРОЛА: при работната задача секцията си е там. */
    const h2 = await view(db);
    if (guard('openEditTaskModal(работна) не хвърля', () => h2.w.openEditTaskModal('t-do'))) {
      ok('КОНТРОЛА: работната задача пак предлага „+ Насрочи"',
        !!H.btn(h2.doc.getElementById('edit-tk-ov'), '+ Насрочи'));
    }

    /* 8б. Броят в push-а „бюлетинът е публикуван" не включва бележките. */
    const h3 = await view(db);
    ok('bulWeekTasks() брои само задачата за изпълнение', h3.w.bulWeekTasks().length === 1,
      JSON.stringify(h3.w.bulWeekTasks().map(t => t.title)));
    ok('а bulTasks съдържа и трите (показват се)', h3.w.bulTasks.length === 3, String(h3.w.bulTasks.length));

    /* 8в. Бюлетин само с notice: таблицата X/18 няма какво да покаже и трябва
       да се ПОЧИСТИ, не да остане с „⏳ Зареждане". */
    const dbOnly = freshDb();
    dbOnly.tasks = dbOnly.tasks.filter(t => taskTypeOf(t) === 'notice');
    const h4 = await view(dbOnly);
    await settle(() => {
      const wrap = h4.doc.getElementById('tasks-stat-wrap');
      return !wrap || wrap.innerHTML.indexOf('Зареждане') < 0;
    });
    const wrap4 = h4.doc.getElementById('tasks-stat-wrap');
    ok('няма останала въртележка „⏳ Зареждане"',
      !wrap4 || wrap4.innerHTML.indexOf('Зареждане') < 0,
      wrap4 && wrap4.innerHTML.slice(0, 120));
    ok('но самите notice пак се виждат в блока', !!deptRow(h4, 'Нови цени от понеделник'));
  }

  report();
})();
