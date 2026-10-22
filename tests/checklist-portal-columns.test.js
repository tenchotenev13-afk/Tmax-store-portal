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
   4. zanulyavane_lm („ЗАРЕЖДАНЕ АРТИКУЛИ НА Л.М.", понеделник) → da;
      авто отметката „нямам нужда" е обикновен task_completions ред → da.
   5. stoka_vrashtane чете само stock_returns source=eq.diff — рекламациите
      са в srok_godnost и не се броят два пъти.

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
}

let seq = 0;
function comp(taskId, store, dateISO, extra) {
  return Object.assign({ id: 'c-' + (++seq), recurring_task_id: taskId, store_name: store,
                         completion_date: dateISO, status: 'done', comment: null, files: [] }, extra || {});
}

function bodyOf(p) { return Array.isArray(p.body) ? p.body : [p.body]; }
function writes(h) {
  return h.calls.post.filter(function (p) { return (p.url || '').indexOf('/weekly_checklist?') >= 0; });
}
function written(h, store, key) {
  let out = null;
  writes(h).forEach(function (p) {
    bodyOf(p).forEach(function (r) {
      if (r.store_name === store && r.metric_key === key) out = r;
    });
  });
  return out;
}
function pv(h, store, key) { const r = written(h, store, key); return r ? r.portal_value : undefined; }

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
    ok('zanulyavane_lm → any', M.zanulyavane_lm === 'any', M.zanulyavane_lm);
    ok('razliki_dostavka → count', M.razliki_dostavka === 'count', M.razliki_dostavka);
    ok('razhodi и dogovoreni_returi остават без режим', !M.razhodi && !M.dogovoreni_returi);

    h.w.checklistMetrics = metrics();
    const autoKeys = h.w.checklistAutoMetrics().map(function (m) { return m.key; }).sort();
    ok('при recurring: — и трите са автоматични',
       JSON.stringify(autoKeys) === JSON.stringify(['razliki_dostavka', 'srok_godnost', 'zanulyavane_lm']), JSON.stringify(autoKeys));

    h.w.checklistMetrics = metrics({ lm: 'manual', razl: 'manual', srok: 'manual' });
    const before = h.w.checklistAutoMetrics().length;
    ok('при manual (преди миграцията) — нито една', before === 0, String(before));
    h.close();
  }
  {
    /* Преди миграцията: отмятания има, но колоните са manual → нищо не се пише. */
    const h = env({
      metrics: metrics({ lm: 'manual', razl: 'manual', srok: 'manual' }),
      comps: [comp(SROK_ID, 'Враца', WK[2]), comp(RAZL_ID, 'Враца', WK[0]), comp(LM_ID, 'Враца', WK[0])]
    });
    await open(h);
    ok('manual → порталът не пише в трите колони',
       ['srok_godnost', 'razliki_dostavka', 'zanulyavane_lm'].every(function (k) { return written(h, 'Враца', k) === null; }));
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
    ok('пон, вт, чет → „3/5"', pv(h, 'Враца', 'razliki_dostavka') === '3/5', JSON.stringify(written(h, 'Враца', 'razliki_dostavka')));
    ok('само събота → „0/5"', pv(h, 'Габрово', 'razliki_dostavka') === '0/5', JSON.stringify(written(h, 'Габрово', 'razliki_dostavka')));
    ok('всичките пет → „5/5"', pv(h, 'Добрич', 'razliki_dostavka') === '5/5', JSON.stringify(written(h, 'Добрич', 'razliki_dostavka')));
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
    ok('сряда → da', pv(h, 'Враца', 'srok_godnost') === 'da', JSON.stringify(written(h, 'Враца', 'srok_godnost')));
    ok('четвъртък → ne', pv(h, 'Габрово', 'srok_godnost') === 'ne', JSON.stringify(written(h, 'Габрово', 'srok_godnost')));
    ok('пренесено в седмицата → da по новата дата', pv(h, 'Добрич', 'srok_godnost') === 'da', JSON.stringify(written(h, 'Добрич', 'srok_godnost')));
    h.close();
  }
  {
    /* Пренесено ОТ седмицата навън: сряда → следващ понеделник. */
    const h = env({ comps: [comp(SROK_ID, 'Враца', WK[2], { postponed_to: '2026-10-26' })] });
    await open(h);
    ok('пренесено извън седмицата → клетката празна (нищо не се дължи)', written(h, 'Враца', 'srok_godnost') === null,
       JSON.stringify(written(h, 'Враца', 'srok_godnost')));
    h.close();
  }

  /* ── 4. Зануляване л.м. ─────────────────────────────────────────────── */
  section('4. zanulyavane_lm — „ЗАРЕЖДАНЕ АРТИКУЛИ НА Л.М.", понеделник');
  {
    const h = env({ comps: [
      comp(LM_ID, 'Враца', WK[0]),
      comp(LM_ID, 'Габрово', WK[0], { comment: 'нямам нужда' }),  /* авто отметка от supply_no_need */
      comp(LM_ID, 'Добрич', WK[1])                                 /* вторник — извън срока */
    ]});
    await open(h);
    ok('понеделник → da', pv(h, 'Враца', 'zanulyavane_lm') === 'da', JSON.stringify(written(h, 'Враца', 'zanulyavane_lm')));
    ok('„нямам нужда" → da', pv(h, 'Габрово', 'zanulyavane_lm') === 'da', JSON.stringify(written(h, 'Габрово', 'zanulyavane_lm')));
    ok('вторник → ne', pv(h, 'Добрич', 'zanulyavane_lm') === 'ne', JSON.stringify(written(h, 'Добрич', 'zanulyavane_lm')));
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
