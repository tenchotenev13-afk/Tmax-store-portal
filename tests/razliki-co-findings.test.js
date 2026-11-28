/* Разлики — четирите находки от писмото на Миглена Павлова „тест проблемни
   артикули“ (20.11.2026), решения на Тенчо 22.11.2026.

   1. Съобщението след подаване — към кого отива бланката (sdSubmitToastText):
      доставчик и сторна — „Цветелина ще я прегледа.“; междускладова — по
      редовете (sdLineRoute): склад → „<склад> ще отговори.“, ЦО → „Отива към
      Централен офис.“, регионален → „Отива към регионалния мениджър.“,
      смесени — изредени в едно изречение. Реално подаване през формата.
   2. Логистичният склад не вижда насочените редове: насочен ред не се рисува,
      бланка само с насочени я няма (бланки, „Приети редове“, брояч, търсене,
      Excel, печат, „Действия на магазините“). Обект и офис — всичко, както
      досега. Баджът (пулсът) и чиповете на склада — непроменени числа.
   3. Обектът трие само бланка / ред, подадени от потребител на същия обект
      (sdIsStoreSubmitter): Управител Петрич — без 🗑 и без „Изтрий бланката“
      на бланка от „Миглена Павлова“ (ЦО); на бланка от „Склад Петрич“ — има.
      Свежата проверка преди триенето спира при външен подател.
   4. Имейлът / push при насочване без количество — без „— — бр.“.

   Проверките „няма бутон“ гледат само <button>.

   Мутационна проверка (22.11.2026; мутант върху stock-differences.js, файлът
   върнат от копие и сверен с cmp; чистият код: exit 0, 70/70):
     М1  toast винаги „Цветелина ще я прегледа.“ (т.1)              → 13 ❌
     М2  sdWhHidesLine → false — складът пак вижда насочените (т.2)  →  8 ❌
     М3  без проверка на подателя в sdStoreReportDeletable (т.3)      →  4 ❌
     М3б без проверка на created_by в sdCanStoreDeleteLine (т.3)      →  2 ❌
     М4  старият ред „ — — бр.“ без количество (т.4)                  →  4 ❌
   И петте — exit 1.

   Пускане:  node tests/razliki-co-findings.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks, fire } = H;

const WH = 'Логистичен склад Търговище';
const U = {
  admin:  { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' },
  wh:     { id: 'u-wh', email: 'wh@temax.bg', display_name: 'Склад Търговище', role: 'logistics', store_name: WH },
  mgr:    { id: 'u-pm', email: 'petrich@temax.bg', display_name: 'Управител Петрич', role: 'manager', store_name: 'Петрич' },
  sklad:  { id: 'u-ps', email: 'sklad.petrich@temax.bg', display_name: 'Склад Петрич', role: 'sklad', store_name: 'Петрич' }
};
const DBU = [
  { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', store_name: 'Централен офис', notify_groups: [], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-mp', email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', store_name: 'Централен офис', notify_groups: ['razliki_co', 'razliki_barcode'], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-ng', email: 'n.g@temax.bg', display_name: 'Н. Г.', store_name: 'Централен офис', notify_groups: [], is_regional: true, assigned_stores: ['Петрич'], active: true },
  { id: 'u-wh', email: 'wh@temax.bg', display_name: 'Склад Търговище', store_name: WH, notify_groups: [], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-pm', email: 'petrich@temax.bg', display_name: 'Управител Петрич', store_name: 'Петрич', notify_groups: [], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-ps', email: 'sklad.petrich@temax.bg', display_name: 'Склад Петрич', store_name: 'Петрич', notify_groups: [], is_regional: false, assigned_stores: [], active: true }
];
/* users по URL: store_name=eq.X → само обекта; иначе — всички. */
function usersFor(url) {
  const m = /store_name=eq\.([^&]+)/.exec(url);
  if (!m) return DBU;
  const st = decodeURIComponent(m[1]);
  return DBU.filter(u => u.store_name === st);
}
const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };
const recent = () => new Date(Date.now() - 3600 * 1000).toISOString();

const line = (id, rid, cat, extra) => Object.assign({ id, report_id: rid, store_name: 'Петрич', supplier: WH, material_code: 'S' + id,
  material_name: 'АРТ ' + id, quantity: 2, unit: 'бр.', difference_category: cat, type: null, status: 'new',
  warehouse_response: null, store_response: null, attachments: [], created_by: 'Склад Петрич', created_at: recent() }, extra || {});
const rep = (id, extra) => Object.assign({ id, direction: 'interstore', store_name: 'Петрич', counterpart: WH, document_number: '1800' + id,
  doc_date: '2026-11-20', submitted_by: 'Склад Петрич', general_comment: '', photos: [], reviewed: false, created_at: recent(),
  email_sent_at: null, email_pending: null, email_skipped_at: null }, extra || {});

function env(user, opts) {
  opts = opts || {};
  const fake = { push: [], mail: [] };
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user, confirm: true,
    data: Object.assign({
      stock_differences: () => JSON.parse(JSON.stringify(opts.lines || [])), stock_returns: [], product_catalog: [], suppliers: [],
      transport_orders: [], stock_diff_swaps: [], users: usersFor, contacts: [{ name: 'ТЕСИ ООД' }],
      differences_reports: () => JSON.parse(JSON.stringify(opts.reps || [])), storno_notes: [], storno_note_replies: [],
      sd_problem_articles: []
    }, opts.data || {})
  });
  h.w.pushToPeople = (names, title, msg) => { fake.push.push({ names, title, msg }); return Promise.resolve({ ok: true }); };
  h.w.sendEmail = (to, subject, html) => { fake.mail.push({ to, subject, html }); return Promise.resolve({ ok: true }); };
  h.w.transportOrders = [];
  h.fake = fake;
  return h;
}
async function load(h, view) {
  h.w.sdView = view || 'reports';
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = 'interstore';
  h.w.loadStockDiff(); await settle();
}
const mod = h => h.doc.getElementById('mod-stock-diff');
const card = (h, rid) => h.doc.getElementById('diff-rep-' + rid);
const cardHas = (h, rid, txt) => { const c = card(h, rid); return !!c && c.textContent.indexOf(txt) >= 0; };
const toasts = h => h.calls.toast.join(' | ');

(async function run() {

  /* ── 1. Съобщението след подаване ── */
  const photoInput = h => h.doc.querySelector('#diff-submit-ov input[onchange="diffUploadPhoto(this)"][multiple]');
  async function submitInterstore(h, cats, qty) {
    h.w.openDiffSubmitModal(); await settle();
    const sel = h.doc.getElementById('diff-direction');
    if (sel.value !== 'interstore') { sel.value = 'interstore'; fire(h.w, sel, 'change'); await settle(); }
    h.doc.getElementById('diff-counterpart').value = WH;
    { const _ob = h.doc.getElementById('diff-outbound'); if (_ob) _ob.value = '80478143'; } /* razliki-id-nomer: ИД № задължителен при междускладов */
    const st = h.doc.getElementById('diff-store'); if (st && !st.value) st.value = 'Петрич';
    for (let i = 1; i < cats.length; i++) h.w.addDiffItemRow();
    h.doc.querySelectorAll('#diff-items .diff-item-row').forEach((r, i) => {
      r.querySelector('.di-sap').value = '8779' + i;
      r.querySelector('.di-name').value = 'КАПАК ' + cats[i];
      r.querySelector('.di-qty').value = qty === undefined ? '3' : qty;
      r.querySelector('.di-cat').value = cats[i];
    });
    const pi = photoInput(h);
    const file = new h.w.File([new h.w.Uint8Array([1, 2, 3])], 'снимка.jpg', { type: 'application/octet-stream' });
    Object.defineProperty(pi, 'files', { value: [file], configurable: true });
    fire(h.w, pi, 'change'); await settle();
    realClick(h.w, btn(h.doc.getElementById('diff-submit-ov'), 'Подай бланка')); await settle();
  }
  const repPosts = h => h.calls.post.filter(p => p.table === 'differences_reports');
  const submitted = h => h.calls.toast.filter(t => t.indexOf('✅ Бланката е подадена!') === 0);

  section('1. Toast след подаване — към кого отива бланката');
  {
    const cases = [
      [['undelivered', 'excess'], '✅ Бланката е подадена! Логистичен склад Търговище ще отговори.'],
      [['wrong_barcode', 'pack_mismatch'], '✅ Бланката е подадена! Отива към Централен офис.'],
      [['damaged'], '✅ Бланката е подадена! Отива към регионалния мениджър.'],
      [['undelivered', 'wrong_barcode'], '✅ Бланката е подадена! Отива към склада и към Централен офис.'],
      [['damaged', 'similar_item'], '✅ Бланката е подадена! Отива към Централен офис и към регионалния мениджър.'],
      [['damaged', 'undelivered', 'wrong_barcode'], '✅ Бланката е подадена! Отива към склада, към Централен офис и към регионалния мениджър.']
    ];
    for (const [cats, exp] of cases) {
      const h = env(U.sklad, { reps: [rep('rn')] });
      await submitInterstore(h, cats);
      ok('подадена (' + cats.join('+') + ')', repPosts(h).length === 1, toasts(h));
      const t = submitted(h);
      ok('междускладова ' + cats.join('+') + ' → „' + exp + '“', t.length === 1 && t[0] === exp, toasts(h));
      ok('… без „Цветелина“', t.every(x => x.indexOf('Цветелина') < 0));
      h.close();
    }
    const h = env(U.admin);
    const w = h.w;
    ok('доставчик → „Цветелина ще я прегледа.“ (без промяна)',
      w.sdSubmitToastText('supplier', 'ТЕСИ ООД', [{ difference_category: 'wrong_barcode' }]) === '✅ Бланката е подадена! Цветелина ще я прегледа.');
    ok('сторна → „Цветелина ще я прегледа.“ (без промяна)',
      w.sdSubmitToastText('wrong_receipt', 'ТЕСИ ООД', [{ difference_category: 'damaged' }]) === '✅ Бланката е подадена! Цветелина ще я прегледа.');
    ok('междускладова без редове → като към склада',
      w.sdSubmitToastText('interstore', WH, []) === '✅ Бланката е подадена! Логистичен склад Търговище ще отговори.');
    h.close();
  }

  /* ── 2. Складът не вижда насочените ── */
  const R1 = rep('r1'); /* смесена: 2 насочени + 1 обикновен */
  const R2 = rep('r2'); /* само насочени */
  const R3 = rep('r3', { reviewed: true }); /* приключена смесена — за „Приети редове“ */
  const LINES2 = [
    line('d1', 'r1', 'damaged'), line('b1', 'r1', 'wrong_barcode'), line('u1', 'r1', 'undelivered'),
    line('b2', 'r2', 'wrong_barcode'), line('p2', 'r2', 'pack_mismatch'),
    line('c3', 'r3', 'similar_item', { status: 'received', completed_by: 'Миглена Павлова', completed_at: recent(), resolution_comment: 'ок' }),
    line('u3', 'r3', 'undelivered', { status: 'received', warehouse_response: 'sent', store_response: 'accepted', store_response_at: recent(), completed_at: recent() })
  ];
  section('2. Склад: насочен ред не се рисува, бланка само с насочени — няма я');
  {
    const h = env(U.wh, { reps: [R1, R2, R3], lines: LINES2 });
    await load(h);
    ok('смесената бланка r1 се вижда', !!card(h, 'r1'));
    ok('r1: обикновеният ред АРТ u1 — да', cardHas(h, 'r1', 'АРТ u1'));
    ok('r1: насоченият АРТ d1 (увредена) — не', !cardHas(h, 'r1', 'АРТ d1'));
    ok('r1: насоченият АРТ b1 (грешен баркод) — не', !cardHas(h, 'r1', 'АРТ b1'));
    /* Насоченият надпис (5а). „➡️ Към Контролинг“ (бутонът на склада от
       25.11.2026, razliki-dovarshvane) е друго нещо и тук не се брои. */
    ok('r1: без надписа „➡️ …“', !cardHas(h, 'r1', '➡️ Към ЦО') && !cardHas(h, 'r1', '➡️ При регионалния'));
    ok('бланка r2 (само насочени) — няма я', !card(h, 'r2'));
    ok('в целия модул няма АРТ b2 / АРТ p2', mod(h).textContent.indexOf('АРТ b2') < 0 && mod(h).textContent.indexOf('АРТ p2') < 0);
    ok('броят бланки = 1 (sdReportsCount)', h.w.sdReportsCount() === 1, h.w.sdReportsCount());
    const sw = h.doc.querySelector('#sd-view-switch button[data-sd-view="reports"]');
    ok('превключвателят: „Бланки към мен (1)“', !!sw && sw.textContent === 'Бланки към мен (1)', sw && sw.textContent);
    ok('sdVisibleUnreviewedReports — без r2', h.w.sdVisibleUnreviewedReports().map(r => r.id).join(',') === 'r1');
    /* Търсене по артикул на насочен ред — нищо. */
    h.w.setSDSearch('АРТ b2'); await settle();
    ok('търсене „АРТ b2“ → 0 бланки', h.w.sdReportsCount() === 0);
    h.w.setSDSearch('АРТ d1'); await settle();
    ok('търсене „АРТ d1“ (насочен в смесена) → 0 бланки', h.w.sdReportsCount() === 0);
    h.w.setSDSearch('АРТ u1'); await settle();
    ok('търсене „АРТ u1“ → 1 бланка', h.w.sdReportsCount() === 1);
    h.w.setSDSearch(''); await settle();
    /* „Приети редове“ + Excel: приключеният насочен c3 — не; u3 — да. */
    const rows = h.w.sdTableRows({ status: 'all' }).map(r => r.id).sort().join(',');
    ok('„Приети редове“ / Excel (sdTableRows): само u3', rows === 'u3', rows);
    /* „Действия на магазините“: приключеният от ЦО насочен ред не излиза като „✅ ПРИЕТО“. */
    const acts = h.w.sdCollectActions().map(a => a.what).join(' | ');
    ok('„Действия на магазините“ — без АРТ c3', acts.indexOf('АРТ c3') < 0, acts);
    ok('„Действия на магазините“ — с АРТ u3', acts.indexOf('АРТ u3') >= 0, acts);
    /* Печат на смесената бланка — само ненасочените. */
    h.w.renderDiffPrint(h.w.diffReports.find(r => r.id === 'r1'));
    const pr = h.doc.getElementById('mod-print').textContent;
    ok('печат r1: АРТ u1 — да, АРТ d1 / АРТ b1 — не', pr.indexOf('АРТ u1') >= 0 && pr.indexOf('АРТ d1') < 0 && pr.indexOf('АРТ b1') < 0);
    /* Броячите на склада — непроменени: баджът брои r1 (u1 без отговор), не r2. */
    const badge = h.w.sdUnreviewedCountFor(h.w.diffReports, h.w.sdData, []);
    ok('баджът на склада = 1 (както досега — насочените не се броят)', badge === 1, badge);
    const ch = h.w.sdWhChipLines(h.w.sdVisibleUnreviewedReports().concat(h.w.sdVisibleEmailPendingReports()));
    ok('чип „📝 Без отговор“ = 1 (u1)', ch.noanswer.length === 1 && ch.noanswer[0].id === 'u1');
    ok('sdData не е орязан (затварянето на бланка вижда всички редове)', h.w.sdData.length === LINES2.length);
    /* Изгледът „Приети редове“ — реален клик. */
    realClick(h.w, h.doc.querySelector('#sd-view-switch button[data-sd-view="rows"]')); await settle();
    ok('„Приети редове“: без АРТ c3 на екрана', mod(h).textContent.indexOf('АРТ c3') < 0);
    ok('„Приети редове“: АРТ u3 на екрана', mod(h).textContent.indexOf('АРТ u3') >= 0);
    h.close();
  }
  section('2б. Обект и офис — виждат всичко, както досега');
  for (const [who, u] of [['обект (Управител Петрич)', U.mgr], ['офис (admin)', U.admin]]) {
    const h = env(u, { reps: [R1, R2, R3], lines: LINES2 });
    await load(h);
    ok(who + ': r1 с трите реда', cardHas(h, 'r1', 'АРТ u1') && cardHas(h, 'r1', 'АРТ d1') && cardHas(h, 'r1', 'АРТ b1'));
    ok(who + ': r1 — надписът „➡️ …“ на насочения', cardHas(h, 'r1', '➡️'));
    ok(who + ': r2 се вижда, с двата реда', cardHas(h, 'r2', 'АРТ b2') && cardHas(h, 'r2', 'АРТ p2'));
    h.close();
  }

  /* ── 3. Обектът трие само бланки, подадени от обекта ── */
  const delRepBtns = root => root ? Array.from(root.querySelectorAll('button[onclick^="sdStoreDeleteReport"]')) : [];
  const delLineBtns = root => root ? Array.from(root.querySelectorAll('button[onclick^="sdStoreDeleteLine"]')) : [];
  const RM = rep('rm', { submitted_by: 'Миглена Павлова', counterpart: WH });
  const LM = [line('m1', 'rm', 'wrong_barcode', { created_by: 'Миглена Павлова', material_code: '87793', material_name: 'КАПАК СЕДАЛО' }),
              line('m2', 'rm', 'wrong_barcode', { created_by: 'Миглена Павлова', material_code: '87794', material_name: 'КАПАК СЕДАЛО 2' })];
  const RS = rep('rs');
  const LS = [line('s1', 'rs', 'undelivered'), line('s2', 'rs', 'excess')];
  section('3. Управител Петрич — без 🗑 на бланка от Миглена; с 🗑 на бланка от Склад Петрич');
  {
    const h = env(U.mgr, { reps: [RM, RS], lines: LM.concat(LS) });
    await load(h);
    ok('картата на Миглена е рендирана', !!card(h, 'rm'));
    ok('бланка от „Миглена Павлова“: без „🗑 Изтрий бланката“', delRepBtns(card(h, 'rm')).length === 0);
    ok('бланка от „Миглена Павлова“: без 🗑 на редовете', delLineBtns(card(h, 'rm')).length === 0);
    ok('бланка от „Склад Петрич“: „🗑 Изтрий бланката“ — има', delRepBtns(card(h, 'rs')).length === 1);
    ok('бланка от „Склад Петрич“: 🗑 на двата реда', delLineBtns(card(h, 'rs')).length === 2);
    ok('списъкът с подателите е чел само обекта', h.calls.get.some(u => /\/users\?/.test(u) && u.indexOf('store_name=eq.' + encodeURIComponent('Петрич')) >= 0));
    h.close();
  }
  section('3б. Непрочетен списък с потребители → без бутон');
  {
    const h = env(U.mgr, { reps: [RS], lines: LS });
    h.w.fetch = (orig => (url, o) => (/\/users\?select=display_name/.test(String(url)) ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }), text: () => Promise.resolve('boom') }) : orig(url, o)))(h.w.fetch);
    await load(h);
    ok('провал при четене на users → без „🗑 Изтрий бланката“', !!card(h, 'rs') && delRepBtns(card(h, 'rs')).length === 0);
    ok('… и без 🗑 на редовете', delLineBtns(card(h, 'rs')).length === 0);
    h.close();
  }
  section('3в. Свежата проверка спира при външен подател');
  {
    let dbRep = RS;
    const h = env(U.mgr, { lines: LS, data: { differences_reports: () => [JSON.parse(JSON.stringify(dbRep))] } });
    await load(h);
    const b = delRepBtns(card(h, 'rs'))[0];
    ok('бутонът е там (на екрана подател — Склад Петрич)', !!b);
    dbRep = Object.assign({}, RS, { submitted_by: 'Миглена Павлова' });
    h.calls.del.length = 0;
    realClick(h.w, b); await settle();
    realClick(h.w, h.doc.getElementById('sdsd-go')); await settle();
    ok('0 DELETE', h.calls.del.length === 0, h.calls.del.join(' | '));
    ok('червен toast „Някой вече е действал …“', h.calls.toast.some(t => t.indexOf('не може да се изтрие') >= 0), toasts(h));
    h.close();
  }
  section('3г. Складът и офисът — без бутона на обекта (без промяна)');
  for (const u of [U.wh, U.admin]) {
    const h = env(u, { reps: [RS], lines: LS });
    await load(h);
    ok(u.display_name + ': без sdStoreDeleteReport', delRepBtns(mod(h)).length === 0);
    h.close();
  }

  /* ── 4. Имейлът без количество ── */
  section('4. Насочване без количество — без „— — бр.“');
  {
    const h = env(U.sklad, { reps: [rep('rn')] });
    await submitInterstore(h, ['wrong_barcode', 'pack_mismatch'], '');
    ok('подадена', repPosts(h).length === 1, toasts(h));
    const m = h.fake.mail.find(x => x.html.indexOf('КАПАК wrong_barcode') >= 0);
    ok('имейл с реда има', !!m);
    ok('редът е „87790 КАПАК wrong_barcode“ без количество', !!m && m.html.indexOf('<li>87790 КАПАК wrong_barcode</li>') >= 0, m && m.html);
    ok('в никой имейл „— —“ / „— бр.“', h.fake.mail.every(x => x.html.indexOf('— —') < 0 && x.html.indexOf('— бр') < 0));
    ok('в никой push „— —“ / „— бр.“', h.fake.push.length > 0 && h.fake.push.every(x => x.msg.indexOf('— —') < 0 && x.msg.indexOf('— бр') < 0), JSON.stringify(h.fake.push.map(p => p.msg)));
    h.close();
    const h2 = env(U.sklad, { reps: [rep('rn')] });
    await submitInterstore(h2, ['wrong_barcode'], '3');
    const m2 = h2.fake.mail[0];
    ok('с количество — „87790 КАПАК wrong_barcode — 3 …“ (без промяна)', !!m2 && /<li>87790 КАПАК wrong_barcode — 3( \S+)?<\/li>/.test(m2.html), m2 && m2.html);
    h2.close();
    const w = env(U.admin);
    ok('sdRouteItemText: null → без количество', w.w.sdRouteItemText({ material_code: '87793', material_name: 'КАПАК СЕДАЛО', quantity: null, unit: 'бр.' }) === '87793 КАПАК СЕДАЛО');
    ok('sdRouteItemText: 0 → „— 0 бр.“ (нулата е количество)', w.w.sdRouteItemText({ material_code: '1', material_name: 'X', quantity: 0, unit: 'бр.' }) === '1 X — 0 бр.');
    w.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
