/* СЕДМИЧЕН ОТЧЕТ — секция „⏳ Необработени разлики над N дни".

   МОМЕНТНА СНИМКА към изпращането, не срез от седмицата: въпросът е какво
   стои неразчистено В ТОЗИ МИГ и У КОГО е топката. Затова и трите ѝ заявки
   нямат прозорец по дата — бланка отпреди месец тежи ПОВЕЧЕ от вчерашната.

   Двата критерия са различни по природа и точно това е лесно да се обърка:
     · доставчик и сторна по грешен прием — брои се ДОКЛАДЪТ. Бланка с
       двайсет позиции е едно нещо за разчистване, не двайсет;
     · междускладови — брои се РЕДЪТ. Една бланка носи пет артикула в пет
       различни състояния и „докладът" не казва нищо.

   Пет състояния влизат в три колони, групирани по СТРАНА:
     чака склада = няма отговор | „ще изпратя" | „върни" + обектът е готов
                   със SAP-а (стоката пътува назад към склада)
     чака обекта = складът е отговорил, обектът мълчи | „няма наличност"
   Всичко друго (обектът е приел) е разчистено и не се брои никъде.

   Часовата зона е UTC НАРОЧНО. Възрастта се мери в цели дни между две
   полунощи; при зона с лятно/зимно време разликата е 23 или 25 часа два
   пъти в годината и floor() дава ден по-малко. Тестът щеше да пада само
   през седмицата след смяната — най-лошият вид нестабилен тест.

   Пускане:  node tests/weekly-diff-stale.test.js .
*/
process.env.TZ = 'UTC';

const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };
const WEEK = { from: '2026-09-07', to: '2026-09-13' };
const SCOPE = ['Кърджали', 'Троян', 'Петрич', 'Враца', 'Ямбол', 'Бургас'];

/* Полунощ преди N дни + 10 часа. Възрастта, която кодът пресмята, е точно N:
   и двата края се свеждат до полунощ, а в UTC денят е точно 24 часа. */
function daysAgo(n) {
  const d = new Date();
  d.setUTCHours(10, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function rep(id, direction, store, age, reviewed) {
  return { id: id, direction: direction, store_name: store,
           reviewed: !!reviewed, created_at: daysAgo(age) };
}
function row(reportId, store, o) {
  return Object.assign({ report_id: reportId, store_name: store, status: 'new',
                         warehouse_response: null, store_response: null }, o || {});
}

const REPORTS = [
  /* Кърджали: един непрегледан доклад от доставчик на 10 дни — С ТРИ РЕДА.
     Ако някой почне да брои редовете, числото става 3 вместо 1. */
  rep('R1', 'supplier', 'Кърджали', 10, false),
  /* Прегледаният не чака никого. */
  rep('R2', 'supplier', 'Кърджали', 10, true),
  /* ТОЧНО на прага. „над 3 дни" НЕ включва третия ден — това е разликата
     между <= и <, която иначе никой тест не докосва. */
  rep('R3', 'supplier', 'Ямбол', 3, false),
  /* Един ден над прага — че границата е от правилната страна. */
  rep('R9', 'supplier', 'Бургас', 4, false),
  /* Втори непрегледан доклад на Кърджали, ПО-МЛАД от първия: „най-стар"
     трябва да остане 10. Без него min и max дават едно и също число и
     колоната не проверява нищо. */
  rep('R11', 'supplier', 'Кърджали', 6, false),
  /* Троян: сторна по грешен прием, 20 дни → червено. */
  rep('R4', 'wrong_receipt', 'Троян', 20, false),
  /* Троян: междускладова с всичките състояния. */
  rep('R5', 'interstore', 'Троян', 20, false),
  /* Петрич: има какво да чака, но докладът е от вчера → обектът НЕ се показва. */
  rep('R6', 'interstore', 'Петрич', 1, false),
  /* Силистра е ИЗВЪН обхвата — контролата за scope. */
  rep('R7', 'interstore', 'Силистра', 30, false),
  /* Враца: доклад без нито един ред. Пак се брои — критерият е докладът. */
  rep('R8', 'supplier', 'Враца', 5, false)
];

const ROWS = [
  row('R1', 'Кърджали'), row('R1', 'Кърджали'), row('R1', 'Кърджали'),
  row('R2', 'Кърджали'), row('R3', 'Ямбол'), row('R11', 'Кърджали'),
  /* R5 — петте състояния плюс двете, които НЕ се броят. */
  row('R5', 'Троян'),                                                   /* няма отговор → склада */
  row('R5', 'Троян', { warehouse_response: 'will_send' }),              /* ще изпратя → склада */
  row('R5', 'Троян', { warehouse_response: 'return', store_response: 'sap_done' }), /* връща се → склада */
  row('R5', 'Троян', { warehouse_response: 'sent' }),                   /* изпратено, обектът мълчи → обекта */
  row('R5', 'Троян', { warehouse_response: 'return' }),                 /* върни, обектът мълчи → обекта */
  row('R5', 'Троян', { warehouse_response: 'sent', store_response: 'no_stock' }), /* няма наличност → обекта */
  row('R5', 'Троян', { warehouse_response: 'sent', store_response: 'accepted' }), /* разчистено → никъде */
  row('R5', 'Троян', { warehouse_response: null, status: 'received' }), /* прието → никъде */
  row('R6', 'Петрич'),
  row('R7', 'Силистра')
];

const USERS = ['Кърджали', 'Троян', 'Петрич', 'Враца', 'Силистра', 'Ямбол', 'Бургас',
               'Централен офис']
  .map(s => ({ store_name: s }));

function env(appSettings) {
  return boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: {
      users: USERS,
      app_settings: appSettings === undefined
        ? [{ key: 'diff_stale_days', value: '3' }] : appSettings,
      differences_reports: function (url) {
        /* Старата заявка (r[0]) носи прозорец по created_at и по-кратък
           select; новата (r[12]) е ЦЕЛИЯТ списък. Мокът ги различава по
           наличието на филтъра — иначе не може да се докаже, че снимката
           НЯМА прозорец. */
        if (url.indexOf('created_at=') >= 0) return [];
        return REPORTS.map(r => Object.assign({}, r));
      },
      stock_differences: ROWS.map(r => Object.assign({}, r)),
      stock_returns: [], kasa_storno: [], kasa_zoborot: [], goods_transit: [],
      transport_pallets: [], client_orders: [], transport_orders: [],
      bulletins: [], recurring_tasks: [], recurring_task_periods: [],
      recurring_task_skips: [], bulletin_tasks: [], task_completions: [],
      report_snapshots: []
    }
  });
}

const cross = (h, scope) => new Promise(res => {
  h.w.collectCrossModuleWeeklySummary(res, WEEK, scope);
});
const byStore = ds => (ds && ds.byStore || []).reduce((m, g) => (m[g.store] = g, m), {});
const names = ds => (ds && ds.byStore || []).map(g => g.store);

(async function () {

  section('а) Четирите състояния по РЕД + докладът се брои ВЕДНЪЖ');
  {
    const h = env();
    const c = await cross(h, SCOPE);
    const ds = c && c.diffStale;
    if (ok('diffStale го има', !!ds, JSON.stringify(c && Object.keys(c)))) {
      ok('прагът е 3 (от app_settings)', ds.days === 3, String(ds.days));
      const m = byStore(ds);

      /* Кърджали: един доклад, макар да носи ТРИ реда. */
      ok('Кърджали: чака контролинг 2 — по един на доклад, не по ред (R1 носи 3)',
        m['Кърджали'] && m['Кърджали'].control === 2, JSON.stringify(m['Кърджали']));
      ok('прегледаният доклад (R2) не се брои — иначе щеше да е 3',
        m['Кърджали'] && m['Кърджали'].control === 2, JSON.stringify(m['Кърджали']));
      ok('Кърджали няма междускладови', m['Кърджали'] &&
        m['Кърджали'].warehouse === 0 && m['Кърджали'].storeSide === 0,
        JSON.stringify(m['Кърджали']));

      /* Троян: трите състояния „на склада" и трите „на обекта". */
      const tr = m['Троян'] || {};
      ok('Троян: чака склада 3 (няма отговор + ще изпратя + върни/SAP готов)',
        tr.warehouse === 3, JSON.stringify(tr));
      ok('Троян: чака обекта 3 (изпратено + върни без отговор + няма наличност)',
        tr.storeSide === 3, JSON.stringify(tr));
      ok('Троян: чака контролинг 1 (сторната по грешен прием)',
        tr.control === 1, JSON.stringify(tr));
      ok('приетият ред (status=received) НЕ се брои никъде',
        tr.warehouse + tr.storeSide === 6, JSON.stringify(tr));
      ok('разчистеният ред (обектът е приел) също не се брои',
        tr.warehouse + tr.storeSide === 6, JSON.stringify(tr));

      /* Враца: доклад без нито един ред пак чака контролинга. */
      ok('Враца: доклад без редове се брои', m['Враца'] && m['Враца'].control === 1,
        JSON.stringify(m['Враца']));

      ok('общо: контролинг 5 (2 Кърджали + 1 Троян + 1 Враца + 1 Бургас)',
        ds.total.control === 5, JSON.stringify(ds.total));
      ok('общо: чака склада 3', ds.total.warehouse === 3, JSON.stringify(ds.total));
      ok('общо: чака обекта 3', ds.total.storeSide === 3, JSON.stringify(ds.total));
    }
    h.close();
  }

  section('б) Прагът, обхватът и обектите без нищо');
  {
    const h = env();
    const c = await cross(h, SCOPE);
    const ds = c.diffStale;
    ok('Петрич (доклад от вчера) НЕ се показва', names(ds).indexOf('Петрич') < 0,
      names(ds).join('|'));
    ok('Силистра (извън обхвата) НЕ се показва', names(ds).indexOf('Силистра') < 0,
      names(ds).join('|'));
    ok('Ямбол (ТОЧНО 3 дни) НЕ се показва — прагът е строго „над"',
      names(ds).indexOf('Ямбол') < 0, names(ds).join('|'));
    ok('Бургас (4 дни) СЕ показва — границата е от правилната страна',
      names(ds).indexOf('Бургас') >= 0, names(ds).join('|'));
    ok('показват се точно четири обекта', names(ds).length === 4, names(ds).join('|'));

    /* Контрола: без обхват Силистра ВЛИЗА — значи решава scope, не нещо друго. */
    const all = await cross(h, null);
    ok('КОНТРОЛА: без обхват Силистра Е вътре',
      names(all.diffStale).indexOf('Силистра') >= 0, names(all.diffStale).join('|'));
    ok('и Петрич пак го няма — прагът е друга причина',
      names(all.diffStale).indexOf('Петрич') < 0, names(all.diffStale).join('|'));
    h.close();
  }

  section('в) „Най-стар" и подредбата');
  {
    const h = env();
    const ds = (await cross(h, SCOPE)).diffStale;
    const m = byStore(ds);
    ok('Троян: най-стар 20', m['Троян'] && m['Троян'].oldest === 20,
      JSON.stringify(m['Троян']));
    ok('Кърджали: най-стар 10, не 6 — от ПО-СТАРИЯ от двата доклада',
      m['Кърджали'] && m['Кърджали'].oldest === 10, JSON.stringify(m['Кърджали']));
    ok('Бургас: най-стар 4', m['Бургас'] && m['Бургас'].oldest === 4,
      JSON.stringify(m['Бургас']));
    ok('Враца: най-стар 5', m['Враца'] && m['Враца'].oldest === 5,
      JSON.stringify(m['Враца']));
    ok('общото „най-стар" е 20', ds.total.oldest === 20, JSON.stringify(ds.total));
    ok('подредбата е по най-стар, низходящо',
      names(ds).join('|') === 'Троян|Кърджали|Враца|Бургас', names(ds).join('|'));
    h.close();
  }

  section('г) Прагът от app_settings решава кой влиза');
  {
    const cases = [
      ['15 дни → само Троян', [{ key: 'diff_stale_days', value: '15' }], 15, ['Троян']],
      ['липсващ ключ → 3', [], 3, ['Троян', 'Кърджали', 'Враца', 'Бургас']],
      ['боклук → 3', [{ key: 'diff_stale_days', value: 'да' }], 3, ['Троян', 'Кърджали', 'Враца', 'Бургас']],
      ['нула → 3 (нула не е праг)', [{ key: 'diff_stale_days', value: '0' }], 3, ['Троян', 'Кърджали', 'Враца', 'Бургас']],
      ['чужд ключ не се брои за наш', [{ key: 'returns_stale_days', value: '15' }], 3, ['Троян', 'Кърджали', 'Враца', 'Бургас']],
      /* Праг 2: Ямбол (3 дни) влиза, Петрич (1 ден) — не. */
      ['2 дни → Ямбол влиза, Петрич не', [{ key: 'diff_stale_days', value: '2' }], 2,
       ['Троян', 'Кърджали', 'Враца', 'Бургас', 'Ямбол']],
      ['30 дни → никой', [{ key: 'diff_stale_days', value: '30' }], 30, []]
    ];
    for (const [name, settings, days, want] of cases) {
      const h = env(settings);
      const ds = (await cross(h, SCOPE)).diffStale;
      ok(name, ds.days === days && names(ds).join('|') === want.join('|'),
        'праг=' + ds.days + ' обекти=' + names(ds).join('|'));
      h.close();
    }
  }

  section('д) Заявките: три нови, нито една с прозорец по дата');
  {
    const h = env();
    await cross(h, SCOPE);
    const g = h.calls.get;
    const drep = g.filter(u => u.indexOf('/differences_reports') >= 0);
    const dsq = g.filter(u => u.indexOf('/stock_differences') >= 0);
    const aps = g.filter(u => u.indexOf('diff_stale_days') >= 0);
    ok('две заявки към differences_reports — старата и снимката',
      drep.length === 2, drep.join(' | '));
    const snap = drep.filter(u => u.indexOf('created_at=') < 0);
    ok('снимката е БЕЗ прозорец по дата', snap.length === 1, drep.join(' | '));
    ok('и носи id, обект, посока, преглед и дата',
      snap.length === 1 &&
      /select=id,store_name,direction,reviewed,created_at$/.test(snap[0]), snap.join(' | '));
    ok('една заявка към stock_differences, без прозорец',
      dsq.length === 1 && dsq[0].indexOf('created_at=') < 0, dsq.join(' | '));
    ok('и носи точно нужните пет колони',
      dsq.length === 1 &&
      /select=report_id,store_name,status,warehouse_response,store_response$/.test(dsq[0]),
      dsq.join(' | '));
    ok('една заявка за прага', aps.length === 1, aps.join(' | '));
    h.close();
  }

  section('е) Рендерът: таблица, „Общо", червено над 14 дни, ред за прага');
  {
    const h = env();
    const c = await cross(h, SCOPE);
    const html = h.w.reportDiffStaleHtml(c);
    ok('заглавието носи прага', html.indexOf('⏳ Необработени разлики над 3 дни') >= 0,
      html.slice(0, 200));
    ['Обект', 'чака контролинг', 'чака склада', 'чака обекта', 'най-стар (дни)']
      .forEach(col => ok('колона „' + col + '"', html.indexOf(col) >= 0));
    ok('има ред „Общо"', html.indexOf('>Общо<') >= 0, html.slice(-700));
    ok('редът за прага сочи ключа',
      html.indexOf('Праг: 3 дни (app_settings.diff_stale_days)') >= 0, html.slice(-300));
    ok('Петрич не е в таблицата', html.indexOf('Петрич') < 0);
    /* Червеното е СЪДЪРЖАНИЕ: над две седмици разликата вече не се помни. */
    const trs = html.split('<tr');
    const troyan = trs.find(t => t.indexOf('Троян') >= 0) || '';
    const kardzh = trs.find(t => t.indexOf('Кърджали') >= 0) || '';
    ok('Троян (20 дни) е червен', /#FDEEEA/.test(troyan) && /#C0392B/.test(troyan),
      troyan.slice(0, 260));
    ok('Кърджали (10 дни) НЕ е червен', !/#FDEEEA/.test(kardzh) && !/#C0392B/.test(kardzh),
      kardzh.slice(0, 260));

    /* Празно състояние — сивата линия, а не празна таблица. */
    const h2 = env([{ key: 'diff_stale_days', value: '30' }]);
    const empty = h2.w.reportDiffStaleHtml(await cross(h2, SCOPE));
    ok('при нула — сива линия, не празна таблица',
      empty.indexOf('Няма необработени разлики над 30 дни') >= 0 &&
      empty.indexOf('<table') < 0, empty);
    ok('липсващ diffStale → нищо', h.w.reportDiffStaleHtml({}) === '');
    ok('липсващ cross → нищо', h.w.reportDiffStaleHtml(null) === '');
    h2.close(); h.close();
  }

  section('ж) Секцията е в седмичното писмо, след реда „Разлики"');
  {
    const h = env();
    const c = await cross(h, SCOPE);
    const sec = h.w.buildCrossModuleSectionHtml(c, false);
    const diffRow = sec.indexOf('Разлики от доставчици и междускладови');
    const stale = sec.indexOf('⏳ Необработени разлики над');
    const ret = sec.indexOf('За връщане (текущо състояние)');
    ok('секцията я има', stale >= 0, sec.slice(0, 200));
    ok('след реда „Разлики…"', diffRow >= 0 && stale > diffRow,
      diffRow + ' / ' + stale);
    ok('и ПРЕДИ „За връщане"', ret >= 0 && stale < ret, stale + ' / ' + ret);
    /* Бутонът „Седмичен (тест до мен)" минава през buildWeeklyReportHtml →
       buildCrossModuleSectionHtml. Ако връзката се скъса, секцията я има в
       кода и я няма в писмото — и нищо не гърми. */
    [['report.js', 'report.js'],
     ['едж', 'supabase/functions/send-scheduled-report/index.ts']].forEach(function (pair) {
      const src = fs.readFileSync(path.join(ROOT, pair[1]), 'utf8');
      ok(pair[0] + ': седмичното писмо вика кросмодулната секция',
        src.indexOf('buildCrossModuleSectionHtml(data.cross, data.scoped)') >= 0);
      ok(pair[0] + ': кросмодулната вика reportDiffStaleHtml',
        src.indexOf('h += reportDiffStaleHtml(cross);') >= 0);
    });
    h.close();
  }

  section('з) Едж копието дава СЪЩИЯ изход при същите входове');
  {
    /* Не текстово сравнение (това е работа на report-edge-sync), а
       ИЗПЪЛНЕНИЕ: функцията се вади от .ts файла, зарежда се в същия прозорец
       под друго име и получава същия cross обект. Разминаване в логиката,
       което нормализацията би простила, тук излиза като различен HTML. */
    const src = fs.readFileSync(
      path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');
    const lines = src.split(/\r?\n/);
    const i = lines.findIndex(l => /^function reportDiffStaleHtml\s*\(/.test(l));
    if (!ok('функцията се намира в едж файла', i >= 0)) { report(); return; }
    /* Затваря се по БРОЯЧ на скоби, не по „ред, който е точно }" — същата
       причина като в report-edge-sync.test.js. */
    const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
    const body = [];
    let depth = 0, started = false;
    for (let j = i; j < lines.length; j++) {
      body.push(lines[j]);
      for (const ch of strip(lines[j])) {
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') depth--;
      }
      if (started && depth <= 0) break;
    }
    const h = env();
    const c = await cross(h, SCOPE);
    let edgeFn = null;
    try {
      h.w.eval(body.join('\n').replace('function reportDiffStaleHtml',
                                       'function __edgeDiffStale'));
      edgeFn = h.w.__edgeDiffStale;
    } catch (e) {
      ok('едж копието се зарежда', false, e.message);
    }
    if (ok('едж копието се зарежда и е функция', typeof edgeFn === 'function')) {
      const mine = h.w.reportDiffStaleHtml(c);
      const theirs = edgeFn(c);
      ok('изходът е БАЙТ В БАЙТ същият', mine === theirs,
        'клиент ' + mine.length + ' знака, едж ' + theirs.length);
      ok('и не е празен', mine.length > 500, String(mine.length));
      /* И на празно, и на липсващо — за да не съвпадат само по общия случай. */
      const h2 = env([{ key: 'diff_stale_days', value: '30' }]);
      const c2 = await cross(h2, SCOPE);
      ok('празното състояние също съвпада',
        h.w.reportDiffStaleHtml(c2) === edgeFn(c2),
        h.w.reportDiffStaleHtml(c2) + ' | ' + edgeFn(c2));
      ok('липсващият diffStale също', h.w.reportDiffStaleHtml({}) === edgeFn({}));
      h2.close();
    }
    h.close();
  }

  report();
})();
