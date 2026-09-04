/* Номер на поръчка в „За връщане → По разлики".

   Записите в този подтаб се наливат автоматично, когато Цветелина маркира
   разлика като „Връщане". Досега номерът на поръчката оставаше само в
   „Разлики" — в „За връщане" не се виждаше по коя поръчка е дошъл излишъкът
   и връзката се търсеше на ръка обратно.

   Колоната stock_returns.order_number (миграция stock_returns_add_order_number,
   04.09.2026) вече е в базата. Тестът покрива клиентската страна:

     · autoCreateReturnFromDiff() я пише — и по двата пътя, които я викат
       (бутоните на реда през resolveDiffLine, и модалът през submitSD);
     · таблицата „По разлики" я показва в отделна колона „Поръчка", която
       НЕ е ПВ-ЕВР (purchase_order — друго поле, от стария ERP износ);
     · таблицата „По рекламации" НЕ я показва — там няма изходна разлика;
     · търсенето я намира.

   Пускане:  node tests/stock-returns-order-number.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: ['Раднево']
};

/* ── Страна „Разлики" ────────────────────────────────────────────────────── */

const REPORT = {
  id: 'rep-1', direction: 'supplier', store_name: 'Раднево',
  counterpart: 'ТЕСИ ООД', document_number: '180489966',
  doc_date: '2026-08-17', submitted_by: 'Склад Раднево',
  general_comment: '', photos: [], reviewed: false
};

function diffRow(o) {
  return Object.assign({
    id: 'l-1', report_id: 'rep-1', store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ', quantity: '3',
    quantity_supplier_doc: null, quantity_received: null,
    order_number: null, confirmed_date: null, comment: null,
    resolution_comment: null, attachments: [], credit_note_issued: false,
    type: null, status: 'new',
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null
  }, o);
}

function diffEnv(rows, over) {
  const h = boot(Object.assign({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI, confirm: true,
    data: {
      stock_differences: rows, differences_reports: [REPORT],
      stock_returns: [], users: [], sap_catalog: []
    }
  }, over || {}));
  h.w.sdData = JSON.parse(JSON.stringify(rows));
  h.w.diffReports = JSON.parse(JSON.stringify([REPORT]));
  h.w.sdFilter = 'all';
  h.w.sdTypeFilter = 'all';
  h.w.sdDirTab = 'supplier';
  return h;
}

const srPost = calls => calls.post.filter(x => x.table === 'stock_returns');
const srPatch = calls => calls.patch.filter(x => /stock_returns/.test(x.url));

/* Попълва полетата на модала „Разлики". Имената са id-тата от openSDModal. */
function fillSD(doc, v) {
  doc.getElementById('sd-store').value = v.store || 'Раднево';
  doc.getElementById('sd-supplier').value = v.supplier || 'ТЕСИ ООД';
  doc.getElementById('sd-name').value = v.name || 'АРТИКУЛ';
  doc.getElementById('sd-mat').value = v.code || '111';
  doc.getElementById('sd-qty').value = v.qty || '3';
  doc.getElementById('sd-order').value = v.order != null ? v.order : '';
  doc.getElementById('sd-type').value = v.type || 'return';
  doc.getElementById('sd-status').value = v.status || 'pending';
}

/* НОВ запис с тип „Връщане" минава през sbPostReturn, защото submitSD се нуждае
   от id-то на новия ред, за да върже връщането (diff_line_id). Мокнатият сървър
   на harness-а връща празно тяло за POST, тоест id няма и веригата би спряла
   ПРЕДИ autoCreateReturnFromDiff — не заради бъг, а защото мокът не раздава
   id-та. Подаваме само липсващото id; самата заявка минава през истинския код
   и си остава записана в calls.post. */
function stubNewRowId(w, id) {
  const real = w.sbPostReturn;
  w.sbPostReturn = function (t, b) {
    return real(t, b).then(function (res) {
      if (t === 'stock_differences' && res && res.ok && !(res.row && res.row.id)) {
        return { ok: true, row: { id: id } };
      }
      return res;
    });
  };
}

/* ── Страна „За връщане" ─────────────────────────────────────────────────── */

function retRow(o) {
  return Object.assign({
    id: 'r-1', source: 'diff', store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    product_name: 'АРТИКУЛ', sap_code: '111', quantity: 3,
    order_number: null, purchase_order: null, id_euro: null, plant: null,
    doc_date: '2026-08-17', withdrawal_date: null, confirmed_date: null,
    status: 'pending', reason: 'Излишък от разлика', courier_info: null,
    control_comment: null, controller_comment: null,
    diff_line_id: 'l-1', created_by: 'Цветелина Тенева'
  }, o);
}

function retEnv(rows, tab) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI, confirm: true,
    data: { stock_returns: rows, stock_differences: [], differences_reports: [] }
  });
  h.w.srData = JSON.parse(JSON.stringify(rows));
  h.w.srTab = tab || 'diff';
  h.w.srFilter = 'all';
  h.w.srStoreFilter = '';
  h.w.srSearch = '';
  return h;
}

/* Заглавията на видимата таблица, в реда, в който стоят на екрана. */
function headers(doc) {
  const wrap = doc.getElementById('mod-stock-returns');
  const table = wrap && wrap.querySelector('table');
  if (!table) return null;
  return Array.prototype.map.call(table.querySelectorAll('thead th'),
    th => th.textContent.trim());
}
/* jsdom нормализира style.background към rgb() — сравняваме по нормализирана
   форма, за да не зависи проверката от начина на записване на цвета. */
const RED = 'rgb(220, 38, 38)';   /* = #dc2626 */
function toastBg(doc) {
  const raw = (doc.getElementById('toast') || { style: {} }).style.background || '';
  return raw === '#dc2626' ? RED : raw;
}
/* Клетките на първия ред с данни. */
function cells(doc) {
  const wrap = doc.getElementById('mod-stock-returns');
  const tr = wrap && wrap.querySelector('tbody tr');
  if (!tr) return null;
  return Array.prototype.map.call(tr.querySelectorAll('td'), td => td.textContent.trim());
}

(async function run() {

  section('а) resolveDiffLine → POST към stock_returns носи order_number от реда');
  {
    const { w, doc, calls } = diffEnv([diffRow({
      id: 'l-a', order_number: '4100135756',
      quantity_supplier_doc: '3', quantity_received: '5'
    })]);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const b = btn(doc, '↩️ Връщане');
      if (ok('бутонът „↩️ Връщане" е на екрана', !!b)) {
        realClick(w, b);
        await ticks();
        const post = srPost(calls);
        if (ok('има POST към stock_returns', post.length === 1, 'брой: ' + post.length)) {
          ok('POST-ът носи order_number', 'order_number' in post[0].body,
            Object.keys(post[0].body).join(','));
          ok('стойността е от реда (4100135756)',
            post[0].body.order_number === '4100135756', JSON.stringify(post[0].body.order_number));
          ok('ПВ-ЕВР не се пипа — то е друго поле',
            !('purchase_order' in post[0].body), Object.keys(post[0].body).join(','));
        }
      }
    }
  }

  section('б) submitSD с тип „Връщане" → POST носи order_number от полето sd-order');
  {
    /* б.1 — НОВ запис. Бутонът е „Добави", не „Запази" (openSDModal(null)). */
    const { w, doc, calls } = diffEnv([]);
    stubNewRowId(w, 'new-1');
    if (guard('модалът за нов запис се отваря', () => w.openSDModal(null))) {
      fillSD(doc, { order: '4100999111' });
      realClick(w, btn(doc.getElementById('sd-ov'), 'Добави'));
      await ticks();
      const post = srPost(calls);
      if (ok('нов запис: има POST към stock_returns', post.length === 1,
        'брой: ' + post.length + ' | ' + calls.toast.join(' | '))) {
        ok('нов запис: POST-ът носи order_number', 'order_number' in post[0].body,
          Object.keys(post[0].body).join(','));
        ok('нов запис: стойността е от полето sd-order (4100999111)',
          post[0].body.order_number === '4100999111', JSON.stringify(post[0].body.order_number));
        ok('нов запис: връзката към разликата е новото id',
          post[0].body.diff_line_id === 'new-1', JSON.stringify(post[0].body.diff_line_id));
      }
    }

    /* б.2 — РЕДАКЦИЯ на съществуващ ред: Цвети сменя типа на „Връщане" през
       модала. Другият от двата пътя, и той минава без stub. */
    const e = diffEnv([diffRow({ id: 'l-b2', order_number: '4100777222', type: null })]);
    if (guard('модалът за редакция се отваря', () => e.w.openSDModal('l-b2'))) {
      ok('полето sd-order е предварително попълнено от реда',
        e.doc.getElementById('sd-order').value === '4100777222',
        JSON.stringify(e.doc.getElementById('sd-order').value));
      e.doc.getElementById('sd-type').value = 'return';
      realClick(e.w, btn(e.doc.getElementById('sd-ov'), 'Запази'));
      await ticks();
      const post = srPost(e.calls);
      if (ok('редакция: има POST към stock_returns', post.length === 1,
        'брой: ' + post.length + ' | ' + e.calls.toast.join(' | '))) {
        ok('редакция: стойността е 4100777222',
          post[0].body.order_number === '4100777222', JSON.stringify(post[0].body.order_number));
      }
    }
  }

  section('в) Ред без поръчка → order_number е null, не undefined и не празен низ');
  {
    /* Двата източника на „празно": колоната изобщо липсва в разликата, и
       празно поле в модала. И двете трябва да стигнат до базата като null —
       '' би отишло в text колоната като истински празен низ и после нито
       се търси, нито се различава от липсваща стойност. */
    const { w, doc, calls } = diffEnv([diffRow({
      id: 'l-c', order_number: null,
      quantity_supplier_doc: '3', quantity_received: '5'
    })]);
    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const b = btn(doc, '↩️ Връщане');
      if (ok('бутонът „↩️ Връщане" е на екрана', !!b)) {
        realClick(w, b);
        await ticks();
        const post = srPost(calls);
        if (ok('има POST към stock_returns', post.length === 1, 'брой: ' + post.length)) {
          ok('ключът присъства', 'order_number' in post[0].body,
            Object.keys(post[0].body).join(','));
          ok('стойността е точно null', post[0].body.order_number === null,
            JSON.stringify(post[0].body.order_number));
        }
      }
    }

    /* Същото, но през модала с празно поле. Там стойността е празен НИЗ, не
       null: sdCleanPayload нормализира само датите и количествата, а
       order_number не е в SD_NULLABLE. Празният низ трябва да стане null в
       autoCreateReturnFromDiff, не да отиде така в text колоната. */
    const m = diffEnv([diffRow({ id: 'l-c2', order_number: null, type: null })]);
    if (guard('модалът за редакция се отваря', () => m.w.openSDModal('l-c2'))) {
      ok('полето sd-order е празно', m.doc.getElementById('sd-order').value === '',
        JSON.stringify(m.doc.getElementById('sd-order').value));
      m.doc.getElementById('sd-type').value = 'return';
      realClick(m.w, btn(m.doc.getElementById('sd-ov'), 'Запази'));
      await ticks();
      const post = srPost(m.calls);
      if (ok('модал: има POST към stock_returns', post.length === 1,
        'брой: ' + post.length + ' | ' + m.calls.toast.join(' | '))) {
        ok('модал: празното поле става null, а не празен низ',
          post[0].body.order_number === null, JSON.stringify(post[0].body.order_number));
      }
    }
  }

  section('г) Таблица „По разлики": колона „Поръчка" между „Кол." и „ПВ-ЕВР"');
  {
    const { w, doc } = retEnv([
      retRow({ id: 'r-1', order_number: '4100135756', purchase_order: 'PV-777' }),
      retRow({ id: 'r-2', order_number: null, purchase_order: null, diff_line_id: 'l-2' })
    ], 'diff');
    if (guard('renderStockReturns() не хвърля', () => w.renderStockReturns())) {
      const hs = headers(doc);
      if (ok('таблицата се рендира', !!hs, JSON.stringify(hs))) {
        const iQty = hs.indexOf('Кол.');
        const iOrd = hs.indexOf('Поръчка');
        const iPv = hs.indexOf('ПВ-ЕВР');
        ok('има заглавие „Поръчка"', iOrd >= 0, hs.join(' | '));
        ok('„Поръчка" е точно между „Кол." и „ПВ-ЕВР"',
          iQty >= 0 && iOrd === iQty + 1 && iPv === iOrd + 1,
          'Кол.=' + iQty + ' Поръчка=' + iOrd + ' ПВ-ЕВР=' + iPv);
        ok('„ПВ-ЕВР" не е изчезнала', iPv >= 0, hs.join(' | '));
        ok('колоните станаха 15', hs.length === 15, 'брой: ' + hs.length);

        const cs = cells(doc);
        if (ok('първият ред има клетки', !!cs && cs.length === hs.length,
          cs && cs.length + ' срещу ' + hs.length)) {
          ok('клетката „Поръчка" показва номера', cs[iOrd] === '4100135756', JSON.stringify(cs[iOrd]));
          ok('клетката „ПВ-ЕВР" показва СВОЯТА стойност, не поръчката',
            cs[iPv] === 'PV-777', JSON.stringify(cs[iPv]));
        }
        /* Ред без поръчка — тире, точно както съседната ПВ-ЕВР. Клетката
           минава през esc(), а esc('') връща тире (shared.js). */
        const rows = doc.getElementById('mod-stock-returns').querySelectorAll('tbody tr');
        if (ok('вторият ред се рендира', rows.length === 2, 'редове: ' + rows.length)) {
          const c2 = Array.prototype.map.call(rows[1].querySelectorAll('td'),
            td => td.textContent.trim());
          ok('ред без поръчка → тире', c2[iOrd] === '—', JSON.stringify(c2[iOrd]));
          ok('същото като съседната празна ПВ-ЕВР', c2[iOrd] === c2[iPv],
            JSON.stringify(c2[iOrd]) + ' срещу ' + JSON.stringify(c2[iPv]));
        }
      }
    }
  }

  section('д) Таблица „По рекламации" НЯМА колона „Поръчка"');
  {
    const { w, doc } = retEnv([retRow({
      id: 'r-c', source: 'complaint', diff_line_id: null,
      order_number: '4100135756', purchase_order: 'PV-777'
    })], 'complaint');
    if (guard('renderStockReturns() не хвърля', () => w.renderStockReturns())) {
      const hs = headers(doc);
      if (ok('таблицата се рендира', !!hs, JSON.stringify(hs))) {
        ok('НЯМА заглавие „Поръчка"', hs.indexOf('Поръчка') < 0, hs.join(' | '));
        ok('„ПВ-ЕВР" си е на място', hs.indexOf('ПВ-ЕВР') >= 0, hs.join(' | '));
        ok('колоните остават 11', hs.length === 11, 'брой: ' + hs.length);
        /* Номерът стои в реда, но не се показва тук — проверката е, че
           таблицата не го е изкарала някъде другаде по невнимание. */
        const cs = cells(doc);
        ok('номерът не изтича в никоя клетка',
          !!cs && !cs.some(c => c.indexOf('4100135756') >= 0), JSON.stringify(cs));
      }
    }
  }

  section('е) Търсенето намира реда по номер на поръчка');
  {
    const ROWS = [
      retRow({ id: 'r-1', product_name: 'АРТИКУЛ А', order_number: '4100135756' }),
      retRow({ id: 'r-2', product_name: 'АРТИКУЛ Б', order_number: '4100999111', diff_line_id: 'l-2' })
    ];
    const { w, doc } = retEnv(ROWS, 'diff');
    if (guard('рендер без търсене', () => w.renderStockReturns())) {
      ok('без филтър се виждат двата реда',
        doc.getElementById('mod-stock-returns').querySelectorAll('tbody tr').length === 2);
    }
    /* Истинският път: oninput на полето за търсене, не присвояване на srSearch. */
    const input = doc.getElementById('sr-search-input');
    if (ok('полето за търсене съществува', !!input)) {
      input.value = '4100999111';
      if (guard('setSRSearch() не хвърля', () => w.setSRSearch(input.value))) {
        const rows = doc.getElementById('mod-stock-returns').querySelectorAll('tbody tr');
        if (ok('остава точно един ред', rows.length === 1, 'редове: ' + rows.length)) {
          ok('това е редът с търсената поръчка',
            rows[0].textContent.indexOf('АРТИКУЛ Б') >= 0, rows[0].textContent.trim());
        }
      }
    }
    /* Несъществуващ номер не бива да връща нищо — иначе „търсенето работи"
       би било вярно и при hay, в който order_number изобщо не влиза. */
    if (guard('търсене на несъществуващ номер', () => w.setSRSearch('4100000000'))) {
      const rows = doc.getElementById('mod-stock-returns').querySelectorAll('tbody tr');
      ok('несъществуващ номер не връща редове', rows.length === 0, 'редове: ' + rows.length);
    }
  }

  section('ж) Редакция на решена разлика → номерът стига до вече създаденото връщане');
  {
    /* Обичайният ред на работа: магазинът подава бланка БЕЗ номер (формата
       submitDiffReport не пише order_number), Цвети решава "Връщане" с бутона
       на реда, и чак после въвежда номера в модала. Дотук връщането вече
       съществува, значи autoCreateReturnFromDiff излиза веднага — без този
       PATCH номерът никога не би стигнал до "За връщане". */
    const { w, doc, calls } = diffEnv([diffRow({
      id: 'l-g', order_number: null, type: 'return', status: 'pending'
    })]);
    if (guard('модалът за редакция се отваря', () => w.openSDModal('l-g'))) {
      doc.getElementById('sd-order').value = '4100135756';
      realClick(w, btn(doc.getElementById('sd-ov'), 'Запази'));
      await ticks();

      ok('разликата пак се записва',
        calls.patch.some(p => /stock_differences/.test(p.url)),
        calls.patch.map(p => p.url).join(' | '));

      const sp = srPatch(calls);
      if (ok('има PATCH към stock_returns', sp.length === 1,
        'брой: ' + sp.length + ' | ' + calls.patch.map(p => p.url).join(' | '))) {
        ok('заявката е по diff_line_id на редактирания ред',
          sp[0].url.indexOf('diff_line_id=eq.l-g') >= 0, sp[0].url);
        ok('заявката е стеснена до source=eq.diff',
          sp[0].url.indexOf('source=eq.diff') >= 0, sp[0].url);
        ok('тялото носи новия номер', sp[0].body.order_number === '4100135756',
          JSON.stringify(sp[0].body));
        ok('тялото носи САМО order_number — нищо друго не се пипа',
          Object.keys(sp[0].body).join(',') === 'order_number',
          Object.keys(sp[0].body).join(','));
      }
      ok('няма червен toast при успех',
        !calls.toast.some(t => String(t).indexOf('не е обновено') >= 0),
        calls.toast.join(' | '));
    }
  }

  section('з) Редакция с тип „Липса" → НЯМА PATCH към stock_returns');
  {
    const { w, doc, calls } = diffEnv([diffRow({
      id: 'l-h', order_number: '4100135756', type: 'return', status: 'pending'
    })]);
    if (guard('модалът за редакция се отваря', () => w.openSDModal('l-h'))) {
      doc.getElementById('sd-type').value = 'missing';
      doc.getElementById('sd-order').value = '4100999000';
      realClick(w, btn(doc.getElementById('sd-ov'), 'Запази'));
      await ticks();
      ok('разликата се записва', calls.patch.some(p => /stock_differences/.test(p.url)),
        calls.patch.map(p => p.url).join(' | '));
      ok('НЯМА PATCH към stock_returns', srPatch(calls).length === 0,
        srPatch(calls).map(p => p.url).join(' | '));
      ok('НЯМА и POST към stock_returns', srPost(calls).length === 0,
        'брой: ' + srPost(calls).length);
    }
  }

  section('и) Провален PATCH към stock_returns → червен toast, но записът минава');
  {
    /* Само заявките към stock_returns падат — PATCH-ът към stock_differences
       трябва да мине, за да се види, че записът на разликата НЕ е отменен. */
    const { w, doc, calls } = diffEnv([diffRow({
      id: 'l-i', order_number: null, type: 'return', status: 'pending'
    })], { fail: { PATCH: /stock_returns/ } });
    if (guard('модалът за редакция се отваря', () => w.openSDModal('l-i'))) {
      doc.getElementById('sd-order').value = '4100135756';
      realClick(w, btn(doc.getElementById('sd-ov'), 'Запази'));
      await ticks();

      ok('опитът за обновяване е направен', srPatch(calls).length === 1,
        'брой: ' + srPatch(calls).length);
      ok('провалът е засечен', calls.notOk.some(n => /stock_returns/.test(n.url)),
        JSON.stringify(calls.notOk));

      /* finish() пак се вика: модалът се затваря и записът се потвърждава. */
      ok('модалът е затворен', !doc.getElementById('sd-ov').classList.contains('open'));
      /* Проверява се, че ИМА потвърждение за запис, не точната дума. При
         редакция то гласи "Добавено!" вместо "Записано!" - заварен бъг в
         submitSD, независим от тази промяна: closeSDModal() нулира sdEditId
         точно преди тернарния оператор на следващия ред да го прочете. */
      ok('записът на разликата е потвърден',
        calls.toast.some(t => /^✅/.test(String(t))), calls.toast.join(' | '));
      ok('показан е и червеният toast',
        calls.toast.some(t => String(t) === 'Връщането не е обновено с номера на поръчката'),
        calls.toast.join(' | '));
      /* Червеното е ПОСЛЕДНО — иначе потвърждението за запис го изяжда. */
      ok('червеният toast е последният показан',
        String(calls.toast[calls.toast.length - 1]) === 'Връщането не е обновено с номера на поръчката',
        calls.toast.join(' | '));
      ok('цветът е червен', toastBg(doc) === RED, toastBg(doc));
    }
  }

  report();
})();
