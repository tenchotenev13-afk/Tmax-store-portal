/* Сервиз Троян не е 19-и обект в отчетите (29.09.2026).

   Акаунтът service.troyan@temax.bg (role user) се мести от store_name
   'Троян' на 'Сервиз Троян', за да участва в Трансферите. Сервизът няма
   седмичен бюлетин и никога не отмята задачи. Порталът го изключваше през
   REPORT_EXCLUDED_DEFAULT (shared.js), но двете едж функции с отчетите
   носеха СВОЙ списък само с ЦО и двата склада — сервизът щеше да излезе
   с 0% в дневния/седмичния отчет, в „последните 3", „неизпълнени",
   палетите („N от 19") и като „неизпълнил" в личните картички.

   Какво заковава файлът:
   1. СПИСЪЦИТЕ СА ЕДИН И СЪЩ — send-scheduled-report, send-routed-report,
      bulletin-notify и REPORT_EXCLUDED_DEFAULT в shared.js.
   2. ПОВЕДЕНИЕТО. Колекторите в двете едж функции са ДОСЛОВНО копие на
      report.js (заковано в report-edge-sync.test.js), затова се пускат
      тук през report.js, но със списъка, ИЗВАДЕН ОТ ЕДЖ ФАЙЛА. Сервиз Троян
      с 0 отметки не мени процента, „последните 3", laggards, палетите
      (N от 18) и routed „неизпълнил".
   3. КОНТРОЛ СРЕЩУ ТАВТОЛОГИЯ: същото със списъка отпреди поправката
      (55f9d5b) — сервизът там СЕ ПОЯВЯВА. Без тази секция тестът би минал
      и срещу код, който изобщо не филтрира.
   4. Бюлетин → Анализ: отметка от необект не вдига „🏪 Магазини" и
      процента на задачата.

   Пускане:  node tests/report-service-troyan.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const SERVICE = 'Сервиз Троян';

/* Изважда списъка с изключени обекти от едж файл: двата реда var
   LOGISTICS_WAREHOUSES / REPORT_EXCLUDED_STORES, изпълнени в празен обхват. */
function edgeList(src) {
  const lw = src.match(/^var LOGISTICS_WAREHOUSES = .*;$/m);
  const re = src.match(/^var REPORT_EXCLUDED_STORES = .*;$/m);
  if (!lw || !re) throw new Error('няма REPORT_EXCLUDED_STORES в едж файла');
  return new Function(lw[0] + '\n' + re[0] + '\nreturn REPORT_EXCLUDED_STORES;')();
}
const read = function (p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); };
const SCHED = edgeList(read('supabase/functions/send-scheduled-report/index.ts'));
const ROUTED = edgeList(read('supabase/functions/send-routed-report/index.ts'));
/* Списъкът отпреди поправката — за контрола в секция 3. */
const OLD = ['Централен офис', 'Логистичен склад Добрич', 'Логистичен склад Търговище'];

const sorted = function (a) { return a.slice().sort().join('|'); };

/* 18 отчетни + ЦО + двата склада + СЕРВИЗЪТ. */
const STORES18 = ['Враца', 'Габрово', 'Гоце Делчев', 'Добрич', 'Дупница', 'Карлово',
  'Козлодуй', 'Кърджали', 'Монтана', 'Петрич', 'Пирдоп', 'Раднево', 'Севлиево',
  'Силистра', 'Сливен', 'Троян', 'Търговище', 'Шумен'];
const USERS = STORES18.concat(['Централен офис', 'Логистичен склад Добрич',
  'Логистичен склад Търговище', SERVICE]).map(function (s) { return { store_name: s }; });

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function env(list, data) {
  const h = boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: Object.assign({
      users: USERS, bulletins: [], recurring_tasks: [], bulletin_tasks: [],
      task_completions: [], report_snapshots: [], transport_pallets: [], app_settings: []
    }, data || {})
  });
  /* Списъкът на ЕДЖ функцията вместо този на портала. Зареждането от
     app_settings се блокира, за да не го презапише. */
  h.w.REPORT_EXCLUDED_STORES = list.slice();
  h.w.reportExcludedLoaded = Promise.resolve(h.w.REPORT_EXCLUDED_STORES);
  return h;
}

/* Дневният отчет: една постоянна задача за деня, отметната от първите N. */
function dailySummary(list, doneCount) {
  const probe = env(list);
  const day = probe.w.reportDailyTargetDate(new Date());
  const dayISO = probe.w.toLocalISO(day);
  const idx = probe.w.reportWeekdayIdx(day);
  probe.close();
  const h = env(list, {
    recurring_tasks: [{ id: 'r-1', active: true, due_weekdays: [idx], title: 'Каса — отчет' }],
    task_completions: STORES18.slice(0, doneCount).map(function (s) {
      return { recurring_task_id: 'r-1', store_name: s, status: 'done', comment: '', photos: [], completion_date: dayISO };
    })
  });
  return new Promise(function (res) { h.w.collectDailyReportData(function (s) { h.close(); res(s); }, null); });
}

function palletsSummary(list) {
  const h = env(list);
  return new Promise(function (res) { h.w.collectPalletsReportData(null, function (s) { h.close(); res(s); }); });
}

function routedPending(list) {
  const h = env(list);
  const all = USERS.filter(function (u) { return h.w.isReportableStore(u.store_name); })
    .map(function (u) { return u.store_name; })
    .filter(function (s, i, a) { return a.indexOf(s) === i; });
  const bd = h.w.taskStoreBreakdown({ id: 'r-1', kind: 'recurring', target_stores: null }, [], all);
  h.close();
  return { all: all, pending: bd.pending };
}

(async function () {

  section('1. Един и същ списък навсякъде');
  {
    const h = boot({ modules: [], user: ADMIN, data: {} });
    const shared = h.w.REPORT_EXCLUDED_DEFAULT.slice();
    h.close();
    const bn = read('supabase/functions/bulletin-notify/index.ts').match(/const EXCLUDED_STORES = \[([\s\S]*?)\];/);
    const notify = bn ? bn[1].split(',').map(function (x) { return x.trim().replace(/^'|'$/g, ''); }).filter(Boolean) : [];
    ok('send-scheduled-report = shared.js', sorted(SCHED) === sorted(shared), JSON.stringify(SCHED));
    ok('send-routed-report = shared.js', sorted(ROUTED) === sorted(shared), JSON.stringify(ROUTED));
    ok('bulletin-notify = shared.js', sorted(notify) === sorted(shared), JSON.stringify(notify));
    ok('Сервиз Троян е в списъка на двете едж функции', SCHED.indexOf(SERVICE) >= 0 && ROUTED.indexOf(SERVICE) >= 0);
  }

  section('2. Сервиз Троян с 0 отметки не мени отчетите');
  {
    /* 10 от 18 отметнали → 56%. */
    const s = await dailySummary(SCHED, 10);
    if (ok('дневният колектор връща обобщение', !!s)) {
      ok('обектите са 18, не 19', s.storeCount === 18, 'реално: ' + s.storeCount);
      ok('процентът е 56% (10 от 18)', s.overallPct === 56 && s.totalAll === 18, s.overallPct + '% от ' + s.totalAll);
      const names = (s.rows || []).map(function (r) { return r.name; });
      ok('сервизът не е ред', names.indexOf(SERVICE) < 0);
      ok('сервизът не е в „последните 3"', (s.bottom3 || []).every(function (r) { return r.name !== SERVICE; }), JSON.stringify((s.bottom3 || []).map(function (r) { return r.name; })));
      ok('„неизпълнени" (под 50%) са 8, не 9', s.laggards === 8, 'реално: ' + s.laggards);
    }
    const p = await palletsSummary(SCHED);
    if (ok('палетният колектор връща обобщение', !!p)) {
      ok('палети: N от 18', p.storeCount === 18, 'реално: ' + p.storeCount);
      ok('сервизът не е „не е подал"', (p.missing || []).every(function (m) { return m.store !== SERVICE; }));
      ok('„не са подали" са 18 (никой не е подал)', (p.missing || []).length === 18, 'реално: ' + (p.missing || []).length);
    }
    const r = routedPending(ROUTED);
    ok('routed: обхватът на задача за всички е 18', r.all.length === 18, 'реално: ' + r.all.length);
    ok('routed: сервизът не е „неизпълнил"', r.pending.indexOf(SERVICE) < 0 && r.pending.length === 18);
  }

  section('3. Контрол: списъкът отпреди поправката ВКЛЮЧВА сервиза');
  {
    const s = await dailySummary(OLD, 10);
    ok('стар списък: 19 обекта', s && s.storeCount === 19, 'реално: ' + (s && s.storeCount));
    ok('стар списък: процентът пада на 53%', s && s.overallPct === 53, 'реално: ' + (s && s.overallPct));
    ok('стар списък: сервизът е в „последните 3"', s && (s.bottom3 || []).some(function (x) { return x.name === SERVICE; }));
    const p = await palletsSummary(OLD);
    ok('стар списък: палети N от 19', p && p.storeCount === 19);
    ok('стар списък: routed „неизпълнил" сервиз', routedPending(OLD).pending.indexOf(SERVICE) >= 0);
  }

  section('4. Бюлетин → Анализ: отметка от необект не вдига броя и процента');
  {
    const h = boot({ modules: ['bulletin.js'], user: ADMIN, data: { users: USERS, app_settings: [] } });
    const todayISO = h.w.toLocalISO(new Date());
    h.w.curBul = null;
    h.w.bulTasks = [{ id: 't-1', title: 'Снимка витрина', task_type: 'photo', due_date: todayISO }];
    /* Всички 18 + сервизът (+ ЦО) са отметнали. */
    h.w.bulComps = STORES18.concat([SERVICE, 'Централен офис']).map(function (s) {
      return { task_id: 't-1', store_name: s, status: 'done', completion_date: todayISO };
    });
    h.w.renderBulAnalysis(); await ticks();
    const wrap = h.doc.getElementById('mod-bulletin');
    const txt = wrap ? wrap.textContent : '';
    const m = txt.match(/🏪 Магазини\s*(\d+)/);
    ok('„🏪 Магазини" е 18, не 20', m && m[1] === '18', m ? m[1] : txt.slice(0, 200));
    ok('процентът на задачата е 100%, не 111%', /100%/.test(txt) && !/11[01]%/.test(txt), (txt.match(/\d+%/g) || []).join(','));
    const row = Array.prototype.slice.call(wrap.querySelectorAll('tr')).filter(function (tr) { return /Снимка витрина/.test(tr.textContent); })[0];
    ok('сервизът не е сред отметналите в реда на задачата', row && row.textContent.indexOf(SERVICE) < 0, row ? row.textContent.slice(0, 200) : 'няма ред');
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
