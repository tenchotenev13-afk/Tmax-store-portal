/* Сигнал към логистичния склад за възможна РАЗМЯНА на артикул при експедиция.

   Един и същ SAP код в междускладови бланки от ДВА разни магазина към същия
   склад: най-вероятно пратките са разменени и липсата на единия обект е
   излишъкът на другия. Смята се изцяло в браузъра от sdData + diffReports -
   нова колона няма, заявка няма.

   Данните тук са СИНТЕТИЧНИ нарочно: към 03.09.2026 в базата няма такъв
   случай сред 53-те реда (38 undelivered, 12 excess, 3 без категория).
   Тестът описва поведението, което трябва да сработи при първия реален.

   Пускане:  node tests/interstore-swap-signal.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard } = H;

const WH_TG = 'Логистичен склад Търговище';
const WH_DB = 'Логистичен склад Добрич';

function rep(o) {
  return Object.assign({
    id: 'rep-x', direction: 'interstore', store_name: 'Петрич',
    counterpart: WH_TG, document_number: '1804911', doc_date: '2026-08-30',
    submitted_by: 'Управител', general_comment: '', photos: [],
    reviewed: false, created_at: '2026-08-30T09:00:00.000Z'
  }, o);
}
function line(o) {
  return Object.assign({
    id: 'l-x', report_id: 'rep-x', store_name: 'Петрич', supplier: null,
    material_code: '000123', material_name: 'ЩУЦЕР МЕТАЛЕН',
    quantity: 4, quantity_received: 0, quantity_supplier_doc: null,
    order_number: null, confirmed_date: null, comment: null,
    resolution_comment: null, attachments: [], credit_note_issued: false,
    difference_category: 'undelivered', unit: 'бр.', status: 'new', type: null,
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null,
    store_corrected_at: null, warehouse_response: null, warehouse_comment: null,
    created_at: '2026-08-30T09:00:00.000Z'
  }, o);
}

/* Двете страни на класическия случай: Петрич не е получил артикула,
   Гоце Делчев е получил артикул в повече — два дни разлика. */
const REP_PETRICH = rep({ id: 'rep-p', store_name: 'Петрич' });
const REP_GOTSE = rep({ id: 'rep-g', store_name: 'Гоце Делчев',
  created_at: '2026-09-01T09:00:00.000Z' });

const L_PETRICH = line({ id: 'l-p', report_id: 'rep-p', store_name: 'Петрич',
  material_code: '000123', difference_category: 'undelivered', quantity: 4,
  created_at: '2026-08-30T09:00:00.000Z' });
/* Същият артикул, но кодът е записан БЕЗ водещите нули — точно това ражда
   пропуснатия сигнал, ако кодовете се сравняват "както са въведени". */
const L_GOTSE = line({ id: 'l-g', report_id: 'rep-g', store_name: 'Гоце Делчев',
  material_code: '123', difference_category: 'excess', quantity: 4,
  created_at: '2026-09-01T09:00:00.000Z' });

const WAREHOUSE = {
  email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
  role: 'sklad', store_name: WH_TG, assigned_stores: []
};
const STORE = {
  email: 'petrich@temax.bg', display_name: 'Управител Петрич',
  role: 'manager', store_name: 'Петрич', assigned_stores: []
};

function env(user, lines, reports) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user, confirm: true,
    data: {
      stock_differences: lines, differences_reports: reports,
      stock_returns: [], transport_orders: [], users: [],
      stores: [{ name: 'Петрич' }, { name: 'Гоце Делчев' }], contacts: []
    }
  });
  h.w.sdData = JSON.parse(JSON.stringify(lines));
  h.w.diffReports = JSON.parse(JSON.stringify(reports));
  h.w.transportOrders = [];
  h.w.sdFilter = 'pending'; h.w.sdTypeFilter = 'all';
  h.w.sdStoreFilter = ''; h.w.sdSearch = ''; h.w.sdDirTab = 'interstore';
  h.w.invalidateStoreCaches(); h.w.invalidateSuppliersCache();
  return h;
}

/* Баджът се търси по СОБСТВЕНИЯ си маркер (data-swap), не по текста на
   артикула: името "ЩУЦЕР МЕТАЛЕН" стои в клетката при всички сценарии и
   проверка по него би минавала винаги. */
function badges(doc, kind) {
  const sel = kind ? '[data-swap="' + kind + '"]' : '[data-swap]';
  return doc.querySelectorAll('#mod-stock-diff ' + sel);
}
function badgeIn(doc, lineId, kind) {
  /* Клетката на артикула е втората в реда; търсим я през самия бадж, за да
     не зависи тестът от подредбата на колоните. */
  const all = badges(doc, kind);
  for (let i = 0; i < all.length; i++) {
    const tr = all[i].closest('tr');
    if (tr && tr.textContent.indexOf(lineId) >= 0) return all[i];
  }
  return null;
}

(async function () {

  section('a) Складът вижда кехлибарен бадж на ДВАТА реда, всеки сочи другия');
  {
    const h = env(WAREHOUSE, [L_PETRICH, L_GOTSE], [REP_PETRICH, REP_GOTSE]);
    /* Нормализацията изрично: 000123 срещу 123 — двата кода се намират. */
    const cP = h.w.sdSwapCandidates(h.w.sdData[0]);
    const cG = h.w.sdSwapCandidates(h.w.sdData[1]);
    if (ok('"000123" намира реда с код "123"', cP.length === 1, JSON.stringify(cP.length))) {
      ok('кандидатът е от другия магазин', cP[0].store_name === 'Гоце Делчев', cP[0].store_name);
      ok('и е маркиран като обратна двойка', cP[0].opposite === true, String(cP[0].opposite));
    }
    if (ok('и обратно — "123" намира "000123"', cG.length === 1, JSON.stringify(cG.length))) {
      ok('кандидатът е Петрич', cG[0].store_name === 'Петрич', cG[0].store_name);
      ok('opposite и от тази страна', cG[0].opposite === true, String(cG[0].opposite));
    }
    ok('флагът НЕ е седнал върху самия ред в sdData',
      h.w.sdData[1].opposite === undefined, JSON.stringify(h.w.sdData[1].opposite));

    if (guard('renderStockDiff() не хвърля', () => h.w.renderStockDiff())) {
      ok('два кехлибарени баджа', badges(h.doc, 'opposite').length === 2,
        String(badges(h.doc, 'opposite').length));
      ok('нито един сив', badges(h.doc, 'same').length === 0);
      const bP = badgeIn(h.doc, 'ЩУЦЕР', 'opposite');
      if (ok('баджът е в реда с артикула', !!bP)) {
        const txt = Array.prototype.map.call(badges(h.doc, 'opposite'), b => b.textContent).join(' || ');
        ok('текстът казва "Възможна размяна"', /⚠️ Възможна размяна:/.test(txt), txt);
        ok('единият сочи Гоце Делчев', /Гоце Делчев/.test(txt), txt);
        ok('другият сочи Петрич', /Петрич/.test(txt), txt);
        ok('носи категорията на другия ред', /Излишък/.test(txt) && /липса/.test(txt), txt);
        ok('носи количество', /4 бр\./.test(txt), txt);
        ok('носи дата в български формат', /01\.09\.2026|30\.08\.2026/.test(txt), txt);
        ok('има обяснение в title',
          /разменени/.test(bP.getAttribute('title') || ''), bP.getAttribute('title'));
      }
    }
  }

  section('b) Магазинът НЕ вижда сигнала — това е инструмент на склада');
  {
    const h = env(STORE, [L_PETRICH, L_GOTSE], [REP_PETRICH, REP_GOTSE]);
    h.w.renderStockDiff();
    ok('нула баджа', badges(h.doc).length === 0, String(badges(h.doc).length));
    ok('sdSwapBadge() връща празно', h.w.sdSwapBadge(h.w.sdData[0]) === '',
      JSON.stringify(h.w.sdSwapBadge(h.w.sdData[0])));
    ok('но кандидатите се смятат същите (правата са само в баджа)',
      h.w.sdSwapCandidates(h.w.sdData[0]).length === 1,
      String(h.w.sdSwapCandidates(h.w.sdData[0]).length));
  }

  section('c) Еднакви категории — сив бадж, не кехлибарен');
  {
    const h = env(WAREHOUSE,
      [L_PETRICH, line({ id: 'l-g', report_id: 'rep-g', store_name: 'Гоце Делчев',
        material_code: '123', difference_category: 'undelivered',
        created_at: '2026-09-01T09:00:00.000Z' })],
      [REP_PETRICH, REP_GOTSE]);
    ok('кандидатът НЕ е opposite', h.w.sdSwapCandidates(h.w.sdData[0])[0].opposite === false,
      String(h.w.sdSwapCandidates(h.w.sdData[0])[0].opposite));
    h.w.renderStockDiff();
    ok('нула кехлибарени', badges(h.doc, 'opposite').length === 0,
      String(badges(h.doc, 'opposite').length));
    ok('два сиви', badges(h.doc, 'same').length === 2, String(badges(h.doc, 'same').length));
    const txt = badges(h.doc, 'same')[0].textContent;
    ok('текстът е "Същият артикул и в:"', /ℹ️ Същият артикул и в:/.test(txt), txt);
    ok('и НЕ обещава размяна', !/Възможна размяна/.test(txt), txt);
  }

  section('d) Различен counterpart — двата склада не се смесват');
  {
    const h = env(WAREHOUSE, [L_PETRICH, L_GOTSE],
      [REP_PETRICH, rep({ id: 'rep-g', store_name: 'Гоце Делчев', counterpart: WH_DB,
        created_at: '2026-09-01T09:00:00.000Z' })]);
    ok('нула кандидати', h.w.sdSwapCandidates(h.w.sdData[0]).length === 0,
      JSON.stringify(h.w.sdSwapCandidates(h.w.sdData[0])));
    h.w.renderStockDiff();
    ok('нула баджа', badges(h.doc).length === 0, String(badges(h.doc).length));
  }

  section('e) Единият ред вече е потвърден — сигнал няма на никого');
  {
    const h = env(WAREHOUSE,
      [L_PETRICH, line({ id: 'l-g', report_id: 'rep-g', store_name: 'Гоце Делчев',
        material_code: '123', difference_category: 'excess', status: 'received',
        created_at: '2026-09-01T09:00:00.000Z' })],
      [REP_PETRICH, REP_GOTSE]);
    ok('непотвърденият ред не намира потвърдения',
      h.w.sdSwapCandidates(h.w.sdData[0]).length === 0,
      JSON.stringify(h.w.sdSwapCandidates(h.w.sdData[0])));
    ok('и потвърденият не намира никого',
      h.w.sdSwapCandidates(h.w.sdData[1]).length === 0,
      JSON.stringify(h.w.sdSwapCandidates(h.w.sdData[1])));
    h.w.renderStockDiff();
    ok('нула баджа', badges(h.doc).length === 0, String(badges(h.doc).length));
  }

  section('f) Прозорецът от 14 дни — точно на границата и един ден отвъд');
  {
    const at = d => line({ id: 'l-g', report_id: 'rep-g', store_name: 'Гоце Делчев',
      material_code: '123', difference_category: 'excess', created_at: d });
    const h15 = env(WAREHOUSE, [L_PETRICH, at('2026-09-14T09:00:00.000Z')],
      [REP_PETRICH, REP_GOTSE]);
    ok('15 дни — нула кандидати', h15.w.sdSwapCandidates(h15.w.sdData[0]).length === 0,
      String(h15.w.sdSwapCandidates(h15.w.sdData[0]).length));
    h15.w.renderStockDiff();
    ok('и нула баджа', badges(h15.doc).length === 0, String(badges(h15.doc).length));

    const h14 = env(WAREHOUSE, [L_PETRICH, at('2026-09-13T09:00:00.000Z')],
      [REP_PETRICH, REP_GOTSE]);
    ok('точно 14 дни — кандидатът е вътре',
      h14.w.sdSwapCandidates(h14.w.sdData[0]).length === 1,
      String(h14.w.sdSwapCandidates(h14.w.sdData[0]).length));
    h14.w.renderStockDiff();
    ok('и баджът се показва', badges(h14.doc, 'opposite').length === 2,
      String(badges(h14.doc, 'opposite').length));
  }

  section('g) Два реда със същия код в ЕДИН магазин — не е размяна');
  {
    const h = env(WAREHOUSE,
      [L_PETRICH, line({ id: 'l-p2', report_id: 'rep-p', store_name: 'Петрич',
        material_code: '123', difference_category: 'excess',
        created_at: '2026-08-31T09:00:00.000Z' })],
      [REP_PETRICH]);
    ok('нула кандидати', h.w.sdSwapCandidates(h.w.sdData[0]).length === 0,
      JSON.stringify(h.w.sdSwapCandidates(h.w.sdData[0])));
    h.w.renderStockDiff();
    ok('нула баджа', badges(h.doc).length === 0, String(badges(h.doc).length));
  }

  section('h) Празен / липсващ SAP код — не гърми и не свързва наслуки');
  {
    const cases = [['празен низ', ''], ['null', null], ['само интервали', '   '],
                   ['само нули', '000']];
    cases.forEach(function (c) {
      const h = env(WAREHOUSE,
        [line({ id: 'l-p', report_id: 'rep-p', material_code: c[1] }),
         line({ id: 'l-g', report_id: 'rep-g', store_name: 'Гоце Делчев',
           material_code: c[1], difference_category: 'excess',
           created_at: '2026-09-01T09:00:00.000Z' })],
        [REP_PETRICH, REP_GOTSE]);
      let cands = null;
      const clean = guard('sdSwapCandidates() не хвърля при ' + c[0],
        () => { cands = h.w.sdSwapCandidates(h.w.sdData[0]); });
      if (clean) ok('нула кандидати при ' + c[0], cands.length === 0, JSON.stringify(cands));
      if (guard('renderStockDiff() не хвърля при ' + c[0], () => h.w.renderStockDiff())) {
        ok('нула баджа при ' + c[0], badges(h.doc).length === 0, String(badges(h.doc).length));
      }
    });
    /* Ред без created_at — прозорецът е непроверим, не гадаем. */
    const hn = env(WAREHOUSE,
      [line({ id: 'l-p', report_id: 'rep-p', created_at: null }), L_GOTSE],
      [REP_PETRICH, REP_GOTSE]);
    ok('ред без created_at не дава кандидати',
      hn.w.sdSwapCandidates(hn.w.sdData[0]).length === 0,
      JSON.stringify(hn.w.sdSwapCandidates(hn.w.sdData[0])));
  }

  section('i) Доставковата посока не участва изобщо');
  {
    const h = env(WAREHOUSE,
      [line({ id: 'l-p', report_id: 'rep-p' }),
       line({ id: 'l-g', report_id: 'rep-g', store_name: 'Гоце Делчев',
         material_code: '123', difference_category: 'excess',
         created_at: '2026-09-01T09:00:00.000Z' })],
      [rep({ id: 'rep-p', direction: 'supplier', counterpart: 'ТЕСИ ООД' }),
       rep({ id: 'rep-g', store_name: 'Гоце Делчев', direction: 'supplier',
         counterpart: 'ТЕСИ ООД', created_at: '2026-09-01T09:00:00.000Z' })]);
    ok('нула кандидати за supplier ред',
      h.w.sdSwapCandidates(h.w.sdData[0]).length === 0,
      JSON.stringify(h.w.sdSwapCandidates(h.w.sdData[0])));
  }

  report();
})();
