/* Отчет за изпълнението в избран ден/час — КЛИЕНТЪТ (етап 2, 18.09.2026).

   Формата за задача (нова и редакция) има секция „📨 Отчет за
   изпълнението". Всеки насрочен отчет е ред в notification_schedules:
     entity_type='task_report', entity_id=<задачата>, schedule_type='once',
     scheduled_date, scheduled_time, active=true,
     target_recipients={groups:[...], user_ids:[users.id]}.
   Изпращането (dynamic-responder → send-routed-report) е етап 3.

   Какво заковава тестът (РЕАЛЕН клик по бутоните на формата):
     1. нова задача: „+ Насрочи" → по подразбиране последният ден от срока в
        18:00, авторът отметнат; „Добави задача" → задачата, после ЕДИН ред в
        notification_schedules с точното тяло и id-то на новата задача;
     2. без срок → днес + 1 ч, закръглено нагоре до 15 мин (часовникът е
        замразен на 14:07 → 15:15);
     3. два отчета (12:00 и 18:00) → два реда;
     4. непълен отчет (без получатели) или минал час → червен тост и НИКАКЪВ
        запис — нито задачата, нито отчетът;
     5. провал на реда за отчета → червен тост, задачата остава;
     6. редакция: заварените отчети се виждат със ✕; ✕ → DELETE точно на
        този ред; нов отчет → ред с entity_id на задачата;
     7. под задачата в блока — списъкът с ✕ за админ, нищо за обекта;
     8. чернова: предупреждение в секцията, редът пак се записва (гейтът е
        при изпращането);
     9. без отворена секция задачата се записва както преди — без ред;
    10. ПОСТОЯННА задача (19.09.2026): реален клик ✏️ в блока → секцията е
        в редакцията; „Запази" → версия в recurring_task_versions
        (24.09.2026) и ред с entity_id=recurring_tasks.id; заварените ѝ отчети — в списъка и под
        задачата в блока, ✕ трие точно реда; без чернова-предупреждение.

   Пускане: node tests/task-report-schedule.test.js . */
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

/* Сряда от текущата седмица, 14:07 местно. */
const ANCHOR = (function () {
  const d = new Date();
  d.setHours(14, 7, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
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
const THU = isoOf(shifted(1)), FRI = isoOf(shifted(2)), TODAY = isoOf(ANCHOR);

const ADMIN = { id: 'u-admin', email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const STORE = { id: 'u-tr', email: 'tr@temax.bg', display_name: 'Троян', role: 'user', store_name: 'Троян' };
const USERS = [
  { id: 'u-admin', email: 'a@temax.bg', display_name: 'Админ', notify_groups: [] },
  { id: 'u-zh', email: 'j.jeliazkov@temax.bg', display_name: 'Жеко Желязков', notify_groups: ['co'] },
  { id: 'u-mp', email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', notify_groups: ['controlling'] }
];

function env(opts) {
  opts = opts || {};
  const db = { tasks: (opts.tasks || []).slice(), reports: (opts.reports || []).slice(), seq: 0 };
  const h = boot({
    modules: ['bulletin.js'],
    user: opts.user || ADMIN,
    fail: opts.fail,
    data: {
      users: USERS, recurring_tasks: opts.recurring || [], recurring_task_periods: opts.periods || [], recurring_task_skips: [],
      bulletins: () => [h.bul], bulletin_tasks: () => db.tasks, task_completions: [],
      subtask_completions: [], task_subtasks: [], bulletin_promotions: [],
      notification_schedules: url => db.reports.filter(r => url.indexOf('entity_type=eq.task_report') >= 0)
    }
  });
  freezeDate(h.w);
  const cal = {}; h.w.DKEYS.forEach(x => { cal[x] = []; });
  h.bul = { id: 'b-1', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: opts.status || 'published',
            created_at: TODAY, content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
  h.w.bulSelectedId = 'b-1';
  h.w.bulActiveDept = 'admin';
  h.w.reportableStoresCache = ['Троян'];
  h.w.allStoresCache = ['Троян'];
  /* POST връща реда (return=representation); DELETE — брой изтрити. */
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const m = (init.method || 'GET').toUpperCase();
    return orig.call(this, url, init).then(function (r) {
      if (!r.ok || m === 'GET') return r;
      const body = init.body ? JSON.parse(init.body) : null;
      if (m === 'POST' && url.indexOf('/bulletin_tasks') >= 0) {
        const row = Object.assign({ id: 't-new' + (++db.seq) }, body); db.tasks.push(row);
        return { ok: true, status: 201, json: () => Promise.resolve([row]), text: () => Promise.resolve('') };
      }
      if (m === 'POST' && url.indexOf('/notification_schedules') >= 0) {
        db.reports.push(Object.assign({ id: 'n-' + (++db.seq) }, body)); return r;
      }
      if (m === 'DELETE') {
        const idm = /[?&]id=eq\.([^&]+)/.exec(url), before = db.reports.length;
        if (url.indexOf('/notification_schedules') >= 0) db.reports = db.reports.filter(x => !(idm && x.id === idm[1]));
        const n = before - db.reports.length;
        return { ok: true, status: 204, headers: { get: k => (k === 'Content-Range' ? '*/' + n : null) }, json: () => Promise.resolve(null), text: () => Promise.resolve('') };
      }
      return r;
    });
  };
  h.db = db;
  return h;
}
async function settle(cond, max) { for (let i = 0; i < (max || 60); i++) { if (cond()) return true; await ticks(); } return cond(); }
async function loaded(h) {
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return false;
  return settle(() => !!h.doc.getElementById('dept-panel-admin') && !!h.doc.getElementById('tk-ov'));
}
async function peopleLoaded(h) {
  h.w.reportGroupPeopleCache = null;
  let done = false; h.w.loadReportGroupPeople().then(() => { done = true; });
  await settle(() => done);
}
const $ = (h, id) => h.doc.getElementById(id);
const reportPosts = h => h.calls.post.filter(x => x.table === 'notification_schedules');
const taskPosts = h => h.calls.post.filter(x => x.table === 'bulletin_tasks');
function check(h, sel, vals) {
  Array.prototype.forEach.call(h.doc.querySelectorAll(sel + ' input[type=checkbox]'), cb => { cb.checked = vals.indexOf(cb.value) >= 0; });
}
async function openNew(h, title, dues) {
  realClick(h.w, H.btn($(h, 'dept-panel-admin'), '+ Добави задача'), '✅ + Добави задача');
  $(h, 'tk-title').value = title;
  check(h, '#tk-due-dates', dues || []);
}
const openEditor = (h, prefix) => realClick(h.w, h.doc.querySelector('#' + prefix + '-tr .tr-open'), '+ Насрочи');
const submitNew = h => realClick(h.w, H.btnExact($(h, 'tk-ov'), 'Добави задача'), 'Добави задача');

(async function () {

  section('1. Нова задача с отчет — по подразбиране срокът + 18:00, авторът');
  {
    const h = env();
    if (await loaded(h)) {
      await peopleLoaded(h);
      await openNew(h, 'Витрина', [THU, FRI]);
      ok('секцията „📨 Отчет за изпълнението" е във формата', !!h.doc.querySelector('#tk-tr .tr-open'));
      openEditor(h, 'tk');
      ok('датата е ПОСЛЕДНИЯТ ден от срока', $(h, 'tk-tr-date') && $(h, 'tk-tr-date').value === FRI, $(h, 'tk-tr-date') && $(h, 'tk-tr-date').value);
      ok('часът е 18:00', $(h, 'tk-tr-time') && $(h, 'tk-tr-time').value === '18:00');
      const sel = $(h, 'tk-tr-users');
      const selected = sel ? Array.prototype.filter.call(sel.options, o => o.selected).map(o => o.value) : [];
      ok('авторът (текущият потребител) е отметнат', selected.join(',') === 'u-admin', selected.join(','));
      ok('групите са четирите ключа', Array.prototype.map.call(h.doc.querySelectorAll('#tk-tr-groups input'), c => c.value).join(',') === 'co,controlling,regional,owner');
      ok('етикетът на групата е с имената', /ЦО \(Жеко Желязков\)/.test($(h, 'tk-tr-groups').textContent), $(h, 'tk-tr-groups').textContent);
      check(h, '#tk-tr-groups', ['controlling']);
      Array.prototype.forEach.call(sel.options, o => { o.selected = (o.value === 'u-admin' || o.value === 'u-zh'); });
      submitNew(h);
      await settle(() => reportPosts(h).length > 0);
      const tp = taskPosts(h), rp = reportPosts(h);
      ok('задачата е записана веднъж', tp.length === 1);
      if (ok('ЕДИН ред в notification_schedules', rp.length === 1, JSON.stringify(rp.map(x => x.body)))) {
        const b = rp[0].body;
        ok('entity_type=task_report', b.entity_type === 'task_report');
        ok('entity_id = id-то на НОВАТА задача', b.entity_id === 't-new1', b.entity_id);
        ok('schedule_type=once, active=true', b.schedule_type === 'once' && b.active === true);
        ok('scheduled_date = ' + FRI + ', scheduled_time = 18:00', b.scheduled_date === FRI && b.scheduled_time === '18:00', b.scheduled_date + ' ' + b.scheduled_time);
        ok('target_recipients = {groups:[controlling], user_ids:[u-admin,u-zh]}',
          JSON.stringify(b.target_recipients) === JSON.stringify({ groups: ['controlling'], user_ids: ['u-admin', 'u-zh'] }), JSON.stringify(b.target_recipients));
        ok('created_by = display_name', b.created_by === 'Админ');
      }
      await settle(() => h.calls.toast.some(t => String(t).indexOf('добавена') >= 0));
      ok('тост „добавена … Насрочени отчети: 1"', h.calls.toast.some(t => String(t).indexOf('Насрочени отчети: 1') >= 0), JSON.stringify(h.calls.toast));
    }
  }

  section('2. Без срок → днес + 1 ч, закръглено нагоре до 15 мин');
  {
    const h = env();
    if (await loaded(h)) {
      await openNew(h, 'Без срок', []);
      openEditor(h, 'tk');
      ok('днешната дата', $(h, 'tk-tr-date').value === TODAY, $(h, 'tk-tr-date').value);
      ok('14:07 + 1 ч → 15:15', $(h, 'tk-tr-time').value === '15:15', $(h, 'tk-tr-time').value);
      const f = h.w.trDefaultWhen;
      const at = (hh, mm) => { const d = new Date(ANCHOR.getTime()); d.setHours(hh, mm, 0, 0); return f([], d); };
      ok('точно на 15 мин: 09:30 → 10:30', at(9, 30).time === '10:30', at(9, 30).time);
      ok('09:31 → 10:45', at(9, 31).time === '10:45', at(9, 31).time);
      ok('09:46 → 11:00 (преминава в следващия час)', at(9, 46).time === '11:00', at(9, 46).time);
      const late = at(23, 20);
      ok('23:20 → утре 00:30', late.time === '00:30' && late.date === isoOf(shifted(1)), JSON.stringify(late));
    }
  }

  section('3. Два отчета — 12:00 и 18:00 → два реда');
  {
    const h = env();
    if (await loaded(h)) {
      await peopleLoaded(h);
      await openNew(h, 'Два отчета', [FRI]);
      openEditor(h, 'tk');
      $(h, 'tk-tr-time').value = '12:00';
      check(h, '#tk-tr-groups', ['co']);
      realClick(h.w, h.doc.querySelector('#tk-tr .tr-add'), '+ Добави още един час');
      ok('първият стои като чернова в списъка', h.doc.querySelectorAll('#tk-tr-list .tr-draft').length === 1);
      ok('редакторът се затваря', $(h, 'tk-tr-editor').hidden === true);
      openEditor(h, 'tk');
      ok('вторият тръгва пак от 18:00', $(h, 'tk-tr-time').value === '18:00');
      submitNew(h);
      await settle(() => reportPosts(h).length >= 2);
      const rp = reportPosts(h).map(x => x.body.scheduled_time).sort();
      ok('два реда: 12:00 и 18:00', rp.join(',') === '12:00,18:00', rp.join(','));
      ok('и двата за същата задача', reportPosts(h).every(x => x.body.entity_id === 't-new1'));
      /* Черновата може и да се махне. */
      const h2 = env();
      await loaded(h2);
      await openNew(h2, 'Махната чернова', [FRI]);
      openEditor(h2, 'tk'); check(h2, '#tk-tr-groups', ['co']);
      realClick(h2.w, h2.doc.querySelector('#tk-tr .tr-add'), '+ Добави още един час');
      realClick(h2.w, h2.doc.querySelector('#tk-tr-list .tr-draft-del'), '✕ чернова');
      ok('✕ маха черновата', h2.doc.querySelectorAll('#tk-tr-list .tr-draft').length === 0);
      submitNew(h2);
      await settle(() => taskPosts(h2).length > 0); for (let i = 0; i < 5; i++) await ticks();
      ok('задачата — да, отчет — не', taskPosts(h2).length === 1 && reportPosts(h2).length === 0);
    }
  }

  section('4. Непълен или минал отчет → червен тост, НИЩО не се записва');
  {
    const h = env();
    if (await loaded(h)) {
      await openNew(h, 'Без получатели', [FRI]);
      openEditor(h, 'tk');
      Array.prototype.forEach.call($(h, 'tk-tr-users').options, o => { o.selected = false; });
      submitNew(h);
      for (let i = 0; i < 5; i++) await ticks();
      ok('тост „поне една група или човек"', h.calls.toast.some(t => String(t).indexOf('поне една група или човек') >= 0), JSON.stringify(h.calls.toast));
      ok('задачата НЕ е записана', taskPosts(h).length === 0);
      ok('отчет НЕ е записан', reportPosts(h).length === 0);
      /* минал час: днес 13:00 при часовник 14:07 */
      $(h, 'tk-tr-date').value = TODAY; $(h, 'tk-tr-time').value = '13:00';
      check(h, '#tk-tr-groups', ['co']);
      submitNew(h);
      for (let i = 0; i < 5; i++) await ticks();
      ok('тост „вече е минал"', h.calls.toast.some(t => String(t).indexOf('вече е минал') >= 0), JSON.stringify(h.calls.toast));
      ok('пак нищо записано', taskPosts(h).length === 0 && reportPosts(h).length === 0);
    }
  }

  section('5. Провал на реда за отчета → червен тост, задачата остава');
  {
    const h = env({ fail: { POST: /notification_schedules/ } });
    if (await loaded(h)) {
      await openNew(h, 'Провал', [FRI]);
      openEditor(h, 'tk');
      submitNew(h);
      await settle(() => h.calls.toast.some(t => String(t).indexOf('НЕ са насрочени') >= 0));
      ok('червен тост „… НЕ са насрочени"', h.calls.toast.some(t => String(t).indexOf('1 от 1 отчета НЕ са насрочени') >= 0), JSON.stringify(h.calls.toast));
      ok('задачата е записана', taskPosts(h).length === 1 && h.db.tasks.length === 1);
      ok('без зелен тост „добавена"', !h.calls.toast.some(t => String(t).indexOf('✅ Задачата е добавена') >= 0));
    }
  }

  section('6. Редакция: заварените със ✕, новият с id-то на задачата');
  {
    const T = { id: 't-ex', bulletin_id: 'b-1', title: 'Заварена', department: 'admin', task_type: 'info', due_date: THU, due_dates: [THU],
                created_by: 'Миглена Павлова', report_groups: null, target_stores: null, sort_order: 1 };
    const R = { id: 'n-old', entity_type: 'task_report', entity_id: 't-ex', schedule_type: 'once', scheduled_date: THU, scheduled_time: '12:00:00',
                target_recipients: { groups: ['co'], user_ids: ['u-mp'] }, active: true, last_sent_at: null };
    const h = env({ tasks: [T], reports: [R] });
    if (await loaded(h)) {
      await peopleLoaded(h);
      await settle(() => h.w.bulTaskReports.length === 1);
      guard('openEditTaskModal не хвърля', () => h.w.openEditTaskModal('t-ex'));
      const rows = h.doc.querySelectorAll('#etk-tr-list .tr-row');
      ok('завареният отчет е в списъка', rows.length === 1, String(rows.length));
      ok('с датата, часа и получателите', rows.length && /12:00/.test(rows[0].textContent) && /ЦО/.test(rows[0].textContent) && /Миглена Павлова/.test(rows[0].textContent), rows.length && rows[0].textContent);
      openEditor(h, 'etk');
      ok('по подразбиране: срокът на задачата (' + THU + ') 18:00', $(h, 'etk-tr-date').value === THU && $(h, 'etk-tr-time').value === '18:00', $(h, 'etk-tr-date').value + ' ' + $(h, 'etk-tr-time').value);
      const sel = Array.prototype.filter.call($(h, 'etk-tr-users').options, o => o.selected).map(o => o.value);
      ok('авторът е АВТОРЪТ на задачата (Миглена), не редакторът', sel.join(',') === 'u-mp', sel.join(','));
      realClick(h.w, H.btn($(h, 'edit-tk-ov'), 'Запази'), 'Запази');
      await settle(() => reportPosts(h).length > 0);
      const rp = reportPosts(h);
      ok('нов ред с entity_id=t-ex', rp.length === 1 && rp[0].body.entity_id === 't-ex', JSON.stringify(rp.map(x => x.body.entity_id)));
      ok('заваременият НЕ е пипнат', h.calls.del.length === 0 && h.calls.patch.filter(x => x.table === 'notification_schedules').length === 0);
      /* ✕ на заварения */
      guard('пак отваряне', () => h.w.openEditTaskModal('t-ex'));
      const del = h.doc.querySelector('#etk-tr-list .tr-del[data-tr-id="n-old"]');
      if (ok('✕ на заварения', !!del)) {
        realClick(h.w, del, '✕');
        await settle(() => h.calls.del.length > 0);
        ok('DELETE точно на n-old (и само task_report)', h.calls.del.length === 1 && /id=eq\.n-old/.test(h.calls.del[0]) && /entity_type=eq\.task_report/.test(h.calls.del[0]), h.calls.del.join(' | '));
        await settle(() => !h.doc.querySelector('#etk-tr-list .tr-del[data-tr-id="n-old"]'));
        ok('изчезва от списъка във формата', !h.doc.querySelector('#etk-tr-list .tr-del[data-tr-id="n-old"]'));
      }
    }
  }

  section('7. Под задачата в блока — админ вижда със ✕, обектът не вижда');
  {
    const T = { id: 't-ex', bulletin_id: 'b-1', title: 'Заварена', department: 'admin', task_type: 'info', due_date: THU, due_dates: [THU],
                created_by: 'Админ', report_groups: null, target_stores: null, sort_order: 1 };
    const R = { id: 'n-1', entity_type: 'task_report', entity_id: 't-ex', schedule_type: 'once', scheduled_date: FRI, scheduled_time: '18:00:00',
                target_recipients: { groups: ['owner'], user_ids: [] }, active: true, last_sent_at: null };
    const h = env({ tasks: [T], reports: [R] });
    if (await loaded(h)) {
      await settle(() => !!h.doc.querySelector('#dept-panel-admin .tr-task-list'));
      const list = h.doc.querySelector('#dept-panel-admin .tr-task-list[data-tr-task="t-ex"]');
      ok('списъкът е под задачата', !!list);
      const dm = FRI.slice(8, 10) + '.' + FRI.slice(5, 7);
      ok('„📨 Отчет ' + dm + ' 18:00 → Собственик"', !!list && list.textContent.indexOf('📨 Отчет ' + dm + ' 18:00') >= 0 && list.textContent.indexOf('Собственик') >= 0, list && list.textContent);
      ok('има ✕', !!list && !!list.querySelector('.tr-del'));
      const gets = h.calls.get.filter(u => u.indexOf('/notification_schedules') >= 0);
      ok('заявката е само за task_report и задачите на бюлетина', gets.length === 1 && /entity_type=eq\.task_report/.test(gets[0]) && /entity_id=in\.\(t-ex\)/.test(gets[0]), gets.join(' | '));
    }
    const hs = env({ tasks: [T], reports: [R], user: STORE });
    if (await loaded(hs)) {
      for (let i = 0; i < 10; i++) await ticks();
      ok('обектът: няма списък', !hs.doc.querySelector('.tr-task-list'));
      ok('обектът: дори не пита notification_schedules', !hs.calls.get.some(u => u.indexOf('/notification_schedules') >= 0));
    }
  }

  section('8. Чернова: предупреждение, редът пак се записва');
  {
    const h = env({ status: 'draft' });
    if (await loaded(h)) {
      await openNew(h, 'В чернова', [FRI]);
      ok('предупреждение „Бюлетинът е чернова"', $(h, 'tk-tr').textContent.indexOf('Бюлетинът е чернова') >= 0);
      openEditor(h, 'tk');
      submitNew(h);
      await settle(() => reportPosts(h).length > 0);
      ok('редът е записан (гейтът е при изпращането)', reportPosts(h).length === 1);
    }
    const hp = env();
    if (await loaded(hp)) {
      await openNew(hp, 'Публикуван', [FRI]);
      ok('КОНТРОЛА — публикуван: без предупреждение', $(hp, 'tk-tr').textContent.indexOf('Бюлетинът е чернова') < 0);
    }
  }

  section('9. Без отворена секция — задачата както преди, без ред');
  {
    const h = env();
    if (await loaded(h)) {
      await openNew(h, 'Обикновена', [FRI]);
      submitNew(h);
      await settle(() => taskPosts(h).length > 0); for (let i = 0; i < 5; i++) await ticks();
      ok('задачата е записана', taskPosts(h).length === 1);
      ok('нито един ред в notification_schedules', reportPosts(h).length === 0);
      ok('зелен тост без „Насрочени отчети"', h.calls.toast.some(t => String(t) === '✅ Задачата е добавена!'), JSON.stringify(h.calls.toast));
      /* Повторно отваряне на формата — черновите от предишния път ги няма. */
      h.w.trDrafts.tk = [{ date: FRI, time: '12:00', groups: ['co'], user_ids: [] }];
      h.w.openTaskModalForDept('admin');
      ok('нова форма → без стари чернови', h.doc.querySelectorAll('#tk-tr-list .tr-draft').length === 0);
    }
  }

  section('10. Постоянна задача: ✏️ → секцията; запис → ред с id-то на постоянната');
  {
    const RT = { id: 'r-zar', title: 'ЗАРЕЖДАНЕ', department: 'admin', task_type: 'check', active: true, sort_order: 1,
                 due_weekdays: [4], due_weekday: 4, due_time: null, report_groups: null, target_stores: null,
                 linked_module: 'supply', created_by: 'Миглена Павлова' };
    const PER = [{ recurring_task_id: 'r-zar', from_monday: '2020-01-06', to_monday: null }];
    const R = { id: 'n-rec', entity_type: 'task_report', entity_id: 'r-zar', schedule_type: 'once', scheduled_date: FRI, scheduled_time: '12:00:00',
                target_recipients: { groups: ['co'], user_ids: [] }, active: true, last_sent_at: null };
    const h = env({ recurring: [RT], periods: PER, reports: [R], status: 'draft' });
    if (await loaded(h)) {
      await peopleLoaded(h);
      await settle(() => h.w.bulTaskReports.length === 1);
      ok('отчетите на постоянната се зареждат (entity_id в заявката)',
        h.calls.get.some(u => /notification_schedules\?entity_type=eq\.task_report&entity_id=in\.\([^)]*r-zar/.test(decodeURIComponent(u))), h.calls.get.filter(u => /notification_schedules/.test(u)).join(' | '));
      await settle(() => !!h.doc.querySelector('.tr-task-list[data-tr-task="r-zar"]'));
      ok('под постоянната задача в блока — заварения отчет със ✕',
        !!h.doc.querySelector('.tr-task-list[data-tr-task="r-zar"] .tr-del[data-tr-id="n-rec"]'));
      const edit = Array.prototype.find.call(h.doc.querySelectorAll('button'), b => /openEditRecurringModal\('r-zar'\)/.test(b.getAttribute('onclick') || ''));
      if (ok('бутонът ✏️ на постоянната задача', !!edit)) {
        realClick(h.w, edit, '✏️ постоянна');
        ok('формата „Редактирай постоянна задача" е отворена', !!$(h, 'edit-rec-ov'));
        ok('секцията „📨 Отчет за изпълнението" е в нея', !!h.doc.querySelector('#erec-tr .tr-open'));
        ok('без предупреждение за чернова (постоянната няма бюлетин)', $(h, 'erec-tr').textContent.indexOf('Бюлетинът е чернова') < 0);
        ok('обяснява, че важи седмицата на избрания ден', $(h, 'erec-tr').textContent.indexOf('седмицата на избрания ден') >= 0);
        const rows = h.doc.querySelectorAll('#erec-tr-list .tr-row');
        ok('завареният отчет е в списъка на формата', rows.length === 1 && /12:00/.test(rows[0].textContent), rows.length && rows[0].textContent);
        openEditor(h, 'erec');
        ok('редакторът се отваря (дата, час, хора)', !!$(h, 'erec-tr-date') && !!$(h, 'erec-tr-time') && !!$(h, 'erec-tr-users'));
        const sel = Array.prototype.filter.call($(h, 'erec-tr-users').options, o => o.selected).map(o => o.value);
        ok('авторът на постоянната задача е отметнат (Миглена)', sel.join(',') === 'u-mp', sel.join(','));
        $(h, 'erec-tr-date').value = FRI; $(h, 'erec-tr-time').value = '18:00';
        check(h, '#erec-tr-groups', ['co']);
        realClick(h.w, H.btn($(h, 'edit-rec-ov'), 'Запази'), 'Запази постоянна');
        await settle(() => reportPosts(h).length > 0);
        /* От 24.09.2026 съдържанието се записва като ВЕРСИЯ за седмицата
           (recurring_task_versions); редът в recurring_tasks не се пипа. */
        const ver = h.calls.post.filter(x => x.table === 'recurring_task_versions');
        ok('ред във versions за r-zar', ver.length === 1 && ver[0].body.recurring_task_id === 'r-zar', JSON.stringify(ver.map(x => x.body.recurring_task_id)));
        ok('recurring_tasks не е пипана', h.calls.patch.every(x => x.table !== 'recurring_tasks'));
        const rp = reportPosts(h);
        ok('ЕДИН нов ред в notification_schedules', rp.length === 1, String(rp.length));
        const b = (rp[0] || {}).body || {};
        ok('entity_type=task_report, entity_id=r-zar (id-то на постоянната)', b.entity_type === 'task_report' && b.entity_id === 'r-zar', JSON.stringify(b));
        ok('schedule_type=once, ' + FRI + ' 18:00, група co + Миглена', b.schedule_type === 'once' && b.scheduled_date === FRI && b.scheduled_time === '18:00' &&
          JSON.stringify(b.target_recipients) === JSON.stringify({ groups: ['co'], user_ids: ['u-mp'] }), JSON.stringify(b));
        ok('БЕЗ нова колона в тялото (entity_kind и т.н.)', !('entity_kind' in b));
        ok('нищо не е записано в bulletin_tasks', taskPosts(h).length === 0 && h.calls.patch.every(x => x.table !== 'bulletin_tasks'));
        await settle(() => !$(h, 'edit-rec-ov'));
        ok('формата се затваря, зелен тост с „Насрочени отчети: 1"', !$(h, 'edit-rec-ov') && h.calls.toast.some(t => /Насрочени отчети: 1/.test(String(t))), JSON.stringify(h.calls.toast));
        /* ✕ на заварения — от формата на постоянната */
        await settle(() => h.w.recurringTasks.some(x => x.id === 'r-zar'));
        guard('пак отваряне', () => h.w.openEditRecurringModal('r-zar'));
        const del = h.doc.querySelector('#erec-tr-list .tr-del[data-tr-id="n-rec"]');
        if (ok('✕ на заварения във формата на постоянната', !!del)) {
          realClick(h.w, del, '✕');
          await settle(() => h.calls.del.length > 0);
          ok('DELETE точно на n-rec (и само task_report)', h.calls.del.length === 1 && /id=eq\.n-rec/.test(h.calls.del[0]) && /entity_type=eq\.task_report/.test(h.calls.del[0]), h.calls.del.join(' | '));
          await settle(() => !h.doc.querySelector('#erec-tr-list .tr-del[data-tr-id="n-rec"]'));
          ok('изчезва от списъка във формата', !h.doc.querySelector('#erec-tr-list .tr-del[data-tr-id="n-rec"]'));
        }
      }
    }
    const hs = env({ user: STORE, recurring: [RT], periods: PER, reports: [R] });
    if (await loaded(hs)) {
      for (let i = 0; i < 10; i++) await ticks();
      ok('обектът не вижда отчетите под постоянната задача', !hs.doc.querySelector('.tr-task-list[data-tr-task="r-zar"]'));
    }
    const hn = env({ recurring: [RT], periods: PER });
    if (await loaded(hn)) {
      const edit = Array.prototype.find.call(hn.doc.querySelectorAll('button'), b => /openEditRecurringModal\('r-zar'\)/.test(b.getAttribute('onclick') || ''));
      realClick(hn.w, edit, '✏️');
      realClick(hn.w, H.btn($(hn, 'edit-rec-ov'), 'Запази'), 'Запази без отчет');
      await settle(() => hn.calls.post.some(x => x.table === 'recurring_task_versions'));
      for (let i = 0; i < 5; i++) await ticks();
      ok('без отворена секция — само версията, нито един ред за отчет',
        reportPosts(hn).length === 0 && hn.calls.post.some(x => x.table === 'recurring_task_versions'));
    }
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
