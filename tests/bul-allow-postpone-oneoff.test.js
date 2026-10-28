/* Бюлетин — офисът забранява „⏱ Отложи" / „🚫 Не се отнася" и по ЕДНОКРАТНА
   задача (bulletin_tasks), както вече е за постоянните (876cfdd).

   Решение на Тенчо 28.10.2026 (bul-allow-postpone-oneoff).
   bulletin_tasks.allow_postpone / allow_not_applicable — boolean NOT NULL
   default true. Пишат се от формата на задачата (нова / ✏️), не с отметки в
   реда; в реда офисът вижда само „🔒". Вече отложеното не се пипа.

   Какво заковава тестът:
     1. обект, allow_postpone=false → 0 „⏱ Отложи" в списъка и в „План за
        деня"; „🚫 Не се отнася" остава; allow_not_applicable=false → 0
        „🚫 Не се отнася" там и в модала за отметка (клик по баджа);
        стар запис без полетата → разрешено (контрола);
     2. забранено + директно извикване (стар таб) → toast, 0 записа, модал не
        се отваря; разрешената записва (контрола);
     3. офисът: „🔒" в реда, без отметки в реда; ✏️ (истински клик) → двете
        отметки във формата със стойностите от записа; „💾 Запази" праща двете
        полета; нова задача → отметките включени, махната отметка → false;
        „Само за информация" → без отметки, записва true;
     4. вече отложен ред при allow_postpone=false → „↩ Отмени" остава.
   Постоянните — tests/bul-allow-postpone.test.js (не е пипан).

   ⚠️ Дати: котвата е сряда 12:00 от текущата реална седмица, замразена на
   w.Date; process.env.TZ = 'Europe/Sofia'.

   Пускане: node tests/bul-allow-postpone-oneoff.test.js . */
'use strict';
process.env.TZ = 'Europe/Sofia';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick, fire } = H;

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
const WED = isoOf(shifted(0));          /* ДНЕС */
const FRI = isoOf(shifted(2));

const TR = 'Троян';
const STORE_USER = { email: 's@temax.bg', display_name: 'Обект', role: 'store', store_name: TR };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function task(id, over) {
  return Object.assign({
    id: id, bulletin_id: 'b-cur', title: 'Задача ' + id, description: null,
    department: 'trade', task_type: 'photo', sort_order: 1,
    due_date: WED, due_dates: [WED], due_window: false,
    spans_from: null, starts_on: null, attachments: null,
    target_stores: null, report_groups: null, linked_module: null, auto_complete: false,
    created_by: 'Админ', allow_postpone: true, allow_not_applicable: true
  }, over || {});
}
function tasks() {
  const stale = task('t-stale', { title: 'СТАР ЗАПИС', sort_order: 4 });
  delete stale.allow_postpone; delete stale.allow_not_applicable;
  return [
    task('t-nopp', { title: 'БЕЗ ОТЛАГАНЕ', allow_postpone: false, sort_order: 1 }),
    task('t-nona', { title: 'БЕЗ НЕ СЕ ОТНАСЯ', allow_not_applicable: false, sort_order: 2 }),
    task('t-ok',   { title: 'РАЗРЕШЕНА', sort_order: 3 }),
    stale,
    /* Отложена ПРЕДИ забраната — „↩ Отмени" трябва да остане. */
    task('t-old',  { title: 'ОТЛОЖЕНА ПРЕДИ', allow_postpone: false, sort_order: 5 })
  ];
}
const OLD_PP = { id: 'c-old', task_id: 't-old', recurring_task_id: null, store_name: TR, status: 'postponed',
  completion_date: WED, postponed_to: FRI, comment: 'ремонт', completed_by: 'Обект' };

function tcRoute(rows) {
  return url => {
    let out = rows.slice();
    const one = (re, fn) => { const m = re.exec(url); if (m) out = out.filter(r => fn(r, m[1])); };
    one(/[?&]postponed_to=eq\.([^&]+)/, (r, v) => String(r.postponed_to || '') === v);
    one(/[?&]postponed_to=gte\.([^&]+)/, (r, v) => !!r.postponed_to && String(r.postponed_to) >= v);
    one(/[?&]postponed_to=lte\.([^&]+)/, (r, v) => !!r.postponed_to && String(r.postponed_to) <= v);
    one(/[?&]status=eq\.([^&]+)/, (r, v) => String(r.status || '') === v);
    one(/[?&]store_name=eq\.([^&]+)/, (r, v) => r.store_name === decodeURIComponent(v));
    one(/[?&]task_id=in\.\(([^)]*)\)/, (r, v) => v.split(',').indexOf(String(r.task_id)) >= 0);
    one(/[?&]recurring_task_id=in\.\(([^)]*)\)/, (r, v) => v.split(',').indexOf(String(r.recurring_task_id)) >= 0);
    if (/[?&]recurring_task_id=not\.is\.null/.test(url)) out = out.filter(r => !!r.recurring_task_id);
    if (/[?&]task_id=not\.is\.null/.test(url)) out = out.filter(r => !!r.task_id);
    one(/[?&]completion_date=gte\.([^&]+)/, (r, v) => !!r.completion_date && String(r.completion_date) >= v);
    one(/[?&]completion_date=lte\.([^&]+)/, (r, v) => !!r.completion_date && String(r.completion_date) <= v);
    return out;
  };
}
function bulOf(w, id) {
  const cal = {}; w.DKEYS.forEach(k => { cal[k] = []; });
  return { id: id, week_number: w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published',
           created_at: isoOf(ANCHOR), content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
}
function env(opts) {
  opts = opts || {};
  const T = tasks();
  const h = boot({
    modules: ['bulletin.js'],
    user: opts.user || STORE_USER,
    data: {
      users: [{ store_name: TR }],
      recurring_tasks: [],
      recurring_task_periods: [],
      recurring_task_skips: [],
      recurring_task_versions: [],
      bulletins: url => { const m = /[?&]id=eq\.([^&]+)/.exec(url); return m ? h.buls.filter(b => b.id === m[1]) : h.buls; },
      bulletin_tasks: url => (/spans_from=not\.is\.null/.test(url) ? [] : T.map(t => Object.assign({}, t))),
      task_completions: tcRoute(opts.comps || [OLD_PP]),
      subtask_completions: [],
      task_subtasks: [],
      stores: [{ name: TR }]
    }
  });
  freezeDate(h.w);
  h.buls = [bulOf(h.w, 'b-cur')];
  h.w.bulSelectedId = 'b-cur';
  h.w.bulActiveDept = 'trade';
  h.w.reportableStoresCache = [TR];
  h.w.allStoresCache = [TR];
  try { h.w.localStorage.removeItem('bulPlanOpen'); } catch (e) {}
  return h;
}
async function settle(cond, max) {
  for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
async function loaded(h) {
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return false;
  return settle(() => !!h.doc.getElementById('sec-calendar') &&
    txt(h.doc.getElementById('mod-bulletin') || h.doc.body).indexOf('РАЗРЕШЕНА') >= 0);
}
function btnsFor(root, taskId, fnName) {
  if (!root) return [];
  return Array.prototype.filter.call(root.querySelectorAll('button'), b =>
    (b.getAttribute('onclick') || '').indexOf(fnName + '(') >= 0 &&
    (b.getAttribute('data-task-id') === taskId));
}
const PP = 'openPostponeModal', NA = 'openNotApplicableModal';
const sec = (h, id) => h.doc.getElementById(id);
const writes = h => h.calls.post.length + h.calls.patch.length;

(async function () {

  section('1. Обект: бутоните на еднократните — списък и „План за деня"');
  {
    const h = env();
    if (ok('бюлетинът се зарежда', await loaded(h))) {
      const all = h.doc.body, plan = sec(h, 'sec-dayplan');
      ok('„План за деня" е на екрана и показва задачите',
        !!plan && txt(plan).indexOf('БЕЗ ОТЛАГАНЕ') >= 0, txt(plan).slice(0, 300));
      ok('allow_postpone=false → 0 „⏱ Отложи" в цялата страница',
        btnsFor(all, 't-nopp', PP).length === 0, btnsFor(all, 't-nopp', PP).map(b => b.outerHTML.slice(0, 120)).join(' | '));
      ok('allow_postpone=false → 0 „⏱ Отложи" в „План за деня"', btnsFor(plan, 't-nopp', PP).length === 0);
      ok('…а „🚫 Не се отнася" за нея остава', btnsFor(all, 't-nopp', NA).length >= 1);
      ok('…и в „План за деня"', btnsFor(plan, 't-nopp', NA).length === 1);
      ok('allow_not_applicable=false → 0 „🚫 Не се отнася" в цялата страница',
        btnsFor(all, 't-nona', NA).length === 0);
      ok('…а „⏱ Отложи" за нея остава', btnsFor(all, 't-nona', PP).length >= 1);
      ok('КОНТРОЛА: разрешената има „⏱ Отложи" в списъка и в плана',
        btnsFor(all, 't-ok', PP).length >= 2 && btnsFor(plan, 't-ok', PP).length === 1,
        btnsFor(all, 't-ok', PP).length + ' / план ' + btnsFor(plan, 't-ok', PP).length);
      ok('КОНТРОЛА: разрешената има „🚫 Не се отнася" в списъка и в плана',
        btnsFor(all, 't-ok', NA).length >= 2 && btnsFor(plan, 't-ok', NA).length === 1);
      ok('стар запис без полетата → „⏱ Отложи" е там',
        btnsFor(all, 't-stale', PP).length >= 1 && btnsFor(plan, 't-stale', PP).length === 1);
      ok('стар запис без полетата → „🚫 Не се отнася" е там', btnsFor(all, 't-stale', NA).length >= 1);
      ok('обектът не вижда знака „🔒"', h.doc.querySelectorAll('.bul-allow-tags').length === 0);

      /* Модалът за отметка — истински клик по баджа на задачата. */
      const badge = id => Array.prototype.find.call(h.doc.querySelectorAll('[onclick*="taskTypeBadgeClick"]'),
        el => el.getAttribute('data-task-id') === id && !plan.contains(el));
      const modalNa = () => {
        const ov = h.doc.getElementById('tc-modal-ov');
        return ov ? Array.prototype.filter.call(ov.querySelectorAll('button'),
          b => (b.getAttribute('onclick') || '').indexOf(NA + '(') >= 0).length : -1;
      };
      const closeM = () => { const ov = h.doc.getElementById('tc-modal-ov'); if (ov) ov.remove(); };
      const b1 = badge('t-nona');
      if (ok('бадж на задачата без „Не се отнася" е кликаем', !!b1)) {
        realClick(h.w, b1, 'бадж t-nona'); await ticks();
        ok('модалът за отметка: 0 „🚫 Не се отнася за нас"', modalNa() === 0, 'бутони: ' + modalNa());
        closeM();
      }
      const b2 = badge('t-ok');
      if (ok('КОНТРОЛА: бадж на разрешената е кликаем', !!b2)) {
        realClick(h.w, b2, 'бадж t-ok'); await ticks();
        ok('КОНТРОЛА: модалът има „🚫 Не се отнася за нас"', modalNa() === 1, 'бутони: ' + modalNa());
        closeM();
      }
    }
  }

  section('2. Забранено + директно извикване (стар таб) → toast, 0 записа');
  {
    const h = env({ comps: [] });
    if (await loaded(h)) {
      const w = h.w;
      h.calls.toast.length = 0; h.calls.post.length = 0; h.calls.patch.length = 0;
      guard('openPostponeModal не хвърля', () => w.openPostponeModal('t-nopp', 'regular', WED));
      ok('модал за отлагане НЕ се отваря', !h.doc.getElementById('pp-modal-ov'));
      ok('toast „Отлагането на тази задача е изключено от офиса"',
        h.calls.toast.join('|').indexOf('Отлагането на тази задача е изключено от офиса') >= 0, h.calls.toast.join('|'));

      const fake = h.doc.createElement('div');
      fake.innerHTML = '<textarea id="pp-comment">причина</textarea><input id="pp-date" value="' + FRI + '">';
      h.doc.body.appendChild(fake);
      guard('submitPostpone не хвърля', () => w.submitPostpone('t-nopp', 'regular', WED));
      await ticks(); await ticks();
      ok('submitPostpone → 0 POST / PATCH', writes(h) === 0, JSON.stringify(h.calls.post.concat(h.calls.patch)));
      /* Контрола: същото за разрешената записва — иначе „0" горе минава и при счупен submit. */
      guard('submitPostpone(t-ok) не хвърля', () => w.submitPostpone('t-ok', 'regular', WED));
      await settle(() => writes(h) > 0, 30);
      ok('КОНТРОЛА: разрешената се отлага (запис)', writes(h) >= 1, 'записи: ' + writes(h));
      fake.remove();

      h.calls.toast.length = 0; h.calls.post.length = 0; h.calls.patch.length = 0;
      guard('openNotApplicableModal не хвърля', () => w.openNotApplicableModal('t-nona', 'regular', WED));
      ok('модал „Не се отнася" НЕ се отваря', !h.doc.getElementById('na-modal-ov'));
      ok('toast за „Не се отнася"',
        h.calls.toast.join('|').indexOf('„Не се отнася" за тази задача е изключено от офиса') >= 0, h.calls.toast.join('|'));
      const fake2 = h.doc.createElement('div');
      fake2.innerHTML = '<textarea id="na-comment">няма такъв стелаж</textarea>';
      h.doc.body.appendChild(fake2);
      guard('submitNotApplicable не хвърля', () => w.submitNotApplicable('t-nona', 'regular', WED));
      await ticks(); await ticks();
      ok('submitNotApplicable → 0 POST / PATCH', writes(h) === 0, JSON.stringify(h.calls.post.concat(h.calls.patch)));
      fake2.remove();
    }
  }

  section('3. Офис: „🔒" в реда, отметките във формата (✏️) — запис праща двете полета');
  {
    const h = env({ user: ADMIN, comps: [] });
    if (await loaded(h)) {
      const body = txt(h.doc.body);
      ok('„🔒 без отлагане" в реда', body.indexOf('🔒 без отлагане') >= 0);
      ok('„🔒 без „Не се отнася"" в реда', body.indexOf('🔒 без „Не се отнася"') >= 0);
      ok('отметки в РЕДА няма (те са във формата)', h.doc.querySelectorAll('.bul-allow-edit').length === 0);

      const edit = Array.prototype.find.call(h.doc.querySelectorAll('button'),
        b => (b.getAttribute('onclick') || '').indexOf('openEditTaskModal(') >= 0 && b.getAttribute('data-task-id') === 't-nopp');
      if (ok('✏️ на задачата без отлагане', !!edit)) {
        realClick(h.w, edit, '✏️ t-nopp'); await ticks();
        const pp = h.doc.getElementById('etk-allow-pp'), na = h.doc.getElementById('etk-allow-na');
        if (ok('формата има двете отметки', !!pp && !!na)) {
          ok('„Обектът може да отлага" — НЕотметната (от записа)', pp.checked === false);
          ok('„…„Не се отнася"" — отметната', na.checked === true);
          ok('надписите', txt(h.doc.getElementById('etk-allow-wrap')).indexOf('Обектът може да отлага') >= 0 &&
            txt(h.doc.getElementById('etk-allow-wrap')).indexOf('Обектът може да маркира „Не се отнася"') >= 0);
          h.calls.patch.length = 0;
          na.checked = false;
          const save = Array.prototype.find.call(h.doc.querySelectorAll('#edit-tk-ov button'),
            b => (b.getAttribute('onclick') || '').indexOf('submitEditTask(') >= 0);
          realClick(h.w, save, '💾 Запази'); await settle(() => h.calls.patch.length > 0, 30);
          const p = h.calls.patch.filter(x => x.table === 'bulletin_tasks');
          if (ok('1 PATCH към bulletin_tasks', p.length === 1, JSON.stringify(h.calls.patch.map(x => x.table)))) {
            ok('allow_postpone:false', p[0].body.allow_postpone === false, JSON.stringify(p[0].body));
            ok('allow_not_applicable:false (махнатата отметка)', p[0].body.allow_not_applicable === false, JSON.stringify(p[0].body));
            ok('по id на задачата', /id=eq\.t-nopp/.test(p[0].url), p[0].url);
          }
        }
        const ov = h.doc.getElementById('edit-tk-ov'); if (ov) ov.remove();
      }
    }
  }

  section('3а. Офис: ✏️ на стар запис без полетата → двете отметнати, записва true');
  {
    const h = env({ user: ADMIN, comps: [] });
    if (await loaded(h)) {
      const editStale = Array.prototype.find.call(h.doc.querySelectorAll('button'),
        b => (b.getAttribute('onclick') || '').indexOf('openEditTaskModal(') >= 0 && b.getAttribute('data-task-id') === 't-stale');
      if (ok('✏️ на стар запис без полетата', !!editStale)) {
        realClick(h.w, editStale, '✏️ t-stale'); await ticks();
        const pp = h.doc.getElementById('etk-allow-pp'), na = h.doc.getElementById('etk-allow-na');
        ok('стар запис → и двете отметнати', !!pp && !!na && pp.checked && na.checked);
        h.calls.patch.length = 0;
        h.w.submitEditTask('t-stale'); await settle(() => h.calls.patch.length > 0, 30);
        const p = h.calls.patch.filter(x => x.table === 'bulletin_tasks');
        ok('запис без промяна → двете true', p.length === 1 && p[0].body.allow_postpone === true &&
          p[0].body.allow_not_applicable === true, JSON.stringify(p[0] && p[0].body));
        const ov = h.doc.getElementById('edit-tk-ov'); if (ov) ov.remove();
      }
    }
  }

  section('3б. Нова задача: отметките включени по подразбиране; „Само за информация" — без тях');
  {
    const h = env({ user: ADMIN, comps: [] });
    if (await loaded(h)) {
      const w = h.w;
      guard('openTaskModal не хвърля', () => w.openTaskModal());
      const pp = h.doc.getElementById('tk-allow-pp'), na = h.doc.getElementById('tk-allow-na');
      if (ok('формата „Нова задача" има двете отметки', !!pp && !!na)) {
        ok('и двете отметнати по подразбиране', pp.checked && na.checked);
        pp.checked = false;
        h.doc.getElementById('tk-title').value = 'НОВА';
        h.calls.post.length = 0;
        guard('submitTask не хвърля', () => w.submitTask());
        await settle(() => h.calls.post.length > 0, 30);
        const p = h.calls.post.filter(x => x.table === 'bulletin_tasks');
        if (ok('1 POST към bulletin_tasks', p.length === 1, JSON.stringify(h.calls.post.map(x => x.table)))) {
          ok('allow_postpone:false', p[0].body.allow_postpone === false, JSON.stringify(p[0].body));
          ok('allow_not_applicable:true', p[0].body.allow_not_applicable === true, JSON.stringify(p[0].body));
        }
        /* Записът затваря формата и презарежда бюлетина — изчаква се, иначе
           второто отваряне попада в средата на презареждането. */
        await settle(() => { const o = h.doc.getElementById('tk-ov'); return !!o && !o.classList.contains('open'); }, 60);
        for (let i = 0; i < 20; i++) await ticks();
        /* Повторно отваряне — отметките пак са включени (не помни махнатата). */
        guard('openTaskModal (втори път)', () => w.openTaskModal());
        ok('повторно отваряне → пак отметнати',
          h.doc.getElementById('tk-allow-pp').checked && h.doc.getElementById('tk-allow-na').checked);
        /* „Само за информация" */
        const sel = h.doc.getElementById('tk-type');
        sel.value = 'notice'; fire(w, sel, 'change');
        ok('„Само за информация" → отметките са скрити',
          h.doc.getElementById('tk-allow-wrap').style.display === 'none');
        h.doc.getElementById('tk-allow-na').checked = false;   /* скрита, но махната — не бива да важи */
        h.doc.getElementById('tk-title').value = 'ИНФО';
        h.calls.post.length = 0;
        guard('submitTask (notice)', () => w.submitTask());
        await settle(() => h.calls.post.length > 0, 30);
        const p2 = h.calls.post.filter(x => x.table === 'bulletin_tasks');
        await settle(() => { const o = h.doc.getElementById('tk-ov'); return !!o && !o.classList.contains('open'); }, 60);
        for (let i = 0; i < 20; i++) await ticks();
        ok('notice → двете true', p2.length === 1 && p2[0].body.allow_postpone === true &&
          p2[0].body.allow_not_applicable === true, JSON.stringify(p2[0] && p2[0].body));
        sel.value = 'photo'; fire(w, sel, 'change');
        ok('обратно на друг вид → отметките се виждат', h.doc.getElementById('tk-allow-wrap').style.display === '');
      }
    }
  }

  section('4. Вече отложен ред при allow_postpone=false — „↩ Отмени" остава');
  {
    const h = env();
    if (await loaded(h)) {
      ok('„↩ Отмени" на отлагането за t-old е там',
        Array.prototype.some.call(h.doc.querySelectorAll('button'),
          b => (b.getAttribute('onclick') || '').indexOf('cancelPostpone(') >= 0 && b.getAttribute('data-task-id') === 't-old'));
      ok('и „⏱ Отложи" за нея няма', btnsFor(h.doc.body, 't-old', PP).length === 0);
    }
  }

  report();
})();

/* ═══ МУТАНТИТЕ, ПУСНАТИ НА 28.10.2026 ═══════════════════════════════════════
   Чист код: 65 успешни, 0 неуспешни, exit 0 (база 5654ae8 + промяната).
   M1  bulRecAllows пак връща true за 'regular'      → exit 1, 10 ❌
   M2  ✏️ не праща полетата (без bulAllowFieldRead)    → exit 1, 3 ❌
   M3  новата задача не праща полетата                → exit 1, 3 ❌
   M4  submitPostpone без защита                      → exit 1, 1 ❌
   M5  bulRecBlocked търси само постоянните           → exit 1, 5 ❌
   M6  списъкът по отдел не гледа забраната           → exit 1, 1 ❌
   M7  „Само за информация“ записва скритата отметка  → exit 1, 1 ❌
   M8  стар запис без полетата = забранено            → exit 1, 2 ❌
*/
