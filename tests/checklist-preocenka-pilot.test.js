/* Чек лист — колоната „преоценка" брои и пилотната задача (16.11.2026).

   Решение А на Тенчо: в режим 'file_none' файл се иска САМО от задача
   'file_comment'. Задачата, която важи за обекта (групата по linked_module,
   checklistTaskForStore), е друг вид → „да" = свършено отмятане ПО САМАТА НЕЯ
   в седмицата, без файл. Повод — седмица 46: Габрово, Кърджали и Шумен
   отметнаха „ПРЕОЦЕНКА ЗАДЪЛЖИТЕЛНА" (5ba9beb5, 'info', отмята се без файл),
   а колоната им даде „не", защото искаше файл.

   Данните повтарят базата: старата задача a5e1e6f8 е file_comment, в реда
   linked_module и target_stores са NULL, а версията от понеделника на
   седмицата ги дава ('revaluation' + обектите извън пилота). Пилотната е
   'info' с linked_module 'revaluation' и свой target_stores.

   Какво заковава файлът:
   1. Обект от пилота с отметната пилотна задача без файл → 'da'.
   2. Обект от пилота без отметка → 'ne'; отметка извън седмицата не се брои.
   3. Обект от пилота, отметнал САМО старата задача без файл → 'ne' (броят
      се отметките по неговата задача, не по групата).
   4. Обект извън пилота: старата задача с файл → 'da', без файл → 'ne';
      отметка по пилотната без файл не му дава „да".
   5. Задача без task_type (непълна заявка) → старото правило с файл.
   6. Колоната „ревизия" (any) не се пипа.

   Мутации, които този тест трябва да убие (пускани ръчно при писането):
   пилотната задача игнорирана (needFile винаги true); пилотната задача
   иска файл; старото правило загубено за обект извън пилота (needFile
   винаги false).

   Пускане:  node tests/checklist-preocenka-pilot.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const REV_ID   = '74da41e4-494f-48cc-a434-79bfc04fc243';
const OLD_ID   = 'a5e1e6f8-5b47-43ce-bfa4-5ab3ee7f70a6';
const PILOT_ID = '5ba9beb5-4739-4aab-becf-860822f86ee6';

const METRICS = [
  { key:'revizia_953', label:'ревизия',   sublabel:'953', value_type:'yes_no', sort_order:1, active:true, source:'recurring:' + REV_ID },
  { key:'preocenka',   label:'преоценка', sublabel:'',    value_type:'yes_no', sort_order:2, active:true, source:'recurring:' + OLD_ID }
];

function tasks(opts) {
  opts = opts || {};
  const pilot = { id: PILOT_ID, due_weekdays: [0, 1], target_stores: ['Габрово', 'Кърджали', 'Шумен'],
                  linked_module: 'revaluation', active: true, task_type: 'info' };
  if (opts.pilotNoType) delete pilot.task_type;
  return [
    { id: REV_ID, due_weekdays: [0, 1, 2], target_stores: null, linked_module: null, active: true, task_type: 'info' },
    { id: OLD_ID, due_weekdays: null, target_stores: null, linked_module: null, active: true, task_type: 'file_comment' },
    pilot
  ];
}

const USERS = ['Габрово', 'Кърджали', 'Шумен', 'Враца', 'Добрич', 'Централен офис']
  .map(function (s) { return { store_name: s }; });

const ADMIN = { id:'u-1', email:'c.teneva@temax.bg', display_name:'Ц. Тенева',
                role:'admin', store_name:'Централен офис' };

/* Версията на старата задача от понеделника на седмицата — като тази от 09.11. */
function versions(monday) {
  return [
    { recurring_task_id: OLD_ID, from_monday: monday, to_monday: null, due_weekdays: [0, 1],
      target_stores: ['Враца', 'Добрич'], linked_module: 'revaluation', task_type: 'file_comment' }
  ];
}

function inIds(url) {
  const m = String(url).match(/(?:id|recurring_task_id)=in\.\(([^)]*)\)/);
  return m ? m[1].split(',') : null;
}
function tasksRoute(list) {
  return function (url) {
    if (/linked_module=not\.is\.null/.test(url)) return list.filter(function (t) { return t.linked_module; });
    const ids = inIds(url);
    return ids ? list.filter(function (t) { return ids.indexOf(t.id) >= 0; }) : list;
  };
}
function versionsRoute(vers) {
  return function (url) {
    if (/linked_module=not\.is\.null/.test(url)) return vers.filter(function (v) { return v.linked_module; });
    const ids = inIds(url);
    return ids ? vers.filter(function (v) { return ids.indexOf(v.recurring_task_id) >= 0; }) : vers;
  };
}
function compsRoute(comps) {
  return function (url) {
    const ids = inIds(url);
    return ids ? comps.filter(function (c) { return ids.indexOf(c.recurring_task_id) >= 0; }) : comps;
  };
}

function env(opts) {
  opts = opts || {};
  return boot({
    modules: ['bulletin.js', 'checklist.js'],
    user: ADMIN,
    data: {
      users: USERS,
      weekly_checklist_metrics: METRICS,
      weekly_checklist: [],
      recurring_tasks: tasksRoute(tasks(opts)),
      recurring_task_versions: versionsRoute(opts.versions || []),
      recurring_task_periods: opts.periods || [],
      recurring_task_skips: [],
      task_completions: compsRoute(opts.comps || []),
      rpc: []
    }
  });
}

function weekOf(h) {
  const def = h.w.checklistDefaultWeek();
  return h.w.weekDays(def.week, def.year).map(h.w.toLocalISO);
}
let seq = 0;
function comp(taskId, store, dateISO, files) {
  return { id: 'c' + (++seq), recurring_task_id: taskId, store_name: store,
           completion_date: dateISO, status: 'done', postponed_to: null,
           files: files === undefined ? [] : files };
}
async function compute(h) {
  h.w.loadChecklist();
  await ticks();
  return h.w.checklistComputePortalValues();
}
function show(v, k) { return JSON.stringify(v[k]); }

(async function () {
  const probe = env(); const wk = weekOf(probe);
  const d = new Date(wk[0] + 'T12:00:00'); d.setDate(d.getDate() - 1);
  const PREV_SUN = probe.w.toLocalISO(d);
  probe.close();
  const MON = wk[0];
  const FILE = [{ name: 'preocenka.xlsx', url: 'https://example.org/f.xlsx' }];
  const PERIODS = [{ recurring_task_id: PILOT_ID, from_monday: MON, to_monday: null }];

  const COMPS = [
    /* пилот */
    comp(PILOT_ID, 'Габрово', wk[0]),               /* без файл → da */
    comp(PILOT_ID, 'Кърджали', PREV_SUN),           /* извън седмицата → не се брои */
    comp(OLD_ID,   'Шумен', wk[1]),                  /* старата задача без файл → не е неговата */
    /* извън пилота */
    comp(OLD_ID,   'Враца', wk[0], FILE),            /* файл → da */
    comp(OLD_ID,   'Добрич', wk[1]),                 /* без файл → ne */
    comp(PILOT_ID, 'Добрич', wk[1]),                 /* пилотна без файл — не му дава da */
    comp(REV_ID,   'Габрово', wk[0])
  ];

  section('1. Обекти от пилота — по пилотната задача, без файл');
  {
    const h = env({ versions: versions(MON), periods: PERIODS, comps: COMPS });
    const v = await compute(h);
    ok('Габрово: отметната пилотна без файл → da', v['Габрово|preocenka'] === 'da', show(v, 'Габрово|preocenka'));
    ok('Кърджали: без отметка в седмицата (само предишната неделя) → ne',
       v['Кърджали|preocenka'] === 'ne', show(v, 'Кърджали|preocenka'));
    ok('Шумен: само старата задача, без файл → ne', v['Шумен|preocenka'] === 'ne', show(v, 'Шумен|preocenka'));
    section('2. Обекти извън пилота — старото правило с файл');
    ok('Враца: старата с файл → da', v['Враца|preocenka'] === 'da', show(v, 'Враца|preocenka'));
    ok('Добрич: старата без файл (+ пилотна без файл) → ne', v['Добрич|preocenka'] === 'ne', show(v, 'Добрич|preocenka'));
    section('3. Другите колони не се пипат');
    ok('ревизия Габрово → da', v['Габрово|revizia_953'] === 'da', show(v, 'Габрово|revizia_953'));
    ok('ревизия Враца → ne', v['Враца|revizia_953'] === 'ne', show(v, 'Враца|revizia_953'));
    h.close();
  }

  section('4. Отметка на пилотната задача с файл — пак da (файлът не пречи)');
  {
    const h = env({ versions: versions(MON), periods: PERIODS,
                    comps: [comp(PILOT_ID, 'Кърджали', wk[6], FILE)] });
    const v = await compute(h);
    ok('Кърджали: отметка в неделя (последния ден) → da', v['Кърджали|preocenka'] === 'da', show(v, 'Кърджали|preocenka'));
    ok('Габрово: нищо → ne', v['Габрово|preocenka'] === 'ne', show(v, 'Габрово|preocenka'));
    h.close();
  }

  section('5. Пилотната без task_type → старото правило с файл');
  {
    const h = env({ versions: versions(MON), periods: PERIODS, comps: COMPS, pilotNoType: true });
    const v = await compute(h);
    ok('Габрово без файл → ne', v['Габрово|preocenka'] === 'ne', show(v, 'Габрово|preocenka'));
    ok('Враца не е засегната → da', v['Враца|preocenka'] === 'da', show(v, 'Враца|preocenka'));
    h.close();
  }

  section('6. checklistFileNonePlan — чиста функция');
  {
    const h = env();
    const a = h.w.checklistFileNonePlan(COMPS, wk, { id: PILOT_ID, task_type: 'info' });
    ok('info: само отметките по самата задача в седмицата',
       JSON.stringify(a.hits) === JSON.stringify({ 'Габрово': 'da', 'Добрич': 'da' }), JSON.stringify(a.hits));
    const b = h.w.checklistFileNonePlan(COMPS, wk, { id: OLD_ID, task_type: 'file_comment' });
    ok('file_comment: само с файл', JSON.stringify(b.hits) === JSON.stringify({ 'Враца': 'da' }), JSON.stringify(b.hits));
    const c = h.w.checklistFileNonePlan(COMPS, wk);
    ok('без задача → с файл (старото извикване)', JSON.stringify(c.hits) === JSON.stringify({ 'Враца': 'da' }), JSON.stringify(c.hits));
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
