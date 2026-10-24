/* Разлики → „Сторна по грешен прием": „✍️ Счетоводител", етап 1 (Цветелина,
   23.10.2026). Оперативният счетоводител пише на обекта свободен текст +
   документ (storno_notes), обектът отговаря (storno_note_replies), а при
   реално сторно „🧾 Направи сторно" отваря обичайната бланка за грешен прием
   и след УСПЕШНОТО ѝ подаване отбелязва съобщението {status:'storno',
   report_id}. Без известия (етап 2).
     а) accounting с ['Троян']: бутонът, формата само с Троян, POST; без текст — отказ;
     б) магазин: без бутона, вижда само своя обект, отговор със side 'store';
     в) accounting → side 'accounting', Цвети → 'co';
     г) „Направи сторно" от магазина → попълнена бланка → PATCH {storno, report_id};
        провал на PATCH-а → червен toast, маркер, „Опитай пак", без „✅";
     г2) частичен запис (бланката без артикулите) → съобщението пак се свързва
         с бланката, червеното за артикулите излиза последно;
     д) „Затвори" → closed + closed_by/at; затвореното е зад чипа „Затворени";
     е) ЦО само за преглед — вижда, без <button> в картите; логистичен склад — нищо;
     ж) другите подтабове — без секцията и без бутона; броячите не смесват;
     з) поправки 23.10: запис от „Решени редове" → изгледът „Бланки"; „Сервиз Троян"
        (app_settings.report_excluded_stores) не е във формата; без поле за отговор
        при затворено / пуснато за сторно, sdNoteSendReply отказва;
     и) „Магазин" в „📝 Подай бланка" и „+ Добави ръчно" — loadReportableStores()
        за общия списък; складът вижда своя; „Обект изпращач" пази складовете;
        редакция на запис с изключен обект пази стойността;
     к) „🗑 Изтрий" (24.10) — Цвети (admin и accounting с нейния имейл) на отворено,
        пуснато и затворено; accounting, обектът и ЦО преглед — без <button>;
     л) клик + confirm → DELETE storno_notes?id=eq.<id> (отговорите — cascade);
        0 изтрити реда (няма политика) → червен toast, картата остава;
        отказ → нищо; провал → червен toast, картата остава;
     м) изтрита бланка за сторно → PATCH storno_notes?report_id=eq.<id>
        {status:'open', report_id:null} ПРЕДИ двата DELETE; паднал PATCH →
        нито един DELETE; бланка от друга посока — без PATCH.

   Изтриване (к–м), 24.10.2026 — и шестте падат с exit 1:
     X1 „🗑 Изтрий" за всички                                      → 4 ❌
     X2 изтриване без confirm                                      → 3 ❌
     X3 бланката се трие въпреки паднал PATCH                      → 2 ❌
     X4 без PATCH на съобщението                                   → 6 ❌
     X5 PATCH без report_id:null                                   → 1 ❌
     X6 паднал DELETE → картата изчезва                             → 3 ❌

   Мутационна проверка (23.10.2026) — exit 1 при всички освен M6:
     M1 магазинът вижда чуждия обект (sdNoteVisible → true)        → 3 ❌
     M2 провал на PATCH-а след сторно глътнат тихо                 → 4 ❌
     M3 бутонът „Счетоводител" и за магазина                       → 1 ❌
     M4 accounting отговаря със side 'co'                          → 1 ❌
     M5 секцията и в Доставчици / Междускладови                    → 2 ❌
     M7 заявката без филтър по обект                               → 1 ❌
     M8 PATCH без report_id                                        → 4 ❌
     M9 „Затвори" без closed_by/at                                 → 1 ❌
     M10 частичен запис (без артикулите) не свързва съобщението     → 2 ❌
     M11 частичен запис: „✅" вместо червеното за артикулите        → 2 ❌
     M6 (махната проверка sdIsCOViewer в sdNoteCanAct) ОЦЕЛЯВА —
        еквивалентен: ЦО само за преглед отпада и през canSubmitDiff().
   Поправки 23.10 (з) — и четирите падат с exit 1:
     F1 без превключване на изгледа след запис                    → 3 ❌
     F2 списъкът „Обект" пак от users (със „Сервиз Троян")        → 2 ❌
     F3a поле за отговор и при затворено / пуснато                 → 3 ❌
     F3b sdNoteSendReply без отказ за приключено                   → 1 ❌
   „Магазин" в двете форми (и) — и петте падат с exit 1:
     S1 „Подай бланка" пак от users (ЦО махнат, останалите — не)   → 1 ❌
     S2 „+ Добави ръчно" пак от users                              → 2 ❌
     S3 редакцията губи изключения обект                           → 1 ❌
     S4 складът получава общия списък                              → 1 ❌
     S5 „Обект изпращач" (interstore) без складовете               → 1 ❌

   Пускане:  node tests/storno-notes.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const ACC = { email: 'acc.troyan@temax.bg', display_name: 'Счетоводител Троян',
  role: 'accounting', store_name: 'Централен офис', assigned_stores: ['Троян'] };
const MGR = { email: 'troyan@temax.bg', display_name: 'Управител Троян',
  role: 'manager', store_name: 'Троян', assigned_stores: [] };
const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const VIEWER = { email: 'supply@temax.bg', display_name: 'Снабдяване',
  role: 'supply', store_name: 'Централен офис', assigned_stores: [] };
const WH = { email: 'lst@temax.bg', display_name: 'ЛС Търговище',
  role: 'sklad', store_name: 'Логистичен склад Търговище', assigned_stores: [] };

const NOTES = [
  { id: 'n-troyan', store_name: 'Троян', supplier: 'ТЕСИ ООД', document_number: 'ФК-111', body: 'ПРОВЕРЕТЕ ТРОЯН',
    files: [{ url: 'https://x/storno-notes/a.pdf', name: 'фактура.pdf' }], status: 'open', report_id: null,
    created_by: 'Счетоводител Троян', created_at: '2026-10-23T08:00:00Z', closed_by: null, closed_at: null },
  { id: 'n-vraca', store_name: 'Враца', supplier: null, document_number: null, body: 'ПРОВЕРЕТЕ ВРАЦА',
    files: [], status: 'open', report_id: null,
    created_by: 'Друг счетоводител', created_at: '2026-10-23T07:00:00Z', closed_by: null, closed_at: null },
  { id: 'n-old', store_name: 'Троян', supplier: null, document_number: null, body: 'СТАРО ЗАТВОРЕНО',
    files: [], status: 'closed', report_id: null,
    created_by: 'Счетоводител Троян', created_at: '2026-10-20T07:00:00Z', closed_by: 'Цветелина Тенева', closed_at: '2026-10-21T07:00:00Z' }
];
const REPLIES = [
  { id: 'rp-1', note_id: 'n-troyan', body: 'ЩЕ ПРОВЕРИМ', files: [], side: 'store', created_by: 'Управител Троян', created_at: '2026-10-23T09:00:00Z' }
];

/* „Базата": PATCH-ите по storno_notes се прилагат при следващия GET, а
   POST-натите бланки се връщат с id, както на живо. */
function env(user, opts) {
  opts = opts || {};
  let h;
  const notes = () => {
    const out = JSON.parse(JSON.stringify(NOTES));
    (h ? h.calls.patch : []).filter(p => p.table === 'storno_notes' && !(opts.fail && opts.fail.PATCH)).forEach(p => {
      const m = /id=eq\.([^&]+)/.exec(p.url);
      const n = m && out.find(x => x.id === decodeURIComponent(m[1]));
      if (n) Object.assign(n, p.body);
    });
    return out;
  };
  const reps = () => (h ? h.calls.post : []).filter(p => p.table === 'differences_reports')
    .map((p, i) => Object.assign({ id: 'rep-' + (i + 1), created_at: '2026-10-23T10:0' + i + ':00Z', photos: [] }, p.body))
    .reverse();
  const byStore = (rows, url) => {
    const eq = /store_name=eq\.([^&]+)/.exec(url);
    if (eq) return rows.filter(r => r.store_name === decodeURIComponent(eq[1]));
    const inn = /store_name=in\.\(([^)]*)\)/.exec(url);
    if (inn) { const s = inn[1].split(',').map(decodeURIComponent); return rows.filter(r => s.indexOf(r.store_name) >= 0); }
    return rows;
  };
  h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user, confirm: true, fail: opts.fail,
    data: {
      /* БЕЗ филтър по обект: заявката се проверява отделно (б), а видимостта в
         клиента трябва да издържи и когато базата върне повече. */
      storno_notes: () => notes(),
      storno_note_replies: () => REPLIES,
      differences_reports: url => byStore(reps(), url),
      stock_differences: [], stock_returns: [], transport_orders: [], stock_diff_swaps: [],
      /* „Сервиз Троян" има акаунт (от 23.10.2026), но е в
         app_settings.report_excluded_stores — признакът от базата. */
      users: [{ store_name: 'Троян' }, { store_name: 'Враца' }, { store_name: 'Централен офис' },
              { store_name: 'Сервиз Троян' }, { store_name: 'Логистичен склад Добрич' }],
      app_settings: [{ key: 'report_excluded_stores', value: JSON.stringify(['Централен офис', 'Логистичен склад Добрич',
        'Логистичен склад Търговище', 'Пазарджик', 'Сервиз Троян']) }],
      contacts: [], stores: []
    }
  });
  h.w.transportOrders = [];
  h.w.sdView = opts.view || 'reports';
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = opts.dir || 'wrong_receipt';
  h.w.loadAllSuppliers = () => Promise.resolve(['ТЕСИ ООД', 'КАМ-04']);
  h.w.loadStockDiff();
  return h;
}
const settle = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 15)); await ticks(); } };
const mod = h => h.doc.getElementById('mod-stock-diff');
const card = (h, id) => h.doc.getElementById('sd-note-' + id);
const cardIds = h => Array.prototype.map.call(mod(h).querySelectorAll('.sd-note-card'), c => c.getAttribute('data-note-id'));
const posts = (h, t) => h.calls.post.filter(p => p.table === t);
const patches = (h, t) => h.calls.patch.filter(p => p.table === t);

async function reply(h, id, text) {
  card(h, id).querySelector('textarea').value = text;
  realClick(h.w, btn(card(h, id), 'Изпрати'));
  await settle();
}

(async function run() {

  section('а) accounting с ["Троян"]: бутон, форма само с Троян, запис');
  {
    const h = env(ACC); await settle();
    const b = btn(mod(h), '✍️ Счетоводител');
    if (ok('бутонът „✍️ Счетоводител" се вижда', !!b)) {
      ok('стои след „+ Добави ръчно"', !!(b.previousElementSibling && /Добави ръчно/.test(b.previousElementSibling.textContent)),
        b.previousElementSibling && b.previousElementSibling.textContent);
      realClick(h.w, b); await settle();
      const sel = h.doc.getElementById('sd-note-store');
      const opts = sel ? Array.prototype.map.call(sel.options, o => o.value).filter(Boolean) : [];
      ok('формата предлага само Троян', opts.join('|') === 'Троян', opts.join('|'));
      ok('подсказки за доставчик (същият списък)', h.doc.querySelectorAll('#sd-note-suppliers option').length === 2);
      /* без текст */
      realClick(h.w, btn(h.doc.getElementById('sd-note-ov'), 'Запиши')); await settle();
      ok('без текст → toast „Напиши текст"', h.calls.toast.some(t => /Напиши текст/.test(t)), h.calls.toast.join(' | '));
      ok('без текст → няма POST', posts(h, 'storno_notes').length === 0);
      h.doc.getElementById('sd-note-supplier').value = 'ТЕСИ ООД';
      h.doc.getElementById('sd-note-doc').value = '4600179694';
      h.doc.getElementById('sd-note-body').value = '  Фактурата е за 5 бр., приети 3  ';
      realClick(h.w, btn(h.doc.getElementById('sd-note-ov'), 'Запиши')); await settle();
      const p = posts(h, 'storno_notes')[0];
      if (ok('POST storno_notes', !!p, h.calls.toast.join(' | '))) {
        const bd = p.body;
        ok('полетата', bd.store_name === 'Троян' && bd.supplier === 'ТЕСИ ООД' && bd.document_number === '4600179694' &&
          bd.body === 'Фактурата е за 5 бр., приети 3' && bd.status === 'open' && bd.created_by === 'Счетоводител Троян' &&
          Array.isArray(bd.files) && bd.files.length === 0, JSON.stringify(bd));
        ok('модалът е затворен', !h.doc.getElementById('sd-note-ov'));
        ok('новото съобщение е в отворените', mod(h).querySelector('#sd-notes-open').textContent.indexOf('Фактурата е за 5 бр.') >= 0);
      }
    }
    ok('accounting вижда Троян, не Враца', cardIds(h).indexOf('n-troyan') >= 0 && cardIds(h).indexOf('n-vraca') < 0, cardIds(h).join('|'));
    h.close();
  }

  section('б) Магазин (manager Троян): без бутона, само своя обект, отговор side=store');
  {
    const h = env(MGR); await settle();
    ok('бутонът „Счетоводител" го няма', !btn(mod(h), '✍️ Счетоводител'));
    ok('заявката към storno_notes е по обекта', h.calls.get.some(u => /storno_notes\?.*store_name=eq\.%D0%A2/.test(u)),
      h.calls.get.filter(u => /storno_notes/.test(u)).join(' | '));
    ok('вижда картата за Троян', !!card(h, 'n-troyan'));
    ok('НЕ вижда картата за Враца', !card(h, 'n-vraca'));
    ok('текст, файл и отговорът се показват', card(h, 'n-troyan').textContent.indexOf('ПРОВЕРЕТЕ ТРОЯН') >= 0 &&
      card(h, 'n-troyan').textContent.indexOf('фактура.pdf') >= 0 && card(h, 'n-troyan').textContent.indexOf('ЩЕ ПРОВЕРИМ') >= 0);
    ok('заглавието брои отворените (1)', /Съобщения от счетоводството \(1\)/.test(h.doc.getElementById('sd-notes').textContent));
    await reply(h, 'n-troyan', 'Проверихме, 2 бр. не са дошли');
    const p = posts(h, 'storno_note_replies')[0];
    ok('POST storno_note_replies със side store', !!p && p.body.side === 'store' && p.body.note_id === 'n-troyan' &&
      p.body.body === 'Проверихме, 2 бр. не са дошли' && p.body.created_by === 'Управител Троян', JSON.stringify(p && p.body));
    ok('отговорът се вижда в картата', card(h, 'n-troyan').textContent.indexOf('Проверихме, 2 бр.') >= 0);
    /* празен отговор */
    await reply(h, 'n-troyan', '   ');
    ok('празен отговор → няма втори POST', posts(h, 'storno_note_replies').length === 1);
    h.close();
  }

  section('в) Страната на отговора: accounting → accounting, Цвети → co');
  {
    const h = env(ACC); await settle();
    await reply(h, 'n-troyan', 'отговор от счетоводител');
    ok('accounting → side accounting', (posts(h, 'storno_note_replies')[0] || { body: {} }).body.side === 'accounting');
    h.close();
    const h2 = env(CVETI); await settle();
    ok('Цвети вижда и двата обекта', !!card(h2, 'n-troyan') && !!card(h2, 'n-vraca'), cardIds(h2).join('|'));
    ok('Цвети вижда бутона', !!btn(mod(h2), '✍️ Счетоводител'));
    await reply(h2, 'n-vraca', 'отговор от Цвети');
    ok('Цвети → side co', (posts(h2, 'storno_note_replies')[0] || { body: {} }).body.side === 'co');
    h2.close();
  }

  section('г) „🧾 Направи сторно" от магазина → бланка → PATCH {storno, report_id}');
  {
    const h = env(MGR); await settle();
    realClick(h.w, btn(card(h, 'n-troyan'), '🧾 Направи сторно')); await settle();
    const doc = h.doc;
    ok('отваря формата за подаване', !!doc.getElementById('diff-submit-ov'));
    ok('посока wrong_receipt', doc.getElementById('diff-direction').value === 'wrong_receipt');
    ok('обектът е Троян', doc.getElementById('diff-store').value === 'Троян', doc.getElementById('diff-store').value);
    ok('доставчикът е попълнен (асинхронният списък)', doc.getElementById('diff-counterpart').value === 'ТЕСИ ООД',
      doc.getElementById('diff-counterpart').value);
    ok('документът е попълнен', doc.getElementById('diff-docnum').value === 'ФК-111');
    doc.getElementById('diff-order-num').value = '4100135756';
    doc.querySelector('#diff-items .di-name').value = 'ЛАЙСНА';
    doc.querySelector('#diff-items .di-qty').value = '2';
    realClick(h.w, btn(doc.getElementById('diff-submit-ov'), 'Подай бланка')); await settle();
    const rp = posts(h, 'differences_reports')[0];
    ok('бланката е подадена (wrong_receipt, Троян)', !!rp && rp.body.direction === 'wrong_receipt' && rp.body.store_name === 'Троян',
      h.calls.toast.join(' | '));
    const pt = patches(h, 'storno_notes')[0];
    ok('PATCH storno_notes {status:storno, report_id:rep-1}', !!pt && /id=eq\.n-troyan/.test(pt.url) &&
      pt.body.status === 'storno' && pt.body.report_id === 'rep-1', JSON.stringify(pt));
    ok('последният toast е успех', /^✅ Бланката е подадена, съобщението е пуснато за сторно/.test(h.calls.toast[h.calls.toast.length - 1]),
      h.calls.toast.join(' | '));
    ok('съобщението вече не е в отворените', !mod(h).querySelector('#sd-notes-open #sd-note-n-troyan'));
    realClick(h.w, h.doc.getElementById('sd-notes-closed-chip'));
    const c = card(h, 'n-troyan');
    ok('през „Затворени" — бадж „Пуснато за сторно" и линк към бланката', !!c &&
      c.querySelector('.sd-note-status').textContent.indexOf('Пуснато за сторно') >= 0 &&
      !!c.querySelector('.sd-note-report-link[data-rid="rep-1"]'), c && c.innerHTML.slice(0, 300));
    ok('на пуснатото няма „Направи сторно"', !!c && !btn(c, '🧾 Направи сторно'));
    h.close();
  }
  {
    const h = env(MGR, { fail: { PATCH: /storno_notes/ } }); await settle();
    realClick(h.w, btn(card(h, 'n-troyan'), '🧾 Направи сторно')); await settle();
    const doc = h.doc;
    doc.getElementById('diff-order-num').value = '4100135756';
    doc.querySelector('#diff-items .di-name').value = 'ЛАЙСНА';
    doc.querySelector('#diff-items .di-qty').value = '2';
    realClick(h.w, btn(doc.getElementById('diff-submit-ov'), 'Подай бланка')); await settle();
    ok('провал: бланката е подадена', posts(h, 'differences_reports').length === 1);
    ok('провал: нищо не се трие', h.calls.del.length === 0, h.calls.del.join(' | '));
    ok('провал: червен toast „НЕ е отбелязано"', h.calls.toast.some(t => /НЕ е отбелязано/.test(t)), h.calls.toast.join(' | '));
    ok('провал: без „✅" toast след подаването', !h.calls.toast.some(t => /^✅ Бланката/.test(t)), h.calls.toast.join(' | '));
    const c = card(h, 'n-troyan');
    ok('провал: маркер на картата', !!c && !!c.querySelector('.sd-note-fail'));
    const retry = c && btn(c, 'Опитай пак');
    if (ok('провал: бутон „Опитай пак"', !!retry)) {
      realClick(h.w, retry); await settle();
      const ps = patches(h, 'storno_notes');
      ok('„Опитай пак" праща същия PATCH отново', ps.length === 2 && ps[1].body.report_id === 'rep-1', JSON.stringify(ps.map(p => p.body)));
    }
    h.close();
  }

  section('г2) Частичен запис: бланката е създадена, артикулите — не → съобщението пак е свързано');
  {
    const h = env(MGR, { fail: { POST: /stock_differences/ } }); await settle();
    realClick(h.w, btn(card(h, 'n-troyan'), '🧾 Направи сторно')); await settle();
    const doc = h.doc;
    doc.getElementById('diff-order-num').value = '4100135756';
    doc.querySelector('#diff-items .di-name').value = 'ЛАЙСНА';
    doc.querySelector('#diff-items .di-qty').value = '2';
    realClick(h.w, btn(doc.getElementById('diff-submit-ov'), 'Подай бланка')); await settle();
    ok('бланката е създадена', posts(h, 'differences_reports').length === 1);
    ok('артикулите паднаха', h.calls.notOk.some(x => /stock_differences/.test(x.url)));
    const pt = patches(h, 'storno_notes')[0];
    ok('PATCH {storno, report_id:rep-1} въпреки частичния запис', !!pt && pt.body.status === 'storno' && pt.body.report_id === 'rep-1',
      JSON.stringify(pt && pt.body) + ' | ' + h.calls.toast.join(' | '));
    const last = h.calls.toast[h.calls.toast.length - 1] || '';
    ok('последният toast е червеното за артикулите', /артикулите не се записаха/.test(last), h.calls.toast.join(' | '));
    ok('без „✅" toast', !h.calls.toast.some(t => /^✅ Бланката/.test(t)), h.calls.toast.join(' | '));
    ok('съобщението вече не е отворено → няма „Направи сторно" за втора бланка',
      !mod(h).querySelector('#sd-notes-open #sd-note-n-troyan'));
    h.close();
  }

  section('д) „✓ Затвори" → closed + closed_by/at; затвореното е зад чипа');
  {
    const h = env(ACC); await settle();
    ok('преди: чип „Затворени (1)"', /Затворени \(1\)/.test((h.doc.getElementById('sd-notes-closed-chip') || {}).textContent || ''));
    ok('затворените не са видими по подразбиране', !card(h, 'n-old'));
    realClick(h.w, btn(card(h, 'n-troyan'), '✓ Затвори')); await settle();
    const pt = patches(h, 'storno_notes')[0];
    ok('PATCH status closed + closed_by + closed_at', !!pt && pt.body.status === 'closed' && pt.body.closed_by === 'Счетоводител Троян' &&
      !!pt.body.closed_at, JSON.stringify(pt && pt.body));
    ok('потвърждение е поискано', h.calls.confirm.length === 1);
    ok('вече не е в отворените', !mod(h).querySelector('#sd-notes-open #sd-note-n-troyan'));
    const chip = h.doc.getElementById('sd-notes-closed-chip');
    ok('чип „Затворени (2)"', !!chip && /Затворени \(2\)/.test(chip.textContent), chip && chip.textContent);
    realClick(h.w, chip);
    ok('през чипа се вижда, с бадж „Затворено"', !!card(h, 'n-troyan') &&
      card(h, 'n-troyan').querySelector('.sd-note-status').textContent.indexOf('Затворено') >= 0);
    ok('и старото затворено', !!card(h, 'n-old'));
    h.close();
  }

  section('е) ЦО само за преглед — без бутони; логистичен склад — нищо');
  {
    const h = env(VIEWER); await settle();
    ok('ЦО преглед: вижда съобщенията', !!card(h, 'n-troyan') && !!card(h, 'n-vraca'), cardIds(h).join('|'));
    const nb = Array.prototype.reduce.call(mod(h).querySelectorAll('.sd-note-card'), (s, c) => s + c.querySelectorAll('button,textarea,input').length, 0);
    ok('ЦО преглед: нито един бутон/поле в картите', nb === 0, String(nb));
    ok('ЦО преглед: без „Счетоводител"', !btn(mod(h), '✍️ Счетоводител'));
    h.close();
    const h2 = env(WH); await settle();
    ok('склад: секцията я няма', !h2.doc.getElementById('sd-notes'));
    ok('склад: не чете storno_notes', !h2.calls.get.some(u => /storno_notes/.test(u)));
    h2.close();
  }

  section('ж) Другите подтабове — без секцията и без бутона; броячите не смесват');
  {
    for (const d of ['supplier', 'interstore']) {
      const h = env(CVETI, { dir: d }); await settle();
      ok(d + ': секцията я няма', !h.doc.getElementById('sd-notes'));
      ok(d + ': бутона го няма', !btn(mod(h), '✍️ Счетоводител'));
      h.close();
    }
    const h = env(CVETI); await settle();
    const tab = mod(h).querySelector('button[data-dir="wrong_receipt"]');
    ok('подтабът брои редове, не съобщения (0)', !!tab && /\(0\)/.test(tab.textContent) && !/🆕/.test(tab.textContent), tab && tab.textContent);
    const sw = mod(h).querySelector('button[data-sd-view="reports"]');
    ok('„Бланки за преглед (0)" — съобщенията не се броят', !!sw && /\(0\)/.test(sw.textContent), sw && sw.textContent);
    h.close();
  }

  section('з) Поправки 23.10: изглед след запис, „Сервиз Троян", поле за отговор само на отворено');
  {
    /* 1. Запис от „Решени редове" → изгледът става „Бланки за преглед" и секцията е там. */
    const h = env(CVETI, { view: 'rows' }); await settle();
    ok('преди: изгледът е rows и секцията я няма', h.w.sdView === 'rows' && !h.doc.getElementById('sd-notes'));
    realClick(h.w, btn(mod(h), '✍️ Счетоводител')); await settle();
    /* 2. admin с празен assigned_stores → търговските обекти по признака. */
    const sel = h.doc.getElementById('sd-note-store');
    const opts = sel ? Array.prototype.map.call(sel.options, o => o.value).filter(Boolean) : [];
    ok('„Сервиз Троян" го няма в списъка', opts.indexOf('Сервиз Троян') < 0, opts.join('|'));
    ok('ЦО и складът ги няма; Троян и Враца ги има', opts.indexOf('Централен офис') < 0 && opts.indexOf('Логистичен склад Добрич') < 0 &&
      opts.indexOf('Троян') >= 0 && opts.indexOf('Враца') >= 0, opts.join('|'));
    sel.value = 'Враца';
    h.doc.getElementById('sd-note-body').value = 'от решени редове';
    realClick(h.w, btn(h.doc.getElementById('sd-note-ov'), 'Запиши')); await settle();
    ok('POST storno_notes', posts(h, 'storno_notes').length === 1, h.calls.toast.join(' | '));
    ok('след запис: sdView = reports', h.w.sdView === 'reports', h.w.sdView);
    ok('след запис: #sd-notes е в DOM с новото съобщение', !!h.doc.getElementById('sd-notes') &&
      h.doc.getElementById('sd-notes').textContent.indexOf('от решени редове') >= 0);
    ok('скролва до секцията', h.calls.scrollIntoView.some(x => x.id === 'sd-notes'), JSON.stringify(h.calls.scrollIntoView));
    h.close();
  }
  {
    /* 3. Пуснато за сторно и затворено — без поле, без „📎 Прикачи", без „Изпрати". */
    const h = env(CVETI); await settle();
    ok('отвореното има поле и „Изпрати"', !!card(h, 'n-troyan').querySelector('textarea') && !!btn(card(h, 'n-troyan'), 'Изпрати'));
    realClick(h.w, h.doc.getElementById('sd-notes-closed-chip'));
    const c = card(h, 'n-old');
    ok('затворено: без <textarea>, „Изпрати" и „📎 Прикачи"', !!c && !c.querySelector('textarea') && !btn(c, 'Изпрати') &&
      !c.querySelector('input[type=file]') && c.textContent.indexOf('Прикачи') < 0, c && c.innerHTML.slice(-300));
    h.w.sdNoteSendReply('n-old'); await settle();
    ok('sdNoteSendReply за затворено → без POST', posts(h, 'storno_note_replies').length === 0);
    ok('… и toast за отказ', h.calls.toast.some(t => /приключено/.test(t)), h.calls.toast.join(' | '));
    /* пуснато за сторно */
    const n = h.w.sdNotes.find(x => x.id === 'n-vraca');
    n.status = 'storno'; n.report_id = 'rep-x';
    h.w.sdNoteReplies.push({ id: 'rp-v', note_id: 'n-vraca', body: 'СТАР ОТГОВОР', files: [], side: 'co', created_by: 'Цветелина Тенева', created_at: '2026-10-23T10:00:00Z' });
    h.w.renderStockDiff();
    const cs = card(h, 'n-vraca');
    ok('пуснато за сторно: без <textarea> и „Изпрати"', !!cs && !cs.querySelector('textarea') && !btn(cs, 'Изпрати'));
    ok('пуснато за сторно: старият отговор се вижда', !!cs && cs.textContent.indexOf('СТАР ОТГОВОР') >= 0);
    h.w.sdNoteSendReply('n-vraca'); await settle();
    ok('sdNoteSendReply за пуснато → без POST', posts(h, 'storno_note_replies').length === 0);
    h.close();
  }

  section('и) „Магазин" в „📝 Подай бланка" и „+ Добави ръчно" — търговските обекти (решение А, 23.10)');
  const opts = (doc, id) => { const el = doc.getElementById(id); return el && el.options ? Array.prototype.map.call(el.options, o => o.value).filter(Boolean) : []; };
  {
    const bad = ['Сервиз Троян', 'Логистичен склад Добрич', 'Централен офис'];
    /* admin, „📝 Подай бланка" */
    const h = env(CVETI, { dir: 'supplier' }); await settle();
    realClick(h.w, btn(mod(h), '📝 Подай бланка')); await settle();
    const so = opts(h.doc, 'diff-store');
    ok('Подай бланка: без „Сервиз Троян", складовете и ЦО', bad.every(b => so.indexOf(b) < 0), so.join('|'));
    ok('Подай бланка: Троян и Враца ги има', so.indexOf('Троян') >= 0 && so.indexOf('Враца') >= 0, so.join('|'));
    /* Насрещната страна при междускладов — складовете остават. */
    const dir = h.doc.getElementById('diff-direction');
    dir.value = 'interstore'; h.w.updateDiffCounterpartLabel(); await settle();
    const cp = opts(h.doc, 'diff-counterpart');
    ok('„Обект изпращач" (interstore) — и двата склада', cp.indexOf('Логистичен склад Добрич') >= 0 && cp.indexOf('Логистичен склад Търговище') >= 0, cp.join('|'));
    h.w.closeDiffSubmitModal();
    /* admin, „+ Добави ръчно" (нов запис) */
    realClick(h.w, btn(mod(h), '+ Добави ръчно')); await settle();
    const mo = opts(h.doc, 'sd-store');
    ok('Добави ръчно: без „Сервиз Троян", складовете и ЦО', mo.length > 0 && bad.every(b => mo.indexOf(b) < 0), mo.join('|'));
    h.w.closeSDModal();
    h.close();
  }
  {
    /* Редакция на запис с изключен обект — стойността се пази. */
    const h = env(CVETI, { dir: 'supplier', view: 'rows' }); await settle();
    h.w.sdData = [{ id: 'l-svc', report_id: null, store_name: 'Сервиз Троян', supplier: 'ТЕСИ ООД', material_code: '1', material_name: 'РЕД НА СЕРВИЗА',
      quantity: 1, type: 'writein', status: 'pending', attachments: [], created_at: '2026-10-20T08:00:00Z' }];
    h.w.sdFilter = 'all'; h.w.renderStockDiff();
    const eb = Array.prototype.find.call(mod(h).querySelectorAll('button[data-id="l-svc"]'), b => /openSDModal/.test(b.getAttribute('onclick') || ''));
    if (ok('редакция: бутонът ✏️ на реда', !!eb)) {
      realClick(h.w, eb); await settle();
      const el = h.doc.getElementById('sd-store');
      ok('редакция: стойността „Сервиз Троян" е запазена', !!el && el.value === 'Сервиз Троян', el && el.value);
      ok('редакция: само като текущата, складовете пак ги няма', opts(h.doc, 'sd-store').indexOf('Логистичен склад Добрич') < 0);
    }
    h.close();
  }
  {
    /* Логистичен склад: собственият обект, не общият списък. */
    const h = env(WH, { dir: 'supplier' }); await settle();
    realClick(h.w, btn(mod(h), '📝 Подай бланка')); await settle();
    const el = h.doc.getElementById('diff-store');
    ok('склад: „Магазин" е собственият склад', !!el && el.value === 'Логистичен склад Търговище', el && (el.tagName + ':' + el.value));
    h.close();
  }

  /* ── 24.10.2026: „🗑 Изтрий" (само Цвети и admin) и изтрита бланка за сторно ── */
  const delBtn = (h, id) => { const c = card(h, id); return c ? c.querySelector('button.sd-note-del') : null; };
  const showAll = h => { const chip = h.doc.getElementById('sd-notes-closed-chip'); if (chip && !h.w.sdNotesShowClosed) realClick(h.w, chip); };
  const seqOf = h => { h.seq = []; const f = h.w.fetch; h.w.fetch = (u, i) => { h.seq.push(((i && i.method) || 'GET') + ' ' + String(u).replace(/^.*\/rest\/v1\//, '')); return f(u, i); }; };

  section('к) „🗑 Изтрий" — Цвети/admin на отворено, пуснато и затворено; accounting и обектът — не');
  {
    const CVETI_ACC = Object.assign({}, CVETI, { role: 'accounting', assigned_stores: ['Троян', 'Враца'] });
    for (const u of [CVETI, CVETI_ACC]) {
      const h = env(u); await settle();
      const n = h.w.sdNotes.find(x => x.id === 'n-vraca'); n.status = 'storno'; n.report_id = 'rep-x';
      h.w.renderStockDiff(); showAll(h);
      ok(u.role + ' Цвети: бутон на отворено', !!delBtn(h, 'n-troyan'));
      ok(u.role + ' Цвети: бутон на пуснато за сторно', !!delBtn(h, 'n-vraca'));
      ok(u.role + ' Цвети: бутон на затворено', !!delBtn(h, 'n-old'));
      h.close();
    }
    for (const u of [ACC, MGR, VIEWER]) {
      const h = env(u); await settle(); showAll(h);
      const n = Array.prototype.filter.call(mod(h).querySelectorAll('.sd-note-card button'), b => /sdNoteDelete|Изтрий/.test(b.getAttribute('onclick') + b.textContent)).length;
      ok(u.display_name + ': без „🗑 Изтрий" (<button>)', n === 0 && mod(h).querySelectorAll('.sd-note-card').length > 0, String(n));
      h.close();
    }
  }

  section('л) клик + confirm → DELETE storno_notes по id; отказ/провал → картата остава');
  {
    const h = env(CVETI); await settle();
    realClick(h.w, delBtn(h, 'n-troyan')); await settle();
    ok('поискано потвърждение (с броя отговори)', h.calls.confirm.length === 1 && /1 отговор/.test(h.calls.confirm[0]), h.calls.confirm.join(' | '));
    ok('DELETE storno_notes?id=eq.n-troyan', h.calls.del.length === 1 && /storno_notes\?id=eq\.n-troyan$/.test(h.calls.del[0]), h.calls.del.join(' | '));
    ok('без отделен DELETE на отговорите (cascade)', !h.calls.del.some(u => /storno_note_replies/.test(u)));
    ok('картата изчезва', !card(h, 'n-troyan'));
    ok('отговорите са махнати от паметта', !h.w.sdNoteReplies.some(r => r.note_id === 'n-troyan'));
    ok('toast „✅ Съобщението е изтрито"', /✅ Съобщението е изтрито/.test(h.calls.toast.join(' | ')), h.calls.toast.join(' | '));
    h.close();
  }
  {
    const h = env(CVETI); await settle();
    h.w.confirm = m => { h.calls.confirm.push(m); return false; };
    realClick(h.w, delBtn(h, 'n-troyan')); await settle();
    ok('отказ от confirm → нито един DELETE', h.calls.del.length === 0 && h.calls.confirm.length === 1);
    ok('отказ → картата остава', !!card(h, 'n-troyan'));
    h.close();
  }
  {
    const h = env(CVETI, { fail: { DELETE: /storno_notes/ } }); await settle();
    realClick(h.w, delBtn(h, 'n-troyan')); await settle();
    ok('провал: DELETE е пратен', h.calls.del.length === 1);
    ok('провал: червен toast', h.calls.toast.some(t => /НЕ е изтрито/.test(t)), h.calls.toast.join(' | '));
    ok('провал: без „✅"', !h.calls.toast.some(t => /✅/.test(t)));
    ok('провал: картата остава', !!card(h, 'n-troyan'));
    h.close();
  }
  {
    /* Без delete политика PostgREST връща 2xx и 0 изтрити реда. */
    const h = env(CVETI); await settle();
    h.w.sbDelete = () => Promise.resolve({ ok: true, count: 0 });
    realClick(h.w, delBtn(h, 'n-troyan')); await settle();
    ok('0 реда: червен toast „НЕ е изтрито"', h.calls.toast.some(t => /НЕ е изтрито \(0 реда/.test(t)), h.calls.toast.join(' | '));
    ok('0 реда: картата остава', !!card(h, 'n-troyan'));
    h.close();
  }

  section('м) изтрита бланка за сторно → съобщението обратно в „Отворено" ПРЕДИ триенето');
  const REP_SN = { id: 'rep-sn', direction: 'wrong_receipt', store_name: 'Троян', counterpart: 'ТЕСИ ООД', document_number: 'ФК-111',
    doc_date: '2026-10-23', submitted_by: 'Управител Троян', general_comment: '', created_at: '2026-10-23T10:00:00Z', reviewed: false, photos: [] };
  async function delRep(h) {
    h.w.diffReports = [JSON.parse(JSON.stringify(REP_SN))];
    const n = h.w.sdNotes.find(x => x.id === 'n-troyan'); n.status = 'storno'; n.report_id = 'rep-sn';
    h.w.renderStockDiff();
    const b = mod(h).querySelector('button[onclick*="sdDeleteReport"][data-rid="rep-sn"]');
    if (!ok('бутонът „🗑 Изтрий бланката" е на картата', !!b)) return;
    seqOf(h);
    realClick(h.w, b); await settle();
  }
  {
    const h = env(CVETI); await settle();
    await delRep(h);
    const pi = h.seq.findIndex(s => /^PATCH storno_notes\?report_id=eq\.rep-sn$/.test(s));
    const di = h.seq.findIndex(s => /^DELETE differences_reports\?id=eq\.rep-sn$/.test(s));
    const si = h.seq.findIndex(s => /^DELETE stock_differences\?report_id=eq\.rep-sn$/.test(s));
    ok('PATCH storno_notes по report_id', pi >= 0, h.seq.join(' | '));
    const pb = (h.calls.patch.find(p => p.table === 'storno_notes') || {}).body || {};
    ok('PATCH тяло {status:open, report_id:null}', pb.status === 'open' && pb.report_id === null && Object.keys(pb).length === 2, JSON.stringify(pb));
    ok('PATCH ПРЕДИ двата DELETE', pi >= 0 && si > pi && di > si, h.seq.join(' | '));
    const n = h.w.sdNotes.find(x => x.id === 'n-troyan');
    ok('съобщението е отворено в паметта', n.status === 'open' && n.report_id === null);
    h.close();
  }
  {
    const h = env(CVETI, { fail: { PATCH: /storno_notes/ } }); await settle();
    await delRep(h);
    ok('провал на PATCH: нито един DELETE', h.calls.del.length === 0, h.calls.del.join(' | '));
    ok('провал на PATCH: червен toast „НЕ е изтрита"', h.calls.toast.some(t => /бланката НЕ е изтрита/.test(t)), h.calls.toast.join(' | '));
    ok('провал на PATCH: съобщението остава пуснато', h.w.sdNotes.find(x => x.id === 'n-troyan').status === 'storno');
    h.close();
  }
  {
    /* Бланка от друга посока — без PATCH по storno_notes. */
    const h = env(CVETI, { dir: 'supplier' }); await settle();
    h.w.diffReports = [Object.assign({}, REP_SN, { id: 'rep-sup', direction: 'supplier' })];
    seqOf(h);
    h.w.sdDeleteReport('rep-sup'); await settle();
    ok('доставчик: без PATCH по storno_notes', !h.calls.patch.some(p => p.table === 'storno_notes'), h.seq.join(' | '));
    ok('доставчик: бланката се трие', h.calls.del.some(u => /differences_reports\?id=eq\.rep-sup/.test(u)), h.calls.del.join(' | '));
    h.close();
  }

  report();
})();
