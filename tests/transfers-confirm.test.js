/* Междускладови трансфери — етап 2: потвърждаване по точки.

   Какво заковава файлът:
   1. БУС Кърджали → Пирдоп → Троян, товар за Троян с прехвърляне в Пирдоп:
      Пирдоп вижда „Разтоварен", Троян НЕ вижда „Получен" за този транспорт.
   2. Товар за Троян БЕЗ прехвърляне, през Пирдоп: Пирдоп не вижда нищо
      (транзитът не се отбелязва), Троян — „Получен".
   3. КУРИЕР: „Предаден" без снимка и без товарителница се отказва; с
      товарителница минава и тя се записва в транспорта.
   4. „Проблем" без коментар се отказва; с коментар — товарът остава за
      потвърждение; „Решен" — само изпращач или админ.
   5. СТАТУС Планиран → Частично → Завършен на граничните моменти и запис в
      transfers.status след всяка отметка; провал на този запис → червен toast.
   6. Сервиз Троян като получател.
   7. Печат: лого и история на товара.

   Пускане:  node tests/transfers-confirm.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, fire } = H;

const STORES = ['Кърджали', 'Пирдоп', 'Троян', 'Варна', 'Сервиз Троян', 'Централен офис'];
const U = function (store, role) { return { id: 'u-' + store, email: store + '@temax.bg', display_name: 'Управител ' + store, role: role || 'manager', store_name: store }; };
const ADMIN = { id: 'adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

/* Бус Кърджали → Пирдоп → Троян. */
const BUS = { id: 'b1', transfer_num: 'Кърджали-0001', from_store: 'Кърджали', mode: 'bus', depart_date: '2026-09-30', depart_time: '08:00',
              driver: 'Иван', stops: ['Пирдоп'], end_store: 'Троян', status: 'planned', created_at: '2026-09-29T08:00:00Z' };
const CARGO = [
  /* A: за Троян, но се разтоварва в Пирдоп и чака */
  { id: 'cA', transfer_id: 'b1', position: 1, kind: 'pallet', qty: 2, recipient_store: 'Троян', transfer_points: ['Пирдоп'] },
  /* B: за Троян, само минава през Пирдоп */
  { id: 'cB', transfer_id: 'b1', position: 2, kind: 'roll', qty: 1, recipient_store: 'Троян', transfer_points: [] }
];
const COURIER = { id: 'k1', transfer_num: 'Варна-0001', from_store: 'Варна', mode: 'courier', courier_company: 'Econt', waybill_no: null,
                  stops: [], end_store: 'Сервиз Троян', status: 'planned', created_at: '2026-09-29T09:00:00Z' };
const KCARGO = [{ id: 'cK', transfer_id: 'k1', position: 1, kind: 'carton', qty: 3, recipient_store: 'Сервиз Троян', transfer_points: [] }];

function env(user, opts) {
  opts = opts || {};
  /* Фалшивият PostgREST не пази POST-овете — тук отметките се пазят, за да
     ги върне следващото зареждане, както би направила базата. */
  const box = { h: null };
  const storedEvents = function () {
    const posted = box.h ? box.h.calls.post.filter(function (p) { return p.table === 'transfer_cargo_events'; })
      .map(function (p, i) { return Object.assign({ id: 'ev-' + i, created_at: '2026-09-30T1' + i + ':00:00Z' }, p.body); }) : [];
    return (opts.events || []).concat(posted);
  };
  const h = boot({
    modules: ['stock-differences.js', 'transfers.js'],
    user: user,
    data: {
      users: STORES.map(function (s) { return { store_name: s }; }),
      transfers: opts.transfers || [BUS, COURIER],
      transfer_cargo: opts.cargo || CARGO.concat(KCARGO),
      transfer_cargo_events: storedEvents,
      client_orders: [], transport_orders: [], loading_lists: [], loading_list_items: []
    },
    fail: opts.fail
  });
  box.h = h;
  return h;
}
const $ = function (h, s) { return h.doc.querySelector(s); };
const $$ = function (h, s) { return Array.prototype.slice.call(h.doc.querySelectorAll(s)); };
const posts = function (h, table) { return h.calls.post.filter(function (p) { return p.table === table; }); };
const patches = function (h, table) { return h.calls.patch.filter(function (p) { return p.table === table; }); };
const actsIn = function (root) { return root ? Array.prototype.map.call(root.querySelectorAll('.trf-act'), function (b) { return b.className.match(/trf-act-(\w+)/)[1]; }) : []; };
async function open(h) { h.w.showModule('transfers'); await ticks(); }
async function mine(h) { realClick(h.w, $(h, '.trf-filter[data-f="mine"]')); await ticks(); }
async function card(h, id) { realClick(h.w, H.btn($(h, '#trf-table tbody tr[data-id="' + id + '"]'), 'Отвори')); await ticks(); }
const cardCargo = function (h, cid) { return $(h, '.trf-card-cargo[data-c="' + cid + '"]'); };
function t0(h) { return h.w.tfTransfers.filter(function (t) { return t.id === 'b1'; })[0]; }

(async function () {

  section('1–2. Бус Кърджали → Пирдоп → Троян: кой какво вижда');
  {
    /* Пирдоп */
    const h = env(U('Пирдоп'));
    await open(h); await mine(h);
    const rows = $$(h, '.trf-pending-row').map(function (r) { return r.getAttribute('data-c'); });
    ok('Пирдоп: за потвърждение е само A', rows.join(',') === 'cA', rows.join(','));
    ok('Пирдоп: при A бутонът е „Разтоварен"', actsIn($(h, '.trf-pending-row[data-c="cA"]')).indexOf('unloaded') >= 0);
    await open(h); await card(h, 'b1');
    ok('Пирдоп в картата: при B няма нито един бутон (само минава)', actsIn(cardCargo(h, 'cB')).length === 0, actsIn(cardCargo(h, 'cB')).join(','));
    ok('Пирдоп в картата: при A — „Разтоварен" и „Проблем", без „Получен"',
       actsIn(cardCargo(h, 'cA')).join(',') === 'unloaded,problem', actsIn(cardCargo(h, 'cA')).join(','));
    h.close();

    /* Троян */
    const h2 = env(U('Троян'));
    await open(h2); await mine(h2);
    const rows2 = $$(h2, '.trf-pending-row').map(function (r) { return r.getAttribute('data-c'); });
    ok('Троян: за потвърждение е само B', rows2.join(',') === 'cB', rows2.join(','));
    await open(h2); await card(h2, 'b1');
    ok('Троян НЕ вижда „Получен" при A (разтоварва се в Пирдоп)', actsIn(cardCargo(h2, 'cA')).indexOf('received') < 0, actsIn(cardCargo(h2, 'cA')).join(','));
    ok('Троян вижда „Получен" при B', actsIn(cardCargo(h2, 'cB')).indexOf('received') >= 0);
    ok('правилото: Троян не може „Получен" за A', /Пирдоп/.test(h2.w.tfEventAllowed('received', BUS, CARGO[0], [], 'Троян', false) || ''));
    ok('правилото: Пирдоп не може „Проблем" за B (не е по маршрута му)', !!h2.w.tfEventAllowed('problem', BUS, CARGO[1], [], 'Пирдоп', false));
    h2.close();

    /* Пирдоп отбелязва „Разтоварен" с истински клик */
    const h3 = env(U('Пирдоп'));
    await open(h3); await mine(h3);
    realClick(h3.w, $(h3, '.trf-pending-row[data-c="cA"] .trf-act-unloaded')); await ticks();
    ok('прозорчето е отворено', !!$(h3, '#tfe-ov'));
    realClick(h3.w, $(h3, '#tfe-save')); await ticks();
    const ev = (posts(h3, 'transfer_cargo_events')[0] || {}).body || {};
    ok('записът: unloaded, Пирдоп, товар A', ev.event === 'unloaded' && ev.store_name === 'Пирдоп' && ev.cargo_id === 'cA' && ev.transfer_id === 'b1', JSON.stringify(ev));
    await open(h3); await card(h3, 'b1');
    ok('A вече „чака прехвърляне в Пирдоп"', /чака прехвърляне в Пирдоп/.test(cardCargo(h3, 'cA').querySelector('.trf-state').textContent));
    h3.close();
  }

  section('3. Куриер: „Предаден" иска снимка или товарителница');
  {
    const h = env(U('Варна'));
    await open(h); await mine(h);
    realClick(h.w, $(h, '.trf-pending-row[data-c="cK"] .trf-act-handed_to_courier')); await ticks();
    realClick(h.w, $(h, '#tfe-save')); await ticks();
    ok('без снимка и без № — отказ, нищо не е записано', posts(h, 'transfer_cargo_events').length === 0);
    ok('грешката е във формата', /снимка или въведи № товарителница/.test(($(h, '#tfe-error') || {}).textContent || ''), ($(h, '#tfe-error') || {}).textContent);
    const wb = $(h, '#tfe-waybill'); wb.value = '1055501234'; fire(h.w, wb, 'input');
    realClick(h.w, $(h, '#tfe-save')); await ticks();
    const ev = (posts(h, 'transfer_cargo_events')[0] || {}).body || {};
    ok('с № — записано като handed_to_courier с товарителницата', ev.event === 'handed_to_courier' && ev.waybill_no === '1055501234', JSON.stringify(ev));
    const p = (patches(h, 'transfers')[0] || {}).body || {};
    ok('товарителницата е записана и в транспорта', p.waybill_no === '1055501234', JSON.stringify(p));
    ok('статусът става „Частично изпълнен" (partial) в същия запис', p.status === 'partial', JSON.stringify(p));
    ok('с вече записана товарителница в транспорта — не се иска нова',
       h.w.tfValidateEvent('handed_to_courier', { photos: [] }, Object.assign({}, COURIER, { waybill_no: 'X1' })) === null);
    ok('със снимка без № — валидно', h.w.tfValidateEvent('handed_to_courier', { photos: [{ url: 'u' }] }, COURIER) === null);
    ok('„Предаден" само от изпращача', !!h.w.tfEventAllowed('handed_to_courier', COURIER, KCARGO[0], [], 'Сервиз Троян', false));
    ok('„Предаден" не важи за бус', !!h.w.tfEventAllowed('handed_to_courier', BUS, CARGO[1], [], 'Кърджали', false));
    h.close();
  }

  section('4. Проблем: коментарът е задължителен; товарът остава; „Решен" — изпращач/админ');
  {
    const h = env(U('Троян'));
    await open(h); await card(h, 'b1');
    realClick(h.w, cardCargo(h, 'cB').querySelector('.trf-act-problem')); await ticks();
    const pk = $(h, '#tfe-pkind'); pk.value = 'missing'; fire(h.w, pk, 'change');
    realClick(h.w, $(h, '#tfe-save')); await ticks();
    ok('проблем без коментар — отказ', posts(h, 'transfer_cargo_events').length === 0 && /коментар/.test(($(h, '#tfe-error') || {}).textContent || ''));
    const cm = $(h, '#tfe-comment'); cm.value = 'липсва 1 руло'; fire(h.w, cm, 'input');
    realClick(h.w, $(h, '#tfe-save')); await ticks();
    const ev = (posts(h, 'transfer_cargo_events')[0] || {}).body || {};
    ok('проблемът е записан: missing + коментар', ev.event === 'problem' && ev.problem_kind === 'missing' && ev.comment === 'липсва 1 руло', JSON.stringify(ev));
    await open(h); await mine(h);
    ok('товарът остава за потвърждение („Получен" е още там)', actsIn($(h, '.trf-pending-row[data-c="cB"]')).indexOf('received') >= 0);
    ok('получателят НЕ може „Решен"', actsIn($(h, '.trf-pending-row[data-c="cB"]')).indexOf('resolved') < 0);
    await open(h); realClick(h.w, $(h, '.trf-filter[data-f="problems"]')); await ticks();
    ok('филтър „Проблеми": проблемът се вижда', $$(h, '.trf-problem-row').length === 1);
    const probId = h.w.tfEvents.filter(function (e) { return e.event === 'problem'; })[0].id;
    h.close();

    const evs = [{ id: 'p1', cargo_id: 'cB', transfer_id: 'b1', store_name: 'Троян', event: 'problem', problem_kind: 'damaged', comment: 'смачкано', created_at: '2026-09-30T10:00:00Z' }];
    ok('изпращачът може „Решен"', env(U('Кърджали')).w.tfEventAllowed('resolved', BUS, CARGO[1], evs, 'Кърджали', false) === null);
    ok('обект по маршрута, който не е изпращач — не може', !!env(U('Троян')).w.tfEventAllowed('resolved', BUS, CARGO[1], evs, 'Троян', false));

    const ha = env(ADMIN, { events: evs });
    await open(ha); realClick(ha.w, $(ha, '.trf-filter[data-f="problems"]')); await ticks();
    realClick(ha.w, $(ha, '.trf-problem-row .trf-act-resolved')); await ticks();
    realClick(ha.w, $(ha, '#tfe-save')); await ticks();
    const r = (posts(ha, 'transfer_cargo_events')[0] || {}).body || {};
    ok('админ решава: resolved, resolves_id = p1', r.event === 'resolved' && r.resolves_id === 'p1', JSON.stringify(r));
    await open(ha); realClick(ha.w, $(ha, '.trf-filter[data-f="problems"]')); await ticks();
    ok('след „Решен" проблемът изчезва от филтъра', $$(ha, '.trf-problem-row').length === 0);
    ha.close();
    ok('(ид на записания проблем е наличен в паметта)', !!probId);
  }

  section('5. Статус: Планиран → Частично → Завършен');
  {
    const h = env(U('Пирдоп'));
    const w = h.w;
    const st = function (evs) { return w.tfComputeStatus(BUS, CARGO, evs); };
    ok('0 отметки → planned, 0/2', st([]).status === 'planned' && st([]).done === 0);
    const onlyProblem = [{ id: 'e0', cargo_id: 'cB', event: 'problem', store_name: 'Троян' }];
    ok('само проблем → partial (има отметка), 0/2', st(onlyProblem).status === 'partial' && st(onlyProblem).done === 0);
    const one = [{ id: 'e1', cargo_id: 'cA', event: 'unloaded', store_name: 'Пирдоп' }];
    ok('1 от 2 крайни → partial, 1/2', st(one).status === 'partial' && st(one).done === 1);
    const wrongPlace = [{ id: 'e2', cargo_id: 'cA', event: 'received', store_name: 'Троян' }];
    ok('„Получен" на грешното място не приключва A', st(wrongPlace).done === 0);
    const both = one.concat([{ id: 'e3', cargo_id: 'cB', event: 'received', store_name: 'Троян' }]);
    ok('2 от 2 → done, 2/2', st(both).status === 'done' && st(both).done === 2);
    h.close();

    /* През UI: първата отметка → PATCH partial; последната → PATCH done. */
    const h1 = env(U('Пирдоп'));
    await open(h1); await mine(h1);
    realClick(h1.w, $(h1, '.trf-act-unloaded')); await ticks();
    realClick(h1.w, $(h1, '#tfe-save')); await ticks();
    ok('първата отметка → transfers.status = partial', (patches(h1, 'transfers')[0] || {}).body && patches(h1, 'transfers')[0].body.status === 'partial', JSON.stringify(patches(h1, 'transfers')));
    ok('прогресът е 1/2 в картата', /1\/2/.test(h1.w.tfProgressLabel(t0(h1))));
    h1.close();

    const h2 = env(U('Троян'), { events: [{ id: 'e1', cargo_id: 'cA', transfer_id: 'b1', event: 'unloaded', store_name: 'Пирдоп', created_at: '2026-09-30T09:00:00Z' }],
                                 transfers: [Object.assign({}, BUS, { status: 'partial' }), COURIER] });
    await open(h2);
    ok('списъкът: „1/2 товара"', /1\/2 товара/.test($(h2, '#trf-table tr[data-id="b1"] .trf-progress').textContent));
    await mine(h2);
    realClick(h2.w, $(h2, '.trf-act-received')); await ticks();
    realClick(h2.w, $(h2, '#tfe-save')); await ticks();
    ok('последната крайна отметка → transfers.status = done', (patches(h2, 'transfers')[0] || {}).body && patches(h2, 'transfers')[0].body.status === 'done', JSON.stringify(patches(h2, 'transfers')));
    ok('списъкът показва „Завършен"', h2.w.tfComputeStatus(t0(h2), CARGO, h2.w.tfEventsOf('b1')).status === 'done');
    h2.close();

    /* Провал на записа на статуса → червен toast, отметката остава. */
    const h3 = env(U('Пирдоп'), { fail: { PATCH: /\/transfers\?/ } });
    await open(h3); await mine(h3);
    realClick(h3.w, $(h3, '.trf-act-unloaded')); await ticks();
    realClick(h3.w, $(h3, '#tfe-save')); await ticks();
    ok('провал на статуса → червен toast', h3.calls.toast.some(function (t) { return /НЕ е обновен/.test(String(t)); }), JSON.stringify(h3.calls.toast));
    ok('отметката остава записана', posts(h3, 'transfer_cargo_events').length === 1);
    h3.close();
  }

  section('6. Сервиз Троян като получател');
  {
    const h = env(U('Сервиз Троян', 'user'));
    await open(h);
    ok('вижда куриерския транспорт (получател)', !!$(h, '#trf-table tr[data-id="k1"]'));
    ok('не вижда буса (не участва)', !$(h, '#trf-table tr[data-id="b1"]'));
    await mine(h);
    ok('без „Предаден" още — „Получен" е наличен за товара', actsIn($(h, '.trf-pending-row[data-c="cK"]')).indexOf('received') >= 0);
    realClick(h.w, $(h, '.trf-pending-row[data-c="cK"] .trf-act-received')); await ticks();
    realClick(h.w, $(h, '#tfe-save')); await ticks();
    const ev = (posts(h, 'transfer_cargo_events')[0] || {}).body || {};
    ok('записът е от името на „Сервиз Троян"', ev.event === 'received' && ev.store_name === 'Сервиз Троян', JSON.stringify(ev));
    ok('„Сервиз Троян" е в списъка с обекти на формата', h.w.tfStoreList.indexOf('Сервиз Троян') >= 0, h.w.tfStoreList.join(','));
    h.close();
  }

  section('7. Печат: лого и история');
  {
    const evs = [{ id: 'e1', cargo_id: 'cA', transfer_id: 'b1', event: 'unloaded', store_name: 'Пирдоп', comment: 'в склада', created_at: '2026-09-30T09:00:00Z' }];
    const h = env(ADMIN, { events: evs });
    await open(h);
    realClick(h.w, H.btn($(h, '#trf-table tr[data-id="b1"]'), 'Печат')); await ticks();
    const pr = h.doc.getElementById('mod-print');
    ok('логото на ТеМАХ е в печата', !!pr.querySelector('img.tf-logo') && /^data:image\/png;base64,/.test(pr.querySelector('img.tf-logo').getAttribute('src')));
    ok('историята на товара е в печата', /История на товарите/.test(pr.textContent) && /Пирдоп/.test(pr.querySelector('.tf-hist').textContent) && /в склада/.test(pr.textContent));
    ok('статусът с прогрес: „Частично изпълнен · 1/2 товара"', /Частично изпълнен · 1\/2 товара/.test(pr.textContent));
    h.close();
  }

  section('8. Снимки в историята: миниатюра, не емотикон');
  {
    const U1 = 'https://xiwkdiqqplgdcrkewgtv.supabase.co/storage/v1/object/public/bulletin-files/transfers/b1/1.jpg';
    const U2 = 'https://xiwkdiqqplgdcrkewgtv.supabase.co/storage/v1/object/public/bulletin-files/transfers/b1/2.jpg';
    const evs = [
      { id: 'e1', cargo_id: 'cA', transfer_id: 'b1', event: 'unloaded', store_name: 'Пирдоп', comment: 'в склада',
        photos: [{ url: U1, name: 'a.jpg' }, { url: U2, name: 'b.jpg' }], created_at: '2026-09-30T09:00:00Z' },
      { id: 'e2', cargo_id: 'cB', transfer_id: 'b1', event: 'problem', problem_kind: 'damaged', store_name: 'Троян', comment: 'смачкано',
        photos: [], created_at: '2026-09-30T10:00:00Z' }
    ];
    const h = env(ADMIN, { events: evs });
    await open(h); await card(h, 'b1');
    const liA = cardCargo(h, 'cA').querySelector('.trf-history li');
    const imgs = liA ? Array.prototype.slice.call(liA.querySelectorAll('img')) : [];
    ok('отметка с 2 снимки → 2 миниатюри <img>', imgs.length === 2, String(imgs.length));
    ok('src е адресът на снимката', imgs[0] && imgs[0].getAttribute('src') === U1 && imgs[1].getAttribute('src') === U2);
    ok('40×40, object-fit:cover, с рамка', imgs[0] && /width:40px/.test(imgs[0].getAttribute('style')) && /height:40px/.test(imgs[0].getAttribute('style')) &&
       /object-fit:cover/.test(imgs[0].getAttribute('style')) && /border:1px solid/.test(imgs[0].getAttribute('style')));
    const a = imgs[0] && imgs[0].parentNode;
    ok('кликаема → пълният размер в нов таб', a && a.tagName === 'A' && a.getAttribute('href') === U1 && a.getAttribute('target') === '_blank');
    ok('без „📷" в реда', liA && liA.textContent.indexOf('📷') < 0, liA && liA.textContent);
    const liB = cardCargo(h, 'cB').querySelector('.trf-history li');
    ok('отметка без снимка → без <img>', liB && liB.querySelectorAll('img').length === 0);

    /* „Проблеми": проблем със снимка — миниатюра и там. */
    const h2 = env(ADMIN, { events: [Object.assign({}, evs[1], { photos: [{ url: U1 }] })] });
    await open(h2); realClick(h2.w, $(h2, '.trf-filter[data-f="problems"]')); await ticks();
    const pimg = $(h2, '.trf-problem-row img');
    ok('„Проблеми": миниатюрата е там', pimg && pimg.getAttribute('src') === U1);
    h2.close();

    /* Печат: „Снимка 1, Снимка 2" като текст, без <img> на снимките. */
    await open(h);
    realClick(h.w, H.btn($(h, '#trf-table tr[data-id="b1"]'), 'Печат')); await ticks();
    const pr = h.doc.getElementById('mod-print');
    const hist = pr.querySelector('.tf-hist');
    ok('печат: „Снимка 1, Снимка 2" в историята', hist && /Снимка 1, Снимка 2/.test(hist.textContent), hist && hist.textContent);
    ok('печат: без <img> на снимките (само логото)', pr.querySelectorAll('img').length === 1 && !!pr.querySelector('img.tf-logo'));
    ok('печат: без „📷"', hist && hist.textContent.indexOf('📷') < 0);
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
