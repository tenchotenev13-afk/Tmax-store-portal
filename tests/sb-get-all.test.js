/* sbGetAll (shared.js) — страниране на порции по 1000 и .partial при провал.

   PostgREST реже отговора на 1000 реда БЕЗ грешка. kasa_storno за 30 дни са
   2287 (11.10.2026): банерът за разминаване в сторната и таб История (и Excel
   износът от него) виждаха само първите 1000. Мокът по-долу се държи като
   PostgREST: чете limit/offset от URL-а и никога не връща повече от 1000.

   Покрива:
     1. sbGetAll: 1001 → две страници; 999 → една; точно 1000 → втора празна;
        провал на втора страница → partial=true със събраната първа.
     2. Банерът при вход (showLoginBanner): 1001 реда, разминаването е в
        ред 1001 — вижда се; order=id.asc; провал → карта „непълни данни“.
     3. История: клик „Търси →“ с 1001 сторна → всичките 1001 в резултата,
        order с id tiebreaker; провал → червен ред + toast.
     4. Excel износ: клик „📊 Експорт Excel“ → 1001 реда в листа; провал →
        файл НЕ се създава.

   Мутационна проверка (11.10.2026), всеки мутант пуснат срещу този тест:
     - `res.rows.length===1000` → `res.rows.length>1000`  — СЪБОРЕН (21 ❌)
     - махнат offset-ът от URL-а                         — СЪБОРЕН (23 ❌; мокът
       връща все първата страница и спира на 13-ата заявка с 500 → partial)
     - махнат `all.partial=true`                         — СЪБОРЕН (9 ❌)
     - махнато `&order=id.asc` в банера                  — СЪБОРЕН (1 ❌)
     - махнат `,id.desc` от заявката на История          — СЪБОРЕН (1 ❌)
   Неубити мутанти: няма. Базата преди кръга: exit 0.

   Пускане:  node tests/sb-get-all.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, section, report, guard, ticks } = H;

const ADMIN = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис'
};

/* n сторна; разминаване (new_sum < returned_sum) само в ПОСЛЕДНИЯ ред —
   точно този, който PostgREST би отрязал без страниране. */
function notes(n) {
  var out = [];
  for (var i = 0; i < n; i++) {
    out.push({
      id: 'st-' + String(100000 + i), store_name: i === n - 1 ? 'Шумен' : 'Карлово',
      storno_date: '2026-10-01', original_receipt_date: '2026-09-30',
      articles: 'SAP' + i, article_name: 'АРТИКУЛ ' + i,
      returned_sum: 10, replacement_articles: '', replacement_article_name: '',
      new_sum: i === n - 1 ? 3 : 10, reason: 'ГРЕШНА ПОКУПКА', status: 'draft',
      created_by: 'Управител', created_at: '2026-10-01T08:00:00Z',
      kasa_storno_items: []
    });
  }
  return out;
}

/* PostgREST-подобен пейджър. failPage — offset, на който страницата пада с 500.
   Предпазител: над 12 заявки към таблицата — 500 (мутант без offset би
   въртял безкрай). */
function pager(rows, opts) {
  opts = opts || {};
  var st = { urls: [] };
  st.fn = function (url) {
    st.urls.push(url);
    var u = decodeURIComponent(url);
    var lim = /[?&]limit=(\d+)/.exec(u), off = /[?&]offset=(\d+)/.exec(u);
    var limit = Math.min(lim ? +lim[1] : 1000, 1000);
    var offset = off ? +off[1] : 0;
    return rows.slice(offset, offset + limit);
  };
  st.fail = function (url) {
    if (url.indexOf('/kasa_storno?') < 0) return null;
    if (st.urls.length > 12) return { status: 500, body: { message: 'runaway' } };
    var off = /[?&]offset=(\d+)/.exec(decodeURIComponent(url));
    if (opts.failPage != null && off && +off[1] === opts.failPage) return { status: 500, body: { message: 'boom' } };
    return null;
  };
  return st;
}

function env(rows, opts) {
  var p = pager(rows, opts);
  var h = boot({
    modules: ['transport.js', 'client-orders.js', 'kasa.js', 'kasa-docs.js', 'history.js', 'notifications.js'],
    user: ADMIN,
    data: {
      kasa_storno: p.fn, kasa_storno_items: [],
      kasa_reports: [], kasa_zoborot: [], kasa_glavna: [], kasa_documents: [],
      transport_orders: [], client_orders: [], stores: [], loading_lists: []
    },
    fail: { GET: p.fail }
  });
  h.p = p;
  h.stornoGets = function () { return p.urls.filter(function (u) { return u.indexOf('/kasa_storno?') >= 0; }); };
  return h;
}

(async function () {

  section('1. sbGetAll — страници');
  {
    var h = env(notes(1001));
    var res = null;
    h.w.sbGetAll('kasa_storno', 'select=id&order=id.asc').then(function (r) { res = r; });
    await ticks();
    ok('а) 1001 реда → всичките 1001', res && res.length === 1001, 'реално: ' + (res && res.length));
    ok('а) точно две заявки', h.stornoGets().length === 2, 'реално: ' + h.stornoGets().length);
    ok('а) втората е с offset=1000', /offset=1000/.test(h.stornoGets()[1] || ''), h.stornoGets()[1]);
    ok('а) няма .partial', res && !res.partial);
    h.close();

    h = env(notes(999)); res = null;
    h.w.sbGetAll('kasa_storno', 'select=id&order=id.asc').then(function (r) { res = r; });
    await ticks();
    ok('б) 999 реда → една заявка, 999 реда', res && res.length === 999 && h.stornoGets().length === 1,
       'реално: ' + (res && res.length) + ' / ' + h.stornoGets().length + ' заявки');
    h.close();

    h = env(notes(1000)); res = null;
    h.w.sbGetAll('kasa_storno', 'select=id&order=id.asc').then(function (r) { res = r; });
    await ticks();
    ok('в) точно 1000 → втора (празна) страница, 1000 реда', res && res.length === 1000 && h.stornoGets().length === 2,
       'реално: ' + (res && res.length) + ' / ' + h.stornoGets().length + ' заявки');
    h.close();

    h = env(notes(1500), { failPage: 1000 }); res = null;
    h.w.sbGetAll('kasa_storno', 'select=id&order=id.asc').then(function (r) { res = r; });
    await ticks();
    ok('г) провал на втора страница → partial=true', res && res.partial === true);
    ok('г) събраната първа страница е запазена (1000)', res && res.length === 1000, 'реално: ' + (res && res.length));
    h.close();

    h = env(notes(10), { failPage: 0 }); res = null;
    h.w.sbGetAll('kasa_storno', 'select=id&order=id.asc').then(function (r) { res = r; });
    await ticks();
    ok('д) провал на първата → [] с partial=true', res && res.length === 0 && res.partial === true);
    h.close();
  }

  section('2. Банер при вход — разминаването в ред 1001 се вижда');
  {
    var h = env(notes(1001));
    h.w.transportOrders = []; h.w.clientOrders = [];
    guard('showLoginBanner() не хвърля', function () { h.w.showLoginBanner(); });
    await ticks();
    var g = h.stornoGets();
    ok('а) две страници към kasa_storno', g.length === 2, 'реално: ' + g.length);
    ok('а) order=id.asc в заявката', g.length && decodeURIComponent(g[0]).indexOf('order=id.asc') >= 0, g[0]);
    var ban = h.doc.getElementById('notif-banner').textContent;
    ok('а) картата за 1 сторно с по-малка сума е показана', ban.indexOf('1 сторно бележка с по-малка сума') >= 0, ban.slice(0, 300));
    ok('а) обектът от ред 1001 (Шумен) е в картата', ban.indexOf('Шумен (1)') >= 0);
    ok('а) без бележка за непълни данни', ban.indexOf('Непълни данни') < 0);
    var vij = btn(h.doc.getElementById('notif-banner'), 'Виж →');
    ok('а) бутонът „Виж →“ е там', !!vij);
    h.close();

    h = env(notes(1001), { failPage: 1000 });
    h.w.transportOrders = []; h.w.clientOrders = [];
    guard('showLoginBanner() при провал не хвърля', function () { h.w.showLoginBanner(); });
    await ticks();
    ban = h.doc.getElementById('notif-banner').textContent;
    ok('б) провал на втора страница → карта „непълни данни“, не мълчание',
       ban.indexOf('Сторно бележки: непълни данни') >= 0 && ban.indexOf('Прочетени 1000 реда') >= 0, ban.slice(0, 300));
    h.close();

    h = env(notes(1001).slice(0, 1000).map(function (r) { r.new_sum = 2; return r; }), { failPage: 1000 });
    h.w.transportOrders = []; h.w.clientOrders = [];
    h.w.showLoginBanner();
    await ticks();
    ban = h.doc.getElementById('notif-banner').textContent;
    ok('в) има разминаване + провал → картата носи „⚠️ Непълни данни“',
       ban.indexOf('1000 сторно бележки') >= 0 && ban.indexOf('Непълни данни — прочетени 1000 реда') >= 0, ban.slice(0, 300));
    h.close();
  }

  function setPeriod(h) {
    h.doc.getElementById('h-from').value = '2026-09-11';
    h.doc.getElementById('h-to').value   = '2026-10-11';
    h.doc.getElementById('h-type').value = 'storno';
  }
  function fakeXLSX(h) {
    h.cap = { aoas: [], sheets: [], files: [] };
    h.w.XLSX = {
      utils: {
        book_new: function () { return { SheetNames: [], Sheets: {} }; },
        aoa_to_sheet: function (aoa) { h.cap.aoas.push(aoa); return { __aoa: aoa }; },
        book_append_sheet: function (wb, ws, n) { wb.SheetNames.push(n); wb.Sheets[n] = ws; h.cap.sheets.push(n); }
      },
      writeFile: function (wb, fname) { h.cap.files.push({ wb: wb, fname: fname }); }
    };
  }

  section('3. История — клик „Търси →“ с 1001 сторна');
  {
    var h = env(notes(1001));
    h.w.renderHistoryShell();
    setPeriod(h);
    realClick(h.w, btn(h.doc.getElementById('mod-history'), 'Търси →'), 'Търси →');
    await ticks();
    var g = h.stornoGets();
    ok('а) две страници', g.length === 2, 'реално: ' + g.length);
    ok('а) order=storno_date.desc,id.desc', g.length && decodeURIComponent(g[0]).indexOf('order=storno_date.desc,id.desc') >= 0, g[0]);
    ok('а) histData.storno = 1001', h.w.histData.storno.length === 1001, 'реално: ' + h.w.histData.storno.length);
    var res = h.doc.getElementById('h-results').textContent;
    ok('а) „Общо: 1001“ в резултата', res.indexOf('Общо: 1001') >= 0, res.slice(0, 200));
    ok('а) ред 1001 (SAP1000) е рендериран', h.doc.getElementById('h-results').innerHTML.indexOf('SAP1000') >= 0);
    ok('а) без ред „Непълни данни“', res.indexOf('Непълни данни') < 0);

    section('4. Excel износ — клик „📊 Експорт Excel“');
    fakeXLSX(h);
    h.p.urls.length = 0;
    realClick(h.w, btn(h.doc.getElementById('h-results'), 'Експорт Excel'), 'Експорт Excel');
    await ticks();
    g = h.stornoGets();
    ok('4а) две страници', g.length === 2, 'реално: ' + g.length);
    ok('4а) id tiebreaker в order', g.length && decodeURIComponent(g[0]).indexOf('order=storno_date.desc,store_name.asc,id.desc') >= 0, g[0]);
    ok('4а) файлът е създаден', h.cap.files.length === 1);
    var last = h.calls.toast[h.calls.toast.length - 1] || '';
    ok('4а) toast-ът казва 1001 сторно бележки', last.indexOf('1001 сторно бележки') >= 0, last);
    h.close();

    h = env(notes(1001), { failPage: 1000 });
    h.w.renderHistoryShell();
    setPeriod(h);
    realClick(h.w, btn(h.doc.getElementById('mod-history'), 'Търси →'), 'Търси →');
    await ticks();
    res = h.doc.getElementById('h-results').textContent;
    ok('3б) провал → червен ред „Непълни данни“ в резултата',
       res.indexOf('Непълни данни — сторно: прочетени 1000 реда') >= 0, res.slice(0, 200));
    ok('3б) и червен toast', h.calls.toast.some(function (t) { return t.indexOf('Непълни данни') >= 0; }), h.calls.toast.join(' | '));

    fakeXLSX(h);
    realClick(h.w, btn(h.doc.getElementById('h-results'), 'Експорт Excel'), 'Експорт Excel');
    await ticks();
    ok('4б) провал → Excel НЕ се създава', h.cap.files.length === 0, 'файлове: ' + h.cap.files.length);
    last = h.calls.toast[h.calls.toast.length - 1] || '';
    ok('4б) toast „Excel не е създаден“', last.indexOf('Excel не е създаден') >= 0, last);
    h.close();

    h = env(notes(5), { failPage: 0 });
    h.w.renderHistoryShell();
    setPeriod(h);
    realClick(h.w, btn(h.doc.getElementById('mod-history'), 'Търси →'), 'Търси →');
    await ticks();
    res = h.doc.getElementById('h-results').textContent;
    ok('3в) провал на първата → не само „Няма записи“, а и „Непълни данни“',
       res.indexOf('Непълни данни') >= 0 && res.indexOf('Няма записи') >= 0, res.slice(0, 200));
    h.close();
  }

  report();
})();
