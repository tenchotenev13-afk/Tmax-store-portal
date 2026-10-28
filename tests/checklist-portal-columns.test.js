/* Чек лист — три ръчни колони се пълнят от портала (22.10.2026).

   Правилото: чек листът взема СЪЩАТА отметка, която Бюлетинът вече прави
   автоматично. Нова колона = връзка към постоянната задача (source
   'recurring:<uuid>' в weekly_checklist_metrics) + режим в
   CHECKLIST_PORTAL_MODE. Миграция weekly_checklist_portal_columns.

   Какво заковава файлът:
   1. Трите ключа са в CHECKLIST_PORTAL_MODE с правилния режим;
      checklistAutoMetrics() ги връща при 'recurring:…' и НЕ при 'manual'
      (редовете до прилагането на миграцията).
   2. razliki_dostavka („РАЗЛИКИ ЛОГИСТИЧНИ СКЛАДОВЕ", Пон–Пет) → „3/5";
      без отмятане „0/5"; събота не влиза.
   3. srok_godnost („СПИСЪК СТОКА ЗА ВРЪЩАНЕ", сряда) → da; четвъртък → ne;
      пренесено (postponed_to) — по новата дата.
   4. zanulyavane_lm — от 28.10.2026 ОТНОВО РЪЧНА (решение на Тенчо: друг вид
      задача, Миглена я отмята; миграция weekly_checklist_zanulyavane_manual).
      Няма режим в CHECKLIST_PORTAL_MODE, затова дори при стария източник
      'recurring:72aed3fc…' клетката остава празна — отметките по „ЗАРЕЖДАНЕ
      АРТИКУЛИ НА Л.М." не я пълнят.
   5. stoka_vrashtane чете само stock_returns source=eq.diff — рекламациите
      са в srok_godnost и не се броят два пъти.

   Етап 2 (checklist-live-calc, 26.10.2026): отварянето вече не пише
   portal_value — стойностите се проверяват през checklistComputePortalValues()
   (правилото без запис), а при отваряне се очакват нула записа.

   Седмицата е закована: С43/2026 (пон 19.10 – нд 25.10).

   Пускане:  node tests/checklist-portal-columns.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const SROK_ID = '0a20f6e8-c526-400b-bed5-57194f35e4e5';
const RAZL_ID = '166a22f8-c884-4019-862d-4f20175baa12';
const LM_ID   = '72aed3fc-1720-4205-be89-feb242b2627f';

const YEAR = 2026, WEEK = 43;
const WK = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22',
            '2026-10-23', '2026-10-24', '2026-10-25'];

function metrics(src) {
  src = src || {};
  return [
    ['stoka_vrashtane',  'Стока за връщане- ТАБЛИЦИ',  'module:returns'],
    ['zanulyavane_lm',   'таблица зануляване л.м.',    src.lm   || 'recurring:' + LM_ID],
    ['razliki_dostavka', 'Разлики от доставка',        src.razl || 'recurring:' + RAZL_ID],
    ['srok_godnost',     'Срок на годност/рекламации', src.srok || 'recurring:' + SROK_ID]
  ].map(function (a, i) {
    return { key: a[0], label: a[1], sublabel: '', value_type: 'yes_no', source: a[2],
             sort_order: i + 1, active: true, deadline_day: null };
  });
}

const TASKS = [
  { id: SROK_ID, due_weekdays: [2] },
  { id: RAZL_ID, due_weekdays: [0, 1, 2, 3, 4] },
  { id: LM_ID,   due_weekdays: [0] }
];

const USERS = ['Враца', 'Габрово', 'Добрич', 'Централен офис']
  .map(function (s) { return { store_name: s }; });

const ADMIN = { id:'u-1', email:'m.controlling@temax.bg', display_name:'Контролинг',
                role:'admin', store_name:'Централен офис' };

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
      goods_transit: []
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

let seq = 0;
function comp(taskId, store, dateISO, extra) {
  return Object.assign({ id: 'c-' + (++seq), recurring_task_id: taskId, store_name: store,
                         completion_date: dateISO, status: 'done', comment: null, files: [] }, extra || {});
}

/* Записите към weekly_checklist — от етап 2 при отваряне трябва да са НУЛА. */
function writes(h) {
  return h.calls.post.filter(function (p) { return (p.url || '').indexOf('/weekly_checklist?') >= 0; });
}
/* Стойността по правилото (checklistComputePortalValues); undefined = „не се пълни". */
function pv(h, store, key) { return (h.__vals || {})[store + '|' + key]; }

(async function () {

  /* ── 0. Седмицата ───────────────────────────────────────────────────── */
  {
    const h = env();
    const iso = h.w.weekDays(WEEK, YEAR).map(h.w.toLocalISO);
    ok('С43/2026 е 19.10–25.10', JSON.stringify(iso) === JSON.stringify(WK), JSON.stringify(iso));
    h.close();
  }

  /* ── 1. Режимите и източникът ───────────────────────────────────────── */
  section('1. CHECKLIST_PORTAL_MODE и checklistAutoMetrics()');
  {
    const h = env();
    const M = h.w.CHECKLIST_PORTAL_MODE;
    ok('srok_godnost → any', M.srok_godnost === 'any', M.srok_godnost);
    ok('zanulyavane_lm — без режим (ръчна от 28.10)', M.zanulyavane_lm === undefined, M.zanulyavane_lm);
    ok('razliki_dostavka → count', M.razliki_dostavka === 'count', M.razliki_dostavka);
    ok('razhodi и dogovoreni_returi остават без режим', !M.razhodi && !M.dogovoreni_returi);

    h.w.checklistMetrics = metrics();
    const autoKeys = h.w.checklistAutoMetrics().map(function (m) { return m.key; }).sort();
    ok('при recurring: — srok_godnost и razliki_dostavka; zanulyavane_lm — НЕ (без режим, дори при стария източник)',
       JSON.stringify(autoKeys) === JSON.stringify(['razliki_dostavka', 'srok_godnost']), JSON.stringify(autoKeys));

    h.w.checklistMetrics = metrics({ lm: 'manual', razl: 'manual', srok: 'manual' });
    const before = h.w.checklistAutoMetrics().length;
    ok('при manual (преди миграцията) — нито една', before === 0, String(before));
    h.close();
  }
  {
    /* Преди миграцията: отмятания има, но колоните са manual → нищо не се пълни. */
    const h = env({
      metrics: metrics({ lm: 'manual', razl: 'manual', srok: 'manual' }),
      comps: [comp(SROK_ID, 'Враца', WK[2]), comp(RAZL_ID, 'Враца', WK[0]), comp(LM_ID, 'Враца', WK[0])]
    });
    await open(h);
    ok('manual → порталът не пълни трите колони',
       ['srok_godnost', 'razliki_dostavka', 'zanulyavane_lm'].every(function (k) { return pv(h, 'Враца', k) === undefined; }),
       JSON.stringify(h.__vals));
    h.close();
  }

  /* ── 2. Разлики от доставка ─────────────────────────────────────────── */
  section('2. razliki_dostavka — брой дни Пон–Пет');
  {
    const h = env({ comps: [
      comp(RAZL_ID, 'Враца', WK[0]),   /* пон */
      comp(RAZL_ID, 'Враца', WK[1]),   /* вт */
      comp(RAZL_ID, 'Враца', WK[3]),   /* чет */
      comp(RAZL_ID, 'Враца', WK[3]),   /* втори ред в същия ден — един ден */
      comp(RAZL_ID, 'Габрово', WK[5]), /* събота — не влиза */
      comp(RAZL_ID, 'Добрич', WK[0]),
      comp(RAZL_ID, 'Добрич', WK[1]),
      comp(RAZL_ID, 'Добрич', WK[2]),
      comp(RAZL_ID, 'Добрич', WK[3]),
      comp(RAZL_ID, 'Добрич', WK[4])
    ]});
    await open(h);
    ok('пон, вт, чет → „3/5"', pv(h, 'Враца', 'razliki_dostavka') === '3/5', JSON.stringify(pv(h, 'Враца', 'razliki_dostavka')));
    ok('само събота → „0/5"', pv(h, 'Габрово', 'razliki_dostavka') === '0/5', JSON.stringify(pv(h, 'Габрово', 'razliki_dostavka')));
    ok('всичките пет → „5/5"', pv(h, 'Добрич', 'razliki_dostavka') === '5/5', JSON.stringify(pv(h, 'Добрич', 'razliki_dostavka')));
    ok('при отваряне — нула записа към weekly_checklist (етап 2)', writes(h).length === 0, 'реално: ' + writes(h).length);
    h.close();
  }

  /* ── 3. Срок на годност / рекламации ────────────────────────────────── */
  section('3. srok_godnost — „СПИСЪК СТОКА ЗА ВРЪЩАНЕ", сряда');
  {
    const h = env({ comps: [
      comp(SROK_ID, 'Враца', WK[2]),                              /* сряда */
      comp(SROK_ID, 'Габрово', WK[3]),                            /* четвъртък */
      comp(SROK_ID, 'Добрич', '2026-10-14', { postponed_to: WK[4] }) /* от предната сряда, пренесено в петък */
    ]});
    await open(h);
    ok('сряда → da', pv(h, 'Враца', 'srok_godnost') === 'da', JSON.stringify(pv(h, 'Враца', 'srok_godnost')));
    ok('четвъртък → ne', pv(h, 'Габрово', 'srok_godnost') === 'ne', JSON.stringify(pv(h, 'Габрово', 'srok_godnost')));
    ok('пренесено в седмицата → da по новата дата', pv(h, 'Добрич', 'srok_godnost') === 'da', JSON.stringify(pv(h, 'Добрич', 'srok_godnost')));
    h.close();
  }
  {
    /* Пренесено ОТ седмицата навън: сряда → следващ понеделник. */
    const h = env({ comps: [comp(SROK_ID, 'Враца', WK[2], { postponed_to: '2026-10-26' })] });
    await open(h);
    ok('пренесено извън седмицата → клетката празна (нищо не се дължи)', pv(h, 'Враца', 'srok_godnost') === undefined,
       JSON.stringify(pv(h, 'Враца', 'srok_godnost')));
    h.close();
  }

  /* ── 4. Зануляване л.м. ─────────────────────────────────────────────── */
  section('4. zanulyavane_lm — ръчна: отметките по „ЗАРЕЖДАНЕ АРТИКУЛИ НА Л.М." не я пълнят');
  {
    const h = env({ comps: [
      comp(LM_ID, 'Враца', WK[0]),
      comp(LM_ID, 'Габрово', WK[0], { comment: 'нямам нужда' }),  /* авто отметка от supply_no_need */
      comp(LM_ID, 'Добрич', WK[1])                                 /* вторник — извън срока */
    ]});
    await open(h);
    ok('понеделник (беше da) → празно', pv(h, 'Враца', 'zanulyavane_lm') === undefined, JSON.stringify(pv(h, 'Враца', 'zanulyavane_lm')));
    ok('„нямам нужда" (беше da) → празно', pv(h, 'Габрово', 'zanulyavane_lm') === undefined, JSON.stringify(pv(h, 'Габрово', 'zanulyavane_lm')));
    ok('вторник (беше ne) → празно', pv(h, 'Добрич', 'zanulyavane_lm') === undefined, JSON.stringify(pv(h, 'Добрич', 'zanulyavane_lm')));
    h.close();
  }

  /* ── 5. Стока за връщане — само по разлики ──────────────────────────── */
  section('5. stoka_vrashtane — stock_returns само source=eq.diff');
  {
    const h = env({ returns: [{ store_name: 'Враца', status: 'taken', confirmed_date: null, source: 'diff' }] });
    await open(h);
    const q = h.calls.get.filter(function (u) { return u.indexOf('/stock_returns') >= 0; });
    ok('има заявка към stock_returns', q.length > 0, JSON.stringify(q));
    ok('всяка заявка носи source=eq.diff', q.length > 0 && q.every(function (u) { return /[?&]source=eq\.diff(&|$)/.test(u); }), JSON.stringify(q));
    ok('CHECKLIST_MODULE_FILL.returns.query има филтъра',
       /(^|&)source=eq\.diff(&|$)/.test(h.w.CHECKLIST_MODULE_FILL.returns.query), h.w.CHECKLIST_MODULE_FILL.returns.query);
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
