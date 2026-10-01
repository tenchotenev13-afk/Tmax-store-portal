/* „🚫 Не се отнася за нас" — ОБЕКТЪТ заявява и отменя (т.3, 01.10.2026).

   ТВЪРДЕНИЯТА:
   · бутонът го има и при задача БЕЗ изискване (там модалът за отмятане изобщо
     не се отваря — bulCheckboxChanged вика toggleTask направо), и при задача
     СЪС снимка, където е вътре в модала;
   · причината е ЗАДЪЛЖИТЕЛНА (мин. 5 знака) и се проверява преди заявката —
     CHECK-ът в базата е вторият пояс, не първият;
   · снимка/документ/коментар по вида на задачата НЕ се изискват;
   · записът е 'not_applicable' с причината в comment и postponed_to: null;
   · задачата престава да е „чакаща": чекбоксът го няма, стои сив 🚫 с
     причината, а „⏱ Отложи" изчезва;
   · ЕДИН ред покрива целия прозорец / всички дни / целия период;
   · „Само за информация" не получава бутон;
   · отмяна от обекта — само в същия ден.

   Пускане: node tests/na-store-declare.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btnExact, fire, ok, guard, section, report, ticks } = H;

/* ── котва: сряда 12:00 от текущата реална седмица ───────────────────────── */
const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
  return d;
})();
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const shifted = n => { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() + n); return d; };
function isoWeekYear(d) { const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); return t.getFullYear(); }
function freezeDate(w) {
  const Real = w.Date, ms = ANCHOR.getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}
const D = n => isoOf(shifted(-2 + n));        /* D(2) = днес (сряда) */
const MON = D(0), TUE = D(1), WED = D(2), THU = D(3);

const STORE = 'Троян';
const USER = { email: 't@temax.bg', display_name: 'Иван Петров', role: 'store', store_name: STORE };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const STORES = [STORE, 'Ловеч'];

function task(id, over) {
  return Object.assign({
    id: id, bulletin_id: 'b-1', week_number: 0, year: 2026, department: 'trade',
    title: 'Задача ' + id, description: null, due_date: WED, due_dates: [WED],
    due_window: false, spans_from: null, starts_on: null, target_stores: null,
    task_type: 'info', report_groups: null, linked_module: null,
    auto_complete: false, attachments: null, sort_order: 1,
    created_by: 'Админ', created_at: MON
  }, over || {});
}
function bulRow(w) {
  const cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });
  return { id: 'b-1', week_number: w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published',
           created_at: MON, content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
}
function env(tasks, comps, user, recs) {
  const sent = { post: [], patch: [], del: [] };
  const h = boot({
    modules: ['bulletin.js', 'today.js', 'report.js'],
    user: user || USER,
    data: {
      users: STORES.map(s => ({ store_name: s })),
      stores: STORES.map(s => ({ name: s })),
      recurring_tasks: recs || [], recurring_task_periods: [], recurring_task_skips: [],
      recurring_task_versions: [],
      bulletins: url => { const m = /[?&]id=eq\.([^&]+)/.exec(url); return m ? [bulRow(h.w)].filter(b => b.id === m[1]) : [bulRow(h.w)]; },
      bulletin_tasks: url => (url.indexOf('spans_from=not.is.null') >= 0 ? [] : tasks),
      task_completions: () => comps,
      bulletin_promotions: [], task_subtasks: [], subtask_completions: [],
      notification_schedules: [], report_snapshots: [], goods_transit: []
    }
  });
  freezeDate(h.w);
  h.w.bulSelectedId = 'b-1';
  h.w.bulActiveDept = 'trade';
  h.w.reportableStoresCache = STORES.slice();
  h.w.allStoresCache = STORES.slice();
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const m = (init.method || 'GET').toUpperCase();
    if (url.indexOf('/task_completions') >= 0) {
      if (m === 'POST') { const b = JSON.parse(init.body || '{}'); sent.post.push(b); comps.push(Object.assign({ id: 'c-new' }, b)); }
      if (m === 'PATCH') sent.patch.push({ url: url, body: JSON.parse(init.body || '{}') });
      if (m === 'DELETE') sent.del.push(url);
    }
    return orig.call(this, url, init);
  };
  h.sent = sent;
  h.w.confirm = () => true;
  return h;
}
async function settle(cond, max) { for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); } return cond(); }
async function view(tasks, comps, user, recs) {
  const h = env(tasks, comps, user, recs);
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return null;
  await settle(() => !!h.doc.getElementById('sec-calendar'));
  return h;
}
function naComp(taskId, date, over) {
  return Object.assign({
    id: 'c-na', task_id: taskId, recurring_task_id: null, store_name: STORE,
    status: 'not_applicable', completion_date: date, comment: 'обектът няма такъв стелаж',
    completed_by: 'Иван Петров', completed_at: date + 'T09:00:00', postponed_to: null
  }, over || {});
}
const panel = h => h.doc.getElementById('dept-panel-trade');
const btnIn = (el, text) => Array.prototype.slice.call((el || { querySelectorAll: () => [] }).querySelectorAll('button'))
  .find(b => (b.textContent || '').indexOf(text) >= 0) || null;

(async function () {

  section('1. Бутонът го има при задача БЕЗ изискване (модал там не се отваря)');
  {
    const h = await view([task('t-1', { task_type: 'info' })], []);
    if (!h) return report();
    const b = btnIn(panel(h), '🚫 Не се отнася');
    ok('бутонът „🚫 Не се отнася" е на реда', !!b);
    ok('и чекбоксът още го има — задачата е чакаща',
      !!panel(h).querySelector('input[data-tid="t-1"]'));
    ok('и „⏱ Отложи" също', !!btnIn(panel(h), '⏱ Отложи'));
  }

  section('2. РЕАЛЕН КЛИК: модалът иска причина и не пуска кратка');
  {
    const h = await view([task('t-1')], []);
    if (!h) return report();
    realClick(h.w, btnIn(panel(h), '🚫 Не се отнася'), 'не се отнася');
    await ticks();
    const ov = h.doc.getElementById('na-modal-ov');
    if (!ok('модалът се отвори', !!ov)) return report();
    const txt = (ov.textContent || '').replace(/\s+/g, ' ');
    ok('казва какво ще стане с броя',
      txt.indexOf('нито като изпълнена, нито като пропусната') >= 0, txt);
    ok('полето за причина е там', !!h.doc.getElementById('na-comment'));
    ok('снимка НЕ се иска', !ov.querySelector('input[type=file]'));

    /* Празна причина → нищо не се записва. */
    realClick(h.w, btnExact(ov, '✓ Потвърди'), 'Потвърди');
    await ticks(); await ticks();
    ok('празна причина: нула заявки', h.sent.post.length === 0 && h.sent.patch.length === 0,
      JSON.stringify(h.sent));
    ok('и модалът е още отворен', !!h.doc.getElementById('na-modal-ov'));

    /* Четири знака → пак не. */
    h.doc.getElementById('na-comment').value = 'ня  ';
    realClick(h.w, btnExact(h.doc.getElementById('na-modal-ov'), '✓ Потвърди'), 'Потвърди');
    await ticks(); await ticks();
    ok('причина под 5 знака: пак нула заявки',
      h.sent.post.length === 0 && h.sent.patch.length === 0, JSON.stringify(h.sent));

    /* Истинска причина → запис. */
    h.doc.getElementById('na-comment').value = '  обектът няма такъв стелаж  ';
    realClick(h.w, btnExact(h.doc.getElementById('na-modal-ov'), '✓ Потвърди'), 'Потвърди');
    /* Чака се СЪСТОЯНИЕТО, не следата от заявката: фалшивият fetch записва
       POST-а преди да е минал .then, тоест „има заявка" не значи „записът е
       приключил". Същата засада като pipe пред гейта — чакаш не това, което
       твърдиш. */
    await settle(() => !h.doc.getElementById('na-modal-ov'), 80);
    const body = h.sent.post[0] || {};
    ok('изпратен е запис', !!body.task_id, JSON.stringify(body));
    ok('статусът е not_applicable', body.status === 'not_applicable', String(body.status));
    ok('причината е в comment, без крайните интервали',
      body.comment === 'обектът няма такъв стелаж', JSON.stringify(body.comment));
    ok('postponed_to е null — заявката не е отлагане', body.postponed_to === null,
      JSON.stringify(body.postponed_to));
    ok('completion_date е денят на заявяването', body.completion_date === WED,
      String(body.completion_date));
    ok('обектът е записан', body.store_name === STORE, String(body.store_name));
    ok('модалът се затвори', !h.doc.getElementById('na-modal-ov'));
  }

  section('3. СЛЕД заявката задачата не е „чакаща"');
  {
    const h = await view([task('t-1')], [naComp('t-1', WED)]);
    if (!h) return report();
    const p = panel(h);
    ok('чекбоксът го няма', !p.querySelector('input[data-tid="t-1"]'));
    ok('стои сивият 🚫 маркер', (p.textContent || '').indexOf('🚫') >= 0);
    const badge = Array.prototype.slice.call(p.querySelectorAll('span'))
      .find(x => (x.textContent || '').indexOf('🚫 Не се отнася') >= 0);
    ok('баджът „🚫 Не се отнася" е на реда', !!badge);
    ok('причината е в title при посочване',
      !!badge && (badge.getAttribute('title') || '').indexOf('няма такъв стелаж') >= 0,
      badge && badge.getAttribute('title'));
    ok('„⏱ Отложи" вече го няма', !btnIn(p, '⏱ Отложи'));
    ok('но „↩ Отмени заявката" го има', !!btnIn(p, '↩ Отмени заявката'));
  }

  section('4. ОТМЯНА от обекта — днес да, друг ден не');
  {
    const h = await view([task('t-1')], [naComp('t-1', WED)]);
    if (!h) return report();
    realClick(h.w, btnIn(panel(h), '↩ Отмени заявката'), 'Отмени');
    await settle(() => h.sent.del.length > 0, 60);
    const u = h.sent.del[0] || '';
    ok('изпратено е изтриване', !!u, u);
    ok('филтърът е по status=not_applicable', u.indexOf('status=eq.not_applicable') >= 0, u);
    ok('и по деня на реда', u.indexOf('completion_date=eq.' + WED) >= 0, u);
    ok('и по обекта', u.indexOf('store_name=eq.') >= 0, u);

    /* Заявка от ПОНЕДЕЛНИК, днес е сряда → отмяната не минава. */
    const h2 = await view([task('t-1', { due_dates: [MON, TUE, WED] })], [naComp('t-1', MON)]);
    if (!h2) return report();
    h2.w.cancelNotApplicable('t-1', 'regular', MON);
    await ticks(); await ticks();
    ok('минал ден: нищо не се изтрива', h2.sent.del.length === 0, JSON.stringify(h2.sent.del));
  }

  section('5. ЕДИН ред покрива целия прозорец');
  {
    const t = task('t-w', { due_dates: [MON, TUE, WED], due_window: true });
    const h = await view([t], [naComp('t-w', MON)]);
    if (!h) return report();
    /* Заявката е от понеделник, а днес е сряда — пак трябва да е намерена. */
    ok('bulNaComp я намира по НАБОРА дати, не по днешния ден',
      !!h.w.bulNaComp('regular', t, STORE, h.w.weekDays(h.w.weekNum(ANCHOR), isoWeekYear(ANCHOR))));
    const p = panel(h);
    ok('в блока няма чекбокс', !p.querySelector('input[data-tid="t-w"]'));
    /* И в трите клетки на календара няма чекбокс. */
    const boxes = [MON, TUE, WED].map(d =>
      h.doc.querySelector('#sec-calendar input[data-tid="t-w"][data-cdate="' + d + '"]'));
    ok('и в нито един ден от прозореца няма чекбокс в календара',
      boxes.every(b => !b), boxes.map(b => !!b).join(','));
    ok('а в календара стои 🚫',
      (h.doc.getElementById('sec-calendar').textContent || '').indexOf('🚫') >= 0);
  }

  section('6. ЕДИН ред покрива и МНОГОДНЕВНАТА без прозорец');
  {
    const t = task('t-m', { due_dates: [MON, TUE, WED], due_window: false });
    const h = await view([t], [naComp('t-m', TUE)]);
    if (!h) return report();
    const boxes = [MON, TUE, WED].map(d =>
      h.doc.querySelector('#sec-calendar input[data-tid="t-m"][data-cdate="' + d + '"]'));
    ok('нито един ден не остава с чекбокс', boxes.every(b => !b),
      boxes.map(b => !!b).join(','));
    /* КОНТРОЛА: без заявка и трите дни си имат чекбокс. */
    const h2 = await view([task('t-m', { due_dates: [MON, TUE, WED] })], []);
    const boxes2 = [MON, TUE, WED].map(d =>
      h2.doc.querySelector('#sec-calendar input[data-tid="t-m"][data-cdate="' + d + '"]'));
    ok('контрола: без заявка и трите имат чекбокс', boxes2.every(b => !!b),
      boxes2.map(b => !!b).join(','));
  }

  section('6б. bulNaComp не бърка заявката с друг ред, друг обект, друга седмица');
  {
    const t = task('t-x', { due_dates: [WED] });
    const rec = {
      id: 'r-x', title: 'Постоянна', department: 'trade', task_type: 'info',
      active: true, sort_order: 1, due_weekdays: [2], due_weekday: 2,
      due_time: null, due_window: false, target_stores: null, report_groups: null, linked_module: null
    };
    const h = await view([t], [], USER, [rec]);
    if (!h) return report();
    const wk = h.w.weekDays(h.w.weekNum(ANCHOR), isoWeekYear(ANCHOR));

    /* ДРУГ СТАТУС: отметка и отлагане за същата задача не са заявка. */
    h.w.bulComps = [
      { task_id: 't-x', store_name: STORE, status: 'done', completion_date: WED, comment: 'готово' },
      { task_id: 't-x', store_name: STORE, status: 'postponed', completion_date: WED, comment: 'после', postponed_to: THU }
    ];
    ok('отметка не се чете като заявка', h.w.bulNaComp('regular', t, STORE, wk) === null);

    /* ДРУГ ОБЕКТ: заявката на Ловеч не важи за Троян. */
    h.w.bulComps = [{ task_id: 't-x', store_name: 'Ловеч', status: 'not_applicable',
                      completion_date: WED, comment: 'Ловеч няма стелажа' }];
    ok('чужда заявка не важи за моя обект', h.w.bulNaComp('regular', t, STORE, wk) === null);
    ok('а за техния обект важи', !!h.w.bulNaComp('regular', t, 'Ловеч', wk));

    /* ПОСТОЯННА от МИНАЛАТА седмица — не важи за тази. */
    h.w.recurringComps = [{ recurring_task_id: 'r-x', store_name: STORE, status: 'not_applicable',
                            completion_date: D(-5), comment: 'миналата седмица нямахме' }];
    ok('заявка от минала седмица НЕ важи за постоянната тази',
      h.w.bulNaComp('recurring', rec, STORE, wk) === null);
    h.w.recurringComps = [{ recurring_task_id: 'r-x', store_name: STORE, status: 'not_applicable',
                            completion_date: WED, comment: 'тази седмица нямаме' }];
    ok('а заявка от ТАЗИ седмица важи',
      !!h.w.bulNaComp('recurring', rec, STORE, wk));
    /* Границите на седмицата са включително — понеделник и неделя. */
    h.w.recurringComps = [{ recurring_task_id: 'r-x', store_name: STORE, status: 'not_applicable',
                            completion_date: MON, comment: 'заявено в понеделник' }];
    ok('понеделник (долната граница) влиза',
      !!h.w.bulNaComp('recurring', rec, STORE, wk));
    h.w.recurringComps = [{ recurring_task_id: 'r-x', store_name: STORE, status: 'not_applicable',
                            completion_date: D(6), comment: 'заявено в неделя' }];
    ok('неделя (горната граница) влиза',
      !!h.w.bulNaComp('recurring', rec, STORE, wk));

    /* Еднократната НЕ се ограничава по седмица — тя живее в един бюлетин. */
    h.w.bulComps = [{ task_id: 't-x', store_name: STORE, status: 'not_applicable',
                      completion_date: D(-5), comment: 'заявено преди седмица' }];
    ok('при еднократната датата не ограничава (един бюлетин, една седмица)',
      !!h.w.bulNaComp('regular', t, STORE, wk));
  }

  section('6в. Панелът на обекта: заявената задача не предлага „Отложи"');
  {
    const h = await view([task('t-1')], [naComp('t-1', WED)]);
    if (!h) return report();
    const div = h.doc.createElement('div');
    if (guard('renderTasksPanel() не хвърля', () => { div.innerHTML = h.w.renderTasksPanel(); })) {
      ok('чекбоксът го няма и в панела', !div.querySelector('input[data-tid="t-1"]'));
      ok('„⏱ Отложи" го няма', !btnIn(div, '⏱ Отложи'));
      ok('а „↩ Отмени заявката" го има', !!btnIn(div, '↩ Отмени заявката'));
      ok('и баджът е там', (div.textContent || '').indexOf('🚫 Не се отнася') >= 0);
    }
    /* КОНТРОЛА: без заявка панелът си предлага „Отложи". */
    const h2 = await view([task('t-1')], []);
    const div2 = h2.doc.createElement('div');
    div2.innerHTML = h2.w.renderTasksPanel();
    ok('контрола: без заявка „⏱ Отложи" го има', !!btnIn(div2, '⏱ Отложи'));
    ok('и чекбоксът е там', !!div2.querySelector('input[data-tid="t-1"]'));
  }

  section('7. „Само за информация" не получава бутон');
  {
    const h = await view([task('t-n', { task_type: 'notice' })], []);
    if (!h) return report();
    ok('бутонът го няма', !btnIn(panel(h), '🚫 Не се отнася'));
    /* И през функцията направо — нищо не се записва. */
    h.w.openNotApplicableModal('t-n', 'regular', WED);
    await ticks();
    ok('модалът не се отваря и за ръчно извикване', !h.doc.getElementById('na-modal-ov'));
    /* Самият строител на бутона също пази notice. Четирите му викащи вече го
       филтрират, тоест това е втори пояс — но точно затова се проверява ТУК,
       а не през изглед: през изглед мутантът, който го маха, остава жив. */
    const notice = task('t-n', { task_type: 'notice' });
    ok('bulNaBtnHtml връща празно за notice',
      h.w.bulNaBtnHtml('regular', notice, WED, null) === '',
      JSON.stringify(h.w.bulNaBtnHtml('regular', notice, WED, null)));
    ok('а за обикновена задача връща бутон',
      h.w.bulNaBtnHtml('regular', task('t-1'), WED, null).indexOf('🚫 Не се отнася') >= 0);
    /* И автоматичната задача не получава бутон — състоянието ѝ идва от данните. */
    const auto = task('t-a', { linked_module: 'oborot' });
    ok('автоматичната („Вечерен оборот") също не получава бутон',
      h.w.bulNaBtnHtml('regular', auto, WED, null) === '');
  }

  section('8. Задача СЪС снимка: бутонът е в модала и не иска снимка');
  {
    const h = await view([task('t-p', { task_type: 'photo' })], []);
    if (!h) return report();
    const cb = panel(h).querySelector('input[data-tid="t-p"]');
    if (!ok('чекбоксът е там', !!cb)) return report();
    cb.checked = true;
    fire(h.w, cb, 'change');
    await ticks();
    const tc = h.doc.getElementById('tc-modal-ov');
    if (!ok('модалът за отмятане се отвори', !!tc)) return report();
    ok('и иска снимка', !!tc.querySelector('input[type=file]'));
    const nb = btnIn(tc, '🚫 Не се отнася за нас');
    if (ok('вътре има бутон „🚫 Не се отнася за нас"', !!nb)) {
      realClick(h.w, nb, 'не се отнася');
      await ticks();
      ok('модалът за отмятане се затвори', !h.doc.getElementById('tc-modal-ov'));
      const ov = h.doc.getElementById('na-modal-ov');
      if (ok('и се отвори този за заявката', !!ov)) {
        ok('той НЕ иска снимка', !ov.querySelector('input[type=file]'));
        h.doc.getElementById('na-comment').value = 'няма такъв дисплей в обекта';
        realClick(h.w, btnExact(ov, '✓ Потвърди'), 'Потвърди');
        await settle(() => h.sent.post.length > 0, 60);
        const body = h.sent.post[0] || {};
        ok('записът мина без снимка', body.status === 'not_applicable', JSON.stringify(body));
        ok('и няма photos в тялото', body.photos === undefined, JSON.stringify(body.photos));
      }
    }
  }

  section('9. ПОСТОЯННА задача — същият път');
  {
    const rec = {
      id: 'r-1', title: 'Справка метри', department: 'trade', task_type: 'info',
      active: true, sort_order: 1, due_weekdays: [0, 1, 2], due_weekday: 0,
      due_time: null, due_window: false, target_stores: null, report_groups: null,
      linked_module: null
    };
    const h = await view([], [], USER, [rec]);
    if (!h) return report();
    const b = btnIn(panel(h), '🚫 Не се отнася');
    if (ok('бутонът го има и при постоянна', !!b)) {
      realClick(h.w, b, 'не се отнася');
      await ticks();
      const ov = h.doc.getElementById('na-modal-ov');
      if (ok('модалът се отвори', !!ov)) {
        h.doc.getElementById('na-comment').value = 'обектът няма тези групи';
        realClick(h.w, btnExact(ov, '✓ Потвърди'), 'Потвърди');
        await settle(() => h.sent.post.length > 0, 60);
        const body = h.sent.post[0] || {};
        ok('записът е по recurring_task_id', !!body.recurring_task_id, JSON.stringify(body));
        ok('и статусът е not_applicable', body.status === 'not_applicable');
        ok('без bulletin_id — задачата не е от бюлетин', body.bulletin_id === undefined,
          JSON.stringify(body.bulletin_id));
      }
    }
  }

  report();
})();
