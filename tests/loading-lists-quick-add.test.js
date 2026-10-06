/* Товарни листи: „⚡ Бързо добавяне" по обект, 30 реда, Преглед след запис.

   „Монтана: 5 палета, 1 руло, 2 насипа" е една операция. Лентата добавя
   единици БЕЗ документи и със зададен обект, като първо запълва недокоснатите
   празни единици (иначе остават отдолу), и чак после добавя нови. Вече
   попълненото не се пипа — лентата се ползва пак за друг град. След запис се
   отваря Прегледът на същия лист.

   Пускане:  node tests/loading-lists-quick-add.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, fire, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const NEW_ID = 'list-new-1';
const MODULES = ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js', 'loading.js'];

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: MODULES, user: WAREHOUSE, confirm: true, fail: opts.fail,
    data: {
      app_settings: [], goods_transit: [],
      loading_lists: [], loading_list_items: [], loading_list_products: [], loading_list_photos: [],
      users: [{ store_name: 'Монтана' }, { store_name: 'Кърджали' }, { store_name: 'Петрич' }, { store_name: WH }],
      stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  if (!opts.noWrap) {
    /* sbPostReturn иска създадения ред обратно — иначе листът е без id. */
    const inner = h.w.fetch;
    h.w.fetch = function (url, init) {
      const m = ((init || {}).method || 'GET').toUpperCase();
      if (m === 'POST' && /\/rest\/v1\/loading_lists(\?|$)/.test(String(url))) {
        return inner(url, init).then(function () {
          let body = {}; try { body = JSON.parse(init.body); } catch (e) {}
          const row = Object.assign({ id: NEW_ID }, Array.isArray(body) ? body[0] : body);
          return { ok: true, status: 201, json: () => Promise.resolve([row]),
                   text: () => Promise.resolve(JSON.stringify([row])), headers: { get: () => null } };
        });
      }
      return inner(url, init);
    };
  }
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: m, col: c }); return orig(m, c); };
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
const $ = (h, id) => h.doc.getElementById(id);
const itemPosts = h => h.calls.post.filter(p => p.table === 'loading_list_items');
const filled = h => h.w.llDraft.units.filter(u => !h.w.llBlankRow(u));
async function newList(h) {
  h.w.llNewList();
  await ticks(); await ticks();
}
/* Като човек: избира обект, пише числата, натиска „➕ Добави". */
function quickAdd(h, store, pal, rol, bulk) {
  const sel = $(h, 'll-qa-store');
  sel.value = store; fire(h.w, sel, 'change');
  [['ll-qa-pallet', pal], ['ll-qa-roll', rol], ['ll-qa-bulk', bulk]].forEach(p => {
    const el = $(h, p[0]); el.value = String(p[1]); fire(h.w, el, 'input');
  });
  realClick(h.w, btn(mod(h), '➕ Добави'));
}
const nosOf = (h, store, kind) => h.w.llDraft.units.filter(u => u.store_name === store && u.kind === kind).map(u => u.pallet_no);

(async function () {

  section('1. Нов лист — 30 празни единици');
  {
    const h = env();
    await newList(h);
    ok('30 единици', h.w.llDraft.units.length === 30, String(h.w.llDraft.units.length));
    ok('всички са недокоснати (llBlankRow)', h.w.llDraft.units.every(u => h.w.llBlankRow(u)));
    ok('LL_NEW_ROWS = 30', h.w.LL_NEW_ROWS === 30);
    ok('лентата „⚡ Бързо добавяне" е в редактора, ПРЕДИ „📦 Редове"',
      !!mod(h).querySelector('[data-ll-quick]') &&
      (mod(h).querySelector('[data-ll-quick]').compareDocumentPosition(
        Array.from(mod(h).querySelectorAll('div')).find(d => /^📦 Редове/.test(d.textContent.trim()) && d.children.length === 0)) & 4) === 4);
    ok('по подразбиране: палети 1, рула 0, насип 0',
      $(h, 'll-qa-pallet').value === '1' && $(h, 'll-qa-roll').value === '0' && $(h, 'll-qa-bulk').value === '0');
    ok('числата са <input type=number min=0 max=60>',
      ['ll-qa-pallet', 'll-qa-roll', 'll-qa-bulk'].every(id => $(h, id).type === 'number' && $(h, id).min === '0' && $(h, id).max === '60'));
    ok('списъкът с обекти е от llStoreOptions (с „— избери обект —")',
      /избери обект/.test($(h, 'll-qa-store').textContent) && /Монтана/.test($(h, 'll-qa-store').textContent));
  }

  section('2. Монтана 5/1/2 — първите 8 празни се запълват, общо остават 30');
  {
    const h = env();
    await newList(h);
    quickAdd(h, 'Монтана', 5, 1, 2);
    await ticks();
    ok('общо пак 30 единици', h.w.llDraft.units.length === 30, String(h.w.llDraft.units.length));
    ok('запълнени са точно първите 8', filled(h).length === 8 && h.w.llDraft.units.slice(0, 8).every(u => !h.w.llBlankRow(u)) &&
      h.w.llDraft.units.slice(8).every(u => h.w.llBlankRow(u)));
    ok('палетите на Монтана са 1…5', nosOf(h, 'Монтана', 'pallet').join() === '1,2,3,4,5', nosOf(h, 'Монтана', 'pallet').join());
    ok('рулото е „руло 1“', nosOf(h, 'Монтана', 'roll').join() === '1');
    ok('насипът е 2 реда без номер', nosOf(h, 'Монтана', 'bulk').length === 2 && nosOf(h, 'Монтана', 'bulk').every(n => n === null));
    ok('редът е палети, руло, насип (по ред на екрана)',
      h.w.llDraft.units.slice(0, 8).map(u => u.kind).join() === 'pallet,pallet,pallet,pallet,pallet,roll,bulk,bulk',
      h.w.llDraft.units.slice(0, 8).map(u => u.kind).join());
    ok('без документи', filled(h).every(u => u.docs.length === 0));
    ok('toast „Добавени 8 реда за Монтана“', h.toasts.some(t => t.msg === 'Добавени 8 реда за Монтана'), JSON.stringify(h.toasts.map(t => t.msg)));
    ok('обектът остава избран, числата се връщат на 1/0/0',
      $(h, 'll-qa-store').value === 'Монтана' && $(h, 'll-qa-pallet').value === '1' &&
      $(h, 'll-qa-roll').value === '0' && $(h, 'll-qa-bulk').value === '0',
      [$(h, 'll-qa-store').value, $(h, 'll-qa-pallet').value, $(h, 'll-qa-roll').value, $(h, 'll-qa-bulk').value].join());
    ok('заглавието „Редове (30)“', /Редове \(30\)/.test(mod(h).textContent));

    /* 3. Втори път — друг град; вече попълненото не се пипа. */
    const before = JSON.stringify(h.w.llDraft.units.slice(0, 8).map(u => [u.kind, u.store_name, u.pallet_no]));
    quickAdd(h, 'Кърджали', 3, 0, 0);
    await ticks();
    ok('пак 30; запълнени 11', h.w.llDraft.units.length === 30 && filled(h).length === 11, filled(h).length + '/' + h.w.llDraft.units.length);
    ok('Кърджали: палети 1…3', nosOf(h, 'Кърджали', 'pallet').join() === '1,2,3');
    ok('Монтана остава 1…5, руло 1, насип 2', nosOf(h, 'Монтана', 'pallet').join() === '1,2,3,4,5' &&
      nosOf(h, 'Монтана', 'roll').join() === '1' && nosOf(h, 'Монтана', 'bulk').length === 2);
    ok('първите 8 не са пипани', JSON.stringify(h.w.llDraft.units.slice(0, 8).map(u => [u.kind, u.store_name, u.pallet_no])) === before);
    ok('Кърджали е на местата 9–11 (запълнени поред)', h.w.llDraft.units.slice(8, 11).every(u => u.store_name === 'Кърджали'));

    /* 4. Запис: 30 единици, 11 попълнени → точно 11 реда в POST-а. */
    realClick(h.w, btn(mod(h), 'Запази черновата'));
    await ticks(); await ticks(); await ticks(); await ticks();
    const posts = itemPosts(h);
    const rows = posts.length ? posts[0].body : [];
    ok('в POST-а има точно 11 реда', posts.length === 1 && rows.length === 11, JSON.stringify(rows.length));
    ok('нито един празен (всички са с обект)', rows.every(r => r.store_name === 'Монтана' || r.store_name === 'Кърджали'));
    const pal = rows.filter(r => r.store_name === 'Монтана' && r.kind === 'pallet');
    ok('палетите на Монтана: 1…5 от 5', pal.map(r => r.pallet_no + '/' + r.pallet_total).join() === '1/5,2/5,3/5,4/5,5/5', pal.map(r => r.pallet_no + '/' + r.pallet_total).join());
    const kj = rows.filter(r => r.store_name === 'Кърджали');
    ok('Кърджали: 1…3 от 3', kj.map(r => r.pallet_no + '/' + r.pallet_total).join() === '1/3,2/3,3/3');
    ok('насипът — без номер', rows.filter(r => r.kind === 'bulk').every(r => r.pallet_no === null && r.pallet_total === null));
    ok('след успешен запис — Преглед на същия лист', h.w.llView === 'view' && h.w.llCurrentId === NEW_ID, h.w.llView + ' / ' + h.w.llCurrentId);
    ok('toast „✅ Черновата е записана“ остава', h.toasts.some(t => /Черновата е записана/.test(t.msg)));
  }

  section('5. Над 30 — при 0 празни единици броят расте');
  {
    const h = env();
    await newList(h);
    h.w.llDraft.units.forEach(u => { u.store_name = 'Петрич'; });
    h.w.renderLoadingLists();
    ok('няма празни', h.w.llDraft.units.every(u => !h.w.llBlankRow(u)));
    quickAdd(h, 'Монтана', 2, 1, 0);
    await ticks();
    ok('30 → 33 (над 30, без ограничение)', h.w.llDraft.units.length === 33, String(h.w.llDraft.units.length));
    ok('новите са в края', h.w.llDraft.units.slice(30).map(u => u.kind + ':' + u.store_name).join() === 'pallet:Монтана,pallet:Монтана,roll:Монтана');
    realClick(h.w, btn(mod(h), 'Добави нов ред'));
    ok('„➕ Добави нов ред“ също добавя над 30', h.w.llDraft.units.length === 34);
    ok('и продължава да дава ред БЕЗ обект', h.w.llDraft.units[33].store_name === '');
  }

  section('6. Без обект → toast и нищо; нула числа → нищо');
  {
    const h = env();
    await newList(h);
    const snap = JSON.stringify(h.w.llDraft.units.map(u => [u.kind, u.store_name, u.pallet_no]));
    quickAdd(h, '', 5, 1, 2);
    ok('toast „Избери обект“', h.toasts.some(t => t.msg === 'Избери обект' && t.col === '#dc2626'), JSON.stringify(h.toasts.map(t => t.msg)));
    ok('брой и съдържание непроменени', h.w.llDraft.units.length === 30 &&
      JSON.stringify(h.w.llDraft.units.map(u => [u.kind, u.store_name, u.pallet_no])) === snap);
    h.toasts.length = 0;
    quickAdd(h, 'Монтана', 0, 0, 0);
    ok('обект, но всички нули → нищо не се добавя', filled(h).length === 0 && h.toasts.some(t => /поне един/.test(t.msg)), JSON.stringify(h.toasts.map(t => t.msg)));
    /* Таван 60 и боклук. */
    h.w.llQuickSet('pallet', '999'); h.w.llQuickSet('roll', 'abc'); h.w.llQuickSet('bulk', '-4');
    ok('999 → 60; „abc“ и -4 → 0', h.w.llQuick.pallet === 60 && h.w.llQuick.roll === 0 && h.w.llQuick.bulk === 0, JSON.stringify(h.w.llQuick));
  }

  section('7. Грешка при запис — остава в редактора');
  {
    const h = env({ fail: { POST: /loading_lists/ }, noWrap: true });
    await newList(h);
    quickAdd(h, 'Монтана', 2, 0, 0);
    await ticks();
    realClick(h.w, btn(mod(h), 'Запази черновата'));
    await ticks(); await ticks(); await ticks();
    ok('при грешка от sb → llView остава „edit“', h.w.llView === 'edit', h.w.llView);
    /* Недокоснатите отпадат от черновата ПРИ запис (llSaveDraft смалява на място) — в редактора остава точно онова, което се записва. */
    ok('черновата остава в редактора с двете попълнени единици', h.w.llDraft && h.w.llDraft.units.length === 2 && filled(h).length === 2);
    ok('червен toast', h.toasts.some(t => t.col === '#dc2626' && /Грешка при запис/.test(t.msg)), JSON.stringify(h.toasts.map(t => t.msg)));
  }

  report();
})();
