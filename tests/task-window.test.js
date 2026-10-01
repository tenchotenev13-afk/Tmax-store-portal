/* „Прозорец до последния ден" и за ЕДНОКРАТНА задача с няколко дни
   (bulletin_tasks.due_window, 01.10.2026).

   ПОВОД. Еднократната с няколко дни искаше отметка за ВСЕКИ ден поотделно
   („Всеки ден се отмята ОТДЕЛНО", bulletin.js:613). Измерено на С39 „Излагане
   палето зони" (4 дни): 15 от 18 обекта излизат под 4/4 при свършена работа —
   само три с четири отметки.

   ПРАВИЛОТО е същото като при постоянната с due_window: последният ден е СРОКЪТ,
   предходните са „разрешено по-рано", една отметка където и да е в прозореца
   затваря задачата, и тя е ЕДИН елемент в знаменателя. completion_date носи
   РЕАЛНИЯ ден на щракване, а четците сравняват с целия набор — една конвенция за
   двата вида задачи (решение А на Тенчо).

   Решението кое е прозорец и кое отмятане го затваря е ОБЩО: winActive() и
   winClosingComp(). И двата вида минават през тях, за да не се разминат пак.

   Тази част (т.2) заковава ПОМОЩНИЦИТЕ и ФОРМАТА. Поведението (показване,
   броене) е в следващите секции, добавени с т.3 и т.4.

   Пускане: node tests/task-window.test.js . */
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
/* D(0)=понеделник … D(6)=неделя; котвата е сряда = D(2) = „днес" */
const D = n => isoOf(shifted(-2 + n));
const MON = D(0), TUE = D(1), WED = D(2), THU = D(3), FRI = D(4), SUN = D(6);

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const STORE = { email: 't@temax.bg', display_name: 'Троян', role: 'store', store_name: 'Троян' };
const STORES = ['Троян', 'Ловеч'];

function task(id, over) {
  return Object.assign({
    id: id, bulletin_id: 'b-1', week_number: 0, year: 2026, department: 'trade',
    title: 'Задача ' + id, description: null, due_date: WED, due_dates: [WED],
    due_window: false, spans_from: null, starts_on: null, target_stores: null,
    task_type: 'info', report_groups: ['controlling'], linked_module: null,
    auto_complete: false, attachments: null, sort_order: 1,
    created_by: 'Админ', created_at: MON
  }, over || {});
}
function freshDb(over) {
  return Object.assign({ seq: 0, tasks: [], comps: [] }, over || {});
}
function wireDb(h, db) {
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const m = (init.method || 'GET').toUpperCase();
    const onTasks = url.indexOf('/bulletin_tasks') >= 0;
    const onComps = url.indexOf('/task_completions') >= 0;
    if (m === 'GET' || (!onTasks && !onComps)) return orig.call(this, url, init);
    return orig.call(this, url, init).then(function (r) {
      const body = init.body ? JSON.parse(init.body) : null;
      const idm = /[?&]id=eq\.([^&]+)/.exec(url);
      const list = onTasks ? db.tasks : db.comps;
      if (m === 'POST') {
        const row = Object.assign({ id: (onTasks ? 't-n' : 'c-n') + (++db.seq) }, body);
        list.push(row);
        return { ok: true, status: 201, json: () => Promise.resolve([row]), text: () => Promise.resolve('') };
      }
      if (m === 'PATCH') { list.forEach(x => { if (idm && x.id === idm[1]) Object.assign(x, body); }); return r; }
      return r;
    });
  };
}
function bulRow(w, id, k) {
  const d = shifted(7 * k), cal = {};
  w.DKEYS.forEach(x => { cal[x] = []; });
  return { id: id, week_number: w.weekNum(d), year: isoWeekYear(d), status: 'published',
           created_at: isoOf(d), content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
}
function env(db, user, recs) {
  const h = boot({
    modules: ['bulletin.js', 'today.js', 'report.js'],
    user: user || ADMIN,
    data: {
      users: STORES.map(s => ({ store_name: s })),
      stores: STORES.map(s => ({ name: s })),
      recurring_tasks: recs || [], recurring_task_periods: [], recurring_task_skips: [],
      recurring_task_versions: (recs && recs.__versions) || [],
      bulletins: url => { const m = /[?&]id=eq\.([^&]+)/.exec(url); return m ? h.buls.filter(b => b.id === m[1]) : h.buls; },
      bulletin_tasks: url => {
        if (url.indexOf('spans_from=not.is.null') >= 0) return [];
        const m = /[?&]bulletin_id=eq\.([^&]+)/.exec(url);
        return m ? db.tasks.filter(t => t.bulletin_id === m[1]) : db.tasks;
      },
      task_completions: () => db.comps,
      bulletin_promotions: [], task_subtasks: [], subtask_completions: [],
      notification_schedules: [], report_snapshots: [], goods_transit: []
    }
  });
  h.buls = [bulRow(h.w, 'b-1', 0)];
  freezeDate(h.w);
  h.w.bulSelectedId = 'b-1';
  h.w.bulActiveDept = 'trade';
  h.w.reportableStoresCache = STORES.slice();
  h.w.allStoresCache = STORES.slice();
  wireDb(h, db);
  return h;
}
async function settle(cond, max) { for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); } return cond(); }
async function view(db, user, recs) {
  const h = env(db, user, recs);
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return null;
  await settle(() => !!h.doc.getElementById('sec-calendar'));
  return h;
}
/* Дните във формата: отмята по ISO дата и пуска истинско change, което стига до
   контейнера (слушателят е на него, не на всеки чекбокс). */
function pickDays(h, prefix, dates) {
  const wrap = h.doc.getElementById(prefix + '-due-dates');
  Array.prototype.forEach.call(wrap.querySelectorAll('input[type=checkbox]'), cb => {
    cb.checked = dates.indexOf(cb.value) >= 0;
  });
  wrap.dispatchEvent(new h.w.Event('change', { bubbles: true }));
}
const winCb = (h, prefix) => h.doc.getElementById(prefix + '-win');
const winWrap = (h, prefix) => h.doc.getElementById(prefix + '-win-wrap');
const winBox = (h, prefix) => h.doc.getElementById(prefix + '-win-box');
const winNote = (h, prefix) => (h.doc.getElementById(prefix + '-win-note') || {}).textContent || '';
const shown = el => !!el && (el.style.display || '') !== 'none';

(async function () {

  section('1. ОБЩИТЕ помощници: едно решение за двата вида задачи');
  {
    const h = env(freshDb(), ADMIN);
    const w = h.w;
    ok('winActive: без флаг → не', w.winActive(false, [MON, TUE]) === false);
    ok('winActive: 2 дни → да', w.winActive(true, [MON, TUE]) === true);
    ok('winActive: 1 ден → не', w.winActive(true, [MON]) === false);
    ok('winActive: 0 дни → не', w.winActive(true, []) === false);
    ok('winActive: 7 дни → не („всеки ден", не прозорец)',
      w.winActive(true, [0, 1, 2, 3, 4, 5, 6]) === false);
    ok('winActive: 6 дни → да', w.winActive(true, [0, 1, 2, 3, 4, 5]) === true);

    /* winClosingComp: сравнява с НАБОРА, не с един ден. */
    const comps = [
      { task_id: 't-1', store_name: 'Троян', status: 'done', completion_date: TUE },
      { task_id: 't-1', store_name: 'Ловеч', status: 'postponed', completion_date: MON }
    ];
    ok('намира отметка от среден ден на прозореца',
      (w.winClosingComp(comps, 'task_id', 't-1', 'Троян', [MON, TUE, WED]) || {}).completion_date === TUE);
    ok('не брои чужд обект',
      w.winClosingComp(comps, 'task_id', 't-1', 'Ловеч', [MON, TUE, WED]) === null);
    ok('не брои ден ИЗВЪН набора',
      w.winClosingComp(comps, 'task_id', 't-1', 'Троян', [WED, THU]) === null);
    ok('не брои статус, различен от done',
      w.winClosingComp([{ task_id: 't-1', store_name: 'Троян', status: 'postponed', completion_date: TUE }],
        'task_id', 't-1', 'Троян', [MON, TUE]) === null);
    ok('без обект → null', w.winClosingComp(comps, 'task_id', 't-1', null, [MON, TUE]) === null);

    /* Постоянните минават през СЪЩИТЕ примитиви — не през копие. */
    const src = w.recurringIsWindow.toString() + w.recurringWindowComp.toString();
    ok('recurringIsWindow ползва winActive', src.indexOf('winActive') >= 0);
    ok('recurringWindowComp ползва winClosingComp', src.indexOf('winClosingComp') >= 0);
    const src2 = w.taskIsWindow.toString() + w.taskWindowComp.toString();
    ok('taskIsWindow ползва winActive', src2.indexOf('winActive') >= 0);
    ok('taskWindowComp ползва winClosingComp', src2.indexOf('winClosingComp') >= 0);
  }

  section('2. taskIsWindow: кога важи и кога се игнорира');
  {
    const h = env(freshDb(), ADMIN);
    const w = h.w;
    ok('два дни + флаг → прозорец', w.taskIsWindow(task('a', { due_dates: [MON, TUE], due_window: true })) === true);
    ok('без флаг → не', w.taskIsWindow(task('a', { due_dates: [MON, TUE], due_window: false })) === false);
    ok('един ден + флаг → ИГНОРИРА се', w.taskIsWindow(task('a', { due_dates: [WED], due_window: true })) === false);
    ok('notice + флаг → не се прилага',
      w.taskIsWindow(task('a', { due_dates: [MON, TUE], due_window: true, task_type: 'notice' })) === false);
    /* ДВА дни нарочно: с един ден winActive() и без това казва „не" и пазачът за
       многоседмичната би минал незабелязан. Такъв ред не може да дойде от
       формата (bulletin_tasks_spans_single_day_chk иска <=1 ден), но може да
       дойде от ръчна редакция в базата — и тогава трябва да се ИГНОРИРА, не да
       размести колоните на многоседмичната. */
    ok('многоседмична + 2 дни + флаг → не се прилага',
      w.taskIsWindow(task('a', { due_dates: [MON, THU], due_window: true, spans_from: MON })) === false);
    ok('срокът е ПОСЛЕДНИЯТ ден',
      w.taskWindowDeadline(task('a', { due_dates: [WED, MON, TUE], due_window: true })) === WED);
    ok('наборът е сортиран',
      w.taskWindowDates(task('a', { due_dates: [WED, MON, TUE], due_window: true })).join(',') === [MON, TUE, WED].join(','));
    ok('без прозорец наборът е празен',
      w.taskWindowDates(task('a', { due_dates: [MON, TUE] })).length === 0);
  }

  section('3. ФОРМАТА за НОВА задача: 1 ден / 2+ дни / „Срок в следваща седмица"');
  {
    const h = await view(freshDb(), ADMIN);
    if (!h) return report();
    if (!guard('openTaskModal() не хвърля', () => h.w.openTaskModal())) return report();

    /* 2+ дни: контролата е ВИДИМА и ВКЛЮЧЕНА по подразбиране. */
    pickDays(h, 'tk', [MON, TUE, WED]);
    ok('2+ дни: отметката се вижда', shown(winWrap(h, 'tk')), String(winWrap(h, 'tk').style.display));
    ok('и е ВКЛЮЧЕНА по подразбиране', winCb(h, 'tk').checked === true);
    ok('надписът казва ЕДНА отметка със срок',
      winNote(h, 'tk') === 'Сега: 1 отметка — срок сряда, може от пон.', winNote(h, 'tk'));
    ok('readTaskWindow() дава true', h.w.readTaskWindow('tk') === true);

    /* Изключване на ръка → надписът казва трите отметки. */
    winCb(h, 'tk').checked = false;
    fire(h.w, winCb(h, 'tk'), 'change');
    ok('изключена: надписът казва ТРИ отметки',
      winNote(h, 'tk') === 'Сега: 3 отметки — по една за пон, вто, сря.', winNote(h, 'tk'));
    ok('и readTaskWindow() дава false', h.w.readTaskWindow('tk') === false);

    /* 1 ден: отметката се СКРИВА и пада на false, а надписът ОСТАВА. */
    pickDays(h, 'tk', [WED]);
    ok('1 ден: отметката е скрита', !shown(winWrap(h, 'tk')), String(winWrap(h, 'tk').style.display));
    ok('и е размаркирана', winCb(h, 'tk').checked === false);
    ok('но надписът ОСТАВА и казва какво е положението',
      winNote(h, 'tk') === 'Сега: 1 отметка — само сряда. Прозорец няма смисъл при един ден.',
      winNote(h, 'tk'));
    ok('readTaskWindow() дава false', h.w.readTaskWindow('tk') === false);

    /* „Срок в следваща седмица": целият блок изчезва. */
    pickDays(h, 'tk', [MON, TUE]);
    ok('контрол: пак се вижда при 2 дни', shown(winWrap(h, 'tk')));
    const sp = h.doc.getElementById('tk-span-on');
    sp.checked = true;
    fire(h.w, sp, 'change');
    ok('„Срок в следваща седмица": целият блок е скрит', !shown(winBox(h, 'tk')),
      String(winBox(h, 'tk').style.display));
    ok('и readTaskWindow() дава false', h.w.readTaskWindow('tk') === false);
    sp.checked = false;
    fire(h.w, sp, 'change');
    ok('изключено обратно: блокът се връща', shown(winBox(h, 'tk')));

    /* readTaskWindow() чете ЖИВОТО състояние и сама пази инварианта — не разчита
       на това, че синхронизацията е минала. Тук състоянието е нарочно
       несъгласувано (чекбоксът е включен, а дните/spans казват друго): точно
       така би изглеждало, ако някой ден добавим път, който мени дните без да
       вика taskWinSync. Стойността за базата трябва да е false, защото CHECK-ът
       там не прощава. */
    pickDays(h, 'tk', [MON, TUE]);
    winCb(h, 'tk').checked = true;
    const sp2 = h.doc.getElementById('tk-span-on');
    sp2.checked = true;                      /* без change → sync не е минала */
    ok('несъгласувано състояние със spans → false', h.w.readTaskWindow('tk') === false);
    sp2.checked = false;
    const wrap = h.doc.getElementById('tk-due-dates');
    Array.prototype.forEach.call(wrap.querySelectorAll('input[type=checkbox]'), cb => {
      cb.checked = (cb.value === WED);       /* един ден, пак без change */
    });
    ok('несъгласувано състояние с 1 ден → false', h.w.readTaskWindow('tk') === false);
  }

  section('4. ЗАПИС на нова задача: due_window стига до базата');
  {
    const db = freshDb();
    const h = await view(db, ADMIN);
    if (!h) return report();
    h.w.openTaskModal();
    h.doc.getElementById('tk-title').value = 'Излагане палето зони';
    pickDays(h, 'tk', [MON, TUE, WED]);
    const save = btnExact(h.doc, 'Добави задача');
    if (ok('бутонът „Добави задача" съществува', !!save)) {
      realClick(h.w, save, 'Добави задача');
      await settle(() => db.tasks.length > 0);
      const t = db.tasks[0] || {};
      ok('задачата е записана', !!t.title, JSON.stringify(t.title));
      ok('due_window е true', t.due_window === true, String(t.due_window));
      ok('и трите дни са записани', (t.due_dates || []).length === 3, JSON.stringify(t.due_dates));
      /* ВНИМАНИЕ за следващия четец: скаларът due_date при многодневна задача
         носи ПЪРВИЯ ден (bulSpanBody:824, заварено от въвеждането на
         многодневните) — НЕ срока. Затова срокът на прозореца се взема от
         taskWindowDeadline() над due_dates, а не от due_date. Заковано тук, за
         да не изглежда due_date като срок при четене на записа. */
      ok('due_date остава ПЪРВИЯТ ден (легаси скалар)', t.due_date === MON, String(t.due_date));
      ok('срокът идва от набора, не от скалара',
        h.w.taskWindowDeadline(t) === WED, String(h.w.taskWindowDeadline(t)));
    }
  }

  section('5. РЕДАКЦИЯ: стара задача с false НЕ се превключва сама');
  {
    const db = freshDb({ tasks: [task('t-old', { title: 'Стара многодневна', due_dates: [MON, TUE, WED], due_window: false })] });
    const h = await view(db, ADMIN);
    if (!h) return report();
    if (guard('openEditTaskModal() не хвърля', () => h.w.openEditTaskModal('t-old'))) {
      ok('отметката се вижда (три дни са)', shown(winWrap(h, 'etk')), String(winWrap(h, 'etk').style.display));
      ok('но е ИЗКЛЮЧЕНА — както е записана', winCb(h, 'etk').checked === false);
      ok('надписът казва ТРИ отметки',
        winNote(h, 'etk') === 'Сега: 3 отметки — по една за пон, вто, сря.', winNote(h, 'etk'));
      const save = btnExact(h.doc, '💾 Запази');
      if (ok('„Запази" съществува', !!save)) {
        realClick(h.w, save, 'Запази');
        await ticks(); await ticks(); await ticks();
        const t = db.tasks.find(x => x.id === 't-old') || {};
        ok('записът НЕ я превключва', t.due_window === false, String(t.due_window));
      }
    }
  }

  section('6. РЕДАКЦИЯ на задача С прозорец: стойността се показва и се пази');
  {
    const db = freshDb({ tasks: [task('t-win', { title: 'С прозорец', due_dates: [MON, TUE, WED], due_window: true })] });
    const h = await view(db, ADMIN);
    if (!h) return report();
    if (guard('openEditTaskModal() не хвърля', () => h.w.openEditTaskModal('t-win'))) {
      ok('отметката е ВКЛЮЧЕНА', winCb(h, 'etk').checked === true);
      ok('надписът казва ЕДНА отметка',
        winNote(h, 'etk') === 'Сега: 1 отметка — срок сряда, може от пон.', winNote(h, 'etk'));
      /* Сваляне до един ден при редакция → прозорецът пада, за да не удари CHECK-а. */
      pickDays(h, 'etk', [WED]);
      ok('при 1 ден отметката се скрива', !shown(winWrap(h, 'etk')));
      ok('и readTaskWindow() дава false — CHECK-ът в базата няма да гръмне',
        h.w.readTaskWindow('etk') === false);
    }
  }

  section('7. РЕДАКЦИЯ: човек ВКЛЮЧВА прозореца на съществуваща задача');
  {
    const db = freshDb({ tasks: [task('t-on', { title: 'С39 Излагане палето зони', due_dates: [MON, TUE, WED], due_window: false })] });
    const h = await view(db, ADMIN);
    if (!h) return report();
    if (guard('openEditTaskModal() не хвърля', () => h.w.openEditTaskModal('t-on'))) {
      ok('тръгва изключен', winCb(h, 'etk').checked === false);
      winCb(h, 'etk').checked = true;
      fire(h.w, winCb(h, 'etk'), 'change');
      ok('надписът вече казва ЕДНА отметка',
        winNote(h, 'etk') === 'Сега: 1 отметка — срок сряда, може от пон.', winNote(h, 'etk'));
      /* Намерението трябва да ПРЕЖИВЕЕ смяна на дните — иначе щракването се губи
         при всяко следващо пипване по календара. */
      pickDays(h, 'etk', [TUE, WED, THU]);
      ok('остава включен след смяна на дните', winCb(h, 'etk').checked === true);
      const save = btnExact(h.doc, '💾 Запази');
      if (ok('„Запази" съществува', !!save)) {
        realClick(h.w, save, 'Запази');
        await settle(() => (db.tasks.find(x => x.id === 't-on') || {}).due_window === true, 40);
        const t = db.tasks.find(x => x.id === 't-on') || {};
        ok('записът носи due_window = true', t.due_window === true, String(t.due_window));
        ok('и новите три дни', (t.due_dates || []).join(',') === [TUE, WED, THU].join(','),
          JSON.stringify(t.due_dates));
      }
    }
  }

  report();
})();
