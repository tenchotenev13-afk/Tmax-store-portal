/* Ред „Проверено (снабдител / началник склад)" в бланките, с които стока
   напуска обект / склад (решение на Тенчо 12.11.2026; същият ред като в
   бланката за шофьора в Транспорт, 29073a5).

   Всички пътища за печат, минати ПРЕЗ ИСТИНСКИТЕ БУТОНИ:
     Трансфери      — „🖨 Печат" от реда в списъка и от картата
                      (и двата → renderTransferPrint);
     Товарни листи  — склад: „🖨 Печат" (целия лист), „⬇ PDF", „🖨 Опис"
                      (опис на палет); обект: „🖨 Печат" и „⬇ PDF" на
                      неговата част. PDF-ът е същият генератор като
                      приложението в писмото при „📤 Изпрати" (llBuildPdf).
   Етикетите (🏷 / QR) нямат подписи — редът там НЕ се слага (и не се
   тестват тук: искат QR библиотеката от CDN).

   За всяка бланка: редът е ТОЧНО веднъж, „Проверено" е удебелено, стои ПРЕДИ
   първия подпис за предаване („Предал" / „Товарил"), а съседните подписи са
   непроменени (точният низ отпреди).
   PDF: „Проверено" и „Товарил / Приел" са на ЕДИН лист — ако не се
   побират до края, нов лист ПРЕДИ „Проверено" (решение 12.11.2026). 5)
   вика llBuildPdf директно с 1…60 единици, за да падне краят на листа
   на всяко възможно място спрямо подписите.

   Мутационна проверка (12.11.2026, всяка поотделно):
     1. редът махнат от renderTransferPrint            → пада 1)
     2. редът махнат само от llRenderPalletPrint       → пада 3) „Опис"
     3. редът след „Предал" (в .tf-sign)              → пада 1)
     4. PDF: редът след „Товарил"                      → пада 3)/4) PDF
     5. HTML лист: редът след „Товарил" (llRenderPrint) → пада 2)
     6. PDF: без проверката „нов лист ПРЕДИ Проверено" (двата реда
        се разделят на два листа)                       → пада 5)
   Всички събарят теста.

   Пускане:  node tests/transfer-loading-print-checked.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick } = H;

const CHECK_HTML = '<b>Проверено</b> (снабдител / началник склад): имена ........................................ подпис ..............................';
const CHECK_PDF = 'Проверено (снабдител / началник склад): имена ............................  подпис ............................';
const TF_SIGN = '<div class="tf-sign"><div>Предал: ………………………</div><div>Превозвач: ………………………</div><div>Приел: ………………………</div></div>';
const LP_SIGN = '<div class="lp-sign-item"><div class="lp-dots"></div>Товарил: име и подпис</div>' +
                '<div class="lp-sign-item"><div class="lp-dots"></div>Приел: име и подпис</div>';
const PDF_SIGN = 'Товарил: ............................        Приел: ............................';

const count = (s, sub) => s.split(sub).length - 1;
const printHtml = h => (h.doc.getElementById('mod-print') || {}).innerHTML || '';
const btnByText = (root, txt) => Array.from(root.querySelectorAll('button')).filter(b => b.textContent.indexOf(txt) >= 0);

/* Проверката на една HTML бланка: веднъж, удебелено, преди първия подпис, съседите непокътнати. */
function checkHtml(label, html, firstSign, neighbours) {
  ok(label + ': бланката е рендирана', html.length > 200, String(html.length));
  ok(label + ': „Проверено" — точно веднъж', count(html, CHECK_HTML) === 1, String(count(html, CHECK_HTML)));
  ok(label + ': и думата „Проверено" — само там', count(html, 'Проверено') === 1, String(count(html, 'Проверено')));
  const iC = html.indexOf(CHECK_HTML), iS = html.indexOf(firstSign);
  ok(label + ': преди „' + firstSign.replace(/<[^>]*>/g, '').slice(0, 12) + '"', iC >= 0 && iS > iC, iC + ' / ' + iS);
  ok(label + ': съседните подписи са непроменени', count(html, neighbours) === 1, String(count(html, neighbours)));
}

/* ─────────── Трансфери ─────────── */
const STORES = ['Добрич', 'Шумен', 'Варна'];
const TR = { id: 'k1', transfer_num: 'Добрич-0011', from_store: 'Добрич', mode: 'bus', plate_no: null,
             depart_date: '2026-11-12', depart_time: '07:00', driver: 'Георги', stops: ['Шумен'], end_store: 'Варна',
             status: 'planned', created_at: '2026-11-11T08:00:00Z', created_by: 'Управител Добрич' };
const CARGO = [
  { id: 'c1', transfer_id: 'k1', position: 1, kind: 'pallet', qty: 1, recipient_store: 'Варна', transfer_points: [] },
  { id: 'c2', transfer_id: 'k1', position: 2, kind: 'roll', qty: 2, recipient_store: 'Шумен', transfer_points: [] }
];
function tfEnv() {
  const h = boot({
    modules: ['stock-differences.js', 'transfers.js'],
    user: { id: 'u1', email: 'dobrich@temax.bg', display_name: 'Управител Добрич', role: 'manager', store_name: 'Добрич' },
    data: {
      users: STORES.map(s => ({ store_name: s })),
      transfers: [TR], transfer_cargo: CARGO, transfer_cargo_events: [],
      client_orders: [], transport_orders: [], loading_lists: [], loading_list_items: []
    }
  });
  return h;
}

/* ─────────── Товарни листи ─────────── */
const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище', role: 'sklad', store_name: WH, assigned_stores: [] };
const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич', role: 'manager', store_name: 'Петрич', assigned_stores: [] };
const L1 = { id: 'L1', warehouse: WH, list_date: '2026-11-12', status: 'sent', executed_by: 'Иван', comment: '',
             created_by: 'x', created_at: '2026-11-12T06:00:00.000Z', sent_at: '2026-11-12T07:00:00.000Z', done_at: null };
function it_(o) {
  return Object.assign({
    id: 'i-x', list_id: 'L1', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 1,
    purchase_doc: null, clears_doc: null, store_name: 'Петрич', warehouse_comment: null,
    store_comment: null, partial: false, received: false, missing: false, received_by: null,
    received_at: null, created_at: '2026-11-12T06:00:00.000Z', products: []
  }, o);
}
const PROD = { sap_code: '3200123', product_name: 'ШУРУП 4X40', unit: 'бр.', qty: 5, cartons: 1 };
const ITEMS = [
  it_({ id: 'a1', position: 1, pallet_no: 1, pallet_total: 2, purchase_doc: 'P1', products: [PROD] }),
  it_({ id: 'b1', position: 2, pallet_no: 2, pallet_total: 2, purchase_doc: 'P2' }),
  it_({ id: 'g1', position: 3, store_name: 'Габрово', pallet_no: 1, pallet_total: 1, purchase_doc: 'G1' })
];
function llEnv(user) {
  const h = boot({
    modules: ['transport.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js', 'loading.js'],
    user: user, confirm: true,
    data: {
      loading_lists: [L1],
      loading_list_items: function (url) {
        let rows = ITEMS.map(r => Object.assign({}, r, { loading_list_products: (r.products || []).map(p => Object.assign({}, p)) }));
        const st = /store_name=eq\.([^&]*)/.exec(url);
        if (st) rows = rows.filter(r => r.store_name === decodeURIComponent(st[1]));
        return rows;
      },
      loading_list_products: [], loading_list_photos: [], goods_transit: [],
      users: [{ store_name: 'Петрич' }, { store_name: 'Габрово' }],
      stores: [], contacts: [], transport_orders: [], client_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  /* Фалшив jsPDF: пази текста И опциите (контурът на „Проверено"). */
  const rec = { calls: [] };
  function Doc() { rec.page = 1; }
  Doc.prototype.addFileToVFS = function () {};
  Doc.prototype.addFont = function () {};
  Doc.prototype.setFont = function () {};
  Doc.prototype.setFontSize = function () {};
  Doc.prototype.splitTextToSize = function (t) { return [String(t)]; };
  Doc.prototype.text = function (t, x, y, o) { rec.calls.push({ t: String(t), x: x, y: y, o: o || null, page: rec.page }); };
  Doc.prototype.addPage = function () { rec.page++; };
  Doc.prototype.output = function () { return 'data:application/pdf;filename=x.pdf;base64,UERG'; };
  h.w.jspdf = { jsPDF: Doc };
  h.w.llPdfFont = () => Promise.resolve('Rk9OVA==');
  h.rec = rec;
  return h;
}
function checkPdf(label, rec) {
  const texts = rec.calls.map(c => c.t);
  ok(label + ': PDF-ът е генериран', texts.length > 3, String(texts.length));
  ok(label + ': PDF — редът „Проверено" точно веднъж', texts.filter(t => t === CHECK_PDF).length === 1, JSON.stringify(texts.slice(-4)));
  const iC = texts.indexOf(CHECK_PDF), iS = texts.indexOf(PDF_SIGN);
  ok(label + ': PDF — преди „Товарил"', iC >= 0 && iS > iC, iC + ' / ' + iS);
  ok(label + ': PDF — „Товарил / Приел" е непроменен и веднъж', texts.filter(t => t === PDF_SIGN).length === 1);
  const line = rec.calls[iC], bold = rec.calls.filter(c => c.t === 'Проверено');
  ok(label + ': PDF — „Проверено" удебелено (контур върху същото място)',
    bold.length === 1 && line && bold[0].x === line.x && bold[0].y === line.y && bold[0].o && bold[0].o.renderingMode === 'fillThenStroke',
    JSON.stringify(bold) + ' / ' + JSON.stringify(line));
}

(async function () {

  section('1) Трансфери — „🖨 Печат" от списъка и от картата');
  {
    const h = tfEnv();
    h.w.showModule = (function (orig) { return function (m) { h.lastModule = m; return orig.apply(this, arguments); }; })(h.w.showModule);
    h.w.showModule('transfers'); await ticks(); await ticks();
    const row = h.doc.querySelector('#trf-table tbody tr[data-id="k1"]');
    const b = row ? btnByText(row, '🖨 Печат') : [];
    if (ok('списък: бутонът „🖨 Печат" е там', b.length === 1)) {
      realClick(h.w, b[0]); await ticks(); await ticks();
      checkHtml('трансфер (списък)', printHtml(h), '<div class="tf-sign"><div>Предал', TF_SIGN);
      ok('трансфер (списък): CSS на реда е в бланката', /\.tf-check\{margin-top:8mm;font-size:9pt;\}/.test(printHtml(h)));
      ok('трансфер (списък): редът е ИЗВЪН .tf-sign (собствен ред, не четвърта колона)',
        !!h.doc.querySelector('#mod-print .tf-check') && !h.doc.querySelector('#mod-print .tf-sign .tf-check') &&
        h.doc.querySelector('#mod-print .tf-check').nextElementSibling === h.doc.querySelector('#mod-print .tf-sign'));
    }
    h.w.showModule('transfers'); await ticks();
    const open = h.doc.querySelector('#trf-table tbody tr[data-id="k1"] .trf-open');
    if (ok('карта: „Отвори"', !!open)) {
      realClick(h.w, open); await ticks();
      const cb = btnByText(h.doc.getElementById('trf-card') || h.doc.body, '🖨 Печат');
      if (ok('карта: бутонът „🖨 Печат" е там', cb.length === 1)) {
        h.doc.getElementById('mod-print').innerHTML = '';
        realClick(h.w, cb[0]); await ticks(); await ticks();
        checkHtml('трансфер (карта)', printHtml(h), '<div class="tf-sign"><div>Предал', TF_SIGN);
      }
    }
    h.close();
  }

  section('2) Товарни листи — склад: „🖨 Печат" (целия лист) и „🖨 Опис"');
  {
    const h = llEnv(WAREHOUSE);
    h.w.loadLoadingLists(); await ticks(); await ticks();
    h.w.llOpenView('L1'); await ticks();
    const mod = h.doc.getElementById('mod-loading');
    const pb = btnByText(mod, '🖨 Печат');
    if (ok('бутонът „🖨 Печат" е там', pb.length === 1, String(pb.length))) {
      realClick(h.w, pb[0]); await ticks();
      checkHtml('товарен лист (склад)', printHtml(h), 'Товарил: име и подпис', LP_SIGN);
      ok('товарен лист: редът е в .lp-sign, на цял ред (.lp-check{flex:1 1 100%})',
        !!h.doc.querySelector('#mod-print .lp-sign > .lp-check:first-child') && /\.lp-check\{flex:1 1 100%;\}/.test(printHtml(h)));
    }
    h.w.llOpenView('L1'); await ticks();
    const ob = btnByText(h.doc.getElementById('mod-loading'), '🖨 Опис');
    if (ok('бутонът „🖨 Опис" е там', ob.length >= 1, String(ob.length))) {
      h.doc.getElementById('mod-print').innerHTML = '';
      realClick(h.w, ob[0]); await ticks();
      const html = printHtml(h);
      ok('опис: наистина е описът на палет', /data-ll-pallet-print="1"/.test(html));
      checkHtml('опис на палет', html, 'Товарил: име и подпис', LP_SIGN);
    }
    h.close();
  }

  section('3) Товарни листи — склад: „⬇ PDF"');
  {
    const h = llEnv(WAREHOUSE);
    h.w.loadLoadingLists(); await ticks(); await ticks();
    h.w.llOpenView('L1'); await ticks();
    /* „⬇ PDF" на етикетите (llDownloadLabelsPdf) е отделен бутон без подписи. */
    const db = btnByText(h.doc.getElementById('mod-loading'), '⬇ PDF').filter(b => /^llDownloadPdf\(/.test(b.getAttribute('onclick')));
    if (ok('бутонът „⬇ PDF" е там', db.length === 1, String(db.length))) {
      realClick(h.w, db[0]); await ticks(); await ticks(); await ticks();
      checkPdf('склад', h.rec);
    }
    h.close();
  }

  section('4) Товарни листи — обект: „🖨 Печат" и „⬇ PDF" на своята част');
  {
    const h = llEnv(STORE);
    h.w.loadLoadingLists(); await ticks(); await ticks();
    const mod = h.doc.getElementById('mod-loading');
    const pb = btnByText(mod, '🖨 Печат').filter(b => b.getAttribute('data-s') === 'Петрич');
    if (ok('обект: „🖨 Печат" с моя обект', pb.length === 1, String(pb.length))) {
      realClick(h.w, pb[0]); await ticks();
      const html = printHtml(h);
      ok('обект: печатът е само на моята част', /ТОВАРЕН ЛИСТ — Петрич/.test(html) && html.indexOf('G1') < 0);
      checkHtml('товарен лист (обект)', html, 'Товарил: име и подпис', LP_SIGN);
    }
    h.w.loadLoadingLists(); await ticks(); await ticks();
    const db = btnByText(h.doc.getElementById('mod-loading'), '⬇ PDF').filter(b => b.getAttribute('data-s') === 'Петрич');
    if (ok('обект: „⬇ PDF" с моя обект', db.length === 1, String(db.length))) {
      h.rec.calls.length = 0;
      realClick(h.w, db[0]); await ticks(); await ticks(); await ticks();
      checkPdf('обект', h.rec);
    }
    h.close();
  }

  section('5) PDF — „Проверено" и „Товарил / Приел" винаги на един лист (1…60 единици)');
  {
    const h = llEnv(WAREHOUSE);
    let split = [], movedBefore = 0, pages = new Set();
    for (let n = 1; n <= 60; n++) {
      const rows = [];
      for (let k = 1; k <= n; k++) rows.push(it_({ id: 'u' + k, position: k, pallet_no: k, pallet_total: n, purchase_doc: 'D' + k }));
      h.rec.calls.length = 0;
      await h.w.llBuildPdf(L1, rows, '');
      const c = h.rec.calls, iC = c.findIndex(x => x.t === CHECK_PDF), iS = c.findIndex(x => x.t === PDF_SIGN);
      if (iC < 0 || iS < 0) { split.push(n + ': липсва ред'); continue; }
      if (c[iC].page !== c[iS].page) split.push(n + ': ' + c[iC].page + '/' + c[iS].page);
      /* Граничният случай: „Проверено" е първото нещо на нов лист. */
      if (iC > 0 && c[iC].page > c[iC - 1].page) movedBefore++;
      pages.add(c[iS].page);
    }
    ok('за нито един брой единици двата реда не са на различни листове', split.length === 0, split.join(' | '));
    ok('граничният случай е минат: поне веднъж „Проверено" започва нов лист', movedBefore >= 1, String(movedBefore));
    ok('обхватът стига до 2+ листа (иначе проверката е празна)', pages.size >= 2, JSON.stringify([...pages]));
    ok('„Проверено" е и удебелено на същия лист', h.rec.calls.filter(x => x.t === 'Проверено').every(x => x.page === h.rec.calls.find(y => y.t === CHECK_PDF).page));
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
