/* Товарни листи — снимки при ИЗПРАЩАНЕ (задължителни) и при ПОЛУЧАВАНЕ.

   Смисълът е един: да се хване щета при транспорт, неправилно натоварване или
   стречоване. Затова снимка отпреди тръгване, която никой не сравнява с
   пристигането, не доказва нищо — двата края се показват един до друг.

   Въпросите, в които е лесно да се сбърка ТИХО, и затова са заковани тук:
     · ГЕЙТЪТ Е ВЪТРЕ В llSendList, не в бутона. llSendList е единственият път
       до status='sent'; проверка само в рендера значи „скрито", не
       „невъзможно" — и извикване наум я заобикаля;
     · ЧУЖДИТЕ СНИМКИ. Обектът качва към СВОЯ обект; вижда ли чуждите при
       получаване, това е изтичане между обекти — същото правило като при
       редовете на листа;
     · снимката при изпращане обаче е ОБЩА: тя е доказателството какво е
       тръгнало и трябва да я види всеки получател;
     · ПРОВАЛЪТ ПРИ КАЧВАНЕ не бива да мълчи. Човек, който е избрал три
       снимки и е видял две, трябва да разбере от портала, не от паметта си;
     · редът в базата се пише СЛЕД успешното качване. Обратният ред оставя
       ред, който сочи несъществуващ файл — счупена миниатюра завинаги;
     · правата за триене: качилият, докато листът не е приключен; admin
       винаги.

   Пускане:  node tests/loading-lists-photos.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const PETRICH = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                  role: 'manager', store_name: 'Петрич', assigned_stores: [] };
const GD = { email: 'gd@temax.bg', display_name: 'Управител ГД',
             role: 'manager', store_name: 'Гоце Делчев', assigned_stores: [] };
const ADMIN = { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис', assigned_stores: [] };

/* С имейл и active: llStoreEmails ги чете оттук, а без тях писмото не
   тръгва и сценарий „ж" не проверява нищо. */
const USERS = [
  { store_name: 'Петрич', email: 'petrich@temax.bg', active: true },
  { store_name: 'Гоце Делчев', email: 'gd@temax.bg', active: true },
  { store_name: 'Централен офис', email: 'co@temax.bg', active: true },
  { store_name: WH, email: 'sklad.tg@temax.bg', active: true }
];

function list_(o) {
  return Object.assign({ id: 'L1', warehouse: WH, list_date: '2026-09-25',
    status: 'draft', executed_by: 'Иван', comment: '',
    created_at: '2026-09-25T06:00:00.000Z', sent_at: null, done_at: null }, o);
}
function item_(o) {
  return Object.assign({
    id: 'i1', list_id: 'L1', position: 1, kind: 'pallet', pallet_no: 1,
    pallet_total: 1, purchase_doc: 'ИЗХ-100', clears_doc: null,
    store_name: 'Петрич', warehouse_comment: null, store_comment: null,
    partial: false, received: false, received_by: null, received_at: null,
    missing: false, missing_by: null, missing_at: null,
    added_by_store: false, approval_status: null, created_at: 'x'
  }, o);
}
function photo_(o) {
  return Object.assign({ id: 'p1', list_id: 'L1', store_name: WH, stage: 'sent',
    path: 'https://cdn.test/a.jpg', uploaded_by: 'Склад Търговище',
    uploaded_at: '2026-09-25T07:00:00.000Z' }, o);
}
/* Фалшив файл: llUploadPhotos чете само input.files, .dataset и .value, а
   diffCompressImage пада обратно към оригинала, щом canvas го няма в jsdom. */
const fakeFile = (name) => ({ name: name || 'IMG.jpg', type: 'image/jpeg', size: 1024 });
function fakeInput(listId, stage, store, files) {
  return { files: files, value: '', dataset: { l: listId, st: stage, s: store } };
}

function env(user, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js',
              'stock-differences.js', 'push.js', 'email.js', 'loading.js'],
    user: user,
    confirm: opts.confirm !== undefined ? opts.confirm : true,
    fail: opts.fail,
    data: {
      loading_lists: function (url) {
        let rows = (opts.lists || []).map(r => Object.assign({}, r));
        const m = /warehouse=eq\.([^&]*)/.exec(url);
        if (m) rows = rows.filter(r => r.warehouse === decodeURIComponent(m[1]));
        const st = /status=in\.\(([^)]*)\)/.exec(url);
        if (st) { const a = st[1].split(','); rows = rows.filter(r => a.indexOf(r.status) >= 0); }
        const ids = /id=in\.\(([^)]*)\)/.exec(url);
        if (ids) { const a = ids[1].split(','); rows = rows.filter(r => a.indexOf(String(r.id)) >= 0); }
        return rows;
      },
      loading_list_items: function (url) {
        let rows = (opts.items || []).map(r => Object.assign({}, r));
        const st = /store_name=eq\.([^&]*)/.exec(url);
        if (st) rows = rows.filter(r => r.store_name === decodeURIComponent(st[1]));
        const li = /list_id=in\.\(([^)]*)\)/.exec(url);
        if (li) { const a = li[1].split(','); rows = rows.filter(r => a.indexOf(String(r.list_id)) >= 0); }
        return rows;
      },
      /* Снимките се четат наново след всяко качване — мокът връща ТЕКУЩОТО
         състояние на масива, за да се вижда какво е добавил кодът. */
      loading_list_photos: function (url) {
        let rows = (h.photos || []).map(r => Object.assign({}, r));
        const li = /list_id=in\.\(([^)]*)\)/.exec(url);
        if (li) { const a = li[1].split(','); rows = rows.filter(r => a.indexOf(String(r.list_id)) >= 0); }
        return rows;
      },
      users: USERS,
      loading_list_products: [], product_catalog: [], app_settings: [],
      stores: [], contacts: [], transport_orders: [], goods_transit: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  h.photos = (opts.photos || []).slice();
  h.w.llLists = []; h.w.llItems = []; h.w.llStoreLists = []; h.w.llStoreItems = [];
  h.w.llView = 'list'; h.w.llCurrentId = null; h.w.llDraft = null;
  h.w.llWarehouse = ''; h.w.llStoreTab = 'in'; h.w.llCollapsed = {};
  h.w.llPhotos = {}; h.w.llPhotoBusy = {};
  h.w.invalidateStoreCaches();
  h.toasts = [];
  const origToast = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: m, col: c }); return origToast(m, c); };
  h.w.pushToStores = function () { return Promise.resolve({ ok: true, data: {} }); };
  h.w.pushToAll = function () { h.pushAll++; return Promise.resolve({ ok: true, data: {} }); };
  h.w.sendEmail = function (to, subj, html) {
    h.mails.push({ to: Array.isArray(to) ? to : [to], subj: subj, html: html });
    return Promise.resolve({ ok: true, data: {} });
  };
  h.mails = []; h.pushAll = 0;
  /* Успешното качване връща ред от базата — sbPost не връща id, затова
     мокът го добавя вместо сървъра. */
  const realFetch = h.w.fetch;
  h.w.fetch = function (url, init) {
    const m = ((init || {}).method || 'GET').toUpperCase();
    const p = realFetch(url, init);
    if (m === 'POST' && /loading_list_photos/.test(String(url))) {
      return p.then(function (r) {
        if (!r.ok) return r;
        let b = null;
        try { b = JSON.parse(init.body); } catch (e) { b = null; }
        (Array.isArray(b) ? b : [b]).forEach(function (row, k) {
          h.photos.push(Object.assign({ id: 'new' + (h.photos.length + k) }, row,
            { uploaded_at: '2026-09-25T09:00:00.000Z' }));
        });
        return r;
      });
    }
    return p;
  };
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
const card = (h, id) => h.doc.getElementById('ll-card-' + id);
const strips = (root, stage) => Array.from(root.querySelectorAll('[data-ll-strip="' + stage + '"]'));
const thumbs = root => Array.from(root.querySelectorAll('[data-ll-photo]'));
const listPatches = h => h.calls.patch.filter(p => p.table === 'loading_lists');
const photoPosts = h => h.calls.post.filter(p => p.table === 'loading_list_photos');

(async function () {

  section('а) „Изпрати" с 0 снимки — отказ с ясен текст');
  {
    const h = env(WAREHOUSE, { lists: [list_({})], items: [item_({})], photos: [] });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    const b = btn(mod(h), '📤 Изпрати към обектите');
    if (ok('бутонът съществува', !!b, mod(h).textContent.slice(0, 250))) {
      realClick(h.w, b);
      await ticks(); await ticks();
      ok('листът НЕ е изпратен', listPatches(h).length === 0,
        JSON.stringify(h.calls.patch.map(p => p.table)));
      ok('червен toast с броя', h.toasts.some(t =>
        /поне 2 снимки/.test(String(t.msg)) && /качени са 0/.test(String(t.msg)) &&
        t.col === '#dc2626'), JSON.stringify(h.toasts));
      /* Отказът е ПРЕДИ питането за артикулите — иначе човек потвърждава
         нещо, което така или иначе няма да стане. */
      ok('и нито един confirm не е показан', h.calls.confirm.length === 0,
        JSON.stringify(h.calls.confirm));
    }
  }

  section('а) С ЕДНА снимка — пак отказ (границата е точно на 2)');
  {
    const h = env(WAREHOUSE, { lists: [list_({})], items: [item_({})],
                               photos: [photo_({ id: 'p1' })] });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    realClick(h.w, btn(mod(h), '📤 Изпрати към обектите'));
    await ticks(); await ticks();
    ok('пак не е изпратен', listPatches(h).length === 0,
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('и текстът брои правилно', h.toasts.some(t => /качени са 1/.test(String(t.msg))),
      JSON.stringify(h.toasts));
  }

  section('а) Снимките при ПОЛУЧАВАНЕ не се броят за гейта');
  {
    /* Гейтът пита за stage='sent'. Брои ли всичко, лист с три снимки от
       обектите и НУЛА от склада би тръгнал — тоест точно доказателството,
       заради което гейтът съществува, би липсвало. */
    const h = env(WAREHOUSE, { lists: [list_({})], items: [item_({})], photos: [
      photo_({ id: 'p1' }),
      photo_({ id: 'r1', stage: 'received', store_name: 'Петрич' }),
      photo_({ id: 'r2', stage: 'received', store_name: 'Петрич' }),
      photo_({ id: 'r3', stage: 'received', store_name: 'Гоце Делчев' })
    ] });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llSendList('L1');
    await ticks(); await ticks();
    ok('четири снимки общо, но само една при натоварване → отказ',
      listPatches(h).length === 0, JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('и броячът казва 1, не 4',
      h.toasts.some(t => /качени са 1/.test(String(t.msg))), JSON.stringify(h.toasts));
  }

  section('а) С ДВЕ снимки — минава');
  {
    const h = env(WAREHOUSE, { lists: [list_({})], items: [item_({})],
      photos: [photo_({ id: 'p1' }), photo_({ id: 'p2', path: 'https://cdn.test/b.jpg' })] });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    realClick(h.w, btn(mod(h), '📤 Изпрати към обектите'));
    await ticks(); await ticks(); await ticks();
    const lp = listPatches(h);
    ok('листът Е изпратен', lp.length === 1, JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('със status:sent и sent_at',
      lp.length === 1 && lp[0].body.status === 'sent' && !!lp[0].body.sent_at,
      JSON.stringify(lp[0] && lp[0].body));
    ok('нула откази в toast-овете',
      !h.toasts.some(t => /поне 2 снимки/.test(String(t.msg))), JSON.stringify(h.toasts));
  }

  section('а) Гейтът е ВЪТРЕ в llSendList, не в бутона');
  {
    /* Извикване наум, без да се минава през рендера. */
    const h = env(WAREHOUSE, { lists: [list_({})], items: [item_({})], photos: [] });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llSendList('L1');
    await ticks(); await ticks();
    ok('извикването наум също не изпраща', listPatches(h).length === 0,
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('със същото обяснение', h.toasts.some(t => /поне 2 снимки/.test(String(t.msg))),
      JSON.stringify(h.toasts));
  }

  section('б) Обектът качва СВОЯ снимка при получаване');
  {
    const L = list_({ status: 'sent', sent_at: '2026-09-25T08:00:00.000Z' });
    const h = env(PETRICH, { lists: [L], items: [item_({})],
      photos: [photo_({ id: 'p1' }), photo_({ id: 'p2', path: 'https://cdn.test/b.jpg' })] });
    h.w.loadLoadingLists();
    await ticks(); await ticks(); await ticks();

    const c = card(h, 'L1');
    if (ok('картата е на екрана', !!c, mod(h).textContent.slice(0, 250))) {
      ok('вижда лентата „при натоварване"', strips(c, 'sent').length === 1, c.textContent.slice(0, 400));
      ok('с двете снимки на склада', thumbs(strips(c, 'sent')[0]).length === 2,
        String(thumbs(strips(c, 'sent')[0]).length));
      ok('и своя лента „при получаване"', strips(c, 'received').length === 1);
      ok('която още е празна', thumbs(strips(c, 'received')[0]).length === 0);
      ok('но има бутон за добавяне',
        !!strips(c, 'received')[0].querySelector('input[type=file]'));
    }

    await h.w.llUploadPhotos(fakeInput('L1', 'received', 'Петрич', [fakeFile()]));
    await ticks(); await ticks();

    const pp = photoPosts(h);
    if (ok('точно един запис в loading_list_photos', pp.length === 1,
      JSON.stringify(h.calls.post.map(p => p.table)))) {
      const b = Array.isArray(pp[0].body) ? pp[0].body[0] : pp[0].body;
      ok('stage:received', b.stage === 'received', JSON.stringify(b.stage));
      ok('store_name е НЕГОВИЯТ обект, не празно', b.store_name === 'Петрич',
        JSON.stringify(b.store_name));
      ok('list_id е на листа', b.list_id === 'L1', JSON.stringify(b.list_id));
      ok('uploaded_by е качилият', b.uploaded_by === 'Управител Петрич',
        JSON.stringify(b.uploaded_by));
      ok('path е пълен публичен URL', /\/storage\/v1\/object\/public\//.test(String(b.path)),
        JSON.stringify(b.path));
      ok('и е под префикса на листа', /loading-lists\/L1\//.test(String(b.path)),
        JSON.stringify(b.path));
    }
    /* Редът се пише СЛЕД качването — първо storage, после базата. */
    const storagePost = h.calls.post.findIndex(p => /storage\/v1\/object/.test(String(p.url)));
    const rowPost = h.calls.post.findIndex(p => p.table === 'loading_list_photos');
    ok('файлът отива в storage ПРЕДИ реда в базата',
      storagePost >= 0 && storagePost < rowPost, storagePost + ' / ' + rowPost);
    ok('зелен toast', h.toasts.some(t => /снимка е добавена/.test(String(t.msg))),
      JSON.stringify(h.toasts));
    ok('и вече се вижда в лентата',
      thumbs(strips(card(h, 'L1'), 'received')[0]).length === 1,
      String(thumbs(strips(card(h, 'L1'), 'received')[0]).length));
  }

  section('б) Чуждата снимка при получаване НЕ се вижда');
  {
    const L = list_({ status: 'sent', sent_at: 'x' });
    const items = [item_({ id: 'i1', store_name: 'Петрич' }),
                   item_({ id: 'i2', position: 2, store_name: 'Гоце Делчев' })];
    const photos = [
      photo_({ id: 'p1' }), photo_({ id: 'p2', path: 'https://cdn.test/b.jpg' }),
      photo_({ id: 'r1', stage: 'received', store_name: 'Петрич',
               path: 'https://cdn.test/PETRICH.jpg', uploaded_by: 'Управител Петрич' }),
      photo_({ id: 'r2', stage: 'received', store_name: 'Гоце Делчев',
               path: 'https://cdn.test/GD.jpg', uploaded_by: 'Управител ГД' })
    ];
    const p = env(PETRICH, { lists: [L], items: items, photos: photos });
    p.w.loadLoadingLists();
    await ticks(); await ticks(); await ticks();
    const pc = card(p, 'L1');
    ok('Петрич вижда СВОЯТА снимка', pc.innerHTML.indexOf('PETRICH.jpg') >= 0,
      pc.textContent.slice(0, 300));
    ok('и НЕ вижда тази на Гоце Делчев', pc.innerHTML.indexOf('GD.jpg') < 0);

    const g = env(GD, { lists: [L], items: items, photos: photos });
    g.w.loadLoadingLists();
    await ticks(); await ticks(); await ticks();
    const gc = card(g, 'L1');
    ok('Гоце Делчев вижда СВОЯТА', gc.innerHTML.indexOf('GD.jpg') >= 0);
    ok('и НЕ вижда тази на Петрич', gc.innerHTML.indexOf('PETRICH.jpg') < 0);
  }

  section('в) Снимката при изпращане се вижда от ВСИЧКИ получатели');
  {
    const L = list_({ status: 'sent', sent_at: 'x' });
    const items = [item_({ id: 'i1', store_name: 'Петрич' }),
                   item_({ id: 'i2', position: 2, store_name: 'Гоце Делчев' })];
    const photos = [photo_({ id: 'p1', path: 'https://cdn.test/TRUCK.jpg' }),
                    photo_({ id: 'p2', path: 'https://cdn.test/TRUCK2.jpg' })];
    for (const [who, user] of [['Петрич', PETRICH], ['Гоце Делчев', GD]]) {
      const h = env(user, { lists: [L], items: items, photos: photos });
      h.w.loadLoadingLists();
      await ticks(); await ticks(); await ticks();
      const c = card(h, 'L1');
      ok(who + ' вижда и двете снимки на натоварването',
        c.innerHTML.indexOf('TRUCK.jpg') >= 0 && c.innerHTML.indexOf('TRUCK2.jpg') >= 0,
        c.textContent.slice(0, 300));
      ok(who + ': лентата казва кой е снимал',
        c.textContent.indexOf('От изпращача при натоварване') >= 0 &&
        c.textContent.indexOf(WH) >= 0, c.textContent.slice(0, 300));
      ok(who + ': чуждите снимки НЕ се трият от него',
        !strips(c, 'sent')[0].querySelector('button'),
        strips(c, 'sent')[0].innerHTML.slice(0, 200));
      h.close();
    }
  }

  section('г) Провалено качване — червен toast, нищо не се губи тихо');
  {
    const L = list_({ status: 'sent', sent_at: 'x' });
    const h = env(PETRICH, { lists: [L], items: [item_({})], photos: [],
                             fail: { POST: /storage\/v1\/object/ } });
    h.w.loadLoadingLists();
    await ticks(); await ticks(); await ticks();
    await h.w.llUploadPhotos(fakeInput('L1', 'received', 'Петрич', [fakeFile('a.jpg'), fakeFile('b.jpg')]));
    await ticks(); await ticks();

    ok('НУЛА реда в базата — редът не се пише преди файла',
      photoPosts(h).length === 0, JSON.stringify(h.calls.post.map(p => p.table)));
    ok('червен toast с броя', h.toasts.some(t =>
      /2 снимки НЕ се качиха/.test(String(t.msg)) && t.col === '#dc2626'),
      JSON.stringify(h.toasts));
    ok('и НЕ казва, че са добавени',
      !h.toasts.some(t => /добавен/.test(String(t.msg))), JSON.stringify(h.toasts));
    ok('лентата остава празна', thumbs(strips(card(h, 'L1'), 'received')[0]).length === 0);
    ok('индикаторът „⏳" е изчистен',
      !card(h, 'L1').querySelector('[data-ll-photo-busy]'),
      card(h, 'L1').innerHTML.slice(0, 200));
  }

  section('д) Права за триене');
  {
    const mine = photo_({ id: 'r1', stage: 'received', store_name: 'Петрич',
                          uploaded_by: 'Управител Петрич' });
    const others = photo_({ id: 'r2', stage: 'received', store_name: 'Петрич',
                            uploaded_by: 'Някой друг' });
    const open = list_({ status: 'sent' });
    const closed = list_({ status: 'done' });

    const h = env(PETRICH, { lists: [open], items: [item_({})], photos: [mine, others] });
    ok('качилият може, докато листът е отворен', h.w.llCanDeletePhoto(open, mine) === true);
    ok('чуждата — не', h.w.llCanDeletePhoto(open, others) === false);
    ok('и след приключване — не', h.w.llCanDeletePhoto(closed, mine) === false);
    ok('нито при „частично приключен"',
      h.w.llCanDeletePhoto(list_({ status: 'partial' }), mine) === false);

    const a = env(ADMIN, { lists: [open], items: [item_({})], photos: [mine, others] });
    ok('admin може чуждата', a.w.llCanDeletePhoto(open, others) === true);
    ok('и по приключен лист', a.w.llCanDeletePhoto(closed, others) === true);

    /* Бутонът следва правото, а правото пази и при извикване наум. */
    h.w.loadLoadingLists();
    await ticks(); await ticks(); await ticks();
    const rec = strips(card(h, 'L1'), 'received')[0];
    ok('своята има бутон „✕"',
      !!rec.querySelector('[data-ll-photo="r1"] button'), rec.innerHTML.slice(0, 300));
    ok('чуждата няма', !rec.querySelector('[data-ll-photo="r2"] button'));
    await h.w.llDeletePhoto('L1', 'r2');
    await ticks();
    ok('и извикването наум по чуждата не трие нищо',
      h.calls.del.length === 0, JSON.stringify(h.calls.del));
    ok('с обяснение', h.toasts.some(t => /Нямаш права/.test(String(t.msg))),
      JSON.stringify(h.toasts));

    await h.w.llDeletePhoto('L1', 'r1');
    await ticks(); await ticks();
    ok('своята се трие', h.calls.del.some(u => /id=eq\.r1/.test(String(u))),
      JSON.stringify(h.calls.del));
  }

  section('е) Прегледът на склада: двата края, по обект');
  {
    const L = list_({ status: 'sent', sent_at: 'x' });
    const items = [item_({ id: 'i1', store_name: 'Петрич' }),
                   item_({ id: 'i2', position: 2, store_name: 'Гоце Делчев' })];
    const photos = [
      photo_({ id: 'p1', path: 'https://cdn.test/TRUCK.jpg' }),
      photo_({ id: 'r1', stage: 'received', store_name: 'Петрич', path: 'https://cdn.test/P.jpg' }),
      photo_({ id: 'r2', stage: 'received', store_name: 'Гоце Делчев', path: 'https://cdn.test/G.jpg' })
    ];
    const h = env(WAREHOUSE, { lists: [L], items: items, photos: photos });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    const w = mod(h);
    ok('вижда снимката при натоварване', w.innerHTML.indexOf('TRUCK.jpg') >= 0);
    ok('и ДВАТА обекта при получаване',
      w.innerHTML.indexOf('P.jpg') >= 0 && w.innerHTML.indexOf('G.jpg') >= 0);
    ok('групирани по обект, не смесени', strips(w, 'received').length === 2,
      String(strips(w, 'received').length));
    ok('всяка лента носи името на обекта',
      strips(w, 'received').map(x => x.textContent).join('|').indexOf('Петрич') >= 0 &&
      strips(w, 'received').map(x => x.textContent).join('|').indexOf('Гоце Делчев') >= 0);
    ok('лентата за натоварване казва минимума',
      w.textContent.indexOf('поне 2 са задължителни') >= 0, w.textContent.slice(0, 600));
    /* Складът качва при натоварване САМО докато е чернова — след изпращане
       снимката вече е доказателство по тръгнал курс. */
    ok('след изпращане няма бутон за добавяне при натоварване',
      !strips(w, 'sent')[0].querySelector('input[type=file]'));

    const d = env(WAREHOUSE, { lists: [list_({})], items: items, photos: [] });
    d.w.loadLoadingLists();
    await ticks(); await ticks();
    d.w.llOpenView('L1');
    ok('а в чернова — има', !!strips(mod(d), 'sent')[0].querySelector('input[type=file]'));
  }

  section('ж) Писмото носи ЛИНК, не приложени снимки');
  {
    const L = list_({ status: 'draft' });
    const h = env(WAREHOUSE, { lists: [L], items: [item_({})],
      photos: [photo_({ id: 'p1' }), photo_({ id: 'p2', path: 'https://cdn.test/b.jpg' })] });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    realClick(h.w, btn(mod(h), '📤 Изпрати към обектите'));
    await ticks(); await ticks(); await ticks(); await ticks();

    if (ok('писмото тръгна', h.mails.length >= 1, JSON.stringify(h.mails.map(m => m.subj)))) {
      const html = h.mails[0].html;
      ok('споменава броя снимки', /2 снимки на натоварването/.test(html), html.slice(-500));
      ok('и подканва да се сравнят', /сравни/.test(html), html.slice(-400));
      /* Самите снимки НЕ влизат в писмото — две по 250 KB върху PDF-а правят
         писмо от около мегабайт към всеки обект. */
      ok('но НЕ носи самите снимки', html.indexOf('cdn.test') < 0, html.slice(-400));
    }

    /* Без снимки няма и ред за тях — но този път не се стига дотам, защото
       листът не тръгва. Проверката е на самия рендер. */
    const noPh = h.w.llSentHtmlFor(list_({}), 'Петрич', [item_({})], 0);
    ok('при нула снимки редът липсва', noPh.indexOf('снимки на натоварването') < 0);
    const onePh = h.w.llSentHtmlFor(list_({}), 'Петрич', [item_({})], 1);
    ok('една снимка е в единствено число', /1 снимка на натоварването/.test(onePh),
      onePh.slice(-400));
  }

  report();
})();
