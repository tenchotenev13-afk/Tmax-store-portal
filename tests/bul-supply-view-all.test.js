/* Бюлетин — снабдяването (role 'supply') вижда ВСИЧКИ задачи като офиса, само
   за четене. Решение на Тенчо 28.10.2026, вариант А.

   Повод: Миглена, „ЕТИКЕТ НА КАШОН" (8 обекта, без Централен офис) — „Васка и
   Жеко я виждат, но никой друг от снабдителите". Васка е accounting, Жеко —
   admin, тоест isGlobal(); supply не е и Бюлетинът го третираше като обект
   „Централен офис".

   Какво заковава тестът:
     1. supply: задача за 8 обекта и задача за всички — в списъка, календара и
        „План за деня" (офисният план — избран обект);
     2. supply: 0 чекбокса за изпълнение (еднократна, постоянна, подзадача,
        план) и 0 бутона „⏱ Отложи" / „🚫 Не се отнася" / ✏️ / 🗑 / ⏸;
        директно извикване (стар таб) → toast, 0 записа;
     3. supply: постоянна, изключена за седмицата за всички — вижда се сива,
        както при глобалните (обектът не я вижда);
     4. isGlobal() за supply остава false (другите модули не се променят);
     5. обект (manager, Троян) — без промяна: чуждата не се вижда, своята — с
        чекбокс и „⏱ Отложи";
     6. accounting — без промяна: вижда всичко, с ✏️ и чекбокс.

   ⚠️ Дати: котвата е сряда 12:00 от текущата реална седмица, замразена на
   w.Date; process.env.TZ = 'Europe/Sofia'.

   Пускане: node tests/bul-supply-view-all.test.js . */
'use strict';
process.env.TZ = 'Europe/Sofia';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, fire } = H;

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
  const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0);
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
const WED = isoOf(shifted(0));

const CO = 'Централен офис', TR = 'Троян', MO = 'Монтана';
const EIGHT = ['Враца', 'Габрово', 'Добрич', 'Петрич', 'Пирдоп', TR, 'Търговище', 'Шумен'];
const STORES = EIGHT.concat([MO]);
const SUPPLY = { email: 'sn@temax.bg', display_name: 'Снабдител', role: 'supply', store_name: CO };
const MANAGER = { email: 'tr@temax.bg', display_name: 'Троян', role: 'manager', store_name: TR };
const ACCOUNTING = { email: 'acc@temax.bg', display_name: 'Счетоводител', role: 'accounting', store_name: CO };

function task(id, over) {
  return Object.assign({
    id: id, bulletin_id: 'b-cur', title: 'Задача ' + id, description: null,
    department: 'trade', task_type: 'info', sort_order: 1,
    due_date: WED, due_dates: [WED], due_window: false,
    spans_from: null, starts_on: null, attachments: null,
    target_stores: null, report_groups: null, linked_module: null, auto_complete: false,
    created_by: 'Миглена', allow_postpone: true, allow_not_applicable: true
  }, over || {});
}
const TASKS = [
  task('t-8', { title: 'ЕТИКЕТ НА КАШОН', target_stores: EIGHT, sort_order: 1 }),
  task('t-all', { title: 'ЗА ВСИЧКИ ОБЕКТИ', sort_order: 2 }),
  task('t-mo', { title: 'САМО МОНТАНА', target_stores: [MO], sort_order: 3 })
];
function rec(id, over) {
  return Object.assign({
    id: id, title: 'Постоянна ' + id, department: 'trade', task_type: 'info',
    description: null, target_stores: null, due_weekday: null, due_weekdays: [2],
    due_time: '10:00', due_window: false, linked_module: null, report_groups: null,
    attachments: null, active: true, sort_order: 1, store_hints: null,
    allow_postpone: true, allow_not_applicable: true
  }, over || {});
}
const RECS = [
  rec('r-all', { title: 'ПОСТОЯННА ЗА ВСИЧКИ', sort_order: 1 }),
  rec('r-skip', { title: 'ИЗКЛЮЧЕНА ТАЗИ СЕДМИЦА', sort_order: 2 })
];
const PERIODS = RECS.map(r => ({ id: 'p-' + r.id, recurring_task_id: r.id, from_monday: isoOf(shifted(-30)), to_monday: null }));
const SUBTASKS = [{ id: 'st-1', task_id: 't-all', title: 'ПОДЗАДАЧА', due_date: null, sort_order: 1 }];

function bulOf(w, id) {
  const cal = {}; w.DKEYS.forEach(k => { cal[k] = []; });
  return { id: id, week_number: w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published',
           created_at: isoOf(ANCHOR), content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
}
function env(user) {
  const h = boot({
    modules: ['bulletin.js'],
    user: user,
    data: {
      users: STORES.map(s => ({ store_name: s })),
      recurring_tasks: () => RECS.map(r => Object.assign({}, r)),
      recurring_task_periods: PERIODS,
      recurring_task_skips: () => [{ id: 'sk-1', recurring_task_id: 'r-skip', year: isoWeekYear(ANCHOR),
        week_number: h.w.weekNum(ANCHOR), store_name: null, reason: 'инвентаризация', created_by: 'Миглена' }],
      recurring_task_versions: [],
      bulletins: url => { const m = /[?&]id=eq\.([^&]+)/.exec(url); return m ? h.buls.filter(b => b.id === m[1]) : h.buls; },
      bulletin_tasks: url => (/spans_from=not\.is\.null/.test(url) ? [] : TASKS.map(t => Object.assign({}, t))),
      task_completions: [],
      subtask_completions: [],
      task_subtasks: () => SUBTASKS.map(s => Object.assign({}, s))
    }
  });
  freezeDate(h.w);
  h.buls = [bulOf(h.w, 'b-cur')];
  h.w.bulSelectedId = 'b-cur';
  h.w.bulActiveDept = 'trade';
  h.w.reportableStoresCache = STORES.slice();
  try { h.w.localStorage.setItem('bulPlanOpen', '1'); } catch (e) {}
  return h;
}
async function settle(cond, max) {
  for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
async function loaded(h, marker) {
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return false;
  return settle(() => !!h.doc.getElementById('sec-calendar') &&
    txt(h.doc.getElementById('mod-bulletin') || h.doc.body).indexOf(marker || 'ЗА ВСИЧКИ ОБЕКТИ') >= 0);
}
const DONE_FNS = ['bulCheckboxChanged', 'bulRecurringCheckboxChanged', 'bulToggleSubtask'];
function doneBoxes(root) {
  return Array.prototype.filter.call(root.querySelectorAll('input[type=checkbox]'), cb =>
    DONE_FNS.some(f => (cb.getAttribute('onchange') || '').indexOf(f + '(') >= 0));
}
const STORE_BTNS = ['openPostponeModal', 'openNotApplicableModal', 'cancelPostpone', 'cancelNotApplicable'];
const OFFICE_BTNS = ['openEditTaskModal', 'bulDelTask', 'openEditRecurringModal', 'openRecurringSkipModal', 'toggleRecurringActive'];
function btns(root, fns) {
  return Array.prototype.filter.call(root.querySelectorAll('button'), b =>
    fns.some(f => (b.getAttribute('onclick') || '').indexOf(f + '(') >= 0));
}
const panel = h => h.doc.getElementById('dept-panel-trade') || h.doc.body;
const sec = (h, id) => h.doc.getElementById(id);
const writes = h => h.calls.post.length + h.calls.patch.length + h.calls.del.length;
async function pickPlanStore(h, store) {
  const sel = h.doc.querySelector('#sec-dayplan select');
  if (!sel) return false;
  sel.value = store; fire(h.w, sel, 'change');
  await ticks(); await ticks();
  return true;
}

(async function () {

  section('1. supply: задачата за 8 обекта и тази за всички — списък, календар, „План за деня"');
  {
    const h = env(SUPPLY);
    if (ok('бюлетинът се зарежда', await loaded(h))) {
      ok('isGlobal() за supply е false (shared.js не е пипан)', h.w.isGlobal() === false);
      ok('bulSeesAll() за supply е true', h.w.bulSeesAll() === true);
      ok('canEdit() за supply е false', !h.w.canEdit());
      const p = panel(h), cal = sec(h, 'sec-calendar');
      ok('„ЕТИКЕТ НА КАШОН" е в списъка по отдел', txt(p).indexOf('ЕТИКЕТ НА КАШОН') >= 0);
      ok('„САМО МОНТАНА" също (вижда всичко)', txt(p).indexOf('САМО МОНТАНА') >= 0);
      ok('„ЗА ВСИЧКИ ОБЕКТИ" е в списъка', txt(p).indexOf('ЗА ВСИЧКИ ОБЕКТИ') >= 0);
      ok('„ЕТИКЕТ НА КАШОН" е в календара', txt(cal).indexOf('ЕТИКЕТ НА КАШОН') >= 0, txt(cal).slice(0, 300));
      ok('„🏬 Само за: …" — изгледът на офиса', txt(p).indexOf('🏬 Само за: ' + EIGHT.join(', ')) >= 0);
      const plan = sec(h, 'sec-dayplan');
      ok('„План за деня" — офисният: избор на обект', !!plan && !!plan.querySelector('select'), txt(plan).slice(0, 200));
      if (await pickPlanStore(h, TR)) {
        const plan2 = sec(h, 'sec-dayplan');
        ok('планът за Троян показва „ЕТИКЕТ НА КАШОН"', txt(plan2).indexOf('ЕТИКЕТ НА КАШОН') >= 0, txt(plan2).slice(0, 400));
        ok('…и „ЗА ВСИЧКИ ОБЕКТИ"', txt(plan2).indexOf('ЗА ВСИЧКИ ОБЕКТИ') >= 0);
        ok('планът: 0 чекбокса за изпълнение', doneBoxes(plan2).length === 0, doneBoxes(plan2).length + '');
        ok('планът: 0 бутона на обекта', btns(plan2, STORE_BTNS).length === 0);
      }
    }
  }

  section('2. supply: нищо за отмятане, никакви бутони — и при задача за всички');
  {
    const h = env(SUPPLY);
    if (await loaded(h)) {
      await settle(() => txt(h.doc.body).indexOf('ПОДЗАДАЧА') >= 0, 40);
      const all = h.doc.body;
      ok('подзадачата се вижда', txt(all).indexOf('ПОДЗАДАЧА') >= 0);
      ok('0 чекбокса за изпълнение в цялата страница', doneBoxes(all).length === 0,
        doneBoxes(all).map(c => c.outerHTML.slice(0, 100)).join(' | '));
      ok('0 „⏱ Отложи" / „🚫 Не се отнася"', btns(all, STORE_BTNS).length === 0,
        btns(all, STORE_BTNS).map(b => b.outerHTML.slice(0, 100)).join(' | '));
      ok('0 ✏️ / 🗑 / ⏸ / спри', btns(all, OFFICE_BTNS).length === 0,
        btns(all, OFFICE_BTNS).map(b => b.outerHTML.slice(0, 100)).join(' | '));
      ok('празната клетка на мястото на чекбокса', h.doc.querySelectorAll('.bul-ro-cell').length >= 3,
        String(h.doc.querySelectorAll('.bul-ro-cell').length));

      /* Стар таб / конзола: записът не минава. */
      h.calls.toast.length = 0; h.calls.post.length = 0; h.calls.patch.length = 0; h.calls.del.length = 0;
      const cb = h.doc.createElement('input'); cb.type = 'checkbox'; cb.checked = true;
      cb.dataset.tid = 't-all'; cb.dataset.cdate = WED; h.doc.body.appendChild(cb);
      guard('bulCheckboxChanged не хвърля', () => h.w.bulCheckboxChanged(cb));
      guard('toggleTask не хвърля', () => h.w.toggleTask('t-all', true, null, WED));
      guard('toggleRecurringTask не хвърля', () => h.w.toggleRecurringTask('r-all', true, null, WED));
      guard('openPostponeModal не хвърля', () => h.w.openPostponeModal('t-all', 'regular', WED));
      guard('openNotApplicableModal не хвърля', () => h.w.openNotApplicableModal('t-all', 'regular', WED));
      await ticks(); await ticks();
      ok('0 записа', writes(h) === 0, JSON.stringify(h.calls.post.concat(h.calls.patch)));
      ok('отметката е върната', cb.checked === false);
      ok('модалите не се отварят', !h.doc.getElementById('pp-modal-ov') && !h.doc.getElementById('na-modal-ov'));
      ok('toast „само за преглед"', h.calls.toast.some(t => /само за преглед/.test(t)), h.calls.toast.join('|'));
    }
  }

  section('3. supply: изключената за седмицата — сива, както при глобалните');
  {
    const h = env(SUPPLY);
    if (await loaded(h)) {
      ok('bulSkipViewStore() е null (глобален изглед)', h.w.bulSkipViewStore() === null);
      ok('„ИЗКЛЮЧЕНА ТАЗИ СЕДМИЦА" се вижда', txt(panel(h)).indexOf('ИЗКЛЮЧЕНА ТАЗИ СЕДМИЦА') >= 0);
    }
    const m = env(MANAGER);
    if (await loaded(m)) {
      ok('КОНТРОЛА: обектът НЕ я вижда', txt(panel(m)).indexOf('ИЗКЛЮЧЕНА ТАЗИ СЕДМИЦА') < 0);
    }
  }

  section('4. Обект (manager, Троян) — без промяна');
  {
    const h = env(MANAGER);
    if (await loaded(h)) {
      const p = panel(h);
      ok('своята („ЕТИКЕТ НА КАШОН") се вижда', txt(p).indexOf('ЕТИКЕТ НА КАШОН') >= 0);
      ok('чуждата („САМО МОНТАНА") НЕ се вижда', txt(h.doc.body).indexOf('САМО МОНТАНА') < 0);
      /* Само чекбоксът на самата задача — фалшивите task_subtasks връщат подзадачата за всяка задача. */
      const mine = doneBoxes(p).filter(c => c.getAttribute('data-tid') === 't-8' && (c.getAttribute('onchange') || '').indexOf('bulCheckboxChanged(') >= 0);
      ok('своята е с чекбокс', mine.length === 1, String(mine.length));
      ok('и с „⏱ Отложи"', btns(p, ['openPostponeModal']).some(b => b.getAttribute('data-task-id') === 't-8'));
      ok('без празни клетки „само за преглед"', h.doc.querySelectorAll('.bul-ro-cell').length === 0);
      ok('bulSeesAll() е false', h.w.bulSeesAll() === false);
    }
  }

  section('5. accounting — без промяна');
  {
    const h = env(ACCOUNTING);
    if (await loaded(h)) {
      const p = panel(h);
      ok('вижда „САМО МОНТАНА"', txt(p).indexOf('САМО МОНТАНА') >= 0);
      ok('има ✏️', btns(p, ['openEditTaskModal']).length >= 3, String(btns(p, ['openEditTaskModal']).length));
      ok('има чекбокс за изпълнение (както досега)', doneBoxes(p).length >= 1, String(doneBoxes(p).length));
      ok('без празни клетки „само за преглед"', h.doc.querySelectorAll('.bul-ro-cell').length === 0);
      ok('без бутоните на обекта', btns(p, STORE_BTNS).length === 0);
    }
  }

  report();
})();

/* ═══ МУТАНТИТЕ, ПУСНАТИ НА 28.10.2026 ═══════════════════════════════════════
   Чист код: 48 успешни, 0 неуспешни, exit 0 (база 24a468f + промяната).
   M1  bulSeesAll() без supply                        → exit 1, 10 ❌
   M2  supply получава чекбокс (списък по отдел)      → exit 1, 1 ❌
   M3  isGlobal() в shared.js включва supply          → exit 1, 1 ❌
   M4  bulCheckboxChanged без защита                  → exit 1, 1 ❌
   M5  „План за деня“ дава чекбокс на supply          → exit 1, 1 ❌
   M6  постоянните дават чекбокс на supply            → exit 1, 1 ❌
   M7  подзадачите дават чекбокс на supply            → exit 1, 1 ❌
   M8  изключените: supply като обект                 → exit 1, 2 ❌
   M9  toggleTask без защита                          → exit 1, 1 ❌
*/
