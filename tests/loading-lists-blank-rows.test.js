/* Товарни листи — новият лист тръгва с 10 празни реда.

   Складът пише лист от десет реда на хартия. Празният редактор го караше да
   натиска „➕ Ред без документ" десет пъти, преди да започне.

   Тихите грешки, които се пазят тук:
     · празните редове стигат до базата — лист с 10 реда „без обект";
     · редът, който човекът Е започнал (сложил документ или артикули) без да
       избере обект, се пропуска ТИХО заедно с празните — тогава стоката
       изчезва от листа без никой да разбере;
     · селектът за обект показва първия по азбучен ред и мълчаливо приписва
       получател на недокоснат ред;
     · СЪЩЕСТВУВАЩА чернова се допълва до 10 — човек оставил три реда ги
       намира тринайсет.

   Пускане:  node tests/loading-lists-blank-rows.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const NEW_ID = 'list-new-1';

const L_DRAFT = { id: 'L9', warehouse: WH, list_date: '2026-09-23', status: 'draft',
                  executed_by: 'Иван', comment: '', created_at: 'x', sent_at: null, done_at: null };
const OLD_ITEMS = [
  { id: 'I1', list_id: 'L9', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 1,
    purchase_doc: 'ИЗХ-1', clears_doc: null, store_name: 'Петрич', warehouse_comment: null,
    store_comment: null, partial: false, received: false, missing: false, created_at: 'x' }
];

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js', 'loading.js'],
    user: WAREHOUSE, confirm: true,
    data: {
      loading_lists: opts.lists || [],
      loading_list_items: () => (opts.items || []).map(r => Object.assign({}, r, { loading_list_products: [] })),
      users: [{ store_name: 'Гоце Делчев' }, { store_name: 'Петрич' }, { store_name: WH }],
      loading_list_products: [], stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: [], goods_transit: []
    }
  });
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
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: m, col: c }); return orig(m, c); };
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
const itemPosts = h => h.calls.post.filter(p => /loading_list_items/.test(p.url));

(async function () {

  section('а) Нов лист — десет празни реда, всеки без обект');
  {
    const h = env();
    h.w.llNewList();
    await ticks(); await ticks();
    ok('десет реда', h.w.llDraft.items.length === 10, String(h.w.llDraft.items.length));
    ok('всички са палети', h.w.llDraft.items.every(i => i.kind === 'pallet'));
    ok('без обект', h.w.llDraft.items.every(i => i.store_name === ''),
      JSON.stringify(h.w.llDraft.items.map(i => i.store_name)));
    ok('без документ и без артикули',
      h.w.llDraft.items.every(i => !i.purchase_doc && i.products && i.products.length === 0));
    ok('и всички се броят за празни',
      h.w.llDraft.items.every(i => h.w.llBlankRow(i) === true));
    ok('заглавието показва 10', /Редове \(10\)/.test(mod(h).textContent), mod(h).textContent.slice(0, 200));

    /* Селектът трябва да ПИТА, не да приписва. */
    const sel = mod(h).querySelector('select[onchange*="store_name"]');
    if (ok('селект за обект', !!sel)) {
      ok('избраното е празно', sel.value === '', JSON.stringify(sel.value));
      ok('и пише „избери обект"', /избери обект/.test(sel.textContent), sel.textContent.slice(0, 60));
    }
    /* „➕ Ред без документ" добавя ЕДИН и също празен. */
    realClick(h.w, btn(mod(h), 'Ред без документ'));
    ok('единадесет реда', h.w.llDraft.items.length === 11, String(h.w.llDraft.items.length));
    ok('новият също е без обект', h.w.llDraft.items[10].store_name === '');
  }

  section('б) Съществуваща чернова НЕ се допълва');
  {
    const h = env({ lists: [L_DRAFT], items: OLD_ITEMS });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenEdit('L9');
    await ticks(); await ticks();
    ok('един ред си остава един', h.w.llDraft.items.length === 1, String(h.w.llDraft.items.length));
    ok('и е старият', h.w.llDraft.items[0].purchase_doc === 'ИЗХ-1');
  }

  section('в) Запис: десет празни + един попълнен → ЕДИН ред в базата');
  {
    const h = env();
    h.w.llNewList();
    await ticks(); await ticks();
    h.w.llDraft.items[3].store_name = 'Петрич';
    h.w.llDraft.items[3].purchase_doc = 'ИЗХ-77';
    h.w.llSaveDraft();
    for (let k = 0; k < 8; k++) await ticks();

    const posts = itemPosts(h);
    if (ok('един POST за редовете', posts.length === 1, JSON.stringify(h.calls.post.map(p => p.table)))) {
      const rows = posts[0].body;
      ok('точно ЕДИН ред', rows.length === 1, JSON.stringify(rows));
      ok('и това е попълненият', rows[0].purchase_doc === 'ИЗХ-77' && rows[0].store_name === 'Петрич',
        JSON.stringify(rows[0]));
      ok('позицията му е 1, не 4', rows[0].position === 1, String(rows[0].position));
    }
    ok('нищо не е казано за пропуснатите — не са грешка',
      !h.toasts.some(t => /ред/.test(t.msg) && t.col === '#dc2626'), JSON.stringify(h.toasts));
    ok('записът е довършен', h.w.llView === 'list', h.w.llView);
  }

  section('г) Ред с документ, но БЕЗ обект — това Е грешка, не празен ред');
  {
    const h = env();
    h.w.llNewList();
    await ticks(); await ticks();
    h.w.llDraft.items[0].purchase_doc = 'ИЗХ-88';   /* започнат, но без обект */
    h.w.llSaveDraft();
    await ticks(); await ticks();
    ok('нищо не е записано', itemPosts(h).length === 0 && !h.calls.post.some(p => p.table === 'loading_lists'),
      JSON.stringify(h.calls.post.map(p => p.table)));
    ok('червено съобщение защо',
      h.toasts.some(t => /без обект получател/.test(t.msg) && t.col === '#dc2626'), JSON.stringify(h.toasts));
    ok('редът НЕ е изхвърлен тихо',
      h.w.llDraft.items.some(i => i.purchase_doc === 'ИЗХ-88'),
      JSON.stringify(h.w.llDraft.items.map(i => i.purchase_doc)));
    ok('а празните до него са махнати', h.w.llDraft.items.length === 1, String(h.w.llDraft.items.length));
  }

  section('г2) Ред с АРТИКУЛИ, но без обект — също грешка');
  {
    const h = env();
    h.w.llNewList();
    await ticks(); await ticks();
    h.w.llDraft.items[2].products.push({ sap_code: 'X1', product_name: 'НЕЩО', unit: 'бр.', qty: 2, cartons: null });
    h.w.llSaveDraft();
    await ticks(); await ticks();
    ok('не се записва', itemPosts(h).length === 0);
    ok('и се казва', h.toasts.some(t => /без обект получател/.test(t.msg)), JSON.stringify(h.toasts));
    ok('редът с артикулите остава', h.w.llDraft.items.length === 1 &&
      h.w.llDraft.items[0].products.length === 1, String(h.w.llDraft.items.length));
  }

  section('д) Само празни редове — казва се, нищо не се записва');
  {
    const h = env();
    h.w.llNewList();
    await ticks(); await ticks();
    h.w.llSaveDraft();
    await ticks(); await ticks();
    ok('нула записи', h.calls.post.length === 0, JSON.stringify(h.calls.post.map(p => p.table)));
    ok('„Добави поне един ред"', h.toasts.some(t => /Добави поне един ред/.test(t.msg)), JSON.stringify(h.toasts));
    ok('редакторът остава отворен', h.w.llView === 'edit', h.w.llView);
    ok('и вече е празен — празните са махнати', h.w.llDraft.items.length === 0,
      String(h.w.llDraft.items.length));
  }

  section('е) Празен ред с коментар пак е празен');
  {
    /* Коментарът сам по себе си не прави реда „започнат": без обект той и
       без друго не може да се запише. */
    const h = env();
    h.w.llNewList();
    await ticks(); await ticks();
    h.w.llDraft.items[0].warehouse_comment = 'нещо си';
    h.w.llDraft.items[5].store_name = 'Петрич';
    h.w.llSaveDraft();
    for (let k = 0; k < 8; k++) await ticks();
    const posts = itemPosts(h);
    ok('записан е само редът с обект', posts.length === 1 && posts[0].body.length === 1,
      JSON.stringify(posts[0] && posts[0].body));
    ok('и това е Петрич', posts[0].body[0].store_name === 'Петрич');
  }

  report();
})();
