/* Товарни листи — А4 бланката като PDF: приложение в писмото и „⬇ PDF".

   jsPDF и шрифтът се зареждат лениво; в jsdom ги няма, затова тук jsPDF е
   фалшив клас, а шрифтът — готов низ.

   Тихите грешки, които се пазят тук:
     · PDF без вграден шрифт — jsPDF има само WinAnsi шрифтове и целият
       документ излиза с въпросителни, БЕЗ да гръмне;
     · провалът на PDF-а спира ПИСМОТО. Листът е изпратен; липсващото
       приложение е по-малката щета от неизпратено известие;
     · <script src> не гарантира събитие — прокси, което поглъща заявката,
       не дава нито onload, нито onerror, и без срок писмото виси вечно;
     · кирилица в името на файла стига до пощата като „=?UTF-8?…".

   Пускане:  node tests/loading-lists-pdf.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                role: 'manager', store_name: 'Петрич', assigned_stores: [] };

const L_DRAFT = { id: 'L1', warehouse: WH, list_date: '2026-09-23', status: 'draft',
                  executed_by: 'Иван Петров', comment: 'Камионът тръгва в 6:00',
                  created_at: 'x', sent_at: null, done_at: null };
function item(o) {
  return Object.assign({
    id: 'I1', list_id: 'L1', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 1,
    purchase_doc: null, clears_doc: null, store_name: 'Петрич', warehouse_comment: null,
    store_comment: null, partial: false, received: false, missing: false,
    missing_by: null, missing_at: null, created_at: 'x', products: []
  }, o);
}
const USERS = [{ email: 'petrich@temax.bg', store_name: 'Петрич', active: true },
               { email: 'gd@temax.bg', store_name: 'Гоце Делчев', active: true },
               { email: 'sklad.tg@temax.bg', store_name: WH, active: true }];

function env(user, items, lists, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js',
              'push.js', 'email.js', 'loading.js'],
    user: user, confirm: true,
    data: {
      loading_lists: () => (lists || [L_DRAFT]).map(r => Object.assign({}, r)),
      loading_list_items: function (url) {
        let r = (items || []).map(x => Object.assign({}, x, {
          loading_list_products: (x.products || []).map(p => Object.assign({}, p))
        }));
        const sm = /store_name=eq\.([^&]*)/.exec(url);
        if (sm) r = r.filter(x => x.store_name === decodeURIComponent(sm[1]));
        return r;
      },
      users: function (url) {
        let r = (opts.users || USERS).map(x => Object.assign({}, x));
        if (/active=eq\.true/.test(url)) r = r.filter(x => x.active);
        const inm = /store_name=in\.\(([^)]*)\)/.exec(url);
        if (inm) { const w = inm[1].split(',').map(decodeURIComponent); r = r.filter(x => w.indexOf(x.store_name) >= 0); }
        return r;
      },
      loading_list_products: [], stores: [], contacts: [], transport_orders: [], client_orders: [],
      /* „📤 Изпрати" иска поне 2 снимки на натоварването (25.09.2026).
         Този тест проверява какво става СЛЕД изпращането, не гейта —
         затова фикстурата ги носи. Гейтът е в loading-lists-photos. */
      loading_list_photos: [
        { id: 'ph1', list_id: 'L1', store_name: WH, stage: 'sent',
          path: 'https://x/1.jpg', uploaded_by: 'Склад', uploaded_at: 'x' },
        { id: 'ph2', list_id: 'L1', store_name: WH, stage: 'sent',
          path: 'https://x/2.jpg', uploaded_by: 'Склад', uploaded_at: 'x' }
      ],
      stock_differences: [], differences_reports: [], stock_returns: [], goods_transit: []
    }
  });
  /* Фалшивият jsPDF: записва всичко, което му се казва. */
  const rec = { docs: [], vfs: [], fonts: [], setFont: [], text: [], pages: 0 };
  function Doc(cfg) { rec.docs.push(cfg); rec.pages = 1; }
  Doc.prototype.addFileToVFS = function (n, b) { rec.vfs.push({ name: n, base64: b }); };
  Doc.prototype.addFont = function (f, n, st) { rec.fonts.push({ file: f, name: n, style: st }); };
  Doc.prototype.setFont = function (n, st) { rec.setFont.push(n + '/' + st); };
  Doc.prototype.setFontSize = function () {};
  Doc.prototype.splitTextToSize = function (t) { return [String(t)]; };
  Doc.prototype.text = function (t) { rec.text.push(String(t)); };
  Doc.prototype.addPage = function () { rec.pages++; };
  Doc.prototype.output = function () {
    if (opts.outputBad) return 'няма-нищо';
    return 'data:application/pdf;filename=generated.pdf;base64,' + (opts.base64 || 'UERGREFUQQ==');
  };
  if (!opts.noLib) h.w.jspdf = { jsPDF: Doc };
  h.rec = rec;

  /* Шрифтът: тестваме URL-а отделно, тук се подава готов. */
  if (opts.fontFail) h.w.llPdfFont = () => Promise.reject(new Error('шрифтът не се зареди (HTTP 404)'));
  else if (!opts.realFont) h.w.llPdfFont = () => Promise.resolve('Rk9OVA==');

  h.mails = []; h.pushes = [];
  h.w.pushToStores = function (s, t, m) { h.pushes.push({ stores: s, title: t, message: m }); return Promise.resolve({ ok: true, data: {} }); };
  h.w.pushToAll = function () { h.pushAll = (h.pushAll || 0) + 1; return Promise.resolve({ ok: true, data: {} }); };
  h.w.sendEmail = function (to, subject, html, extra) {
    h.mails.push({ to: Array.isArray(to) ? to : [to], subject: subject, html: html, extra: extra });
    return Promise.resolve({ ok: true, status: 200, data: {} });
  };
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: m, col: c }); return orig(m, c); };
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
const sent = (h, addr) => h.mails.find(m => m.to.indexOf(addr) >= 0);

const ROWS = [
  item({ id: 'I1', position: 1, purchase_doc: 'ИЗХ-100', warehouse_comment: 'кашон отгоре',
         products: [{ sap_code: '3200123', product_name: 'ШУРУП 4X40', unit: 'бр.', qty: 12, cartons: 2 },
                    { sap_code: '5001', product_name: 'ТРЪБА 1/2" PPR', unit: 'л.м', qty: 6.5, cartons: null }] }),
  item({ id: 'I2', position: 2, pallet_no: 2, pallet_total: 2, purchase_doc: 'ИЗХ-101' }),
  item({ id: 'I9', position: 3, store_name: 'Гоце Делчев', purchase_doc: 'ИЗХ-900',
         products: [{ sap_code: 'ЧУЖД', product_name: 'НА ДРУГИЯ ОБЕКТ', unit: 'бр.', qty: 1, cartons: null }] })
];

(async function () {

  section('а) Документът: вграден шрифт, съдържание, име на файла');
  {
    const h = env(WAREHOUSE, ROWS, [L_DRAFT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    const pdf = await h.w.llBuildPdf(L_DRAFT, h.w.llItems, 'Петрич');

    ok('документът е A4 в милиметри',
      h.rec.docs[0] && h.rec.docs[0].unit === 'mm' && h.rec.docs[0].format === 'a4',
      JSON.stringify(h.rec.docs[0]));
    /* Без вграден шрифт целият PDF излиза с въпросителни — мълчаливо. */
    if (ok('шрифтът е подаден във VFS', h.rec.vfs.length === 1, JSON.stringify(h.rec.vfs.map(v => v.name)))) {
      ok('с името на файла', h.rec.vfs[0].name === 'Roboto-Regular.ttf', h.rec.vfs[0].name);
      ok('и със съдържание', h.rec.vfs[0].base64 === 'Rk9OVA==', h.rec.vfs[0].base64);
    }
    ok('addFont го регистрира като Roboto/normal',
      h.rec.fonts.length === 1 && h.rec.fonts[0].name === 'Roboto' && h.rec.fonts[0].style === 'normal',
      JSON.stringify(h.rec.fonts));
    ok('и е ИЗБРАН', h.rec.setFont.indexOf('Roboto/normal') >= 0, JSON.stringify(h.rec.setFont));

    const txt = h.rec.text.join('\n');
    ok('заглавие с обекта', /ТОВАРЕН ЛИСТ — Петрич/.test(txt), txt.slice(0, 200));
    ok('складът', txt.indexOf(WH) >= 0);
    ok('датата', /23\.09\.2026/.test(txt));
    ok('товарил', txt.indexOf('Иван Петров') >= 0);
    ok('коментарът на листа', txt.indexOf('Камионът тръгва в 6:00') >= 0);
    ok('редовете с изходящ №', /ИЗХ-100/.test(txt) && /ИЗХ-101/.test(txt));
    ok('артикулите под реда', /3200123/.test(txt) && /ШУРУП 4X40/.test(txt));
    ok('кашоните и бройките', /12 бр\./.test(txt) && /\(2 каш\.\)/.test(txt), txt);
    ok('кавичката в името оцелява', /ТРЪБА 1\/2" PPR/.test(txt));
    ok('десетичната запетая', /6,5/.test(txt));
    ok('ред за подпис', /Товарил: \.+/.test(txt) && /Приел:/.test(txt));
    /* Чуждият обект няма работа в бланката на Петрич. */
    ok('НЯМА чужди редове', txt.indexOf('НА ДРУГИЯ ОБЕКТ') < 0 && txt.indexOf('ИЗХ-900') < 0);

    ok('името е с латиница и дата', pdf.filename === 'tovaren-list-2026-09-23-petrich.pdf', pdf.filename);
    ok('съдържанието е чист base64, без префикса', pdf.base64 === 'UERGREFUQQ==', pdf.base64);
  }

  section('а2) Транслитерацията на името');
  {
    const h = env(WAREHOUSE, [], [L_DRAFT]);
    ok('Гоце Делчев', h.w.llTranslit('Гоце Делчев') === 'gotse-delchev', h.w.llTranslit('Гоце Делчев'));
    ok('щ, ъ, ю, я', h.w.llTranslit('Щъркел Юлия') === 'shtarkel-yuliya', h.w.llTranslit('Щъркел Юлия'));
    ok('без обект → складът в името',
      h.w.llPdfName(L_DRAFT, '') === 'tovaren-list-2026-09-23-logistichen-sklad-targovishte.pdf',
      h.w.llPdfName(L_DRAFT, ''));
  }

  section('б) Писмото при изпращане носи бланката');
  {
    const h = env(WAREHOUSE, ROWS, [L_DRAFT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    realClick(h.w, btn(mod(h), '📤 Изпрати към обектите'));
    for (let k = 0; k < 8; k++) await ticks();

    ok('две писма', h.mails.length === 2, JSON.stringify(h.mails.map(m => m.to)));
    const mp = sent(h, 'petrich@temax.bg');
    if (ok('Петрич има писмо', !!mp)) {
      const at = mp.extra && mp.extra.attachments;
      if (ok('с приложение', !!at && at.length === 1, JSON.stringify(mp.extra))) {
        ok('име на файла за ТОЗИ обект', at[0].filename === 'tovaren-list-2026-09-23-petrich.pdf', at[0].filename);
        ok('съдържание base64 в полето content', at[0].content === 'UERGREFUQQ==', at[0].content);
        ok('формат {filename, content} — както иска Resend',
          Object.keys(at[0]).sort().join(',') === 'content,filename', JSON.stringify(Object.keys(at[0])));
      }
    }
    const mg = sent(h, 'gd@temax.bg');
    ok('Гоце Делчев има СВОЙ файл',
      mg && mg.extra && mg.extra.attachments[0].filename === 'tovaren-list-2026-09-23-gotse-delchev.pdf',
      mg && mg.extra && JSON.stringify(mg.extra.attachments));
    ok('без жълто — всичко е тръгнало',
      !h.toasts.some(t => /без PDF|БЕЗ PDF/i.test(t.msg)), JSON.stringify(h.toasts));
  }

  section('в) Провал на библиотеката — писмото тръгва БЕЗ приложение');
  {
    const h = env(WAREHOUSE, ROWS, [L_DRAFT], { noLib: true });
    /* Скриптът в jsdom нито се зарежда, нито гърми — затова срокът е кратък. */
    h.w.LL_PDF_TIMEOUT = 200;
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    realClick(h.w, btn(mod(h), '📤 Изпрати към обектите'));
    for (let k = 0; k < 6; k++) await ticks();
    await new Promise(r => setTimeout(r, 400));
    for (let k = 0; k < 6; k++) await ticks();

    ok('писмата ВСЕ ПАК тръгват', h.mails.length === 2, JSON.stringify(h.mails.map(m => m.to)));
    ok('но без приложение', h.mails.every(m => !m.extra || !m.extra.attachments),
      JSON.stringify(h.mails.map(m => m.extra)));
    ok('жълт toast „БЕЗ PDF"',
      h.toasts.some(t => /БЕЗ PDF/.test(t.msg) && t.col === '#d97706'), JSON.stringify(h.toasts));
    ok('и листът е изпратен', h.calls.patch.some(p => p.table === 'loading_lists' && p.body.status === 'sent'));
  }

  section('в2) Провал на ШРИФТА — същото');
  {
    const h = env(WAREHOUSE, ROWS, [L_DRAFT], { fontFail: true });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    realClick(h.w, btn(mod(h), '📤 Изпрати към обектите'));
    for (let k = 0; k < 8; k++) await ticks();
    ok('писмата тръгват', h.mails.length === 2);
    ok('без приложение', h.mails.every(m => !m.extra || !m.extra.attachments));
    ok('и се казва', h.toasts.some(t => /БЕЗ PDF/.test(t.msg)), JSON.stringify(h.toasts));
    /* Шрифтът е задължителен: PDF с въпросителни е по-лош от липсващ PDF. */
    ok('нито един документ не е правен без шрифт', h.rec.docs.length === 0, String(h.rec.docs.length));
  }

  section('в3) Повреден изход от jsPDF — също не спира писмото');
  {
    const h = env(WAREHOUSE, ROWS, [L_DRAFT], { outputBad: true });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    realClick(h.w, btn(mod(h), '📤 Изпрати към обектите'));
    for (let k = 0; k < 8; k++) await ticks();
    ok('писмата тръгват', h.mails.length === 2);
    ok('без приложение', h.mails.every(m => !m.extra || !m.extra.attachments));
  }

  section('г) Обект без имейл — PDF изобщо не се прави');
  {
    const h = env(WAREHOUSE, [ROWS[0], ROWS[1]], [L_DRAFT],
      { users: [{ email: 'sklad.tg@temax.bg', store_name: WH, active: true }] });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    realClick(h.w, btn(mod(h), '📤 Изпрати към обектите'));
    for (let k = 0; k < 8; k++) await ticks();
    ok('нула писма', h.mails.length === 0);
    ok('и нула напразно направени документи', h.rec.docs.length === 0, String(h.rec.docs.length));
    ok('казва се, че обектът няма акаунт',
      h.toasts.some(t => /Без имейл акаунт/.test(t.msg)), JSON.stringify(h.toasts));
  }

  section('д) „⬇ PDF" сваля файла — при склада и при обекта');
  {
    const h = env(WAREHOUSE, ROWS, [L_DRAFT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    const b = btn(mod(h), '⬇ PDF');
    if (ok('бутонът е до „Печат"', !!b, mod(h).textContent.slice(0, 200))) {
      const clicks = [];
      const realCreate = h.doc.createElement.bind(h.doc);
      h.doc.createElement = function (tag) {
        const el = realCreate(tag);
        if (String(tag).toLowerCase() === 'a') { el.click = function () { clicks.push({ href: el.href, name: el.download }); }; }
        return el;
      };
      realClick(h.w, b);
      for (let k = 0; k < 6; k++) await ticks();
      if (ok('свалянето е задействано', clicks.length === 1, JSON.stringify(clicks))) {
        ok('с PDF данни', /^data:application\/pdf;base64,UERGREFUQQ==$/.test(clicks[0].href), clicks[0].href);
        /* Без обект в прегледа на склада името носи СКЛАДА. */
        ok('името е на целия лист', clicks[0].name === 'tovaren-list-2026-09-23-logistichen-sklad-targovishte.pdf',
          clicks[0].name);
      }
      h.doc.createElement = realCreate;
    }
  }

  section('д2) Обектът сваля САМО своята част');
  {
    const L_SENT = Object.assign({}, L_DRAFT, { status: 'sent', sent_at: '2026-09-23T07:00:00.000Z' });
    const h = env(STORE, ROWS, [L_SENT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    const card = h.doc.getElementById('ll-card-L1');
    const b = btn(card, '⬇ PDF');
    if (ok('бутонът е в картата', !!b, card && card.textContent.slice(0, 160))) {
      const clicks = [];
      const realCreate = h.doc.createElement.bind(h.doc);
      h.doc.createElement = function (tag) {
        const el = realCreate(tag);
        if (String(tag).toLowerCase() === 'a') { el.click = function () { clicks.push({ name: el.download }); }; }
        return el;
      };
      realClick(h.w, b);
      for (let k = 0; k < 6; k++) await ticks();
      ok('името е на неговия обект', clicks.length === 1 && clicks[0].name === 'tovaren-list-2026-09-23-petrich.pdf',
        JSON.stringify(clicks));
      const txt = h.rec.text.join('\n');
      ok('и вътре е само неговото', txt.indexOf('ИЗХ-100') >= 0 && txt.indexOf('ИЗХ-900') < 0, txt.slice(0, 300));
      h.doc.createElement = realCreate;
    }
  }

  section('е) Източниците: cdnjs с SRI и шрифтът от репото');
  {
    const h = env(WAREHOUSE, [], [L_DRAFT], { noLib: true });
    ok('jsPDF 4.2.1 от cdnjs',
      h.w.LL_PDF_LIB === 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js', h.w.LL_PDF_LIB);
    ok('с SRI', /^sha512-plOdviVmws4Y3JAvbnpfKb2hVxKM1lCwsi3vmElYRj/.test(h.w.LL_PDF_SRI), h.w.LL_PDF_SRI);
    ok('шрифтът е от репото, не от CDN', h.w.LL_PDF_FONT_URL === 'fonts/Roboto-Regular.ttf', h.w.LL_PDF_FONT_URL);
    /* Скриптът се слага чак при поискване. */
    ok('преди първия PDF няма скрипт', !h.doc.querySelector('script[src*="jspdf"]'));
    h.w.LL_PDF_TIMEOUT = 150;
    h.w.llLoadPdfLib();
    h.w.llLoadPdfLib();
    const sc = h.doc.querySelectorAll('script[src*="jspdf"]');
    ok('един скрипт при две извиквания', sc.length === 1, String(sc.length));
    ok('с integrity', (sc[0].getAttribute('integrity') || '') === h.w.LL_PDF_SRI);
    ok('и crossorigin', (sc[0].crossOrigin || sc[0].getAttribute('crossorigin')) === 'anonymous');
  }

  section('ж) Срокът: висяща библиотека не оставя PDF-а да чака вечно');
  {
    const h = env(WAREHOUSE, ROWS, [L_DRAFT], { noLib: true });
    h.w.LL_PDF_TIMEOUT = 200;
    let state = 'ВИСИ';
    const t0 = Date.now();
    h.w.llBuildPdf(L_DRAFT, ROWS, 'Петрич').then(() => { state = 'РЕШЕНО'; },
      e => { state = 'ОТХВЪРЛЕНО: ' + e.message; });
    await new Promise(r => setTimeout(r, 700));
    await ticks();
    ok('обещанието се отменя', /ОТХВЪРЛЕНО/.test(state), state);
    ok('в рамките на срока', Date.now() - t0 < 1500, String(Date.now() - t0));
    ok('с обяснима причина', /не се зареди навреме/.test(state), state);
  }

  report();
})();
