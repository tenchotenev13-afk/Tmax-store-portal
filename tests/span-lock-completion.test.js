/* Многоседмична задача: модалът за отмятане трябва да се отваря (05.10.2026).

   СИМПТОМ НА ЖИВО. „Надстройка в буса за превоз на PVC плоскости"
   (task_type=photo, spans_from 28.09, starts_on 01.10, срок 15.10): клик на
   чекбокса → toast „Денят още не е настъпил", тоест задачата не може да бъде
   отметната от никого.

   ПРИЧИНА. Чекбоксът пита bulLockReason(cdate, linked, span) — той знае за
   многоседмичните. Входовете към самото отмятане питаха
   bulDateLockReason(cdate), тоест САМО датата, а при многоседмична
   completion_date е СРОКЪТ (решение D1): 15.10 > днес → 'future'.
   Засегнати бяха четири места: баджът (дали е пряк път), модалът за
   отмятане, модалът „Не се отнася" и отмяната на заявката.

   НАМЕРЕНО ПРИ СЪЩАТА ПРОВЕРКА. Модалът за отмятане проверяваше автоматичните
   модули на ръка и само за ЕДНОКРАТНИ ('transit-auto'), тоест ПОСТОЯННА
   автоматична задача („За връщане", „Разлики") можеше да се отметне ръчно,
   стигне ли се дотам през баджа — заобикаляйки заключения чекбокс.

   ТВЪРДЕНИЯТА:
   · многоседмична, в сила → баджът е пряк път и модалът се отваря;
   · преди starts_on → заключено с „Денят още не е настъпил";
   · след срока → заключено с „Денят е приключил";
   · същото за „Не се отнася за нас";
   · автоматичен модул (и постоянен!) → модалът отказва;
   · еднодневната задача не се променя (регресия).

   Пускане: node tests/span-lock-completion.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, realClick, ticks } = H;

/* Днес е ВТОРНИК на текущата седмица — датите долу са спрямо него, за да не
   гние тестът. Истинският случай е 05.10 с прозорец 01.10 → 15.10. */
const ANCHOR = (function () {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (1 - ((d.getDay() + 6) % 7)));
  return d;
})();
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const shift = n => { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() + n); return d; };
const TODAY = isoOf(shift(0));
const DAYS_AGO_4 = isoOf(shift(-4));     /* spans_from */
const DAYS_AGO_1 = isoOf(shift(-1));     /* starts_on — вече в сила */
const IN_10 = isoOf(shift(10));          /* срокът — напред */
const IN_3 = isoOf(shift(3));            /* бъдещ starts_on */
const DAYS_AGO_8 = isoOf(shift(-8));     /* минал срок */

function freezeDate(w) {
  const Real = w.Date, ms = ANCHOR.getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}

const STORE = 'Троян';
const USER = { email: 't@temax.bg', display_name: 'Иван Петров', role: 'manager', store_name: STORE };

/* Многоседмична задача: spans_from + starts_on + един срок. */
function spanTask(over) {
  return Object.assign({
    id: 'sp-1', bulletin_id: 'b-1', title: 'Надстройка в буса', department: 'warehouse',
    task_type: 'photo', due_date: IN_10, due_dates: [IN_10],
    spans_from: DAYS_AGO_4, starts_on: DAYS_AGO_1,
    target_stores: null, sort_order: 1, linked_module: null
  }, over || {});
}
/* Обикновена еднодневна — за регресията. */
function dayTask(over) {
  return Object.assign({
    id: 'd-1', bulletin_id: 'b-1', title: 'Еднодневна', department: 'trade',
    task_type: 'photo', due_date: TODAY, due_dates: [TODAY],
    spans_from: null, starts_on: null, target_stores: null, sort_order: 2, linked_module: null
  }, over || {});
}

function env(tasks, recurring) {
  const h = boot({
    modules: ['bulletin.js'],
    user: USER,
    data: {
      users: [{ store_name: STORE }], stores: [{ name: STORE }],
      bulletins: [{ id: 'b-1', week_number: 41, year: 2026, status: 'published',
                    created_at: TODAY, content: { calendar: {}, columns: { trade: [], warehouse: [], admin: [] } } }],
      bulletin_tasks: () => (tasks || []),
      recurring_tasks: () => (recurring || []),
      recurring_task_versions: [], recurring_task_periods: [], recurring_task_skips: [],
      task_completions: [], bulletin_promotions: [], task_subtasks: [], subtask_completions: []
    }
  });
  freezeDate(h.w);
  h.w.bulTasks = tasks || [];
  h.w.recurringTasks = recurring || [];
  h.w.curBul = { id: 'b-1', week_number: 41, year: 2026, status: 'published' };
  h.w.bulSelectedId = 'b-1';
  return h;
}
/* Реалният строител на ред от „План за деня" — там баджът и чекбоксът за
   многоседмичната се раждат с cdate = СРОКА (решение D1). */
function planRow(h, t, kind, cdate) {
  const it = { t: t, kind: kind || 'regular', cdate: cdate, done: false, comp: null };
  const host = h.doc.createElement('div');
  host.innerHTML = h.w.bulPlanRowHtml(it, STORE, h.w.bulWeekArr ? h.w.bulWeekArr() : []);
  h.doc.body.appendChild(host);
  return host;
}
const badgeIn = host => host.querySelector('span[onclick*="taskTypeBadgeClick"]');
const modal = h => h.doc.getElementById('tc-modal-ov');
const naModal = h => h.doc.getElementById('na-modal-ov');

(async function () {

  section('1. Причината за заключване — едно правило за всички входове');
  {
    const h = env([spanTask()]);
    const w = h.w;
    ok('многоседмична в сила → НЕ е заключена',
      w.bulLockReasonFor('regular', 'sp-1', IN_10) === null,
      String(w.bulLockReasonFor('regular', 'sp-1', IN_10)));
    /* Голата дата би казала 'future' — точно бъгът. */
    ok('КОНТРОЛА: голата дата я обявява за бъдеща',
      w.bulDateLockReason(IN_10) === 'future', String(w.bulDateLockReason(IN_10)));
    ok('преди starts_on → future',
      env([spanTask({ starts_on: IN_3 })]).w.bulLockReasonFor('regular', 'sp-1', IN_10) === 'future');
    ok('след срока → past',
      env([spanTask({ due_date: DAYS_AGO_8, due_dates: [DAYS_AGO_8] })]).w
        .bulLockReasonFor('regular', 'sp-1', DAYS_AGO_8) === 'past');
    ok('непозната задача → пада на датата (старото поведение)',
      w.bulLockReasonFor('regular', 'НЯМА-ТАКАВА', IN_10) === 'future');
    /* ПРЕНЕСЕНАТА задача не е в bulTasks за седмицата — тя е в
       bulCarriedTasks. Без този клон bulLockReasonFor пада на голата дата и
       пренесена многоседмична пак не може да се отметне. */
    const hc = env([]);
    hc.w.bulCarriedTasks = [spanTask({ id: 'sp-c' })];
    ok('пренесена многоседмична → намерена и отключена',
      hc.w.bulLockReasonFor('regular', 'sp-c', IN_10) === null,
      String(hc.w.bulLockReasonFor('regular', 'sp-c', IN_10)));
    ok('а без нея в кеша → пада на датата',
      env([]).w.bulLockReasonFor('regular', 'sp-c', IN_10) === 'future');
    hc.close();
    ok('еднодневна за днес → отключена',
      env([dayTask()]).w.bulLockReasonFor('regular', 'd-1', TODAY) === null);
    h.close();
  }

  section('2. Баджът е пряк път и модалът СЕ ОТВАРЯ (реален клик)');
  {
    const h = env([spanTask()]);
    const host = planRow(h, spanTask(), 'regular', IN_10);
    const b = badgeIn(host);
    if (ok('баджът на многоседмичната е кликаем', !!b, host.innerHTML.slice(0, 200))) {
      realClick(h.w, b);
      await ticks();
      ok('модалът за отмятане се отвори', !!modal(h),
        'toast: ' + JSON.stringify(h.calls.toast));
      ok('и няма toast „Денят още не е настъпил"',
        !h.calls.toast.some(t => String(t).indexOf('не е настъпил') >= 0),
        JSON.stringify(h.calls.toast));
      ok('в модала пише заглавието', (modal(h).textContent || '').indexOf('Надстройка в буса') >= 0);
    }
    h.close();
  }

  section('3. Преди starts_on и след срока — заключено');
  {
    const hb = env([spanTask({ starts_on: IN_3 })]);
    const hostB = planRow(hb, spanTask({ starts_on: IN_3 }), 'regular', IN_10);
    ok('преди starts_on баджът НЕ е пряк път', !badgeIn(hostB), 'кликаем е');
    hb.calls.toast.length = 0;
    guard('openTaskCompletionModal не хвърля', () => hb.w.openTaskCompletionModal('sp-1', 'regular', IN_10));
    await ticks();
    ok('модалът НЕ се отвори', !modal(hb));
    ok('и казва „Денят още не е настъпил"',
      hb.calls.toast.some(t => String(t).indexOf('Денят още не е настъпил') >= 0),
      JSON.stringify(hb.calls.toast));
    hb.close();

    const ha = env([spanTask({ due_date: DAYS_AGO_8, due_dates: [DAYS_AGO_8] })]);
    ha.calls.toast.length = 0;
    guard('openTaskCompletionModal не хвърля (минал срок)',
      () => ha.w.openTaskCompletionModal('sp-1', 'regular', DAYS_AGO_8));
    await ticks();
    ok('след срока модалът НЕ се отвори', !modal(ha));
    ok('и казва „Денят е приключил"',
      ha.calls.toast.some(t => String(t).indexOf('Денят е приключил') >= 0),
      JSON.stringify(ha.calls.toast));
    ha.close();
  }

  section('4. „Не се отнася за нас" — същото правило');
  {
    const h = env([spanTask()]);
    guard('openNotApplicableModal не хвърля', () => h.w.openNotApplicableModal('sp-1', 'regular', IN_10));
    await ticks();
    ok('модалът „Не се отнася" се отвори за многоседмичната', !!naModal(h),
      'toast: ' + JSON.stringify(h.calls.toast));
    h.close();

    const hb = env([spanTask({ starts_on: IN_3 })]);
    hb.calls.toast.length = 0;
    guard('и не хвърля преди starts_on', () => hb.w.openNotApplicableModal('sp-1', 'regular', IN_10));
    await ticks();
    ok('преди starts_on НЕ се отваря', !naModal(hb));
    ok('с „Денят още не е настъпил"',
      hb.calls.toast.some(t => String(t).indexOf('Денят още не е настъпил') >= 0),
      JSON.stringify(hb.calls.toast));
    hb.close();

    /* Реален клик по бутона на обекта. */
    const h2 = env([spanTask()]);
    const host = h2.doc.createElement('div');
    host.innerHTML = h2.w.bulNaBtnHtml('regular', spanTask(), IN_10, null);
    h2.doc.body.appendChild(host);
    const btnEl = host.querySelector('button');
    if (ok('бутонът „🚫 Не се отнася" го има', !!btnEl)) {
      realClick(h2.w, btnEl);
      await ticks();
      ok('и кликът отваря модала', !!naModal(h2), JSON.stringify(h2.calls.toast));
    }
    h2.close();
  }

  section('5. Отмяната на заявката');
  {
    /* Датата на реда е денят на ЗАЯВЯВАНЕТО (виж bulNaBtnHtml), не ден на
       задачата — затова „само днес" важи и за многоседмичната. */
    const h = env([spanTask()]);
    h.calls.toast.length = 0;
    h.calls.del.length = 0;
    guard('cancelNotApplicable не хвърля', () => h.w.cancelNotApplicable('sp-1', 'regular', TODAY));
    await ticks();
    ok('заявена ДНЕС → отмяната минава', h.calls.del.length > 0 || h.calls.get.length > 0,
      JSON.stringify(h.calls.toast));
    ok('и няма заключващ toast',
      !h.calls.toast.some(t => String(t).indexOf('Денят') >= 0), JSON.stringify(h.calls.toast));
    h.close();

    const h2 = env([spanTask()]);
    h2.calls.toast.length = 0;
    guard('и при минал ден не хвърля', () => h2.w.cancelNotApplicable('sp-1', 'regular', DAYS_AGO_8));
    await ticks();
    ok('заявена в МИНАЛ ден → отмяната е заключена',
      h2.calls.toast.some(t => String(t).indexOf('Денят е приключил') >= 0),
      JSON.stringify(h2.calls.toast));
    h2.close();
  }

  section('6. Автоматичните модули не се отмятат ръчно (намерено в движение)');
  {
    /* ПОСТОЯННА автоматична задача: дотук модалът проверяваше само
       'transit-auto' при ЕДНОКРАТНИТЕ, тоест тази минаваше. */
    const rec = [{ id: 'r-1', title: 'СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ', department: 'admin',
                   task_type: 'photo', active: true, due_weekday: 1, due_weekdays: [1],
                   due_time: null, due_window: false, target_stores: null,
                   linked_module: 'stock-returns' }];
    const h = env([], rec);
    h.calls.toast.length = 0;
    guard('openTaskCompletionModal не хвърля', () => h.w.openTaskCompletionModal('r-1', 'recurring', TODAY));
    await ticks();
    ok('постоянна автоматична → модалът НЕ се отваря', !modal(h), JSON.stringify(h.calls.toast));
    ok('и казва, че се отмята автоматично',
      h.calls.toast.some(t => String(t).indexOf('автоматично') >= 0), JSON.stringify(h.calls.toast));
    ok('и баджът ѝ не е пряк път',
      h.w.bulLockReasonFor('recurring', 'r-1', TODAY) === 'auto-returns',
      String(h.w.bulLockReasonFor('recurring', 'r-1', TODAY)));
    h.close();
  }

  section('7. РЕГРЕСИЯ: еднодневната задача е непроменена');
  {
    const h = env([dayTask()]);
    const host = planRow(h, dayTask(), 'regular', TODAY);
    const b = badgeIn(host);
    if (ok('баджът за днес е кликаем', !!b)) {
      realClick(h.w, b);
      await ticks();
      ok('модалът се отваря', !!modal(h), JSON.stringify(h.calls.toast));
    }
    h.close();

    const hy = env([dayTask({ due_date: DAYS_AGO_8, due_dates: [DAYS_AGO_8] })]);
    hy.calls.toast.length = 0;
    guard('минала еднодневна не хвърля',
      () => hy.w.openTaskCompletionModal('d-1', 'regular', DAYS_AGO_8));
    await ticks();
    ok('минала еднодневна → заключена както преди', !modal(hy));
    ok('с „Денят е приключил"',
      hy.calls.toast.some(t => String(t).indexOf('Денят е приключил') >= 0),
      JSON.stringify(hy.calls.toast));
    hy.close();
  }

  section('8. Нито един вход не е останал на голата дата');
  {
    const fs = require('fs'), path = require('path');
    const src = fs.readFileSync(path.join(process.argv[2] || '.', 'bulletin.js'), 'utf8');
    /* Отрязва се тялото на всяка от четирите функции и в него не бива да
       стои bulDateLockReason — иначе поправката е върната на едно място, а
       останалите три я прикриват. */
    const bodyOf = name => {
      const i = src.indexOf('function ' + name + '(');
      if (i < 0) return '(няма такава функция)';
      return src.slice(i, i + 1400);
    };
    ['taskTypeBadgeHtml', 'openTaskCompletionModal', 'openNotApplicableModal', 'cancelNotApplicable']
      .forEach(function (fn) {
        const b = bodyOf(fn);
        ok(fn + ' не ползва bulDateLockReason', b.indexOf('bulDateLockReason(') === -1,
          b.indexOf('bulDateLockReason(') >= 0 ? 'ползва я' : '');
      });
    ok('bulLockReasonFor съществува', src.indexOf('function bulLockReasonFor(') >= 0);
    ok('и минава през bulLockReason със span',
      src.indexOf('return bulLockReason(cdate, lockKey, bulSpanOf(t));') >= 0, 'няма го');
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
