/* Товарни листи — известие до СКЛАДА при ПРИКЛЮЧВАНЕ (Пакет Б).

   Складът е изпращачът: дотук той научаваше как е минало приемането само ако
   сам отвореше листа. Сега приключването му праща push и писмо с целия курс.

   Приключването има ДВА пътя — автоматичния (обектът отметна последния ред)
   и ръчния бутон на склада. Един helper (llNotifyClosed) обслужва и двата:
   две копия щяха да се разминат при първата промяна на текста, а
   разминаването тук не гърми — складът просто получава различно писмо според
   това кой е затворил листа.

   Трите неща, в които е лесно да се сбърка ТИХО:
     · ⛔ срещу ✅ — писмото трябва да КАЗВА, че има липси, иначе „приключен"
       звучи като „прието наред";
     · известие БЕЗ реална смяна на статуса — PATCH върху вече приключен лист
       минава успешно и би пратил второ писмо за същото събитие;
     · редовете се ТЕГЛЯТ, не се подават: от магазинската страна llStoreItems
       съдържа само моите редове, а писмото до склада е за ЦЕЛИЯ курс.

   Пускане:  node tests/loading-lists-notify-closed.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';

const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                role: 'manager', store_name: 'Петрич', assigned_stores: [] };
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };

const L_SENT = { id: 'L1', warehouse: WH, list_date: '2026-09-02', status: 'sent',
                 executed_by: 'Иван', comment: '', created_by: 'Склад Търговище',
                 created_at: '2026-09-02T06:00:00.000Z',
                 sent_at: '2026-09-02T07:00:00.000Z', done_at: null };

function it_(o) {
  return Object.assign({
    id: 'i-x', list_id: 'L1', position: 1, kind: 'pallet',
    pallet_no: 1, pallet_total: 1, purchase_doc: null, clears_doc: null,
    store_name: 'Петрич', warehouse_comment: null, store_comment: null,
    partial: false, received: false, received_by: null, received_at: null,
    missing: false, missing_by: null, missing_at: null,
    created_at: '2026-09-02T06:00:00.000Z'
  }, o);
}

const USERS = [
  { email: 'petrich@temax.bg', store_name: 'Петрич', active: true },
  { email: 'sklad.tg@temax.bg', store_name: WH, active: true },
  { email: 'sklad.tg.2@temax.bg', store_name: WH, active: true },
  /* Спрян акаунт на СЪЩИЯ склад — не бива да получи нищо. */
  { email: 'stariat@temax.bg', store_name: WH, active: false },
  { email: 'dobrich@temax.bg', store_name: 'Логистичен склад Добрич', active: true }
];

function env(user, items, lists, opts) {
  opts = opts || {};
  let ref = null;
  const applyPatches = (rows, table) => {
    if (!ref) return rows;
    ref.calls.patch.filter(x => x.table === table).forEach(x => {
      const m = /id=eq\.([^&]*)/.exec(x.url);
      if (!m) return;
      const row = rows.find(r => String(r.id) === decodeURIComponent(m[1]));
      if (row) Object.assign(row, x.body);
    });
    return rows;
  };
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js',
              'push.js', 'email.js', 'loading.js'],
    user: user,
    confirm: opts.confirm !== undefined ? opts.confirm : true,
    data: {
      loading_list_items: function (url) {
        let rows = applyPatches((items || []).map(r => Object.assign({}, r)), 'loading_list_items');
        const sm = /store_name=eq\.([^&]*)/.exec(url);
        if (sm) rows = rows.filter(r => String(r.store_name) === decodeURIComponent(sm[1]));
        const lm = /list_id=eq\.([^&]*)/.exec(url);
        if (lm) rows = rows.filter(r => String(r.list_id) === decodeURIComponent(lm[1]));
        return rows;
      },
      loading_lists: function (url) {
        let rows = applyPatches((lists || []).map(r => Object.assign({}, r)), 'loading_lists');
        const ids = /id=in\.\(([^)]*)\)/.exec(url);
        if (ids) { const s = ids[1].split(','); rows = rows.filter(r => s.indexOf(String(r.id)) >= 0); }
        const st = /status=in\.\(([^)]*)\)/.exec(url);
        if (st) { const s = st[1].split(','); rows = rows.filter(r => s.indexOf(r.status) >= 0); }
        return rows;
      },
      users: function (url) {
        let rows = (opts.users || USERS).map(r => Object.assign({}, r));
        if (/active=eq\.true/.test(url)) rows = rows.filter(r => r.active);
        const inm = /store_name=in\.\(([^)]*)\)/.exec(url);
        if (inm) {
          const want = inm[1].split(',').map(decodeURIComponent);
          rows = rows.filter(r => want.indexOf(r.store_name) >= 0);
        }
        return rows;
      },
      stores: [], contacts: [], transport_orders: [], client_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: [], goods_transit: []
    }
  });
  ref = h;
  h.pushes = []; h.mails = []; h.pushAllCalls = 0;
  h.w.pushToStores = function (stores, title, message) {
    h.pushes.push({ stores: stores, title: title, message: message });
    return Promise.resolve({ ok: !opts.pushFail, status: opts.pushFail ? 500 : 200, data: {} });
  };
  h.w.pushToAll = function () { h.pushAllCalls++; return Promise.resolve({ ok: true, data: {} }); };
  h.w.sendEmail = function (to, subject, html) {
    h.mails.push({ to: Array.isArray(to) ? to : [to], subject: subject, html: html });
    return Promise.resolve({ ok: !opts.mailFail, status: opts.mailFail ? 500 : 200, data: {} });
  };
  h.toasts = [];
  const origToast = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: m, col: c }); return origToast(m, c); };
  return h;
}

const card = (doc, id) => doc.getElementById('ll-card-' + id);
const patchesTo = (h, table) => h.calls.patch.filter(p => p.table === table);
const btnIn = (root, text) => (root ? btn(root, text) : null);

(async function () {

  section('а) Автоматично приключване БЕЗ липси → ✅ до склада');
  {
    const items = [it_({ id: 'i1', purchase_doc: 'D-100', store_name: 'Петрич' })];
    const h = env(STORE, items, [L_SENT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    realClick(h.w, btnIn(card(h.doc, 'L1'), '✅ Получено'));
    await ticks(); await ticks(); await ticks(); await ticks();

    const lp = patchesTo(h, 'loading_lists');
    if (ok('листът е приключен', lp.length === 1, JSON.stringify(h.calls.patch.map(p => p.table)))) {
      ok('status:done', lp[0].body.status === 'done', JSON.stringify(lp[0].body));
    }
    if (ok('един push', h.pushes.length === 1, JSON.stringify(h.pushes))) {
      ok('получателят е СКЛАДЪТ, не обектът', h.pushes[0].stores[0] === WH,
        JSON.stringify(h.pushes[0].stores));
      ok('заглавието е ✅ с датата',
        h.pushes[0].title === '✅ Товарен лист 02.09.2026 приключен', h.pushes[0].title);
      ok('текстът носи броячите',
        h.pushes[0].message === 'получени 1 · неполучени 0 от 1', h.pushes[0].message);
    }
    ok('НЕ до целия портал', h.pushAllCalls === 0, String(h.pushAllCalls));

    if (ok('едно писмо', h.mails.length === 1, JSON.stringify(h.mails.map(m => m.to)))) {
      ok('до двата активни акаунта на склада',
        h.mails[0].to.length === 2 &&
        h.mails[0].to.indexOf('sklad.tg@temax.bg') >= 0 &&
        h.mails[0].to.indexOf('sklad.tg.2@temax.bg') >= 0, JSON.stringify(h.mails[0].to));
      ok('спреният акаунт НЕ е вътре',
        h.mails[0].to.indexOf('stariat@temax.bg') < 0, JSON.stringify(h.mails[0].to));
      ok('чуждият склад също не е',
        h.mails[0].to.indexOf('dobrich@temax.bg') < 0, JSON.stringify(h.mails[0].to));
      ok('темата е „приключен", без ЛИПСИ',
        h.mails[0].subject === 'Товарен лист приключен · 02.09.2026', h.mails[0].subject);
      ok('в html-а няма маркер за липса',
        h.mails[0].html.indexOf('НЕПОЛУЧЕНО') < 0);
      ok('и има „получено"', h.mails[0].html.indexOf('получено') >= 0);
    }
  }

  section('б) Автоматично приключване С липса → ⛔ и червен ред');
  {
    const items = [
      it_({ id: 'i1', position: 1, purchase_doc: 'D-100', store_name: 'Петрич',
            missing: true, missing_by: 'Управител Петрич',
            missing_at: '2026-09-02T10:00:00.000Z', store_comment: 'кашонът липсва' }),
      it_({ id: 'i2', position: 2, pallet_no: 2, pallet_total: 2, purchase_doc: 'D-200',
            store_name: 'Петрич' })
    ];
    const h = env(STORE, items, [L_SENT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    realClick(h.w, btnIn(card(h.doc, 'L1'), '✅ Получено'));
    await ticks(); await ticks(); await ticks(); await ticks();

    const lp = patchesTo(h, 'loading_lists');
    if (ok('листът е приключен', lp.length === 1, JSON.stringify(h.calls.patch.map(p => p.table)))) {
      ok('status:partial', lp[0].body.status === 'partial', JSON.stringify(lp[0].body));
    }
    if (ok('един push', h.pushes.length === 1, JSON.stringify(h.pushes))) {
      ok('заглавието е ⛔ „с липси"',
        h.pushes[0].title === '⛔ Товарен лист 02.09.2026 — с липси', h.pushes[0].title);
      ok('и броячите са верни',
        h.pushes[0].message === 'получени 1 · неполучени 1 от 2', h.pushes[0].message);
    }
    if (ok('едно писмо', h.mails.length === 1)) {
      ok('темата казва ЛИПСИ с главни букви',
        h.mails[0].subject === 'Товарен лист с ЛИПСИ · 02.09.2026', h.mails[0].subject);
      ok('html-ът носи маркера', h.mails[0].html.indexOf('⛔ НЕПОЛУЧЕНО') >= 0);
      ok('и коментара на обекта', h.mails[0].html.indexOf('кашонът липсва') >= 0);
      ok('и кой го е заявил', h.mails[0].html.indexOf('Управител Петрич') >= 0);
      ok('редът с липсата е с червен фон',
        h.mails[0].html.indexOf('background:#fef2f2;') >= 0);
      ok('заглавието на писмото също е червено',
        h.mails[0].html.indexOf('#b91c1c') >= 0);
    }
  }

  section('в) Писмото до склада носи ВСИЧКИ обекти, не само отметналия');
  {
    /* Обектът вижда само своите редове (llStoreItems). Ако писмото се
       сглобяваше от тях, складът щеше да получава половин курс. */
    const items = [
      it_({ id: 'a1', position: 1, store_name: 'Гоце Делчев', purchase_doc: 'D-900',
            received: true, received_by: 'Управител ГД',
            received_at: '2026-09-02T09:00:00.000Z' }),
      it_({ id: 'i1', position: 2, store_name: 'Петрич', purchase_doc: 'D-100' })
    ];
    const h = env(STORE, items, [L_SENT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('обектът вижда само своя ред', h.w.llStoreItems.length === 1,
      JSON.stringify(h.w.llStoreItems.map(i => i.id)));

    realClick(h.w, btnIn(card(h.doc, 'L1'), '✅ Получено'));
    await ticks(); await ticks(); await ticks(); await ticks();

    if (ok('едно писмо', h.mails.length === 1, JSON.stringify(h.mails.map(m => m.to)))) {
      ok('чуждият документ Е вътре', h.mails[0].html.indexOf('D-900') >= 0);
      ok('чуждият обект Е вътре', h.mails[0].html.indexOf('Гоце Делчев') >= 0);
      ok('и моят също', h.mails[0].html.indexOf('D-100') >= 0);
      ok('броячът е за целия лист (2 реда)',
        h.pushes[0].message === 'получени 2 · неполучени 0 от 2', h.pushes[0].message);
    }
    ok('редовете са ТЕГЛЕНИ със заявка за целия лист',
      h.calls.get.filter(u => /loading_list_items/.test(u) && /list_id=eq\.L1/.test(u)).length >= 1,
      h.calls.get.filter(u => /loading_list_items/.test(u)).join(' | '));
  }

  section('г) Ръчният бутон на склада — същото известие');
  {
    const items = [
      it_({ id: 'i1', position: 1, purchase_doc: 'D-100', received: true,
            received_by: 'Управител Петрич', received_at: '2026-09-02T10:00:00.000Z' }),
      it_({ id: 'i2', position: 2, pallet_no: 2, pallet_total: 2, purchase_doc: 'D-200',
            missing: true, missing_by: 'Управител Петрич',
            missing_at: '2026-09-02T11:00:00.000Z', store_comment: 'няма го' })
    ];
    const h = env(WAREHOUSE, items, [L_SENT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');

    const b = btn(h.doc.getElementById('mod-loading'), '✅ Приключи');
    if (ok('бутонът е „✅ Приключи", не „✅ Приключен"', !!b,
      h.doc.getElementById('mod-loading').textContent.slice(0, 300))) {
      realClick(h.w, b);
      await ticks(); await ticks(); await ticks();

      const lp = patchesTo(h, 'loading_lists');
      if (ok('листът е patch-нат', lp.length === 1)) {
        ok('status:partial', lp[0].body.status === 'partial', JSON.stringify(lp[0].body));
      }
      ok('един push до склада', h.pushes.length === 1 && h.pushes[0].stores[0] === WH,
        JSON.stringify(h.pushes));
      ok('със същото ⛔ заглавие като автоматичния път',
        h.pushes[0].title === '⛔ Товарен лист 02.09.2026 — с липси', h.pushes[0].title);
      ok('и едно писмо', h.mails.length === 1, JSON.stringify(h.mails.map(m => m.to)));
      ok('със същата тема', h.mails[0].subject === 'Товарен лист с ЛИПСИ · 02.09.2026',
        h.mails[0].subject);
    }
  }

  section('д) Ръчният бутон БЕЗ реална смяна на статуса — НЕ праща');
  {
    /* Листът вече е partial. PATCH-ът минава успешно, но нищо не се сменя —
       второ писмо за същото събитие е точно това, което се пази тук. */
    const L_PART = Object.assign({}, L_SENT, { status: 'partial',
      done_at: '2026-09-02T12:00:00.000Z' });
    const items = [
      it_({ id: 'i1', position: 1, purchase_doc: 'D-100', received: true,
            received_by: 'Управител Петрич', received_at: '2026-09-02T10:00:00.000Z' }),
      it_({ id: 'i2', position: 2, pallet_no: 2, pallet_total: 2, purchase_doc: 'D-200',
            missing: true, missing_by: 'Управител Петрич',
            missing_at: '2026-09-02T11:00:00.000Z', store_comment: 'няма го' })
    ];
    const h = env(WAREHOUSE, items, [L_PART]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');

    /* Бутонът се показва само при status='sent'; тук се вика по име —
       функцията е глобална и достижима от inline onclick. */
    h.w.llDoneList('L1');
    await ticks(); await ticks(); await ticks();

    ok('PATCH-ът минава', patchesTo(h, 'loading_lists').length === 1,
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('и пак е partial',
      patchesTo(h, 'loading_lists')[0].body.status === 'partial',
      JSON.stringify(patchesTo(h, 'loading_lists')[0].body));
    ok('НУЛА push — статусът не се смени', h.pushes.length === 0, JSON.stringify(h.pushes));
    ok('НУЛА писма', h.mails.length === 0, JSON.stringify(h.mails.map(m => m.to)));
    ok('и нула заявки за редовете на листа от llNotifyClosed',
      h.calls.get.filter(u => /loading_list_items/.test(u) && /list_id=eq\.L1/.test(u)).length === 0,
      h.calls.get.filter(u => /loading_list_items/.test(u)).join(' | '));
  }

  section('д2) КОНТРОЛ: същият лист, но в sent — праща');
  {
    /* Без този контрол „нула писма" горе би минавало и ако llNotifyClosed
       изобщо не се вика от llDoneList. */
    const items = [
      it_({ id: 'i1', position: 1, purchase_doc: 'D-100', received: true,
            received_by: 'Управител Петрич', received_at: '2026-09-02T10:00:00.000Z' })
    ];
    const h = env(WAREHOUSE, items, [L_SENT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llDoneList('L1');
    await ticks(); await ticks(); await ticks();
    ok('един push', h.pushes.length === 1, JSON.stringify(h.pushes));
    ok('едно писмо', h.mails.length === 1, JSON.stringify(h.mails.map(m => m.to)));
  }

  section('е) Отмятане по ВЕЧЕ приключен лист — без второ писмо');
  {
    /* Листът е partial заради липсата. Обектът я отменя и отмята реда като
       получен — липси вече няма, тоест желаният статус е done и смяната Е
       реална. Проверява се, че това дава ТОЧНО ЕДНО известие: llUnmarkMissing
       не праща нищо само по себе си, а llAutoDoneList праща веднъж. */
    const L_PART2 = Object.assign({}, L_SENT, { status: 'partial',
      done_at: '2026-09-02T12:00:00.000Z' });
    const items = [
      it_({ id: 'i1', position: 1, purchase_doc: 'D-100', received: true,
            received_by: 'Управител Петрич', received_at: '2026-09-02T10:00:00.000Z' }),
      it_({ id: 'i2', position: 2, pallet_no: 2, pallet_total: 2, purchase_doc: 'D-200',
            missing: true, missing_by: 'Управител Петрич',
            missing_at: '2026-09-02T11:00:00.000Z', store_comment: 'няма го' })
    ];
    const h = env(STORE, items, [L_PART2]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    /* Картата е свита (приключен лист) — отмяната се вика по име. */
    h.w.llUnmarkMissing('i2');
    await ticks(); await ticks();
    h.w.llMarkReceived('i2');
    await ticks(); await ticks(); await ticks(); await ticks();

    ok('редът е отметнат',
      h.calls.patch.some(p => p.table === 'loading_list_items' && p.body.received === true),
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('листът СТАВА done от partial — статусът наистина се мени',
      patchesTo(h, 'loading_lists').length === 1,
      JSON.stringify(patchesTo(h, 'loading_lists').map(p => p.body)));
    ok('и точно едно известие, не две', h.mails.length === 1,
      JSON.stringify(h.mails.map(m => m.subject)));
  }

  section('ж) Провал на известието — жълт toast, статусът НЕ се връща');
  {
    const items = [it_({ id: 'i1', purchase_doc: 'D-100', store_name: 'Петрич' })];
    const h = env(STORE, items, [L_SENT], { pushFail: true, mailFail: true });
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    realClick(h.w, btnIn(card(h.doc, 'L1'), '✅ Получено'));
    await ticks(); await ticks(); await ticks(); await ticks();

    const lp = patchesTo(h, 'loading_lists');
    ok('листът е приключен веднъж', lp.length === 1,
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('status:done', lp[0].body.status === 'done', JSON.stringify(lp[0].body));
    ok('НЯМА PATCH, който да го върне в sent',
      !lp.some(p => p.body.status === 'sent'), JSON.stringify(lp.map(p => p.body)));
    ok('жълт toast с името на склада',
      h.toasts.some(t => /известието до Логистичен склад Търговище не тръгна/.test(String(t.msg))),
      JSON.stringify(h.toasts));
    ok('и цветът е жълт (#d97706)',
      h.toasts.some(t => /не тръгна/.test(String(t.msg)) && t.col === '#d97706'),
      JSON.stringify(h.toasts));
    ok('успешният toast за приключването пак е излязъл',
      h.toasts.some(t => /Товарният лист е приключен/.test(String(t.msg))),
      JSON.stringify(h.toasts));
  }

  section('з) Лист без склад — известие до никого, не до всички');
  {
    const L_NOWH = Object.assign({}, L_SENT, { warehouse: '' });
    const items = [it_({ id: 'i1', purchase_doc: 'D-100', store_name: 'Петрич' })];
    const h = env(STORE, items, [L_NOWH]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    realClick(h.w, btnIn(card(h.doc, 'L1'), '✅ Получено'));
    await ticks(); await ticks(); await ticks(); await ticks();
    ok('нула push', h.pushes.length === 0, JSON.stringify(h.pushes));
    ok('и НУЛА до целия портал', h.pushAllCalls === 0, String(h.pushAllCalls));
    ok('нула писма', h.mails.length === 0, JSON.stringify(h.mails.map(m => m.to)));
    ok('но листът пак е приключен', patchesTo(h, 'loading_lists').length === 1);
  }

  report();
})();
