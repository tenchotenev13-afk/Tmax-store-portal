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

    /* Задача само към недостижим обект. „0/1" би твърдяло, че има кой да я
       свърши; празно би изглеждало като счупен рендер (правило 11). Показва
       се тире с обяснение. */
    const html3 = w.calItemStatusHtml('t-1', 'regular', ['Пазарджик'], DUE);
    ok('задача само към обект без акаунт НЕ показва 0/1', countText(html3) === null, html3);
    ok('но и не е празна', html3 !== '', JSON.stringify(html3));
    ok('показва тире', html3.indexOf('>—<') >= 0, html3);
    ok('с обяснение в title',
      html3.indexOf('title="Няма обект с достъп до тази задача"') >= 0, html3);
    ok('и не е скрита', html3.indexOf('display:none') < 0);
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

  /* ═══ 9. Push за просрочени задачи — ОТПАДНА ════════════════════════
     Тук стояха две секции върху sendPushOverdueNow(): че известието отива
     само до 18-те отчетни обекта (не до ЦО, складовете и обектите без
     акаунт) и че отметналите отпадат от списъка. Функцията беше махната на
     27.08.2026 — кой е просрочен и кой получава го решава едж функцията
     bulletin-notify (тема overdue_tasks), която има СВОЙ reportableStores()
     със същия списък изключени обекти.

     Знаменателят от гледна точка на КЛИЕНТА е покрит от секции 1-8 по-горе
     (календарът и бройките). Клиентската страна на бутона е в
     tests/notify-topic-button.test.js. */

  /* ═══ 10. Първо отваряне на таба ════════════════════════════════════ */
  /* Броячът вече чака reportableStoresCache. Ако кешът закъснее и никой не
     пре-рендира, числата ще останат празни до ръчно превключване на таба —
     точно това пита loadBulletin(). Има два възможни реда:
       А) кешът пристига ПРЕДИ бюлетина -> първият рендер вече е с числа;
       Б) бюлетинът пристига пръв -> първият рендер е без числа, но
          .then на кеша прави втори рендер и те се появяват.
     И двата се проверяват през истинския loadBulletin(), не през подмяна. */
  section('10. loadBulletin(): числата се появяват сами при първо зареждане');

  function bootFull(delayUsers) {
    const now = new Date();
    const p = n => String(n).padStart(2, '0');
    const iso = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());
    const thu = new Date(now); thu.setHours(0, 0, 0, 0);
    thu.setDate(thu.getDate() + 3 - ((thu.getDay() + 6) % 7));
    const w1 = new Date(thu.getFullYear(), 0, 4);
    const wk = 1 + Math.round(((thu - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);

    const h = boot({
      modules: ['bulletin.js'],
      user: ADMIN,
      data: {
        users: USERS, stores: STORES_23,
        bulletins: [{
          id: 'b-1', week_number: wk, year: thu.getFullYear(), status: 'published',
          created_at: iso,
          content: { calendar: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
                     columns: { trade: [], warehouse: [], admin: [] } }
        }],
        bulletin_promotions: [], recurring_tasks: [], bulletin_subtasks: [],
        recurring_task_completions: [], subtask_completions: [],
        bulletin_tasks: [{
          id: 't-1', title: 'Задача', department: 'trade', task_type: 'info',
          due_dates: [iso], target_stores: null, bulletin_id: 'b-1'
        }],
        task_completions: REAL.map(s => ({
          task_id: 't-1', store_name: s, status: 'done', completion_date: iso
        }))
      }
    });
    if (!h.doc.getElementById('mod-bulletin')) {
      const el = h.doc.createElement('div'); el.id = 'mod-bulletin';
      h.doc.body.appendChild(el);
    }
    if (delayUsers) {
      /* Отговорът за users идва СЛЕД цялата верига на бюлетина. */
      const real = h.w.fetch;
      h.w.fetch = function (url, init) {
        if (String(url).indexOf('/users') < 0) return real(url, init);
        return new Promise(function (resolve) {
          let n = 0;
          (function tick() {
            if (++n > 40) { real(url, init).then(resolve); return; }
            setTimeout(tick, 0);
          })();
        });
      };
    }
    return h;
  }

  function calCounts(doc) {
    const cal = doc.querySelector('#sec-calendar');
    return cal ? (cal.textContent.match(/\d+\/\d+/g) || []).join(' ') : null;
  }

  /* ── Път А: нормалният ред (кешът е по-бърз от веригата на бюлетина) ── */
  {
    const h = bootFull(false);
    guard('loadBulletin() не хвърля', () => h.w.loadBulletin());
    for (let i = 0; i < 12; i++) await ticks();
    ok('[А] календарът се рендира', !!h.doc.querySelector('#sec-calendar'));
    ok('[А] числата са налице веднага', calCounts(h.doc) === '18/18', String(calCounts(h.doc)));
  }

  /* ── Път Б: кешът закъснява след първия рендер ── */
  {
    const h = bootFull(true);
    guard('loadBulletin() не хвърля', () => h.w.loadBulletin());
    for (let i = 0; i < 12; i++) await ticks();
    ok('[Б] първият рендер е минал', !!h.doc.querySelector('#sec-calendar'));
    ok('[Б] кешът още го няма', !h.w.reportableStoresCache,
      String(h.w.reportableStoresCache && h.w.reportableStoresCache.length));
    ok('[Б] числата още липсват (очаквано)', calCounts(h.doc) === '',
      String(calCounts(h.doc)));

    /* Кешът пристига -> .then прави втори рендер. Никой не пипа таба. */
    for (let i = 0; i < 80; i++) await ticks();
    ok('[Б] кешът вече е зареден',
      !!h.w.reportableStoresCache && h.w.reportableStoresCache.length === 18,
      String(h.w.reportableStoresCache && h.w.reportableStoresCache.length));
    ok('[Б] числата се появяват САМИ, без ръчно пре-рендиране',
      calCounts(h.doc) === '18/18', String(calCounts(h.doc)));
  }

  report();
})();
