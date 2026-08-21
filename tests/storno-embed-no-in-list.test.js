/* Сторно редовете идват вложени в родителския запис, а не с втора заявка.

   Старият път беше двустъпков: първо kasa_storno, после kasa_storno_items със
   storno_id=in.(<всички id-та>). В таб История за администратор филтърът по
   магазин е празен, така че 30 дни × 18 обекта дават 763 бележки — URL-ът
   ставаше ~30 KB и гейтуеят го отхвърляше с 400, преди заявката да стигне до
   Postgres. Същата заявка с къс списък връщаше 200, тоест схемата беше наред.

   Тестът покрива и трите места, които ползваха общия помощник:
     1. runHistorySearch()  — таб История (пътят от банера за сторна)
     2. loadStorno()        — Каса > Сторно бележки
     3. stornoIndexItems()  — общият индекс, от който чете и Excel износът

   kasa.js и history.js се зареждат ЗАЕДНО — stornoIndexItems() и STORNO_SELECT
   живеят в kasa.js, а history.js ги вика.

   Пускане:  node tests/storno-embed-no-in-list.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks } = H;

/* Родителски запис ТАКА, КАКТО го връща PostgREST с embedding — редовете са
   вложен масив, не отделна заявка. */
function note(o) {
  return Object.assign({
    id: 'st-1', store_name: 'Карлово', storno_date: '2026-08-19',
    original_receipt_date: '2026-08-14',
    articles: '96776', article_name: 'СТАРО ТЕКСТОВО ПОЛЕ',
    returned_sum: 31.76, replacement_articles: '0', replacement_article_name: '',
    new_sum: 0, reason: 'ГРЕШНА ПОКУПКА', status: 'draft',
    created_by: 'Управител Карлово', created_at: '2026-08-20T06:19:15Z',
    kasa_storno_items: [
      { kind: 'returned',    line_no: 1, sap_code: '96776', article_name: 'ПАРКЕТ ЛАМ.TM4010' },
      { kind: 'replacement', line_no: 1, sap_code: '55501', article_name: 'ПАРКЕТ ЗАМЯНА' }
    ]
  }, o);
}

/* 763 бележки — реалният брой от инцидента. Точно този обем правеше URL-а 30 KB. */
function manyNotes(n) {
  var out = [];
  for (var i = 0; i < n; i++) {
    out.push(note({
      id: 'aaaaaaaa-bbbb-cccc-dddd-' + String(100000000000 + i),
      store_name: i % 2 ? 'Карлово' : 'Шумен',
      kasa_storno_items: [
        { kind: 'returned', line_no: 1, sap_code: 'SAP' + i, article_name: 'АРТИКУЛ ' + i }
      ]
    }));
  }
  return out;
}

const ADMIN = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис'
};

function env(notes, user) {
  return boot({
    modules: ['kasa.js', 'kasa-docs.js', 'history.js'],
    user: user || ADMIN,
    data: {
      kasa_storno: notes,
      /* Ако някой все пак попита за таблицата с редовете, ще си проличи в calls.get. */
      kasa_storno_items: [],
      kasa_reports: [], kasa_zoborot: [], kasa_glavna: [], kasa_documents: [],
      transport_orders: [], client_orders: [], stores: []
    }
  });
}

function itemGets(h) {
  return h.calls.get.filter(function (u) { return u.indexOf('/kasa_storno_items') >= 0; });
}
function inListGets(h) {
  return h.calls.get.filter(function (u) { return u.indexOf('in.(') >= 0; });
}
function parentGets(h) {
  return h.calls.get.filter(function (u) { return u.indexOf('/kasa_storno?') >= 0; });
}
function setPeriod(h) {
  h.doc.getElementById('h-from').value = '2026-07-21';
  h.doc.getElementById('h-to').value   = '2026-08-20';
  h.doc.getElementById('h-type').value = 'storno';
}

(async function () {

  /* ── 1. Таб История ─────────────────────────────────────────────────────── */
  section('1. История — една заявка, без in.() списък');
  {
    const h = env([note()]);
    guard('renderHistoryShell() не хвърля', () => h.w.renderHistoryShell());
    setPeriod(h);
    h.calls.get.length = 0;

    guard('runHistorySearch() не хвърля', () => h.w.runHistorySearch());
    await ticks();

    ok('нула заявки към kasa_storno_items', itemGets(h).length === 0,
       'реално: ' + itemGets(h).join(' | '));
    ok('нула заявки с in.() списък', inListGets(h).length === 0,
       'реално: ' + inListGets(h).join(' | '));

    const p = parentGets(h);
    if (ok('точно една заявка към kasa_storno', p.length === 1, 'реално: ' + p.length)) {
      const u = decodeURIComponent(p[0]);
      ok('заявката носи embedding на редовете',
         u.indexOf('select=*,kasa_storno_items(kind,sap_code,article_name,line_no)') >= 0, u);
      ok('вложеното сортиране е отделен параметър',
         u.indexOf('kasa_storno_items.order=kind.asc,line_no.asc') >= 0, u);
      ok('филтрите по период са запазени',
         u.indexOf('storno_date=gte.2026-07-21') >= 0 && u.indexOf('storno_date=lte.2026-08-20') >= 0, u);
    }

    const html = h.doc.getElementById('h-results').innerHTML;
    ok('рендерът чете ВЛОЖЕНИТЕ редове (върнат артикул)', html.indexOf('96776') >= 0);
    ok('рендерът чете ВЛОЖЕНИТЕ редове (заменящ артикул)', html.indexOf('55501') >= 0);
    ok('индексът е попълнен от родителския запис',
       !!(h.w.stornoItemsById['st-1'] && h.w.stornoItemsById['st-1'].returned.length === 1),
       JSON.stringify(h.w.stornoItemsById));
    h.close();
  }

  /* ── 2. Реалният обем ───────────────────────────────────────────────────── */
  section('2. 763 бележки — URL-ът остава къс');
  {
    const h = env(manyNotes(763));
    h.w.renderHistoryShell();
    setPeriod(h);
    h.calls.get.length = 0;

    guard('runHistorySearch() не хвърля при 763 бележки', () => h.w.runHistorySearch());
    await ticks();

    ok('пак нула заявки към kasa_storno_items', itemGets(h).length === 0,
       'реално: ' + itemGets(h).length);

    var longest = 0;
    h.calls.get.forEach(function (u) { if (u.length > longest) longest = u.length; });
    ok('най-дългият URL е под 2 KB (беше ~30 KB)', longest < 2048, 'реално: ' + longest + ' знака');
    ok('индексът покрива всичките 763 бележки',
       Object.keys(h.w.stornoItemsById).length === 763,
       'реално: ' + Object.keys(h.w.stornoItemsById).length);
    h.close();
  }

  /* ── 3. Каса > Сторно ───────────────────────────────────────────────────── */
  section('3. Каса > Сторно — същият път, без втора заявка');
  {
    const h = env([note({ store_name: 'Централен офис' })]);
    h.calls.get.length = 0;

    guard('loadStorno() не хвърля', () => h.w.loadStorno());
    await ticks();

    ok('нула заявки към kasa_storno_items', itemGets(h).length === 0,
       'реално: ' + itemGets(h).join(' | '));
    const p = parentGets(h);
    if (ok('точно една заявка към kasa_storno', p.length === 1, 'реално: ' + p.length)) {
      const u = decodeURIComponent(p[0]);
      ok('заявката носи embedding', u.indexOf('kasa_storno_items(') >= 0, u);
      ok('филтърът по магазин е запазен', u.indexOf('store_name=eq.Централен офис') >= 0, u);
    }
    ok('индексът е попълнен', !!h.w.stornoItemsById['st-1'], JSON.stringify(h.w.stornoItemsById));
    h.close();
  }

  /* ── 4. Бележка без редове пада обратно към старите полета ──────────────── */
  section('4. Бележка без вложени редове — fallback към текстовите полета');
  {
    const h = env([note({ id: 'st-empty', kasa_storno_items: [] })]);
    h.w.renderHistoryShell();
    setPeriod(h);

    guard('runHistorySearch() не хвърля', () => h.w.runHistorySearch());
    await ticks();

    ok('няма запис в индекса за бележка без редове',
       h.w.stornoItemsById['st-empty'] === undefined,
       JSON.stringify(h.w.stornoItemsById));
    const html = h.doc.getElementById('h-results').innerHTML;
    ok('показва старото текстово поле вместо празен списък',
       html.indexOf('СТАРО ТЕКСТОВО ПОЛЕ') >= 0);
    h.close();
  }

  /* ── 5. Гранични входове за индекса ─────────────────────────────────────── */
  section('5. Липсващи/непълни данни не оставят стар индекс');
  {
    const h = env([note()]);
    h.w.stornoIndexItems([note()]);
    ok('индексът е пълен преди провала', Object.keys(h.w.stornoItemsById).length === 1);

    guard('stornoIndexItems(null) не хвърля', () => h.w.stornoIndexItems(null));
    ok('индексът е изчистен при липсващи данни',
       Object.keys(h.w.stornoItemsById).length === 0, JSON.stringify(h.w.stornoItemsById));

    guard('stornoIndexItems с ред без id не хвърля',
          () => h.w.stornoIndexItems([{ kasa_storno_items: [{ kind: 'returned', sap_code: 'X' }] }]));
    ok('ред без id се пропуска', Object.keys(h.w.stornoItemsById).length === 0);

    guard('липсващ вложен масив не хвърля',
          () => h.w.stornoIndexItems([{ id: 'st-x' }]));
    ok('бележка без вложен масив не влиза в индекса',
       h.w.stornoItemsById['st-x'] === undefined);
    h.close();
  }

  report();
})();
