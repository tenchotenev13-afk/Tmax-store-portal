/* ОБХВАТ ПО ОБЕКТИ на СЕДМИЧНИЯ отчет — регионалният вижда само своите.

   Близнак на tests/report-store-scope.test.js, но за седмичния колектор.
   Не бъркай и двата с tests/report-daily-scope.test.js: там „обхват" значи
   КОИ ОТМЯТАНИЯ и кой бюлетин влизат в деня; тук значи КОИ ОБЕКТИ.

   Дневният получи обхват на 02.09.2026; седмичният остана само общото
   писмо и коментарът в едж функцията го казваше изрично („Само дневният.
   Седмичният си остава както е бил"). От 08.09.2026 (v18) и той има личен
   път: регионалните получават седмичен отчет за своите обекти, а зад
   отделен ключ — и управителите за своя.

   Какво заковава файлът:
   1. СРЯЗВА СЕ ВСИЧКО, не само таблицата: проценти, броячи, редове И
      кросмодулните числа. Третото е най-важното — там обхватът се предава
      НАДОЛУ, в collectCrossModuleWeeklySummary, и точно това подаване е
      лесно да изпадне при пренасяне между двата файла.
   2. СНИМКАТА Е САМО ЗА ПЪЛНАТА ВЕРИГА. report_snapshots има един ред за
      (weekly, седмица); запишеше ли я и срязаният отчет, процентът на
      трима обекта става „предходната седмица" за всички.
   3. СТАРИЯТ ПЪТ НЕ Е ЗАСЕГНАТ — без обхват изходът е какъвто беше. Това
      пази и браузъра: report.js вика колектора с един аргумент.
   4. Обработчикът на крона избира събирача И строителя на HTML по вида на
      отчета, а ключът за управителите е отделен за дневния и седмичния.

   АНТИ-ТАВТОЛОГИЯ: секция 3 пада, ако `scope` спре да се подава на
   collectCrossModuleWeeklySummary — числата там се връщат на 18 обекта.
   Проверено на 08.09.2026 с ръчно махане на аргумента.

   Пускане:  node tests/report-weekly-scope.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

/* 21 store_name → 18 отчетни (ЦО и двата склада падат, „Шумен" веднъж).
   Същият списък като в report-store-scope.test.js — двата теста мерят
   едни и същи обекти, само периодът е различен. */
const ALL_USERS = [
  'Враца', 'Габрово', 'Гоце Делчев', 'Добрич', 'Дупница', 'Карлово',
  'Козлодуй', 'Кърджали', 'Логистичен склад Добрич', 'Логистичен склад Търговище',
  'Монтана', 'Петрич', 'Пирдоп', 'Раднево', 'Севлиево', 'Силистра',
  'Сливен', 'Троян', 'Търговище', 'Централен офис', 'Шумен', 'Шумен'
].map(function (s) { return { store_name: s }; });

/* Реалният обхват на Н. Колева към 02.09.2026. */
const KOLEVA = ['Гоце Делчев', 'Дупница', 'Петрич'];

function env(data) {
  return boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: Object.assign({
      users: ALL_USERS, bulletins: [], recurring_tasks: [], bulletin_tasks: [],
      task_completions: [], report_snapshots: []
    }, data || {})
  });
}

/* Отчетната седмица е ПРЕДХОДНАЯТ понеделник — същият избор като в
   колектора. Смята се с истинските функции, не наум, за да не се разминат
   тестът и кодът при смяна на година. */
function weekTarget() {
  const probe = env();
  const t = probe.w.reportWeekOfMonday(probe.w.reportPrevWeekMonday(new Date()));
  const dates = probe.w.weekDays(t.week, t.year).map(probe.w.toLocalISO);
  probe.close();
  return { week: t.week, year: t.year, dates: dates };
}

const WK = weekTarget();

/* Една задача от бюлетина БЕЗ собствен срок — тя важи за седмицата като
   цяло, тоест едно явяване на обект. 30 от 43 реални задачи са такива. */
function weekEnv(doneStores, extra) {
  return env(Object.assign({
    bulletins: [{ id: 'b-1', status: 'published', week_number: WK.week, year: WK.year }],
    bulletin_tasks: [{ id: 't-1', bulletin_id: 'b-1', title: 'Ревизия на етикетите' }],
    task_completions: (doneStores || []).map(function (s) {
      return { task_id: 't-1', store_name: s, status: 'done',
               comment: '', photos: [], completion_date: WK.dates[2] };
    })
  }, extra || {}));
}

function collect(h, scope) {
  return new Promise(function (resolve) {
    h.w.collectWeeklyReportData(resolve, scope);
  });
}

function snapshotWrites(h) {
  const hit = function (c) { return (c.url || '').indexOf('report_snapshots') >= 0; };
  return h.calls.post.filter(hit).concat(h.calls.patch.filter(hit));
}

(async function () {

  /* ── 1. Числата се смятат върху обхвата ──────────────────────────────── */
  section('1. Регионален с 3 обекта: седмичните числа са върху 3, не върху 18');
  {
    /* „Гоце Делчев" е отметнал, другите два не са → 1 от 3 = 33%.
       Извън обхвата отмятат още четирима — те НЕ бива да мърдат числото. */
    const h = weekEnv(['Гоце Делчев', 'Враца', 'Габрово', 'Добрич', 'Монтана']);

    const mine = await collect(h, KOLEVA);
    if (ok('колекторът връща обобщение', !!mine)) {
      ok('обектите са 3, не 18', mine.storeCount === 3, 'реално: ' + mine.storeCount);
      ok('редовете са 3', (mine.rows || []).length === 3, 'реално: ' + (mine.rows || []).length);
      ok('знаменателят е 3, не 18', mine.totalAll === 3, 'реално: ' + mine.totalAll);
      ok('числителят брои само своите (1, не 5)', mine.totalDone === 1,
         'реално: ' + mine.totalDone);
      ok('процентът е 33%, не 28%', mine.overallPct === 33, 'реално: ' + mine.overallPct);

      const names = (mine.rows || []).map(function (r) { return r.name; }).sort();
      ok('в редовете са точно неговите обекти',
         names.join('|') === KOLEVA.slice().sort().join('|'), names.join('|'));
      ok('чужд обект не се е промъкнал', names.indexOf('Враца') < 0, names.join('|'));
    }

    /* КОНТРОЛ: същите данни без обхват — старият път, какъвто го вика
       браузърът (един аргумент). */
    const all = await new Promise(function (resolve) { h.w.collectWeeklyReportData(resolve); });
    if (ok('без обхват колекторът пак връща обобщение', !!all)) {
      ok('обектите са 18', all.storeCount === 18, 'реално: ' + all.storeCount);
      ok('знаменателят е 18', all.totalAll === 18, 'реално: ' + all.totalAll);
      ok('числителят е 5 (всички отмятания)', all.totalDone === 5, 'реално: ' + all.totalDone);
      ok('пълният НЕ е маркиран като scoped', all.scoped === false, String(all.scoped));
    }
    h.close();
  }

  /* ── 2. Празен обхват след срязването ────────────────────────────────── */
  section('2. Обхват само от склад/несъществуващ обект → нула обекта');
  {
    const h = weekEnv(['Гоце Делчев']);

    /* Точно случаят на В. Филев, чийто assigned_stores носи склад. */
    const empty = await collect(h, ['Логистичен склад Търговище']);
    if (ok('колекторът връща обобщение и при празен обхват', !!empty)) {
      ok('нула обекта', empty.storeCount === 0, 'реално: ' + empty.storeCount);
      ok('нула редове', (empty.rows || []).length === 0, 'реално: ' + (empty.rows || []).length);
      /* Пазачът в едж функцията е точно това число. */
      ok('storeCount=0 е признакът, по който обработчикът пропуска писмото',
         !empty.storeCount);
    }

    const ghost = await collect(h, ['Няма такъв обект']);
    ok('несъществуващ обект не създава ред', !!ghost && ghost.storeCount === 0,
       ghost ? 'реално: ' + ghost.storeCount : 'няма данни');
    h.close();
  }

  /* ── 3. Обхватът стига И до кросмодулната секция ─────────────────────── */
  section('3. Кросмодулните числа също са срязани (анти-тавтология)');
  {
    /* transport_pallets е празна нарочно: тогава pallets.total е точно
       броят обекти в обхвата, тоест най-прекият отпечатък от това дали
       scope е стигнал надолу. Без подаването числото се връща на 18. */
    const h = weekEnv(['Гоце Делчев'], {
      stock_returns: [
        { store_name: 'Гоце Делчев', status: 'pending' },
        { store_name: 'Дупница', status: 'pending' },
        { store_name: 'Враца', status: 'pending' },
        { store_name: 'Габрово', status: 'pending' },
        { store_name: 'Добрич', status: 'completed' }
      ],
      transport_pallets: []
    });

    const mine = await collect(h, KOLEVA);
    if (ok('срязаното обобщение има кросмодулна секция', !!mine && !!mine.cross)) {
      ok('обектите в кросмодулните броячи са 3, не 18',
         mine.cross.pallets.total === 3, 'реално: ' + mine.cross.pallets.total);
      ok('отворените връщания са 2 (само в обхвата), не 4',
         mine.cross.returns.open === 2, 'реално: ' + mine.cross.returns.open);
      ok('приключените извън обхвата не се броят',
         mine.cross.returns.completed === 0, 'реално: ' + mine.cross.returns.completed);
    }

    const all = await collect(h, null);
    if (ok('пълното обобщение има кросмодулна секция', !!all && !!all.cross)) {
      ok('без обхват обектите са 18', all.cross.pallets.total === 18,
         'реално: ' + all.cross.pallets.total);
      ok('без обхват отворените връщания са 4', all.cross.returns.open === 4,
         'реално: ' + all.cross.returns.open);
    }
    h.close();
  }

  /* ── 4. Снимката и тенденцията ───────────────────────────────────────── */
  section('4. Срязаният седмичен не пипа report_snapshots');
  {
    const h = weekEnv(['Гоце Делчев']);

    h.calls.post.length = 0; h.calls.patch.length = 0;
    const mine = await collect(h, KOLEVA);
    ok('срязаният отчет НЕ записва снимка', snapshotWrites(h).length === 0,
       'реално: ' + snapshotWrites(h).length + ' → ' +
       snapshotWrites(h).map(function (c) { return JSON.stringify(c.body); }).join(' | '));
    ok('срязаният отчет няма тенденция', !!mine && mine.trendPrevWeek === null,
       mine ? JSON.stringify(mine.trendPrevWeek) : 'няма данни');
    ok('срязаният се маркира като scoped', !!mine && mine.scoped === true);
    ok('reportTrendHtml при null не рисува нищо',
       h.w.reportTrendHtml(33, null, 'спрямо предходната седмица') === '');

    /* КОНТРОЛ: пълният отчет ПАК записва — старият път не е засегнат. */
    h.calls.post.length = 0; h.calls.patch.length = 0;
    await collect(h, null);
    ok('пълният отчет записва снимка', snapshotWrites(h).length === 1,
       'реално: ' + snapshotWrites(h).length);
    h.close();
  }

  /* ── 5. Двата файла носят ЕДНА И СЪЩА функция ────────────────────────── */
  section('5. collectWeeklyReportData приема scope и в двата файла');
  {
    /* report-edge-sync.test.js сравнява телата им ред по ред; тук се
       заковава само СИГНАТУРАТА, защото тя е това, което обработчикът на
       крона ползва, а браузърът — не. Промяна само в едж файла минава
       синхрона едва след като и report.js е пипнат. */
    const client = fs.readFileSync(path.join(ROOT, 'report.js'), 'utf8');
    const edge = fs.readFileSync(
      path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');

    ok('report.js: function collectWeeklyReportData(cb, scope)',
       client.indexOf('function collectWeeklyReportData(cb, scope){') >= 0);
    ok('едж: function collectWeeklyReportData(cb, scope)',
       edge.indexOf('function collectWeeklyReportData(cb, scope){') >= 0);

    [['report.js', client], ['едж', edge]].forEach(function (pair) {
      const src = pair[1];
      const i = src.indexOf('function collectWeeklyReportData(cb, scope){');
      const j = src.indexOf('\nfunction ', i + 10);
      const fn = src.slice(i, j < 0 ? src.length : j);

      ok(pair[0] + ': обхватът СРЯЗВА изведения списък',
         /if \(scope && scope\.length\) \{\s*\n\s*stores = stores\.filter/.test(fn));
      ok(pair[0] + ': summary.scoped се вдига от обхвата',
         fn.indexOf('summary.scoped = !!(scope && scope.length);') >= 0);
      ok(pair[0] + ': scope се подава на кросмодулното обобщение',
         /collectCrossModuleWeeklySummary\([\s\S]*?: null, scope\);/.test(fn));
      ok(pair[0] + ': scoped клонът идва ПРЕДИ клона със снимката',
         fn.indexOf('if (summary.scoped) {') >= 0 &&
         fn.indexOf('if (summary.scoped) {') < fn.indexOf("reportSaveSnapshot('weekly'"));
      ok(pair[0] + ': снимката е в клона else if (bul)',
         /\} else if \(bul\) \{[\s\S]{0,400}reportSaveSnapshot\('weekly'/.test(fn));
      ok(pair[0] + ': scoped клонът зачерква тенденцията',
         /if \(summary\.scoped\) \{\s*\n\s*summary\.trendPrevWeek = null;/.test(fn));
    });
  }

  /* ── 6. Обработчикът на крона ────────────────────────────────────────── */
  section('6. Крон обработчикът: един цикъл, два вида отчет');
  {
    const edge = fs.readFileSync(
      path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');

    /* До v17 източниците стояха зад пазач `if (type === 'daily')`. Махането
       му Е промяната. Проверката е по ОТСТЪПА, а не по отсъствието на самия
       низ: от v19 такъв клон пак съществува, но чете само прага за секцията
       „Каса". На върхово ниво в обработчика отстъпът е 4 интервала; вкарат
       ли се източниците обратно в клон, става 6. */
    ok('личните източници се четат на върхово ниво, не в клон за дневния',
       /\n    var regRes: any = await sbGet\('users', 'is_regional=eq\.true/.test(edge));
    ok('регионалните се четат за двата вида отчет',
       edge.indexOf('is_regional=eq.true') >= 0);

    ok('събирачът се избира по вида на отчета',
       edge.indexOf("if (type === 'weekly') collectWeeklyReportData(resolve, mine);") >= 0 &&
       edge.indexOf('else collectDailyReportData(resolve, mine, kasaThreshold);') >= 0);
    ok('строителят на HTML също се избира по вида',
       /html: type === 'weekly' \? buildWeeklyReportHtml\(mineData\) : buildDailyReportHtml\(mineData\)/.test(edge));
    ok('писмото до личния получател е ЛИЧНО (to: [един имейл])',
       /to: \[u\.email\]/.test(edge));
    ok('общото писмо още е с целия списък', /to: emails/.test(edge));

    /* Ключовете са два и НЕЗАВИСИМИ: пускането на седмичния за 19 управители
       не бива да пусне и дневния, и обратното. */
    ok('ключът за управителите се избира по вида на отчета',
       /var mgrKey = type === 'weekly' \? 'weekly_report_managers' : 'daily_report_managers';/.test(edge));
    ok('заявката ползва избрания ключ, не закован низ',
       edge.indexOf("'app_settings', 'key=eq.' + mgrKey") >= 0);
    ok("липсващ ключ = изключено (изисква се точно 'on')",
       edge.indexOf(".trim().toLowerCase() === 'on'") >= 0);

    /* scope_stores остава САМО за дневния — седмичният е обзорен. */
    ok('recipientScope връща [] при седмичен',
       /function recipientScope\(r: any\): string\[\] \{\s*\n\s*if \(type !== 'daily'\) return \[\];/.test(edge));

    ok('всеки ред в отговора носи източника',
       /source: 'regional' \| 'recipient' \| 'manager'/.test(edge) &&
       edge.indexOf('source:u.source') >= 0);
  }

  report();
})();
