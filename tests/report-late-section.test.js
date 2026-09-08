/* СЕКЦИЯ „ЗАКЪСНЕНИЯ" в седмичния отчет — клиентски заявки и транспорт.

   Двата списъка са едно и също питане („кой срок е изтекъл") към два
   различни таба, затова стоят под едно заглавие.

   Какво заковава файлът:
   1. reportIsLate ДАВА СЪЩИЯ ОТГОВОР като isLate() от shared.js. Това е
      най-важната проверка тук: правилото живее на две места, защото едж
      функцията няма достъп до shared.js, и точно такива копия се разминават
      мълчаливо. Сверката е ПО РЕЗУЛТАТ върху осем гранични случая, не по
      текст — текстът и без това не може да съвпадне (едното взима опорната
      дата като аргумент, другото чете глобалното TODAY).
   2. ОБХВАТЪТ важи и тук — чужд обект не влиза в срязания списък.
   3. ДВАТА РЕЖИМА: срязан = ред по ред; пълен = по обект. Към 08.09.2026
      закъснелите клиентски заявки са 92 в 10 обекта, а закъснелият
      транспорт — 5 записа. Затова заявките се обобщават, а транспортът не.

   АНТИ-ТАВТОЛОГИЯ: махането на проверката за awaiting_stock прави
   закъснелия транспорт 2 вместо 1. Проверено на 08.09.2026 с ръчно махане
   на реда.

   Пускане:  node tests/report-late-section.test.js .
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

const A = 'Гоце Делчев';
const B = 'Дупница';
const C = 'Петрич';          /* извън обхвата */
const SCOPE = [A, B];

/* Датите се смятат спрямо ДНЕС, защото „закъсняла" е текущо състояние. */
function dayShift(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  const p = function (x) { return String(x).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

const CLIENT_ORDERS = [
  { id: 'co-1', in_num: '1001', store_name: A, customer_name: 'Иван Петров',
    fulfiller: 'Склад Добрич', delivery: dayShift(-5), status: 'pending', co_eta: null },
  { id: 'co-2', in_num: '1002', store_name: A, customer_name: 'Мария Георгиева',
    fulfiller: 'Доставчик', delivery: dayShift(-12), status: 'sent', co_eta: null },
  /* Приключена със стара дата — срокът ѝ вече не тече. */
  { id: 'co-3', in_num: '1003', store_name: B, customer_name: 'Петър Динев',
    fulfiller: 'Склад', delivery: dayShift(-9), status: 'done', co_eta: null },
  /* Извън обхвата — влиза само в пълния отчет. */
  { id: 'co-4', in_num: '1004', store_name: C, customer_name: 'Стоян Стоянов',
    fulfiller: 'Склад', delivery: dayShift(-7), status: 'pending', co_eta: null }
];

const TRANSPORT_ORDERS = [
  { id: 'tr-1', store_name: A, from_store: null, customer_name: 'Тодор Иванов',
    delivery: dayShift(-3), status: 'pending', awaiting_stock: false },
  /* Чака стока по клиентска заявка — срокът се води по НЕЯ, не по транспорта. */
  { id: 'tr-2', store_name: A, from_store: null, customer_name: 'Дечо Доровски',
    delivery: dayShift(-30), status: 'pending', awaiting_stock: true }
];

function env() {
  return boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: {
      users: ALL_USERS,
      client_orders: CLIENT_ORDERS, transport_orders: TRANSPORT_ORDERS,
      stock_returns: [], differences_reports: [], kasa_storno: [],
      kasa_zoborot: [], goods_transit: [], transport_pallets: [],
      app_settings: []
    }
  });
}

function cross(h, scope) {
  return new Promise(function (resolve) {
    h.w.collectCrossModuleWeeklySummary(resolve, null, scope);
  });
}

(async function () {

  /* ── 1. Копието срещу оригинала ──────────────────────────────────────── */
  section('1. reportIsLate === isLate (shared.js) по резултат');
  {
    const h = env();
    const TODAY = h.w.TODAY;

    /* Осемте гранични случая. Всеки носи КАКВО проверява, за да не се чуди
       следващият защо точно тези. */
    const CASES = [
      { why: 'приключена със стара дата',
        o: { status: 'done', delivery: dayShift(-10) } },
      { why: 'отказана със стара дата',
        o: { status: 'refused', delivery: dayShift(-10) } },
      { why: 'отложена със стара дата',
        o: { status: 'postponed', delivery: dayShift(-10) } },
      { why: 'обработена от ЦО, доставчикът още е в срок (co_eta напред)',
        o: { status: 'processed', delivery: dayShift(-10), co_eta: dayShift(+3) } },
      { why: 'обработена от ЦО, но и co_eta е минала',
        o: { status: 'processed', delivery: dayShift(-10), co_eta: dayShift(-2) } },
      { why: 'транспорт, чакащ стока (awaiting_stock)',
        o: { status: 'pending', delivery: dayShift(-10), awaiting_stock: true } },
      { why: 'доставка УТРЕ — още не закъснява',
        o: { status: 'pending', delivery: dayShift(+1) } },
      { why: 'доставка ВЧЕРА — закъснява',
        o: { status: 'pending', delivery: dayShift(-1) } }
    ];

    CASES.forEach(function (c) {
      const orig = h.w.isLate(c.o);
      const copy = h.w.reportIsLate(c.o, TODAY);
      ok('копието съвпада с оригинала: ' + c.why, orig === copy,
         'isLate=' + orig + ' vs reportIsLate=' + copy);
    });

    /* Двете крайни стойности наистина се различават — иначе горните осем
       щяха да минават и ако двете функции връщаха винаги false. */
    ok('наборът покрива и двата отговора',
       h.w.isLate(CASES[7].o) === true && h.w.isLate(CASES[0].o) === false);

    /* Липсваща дата — извън осемте, но е първият ред и на двете. */
    ok('без delivery: и двете казват не',
       h.w.isLate({ status: 'pending' }) === false &&
       h.w.reportIsLate({ status: 'pending' }, TODAY) === false);

    /* Дните: същата аритметика като lateBadge(). */
    ok('reportLateDays брои цели дни',
       h.w.reportLateDays({ delivery: dayShift(-5) }, TODAY) === 5,
       'реално: ' + h.w.reportLateDays({ delivery: dayShift(-5) }, TODAY));
    h.close();
  }

  /* ── 2. Събиране в обхвата ───────────────────────────────────────────── */
  section('2. Закъснелите в обхвата, подредени по дни');
  {
    const h = env();
    const c = await cross(h, SCOPE);

    if (ok('колекторът връща обобщение', !!c)) {
      const lo = c.lateOrders || [];
      ok('две закъснели клиентски заявки', lo.length === 2,
         'реално: ' + lo.length + ' → ' +
         lo.map(function (x) { return x.in_num + '/' + x.days; }).join(', '));
      ok('най-старата отгоре (12 преди 5)',
         lo.length === 2 && lo[0].days === 12 && lo[1].days === 5,
         lo.map(function (x) { return x.days; }).join(' > '));
      ok('номерът, клиентът и изпълняващият пътуват до писмото',
         lo[0] && lo[0].in_num === '1002' && lo[0].customer === 'Мария Георгиева' &&
         lo[0].fulfiller === 'Доставчик',
         lo[0] ? JSON.stringify(lo[0]) : 'няма');

      const nums = lo.map(function (x) { return x.in_num; });
      ok('приключената (done) НЕ влиза, колкото и стара да е',
         nums.indexOf('1003') < 0, nums.join('|'));
      ok('обект извън обхвата НЕ влиза', nums.indexOf('1004') < 0, nums.join('|'));

      const lt = c.lateTransport || [];
      ok('един закъснял транспорт', lt.length === 1,
         'реално: ' + lt.length + ' → ' + lt.map(function (x) { return x.days; }).join(','));
      ok('и той е от 3 дни', lt[0] && lt[0].days === 3,
         lt[0] ? 'реално: ' + lt[0].days : 'няма');
      /* АНТИ-ТАВТОЛОГИЯ: единствената причина tr-2 (30 дни!) да не е пръв. */
      ok('чакащият стока (awaiting_stock, 30 дни) НЕ влиза',
         lt.length === 1 && lt[0].days === 3, 'реално: ' + lt.length + ' записа');

      const bs = c.lateOrdersByStore || [];
      ok('разбивката по обект е един ред', bs.length === 1, 'реално: ' + bs.length);
      ok('за обект A, две заявки, най-старата 12 дни',
         bs[0] && bs[0].store === A && bs[0].count === 2 && bs[0].maxDays === 12,
         bs[0] ? JSON.stringify(bs[0]) : 'няма');
    }
    h.close();
  }

  /* ── 3. Без обхват ───────────────────────────────────────────────────── */
  section('3. Без обхват влиза и чуждият обект');
  {
    const h = env();
    const c = await cross(h, null);

    ok('три закъснели заявки', (c.lateOrders || []).length === 3,
       'реално: ' + (c.lateOrders || []).length);
    ok('два реда в разбивката по обект', (c.lateOrdersByStore || []).length === 2,
       'реално: ' + (c.lateOrdersByStore || []).length);
    ok('първи е обектът с ПОВЕЧЕ заявки, не с най-старата',
       c.lateOrdersByStore[0] && c.lateOrdersByStore[0].store === A &&
       c.lateOrdersByStore[0].count === 2,
       c.lateOrdersByStore.map(function (g) { return g.store + ':' + g.count; }).join(', '));
    ok('приключената пак не влиза',
       (c.lateOrders || []).map(function (x) { return x.in_num; }).indexOf('1003') < 0);
    h.close();
  }

  /* ── 4. HTML: срязан режим ───────────────────────────────────────────── */
  section('4. Срязан отчет: заявките ред по ред');
  {
    const h = env();
    const c = await cross(h, SCOPE);
    const html = h.w.reportLateSectionHtml(c, true);

    ok('секцията се рендира', !!html && html.length > 0);
    ok('заглавие с броя на заявките',
       html.indexOf('🔴 Закъснели клиентски заявки (2)') >= 0);
    ok('заглавие с броя на транспорта',
       html.indexOf('🔴 Закъснял транспорт (1)') >= 0);
    ok('три реда общо (2 заявки + 1 транспорт)',
       (html.match(/border-bottom:1px solid/g) || []).length === 3,
       'реално: ' + (html.match(/border-bottom:1px solid/g) || []).length);
    ok('редът носи номера на заявката', html.indexOf('№ 1002') >= 0);
    ok('и клиента', html.indexOf('Мария Георгиева') >= 0);
    ok('и кой изпълнява', html.indexOf('изпълнява Доставчик') >= 0);
    ok('и с колко дни', html.indexOf('+12 дни') >= 0);
    ok('обектът е връзка към портала', html.indexOf('?store=') >= 0);

    /* from_store е празен в цялата таблица — редът пада на клиента, а не
       рисува „ → обект" с нищо отляво. */
    ok('транспортът без from_store показва клиента, не празна стрелка',
       html.indexOf('Тодор Иванов') >= 0 && html.indexOf(' → ') < 0);
    h.close();
  }

  /* ── 5. HTML: пълен режим ────────────────────────────────────────────── */
  section('5. Пълен отчет: заявките по обект');
  {
    const h = env();
    const c = await cross(h, null);
    const html = h.w.reportLateSectionHtml(c, false);

    ok('заглавието пак носи ОБЩИЯ брой заявки',
       html.indexOf('🔴 Закъснели клиентски заявки (3)') >= 0);
    ok('два реда за заявките + 1 за транспорта',
       (html.match(/border-bottom:1px solid/g) || []).length === 3,
       'реално: ' + (html.match(/border-bottom:1px solid/g) || []).length);
    ok('редът за A казва 2 заявки', html.indexOf('2 заявки') >= 0);
    ok('редът за C казва 1 заявка (единствено число)',
       html.indexOf('1 заявка') >= 0);
    ok('и най-старата', html.indexOf('най-старата +12 дни') >= 0);
    ok('номерата на заявките ГИ НЯМА в пълния режим',
       html.indexOf('№ 1002') < 0);
    ok('имената на клиентите също ги няма',
       html.indexOf('Мария Георгиева') < 0);
    ok('транспортът пак е ред по ред', html.indexOf('Тодор Иванов') >= 0);
    h.close();
  }

  /* ── 6. Празните случаи ──────────────────────────────────────────────── */
  section('6. Нула закъснения → секцията отпада');
  {
    const h = env();
    ok('празно и в двата списъка → празен низ',
       h.w.reportLateSectionHtml(
         { lateOrders: [], lateOrdersByStore: [], lateTransport: [] }, true) === '');
    ok('липсващ cross → празен низ', h.w.reportLateSectionHtml(null, true) === '');

    /* Само едната подсекция — другата не бива да се появи като празна. */
    const onlyTr = h.w.reportLateSectionHtml(
      { lateOrders: [], lateOrdersByStore: [],
        lateTransport: [{ store: A, from: '', customer: 'Клиент', days: 4 }] }, true);
    ok('само транспорт → няма заглавие за заявките',
       onlyTr.indexOf('Закъснели клиентски заявки') < 0 &&
       onlyTr.indexOf('Закъснял транспорт (1)') >= 0);

    const onlyCo = h.w.reportLateSectionHtml(
      { lateOrders: [{ store: A, in_num: '9', customer: 'К', fulfiller: 'Ф', days: 2 }],
        lateOrdersByStore: [{ store: A, count: 1, maxDays: 2 }],
        lateTransport: [] }, true);
    ok('само заявки → няма заглавие за транспорта',
       onlyCo.indexOf('Закъснял транспорт') < 0 &&
       onlyCo.indexOf('Закъснели клиентски заявки (1)') >= 0);
    ok('единствено число и при дните', onlyCo.indexOf('+2 дни') >= 0);
    h.close();
  }

  /* ── 7. Мястото в кросмодулната секция ───────────────────────────────── */
  section('7. Закъсненията са ПРЕДИ „Каса — Сторно бележки"');
  {
    const h = env();
    const c = await cross(h, SCOPE);
    const sec = h.w.buildCrossModuleSectionHtml(c, true);

    ok('секцията се рендира', !!sec && sec.length > 0);
    const late = sec.indexOf('🔴 Закъснели клиентски заявки');
    const storno = sec.indexOf('Каса — Сторно бележки');
    const returns = sec.indexOf('За връщане (текущо състояние)');
    ok('и трите ги има', late >= 0 && storno >= 0 && returns >= 0,
       late + ' / ' + storno + ' / ' + returns);
    ok('закъсненията са ПРЕДИ сторното', late < storno);
    ok('и СЛЕД реда „За връщане"', late > returns);
    h.close();
  }

  /* ── 8. Огледалото ───────────────────────────────────────────────────── */
  section('8. Двата файла носят едно и също');
  {
    const client = fs.readFileSync(path.join(ROOT, 'report.js'), 'utf8');
    const edge = fs.readFileSync(
      path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');

    [['report.js', client], ['едж', edge]].forEach(function (pair) {
      const src = pair[1];
      ok(pair[0] + ': reportIsLate приема опорна дата',
         src.indexOf('function reportIsLate(o, refD){') >= 0);
      ok(pair[0] + ': reportLateDays също',
         src.indexOf('function reportLateDays(o, refD){') >= 0);
      ok(pair[0] + ': секцията се вика с scoped',
         src.indexOf('reportLateSectionHtml(cross, scoped)') >= 0);
      ok(pair[0] + ': клиентските заявки се четат без прозорец по дата',
         src.indexOf("sbGet('client_orders','status=not.in.(done,refused,postponed)") >= 0);
      /* Самият ред на заявката, не регекс през целия файл: низът съдържа
         `not.in.(done,refused,postponed)`, тоест има затваряща скоба вътре
         и всяко `[^)]*` спира преди select-а. Първата версия на тези две
         проверки се хвана точно на това — едната падна, другата минаваше
         тавтологично, защото отрицанието ѝ никога не стигаше до текста. */
      const trLine = src.split('\n').filter(function (l) {
        return l.indexOf("sbGet('transport_orders'") >= 0;
      })[0] || '';
      ok(pair[0] + ': заявката за транспорта я има', !!trLine);
      ok(pair[0] + ': транспортът носи awaiting_stock в select-а',
         trLine.indexOf('awaiting_stock') >= 0, trLine);
      /* Колоната, чието име лесно се обърква: transport_orders има notes,
         не note — и никъде не я четем, защото не се рендира. */
      ok(pair[0] + ': транспортът НЕ иска несъществуващата колона note',
         !/,note[,'&]/.test(trLine), trLine);
    });
  }

  report();
})();
