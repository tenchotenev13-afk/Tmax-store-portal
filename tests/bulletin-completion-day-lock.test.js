/* Бюлетин — отмятане само за днешния ден (и наваксване в рамките на
   текущата седмица).

   Находка (22.08.2026): чекбоксите в седмичния календар, в главния списък по
   отдели, в renderTasksPanel() и в блока „🔁 Постоянни задачи" носеха
   data-cdate за произволен ден и нищо не сравняваше тази дата с днешната.
   Магазин можеше да отметне бъдещ ден (отчита несвършена работа) или ден от
   стара седмица (разминава портала със седмичния имейл, който вече е тръгнал).

   Правило след промяната:
     - днес                     -> отключено
     - изминал ден ОТ ТЕКУЩАТА седмица -> отключено (наваксване до понеделник)
     - ден от по-стара седмица  -> disabled, „Седмицата е отчетена"
     - бъдещ ден                -> disabled, „Денят още не е настъпил"
     - completion_date = null   -> отключено (стари постоянни задачи)

   Часовникът е замразен на сряда, 19.08.2026 (С34), за да не гният датите и
   да има реален „изминал ден от същата седмица" независимо кога тече тестът.

   Пускане: node tests/bulletin-completion-day-lock.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, fire, ok, guard, section, report, ticks } = H;

/* ── Замразен часовник ───────────────────────────────────────────────────── */
/* bulletin.js вика new Date() вътре в window scope, затова подменяме w.Date.
   12:00 местно време, за да няма гранични ефекти около полунощ. */
function freezeDate(w, y, m, d) {
  const Real = w.Date;
  const fixedMs = new Real(y, m - 1, d, 12, 0, 0).getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  }
  w.Date = Frozen;
}

const MON      = '2026-08-17';
const TUE      = '2026-08-18';
const TODAY    = '2026-08-19'; /* сряда */
const THU      = '2026-08-20';
const FRI      = '2026-08-21';
const LAST_SUN = '2026-08-16'; /* последният ден от предходната седмица */
const LAST_WED = '2026-08-12';

const STORE = 'Кърджали';

function task(id, dates, over) {
  return Object.assign({
    id: id, title: 'Задача ' + id, department: 'trade', task_type: 'info',
    target_stores: [STORE], due_dates: dates, linked_module: null
  }, over || {});
}
function rec(id, weekdays, over) {
  return Object.assign({
    id: id, title: 'Постоянна ' + id, department: 'trade', task_type: 'info',
    target_stores: [STORE], due_weekdays: weekdays, due_time: '09:00',
    linked_module: null, active: true
  }, over || {});
}

/* boot + минималният набор глобални, които renderBulView() чете.
   opts: { role, weekOffset } — weekOffset -1 показва миналата седмица. */
function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js'],
    user: { email: 'u@temax.bg', display_name: 'Тест', role: opts.role || 'manager', store_name: STORE },
    data: {}
  });
  const w = h.w;
  freezeDate(w, 2026, 8, 19);

  const wk = w.weekNum(new w.Date()) + (opts.weekOffset || 0);
  const cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });

  w.curBul = {
    id: 'b-1', week_number: wk, year: 2026, status: 'published',
    content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } }
  };
  w.bulListCache = [];
  w.bulComps = [];
  w.recurringComps = [];
  w.allStoresCache = [STORE, 'Троян'];

  w.bulTasks = [
    task('t-today', [TODAY]),
    task('t-thu',   [THU]),
    task('t-mon',   [MON]),
    task('t-old',   [LAST_WED]),
    task('t-nodate', null, { due_dates: null, due_date: null })
  ];
  w.recurringTasks = [
    rec('r-wed', [2]),
    rec('r-fri', [4]),
    rec('r-mon', [0])
  ];
  return h;
}

/* ── Търсене на чекбоксове ───────────────────────────────────────────────── */
/* САМО input[type=checkbox]. Статусният бадж е <span> и съдържа същия текст —
   търсене по контейнер или по 'button, span' би излъгало (виж SKILL.md). */
function cbsFor(doc, attr, id) {
  return Array.prototype.slice.call(
    doc.querySelectorAll('input[type=checkbox][' + attr + '="' + id + '"]')
  );
}
function allDisabled(list) { return list.length > 0 && list.every(c => c.disabled === true); }
function noneDisabled(list) { return list.length > 0 && list.every(c => c.disabled === false); }
function titles(list) { return list.map(c => c.getAttribute('title') || ''); }
function allDimmed(list) {
  return list.length > 0 && list.every(c => (c.getAttribute('style') || '').indexOf('cursor:not-allowed') >= 0);
}

/* Синтетичен чекбокс за пряко извикване на обработчика (заобикаля disabled,
   както би направила конзолата). */
function fakeCb(doc, attr, id, cdate, checked) {
  const cb = doc.createElement('input');
  cb.type = 'checkbox';
  cb.setAttribute(attr === 'data-rtid' ? 'data-rtid' : 'data-tid', id);
  cb.setAttribute('data-cdate', cdate);
  cb.checked = !!checked;
  return cb;
}

(async function run() {

  /* ═══ 1. Самото правило ═══════════════════════════════════════════════ */
  section('1. bulDateLockReason() — правилото само по себе си');
  {
    const { w } = env();
    const r = w.bulDateLockReason;
    ok('днес -> отключено',                    r(TODAY) === null, String(r(TODAY)));
    ok('утре -> future',                       r(THU) === 'future', String(r(THU)));
    ok('петък (по-нататък) -> future',         r(FRI) === 'future', String(r(FRI)));
    ok('вчера, същата седмица -> отключено',   r(TUE) === null, String(r(TUE)));
    ok('понеделник, същата седмица -> отключено (границата)', r(MON) === null, String(r(MON)));
    ok('неделя от миналата седмица -> past (границата)',      r(LAST_SUN) === 'past', String(r(LAST_SUN)));
    ok('минала седмица -> past',               r(LAST_WED) === 'past', String(r(LAST_WED)));
    ok('null -> отключено (стара постоянна задача)', r(null) === null, String(r(null)));
    ok('празен низ -> отключено',              r('') === null, String(r('')));
    ok('undefined -> отключено',               r(undefined) === null, String(r(undefined)));

    ok('надписът за бъдеще', w.bulLockLabel('future') === 'Денят още не е настъпил', w.bulLockLabel('future'));
    ok('надписът за минало', w.bulLockLabel('past') === 'Седмицата е отчетена', w.bulLockLabel('past'));
    ok('bulTodayISO() е локална дата, не UTC', w.bulTodayISO() === TODAY, w.bulTodayISO());
    ok('bulWeekMondayISO() е понеделник на текущата седмица', w.bulWeekMondayISO() === MON, w.bulWeekMondayISO());
  }

  /* ═══ 2. Markup — всички места на рендиране наведнъж ══════════════════ */
  section('2. Markup: заключените чекбоксове са disabled на ВСЯКО място');
  {
    const h = env();
    const { w, doc } = h;
    if (guard('renderBulView() не хвърля', () => w.renderBulView())) {

      const today = cbsFor(doc, 'data-tid', 't-today');
      const thu   = cbsFor(doc, 'data-tid', 't-thu');
      const mon   = cbsFor(doc, 'data-tid', 't-mon');
      const old   = cbsFor(doc, 'data-tid', 't-old');
      const nod   = cbsFor(doc, 'data-tid', 't-nodate');

      /* Календар + главен списък по отдели + renderTasksPanel = 3 места. */
      ok('днешната задача се рендира на >1 място', today.length >= 2, 'бр.: ' + today.length);
      ok('днешната задача — нито един чекбокс не е заключен', noneDisabled(today));
      ok('днешната задача — без приглушен стил', today.every(c => (c.getAttribute('style')||'').indexOf('cursor:not-allowed') < 0));

      ok('утрешната задача се рендира на >1 място', thu.length >= 2, 'бр.: ' + thu.length);
      ok('утрешната задача — ВСИЧКИ чекбоксове са disabled', allDisabled(thu), 'бр.: ' + thu.length);
      ok('утрешната задача — title „Денят още не е настъпил"',
        titles(thu).every(t => t === 'Денят още не е настъпил'), titles(thu).join(' | '));
      ok('утрешната задача — приглушен вид', allDimmed(thu));

      ok('понеделник от същата седмица — отключено (наваксване)', noneDisabled(mon), 'бр.: ' + mon.length);

      ok('задача от минала седмица се рендира (в списъка, не в календара)', old.length >= 1, 'бр.: ' + old.length);
      ok('задача от минала седмица — ВСИЧКИ са disabled', allDisabled(old));
      ok('задача от минала седмица — title „Седмицата е отчетена"',
        titles(old).every(t => t === 'Седмицата е отчетена'), titles(old).join(' | '));

      ok('задача без дата (data-cdate="") се рендира', nod.length >= 1, 'бр.: ' + nod.length);
      ok('задача без дата — НЕ е заключена', noneDisabled(nod));
      ok('задача без дата — data-cdate е празен', nod.every(c => c.getAttribute('data-cdate') === ''));

      /* Постоянни задачи — календар + блок „🔁 Постоянни задачи" */
      const rWed = cbsFor(doc, 'data-rtid', 'r-wed');
      const rFri = cbsFor(doc, 'data-rtid', 'r-fri');
      const rMon = cbsFor(doc, 'data-rtid', 'r-mon');
      ok('постоянна за днес се рендира на >1 място', rWed.length >= 2, 'бр.: ' + rWed.length);
      ok('постоянна за днес — отключена', noneDisabled(rWed));
      ok('постоянна за петък — ВСИЧКИ са disabled', allDisabled(rFri), 'бр.: ' + rFri.length);
      ok('постоянна за петък — title „Денят още не е настъпил"',
        titles(rFri).every(t => t === 'Денят още не е настъпил'), titles(rFri).join(' | '));
      ok('постоянна за понеделник (същата седмица) — отключена', noneDisabled(rMon), 'бр.: ' + rMon.length);

      /* Контролата не се крие — стои видима, само не се натиска. */
      ok('заключените чекбоксове НЕ са скрити',
        thu.concat(rFri).every(c => (c.getAttribute('style')||'').indexOf('display:none') < 0));
    }
  }

  /* ═══ 3. Изглед на минала седмица — всичко е заключено ════════════════ */
  section('3. Календар на минала седмица — всеки ден е заключен');
  {
    const h = env({ weekOffset: -1 });
    const { w, doc } = h;
    if (guard('renderBulView() за С33 не хвърля', () => w.renderBulView())) {
      const cal = doc.querySelector('#sec-calendar');
      if (ok('календарът се рендира', !!cal)) {
        const cbs = Array.prototype.slice.call(cal.querySelectorAll('input[type=checkbox][data-cdate]'));
        ok('в календара на С33 има чекбоксове', cbs.length > 0, 'бр.: ' + cbs.length);
        ok('всички са disabled', allDisabled(cbs), 'бр.: ' + cbs.length);
        ok('всички носят „Седмицата е отчетена"',
          titles(cbs).every(t => t === 'Седмицата е отчетена'), titles(cbs).join(' | '));
      }
    }
  }

  /* ═══ 4. Истински клик по чекбокс за ДНЕС — заявката тръгва ═══════════ */
  section('4. Истински клик: днешният ден работи както преди');
  {
    const h = env();
    const { w, doc, calls } = h;
    w.renderBulView();
    const cb = cbsFor(doc, 'data-tid', 't-today')[0];
    if (ok('чекбоксът за днес е намерен', !!cb)) {
      cb.checked = true;
      guard('onchange не хвърля', () => fire(w, cb, 'change'));
      await ticks();
      const posts = calls.post.filter(p => p.table === 'task_completions');
      ok('POST към task_completions тръгва', posts.length === 1, 'бр.: ' + posts.length);
      if (posts.length) {
        ok('completion_date е днешната дата', posts[0].body.completion_date === TODAY, String(posts[0].body.completion_date));
      }
    }
  }

  /* ═══ 5. Втора защита в обработчиците ════════════════════════════════ */
  section('5. Втора защита: пряко извикване на обработчика (заобикаля disabled)');
  {
    const h = env();
    const { w, doc, calls } = h;
    w.renderBulView();
    const before = calls.post.length + calls.patch.length;

    /* 5.1 бъдеща дата */
    const cbF = fakeCb(doc, 'data-tid', 't-thu', THU, true);
    guard('bulCheckboxChanged(бъдеща дата) не хвърля', () => w.bulCheckboxChanged(cbF));
    await ticks();
    ok('бъдеща дата — чекбоксът е върнат в изходно състояние', cbF.checked === false);
    ok('бъдеща дата — няма заявка', calls.post.length + calls.patch.length === before);
    ok('бъдеща дата — toast „Денят още не е настъпил"',
      calls.toast.some(t => String(t).indexOf('Денят още не е настъпил') >= 0), JSON.stringify(calls.toast));

    /* 5.2 минала седмица */
    const cbP = fakeCb(doc, 'data-tid', 't-old', LAST_WED, true);
    guard('bulCheckboxChanged(минала седмица) не хвърля', () => w.bulCheckboxChanged(cbP));
    await ticks();
    ok('минала седмица — чекбоксът е върнат в изходно състояние', cbP.checked === false);
    ok('минала седмица — няма заявка', calls.post.length + calls.patch.length === before);
    ok('минала седмица — toast „Седмицата е отчетена"',
      calls.toast.some(t => String(t).indexOf('Седмицата е отчетена') >= 0), JSON.stringify(calls.toast));

    /* 5.3 РАЗотмятане на заключен ден също се отхвърля, а състоянието се
           връща на „отметнато", не на „неотметнато" */
    const cbU = fakeCb(doc, 'data-tid', 't-old', LAST_WED, false);
    guard('bulCheckboxChanged(разотмятане, минала седмица) не хвърля', () => w.bulCheckboxChanged(cbU));
    await ticks();
    ok('разотмятане — състоянието е върнато на отметнато', cbU.checked === true);
    ok('разотмятане — няма заявка (нито DELETE, нито PATCH)',
      calls.post.length + calls.patch.length + calls.del.length === before);

    /* 5.4 постоянна задача — същият механизъм */
    const cbR = fakeCb(doc, 'data-rtid', 'r-fri', FRI, true);
    guard('bulRecurringCheckboxChanged(бъдеща дата) не хвърля', () => w.bulRecurringCheckboxChanged(cbR));
    await ticks();
    ok('постоянна, бъдеща дата — чекбоксът е върнат', cbR.checked === false);
    ok('постоянна, бъдеща дата — няма заявка', calls.post.length + calls.patch.length === before);
  }

  /* ═══ 6. null / празна дата продължава да работи ══════════════════════ */
  section('6. completion_date = null НЕ се блокира');
  {
    const h = env();
    const { w, doc, calls } = h;
    w.renderBulView();

    const cb = fakeCb(doc, 'data-tid', 't-nodate', '', true);
    guard('bulCheckboxChanged(празна дата) не хвърля', () => w.bulCheckboxChanged(cb));
    await ticks();
    const posts = calls.post.filter(p => p.table === 'task_completions');
    ok('заявката тръгва', posts.length === 1, 'бр.: ' + posts.length);
    if (posts.length) {
      ok('completion_date е null', posts[0].body.completion_date === null, String(posts[0].body.completion_date));
    }
    ok('няма toast за заключен ден',
      !calls.toast.some(t => String(t).indexOf('не е настъпил') >= 0 || String(t).indexOf('отчетена') >= 0),
      JSON.stringify(calls.toast));
  }

  /* ═══ 7. Баджът „💬/📷" — вторият вход към модала ═════════════════════ */
  section('7. Баджът не е пряк път към модала за заключен ден');
  {
    const h = env();
    const { w, doc, calls } = h;
    /* Баджът е кликаем само за задачи от вид, различен от info. */
    w.bulTasks = [
      task('b-today', [TODAY], { task_type: 'comment' }),
      task('b-thu',   [THU],   { task_type: 'comment' }),
      task('b-old',   [LAST_WED], { task_type: 'comment' })
    ];
    w.recurringTasks = [];
    if (guard('renderBulView() с баджове не хвърля', () => w.renderBulView())) {
      const badge = id => Array.prototype.slice.call(doc.querySelectorAll('span[data-task-id="' + id + '"]'));
      ok('баджът за днес е кликаем', badge('b-today').length >= 1, 'бр.: ' + badge('b-today').length);
      ok('баджът за утре НЕ е кликаем', badge('b-thu').length === 0, 'бр.: ' + badge('b-thu').length);
      ok('баджът за минала седмица НЕ е кликаем', badge('b-old').length === 0, 'бр.: ' + badge('b-old').length);
    }

    /* Дори при пряко извикване модалът не се отваря. */
    const tCount = calls.toast.length;
    guard('openTaskCompletionModal(бъдеща дата) не хвърля',
      () => w.openTaskCompletionModal('b-thu', 'regular', THU));
    ok('модалът НЕ е отворен', !doc.getElementById('tc-modal-ov'));
    ok('показан е toast', calls.toast.length > tCount, JSON.stringify(calls.toast.slice(tCount)));

    guard('openTaskCompletionModal(днес) не хвърля',
      () => w.openTaskCompletionModal('b-today', 'regular', TODAY));
    ok('за днес модалът СЕ отваря', !!doc.getElementById('tc-modal-ov'));
  }

  /* ═══ 8. Централен офис — пътят с calItemStatusHtml не се чупи ════════ */
  section('8. Глобална роля: чекбокс изобщо не се рендира');
  {
    const h = env({ role: 'admin' });
    const { w, doc } = h;
    if (guard('renderBulView() за admin не хвърля', () => w.renderBulView())) {
      const cal = doc.querySelector('#sec-calendar');
      if (ok('календарът се рендира', !!cal)) {
        const cbs = cal.querySelectorAll('input[type=checkbox][data-cdate]');
        ok('в календара на офиса няма чекбоксове за отмятане', cbs.length === 0, 'бр.: ' + cbs.length);
        /* Вместо чекбокс офисът вижда брояча от calItemStatusHtml.
           target_stores е един магазин -> „0/1". */
        ok('вместо чекбокс се рендира броячът на calItemStatusHtml',
          cal.textContent.indexOf('0/1') >= 0);
      }
    }
  }

  report();
})();
