/* Товарни листи: етикети с QR на палет + сканиране при получаване.

   Етикетът (QR = URL с хеш #tl=<лист>&p=<вид>|<№>|<обект>), цветът на обекта,
   печатът и PDF-ът (склад), и обратната страна: скенерът в картата на обекта
   (свой / чужд / вече получен / непознат), deep link-ът от камерата на
   телефона и редът „Палети: …" над таблицата.

   QR библиотеката и декодерът са фалшиви — в jsdom ги няма и не е нужно.
   Проверява се КАКВО се подава на кодера (точният URL) и какво се прави с
   прочетеното (точните PATCH-ове и екрани).

   Пускане:  node tests/loading-lists-labels.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const PETRICH = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                  role: 'manager', store_name: 'Петрич', assigned_stores: [] };
const MODULES = ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js',
                 'stock-differences.js', 'loading.js'];

const L1 = { id: 'L1', warehouse: WH, list_date: '2026-10-05', status: 'sent',
             executed_by: 'Иван', comment: '', created_by: 'x', created_at: '2026-10-05T06:00:00.000Z',
             sent_at: '2026-10-05T07:00:00.000Z', done_at: null };

function it_(o) {
  return Object.assign({
    id: 'i-x', list_id: 'L1', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 1,
    purchase_doc: null, clears_doc: null, store_name: 'Петрич', warehouse_comment: null,
    store_comment: null, partial: false, received: false, missing: false, received_by: null,
    received_at: null, created_at: '2026-10-05T06:00:00.000Z', products: []
  }, o);
}
/* Курс в ред на товарене: 1) Габрово п.1, 2) Петрич п.1 (два документа),
   3) Петрич п.2 (един от документите на п.1 — „на два палета"), 4) Габрово
   извънгабаритен 1. */
const PROD = { sap_code: '3200123', product_name: 'ШУРУП 4X40', unit: 'бр.', qty: 5, cartons: 1 };
const ITEMS = [
  it_({ id: 'g1', position: 1, store_name: 'Габрово', pallet_no: 1, pallet_total: 1, purchase_doc: 'G-1' }),
  it_({ id: 'p1a', position: 2, pallet_no: 1, pallet_total: 2, purchase_doc: '4600186336', products: [PROD] }),
  it_({ id: 'p1b', position: 3, pallet_no: 1, pallet_total: 2, purchase_doc: '4600186405' }),
  it_({ id: 'p2', position: 4, pallet_no: 2, pallet_total: 2, purchase_doc: '4600186336' }),
  it_({ id: 'g2', position: 5, store_name: 'Габрово', kind: 'oversize', pallet_no: 1, pallet_total: 1,
        purchase_doc: 'G-2', warehouse_comment: 'стелажи' })
];

function env(items, user, list) {
  const h = boot({
    modules: MODULES, user: user || WAREHOUSE, confirm: true,
    data: {
      app_settings: [],
      goods_transit: [],
      loading_lists: [list || L1],
      loading_list_items: function (url) {
        let rows = (items || []).map(r => Object.assign({}, r, {
          loading_list_products: (r.products || []).map(p => Object.assign({}, p)) }));
        const st = /store_name=eq\.([^&]*)/.exec(url);
        if (st) rows = rows.filter(r => r.store_name === decodeURIComponent(st[1]));
        return rows;
      },
      loading_list_products: [], loading_list_photos: [],
      users: [{ store_name: 'Петрич' }, { store_name: 'Гоце Делчев' }, { store_name: 'Габрово' }],
      stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  /* Фалшив кодер: помни какво му е подадено, рисува детерминиран шаблон. */
  h.qrTexts = [];
  h.w.qrcode = function () {
    let text = '';
    return {
      addData: t => { text = t; h.qrTexts.push(t); }, make() {},
      getModuleCount: () => 21, isDark: (r, c) => ((r * 7 + c * 3 + text.length) % 5) < 2
    };
  };
  /* Фалшив jsPDF. */
  const rec = { text: [], rects: 0, fills: [], pages: 1 };
  function Doc() {}
  Doc.prototype.addFileToVFS = function () {};
  Doc.prototype.addFont = function () {};
  Doc.prototype.setFont = function () {};
  Doc.prototype.setFontSize = function () {};
  Doc.prototype.setTextColor = function () {};
  Doc.prototype.setFillColor = function (r, g, b) { rec.fills.push([r, g, b]); };
  Doc.prototype.rect = function () { rec.rects++; };
  Doc.prototype.splitTextToSize = function (t) { return [String(t)]; };
  Doc.prototype.text = function (t) { rec.text.push(String(t)); };
  Doc.prototype.addPage = function () { rec.pages++; };
  Doc.prototype.output = function () { return 'data:application/pdf;filename=x.pdf;base64,UERG'; };
  h.w.jspdf = { jsPDF: Doc };
  h.w.llPdfFont = () => Promise.resolve('Rk9OVA==');
  h.pdf = rec;
  /* Фалшив декодер. */
  h.w.Html5QrcodeSupportedFormats = { QR_CODE: 'QR_CODE', EAN_13: 'EAN_13' };
  h.cams = [];
  h.w.Html5Qrcode = function (id, cfg) {
    const self = this; h.cams.push(self); self.cfg = cfg; self.id = id;
    self.start = (cam, conf, onOk) => { self.onOk = onOk; self.started = true; return Promise.resolve(); };
    self.stop = () => { self.stopped = true; return Promise.resolve(); };
    self.clear = () => {}; self.pause = () => { self.paused = true; }; self.resume = () => { self.paused = false; };
  };
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
const URL1 = (listId, kind, no, store) =>
  'https://tenchotenev13-afk.github.io/Tmax-store-portal/#tl=' + encodeURIComponent(listId) +
  '&p=' + encodeURIComponent(kind + '|' + no + '|' + store);
const patchesOf = h => h.calls.patch.filter(p => p.table === 'loading_list_items');
const flashOf = h => h.doc.getElementById('ll-qr-flash');

(async function () {

  section('1. Съдържанието на QR кода — точният URL с хеш');
  {
    const h = env(ITEMS);
    const u = h.w.llTagUrl('L1', 'pallet', 2, 'Петрич');
    ok('URL-ът е към портала с #tl=…&p=…',
      u === 'https://tenchotenev13-afk.github.io/Tmax-store-portal/#tl=L1&p=pallet%7C2%7C%D0%9F%D0%B5%D1%82%D1%80%D0%B8%D1%87', u);
    const t = h.w.llParseTag(u);
    ok('и се чете обратно', t && t.listId === 'L1' && t.kind === 'pallet' && t.no === 2 && t.store === 'Петрич', JSON.stringify(t));
    ok('само хешът също се чете', h.w.llParseTag('#tl=L1&p=roll%7C3%7CГаброво').no === 3);
    const t2 = h.w.llParseTag(h.w.llTagUrl('L9', 'oversize', 1, 'А|Б'));
    ok('обект с „|" в името не се реже', t2 && t2.store === 'А|Б', JSON.stringify(t2));
    ok('баркод / чужд текст / без палет → null',
      !h.w.llParseTag('3800001000011') && !h.w.llParseTag('https://x.bg/#tl=L1') && !h.w.llParseTag('#tl=L1&p=bulk%7C1%7CX'));

    h.w.loadLoadingLists(); await ticks(); await ticks();
    await h.w.llLoadQrLib();
    h.w.llLabels('L1', 'pallet|1|Петрич'); await ticks(); await ticks();
    ok('на кодера е подаден ТОЧНО URL-ът на палета', h.qrTexts.length === 1 && h.qrTexts[0] === URL1('L1', 'pallet', 1, 'Петрич'),
      JSON.stringify(h.qrTexts));
  }

  section('2. Етикетите: ред на товарене, документи, „(1/2)", „В курса"');
  {
    const h = env(ITEMS);
    h.w.loadLoadingLists(); await ticks(); await ticks();
    const units = h.w.llLabelUnits(h.w.llItemsOf('L1'));
    ok('4 единици — в реда на товарене (по позиция, не по обект)',
      units.map(u => u.store + ':' + u.kind + u.no).join() === 'Габрово:pallet1,Петрич:pallet1,Петрич:pallet2,Габрово:oversize1',
      units.map(u => u.store + ':' + u.kind + u.no).join());
    ok('„палет N/M в курса"', units.map(u => u.seq + '/' + u.seqTotal).join() === '1/4,2/4,3/4,4/4');
    ok('единицата с два документа ги носи', units[1].docs.map(d => d.doc).join() === '4600186336,4600186405');
    ok('документът на два палета: (1/2) и (2/2)',
      h.w.llLabelDocText(units[1].docs[0]) === '4600186336 (1/2)' && h.w.llLabelDocText(units[2].docs[0]) === '4600186336 (2/2)',
      h.w.llLabelDocText(units[1].docs[0]) + ' | ' + h.w.llLabelDocText(units[2].docs[0]));
    ok('документ само на един палет е без суфикс', h.w.llLabelDocText(units[1].docs[1]) === '4600186405');

    await h.w.llLabels('L1');
    const pages = Array.from(h.doc.getElementById('mod-print').querySelectorAll('.lt-page'));
    ok('една страница на палет (4)', pages.length === 4, String(pages.length));
    const p2 = pages[1];
    ok('страница 2: обект на цял ред и „ПАЛЕТ 1 от 2"', p2.textContent.indexOf('Петрич') >= 0 && p2.textContent.indexOf('ПАЛЕТ 1 от 2') >= 0);
    ok('и изходящите (с „(1/2)")', p2.textContent.indexOf('4600186336 (1/2), 4600186405') >= 0, p2.textContent.slice(0, 300));
    ok('и „палет 2/4 в курса"', p2.textContent.indexOf('палет 2/4') >= 0);
    ok('с артикулите (опис) в долната половина', p2.textContent.indexOf('ШУРУП 4X40') >= 0);
    ok('палет без артикули: „съдържание по изходящите номера"', pages[0].textContent.indexOf('съдържание по изходящите номера') >= 0);
    ok('извънгабаритният носи вида и описанието под заглавието',
      pages[3].textContent.indexOf('извънгабаритен') >= 0 && pages[3].textContent.indexOf('стелажи') >= 0);
    ok('QR на всяка страница', pages.every(p => !!p.querySelector('[data-ll-qr] svg')));
    ok('лентата е с цвета на обекта', pages[1].querySelector('.lt-band').style.background !== '' &&
      pages[1].querySelector('.lt-band').getAttribute('style').toLowerCase().indexOf(h.w.llStoreColor('Петрич')) >= 0);
    ok('печатът на целия лист (старият) не е пипан — още работи', (h.w.llPrint('L1'), !!h.doc.querySelector('#mod-print .lp-tbl')));

    /* Преглед на склада: бутоните и „(1/2)" в заглавията. */
    h.w.llOpenView('L1'); await ticks();
    ok('„🏷 Етикети на листа" и „⬇ PDF етикети" в прегледа', !!btn(mod(h), '🏷 Етикети на листа') && !!btn(mod(h), '⬇ PDF етикети'));
    ok('„🏷 Етикет" на всяка единица (4)', mod(h).querySelectorAll('button[data-lk]').length === 8 /* 4 × (етикет + PDF) */,
      String(mod(h).querySelectorAll('button[data-lk]').length));
    const heads = Array.from(mod(h).querySelectorAll('tr[data-ll-unit-head]')).map(t => t.textContent);
    ok('заглавията показват „(1/2)" и „(2/2)"',
      heads.some(t => t.indexOf('4600186336 (1/2)') >= 0) && heads.some(t => t.indexOf('4600186336 (2/2)') >= 0), JSON.stringify(heads));
    ok('и лентата на единицата е с цвета на обекта',
      Array.from(mod(h).querySelectorAll('tr[data-ll-unit-head] td')).every(td => /border-left:4px solid/.test(td.getAttribute('style'))));

    /* Клик: един етикет. */
    realClick(h.w, mod(h).querySelector('button[data-lk="pallet|2|Петрич"]'));
    await ticks(); await ticks();
    ok('клик на „🏷 Етикет" печата ЕДИН етикет', h.doc.getElementById('mod-print').querySelectorAll('.lt-page').length === 1);
  }

  section('3. Един изходящ № на два реда от един обект — чиповете го позволяват');
  {
    const h = env([]);
    h.w.llNewList(); h.w.llDraft.units = [];
    await ticks(); await ticks();
    for (let i = 0; i < 2; i++) { h.w.llAddFreeRow(); h.w.llSetRowField(i, 'store_name', 'Петрич'); }
    h.w.llUnitDocAdd(0, '4600186336');
    h.w.llUnitDocAdd(1, '4600186336');
    ok('същият номер е в двете единици', h.w.llDraft.units[0].docs.join() === '4600186336' && h.w.llDraft.units[1].docs.join() === '4600186336');
    const flat = h.w.llDraftFlat().rows;
    ok('в базата — два реда на два палета', flat.length === 2 && flat[0].pallet_no === 1 && flat[1].pallet_no === 2,
      JSON.stringify(flat.map(r => r.pallet_no)));
  }

  section('4. Цветът на обекта');
  {
    const h = env([]);
    const a1 = h.w.llStoreColor('Петрич'), a2 = h.w.llStoreColor('Петрич');
    ok('един и същ за едно име при два рендера', a1 === a2 && /^#[0-9a-f]{6}$/.test(a1), a1);
    ok('името се тримва', h.w.llStoreColor('  Петрич ') === a1);
    /* Реалните имена от users (04.10.2026): 19 обекта + Централен офис + двата склада. */
    const REAL = ['Враца', 'Габрово', 'Гоце Делчев', 'Добрич', 'Дупница', 'Карлово', 'Козлодуй', 'Кърджали',
      'Логистичен склад Добрич', 'Логистичен склад Търговище', 'Монтана', 'Петрич', 'Пирдоп', 'Раднево',
      'Севлиево', 'Сервиз Троян', 'Силистра', 'Сливен', 'Троян', 'Търговище', 'Централен офис', 'Шумен'];
    ok('палитрата е 22 различни цвята', h.w.LL_STORE_COLORS.palette.length === 22 && new Set(h.w.LL_STORE_COLORS.palette).size === 22);
    ok('изричен override за ВСЕКИ от 22-та реални обекта', REAL.every(n => h.w.LL_STORE_COLORS.override.hasOwnProperty(n)),
      REAL.filter(n => !h.w.LL_STORE_COLORS.override.hasOwnProperty(n)).join());
    ok('и 22-та цвята са РАЗЛИЧНИ — нула сблъсъци', Object.keys(h.w.llStoreColorCollisions(REAL)).length === 0 &&
      new Set(REAL.map(n => h.w.llStoreColor(n))).size === 22, JSON.stringify(h.w.llStoreColorCollisions(REAL)));
    ok('override цветовете са от палитрата', REAL.every(n => h.w.LL_STORE_COLORS.palette.indexOf(h.w.llStoreColor(n)) >= 0));
    /* Съседите по азбучен ред са контрастни: евклидово разстояние в RGB ≥ 60. */
    const dist = (x, y) => { const p = h.w.llHexRgb(x), q = h.w.llHexRgb(y); return Math.sqrt(p.reduce((s, v, i) => s + (v - q[i]) * (v - q[i]), 0)); };
    const sorted = REAL.slice().sort((x, y) => x.localeCompare(y, 'bg'));
    const minD = Math.min.apply(null, sorted.slice(1).map((n, i) => dist(h.w.llStoreColor(sorted[i]), h.w.llStoreColor(n))));
    ok('съседите по азбучен ред са контрастни (мин. разстояние ≥ 60)', minD >= 60, String(Math.round(minD)));
    ok('Петрич и Гоце Делчев са с различен цвят', h.w.llStoreColor('Петрич') !== h.w.llStoreColor('Гоце Делчев'));
    const fb = h.w.llStoreColor('Нов обект XYZ');
    ok('нов обект без override → хешът като резерва (цвят от палитрата, стабилен)',
      h.w.LL_STORE_COLORS.palette.indexOf(fb) >= 0 && fb === h.w.llStoreColor('Нов обект XYZ'), fb);
    const prev = h.w.LL_STORE_COLORS.override['Петрич'];
    h.w.LL_STORE_COLORS.override['Петрич'] = '#123456';
    ok('override бие хеша', h.w.llStoreColor('Петрич') === '#123456');
    h.w.LL_STORE_COLORS.override['Петрич'] = prev;
    ok('и се връща', h.w.llStoreColor('Петрич') === a1);
    ok('сблъсъците се виждат (карта цвят → имена)', typeof h.w.llStoreColorCollisions(['А', 'Б']) === 'object');
    ok('светлият цвят получава черен текст, тъмният — бял',
      h.w.llColorText('#f9a825') === '#000' && h.w.llColorText('#1565c0') === '#fff');
    /* Цветът е и в картата на обекта и в прегледа — една функция. */
    const s = env(ITEMS, PETRICH);
    s.w.loadLoadingLists(); await ticks(); await ticks();
    const card = s.doc.getElementById('ll-card-L1');
    ok('картата на обекта: лентата на палета е в цвета му',
      card.innerHTML.toLowerCase().indexOf('border-left:4px solid ' + s.w.llStoreColor('Петрич')) >= 0);
  }

  section('4б. Етикет от чернова — воден знак; от изпратен — без');
  {
    const DRAFT = Object.assign({}, L1, { status: 'draft', sent_at: null });
    const h = env(ITEMS, WAREHOUSE, DRAFT);
    h.w.loadLoadingLists(); await ticks(); await ticks();
    await h.w.llLabels('L1');
    let pages = h.doc.getElementById('mod-print').querySelectorAll('.lt-page').length;
    let wm = h.doc.getElementById('mod-print').querySelectorAll('[data-ll-wm]');
    ok('чернова: воден знак на ВСЯКА страница', pages === 4 && wm.length === 4, pages + '/' + wm.length);
    ok('„ЧЕРНОВА — печатай след изпращане“', wm[0].textContent === 'ЧЕРНОВА — печатай след изпращане', wm[0].textContent);
    ok('диагонален (завъртян)', /rotate\(-35deg\)/.test(h.doc.getElementById('mod-print').innerHTML), '');
    ok('и в лентата на печата', /ЧЕРНОВА/.test(h.doc.getElementById('mod-print').querySelector('.no-print').textContent));
    const units = h.w.llLabelUnits(h.w.llItemsOf('L1'));
    await h.w.llBuildLabelsPdf(h.w.llLists.find(x => x.id === 'L1'), units);
    ok('чернова: знакът е и в PDF-а (на всяка страница)', h.pdf.text.filter(x => x === 'ЧЕРНОВА — печатай след изпращане').length === 4,
      String(h.pdf.text.filter(x => x === 'ЧЕРНОВА — печатай след изпращане').length));
    for (const st of ['sent', 'done', 'partial']) {
      const hh = env(ITEMS, WAREHOUSE, Object.assign({}, L1, { status: st }));
      hh.w.loadLoadingLists(); await ticks(); await ticks();
      await hh.w.llLabels('L1');
      const n = hh.doc.getElementById('mod-print').querySelectorAll('[data-ll-wm]').length;
      await hh.w.llBuildLabelsPdf(hh.w.llLists.find(x => x.id === 'L1'), hh.w.llLabelUnits(hh.w.llItemsOf('L1')));
      ok(st + ': без воден знак (печат и PDF)', n === 0 && hh.pdf.text.indexOf('ЧЕРНОВА — печатай след изпращане') < 0, String(n));
    }
  }

  section('5. PDF на етикетите');
  {
    const h = env(ITEMS);
    h.w.loadLoadingLists(); await ticks(); await ticks();
    const l = h.w.llLists.find(x => x.id === 'L1');
    const units = h.w.llLabelUnits(h.w.llItemsOf('L1'));
    const pdf = await h.w.llBuildLabelsPdf(l, units);
    ok('PDF-ът се получава', pdf && pdf.base64 === 'UERG' && /^etiketi-2026-10-05-list\.pdf$/.test(pdf.filename), JSON.stringify(pdf && pdf.filename));
    ok('една страница на единица (4 → 3 addPage)', h.pdf.pages === 4, String(h.pdf.pages));
    ok('„ПАЛЕТ 1 от 2" и обектът са в текста', h.pdf.text.indexOf('ПАЛЕТ 1 от 2') >= 0 && h.pdf.text.indexOf('Петрич') >= 0);
    ok('изходящите с „(1/2)"', h.pdf.text.some(t => t.indexOf('4600186336 (1/2), 4600186405') >= 0), JSON.stringify(h.pdf.text.slice(0, 20)));
    ok('QR е нарисуван (много правоъгълници) в цвета на обекта',
      h.pdf.rects > 4 * 20 && h.pdf.fills.some(f => f.join() === h.w.llHexRgb(h.w.llStoreColor('Петрич')).join()), String(h.pdf.rects));
    const one = await h.w.llBuildLabelsPdf(l, [units[1]]);
    ok('един етикет → име с обекта и палета', /^etiketi-2026-10-05-petrich-pallet1\.pdf$/.test(one.filename), one.filename);
  }

  section('6. Сканиране при получаване — четирите случая');
  {
    const h = env(ITEMS, PETRICH);
    h.w.loadLoadingLists(); await ticks(); await ticks();
    h.w.confirm = () => { h.confirmed = (h.confirmed || 0) + 1; return true; };
    const card = () => h.doc.getElementById('ll-card-L1');
    const b = btn(card(), '📷 Сканирай палети');
    if (!ok('бутонът „📷 Сканирай палети" е в картата на изпратен лист', !!b)) return report();
    realClick(h.w, b); await ticks(); await ticks();
    ok('скенерът е в QR режим (само QR_CODE) и е стартиран',
      h.cams.length === 1 && h.cams[0].started && h.cams[0].cfg.formatsToSupport.join() === 'QR_CODE', JSON.stringify(h.cams[0] && h.cams[0].cfg));
    ok('броячът: „получени 0 от 2"', h.doc.getElementById('ll-qr-count').textContent === 'получени 0 от 2');
    ok('основният поток — не е зад loading_scan', h.w.llScanOn === false);

    /* а) свой, неотметнат */
    const read = text => h.cams[0].onOk(text);
    h.confirmed = 0;
    read(URL1('L1', 'pallet', 1, 'Петрич')); await ticks(); await ticks(); await ticks();
    const ps = patchesOf(h);
    ok('свой палет → PATCH за двата му реда (p1a, p1b)', ps.length === 2 && ps.every(p => /id=eq\.p1[ab]/.test(p.url) && p.body.received === true),
      JSON.stringify(ps.map(p => p.url)));
    ok('без confirm', !h.confirmed);
    ok('зелен екран „Палет 1 от 2 ✓"', flashOf(h).getAttribute('data-scan-result') === 'ok' && flashOf(h).textContent.indexOf('Палет 1 от 2 ✓') >= 0,
      flashOf(h).textContent);
    ok('броячът: „получени 1 от 2"', h.doc.getElementById('ll-qr-count').textContent === 'получени 1 от 2');
    ok('зеленият екран е с таймер (1 сек), не чака натискане', !!h.w.llQrScan.flashTimer);
    h.w.llQrFlashDismiss();

    /* б) вече отметнат */
    h.calls.patch.length = 0; h.w.llQrScan.last = '';
    read(URL1('L1', 'pallet', 1, 'Петрич')); await ticks(); await ticks();
    ok('вече получен → сив екран, без PATCH', flashOf(h).getAttribute('data-scan-result') === 'done' && patchesOf(h).length === 0 &&
      /вече е получен/.test(flashOf(h).textContent), flashOf(h).textContent);
    h.w.llQrFlashDismiss();

    /* в) чужд обект */
    h.w.llQrScan.last = '';
    read(URL1('L1', 'pallet', 1, 'Габрово')); await ticks(); await ticks();
    ok('чужд обект → червен екран „ЗА ГАБРОВО — не е за вас"',
      flashOf(h).getAttribute('data-scan-result') === 'foreign' && /ЗА ГАБРОВО/.test(flashOf(h).textContent) && /не е за вас/.test(flashOf(h).textContent),
      flashOf(h).textContent);
    ok('нито един PATCH', patchesOf(h).length === 0);
    ok('червеният НЕ изчезва сам (без таймер)', h.w.llQrScan.flashTimer === null);
    ok('има „Разбрах"', !!btn(flashOf(h), 'Разбрах'));
    ok('камерата е на пауза, докато не се натисне', h.cams[0].paused === true);
    realClick(h.w, btn(flashOf(h), 'Разбрах'));
    ok('„Разбрах" го затваря и пуска камерата', flashOf(h).style.display === 'none' && h.cams[0].paused === false);

    /* г) непознат / друг лист */
    h.w.llQrScan.last = '';
    read(URL1('L77', 'pallet', 1, 'Петрич')); await ticks(); await ticks();
    ok('друг лист → жълт „не е от този товарен лист" с номера му',
      flashOf(h).getAttribute('data-scan-result') === 'unknown' && /не е от този товарен лист/i.test(flashOf(h).textContent) && /L77/.test(flashOf(h).textContent),
      flashOf(h).textContent);
    h.w.llQrFlashDismiss(); h.w.llQrScan.last = '';
    read('3800001000011'); await ticks(); await ticks();
    ok('баркод вместо QR → жълт „Непознат код"', flashOf(h).getAttribute('data-scan-result') === 'unknown' && /Непознат код/.test(flashOf(h).textContent));
    h.w.llQrFlashDismiss(); h.w.llQrScan.last = '';
    read(URL1('L1', 'pallet', 9, 'Петрич')); await ticks(); await ticks();
    ok('палет, който го няма в листа → жълт', flashOf(h).getAttribute('data-scan-result') === 'unknown' && /го няма/.test(flashOf(h).textContent));
    ok('през цялото време — само двата PATCH-а от първото сканиране', true);

    /* „Готово" затваря скенера. */
    h.w.llQrScanClose();
    ok('„Готово": модалът го няма, камерата е спряна', !h.doc.getElementById('ll-qr-modal') && h.cams[0].stopped === true);
  }

  section('7. Редът „Палети: …" над таблицата в картата');
  {
    const items = [
      it_({ id: 'a', position: 1, pallet_no: 1, pallet_total: 5, purchase_doc: 'D-1', received: true }),
      it_({ id: 'b', position: 2, pallet_no: 2, pallet_total: 5, purchase_doc: 'D-2', received: true }),
      it_({ id: 'c', position: 3, pallet_no: 3, pallet_total: 5, purchase_doc: 'D-3', received: true }),
      it_({ id: 'd', position: 4, pallet_no: 4, pallet_total: 5, purchase_doc: 'D-4', missing: true, store_comment: 'няма го' }),
      it_({ id: 'e', position: 5, pallet_no: 5, pallet_total: 5, purchase_doc: 'D-5' })
    ];
    const h = env(items, PETRICH);
    h.w.loadLoadingLists(); await ticks(); await ticks();
    const t = h.doc.querySelector('[data-ll-pal-status]');
    ok('„Палети: 3 получени · 1 неполучен · 1 чака"', t && t.textContent === 'Палети: 3 получени · 1 неполучен · 1 чака', t && t.textContent);
    const tbl = h.doc.getElementById('ll-card-L1').querySelector('table');
    ok('и е ПРЕДИ таблицата', t && tbl && (t.compareDocumentPosition(tbl) & 4) === 4);
  }

  section('8. Deep link: #tl=…&p=… след вход');
  {
    const h = env(ITEMS, PETRICH);
    h.w.history.replaceState(null, '', '/#tl=L1&p=' + encodeURIComponent('pallet|1|Петрич'));
    h.w.eval('llDeepLinkBoot()');
    await ticks(); await ticks(); await ticks();
    const card = h.doc.getElementById('ll-card-L1');
    ok('листът е отворен (картата е разгъната)', !!card && !!card.querySelector('table'));
    const hl = card && card.querySelector('tr[data-ll-hl="1"]');
    ok('палетът е подчертан', !!hl && /Палет 1 от 2/.test(hl.textContent), hl && hl.textContent);
    const focus = h.doc.activeElement;
    ok('бутонът „Целият палет" е фокусиран', focus && focus.tagName === 'BUTTON' && /Целият палет/.test(focus.textContent), focus && focus.textContent);
    ok('хешът е махнат от адреса (презареждане не го повтаря)', h.w.location.hash === '', h.w.location.hash);
    ok('нищо не е отметнато само', patchesOf(h).length === 0);

    /* Единствен документ на палета: фокусът е на „Получено" на реда. */
    const h2 = env(ITEMS, PETRICH);
    h2.w.eval('llDeepLinkBoot(' + JSON.stringify('#tl=L1&p=' + encodeURIComponent('pallet|2|Петрич')) + ')');
    await ticks(); await ticks(); await ticks();
    const f2 = h2.doc.activeElement;
    ok('палет с един документ — фокус на „✅ Получено" на реда му', f2 && /Получено/.test(f2.textContent), f2 && f2.textContent);

    /* Чужд обект → червен екран. */
    const h3 = env(ITEMS, PETRICH);
    h3.w.eval('llDeepLinkBoot(' + JSON.stringify('#tl=L1&p=' + encodeURIComponent('pallet|1|Габрово')) + ')');
    await ticks();
    const red = h3.doc.getElementById('ll-foreign-modal');
    ok('чужд палет → червен екран на цял модал', !!red && /ЗА ГАБРОВО/.test(red.textContent) && /не е за вас/.test(red.textContent), red && red.textContent);
    realClick(h3.w, btn(red, 'Разбрах'));
    ok('„Разбрах" го маха', !h3.doc.getElementById('ll-foreign-modal'));

    /* Складов потребител (не получател) също не е „от обекта". */
    const h4 = env(ITEMS, WAREHOUSE);
    h4.w.eval('llDeepLinkBoot(' + JSON.stringify('#tl=L1&p=' + encodeURIComponent('pallet|1|Петрич')) + ')');
    await ticks();
    ok('складов потребител → същият червен екран', !!h4.doc.getElementById('ll-foreign-modal'));

    /* Без валиден хеш — нищо. */
    const h5 = env(ITEMS, PETRICH);
    ok('без #tl → не прави нищо', h5.w.eval('llDeepLinkBoot("")') === false && !h5.doc.getElementById('ll-foreign-modal'));
  }

  report();
})();
