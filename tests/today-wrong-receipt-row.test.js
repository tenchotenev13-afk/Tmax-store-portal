/* Ред „Сторна по грешен прием" в кросмодулното обобщение (таб ДНЕС +
   седмичния имейл) — collectCrossModuleWeeklySummary / buildCrossModuleSectionHtml.

   Заявката теглеше само select=reviewed, тоест разбивка по магазин беше
   физически невъзможна, а сторните се брояха в общото число „нови доклади
   тази седмица" заедно с доставчиковите и междускладовите.

   Двата капана при поправката:
     1. Ако сторните останат и в общото число, и в собствения си ред, всяка
        бланка се брои ДВА пъти — и никъде не личи, защото и двете числа
        изглеждат правдоподобни.
     2. buildCrossModuleSectionHtml прави И таба, И седмичния имейл. Всяка
        промяна във формата ѝ променя имейла до получателите, не само екрана.

   Затова ядрото на теста е сравнение А/Б: една и съща фикстура със и без
   сторни трябва да дава БАЙТ ПО БАЙТ същия HTML за всички останали редове.

   Пускане:  node tests/today-wrong-receipt-row.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks, dayOffset, tsOffset } = H;

/* ── Фикстури ─────────────────────────────────────────────────────────────
   Заявките носят филтри в query string-а, но harness-ът рутира по ИМЕ на
   таблица и връща масива както е — затова подаваме вече филтрирани данни.
   7-дневният прозорец се проверява отделно, върху самия URL. */

const REPORTS_OTHER = [
  { store_name: 'Раднево', direction: 'supplier',   reviewed: true  },
  { store_name: 'Троян',   direction: 'supplier',   reviewed: false },
  { store_name: 'Враца',   direction: 'interstore', reviewed: true  }
];
const REPORTS_WR = [
  { store_name: 'Раднево', direction: 'wrong_receipt', reviewed: false },
  { store_name: 'Раднево', direction: 'wrong_receipt', reviewed: false },
  { store_name: 'Троян',   direction: 'wrong_receipt', reviewed: true  }
];

const RETURNS  = [{ status:'pending' }, { status:'taken' }, { status:'completed' }];
const STORNO   = [{ status:'draft' }, { status:'confirmed' }, { status:'returned' }];
const ZOBOROT  = [{ status:'draft' }, { status:'confirmed' }];
const TRANSIT  = [{ id:'t-1' }, { id:'t-2' }];
const PALLETS  = [{ store_name:'Раднево', report_date: dayOffset(-2) }];
const USERS    = [
  { store_name:'Раднево' }, { store_name:'Троян' }, { store_name:'Враца' },
  { store_name:'Централен офис' }
];

const ADMIN = { email:'a@temax.bg', display_name:'Админ', role:'admin',
                store_name:'Централен офис' };

function env(reports) {
  return boot({
    /* bulletin.js носи toLocalISO(), която collectCrossModuleWeeklySummary
       ползва за прозореца на равнението. */
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: {
      differences_reports: reports,
      stock_returns: RETURNS,
      kasa_storno: STORNO,
      kasa_zoborot: ZOBOROT,
      goods_transit: TRANSIT,
      transport_pallets: PALLETS,
      users: USERS
    }
  });
}

/* Събира обобщението и връща обекта (или null). */
function collect(h) {
  return new Promise(function (resolve) {
    h.w.collectCrossModuleWeeklySummary(function (c) { resolve(c); });
  });
}

/* Опашката на секцията — всичко от реда „За връщане" нататък. Точно тези
   редове НЕ бива да мърдат, каквото и да става със сторните. */
function tailFrom(html, marker) {
  const i = html.indexOf(marker);
  return i < 0 ? null : html.slice(i);
}

(async function () {

  section('1. Заявката тегли store_name и direction');
  {
    const h = env(REPORTS_OTHER.concat(REPORTS_WR));
    await collect(h);
    /* calls.get пази ГОЛИ URL низове (не {url,table}) — виж harness.js:230. */
    const q = h.calls.get.find(u => u.indexOf('/differences_reports') >= 0);
    if (ok('има заявка към differences_reports', !!q, h.calls.get.join('\n'))) {
      ok('иска store_name', q.indexOf('store_name') >= 0, q);
      ok('иска direction', q.indexOf('direction') >= 0, q);
      ok('иска и reviewed (не се губи)', q.indexOf('reviewed') >= 0, q);
      ok('прозорецът остава 7 дни (created_at=gte)', q.indexOf('created_at=gte.') >= 0, q);
    }
  }

  section('2. Сторните ИЗЛИЗАТ от числата на другите две посоки');
  {
    const cross = await collect(env(REPORTS_OTHER.concat(REPORTS_WR)));
    if (ok('обобщението се събира', !!cross)) {
      ok('общо нови доклада е 3 (само supplier+interstore), не 6',
        cross.diffs.total === 3, String(cross.diffs.total));
      ok('прегледани е 2', cross.diffs.reviewed === 2, String(cross.diffs.reviewed));
      ok('непрегледани е 1', cross.diffs.unreviewed === 1, String(cross.diffs.unreviewed));
      /* Сборът на двата реда е точно броят бланки — нищо не се брои двойно
         и нищо не изчезва. */
      ok('diffs + wrongReceipt = всички бланки (без двойно броене)',
        cross.diffs.total + cross.wrongReceipt.total === 6,
        cross.diffs.total + '+' + cross.wrongReceipt.total);
    }
  }

  section('3. Разбивката по магазин');
  {
    const cross = await collect(env(REPORTS_OTHER.concat(REPORTS_WR)));
    const wr = cross && cross.wrongReceipt;
    if (ok('wrongReceipt съществува', !!wr)) {
      ok('общо 3', wr.total === 3, String(wr.total));
      ok('непрегледани 2', wr.unreviewed === 2, String(wr.unreviewed));
      ok('два обекта в разбивката', wr.byStore.length === 2,
        JSON.stringify(wr.byStore));
      ok('Раднево е с 2 и е първо (подредба по брой)',
        wr.byStore[0].store === 'Раднево' && wr.byStore[0].count === 2,
        JSON.stringify(wr.byStore[0]));
      ok('Троян е с 1', wr.byStore[1].store === 'Троян' && wr.byStore[1].count === 1,
        JSON.stringify(wr.byStore[1]));
      /* Обектите БЕЗ сторна не влизат — Враца има само междускладова. */
      ok('обект без сторна не се показва',
        !wr.byStore.some(s => s.store === 'Враца'), JSON.stringify(wr.byStore));
    }
  }

  section('4. Редът се рендира — и в таба, и в имейла (един и същ HTML)');
  {
    const h = env(REPORTS_OTHER.concat(REPORTS_WR));
    const cross = await collect(h);
    let html = null;
    if (guard('buildCrossModuleSectionHtml() не хвърля',
      () => { html = h.w.buildCrossModuleSectionHtml(cross); })) {
      ok('редът присъства', html.indexOf('Сторна по грешен прием') >= 0);
      ok('носи иконата 🧾', html.indexOf('🧾') >= 0);
      ok('показва обектите поименно',
        html.indexOf('Раднево') >= 0 && html.indexOf('Троян') >= 0);
      ok('и общото число', html.indexOf('общо нови') >= 0);
      ok('непрегледаните са маркирани като изискващи внимание',
        html.indexOf('непрегледани') >= 0);
      /* Заглавието на стария ред вече казва кои посоки брои — иначе „Разлики"
         звучи като „всички разлики", а сторните ги няма в него. */
      ok('старият ред казва кои посоки покрива',
        html.indexOf('Разлики от доставчици и междускладови') >= 0);
    }
  }

  section('5. ЯДРОТО: другите редове не мърдат — байт по байт');
  {
    const hA = env(REPORTS_OTHER);                       /* без нито една сторна */
    const hB = env(REPORTS_OTHER.concat(REPORTS_WR));    /* същото + 3 сторни */
    const crossA = await collect(hA);
    const crossB = await collect(hB);
    const htmlA = hA.w.buildCrossModuleSectionHtml(crossA);
    const htmlB = hB.w.buildCrossModuleSectionHtml(crossB);

    const tailA = tailFrom(htmlA, 'За връщане');
    const tailB = tailFrom(htmlB, 'За връщане');
    if (ok('редът „За връщане" се намира и в двата', !!tailA && !!tailB)) {
      ok('всичко от „За връщане" нататък е ИДЕНТИЧНО (За връщане, Каса ×2, Стока на път, Палети)',
        tailA === tailB,
        tailA === tailB ? '' : 'дължини ' + tailA.length + ' срещу ' + tailB.length);
    }

    /* И самият ред „Разлики" не мърда — сторните не са били в него и преди
       добавянето им, тоест числата му са същите със и без тях. */
    ok('числата на „Разлики" са същите със и без сторни',
      crossA.diffs.total === crossB.diffs.total &&
      crossA.diffs.reviewed === crossB.diffs.reviewed &&
      crossA.diffs.unreviewed === crossB.diffs.unreviewed,
      JSON.stringify(crossA.diffs) + ' срещу ' + JSON.stringify(crossB.diffs));

    /* Единствената разлика между двата HTML-а е новият ред. */
    ok('без сторни редът казва „няма нови", вместо да изчезне',
      htmlA.indexOf('Сторна по грешен прием') >= 0 &&
      htmlA.indexOf('няма нови') >= 0);
    ok('и не изброява обекти, когато няма какво',
      htmlA.indexOf('Раднево') < 0, htmlA.slice(0, 0) || undefined);
  }

  section('6. Граници');
  {
    /* Нула бланки изобщо. */
    const cross0 = await collect(env([]));
    if (ok('празни данни не хвърлят', !!cross0)) {
      ok('всичко е 0', cross0.diffs.total === 0 && cross0.wrongReceipt.total === 0);
      ok('разбивката е празен списък', cross0.wrongReceipt.byStore.length === 0);
    }

    /* Бланка без посока — пада на „не е сторна", както sdLineDirection. */
    const crossNoDir = await collect(env([{ store_name:'Раднево', reviewed:false }]));
    ok('бланка без direction се брои към старите посоки, не към сторната',
      crossNoDir.diffs.total === 1 && crossNoDir.wrongReceipt.total === 0,
      JSON.stringify(crossNoDir.diffs) + ' / ' + JSON.stringify(crossNoDir.wrongReceipt));

    /* Сторна без store_name — не бива да изчезва тихо от разбивката. */
    const crossNoStore = await collect(env([{ direction:'wrong_receipt', reviewed:false }]));
    ok('сторна без магазин пак се брои',
      crossNoStore.wrongReceipt.total === 1, String(crossNoStore.wrongReceipt.total));
    ok('и се показва под заместващо име, не изчезва',
      crossNoStore.wrongReceipt.byStore.length === 1,
      JSON.stringify(crossNoStore.wrongReceipt.byStore));

    /* Стар обект cross без полето (напр. кеширан от предишно зареждане на
       таба) не бива да чупи цялата секция. */
    const h = env(REPORTS_OTHER);
    const stale = await collect(h);
    delete stale.wrongReceipt;
    let staleHtml = null;
    if (guard('cross без wrongReceipt не хвърля',
      () => { staleHtml = h.w.buildCrossModuleSectionHtml(stale); })) {
      ok('редът просто отпада', staleHtml.indexOf('Сторна по грешен прием') < 0);
      ok('останалите редове са налице', staleHtml.indexOf('За връщане') >= 0);
    }

    /* Целият cross липсва — заварено поведение, секцията се пропуска. */
    ok('buildCrossModuleSectionHtml(null) връща празен низ',
      h.w.buildCrossModuleSectionHtml(null) === '');
  }

  report();
})();
