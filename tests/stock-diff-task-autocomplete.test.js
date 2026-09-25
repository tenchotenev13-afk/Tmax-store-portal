/* Работата на ОБЕКТА по вече подадена бланка в „Разлики" отмята постоянната
   задача с linked_module='stock-diff' (24.09.2026).

   Процесът е двустранен (магазин ↔ склад/офис), затова отмята САМО магазинът:
   действие на склада или на офиса е чужда работа, а задачата е на обекта.
   Самото отмятане минава през markLinkedRecurringTask() в shared.js — общият
   помощник с Вечерен оборот (версии за седмицата, notice, дата, втори ред,
   409).

   Какво заковава тестът (с РЕАЛЕН клик там, където има бутон):
     1. магазинът натиска „ПУСНАТО В SAP" по подаден ред → ЕДИН ред в
        task_completions, с id-то на задачата, обекта, днешната дата и done;
     2. складът и офисът по СЪЩИЯ ред → нула редове (и нула заявки);
     3. второ действие в същия ден → без втори ред (SELECT-ът го вижда);
     4. 409 (изпреварил друг) → мълчи, без червен toast;
     5. задачата е „Само за информация" → нищо;
     6. няма задача с този linked_module → нищо и без грешка;
     7. провал на записа → действието остава, но има ЧЕРВЕН toast;
     8. задачата не се пада днес → нищо (датата е тази на Бюлетина);
     9. останалите седем места: корекция, 📎 към ред, 📷 към бланка, приемане,
        „получено междувременно", изпратена и приета размяна;
    10. чекбоксът в Бюлетина остава активен (stock-diff НЕ е в bulAutoLocked).

   Пускане: node tests/stock-diff-task-autocomplete.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

const STORE = 'Троян';
const WAREHOUSE = 'Логистичен склад Добрич';
const MANAGER = { email: 'm@temax.bg', display_name: 'Мария Иванова', role: 'manager', store_name: STORE };
const WH_USER = { email: 'w@temax.bg', display_name: 'Складов', role: 'sklad', store_name: WAREHOUSE };
const OFFICE = { email: 'c@temax.bg', display_name: 'Цветелина', role: 'accounting', store_name: 'Централен офис' };
/* Регионален/счетоводител по обекти: ЦО по store_name, но с обекта в
   assigned_stores — точно случаят, който НЕ бива да отмята. */
const REGIONAL = { email: 'r@temax.bg', display_name: 'Регионален', role: 'accounting', store_name: 'Централен офис', assigned_stores: [STORE] };

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
function task(over) {
  return Object.assign({ id: 'r-sd', linked_module: 'stock-diff', task_type: 'comment',
    due_weekday: 0, due_weekdays: ALL_DAYS, due_time: null, due_window: false }, over || {});
}
const REPORT = { id: 'rep-1', direction: 'interstore', store_name: STORE, counterpart: WAREHOUSE,
                 document_number: '42', doc_date: '2026-09-20', reviewed: false, photos: [] };
function line(over) {
  return Object.assign({ id: 'l-1', report_id: 'rep-1', store_name: STORE, supplier: WAREHOUSE,
    material_code: '100', material_name: 'Артикул', quantity: 2, status: 'new',
    difference_category: 'undelivered', warehouse_response: 'return', attachments: [] }, over || {});
}
function swap(over) {
  return Object.assign({ id: 's-1', from_line_id: 'l-1', to_line_id: 'l-2', from_store: STORE,
    to_store: 'Ловеч', warehouse: WAREHOUSE, material_code: '100', material_name: 'Артикул',
    qty: 1, status: 'linked', kind: 'physical' }, over || {});
}

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js', 'stock-returns.js', 'stock-differences.js'],
    user: opts.user || MANAGER,
    confirm: true,
    fail: opts.fail,
    data: Object.assign({
      users: [{ store_name: STORE }],
      recurring_tasks: opts.tasks === undefined ? [task()] : opts.tasks,
      recurring_task_versions: opts.versions || [],
      recurring_task_periods: [],
      task_completions: opts.comps || [],
      stock_differences: [], differences_reports: [], stock_returns: [], stock_diff_swaps: []
    }, opts.data || {})
  });
  h.w.sdData = JSON.parse(JSON.stringify(opts.rows || [line()]));
  h.w.diffReports = JSON.parse(JSON.stringify(opts.reports || [REPORT]));
  h.w.sdSwaps = JSON.parse(JSON.stringify(opts.swaps || []));
  return h;
}
async function settle(cond, max) { for (let i = 0; i < (max || 60); i++) { if (cond()) return true; await ticks(); } return cond(); }
const compPosts = h => h.calls.post.filter(x => x.table === 'task_completions');
const compGets = h => h.calls.get.filter(u => u.indexOf('/task_completions') >= 0);
const recGets = h => h.calls.get.filter(u => u.indexOf('/recurring_tasks') >= 0);
const TODAY = () => new Date().toISOString().slice(0, 10);
function localToday(h) { return h.w.today(); }

/* Действието „ПУСНАТО В SAP" — единственият път, по който минават всички
   проверки; останалите места се викат направо (те са същият помощник). */
async function sapDone(h) {
  guard('sdSetStoreResponse не хвърля', () => h.w.sdSetStoreResponse('l-1', 'sap_done'));
  await settle(() => h.calls.patch.some(x => x.table === 'stock_differences'));
  await settle(() => compPosts(h).length > 0 || compGets(h).length > 0 || h.calls.toast.length > 1, 40);
  for (let i = 0; i < 6; i++) await ticks();
}

(async function () {

  section('1. Магазинът действа по подаден ред → задачата се отмята');
  {
    const h = env();
    await sapDone(h);
    ok('действието по бланката е записано', h.calls.patch.some(x => x.table === 'stock_differences'));
    const tc = compPosts(h);
    if (ok('ЕДИН ред в task_completions', tc.length === 1, 'брой: ' + tc.length)) {
      const b = tc[0].body;
      ok('recurring_task_id е на свързаната задача', b.recurring_task_id === 'r-sd', b.recurring_task_id);
      ok('task_id е null (постоянна задача)', b.task_id === null);
      ok('store_name е обектът', b.store_name === STORE, b.store_name);
      ok('completed_by е потребителят', b.completed_by === 'Мария Иванова', b.completed_by);
      ok('completion_date е ДНЕС, локално', b.completion_date === localToday(h), b.completion_date);
      ok('status е done', b.status === 'done');
      /* completed_at го пишат всички останали писачи в task_completions —
         без него bulDoneLate() не може да каже „✓ със закъснение", а
         дедупликацията в миграция 20260910231103 (completed_at desc nulls
         last) слага реда последен. */
      ok('пише и completed_at', typeof b.completed_at === 'string' && /^\d{4}-\d\d-\d\dT/.test(b.completed_at), JSON.stringify(b.completed_at));
    }
    ok('задачите се теглят с версиите, не с филтър по linked_module в заявката',
      recGets(h).some(u => /active=is\.true/.test(u) && !/linked_module=eq/.test(u)) &&
      h.calls.get.some(u => u.indexOf('/recurring_task_versions') >= 0), recGets(h).join(' | '));
    ok('няма червен toast', !h.calls.toast.some(t => /не се отметна/.test(String(t))), JSON.stringify(h.calls.toast));
  }

  section('2. Складът и офисът НЕ отмятат');
  {
    for (const [who, user] of [['складът', WH_USER], ['офисът', OFFICE], ['регионалният (ЦО с обекта)', REGIONAL]]) {
      const h = env({ user: user });
      await sapDone(h);
      ok(who + ': нула редове в task_completions', compPosts(h).length === 0, 'брой: ' + compPosts(h).length);
      ok(who + ': дори не пита за задачите', recGets(h).length === 0, recGets(h).join(' | '));
      ok(who + ': действието по бланката пак минава', h.calls.patch.some(x => x.table === 'stock_differences'));
    }
    const h = env();
    ok('КОНТРОЛА — магазинът отмята', (await sapDone(h), compPosts(h).length === 1));
  }

  section('3. Второ действие в същия ден → без втори ред');
  {
    const h = env({ comps: [{ id: 'tc-1', recurring_task_id: 'r-sd', store_name: STORE, completion_date: null }] });
    /* Фикстурата връща реда за ВСЯКА заявка (харнесът не филтрира), тоест
       SELECT-ът „вече отметнато днес" го намира. */
    await sapDone(h);
    ok('нула нови редове', compPosts(h).length === 0, 'брой: ' + compPosts(h).length);
    ok('но проверката е направена', compGets(h).some(u => /completion_date=eq\./.test(u)), compGets(h).join(' | '));
  }

  section('3б. ОТЛОЖЕН ред за днес → дописва се на done, не се подминава');
  {
    /* Двата частични уникални индекса (миграция 20260910231103) не гледат
       status: отложеният ред заема мястото за (задача, обект, ден). Нов ред
       би дал 409, а пропускането би оставило свършената работа неотметната
       завинаги — задачата виси отложена в Бюлетина, „Днес" и отчетите. */
    const h = env({ comps: [{ id: 'tc-pp', recurring_task_id: 'r-sd', store_name: STORE,
      completion_date: null, status: 'postponed', postponed_to: '2026-12-31' }] });
    await sapDone(h);
    const pat = h.calls.patch.filter(x => x.table === 'task_completions');
    ok('няма нов ред', compPosts(h).length === 0, 'брой: ' + compPosts(h).length);
    if (ok('съществуващият се дописва', pat.length === 1, 'PATCH-ове: ' + pat.length)) {
      ok('точно по неговото id', /id=eq\.tc-pp/.test(String(pat[0].url)), pat[0].url);
      ok('status става done', pat[0].body.status === 'done', JSON.stringify(pat[0].body));
      ok('пише и completed_by, и completed_at', !!pat[0].body.completed_by && !!pat[0].body.completed_at, JSON.stringify(pat[0].body));
    }
  }

  section('3в. Вече отметнато (done) → нищо, нито ред, нито дописване');
  {
    const h = env({ comps: [{ id: 'tc-done', recurring_task_id: 'r-sd', store_name: STORE,
      completion_date: null, status: 'done' }] });
    await sapDone(h);
    ok('нула нови редове', compPosts(h).length === 0);
    ok('и нула дописвания', h.calls.patch.filter(x => x.table === 'task_completions').length === 0);
  }

  section('3г. Обхват и изключване');
  {
    const hOut = env({ tasks: [task({ target_stores: ['Ловеч'] })] });
    await sapDone(hOut);
    ok('задача за ДРУГ обект → нищо', compPosts(hOut).length === 0, 'брой: ' + compPosts(hOut).length);
    const hIn = env({ tasks: [task({ target_stores: [STORE] })] });
    await sapDone(hIn);
    ok('задача за ТОЗИ обект → отмята', compPosts(hIn).length === 1);
    const hSkip = env({ data: { recurring_task_skips: [{ id: 'sk-1', recurring_task_id: 'r-sd', store_name: null }] } });
    await sapDone(hSkip);
    ok('„не за тази седмица" (за всички) → нищо', compPosts(hSkip).length === 0, 'брой: ' + compPosts(hSkip).length);
    const hSkipStore = env({ data: { recurring_task_skips: [{ id: 'sk-2', recurring_task_id: 'r-sd', store_name: STORE }] } });
    await sapDone(hSkipStore);
    ok('изключена за ТОЗИ обект → нищо', compPosts(hSkipStore).length === 0);
    const hSkipOther = env({ data: { recurring_task_skips: [{ id: 'sk-3', recurring_task_id: 'r-sd', store_name: 'Ловеч' }] } });
    await sapDone(hSkipOther);
    ok('изключена за ДРУГ обект → пак отмята', compPosts(hSkipOther).length === 1);
  }

  section('3д. Второ действие в същата сесия не пита пак');
  {
    const h = env();
    await sapDone(h);
    const getsAfterFirst = h.calls.get.length;
    ok('първото действие отмята', compPosts(h).length === 1);
    await sapDone(h);
    ok('второто не прави нови заявки за задачата', h.calls.get.length === getsAfterFirst,
      'заявки след: ' + (h.calls.get.length - getsAfterFirst));
    ok('и не пише втори ред', compPosts(h).length === 1);
  }

  section('4. 409 от базата (някой е изпреварил) → мълчи');
  {
    const h = env({ fail: { POST: { url: /task_completions/, status: 409, body: { code: '23505' } } } });
    await sapDone(h);
    ok('опитът е направен', compPosts(h).length === 1);
    ok('няма червен toast', !h.calls.toast.some(t => /не се отметна/.test(String(t))), JSON.stringify(h.calls.toast));
  }

  section('5. „Само за информация" → нищо');
  {
    const h = env({ tasks: [task({ task_type: 'notice' })] });
    await sapDone(h);
    ok('нула редове', compPosts(h).length === 0);
    ok('и нула проверки', compGets(h).length === 0);
  }

  section('6. Няма такава задача → нищо и без грешка');
  {
    const h = env({ tasks: [] });
    await sapDone(h);
    ok('нула редове', compPosts(h).length === 0);
    ok('няма червен toast', !h.calls.toast.some(t => /не се отметна/.test(String(t))), JSON.stringify(h.calls.toast));
    const h2 = env({ tasks: [task({ linked_module: 'oborot' })] });
    await sapDone(h2);
    ok('чужд linked_module не се брои', compPosts(h2).length === 0);
  }

  section('7. Провал на записа → действието остава, но се вижда');
  {
    const h = env({ fail: { POST: { url: /task_completions/, status: 500, body: { message: 'boom' } } } });
    await sapDone(h);
    ok('действието по бланката е записано', h.calls.patch.some(x => x.table === 'stock_differences'));
    ok('ЧЕРВЕН toast за неотметнатата задача',
      h.calls.toast.some(t => /задачата в Бюлетина не се отметна/.test(String(t))), JSON.stringify(h.calls.toast));
  }

  section('8. Задачата не се пада днес → нищо');
  {
    /* Само вчерашният ден от седмицата. */
    const jsDay = new Date().getDay();
    const todayIdx = jsDay === 0 ? 6 : jsDay - 1;
    const other = (todayIdx + 3) % 7;
    const h = env({ tasks: [task({ due_weekdays: [other], due_weekday: other })] });
    await sapDone(h);
    ok('нула редове', compPosts(h).length === 0, 'брой: ' + compPosts(h).length);
    ok('и нула проверки за отметка', compGets(h).length === 0);
    const h2 = env({ tasks: [task({ due_weekdays: [todayIdx], due_weekday: todayIdx })] });
    await sapDone(h2);
    ok('КОНТРОЛА — падне ли се днес, отмята', compPosts(h2).length === 1);
  }

  section('9. Останалите места на магазина');
  {
    const cases = [
      ['корекция на подаден ред', h => { h.w.sdCorrectLineId = 'l-1'; h.doc.body.insertAdjacentHTML('beforeend',
        '<div id="sdc-ov"><input id="sdc-sap" value="100"><input id="sdc-name" value="Артикул">' +
        '<input id="sdc-qty" value="2"><input id="sdc-qty-real" value="1"><textarea id="sdc-comment"></textarea></div>');
        h.w.submitSDCorrection(); }],
      ['приемане на междускладова', h => h.w.sdConfirmInterstore('l-1', 'store')],
      ['изпратена размяна', h => { h.w.sdSwaps = [swap()]; h.doc.body.insertAdjacentHTML('beforeend',
        '<div id="sdsent-ov"><input id="sdsent-sap" value="4711"><input type="radio" name="sdsent-mode" value="bus" checked><textarea id="sdsent-note"></textarea></div>');
        h.w.submitSwapSent('s-1'); }],
      ['приета размяна', h => { h.w.sdSwaps = [swap({ status: 'sent', to_store: STORE, from_store: 'Ловеч' })];
        h.w.sdReceiveSwap('s-1'); }]
    ];
    for (const [label, act] of cases) {
      const h = env({ rows: [line({ warehouse_response: 'sent' })] });
      if (guard(label + ' не хвърля', () => act(h))) {
        await settle(() => compPosts(h).length > 0 || h.calls.toast.some(t => /Грешка/.test(String(t))), 50);
        for (let i = 0; i < 6; i++) await ticks();
        ok(label + ' → отмята', compPosts(h).length === 1, 'редове: ' + compPosts(h).length +
          ' · toast: ' + JSON.stringify(h.calls.toast));
      }
    }
  }

  section('9б. Складът по СВОЯ бланка и „прието обратно" — пак нищо');
  {
    /* Складът е обект като всеки друг и може да е store_name на бланка.
       Задачата обаче е работа на МАГАЗИНА — затова гейтът го изключва
       поименно (isLogisticsWarehouseUser), не само по несъвпадение на име. */
    const whRep = Object.assign({}, REPORT, { store_name: WAREHOUSE, counterpart: 'Доставчик' });
    const h = env({ user: WH_USER, rows: [line({ store_name: WAREHOUSE })], reports: [whRep] });
    await sapDone(h);
    ok('складът по собствената си бланка не отмята', compPosts(h).length === 0, 'брой: ' + compPosts(h).length);
    ok('и не пита за задачите', recGets(h).length === 0);
    /* „📬 Прието обратно" е действие на СКЛАДА по реда на магазина — минава
       по същата функция, но по другия клон. */
    const h2 = env();
    if (guard('sdConfirmInterstore(as=warehouse) не хвърля', () => h2.w.sdConfirmInterstore('l-1', 'warehouse'))) {
      await settle(() => h2.calls.patch.some(x => x.table === 'stock_differences'));
      for (let i = 0; i < 8; i++) await ticks();
      ok('клонът „warehouse" не отмята, дори когато го вика магазин',
        compPosts(h2).length === 0, 'брой: ' + compPosts(h2).length);
      ok('а самото действие е записано', h2.calls.patch.some(x => x.table === 'stock_differences'));
    }
  }

  section('9в. Задача с ПРОЗОРЕЦ — датата е днешната, само ако сме в него');
  {
    /* Часовникът е замразен на сряда: иначе „днес" се мести и прозорецът
       ту покрива деня, ту не. */
    function freezeWed(w) {
      const d = new Date(); d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
      const Real = w.Date, ms = d.getTime();
      class Frozen extends Real {
        constructor(...a) { if (a.length === 0) super(ms); else super(...a); }
        static now() { return ms; }
      }
      w.Date = Frozen;
      return d;
    }
    /* Прозорец сряда–четвъртък: днес (сряда) е В него, но СРОКЪТ е четвъртък.
       Затова „пада ли се днес" (по срока) казва не, а прозорецът — да. */
    const hIn = env({ tasks: [task({ due_window: true, due_weekdays: [2, 3], due_weekday: 2 })] });
    freezeWed(hIn.w);
    await sapDone(hIn);
    ok('в прозореца → отмята с ДНЕШНАТА дата', compPosts(hIn).length === 1 &&
      compPosts(hIn)[0].body.completion_date === hIn.w.today(),
      'брой: ' + compPosts(hIn).length + ' · ' + (compPosts(hIn)[0] && compPosts(hIn)[0].body.completion_date));
    const hOut = env({ tasks: [task({ due_window: true, due_weekdays: [0, 1], due_weekday: 0 })] });
    freezeWed(hOut.w);
    await sapDone(hOut);
    ok('извън прозореца → нищо', compPosts(hOut).length === 0, 'брой: ' + compPosts(hOut).length);
  }

  section('9г. Връзката към модула идва от ВЕРСИЯТА за тази седмица');
  {
    /* Базовият ред не е вързан към „Разлики" — вързан е само за ТАЗИ седмица
       (recurring_task_versions). Точно затова филтърът по linked_module е в
       кода, а не в заявката: иначе задачата не би се намерила. */
    const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
      const p = n => String(n).padStart(2, '0');
      return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate()); };
    const W = mondayOf(new Date());
    const h = env({
      tasks: [task({ linked_module: null })],
      versions: [{ id: 'v-1', recurring_task_id: 'r-sd', from_monday: W, to_monday: W,
        title: 'Разлики тази седмица', description: null, due_weekday: 0, due_weekdays: ALL_DAYS,
        due_window: false, due_time: null, task_type: 'comment', department: 'admin',
        target_stores: null, report_groups: null, linked_module: 'stock-diff' }]
    });
    await sapDone(h);
    ok('версията вързва задачата → отмята се', compPosts(h).length === 1, 'брой: ' + compPosts(h).length);
    ok('и то по id-то на задачата', compPosts(h)[0] && compPosts(h)[0].body.recurring_task_id === 'r-sd');
    /* Обратната посока: базовият ред Е вързан, но версията за тази седмица го
       е отвързала → не се отмята. */
    const h2 = env({
      tasks: [task()],
      versions: [{ id: 'v-2', recurring_task_id: 'r-sd', from_monday: W, to_monday: null,
        title: 'Вече не е за Разлики', description: null, due_weekday: 0, due_weekdays: ALL_DAYS,
        due_window: false, due_time: null, task_type: 'comment', department: 'admin',
        target_stores: null, report_groups: null, linked_module: null }]
    });
    await sapDone(h2);
    ok('версия без връзка → нищо', compPosts(h2).length === 0, 'брой: ' + compPosts(h2).length);
  }

  section('10. Ръчното отмятане остава възможно');
  {
    const h = env();
    ok('stock-diff НЕ е сред заключените модули', h.w.bulAutoLocked('stock-diff') === false);
    ok('КОНТРОЛА — oborot и transit-auto са заключени',
      h.w.bulAutoLocked('oborot') === true && h.w.bulAutoLocked('transit-auto') === true);
  }

  section('11. Гейтът е по-строг от sdIsInterstoreStoreSide');
  {
    const h = env({ user: REGIONAL });
    ok('регионалният Е „страна на магазина" по заварения помощник',
      h.w.sdIsInterstoreStoreSide(line(), REPORT) === true);
    ok('но НЕ е собственият обект за отмятането',
      h.w.sdActorIsOwnStore(STORE) === false);
    const hm = env();
    ok('магазинът е', hm.w.sdActorIsOwnStore(STORE) === true);
    ok('и не е за ЧУЖД обект', hm.w.sdActorIsOwnStore('Ловеч') === false);
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
