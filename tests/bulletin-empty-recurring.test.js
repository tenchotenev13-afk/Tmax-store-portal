/* Бюлетин БЕЗ обикновени задачи — постоянните пак се четат и броят.

   Случаят от 14.09.2026 (Карлово, С38): бюлетинът за седмицата имаше 0 реда в
   bulletin_tasks. loadBulletin() излизаше рано с recurringComps=[] и изобщо не
   пускаше заявката `recurring_task_id=not.is.null`. Отметката на
   „ЗАРЕЖДАНЕ КОЛОРАНТИ…" си стоеше в базата (done, днешна дата), но при всяко
   влизане чекбоксът беше празен, а повторното отмятане минаваше през
   409 → PATCH върху същия ред. loadTasksStats() имаше собствен ранен изход
   (`!statTasks.length`) и не броеше постоянните въобще.

   Какво заковава тестът:
     1. обект: бюлетин без обикновени задачи + done ред на постоянна задача за
        днес → след loadBulletin() чекбоксът Е отметнат; неотметнатата остава
        празна (контрола); заявката по task_id НЕ се пуска; пренесените
        (postponed_to за седмицата) се показват;
     2. офис: loadTasksStats() брои постоянните — Склад 1/2;
     3. печат (истински клик в менюто „Само Склад"): отметнатата е с ✓,
        неотметнатата — без.

   Мутации, с които тестът ТРЯБВА да падне:
     М1: старият ранен изход в loadBulletin (recurringComps=[]; renderBulletin())
     М2: старото `if (!wrap || !statTasks.length) return;` в loadTasksStats

   ⚠️ Дати: котвата е ДНЕС 12:00 местно, замразена на w.Date — без календарни
   литерали и без нощен флейк около полунощ.

   Пускане: node tests/bulletin-empty-recurring.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

const ANCHOR = (function () { const d = new Date(); d.setHours(12, 0, 0, 0); return d; })();
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

const TODAY = isoOf(ANCHOR);
const IDX = (ANCHOR.getDay() + 6) % 7;          /* 0=Пон..6=Нед */
const MON0 = isoOf(shifted(-IDX));
const LAST_WEEK = isoOf(shifted(-7));

const KR = 'Карлово';
const STORE_USER = { email: 'k@temax.bg', display_name: 'Управител Карлово', role: 'store', store_name: KR };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function rec(id, over) {
  return Object.assign({
    id: id, title: 'Постоянна ' + id, department: 'warehouse', task_type: 'info',
    description: null, target_stores: null, due_weekday: null, due_weekdays: [IDX],
    due_time: '11:00', due_window: false, linked_module: null, report_groups: null,
    attachments: null, active: true, sort_order: 1
  }, over || {});
}
const RECS = [
  rec('r-kol',  { title: 'ЗАРЕЖДАНЕ КОЛОРАНТИ', sort_order: 1 }),
  rec('r-open', { title: 'Неотметната склад', sort_order: 2 }),
  rec('r-car',  { title: 'Пренесена търговска', department: 'trade', due_weekdays: [(IDX + 3) % 7], sort_order: 3 })
];
const PERIODS = RECS.map((r, i) => ({ id: 'p' + i, recurring_task_id: r.id, from_monday: isoOf(shifted(-60)), to_monday: null }));

const ROWS = [
  { id: 'c-kol', task_id: null, recurring_task_id: 'r-kol', store_name: KR, status: 'done',
    completion_date: TODAY, postponed_to: null, comment: 'ИЗПРАТЕНО', photos: null,
    files: [{ url: 'https://x/completion_1.xlsx', filename: 'Зареждане.xlsx' }], completed_by: 'Управител Карлово' },
  { id: 'c-car', task_id: null, recurring_task_id: 'r-car', store_name: KR, status: 'postponed',
    completion_date: LAST_WEEK, postponed_to: TODAY, comment: 'ремонт', completed_by: 'Управител Карлово' }
];

/* Фалшивият PostgREST прилага филтрите — заявка без recurring_task_id би
   върнала и пренесения ред, и мутация „махни филтъра" не би паднала. */
function tcRoute(rows) {
  return url => {
    let out = rows.slice();
    const one = (re, fn) => { const m = re.exec(url); if (m) out = out.filter(r => fn(r, m[1])); };
    one(/[?&]postponed_to=eq\.([^&]+)/, (r, v) => String(r.postponed_to || '') === v);
    one(/[?&]postponed_to=gte\.([^&]+)/, (r, v) => !!r.postponed_to && String(r.postponed_to) >= v);
    one(/[?&]postponed_to=lte\.([^&]+)/, (r, v) => !!r.postponed_to && String(r.postponed_to) <= v);
    one(/[?&]status=eq\.([^&]+)/, (r, v) => String(r.status || '') === v);
    one(/[?&]store_name=eq\.([^&]+)/, (r, v) => r.store_name === decodeURIComponent(v));
    one(/[?&]task_id=in\.\(([^)]*)\)/, (r, v) => v.split(',').indexOf(String(r.task_id)) >= 0);
    one(/[?&]recurring_task_id=in\.\(([^)]*)\)/, (r, v) => v.split(',').indexOf(String(r.recurring_task_id)) >= 0);
    if (/[?&]recurring_task_id=not\.is\.null/.test(url)) out = out.filter(r => !!r.recurring_task_id);
    one(/[?&]completion_date=gte\.([^&]+)/, (r, v) => !!r.completion_date && String(r.completion_date) >= v);
    one(/[?&]completion_date=lte\.([^&]+)/, (r, v) => !!r.completion_date && String(r.completion_date) <= v);
    return out;
  };
}

function env(user) {
  const h = boot({
    modules: ['bulletin.js'],
    user: user,
    data: {
      users: [{ store_name: KR }],
      recurring_tasks: url => { const m = /[?&]active=eq\.(true|false)/.exec(url);
        return RECS.filter(r => !m || String(!!r.active) === m[1]); },
      recurring_task_periods: PERIODS,
      recurring_task_skips: [],
      bulletins: url => { const m = /[?&]id=eq\.([^&]+)/.exec(url); return m ? h.buls.filter(b => b.id === m[1]) : h.buls; },
      /* Същината: НИТО ЕДНА обикновена задача в бюлетина. */
      bulletin_tasks: [],
      task_completions: tcRoute(ROWS),
      subtask_completions: [],
      task_subtasks: []
    }
  });
  freezeDate(h.w);
  const cal = {};
  h.w.DKEYS.forEach(k => { cal[k] = []; });
  h.buls = [{ id: 'b-38', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published',
              created_at: MON0, content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } }];
  h.w.bulSelectedId = 'b-38';
  h.w.bulActiveDept = 'warehouse';
  h.w.reportableStoresCache = [KR];
  h.w.allStoresCache = [KR];
  return h;
}

async function settle(cond, max) {
  for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const cbs = (doc, id) => Array.prototype.slice.call(doc.querySelectorAll('input[type=checkbox][data-rtid="' + id + '"]'));
const tcGets = h => h.calls.get.filter(u => u.indexOf('/task_completions') >= 0);
const recGet = h => tcGets(h).filter(u => u.indexOf('recurring_task_id=not.is.null') >= 0);

(async function () {

  /* ═══ 1. Обект ═══════════════════════════════════════════════════════════ */
  section('1. Обект: бюлетин без обикновени задачи → отметката на постоянната Е там');
  const hs = env(STORE_USER);
  {
    const doc = hs.doc;
    if (guard('loadBulletin() не хвърля', () => hs.w.loadBulletin())) {
      /* Чакаме ЗАЯВКАТА плюс рендер след нея — не само чекбокса: той се рисува
         и при празен recurringComps, тоест проверка „има чекбокс" минава и
         срещу стария код. */
      await settle(() => recGet(hs).length > 0 && cbs(doc, 'r-kol').length > 0 && cbs(doc, 'r-kol').some(c => c.checked), 120);
      for (let i = 0; i < 3; i++) await ticks();

      ok('бюлетинът наистина е без обикновени задачи', hs.w.bulTasks.length === 0, hs.w.bulTasks.length);
      const rq = recGet(hs);
      ok('заявката за постоянните отметки СЕ пуска', rq.length === 1, JSON.stringify(tcGets(hs)));
      if (rq.length) {
        ok('…по обекта', rq[0].indexOf('store_name=eq.' + encodeURIComponent(KR)) >= 0, rq[0]);
        ok('…и в седмицата', rq[0].indexOf('completion_date=gte.' + MON0) >= 0, rq[0]);
      }
      ok('заявката по task_id НЕ се пуска (няма обикновени)',
        !tcGets(hs).some(u => /task_id=in\./.test(u) && u.indexOf('recurring_task_id') < 0), JSON.stringify(tcGets(hs)));

      const kol = cbs(doc, 'r-kol').filter(c => c.getAttribute('data-cdate') === TODAY);
      if (ok('чекбокс за „ЗАРЕЖДАНЕ КОЛОРАНТИ" с днешната дата', kol.length >= 1, cbs(doc, 'r-kol').map(c => c.getAttribute('data-cdate')).join(','))) {
        ok('ОТМЕТНАТ след loadBulletin (всички копия — блок и календар)', kol.every(c => c.checked), kol.map(c => c.checked).join(','));
      }
      ok('recurringComps съдържа done реда', hs.w.recurringComps.some(c => c.recurring_task_id === 'r-kol' && c.status === 'done' && c.completion_date === TODAY),
        JSON.stringify(hs.w.recurringComps));
      const open = cbs(doc, 'r-open');
      if (ok('КОНТРОЛА: чекбокс за неотметнатата съществува', open.length >= 1)) {
        ok('КОНТРОЛА: неотметнатата остава празна', open.every(c => !c.checked));
      }

      ok('пренесените: заявка по postponed_to за седмицата',
        tcGets(hs).some(u => u.indexOf('postponed_to=gte.' + MON0) >= 0), JSON.stringify(tcGets(hs)));
      ok('пренесените: bulCarried носи реда', hs.w.bulCarried.some(c => c.id === 'c-car'), JSON.stringify(hs.w.bulCarried));
      /* Пренесената постоянна живее в седмичния календар (bulCarriedCalRowHtml) —
         панелът по отдели показва само обикновени от ЧУЖД бюлетин. */
      const carCb = doc.querySelectorAll('#sec-calendar input[type=checkbox][data-tid="r-car"][data-kind="recurring"]');
      ok('пренесената постоянна е в календара — чекбокс на новия ден',
        carCb.length === 1 && carCb[0].getAttribute('data-cdate') === TODAY && !carCb[0].checked,
        Array.prototype.map.call(carCb, c => c.getAttribute('data-cdate') + '/' + c.checked).join(','));
      ok('никоя заявка не е върнала грешка', hs.calls.notOk.length === 0, JSON.stringify(hs.calls.notOk));
    }
  }

  /* ═══ 2. Статистика ═════════════════════════════════════════════════════ */
  section('2. Офис: loadTasksStats() брои постоянните и без обикновени задачи');
  {
    const h = env(ADMIN);
    const doc = h.doc;
    if (guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) {
      await settle(() => recGet(h).length > 0 && h.w.recurringComps.length > 0, 120);
      ok('офисът тегли постоянните отметки (без store филтър)',
        recGet(h).length === 1 && recGet(h)[0].indexOf('store_name=') < 0, JSON.stringify(recGet(h)));
      let wrap = doc.getElementById('tasks-stat-wrap');
      if (!wrap) { wrap = doc.createElement('div'); wrap.id = 'tasks-stat-wrap'; doc.body.appendChild(wrap); }
      wrap.innerHTML = '';
      if (guard('loadTasksStats() не хвърля', () => h.w.loadTasksStats())) {
        await settle(() => !!wrap.querySelector('tbody tr'));
        const heads = Array.prototype.map.call(wrap.querySelectorAll('thead th'), th => txt(th));
        const col = heads.findIndex(t => t.indexOf(h.w.DEPTS.warehouse.label) >= 0);
        const row = wrap.querySelector('tbody tr');
        ok('таблицата е изрисувана', !!row && col >= 0, wrap.innerHTML.slice(0, 200));
        if (row && col >= 0) {
          ok('редът е за Карлово', txt(row.children[0]) === KR, txt(row.children[0]));
          ok('Склад: 1/2 (отметнатата се брои, неотметнатата — не)', txt(row.children[col]) === '1/2', txt(row.children[col]));
        }
      }
    }
  }

  /* ═══ 3. Печат ═══════════════════════════════════════════════════════════ */
  section('3. Печат „Само Склад" (истински клик) — отметнатата е с ✓');
  {
    const w = hs.w, doc = hs.doc;
    const written = [];
    w.open = () => ({ document: { write: s => written.push(String(s)), close() {} }, focus() {}, print() {}, close() {} });
    const pm = doc.getElementById('pm-ov');
    const btnW = pm && pm.querySelector('button[data-what="warehouse"]');
    if (ok('менюто за печат има бутон „Само Склад"', !!btnW)) {
      guard('клик „Само Склад/Приемане"', () => H.realClick(w, btnW, 'Само Склад'));
      const html = written.join('');
      const chunks = html.split('<div class="task-row">');
      const kolRow = chunks.find(c => c.indexOf('ЗАРЕЖДАНЕ КОЛОРАНТИ') >= 0);
      const openRow = chunks.find(c => c.indexOf('Неотметната склад') >= 0);
      if (ok('редът на „ЗАРЕЖДАНЕ КОЛОРАНТИ" е в печата', !!kolRow, html.length)) {
        ok('…с ✓', kolRow.split('task-title')[0].indexOf('✓') >= 0, kolRow.slice(0, 200));
      }
      if (ok('КОНТРОЛА: неотметнатата е в печата', !!openRow)) {
        ok('КОНТРОЛА: …без ✓', openRow.split('task-title')[0].indexOf('✓') < 0, openRow.slice(0, 200));
      }
    }
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
