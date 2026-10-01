/* „🚫 Не се отнася за нас" — ОФИСЪТ и броячите в портала (т.4, 01.10.2026).

   ТВЪРДЕНИЯТА:
   · броячът в календара пада от 1/2 на 1/1 — обектът ИЗЛИЗА от знаменателя,
     нито изпълнил, нито пропуснал, и до числото стои „🚫1";
   · заявят ли всички обекти — няма 0/0, а 🚫 с имената (правило 11);
   · офисът вижда „🚫 Не се отнася (N)" с ОБЕКТА, ПРИЧИНАТА и датата, и бутон
     „↩ Върни" (само canEdit, с потвърждение);
   · „↩ Върни" трие САМО реда на заявката и задачата става отново чакаща;
   · таблицата по обекти вади задачата от реда на обекта и го показва с 🚫N;
   · процентът в Анализ се смята срещу намаления знаменател, а заявката не
     влиза в „✅ Изпълнени" и не изчиства „🔴 Просрочени".

   Всяка секция има КОНТРОЛА без заявката — иначе тестът би минавал и ако
   задачата просто е изчезнала отвсякъде.

   Пускане: node tests/na-office-view.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

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
const MON = D(0), WED = D(2);

const TR = 'Троян', LO = 'Ловеч';
const STORES = [TR, LO];
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function task(id, over) {
  return Object.assign({
    id: id, bulletin_id: 'b-1', week_number: 0, year: 2026, department: 'trade',
    title: 'Излагане палето зони', description: null, due_date: WED, due_dates: [WED],
    due_window: false, spans_from: null, starts_on: null, target_stores: null,
    task_type: 'info', report_groups: null, linked_module: null,
    auto_complete: false, attachments: null, sort_order: 1,
    created_by: 'Админ', created_at: MON
  }, over || {});
}
function comp(store, status, over) {
  return Object.assign({
    id: 'c-' + store + '-' + status, task_id: 't-1', recurring_task_id: null,
    store_name: store, status: status, completion_date: WED,
    comment: status === 'not_applicable' ? 'обектът няма такъв стелаж' : null,
    completed_by: store, completed_at: WED + 'T09:00:00', postponed_to: null
  }, over || {});
}
function env(tasks, comps, user) {
  const sent = { del: [] };
  const h = boot({
    modules: ['bulletin.js', 'today.js', 'report.js'],
    user: user || ADMIN,
    data: {
      users: STORES.map(s => ({ store_name: s })),
      stores: STORES.map(s => ({ name: s })),
      recurring_tasks: [], recurring_task_periods: [], recurring_task_skips: [],
      recurring_task_versions: [],
      bulletins: () => [{
        id: 'b-1', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR),
        status: 'published', created_at: MON,
        content: { calendar: (function () { const c = {}; h.w.DKEYS.forEach(k => { c[k] = []; }); return c; })(),
                   columns: { trade: [], warehouse: [], admin: [] } }
      }],
      bulletin_tasks: url => (url.indexOf('spans_from=not.is.null') >= 0 ? [] : tasks),
      task_completions: () => comps,
      bulletin_promotions: [], task_subtasks: [], subtask_completions: [],
      notification_schedules: [], report_snapshots: [], goods_transit: []
    }
  });
  freezeDate(h.w);
  h.w.bulSelectedId = 'b-1';
  h.w.bulActiveDept = 'trade';
  h.w.reportableStoresCache = STORES.slice();
  h.w.allStoresCache = STORES.slice();
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    if ((init.method || 'GET').toUpperCase() === 'DELETE' && url.indexOf('/task_completions') >= 0) sent.del.push(url);
    return orig.call(this, url, init);
  };
  h.sent = sent;
  h.confirmed = [];
  h.w.confirm = function (msg) { h.confirmed.push(msg); return true; };
  return h;
}
async function settle(cond, max) { for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); } return cond(); }
async function view(tasks, comps, user) {
  const h = env(tasks, comps, user);
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return null;
  await settle(() => !!h.doc.getElementById('sec-calendar'));
  return h;
}
const panel = h => h.doc.getElementById('dept-panel-trade');
const counterText = (h) => {
  const cal = h.doc.getElementById('sec-calendar');
  const spans = Array.prototype.slice.call(cal.querySelectorAll('span'))
    .filter(x => /^\s*\d+\/\d+/.test(x.textContent || '') && x.querySelectorAll('span').length <= 1);
  return spans.map(x => (x.textContent || '').replace(/\s+/g, ' ').trim());
};
const btnIn = (el, text) => Array.prototype.slice.call((el || { querySelectorAll: () => [] }).querySelectorAll('button'))
  .find(b => (b.textContent || '').indexOf(text) >= 0) || null;

(async function () {

  section('1. Броячът: обектът излиза от знаменателя');
  {
    /* Троян е отметнал, Ловеч е заявил „не се отнася" → 1/1, не 1/2. */
    const h = await view([task('t-1')], [comp(TR, 'done'), comp(LO, 'not_applicable')]);
    if (!h) return report();
    const nums = counterText(h);
    ok('има брояч', nums.length >= 1, JSON.stringify(nums));
    ok('и той е 1/1 — Ловеч е изваден', nums.some(x => x.indexOf('1/1') === 0),
      JSON.stringify(nums));
    ok('до него стои 🚫1', nums.some(x => x.indexOf('🚫1') >= 0), JSON.stringify(nums));

    /* КОНТРОЛА: без заявката същите данни дават 1/2. */
    const h2 = await view([task('t-1')], [comp(TR, 'done')]);
    const nums2 = counterText(h2);
    ok('контрола: без заявка броячът е 1/2', nums2.some(x => x.indexOf('1/2') === 0),
      JSON.stringify(nums2));
    ok('и няма 🚫', !nums2.some(x => x.indexOf('🚫') >= 0), JSON.stringify(nums2));
  }

  section('1б. Заявят ли ВСИЧКИ — не 0/0, а 🚫 с имената');
  {
    const h = await view([task('t-1')],
      [comp(TR, 'not_applicable'), comp(LO, 'not_applicable', { id: 'c-lo' })]);
    if (!h) return report();
    const cal = h.doc.getElementById('sec-calendar');
    const txt = (cal.textContent || '');
    ok('няма 0/0', txt.indexOf('0/0') < 0, txt.slice(0, 200));
    const mark = Array.prototype.slice.call(cal.querySelectorAll('span'))
      .find(x => (x.textContent || '').trim() === '🚫');
    if (ok('стои 🚫 вместо дроб', !!mark)) {
      ok('и title изброява обектите',
        (mark.getAttribute('title') || '').indexOf(TR) >= 0 &&
        (mark.getAttribute('title') || '').indexOf(LO) >= 0,
        mark.getAttribute('title'));
    }
  }

  section('2. ОФИСЪТ вижда кой и защо, с „↩ Върни"');
  {
    const h = await view([task('t-1')], [comp(TR, 'done'), comp(LO, 'not_applicable')]);
    if (!h) return report();
    const p = panel(h);
    const txt = (p.textContent || '').replace(/\s+/g, ' ');
    ok('редът казва колко са', txt.indexOf('🚫 Не се отнася (1)') >= 0, txt);
    ok('и кой е обектът', txt.indexOf(LO) >= 0, txt);
    ok('и причината', txt.indexOf('обектът няма такъв стелаж') >= 0, txt);
    const back = btnIn(p, '↩ Върни');
    if (ok('бутонът „↩ Върни" е там', !!back)) {
      ok('носи обекта', back.getAttribute('data-store') === LO, back.getAttribute('data-store'));
      realClick(h.w, back, 'Върни');
      await settle(() => h.sent.del.length > 0, 60);
      ok('иска потвърждение', h.confirmed.length === 1, JSON.stringify(h.confirmed));
      ok('и потвърждението казва кой обект',
        (h.confirmed[0] || '').indexOf(LO) >= 0, h.confirmed[0]);
      const u = h.sent.del[0] || '';
      ok('трие САМО реда на заявката', u.indexOf('status=eq.not_applicable') >= 0, u);
      ok('и само за този обект', u.indexOf(encodeURIComponent(LO)) >= 0, u);
    }
  }

  section('2б. Обектът НЕ вижда бутона „↩ Върни" за чужда заявка');
  {
    const STORE_USER = { email: 't@temax.bg', display_name: 'Троян', role: 'store', store_name: TR };
    const h = await view([task('t-1')], [comp(LO, 'not_applicable')], STORE_USER);
    if (!h) return report();
    const p = panel(h);
    ok('блокът за офиса го няма при обект',
      (p.textContent || '').indexOf('🚫 Не се отнася (') < 0,
      (p.textContent || '').replace(/\s+/g, ' ').slice(0, 200));
    ok('и „↩ Върни" го няма', !btnIn(p, '↩ Върни'));
  }

  section('2в. ЛОГИСТИКАТА вижда блока, но НЕ може да връща');
  {
    /* Ролята logistics е глобална (isGlobal) и БЕЗ canEdit — единственият
       изглед, в който пазачът за „↩ Върни" изобщо се стига. Без тази секция
       мутантът, който маха canEdit(), остава жив: при обект блокът и без това
       не се рисува, а при админ бутонът трябва да е там. */
    const LOG = { email: 'l@temax.bg', display_name: 'Логистика', role: 'logistics', store_name: 'Логистичен склад Добрич' };
    const h = await view([task('t-1')], [comp(LO, 'not_applicable')], LOG);
    if (!h) return report();
    const p = panel(h);
    const txt = (p.textContent || '').replace(/\s+/g, ' ');
    ok('логистиката е глобална роля', h.w.isGlobal() === true);
    ok('но не може да редактира', h.w.canEdit() === false);
    ok('вижда блока „🚫 Не се отнася (1)"', txt.indexOf('🚫 Не се отнася (1)') >= 0, txt);
    ok('и причината', txt.indexOf('обектът няма такъв стелаж') >= 0, txt);
    ok('но „↩ Върни" го НЯМА', !btnIn(p, '↩ Върни'), txt);
    /* КОНТРОЛА: админът го има — иначе проверката горе минава и ако бутонът
       е изчезнал за всички. */
    const h2 = await view([task('t-1')], [comp(LO, 'not_applicable')]);
    ok('контрола: админът го има', !!btnIn(panel(h2), '↩ Върни'));
  }

  section('2г. БРОЯЧЪТ В ПАНЕЛА на обекта: 1/1, не 1/2');
  {
    const STORE_USER = { email: 't@temax.bg', display_name: 'Троян', role: 'store', store_name: TR };
    const tasks = [task('t-1'), task('t-2', { title: 'Втора задача' })];
    /* Троян е отметнал първата и е заявил, че втората не се отнася за него. */
    const comps = [comp(TR, 'done'),
      Object.assign(comp(TR, 'not_applicable'), { id: 'c-na2', task_id: 't-2' })];
    const h = await view(tasks, comps, STORE_USER);
    if (!h) return report();
    const div = h.doc.createElement('div');
    if (!guard('renderTasksPanel() не хвърля', () => { div.innerHTML = h.w.renderTasksPanel(); })) return report();
    const cnt = div.querySelector('[data-dept-count="trade"]');
    if (ok('броячът на отдела е там', !!cnt, div.textContent.slice(0, 120))) {
      ok('показва 1/1 — втората задача е извадена',
        (cnt.textContent || '').trim() === '1/1', (cnt.textContent || '').trim());
    }
    /* КОНТРОЛА: без заявката същите данни дават 1/2. */
    const h2 = await view(tasks, [comp(TR, 'done')], STORE_USER);
    const div2 = h2.doc.createElement('div');
    div2.innerHTML = h2.w.renderTasksPanel();
    const cnt2 = div2.querySelector('[data-dept-count="trade"]');
    ok('контрола: без заявка е 1/2', !!cnt2 && (cnt2.textContent || '').trim() === '1/2',
      cnt2 && (cnt2.textContent || '').trim());
  }

  section('3. АНАЛИЗ: процентът срещу намаления знаменател');
  {
    const h = await view([task('t-1')], [comp(TR, 'done'), comp(LO, 'not_applicable')]);
    if (!h) return report();
    if (!guard('renderBulAnalysis() не хвърля', () => h.w.renderBulAnalysis())) return report();
    await settle(() => {
      const el = h.doc.getElementById('an-tbl');
      return !!el && /%/.test(el.textContent || '');
    }, 80);
    const tbl = h.doc.getElementById('an-tbl');
    const txt = (tbl.textContent || '').replace(/\s+/g, ' ');
    ok('таблицата е рендирана', !!tbl && txt.length > 10, txt.slice(0, 120));
    ok('процентът е 100% — един от един', txt.indexOf('100%') >= 0, txt);
    ok('Троян е зелен чип', txt.indexOf(TR) >= 0, txt);
    ok('Ловеч е със 🚫', txt.indexOf('🚫 ' + LO) >= 0, txt);
    const back = btnIn(tbl, '↩');
    ok('и има бутон за връщане', !!back);

    /* КОНТРОЛА: без заявката същите данни дават 50%. */
    const h2 = await view([task('t-1')], [comp(TR, 'done')]);
    h2.w.renderBulAnalysis();
    await settle(() => {
      const el = h2.doc.getElementById('an-tbl');
      return !!el && /%/.test(el.textContent || '');
    }, 80);
    const txt2 = (h2.doc.getElementById('an-tbl').textContent || '').replace(/\s+/g, ' ');
    ok('контрола: без заявка е 50%', txt2.indexOf('50%') >= 0, txt2);
  }

  section('3б. АНАЛИЗ: заявката не е „изпълнена" и не чисти „просрочени"');
  {
    /* Задача със срок ВЧЕРА, по която само Ловеч е заявил „не се отнася":
       тя е просрочена — никой не я е свършил. */
    const old = task('t-1', { due_dates: [D(1)], due_date: D(1) });
    const h = await view([old], [comp(LO, 'not_applicable', { completion_date: D(1) })]);
    if (!h) return report();
    h.w.renderBulAnalysis();
    await settle(() => !!h.doc.getElementById('an-tbl'), 60);
    /* Картите са <div>етикет</div><div>число</div><div>подпис</div> — числото
       се чете от САМАТА карта, не от текста на цялия модул (там влиза и CSS-ът,
       и заглавието, тоест всяко търсене по низ лъже). */
    const cardNum = (hh, label) => {
      const d = Array.prototype.slice.call(hh.doc.querySelectorAll('#mod-bulletin div'))
        .find(x => (x.textContent || '').indexOf(label) === 0 && x.querySelectorAll('div').length === 3);
      if (!d) return null;
      const parts = Array.prototype.slice.call(d.querySelectorAll('div'));
      return (parts[1] && (parts[1].textContent || '').trim()) || null;
    };
    ok('„✅ Изпълнени" е 0 (заявката не е изпълнение)',
      cardNum(h, '✅ Изпълнени') === '0', String(cardNum(h, '✅ Изпълнени')));
    ok('„🔴 Просрочени" е 1 — заявката не я чисти',
      cardNum(h, '🔴 Просрочени') === '1', String(cardNum(h, '🔴 Просрочени')));
    ok('„🏪 Магазини … са отметнали" е 0',
      cardNum(h, '🏪 Магазини') === '0', String(cardNum(h, '🏪 Магазини')));

    /* КОНТРОЛА: отметка от Ловеч прави същата задача изпълнена. */
    const h2 = await view([old], [comp(LO, 'done', { completion_date: D(1) })]);
    h2.w.renderBulAnalysis();
    await settle(() => !!h2.doc.getElementById('an-tbl'), 60);
    ok('контрола: с отметка „Изпълнени" е 1',
      cardNum(h2, '✅ Изпълнени') === '1', String(cardNum(h2, '✅ Изпълнени')));
    ok('и „Просрочени" е 0',
      cardNum(h2, '🔴 Просрочени') === '0', String(cardNum(h2, '🔴 Просрочени')));
    ok('и „Магазини" е 1',
      cardNum(h2, '🏪 Магазини') === '1', String(cardNum(h2, '🏪 Магазини')));
  }

  section('4. ТАБЛИЦАТА ПО ОБЕКТИ: задачата излиза от реда на обекта');
  {
    const tasks = [task('t-1'), task('t-2', { title: 'Втора задача' })];
    const h = await view(tasks, [comp(TR, 'done'), comp(LO, 'not_applicable')]);
    if (!h) return report();
    const div = h.doc.createElement('div');
    if (!guard('renderTasksPanel() не хвърля', () => { div.innerHTML = h.w.renderTasksPanel(); })) return report();
    await settle(() => {
      const el = h.doc.getElementById('tasks-stat-wrap');
      return !!el && /\d+\/\d+/.test(el.textContent || '');
    }, 80);
    const wrap = h.doc.getElementById('tasks-stat-wrap');
    const rows = Array.prototype.slice.call(wrap.querySelectorAll('tr'));
    const loRow = rows.find(r => (r.textContent || '').indexOf(LO) >= 0);
    const trRow = rows.find(r => (r.textContent || '').indexOf(TR) >= 0);
    if (ok('редът на Ловеч е там', !!loRow, String(rows.length))) {
      const t = (loRow.textContent || '').replace(/\s+/g, ' ');
      ok('знаменателят му е 1 от 2 задачи — една е извадена',
        t.indexOf('0/1') >= 0, t);
      ok('и стои 🚫1', t.indexOf('🚫1') >= 0, t);
    }
    if (ok('редът на Троян е там', !!trRow)) {
      const t = (trRow.textContent || '').replace(/\s+/g, ' ');
      ok('той е с двете задачи: 1/2', t.indexOf('1/2') >= 0, t);
      ok('и без 🚫', t.indexOf('🚫') < 0, t);
    }
  }

  report();
})();
