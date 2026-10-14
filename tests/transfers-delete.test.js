/* Трансфери — находките от прегледа за инструкцията (14.10.2026).

   Какво заковава файлът:
   a) Планиран транспорт, създалият го обект → бутон „🗑 Изтрий" в картата;
      истински клик → confirm → DELETE transfer_cargo ПРЕДИ DELETE transfers,
      зелен toast, картата се затваря. Предупрежденията в confirm за товар,
      дотоварен от друг обект, и за товар, прехвърлен от чакащите.
   b) Същият транспорт, спирка по маршрута → <button> НЯМА.
   c) Админ → бутон има.
   d) Транспорт с една отметка (само „Проблем") → бутон няма; deleteTransfer()
      направо → toast с причината и нула DELETE заявки.
   e) DELETE transfers пада след успешен DELETE transfer_cargo → червен toast.
   f) Находка 2: supply (ЦО) не вижда „+ Нов транспорт"; при админа селектът
      „От" е без „Централен офис"; обект Троян — бутонът има.
   g) Находка 3: админът вижда „Чакащи прехвърляне (всички обекти)" в брояча
      и във филтъра; обектът — „при мен"; празният текст без „при теб".

   Мутационна проверка (14.10.2026, всяка поотделно върху transfers.js):
     1. махната проверката за отметки в tfCanDelete      → пада d)
     2. разменен редът на двете DELETE в deleteTransfer   → пада a) и e)
     3. махнат филтърът по tfStoreList в tfCreatorStores  → пада f)
   И трите събарят теста.

   Пускане:  node tests/transfers-delete.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick } = H;

const STORES = ['Кърджали', 'Пирдоп', 'Троян', 'Варна', 'Централен офис'];
const U = function (store, role) { return { id: 'u-' + store, email: store + '@temax.bg', display_name: 'Управител ' + store, role: role || 'manager', store_name: store }; };
const ADMIN = { id: 'adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const SUPPLY = { id: 'sup', email: 'sup@temax.bg', display_name: 'Снабдяване', role: 'supply', store_name: 'Централен офис' };

/* Планиран бус Кърджали → Пирдоп → Троян: товар, дотоварен от Пирдоп, и
   товар, прехвърлен от чакащите. */
const BUS = { id: 'b1', transfer_num: 'Кърджали-0007', from_store: 'Кърджали', mode: 'bus', depart_date: '2026-10-15', depart_time: '08:00',
              driver: 'Иван', stops: ['Пирдоп'], end_store: 'Троян', status: 'planned', created_at: '2026-10-14T08:00:00Z' };
const CARGO = [
  { id: 'c1', transfer_id: 'b1', position: 1, kind: 'pallet', qty: 1, recipient_store: 'Троян', transfer_points: [] },
  { id: 'c2', transfer_id: 'b1', position: 2, kind: 'roll', qty: 1, recipient_store: 'Троян', transfer_points: [], loaded_at_store: 'Пирдоп' },
  { id: 'c3', transfer_id: 'b1', position: 3, kind: 'carton', qty: 2, recipient_store: 'Троян', transfer_points: [], prev_cargo_id: 'old1' }
];
/* Втори транспорт на Кърджали — с една отметка „Проблем". */
const BUS2 = Object.assign({}, BUS, { id: 'b2', transfer_num: 'Кърджали-0008', created_at: '2026-10-14T09:00:00Z' });
const CARGO2 = [{ id: 'c9', transfer_id: 'b2', position: 1, kind: 'pallet', qty: 1, recipient_store: 'Троян', transfer_points: [] }];
const EV2 = [{ id: 'e1', transfer_id: 'b2', cargo_id: 'c9', event: 'problem', problem_kind: 'damaged', comment: 'смачкан', store_name: 'Троян', created_at: '2026-10-14T10:00:00Z' }];

function env(user, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['stock-differences.js', 'transfers.js'],
    user: user,
    data: {
      users: STORES.map(function (s) { return { store_name: s }; }),
      transfers: [BUS, BUS2],
      transfer_cargo: CARGO.concat(CARGO2),
      transfer_cargo_events: EV2,
      client_orders: [], transport_orders: [], loading_lists: [], loading_list_items: []
    },
    fail: opts.fail,
    confirm: opts.confirm
  });
  /* Цветът на toast-а — harness-ът пази само текста. */
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ m: m, red: c === '#dc2626' }); return orig(m, c); };
  return h;
}
const $ = function (h, s) { return h.doc.querySelector(s); };
async function open(h) { h.w.showModule('transfers'); await ticks(); }
async function card(h, id) { realClick(h.w, H.btn($(h, '#trf-table tbody tr[data-id="' + id + '"]'), 'Отвори')); await ticks(); }
const delBtn = function (h) { const b = $(h, '#trf-delete'); return b && b.tagName === 'BUTTON' ? b : null; };
const delUrls = function (h) { return h.calls.del.slice(); };

(async function () {

  section('a) Създалият обект изтрива планиран транспорт');
  {
    const h = env(U('Кърджали'));
    await open(h);
    ok('в списъка няма бутон „Изтрий"', !$(h, '#trf-table #trf-delete') && !/Изтрий/.test($(h, '#trf-table').textContent));
    await card(h, 'b1');
    ok('картата е отворена', !!$(h, '#trf-card'));
    const b = delBtn(h);
    ok('бутон #trf-delete има (<button>)', !!b);
    ok('правилото: tfCanDelete === null', h.w.tfCanDelete(BUS) === null, String(h.w.tfCanDelete(BUS)));
    realClick(h.w, b); await ticks();
    const cm = h.calls.confirm[0] || '';
    ok('confirm с номера и броя товари', /Изтриване на Кърджали-0007 с 3 товара\. Номерът остава изразходван\. Продължавам\?/.test(cm), cm);
    ok('confirm: предупреждение за дотоварен от Пирдоп', /Внимание: има товар, дотоварен от Пирдоп/.test(cm), cm);
    ok('confirm: предупреждение за прехвърлен от чакащите', /прехвърлен от чакащите — той ще се върне в „Чакащи прехвърляне“/.test(cm), cm);
    const d = delUrls(h);
    ok('две DELETE заявки', d.length === 2, JSON.stringify(d));
    ok('първо transfer_cargo по transfer_id', /\/transfer_cargo\?transfer_id=eq\.b1$/.test(d[0] || ''), d[0]);
    ok('после transfers по id', /\/transfers\?id=eq\.b1$/.test(d[1] || ''), d[1]);
    const last = h.toasts[h.toasts.length - 1] || {};
    ok('зелен toast „🗑 Изтрит транспорт Кърджали-0007"', last.m === '🗑 Изтрит транспорт Кърджали-0007' && !last.red, JSON.stringify(last));
    ok('картата е затворена (списък)', !$(h, '#trf-card') && h.w.tfCardId === null && !!$(h, '#trf-table'));
    h.close();

    /* confirm = не → нищо не се трие */
    const h2 = env(U('Кърджали'), { confirm: false });
    await open(h2); await card(h2, 'b1');
    realClick(h2.w, delBtn(h2)); await ticks();
    ok('отказ в confirm → нула DELETE', h2.calls.del.length === 0);
    h2.close();
  }

  section('b) Спирка по маршрута не трие');
  {
    const h = env(U('Пирдоп'));
    await open(h); await card(h, 'b1');
    ok('Пирдоп вижда картата', !!$(h, '#trf-card'));
    ok('Пирдоп: <button> „Изтрий" няма', !delBtn(h));
    ok('причината', h.w.tfCanDelete(BUS) === 'Изтрива създалият го обект или админ.', String(h.w.tfCanDelete(BUS)));
    h.w.deleteTransfer('b1'); await ticks();
    ok('deleteTransfer направо → нула DELETE', h.calls.del.length === 0);
    h.close();
  }

  section('c) Админът трие');
  {
    const h = env(ADMIN);
    await open(h); await card(h, 'b1');
    ok('админ: бутон има', !!delBtn(h));
    h.close();
  }

  section('d) Транспорт с отметка (само „Проблем") не се трие');
  {
    const h = env(U('Кърджали'));
    await open(h); await card(h, 'b2');
    ok('картата на b2 е отворена', !!$(h, '#trf-card'));
    ok('бутон няма', !delBtn(h));
    h.w.deleteTransfer('b2'); await ticks();
    const last = h.toasts[h.toasts.length - 1] || {};
    ok('toast с причината', last.m === 'Транспортът вече има отметки.' && last.red, JSON.stringify(last));
    ok('нула DELETE заявки', h.calls.del.length === 0, JSON.stringify(h.calls.del));
    ok('нула confirm', h.calls.confirm.length === 0);
    const ha = env(ADMIN);
    await open(ha); await card(ha, 'b2');
    ok('и за админа бутон няма', !delBtn(ha));
    ha.close();
    h.close();
  }

  section('e) Провал на DELETE transfers след успешните товари');
  {
    const h = env(U('Кърджали'), { fail: { DELETE: /\/transfers\?/ } });
    await open(h); await card(h, 'b1');
    realClick(h.w, delBtn(h)); await ticks();
    ok('двете заявки са тръгнали', h.calls.del.length === 2);
    const last = h.toasts[h.toasts.length - 1] || {};
    ok('червен toast „транспортът остана"', last.red && /Товарите са изтрити, но транспортът остана — опресни и опитай пак/.test(last.m), JSON.stringify(last));
    ok('няма зелен „Изтрит"', !h.toasts.some(function (t) { return /Изтрит транспорт/.test(t.m); }));

    const h2 = env(U('Кърджали'), { fail: { DELETE: /\/transfer_cargo\?/ } });
    await open(h2); await card(h2, 'b1');
    realClick(h2.w, delBtn(h2)); await ticks();
    ok('провал на товарите → стоп, само една заявка', h2.calls.del.length === 1);
    const l2 = h2.toasts[h2.toasts.length - 1] || {};
    ok('червен toast „Товарите НЕ са изтрити"', l2.red && /^Товарите НЕ са изтрити: /.test(l2.m), JSON.stringify(l2));
    h.close(); h2.close();
  }

  section('f) Находка 2: ЦО не създава транспорт');
  {
    const hs = env(SUPPLY);
    await open(hs);
    ok('supply/ЦО: няма #trf-new', !$(hs, '#trf-new'));
    ok('supply/ЦО: tfCreatorStores е празен', hs.w.tfCreatorStores().length === 0, JSON.stringify(hs.w.tfCreatorStores()));
    hs.close();

    const ht = env(U('Троян'));
    await open(ht);
    ok('Троян: #trf-new има', !!$(ht, '#trf-new'));
    ht.close();

    const ha = env(ADMIN);
    await open(ha);
    ok('админ: #trf-new има', !!$(ha, '#trf-new'));
    realClick(ha.w, $(ha, '#trf-new')); await ticks();
    const sel = $(ha, '#trf-from');
    const opts = sel ? Array.prototype.map.call(sel.options, function (o) { return o.value; }) : [];
    ok('селектът #trf-from е наличен и с обекти', !!sel && opts.indexOf('Кърджали') >= 0, JSON.stringify(opts));
    ok('#trf-from е без „Централен офис"', opts.indexOf('Централен офис') < 0, JSON.stringify(opts));
    ha.close();
  }

  section('g) Находка 3: етикетът за офиса');
  {
    const ha = env(ADMIN);
    await open(ha);
    const cnt = $(ha, '#trf-counters .trf-counter[data-k="reship"]');
    const flt = $(ha, '.trf-filter[data-f="reship"]');
    ok('админ, броячът: „(всички обекти)"', !!cnt && /Чакащи прехвърляне \(всички обекти\)/.test(cnt.textContent) && !/при мен/.test(cnt.textContent), cnt && cnt.textContent);
    ok('админ, филтърът: „(всички обекти)"', !!flt && /Чакащи прехвърляне \(всички обекти\)/.test(flt.textContent) && !/при мен/.test(flt.textContent), flt && flt.textContent);
    realClick(ha.w, flt); await ticks();
    const empty = ($(ha, '#trf-reship') || {}).textContent || '';
    ok('админ, празно: без „при теб"', empty === 'Няма товари, които чакат прехвърляне.', empty);
    ha.close();

    const hk = env(U('Кърджали'));
    await open(hk);
    const c2 = $(hk, '#trf-counters .trf-counter[data-k="reship"]');
    const f2 = $(hk, '.trf-filter[data-f="reship"]');
    ok('обект, броячът: „при мен"', !!c2 && /Чакащи прехвърляне при мен/.test(c2.textContent), c2 && c2.textContent);
    ok('обект, филтърът: „при мен"', !!f2 && /Чакащи прехвърляне при мен/.test(f2.textContent), f2 && f2.textContent);
    realClick(hk.w, f2); await ticks();
    const e2 = ($(hk, '#trf-reship') || {}).textContent || '';
    ok('обект, празно: „при теб"', e2 === 'Няма товари, които чакат прехвърляне при теб.', e2);
    hk.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
