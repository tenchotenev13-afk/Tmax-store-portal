/* Дневният отчет описва ПРИКЛЮЧИЛИЯ ден, не текущия.

   Кронът „daily-report-8am" пуска едж функцията в 05:00 UTC = 08:00
   българско. Дотогава `collectDailyReportData` събираше задачите, дължими
   за ТЕКУЩИЯ ден, и слагаше днешната дата в шапката — в 8 сутринта почти
   нищо не е отметнато, тоест всяка сутрин излизаше писмо с почти нули за
   ден, който още не е започнал. Тревога без покритие.

   Тук се заковават местата, които трябва да сочат към ЕДИН и същи ден, за
   да не се разминат пак: датата в шапката, преобразуването на делника (от
   него зависи кои постоянни задачи влизат) и етикетът на тенденцията.

   Плюс подзаглавието на седмичния — досега „Обобщение за седмицата" не
   казваше коя седмица.

   Пускане:  node tests/report-daily-date.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

function env(data) {
  return boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: Object.assign({
      users: [], bulletins: [], recurring_tasks: [], bulletin_tasks: [],
      task_completions: [], report_snapshots: []
    }, data || {})
  });
}

/* Пълен набор за буилдърите — менят се само датите. */
function daily(over) {
  return Object.assign({
    overallPct: 50, totalDone: 3, totalAll: 6, laggards: 1, storeCount: 2,
    rows: [{ name: 'Враца', done: 1, total: 3, pct: 33 },
           { name: 'Троян', done: 2, total: 3, pct: 67 }],
    top3: [], bottom3: [], noDueCount: 0,
    postponedList: [], commentedList: [], trendYesterday: null
  }, over || {});
}
function weekly(over) {
  return Object.assign(daily(), {
    weekLabel: 'Седмица 34 · 2026', cross: null, trendPrevWeek: null
  }, over || {});
}

(async function () {

  section('1. ЯДРОТО: reportDailyTargetDate връща предходния ден');
  {
    const { w } = env();
    const iso = function (d) { return w.toLocalISO(d); };

    ok('обикновен ден: 24.08 → 23.08',
      iso(w.reportDailyTargetDate(new Date(2026, 7, 24))) === '2026-08-23',
      iso(w.reportDailyTargetDate(new Date(2026, 7, 24))));

    /* Границата на месеца — първият ден сочи към последния на предходния. */
    ok('1-ви на месеца: 01.09 → 31.08',
      iso(w.reportDailyTargetDate(new Date(2026, 8, 1))) === '2026-08-31',
      iso(w.reportDailyTargetDate(new Date(2026, 8, 1))));

    ok('след къс месец: 01.03.2026 → 28.02.2026',
      iso(w.reportDailyTargetDate(new Date(2026, 2, 1))) === '2026-02-28',
      iso(w.reportDailyTargetDate(new Date(2026, 2, 1))));

    /* 2028 е високосна: 01.03 сочи към 29.02, не към 28.02. */
    ok('високосна: 01.03.2028 → 29.02.2028',
      iso(w.reportDailyTargetDate(new Date(2028, 2, 1))) === '2028-02-29',
      iso(w.reportDailyTargetDate(new Date(2028, 2, 1))));

    ok('границата на годината: 01.01.2027 → 31.12.2026',
      iso(w.reportDailyTargetDate(new Date(2027, 0, 1))) === '2026-12-31',
      iso(w.reportDailyTargetDate(new Date(2027, 0, 1))));

    /* Часът в подадения момент не бива да влияе — кронът бие в 08:00, но
       ръчното пускане от портала може да е по всяко време на деня. */
    const early = iso(w.reportDailyTargetDate(new Date(2026, 7, 24, 0, 5)));
    const late = iso(w.reportDailyTargetDate(new Date(2026, 7, 24, 23, 55)));
    ok('часът не влияе: 00:05 и 23:55 дават същия ден',
      early === late && early === '2026-08-23', early + ' / ' + late);
  }

  section('2. reportWeekdayIdx: 0=Пон … 6=Нед');
  {
    const { w } = env();
    /* 24.08.2026 е понеделник. */
    ok('понеделник → 0', w.reportWeekdayIdx(new Date(2026, 7, 24)) === 0,
      String(w.reportWeekdayIdx(new Date(2026, 7, 24))));
    ok('събота → 5', w.reportWeekdayIdx(new Date(2026, 7, 29)) === 5,
      String(w.reportWeekdayIdx(new Date(2026, 7, 29))));
    /* Неделя е капанът: JS я дава като 0, порталът я иска като 6. */
    ok('неделя → 6', w.reportWeekdayIdx(new Date(2026, 7, 30)) === 6,
      String(w.reportWeekdayIdx(new Date(2026, 7, 30))));

    /* И реалната връзка: понеделнишка задача НЕ е дължима за неделя. */
    const t = { due_weekdays: [0] };
    ok('задача „понеделник" е дължима при idx на понеделник',
      w.recurringIsDueOnWeekday(t, w.reportWeekdayIdx(new Date(2026, 7, 24))));
    ok('същата задача НЕ е дължима при idx на неделя',
      !w.recurringIsDueOnWeekday(t, w.reportWeekdayIdx(new Date(2026, 7, 30))));
  }

  section('3. ЯДРОТО: шапката носи датата от данните, не от часовника');
  {
    const { w } = env();
    const html = w.buildDailyReportHtml(daily({ reportDate: '2026-08-23' }));

    ok('пише 23 август', html.indexOf('23 август') >= 0);
    ok('пише неделя (23.08.2026 е неделя)', html.indexOf('неделя') >= 0);

    /* Същинската проверка: целият низ за 23.08 присъства, а низът за ДНЕС
       не се появява. Иначе тестът щеше да минава и ако буилдърът беше
       пропуснат — днешната дата също съдържа „2026". */
    const fmt = function (d) {
      return d.toLocaleDateString('bg-BG',
        { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    };
    const wantedBg = fmt(new Date('2026-08-23T00:00:00'));
    const todayBg = fmt(new Date());
    ok('точният низ е за 23.08, не за днес',
      html.indexOf(wantedBg) >= 0 && (todayBg === wantedBg || html.indexOf(todayBg) < 0),
      'търсен: ' + wantedBg);
  }

  section('4. Граничен: reportDate липсва → пада обратно на часовника');
  {
    const { w } = env();
    const html = w.buildDailyReportHtml(daily());
    const todayBg = new Date().toLocaleDateString('bg-BG',
      { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    ok('стар обект без reportDate не гърми и показва днешната дата',
      html.indexOf(todayBg) >= 0, todayBg);
    ok('и не изписва „Invalid Date"', html.indexOf('Invalid Date') < 0);
  }

  section('5. Етикетът на тенденцията вече не казва „вчера"');
  {
    const { w } = env();
    const html = w.buildDailyReportHtml(daily({
      reportDate: '2026-08-23',
      trendYesterday: { overall_pct: 40 }
    }));
    /* Читателят отваря писмото на 24-ти, а сравнението е 23-ти срещу 22-ри —
       „спрямо вчера" сочи грешен ден за него. */
    ok('пише „спрямо предходния ден"', html.indexOf('спрямо предходния ден') >= 0);
    ok('не пише „спрямо вчера"', html.indexOf('спрямо вчера') < 0);
  }

  section('6. Седмичният: датите влизат в подзаглавието');
  {
    const { w } = env();
    const wk = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20',
                '2026-08-21', '2026-08-22', '2026-08-23'];

    ok('диапазонът е с водещи нули и година',
      w.reportWeekRangeLabel(wk) === 'Обобщение за 17.08 – 23.08.2026',
      w.reportWeekRangeLabel(wk));

    /* Границата на годината: седмицата почва в едната, свършва в другата.
       Годината се взима от НЕДЕЛЯТА — отчетът се чете за приключилото. */
    const nyWk = ['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01',
                  '2026-01-02', '2026-01-03', '2026-01-04'];
    ok('седмица през Нова година: 29.12 – 04.01.2026',
      w.reportWeekRangeLabel(nyWk) === 'Обобщение за 29.12 – 04.01.2026',
      w.reportWeekRangeLabel(nyWk));

    /* Без бюлетин wkDates е null — общият текст, не „undefined". */
    ok('null → общият текст',
      w.reportWeekRangeLabel(null) === 'Обобщение за седмицата',
      w.reportWeekRangeLabel(null));
    ok('къс масив → общият текст',
      w.reportWeekRangeLabel(['2026-08-17']) === 'Обобщение за седмицата',
      w.reportWeekRangeLabel(['2026-08-17']));

    const html = w.buildWeeklyReportHtml(weekly({ weekDates: wk }));
    ok('седмичният HTML носи диапазона',
      html.indexOf('Обобщение за 17.08 – 23.08.2026') >= 0);
    ok('номерът на седмицата остава в заглавието',
      html.indexOf('Седмица 34 · 2026') >= 0);

    const noBul = w.buildWeeklyReportHtml(weekly({ weekDates: null }));
    ok('без бюлетин седмичният не показва „undefined"',
      noBul.indexOf('undefined') < 0 &&
      noBul.indexOf('Обобщение за седмицата') >= 0);
  }

  section('7. ЯДРОТО: самият колектор гледа ВЧЕРАШНИЯ прозорец');
  {
    /* Дотук се тестваха помощниците и буилдърите. Те минаваха и когато
       вътре в collectDailyReportData стоеше втора, засенчваща променлива
       със стойност ДНЕС — прозорецът си оставаше днешният, мълчаливо.
       Затова тук колекторът се пуска наистина, със засети данни. */
    const probe = env();
    const yDate = probe.w.reportDailyTargetDate(new Date());
    const yISO = probe.w.toLocalISO(yDate);
    const tISO = probe.w.toLocalISO(new Date());
    const yIdx = probe.w.reportWeekdayIdx(yDate);
    const tIdx = probe.w.reportWeekdayIdx(new Date());

    const h = env({
      users: [{ store_name: 'Враца' }, { store_name: 'Троян' }],
      bulletins: [{ id: 'b-1', week_number: 34, year: 2026, status: 'published' }],
      recurring_tasks: [
        { id: 'r-y', active: true, due_weekdays: [yIdx], title: 'Вчерашна постоянна' },
        { id: 'r-t', active: true, due_weekdays: [tIdx], title: 'Днешна постоянна' }
      ],
      bulletin_tasks: [
        { id: 'b-y', bulletin_id: 'b-1', title: 'Вчерашна от бюлетина', due_date: yISO },
        { id: 'b-t', bulletin_id: 'b-1', title: 'Днешна от бюлетина', due_date: tISO }
      ],
      task_completions: [
        /* Враца е свършила и двете вчерашни — трябва да излезе на 100%. */
        { recurring_task_id: 'r-y', store_name: 'Враца', status: 'done', completion_date: yISO },
        { task_id: 'b-y', store_name: 'Враца', status: 'done', completion_date: yISO },
        /* Троян е отметнал СЪЩАТА задача, но ДНЕС — извън отчетния ден.
           Точно това броене правеше сутрешния отчет безсмислен. */
        { recurring_task_id: 'r-y', store_name: 'Троян', status: 'done', completion_date: tISO }
      ]
    });

    let daily = null;
    h.w.collectDailyReportData(function (d) { daily = d; });
    await ticks();

    if (ok('колекторът връща обобщение', !!daily)) {
      ok('reportDate е вчерашният ден', daily.reportDate === yISO,
        daily.reportDate + ' вместо ' + yISO);

      /* 2 вчерашни задачи × 2 обекта = 4. Влезеха ли и днешните, ще е 8. */
      ok('знаменателят брои само вчерашните задачи', daily.totalAll === 4,
        'totalAll=' + daily.totalAll + ' (днешните не бива да влизат)');
      ok('числителят брои само отмятанията от вчера', daily.totalDone === 2,
        'totalDone=' + daily.totalDone);

      const vraca = daily.rows.filter(r => r.name === 'Враца')[0];
      const troyan = daily.rows.filter(r => r.name === 'Троян')[0];
      ok('Враца е на 100%', vraca && vraca.pct === 100,
        vraca ? String(vraca.pct) : 'липсва ред');
      ok('Троян е на 0% — днешното му отмятане не се брои за вчера',
        troyan && troyan.pct === 0, troyan ? String(troyan.pct) : 'липсва ред');

      /* И шапката, пресметната от същите данни, носи вчерашната дата. */
      const html = h.w.buildDailyReportHtml(daily);
      const wanted = new Date(yISO + 'T00:00:00').toLocaleDateString('bg-BG',
        { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      ok('шапката носи вчерашната дата', html.indexOf(wanted) >= 0, wanted);
    }
  }

  report();
})();
