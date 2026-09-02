/* ОБХВАТ ПО ОБЕКТИ на дневния отчет — регионалният вижда само своите.

   Не бъркай с tests/report-daily-scope.test.js: там „обхват" значи КОИ
   ОТМЯТАНИЯ и кой бюлетин влизат в деня. Тук значи КОИ ОБЕКТИ.

   Досега списъкът обекти се извеждаше ВЪТРЕ в колектора (users минус
   isReportableStore) и затова беше един-единствен за всички получатели.
   Сега се подава отвън, защото един и същи отчетен ден се строи по няколко
   пъти — веднъж за report_recipients (цялата верига) и по веднъж за всеки
   регионален (неговите обекти).

   Какво заковава файлът:
   1. СРЯЗВА СЕ ВСИЧКО, не само таблицата: проценти, броячи, редове,
      класация и кросмодулните числа.
   2. КЛАСАЦИЯ ПРИ ПОД 4 ОБЕКТА НЕ СЕ ПОКАЗВА. При трима „ТОП 3" и
      „ИЗИСКВАТ ВНИМАНИЕ" изброяват едни и същи обекти в обратен ред —
      един и същ обект получава и похвала, и забележка в едно писмо.
   3. СНИМКАТА Е САМО ЗА ПЪЛНАТА ВЕРИГА. report_snapshots има един ред за
      (daily, дата); запишеше ли я и срязаният отчет, процентът на трима
      обекта става „вчерашният" за всички.
   4. СТАРИЯТ ПЪТ НЕ Е ЗАСЕГНАТ — без обхват изходът е какъвто беше.

   Пускане:  node tests/report-store-scope.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

/* 21 store_name → 18 отчетни (ЦО и двата склада падат, „Шумен" веднъж). */
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

/* Една постоянна задача, дължима в отчетния ден, плюс отмятания по избор. */
function dayEnv(doneStores) {
  const probe = env();
  const reportDay = probe.w.reportDailyTargetDate(new Date());
  const dayISO = probe.w.toLocalISO(reportDay);
  const dayIdx = probe.w.reportWeekdayIdx(reportDay);
  probe.close();

  return env({
    recurring_tasks: [{ id: 'r-1', active: true, due_weekdays: [dayIdx], title: 'Каса — отчет' }],
    task_completions: (doneStores || []).map(function (s) {
      return { recurring_task_id: 'r-1', store_name: s, status: 'done',
               comment: '', photos: [], completion_date: dayISO };
    })
  });
}

function collect(h, scope) {
  return new Promise(function (resolve) {
    h.w.collectDailyReportData(resolve, scope);
  });
}

function snapshotPosts(h) {
  return h.calls.post.filter(function (p) { return (p.url || '').indexOf('report_snapshots') >= 0; });
}

(async function () {

  /* ── 1. Процентите се смятат върху обхвата ───────────────────────────── */
  section('1. Регионален с 3 обекта: процентите са върху 3, не върху 18');
  {
    /* „Гоце Делчев" е отметнал, другите два не са → 1 от 3 = 33%.
       Извън обхвата отмятат още четирима — те НЕ бива да мърдат числото. */
    const h = dayEnv(['Гоце Делчев', 'Враца', 'Габрово', 'Добрич', 'Монтана']);

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

    /* КОНТРОЛ: същите данни без обхват — старият път. */
    const all = await collect(h, null);
    if (ok('без обхват колекторът пак връща обобщение', !!all)) {
      ok('обектите са 18', all.storeCount === 18, 'реално: ' + all.storeCount);
      ok('знаменателят е 18', all.totalAll === 18, 'реално: ' + all.totalAll);
      ok('числителят е 5 (всички отмятания)', all.totalDone === 5, 'реално: ' + all.totalDone);
    }
    h.close();
  }

  /* ── 2. Класация под 4 обекта ────────────────────────────────────────── */
  section('2. При под 4 обекта класация НЯМА');
  {
    const h = dayEnv(['Гоце Делчев']);
    const mine = await collect(h, KOLEVA);

    /* Процентите се РАЗЛИЧАВАТ (100 / 0 / 0) — тоест старото правило
       („равни ли са всички") би пуснало класацията. Пада само заради броя. */
    if (ok('процентите наистина се различават',
           !!mine && mine.top3[0].pct !== mine.bottom3[0].pct,
           mine ? mine.top3[0].pct + ' vs ' + mine.bottom3[0].pct : 'няма данни')) {

      ok('reportRankingIsMeaningful() = false при 3 обекта',
         h.w.reportRankingIsMeaningful(mine.top3, mine.bottom3, 3) === false);
      ok('таблицата с класацията е ПРАЗЕН низ',
         h.w.reportTopBottomTable(mine.top3, mine.bottom3, 3) === '',
         JSON.stringify(h.w.reportTopBottomTable(mine.top3, mine.bottom3, 3)).slice(0, 80));

      /* ГРАНИЦАТА, явно и от двете страни. */
      ok('при 3 обекта — няма', h.w.reportRankingIsMeaningful(mine.top3, mine.bottom3, 3) === false);
      ok('при 4 обекта — ИМА', h.w.reportRankingIsMeaningful(mine.top3, mine.bottom3, 4) === true);
      ok('при 18 обекта — има', h.w.reportRankingIsMeaningful(mine.top3, mine.bottom3, 18) === true);
      ok('таблицата при 4 обекта НЕ е празна',
         h.w.reportTopBottomTable(mine.top3, mine.bottom3, 4).indexOf('ТОП 3') >= 0);

      /* Без подаден брой поведението е старото — правилото важи само когато
         обхватът е известен. */
      ok('без storeCount правилото не се прилага',
         h.w.reportRankingIsMeaningful(mine.top3, mine.bottom3) === true);
    }

    /* Точно дефектът, който правилото гони: при трима двете кутии изброяват
       ЕДНИТЕ И СЪЩИ обекти. */
    if (mine) {
      const t = mine.top3.map(function (r) { return r.name; }).sort().join('|');
      const b = mine.bottom3.map(function (r) { return r.name; }).sort().join('|');
      ok('при 3 обекта ТОП 3 и ИЗИСКВАТ ВНИМАНИЕ са едни и същи обекти',
         t === b, t + '   vs   ' + b);
    }
    h.close();
  }

  /* ── 3. Кросмодулното обобщение ──────────────────────────────────────── */
  section('3. Кросмодулните числа се срязват до обхвата');
  {
    const h = env({
      differences_reports: [
        { store_name: 'Дупница', direction: 'supplier', reviewed: false },
        { store_name: 'Петрич', direction: 'supplier', reviewed: true },
        { store_name: 'Враца', direction: 'supplier', reviewed: false },
        { store_name: 'Габрово', direction: 'supplier', reviewed: false },
        { store_name: 'Дупница', direction: 'wrong_receipt', reviewed: false },
        { store_name: 'Враца', direction: 'wrong_receipt', reviewed: false }
      ],
      stock_returns: [
        { store_name: 'Петрич', status: 'pending' },
        { store_name: 'Сливен', status: 'pending' },
        { store_name: 'Сливен', status: 'completed' }
      ],
      kasa_storno: [
        { store_name: 'Гоце Делчев', status: 'draft' },
        { store_name: 'Шумен', status: 'draft' },
        { store_name: 'Шумен', status: 'confirmed' }
      ],
      kasa_zoborot: [
        { store_name: 'Дупница', status: 'confirmed' },
        { store_name: 'Троян', status: 'draft' }
      ],
      goods_transit: [
        { store_name: 'Петрич' }, { store_name: 'Монтана' }, { store_name: 'Монтана' }
      ],
      transport_pallets: []
    });

    const mine = await new Promise(function (resolve) {
      h.w.collectCrossModuleWeeklySummary(resolve, undefined, KOLEVA);
    });

    if (ok('кросмодулният колектор връща данни', !!mine)) {
      ok('разлики: 2 (Дупница и Петрич), не 4', mine.diffs.total === 2, 'реално: ' + mine.diffs.total);
      ok('прегледани: 1', mine.diffs.reviewed === 1, 'реално: ' + mine.diffs.reviewed);
      ok('сторна по грешен прием: 1, не 2', mine.wrongReceipt.total === 1,
         'реално: ' + mine.wrongReceipt.total);
      const wrStores = mine.wrongReceipt.byStore.map(function (x) { return x.store; });
      ok('разбивката по обект е само своя', wrStores.join('|') === 'Дупница', wrStores.join('|'));
      ok('за връщане отворени: 1 (Петрич), не 2', mine.returns.open === 1, 'реално: ' + mine.returns.open);
      ok('за връщане приключени: 0 (Сливен е чужд)', mine.returns.completed === 0,
         'реално: ' + mine.returns.completed);
      ok('сторно общо: 1 (Гоце Делчев), не 3', mine.storno.total === 1, 'реално: ' + mine.storno.total);
      ok('равнение общо: 1 (Дупница), не 2', mine.zoborot.total === 1, 'реално: ' + mine.zoborot.total);
      ok('стока на път застояли: 1 (Петрич), не 3', mine.transitStale === 1,
         'реално: ' + mine.transitStale);
      ok('палети общо: 3 обекта, не 18', mine.pallets.total === 3, 'реално: ' + mine.pallets.total);
      ok('палети без данни: 3 (никой не е подал)', mine.pallets.missing === 3,
         'реално: ' + mine.pallets.missing);
    }

    /* КОНТРОЛ: без обхват — пълните числа. */
    const all = await new Promise(function (resolve) {
      h.w.collectCrossModuleWeeklySummary(resolve, undefined, null);
    });
    if (ok('без обхват колекторът пак връща данни', !!all)) {
      ok('разлики: 4', all.diffs.total === 4, 'реално: ' + all.diffs.total);
      ok('сторна по грешен прием: 2', all.wrongReceipt.total === 2, 'реално: ' + all.wrongReceipt.total);
      ok('за връщане отворени: 2', all.returns.open === 2, 'реално: ' + all.returns.open);
      ok('сторно общо: 3', all.storno.total === 3, 'реално: ' + all.storno.total);
      ok('стока на път застояли: 3', all.transitStale === 3, 'реално: ' + all.transitStale);
      ok('палети общо: 18 обекта', all.pallets.total === 18, 'реално: ' + all.pallets.total);
    }
    h.close();
  }

  /* ── 4. Празен обхват = няма писмо ───────────────────────────────────── */
  section('4. Регионален без обекти в обхвата не получава писмо');
  {
    const h = dayEnv(['Враца']);

    /* Само склад в assigned_stores — isReportableStore го маха и обхватът
       остава празен. Точно случаят на В. Филев, чийто списък носи
       „Логистичен склад Търговище". */
    const empty = await collect(h, ['Логистичен склад Добрич']);
    if (ok('колекторът връща обобщение и при празен обхват', !!empty)) {
      ok('нула обекта', empty.storeCount === 0, 'реално: ' + empty.storeCount);
      ok('нула редове', (empty.rows || []).length === 0, 'реално: ' + (empty.rows || []).length);
      ok('знаменателят е 0', empty.totalAll === 0, 'реално: ' + empty.totalAll);
      /* Пазачът в едж функцията е точно това число. */
      ok('storeCount=0 е признакът, по който обработчикът пропуска писмото',
         !empty.storeCount);
    }

    /* Обхват само от несъществуващ обект — същото, без да гърми. */
    const ghost = await collect(h, ['Няма такъв обект']);
    ok('несъществуващ обект не създава ред', !!ghost && ghost.storeCount === 0,
       ghost ? 'реално: ' + ghost.storeCount : 'няма данни');
    h.close();
  }

  /* ── 5. Снимката и тенденцията ───────────────────────────────────────── */
  section('5. Срязаният отчет не пипа report_snapshots');
  {
    const h = dayEnv(['Гоце Делчев']);

    h.calls.post.length = 0;
    const mine = await collect(h, KOLEVA);
    ok('срязаният отчет НЕ записва снимка', snapshotPosts(h).length === 0,
       'реално: ' + snapshotPosts(h).length + ' → ' +
       snapshotPosts(h).map(function (p) { return JSON.stringify(p.body); }).join(' | '));
    ok('срязаният отчет няма тенденция', !!mine && mine.trendYesterday === null,
       mine ? JSON.stringify(mine.trendYesterday) : 'няма данни');
    ok('срязаният се маркира като scoped', !!mine && mine.scoped === true);
    ok('reportTrendHtml при null не рисува нищо',
       h.w.reportTrendHtml(33, null, 'спрямо предходния ден') === '');

    /* КОНТРОЛ: пълният отчет ПАК записва — старият път не е засегнат. */
    h.calls.post.length = 0;
    const all = await collect(h, null);
    ok('пълният отчет записва снимка', snapshotPosts(h).length === 1,
       'реално: ' + snapshotPosts(h).length);
    ok('пълният не е маркиран като scoped', !!all && all.scoped === false);
    h.close();
  }

  /* ── 6. Двата източника на получатели в едж функцията ────────────────── */
  section('6. Едж функцията: два списъка, не един');
  {
    /* Проверка по ИЗХОДНИЯ КОД, не по поведение: обработчикът на крона не
       може да се изпълни в jsdom (Deno.serve, service ключ). Затова тук се
       заковава само че двата пътя съществуват и че пазачите са налице —
       поведението на самото срязване е проверено в секции 1–5 срещу
       report.js, чието копие е дословно (tests/report-edge-sync.test.js). */
    const edge = fs.readFileSync(
      path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');

    ok('списък 1 още чете report_recipients с флага за деня',
       edge.indexOf("'daily=eq.true'") >= 0 || edge.indexOf('daily=eq.true') >= 0);
    ok('списък 2 чете регионалните от users',
       edge.indexOf('is_regional=eq.true') >= 0);
    ok('регионалните се четат САМО за дневния',
       /if \(type === 'daily'\)[\s\S]{0,400}is_regional=eq\.true/.test(edge));
    ok('празен assigned_stores → без писмо',
       edge.indexOf('no_assigned_stores') >= 0);
    ok('празен обхват след срязването → без писмо',
       edge.indexOf('no_reportable_stores') >= 0);
    ok('обхватът се подава на колектора',
       /collectDailyReportData\(resolve, mine\)/.test(edge));
    ok('писмото до регионален е ЛИЧНО (to: [един имейл])',
       /to: \[u\.email\]/.test(edge));
    ok('общото писмо още е с целия списък', /to: emails/.test(edge));
    /* Седмичният не е пипан. */
    ok('седмичният не праща на регионалните',
       !/type === 'weekly'[\s\S]{0,200}is_regional/.test(edge));
  }

  report();
})();
