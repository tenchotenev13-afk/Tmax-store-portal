/* Постоянна задача с ПРОЗОРЕЦ за изпълнение (due_window).

   Заварено: всяко явяване на постоянна задача е отделно задължение.
   due_weekdays=[0,1,2] значи ТРИ чекбокса в календара, три отмятания и три
   единици в знаменателя. За „подаване на справка до сряда" това е грешно —
   свършена в понеделник е свършена. Влошено от заключването по дата
   (48b59f0): отключен е само днешният ден, тоест обект, който я свърши в
   понеделник, няма как да я запише, а пропусне ли сряда — не може да навакса.

   due_window превключва смисъла на due_weekdays: последният ден е СРОК,
   предходните са „разрешено по-рано", и една отметка където и да е в
   прозореца затваря задачата за цялата седмица.

   ⚠️ Датите. Никакви фиксирани календарни литерали: котвата е понеделникът
   от текущата реална седмица, всичко останало е отместване спрямо нея, а
   часовникът се замразява на конкретен ден от нея. Така случаите „гледано в
   сряда" и „гледано в понеделник" са детерминирани, каквото и да е днес.

   Пускане: node tests/recurring-due-window.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, fire, realClick, btn } = H;

/* ── Котва: понеделникът от текущата реална седмица ──────────────────────── */
const ANCHOR_MON = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
})();
function dateAt(n) {
  const d = new Date(ANCHOR_MON.getTime());
  d.setDate(d.getDate() + n);
  return d;
}
function isoAt(n) {
  const d = dateAt(n), p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

const MON = isoAt(0), TUE = isoAt(1), WED = isoAt(2);
const PREV_MON = isoAt(-7), PREV_WED = isoAt(-5);

const IDX_MON = 0, IDX_TUE = 1, IDX_WED = 2;

/* Замразява w.Date на ANCHOR_MON + n дни, 12:00. */
function freezeAt(w, n) {
  const Real = w.Date;
  const fixedMs = dateAt(n).getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  }
  w.Date = Frozen;
}

const STORE = 'Троян';
const MANAGER = { email: 'm@temax.bg', display_name: 'Управител', role: 'manager', store_name: STORE };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

/* Задача „справка до сряда": Пон+Вто+Сря. */
function winTask(over) {
  return Object.assign({
    id: 'r-win', title: 'Справка линейни метри', description: '',
    department: 'trade', task_type: 'info', active: true, sort_order: 1,
    due_weekdays: [IDX_MON, IDX_TUE, IDX_WED], due_weekday: IDX_MON,
    due_time: '16:00', due_window: true,
    target_stores: null, report_groups: null, linked_module: null
  }, over || {});
}

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js'],
    user: opts.user || MANAGER,
    data: { users: [{ store_name: STORE }], stores: [{ name: STORE }] }
  });
  const w = h.w;
  freezeAt(w, opts.at === undefined ? 2 : opts.at);   /* по подразбиране: сряда */
  const cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });
  w.curBul = {
    id: 'b-1', week_number: w.weekNum(new w.Date()), year: dateAt(3).getFullYear(),
    status: 'published',
    content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } }
  };
  w.bulListCache = [];
  w.bulTasks = [];
  w.bulComps = [];
  w.allStoresCache = [STORE];
  w.recurringTasks = [opts.task || winTask()];
  w.recurringComps = opts.comps || [];
  return h;
}

function cbsFor(doc, id) {
  return Array.prototype.slice.call(
    doc.querySelectorAll('input[type=checkbox][data-rtid="' + id + '"]'));
}
function inCal(doc, id) {
  const cal = doc.querySelector('#sec-calendar');
  return cal ? Array.prototype.slice.call(
    cal.querySelectorAll('input[type=checkbox][data-rtid="' + id + '"]')) : [];
}
function bump(w, el) { el.dispatchEvent(new w.Event('change', { bubbles: true })); }
function byDate(list, iso) { return list.filter(c => c.getAttribute('data-cdate') === iso)[0] || null; }
function doneComp(date) {
  return { recurring_task_id: 'r-win', store_name: STORE, status: 'done', completion_date: date };
}

(async function run() {

  /* ═══ 1. Кога полето изобщо важи ══════════════════════════════════════ */
  section('1. recurringIsWindow() — само при 2..6 избрани дни');
  {
    const { w } = env();
    const mk = (days, flag) => ({ id: 'x', due_weekdays: days, due_window: flag });
    ok('Пон+Вто+Сря с флаг -> прозорец', w.recurringIsWindow(mk([0, 1, 2], true)) === true);
    ok('без флаг -> НЕ', w.recurringIsWindow(mk([0, 1, 2], false)) === false);
    ok('един ден -> НЕ (няма какво да е по-рано)', w.recurringIsWindow(mk([2], true)) === false);
    ok('без дни -> НЕ', w.recurringIsWindow(mk(null, true)) === false);
    ok('всичките 7 („всеки ден", Вечерен оборот) -> НЕ',
      w.recurringIsWindow(mk([0, 1, 2, 3, 4, 5, 6], true)) === false);
    ok('шест дни -> да', w.recurringIsWindow(mk([0, 1, 2, 3, 4, 5], true)) === true);
    ok('срокът е последният ден', w.recurringWindowDeadlineIdx(winTask()) === IDX_WED,
      String(w.recurringWindowDeadlineIdx(winTask())));
    /* Прозоречната задача НЕ е многодневна — има едно състояние. */
    ok('recurringIsMultiDay() е false за прозорец', w.recurringIsMultiDay(winTask()) === false);
    ok('но е true без флага', w.recurringIsMultiDay(winTask({ due_window: false })) === true);
    /* Отчетите я виждат веднъж — в деня на срока. */
    ok('за отчета е дължима в сряда', w.recurringReportDueOnWeekday(winTask(), IDX_WED) === true);
    ok('за отчета НЕ е дължима в понеделник', w.recurringReportDueOnWeekday(winTask(), IDX_MON) === false);
    /* Календарът обаче показва чекбокс на всеки ден от прозореца. */
    ok('календарът я вижда и в понеделник', w.recurringIsDueOnWeekday(winTask(), IDX_MON) === true);
    ok('етикетът е диапазон, не сбор',
      w.recurringDueLabel(winTask()) === 'Пон–Сря до 16:00', w.recurringDueLabel(winTask()));
    ok('без флага етикетът е старият',
      w.recurringDueLabel(winTask({ due_window: false })) === 'Пон+Вто+Сря до 16:00',
      w.recurringDueLabel(winTask({ due_window: false })));
  }

  /* ═══ 2. Календар, без отметка, гледан в сряда ════════════════════════ */
  section('2. Без отметка: заключването по дата важи както обикновено');
  {
    const h = env({ at: 2 });
    const { w, doc } = h;
    if (guard('renderBulView() не хвърля', () => w.renderBulView())) {
      const boxes = inCal(doc, 'r-win');
      ok('чекбокс на всеки ден от прозореца', boxes.length === 3, 'бр.: ' + boxes.length);
      const mon = byDate(boxes, MON), tue = byDate(boxes, TUE), wed = byDate(boxes, WED);
      ok('сряда (днес) е отключена', !!wed && wed.disabled === false);
      ok('понеделник е заключен', !!mon && mon.disabled === true);
      ok('вторник е заключен', !!tue && tue.disabled === true);
      ok('надписът е „Денят е приключил", не нещо за прозореца',
        mon.getAttribute('title') === 'Денят е приключил', mon.getAttribute('title'));
      ok('нито един не е отметнат', boxes.every(c => c.checked === false));
    }
  }

  /* ═══ 3. Календар, с отметка в понеделник, гледан в сряда ════════════ */
  section('3. Отметка в понеделник затваря целия прозорец');
  {
    const h = env({ at: 2, comps: [doneComp(MON)] });
    const { w, doc } = h;
    if (guard('renderBulView() не хвърля', () => w.renderBulView())) {
      const boxes = inCal(doc, 'r-win');
      ok('трите чекбокса са там (нищо не се крие)', boxes.length === 3, 'бр.: ' + boxes.length);
      ok('и трите са ОТМЕТНАТИ', boxes.every(c => c.checked === true),
        boxes.map(c => c.checked).join(','));
      ok('и трите са заключени', boxes.every(c => c.disabled === true));
      ok('title сочи реалната дата на изпълнение',
        boxes.every(c => c.getAttribute('title') === 'Изпълнена на ' + w.fmtDate(MON)),
        boxes.map(c => c.getAttribute('title')).join(' | '));
      ok('заглавието е зачертано и на трите дни',
        (doc.querySelector('#sec-calendar').innerHTML.match(/text-decoration:line-through/g) || []).length >= 3);
      ok('приглушен вид', boxes.every(c => (c.getAttribute('style') || '').indexOf('cursor:not-allowed') >= 0));
    }
  }

  /* ═══ 4. Отмятане в понеделник — една заявка ═════════════════════════ */
  section('4. Отмятане в понеделник: една заявка, с датата на понеделник');
  {
    const h = env({ at: 0 });   /* днес е понеделник */
    const { w, doc, calls } = h;
    w.renderBulView();
    const mon = byDate(inCal(doc, 'r-win'), MON);
    if (ok('чекбоксът за понеделник е намерен и отключен', !!mon && mon.disabled === false)) {
      mon.checked = true;
      guard('onchange не хвърля', () => fire(w, mon, 'change'));
      await ticks();
      const posts = calls.post.filter(p => p.table === 'task_completions');
      ok('точно ЕДНА заявка', posts.length === 1, 'бр.: ' + posts.length);
      if (posts.length) {
        ok('completion_date е понеделник', posts[0].body.completion_date === MON,
          String(posts[0].body.completion_date));
        ok('и е за правилната задача', posts[0].body.recurring_task_id === 'r-win');
      }
    }
  }

  /* ═══ 5. Блокът „Постоянни задачи" ═══════════════════════════════════ */
  section('5. Блокът показва ЕДНО състояние, не „X/N дни"');
  {
    const h = env({ at: 2, comps: [doneComp(MON)] });
    const { w, doc } = h;
    w.renderBulView();
    const panel = doc.querySelector('#dept-panel-trade');
    if (ok('панелът на отдела се рендира', !!panel)) {
      ok('НЯМА брояч „дни отметнати"', panel.textContent.indexOf('дни отметнати') < 0);
      ok('НЯМА подсказка „отмятай в Седмичен календар"',
        panel.textContent.indexOf('отмятай в 📅 Седмичен календар') < 0);
      ok('показва срока като диапазон', panel.textContent.indexOf('Пон–Сря до 16:00') >= 0,
        panel.textContent.slice(0, 200));
      const inPanel = Array.prototype.slice.call(
        panel.querySelectorAll('input[type=checkbox][data-rtid="r-win"]'));
      ok('има чекбокс (единично-дневният път), не иконка 📅', inPanel.length >= 1,
        'бр.: ' + inPanel.length);
      ok('отметнат и заключен', inPanel.every(c => c.checked === true && c.disabled === true));
    }
  }

  section('5б. Без отметка, гледан в сряда: чекбоксът в блока е отключен');
  {
    const h = env({ at: 2 });
    const { w, doc } = h;
    w.renderBulView();
    const panel = doc.querySelector('#dept-panel-trade');
    const inPanel = Array.prototype.slice.call(
      panel.querySelectorAll('input[type=checkbox][data-rtid="r-win"]'));
    if (ok('чекбоксът е там', inPanel.length >= 1)) {
      ok('носи днешната дата (сряда)', inPanel.every(c => c.getAttribute('data-cdate') === WED),
        inPanel.map(c => c.getAttribute('data-cdate')).join(','));
      ok('и е отключен', inPanel.every(c => c.disabled === false));
    }
  }

  section('5в. Гледан СЛЕД срока: заключен, с датата на срока');
  {
    const h = env({ at: 4 });   /* петък, прозорецът Пон–Сря е минал */
    const { w, doc } = h;
    w.renderBulView();
    const panel = doc.querySelector('#dept-panel-trade');
    const inPanel = Array.prototype.slice.call(
      panel.querySelectorAll('input[type=checkbox][data-rtid="r-win"]'));
    if (ok('чекбоксът е там', inPanel.length >= 1)) {
      ok('носи датата на срока (сряда)', inPanel.every(c => c.getAttribute('data-cdate') === WED));
      ok('заключен с „Денят е приключил"',
        inPanel.every(c => c.disabled === true && c.getAttribute('title') === 'Денят е приключил'),
        inPanel.map(c => c.getAttribute('title')).join(' | '));
    }
  }

  /* ═══ 6. Централен офис — един брой, не три ══════════════════════════ */
  section('6. Броячът за офиса е ЕДИН за целия прозорец');
  {
    const h = env({ at: 2, user: ADMIN, comps: [doneComp(MON)] });
    const { w, doc } = h;
    await w.loadReportableStores();
    if (guard('renderBulView() за офиса не хвърля', () => w.renderBulView())) {
      const cal = doc.querySelector('#sec-calendar');
      ok('чекбокс не се рендира за офиса',
        cal.querySelectorAll('input[type=checkbox][data-rtid]').length === 0);
      const counts = (cal.textContent.match(/\d+\/\d+/g) || []);
      ok('и трите дни показват 1/1, не 0/1 на два от тях',
        counts.length === 3 && counts.every(c => c === '1/1'), counts.join(' '));
    }
  }

  /* ═══ 7. Обратна съвместимост: същата задача без флага ═══════════════ */
  section('7. due_window=false -> точно старото поведение');
  {
    const h = env({ at: 2, task: winTask({ due_window: false }), comps: [doneComp(MON)] });
    const { w, doc } = h;
    w.renderBulView();
    const boxes = inCal(doc, 'r-win');
    ok('пак три чекбокса', boxes.length === 3, 'бр.: ' + boxes.length);
    ok('отметнат е САМО понеделник',
      byDate(boxes, MON).checked === true &&
      byDate(boxes, TUE).checked === false &&
      byDate(boxes, WED).checked === false,
      boxes.map(c => c.getAttribute('data-cdate') + '=' + c.checked).join(' '));
    ok('сряда е отключена (днес)', byDate(boxes, WED).disabled === false);
    const panel = doc.querySelector('#dept-panel-trade');
    ok('блокът пак показва „дни отметнати"', panel.textContent.indexOf('дни отметнати') >= 0);
  }

  section('7б. „Всеки ден" ([0..6]) с включен флаг -> флагът се игнорира');
  {
    const everyDay = winTask({ due_weekdays: [0, 1, 2, 3, 4, 5, 6], due_window: true });
    const h = env({ at: 2, task: everyDay, comps: [doneComp(MON)] });
    const { w, doc } = h;
    ok('не се смята за прозорец', w.recurringIsWindow(everyDay) === false);
    w.renderBulView();
    const boxes = inCal(doc, 'r-win');
    ok('седем чекбокса, по един на ден', boxes.length === 7, 'бр.: ' + boxes.length);
    ok('отметнат е само понеделник',
      boxes.filter(c => c.checked).length === 1, String(boxes.filter(c => c.checked).length));
  }

  /* ═══ 8. Формите ═════════════════════════════════════════════════════ */
  section('8. Превключвателят в двете форми');
  {
    const h = env({ at: 2 });
    const { w, doc } = h;
    /* СЪЗДАВАНЕ — стартира без избрани дни. */
    if (guard('модалът за създаване се отваря', () => w.openRecurringModal('trade'))) {
      await ticks();
      const cb = doc.getElementById('rec-window');
      if (ok('има <input type=checkbox id="rec-window">',
        !!cb && cb.tagName === 'INPUT' && cb.type === 'checkbox', cb ? cb.tagName : 'липсва')) {
        ok('недостъпен без избрани дни', cb.disabled === true);
        ok('но НЕ е скрит (правило 11)',
          (doc.getElementById('rec-window-wrap').getAttribute('style') || '').indexOf('display:none') < 0);
        /* Избираме два дни -> става достъпен. */
        const days = doc.getElementById('rec-weekdays');
        const dayBoxes = Array.prototype.slice.call(days.querySelectorAll('input[type=checkbox]'));
        dayBoxes[0].checked = true; dayBoxes[2].checked = true;
        guard('change по дните не хвърля', () => bump(w, dayBoxes[0]));
        ok('при два избрани дни става достъпен', cb.disabled === false);
        /* Всичките седем -> пак недостъпен и размаркиран. */
        cb.checked = true;
        dayBoxes.forEach(b => { b.checked = true; });
        bump(w, dayBoxes[0]);
        ok('при седем дни отново е недостъпен', cb.disabled === true);
        ok('и се размаркира, за да не отиде невалидна стойност', cb.checked === false);
      }
    }
  }

  section('8б. Създаване: due_window влиза в POST');
  {
    const h = env({ at: 2 });
    const { w, doc, calls } = h;
    w.openRecurringModal('trade');
    await ticks();
    doc.getElementById('rec-title').value = 'Нова с прозорец';
    const days = doc.getElementById('rec-weekdays');
    const dayBoxes = Array.prototype.slice.call(days.querySelectorAll('input[type=checkbox]'));
    dayBoxes[0].checked = true; dayBoxes[1].checked = true; dayBoxes[2].checked = true;
    bump(w, dayBoxes[0]);
    doc.getElementById('rec-window').checked = true;
    guard('клик по „Добави"', () => realClick(w, btn(doc.getElementById('rec-modal-ov'), 'Добави')));
    await ticks();
    const post = calls.post.filter(p => p.table === 'recurring_tasks')[0];
    if (ok('POST е изпратен', !!post, JSON.stringify(calls.post.map(p => p.table)))) {
      ok('due_window е true', post.body.due_window === true, String(post.body.due_window));
      ok('due_weekdays са трите дни',
        JSON.stringify(post.body.due_weekdays) === JSON.stringify([0, 1, 2]),
        JSON.stringify(post.body.due_weekdays));
    }
  }

  section('8в. Редакция: показва текущата стойност и я праща в PATCH');
  {
    const h = env({ at: 2 });
    const { w, doc, calls } = h;
    if (guard('модалът за редакция се отваря', () => w.openEditRecurringModal('r-win'))) {
      await ticks();
      const cb = doc.getElementById('erec-window');
      if (ok('превключвателят е там', !!cb)) {
        ok('отметнат, защото задачата е с прозорец', cb.checked === true);
        ok('и е достъпен (три избрани дни)', cb.disabled === false);
        guard('клик по „Запази"', () => realClick(w, btn(doc.getElementById('edit-rec-ov'), 'Запази')));
        await ticks();
        const patch = calls.patch.filter(p => String(p.url).indexOf('recurring_tasks') >= 0)[0];
        if (ok('PATCH е изпратен', !!patch)) {
          ok('due_window се праща като true', patch.body.due_window === true,
            String(patch.body.due_window));
        }
      }
    }
  }

  section('8г. Редакция: изключването се записва като false');
  {
    const h = env({ at: 2 });
    const { w, doc, calls } = h;
    w.openEditRecurringModal('r-win');
    await ticks();
    doc.getElementById('erec-window').checked = false;
    realClick(w, btn(doc.getElementById('edit-rec-ov'), 'Запази'));
    await ticks();
    const patch = calls.patch.filter(p => String(p.url).indexOf('recurring_tasks') >= 0)[0];
    ok('due_window е false, не изчезва от обекта',
      !!patch && patch.body.due_window === false, JSON.stringify(patch && patch.body.due_window));
  }

  report();
})();
