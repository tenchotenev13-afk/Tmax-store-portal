/* Разлики, етап 5а — насочване по категория към ЦО и към регионалния
   (среща 12.11.2026 — С2, С3; писма на Миглена Павлова 16.10 и 20.10).

   Междускладов ред:
     wrong_barcode               → ЦО, група 'razliki_barcode'
     pack_mismatch, similar_item → ЦО, група 'razliki_co'
     damaged                     → регионалният на обекта
     друго                       → складът, както досега
   Доставчик и сторна — без промяна.

   1. Правилото sdLineRoute — всяка категория × посока.
   2. Склад: насоченият ред е само за четене („➡️ …“), без бутоните на склада,
      не се брои в „чака склада“ (рендер и пулс); обикновеният ред в същата
      бланка — с бутоните.
   3. Обект: надписът, без бутони за отговор.
   4. „✅ Приключи (от свое име)“ (от етап 6а, решение на Тенчо 17.11 — ЕДНО
      правило): 'razliki_co' — всеки насочен ред; damaged — и регионалният;
      грешен баркод — и 'razliki_barcode'; ролята admin сама — НЕ (admin без
      група → 0 бутона); обект без регионален → само 'razliki_co'; склад,
      обект, друг регионален, член на другата група — не. Без коментар
      — отказ, 0 PATCH; с коментар — точният PATCH; последен ред → бланката се
      затваря. После „✅ Приключено от … · дд.мм — …“.
   5. Известието при подаване: по едно на група / регионален, правилните
      получатели; празна група / паднал sendEmail → жълт toast, бланката стои;
      доставчик — без известие.
   6. Подсказката във формата: междускладов → „➡️ Отива автоматично към …“;
      доставчик → старата „✉️ Нужен доп. имейл до …“.

   pushToPeople / sendEmail — фалшиви (push.js / email.js не са заредени,
   функцията ги търси по глобално име).

   След 6а (17.11, ново право): чистият код — exit 0, 100/100; „М1 без
   проверка на ролята“ → 9 ❌, „ролята admin пак дава бутона“ → 2 ❌,
   „damaged без razliki_co“ → 4 ❌ (подробно — tests/razliki-etap6a.test.js).

   Мутационна проверка на 5а (17.11.2026, мутант върху stock-differences.js, файлът
   — върнат от копие и сверен с cmp; чистият код: exit 0, 94/94):
     М1  damaged → склад (sdLineRoute връща 'warehouse')             → 10 ❌
     М2  „Приключи“ без проверка на ролята (sdCanCloseRouted → true)  → 11 ❌
     М3  известието без групата за грешен баркод (wrong_barcode → co) →  5 ❌
     М4  складът брои насочения ред като чакащ (пулс / бадж)           →  3 ❌
   И четирите — exit 1.

   Пускане:  node tests/razliki-etap5.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks, fire } = H;

const WH = 'Логистичен склад Търговище';
const STORE = 'Карлово';
const U = {
  admin:   { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' },
  adminCO: { id: 'u-adc', email: 'adc@temax.bg', display_name: 'Админ ЦО', role: 'admin', store_name: 'Централен офис' },
  vasilka: { id: 'u-vs', email: 'v.shikova@temax.bg', display_name: 'Василка Шикова', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] },
  migl:    { id: 'u-mp', email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] },
  reg:     { id: 'u-pg', email: 'p.georgieva@temax.bg', display_name: 'П. Георгиева', role: 'accounting', store_name: 'Централен офис', assigned_stores: ['Карлово', 'Пловдив'] },
  reg2:    { id: 'u-nk', email: 'n.koleva@temax.bg', display_name: 'Н. Колева', role: 'accounting', store_name: 'Централен офис', assigned_stores: ['Петрич'] },
  wh:      { id: 'u-wh', email: 'wh@temax.bg', display_name: 'Склад Търговище', role: 'logistics', store_name: WH },
  store:   { id: 'u-st', email: 'karlovo@temax.bg', display_name: 'Управител Карлово', role: 'manager', store_name: STORE }
};
/* Редовете в users, както ги чете sdLoadMe / sdRouteNotify. */
const DBU = [
  { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', notify_groups: [], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-vs', email: 'v.shikova@temax.bg', display_name: 'Василка Шикова', notify_groups: ['co', 'razliki_barcode'], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-mp', email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', notify_groups: ['controlling', 'razliki_co', 'razliki_barcode'], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-jj', email: 'j.jeliazkov@temax.bg', display_name: 'Жеко Желязков', notify_groups: ['co', 'razliki_barcode'], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-pg', email: 'p.georgieva@temax.bg', display_name: 'П. Георгиева', notify_groups: [], is_regional: true, assigned_stores: ['Карлово', 'Пловдив'], active: true },
  { id: 'u-nk', email: 'n.koleva@temax.bg', display_name: 'Н. Колева', notify_groups: [], is_regional: true, assigned_stores: ['Петрич'], active: true },
  { id: 'u-old', email: 'old@temax.bg', display_name: 'Стар', notify_groups: ['razliki_co'], is_regional: true, assigned_stores: ['Карлово'], active: false },
  { id: 'u-wh', email: 'wh@temax.bg', display_name: 'Склад Търговище', notify_groups: [], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-st', email: 'karlovo@temax.bg', display_name: 'Управител Карлово', notify_groups: [], is_regional: false, assigned_stores: [], active: true }
];

const REP = { id: 'r1', direction: 'interstore', store_name: STORE, counterpart: WH, document_number: '180486328', doc_date: '2026-11-17',
  submitted_by: 'Карлово', general_comment: '', photos: [], reviewed: false, created_at: '2026-11-17T08:00:00Z' };
const line = (id, cat, extra) => Object.assign({ id, report_id: 'r1', store_name: STORE, supplier: WH, material_code: 'S' + id,
  material_name: 'АРТ ' + id, quantity: 2, unit: 'бр', difference_category: cat, type: null, status: 'new',
  warehouse_response: null, store_response: null, attachments: [] }, extra || {});
const LINES = [line('d1', 'damaged'), line('p1', 'pack_mismatch'), line('b1', 'wrong_barcode'), line('s1', 'similar_item'), line('u1', 'undelivered')];

const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };

function env(user, opts) {
  opts = opts || {};
  const fake = { push: [], mail: [] };
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user, confirm: true,
    data: Object.assign({
      stock_differences: JSON.parse(JSON.stringify(opts.lines || LINES)), stock_returns: [], product_catalog: [], suppliers: [],
      transport_orders: [], stock_diff_swaps: [], users: opts.users || DBU, contacts: [{ name: 'ТЕСИ ООД' }],
      differences_reports: JSON.parse(JSON.stringify(opts.reps || [REP])), storno_notes: [], storno_note_replies: []
    }, opts.data || {})
  });
  h.w.pushToPeople = (names, title, msg) => { fake.push.push({ names, title, msg }); return Promise.resolve({ ok: !opts.pushFail }); };
  h.w.sendEmail = (to, subject, html) => { fake.mail.push({ to, subject, html }); return Promise.resolve({ ok: !opts.mailFail }); };
  h.fake = fake;
  return h;
}
async function render(h, lines, reps) {
  h.w.sdData = JSON.parse(JSON.stringify(lines || LINES));
  h.w.diffReports = JSON.parse(JSON.stringify(reps || [REP]));
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = 'interstore';
  await h.w.sdLoadMe(); await settle();
  h.w.renderStockDiff();
}
const row = (h, id) => {
  const rows = h.doc.querySelectorAll('#diff-rep-r1 tr');
  return Array.prototype.find.call(rows, tr => tr.textContent.indexOf('АРТ ' + id) >= 0) || null;
};
const closeBtn = (h, id) => { const r = row(h, id); return r ? r.querySelector('.sd-route-close') : null; };
const whBtns = (h, id) => { const r = row(h, id); return r ? r.querySelectorAll('[onclick^="openWarehouseResponseModal"]').length : -1; };
const toasts = h => h.calls.toast.join(' | ');

(async function run() {

  section('1. Правилото sdLineRoute — категория × посока');
  {
    const h = env(U.admin);
    const exp = { wrong_barcode: 'co_barcode', pack_mismatch: 'co', similar_item: 'co', damaged: 'regional',
      undelivered: 'warehouse', excess: 'warehouse', wrong_item: 'warehouse', unbilled_received: 'warehouse', billed_not_received: 'warehouse' };
    Object.keys(exp).forEach(c => {
      ok('interstore × ' + c + ' → ' + exp[c], h.w.sdLineRoute({ difference_category: c }, { direction: 'interstore' }) === exp[c]);
      ['supplier', 'wrong_receipt'].forEach(d => ok(d + ' × ' + c + ' → warehouse', h.w.sdLineRoute({ difference_category: c }, { direction: d }) === 'warehouse'));
    });
    ok('заварен ред с отговор на склада → не по новия път',
      !h.w.sdLineRoutedHere({ difference_category: 'damaged', warehouse_response: 'sent' }, { direction: 'interstore' }));
    h.close();
  }

  section('2. Склад: насочените не се рисуват, не чакат склада');
  {
    const h = env(U.wh);
    await render(h);
    /* До 22.11.2026 складът ги виждаше само за четене („➡️ …“). Решение на
       Тенчо 22.11 (razliki-co-findings т.2): насоченият ред не се рисува на
       склада изобщо. Надписът „➡️ …“ — за обекта и офиса (раздел 3 и 6а). */
    ['d1', 'p1', 'b1', 's1'].forEach(id => {
      ok(id + ': редът не е на екрана на склада', !row(h, id));
      ok(id + ': без „Приключи“', !closeBtn(h, id));
    });
    ok('без надпис „➡️ …“ в картата на склада', !/➡️ (Към ЦО|При регионалния)/.test(h.doc.getElementById('diff-rep-r1').textContent));
    /* Етап 6б (18.11.2026): u1 е „липса“ → складът вижда 3 бутона, не 4. */
    ok('обикновеният ред в същата бланка — 3 бутона на склада (липса, 6б)', whBtns(h, 'u1') === 3, String(whBtns(h, 'u1')));
    /* „чака склада“: бланка само с насочени → 0; + обикновен без отговор → 1;
       обикновеният отговорен → 0. */
    const routedOnly = LINES.filter(l => l.id !== 'u1');
    ok('бадж: само насочени → 0', h.w.sdUnreviewedCountFor([REP], routedOnly, []) === 0);
    ok('бадж: + обикновен без отговор → 1', h.w.sdUnreviewedCountFor([REP], LINES, []) === 1);
    const answered = LINES.map(l => l.id === 'u1' ? Object.assign({}, l, { warehouse_response: 'sent' }) : l);
    ok('бадж: обикновеният отговорен → 0', h.w.sdUnreviewedCountFor([REP], answered, []) === 0);
    /* Пулсът — същото, през истинската заявка (вложени редове). */
    /* Stub, който връща САМО поисканите колони — махната колона в select-а
       наистина липсва, както на живо. */
    const pulse = async lines => {
      let n = null, seen = '';
      h.w.sdBadgePulse = x => { n = x; };
      h.w.sbGet = (t, q) => {
        if (t !== 'differences_reports') return Promise.resolve([]);
        seen = q;
        const sel = /select=([^&]*)/.exec(q)[1];
        const emb = /stock_differences\(([^)]*)\)/.exec(sel);
        const repCols = sel.replace(/,?stock_differences\([^)]*\)/, '').split(',');
        const pick = (o, cols) => { const r = {}; cols.forEach(c => { if (c in o) r[c] = o[c]; }); return r; };
        const o = pick(REP, repCols);
        if (emb) o.stock_differences = lines.map(l => pick(l, emb[1].split(',')));
        return Promise.resolve([o]);
      };
      Object.defineProperty(h.doc, 'hidden', { value: false, configurable: true });
      h.w.sdRefreshTabBadge(); await settle();
      return { n, q: seen };
    };
    let p = await pulse(routedOnly);
    ok('пулс: само насочени → 0', p.n === 0, String(p.n));
    ok('пулс: заявката тегли difference_category и direction', /stock_differences\([^)]*difference_category/.test(p.q) && /select=[^&(]*direction/.test(p.q), p.q);
    p = await pulse(LINES);
    ok('пулс: + обикновен без отговор → 1', p.n === 1, String(p.n));
    h.close();
  }

  section('3. Обект: надписът, без бутони за отговор');
  {
    const ln = LINES.map(l => l.id === 'u1' ? Object.assign({}, l, { warehouse_response: 'sent' }) : l);
    const h = env(U.store);
    await render(h, ln);
    ok('damaged: надпис, без бутони', row(h, 'd1').textContent.indexOf('➡️ При регионалния') >= 0 &&
      row(h, 'd1').querySelectorAll('[onclick^="sdConfirmInterstore"],[onclick^="sdSetStoreResponse"],.sd-route-close').length === 0);
    ok('обикновеният ред (изпратен) — бутон „ПРИЕТО“', !!row(h, 'u1').querySelector('[onclick^="sdConfirmInterstore"]'));
    h.close();
  }

  section('4. „✅ Приключи“ — кой го вижда');
  {
    /* Решение на Тенчо 17.11 (етап 6а): ролята admin САМА не дава бутона;
       'razliki_co' приключва всеки насочен ред, вкл. damaged. */
    const cases = [
      ['admin без група', U.admin, { d1: false, p1: false, b1: false, s1: false }],
      ['admin с razliki_co', U.adminCO, { d1: true, p1: true, b1: true, s1: true }],
      ['Василка (razliki_barcode)', U.vasilka, { d1: false, p1: false, b1: true, s1: false }],
      ['Миглена (razliki_co + barcode)', U.migl, { d1: true, p1: true, b1: true, s1: true }],
      ['регионален на Карлово', U.reg, { d1: true, p1: false, b1: false, s1: false }],
      ['друг регионален (Петрич)', U.reg2, { d1: false, p1: false, b1: false, s1: false }],
      ['склад', U.wh, { d1: false, p1: false, b1: false, s1: false }],
      ['обект', U.store, { d1: false, p1: false, b1: false, s1: false }]
    ];
    /* „Админ ЦО“ (admin + razliki_co) — само в тази секция: в общия DBU би
       влязъл в получателите на известието (секция 6). */
    const USERS4 = DBU.concat([{ id: 'u-adc', email: 'adc@temax.bg', display_name: 'Админ ЦО', notify_groups: ['razliki_co'], is_regional: false, assigned_stores: [], active: true }]);
    for (const [name, u, exp] of cases) {
      const h = env(u, { users: USERS4 });
      await render(h);
      const got = {}; Object.keys(exp).forEach(id => { got[id] = !!closeBtn(h, id); });
      ok(name + ': ' + JSON.stringify(exp), JSON.stringify(got) === JSON.stringify(exp), JSON.stringify(got));
      h.close();
    }
    /* damaged на обект без регионален (Кърджали) → бутонът е само за 'razliki_co'. */
    const KRJ = Object.assign({}, REP, { store_name: 'Кърджали' });
    const krjLines = [line('d1', 'damaged', { store_name: 'Кърджали' })];
    for (const [name, u, exp] of [['Миглена (razliki_co)', U.migl, true], ['admin с razliki_co', U.adminCO, true], ['admin без група', U.admin, false],
      ['регионален на Карлово', U.reg, false], ['Василка (razliki_barcode)', U.vasilka, false]]) {
      const h = env(u, { users: USERS4, lines: krjLines, reps: [KRJ] });
      await render(h, krjLines, [KRJ]);
      ok('Кърджали damaged, ' + name + ' → ' + (exp ? 'бутон' : 'без бутон'), !!closeBtn(h, 'd1') === exp);
      h.close();
    }
    /* Пълният път на модула: loadStockDiff зарежда и групите (sdLoadMe). */
    const h = env(U.vasilka);
    h.w.sdDirTab = 'interstore';
    h.w.loadStockDiff(); await settle();
    ok('loadStockDiff → Василка вижда „Приключи“ на грешния баркод', !!closeBtn(h, 'b1'));
    h.close();
  }

  section('5. „✅ Приключи“ — модал, коментар, PATCH');
  {
    const h = env(U.reg, { lines: [line('d1', 'damaged'), line('u1', 'undelivered', { status: 'received', warehouse_response: 'sent', store_response: 'accepted' })] });
    await render(h, [line('d1', 'damaged'), line('u1', 'undelivered', { status: 'received', warehouse_response: 'sent', store_response: 'accepted' })]);
    realClick(h.w, closeBtn(h, 'd1')); await settle();
    const ov = h.doc.getElementById('sdroute-ov');
    ok('модалът е отворен', !!ov);
    realClick(h.w, h.doc.getElementById('sdroute-save')); await settle();
    ok('без коментар: 0 PATCH', h.calls.patch.length === 0, JSON.stringify(h.calls.patch));
    ok('без коментар: toast', /Впиши коментар/.test(toasts(h)), toasts(h));
    h.doc.getElementById('sdroute-comment').value = '  Изпратено за ремонт  ';
    const before = Date.now();
    realClick(h.w, h.doc.getElementById('sdroute-save')); await settle();
    const p = h.calls.patch.find(x => x.table === 'stock_differences');
    ok('PATCH stock_differences?id=eq.d1', !!p && /id=eq\.d1$/.test(p.url), p && p.url);
    const b = p ? p.body : {};
    ok('тяло: точно четирите полета', JSON.stringify(Object.keys(b).sort()) === JSON.stringify(['completed_at', 'completed_by', 'resolution_comment', 'status']), JSON.stringify(b));
    ok('status received, completed_by = П. Георгиева, коментар без интервали',
      b.status === 'received' && b.completed_by === 'П. Георгиева' && b.resolution_comment === 'Изпратено за ремонт', JSON.stringify(b));
    ok('completed_at = сега', Math.abs(new Date(b.completed_at).getTime() - before) < 60000, b.completed_at);
    ok('последен отворен → бланката се затваря (PATCH differences_reports)', h.calls.patch.some(x => x.table === 'differences_reports' && /id=eq\.r1/.test(x.url)));
    ok('модалът е затворен', !h.doc.getElementById('sdroute-ov'));
    h.close();
    /* Приключеният ред — за обекта и офиса (складът не вижда насочените,
       решение на Тенчо 22.11.2026, razliki-co-findings т.2). */
    const h2 = env(U.store);
    await render(h2, [line('d1', 'damaged', { status: 'received', completed_by: 'П. Георгиева', completed_at: '2026-11-17T09:30:00Z', resolution_comment: 'Изпратено за ремонт' }), line('u1', 'undelivered')]);
    h2.w.sdShowDone = { r1: true }; h2.w.renderStockDiff();
    const d = row(h2, 'd1');
    ok('„✅ Приключено от П. Георгиева · 17.11 — Изпратено за ремонт“', !!d && d.textContent.indexOf('✅ Приключено от П. Георгиева · 17.11 — Изпратено за ремонт') >= 0, d && d.textContent);
    h2.close();
  }

  /* ── Подаване на междускладова бланка ── */
  const photoInput = h => h.doc.querySelector('#diff-submit-ov input[onchange="diffUploadPhoto(this)"][multiple]');
  async function submitInterstore(h, cats) {
    h.w.openDiffSubmitModal(); await settle();
    const sel = h.doc.getElementById('diff-direction');
    if (sel.value !== 'interstore') { sel.value = 'interstore'; fire(h.w, sel, 'change'); await settle(); }
    const cp = h.doc.getElementById('diff-counterpart'); cp.value = WH;
    { const _ob = h.doc.getElementById('diff-outbound'); if (_ob) _ob.value = '80478143'; } /* razliki-id-nomer: ИД № задължителен при междускладов */
    const st = h.doc.getElementById('diff-store'); if (st && !st.value) st.value = STORE;
    for (let i = 1; i < cats.length; i++) h.w.addDiffItemRow();
    h.doc.querySelectorAll('#diff-items .diff-item-row').forEach((r, i) => {
      r.querySelector('.di-sap').value = '10' + i;
      r.querySelector('.di-name').value = 'АРТ ' + cats[i];
      r.querySelector('.di-qty').value = '3';
      r.querySelector('.di-cat').value = cats[i];
    });
    const pi = photoInput(h);
    const file = new h.w.File([new h.w.Uint8Array([1, 2, 3])], 'снимка.jpg', { type: 'application/octet-stream' });
    Object.defineProperty(pi, 'files', { value: [file], configurable: true });
    fire(h.w, pi, 'change'); await settle();
    realClick(h.w, btn(h.doc.getElementById('diff-submit-ov'), 'Подай бланка')); await settle();
  }
  const repPosts = h => h.calls.post.filter(p => p.table === 'differences_reports');

  section('6. Известие при подаване — получатели по група и по регионален');
  {
    const h = env(U.store);
    await submitInterstore(h, ['wrong_barcode', 'pack_mismatch', 'similar_item', 'damaged', 'undelivered']);
    ok('бланката е подадена', repPosts(h).length === 1, toasts(h));
    ok('3 имейла и 3 push (по едно на получател група)', h.fake.mail.length === 3 && h.fake.push.length === 3, JSON.stringify(h.fake.mail.map(m => m.to)));
    const byTo = to => h.fake.mail.find(m => JSON.stringify(m.to.slice().sort()) === JSON.stringify(to.slice().sort()));
    const bc = byTo(['v.shikova@temax.bg', 'm.pavlova@temax.bg', 'j.jeliazkov@temax.bg']);
    const co = byTo(['m.pavlova@temax.bg']);
    const rg = byTo(['p.georgieva@temax.bg']);
    ok('грешен баркод → Василка, Миглена, Жеко', !!bc);
    ok('… само грешния баркод', !!bc && /Грешен баркод/.test(bc.subject) && /АРТ wrong_barcode/.test(bc.html) && !/АРТ pack_mismatch|АРТ damaged/.test(bc.html), bc && bc.subject);
    ok('опаковка + сходен → само Миглена, двата артикула', !!co && /АРТ pack_mismatch/.test(co.html) && /АРТ similar_item/.test(co.html) && /\(2 арт\.\)/.test(co.subject), co && co.subject);
    ok('увредена → регионалният на Карлово (без неактивния)', !!rg && /Увредена стока/.test(rg.subject), rg && rg.subject);
    ok('недоставен → в никое известие', h.fake.mail.every(m => !/АРТ undelivered/.test(m.html)));
    ok('текстът: обект, код + име + количество, подал, „Отворете в портала: Разлики“',
      !!rg && /^Разлики · Карлово · /.test(rg.subject) && /103 АРТ damaged — 3/.test(rg.html) && /Подаде: Управител Карлово/.test(rg.html) && rg.html.indexOf('Отворете в портала: Разлики') >= 0, rg && rg.html);
    const pr = h.fake.push.find(p => JSON.stringify(p.names) === JSON.stringify(['П. Георгиева']));
    ok('push до регионалния по display_name, заглавие „Разлики“', !!pr && pr.title === 'Разлики');
    ok('без жълт toast', !/известието не тръгна/.test(toasts(h)), toasts(h));
    h.close();
  }

  section('7. Празна група / паднал имейл → жълт toast, бланката стои');
  {
    const noCo = DBU.map(u => Object.assign({}, u, { notify_groups: (u.notify_groups || []).filter(g => g !== 'razliki_co') }));
    const h = env(U.store, { users: noCo });
    await submitInterstore(h, ['pack_mismatch', 'damaged']);
    ok('бланката е подадена', repPosts(h).length === 1);
    ok('регионалният пак получава', h.fake.mail.length === 1 && h.fake.mail[0].to[0] === 'p.georgieva@temax.bg');
    ok('жълт toast: група „Разлики — към ЦО" — няма получатели',
      h.calls.toast.some(t => /^Подадено, но известието не тръгна: .*група „Разлики — към ЦО" — няма получатели/.test(t)), toasts(h));
    h.close();
    const h2 = env(U.store, { mailFail: true });
    await submitInterstore(h2, ['wrong_barcode']);
    ok('паднал имейл: бланката е подадена', repPosts(h2).length === 1);
    ok('жълт toast: група „Разлики — грешен баркод" — имейл',
      h2.calls.toast.some(t => t === 'Подадено, но известието не тръгна: група „Разлики — грешен баркод" — имейл'), toasts(h2));
    h2.close();
    const h3 = env(U.store);
    await submitInterstore(h3, ['undelivered', 'excess']);
    ok('само обикновени редове → без известие', repPosts(h3).length === 1 && h3.fake.mail.length === 0 && h3.fake.push.length === 0);
    h3.close();
  }

  section('8. Подсказката във формата');
  {
    const h = env(U.store);
    h.w.openDiffSubmitModal(); await settle();
    const sel = h.doc.getElementById('diff-direction');
    const setDir = async d => { sel.value = d; fire(h.w, sel, 'change'); await settle(); };
    const hintFor = async cat => {
      const c = h.doc.querySelector('#diff-items .diff-item-row .di-cat');
      c.value = cat; fire(h.w, c, 'change');
      return h.doc.querySelector('#diff-items .diff-item-row .di-hint').textContent;
    };
    await setDir('interstore');
    let t = await hintFor('wrong_barcode');
    ok('междускладов × грешен баркод: „➡️ Отива автоматично към ЦО (група „Разлики — грешен баркод“)“', t.indexOf('➡️ Отива автоматично към ЦО (група „Разлики — грешен баркод“)') >= 0 && t.indexOf('Нужен доп. имейл') < 0, t);
    t = await hintFor('similar_item');
    ok('междускладов × сходен: към „Разлики — към ЦО“', t.indexOf('➡️ Отива автоматично към ЦО (група „Разлики — към ЦО“)') >= 0 && t.indexOf('Нужен доп. имейл') < 0, t);
    t = await hintFor('damaged');
    ok('междускладов × увредена: „към регионалния на обекта“', t.indexOf('➡️ Отива автоматично към регионалния на обекта') >= 0, t);
    t = await hintFor('undelivered');
    ok('междускладов × недоставен: без подсказка', t === '', t);
    await setDir('supplier');
    t = await hintFor('wrong_barcode');
    ok('доставчик × грешен баркод: старата „✉️ Нужен доп. имейл до …“', t.indexOf('✉️ Нужен доп. имейл до') >= 0 && t.indexOf('Отива автоматично') < 0, t);
    h.close();
  }

  section('9. admin.js — групите');
  {
    const h = boot({ modules: ['admin.js'], user: U.admin, data: { users: [{ notify_groups: ['razliki_co'], is_regional: false }] } });
    ok('NOTIFY_GROUP_USER_ONLY има razliki_co и razliki_barcode',
      h.w.NOTIFY_GROUP_USER_ONLY.indexOf('razliki_co') >= 0 && h.w.NOTIFY_GROUP_USER_ONLY.indexOf('razliki_barcode') >= 0);
    ok('етикетите', h.w.NOTIFY_GROUP_LABELS.razliki_co === 'Разлики — към ЦО' && h.w.NOTIFY_GROUP_LABELS.razliki_barcode === 'Разлики — грешен баркод');
    h.w.editNotifyGroups('u1', 'Миглена Павлова'); await settle();
    ok('редакторът рисува двете отметки', !!h.doc.querySelector('.ntf-grp-cb[value="razliki_co"]') && !!h.doc.querySelector('.ntf-grp-cb[value="razliki_barcode"]'));
    ok('WHO_BROWSER_MAILS има sdRouteNotify', h.w.WHO_BROWSER_MAILS.some(m => m.sites.indexOf('stock-differences.js:sdRouteNotify') >= 0));
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
