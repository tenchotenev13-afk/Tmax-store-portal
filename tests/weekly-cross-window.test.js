/* ЕДИН прозорец в седмичния отчет — reportCrossWindow().

   Заварено противоречие в едно и също писмо със шапка „Седмица 33 · 2026":
     · процентът по обекти и списъците   → 17–23.08 (седмицата на бюлетина)
     · кросмодулните броячи отдолу       → 14–21.08 (подвижни 7 дни назад
                                            от момента на пускането)
   Ръчно пуснат отчет в сряда мереше трети интервал. Числата под една шапка
   отговаряха на три различни въпроса.

   Сега седмичният колектор подава СЪЩИТЕ wkDates, с които вече стеснява
   задачите и task_completions, и на кросмодулната секция.

   Дневният отчет и таб ДНЕС НЕ се пипат: там подвижните 7 дни са верният
   прозорец, защото няма шапка с номер на седмица, а въпросът е „какво се е
   случило напоследък".

   Не се пипат и моментните снимки („застояли pending >7 дни", „остарели
   палети") — те мерят спрямо ДНЕС, не „случило се през седмицата", и
   остават подвижни и в двата режима.

   Пускане:  node tests/weekly-cross-window.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

/* Тестът не заковава календарна дата — отчетната седмица се извежда от
   същите функции, които ползва и продукционният код, за да не изгние
   следващия понеделник. */
function weekUnderTest(w) {
  const target = w.reportWeekOfMonday(w.reportPrevWeekMonday(new Date()));
  return { target: target, dates: w.weekDays(target.week, target.year).map(w.toLocalISO) };
}

/* Мини-PostgREST: harness-ът връща цялата фикстура, независимо от филтрите,
   затова тук ги прилагаме сами. Само така се проверява РЕЗУЛТАТЪТ, а не
   само че URL-ът съдържа правилния низ. */
function byCreatedAt(rows) {
  return function (url) {
    const gte = (url.match(/created_at=gte\.([^&]+)/) || [])[1];
    const lt = (url.match(/created_at=lt\.([^&]+)/) || [])[1];
    return rows.filter(function (r) {
      if (gte && r.created_at < decodeURIComponent(gte)) return false;
      if (lt && !(r.created_at < decodeURIComponent(lt))) return false;
      return true;
    });
  };
}

/* Локална полунощ на дадена ISO дата, изместена с часове — така редът пада
   вътре или вън от седмицата независимо от часовата зона на машината. */
function stampOn(isoDate, hour) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setHours(hour);
  return d.toISOString();
}

function env(over) {
  return boot(Object.assign({
    modules: ['bulletin.js', 'today.js', 'report.js'],
    user: ADMIN,
    data: {
      bulletins: [], recurring_tasks: [], bulletin_tasks: [],
      task_completions: [], report_snapshots: [],
      users: [{ store_name: 'Раднево' }, { store_name: 'Централен офис' }],
      differences_reports: [], stock_returns: [], kasa_storno: [],
      kasa_zoborot: [], goods_transit: [], transport_pallets: []
    }
  }, over || {}));
}

function urlFor(calls, table) {
  return calls.get.filter(function (u) { return u.indexOf('/' + table + '?') >= 0; })[0] || '';
}

(async function () {

  section('1. reportCrossWindow — двата режима');
  {
    const { w } = env();

    const bounded = w.reportCrossWindow({ from: '2026-08-17', to: '2026-08-23' });
    ok('затворен прозорец пази датите',
      bounded.fromISO === '2026-08-17' && bounded.toISO === '2026-08-23',
      JSON.stringify(bounded));
    ok('долната граница е локална полунощ на понеделника',
      bounded.fromStamp === new Date('2026-08-17T00:00:00').toISOString(),
      bounded.fromStamp);
    /* ИЗКЛЮЧВАЩА горна граница: `lte.` върху дата на timestamptz би отрязал
       всичко след неделя 00:00:00 и цялата неделя щеше да изчезне. */
    ok('горната граница е полунощ на СЛЕДВАЩИЯ понеделник',
      bounded.toStamp === new Date('2026-08-24T00:00:00').toISOString(),
      bounded.toStamp);
    ok('последната секунда на неделята е ВЪТРЕ',
      new Date('2026-08-23T23:59:59') < new Date(bounded.toStamp));
    ok('първата секунда на понеделника е ВЪН',
      new Date('2026-08-24T00:00:00') >= new Date(bounded.toStamp));

    const rolling = w.reportCrossWindow(null);
    ok('подвижният няма горна граница',
      rolling.toISO === null && rolling.toStamp === null, JSON.stringify(rolling));
    const daysBack = Math.round((Date.now() - new Date(rolling.fromStamp)) / 86400000);
    ok('и започва 7 дни назад', daysBack === 7, String(daysBack));

    /* Половинчат обект не бива да мине за затворен прозорец. */
    ok('само from → пада на подвижния',
      w.reportCrossWindow({ from: '2026-08-17' }).toStamp === null);
    ok('празен обект → пада на подвижния',
      w.reportCrossWindow({}).toStamp === null);
  }

  section('2. ЯДРОТО: шапката и кросмодулната секция мерят едно и също');
  {
    const probe = env();
    const wk = weekUnderTest(probe.w);
    probe.close();

    const h = env({
      data: {
        bulletins: [{ id: 'b-1', week_number: wk.target.week, year: wk.target.year,
                      status: 'published' }],
        bulletin_tasks: [{ id: 't-1', bulletin_id: 'b-1', title: 'Палети',
                           due_date: wk.dates[2] }],
        recurring_tasks: [], task_completions: [], report_snapshots: [],
        users: [{ store_name: 'Раднево' }, { store_name: 'Централен офис' }],
        differences_reports: [], stock_returns: [], kasa_storno: [],
        kasa_zoborot: [], goods_transit: [], transport_pallets: []
      }
    });

    let summary = null;
    h.w.collectWeeklyReportData(function (s) { summary = s; });
    await ticks();

    if (ok('седмичното обобщение се събира', !!summary)) {
      ok('шапката е за отчетната седмица',
        summary.weekLabel === 'Седмица ' + wk.target.week + ' · ' + wk.target.year,
        summary.weekLabel);

      const monday = new Date(wk.dates[0] + 'T00:00:00').toISOString();
      const nextMon = new Date(new Date(wk.dates[6] + 'T00:00:00').getTime() + 86400000).toISOString();

      const diffUrl = urlFor(h.calls, 'differences_reports');
      ok('Разлики: долна граница = понеделника на седмицата',
        diffUrl.indexOf('created_at=gte.' + monday) >= 0, diffUrl);
      ok('Разлики: има и ГОРНА граница (не е отворен интервал)',
        diffUrl.indexOf('created_at=lt.' + nextMon) >= 0, diffUrl);

      const stornoUrl = urlFor(h.calls, 'kasa_storno');
      ok('Сторно: същите две граници',
        stornoUrl.indexOf('created_at=gte.' + monday) >= 0 &&
        stornoUrl.indexOf('created_at=lt.' + nextMon) >= 0, stornoUrl);

      const zoborotUrl = urlFor(h.calls, 'kasa_zoborot');
      ok('Равнение: от понеделник до неделя по дата',
        zoborotUrl.indexOf('date=gte.' + wk.dates[0]) >= 0 &&
        zoborotUrl.indexOf('date=lte.' + wk.dates[6]) >= 0, zoborotUrl);

      /* Другата половина на писмото — процентът по обекти. Ако двата
         прозореца се разминат, писмото пак ще си противоречи. */
      const compUrl = h.calls.get.filter(function (u) {
        return u.indexOf('/task_completions?') >= 0;
      })[0] || '';
      ok('task_completions ползва СЪЩИЯ понеделник',
        compUrl.indexOf('completion_date=gte.' + wk.dates[0]) >= 0, compUrl);
      ok('и СЪЩАТА неделя',
        compUrl.indexOf('completion_date=lte.' + wk.dates[6]) >= 0, compUrl);

      if (ok('кросмодулната секция е налице', !!summary.cross)) {
        ok('прозорецът пътува с числата — from е понеделникът',
          summary.cross.window.from === wk.dates[0],
          JSON.stringify(summary.cross.window));
        ok('и to е неделята',
          summary.cross.window.to === wk.dates[6],
          JSON.stringify(summary.cross.window));
      }
    }
    h.close();
  }

  section('3. Данните наистина се отрязват — не само URL-ът');
  {
    const probe = env();
    const wk = weekUnderTest(probe.w);
    probe.close();

    const todayISO = probe.w.toLocalISO(new Date());
    const ROWS = [
      /* Четвъртък и събота от отчетната седмица — трябва да влязат. */
      { store_name: 'Раднево', direction: 'supplier', reviewed: false,
        created_at: stampOn(wk.dates[3], 10) },
      { store_name: 'Севлиево', direction: 'supplier', reviewed: true,
        created_at: stampOn(wk.dates[5], 14) },
      /* ДНЕС — винаги вътре в подвижните 7 дни и винаги ИЗВЪН приключилата
         седмица, независимо кой ден се пуска тестът. Точно този ред е
         причината двете числа да не съвпадаха. */
      { store_name: 'Габрово', direction: 'supplier', reviewed: false,
        created_at: stampOn(todayISO, 10) },
      /* Сторната по грешен прием е отделен ред, но ползва същия прозорец.
         Тя носи и разбивка по обект — оттам се вижда КОЙ ред е минал, не
         само колко са. */
      { store_name: 'Троян', direction: 'wrong_receipt', reviewed: false,
        created_at: stampOn(wk.dates[1], 9) },
      { store_name: 'Габрово', direction: 'wrong_receipt', reviewed: false,
        created_at: stampOn(todayISO, 11) }
    ];

    const h = env({
      data: {
        bulletins: [{ id: 'b-1', week_number: wk.target.week, year: wk.target.year,
                      status: 'published' }],
        bulletin_tasks: [], recurring_tasks: [], task_completions: [],
        report_snapshots: [],
        users: [{ store_name: 'Раднево' }, { store_name: 'Централен офис' }],
        differences_reports: byCreatedAt(ROWS),
        stock_returns: [], kasa_storno: [], kasa_zoborot: [],
        goods_transit: [], transport_pallets: []
      }
    });

    let summary = null;
    h.w.collectWeeklyReportData(function (s) { summary = s; });
    await ticks();

    let weekStores = '';
    if (ok('обобщението се събира', !!(summary && summary.cross))) {
      const c = summary.cross;
      ok('Разлики броят двете от седмицата, не днешната',
        c.diffs.total === 2, String(c.diffs.total));
      ok('и прегледаните/непрегледаните се разделят вътре в прозореца',
        c.diffs.reviewed === 1 && c.diffs.unreviewed === 1,
        c.diffs.reviewed + '/' + c.diffs.unreviewed);
      ok('сторната от седмицата е вътре', c.wrongReceipt.total === 1,
        String(c.wrongReceipt.total));
      weekStores = JSON.stringify(c.wrongReceipt.byStore);
      ok('и е на Троян (бланката от вторник)',
        c.wrongReceipt.byStore.length === 1 && c.wrongReceipt.byStore[0].store === 'Троян',
        weekStores);
      ok('Габрово (днешната) НЕ се появява в разбивката',
        weekStores.indexOf('Габрово') < 0, weekStores);
    }
    h.close();

    /* Контра-проверка: СЪЩИТЕ редове през подвижния прозорец дават ДРУГИЯ
       обект. Без нея „Габрово го няма" би минало и ако фикстурата просто не
       различава двата прозореца — тогава проверката отгоре не доказва нищо.
       Сравняват се обектите, не броевете: в зависимост от деня на пускане
       двата прозореца може да се препокриват частично и броевете да съвпаднат
       по случайност, но „днешната бланка" е винаги вън от приключилата
       седмица и винаги вътре в подвижните 7 дни. */
    const h2 = env({
      data: {
        bulletins: [], recurring_tasks: [], bulletin_tasks: [],
        task_completions: [], report_snapshots: [],
        users: [{ store_name: 'Раднево' }],
        differences_reports: byCreatedAt(ROWS),
        stock_returns: [], kasa_storno: [], kasa_zoborot: [],
        goods_transit: [], transport_pallets: []
      }
    });
    let rolling = null;
    h2.w.collectCrossModuleWeeklySummary(function (c) { rolling = c; });
    await ticks();
    if (ok('подвижният прозорец връща обобщение', !!rolling)) {
      const rollStores = JSON.stringify(rolling.wrongReceipt.byStore);
      ok('подвижният ВИЖДА днешната бланка (Габрово)',
        rollStores.indexOf('Габрово') >= 0, rollStores);
      ok('двата прозореца дават различни обекти — фикстурата ги различава',
        rollStores !== weekStores, rollStores + '  vs  ' + weekStores);
    }
    h2.close();
  }

  section('4. Таб ДНЕС и дневният път остават на подвижни 7 дни');
  {
    const h = env();
    let cross = null;
    h.w.collectCrossModuleWeeklySummary(function (c) { cross = c; });
    await ticks();

    const diffUrl = urlFor(h.calls, 'differences_reports');
    ok('няма горна граница по created_at',
      diffUrl.indexOf('created_at=lt.') < 0, diffUrl);
    ok('няма и горна граница по date за Равнение',
      urlFor(h.calls, 'kasa_zoborot').indexOf('date=lte.') < 0,
      urlFor(h.calls, 'kasa_zoborot'));
    if (ok('обобщението се събира', !!cross)) {
      ok('window.to е null', cross.window.to === null, JSON.stringify(cross.window));
    }
    h.close();

    /* today.js вика колектора БЕЗ втори аргумент — това е договорът, който
       пази таб ДНЕС на подвижния прозорец. */
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'today.js'), 'utf8');
    ok('today.js не подава прозорец на колектора',
      /collectCrossModuleWeeklySummary\(function\(cross\)\{[\s\S]{0,400}?\}\);/.test(src),
      'today.js вече подава втори аргумент — провери дали е нарочно');
  }

  section('5. Моментните снимки НЕ следват прозореца');
  {
    const probe = env();
    const wk = weekUnderTest(probe.w);
    probe.close();

    const h = env({
      data: {
        bulletins: [{ id: 'b-1', week_number: wk.target.week, year: wk.target.year,
                      status: 'published' }],
        bulletin_tasks: [], recurring_tasks: [], task_completions: [],
        report_snapshots: [],
        users: [{ store_name: 'Раднево' }],
        differences_reports: [], stock_returns: [], kasa_storno: [],
        kasa_zoborot: [], goods_transit: [], transport_pallets: []
      }
    });
    let summary = null;
    h.w.collectWeeklyReportData(function (s) { summary = s; });
    await ticks();

    const transitUrl = urlFor(h.calls, 'goods_transit');
    const stale = (transitUrl.match(/created_at=lt\.([^&]+)/) || [])[1];
    if (ok('Стока на път носи праг', !!stale, transitUrl)) {
      const daysBack = Math.round((Date.now() - new Date(decodeURIComponent(stale))) / 86400000);
      ok('прагът е 7 дни преди ДНЕС, не границата на седмицата',
        daysBack === 7, String(daysBack) + ' дни · ' + stale);
      ok('и не съвпада с понеделника на седмицата',
        decodeURIComponent(stale) !== new Date(wk.dates[0] + 'T00:00:00').toISOString());
    }
    ok('За връщане остава без филтър по дата',
      urlFor(h.calls, 'stock_returns').indexOf('created_at') < 0,
      urlFor(h.calls, 'stock_returns'));
    ok('Палети остават без филтър по дата',
      urlFor(h.calls, 'transport_pallets').indexOf('report_date=') < 0,
      urlFor(h.calls, 'transport_pallets'));
    h.close();
  }

  section('6. Заглавието изписва кой е прозорецът');
  {
    const { w } = env();
    const lbl = w.reportCrossWindowLabel({ from: '2026-08-17', to: '2026-08-23' });
    ok('затвореният прозорец се изписва като интервал',
      lbl.indexOf('17') >= 0 && lbl.indexOf('23') >= 0 && lbl.indexOf('–') >= 0, lbl);
    ok('подвижният се изписва с думи',
      w.reportCrossWindowLabel(null) === 'последните 7 дни',
      w.reportCrossWindowLabel(null));
    ok('липсващ window също (стар cross без полето не чупи)',
      w.reportCrossWindowLabel({ from: '2026-08-17', to: null }) === 'последните 7 дни');

    const cross = {
      diffs: { total: 0, reviewed: 0, unreviewed: 0 },
      wrongReceipt: { total: 0, unreviewed: 0, byStore: [] },
      returns: { open: 0, completed: 0 },
      storno: { total: 0, draft: 0, returned: 0, resubmitted: 0, confirmed: 0 },
      zoborot: { total: 0, draft: 0, confirmed: 0 },
      transitStale: 0, pallets: { missing: 0, stale: 0, total: 18 },
      window: { from: '2026-08-17', to: '2026-08-23' }
    };
    const html = w.buildCrossModuleSectionHtml(cross);
    ok('заглавието носи интервала', html.indexOf(lbl) >= 0, html.slice(0, 300));
    ok('и вече не твърди „от седмицата" безусловно',
      html.indexOf('Друго от седмицата') < 0, html.slice(0, 300));
    ok('редовете не се разминават със заглавието',
      html.indexOf('нови тази седмица') < 0, html.slice(0, 900));

    /* Старо cross без window (напр. кеширано в таб ДНЕС между версии) не
       бива да гърми — деградира до подвижната формулировка. */
    delete cross.window;
    let noWin = '';
    if (guard('cross без window не хвърля', function () {
      noWin = w.buildCrossModuleSectionHtml(cross);
    })) {
      ok('и пише „последните 7 дни"', noWin.indexOf('последните 7 дни') >= 0,
        noWin.slice(0, 300));
    }
  }

  report();
})();
