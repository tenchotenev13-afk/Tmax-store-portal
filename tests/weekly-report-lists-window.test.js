/* Прозорецът на списъците в седмичния отчет — reportBuildSummary().

   Заварено противоречие в едно и също писмо за седмица 33:
     · секцията по обекти:    Габрово 0 от 27, Раднево 0 от 27, Севлиево 0 от 27
     · секцията с коментари:  213 изброени отметки на същите обекти
     · общото:                59/540

   Причината беше, че двете секции НЕ работеха по един прозорец. Процентът
   минаваше през reportItemMatchesComp — точно съвпадение на completion_date
   с датата на явяването. Списъците (commentedList/postponedList) нямаха
   никакъв филтър по дата и изброяваха всичко, което заявката е върнала,
   а самата заявка също нямаше прозорец: за постоянните задачи теглеше
   всяко отмятане, правено някога.

   Тестът заковава, че отметка извън седмицата не влиза в нито един списък,
   и че заявките носят completion_date филтър.

   Пускане:  node tests/weekly-report-lists-window.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

function env(data) {
  return boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: data || {}
  });
}

/* Явявания за седмица 34 (17–23.08). Едно с дата, едно БЕЗ дата. */
const ITEMS = [
  { id: 't-1', kind: 'regular',   title: 'Палети',  target_stores: null, date: '2026-08-18' },
  { id: 't-2', kind: 'recurring', title: 'Каса',    target_stores: null, date: '2026-08-19' },
  { id: 't-3', kind: 'regular',   title: 'Без срок', target_stores: null, date: null }
];
const STORES = ['Раднево', 'Габрово'];

function comp(o) {
  return Object.assign({
    item_id: 't-1', kind: 'regular', store_name: 'Раднево',
    status: 'done', comment: '', photos: [], completion_date: '2026-08-18'
  }, o);
}

(async function () {

  section('1. Отметка ИЗВЪН седмицата не влиза в коментарите');
  {
    const { w } = env();
    const comps = [
      comp({ comment: 'В седмицата', completion_date: '2026-08-18' }),
      comp({ comment: 'ПРЕДНАТА седмица', completion_date: '2026-08-11' }),
      comp({ comment: 'СЛЕДВАЩАТА седмица', completion_date: '2026-08-26' }),
      comp({ comment: 'БЕЗ дата', completion_date: null })
    ];
    const s = w.reportBuildSummary(ITEMS, comps, STORES, 0);
    const texts = s.commentedList.map(x => x.comment);

    ok('в списъка има точно 1 коментар', s.commentedList.length === 1,
      JSON.stringify(texts));
    ok('и това е този от седмицата', texts[0] === 'В седмицата', texts.join(' | '));
    ok('коментар от предната седмица НЕ влиза', texts.indexOf('ПРЕДНАТА седмица') < 0);
    ok('коментар от следващата седмица НЕ влиза', texts.indexOf('СЛЕДВАЩАТА седмица') < 0);

    /* Отметка без дата съвпада само с явяване, което също няма дата
       (reportItemMatchesComp: if(it.date) сравнява, иначе true). Тук t-3 е
       такова, но е kind:'regular'/id:'t-3' — comp-ът е за t-1, значи не бива
       да мине по никой път. */
    ok('отметка без дата за задача с дата НЕ влиза',
      texts.indexOf('БЕЗ дата') < 0, texts.join(' | '));
  }

  section('2. Същото важи и за отложените');
  {
    const { w } = env();
    const comps = [
      comp({ status: 'postponed', comment: 'В седмицата', completion_date: '2026-08-19', item_id: 't-2', kind: 'recurring' }),
      comp({ status: 'postponed', comment: 'ИЗВЪН', completion_date: '2026-07-01', item_id: 't-2', kind: 'recurring' })
    ];
    const s = w.reportBuildSummary(ITEMS, comps, STORES, 0);
    ok('точно 1 отложена', s.postponedList.length === 1,
      JSON.stringify(s.postponedList.map(x => x.comment)));
    ok('и това е тази от седмицата', s.postponedList[0].comment === 'В седмицата');
  }

  section('3. ЯДРОТО: списъкът и процентът вече броят едно и също');
  {
    const { w } = env();
    /* Три отметки в седмицата (2 с коментар) + пет извън нея. */
    const comps = [
      comp({ item_id: 't-1', kind: 'regular',   store_name: 'Раднево', completion_date: '2026-08-18', comment: 'а' }),
      comp({ item_id: 't-2', kind: 'recurring', store_name: 'Раднево', completion_date: '2026-08-19', comment: 'б' }),
      comp({ item_id: 't-1', kind: 'regular',   store_name: 'Габрово', completion_date: '2026-08-18' }),
      comp({ item_id: 't-1', kind: 'regular',   store_name: 'Габрово', completion_date: '2026-06-01', comment: 'старо 1' }),
      comp({ item_id: 't-1', kind: 'regular',   store_name: 'Габрово', completion_date: '2026-06-02', comment: 'старо 2' }),
      comp({ item_id: 't-2', kind: 'recurring', store_name: 'Раднево', completion_date: null,         comment: 'старо 3' }),
      comp({ item_id: 't-2', kind: 'recurring', store_name: 'Габрово', completion_date: '2026-05-05', comment: 'старо 4' }),
      comp({ item_id: 't-1', kind: 'regular',   store_name: 'Раднево', completion_date: '2026-04-04', comment: 'старо 5' })
    ];
    const s = w.reportBuildSummary(ITEMS, comps, STORES, 0);

    ok('Раднево: 2 от 3', s.rows.find(r => r.name === 'Раднево').done === 2,
      JSON.stringify(s.rows.find(r => r.name === 'Раднево')));
    ok('Габрово: 1 от 3', s.rows.find(r => r.name === 'Габрово').done === 1,
      JSON.stringify(s.rows.find(r => r.name === 'Габрово')));
    ok('общо 3 от 6', s.totalDone === 3 && s.totalAll === 6,
      s.totalDone + '/' + s.totalAll);

    /* Преди поправката тук щяха да излязат 7 коментара (всички стари). */
    ok('коментарите са 2, не 7', s.commentedList.length === 2,
      JSON.stringify(s.commentedList.map(x => x.comment)));
    ok('нито един „старо" не е останал',
      !s.commentedList.some(x => /старо/.test(x.comment)),
      JSON.stringify(s.commentedList.map(x => x.comment)));
    /* Същинската проверка: изброените не могат да надхвърлят преброените. */
    ok('изброените коментари ≤ преброените изпълнени',
      s.commentedList.length <= s.totalDone,
      s.commentedList.length + ' срещу ' + s.totalDone);
  }

  section('4. „(неизвестна задача)" вече не се появява');
  {
    const { w } = env();
    /* Отметка за задача, която изобщо не е сред явяванията — типичният
       източник на този етикет преди поправката. */
    const comps = [
      comp({ item_id: 'ЧУЖДА', kind: 'regular', comment: 'чужда задача', completion_date: '2026-08-18' }),
      comp({ item_id: 't-1', kind: 'regular', comment: 'своя', completion_date: '2026-08-18' })
    ];
    const s = w.reportBuildSummary(ITEMS, comps, STORES, 0);
    ok('чуждата отметка отпада', s.commentedList.length === 1,
      JSON.stringify(s.commentedList.map(x => x.title + '/' + x.comment)));
    ok('никъде няма „(неизвестна задача)"',
      !s.commentedList.some(x => x.title === '(неизвестна задача)'),
      JSON.stringify(s.commentedList.map(x => x.title)));
    ok('заглавието е реалното', s.commentedList[0].title === 'Палети',
      s.commentedList[0].title);
  }

  section('5. Явяване БЕЗ дата пак хваща отметка без дата (не се чупи)');
  {
    const { w } = env();
    /* t-3 няма дата → reportItemMatchesComp връща true по id+kind.
       Това е заварено поведение и НЕ бива да се променя от поправката. */
    const comps = [comp({ item_id: 't-3', kind: 'regular', completion_date: null, comment: 'без срок' })];
    const s = w.reportBuildSummary(ITEMS, comps, STORES, 0);
    ok('влиза в коментарите', s.commentedList.length === 1,
      JSON.stringify(s.commentedList));
    ok('и се брои като изпълнена', s.totalDone === 1, String(s.totalDone));
  }

  section('6. Заявките носят прозорец по completion_date');
  {
    /* Целевата седмица зависи от ДНЕШНАТА дата, затова се смята от същите
       помощни функции, а не се зашива — иначе тестът изгнива идната седмица. */
    const probe = env();
    const target = probe.w.reportWeekOfMonday(probe.w.reportPrevWeekMonday(new Date()));
    const days = probe.w.weekDays(target.week, target.year).map(probe.w.toLocalISO);

    const h = env({
      bulletins: [{ id: 'b-t', week_number: target.week, year: target.year, status: 'published' }],
      recurring_tasks: [{ id: 'r-1', active: true, due_weekday: 1, title: 'Каса' }],
      bulletin_tasks: [{ id: 't-1', bulletin_id: 'b-t', title: 'Палети', due_date: days[1] }],
      task_completions: [], users: [{ store_name: 'Раднево' }],
      report_snapshots: [], differences_reports: [], stock_returns: [],
      kasa_storno: [], kasa_zoborot: [], goods_transit: [], transport_pallets: []
    });
    h.w.collectWeeklyReportData(function () {});
    await ticks();

    const qs = h.calls.get.filter(u => u.indexOf('/task_completions') >= 0);
    if (ok('има заявки към task_completions (' + qs.length + ')', qs.length >= 1,
        h.calls.get.join('\n'))) {
      const withWindow = qs.filter(u =>
        u.indexOf('completion_date=gte.') >= 0 && u.indexOf('completion_date=lte.') >= 0);
      ok('ВСИЧКИ носят completion_date прозорец',
        withWindow.length === qs.length, qs.join('\n'));
      ok('прозорецът е точно седмицата на бюлетина (' + days[0] + ' — ' + days[6] + ')',
        qs.every(u => u.indexOf('gte.' + days[0]) >= 0 && u.indexOf('lte.' + days[6]) >= 0),
        qs.join('\n'));
    }
  }

  section('6б. Без подходящ бюлетин заявките не измислят прозорец');
  {
    /* Само бъдещ бюлетин → reportPickWeeklyBulletin връща null. Тогава няма
       седмица, значи няма и прозорец — но нищо не бива да хвърли. */
    const probe = env();
    const target = probe.w.reportWeekOfMonday(probe.w.reportPrevWeekMonday(new Date()));
    const h = env({
      bulletins: [{ id: 'b-future', week_number: target.week + 2, year: target.year, status: 'published' }],
      recurring_tasks: [{ id: 'r-1', active: true, due_weekday: 1, title: 'Каса' }],
      bulletin_tasks: [], task_completions: [], users: [{ store_name: 'Раднево' }],
      report_snapshots: [], differences_reports: [], stock_returns: [],
      kasa_storno: [], kasa_zoborot: [], goods_transit: [], transport_pallets: []
    });
    let data = null;
    if (guard('колекторът не хвърля без бюлетин',
      () => h.w.collectWeeklyReportData(function (d) { data = d; }))) {
      await ticks();
      ok('връща обобщение', !!data, JSON.stringify(data));
      ok('етикетът го казва', data && data.weekLabel === 'Няма публикуван бюлетин',
        data && data.weekLabel);
    }
  }

  section('7. Дневният колектор НЕ е пипан');
  {
    const h = env({
      bulletins: [{ id: 'b-34', week_number: 34, year: 2026, status: 'published' }],
      recurring_tasks: [{ id: 'r-1', active: true, due_weekday: 1, title: 'Каса' }],
      bulletin_tasks: [], task_completions: [], users: [{ store_name: 'Раднево' }],
      report_snapshots: []
    });
    h.w.collectDailyReportData(function () {});
    await ticks();
    const qs = h.calls.get.filter(u => u.indexOf('/task_completions') >= 0);
    ok('дневните заявки остават без completion_date филтър',
      qs.every(u => u.indexOf('completion_date=') < 0),
      qs.join('\n'));
  }

  report();
})();
