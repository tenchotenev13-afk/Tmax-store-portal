/* СПИСЪК „НЕВЗЕТА СТОКА ПО ДОСТАВЧИК" в седмичния отчет.

   Редът „За връщане (текущо състояние)" носеше само две карти — бройка без
   адрес. Теодор поиска да се вижда КЪДЕ стои стоката и ОТКОГА. Списъкът
   групира pending връщанията по обект+доставчик и казва от колко дни стои
   най-старата позиция в групата.

   Какво заковава файлът:
   1. НЕВЗЕТА = status 'pending'. Взетите („taken") НЕ влизат, колкото и да
      са стари — те вече не са проблем на обекта.
   2. ВЪЗРАСТТА е в цели дни между две локални полунощи. Мери се, не се
      описва: записите в стъба са позиционирани на N дни назад от днес.
   3. ДВАТА РЕЖИМА СА РАЗЛИЧНИ и това е същината на секцията:
      · срязан отчет (регионален, управител) — ВСИЧКИ групи;
      · пълен отчет — САМО застоялите (oldestDays >= праг).
      Към 08.09.2026 pending групите в базата са 248, от които 145 над 7
      дни: пълният списък би направил писмото нечитаемо, а на регионалния
      неговите 49 групи са работен списък.
   4. ОБХВАТЪТ важи и тук — чужд обект не влиза в срязания списък.

   АНТИ-ТАВТОЛОГИЯ: махането на филтъра `status !== 'pending'` вкарва
   взетия отпреди 30 дни запис и чупи и броя на групите, и подредбата.
   Проверено на 08.09.2026 с ръчно махане на реда.

   Пускане:  node tests/report-returns-list.test.js .
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

/* Обектите от заданието: A и B са в обхвата, C — не. */
const A = 'Гоце Делчев';
const B = 'Дупница';
const C = 'Петрич';
const OUTSIDE = 'Враца';
const SCOPE = [A, B];

/* Записът се позиционира на N дни назад от ДНЕС, защото възрастта се мери
   спрямо днес („текущо състояние"), а не спрямо прозореца на седмицата. */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);   /* по обед — за да не се люлее през полунощ */
  return d.toISOString();
}

const RETURNS = [
  { store_name: A, supplier: 'Доставчик1', status: 'pending', created_at: daysAgo(12) },
  { store_name: A, supplier: 'Доставчик1', status: 'pending', created_at: daysAgo(12) },
  { store_name: A, supplier: 'Доставчик1', status: 'pending', created_at: daysAgo(3) },
  { store_name: A, supplier: 'Доставчик2', status: 'pending', created_at: daysAgo(2) },
  { store_name: B, supplier: 'Доставчик1', status: 'pending', created_at: daysAgo(20) },
  /* Взето — НЕ влиза, колкото и старо да е. Записът е на обект В ОБХВАТА
     нарочно: на обект извън обхвата проверката „взетото не влиза" щеше да
     минава заради scope, а не заради статуса, тоест щеше да лъже. */
  { store_name: A, supplier: 'Доставчик5', status: 'taken', created_at: daysAgo(25) },
  /* Още едно взето, този път извън обхвата — двете причини да не влезе,
     всяка проверена поотделно. */
  { store_name: C, supplier: 'Доставчик3', status: 'taken', created_at: daysAgo(30) },
  /* Извън обхвата — влиза само в пълния отчет. */
  { store_name: OUTSIDE, supplier: 'Доставчик4', status: 'pending', created_at: daysAgo(40) }
];

function env(settings) {
  return boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: {
      users: ALL_USERS,
      stock_returns: RETURNS,
      differences_reports: [], kasa_storno: [], kasa_zoborot: [],
      goods_transit: [], transport_pallets: [],
      app_settings: settings || []
    }
  });
}

function cross(h, scope) {
  return new Promise(function (resolve) {
    h.w.collectCrossModuleWeeklySummary(resolve, null, scope);
  });
}

function byPair(list, store, supplier) {
  return (list || []).filter(function (g) {
    return g.store === store && g.supplier === supplier;
  })[0] || null;
}

(async function () {

  /* ── 1. Групиране, възраст, подредба ─────────────────────────────────── */
  section('1. Групи обект+доставчик, най-старото отгоре');
  {
    const h = env();
    const c = await cross(h, SCOPE);

    if (ok('колекторът връща обобщение', !!c)) {
      const list = c.returnsList || [];
      ok('три групи в обхвата', list.length === 3,
         'реално: ' + list.length + ' → ' +
         list.map(function (g) { return g.store + '/' + g.supplier; }).join(', '));

      ok('първата е най-дълго стоялата (B/Доставчик1)',
         list[0] && list[0].store === B && list[0].supplier === 'Доставчик1',
         list[0] ? list[0].store + '/' + list[0].supplier : 'няма');
      ok('и тя е от 20 дни', list[0] && list[0].oldestDays === 20,
         list[0] ? 'реално: ' + list[0].oldestDays : 'няма');
      ok('една позиция в нея', list[0] && list[0].count === 1,
         list[0] ? 'реално: ' + list[0].count : 'няма');

      const a1 = byPair(list, A, 'Доставчик1');
      if (ok('A/Доставчик1 съществува като ЕДНА група', !!a1)) {
        ok('трите позиции са слети в нея', a1.count === 3, 'реално: ' + a1.count);
        ok('най-старата е от 12 дни', a1.oldestDays === 12, 'реално: ' + a1.oldestDays);
        ok('най-новата е от 3 дни', a1.newestDays === 3, 'реално: ' + a1.newestDays);
      }

      const a2 = byPair(list, A, 'Доставчик2');
      if (ok('A/Доставчик2 е отделна група', !!a2)) {
        ok('една позиция, от 2 дни', a2.count === 1 && a2.oldestDays === 2,
           a2.count + ' поз. / ' + a2.oldestDays + ' дни');
      }

      /* Редът: 20 > 12 > 2. */
      ok('подредбата е по oldestDays низходящо',
         list.map(function (g) { return g.oldestDays; }).join('>') === '20>12>2',
         list.map(function (g) { return g.oldestDays; }).join('>'));

      /* АНТИ-ТАВТОЛОГИЯ. Двете причини за изпадане се проверяват ПООТДЕЛНО:
         A/Доставчик5 е В ОБХВАТА и отпада само защото е взет; C и OUTSIDE
         отпадат по обхват. Смесени в един запис, проверката щеше да минава
         и без филтъра по статус. */
      ok('взетият запис В ОБХВАТА (taken, 25 дни) НЕ влиза',
         !byPair(list, A, 'Доставчик5'));
      ok('взетият извън обхвата също не влиза',
         !byPair(list, C, 'Доставчик3'));
      ok('чакащ обект извън обхвата НЕ влиза',
         !byPair(list, OUTSIDE, 'Доставчик4'));

      /* Картите отгоре не са пипани — те броят и взетите. */
      ok('картата „отворени" още брои всички в обхвата (вкл. взетия)',
         c.returns.open === 6, 'реално: ' + c.returns.open);
    }
    h.close();
  }

  /* ── 2. Без обхват — цялата верига ───────────────────────────────────── */
  section('2. Без обхват влизат и чуждите обекти');
  {
    const h = env();
    const c = await cross(h, null);
    const list = c.returnsList || [];

    ok('четири групи', list.length === 4, 'реално: ' + list.length);
    ok('най-старата е чуждият обект от 40 дни',
       list[0] && list[0].store === OUTSIDE && list[0].oldestDays === 40,
       list[0] ? list[0].store + '/' + list[0].oldestDays : 'няма');
    ok('взетите не влизат и без обхват',
       !byPair(list, C, 'Доставчик3') && !byPair(list, A, 'Доставчик5'));
    h.close();
  }

  /* ── 3. Прагът от app_settings ───────────────────────────────────────── */
  section('3. Прагът: липсващ ключ → 7');
  {
    const h1 = env();
    const c1 = await cross(h1, SCOPE);
    ok('липсващ ключ → 7', c1.returnsStaleDays === 7, 'реално: ' + c1.returnsStaleDays);
    h1.close();

    const h2 = env([{ key: 'returns_stale_days', value: '15' }]);
    const c2 = await cross(h2, SCOPE);
    ok('ключът се уважава', c2.returnsStaleDays === 15, 'реално: ' + c2.returnsStaleDays);
    h2.close();

    /* Чужд ключ в същата таблица НЕ бива да мине за този — jsdom стъбът
       връща цялата таблица, тоест точно тук се лови сверката по key в JS. */
    const h3 = env([{ key: 'kasa_diff_threshold', value: '99' },
                    { key: 'returns_stale_days', value: '15' }]);
    const c3 = await cross(h3, SCOPE);
    ok('чужд ключ не се бърка с този', c3.returnsStaleDays === 15,
       'реално: ' + c3.returnsStaleDays);
    h3.close();

    const h4 = env([{ key: 'returns_stale_days', value: 'абв' }]);
    const c4 = await cross(h4, SCOPE);
    ok('нечислова стойност пада на 7', c4.returnsStaleDays === 7,
       'реално: ' + c4.returnsStaleDays);
    h4.close();
  }

  /* ── 4. HTML: срязан отчет — всички групи ────────────────────────────── */
  section('4. Срязан отчет: ВСИЧКИ групи, застоялите с предупредителен стил');
  {
    const h = env();
    const c = await cross(h, SCOPE);
    const html = h.w.reportReturnsListHtml(c, true);

    ok('списъкът се рендира', !!html && html.length > 0);
    ok('три реда', (html.match(/border-bottom:1px solid/g) || []).length === 3,
       'реално: ' + (html.match(/border-bottom:1px solid/g) || []).length);
    ok('заглавието е БЕЗ прага', html.indexOf('⏳ Невзета стока по доставчик') >= 0 &&
       html.indexOf('над 7 дни') < 0);
    ok('обектът е връзка към портала', html.indexOf('?store=') >= 0);
    ok('доставчикът се вижда', html.indexOf('Доставчик2') >= 0);
    ok('редът казва брой и възраст',
       html.indexOf('3 поз. · най-старата от 12 дни') >= 0);
    ok('застоялата група е с предупредителен цвят',
       html.indexOf('#C0392B') >= 0);
    ok('пресният ред (2 дни) НЕ е в предупредителен стил — но го има',
       html.indexOf('1 поз. · най-старата от 2 дни') >= 0);
    h.close();
  }

  /* ── 5. HTML: пълен отчет — само застоялите ──────────────────────────── */
  section('5. Пълен отчет: само групите над прага');
  {
    const h = env();
    const c = await cross(h, null);

    const full = h.w.reportReturnsListHtml(c, false);
    ok('три реда при праг 7', (full.match(/border-bottom:1px solid/g) || []).length === 3,
       'реално: ' + (full.match(/border-bottom:1px solid/g) || []).length);
    ok('заглавието носи прага', full.indexOf('над 7 дни') >= 0);
    ok('групата от 2 дни отпада', full.indexOf('най-старата от 2 дни') < 0);
    ok('групата от 3 дни също отпада (тя е в А/Д1, чиято най-стара е 12)',
       full.indexOf('най-старата от 3 дни') < 0);
    ok('40, 20 и 12 остават',
       full.indexOf('от 40 дни') >= 0 && full.indexOf('от 20 дни') >= 0 &&
       full.indexOf('от 12 дни') >= 0);

    /* Праг 15 — остават само 40 и 20. */
    const h15 = env([{ key: 'returns_stale_days', value: '15' }]);
    const c15 = await cross(h15, null);
    const strict = h15.w.reportReturnsListHtml(c15, false);
    ok('при праг 15 остават два реда',
       (strict.match(/border-bottom:1px solid/g) || []).length === 2,
       'реално: ' + (strict.match(/border-bottom:1px solid/g) || []).length);
    ok('12 дни отпада при праг 15', strict.indexOf('от 12 дни') < 0);
    ok('заглавието носи новия праг', strict.indexOf('над 15 дни') >= 0);
    h15.close();

    /* Нула групи → списъкът изчезва, картите остават (те са в друг ред). */
    ok('празен списък дава празен низ',
       h.w.reportReturnsListHtml({ returnsList: [], returnsStaleDays: 7 }, false) === '');
    ok('липсващ cross дава празен низ', h.w.reportReturnsListHtml(null, false) === '');
    ok('всички под прага → празен низ при пълен отчет',
       h.w.reportReturnsListHtml(
         { returnsList: [{ store: A, supplier: 'Д', count: 1, oldestDays: 1, newestDays: 1 }],
           returnsStaleDays: 7 }, false) === '');
    ok('същият случай при срязан отчет ГИ показва',
       h.w.reportReturnsListHtml(
         { returnsList: [{ store: A, supplier: 'Д', count: 1, oldestDays: 1, newestDays: 1 }],
           returnsStaleDays: 7 }, true).indexOf('Невзета стока') >= 0);
    h.close();
  }

  /* ── 6. Мястото в кросмодулната секция ───────────────────────────────── */
  section('6. Списъкът е веднага след реда „За връщане", картите остават');
  {
    const h = env();
    const c = await cross(h, SCOPE);
    const sec = h.w.buildCrossModuleSectionHtml(c, true);

    ok('секцията се рендира', !!sec && sec.length > 0);
    ok('картите на реда „За връщане" са налице',
       sec.indexOf('отворени (чакат/взети)') >= 0 && sec.indexOf('приключени') >= 0);
    ok('списъкът е СЛЕД тях',
       sec.indexOf('⏳ Невзета стока') > sec.indexOf('отворени (чакат/взети)'));
    ok('и ПРЕДИ следващия ред (Сторно бележки)',
       sec.indexOf('⏳ Невзета стока') < sec.indexOf('Сторно бележки'));

    /* Без втори аргумент — пълен режим. Точно така го вика таб „Днес". */
    const asToday = h.w.buildCrossModuleSectionHtml(c);
    ok('извикване с един аргумент = пълен режим (само застоялите)',
       asToday.indexOf('над 7 дни') >= 0 && asToday.indexOf('от 2 дни') < 0);
    h.close();
  }

  /* ── 7. Двата файла и подаването на scoped ───────────────────────────── */
  section('7. Огледалото и подаването на data.scoped');
  {
    const client = fs.readFileSync(path.join(ROOT, 'report.js'), 'utf8');
    const edge = fs.readFileSync(
      path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');

    [['report.js', client], ['едж', edge]].forEach(function (pair) {
      const src = pair[1];
      ok(pair[0] + ': секцията приема scoped',
         src.indexOf('function buildCrossModuleSectionHtml(cross, scoped){') >= 0);
      ok(pair[0] + ': седмичният ѝ подава data.scoped',
         src.indexOf('buildCrossModuleSectionHtml(data.cross, data.scoped)') >= 0);
      ok(pair[0] + ': списъкът се вика с scoped',
         src.indexOf('reportReturnsListHtml(cross, scoped)') >= 0);
      ok(pair[0] + ': заявката носи supplier и created_at',
         src.indexOf("sbGet('stock_returns','select=store_name,status,supplier,created_at')") >= 0);
      ok(pair[0] + ': прагът се чете от app_settings',
         src.indexOf("key=eq.returns_stale_days") >= 0);
    });
  }

  report();
})();
