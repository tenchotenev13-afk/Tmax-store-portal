/* Бюлетин — офисът забранява „⏱ Отложи" / „🚫 Не се отнася" по ПОСТОЯННА задача.

   Решение на Тенчо 28.10.2026, вариант А (по писмото на Миглена от 21.10 за
   РЕВИЗИЯ ГРУПИ). recurring_tasks.allow_postpone / allow_not_applicable —
   общи за всички седмици (като store_hints), PATCH върху recurring_tasks,
   НЕ нова версия. Вече отложеното / заявеното не се пипа.

   Какво заковава тестът:
     1. обект, allow_postpone=false → нито един <button> „⏱ Отложи" за задачата
        в списъка, „План за деня" и календара; allow_not_applicable=false →
        нито един „🚫 Не се отнася" там и в модала за отметка (отворен с
        истински клик по баджа на задачата);
     2. двете true → бутоните са както досега (контрола в същия рендер);
     3. забранено + директно извикване на четирите функции → toast,
        0 POST / PATCH, модал не се отваря;
     4. офисът (admin) маха отметка → 1 PATCH към recurring_tasks с
        allow_postpone:false, нищо към recurring_task_versions; знак
        „🔒 без отлагане" в реда; провал на записа → отметката се връща;
     5. вече отложен ред при allow_postpone=false → „Отложена → дд.мм" в
        списъка и „Пренесена от" в „План за деня" — както досега.

   ⚠️ Дати: котвата е сряда 12:00 от текущата реална седмица, замразена на
   w.Date; process.env.TZ = 'Europe/Sofia'.

   МУТАЦИИ (пуснати 28.10.2026 — резултатите в края на файла).

   Пускане: node tests/bul-allow-postpone.test.js . */
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
const MON = isoOf(shifted(-2));
const WED = isoOf(shifted(0));          /* ДНЕС */
const dm = iso => iso.slice(8, 10) + '.' + iso.slice(5, 7);

const TR = 'Троян';
const STORE_USER = { email: 's@temax.bg', display_name: 'Обект', role: 'store', store_name: TR };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function rec(id, over) {
  return Object.assign({
    id: id, title: 'Постоянна ' + id, department: 'trade', task_type: 'photo',
    description: null, target_stores: null, due_weekday: null, due_weekdays: [2],
    due_time: '10:00', due_window: false, linked_module: null, report_groups: null,
    attachments: null, active: true, sort_order: 1, store_hints: null,
    allow_postpone: true, allow_not_applicable: true
  }, over || {});
}
function recs() {
  return [
    rec('r-nopp', { title: 'БЕЗ ОТЛАГАНЕ', allow_postpone: false, sort_order: 1 }),
    rec('r-nona', { title: 'БЕЗ НЕ СЕ ОТНАСЯ', allow_not_applicable: false, sort_order: 2 }),
    rec('r-ok',   { title: 'РАЗРЕШЕНА', sort_order: 3 }),
    /* Отложена В ПОНЕДЕЛНИК за днес, ПРЕДИ забраната — редът не се пипа. */
    rec('r-old',  { title: 'РЕВИЗИЯ ГРУПИ', due_weekdays: [0], allow_postpone: false, sort_order: 4 })
  ];
}
const PERIODS = ['r-nopp', 'r-nona', 'r-ok', 'r-old'].map(id =>
  ({ id: 'p-' + id, recurring_task_id: id, from_monday: isoOf(shifted(-30)), to_monday: null }));
const OLD_PP = { id: 'c-old', task_id: null, recurring_task_id: 'r-old', store_name: TR, status: 'postponed',
  completion_date: MON, postponed_to: WED, comment: 'ремонт', completed_by: 'Обект' };

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
  const R = recs();
  const h = boot({
    modules: ['bulletin.js'],
    user: opts.user || STORE_USER,
    fail: opts.fail,
    data: {
      users: [{ store_name: TR }],
      recurring_tasks: url => { const m = /[?&]active=eq\.(true|false)/.exec(url);
        return R.filter(r => !m || String(!!r.active) === m[1]).map(r => Object.assign({}, r)); },
      recurring_task_periods: PERIODS,
      recurring_task_skips: [],
      recurring_task_versions: [],
      bulletins: url => { const m = /[?&]id=eq\.([^&]+)/.exec(url); return m ? h.buls.filter(b => b.id === m[1]) : h.buls; },
      bulletin_tasks: [],
      task_completions: tcRoute(opts.comps || [OLD_PP]),
      subtask_completions: [],
      task_subtasks: []
    }
  });
  freezeDate(h.w);
  h.buls = [bulOf(h.w, 'b-cur')];
  h.w.bulSelectedId = 'b-cur';
  h.w.bulActiveDept = 'trade';
  h.w.reportableStoresCache = [TR];
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
/* Само <button> — текстът „⏱ Отложена" в бадж не е бутон. */
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

  section('1–2. Обект: бутоните по задачи — списък, „План за деня", календар');
  {
    const h = env();
    if (ok('бюлетинът се зарежда', await loaded(h))) {
      const all = h.doc.body, plan = sec(h, 'sec-dayplan'), cal = sec(h, 'sec-calendar');
      ok('„План за деня" е на екрана', !!plan);
      /* Забранено отлагане */
      ok('allow_postpone=false → 0 „⏱ Отложи" в цялата страница',
        btnsFor(all, 'r-nopp', PP).length === 0, btnsFor(all, 'r-nopp', PP).map(b => b.outerHTML.slice(0, 120)).join(' | '));
      ok('allow_postpone=false → 0 „⏱ Отложи" в „План за деня"', btnsFor(plan, 'r-nopp', PP).length === 0);
      ok('allow_postpone=false → 0 „⏱ Отложи" в календара', btnsFor(cal, 'r-nopp', PP).length === 0);
      ok('…а „🚫 Не се отнася" за нея си стои', btnsFor(all, 'r-nopp', NA).length >= 1);
      /* Забранено „Не се отнася" */
      ok('allow_not_applicable=false → 0 „🚫 Не се отнася" в цялата страница',
        btnsFor(all, 'r-nona', NA).length === 0);
      ok('allow_not_applicable=false → 0 в „План за деня"', btnsFor(plan, 'r-nona', NA).length === 0);
      ok('allow_not_applicable=false → 0 в календара', btnsFor(cal, 'r-nona', NA).length === 0);
      ok('…а „⏱ Отложи" за нея си стои', btnsFor(all, 'r-nona', PP).length >= 1);
      /* Контрола: двете true */
      ok('КОНТРОЛА: разрешената има „⏱ Отложи" в списъка и в плана',
        btnsFor(all, 'r-ok', PP).length >= 2 && btnsFor(plan, 'r-ok', PP).length === 1,
        btnsFor(all, 'r-ok', PP).length + ' / план ' + btnsFor(plan, 'r-ok', PP).length);
      ok('КОНТРОЛА: разрешената има „🚫 Не се отнася" в списъка и в плана',
        btnsFor(all, 'r-ok', NA).length >= 2 && btnsFor(plan, 'r-ok', NA).length === 1,
        btnsFor(all, 'r-ok', NA).length + ' / план ' + btnsFor(plan, 'r-ok', NA).length);
      ok('обектът не вижда отметките на офиса', h.doc.querySelectorAll('.bul-allow-edit').length === 0);
      ok('обектът не вижда знака „🔒"', h.doc.querySelectorAll('.bul-allow-tags').length === 0);

      /* Модалът за отметка — истински клик по баджа на задачата. */
      const badge = id => Array.prototype.find.call(h.doc.querySelectorAll('[onclick*="taskTypeBadgeClick"]'),
        el => el.getAttribute('data-task-id') === id && !plan.contains(el));
      const modalNa = () => {
        const ov = h.doc.getElementById('tc-modal-ov');
        return ov ? Array.prototype.filter.call(ov.querySelectorAll('button'),
          b => (b.getAttribute('onclick') || '').indexOf(NA + '(') >= 0).length : -1;
      };
      const closeModal = () => { const ov = h.doc.getElementById('tc-modal-ov'); if (ov) ov.remove(); };
      const b1 = badge('r-nona');
      if (ok('бадж на задачата без „Не се отнася" е кликаем', !!b1)) {
        realClick(h.w, b1, 'бадж r-nona'); await ticks();
        ok('модалът за отметка: 0 „🚫 Не се отнася за нас"', modalNa() === 0, 'бутони: ' + modalNa());
        closeModal();
      }
      const b2 = badge('r-ok');
      if (ok('КОНТРОЛА: бадж на разрешената е кликаем', !!b2)) {
        realClick(h.w, b2, 'бадж r-ok'); await ticks();
        ok('КОНТРОЛА: модалът има „🚫 Не се отнася за нас"', modalNa() === 1, 'бутони: ' + modalNa());
        closeModal();
      }
      /* Календарът няма <button> изобщо (затова „0 в календара" горе само по
         себе си не казва нищо) — пътят оттам е отметката в клетката →
         bulRecurringCheckboxChanged → същият модал за отметка. */
      ok('календарът показва задачите (иначе проверките за него са празни)',
        txt(cal).indexOf('БЕЗ ОТЛАГАНЕ') >= 0 && txt(cal).indexOf('БЕЗ НЕ СЕ ОТНАСЯ') >= 0);
      const calCb = id => cal.querySelector('input[type=checkbox][data-rtid="' + id + '"]');
      const c1 = calCb('r-nona');
      if (ok('отметка в календара за задачата без „Не се отнася"', !!c1)) {
        c1.checked = true; fire(h.w, c1, 'change'); await ticks();
        ok('календар → модал: 0 „🚫 Не се отнася за нас"', modalNa() === 0, 'бутони: ' + modalNa());
        closeModal();
      }
      const c2 = calCb('r-ok');
      if (ok('КОНТРОЛА: отметка в календара за разрешената', !!c2)) {
        c2.checked = true; fire(h.w, c2, 'change'); await ticks();
        ok('КОНТРОЛА: календар → модал има „🚫 Не се отнася за нас"', modalNa() === 1, 'бутони: ' + modalNa());
        closeModal();
      }
    }
  }

  section('3. Забранено + директно извикване (стар таб) → toast, 0 записа');
  {
    const h = env({ comps: [] });
    if (await loaded(h)) {
      const w = h.w;
      h.calls.toast.length = 0; h.calls.post.length = 0; h.calls.patch.length = 0;
      guard('openPostponeModal не хвърля', () => w.openPostponeModal('r-nopp', 'recurring', WED));
      ok('модал за отлагане НЕ се отваря', !h.doc.getElementById('pp-modal-ov'));
      ok('toast „Отлагането на тази задача е изключено от офиса"',
        h.calls.toast.join('|').indexOf('Отлагането на тази задача е изключено от офиса') >= 0, h.calls.toast.join('|'));

      /* submitPostpone с попълнена форма — от модал, отворен преди забраната. */
      const fake = h.doc.createElement('div');
      fake.innerHTML = '<textarea id="pp-comment">причина</textarea><input id="pp-date" value="' + isoOf(shifted(1)) + '">';
      h.doc.body.appendChild(fake);
      guard('submitPostpone не хвърля', () => w.submitPostpone('r-nopp', 'recurring', WED));
      await ticks(); await ticks();
      ok('submitPostpone → 0 POST / PATCH', writes(h) === 0, JSON.stringify(h.calls.post.concat(h.calls.patch)));
      fake.remove();

      h.calls.toast.length = 0;
      guard('openNotApplicableModal не хвърля', () => w.openNotApplicableModal('r-nona', 'recurring', WED));
      ok('модал „Не се отнася" НЕ се отваря', !h.doc.getElementById('na-modal-ov'));
      ok('toast „„Не се отнася" за тази задача е изключено от офиса"',
        h.calls.toast.join('|').indexOf('„Не се отнася" за тази задача е изключено от офиса') >= 0, h.calls.toast.join('|'));
      const fake2 = h.doc.createElement('div');
      fake2.innerHTML = '<textarea id="na-comment">няма такъв стелаж</textarea>';
      h.doc.body.appendChild(fake2);
      guard('submitNotApplicable не хвърля', () => w.submitNotApplicable('r-nona', 'recurring', WED));
      await ticks(); await ticks();
      ok('submitNotApplicable → 0 POST / PATCH', writes(h) === 0, JSON.stringify(h.calls.post.concat(h.calls.patch)));

      /* Контрола: същото извикване за разрешената задача ЗАПИСВА — иначе
         „0 записа" горе би минавало и при счупен submit. */
      guard('submitNotApplicable(r-ok) не хвърля', () => w.submitNotApplicable('r-ok', 'recurring', WED));
      await settle(() => writes(h) > 0, 30);
      ok('КОНТРОЛА: разрешената задача записва', writes(h) >= 1, 'записи: ' + writes(h));
      fake2.remove();
    }
  }

  section('4. Офис (admin) маха „Обектът може да отлага" → 1 PATCH, без версия');
  {
    const h = env({ user: ADMIN, comps: [] });
    if (await loaded(h)) {
      const cbOf = (id, f) => h.doc.querySelector('.bul-allow-edit input[data-rtid="' + id + '"][data-field="' + f + '"]');
      const cb = cbOf('r-ok', 'allow_postpone');
      ok('отметките са в реда при „💡" (за canEdit)', !!cb && !!cbOf('r-ok', 'allow_not_applicable'));
      ok('знак „🔒 без отлагане" при вече забранената',
        txt(h.doc.body).indexOf('🔒 без отлагане') >= 0);
      ok('знак „🔒 без „Не се отнася"" при вече забранената',
        txt(h.doc.body).indexOf('🔒 без „Не се отнася"') >= 0);
      if (cb) {
        ok('разрешената е отметната', cb.checked === true);
        h.calls.patch.length = 0; h.calls.post.length = 0;
        cb.checked = false; fire(h.w, cb, 'change');   /* както браузърът: първо се сменя, после onchange */
        await settle(() => h.calls.patch.length > 0, 30);
        const p = h.calls.patch.filter(x => x.table === 'recurring_tasks');
        if (ok('1 PATCH към recurring_tasks', p.length === 1, JSON.stringify(h.calls.patch))) {
          ok('тяло точно {allow_postpone:false}', JSON.stringify(p[0].body) === '{"allow_postpone":false}', JSON.stringify(p[0].body));
          ok('по id на задачата', /id=eq\.r-ok/.test(p[0].url), p[0].url);
        }
        ok('НИЩО към recurring_task_versions',
          h.calls.post.concat(h.calls.patch).filter(x => x.table === 'recurring_task_versions').length === 0,
          JSON.stringify(h.calls.post.concat(h.calls.patch).map(x => x.table)));
        ok('без други записи', h.calls.post.length === 0 && h.calls.patch.length === 1);
        await ticks();
        const cb2 = cbOf('r-ok', 'allow_postpone');
        ok('след запис: отметката е махната', !!cb2 && cb2.checked === false);
        ok('паметта е обновена (recurringAll)',
          (h.w.recurringAll || []).find(x => x.id === 'r-ok').allow_postpone === false);
      }
    }
  }

  section('4б. Провал на записа → червен toast, отметката се връща');
  {
    const h = env({ user: ADMIN, comps: [], fail: { PATCH: /recurring_tasks/ } });
    if (await loaded(h)) {
      const cb = h.doc.querySelector('.bul-allow-edit input[data-rtid="r-ok"][data-field="allow_not_applicable"]');
      if (ok('отметката „Не се отнася" е налична', !!cb)) {
        h.calls.toast.length = 0;
        cb.checked = false; fire(h.w, cb, 'change');
        await settle(() => h.calls.toast.some(t => /Грешка при запис/.test(t)), 30);
        ok('toast „Грешка при запис"', h.calls.toast.some(t => /Грешка при запис/.test(t)), h.calls.toast.join('|'));
        ok('отметката е върната (отметната)', cb.checked === true);
        ok('паметта НЕ е пипната',
          (h.w.recurringAll || []).find(x => x.id === 'r-ok').allow_not_applicable === true);
      }
    }
  }

  section('5. Вече отложен ред при allow_postpone=false — показва се както досега');
  {
    const h = env();
    if (await loaded(h)) {
      ok('списъкът: „Отложена → ' + dm(WED) + '"',
        txt(h.doc.body).indexOf('→ ' + dm(WED)) >= 0, txt(h.doc.body).slice(0, 0));
      const plan = sec(h, 'sec-dayplan');
      ok('„План за деня": „Пренесена от"', txt(plan).indexOf('Пренесена от') >= 0, txt(plan).slice(0, 400));
      ok('и пренесеният ред е с РЕВИЗИЯ ГРУПИ', txt(plan).indexOf('РЕВИЗИЯ ГРУПИ') >= 0);
      ok('„↩ Отмени" на отлагането не се крие (вече отложеното не се пипа)',
        Array.prototype.some.call(h.doc.querySelectorAll('button'),
          b => (b.getAttribute('onclick') || '').indexOf('cancelPostpone(') >= 0 && b.getAttribute('data-task-id') === 'r-old'),
        '(няма ↩ Отмени за r-old)');
    }
  }

  report();
})();

/* ═══ МУТАНТИТЕ, ПУСНАТИ НА 28.10.2026 ═══════════════════════════════════════
   Чист код: 59 успешни, 0 неуспешни, exit 0 (база 58ac1b7 + промяната).
   M1  списъкът не гледа allow_postpone               → exit 1, 1 ❌ (цялата страница)
   M2  bulNaBtnHtml не гледа allow_not_applicable      → exit 1, 2 ❌ (страница, „План за деня")
   M3  openPostponeModal без защита                    → exit 1, 2 ❌ (модалът се отваря, няма toast)
   M4  PATCH в recurring_task_versions                 → exit 1, 5 ❌ (1 PATCH, тяло, версии, памет)
   M5  „План за деня" не гледа allow_postpone          → exit 1, 2 ❌
   M6  модалът за отметка не гледа allow_not_applicable → exit 1, 2 ❌ (бадж и календар)
   M7  submitNotApplicable без защита                  → exit 1, 1 ❌ (POST към task_completions)
   M8  submitPostpone без защита                       → exit 1, 2 ❌ (POST към task_completions)
*/
