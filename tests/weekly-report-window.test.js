/* Кой прозорец обобщава седмичният отчет — collectWeeklyReportData().

   Заварено поведение: взимаше се просто последният публикуван бюлетин
   (order=created_at.desc&limit=1). Бюлетинът обаче се публикува ПРЕДВАРИТЕЛНО
   за идващата седмица — на 20.08.2026 (четвъртък) вече беше публикуван този
   за седмица 35, тоест 24–30.08.

   Следствието беше тихо и правдоподобно: всички явявания имат дати в
   бъдещето, reportItemMatchesComp иска ТОЧНО съвпадение на датата, нито едно
   completion не съвпада → 0%. Историята на snapshot-ите го показва —
   всеки понеделнишки отчет е бил 9–11%, защото е обобщавал седмица, която
   тъкмо започва, а не приключилата.

   Тестът заковава прозореца за две дати: днешната (петък 21.08) и
   понеделник сутрин 24.08, когато cron-ът реално пуска.

   Пускане:  node tests/weekly-report-window.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks } = H;

/* Публикувани бюлетини — точно както ги връща PostgREST при
   order=year.desc,week_number.desc. w35 е публикуван ПРЕДИ да е започнал. */
const BULLETINS = [
  { id: 'b-35', week_number: 35, year: 2026, status: 'published', created_at: '2026-08-20T05:36:19Z' },
  { id: 'b-34', week_number: 34, year: 2026, status: 'published', created_at: '2026-08-13T05:36:57Z' },
  { id: 'b-33', week_number: 33, year: 2026, status: 'published', created_at: '2026-08-07T08:28:26Z' }
];

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

/* ── Заковаване на системната дата ──────────────────────────────────────── */

/* Секции 3 и 4 подават датата ЯВНО като аргумент, затова не зависят от „сега".
   Секция 5 обаче минава през collectWeeklyReportData(), който вика new Date()
   вътре в себе си — значи датата се подменя на самия window (файловете са
   заредени с w.eval() и виждат именно w.Date). Конструкторът с аргументи
   остава истинският, иначе weekDays(wk,yr) и new Date(iso) биха се счупили.

   Без това фикстурата гниеше с календара: BULLETINS има само седмици 33/34/35
   на 2026, а на 31.08.2026 последната приключила седмица вече Е 35 — кодът
   избираше b-35 напълно коректно, а проверката „не 35" падаше за нещо, което
   не е бъг. Понеделник 24.08 връща смисъла, за който е писана: тогава 35 е
   БЪДЕЩА седмица и не бива да се избира. */
const FROZEN = '2026-08-24T08:00:00';   /* понеделник, часът на cron-а */

function freezeDate(w) {
  const RealDate = w.Date;
  const fixedMs = new RealDate(FROZEN).getTime();
  function FakeDate(a, b, c, d, e, f, g) {
    switch (arguments.length) {
      case 0: return new RealDate(fixedMs);
      case 1: return new RealDate(a);
      case 2: return new RealDate(a, b);
      case 3: return new RealDate(a, b, c);
      case 4: return new RealDate(a, b, c, d);
      case 5: return new RealDate(a, b, c, d, e);
      case 6: return new RealDate(a, b, c, d, e, f);
      default: return new RealDate(a, b, c, d, e, f, g);
    }
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => fixedMs;
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  w.Date = FakeDate;
}

function env(over) {
  return boot(Object.assign({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: {
      bulletins: BULLETINS,
      recurring_tasks: [],
      bulletin_tasks: [],
      task_completions: [],
      users: [{ store_name: 'Раднево' }, { store_name: 'Централен офис' }],
      report_snapshots: [],
      differences_reports: [], stock_returns: [], kasa_storno: [],
      kasa_zoborot: [], goods_transit: [], transport_pallets: []
    }
  }, over || {}));
}

(async function () {

  section('1. Понеделникът на предходната седмица');
  {
    const { w } = env();
    const iso = d => w.toLocalISO(d);

    /* Всеки ден от седмица 34 трябва да сочи към понеделника на седмица 33. */
    const w34 = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20',
                 '2026-08-21', '2026-08-22', '2026-08-23'];
    const bad = w34.filter(d =>
      iso(w.reportPrevWeekMonday(new Date(d + 'T12:00:00'))) !== '2026-08-10');
    ok('всичките 7 дни от седмица 34 сочат към 10.08 (понеделник на 33)',
      bad.length === 0, bad.join(', '));

    /* Неделя е крайният случай — getDay()===0. */
    ok('неделя 23.08 → 10.08, не 17.08',
      iso(w.reportPrevWeekMonday(new Date('2026-08-23T12:00:00'))) === '2026-08-10',
      iso(w.reportPrevWeekMonday(new Date('2026-08-23T12:00:00'))));
    ok('понеделник 24.08 → 17.08',
      iso(w.reportPrevWeekMonday(new Date('2026-08-24T08:00:00'))) === '2026-08-17',
      iso(w.reportPrevWeekMonday(new Date('2026-08-24T08:00:00'))));
  }

  section('2. Номерът на седмицата съвпада с weekDays()');
  {
    const { w } = env();
    /* Кръгова проверка: weekOfMonday(weekDays(n)[0]) трябва да върне n.
       Ако двете броения се разминат, бюлетинът ще се разгъне на чужди дати. */
    const bad = [];
    [2025, 2026, 2027].forEach(yr => {
      for (let n = 1; n <= 52; n++) {
        const monday = w.weekDays(n, yr)[0];
        const back = w.reportWeekOfMonday(monday);
        if (!back || back.week !== n || back.year !== yr) {
          bad.push(yr + '/' + n + '→' + JSON.stringify(back));
        }
      }
    });
    ok('52 седмици × 3 години се връщат същите', bad.length === 0, bad.slice(0, 5).join(', '));

    /* Границата на годината: weekDays(1,2026)[0] е 29.12.2025, който
       формулата разпознава И като „седмица 53 на 2025". Бюлетините се
       номерират като седмица 1 на 2026 — по-късната година печели. */
    ok('29.12.2025 е седмица 1 на 2026, не 53 на 2025',
      JSON.stringify(w.reportWeekOfMonday(w.weekDays(1, 2026)[0])) === '{"week":1,"year":2026}',
      JSON.stringify(w.reportWeekOfMonday(w.weekDays(1, 2026)[0])));

    ok('17.08.2026 е седмица 34',
      JSON.stringify(w.reportWeekOfMonday(new Date(2026, 7, 17))) === '{"week":34,"year":2026}',
      JSON.stringify(w.reportWeekOfMonday(new Date(2026, 7, 17))));
    ok('10.08.2026 е седмица 33',
      w.reportWeekOfMonday(new Date(2026, 7, 10)).week === 33);
  }

  section('3. ЯДРОТО: бюлетин за БЪДЕЩА седмица никога не се избира');
  {
    const { w } = env();
    /* Понеделник 24.08 08:00 — cron-ът. Отчетът трябва да е за 17–23.08. */
    const target = w.reportWeekOfMonday(w.reportPrevWeekMonday(new Date('2026-08-24T08:00:00')));
    ok('целевата седмица е 34', target.week === 34 && target.year === 2026,
      JSON.stringify(target));

    const picked = w.reportPickWeeklyBulletin(BULLETINS, target);
    if (ok('избран е бюлетин', !!picked)) {
      ok('и това е w34, НЕ последният публикуван w35',
        picked.id === 'b-34', picked.id);
    }
    /* Разгънатите дати са точно исканите от заданието. */
    const days = w.weekDays(picked.week_number, picked.year).map(w.toLocalISO);
    ok('покрива 17–23.08',
      days[0] === '2026-08-17' && days[6] === '2026-08-23', days.join(', '));

    /* Днешната дата (петък 21.08) — приключилата седмица е 33. */
    const tFri = w.reportWeekOfMonday(w.reportPrevWeekMonday(new Date('2026-08-21T15:00:00')));
    ok('в петък 21.08 целевата седмица е 33', tFri.week === 33, JSON.stringify(tFri));
    const pFri = w.reportPickWeeklyBulletin(BULLETINS, tFri);
    ok('и се избира w33, не w34 и не w35', pFri.id === 'b-33', pFri.id);
    const dFri = w.weekDays(pFri.week_number, pFri.year).map(w.toLocalISO);
    ok('покрива 10–16.08 — напълно приключила седмица',
      dFri[0] === '2026-08-10' && dFri[6] === '2026-08-16', dFri.join(', '));
  }

  section('4. Фолбек, когато бюлетин за точната седмица липсва');
  {
    const { w } = env();
    const target = { week: 34, year: 2026 };
    /* Липсва w34 — взима се най-новият, който НЕ е след нея. */
    const noW34 = BULLETINS.filter(b => b.week_number !== 34);
    const picked = w.reportPickWeeklyBulletin(noW34, target);
    ok('избира w33 (по-стар), не w35 (бъдещ)', picked && picked.id === 'b-33',
      picked && picked.id);

    /* Само бъдещи бюлетини — по-добре нищо, отколкото бъдеща седмица. */
    const onlyFuture = BULLETINS.filter(b => b.week_number === 35);
    ok('само бъдещи → null', w.reportPickWeeklyBulletin(onlyFuture, target) === null);

    ok('празен списък не хвърля', w.reportPickWeeklyBulletin([], target) === null);
    ok('липсваща цел не хвърля', w.reportPickWeeklyBulletin(BULLETINS, null) === null);
    ok('не-масив не хвърля', w.reportPickWeeklyBulletin(null, target) === null);

    /* Преминаване през година: цел е седмица 1 на 2027, налични са само 2026. */
    const target27 = { week: 1, year: 2027 };
    ok('приема бюлетин от предходна година',
      w.reportPickWeeklyBulletin(BULLETINS, target27).id === 'b-35',
      w.reportPickWeeklyBulletin(BULLETINS, target27).id);
  }

  section('5. Заявката вече не е limit=1 и колекторът тръгва');
  {
    const h = env();
    freezeDate(h.w);   /* понеделник 24.08 → приключилата седмица е 34 */
    let data = null;
    h.w.collectWeeklyReportData(function (d) { data = d; });
    await ticks();

    ok('датата е закотвена в понеделник 24.08.2026',
      h.w.toLocalISO(new h.w.Date()) === '2026-08-24',
      h.w.toLocalISO(new h.w.Date()));

    const q = h.calls.get.find(u => u.indexOf('/bulletins') >= 0);
    if (ok('има заявка към bulletins', !!q, h.calls.get.join('\n'))) {
      ok('НЕ е limit=1 (иначе изборът е невъзможен)', q.indexOf('limit=1&') < 0 &&
        !/limit=1$/.test(q), q);
      ok('подредена е по година и седмица, не по created_at',
        q.indexOf('year.desc') >= 0 && q.indexOf('week_number.desc') >= 0, q);
    }
    if (ok('колекторът връща обобщение', !!data, JSON.stringify(data))) {
      /* Кой бюлетин е избран, се вижда по етикета. */
      ok('етикетът сочи приключила седмица, не 35',
        (data.weekLabel || '').indexOf('35') < 0, data.weekLabel);
    }
  }

  /* Заварено твърдение (до 24.08.2026): „дневният още иска
     created_at.desc&limit=1". То заковаваше, че тогавашната промяна е
     засегнала САМО седмичния — вярно за момента, в който е писано.

     Оттогава дневният описва ПРИКЛЮЧИЛИЯ ден и трябва да чете бюлетина на
     седмицата на ТОЗИ ден, не последния публикуван: в понеделник 24.08
     най-новият е за седмица 35 (24–30.08), а отчетът описва 23.08 — ден от
     седмица 34. Затова и дневният вече минава през същия избор.

     Твърдението не се маха, а се ОБРЪЩА: двата колектора трябва да ползват
     една и съща заявка. Оставено като „не е пипан", то щеше да е единствено
     напомняне за нещо, което вече не е вярно.
     Самият избор по седмица се проверява в report-daily-scope.test.js. */
  section('6. Дневният ползва СЪЩАТА заявка като седмичния');
  {
    const h = env();
    h.w.collectDailyReportData(function () {});
    await ticks();
    const qs = h.calls.get.filter(u => u.indexOf('/bulletins') >= 0);
    ok('дневният вече НЕ иска created_at.desc&limit=1',
      !qs.some(u => u.indexOf('created_at.desc') >= 0 && u.indexOf('limit=1') >= 0),
      qs.join('\n'));
    ok('дневният тегли списък, подреден по година и седмица',
      qs.some(u => u.indexOf('year.desc') >= 0 && u.indexOf('week_number.desc') >= 0),
      qs.join('\n'));
  }

  report();
})();
