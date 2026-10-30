/* Чек лист — колоната „Справка минуси" брои ГРУПАТА задачи (30.10.2026).

   Решение А на Тенчо от 29.10 (claude/open/closed/29-10-checklist-minusi-gd.md):
   колоната брои всяка постоянна задача, която ЗА ПОКАЗАНАТА СЕДМИЦА има
   същия linked_module като задачата от source ('minusi'), а всеки обект — по
   задачата, в чийто target_stores е. От 26.10 „СПРАВКА МИНУСИ" е две задачи:
   03c44560 (13 обекта) и 5a4e0562 (Гоце Делчев, Монтана, Петрич, Троян,
   Шумен); колоната виждаше само първата и Гоце Делчев излизаше 0/5.

   linked_module е само във ВЕРСИЯТА (recurring_task_versions) — в реда на
   recurring_tasks е NULL, както в базата. Затова групата идва от версията
   за седмицата, не от закован id.

   Какво заковава файлът:
   1. Два обекта, две задачи: всеки брои своите отметки; дните и
      знаменателят са на задачата за обекта (тук 5a4e0562 е Пон–Сря → „/3").
   2. Обект, отмятал една седмица по старата задача (Монтана), не губи дни —
      отметките по групата се сливат; същият ден по две задачи е ЕДИН ден.
   3. Изключване (recurring_task_skips) — по задачата НА ОБЕКТА.
   4. Седмица БЕЗ версия (linked_module NULL) → само задачата от source,
      тоест старото поведение: Гоце Делчев 0/5, отметките по 5a4e0562 не
      влизат.
   5. Празен отговор за кандидатите и за версиите → пак старото поведение.
   6. Обект в нито един списък → задачата от source; колона без linked_module
      (ревизия) не се пипа.

   Пускане:  node tests/checklist-minusi-group.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const REV_ID = '74da41e4-494f-48cc-a434-79bfc04fc243';
const MIN_ID = '03c44560-9572-4274-ad53-5228d61b4de7';
const GD_ID  = '5a4e0562-619a-4dc4-bd02-5b111d73b5db';

const METRICS = [
  { key:'revizia_953',    label:'ревизия',        sublabel:'953', value_type:'yes_no', sort_order:1, active:true, source:'recurring:' + REV_ID },
  { key:'spravka_minusi', label:'справка минуси', sublabel:'',    value_type:'yes_no', sort_order:2, active:true, source:'recurring:' + MIN_ID }
];

/* Редовете в recurring_tasks — linked_module NULL, както в базата. */
const TASKS = [
  { id: REV_ID, due_weekdays: [0, 1, 2],       target_stores: null,             linked_module: null, active: true },
  { id: MIN_ID, due_weekdays: [0, 1, 2, 3, 4], target_stores: null,             linked_module: null, active: true },
  { id: GD_ID,  due_weekdays: [0, 1, 2, 3, 4], target_stores: ['Гоце Делчев'],  linked_module: null, active: true }
];

const USERS = ['Враца', 'Гоце Делчев', 'Монтана', 'Добрич', 'Централен офис']
  .map(function (s) { return { store_name: s }; });

const ADMIN = { id:'u-1', email:'c.teneva@temax.bg', display_name:'Ц. Тенева',
                role:'admin', store_name:'Централен офис' };

/* Версиите от понеделника на показаната седмица — като тези от 26.10.
   Враца в 03c44560; Гоце Делчев и Монтана в 5a4e0562 (Пон–Сря тук, за да
   се види, че знаменателят е НЕГОВ). Добрич — в нито един списък. */
function versions(monday) {
  return [
    { recurring_task_id: MIN_ID, from_monday: monday, to_monday: null, due_weekdays: [0, 1, 2, 3, 4],
      target_stores: ['Враца'], linked_module: 'minusi' },
    { recurring_task_id: GD_ID, from_monday: monday, to_monday: null, due_weekdays: [0, 1, 2],
      target_stores: ['Гоце Делчев', 'Монтана'], linked_module: 'minusi' }
  ];
}

/* PostgREST филтрите, които кодът ползва — колкото да е честен отговорът. */
function inIds(url) {
  const m = String(url).match(/(?:id|recurring_task_id)=in\.\(([^)]*)\)/);
  return m ? m[1].split(',') : null;
}
function tasksRoute(url) {
  if (/linked_module=not\.is\.null/.test(url)) return TASKS.filter(function (t) { return t.linked_module; });
  const ids = inIds(url);
  return ids ? TASKS.filter(function (t) { return ids.indexOf(t.id) >= 0; }) : TASKS;
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
      recurring_tasks: tasksRoute,
      recurring_task_versions: opts.versionsRoute || versionsRoute(opts.versions || []),
      recurring_task_periods: [],
      recurring_task_skips: opts.skips || [],
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
function comp(taskId, store, dateISO) {
  return { id: 'c' + (++seq), recurring_task_id: taskId, store_name: store,
           completion_date: dateISO, status: 'done', postponed_to: null };
}
async function compute(h) {
  h.w.loadChecklist();
  await ticks();
  return h.w.checklistComputePortalValues();
}

(async function () {
  const probe = env(); const wk = weekOf(probe); probe.close();
  const MON = wk[0];

  /* Отметките: Враца — 4 дни по 03c44560. Гоце Делчев — 2 дни по 5a4e0562
     и ден в ЧЕТВЪРТЪК (извън Пон–Сря на неговата задача). Монтана — пон по
     старата 03c44560, вт по новата и сряда по ДВЕТЕ (един ден, не два). */
  const COMPS = [
    comp(MIN_ID, 'Враца', wk[0]), comp(MIN_ID, 'Враца', wk[1]),
    comp(MIN_ID, 'Враца', wk[2]), comp(MIN_ID, 'Враца', wk[3]),
    comp(GD_ID, 'Гоце Делчев', wk[0]), comp(GD_ID, 'Гоце Делчев', wk[1]),
    comp(GD_ID, 'Гоце Делчев', wk[3]),
    comp(MIN_ID, 'Монтана', wk[0]), comp(GD_ID, 'Монтана', wk[1]),
    comp(MIN_ID, 'Монтана', wk[2]), comp(GD_ID, 'Монтана', wk[2]),
    comp(REV_ID, 'Гоце Делчев', wk[0])
  ];

  /* ── 1–2. Двата обекта, двете задачи ─────────────────────────────────── */
  section('1. Всеки обект — по своята задача от версията за седмицата');
  {
    const h = env({ versions: versions(MON), comps: COMPS });
    const v = await compute(h);
    ok('Враца → 4/5 по 03c44560', v['Враца|spravka_minusi'] === '4/5', JSON.stringify(v['Враца|spravka_minusi']));
    ok('Гоце Делчев → 2/3 по 5a4e0562 (Пон–Сря; четвъртъкът не е в срока му)',
       v['Гоце Делчев|spravka_minusi'] === '2/3', JSON.stringify(v['Гоце Делчев|spravka_minusi']));
    ok('Монтана → 3/3: старата + новата задача, сряда по двете е ЕДИН ден',
       v['Монтана|spravka_minusi'] === '3/3', JSON.stringify(v['Монтана|spravka_minusi']));
    ok('Добрич (в нито един списък) → задачата от source, 0/5',
       v['Добрич|spravka_minusi'] === '0/5', JSON.stringify(v['Добрич|spravka_minusi']));
    ok('ревизията (без linked_module) не се пипа: Гоце Делчев → da',
       v['Гоце Делчев|revizia_953'] === 'da', JSON.stringify(v['Гоце Делчев|revizia_953']));
    ok('ревизията не взима отметки от минусите: Враца → ne',
       v['Враца|revizia_953'] === 'ne', JSON.stringify(v['Враца|revizia_953']));
    h.close();
  }

  /* ── 3. Изключване — по задачата на обекта ───────────────────────────── */
  section('2. Изключването е по задачата, която важи за обекта');
  {
    const wkKey = (function () { const p = env(); const k = p.w.recurringSkipWeekOf(p.w.weekDays(p.w.checklistDefaultWeek().week, p.w.checklistDefaultWeek().year)[0]); p.close(); return k; })();
    const skips = [
      { id: 's1', recurring_task_id: GD_ID,  store_name: 'Гоце Делчев', year: wkKey.year, week_number: wkKey.week },
      { id: 's2', recurring_task_id: MIN_ID, store_name: 'Монтана',     year: wkKey.year, week_number: wkKey.week }
    ];
    const h = env({ versions: versions(MON), comps: COMPS, skips: skips });
    const v = await compute(h);
    ok('5a4e0562 изключена за Гоце Делчев → празно', v['Гоце Делчев|spravka_minusi'] === undefined,
       JSON.stringify(v['Гоце Делчев|spravka_minusi']));
    ok('03c44560 изключена за Монтана НЕ я засяга (нейната е 5a4e0562) → 3/3',
       v['Монтана|spravka_minusi'] === '3/3', JSON.stringify(v['Монтана|spravka_minusi']));
    ok('Враца не е засегната → 4/5', v['Враца|spravka_minusi'] === '4/5', JSON.stringify(v['Враца|spravka_minusi']));
    h.close();
  }

  /* ── 4. Седмица без версия ───────────────────────────────────────────── */
  section('3. Седмица без версия (linked_module NULL) → само задачата от source');
  {
    const later = new Date(MON + 'T12:00:00'); later.setDate(later.getDate() + 7);
    const p = env(); const laterISO = p.w.toLocalISO(later); p.close();
    const h = env({ versions: versions(laterISO), comps: COMPS });
    const v = await compute(h);
    ok('Гоце Делчев → 0/5 (отметките по 5a4e0562 не влизат)',
       v['Гоце Делчев|spravka_minusi'] === '0/5', JSON.stringify(v['Гоце Делчев|spravka_minusi']));
    ok('Монтана → 2/5 (само пон и сря по 03c44560)',
       v['Монтана|spravka_minusi'] === '2/5', JSON.stringify(v['Монтана|spravka_minusi']));
    ok('Враца → 4/5', v['Враца|spravka_minusi'] === '4/5', JSON.stringify(v['Враца|spravka_minusi']));
    h.close();
  }

  /* ── 5. Празни отговори ──────────────────────────────────────────────── */
  section('4. Празни кандидати и версии → старото поведение, без грешка');
  {
    const h = env({ versionsRoute: function () { return []; }, comps: COMPS });
    const v = await compute(h);
    ok('Гоце Делчев → 0/5', v['Гоце Делчев|spravka_minusi'] === '0/5', JSON.stringify(v['Гоце Делчев|spravka_minusi']));
    ok('Враца → 4/5', v['Враца|spravka_minusi'] === '4/5', JSON.stringify(v['Враца|spravka_minusi']));
    h.close();
  }

  /* ── 6. Изборът на задача за обект (чиста функция) ───────────────────── */
  section('5. checklistTaskForStore — ред на предимство');
  {
    const h = env();
    const tb = {};
    tb[MIN_ID] = { target_stores: null };
    tb[GD_ID]  = { target_stores: ['Гоце Делчев'] };
    const g = [MIN_ID, GD_ID];
    ok('изрично в списъка бие „за всички"', h.w.checklistTaskForStore(g, tb, 'Гоце Делчев') === GD_ID);
    ok('иначе — „за всички" (задачата от source)', h.w.checklistTaskForStore(g, tb, 'Враца') === MIN_ID);
    tb[MIN_ID] = { target_stores: ['Враца'] };
    ok('в нито един списък → задачата от source', h.w.checklistTaskForStore(g, tb, 'Добрич') === MIN_ID);
    ok('група само от source → тя', h.w.checklistTaskForStore([MIN_ID], tb, 'Гоце Делчев') === MIN_ID);
    const tg = {};
    tg[MIN_ID] = { linked_module: 'minusi', active: true };
    tg[GD_ID]  = { linked_module: 'minusi', active: false };
    ok('неактивна задача без периоди не влиза в групата',
       JSON.stringify(h.w.checklistTaskGroup(MIN_ID, tg, [], MON)) === JSON.stringify([MIN_ID]));
    tg[GD_ID].active = true;
    ok('активна със същия linked_module влиза, source е първа',
       JSON.stringify(h.w.checklistTaskGroup(MIN_ID, tg, [], MON)) === JSON.stringify([MIN_ID, GD_ID]));
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
