/* „За връщане" по source (07.10.2026): две автоматични задачи вместо една.

   ТВЪРДЕНИЯТА:
   · linked_module 'stock-returns-complaint' / 'stock-returns-diff' са автоматични
     (заключен чекбокс, сив надпис), всяка със СВОЙ брояч по stock_returns.source;
   · бутонът „За връщане →" води към таба stock-returns и при двете;
   · старата стойност 'stock-returns' НЕ е автоматична и не се предлага никъде
     (не остава като „чист бутон");
   · „Срок на годност" (без linked_module) е РЪЧНА: отключен чекбокс, има
     „Отложи" и „Не се отнася", без бутон и без надпис.

   Пускане: node tests/stock-returns-per-source.test.js . */

'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick } = H;

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
const D = n => isoOf(shifted(-2 + n));
const MON = D(0), TUE = D(1), WED = D(2);

const STORE = 'Троян';
const USER = { email: 't@temax.bg', display_name: 'Иван', role: 'store', store_name: STORE };

/* Постоянната задача „СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ" — сряда 20:00, както е в
   базата след прилагане на версията за седмицата (task_type: info). */
function retTask(over) {
  return Object.assign({
    id: 'r-ret', title: 'СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ', department: 'admin',
    task_type: 'info', active: true, sort_order: 1,
    due_weekday: 2, due_weekdays: [2], due_time: '20:00', due_window: false,
    target_stores: null, report_groups: ['controlling'], linked_module: 'stock-returns-complaint'
  }, over || {});
}
function manualTask(over) {
  return Object.assign({
    id: 'r-man', title: 'Ръчна постоянна', department: 'admin',
    task_type: 'info', active: true, sort_order: 2,
    due_weekday: 2, due_weekdays: [2], due_time: null, due_window: false,
    target_stores: null, report_groups: null, linked_module: null
  }, over || {});
}
function ret(id, over) {
  return Object.assign({
    id: id, store_name: STORE, status: 'pending', confirmed_date: null, confirmed_by: null,
    source: 'complaint', product_name: 'Стока ' + id, sap_code: '1', quantity: 1
  }, over || {});
}
function env(recs, returns) {
  const h = boot({
    modules: ['bulletin.js', 'today.js', 'report.js'],
    user: USER,
    data: {
      users: [{ store_name: STORE }], stores: [{ name: STORE }],
      recurring_tasks: recs || [retTask()],
      recurring_task_periods: [], recurring_task_skips: [], recurring_task_versions: [],
      bulletins: () => [{
        id: 'b-1', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR),
        status: 'published', created_at: MON,
        content: { calendar: (function () { const c = {}; h.w.DKEYS.forEach(k => { c[k] = []; }); return c; })(),
                   columns: { trade: [], warehouse: [], admin: [] } }
      }],
      bulletin_tasks: [], task_completions: [],
      stock_returns: () => (returns || []),
      goods_transit: [], bulletin_promotions: [], task_subtasks: [],
      subtask_completions: [], notification_schedules: [], report_snapshots: []
    }
  });
  freezeDate(h.w);
  h.w.bulSelectedId = 'b-1';
  h.w.bulActiveDept = 'admin';
  h.w.reportableStoresCache = [STORE];
  h.w.allStoresCache = [STORE];
  return h;
}
async function settle(cond, max) { for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); } return cond(); }
async function view(recs, returns) {
  const h = env(recs, returns);
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return null;
  await settle(() => !!h.doc.getElementById('sec-calendar'));
  return h;
}
const panel = h => h.doc.getElementById('dept-panel-admin');
const btnIn = (el, text) => Array.prototype.slice.call((el || { querySelectorAll: () => [] }).querySelectorAll('button'))
  .find(b => (b.textContent || '').indexOf(text) >= 0) || null;
const noteOf = (h, cls) => {
  const el = (panel(h) || h.doc).querySelector('.' + cls);
  return el ? (el.textContent || '').trim() : null;
};

const compTask = over => retTask(Object.assign({ id: 'r-c', title: 'СПИСЪК СТОКА ЗА ВРЪЩАНЕ', linked_module: 'stock-returns-complaint' }, over || {}));
const diffTask = over => retTask(Object.assign({ id: 'r-d', title: 'СПИСЪК СТОКА ЗА ИЗТЕГЛЯНЕ ПО РАЗЛИКИ', linked_module: 'stock-returns-diff' }, over || {}));
const expTask  = over => retTask(Object.assign({ id: 'r-e', title: 'СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ', linked_module: null }, over || {}));
const cbOf = (h, id) => panel(h).querySelector('input[data-rtid="' + id + '"]');
const rowNote = (h, id) => { const cb = cbOf(h, id); const n = cb && cb.parentNode && cb.parentNode.querySelector('.bul-auto-note'); return n ? n.textContent.trim() : null; };
const modBtns = h => Array.prototype.slice.call(h.doc.querySelectorAll('button[data-mod]'));

(async function () {

  section('1. Регистърът: двата ключа са автоматични, старият — не');
  {
    const w = env().w;
    ok('complaint е заключена', w.bulAutoLocked('stock-returns-complaint') === true);
    ok('diff е заключена', w.bulAutoLocked('stock-returns-diff') === true);
    ok('СТАРАТА стойност stock-returns НЕ е заключена', w.bulAutoLocked('stock-returns') === false);
    ok('и няма запис в регистъра', !('stock-returns' in w.BUL_AUTO_MODULES));
    ok('празният ключ (Срок на годност) не е заключен', w.bulAutoLocked('') === false);
    ok('и двата ползват един и същи етикет',
      w.bulLockLabel('auto-returns') === 'Отмята се автоматично от „За връщане"', w.bulLockLabel('auto-returns'));
    ok('причината на diff е своя, но етикетът е същият',
      w.bulLockReason(WED, 'stock-returns-diff') === 'auto-returns-diff' &&
      w.bulLockLabel('auto-returns-diff') === w.bulLockLabel('auto-returns'), String(w.bulLockReason(WED, 'stock-returns-diff')));
  }

  section('2. Падащият списък: двете нови, без старата („чист бутон")');
  {
    const w = env().w;
    const html = w.linkedModuleOptsHtml('');
    ok('има stock-returns-complaint', html.indexOf('value="stock-returns-complaint"') >= 0);
    ok('има stock-returns-diff', html.indexOf('value="stock-returns-diff"') >= 0);
    ok('СТАРАТА value="stock-returns" я НЯМА', html.indexOf('value="stock-returns"') < 0, html);
    ok('етикет за complaint', w.linkedModuleLabel('stock-returns-complaint') === '📥 За връщане: рекламации', String(w.linkedModuleLabel('stock-returns-complaint')));
    ok('етикет за diff', w.linkedModuleLabel('stock-returns-diff') === '📥 За връщане: разлики', String(w.linkedModuleLabel('stock-returns-diff')));
    ok('старата няма етикет', w.linkedModuleLabel('stock-returns') === null);
    ok('linkedModuleTab: и двете → таба stock-returns',
      w.linkedModuleTab('stock-returns-complaint') === 'stock-returns' && w.linkedModuleTab('stock-returns-diff') === 'stock-returns');
    ok('linkedModuleTab: другите модули непроменени',
      w.linkedModuleTab('kasa') === 'kasa' && w.linkedModuleTab('stock-diff') === 'stock-diff' && w.linkedModuleTab('') === '');
  }

  section('3. Екранът: трите задачи — две автоматични, „Срок на годност" ръчна');
  {
    const h = await view([compTask(), diffTask(), expTask({ sort_order: 3 })],
      [ret('c1'), ret('c2'), ret('d1', { source: 'diff' })]);
    if (!h) return report();
    await settle(() => typeof h.w.bulAutoPending['stock-returns-complaint'] === 'number' &&
                       typeof h.w.bulAutoPending['stock-returns-diff'] === 'number', 80);
    ok('complaint: чекбоксът е заключен', !!cbOf(h, 'r-c') && cbOf(h, 'r-c').disabled === true);
    ok('diff: чекбоксът е заключен', !!cbOf(h, 'r-d') && cbOf(h, 'r-d').disabled === true);
    const ce = cbOf(h, 'r-e');
    ok('„Срок на годност": чекбоксът ИМА и е ОТКЛЮЧЕН (ръчна)', !!ce && ce.disabled === false);
    ok('„Срок на годност": няма сив надпис', rowNote(h, 'r-e') === null, String(rowNote(h, 'r-e')));
    ok('complaint брои САМО своите (2)', rowNote(h, 'r-c') === '⏳ 2 записа без актуализация от понеделник', String(rowNote(h, 'r-c')));
    ok('diff брои САМО своите (1)', rowNote(h, 'r-d') === '⏳ 1 запис без актуализация от понеделник', String(rowNote(h, 'r-d')));
    const bt = Array.prototype.slice.call(panel(h).querySelectorAll('button'))
      .filter(b => (b.textContent || '').indexOf('⏱ Отложи') >= 0).map(b => b.getAttribute('data-task-id'));
    ok('„Отложи" е само за ръчната', bt.length === 1 && bt[0] === 'r-e', bt.join(','));
    ok('„🚫 Не се отнася" я има САМО за ръчната',
      h.w.bulNaBtnHtml('recurring', { id: 'r-e', task_type: 'info', linked_module: null }, WED, null).indexOf('🚫') >= 0 &&
      h.w.bulNaBtnHtml('recurring', { id: 'r-c', task_type: 'info', linked_module: 'stock-returns-complaint' }, WED, null) === '' &&
      h.w.bulNaBtnHtml('recurring', { id: 'r-d', task_type: 'info', linked_module: 'stock-returns-diff' }, WED, null) === '');
    /* Заявките са по source — не теглим чуждите редове само за да ги изхвърлим. */
    const q = h.calls.get.filter(u => u.indexOf('/stock_returns') >= 0);
    ok('има заявка с source=eq.complaint', q.some(u => u.indexOf('source=eq.complaint') >= 0), q.join('\n'));
    ok('има заявка с source=eq.diff', q.some(u => u.indexOf('source=eq.diff') >= 0), q.join('\n'));
  }

  section('4. Бутонът „За връщане →": и при двете нови стойности, не при ръчната');
  {
    const h = await view([compTask(), diffTask(), expTask({ sort_order: 3 })], []);
    if (!h) return report();
    const btns = modBtns(h);
    ok('двата бутона водят към stock-returns',
      btns.length >= 2 && btns.every(b => b.getAttribute('data-mod') === 'stock-returns'),
      btns.map(b => b.getAttribute('data-mod')).join(','));
    ok('нито един не носи „null" и и двата казват „За връщане"',
      btns.every(b => (b.textContent || '').indexOf('null') < 0 && (b.textContent || '').indexOf('За връщане') >= 0),
      btns.map(b => b.textContent).join(' | '));
    const re = cbOf(h, 'r-e');
    ok('„Срок на годност" е вързана само през своята отметка', !!re);
    const seen = [];
    h.w.showModule = function (m) { seen.push(m); };
    const byTask = btns.filter(b => /рекламации/.test(b.textContent)).concat(btns.filter(b => /разлики/.test(b.textContent)));
    ok('има бутон и за двете задачи', byTask.length >= 2 && /рекламации/.test(byTask[0].textContent) && /разлики/.test(byTask[byTask.length - 1].textContent), btns.map(b => b.textContent).join(' | '));
    realClick(h.w, byTask[0], 'За връщане: рекламации →');
    realClick(h.w, byTask[byTask.length - 1], 'За връщане: разлики →');
    ok('РЕАЛЕН клик: showModule("stock-returns") два пъти',
      seen.length === 2 && seen[0] === 'stock-returns' && seen[1] === 'stock-returns', JSON.stringify(seen));
  }

  section('5. Стара стойност (останала в данните) — ръчна, без надпис, без заявка');
  {
    const h = await view([compTask({ id: 'r-old', linked_module: 'stock-returns' })], [ret('x')]);
    if (!h) return report();
    await ticks(); await ticks();
    const cb = cbOf(h, 'r-old');
    ok('чекбоксът е отключен', !!cb && cb.disabled === false);
    ok('няма брояч и заявка към stock_returns',
      h.calls.get.filter(u => u.indexOf('/stock_returns') >= 0).length === 0);
    ok('няма бутон с null/стара стойност', modBtns(h).length === 0, modBtns(h).map(b => b.outerHTML).join('\n'));
  }

  section('6. Само едната задача е вързана → заявка само за нейния source');
  {
    const h = await view([diffTask()], [ret('d1', { source: 'diff' })]);
    if (!h) return report();
    await settle(() => typeof h.w.bulAutoPending['stock-returns-diff'] === 'number', 80);
    const q = h.calls.get.filter(u => u.indexOf('/stock_returns') >= 0);
    ok('заявките са САМО за diff (повече от една е нормално — две места викат bulLoadReturnsPending)', q.length >= 1 && q.every(u => u.indexOf('source=eq.diff') >= 0), q.join(' '));
    ok('брояч на complaint остава незареден',
      h.w.bulAutoPending['stock-returns-complaint'] === null || h.w.bulAutoPending['stock-returns-complaint'] === undefined);
  }

  section('7. Офис (isGlobal): заявки няма');
  {
    const h = env([compTask(), diffTask()], [ret('o1')]);
    h.w.currentUser = Object.assign({}, h.w.currentUser, { role: 'admin', store_name: 'Централен офис' });
    guard('bulLoadReturnsPending не хвърля', () => h.w.bulLoadReturnsPending());
    await ticks();
    ok('нито една заявка', h.calls.get.filter(u => u.indexOf('/stock_returns') >= 0).length === 0);
  }

  report();
})();
