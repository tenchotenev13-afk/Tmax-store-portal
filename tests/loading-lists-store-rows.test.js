/* Товарни листи — ИЗВЪНРЕДЕН РЕД ОТ ПОЛУЧАТЕЛЯ с одобрение (Пакет Г2).

   Дотук листът беше еднопосочен: складът описва, обектът отмята. Дойде ли
   палет, който не е в листа, нямаше къде да се запише — отмяташе се
   описаното и се звънеше по телефона.

   Въпросите, в които е лесно да се сбърка ТИХО, и затова са заковани тук:
     · артикулите на новия ред НЕ минават през llWriteProducts — той
       съпоставя по position спрямо llDraft.items и с една-единствена
       чернова би ги закачил за ПЪРВИЯ ред на листа. Тестът проверява
       item_id, не само че е имало POST;
     · „чака одобрение" ДЪРЖИ листа отворен. Без този гейт писмото до склада
       тръгва с ред, по който още никой не се е произнесъл, а после
       одобрението няма къде да влезе;
     · първото решение печели. PATCH-ът носи &approval_status=eq.pending и
       нула засегнати реда значи „някой вече е решил" — без това вторият
       натиснал презаписва чуждото решение и вижда своето;
     · отхвърленият ред не влиза в броячите, печата, PDF-а и писмото, но
       ОСТАВА видим (зачертан): изтриването му би изтрило и обяснението;
     · правата. Управителят на обекта НЕ одобрява собствената си заявка, а
       регионалният на ДРУГ регион — чужда.

   Пускане:  node tests/loading-lists-store-rows.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';

const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                role: 'manager', store_name: 'Петрич', assigned_stores: [], is_regional: false };
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [], is_regional: false };
/* Регионалният е accounting в Централен офис — така изглеждат и шестимата
   реални към 23.09.2026. Обектите му са в assigned_stores. */
const REGIONAL = { email: 'region.jug@temax.bg', display_name: 'Регионален Юг',
                   role: 'accounting', store_name: 'Централен офис',
                   assigned_stores: ['Петрич', 'Гоце Делчев'], is_regional: true };
const REGIONAL_OTHER = { email: 'region.sever@temax.bg', display_name: 'Регионален Север',
                         role: 'accounting', store_name: 'Централен офис',
                         assigned_stores: ['Русе', 'Разград'], is_regional: true };
const ADMIN = { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис', assigned_stores: [], is_regional: false };

const L_SENT = { id: 'L1', warehouse: WH, list_date: '2026-09-02', status: 'sent',
                 executed_by: 'Иван', comment: '', created_by: 'Склад Търговище',
                 created_at: '2026-09-02T06:00:00.000Z',
                 sent_at: '2026-09-02T07:00:00.000Z', done_at: null };
const L_DONE = Object.assign({}, L_SENT, { status: 'done', done_at: '2026-09-02T18:00:00.000Z' });

function it_(o) {
  return Object.assign({
    id: 'i-x', list_id: 'L1', position: 1, kind: 'pallet',
    pallet_no: 1, pallet_total: 1, purchase_doc: null, clears_doc: null,
    store_name: 'Петрич', warehouse_comment: null, store_comment: null,
    partial: false, received: false, received_by: null, received_at: null,
    missing: false, missing_by: null, missing_at: null,
    added_by_store: false, approval_status: null, approval_by: null,
    approval_at: null, approval_comment: null,
    created_at: '2026-09-02T06:00:00.000Z'
  }, o);
}
/* Ред, добавен от обекта — вече записан в базата. */
function added_(o) {
  return it_(Object.assign({
    id: 'a1', position: 9, kind: 'pallet', pallet_no: null, pallet_total: null,
    store_comment: 'дойде палет с плочки, който не е описан',
    received: true, received_by: 'Управител Петрич', received_at: '2026-09-02T09:00:00.000Z',
    added_by_store: true, approval_status: 'pending'
  }, o));
}

const USERS = [
  { email: 'petrich@temax.bg', store_name: 'Петрич', active: true, is_regional: false, assigned_stores: [] },
  { email: 'gd@temax.bg', store_name: 'Гоце Делчев', active: true, is_regional: false, assigned_stores: [] },
  { email: 'sklad.tg@temax.bg', store_name: WH, active: true, is_regional: false, assigned_stores: [] },
  { email: 'region.jug@temax.bg', store_name: 'Централен офис', active: true,
    is_regional: true, assigned_stores: ['Петрич', 'Гоце Делчев'] },
  { email: 'region.sever@temax.bg', store_name: 'Централен офис', active: true,
    is_regional: true, assigned_stores: ['Русе', 'Разград'] },
  /* Неактивен регионален на същия обект — не бива да получава нищо. */
  { email: 'stariat@temax.bg', store_name: 'Централен офис', active: false,
    is_regional: true, assigned_stores: ['Петрич'] }
];

const CATALOG = [
  { sap_code: '100200', product_name: 'Плочки гранитогрес 60x60', default_unit: 'кв.м' },
  { sap_code: '300400', product_name: 'Лепило за плочки 25 кг', default_unit: 'бр' }
];

function env(user, items, lists, opts) {
  opts = opts || {};
  let ref = null;
  const applyPatches = (rows, table) => {
    if (!ref) return rows;
    ref.calls.patch.filter(p => p.table === table).forEach(p => {
      const m = /id=eq\.([^&]*)/.exec(p.url);
      if (!m) return;
      /* PATCH с филтър по approval_status се прилага САМО ако редът още е
         pending — иначе мокът би „одобрил" ред, който сървърът не би пипнал. */
      if (/approval_status=eq\.pending/.test(p.url)) {
        const r0 = rows.find(r => String(r.id) === decodeURIComponent(m[1]));
        if (!r0 || r0.approval_status !== 'pending') return;
      }
      const row = rows.find(r => String(r.id) === decodeURIComponent(m[1]));
      if (row) Object.assign(row, p.body);
    });
    return rows;
  };
  /* Редовете, записани с POST по време на теста — иначе новият ред изчезва
     при презареждането и нищо от показването му не може да се провери. */
  const posted = () => {
    if (!ref) return [];
    const out = [];
    ref.calls.post.filter(p => p.table === 'loading_list_items').forEach((p, k) => {
      const b = Array.isArray(p.body) ? p.body : [p.body];
      b.forEach(x => out.push(Object.assign({}, it_({}), x, { id: 'NEW' + (k + 1) })));
    });
    return out;
  };
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js',
              'push.js', 'email.js', 'loading.js', 'notifications.js'],
    user: user,
    confirm: opts.confirm !== undefined ? opts.confirm : true,
    data: {
      loading_list_items: function (url) {
        let rows = applyPatches(
          (items || []).map(r => Object.assign({}, r)).concat(posted()), 'loading_list_items');
        const st = /store_name=eq\.([^&]*)/.exec(url);
        if (st) rows = rows.filter(r => String(r.store_name) === decodeURIComponent(st[1]));
        const li = /list_id=eq\.([^&]*)/.exec(url);
        if (li) rows = rows.filter(r => String(r.list_id) === decodeURIComponent(li[1]));
        /* order/limit СЕ прилагат: „последната позиция в листа" се чете точно
           така и без тях проверката за position би минавала на случаен ред. */
        if (/order=position\.desc/.test(url)) {
          rows = rows.slice().sort((a, b) => (b.position || 0) - (a.position || 0));
        }
        const lim = /limit=(\d+)/.exec(url);
        if (lim) rows = rows.slice(0, parseInt(lim[1], 10));
        return rows;
      },
      loading_lists: function (url) {
        let rows = applyPatches((lists || []).map(r => Object.assign({}, r)), 'loading_lists');
        const ids = /id=in\.\(([^)]*)\)/.exec(url);
        if (ids) { const s = ids[1].split(','); rows = rows.filter(r => s.indexOf(String(r.id)) >= 0); }
        const st = /status=in\.\(([^)]*)\)/.exec(url);
        if (st) { const s = st[1].split(','); rows = rows.filter(r => s.indexOf(r.status) >= 0); }
        const one = /[?&]id=eq\.([^&]*)/.exec(url);
        if (one) rows = rows.filter(r => String(r.id) === decodeURIComponent(one[1]));
        return rows;
      },
      users: function (url) {
        let rows = (opts.users || USERS).map(r => Object.assign({}, r));
        if (/active=eq\.true/.test(url)) rows = rows.filter(r => r.active);
        if (/is_regional=eq\.true/.test(url)) rows = rows.filter(r => r.is_regional);
        const inm = /store_name=in\.\(([^)]*)\)/.exec(url);
        if (inm) {
          const want = inm[1].split(',').map(decodeURIComponent);
          rows = rows.filter(r => want.indexOf(r.store_name) >= 0);
        }
        return rows;
      },
      product_catalog: function (url) {
        let rows = CATALOG.map(r => Object.assign({}, r));
        const m = /sap_code=eq\.([^&]*)/.exec(url);
        if (m) rows = rows.filter(r => r.sap_code === decodeURIComponent(m[1]));
        return rows;
      },
      loading_list_products: [],
      stores: [], contacts: [], transport_orders: [], client_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: [], goods_transit: []
    }
  });
  ref = h;
  h.toasts = [];
  const origToast = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: m, col: c }); return origToast(m, c); };
  h.pushes = []; h.mails = []; h.pushAllCalls = 0;
  h.w.pushToStores = function (stores, title, message) {
    h.pushes.push({ stores: stores, title: title, message: message });
    return Promise.resolve({ ok: true, status: 200, data: {} });
  };
  h.w.pushToAll = function () { h.pushAllCalls++; return Promise.resolve({ ok: true, data: {} }); };
  h.w.sendEmail = function (to, subject, html) {
    h.mails.push({ to: Array.isArray(to) ? to : [to], subject: subject, html: html });
    return Promise.resolve({ ok: true, status: 200, data: {} });
  };

  /* Две неща, които harness-ът нарочно не прави:
       · POST връща {} — sbPostReturn тогава няма id и новият ред е безполезен;
       · отговорът няма headers — llPatchIfPending чете Content-Range оттам.
     h.aprRows задава броя засегнати редове (0 = „вече е решено"). */
  h.aprRows = 1;
  const origFetch = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const method = (init.method || 'GET').toUpperCase();
    const p = origFetch(url, init);
    if (method === 'POST' && /loading_list_items/.test(url)) {
      const n = h.calls.post.filter(x => x.table === 'loading_list_items').length;
      return p.then(r => {
        if (!r.ok) return r;
        let b = null;
        try { b = JSON.parse(init.body); } catch (e) { b = null; }
        const row = Object.assign({}, Array.isArray(b) ? b[0] : b, { id: 'NEW' + n });
        return Object.assign({}, r, { json: () => Promise.resolve([row]) });
      });
    }
    if (method === 'PATCH' && /approval_status=eq\.pending/.test(url)) {
      return p.then(r => {
        if (!r.ok) return r;
        return Object.assign({}, r, {
          headers: { get: k => (/^content-range$/i.test(k) ? '*/' + h.aprRows : null) }
        });
      });
    }
    return p;
  };
  return h;
}

const card = (doc, id) => doc.getElementById('ll-card-' + id);
const patchesTo = (h, table) => h.calls.patch.filter(p => p.table === table);
const postsTo = (h, table) => h.calls.post.filter(p => p.table === table);
const btnIn = (root, text) => (root ? btn(root, text) : null);
const modal = doc => doc.getElementById('ll-add-modal');

(async function () {

  section('а) Бутонът „➕ Добави ред" — на изпратен лист, не на приключен');
  {
    const h = env(STORE, [it_({ id: 'i1', purchase_doc: 'D-100' })], [L_SENT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('има бутон „➕ Добави ред"', !!btnIn(card(h.doc, 'L1'), '➕ Добави ред'),
      card(h.doc, 'L1').textContent.slice(0, 250));

    const h2 = env(STORE, [it_({ id: 'i1', received: true, received_by: 'Управител Петрич' })], [L_DONE]);
    h2.w.loadLoadingLists();
    await ticks(); await ticks();
    h2.w.llCollapsed = {};              /* приключеният лист е свит по подразбиране */
    h2.w.renderLoadingLists();
    ok('на приключен лист го НЯМА', !btnIn(card(h2.doc, 'L1'), '➕ Добави ред'),
      card(h2.doc, 'L1').textContent.slice(0, 250));
    /* И извикването наум не бива да отваря нищо. */
    h2.w.llStoreAddOpen('L1');
    await ticks();
    ok('и llStoreAddOpen наум не отваря форма', !modal(h2.doc));
    ok('с обяснение в toast',
      h2.toasts.some(t => /вече е приключен/.test(String(t.msg))), JSON.stringify(h2.toasts));
  }

  section('б) Формата: същият блок за артикули, коментарът е задължителен');
  {
    const h = env(STORE, [it_({ id: 'i1', purchase_doc: 'D-100' })], [L_SENT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    const saved = h.w.llDraft;
    realClick(h.w, btnIn(card(h.doc, 'L1'), '➕ Добави ред'));
    await ticks();

    const m = modal(h.doc);
    if (ok('формата се отваря', !!m)) {
      ok('носи името на обекта', m.textContent.indexOf('Петрич') >= 0, m.textContent.slice(0, 120));
      ok('има избор на вид', !!h.doc.getElementById('ll-add-kind'));
      ok('видовете са от LL_KINDS — има и извънгабаритен',
        m.innerHTML.indexOf('oversize') >= 0);
      ok('има поле за изходящ №', !!h.doc.getElementById('ll-add-doc'));
      ok('има поле за обяснение', !!h.doc.getElementById('ll-add-comment'));
      ok('полето за обяснение е ПРАЗНО, не „—"',
        h.doc.getElementById('ll-add-comment').value === '',
        JSON.stringify(h.doc.getElementById('ll-add-comment').value));
      /* Блокът от Пакет В1, същите id-та — значи същият скенер и същото
         автодопълване, а не второ копие, което ще се разминава. */
      ok('има блок за артикули със скенер', !!btn(m, '📷 Сканирай'));
      ok('и полетата на В1 (ll-pf-sap-0)', !!h.doc.getElementById('ll-pf-sap-0'));
      ok('казва, че редът чака одобрение',
        m.textContent.indexOf('чак след одобрение') >= 0, m.textContent.slice(0, 400));
      ok('черновата на редактора е запазена, а не изтрита',
        h.w.llStoreAdd && h.w.llStoreAdd.savedDraft === saved);
    }

    /* Празен коментар — нищо не се записва. */
    realClick(h.w, btn(m, '➕ Добави реда'));
    await ticks(); await ticks();
    ok('НУЛА POST-ове изобщо', h.calls.post.length === 0,
      JSON.stringify(h.calls.post.map(p => p.table)));
    ok('червен toast с обяснение',
      h.toasts.some(t => /коментарът е задължителен/.test(String(t.msg)) && t.col === '#dc2626'),
      JSON.stringify(h.toasts));
    ok('фокусът отива в полето',
      h.doc.activeElement === h.doc.getElementById('ll-add-comment'),
      h.doc.activeElement && h.doc.activeElement.id);
    ok('формата остава отворена', !!modal(h.doc));

    /* Отказ връща черновата и маха формата. */
    realClick(h.w, btn(modal(h.doc), 'Откажи'));
    await ticks();
    ok('„Откажи" маха формата', !modal(h.doc));
    ok('и връща предишната чернова', h.w.llDraft === saved);
    ok('llStoreAdd е изчистен', h.w.llStoreAdd === null);
  }

  section('в) Записът: един ред + артикулите МУ, с pending и received');
  {
    const items = [
      it_({ id: 'i1', position: 1, purchase_doc: 'D-100' }),
      it_({ id: 'i2', position: 2, purchase_doc: 'D-200', store_name: 'Гоце Делчев' })
    ];
    const h = env(STORE, items, [L_SENT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    realClick(h.w, btnIn(card(h.doc, 'L1'), '➕ Добави ред'));
    await ticks();

    h.w.llStoreAddField('kind', 'oversize');
    h.w.llStoreAddField('purchase_doc', '  D-999  ');
    h.w.llStoreAddField('store_comment', '  дойде извънгабаритен товар, който не е в листа  ');

    /* Артикул през същия път като в редактора: поле → „➕ Добави". */
    h.w.llPfInput(0, 'sap_code', '100200');
    h.w.llPfInput(0, 'qty', '12,5');
    await h.w.llAddProduct(0);
    await ticks();
    ok('артикулът влезе в черновата', (h.w.llDraft.items[0].products || []).length === 1,
      JSON.stringify(h.w.llDraft.items[0].products));
    ok('името дойде от каталога',
      (h.w.llDraft.items[0].products[0] || {}).product_name === 'Плочки гранитогрес 60x60',
      JSON.stringify(h.w.llDraft.items[0].products[0]));
    ok('формата се пре-рендира с новия артикул',
      modal(h.doc).innerHTML.indexOf('Плочки гранитогрес') >= 0);

    realClick(h.w, btn(modal(h.doc), '➕ Добави реда'));
    await ticks(); await ticks(); await ticks(); await ticks();

    const ip = postsTo(h, 'loading_list_items');
    if (ok('точно един POST по редовете', ip.length === 1,
      JSON.stringify(h.calls.post.map(p => p.table)))) {
      const b = ip[0].body;
      ok('added_by_store:true', b.added_by_store === true, JSON.stringify(b));
      ok('approval_status:pending', b.approval_status === 'pending', JSON.stringify(b.approval_status));
      /* Стоката Е получена — фактът не чака одобрение. */
      ok('received:true веднага', b.received === true, JSON.stringify(b.received));
      ok('received_by е обектът', b.received_by === 'Управител Петрич', JSON.stringify(b.received_by));
      ok('received_at е попълнено', !!b.received_at);
      ok('missing:false', b.missing === false, JSON.stringify(b.missing));
      ok('видът е избраният', b.kind === 'oversize', JSON.stringify(b.kind));
      /* „палет 3 от 5" е обещание на СКЛАДА — добавен отвън ред не го разваля. */
      ok('pallet_no остава null', b.pallet_no === null, JSON.stringify(b.pallet_no));
      ok('pallet_total остава null', b.pallet_total === null, JSON.stringify(b.pallet_total));
      ok('position е след последния ред на ЦЕЛИЯ лист (2 → 3)', b.position === 3,
        JSON.stringify(b.position));
      ok('коментарът е trim-нат', b.store_comment === 'дойде извънгабаритен товар, който не е в листа',
        JSON.stringify(b.store_comment));
      ok('изходящият № е trim-нат', b.purchase_doc === 'D-999', JSON.stringify(b.purchase_doc));
      ok('обектът е този на картата', b.store_name === 'Петрич', JSON.stringify(b.store_name));
      ok('warehouse_comment е null — складът не е писал нищо',
        b.warehouse_comment === null, JSON.stringify(b.warehouse_comment));
    }

    const pp = postsTo(h, 'loading_list_products');
    if (ok('точно един POST по артикулите', pp.length === 1,
      JSON.stringify(h.calls.post.map(p => p.table)))) {
      const rows = Array.isArray(pp[0].body) ? pp[0].body : [pp[0].body];
      ok('един артикул', rows.length === 1, JSON.stringify(rows));
      /* СЪРЦЕВИНАТА: артикулът виси на НОВИЯ ред, не на първия ред на листа. */
      ok('item_id е id-то на НОВИЯ ред', rows[0].item_id === 'NEW1', JSON.stringify(rows[0].item_id));
      ok('и НЕ е първият ред на листа', rows[0].item_id !== 'i1', JSON.stringify(rows[0].item_id));
      ok('количеството е с десетична запетая → число', rows[0].qty === 12.5,
        JSON.stringify(rows[0].qty));
      ok('мярката е от каталога', rows[0].unit === 'кв.м', JSON.stringify(rows[0].unit));
      ok('позицията в описа е 1', rows[0].position === 1, JSON.stringify(rows[0].position));
    }
    ok('формата се затваря', !modal(h.doc));
    ok('зелен toast „чака одобрение"',
      h.toasts.some(t => /чака одобрение/.test(String(t.msg))), JSON.stringify(h.toasts));
  }

  section('г) Известие при добавяне — push до склада, имейл до склада и регионалния');
  {
    const h = env(STORE, [it_({ id: 'i1', purchase_doc: 'D-100' })], [L_SENT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    realClick(h.w, btnIn(card(h.doc, 'L1'), '➕ Добави ред'));
    await ticks();
    h.w.llStoreAddField('store_comment', 'палет плочки в повече');
    realClick(h.w, btn(modal(h.doc), '➕ Добави реда'));
    await ticks(); await ticks(); await ticks(); await ticks();

    ok('точно един push', h.pushes.length === 1, JSON.stringify(h.pushes));
    ok('и той е до СКЛАДА', h.pushes.length === 1 && h.pushes[0].stores.join() === WH,
      JSON.stringify(h.pushes[0] && h.pushes[0].stores));
    ok('заглавието казва кой е добавил',
      h.pushes.length === 1 && h.pushes[0].title.indexOf('Петрич') >= 0,
      JSON.stringify(h.pushes[0] && h.pushes[0].title));
    /* pushToStores([]) пада към pushToAll() — известие до целия портал. */
    ok('pushToAll НЕ е викана', h.pushAllCalls === 0, String(h.pushAllCalls));

    ok('точно едно писмо', h.mails.length === 1, JSON.stringify(h.mails.map(m => m.to)));
    const to = h.mails.length ? h.mails[0].to : [];
    ok('до склада', to.indexOf('sklad.tg@temax.bg') >= 0, JSON.stringify(to));
    ok('и до регионалния на обекта', to.indexOf('region.jug@temax.bg') >= 0, JSON.stringify(to));
    ok('НЕ до регионалния на друг регион', to.indexOf('region.sever@temax.bg') < 0, JSON.stringify(to));
    ok('НЕ до неактивен регионален', to.indexOf('stariat@temax.bg') < 0, JSON.stringify(to));
    ok('НЕ до самия обект — той го е написал', to.indexOf('petrich@temax.bg') < 0, JSON.stringify(to));
    ok('писмото носи обяснението',
      h.mails.length === 1 && h.mails[0].html.indexOf('палет плочки в повече') >= 0);
    ok('и казва, че чака одобрение',
      h.mails.length === 1 && h.mails[0].html.indexOf('чака одобрение') >= 0);
  }

  section('д) Чакащият ред държи листа отворен');
  {
    const items = [
      it_({ id: 'i1', position: 1, received: true, received_by: 'Управител Петрич' }),
      added_({ id: 'a1' })
    ];
    const h = env(STORE, items, [L_SENT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    const c = card(h.doc, 'L1');
    ok('чакащият ред е с жълт фон',
      !!c.querySelector('tr[data-ll-added="pending"]') &&
      /#fffbeb/.test(c.querySelector('tr[data-ll-added="pending"]').getAttribute('style') || ''),
      c.querySelector('tr[data-ll-added="pending"]') &&
      c.querySelector('tr[data-ll-added="pending"]').getAttribute('style'));
    ok('и с маркер „чака одобрение"', !!c.querySelector('[data-ll-appr="pending"]'));
    ok('заглавието на картата брои чакащите',
      !!c.querySelector('[data-ll-apr-wait="1"]'), c.textContent.slice(0, 260));

    const fin = btnIn(c, '🏁 Приключи приемането');
    if (ok('бутонът „Приключи" съществува', !!fin)) {
      ok('и е disabled, макар всеки ред да е отметнат', fin.disabled === true, String(fin.disabled));
      ok('title-ът обяснява ЗАЩО именно',
        (fin.getAttribute('title') || '').indexOf('чака одобрение') >= 0, fin.getAttribute('title'));
    }
    /* Извикването наум също не приключва — disabled се смята при рендиране. */
    h.w.llFinishReceiving('L1');
    await ticks(); await ticks();
    ok('извикването наум не приключва листа', patchesTo(h, 'loading_lists').length === 0,
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('с обяснение в toast',
      h.toasts.some(t => /чака одобрение/.test(String(t.msg))), JSON.stringify(h.toasts));
    /* И автоматичният път мълчи. */
    await h.w.llAutoDoneList('L1');
    await ticks();
    ok('llAutoDoneList също не пише статус', patchesTo(h, 'loading_lists').length === 0,
      JSON.stringify(h.calls.patch.map(p => p.table)));
  }

  section('е) Кой може да реши');
  {
    const items = [it_({ id: 'i1', received: true }), added_({ id: 'a1' })];
    const row = added_({ id: 'a1' });

    const cases = [
      ['управителят на обекта НЕ одобрява собствената си заявка', STORE, false],
      ['складът-изпращач одобрява', WAREHOUSE, true],
      ['регионалният на обекта одобрява', REGIONAL, true],
      ['регионалният на ДРУГ регион — не', REGIONAL_OTHER, false],
      ['admin одобрява', ADMIN, true]
    ];
    for (const [name, user, want] of cases) {
      const h = env(user, items, [L_SENT]);
      ok(name, h.w.llCanApprove(L_SENT, row) === want, String(h.w.llCanApprove(L_SENT, row)));
      h.close();
    }

    /* И на екрана: бутоните ги няма при обекта, има ги при регионалния. */
    const hs = env(STORE, items, [L_SENT]);
    hs.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('при обекта НЯМА бутон „Одобри"', !btnIn(card(hs.doc, 'L1'), '✅ Одобри'),
      card(hs.doc, 'L1').textContent.slice(0, 300));
    ok('нито „Отхвърли"', !btnIn(card(hs.doc, 'L1'), '⛔ Отхвърли'));
    ok('но маркерът „чака одобрение" се вижда и при него',
      !!card(hs.doc, 'L1').querySelector('[data-ll-appr="pending"]'));

    const hr = env(REGIONAL, items, [L_SENT]);
    hr.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('при регионалния има „✅ Одобри"', !!btnIn(card(hr.doc, 'L1'), '✅ Одобри'),
      card(hr.doc, 'L1').textContent.slice(0, 300));
    ok('и „⛔ Отхвърли"', !!btnIn(card(hr.doc, 'L1'), '⛔ Отхвърли'));
    ok('и поле за коментар', !!hr.doc.getElementById('ll-apr-a1'));
    /* Складът гледа своя преглед, не картата на обекта. */
    const hw = env(WAREHOUSE, items, [L_SENT]);
    hw.w.loadLoadingLists();
    await ticks(); await ticks();
    hw.w.llOpenView('L1');
    const wrap = hw.doc.getElementById('mod-loading');
    ok('в прегледа на склада също има „✅ Одобри"', !!btn(wrap, '✅ Одобри'),
      wrap.textContent.slice(0, 400));
    ok('и маркерът стои там', !!wrap.querySelector('[data-ll-appr="pending"]'));
  }

  section('ж1) И складът не може да затвори листа, докато има чакащ ред');
  {
    const items = [
      it_({ id: 'i1', position: 1, received: true, received_by: 'Управител Петрич' }),
      added_({ id: 'a1' })
    ];
    const h = env(WAREHOUSE, items, [L_SENT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    realClick(h.w, btn(h.doc.getElementById('mod-loading'), '✅ Приключи'));
    await ticks(); await ticks();
    ok('нула PATCH по листа', patchesTo(h, 'loading_lists').length === 0,
      JSON.stringify(h.calls.patch.map(p => p.table)));
    /* Гейтът е ПРЕДИ confirm-а: иначе човекът потвърждава действие, което
       така или иначе няма да стане. */
    ok('и confirm-ът изобщо не е показан', h.calls.confirm.length === 0,
      JSON.stringify(h.calls.confirm));
    ok('с обяснение в toast',
      h.toasts.some(t => /чака одобрение/.test(String(t.msg))), JSON.stringify(h.toasts));

    /* След решението същият бутон минава. */
    h.doc.getElementById('ll-apr-a1').value = 'наред';
    realClick(h.w, btn(h.doc.getElementById('mod-loading'), '✅ Одобри'));
    await ticks(); await ticks(); await ticks(); await ticks();
    h.w.llOpenView('L1');
    const again = btn(h.doc.getElementById('mod-loading'), '✅ Приключи');
    if (ok('бутонът „Приключи" още е там', !!again)) {
      const before = patchesTo(h, 'loading_lists').length;
      realClick(h.w, again);
      await ticks(); await ticks();
      ok('сега листът се приключва', patchesTo(h, 'loading_lists').length > before,
        JSON.stringify(h.calls.patch.map(p => p.table)));
    }
  }

  section('ж) Одобрение — PATCH само по pending, после листът се затваря');
  {
    const items = [
      it_({ id: 'i1', position: 1, received: true, received_by: 'Управител Петрич' }),
      added_({ id: 'a1' })
    ];
    const h = env(REGIONAL, items, [L_SENT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.doc.getElementById('ll-apr-a1').value = '  наред е, взето е  ';
    realClick(h.w, btnIn(card(h.doc, 'L1'), '✅ Одобри'));
    await ticks(); await ticks(); await ticks(); await ticks();

    const ip = patchesTo(h, 'loading_list_items');
    if (ok('точно един PATCH по реда', ip.length === 1,
      JSON.stringify(h.calls.patch.map(p => p.table + ' ' + p.url)))) {
      ok('approval_status:approved', ip[0].body.approval_status === 'approved',
        JSON.stringify(ip[0].body));
      ok('approval_by е решаващият', ip[0].body.approval_by === 'Регионален Юг',
        JSON.stringify(ip[0].body.approval_by));
      ok('approval_at е попълнено', !!ip[0].body.approval_at);
      ok('коментарът е trim-нат', ip[0].body.approval_comment === 'наред е, взето е',
        JSON.stringify(ip[0].body.approval_comment));
      /* Без този филтър вторият натиснал презаписва чуждото решение. */
      ok('URL-ът носи &approval_status=eq.pending',
        /approval_status=eq\.pending/.test(ip[0].url), ip[0].url);
      ok('и сочи точния ред', /id=eq\.a1/.test(ip[0].url), ip[0].url);
      ok('received НЕ се пипа', !('received' in ip[0].body), JSON.stringify(ip[0].body));
    }
    /* Решението беше последното, което пречеше на приключването. */
    const lp = patchesTo(h, 'loading_lists');
    ok('листът се приключва веднага след решението', lp.length === 1,
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('и то като „done", защото липси няма',
      lp.length === 1 && lp[0].body.status === 'done', JSON.stringify(lp[0] && lp[0].body));
    ok('обектът получава push за решението',
      h.pushes.some(p => p.stores.join() === 'Петрич' && /одобрен/.test(p.title)),
      JSON.stringify(h.pushes));
  }

  section('з) Отхвърляне — без коментар нищо не се записва');
  {
    const items = [it_({ id: 'i1', received: true }), added_({ id: 'a1' })];
    const h = env(REGIONAL, items, [L_SENT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    realClick(h.w, btnIn(card(h.doc, 'L1'), '⛔ Отхвърли'));
    await ticks(); await ticks();
    ok('НУЛА PATCH-ове', h.calls.patch.length === 0,
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('с обяснение в toast',
      h.toasts.some(t => /Отхвърлянето иска коментар/.test(String(t.msg))), JSON.stringify(h.toasts));
    ok('фокусът отива в полето', h.doc.activeElement === h.doc.getElementById('ll-apr-a1'),
      h.doc.activeElement && h.doc.activeElement.id);

    h.doc.getElementById('ll-apr-a1').value = 'това не е от този курс';
    realClick(h.w, btnIn(card(h.doc, 'L1'), '⛔ Отхвърли'));
    await ticks(); await ticks(); await ticks(); await ticks();
    const ip = patchesTo(h, 'loading_list_items');
    ok('сега има PATCH', ip.length === 1, JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('approval_status:rejected', ip.length === 1 && ip[0].body.approval_status === 'rejected',
      JSON.stringify(ip[0] && ip[0].body));
    ok('с причината', ip.length === 1 && ip[0].body.approval_comment === 'това не е от този курс',
      JSON.stringify(ip[0] && ip[0].body.approval_comment));
    ok('обектът разбира — push с причината',
      h.pushes.some(p => p.stores.join() === 'Петрич' && /отхвърлен/.test(p.title) &&
        /това не е от този курс/.test(p.message)), JSON.stringify(h.pushes));
    ok('и писмо до обекта',
      h.mails.some(m => m.to.indexOf('petrich@temax.bg') >= 0 && /Отхвърлен/.test(m.subject)),
      JSON.stringify(h.mails.map(m => m.subject + ' → ' + m.to)));
  }

  section('и) Първото решение печели');
  {
    const items = [it_({ id: 'i1', received: true }), added_({ id: 'a1' })];
    const h = env(REGIONAL, items, [L_SENT]);
    h.aprRows = 0;                   /* сървърът: нула засегнати реда */
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.doc.getElementById('ll-apr-a1').value = 'одобрявам';
    realClick(h.w, btnIn(card(h.doc, 'L1'), '✅ Одобри'));
    await ticks(); await ticks(); await ticks(); await ticks();

    ok('PATCH-ът е изпратен', patchesTo(h, 'loading_list_items').length === 1);
    ok('но НЕ се отчита като успех',
      !h.toasts.some(t => /Редът е одобрен/.test(String(t.msg))), JSON.stringify(h.toasts));
    ok('казва се, че вече е решено',
      h.toasts.some(t => /вече е решен от някой друг/.test(String(t.msg))), JSON.stringify(h.toasts));
    ok('обектът НЕ получава второ известие', h.pushes.length === 0, JSON.stringify(h.pushes));
    ok('и листът не се приключва от несъстоялото се решение',
      patchesTo(h, 'loading_lists').length === 0,
      JSON.stringify(h.calls.patch.map(p => p.table)));

    /* И вторият натиснал по вече решен ред в паметта — спрян още преди PATCH. */
    const h2 = env(REGIONAL, [it_({ id: 'i1', received: true }),
      added_({ id: 'a1', approval_status: 'approved', approval_by: 'Склад Търговище' })], [L_SENT]);
    h2.w.loadLoadingLists();
    await ticks(); await ticks();
    await h2.w.llDecideRow('L1', 'a1', 0);
    await ticks();
    ok('решение по вече решен ред не праща нищо', h2.calls.patch.length === 0,
      JSON.stringify(h2.calls.patch.map(p => p.table)));
  }

  section('й) Отхвърленият ред не влиза никъде, одобреният — с бележка');
  {
    const items = [
      it_({ id: 'i1', position: 1, purchase_doc: 'D-100', received: true,
            received_by: 'Управител Петрич' }),
      added_({ id: 'a1', position: 2, purchase_doc: 'D-REJ',
               approval_status: 'rejected', approval_by: 'Склад Търговище',
               approval_at: '2026-09-02T10:00:00.000Z', approval_comment: 'не е от този курс' }),
      added_({ id: 'a2', position: 3, purchase_doc: 'D-OK',
               approval_status: 'approved', approval_by: 'Регионален Юг',
               approval_at: '2026-09-02T10:05:00.000Z' })
    ];
    const h = env(STORE, items, [L_SENT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    const c = card(h.doc, 'L1');
    ok('отхвърленият ред ОСТАВА видим', !!c.querySelector('tr[data-ll-added="rejected"]'));
    ok('и е зачертан',
      /line-through/.test((c.querySelector('tr[data-ll-added="rejected"]') || {}).getAttribute
        ? c.querySelector('tr[data-ll-added="rejected"]').getAttribute('style') : ''),
      c.querySelector('tr[data-ll-added="rejected"]') &&
      c.querySelector('tr[data-ll-added="rejected"]').getAttribute('style'));
    ok('причината се чете', c.textContent.indexOf('не е от този курс') >= 0,
      c.textContent.slice(0, 500));
    /* 3 реда в базата, 2 живи — броячът казва 2. */
    ok('броячът брои 2, не 3', c.textContent.indexOf('получени 2 · неполучени 0 / 2') >= 0,
      c.textContent.slice(0, 300));
    ok('одобреният носи бележка „добавен от обекта"',
      !!c.querySelector('[data-ll-appr="approved"]'));

    /* Броячите. */
    const cnt = h.w.llCounts(items);
    ok('llCounts брои 2 реда', cnt.total === 2, JSON.stringify(cnt));
    ok('и 2 получени', cnt.received === 2, JSON.stringify(cnt));
    const sum = h.w.llSummaryByStore(items);
    ok('llSummaryByStore също брои 2', sum.length === 1 && sum[0].total === 2, JSON.stringify(sum));

    /* PDF. */
    const pr = h.w.llPdfRows(items, 'Петрич');
    ok('llPdfRows дава 2 реда', pr.length === 2, JSON.stringify(pr.map(r => r.id)));
    ok('и отхвърленият не е сред тях', pr.every(r => r.id !== 'a1'),
      JSON.stringify(pr.map(r => r.id)));

    /* Печат. */
    h.w.llPrint('L1', 'Петрич');
    const pw = h.doc.getElementById('mod-print');
    ok('печатът носи одобрения ред', pw.innerHTML.indexOf('D-OK') >= 0,
      pw.textContent.slice(0, 400));
    ok('и НЕ носи отхвърления', pw.innerHTML.indexOf('D-REJ') < 0,
      pw.textContent.slice(0, 400));
    /* Описът на отхвърлената единица също няма какво да залепи на палет —
       редът не е част от листа. llPrint е ЕДИНСТВЕНОТО място, което отсява
       за печата, тоест тази проверка го държи. */
    const before = pw.innerHTML;
    h.w.llPrint('L1', 'Петрич', 'a1');
    ok('опис на отхвърлена единица не се печата',
      h.toasts.some(t => /Товарната единица не е намерена/.test(String(t.msg))),
      JSON.stringify(h.toasts));
    ok('и не подменя вече отпечатаното', h.doc.getElementById('mod-print').innerHTML === before);
    /* А одобрената си има опис. */
    h.w.llPrint('L1', 'Петрич', 'a2');
    ok('опис на одобрената единица се печата',
      h.doc.getElementById('mod-print').innerHTML.indexOf('D-OK') >= 0,
      h.doc.getElementById('mod-print').textContent.slice(0, 300));

    /* Писмото до склада при приключване. */
    const html = h.w.llClosedHtmlFor(L_SENT, items);
    ok('писмото носи одобрения ред', html.indexOf('D-OK') >= 0);
    ok('и НЕ носи отхвърления', html.indexOf('D-REJ') < 0);
    ok('и брои 2 реда', html.indexOf('от 2 реда') >= 0, html.slice(0, 900));
  }

  section('к) Отхвърленият ред не пречи на приключването');
  {
    const items = [
      it_({ id: 'i1', position: 1, received: true, received_by: 'Управител Петрич' }),
      /* Неотметнат САМО той — но е отхвърлен, тоест за листа не съществува. */
      added_({ id: 'a1', position: 2, approval_status: 'rejected',
               approval_by: 'Склад Търговище', approval_comment: 'не е от този курс',
               received: false, received_by: null, received_at: null })
    ];
    const h = env(STORE, items, [L_SENT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    const fin = btnIn(card(h.doc, 'L1'), '🏁 Приключи приемането');
    ok('бутонът „Приключи" е активен', !!fin && fin.disabled === false,
      fin && String(fin.disabled));
    realClick(h.w, fin);
    await ticks(); await ticks(); await ticks();
    const lp = patchesTo(h, 'loading_lists');
    ok('листът се приключва', lp.length === 1, JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('и то като „done" — отхвърленият не е липса',
      lp.length === 1 && lp[0].body.status === 'done', JSON.stringify(lp[0] && lp[0].body));
  }

  report();
})();
