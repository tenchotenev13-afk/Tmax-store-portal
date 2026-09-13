/* СЕДМИЧЕН ОТЧЕТ — секция „Сторна под N €" по обект и по касиер.

   Критерий: kasa_storno с storno_date в отчетната седмица и returned_sum <
   праг. Прагът е app_settings 'storno_small_threshold' (липсва → 5). Без
   филтър по reason и по status.

   Заявките към kasa_storno са ДВЕ:
     · по created_at, select=store_name,status — старите сторно метрики,
       непроменени;
     · по storno_date=gte.<понеделник>&storno_date=lte.<неделя> — само за
       тази секция. Така бележка, въведена седмици след сторното, пак влиза
       в седмицата на сторното.
   Седмицата се отсява в ЗАЯВКАТА (JS филтър по storno_date няма), затова
   pgStorno() долу прилага филтрите на PostgREST наистина — иначе стъбът
   връща цялата таблица и b) нищо не би доказвало.

     a) 4.99 влиза, 5.00 не влиза (точно на прага)
     b) storno_date извън седмицата (неделя преди, понеделник след) → не влиза
     b3) storno_date в седмицата, created_at 3 седмици по-късно → ВЛИЗА
         (и не се брои в старите метрики по created_at)
     c) обект извън scope → не влиза
     d) byStore по count desc; byUser по count desc
     e) праг от app_settings (3) → 4.99 не влиза
     f) липсващ ключ → 5 (и боклук → 5, запетая → десетичен знак)
     g) рендер: 5 касиера → 4 имена + „+1 други"; 0 сторна → сивата линия
   Плюс: двете заявки; подвижен прозорец (таб „Днес") → без заявка по
   storno_date и без секция; седмичният отчет рендира картата след сторно
   метриките и преди Равнението.

   Пускане:  node tests/weekly-small-storno.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

const WEEK = { from: '2026-09-07', to: '2026-09-13' };   /* седмица 37 · 2026 */
const SCOPE = ['Кърджали', 'Габрово'];

function st(store, date, sum, who, extra) {
  return Object.assign({ store_name: store, storno_date: date, returned_sum: sum,
    created_by: who, article_name: 'Артикул', status: 'confirmed', reason: 'грешка',
    created_at: date + 'T10:00:00.000Z' }, extra || {});
}
const STORNO = [
  st('Кърджали', '2026-09-08', 4.99, 'Иван П.'),                       /* a) влиза */
  st('Кърджали', '2026-09-09', 5.00, 'Иван П.'),                       /* a) точно на прага — не */
  st('Кърджали', '2026-09-10', 3.10, 'Мария К.', { status: 'draft' }), /* статусът не филтрира */
  st('Кърджали', '2026-09-11', 1.00, 'Иван П.', { reason: 'друго' }),  /* причината не филтрира */
  st('Кърджали', '2026-09-06', 2.00, 'Иван П.'),                       /* b) неделя ПРЕДИ седмицата */
  st('Кърджали', '2026-09-14', 1.50, 'Иван П.'),                       /* b) понеделник СЛЕД */
  st('Кърджали', '2026-09-12', 2.50, 'Иван П.',                        /* b3) въведена 3 седмици по-късно */
     { created_at: '2026-10-03T10:00:00.000Z' }),
  st('Габрово', '2026-09-13', 2.00, 'Петър'),                          /* граница: неделя на седмицата — влиза */
  st('Силистра', '2026-09-09', 1.00, 'ИЗВЪН-ОБХВАТ')                   /* c) */
];

/* Мини-PostgREST за kasa_storno: storno_date gte/lte и created_at gte/lt. */
function pgStorno(rows) {
  return function (url) {
    const q = decodeURIComponent(url.split('?')[1] || '');
    const get = re => (q.match(re) || [])[1];
    const sGte = get(/storno_date=gte\.([^&]+)/), sLte = get(/storno_date=lte\.([^&]+)/);
    const cGte = get(/created_at=gte\.([^&]+)/), cLt = get(/created_at=lt\.([^&]+)/);
    return rows.filter(r =>
      (!sGte || r.storno_date >= sGte) && (!sLte || r.storno_date <= sLte) &&
      (!cGte || r.created_at >= cGte) && (!cLt || r.created_at < cLt));
  };
}

const USERS = ['Кърджали', 'Габрово', 'Силистра', 'Централен офис']
  .map(function (s) { return { store_name: s }; });

function env(appSettings, storno) {
  return boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: {
      users: USERS, app_settings: appSettings || [], kasa_storno: pgStorno(storno || STORNO),
      differences_reports: [], stock_returns: [], kasa_zoborot: [], goods_transit: [],
      transport_pallets: [], client_orders: [], transport_orders: [],
      bulletins: [], recurring_tasks: [], recurring_task_periods: [], recurring_task_skips: [],
      bulletin_tasks: [], task_completions: [], report_snapshots: []
    }
  });
}
const cross = (h, win, scope) => new Promise(res => { h.w.collectCrossModuleWeeklySummary(res, win, scope); });
const stores = ss => (ss && ss.byStore || []).map(g => g.store);
const stornoGets = h => h.calls.get.filter(u => u.indexOf('/kasa_storno') >= 0);

(async function () {

  section('a) + b) + b3) + c) критерият');
  {
    const h = env();
    const c = await cross(h, WEEK, SCOPE);
    const ss = c && c.smallStorno;
    if (ok('smallStorno го има при затворен прозорец', !!ss, JSON.stringify(c && c.smallStorno))) {
      ok('прагът по подразбиране е 5', ss.threshold === 5, String(ss.threshold));
      ok('общо 5 бр. (Кърджали 4.99, 3.10, 1.00, 2.50 + Габрово 2.00)', ss.total === 5, String(ss.total));
      ok('сума 13.59', ss.sum === 13.59, String(ss.sum));
      const kr = ss.byStore.find(g => g.store === 'Кърджали') || {};
      ok('a) Кърджали: 4 бр., 11.59 — 4.99 влиза, 5.00 не', kr.count === 4 && kr.sum === 11.59, JSON.stringify(kr));
      const ivan = (kr.byUser || []).find(u => u.user === 'Иван П.') || {};
      ok('b) неделя преди и понеделник след не влизат — Иван П. има 3, не 5', ivan.count === 3, JSON.stringify(kr.byUser));
      ok('b3) бележката, въведена 3 седмици по-късно, ВЛИЗА (2.50 в сумата на Иван П.)',
        ivan.sum === 8.49, JSON.stringify(ivan));
      ok('граница: неделя НА седмицата (Габрово 13.09) влиза', stores(ss).indexOf('Габрово') >= 0, stores(ss).join('|'));
      ok('c) Силистра (извън обхвата) не влиза', stores(ss).indexOf('Силистра') < 0, stores(ss).join('|'));
      ok('статусът и причината не филтрират (draft 3.10 е вътре)',
        (kr.byUser || []).some(u => u.user === 'Мария К.' && u.count === 1));
    }
    ok('b3) старите сторно метрики (по created_at) НЕ броят закъснялата бележка — 5 в обхвата',
      c.storno.total === 5, String(c.storno.total));

    const all = await cross(h, WEEK, null);
    ok('КОНТРОЛА: без обхват Силистра Е вътре — решава scope',
      stores(all.smallStorno).indexOf('Силистра') >= 0, stores(all.smallStorno).join('|'));
    h.close();
  }

  section('Две заявки към kasa_storno — една по created_at, една по storno_date');
  {
    const h = env();
    await cross(h, WEEK, SCOPE);
    const q = stornoGets(h);
    const byCreated = q.filter(u => u.indexOf('created_at=') >= 0);
    const byStorno = q.filter(u => u.indexOf('storno_date=') >= 0);
    ok('точно две заявки', q.length === 2, q.join(' | '));
    ok('една по created_at, със стария select=store_name,status',
      byCreated.length === 1 && /select=store_name,status$/.test(byCreated[0]) && byCreated[0].indexOf('storno_date') < 0,
      byCreated.join(' | '));
    ok('една по storno_date за седмицата (gte понеделник, lte неделя)',
      byStorno.length === 1 && byStorno[0].indexOf('storno_date=gte.2026-09-07') >= 0 &&
      byStorno[0].indexOf('storno_date=lte.2026-09-13') >= 0 && byStorno[0].indexOf('created_at') < 0,
      byStorno.join(' | '));
    ok('със select=store_name,storno_date,returned_sum,created_by,article_name',
      byStorno.length === 1 && /select=store_name,storno_date,returned_sum,created_by,article_name$/.test(byStorno[0]),
      byStorno.join(' | '));
    h.close();
  }

  section('d) сортиране');
  {
    const h = env();
    const c = await cross(h, WEEK, SCOPE);
    ok('byStore по count desc: Кърджали (4) преди Габрово (1)',
      stores(c.smallStorno).join('|') === 'Кърджали|Габрово', stores(c.smallStorno).join('|'));
    const kr = c.smallStorno.byStore[0];
    ok('byUser по count desc: Иван П. (3) преди Мария К. (1)',
      kr.byUser.map(u => u.user + ':' + u.count).join('|') === 'Иван П.:3|Мария К.:1',
      kr.byUser.map(u => u.user + ':' + u.count).join('|'));
    ok('сумата по касиер пътува', kr.byUser[0].sum === 8.49 && kr.byUser[1].sum === 3.1,
      JSON.stringify(kr.byUser));
    h.close();
  }

  section('e) + f) прагът от app_settings');
  {
    const h3 = env([{ key: 'storno_small_threshold', value: '3' }]);
    const c3 = await cross(h3, WEEK, SCOPE);
    const k3 = c3.smallStorno.byStore.find(g => g.store === 'Кърджали') || { count: 0 };
    ok('e) праг 3 се уважава', c3.smallStorno.threshold === 3, String(c3.smallStorno.threshold));
    ok('e) 4.99 и 3.10 вече не влизат — Кърджали има 1.00 и 2.50', k3.count === 2 && k3.sum === 3.5, JSON.stringify(k3));
    h3.close();

    const hNo = env([]);
    ok('f) липсващ ключ → 5', (await cross(hNo, WEEK, SCOPE)).smallStorno.threshold === 5);
    hNo.close();
    const hJunk = env([{ key: 'storno_small_threshold', value: 'абв' }]);
    ok('f) нечислова стойност → 5', (await cross(hJunk, WEEK, SCOPE)).smallStorno.threshold === 5);
    hJunk.close();
    const hComma = env([{ key: 'storno_small_threshold', value: '2,5' }]);
    ok('f) запетаята е десетичен знак', (await cross(hComma, WEEK, SCOPE)).smallStorno.threshold === 2.5);
    hComma.close();
    /* Стъбът връща ЦЯЛАТА app_settings — чужд ключ не бива да се прочете като праг. */
    const hOther = env([{ key: 'returns_stale_days', value: '2' }]);
    ok('f) чужд ключ в таблицата не се чете като праг', (await cross(hOther, WEEK, SCOPE)).smallStorno.threshold === 5);
    hOther.close();
  }

  section('g) рендер');
  {
    const h = env();
    const c = await cross(h, WEEK, SCOPE);
    const html = h.w.reportSmallStornoHtml(c);
    ok('заглавие „Сторна под 5 € (5 бр., 13.59 €)"', html.indexOf('Сторна под 5 € (5 бр., 13.59 €)') >= 0);
    ok('ред „Кърджали — 4 бр., 11.59 € · Иван П. 3, Мария К. 1"',
      /Кърджали<\/a><span[^>]*> — 4 бр\., 11\.59 € · Иван П\. 3, Мария К\. 1<\/span>/.test(html));
    ok('ред „Габрово — 1 бр., 2.00 € · Петър 1"',
      /Габрово<\/a><span[^>]*> — 1 бр\., 2\.00 € · Петър 1<\/span>/.test(html));

    const five = { smallStorno: { threshold: 5, total: 5, sum: 5, byStore: [{ store: 'Кърджали', count: 5, sum: 5,
      byUser: ['А', 'Б', 'В', 'Г', 'Д'].map(n => ({ user: n, count: 1, sum: 1 })) }] } };
    const h5 = h.w.reportSmallStornoHtml(five);
    ok('5 касиера → 4 имена + „+1 други"', h5.indexOf('· А 1, Б 1, В 1, Г 1, +1 други') >= 0, h5);
    ok('петият касиер не е изписан', h5.indexOf('Д 1') < 0);

    const zero = h.w.reportSmallStornoHtml({ smallStorno: { threshold: 5, total: 0, sum: 0, byStore: [] } });
    ok('0 сторна → една сива линия', /color:#94a3b8;">Няма сторна под 5 € тази седмица<\/div>$/.test(zero), zero);
    ok('и без заглавие на карта', zero.indexOf('бр.,') < 0);
    ok('без smallStorno (подвижен прозорец) → празно', h.w.reportSmallStornoHtml({ smallStorno: null }) === '');
    h.close();
  }

  section('Подвижен прозорец (таб „Днес") не получава секцията');
  {
    const h = env();
    const c = await cross(h, null, null);
    ok('smallStorno е null', c.smallStorno === null, JSON.stringify(c.smallStorno));
    const q = stornoGets(h);
    ok('и заявка по storno_date НЕ се пуска — остава само старата', q.length === 1 &&
      q[0].indexOf('storno_date=') < 0, q.join(' | '));
    const sec = h.w.buildCrossModuleSectionHtml(c);
    ok('в секцията няма „Сторна под"', sec.indexOf('Сторна под') < 0 && sec.indexOf('Няма сторна под') < 0);
    h.close();
  }

  section('Седмичният отчет: картата е след сторно метриките, преди Равнението');
  {
    const h = env();
    const c = await cross(h, WEEK, SCOPE);
    const sec = h.w.buildCrossModuleSectionHtml(c, true);
    const iStorno = sec.indexOf('Каса — Сторно бележки');
    const iSmall = sec.indexOf('Сторна под 5 €');
    const iZob = sec.indexOf('Каса — Равнение');
    ok('и трите ги има', iStorno >= 0 && iSmall >= 0 && iZob >= 0, iStorno + ' / ' + iSmall + ' / ' + iZob);
    ok('„Сторна под" е след сторно метриките', iSmall > iStorno);
    ok('и преди Равнението', iSmall < iZob);
    h.close();

    /* Истинският седмичен колектор подава затворения прозорец на бюлетина. */
    const hw = env();
    hw.setData('bulletins', [{ id: 'b-37', week_number: 37, year: 2026, status: 'published' }]);
    const Real = hw.w.Date, fixedMs = new Real('2026-09-13T21:00:00').getTime();
    hw.w.Date = class extends Real {
      constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
      static now() { return fixedMs; }
    };
    const data = await new Promise(res => { hw.w.collectWeeklyReportData(res); });
    await ticks();
    if (ok('седмичният колектор връща данни', !!data && !!data.cross)) {
      ok('cross.smallStorno е за седмицата на бюлетина — цялата верига: 6 бр. (с Силистра)',
        !!data.cross.smallStorno && data.cross.smallStorno.total === 6, JSON.stringify(data.cross.smallStorno));
      ok('и картата е в писмото', hw.w.buildWeeklyReportHtml(data).indexOf('Сторна под 5 € (6 бр., 14.59 €)') >= 0);
    }
    hw.close();
  }

  report();
})().catch(function (e) {
  ok('тестът стига до края без необработено изключение', false, e && e.stack);
  report();
});
