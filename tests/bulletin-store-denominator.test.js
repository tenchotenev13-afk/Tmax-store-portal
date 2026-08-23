/* Бюлетин — знаменателят на бройките „X/Y обекта".

   Заварено: calItemStatusHtml() броеше срещу allStoresCache, тоест таблицата
   stores — 23 записа. В тях влизат Централен офис, двата логистични склада и
   два обекта без нито един потребителски акаунт (Пазарджик, Сервиз Троян),
   тоест физически няма кой да отметне. Задача, изпълнена от всичките 18
   реални обекта, показваше 18/23 = 78% и никога не ставаше зелена.

   Същият дефект в renderBulAnalysis() (процентът срещу sbGet('stores')) и
   в loadTasksStats(), където филтърът беше преписан с твърдо
   'Централен офис' и пропускаше двата склада — 20 вместо 18.

   Правилният източник е уникалните store_name от users, филтрирани през
   isReportableStore() — точно както го прави report.js. Живее в shared.js
   като loadReportableStores()/reportableStoresCache и НЕ пипа allStoresCache,
   който обслужва падащите менюта, където всичките 23 са правилни.

   ⚠️ Стъбовете нарочно се различават: stores дава 23, users дава 21 (18 +
   двата склада + ЦО). Ако двата списъка бяха еднакви, тестът нямаше да
   доказва нищо — нито че stores не се ползва, нито че isReportableStore()
   се прилага.

   Пускане: node tests/bulletin-store-denominator.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, dayOffset } = H;

/* ── Данни ──────────────────────────────────────────────────────────────── */

/* 18-те обекта, които реално отмятат. */
const REAL = [
  'Враца', 'Габрово', 'Гоце Делчев', 'Добрич', 'Дупница', 'Карлово', 'Козлодуй',
  'Кърджали', 'Монтана', 'Петрич', 'Пирдоп', 'Раднево', 'Севлиево', 'Силистра',
  'Сливен', 'Троян', 'Търговище', 'Шумен'
];
const WAREHOUSES = ['Логистичен склад Добрич', 'Логистичен склад Търговище'];
/* Обекти в stores, но БЕЗ нито един акаунт — няма кой да отметне. */
const NO_ACCOUNT = ['Пазарджик', 'Сервиз Троян'];

/* Таблицата stores — всичките 23. */
const STORES_23 = REAL.concat(WAREHOUSES, NO_ACCOUNT, ['Централен офис'])
  .map(n => ({ name: n }));

/* Таблицата users — 21 уникални store_name, с повторения като в живата база.
   Пазарджик и Сервиз Троян ги няма изобщо. */
const USERS = REAL.concat(REAL, WAREHOUSES, ['Централен офис', 'Централен офис'])
  .map(n => ({ store_name: n }));

const ADMIN   = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const MANAGER = { email: 'm@temax.bg', display_name: 'Управител', role: 'manager', store_name: 'Троян' };

const DUE = dayOffset(0); /* днес — гарантирано в показаната седмица */

function task(id, over) {
  return Object.assign({
    id: id, title: 'Задача ' + id, department: 'trade', task_type: 'info',
    due_dates: [DUE], target_stores: null, linked_module: null
  }, over || {});
}

/* Отмятане от всеки от подадените обекти. */
function comps(taskId, storeNames) {
  return storeNames.map(s => ({
    task_id: taskId, store_name: s, status: 'done', completion_date: DUE
  }));
}

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js'],
    user: opts.user || ADMIN,
    data: { stores: STORES_23, users: USERS }
  });
  const w = h.w;

  const yr = new Date().getFullYear();
  const wk = w.weekNum(new Date());
  const cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });

  w.curBul = {
    id: 'b-1', week_number: wk, year: yr, status: 'published',
    content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } }
  };
  w.bulListCache = [];
  w.bulTasks = opts.tasks || [task('t-1')];
  w.recurringTasks = [];
  w.bulComps = opts.comps || [];
  w.recurringComps = [];
  /* Двата кеша се пълнят както в живия loadBulletin(): allStoresCache от
     stores (23), reportableStoresCache от users (18 след филтъра). */
  return Promise.all([w.loadAllStores(), w.loadReportableStores()]).then(() => h);
}

/* Броячът „X/Y" от calItemStatusHtml(). */
function countText(html) {
  const m = String(html).match(/>(\d+)\/(\d+)</);
  return m ? m[1] + '/' + m[2] : null;
}

(async function run() {

  /* ═══ 1. Източникът на списъка ════════════════════════════════════════ */
  section('1. loadReportableStores() — 18, не 23 и не 21');
  {
    const h = await env();
    const { w } = h;
    ok('allStoresCache идва от stores и е 23', w.allStoresCache.length === 23,
      String(w.allStoresCache.length));
    ok('reportableStoresCache е 18', w.reportableStoresCache.length === 18,
      String(w.reportableStoresCache.length));
    ok('без Централен офис', w.reportableStoresCache.indexOf('Централен офис') < 0);
    ok('без логистичните складове',
      WAREHOUSES.every(n => w.reportableStoresCache.indexOf(n) < 0));
    ok('без обектите без акаунт (не са в users изобщо)',
      NO_ACCOUNT.every(n => w.reportableStoresCache.indexOf(n) < 0));
    ok('всичките 18 реални са вътре',
      REAL.every(n => w.reportableStoresCache.indexOf(n) >= 0));
    /* Двата кеша живеят паралелно — allStoresCache не е пипнат. */
    ok('allStoresCache пак съдържа ЦО и складовете (падащите менюта)',
      w.allStoresCache.indexOf('Централен офис') >= 0 &&
      WAREHOUSES.every(n => w.allStoresCache.indexOf(n) >= 0));
  }

  /* ═══ 2. Задача, изпълнена от всички 18 ═══════════════════════════════ */
  section('2. calItemStatusHtml(): 18 отметки -> 18/18 и зелено');
  {
    const h = await env({ comps: comps('t-1', REAL) });
    const { w } = h;
    const html = w.calItemStatusHtml('t-1', 'regular', null, DUE);
    ok('броячът е 18/18', countText(html) === '18/18', String(countText(html)));
    ok('НЕ е 18/23 (таблицата stores)', countText(html) !== '18/23');
    ok('НЕ е 18/21 (users без isReportableStore)', countText(html) !== '18/21');
    ok('цветът е зелен — работата е завършена',
      html.indexOf('#16a34a') >= 0, html);
  }

  section('2б. 17 от 18 -> 17/18 и сиво');
  {
    const h = await env({ comps: comps('t-1', REAL.slice(0, 17)) });
    const { w } = h;
    const html = w.calItemStatusHtml('t-1', 'regular', null, DUE);
    ok('броячът е 17/18', countText(html) === '17/18', String(countText(html)));
    ok('цветът НЕ е зелен', html.indexOf('#16a34a') < 0);
  }

  /* ═══ 3. Отметки от недостижими обекти не надуват числителя ═══════════ */
  section('3. Отметка от обект извън обхвата не се брои');
  {
    /* Хипотетичен стар запис от склад — в базата такива няма, но ако се
       появи, не бива да се брои срещу знаменател, в който го няма. */
    const h = await env({ comps: comps('t-1', REAL.slice(0, 5).concat(WAREHOUSES)) });
    const { w } = h;
    const html = w.calItemStatusHtml('t-1', 'regular', null, DUE);
    ok('броячът е 5/18, не 7/18', countText(html) === '5/18', String(countText(html)));
  }

  /* ═══ 4. target_stores минава през същия филтър ═══════════════════════ */
  section('4. target_stores с недостижим обект');
  {
    const h = await env({ comps: comps('t-1', ['Троян', 'Враца', 'Габрово']) });
    const { w } = h;
    /* Задача, насочена към 3 реални обекта + Пазарджик (няма акаунт). */
    const html = w.calItemStatusHtml('t-1', 'regular',
      ['Троян', 'Враца', 'Габрово', 'Пазарджик'], DUE);
    ok('знаменателят е 3, не 4', countText(html) === '3/3', String(countText(html)));
    ok('и е зелен — тримата, които могат, са готови', html.indexOf('#16a34a') >= 0);

    /* И складът отпада, ако някой го сложи в target_stores. */
    const html2 = w.calItemStatusHtml('t-1', 'regular',
      ['Троян', 'Враца', 'Габрово'].concat(WAREHOUSES), DUE);
    ok('логистичен склад в target_stores също не влиза',
      countText(html2) === '3/3', String(countText(html2)));

    /* Задача само към недостижим обект — нищо не се показва, а не „0/1". */
    const html3 = w.calItemStatusHtml('t-1', 'regular', ['Пазарджик'], DUE);
    ok('задача само към обект без акаунт не показва брояч', html3 === '', html3);
  }

  /* ═══ 5. Календарът в реалния DOM ════════════════════════════════════ */
  section('5. Седмичният календар показва 18/18');
  {
    const h = await env({ comps: comps('t-1', REAL) });
    const { w, doc } = h;
    if (guard('renderBulView() не хвърля', () => w.renderBulView())) {
      const cal = doc.querySelector('#sec-calendar');
      if (ok('календарът се рендира', !!cal)) {
        ok('в календара пише 18/18', cal.textContent.indexOf('18/18') >= 0,
          (cal.textContent.match(/\d+\/\d+/g) || []).join(' '));
        ok('никъде не пише /23', cal.textContent.indexOf('/23') < 0);
        ok('никъде не пише /21', cal.textContent.indexOf('/21') < 0);
      }
    }
  }

  /* ═══ 6. Изгледът за магазин не се променя ═══════════════════════════ */
  section('6. Магазин вижда цветна точка, не брояч');
  {
    const h = await env({ user: MANAGER, comps: comps('t-1', ['Троян']) });
    const { w, doc } = h;
    const html = w.calItemStatusHtml('t-1', 'regular', null, DUE);
    ok('няма брояч X/Y', countText(html) === null, html);
    ok('има точка (border-radius:50%)', html.indexOf('border-radius:50%') >= 0, html);
    ok('точката е зелена за собственото отмятане', html.indexOf('#16a34a') >= 0, html);

    if (guard('renderBulView() за магазин не хвърля', () => w.renderBulView())) {
      const cal = doc.querySelector('#sec-calendar');
      ok('в календара на магазина няма брояч /18',
        !!cal && cal.textContent.indexOf('/18') < 0);
    }
  }

  /* ═══ 7. Таб „Анализ" ════════════════════════════════════════════════ */
  section('7. renderBulAnalysis(): процентът е срещу 18');
  {
    const h = await env({ comps: comps('t-1', REAL) });
    const { w, doc } = h;
    w.bulMode = 'analysis';
    if (guard('renderBulAnalysis() не хвърля', () => w.renderBulAnalysis())) {
      await ticks();
      const tbl = doc.getElementById('an-tbl');
      if (ok('таблицата се попълва', !!tbl && tbl.textContent.indexOf('%') >= 0)) {
        ok('процентът е 100%', tbl.textContent.indexOf('100%') >= 0,
          (tbl.textContent.match(/\d+%/g) || []).join(' '));
        ok('НЕ е 78% (18/23)', tbl.textContent.indexOf('78%') < 0);
      }
    }
  }

  /* ═══ 8. Статистиката в панела със задачи ════════════════════════════ */
  section('8. loadTasksStats(): 18 реда, не 20');
  {
    const h = await env({ comps: comps('t-1', REAL) });
    const { w, doc } = h;
    if (guard('renderBulView() (admin) не хвърля', () => w.renderBulView())) {
      const wrap = doc.getElementById('tasks-stat-wrap');
      if (ok('контейнерът за статистиката съществува', !!wrap)) {
        guard('loadTasksStats() не хвърля', () => w.loadTasksStats());
        await ticks();
        const rows = Array.prototype.slice.call(wrap.querySelectorAll('tbody tr'));
        ok('редовете са 18', rows.length === 18, 'бр.: ' + rows.length);
        const txt = wrap.textContent;
        ok('няма логистични складове', WAREHOUSES.every(n => txt.indexOf(n) < 0));
        ok('няма Централен офис', txt.indexOf('Централен офис') < 0);
        ok('няма обекти без акаунт', NO_ACCOUNT.every(n => txt.indexOf(n) < 0));
        ok('всичките 18 реални са там', REAL.every(n => txt.indexOf(n) >= 0));
      }
    }
  }

  report();
})();
