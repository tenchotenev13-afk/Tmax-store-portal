/* Товарни листи — редовете над 1000 (лимитът на PostgREST).

   loadLoadingLists() теглеше редовете на ВСИЧКИ листи на склада с една
   sbGet(…&order=position.asc). PostgREST реже на 1000 реда БЕЗ грешка, а при
   този ред отпадат високите позиции на всеки лист. На 27.10.2026 Добрич мина
   1000 реда: листът d1002304… (Добрич → Шумен) показваше позиции 1–35,
   ламперията и рулата (36–43) стояха в базата, но не и на екрана — складът
   ги въведе наново 14 пъти. Същото важи за обектната страна (llLoadStoreSide)
   при глобален профил и за снимките (llLoadPhotos).

   Мокът е малък PostgREST: най-много 1000 реда на отговор, уважава
   limit/offset и order. Без id за tiebreaker редовете с еднаква позиция идват
   в РАЗЛИЧЕН ред за всяка страница — така се държи и истинският (без
   детерминиран ред offset-страниците се припокриват).

   Мутационна проверка: в края на файла (MUTATIONS).

   Пускане:  node tests/loading-limit-1000.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const WH = 'Логистичен склад Добрич';
const WAREHOUSE = { email: 'sklad.dobrich@temax.bg', display_name: 'Склад Добрич',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const GLOBAL = { email: 'acc@temax.bg', display_name: 'Счетоводство',
                 role: 'accounting', store_name: 'Централен офис', assigned_stores: [] };

const TARGET = 'L-target';
const STAMP = '2026-10-27T13:24:00.000Z';

function list(id, date, status) {
  return { id: id, warehouse: WH, list_date: date, status: status || 'sent',
           executed_by: 'Иван', comment: '', created_by: 'Склад Добрич',
           created_at: STAMP, sent_at: STAMP, done_at: null };
}
function row(listId, pos, o) {
  return Object.assign({
    id: listId + '-' + String(pos).padStart(3, '0'), list_id: listId, position: pos,
    kind: 'pallet', pallet_no: pos, pallet_total: 99, purchase_doc: null, clears_doc: null,
    store_name: 'Шумен', warehouse_comment: null, store_comment: null,
    partial: false, received: false, received_by: null, received_at: null,
    missing: false, approval_status: null, created_at: STAMP,
    loading_list_products: []
  }, o || {});
}

/* Целевият лист: позиции 1–35 палети, 36–43 рула (номер 1–8 от 8). */
function targetRows() {
  const out = [];
  for (let p = 1; p <= 43; p++) {
    out.push(p <= 35 ? row(TARGET, p, { pallet_total: 35 })
                     : row(TARGET, p, { kind: 'roll', pallet_no: p - 35, pallet_total: 8 }));
  }
  return out;
}
/* Пълнеж: N листа по perList ниски позиции — те запълват първите 1000 по
   position.asc и изтласкват високите позиции на целевия лист. */
function filler(nLists, perList) {
  const lists = [], rows = [];
  for (let i = 0; i < nLists; i++) {
    const id = 'L-f' + String(i).padStart(2, '0');
    lists.push(list(id, '2026-10-' + String(1 + (i % 26)).padStart(2, '0')));
    for (let p = 1; p <= perList; p++) rows.push(row(id, p, { store_name: i % 2 ? 'Варна' : 'Шумен' }));
  }
  return { lists, rows };
}

/* Детерминиран „случаен" ред между равни позиции — различен за всяка страница. */
function hash(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

function server(rowsAll) {
  const log = [];
  function fn(url) {
    url = decodeURIComponent(String(url));
    log.push(url);
    let rows = rowsAll.slice();
    const inIds = /list_id=in\.\(([^)]*)\)/.exec(url);
    if (inIds) { const s = inIds[1].split(','); rows = rows.filter(r => s.indexOf(r.list_id) >= 0); }
    const off = Number((/[?&]offset=(\d+)/.exec(url) || [])[1] || 0);
    const lim = Math.min(1000, Number((/[?&]limit=(\d+)/.exec(url) || [])[1] || 1000));
    const order = ((/[?&]order=([^&]*)/.exec(url) || [])[1] || '');
    const byId = /(^|,)id\.asc/.test(order);
    rows.sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      if (byId) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      return hash(a.id + '|' + off) - hash(b.id + '|' + off);
    });
    return rows.slice(off, off + lim);
  }
  return { fn, log };
}

let h_photoLog = [];
function env(user, lists, rows, opts) {
  opts = opts || {};
  h_photoLog = [];
  const srv = server(rows);
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'loading.js'],
    user: user,
    fail: opts.failPage2
      ? { GET: { status: 500, body: { message: 'страница 2 падна' },
                 url: u => /loading_list_items/.test(u) && /[?&]offset=[1-9]/.test(u) } }
      : undefined,
    data: {
      loading_list_items: srv.fn,
      loading_lists: function (url) {
        url = decodeURIComponent(String(url));
        let r = lists.slice();
        const ids = /[?&]id=in\.\(([^)]*)\)/.exec(url);
        if (ids) { const s = ids[1].split(','); r = r.filter(x => s.indexOf(x.id) >= 0); }
        const st = /status=in\.\(([^)]*)\)/.exec(url);
        if (st) { const s = st[1].split(','); r = r.filter(x => s.indexOf(x.status) >= 0); }
        return r;
      },
      loading_list_photos: opts.photos ? function (url) {
        url = decodeURIComponent(String(url));
        h_photoLog.push(url);
        const off = Number((/[?&]offset=(\d+)/.exec(url) || [])[1] || 0);
        /* Всички снимки са с един и същ uploaded_at — без id в order редът
           им е различен за всяка страница, както при редовете. */
        const byId = /(^|,)id\.asc/.test(((/[?&]order=([^&]*)/.exec(url) || [])[1] || ''));
        const rows = opts.photos.slice().sort((a, b) => {
          if (a.uploaded_at !== b.uploaded_at) return a.uploaded_at < b.uploaded_at ? -1 : 1;
          if (byId) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
          return hash(a.id + '|' + off) - hash(b.id + '|' + off);
        });
        return rows.slice(off, off + 1000);
      } : [],
      app_settings: [], stores: [], stock_in_transit: []
    }
  });
  h.w.llLists = []; h.w.llItems = []; h.w.llView = 'list';
  h.w.llCurrentId = null; h.w.llStatusFilter = 'open';
  h.w.llStoreItems = []; h.w.llStoreLists = [];
  h.srv = srv;
  return h;
}
async function settle() { for (let i = 0; i < 8; i++) await ticks(); }
const mod = doc => doc.getElementById('mod-loading');
const partialToast = c => c.toast.some(m => /не се заредиха изцяло/.test(m));
const itemGets = h => h.srv.log.filter(u => /loading_list_items/.test(u));

(async function () {
  const f = filler(37, 30);                        /* 1110 + 43 = 1153 реда */
  const LISTS = [list(TARGET, '2026-10-27')].concat(f.lists);
  const ROWS = targetRows().concat(f.rows);

  section('а) Пред-условие: сценарият наистина минава лимита');
  {
    ok('общо редове = 1153', ROWS.length === 1153, ROWS.length);
    const firstPage = server(ROWS).fn('x?order=position.asc,id.asc&limit=1000&offset=0');
    ok('първите 1000 по position НЕ съдържат позиция 36+ на целевия лист',
      !firstPage.some(r => r.list_id === TARGET && r.position > 35));
  }

  section('б) Склад: loadLoadingLists() зарежда всичките 43 реда на листа');
  {
    const h = env(WAREHOUSE, LISTS, ROWS);
    h.w.loadLoadingLists();
    await settle();
    const mine = h.w.llItemsOf(TARGET);
    ok('llItemsOf(лист) = 43 реда', mine.length === 43, mine.length);
    ok('всичките 1153 реда в паметта, без дубликати',
      h.w.llItems.length === 1153 && new Set(h.w.llItems.map(r => r.id)).size === 1153,
      h.w.llItems.length + ' / уникални ' + new Set(h.w.llItems.map(r => r.id)).size);
    ok('рулата (позиции 36–43) са в паметта',
      mine.filter(r => r.kind === 'roll').length === 8);
    const pages = itemGets(h);
    ok('заявките са на страници (offset=0 и offset=1000)',
      pages.some(u => /offset=0(&|$)/.test(u)) && pages.some(u => /offset=1000(&|$)/.test(u)), pages.length);
    ok('order носи id като tiebreaker', pages.every(u => /order=position\.asc,id\.asc/.test(u)), pages[0]);
    ok('без червен toast при пълен отговор', !partialToast(h.calls));

    h.w.llOpenView(TARGET);
    const head = mod(h.doc).textContent;
    ok('„По обекти" брои 8 рула', /8 рула/.test(head), (head.match(/По обекти[^)]*\)/) || [''])[0]);
    const sumTbl = h.doc.getElementById('ll-summary');
    const shumen = sumTbl && Array.from(sumTbl.querySelectorAll('tr')).find(tr => /Шумен/.test(tr.textContent));
    ok('колоната „Рула" на Шумен = 8', !!shumen && shumen.children[3].textContent.trim() === '8',
      shumen && shumen.textContent);
    ok('колоната „Палети" на Шумен = 35', !!shumen && shumen.children[1].textContent.trim() === '35',
      shumen && shumen.textContent);
  }

  section('в) Граничен случай: точно 1000 реда → втора заявка, нищо не се губи');
  {
    const g = filler(32, 30);                      /* 960 + 40 = 1000 */
    const rows = [];
    for (let p = 1; p <= 40; p++) rows.push(row(TARGET, p));
    const all = rows.concat(g.rows);
    const h = env(WAREHOUSE, [list(TARGET, '2026-10-27')].concat(g.lists), all);
    h.w.loadLoadingLists();
    await settle();
    ok('общо точно 1000', all.length === 1000);
    ok('направена е втора заявка (offset=1000)', itemGets(h).length === 2, itemGets(h).length);
    ok('в паметта са 1000 реда', h.w.llItems.length === 1000, h.w.llItems.length);
    ok('целевият лист — 40', h.w.llItemsOf(TARGET).length === 40);
    ok('без toast', !partialToast(h.calls));
  }

  section('г) 999 реда → една заявка (гранично отдолу)');
  {
    const g = filler(32, 30);
    const all = targetRows().slice(0, 39).concat(g.rows);  /* 39 + 960 */
    const h = env(WAREHOUSE, [list(TARGET, '2026-10-27')].concat(g.lists), all);
    h.w.loadLoadingLists();
    await settle();
    ok('общо 999', all.length === 999);
    ok('една заявка', itemGets(h).length === 1, itemGets(h).length);
    ok('999 в паметта', h.w.llItems.length === 999, h.w.llItems.length);
  }

  section('д) Обектна страна (глобален профил): llLoadStoreSide() — всички 43');
  {
    const h = env(GLOBAL, LISTS, ROWS);
    ok('профилът е глобален — без store филтър', h.w.storeQ() === '');
    ok('и не е складов (обектна страна)', h.w.llCanEdit() === false);
    h.w.llLoadStoreSide();
    await settle();
    const mine = h.w.llStoreItemsOf(TARGET);
    ok('llStoreItemsOf(лист) = 43', mine.length === 43, mine.length);
    ok('рулата са там', mine.filter(r => r.kind === 'roll').length === 8);
    ok('всичките 1153, без дубликати',
      h.w.llStoreItems.length === 1153 && new Set(h.w.llStoreItems.map(r => r.id)).size === 1153,
      h.w.llStoreItems.length + ' / уникални ' + new Set(h.w.llStoreItems.map(r => r.id)).size);
    const pages = itemGets(h);
    ok('order носи id', pages.length === 2 && pages.every(u => /order=position\.asc,id\.asc/.test(u)), pages[0]);
    ok('без toast', !partialToast(h.calls));
  }

  section('е) Склад: страница 2 пада → червен toast, не тихо отрязване');
  {
    const h = env(WAREHOUSE, LISTS, ROWS, { failPage2: true });
    h.w.loadLoadingLists();
    await settle();
    ok('червеният toast е показан', partialToast(h.calls), JSON.stringify(h.calls.toast));
    ok('първата страница пак е в паметта (1000)', h.w.llItems.length === 1000, h.w.llItems.length);
  }

  section('ж) Обектна страна: страница 2 пада → същият toast');
  {
    const h = env(GLOBAL, LISTS, ROWS, { failPage2: true });
    h.w.llLoadStoreSide();
    await settle();
    ok('червеният toast е показан', partialToast(h.calls), JSON.stringify(h.calls.toast));
  }

  section('з) Снимките: над 1000 → всички (llLoadPhotos през sbGetAll)');
  {
    const photos = [];
    for (let i = 0; i < 1150; i++) photos.push({ id: 'p' + String(i).padStart(4, '0'),
      list_id: i < 1100 ? 'L-f' + String(i % 37).padStart(2, '0') : TARGET,
      stage: 'load', store_name: 'Шумен', uploaded_at: STAMP });
    const h = env(WAREHOUSE, LISTS, ROWS, { photos: photos });
    h.w.loadLoadingLists();
    await settle();
    const got = Object.keys(h.w.llPhotos).reduce((n, k) => n + h.w.llPhotos[k].length, 0);
    ok('всичките 1150 снимки са в паметта', got === 1150, got);
    const ids = [].concat.apply([], Object.keys(h.w.llPhotos).map(k => h.w.llPhotos[k].map(p => p.id)));
    ok('снимките са без дубликати (страниците не се припокриват)', new Set(ids).size === 1150,
      'уникални ' + new Set(ids).size);
    ok('снимките на целевия лист (последните 50) са там', (h.w.llPhotos[TARGET] || []).length === 50);
    ok('order на снимките носи id', h_photoLog.length === 2 && h_photoLog.every(u => /order=uploaded_at\.asc,id\.asc/.test(u)), h_photoLog[0]);
  }

  report();
})();

/* MUTATIONS — пуснати ръчно върху loading.js на 30.10.2026, всяка пада:
   M1 sbGetAll → sbGet в loadLoadingLists()   → (б): 26 вместо 43 реда, 0 рула
   M2 sbGetAll → sbGet в llLoadStoreSide()    → (д) и (ж)
   M3 махнат id.asc от order (редовете)       → (б), (д): 44 реда, 10 дубликата
   M4 toast-ът в llWarnPartial() изключен     → (е), (ж)
   M5 sbGetAll → sbGet в llLoadPhotos()       → (з)
   M6 махнат id.asc от order на снимките      → (з): дубликати и по URL-а
   Няма мутация, която да остане незабелязана. */
