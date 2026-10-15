/* Пренесен (отложен) ред на ИЗКЛЮЧЕНА постоянна задача — не се показва на обекта.

   Продължение на skip-hide (5001805): bulSkipHidden() скри изключената за
   седмицата постоянна задача от списъка, календара и „План за деня", но
   пренесеното ѝ явяване (bulCarriedRows → it.carried / carriedForDay) минаваше
   покрай проверката. Случай: обектът отлага постоянната задача от понеделник
   за четвъртък, после офисът я изключва за седмицата → в четвъртък обектът
   още вижда „⏱ Пренесена от". Решение на Тенчо 15.10: обектът не вижда нищо
   от изключена задача. Филтърът е bulCarriedHidden() в рендера (план,
   календар, печат) и в today.js; bulCarriedRows() не е пипан.

   Сценарии при обект Петрич, постоянна задача дължима в понеделник, отложена
   за четвъртък (= днес, котвата):
     1. глобално изключване → в календара и в плана няма ред за задачата —
        нито собствен, нито пренесен (по заглавие и по data-tid, само в
        контейнера на изгледа);
     2. изключване само за ДРУГ обект → пренесеният ред се вижда в четвъртък,
        с „⏱ Пренесена от" в плана и „⏱ от" в календара;
     3. без изключване → както в 2;
     4. отложена ОБИКНОВЕНА задача + несвързано изключване на постоянна →
        пренесеният ред на обикновената се вижда.
   Плюс: печатът за обекта не носи пренесения ред на изключената (сц.1) и го
   носи при сц.3; „Днес" (сц.5) не брои пренесения ред на изключената за
   Петрич, а при изключване за Добрич го брои.

   Мутации (15.10.2026, всяка срещу bulletin.js, после върнат):
     (а) махнат `if(bulCarriedHidden(r)) return;` в bulPlanGroups → сц.1 (план) пада ✔
     (б) махнат `&&!bulCarriedHidden(r)` от carItems в календара → сц.1 (календар) пада ✔
     (в) bulCarriedHidden без `r.kind==='recurring'&&` (филтърът и за обикновени;
         id-то на обикновената съвпада с изключена постоянна) → сц.4 пада ✔
     (г) махнат филтърът на pCar в печата → печат сц.1 пада ✔
     (д) махнат новият ред в today.js (carriedRaw) → сц.5 пада ✔

   Пускане: node tests/skip-hide-carried.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

/* Котва: четвъртъкът от текущата реална седмица. */
const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (4 - ((d.getDay() + 6) % 7)));
  return d;
})();
function isoOf(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function shifted(days) { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() + days); return d; }
const THU = isoOf(ANCHOR), MON = isoOf(shifted(-3));
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

const PE = 'Петрич', DO = 'Добрич';
const REC = { id: 'r-pp', title: 'Постоянна от понеделник', department: 'trade', task_type: 'info',
  target_stores: null, due_weekday: 0, due_weekdays: null, due_time: '18:00',
  linked_module: null, active: true, sort_order: 0 };
/* id-то на обикновената СЪВПАДА с изключената постоянна r-x: двете таблици
   имат отделни id-та и съвпадение е възможно — точно от него пази проверката
   за вид в bulCarriedHidden() (мутация в). */
const REG = { id: 'r-x', bulletin_id: 'b-1', department: 'trade', title: 'Обикновена от понеделник',
  description: null, due_date: MON, due_dates: [MON], spans_from: null, starts_on: null,
  target_stores: null, task_type: 'info', report_groups: null, linked_module: null,
  auto_complete: false, attachments: null, sort_order: 1, created_by: 'Админ', created_at: MON };
const OTHER = Object.assign({}, REC, { id: 'r-x', title: 'Друга постоянна', due_weekday: 1 });

function env(user, skips, extra) {
  let bul = null;
  extra = extra || {};
  const comps = extra.comps || [
    { id: 'c-pp', recurring_task_id: 'r-pp', task_id: null, store_name: PE, status: 'postponed',
      completion_date: MON, postponed_to: THU, comment: 'нямаше време' }
  ];
  const h = boot({
    modules: extra.modules || ['bulletin.js'],
    user: Object.assign({ email: 'u@temax.bg', display_name: 'Тест' }, user),
    data: {
      users: [{ store_name: PE }, { store_name: DO }],
      recurring_tasks: [REC, OTHER],
      recurring_task_skips: () => skips.map(s => Object.assign({ year: isoWeekYear(ANCHOR), week_number: h.w.weekNum(ANCHOR), reason: null, created_by: 'Миглена' }, s)),
      bulletins: () => [bul],
      bulletin_tasks: extra.tasks || [],
      task_completions: url => (url.indexOf('postponed_to=') >= 0 ? comps.filter(c => !!c.postponed_to) : comps)
    }
  });
  freezeDate(h.w);
  try { h.w.localStorage.removeItem('bulPlanOpen'); } catch (e) {}
  const cal = {};
  h.w.DKEYS.forEach(k => { cal[k] = []; });
  bul = { id: 'b-1', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published',
    content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
  return h;
}
async function settle(cond, max) {
  for (let i = 0; i < (max || 40); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
function txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
function count(hay, needle) { return hay.split(needle).length - 1; }

async function load(skips, extra) {
  const h = env({ role: 'manager', store_name: PE }, skips, extra);
  h.w.bulActiveDept = 'trade';
  h.w.reportableStoresCache = [PE, DO];
  guard('loadBulletin() не хвърля', () => h.w.loadBulletin());
  await settle(() => !!h.doc.getElementById('sec-calendar') && !!h.doc.getElementById('sec-dayplan') &&
    Array.isArray(h.w.bulCarried) && h.w.bulCarried.length > 0);
  return h;
}
function views(h, id, title) {
  const doc = h.doc;
  const cal = doc.getElementById('sec-calendar'), plan = doc.getElementById('sec-dayplan');
  return {
    calTitle: count(txt(cal), title),
    /* Само чекбоксът на ПРЕНЕСЕНИЯ ред — собственият ред на обикновената
       задача също носи data-tid. */
    calTid: cal ? cal.querySelectorAll('input[data-tid="' + id + '"][onchange*="bulCarriedCheckboxChanged"]').length : -1,
    planTitle: count(txt(plan), title),
    planTid: plan ? plan.querySelectorAll('input[data-tid="' + id + '"][onchange*="bulCarriedCheckboxChanged"]').length : -1,
    planAnyTid: plan ? plan.querySelectorAll('[data-tid="' + id + '"]').length : -1,
    calAnyTid: cal ? cal.querySelectorAll('[data-tid="' + id + '"],[data-rtid="' + id + '"]').length : -1,
    planText: txt(plan), calText: txt(cal)
  };
}
/* Печатът за обекта — календарът на листа (printSection('cal')), уловен през
   window.open, както в recurring-task-skips.test.js. */
function printText(h) {
  let buf = '';
  h.w._printOrientation = 'portrait';
  h.w.open = () => ({ document: { write: s => { buf += s; }, close: () => {} }, focus: () => {} });
  guard('printSection("cal") не хвърля', () => h.w.printSection('cal'));
  return buf;
}

(async function () {

  section('1. Петрич, глобално изключване → няма ред нито собствен, нито пренесен');
  {
    const h = await load([{ id: 's1', recurring_task_id: 'r-pp', store_name: null }]);
    ok('пренесеното е заредено (bulCarried)', h.w.bulCarried.length === 1);
    ok('plan-ът е за четвъртък', h.w.bulPlanDay() === THU, h.w.bulPlanDay());
    const v = views(h, 'r-pp', REC.title);
    ok('календар: няма заглавие', v.calTitle === 0, 'срещания: ' + v.calTitle);
    ok('календар: няма data-tid/data-rtid="r-pp"', v.calAnyTid === 0, v.calAnyTid);
    ok('план: няма заглавие', v.planTitle === 0, 'срещания: ' + v.planTitle);
    ok('план: няма data-tid="r-pp"', v.planAnyTid === 0, v.planAnyTid);
    ok('план: няма „Пренесена от"', v.planText.indexOf('Пренесена от') < 0);
    const ph = printText(h);
    ok('печат: без пренесения ред', ph.indexOf('⏱ ' + REC.title) < 0, ph.slice(0, 80));
  }

  section('2. Петрич, изключване само за Добрич → пренесеният ред се вижда');
  {
    const h = await load([{ id: 's2', recurring_task_id: 'r-pp', store_name: DO }]);
    const v = views(h, 'r-pp', REC.title);
    ok('календар: чекбокс на пренесения ред (data-tid)', v.calTid === 1, v.calTid);
    ok('календар: „⏱ от ' + h.w.bulDM(MON) + '"', v.calText.indexOf('⏱ от ' + h.w.bulDM(MON)) >= 0);
    ok('план: пренесеният ред (data-tid)', v.planTid === 1, v.planTid);
    ok('план: „⏱ Пренесена от"', v.planText.indexOf('⏱ Пренесена от') >= 0);
  }

  section('3. Петрич, без изключване → както в 2');
  {
    const h = await load([]);
    const v = views(h, 'r-pp', REC.title);
    ok('календар: пренесен ред (data-tid)', v.calTid === 1, v.calTid);
    ok('календар: собствен ред в понеделник + пренесен в четвъртък', v.calTitle === 2, v.calTitle);
    ok('план: пренесеният ред', v.planTid === 1 && v.planText.indexOf('⏱ Пренесена от') >= 0);
    const ph = printText(h);
    ok('печат: пренесеният ред е на листа', ph.indexOf('⏱ ' + REC.title) >= 0);
  }

  section('4. Отложена ОБИКНОВЕНА + несвързано изключване на постоянна → видима');
  {
    const h = await load(
      [{ id: 's3', recurring_task_id: 'r-x', store_name: null }, { id: 's4', recurring_task_id: 'r-pp', store_name: null }],
      { tasks: [REG], comps: [{ id: 'c-t', task_id: 'r-x', recurring_task_id: null, store_name: PE, status: 'postponed',
        completion_date: MON, postponed_to: THU, comment: null }] });
    const v = views(h, 'r-x', REG.title);
    ok('календар: пренесеният ред на обикновената', v.calTid === 1, v.calTid);
    ok('план: пренесеният ред на обикновената', v.planTid === 1 && v.planText.indexOf('⏱ Пренесена от') >= 0, v.planTid);
  }

  section('5. „Днес": пренесен ред на изключена постоянна не е елемент за обекта');
  {
    const dayOf = async (skips) => {
      const h = env({ role: 'admin', store_name: 'Централен офис' }, skips, { modules: ['bulletin.js', 'today.js'] });
      if (!guard('loadTodayDashboard() не хвърля', () => h.w.loadTodayDashboard())) return null;
      await settle(() => !!h.w.todayCache);
      await ticks(); await ticks();
      return h.w.todayCache;
    };
    const cg = await dayOf([{ id: 's1', recurring_task_id: 'r-pp', store_name: null }]);
    if (ok('таблото се зареди (глобално изключване)', !!cg)) {
      const car = (cg.items || []).filter(i => i.carried_from && String(i.id) === 'r-pp');
      ok('глобално изключена: няма пренесен елемент за Петрич', car.length === 0, JSON.stringify(car));
    }
    const co = await dayOf([{ id: 's2', recurring_task_id: 'r-pp', store_name: DO }]);
    if (ok('таблото се зареди (изключване за Добрич)', !!co)) {
      const car = (co.items || []).filter(i => i.carried_from && String(i.id) === 'r-pp');
      ok('изключена за Добрич: пренесеният елемент на Петрич остава', car.length === 1 &&
        JSON.stringify(car[0].target_stores) === JSON.stringify([PE]), JSON.stringify(car));
    }
  }

  report();
})().catch(e => {
  /* Хвърляне извън guard() не бива да умре мълчаливо преди report(). */
  ok('тестът стига до края без необработено изключение', false, e && e.stack);
  report();
});
