/* История — касовите заявки през sbGetAll (лимит 1000 на PostgREST, стъпка 2).

   Лист „Документи“ в Excel излезе с точно 1000 реда за 01.09–31.10 при 1427 в
   базата (проверено на живо 11.10.2026); kasa_reports за същия период са 1309.
   Мокът се държи като PostgREST: максимум 1000 реда, чете limit/offset.

   Покрива:
     1. Търсене (тип Каса): 1001 kasa_reports → две страници, id tiebreaker,
        всичките 1001 в histData.kasa; провал → червен ред „каса“ + toast.
     1в. Секцията „Прикачени документи“ на екрана: 1001 → всичките;
        провал (и на първата страница) → червен ред „документи“.
     2. Excel износ: 1001 kasa_documents → лист „Документи“ с 1001 реда +
        заглавие; kasa_zoborot/kasa_glavna също минават на страници с id.
     3. Excel износ: провал на страница в kasa_documents / kasa_zoborot /
        histData.kasa → файл НЯМА, червен toast има.

   Мутационна проверка (11.10.2026), всеки мутант пуснат срещу този тест:
     - kasa_documents обратно на sbGet                    — СЪБОРЕН (5 ❌)
     - махнат `,id.desc` от kasa_reports                  — СЪБОРЕН (1 ❌)
     - махната проверката `if(cut.length)` в износа       — СЪБОРЕН (8 ❌)
     - kasa_documents НА ЕКРАНА обратно на sbGet         — СЪБОРЕН (5 ❌)
   Неубити мутанти: няма. Базата преди кръга: exit 0.

   Пускане:  node tests/history-kasa-get-all.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, section, report, guard, ticks } = H;

const ADMIN = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис'
};

function rows(n, mk) { var out = []; for (var i = 0; i < n; i++) out.push(mk(i)); return out; }
const report_ = i => ({
  id: 'kr-' + String(100000 + i), store_name: i % 2 ? 'Карлово' : 'Шумен', date: '2026-10-01',
  pos_number: String(i), kasa_number: '1', cashier_name: 'Касиер ' + i,
  total_turnover: 100, cash_turnover: 60, card_turnover: 40, storna_total: 0,
  counted_cash: 60, razlika: 0, status: 'confirmed', created_at: '2026-10-01T18:00:00Z'
});
const zob = i => ({ id: 'z-' + (100000 + i), store_name: 'Шумен', date: '2026-10-01', status: 'confirmed' });
const gl  = i => ({ id: 'g-' + (100000 + i), store_name: 'Шумен', date: '2026-10-01', status: 'confirmed' });
const doc = i => ({
  id: 'd-' + (100000 + i), store_name: 'Шумен', date: '2026-10-01', report_type: 'pos', doc_type: 'pos',
  file_name: 'f' + i + '.pdf', uploaded_by: 'Управител', created_at: '2026-10-01T18:00:00Z'
});

/* tables: { име: редове }; failAt: { име: offset, на който страницата пада } */
function env(tables, failAt) {
  failAt = failAt || {};
  var urls = [];
  var data = { transport_orders: [], client_orders: [], stores: [], kasa_storno: [], kasa_storno_items: [] };
  Object.keys(tables).forEach(function (t) {
    data[t] = function (url) {
      urls.push(url);
      var u = decodeURIComponent(url);
      var lim = /[?&]limit=(\d+)/.exec(u), off = /[?&]offset=(\d+)/.exec(u);
      var limit = Math.min(lim ? +lim[1] : 1000, 1000), offset = off ? +off[1] : 0;
      return tables[t].slice(offset, offset + limit);
    };
  });
  var h = boot({
    modules: ['kasa.js', 'kasa-docs.js', 'history.js'],
    user: ADMIN, data: data,
    fail: { GET: function (url) {
      if (urls.length > 40) return { status: 500, body: { message: 'runaway' } };
      var m = /\/rest\/v1\/([a-z_]+)\?/.exec(url); if (!m || failAt[m[1]] == null) return null;
      var off = /[?&]offset=(\d+)/.exec(decodeURIComponent(url));
      return off && +off[1] === failAt[m[1]] ? { status: 500, body: { message: 'boom' } } : null;
    } }
  });
  h.gets = function (t) { return h.calls.get.filter(function (u) { return u.indexOf('/' + t + '?') >= 0; }); };
  h.cap = { aoas: [], sheets: {}, files: [] };
  h.w.XLSX = {
    utils: {
      book_new: function () { return { SheetNames: [], Sheets: {} }; },
      aoa_to_sheet: function (aoa) { h.cap.aoas.push(aoa); return { __aoa: aoa }; },
      book_append_sheet: function (wb, ws, n) { wb.SheetNames.push(n); wb.Sheets[n] = ws; h.cap.sheets[n] = ws.__aoa; }
    },
    writeFile: function (wb, fname) { h.cap.files.push(fname); }
  };
  return h;
}
async function search(h, type) {
  h.w.renderHistoryShell();
  h.doc.getElementById('h-from').value = '2026-09-01';
  h.doc.getElementById('h-to').value   = '2026-10-31';
  h.doc.getElementById('h-type').value = type;
  realClick(h.w, btn(h.doc.getElementById('mod-history'), 'Търси →'), 'Търси →');
  await ticks();
}
async function exportXl(h) {
  var b = btn(h.doc.getElementById('h-results'), 'Експорт Excel');
  if (!ok('бутонът „Експорт Excel“ е на екрана', !!b)) return;
  realClick(h.w, b, 'Експорт Excel');
  await ticks();
}
const lastToast = h => h.calls.toast[h.calls.toast.length - 1] || '';

(async function () {

  section('1. Търсене (тип Каса) — 1001 ПОС отчета');
  {
    var h = env({ kasa_reports: rows(1001, report_), kasa_documents: [] });
    await search(h, 'kasa');
    var g = h.gets('kasa_reports');
    ok('а) две страници към kasa_reports', g.length === 2, 'реално: ' + g.length);
    ok('а) order=date.desc,id.desc', g.length && decodeURIComponent(g[0]).indexOf('order=date.desc,id.desc&') >= 0, g[0]);
    ok('а) histData.kasa = 1001', h.w.histData.kasa.length === 1001, 'реално: ' + h.w.histData.kasa.length);
    var txt = h.doc.getElementById('h-results').textContent;
    ok('а) „Общо: 1001“ на екрана', txt.indexOf('Общо: 1001') >= 0, txt.slice(0, 200));
    ok('а) без „Непълни данни“', txt.indexOf('Непълни данни') < 0);
    h.close();

    h = env({ kasa_reports: rows(1001, report_), kasa_documents: [] }, { kasa_reports: 1000 });
    await search(h, 'kasa');
    txt = h.doc.getElementById('h-results').textContent;
    ok('б) провал → червен ред „Непълни данни — каса: прочетени 1000 реда“',
       txt.indexOf('Непълни данни — каса: прочетени 1000 реда') >= 0, txt.slice(0, 200));
    ok('б) и toast за каса', h.calls.toast.some(function (t) { return t.indexOf('каса: прочетени 1000') >= 0; }), h.calls.toast.join(' | '));
    h.close();
  }

  section('1в. Секция „Прикачени документи“ на екрана — 1001 документа');
  {
    var h = env({ kasa_reports: rows(3, report_), kasa_documents: rows(1001, doc) });
    await search(h, 'kasa');
    var g = h.gets('kasa_documents');
    ok('в) две страници към kasa_documents', g.length === 2, 'реално: ' + g.length);
    ok('в) id tiebreaker в order', g.length && decodeURIComponent(g[0]).indexOf('order=date.desc,store_name.asc,created_at.desc,id.desc&') >= 0, g[0]);
    var txt = h.doc.getElementById('h-results').textContent;
    ok('в) „📎 Прикачени документи (1001)“', txt.indexOf('Прикачени документи (1001)') >= 0, txt.slice(0, 300));
    ok('в) последният (f1000.pdf) е на екрана', txt.indexOf('f1000.pdf') >= 0);
    ok('в) без „Непълни данни“', txt.indexOf('Непълни данни') < 0);
    h.close();

    h = env({ kasa_reports: rows(3, report_), kasa_documents: rows(1001, doc) }, { kasa_documents: 1000 });
    await search(h, 'kasa');
    txt = h.doc.getElementById('h-results').textContent;
    ok('г) провал → червен ред „Непълни данни — документи: прочетени 1000 реда“',
       txt.indexOf('Непълни данни — документи: прочетени 1000 реда') >= 0, txt.slice(0, 300));
    h.close();

    h = env({ kasa_reports: rows(3, report_), kasa_documents: rows(5, doc) }, { kasa_documents: 0 });
    await search(h, 'kasa');
    txt = h.doc.getElementById('h-results').textContent;
    ok('д) провал на първата (0 документа) → пак червен ред, не мълчание',
       txt.indexOf('Непълни данни — документи: прочетени 0 реда') >= 0, txt.slice(0, 300));
    h.close();
  }

  section('2. Excel износ — 1001 документа, 1001 равнения, 1001 главни каси');
  {
    var h = env({ kasa_reports: rows(3, report_), kasa_documents: rows(1001, doc),
                  kasa_zoborot: rows(1001, zob), kasa_glavna: rows(1001, gl) });
    await search(h, 'kasa');
    h.calls.get.length = 0;
    await exportXl(h);
    ['kasa_documents', 'kasa_zoborot', 'kasa_glavna'].forEach(function (t) {
      var g = h.gets(t);
      ok('а) ' + t + ': две страници', g.length === 2, 'реално: ' + g.length);
      ok('а) ' + t + ': id tiebreaker в order', g.length && /order=[^&]*,id\.desc&/.test(decodeURIComponent(g[0])), g[0]);
    });
    ok('а) файлът е създаден', h.cap.files.length === 1, 'файлове: ' + h.cap.files.length);
    var d = h.cap.sheets['Документи'];
    ok('а) лист „Документи“: 1001 реда + заглавие', d && d.length === 1002, 'реално: ' + (d && d.length));
    ok('а) последният документ (f1000.pdf) е в листа', !!d && d.some(function (r) { return r[4] === 'f1000.pdf'; }));
    h.close();
  }

  section('3. Excel износ — провал на страница → файл няма, toast има');
  {
    for (const c of [['kasa_documents', 1000, 'документи: прочетени 1000'],
                     ['kasa_zoborot', 0, 'равнение на оборота: прочетени 0'],
                     ['kasa_glavna', 1000, 'главна каса: прочетени 1000']]) {
      var f = {}; f[c[0]] = c[1];
      var h = env({ kasa_reports: rows(3, report_), kasa_documents: rows(1001, doc),
                    kasa_zoborot: rows(5, zob), kasa_glavna: rows(1001, gl) }, f);
      await search(h, 'kasa');
      await exportXl(h);
      ok(c[0] + ' пада на offset ' + c[1] + ' → файл НЯМА', h.cap.files.length === 0, 'файлове: ' + h.cap.files.length);
      ok(c[0] + ' → toast „' + c[2] + '“ + „Excel не е създаден“',
         lastToast(h).indexOf(c[2]) >= 0 && lastToast(h).indexOf('Excel не е създаден') >= 0, lastToast(h));
      h.close();
    }

    /* ПОС отчетите в листовете по магазини идват от търсенето на екрана. */
    var h = env({ kasa_reports: rows(1001, report_), kasa_documents: [], kasa_zoborot: [], kasa_glavna: [] },
                { kasa_reports: 1000 });
    await search(h, 'kasa');
    await exportXl(h);
    ok('histData.kasa непълно → файл НЯМА', h.cap.files.length === 0, 'файлове: ' + h.cap.files.length);
    ok('histData.kasa непълно → toast „каса: прочетени 1000“', lastToast(h).indexOf('каса: прочетени 1000 реда') >= 0, lastToast(h));
    h.close();
  }

  report();
})();
