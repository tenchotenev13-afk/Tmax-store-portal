/* Печат на бланка за разлики — loadDiffPrint() / renderDiffPrint().

   In-page модел по образеца на renderTransportPrint(): пише в #mod-print и
   вика showModule('print'). Без window.open и без библиотека — PDF-ът е
   диалогът на самия браузър.

   transport.js се зарежда ЗАЕДНО със stock-differences.js, в реда от
   index.html, защото шапката ползва getStoreInfo() оттам. Зареден поотделно,
   печатът щеше да гърми с "getStoreInfo is not defined" само в браузъра.

   Пускане:  node tests/stock-diff-print.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, allBtns, ticks } = H;

const JPG_URL = 'https://xiwkdiqqplgdcrkewgtv.supabase.co/storage/v1/object/public/bulletin-files/differences/1785914046488_0wo4k9.jpg';
const PDF_URL = 'https://xiwkdiqqplgdcrkewgtv.supabase.co/storage/v1/object/public/bulletin-files/differences/1786112461648_m8wisg.pdf';
const PDF_NAME = 'стокова разписка17082026.pdf';

function row(o) {
  return Object.assign({
    store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ', quantity: 1,
    quantity_received: null, order_number: null, confirmed_date: null,
    comment: null, resolution_comment: null, attachments: [],
    credit_note_issued: false, difference_category: 'undelivered', unit: 'бр.',
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null
  }, o);
}

/* Непрегледана бланка със СНИМКА — тя дава картата с бутон „🖨 Печат". */
const REP_NEW = {
  id: 'rep-a', direction: 'supplier', store_name: 'Раднево',
  counterpart: 'ТЕСИ ООД', document_number: '180489966', doc_date: '2026-08-17',
  submitted_by: 'Склад Раднево', general_comment: '', created_at: '2026-08-17T08:14:18.000Z',
  photos: [{ url: JPG_URL, name: 'IMG_2202.jpeg' }], reviewed: false
};
const LINE_NEW = row({
  id: 'l-a1', report_id: 'rep-a', type: null, status: 'new',
  material_name: 'ПЛАНКА ЪГЛОВА 100Х100Х55'
});

/* Прегледана бланка с PDF — не дава карта, тоест 🖨 в таблицата е единственият. */
const REP_DONE = {
  id: 'rep-b', direction: 'interstore', store_name: 'Раднево',
  counterpart: 'Логистичен склад Добрич', document_number: '180491138',
  doc_date: '2026-08-13', submitted_by: 'Склад Раднево',
  general_comment: '', created_at: '2026-08-13T12:29:31.000Z',
  photos: [{ url: PDF_URL, name: PDF_NAME }], reviewed: true
};
const LINE_DONE = row({
  id: 'l-b1', report_id: 'rep-b', type: 'return', status: 'taken',
  material_name: 'БАТЕРИЯ DURACELL LR03X4БР', quantity: 10, quantity_received: 0,
  resolved_by: 'Цветелина Тенева', resolved_at: '2026-08-14T10:00:00.000Z',
  completed_by: 'Склад Раднево', completed_at: '2026-08-15T11:30:00.000Z',
  attachments: [{ url: PDF_URL, type: 'file', filename: PDF_NAME }]
});

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: ['Раднево']
};

function env(rows, reports, dirTab) {
  const h = boot({
    /* transport.js ПРЕДИ stock-differences.js — редът от index.html. */
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: CVETI,
    confirm: true,
    data: {
      stock_differences: rows, differences_reports: reports || [],
      stock_returns: [], transport_orders: [], users: []
    }
  });
  h.w.sdData = JSON.parse(JSON.stringify(rows));
  h.w.diffReports = JSON.parse(JSON.stringify(reports || []));
  h.w.transportOrders = [];
  h.w.sdFilter = 'all';
  h.w.sdTypeFilter = 'all';
  h.w.sdDirTab = dirTab || 'supplier';

  /* Шпионин над showModule — пази реалното поведение, само записва повикването. */
  h.shown = [];
  const orig = h.w.showModule;
  h.w.showModule = function (m) { h.shown.push(m); return orig.apply(this, arguments); };
  return h;
}

const printEl = doc => doc.getElementById('mod-print');
const printTxt = doc => (printEl(doc).textContent || '');
const imgsWithSrc = (doc, src) =>
  doc.querySelectorAll('#mod-print img[src="' + src + '"]').length;

/* Стойността срещу даден етикет в шапката — по-точно от търсене в целия
   текст, където „—" се среща и в клетките на таблицата. */
function metaVal(doc, label) {
  const rows = doc.querySelectorAll('#mod-print .dp-meta tr');
  for (let i = 0; i < rows.length; i++) {
    const tds = rows[i].querySelectorAll('td');
    if (tds[0] && tds[0].textContent.trim() === label) return tds[1].textContent.trim();
  }
  return null;
}

/* Индексът на колона по ЗАГЛАВИЕТО ѝ, не по число. Печатната таблица има
   ДВА набора колони: при посока „доставчик" между „Кол." и „Реално" се
   вмъква „Стокова" (quantity_supplier_doc), тоест всичко след нея се измества
   с едно. Фиксираните числови индекси падаха при това добавяне, без нищо
   да е счупено на хартия — тестът броеше колони, вместо да ги разпознава. */
function colIdx(doc, label) {
  const heads = Array.from(doc.querySelectorAll('#mod-print .dp-tbl thead th'));
  return heads.findIndex(t => (t.textContent || '').trim() === label);
}

/* Клетката под дадено заглавие. При липсващо заглавие връща ЗАМЕСТИТЕЛ, не
   undefined: cells[-1].textContent хвърля TypeError, който убива процеса
   ПРЕДИ report(), тоест изходът остава без нито едно ❌ и изглежда като
   чист тест. Точно това стана при преименуването на „Изпълнил" на
   „Изпълн." в печата. Заместителят проваля проверката и КАЗВА защо. */
function cellOf(cells, doc, label) {
  const i = colIdx(doc, label);
  if (i < 0 || !cells[i]) return { textContent: '<няма колона "' + label + '">' };
  return cells[i];
}

(async function run() {

  section('0. Средата се вдига с ДВАТА файла заедно');
  {
    const { w } = env([], []);
    ok('transport.js е зареден (getStoreInfo съществува)',
      typeof w.getStoreInfo === 'function');
    ok('loadDiffPrint съществува', typeof w.loadDiffPrint === 'function');
    ok('renderDiffPrint съществува', typeof w.renderDiffPrint === 'function');
    ok('#mod-print съществува в index.html', !!w.document.getElementById('mod-print'));
    ok('renderTransportPrint не е пипан', typeof w.renderTransportPrint === 'function');
  }

  section('1. Клик на 🖨 в реда на таблицата — документът се пълни');
  {
    const { w, doc, shown } = env([LINE_DONE], [REP_DONE], 'interstore');

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      ok('#mod-print е празен преди клика', printTxt(doc).trim() === '');
      const p = btn(doc, '🖨');
      if (ok('бутонът 🖨 е в реда на таблицата', !!p)) {
        realClick(w, p);
        await ticks();

        ok('#mod-print получи съдържание', printTxt(doc).trim().length > 0);
        ok('съдържа наименованието на артикула',
          printTxt(doc).indexOf('БАТЕРИЯ DURACELL LR03X4БР') >= 0);
        ok('съдържа заглавието на бланката',
          printTxt(doc).indexOf('БЛАНКА ЗА РАЗЛИКИ') >= 0);
        ok('съдържа контрагента', printTxt(doc).indexOf('Логистичен склад Добрич') >= 0);
        ok('посоката е междускладов трансфер',
          printTxt(doc).indexOf('междускладов трансфер') >= 0);
        ok('showModule("print") е извикан', shown.indexOf('print') >= 0, shown.join(','));
      }
    }
  }

  section('2. Клик на „🖨 Печат" в картата на непрегледана бланка — същото');
  {
    const { w, doc, shown } = env([LINE_NEW], [REP_NEW]);

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const p = btn(doc, '🖨 Печат');
      if (ok('бутонът „🖨 Печат" е в картата', !!p)) {
        realClick(w, p);
        await ticks();

        ok('#mod-print получи съдържание', printTxt(doc).trim().length > 0);
        ok('съдържа наименованието на артикула',
          printTxt(doc).indexOf('ПЛАНКА ЪГЛОВА 100Х100Х55') >= 0);
        ok('съдържа документа', printTxt(doc).indexOf('180489966') >= 0);
        ok('съдържа подалия', printTxt(doc).indexOf('Склад Раднево') >= 0);
        ok('showModule("print") е извикан', shown.indexOf('print') >= 0, shown.join(','));
      }
    }
  }

  section('3. Ред без resolved_by — в таблицата „—", а подписният блок е с пунктир');
  {
    const { w, doc } = env([LINE_NEW], [REP_NEW]);

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      realClick(w, btn(doc, '🖨 Печат'));
      await ticks();

      const cells = doc.querySelectorAll('#mod-print .dp-tbl tbody tr td');
      if (ok('редът на бланката е рендиран', cells.length >= 10, String(cells.length))) {
        ok('клетка „Решил" е „—"', cellOf(cells, doc, 'Решил').textContent.trim() === '—',
          JSON.stringify(cellOf(cells, doc, 'Решил').textContent.trim()));
        ok('клетка „Изпълнил" е „—"', cellOf(cells, doc, 'Изпълн.').textContent.trim() === '—',
          JSON.stringify(cellOf(cells, doc, 'Изпълн.').textContent.trim()));
      }

      const sign = doc.querySelector('#mod-print .dp-sign');
      if (ok('подписният блок съществува', !!sign)) {
        const t = sign.textContent;
        ok('има ред „Подал:"', t.indexOf('Подал:') >= 0);
        ok('има ред „Решил:" ВЪПРЕКИ празното поле в базата', t.indexOf('Решил:') >= 0);
        ok('има ред „Изпълнил:"', t.indexOf('Изпълнил:') >= 0);
        ok('има ред „Приел:"', t.indexOf('Приел:') >= 0);
        ok('има дата за подпис', t.indexOf('Дата:') >= 0);
        ok('има 4 пунктирани линии',
          sign.querySelectorAll('.dp-dots').length === 4,
          String(sign.querySelectorAll('.dp-dots').length));
      }
    }
  }

  section('4. Бланка с PDF в photos — нула <img>, но името се вижда в текста');
  {
    const { w, doc } = env([LINE_DONE], [REP_DONE], 'interstore');

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      realClick(w, btn(doc, '🖨'));
      await ticks();

      ok('няма <img> с URL на PDF-а', imgsWithSrc(doc, PDF_URL) === 0,
        String(imgsWithSrc(doc, PDF_URL)));
      ok('името на файла се среща в текста', printTxt(doc).indexOf(PDF_NAME) >= 0);
      ok('секцията „Прикачени документи" се показва',
        printTxt(doc).indexOf('Прикачени документи') >= 0);
      ok('прикаченият на ниво РЕД влиза само като брой (📎1)',
        printTxt(doc).indexOf('📎1') >= 0);
    }
  }

  section('5. Бланка със снимка (.jpg) — има <img> с този URL');
  {
    const { w, doc } = env([LINE_NEW], [REP_NEW]);

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      realClick(w, btn(doc, '🖨 Печат'));
      await ticks();

      ok('има <img> с URL на снимката', imgsWithSrc(doc, JPG_URL) === 1,
        String(imgsWithSrc(doc, JPG_URL)));
      ok('секцията „Снимки към бланката" се показва',
        printTxt(doc).indexOf('Снимки към бланката') >= 0);
      ok('логото е вградено като data: URI, не като външен адрес',
        doc.querySelectorAll('#mod-print img[src^="data:image/png;base64,"]').length === 1);
    }
  }

  section('6. Ръчно добавен ред (без report_id) — бутон 🖨 НЕ се рендира');
  {
    const MANUAL = row({ id: 'l-m1', report_id: null, type: 'writein', status: 'pending',
      material_name: 'РЪЧНО ДОБАВЕН' });
    const { w, doc } = env([MANUAL], []);

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      ok('редът се вижда в таблицата', doc.body.textContent.indexOf('РЪЧНО ДОБАВЕН') >= 0);
      /* Само <button> — статусният бадж е <span> и би дал лъжливо съвпадение. */
      ok('нула бутона 🖨', allBtns(doc, '🖨').length === 0,
        String(allBtns(doc, '🖨').length));
    }
  }

  section('7. КОНТРОЛА: „← Обратно" връща към таб „Разлики"');
  {
    const { w, doc, shown } = env([LINE_DONE], [REP_DONE], 'interstore');

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      realClick(w, btn(doc, '🖨'));
      await ticks();
      ok('showModule("print") е извикан', shown.indexOf('print') >= 0, shown.join(','));

      const back = btn(doc, '← Обратно');
      if (ok('бутонът „← Обратно" е на екрана', !!back)) {
        realClick(w, back);
        await ticks();
        ok('showModule("stock-diff") е извикан', shown.indexOf('stock-diff') >= 0,
          shown.join(','));
        ok('„print" е преди „stock-diff" в реда на повикванията',
          shown.indexOf('print') < shown.lastIndexOf('stock-diff'), shown.join(','));
      }

      const pr = btn(doc, '🖨 Принтирай');
      ok('бутонът за печат сочи window.print()', !!pr &&
        /window\.print\(\)/.test(pr.getAttribute('onclick') || ''));
    }
  }

  section('8. ДАТИ: timestamptz не изтича в документа като "19T12:13:19+00:00.08.2026"');
  {
    /* fmtDate() в shared.js прави split("-") и слепва частите наобратно —
       подаден timestamptz дава каша. Затова колоните от този тип минават през
       sdFmtDateTime(). Стойността е дословно от базата. */
    const TS = '2026-08-19T12:13:19.170399+00:00';
    const { w, doc } = env([LINE_NEW],
      [Object.assign({}, REP_NEW, { created_at: TS, doc_date: '2026-08-19' })]);

    ok('sdFmtDateTime съществува', typeof w.sdFmtDateTime === 'function');
    ok('sdFmtDateTime реже часа', w.sdFmtDateTime(TS) === '19.08.2026', w.sdFmtDateTime(TS));
    ok('sdFmtDateTime не пипа чиста дата',
      w.sdFmtDateTime('2026-08-19') === '19.08.2026', w.sdFmtDateTime('2026-08-19'));
    ok('fmtDate в shared.js НЕ е пипан (още се чупи от timestamptz)',
      w.fmtDate(TS) !== '19.08.2026', w.fmtDate(TS));

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      realClick(w, btn(doc, '🖨 Печат'));
      await ticks();

      ok('документът съдържа "19.08.2026"', printTxt(doc).indexOf('19.08.2026') >= 0);
      ok('документът НЕ съдържа "T12:13"', printTxt(doc).indexOf('T12:13') < 0);
      ok('никъде не е изтекла суровата стойност',
        printTxt(doc).indexOf('170399') < 0 && printTxt(doc).indexOf('+00:00') < 0);
      ok('редът „Дата на подаване" е форматиран',
        metaVal(doc, 'Дата на подаване:') === '19.08.2026',
        JSON.stringify(metaVal(doc, 'Дата на подаване:')));
      /* КОНТРОЛА: doc_date е чиста date колона и минава по стария път. */
      ok('КОНТРОЛА: „Дата на документа" (date) пак е 19.08.2026',
        metaVal(doc, 'Дата на документа:') === '19.08.2026',
        JSON.stringify(metaVal(doc, 'Дата на документа:')));
    }
  }

  section('9. ДАТИ: празно created_at дава „—", без изключение');
  {
    const { w, doc } = env([LINE_NEW], [Object.assign({}, REP_NEW, { created_at: '' })]);

    ok('sdFmtDateTime("") е „—"', w.sdFmtDateTime('') === '—');
    ok('sdFmtDateTime(null) е „—"', w.sdFmtDateTime(null) === '—');
    ok('sdFmtDateTime(undefined) е „—"', w.sdFmtDateTime(undefined) === '—');

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      if (guard('печатът не хвърля при празна дата', () => {
        realClick(w, btn(doc, '🖨 Печат'));
      })) {
        ok('редът „Дата на подаване" е „—"',
          metaVal(doc, 'Дата на подаване:') === '—',
          JSON.stringify(metaVal(doc, 'Дата на подаване:')));
        ok('документът пак е рендиран', printTxt(doc).indexOf('БЛАНКА ЗА РАЗЛИКИ') >= 0);
      }
    }
  }

  section('10. ДАТИ: „✉️ Изпратен" в картата на новите бланки — същата поправка');
  {
    const TS = '2026-08-19T12:13:19.170399+00:00';
    const { w, doc } = env([LINE_NEW],
      [Object.assign({}, REP_NEW, { email_sent_at: TS })]);

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const card = doc.getElementById('diff-rep-rep-a');
      if (ok('картата на бланката е рендирана', !!card)) {
        const t = card.textContent;
        ok('показва „✉️ Изпратен 19.08.2026"', t.indexOf('✉️ Изпратен 19.08.2026') >= 0,
          t.replace(/\s+/g, ' ').slice(0, 200));
        ok('НЕ показва "T12:13"', t.indexOf('T12:13') < 0);
        ok('НЕ показва суровата стойност', t.indexOf('170399') < 0);
      }
    }
  }

  section('11. ЛЕЙАУТ: 10 колони с фиксирани ширини, сума точно 190mm');
  {
    const { w, doc } = env([LINE_DONE], [REP_DONE], 'interstore');

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      realClick(w, btn(doc, '🖨'));
      await ticks();

      const ths = doc.querySelectorAll('#mod-print .dp-tbl thead th');
      if (ok('заглавният ред има 10 колони', ths.length === 10, String(ths.length))) {
        let sum = 0, missing = 0;
        Array.prototype.forEach.call(ths, th => {
          const m = (th.getAttribute('style') || '').match(/width:(\d+(?:\.\d+)?)mm/);
          if (m) sum += parseFloat(m[1]); else missing++;
        });
        ok('всяка колона има фиксирана ширина', missing === 0, String(missing));
        ok('сумата е точно 190mm (полезната ширина на A4)', sum === 190, sum + 'mm');
        ok('„Наименование" е най-широката колона',
          /width:44mm/.test(ths[2].getAttribute('style') || ''),
          ths[2].getAttribute('style'));
      }
      const css = printEl(doc).querySelector('style').textContent;
      /* СЪЩИНСКАТА поправка. При table-layout:fixed без box-sizing:border-box
         padding-ът се добавя ВЪРХУ ширината: 10 колони × 3.2mm = 32mm извън
         листа и последната колона се отрязва. Сумата 190mm по-горе лъже,
         докато този ред го няма — затова двете проверки вървят заедно. */
      ok('.dp-tbl th е с box-sizing:border-box',
        /\.dp-tbl th\{[^}]*box-sizing:border-box/.test(css));
      ok('.dp-tbl td е с box-sizing:border-box',
        /\.dp-tbl td\{[^}]*box-sizing:border-box/.test(css));
      /* Печатът се рендира В страницата и наследява index.html:67
         th{white-space:nowrap} — без изрично normal заглавията не се пречупват
         и излизат извън клетките си. Глобалното правило остава непокътнато. */
      ok('.dp-tbl th е с white-space:normal (бие глобалното nowrap)',
        /\.dp-tbl th\{[^}]*white-space:normal/.test(css));
      /* index.html:69 tr:last-child td{border-bottom:none} бие ".dp-tbl td" по
         специфичност и оставя таблицата отворена отдолу. Възстановяваме я с
         правило от същата специфичност, но по-късно в реда. */
      ok('.dp-tbl tr:last-child td връща долната граница',
        /\.dp-tbl tr:last-child td\{[^}]*border-bottom:1px solid #bbb/.test(css));
      /* Чупене по думи, не по букви — break-all би нарязал наименованията. */
      ok('ползва се overflow-wrap:break-word', css.indexOf('overflow-wrap:break-word') >= 0);
      ok('НЕ се ползва word-break:break-all', css.indexOf('break-all') < 0);
    }
  }

  section('12. ДАТИ: resolved_at / completed_at в клетките „Решил" и „Изпълнил"');
  {
    /* Същият бъг като при created_at, но на ниво РЕД — тези две колони също са
       timestamptz и също минаваха през fmtDate(). Стойностите са дословно от
       базата. */
    const TS = '2026-08-19T12:13:19.170399+00:00';
    const LINE_TS = row({
      id: 'l-ts', report_id: 'rep-b', type: 'return', status: 'taken',
      material_name: 'АРТИКУЛ С ДАТИ',
      resolved_by: 'Цветелина Тенева', resolved_at: TS,
      completed_by: 'Склад Раднево', completed_at: TS
    });
    const { w, doc } = env([LINE_TS], [REP_DONE], 'interstore');

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      realClick(w, btn(doc, '🖨'));
      await ticks();

      const cells = doc.querySelectorAll('#mod-print .dp-tbl tbody tr td');
      if (ok('редът е рендиран', cells.length >= 10, String(cells.length))) {
        const solved = cellOf(cells, doc, 'Решил').textContent;
        const doneBy = cellOf(cells, doc, 'Изпълн.').textContent;

        ok('„Решил" показва името', solved.indexOf('Цветелина Тенева') >= 0, solved);
        ok('„Решил" показва 19.08.2026', solved.indexOf('19.08.2026') >= 0, solved);
        ok('„Решил" НЕ показва "T12:13"', solved.indexOf('T12:13') < 0, solved);

        ok('„Изпълнил" показва името', doneBy.indexOf('Склад Раднево') >= 0, doneBy);
        ok('„Изпълнил" показва 19.08.2026', doneBy.indexOf('19.08.2026') >= 0, doneBy);
        ok('„Изпълнил" НЕ показва "T12:13"', doneBy.indexOf('T12:13') < 0, doneBy);
      }

      ok('никъде в документа не е изтекла суровата стойност',
        printTxt(doc).indexOf('170399') < 0 && printTxt(doc).indexOf('+00:00') < 0);
      /* Точният вид на счупването, ако някой върне fmtDate обратно. */
      ok('няма следа от старото счупване "19T12:13"',
        printTxt(doc).indexOf('19T12:13') < 0);
    }
  }

  section('13. ДАТИ: име без дата и дата без име — нито едно не чупи клетката');
  {
    const LINE_HALF = row({
      id: 'l-half', report_id: 'rep-b', type: 'return', status: 'taken',
      material_name: 'ПОЛОВИНЧАТ',
      resolved_by: 'Цветелина Тенева', resolved_at: null,
      completed_by: null, completed_at: '2026-08-19T12:13:19.170399+00:00'
    });
    const { w, doc } = env([LINE_HALF], [REP_DONE], 'interstore');

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      realClick(w, btn(doc, '🖨'));
      await ticks();

      const cells = doc.querySelectorAll('#mod-print .dp-tbl tbody tr td');
      if (ok('редът е рендиран', cells.length >= 10, String(cells.length))) {
        ok('име без дата → само името, без празен ред',
          cellOf(cells, doc, 'Решил').textContent.trim() === 'Цветелина Тенева',
          JSON.stringify(cellOf(cells, doc, 'Решил').textContent.trim()));
        /* Дата без име е безсмислена — клетката е „—", датата не се показва. */
        ok('дата без име → „—"', cellOf(cells, doc, 'Изпълн.').textContent.trim() === '—',
          JSON.stringify(cellOf(cells, doc, 'Изпълн.').textContent.trim()));
        ok('изоставената дата не изтича в документа',
          printTxt(doc).indexOf('T12:13') < 0);
      }
    }
  }

  report();
})();
