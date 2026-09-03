/* Печат на товарен лист („Протокол за товарене").

   Същият in-page модел като renderDiffPrint(): пише в #mod-print и вика
   showModule('print'). Оттам идва и най-коварното тук — печатът наследява
   ЦЕЛИЯ CSS на index.html (CLAUDE.md т.12), затова стилът трябва изрично да
   бие th{white-space:nowrap} и tr:last-child td{border-bottom:none}. jsdom не
   смята лейаут, тоест тези две неща се пазят само със закотвен регекс срещу
   стила; визуалното съответствие се потвърждава от реален preview.

   Пускане:  node tests/loading-lists-print.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                role: 'manager', store_name: 'Петрич', assigned_stores: [] };

const L_SENT = { id: 'L1', warehouse: WH, list_date: '2026-09-02', status: 'sent',
                 executed_by: 'Иван Петров', comment: 'Курс сутрин',
                 created_by: 'Склад Търговище', created_at: '2026-09-02T06:00:00.000Z',
                 sent_at: '2026-09-02T07:00:00.000Z', done_at: null };

function it_(o) {
  return Object.assign({
    id: 'i-x', list_id: 'L1', position: 1, kind: 'pallet',
    pallet_no: 1, pallet_total: 2, purchase_doc: null, clears_doc: null,
    store_name: 'Петрич', warehouse_comment: null, store_comment: null,
    partial: false, received: false, received_by: null, received_at: null,
    created_at: '2026-09-02T06:00:00.000Z'
  }, o);
}

/* Два обекта, три палета. Палет 1 на Петрич носи ТРИ документа — това е
   консолидацията и точно тя трябва да се изпише веднъж, не три пъти. */
const ITEMS = [
  it_({ id: 'a1', position: 1, pallet_no: 1, pallet_total: 2, purchase_doc: 'D-1' }),
  it_({ id: 'a2', position: 2, pallet_no: 1, pallet_total: 2, purchase_doc: 'D-2' }),
  it_({ id: 'a3', position: 3, pallet_no: 1, pallet_total: 2, purchase_doc: 'D-3' }),
  it_({ id: 'a4', position: 4, pallet_no: 2, pallet_total: 2, purchase_doc: 'D-4',
        warehouse_comment: 'кашонът е леко смачкан' }),
  it_({ id: 'b1', position: 5, pallet_no: 1, pallet_total: 1, purchase_doc: 'D-9',
        store_name: 'Гоце Делчев' })
];

function env(user, items, lists) {
  const h = boot({
    modules: ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js',
              'stock-differences.js', 'loading.js'],
    user: user, confirm: true,
    data: {
      loading_list_items: function (url) {
        let rows = (items || []).map(r => Object.assign({}, r));
        const st = /store_name=eq\.([^&]*)/.exec(url);
        if (st) rows = rows.filter(r => r.store_name === decodeURIComponent(st[1]));
        return rows;
      },
      loading_lists: lists || [L_SENT],
      goods_transit: [], users: [], stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  h.went = [];
  h.w.showModule = function (m) { h.went.push(m); };
  return h;
}
const printWrap = doc => doc.getElementById('mod-print');
const prows = doc => printWrap(doc).querySelectorAll('.lp-tbl tr[data-store]');
const ptext = doc => printWrap(doc).textContent;
const pstyle = doc => {
  const st = printWrap(doc).querySelector('style');
  return st ? st.textContent : '';
};

(async function () {

  section('а) Складът има бутон „Печат"; кликът пълни #mod-print');
  {
    const h = env(WAREHOUSE, ITEMS);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');

    const b = btn(h.doc.getElementById('mod-loading'), '🖨 Печат');
    if (ok('бутонът е в прегледа', !!b)) {
      ok('#mod-print е празен преди клика', !printWrap(h.doc).innerHTML.trim());
      realClick(h.w, b);
      await ticks();
      ok('#mod-print вече има съдържание', printWrap(h.doc).innerHTML.length > 500,
        String(printWrap(h.doc).innerHTML.length));
      ok('showModule(\'print\') е извикан', h.went.indexOf('print') >= 0,
        JSON.stringify(h.went));
      ok('има бутон за принтиране',
        /window\.print\(\)/.test(printWrap(h.doc).innerHTML));
      ok('и връщане към Товарни листи',
        /showModule\('loading'\)/.test(printWrap(h.doc).innerHTML));
      ok('логото е вградено base64, не външен адрес',
        /src="data:image\/png;base64,/.test(printWrap(h.doc).innerHTML));
      ok('заглавието е ТОВАРЕН ЛИСТ', ptext(h.doc).indexOf('ТОВАРЕН ЛИСТ') >= 0);
      ok('носи склада, датата и товарилия',
        ptext(h.doc).indexOf(WH) >= 0 && ptext(h.doc).indexOf('02.09.2026') >= 0 &&
        ptext(h.doc).indexOf('Иван Петров') >= 0, ptext(h.doc).slice(0, 300));
      ok('и коментара на листа', ptext(h.doc).indexOf('Курс сутрин') >= 0);
      ok('има места за подпис',
        ptext(h.doc).indexOf('Товарил:') >= 0 && ptext(h.doc).indexOf('Приел:') >= 0);
      ok('и ред „Отпечатано … от"',
        /Отпечатано \d{2}\.\d{2}\.\d{4} \d{2}:\d{2} от Склад Търговище/.test(ptext(h.doc)),
        ptext(h.doc).slice(-160));
    }
  }

  section('б) Палет с три документа — видът се изписва ВЕДНЪЖ');
  {
    const h = env(WAREHOUSE, ITEMS);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llPrint('L1');
    await ticks();

    const t = ptext(h.doc);
    const occurrences = (t.match(/палет 1 от 2/g) || []).length;
    ok('„палет 1 от 2" се среща точно веднъж', occurrences === 1, String(occurrences));
    ok('и трите му документа са отделни редове',
      t.indexOf('D-1') >= 0 && t.indexOf('D-2') >= 0 && t.indexOf('D-3') >= 0);
    /* rowspan е това, което държи вида в един ред за целия палет.
       Търси се ПО СЪДЪРЖАНИЕ, не първата клетка: подредбата е по обект, а
       „Гоце Делчев" стои преди „Петрич" и неговият палет е първи. */
    const kinds = Array.prototype.slice.call(printWrap(h.doc).querySelectorAll('.lp-kind'));
    ok('има три товарни единици', kinds.length === 3,
      kinds.map(k => k.textContent + '/' + k.getAttribute('rowspan')).join(' | '));
    const kind = kinds.find(k => k.textContent.indexOf('палет 1 от 2') >= 0);
    ok('палетът с трите документа е с rowspan=3',
      kind && kind.getAttribute('rowspan') === '3',
      kinds.map(k => k.textContent + '/' + k.getAttribute('rowspan')).join(' | '));
    ok('а самотните палети са с rowspan=1',
      kinds.filter(k => k.getAttribute('rowspan') === '1').length === 2,
      kinds.map(k => k.getAttribute('rowspan')).join(','));
    ok('всички 5 реда са в таблицата', prows(h.doc).length === 5,
      String(prows(h.doc).length));
    /* Обобщението: Петрич има 2 палета (не 4 реда), Гоце Делчев — 1. */
    ok('обобщението дава на Петрич 2 палета',
      /Петрич\s*2\s*0\s*0/.test(t.replace(/\s+/g, ' ')), t.replace(/\s+/g, ' ').slice(0, 400));
    ok('и на Гоце Делчев 1',
      /Гоце Делчев\s*1\s*0\s*0/.test(t.replace(/\s+/g, ' ')), t.replace(/\s+/g, ' ').slice(0, 400));
  }

  section('в) storeFilter — чуждите редове ги няма');
  {
    const h = env(WAREHOUSE, ITEMS);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llPrint('L1', 'Петрич');
    await ticks();

    /* Проверката е по data-store на реда, не по текст: името на обекта стои и
       в обобщението отгоре, тоест търсене в текста би минавало винаги. */
    const rs = prows(h.doc);
    ok('редовете са само 4 (тези на Петрич)', rs.length === 4, String(rs.length));
    ok('всички носят data-store=Петрич',
      Array.prototype.every.call(rs, r => r.getAttribute('data-store') === 'Петрич'),
      Array.prototype.map.call(rs, r => r.getAttribute('data-store')).join(','));
    ok('нито един ред не е на Гоце Делчев',
      !Array.prototype.some.call(rs, r => r.getAttribute('data-store') === 'Гоце Делчев'));
    ok('заглавието носи обекта',
      ptext(h.doc).indexOf('ТОВАРЕН ЛИСТ — Петрич') >= 0, ptext(h.doc).slice(0, 200));
    ok('и обобщението е само за него',
      ptext(h.doc).indexOf('Гоце Делчев') < 0, ptext(h.doc).slice(0, 400));
  }

  section('г) „изчиства", „частично" и празно каре');
  {
    const items = [
      it_({ id: 'c1', purchase_doc: 'D-100', clears_doc: 'D-777', partial: true }),
      it_({ id: 'c2', position: 2, pallet_no: 2, purchase_doc: null })
    ];
    const h = env(WAREHOUSE, items);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llPrint('L1');
    await ticks();

    const t = ptext(h.doc);
    ok('пише „изчиства D-777"', t.indexOf('изчиства D-777') >= 0, t.slice(0, 400));
    ok('пише „частично"', t.indexOf('частично') >= 0);
    ok('ред без документ пише „без"', t.indexOf('без') >= 0);
    ok('неполученият ред има празно каре за ръчна отметка',
      printWrap(h.doc).querySelectorAll('.lp-box').length === 2,
      String(printWrap(h.doc).querySelectorAll('.lp-box').length));
  }

  section('д) received_at е timestamptz — в печата няма T и Z');
  {
    const items = [it_({ id: 'r1', purchase_doc: 'D-1', received: true,
                         received_by: 'Управител Петрич',
                         received_at: '2026-09-03T10:15:00.000Z' })];
    const h = env(WAREHOUSE, items);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llPrint('L1');
    await ticks();

    const t = ptext(h.doc);
    ok('датата е в български формат', t.indexOf('03.09.2026') >= 0, t.slice(0, 400));
    ok('няма суров timestamptz с T', t.indexOf('T10:15') < 0, t.slice(0, 400));
    ok('няма „Z" от ISO низа', t.indexOf('.000Z') < 0, t.slice(0, 400));
    /* Точният дефект от сигнала за размяна: fmtDate() върху timestamptz дава
       „03T10:15:00.000Z.09.2026". */
    ok('и няма следа от разбъркания формат', !/\d{2}T\d{2}:/.test(t), t.slice(0, 400));
    ok('приемачът е изписан', t.indexOf('Управител Петрич') >= 0);
  }

  section('е) Стилът бие глобалния CSS на index.html');
  {
    const h = env(WAREHOUSE, ITEMS);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llPrint('L1');
    await ticks();
    const css = pstyle(h.doc);

    /* Закотвени регекси — jsdom не смята лейаут, тоест това е единственото,
       което може да се провери автоматично. */
    ok('th има white-space:normal (бие index.html:67)',
      /\.lp-tbl th\{[^}]*white-space:normal/.test(css), css.slice(0, 200));
    ok('последният ред си връща долната рамка (бие index.html:69)',
      /\.lp-tbl tr:last-child td\{[^}]*border-bottom:1px/.test(css));
    ok('клетките са box-sizing:border-box (иначе колоните излизат от листа)',
      /\.lp-tbl th\{[^}]*box-sizing:border-box/.test(css) &&
      /\.lp-tbl td\{[^}]*box-sizing:border-box/.test(css));
    ok('страницата е A4 portrait с 10mm полета',
      /@page\{size:A4 portrait;margin:10mm;\}/.test(css));
    ok('таблицата е 190mm', /\.lp-wrap\{[^}]*width:190mm/.test(css));
    /* Сумата на колоните трябва да е точно 190mm. */
    const cols = printWrap(h.doc).querySelectorAll('.lp-tbl')[1].querySelectorAll('col');
    const total = Array.prototype.reduce.call(cols, (s, c) =>
      s + parseFloat(/width:([\d.]+)mm/.exec(c.getAttribute('style'))[1]), 0);
    ok('ширините на колоните сумират 190mm', total === 190, String(total));
    ok('екранните бутони са с no-print', /\.no-print\{display:none!important;\}/.test(css));
  }

  section('ж) Лист без редове — печатът излиза, не гърми');
  {
    const h = env(WAREHOUSE, []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    if (guard('llPrint() не хвърля при празен лист', () => h.w.llPrint('L1'))) {
      const t = ptext(h.doc);
      ok('таблицата казва „Няма редове"', t.indexOf('Няма редове') >= 0, t.slice(0, 400));
      ok('обобщението е с нули', /0\/0/.test(t), t.slice(0, 400));
      ok('заглавието пак е налице', t.indexOf('ТОВАРЕН ЛИСТ') >= 0);
      ok('нула редове с data-store', prows(h.doc).length === 0,
        String(prows(h.doc).length));
    }
  }

  section('з) Магазинът печата само своята част');
  {
    const h = env(STORE, ITEMS);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    const b = btn(h.doc.getElementById('ll-card-L1'), '🖨 Печат');
    if (ok('картата има бутон „Печат"', !!b)) {
      realClick(h.w, b);
      await ticks();
      ok('заглавието е за неговия обект',
        ptext(h.doc).indexOf('ТОВАРЕН ЛИСТ — Петрич') >= 0, ptext(h.doc).slice(0, 200));
      ok('редовете са само негови',
        Array.prototype.every.call(prows(h.doc), r => r.getAttribute('data-store') === 'Петрич'),
        Array.prototype.map.call(prows(h.doc), r => r.getAttribute('data-store')).join(','));
      ok('showModule(\'print\') е извикан', h.went.indexOf('print') >= 0,
        JSON.stringify(h.went));
    }
  }

  report();
})();
