/* Вечерен оборот ↔ Бюлетин: бутон в календара и автоматично отмятане.

   ⚠️ Интеграционен по същество (правило 8). Веригата минава през ЧЕТИРИ файла:
     bulletin.js      рендира бутона и чекбокса, държи заключването
     shared.js        showModule('oborot') пренасочва към Каса
     kasa.js          loadKasa() отваря подтаба по kasaView
     daily-turnover.js записва оборота и отмята задачата
   Всеки от тях вика функции на другите. Тест на един поотделно доказва само,
   че файлът се зарежда.

   ⚠️ Дати: само относителни (dayOffset / изчислен индекс на деня). Нито един
   календарен литерал — виж какво стана с paid-transport.test.js на 23.08.

   Пускане: node tests/oborot-bulletin-link.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, dayOffset, ticks } = H;

const STORE = 'Троян';
const USER = { email: 'm@temax.bg', display_name: 'Мария Иванова', role: 'manager', store_name: STORE };
const CLERK = { email: 'p@temax.bg', display_name: 'Продавач', role: 'employee', store_name: STORE };

const TODAY = dayOffset(0);
/* 0=Пон..6=Нед — същата конвенция като due_weekdays в bulletin.js. */
const IDX_TODAY = (new Date().getDay() + 6) % 7;

const AUTO_LABEL = 'Отмята се автоматично при запис на оборота';

/* ── Фикстури ───────────────────────────────────────────────────────────── */
function task(id, over) {
  return Object.assign({
    id: id, title: 'Задача ' + id, department: 'trade', task_type: 'info',
    target_stores: [STORE], due_dates: [TODAY], linked_module: null
  }, over || {});
}
function rtask(id, over) {
  return Object.assign({
    id: id, title: 'Постоянна ' + id, department: 'trade', task_type: 'info',
    target_stores: [STORE], due_weekdays: [IDX_TODAY], due_time: '09:00',
    linked_module: null, active: true
  }, over || {});
}

function isoWeekYear(d) {
  const t = new Date(d.getTime());
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  return t.getFullYear();
}

/* Целият стек, в реалния ред от index.html. */
function env(over) {
  over = over || {};
  const h = boot({
    modules: ['bulletin.js', 'kasa.js', 'daily-turnover.js'],
    user: over.user || USER,
    data: Object.assign({
      daily_turnover: [], stores: [{ name: STORE }],
      kasa_reports: [], kasa_glavna: [],
      recurring_tasks: [], task_completions: []
    }, over.data || {}),
    fail: over.fail
  });
  const w = h.w;
  const now = new Date();
  const cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });
  w.curBul = {
    id: 'b-1', week_number: w.weekNum(now), year: isoWeekYear(now), status: 'published',
    content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } }
  };
  w.bulListCache = [];
  w.bulComps = [];
  w.recurringComps = [];
  w.allStoresCache = [STORE];
  w.bulTasks = over.bulTasks || [];
  w.recurringTasks = over.recurringTasks || [];
  return h;
}

/* САМО input[type=checkbox]. Баджът за статус е <span> със същия текст —
   по-широк селектор би хванал и него и тестът би излъгал. */
function cbs(doc, attr, id) {
  return Array.prototype.slice.call(
    doc.querySelectorAll('input[type=checkbox][' + attr + '="' + id + '"]'));
}
function linkBtns(doc) {
  return Array.prototype.slice.call(doc.querySelectorAll('button[data-mod="oborot"]'));
}
/* Синтетичен чекбокс — заобикаля disabled, както би направила конзолата. */
function fakeCb(doc, attr, id, linked) {
  const cb = doc.createElement('input');
  cb.type = 'checkbox';
  cb.setAttribute(attr, id);
  cb.setAttribute('data-cdate', TODAY);
  cb.setAttribute('data-linked', linked || '');
  cb.checked = true;
  return cb;
}

const postsTo = (h, t) => h.calls.post.filter(p => p.table === t);

async function fillAndSubmit(h) {
  h.w.loadOborot();
  await ticks();
  const set = (id, v) => { const e = h.doc.getElementById(id); if (e) e.value = v; };
  set('dt-total', '100.00'); set('dt-cash', '60.00');
  set('dt-card', '40.00'); set('dt-customers', '25');
  const b = Array.prototype.slice.call(h.doc.querySelectorAll('button'))
    .find(x => (x.textContent || '').indexOf('Запиши оборота') >= 0);
  if (!b) return false;
  realClick(h.w, b, 'Запиши оборота');
  await ticks(); await ticks();
  return true;
}

(async function () {

  section('1. Модулът е регистриран и бутонът се появява');
  {
    const h = env({
      bulTasks: [task('t-ob', { linked_module: 'oborot' })],
      recurringTasks: [rtask('r-ob', { linked_module: 'oborot' })]
    });
    const w = h.w;
    ok('LINKED_MODULES съдържа oborot',
      w.LINKED_MODULES.some(m => m.value === 'oborot'));
    ok('етикетът е „Вечерен оборот"',
      (w.linkedModuleLabel('oborot') || '').indexOf('Вечерен оборот') >= 0);
    ok('oborot е последен в списъка',
      w.LINKED_MODULES[w.LINKED_MODULES.length - 1].value === 'oborot');

    if (guard('renderBulView() не хвърля', () => w.renderBulView())) {
      const btns = linkBtns(h.doc);
      ok('бутонът се рендира', btns.length > 0, 'брой: ' + btns.length);
      ok('бутонът вика showModule(this.dataset.mod)',
        btns.length > 0 && /showModule\(this\.dataset\.mod\)/.test(btns[0].getAttribute('onclick') || ''));
      /* Обикновена и постоянна задача — двата пътя са отделни редове в кода
         (bulletin.js ~845 и ~864), затова се очакват два бутона. */
      ok('има бутон и при двата вида задачи (обикновена + постоянна)',
        btns.length >= 2, 'брой: ' + btns.length);
    }
  }
  {
    const h = env({ user: CLERK, recurringTasks: [rtask('r-ob', { linked_module: 'oborot' })] });
    ok('роля без достъп до Каса не получава бутона (linkedModuleAllowed)',
      h.w.linkedModuleAllowed('oborot') === false);
    ok('и за самата Каса е същото', h.w.linkedModuleAllowed('kasa') === false);
  }
  {
    const h = env();
    ok('manager има право на oborot', h.w.linkedModuleAllowed('oborot') === true);
  }

  section('2. Клик по бутона отваря подтаб Оборот в Каса');
  {
    const h = env({ recurringTasks: [rtask('r-ob', { linked_module: 'oborot' })] });
    guard('renderBulView()', () => h.w.renderBulView());
    const btns = linkBtns(h.doc);
    if (ok('бутонът е в DOM-а', btns.length > 0)) {
      realClick(h.w, btns[0], 'Вечерен оборот →');
      await ticks(); await ticks();

      ok('kasaView е сменен на oborot', h.w.kasaView === 'oborot');
      const modKasa = h.doc.getElementById('mod-kasa');
      ok('показва се mod-kasa', !!modKasa && modKasa.style.display === 'block',
        modKasa ? modKasa.style.display : 'няма');
      const modBul = h.doc.getElementById('mod-bulletin');
      ok('Бюлетинът се скрива', !!modBul && modBul.style.display === 'none');

      const tabKasa = h.doc.getElementById('tab-kasa');
      ok('подсветен е tab-kasa', !!tabKasa && tabKasa.classList.contains('active'));
      const actives = Array.prototype.slice.call(h.doc.querySelectorAll('.nav-tab.active'));
      ok('и той е ЕДИНСТВЕНИЯТ активен таб', actives.length === 1,
        'активни: ' + actives.map(a => a.id).join(','));
      ok('няма контейнер mod-oborot (не е самостоятелен модул)',
        !h.doc.getElementById('mod-oborot'));

      const ob = h.doc.getElementById('ktab-oborot');
      ok('отворен е подтаб Оборот', !!ob);
      if (ob) {
        const style = (ob.getAttribute('style') || '') + ' ' + (ob.style.background || '');
        ok('подтабът е подсветен', /background:\s*#2f2f2f|rgb\(47,\s*47,\s*47\)/.test(style), style.slice(0, 60));
      }
      const sub = h.doc.querySelector('#mod-kasa .pg-sub');
      ok('съдържанието е на Вечерен оборот',
        !!sub && sub.textContent.indexOf('Вечерен оборот') >= 0, sub ? sub.textContent : 'няма');
    }
  }

  section('3. Чекбоксът за оборот не се натиска — дори днес');
  {
    const h = env({
      bulTasks: [task('t-ob', { linked_module: 'oborot' }), task('t-plain')],
      recurringTasks: [rtask('r-ob', { linked_module: 'oborot' }), rtask('r-plain')]
    });
    guard('renderBulView()', () => h.w.renderBulView());

    const obRec = cbs(h.doc, 'data-rtid', 'r-ob');
    const obReg = cbs(h.doc, 'data-tid', 't-ob');
    const plainRec = cbs(h.doc, 'data-rtid', 'r-plain');
    const plainReg = cbs(h.doc, 'data-tid', 't-plain');

    if (ok('чекбоксовете за постоянната задача съществуват', obRec.length > 0)) {
      ok('постоянна задача с oborot → disabled и за ДНЕШНИЯ ден',
        obRec.every(c => c.disabled === true));
      ok('title обяснява защо',
        obRec.every(c => c.getAttribute('title') === AUTO_LABEL),
        obRec.map(c => c.getAttribute('title')).join(' | '));
      ok('контролата НЕ се крие, само е приглушена',
        obRec.every(c => (c.getAttribute('style') || '').indexOf('cursor:not-allowed') >= 0));
      ok('носи data-linked за обработчика',
        obRec.every(c => c.getAttribute('data-linked') === 'oborot'));
    }
    if (ok('чекбоксовете за обикновената задача съществуват', obReg.length > 0)) {
      ok('обикновена задача с oborot → също disabled',
        obReg.every(c => c.disabled === true));
    }
    /* Контролата: заключването е ЗА ТАЗИ задача, не за целия ден. */
    if (ok('има и незасегнати задачи за същия ден', plainRec.length > 0 && plainReg.length > 0)) {
      ok('обикновена постоянна задача за днес си остава натискаема',
        plainRec.every(c => c.disabled === false));
      ok('обикновена задача за днес си остава натискаема',
        plainReg.every(c => c.disabled === false));
    }
  }

  section('4. Пряко извикване на обработчика се отхвърля');
  {
    const h = env({ recurringTasks: [rtask('r-ob', { linked_module: 'oborot' })] });
    const cb = fakeCb(h.doc, 'data-rtid', 'r-ob', 'oborot');
    guard('bulRecurringCheckboxChanged() не хвърля', () => h.w.bulRecurringCheckboxChanged(cb));
    await ticks();
    ok('НЕ тръгва запис в task_completions', postsTo(h, 'task_completions').length === 0);
    ok('чекбоксът се връща в предишното състояние', cb.checked === false);
    ok('казва защо', h.calls.toast.some(t => t === AUTO_LABEL), JSON.stringify(h.calls.toast));
  }
  {
    const h = env({ bulTasks: [task('t-ob', { linked_module: 'oborot' })] });
    const cb = fakeCb(h.doc, 'data-tid', 't-ob', 'oborot');
    guard('bulCheckboxChanged() не хвърля', () => h.w.bulCheckboxChanged(cb));
    await ticks();
    ok('и по пътя за обикновени задачи не тръгва запис',
      postsTo(h, 'task_completions').length === 0);
    ok('чекбоксът се връща', cb.checked === false);
  }
  {
    /* Заключването по дата не е счупено от новото условие. */
    const h = env();
    const cb = fakeCb(h.doc, 'data-rtid', 'r-x', '');
    cb.setAttribute('data-cdate', dayOffset(-1));
    guard('вчерашна задача', () => h.w.bulRecurringCheckboxChanged(cb));
    await ticks();
    ok('заключването по дата продължава да работи',
      h.calls.toast.some(t => t === 'Денят е приключил'), JSON.stringify(h.calls.toast));
  }

  section('5. Успешен оборот отмята задачата сам');
  {
    const h = env({ data: { recurring_tasks: [{ id: 'r-ob-1' }], task_completions: [] } });
    if (ok('формата се подава', await fillAndSubmit(h))) {
      ok('оборотът е записан', postsTo(h, 'daily_turnover').length === 1);
      const tc = postsTo(h, 'task_completions');
      if (ok('тръгва отмятане в task_completions', tc.length === 1, 'брой: ' + tc.length)) {
        const b = tc[0].body;
        ok('recurring_task_id е на намерената задача', b.recurring_task_id === 'r-ob-1');
        ok('task_id е null (постоянна задача)', b.task_id === null);
        ok('store_name е обектът', b.store_name === STORE);
        ok('completed_by е потребителят', b.completed_by === 'Мария Иванова');
        ok('completion_date е ДНЕС, локално', b.completion_date === h.w.toLocalISO(new Date()), b.completion_date);
        ok('status е done', b.status === 'done');
      }
      ok('зелен toast за оборота', h.calls.toast.some(t => /Оборотът е записан$/.test(t)));
      ok('няма предупреждение', !h.doc.getElementById('dt-task-warn'));
    }
  }
  {
    /* Вече отметнато днес — втори ред би дал дубликат в броенето. */
    const h = env({
      data: {
        recurring_tasks: [{ id: 'r-ob-1' }],
        task_completions: [{ id: 'tc-1', recurring_task_id: 'r-ob-1', store_name: STORE, completion_date: TODAY }]
      }
    });
    await fillAndSubmit(h);
    ok('оборотът пак се записва', postsTo(h, 'daily_turnover').length === 1);
    ok('но НЕ се отмята втори път', postsTo(h, 'task_completions').length === 0);
  }

  section('6. Няма активна задача — не е грешка');
  {
    const h = env({ data: { recurring_tasks: [], task_completions: [] } });
    if (ok('формата се подава', await fillAndSubmit(h))) {
      ok('оборотът е записан', postsTo(h, 'daily_turnover').length === 1);
      ok('НЕ тръгва запис в task_completions', postsTo(h, 'task_completions').length === 0);
      ok('няма червен toast', !h.calls.toast.some(t => /Грешка|не се отметна/.test(t)),
        JSON.stringify(h.calls.toast));
      ok('няма предупредителен маркер', !h.doc.getElementById('dt-task-warn'));
      ok('зеленият toast си е там', h.calls.toast.some(t => /Оборотът е записан$/.test(t)));
    }
  }

  section('7. Оборотът мина, отмятането не — казва се, не се premълчава');
  {
    const h = env({
      data: { recurring_tasks: [{ id: 'r-ob-1' }], task_completions: [] },
      fail: { POST: { status: 400, body: { message: 'null value in column violates not-null' }, url: /task_completions/ } }
    });
    if (ok('формата се подава', await fillAndSubmit(h))) {
      ok('оборотът Е записан (не се връща назад)', postsTo(h, 'daily_turnover').length === 1);
      ok('опитът за отмятане е направен', postsTo(h, 'task_completions').length === 1);
      ok('зелен toast за оборота', h.calls.toast.some(t => /Оборотът е записан$/.test(t)));
      ok('И жълт toast за отмятането',
        h.calls.toast.some(t => /но задачата в Бюлетина не се отметна/.test(t)),
        JSON.stringify(h.calls.toast));
      ok('двата toast-а са различни съобщения', h.calls.toast.length >= 2);

      const warn = h.doc.getElementById('dt-task-warn');
      ok('в изгледа стои видим маркер, не само изчезващ toast', !!warn);
      if (warn) {
        ok('маркерът казва какво е станало',
          warn.textContent.indexOf('не се отметна') >= 0);
      }
    }
  }
  {
    /* Обратната посока: провал на оборота НЕ бива да води до отмятане. */
    const h = env({
      data: { recurring_tasks: [{ id: 'r-ob-1' }], task_completions: [] },
      fail: { POST: { status: 400, body: { message: 'boom' }, url: /daily_turnover/ } }
    });
    await fillAndSubmit(h);
    ok('провален оборот → НЕ се отмята задачата',
      postsTo(h, 'task_completions').length === 0);
  }

  section('8. Ролята се пази и в самия модул, не само на входа');
  for (const role of ['sklad', 'marketing', 'employee']) {
    const u = { email: 'x@temax.bg', display_name: 'Без право', role: role, store_name: STORE };
    const h = env({ user: u, recurringTasks: [rtask('r-ob', { linked_module: 'oborot' })] });

    /* 1) бутонът в календара изобщо не се рендира */
    guard('renderBulView() за роля ' + role, () => h.w.renderBulView());
    ok(role + ': бутонът в календара не се рендира', linkBtns(h.doc).length === 0);

    /* 2) прякото извикване не дава форма. САМО input/button — обвиващият div
       съдържа текста на всичко вътре и проверка по него винаги е истина. */
    h.w.loadOborot();
    await ticks(); await ticks();
    ok(role + ': няма поле „Общ оборот"', !h.doc.getElementById('dt-total'));
    ok(role + ': няма поле „Брой клиенти"', !h.doc.getElementById('dt-customers'));
    const btns = Array.prototype.slice.call(h.doc.querySelectorAll('#mod-kasa button'))
      .filter(b => (b.textContent || '').indexOf('Запиши оборота') >= 0);
    ok(role + ': няма бутон „Запиши оборота"', btns.length === 0);
    const inputs = h.doc.querySelectorAll('#mod-kasa input');
    ok(role + ': няма нито едно поле за въвеждане', inputs.length === 0,
      'намерени: ' + inputs.length);

    /* 3) не е празен екран */
    const txt = (h.doc.getElementById('mod-kasa') || {}).textContent || '';
    ok(role + ': казва защо, вместо празен екран', txt.indexOf('се подава от') >= 0,
      txt.slice(0, 60));
    ok(role + ': заглавието „Каса" си остава', !!h.doc.querySelector('#mod-kasa .pg-title'));

    /* 4) без право не се дърпат и данни */
    ok(role + ': не се праща заявка към daily_turnover',
      !h.calls.get.some(u2 => u2.indexOf('daily_turnover') >= 0));

    /* 5) обработчикът също отказва */
    h.w.submitOborot();
    await ticks();
    ok(role + ': submitOborot() не записва нищо',
      postsTo(h, 'daily_turnover').length === 0);
  }
  {
    /* Контролата: правоимащ вижда формата на същото място. */
    const h = env();
    h.w.loadOborot();
    await ticks();
    ok('manager ВИЖДА формата (гейтът не е глобален отказ)',
      !!h.doc.getElementById('dt-total'));
    ok('и заявката за данни тръгва',
      h.calls.get.some(u2 => u2.indexOf('daily_turnover') >= 0));
  }
  section('9. Централен офис — справката е за admin и accounting, не за целия офис');
  /* В ЦО има 58 активни потребителя (23.08.2026). Оборотът на веригата досега
     стигаше до трима по имейл — справката не бива да го отваря за всички. */
  function co(role) {
    return { email: role + '@temax.bg', display_name: 'ЦО ' + role, role: role, store_name: 'Централен офис' };
  }
  for (const role of ['accounting', 'admin']) {
    const h = env({ user: co(role) });
    h.w.loadOborot();
    await ticks(); await ticks();
    ok('ЦО/' + role + ': ВИЖДА справката', !!h.doc.getElementById('dt-co-table'));
    ok('ЦО/' + role + ': но НЯМА форма за въвеждане', !h.doc.getElementById('dt-total'));
  }
  {
    const h = env({ user: co('accounting') });
    h.w.loadOborot();
    await ticks(); await ticks();
    h.w.submitOborot();
    await ticks();
    ok('ЦО/accounting: submitOborot() отказва', postsTo(h, 'daily_turnover').length === 0);
    ok('и казва защо', h.calls.toast.some(t => /Нямаш право/.test(t)), JSON.stringify(h.calls.toast));
  }
  for (const role of ['marketing', 'supply', 'user', 'kasa', 'manager']) {
    const h = env({ user: co(role) });
    h.w.loadOborot();
    await ticks(); await ticks();
    ok('ЦО/' + role + ': НЕ вижда справката', !h.doc.getElementById('dt-co-table'));
    ok('ЦО/' + role + ': няма и форма', !h.doc.getElementById('dt-total'));
    ok('ЦО/' + role + ': получава съобщението, не празен екран',
      ((h.doc.getElementById('mod-kasa') || {}).textContent || '').indexOf('се подава от') >= 0);
    ok('ЦО/' + role + ': не се дърпат данни',
      !h.calls.get.some(u2 => u2.indexOf('daily_turnover') >= 0));
  }
  {
    /* Двата списъка са различни права, не един с изключение. */
    const h = env({ user: co('kasa') });
    ok('„kasa" подава от обект, но НЕ чете чуждите обороти от ЦО',
      h.w.oborotCanSubmit() === true && h.w.oborotAllowed() === false);
    const h2 = env({ user: co('accounting') });
    ok('„accounting" чете от ЦО, но НЕ подава',
      h2.w.oborotCanSubmit() === false && h2.w.oborotAllowed() === true);
  }
  {
    /* Обратното: същата роля, но в МАГАЗИН — няма нито форма, нито справка. */
    const h = env({ user: { email: 'a@temax.bg', display_name: 'Счетоводство', role: 'accounting', store_name: STORE } });
    h.w.loadOborot();
    await ticks(); await ticks();
    ok('accounting в магазин няма форма', !h.doc.getElementById('dt-total'));
    ok('accounting в магазин получава съобщението',
      ((h.doc.getElementById('mod-kasa') || {}).textContent || '').indexOf('се подава от') >= 0);
  }

  section('10. Закотвяния в изходния код');
  {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..');
    const dt = fs.readFileSync(path.join(root, 'daily-turnover.js'), 'utf8');
    const code = dt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok('датата на отмятането не минава през today() от shared.js',
      !/[^A-Za-z]today\(\)/.test(code));
    ok('не предефинира toLocalISO()', !/function\s+toLocalISO/.test(dt));

    const sh = fs.readFileSync(path.join(root, 'shared.js'), 'utf8');
    ok('shared.js има клон за oborot в showModule()', /mod==='oborot'/.test(sh));
    ok('„oborot" НЕ е добавен в списъка с mod-* контейнери',
      !/'stock-diff','pallets','today','oborot'|'oborot','/.test(sh));

    const bl = fs.readFileSync(path.join(root, 'bulletin.js'), 'utf8');
    ok('bulletin.js заключва през общия механизъм, не паралелен',
      /function bulLockReason/.test(bl) && /bulAutoLocked/.test(bl));
    ok('всички пет чекбокса носят data-linked',
      (bl.match(/data-linked=/g) || []).length === 5,
      'намерени: ' + (bl.match(/data-linked=/g) || []).length);
  }

  report();
})();
