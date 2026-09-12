/* Отлагане с точна дата (task_completions.postponed_to) — Бюлетин.

   Досега „⏱ Отложи" записваше ред без „за кога" и задачата изчезваше до
   края на света. Сега редът носи postponed_to и задачата се ПОЯВЯВА пак на
   този ден. Едно явяване има два края:
     · първоначалният ден — ред със значка „⏱ Отложена → дд.мм", без чекбокс;
     · новият ден — пренесено явяване с чекбокс, отключен само в самия ден.
   Отмятането пише в ПЪРВОНАЧАЛНИЯ ред (completion_date не се мени).

   Какво заковава тестът:
     1. shared.js: taskDueDateFor / taskIsMovedAway (вкл. стар ред без дата);
     2. модалът: задължително поле за дата, стойност УТРЕ, min/max; submit
        отказва празна и извън границите, а при успех праща postponed_to;
     3. първоначалният ден: значка със стрелката и датата;
     4. новият ден: отделен ред в календара, чекбокс отключен САМО днес;
     5. отмятане на пренесен ред → PATCH по ПЪРВОНАЧАЛНАТА дата, без POST;
     6. слят ред (задачата и без това е дължима в новия ден) → ЕДИН ред и
        ДВА записа при отмятане (свой за деня + първоначалния);
     7. второ отлагане не се предлага;
     8. глобалният брояч: пренеслият обект излиза от знаменателя на стария
        ден и се явява със свой ред на новия;
     9. пренесена от ДРУГ бюлетин: отделна заявка за задачата + ред в блока.

   ⚠️ Дати: котвата е сряда от текущата реална седмица, замразена на w.Date.
   Понеделник/вторник/четвъртък се смятат независимо от кода под тест.

   Пускане: node tests/postpone-date.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick, fire, btn } = H;

/* ── Котва: сряда 12:00 от текущата седмица ─────────────────────────────── */
const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
  return d;
})();
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
const MON = isoOf(shifted(-2));
const TUE = isoOf(shifted(-1));
const WED = isoOf(shifted(0));          /* ДНЕС */
const THU = isoOf(shifted(1));
const SUN_NEXT = isoOf(shifted(11));    /* неделята на следващата седмица */
const MON_NEXT = isoOf(shifted(5));
const THU_PREV = isoOf(shifted(-6));    /* четвъртък от миналата седмица */
const dm = iso => iso.slice(8, 10) + '.' + iso.slice(5, 7);

const TR = 'Троян';
const PT = 'Петрич';
const STORE_USER = { email: 's@temax.bg', display_name: 'Обект', role: 'store', store_name: TR };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

/* ── Данни ──────────────────────────────────────────────────────────────── */
function task(id, over) {
  return Object.assign({
    id: id, bulletin_id: 'b-cur', title: 'Задача ' + id, department: 'trade',
    description: null, due_date: null, due_dates: null, task_type: 'info',
    target_stores: null, linked_module: null, attachments: null, sort_order: 1
  }, over || {});
}
function rec(id, over) {
  return Object.assign({
    id: id, title: 'Постоянна ' + id, department: 'trade', task_type: 'info',
    description: null, target_stores: null, due_weekday: null, due_weekdays: [0, 2],
    due_time: '10:00', due_window: false, linked_module: null, report_groups: null,
    attachments: null, active: true, sort_order: 1
  }, over || {});
}

const TASKS = [
  task('t-mon', { title: 'Инвентаризация', due_dates: [MON] }),
  task('t-wed', { title: 'Зареждане рафтове', due_dates: [WED] })
];
const TASK_OLD = task('t-old', { bulletin_id: 'b-prev', title: 'Стара от миналата седмица', due_dates: [THU_PREV] });
const RECS = [rec('r-mw', { title: 'Проверка цени' })];
const PERIODS = [{ id: 'p1', recurring_task_id: 'r-mw', from_monday: isoOf(shifted(-30)), to_monday: null }];

/* Пренесените редове. И трите носят postponed_to — точно това, което ги
   прави видими на нов ден. */
function carriedRows() {
  return [
    { id: 'c-mon', task_id: 't-mon', recurring_task_id: null, store_name: TR, status: 'postponed',
      completion_date: MON, postponed_to: WED, comment: 'нямаше стока', completed_by: 'Обект' },
    { id: 'c-rec', task_id: null, recurring_task_id: 'r-mw', store_name: TR, status: 'postponed',
      completion_date: MON, postponed_to: WED, comment: 'ремонт', completed_by: 'Обект' },
    { id: 'c-old', task_id: 't-old', recurring_task_id: null, store_name: TR, status: 'postponed',
      completion_date: THU_PREV, postponed_to: TUE, comment: 'от миналата седмица', completed_by: 'Обект' },
    /* Чужд обект — за глобалния изглед и за да не се лепне за Троян. */
    { id: 'c-pt', task_id: 't-wed', recurring_task_id: null, store_name: PT, status: 'postponed',
      completion_date: WED, postponed_to: THU, comment: 'петричко', completed_by: 'Петрич' }
  ];
}

/* Фалшивият PostgREST прилага филтрите, които кодът праща — иначе заявка без
   postponed_to би върнала същото и мутация „махни филтъра" не би паднала. */
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

function bulOf(w, id, dayInWeek) {
  const d = shifted(dayInWeek);
  const cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });
  return { id: id, week_number: w.weekNum(d), year: isoWeekYear(d), status: 'published', created_at: isoOf(d),
           content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
}

function env(opts) {
  opts = opts || {};
  const rows = opts.comps || carriedRows();
  const h = boot({
    modules: ['bulletin.js'],
    user: opts.user || STORE_USER,
    data: {
      users: [{ store_name: TR }, { store_name: PT }],
      recurring_tasks: url => { const m = /[?&]active=eq\.(true|false)/.exec(url);
        return RECS.filter(r => !m || String(!!r.active) === m[1]); },
      recurring_task_periods: PERIODS,
      recurring_task_skips: [],
      bulletins: url => { const m = /[?&]id=eq\.([^&]+)/.exec(url); return m ? h.buls.filter(b => b.id === m[1]) : h.buls; },
      bulletin_tasks: url => {
        const mb = /bulletin_id=eq\.([^&]+)/.exec(url);
        if (mb) return TASKS.concat([TASK_OLD]).filter(t => t.bulletin_id === mb[1]);
        const mi = /[?&]id=in\.\(([^)]*)\)/.exec(url);
        if (mi) { const ids = mi[1].split(','); return TASKS.concat([TASK_OLD]).filter(t => ids.indexOf(String(t.id)) >= 0); }
        return TASKS;
      },
      task_completions: tcRoute(rows),
      subtask_completions: [],
      task_subtasks: []
    }
  });
  freezeDate(h.w);
  h.buls = [bulOf(h.w, 'b-prev', -7), bulOf(h.w, 'b-cur', 0)];
  h.w.bulSelectedId = 'b-cur';
  h.w.bulActiveDept = 'trade';
  h.w.reportableStoresCache = [TR, PT];
  return h;
}

async function settle(cond, max) {
  for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const cal = doc => doc.getElementById('sec-calendar');
async function loaded(h) {
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return false;
  return settle(() => !!cal(h.doc) && h.doc.querySelectorAll('input[type=checkbox]').length > 0);
}
/* Клетката на един ден в календара — по датата, изписана горе вдясно. */
function dayCell(doc, iso) {
  const d = new Date(iso + 'T00:00:00');
  const label = d.getDate() + '.' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1);
  return Array.prototype.find.call((cal(doc) || doc).querySelectorAll('div'), el => {
    const k = el.querySelector(':scope > div:nth-child(2)');
    return k && txt(k) === label && el.style.borderRadius === '8px';
  }) || null;
}
const carriedBoxes = root => Array.prototype.filter.call(
  (root || {}).querySelectorAll ? root.querySelectorAll('input[type=checkbox]') : [],
  cb => cb.getAttribute('onchange') === 'bulCarriedCheckboxChanged(this)');

(async function () {

  /* ═══ 1. shared.js ═════════════════════════════════════════════════════ */
  section('1. taskDueDateFor / taskIsMovedAway');
  {
    const h = env();
    const w = h.w;
    ok('без ред → първоначалният срок', w.taskDueDateFor(MON, null) === MON, w.taskDueDateFor(MON, null));
    ok('ред с postponed_to → новата дата',
      w.taskDueDateFor(MON, { status: 'postponed', postponed_to: WED }) === WED);
    ok('вече отметнат пренесен ред → пак новата дата (за „със закъснение")',
      w.taskDueDateFor(MON, { status: 'done', postponed_to: WED }) === WED);
    ok('СТАР отложен ред без дата → първоначалният срок',
      w.taskDueDateFor(MON, { status: 'postponed', postponed_to: null }) === MON);
    ok('timestamp се реже до 10 знака',
      w.taskDueDateFor(MON, { postponed_to: WED + 'T00:00:00' }) === WED);
    ok('няма срок и няма отлагане → null', w.taskDueDateFor(null, null) === null);
    ok('taskIsMovedAway: само при дата',
      w.taskIsMovedAway({ status: 'postponed', postponed_to: WED }) === true &&
      w.taskIsMovedAway({ status: 'postponed', postponed_to: null }) === false &&
      w.taskIsMovedAway(null) === false);
  }

  /* ═══ 2. Модалът ═══════════════════════════════════════════════════════ */
  section('2. Модал: задължителна дата с граници');
  {
    const h = env({ comps: [] });
    const w = h.w, doc = h.doc;
    if (await loaded(h)) {
      guard('openPostponeModal() не хвърля', () => w.openPostponeModal('t-wed', 'regular', WED));
      const inp = doc.getElementById('pp-date');
      ok('модалът има поле за дата', !!inp && inp.type === 'date');
      if (inp) {
        ok('стойността по подразбиране е УТРЕ', inp.value === THU, inp.value);
        ok('min = утре (не днес)', inp.getAttribute('min') === THU, inp.getAttribute('min'));
        ok('max = неделята на СЛЕДВАЩАТА седмица', inp.getAttribute('max') === SUN_NEXT, inp.getAttribute('max'));
      }
      /* Празна дата → отказ, нищо не се праща. */
      h.calls.post.length = 0; h.calls.patch.length = 0; h.calls.toast.length = 0;
      doc.getElementById('pp-comment').value = 'причина';
      if (inp) inp.value = '';
      guard('submit с празна дата не хвърля', () => w.submitPostpone('t-wed', 'regular', WED));
      await ticks();
      ok('празна дата → нито POST, нито PATCH', h.calls.post.length === 0 && h.calls.patch.length === 0,
        JSON.stringify(h.calls.post.concat(h.calls.patch)));
      ok('празна дата → съобщение', h.calls.toast.join('|').indexOf('за кога') >= 0, h.calls.toast.join('|'));
      /* Твърде далеч → отказ. */
      h.calls.toast.length = 0;
      if (inp) inp.value = isoOf(shifted(20));
      guard('submit с далечна дата не хвърля', () => w.submitPostpone('t-wed', 'regular', WED));
      await ticks();
      ok('дата след неделя на следващата седмица → отказ',
        h.calls.post.length === 0 && h.calls.patch.length === 0);
      ok('далечна дата → съобщение с границата', h.calls.toast.join('|').indexOf(dm(SUN_NEXT)) >= 0, h.calls.toast.join('|'));
      /* Вчерашна дата → отказ (долната граница). */
      h.calls.toast.length = 0;
      if (inp) inp.value = TUE;
      guard('submit с минала дата не хвърля', () => w.submitPostpone('t-wed', 'regular', WED));
      await ticks();
      ok('дата преди утре → отказ', h.calls.post.length === 0 && h.calls.patch.length === 0);
      /* Валидна дата → POST с postponed_to. */
      h.calls.toast.length = 0;
      if (inp) inp.value = THU;
      guard('submit с валидна дата не хвърля', () => w.submitPostpone('t-wed', 'regular', WED));
      await settle(() => h.calls.post.length > 0 || h.calls.patch.length > 0);
      const wrote = h.calls.post.concat(h.calls.patch).filter(r => r.table === 'task_completions');
      ok('валидна дата → има запис', wrote.length > 0, JSON.stringify(h.calls.post));
      if (wrote.length) {
        const b = wrote[0].body;
        const row = Array.isArray(b) ? b[0] : b;
        ok('записва postponed_to = избраната дата', row.postponed_to === THU, JSON.stringify(row));
        ok('completion_date остава ПЪРВОНАЧАЛНИЯТ срок', row.completion_date === WED, JSON.stringify(row));
        ok('статусът е postponed', row.status === 'postponed');
      }
      /* Задача със срок НАПРЕД: долната граница е денят СЛЕД срока — иначе
         postponed_to_after_chk връща 400. */
      const bnd = w.bulPostponeBounds(MON_NEXT);
      ok('срок напред → min е денят след него', bnd.lo === isoOf(shifted(6)), bnd.lo);
      ok('срок напред → max не е под min', bnd.hi >= bnd.lo, bnd.hi);
    }
  }

  /* ═══ 3. Първоначалният ден ════════════════════════════════════════════ */
  section('3. Значка „⏱ Отложена → дд.мм" на първоначалния ден');
  {
    const h = env();
    const doc = h.doc;
    if (await loaded(h)) {
      const body = txt(doc.getElementById('mod-bulletin'));
      ok('значката носи новата дата', body.indexOf('⏱ Отложена → ' + dm(WED)) >= 0,
        body.slice(0, 400));
      ok('значката НЕ е гола „Отложена"',
        body.indexOf('⏱ Отложена <') < 0 && /⏱ Отложена(?! →)/.test(body) === false, body.slice(0, 200));
    }
  }

  /* ═══ 4. Новият ден ════════════════════════════════════════════════════ */
  section('4. Пренесеното явяване се вижда на новия ден');
  {
    const h = env();
    const doc = h.doc;
    if (await loaded(h)) {
      const wed = dayCell(doc, WED);
      ok('сряда има клетка в календара', !!wed);
      if (wed) {
        const t = txt(wed);
        ok('„Инвентаризация" (от понеделник) е в СРЯДА', t.indexOf('Инвентаризация') >= 0, t);
        ok('редът казва откъде е пренесена', t.indexOf('⏱ от ' + dm(MON)) >= 0, t);
        const boxes = carriedBoxes(wed);
        ok('има чекбокс за пренесеното', boxes.length > 0, String(boxes.length));
        if (boxes.length) {
          ok('чекбоксът е ОТКЛЮЧЕН — новият ден е днес', !boxes[0].disabled);
          ok('носи ПЪРВОНАЧАЛНАТА дата за записа', boxes[0].dataset.orig === MON, boxes[0].dataset.orig);
        }
      }
      /* Вторник: пренесената от миналата седмица — денят е минал, заключено. */
      const tue = dayCell(doc, TUE);
      if (ok('вторник има клетка', !!tue)) {
        const boxes = carriedBoxes(tue);
        ok('пренесената за вторник е там', txt(tue).indexOf('Стара от миналата седмица') >= 0, txt(tue));
        ok('чекбоксът ѝ е ЗАКЛЮЧЕН (денят е приключил)', boxes.length > 0 && boxes[0].disabled,
          boxes.length ? 'disabled=' + boxes[0].disabled : 'няма чекбокс');
      }
      /* Понеделник: първоначалният ден няма пренесен ред. */
      const mon = dayCell(doc, MON);
      if (mon) ok('понеделник няма „⏱ от" ред', txt(mon).indexOf('⏱ от') < 0, txt(mon));
    }
  }

  /* ═══ 5. Отмятане на пренесен ред ══════════════════════════════════════ */
  section('5. Отмятането пише в ПЪРВОНАЧАЛНИЯ ред');
  {
    const h = env();
    const doc = h.doc, w = h.w;
    if (await loaded(h)) {
      const wed = dayCell(doc, WED);
      const box = carriedBoxes(wed).find(cb => cb.dataset.tid === 't-mon');
      if (ok('намерен е чекбоксът на пренесената задача', !!box)) {
        h.calls.post.length = 0; h.calls.patch.length = 0;
        box.checked = true;
        fire(w, box, 'change');
        await settle(() => h.calls.patch.length > 0);
        ok('прави PATCH, не POST', h.calls.patch.length === 1 && h.calls.post.length === 0,
          'patch=' + h.calls.patch.length + ' post=' + h.calls.post.length);
        if (h.calls.patch.length) {
          const p = h.calls.patch[0];
          ok('PATCH-ът е по ПЪРВОНАЧАЛНАТА дата', p.url.indexOf('completion_date=eq.' + MON) >= 0, p.url);
          ok('PATCH-ът е по задачата и обекта',
            p.url.indexOf('task_id=eq.t-mon') >= 0 && p.url.indexOf(encodeURIComponent(TR)) >= 0, p.url);
          ok('статусът става done', p.body.status === 'done', JSON.stringify(p.body));
          ok('completion_date НЕ се пренаписва', p.body.completion_date === undefined, JSON.stringify(p.body));
          ok('postponed_to НЕ се изтрива', p.body.postponed_to === undefined, JSON.stringify(p.body));
        }
        /* Разотмятане → обратно 'postponed'. */
        h.calls.patch.length = 0;
        const box2 = carriedBoxes(dayCell(doc, WED)).find(cb => cb.dataset.tid === 't-mon');
        if (box2) {
          box2.checked = false;
          fire(w, box2, 'change');
          await settle(() => h.calls.patch.length > 0);
          ok('разотмятането връща postponed',
            h.calls.patch.length === 1 && h.calls.patch[0].body.status === 'postponed',
            JSON.stringify(h.calls.patch.map(p => p.body)));
          ok('разотмятането не трие ред', h.calls.del.length === 0, JSON.stringify(h.calls.del));
        }
      }
    }
  }

  /* ═══ 6. Слят ред ══════════════════════════════════════════════════════ */
  section('6. Слят ред: едно явяване на екрана, два записа в базата');
  {
    const h = env();
    const doc = h.doc, w = h.w;
    if (await loaded(h)) {
      const wed = dayCell(doc, WED);
      const t = txt(wed);
      const recBoxes = Array.prototype.filter.call(wed.querySelectorAll('input[type=checkbox]'),
        cb => cb.dataset.rtid === 'r-mw');
      ok('постоянната задача е с ЕДИН ред в сряда (не два)', recBoxes.length === 1, String(recBoxes.length));
      ok('редът носи значка „+ от"', t.indexOf('⏱ + от ' + dm(MON)) >= 0, t);
      ok('няма самостоятелен пренесен ред за нея',
        carriedBoxes(wed).filter(cb => cb.dataset.tid === 'r-mw').length === 0);
      if (recBoxes.length === 1) {
        h.calls.post.length = 0; h.calls.patch.length = 0;
        recBoxes[0].checked = true;
        fire(w, recBoxes[0], 'change');
        await settle(() => h.calls.patch.length > 0 && (h.calls.post.length > 0 || h.calls.patch.length > 1));
        const forNew = h.calls.post.concat(h.calls.patch).filter(r =>
          (r.body && r.body.completion_date === WED) || String(r.url).indexOf('completion_date=eq.' + WED) >= 0);
        const forOld = h.calls.patch.filter(r => String(r.url).indexOf('completion_date=eq.' + MON) >= 0);
        ok('пише ред за НОВИЯ ден', forNew.length > 0, JSON.stringify(h.calls.post.concat(h.calls.patch).map(r => r.url)));
        ok('пише и в ПЪРВОНАЧАЛНИЯ ред', forOld.length === 1, JSON.stringify(h.calls.patch.map(r => r.url)));
        if (forOld.length) ok('първоначалният става done', forOld[0].body.status === 'done', JSON.stringify(forOld[0].body));
      }
    }
  }

  /* ═══ 7. Второ отлагане ════════════════════════════════════════════════ */
  section('7. Пренесеното не се отлага втори път');
  {
    const h = env();
    const doc = h.doc;
    if (await loaded(h)) {
      const wed = dayCell(doc, WED);
      ok('в клетката на новия ден няма бутон „Отложи"', !btn(wed, 'Отложи'), txt(wed).slice(0, 200));
      /* На първоначалния ден стои „↩ Отмени", не „⏱ Отложи". */
      const block = doc.getElementById('dept-panel-trade');
      ok('на първоначалния ред има „Отмени"', !!btn(block, 'Отмени'));
      const offer = Array.prototype.filter.call(block.querySelectorAll('button'),
        b => txt(b).indexOf('Отложи') >= 0 && b.getAttribute('data-task-id') === 't-mon');
      ok('за вече отложената няма втори бутон „Отложи"', offer.length === 0, String(offer.length));
    }
  }

  /* ═══ 8. Глобален изглед ═══════════════════════════════════════════════ */
  section('8. Офисът: пренеслият обект излиза от знаменателя на стария ден');
  {
    const h = env({ user: ADMIN });
    const doc = h.doc;
    if (await loaded(h)) {
      const wed = dayCell(doc, WED);
      const t = txt(wed);
      /* „Зареждане рафтове" е за сряда; Петрич я е пренесъл за четвъртък,
         значи знаменателят ѝ в сряда е 1 обект, не 2. */
      /* Броячът СЛЕД самото заглавие — в клетката има и други задачи с
         легитимно /2, затова търсенето е закотвено за заглавието. */
      const cnt = /Зарежданерафтове(\d+\/\d+)/.exec(t.replace(/\s+/g, ''));
      ok('броячът на пренесената в сряда е 0/1 (Петрич е извън знаменателя)',
        !!cnt && cnt[1] === '0/1', cnt ? cnt[1] : t);
      const thu = dayCell(doc, THU);
      ok('в четвъртък се явява със свой ред', txt(thu).indexOf('Зареждане рафтове') >= 0, txt(thu));
      ok('редът казва кой обект е', txt(thu).indexOf(PT) >= 0, txt(thu));
      ok('редът си има собствен брояч 0/1', txt(thu).indexOf('0/1') >= 0, txt(thu));
    }
  }

  /* ═══ 9. Пренесена от ДРУГ бюлетин ═════════════════════════════════════ */
  section('9. Отложена от миналата седмица');
  {
    const h = env();
    const doc = h.doc;
    if (await loaded(h)) {
      await settle(() => txt(doc.getElementById('mod-bulletin')).indexOf('Стара от миналата седмица') >= 0);
      const carriedQ = h.calls.get.filter(u => /task_completions/.test(u) && /postponed_to=gte\./.test(u));
      ok('има отделна заявка по postponed_to за седмицата', carriedQ.length === 1, JSON.stringify(carriedQ));
      if (carriedQ.length) {
        ok('заявката е ограничена до седмицата',
          carriedQ[0].indexOf('postponed_to=gte.' + MON) >= 0 && carriedQ[0].indexOf('postponed_to=lte.' + isoOf(shifted(4))) >= 0,
          carriedQ[0]);
        ok('и до обекта (не глобално)', carriedQ[0].indexOf('store_name=eq.' + encodeURIComponent(TR)) >= 0, carriedQ[0]);
      }
      const byId = h.calls.get.filter(u => /bulletin_tasks/.test(u) && /id=in\./.test(u));
      ok('задачата от чуждия бюлетин се дотегля по id', byId.length === 1, JSON.stringify(byId));
      const block = doc.getElementById('dept-panel-trade');
      ok('появява се в блока по отдел', txt(block).indexOf('Стара от миналата седмица') >= 0, txt(block).slice(0, 300));
      ok('в собствена секция „Пренесени"', txt(block).indexOf('Пренесени за тази седмица') >= 0);
    }
  }

  report();
})();
