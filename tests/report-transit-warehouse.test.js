/* СЕДМИЧЕН ОТЧЕТ: списък „Стока на път" по обект + „Необработени от
   логистичен склад".

   Двете са отделни питания и стоят на две различни места, но влизат заедно,
   защото и двете тръгват от един и същи дефект: числото пред тях не значеше
   каквото твърди.

   1. БРОЯЧЪТ „ЗАСТОЯЛИ" беше винаги всички. Заявката филтрираше
      `status=eq.pending&created_at=lt.<-7д>`, а created_at е датата на SAP
      импорта, не възрастта на позицията: към 08.09.2026 всичките 835
      отворени носят created_at 01.09. Тоест прагът или пропускаше всичко,
      или нищо — според това кога последно е внасян файл. Възрастта вече е
      дни от doc_date (попълнена в 100% от редовете) до деня на отчета.
      Отворена позиция = pending или sent.

   2. „НЕОБРАБОТЕНИ ОТ ЛОГИСТИЧЕН СКЛАД" се припокрива нарочно със секцията
      „Закъснения" отгоре. Там въпросът е „кой срок е изтекъл", тук — „кой
      чака склада". Заявка отпреди два дни със срок утре чака склада, без да
      е закъсняла; закъсняла заявка към външен доставчик не чака склада.
      Вадене на едната от другата би скрило точно най-важните редове.

   АНТИ-ТАВТОЛОГИЯ (проверено с ръчно саботиране на кода, виж секция 6):
   - възрастта обратно по created_at → transitStale пада на 0;
   - махнат филтърът по LOGISTICS_WAREHOUSES → warehousePending става 3.

   Пускане:  node tests/report-transit-warehouse.test.js .
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
  'Сливен', 'Троян', 'Търговище', 'Централен офис', 'Шумен'
].map(function (s) { return { store_name: s }; });

const A = 'Гоце Делчев';
const B = 'Дупница';
const C = 'Петрич';            /* извън обхвата */
const SCOPE = [A, B];

const WH_D = 'Логистичен склад Добрич';
const WH_T = 'Логистичен склад Търговище';

function dayShift(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  const p = function (x) { return String(x).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
/* created_at е timestamp, doc_date е date — двете се пълнят различно. */
function stampShift(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

/* ВСИЧКИТЕ носят created_at = вчера. Точно това е капанът в живите данни:
   един и същ SAP импорт слага една и съща дата на позиции на всякаква
   възраст, тоест по created_at или всички са „застояли", или никоя. */
const YESTERDAY = stampShift(-1);
const TRANSIT = [
  { store_name: A, supplier: 'ТЕСИ', material_name: 'АРТИКУЛ 1', remaining_qty: 3,
    unit: 'бр', doc_date: dayShift(-20), status: 'pending', direction: 'incoming',
    created_at: YESTERDAY },
  { store_name: A, supplier: 'ТЕСИ', material_name: 'АРТИКУЛ 2', remaining_qty: 1,
    unit: 'бр', doc_date: dayShift(-3), status: 'sent', direction: 'incoming',
    created_at: YESTERDAY },
  /* Приключена — не е отворена позиция, колкото и стара да е. */
  { store_name: A, supplier: 'ТЕСИ', material_name: 'АРТИКУЛ 3', remaining_qty: 0,
    unit: 'бр', doc_date: dayShift(-40), status: 'received', direction: 'incoming',
    created_at: YESTERDAY },
  { store_name: B, supplier: 'КАМ', material_name: 'АРТИКУЛ 4', remaining_qty: 5,
    unit: 'бр', doc_date: dayShift(-10), status: 'pending', direction: 'incoming',
    created_at: YESTERDAY },
  /* Извън обхвата — влиза само в пълния отчет. */
  { store_name: C, supplier: 'КАМ', material_name: 'АРТИКУЛ 5', remaining_qty: 2,
    unit: 'бр', doc_date: dayShift(-30), status: 'pending', direction: 'incoming',
    created_at: YESTERDAY }
];

const CLIENT_ORDERS = [
  /* Чака склада И е закъсняла — срокът беше вчера. */
  { id: 'co-1', in_num: '2001', store_name: A, customer_name: 'Иван Петров',
    fulfiller: WH_D, delivery: dayShift(-1), status: 'pending', co_eta: null,
    created_at: stampShift(-6) },
  /* Чака склада, но НЕ е закъсняла — срокът е утре. */
  { id: 'co-2', in_num: '2002', store_name: A, customer_name: 'Мария Георгиева',
    fulfiller: WH_T, delivery: dayShift(+1), status: 'pending', co_eta: null,
    created_at: stampShift(-2) },
  /* Изпълнява го ЦО, не склад. */
  { id: 'co-3', in_num: '2003', store_name: A, customer_name: 'Петър Динев',
    fulfiller: 'Централен офис', delivery: dayShift(-4), status: 'pending', co_eta: null,
    created_at: stampShift(-9) },
  /* Вече е изпратена — складът я е обработил. */
  { id: 'co-4', in_num: '2004', store_name: B, customer_name: 'Стоян Стоянов',
    fulfiller: WH_D, delivery: dayShift(-3), status: 'sent', co_eta: null,
    created_at: stampShift(-8) },
  /* Извън обхвата. */
  { id: 'co-5', in_num: '2005', store_name: C, customer_name: 'Тодор Иванов',
    fulfiller: WH_D, delivery: dayShift(-2), status: 'pending', co_eta: null,
    created_at: stampShift(-5) }
];

/* Стъбът СПАЗВА status=in.(...) от URL-а, както би направил PostgREST.
   Ако някой махне филтъра от заявката, приключената позиция влиза и
   числата се чупят — иначе тестът щеше да мине и без филтър в заявката. */
function transitStub(url) {
  const m = String(url).match(/status=in\.\(([^)]*)\)/);
  if (!m) return TRANSIT.slice();
  const allowed = m[1].split(',').map(function (s) { return s.trim(); });
  return TRANSIT.filter(function (r) { return allowed.indexOf(r.status) >= 0; });
}

function env() {
  return boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: {
      users: ALL_USERS,
      goods_transit: transitStub,
      client_orders: CLIENT_ORDERS, transport_orders: [],
      stock_returns: [], differences_reports: [], kasa_storno: [],
      kasa_zoborot: [], transport_pallets: [], app_settings: []
    }
  });
}

function cross(h, scope) {
  return new Promise(function (resolve) {
    h.w.collectCrossModuleWeeklySummary(resolve, null, scope);
  });
}

(async function () {

  section('1. Стока на път: възрастта е по doc_date, не по created_at');
  {
    const h = env();
    const c = await cross(h, SCOPE);

    if (ok('колекторът връща обобщение', !!c)) {
      /* Три очаквания в едно число: 2, а не 3 (приключената) и не 4
         (чуждият обект). Точно тези две са начините да сгреши. */
      ok('застоели са 2 — нито 3 (приключената), нито 4 (чужд обект)',
        c.transitStale === 2, 'реално: ' + c.transitStale);

      const bs = c.transitByStore || [];
      ok('разбивката е два обекта', bs.length === 2,
        'реално: ' + bs.length + ' → ' + bs.map(function (g) { return g.store; }).join(', '));

      const gA = bs.filter(function (g) { return g.store === A; })[0];
      const gB = bs.filter(function (g) { return g.store === B; })[0];
      ok('A: 2 отворени, 1 застояла, най-старата 20 дни',
        gA && gA.open === 2 && gA.stale === 1 && gA.oldestDays === 20,
        gA ? JSON.stringify(gA) : 'няма');
      ok('B: 1 отворена, 1 застояла, най-старата 10 дни',
        gB && gB.open === 1 && gB.stale === 1 && gB.oldestDays === 10,
        gB ? JSON.stringify(gB) : 'няма');
      /* sent също е отворена позиция — иначе A щеше да е с open=1. */
      ok('позиция със статус sent се брои за отворена',
        gA && gA.open === 2, gA ? 'open=' + gA.open : 'няма');
      /* Ако възрастта се четеше от created_at (вчера за всички), oldestDays
         щеше да е 1 навсякъде. */
      ok('възрастта НЕ е от created_at (иначе щеше да е 1 ден)',
        gA && gA.oldestDays === 20 && gB.oldestDays === 10,
        (gA ? gA.oldestDays : '?') + ' / ' + (gB ? gB.oldestDays : '?'));
    }
    h.close();
  }

  section('2. Без обхват влиза и чуждият обект');
  {
    const h = env();
    const c = await cross(h, null);
    ok('застоелите стават 3', c.transitStale === 3, 'реално: ' + c.transitStale);
    const bs = c.transitByStore || [];
    ok('три обекта в разбивката', bs.length === 3, 'реално: ' + bs.length);
    /* Подредбата: stale desc, после oldestDays desc. C (30 дни) изпреварва
       A (20) и B (10), защото и трите са с еднакъв брой застояли. */
    ok('най-старата застояла е отгоре', bs[0] && bs[0].store === C,
      bs.map(function (g) { return g.store + ':' + g.stale + '/' + g.oldestDays; }).join(', '));
    h.close();
  }

  section('3. Необработени от логистичен склад');
  {
    const h = env();
    const c = await cross(h, SCOPE);
    const wp = c.warehousePending || [];

    ok('две заявки чакат склад', wp.length === 2,
      'реално: ' + wp.length + ' → ' + wp.map(function (x) { return x.in_num; }).join(', '));
    ok('първата е закъснялата (lateDays=1)',
      wp[0] && wp[0].in_num === '2001' && wp[0].lateDays === 1,
      wp[0] ? JSON.stringify(wp[0]) : 'няма');
    ok('чакането е от created_at, не от срока',
      wp[0] && wp[0].waitDays === 6, wp[0] ? 'waitDays=' + wp[0].waitDays : 'няма');
    ok('втората чака склада, но НЕ е закъсняла',
      wp[1] && wp[1].in_num === '2002' && wp[1].lateDays === 0 && wp[1].waitDays === 2,
      wp[1] ? JSON.stringify(wp[1]) : 'няма');
    ok('складът пътува до писмото', wp[0] && wp[0].warehouse === WH_D,
      wp[0] ? wp[0].warehouse : 'няма');

    const nums = wp.map(function (x) { return x.in_num; });
    ok('заявка към ЦО НЕ влиза', nums.indexOf('2003') < 0, nums.join('|'));
    ok('вече изпратената НЕ влиза', nums.indexOf('2004') < 0, nums.join('|'));
    ok('обект извън обхвата НЕ влиза', nums.indexOf('2005') < 0, nums.join('|'));

    const bs = c.warehousePendingByStore || [];
    ok('разбивката е един обект', bs.length === 1, 'реално: ' + bs.length);
    ok('A: 2 заявки, 1 просрочена, най-дълго чака 6 дни',
      bs[0] && bs[0].store === A && bs[0].count === 2 && bs[0].late === 1 &&
      bs[0].oldestWait === 6, bs[0] ? JSON.stringify(bs[0]) : 'няма');
    h.close();
  }

  section('4. HTML: двата режима');
  {
    const h = env();
    const cScoped = await cross(h, SCOPE);
    const cFull = await cross(h, null);

    /* ── Стока на път ── */
    const trScoped = h.w.reportTransitListHtml(cScoped, true);
    ok('срязан: списъкът се рендира', !!trScoped);
    ok('срязан: показва и двата обекта от обхвата',
      trScoped.indexOf(A) >= 0 && trScoped.indexOf(B) >= 0, trScoped);
    ok('срязан: редът казва отворени, над 7 дни и най-старата',
      trScoped.indexOf('2 отворени') >= 0 &&
      trScoped.indexOf('1 над 7 дни') >= 0 &&
      trScoped.indexOf('най-старата от 20 дни') >= 0, trScoped);
    ok('обектът е връзка към портала', trScoped.indexOf('?store=') >= 0);

    const trFull = h.w.reportTransitListHtml(cFull, false);
    ok('пълен: показва само обекти СЪС застояли', trFull.indexOf(C) >= 0);
    ok('пълен: три реда (и трите имат застояли)',
      (trFull.match(/border-bottom:1px solid/g) || []).length === 3,
      'реално: ' + (trFull.match(/border-bottom:1px solid/g) || []).length);

    /* Обект с отворени, но без застояли — влиза в срязания, отпада от пълния. */
    const onlyOpen = { transitByStore: [{ store: A, open: 4, stale: 0, oldestDays: 2 }] };
    ok('срязан показва обект без застояли',
      h.w.reportTransitListHtml(onlyOpen, true).indexOf('4 отворени') >= 0);
    ok('пълен го пропуска', h.w.reportTransitListHtml(onlyOpen, false) === '');
    ok('нула реда → секцията отпада',
      h.w.reportTransitListHtml({ transitByStore: [] }, true) === '' &&
      h.w.reportTransitListHtml(null, true) === '');

    /* ── Склад ── */
    const whScoped = h.w.reportWarehousePendingHtml(cScoped, true);
    ok('срязан: заглавие с броя',
      whScoped.indexOf('📦 Необработени от логистичен склад (2)') >= 0, whScoped);
    ok('срязан: ред по ред — номер, клиент, склад, чакане',
      whScoped.indexOf('№ 2001') >= 0 && whScoped.indexOf('Иван Петров') >= 0 &&
      whScoped.indexOf(WH_D) >= 0 && whScoped.indexOf('чака 6 дни') >= 0, whScoped);
    ok('просрочието се показва само където го има',
      whScoped.indexOf('+1 просрочие') >= 0 &&
      (whScoped.match(/просрочие/g) || []).length === 1, whScoped);

    const whFull = h.w.reportWarehousePendingHtml(cFull, false);
    ok('пълен: по обект, без номера на заявки',
      whFull.indexOf('2 заявки') >= 0 && whFull.indexOf('№ 2001') < 0, whFull);
    ok('пълен: заглавието носи ОБЩИЯ брой (3 с чуждия обект)',
      whFull.indexOf('Необработени от логистичен склад (3)') >= 0, whFull);
    ok('нула → секцията отпада',
      h.w.reportWarehousePendingHtml({ warehousePending: [] }, true) === '' &&
      h.w.reportWarehousePendingHtml(null, true) === '');
    h.close();
  }

  section('5. Мястото на двете секции в кросмодулния блок');
  {
    const h = env();
    const c = await cross(h, SCOPE);
    const sec = h.w.buildCrossModuleSectionHtml(c, true);

    const transitRow = sec.indexOf('🚚 Стока на път');
    const transitList = sec.indexOf('2 отворени');
    const pallets = sec.indexOf('📦 Палети');
    const late = sec.indexOf('🔴 Закъснели клиентски заявки');
    const wh = sec.indexOf('📦 Необработени от логистичен склад');
    const storno = sec.indexOf('Каса — Сторно бележки');

    ok('всички ориентири ги има',
      transitRow >= 0 && transitList >= 0 && pallets >= 0 && wh >= 0 && storno >= 0,
      [transitRow, transitList, pallets, late, wh, storno].join(' / '));
    ok('списъкът е ВЕДНАГА след реда „Стока на път"',
      transitList > transitRow && transitList < pallets);
    ok('складът е СЛЕД „Закъснения"', late >= 0 && wh > late,
      late + ' / ' + wh);
    ok('складът е ПРЕДИ сторното', wh < storno, wh + ' / ' + storno);
    ok('етикетът на картата казва „по документ"',
      sec.indexOf('застояли (&gt;7 дни по документ)') >= 0 ||
      sec.indexOf('застояли (>7 дни по документ)') >= 0, 'няма новия етикет');
    ok('старият етикет го няма', sec.indexOf('застояли pending') < 0);
    h.close();
  }

  section('6. Огледалото: двата файла носят едно и също');
  {
    const client = fs.readFileSync(path.join(ROOT, 'report.js'), 'utf8');
    const edge = fs.readFileSync(
      path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');

    [['report.js', client], ['едж', edge]].forEach(function (pair) {
      const src = pair[1];
      const trLine = src.split('\n').filter(function (l) {
        return l.indexOf("sbGet('goods_transit'") >= 0;
      })[0] || '';
      ok(pair[0] + ': заявката за goods_transit я има', !!trLine);
      ok(pair[0] + ': тегли отворените (pending и sent)',
        trLine.indexOf('status=in.(pending,sent)') >= 0, trLine);
      /* Точно този филтър беше дефектът — не бива да се върне. */
      ok(pair[0] + ': НЯМА филтър по created_at',
        trLine.indexOf('created_at') < 0, trLine);
      ok(pair[0] + ': doc_date влиза в select-а',
        trLine.indexOf('doc_date') >= 0, trLine);
      ok(pair[0] + ': двете нови секции се викат със scoped',
        src.indexOf('reportTransitListHtml(cross, scoped)') >= 0 &&
        src.indexOf('reportWarehousePendingHtml(cross, scoped)') >= 0);
      ok(pair[0] + ': складът се сверява срещу LOGISTICS_WAREHOUSES',
        src.indexOf("LOGISTICS_WAREHOUSES.indexOf(o.fulfiller || '') < 0") >= 0);
      ok(pair[0] + ': мъртвият staleStamp е махнат',
        src.indexOf('staleStamp') < 0);
    });

    ok('едж файлът носи бележка v22',
      edge.indexOf('v22 (08.09.2026)') >= 0);
  }

  report();
})();
