/* СЕКЦИЯ „КАСА" В ДНЕВНИЯ ОТЧЕТ — върнатите от счетоводството и
   разминаванията над праг.

   Теодор поиска „грешна каса / върната каса" в дневния имейл. Потвърдената
   дефиниция са ДВЕ различни неща и точно затова тестът ги мери поотделно:

   1. ВЪРНАТИТЕ са текущо СЪСТОЯНИЕ, не събитие от отчетния ден. Записът
      стои със status='returned', докато обектът не го преподаде — затова се
      чете БЕЗ ограничение по дата. Ограничи ли се по ден, върнат преди три
      дни и още непреподаден отчет изчезва точно когато е най-важен.
   2. РАЗМИНАВАНИЯТА са събитие ОТ ОТЧЕТНИЯ ДЕН и се режат по праг. Без праг
      секцията е нечитаема: 90% от потвърдените ПОС отчети имат ненулева
      razlika (средно 4.49 лв към 08.09.2026), тоест влиза почти всеки ред.

   АНТИ-ТАВТОЛОГИЯ — секция 2 пада, ако филтърът по дата в JS изчезне: D-1
   влиза в разминаванията и броят става 2 вместо 1. Проверката НЕ може да
   разчита на филтъра в PostgREST заявката, защото jsdom стъбът връща цялата
   таблица независимо от query низа — тоест филтърът в заявката е само за
   трафик, а решаващият е този в JS. Точно това прави теста мерим.
   Проверено на 08.09.2026 с ръчно махане на реда.

   Пускане:  node tests/report-kasa-section.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

const ALL_USERS = [
  'Враца', 'Габрово', 'Гоце Делчев', 'Добрич', 'Дупница', 'Карлово',
  'Козлодуй', 'Кърджали', 'Логистичен склад Добрич', 'Логистичен склад Търговище',
  'Монтана', 'Петрич', 'Пирдоп', 'Раднево', 'Севлиево', 'Силистра',
  'Сливен', 'Троян', 'Търговище', 'Централен офис', 'Шумен', 'Шумен'
].map(function (s) { return { store_name: s }; });

const KOLEVA = ['Гоце Делчев', 'Дупница', 'Петрич'];

/* Отчетният ден D се смята с истинската функция, а не се заковава — иначе
   тестът би зависел от деня, в който се пуска. */
function probeDay() {
  const h = boot({ modules: ['bulletin.js', 'report.js'], user: ADMIN, data: { users: ALL_USERS } });
  const d = h.w.reportDailyTargetDate(new Date());
  const iso = h.w.toLocalISO(d);
  const prev = new Date(d.getTime()); prev.setDate(prev.getDate() - 1);
  const back3 = new Date(d.getTime()); back3.setDate(back3.getDate() - 3);
  const out = { D: iso, D1: h.w.toLocalISO(prev), back3: h.w.toLocalISO(back3) };
  h.close();
  return out;
}

const DAY = probeDay();

/* Петте записа от заданието. „ПОС 3" е върнат отпреди 3 дни; „ПОС 1" носи
   разминаване 25 на D; „ПОС 2" — 2 лв на D (под прага); равнението на Враца
   е върнато, но обектът е ИЗВЪН обхвата; равнението на Дупница е 50 лв, но
   за D-1, тоест не е събитие от отчетния ден. */
const KASA_REPORTS = [
  { store_name: 'Гоце Делчев', date: DAY.back3, pos_number: 3, razlika: 1.5,
    status: 'returned', return_reason: 'Липсва бон за сторно',
    returned_at: DAY.back3 + 'T09:15:00+03:00' },
  { store_name: 'Гоце Делчев', date: DAY.D, pos_number: 1, razlika: 25,
    status: 'confirmed', return_reason: null, returned_at: null },
  { store_name: 'Петрич', date: DAY.D, pos_number: 2, razlika: 2,
    status: 'confirmed', return_reason: null, returned_at: null }
];
const KASA_ZOBOROT = [
  { store_name: 'Враца', date: DAY.back3, razlika: 0,
    status: 'returned', return_reason: 'Грешна сметка',
    returned_at: DAY.back3 + 'T10:00:00+03:00' },
  { store_name: 'Дупница', date: DAY.D1, razlika: 50,
    status: 'confirmed', return_reason: null, returned_at: null }
];

function env(extra) {
  return boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: Object.assign({
      users: ALL_USERS, bulletins: [], recurring_tasks: [], bulletin_tasks: [],
      task_completions: [], report_snapshots: [],
      kasa_reports: KASA_REPORTS, kasa_zoborot: KASA_ZOBOROT,
      app_settings: []
    }, extra || {})
  });
}

function kasa(h, scope, threshold) {
  return new Promise(function (resolve) {
    h.w.collectDailyKasaSection(resolve, DAY.D, scope, threshold);
  });
}

(async function () {

  /* ── 1. Върнатите: състояние, не събитие от деня ─────────────────────── */
  section('1. Върнати от счетоводството — без ограничение по дата, в обхвата');
  {
    const h = env();
    const k = await kasa(h, KOLEVA, 10);

    if (ok('колекторът връща обект', !!k)) {
      ok('един върнат запис', k.returned.length === 1,
         'реално: ' + k.returned.length + ' → ' +
         k.returned.map(function (x) { return x.store + '/' + x.type; }).join(', '));

      const r = k.returned[0] || {};
      ok('върнатият е на обект в обхвата', r.store === 'Гоце Делчев', String(r.store));
      ok('типът носи номера на ПОС-а', r.type === 'ПОС № 3', String(r.type));
      ok('стои върнат от 3 дни', r.days === 3, 'реално: ' + r.days);
      ok('причината идва до писмото', r.return_reason === 'Липсва бон за сторно',
         String(r.return_reason));
      ok('датата на самия отчет също идва', r.date === DAY.back3, String(r.date));

      /* Върнатото равнение на Враца е ИЗВЪН обхвата — единственият начин да
         влезе е scope да не се прилага върху втората таблица. */
      const stores = k.returned.map(function (x) { return x.store; });
      ok('върнат запис на чужд обект НЕ влиза', stores.indexOf('Враца') < 0,
         stores.join('|'));
    }
    h.close();
  }

  /* ── 2. Разминаванията: само отчетният ден, само над прага ───────────── */
  section('2. Разминаване над прага — само за D (анти-тавтология)');
  {
    const h = env();
    const k = await kasa(h, KOLEVA, 10);

    if (ok('колекторът връща обект', !!k)) {
      ok('едно разминаване над прага', k.overThreshold.length === 1,
         'реално: ' + k.overThreshold.length + ' → ' +
         k.overThreshold.map(function (x) { return x.store + '=' + x.razlika; }).join(', '));

      const o = k.overThreshold[0] || {};
      ok('това е записът с 25 лв', o.razlika === 25, 'реално: ' + o.razlika);
      ok('на верния обект', o.store === 'Гоце Делчев', String(o.store));
      ok('с верния тип', o.type === 'ПОС № 1', String(o.type));

      /* Двете, които НЕ бива да влизат, и всяко по своя причина. */
      const vals = k.overThreshold.map(function (x) { return x.razlika; });
      ok('2 лв е под прага и не влиза', vals.indexOf(2) < 0, vals.join('|'));
      ok('50 лв за D-1 не влиза (не е събитие от отчетния ден)',
         vals.indexOf(50) < 0, vals.join('|'));

      ok('прагът пътува заедно с числата', k.threshold === 10, 'реално: ' + k.threshold);
    }
    h.close();
  }

  /* ── 3. Прагът мени изхода ───────────────────────────────────────────── */
  section('3. Прагът: 30 изпразва списъка, 1 го пълни');
  {
    const h = env();

    const hi = await kasa(h, KOLEVA, 30);
    ok('при праг 30 няма нито едно разминаване', hi.overThreshold.length === 0,
       'реално: ' + hi.overThreshold.length);
    ok('върнатите не зависят от прага', hi.returned.length === 1,
       'реално: ' + hi.returned.length);

    const lo = await kasa(h, KOLEVA, 1);
    ok('при праг 1 влизат и двата записа за D', lo.overThreshold.length === 2,
       'реално: ' + lo.overThreshold.length);
    ok('подредбата е по abs(razlika) низходящо',
       lo.overThreshold[0].razlika === 25 && lo.overThreshold[1].razlika === 2,
       lo.overThreshold.map(function (x) { return x.razlika; }).join(' > '));
    h.close();
  }

  /* ── 4. Прагът от app_settings ───────────────────────────────────────── */
  section('4. Прагът се чете от app_settings, липсващ ключ → 10');
  {
    /* Без ключ. */
    const h1 = env();
    const noKey = await kasa(h1, KOLEVA, null);
    ok('липсващ ключ → 10', noKey.threshold === 10, 'реално: ' + noKey.threshold);
    ok('и изходът е като при явно подадени 10', noKey.overThreshold.length === 1,
       'реално: ' + noKey.overThreshold.length);
    h1.close();

    /* С ключ. Стойността е ТЕКСТ — таблицата app_settings е key/value от text. */
    const h2 = env({ app_settings: [{ key: 'kasa_diff_threshold', value: '30' }] });
    const withKey = await kasa(h2, KOLEVA, null);
    ok('ключът се уважава', withKey.threshold === 30, 'реално: ' + withKey.threshold);
    ok('и изпразва списъка', withKey.overThreshold.length === 0,
       'реално: ' + withKey.overThreshold.length);
    h2.close();

    /* Запетая като десетичен знак — това е, което човек пише. */
    const h3 = env({ app_settings: [{ key: 'kasa_diff_threshold', value: '2,5' }] });
    const comma = await kasa(h3, KOLEVA, null);
    ok('запетаята се приема за десетичен знак', comma.threshold === 2.5,
       'реално: ' + comma.threshold);
    h3.close();

    /* Боклук в стойността НЕ бива да изпразва или залива секцията. */
    const h4 = env({ app_settings: [{ key: 'kasa_diff_threshold', value: 'абв' }] });
    const junk = await kasa(h4, KOLEVA, null);
    ok('нечислова стойност пада на 10', junk.threshold === 10, 'реално: ' + junk.threshold);
    h4.close();
  }

  /* ── 5. Без обхват — цялата верига ───────────────────────────────────── */
  section('5. Без обхват влизат и записите на другите обекти');
  {
    const h = env();
    const all = await kasa(h, null, 10);
    ok('двата върнати записа', all.returned.length === 2, 'реално: ' + all.returned.length);
    ok('и двата типа са представени',
       all.returned.map(function (x) { return x.type; }).sort().join('|') === 'ПОС № 3|Равнение',
       all.returned.map(function (x) { return x.type; }).join('|'));
    ok('разминаването пак е едно', all.overThreshold.length === 1,
       'реално: ' + all.overThreshold.length);
    h.close();
  }

  /* ── 6. HTML ─────────────────────────────────────────────────────────── */
  section('6. Секцията в писмото');
  {
    const h = env();
    const k = await kasa(h, KOLEVA, 10);
    const html = h.w.reportKasaSectionHtml(k);

    ok('секцията се рендира при данни', !!html && html.length > 0);
    ok('заглавие с брой на върнатите',
       html.indexOf('Върнати от счетоводството (1)') >= 0);
    ok('заглавие с прага и брой на разминаванията',
       html.indexOf('Разминаване над 10 лв (1)') >= 0);
    ok('обектът е връзка към портала (reportStoreLinkHtml)',
       html.indexOf('?store=') >= 0 && html.indexOf('Гоце Делчев') >= 0);
    ok('сумата е форматирана със знак', html.indexOf('+25.00 лв') >= 0);
    ok('причината за връщане се вижда', html.indexOf('Липсва бон за сторно') >= 0);
    ok('възрастта на върнатия се вижда', html.indexOf('от 3 дни') >= 0);

    /* Празно и от двете страни → секцията изчезва изцяло, а не остава
       празна кутия със заглавие. */
    ok('при 0 и 0 секцията е ПРАЗЕН низ',
       h.w.reportKasaSectionHtml({ returned: [], overThreshold: [], threshold: 10 }) === '');
    ok('липсващ обект също дава празен низ',
       h.w.reportKasaSectionHtml(null) === '');

    /* Само едната подсекция — другата не бива да се появи като празна. */
    const onlyOver = h.w.reportKasaSectionHtml({ returned: [], overThreshold: k.overThreshold, threshold: 10 });
    ok('само разминавания → няма заглавие за върнатите',
       onlyOver.indexOf('Върнати от счетоводството') < 0 &&
       onlyOver.indexOf('Разминаване над') >= 0);
    h.close();
  }

  /* ── 7. Мястото на секцията в писмото ────────────────────────────────── */
  section('7. Каса е СЛЕД „по задачи" и ПРЕДИ „Коментари по обекти"');
  {
    /* Редът се заковава по ИЗХОДНИЯ КОД на buildDailyReportHtml, защото
       двете съседни секции може да са празни при тестови данни и тогава
       редът им в готовия HTML е непроверим. */
    [['report.js', 'report.js'],
     ['едж', 'supabase/functions/send-scheduled-report/index.ts']].forEach(function (pair) {
      const src = fs.readFileSync(path.join(ROOT, pair[1]), 'utf8');
      const i = src.indexOf('function buildDailyReportHtml(data){');
      const fn = src.slice(i, src.indexOf('\nfunction ', i + 10));

      const byTask = fn.indexOf('reportByTaskHtml(data, false)');
      const kasaAt = fn.indexOf('reportKasaSectionHtml(data.kasa)');
      const comments = fn.indexOf('reportCommentsByStoreHtml(data)');

      ok(pair[0] + ': и трите извиквания ги има',
         byTask >= 0 && kasaAt >= 0 && comments >= 0,
         byTask + ' / ' + kasaAt + ' / ' + comments);
      ok(pair[0] + ': Каса е СЛЕД „по задачи"', kasaAt > byTask);
      ok(pair[0] + ': Каса е ПРЕДИ „Коментари по обекти"', kasaAt < comments);
    });
  }

  /* ── 8. Колекторът закача секцията към обобщението ───────────────────── */
  section('8. collectDailyReportData носи summary.kasa по двата си пътя');
  {
    const h = env();

    /* Срязаният път (регионален) — той излиза от колектора по-рано, през
       собствен return, и точно там е лесно да се изгуби. */
    const mine = await new Promise(function (resolve) {
      h.w.collectDailyReportData(resolve, KOLEVA, 10);
    });
    ok('срязаното обобщение носи kasa', !!mine && !!mine.kasa);
    ok('и числата в него са срязани', !!mine && mine.kasa.returned.length === 1,
       mine && mine.kasa ? 'реално: ' + mine.kasa.returned.length : 'няма');

    /* Пълният път — минава през snapshot и тенденция. */
    const all = await new Promise(function (resolve) {
      h.w.collectDailyReportData(resolve, null, 10);
    });
    ok('пълното обобщение също носи kasa', !!all && !!all.kasa);
    ok('без обхват върнатите са 2', !!all && all.kasa.returned.length === 2,
       all && all.kasa ? 'реално: ' + all.kasa.returned.length : 'няма');

    /* Ръчното изпращане от таб „Днес" вика колектора БЕЗ праг — тогава той
       се чете сам. Това е причината секцията да живее в колектора, а не в
       обработчика на крона. */
    const manual = await new Promise(function (resolve) {
      h.w.collectDailyReportData(resolve, null);
    });
    ok('без подаден праг колекторът го чете сам', !!manual && manual.kasa.threshold === 10,
       manual && manual.kasa ? 'реално: ' + manual.kasa.threshold : 'няма');
    ok('и секцията пак се рендира',
       h.w.reportKasaSectionHtml(manual.kasa).indexOf('Върнати от счетоводството') >= 0);
    h.close();
  }

  report();
})();
