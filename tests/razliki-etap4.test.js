/* Разлики, етап 4 (среща 12.11.2026, уточнение на Тенчо 17.11.2026 —
   и двете отметки са САМО за посока „Доставчик").

   1. „📭 Няма входяща доставка в системата" — отметка до „📄 Стоката е без
      документ", само при 'supplier'; двете се изключват. Поръчката и
      стоковата остават задължителни. POST пише no_inbound true; всяка
      друга посока — false. Бадж в картата, ред в печата, колона в Excel;
      в имейла до доставчика — НЕ.
   2. Бланка към доставчик с no_document или no_inbound → push + имейл до
      групата 'razliki' (users.notify_groups). Провал → жълт toast, бланката
      е подадена; група без членове → жълт toast „няма получатели".
   3. Картата: no_document без стокова → „📄 Без документ — чака документ";
      със стокова (kind 'stokova') → „📄 Документът е добавен".

   pushToPeople / sendEmail са подменени с фалшиви (push.js и email.js не са
   заредени — функцията ги търси по глобално име, тоест подмяната е същият
   път като в браузъра).

   Мутационна проверка (17.11.2026, всеки мутант върху stock-differences.js,
   файлът — върнат от копие и сверен с cmp; чистият код: exit 0, 62/62):
     М1  известието тръгва и при обикновена бланка (без отметка)      → 2 ❌
     М2  отметките не се изключват (diffDocFlagChange не маха другата) → 3 ❌
     М3  no_inbound се пише и при междускладов (без direction проверка) → 1 ❌
     М4  „чака документ" не следи стоковата (винаги „чака")            → 2 ❌
     М5  известието не проверява група 'razliki' (всички активни)       → 4 ❌
   И петте — exit 1.

   Пускане:  node tests/razliki-etap4.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks, fire } = H;

const STORE = { email: 'vraca@temax.bg', display_name: 'Управител Враца', role: 'manager', store_name: 'Враца' };
const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис' };

const USERS = [
  { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', notify_groups: ['controlling', 'razliki'], active: true },
  { email: 'x@temax.bg', display_name: 'Друг Контролинг', notify_groups: ['controlling'], active: true },
  { email: 'old@temax.bg', display_name: 'Неактивен', notify_groups: ['razliki'], active: false },
  { email: 'rv@temax.bg', display_name: 'Преоценка Човек', notify_groups: ['revaluation'], active: true }
];
const USERS_EMPTY = USERS.filter(u => u.notify_groups.indexOf('razliki') < 0 || u.active === false);

const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };

function formEnv(opts) {
  opts = opts || {};
  const fake = { push: [], mail: [] };
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: opts.user || STORE, confirm: true,
    data: {
      stock_differences: [], stock_returns: [], product_catalog: [], suppliers: [], transport_orders: [],
      stock_diff_swaps: [], users: opts.users || USERS, contacts: [{ name: 'ТЕСИ ООД' }],
      differences_reports: [{ id: 'r-new', direction: 'supplier', store_name: 'Враца', counterpart: 'ТЕСИ ООД',
        photos: [], reviewed: false, created_at: '2026-11-17T08:00:00Z' }],
      storno_notes: [], storno_note_replies: []
    }
  });
  h.w.sdData = []; h.w.diffReports = [];
  h.w.pushToPeople = function (names, title, msg) {
    fake.push.push({ names, title, msg });
    return Promise.resolve({ ok: !opts.pushFail });
  };
  h.w.sendEmail = function (to, subject, html) {
    fake.mail.push({ to, subject, html });
    return Promise.resolve({ ok: !opts.mailFail });
  };
  h.fake = fake;
  return h;
}
const ov = h => h.doc.getElementById('diff-submit-ov');
const repPosts = h => h.calls.post.filter(p => p.table === 'differences_reports');
const toasts = h => h.calls.toast.join(' | ');
const noDoc = h => h.doc.getElementById('diff-no-doc');
const noInb = h => h.doc.getElementById('diff-no-inbound');

async function setDir(h, dir) {
  const sel = h.doc.getElementById('diff-direction');
  if (sel.value !== dir) { sel.value = dir; fire(h.w, sel, 'change'); }
  await settle();
  const cp = h.doc.getElementById('diff-counterpart');
  if (!cp.value) {
    if (cp.options.length > 1) cp.selectedIndex = 1;
    else { cp.innerHTML = '<option>ТЕСИ ООД</option>'; cp.value = 'ТЕСИ ООД'; }
  }
}
async function openForm(h, dir, o) {
  o = o || {};
  h.w.openDiffSubmitModal();
  await setDir(h, dir);
  const st = h.doc.getElementById('diff-store');
  if (st && !st.value) st.value = 'Враца';
  const ord = h.doc.getElementById('diff-order-num');
  if (ord) ord.value = o.order === undefined ? '4100135756' : o.order;
  h.doc.getElementById('diff-docnum').value = '';
  const rows = o.rows || 1;
  for (let i = 1; i < rows; i++) h.w.addDiffItemRow && h.w.addDiffItemRow();
  h.doc.querySelectorAll('#diff-items .diff-item-row').forEach(r => {
    r.querySelector('.di-sap').value = '123456';
    r.querySelector('.di-name').value = 'ЛАЙСНА';
    r.querySelector('.di-qty').value = '2';
    if (dir === 'interstore') r.querySelector('.di-cat').value = 'excess';
  });
  if (o.stokova !== false && (dir === 'supplier' || dir === 'wrong_receipt')) {
    const i = h.doc.getElementById('diff-stokova-file');
    if (i) {
      const file = new h.w.File([new h.w.Uint8Array([1, 2, 3])], 'стокова.pdf', { type: 'application/pdf' });
      Object.defineProperty(i, 'files', { value: [file], configurable: true });
      fire(h.w, i, 'change');
      await settle();
    }
  }
}
function check(h, el) { el.checked = true; fire(h.w, el, 'change'); }
async function submit(h) {
  realClick(h.w, btn(ov(h), 'Подай бланка'));
  await settle();
}

(async function run() {

  section('1. Отметката „📭 Няма входяща" — само при Доставчик; двете се изключват');
  {
    const h = formEnv();
    for (const dir of ['interstore', 'wrong_receipt']) {
      h.w.openDiffSubmitModal(); await setDir(h, dir);
      ok(dir + ': няма „Няма входяща" и „Без документ"', !noInb(h) && !noDoc(h));
      h.w.closeDiffSubmitModal();
    }
    h.w.openDiffSubmitModal(); await setDir(h, 'supplier');
    ok('supplier: има и двете отметки', !!noInb(h) && !!noDoc(h));
    const lbl = noInb(h) && noInb(h).parentElement;
    ok('надпис „📭 Няма входяща доставка в системата"', !!lbl && lbl.textContent.indexOf('📭 Няма входяща доставка в системата') >= 0);
    ok('стои веднага след „📄 Стоката е без документ"', !!lbl && !!lbl.previousElementSibling &&
      lbl.previousElementSibling.textContent.indexOf('📄 Стоката е без документ') >= 0);
    check(h, noDoc(h));
    ok('без документ → отметнато', noDoc(h).checked && !noInb(h).checked);
    check(h, noInb(h));
    ok('отметка „Няма входяща" маха „Без документ"', noInb(h).checked && !noDoc(h).checked);
    ok('… и надписът на стоковата е пак „задължителна"', /задължителна/.test(h.doc.getElementById('diff-stokova-hint').textContent));
    check(h, noDoc(h));
    ok('отметка „Без документ" маха „Няма входяща"', noDoc(h).checked && !noInb(h).checked);
    ok('… и стоковата е „по избор"', /по избор/.test(h.doc.getElementById('diff-stokova-hint').textContent));
    h.close();
  }

  section('2. Подаване с „Няма входяща": поръчката и стоковата остават задължителни');
  {
    const h = formEnv();
    await openForm(h, 'supplier', { order: '' });
    check(h, noInb(h));
    await submit(h);
    ok('без поръчка → 0 POST', repPosts(h).length === 0, toasts(h));
    ok('… toast за поръчката', /Поръчка №/.test(toasts(h)), toasts(h));
    h.close();
    const h2 = formEnv();
    await openForm(h2, 'supplier', { stokova: false });
    check(h2, noInb(h2));
    await submit(h2);
    ok('без стокова → 0 POST', repPosts(h2).length === 0, toasts(h2));
    ok('… toast за стоковата', h2.calls.toast.indexOf('Прикачете стоковата разписка на доставчика') >= 0, toasts(h2));
    h2.close();
    const h3 = formEnv();
    await openForm(h3, 'supplier');
    check(h3, noInb(h3));
    ok('„Документ №" е празен', h3.doc.getElementById('diff-docnum').value === '');
    await submit(h3);
    const p = repPosts(h3)[0];
    ok('с поръчка и стокова, без „Документ №" → POST', !!p, toasts(h3));
    ok('no_inbound: true, no_document: false', !!p && p.body.no_inbound === true && p.body.no_document === false, p && JSON.stringify(p.body));
    h3.close();
  }

  section('3. Всяка друга посока / без отметка → no_inbound: false');
  {
    for (const dir of ['supplier', 'interstore', 'wrong_receipt']) {
      const h = formEnv();
      await openForm(h, dir);
      if (dir === 'interstore') {
        /* Отметката я няма в DOM-а; вмъкваме я ръчно — твърдата защита е в submit. */
        h.doc.getElementById('diff-no-doc-wrap').insertAdjacentHTML('beforeend', '<input type="checkbox" id="diff-no-inbound" checked>');
      }
      await submit(h);
      const p = repPosts(h)[0];
      ok(dir + ': POST с no_inbound === false', !!p && p.body.no_inbound === false, p ? JSON.stringify(p.body.no_inbound) : toasts(h));
      ok(dir + ': без известие', h.fake.push.length === 0 && h.fake.mail.length === 0);
      h.close();
    }
  }

  section('4. Известие до групата „Разлики" при „Без документ" и при „Няма входяща"');
  {
    const h = formEnv();
    await openForm(h, 'supplier', { stokova: false, rows: 2 });
    check(h, noDoc(h));
    await submit(h);
    ok('без документ: POST', repPosts(h).length === 1 && repPosts(h)[0].body.no_document === true, toasts(h));
    ok('1 push, 1 имейл', h.fake.push.length === 1 && h.fake.mail.length === 1, JSON.stringify(h.fake));
    const m = h.fake.mail[0] || {}, pu = h.fake.push[0] || {};
    ok('получатели на имейла — само активните от групата', JSON.stringify(m.to) === JSON.stringify(['c.teneva@temax.bg']), JSON.stringify(m.to));
    ok('push по display_name', JSON.stringify(pu.names) === JSON.stringify(['Цветелина Тенева']), JSON.stringify(pu.names));
    ok('тема „Разлики · Враца · ТЕСИ ООД: стока или доставка без документ"', m.subject === 'Разлики · Враца · ТЕСИ ООД: стока или доставка без документ', m.subject);
    ok('push заглавие „Разлики", текстът започва с темата', pu.title === 'Разлики' && String(pu.msg).indexOf('Разлики · Враца · ТЕСИ ООД: стока или доставка без документ') === 0, pu.msg);
    ok('имейлът: подал, поръчка, брой редове, къде', /Подаде: Управител Враца/.test(m.html) && /Поръчка №: 4100135756/.test(m.html) &&
      /Брой редове: 2/.test(m.html) && m.html.indexOf('Отворете в портала: Разлики → Бланки за преглед') >= 0, m.html);
    ok('без жълт toast', !/известието до Снабдяването/.test(toasts(h)), toasts(h));
    h.close();

    const h2 = formEnv();
    await openForm(h2, 'supplier');
    check(h2, noInb(h2));
    await submit(h2);
    const m2 = h2.fake.mail[0] || {};
    ok('няма входяща: тема „…: няма входяща доставка в системата"', m2.subject === 'Разлики · Враца · ТЕСИ ООД: няма входяща доставка в системата', m2.subject);
    ok('няма входяща: и push', h2.fake.push.length === 1);
    h2.close();

    const h3 = formEnv();
    await openForm(h3, 'supplier');
    await submit(h3);
    ok('обикновена бланка към доставчик: POST, без известие', repPosts(h3).length === 1 && h3.fake.push.length === 0 && h3.fake.mail.length === 0, JSON.stringify(h3.fake));
    h3.close();
  }

  section('5. Провалено известие → жълт toast, бланката е подадена');
  {
    const h = formEnv({ mailFail: true });
    await openForm(h, 'supplier');
    check(h, noInb(h));
    await submit(h);
    ok('POST е минал', repPosts(h).length === 1);
    ok('зелен toast за подаването', /Бланката е подадена/.test(toasts(h)), toasts(h));
    ok('жълт toast „Подадено, но известието до Снабдяването не тръгна (имейл)"',
      h.calls.toast.indexOf('Подадено, но известието до Снабдяването не тръгна (имейл)') >= 0, toasts(h));
    h.close();
    const h2 = formEnv({ pushFail: true, mailFail: true });
    await openForm(h2, 'supplier', { stokova: false });
    check(h2, noDoc(h2));
    await submit(h2);
    ok('push и имейл паднали → „(push, имейл)"', h2.calls.toast.indexOf('Подадено, но известието до Снабдяването не тръгна (push, имейл)') >= 0, toasts(h2));
    h2.close();
  }

  section('6. Група без членове → жълт toast „няма получатели"');
  {
    const h = formEnv({ users: USERS_EMPTY });
    await openForm(h, 'supplier');
    check(h, noInb(h));
    await submit(h);
    ok('POST е минал', repPosts(h).length === 1);
    ok('нищо не е пратено', h.fake.push.length === 0 && h.fake.mail.length === 0);
    ok('жълт toast „…няма получатели"', h.calls.toast.some(t => /^Подадено, но известието до Снабдяването няма получатели/.test(t)), toasts(h));
    h.close();
  }

  section('7. Картата: баджовете');
  {
    const REPS = [
      { id: 'r-wait', store_name: 'Враца', direction: 'supplier', counterpart: 'ТЕСИ ООД', document_number: '', doc_date: '2026-11-17',
        submitted_by: 'Враца', general_comment: '', photos: [{ url: 'https://x/a.jpg', name: 'a.jpg' }], reviewed: false, no_document: true, no_inbound: false },
      { id: 'r-added', store_name: 'Враца', direction: 'supplier', counterpart: 'КАМ-04', document_number: '', doc_date: '2026-11-17',
        submitted_by: 'Враца', general_comment: '', photos: [{ url: 'https://x/s.pdf', name: 's.pdf', kind: 'stokova' }], reviewed: false, no_document: true, no_inbound: false },
      { id: 'r-inb', store_name: 'Враца', direction: 'supplier', counterpart: 'ВИКИ', document_number: '', doc_date: '2026-11-17',
        submitted_by: 'Враца', general_comment: '', photos: [{ url: 'https://x/s2.pdf', name: 's2.pdf', kind: 'stokova' }], reviewed: false, no_document: false, no_inbound: true },
      { id: 'r-plain', store_name: 'Враца', direction: 'supplier', counterpart: 'ДРУГ', document_number: '1', doc_date: '2026-11-17',
        submitted_by: 'Враца', general_comment: '', photos: [], reviewed: false, no_document: false }
    ];
    const LINES = REPS.map((r, i) => ({ id: 'l' + i, report_id: r.id, store_name: 'Враца', supplier: r.counterpart,
      material_code: '', material_name: 'АРТ ' + i, quantity: 1, type: null, status: 'new', attachments: [] }));
    const h = formEnv({ user: CVETI });
    h.w.sdData = JSON.parse(JSON.stringify(LINES));
    h.w.diffReports = JSON.parse(JSON.stringify(REPS));
    h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
    h.w.sdDirTab = 'supplier';
    h.w.renderStockDiff();
    const card = id => h.doc.getElementById('diff-rep-' + id);
    const t = id => (card(id) ? card(id).textContent : '');
    ok('четирите бланки са на екрана', REPS.every(r => !!card(r.id)));
    ok('без стокова: „📄 Без документ — чака документ"', /📄 Без документ\s*— чака документ/.test(t('r-wait')), t('r-wait').slice(0, 200));
    ok('без стокова: няма „Документът е добавен"', t('r-wait').indexOf('Документът е добавен') < 0);
    ok('със стокова: „📄 Документът е добавен"', t('r-added').indexOf('📄 Документът е добавен') >= 0, t('r-added').slice(0, 200));
    ok('със стокова: няма „чака документ" и „Без документ"', t('r-added').indexOf('чака документ') < 0 && t('r-added').indexOf('Без документ') < 0);
    ok('no_inbound: бадж „📭 Няма входяща"', t('r-inb').indexOf('📭 Няма входяща') >= 0, t('r-inb').slice(0, 200));
    ok('обикновена: никакъв бадж', !/Без документ|Документът е добавен|Няма входяща/.test(t('r-plain')));
    /* Цвети (admin) вижда „📄 Добави стокова" на бланка без документ. */
    ok('Цвети: „📄 Добави стокова" на бланката без документ', !!card('r-wait') && !!card('r-wait').querySelector('[data-add-stokova-rid="r-wait"]'));
    h.close();

    const ha = formEnv({ user: { email: 'acc@temax.bg', display_name: 'Счетоводител', role: 'accounting', store_name: 'Централен офис' } });
    ha.w.sdData = JSON.parse(JSON.stringify(LINES));
    ha.w.diffReports = JSON.parse(JSON.stringify(REPS));
    ha.w.sdFilter = 'all'; ha.w.sdTypeFilter = 'all'; ha.w.sdStoreFilter = ''; ha.w.sdSearch = '';
    ha.w.sdDirTab = 'supplier';
    ha.w.renderStockDiff();
    const ca = ha.doc.getElementById('diff-rep-r-wait');
    ok('accounting: „📄 Добави стокова" на бланката без документ', !!ca && !!ca.querySelector('[data-add-stokova-rid="r-wait"]'));
    ha.close();
  }

  section('8. Печат, Excel, имейл до доставчика');
  {
    const REP = { id: 'r-inb', store_name: 'Враца', direction: 'supplier', counterpart: 'ВИКИ', document_number: '', doc_date: '2026-11-17',
      submitted_by: 'Враца', general_comment: '', photos: [], reviewed: false, no_document: false, no_inbound: true, created_at: '2026-11-17T08:00:00Z' };
    const REP2 = Object.assign({}, REP, { id: 'r-plain', no_inbound: false, counterpart: 'ДРУГ' });
    const L = [
      { id: 'l1', report_id: 'r-inb', store_name: 'Враца', supplier: 'ВИКИ', material_code: '1', material_name: 'АРТ 1', quantity: 1, type: 'missing', status: 'new', order_number: '4100135756' },
      { id: 'l2', report_id: 'r-plain', store_name: 'Враца', supplier: 'ДРУГ', material_code: '2', material_name: 'АРТ 2', quantity: 1, type: 'missing', status: 'new' }
    ];
    const h = formEnv({ user: CVETI });
    h.w.sdData = JSON.parse(JSON.stringify(L));
    h.w.diffReports = JSON.parse(JSON.stringify([REP, REP2]));
    h.w.renderDiffPrint(h.w.diffReports[0]);
    const pr = h.doc.getElementById('mod-print');
    ok('печат: ред „Входяща доставка: 📭 няма в системата"', !!pr && !!pr.querySelector('.dp-noinb') && /Входяща доставка:\s*📭 няма в системата/.test(pr.querySelector('.dp-noinb').textContent));
    h.w.renderDiffPrint(h.w.diffReports[1]);
    ok('печат без отметката: редът го няма', !h.doc.querySelector('#mod-print .dp-noinb'));
    const aoa = h.w.sdExcelRows(h.w.sdData);
    const col = aoa[0].indexOf('Няма входяща');
    /* От 23.11.2026 след нея е „Чете се като“ (razliki-chete-se-kato). */
    ok('Excel: колона „Няма входяща" (предпоследна, преди „Чете се като")', col === aoa[0].length - 2 && aoa[0][col + 1] === 'Чете се като', JSON.stringify(aoa[0]));
    ok('Excel: „да" при no_inbound, празно иначе', aoa[1][col] === 'да' && aoa[2][col] === '', JSON.stringify([aoa[1][col], aoa[2][col]]));
    ok('Excel: всеки ред е с толкова клетки, колкото заглавия', aoa.every(r => r.length === aoa[0].length));
    const mail = h.w.diffEmailBodyHtml(h.w.diffReports[0], [L[0]], '');
    ok('имейл до доставчика: НЯМА „Няма входяща" / „📭" / „входяща доставка"', !/Няма входяща|📭|входяща доставка/i.test(mail), mail.slice(0, 300));
    h.close();
  }

  section('9. Група „Разлики" в Администрация → Групи');
  {
    const h = boot({ modules: ['admin.js'], user: { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' },
      data: { users: [{ notify_groups: ['razliki'], is_regional: false }] } });
    ok('NOTIFY_GROUP_USER_ONLY има \'razliki\'', h.w.NOTIFY_GROUP_USER_ONLY.indexOf('razliki') >= 0);
    ok('НЕ е в матрицата (NOTIFY_GROUP_ORDER)', h.w.NOTIFY_GROUP_ORDER.indexOf('razliki') < 0);
    ok('етикет „Разлики"', h.w.NOTIFY_GROUP_LABELS.razliki === 'Разлики');
    h.w.editNotifyGroups('u1', 'Цветелина Тенева'); await settle();
    const cb = h.doc.querySelector('.ntf-grp-cb[value="razliki"]');
    ok('редакторът на групите рисува отметка „Разлики", отметната', !!cb && cb.checked && /Разлики/.test(cb.parentElement.textContent));
    const row = h.w.WHO_BROWSER_MAILS.find(m => m.sites.indexOf('stock-differences.js:sdRazlikiNotify') >= 0);
    ok('„Кой какво получава": писмото е в WHO_BROWSER_MAILS', !!row && /група „Разлики"/.test(row.who) && /Снабдяването/.test(row.who) && /стока или доставка без документ/.test(row.mail), row && (row.mail + ' | ' + row.who));
    ok('ролята „разлики" в WHO_ROLE_CATS', h.w.WHO_ROLE_CATS.indexOf('разлики') >= 0);
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
