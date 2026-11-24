/* Чек лист — колоната „Стока за връщане- ТАБЛИЦИ" (stoka_vrashtane).

   ОТ 24.11.2026 (решение на Тенчо по писмо на Миглена Павлова „чек лист"):
   стойността идва от постоянната задача в сряда „СПИСЪК СТОКА ЗА ИЗТЕГЛЯНЕ
   ПО РАЗЛИКИ" (recurring_tasks e9d418af…), режим 'any' → da/ne — точно
   както srok_godnost от „СПИСЪК СТОКА ЗА ВРЪЩАНЕ". Отметката я слага
   stock_returns_sync_completions() в базата ('auto:stock-returns') и след
   срядата се замразява. Миграция 20261124120000_weekly_checklist_stoka_vrashtane_task.

   ДОТОГАВА (02.09 – 23.11.2026) колоната беше 'module:returns' — „обработени
   / всички" записи stock_returns source='diff' към МОМЕНТА на затварянето.
   Ред, влязъл в четвъртък или петък, излизаше като необработен („10/11")
   за седмица, в която обектът си е свършил работата в сряда. Записът
   'returns' в CHECKLIST_MODULE_FILL и checklistReturnsValue() са махнати.

   Какво заковава файлът:
   1. Режимът ('any'), източникът и че модулният път го няма.
   2. Сряда с отметка → da; без отметка → ne; отметка в четвъртък → ne.
   3. Ред в stock_returns от четвъртък (необработен) НЕ прави колоната „не" —
      таблицата stock_returns изобщо не се чете.
   4. Отметка по „СПИСЪК СТОКА ЗА ВРЪЩАНЕ" (srok_godnost) не пълни тази колона
      и обратно.
   5. Старият source 'module:returns' вече не дава стойност.
   6. „Пропуски" в писмото: „не" → пропуск „Стока за връщане- ТАБЛИЦИ: не";
      „да" → няма.

   МУТАЦИОННА ПРОВЕРКА (24.11.2026, ръчно, върху временно променен
   checklist.js; всяка събаря теста, после файлът е върнат):
     М1 stoka_vrashtane махнат от CHECKLIST_PORTAL_MODE;
     М2 stoka_vrashtane: 'count' вместо 'any' („1/1" вместо „da");
     М3 записът returns върнат в CHECKLIST_MODULE_FILL.

   Седмицата е закована: С48/2026 (пон 23.11 – нд 29.11; сряда 25.11).

   Пускане:  node tests/checklist-returns.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const VRA_ID  = 'e9d418af-311a-45ec-b4da-0f9ad69205e7';   /* СПИСЪК СТОКА ЗА ИЗТЕГЛЯНЕ ПО РАЗЛИКИ */
const SROK_ID = '0a20f6e8-c526-400b-bed5-57194f35e4e5';   /* СПИСЪК СТОКА ЗА ВРЪЩАНЕ */

const YEAR = 2026, WEEK = 48;
const WK = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26',
            '2026-11-27', '2026-11-28', '2026-11-29'];

function metrics(src) {
  src = src || {};
  return [
    { key: 'stoka_vrashtane', label: 'Стока за връщане- ТАБЛИЦИ', sublabel: 'изтегляне по разлики — потвърдено от обекта',
      value_type: 'yes_no', sort_order: 1, active: true, deadline_day: null,
      source: src.vra || 'recurring:' + VRA_ID, portal_mode: 'any' },
    { key: 'srok_godnost', label: 'Срок на годност/рекламации', sublabel: '',
      value_type: 'yes_no', sort_order: 2, active: true, deadline_day: null,
      source: 'recurring:' + SROK_ID, portal_mode: 'any' }
  ];
}

const TASKS = [
  { id: VRA_ID,  due_weekdays: [2], active: true, task_type: 'info' },
  { id: SROK_ID, due_weekdays: [2], active: true, task_type: 'comment' }
];

const USERS = ['Враца', 'Габрово', 'Добрич', 'Сливен', 'Централен офис']
  .map(function (s) { return { store_name: s }; });

const ADMIN = { id: 'u-1', email: 'm.controlling@temax.bg', display_name: 'Контролинг',
                role: 'admin', store_name: 'Централен офис' };

let seq = 0;
function comp(taskId, store, dateISO, extra) {
  return Object.assign({ id: 'c-' + (++seq), recurring_task_id: taskId, store_name: store,
                         completion_date: dateISO, status: 'done', completed_by: 'auto:stock-returns',
                         comment: null, files: [], postponed_to: null }, extra || {});
}
function ret(store, created, status, confirmed) {
  return { id: 'r-' + (++seq), store_name: store, source: 'diff', status: status || 'pending',
           confirmed_date: confirmed || null, created_at: created + 'T10:00:00+02:00' };
}

function env(opts) {
  opts = opts || {};
  return boot({
    modules: ['bulletin.js', 'checklist.js'],
    user: ADMIN,
    data: {
      users: USERS,
      weekly_checklist_metrics: opts.metrics || metrics(),
      weekly_checklist: [],
      recurring_tasks: TASKS,
      recurring_task_versions: [],
      recurring_task_periods: [],
      recurring_task_skips: [],
      task_completions: opts.comps || [],
      stock_returns: opts.returns || [],
      goods_transit: [],
      rpc: []
    }
  });
}

async function open(h) {
  h.w.checklistYear = YEAR;
  h.w.checklistWeek = WEEK;
  h.w.loadChecklist();
  await ticks();
  h.__vals = await h.w.checklistComputePortalValues();
}
function pv(h, store, key) { return (h.__vals || {})[store + '|' + key]; }
function returnsGets(h) { return h.calls.get.filter(function (u) { return u.indexOf('/stock_returns') >= 0; }); }

(async function () {

  /* ── 0. Седмицата ───────────────────────────────────────────────────── */
  {
    const h = env();
    const iso = h.w.weekDays(WEEK, YEAR).map(h.w.toLocalISO);
    ok('С48/2026 е 23.11–29.11', JSON.stringify(iso) === JSON.stringify(WK), JSON.stringify(iso));
    h.close();
  }

  /* ── 1. Режим и източник ────────────────────────────────────────────── */
  section('1. stoka_vrashtane — режим any; модулният път го няма');
  {
    const h = env();
    ok('CHECKLIST_PORTAL_MODE.stoka_vrashtane === any', h.w.CHECKLIST_PORTAL_MODE.stoka_vrashtane === 'any',
       String(h.w.CHECKLIST_PORTAL_MODE.stoka_vrashtane));
    ok('CHECKLIST_MODULE_FILL няма запис returns', !Object.prototype.hasOwnProperty.call(h.w.CHECKLIST_MODULE_FILL, 'returns'),
       Object.keys(h.w.CHECKLIST_MODULE_FILL).join(','));
    ok('checklistReturnsValue() е махната', typeof h.w.checklistReturnsValue === 'undefined');
    h.w.checklistMetrics = metrics();
    const keys = h.w.checklistAutoMetrics().map(function (m) { return m.key; }).sort();
    ok('checklistAutoMetrics() → srok_godnost и stoka_vrashtane',
       JSON.stringify(keys) === JSON.stringify(['srok_godnost', 'stoka_vrashtane']), JSON.stringify(keys));
    ok('uuid-ът се чете от source', h.w.checklistRecurringId(metrics()[0]) === VRA_ID);
    h.close();
  }

  /* ── 2. Сряда / без отметка / четвъртък ─────────────────────────────── */
  section('2. Отметката в сряда решава: da / ne');
  {
    const h = env({ comps: [
      comp(VRA_ID, 'Враца', WK[2]),                                       /* сряда, автоматична */
      comp(VRA_ID, 'Габрово', WK[3], { completed_by: 'Управител' }),      /* четвъртък */
      comp(VRA_ID, 'Сливен', WK[2], { completed_by: 'Управител Сливен' }) /* сряда, ръчна (на 07.10 имаше такива) */
    ]});
    await open(h);
    ok('сряда (auto:stock-returns) → da', pv(h, 'Враца', 'stoka_vrashtane') === 'da', JSON.stringify(pv(h, 'Враца', 'stoka_vrashtane')));
    ok('четвъртък → ne', pv(h, 'Габрово', 'stoka_vrashtane') === 'ne', JSON.stringify(pv(h, 'Габрово', 'stoka_vrashtane')));
    ok('без отметка → ne (не празно)', pv(h, 'Добрич', 'stoka_vrashtane') === 'ne', JSON.stringify(pv(h, 'Добрич', 'stoka_vrashtane')));
    ok('ръчна отметка в сряда → da', pv(h, 'Сливен', 'stoka_vrashtane') === 'da', JSON.stringify(pv(h, 'Сливен', 'stoka_vrashtane')));
    ok('ЦО не влиза', pv(h, 'Централен офис', 'stoka_vrashtane') === undefined);
    h.close();
  }

  /* ── 3. Повод за промяната: ред от четвъртък ───────────────────────── */
  section('3. Ред в stock_returns от четвъртък не прави колоната „не"');
  {
    const h = env({
      comps: [comp(VRA_ID, 'Враца', WK[2])],
      returns: [
        ret('Враца', '2026-11-20', 'taken'),                 /* от миналата седмица, обработен */
        ret('Враца', '2026-11-23', 'pending', '2026-11-24'), /* понеделник, потвърден */
        ret('Враца', WK[3], 'pending'),                      /* ЧЕТВЪРТЪК, необработен */
        ret('Враца', WK[4], 'pending')                       /* петък, необработен */
      ]
    });
    await open(h);
    /* Старото правило би дало „2/4" — тоест пропуск в писмото. */
    ok('Враца → da (не „2/4", не „ne")', pv(h, 'Враца', 'stoka_vrashtane') === 'da', JSON.stringify(pv(h, 'Враца', 'stoka_vrashtane')));
    ok('stock_returns изобщо не се чете', returnsGets(h).length === 0, JSON.stringify(returnsGets(h)));
    h.close();
  }

  /* ── 4. Двете сряди не се смесват ───────────────────────────────────── */
  section('4. „СПИСЪК СТОКА ЗА ВРЪЩАНЕ" ≠ „… ЗА ИЗТЕГЛЯНЕ ПО РАЗЛИКИ"');
  {
    const h = env({ comps: [
      comp(SROK_ID, 'Враца', WK[2]),   /* само рекламациите */
      comp(VRA_ID, 'Габрово', WK[2])   /* само разликите */
    ]});
    await open(h);
    ok('Враца: srok_godnost da, stoka_vrashtane ne',
       pv(h, 'Враца', 'srok_godnost') === 'da' && pv(h, 'Враца', 'stoka_vrashtane') === 'ne',
       JSON.stringify([pv(h, 'Враца', 'srok_godnost'), pv(h, 'Враца', 'stoka_vrashtane')]));
    ok('Габрово: srok_godnost ne, stoka_vrashtane da',
       pv(h, 'Габрово', 'srok_godnost') === 'ne' && pv(h, 'Габрово', 'stoka_vrashtane') === 'da',
       JSON.stringify([pv(h, 'Габрово', 'srok_godnost'), pv(h, 'Габрово', 'stoka_vrashtane')]));
    h.close();
  }

  /* ── 5. Старият source ──────────────────────────────────────────────── */
  section('5. source module:returns (преди миграцията) → нищо');
  {
    const h = env({
      metrics: metrics({ vra: 'module:returns' }),
      comps: [comp(VRA_ID, 'Враца', WK[2])],
      returns: [ret('Враца', WK[0], 'taken')]
    });
    await open(h);
    ok('няма стойност за stoka_vrashtane', pv(h, 'Враца', 'stoka_vrashtane') === undefined,
       JSON.stringify(pv(h, 'Враца', 'stoka_vrashtane')));
    ok('и stock_returns не се чете', returnsGets(h).length === 0, JSON.stringify(returnsGets(h)));
    h.close();
  }

  /* ── 6. Пропуските в писмото ────────────────────────────────────────── */
  section('6. „Пропуски": „не" се хваща, „да" — не');
  {
    const h = env();
    const M = metrics();
    function row(store, f) {
      return Object.assign({ year: YEAR, week_number: WEEK, store_name: store, metric_key: 'stoka_vrashtane',
                             portal_value: null, control_value: null, control_num: null, comment: null }, f);
    }
    const gNe = h.w.checklistStoreGaps('Враца', [row('Враца', { portal_value: 'ne' })], M, {});
    ok('portal „ne" → един пропуск „не"', gNe.length === 1 && gNe[0].text === 'не' && gNe[0].metric.key === 'stoka_vrashtane',
       JSON.stringify(gNe.map(function (g) { return [g.metric.key, g.text]; })));
    const html = h.w.checklistEmailGapsHtml('Враца', WEEK, gNe);
    ok('в блока: „Стока за връщане- ТАБЛИЦИ</b>: не"', html.indexOf('Стока за връщане- ТАБЛИЦИ</b>: не') >= 0, html);
    const gDa = h.w.checklistStoreGaps('Враца', [row('Враца', { portal_value: 'da' })], M, {});
    ok('portal „da" → без пропуск', gDa.length === 0, JSON.stringify(gDa.length));
    const gFix = h.w.checklistStoreGaps('Враца', [row('Враца', { portal_value: 'ne', control_value: 'da' })], M, {});
    ok('portal „ne", контролинг „da" → без пропуск', gFix.length === 0, JSON.stringify(gFix.length));
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
