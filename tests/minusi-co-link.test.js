/* „➖ Минуси", етап 4а — връзка с Клиентски заявки (27.10.2026, решение на
   Тенчо „подсказка + избор"; повод — писмо на Миглена от 27.10).
   Интеграционно: shared.js + client-orders.js + revaluation.js +
   revisions.js + notifications.js + minusi.js в реда от index.html.

   Правилото: заявка на СЪЩИЯ обект (store_name), код = материала
   (items[].sap, иначе колоната sap; trim), дата в [минус − 7; минус + 7],
   статус ≠ refused. Фалшивият PostgREST филтрира client_orders по
   store_name=in.(…), date=gte./lte. като живия — проверено на 27.10 с
   anon ключа срещу живия: точно този низ връща 7-те заявки на Гоце Делчев.

   Мутационна проверка (27.10.2026) — всеки вариант пуснат и паднал:
     K1 ≤ 7 → < 7 (mnCoMatches) → падат „+7 дни“ и „−7 дни“;
     K2 refused не се изключва (mnCoBuildIdx) → пада „refused → без чип“;
     K3 ключът без обект (само код) → пада „„Всички обекти“: ГД 50000 → пак
        без чип“. В изгледа на един обект K3 оцелява — там заявката към
        базата вече е само за този обект (store_name=in.), тоест чуждата
        заявка изобщо не идва; разлика има само при „Всички обекти“;
     K4 без резервата към колоната sap → пада „стар запис (колона sap)“;
     K5 бутонът „↳“ и в изгледа на контролинга → пада „CO не вижда ↳“;
     K6 търсенето не гледа № на КЗ → падат „търсене „0006““ и „-0011“.
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, ok, section, report, ticks } = H;

const GD = { email: 'managergdelchev@temax.bg', display_name: 'Управител ГД', role: 'manager', store_name: 'Гоце Делчев' };
const ADMIN = { email: 'm.pavlova@temax.bg', display_name: 'Миглена', role: 'admin', store_name: 'Централен офис' };
const PLANTS = [{ plant: '5519', store_name: 'Гоце Делчев' }, { plant: '7519', store_name: 'Гоце Делчев' }, { plant: '5514', store_name: 'Шумен' }];
const REASONS = ['клиентска поръчка (номер/дата)', 'последна бройка, липсва код'].map((l, i) => ({ id: i + 1, label: l, active: true, sort: i + 1, requires_note: i === 0 }));

let seq = 0;
const mv = (material, date, store, extra) => Object.assign({
  id: 'mv-' + (++seq), plant: '7519', store_name: store || 'Гоце Делчев', material, material_desc: 'АРТИКУЛ ' + material,
  mvt_type: '955', qty: 1, uom: 'БР', mat_doc: '49033' + String(seq).padStart(5, '0'), doc_item: '1', doc_year: 2026, posting_date: date,
  real_code: null, reason_id: null, employee_name: null, note: null, action: null, filled_by: null, filled_at: null
}, extra || {});
const MOVS = () => { seq = 0; return [
  mv('32033', '2026-10-11'),              /* mv-1 → ГД-0006 (items, +1 ден) */
  mv('40300', '2026-10-10'),              /* mv-2 → стар запис, колона sap, точно +7 */
  mv('40301', '2026-10-10'),              /* mv-3 → −8 и +8 → нищо */
  mv('40302', '2026-10-10'),              /* mv-4 → точно −7 */
  mv('50000', '2026-10-10'),              /* mv-5 → заявката е на Шумен → нищо в ГД */
  mv('50001', '2026-10-10'),              /* mv-6 → refused → нищо */
  mv('50002', '2026-10-10'),              /* mv-7 → две заявки */
  mv('98275', '2026-10-07'),              /* mv-8 → няма заявка */
  mv('50000', '2026-10-10', 'Шумен', { plant: '5514' }) /* mv-9 → Шумен-0001 */
]; };
const it = (sap) => ({ sap, product: 'P' + sap, qty: 1, unit: 'бр.', color: '' });
const COS = [
  { id: 'co-1', in_num: 'Гоце Делчев-0006', store_name: 'Гоце Делчев', fulfiller: 'Централен офис', date: '2026-10-12', status: 'pending', sap: null, items: [it('32033')] },
  { id: 'co-2', in_num: 'Гоце Делчев-0002', store_name: 'Гоце Делчев', date: '2026-10-17', status: 'done', sap: ' 40300 ', items: null },
  { id: 'co-3', in_num: 'Гоце Делчев-0003', store_name: 'Гоце Делчев', date: '2026-10-02', status: 'sent', sap: null, items: [it('40301')] },
  { id: 'co-4', in_num: 'Гоце Делчев-0004', store_name: 'Гоце Делчев', date: '2026-10-18', status: 'sent', sap: null, items: [it('40301')] },
  { id: 'co-5', in_num: 'Гоце Делчев-0005', store_name: 'Гоце Делчев', date: '2026-10-03', status: 'sent', sap: null, items: [it('40302')] },
  /* изпълнител е ГД, но продадено в Шумен → не е на ГД */
  { id: 'co-6', in_num: 'Шумен-0001', store_name: 'Шумен', fulfiller: 'Гоце Делчев', date: '2026-10-11', status: 'pending', sap: null, items: [it('50000')] },
  { id: 'co-7', in_num: 'Гоце Делчев-0007', store_name: 'Гоце Делчев', date: '2026-10-11', status: 'refused', sap: null, items: [it('50001')] },
  { id: 'co-8', in_num: 'Гоце Делчев-0010', store_name: 'Гоце Делчев', date: '2026-10-09', status: 'processed', sap: null, items: [it('11111'), it('50002')] },
  { id: 'co-9', in_num: 'Гоце Делчев-0011', store_name: 'Гоце Делчев', date: '2026-10-12', status: 'pending', sap: null, items: [it('50002 ')] }
];

function resp(status, body) {
  const t = body == null ? '' : JSON.stringify(body);
  return Promise.resolve({ ok: status < 300, status, json: () => t ? Promise.resolve(JSON.parse(t)) : Promise.reject(new SyntaxError('empty')), text: () => Promise.resolve(t) });
}
function install(h, db) {
  h.w.fetch = function (url, init) {
    const m = ((init && init.method) || 'GET').toUpperCase();
    const u = String(url);
    const tbl = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    const q = decodeURIComponent(u.split('?')[1] || '');
    const body = init && init.body ? JSON.parse(init.body) : null;
    db.log.push({ m, tbl, q, body });
    if (m === 'GET') {
      if (tbl === 'app_settings') return resp(200, [{ key: 'minus_stores', value: 'Гоце Делчев, Шумен' }]);
      if (tbl === 'minus_plants') return resp(200, PLANTS);
      if (tbl === 'minus_reasons') return resp(200, REASONS);
      if (tbl === 'minus_uom_thresholds') return resp(200, []);
      if (tbl === 'minus_uploads') return resp(200, []);
      if (tbl === 'minus_movements') {
        if (/offset=[1-9]/.test(q)) return resp(200, []);
        const st = (q.match(/store_name=eq\.([^&]+)/) || [])[1];
        return resp(200, db.movs.filter(x => !st || x.store_name === st).map(x => Object.assign({}, x)));
      }
      if (tbl === 'client_orders') {
        if (db.coFail) return resp(500, { message: 'boom' });
        if (db.coHang) return new Promise(() => {});
        const id = (q.match(/id=eq\.([^&]+)/) || [])[1];
        if (id) return resp(200, COS.filter(o => o.id === id).map(o => Object.assign({ customer_name: 'Клиент', phone: '0888' }, o)));
        if (/offset=[1-9]/.test(q)) return resp(200, []);
        const ins = ((q.match(/store_name=in\.\(([^)]*)\)/) || [])[1] || '').split(',').map(s => s.replace(/^"|"$/g, ''));
        const gte = (q.match(/date=gte\.([^&]+)/) || [])[1], lte = (q.match(/date=lte\.([^&]+)/) || [])[1];
        return resp(200, COS.filter(o => ins.indexOf(o.store_name) >= 0 && (!gte || o.date >= gte) && (!lte || o.date <= lte)).map(o => Object.assign({}, o)));
      }
      return resp(200, []);
    }
    if (m === 'PATCH') {
      const id = (q.match(/id=eq\.([^&]+)/) || [])[1];
      if (tbl === 'minus_movements') db.movs.filter(x => x.id === id).forEach(x => Object.assign(x, body));
      return resp(204, null);
    }
    return resp(405, { message: 'not in fake' });
  };
}
function env(user, db) {
  const h = boot({ modules: ['client-orders.js', 'revaluation.js', 'revisions.js', 'notifications.js', 'minusi.js'], user, data: {} });
  install(h, db);
  return h;
}
const fakeDb = o => Object.assign({ movs: MOVS(), log: [] }, o || {});
async function open(h) { await h.w.loadMinusi(); await ticks(6); }
const row = (h, id) => h.doc.getElementById('mn-row-' + id);
const chips = (h, id) => { const r = row(h, id); return r ? Array.from(r.querySelectorAll('.mn-co-chip')).map(c => c.textContent) : null; };
const coGets = db => db.log.filter(x => x.m === 'GET' && x.tbl === 'client_orders' && !/id=eq\./.test(x.q));

(async function run() {

  section('1. Съвпадение — обектът (Гоце Делчев)');
  {
    const db = fakeDb(); const h = env(GD, db); await open(h);
    ok('една заявка към client_orders', coGets(db).length === 1, coGets(db).length);
    const q = coGets(db)[0].q;
    ok('явен select само с нужните колони', /select=id,in_num,store_name,date,status,sap,items(&|$)/.test(q), q);
    ok('само обекта (store_name=in.("Гоце Делчев"))', /store_name=in\.\("Гоце Делчев"\)/.test(q), q);
    ok('прозорец: 07.10 − 7 … 11.10 + 7', /date=gte\.2026-09-30/.test(q) && /date=lte\.2026-10-18/.test(q), q);
    ok('items[].sap → „🧾 КЗ Гоце Делчев-0006 · Изчаква“', JSON.stringify(chips(h, 'mv-1')) === JSON.stringify(['🧾 КЗ Гоце Делчев-0006 · Изчаква']), JSON.stringify(chips(h, 'mv-1')));
    ok('стар запис (колона sap, с интервали) и точно +7 дни → чип', JSON.stringify(chips(h, 'mv-2')) === JSON.stringify(['🧾 КЗ Гоце Делчев-0002 · Изпълнена']), JSON.stringify(chips(h, 'mv-2')));
    ok('−8 и +8 дни → без чип', chips(h, 'mv-3').length === 0, JSON.stringify(chips(h, 'mv-3')));
    ok('точно −7 дни → чип', chips(h, 'mv-4').length === 1, JSON.stringify(chips(h, 'mv-4')));
    ok('заявка на друг обект (изпълнител ГД, продадено в Шумен) → без чип', chips(h, 'mv-5').length === 0, JSON.stringify(chips(h, 'mv-5')));
    ok('refused → без чип', chips(h, 'mv-6').length === 0, JSON.stringify(chips(h, 'mv-6')));
    ok('две съвпадения → два чипа по дата', JSON.stringify(chips(h, 'mv-7')) === JSON.stringify(['🧾 КЗ Гоце Делчев-0010 · Обработена от ЦО', '🧾 КЗ Гоце Делчев-0011 · Изчаква']), JSON.stringify(chips(h, 'mv-7')));
    ok('без заявка → без чип', chips(h, 'mv-8').length === 0);
    ok('чипът е под описанието (в същата клетка)', row(h, 'mv-1').querySelectorAll('td')[1].querySelector('.mn-co-chip') != null);
    ok('без нова колона: th са 10', h.doc.querySelectorAll('#mn-daily thead th').length === 10, h.doc.querySelectorAll('#mn-daily thead th').length);
    ok('чипът не е nowrap (пренася се)', !/nowrap/.test(row(h, 'mv-1').querySelector('.mn-co-chip').getAttribute('style')));
    ok('няма сив ред за грешка', !h.doc.getElementById('mn-co-err'));

    section('2. Избор „↳“ — обектът попълва бележката');
    const pick = id => Array.from(h.doc.querySelectorAll('#mn-co-pick-' + id + ' button.mn-co-use'));
    ok('без избрана причина → няма „↳“', pick('mv-1').length === 0);
    const sel = h.doc.getElementById('mn-reason-mv-1');
    sel.value = '2'; fire(h.w, sel, 'change');
    ok('причина без requires_note → няма „↳“', pick('mv-1').length === 0);
    sel.value = '1'; fire(h.w, sel, 'change');
    ok('„клиентска поръчка“ → „↳ Гоце Делчев-0006 / 12.10.2026“', pick('mv-1').length === 1 && pick('mv-1')[0].textContent === '↳ Гоце Делчев-0006 / 12.10.2026', pick('mv-1').map(b => b.textContent).join('|'));
    const before = db.log.filter(x => x.m === 'PATCH').length;
    realClick(h.w, pick('mv-1')[0], '↳');
    ok('кликът попълва бележката', h.doc.getElementById('mn-note-mv-1').value === 'КЗ Гоце Делчев-0006 / 12.10.2026', h.doc.getElementById('mn-note-mv-1').value);
    ok('кликът НЕ записва', db.log.filter(x => x.m === 'PATCH').length === before);
    h.doc.getElementById('mn-emp-mv-1').value = 'Иван';
    const saveBtn = Array.from(row(h, 'mv-1').querySelectorAll('button')).filter(b => b.textContent === 'Запази')[0];
    await realClick(h.w, saveBtn, 'Запази'); await ticks(6);
    const p = db.log.filter(x => x.m === 'PATCH' && x.tbl === 'minus_movements');
    ok('„Запази“ минава с бележката', p.length === 1 && p[0].body.note === 'КЗ Гоце Делчев-0006 / 12.10.2026' && p[0].body.reason_id === 1, JSON.stringify(p.map(x => x.body)));
    ok('след запис чипът остава', chips(h, 'mv-1').length === 1);

    const s8 = h.doc.getElementById('mn-reason-mv-8'); s8.value = '1'; fire(h.w, s8, 'change');
    ok('без съвпадение → няма „↳“ (само ръчната бележка)', pick('mv-8').length === 0 && !!h.doc.getElementById('mn-note-mv-8'));
    const s7 = h.doc.getElementById('mn-reason-mv-7'); s7.value = '1'; fire(h.w, s7, 'change');
    ok('две съвпадения → два бутона „↳“', pick('mv-7').length === 2, pick('mv-7').map(b => b.textContent).join('|'));
    ok('бутонът „↳“ се пренася (max-width 110px, white-space:normal)', /max-width:110px/.test(pick('mv-7')[0].getAttribute('style')) && /white-space:normal/.test(pick('mv-7')[0].getAttribute('style')));

    section('3. Търсене по № на КЗ');
    h.w.mnSetSearch('0006');
    let ids = Array.from(h.doc.querySelectorAll('#mn-daily tbody tr')).map(tr => tr.id);
    ok('търсене „0006“ → само mv-1', JSON.stringify(ids) === JSON.stringify(['mn-row-mv-1']), JSON.stringify(ids));
    h.w.mnSetSearch('-0011');
    ids = Array.from(h.doc.querySelectorAll('#mn-daily tbody tr')).map(tr => tr.id);
    ok('търсене „-0011“ → mv-7', JSON.stringify(ids) === JSON.stringify(['mn-row-mv-7']), JSON.stringify(ids));
    h.w.mnSetSearch('');

    section('4. Excel и печат');
    const aoa = h.w.mnExportAoa();
    /* „КЗ“ е след „Действие“; от 27.10 (етап 4б) след нея е „Незаприходена?“. */
    const ik = aoa[0].indexOf('КЗ');
    ok('Excel: колона „КЗ“ веднага след „Действие / становище“', ik > 0 && aoa[0][ik - 1] === 'Действие / становище', JSON.stringify(aoa[0]));
    const kz = m => (aoa.filter(r => r[0] === m)[0] || [])[ik];
    ok('Excel: две заявки през запетая', kz('50002') === 'Гоце Делчев-0010, Гоце Делчев-0011', kz('50002'));
    ok('Excel: без заявка → празно', kz('98275') === '', JSON.stringify(kz('98275')));
    h.w.mnPrint();
    const pr = h.doc.getElementById('mod-print');
    ok('печат: № под описанието', /КЗ Гоце Делчев-0006/.test(pr.textContent));
    ok('печат: без нова колона (th 9)', pr.querySelectorAll('.mn-ptbl th').length === 9, pr.querySelectorAll('.mn-ptbl th').length);

    section('5. „📦 По артикул“ не знае за КЗ');
    h.w.showModule && h.w.showModule('minusi');
    h.w.mnSetView('bymat');
    ok('по артикул → без чипове', h.doc.querySelectorAll('#mod-minusi .mn-co-chip').length === 0);
    h.w.mnSetView('daily');
  }

  section('6. Офисът (admin) — вижда чипа, не и „↳“');
  {
    const db = fakeDb(); const h = env(ADMIN, db);
    h.w.mnStore = 'Гоце Делчев'; await open(h);
    ok('CO вижда чипа', chips(h, 'mv-1').length === 1, JSON.stringify(chips(h, 'mv-1')));
    ok('CO не вижда „↳“ и няма полета', h.doc.querySelectorAll('#mod-minusi .mn-co-use').length === 0 && !h.doc.getElementById('mn-reason-mv-1'));
    /* Всички обекти */
    h.w.mnSetStore(h.w.MN_ALL); await ticks(10);
    const q = coGets(db).slice(-1)[0].q;
    ok('„Всички обекти“ → двата обекта в една заявка', /store_name=in\.\("Гоце Делчев","Шумен"\)|store_name=in\.\("Шумен","Гоце Делчев"\)/.test(q), q);
    ok('„Всички обекти“: Шумен 50000 → Шумен-0001', JSON.stringify(chips(h, 'mv-9')) === JSON.stringify(['🧾 КЗ Шумен-0001 · Изчаква']), JSON.stringify(chips(h, 'mv-9')));
    ok('„Всички обекти“: ГД 50000 → пак без чип', chips(h, 'mv-5').length === 0);

    section('7. Клик по чипа → детайлът на заявката');
    realClick(h.w, row(h, 'mv-1').querySelector('.mn-co-chip'), 'чип'); await ticks(6);
    const ov = h.doc.getElementById('cod-ov');
    ok('отваря се #cod-ov с № Гоце Делчев-0006', !!ov && /Гоце Делчев-0006/.test(ov.textContent), ov ? ov.textContent.slice(0, 80) : 'няма');
    ok('дочита пълния ред по id', db.log.some(x => x.tbl === 'client_orders' && /id=eq\.co-1/.test(x.q) && /select=\*/.test(x.q)));
  }

  section('8. Грешка при зареждане на заявките');
  {
    const db = fakeDb({ coFail: true }); const h = env(GD, db); await open(h);
    ok('сив ред „Клиентските заявки не се заредиха“', !!h.doc.getElementById('mn-co-err') && h.doc.getElementById('mn-co-err').textContent === 'Клиентските заявки не се заредиха');
    ok('Минуси работи: таблицата е с 8 реда', h.doc.querySelectorAll('#mn-daily tbody tr').length === 8, h.doc.querySelectorAll('#mn-daily tbody tr').length);
    ok('без чипове', h.doc.querySelectorAll('.mn-co-chip').length === 0);
    const s = h.doc.getElementById('mn-reason-mv-1'); s.value = '1'; fire(h.w, s, 'change');
    ok('без „↳“, бележката е на мястото си', h.doc.querySelectorAll('.mn-co-use').length === 0 && !!h.doc.getElementById('mn-note-mv-1'));
  }
  {
    const db = fakeDb({ coHang: true }); const h = env(GD, db);
    h.w.loadMinusi(); await ticks(8);
    ok('заявките висят → таблицата пак е нарисувана', h.doc.querySelectorAll('#mn-daily tbody tr').length === 8);
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
