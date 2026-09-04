/* „За връщане": филтър по доставчик + Excel износ на филтрираното.

   Цветелина праща на доставчика какво има да вземе при него — досега със
   скрийншот. Оттук нататък: падащо меню по доставчик (в „По рекламации" те са
   46, тоест чипове като при магазините не стават) и бутон „📥 Excel", който
   изнася ТОЧНО текущо филтрираните редове.

   Двата подтаба имат нарочно различен формат:
     · „По разлики"    — заглавен блок с приложените филтри, за четене от човек;
     · „По рекламации" — БЕЗ заглавен блок, ред 1 са заглавията, за да може
       файлът да се върне обратно през импорта. Тестът го проверява с истински
       кръг: изнесеният aoa минава през parseComplaintReturnsSheet и трябва да
       върне същите редове.

   Пускане:  node tests/stock-returns-supplier-export.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, fire } = H;

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: []
};

function row(o) {
  return Object.assign({
    id: 'r-1', source: 'diff', store_name: 'Раднево', supplier: 'КАМ-04',
    product_name: 'АРТИКУЛ', sap_code: '111', quantity: 3,
    order_number: null, purchase_order: null, id_euro: null, plant: null,
    doc_date: '2026-08-17', withdrawal_date: null, confirmed_date: null,
    expiry_date: null, status: 'pending', reason: '', courier_info: null,
    control_comment: null, controller_comment: null,
    diff_line_id: null, photos: [], created_by: 'Цветелина Тенева'
  }, o);
}

function env(rows, tab) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI, confirm: true,
    data: { stock_returns: rows, stock_differences: [], differences_reports: [] }
  });
  h.w.srData = JSON.parse(JSON.stringify(rows));
  h.w.srTab = tab || 'diff';
  h.w.srFilter = 'all';
  h.w.srStoreFilter = '';
  h.w.srSupplierFilter = '';
  h.w.srSearch = '';
  return h;
}

/* Стъб на SheetJS. Пази aoa-то, подадено на aoa_to_sheet, и името на файла.
   sheet_to_json повтаря договора на истинския SheetJS за нашия случай: ред 1
   са ключовете, останалите редове стават обекти. Точно това е половината от
   кръга износ -> импорт; другата половина (srFindCol, мапването на полетата)
   е реалният код на портала. */
function stubXLSX(w) {
  const cap = { aoas: [], files: [], sheetNames: [] };
  w.XLSX = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: (aoa) => { cap.aoas.push(aoa); return { __aoa: aoa }; },
      book_append_sheet: (wb, ws, name) => {
        wb.SheetNames.push(name); wb.Sheets[name] = ws; cap.sheetNames.push(name);
      },
      sheet_to_json: (sheet, opt) => {
        const aoa = sheet.__aoa || [];
        const head = aoa[0] || [];
        const dv = (opt && Object.prototype.hasOwnProperty.call(opt, 'defval')) ? opt.defval : undefined;
        return aoa.slice(1).map(r => {
          const o = {};
          head.forEach((hh, i) => { o[hh] = (r[i] === undefined || r[i] === null) ? dv : r[i]; });
          return o;
        });
      }
    },
    writeFile: (wb, fname) => { cap.files.push({ fname: fname, wb: wb }); }
  };
  return cap;
}

const sel = doc => doc.getElementById('sr-supplier-select');
const opts = doc => {
  const s = sel(doc);
  return s ? Array.prototype.map.call(s.querySelectorAll('option'),
    o => ({ value: o.value, text: o.textContent.trim(), selected: o.hasAttribute('selected') })) : null;
};
const bodyRows = doc => {
  const wrap = doc.getElementById('mod-stock-returns');
  return wrap ? wrap.querySelectorAll('tbody tr') : [];
};
const counter = doc => {
  const t = doc.getElementById('mod-stock-returns').textContent;
  const m = t.match(/(\d+) от (\d+) записа/);
  return m ? m[0] : null;
};

(async function run() {

  section('а) Падащото меню: уникални доставчици, сортирани, с бройки');
  {
    const { w, doc } = env([
      row({ id: 'r-1', supplier: 'КАМ-04' }),
      row({ id: 'r-2', supplier: 'ТЕСИ ООД' }),
      row({ id: 'r-3', supplier: 'КАМ-04' }),
      row({ id: 'r-4', supplier: 'АГРО ЕООД' }),
      /* Празен доставчик — не бива да стане опция: тя би изглеждала като
         втори "Всички доставчици" и би филтрирала до нищо. */
      row({ id: 'r-5', supplier: '' }),
      row({ id: 'r-6', supplier: null })
    ]);
    if (guard('renderStockReturns() не хвърля', () => w.renderStockReturns())) {
      const o = opts(doc);
      if (ok('менюто съществува', !!o, JSON.stringify(o))) {
        ok('първата опция е „-- Всички доставчици --" с празна стойност',
          o[0].value === '' && o[0].text === '-- Всички доставчици --', JSON.stringify(o[0]));
        const vals = o.slice(1).map(x => x.value);
        ok('доставчиците са уникални и подредени по азбучен ред',
          vals.join('|') === 'АГРО ЕООД|КАМ-04|ТЕСИ ООД', vals.join('|'));
        ok('празен доставчик няма опция', vals.every(v => v && v.trim()), vals.join('|'));
        ok('всяка опция носи брой', o[1].text === 'АГРО ЕООД (1)', o[1].text);
        ok('броят е реален, не 1 навсякъде',
          o.slice(1).find(x => x.value === 'КАМ-04').text === 'КАМ-04 (2)',
          o.slice(1).map(x => x.text).join(' | '));
        ok('менюто е точно 4 опции (Всички + 3)', o.length === 4, 'брой: ' + o.length);
      }
    }
  }

  section('б) Избор на доставчик → само неговите редове + обновен брояч');
  {
    const { w, doc } = env([
      row({ id: 'r-1', supplier: 'КАМ-04', product_name: 'ПЪРВИ' }),
      row({ id: 'r-2', supplier: 'ТЕСИ ООД', product_name: 'ВТОРИ' }),
      row({ id: 'r-3', supplier: 'КАМ-04', product_name: 'ТРЕТИ' })
    ]);
    if (guard('рендер без филтър', () => w.renderStockReturns())) {
      ok('без филтър се виждат трите реда', bodyRows(doc).length === 3);
      ok('броячът показва 3 от 3', counter(doc) === '3 от 3 записа', counter(doc));
    }
    /* Истинският път: onchange на самия <select>, не присвояване на променлива. */
    const s = sel(doc);
    if (ok('менюто съществува', !!s)) {
      s.value = 'КАМ-04';
      if (guard('onchange не хвърля', () => fire(w, s, 'change'))) {
        ok('остават само редовете на КАМ-04', bodyRows(doc).length === 2,
          'редове: ' + bodyRows(doc).length);
        const txt = doc.getElementById('mod-stock-returns').textContent;
        ok('ТЕСИ ООД го няма в таблицата', txt.indexOf('ВТОРИ') < 0);
        ok('двата реда на КАМ-04 са там',
          txt.indexOf('ПЪРВИ') >= 0 && txt.indexOf('ТРЕТИ') >= 0);
        ok('броячът показва 2 от 3', counter(doc) === '2 от 3 записа', counter(doc));
        ok('изборът остава маркиран след ререндера',
          (opts(doc).find(x => x.value === 'КАМ-04') || {}).selected === true,
          JSON.stringify(opts(doc)));
        ok('„Всички доставчици" вече не е маркирана',
          opts(doc)[0].selected === false, JSON.stringify(opts(doc)[0]));
      }
    }
    /* Обратно към всички — филтърът трябва да се вдига, не само да се сменя. */
    const s2 = sel(doc);
    s2.value = '';
    if (guard('връщане към „Всички"', () => fire(w, s2, 'change'))) {
      ok('пак се виждат трите реда', bodyRows(doc).length === 3,
        'редове: ' + bodyRows(doc).length);
    }
  }

  section('в) Смяна на подтаб нулира филтъра по доставчик');
  {
    const { w, doc } = env([
      row({ id: 'r-1', source: 'diff', supplier: 'КАМ-04' }),
      row({ id: 'r-2', source: 'complaint', supplier: 'ТЕСИ ООД' }),
      row({ id: 'r-3', source: 'complaint', supplier: 'АГРО ЕООД' })
    ]);
    guard('рендер', () => w.renderStockReturns());
    const s = sel(doc);
    s.value = 'КАМ-04';
    fire(w, s, 'change');
    ok('филтърът е зададен', w.srSupplierFilter === 'КАМ-04', w.srSupplierFilter);

    const tab = btn(doc, '📋 По рекламации');
    if (ok('бутонът за другия подтаб е на екрана', !!tab)) {
      realClick(w, tab);
      ok('srSupplierFilter е нулиран', w.srSupplierFilter === '',
        JSON.stringify(w.srSupplierFilter));
      ok('и srStoreFilter остава нулиран', w.srStoreFilter === '',
        JSON.stringify(w.srStoreFilter));
      ok('в новия подтаб се виждат двата му реда', bodyRows(doc).length === 2,
        'редове: ' + bodyRows(doc).length);
      ok('менюто вече предлага доставчиците на новия подтаб',
        opts(doc).slice(1).map(x => x.value).join('|') === 'АГРО ЕООД|ТЕСИ ООД',
        opts(doc).slice(1).map(x => x.value).join('|'));
    }
  }

  section('г) Доставчик + магазин + статус се комбинират (AND)');
  {
    const ROWS = [
      row({ id: 'r-1', supplier: 'КАМ-04', store_name: 'Раднево', status: 'pending', product_name: 'ЦЕЛ' }),
      row({ id: 'r-2', supplier: 'КАМ-04', store_name: 'Раднево', status: 'taken', product_name: 'ДРУГ СТАТУС' }),
      row({ id: 'r-3', supplier: 'КАМ-04', store_name: 'Враца', status: 'pending', product_name: 'ДРУГ МАГАЗИН' }),
      row({ id: 'r-4', supplier: 'ТЕСИ ООД', store_name: 'Раднево', status: 'pending', product_name: 'ДРУГ ДОСТАВЧИК' })
    ];
    const { w, doc } = env(ROWS);
    w.srSupplierFilter = 'КАМ-04';
    w.srStoreFilter = 'Раднево';
    w.srFilter = 'pending';
    if (guard('рендер с трите филтъра', () => w.renderStockReturns())) {
      const txt = doc.getElementById('mod-stock-returns').textContent;
      ok('остава точно един ред', bodyRows(doc).length === 1, 'редове: ' + bodyRows(doc).length);
      ok('това е пресечната точка на трите филтъра', txt.indexOf('ЦЕЛ') >= 0);
      ok('редът с друг статус отпада', txt.indexOf('ДРУГ СТАТУС') < 0);
      ok('редът с друг магазин отпада', txt.indexOf('ДРУГ МАГАЗИН') < 0);
      ok('редът с друг доставчик отпада', txt.indexOf('ДРУГ ДОСТАВЧИК') < 0);
      ok('srFilteredList() връща същото', w.srFilteredList().length === 1,
        'брой: ' + w.srFilteredList().length);
    }
  }

  section('д.1) Износ „По разлики": заглавен блок + точно филтрираните редове');
  {
    const { w, doc } = env([
      row({
        id: 'r-1', supplier: 'КАМ-04', store_name: 'Раднево', status: 'taken',
        product_name: 'ЩУЦЕР', sap_code: '34989', quantity: 5,
        order_number: '4100135756', purchase_order: 'PV-777', id_euro: 'ID-9',
        doc_date: '2026-08-17', plant: '1200', withdrawal_date: '2026-08-20',
        courier_info: 'Спиди 123', reason: 'Излишък от разлика'
      }),
      row({ id: 'r-2', supplier: 'ТЕСИ ООД', product_name: 'ЧУЖД РЕД' })
    ]);
    const cap = stubXLSX(w);
    w.srSupplierFilter = 'КАМ-04';
    guard('рендер', () => w.renderStockReturns());

    const b = btn(doc, '📥 Excel');
    if (ok('бутонът „📥 Excel" е на екрана', !!b)) {
      realClick(w, b);
      if (ok('листът е подаден на SheetJS', cap.aoas.length === 1, 'брой: ' + cap.aoas.length)) {
        const aoa = cap.aoas[0];
        ok('ред 1 е заглавието на файла', aoa[0][0] === 'ТеМАХ — Стока за връщане', JSON.stringify(aoa[0]));
        ok('заглавният блок носи доставчика', aoa[1][0] === 'Доставчик: КАМ-04', JSON.stringify(aoa[1]));
        ok('носи и магазина (тук: всички)', aoa[2][0] === 'Магазин: всички', JSON.stringify(aoa[2]));
        ok('носи статуса като ЕТИКЕТ, не код', aoa[3][0] === 'Статус: Всички', JSON.stringify(aoa[3]));
        ok('носи дата', /^Дата: \d{2}\.\d{2}\.\d{4}$/.test(aoa[4][0]), JSON.stringify(aoa[4]));
        ok('следва празен ред', Array.isArray(aoa[5]) && aoa[5].length === 0, JSON.stringify(aoa[5]));

        const head = aoa[6];
        ok('заглавията на колоните са 14 и в реда на таблицата',
          head.join('|') === 'Продукт|SAP|Кол.|Поръчка|ПВ-ЕВР|ИД-ЕВРО|Магазин|Доставчик|Дата докум.|Завод|Статус|Дата изтегляне|Изтеглена с|Коментар',
          head.join('|'));

        ok('изнесен е точно ЕДИН ред — филтрираният', aoa.length === 8, 'редове: ' + (aoa.length - 7));
        const r = aoa[7];
        ok('чуждият доставчик не е изнесен', aoa.every(x => x.indexOf('ЧУЖД РЕД') < 0));
        ok('продуктът е на място', r[0] === 'ЩУЦЕР', JSON.stringify(r[0]));
        ok('количеството е число, не низ', r[2] === 5, JSON.stringify(r[2]));
        ok('поръчката и ПВ-ЕВР са две различни колони',
          r[3] === '4100135756' && r[4] === 'PV-777', JSON.stringify([r[3], r[4]]));
        ok('статусът на реда е ЕТИКЕТ, не код', r[10] === 'Взета', JSON.stringify(r[10]));
        ok('датите са в дд.мм.гггг', r[8] === '17.08.2026' && r[11] === '20.08.2026',
          JSON.stringify([r[8], r[11]]));
      }
      if (ok('файлът е записан', cap.files.length === 1, 'брой: ' + cap.files.length)) {
        ok('името е по формата, с транслитериран доставчик',
          /^za-vrashtane-razliki-kam-04-\d{4}-\d{2}-\d{2}\.xlsx$/.test(cap.files[0].fname),
          cap.files[0].fname);
      }
    }
  }

  section('д.2) Износ „По рекламации": ред 1 са заглавията + кръг към импорта');
  {
    const ROWS = [
      row({
        id: 'c-1', source: 'complaint', supplier: 'КАМ-04', store_name: 'Враца',
        product_name: 'БОЯ ЛАТЕКС', sap_code: '55123', quantity: 12,
        expiry_date: '2026-12-31', reason: 'Изтекъл срок', status: 'pending'
      }),
      row({
        id: 'c-2', source: 'complaint', supplier: 'КАМ-04', store_name: 'Плевен',
        product_name: 'СИЛИКОН', sap_code: '55124', quantity: 4,
        expiry_date: null, reason: '', status: 'taken'
      }),
      row({ id: 'c-3', source: 'complaint', supplier: 'ТЕСИ ООД', product_name: 'ЧУЖД РЕД' })
    ];
    const { w, doc } = env(ROWS, 'complaint');
    const cap = stubXLSX(w);
    w.srSupplierFilter = 'КАМ-04';
    guard('рендер', () => w.renderStockReturns());

    const b = btn(doc, '📥 Excel');
    if (ok('бутонът „📥 Excel" е на екрана', !!b)) {
      realClick(w, b);
      if (ok('листът е подаден на SheetJS', cap.aoas.length === 1, 'брой: ' + cap.aoas.length)) {
        const aoa = cap.aoas[0];
        ok('НЯМА заглавен блок — ред 1 са заглавията',
          aoa[0][0] !== 'ТеМАХ — Стока за връщане' && aoa[0].length === 8, JSON.stringify(aoa[0]));
        /* Заглавията са първите псевдоними от SR_IMPORT_COL_ALIASES — сверява се
           срещу самия обект, а не срещу преписан списък, който би се разминал. */
        const AL = w.SR_IMPORT_COL_ALIASES;
        ok('заглавията са първите псевдоними от SR_IMPORT_COL_ALIASES + Статус',
          aoa[0].join('|') === [AL.product[0], AL.sap[0], AL.qty[0], AL.store[0],
            AL.supplier[0], AL.expiry[0], AL.reason[0], 'Статус'].join('|'),
          aoa[0].join('|'));
        ok('изнесени са двата реда на КАМ-04', aoa.length === 3, 'редове: ' + (aoa.length - 1));
        ok('чуждият доставчик не е изнесен', aoa.every(x => x.indexOf('ЧУЖД РЕД') < 0));
        ok('празната дата е празна, не тире', aoa[2][5] === '', JSON.stringify(aoa[2][5]));

        /* КРЪГЪТ: изнесеното минава обратно през реалния парсър на импорта. */
        const prog = doc.createElement('div');
        doc.body.appendChild(prog);
        let back = null;
        if (guard('parseComplaintReturnsSheet() не хвърля',
          () => { back = w.parseComplaintReturnsSheet(cap.files[0].wb, prog); })) {
          if (ok('импортът разпозна редовете', Array.isArray(back) && back.length === 2,
            JSON.stringify(back && back.length) + ' | ' + prog.innerHTML)) {
            ok('продукт се връща', back[0].product_name === 'БОЯ ЛАТЕКС', JSON.stringify(back[0].product_name));
            ok('SAP се връща', back[0].sap_code === '55123', JSON.stringify(back[0].sap_code));
            ok('количество се връща като число', back[0].quantity === 12, JSON.stringify(back[0].quantity));
            ok('магазин се връща', back[0].store_name === 'Враца', JSON.stringify(back[0].store_name));
            ok('доставчик се връща', back[0].supplier === 'КАМ-04', JSON.stringify(back[0].supplier));
            ok('срок на годност се връща в ISO', back[0].expiry_date === '2026-12-31',
              JSON.stringify(back[0].expiry_date));
            ok('причина се връща', back[0].reason === 'Изтекъл срок', JSON.stringify(back[0].reason));
            ok('вторият ред също', back[1].product_name === 'СИЛИКОН' && back[1].quantity === 4,
              JSON.stringify([back[1].product_name, back[1].quantity]));
            ok('празният срок се връща като null', back[1].expiry_date === null,
              JSON.stringify(back[1].expiry_date));
          }
        }
      }
      if (ok('файлът е записан', cap.files.length === 1, 'брой: ' + cap.files.length)) {
        ok('името е по формата за „рекламации"',
          /^za-vrashtane-reklamacii-kam-04-\d{4}-\d{2}-\d{2}\.xlsx$/.test(cap.files[0].fname),
          cap.files[0].fname);
      }
    }
  }

  section('д.3) Без избран доставчик името казва „vsichki"');
  {
    const { w, doc } = env([row({ id: 'r-1', supplier: 'КАМ-04' })]);
    const cap = stubXLSX(w);
    guard('рендер', () => w.renderStockReturns());
    realClick(w, btn(doc, '📥 Excel'));
    if (ok('файлът е записан', cap.files.length === 1)) {
      ok('името съдържа „vsichki"',
        /^za-vrashtane-razliki-vsichki-\d{4}-\d{2}-\d{2}\.xlsx$/.test(cap.files[0].fname),
        cap.files[0].fname);
    }
    ok('заглавният блок казва „всички"',
      cap.aoas[0][1][0] === 'Доставчик: всички', JSON.stringify(cap.aoas[0][1]));
  }

  section('е) Нула редове → toast, нищо не се записва');
  {
    const { w, doc, calls } = env([row({ id: 'r-1', supplier: 'КАМ-04', status: 'pending' })]);
    const cap = stubXLSX(w);
    /* Филтър, който не хваща нищо — бутонът все пак трябва да е на екрана. */
    w.srFilter = 'completed';
    if (guard('рендер с празен резултат', () => w.renderStockReturns())) {
      const b = btn(doc, '📥 Excel');
      if (ok('бутонът се показва и при празен списък', !!b)) {
        realClick(w, b);
        ok('нищо не е подадено на SheetJS', cap.aoas.length === 0, 'брой: ' + cap.aoas.length);
        ok('файл не е записан', cap.files.length === 0, 'брой: ' + cap.files.length);
        ok('показан е toast „Няма редове за износ"',
          calls.toast.some(t => String(t) === 'Няма редове за износ'), calls.toast.join(' | '));
        ok('НЕ казва, че нещо е изтеглено',
          !calls.toast.some(t => String(t).indexOf('изтеглен') >= 0), calls.toast.join(' | '));
      }
    }
  }

  section('ж) Без window.XLSX → добавя <script> от cdnjs, без да хвърля');
  {
    const { w, doc, calls } = env([row({ id: 'r-1', supplier: 'КАМ-04' })]);
    guard('рендер', () => w.renderStockReturns());
    ok('XLSX наистина липсва', !w.XLSX);
    const before = doc.querySelectorAll('script[src]').length;
    if (guard('exportSRExcel() не хвърля без SheetJS', () => w.exportSRExcel())) {
      const scripts = Array.prototype.map.call(doc.querySelectorAll('script[src]'), x => x.src);
      ok('добавен е точно един <script>', scripts.length === before + 1,
        scripts.length + ' срещу ' + before);
      ok('URL-ът е cdnjs, същият като при импорта',
        scripts.some(x => x === 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'),
        scripts.join(' | '));
      ok('още нищо не е изнесено (чака се зареждането)',
        !calls.toast.some(t => String(t).indexOf('Excel изтеглен') >= 0), calls.toast.join(' | '));
    }
  }

  report();
})();
