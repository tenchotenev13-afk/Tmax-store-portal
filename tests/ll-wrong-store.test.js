/* Товарни листи — „🔀 За друг обект" (17.11.2026, сесия ll-wrong-store).

   Повод: 17.11 Габрово получи в листа от 12.11 (Търговище) палет с входяща
   стока за друг обект — дотук само свободен коментар, складът не научаваше.

   Заковано тук (истински клик по inline onclick):
     а) обектът: „🔀 За друг обект" → прозорец; без обект → отказ, без
        коментар → отказ (нула PATCH); собственият обект го няма в списъка;
     б) успешно маркиране → PATCH с wrong_store / _by / _at / _note, редът е
        обработен (без бутони „Получено"), „🏁 Приключи приемането" става
        активен, значка „🔀 1 за друг обект"; известие — push до склада и до
        обекта-получател, имейл до склада + регионалния + обекта-получател;
     в) „↩ Отмени" → PATCH с филтър wrong_store_done_at=is.null, полетата
        null; при уреден случай бутонът го няма;
     г) „🏁 Приключи приемането" → листът partial; писмото при затваряне
        съдържа реда „🔀 за <обект>" и „чака склада";
     д) складът (затворен лист): значка в заглавието, „✅ Уредено" без
        коментар → отказ, с коментар → PATCH wrong_store_done_* с филтър
        wrong_store=not.is.null&wrong_store_done_at=is.null, известие до
        маркиралия обект;
     е) провалено известие → видим toast, записът остава;
     ж) банерът в notifications.js не брои реда като чакащ.

   МУТАЦИИ (пуснати 17.11.2026 — всичките убити):
     M1  llHandled без wrong_store → пада б) (бутонът остава неактивен) и г)
     M2  llAutoDoneList: want без r.wrong_store (done вместо partial) → пада г)
     M3  llWrongSettle без проверката за празен коментар → пада д)
     M4  llWrongUndo без филтъра wrong_store_done_at=is.null → пада в)
     M5  llClosedHtmlFor без клона за wrong_store → пада г)
     M6  llNotifyWrongStore без имейлите на обекта-получател → пада б)
   (M1 → 6 ❌, M2 → 2, M3 → 2, M4 → 2, M5 → 2, M6 → 1.)

   Пускане:  node tests/ll-wrong-store.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';

const STORE = { email: 'gabrovo@temax.bg', display_name: 'Управител Габрово',
                role: 'manager', store_name: 'Габрово', assigned_stores: [], is_regional: false };
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [], is_regional: false };

const L_SENT = { id: 'L1', warehouse: WH, list_date: '2026-11-12', status: 'sent',
                 executed_by: 'Иван', comment: '', created_by: 'Склад Търговище',
                 created_at: '2026-11-12T06:00:00.000Z',
                 sent_at: '2026-11-12T07:00:00.000Z', done_at: null };
const L_PART = Object.assign({}, L_SENT, { status: 'partial', done_at: '2026-11-17T12:00:00.000Z' });

function it_(o) {
  return Object.assign({
    id: 'i-x', list_id: 'L1', position: 1, kind: 'pallet',
    pallet_no: 1, pallet_total: 2, purchase_doc: null, clears_doc: null,
    store_name: 'Габрово', warehouse_comment: null, store_comment: null,
    partial: false, received: false, received_by: null, received_at: null,
    missing: false, missing_by: null, missing_at: null,
    added_by_store: false, approval_status: null, approval_by: null,
    approval_at: null, approval_comment: null,
    wrong_store: null, wrong_store_by: null, wrong_store_at: null, wrong_store_note: null,
    wrong_store_done_by: null, wrong_store_done_at: null, wrong_store_done_note: null,
    created_at: '2026-11-12T06:00:00.000Z'
  }, o);
}
const REC = { received: true, received_by: 'Управител Габрово', received_at: '2026-11-17T09:00:00.000Z' };
const WRONG = { wrong_store: 'Шумен', wrong_store_by: 'Управител Габрово',
                wrong_store_at: '2026-11-17T09:10:00.000Z', wrong_store_note: 'палет входяща с адрес Шумен' };
const DONE = { wrong_store_done_by: 'Склад Търговище', wrong_store_done_at: '2026-11-17T11:00:00.000Z',
               wrong_store_done_note: 'трансфер 12345 към Шумен' };

const USERS = [
  { email: 'gabrovo@temax.bg', store_name: 'Габрово', active: true, is_regional: false, assigned_stores: [] },
  { email: 'shumen@temax.bg', store_name: 'Шумен', active: true, is_regional: false, assigned_stores: [] },
  { email: 'sevlievo@temax.bg', store_name: 'Севлиево', active: true, is_regional: false, assigned_stores: [] },
  { email: 'sklad.tg@temax.bg', store_name: WH, active: true, is_regional: false, assigned_stores: [] },
  { email: 'region.sever@temax.bg', store_name: 'Централен офис', active: true,
    is_regional: true, assigned_stores: ['Габрово'] }
];

/* Филтрите от URL-а на PATCH-а, които кодът ползва като „условие". */
function patchMatches(url, row) {
  if (/wrong_store_done_at=is\.null/.test(url) && row.wrong_store_done_at) return false;
  if (/wrong_store=not\.is\.null/.test(url) && !row.wrong_store) return false;
  if (/approval_status=eq\.pending/.test(url) && row.approval_status !== 'pending') return false;
  return true;
}

function env(user, items, lists, opts) {
  opts = opts || {};
  let ref = null;
  const applyPatches = (rows, table) => {
    if (!ref) return rows;
    ref.calls.patch.filter(p => p.table === table).forEach(p => {
      const m = /id=eq\.([^&]*)/.exec(p.url);
      if (!m) return;
      const row = rows.find(r => String(r.id) === decodeURIComponent(m[1]));
      if (!row || !patchMatches(p.url, row)) return;
      Object.assign(row, p.body);
    });
    return rows;
  };
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js',
              'push.js', 'email.js', 'loading.js', 'notifications.js'],
    user: user,
    confirm: true,
    data: {
      loading_list_items: function (url) {
        let rows = applyPatches(items.map(r => Object.assign({}, r)), 'loading_list_items');
        const st = /store_name=eq\.([^&]*)/.exec(url);
        if (st) rows = rows.filter(r => String(r.store_name) === decodeURIComponent(st[1]));
        const li = /list_id=eq\.([^&]*)/.exec(url);
        if (li) rows = rows.filter(r => String(r.list_id) === decodeURIComponent(li[1]));
        return rows;
      },
      loading_lists: function (url) {
        let rows = applyPatches(lists.map(r => Object.assign({}, r)), 'loading_lists');
        const ids = /id=in\.\(([^)]*)\)/.exec(url);
        if (ids) { const s = ids[1].split(','); rows = rows.filter(r => s.indexOf(String(r.id)) >= 0); }
        const st = /status=in\.\(([^)]*)\)/.exec(url);
        if (st) { const s = st[1].split(','); rows = rows.filter(r => s.indexOf(r.status) >= 0); }
        return rows;
      },
      users: function (url) {
        let rows = USERS.map(r => Object.assign({}, r));
        if (/active=eq\.true/.test(url)) rows = rows.filter(r => r.active);
        if (/is_regional=eq\.true/.test(url)) rows = rows.filter(r => r.is_regional);
        const inm = /store_name=in\.\(([^)]*)\)/.exec(url);
        if (inm) {
          const want = inm[1].split(',').map(decodeURIComponent);
          rows = rows.filter(r => want.indexOf(r.store_name) >= 0);
        }
        return rows;
      },
      app_settings: [],
      loading_list_products: [], loading_list_photos: [], product_catalog: [],
      stores: [], contacts: [], transport_orders: [], client_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: [], goods_transit: []
    }
  });
  ref = h;
  h.toasts = [];
  const origToast = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: m, col: c }); return origToast(m, c); };
  h.pushes = []; h.mails = [];
  h.w.pushToStores = function (stores, title, message) {
    h.pushes.push({ stores: stores, title: title, message: message });
    return Promise.resolve({ ok: !opts.failNotify, status: opts.failNotify ? 500 : 200, data: {} });
  };
  h.w.pushToAll = function () { return Promise.resolve({ ok: true, data: {} }); };
  h.w.sendEmail = function (to, subject, html) {
    h.mails.push({ to: Array.isArray(to) ? to : [to], subject: subject, html: html });
    return Promise.resolve(opts.failNotify
      ? { ok: false, status: 500, data: { message: 'Resend 500' } }
      : { ok: true, status: 200, data: {} });
  };
  /* llPatchItemWhere чете броя засегнати редове от Content-Range — броим го
     честно по условието във филтъра срещу данните. */
  const origFetch = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const isCounted = (init.method || '').toUpperCase() === 'PATCH' &&
      /wrong_store_done_at=is\.null|wrong_store=not\.is\.null|approval_status=eq\.pending/.test(url);
    let n = 1;
    if (isCounted) {
      const m = /id=eq\.([^&]*)/.exec(url);
      const cur = applyPatches(items.map(r => Object.assign({}, r)), 'loading_list_items')
        .find(r => m && String(r.id) === decodeURIComponent(m[1]));
      n = cur && patchMatches(url, cur) ? 1 : 0;
    }
    const p = origFetch(url, init);
    if (isCounted) {
      return p.then(r => r.ok ? Object.assign({}, r, {
        headers: { get: k => (/^content-range$/i.test(k) ? '*/' + n : null) }
      }) : r);
    }
    return p;
  };
  return h;
}

const card = (doc, id) => doc.getElementById('ll-card-' + id);
const patchesTo = (h, table) => h.calls.patch.filter(p => p.table === table);
const settle = async () => { for (let i = 0; i < 10; i++) await ticks(); };
const rowOf = (doc, id) => {
  const b = doc.querySelector('[data-id="' + id + '"]');
  return b ? b.closest('tr') : null;
};

(async function () {

  section('а) Маркиране без обект / без коментар — отказ, нула PATCH');
  {
    const h = env(STORE, [it_(Object.assign({ id: 'i1' }, REC)), it_({ id: 'i2', position: 2, pallet_no: 2 })], [L_SENT]);
    h.w.loadLoadingLists();
    await settle();
    const c = card(h.doc, 'L1');
    const fin0 = c && btn(c, '🏁 Приключи приемането');
    ok('преди маркирането „🏁 Приключи приемането" е неактивен', !!fin0 && fin0.disabled === true);
    const wb = c && btn(c, '🔀 За друг обект');
    if (ok('бутонът „🔀 За друг обект" е на неотметнатия ред', !!wb, c && c.textContent.slice(0, 400))) {
      ok('само на неотметнатия (един бутон)', c.querySelectorAll('button[onclick^="llWrongOpenModal"]').length === 1);
      realClick(h.w, wb);
      await settle();
      const m = h.doc.getElementById('ll-wrong-modal');
      if (ok('прозорецът се отвори (не prompt)', !!m)) {
        const opts = Array.from(h.doc.getElementById('ll-wrong-store').options).map(o => o.value);
        ok('Шумен е в списъка', opts.indexOf('Шумен') >= 0, JSON.stringify(opts));
        ok('собственият обект (Габрово) го НЯМА', opts.indexOf('Габрово') < 0, JSON.stringify(opts));
        h.doc.getElementById('ll-wrong-note').value = 'палет входяща с адрес Шумен';
        realClick(h.w, h.doc.getElementById('ll-wrong-submit'));
        await settle();
        ok('без обект — нула PATCH', patchesTo(h, 'loading_list_items').length === 0);
        ok('без обект — toast', h.toasts.some(t => /Избери за кой обект/.test(t.msg)), JSON.stringify(h.toasts));
        h.doc.getElementById('ll-wrong-store').value = 'Шумен';
        h.doc.getElementById('ll-wrong-note').value = '   ';
        realClick(h.w, h.doc.getElementById('ll-wrong-submit'));
        await settle();
        ok('без коментар — нула PATCH', patchesTo(h, 'loading_list_items').length === 0);
        ok('без коментар — toast', h.toasts.some(t => /коментарът е задължителен/.test(t.msg)));
        ok('прозорецът остава отворен', !!h.doc.getElementById('ll-wrong-modal'));
      }
    }
    h.close();
  }

  let hB;
  section('б) Успешно маркиране — PATCH, редът е обработен, „🏁" активен, известия');
  {
    const h = hB = env(STORE, [it_(Object.assign({ id: 'i1' }, REC)), it_({ id: 'i2', position: 2, pallet_no: 2 })], [L_SENT]);
    h.w.loadLoadingLists();
    await settle();
    realClick(h.w, btn(card(h.doc, 'L1'), '🔀 За друг обект'));
    await settle();
    h.doc.getElementById('ll-wrong-store').value = 'Шумен';
    h.doc.getElementById('ll-wrong-note').value = 'палет входяща с адрес Шумен';
    realClick(h.w, h.doc.getElementById('ll-wrong-submit'));
    await settle();
    const ip = patchesTo(h, 'loading_list_items');
    if (ok('точно един PATCH по реда', ip.length === 1, JSON.stringify(ip.map(p => p.body)))) {
      const b = ip[0].body;
      ok('сочи i2', /id=eq\.i2/.test(ip[0].url), ip[0].url);
      ok('wrong_store = Шумен', b.wrong_store === 'Шумен');
      ok('wrong_store_by = актьорът', b.wrong_store_by === 'Управител Габрово', b.wrong_store_by);
      ok('wrong_store_at е ISO', /^\d{4}-\d{2}-\d{2}T/.test(b.wrong_store_at || ''));
      ok('wrong_store_note', b.wrong_store_note === 'палет входяща с адрес Шумен');
      ok('НЕ received и НЕ missing', !('received' in b) && !('missing' in b), JSON.stringify(b));
    }
    ok('прозорецът се затвори', !h.doc.getElementById('ll-wrong-modal'));
    const c = card(h.doc, 'L1');
    ok('редът носи маркера „чака склада"', !!c.querySelector('[data-ll-wrong-badge="open"]') &&
      /🔀 за Шумен — чака склада/.test(c.textContent), c.textContent.slice(0, 500));
    ok('значката „🔀 1 за друг обект" в заглавието', !!c.querySelector('[data-ll-wrong-wait="1"]'));
    ok('на реда вече няма „✅ Получено"', c.querySelectorAll('button[onclick^="llMarkReceived"]').length === 0);
    const fin = btn(c, '🏁 Приключи приемането');
    ok('„🏁 Приключи приемането" е активен', !!fin && fin.disabled === false, fin && String(fin.disabled));
    ok('няма PATCH по goods_transit (документът остава чакащ)', patchesTo(h, 'goods_transit').length === 0);
    ok('листът НЕ се затваря сам при маркирането', patchesTo(h, 'loading_lists').length === 0);
    ok('броячът в заглавието казва „за друг обект 1"', /за друг обект 1 \/ 2/.test(c.textContent), c.textContent.slice(0, 200));
    /* Взаимно изключване: „Получено" / „Неполучено" от конзолата на вече маркиран ред. */
    const before = patchesTo(h, 'loading_list_items').length;
    h.w.llMarkReceived('i2');
    h.w.llMarkMissing('i2');
    await settle();
    ok('llMarkReceived / llMarkMissing на маркиран ред — нула PATCH',
      patchesTo(h, 'loading_list_items').length === before);
    ok('push до склада', h.pushes.some(p => p.stores.join() === WH && /Шумен/.test(p.title)), JSON.stringify(h.pushes));
    ok('push до обекта, за който е стоката', h.pushes.some(p => p.stores.join() === 'Шумен'), JSON.stringify(h.pushes));
    const mail = h.mails.find(m => /друг обект/.test(m.subject));
    if (ok('имейл тръгна', !!mail, JSON.stringify(h.mails.map(m => m.subject)))) {
      ok('до склада', mail.to.indexOf('sklad.tg@temax.bg') >= 0, mail.to.join());
      ok('до регионалния на обекта', mail.to.indexOf('region.sever@temax.bg') >= 0, mail.to.join());
      ok('до обекта, за който е стоката', mail.to.indexOf('shumen@temax.bg') >= 0, mail.to.join());
      ok('НЕ до чужд обект', mail.to.indexOf('sevlievo@temax.bg') < 0);
      ok('писмото носи коментара', mail.html.indexOf('палет входяща с адрес Шумен') >= 0);
    }
    ok('без toast за провал', !h.toasts.some(t => /не тръгна/.test(t.msg)), JSON.stringify(h.toasts));
  }

  section('г) „🏁 Приключи приемането" → partial; писмото съдържа реда');
  {
    const h = hB;
    realClick(h.w, btn(card(h.doc, 'L1'), '🏁 Приключи приемането'));
    await settle();
    const lp = patchesTo(h, 'loading_lists');
    ok('status:partial', lp.length === 1 && lp[0].body.status === 'partial', JSON.stringify(lp.map(p => p.body)));
    ok('toast-ът НЕ твърди липси', h.toasts.some(t => /с товар за друг обект/.test(t.msg)) &&
      !h.toasts.some(t => /с липси/.test(t.msg)), JSON.stringify(h.toasts.map(t => t.msg)));
    const m = h.mails.filter(x => x.to.indexOf('sklad.tg@temax.bg') >= 0 && /приключен|друг обект ·/.test(x.subject) && !/Товар за друг обект:/.test(x.subject));
    if (ok('писмо при затваряне до склада', m.length === 1, JSON.stringify(h.mails.map(x => x.subject)))) {
      ok('редът „🔀 за Шумен"', /data-ll-mail-wrong-row="open"/.test(m[0].html) && m[0].html.indexOf('🔀 за Шумен') >= 0,
        m[0].html.slice(0, 800));
      ok('„чака склада"', m[0].html.indexOf('чака склада') >= 0);
      ok('броячът „🔀 1 за друг обект"', /data-ll-mail-wrong="1"/.test(m[0].html));
    }
    /* Уреден ред в писмото. */
    const html = h.w.llClosedHtmlFor(L_PART, [it_(Object.assign({ id: 'x' }, WRONG, DONE))]);
    ok('уреден ред в писмото — „уредено" + бележката', /data-ll-mail-wrong-row="done"/.test(html) &&
      html.indexOf('трансфер 12345 към Шумен') >= 0);
    h.close();
  }

  section('в) „↩ Отмени" — само докато складът не е уредил');
  {
    const h = env(STORE, [it_(Object.assign({ id: 'i1' }, REC)), it_(Object.assign({ id: 'i2', position: 2, pallet_no: 2 }, WRONG))], [L_SENT]);
    h.w.loadLoadingLists();
    await settle();
    const c = card(h.doc, 'L1');
    const und = c.querySelector('button[onclick^="llWrongUndo"]');
    if (ok('има „↩ Отмени"', !!und, c.textContent.slice(0, 400))) {
      realClick(h.w, und);
      await settle();
      const ip = patchesTo(h, 'loading_list_items');
      ok('един PATCH', ip.length === 1, JSON.stringify(ip.map(p => p.url)));
      ok('с филтър wrong_store_done_at=is.null', ip.length === 1 && /wrong_store_done_at=is\.null/.test(ip[0].url), ip[0] && ip[0].url);
      ok('полетата стават null', ip.length === 1 && ip[0].body.wrong_store === null &&
        ip[0].body.wrong_store_note === null && ip[0].body.wrong_store_by === null);
      const c2 = card(h.doc, 'L1');
      ok('редът пак има „🔀 За друг обект" и „✅ Получено"', !!btn(c2, '🔀 За друг обект') &&
        c2.querySelectorAll('button[onclick^="llMarkReceived"]').length === 1);
      ok('„🏁" пак е неактивен', btn(c2, '🏁 Приключи приемането').disabled === true);
    }
    h.close();

    /* Уреден случай — няма отмяна, маркерът казва „уредено". */
    const h2 = env(STORE, [it_(Object.assign({ id: 'i2' }, WRONG, DONE))], [L_PART]);
    h2.w.loadLoadingLists();
    await settle();
    h2.w.llToggleCard('L1');
    const c3 = card(h2.doc, 'L1');
    ok('маркер „уредено"', !!c3.querySelector('[data-ll-wrong-badge="done"]') && c3.textContent.indexOf('трансфер 12345') >= 0,
      c3.textContent.slice(0, 400));
    ok('без „↩ Отмени"', !c3.querySelector('button[onclick^="llWrongUndo"]'));
    ok('без значка в заглавието (уреденото не се брои)', !c3.querySelector('[data-ll-wrong-wait]'));
    /* Извикване от конзолата при уреден случай — нула PATCH. */
    await h2.w.llWrongUndo('i2');
    ok('llWrongUndo на уреден — нула PATCH', patchesTo(h2, 'loading_list_items').length === 0);
    h2.close();

    /* Състезание: складът е уредил, докато обектът гледа стария екран. */
    const items3 = [it_(Object.assign({ id: 'i2' }, WRONG, DONE))];
    const h3 = env(STORE, items3, [L_SENT]);
    h3.w.loadLoadingLists();
    await settle();
    const local = h3.w.llStoreItems.find(r => r.id === 'i2');
    local.wrong_store_done_at = null;   /* екранът е отпреди уреждането */
    h3.w.renderLoadingLists();
    const u3 = card(h3.doc, 'L1').querySelector('button[onclick^="llWrongUndo"]');
    realClick(h3.w, u3);
    await settle();
    ok('нула засегнати → toast „вече е уредил"', h3.toasts.some(t => /вече е уредил/.test(t.msg)), JSON.stringify(h3.toasts));
    h3.close();
  }

  section('д) Складът — значка и „✅ Уредено" на затворен лист');
  {
    const h = env(WAREHOUSE, [it_(Object.assign({ id: 'i1' }, REC)), it_(Object.assign({ id: 'i2', position: 2, pallet_no: 2 }, WRONG))], [L_PART]);
    h.w.loadLoadingLists();
    await settle();
    const wrapL = h.doc.getElementById('mod-loading');
    h.w.llSetStatusFilter('all');
    ok('значка в списъка на листите', !!h.doc.getElementById('mod-loading').querySelector('[data-ll-wrong-wait="1"]'),
      wrapL.textContent.slice(0, 400));
    h.w.llOpenView('L1');
    const wrap = h.doc.getElementById('mod-loading');
    ok('значката „🔀 1 за друг обект" в заглавието', !!wrap.querySelector('.pg-title [data-ll-wrong-wait="1"]'),
      wrap.textContent.slice(0, 300));
    ok('маркерът на реда', !!wrap.querySelector('[data-ll-wrong-badge="open"]'));
    ok('обобщението „По обекти" показва реда', !!wrap.querySelector('#ll-summary [data-ll-sum-wrong="1"]'));
    const sb = btn(wrap, '✅ Уредено');
    if (ok('бутонът „✅ Уредено" е там (затворен лист)', !!sb, wrap.textContent.slice(0, 600))) {
      realClick(h.w, sb);
      await settle();
      ok('без коментар — нула PATCH', patchesTo(h, 'loading_list_items').length === 0);
      ok('без коментар — toast', h.toasts.some(t => /задължителен/.test(t.msg)), JSON.stringify(h.toasts));
      const inp = h.doc.getElementById('ll-wsd-i2');
      const sb2 = btn(h.doc.getElementById('mod-loading'), '✅ Уредено');
      if (inp && sb2) {
        inp.value = 'трансфер 12345 към Шумен';
        realClick(h.w, sb2);
        await settle();
      }
      const ip = patchesTo(h, 'loading_list_items');
      if (ok('един PATCH', ip.length === 1, JSON.stringify(ip.map(p => p.url)))) {
        ok('филтър wrong_store=not.is.null&wrong_store_done_at=is.null',
          /wrong_store=not\.is\.null/.test(ip[0].url) && /wrong_store_done_at=is\.null/.test(ip[0].url), ip[0].url);
        ok('wrong_store_done_note', ip[0].body.wrong_store_done_note === 'трансфер 12345 към Шумен');
        ok('wrong_store_done_by', ip[0].body.wrong_store_done_by === 'Склад Търговище', ip[0].body.wrong_store_done_by);
        ok('wrong_store_done_at е ISO', /^\d{4}-\d{2}-\d{2}T/.test(ip[0].body.wrong_store_done_at || ''));
      }
      ok('статусът на листа не се бута', patchesTo(h, 'loading_lists').length === 0);
      ok('push до маркиралия обект', h.pushes.some(p => p.stores.join() === 'Габрово' && /Уреден/.test(p.title)), JSON.stringify(h.pushes));
      ok('имейл до маркиралия обект', h.mails.some(m => m.to.indexOf('gabrovo@temax.bg') >= 0 && /Уреден/.test(m.subject)));
      await settle();
      const w2 = h.doc.getElementById('mod-loading');
      ok('след презареждане — „уредено", без бутона', !!w2.querySelector('[data-ll-wrong-badge="done"]') && !btn(w2, '✅ Уредено'),
        w2.textContent.slice(0, 400));
    }
    h.close();

    /* Обектът НЕ вижда „✅ Уредено". */
    const hs = env(STORE, [it_(Object.assign({ id: 'i2' }, WRONG))], [L_SENT]);
    hs.w.loadLoadingLists();
    await settle();
    ok('обектът няма „✅ Уредено"', !btn(card(hs.doc, 'L1'), '✅ Уредено'));
    ok('и llWrongSettle от конзолата му отказва', (await hs.w.llWrongSettle('L1', 'i2')) === false &&
      patchesTo(hs, 'loading_list_items').length === 0);
    hs.close();
  }

  section('е) Провалено известие — видим toast, записът остава');
  {
    const h = env(STORE, [it_({ id: 'i2' })], [L_SENT], { failNotify: true });
    h.w.loadLoadingLists();
    await settle();
    realClick(h.w, btn(card(h.doc, 'L1'), '🔀 За друг обект'));
    await settle();
    h.doc.getElementById('ll-wrong-store').value = 'Шумен';
    h.doc.getElementById('ll-wrong-note').value = 'палет за Шумен';
    realClick(h.w, h.doc.getElementById('ll-wrong-submit'));
    await settle();
    ok('PATCH-ът мина', patchesTo(h, 'loading_list_items').length === 1);
    ok('toast „известието … не тръгна"', h.toasts.some(t => /не тръгна/.test(t.msg)), JSON.stringify(h.toasts));
    ok('без PATCH, който отменя', patchesTo(h, 'loading_list_items').every(p => p.body.wrong_store === 'Шумен'));
    h.close();
  }

  section('ж) Банерът „за получаване" не брои реда като чакащ');
  {
    const h = env(STORE, [it_({ id: 'i2' })], [L_SENT]);
    ok('заявката в notifLoadingListsPending е с wrong_store=is.null',
      /wrong_store=is\.null/.test(h.w.notifLoadingListsPending.toString()));
    ok('llStoreWaitRows не брои маркирания ред',
      (h.w.llStoreItems = [it_(Object.assign({ id: 'i2' }, WRONG))], h.w.llStoreLists = [L_SENT], h.w.llStoreWaitRows().length === 0));
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
