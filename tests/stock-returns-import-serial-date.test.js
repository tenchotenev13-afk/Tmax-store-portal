/* Импорт „Обобщен списък": дата, дошла като Excel сериен номер, вече не се губи.

   XLSX.read се вика без cellDates, тоест клетка, форматирана като истинска
   дата, идва като число (46236 = 02.08.2026). srParseFlexibleDate разпознаваше
   само текст и Date обект и за числото връщаше null — мълчаливо. Към 28.09.2026
   нито един от 378-те реда в „По рекламации" нямаше doc_date, при 105 с дата
   на изтегляне и 129 с потвърдена акт. (тези се пишат на ръка като текст).

   Данните се попълват при следващо качване на файла: познат ПВ-ЕВР се ОБНОВЯВА
   (раздел в), приключените не се пипат (заковано в stock-returns-import-update).

   Пускане:  node tests/stock-returns-import-serial-date.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn } = H;

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: []
};
const HEAD = ['НОВА ПВ-ЕВРО', 'НОВА ИД-ЕВРО', 'Доставчик', 'Дата документ', 'Завод',
  'Статус', 'Дата изтегляне', 'Изтеглена с', 'Потвърдена акт.', 'коментар', 'коментар Контролер'];

function env(aoaRows, existing) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI, confirm: true,
    data: {
      stock_returns: (url) => url.indexOf('purchase_order=in.') < 0 ? []
        : (existing || []).filter(r => url.indexOf(r.purchase_order) >= 0),
      stock_differences: [], differences_reports: []
    }
  });
  h.w.srData = []; h.w.srTab = 'complaint'; h.w.srFilter = 'all';
  h.w.srStoreFilter = ''; h.w.srSupplierFilter = ''; h.w.srSearch = '';
  const WB = { SheetNames: ['21'], Sheets: { '21': { __aoa: [HEAD].concat(aoaRows) } } };
  h.w.XLSX = {
    read: () => WB,
    utils: {
      sheet_to_json: (sheet, opt) => {
        if (opt && opt.header === 1) return sheet.__aoa;
        throw new Error('sheet_to_json без header:1 не се очаква тук');
      }
    }
  };
  h.w.FileReader = function () {
    const self = this;
    this.readAsArrayBuffer = function () {
      setTimeout(function () { self.onload({ target: { result: new Uint8Array(0) } }); }, 0);
    };
  };
  h.WB = WB;
  return h;
}
const settle = () => new Promise(res => setTimeout(res, 60));

(async function run() {

  section('а) srParseFlexibleDate: сериен номер → ISO; всичко старо както преди');
  {
    const { w } = env([]);
    const f = w.srParseFlexibleDate;
    const cases = [
      [46236, '2026-08-02', 'сериен номер 46236'],
      [46236.75, '2026-08-02', 'с час (дробна част) — денят не се мести'],
      [46022, '2025-12-31', 'граница на година'],
      [45351, '2024-02-29', 'истински 29 февруари'],
      [61, '1900-03-01', 'долна граница 61'],
      [60, null, '60 = фалшивият 29.02.1900 на Excel → null'],
      [0, null, 'нула → null'],
      [-5, null, 'отрицателно → null'],
      [4200016266, null, '10-цифрен ПВ-ЕВР в дата колоната → null'],
      [NaN, null, 'NaN → null'],
      ['17.08.2026', '2026-08-17', 'текст дд.мм.гггг (старо)'],
      ['17,08,2026', '2026-08-17', 'текст със запетаи (старо)'],
      ['17.08.26', '2026-08-17', 'двуцифрена година (старо)'],
      ['2026-08-17 00:00:00', '2026-08-17', 'ISO низ (старо)'],
      ['изпратено', null, 'свободен текст → null (старо)'],
      ['', null, 'празно → null (старо)'],
      ['46236', null, 'числото като ТЕКСТ не се тълкува (само истински числа)']
    ];
    cases.forEach(([inp, exp, label]) => {
      let got;
      guard(label + ' не хвърля', () => { got = f(inp); });
      ok(label + ': ' + JSON.stringify(inp) + ' → ' + JSON.stringify(exp), got === exp, JSON.stringify(got));
    });
  }

  section('б) Часовата зона не мести деня (UTC−10 и UTC+14)');
  {
    /* Git Bash не подава TZ към Node — задава се вътре в процеса и се
       проверява, че наистина е сменена. */
    const saved = process.env.TZ;
    ['Pacific/Honolulu', 'Pacific/Kiritimati'].forEach(tz => {
      process.env.TZ = tz;
      const off = new Date(2026, 7, 2).getTimezoneOffset();
      const { w } = env([]);
      ok(tz + ': зоната е сменена (offset ' + off + ')', off !== 0 && off !== -180 && off !== -120);
      ok(tz + ': 46236 → 2026-08-02', w.srParseFlexibleDate(46236) === '2026-08-02', w.srParseFlexibleDate(46236));
    });
    if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
  }

  section('в) parseDiffReturnsWorkbook: числовите дати в колони 3, 6, 8 стигат до реда');
  {
    const { w, WB } = env([
      ['4200016266', 'E-66', 'КАМ-04', 46236, '1210', 'ВЗЕТА', 46254, 'Спиди', 46255, '', ''],
      ['4200016001', 'E-01', 'ТЕСИ', '15.07.2026', '1203', 'НЕВЗЕТА', '', '', '', '', '']
    ]);
    let rows = null;
    if (guard('parseDiffReturnsWorkbook() не хвърля', () => { rows = w.parseDiffReturnsWorkbook(WB); })) {
      ok('два реда', rows.length === 2, String(rows.length));
      ok('doc_date от число', rows[0].doc_date === '2026-08-02', JSON.stringify(rows[0].doc_date));
      ok('withdrawal_date от число', rows[0].withdrawal_date === '2026-08-20', JSON.stringify(rows[0].withdrawal_date));
      ok('confirmed_date от число', rows[0].confirmed_date === '2026-08-21', JSON.stringify(rows[0].confirmed_date));
      ok('текстовата дата работи както преди', rows[1].doc_date === '2026-07-15', JSON.stringify(rows[1].doc_date));
      ok('празните дати остават null', rows[1].withdrawal_date === null && rows[1].confirmed_date === null,
        JSON.stringify([rows[1].withdrawal_date, rows[1].confirmed_date]));
    }
  }

  section('г) Повторно качване: познат ПВ-ЕВР без дата получава doc_date през PATCH');
  {
    const { w, doc, calls } = env(
      [['4200016266', 'E-66', 'КАМ-04', 46236, '1210', 'ВЗЕТА', '', 'Спиди', '', '', '']],
      [{ id: 'db-1', purchase_order: '4200016266', status: 'taken' }]
    );
    w.renderStockReturns();
    w.openReturnsImportModal();
    const inp = doc.getElementById('sr-import-file');
    Object.defineProperty(inp, 'files', { value: [{ name: 'obobshten.xlsx' }], configurable: true });
    const b = btn(doc, 'Започни импорт');
    if (ok('бутонът „Започни импорт" е на екрана', !!b)) {
      realClick(w, b);
      await settle();
      const p = calls.patch.find(x => /stock_returns/.test(x.url) && x.url.indexOf('id=eq.db-1') >= 0);
      if (ok('има PATCH за db-1', !!p, JSON.stringify(calls.patch.map(x => x.url)))) {
        ok('носи doc_date = 2026-08-02', p.body.doc_date === '2026-08-02', JSON.stringify(p.body.doc_date));
      }
    }
  }

  report();
})();
