/* Товарни листи — „📐 Извънгабаритен" като отделен вид товарна единица.

   Въведен на 23.09.2026 като „рол контейнер" и преименуван същия ден, преди
   да е ползван (нула реда в базата): количката на колела се оказа частен
   случай. Това, което складът трябва да отдели от палета, е ВСЯКО нещо,
   което не се вози на палет — стелажи, ламперия, дълги профили.

   Товари се, вози се и се приема като палет и получава свой опис. Но
   номерацията му е ОТДЕЛНА поредица: „палет 2 от 5" и „извънгабаритен 2 от 3"
   са две различни обещания към един и същ обект.

   Тихите грешки, които се пазят тук:
     · обща поредица с палетите — четири палета и четири извънгабаритни дават
       „палет 4 от 8", число, което не отговаря на нищо на рампата;
     · описът на палет 1 събира и извънгабаритен 1 (или обратно), защото
       препратката е само число;
     · CHECK-ът в базата не знае новата стойност → 409 при запис;
     · ИЗВЪНГАБАРИТЕН РЕД БЕЗ ОПИСАНИЕ. Той няма артикули по документ и няма
       стандартен вид: на рампата обектът вижда „извънгабаритен 1 от 2" и
       нищо друго. Затова warehouse_comment му е задължителен — и затова
       описанието трябва да е ДО ВИДА в печата, PDF-а и писмото, не в
       колоната за бележки встрани.

   Пускане:  node tests/loading-lists-oversize.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                role: 'manager', store_name: 'Петрич', assigned_stores: [] };

const LIST = { id: 'L1', warehouse: WH, list_date: '2026-09-23', status: 'sent',
               executed_by: 'Иван', comment: '', created_at: '2026-09-23T06:00:00.000Z',
               sent_at: '2026-09-23T07:00:00.000Z', done_at: null };
function item(o) {
  return Object.assign({
    list_id: 'L1', kind: 'pallet', pallet_no: 1, pallet_total: 1, purchase_doc: null,
    clears_doc: null, store_name: 'Петрич', warehouse_comment: null, store_comment: null,
    partial: false, received: false, received_by: null, received_at: null,
    missing: false, missing_by: null, missing_at: null,
    added_by_store: false, approval_status: null, created_at: 'x'
  }, o);
}
const P = (item_id, pos, sap, name, qty) =>
  ({ id: 'P-' + item_id + '-' + pos, item_id: item_id, position: pos, sap_code: sap,
     product_name: name, unit: 'бр.', qty: qty, cartons: null, received_qty: null, created_at: 'x' });

function env(user, items, products) {
  const h = boot({
    /* email.js дава emailWrap — сценарий „з" рендира двете писма. */
    modules: ['transport.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js',
              'push.js', 'email.js', 'loading.js'],
    user: user, confirm: true,
    data: {
      loading_lists: [LIST],
      loading_list_items: () => (items || []).map(it => Object.assign({}, it, {
        loading_list_products: (products || []).filter(p => p.item_id === it.id).map(p => Object.assign({}, p))
      })),
      users: [{ store_name: 'Петрич' }, { store_name: 'Гоце Делчев' }, { store_name: WH }],
      loading_list_products: [], stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: [], goods_transit: [],
      app_settings: []
    }
  });
  h.modules = [];
  h.w.showModule = function (m) { h.modules.push(m); };
  h.toasts = [];
  const origToast = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: m, col: c }); return origToast(m, c); };
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
const pr = h => h.doc.getElementById('mod-print');

(async function () {

  section('а) Видът го има в менюто и се номерира като палет');
  {
    const h = env(WAREHOUSE, []);
    ok('LL_KINDS съдържа oversize',
      h.w.LL_KINDS.some(k => k[0] === 'oversize' && /Извънгабаритен/.test(k[1])),
      JSON.stringify(h.w.LL_KINDS));
    ok('старият ключ roll_container го НЯМА никъде в менюто',
      h.w.LL_KINDS.every(k => k[0] !== 'roll_container'),
      JSON.stringify(h.w.LL_KINDS.map(k => k[0])));
    ok('и е СЛЕД палета, преди рулото',
      h.w.LL_KINDS.map(k => k[0]).join(',') === 'pallet,oversize,roll,bulk',
      h.w.LL_KINDS.map(k => k[0]).join(','));
    ok('номериран вид', h.w.llIsNumbered('oversize') === true && h.w.llIsNumbered('pallet') === true);
    ok('старият ключ вече не е номериран', h.w.llIsNumbered('roll_container') === false);
    ok('рулото и насипът — не', !h.w.llIsNumbered('roll') && !h.w.llIsNumbered('bulk'));
    ok('етикетът е „извънгабаритен N от M"',
      h.w.llKindLabel({ kind: 'oversize', pallet_no: 2, pallet_total: 3 }) === 'извънгабаритен 2 от 3',
      h.w.llKindLabel({ kind: 'oversize', pallet_no: 2, pallet_total: 3 }));
    ok('без номер — само думата', h.w.llKindLabel({ kind: 'oversize' }) === 'извънгабаритен');
  }

  section('б) Номерацията е ОТДЕЛНА поредица от палетите');
  {
    const h = env(WAREHOUSE, []);
    const rows = [
      { kind: 'pallet', pallet_no: 1, store_name: 'Петрич' },
      { kind: 'oversize', pallet_no: 5, store_name: 'Петрич' },
      { kind: 'pallet', pallet_no: 4, store_name: 'Петрич' },
      { kind: 'oversize', pallet_no: 9, store_name: 'Петрич' },
      /* Друг обект — своя поредица. */
      { kind: 'pallet', pallet_no: 7, store_name: 'Гоце Делчев' }
    ];
    h.w.llRenumberPallets(rows);
    ok('палетите на Петрич: 1 от 2 и 2 от 2',
      rows[0].pallet_no === 1 && rows[0].pallet_total === 2 &&
      rows[2].pallet_no === 2 && rows[2].pallet_total === 2,
      JSON.stringify(rows.map(r => r.kind + r.pallet_no + '/' + r.pallet_total)));
    ok('извънгабаритните на Петрич: 1 от 2 и 2 от 2 — СВОЯ поредица',
      rows[1].pallet_no === 1 && rows[1].pallet_total === 2 &&
      rows[3].pallet_no === 2 && rows[3].pallet_total === 2,
      JSON.stringify(rows.map(r => r.kind + r.pallet_no + '/' + r.pallet_total)));
    ok('и НЕ са „от 4" — общата поредица би дала точно това',
      rows.filter(r => r.pallet_total === 4).length === 0,
      JSON.stringify(rows.map(r => r.pallet_total)));
    ok('другият обект си е сам', rows[4].pallet_no === 1 && rows[4].pallet_total === 1);
  }

  section('в) Групиране: палет 1 и извънгабаритен 1 на един обект са РАЗНИ');
  {
    const h = env(WAREHOUSE, []);
    const rows = [
      item({ id: 'A', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 1, purchase_doc: 'ИЗХ-1' }),
      item({ id: 'B', position: 2, kind: 'oversize', pallet_no: 1, pallet_total: 1, purchase_doc: 'ИЗХ-2',
             warehouse_comment: 'стелажи' })
    ];
    const g = h.w.llPalletGroups(rows);
    ok('две групи, не една', g.length === 2, JSON.stringify(g.map(x => x.kind + x.pallet_no)));
    const c = h.w.llCounts(rows);
    ok('llCounts брои 1 палет и 1 извънгабаритен', c.pallet === 1 && c.oversize === 1, JSON.stringify(c));
    ok('и няма поле roll_container', !('roll_container' in c), JSON.stringify(Object.keys(c)));
    const sum = h.w.llSummaryByStore(rows);
    ok('обобщението по обект също', sum[0].pallet === 1 && sum[0].oversize === 1, JSON.stringify(sum[0]));
  }

  section('г) Опис: извънгабаритният има свой, отделен от палета със същия номер');
  {
    const items = [
      item({ id: 'A', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 1, purchase_doc: 'ИЗХ-100' }),
      item({ id: 'B', position: 2, kind: 'oversize', pallet_no: 1, pallet_total: 2, purchase_doc: 'ИЗХ-200',
             warehouse_comment: 'стелажи 2 м' }),
      item({ id: 'C', position: 3, kind: 'oversize', pallet_no: 2, pallet_total: 2, purchase_doc: 'ИЗХ-300',
             warehouse_comment: 'ламперия' })
    ];
    const products = [P('A', 1, 'НА-ПАЛЕТА', 'СТОКА ОТ ПАЛЕТ', 5),
                      P('B', 1, 'В-ИЗВЪНГАБ', 'СТОКА ОТ ИЗВЪНГАБАРИТЕН', 9)];
    const h = env(WAREHOUSE, items, products);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');

    const btns = Array.from(mod(h).querySelectorAll('button[data-u]'));
    ok('три бутона „Опис" — по един на единица', btns.length === 3,
      JSON.stringify(btns.map(b => b.getAttribute('data-u'))));
    /* Представката „rc" е от предишното име и се пази нарочно — тя не се
       записва никъде, но стои в data-u и смяната ѝ би счупила вече отворен
       печатен изглед. Важното е, че ВИДЪТ е в препратката, не буквите. */
    ok('препратките носят вида: 1, rc1, rc2',
      btns.map(b => b.getAttribute('data-u')).join(',') === '1,rc1,rc2',
      btns.map(b => b.getAttribute('data-u')).join(','));

    realClick(h.w, btns[1]);
    const t = pr(h).textContent;
    ok('печатът е отворен', h.modules.indexOf('print') >= 0);
    ok('заглавието е „Извънгабаритен 1 от 2"', t.indexOf('Извънгабаритен 1 от 2') >= 0, t.slice(0, 260));
    ok('носи стоката на извънгабаритния', t.indexOf('СТОКА ОТ ИЗВЪНГАБАРИТЕН') >= 0);
    ok('и НЕ стоката на палет 1', t.indexOf('СТОКА ОТ ПАЛЕТ') < 0);
    ok('изходящият номер е неговият', t.indexOf('ИЗХ-200') >= 0 && t.indexOf('ИЗХ-100') < 0);

    realClick(h.w, btns[0]);
    const t2 = pr(h).textContent;
    ok('палет 1 показва „Палет 1 от 1"', t2.indexOf('Палет 1 от 1') >= 0, t2.slice(0, 260));
    ok('със своята стока', t2.indexOf('СТОКА ОТ ПАЛЕТ') >= 0);
    ok('и без стоката на извънгабаритния', t2.indexOf('СТОКА ОТ ИЗВЪНГАБАРИТЕН') < 0);
  }

  section('д) Обектът: груповото отмятане важи и за извънгабаритния');
  {
    const items = [
      item({ id: 'B1', position: 1, kind: 'oversize', pallet_no: 1, pallet_total: 1, purchase_doc: 'ИЗХ-200',
             warehouse_comment: 'стелажи' }),
      item({ id: 'B2', position: 2, kind: 'oversize', pallet_no: 1, pallet_total: 1, purchase_doc: 'ИЗХ-201',
             warehouse_comment: 'стелажи' })
    ];
    const h = env(STORE, items, []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    const grp = h.doc.querySelector('#mod-loading tr[data-pallet-group="1"]');
    if (ok('групов ред за извънгабаритния', !!grp, mod(h).innerHTML.slice(0, 300))) {
      ok('бутонът казва „целият извънгабаритен"', /Целият извънгабаритен/.test(grp.textContent), grp.textContent);
      const b = btn(grp, 'Целият извънгабаритен');
      ok('и носи вида в data-k', b.getAttribute('data-k') === 'oversize', b.getAttribute('data-k'));
      realClick(h.w, b);
      await ticks(); await ticks(); await ticks();
      const ip = h.calls.patch.filter(p => p.table === 'loading_list_items');
      ok('и двата реда са отметнати', ip.length === 2, JSON.stringify(ip.map(p => p.url)));
      ok('с received:true', ip.every(p => p.body.received === true));
    }
  }

  section('е) Извънгабаритен БЕЗ описание не се записва');
  {
    const h = env(WAREHOUSE, []);
    h.w.llNewList();
    await ticks(); await ticks();
    /* Един ред, започнат докрай — обект и вид — но без описание. */
    h.w.llSetRowField(0, 'kind', 'oversize');
    h.w.llSetRowField(0, 'store_name', 'Петрич');
    h.w.llSetRowField(0, 'purchase_doc', 'ИЗХ-900');
    h.w.renderLoadingLists();

    const lbl = mod(h).textContent;
    ok('полето носи заглавие „Какъв е товарът"', lbl.indexOf('Какъв е товарът') >= 0,
      lbl.slice(0, 400));
    const inp = h.doc.getElementById('ll-wc-0');
    if (ok('полето го има', !!inp)) {
      ok('с подсказка за примери',
        (inp.getAttribute('placeholder') || '').indexOf('стелажи') >= 0,
        inp.getAttribute('placeholder'));
      ok('и с червена рамка, докато е празно',
        /#fca5a5/.test(inp.getAttribute('style') || ''), inp.getAttribute('style'));
    }

    h.w.llSaveDraft();
    await ticks(); await ticks();
    ok('НУЛА записи изобщо', h.calls.post.length === 0 && h.calls.patch.length === 0,
      JSON.stringify(h.calls.post.map(p => p.table).concat(h.calls.patch.map(p => p.table))));
    ok('червен toast с обяснение',
      h.toasts.some(t => /Извънгабаритният ред иска описание/.test(String(t.msg)) && t.col === '#dc2626'),
      JSON.stringify(h.toasts));
    ok('фокусът отива в полето', h.doc.activeElement === h.doc.getElementById('ll-wc-0'),
      h.doc.activeElement && h.doc.activeElement.id);

    /* Само празни места не са описание. */
    h.w.llSetRowField(0, 'warehouse_comment', '   ');
    h.w.llSaveDraft();
    await ticks();
    ok('само празни места пак не минават', h.calls.post.length === 0,
      JSON.stringify(h.calls.post.map(p => p.table)));

    /* А палетът без коментар минава — изискването е САМО за извънгабаритния. */
    const h2 = env(WAREHOUSE, []);
    h2.w.llNewList();
    await ticks(); await ticks();
    h2.w.llSetRowField(0, 'kind', 'pallet');
    h2.w.llSetRowField(0, 'store_name', 'Петрич');
    h2.w.llSetRowField(0, 'purchase_doc', 'ИЗХ-901');
    h2.w.llSaveDraft();
    await ticks(); await ticks();
    ok('КОНТРОЛА: палет без коментар СЕ записва',
      h2.calls.post.some(p => p.table === 'loading_lists'),
      JSON.stringify(h2.calls.post.map(p => p.table)));
    ok('и полето при палета няма заглавие „Какъв е товарът"',
      mod(h2).textContent.indexOf('Какъв е товарът') < 0, mod(h2).textContent.slice(0, 300));
  }

  section('ж) С описание — записва се и описанието стига до обекта');
  {
    const h = env(WAREHOUSE, []);
    h.w.llNewList();
    await ticks(); await ticks();
    h.w.llSetRowField(0, 'kind', 'oversize');
    h.w.llSetRowField(0, 'store_name', 'Петрич');
    h.w.llSetRowField(0, 'purchase_doc', 'ИЗХ-900');
    h.w.llSetRowField(0, 'warehouse_comment', '  стелажи 2 м  ');
    h.w.renderLoadingLists();
    const inp = h.doc.getElementById('ll-wc-0');
    ok('рамката вече не е червена', !/#fca5a5/.test(inp.getAttribute('style') || ''),
      inp.getAttribute('style'));

    h.w.llSaveDraft();
    await ticks(); await ticks(); await ticks();
    ok('листът се записва', h.calls.post.some(p => p.table === 'loading_lists'),
      JSON.stringify(h.calls.post.map(p => p.table)));
    const rows = h.calls.post.filter(p => p.table === 'loading_list_items');
    if (ok('редовете също', rows.length === 1, JSON.stringify(h.calls.post.map(p => p.table)))) {
      const b = Array.isArray(rows[0].body) ? rows[0].body[0] : rows[0].body;
      ok('видът е oversize', b.kind === 'oversize', JSON.stringify(b.kind));
      ok('описанието е записано', String(b.warehouse_comment).indexOf('стелажи 2 м') >= 0,
        JSON.stringify(b.warehouse_comment));
    }
  }

  section('з) Описанието е ДО ВИДА — печат, PDF и писмо');
  {
    const items = [
      item({ id: 'A', position: 1, kind: 'oversize', pallet_no: 1, pallet_total: 1,
             purchase_doc: 'ИЗХ-200', warehouse_comment: 'стелажи 2 метра' }),
      item({ id: 'B', position: 2, kind: 'pallet', pallet_no: 1, pallet_total: 1,
             purchase_doc: 'ИЗХ-100', warehouse_comment: 'кашон отгоре' })
    ];
    const h = env(WAREHOUSE, items, []);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    /* ПЕЧАТ: описанието стои в клетката на вида, не само в колоната за бележки. */
    h.w.llPrint('L1');
    const kindCell = Array.from(pr(h).querySelectorAll('td.lp-kind'))
      .find(td => /извънгабаритен/.test(td.textContent)) || null;
    if (ok('печатът има клетка за вида на извънгабаритния', !!kindCell,
      pr(h).textContent.slice(0, 300))) {
      ok('и описанието е ВЪТРЕ в нея',
        kindCell.textContent.indexOf('стелажи 2 метра') >= 0, kindCell.textContent);
    }
    const palletCell = Array.from(pr(h).querySelectorAll('td.lp-kind'))
      .find(td => /палет/.test(td.textContent)) || null;
    ok('при палета коментарът НЕ се дублира в клетката на вида',
      !!palletCell && palletCell.textContent.indexOf('кашон отгоре') < 0,
      palletCell && palletCell.textContent);

    /* ПИСМОТО при изпращане. */
    const html = h.w.llSentHtmlFor(LIST, 'Петрич', items);
    const idxKind = html.indexOf('извънгабаритен 1 от 1');
    const idxDesc = html.indexOf('стелажи 2 метра');
    ok('писмото носи описанието', idxDesc >= 0, html.slice(0, 200));
    ok('и то веднага след вида, преди изходящия номер',
      idxKind >= 0 && idxDesc > idxKind && idxDesc < html.indexOf('ИЗХ-200'),
      idxKind + ' / ' + idxDesc + ' / ' + html.indexOf('ИЗХ-200'));

    /* ПИСМОТО при приключване. */
    const closed = h.w.llClosedHtmlFor(LIST, items);
    const cKind = closed.indexOf('извънгабаритен 1 от 1');
    const cDesc = closed.indexOf('стелажи 2 метра');
    ok('и писмото при приключване също', cDesc >= 0 && cKind >= 0 && cDesc > cKind,
      cKind + ' / ' + cDesc);

    /* PDF: генераторът иска мрежа, затова се проверява РЕДЪТ, който той строи —
       същият низ, който влиза в line(). */
    const src = fs.readFileSync(path.join(ROOT, 'loading.js'), 'utf8');
    ok('PDF-ът слага описанието на реда на вида',
      src.indexOf("(llIsOversize(it.kind) && it.warehouse_comment ? ' — ' + it.warehouse_comment : '')") >= 0);
    ok('и НЕ го повтаря на отделен ред',
      src.indexOf("if(it.warehouse_comment && !llIsOversize(it.kind)) line('    коментар склад: '") >= 0);
  }

  section('и) Схемата в репото знае новата стойност и не помни старата');
  {
    const mig = fs.readFileSync(path.join(ROOT,
      'supabase/migrations/20260923090000_loading_kind_oversize.sql'), 'utf8');
    ok('миграцията задава новия CHECK',
      /check \(kind in \('pallet', 'oversize', 'roll', 'bulk'\)\)/.test(mig), mig.slice(0, 200));
    ok('и преименува заварените редове ПРЕДИ това',
      mig.indexOf("set kind = 'oversize'") >= 0 &&
      mig.indexOf("set kind = 'oversize'") < mig.indexOf('add constraint'), mig.slice(0, 400));
    const down = fs.readFileSync(path.join(ROOT,
      'supabase/migrations/20260923090000_loading_kind_oversize_down.sql'), 'utf8');
    ok('откатът връща roll_container', /roll_container/.test(down));
    ok('и предупреждава, че връща и СТОЙНОСТИТЕ', /ГЪРМИ|преименува/.test(down));
    const mirror = fs.readFileSync(path.join(ROOT, 'loading-list-kind-oversize-schema.sql'), 'utf8');
    ok('огледалният файл в корена също', /'oversize'/.test(mirror));
    ok('старият огледален файл го няма',
      !fs.existsSync(path.join(ROOT, 'loading-list-kind-roll-container-schema.sql')));

    /* И в целия loading.js — нито едно попадение на стария ключ. */
    const src = fs.readFileSync(path.join(ROOT, 'loading.js'), 'utf8');
    ok('loading.js не помни roll_container', src.indexOf('roll_container') < 0);
  }

  report();
})();
