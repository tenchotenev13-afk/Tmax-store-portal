/* Трети подтаб в "Разлики" — „Сторна по грешен прием"
   (differences_reports.direction = 'wrong_receipt').

   Четирите капана, които трета посока задължително настъпва, ако кодът я
   третира като изключение вместо като редовен член на списък:

     1. Броячите бяха литерали {supplier:0, interstore:0} с hasOwnProperty
        guard — нов ключ се брои като 0 и НИЩО не се чупи видимо.
     2. Всеки етикет беше тернар `direction==='supplier' ? A : 'Междускладов'`
        — всичко непознато мълчаливо се представя за междускладов трансфер,
        на екрана, на хартия и в имейла до доставчика.
     3. diffCategoryOptionsForDirection филтрира по посока — посока без
        собствени категории дава празен <select>, а формата пак се подава.
     4. Правата бяха общи за целия рендер (`var canEdit = canEditSD()`), не
        по ред — а от тези редове излизат глоби и магазинът е само четец.

   Схемата НЕ се пипа: quantity = "По фактура", quantity_received = "Реално
   заприходено", знакът носи вида на разликата.

   Пускане:  node tests/wrong-receipt-tab.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, fire, ticks } = H;

function row(o) {
  return Object.assign({
    store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ',
    quantity: 10, quantity_received: null, quantity_supplier_doc: null,
    order_number: null, confirmed_date: null, comment: null,
    resolution_comment: null, attachments: [], credit_note_issued: false,
    difference_category: null, unit: 'бр.', status: 'new', type: null,
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null,
    store_corrected_at: null, warehouse_response: null, warehouse_comment: null
  }, o);
}

/* ── Бланки: по една от всяка посока, за да се види, че третата не изяжда
      другите две и обратно ─────────────────────────────────────────────── */
const REP_WR = {
  id: 'rep-wr', direction: 'wrong_receipt', store_name: 'Раднево',
  counterpart: 'ТЕСИ ООД', document_number: 'ФК-0001234', doc_date: '2026-08-18',
  submitted_by: 'А. Симеонова', general_comment: '', photos: [],
  reviewed: false, created_at: '2026-08-18T09:00:00.000Z'
};
const REP_SUP = {
  id: 'rep-sup', direction: 'supplier', store_name: 'Раднево',
  counterpart: 'ТЕСИ ООД', document_number: '180489966', doc_date: '2026-08-17',
  submitted_by: 'Склад Раднево', general_comment: '', photos: [],
  reviewed: false, created_at: '2026-08-17T09:00:00.000Z'
};
const REP_INT = {
  id: 'rep-int', direction: 'interstore', store_name: 'Раднево',
  counterpart: 'Логистичен склад Добрич', document_number: '180491138',
  doc_date: '2026-08-13', submitted_by: 'Склад Раднево', general_comment: '',
  /* reviewed:false нарочно — картата се рендира само за непрегледани бланки,
     а секция 4 проверява точно нейния етикет. */
  photos: [], reviewed: false, created_at: '2026-08-13T09:00:00.000Z'
};

/* Нерешен ред по сторната — той стои в секцията "Нови подадени бланки",
   защото редовете без type никога не влизат в главната таблица. */
const WR_OPEN = row({
  id: 'wr-1', report_id: 'rep-wr', material_name: 'ЩУЦЕР МЕТАЛЕН 1"',
  difference_category: 'unbilled_received', quantity: 10, quantity_received: 12
});
/* Решен ред по сторната — той дава числото в брояча на подтаба. */
const WR_DONE = row({
  id: 'wr-2', report_id: 'rep-wr', material_name: 'КРАН СФЕРИЧЕН 1/2"',
  difference_category: 'billed_not_received', quantity: 8, quantity_received: 5,
  type: 'missing', status: 'pending'
});
const SUP_DONE = row({
  id: 'sup-1', report_id: 'rep-sup', material_name: 'ПРОФИЛ ПВЦ',
  difference_category: 'undelivered', type: 'writein', status: 'pending'
});
const INT_DONE = row({
  id: 'int-1', report_id: 'rep-int', material_name: 'БАТЕРИЯ DURACELL',
  difference_category: 'excess', type: 'return', status: 'taken'
});

const ALL_LINES = [WR_OPEN, WR_DONE, SUP_DONE, INT_DONE];
const ALL_REPS = [REP_WR, REP_SUP, REP_INT];

/* Оперативният счетоводител по обект: role='accounting', store_name винаги е
   "Централен офис", разпределението живее в assigned_stores. Точно така
   изглеждат 13 от 20-те реални accounting профила. */
const ACCOUNTANT = {
  email: 'a.simeonova@temax.bg', display_name: 'А. Симеонова',
  role: 'accounting', store_name: 'Централен офис',
  assigned_stores: ['Раднево', 'Гоце Делчев']
};
/* Магазинска роля — вижда, но не подава и не редактира. */
const STORE_USER = {
  email: 'radnevo@temax.bg', display_name: 'Склад Раднево',
  role: 'sklad', store_name: 'Раднево', assigned_stores: []
};

function env(user, dirTab, rows, reports) {
  const h = boot({
    /* transport.js ПРЕДИ stock-differences.js (редът от index.html) — печатът
       ползва getStoreInfo() оттам. */
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user,
    confirm: true,
    data: {
      stock_differences: rows || ALL_LINES,
      differences_reports: reports || ALL_REPS,
      stock_returns: [], transport_orders: [], users: [],
      stores: [{ name: 'Раднево' }, { name: 'Гоце Делчев' }],
      contacts: [{ name: 'ТЕСИ ООД' }, { name: 'ТАГЕМАЛ' }]
    }
  });
  h.w.sdData = JSON.parse(JSON.stringify(rows || ALL_LINES));
  h.w.diffReports = JSON.parse(JSON.stringify(reports || ALL_REPS));
  h.w.transportOrders = [];
  h.w.sdFilter = 'all';
  h.w.sdTypeFilter = 'all';
  h.w.sdStoreFilter = '';
  h.w.sdSearch = '';
  h.w.sdDirTab = dirTab || 'supplier';
  /* Кешовете в shared.js са модулни — нулират се, за да не текат между env-ове. */
  h.w.invalidateStoresCache();
  h.w.invalidateSuppliersCache();
  return h;
}

/* Бутонът на подтаба по посока — разпознава се по data-dir + setSDDirTab,
   не по текст (текстът е точно това, което тестваме). */
function dirTabBtn(doc, dir) {
  const all = doc.querySelectorAll('button[data-dir="' + dir + '"]');
  for (let i = 0; i < all.length; i++) {
    if (/setSDDirTab/.test(all[i].getAttribute('onclick'))) return all[i];
  }
  return null;
}
function tabNumber(el) {
  const m = el && el.textContent.match(/\((\d+)\)/);
  return m ? parseInt(m[1], 10) : -1;
}
/* Главната таблица се разпознава по заглавието "Кредитно" — само нейно е. */
function mainTableRows(doc) {
  const tables = doc.querySelectorAll('#mod-stock-diff table');
  for (let i = 0; i < tables.length; i++) {
    const head = tables[i].querySelector('thead');
    if (head && head.textContent.indexOf('Кредитно') >= 0) {
      return tables[i].querySelectorAll('tbody tr').length;
    }
  }
  return 0;
}
/* Картата на бланка в секцията "Нови подадени бланки" — котвата diff-rep-<id>. */
const repCard = (doc, id) => doc.getElementById('diff-rep-' + id);

(async function () {

  section('1. Третата посока СЪЩЕСТВУВА и не се брои като 0');
  {
    const { w, doc } = env(ACCOUNTANT, 'supplier');
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const t = dirTabBtn(doc, 'wrong_receipt');
      if (ok('подтабът "wrong_receipt" се рендира', !!t)) {
        ok('НЕ показва 0 (един решен ред по сторната)', tabNumber(t) === 1, String(tabNumber(t)));
        ok('носи новия етикет', t.textContent.indexOf('Сторна по грешен прием') >= 0, t.textContent.trim());
        ok('и червеното балонче за 1 нова бланка', t.textContent.indexOf('🆕') >= 0, t.textContent.trim());
      }
      ok('старите два подтаба са непокътнати',
        tabNumber(dirTabBtn(doc, 'supplier')) === 1 && tabNumber(dirTabBtn(doc, 'interstore')) === 1,
        'supplier=' + tabNumber(dirTabBtn(doc, 'supplier')) +
        ' interstore=' + tabNumber(dirTabBtn(doc, 'interstore')));
    }
  }

  section('2. Броячът на подтаба съвпада с реалната таблица след клик');
  {
    const { w, doc } = env(ACCOUNTANT, 'supplier');
    w.renderStockDiff();
    const t = dirTabBtn(doc, 'wrong_receipt');
    const promised = tabNumber(t);
    realClick(w, t);
    ok('превключването е сработило', w.sdDirTab === 'wrong_receipt', w.sdDirTab);
    ok('обещани ' + promised + ', показани ' + mainTableRows(doc), promised === mainTableRows(doc));
    ok('показва точно реда от сторната',
      doc.getElementById('mod-stock-diff').innerHTML.indexOf('КРАН СФЕРИЧЕН') >= 0);
    ok('и НЕ показва редовете от другите две посоки',
      doc.getElementById('mod-stock-diff').innerHTML.indexOf('ПРОФИЛ ПВЦ') < 0);
  }

  section('3. Етикетът НЕ е „Междускладов" — екран, печат, имейл');
  {
    const { w, doc } = env(ACCOUNTANT, 'wrong_receipt');
    w.renderStockDiff();

    const card = repCard(doc, 'rep-wr');
    if (ok('картата на бланката се рендира', !!card)) {
      ok('картата казва „Сторна по грешен прием"',
        card.textContent.indexOf('Сторна по грешен прием') >= 0);
      ok('картата НЕ казва „Междускладов"',
        card.textContent.indexOf('Междускладов') < 0, card.textContent.slice(0, 160));
    }
    ok('заглавието на секцията също следва посоката',
      doc.getElementById('mod-stock-diff').innerHTML.indexOf('· 🧾 Сторна по грешен прием') >= 0);

    /* Новата колона "Снимки" измества всичко след себе си. Разминаване между
       заглавния ред и реда с данни не хвърля — просто разбърква съдържанието
       по колони, тихо. Затова се брои явно, и за двата варианта на таблицата
       (с и без "По стокова", което зависи от посоката). */
    if (card) {
      const tbl = card.querySelector('table');
      const ths = tbl.querySelectorAll('tr th').length;
      const tds = tbl.querySelectorAll('tr:nth-child(2) td').length;
      ok('заглавен ред и ред с данни имат еднакъв брой клетки',
        ths === tds && ths > 0, ths + ' th срещу ' + tds + ' td');
      ok('колоната "Снимки" присъства в заглавния ред',
        tbl.querySelector('tr').textContent.indexOf('Снимки') >= 0);
    }

    /* Печат — рендерът пише в #mod-print, не в модула. */
    if (guard('renderDiffPrint() не хвърля', () => w.renderDiffPrint(w.diffReports.find(r => r.id === 'rep-wr')))) {
      const p = doc.getElementById('mod-print').textContent || '';
      ok('подзаглавието на бланката е за сторно по грешен прием',
        p.indexOf('Сторно по грешен прием') >= 0);
      ok('печатът НЕ казва „междускладов трансфер"',
        p.indexOf('междускладов трансфер') < 0);
      ok('шапката пита за Доставчик, не за Обект изпращач',
        p.indexOf('Обект изпращач') < 0 && p.indexOf('Доставчик') >= 0);
      ok('колоната за количество е „По фактура"', p.indexOf('По фактура') >= 0);
    }

    /* Имейл — само тялото, без изпращане. */
    const body = w.diffEmailBodyHtml(w.diffReports.find(r => r.id === 'rep-wr'),
      w.sdData.filter(l => l.report_id === 'rep-wr'));
    ok('имейлът казва „сторно по грешен прием"', body.indexOf('сторно по грешен прием') >= 0);
    ok('имейлът НЕ казва „междускладов трансфер"', body.indexOf('междускладов трансфер') < 0);
    ok('имейлът показва категориите с истинските им имена',
      body.indexOf('Приета нефактурирана стока') >= 0 &&
      body.indexOf('Фактурирана неприета стока') >= 0);
  }

  section('4. Старите две посоки пазят СВОИТЕ етикети (без регресия)');
  {
    const { w, doc } = env(ACCOUNTANT, 'interstore');
    w.renderStockDiff();
    const card = repCard(doc, 'rep-int');
    ok('междускладовата бланка още се маркира като междускладова',
      !!card && card.textContent.indexOf('Междускладов') >= 0);
    /* Същата проверка за подравняване, но за посока БЕЗ "По стокова" -
       броят колони е различен, а трябва да съвпада сам със себе си. */
    if (card) {
      const tbl = card.querySelector('table');
      ok('и нейната таблица е подравнена',
        tbl.querySelectorAll('tr th').length === tbl.querySelectorAll('tr:nth-child(2) td').length,
        tbl.querySelectorAll('tr th').length + ' th срещу ' +
        tbl.querySelectorAll('tr:nth-child(2) td').length + ' td');
    }
    /* И доставчиковата — там таблицата има ЕДНА колона повече. Нужен е втори
       env: секцията с бланки показва само бланките на ТЕКУЩАТА посока. */
    const sup = env(ACCOUNTANT, 'supplier');
    sup.w.renderStockDiff();
    const supCard = repCard(sup.doc, 'rep-sup');
    if (ok('доставчиковата бланка се рендира', !!supCard)) {
      const st = supCard.querySelector('table');
      ok('доставчиковата таблица е подравнена (с "По стокова")',
        st.querySelectorAll('tr th').length === st.querySelectorAll('tr:nth-child(2) td').length,
        st.querySelectorAll('tr th').length + ' th срещу ' +
        st.querySelectorAll('tr:nth-child(2) td').length + ' td');
      ok('и още показва колоната "По стокова"',
        st.querySelector('tr').textContent.indexOf('По стокова') >= 0);
    }

    guard('печат на доставчикова бланка', () => w.renderDiffPrint(w.diffReports.find(r => r.id === 'rep-sup')));
    const p = doc.getElementById('mod-print').textContent || '';
    ok('доставчиковият печат е непроменен',
      p.indexOf('Разлика при приемане на доставка от доставчик') >= 0);
    ok('и пази късото „Кол." в тясната колона', p.indexOf('Кол.') >= 0);
  }

  section('5. Категориите за новата посока НЕ са празни');
  {
    const { w } = env(ACCOUNTANT, 'wrong_receipt');
    const opts = w.diffCategoryOptionsForDirection('wrong_receipt', null);
    const count = (opts.match(/<option /g) || []).length;
    ok('има поне 2 реални категории (без плейсхолдъра)', count >= 2, String(count));
    ok('unbilled_received присъства', opts.indexOf('unbilled_received') >= 0);
    ok('billed_not_received присъства', opts.indexOf('billed_not_received') >= 0);
    ok('чуждите категории НЕ изтичат тук',
      opts.indexOf('pack_mismatch') < 0 && opts.indexOf('wrong_item') < 0);

    const sup = w.diffCategoryOptionsForDirection('supplier', null);
    ok('и обратно — новите две НЕ изтичат при "Доставчик"',
      sup.indexOf('unbilled_received') < 0 && sup.indexOf('billed_not_received') < 0);
    ok('доставчиковите категории са непокътнати',
      sup.indexOf('undelivered') >= 0 && sup.indexOf('wrong_item') >= 0);

    ok('етикетите се резолвват (не падат на суровия ключ)',
      w.diffCategoryLabel('unbilled_received').indexOf('Приета нефактурирана') >= 0 &&
      w.diffCategoryLabel('billed_not_received').indexOf('Фактурирана неприета') >= 0);
  }

  section('6. Магазинска роля НЕ може да подаде бланка в тази посока');
  {
    const { w, doc } = env(STORE_USER, 'wrong_receipt');
    ok('canSubmitWrongReceipt() е false за sklad', w.canSubmitWrongReceipt() === false);
    ok('но обикновената бланка му остава разрешена', w.canSubmitDiff() === true);

    w.openDiffSubmitModal();
    await ticks();
    const sel = doc.getElementById('diff-direction');
    if (ok('формата за подаване се отваря', !!sel)) {
      ok('опцията "wrong_receipt" изобщо не е в селекта',
        sel.innerHTML.indexOf('wrong_receipt') < 0, sel.innerHTML);
    }
  }

  section('7. …и гейтът НЕ е само скритата опция — записът също пада');
  {
    const { w, doc, calls } = env(STORE_USER, 'wrong_receipt');
    w.openDiffSubmitModal();
    await ticks();
    /* Симулираме подправен DOM: добавяме опцията ръчно и я избираме. */
    const sel = doc.getElementById('diff-direction');
    sel.innerHTML += '<option value="wrong_receipt">🧾 Сторна</option>';
    sel.value = 'wrong_receipt';
    doc.getElementById('diff-docnum').value = 'ФК-9999';
    const nameEl = doc.querySelector('#diff-items .di-name');
    nameEl.value = 'ПОДПРАВЕН РЕД';
    doc.querySelector('#diff-items .di-qty').value = '5';

    realClick(w, btn(doc.getElementById('diff-submit-ov'), 'Подай бланка'));
    await ticks();
    ok('НЕ се записва бланка', !calls.post.some(p => p.table === 'differences_reports'),
      JSON.stringify(calls.post.map(p => p.table)));
    ok('и НЕ се записват редове', !calls.post.some(p => p.table === 'stock_differences'));
    ok('потребителят получава обяснение',
      calls.toast.some(t => String(t.msg || t).indexOf('централния офис') >= 0),
      JSON.stringify(calls.toast));
  }

  section('8. ЦО подава същата бланка успешно (положителният път)');
  {
    const { w, doc, calls } = env(ACCOUNTANT, 'wrong_receipt');
    ok('canSubmitWrongReceipt() е true за accounting', w.canSubmitWrongReceipt() === true);
    w.openDiffSubmitModal();
    await ticks();
    const sel = doc.getElementById('diff-direction');
    ok('опцията е налична в селекта', sel.innerHTML.indexOf('wrong_receipt') >= 0);
    sel.value = 'wrong_receipt';
    fire(w, sel, 'change');
    await ticks();

    ok('етикетът на насрещната страна е "Доставчик"',
      doc.getElementById('diff-counterpart-label').textContent === 'Доставчик');
    const cp = doc.getElementById('diff-counterpart');
    ok('и списъкът е с ДОСТАВЧИЦИ, не с обекти',
      cp.innerHTML.indexOf('ТЕСИ ООД') >= 0 && cp.innerHTML.indexOf('Гоце Делчев') < 0,
      cp.innerHTML);
    ok('количествените полета казват "По фактура" / "Реално заприходено"',
      doc.querySelector('#diff-items .di-qty').getAttribute('placeholder') === 'По фактура' &&
      doc.querySelector('#diff-items .di-qty-real').getAttribute('placeholder') === 'Реално заприходено');
    ok('полето "По стокова на дост." остава скрито',
      !doc.querySelector('#diff-items .di-qty-supdoc'));

    /* Счетоводителят обслужва 2 обекта → полето е <select>, не заключен
       текст. Избираме обект явно, както го прави и потребителят. */
    doc.getElementById('diff-store').value = 'Раднево';
    doc.getElementById('diff-docnum').value = 'ФК-0007777';
    doc.querySelector('#diff-items .di-name').value = 'ЩУЦЕР МЕТАЛЕН';
    doc.querySelector('#diff-items .di-qty').value = '10';
    doc.querySelector('#diff-items .di-qty-real').value = '12';
    doc.querySelector('#diff-items .di-cat').value = 'unbilled_received';

    realClick(w, btn(doc.getElementById('diff-submit-ov'), 'Подай бланка'));
    await ticks();
    const rep = calls.post.find(p => p.table === 'differences_reports');
    if (ok('бланката се записва', !!rep, JSON.stringify(calls.toast))) {
      ok('с direction=wrong_receipt', rep.body.direction === 'wrong_receipt', rep.body.direction);
      ok('номерът на фактурата отива в document_number', rep.body.document_number === 'ФК-0007777');
    }
  }

  section('9. Магазинът е само ЧЕТЕЦ по редовете от сторната');
  {
    const { w, doc } = env(STORE_USER, 'wrong_receipt');
    const wrLine = w.sdData.find(l => l.id === 'wr-2');
    const supLine = w.sdData.find(l => l.id === 'sup-1');

    ok('canEditSD(ред от сторна) е false', w.canEditSD(wrLine) === false);
    ok('canEditSD(ред от доставчик) остава true', w.canEditSD(supLine) === true);
    ok('canEditSD() без аргумент е непроменена', w.canEditSD() === true);

    w.renderStockDiff();
    const tbl = doc.getElementById('mod-stock-diff');
    ok('редът се ВИЖДА от магазина', tbl.innerHTML.indexOf('КРАН СФЕРИЧЕН') >= 0);
    ok('но няма бутон "Изписана/Взета" по него',
      !btn(tbl, 'Изписана') && !btn(tbl, 'Взета'));
    ok('и няма бутон за редакция ✏️', !btn(tbl, '✏️'));
  }

  section('10. …и ключалката е на ЗАПИСА, не само в скрития бутон');
  {
    /* Корекция на нерешен ред — пътят, по който магазинът иначе има право. */
    const { w, doc, calls } = env(STORE_USER, 'wrong_receipt');
    w.renderStockDiff();
    w.openSDCorrectModal('wr-1');
    ok('модалът за корекция изобщо не се отваря', !doc.getElementById('sdc-ov'));
    ok('с обяснение защо',
      calls.toast.some(t => String(t.msg || t).indexOf('централния офис') >= 0),
      JSON.stringify(calls.toast));

    w.sdCorrectLineId = 'wr-1';
    w.submitSDCorrection();
    await ticks();
    ok('и submitSDCorrection() не праща PATCH',
      !calls.patch.some(p => p.table === 'stock_differences'),
      JSON.stringify(calls.patch.map(p => p.url)));

    /* Редакцията през главния модал — същата ключалка. */
    w.sdEditId = 'wr-2';
    w.renderStockDiff();
    const nameInput = doc.getElementById('sd-name');
    if (ok('модалът се рендира', !!nameInput)) {
      ok('полетата са заключени (hidden, не редактируеми)',
        nameInput.getAttribute('type') === 'hidden', nameInput.getAttribute('type'));
    }
    w.submitSD();
    await ticks();
    ok('submitSD() не праща PATCH за ред от сторна',
      !calls.patch.some(p => p.table === 'stock_differences'),
      JSON.stringify(calls.patch.map(p => p.url)));
  }

  section('11. ЦО пази пълните си права по същите редове');
  {
    const { w, doc } = env(ACCOUNTANT, 'wrong_receipt');
    const wrLine = w.sdData.find(l => l.id === 'wr-2');
    ok('canEditSD(ред от сторна) е true за accounting', w.canEditSD(wrLine) === true);
    w.renderStockDiff();
    const tbl = doc.getElementById('mod-stock-diff');
    ok('бутонът за редакция е налице', !!btn(tbl, '✏️'));
    ok('и бутонът за приключване също', !!btn(tbl, 'Изписана'));
  }

  section('12. Снимки на ниво РЕД — магазинът качва по своите, не по чуждите');
  {
    const { w, doc } = env(STORE_USER, 'wrong_receipt');
    const mine = w.sdData.find(l => l.id === 'wr-1');
    const foreign = Object.assign({}, mine, { id: 'x-1', store_name: 'Гоце Делчев' });
    ok('магазинът може да прикачи по СВОЙ ред', w.canAttachSDLine(mine) === true);
    ok('но не и по чужд', w.canAttachSDLine(foreign) === false);
    ok('липсващ ред не хвърля', w.canAttachSDLine(null) === false);

    w.renderStockDiff();
    const card = repCard(doc, 'rep-wr');
    if (ok('картата на бланката се рендира', !!card)) {
      const inp = card.querySelector('input[type="file"][data-lid="wr-1"]');
      if (ok('бутонът за качване стои на самия ред', !!inp)) {
        ok('води към sdUploadLineAttachment',
          /sdUploadLineAttachment/.test(inp.getAttribute('onchange')));
        ok('приема и PDF, не само изображения',
          (inp.getAttribute('accept') || '').indexOf('.pdf') >= 0);
      }
    }
  }
  {
    const { w } = env(ACCOUNTANT, 'wrong_receipt');
    ok('ЦО може да прикачи по всеки ред',
      w.canAttachSDLine(w.sdData.find(l => l.id === 'wr-2')) === true);
    /* Пътят в Storage — префиксът е по посока, bucket-ът е същият. */
    ok('sdUploadLineAttachment съществува', typeof w.sdUploadLineAttachment === 'function');
  }

  section('13. Схемата не се пипа — само двете заварени количествени колони');
  {
    const { w } = env(ACCOUNTANT, 'wrong_receipt');
    const l = w.sdData.find(x => x.id === 'wr-1');
    ok('приета нефактурирана = заприходено > фактура',
      l.quantity_received > l.quantity, l.quantity_received + ' > ' + l.quantity);
    const l2 = w.sdData.find(x => x.id === 'wr-2');
    ok('фактурирана неприета = заприходено < фактура',
      l2.quantity_received < l2.quantity, l2.quantity_received + ' < ' + l2.quantity);
    ok('quantity_supplier_doc остава празна за тази посока',
      l.quantity_supplier_doc === null && l2.quantity_supplier_doc === null);
    ok('SD_NULLABLE вече покрива и трите количества',
      w.SD_NULLABLE.indexOf('quantity') >= 0 &&
      w.SD_NULLABLE.indexOf('quantity_received') >= 0 &&
      w.SD_NULLABLE.indexOf('quantity_supplier_doc') >= 0);
  }

  section('14. Граници: празни данни и бланка без нито един ред');
  {
    const { w, doc } = env(ACCOUNTANT, 'wrong_receipt', [], []);
    if (guard('renderStockDiff() с празни данни не хвърля', () => w.renderStockDiff())) {
      ok('подтабът пак е там и показва 0', tabNumber(dirTabBtn(doc, 'wrong_receipt')) === 0);
      ok('таблицата е празна', mainTableRows(doc) === 0);
    }
  }
  {
    const { w, doc } = env(ACCOUNTANT, 'wrong_receipt', [], [REP_WR]);
    if (guard('бланка без редове не хвърля', () => w.renderStockDiff())) {
      ok('картата ѝ пак се показва', !!repCard(doc, 'rep-wr'));
      /* guard() връща ИСТИНА когато НЕ е хвърлило — само гнездим, не отричаме. */
      if (guard('печат на бланка без редове не хвърля', () => w.renderDiffPrint(REP_WR))) {
        ok('печатът казва че няма редове',
          (doc.getElementById('mod-print').textContent || '').indexOf('Няма редове') >= 0);
      }
    }
  }

  section('15. Непозната посока в базата не чупи екрана');
  {
    /* Ръчно добавен ред (report_id=null) и бланка с боклук в direction —
       и двете трябва да паднат на "Доставчик", не да хвърлят. */
    const { w } = env(ACCOUNTANT, 'supplier');
    ok('sdLineDirection на ред без бланка е "supplier"',
      w.sdLineDirection({ id: 'm-1', report_id: null }) === 'supplier');
    ok('непозната посока дава етикет на доставчик, не срив',
      w.diffDirShortLabel('нещо_друго') === '📦 Доставчик');
    ok('и подзаглавие за печат', typeof w.diffDirPrintSub(undefined) === 'string');
    ok('регистърът брои трите посоки', w.diffDirKeys().length === 3,
      w.diffDirKeys().join(','));
  }

  report();
})();
