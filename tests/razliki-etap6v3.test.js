/* Разлики, етап 6в-3 — отчетите (решения т.4; claude/open/17-11-razliki-etap5b.md;
   решение на Тенчо 14.10 — редовете не изчезват, а се прегрупират).

   1. „Необработени разлики над N дни“: нова колона „чака ЦО / регионалния“
      (coSide) — насочен към ЦО, damaged към регионалния, return + no_stock;
      обикновен ред без отговор остава „чака склада“; сборът по колони = броя
      броени редове (нищо не изчезва). Същата таблица в таб „Днес“.
   2. Неделният складов отчет: секция „Разлики — чакат склада“ — трите броя и
      най-старата дата върху смесени данни (чужд склад, приключен, насочен,
      „Ход: ЦО“, размяна, прегледана бланка, граница 7 дни); при 0 — сивият ред;
      паднало четене — червен ред.
   3. Правилата в report.js дават същото като браузъра (stock-differences.js):
      reportWhDiffKind ≡ sdWhChipKind и reportDiffCOTurn ≡ „Ход:“ на ЦО /
      регионалния от sdInterstoreTurn — прогон върху пълна матрица от
      комбинации. Копието в едж функцията — tests/report-edge-sync.test.js.

   Мутационна проверка (19.11.2026, мутант върху report.js, файлът — върнат от
   копие и сверен с cmp; чистият код: exit 0, 43/43):
     М1  no_stock остава при склада (reportDiffCOTurn само насочените)   → 6 ❌
     М2  насоченият ред изчезва от сбора (coSide не се брои)             → 7 ❌
     М3  секцията брои чужд склад (без проверката за counterpart)        → 2 ❌
     М4  точно 7 денонощия не влиза (> вместо >=)                        → 1 ❌
     М5  секцията брои прегледаните бланки                               → 1 ❌
     М6  отворената размяна не изключва реда                             → 7 ❌
   Всички — exit 1. М3 и М5 оцеляваха, докато правилото се викаше само през
   колектора (той филтрира по склад и преглед в заявката) — затова §2 вика
   reportWhDiffSummary и направо с всички бланки.

   Пускане:  node tests/razliki-etap6v3.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const DAY = 86400000;
const ago = ms => new Date(Date.now() - ms).toISOString();
const daysAgo = n => ago(n * DAY);
const WH = 'Логистичен склад Търговище';
const WH2 = 'Логистичен склад Добрич';
const ADMIN = { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const settle = async () => { for (let i = 0; i < 10; i++) await ticks(); };
const qp = (url, key) => { const m = String(url).match(new RegExp('[?&]' + key + '=([^&]*)')); return m ? decodeURIComponent(m[1]) : null; };

/* ── 1. Колоната ── */
const S_REPORTS = [
  { id: 'S1', direction: 'interstore', store_name: 'Троян', reviewed: false, created_at: daysAgo(10) },
  { id: 'S2', direction: 'interstore', store_name: 'Раднево', reviewed: false, created_at: daysAgo(10) },
  { id: 'S3', direction: 'interstore', store_name: 'Петрич', reviewed: false, created_at: daysAgo(1) }   /* под прага */
];
const srow = (rid, store, o) => Object.assign({ report_id: rid, store_name: store, status: 'new', warehouse_response: null, store_response: null, difference_category: 'undelivered' }, o || {});
const S_ROWS = [
  srow('S1', 'Троян'),                                                                  /* склада */
  srow('S1', 'Троян', { difference_category: 'pack_mismatch' }),                        /* ЦО (насочен) */
  srow('S1', 'Троян', { difference_category: 'wrong_barcode' }),                        /* ЦО (насочен) */
  srow('S1', 'Троян', { difference_category: 'damaged' }),                              /* регионалния (насочен) */
  srow('S1', 'Троян', { difference_category: 'excess', warehouse_response: 'return', store_response: 'no_stock' }), /* ЦО */
  srow('S1', 'Троян', { warehouse_response: 'will_send' }),                             /* склада */
  srow('S1', 'Троян', { warehouse_response: 'return', store_response: 'sap_done' }),    /* склада */
  srow('S1', 'Троян', { warehouse_response: 'return' }),                                /* обекта */
  srow('S1', 'Троян', { warehouse_response: 'sent' }),                                  /* на път */
  srow('S1', 'Троян', { warehouse_response: 'sent', store_response: 'no_stock' }),      /* склада (несъвместима двойка — както досега) */
  srow('S1', 'Троян', { difference_category: 'damaged', warehouse_response: 'sent', store_response: 'accepted' }), /* разчистено */
  srow('S1', 'Троян', { status: 'received' }),                                          /* приключен */
  srow('S2', 'Раднево', { difference_category: 'similar_item' }),                       /* ЦО */
  srow('S2', 'Раднево'),                                                                /* склада */
  srow('S3', 'Петрич', { difference_category: 'pack_mismatch' })                        /* под прага */
];
function envCross(rows) {
  return boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: {
      users: ['Троян', 'Раднево', 'Петрич', 'Централен офис'].map(s => ({ store_name: s })),
      app_settings: [{ key: 'diff_stale_days', value: '3' }],
      differences_reports: url => (String(url).indexOf('created_at=') >= 0 ? [] : S_REPORTS.map(r => Object.assign({}, r))),
      stock_differences: (rows || S_ROWS).map(r => Object.assign({}, r)),
      stock_returns: [], kasa_storno: [], kasa_zoborot: [], goods_transit: [],
      transport_pallets: [], client_orders: [], transport_orders: [],
      bulletins: [], recurring_tasks: [], recurring_task_periods: [],
      recurring_task_skips: [], bulletin_tasks: [], task_completions: [], report_snapshots: []
    }
  });
}
const cells = tr => (tr.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || []).map(c => c.replace(/<[^>]+>/g, '').trim());

/* ── 2. Складовата секция ── */
const W_REPS = [
  { id: 'W1', direction: 'interstore', counterpart: WH, reviewed: false },
  { id: 'W2', direction: 'interstore', counterpart: WH, reviewed: true, email_pending: true },   /* чака имейл — влиза */
  { id: 'W3', direction: 'interstore', counterpart: WH, reviewed: true },                        /* прегледана — не */
  { id: 'W4', direction: 'interstore', counterpart: WH2, reviewed: false },                      /* чужд склад */
  { id: 'W5', direction: 'supplier', counterpart: WH, reviewed: false }                          /* доставчик */
];
const wl = (id, rid, o) => Object.assign({ id, report_id: rid, status: 'new', warehouse_response: null, store_response: null,
  store_response_comment: null, difference_category: 'undelivered', created_at: daysAgo(2) }, o || {});
const W_LINES = [
  wl('a1', 'W1', { created_at: '2026-11-03T08:00:00Z' }),                                   /* без отговор — най-стар 03.11 */
  wl('a2', 'W1', { created_at: '2026-11-10T08:00:00Z' }),                                   /* без отговор */
  wl('a3', 'W1', { difference_category: 'pack_mismatch' }),                                  /* насочен — не */
  wl('a4', 'W1', { difference_category: 'excess', warehouse_response: 'return', store_response: 'no_stock' }), /* „Ход: ЦО“ — не */
  wl('a5', 'W1', { warehouse_response: 'will_send', created_at: daysAgo(8) }),               /* 7+ дни */
  wl('a6', 'W1', { warehouse_response: 'will_send', created_at: daysAgo(6) }),               /* 6 дни — не */
  wl('a7', 'W1', { status: 'received' }),                                                    /* приключен — не */
  wl('a8', 'W1'),                                                                            /* размяна — не */
  wl('a9', 'W1', { store_response: 'accepted', store_response_comment: 'Получено междувременно на 12.11.2026' }), /* късно получен — не */
  wl('b1', 'W2', { warehouse_response: 'return', store_response: 'sap_done', created_at: '2026-11-05T08:00:00Z' }), /* Прието обратно */
  wl('b2', 'W2', { warehouse_response: 'return', store_response: 'sap_done', status: 'received' }),                /* приключен — не */
  wl('c1', 'W3'),                                                                            /* прегледана — не */
  wl('d1', 'W4'),                                                                            /* чужд склад — не */
  wl('e1', 'W5')                                                                             /* доставчик — не */
];
const W_SWAPS = [{ id: 'sw1', from_line_id: 'zz', to_line_id: 'a8', status: 'linked' }, { id: 'sw2', from_line_id: 'a2', to_line_id: 'yy', status: 'closed' }];

function envWh(o) {
  o = o || {};
  const calls = { reps: [], lines: [] };
  const h = boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    fail: o.failReps ? { GET: /differences_reports/ } : undefined,
    data: {
      client_orders: [],
      differences_reports: url => {
        calls.reps.push(url);
        const cp = qp(url, 'counterpart'), dir = qp(url, 'direction');
        return (o.reps || W_REPS).filter(r => (!cp || 'eq.' + r.counterpart === cp) && (!dir || 'eq.' + r.direction === dir)).map(r => Object.assign({}, r));
      },
      stock_differences: url => {
        calls.lines.push(url);
        const m = String(url).match(/report_id=in\.\(([^)]*)\)/);
        const ids = m ? decodeURIComponent(m[1]).split(',') : [];
        return (o.lines || W_LINES).filter(l => ids.indexOf(String(l.report_id)) >= 0).map(l => Object.assign({}, l));
      },
      stock_diff_swaps: () => (o.swaps || W_SWAPS).map(s => Object.assign({}, s))
    }
  });
  h.calls6 = calls;
  return h;
}
const collectWh = (h, wh) => new Promise(res => h.w.collectWarehouseReportData(wh, res));

(async function run() {

  section('1. „Необработени разлики над N дни“ — колона „чака ЦО / регионалния“');
  {
    const h = envCross();
    const c = await new Promise(res => h.w.collectCrossModuleWeeklySummary(res, null, null));
    const ds = c && c.diffStale;
    const by = {}; ((ds && ds.byStore) || []).forEach(g => { by[g.store] = g; });
    const t = by['Троян'] || {};
    ok('Троян: чака склада 4 (без отговор, will_send, return+sap_done, sent+no_stock)', t.warehouse === 4, JSON.stringify(t));
    ok('Троян: чака ЦО / регионалния 4 (pack_mismatch, wrong_barcode, damaged, return+no_stock)', t.coSide === 4, JSON.stringify(t));
    ok('Троян: чака обекта 1, на път 1', t.storeSide === 1 && t.transit === 1, JSON.stringify(t));
    ok('Раднево: склада 1, ЦО 1 (similar_item)', (by['Раднево'] || {}).warehouse === 1 && (by['Раднево'] || {}).coSide === 1, JSON.stringify(by['Раднево']));
    ok('Петрич (под прага) — няма го', !by['Петрич']);
    /* Сборът = броят на броените редове: Троян 10 (12 минус разчистения и
       приключения), Раднево 2. Преди 6в-3 същите 12 бяха warehouse 10 + обекта 1 + на път 1. */
    const sum = g => g.warehouse + g.coSide + g.storeSide + g.transit;
    ok('сбор Троян = 10 реда', sum(t) === 10, String(sum(t)));
    ok('сбор Общо = 12 реда', ds && sum(ds.total) === 12, ds && JSON.stringify(ds.total));
    ok('Общо: ЦО / регионалния = 5', ds && ds.total.coSide === 5, ds && JSON.stringify(ds.total));

    const html = h.w.reportDiffStaleHtml(c);
    ok('заглавие „чака ЦО / регионалния“ след „чака склада“', /чака склада<\/th>\s*<th[^>]*>чака ЦО \/ регионалния<\/th>/.test(html));
    const trs = html.split('<tr').map(x => '<tr' + x);
    const tro = cells(trs.find(x => x.indexOf('Троян') >= 0) || '');
    ok('редът на Троян: 7 клетки — контролинг 0, склада 4, ЦО 4, обекта 1, на път 1', tro.length === 7 && tro[1] === '0' && tro[2] === '4' && tro[3] === '4' && tro[4] === '1' && tro[5] === '1', JSON.stringify(tro));
    const foot = cells(trs.find(x => x.indexOf('>Общо<') >= 0) || '');
    ok('редът „Общо“: ЦО = 5', foot.length === 7 && foot[3] === '5', JSON.stringify(foot));

    /* Таб „Днес“ — същата таблица през buildCrossModuleSectionHtml. */
    const today = h.w.buildCrossModuleSectionHtml(c);
    ok('„Днес“ (buildCrossModuleSectionHtml): колоната е там', today.indexOf('чака ЦО / регионалния') >= 0);
    h.close();
  }
  {
    /* Стар обект без coSide (напр. снимка отпреди) — 0, не „undefined“. */
    const h = envCross();
    const html = h.w.reportDiffStaleHtml({ diffStale: { days: 3, byStore: [{ store: 'Х', control: 1, warehouse: 2, storeSide: 0, transit: 0, oldest: 5 }], total: { control: 1, warehouse: 2, storeSide: 0, transit: 0, oldest: 5 } } });
    ok('без coSide → „0“, не „undefined“', html.indexOf('undefined') < 0);
    h.close();
  }

  section('2. Неделният складов отчет — „Разлики — чакат склада“');
  {
    const h = envWh();
    const d = await collectWh(h, WH);
    await settle();
    const df = d && d.diffs;
    ok('данните идват', !!df, JSON.stringify(d));
    ok('без отговор: 2 (a1, a2)', df && df.noanswer.n === 2, df && JSON.stringify(df.noanswer));
    ok('без отговор: най-стар 2026-11-03', df && df.noanswer.oldest === '2026-11-03', df && df.noanswer.oldest);
    ok('„Ще се изпрати“ 7+ дни: 1 (a5; a6 на 6 дни — не)', df && df.willsend7.n === 1, df && JSON.stringify(df.willsend7));
    ok('за „Прието обратно“: 1 (b1 от чакащата имейл бланка)', df && df.takeback.n === 1 && df.takeback.oldest === '2026-11-05', df && JSON.stringify(df.takeback));
    ok('заявката за бланките е по склада и посоката', h.calls6.reps.some(u => /counterpart=eq\./.test(u) && /direction=eq\.interstore/.test(u)), h.calls6.reps.join(' | '));
    ok('редовете — само за W1 и W2 (не прегледаната, не чуждия склад)', h.calls6.lines.length === 1 && /report_id=in\.\(W1,W2\)/.test(h.calls6.lines[0]), h.calls6.lines.join(' | '));
    const html = h.w.reportWarehouseHtml(d);
    ok('писмото: заглавие на секцията', html.indexOf('Разлики — чакат склада') >= 0);
    ok('писмото: „📝 Без отговор: 2 · най-стар от 03.11.2026“', /📝 Без отговор: <b>2<\/b> · най-стар от 03\.11\.2026/.test(html), html.slice(html.indexOf('Разлики — чакат'), html.indexOf('Разлики — чакат') + 900));
    ok('писмото: „Ще се изпрати“ … 1', /подадени преди 7\+ дни: <b>1<\/b>/.test(html));
    ok('писмото: „За „Прието обратно““ … 1 · 05.11.2026', /За „Прието обратно“: <b>1<\/b> · най-стар от 05\.11\.2026/.test(html));
    ok('писмото: без сивия ред при ненулеви', html.indexOf('Няма разлики, които чакат склада.') < 0);
    ok('писмото: заявките си остават („Няма необработени заявки“)', html.indexOf('Няма необработени заявки') >= 0);
    h.close();
  }
  {
    /* Правилото само, без филтъра на колектора: подаваме ВСИЧКИ бланки —
       чужд склад, прегледана, доставчик — reportWhDiffSummary трябва да ги отсее сам. */
    const h = envWh();
    const sm = h.w.reportWhDiffSummary(WH, W_REPS, W_LINES, W_SWAPS, Date.now());
    ok('reportWhDiffSummary с всички бланки: 2 / 1 / 1', sm.noanswer.n === 2 && sm.willsend7.n === 1 && sm.takeback.n === 1, JSON.stringify(sm));
    const sm2 = h.w.reportWhDiffSummary(WH2, W_REPS, W_LINES, W_SWAPS, Date.now());
    ok('reportWhDiffSummary за Добрич: 1 / 0 / 0 (само d1)', sm2.noanswer.n === 1 && sm2.willsend7.n === 0 && sm2.takeback.n === 0, JSON.stringify(sm2));
    h.close();
  }
  {
    const h = envWh();
    const d = await collectWh(h, WH2);
    await settle();
    ok('Добрич: без отговор 1 (d1), другите 0', d && d.diffs.noanswer.n === 1 && d.diffs.willsend7.n === 0 && d.diffs.takeback.n === 0, d && JSON.stringify(d.diffs));
    h.close();
  }
  {
    const h = envWh({ lines: W_LINES.filter(l => ['a3', 'a4', 'a6', 'a7', 'a8', 'a9', 'b2'].indexOf(l.id) >= 0) });
    const d = await collectWh(h, WH);
    await settle();
    ok('само неброими редове → 0 / 0 / 0', d && d.diffs.noanswer.n === 0 && d.diffs.willsend7.n === 0 && d.diffs.takeback.n === 0, d && JSON.stringify(d.diffs));
    const html = h.w.reportWarehouseHtml(d);
    ok('при 0 и в трите — един сив ред „Няма разлики, които чакат склада.“',
      (html.match(/Няма разлики, които чакат склада\./g) || []).length === 1 && /color:#94a3b8;">Няма разлики, които чакат склада\./.test(html));
    ok('при 0 — без трите реда', html.indexOf('📝 Без отговор') < 0);
    h.close();
  }
  {
    const h = envWh({ reps: [] });
    const d = await collectWh(h, WH);
    await settle();
    ok('без бланки → 0 / 0 / 0, без заявка за редове', d && d.diffs.noanswer.n === 0 && h.calls6.lines.length === 0);
    h.close();
  }
  {
    const h = envWh({ failReps: true });
    const d = await collectWh(h, WH);
    await settle();
    const html = d ? h.w.reportWarehouseHtml(d) : '';
    ok('паднало четене → писмото пак тръгва (заявките)', !!d);
    ok('… diffs.partial = true', !!(d && d.diffs && d.diffs.partial), d && JSON.stringify(d.diffs));
    ok('… секцията — червен ред „Непълни данни“, не „няма“', html.indexOf('Непълни данни — четенето на разликите прекъсна') >= 0 && html.indexOf('Няма разлики, които чакат склада.') < 0);
    ok('diffs null (паднал колектор) → „не можаха да се прочетат“', h.w.reportWarehouseDiffHtml(null).indexOf('Разликите не можаха да се прочетат') >= 0);
    h.close();
  }
  {
    const h = envWh();
    const html = h.w.reportWarehouseHtml({ warehouse: WH, reportDate: '2026-11-22', total: 0, stores: 0, late: 0, oldestWait: 0, groups: [] });
    ok('стар повикващ без ключ diffs — без секцията', html.indexOf('Разлики — чакат склада') < 0);
    h.close();
  }

  section('3. Правилата ≡ браузъра (stock-differences.js) — пълна матрица');
  {
    const h = boot({
      modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'report.js'],
      user: { id: 'u-wh', email: 'wh@temax.bg', display_name: 'Склад', role: 'logistics', store_name: WH },
      data: { stock_differences: [], differences_reports: [], stock_returns: [], stock_diff_swaps: [], users: [], product_catalog: [], suppliers: [], transport_orders: [], contacts: [] }
    });
    const REP = { id: 'R', direction: 'interstore', store_name: 'Карлово', counterpart: WH };
    const cats = [null, 'undelivered', 'excess', 'wrong_qty_other', 'wrong_barcode', 'pack_mismatch', 'similar_item', 'damaged'];
    const wrs = [null, 'sent', 'sent_sap', 'will_send', 'return'];
    const srs = [null, 'accepted', 'sap_accepted', 'sap_done', 'no_stock'];
    const t0 = Date.now();
    const ages = [6 * DAY, 7 * DAY - 60000, 7 * DAY, 8 * DAY];
    let n = 0, badKind = [], badCo = [];
    const realNow = h.w.Date.now;
    h.w.Date.now = () => t0;
    try {
      cats.forEach(c => wrs.forEach(w => srs.forEach(s => ['new', 'received'].forEach(st => [false, true].forEach(sw => ages.forEach(age => {
        const id = 'L' + (n++);
        const l = { id, report_id: 'R', difference_category: c, warehouse_response: w, store_response: s, status: st,
          store_response_comment: null, created_at: new Date(t0 - age).toISOString() };
        h.w.sdSwaps = sw ? [{ id: 'S' + id, from_line_id: 'zz', to_line_id: id, status: 'linked' }] : [];
        const a = h.w.sdWhChipKind(l, REP), b = h.w.reportWhDiffKind(l, REP, sw, t0);
        if (a !== b) badKind.push(id + ' ' + JSON.stringify([c, w, s, st, sw, age]) + ' sd=' + a + ' report=' + b);
        if (!sw && st === 'new') {
          const t = h.w.sdInterstoreTurn(l, REP);
          const co = !!t && (t.who === 'co' || t.who === 'regional');
          if (co !== h.w.reportDiffCOTurn(l)) badCo.push(JSON.stringify([c, w, s]) + ' turn=' + (t && t.who) + ' report=' + h.w.reportDiffCOTurn(l));
        }
      }))))));
      /* Късно получен без status received — и двете правила го пропускат. */
      const late = { id: 'late', report_id: 'R', difference_category: 'undelivered', warehouse_response: null, store_response: 'accepted',
        store_response_comment: 'Получено междувременно на 12.11.2026', status: 'new', created_at: new Date(t0 - DAY).toISOString() };
      h.w.sdSwaps = [];
      ok('късно получен: sd = report = null', h.w.sdWhChipKind(late, REP) === null && h.w.reportWhDiffKind(late, REP, false, t0) === null);
      ok('доставчикова бланка: report = null', h.w.reportWhDiffKind(late, Object.assign({}, REP, { direction: 'supplier' }), false, t0) === null);
    } finally { h.w.Date.now = realNow; }
    ok('матрица: ' + n + ' комбинации', n === 8 * 5 * 5 * 2 * 2 * 4);
    ok('reportWhDiffKind ≡ sdWhChipKind на всички', badKind.length === 0, badKind.slice(0, 5).join(' | '));
    ok('reportDiffCOTurn ≡ „Ход:“ на ЦО / регионалния (отворени, без размяна)', badCo.length === 0, badCo.slice(0, 5).join(' | '));
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
