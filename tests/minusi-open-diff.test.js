/* „➖ Минуси" — „⚠️ Има отворена разлика" (19.11.2026, сесия minusi-open-diff;
   Теодор 18–19.11, случай Пирдоп; решения на Тенчо). Интеграционно:
   stock-differences.js + minusi.js (+ съседите им) в реда от index.html.

   Правилото: минус по код, за който СЪЩИЯТ обект има НЕприключен ред в
   Разлики — трите вида (interstore, supplier, wrong_receipt). „Неприключен"
   е по правилото на Разлики: sdIsClosed (SD_CLOSED_STATUSES = received /
   taken / capitalized / completed) в stock-differences.js — не второ правило.
   Всеки ред: вид · дата на бланката · статус с надписа от Разлики · бутон
   „Отвори в Разлики" (sdJumpToLine): ред в непрегледана бланка → „Бланки за
   преглед" + котвата diff-rep-<id>; иначе → „Решени редове", подтаб по
   посока, чип по обект, търсене по SAP кода. Обектът не вижда в „Решени
   редове" Липса / Не са фактурирани → обяснение, без смяна на таба.

   Фалшивият PostgREST прилага филтрите, които заявката носи (store_name=in.,
   status=not.in.), и заявката се проверява отделно — мутант, махнал филтъра и
   от заявката, и от кода, пада и на двете места.

   Мутационна проверка (19.11.2026) — всеки вариант пуснат върху чист код и
   паднал (броят паднали проверки е в отчета на сесията):
     M1 само interstore (mnOdBuild: dir !== 'interstore' → return);
     M2 приключена се брои (sdIsClosed не се проверява в mnOdBuild, а
        заявката е без status=not.in.);
     M3 друг обект се брои (ключът на индекса — само кодът). */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick } = H;

const PD = 'Пирдоп', MT = 'Монтана';
const STORE = { email: 'managerpirdop@temax.bg', display_name: 'Управител Пирдоп', role: 'manager', store_name: PD };
const ADMIN = { email: 'm.pavlova@temax.bg', display_name: 'Миглена', role: 'admin', store_name: 'Централен офис' };
const PLANTS = [{ plant: '7701', store_name: PD }, { plant: '7702', store_name: MT }];
const J = JSON.stringify;

let seq = 0;
const mv = (material, store) => ({
  id: 'mv-' + (++seq), plant: store === MT ? '7702' : '7701', store_name: store || PD, material, material_desc: 'АРТИКУЛ ' + material,
  mvt_type: '955', qty: 2, uom: 'БР', mat_doc: '49100' + String(seq).padStart(5, '0'), doc_item: '1', doc_year: 2026, posting_date: '2026-11-10',
  real_code: null, reason_id: null, employee_name: null, note: null, action: null, filled_by: null, filled_at: null
});
const MOVS = () => { seq = 0; return [
  mv('A1'), mv('A2'), mv('A3'), mv('A4'), mv('A5'),   /* 1–5 отворени: interstore / supplier writein / wrong_receipt / supplier missing / код с интервали */
  mv('C1'), mv('C2'), mv('C3'), mv('C4'),             /* 6–9 приключени: received / taken / capitalized / completed */
  mv('X1'),                                            /* 10 отворена разлика само в Монтана */
  mv('Y1'),                                            /* 11 отворена разлика по друг код (Y2) */
  mv('X1', MT)                                         /* 12 Монтана — „Всички обекти" */
]; };
const REPS = [
  { id: 901, store_name: PD, direction: 'interstore', doc_date: '2026-11-03', reviewed: false, email_pending: false, counterpart: 'ЛС Казичене', created_at: '2026-11-03T08:00:00Z' },
  { id: 902, store_name: PD, direction: 'supplier', doc_date: '2026-10-14', reviewed: true, email_pending: false, created_at: '2026-10-14T08:00:00Z' },
  { id: 903, store_name: PD, direction: 'wrong_receipt', doc_date: '2026-10-20', reviewed: true, email_pending: false, created_at: '2026-10-20T08:00:00Z' },
  { id: 904, store_name: MT, direction: 'supplier', doc_date: '2026-11-01', reviewed: true, email_pending: false, created_at: '2026-11-01T08:00:00Z' }
];
const repOf = id => REPS.filter(r => r.id === id)[0];
const sd = (id, rid, code, status, type, extra) => Object.assign({
  id, report_id: rid, store_name: repOf(rid).store_name, material_code: code, material_name: 'АРТИКУЛ ' + String(code).trim(),
  quantity: 10, quantity_received: 7, difference_category: rid === 901 ? 'undelivered' : null, status, type: type || null,
  created_at: repOf(rid).created_at
}, extra || {});
const LINES = [
  sd(1, 901, 'A1', 'new'),
  sd(2, 902, 'A2', 'pending', 'writein'),
  sd(3, 903, 'A3', 'pending', 'storno'),
  sd(4, 902, 'A4', 'pending', 'missing'),
  sd(5, 902, ' A5 ', 'new', 'return'),
  sd(6, 901, 'C1', 'received'),
  sd(7, 902, 'C2', 'taken', 'writein'),
  sd(8, 902, 'C3', 'capitalized', 'writein'),
  sd(9, 902, 'C4', 'completed', 'return'),
  sd(10, 904, 'X1', 'pending', 'return'),
  sd(11, 902, 'Y2', 'pending', 'writein')
];
/* Вградената бланка — както PostgREST я връща при differences_reports(...). */
const embed = l => { const r = repOf(l.report_id); return Object.assign({}, l, { differences_reports: { direction: r.direction, doc_date: r.doc_date, reviewed: r.reviewed, email_pending: r.email_pending } }); };

function resp(status, body) {
  const t = body == null ? '' : JSON.stringify(body);
  return Promise.resolve({ ok: status < 300, status, json: () => t ? Promise.resolve(JSON.parse(t)) : Promise.reject(new SyntaxError('empty')), text: () => Promise.resolve(t) });
}
function pgFilter(rows, q) {
  const ins = (q.match(/(?:^|&)store_name=in\.\(([^)]*)\)/) || [])[1];
  const notIn = (q.match(/(?:^|&)status=not\.in\.\(([^)]*)\)/) || [])[1];
  return rows.filter(r =>
    (!ins || ins.split(',').map(s => s.replace(/^"|"$/g, '')).indexOf(r.store_name) >= 0) &&
    (!notIn || notIn.split(',').indexOf(r.status) < 0));
}
function install(h, db) {
  h.w.fetch = function (url, init) {
    const m = ((init && init.method) || 'GET').toUpperCase();
    const u = String(url);
    const tbl = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    const q = decodeURIComponent(u.split('?')[1] || '');
    db.log.push({ m, tbl, q });
    if (m !== 'GET') return resp(405, { message: 'not in fake' });
    if (tbl === 'app_settings') return resp(200, [{ key: 'minus_stores', value: PD + ', ' + MT }]);
    if (tbl === 'minus_plants') return resp(200, PLANTS);
    if (tbl === 'minus_movements') {
      if (/offset=[1-9]/.test(q)) return resp(200, []);
      const st = (q.match(/store_name=eq\.([^&]+)/) || [])[1];
      return resp(200, db.movs.filter(x => !st || x.store_name === st).map(x => Object.assign({}, x)));
    }
    if (/offset=[1-9]/.test(q)) return resp(200, []);
    if (tbl === 'stock_differences') {
      /* Минуси (вградена бланка) срещу самия модул Разлики (без вграждане). */
      if (/differences_reports\(/.test(q)) return db.failDiff ? resp(500, { message: 'boom' }) : resp(200, pgFilter(LINES, q).map(embed));
      return resp(200, LINES.filter(l => !/store_name=eq\./.test(q) || q.indexOf('store_name=eq.' + l.store_name) >= 0).map(l => Object.assign({}, l)));
    }
    if (tbl === 'differences_reports') return resp(200, REPS.map(r => Object.assign({}, r)));
    return resp(200, []);
  };
}
function env(user, db) {
  const h = boot({ modules: ['client-orders.js', 'stock-returns.js', 'stock-differences.js', 'revaluation.js', 'revisions.js', 'notifications.js', 'minusi.js'], user, data: {} });
  install(h, db);
  return h;
}
const fakeDb = o => Object.assign({ movs: MOVS(), log: [] }, o || {});
async function open(h) { await h.w.loadMinusi(); await ticks(8); }
const row = (h, id) => h.doc.getElementById('mn-row-' + id);
const od = (h, id) => { const r = row(h, id); return r ? r.querySelector('.mn-od') : null; };
const items = (h, id) => { const r = row(h, id); return r ? Array.from(r.querySelectorAll('.mn-od-item')) : []; };
const itemText = it => it.querySelector('.mn-od-chip').textContent + ' | ' + it.querySelector('.mn-od-status').textContent;

(async function run() {

  section('0. Правилото на Разлики — sdIsClosed');
  {
    const h = env(ADMIN, fakeDb());
    const w = h.w;
    const st = ['new', 'pending', 'received', 'taken', 'capitalized', 'completed', null, ''];
    ok('sdIsClosed = received ∨ sdIsTaken ∨ sdIsCompleted за всеки статус', st.every(s => { const r = { status: s }; return w.sdIsClosed(r) === (s === 'received' || w.sdIsTaken(r) || w.sdIsCompleted(r)); }));
    ok('отворени: new, pending; приключени: received, taken, capitalized, completed', J(st.filter(s => !w.sdIsClosed({ status: s }))) === J(['new', 'pending', null, '']), J(st.filter(s => !w.sdIsClosed({ status: s }))));
    ok('sdRowAwaitsMark — непроменен: pending writein да, not_invoiced не, taken не', w.sdRowAwaitsMark({ status: 'pending', type: 'writein' }) && !w.sdRowAwaitsMark({ status: 'pending', type: 'not_invoiced' }) && !w.sdRowAwaitsMark({ status: 'taken', type: 'writein' }) && !w.sdRowAwaitsMark({ status: 'received' }));
    ok('mnOdBuild: приключените и другият обект/код не влизат (директно)', (() => {
      const idx = w.mnOdBuild(LINES.map(embed));
      return J(Object.keys(idx).sort()) === J([PD + '\u0001A1', PD + '\u0001A2', PD + '\u0001A3', PD + '\u0001A4', PD + '\u0001A5', PD + '\u0001Y2', MT + '\u0001X1'].sort());
    })());
  }

  section('1. Обектът (Пирдоп) — знак и бутон');
  {
    const db = fakeDb(); const h = env(STORE, db); await open(h);
    const dq = db.log.filter(x => x.tbl === 'stock_differences');
    ok('една заявка към stock_differences', dq.length === 1, dq.length);
    ok('заявката: вградена бланка, неприключени (not.in), само показаните обекти', /differences_reports\(direction,doc_date,reviewed,email_pending\)/.test(dq[0].q) && /status=not\.in\.\(received,taken,capitalized,completed\)/.test(dq[0].q) && /store_name=in\.\("Пирдоп"\)/.test(dq[0].q), dq[0].q);
    ok('interstore (A1) → „⚠️ Има отворена разлика“ + ⚖️ липса 3 + 🆕', !!od(h, 'mv-1') && od(h, 'mv-1').querySelector('.mn-od-warn').textContent === '⚠️ Има отворена разлика' && J(items(h, 'mv-1').map(itemText)) === J(['⚖️ Разлика ЛС от 03.11 · липса 3 | 🆕 ПОДАДЕНА, НЕПРЕГЛЕДАНА']), J(items(h, 'mv-1').map(itemText)));
    ok('supplier writein (A2) → „📦 Доставчик от 14.10“ + ⏳ НЕЗАПРИХОДЕНА', J(items(h, 'mv-2').map(itemText)) === J(['📦 Доставчик от 14.10 | ⏳ НЕЗАПРИХОДЕНА']), J(items(h, 'mv-2').map(itemText)));
    ok('wrong_receipt (A3) → „🧾 Сторна по грешен прием от 20.10“ + ⏳ НЕИЗЧИСТЕНА (посоката стига до баджа)', J(items(h, 'mv-3').map(itemText)) === J(['🧾 Сторна по грешен прием от 20.10 | ⏳ НЕИЗЧИСТЕНА']), J(items(h, 'mv-3').map(itemText)));
    ok('supplier missing (A4) → знак и бутон', items(h, 'mv-4').length === 1 && !!items(h, 'mv-4')[0].querySelector('button.mn-od-open'));
    ok('код с интервали („ A5 “) → съвпада', items(h, 'mv-5').length === 1);
    ok('всеки отворен ред има бутон „Отвори в Разлики“', ['mv-1', 'mv-2', 'mv-3', 'mv-4', 'mv-5'].every(id => items(h, id).every(it => { const b = it.querySelector('button.mn-od-open'); return b && b.textContent === 'Отвори в Разлики'; })));
    ok('приключени (received / taken / capitalized / completed) → нищо', ['mv-6', 'mv-7', 'mv-8', 'mv-9'].every(id => !od(h, id)));
    ok('отворена разлика в ДРУГ обект → нищо', !od(h, 'mv-10'));
    ok('отворена разлика по ДРУГ код → нищо', !od(h, 'mv-11'));
    ok('A1: „⚠ вероятно незаприходена стока“ остава, ⚖️ — само веднъж', !!row(h, 'mv-1').querySelector('.mn-ur-warn') && row(h, 'mv-1').querySelectorAll('.mn-ur-diff').length === 1);
    ok('A2 (доставчик): без „незаприходена“', !row(h, 'mv-2').querySelector('.mn-ur-warn'));
    ok('без сив ред', !h.doc.getElementById('mn-od-err'));

    section('2. Excel, печат, „По артикул“');
    const aoa = h.w.mnExportAoa();
    const last = aoa[0].length - 1;
    ok('Excel: последна колона „Отворена разлика“', aoa[0][last] === 'Отворена разлика', J(aoa[0].slice(-2)));
    const xv = m => (aoa.filter(r => r[0] === m)[0] || [])[last];
    ok('Excel: A1 → „отворена разлика: 03.11.2026“', xv('A1') === 'отворена разлика: 03.11.2026', xv('A1'));
    ok('Excel: C1 / X1 → празно', xv('C1') === '' && xv('X1') === '', J([xv('C1'), xv('X1')]));
    h.w.mnPrint();
    const pr = h.doc.getElementById('mod-print');
    const prOf = m => Array.from(pr.querySelectorAll('.mn-ptbl tr')).slice(1).filter(tr => tr.cells[0].textContent === m)[0];
    ok('печат: под описанието при A2', /отворена разлика: 14\.10\.2026/.test(prOf('A2').cells[1].textContent), prOf('A2').cells[1].textContent);
    ok('печат: нищо при C2', !/отворена разлика/.test(prOf('C2').cells[1].textContent));
    h.w.showModule && h.w.showModule('minusi');
    h.w.mnSetView('bymat');
    const bm = id => h.doc.getElementById('mn-mat-' + id);
    ok('„По артикул“: A1 и A3 — знакът и бутонът', !!bm('A1') && !!bm('A1').querySelector('.mn-od-warn') && !!bm('A3').querySelector('button.mn-od-open'));
    ok('„По артикул“: C1 и X1 — нищо', !bm('C1').querySelector('.mn-od') && !bm('X1').querySelector('.mn-od'));
    const ab = h.w.mnExportAoa();
    ok('„По артикул“ Excel: последна „Отворена разлика“, A2 → дата', ab[0][ab[0].length - 1] === 'Отворена разлика' && ab.filter(r => r[0] === 'A2')[0].slice(-1)[0] === 'отворена разлика: 14.10.2026');
    h.w.mnSetView('daily');

    section('3. Обектът кликва „Отвори в Разлики“');
    /* Липса — в „Решени редове“ обектът не я вижда → обяснение, без смяна. */
    const before = h.w.sdView;
    realClick(h.w, items(h, 'mv-4')[0].querySelector('button.mn-od-open'));
    await ticks(6);
    ok('Липса (A4): toast, без скок', /при офиса/.test(h.calls.toast.map(t => J(t)).join(' ')) && h.w.sdView === before && !!h.doc.getElementById('mn-row-mv-4'), J(h.calls.toast.slice(-1)));
    realClick(h.w, items(h, 'mv-2')[0].querySelector('button.mn-od-open'));
    await ticks(10);
    ok('Заприхождаване (A2): „Решени редове“, „Доставчици“, търсене A2, обект Пирдоп', h.w.sdView === 'rows' && h.w.sdDirTab === 'supplier' && h.w.sdSearch === 'A2' && h.w.sdStoreFilter === PD, J([h.w.sdView, h.w.sdDirTab, h.w.sdSearch, h.w.sdStoreFilter]));
    const rowsTb = h.doc.getElementById('sd-rows');
    ok('Разлики: в таблицата е редът A2 и само той', !!rowsTb && rowsTb.querySelectorAll('tr').length === 1 && /A2/.test(rowsTb.textContent), rowsTb ? rowsTb.textContent.slice(0, 200) : 'няма #sd-rows');
  }

  section('4. Офисът (admin) — вижда същото; скок до бланка горе');
  {
    const db = fakeDb(); const h = env(ADMIN, db);
    h.w.mnStore = PD; await open(h);
    ok('CO: A1, A2, A3, A4 със знак; C1–C4, X1, Y1 без', ['mv-1', 'mv-2', 'mv-3', 'mv-4'].every(id => items(h, id).length === 1) && ['mv-6', 'mv-7', 'mv-8', 'mv-9', 'mv-10', 'mv-11'].every(id => !od(h, id)));
    realClick(h.w, items(h, 'mv-1')[0].querySelector('button.mn-od-open'));
    await ticks(10);
    ok('A1 (непрегледана междускладова): „Бланки за преглед“, „Междускладови“, търсене A1', h.w.sdView === 'reports' && h.w.sdDirTab === 'interstore' && h.w.sdSearch === 'A1', J([h.w.sdView, h.w.sdDirTab, h.w.sdSearch]));
    ok('Разлики: картата diff-rep-901 е на екрана и скролът отива при нея', !!h.doc.getElementById('diff-rep-901') && h.calls.scrollIntoView.some(s => s.id === 'diff-rep-901'), J(h.calls.scrollIntoView));
    ok('Разлики: картата съдържа реда A1', /A1/.test(h.doc.getElementById('diff-rep-901').textContent));

    /* Офисът вижда Липса в „Решени редове“ */
    h.w.showModule('minusi'); await open(h);
    realClick(h.w, items(h, 'mv-4')[0].querySelector('button.mn-od-open'));
    await ticks(10);
    const tb = h.doc.getElementById('sd-rows');
    ok('CO, Липса (A4): „Решени редове“ с реда A4', h.w.sdView === 'rows' && !!tb && /A4/.test(tb.textContent) && tb.querySelectorAll('tr').length === 1, tb ? tb.textContent.slice(0, 200) : 'няма');

    h.w.showModule('minusi');
    h.w.mnSetStore(h.w.MN_ALL); await ticks(10);
    const dq = db.log.filter(x => x.tbl === 'stock_differences' && /differences_reports\(/.test(x.q)).slice(-1)[0].q;
    ok('„Всички обекти“ → двата обекта в една заявка', /store_name=in\.\("Пирдоп","Монтана"\)/.test(dq), dq);
    ok('„Всички обекти“: Монтана X1 → знак; Пирдоп X1 → нищо', items(h, 'mv-12').length === 1 && !od(h, 'mv-10'));
  }

  section('5. Заявката гърми → сив ред, Минуси работи');
  {
    const db = fakeDb({ failDiff: true }); const h = env(STORE, db); await open(h);
    const e = h.doc.getElementById('mn-od-err');
    ok('сив ред „Разликите не се заредиха“', !!e && e.textContent === 'Разликите не се заредиха' && /#94a3b8/.test(e.getAttribute('style')));
    ok('без знак, таблицата е на място (11 реда)', !h.doc.querySelector('#mod-minusi .mn-od') && h.doc.querySelectorAll('#mn-daily tbody tr').length === 11, h.doc.querySelectorAll('#mn-daily tbody tr').length);
    h.w.mnSetView('bymat');
    ok('сивият ред и в „По артикул“', !!h.doc.getElementById('mn-od-err'));
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
