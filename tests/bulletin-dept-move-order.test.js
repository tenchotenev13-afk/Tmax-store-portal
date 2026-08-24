/* Бюлетин — sort_order при смяна на отдел.

   Заварено: задача, преместена в друг отдел, носеше със себе си стария си
   sort_order. Той обаче е позиция в подредбата на СТАРИЯ отдел и в новия
   означава нещо друго — задача с order 7 попадаше между 6 и 8 на новия
   списък, тоест на случайно място, вместо най-отдолу, където я търси човекът,
   който току-що я е преместил.

   Два пътя сменят отдела и двата боледуваха от едно и също:
     taskTabDrop()    — влачене върху таба на друг отдел; PATCH пращаше само
                        {department}
     submitEditTask() — падащото меню „Отдел" в модала за редакция; PATCH
                        включваше department, но не и sort_order

   Поправката смята max(sort_order) в ЦЕЛЕВИЯ отдел и праща maxOrder+1, точно
   както submitTask() го прави за нова задача.

   По-важен от самата поправка е случай 4: в submitEditTask sort_order влиза
   САМО когато отделът наистина се сменя. Ако влизаше винаги, всяко отваряне и
   запазване на задача (смяна на заглавие, срок, магазини) щеше тихо да я
   хвърля най-отдолу в собствения ѝ отдел. Затова се проверява с
   hasOwnProperty, а не с истинност — 0 е валидна стойност за sort_order и
   if(body.sort_order) би подминал точно грешката, която търсим.

   Drag&drop НЕ се симулира през fire(): ondrop подава event, какъвто
   harness-ът няма, и preventDefault() гърми. Затова се викат самите
   taskDragStart/taskTabDrop с минимално подправено събитие — точно каквото
   браузърът би подал.

   Пускане: node tests/bulletin-dept-move-order.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, section, report, ticks, dayOffset } = H;

/* ── Данни ──────────────────────────────────────────────────────────────── */

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const STORES = ['Троян', 'Габрово', 'Централен офис'].map(n => ({ name: n }));
const USERS = ['Троян', 'Габрово'].map(n => ({ store_name: n }));

const DUE = dayOffset(0);

function task(id, dept, order, over) {
  return Object.assign({
    id: id, title: 'Задача ' + id, department: dept, sort_order: order,
    task_type: 'info', due_dates: [DUE], target_stores: null,
    description: '', report_groups: null, linked_module: null, created_by: 'Админ'
  }, over || {});
}

/* trade: единствената задача, с нарочно ВИСОК sort_order — ако поправката я
   няма, тя влиза в warehouse със 7 и застава над задача 3.
   warehouse: три задачи, max sort_order = 3 → очаква се 4.
   admin: празен → очаква се 1. */
function TASKS() {
  return [
    task('t-1', 'trade', 7),
    task('w-1', 'warehouse', 1),
    task('w-2', 'warehouse', 2),
    task('w-3', 'warehouse', 3)
  ];
}

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js'],
    user: opts.user || ADMIN,
    data: { stores: STORES, users: USERS, bulletin_tasks: [], bulletins: [] },
    fail: opts.fail
  });
  const w = h.w;

  const yr = new Date().getFullYear();
  const wk = w.weekNum(new Date());
  const cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });

  w.curBul = {
    id: 'b-1', week_number: wk, year: yr, status: 'published',
    content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } }
  };
  w.bulListCache = [];
  w.bulTasks = opts.tasks || TASKS();
  w.recurringTasks = [];
  w.bulComps = [];
  w.recurringComps = [];
  w.bulMode = 'edit';
  w.bulActiveDept = 'trade';

  return Promise.all([w.loadAllStores(), w.loadReportableStores()]).then(() => {
    w.renderBulletin();
    return h;
  });
}

/* Влачи задача върху таба на отдел — както го прави браузърът. */
function dragToTab(h, taskId, destDept) {
  const w = h.w, doc = h.doc;
  const el = doc.querySelector('[data-tid="' + taskId + '"]');
  if (!el) throw new Error('задача ' + taskId + ' не е рендерирана (няма data-tid)');
  const btn = doc.getElementById('dtab-' + destDept);
  if (!btn) throw new Error('няма таб за отдел ' + destDept);
  w.taskDragStart({ dataTransfer: { effectAllowed: '', setData: function () {} } }, el);
  w.taskTabDrop({ preventDefault: function () {} }, btn);
}

/* PATCH-овете към конкретна задача. calls.patch[i].body е парснатият JSON. */
function patchesFor(h, taskId) {
  return h.calls.patch.filter(p => p.url.indexOf('id=eq.' + taskId) >= 0);
}

/* Бутонът „Запази" в модала за редакция. */
function saveBtn(doc) {
  return Array.prototype.slice.call(doc.querySelectorAll('#edit-tk-ov button'))
    .find(b => (b.textContent || '').indexOf('Запази') >= 0);
}

(async function run() {

  /* ═══ 0. Средата ══════════════════════════════════════════════════════ */
  section('0. Средата се вдига и задачата е влачима');
  {
    const h = await env();
    ok('bulletin.js е зареден', typeof h.w.taskTabDrop === 'function');
    ok('подредбата се смята от bulTasks, без нова заявка към базата',
      !h.calls.get.some(u => u.indexOf('bulletin_tasks') >= 0),
      h.calls.get.join(' | '));
    ok('задачата е рендерирана с data-tid',
      !!h.doc.querySelector('[data-tid="t-1"]'));
    ok('табовете на трите отдела съществуват',
      ['trade', 'warehouse', 'admin'].every(d => !!h.doc.getElementById('dtab-' + d)));
  }

  /* ═══ 1. Влачене в отдел с максимален sort_order 3 ════════════════════ */
  section('1. Влачене в отдел със задачи -> най-отдолу (max 3 -> 4)');
  {
    const h = await env();
    dragToTab(h, 't-1', 'warehouse');
    await ticks(6);

    const ps = patchesFor(h, 't-1');
    if (ok('има точно един PATCH за задачата', ps.length === 1,
      JSON.stringify(h.calls.patch))) {
      const b = ps[0].body;
      ok('PATCH носи новия отдел', b.department === 'warehouse', JSON.stringify(b));
      ok('PATCH носи и sort_order', b.hasOwnProperty('sort_order'), JSON.stringify(b));
      ok('sort_order е max+1 = 4', b.sort_order === 4, String(b.sort_order));
      ok('старият sort_order (7) не се влачи със задачата', b.sort_order !== 7);
    }

    const t = h.w.bulTasks.find(x => x.id === 't-1');
    ok('локалният обект е обновен — отдел', t.department === 'warehouse');
    ok('локалният обект е обновен — sort_order', t.sort_order === 4, String(t.sort_order));
    ok('задачата вече е последна в новия отдел',
      h.w.bulTasks.filter(x => x.department === 'warehouse')
        .every(x => x.id === 't-1' || (x.sort_order || 0) < t.sort_order));
    ok('има потвърждение към потребителя',
      h.calls.toast.some(m => String(m).indexOf('Преместено') >= 0),
      JSON.stringify(h.calls.toast));
  }

  /* ═══ 2. Влачене в ПРАЗЕН отдел ═══════════════════════════════════════ */
  section('2. Влачене в празен отдел -> sort_order 1');
  {
    const h = await env();
    dragToTab(h, 't-1', 'admin');
    await ticks(6);

    const ps = patchesFor(h, 't-1');
    if (ok('има PATCH', ps.length === 1, JSON.stringify(h.calls.patch))) {
      const b = ps[0].body;
      ok('отделът е admin', b.department === 'admin', JSON.stringify(b));
      ok('sort_order е 1, не 0 и не 8', b.sort_order === 1, String(b.sort_order));
    }
    ok('локалният обект е с 1', h.w.bulTasks.find(x => x.id === 't-1').sort_order === 1);
  }

  /* ═══ 2б. Пускане върху СЪЩИЯ отдел ══════════════════════════════════ */
  section('2б. Пускане върху собствения отдел — нищо не се праща');
  {
    const h = await env();
    dragToTab(h, 't-1', 'trade');
    await ticks(6);
    ok('няма PATCH', patchesFor(h, 't-1').length === 0,
      JSON.stringify(h.calls.patch));
    ok('sort_order е непокътнат', h.w.bulTasks.find(x => x.id === 't-1').sort_order === 7);
  }

  /* ═══ 2в. Провален PATCH ══════════════════════════════════════════════ */
  section('2в. Провален PATCH — локалният обект не лъже');
  {
    const h = await env({ fail: { PATCH: true } });
    dragToTab(h, 't-1', 'warehouse');
    await ticks(6);
    const t = h.w.bulTasks.find(x => x.id === 't-1');
    ok('отделът НЕ е сменен локално', t.department === 'trade');
    ok('sort_order НЕ е сменен локално', t.sort_order === 7, String(t.sort_order));
    ok('има съобщение за грешка',
      h.calls.toast.some(m => String(m).indexOf('Грешка') >= 0),
      JSON.stringify(h.calls.toast));
    ok('заявката е отчетена като провалена', h.calls.notOk.length >= 1);
  }

  /* ═══ 3. Редакция СЪС смяна на отдел ══════════════════════════════════ */
  section('3. submitEditTask със смяна на отдел -> sort_order влиза');
  {
    const h = await env();
    const w = h.w, doc = h.doc;

    w.openEditTaskModal('t-1');
    await ticks(3);
    const sel = doc.getElementById('etk-dept');
    if (ok('модалът за редакция е отворен', !!sel)) {
      ok('падащото меню показва текущия отдел', sel.value === 'trade', sel.value);
      sel.value = 'warehouse';

      const save = saveBtn(doc);
      if (ok('бутонът за запазване съществува', !!save)) {
        realClick(w, save);
        await ticks(6);

        const ps = patchesFor(h, 't-1');
        if (ok('има PATCH от редакцията', ps.length === 1,
          JSON.stringify(h.calls.patch))) {
          const b = ps[0].body;
          ok('PATCH носи новия отдел', b.department === 'warehouse', JSON.stringify(b));
          ok('PATCH носи и sort_order', b.hasOwnProperty('sort_order'), JSON.stringify(b));
          ok('sort_order е max+1 = 4', b.sort_order === 4, String(b.sort_order));
          ok('останалите полета са запазени',
            b.title === 'Задача t-1' && b.hasOwnProperty('due_dates') &&
            b.hasOwnProperty('target_stores'), JSON.stringify(b));
        }
        ok('модалът се затваря', !doc.getElementById('edit-tk-ov'));
      }
    }
  }

  /* ═══ 4. Редакция БЕЗ смяна на отдел ══════════════════════════════════ */
  section('4. submitEditTask без смяна на отдел -> БЕЗ sort_order');
  {
    const h = await env();
    const w = h.w, doc = h.doc;

    w.openEditTaskModal('t-1');
    await ticks(3);
    const sel = doc.getElementById('etk-dept');
    if (ok('модалът е отворен', !!sel)) {
      ok('отделът остава trade', sel.value === 'trade');
      /* Само заглавието се променя — точно най-честата редакция. */
      doc.getElementById('etk-title').value = 'Ново заглавие';

      const save = saveBtn(doc);
      realClick(w, save);
      await ticks(6);

      const ps = patchesFor(h, 't-1');
      if (ok('има PATCH', ps.length === 1, JSON.stringify(h.calls.patch))) {
        const b = ps[0].body;
        ok('новото заглавие е записано', b.title === 'Ново заглавие', JSON.stringify(b));
        ok('отделът е непроменен', b.department === 'trade');
        /* hasOwnProperty, не истинност: 0 е валиден sort_order и
           if(b.sort_order) би подминал точно този дефект. */
        ok('PATCH НЕ съдържа ключ sort_order', !b.hasOwnProperty('sort_order'),
          JSON.stringify(b));
      }
      const t = h.w.bulTasks.find(x => x.id === 't-1');
      ok('локалният sort_order е непокътнат', t.sort_order === 7, String(t.sort_order));
    }
  }

  report();
})();
