/* Постоянните задачи по седмици (recurring_task_periods) — ЧЕТЕНЕ.

   Задачата важи за седмица W, ако има период
     from_monday <= W.monday  и  (to_monday null  или  to_monday >= W.monday).
   Стар бюлетин не се променя, когато задача се спре/активира/създаде по-късно.

   Какво заковава тестът (част 1 — без бутоните):
     1. помощниците в shared.js: recurringMondayOf / recurringValidForWeek /
        recurringTasksForWeek (границите включително; задача без период → по
        кеша active);
     2. Бюлетинът тегли ВСИЧКИ recurring_tasks (без active=eq.true) + периодите;
     3. МИНАЛАТА седмица показва спряната „Ревизии 953" и „Промоция 1+1", но
        не „новата" (активна от тази седмица);
     4. ТЕКУЩАТА и СЛЕДВАЩАТА — без двете спрени, с новата;
        loadTasksStats за миналата седмица брои спряната (1/2), за текущата —
        не (0/2);
     4б. редакция (реален клик ✏️ → „Запази") в стар бюлетин презарежда
        всички задачи + периодите — спряната не изчезва;
     5. ръчното известие за днешните срокове взима ДНЕШНАТА седмица, дори
        когато е отворен стар бюлетин;
     6. провалена заявка за периодите → кешът active, бюлетинът не е празен;
     7. чек листът: седмица, в която задачата не важи → празна клетка;
        важи → стойността се пише (контрола).

   Сценарият е като на 11.09.2026: „Ревизии 953" и „Промоция 1+1" спрени в
   текущата седмица (to_monday = миналият понеделник), „Промоция 1+1"
   създадена миналата седмица (период само за нея).

   ⚠️ Дати: котвата е сряда от текущата реална седмица, замразена на w.Date;
   понеделниците се смятат НЕЗАВИСИМО от кода под тест.

   Пускане: node tests/recurring-periods.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

/* ── Котва: сряда 12:00 от текущата седмица ─────────────────────────────── */
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
const MON0 = isoOf(shifted(-2));       /* понеделник на текущата седмица */
const MON_PREV = isoOf(shifted(-9));   /* миналата */
const MON_NEXT = isoOf(shifted(5));    /* следващата */
const MON_OLD = isoOf(shifted(-37));   /* пет седмици назад — начало на старите */
const WED_PREV = isoOf(shifted(-7));

const TR = 'Троян';
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function rec(id, over) {
  return Object.assign({
    id: id, title: 'Задача ' + id, department: 'admin', task_type: 'info',
    description: null, target_stores: null, due_weekday: null, due_weekdays: [2],
    due_time: '10:00', due_window: false, linked_module: null, report_groups: null,
    attachments: null, active: true, sort_order: 0
  }, over || {});
}
/* Сряда — дължима и днес (котвата е сряда): така известието за днес би я
   хванало, ако не беше отсята по седмица. */
const RECS = [
  rec('r-rev',    { title: 'Ревизии 953', active: false, sort_order: 1 }),
  rec('r-act',    { title: 'Работна отдавна', due_weekdays: [0], due_time: '09:00', sort_order: 2 }),
  rec('r-new',    { title: 'Нова от тази седмица', due_time: '11:00', sort_order: 3 }),
  rec('r-promo',  { title: 'Промоция 1+1', department: 'trade', active: false, sort_order: 4 }),
  rec('r-legacy', { title: 'Без период активна', department: 'warehouse', due_time: '13:00', sort_order: 5 }),
  rec('r-dead',   { title: 'Без период спряна', department: 'warehouse', active: false, sort_order: 6 })
];
const PERIODS = [
  { id: 'p1', recurring_task_id: 'r-rev',   from_monday: MON_OLD,  to_monday: MON_PREV },
  { id: 'p2', recurring_task_id: 'r-act',   from_monday: MON_OLD,  to_monday: null },
  { id: 'p3', recurring_task_id: 'r-new',   from_monday: MON0,     to_monday: null },
  { id: 'p4', recurring_task_id: 'r-promo', from_monday: MON_PREV, to_monday: MON_PREV }
  /* r-legacy и r-dead — нарочно без период */
];
const TITLES = Object.fromEntries(RECS.map(r => [r.id, r.title]));

function bulOf(w, id, dayInWeek) {
  const d = shifted(dayInWeek);
  const cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });
  return { id: id, week_number: w.weekNum(d), year: isoWeekYear(d), status: 'published', created_at: isoOf(d),
           content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
}

function env(bulId, extra) {
  extra = extra || {};
  const h = boot(Object.assign({
    modules: ['bulletin.js'],
    user: ADMIN,
    data: {
      users: [{ store_name: TR }],
      /* active=eq.… се прилага като в PostgREST — стара заявка с
         active=eq.true наистина би загубила спряната, не само „изглеждала". */
      recurring_tasks: url => { const m = /[?&]active=eq\.(true|false)/.exec(url);
        return RECS.filter(r => !m || String(!!r.active) === m[1]); },
      recurring_task_periods: PERIODS,
      recurring_task_skips: [],
      bulletins: url => { const m = /[?&]id=eq\.([^&]+)/.exec(url); return m ? h.buls.filter(b => b.id === m[1]) : h.buls; },
      /* По една обикновена задача на бюлетин — иначе loadTasksStats() излиза. */
      bulletin_tasks: url => { const m = /bulletin_id=eq\.([^&]+)/.exec(url);
        return m ? [{ id: 't-' + m[1], bulletin_id: m[1], title: 'Обикновена', department: 'trade', due_date: null,
                      due_dates: null, task_type: 'info', target_stores: null, sort_order: 1 }] : []; },
      task_completions: [
        { id: 'c1', task_id: null, recurring_task_id: 'r-rev', store_name: TR, status: 'done',
          completion_date: WED_PREV, completed_at: shifted(-7).toISOString(), completed_by: TR }
      ],
      subtask_completions: [],
      task_subtasks: []
    }
  }, extra.fail ? { fail: extra.fail } : {}));
  freezeDate(h.w);
  h.buls = [bulOf(h.w, 'b-prev', -7), bulOf(h.w, 'b-cur', 0), bulOf(h.w, 'b-next', 7)];
  h.w.bulSelectedId = bulId;
  h.w.bulActiveDept = 'admin';
  h.w.reportableStoresCache = [TR];
  return h;
}

async function settle(cond, max) {
  for (let i = 0; i < (max || 60); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
function blockRow(doc, id) {
  return Array.prototype.find.call(doc.querySelectorAll('[data-rec-row="' + id + '"]'),
    r => !r.closest('#sec-calendar')) || null;
}
const calText = doc => txt(doc.getElementById('sec-calendar'));
async function loaded(h) {
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return false;
  return settle(() => !!h.doc.getElementById('sec-calendar') && !!blockRow(h.doc, 'r-act'));
}
/* loadTasksStats() в клетката „Администрация" за Троян. */
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
  return row && col >= 0 ? txt(row.children[col]) : '(няма клетка)';
}
function expectRows(h, label, present, absent) {
  present.forEach(id => ok(label + ': „' + TITLES[id] + '" Е в блока', !!blockRow(h.doc, id)));
  absent.forEach(id => ok(label + ': „' + TITLES[id] + '" НЕ е в блока', !blockRow(h.doc, id)));
}

(async function () {

  /* ═══ 1. Помощниците ════════════════════════════════════════════════════ */
  section('1. shared.js: recurringMondayOf / recurringValidForWeek / recurringTasksForWeek');
  {
    const h = env('b-cur');
    const w = h.w;
    ok('recurringMondayOf(сряда) = понеделникът', w.recurringMondayOf(shifted(0)) === MON0, w.recurringMondayOf(shifted(0)));
    ok('recurringMondayOf(понеделник) = същият ден', w.recurringMondayOf(shifted(-2)) === MON0);
    ok('recurringMondayOf(неделя) = понеделникът ПРЕДИ нея', w.recurringMondayOf(shifted(4)) === MON0, w.recurringMondayOf(shifted(4)));
    /* Понеделник 00:30 местно е още неделя по UTC — смятано по UTC, би дало
       миналия понеделник и цяла седмица грешни задачи след полунощ. */
    if (new Date().getTimezoneOffset() < 0) {
      const monEarly = shifted(-2); monEarly.setHours(0, 30, 0, 0);
      ok('recurringMondayOf(понеделник 00:30) = същият понеделник (ЛОКАЛНО, не UTC)',
        w.recurringMondayOf(new w.Date(monEarly.getTime())) === MON0, w.recurringMondayOf(new w.Date(monEarly.getTime())));
    } else {
      console.log('  (пропуснато: часовата зона на машината не е източно от UTC)');
    }
    const P = [{ recurring_task_id: 'x', from_monday: MON_PREV, to_monday: MON0 }];
    ok('from_monday е включително', w.recurringValidForWeek('x', MON_PREV, P));
    ok('to_monday е включително', w.recurringValidForWeek('x', MON0, P));
    ok('седмицата преди from → не', !w.recurringValidForWeek('x', MON_OLD, P));
    ok('седмицата след to → не', !w.recurringValidForWeek('x', MON_NEXT, P));
    ok('отворен период важи напред', w.recurringValidForWeek('y', MON_NEXT, [{ recurring_task_id: 'y', from_monday: MON0, to_monday: null }]));
    ok('чужд период не важи', !w.recurringValidForWeek('z', MON0, P));
    ok('празни/липсващи периоди → false', !w.recurringValidForWeek('x', MON0, []) && !w.recurringValidForWeek('x', MON0, null));
    const ids = l => l.map(t => t.id).join(',');
    ok('ForWeek(минала): r-rev, r-act, r-promo, r-legacy', ids(w.recurringTasksForWeek(RECS, PERIODS, MON_PREV)) === 'r-rev,r-act,r-promo,r-legacy',
      ids(w.recurringTasksForWeek(RECS, PERIODS, MON_PREV)));
    ok('ForWeek(текуща): r-act, r-new, r-legacy', ids(w.recurringTasksForWeek(RECS, PERIODS, MON0)) === 'r-act,r-new,r-legacy',
      ids(w.recurringTasksForWeek(RECS, PERIODS, MON0)));
    ok('без никакви периоди → по кеша active', ids(w.recurringTasksForWeek(RECS, [], MON_PREV)) === 'r-act,r-new,r-legacy');
  }

  /* ═══ 2–4. Бюлетинът по седмици ════════════════════════════════════════ */
  section('2. МИНАЛАТА седмица: спряната „Ревизии 953" и „Промоция 1+1" ги има, новата — не');
  const hp = env('b-prev');
  if (await loaded(hp)) {
    const q = hp.calls.get.filter(u => u.indexOf('/recurring_tasks?') >= 0);
    ok('recurring_tasks се тегли БЕЗ active филтър', q.length >= 1 && q.every(u => u.indexOf('active=eq.true') < 0), q.join(' | '));
    ok('recurring_task_periods се тегли', hp.calls.get.some(u => u.indexOf('/recurring_task_periods') >= 0));
    expectRows(hp, 'минала', ['r-rev', 'r-promo', 'r-act', 'r-legacy'], ['r-new', 'r-dead']);
    ok('минала: календарът показва „Ревизии 953"', calText(hp.doc).indexOf(TITLES['r-rev']) >= 0);
    ok('минала: календарът НЕ показва новата', calText(hp.doc).indexOf(TITLES['r-new']) < 0);
    const cell = await statsAdminCell(hp);
    ok('минала: статистиката брои спряната — Администрация 1/2', cell === '1/2', cell);
  }

  section('3. ТЕКУЩАТА седмица: без двете спрени, с новата');
  const hc = env('b-cur');
  if (await loaded(hc)) {
    expectRows(hc, 'текуща', ['r-act', 'r-new', 'r-legacy'], ['r-rev', 'r-promo', 'r-dead']);
    ok('текуща: календарът НЕ показва „Ревизии 953"', calText(hc.doc).indexOf(TITLES['r-rev']) < 0);
    ok('текуща: календарът показва новата', calText(hc.doc).indexOf(TITLES['r-new']) >= 0);
    const cell = await statsAdminCell(hc);
    ok('текуща: статистиката — Администрация 0/2 (без спряната)', cell === '0/2', cell);
  }

  section('4. СЛЕДВАЩАТА седмица: като текущата');
  const hn = env('b-next');
  if (await loaded(hn)) {
    expectRows(hn, 'следваща', ['r-act', 'r-new', 'r-legacy'], ['r-rev', 'r-promo', 'r-dead']);
  }

  /* ═══ 4б. Редакция в стар бюлетин ═══════════════════════════════════════ */
  section('4б. МИНАЛАТА седмица: ✏️ → „Запази" → спряната остава след презареждането');
  {
    const w = hp.w, doc = hp.doc;
    const row = blockRow(doc, 'r-act');
    const pen = row && H.btn(row, '✏️');
    if (ok('✏️ на „Работна отдавна" съществува', !!pen)) {
      guard('клик ✏️', () => H.realClick(w, pen, '✏️'));
      const save = H.btn(doc.getElementById('edit-rec-ov'), 'Запази');
      if (ok('модалът е отворен', !!save)) {
        const before = hp.calls.get.length;
        guard('клик „Запази"', () => H.realClick(w, save, 'Запази'));
        await settle(() => hp.calls.get.slice(before).some(u => u.indexOf('/recurring_task_periods') >= 0));
        await settle(() => !doc.getElementById('edit-rec-ov'));
        for (let i = 0; i < 5; i++) await ticks();
        const after = hp.calls.get.slice(before);
        ok('след запис: всички задачи (без active) + периодите наново',
          after.some(u => u.indexOf('/recurring_tasks?') >= 0 && u.indexOf('active=') < 0) &&
          after.some(u => u.indexOf('/recurring_task_periods') >= 0), after.join(' | '));
        ok('„Ревизии 953" още е в блока на миналата седмица', !!blockRow(doc, 'r-rev'));
        ok('новата още НЕ е', !blockRow(doc, 'r-new'));
      }
    }
  }

  /* ═══ 5. Известието за днес при отворен стар бюлетин ═══════════════════ */
  section('5. collectTodayDeadlineItems при отворена МИНАЛА седмица → ДНЕШНАТА');
  {
    let items = null;
    if (guard('collectTodayDeadlineItems() не хвърля', () => hp.w.collectTodayDeadlineItems(l => { items = l; }))) {
      await settle(() => items !== null);
      const titles = (items || []).map(i => i.title);
      ok('новата (важи днес) Е в известието', titles.indexOf(TITLES['r-new']) >= 0, titles.join(', '));
      ok('без период, активна Е в известието', titles.indexOf(TITLES['r-legacy']) >= 0, titles.join(', '));
      ok('спряната „Ревизии 953" НЕ е (важи само за миналата)', titles.indexOf(TITLES['r-rev']) < 0, titles.join(', '));
      ok('„Промоция 1+1" НЕ е', titles.indexOf(TITLES['r-promo']) < 0, titles.join(', '));
      ok('без период, спряна НЕ е', titles.indexOf(TITLES['r-dead']) < 0, titles.join(', '));
    }
  }

  /* ═══ 6. Провал на периодите ═══════════════════════════════════════════ */
  section('6. Провалена заявка за периодите → кешът active, бюлетинът НЕ е празен');
  {
    const h = env('b-prev', { fail: { GET: /recurring_task_periods/ } });
    if (await loaded(h)) {
      expectRows(h, 'провал', ['r-act', 'r-new', 'r-legacy'], ['r-rev', 'r-promo', 'r-dead']);
      ok('тост за грешката при зареждане', h.calls.toast.some(t => String(t).indexOf('Грешка при зареждане') >= 0),
        JSON.stringify(h.calls.toast));
    }
  }

  /* ═══ 7. Чек листът ═══════════════════════════════════════════════════ */
  const REV = '74da41e4-494f-48cc-a434-79bfc04fc243';
  const METRICS = [{ key: 'revizia_953', label: 'ревизия', sublabel: '953', value_type: 'yes_no', sort_order: 1, active: true, source: 'recurring:' + REV }];
  function checklistEnv(periodFor) {
    const h = boot({
      modules: ['bulletin.js', 'checklist.js'],
      user: { id: 'u-1', email: 'c@temax.bg', display_name: 'Контрол', role: 'admin', store_name: 'Централен офис' },
      data: {
        users: [{ store_name: TR }],
        weekly_checklist_metrics: METRICS,
        weekly_checklist: [],
        recurring_tasks: [{ id: REV, due_weekdays: [0, 1, 2] }],
        task_completions: [],
        recurring_task_skips: [],
        recurring_task_periods: []
      }
    });
    const def = h.w.checklistDefaultWeek();
    const wk = h.w.weekDays(def.week, def.year);
    const mon = isoOf(wk[0]);
    const prevMon = isoOf(new Date(wk[0].getTime() - 7 * 86400000));
    h.setData('recurring_task_periods', periodFor(mon, prevMon));
    h.setData('task_completions', [{ recurring_task_id: REV, store_name: TR, status: 'done', completion_date: isoOf(wk[1]) }]);
    h.setData('weekly_checklist', [{ year: def.year, week_number: def.week, store_name: TR, metric_key: 'revizia_953',
      portal_value: 'ne', control_value: null, control_num: null, comment: null }]);
    return h;
  }
  const writes = h => h.calls.post.filter(p => (p.url || '').indexOf('/weekly_checklist?') >= 0);
  function written(h) {
    let out;
    writes(h).forEach(p => [].concat(p.body).forEach(r => { if (r.store_name === TR && r.metric_key === 'revizia_953') out = r; }));
    return out;
  }

  section('7. Чек лист: седмица, в която задачата не важи → празна клетка');
  {
    const h = checklistEnv((mon, prevMon) => [{ recurring_task_id: REV, from_monday: prevMon, to_monday: prevMon }]);
    if (guard('loadChecklist() не хвърля', () => h.w.loadChecklist())) {
      await settle(() => !!h.doc.getElementById('checklist-table') && writes(h).length > 0);
      ok('заявка към recurring_task_periods за id-тата', h.calls.get.some(u => u.indexOf('/recurring_task_periods') >= 0 && u.indexOf(REV) >= 0));
      const r = written(h);
      ok('записаното „ne" се изчиства (portal_value: null), въпреки отметката',
        !!r && Object.prototype.hasOwnProperty.call(r, 'portal_value') && r.portal_value === null, JSON.stringify(r));
    }
  }
  section('7б. КОНТРОЛА: задачата важи → „da" (отметката се брои)');
  {
    const h = checklistEnv((mon) => [{ recurring_task_id: REV, from_monday: mon, to_monday: null }]);
    h.w.loadChecklist();
    await settle(() => !!h.doc.getElementById('checklist-table') && writes(h).length > 0);
    ok('portal_value = da', (written(h) || {}).portal_value === 'da', JSON.stringify(written(h)));
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
