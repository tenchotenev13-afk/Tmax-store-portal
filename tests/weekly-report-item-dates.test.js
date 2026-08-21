/* Явяванията в седмичния отчет винаги носят дата или диапазон —
   reportItemMatchesComp() + строенето на items в collectWeeklyReportData().

   Заварено: `if (it.date) ... return true` означаваше, че явяване БЕЗ дата
   съвпада с КОЕ ДА Е отмятане на същата задача — включително от други
   седмици. Две места го произвеждаха:

     · постоянна задача без явяване в тази седмица влизаше с date:null и
       едновременно надуваше знаменателя, и лапваше чужди отмятания;
     · задача от бюлетина без собствен срок (30 от 43 в базата!) влизаше с
       date:null по същия начин.

   Поправката е различна за двата случая, защото случаите са различни:
     · постоянна без явяване → изобщо не влиза в набора;
     · задача за цялата седмица → получава ДИАПАЗОН (dateFrom/dateTo).
   Второто е нарочно: 30 от 43 задачи нямат срок и изхвърлянето им би
   свило знаменателя до безсмислие.

   Дневният репорт НЕ бива да се променя — неговите явявания нямат нито
   дата, нито диапазон, защото той вече е стеснил comps до днешния ден в JS.

   Пускане:  node tests/weekly-report-item-dates.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

function env(data) {
  return boot({ modules: ['bulletin.js', 'report.js'], user: ADMIN, data: data || {} });
}

(async function () {

  section('1. Диапазон: съвпада ВЪТРЕ в седмицата, не извън нея');
  {
    const { w } = env();
    const it = { id: 't-1', kind: 'regular', dateFrom: '2026-08-17', dateTo: '2026-08-23' };
    const c = d => ({ item_id: 't-1', kind: 'regular', completion_date: d });

    ok('първи ден от диапазона', w.reportItemMatchesComp(it, c('2026-08-17')) === true);
    ok('среда на седмицата', w.reportItemMatchesComp(it, c('2026-08-19')) === true);
    ok('последен ден', w.reportItemMatchesComp(it, c('2026-08-23')) === true);
    ok('ден ПРЕДИ диапазона не съвпада', w.reportItemMatchesComp(it, c('2026-08-16')) === false);
    ok('ден СЛЕД диапазона не съвпада', w.reportItemMatchesComp(it, c('2026-08-24')) === false);
    ok('отмятане БЕЗ дата не съвпада', w.reportItemMatchesComp(it, c(null)) === false);
    ok('чужда задача не съвпада',
      w.reportItemMatchesComp(it, { item_id: 'друга', kind: 'regular', completion_date: '2026-08-19' }) === false);
  }

  section('2. Точната дата остава по-силна от диапазона');
  {
    const { w } = env();
    /* Ако някога и двете бъдат зададени, датата решава. */
    const it = { id: 't-1', kind: 'regular', date: '2026-08-18',
                 dateFrom: '2026-08-17', dateTo: '2026-08-23' };
    ok('съвпада точно на своя ден',
      w.reportItemMatchesComp(it, { item_id: 't-1', kind: 'regular', completion_date: '2026-08-18' }) === true);
    ok('НЕ съвпада на друг ден от същата седмица',
      w.reportItemMatchesComp(it, { item_id: 't-1', kind: 'regular', completion_date: '2026-08-19' }) === false);
  }

  section('3. Дневният репорт НЕ е засегнат');
  {
    const { w } = env();
    /* Явяванията на дневния нямат нито date, нито dateFrom. */
    const it = { id: 't-1', kind: 'regular' };
    ok('съвпада по id+kind, както преди',
      w.reportItemMatchesComp(it, { item_id: 't-1', kind: 'regular', completion_date: '2026-08-18' }) === true);
    ok('съвпада и при отмятане без дата',
      w.reportItemMatchesComp(it, { item_id: 't-1', kind: 'regular', completion_date: null }) === true);
    ok('но не и за чужда задача',
      w.reportItemMatchesComp(it, { item_id: 'x', kind: 'regular', completion_date: null }) === false);
  }

  section('4. Постоянна задача БЕЗ явяване не влиза в набора');
  {
    const probe = env();
    const target = probe.w.reportWeekOfMonday(probe.w.reportPrevWeekMonday(new Date()));
    const days = probe.w.weekDays(target.week, target.year).map(probe.w.toLocalISO);

    const h = env({
      bulletins: [{ id: 'b-t', week_number: target.week, year: target.year, status: 'published' }],
      recurring_tasks: [
        /* Дължима в понеделник — има явяване. */
        { id: 'r-yes', active: true, due_weekday: 0, title: 'Има явяване' },
        /* Минава филтъра recurringScheduled (due_weekday не е null), но
           due_weekdays сочи несъществуващ индекс → нула явявания. */
        { id: 'r-none', active: true, due_weekday: 3, due_weekdays: [9], title: 'Няма явяване' }
      ],
      bulletin_tasks: [],
      task_completions: [], users: [{ store_name: 'Раднево' }],
      report_snapshots: [], differences_reports: [], stock_returns: [],
      kasa_storno: [], kasa_zoborot: [], goods_transit: [], transport_pallets: []
    });
    let data = null;
    h.w.collectWeeklyReportData(function (d) { data = d; });
    await ticks();

    const q = h.calls.get.find(u => u.indexOf('recurring_task_id=in.') >= 0);
    if (ok('има заявка за постоянните отмятания', !!q, h.calls.get.join('\n'))) {
      ok('r-yes е в заявката', q.indexOf('r-yes') >= 0, q);
      ok('r-none НЕ е в заявката', q.indexOf('r-none') < 0, q);
    }
    if (ok('колекторът връща обобщение', !!data)) {
      /* Само r-yes дава явяване → знаменателят е 1 на обект, не 2. */
      ok('знаменателят е 1, не 2', data.totalAll === 1, String(data.totalAll));
    }
  }

  section('5. Задача от бюлетина БЕЗ срок се брои по диапазона');
  {
    const probe = env();
    const target = probe.w.reportWeekOfMonday(probe.w.reportPrevWeekMonday(new Date()));
    const days = probe.w.weekDays(target.week, target.year).map(probe.w.toLocalISO);
    const beforeWeek = probe.w.toLocalISO(
      new Date(new Date(days[0] + 'T00:00:00').getTime() - 86400000));

    function run(comps, label) {
      const h = env({
        bulletins: [{ id: 'b-t', week_number: target.week, year: target.year, status: 'published' }],
        recurring_tasks: [],
        bulletin_tasks: [{ id: 't-nodate', bulletin_id: 'b-t', title: 'Без срок' }],
        task_completions: comps,
        users: [{ store_name: 'Раднево' }],
        report_snapshots: [], differences_reports: [], stock_returns: [],
        kasa_storno: [], kasa_zoborot: [], goods_transit: [], transport_pallets: []
      });
      let d = null;
      h.w.collectWeeklyReportData(function (x) { d = x; });
      return ticks().then(() => d);
    }

    const withIn = await run([{ task_id: 't-nodate', store_name: 'Раднево',
      status: 'done', completion_date: days[3], comment: '', photos: [] }]);
    ok('задачата без срок влиза в знаменателя', withIn && withIn.totalAll === 1,
      withIn && String(withIn.totalAll));
    ok('отмятане ВЪТРЕ в седмицата я брои за изпълнена',
      withIn && withIn.totalDone === 1, withIn && String(withIn.totalDone));

    /* Отмятане извън седмицата не бива да я брои. Заявката така или иначе
       вече го отрязва, но проверката пази и ако някой я разхлаби. */
    const { w } = env();
    const itNoDate = { id: 't-nodate', kind: 'regular', date: null,
                       dateFrom: days[0], dateTo: days[6] };
    ok('отмятане от предната седмица НЕ я брои',
      w.reportItemMatchesComp(itNoDate,
        { item_id: 't-nodate', kind: 'regular', completion_date: beforeWeek }) === false,
      beforeWeek);
  }

  section('6. Граница: без бюлетин нищо не се строи и нищо не гърми');
  {
    const probe = env();
    const target = probe.w.reportWeekOfMonday(probe.w.reportPrevWeekMonday(new Date()));
    const h = env({
      /* Само бъдещ бюлетин → reportPickWeeklyBulletin връща null. */
      bulletins: [{ id: 'b-f', week_number: target.week + 3, year: target.year, status: 'published' }],
      recurring_tasks: [{ id: 'r-1', active: true, due_weekday: 0, title: 'Каса' }],
      bulletin_tasks: [], task_completions: [], users: [{ store_name: 'Раднево' }],
      report_snapshots: [], differences_reports: [], stock_returns: [],
      kasa_storno: [], kasa_zoborot: [], goods_transit: [], transport_pallets: []
    });
    let data = null;
    if (guard('не хвърля без бюлетин',
      () => h.w.collectWeeklyReportData(function (d) { data = d; }))) {
      await ticks();
      ok('връща обобщение', !!data);
      /* Без седмица постоянните нямат явявания → не влизат. */
      ok('знаменателят е 0, не измислен', data && data.totalAll === 0,
        data && String(data.totalAll));
    }
  }

  report();
})();
