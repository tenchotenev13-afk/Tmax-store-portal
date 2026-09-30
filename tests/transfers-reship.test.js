/* Междускладови трансфери — етап 3: прехвърляне на чакащ товар.

   Модел (Тенчо, 30.09.2026): товар, разтоварен в точка на прехвърляне P
   („⏸ чака прехвърляне"), продължава, когато P го сложи на следващ
   транспорт — (а) нов транспорт от P или (б) „➕ Дотовари" на бус през P.
   В новия транспорт се създава НОВ ред transfer_cargo с prev_cargo_id към
   стария; копират се вид, брой, получател, връзки, рекламации, стокова,
   забележка; точките = оставащите СЛЕД P. Уникален индекс по prev_cargo_id —
   един товар се прехвърля веднъж.

   Какво заковава файлът:
     1) „⏳ Чакащи прехвърляне при мен" — Пирдоп вижда товара с дните чакане;
        чужд обект (Карлово, точка по-нататък) не вижда чужди чакащи.
     2) (а) Пирдоп създава нов транспорт към Троян с „➕ От чакащите":
        заключен ред, нов ред с prev_cargo_id, оставащите точки [Карлово],
        копираните връзки. След това товарът не е сред чакащите.
     3) Веригата: в новата карта „продължение на Козлодуй-0001 #1" с
        отметките от стария транспорт; в старата — „продължава в
        Пирдоп-0003 #1"; същото в печата.
     4) Втори опит: вече прехвърлен товар не може да се добави; ако друга
        сесия го е прехвърлила междувременно — базата връща 23505 и
        съобщението е ясно, транспортът без товари се трие.
     5) (б) Същото чрез „➕ Дотовари" на бус, който минава през Пирдоп.
     6) Търсенето намира ПОСЛЕДНОТО звено с пътя — включително от Козлодуй,
        който не участва в новия транспорт.
     7) Дните чакане на граница 0 / 1 / 7 (календарни, местно време).

   Пускане:  node tests/transfers-reship.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, fire } = H;

const STORES = ['Козлодуй', 'Пирдоп', 'Карлово', 'Троян', 'Сливен', 'Варна', 'Централен офис'];
const U = function (store, role) { return { id: 'u-' + store, email: store + '@temax.bg', display_name: 'Управител ' + store, role: role || 'manager', store_name: store }; };

/* Козлодуй → Пирдоп → Сливен. c1 е за Троян през Пирдоп и Карлово. */
const T1 = { id: 't1', transfer_num: 'Козлодуй-0001', from_store: 'Козлодуй', mode: 'bus', depart_date: '2026-09-27', depart_time: '07:00',
             driver: 'Иван', stops: ['Пирдоп'], end_store: 'Сливен', status: 'partial', created_at: '2026-09-27T05:00:00Z' };
const C1 = { id: 'c1', transfer_id: 't1', position: 1, kind: 'pallet', qty: 2, recipient_store: 'Троян', transfer_points: ['Пирдоп', 'Карлово'],
             note: 'стъкло', client_order_ids: ['co-7'], transport_order_ids: ['to-3'], claim_numbers: ['РК-9'], goods_doc: 'СР-555', loading_item_id: 'll-1' };
const C2 = { id: 'c2', transfer_id: 't1', position: 2, kind: 'roll', qty: 1, recipient_store: 'Сливен', transfer_points: [],
             note: null, client_order_ids: [], transport_order_ids: [], claim_numbers: [], goods_doc: null };
const E1 = { id: 'e1', transfer_id: 't1', cargo_id: 'c1', store_name: 'Пирдоп', event: 'unloaded', created_at: '2026-09-28T09:00:00Z', photos: [] };
/* Бус, който минава през Пирдоп: Сливен → Пирдоп → Карлово → Троян. */
const T2 = { id: 't2', transfer_num: 'Сливен-0002', from_store: 'Сливен', mode: 'bus', depart_date: '2026-09-30', depart_time: '10:00',
             driver: 'Петър', stops: ['Пирдоп', 'Карлово'], end_store: 'Троян', status: 'planned', created_at: '2026-09-30T06:00:00Z' };
const C9 = { id: 'c9', transfer_id: 't2', position: 1, kind: 'carton', qty: 1, recipient_store: 'Троян', transfer_points: [],
             note: null, client_order_ids: [], transport_order_ids: [], claim_numbers: [], goods_doc: null };

/* ── Мини-PostgREST: филтрира наистина (or=, in., eq.), пази записите и
   прилага уникалния индекс по prev_cargo_id. ── */
function mkDb(opts) {
  const db = {
    transfers: (opts.transfers || [T1]).map(x => Object.assign({}, x)),
    cargo: (opts.cargo || [C1, C2]).map(x => Object.assign({}, x)),
    events: (opts.events || [E1]).map(x => Object.assign({}, x)),
    n: 0
  };
  return db;
}
function q(url) { return decodeURIComponent((url.split('?')[1] || '')); }
function inList(qs, col) {
  const m = new RegExp('(?:^|&)' + col + '=in\\.\\(([^)]*)\\)').exec(qs);
  return m ? m[1].split(',') : null;
}
function orMatch(qs, row) {
  const m = /(?:^|&)or=\((.*?)\)(?=&|$)/.exec(qs);
  if (!m) return true;
  return m[1].split(',').some(function (cond) {
    const p = /^([a-z_]+)\.(eq|cs)\.(.*)$/.exec(cond);
    if (!p) return false;
    if (p[2] === 'eq') return row[p[1]] === p[3];
    const v = p[3].replace(/^\{"|"\}$/g, '');
    return (row[p[1]] || []).indexOf(v) >= 0;
  });
}
function filterRows(rows, url, cols) {
  const qs = q(url);
  return rows.filter(function (r) {
    for (const c of cols) { const l = inList(qs, c); if (l && l.indexOf(String(r[c])) < 0) return false; }
    return orMatch(qs, r);
  }).map(r => JSON.parse(JSON.stringify(r)));
}

function env(user, opts) {
  opts = opts || {};
  const db = opts.db || mkDb(opts);
  const h = boot({
    modules: ['stock-differences.js', 'transfers.js'],
    user: user,
    data: {
      users: STORES.map(s => ({ store_name: s })),
      transfers: url => filterRows(db.transfers, url, ['id']),
      transfer_cargo: url => filterRows(db.cargo, url, ['id', 'transfer_id', 'prev_cargo_id']),
      transfer_cargo_events: url => filterRows(db.events, url, ['transfer_id']),
      client_orders: [], transport_orders: [], loading_lists: [], loading_list_items: []
    }
  });
  const inner = h.w.fetch;
  const reply = (status, body) => ({ ok: status < 400, status: status,
    json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
  h.w.fetch = function (url, init) {
    const method = ((init && init.method) || 'GET').toUpperCase();
    if (method === 'POST' && /\/rest\/v1\/transfers(\?|$)/.test(url)) {
      return inner(url, init).then(function () {
        const body = JSON.parse(init.body);
        db.n++;
        const row = Object.assign({}, body, { id: 't-new-' + db.n, transfer_num: body.from_store + '-000' + (2 + db.n), created_at: '2026-09-30T08:0' + db.n + ':00Z' });
        db.transfers.push(row);
        return reply(201, [row]);
      });
    }
    if (method === 'POST' && /\/rest\/v1\/transfer_cargo(\?|$)/.test(url)) {
      return inner(url, init).then(function () {
        const rows = [].concat(JSON.parse(init.body));
        /* transfer_cargo_prev_uidx */
        const clash = rows.filter(r => r.prev_cargo_id && db.cargo.some(c => c.prev_cargo_id === r.prev_cargo_id))[0];
        if (clash) return reply(409, { code: '23505', message: 'duplicate key value violates unique constraint "transfer_cargo_prev_uidx"' });
        rows.forEach(function (r) { db.n++; db.cargo.push(Object.assign({ id: 'nc-' + db.n }, r)); });
        return reply(201, null);
      });
    }
    if (method === 'DELETE' && /\/rest\/v1\/transfers\?/.test(url)) {
      return inner(url, init).then(function () {
        const id = /id=eq\.([^&]+)/.exec(url);
        if (id) db.transfers = db.transfers.filter(t => t.id !== decodeURIComponent(id[1]));
        return reply(204, null);
      });
    }
    return inner(url, init);
  };
  h.db = db;
  return h;
}
const $ = (h, s) => h.doc.querySelector(s);
const $$ = (h, s) => Array.prototype.slice.call(h.doc.querySelectorAll(s));
const posts = (h, table) => h.calls.post.filter(p => p.table === table);
function setSel(h, el, v) { el.value = v; fire(h.w, el, 'change'); }
function setInp(h, el, v) { el.value = v; fire(h.w, el, 'input'); }
async function open(h) { h.w.showModule('transfers'); await ticks(); await ticks(); }
async function filter(h, f) { realClick(h.w, $(h, '.trf-filter[data-f="' + f + '"]')); await ticks(); }
async function card(h, id) { realClick(h.w, H.btn($(h, '#trf-table tbody tr[data-id="' + id + '"]'), 'Отвори')); await ticks(); }
const reshipRows = h => $$(h, '.trf-reship-row').map(r => r.getAttribute('data-c'));
const newCargo = h => h.db.cargo.filter(c => c.prev_cargo_id);

(async function () {

  section('1) „⏳ Чакащи прехвърляне при мен"');
  {
    const h = env(U('Пирдоп'));
    await open(h);
    const b = $(h, '.trf-filter[data-f="reship"]');
    ok('филтърът е до „За потвърждение при мен", с брой (1)', !!b && /Чакащи прехвърляне при мен \(1\)/.test(b.textContent), b && b.textContent);
    await filter(h, 'reship');
    ok('Пирдоп вижда c1', reshipRows(h).join(',') === 'c1', reshipRows(h).join(','));
    const row = $(h, '.trf-reship-row[data-c="c1"]');
    ok('от кой транспорт и какво: Козлодуй-0001 · #1 Палет ×2 → Троян', row && /Козлодуй-0001/.test(row.textContent) && /Палет ×2 → Троян/.test(row.textContent), row && row.textContent);
    ok('колко дни чака — от датата на отметката', row && !!row.querySelector('.trf-wait') &&
      Number(row.querySelector('.trf-wait').getAttribute('data-days')) === h.w.tfWaitDays(E1.created_at), row && row.querySelector('.trf-wait').outerHTML);
    ok('c2 (без прехвърляне) не е сред чакащите', reshipRows(h).indexOf('c2') < 0);
    h.close();

    const k = env(U('Карлово'));
    await open(k);
    ok('Карлово вижда транспорта (точка по-нататък)', !!$(k, '#trf-table tr[data-id="t1"]'));
    await filter(k, 'reship');
    ok('но НЕ вижда чакащия в Пирдоп товар', reshipRows(k).length === 0, reshipRows(k).join(','));
    k.close();

    const v = env(U('Варна'));
    await open(v);
    ok('Варна (не участва) — няма чакащи и не вижда транспорта', v.w.tfReshipItems(['Пирдоп'], '').length === 0 && !$(v, '#trf-table tr[data-id="t1"]'));
    v.close();
  }

  section('2) (а) нов транспорт от Пирдоп с „➕ От чакащите"');
  const db = mkDb({});
  {
    const h = env(U('Пирдоп'), { db: db });
    await open(h);
    realClick(h.w, $(h, '#trf-new')); await ticks(); await ticks();
    const pick = $(h, '#trf-from-pending');
    ok('бутонът „➕ От чакащите (1)" е във формата', !!pick && /От чакащите \(1\)/.test(pick.textContent), pick && pick.textContent);
    realClick(h.w, pick); await ticks();
    realClick(h.w, $(h, '.trf-pick-pending[data-c="c1"]')); await ticks();
    const locked = $(h, '.trf-cargo-locked');
    ok('добавен е заключен ред (и замества празния)', !!locked && $$(h, '.trf-cargo').length === 1);
    ok('заключеният ред е само за четене — без полета за вид/брой/получател',
      locked && !locked.querySelector('select') && !locked.querySelector('input'));
    ok('оставащите точки са видими: Карлово', locked && /Точки на прехвърляне: Карлово/.test(locked.querySelector('.trf-locked-points').textContent));
    ok('„продължение на Козлодуй-0001 #1"', locked && /продължение на Козлодуй-0001 #1/.test(locked.textContent));
    ok('бутонът изчезва — нищо друго не чака', !$(h, '#trf-from-pending'));
    /* Маршрут: Пирдоп → Карлово → Троян. */
    realClick(h.w, $(h, '#trf-add-stop')); await ticks();
    setSel(h, $(h, '.trf-stop'), 'Карлово'); await ticks();
    setSel(h, $(h, '#trf-end'), 'Троян'); await ticks();
    setSel(h, $(h, '#trf-time'), '14:00');
    realClick(h.w, $(h, '#trf-save')); await ticks(); await ticks(); await ticks();
    const nc = newCargo(h);
    ok('записан е нов ред с prev_cargo_id = c1', nc.length === 1 && nc[0].prev_cargo_id === 'c1', JSON.stringify(nc));
    const r = nc[0] || {};
    ok('в новия транспорт от Пирдоп', h.db.transfers.some(t => t.id === r.transfer_id && t.from_store === 'Пирдоп'));
    ok('точките = оставащите след Пирдоп: [Карлово]', JSON.stringify(r.transfer_points) === '["Карлово"]', JSON.stringify(r.transfer_points));
    ok('копирани: вид, брой, получател', r.kind === 'pallet' && r.qty === 2 && r.recipient_store === 'Троян', JSON.stringify(r));
    ok('копирани връзки: КЗ, ТЗ, рекламация, стокова, забележка',
      JSON.stringify(r.client_order_ids) === '["co-7"]' && JSON.stringify(r.transport_order_ids) === '["to-3"]' &&
      JSON.stringify(r.claim_numbers) === '["РК-9"]' && r.goods_doc === 'СР-555' && r.note === 'стъкло', JSON.stringify(r));
    ok('ред от товарен лист НЕ се копира', r.loading_item_id === null, String(r.loading_item_id));
    ok('старият ред не е пипан', !h.calls.patch.some(p => p.table === 'transfer_cargo') && h.db.cargo.find(c => c.id === 'c1').transfer_id === 't1');
    await filter(h, 'reship');
    ok('след прехвърлянето c1 НЕ е сред чакащите', reshipRows(h).length === 0, reshipRows(h).join(','));
    h.close();
  }

  section('3) веригата в картите и в печата');
  {
    const h = env(U('Пирдоп'), { db: db });
    await open(h);
    const newT = db.transfers.find(t => t.from_store === 'Пирдоп');
    await card(h, newT.id);
    const nb = $(h, '.trf-card-cargo');
    ok('новата карта: „↩ продължение на Козлодуй-0001 #1" (линк)', nb && /продължение на Козлодуй-0001 #1/.test(nb.querySelector('.trf-chain-prev').textContent) && !!nb.querySelector('.trf-chain-prev a'));
    ok('историята носи отметката от стария транспорт', nb && nb.querySelectorAll('.trf-hist-prev').length === 1 &&
      /Козлодуй-0001.*Пирдоп.*Разтоварен/.test(nb.querySelector('.trf-hist-prev').textContent), nb && nb.innerHTML.slice(0, 600));
    realClick(h.w, nb.querySelector('.trf-chain-prev a')); await ticks();
    ok('линкът отваря старата карта', h.w.tfCardId === 't1');
    const ob = $(h, '.trf-card-cargo[data-c="c1"]');
    ok('старата карта: „↪ продължава в ' + newT.transfer_num + ' #1"', ob && new RegExp('продължава в ' + newT.transfer_num + ' #1').test(ob.querySelector('.trf-chain-next').textContent), ob && ob.textContent);
    ok('и състоянието е „прехвърлен", не „чака"', ob && /прехвърлен в/.test(ob.querySelector('.trf-state').textContent) && !/чака прехвърляне/.test(ob.querySelector('.trf-state').textContent));
    realClick(h.w, H.btn($(h, '#trf-card'), 'Печат')); await ticks(); await ticks();
    const pr = $(h, '#mod-print').textContent;
    ok('печатът на стария: „продължава в …"', new RegExp('продължава в ' + newT.transfer_num + ' #1').test(pr), pr.slice(0, 300));
    h.w.printTransfer(newT.id); await ticks(); await ticks();
    const pr2 = $(h, '#mod-print').textContent;
    ok('печатът на новия: „продължение на Козлодуй-0001 #1" и старата отметка в историята',
      /продължение на Козлодуй-0001 #1/.test(pr2) && /Козлодуй-0001 · .*Пирдоп · Разтоварен/.test(pr2), pr2.slice(0, 600));
    h.close();
  }

  section('4) втори опит за същия товар → отказ');
  {
    const h = env(U('Пирдоп'), { db: db });
    await open(h);
    realClick(h.w, $(h, '#trf-new')); await ticks();
    ok('„➕ От чакащите" го няма — нищо не чака', !$(h, '#trf-from-pending'));
    h.w.tfAddReshipCargo('c1'); await ticks();
    ok('директното добавяне се отказва', h.w.tfForm.cargo.every(c => !c.prev_cargo_id) &&
      h.calls.toast.some(t => /не чака прехвърляне/.test(String(t))), JSON.stringify(h.calls.toast));
    /* Формата е заредена, ПРЕДИ друга сесия да прехвърли: tfValidate знае. */
    const f = { from_store: 'Пирдоп', mode: 'bus', depart_date: '2026-09-30', depart_time: '10:00', stops: ['Карлово'], end_store: 'Троян',
                cargo: [Object.assign(h.w.tfNewCargo(), { kind: 'pallet', qty: 2, recipient_store: 'Троян', transfer_points: ['Карлово'],
                                                          prev_cargo_id: 'c1', locked: true, reship_from: 'Пирдоп' })] };
    ok('tfValidate: „вече е прехвърлен в …"', /вече е прехвърлен в Пирдоп-000\d #1/.test(h.w.tfValidate(f) || ''), h.w.tfValidate(f));
    h.close();

    /* Базата: друга сесия прехвърля c3 между зареждането и записа. */
    const C3 = Object.assign({}, C1, { id: 'c3', position: 3, goods_doc: 'СР-777' });
    const E3 = Object.assign({}, E1, { id: 'e3', cargo_id: 'c3' });
    const db2 = mkDb({ cargo: [C1, C2, C3], events: [E1, E3] });
    const h2 = env(U('Пирдоп'), { db: db2 });
    await open(h2);
    realClick(h2.w, $(h2, '#trf-new')); await ticks();
    realClick(h2.w, $(h2, '#trf-from-pending')); await ticks();
    realClick(h2.w, $(h2, '.trf-pick-pending[data-c="c3"]')); await ticks();
    realClick(h2.w, $(h2, '#trf-add-stop')); await ticks();
    setSel(h2, $(h2, '.trf-stop'), 'Карлово'); await ticks();
    setSel(h2, $(h2, '#trf-end'), 'Троян'); await ticks();
    setSel(h2, $(h2, '#trf-time'), '15:00');
    db2.cargo.push({ id: 'other', transfer_id: 'tx', position: 1, prev_cargo_id: 'c3', kind: 'pallet', qty: 2, recipient_store: 'Троян', transfer_points: [] });
    realClick(h2.w, $(h2, '#trf-save')); await ticks(); await ticks(); await ticks();
    ok('базата отказва (23505) — не се създава втори наследник', db2.cargo.filter(c => c.prev_cargo_id === 'c3').length === 1);
    ok('съобщението е ясно: „вече е прехвърлен"', h2.calls.toast.some(t => /вече е прехвърлен в друг транспорт/.test(String(t))), JSON.stringify(h2.calls.toast));
    ok('транспортът без товари се трие', !db2.transfers.some(t => t.from_store === 'Пирдоп'), JSON.stringify(db2.transfers.map(t => t.transfer_num)));
    h2.close();
  }

  section('5) (б) чрез „➕ Дотовари" на бус, който минава през Пирдоп');
  {
    const db3 = mkDb({ transfers: [T1, T2], cargo: [C1, C2, C9], events: [E1] });
    const h = env(U('Пирдоп'), { db: db3 });
    await open(h);
    await card(h, 't2');
    realClick(h.w, $(h, '.trf-reload')); await ticks(); await ticks();
    ok('формата за дотоварване има „➕ От чакащите (1)"', /От чакащите \(1\)/.test(($(h, '#trf-from-pending') || {}).textContent || ''));
    realClick(h.w, $(h, '#trf-from-pending')); await ticks();
    realClick(h.w, $(h, '.trf-pick-pending[data-c="c1"]')); await ticks();
    ok('заключен ред във формата', !!$(h, '.trf-cargo-locked'));
    realClick(h.w, $(h, '#trf-save')); await ticks(); await ticks(); await ticks();
    const r = db3.cargo.filter(c => c.prev_cargo_id === 'c1')[0] || {};
    ok('нов ред в Сливен-0002 с prev_cargo_id = c1, позиция 2', r.transfer_id === 't2' && r.position === 2, JSON.stringify(r));
    ok('дотоварен в Пирдоп; точки [Карлово]', r.loaded_at_store === 'Пирдоп' && JSON.stringify(r.transfer_points) === '["Карлово"]', JSON.stringify(r));
    ok('връзките са копирани', r.goods_doc === 'СР-555' && JSON.stringify(r.client_order_ids) === '["co-7"]');
    const nc = $(h, '.trf-card-cargo[data-c="' + r.id + '"]');
    ok('в картата: „· дотоварен в Пирдоп" и „продължение на Козлодуй-0001 #1"', nc && /дотоварен в Пирдоп/.test(nc.textContent) && /продължение на Козлодуй-0001 #1/.test(nc.textContent), nc && nc.textContent);
    h.close();
  }

  section('6) търсенето намира последното звено с пътя');
  {
    const h = env(U('Пирдоп'), { db: db });
    await open(h);
    const el = $(h, '#trf-csearch'); setInp(h, el, 'СР-555');
    realClick(h.w, $(h, '#trf-csearch-go')); await ticks(); await ticks();
    const hits = $$(h, '.trf-cargo-hit');
    const newT = db.transfers.find(t => t.from_store === 'Пирдоп');
    ok('един резултат — звената на една верига са един ред', hits.length === 1, String(hits.length));
    ok('резултатът е НОВИЯТ транспорт (там е товарът сега)', hits[0] && hits[0].getAttribute('data-t') === newT.id, hits[0] && hits[0].outerHTML.slice(0, 200));
    ok('пътят: „Козлодуй-0001 #1 → ' + newT.transfer_num + ' #1"', hits[0] && hits[0].querySelector('.trf-cargo-path') &&
      hits[0].querySelector('.trf-cargo-path').textContent.indexOf('Козлодуй-0001 #1 → ' + newT.transfer_num + ' #1') >= 0);
    ok('последното движение е от новото звено — „в път"', hits[0] && /в път/.test(hits[0].querySelector('.trf-cargo-last').textContent));
    h.close();

    /* Козлодуй не участва в новия транспорт — звеното се дозарежда. */
    const k = env(U('Козлодуй'), { db: db });
    await open(k);
    ok('Козлодуй НЕ вижда новия транспорт в списъка', !$(k, '#trf-table tr[data-id="' + newT.id + '"]'));
    const el2 = $(k, '#trf-csearch'); setInp(k, el2, 'СР-555');
    realClick(k.w, $(k, '#trf-csearch-go')); await ticks(); await ticks();
    const h2 = $$(k, '.trf-cargo-hit');
    ok('но търсенето му показва последното звено', h2.length === 1 && h2[0].getAttribute('data-t') === newT.id, h2.map(x => x.getAttribute('data-t')).join(','));
    realClick(k.w, h2[0]); await ticks();
    ok('и кликът отваря картата на новия транспорт', !!$(k, '#trf-card') && k.w.tfCardId === newT.id);
    k.close();
  }

  section('7) дните чакане на граница');
  {
    const h = env(U('Пирдоп'));
    const w = h.w;
    const L = (y, mo, d, hh, mi) => new w.Date(y, mo - 1, d, hh, mi).toISOString();
    ok('0: отметка 00:05 днес, сега 23:55', w.tfWaitDays(L(2026, 9, 30, 0, 5), L(2026, 9, 30, 23, 55)) === 0);
    ok('1: отметка 23:55 вчера, сега 00:05 — календарен ден, не 24 часа', w.tfWaitDays(L(2026, 9, 29, 23, 55), L(2026, 9, 30, 0, 5)) === 1);
    ok('7: точно седмица', w.tfWaitDays(L(2026, 9, 23, 12, 0), L(2026, 9, 30, 8, 0)) === 7);
    ok('текст: 0 → „чака от днес", 1 → „чака 1 ден", 7 → „чака 7 дни"',
      w.tfWaitText(0) === 'чака от днес' && w.tfWaitText(1) === 'чака 1 ден' && w.tfWaitText(7) === 'чака 7 дни');
    ok('отметка в бъдещето не дава отрицателно', w.tfWaitDays(L(2026, 10, 2, 9, 0), L(2026, 9, 30, 9, 0)) === 0);
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
