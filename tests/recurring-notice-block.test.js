/* Постоянна задача „Само за информация" (task_type='notice') в блока
   „Постоянни задачи" на Бюлетина.

   До 11.09.2026 renderRecurringTasks() изхвърляше notice на входа. Там обаче
   е единственият ✏️ за постоянна задача — тоест notice, веднъж записана, не
   можеше да се редактира, спре, изключи за седмица или изтрие от екрана
   (реален случай: „Осчетоводяване на минуси", поправена с ръчен SQL).

   Какво заковава тестът:
     1. админ: notice има ред в блока — сив, без чекбокс, без „Отложи", без
        „(днес!)", с бадж „Инфо" и описанието; бутоните ✏️ / „Не за тази
        седмица" / 🔔 / „⏸ Спри" / ✕ са там (контрола: работната задача има
        чекбокс и „(днес!)");
     2. РЕАЛЕН клик на ✏️ отваря openEditRecurringModal с НЕЙНИТЕ данни, а
        „Запази" праща PATCH с id-то ѝ и task_type=notice;
     3. управител: вижда реда, без нито един бутон и без чекбокс (контрола:
        работната задача има чекбокс и „Отложи");
     4. ▼ на notice реда: moveRecInDept() ползва същия набор като блока —
        иначе idx=-1 и кликът хвърля.

   Броенето (loadTasksStats, отчетите, „Днес") не се пипа тук — там notice се
   филтрира на входа, независимо от блока; виж tests/task-type-notice.test.js.

   ⚠️ Дати: котвата е сряда от текущата реална седмица, замразена на w.Date.

   Пускане: node tests/recurring-notice-block.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, tryClick, ok, guard, section, report, ticks } = H;

/* ── Котва ─────────────────────────────────────────────────────────────── */
const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
  return d;
})();
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

const TR = 'Троян', LO = 'Ловеч';
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const MANAGER = { email: 'm@temax.bg', display_name: 'Управител', role: 'manager', store_name: TR };

const NOTICE_TITLE = 'Осчетоводяване на минуси';
const NOTICE_DESC = 'Сутрин осчетоводяване до 8:30 с дата предходен ден!';

/* „Всеки ден" — без ден от седмицата, с час: дължима и днес, тоест
   работната задача показва „(днес!)" и чекбокс — контролата за notice. */
function rec(id, over) {
  return Object.assign({
    id: id, title: 'Работна ' + id, department: 'admin', task_type: 'info',
    description: null, target_stores: null, due_weekday: null, due_weekdays: null,
    due_time: '20:00', due_window: false, linked_module: null, report_groups: null,
    attachments: null, active: true, sort_order: 0
  }, over || {});
}
const RECS = [
  rec('r-work', { sort_order: 1 }),
  rec('r-notice', { title: NOTICE_TITLE, task_type: 'notice', description: NOTICE_DESC,
    due_time: '08:30', report_groups: ['controlling'], sort_order: 2 }),
  rec('r-work2', { sort_order: 3 })
];

function env(user) {
  const h = boot({
    modules: ['bulletin.js'],
    user: user,
    data: {
      users: [{ store_name: TR }, { store_name: LO }],
      recurring_tasks: RECS.map(r => Object.assign({}, r)),
      recurring_task_skips: [],
      bulletins: () => [h.bul],
      bulletin_tasks: [],
      task_completions: []
    }
  });
  freezeDate(h.w);
  const cal = {};
  h.w.DKEYS.forEach(k => { cal[k] = []; });
  h.bul = { id: 'b-1', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published',
            content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
  h.w.bulActiveDept = 'admin';
  h.w.reportableStoresCache = [TR, LO];
  return h;
}

async function settle(cond, max) {
  for (let i = 0; i < (max || 40); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
function txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
/* Редът в БЛОКА, не в календара — календарът има свой ред за notice. */
function blockRow(doc, id) {
  return Array.prototype.find.call(doc.querySelectorAll('[data-rec-row="' + id + '"]'),
    r => !r.closest('#sec-calendar')) || null;
}
async function loaded(h) {
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return false;
  return settle(() => !!blockRow(h.doc, 'r-work'));
}

(async function () {

  /* ═══ 1. Админ: редът и бутоните ═══════════════════════════════════════ */
  section('1. Админ: notice е в блока — сива, без чекбокс, с ✏️ и останалите бутони');
  const ha = env(ADMIN);
  if (await loaded(ha)) {
    const doc = ha.doc;
    const nr = blockRow(doc, 'r-notice');
    const wr = blockRow(doc, 'r-work');
    if (ok('редът на notice е в блока', !!nr)) {
      ok('без чекбокс', !nr.querySelector('input[type=checkbox]'));
      ok('без „Отложи"', !H.btn(nr, 'Отложи'));
      ok('без „(днес!)"', txt(nr).indexOf('(днес!)') < 0, txt(nr));
      ok('бадж „Инфо"', txt(nr).indexOf('Инфо') >= 0, txt(nr));
      ok('описанието се вижда', txt(nr).indexOf(NOTICE_DESC) >= 0);
      const title = Array.prototype.find.call(nr.querySelectorAll('div'),
        d => d.children.length === 0 && d.textContent === NOTICE_TITLE);
      ok('заглавието е сиво (#94a3b8)', !!title && /color:#94a3b8/.test(title.getAttribute('style') || ''),
        title ? title.getAttribute('style') : 'няма заглавие');
      ok('✏️', !!H.btn(nr, '✏️'));
      ok('„Не за тази седмица"', !!H.btn(nr, 'Не за тази седмица'));
      ok('🔔', !!H.btn(nr, '🔔'));
      ok('„⏸ Спри"', !!H.btn(nr, '⏸ Спри'));
      ok('✕', !!H.btnExact(nr, '✕'));
      ok('▲▼', !!H.btnExact(nr, '▲') && !!H.btnExact(nr, '▼'));
    }
    if (ok('контрола: работната задача е в блока', !!wr)) {
      ok('контрола: тя ИМА чекбокс', !!wr.querySelector('input[type=checkbox]'));
      ok('контрола: тя ИМА „(днес!)"', txt(wr).indexOf('(днес!)') >= 0, txt(wr));
    }
  }

  /* ═══ 2. Реален клик на ✏️ ═════════════════════════════════════════════ */
  section('2. ✏️ → openEditRecurringModal с данните на notice; „Запази" → PATCH');
  {
    const doc = ha.doc, w = ha.w;
    const nr = blockRow(doc, 'r-notice');
    const pen = nr && H.btn(nr, '✏️');
    if (ok('бутонът ✏️ съществува', !!pen)) {
      if (guard('клик на ✏️ не хвърля', () => realClick(w, pen, '✏️'))) {
        const ov = doc.getElementById('edit-rec-ov');
        if (ok('модалът за редакция е отворен', !!ov)) {
          const v = id => (doc.getElementById(id) || {}).value;
          ok('заглавие = нейното', v('erec-title') === NOTICE_TITLE, v('erec-title'));
          ok('описание = нейното', v('erec-desc') === NOTICE_DESC, v('erec-desc'));
          ok('вид = notice', v('erec-type') === 'notice', v('erec-type'));
          ok('час = 08:30', v('erec-time') === '08:30', v('erec-time'));
          ok('отдел = admin', v('erec-dept') === 'admin', v('erec-dept'));

          doc.getElementById('erec-desc').value = 'Нов текст';
          const save = H.btn(ov, 'Запази');
          if (ok('бутонът „Запази" съществува', !!save)) {
            ha.calls.patch.length = 0;
            guard('клик на „Запази" не хвърля', () => realClick(w, save, 'Запази'));
            await settle(() => ha.calls.patch.length > 0);
            const p = ha.calls.patch.filter(x => x.table === 'recurring_tasks');
            if (ok('един PATCH към recurring_tasks', p.length === 1, String(p.length))) {
              ok('по id на notice', p[0].url.indexOf('id=eq.r-notice') >= 0, p[0].url);
              ok('новото описание', p[0].body.description === 'Нов текст', JSON.stringify(p[0].body));
              ok('видът остава notice', p[0].body.task_type === 'notice', String(p[0].body.task_type));
            }
          }
        }
      }
    }
  }

  /* ═══ 3. Управител ═════════════════════════════════════════════════════ */
  section('3. Управител: вижда notice без бутони и без чекбокс');
  {
    const hm = env(MANAGER);
    if (await loaded(hm)) {
      const nr = blockRow(hm.doc, 'r-notice');
      const wr = blockRow(hm.doc, 'r-work');
      if (ok('редът на notice е в блока', !!nr)) {
        ok('без чекбокс', !nr.querySelector('input[type=checkbox]'));
        ok('нула бутона в реда', nr.querySelectorAll('button').length === 0,
          Array.prototype.map.call(nr.querySelectorAll('button'), b => b.textContent).join(' | '));
        ok('без кликаем бадж', nr.innerHTML.indexOf('taskTypeBadgeClick') < 0);
        ok('описанието се вижда', txt(nr).indexOf(NOTICE_DESC) >= 0);
      }
      if (ok('контрола: работната задача е в блока', !!wr)) {
        ok('контрола: тя ИМА чекбокс', !!wr.querySelector('input[type=checkbox]'));
        ok('контрола: тя ИМА „Отложи"', !!H.btn(wr, 'Отложи'));
      }
    }
  }

  /* ═══ 4. ▼ на notice: подреждането вижда същия набор като блока ═════════ */
  section('4. ▼ на notice → moveRecInDept не хвърля и преномерира тримата');
  {
    const h = env(ADMIN);
    if (await loaded(h)) {
      const nr = blockRow(h.doc, 'r-notice');
      const down = nr && H.btnExact(nr, '▼');
      if (ok('▼ съществува и е активен', !!down && !down.disabled)) {
        h.calls.patch.length = 0;
        const err = tryClick(h.w, down, '▼');
        ok('кликът не хвърля', err === null, err && err.message);
        await ticks();
        const p = h.calls.patch.filter(x => x.table === 'recurring_tasks');
        const order = {};
        p.forEach(x => { const m = /id=eq\.([^&]+)/.exec(x.url); if (m) order[m[1]] = x.body.sort_order; });
        ok('три PATCH-а (целият отдел)', p.length === 3, JSON.stringify(order));
        ok('notice слиза под r-work2', order['r-work'] === 1 && order['r-work2'] === 2 && order['r-notice'] === 3,
          JSON.stringify(order));
      }
    }
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
