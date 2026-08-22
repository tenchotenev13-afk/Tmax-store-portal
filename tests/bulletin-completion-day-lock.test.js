/* Бюлетин — отмятане САМО за днешния ден.

   История: 65e75f9 въведе заключването по дата, но отключваше и изминалите
   дни от текущата седмица (наваксване до понеделник). Това отпадна съзнателно:
   отмятането е твърдение КОГА е свършена работата. Ако в петък може да се
   отметне понеделник, отметката значи „твърдя, че съм го свършил", а не
   „свърших го тогава".

   Правило след промяната:
     - днес                   -> отключено
     - изминал ден (вчера, понеделник от същата седмица, минала седмица)
                              -> disabled, „Денят е приключил"
     - бъдещ ден              -> disabled, „Денят още не е настъпил"
     - completion_date = null -> отключено (стари постоянни задачи)

   ⚠️ Датите. В теста няма НИТО ЕДНА фиксирана календарна дата — всичко е
   отместване спрямо един котвен ден, точно както прави dayOffset(). Котвата
   обаче се и замразява на w.Date, защото самият dayOffset() не стига тук:
   случаят „понеделник, гледан в ПЕТЪК от същата седмица" е същината на
   промяната, а спрямо реалния часовник той е невъзможен в понеделник и мени
   значението си всеки ден. Затова котвата е петъкът от текущата реална
   седмица — гарантирано петък, без нито един календарен литерал, тоест
   не може да изгние както paid-transport.test.js на 23.08.

   Пускане: node tests/bulletin-completion-day-lock.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, fire, ok, guard, section, report, ticks } = H;

/* ── Котва: петъкът от текущата реална седмица, 12:00 местно ─────────────── */
/* (getDay()+6)%7 дава 0=Пон..6=Нед; 4 = петък. Отместването остава в рамките
   на същата ISO седмица и в неделя, и в понеделник. */
const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (4 - ((d.getDay() + 6) % 7)));
  return d;
})();

function isoOffset(days) {
  const d = new Date(ANCHOR.getTime());
  d.setDate(d.getDate() + days);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

const MON       = isoOffset(-4); /* понеделник от СЪЩАТА седмица — същината */
const YESTERDAY = isoOffset(-1); /* четвъртък */
const TODAY     = isoOffset(0);  /* петък */
const TOMORROW  = isoOffset(1);  /* събота */
const LAST_WEEK = isoOffset(-9); /* сряда от миналата седмица */

/* Индекси на дните от седмицата за постоянните задачи (0=Пон..6=Нед). */
const IDX_MON = 0, IDX_FRI = 4, IDX_SAT = 5;

/* bulletin.js вика new Date() вътре в window scope, затова подменяме w.Date. */
function freezeDate(w) {
  const Real = w.Date;
  const fixedMs = ANCHOR.getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  }
  w.Date = Frozen;
}

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
  freezeDate(w);

  const now = new w.Date();
  const wk = w.weekNum(now) + (opts.weekOffset || 0);
  const cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });

  w.curBul = {
    id: 'b-1', week_number: wk, year: now.getFullYear(), status: 'published',
    content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } }
  };
  w.bulListCache = [];
  w.bulComps = [];
  w.recurringComps = [];
  w.allStoresCache = [STORE, 'Троян'];

  w.bulTasks = [
    task('t-today', [TODAY]),
    task('t-yest',  [YESTERDAY]),
    task('t-mon',   [MON]),
    task('t-tomo',  [TOMORROW]),
    task('t-old',   [LAST_WEEK]),
    task('t-nodate', null, { due_dates: null, due_date: null })
  ];
  w.recurringTasks = [
    rec('r-fri', [IDX_FRI]),
    rec('r-sat', [IDX_SAT]),
    rec('r-mon', [IDX_MON])
  ];
  return h;
}

/* ── Търсене на чекбоксове ───────────────────────────────────────────────── */
/* САМО input[type=checkbox]. Статусният бадж е <span> и носи същия текст —
   селектор от рода на 'button, span' би хванал и него и тестът би излъгал. */
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
function lockedAs(list, label) {
  return allDisabled(list) && titles(list).every(t => t === label);
}

/* Синтетичен чекбокс за пряко извикване на обработчика (заобикаля disabled,
   както би направила конзолата). */
function fakeCb(doc, attr, id, cdate, checked) {
  const cb = doc.createElement('input');
  cb.type = 'checkbox';
  cb.setAttribute(attr, id);
  cb.setAttribute('data-cdate', cdate);
  cb.checked = !!checked;
  return cb;
}

const L_FUTURE = 'Денят още не е настъпил';
const L_PAST   = 'Денят е приключил';

(async function run() {

  /* ═══ 0. Котвата наистина е петък ═════════════════════════════════════ */
  section('0. Котвата на теста');
  {
    ok('котвеният ден е петък', ANCHOR.getDay() === 5, 'getDay()=' + ANCHOR.getDay());
    ok('понеделникът е от същата седмица (4 дни назад)',
      new Date(TODAY + 'T00:00:00') - new Date(MON + 'T00:00:00') === 4 * 86400000);
    ok('няма фиксирани календарни дати', /^\d{4}-\d{2}-\d{2}$/.test(TODAY), TODAY);
  }

  /* ═══ 1. Самото правило ═══════════════════════════════════════════════ */
  section('1. bulDateLockReason() — отключен е САМО днешният ден');
  {
    const { w } = env();
    const r = w.bulDateLockReason;
    ok('днес -> отключено',                          r(TODAY) === null, String(r(TODAY)));
    ok('утре -> future',                             r(TOMORROW) === 'future', String(r(TOMORROW)));
    ok('вчера -> past',                              r(YESTERDAY) === 'past', String(r(YESTERDAY)));
    ok('понеделник, гледан в петък от СЪЩАТА седмица -> past',
      r(MON) === 'past', String(r(MON)));
    ok('минала седмица -> past',                     r(LAST_WEEK) === 'past', String(r(LAST_WEEK)));
    ok('null -> отключено (стара постоянна задача)', r(null) === null, String(r(null)));
    ok('празен низ -> отключено',                    r('') === null, String(r('')));
    ok('undefined -> отключено',                     r(undefined) === null, String(r(undefined)));

    ok('надписът за бъдеще', w.bulLockLabel('future') === L_FUTURE, w.bulLockLabel('future'));
    ok('надписът за минало', w.bulLockLabel('past') === L_PAST, w.bulLockLabel('past'));
    ok('bulTodayISO() е локална дата, не UTC', w.bulTodayISO() === TODAY, w.bulTodayISO());
    /* Наваксването отпадна заедно с помощната функция — ако някой я върне,
       това е сигнал, че правилото пак се е разхлабило. */
    ok('bulWeekMondayISO() е премахната (мъртъв код)',
      typeof w.bulWeekMondayISO === 'undefined', typeof w.bulWeekMondayISO);
  }

  /* ═══ 2. Markup — всички места на рендиране наведнъж ══════════════════ */
  section('2. Markup: заключените чекбоксове са disabled на ВСЯКО място');
  {
    const h = env();
    const { w, doc } = h;
    if (guard('renderBulView() не хвърля', () => w.renderBulView())) {

      const today = cbsFor(doc, 'data-tid', 't-today');
      const yest  = cbsFor(doc, 'data-tid', 't-yest');
      const mon   = cbsFor(doc, 'data-tid', 't-mon');
      const tomo  = cbsFor(doc, 'data-tid', 't-tomo');
      const old   = cbsFor(doc, 'data-tid', 't-old');
      const nod   = cbsFor(doc, 'data-tid', 't-nodate');

      /* Календар + главен списък по отдели + renderTasksPanel = 3 места. */
      ok('днешната задача се рендира на >1 място', today.length >= 2, 'бр.: ' + today.length);
      ok('днешната задача — нито един чекбокс не е заключен', noneDisabled(today));
      ok('днешната задача — без приглушен стил',
        today.every(c => (c.getAttribute('style') || '').indexOf('cursor:not-allowed') < 0));

      ok('вчерашната задача се рендира на >1 място', yest.length >= 2, 'бр.: ' + yest.length);
      ok('вчерашната задача — ВСИЧКИ са disabled + „Денят е приключил"',
        lockedAs(yest, L_PAST), titles(yest).join(' | '));
      ok('вчерашната задача — приглушен вид', allDimmed(yest));

      /* Същината на промяната: понеделник, гледан в петък от същата седмица. */
      ok('понеделник от същата седмица се рендира', mon.length >= 2, 'бр.: ' + mon.length);
      ok('понеделник от същата седмица — ЗАКЛЮЧЕН (наваксването отпадна)',
        lockedAs(mon, L_PAST), titles(mon).join(' | '));

      ok('утрешната задача — ВСИЧКИ са disabled + „Денят още не е настъпил"',
        lockedAs(tomo, L_FUTURE), titles(tomo).join(' | '));
      ok('утрешната задача — приглушен вид', allDimmed(tomo));

      ok('задача от минала седмица се рендира (в списъка, не в календара)',
        old.length >= 1, 'бр.: ' + old.length);
      ok('задача от минала седмица — заключена + „Денят е приключил"',
        lockedAs(old, L_PAST), titles(old).join(' | '));

      ok('задача без дата (data-cdate="") се рендира', nod.length >= 1, 'бр.: ' + nod.length);
      ok('задача без дата — НЕ е заключена', noneDisabled(nod));
      ok('задача без дата — data-cdate е празен', nod.every(c => c.getAttribute('data-cdate') === ''));

      /* Постоянни задачи — календар + блок „🔁 Постоянни задачи" */
      const rFri = cbsFor(doc, 'data-rtid', 'r-fri');
      const rSat = cbsFor(doc, 'data-rtid', 'r-sat');
      const rMon = cbsFor(doc, 'data-rtid', 'r-mon');
      ok('постоянна за днес се рендира на >1 място', rFri.length >= 2, 'бр.: ' + rFri.length);
      ok('постоянна за днес — отключена', noneDisabled(rFri));
      ok('постоянна за утре — заключена + „Денят още не е настъпил"',
        lockedAs(rSat, L_FUTURE), titles(rSat).join(' | '));
      ok('постоянна за понеделник (същата седмица) — ЗАКЛЮЧЕНА',
        lockedAs(rMon, L_PAST), titles(rMon).join(' | '));

      /* Контролата не се крие — стои видима, само не се натиска. */
      ok('заключените чекбоксове НЕ са скрити',
        yest.concat(mon, tomo, rSat, rMon)
          .every(c => (c.getAttribute('style') || '').indexOf('display:none') < 0));
    }
  }

  /* ═══ 3. Целият календар: отключен е точно един ден ═══════════════════ */
  section('3. В седмичния календар отключен е САМО днешният ден');
  {
    const h = env();
    const { w, doc } = h;
    if (guard('renderBulView() не хвърля', () => w.renderBulView())) {
      const cal = doc.querySelector('#sec-calendar');
      if (ok('календарът се рендира', !!cal)) {
        const cbs = Array.prototype.slice.call(
          cal.querySelectorAll('input[type=checkbox][data-cdate]'));
        ok('в календара има чекбоксове за няколко дни', cbs.length >= 4, 'бр.: ' + cbs.length);
        const free = cbs.filter(c => c.disabled === false);
        ok('отключените са само за днешната дата',
          free.length > 0 && free.every(c => c.getAttribute('data-cdate') === TODAY),
          free.map(c => c.getAttribute('data-cdate')).join(', '));
        ok('всеки заключен носи коректния надпис',
          cbs.filter(c => c.disabled).every(c => {
            const d = c.getAttribute('data-cdate');
            return c.getAttribute('title') === (d > TODAY ? L_FUTURE : L_PAST);
          }),
          titles(cbs.filter(c => c.disabled)).join(' | '));
      }
    }
  }

  /* ═══ 4. Календар на минала седмица — всеки ден е приключил ══════════ */
  section('4. Календар на минала седмица — всеки ден е заключен');
  {
    const h = env({ weekOffset: -1 });
    const { w, doc } = h;
    if (guard('renderBulView() за миналата седмица не хвърля', () => w.renderBulView())) {
      const cal = doc.querySelector('#sec-calendar');
      if (ok('календарът се рендира', !!cal)) {
        const cbs = Array.prototype.slice.call(
          cal.querySelectorAll('input[type=checkbox][data-cdate]'));
        ok('има чекбоксове', cbs.length > 0, 'бр.: ' + cbs.length);
        ok('всички са заключени с „Денят е приключил"',
          lockedAs(cbs, L_PAST), titles(cbs).join(' | '));
      }
    }
  }

  /* ═══ 5. Истински клик по чекбокс за ДНЕС — заявката тръгва ═══════════ */
  section('5. Истински клик: днешният ден работи както преди');
  {
    const h = env();
    const { w, doc, calls } = h;
    w.renderBulView();
    const cb = cbsFor(doc, 'data-tid', 't-today')[0];
    if (ok('чекбоксът за днес е намерен', !!cb)) {
      ok('не е заключен', cb.disabled === false);
      cb.checked = true;
      guard('onchange не хвърля', () => fire(w, cb, 'change'));
      await ticks();
      const posts = calls.post.filter(p => p.table === 'task_completions');
      ok('POST към task_completions тръгва', posts.length === 1, 'бр.: ' + posts.length);
      if (posts.length) {
        ok('completion_date е днешната дата', posts[0].body.completion_date === TODAY,
          String(posts[0].body.completion_date));
      }
    }
  }

  /* ═══ 6. Втора защита в обработчиците ════════════════════════════════ */
  section('6. Втора защита: пряко извикване на обработчика (заобикаля disabled)');
  {
    const h = env();
    const { w, doc, calls } = h;
    w.renderBulView();
    const before = calls.post.length + calls.patch.length + calls.del.length;
    const reqs = () => calls.post.length + calls.patch.length + calls.del.length;

    /* 6.1 вчерашна дата — новият основен случай */
    const cbY = fakeCb(doc, 'data-tid', 't-yest', YESTERDAY, true);
    guard('bulCheckboxChanged(вчера) не хвърля', () => w.bulCheckboxChanged(cbY));
    await ticks();
    ok('вчера — чекбоксът е върнат в изходно състояние', cbY.checked === false);
    ok('вчера — няма заявка', reqs() === before);
    ok('вчера — toast „Денят е приключил"',
      calls.toast.some(t => String(t).indexOf(L_PAST) >= 0), JSON.stringify(calls.toast));

    /* 6.2 понеделник от същата седмица */
    const cbM = fakeCb(doc, 'data-tid', 't-mon', MON, true);
    guard('bulCheckboxChanged(понеделник, същата седмица) не хвърля', () => w.bulCheckboxChanged(cbM));
    await ticks();
    ok('понеделник — чекбоксът е върнат в изходно състояние', cbM.checked === false);
    ok('понеделник — няма заявка', reqs() === before);

    /* 6.3 бъдеща дата */
    const cbF = fakeCb(doc, 'data-tid', 't-tomo', TOMORROW, true);
    guard('bulCheckboxChanged(утре) не хвърля', () => w.bulCheckboxChanged(cbF));
    await ticks();
    ok('утре — чекбоксът е върнат в изходно състояние', cbF.checked === false);
    ok('утре — няма заявка', reqs() === before);
    ok('утре — toast „Денят още не е настъпил"',
      calls.toast.some(t => String(t).indexOf(L_FUTURE) >= 0), JSON.stringify(calls.toast));

    /* 6.4 РАЗотмятане на заключен ден също се отхвърля, а състоянието се
           връща на „отметнато", не на „неотметнато" */
    const cbU = fakeCb(doc, 'data-tid', 't-yest', YESTERDAY, false);
    guard('bulCheckboxChanged(разотмятане, вчера) не хвърля', () => w.bulCheckboxChanged(cbU));
    await ticks();
    ok('разотмятане — състоянието е върнато на отметнато', cbU.checked === true);
    ok('разотмятане — няма заявка (нито DELETE, нито PATCH)', reqs() === before);

    /* 6.5 постоянна задача — същият механизъм, вчерашна/минала дата */
    const cbR = fakeCb(doc, 'data-rtid', 'r-mon', MON, true);
    guard('bulRecurringCheckboxChanged(понеделник) не хвърля', () => w.bulRecurringCheckboxChanged(cbR));
    await ticks();
    ok('постоянна, изминал ден — чекбоксът е върнат', cbR.checked === false);
    ok('постоянна, изминал ден — няма заявка', reqs() === before);

    const cbR2 = fakeCb(doc, 'data-rtid', 'r-sat', TOMORROW, true);
    guard('bulRecurringCheckboxChanged(утре) не хвърля', () => w.bulRecurringCheckboxChanged(cbR2));
    await ticks();
    ok('постоянна, бъдещ ден — чекбоксът е върнат', cbR2.checked === false);
    ok('постоянна, бъдещ ден — няма заявка', reqs() === before);
  }

  /* ═══ 7. null / празна дата продължава да работи ══════════════════════ */
  section('7. completion_date = null НЕ се блокира');
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
      ok('completion_date е null', posts[0].body.completion_date === null,
        String(posts[0].body.completion_date));
    }
    ok('няма toast за заключен ден',
      !calls.toast.some(t => String(t).indexOf(L_FUTURE) >= 0 || String(t).indexOf(L_PAST) >= 0),
      JSON.stringify(calls.toast));
  }

  /* ═══ 8. Баджът „💬/📷" — вторият вход към модала ═════════════════════ */
  section('8. Баджът не е пряк път към модала за заключен ден');
  {
    const h = env();
    const { w, doc, calls } = h;
    /* Баджът е кликаем само за задачи от вид, различен от info. */
    w.bulTasks = [
      task('b-today', [TODAY],     { task_type: 'comment' }),
      task('b-yest',  [YESTERDAY], { task_type: 'comment' }),
      task('b-tomo',  [TOMORROW],  { task_type: 'comment' })
    ];
    w.recurringTasks = [];
    if (guard('renderBulView() с баджове не хвърля', () => w.renderBulView())) {
      const badge = id => Array.prototype.slice.call(doc.querySelectorAll('span[data-task-id="' + id + '"]'));
      ok('баджът за днес е кликаем', badge('b-today').length >= 1, 'бр.: ' + badge('b-today').length);
      ok('баджът за вчера НЕ е кликаем', badge('b-yest').length === 0, 'бр.: ' + badge('b-yest').length);
      ok('баджът за утре НЕ е кликаем', badge('b-tomo').length === 0, 'бр.: ' + badge('b-tomo').length);
    }

    /* Дори при пряко извикване модалът не се отваря. */
    const tCount = calls.toast.length;
    guard('openTaskCompletionModal(вчера) не хвърля',
      () => w.openTaskCompletionModal('b-yest', 'regular', YESTERDAY));
    ok('модалът НЕ е отворен', !doc.getElementById('tc-modal-ov'));
    ok('показан е toast „Денят е приключил"',
      calls.toast.slice(tCount).some(t => String(t).indexOf(L_PAST) >= 0),
      JSON.stringify(calls.toast.slice(tCount)));

    guard('openTaskCompletionModal(днес) не хвърля',
      () => w.openTaskCompletionModal('b-today', 'regular', TODAY));
    ok('за днес модалът СЕ отваря', !!doc.getElementById('tc-modal-ov'));
  }

  /* ═══ 9. Централен офис — пътят с calItemStatusHtml не се чупи ════════ */
  section('9. Глобална роля: чекбокс изобщо не се рендира');
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
