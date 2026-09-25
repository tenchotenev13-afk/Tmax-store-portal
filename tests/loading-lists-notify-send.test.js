/* Товарни листи — известие при ИЗПРАЩАНЕ (Пакет Б).

   Дотук листът тръгваше мълчаливо: обектът разбираше, че има товар, само ако
   сам отвореше таба. Сега „📤 Изпрати към обектите" праща push и имейл на
   всеки обект с редове в листа.

   Трите неща, в които е лесно да се сбърка ТИХО, и затова са заковани тук:
     · чуждите редове в чуждо писмо — изтичане на информация между обекти, а
       не просто шум. Проверява се, че html-ът на единия НЕ съдържа документа
       на другия;
     · pushToStores([]) ПАДА КЪМ pushToAll() — известие до целия портал.
       Затова празният получател трябва да бъде спрян ПРЕДИ извикването;
     · провалът на известието НЕ връща листа в draft. Листът Е изпратен —
       това е факт и не се отменя, защото второ действие не е минало.

   Пускане:  node tests/loading-lists-notify-send.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';

const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };

const L_DRAFT = { id: 'L1', warehouse: WH, list_date: '2026-09-02', status: 'draft',
                  executed_by: 'Иван', comment: 'Камионът тръгва в 6:00',
                  created_by: 'Склад Търговище', created_at: '2026-09-02T06:00:00.000Z',
                  sent_at: null, done_at: null };

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

/* Активните потребители на обектите — llStoreEmails() ги чете оттук. */
const USERS = [
  { email: 'petrich@temax.bg', store_name: 'Петрич', active: true },
  /* Втори акаунт на същия обект: управител + заместник. И двамата получават. */
  { email: 'petrich2@temax.bg', store_name: 'Петрич', active: true },
  { email: 'gd@temax.bg', store_name: 'Гоце Делчев', active: true },
  { email: 'sklad.tg@temax.bg', store_name: WH, active: true }
];

function env(user, items, lists, opts) {
  opts = opts || {};
  let ref = null;
  /* Прилага записаните PATCH-ове преди да върне редовете: llSendList()
     презарежда през loadLoadingLists() и без това мокът би върнал
     състоянието ОТПРЕДИ клика. */
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
        let rows = (items || []).map(r => Object.assign({}, r));
        const m = /list_id=eq\.([^&]*)/.exec(url);
        if (m) rows = rows.filter(r => String(r.list_id) === decodeURIComponent(m[1]));
        return rows;
      },
      loading_lists: () => applyPatches((lists || []).map(r => Object.assign({}, r)), 'loading_lists'),
      users: function (url) {
        /* Мокът прилага ФИЛТРИТЕ на заявката. Без това „само активните" и
           „само тези обекти" минават и с махнат филтър в кода. */
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
      /* „📤 Изпрати" иска поне 2 снимки на натоварването (25.09.2026).
         Този тест проверява какво става СЛЕД изпращането, не гейта —
         затова фикстурата ги носи. Гейтът е в loading-lists-photos. */
      loading_list_photos: [
        { id: 'ph1', list_id: 'L1', store_name: WH, stage: 'sent',
          path: 'https://x/1.jpg', uploaded_by: 'Склад', uploaded_at: 'x' },
        { id: 'ph2', list_id: 'L1', store_name: WH, stage: 'sent',
          path: 'https://x/2.jpg', uploaded_by: 'Склад', uploaded_at: 'x' }
      ],
      stock_differences: [], differences_reports: [], stock_returns: [], goods_transit: []
    }
  });
  /* push.js и email.js стрелят по мрежата през собствен fetch, не през sbGet —
     затова се подменят тук, вместо да се очакват в h.calls. */
  ref = h;
  /* harness-ът пази само текста на toast-а. Жълто срещу червено е
     СЪДЪРЖАНИЕ тук („не е фатално" срещу „счупено"), затова цветът се
     прихваща отделно. */
  h.toasts = [];
  const origToast = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: m, col: c }); return origToast(m, c); };
  h.pushes = []; h.mails = [];
  h.pushFail = !!opts.pushFail;
  h.mailFail = !!opts.mailFail;
  h.w.pushToStores = function (stores, title, message) {
    h.pushes.push({ stores: stores, title: title, message: message });
    return Promise.resolve({ ok: !h.pushFail, status: h.pushFail ? 500 : 200, data: {} });
  };
  /* pushToAll НЕ бива да бъде викана изобщо — вика се само от pushToStores
     при празен списък, тоест появата ѝ тук значи известие до целия портал. */
  h.pushAllCalls = 0;
  h.w.pushToAll = function () { h.pushAllCalls++; return Promise.resolve({ ok: true, data: {} }); };
  h.w.sendEmail = function (to, subject, html) {
    h.mails.push({ to: Array.isArray(to) ? to : [to], subject: subject, html: html });
    return Promise.resolve({ ok: !h.mailFail, status: h.mailFail ? 500 : 200, data: {} });
  };
  return h;
}

const patchesTo = (h, table) => h.calls.patch.filter(p => p.table === table);
const mailFor = (h, addr) => h.mails.find(m => m.to.indexOf(addr) >= 0);

(async function () {

  section('а) Етикетите на действията вече не повтарят статуса');
  {
    const h = env(WAREHOUSE, [it_({ id: 'i1', purchase_doc: 'D-100' })], [L_DRAFT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    const wrap = h.doc.getElementById('mod-loading');
    ok('бутонът е „📤 Изпрати към обектите"', !!btn(wrap, '📤 Изпрати към обектите'),
      wrap.textContent.slice(0, 300));
    ok('и вече не е „📤 Изпратен"', !btn(wrap, '📤 Изпратен'));
    /* Баджът на статуса НЕ се пипа — той описва състояние, не действие. */
    ok('баджът „📝 Чернова" си е на мястото',
      wrap.textContent.indexOf('📝 Чернова') >= 0, wrap.textContent.slice(0, 200));
  }

  section('б) Изпращане: по едно известие на обект, само с неговите редове');
  {
    const items = [
      it_({ id: 'i1', position: 1, pallet_no: 1, pallet_total: 2, purchase_doc: 'D-100',
            store_name: 'Петрич', warehouse_comment: 'кашон отгоре' }),
      /* Втори документ на СЪЩИЯ палет — една товарна единица, два реда. */
      it_({ id: 'i2', position: 2, pallet_no: 1, pallet_total: 2, purchase_doc: 'D-101',
            store_name: 'Петрич' }),
      it_({ id: 'i3', position: 3, pallet_no: 2, pallet_total: 2, purchase_doc: 'D-102',
            store_name: 'Петрич' }),
      it_({ id: 'i9', position: 4, purchase_doc: 'D-900', store_name: 'Гоце Делчев' })
    ];
    const h = env(WAREHOUSE, items, [L_DRAFT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');

    realClick(h.w, btn(h.doc.getElementById('mod-loading'), '📤 Изпрати към обектите'));
    await ticks(); await ticks(); await ticks();

    const lp = patchesTo(h, 'loading_lists');
    if (ok('листът е patch-нат', lp.length === 1, JSON.stringify(h.calls.patch.map(p => p.table)))) {
      ok('status:sent', lp[0].body.status === 'sent', JSON.stringify(lp[0].body));
      ok('sent_at е попълнено', !!lp[0].body.sent_at);
    }

    ok('два push-а — по един на обект', h.pushes.length === 2,
      JSON.stringify(h.pushes.map(p => p.stores)));
    ok('и нито един до ЦЕЛИЯ портал', h.pushAllCalls === 0, String(h.pushAllCalls));
    const pP = h.pushes.find(p => p.stores[0] === 'Петрич');
    if (ok('Петрич има свой push', !!pP, JSON.stringify(h.pushes))) {
      ok('заглавието носи склада', pP.title === '🚛 Нов товарен лист от ' + WH, pP.title);
      /* Товарните ЕДИНИЦИ, не редовете: три реда на два палета са два палета. */
      ok('текстът брои товарните единици (2), не редовете (3)',
        pP.message.indexOf('2 товарни единици') === 0, pP.message);
      ok('и носи датата', pP.message.indexOf('02.09.2026') >= 0, pP.message);
      ok('и казва къде да се отвори',
        pP.message.indexOf('Транспорт → Товарни листи') >= 0, pP.message);
    }

    ok('заявката за имейли иска само активните',
      h.calls.get.some(u => /\/users/.test(u) && /active=eq\.true/.test(u)),
      h.calls.get.filter(u => /\/users/.test(u)).join(' | '));
    ok('и само обектите от листа',
      h.calls.get.some(u => /\/users/.test(u) && /store_name=in\./.test(u)),
      h.calls.get.filter(u => /\/users/.test(u)).join(' | '));

    ok('две писма — по едно на обект', h.mails.length === 2,
      JSON.stringify(h.mails.map(m => m.to)));
    const mP = mailFor(h, 'petrich@temax.bg');
    if (ok('Петрич има писмо', !!mP, JSON.stringify(h.mails.map(m => m.to)))) {
      ok('и двата акаунта на обекта са в едно писмо',
        mP.to.length === 2 && mP.to.indexOf('petrich2@temax.bg') >= 0, JSON.stringify(mP.to));
      ok('темата носи склада и датата',
        mP.subject === 'Товарен лист от ' + WH + ' · 02.09.2026', mP.subject);
      ok('в html-а са МОИТЕ документи',
        mP.html.indexOf('D-100') >= 0 && mP.html.indexOf('D-101') >= 0 &&
        mP.html.indexOf('D-102') >= 0);
      /* Сърцевината: чуждият ред не бива да е в моето писмо. */
      ok('и НЕ е чуждият D-900', mP.html.indexOf('D-900') < 0);
      ok('чуждият обект също го няма', mP.html.indexOf('Гоце Делчев') < 0);
      ok('коментарът на склада по реда е вътре', mP.html.indexOf('кашон отгоре') >= 0);
      ok('коментарът на ЛИСТА е вътре', mP.html.indexOf('Камионът тръгва в 6:00') >= 0);
      ok('товарилият е вътре', mP.html.indexOf('Иван') >= 0);
      ok('има линк към портала',
        mP.html.indexOf('tenchotenev13-afk.github.io/Tmax-store-portal') >= 0);
      ok('и е обвито от emailWrap', mP.html.indexOf('<!DOCTYPE html>') === 0,
        mP.html.slice(0, 60));
      /* Без PDF: писмото е текст и таблица, не носител на прикачени файлове. */
      ok('няма прикачен файл', mP.html.indexOf('base64') < 0);
    }
    const mG = mailFor(h, 'gd@temax.bg');
    if (ok('Гоце Делчев има свое писмо', !!mG)) {
      ok('с неговия документ', mG.html.indexOf('D-900') >= 0);
      ok('и без документите на Петрич', mG.html.indexOf('D-100') < 0);
    }
    ok('нула жълти toast-ове при успех',
      !h.calls.toast.some(t => /не тръгна|Без имейл/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
  }

  section('в) Провал на имейла — жълт toast, статусът ОСТАВА sent');
  {
    const items = [it_({ id: 'i1', purchase_doc: 'D-100', store_name: 'Петрич' })];
    const h = env(WAREHOUSE, items, [L_DRAFT], { mailFail: true, pushFail: true });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');

    realClick(h.w, btn(h.doc.getElementById('mod-loading'), '📤 Изпрати към обектите'));
    await ticks(); await ticks(); await ticks();

    const lp = patchesTo(h, 'loading_lists');
    ok('листът пак е patch-нат веднъж', lp.length === 1,
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('и статусът е sent', lp[0].body.status === 'sent', JSON.stringify(lp[0].body));
    /* Нищо не връща листа в draft — това е цялата точка на проверката. */
    ok('НЯМА втори PATCH, който да го върне в draft',
      !lp.some(p => p.body.status === 'draft'), JSON.stringify(lp.map(p => p.body)));
    ok('локално листът е sent',
      h.w.llLists.find(x => x.id === 'L1').status === 'sent',
      h.w.llLists.find(x => x.id === 'L1').status);

    ok('жълт toast с името на обекта',
      h.calls.toast.some(t => /известието до Петрич не тръгна/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
    ok('и цветът е жълт (#d97706), не червен',
      h.toasts.some(t => /не тръгна/.test(t.msg) && t.col === '#d97706'),
      JSON.stringify(h.toasts));
    ok('успешният toast за изпращането пак е излязъл',
      h.calls.toast.some(t => /Товарният лист е изпратен/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
  }

  section('г) Push мине ли, имейлът е провалил — НЕ е тревога');
  {
    /* Известието Е стигнало. Жълт toast тук би научил човека да ги пренебрегва. */
    const items = [it_({ id: 'i1', purchase_doc: 'D-100', store_name: 'Петрич' })];
    const h = env(WAREHOUSE, items, [L_DRAFT], { mailFail: true });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    realClick(h.w, btn(h.doc.getElementById('mod-loading'), '📤 Изпрати към обектите'));
    await ticks(); await ticks(); await ticks();
    ok('няма жълт toast', !h.calls.toast.some(t => /не тръгна/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
  }

  section('д) Обект без акаунт — отделно съобщение, не „провал"');
  {
    /* Това се оправя в Администрация, не по телефона. Смесването му с
       истинския провал прави и двете еднакво безполезни. */
    const items = [it_({ id: 'i1', purchase_doc: 'D-100', store_name: 'Гоце Делчев' })];
    const h = env(WAREHOUSE, items, [L_DRAFT],
      { users: [{ email: 'petrich@temax.bg', store_name: 'Петрич', active: true }] });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    realClick(h.w, btn(h.doc.getElementById('mod-loading'), '📤 Изпрати към обектите'));
    await ticks(); await ticks(); await ticks();

    ok('писмо не тръгва', h.mails.length === 0, JSON.stringify(h.mails.map(m => m.to)));
    ok('но push пак излиза', h.pushes.length === 1, JSON.stringify(h.pushes));
    ok('и пак НЕ до целия портал', h.pushAllCalls === 0, String(h.pushAllCalls));
    ok('съобщението казва точно това',
      h.calls.toast.some(t => /Без имейл акаунт: Гоце Делчев/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
    ok('и НЕ твърди, че известието не е тръгнало',
      !h.calls.toast.some(t => /не тръгна/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
  }

  section('е) Отказан confirm — нищо не се случва');
  {
    const items = [it_({ id: 'i1', purchase_doc: 'D-100' })];
    const h = env(WAREHOUSE, items, [L_DRAFT], { confirm: false });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    realClick(h.w, btn(h.doc.getElementById('mod-loading'), '📤 Изпрати към обектите'));
    await ticks(); await ticks();
    ok('нула PATCH', h.calls.patch.length === 0);
    ok('нула push', h.pushes.length === 0);
    ok('нула писма', h.mails.length === 0);
  }

  section('ж) Ред без обект не ражда известие до никого');
  {
    /* store_name е not null в схемата, но празен низ минава. Групирането по
       празен ключ би дало pushToStores(['']) → pushToAll(). */
    const items = [it_({ id: 'i1', purchase_doc: 'D-100', store_name: '' })];
    const h = env(WAREHOUSE, items, [L_DRAFT]);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    realClick(h.w, btn(h.doc.getElementById('mod-loading'), '📤 Изпрати към обектите'));
    await ticks(); await ticks(); await ticks();
    ok('листът пак е изпратен', patchesTo(h, 'loading_lists').length === 1);
    ok('нула push', h.pushes.length === 0, JSON.stringify(h.pushes));
    ok('и НУЛА до целия портал', h.pushAllCalls === 0, String(h.pushAllCalls));
    ok('нула писма', h.mails.length === 0);
  }

  report();
})();
