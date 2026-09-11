/* Постоянна задача, изключена за седмица (recurring_task_skips) — в Бюлетина.

   Ред в таблицата значи „тази седмица задачата не се изисква" — за всички
   обекти (store_name NULL) или само за посочения. Тук се заковава как
   Бюлетинът го прилага:

     - заявката тегли САМО седмицата на показания бюлетин (съседната не се
       прилага, дори да има ред в базата);
     - глобалното изключване сивее задачата за всеки обект — без чекбокс, с
       бадж, без „Отложи" (не се крие: правило 11);
     - магазинното засяга САМО този обект — другият си я вижда и отмята;
     - глобалният изглед крие задачата от брояча единствено при глобално
       изключване; магазинното вади обекта от знаменателя X/N;
     - статистиката по обекти (loadTasksStats) не брои изключеното в
       знаменателя на ТОЗИ обект, а останалите не се пипат;
     - печатът и ръчното известие за днешните срокове.

   Записът (секции 11–21, всичко с РЕАЛЕН клик):
     - „Не за тази седмица" → модал; чиповете са обектите в обхвата, вече
       изключените са заключени; избор на чип превключва на „Само избраните";
     - „Запиши" се заключва веднага — двоен клик праща ЕДИН POST;
     - 1 ред при „Всички обекти", N реда при чипове; created_by = display_name;
     - ✕ до обект трие САМО неговия ред; „Върни" трие САМО глобалния;
     - след всеки запис/триене изключванията се теглят НАНОВО от базата
       (wireDb() по-долу наистина пише, иначе проверката е празна);
     - отметки за седмицата → confirm; отказ не пише нищо, отметките остават;
     - 409 (друг е изключил междувременно) и 500 — всеки със свое поведение.

   ⚠️ Дати: котвата е петъкът от текущата реална седмица, замразена на w.Date
   (същият модел като bulletin-completion-day-lock.test.js). Ключът за
   седмицата в тестовите данни се смята НЕЗАВИСИМО от кода под тест —
   годината на четвъртъка + weekNum() — иначе тестът би сверявал
   recurringSkipWeekOf() сам със себе си.

   Пускане: node tests/recurring-task-skips.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

/* ── Котва ─────────────────────────────────────────────────────────────── */
const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (4 - ((d.getDay() + 6) % 7)));
  return d;
})();
function isoOf(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function shifted(days) { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() + days); return d; }
const TODAY = isoOf(ANCHOR);
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

const KA = 'Кърджали', RA = 'Раднево', TR = 'Троян';

/* „Всеки ден" — без ден от седмицата, с час: важи и за седемте дни, тоест
   се явява в календара всеки ден и влиза 7 пъти в седмичната статистика. */
function rec(id, over) {
  return Object.assign({
    id: id, title: 'Постоянна ' + id, department: 'trade', task_type: 'info',
    target_stores: null, due_weekday: null, due_weekdays: null, due_time: '20:00',
    linked_module: null, active: true, sort_order: 0
  }, over || {});
}
const RECS = [
  rec('r-a'),                          /* глобално изключена */
  rec('r-b'),                          /* изключена само за Кърджали */
  rec('r-c'),                          /* изключена само за Раднево */
  rec('r-d'),                          /* изключена за СЛЕДВАЩАТА седмица */
  rec('r-e', { target_stores: [KA] })  /* само за Кърджали и изключена за него */
];

/* Базата. Ключът се смята независимо от кода под тест. */
function skipRows(w) {
  const wk = { year: isoWeekYear(ANCHOR), week: w.weekNum(ANCHOR) };
  const nx = { year: isoWeekYear(shifted(7)), week: w.weekNum(shifted(7)) };
  return [
    { id: 's1', recurring_task_id: 'r-a', year: wk.year, week_number: wk.week, store_name: null, reason: 'инвентаризация', created_by: 'Админ' },
    { id: 's2', recurring_task_id: 'r-b', year: wk.year, week_number: wk.week, store_name: KA, reason: 'ремонт', created_by: 'Админ' },
    { id: 's3', recurring_task_id: 'r-c', year: wk.year, week_number: wk.week, store_name: RA, reason: null, created_by: null },
    { id: 's4', recurring_task_id: 'r-d', year: nx.year, week_number: nx.week, store_name: null, reason: null, created_by: null },
    { id: 's5', recurring_task_id: 'r-e', year: wk.year, week_number: wk.week, store_name: KA, reason: null, created_by: null }
  ];
}
/* PostgREST филтър: year=eq.X&week_number=eq.Y — огледално на базата, за да
   мине истинската заявка на loadRecurringSkips(), не подменен масив. */
function skipsRoute(rowsRef) {
  return function (url) {
    const y = /[?&]year=eq\.(\d+)/.exec(url), wk = /[?&]week_number=eq\.(\d+)/.exec(url);
    return rowsRef.rows.filter(r => (!y || r.year === +y[1]) && (!wk || r.week_number === +wk[1]));
  };
}

function bulFor(w, days) {
  const ref = shifted(days || 0);
  const cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });
  return { id: 'b-1', week_number: w.weekNum(ref), year: isoWeekYear(ref), status: 'published',
           content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
}

/* Пишещата половина на „базата" за recurring_task_skips. harness.js само
   записва POST/DELETE и връща ok — тук редовете наистина се добавят и трият,
   за да докаже презареждането след запис, че чете базата, а не паметта.
   POST: целият масив се отхвърля с 409 при дубликат — поведението на двата
   частични уникални индекса. DELETE: същите филтри като PostgREST и броят в
   Content-Range, както го чете sbCountFromRange(). */
function wireDb(h) {
  const orig = h.w.fetch;
  const same = (a, b) => a.recurring_task_id === b.recurring_task_id && a.year === b.year &&
    a.week_number === b.week_number && (a.store_name || null) === (b.store_name || null);
  h.w.fetch = function (url, init) {
    init = init || {};
    const m = (init.method || 'GET').toUpperCase();
    if (url.indexOf('/recurring_task_skips') < 0 || (m !== 'POST' && m !== 'DELETE')) return orig.call(this, url, init);
    const recorded = orig.call(this, url, init); /* записва в calls и прилага fail правилата */
    return recorded.then(function (r) {
      if (!r.ok) return r;
      if (m === 'POST') {
        const arr = [].concat(JSON.parse(init.body));
        if (arr.some(x => h.db.rows.some(y => same(x, y)))) {
          return { ok: false, status: 409,
            json: () => Promise.resolve({ code: '23505', message: 'duplicate key value violates unique constraint "rts_store_uq"' }),
            text: () => Promise.resolve('') };
        }
        arr.forEach(x => h.db.rows.push(Object.assign({ id: 'n' + (++h.db.seq) }, x)));
        return { ok: true, status: 201, json: () => Promise.resolve({}), text: () => Promise.resolve('') };
      }
      const q = decodeURIComponent(url.split('?')[1] || '');
      const f = k => { const mm = new RegExp('(?:^|&)' + k + '=([^&]*)').exec(q); return mm ? mm[1] : null; };
      const before = h.db.rows.length;
      h.db.rows = h.db.rows.filter(x => !(
        (!f('recurring_task_id') || 'eq.' + x.recurring_task_id === f('recurring_task_id')) &&
        (!f('year') || 'eq.' + x.year === f('year')) &&
        (!f('week_number') || 'eq.' + x.week_number === f('week_number')) &&
        (!f('store_name') || (f('store_name') === 'is.null' ? x.store_name === null : 'eq.' + x.store_name === f('store_name')))
      ));
      const n = before - h.db.rows.length;
      return { ok: true, status: 204, headers: { get: k => (k === 'Content-Range' ? '*/' + n : null) },
        json: () => Promise.resolve(null), text: () => Promise.resolve('') };
    });
  };
}

function env(user, extra) {
  const db = { rows: [], seq: 0 };
  extra = extra || {};
  const h = boot(Object.assign({
    modules: ['bulletin.js'],
    user: Object.assign({ email: 'u@temax.bg', display_name: 'Тест' }, user),
    data: {
      users: [{ store_name: KA }, { store_name: RA }, { store_name: TR }],
      recurring_tasks: RECS,
      recurring_task_skips: skipsRoute(db),
      bulletins: () => [h.bul],
      bulletin_tasks: [],
      task_completions: extra.completions || []
    },
    /* Отговорът на confirm() се сменя по време на теста през h.answer. */
    confirm: () => (h.answer === undefined ? true : h.answer)
  }, extra.fail ? { fail: extra.fail } : {}));
  freezeDate(h.w);
  db.rows = skipRows(h.w);
  h.db = db;
  h.bul = bulFor(h.w, 0);
  wireDb(h);
  return h;
}

async function settle(cond, max) {
  for (let i = 0; i < (max || 40); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
function txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
function blockRow(doc, id) { return doc.querySelector('[data-rec-row="' + id + '"]'); }
function calSkipRows(doc, id) {
  return Array.prototype.filter.call(doc.querySelectorAll('#sec-calendar .rec-skip-row'),
    r => txt(r).indexOf('Постоянна ' + id) >= 0);
}
function calBoxes(doc, id) { return doc.querySelectorAll('#sec-calendar input[data-rtid="' + id + '"]'); }

(async function () {

  /* ═══ 1. Помощниците в shared.js ═════════════════════════════════════ */
  section('1. recurringIsSkipped / recurringSkipStores / recurringSkipWeekOf');
  {
    const h = env({ role: 'manager', store_name: KA });
    const w = h.w;
    const S = [
      { recurring_task_id: 'x', store_name: null },
      { recurring_task_id: 'y', store_name: KA },
      { recurring_task_id: 'y', store_name: RA }
    ];
    ok('глобален ред важи за всеки обект', w.recurringIsSkipped('x', KA, S) && w.recurringIsSkipped('x', TR, S));
    ok('глобален ред важи и за store=null (глобален изглед)', w.recurringIsSkipped('x', null, S));
    ok('магазинен ред важи за своя обект', w.recurringIsSkipped('y', KA, S));
    ok('магазинен ред НЕ важи за друг обект', !w.recurringIsSkipped('y', TR, S));
    ok('магазинен ред НЕ е глобален (store=null)', !w.recurringIsSkipped('y', null, S));
    ok('друга задача не е засегната', !w.recurringIsSkipped('z', KA, S));
    ok('празен/липсващ масив → false', !w.recurringIsSkipped('x', KA, []) && !w.recurringIsSkipped('x', KA, null));
    ok('id се сравнява като низ', w.recurringIsSkipped('7', KA, [{ recurring_task_id: 7, store_name: null }]));
    ok('recurringSkipStores връща само магазинните',
      JSON.stringify(w.recurringSkipStores('y', S)) === JSON.stringify([KA, RA]) &&
      JSON.stringify(w.recurringSkipStores('x', S)) === '[]');
    const k1 = w.recurringSkipWeekOf(new w.Date(2025, 11, 29));
    const k2 = w.recurringSkipWeekOf(new w.Date(2027, 0, 1));
    ok('29.12.2025 → 2026 С1 (не 2025)', k1.year === 2026 && k1.week === 1, JSON.stringify(k1));
    ok('01.01.2027 → 2026 С53 (не 2027)', k2.year === 2026 && k2.week === 53, JSON.stringify(k2));
  }

  /* ═══ 2. loadBulletin: заявката тегли САМО седмицата на бюлетина ═════════ */
  section('2. loadBulletin() → recurring_task_skips за седмицата на curBul');
  const hs = env({ role: 'manager', store_name: KA });
  {
    const w = hs.w, doc = hs.doc;
    w.bulActiveDept = 'trade';
    w.reportableStoresCache = [KA, RA, TR];
    if (guard('loadBulletin() не хвърля', () => w.loadBulletin())) {
      await settle(() => !!doc.getElementById('sec-calendar'));
      const q = hs.calls.get.filter(u => u.indexOf('/recurring_task_skips') >= 0);
      ok('точно една заявка към recurring_task_skips', q.length === 1, q.join(' | '));
      ok('заявката е за year/week_number на бюлетина',
        q.length && q[0].indexOf('year=eq.' + hs.bul.year) >= 0 && q[0].indexOf('week_number=eq.' + hs.bul.week_number + '&') >= 0, q[0]);
      const bs = Array.isArray(w.bulSkips) ? w.bulSkips : [];
      ok('bulSkips = 4 реда (без следващата седмица)', bs.length === 4, bs.map(s => s.id).join(','));
      ok('редът за следващата седмица НЕ е зареден', Array.isArray(w.bulSkips) && !bs.some(s => s.id === 's4'));
      ok('календарът е нарисуван', !!doc.getElementById('sec-calendar'));
    }
  }

  /* ═══ 3. Обект Кърджали ══════════════════════════════════════════════ */
  section('3. Кърджали: глобално и собствено изключване → сив ред, без чекбокс');
  {
    const w = hs.w, doc = hs.doc;
    ['r-a', 'r-b', 'r-e'].forEach(id => {
      ok(id + ': в календара няма чекбокс', calBoxes(doc, id).length === 0);
      const rows = calSkipRows(doc, id);
      ok(id + ': в календара е сив ред с бадж (по един на ден — 7)', rows.length === 7, 'редове: ' + rows.length);
      ok(id + ': баджът казва „Не се изисква тази седмица"',
        rows.length && txt(rows[0]).indexOf('⏸ Не се изисква тази седмица') >= 0, txt(rows[0]));
      const br = blockRow(doc, id);
      if (ok(id + ': редът в блока „Постоянни задачи" съществува', !!br)) {
        ok(id + ': в блока няма чекбокс', !br.querySelector('input[type=checkbox]'));
        ok(id + ': в блока стои ⏸ на мястото на чекбокса', txt(br).indexOf('⏸') >= 0);
        ok(id + ': няма „Отложи"', !H.btn(br, 'Отложи'));
        ok(id + ': баджът е в блока', !!br.querySelector('.rec-skip-badge'));
      }
    });
    const badgeA = (blockRow(doc, 'r-a') || doc.createElement('div')).querySelector('.rec-skip-badge');
    ok('причината и авторът са в title', badgeA && badgeA.getAttribute('title').indexOf('инвентаризация') >= 0 &&
      badgeA.getAttribute('title').indexOf('Админ') >= 0, badgeA && badgeA.getAttribute('title'));
    ['r-c', 'r-d'].forEach(id => {
      ok(id + ': Кърджали си има чекбокс в календара (7 дни)', calBoxes(doc, id).length === 7, calBoxes(doc, id).length);
      const br = blockRow(doc, id);
      ok(id + ': в блока — чекбокс и „Отложи", без бадж',
        br && !!br.querySelector('input[type=checkbox]') && !!H.btn(br, 'Отложи') && !br.querySelector('.rec-skip-badge'));
    });
    ok('r-c: изключването на Раднево НЕ стига до Кърджали', calSkipRows(doc, 'r-c').length === 0);
  }

  /* ═══ 4. Обект Раднево — магазинното изключване на Кърджали не го засяга ═══ */
  section('4. Раднево: вижда r-b нормално, r-c е изключена за него');
  {
    const w = hs.w, doc = hs.doc;
    w.currentUser = Object.assign({}, w.currentUser, { store_name: RA });
    if (guard('renderBulView() като Раднево', () => w.renderBulView())) {
      ok('r-b: Раднево има чекбокс (7 дни)', calBoxes(doc, 'r-b').length === 7);
      ok('r-b: без бадж в блока', !!blockRow(doc, 'r-b') && !blockRow(doc, 'r-b').querySelector('.rec-skip-badge'));
      ok('r-c: изключена за Раднево — без чекбокс', calBoxes(doc, 'r-c').length === 0 && calSkipRows(doc, 'r-c').length === 7);
      ok('r-a: глобалното важи и за Раднево', calBoxes(doc, 'r-a').length === 0);
      ok('r-e: не е за Раднево — изобщо не се показва', !blockRow(doc, 'r-e') && calSkipRows(doc, 'r-e').length === 0);
    }
  }

  /* ═══ 5. Глобален изглед ═════════════════════════════════════════════ */
  section('5. Глобален изглед: брояч X/N и баджове');
  {
    const w = hs.w, doc = hs.doc;
    w.currentUser = Object.assign({}, w.currentUser, { role: 'admin', store_name: 'Централен офис' });
    w.reportableStoresCache = [KA, RA, TR];
    if (guard('renderBulView() като admin', () => w.renderBulView())) {
      ok('r-a (глобално): сив ред в календара, 7 дни', calSkipRows(doc, 'r-a').length === 7);
      ok('r-b (само Кърджали): НЕ е сив ред в календара', calSkipRows(doc, 'r-b').length === 0);
      const stB = txt({ textContent: w.calItemStatusHtml('r-b', 'recurring', null, TODAY).replace(/<[^>]+>/g, '') });
      ok('r-b: брояч 0/2 — Кърджали извън знаменателя', stB === '0/2', stB);
      const stD = txt({ textContent: w.calItemStatusHtml('r-d', 'recurring', null, TODAY).replace(/<[^>]+>/g, '') });
      ok('r-d (изключена СЛЕДВАЩАТА седмица): брояч 0/3', stD === '0/3', stD);
      const stE = w.calItemStatusHtml('r-e', 'recurring', [KA], TODAY);
      ok('r-e: единственият обект е изключен → ⏸ с обяснение, не „—"',
        stE.indexOf('⏸') >= 0 && stE.indexOf('Не се изисква от нито един обект') >= 0 && stE.indexOf('Няма обект с достъп') < 0, stE);
      const stReg = w.calItemStatusHtml('r-b', 'regular', null, TODAY).replace(/<[^>]+>/g, '');
      ok('обикновена задача със същия id не е засегната (0/3)', stReg === '0/3', stReg);
      const bA = blockRow(doc, 'r-a'), bB = blockRow(doc, 'r-b');
      ok('блок r-a: бадж „Не се изисква тази седмица"', bA && txt(bA.querySelector('.rec-skip-badge')) === '⏸ Не се изисква тази седмица');
      /* Админът е canEdit — баджът му носи ✕ до всеки обект (част 2).
         Етикетът се сравнява без бутоните; самият ✕ се кликa в секция 12. */
      const labelOf = el => { if (!el) return ''; const c = el.cloneNode(true); c.querySelectorAll('button').forEach(b => b.remove()); return txt(c); };
      ok('блок r-b: бадж „Не се изисква: Кърджали"', bB && labelOf(bB.querySelector('.rec-skip-badge')) === '⏸ Не се изисква: Кърджали',
        bB && labelOf(bB.querySelector('.rec-skip-badge')));
      ok('блок r-d: без бадж', !!blockRow(doc, 'r-d') && !blockRow(doc, 'r-d').querySelector('.rec-skip-badge'));
    }
  }

  /* ═══ 6. Статистика по обекти ════════════════════════════════════════ */
  section('6. loadTasksStats(): знаменателят е по обект');
  {
    const w = hs.w, doc = hs.doc;
    w.bulTasks = [{ id: 't-1', title: 'Обикновена', department: 'admin', task_type: 'info', target_stores: null, due_dates: [TODAY] }];
    w.bulComps = [];
    /* Отметки от ПРЕДИ изключването: Кърджали е отметнал r-b днес. Изключен
       е за седмицата, тоест отметката не бива да се брои никъде. Раднево е
       отметнал r-b — той се брои. */
    w.recurringComps = [
      { recurring_task_id: 'r-b', store_name: KA, status: 'done', completion_date: TODAY },
      { recurring_task_id: 'r-b', store_name: RA, status: 'done', completion_date: TODAY }
    ];
    const wrap = doc.createElement('div'); wrap.id = 'tasks-stat-wrap'; doc.body.appendChild(wrap);
    if (guard('loadTasksStats() не хвърля', () => w.loadTasksStats())) {
      await settle(() => wrap.querySelector('table'));
      const cell = (store, col) => {
        const tr = Array.prototype.find.call(wrap.querySelectorAll('tbody tr'), r => txt(r.cells[0]) === store);
        return tr ? txt(tr.cells[col]) : '(няма ред)';
      };
      /* Колона 1 = Търговска. 7 дати на задача „всеки ден". */
      ok('Кърджали: r-c + r-d = 0/14 (r-a, r-b, r-e извън)', cell(KA, 1) === '0/14', cell(KA, 1));
      ok('Раднево: r-b + r-d = 1/14 (r-a, r-c извън; отметката му се брои)', cell(RA, 1) === '1/14', cell(RA, 1));
      ok('Троян: r-b + r-c + r-d = 0/21 (само глобалното извън)', cell(TR, 1) === '0/21', cell(TR, 1));
    }
    wrap.remove();
  }

  /* ═══ 7. Съседна седмица ═════════════════════════════════════════════ */
  section('7. Следващата седмица: собствените ѝ изключвания, нищо от текущата');
  {
    const w = hs.w;
    const cur = w.bulSkipWeek();
    ok('bulSkipWeek() = (curBul.year, curBul.week_number)', cur.year === hs.bul.year && cur.week === hs.bul.week_number, JSON.stringify(cur));
    w.curBul = bulFor(w, 7);
    const nx = w.bulSkipWeek();
    ok('при бюлетин за следващата седмица ключът е неговият', nx.year === w.curBul.year && nx.week === w.curBul.week_number, JSON.stringify(nx));
    let rows = null;
    w.loadRecurringSkips(nx).then(r => { rows = r; });
    await settle(() => rows !== null);
    ok('заредени са само редовете на следващата седмица (s4)', rows && rows.length === 1 && rows[0].id === 's4', JSON.stringify(rows));
    w.bulSkips = rows || [];
    w.currentUser = Object.assign({}, w.currentUser, { role: 'manager', store_name: KA });
    if (guard('renderBulView() за следващата седмица', () => w.renderBulView())) {
      ok('r-b: следващата седмица Кърджали отново има чекбокс', calBoxes(hs.doc, 'r-b').length === 7);
      ok('r-a: следващата седмица не е изключена', calBoxes(hs.doc, 'r-a').length === 7);
      ok('r-d: изключена е точно следващата седмица', calBoxes(hs.doc, 'r-d').length === 0 && calSkipRows(hs.doc, 'r-d').length === 7);
    }
  }

  /* ═══ 8. Ръчното известие за днешните срокове ════════════════════════ */
  section('8. collectTodayDeadlineItems(): само глобалните за ДНЕШНАТА седмица');
  {
    const h = env({ role: 'admin', store_name: 'Централен офис' });
    const w = h.w;
    w.recurringTasks = RECS.slice();
    /* Известието чете ВСИЧКИ задачи + периодите за днешната седмица (не
       recurringTasks на показания бюлетин). Без периоди важи кешът active. */
    w.recurringAll = RECS.slice();
    w.recurringPeriods = [];
    w.bulTasks = [];
    /* Админът гледа СЛЕДВАЩАТА седмица и bulSkips е нейният — известието е
       за днес и трябва да тегли собствените си изключвания. */
    w.curBul = bulFor(w, 7);
    w.bulSkips = [h.db.rows[3]];
    let items = null;
    if (guard('collectTodayDeadlineItems() не хвърля', () => w.collectTodayDeadlineItems(l => { items = l; }))) {
      await settle(() => items !== null);
      const titles = (items || []).map(i => i.title);
      ok('r-a (глобално тази седмица) е махната', titles.indexOf('Постоянна r-a') < 0, titles.join(', '));
      ok('r-b и r-c (магазинни) остават — известието е до всички', titles.indexOf('Постоянна r-b') >= 0 && titles.indexOf('Постоянна r-c') >= 0);
      ok('r-d (изключена СЛЕДВАЩАТА седмица) остава', titles.indexOf('Постоянна r-d') >= 0);
      const q = h.calls.get.filter(u => u.indexOf('/recurring_task_skips') >= 0);
      const today = { year: isoWeekYear(ANCHOR), week: w.weekNum(ANCHOR) };
      ok('заявката е за ДНЕШНАТА седмица', q.length === 1 && q[0].indexOf('year=eq.' + today.year) >= 0 &&
        q[0].indexOf('week_number=eq.' + today.week + '&') >= 0, q.join(' | '));
    }
  }

  /* ═══ 9. Печат ═══════════════════════════════════════════════════════ */
  section('9. printSection(): изключената е на хартията, но без квадратче');
  {
    const w = hs.w, doc = hs.doc;
    w.curBul = hs.bul;
    w.bulSkips = hs.db.rows.filter(r => r.id !== 's4');
    w.recurringComps = [];
    w._printOrientation = 'portrait';
    const printed = () => {
      let buf = '';
      w.open = () => ({ document: { write: s => { buf += s; }, close: () => {} }, focus: () => {} });
      return { get: () => buf };
    };
    const parse = html => { const d = doc.createElement('div'); d.innerHTML = html.replace(/^[\s\S]*<body>/, '').replace(/<\/body>[\s\S]*$/, ''); return d; };
    const rowOf = (root, id) => Array.prototype.find.call(root.querySelectorAll('.task-row'), r => txt(r.querySelector('.task-title')).indexOf('Постоянна ' + id) === 0);

    w.currentUser = Object.assign({}, w.currentUser, { role: 'manager', store_name: KA });
    let p = printed();
    if (guard('printSection("trade") като Кърджали', () => w.printSection('trade'))) {
      const root = parse(p.get());
      const ra = rowOf(root, 'r-a'), rc = rowOf(root, 'r-c');
      ok('r-a е на листа с „⏸ Не се изисква тази седмица"', ra && txt(ra).indexOf('⏸ Не се изисква тази седмица') >= 0, txt(ra));
      ok('r-a: квадратчето е ⏸, не празно за отмятане', ra && txt(ra.querySelector('.task-cb')) === '⏸');
      ok('r-c: нормален ред, празно квадратче, без етикет', rc && txt(rc.querySelector('.task-cb')) === '' && !rc.querySelector('.p-skip'));
    }
    p = printed();
    if (guard('printSection("cal") като Кърджали', () => w.printSection('cal'))) {
      const n = (p.get().match(/Постоянна r-b <span class="p-skip"[^>]*>\(⏸ не се изисква\)/g) || []).length;
      ok('календарът на листа маркира r-b за всеки от 7-те дни', n === 7, 'брой: ' + n);
      ok('r-c в календара на листа е без етикет', !/Постоянна r-c <span class="p-skip"/.test(p.get()));
    }
    w.currentUser = Object.assign({}, w.currentUser, { role: 'admin', store_name: 'Централен офис' });
    p = printed();
    if (guard('printSection("trade") глобално', () => w.printSection('trade'))) {
      const root = parse(p.get());
      const rb = rowOf(root, 'r-b');
      ok('глобален печат: r-b носи „⏸ Не се изисква: Кърджали"', rb && txt(rb.querySelector('.p-skip')) === '⏸ Не се изисква: Кърджали', txt(rb));
      ok('глобален печат: r-b има квадратче (не е изключена за всички)', rb && txt(rb.querySelector('.task-cb')) !== '⏸');
    }
  }

  /* ═══ 10. Провалена заявка → поведение като преди изключванията ══════════ */
  section('10. recurring_task_skips връща 500 → Бюлетинът се зарежда, нищо не е изключено');
  {
    const db = { rows: [] };
    const h = boot({
      modules: ['bulletin.js'],
      user: { email: 'u@temax.bg', display_name: 'Тест', role: 'manager', store_name: KA },
      data: { users: [{ store_name: KA }], recurring_tasks: RECS, recurring_task_skips: skipsRoute(db),
              bulletins: () => [h.bul], bulletin_tasks: [] },
      fail: { GET: /recurring_task_skips/ }
    });
    freezeDate(h.w);
    db.rows = skipRows(h.w);
    h.bul = bulFor(h.w, 0);
    h.w.bulActiveDept = 'trade';
    if (guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) {
      await settle(() => !!h.doc.getElementById('sec-calendar'));
      ok('Бюлетинът е нарисуван въпреки провала', !!h.doc.getElementById('sec-calendar'));
      ok('bulSkips е празен', Array.isArray(h.w.bulSkips) && h.w.bulSkips.length === 0);
      ok('r-a се показва с чекбокс (както преди изключванията)', calBoxes(h.doc, 'r-a').length === 7);
      ok('провалът е казан на човека (toast)', h.calls.toast.some(t => String(t).indexOf('Грешка') >= 0), JSON.stringify(h.calls.toast));
    }
  }

  /* ═══════════════════ ЧАСТ 2 — ЗАПИСЪТ ═══════════════════════════════
     Нова среда: admin, данните минават през loadBulletin(), а записите — през
     wireDb(), тоест презареждането след всяко действие чете базата. */
  const A = env({ role: 'admin', store_name: 'Централен офис' }, {
    completions: [
      /* Кърджали е отметнал r-c днес — за предупреждението в секция 15. */
      { recurring_task_id: 'r-c', store_name: KA, status: 'done', completion_date: TODAY }
    ]
  });
  const aw = A.w, ad = A.doc;
  aw.bulActiveDept = 'trade';
  guard('loadBulletin() като admin', () => aw.loadBulletin());
  await settle(() => !!blockRow(ad, 'r-d'));
  const skipGets = () => A.calls.get.filter(u => u.indexOf('/recurring_task_skips') >= 0).length;
  const skipPosts = () => A.calls.post.filter(p => p.table === 'recurring_task_skips');
  const skipDels = () => A.calls.del.filter(u => u.indexOf('/recurring_task_skips') >= 0);
  const modal = () => ad.getElementById('rsk-modal-ov');
  const chip = s => Array.prototype.find.call(ad.querySelectorAll('#rsk-chips .rsk-chip'), c => c.getAttribute('data-store') === s);
  const labelOf = el => { if (!el) return ''; const c = el.cloneNode(true); c.querySelectorAll('button').forEach(b => b.remove()); return txt(c); };
  async function openFor(id) {
    const b = blockRow(ad, id) && blockRow(ad, id).querySelector('.rec-skip-open');
    if (!b) return false;
    H.realClick(aw, b);
    return settle(() => !!modal());
  }

  /* ═══ 11. Бутонът и модалът ══════════════════════════════════════════ */
  section('11. „Не за тази седмица" → модал с чипове');
  {
    ok('r-d (не е изключена): бутонът е в реда', !!blockRow(ad, 'r-d').querySelector('.rec-skip-open'));
    ok('r-a (глобално изключена): бутонът го НЯМА — има „Върни"',
      !blockRow(ad, 'r-a').querySelector('.rec-skip-open') && !!blockRow(ad, 'r-a').querySelector('.rec-unskip-all'));
    ok('r-b (магазинно): бутонът остава — може да се добавят още обекти', !!blockRow(ad, 'r-b').querySelector('.rec-skip-open'));
    if (ok('клик → модалът се отваря', await openFor('r-d'))) {
      const chips = ad.querySelectorAll('#rsk-chips .rsk-chip');
      ok('3 чипа — обектите от reportable (Кърджали, Раднево, Троян)', chips.length === 3, chips.length);
      ok('нито един не е заключен за r-d', !Array.prototype.some.call(chips, c => c.disabled));
      ok('„Всички обекти" е избрано по подразбиране', ad.getElementById('rsk-mode-all').checked);
      ok('заглавието назовава седмицата', txt(modal()).indexOf('Седмица ' + A.bul.week_number) >= 0);
      H.realClick(aw, H.btnExact(modal(), 'Откажи'));
      ok('„Откажи" затваря модала без заявка', !modal() && skipPosts().length === 0);
    }
    if (ok('r-b: модалът се отваря', await openFor('r-b'))) {
      ok('r-b: Кърджали е заключен с ✓ (вече изключен)', chip(KA) && chip(KA).disabled && txt(chip(KA)) === '✓ ' + KA);
      ok('r-b: Раднево и Троян са свободни', chip(RA) && !chip(RA).disabled && chip(TR) && !chip(TR).disabled);
      aw.closeRecurringSkipModal();
    }
    if (ok('r-e (само за Кърджали): модалът се отваря', await openFor('r-e'))) {
      ok('r-e: един чип — обхватът е target_stores', ad.querySelectorAll('#rsk-chips .rsk-chip').length === 1);
      aw.closeRecurringSkipModal();
    }
  }

  /* ═══ 12. Магазинно изключване с чипове ══════════════════════════════ */
  section('12. Чипове → „Запиши" → N реда, презареждане от базата');
  {
    await openFor('r-d');
    H.realClick(aw, chip(KA));
    ok('клик на чип го включва', chip(KA).getAttribute('data-on') === '1');
    ok('изборът на чип превключва на „Само избраните"', ad.getElementById('rsk-mode-stores').checked);
    H.realClick(aw, chip(RA));
    H.realClick(aw, chip(KA));
    ok('втори клик го изключва', chip(KA).getAttribute('data-on') === '0');
    H.realClick(aw, chip(TR));
    ad.getElementById('rsk-reason').value = 'ремонт на склада';
    const getsBefore = skipGets();
    const save = ad.getElementById('rsk-save');
    H.realClick(aw, save);
    ok('„Запиши" се заключва веднага (disabled)', save.disabled === true);
    H.realClick(aw, save);
    await settle(() => !modal());
    const posts = skipPosts();
    ok('ЕДИН POST въпреки двата клика', posts.length === 1, posts.length);
    const body = posts.length ? posts[0].body : [];
    ok('тялото е 2 реда — Раднево и Троян', Array.isArray(body) && body.length === 2 &&
      body.map(r => r.store_name).sort().join(',') === [RA, TR].sort().join(','), JSON.stringify(body));
    ok('year/week_number са на бюлетина', body.every(r => r.year === A.bul.year && r.week_number === A.bul.week_number));
    ok('recurring_task_id, причина и created_by = display_name', body.every(r =>
      r.recurring_task_id === 'r-d' && r.reason === 'ремонт на склада' && r.created_by === 'Тест'), JSON.stringify(body[0]));
    ok('без отметки за тях → без confirm()', A.calls.confirm.length === 0);
    await settle(() => skipGets() > getsBefore && labelOf(blockRow(ad, 'r-d') && blockRow(ad, 'r-d').querySelector('.rec-skip-stores')) !== '');
    ok('след записа изключванията са изтеглени наново', skipGets() === getsBefore + 1);
    ok('bulSkips идва от базата (с id от нея)', aw.bulSkips.some(s => s.recurring_task_id === 'r-d' && /^n\d+$/.test(s.id)));
    ok('баджът в реда: „Не се изисква: Раднево, Троян"',
      labelOf(blockRow(ad, 'r-d').querySelector('.rec-skip-stores')) === '⏸ Не се изисква: ' + RA + ', ' + TR,
      labelOf(blockRow(ad, 'r-d').querySelector('.rec-skip-stores')));
    const st = aw.calItemStatusHtml('r-d', 'recurring', null, TODAY).replace(/<[^>]+>/g, '');
    ok('броячът на r-d става 0/1 — само Кърджали дължи', st === '0/1', st);
  }

  /* ═══ 13. ✕ до обекта трие САМО неговия ред ═════════════════════════ */
  section('13. ✕ до Раднево → DELETE само за Раднево');
  {
    const x = Array.prototype.find.call(blockRow(ad, 'r-d').querySelectorAll('.rec-unskip-store'), b => b.getAttribute('data-store') === RA);
    if (ok('✕ до Раднево съществува', !!x)) {
      const getsBefore = skipGets();
      H.realClick(aw, x);
      await settle(() => skipGets() > getsBefore);
      await settle(() => labelOf(blockRow(ad, 'r-d') && blockRow(ad, 'r-d').querySelector('.rec-skip-stores')) === '⏸ Не се изисква: ' + TR);
      const d = skipDels();
      const u = d.length ? decodeURIComponent(d[d.length - 1]) : '';
      ok('един DELETE', d.length === 1, d.length);
      ok('филтърът е задача + седмица + store_name=eq.Раднево',
        u.indexOf('recurring_task_id=eq.r-d') >= 0 && u.indexOf('year=eq.' + A.bul.year) >= 0 &&
        u.indexOf('week_number=eq.' + A.bul.week_number) >= 0 && u.indexOf('store_name=eq.' + RA) >= 0, u);
      ok('в базата Троян за r-d остава', A.db.rows.some(r => r.recurring_task_id === 'r-d' && r.store_name === TR && r.year === A.bul.year));
      ok('редът на Раднево за r-c (друга задача) е недокоснат', A.db.rows.some(r => r.recurring_task_id === 'r-c' && r.store_name === RA));
      ok('баджът вече е само „Троян"', labelOf(blockRow(ad, 'r-d').querySelector('.rec-skip-stores')) === '⏸ Не се изисква: ' + TR);
      ok('изключването за СЛЕДВАЩАТА седмица (s4) е недокоснато', A.db.rows.some(r => r.id === 's4'));
    }
  }

  /* ═══ 14. Глобално + „Върни" ═════════════════════════════════════════ */
  section('14. „Всички обекти" → 1 ред; „Върни" трие само глобалния');
  {
    await openFor('r-d');
    const postsBefore = skipPosts().length;
    H.realClick(aw, ad.getElementById('rsk-save'));
    await settle(() => !modal() && !!blockRow(ad, 'r-d') && !!blockRow(ad, 'r-d').querySelector('.rec-unskip-all'));
    const p = skipPosts().slice(postsBefore);
    ok('един POST с ЕДИН ред store_name=null', p.length === 1 && p[0].body.length === 1 && p[0].body[0].store_name === null, JSON.stringify(p.map(x => x.body)));
    ok('причината е null, не празен низ', p.length && p[0].body[0].reason === null);
    const row = blockRow(ad, 'r-d');
    ok('бутонът „Не за тази седмица" изчезва', !row.querySelector('.rec-skip-open'));
    ok('глобалният бадж и „Върни" са там', labelOf(row.querySelector('.rec-skip-badge')) === '⏸ Не се изисква тази седмица' && !!row.querySelector('.rec-unskip-all'));
    ok('магазинният ред на Троян също се вижда — нищо не се крие', labelOf(row.querySelector('.rec-skip-stores')) === '⏸ Не се изисква: ' + TR);
    ok('календарът сивее r-d (глобално)', calSkipRows(ad, 'r-d').length === 7);
    H.realClick(aw, row.querySelector('.rec-unskip-all'));
    await settle(() => !!blockRow(ad, 'r-d') && !blockRow(ad, 'r-d').querySelector('.rec-unskip-all'));
    const u = decodeURIComponent(skipDels().slice(-1)[0] || '');
    ok('DELETE е със store_name=is.null', u.indexOf('store_name=is.null') >= 0 && u.indexOf('recurring_task_id=eq.r-d') >= 0, u);
    ok('в базата Троян за r-d остава', A.db.rows.some(r => r.recurring_task_id === 'r-d' && r.store_name === TR && r.year === A.bul.year));
    ok('бутонът се връща, баджът е пак „Троян"', !!blockRow(ad, 'r-d').querySelector('.rec-skip-open') &&
      labelOf(blockRow(ad, 'r-d').querySelector('.rec-skip-stores')) === '⏸ Не се изисква: ' + TR);
    ok('календарът вече не сивее r-d', calSkipRows(ad, 'r-d').length === 0);
  }

  /* ═══ 15. Предупреждение при съществуващи отметки ══════════════════════ */
  section('15. Отметки за седмицата → confirm; „Откажи" не пише нищо');
  {
    await openFor('r-c');
    ok('r-c: Раднево е заключен (вече изключен)', chip(RA) && chip(RA).disabled);
    H.realClick(aw, chip(KA));
    A.answer = false;
    const postsBefore = skipPosts().length, confBefore = A.calls.confirm.length;
    const getsCompBefore = A.calls.get.filter(u => u.indexOf('/task_completions') >= 0).length;
    H.realClick(aw, ad.getElementById('rsk-save'));
    await settle(() => A.calls.confirm.length > confBefore);
    const q = A.calls.get.filter(u => u.indexOf('/task_completions') >= 0).slice(getsCompBefore);
    const wkD = aw.weekDays(A.bul.week_number, A.bul.year).map(aw.toLocalISO);
    ok('отметките се теглят ПРЯСНО за задачата и седмицата', q.length === 1 && q[0].indexOf('recurring_task_id=eq.r-c') >= 0 &&
      q[0].indexOf('status=eq.done') >= 0 && q[0].indexOf('completion_date=gte.' + wkD[0]) >= 0 && q[0].indexOf('completion_date=lte.' + wkD[6]) >= 0, q.join(' | '));
    const msg = A.calls.confirm.slice(-1)[0] || '';
    ok('confirm назовава обекта и казва, че отметките остават', msg.indexOf(KA) >= 0 && msg.indexOf('остават') >= 0, msg);
    await settle(() => !ad.getElementById('rsk-save').disabled);
    ok('„Откажи" в confirm → нито един POST', skipPosts().length === postsBefore);
    ok('модалът остава отворен, „Запиши" е отключен', !!modal() && !ad.getElementById('rsk-save').disabled);
    A.answer = true;
    H.realClick(aw, ad.getElementById('rsk-save'));
    await settle(() => !modal());
    const p = skipPosts().slice(postsBefore);
    ok('„Да" → POST за Кърджали', p.length === 1 && p[0].body.length === 1 && p[0].body[0].store_name === KA);
    ok('отметките НЕ са изтрити', A.calls.del.filter(u => u.indexOf('/task_completions') >= 0).length === 0);
    A.answer = undefined;
  }

  /* ═══ 16. Нищо избрано ═══════════════════════════════════════════════ */
  section('16. „Само избраните" без чип → toast, без заявка');
  {
    await openFor('r-d');
    ad.getElementById('rsk-mode-stores').click();
    ok('радиото е превключено с клик', ad.getElementById('rsk-mode-stores').checked);
    const postsBefore = skipPosts().length, toastsBefore = A.calls.toast.length;
    H.realClick(aw, ad.getElementById('rsk-save'));
    await ticks();
    ok('без POST', skipPosts().length === postsBefore);
    ok('toast „Избери поне един обект"', A.calls.toast.slice(toastsBefore).some(t => String(t).indexOf('Избери поне един обект') >= 0));
    ok('„Запиши" НЕ остава заключен', !ad.getElementById('rsk-save').disabled);
    aw.closeRecurringSkipModal();
  }

  /* ═══ 17. 409 — друг е изключил междувременно ═════════════════════════ */
  section('17. Остарял bulSkips + 409 → затваря, казва и презарежда');
  {
    await openFor('r-d');
    /* Друг админ изключва r-d глобално, докато модалът е отворен. */
    A.db.rows.push({ id: 'other', recurring_task_id: 'r-d', year: A.bul.year, week_number: A.bul.week_number, store_name: null, reason: 'друг', created_by: 'Друг' });
    const toastsBefore = A.calls.toast.length;
    H.realClick(aw, ad.getElementById('rsk-save'));
    await settle(() => !modal() && !!blockRow(ad, 'r-d') && !!blockRow(ad, 'r-d').querySelector('.rec-unskip-all'));
    ok('409 → модалът се затваря', !modal());
    ok('toast „Вече е изключена от друг"', A.calls.toast.slice(toastsBefore).some(t => String(t).indexOf('Вече е изключена от друг') >= 0));
    ok('след презареждане се вижда чуждото изключване', !!blockRow(ad, 'r-d').querySelector('.rec-unskip-all'));
    ok('в базата е само чуждият глобален ред', A.db.rows.filter(r => r.recurring_task_id === 'r-d' && r.store_name === null && r.year === A.bul.year && r.week_number === A.bul.week_number).length === 1);
  }

  /* ═══ 18. „Върни", когато някой друг вече е върнал ════════════════════ */
  section('18. „Върни" с 0 изтрити реда → не е грешка, презарежда');
  {
    const b = blockRow(ad, 'r-d').querySelector('.rec-unskip-all');
    A.db.rows = A.db.rows.filter(r => r.id !== 'other'); /* върнат от друг */
    const toastsBefore = A.calls.toast.length;
    H.realClick(aw, b);
    ok('бутонът се заключва по време на заявката', b.disabled === true);
    await settle(() => !!blockRow(ad, 'r-d') && !blockRow(ad, 'r-d').querySelector('.rec-unskip-all'));
    ok('toast „Вече е върната"', A.calls.toast.slice(toastsBefore).some(t => String(t).indexOf('Вече е върната') >= 0), JSON.stringify(A.calls.toast.slice(toastsBefore)));
    ok('редът вече не е изключен глобално', !!blockRow(ad, 'r-d').querySelector('.rec-skip-open'));
  }

  /* ═══ 19. Провален запис ══════════════════════════════════════════════ */
  section('19. POST връща 500 → модалът остава, „Запиши" се отключва');
  {
    const F = env({ role: 'admin', store_name: 'Централен офис' }, { fail: { POST: /recurring_task_skips/ } });
    F.w.bulActiveDept = 'trade';
    F.w.loadBulletin();
    await settle(() => !!blockRow(F.doc, 'r-d'));
    H.realClick(F.w, blockRow(F.doc, 'r-d').querySelector('.rec-skip-open'));
    await settle(() => !!F.doc.getElementById('rsk-modal-ov'));
    const getsBefore = F.calls.get.filter(u => u.indexOf('/recurring_task_skips') >= 0).length;
    H.realClick(F.w, F.doc.getElementById('rsk-save'));
    await settle(() => F.calls.toast.some(t => String(t).indexOf('Грешка при изключването') >= 0));
    ok('toast с грешката', F.calls.toast.some(t => String(t).indexOf('Грешка при изключването') >= 0), JSON.stringify(F.calls.toast));
    ok('модалът остава отворен', !!F.doc.getElementById('rsk-modal-ov'));
    ok('„Запиши" е отключен за нов опит', !F.doc.getElementById('rsk-save').disabled);
    ok('няма презареждане при провал', F.calls.get.filter(u => u.indexOf('/recurring_task_skips') >= 0).length === getsBefore);
    ok('в базата не е влязло нищо', !F.db.rows.some(r => r.recurring_task_id === 'r-d' && r.year === F.bul.year && r.week_number === F.bul.week_number));
  }

  /* ═══ 20. Обект не вижда контролите ══════════════════════════════════ */
  section('20. Управител: без „Не за тази седмица", без ✕ и без „Върни"');
  {
    aw.currentUser = Object.assign({}, aw.currentUser, { role: 'manager', store_name: TR });
    if (guard('renderBulView() като управител', () => aw.renderBulView())) {
      ok('нито един бутон „Не за тази седмица"', ad.querySelectorAll('.rec-skip-open').length === 0);
      ok('нито един ✕ / „Върни"', ad.querySelectorAll('.rec-unskip-store, .rec-unskip-all').length === 0);
      ok('openRecurringSkipModal() като управител не отваря нищо', (aw.openRecurringSkipModal('r-b'), !modal()));
    }
  }

  /* ═══ 21. Кавичка в причината ════════════════════════════════════════ */
  section('21. Причина с кавички не чупи атрибута title');
  {
    aw.currentUser = Object.assign({}, aw.currentUser, { role: 'admin', store_name: 'Централен офис' });
    aw.bulSkips = [{ id: 'q', recurring_task_id: 'r-b', year: A.bul.year, week_number: A.bul.week_number, store_name: KA, reason: 'ремонт "А" <б>', created_by: 'Тест' }];
    aw.renderBulView();
    const b = blockRow(ad, 'r-b') && blockRow(ad, 'r-b').querySelector('.rec-skip-badge');
    ok('title съдържа причината непокътната', b && b.getAttribute('title').indexOf('ремонт "А" <б>') >= 0, b && b.getAttribute('title'));
    ok('баджът не е разкъсан (✕ е вътре в него)', b && !!b.querySelector('.rec-unskip-store'));
  }

  report();
})().catch(function (e) {
  /* Хвърляне извън guard() не бива да умре мълчаливо преди report() —
     тогава изходът е без нито един ❌ и изглежда зелен. */
  ok('тестът стига до края без необработено изключение', false, e && e.stack);
  report();
});
