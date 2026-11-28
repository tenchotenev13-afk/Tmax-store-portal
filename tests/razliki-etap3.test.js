/* Разлики, етап 3 (молби на Цвети 04.11 и 07.11.2026, решение на Тенчо
   16.11.2026 — вариант Б).

   1. „📄 Стокова разписка" — отделно задължително поле във формата: при
      посока 'supplier' без „Без документ" и при 'wrong_receipt' (вкл.
      „🧾 Направи сторно" — същата форма). Файловете влизат в photos като
      {url,name,kind:'stokova'}; снимките остават без kind. Междускладов —
      полето не се рисува. Без стокова → toast, 0 POST.
   2. Баркод вместо SAP код (само цифри, 8+) при доставчик/сторна → бланката
      иска поне една СНИМКА (файл без kind 'stokova'). „Без документ" НЕ
      отменя това.
   3. Картата: „· подадена дд.мм.гггг чч:мм"; стоковата — отделно с
      „📄 Стокова"; стара бланка без kind — както досега. „📄 Добави стокова"
      към подадена бланка → PATCH на photos с kind 'stokova', старите остават.

   Качването минава по истинския път: файл в <input type=file> → change →
   inline onchange → diffUploadPhoto(this[, 'stokova']) → storage → списъкът.
   Файловете са НЕ image/* (diffCompressImage иначе чака img.onload, който
   в jsdom не идва) — за логиката важи само kind.

   Мутационна проверка (16.11.2026, всеки мутант върху stock-differences.js,
   файлът — върнат от копие; чистият код: exit 0, 105/105; числата са от
   втория пуск, с §0):
     М1  стоковата не се иска при сторна (само supplier)             →  3 ❌
     М2  „Без документ" отменя и баркода                             →  3 ❌
     М3  снимката се приема и от стокова (itemPhotos = всички)        →  3 ❌
     М4  kind не се записва във формата (push {url,name})             → 14 ❌
     М5  правилото за баркод — 7+ цифри вместо 8+                     →  2 ❌
     М6  „подадена" през sdFmtDateTime (без часа)                     →  4 ❌
     М7  „📄 Добави стокова" без kind                                 →  1 ❌
     М8  при Междускладов стоковата не се маха                        →  5 ❌
     М9  картата смесва стоковата със снимките                        →  2 ❌
     М10 печатът смесва стоковата със снимките                        →  2 ❌
     М11 полето не се вмъква изобщо (без diffStokovaBlockSync)        → 13 ❌ (3 в §0)
     М12 вмъква се само при смяна на посоката от потребителя          → 13 ❌ (3 в §0)
   И дванадесетте — exit 1.

   §0 — полето е видимо веднага при отваряне: „🧾 Грешен прием" (истински
   клик), „🧾 Направи сторно"; при товарен лист (междускладов) го няма.
   „📝 Подай бланка" отваря с посока по подразбиране „Междускладов" (първата
   опция в селекта) — там полето НЕ се вижда до избор на „Доставчик" (§1).
   Решено така от Тенчо 16.11.2026, не е недовършено: при Междускладов
   стокова не се иска; loading-diff-prefill.test.js не се пипа.

   Пускане:  node tests/razliki-etap3.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks, fire } = H;

const STORE = { email: 'vraca@temax.bg', display_name: 'Управител Враца', role: 'manager', store_name: 'Враца' };
const ADMIN = { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const ACC = { email: 'acc.troyan@temax.bg', display_name: 'Счетоводител Троян',
  role: 'accounting', store_name: 'Централен офис', assigned_stores: ['Троян'] };

const NOTE = { id: 'n-troyan', store_name: 'Троян', supplier: 'ТЕСИ ООД', document_number: 'ФК-111', body: 'ПРОВЕРЕТЕ',
  files: [{ url: 'https://x/storno-notes/a.pdf', name: 'фактура.pdf' }], status: 'open', report_id: null,
  created_by: 'Счетоводител Троян', created_at: '2026-11-15T08:00:00Z', closed_by: null, closed_at: null };

const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };

function formEnv(user, extra) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user || STORE, confirm: true,
    data: Object.assign({
      stock_differences: [], stock_returns: [], product_catalog: [], suppliers: [], transport_orders: [],
      stock_diff_swaps: [], users: [], contacts: [{ name: 'ТЕСИ ООД' }],
      differences_reports: [{ id: 'r-new', direction: 'supplier', store_name: 'Враца', counterpart: 'ТЕСИ ООД',
        photos: [], reviewed: false, created_at: '2026-11-16T08:00:00Z' }],
      storno_notes: [NOTE], storno_note_replies: []
    }, extra || {})
  });
  h.w.sdData = []; h.w.diffReports = [];
  return h;
}
const ov = h => h.doc.getElementById('diff-submit-ov');
const repPosts = h => h.calls.post.filter(p => p.table === 'differences_reports');
const toasts = h => h.calls.toast.join(' | ');

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
/* Отваря формата като обекта: посока, доставчик/склад, поръчка, един ред. */
async function openForm(h, dir, code) {
  h.w.openDiffSubmitModal();
  await setDir(h, dir);
  { const _ob = h.doc.getElementById('diff-outbound'); if (_ob) _ob.value = '80478143'; } /* razliki-id-nomer: ИД № задължителен при междускладов */
  const st = h.doc.getElementById('diff-store');
  if (st && !st.value) st.value = 'Враца';
  const ord = h.doc.getElementById('diff-order-num');
  if (ord) ord.value = '4100135756';
  h.doc.getElementById('diff-docnum').value = '180486328';
  fillRow(h, code);
}
function fillRow(h, code) {
  const r = h.doc.querySelectorAll('#diff-items .diff-item-row')[0];
  r.querySelector('.di-sap').value = code || '';
  r.querySelector('.di-name').value = 'ЛАЙСНА';
  r.querySelector('.di-qty').value = '2';
  if (h.doc.getElementById('diff-direction').value === 'interstore') r.querySelector('.di-cat').value = 'excess';
}
/* Истински файл в истински <input type=file>, change → inline onchange. */
async function uploadVia(h, input, name, type) {
  const file = new h.w.File([new h.w.Uint8Array([1, 2, 3])], name, { type: type || 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fire(h.w, input, 'change');
  await settle();
}
const stokovaInput = h => h.doc.getElementById('diff-stokova-file');
const photoInput = h => h.doc.querySelector('#diff-submit-ov input[onchange="diffUploadPhoto(this)"][multiple]');
async function addStokova(h) {
  const i = stokovaInput(h);
  if (!ok('има контрол за стокова', !!i)) return;
  await uploadVia(h, i, 'стокова.pdf');
}
async function addPhoto(h) {
  const i = photoInput(h);
  if (!ok('има контрол за снимки', !!i)) return;
  await uploadVia(h, i, 'артикул.jpg', 'application/octet-stream');
}
async function submit(h) {
  realClick(h.w, btn(ov(h), 'Подай бланка'));
  await settle();
}
const STK_MSG = 'Прикачете стоковата разписка на доставчика';
const BC_RE = /^Ред 1: кодът изглежда като баркод — прикачете снимка на артикула$/;

(async function run() {

  section('0. Полето се вижда ВЕДНАГА при отваряне — без смяна на посоката');
  {
    /* „🧾 Грешен прием" — истински клик по бутона в модула. */
    const h = formEnv(STORE);
    h.w.sdDirTab = 'supplier'; h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all';
    h.w.renderStockDiff();
    const b = btn(h.doc.getElementById('mod-stock-diff'), '🧾 Грешен прием');
    if (ok('бутон „🧾 Грешен прием"', !!b)) {
      realClick(h.w, b); await settle();
      ok('„🧾 Грешен прием": посока сторна', h.doc.getElementById('diff-direction').value === 'wrong_receipt');
      ok('„🧾 Грешен прием": полето е там без смяна на посоката', !!h.doc.getElementById('diff-stokova-block') && !!stokovaInput(h));
      ok('„🧾 Грешен прием": надпис „задължителна"', /задължителна/.test((h.doc.getElementById('diff-stokova-hint') || {}).textContent || ''));
    }
    h.close();
    /* „🧾 Направи сторно" — от съобщението на счетоводителя. */
    const h2 = formEnv(ACC);
    h2.w.sdNotes = [JSON.parse(JSON.stringify(NOTE))];
    h2.w.sdNoteMakeStorno('n-troyan'); await settle();
    ok('„🧾 Направи сторно": полето е там без смяна на посоката', !!h2.doc.getElementById('diff-stokova-block') && !!stokovaInput(h2));
    h2.close();
    /* Товарен лист — същото извикване като llOpenDiffForItem в loading.js. */
    const h3 = formEnv(STORE);
    h3.w.openDiffSubmitModal({ direction: 'interstore', counterpart: 'Логистичен склад Търговище', document_number: '180486328',
      doc_date: '2026-11-15', comment: 'от товарен лист', items: [{ sap: '111', name: 'АРТ', qty: 1 }] });
    await settle();
    ok('товарен лист (междускладов): полето го няма', !h3.doc.getElementById('diff-stokova-block') && !stokovaInput(h3));
    h3.close();
  }

  section('1. Доставчик: полето е на мястото си, без стокова → 0 POST');
  {
    const h = formEnv();
    await openForm(h, 'supplier', '123456');
    const block = h.doc.getElementById('diff-stokova-block');
    ok('блок „📄 Стокова разписка" е нарисуван', !!block && block.textContent.indexOf('📄 Стокова разписка') >= 0);
    const photoLbl = h.doc.getElementById('diff-photo-hint').parentElement;
    ok('над „Снимки"', !!block && block.nextElementSibling === photoLbl);
    ok('приема снимки и PDF, повече от един файл', !!stokovaInput(h) &&
      /image\/\*/.test(stokovaInput(h).getAttribute('accept')) && /pdf/.test(stokovaInput(h).getAttribute('accept')) &&
      stokovaInput(h).hasAttribute('multiple'));
    await submit(h);
    ok('0 POST', repPosts(h).length === 0, toasts(h));
    ok('toast „' + STK_MSG + '"', h.calls.toast.indexOf(STK_MSG) >= 0, toasts(h));
    h.close();
  }

  section('2. Доставчик със стокова → POST, kind \'stokova\'');
  {
    const h = formEnv();
    await openForm(h, 'supplier', '123456');
    await addStokova(h);
    await addStokova(h); /* втора страница */
    ok('две миниатюри в стоковата', h.doc.querySelectorAll('#diff-stokova-wrap button[data-url]').length === 2);
    ok('нищо в снимките', h.doc.querySelectorAll('#diff-photos-wrap button[data-url]').length === 0);
    await submit(h);
    const p = repPosts(h)[0];
    ok('POST', !!p, toasts(h));
    const ph = (p && p.body.photos) || [];
    ok('в photos — 2 елемента с kind \'stokova\'', ph.length === 2 && ph.every(x => x.kind === 'stokova'), JSON.stringify(ph));
    ok('с url и name', ph.every(x => /\/differences\//.test(x.url) && x.name === 'стокова.pdf'), JSON.stringify(ph));
    h.close();
  }

  section('3. Премахване на качена стокова преди подаване');
  {
    const h = formEnv();
    await openForm(h, 'supplier', '');
    await addStokova(h);
    const x = h.doc.querySelector('#diff-stokova-wrap button[data-url]');
    if (ok('бутон ✕ на стоковата', !!x)) realClick(h.w, x);
    ok('миниатюрата изчезна', h.doc.querySelectorAll('#diff-stokova-wrap button[data-url]').length === 0);
    ok('и от diffPendingPhotos', h.w.diffPendingPhotos.length === 0, JSON.stringify(h.w.diffPendingPhotos));
    await submit(h);
    ok('→ отново 0 POST и toast', repPosts(h).length === 0 && h.calls.toast.indexOf(STK_MSG) >= 0, toasts(h));
    h.close();
  }

  section('4. Доставчик с „Без документ" без стокова → POST');
  {
    const h = formEnv();
    await openForm(h, 'supplier', '');
    const nd = h.doc.getElementById('diff-no-doc');
    nd.checked = true; fire(h.w, nd, 'change');
    ok('надписът става „по избор"', /по избор/.test(h.doc.getElementById('diff-stokova-hint').textContent));
    await submit(h);
    ok('POST', repPosts(h).length === 1 && repPosts(h)[0].body.no_document === true, toasts(h));
    h.close();
  }

  section('5. Сторна от формата: без стокова → 0 POST; със стокова → POST');
  {
    const h = formEnv();
    await openForm(h, 'wrong_receipt', '');
    await submit(h);
    ok('без стокова: 0 POST', repPosts(h).length === 0, toasts(h));
    ok('без стокова: toast', h.calls.toast.indexOf(STK_MSG) >= 0, toasts(h));
    await addStokova(h);
    await submit(h);
    const p = repPosts(h)[0];
    ok('със стокова: POST wrong_receipt', !!p && p.body.direction === 'wrong_receipt', toasts(h));
    ok('със стокова: kind \'stokova\'', !!p && p.body.photos.some(x => x.kind === 'stokova'));
    h.close();
  }

  section('6. „🧾 Направи сторно" (счетоводител) — същото изискване');
  {
    const h = formEnv(ACC);
    h.w.sdNotes = [JSON.parse(JSON.stringify(NOTE))];
    h.w.sdNoteMakeStorno('n-troyan');
    await settle();
    ok('формата е отворена, посока сторна', !!ov(h) && h.doc.getElementById('diff-direction').value === 'wrong_receipt');
    ok('полето за стокова е там', !!h.doc.getElementById('diff-stokova-block'));
    h.doc.getElementById('diff-order-num').value = '4100135756';
    fillRow(h, '');
    await submit(h);
    ok('без стокова: 0 POST', repPosts(h).length === 0, toasts(h));
    ok('без стокова: toast', h.calls.toast.indexOf(STK_MSG) >= 0, toasts(h));
    ok('файловете на съобщението НЕ влизат сами', h.w.diffPendingPhotos.length === 0);
    await addStokova(h);
    await submit(h);
    const p = repPosts(h)[0];
    ok('със стокова: POST', !!p && p.body.direction === 'wrong_receipt' && p.body.store_name === 'Троян', toasts(h));
    ok('със стокова: kind \'stokova\'', !!p && p.body.photos.some(x => x.kind === 'stokova'));
    h.close();
  }

  section('7. Междускладов: полето го няма, без файлове → POST');
  {
    const h = formEnv();
    await openForm(h, 'interstore', '');
    ok('няма блок за стокова', !h.doc.getElementById('diff-stokova-block'));
    ok('няма контрол за стокова', !stokovaInput(h));
    await submit(h);
    ok('POST', repPosts(h).length === 1 && repPosts(h)[0].body.direction === 'interstore', toasts(h));
    ok('photos е празен', repPosts(h)[0] && repPosts(h)[0].body.photos.length === 0);
    h.close();
  }

  section('8. Смяна Доставчик → Междускладов маха качената стокова; Доставчик ↔ Сторна я пази');
  {
    const h = formEnv();
    await openForm(h, 'supplier', '');
    await addStokova(h);
    await setDir(h, 'wrong_receipt');
    ok('Доставчик → Сторна: стоковата остава', h.w.diffPendingPhotos.length === 1 &&
      h.doc.querySelectorAll('#diff-stokova-wrap button[data-url]').length === 1);
    await setDir(h, 'interstore');
    ok('→ Междускладов: блокът е махнат', !h.doc.getElementById('diff-stokova-block'));
    ok('→ Междускладов: и от diffPendingPhotos', h.w.diffPendingPhotos.length === 0, JSON.stringify(h.w.diffPendingPhotos));
    h.close();
  }

  section('9. Баркод (13 цифри) при доставчик: само стокова → 0 POST; със снимка → POST');
  {
    const h = formEnv();
    await openForm(h, 'supplier', '3800123456789');
    await addStokova(h);
    await submit(h);
    ok('само стокова: 0 POST', repPosts(h).length === 0, toasts(h));
    ok('toast за баркод', h.calls.toast.some(t => BC_RE.test(t)), toasts(h));
    await addPhoto(h);
    await submit(h);
    const p = repPosts(h)[0];
    ok('със снимка: POST', !!p, toasts(h));
    ok('снимката е без kind, стоковата — с', !!p && p.body.photos.filter(x => !x.kind).length === 1 &&
      p.body.photos.filter(x => x.kind === 'stokova').length === 1, p && JSON.stringify(p.body.photos));
    h.close();
  }

  section('10. 7-цифрен код → POST без снимка; 8 цифри → спира');
  {
    const h = formEnv();
    await openForm(h, 'supplier', '1234567');
    await addStokova(h);
    await submit(h);
    ok('7 цифри: POST', repPosts(h).length === 1, toasts(h));
    h.close();
    const h2 = formEnv();
    await openForm(h2, 'supplier', '12345678');
    await addStokova(h2);
    await submit(h2);
    ok('8 цифри (границата): 0 POST', repPosts(h2).length === 0, toasts(h2));
    ok('8 цифри: toast за баркод', h2.calls.toast.some(t => BC_RE.test(t)), toasts(h2));
    h2.close();
    const h3 = formEnv();
    await openForm(h3, 'supplier', '1234 5678');
    await addStokova(h3);
    await submit(h3);
    ok('цифри с интервал (не „само цифри"): POST', repPosts(h3).length === 1, toasts(h3));
    h3.close();
  }

  section('11. Баркод при сторна → същото правило');
  {
    const h = formEnv();
    await openForm(h, 'wrong_receipt', '3800123456789');
    await addStokova(h);
    await submit(h);
    ok('сторна, само стокова: 0 POST', repPosts(h).length === 0 && h.calls.toast.some(t => BC_RE.test(t)), toasts(h));
    h.close();
  }

  section('12. „Без документ" НЕ отменя баркода');
  {
    const h = formEnv();
    await openForm(h, 'supplier', '3800123456789');
    const nd = h.doc.getElementById('diff-no-doc');
    nd.checked = true; fire(h.w, nd, 'change');
    await submit(h);
    ok('без документ + баркод, без снимка: 0 POST', repPosts(h).length === 0, toasts(h));
    ok('toast за баркод', h.calls.toast.some(t => BC_RE.test(t)), toasts(h));
    await addPhoto(h);
    await submit(h);
    ok('със снимка: POST', repPosts(h).length === 1, toasts(h));
    h.close();
    const h2 = formEnv();
    await openForm(h2, 'supplier', '1234567');
    const nd2 = h2.doc.getElementById('diff-no-doc');
    nd2.checked = true; fire(h2.w, nd2, 'change');
    await submit(h2);
    ok('без документ + 7 цифри, без файлове: POST', repPosts(h2).length === 1, toasts(h2));
    h2.close();
  }

  section('13. Междускладов с 13-цифрен код → правилото не важи');
  {
    const h = formEnv();
    await openForm(h, 'interstore', '3800123456789');
    await submit(h);
    ok('POST без файлове', repPosts(h).length === 1, toasts(h));
    h.close();
  }

  section('14. Картата: „подадена …", стоковата отделно, стара бланка — както досега');
  {
    const REP_NEW = { id: 'rep-n', direction: 'supplier', store_name: 'Враца', counterpart: 'ТЕСИ ООД',
      document_number: '180486328', doc_date: '2026-11-14', submitted_by: 'Управител Враца', general_comment: '',
      reviewed: false, created_at: '2026-11-15T08:05:00Z',
      photos: [{ url: 'https://x/differences/a.jpg', name: 'a.jpg' },
               { url: 'https://x/differences/s.pdf', name: 's.pdf', kind: 'stokova' }] };
    const REP_OLD = { id: 'rep-o', direction: 'supplier', store_name: 'Враца', counterpart: 'ТЕСИ ООД',
      document_number: '1', doc_date: '2026-11-01', submitted_by: 'Управител Враца', general_comment: '',
      reviewed: false, created_at: '2026-11-01T06:00:00Z',
      photos: [{ url: 'https://x/differences/old.jpg', name: 'old.jpg' }, { url: 'https://x/differences/old.pdf', name: 'old.pdf' }] };
    const LN = (rid, id) => ({ id: id, report_id: rid, store_name: 'Враца', supplier: 'ТЕСИ ООД', material_code: '111',
      material_name: 'АРТ', quantity: 1, status: 'new', type: null, attachments: [], created_at: '2026-11-15T08:05:00Z' });
    for (const [who, u] of [['admin', ADMIN], ['обект', STORE]]) {
      const h = formEnv(u);
      h.w.diffReports = [REP_NEW, REP_OLD].map(r => JSON.parse(JSON.stringify(r)));
      h.w.sdData = [LN('rep-n', 'l1'), LN('rep-o', 'l2')];
      h.w.sdDirTab = 'supplier'; h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all';
      h.w.renderStockDiff();
      const c = h.doc.getElementById('diff-rep-rep-n');
      if (ok(who + ': картата е нарисувана', !!c)) {
        ok(who + ': „· подадена 15.11.2026 10:05" (София)', c.textContent.indexOf('· подадена 15.11.2026 10:05') >= 0,
          (c.querySelector('.sd-rep-submitted') || {}).textContent);
        const stk = c.querySelector('.sd-rep-stokova');
        ok(who + ': секция „📄 Стокова" с файла', !!stk && stk.textContent.indexOf('📄 Стокова') >= 0 &&
          !!stk.querySelector('a[href="https://x/differences/s.pdf"]'));
        ok(who + ': стоковата НЕ е сред снимките', !stk || !stk.querySelector('a[href="https://x/differences/a.jpg"]'));
        const all = Array.from(c.querySelectorAll('a[href="https://x/differences/s.pdf"]'));
        ok(who + ': стоковата е показана веднъж', all.length === 1, String(all.length));
        ok(who + ': снимката е извън секцията', !!c.querySelector('a[href="https://x/differences/a.jpg"]'));
        const pb = Array.prototype.find.call(c.querySelectorAll('button'), b => /loadDiffPrint\(/.test(b.getAttribute('onclick') || ''));
        if (ok(who + ': 🖨 в картата', !!pb)) {
          realClick(h.w, pb, '🖨 Печат');
          await settle();
          const pr = h.doc.getElementById('mod-print');
          const secs = Array.from(pr.querySelectorAll('.dp-sec')).map(s => s.textContent);
          ok(who + ': печат — секция „📄 Стокова (1)"', secs.indexOf('📄 Стокова (1)') >= 0, JSON.stringify(secs));
          ok(who + ': печат — стоковата е в #dp-stokova', !!pr.querySelector('#dp-stokova') &&
            pr.querySelector('#dp-stokova').textContent.indexOf('s.pdf') >= 0);
          ok(who + ': печат — „Снимки към бланката (1)", без „Прикачени документи"',
            secs.indexOf('Снимки към бланката (1)') >= 0 && !secs.some(s => /Прикачени документи/.test(s)), JSON.stringify(secs));
          /* Обратно към модула; зареждането е асинхронно — изчаква се, преди
             h.close(), иначе таймерът му гърми върху затворен прозорец. */
          h.w.showModule('stock-diff'); await settle();
          h.w.diffReports = [REP_NEW, REP_OLD].map(r => JSON.parse(JSON.stringify(r)));
          h.w.sdData = [LN('rep-n', 'l1'), LN('rep-o', 'l2')];
          h.w.renderStockDiff();
        }
      }
      const o = h.doc.getElementById('diff-rep-rep-o');
      if (ok(who + ': старата карта', !!o)) {
        ok(who + ': стара бланка — без „📄 Стокова" секция', !o.querySelector('.sd-rep-stokova'));
        ok(who + ': старите два файла са на мястото си', !!o.querySelector('a[href="https://x/differences/old.jpg"] img') &&
          !!o.querySelector('a[href="https://x/differences/old.pdf"]'));
        ok(who + ': и тя е с „подадена"', o.textContent.indexOf('· подадена 01.11.2026 08:00') >= 0);
      }
      h.close();
    }
  }

  section('15. „📄 Добави стокова" към подадена бланка → PATCH, старите остават');
  {
    const REP = { id: 'rep-a', direction: 'supplier', store_name: 'Враца', counterpart: 'ТЕСИ ООД', document_number: '1',
      doc_date: '2026-11-14', reviewed: false, created_at: '2026-11-15T08:05:00Z', general_comment: '',
      photos: [{ url: 'https://x/differences/old.jpg', name: 'old.jpg' }] };
    const h = formEnv(STORE);
    h.w.diffReports = [JSON.parse(JSON.stringify(REP))];
    h.w.sdData = [{ id: 'l1', report_id: 'rep-a', store_name: 'Враца', supplier: 'ТЕСИ ООД', material_name: 'АРТ',
      quantity: 1, status: 'new', type: null, attachments: [], created_at: '2026-11-15T08:05:00Z' }];
    h.w.sdDirTab = 'supplier'; h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all';
    h.w.renderStockDiff();
    const lbl = h.doc.querySelector('[data-add-stokova-rid="rep-a"]');
    ok('бутонът „📄 Добави стокова" е до „📷 Добави снимка"', !!lbl && lbl.textContent.indexOf('📄 Добави стокова') >= 0 &&
      !!h.doc.querySelector('[data-add-photo-rid="rep-a"]'));
    const inp = lbl && lbl.querySelector('input[type=file]');
    if (ok('има input', !!inp)) await uploadVia(h, inp, 'стокова-късна.pdf');
    const p = h.calls.patch.filter(x => x.table === 'differences_reports').pop();
    if (ok('PATCH на differences_reports', !!p, toasts(h))) {
      const arr = p.body.photos || [];
      ok('старата снимка е запазена, без kind', arr[0] && arr[0].url === 'https://x/differences/old.jpg' && !arr[0].kind);
      ok('новият елемент е с kind \'stokova\'', arr.length === 2 && arr[1].kind === 'stokova' && arr[1].name === 'стокова-късна.pdf',
        JSON.stringify(arr));
    }
    /* „📷 Добави снимка" си остава за снимки — без kind. */
    const ph = h.doc.querySelector('[data-add-photo-rid="rep-a"] input[type=file]');
    if (ph) await uploadVia(h, ph, 'снимка.pdf');
    const p2 = h.calls.patch.filter(x => x.table === 'differences_reports').pop();
    ok('„📷 Добави снимка" → без kind', !!p2 && p2 !== p && !p2.body.photos[p2.body.photos.length - 1].kind,
      p2 && JSON.stringify(p2.body.photos));
    h.close();
    /* Междускладова бланка — без „Добави стокова". */
    const h2 = formEnv(STORE);
    h2.w.diffReports = [Object.assign(JSON.parse(JSON.stringify(REP)), { direction: 'interstore', counterpart: 'Логистичен склад Търговище' })];
    h2.w.sdData = [{ id: 'l1', report_id: 'rep-a', store_name: 'Враца', supplier: 'Логистичен склад Търговище', material_name: 'АРТ',
      quantity: 1, status: 'new', type: null, attachments: [], created_at: '2026-11-15T08:05:00Z' }];
    h2.w.sdDirTab = 'interstore'; h2.w.sdFilter = 'all'; h2.w.sdTypeFilter = 'all';
    h2.w.renderStockDiff();
    ok('междускладова: има „📷 Добави снимка"', !!h2.doc.querySelector('[data-add-photo-rid="rep-a"]'));
    ok('междускладова: няма „📄 Добави стокова"', !h2.doc.querySelector('[data-add-stokova-rid="rep-a"]'));
    h2.close();
  }

  section('16. Печат и имейл: стоковата отделно и тръгва с писмото');
  {
    const REP = { id: 'rep-p', direction: 'supplier', store_name: 'Враца', counterpart: 'ТЕСИ ООД', document_number: '1',
      doc_date: '2026-11-14', reviewed: false, created_at: '2026-11-15T08:05:00Z', general_comment: '',
      photos: [{ url: 'https://x/differences/a.jpg', name: 'a.jpg' }, { url: 'https://x/differences/s.pdf', name: 's.pdf', kind: 'stokova' }] };
    const h = formEnv(ADMIN);
    const body = h.w.diffEmailBodyHtml(REP, [], '');
    ok('имейл: казва за стоковата и снимката', body.indexOf('стоковата разписка (1 файл) и 1 снимка') >= 0, body.slice(-400));
    const old = h.w.diffEmailBodyHtml(Object.assign({}, REP, { photos: [{ url: 'https://x/a.jpg', name: 'a.jpg' }] }), [], '');
    ok('имейл, стара бланка: старият ред без промяна', old.indexOf('📎 Прикачени са 1 снимка към този имейл.') >= 0);
    h.close();
  }

  report();
})();
