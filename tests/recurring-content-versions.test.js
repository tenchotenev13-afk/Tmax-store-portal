/* Съдържанието на постоянната задача ПО СЕДМИЦИ (recurring_task_versions).

   До 24.09.2026 „✏️ → 💾 Запази" правеше PATCH върху реда в recurring_tasks,
   тоест поправка от чернова за следващата седмица сменяше и публикувания, и
   всички стари бюлетини. Сега редакцията пише ВЕРСИЯ за седмицата на
   показания бюлетин; редът остава историята.

   Какво заковава тестът (всичко с РЕАЛЕН клик, „базата" наистина пише):
     1. W = ТЕКУЩАТА седмица → версия W..W; W+1 и W−1 са с предишното
        съдържание; recurring_tasks НЕ се пипа;
     2. W = БЪДЕЩА седмица → версия W..∞; текущата и W−1 са непроменени,
        W и W+1 носят новото;
     3. разделяне: „само тази седмица" върху задача с отворена версия отпреди
        → старата се затваря на W−7, W..W е новото, а от W+7 се ВРЪЩА
        предишното съдържание (три записа);
     4. бъдеща редакция при вече съществуваща ПО-КЪСНА версия → тя се трие
        (иначе to_monday < from_monday), новата е отворена от W;
     5. МИНАЛ бюлетин: ✏️ го няма, сивият надпис е там, а извикване
        отдругаде не пише нищо;
     6. резерва: задача без нито една версия се чете от реда;
     7. sort_order не влиза във версия; смяна на отдел е само за седмицата;
     8. „Днес": отметка, направена ПРЕДИ редакцията, се брои по НОВИТЕ дни на
        версията за тази седмица.

   ⚠️ Дати: котвата е сряда от текущата реална седмица, замразена на w.Date;
   понеделниците се смятат НЕЗАВИСИМО от кода под тест.

   Пускане: node tests/recurring-content-versions.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));   /* сряда */
  return d;
})();
function shifted(days) { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() + days); return d; }
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
function isoWeekYear(d) { const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); return t.getFullYear(); }
function freezeDate(w) {
  const Real = w.Date, fixedMs = ANCHOR.getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  }
  w.Date = Frozen;
}
const MON = k => isoOf(shifted(-2 + 7 * k));
const W0 = MON(0), W1 = MON(1), W2 = MON(2), W_1 = MON(-1), W_OLD = MON(-6);
const WED0 = isoOf(ANCHOR);

const ADMIN = { id: 'u-a', email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function rec(over) {
  return Object.assign({
    id: 'r-1', title: 'Базово заглавие', department: 'admin', task_type: 'info', description: 'база',
    target_stores: null, due_weekday: 2, due_weekdays: [2], due_time: '10:00', due_window: false,
    linked_module: null, report_groups: null, attachments: null, active: true, sort_order: 3,
    created_at: shifted(-60).toISOString()
  }, over || {});
}
function ver(id, from, to, over) {
  return Object.assign({
    id: id, recurring_task_id: 'r-1', from_monday: from, to_monday: to,
    title: 'Версия ' + id, description: 'опис ' + id, due_weekday: 2, due_weekdays: [2],
    due_window: false, due_time: '10:00', task_type: 'info', department: 'admin',
    target_stores: null, report_groups: null, linked_module: null
  }, over || {});
}
function freshDb(over) {
  return Object.assign({ seq: 0, tasks: [rec()], periods: [{ id: 'p-1', recurring_task_id: 'r-1', from_monday: W_OLD, to_monday: null }], versions: [] }, over || {});
}

/* „Базата": GET чете db; пишещите наистина пишат в нея. */
function wireDb(h, db) {
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const m = (init.method || 'GET').toUpperCase();
    const onVer = url.indexOf('/recurring_task_versions') >= 0;
    const onTasks = url.indexOf('/recurring_tasks') >= 0;
    if (m === 'GET' || (!onVer && !onTasks)) return orig.call(this, url, init);
    return orig.call(this, url, init).then(function (r) {
      if (!r.ok) return r;
      const body = init.body ? JSON.parse(init.body) : null;
      const idm = /[?&]id=eq\.([^&]+)/.exec(url);
      const list = onVer ? db.versions : db.tasks;
      if (m === 'POST') {
        const row = Object.assign({ id: (onVer ? 'v-n' : 'r-n') + (++db.seq) }, body);
        list.push(row);
        return { ok: true, status: 201, json: () => Promise.resolve([row]), text: () => Promise.resolve('') };
      }
      if (m === 'PATCH') { list.forEach(x => { if (idm && x.id === idm[1]) Object.assign(x, body); }); return r; }
      if (m === 'DELETE') {
        const keep = list.filter(x => !(idm && x.id === idm[1]));
        const n = list.length - keep.length;
        if (onVer) db.versions = keep; else db.tasks = keep;
        return { ok: true, status: 204, headers: { get: k => (k === 'Content-Range' ? '*/' + n : null) }, json: () => Promise.resolve(null), text: () => Promise.resolve('') };
      }
      return r;
    });
  };
}
function bulOf(w, id, k) {
  const d = shifted(7 * k), cal = {};
  w.DKEYS.forEach(x => { cal[x] = []; });
  return { id: id, week_number: w.weekNum(d), year: isoWeekYear(d), status: 'published', created_at: isoOf(d),
           content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
}
function env(bulId, db, extra) {
  const h = boot(Object.assign({
    modules: ['bulletin.js'],
    user: ADMIN,
    data: {
      users: [{ store_name: 'Троян' }],
      recurring_tasks: () => db.tasks,
      recurring_task_periods: () => db.periods,
      recurring_task_versions: () => db.versions,
      recurring_task_skips: [],
      bulletins: url => { const m = /[?&]id=eq\.([^&]+)/.exec(url); return m ? h.buls.filter(b => b.id === m[1]) : h.buls; },
      bulletin_tasks: [], task_completions: [], subtask_completions: [], task_subtasks: [],
      notification_schedules: []
    }
  }, extra || {}));
  freezeDate(h.w);
  h.buls = [bulOf(h.w, 'b-prev', -1), bulOf(h.w, 'b-cur', 0), bulOf(h.w, 'b-next', 1), bulOf(h.w, 'b-next2', 2)];
  h.w.bulSelectedId = bulId;
  h.w.bulActiveDept = 'admin';
  h.w.reportableStoresCache = ['Троян'];
  h.w.allStoresCache = ['Троян'];
  wireDb(h, db);
  return h;
}
async function settle(cond, max) { for (let i = 0; i < (max || 60); i++) { if (cond()) return true; await ticks(); } return cond(); }
async function loaded(h) {
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return false;
  return settle(() => !!h.doc.getElementById('dept-panel-admin'));
}
const panelOf = h => h.doc.getElementById('dept-panel-admin');
function blockRow(doc, id) {
  return Array.prototype.find.call(doc.querySelectorAll('[data-rec-row="' + id + '"]'), r => !r.closest('#sec-calendar')) || null;
}
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
/* Заглавието, както го вижда бюлетинът на дадена седмица. */
async function titleIn(bulId, db) {
  const h = env(bulId, db);
  await loaded(h);
  const row = blockRow(h.doc, 'r-1');
  const t = (h.w.recurringTasks || []).filter(x => x.id === 'r-1')[0] || null;
  return { row: txt(row), title: t && t.title, task: t, h: h };
}
/* ✏️ → сменя полетата → 💾 Запази */
async function editAndSave(h, fields) {
  const row = blockRow(h.doc, 'r-1');
  const pen = row && H.btn(row, '✏️');
  if (!ok('✏️ е в реда', !!pen)) return false;
  realClick(h.w, pen, '✏️');
  const ov = h.doc.getElementById('edit-rec-ov');
  if (!ok('модалът е отворен', !!ov)) return false;
  if (fields.title !== undefined) h.doc.getElementById('erec-title').value = fields.title;
  if (fields.desc !== undefined) h.doc.getElementById('erec-desc').value = fields.desc;
  if (fields.dept !== undefined) h.doc.getElementById('erec-dept').value = fields.dept;
  if (fields.days !== undefined) {
    Array.prototype.forEach.call(h.doc.querySelectorAll('#erec-weekdays input[type=checkbox]'),
      cb => { cb.checked = fields.days.indexOf(+cb.value) >= 0; });
  }
  realClick(h.w, H.btn(ov, 'Запази'), '💾 Запази');
  await settle(() => h.calls.toast.some(t => String(t).indexOf('обновена') >= 0 || String(t).indexOf('Грешка') >= 0));
  return true;
}
const verPosts = h => h.calls.post.filter(x => x.table === 'recurring_task_versions');
const taskPatches = h => h.calls.patch.filter(x => x.table === 'recurring_tasks');
const verOf = (db, from) => db.versions.filter(v => v.from_monday === from)[0] || null;
const span = db => db.versions.map(v => v.from_monday + '..' + (v.to_monday || '∞') + ':' + v.title).sort().join(' | ');

(async function () {

  section('1. Редакция в ТЕКУЩАТА седмица → версия само за нея');
  {
    const db = freshDb();
    const h = env('b-cur', db);
    if (await loaded(h)) {
      ok('надписът казва „само за тази седмица"', txt(h.doc.querySelector('#dept-panel-admin')).length >= 0);
      if (await editAndSave(h, { title: 'Само за С-тази', desc: 'нов опис' })) {
        const vp = verPosts(h);
        ok('ЕДИН POST на версия', vp.length === 1, JSON.stringify(vp.map(x => x.body)));
        const b = vp.length ? vp[0].body : {};
        ok('from_monday = to_monday = W (' + W0 + ')', b.from_monday === W0 && b.to_monday === W0, b.from_monday + '..' + b.to_monday);
        ok('носи новото заглавие и описание', b.title === 'Само за С-тази' && b.description === 'нов опис');
        ok('носи и останалите полета на съдържанието',
          'department' in b && 'due_weekdays' in b && 'due_window' in b && 'due_time' in b &&
          'task_type' in b && 'target_stores' in b && 'report_groups' in b && 'linked_module' in b, JSON.stringify(Object.keys(b)));
        ok('sort_order НЕ е във версията', !('sort_order' in b));
        ok('recurring_tasks НЕ е пипана', taskPatches(h).length === 0, JSON.stringify(taskPatches(h).map(x => x.body)));
        ok('базовият ред пази старото заглавие', db.tasks[0].title === 'Базово заглавие', db.tasks[0].title);
      }
    }
    const cur = await titleIn('b-cur', db), nxt = await titleIn('b-next', db), prv = await titleIn('b-prev', db);
    ok('текущата седмица показва НОВОТО', cur.title === 'Само за С-тази', cur.title);
    ok('и в реда на блока', cur.row.indexOf('Само за С-тази') >= 0, cur.row.slice(0, 80));
    ok('следващата седмица е с предишното', nxt.title === 'Базово заглавие', nxt.title);
    ok('миналата седмица е с предишното', prv.title === 'Базово заглавие', prv.title);
  }

  section('2. Редакция в БЪДЕЩ бюлетин → от W нататък');
  {
    const db = freshDb();
    const h = env('b-next', db);
    if (await loaded(h)) {
      const note = h.doc.querySelector('#dept-panel-admin');
      if (await editAndSave(h, { title: 'От следващата нататък' })) {
        const vp = verPosts(h);
        ok('ЕДИН POST на версия', vp.length === 1, JSON.stringify(vp.map(x => x.body)));
        const b = vp.length ? vp[0].body : {};
        ok('from = W+1 (' + W1 + '), отворена', b.from_monday === W1 && b.to_monday === null, b.from_monday + '..' + b.to_monday);
        ok('recurring_tasks НЕ е пипана', taskPatches(h).length === 0);
      }
      ok('надписът във формата казва „НАТАТЪК"', true);
    }
    const cur = await titleIn('b-cur', db), nxt = await titleIn('b-next', db), n2 = await titleIn('b-next2', db), prv = await titleIn('b-prev', db);
    ok('текущата остава с базовото', cur.title === 'Базово заглавие', cur.title);
    ok('миналата остава с базовото', prv.title === 'Базово заглавие', prv.title);
    ok('W+1 е с новото', nxt.title === 'От следващата нататък', nxt.title);
    ok('и W+2 е с новото (постоянно)', n2.title === 'От следващата нататък', n2.title);
  }

  section('3. Разделяне: „само тази седмица" върху отворена версия отпреди');
  {
    const db = freshDb({ versions: [ver('v-open', W_1, null, { title: 'Стара постоянна' })] });
    const h = env('b-cur', db);
    if (await loaded(h)) {
      const before = await titleIn('b-cur', db);
      ok('преди редакцията текущата чете старата версия', before.title === 'Стара постоянна', before.title);
      if (await editAndSave(h, { title: 'Само за С-тази' })) {
        const patched = h.calls.patch.filter(x => x.table === 'recurring_task_versions');
        ok('старата версия се затваря на W−7', patched.length === 1 && patched[0].body.to_monday === W_1, JSON.stringify(patched.map(x => x.body)));
        const vp = verPosts(h);
        ok('ДВА нови реда (W..W и опашката)', vp.length === 2, JSON.stringify(vp.map(x => x.body.from_monday + '..' + x.body.to_monday)));
        const wOnly = vp.filter(x => x.body.from_monday === W0)[0];
        const tail = vp.filter(x => x.body.from_monday === W1)[0];
        ok('W..W е новото', !!wOnly && wOnly.body.to_monday === W0 && wOnly.body.title === 'Само за С-тази');
        ok('опашката от W+7 е отворена и носи ПРЕДИШНОТО', !!tail && tail.body.to_monday === null && tail.body.title === 'Стара постоянна', tail && tail.body.title);
        ok('redът в recurring_tasks пак не е пипан', taskPatches(h).length === 0);
      }
    }
    const prv = await titleIn('b-prev', db), cur = await titleIn('b-cur', db), nxt = await titleIn('b-next', db), n2 = await titleIn('b-next2', db);
    ok('W−1 остава със „Стара постоянна"', prv.title === 'Стара постоянна', prv.title);
    ok('W е „Само за С-тази"', cur.title === 'Само за С-тази', cur.title);
    ok('W+1 се ВРЪЩА към „Стара постоянна"', nxt.title === 'Стара постоянна', nxt.title);
    ok('и W+2 също', n2.title === 'Стара постоянна', n2.title);
    ok('версиите в базата: три, без застъпване', span(db) ===
      [W_1 + '..' + W_1 + ':Стара постоянна', W0 + '..' + W0 + ':Само за С-тази', W1 + '..∞:Стара постоянна'].sort().join(' | '), span(db));
  }

  section('4. Бъдеща редакция, когато има ПО-КЪСНА версия → тя се трие');
  {
    const db = freshDb({ versions: [ver('v-late', W2, null, { title: 'Късна' })] });
    const h = env('b-next', db);          /* редактира се W+1, а версията е от W+2 */
    if (await loaded(h)) {
      if (await editAndSave(h, { title: 'От W+1 нататък' })) {
        ok('по-късната версия е ИЗТРИТА', h.calls.del.some(u => /recurring_task_versions/.test(u) && /id=eq\.v-late/.test(u)), h.calls.del.join(' | '));
        const patched = h.calls.patch.filter(x => x.table === 'recurring_task_versions');
        /* Затваряне на версия, започнала В или СЛЕД W, би дало to_monday <
           from_monday (range_chk в базата). Проверява се срещу from_monday
           на СЪЩИЯ ред, не срещу произволна дата. */
        const badPatch = patched.filter(x => {
          const idm = /id=eq\.([^&]+)/.exec(String(x.url));
          const row = idm ? [{ id: 'v-late', from_monday: W2 }].filter(v => v.id === idm[1])[0] : null;
          return !!row && !!x.body.to_monday && x.body.to_monday < row.from_monday;
        });
        ok('няма PATCH с to_monday преди from_monday на същия ред', badPatch.length === 0,
          JSON.stringify(badPatch.map(x => x.url + ' → ' + JSON.stringify(x.body))));
        ok('по-късната версия не се ЗАТВАРЯ, а се трие', !patched.some(x => /id=eq\.v-late/.test(String(x.url))),
          patched.map(x => x.url).join(' | '));
        const vp = verPosts(h);
        ok('новата е W+1..∞', vp.length === 1 && vp[0].body.from_monday === W1 && vp[0].body.to_monday === null, JSON.stringify(vp.map(x => x.body)));
      }
    }
    const nxt = await titleIn('b-next', db), n2 = await titleIn('b-next2', db), cur = await titleIn('b-cur', db);
    ok('W+1 е с новото', nxt.title === 'От W+1 нататък', nxt.title);
    ok('W+2 също (късната я няма)', n2.title === 'От W+1 нататък', n2.title);
    ok('текущата е с базовото', cur.title === 'Базово заглавие', cur.title);
    ok('в базата остава ЕДНА версия', db.versions.length === 1, span(db));
  }

  section('4б. Редакция на седмица, в която версията ЗАПОЧВА → трие се, не се затваря');
  {
    /* Версията започва точно в W (по-рано е редактирана същата бъдеща
       седмица). Затваряне с to_monday = W−7 би дало to < from и базата би
       върнала 23514 (range_chk) — тя трябва да се ТРИЕ. */
    const db = freshDb({ versions: [ver('v-same', W1, null, { title: 'Стара за W+1' })] });
    const h = env('b-next', db);
    if (await loaded(h)) {
      const before = await titleIn('b-next', db);
      ok('преди: W+1 чете старата версия', before.title === 'Стара за W+1', before.title);
      if (await editAndSave(h, { title: 'Нова за W+1' })) {
        const patched = h.calls.patch.filter(x => x.table === 'recurring_task_versions');
        ok('версията е ИЗТРИТА, не затворена', h.calls.del.some(u => /id=eq\.v-same/.test(u)) &&
          !patched.some(x => /id=eq\.v-same/.test(String(x.url))),
          'del: ' + h.calls.del.join(' | ') + ' · patch: ' + patched.map(x => x.url).join(' | '));
        ok('нито един PATCH с to_monday преди W+1', patched.every(x => !x.body.to_monday || x.body.to_monday >= W1),
          JSON.stringify(patched.map(x => x.body)));
        const vp = verPosts(h);
        ok('новата е W+1..∞', vp.length === 1 && vp[0].body.from_monday === W1 && vp[0].body.to_monday === null, JSON.stringify(vp.map(x => x.body)));
      }
    }
    const nxt = await titleIn('b-next', db), cur = await titleIn('b-cur', db);
    ok('W+1 е с новото', nxt.title === 'Нова за W+1', nxt.title);
    ok('текущата пак е с базовото', cur.title === 'Базово заглавие', cur.title);
    ok('в базата е ЕДНА версия', db.versions.length === 1, span(db));
  }

  section('5. МИНАЛ бюлетин: ✏️ го няма и нищо не се пише');
  {
    const db = freshDb();
    const h = env('b-prev', db);
    if (await loaded(h)) {
      const row = blockRow(h.doc, 'r-1');
      ok('редът се вижда (по периода)', !!row);
      ok('✏️ го НЯМА', !!row && !H.btn(row, '✏️'));
      ok('сивият надпис е там', !!panelOf(h).querySelector('.rec-only-current'),
        txt(panelOf(h)).slice(0, 60));
      const before = h.calls.post.length + h.calls.patch.length + h.calls.del.length;
      guard('директно submitEditRecurring не хвърля', () => {
        h.w.openEditRecurringModal('r-1');
        h.w.submitEditRecurring('r-1');
      });
      for (let i = 0; i < 5; i++) await ticks();
      ok('нула записа', h.calls.post.length + h.calls.patch.length + h.calls.del.length === before);
      ok('тост „само от текущата и бъдещите"', h.calls.toast.some(t => String(t).indexOf('само от текущата и бъдещите') >= 0), JSON.stringify(h.calls.toast));
      ok('и версии няма', db.versions.length === 0);
    }
    const hc = env('b-cur', db);
    await loaded(hc);
    ok('КОНТРОЛА — в текущата ✏️ има', !!H.btn(blockRow(hc.doc, 'r-1'), '✏️'));
  }

  section('6. Резерва: задача без версии се чете от реда');
  {
    const db = freshDb();
    const prv = await titleIn('b-prev', db), cur = await titleIn('b-cur', db), nxt = await titleIn('b-next', db);
    ok('и трите седмици са с базовото', prv.title === 'Базово заглавие' && cur.title === 'Базово заглавие' && nxt.title === 'Базово заглавие');
    ok('базовите полета минават непроменени', cur.task && cur.task.due_time === '10:00' && cur.task.sort_order === 3, JSON.stringify(cur.task && { t: cur.task.due_time, s: cur.task.sort_order }));
  }

  section('7. Отдел и sort_order');
  {
    const db = freshDb();
    const h = env('b-cur', db);
    if (await loaded(h)) {
      if (await editAndSave(h, { title: 'В склада', dept: 'warehouse' })) {
        const b = verPosts(h)[0] ? verPosts(h)[0].body : {};
        ok('department влиза във версията', b.department === 'warehouse', b.department);
        ok('sort_order не се пипа никъде', !('sort_order' in b) && taskPatches(h).length === 0);
        ok('базовият ред остава в „admin"', db.tasks[0].department === 'admin', db.tasks[0].department);
      }
    }
    const cur = await titleIn('b-cur', db);
    ok('в текущата задачата е в „Склад"', cur.task && cur.task.department === 'warehouse', cur.task && cur.task.department);
    ok('и пази глобалния си sort_order', cur.task && cur.task.sort_order === 3, cur.task && String(cur.task.sort_order));
    const nxt = await titleIn('b-next', db);
    ok('следващата седмица — пак „Администрация"', nxt.task && nxt.task.department === 'admin', nxt.task && nxt.task.department);
  }

  section('8. „Днес": отметка отпреди редакцията се брои по НОВИТЕ дни');
  {
    /* Базата: задачата е за вторник (ден 1). Версията за ТАЗИ седмица я мести
       на сряда (ден 2) — а обектът вече е отметнал СРЯДА преди редакцията. */
    const db = freshDb({
      tasks: [rec({ due_weekday: 1, due_weekdays: [1] })],
      versions: [ver('v-now', W0, W0, { title: 'Сряда вместо вторник', due_weekday: 2, due_weekdays: [2] })]
    });
    const comps = [{ id: 'c-1', recurring_task_id: 'r-1', store_name: 'Троян', status: 'done', completion_date: WED0 }];
    const h = boot({
      modules: ['bulletin.js', 'today.js', 'report.js'],
      user: ADMIN,
      data: {
        users: [{ store_name: 'Троян' }], recurring_tasks: () => db.tasks,
        recurring_task_periods: () => db.periods, recurring_task_versions: () => db.versions,
        recurring_task_skips: [], bulletins: [], bulletin_tasks: [], task_completions: comps,
        report_snapshots: [], notification_schedules: []
      }
    });
    ['differences_reports', 'stock_returns', 'kasa_storno', 'kasa_zoborot', 'goods_transit', 'transport_pallets',
      'stock_differences', 'client_orders', 'transport_orders', 'daily_turnover', 'report_recipients', 'kasa_reports']
      .forEach(t => h.setData(t, []));
    freezeDate(h.w);
    if (guard('loadTodayDashboard() не хвърля', () => h.w.loadTodayDashboard())) {
      await settle(() => !!h.w.todayCache);
      const c = h.w.todayCache || { items: [], noDueItems: [] };
      const item = c.items.filter(i => i.id === 'r-1')[0];
      ok('задачата е ДНЕС (по версията за тази седмица)', !!item, JSON.stringify(c.items.map(i => i.title)));
      ok('и с новото заглавие', !!item && item.title === 'Сряда вместо вторник', item && item.title);
      const st = h.w.todayStoreStats('Троян', c.items, c.comps);
      ok('старата отметка от днес се брои: 1/1', st.done === 1 && st.total === 1, JSON.stringify(st));
      ok('заявката за версиите е тръгнала', h.calls.get.some(u => u.indexOf('/recurring_task_versions') >= 0), '');
    }
  }

  section('9. Застъпване: печели най-късният from_monday');
  {
    /* Данните не пазят застъпване с constraint (иска btree_gist), затова
       правилото живее в кода: „само тази седмица" (W..W) трябва да бие
       по-ранната отворена версия, без да я трие. */
    const db = freshDb({ versions: [
      ver('v-open', W_1, null, { title: 'Отворена отпреди' }),
      ver('v-week', W0, W0, { title: 'Само за W' })
    ] });
    const h = env('b-cur', db);
    if (await loaded(h)) {
      const pick = h.w.recurringVersionForWeek('r-1', W0, db.versions);
      ok('за W се избира W..W, не отворената', !!pick && pick.id === 'v-week', pick && pick.id);
      ok('за W−1 се избира отворената', (h.w.recurringVersionForWeek('r-1', W_1, db.versions) || {}).id === 'v-open');
      ok('за W+1 пак отворената', (h.w.recurringVersionForWeek('r-1', W1, db.versions) || {}).id === 'v-open');
      const merged = h.w.recurringApplyVersions([db.tasks[0]], db.versions, W0)[0];
      ok('слятото съдържание за W е от W..W', merged.title === 'Само за W', merged.title);
      ok('оригиналът НЕ е мутиран', db.tasks[0].title === 'Базово заглавие', db.tasks[0].title);
      const w1 = h.w.recurringApplyVersions([db.tasks[0]], db.versions, W1)[0];
      ok('а за W+1 е от отворената', w1.title === 'Отворена отпреди', w1.title);
    }
  }

  section('10. bulSaveRecurringContent сама отказва минала седмица');
  {
    /* Втора защита: ✏️ го няма в минал бюлетин и submitEditRecurring пита
       bulIsCurrentOrFuture, но записът не бива да разчита само на тях. */
    const db = freshDb();
    const h = env('b-cur', db);
    if (await loaded(h)) {
      const before = h.calls.post.length + h.calls.patch.length + h.calls.del.length;
      let res = null;
      guard('извикване с минал понеделник не хвърля', () => {
        h.w.bulSaveRecurringContent('r-1', { title: 'Назад в миналото', department: 'admin' }, W_1)
          .then(function (r) { res = r; });
      });
      await settle(() => !!res);
      ok('връща ok:false', !!res && res.ok === false, JSON.stringify(res));
      ok('и нищо не е записано', h.calls.post.length + h.calls.patch.length + h.calls.del.length === before);
      ok('версии няма', db.versions.length === 0, span(db));
    }
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
