/* Трансфери — забележката и връзките на товара в картата и в списъците
   (16.10.2026, открито от колегите: Враца-0001, Монтана-0002 — вписват
   забележка и стокова, а ги виждаше само печатът).

   Какво заковава файлът:
   1. Товар с note + goods_doc + claims + КЗ + ТЗ → сивият ред
      (.trf-cargo-meta) в картата: „note · КЗ Троян-0042 · ТЗ ×1 ·
      Рекл. 1234 · СР 80477763" — същият строеж като печата (tfCargoLinks).
   2. Номерът на КЗ: картата се рисува веднага БЕЗ него, дотегля се с една
      заявка и се дорисува; повторно отваряне не пита пак.
   3. „<b>" в забележката е текст, не HTML.
   4. Товар без нищо → няма празен ред.
   5. Същият ред в „📥 За потвърждение при мен" и в „⏳ Чакащи прехвърляне".
   6. Редът с единиците остава ПОД мета реда; печатът носи същите връзки.

   Мутационна проверка (16.10.2026, всяка поотделно върху transfers.js):
     1. махната забележката от tfCargoMetaHtml        → пада 1
     2. махнат escVal в tfCargoMetaHtml               → пада 3
     3. махнат tfCargoMetaHtml от tfPendingHtml       → пада 5
   И трите събарят теста.

   Пускане:  node tests/transfers-card-note.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const STORES = ['Враца', 'Монтана', 'Лом', 'Централен офис'];
const U = function (store) { return { id: 'u-' + store, email: store + '@temax.bg', display_name: 'Управител ' + store, role: 'manager', store_name: store }; };

const T = { id: 't1', transfer_num: 'Враца-0001', from_store: 'Враца', mode: 'bus', depart_date: '2026-10-16', depart_time: '08:00',
            stops: [], end_store: 'Монтана', status: 'planned', created_at: '2026-10-16T06:00:00Z' };
const A = { id: 'a', transfer_id: 't1', position: 1, kind: 'carton', qty: 2, recipient_store: 'Монтана', transfer_points: [],
            note: '<b>чупливо</b>', goods_doc: '80477763', claim_numbers: ['1234'], client_order_ids: ['co1'], transport_order_ids: ['to1'] };
const B = { id: 'b', transfer_id: 't1', position: 2, kind: 'pallet', qty: 1, recipient_store: 'Монтана', transfer_points: [],
            note: null, goods_doc: null, claim_numbers: [], client_order_ids: [], transport_order_ids: [] };
/* Чакащ прехвърляне в Монтана */
const T2 = { id: 't2', transfer_num: 'Враца-0002', from_store: 'Враца', mode: 'bus', depart_date: '2026-10-15', depart_time: '08:00',
             stops: ['Монтана'], end_store: 'Лом', status: 'partial', created_at: '2026-10-15T06:00:00Z' };
const C = { id: 'c', transfer_id: 't2', position: 1, kind: 'roll', qty: 1, recipient_store: 'Лом', transfer_points: ['Монтана'],
            note: 'за склада', goods_doc: '555', claim_numbers: [], client_order_ids: [], transport_order_ids: [] };
const EV = [{ id: 'e1', cargo_id: 'c', transfer_id: 't2', event: 'unloaded', store_name: 'Монтана', unit: null, created_at: '2026-10-15T12:00:00Z' }];
const FULL = '<b>чупливо</b> · КЗ Троян-0042 · ТЗ ×1 · Рекл. 1234 · СР 80477763';

function env(user) {
  return boot({
    modules: ['stock-differences.js', 'transfers.js'],
    user: user,
    data: {
      users: STORES.map(function (s) { return { store_name: s }; }),
      transfers: [T, T2], transfer_cargo: [A, B, C], transfer_cargo_events: EV,
      client_orders: [{ id: 'co1', in_num: 'Троян-0042' }],
      transport_orders: [], loading_lists: [], loading_list_items: [], app_settings: []
    }
  });
}
const $ = function (h, s) { return h.doc.querySelector(s); };
const metaOf = function (root) { const m = root && root.querySelector('.trf-cargo-meta'); return m ? m.textContent : null; };
const coGets = function (h) { return h.calls.get.filter(function (u) { return /\/client_orders\?/.test(u) && /id=in\./.test(decodeURIComponent(u)); }).length; };

(async function () {

  section('1–4. Картата');
  {
    const h = env(U('Монтана'));
    h.w.showModule('transfers'); await ticks(); await ticks();
    h.w.openTransferCard('t1');
    const first = metaOf($(h, '.trf-card-cargo[data-c="a"]'));
    ok('рисува се веднага, още без КЗ', first === '<b>чупливо</b> · ТЗ ×1 · Рекл. 1234 · СР 80477763', first);
    await ticks(); await ticks();
    const rowA = $(h, '.trf-card-cargo[data-c="a"]');
    ok('след дотеглянето: пълният ред с „КЗ Троян-0042"', metaOf(rowA) === FULL, metaOf(rowA));
    ok('„<b>" е текст, не елемент', !rowA.querySelector('.trf-cargo-meta b'));
    ok('сив, малък ред', /font-size:12px/.test(rowA.querySelector('.trf-cargo-meta').getAttribute('style')));
    ok('товар без нищо → без мета ред', !$(h, '.trf-card-cargo[data-c="b"] .trf-cargo-meta'));
    const meta = rowA.querySelector('.trf-cargo-meta'), units = rowA.querySelector('.trf-units');
    ok('редът с единиците е ПОД мета реда', !!units && !!(meta.compareDocumentPosition(units) & 4));
    const n1 = coGets(h);
    h.w.closeTransferCard(); h.w.openTransferCard('t1'); await ticks();
    ok('КЗ се пита веднъж (кеш)', n1 === 1 && coGets(h) === 1, n1 + ' / ' + coGets(h));
    ok('и при повторно отваряне е с КЗ веднага', metaOf($(h, '.trf-card-cargo[data-c="a"]')) === FULL);
    h.close();
  }

  section('5. „📥 За потвърждение при мен" и „⏳ Чакащи прехвърляне"');
  {
    const h = env(U('Монтана'));
    h.w.showModule('transfers'); await ticks(); await ticks();
    h.w.tfSetFilter('mine'); await ticks(); await ticks();
    ok('„За потвърждение": редът на A носи забележката и връзките', metaOf($(h, '.trf-pending-row[data-c="a"]')) === FULL, metaOf($(h, '.trf-pending-row[data-c="a"]')));
    ok('„За потвърждение": B — без мета ред', !!$(h, '.trf-pending-row[data-c="b"]') && !$(h, '.trf-pending-row[data-c="b"] .trf-cargo-meta'));
    h.w.tfSetFilter('reship'); await ticks();
    ok('„Чакащи прехвърляне": C — „за склада · СР 555"', metaOf($(h, '.trf-reship-row[data-c="c"]')) === 'за склада · СР 555', metaOf($(h, '.trf-reship-row[data-c="c"]')));
    h.close();
  }

  section('6. Печатът — същите връзки');
  {
    const h = env(U('Монтана'));
    h.w.showModule('transfers'); await ticks(); await ticks();
    h.w.printTransfer('t1'); await ticks();
    const txt = ($(h, '#mod-print') || {}).textContent || '';
    ok('печатът: „КЗ Троян-0042, ТЗ ×1, Рекл. 1234, СР 80477763"', txt.indexOf('КЗ Троян-0042, ТЗ ×1, Рекл. 1234, СР 80477763') >= 0, txt.slice(0, 400));
    ok('tfCargoLinks без номер → „КЗ —" в печата, пропуснато в картата',
      h.w.tfCargoLinks({ client_order_ids: ['x'] }, {}).join() === 'КЗ —' && h.w.tfCargoLinks({ client_order_ids: ['x'] }, {}, true).length === 0);
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
