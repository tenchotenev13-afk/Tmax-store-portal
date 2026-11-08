/* Товарни листи — колоната „Обекти" в списъка показва ИМЕНАТА на обектите,
   не само броя (искане на Теодор, 06.11.2026).

   Пази:
     · до 3 обекта — имената със запетая; над 3 — първите 3 + „+N";
       пълният списък — в title на клетката;
     · обект на няколко реда — веднъж, в реда на първата поява по position;
     · отхвърленият извънреден ред не се показва (СЪЩИЯТ набор като
       llCounts() — llLiveRows), иначе броят в отворения лист и имената в
       списъка се разминават;
     · празна чернова — „—";
     · име с кавичка / < минава през esc()/escAttr();
     · търсенето по обект продължава да работи;
     · рендирането е реалното — loadLoadingLists() → таблицата на екрана,
       и за склада, и за офис акаунт.

   Мутационна проверка (06.11.2026, всеки вариант пуснат срещу този тест):
     M1 llLiveRows(items) → (items||[])       в llStoreNames — ПАДА (е, отхвърлен)
     M2 без проверката !seen[...]             в llStoreNames — ПАДА (г, дублиран)
     M3 .map(esc) → без esc                   в llStoreNamesCell — ПАДА (ж)
     M4 escAttr(...) в title → без escAttr    в llStoreNamesCell — ПАДА (ж)
     M5 slice(0,3) → slice(0,5)               в llStoreNamesCell — ПАДА (в)
     M6 без .sort(llByPosition)               в llStoreNames — ПАДА (г, ред)
        (в първия кръг оцеля: данните на DUP даваха същия ред и без
        сортиране — поправени, после пак пуснат и падна)
   Баселайн преди кръга: exit 0, 40/40.

   Пускане:  node tests/ll-store-names.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, fire, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const ADMIN = { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис', assigned_stores: [] };

const L = (id, status) => ({ id: id, warehouse: WH, list_date: '2026-11-05',
  status: status, executed_by: 'Иван', comment: '', created_at: '2026-11-05T06:00:00.000Z',
  sent_at: status === 'draft' ? null : '2026-11-05T07:00:00.000Z', done_at: null });
let seq = 0;
const IT = (list, pos, store, extra) => Object.assign({ id: 'i' + (++seq), list_id: list, position: pos,
  kind: 'pallet', pallet_no: pos, pallet_total: 1, purchase_doc: '46000' + seq, clears_doc: null,
  store_name: store, warehouse_comment: null, store_comment: null, partial: false, received: false,
  missing: false, missing_by: null, missing_at: null, created_at: 'x' }, extra || {});

const NASTY = 'Обект "Х" <b>';
const LISTS = [L('ONE', 'sent'), L('THREE', 'sent'), L('FIVE', 'sent'), L('DUP', 'sent'),
               L('REJ', 'sent'), L('EMPTY', 'draft'), L('ESC', 'sent')];
const ITEMS = [
  IT('ONE', 1, 'Петрич'),
  IT('THREE', 1, 'Петрич'), IT('THREE', 2, 'Гоце Делчев'), IT('THREE', 3, 'Сандански'),
  IT('FIVE', 1, 'Варна'), IT('FIVE', 2, 'Бургас'), IT('FIVE', 3, 'Русе'),
  IT('FIVE', 4, 'Шумен'), IT('FIVE', 5, 'Добрич'),
  /* Подадени разбъркано: редът трябва да е по position. Шумен е на 3 реда. */
  /* Без сортиране подаденият ред дава „Варна, Шумен" — мутантът M6 се хваща. */
  IT('DUP', 3, 'Варна'), IT('DUP', 1, 'Шумен'), IT('DUP', 2, 'Варна'), IT('DUP', 4, 'Шумен'),
  /* Варна е само на отхвърлен извънреден ред — не съществува за листа. */
  IT('REJ', 1, 'Русе'), IT('REJ', 2, 'Варна', { approval_status: 'rejected' }),
  IT('ESC', 1, NASTY)
];

function env(user) {
  return boot({
    modules: ['transport.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js', 'loading.js'],
    user: user, confirm: true,
    data: {
      loading_lists: function (url) {
        let r = LISTS.map(x => Object.assign({}, x));
        const m = /warehouse=eq\.([^&]*)/.exec(url);
        if (m) r = r.filter(x => x.warehouse === decodeURIComponent(m[1]));
        const st = /status=in\.\(([^)]*)\)/.exec(url);
        if (st) { const s = st[1].split(','); r = r.filter(x => s.indexOf(x.status) >= 0); }
        return r;
      },
      loading_list_items: function (url) {
        let r = ITEMS.map(x => Object.assign({}, x, { loading_list_products: [] }));
        const lm = /list_id=in\.\(([^)]*)\)/.exec(url);
        if (lm) { const s = lm[1].split(','); r = r.filter(x => s.indexOf(String(x.list_id)) >= 0); }
        return r;
      },
      users: [{ store_name: 'Петрич' }, { store_name: WH }],
      loading_list_products: [], stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: [], goods_transit: []
    }
  });
}
const mod = h => h.doc.getElementById('mod-loading');
/* Клетката „Обекти" на реда на даден лист — намира се по бутона „👁 Преглед". */
function cell(h, id) {
  const b = mod(h).querySelector('button[data-id="' + id + '"][onclick^="llOpenView"]');
  if (!b) return null;
  const tds = b.closest('tr').querySelectorAll('td');
  return tds[2];
}
const txt = c => c ? c.textContent.replace(/\s+/g, ' ').trim() : '(няма клетка)';

async function open(user) {
  const h = env(user);
  h.w.loadLoadingLists();
  await ticks(); await ticks();
  /* Офисът първо избира изпращач от падащото меню — като човек. */
  const sel = h.doc.getElementById('ll-wh');
  if (!cell(h, 'ONE') && sel) {
    sel.value = WH; fire(h.w, sel, 'change'); await ticks(); await ticks();
  }
  h.w.llSetStatusFilter('all');
  await ticks();
  return h;
}

(async function () {
  for (const who of [['склад', WAREHOUSE], ['офис (admin)', ADMIN]]) {
    const h = await open(who[1]);
    section('а) ' + who[0] + ': таблицата е на екрана');
    ok('заглавието „Обекти" е трета колона',
      (mod(h).querySelectorAll('thead th')[2] || {}).textContent === 'Обекти');
    ok('редът на всеки лист е тук', LISTS.every(l => !!cell(h, l.id)),
      LISTS.filter(l => !cell(h, l.id)).map(l => l.id).join(','));
    if (!cell(h, 'ONE')) { console.log(mod(h).innerHTML.slice(0, 600)); continue; }

    section('б) ' + who[0] + ': 1 и 3 обекта — имената, без „+"');
    ok('1 обект', txt(cell(h, 'ONE')) === 'Петрич', txt(cell(h, 'ONE')));
    ok('3 обекта — и трите, със запетая',
      txt(cell(h, 'THREE')) === 'Петрич, Гоце Делчев, Сандански', txt(cell(h, 'THREE')));
    ok('подравняване вляво', /text-align:\s*left/.test(cell(h, 'THREE').getAttribute('style')),
      cell(h, 'THREE').getAttribute('style'));

    section('в) ' + who[0] + ': 5 обекта — първите 3 + „+2", title с всичките');
    ok('първите 3 + „+2"', txt(cell(h, 'FIVE')) === 'Варна, Бургас, Русе +2', txt(cell(h, 'FIVE')));
    ok('title — и петте', cell(h, 'FIVE').getAttribute('title') === 'Варна, Бургас, Русе, Шумен, Добрич',
      cell(h, 'FIVE').getAttribute('title'));
    ok('Шумен/Добрич не се показват в текста', !/Шумен|Добрич/.test(txt(cell(h, 'FIVE'))));

    section('г) ' + who[0] + ': обект на няколко реда — веднъж, по position');
    ok('Шумен веднъж, после Варна', txt(cell(h, 'DUP')) === 'Шумен, Варна', txt(cell(h, 'DUP')));

    section('д) ' + who[0] + ': празна чернова — „—"');
    ok('„—"', txt(cell(h, 'EMPTY')) === '—', txt(cell(h, 'EMPTY')));
    ok('без title', !cell(h, 'EMPTY').hasAttribute('title'));

    section('е) ' + who[0] + ': отхвърленият извънреден ред не се брои');
    ok('само Русе', txt(cell(h, 'REJ')) === 'Русе', txt(cell(h, 'REJ')));
    ok('и в title', cell(h, 'REJ').getAttribute('title') === 'Русе', cell(h, 'REJ').getAttribute('title'));
    ok('броят от llCounts съвпада с имената',
      h.w.llCounts(h.w.llItemsOf('REJ')).stores === h.w.llStoreNames(h.w.llItemsOf('REJ')).length);

    section('ж) ' + who[0] + ': escaping');
    const c = cell(h, 'ESC');
    ok('текстът е буквалното име', txt(c) === NASTY, txt(c));
    ok('няма инжектиран <b>', !c.querySelector('b'), c.innerHTML);
    ok('title е буквалното име (кавичката не къса атрибута)', c.getAttribute('title') === NASTY,
      c.getAttribute('title'));

    section('з) ' + who[0] + ': търсенето по обект работи');
    const q = h.doc.getElementById('ll-list-q');
    q.value = 'сандански'; fire(h.w, q, 'input');
    ok('само THREE', h.w.llVisibleLists().map(x => x.id).join(',') === 'THREE',
      JSON.stringify(h.w.llVisibleLists().map(x => x.id)));
    ok('и на екрана — клетката на THREE', !!cell(h, 'THREE') && !cell(h, 'FIVE'));
    q.value = 'шумен'; fire(h.w, q, 'input');
    ok('Шумен (скрит зад „+2") — FIVE и DUP',
      h.w.llVisibleLists().map(x => x.id).sort().join(',') === 'DUP,FIVE',
      JSON.stringify(h.w.llVisibleLists().map(x => x.id)));
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
