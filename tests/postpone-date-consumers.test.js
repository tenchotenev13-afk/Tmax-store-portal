/* Отлагане с точна дата — консуматорите: таб „Днес" и чек листът.

   Правило 7 (същите данни на повече от едно място): щом задачата се връща на
   нова дата в Бюлетина, тя трябва да се върне и в таблото „Днес". Иначе
   обектът вижда 7/8 в Бюлетина и 7/9 в таблото — и никой не знае коя цифра
   е вярна.

   Какво заковава тестът:
     1. „Днес": обектът, пренесъл днешното явяване за друг ден, ИЗЛИЗА от
        знаменателя си за днес — но само той, останалите го дължат;
     2. „Днес": пренесеното В днес влиза като собствен елемент САМО за своя
        обект, с етикет „пренесена от";
     3. „Днес": отметката му идва от ПЪРВОНАЧАЛНИЯ ред (status='done' върху
        реда с postponed_to), не от ред с днешна дата — такъв няма;
     4. „Днес": задача от по-стар бюлетин се дотегля по id, иначе пренесеното
        остава без заглавие и изчезва;
     5. чек листът брои явяването в седмицата на postponed_to — същото
        правило като в отчета: пренесено в ДРУГА седмица излиза и от
        числителя, и от знаменателя на старата и влиза в новата; пренесено в
        рамките на седмицата се брои веднъж, по новата дата; стар ред с
        postponed_to NULL остава както досега. Знаменателят е ПО ОБЕКТ и при
        нула („всичко пренесено") клетката е празна, не „0/0". Датата на
        попадението: пренесено в ДЪЛЖИМ ден се записва на първоначалната си
        дата (слятото отмятане покрива и двете явявания), пренесено в
        недължим — на новата.

   ⚠️ Никакви фиксирани дати: котва (понеделник) + отместване, часовникът
   замразен на сряда.

   Пускане: node tests/postpone-date-consumers.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

/* ── Котва: понеделник 12:00 от текущата седмица ─────────────────────────── */
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
function freezeAt(w, n) {
  const Real = w.Date, fixedMs = dateAt(n).getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  }
  w.Date = Frozen;
}
const MON = isoAt(0), WED = isoAt(2), THU = isoAt(3), FRI = isoAt(4);
const PREV_THU = isoAt(-4);

const STORES = ['Троян', 'Ловеч', 'Севлиево'];
const TR = STORES[0];
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

/* ── Данни ───────────────────────────────────────────────────────────────── */
function recTask(over) {
  return Object.assign({
    id: 'r-wed', title: 'Проверка цени', department: 'trade', task_type: 'info',
    active: true, sort_order: 1, due_weekdays: [2], due_weekday: 2, due_time: '10:00',
    due_window: false, target_stores: null, report_groups: null, linked_module: null,
    description: null
  }, over || {});
}
function bulTask(over) {
  return Object.assign({
    id: 't-wed', bulletin_id: 'b-1', title: 'Зареждане рафтове', department: 'trade',
    task_type: 'info', due_date: null, due_dates: [WED], target_stores: null,
    linked_module: null, description: null, attachments: null, sort_order: 1
  }, over || {});
}
const OLD_TASK = bulTask({ id: 't-old', bulletin_id: 'b-0', title: 'Стара от миналата седмица', due_dates: [PREV_THU] });

function comp(over) {
  return Object.assign({
    id: 'c-' + Math.random().toString(36).slice(2, 8), task_id: null, recurring_task_id: null,
    store_name: TR, status: 'done', completion_date: null, postponed_to: null,
    completed_by: TR, comment: null, photos: null, files: null
  }, over || {});
}

/* Мъничък PostgREST: прилага eq/gte/lte/in НАИСТИНА, включително по
   postponed_to. Без това проверката „има отделна заявка за пренесените"
   щеше да е декоративна. */
function pgFake(rows) {
  return function (url) {
    const qs = url.indexOf('?') >= 0 ? url.slice(url.indexOf('?') + 1) : '';
    const preds = [];
    qs.split('&').forEach(function (p) {
      const i = p.indexOf('=');
      if (i < 0) return;
      const col = decodeURIComponent(p.slice(0, i));
      const val = decodeURIComponent(p.slice(i + 1));
      if (col === 'select' || col === 'order' || col === 'limit' || col === 'or') return;
      const m = /^(eq|gte|lte)\.([\s\S]*)$/.exec(val);
      if (m) {
        preds.push(r => {
          const v = r[col];
          if (v === null || v === undefined) return false;
          const x = String(v);
          return m[1] === 'eq' ? x === m[2] : m[1] === 'gte' ? x >= m[2] : x <= m[2];
        });
        return;
      }
      const mi = /^in\.\(([\s\S]*)\)$/.exec(val);
      if (mi) {
        const list = mi[1] ? mi[1].split(',') : [];
        preds.push(r => list.indexOf(String(r[col])) >= 0);
        return;
      }
      if (val === 'not.is.null') { preds.push(r => r[col] !== null && r[col] !== undefined); return; }
    });
    return rows.filter(r => preds.every(f => f(r)));
  };
}

function env(opts) {
  opts = opts || {};
  const h = boot({ modules: ['bulletin.js', 'today.js', 'report.js', 'checklist.js'], user: ADMIN, data: {} });
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
  h.setData('recurring_tasks', url => {
    const all = opts.recurring || [recTask()];
    const mi = /[?&]id=in\.\(([^)]*)\)/.exec(url);
    if (mi) { const ids = mi[1].split(','); return all.concat(opts.extraRec || []).filter(t => ids.indexOf(String(t.id)) >= 0); }
    return all;
  });
  h.setData('bulletin_tasks', url => {
    const pool = [bulTask(), OLD_TASK].concat(opts.extraTasks || []);
    const mb = /bulletin_id=eq\.([^&]+)/.exec(url);
    if (mb) return pool.filter(t => t.bulletin_id === mb[1]);
    const mi = /[?&]id=in\.\(([^)]*)\)/.exec(url);
    if (mi) { const ids = mi[1].split(','); return pool.filter(t => ids.indexOf(String(t.id)) >= 0); }
    return pool;
  });
  h.setData('task_completions', pgFake(opts.comps || []));
  h.setData('users', STORES.map(s => ({ store_name: s })));
  h.setData('report_snapshots', []);
  h.setData('recurring_task_skips', []);
  h.setData('recurring_task_periods', []);
  h.setData('weekly_checklist', []);
  ['differences_reports', 'stock_returns', 'kasa_storno', 'kasa_zoborot',
    'goods_transit', 'transport_pallets', 'stock_differences', 'client_orders',
    'transport_orders', 'daily_turnover', 'report_recipients'].forEach(t => h.setData(t, []));
  return h;
}

async function board(h) {
  h.w.loadTodayDashboard();
  for (let i = 0; i < 40; i++) { if (h.w.todayCache) break; await ticks(); }
  await ticks(); await ticks();
  return h.w.todayCache;
}
function statsOf(h, store) {
  const c = h.w.todayCache;
  return c ? h.w.todayStoreStats(store, c.items, c.comps) : null;
}

/* ── Чек листът: собствено обкръжение ────────────────────────────────────
   Показателят „справка минуси" брои РАЗЛИЧНИ дни при срок Пон–Пет, тоест
   знаменателят му е 5 — най-четимият случай за преместено явяване. */
const MIN_ID = 'r-min';
const CL_METRICS = [
  { key: 'spravka_minusi', label: 'справка минуси', sublabel: '', value_type: 'yes_no',
    sort_order: 1, active: true, source: 'recurring:' + MIN_ID }
];
function shiftISO(iso, days) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function clComp(id, store, status, orig, to) {
  return { id: id, recurring_task_id: MIN_ID, store_name: store, status: status,
           completion_date: orig, postponed_to: to };
}
function clEnv(comps) {
  return boot({
    modules: ['bulletin.js', 'checklist.js'],
    user: ADMIN,
    data: {
      users: STORES.map(s => ({ store_name: s })).concat([{ store_name: 'Централен офис' }]),
      weekly_checklist_metrics: CL_METRICS,
      weekly_checklist: [],
      recurring_tasks: [{ id: MIN_ID, due_weekdays: [0, 1, 2, 3, 4] }],
      recurring_task_periods: [],
      recurring_task_skips: [],
      task_completions: pgFake(comps || [])
    }
  });
}
const clWeek = h => {
  const d = h.w.checklistDefaultWeek();
  return h.w.weekDays(d.week, d.year).map(h.w.toLocalISO);
};
/* Стойностите, които порталът би записал за седмицата, отместена с off дни.
   idx-ът нарочно съдържа стойност, различна от всяка възможна — така и
   ПРАЗНАТА стойност (null) излиза като промяна и се различава от „няма
   промяна". */
async function clValues(h, off) {
  const w = h.w;
  const base = w.checklistDefaultWeek();
  const mon = w.weekDays(base.week, base.year)[0];
  const d = new Date(mon.getTime());
  d.setDate(d.getDate() + (off || 0));
  w.checklistWeek = w.weekNum(d);
  w.checklistYear = isoWeekYear(d);
  const idx = {};
  (w.checklistStores || []).forEach(s => { idx[s + ' spravka_minusi'] = { portal_value: '—няма—' }; });
  const changes = await w.checklistRecurringChanges(idx);
  const out = {};
  (changes || []).forEach(c => { if (c.metric_key === 'spravka_minusi') out[c.store] = c.value; });
  return out;
}

(async function run() {

  /* ═══ 1. Пренеслият обект излиза от знаменателя за днес ════════════════ */
  section('1. „Днес": обектът, който е пренесъл задачата, не я дължи днес');
  {
    /* Троян пренася СРЯДНАТА постоянна задача за петък. */
    const h = env({ comps: [comp({ recurring_task_id: 'r-wed', status: 'postponed', completion_date: WED, postponed_to: FRI, comment: 'ремонт' })] });
    const c = await board(h);
    if (ok('таблото се зареди', !!c, 'няма кеш')) {
      const tr = statsOf(h, TR), lv = statsOf(h, 'Ловеч');
      /* Знаменателят на Троян: обикновената задача за сряда (1), без
         постоянната. На Ловеч: и двете. */
      ok('Троян: знаменателят е 1 (без пренесената)', tr.total === 1, JSON.stringify(tr));
      ok('Ловеч: знаменателят е 2 (него не го засяга)', lv.total === 2, JSON.stringify(lv));
      ok('пренесеното НЕ се брои за изпълнено', tr.done === 0, JSON.stringify(tr));
    }
  }

  section('1б. КОНТРОЛА: без отлагане знаменателят е 2 за всички');
  {
    const h = env({ comps: [] });
    const c = await board(h);
    if (ok('таблото се зареди', !!c)) {
      ok('Троян: 2', statsOf(h, TR).total === 2, JSON.stringify(statsOf(h, TR)));
      ok('Ловеч: 2', statsOf(h, 'Ловеч').total === 2);
    }
  }

  section('1в. Стар отложен ред БЕЗ дата се държи както досега (остава в знаменателя)');
  {
    const h = env({ comps: [comp({ recurring_task_id: 'r-wed', status: 'postponed', completion_date: WED, postponed_to: null })] });
    const c = await board(h);
    if (ok('таблото се зареди', !!c)) {
      ok('Троян: знаменателят пак е 2', statsOf(h, TR).total === 2, JSON.stringify(statsOf(h, TR)));
      ok('и не се брои за изпълнено', statsOf(h, TR).done === 0, JSON.stringify(statsOf(h, TR)));
    }
  }

  /* ═══ 2. Пренесеното В днес влиза при своя обект ═══════════════════════ */
  section('2. „Днес": пренесеното за днес се явява само при своя обект');
  {
    /* Задача от МИНАЛАТА седмица (чужд бюлетин), пренесена за днес. */
    const h = env({ comps: [comp({ task_id: 't-old', status: 'postponed', completion_date: PREV_THU, postponed_to: WED, comment: 'нямаше стока' })] });
    const c = await board(h);
    if (ok('таблото се зареди', !!c)) {
      const carried = (c.items || []).filter(i => i.carried_from);
      ok('има точно един пренесен елемент', carried.length === 1, JSON.stringify((c.items || []).map(i => i.title)));
      if (carried.length) {
        ok('заглавието е дотеглено, не празно', carried[0].title === 'Стара от миналата седмица', carried[0].title);
        ok('носи от коя дата е пренесена', carried[0].carried_from === PREV_THU, String(carried[0].carried_from));
        ok('важи САМО за своя обект', JSON.stringify(carried[0].target_stores) === JSON.stringify([TR]),
          JSON.stringify(carried[0].target_stores));
      }
      ok('Троян: знаменателят е 3 (двете за деня + пренесената)', statsOf(h, TR).total === 3, JSON.stringify(statsOf(h, TR)));
      ok('Ловеч: остава 2', statsOf(h, 'Ловеч').total === 2, JSON.stringify(statsOf(h, 'Ловеч')));
      const byId = h.calls.get.filter(u => /bulletin_tasks/.test(u) && /id=in\./.test(u));
      ok('задачата от чуждия бюлетин се дотегля по id', byId.length === 1, JSON.stringify(byId));
      const carriedQ = h.calls.get.filter(u => /task_completions/.test(u) && /postponed_to=eq\./.test(u));
      ok('има отделна заявка по postponed_to = днес', carriedQ.length === 1, JSON.stringify(carriedQ));
      if (carriedQ.length) ok('обхватът ѝ е ДНЕС', carriedQ[0].indexOf('postponed_to=eq.' + WED) >= 0, carriedQ[0]);
    }
  }

  /* ═══ 3. Отметката идва от първоначалния ред ═══════════════════════════ */
  section('3. „Днес": отметнатото пренесено явяване се брои за изпълнено');
  {
    /* Същият ред, но вече отметнат: status='done', completion_date си остава
       ПЪРВОНАЧАЛНАТА дата — по днешна дата такъв ред НЯМА. */
    const h = env({ comps: [comp({ task_id: 't-old', status: 'done', completion_date: PREV_THU, postponed_to: WED, comment: 'готово' })] });
    const c = await board(h);
    if (ok('таблото се зареди', !!c)) {
      const tr = statsOf(h, TR);
      ok('Троян: 1 от 3 изпълнени', tr.done === 1 && tr.total === 3, JSON.stringify(tr));
      const hit = (c.comps || []).filter(x => x.item_id === 't-old' && x.store_name === TR);
      ok('отметката е в comps', hit.length === 1, JSON.stringify(c.comps));
      ok('Ловеч не получава чужда отметка', statsOf(h, 'Ловеч').done === 0, JSON.stringify(statsOf(h, 'Ловеч')));
    }
  }

  section('3б. КОНТРОЛА: отложен, но НЕотметнат пренесен ред не се брои');
  {
    const h = env({ comps: [comp({ task_id: 't-old', status: 'postponed', completion_date: PREV_THU, postponed_to: WED })] });
    const c = await board(h);
    if (ok('таблото се зареди', !!c)) {
      ok('Троян: 0 от 3', statsOf(h, TR).done === 0 && statsOf(h, TR).total === 3, JSON.stringify(statsOf(h, TR)));
    }
  }
  /* ═══ 4. Чек листът ═══════════════════════════════════════════════════ */
  section('4. Чек листът брои явяването в седмицата на postponed_to');
  {
    /* Същото правило като в отчета: явяването се брои там, където РЕАЛНО се
       очаква. Трите случая:
         а) пренесено в ДРУГА седмица — вън от числителя И знаменателя на
            старата, вътре в новата;
         б) пренесено в СЪЩАТА седмица — веднъж, по новата дата (тя може да е
            извън due_weekdays: петък→събота);
         в) стар ред с postponed_to NULL — както досега.
       Проверката минава през checklistRecurringChanges(), а не само през
       checklistPortalPlan(), за да влезе в обхвата и втората заявка (по
       postponed_to) — без нея случай „а" няма откъде да се появи в новата
       седмица. */
    const probe = clEnv([]);
    const WK = clWeek(probe);                       /* приключилата седмица */
    probe.close();
    const NWK = WK.map(d => shiftISO(d, 7));        /* следващата */
    const CL_COMPS = [
      /* а) Троян: понеделникът е пренесен в следващата седмица и е отметнат. */
      clComp('a1', 'Троян', 'done', WK[0], NWK[0]),
      /* б) Ловеч: петъкът е пренесен за събота — в рамките на седмицата.
            Събота НЕ е в due_weekdays (Пон–Пет), тоест по старото правило
            отмятането там не се брояло изобщо. */
      clComp('b1', 'Ловеч', 'done', WK[4], WK[5]),
      /* в) Севлиево: стар отложен ред БЕЗ дата + едно нормално отмятане. */
      clComp('c1', 'Севлиево', 'postponed', WK[0], null),
      clComp('c2', 'Севлиево', 'done', WK[1], null)
    ];

    const h = clEnv(CL_COMPS);
    h.w.loadChecklist();
    await ticks(); await ticks(); await ticks();
    ok('чек листът се зареди', (h.w.checklistStores || []).length === 3,
      JSON.stringify(h.w.checklistStores));

    const cur = await clValues(h, 0);
    ok('а) старата седмица: явяването излиза и от знаменателя', cur['Троян'] === '0/4', String(cur['Троян']));
    ok('б) същата седмица: брои се, по НОВАТА дата (събота)', cur['Ловеч'] === '1/5', String(cur['Ловеч']));
    ok('в) стар ред без дата: знаменателят е непокътнат и отлагането не брои',
      cur['Севлиево'] === '1/5', String(cur['Севлиево']));

    /* Другият край на случай „а": СЛЕДВАЩАТА седмица. */
    const nextVals = await clValues(h, 7);
    ok('а) новата седмица: явяването влиза в знаменателя И в числителя',
      nextVals['Троян'] === '1/6', String(nextVals['Троян']));
    ok('а) чуждите обекти не са засегнати',
      nextVals['Ловеч'] === '0/5' && nextVals['Севлиево'] === '0/5', JSON.stringify(nextVals));

    const q = h.calls.get.filter(u => /task_completions/.test(u) && /postponed_to=gte\./.test(u));
    ok('има отделна заявка по postponed_to', q.length >= 1, JSON.stringify(q));
    if (q.length) ok('обхватът ѝ е показаната седмица',
      q[0].indexOf('postponed_to=gte.' + WK[0]) >= 0 && q[0].indexOf('postponed_to=lte.' + WK[6]) >= 0, q[0]);
    h.close();
  }

  section('4г. Пренесено в ДЪЛЖИМ ден — попадението е на първоначалната дата');
  {
    /* Слятият ред при отмятане пише done и за двата дни, тоест покрити са и
       двете явявания. Затова пренесеното в дължим ден се записва на
       ПЪРВОНАЧАЛНАТА си дата: по новата двете щяха да се слеят в едно
       попадение и петте отработени дни щяха да излязат 4/5. */
    const probe = clEnv([]);
    const WK = clWeek(probe);
    probe.close();
    const h = clEnv([
      clComp('e0', 'Троян', 'done', WK[0], WK[2]),   /* пон → ср (ср е дължима) */
      clComp('e1', 'Троян', 'done', WK[1], null),
      clComp('e2', 'Троян', 'done', WK[2], null),
      clComp('e3', 'Троян', 'done', WK[3], null),
      clComp('e4', 'Троян', 'done', WK[4], null)
    ]);
    h.w.loadChecklist();
    await ticks(); await ticks(); await ticks();
    const cur = await clValues(h, 0);
    ok('петте свършени явявания дават 5/5', cur['Троян'] === '5/5', String(cur['Троян']));
    h.close();
  }

  section('4д. Две явявания в един НЕдължим ден — един покрит ден');
  {
    /* Обратният край на същото правило: недължимият ден (събота) е реалният
       ден на задачата и за двете пренесени явявания, тоест покритият ден е
       един. Тук попадението се води по НОВАТА дата и множеството ги слива
       нарочно — по първоначалните дати щяха да излязат две. */
    const probe = clEnv([]);
    const WK = clWeek(probe);
    probe.close();
    const h = clEnv([
      clComp('f1', 'Троян', 'done', WK[0], WK[5]),   /* пон → съб */
      clComp('f2', 'Троян', 'done', WK[1], WK[5])    /* вто → съб */
    ]);
    h.w.loadChecklist();
    await ticks(); await ticks(); await ticks();
    const cur = await clValues(h, 0);
    ok('двете дават ЕДИН покрит ден', cur['Троян'] === '1/5', String(cur['Троян']));
    h.close();
  }

  section('4в. Ред, който идва по ДВЕТЕ заявки, се брои веднъж');
  {
    /* Явяване извън дължимите дни, пренесено в друг ден от СЪЩАТА седмица
       (събота→неделя — среща се, когато срокът на задачата е сменен след
       отлагането). Такъв ред отговаря и на двата обхвата: completion_date в
       седмицата И postponed_to в седмицата. Без обединяване по id обектът
       получава +2 към знаменателя за едно явяване. */
    const probe = clEnv([]);
    const WK = clWeek(probe);
    probe.close();
    const h = clEnv([clComp('d1', 'Троян', 'done', WK[5], WK[6])]);
    h.w.loadChecklist();
    await ticks(); await ticks(); await ticks();
    const cur = await clValues(h, 0);
    ok('знаменателят расте с ЕДНО, не с две', cur['Троян'] === '1/6', String(cur['Троян']));
    h.close();
  }

  section('4б. Пренесе ли обект ВСИЧКО извън седмицата — празна клетка, не 0/0');
  {
    const probe = clEnv([]);
    const WK = clWeek(probe);
    probe.close();
    const rows = [0, 1, 2, 3, 4].map(i =>
      clComp('z' + i, 'Троян', 'postponed', WK[i], shiftISO(WK[i], 7)));
    const h = clEnv(rows);
    h.w.loadChecklist();
    await ticks(); await ticks(); await ticks();
    const cur = await clValues(h, 0);
    ok('Троян: празна клетка', cur['Троян'] === null, String(cur['Троян']));
    ok('останалите: 0/5', cur['Ловеч'] === '0/5', String(cur['Ловеч']));
    h.close();
  }

  report();
})();
