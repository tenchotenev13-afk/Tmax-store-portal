/* Товарни листи — извънреден ред, който ЧАКА ОДОБРЕНИЕ, НЕ спира приемането.

   Решение на Тенчо 13.11.2026 (заменя гейта от Пакет Г2): ред, добавен от
   обекта с „➕ Добави ред", е received:true и се брои като получен. Обектът
   приключва листа си, листът се затваря (done / partial), а редът остава
   „⏳ чака одобрение" — складът / регионалният / admin решават по него и
   след затварянето. Повод: 12 такива реда (13.10–29.10) никой не беше решил,
   а изцяло приетите листове висяха „изпратени" от седмици.

   Заковано тук (истински клик по inline onclick):
     а) всичко отметнато + 1 чакащ ред → „🏁 Приключи приемането" е активен,
        клик → PATCH loading_lists status=done;
     б) същото с ⛔ неполучен ред → partial;
     в) неотметнат обикновен ред → бутонът остава неактивен (старият гейт
        „всеки ред отметнат" е жив);
     г) затворен лист (done и partial) с чакащ ред → „✅ Одобри" в изгледа на
        склада, клик → PATCH approval_status, статусът на листа не се бута;
        при регионалния — в картата на обекта, без ръчно „▼ Разгъни";
        значката „⏳ N чака одобрение" остава и на затворен лист;
     д) писмото до склада при затваряне маркира реда „⏳ чака одобрение" и
        брои чакащите до брояча.
   Ръчното „✅ Приключи" на склада (llDoneList) НЕ е пипано — гейтът там
   остава; заковано в loading-lists-store-rows (ж1) и loading-done-gate.

   МУТАЦИИ (пуснати 13.11.2026 — всичките убити):
     M1  гейтът върнат в llAutoDoneList (if(all.some(llRowPending)) return;)
         → пада а), б), д)
     M2  махнат маркерът „⏳ чака одобрение" от писмото (llClosedHtmlFor,
         и редът, и броячът) → пада д)
     M3  „✅ Одобри" скрит при затворен лист (llApproveBtnsHtml връща '' при
         list.status !== 'sent') → пада г)

   Пускане:  node tests/ll-approval-nonblocking.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';

const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                role: 'manager', store_name: 'Петрич', assigned_stores: [], is_regional: false };
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [], is_regional: false };
const REGIONAL = { email: 'region.jug@temax.bg', display_name: 'Регионален Юг',
                   role: 'accounting', store_name: 'Централен офис',
                   assigned_stores: ['Петрич'], is_regional: true };

const L_SENT = { id: 'L1', warehouse: WH, list_date: '2026-10-12', status: 'sent',
                 executed_by: 'Иван', comment: '', created_by: 'Склад Търговище',
                 created_at: '2026-10-12T06:00:00.000Z',
                 sent_at: '2026-10-12T07:00:00.000Z', done_at: null };
const L_DONE = Object.assign({}, L_SENT, { status: 'done', done_at: '2026-10-12T18:00:00.000Z' });
const L_PART = Object.assign({}, L_SENT, { status: 'partial', done_at: '2026-10-12T18:00:00.000Z' });

function it_(o) {
  return Object.assign({
    id: 'i-x', list_id: 'L1', position: 1, kind: 'pallet',
    pallet_no: 1, pallet_total: 1, purchase_doc: null, clears_doc: null,
    store_name: 'Петрич', warehouse_comment: null, store_comment: null,
    partial: false, received: false, received_by: null, received_at: null,
    missing: false, missing_by: null, missing_at: null,
    added_by_store: false, approval_status: null, approval_by: null,
    approval_at: null, approval_comment: null,
    created_at: '2026-10-12T06:00:00.000Z'
  }, o);
}
function added_(o) {
  return it_(Object.assign({
    id: 'a1', position: 9, pallet_no: null, pallet_total: null,
    store_comment: 'дойде палет с плочки, който не е описан',
    received: true, received_by: 'Управител Петрич', received_at: '2026-10-12T09:00:00.000Z',
    added_by_store: true, approval_status: 'pending'
  }, o));
}
const REC = { received: true, received_by: 'Управител Петрич', received_at: '2026-10-12T09:00:00.000Z' };

const USERS = [
  { email: 'petrich@temax.bg', store_name: 'Петрич', active: true, is_regional: false, assigned_stores: [] },
  { email: 'sklad.tg@temax.bg', store_name: WH, active: true, is_regional: false, assigned_stores: [] },
  { email: 'region.jug@temax.bg', store_name: 'Централен офис', active: true,
    is_regional: true, assigned_stores: ['Петрич'] }
];

function env(user, items, lists) {
  let ref = null;
  const applyPatches = (rows, table) => {
    if (!ref) return rows;
    ref.calls.patch.filter(p => p.table === table).forEach(p => {
      const m = /id=eq\.([^&]*)/.exec(p.url);
      if (!m) return;
      const row = rows.find(r => String(r.id) === decodeURIComponent(m[1]));
      if (!row) return;
      if (/approval_status=eq\.pending/.test(p.url) && row.approval_status !== 'pending') return;
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
      loading_list_products: [], product_catalog: [],
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
    return Promise.resolve({ ok: true, status: 200, data: {} });
  };
  h.w.pushToAll = function () { return Promise.resolve({ ok: true, data: {} }); };
  h.w.sendEmail = function (to, subject, html) {
    h.mails.push({ to: Array.isArray(to) ? to : [to], subject: subject, html: html });
    return Promise.resolve({ ok: true, status: 200, data: {} });
  };
  /* llPatchIfPending чете броя засегнати редове от Content-Range. */
  const origFetch = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const p = origFetch(url, init);
    if ((init.method || '').toUpperCase() === 'PATCH' && /approval_status=eq\.pending/.test(url)) {
      return p.then(r => r.ok ? Object.assign({}, r, {
        headers: { get: k => (/^content-range$/i.test(k) ? '*/1' : null) }
      }) : r);
    }
    return p;
  };
  return h;
}

const card = (doc, id) => doc.getElementById('ll-card-' + id);
const patchesTo = (h, table) => h.calls.patch.filter(p => p.table === table);
const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };

(async function () {

  section('а) Всичко отметнато + 1 чакащ ред → „🏁 Приключи приемането" затваря като done');
  let hA;
  {
    const h = hA = env(STORE, [it_(Object.assign({ id: 'i1' }, REC)), added_({ id: 'a1' })], [L_SENT]);
    h.w.loadLoadingLists();
    await settle();
    const c = card(h.doc, 'L1');
    const fin = c && btn(c, '🏁 Приключи приемането');
    if (ok('бутонът съществува', !!fin, c && c.textContent.slice(0, 300))) {
      ok('и е активен', fin.disabled === false, String(fin.disabled));
      ok('без title-а за чакащо одобрение', !/чака одобрение/.test(fin.getAttribute('title') || ''),
        fin.getAttribute('title'));
      realClick(h.w, fin);
      await settle();
      const lp = patchesTo(h, 'loading_lists');
      ok('точно един PATCH по листа', lp.length === 1, JSON.stringify(h.calls.patch.map(p => p.table)));
      ok('status:done', lp.length === 1 && lp[0].body.status === 'done', JSON.stringify(lp[0] && lp[0].body));
      ok('сочи L1', lp.length === 1 && /id=eq\.L1/.test(lp[0].url), lp[0] && lp[0].url);
      ok('без toast „чака одобрение" (старият гейт)',
        !h.toasts.some(t => /чака одобрение/.test(String(t.msg))), JSON.stringify(h.toasts));
      ok('редът НЕ е решен мълчаливо — няма PATCH по approval_status',
        patchesTo(h, 'loading_list_items').length === 0,
        JSON.stringify(patchesTo(h, 'loading_list_items').map(p => p.body)));
    }
    /* Затвореният лист пак носи значката при обекта. */
    h.w.renderLoadingLists();
    const c2 = card(h.doc, 'L1');
    ok('значката „⏳ 1 чака одобрение" остава в картата на затворения лист',
      !!(c2 && c2.querySelector('[data-ll-apr-wait="1"]')), c2 && c2.textContent.slice(0, 300));
  }

  section('б) Същото с ⛔ неполучен ред → partial');
  {
    const h = env(STORE, [
      it_(Object.assign({ id: 'i1' }, REC)),
      it_({ id: 'i2', position: 2, pallet_no: 2, missing: true, missing_by: 'Управител Петрич',
            missing_at: '2026-10-12T09:05:00.000Z' }),
      added_({ id: 'a1' })
    ], [L_SENT]);
    h.w.loadLoadingLists();
    await settle();
    const fin = btn(card(h.doc, 'L1'), '🏁 Приключи приемането');
    ok('бутонът е активен', !!fin && fin.disabled === false, fin && String(fin.disabled));
    if (fin) realClick(h.w, fin);
    await settle();
    const lp = patchesTo(h, 'loading_lists');
    ok('status:partial', lp.length === 1 && lp[0].body.status === 'partial',
      JSON.stringify(lp.map(p => p.body)));
    h.close();
  }

  section('в) Неотметнат обикновен ред → бутонът остава неактивен');
  {
    const h = env(STORE, [it_({ id: 'i1' }), added_({ id: 'a1' })], [L_SENT]);
    h.w.loadLoadingLists();
    await settle();
    const fin = btn(card(h.doc, 'L1'), '🏁 Приключи приемането');
    if (ok('бутонът съществува', !!fin)) {
      ok('и е disabled', fin.disabled === true, String(fin.disabled));
      ok('title-ът казва да се отметне всеки ред',
        /Отметни всеки ред/.test(fin.getAttribute('title') || ''), fin.getAttribute('title'));
      /* realClick не гледа disabled — тоест това е и „извикване от конзолата". */
      realClick(h.w, fin);
      await settle();
      ok('нула PATCH по листа', patchesTo(h, 'loading_lists').length === 0,
        JSON.stringify(h.calls.patch.map(p => p.table)));
      ok('toast „Отметни всеки ред…"',
        h.toasts.some(t => /Отметни всеки ред/.test(String(t.msg))), JSON.stringify(h.toasts));
    }
    await h.w.llAutoDoneList('L1');
    await settle();
    ok('llAutoDoneList също не затваря', patchesTo(h, 'loading_lists').length === 0);
    h.close();
  }

  for (const L of [L_DONE, L_PART]) {
    section('г) Затворен лист (' + L.status + ') с чакащ ред — „✅ Одобри" в изгледа на склада');
    const items = L.status === 'partial'
      ? [it_({ id: 'i1', missing: true, missing_by: 'Управител Петрич' }), added_({ id: 'a1' })]
      : [it_(Object.assign({ id: 'i1' }, REC)), added_({ id: 'a1' })];
    const h = env(WAREHOUSE, items, [L]);
    h.w.loadLoadingLists();
    await settle();
    h.w.llOpenView('L1');
    const wrap = h.doc.getElementById('mod-loading');
    ok('значката „⏳ 1 чака одобрение" в заглавието на прегледа',
      !!wrap.querySelector('[data-ll-apr-wait="1"]'), wrap.textContent.slice(0, 300));
    ok('маркерът на реда стои', !!wrap.querySelector('[data-ll-appr="pending"]'));
    const ap = btn(wrap, '✅ Одобри');
    if (ok('има „✅ Одобри"', !!ap, wrap.textContent.slice(0, 500))) {
      ok('и „⛔ Отхвърли"', !!btn(wrap, '⛔ Отхвърли'));
      h.doc.getElementById('ll-apr-a1').value = 'наред';
      realClick(h.w, ap);
      await settle();
      const ip = patchesTo(h, 'loading_list_items');
      ok('PATCH по реда с approval_status:approved',
        ip.length === 1 && ip[0].body.approval_status === 'approved', JSON.stringify(ip.map(p => p.body)));
      ok('филтърът approval_status=eq.pending е там',
        ip.length === 1 && /approval_status=eq\.pending/.test(ip[0].url), ip[0] && ip[0].url);
      ok('статусът на листа НЕ се бута', patchesTo(h, 'loading_lists').length === 0,
        JSON.stringify(patchesTo(h, 'loading_lists').map(p => p.body)));
      ok('без toast „вече решен" / „нямаш права"',
        !h.toasts.some(t => /вече|Нямаш права/.test(String(t.msg))), JSON.stringify(h.toasts));
      ok('обектът получава push за решението',
        h.pushes.some(p => p.stores.join() === 'Петрич' && /одобрен/.test(p.title)), JSON.stringify(h.pushes));
    }
    h.close();
  }

  section('г2) Регионалният — „✅ Одобри" в картата на затворения лист, без „▼ Разгъни"');
  {
    const h = env(REGIONAL, [it_(Object.assign({ id: 'i1' }, REC)), added_({ id: 'a1' })], [L_DONE]);
    h.w.loadLoadingLists();
    await settle();
    const c = card(h.doc, 'L1');
    ok('картата е там', !!c);
    ok('значката „⏳ 1 чака одобрение"', !!(c && c.querySelector('[data-ll-apr-wait="1"]')));
    const ap = c && btn(c, '✅ Одобри');
    if (ok('има „✅ Одобри" (листът не е свит)', !!ap, c && c.textContent.slice(0, 300))) {
      h.doc.getElementById('ll-apr-a1').value = 'грешен курс';
      realClick(h.w, btn(c, '⛔ Отхвърли'));
      await settle();
      const ip = patchesTo(h, 'loading_list_items');
      ok('PATCH approval_status:rejected', ip.length === 1 && ip[0].body.approval_status === 'rejected',
        JSON.stringify(ip.map(p => p.body)));
      ok('статусът на листа остава done (отхвърленият ред не внася липса)',
        patchesTo(h, 'loading_lists').length === 0, JSON.stringify(patchesTo(h, 'loading_lists').map(p => p.body)));
    }
    h.close();

    /* Обектът няма какво да реши → затвореният лист при него се свива, а
       значката остава в заглавието. */
    const hs = env(STORE, [it_(Object.assign({ id: 'i1' }, REC)), added_({ id: 'a1' })], [L_DONE]);
    hs.w.loadLoadingLists();
    await settle();
    const cs = card(hs.doc, 'L1');
    ok('при обекта затвореният лист е свит', !!cs && !!btn(cs, '▼ Разгъни'), cs && cs.textContent.slice(0, 200));
    ok('но значката „⏳ 1 чака одобрение" е в заглавието',
      !!(cs && cs.querySelector('[data-ll-apr-wait="1"]')));
    hs.close();
  }

  section('д) Писмото до склада при затваряне маркира чакащия ред');
  {
    const h = hA;
    const m = h.mails.filter(x => x.to.indexOf('sklad.tg@temax.bg') >= 0);
    if (ok('едно писмо до склада', m.length === 1, JSON.stringify(h.mails.map(x => x.subject + ' → ' + x.to)))) {
      ok('съдържа „чака одобрение"', m[0].html.indexOf('чака одобрение') >= 0);
      ok('редът е маркиран в таблицата', /data-ll-mail-appr="pending"/.test(m[0].html));
      ok('броячът казва колко чакат', /data-ll-mail-apr="1"/.test(m[0].html) &&
        m[0].html.indexOf('1 ред чака одобрение') >= 0, m[0].html.slice(0, 600));
    }
    ok('push-ът до склада също казва', h.pushes.some(p => p.stores.join() === WH && /чака одобрение/.test(p.message)),
      JSON.stringify(h.pushes));
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
