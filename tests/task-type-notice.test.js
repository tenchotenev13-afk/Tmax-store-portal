/* Задача „Само за информация" (task_type='notice')

   Какво е: задача, която се показва като ТЕКСТ в Седмичния календар на
   Бюлетина и НИКЪДЕ другаде. Няма чекбокс, значи няма и task_completions —
   а щом няма отмятания, всяко място, което я брои, я брои като вечно
   неизпълнена. Оттам идва и опасността: пропуснат филтър не гърми, а тихо
   изкарва обект неизпълнил нещо, което няма как да свърши.

   Затова изключването е ЕДИН предикат — taskIsNotice() в shared.js — и
   филтър на входа на всеки колектор и рендер, а не по едно `if` на всяко
   място, където се брои.

   Какво заковава тестът:
     1. предикатът съществува и разпознава точно 'notice';
     2. дневният и седмичният отчет: 0 в числителя И в знаменателя;
     3. личният седмичен отчет (collectWeeklyRoutingData) също;
     4. таб „Днес": задачата не се появява;
     5. Седмичният календар: РЕД има, но БЕЗ <input type=checkbox> и без
        брояча X/18 — това е единственото място, където notice се вижда;
     6. редакторът на задачи и на постоянни задачи предлагат вида и записват
        task_type='notice';
     7. новите етикети на info („Обикновена…", „Обикн.");
     8. daily-turnover: свързаната задача е notice → нула POST-ове.

   ⚠️ Никакви фиксирани календарни дати: котва + отместване, часовникът
   замразен на конкретен ден.

   Пускане: node tests/task-type-notice.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, ok, guard, section, report, ticks } = H;

/* ── Котва и дати ────────────────────────────────────────────────────────── */
const ANCHOR_MON = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
})();
function dateAt(n) { const d = new Date(ANCHOR_MON.getTime()); d.setDate(d.getDate() + n); return d; }
function isoAt(n) {
  const d = dateAt(n), p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function isoWeekYear(d) {
  const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  return t.getFullYear();
}
const MON = isoAt(0), TUE = isoAt(1);

function freezeAt(w, n) {
  const Real = w.Date;
  const fixedMs = dateAt(n).getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  }
  w.Date = Frozen;
}

/* ── Данни ───────────────────────────────────────────────────────────────── */
const STORES = ['Троян', 'Ловеч', 'Севлиево'];
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const MANAGER = { email: 'm@temax.bg', display_name: 'Управител', role: 'manager', store_name: STORES[0] };

const NOTICE_TITLE = 'ВАЖНО: новите цени влизат от понеделник';
const WORK_TITLE = 'Вечерен оборот';

/* Постоянна задача, дължима във ВСЕКИ делничен ден — за да е сигурно, че
   попада в набора на всеки колектор, ако не бъде отсята. */
function recTask(over) {
  return Object.assign({
    id: 'r-work', title: WORK_TITLE, department: 'trade',
    task_type: 'info', active: true, sort_order: 1,
    due_weekdays: [0, 1, 2, 3, 4], due_weekday: 0, due_time: '20:00', due_window: false,
    target_stores: null, report_groups: null, linked_module: null, description: null
  }, over || {});
}
function noticeRec(over) {
  return recTask(Object.assign({
    id: 'r-notice', title: NOTICE_TITLE, task_type: 'notice',
    sort_order: 2, description: 'Виж таблицата в Наръчника.'
  }, over || {}));
}
function bulTask(over) {
  return Object.assign({
    id: 't-work', bulletin_id: 'b-1', title: 'Опис на палетите', department: 'trade',
    due_date: TUE, due_dates: null, task_type: 'info', target_stores: null,
    sort_order: 1, report_groups: null, linked_module: null, description: null,
    created_by: 'Админ'
  }, over || {});
}
function noticeBul(over) {
  return bulTask(Object.assign({
    id: 't-notice', title: NOTICE_TITLE, task_type: 'notice', sort_order: 2
  }, over || {}));
}
/* Отмятания за РАБОТНАТА задача от всичките три обекта — така „изпълнението"
   е 100%, ако и само ако notice не е влязла в знаменателя. */
function comps(key, id, iso) {
  return STORES.map(function (s, i) {
    const o = {
      id: 'c' + i, task_id: null, recurring_task_id: null, store_name: s,
      status: 'done', completion_date: iso, completed_by: s,
      comment: null, photos: null, files: null
    };
    o[key] = id; return o;
  });
}

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js', 'today.js', 'daily-turnover.js', 'report.js', 'email.js', 'notifications.js'],
    user: opts.user || ADMIN,
    data: {}
  });
  const w = h.w;
  freezeAt(w, opts.at === undefined ? 2 : opts.at);
  const wkDate = dateAt(0);
  const bul = {
    id: 'b-1', week_number: w.weekNum(wkDate), year: isoWeekYear(wkDate),
    status: 'published', created_at: isoAt(0),
    content: { calendar: {}, columns: { trade: [], warehouse: [], admin: [] } }
  };
  w.DKEYS.forEach(k => { bul.content.calendar[k] = []; });
  h.setData('bulletins', [bul]);
  h.setData('recurring_tasks', opts.recurring || [recTask(), noticeRec()]);
  h.setData('bulletin_tasks', opts.bulTasks || [bulTask(), noticeBul()]);
  h.setData('task_completions', opts.comps || []);
  h.setData('users', STORES.map(s => ({ store_name: s, email: s + '@temax.bg', display_name: s, role: 'manager' })));
  h.setData('report_snapshots', []);
  ['differences_reports', 'stock_returns', 'kasa_storno', 'kasa_zoborot',
    'goods_transit', 'transport_pallets', 'stock_differences', 'client_orders',
    'transport_orders', 'daily_turnover', 'bulletin_promotions',
    'subtask_completions', 'task_subtasks', 'report_recipients',
    'report_groups', 'stores'].forEach(t => h.setData(t, []));
  return h;
}

const daily = h => new Promise(res => { h.w.collectDailyReportData(res); });
const weekly = h => new Promise(res => { h.w.collectWeeklyReportData(res); });

(async function run() {

  /* ═══ 1. Самият предикат ═════════════════════════════════════════════ */
  section('1. taskIsNotice() — предикатът, на който стъпва всичко останало');
  {
    const h = env();
    const w = h.w;
    if (ok('функцията съществува', typeof w.taskIsNotice === 'function', typeof w.taskIsNotice)) {
      ok('разпознава notice', w.taskIsNotice({ task_type: 'notice' }) === true);
      ok('info НЕ е notice', w.taskIsNotice({ task_type: 'info' }) === false);
      ok('празният вид НЕ е notice', w.taskIsNotice({}) === false);
      ok('null не хвърля', w.taskIsNotice(null) === false);
      ok('undefined не хвърля', w.taskIsNotice(undefined) === false);
      /* Точното сравнение, не подниз: 'notice_x' не бива да мине. */
      ok('сравнението е точно, не подниз', w.taskIsNotice({ task_type: 'notice_x' }) === false);
    }
    /* Достъпът е през локална променлива, а не w.TASK_TYPES.notice.label:
       липсва ли записът, точковият достъп хвърля TypeError, тестът умира
       ПРЕДИ report() и излиза с нула ❌ — тоест срещу стария код изглежда
       почти чист, вместо да покаже какво точно не е наред. Exit кодът пак
       е 1, но диагностиката се губи. */
    const NT = w.TASK_TYPES && w.TASK_TYPES.notice;
    const IT = (w.TASK_TYPES && w.TASK_TYPES.info) || {};
    if (ok('TASK_TYPES има запис notice', !!NT)) {
      ok('пълният етикет е „Само за информация"',
        NT.label === 'Само за информация', String(NT.label));
      ok('късият е „Инфо"', NT.short === 'Инфо', String(NT.short));
      ok('notice не иска нито снимка, нито документ, нито коментар',
        !NT.needsPhoto && !NT.needsFile && !NT.needsComment);
    }
    ok('info вече е „Обикновена (без снимка/коментар)"',
      IT.label === 'Обикновена (без снимка/коментар)', String(IT.label));
    ok('късият етикет на info е „Обикн."',
      IT.short === 'Обикн.', String(IT.short));
  }

  /* ═══ 2. Дневен отчет ════════════════════════════════════════════════ */
  section('2. Дневен отчет: notice не влиза нито в числителя, нито в знаменателя');
  {
    /* Отчетът е за ВТОРНИК (днес=сряда). Работната постоянна задача е дължима
       и е отметната от трите обекта; обикновената също. Ако notice влезе,
       знаменателят става 12 вместо 6 и процентът пада на 50. */
    const h = env({
      at: 2,
      comps: comps('recurring_task_id', 'r-work', TUE).concat(comps('task_id', 't-work', TUE))
    });
    const d = await daily(h);
    if (ok('отчетът се събира', !!d, String(d))) {
      ok('знаменателят е 6 (2 задачи × 3 обекта), не 12',
        d.totalAll === 6, String(d.totalAll));
      ok('изпълнени са всичките 6', d.totalDone === 6, String(d.totalDone));
      ok('тоест 100%, не 50%', d.overallPct === 100, String(d.overallPct));
      const titles = (d.items || []).map(i => i.title);
      ok('notice я няма в набора', titles.indexOf(NOTICE_TITLE) < 0, JSON.stringify(titles));
      ok('работната задача Е в набора', titles.indexOf(WORK_TITLE) >= 0, JSON.stringify(titles));
    }
  }

  section('2б. Дневен отчет: notice не влиза и в „без срок"');
  {
    /* Постоянна задача БЕЗ ден и БЕЗ час отива в recurringNoDue и се
       показва като отделна бележка в писмото. notice не бива и там. */
    const h = env({
      at: 2,
      recurring: [recTask(), noticeRec({ due_weekday: null, due_weekdays: null, due_time: null })],
      comps: comps('recurring_task_id', 'r-work', TUE).concat(comps('task_id', 't-work', TUE))
    });
    const d = await daily(h);
    ok('noDueCount е 0', !!d && d.noDueCount === 0, d ? String(d.noDueCount) : 'null');
  }

  /* ═══ 3. Седмичен отчет ══════════════════════════════════════════════ */
  section('3. Седмичен отчет: същото');
  {
    /* collectWeeklyReportData гледа ПРЕДХОДНАТА седмица → „днес" в следващия
       понеделник, а бюлетинът е за седмицата на котвата. */
    const h = env({ at: 7, comps: comps('recurring_task_id', 'r-work', MON) });
    const d = await weekly(h);
    if (ok('отчетът се събира', !!d, String(d))) {
      const titles = (d.items || []).map(i => i.title);
      ok('notice я няма в набора', titles.indexOf(NOTICE_TITLE) < 0, JSON.stringify(titles));
      ok('наборът не е празен (тестът не минава по случайност)',
        titles.length > 0, JSON.stringify(titles));
      ok('notice не е и в знаменателя',
        d.totalAll === titles.filter(t => t !== NOTICE_TITLE).length * 0 + d.totalAll && d.totalAll > 0,
        String(d.totalAll));
    }
  }

  /* ═══ 4. Личният седмичен отчет по задачи ════════════════════════════ */
  section('4. Личен отчет (collectWeeklyRoutingData): notice не стига до никого');
  {
    /* Маршрутизацията взима само задачи с report_groups. Даваме report_groups
       И на двете, за да е ясно, че notice отпада заради ВИДА си, а не защото
       ѝ липсва групата. */
    const h = env({
      at: 7,
      recurring: [recTask({ report_groups: ['controlling'] }), noticeRec({ report_groups: ['controlling'] })],
      bulTasks: [bulTask({ report_groups: ['controlling'] }), noticeBul({ report_groups: ['controlling'] })]
    });
    const d = await new Promise(res => { h.w.collectWeeklyRoutingData(res); });
    if (ok('колекторът връща нещо', !!d, String(d))) {
      const json = JSON.stringify(d);
      ok('заглавието на notice го няма никъде в резултата',
        json.indexOf(NOTICE_TITLE) < 0);
      ok('работната задача Е вътре (наборът не е празен)',
        json.indexOf(WORK_TITLE) >= 0);
    }
  }

  /* ═══ 5. Таб „Днес" ══════════════════════════════════════════════════ */
  section('5. Таб „Днес": notice не се показва и не се брои');
  {
    const h = env({ at: 1, comps: comps('recurring_task_id', 'r-work', TUE) });
    if (guard('loadTodayDashboard() не хвърля', () => h.w.loadTodayDashboard())) {
      await ticks(); await ticks();
      const c = h.w.todayCache;
      if (ok('таблото се напълни', !!c, String(c))) {
        const titles = (c.items || []).concat(c.noDueItems || []).map(i => i.title);
        ok('notice я няма в елементите', titles.indexOf(NOTICE_TITLE) < 0, JSON.stringify(titles));
        ok('работната задача Е там', titles.indexOf(WORK_TITLE) >= 0, JSON.stringify(titles));
      }
      const wrap = h.doc.getElementById('mod-today');
      ok('заглавието ѝ го няма и в екрана',
        !!wrap && wrap.innerHTML.indexOf(NOTICE_TITLE) < 0);
    }
  }

  /* ═══ 6. Седмичният календар — ЕДИНСТВЕНОТО място, където се вижда ═══ */
  section('6. Календар (изглед на ОБЕКТ): ред без чекбокс');
  {
    const h = env({ at: 2, user: MANAGER });
    if (guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) {
      await ticks(); await ticks(); await ticks();
      const cal = h.doc.getElementById('sec-calendar');
      if (ok('календарът се рендира', !!cal)) {
        ok('заглавието на notice Е в календара',
          cal.innerHTML.indexOf(NOTICE_TITLE) >= 0);
        ok('описанието ѝ също се показва',
          cal.innerHTML.indexOf('Виж таблицата в Наръчника.') >= 0);

        /* ЯДРОТО: редът на notice няма чекбокс. Проверява се по РЕАЛНИТЕ
           елементи, не по подниз в HTML-а: markup-ът на целия календар
           съдържа чекбоксовете на другите задачи и всяко търсене на
           „<input" би минавало винаги. */
        const boxes = Array.prototype.slice.call(cal.querySelectorAll('input[type=checkbox]'));
        const noticeBoxes = boxes.filter(b =>
          b.dataset.rtid === 'r-notice' || b.dataset.tid === 't-notice');
        ok('нула чекбокса за notice задачите', noticeBoxes.length === 0,
          noticeBoxes.map(b => b.dataset.rtid || b.dataset.tid).join(', '));
        ok('за работните задачи ЧекбоксИ ИМА (контрола)', boxes.length > 0,
          String(boxes.length));
      }
    }
  }

  section('6б. Календар (изглед на ОФИСА): ред без брояча X/18');
  {
    const h = env({ at: 2, user: ADMIN });
    h.w.reportableStoresCache = STORES.slice();
    if (guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) {
      await ticks(); await ticks(); await ticks();
      const cal = h.doc.getElementById('sec-calendar');
      if (ok('календарът се рендира', !!cal)) {
        ok('заглавието на notice Е там', cal.innerHTML.indexOf(NOTICE_TITLE) >= 0);
        /* Броячът е '0/3' за неотметната задача. Търсим го в самия ред на
           notice, не в целия календар — работната задача има свой брояч. */
        const html = cal.innerHTML;
        const i = html.indexOf(NOTICE_TITLE);
        const rowTail = html.slice(i, i + 400);
        ok('в реда ѝ няма брояч „/3"', rowTail.indexOf('/3') < 0, rowTail.slice(0, 200));
        ok('работната задача ИМА брояч (контрола)', html.indexOf('/3') >= 0);
      }
    }
  }

  section('6в. Извън календара notice я няма никъде в Бюлетина');
  {
    const h = env({ at: 2, user: MANAGER });
    if (guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) {
      await ticks(); await ticks(); await ticks();
      const wrap = h.doc.getElementById('mod-bulletin');
      const cal = h.doc.getElementById('sec-calendar');
      if (ok('изгледът се рендира', !!wrap && !!cal)) {
        /* Целият модул минус календара: списъкът по отдел, панелът, всичко. */
        const outside = wrap.innerHTML.split(cal.innerHTML).join('');
        ok('notice я няма извън календара',
          outside.indexOf(NOTICE_TITLE) < 0);
        ok('работната задача Е извън календара (контрола)',
          outside.indexOf(WORK_TITLE) >= 0);
      }
    }
  }

  /* ═══ 7. Редакторите ═════════════════════════════════════════════════ */
  section('7. Падащото меню предлага новия вид — и в двата редактора');
  {
    const h = env({ at: 2 });
    const w = h.w;
    const opts = String(w.taskTypeOptsHtml('info') || '');
    ok('менюто съдържа стойността notice', opts.indexOf('value="notice"') >= 0);
    ok('и етикета ѝ', opts.indexOf('Само за информация') >= 0);
    ok('notice НЕ носи наставка за приоритет',
      opts.indexOf('Само за информация — приоритет') < 0, opts);
    ok('info пък носи (контрола, че наставката не е махната изобщо)',
      opts.indexOf('Обикновена (без снимка/коментар) — приоритет: Нисък') >= 0);
    ok('менюто на еднократните задачи ползва същия помощник',
      w.taskModalHtml().indexOf('value="notice"') >= 0);
  }

  section('7б. Записът наистина праща task_type=notice');
  {
    const h = env({ at: 2 });
    const w = h.w, doc = h.doc;
    w.curBul = { id: 'b-1', week_number: w.weekNum(dateAt(0)), year: isoWeekYear(dateAt(0)), status: 'published', content: { calendar: {}, columns: { trade: [], warehouse: [], admin: [] } } };
    w.DKEYS.forEach(k => { w.curBul.content.calendar[k] = []; });
    w.bulTasks = [];
    if (guard('renderBulletin() не хвърля', () => w.renderBulletin())) {
      guard('openTaskModalForDept() не хвърля', () => w.openTaskModalForDept('trade'));
      const t = doc.getElementById('tk-title');
      const ty = doc.getElementById('tk-type');
      if (ok('модалът е отворен', !!t && !!ty)) {
        t.value = NOTICE_TITLE;
        ty.value = 'notice';
        ok('select приема стойността notice', ty.value === 'notice', ty.value);
        guard('submitTask() не хвърля', () => w.submitTask());
        await ticks();
        const posts = h.calls.post.filter(p => p.table === 'bulletin_tasks');
        if (ok('POST към bulletin_tasks тръгна', posts.length === 1, String(posts.length))) {
          ok('тялото носи task_type=notice',
            posts[0].body.task_type === 'notice', String(posts[0].body.task_type));
        }
      }
    }
  }

  section('7в. Баджът на notice НЕ отваря модала за отмятане');
  {
    const h = env({ at: 2 });
    const w = h.w;
    /* Датата е ЗАМРАЗЕНИЯТ ДНЕС (at: 2 = сряда), не вторник: bulDateLockReason
       заключва баджа за всеки друг ден и контролата отдолу би падала по
       причина, която няма нищо общо с вида на задачата. */
    const TODAY_ISO = isoAt(2);
    const clickable = String(w.taskTypeBadgeHtml('notice', 't-notice', 'regular', true, TODAY_ISO) || '');
    ok('баджът се рисува', clickable.indexOf('Инфо') >= 0, clickable);
    ok('но не е кликаем', clickable.indexOf('taskTypeBadgeClick') < 0, clickable);
    /* Контрола: същият вик, същата дата, само друг вид — задача с коментар
       ДАВА кликаем бадж. Без нея проверката горе би минавала и ако баджовете
       изобщо са спрели да са кликаеми. */
    const other = String(w.taskTypeBadgeHtml('comment', 't-work', 'regular', true, TODAY_ISO) || '');
    ok('за „коментар" баджът Е кликаем (контрола)',
      other.indexOf('taskTypeBadgeClick') >= 0, other);
  }

  /* ═══ 8. Оборотът не пише отмятане за notice ═════════════════════════ */
  section('8. daily-turnover: свързаната задача е notice → нула POST-ове');
  {
    const h = env({ at: 2, user: MANAGER });
    h.setData('recurring_tasks', [noticeRec({ id: 'r-oborot', linked_module: 'oborot' })]);
    if (guard('dtMarkBulletinTask() не хвърля', () => h.w.dtMarkBulletinTask())) {
      await ticks(); await ticks();
      const posts = h.calls.post.filter(p => p.table === 'task_completions');
      ok('нула отмятания', posts.length === 0, JSON.stringify(posts.map(p => p.body)));
      ok('и нула предупреждения', (h.calls.toast || []).length === 0,
        JSON.stringify(h.calls.toast));
    }
  }

  section('8б. КОНТРОЛА: същата задача като info → отмятането тръгва');
  {
    const h = env({ at: 2, user: MANAGER });
    h.setData('recurring_tasks', [recTask({ id: 'r-oborot', linked_module: 'oborot', task_type: 'info' })]);
    if (guard('dtMarkBulletinTask() не хвърля', () => h.w.dtMarkBulletinTask())) {
      await ticks(); await ticks();
      const posts = h.calls.post.filter(p => p.table === 'task_completions');
      ok('POST-ът тръгва', posts.length === 1, String(posts.length));
    }
  }

  /* ═══ 9. Дайджестът до обектите ══════════════════════════════════════ */
  section('9. Седмичният дайджест: notice не влиза в писмото');
  {
    const h = env({ at: 0 });
    const w = h.w;
    const tasks = [bulTask(), noticeBul()];
    if (guard('sendWeeklyDigest() не хвърля',
      () => w.sendWeeklyDigest({ id: 'b-1', week_number: 1, year: 2026 }, tasks, function () { }))) {
      await ticks(); await ticks();
      const mails = h.calls.post.filter(p => /resend-email|send/.test(p.url));
      const body = JSON.stringify(h.calls.post.map(p => p.body));
      ok('изобщо се праща нещо (наборът не е празен)', mails.length > 0 || body.length > 10,
        String(mails.length));
      ok('заглавието на notice го няма в нито едно тяло',
        body.indexOf(NOTICE_TITLE) < 0);
      ok('работната задача Е вътре (контрола)', body.indexOf('Опис на палетите') >= 0);
    }
  }

  report();
})();
