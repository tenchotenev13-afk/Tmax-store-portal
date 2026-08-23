/* Постоянна задача — отделът се сменя от формата за редакция.

   Заварено: openEditRecurringModal() рендираше осем полета, но не и отдел, а
   submitEditRecurring() пращаше девет колони без department. Постоянна задача
   се създава в отдела, от чийто блок е натиснат бутонът; попаднеше ли в
   грешен, нямаше как да се премести от интерфейса. На 23.08.2026 „Вечерен
   оборот" излезе в ТЪРГОВСКА и беше преместена в АДМИНИСТРАЦИЯ с ръчен SQL.

   Последицата не е само козметична: календарът групира по отдел (DCOLS), а
   стрелките ▲▼ местят само в рамките на отдела — тоест задача в грешен отдел
   не можеше да стигне до мястото си по никакъв начин от екрана.

   Пускане: node tests/recurring-edit-department.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick, btn } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

/* Огледало на живата база (23.08.2026): „Администрация" заема sort_order
   1..11, а единствената задача в „Склад" е с 9 — числата се припокриват
   между отделите, защото moveRecInDept() преномерира 1..N в рамките на
   отдела. Точно затова преместена задача би паднала по средата. */
function rec(id, dept, sortOrder, over) {
  return Object.assign({
    id: id, title: 'Задача ' + id, description: 'описание ' + id,
    department: dept, sort_order: sortOrder, active: true,
    task_type: 'comment', due_weekdays: [1, 3], due_weekday: 1,
    due_time: '18:30', target_stores: ['Троян'],
    report_groups: ['co','owner'], linked_module: 'oborot'
  }, over || {});
}

const TASKS = [
  rec('r-warehouse', 'warehouse', 9),
  rec('r-admin-1', 'admin', 1),
  rec('r-admin-11', 'admin', 11)
];

function env() {
  const h = boot({
    modules: ['bulletin.js'],
    user: ADMIN,
    data: { users: [{ store_name: 'Троян' }], stores: [{ name: 'Троян' }, { name: 'Враца' }] }
  });
  const w = h.w;
  const cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });
  w.curBul = {
    id: 'b-1', week_number: w.weekNum(new Date()), year: new Date().getFullYear(),
    status: 'published',
    content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } }
  };
  w.bulListCache = [];
  w.bulTasks = [];
  w.bulComps = [];
  w.recurringComps = [];
  w.allStoresCache = ['Троян', 'Враца'];
  w.recurringTasks = JSON.parse(JSON.stringify(TASKS));
  return h;
}

function modal(doc) { return doc.getElementById('edit-rec-ov'); }
/* САМО <select> — div/span с текст „Отдел" би излъгал. */
function deptSelect(doc) {
  const el = doc.getElementById('erec-dept');
  return el && el.tagName === 'SELECT' ? el : null;
}
function save(w, doc) {
  const b = btn(modal(doc), 'Запази');
  if (!b) throw new Error('бутонът „Запази" не е намерен');
  realClick(w, b);
}
function patchBody(calls) {
  const p = calls.patch.filter(x => String(x.url).indexOf('recurring_tasks') >= 0);
  return p.length ? p[p.length - 1].body : null;
}

/* Деветте полета, които се пращаха и преди промяната. */
const OLD_KEYS = ['title', 'description', 'due_weekday', 'due_weekdays', 'due_time',
                  'task_type', 'target_stores', 'report_groups', 'linked_module'];

(async function run() {

  /* ═══ 1. Полето съществува и е с текущата стойност ════════════════════ */
  section('1. Модалът показва текущия отдел');
  {
    const h = env();
    const { w, doc } = h;
    if (guard('модалът се отваря', () => w.openEditRecurringModal('r-warehouse'))) {
      const sel = deptSelect(doc);
      if (ok('има <select id="erec-dept">', !!sel, sel ? sel.tagName : 'липсва')) {
        ok('избран е текущият отдел, не първият по ред',
          sel.value === 'warehouse', sel.value);
        ok('първият по ред е друг (иначе проверката не доказва нищо)',
          w.DCOLS[0] !== 'warehouse', w.DCOLS[0]);
        const vals = Array.prototype.slice.call(sel.options).map(o => o.value);
        ok('опциите са точно DCOLS', vals.join(',') === w.DCOLS.join(','), vals.join(','));
        ok('надписите идват от DEPTS',
          Array.prototype.slice.call(sel.options)
            .every((o, i) => o.textContent === w.DEPTS[w.DCOLS[i]].label),
          Array.prototype.slice.call(sel.options).map(o => o.textContent).join(' | '));
      }
    }
  }

  section('1б. И за задача от друг отдел');
  {
    const h = env();
    const { w, doc } = h;
    w.openEditRecurringModal('r-admin-1'); await ticks();
    const sel = deptSelect(doc);
    ok('избран е "admin"', !!sel && sel.value === 'admin', sel && sel.value);
  }

  /* ═══ 2. Смяна на отдела стига до PATCH ═══════════════════════════════ */
  section('2. Смяна на отдела -> department в PATCH');
  {
    const h = env();
    const { w, doc, calls } = h;
    w.openEditRecurringModal('r-warehouse'); await ticks();
    deptSelect(doc).value = 'admin';
    if (guard('клик по „Запази"', () => save(w, doc))) {
      await ticks();
      const body = patchBody(calls);
      if (ok('PATCH е изпратен', !!body, JSON.stringify(body))) {
        ok('department е новият', body.department === 'admin', String(body.department));
      }
    }
  }

  /* ═══ 3. Запис без смяна пак праща department ═════════════════════════ */
  section('3. Без смяна -> старият отдел, не null');
  {
    const h = env();
    const { w, doc, calls } = h;
    w.openEditRecurringModal('r-warehouse'); await ticks();
    if (guard('клик по „Запази"', () => save(w, doc))) {
      await ticks();
      const body = patchBody(calls);
      if (ok('PATCH е изпратен', !!body)) {
        ok('department е "warehouse"', body.department === 'warehouse', String(body.department));
        ok('НЕ е null', body.department !== null && body.department !== undefined);
        ok('sort_order НЕ се пипа без смяна на отдел',
          !('sort_order' in body), JSON.stringify(body.sort_order));
      }
    }
  }

  /* ═══ 4. Останалите девет полета са непроменени ══════════════════════ */
  section('4. Осемте стари полета продължават да се пращат както преди');
  {
    const h = env();
    const { w, doc, calls } = h;
    w.openEditRecurringModal('r-warehouse'); await ticks();
    save(w, doc);
    await ticks();
    const body = patchBody(calls);
    if (ok('PATCH е изпратен', !!body)) {
      const keys = Object.keys(body).sort();
      ok('точно старите девет + department',
        keys.join(',') === OLD_KEYS.concat(['department']).sort().join(','), keys.join(','));
      const src = TASKS.find(t => t.id === 'r-warehouse');
      ok('title непроменен', body.title === src.title, body.title);
      ok('description непроменено', body.description === src.description, body.description);
      ok('due_weekdays непроменени',
        JSON.stringify(body.due_weekdays) === JSON.stringify(src.due_weekdays),
        JSON.stringify(body.due_weekdays));
      ok('due_weekday е първият избран', body.due_weekday === src.due_weekdays[0],
        String(body.due_weekday));
      ok('due_time непроменен', body.due_time === src.due_time, String(body.due_time));
      ok('task_type непроменен', body.task_type === src.task_type, String(body.task_type));
      ok('target_stores непроменени',
        JSON.stringify(body.target_stores) === JSON.stringify(src.target_stores),
        JSON.stringify(body.target_stores));
      ok('report_groups непроменени',
        JSON.stringify(body.report_groups) === JSON.stringify(src.report_groups),
        JSON.stringify(body.report_groups));
      ok('linked_module непроменен', body.linked_module === src.linked_module,
        String(body.linked_module));
    }
  }

  /* ═══ 5. sort_order при смяна на отдел ═══════════════════════════════ */
  /* Съзнателно решение: при смяна задачата отива на ДЪНОТО на новия отдел.
     Иначе задачата от „Склад" (sort_order 9) би се появила между 8-ма и
     10-та позиция в „Администрация" (която заема 1..11). */
  section('5. Смяна на отдел -> задачата отива на дъното на новия');
  {
    const h = env();
    const { w, doc, calls } = h;
    w.openEditRecurringModal('r-warehouse'); await ticks();
    deptSelect(doc).value = 'admin';
    save(w, doc);
    await ticks();
    const body = patchBody(calls);
    if (ok('PATCH е изпратен', !!body)) {
      ok('sort_order е max+1 в новия отдел (11+1)', body.sort_order === 12,
        String(body.sort_order));
      ok('НЕ остава старият 9', body.sort_order !== 9);
    }
  }

  section('5б. Смяна към празен отдел -> sort_order 1');
  {
    const h = env();
    const { w, doc, calls } = h;
    w.openEditRecurringModal('r-warehouse'); await ticks();
    deptSelect(doc).value = 'trade';   /* в „Търговска" няма нито една */
    save(w, doc);
    await ticks();
    const body = patchBody(calls);
    ok('sort_order е 1', !!body && body.sort_order === 1, String(body && body.sort_order));
  }

  /* ═══ 6. Формата за СЪЗДАВАНЕ не е пипана ════════════════════════════ */
  section('6. Създаването продължава да взима отдела от блока');
  {
    const h = env();
    const { w, doc } = h;
    if (guard('модалът за създаване се отваря', () => w.openRecurringModal('admin'))) {
      ok('няма поле за отдел при създаване',
        !doc.getElementById('rec-dept'), 'намерено е поле');
    }
  }

  /* ═══ 7. Помощникът се ползва и от модала за промоция ════════════════ */
  section('7. deptOptsHtml() е един за двете места');
  {
    const h = env();
    const { w } = h;
    ok('deptOptsHtml съществува', typeof w.deptOptsHtml === 'function');
    const html = w.deptOptsHtml('admin');
    ok('маркира подадения отдел', html.indexOf('value="admin" selected') >= 0, html);
    ok('без избор нищо не е selected', w.deptOptsHtml().indexOf('selected') < 0,
      w.deptOptsHtml());
    ok('трите отдела са налице',
      w.DCOLS.every(dk => html.indexOf('value="' + dk + '"') >= 0), html);
  }

  report();
})();
