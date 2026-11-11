/* Бюлетин — задача с ПРОЗОРЕЦ: обектът може да махне СВОЯТА отметка, докато
   прозорецът е отворен (bul-window-untick, решение на Тенчо 10.11.2026).

   Повод: „ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА" (Пон–Вто, file_comment). Търговище и Враца
   прикачиха грешен файл 09–10.11 и не можеха да махнат отметката — чекбоксът
   беше заключен още в същия ден (winDoneAttr, от 17aa8c3). Трите пъти
   отметката се триеше с SQL.

   Правилото:
     · днес В прозореца → отключен; махането трие ЗАТВАРЯЩИЯ ред (неговата
       completion_date), не днешния; после ново отмятане → нов ред за днес;
     · след последния ден → заключен, както досега („Изпълнена на …");
     · автоматичен модул → винаги заключен;
     · календар, блок и „План за деня" казват едно и също.

   Датите: котва = понеделникът на текущата реална седмица, часовникът се
   замразява на ден от нея — без календарни литерали.

   Пускане: node tests/bul-window-untick.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, fire, realClick } = H;

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
const MON = isoAt(0), TUE = isoAt(1);
const dm = iso => { const q = iso.split('-'); return q[2] + '.' + q[1]; };

function freezeAt(w, n) {
  const Real = w.Date, ms = dateAt(n).getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = Frozen;
}

const STORE = 'Търговище';
const MANAGER = { email: 'm@temax.bg', display_name: 'Управител', role: 'manager', store_name: STORE };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

/* „ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА": Пон–Вто, документ + коментар. */
function recTask(over) {
  return Object.assign({
    id: 'r-win', title: 'ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА', description: '',
    department: 'trade', task_type: 'file_comment', active: true, sort_order: 1,
    due_weekdays: [0, 1], due_weekday: 0, due_time: '17:00', due_window: true,
    target_stores: null, report_groups: null, linked_module: null
  }, over || {});
}
function oneTask(over) {
  return Object.assign({
    id: 't-win', bulletin_id: 'b-1', department: 'trade', title: 'Еднократна с прозорец',
    description: null, due_date: MON, due_dates: [MON, TUE], due_window: true,
    spans_from: null, starts_on: null, target_stores: null, task_type: 'file_comment',
    report_groups: null, linked_module: null, auto_complete: false, attachments: null,
    sort_order: 1, created_by: 'Админ', created_at: MON
  }, over || {});
}
function recComp(date) {
  return { recurring_task_id: 'r-win', store_name: STORE, status: 'done', completion_date: date,
           completed_by: 'Управител', completed_at: date + 'T09:30:00',
           comment: 'грешен файл', files: [{ name: 'стар.xlsx', url: 'https://x/стар.xlsx' }] };
}
function oneComp(date) {
  return { task_id: 't-win', store_name: STORE, status: 'done', completion_date: date,
           completed_by: 'Управител', completed_at: date + 'T09:30:00' };
}

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js'],
    user: opts.user || MANAGER,
    data: { users: [{ store_name: STORE }], stores: [{ name: STORE }] }
  });
  const w = h.w;
  freezeAt(w, opts.at);
  try { w.localStorage.setItem('bulPlanOpen', '1'); } catch (e) {}
  const cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });
  w.curBul = {
    id: 'b-1', week_number: w.weekNum(new w.Date()), year: dateAt(3).getFullYear(),
    status: 'published',
    content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } }
  };
  w.bulListCache = [];
  w.bulTasks = opts.tasks || [];
  w.bulComps = opts.bcomps || [];
  w.allStoresCache = [STORE];
  w.reportableStoresCache = [STORE];
  w.recurringTasks = opts.rtasks || [];
  w.recurringComps = opts.rcomps || [];
  w.bulActiveDept = 'trade';
  guard('renderBulView() не хвърля', () => w.renderBulView());
  return h;
}
const arr = x => Array.prototype.slice.call(x);
/* Всички чекбокси на задачата, разделени по място. */
function boxes(doc, attr, id) {
  const sel = 'input[type=checkbox][' + attr + '="' + id + '"]';
  const cal = doc.querySelector('#sec-calendar');
  const panel = doc.querySelector('#dept-panel-trade');
  return {
    cal: cal ? arr(cal.querySelectorAll(sel)) : [],
    block: panel ? arr(panel.querySelectorAll(sel)) : [],
    plan: arr(doc.querySelectorAll('.bplan-row ' + sel)),
    all: arr(doc.querySelectorAll(sel))
  };
}
const state = b => (b.checked ? 'C' : 'c') + (b.disabled ? 'L' : 'u') + ':' + (b.getAttribute('data-wcdate') || '-');
async function settle(cond, max) { for (let i = 0; i < (max || 40); i++) { if (cond()) return true; await ticks(); } return cond(); }

(async function run() {

  /* ═══ (а) Постоянна Пон–Вто, отметната в понеделник, днес вторник ═══════ */
  section('(а) отметната в понеделник, днес вторник → отключена, махане трие понеделника');
  {
    const h = env({ at: 1, rtasks: [recTask()], rcomps: [recComp(MON)] });
    const { w, doc, calls } = h;
    const b = boxes(doc, 'data-rtid', 'r-win');
    ok('календарът има двата дни', b.cal.length === 2, 'бр.: ' + b.cal.length);
    ok('блокът има чекбокс', b.block.length >= 1, 'бр.: ' + b.block.length);
    /* Планът показва затворена прозоречна задача САМО в деня на изпълнението
       (решение 27.09.2026) — във вторник редът е в плана за понеделник. */
    ok('„План за деня" за вторник НЕ я показва (тя е в деня на изпълнението)', b.plan.length === 0, 'бр.: ' + b.plan.length);
    w.bulPlanDate = MON; w.renderBulView();
    const pm = boxes(doc, 'data-rtid', 'r-win').plan;
    ok('„План за деня" за понеделник (◀): отметнат и ОТКЛЮЧЕН, data-wcdate=понеделник',
      pm.length === 1 && pm[0].checked && !pm[0].disabled && pm[0].getAttribute('data-wcdate') === MON, pm.map(state).join(' '));
    w.bulPlanDate = null; w.renderBulView();
    ok('всички са отметнати', b.all.length > 0 && b.all.every(x => x.checked), b.all.map(state).join(' '));
    ok('всички са ОТКЛЮЧЕНИ', b.all.every(x => !x.disabled), b.all.map(state).join(' '));
    ok('всички носят датата на затварящия ред (понеделник)',
      b.all.every(x => x.getAttribute('data-wcdate') === MON), b.all.map(state).join(' '));
    const want = 'Изпълнена на ' + dm(MON) + ' — можете да я махнете до ' + dm(TUE) + ', ако трябва да смените файла';
    ok('title казва до кога може да се махне', b.all.every(x => x.getAttribute('title') === want),
      b.all[0] && b.all[0].getAttribute('title'));
    ok('не е приглушен', b.all.every(x => (x.getAttribute('style') || '').indexOf('not-allowed') < 0));

    const cb = b.block[0];
    if (cb) {
      cb.checked = false;
      guard('махането не хвърля', () => fire(w, cb, 'change'));
      await settle(() => calls.del.length > 0 && w.recurringComps.length === 0);
      const dels = calls.del.filter(u => u.indexOf('task_completions') >= 0);
      ok('точно едно DELETE', dels.length === 1, 'бр.: ' + dels.length);
      ok('DELETE е за понеделника (датата на отметката)',
        dels.length === 1 && dels[0].indexOf('completion_date=eq.' + MON) >= 0, dels[0]);
      ok('а НЕ за днешния вторник', dels.every(u => u.indexOf('completion_date=eq.' + TUE) < 0), dels[0]);
      ok('и за правилната задача/обект', dels.length === 1 && dels[0].indexOf('recurring_task_id=eq.r-win') >= 0 &&
        dels[0].indexOf('store_name=eq.' + encodeURIComponent(STORE)) >= 0, dels[0]);
      ok('редът е махнат от паметта', w.recurringComps.length === 0, JSON.stringify(w.recurringComps));
      await settle(() => { const x = boxes(doc, 'data-rtid', 'r-win').block[0]; return x && !x.checked; });
      const b2 = boxes(doc, 'data-rtid', 'r-win');
      const nb = b2.block[0];
      ok('след махането: неотметнат, отключен, без data-wcdate',
        !!nb && !nb.checked && !nb.disabled && !nb.getAttribute('data-wcdate'), nb && state(nb));
      ok('и датата за ново отмятане е днес (вторник)', !!nb && nb.getAttribute('data-cdate') === TUE,
        nb && nb.getAttribute('data-cdate'));
      if (nb) {
        nb.checked = true;
        guard('новото отмятане не хвърля', () => fire(w, nb, 'change'));
        const ov = doc.getElementById('tc-modal-ov');
        ok('file_comment → отваря модала за документ + коментар', !!ov);
        if (ov) {
          w.tcPendingFiles = [{ name: 'верен.xlsx', url: 'https://x/верен.xlsx' }];
          const ta = doc.getElementById('tc-comment');
          if (ta) ta.value = 'сменен файл';
          const confirmBtn = arr(ov.querySelectorAll('button')).filter(x => /Потвърди/.test(x.textContent))[0];
          guard('„✓ Потвърди" не хвърля', () => realClick(w, confirmBtn, 'Потвърди'));
          await settle(() => calls.post.some(p => p.table === 'task_completions'));
          const posts = calls.post.filter(p => p.table === 'task_completions');
          ok('нов ред: една заявка POST', posts.length === 1, 'бр.: ' + posts.length);
          if (posts.length) {
            ok('новият ред е за вторник', posts[0].body.completion_date === TUE, posts[0].body.completion_date);
            ok('с новия файл', JSON.stringify(posts[0].body.files || []).indexOf('верен.xlsx') >= 0,
              JSON.stringify(posts[0].body.files));
            ok('и коментара', posts[0].body.comment === 'сменен файл', posts[0].body.comment);
          }
          ok('и няма второ DELETE', calls.del.filter(u => u.indexOf('task_completions') >= 0).length === 1);
        }
      }
    }
  }

  /* ═══ (б) Отметната и днес = първия ден ═════════════════════════════════ */
  section('(б) отметната днес (първия ден) → отключена');
  {
    const h = env({ at: 0, rtasks: [recTask()], rcomps: [recComp(MON)] });
    const b = boxes(h.doc, 'data-rtid', 'r-win');
    ok('има чекбокси', b.all.length >= 3, 'бр.: ' + b.all.length);
    ok('всички отметнати и отключени, с data-wcdate=понеделник',
      b.all.every(x => x.checked && !x.disabled && x.getAttribute('data-wcdate') === MON), b.all.map(state).join(' '));
  }

  /* ═══ (в) Днес след прозореца ═══════════════════════════════════════════ */
  section('(в) днес сряда — след прозореца → заключена, както досега');
  {
    const h = env({ at: 2, rtasks: [recTask()], rcomps: [recComp(MON)] });
    const { w, doc, calls } = h;
    const b = boxes(doc, 'data-rtid', 'r-win');
    ok('календарът има двата дни', b.cal.length === 2, 'бр.: ' + b.cal.length);
    const win = b.all.filter(x => x.checked);
    ok('отметнатите са заключени', win.length >= 2 && win.every(x => x.disabled), b.all.map(state).join(' '));
    ok('без data-wcdate', b.all.every(x => !x.getAttribute('data-wcdate')));
    ok('title е старият „Изпълнена на дд.мм.гггг"',
      win.every(x => x.getAttribute('title') === 'Изпълнена на ' + w.fmtDate(MON)), win[0] && win[0].getAttribute('title'));
    ok('приглушен', win.every(x => (x.getAttribute('style') || '').indexOf('not-allowed') >= 0));
    /* Стар таб от вторник, отворен в сряда: атрибутите са още там. */
    const fake = doc.createElement('input');
    fake.type = 'checkbox';
    fake.setAttribute('data-rtid', 'r-win');
    fake.setAttribute('data-cdate', TUE);
    fake.setAttribute('data-wcdate', MON);
    fake.setAttribute('data-wfirst', MON);
    fake.setAttribute('data-wlast', TUE);
    fake.setAttribute('onchange', 'bulRecurringCheckboxChanged(this)');
    doc.body.appendChild(fake);
    fake.checked = false;
    fire(w, fake, 'change');
    await ticks();
    ok('стар таб след прозореца: махането е отказано (няма DELETE)', calls.del.length === 0, calls.del.join(' | '));
    ok('и чекбоксът се връща отметнат', fake.checked === true);
    ok('тост „Прозорецът е приключил"', calls.toast.some(m => /Прозорецът е приключил/.test(String(m))), calls.toast.join(' | '));
  }

  /* ═══ (г) Автоматичен модул ═════════════════════════════════════════════ */
  section('(г) автоматичен модул → заключен и в прозореца');
  {
    const h = env({ at: 1, rtasks: [recTask({ linked_module: 'supply' })], rcomps: [recComp(MON)] });
    const { w, doc } = h;
    ok('предпоставка: supply е автоматичен', !!w.bulAutoModuleOf('supply'));
    const b = boxes(doc, 'data-rtid', 'r-win');
    ok('няма нито един отключен с data-wcdate', b.all.every(x => !x.getAttribute('data-wcdate')), b.all.map(state).join(' '));
    ok('отметнатите са заключени', b.all.filter(x => x.checked).every(x => x.disabled), b.all.map(state).join(' '));
    ok('winUntickable() връща false', w.winUntickable(w.recurringComps[0], 'recurring', w.recurringTasks[0]) === false);
    /* Живата „ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА" (версия от 09.11.2026): linked_module
       'revaluation', отдел admin — линк към модул, НЕ автоматичен. */
    const live = recTask({ linked_module: 'revaluation', department: 'admin' });
    ok('живата конфигурация (revaluation, admin) е ОТКЛЮЧЕНА във вторник',
      w.winUntickable(recComp(MON), 'recurring', live) === true);
  }

  /* ═══ (д) Календар и блок — едно състояние ══════════════════════════════ */
  section('(д) календар, блок и план казват едно и също');
  {
    [1, 2].forEach(at => {
      const h = env({ at: at, rtasks: [recTask()], rcomps: [recComp(MON)] });
      h.w.bulPlanDate = MON; h.w.renderBulView();   /* планът — в деня на изпълнението */
      const b = boxes(h.doc, 'data-rtid', 'r-win');
      const s = b.cal.concat(b.block, b.plan).map(state);
      ok('ден ' + at + ': всички места еднакви (' + s[0] + ')', s.length >= 3 && s.every(x => x === s[0]), s.join(' '));
    });
  }

  /* ═══ Офисът ════════════════════════════════════════════════════════════ */
  section('офисът: без промяна — няма отключен чекбокс на прозорец');
  {
    const h = env({ at: 1, user: ADMIN, rtasks: [recTask()], rcomps: [recComp(MON)] });
    ok('няма data-wcdate в целия изглед', h.doc.querySelectorAll('[data-wcdate]').length === 0);
    ok('winUntickable() е false за офиса',
      h.w.winUntickable(h.w.recurringComps[0], 'recurring', h.w.recurringTasks[0]) === false);
  }

  /* ═══ (е) Еднократна задача с прозорец ══════════════════════════════════ */
  section('(е) еднократна с прозорец: отключена във вторник, махането трие понеделника');
  {
    const h = env({ at: 1, tasks: [oneTask()], bcomps: [oneComp(MON)] });
    const { w, doc, calls } = h;
    const b = boxes(doc, 'data-tid', 't-win');
    ok('има чекбокси (календар + блок)', b.cal.length >= 1 && b.block.length >= 1,
      'кал: ' + b.cal.length + ', блок: ' + b.block.length);
    ok('всички отметнати и отключени, с data-wcdate=понеделник',
      b.all.length > 0 && b.all.every(x => x.checked && !x.disabled && x.getAttribute('data-wcdate') === MON),
      b.all.map(state).join(' '));
    const s = b.all.map(state);
    ok('всички места еднакви', s.every(x => x === s[0]), s.join(' '));
    const cb = b.cal[b.cal.length - 1];
    if (cb) {
      cb.checked = false;
      guard('махането не хвърля', () => fire(w, cb, 'change'));
      await settle(() => calls.del.length > 0);
      const dels = calls.del.filter(u => u.indexOf('task_completions') >= 0);
      ok('едно DELETE, по датата на понеделника',
        dels.length === 1 && dels[0].indexOf('completion_date=eq.' + MON) >= 0 && dels[0].indexOf('task_id=eq.t-win') >= 0,
        dels.join(' | '));
    }
    const h2 = env({ at: 2, tasks: [oneTask()], bcomps: [oneComp(MON)] });
    const b2 = boxes(h2.doc, 'data-tid', 't-win');
    ok('в сряда (след прозореца): заключена', b2.all.length > 0 &&
      b2.all.filter(x => x.checked).every(x => x.disabled && !x.getAttribute('data-wcdate')), b2.all.map(state).join(' '));
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
