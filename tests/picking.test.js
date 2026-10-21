/* „📦 Пикинг" (picking.js), етап 1 — достъп по app_settings.picking_users,
   импорт на SAP износите „Планиран трансфер" / „Непланиран трансфер",
   отметки „✓ Взето" / „⤼ Пропусни" / „↩ Върни", печат „Отклонения".
   Интеграционно: shared.js + stock-returns.js (SR_SHEET_TO_STORE) +
   picking.js в реда от index.html.

   Фикстурата — реални редове от седмица 41 (заглавията точно както във
   файловете: „Oт къде" с латинско O, празна колона на позиция 9 в
   планирания) + синтетични редове за пропуските.

   Базата е фалшив PostgREST в паметта: on_conflict + ignore-duplicates при
   POST към picking_lines връща само реално вмъкнатите (NULL sap_order не се
   сблъсква — както unique ограничението в базата), DELETE на picking_batches
   трие каскадно редовете му.

   Мутационна проверка (21.10.2026) — всеки вариант е пуснат и е паднал:
     M1 филтърът „За трансфер > 0" махнат (pkParse)
        → падат „влизат 3 реда", „редът „За трансфер" 0 не влиза", batch-ът
          (влезли 4 / пропуснати 2) и чиповете (излиза Шумен);
     M2 store_name от „Име на магазин" вместо през SR_SHEET_TO_STORE
        → падат „store_name „Сливен" през SR_SHEET_TO_STORE" (излиза СЛИВЕН),
          „магазин 99 не влиза" и toast-ът за непознатия номер;
     M3 „Пропусни" без изискване за коментар
        → пада „празен коментар → без PATCH, червен toast";
     M4 печатът включва всички picked редове (pkIsDeviation → picked)
        → падат „НЕ съдържа взетия с равен брой (Сливен)" и „точно 2 реда".
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, ok, guard, section, report, ticks } = H;

const NUMERIC = v => (v !== '' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
const parse = (hdr, raw) => [hdr.split('|')].concat(raw.trim().split('\n').map(l => l.split('|').map(NUMERIC)));

const P_HDR = 'Материал|Магазин|Име на магазин|Заявка за доставка|Позиция на заявка|Снабдителска група|Описание на материал|Базова мерна единица||AВС индикатор|Мin ниво на запас от VB завода|Максим.ниво на запас|Стойност на закр.|Налич в Магазин|На път|Наличност 05|заявено към 05|STO 05|свободно 05|Наличност 18|заявено към 18|STO 18|свободно 18|Заявка ZSTR|STO маг|Заявено количество|За трансфер|Oт къде|Кол|Тип заявка магазин';
const P_RAW = `
13456|13|СЛИВЕН|1131783028|10|110|КОРИТО СТРОИТЕЛНО PVC ПРАВО 40Л|БР|2513|P|15|20|5|14|0|110|0|0|110|0|0|0|0|0|0|10|10|5|10|3
13456|21|РАДНЕВО|1211685744|10|110|КОРИТО СТРОИТЕЛНО PVC ПРАВО 40Л|БР|2521|P|15|20|5|11|0|110|0|0|110|0|0|0|0|0|0|10|10|5|0|3
13456|16|ДОБРИЧ|1161467892|10|110|КОРИТО СТРОИТЕЛНО PVC ПРАВО 40Л|БР|6516|P|15|20|5|9|0|110|0|0|110|0|0|0|0|0|0|15|15|5|0|3
20001|14|ШУМЕН|1141000001|10|120|СИНТЕТИЧЕН НУЛА ЗА ТРАНСФЕР|БР|1|P|1|1|1|1|0|0|0|0|0|0|0|0|0|0|0|5|0|5|0|3
20002|15|ГАБРОВО|1151000002|10|120|СИНТЕТИЧЕН ОТ ДОБРИЧ|БР|1|P|1|1|1|1|0|0|0|0|0|0|0|0|0|0|0|4|4|18|0|3
20003|99|НЕПОЗНАТ|1991000003|10|120|СИНТЕТИЧЕН НЕПОЗНАТ МАГАЗИН|БР|1|P|1|1|1|1|0|0|0|0|0|0|0|0|0|0|0|3|3|5|0|3`;
const U_HDR = 'Заявка за доставка|Наша референция|Тип заявка магазин|Магазин заявител|Магазин изпълнител|Магазин Описание|Материал|Описание на материал|Заявено количество|Мерна единица|Наличност заявител|Наличност изпълнител|К-во по доставка|Дебл. к-во транс.зап|AВС индикатор';
const U_RAW = `
||2|7|5|ЛОГИСТИЧЕН СКЛАД ТЪРГОВИЩЕ|64694|КАЛЪФ МАСА ЗА ГЛАДЕНЕ ORIGIN 50/140СМ|31|БР|84|31|0|0|
||2|21|5|ЛОГИСТИЧЕН СКЛАД ТЪРГОВИЩЕ|103742|КАЛЪФ МАСА ЗА ГЛАДЕНЕ 94589 80/41CM|10|БР|0|10|0|0|
||2|24|5|ЛОГИСТИЧЕН СКЛАД ТЪРГОВИЩЕ|87800|МЕХАНИЗЪМ ИЗПРАЗВАЩ 1СТЕП.4803/4802|20|БР|1|190|0|0|
||2|3|8|КЪРДЖАЛИ|55555|СИНТЕТИЧЕН ОБЕКТ КЪМ ОБЕКТ|2|БР|0|5|0|0|`;
const PLANNED = parse(P_HDR, P_RAW);
const UNPLANNED = parse(U_HDR, U_RAW);
const FOREIGN = [['Завод', 'Материал', 'Вид движение'], [5519, 17273, 955]];
const TG = 'Логистичен склад Търговище';

const USERS = 'ten.tenev@temax.bg, V.Filev@temax.bg , tencho.tenev13@gmail.com';
const TENCHO = { email: 'ten.tenev@temax.bg', display_name: 'Тенчо', role: 'admin', store_name: 'Централен офис' };
const VIKTOR = { email: 'v.filev@temax.bg', display_name: 'Виктор', role: 'logistics', store_name: TG };
const OTHER = { email: 'm.pavlova@temax.bg', display_name: 'Миглена', role: 'admin', store_name: 'Централен офис' };

function fakeDb(o) {
  o = o || {};
  return { users: 'users' in o ? o.users : USERS, batches: [], lines: [], log: [], seq: 0, failLines: false };
}
function resp(status, body) {
  const t = body == null ? '' : JSON.stringify(body);
  return Promise.resolve({ ok: status < 300, status, headers: { get: () => null },
    json: () => t ? Promise.resolve(JSON.parse(t)) : Promise.reject(new SyntaxError('empty')), text: () => Promise.resolve(t) });
}
function install(h, db) {
  h.w.fetch = function (url, init) {
    const m = ((init && init.method) || 'GET').toUpperCase();
    const u = String(url);
    const tbl = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    const q = decodeURIComponent(u.split('?')[1] || '');
    const body = init && init.body ? JSON.parse(init.body) : null;
    db.log.push({ m, tbl, url: u, q, body, prefer: init && init.headers && init.headers.Prefer });
    if (m === 'GET') {
      if (tbl === 'app_settings') return resp(200, db.users == null ? [] : [{ key: 'picking_users', value: db.users }]);
      if (tbl === 'picking_batches') {
        const wh = (q.match(/warehouse=eq\.([^&]+)/) || [])[1];
        return resp(200, db.batches.filter(b => !wh || b.warehouse === wh).slice().reverse().map(x => Object.assign({}, x)));
      }
      if (tbl === 'picking_lines') {
        if (/offset=[1-9]/.test(q)) return resp(200, []);
        const ids = ((q.match(/batch_id=in\.\(([^)]*)\)/) || [])[1] || '').split(',');
        return resp(200, db.lines.filter(l => ids.indexOf(l.batch_id) >= 0).map(x => Object.assign({}, x)));
      }
      return resp(200, []);
    }
    if (m === 'POST' && tbl === 'picking_batches') {
      const row = Object.assign({ id: 'b-' + (++db.seq), uploaded_at: new Date().toISOString() }, body);
      db.batches.push(row);
      return resp(201, [row]);
    }
    if (m === 'POST' && tbl === 'picking_lines') {
      if (db.failLines) return resp(500, { message: 'boom' });
      const ins = [];
      body.forEach(r => {
        if (r.sap_order != null && db.lines.some(x => x.warehouse === r.warehouse && x.sap_order === r.sap_order && x.sap_item === r.sap_item)) return;
        const row = Object.assign({ id: 'l-' + (++db.seq), status: 'open', qty_picked: null, comment: null, done_by: null, done_at: null, created_at: new Date().toISOString() }, r);
        db.lines.push(row); ins.push({ id: row.id });
      });
      return resp(201, ins);
    }
    if (m === 'PATCH') {
      const id = (q.match(/id=eq\.([^&]+)/) || [])[1];
      const arr = tbl === 'picking_lines' ? db.lines : tbl === 'picking_batches' ? db.batches : [];
      arr.filter(x => x.id === id).forEach(x => Object.assign(x, body));
      return resp(204, null);
    }
    if (m === 'DELETE' && tbl === 'picking_batches') {
      const id = (q.match(/id=eq\.([^&]+)/) || [])[1];
      db.batches = db.batches.filter(b => b.id !== id);
      db.lines = db.lines.filter(l => l.batch_id !== id);
      return resp(204, null);
    }
    return resp(405, { message: 'not in fake' });
  };
}
function env(user, db) {
  const h = boot({ modules: ['stock-returns.js', 'picking.js'], user, data: {} });
  install(h, db);
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = (m, c) => { h.toasts.push({ m: String(m), c: c || '' }); try { orig(m, c); } catch (e) {} };
  return h;
}
const mod = h => h.doc.getElementById('mod-picking');
const pickGets = db => db.log.filter(x => x.m === 'GET' && /^picking_/.test(x.tbl || ''));
const linePosts = db => db.log.filter(x => x.m === 'POST' && x.tbl === 'picking_lines');
const patches = db => db.log.filter(x => x.m === 'PATCH' && x.tbl === 'picking_lines');
const lastToast = h => h.toasts[h.toasts.length - 1] || { m: '', c: '' };
const RED = '#dc2626';
const rowOf = (h, id) => h.doc.getElementById('pk-row-' + id);
const lineBy = (db, store, code) => db.lines.find(l => l.store_name === store && l.sap_code === code);
async function chooseWh(h, wh) {
  const sel = h.doc.getElementById('pk-wh');
  sel.value = wh;
  fire(h.w, sel, 'change');
  await ticks(8);
}
function chip(h, store) {
  return Array.from(h.doc.querySelectorAll('.pk-chip')).find(b => b.getAttribute('data-pk-store') === store) || null;
}

(async function run() {

  section('0. Фикстурата е като файла');
  ok('планиран: 30 колони, празно име на позиция 9, „Oт къде" с латинско O',
    PLANNED[0].length === 30 && PLANNED[0][8] === '' && PLANNED[0][27] === 'Oт къде' && PLANNED[0][27].charCodeAt(0) === 79);
  ok('планиран: всеки ред е 30 клетки', PLANNED.slice(1).every(r => r.length === 30));
  ok('непланиран: 15 колони, всеки ред 15 клетки', UNPLANNED[0].length === 15 && UNPLANNED.slice(1).every(r => r.length === 15));

  section('1. Достъп — имейл извън списъка');
  {
    const db = fakeDb();
    const h = env(OTHER, db);
    let threw = null;
    try { h.w.setupTabsForRole(); } catch (e) { threw = e; }
    await ticks(6);
    ok('setupTabsForRole не хвърля', !threw, threw && threw.message);
    const b = h.doc.getElementById('tps-picking');
    ok('под-бутонът „📦 Пикинг" е скрит', b && b.tagName === 'BUTTON' && b.style.display === 'none');
    h.w.showModule('picking');
    await ticks(8);
    ok('„Нямаш достъп"', !!h.doc.getElementById('pk-noaccess'));
    ok('НИТО ЕДИН GET към picking_*', pickGets(db).length === 0, pickGets(db).map(x => x.tbl).join(','));
    ok('ключът е четен (app_settings)', db.log.some(x => x.m === 'GET' && x.tbl === 'app_settings'));
    ok('няма бутон за качване', !h.doc.getElementById('pk-file'));
    const db2 = fakeDb({ users: null });
    const h2 = env(TENCHO, db2);
    await h2.w.loadPicking(); await ticks(4);
    ok('липсващ ключ → и Тенчо няма достъп, нула GET към picking_*', !!h2.doc.getElementById('pk-noaccess') && pickGets(db2).length === 0);
  }

  section('2. Достъп — в списъка (главни букви и интервали в ключа)');
  const db = fakeDb();
  const h = env(TENCHO, db);
  {
    h.w.setupTabsForRole();
    await ticks(6);
    const b = h.doc.getElementById('tps-picking');
    ok('под-бутонът се показва', b && b.style.display === '');
    realClick(h.w, b);
    await ticks(8);
    ok('реален клик → mod-picking видим', mod(h).style.display === 'block');
    ok('Транспорт остава активен, под-бутонът е active', h.doc.getElementById('tab-transport').classList.contains('active') && b.classList.contains('active'));
    ok('лентата на Транспорт е видима', h.doc.getElementById('transport-pallets-subnav').style.display === 'block');
    const sel = h.doc.getElementById('pk-wh');
    ok('ЦО: селект с двата склада, без избор', sel && sel.options.length === 3 && sel.value === '');
    ok('без склад: няма качване, подсказка', !h.doc.getElementById('pk-file') && !!h.doc.getElementById('pk-need-wh'));
    ok('без склад: нула GET към picking_*', pickGets(db).length === 0);
    const hv = env(VIKTOR, fakeDb());
    await hv.w.loadPicking(); await ticks(6);
    ok('Виктор (store_name = склад, главни букви в ключа) — склад фиксиран, без селект',
      !hv.doc.getElementById('pk-wh') && hv.doc.getElementById('pk-wh-fixed') && hv.doc.getElementById('pk-wh-fixed').textContent === TG);
  }

  section('3. Чужд файл → отказ, нищо не се пише');
  {
    await chooseWh(h, TG);
    ok('избран Търговище → бутон „📂 Качи файл"', !!h.doc.getElementById('pk-file'));
    const n0 = db.log.filter(x => x.m !== 'GET').length;
    const r = await h.w.pkImportAoa(FOREIGN, 'mb51.xlsx');
    ok('„Не е трансферен файл", червен', /Не е трансферен файл/.test(lastToast(h).m) && lastToast(h).c === RED, lastToast(h).m);
    ok('0 записа', db.log.filter(x => x.m !== 'GET').length === n0 && r && r.error);
  }

  section('4. Планиран — Търговище');
  let planned;
  {
    planned = await h.w.pkImportAoa(PLANNED, 'Планиран 41.xlsx');
    const rows = [].concat.apply([], linePosts(db).map(p => p.body));
    ok('влизат 3 реда (За трансфер > 0 И Oт къде = Търговище И познат магазин)', rows.length === 3, rows.map(r => r.sap_code + '/' + r.store_name).join(','));
    ok('редът „За трансфер" 0 не влиза', !rows.some(r => r.sap_code === '20001'));
    ok('редът от Добрич (18) не влиза', !rows.some(r => r.sap_code === '20002'));
    ok('магазин 99 не влиза', !rows.some(r => r.sap_code === '20003'));
    const s = rows.find(r => r.sap_order === '1131783028');
    ok('store_name „Сливен" през SR_SHEET_TO_STORE (не „СЛИВЕН")', s && s.store_name === 'Сливен', s && s.store_name);
    ok('Сливен: код, име, БР, 10, група 110, позиция 10',
      s && s.sap_code === '13456' && s.product_name === 'КОРИТО СТРОИТЕЛНО PVC ПРАВО 40Л' && s.unit === 'БР' && s.qty_requested === 10 &&
      s.supply_group === '110' && s.sap_item === '10' && s.warehouse === TG, JSON.stringify(s));
    ok('Добрич: 15 (колоната „За трансфер")', (rows.find(r => r.store_name === 'Добрич') || {}).qty_requested === 15);
    ok('POST с on_conflict=warehouse,sap_order,sap_item', linePosts(db).every(p => /on_conflict=warehouse,sap_order,sap_item/.test(p.url)));
    ok('… и resolution=ignore-duplicates', linePosts(db).every(p => /resolution=ignore-duplicates/.test(p.prefer || '')));
    const b = db.batches[0];
    ok('batch: planned, общо 6, пропуснати 3, влезли 3 (PATCH)', b && b.source === 'planned' && b.rows_total === 6 && b.rows_skipped === 3 && b.rows_imported === 3, JSON.stringify(b));
    ok('toast казва непознатия номер 99 и е червен', /99/.test(lastToast(h).m) && lastToast(h).c === RED, lastToast(h).m);
    ok('импортът не спря заради 99 (3 нови)', planned && planned.inserted === 3);
    ok('списъкът на качванията — 1 ред със срок петък', h.doc.querySelectorAll('#pk-batches tbody tr').length === 1 && /срок: петък \d\d\.\d\d 12:00/.test(h.doc.querySelector('.pk-deadline').textContent));
    ok('видим ред „Показани са качванията от последните 14 дни"', !!h.doc.getElementById('pk-days-note') &&
      h.doc.getElementById('pk-days-note').textContent === 'Показани са качванията от последните 14 дни');
  }

  section('5. Повторно качване на същия планиран файл');
  {
    const before = db.lines.length;
    const r = await h.w.pkImportAoa(PLANNED, 'Планиран 41.xlsx');
    ok('0 нови реда (ignore-duplicates)', r && r.inserted === 0 && db.lines.length === before, r && r.inserted);
  }

  section('6. Непланиран — обект → обект се брои отделно');
  {
    const r = await h.w.pkImportAoa(UNPLANNED, 'Непланиран 41.xlsx');
    const rows = linePosts(db).slice(-1)[0].body;
    ok('влизат 3 реда (изпълнител 5)', rows.length === 3, rows.length);
    ok('изпълнител 8 (обект) не влиза', !rows.some(x => x.sap_code === '55555'));
    ok('toast: „1 реда са обект → обект — не са за склада"', /1 реда са обект → обект — не са за склада/.test(r && r.message || ''), r && r.message);
    const m = rows.find(x => x.sap_code === '64694');
    ok('Монтана: БР, 31, без заявка/позиция/група', m && m.store_name === 'Монтана' && m.unit === 'БР' && m.qty_requested === 31 &&
      m.sap_order === null && m.sap_item === null && m.supply_group === null, JSON.stringify(m));
    const b = db.batches.find(x => x.source === 'unplanned');
    ok('batch: unplanned, общо 4, пропуснати 1, влезли 3', b && b.rows_total === 4 && b.rows_skipped === 1 && b.rows_imported === 3, JSON.stringify(b));
  }

  section('7. Чипове по обект');
  {
    const chips = Array.from(h.doc.querySelectorAll('.pk-chip')).map(c => c.textContent);
    ok('5 обекта: Добрич, Монтана, Пирдоп, Раднево, Сливен', chips.length === 5 &&
      ['Добрич', 'Монтана', 'Пирдоп', 'Раднево', 'Сливен'].every((s, i) => chips[i].indexOf(s) === 0), chips.join(' | '));
    ok('Раднево: „взети 0 от 2"', /Раднево · взети 0 от 2/.test(chips[3]), chips[3]);
    const hOne = env(TENCHO, (function () { const d = fakeDb(); d.batches.push({ id: 'b1', warehouse: TG, source: 'planned', uploaded_at: new Date().toISOString() });
      d.lines.push({ id: 'x1', batch_id: 'b1', warehouse: TG, store_name: 'Сливен', sap_code: '1', qty_requested: 2, status: 'open', line_no: 2 }); return d; })());
    hOne.w.pkWarehouse = TG;
    await hOne.w.loadPicking(); await ticks(6);
    ok('само 1 обект → чипът пак е там', hOne.doc.querySelectorAll('.pk-chip').length === 1);
  }

  section('8. ✓ Взето (реален клик)');
  const sl = lineBy(db, 'Сливен', '13456'), rd = lineBy(db, 'Раднево', '13456'), db16 = lineBy(db, 'Добрич', '13456'), mt = lineBy(db, 'Монтана', '64694');
  {
    realClick(h.w, chip(h, 'Сливен')); await ticks(2);
    realClick(h.w, btn(rowOf(h, sl.id), '✓ Взето')); await ticks(2);
    const inp = h.doc.getElementById('pk-qty-' + sl.id);
    ok('полето за брой е предварително = 10', inp && Number(inp.value) === 10);
    realClick(h.w, btn(rowOf(h, sl.id), 'Запиши')); await ticks(6);
    const p = patches(db).slice(-1)[0];
    ok('равен брой → picked, qty_picked NULL, done_by, done_at', p && p.body.status === 'picked' && p.body.qty_picked === null && p.body.done_by === 'Тенчо' && !!p.body.done_at, p && JSON.stringify(p.body));
    ok('взетият ред излиза от „Отворени"', !rowOf(h, sl.id));
    realClick(h.w, h.doc.getElementById('pk-f-all')); await ticks(2);
    ok('под „Всички": бадж „✓ 10 от 10" и „↩ Върни"', !!rowOf(h, sl.id) && /✓ 10 от 10/.test(rowOf(h, sl.id).textContent) && !!btn(rowOf(h, sl.id), '↩ Върни'));

    realClick(h.w, chip(h, 'Раднево')); await ticks(2);
    realClick(h.w, btn(rowOf(h, rd.id), '✓ Взето')); await ticks(2);
    h.doc.getElementById('pk-qty-' + rd.id).value = '0';
    const n0 = patches(db).length;
    realClick(h.w, btn(rowOf(h, rd.id), 'Запиши')); await ticks(4);
    ok('брой 0 → отказ, без PATCH', patches(db).length === n0 && lastToast(h).c === RED, lastToast(h).m);
    h.doc.getElementById('pk-qty-' + rd.id).value = '7';
    realClick(h.w, btn(rowOf(h, rd.id), 'Запиши')); await ticks(6);
    const p2 = patches(db).slice(-1)[0];
    ok('различен брой → qty_picked 7', p2 && p2.body.status === 'picked' && p2.body.qty_picked === 7, p2 && JSON.stringify(p2.body));
    ok('чипът на Раднево: „взети 1 от 2"', /Раднево · взети 1 от 2/.test(chip(h, 'Раднево').textContent));
  }

  section('9. ⤼ Пропусни');
  {
    realClick(h.w, chip(h, 'Добрич')); await ticks(2);
    realClick(h.w, btn(rowOf(h, db16.id), '⤼ Пропусни')); await ticks(2);
    const n0 = patches(db).length;
    h.doc.getElementById('pk-comment-' + db16.id).value = '   ';
    realClick(h.w, btn(rowOf(h, db16.id), 'Запиши')); await ticks(4);
    ok('празен коментар → без PATCH, червен toast', patches(db).length === n0 && lastToast(h).c === RED);
    h.doc.getElementById('pk-comment-' + db16.id).value = 'няма на място';
    realClick(h.w, btn(rowOf(h, db16.id), 'Запиши')); await ticks(6);
    const p = patches(db).slice(-1)[0];
    ok('skipped + comment, qty_picked NULL', p && p.body.status === 'skipped' && p.body.comment === 'няма на място' && p.body.qty_picked === null);
    ok('бадж с коментара', /⤼ няма на място/.test(rowOf(h, db16.id).textContent));
  }

  section('10. ↩ Върни');
  {
    realClick(h.w, chip(h, 'Монтана')); await ticks(2);
    realClick(h.w, btn(rowOf(h, mt.id), '⤼ Пропусни')); await ticks(2);
    h.doc.getElementById('pk-comment-' + mt.id).value = 'временно';
    realClick(h.w, btn(rowOf(h, mt.id), 'Запиши')); await ticks(6);
    realClick(h.w, h.doc.getElementById('pk-f-all')); await ticks(2);
    realClick(h.w, btn(rowOf(h, mt.id), '↩ Върни')); await ticks(6);
    const p = patches(db).slice(-1)[0];
    ok('open и изчистени qty_picked / comment / done_by / done_at', p && p.body.status === 'open' &&
      p.body.qty_picked === null && p.body.comment === null && p.body.done_by === null && p.body.done_at === null, p && JSON.stringify(p.body));
    ok('в базата е open', db.lines.find(l => l.id === mt.id).status === 'open');
    ok('пак има ✓ Взето', !!btn(rowOf(h, mt.id), '✓ Взето'));
  }

  section('11. Филтър и търсене');
  {
    realClick(h.w, chip(h, 'Раднево')); await ticks(2);
    realClick(h.w, h.doc.getElementById('pk-f-open')); await ticks(2);
    ok('Раднево: Отворени (1) / Взети (1) / Пропуснати (0) / Всички (2)',
      /\(1\)/.test(h.doc.getElementById('pk-f-open').textContent) && /\(1\)/.test(h.doc.getElementById('pk-f-picked').textContent) &&
      /\(0\)/.test(h.doc.getElementById('pk-f-skipped').textContent) && /\(2\)/.test(h.doc.getElementById('pk-f-all').textContent));
    ok('Отворени показва само непланирания ред', h.doc.querySelectorAll('#pk-list .pk-row').length === 1 && !!rowOf(h, lineBy(db, 'Раднево', '103742').id));
    realClick(h.w, h.doc.getElementById('pk-f-all')); await ticks(2);
    const s = h.doc.getElementById('pk-search');
    s.value = 'калъф'; fire(h.w, s, 'input');
    ok('търсене „калъф" → 1 ред', h.doc.querySelectorAll('#pk-list .pk-row').length === 1);
    s.value = '13456'; fire(h.w, s, 'input');
    ok('търсене по код 13456 → 1 ред', h.doc.querySelectorAll('#pk-list .pk-row').length === 1 && !!rowOf(h, rd.id));
    ok('търсенето не пресъздава полето (фокусът остава)', h.doc.getElementById('pk-search') === s);
    s.value = ''; fire(h.w, s, 'input');
    const groups = Array.from(h.doc.querySelectorAll('#pk-list .pk-group')).map(g => g.getAttribute('data-pk-group'));
    ok('групи: 110, после „без група" най-отдолу', groups.join('|') === '110|', groups.join('|'));
  }

  section('12. 🗑 само при качване без отметнати редове');
  {
    const bp = db.batches.find(b => b.source === 'planned'), bu = db.batches.find(b => b.source === 'unplanned');
    const del = id => h.doc.querySelector('tr[data-pk-batch="' + id + '"] .pk-del');
    ok('планираният (има взети) — без 🗑', !del(bp.id));
    ok('непланираният (всичко отворено) — с 🗑', !!del(bu.id));
  }

  section('13. 🖨 Отклонения');
  {
    realClick(h.w, h.doc.getElementById('pk-print')); await ticks(2);
    const pr = h.doc.getElementById('mod-print');
    const ids = Array.from(pr.querySelectorAll('tr.pk-dev')).map(t => t.getAttribute('data-pk-id'));
    ok('печатът е видим', pr.style.display === 'block' && !!pr.querySelector('[data-pk-print]'));
    ok('съдържа пропуснатия (Добрич) с коментара', ids.indexOf(db16.id) >= 0 && /няма на място/.test(pr.textContent));
    ok('съдържа взетия с различен брой (Раднево, 7 от 10)', ids.indexOf(rd.id) >= 0);
    ok('НЕ съдържа взетия с равен брой (Сливен)', ids.indexOf(sl.id) < 0);
    ok('НЕ съдържа върнатия (Монтана)', ids.indexOf(mt.id) < 0);
    ok('точно 2 реда', ids.length === 2, ids.join(','));
    const rdRow = pr.querySelector('tr[data-pk-id="' + rd.id + '"]');
    ok('Раднево: заявка / позиция, заявено, взето, кой', rdRow && /1211685744 \/ 10/.test(rdRow.textContent) && /10 БР/.test(rdRow.textContent) && rdRow.cells[5].textContent === '7' && /Тенчо/.test(rdRow.textContent));
    const css = pr.querySelector('style').textContent;
    ok('CSS: white-space:normal в клетките', /\.pk-tbl th,\.pk-tbl td\{[^}]*white-space:normal/.test(css));
    ok('CSS: box-sizing:border-box', /\.pk-tbl th,\.pk-tbl td\{[^}]*box-sizing:border-box/.test(css));
    ok('CSS: долна рамка на последния ред', /\.pk-tbl tr:last-child td\{[^}]*border-bottom:1px solid/.test(css));
    realClick(h.w, btn(pr, '← Назад')); await ticks(6);
    ok('← Назад → обратно в Пикинг', mod(h).style.display === 'block');
  }

  section('14. Пада втората заявка → червен toast и DELETE на batch-а');
  {
    const d = fakeDb();
    const hf = env(TENCHO, d);
    hf.w.pkWarehouse = TG;
    await hf.w.loadPicking(); await ticks(4);
    d.failLines = true;
    const r = await hf.w.pkImportAoa(PLANNED, 'Планиран 41.xlsx');
    const del = d.log.filter(x => x.m === 'DELETE' && x.tbl === 'picking_batches');
    ok('червен toast „качването е отменено"', /отменено/.test(lastToast(hf).m) && lastToast(hf).c === RED, lastToast(hf).m);
    ok('DELETE на същия batch', del.length === 1 && /id=eq\.b-1/.test(del[0].q), del.map(x => x.q).join(','));
    ok('в базата няма batch и редове', d.batches.length === 0 && d.lines.length === 0);
    ok('rep.failed', r && r.failed === true);
  }

  section('15. Склад Добрич: планираният дава само Габрово');
  {
    const d = fakeDb();
    const hd = env(TENCHO, d);
    hd.w.pkWarehouse = 'Логистичен склад Добрич';
    await hd.w.loadPicking(); await ticks(4);
    await hd.w.pkImportAoa(PLANNED, 'p.xlsx');
    ok('само 20002 → Габрово', d.lines.length === 1 && d.lines[0].store_name === 'Габрово' && d.lines[0].warehouse === 'Логистичен склад Добрич');
    const n = d.log.filter(x => x.m === 'POST').length;
    await hd.w.pkImportAoa(UNPLANNED, 'u.xlsx');
    ok('непланираният за Търговище → „нито един ред", нищо не се пише', /Нито един ред/.test(lastToast(hd).m) && d.log.filter(x => x.m === 'POST').length === n);
  }

  section('16. Срокът — първият петък СЛЕД деня на качването');
  {
    ok('сряда 21.10.2026 → петък 23.10', h.w.pkDeadline('2026-10-21T09:00:00') === 'петък 23.10 12:00', h.w.pkDeadline('2026-10-21T09:00:00'));
    ok('петък 23.10.2026 → петък 30.10', h.w.pkDeadline('2026-10-23T08:00:00') === 'петък 30.10 12:00');
    ok('събота 24.10.2026 → петък 30.10', h.w.pkDeadline('2026-10-24T08:00:00') === 'петък 30.10 12:00');
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
