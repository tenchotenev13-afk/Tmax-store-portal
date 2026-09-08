/* Импорт „Обобщен списък": познат ПВ-ЕВР номер вече ОБНОВЯВА реда, не го пропуска.

   Цветелина качва многолистовия ERP файл всяка седмица с обновени статуси,
   дати на изтегляне, куриери и коментари. Досега редовете с вече съществуващ
   ПВ-ЕВР се пропускаха като дублирани, тоест обновените данни изобщо не
   стигаха до портала.

   Оттук нататък, САМО за многолистовия формат (parseDiffReturnsWorkbook):
     · нов ПВ                      -> INSERT, както досега;
     · познат ПВ, не приключен     -> PATCH по id с полетата от файла;
     · познат ПВ, status=completed -> НЕ се пипа (файлът не връща назад
       решение, взето в портала);
     · ред в портала, който го няма във файла -> не се пипа изобщо.

   Единичният лист (parseComplaintReturnsSheet) остава на старото поведение —
   там няма ключ, на който да се вярва при презапис.

   Пускане:  node tests/stock-returns-import-update.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn } = H;

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: []
};

/* Позиционните колони на многолистовия файл — четат се по индекс, не по
   заглавие, защото файлът има две колони с еднакво заглавие „коментар
   Контролер". Ред 0 са заглавията и се прескача. */
const HEAD = ['НОВА ПВ-ЕВРО', 'НОВА ИД-ЕВРО', 'Доставчик', 'Дата документ', 'Завод',
  'Статус', 'Дата изтегляне', 'Изтеглена с', 'Потвърдена акт.',
  'коментар Контролер', 'коментар Контролер'];

/* Лист „21" = Раднево според SR_SHEET_TO_STORE. */
function workbook(rows) {
  return { SheetNames: ['21'], Sheets: { '21': { __aoa: [HEAD].concat(rows) } } };
}

/* Редовете, които „вече са в базата" — това връща дедупликационният GET.
   Стъбът филтрира по URL-а точно както би направил PostgREST с in.(...). */
const EXISTING = [
  { id: 'db-1', purchase_order: 'PV-UPD', status: 'pending' },
  { id: 'db-2', purchase_order: 'PV-DONE', status: 'completed' },
  { id: 'db-3', purchase_order: 'PV-EMPTY', status: 'taken' },
  /* Ред в портала, който го НЯМА във файла. Истинският GET пита само за
     номерата от файла, тоест този никога не се връща — точно затова е тук:
     нищо не бива да го докосне. */
  { id: 'db-4', purchase_order: 'PV-ABSENT', status: 'pending' }
];

function env(aoaRows, over) {
  const h = boot(Object.assign({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI, confirm: true,
    data: {
      stock_returns: (url) => {
        if (url.indexOf('purchase_order=in.') < 0) return [];
        return EXISTING.filter(r =>
          url.indexOf(encodeURIComponent(r.purchase_order)) >= 0 ||
          url.indexOf(r.purchase_order) >= 0);
      },
      stock_differences: [], differences_reports: []
    }
  }, over || {}));

  h.w.srData = [];
  h.w.srTab = 'diff';
  h.w.srFilter = 'all';
  h.w.srStoreFilter = '';
  h.w.srSupplierFilter = '';
  h.w.srSearch = '';

  const WB = workbook(aoaRows);
  h.w.XLSX = {
    read: () => WB,
    utils: {
      sheet_to_json: (sheet, opt) => {
        if (opt && opt.header === 1) return sheet.__aoa;
        /* Другият режим не се ползва по този път — ако някога се ползва,
           по-добре да гръмне, отколкото да върне мълчаливо нищо. */
        throw new Error('sheet_to_json без header:1 не се очаква тук');
      }
    }
  };
  /* FileReader в jsdom не чете истински файл — подаваме onload веднага. */
  h.w.FileReader = function () {
    const self = this;
    this.readAsArrayBuffer = function () {
      setTimeout(function () { self.onload({ target: { result: new Uint8Array(0) } }); }, 0);
    };
  };

  /* loadStockReturns() презарежда целия модул и подменя модала заедно с
     обобщението в него. Точно затова вече НЕ се вика в края на импорта, а при
     затваряне на прозореца — броим я, за да се види разликата. */
  h.loadCalls = { n: 0 };
  const realLoad = h.w.loadStockReturns;
  h.w.loadStockReturns = function () {
    h.loadCalls.n++;
    return realLoad.apply(this, arguments);
  };
  return h;
}

/* Прикача „избран файл" към полето и натиска „Започни импорт" — истинският път
   през onclick, не директно извикване. */
function runImport(w, doc) {
  w.renderStockReturns();
  w.openReturnsImportModal();
  const inp = doc.getElementById('sr-import-file');
  Object.defineProperty(inp, 'files', { value: [{ name: 'obobshten.xlsx' }], configurable: true });
  const b = btn(doc, 'Започни импорт');
  if (!b) return null;
  realClick(w, b);
  return b;
}

/* Веригата е дълга: FileReader -> дедуп GET -> POST партида -> PATCH партида.
   ticks() (3 макро-таска) не стига, затова изчакваме по-дълго. */
function settle() {
  return new Promise(res => setTimeout(res, 60));
}

const srPatches = calls => calls.patch.filter(x => /stock_returns/.test(x.url));
const srPosts = calls => calls.post.filter(x => x.table === 'stock_returns');
const prog = doc => (doc.getElementById('sr-import-progress') || {}).innerHTML || '';

/* Пълен ред от файла: ПВ, ИД, доставчик, дата док., завод, статус, дата изт.,
   куриер, потв. акт., коментар, коментар контролер. */
const ROW_NEW = ['PV-NEW', 'ID-1', 'КАМ-04', '01.08.2026', '1200', 'НЕВЗЕТА', '', '', '', '', ''];
const ROW_UPD = ['PV-UPD', 'ID-2', 'ТЕСИ ООД', '02.08.2026', '1300', 'ВЗЕТА',
  '20.08.2026', 'Спиди 777', '21.08.2026', 'Проверено', 'Ок от контрольор'];
const ROW_DONE = ['PV-DONE', 'ID-3', 'АГРО', '03.08.2026', '1400', 'НЕВЗЕТА', '', 'НЕ ПИПАЙ', '', '', ''];
/* Празни клетки — трябва да стигнат до базата като null, не като старата стойност. */
const ROW_EMPTY = ['PV-EMPTY', '', 'БУЛ', '', '', 'НЕВЗЕТА', '', '', '', '', ''];

(async function run() {

  section('а) 1 нов + 1 съществуващ + 1 приключен → 1 POST, 1 PATCH, нищо за приключения');
  {
    const { w, doc, calls } = env([ROW_NEW, ROW_UPD, ROW_DONE]);
    if (guard('импортът тръгва', () => runImport(w, doc))) {
      await settle();

      const posts = srPosts(calls);
      if (ok('има точно един POST (партидата с новите)', posts.length === 1, 'брой: ' + posts.length)) {
        const rows = Array.isArray(posts[0].body) ? posts[0].body : [posts[0].body];
        ok('в партидата е точно 1 ред', rows.length === 1, 'брой: ' + rows.length);
        ok('това е новият ПВ', rows[0].purchase_order === 'PV-NEW', JSON.stringify(rows[0].purchase_order));
      }

      const patches = srPatches(calls);
      if (ok('има точно един PATCH', patches.length === 1,
        'брой: ' + patches.length + ' | ' + patches.map(p => p.url).join(' | '))) {
        ok('PATCH-ът е по id на съществуващия ред (db-1)',
          patches[0].url.indexOf('id=eq.db-1') >= 0, patches[0].url);
      }
      ok('приключеният ред не е пипан (няма заявка към db-2)',
        !patches.some(p => p.url.indexOf('db-2') >= 0), patches.map(p => p.url).join(' | '));
      ok('приключеният ред не е и вмъкнат наново',
        !calls.post.some(p => JSON.stringify(p.body).indexOf('PV-DONE') >= 0),
        JSON.stringify(calls.post.map(p => p.body)));
      ok('нищо не е изтрито', calls.del.length === 0, JSON.stringify(calls.del));
    }
  }

  section('б) Тялото на PATCH-а носи данните от файла и НЕ носи ключовите полета');
  {
    const { w, doc, calls } = env([ROW_UPD]);
    if (guard('импортът тръгва', () => runImport(w, doc))) {
      await settle();
      const p = srPatches(calls)[0];
      if (ok('има PATCH', !!p, prog(doc))) {
        ok('статусът от файла (ВЗЕТА → taken)', p.body.status === 'taken', JSON.stringify(p.body.status));
        ok('дата на изтегляне', p.body.withdrawal_date === '2026-08-20', JSON.stringify(p.body.withdrawal_date));
        ok('куриер', p.body.courier_info === 'Спиди 777', JSON.stringify(p.body.courier_info));
        ok('коментар Контролер', p.body.controller_comment === 'Ок от контрольор',
          JSON.stringify(p.body.controller_comment));
        ok('коментар', p.body.control_comment === 'Проверено', JSON.stringify(p.body.control_comment));
        ok('потвърдена актуализация', p.body.confirmed_date === '2026-08-21',
          JSON.stringify(p.body.confirmed_date));
        ok('доставчик', p.body.supplier === 'ТЕСИ ООД', JSON.stringify(p.body.supplier));
        ok('завод', p.body.plant === '1300', JSON.stringify(p.body.plant));
        ok('ИД-ЕВРО', p.body.id_euro === 'ID-2', JSON.stringify(p.body.id_euro));

        /* Ключовите и произходните полета не се пипат — иначе повторен импорт
           би пренаписал магазина или би скъсал връзката към разликата. */
        const forbidden = ['store_name', 'purchase_order', 'source', 'created_by',
          'created_at', 'photos', 'diff_line_id', 'order_number'];
        const leaked = forbidden.filter(k => Object.prototype.hasOwnProperty.call(p.body, k));
        ok('нито едно защитено поле не е в тялото', leaked.length === 0, leaked.join(', '));
        ok('тялото е точно 10 полета', Object.keys(p.body).length === 10,
          Object.keys(p.body).join(','));
      }
    }
  }

  section('в) Празна клетка във файла → null, не запазена стара стойност');
  {
    const { w, doc, calls } = env([ROW_EMPTY]);
    if (guard('импортът тръгва', () => runImport(w, doc))) {
      await settle();
      const p = srPatches(calls)[0];
      if (ok('има PATCH за PV-EMPTY', !!p && p.url.indexOf('id=eq.db-3') >= 0,
        (p && p.url) || prog(doc))) {
        ok('празен куриер → null', p.body.courier_info === null, JSON.stringify(p.body.courier_info));
        ok('празен коментар → null', p.body.control_comment === null, JSON.stringify(p.body.control_comment));
        ok('празен коментар Контролер → null', p.body.controller_comment === null,
          JSON.stringify(p.body.controller_comment));
        ok('празна дата на изтегляне → null', p.body.withdrawal_date === null,
          JSON.stringify(p.body.withdrawal_date));
        ok('празен завод → null', p.body.plant === null, JSON.stringify(p.body.plant));
        ok('празно ИД-ЕВРО → null', p.body.id_euro === null, JSON.stringify(p.body.id_euro));
        ok('нито едно поле не е празен низ',
          Object.keys(p.body).every(k => p.body[k] !== ''), JSON.stringify(p.body));
        ok('непразните пак минават', p.body.supplier === 'БУЛ', JSON.stringify(p.body.supplier));
      }
    }
  }

  section('г) Ред в портала без съответствие във файла — не се пипа');
  {
    const { w, doc, calls } = env([ROW_NEW, ROW_UPD]);
    if (guard('импортът тръгва', () => runImport(w, doc))) {
      await settle();
      const all = calls.patch.concat(calls.post).map(x => x.url).join(' | ') + ' ' + JSON.stringify(calls.del);
      ok('никаква заявка не споменава db-4', all.indexOf('db-4') < 0, all);
      ok('никаква заявка не споменава PV-ABSENT',
        all.indexOf('PV-ABSENT') < 0 &&
        JSON.stringify(calls.patch.map(p => p.body)).indexOf('PV-ABSENT') < 0, all);
      ok('DELETE изобщо няма', calls.del.length === 0, JSON.stringify(calls.del));
    }
  }

  section('д) Провален PATCH → червено с ПВ номера, останалите минават');
  {
    /* Пада само редът на db-1; db-3 трябва да мине — иначе „останалите
       продължават" не е доказано, а само твърдяно. */
    const { w, doc, calls } = env([ROW_NEW, ROW_UPD, ROW_EMPTY],
      { fail: { PATCH: /id=eq\.db-1/ } });
    if (guard('импортът тръгва', () => runImport(w, doc))) {
      await settle();
      ok('и двата PATCH-а са изпратени', srPatches(calls).length === 2,
        'брой: ' + srPatches(calls).length);
      ok('провалът е засечен', calls.notOk.some(n => /id=eq\.db-1/.test(n.url)),
        JSON.stringify(calls.notOk));

      const html = prog(doc);
      ok('прогресът показва ПВ номера на провалилия се ред',
        html.indexOf('PV-UPD') >= 0, html);
      ok('и то в червено', /color:#dc2626/.test(html), html);
      ok('успелият ред НЕ е изброен като провален',
        html.indexOf('PV-EMPTY') < 0, html);
      ok('новият ред пак е качен', srPosts(calls).length === 1, 'брой: ' + srPosts(calls).length);
      ok('обобщението брои 1 обновен, не 2', /Обновени: 1/.test(html), html);
    }
  }

  section('е) Обобщението „Нови / Обновени / Пропуснати" е с верните числа');
  {
    const { w, doc } = env([ROW_NEW, ROW_UPD, ROW_EMPTY, ROW_DONE]);
    if (guard('импортът тръгва', () => runImport(w, doc))) {
      await settle();
      const html = prog(doc);
      ok('1 нов', /Нови: 1/.test(html), html);
      ok('2 обновени', /Обновени: 2/.test(html), html);
      ok('1 пропуснат приключен', /Пропуснати \(приключени\): 1/.test(html), html);
      ok('няма червено при чист импорт', html.indexOf('#dc2626') < 0, html);
      ok('редът е зелен', html.indexOf('#16a34a') >= 0, html);
    }
  }

  section('ж) Модалът остава отворен след импорт; презарежда се при затваряне');
  {
    const h = env([ROW_NEW, ROW_UPD, ROW_DONE]);
    const { w, doc } = h;
    if (guard('импортът тръгва', () => runImport(w, doc))) {
      await settle();

      /* Същината: обобщението е още на екрана, а таблицата НЕ е презаредена.
         Досега loadStockReturns() тръгваше веднага и отнасяше модала заедно
         със съобщението — червеният ред с ПВ номерата мигваше и изчезваше. */
      const html = prog(doc);
      ok('обобщението още стои в progEl', /Нови: 1/.test(html) && /Обновени: 1/.test(html), html);
      ok('loadStockReturns() НЕ е викана', h.loadCalls.n === 0, 'брой: ' + h.loadCalls.n);
      ok('модалът е още отворен',
        doc.getElementById('sr-import-ov').classList.contains('open'));

      const b = doc.getElementById('sr-import-btn');
      if (ok('бутонът съществува', !!b)) {
        ok('текстът му вече е „Затвори"', b.textContent.trim() === 'Затвори', b.textContent.trim());
        ok('onclick-ът му вече затваря, не импортира',
          /closeReturnsImportModal/.test(b.getAttribute('onclick') || ''), b.getAttribute('onclick'));

        realClick(w, b);
        ok('след „Затвори" loadStockReturns() е викана точно веднъж',
          h.loadCalls.n === 1, 'брой: ' + h.loadCalls.n);
        /* loadStockReturns() веднага слага спинера в целия модул, тоест
           модалът изчезва от DOM-а до следващия рендер — и двете състояния
           значат „не се вижда". */
        const ov = doc.getElementById('sr-import-ov');
        ok('модалът вече не се вижда', !ov || !ov.classList.contains('open'),
          ov ? ov.className : '(няма го в DOM-а)');
        ok('обобщението е изчистено', prog(doc) === '', prog(doc));

        /* Второ затваряне не бива да презарежда пак — флагът се сваля.
           Бутонът вече го няма (спинерът е подменил модула), затова се вика
           направо функцията, която ✕ и „Затвори" биха извикали. */
        w.closeReturnsImportModal();
        ok('повторно затваряне не презарежда втори път',
          h.loadCalls.n === 1, 'брой: ' + h.loadCalls.n);
      }
    }

    /* Другият път на затваряне — ✕ в заглавната лента. Той трябва да
       презарежда също, иначе таблицата остава стара след импорт. */
    const h2 = env([ROW_NEW]);
    if (guard('втори импорт тръгва', () => runImport(h2.w, h2.doc))) {
      await settle();
      ok('пак не е презаредено веднага', h2.loadCalls.n === 0, 'брой: ' + h2.loadCalls.n);
      /* На страницата има ДВА бутона „✕" — този на модала за редакция стои
         преди този на импорта, а btn() връща първия. Търсенето е стеснено до
         самия модал за импорт, иначе се кликa чужд бутон и проверката минава
         срещу нищо. */
      const x = btn(h2.doc.getElementById('sr-import-ov'), '✕');
      if (ok('бутонът „✕" на модала за импорт е на екрана', !!x,
        (x && x.getAttribute('onclick')) || '')) {
        realClick(h2.w, x);
        ok('затварянето с „✕" също презарежда', h2.loadCalls.n === 1, 'брой: ' + h2.loadCalls.n);
      }
    }

    /* Затваряне БЕЗ импорт не бива да презарежда нищо. */
    const h3 = env([ROW_NEW]);
    h3.w.renderStockReturns();
    h3.w.openReturnsImportModal();
    if (guard('затваряне без импорт', () => h3.w.closeReturnsImportModal())) {
      ok('без импорт няма презареждане', h3.loadCalls.n === 0, 'брой: ' + h3.loadCalls.n);
    }
  }

  report();
})();
