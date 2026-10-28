/* „➖ Минуси", етап 4б — „вероятно незаприходена стока" (27.10.2026, решение
   на Тенчо). Интеграционно: shared.js + client-orders.js + revaluation.js +
   revisions.js + notifications.js + minusi.js в реда от index.html.

   Правилото: същият обект + код (trim) и
     а) goods_transit със status pending / sent → „🚚 На път: <док> от <дд.мм>
        · <ост.> <ед.>"; rejected („✕ Неприето") → „🚚 Неприето: …" — обектът
        казва, че не е дошло, а минусът показва, че е продадено (решение на
        Тенчо 27.10, второ — първото го изключваше); само received не свети;
     б) stock_differences на бланка с direction 'interstore', status ≠
        'received', с липса: документ − получено > 0, а при празно „получено"
        и категория undelivered — документът (решение на Тенчо 27.10) →
        „⚖️ Разлика ЛС от <дд.мм> · липса <N>".
   Поне едно → „⚠ вероятно незаприходена стока".

   Фалшивият PostgREST прилага САМО филтрите, които заявката реално носи
   (status=in., status=neq., store_name=in., differences_reports.direction=eq.),
   за да не скрие мутант, който е махнал филтъра и от заявката, и от кода.
   Живите заявки са пуснати с anon ключа на 27.10 — goods_transit (169 реда за
   Гоце Делчев + Сливен, двата на ГД са 98262 / 103603) и вградената
   stock_differences + differences_reports!inner (образец bulletin.js).

   Мутационна проверка (27.10.2026) — всеки вариант пуснат и паднал:
     U1 rejected изпада (махнат от MN_UR_TRANSIT — и от заявката, и от
        кода) → падат заявката (status=in.), „rejected → „🚚 Неприето““ (обект
        и офис) и Excel „неприето: …“;
     U2 липсата с обратен знак (получено − документ) → падат „липса 3“,
        „излишък → нищо“, трите чипа при 40001 и още (10);
     U3 без резервата „само документ + undelivered“ → падат „липса 4“ и
        надписът (2);
     U4 ключът без обекта (само код) → пада „„Всички обекти“: ГД 30001 → пак
        нищо“ (1). В изгледа на един обект оцелява — заявката вече е само за
        този обект;
     U5 посоката не се проверява (нито в заявката, нито в кода) → падат
        заявката, „supplier → нищо“ и „wrong_receipt → нищо“ (3).
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const GD = { email: 'managergdelchev@temax.bg', display_name: 'Управител ГД', role: 'manager', store_name: 'Гоце Делчев' };
const ADMIN = { email: 'm.pavlova@temax.bg', display_name: 'Миглена', role: 'admin', store_name: 'Централен офис' };
const PLANTS = [{ plant: '7519', store_name: 'Гоце Делчев' }, { plant: '5514', store_name: 'Шумен' }];
const REASONS = [{ id: 1, label: 'клиентска поръчка (номер/дата)', active: true, sort: 1, requires_note: true }];
const GDN = 'Гоце Делчев', SH = 'Шумен';

let seq = 0;
const mv = (material, store) => ({
  id: 'mv-' + (++seq), plant: store === SH ? '5514' : '7519', store_name: store || GDN, material, material_desc: 'АРТИКУЛ ' + material,
  mvt_type: '955', qty: 1, uom: 'БР', mat_doc: '49033' + String(seq).padStart(5, '0'), doc_item: '1', doc_year: 2026, posting_date: '2026-10-20',
  real_code: null, reason_id: null, employee_name: null, note: null, action: null, filled_by: null, filled_at: null
});
const MOVS = () => { seq = 0; return [
  mv('10001'), mv('10002'), mv('10003'), mv('10004'),            /* 1–4  pending / sent / received / rejected */
  mv('20001'), mv('20002'), mv('20003'), mv('20004'), mv('20005'), /* 5–9  разлики */
  mv('20006'), mv('20007'),                                         /* 10–11 само документ: undelivered / excess */
  mv('30001'), mv('30001', SH),                                     /* 12–13 друг обект */
  mv('40001'), mv('50000')                                          /* 14 и двете; 15 нищо */
]; };
const gt = (store, code, status, doc, date, qty, unit) => ({ id: 'gt-' + code + '-' + doc, store_name: store, material_code: code, purchase_doc: doc, doc_date: date, remaining_qty: qty, unit, status });
const TRANSIT = [
  gt(GDN, '10001', 'pending', '4600186703', '2026-08-27', 36.48, 'M2'),
  gt(GDN, ' 10002 ', 'sent', '4600190503', '2026-09-26', 4.32, 'M2'),
  gt(GDN, '10003', 'received', '4600111111', '2026-09-01', 2, 'БР'),
  gt(GDN, '10004', 'rejected', '4600122222', '2026-09-02', 2, 'БР'),
  gt(SH, '30001', 'pending', '4600133333', '2026-09-03', 5, 'БР'),
  gt(GDN, '40001', 'sent', '4600144444', '2026-09-10', 1, 'БР'),
  gt(GDN, '40001', 'pending', '4600144400', '2026-09-05', 3, 'БР')
];
let dn = 0;
const sd = (store, code, dir, status, q, qr, cat, docDate) => ({ id: 'sd-' + (++dn), store_name: store, material_code: code, quantity: q, quantity_received: qr, difference_category: cat || null, status, created_at: '2026-10-1' + (dn % 9) + 'T10:00:00+00:00', differences_reports: { direction: dir, doc_date: docDate || '2026-10-15' } });
const DIFFS = [
  sd(GDN, '20001', 'interstore', 'new', 10, 7, 'undelivered', '2026-10-14'),
  sd(GDN, '20002', 'interstore', 'received', 10, 7, 'undelivered'),
  sd(GDN, '20003', 'interstore', 'new', 5, 8, 'excess'),
  sd(GDN, '20004', 'supplier', 'new', 10, 7, 'undelivered'),
  sd(GDN, '20005', 'wrong_receipt', 'new', 10, 7, 'billed_not_received'),
  sd(GDN, '20006', 'interstore', 'new', 4, null, 'undelivered', '2026-10-16'),
  sd(GDN, '20007', 'interstore', 'new', 4, null, 'excess'),
  sd(SH, '30001', 'interstore', 'new', 2, 0, 'undelivered', '2026-10-17'),
  sd(GDN, '40001', 'interstore', 'new', 6, 4, null, '2026-10-18')
];

function resp(status, body) {
  const t = body == null ? '' : JSON.stringify(body);
  return Promise.resolve({ ok: status < 300, status, json: () => t ? Promise.resolve(JSON.parse(t)) : Promise.reject(new SyntaxError('empty')), text: () => Promise.resolve(t) });
}
/* Само филтрите, които заявката носи. */
function pgFilter(rows, q) {
  const ins = (q.match(/(?:^|&)store_name=in\.\(([^)]*)\)/) || [])[1];
  const stIn = (q.match(/(?:^|&)status=in\.\(([^)]*)\)/) || [])[1];
  const stNeq = (q.match(/(?:^|&)status=neq\.([^&]+)/) || [])[1];
  const dir = (q.match(/(?:^|&)differences_reports\.direction=eq\.([^&]+)/) || [])[1];
  return rows.filter(r =>
    (!ins || ins.split(',').map(s => s.replace(/^"|"$/g, '')).indexOf(r.store_name) >= 0) &&
    (!stIn || stIn.split(',').indexOf(r.status) >= 0) &&
    (!stNeq || r.status !== stNeq) &&
    (!dir || (r.differences_reports && r.differences_reports.direction === dir)));
}
function install(h, db) {
  h.w.fetch = function (url, init) {
    const m = ((init && init.method) || 'GET').toUpperCase();
    const u = String(url);
    const tbl = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    const q = decodeURIComponent(u.split('?')[1] || '');
    db.log.push({ m, tbl, q });
    if (m !== 'GET') return resp(405, { message: 'not in fake' });
    if (tbl === 'app_settings') return resp(200, [{ key: 'minus_stores', value: 'Гоце Делчев, Шумен' }]);
    if (tbl === 'minus_plants') return resp(200, PLANTS);
    if (tbl === 'minus_reasons') return resp(200, REASONS);
    if (tbl === 'minus_movements') {
      if (/offset=[1-9]/.test(q)) return resp(200, []);
      const st = (q.match(/store_name=eq\.([^&]+)/) || [])[1];
      return resp(200, db.movs.filter(x => !st || x.store_name === st).map(x => Object.assign({}, x)));
    }
    if (/offset=[1-9]/.test(q)) return resp(200, []);
    if (tbl === 'goods_transit') return db.failTransit ? resp(500, { message: 'boom' }) : resp(200, pgFilter(TRANSIT, q).map(x => Object.assign({}, x)));
    if (tbl === 'stock_differences') return db.failDiff ? resp(500, { message: 'boom' }) : resp(200, pgFilter(DIFFS, q).map(x => JSON.parse(JSON.stringify(x))));
    return resp(200, []);
  };
}
function env(user, db) {
  const h = boot({ modules: ['client-orders.js', 'revaluation.js', 'revisions.js', 'notifications.js', 'minusi.js'], user, data: {} });
  install(h, db);
  return h;
}
const fakeDb = o => Object.assign({ movs: MOVS(), log: [] }, o || {});
async function open(h) { await h.w.loadMinusi(); await ticks(8); }
const row = (h, id) => h.doc.getElementById('mn-row-' + id);
const chips = (h, id) => { const r = row(h, id); return r ? Array.from(r.querySelectorAll('.mn-ur-transit, .mn-ur-diff')).map(c => c.textContent) : null; };
const warn = (h, id) => { const r = row(h, id); return !!(r && r.querySelector('.mn-ur-warn')); };
const J = JSON.stringify;

(async function run() {

  section('1. Обектът (Гоце Делчев) — съвпадения');
  {
    const db = fakeDb(); const h = env(GD, db); await open(h);
    const gq = db.log.filter(x => x.tbl === 'goods_transit'), dq = db.log.filter(x => x.tbl === 'stock_differences');
    ok('по една заявка към goods_transit и stock_differences', gq.length === 1 && dq.length === 1, gq.length + '/' + dq.length);
    ok('goods_transit: явен select, pending/sent/rejected (без received), само обекта', /^select=id,store_name,material_code,purchase_doc,doc_date,remaining_qty,unit,status&/.test(gq[0].q) && /status=in\.\(pending,sent,rejected\)/.test(gq[0].q) && /store_name=in\.\("Гоце Делчев"\)/.test(gq[0].q), gq[0].q);
    ok('stock_differences: вградена бланка, interstore, ≠ received, само обекта', /differences_reports!inner\(direction,doc_date\)/.test(dq[0].q) && /differences_reports\.direction=eq\.interstore/.test(dq[0].q) && /status=neq\.received/.test(dq[0].q) && /store_name=in\.\("Гоце Делчев"\)/.test(dq[0].q), dq[0].q);
    ok('на път pending → „🚚 На път: 4600186703 от 27.08 · 36,48 M2“', J(chips(h, 'mv-1')) === J(['🚚 На път: 4600186703 от 27.08 · 36,48 M2']), J(chips(h, 'mv-1')));
    ok('на път sent (код с интервали) → чип', J(chips(h, 'mv-2')) === J(['🚚 На път: 4600190503 от 26.09 · 4,32 M2']), J(chips(h, 'mv-2')));
    ok('на път received → нищо', chips(h, 'mv-3').length === 0 && !warn(h, 'mv-3'));
    ok('rejected („✕ Неприето“) → „🚚 Неприето: 4600122222 от 02.09 · 2 БР“ + надпис', J(chips(h, 'mv-4')) === J(['🚚 Неприето: 4600122222 от 02.09 · 2 БР']) && warn(h, 'mv-4'), J(chips(h, 'mv-4')));
    ok('received → нищо (и без надпис)', chips(h, 'mv-3').length === 0 && !warn(h, 'mv-3'));
    ok('interstore липса (10 / 7), отворена → „⚖️ Разлика ЛС от 14.10 · липса 3“', J(chips(h, 'mv-5')) === J(['⚖️ Разлика ЛС от 14.10 · липса 3']), J(chips(h, 'mv-5')));
    ok('interstore received → нищо', chips(h, 'mv-6').length === 0);
    ok('излишък (5 / 8) → нищо', chips(h, 'mv-7').length === 0, J(chips(h, 'mv-7')));
    ok('supplier → нищо', chips(h, 'mv-8').length === 0, J(chips(h, 'mv-8')));
    ok('wrong_receipt → нищо', chips(h, 'mv-9').length === 0, J(chips(h, 'mv-9')));
    ok('само документ + undelivered → „липса 4“', J(chips(h, 'mv-10')) === J(['⚖️ Разлика ЛС от 16.10 · липса 4']), J(chips(h, 'mv-10')));
    ok('само документ + excess → нищо', chips(h, 'mv-11').length === 0, J(chips(h, 'mv-11')));
    ok('друг обект (Шумен) → нищо в ГД', chips(h, 'mv-12').length === 0, J(chips(h, 'mv-12')));
    ok('и двете → три чипа (два на път по дата + разлика)', J(chips(h, 'mv-14')) === J(['🚚 На път: 4600144400 от 05.09 · 3 БР', '🚚 На път: 4600144444 от 10.09 · 1 БР', '⚖️ Разлика ЛС от 18.10 · липса 2']), J(chips(h, 'mv-14')));
    ok('надпис „⚠ вероятно незаприходена стока“ при съвпадение', warn(h, 'mv-1') && warn(h, 'mv-5') && warn(h, 'mv-10') && warn(h, 'mv-14'));
    ok('надписът е червен и под чиповете', (() => { const w = row(h, 'mv-14').querySelector('.mn-ur-warn'); return /color:#b91c1c/.test(w.getAttribute('style')) && w.textContent === '⚠ вероятно незаприходена стока' && !w.nextElementSibling; })());
    ok('без съвпадение → нищо', chips(h, 'mv-15').length === 0 && !warn(h, 'mv-15'));
    ok('в клетката на описанието, без нова колона (th 10)', !!row(h, 'mv-1').querySelectorAll('td')[1].querySelector('.mn-ur-warn') && h.doc.querySelectorAll('#mn-daily thead th').length === 10);
    ok('чиповете не са nowrap', !Array.from(h.doc.querySelectorAll('.mn-ur-transit, .mn-ur-diff')).some(c => /nowrap/.test(c.getAttribute('style'))));
    ok('без сив ред за грешка', !h.doc.getElementById('mn-ur-err'));

    section('2. Excel и печат');
    const aoa = h.w.mnExportAoa();
    const last = aoa[0].length - 1;
    ok('Excel: последна колона „Незаприходена?“, преди нея „КЗ“', aoa[0][last] === 'Незаприходена?' && aoa[0][last - 1] === 'КЗ', J(aoa[0].slice(-2)));
    const xv = m => (aoa.filter(r => r[0] === m)[0] || [])[last];
    ok('Excel: на път → „на път: 4600186703“', xv('10001') === 'на път: 4600186703', xv('10001'));
    ok('Excel: разлика → „разлика ЛС“', xv('20001') === 'разлика ЛС', xv('20001'));
    ok('Excel: и двете → „на път: 4600144400, 4600144444; разлика ЛС“', xv('40001') === 'на път: 4600144400, 4600144444; разлика ЛС', xv('40001'));
    ok('Excel: rejected → „неприето: 4600122222“', xv('10004') === 'неприето: 4600122222', xv('10004'));
    ok('Excel: нищо / received → празно', xv('50000') === '' && xv('10003') === '', J([xv('50000'), xv('10003')]));
    h.w.mnPrint();
    const pr = h.doc.getElementById('mod-print');
    const prRows = Array.from(pr.querySelectorAll('.mn-ptbl tr')).slice(1);
    const prOf = m => prRows.filter(tr => tr.cells[0].textContent === m)[0];
    ok('печат: надписът под описанието при 20001', /⚠ вероятно незаприходена стока/.test(prOf('20001').cells[1].textContent));
    ok('печат: без надпис при 50000', !/незаприходена/.test(prOf('50000').cells[1].textContent));
    ok('печат: без нова колона (th 9)', pr.querySelectorAll('.mn-ptbl th').length === 9);

    section('3. Търсенето и „По артикул“ — без промяна');
    h.w.showModule && h.w.showModule('minusi');
    h.w.mnSetSearch('4600186703');
    ok('търсене по № на документа на път → нищо (търсенето не е пипано)', h.doc.querySelectorAll('#mn-daily tbody tr').length === 0);
    h.w.mnSetSearch('');
    h.w.mnSetView('bymat');
    ok('по артикул → без чипове и без надпис', h.doc.querySelectorAll('#mod-minusi .mn-ur-warn, #mod-minusi .mn-ur-transit, #mod-minusi .mn-ur-diff').length === 0);
    h.w.mnSetView('daily');
  }

  section('4. Офисът (admin) — вижда същото, вкл. „Всички обекти“');
  {
    const db = fakeDb(); const h = env(ADMIN, db);
    h.w.mnStore = GDN; await open(h);
    ok('CO: същите чипове при 40001', chips(h, 'mv-14').length === 3 && warn(h, 'mv-14'), J(chips(h, 'mv-14')));
    ok('CO: rejected → „🚚 Неприето“ + надпис', J(chips(h, 'mv-4')) === J(['🚚 Неприето: 4600122222 от 02.09 · 2 БР']) && warn(h, 'mv-4'), J(chips(h, 'mv-4')));
    ok('CO: received → нищо', chips(h, 'mv-3').length === 0);
    h.w.mnSetStore(h.w.MN_ALL); await ticks(10);
    const gq = db.log.filter(x => x.tbl === 'goods_transit').slice(-1)[0].q;
    ok('„Всички обекти“ → двата обекта в една заявка', /store_name=in\.\("Гоце Делчев","Шумен"\)/.test(gq), gq);
    ok('„Всички обекти“: Шумен 30001 → на път + разлика', J(chips(h, 'mv-13')) === J(['🚚 На път: 4600133333 от 03.09 · 5 БР', '⚖️ Разлика ЛС от 17.10 · липса 2']), J(chips(h, 'mv-13')));
    ok('„Всички обекти“: ГД 30001 → пак нищо', chips(h, 'mv-12').length === 0, J(chips(h, 'mv-12')));
  }

  section('5. Грешка при зареждане');
  for (const which of ['failTransit', 'failDiff']) {
    const db = fakeDb({ [which]: true }); const h = env(GD, db); await open(h);
    const e = h.doc.getElementById('mn-ur-err');
    ok(which + ': сив ред „Стоката на път / разликите не се заредиха“', !!e && e.textContent === 'Стоката на път / разликите не се заредиха' && /#94a3b8/.test(e.getAttribute('style')));
    ok(which + ': Минуси работи — 14 реда (ГД), „Запази“ на място', h.doc.querySelectorAll('#mn-daily tbody tr').length === 14 && !!h.doc.getElementById('mn-reason-mv-1'));
  }
  {
    const db = fakeDb({ failTransit: true }); const h = env(GD, db); await open(h);
    ok('паднала стока на път → разликите пак се показват', chips(h, 'mv-5').length === 1 && chips(h, 'mv-1').length === 0);
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
