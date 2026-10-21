/* „➖ Минуси" (minusi.js), етап 1 — качване на експорта от SAP, FIFO
   закриване 955 ← 956 по обект + материал, праг по мерна единица, изгледите
   на обекта и на контролинга, попълване от обекта.
   Интеграционно: shared.js + revaluation.js + revisions.js + minusi.js в реда
   от index.html (под-лентата на „Ревизии и преоценка" е обща).

   Фикстурата е реални редове от „Гоце Делчев 15.10", лист „от САП" — с
   колоната „Сума в МестВал." вътре нарочно. Очакваното е сверено с листа
   „за магазина незакрити движения" на Миглена.

   Базата е фалшив PostgREST в паметта (fakeDb): on_conflict + ignore-duplicates
   при POST към minus_movements връща само реално вмъкнатите — както живият.

   Мутационна проверка (20.10.2026) — всеки вариант е пуснат и е паднал:
     M1 FIFO от най-новия (mnCmp955 обърнат)
        → падат „40243 — само редът от 14.10“ и „редът е точно 955 от 14.10“;
     M2 нетиране по завод вместо по обект (ключът на групата с m.plant)
        → падат „40243 → 2 | -1 | 1“ (по артикул излиза 1|0|1 — двата завода
        са два реда) и синтетичните 99001 / 99002. Дневният изглед на
        реалната фикстура НЕ различава двата модела (всеки материал се нулира
        и в рамките на завода), затова 99001 е добавен нарочно;
     M3 сумата влиза в payload-а (amount: row[9] в mnParseSap)
        → падат „няма поле за сума“, „няма стойност 3.7 …“ и точният списък;
     M4 прагът със строго > вместо >=
        → пада „остатък точно 0.01 M2 → показва се“;
     M5 без проверката за minus_stores при зареждане
        → пада „движенията не се теглят“;
     M6 PATCH-ът носи и qty
        → пада „само real_code/reason_id/…“.
   Секция 3б (21.10.2026, „Запази“ в рамките на картата) — пак пуснати:
     M7 менюто „Причина“ без width:180px → пада „всяко е с width:180px…“;
     M8 onchange не пипа title → пада „смяна на избора (change) → title…“;
     M9 title без записаната причина → пада „ред със записана причина…“.
   Защо 180px, а не 220px — измерено от чата с Playwright върху 89dc753 +
   тази промяна (manager, Гоце Делчев, 33 реда), #mn-daily срещу картата:
     220px, екран 1280 → 1254 срещу 1246 px — прелива;
     180px, екран 1280 → 1214 срещу 1246 px — събира се (~30 px запас);
     180px, екран 1366 → 1226 срещу 1266 px.
   Без фиксирана ширина менюто беше ~378 px и таблицата — 1412 px.
   Самата ширина на таблицата jsdom НЕ я мери (няма лейаут) — тя се
   проверява на живо (claude/open/21-10-minusi-save-visible-live.md).
   Секция 3в (21.10.2026, бутоните да изглеждат като бутони):
     M10 „Запази“ пак с btn-primary → пада „„Запази“: btn + btn-green…“;
     M11 „📤 Качи файл“ пак с btn-primary → пада „„📤 Качи файл“ (admin)…“.
   jsdom не смята CSS — тестът заковава класовете; че бутонът е зелен,
   се проверява на живо (claude/open/21-10-minusi-btn-style-live.md).
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, ok, guard, section, report, ticks } = H;

const HEADER = ['Завод', 'Име 1', 'Склад', 'Материал', 'Описание на материал', 'Вид движение',
  'Текст Вид Движение', 'Колич. в ед. въвежд.', 'Единица на запис', 'Сума в МестВал.',
  'Документ за материал', 'Позиция докум.матер.', 'Дата осчетоводяване',
  'Текст общи данни док', 'Текст', 'Референция', 'Поръчка за доставка'];
const RAW = `5519;ТМ Гоце Делчев;1000;17273;СИЛИКОН CERESIT CS25 САНИТ. ТЕРА/КАФЯВ 2;955;Недостиг AUTO;1;БР;3.7;4903352250;3;14.10.2026;Недостиг-14.10.2026-7519;;;
7519;Гоце Делчев;1000;23030;ПАНЕЛ LED СМ КВАДРАТ 15W 42K;956;Сторно Недостиг AUTO;-1;БР;-3.19;4903351502;5;14.10.2026;Оправен минус;;;
7519;Гоце Делчев;1000;23030;ПАНЕЛ LED СМ КВАДРАТ 15W 42K;955;Недостиг AUTO;1;БР;2.68;4903348507;2;12.10.2026;Недостиг-12.10.2026-7519;;;
5519;ТМ Гоце Делчев;1000;40243;КЮНЕЦ ЕМАЙЛ.Ф130 ЧЕРЕН МАТ 33СМ;955;Недостиг AUTO;1;БР;1.7;4903352250;1;14.10.2026;Недостиг-14.10.2026-7519;;;
7519;Гоце Делчев;1000;40243;КЮНЕЦ ЕМАЙЛ.Ф130 ЧЕРЕН МАТ 33СМ;956;Сторно Недостиг AUTO;-1;БР;-1.96;4903348670;5;12.10.2026;;;;
7519;Гоце Делчев;1000;40243;КЮНЕЦ ЕМАЙЛ.Ф130 ЧЕРЕН МАТ 33СМ;955;Недостиг AUTO;1;БР;0;4903346948;2;11.10.2026;Недостиг-11.10.2026-7519;;;
7519;Гоце Делчев;1000;48349;КЕРЕМИДИ МЕТАЛНИ BALCANIC 0.5 ГЛАНЦ;955;Недостиг AUTO;0.003;M2;0;4903341958;2;07.10.2026;Недостиг-07.10.2026-7519;;;
5519;ТМ Гоце Делчев;1000;52215;БЪРСАЛКА ВЪЖЕ ПАМУК 200Г КОНУС MEGA 7301;956;Сторно Недостиг AUTO;-2;БР;-1.4;4903351458;1;14.10.2026;Оправен минус;;;
5519;ТМ Гоце Делчев;1000;52215;БЪРСАЛКА ВЪЖЕ ПАМУК 200Г КОНУС MEGA 7301;955;Недостиг AUTO;1;БР;0.7;4903350867;4;13.10.2026;Недостиг-13.10.2026-7519;;;
5519;ТМ Гоце Делчев;1000;52215;БЪРСАЛКА ВЪЖЕ ПАМУК 200Г КОНУС MEGA 7301;955;Недостиг AUTO;1;БР;0.7;4903350793;1;13.10.2026;Недостиг-13.10.2026-7519;;;
7519;Гоце Делчев;1000;52215;БЪРСАЛКА ВЪЖЕ ПАМУК 200Г КОНУС MEGA 7301;956;Сторно Недостиг AUTO;-1;БР;-0.81;4903348666;1;12.10.2026;;;;
7519;Гоце Делчев;1000;52215;БЪРСАЛКА ВЪЖЕ ПАМУК 200Г КОНУС MEGA 7301;955;Недостиг AUTO;1;БР;0.75;4903347366;2;11.10.2026;Недостиг-11.10.2026-7519;;;
5519;ТМ Гоце Делчев;1000;95498;КАНАЛ КАБЕЛЕН САМОЗАЛ.PVC 15X10 2М БЯЛ;956;Сторно Недостиг AUTO;-2;БР;-0.46;4903351458;3;14.10.2026;Оправен минус;;;
5519;ТМ Гоце Делчев;1000;95498;КАНАЛ КАБЕЛЕН САМОЗАЛ.PVC 15X10 2М БЯЛ;955;Недостиг AUTO;2;БР;0.46;4903350867;3;13.10.2026;Недостиг-13.10.2026-7519;;;
7519;Гоце Делчев;1000;95498;КАНАЛ КАБЕЛЕН САМОЗАЛ.PVC 15X10 2М БЯЛ;956;Сторно Недостиг AUTO;-3;БР;-0.79;4903348670;2;12.10.2026;;;;
7519;Гоце Делчев;1000;95498;КАНАЛ КАБЕЛЕН САМОЗАЛ.PVC 15X10 2М БЯЛ;955;Недостиг AUTO;3;БР;0.75;4903343419;2;08.10.2026;Недостиг-08.10.2026-7519;;;
7519;Гоце Делчев;1000;98275;ГРАНИТОГРЕС GAIOS 60/120 GLOSSY;955;Недостиг AUTO;2.88;M2;13.97;4903341685;1;07.10.2026;Недостиг-07.10.2026-7519;;;`;
/* Числата като в SheetJS при raw:true — числа, не низове. Датата остава низ
   (MB51 я дава като текст dd.mm.yyyy); серийният номер се проверява отделно. */
const ROWS = RAW.split('\n').map(l => l.split(';').slice(0, 17).map((c, i) => ([0, 3, 7, 9, 10, 11].indexOf(i) >= 0 && c !== '' ? Number(c) : c)));
const AOA = [HEADER].concat(ROWS);
const AMOUNTS = ['3.7', '13.97', '-1.96', '3,7', '13,97', '1,96'];

const PLANTS = [['5502', 'Севлиево'], ['2502', 'Севлиево'], ['5514', 'Шумен'], ['6514', 'Шумен'], ['5519', 'Гоце Делчев'], ['7519', 'Гоце Делчев']]
  .map(p => ({ plant: p[0], store_name: p[1] }));
const REASONS = ['клиентска поръчка (номер/дата)', 'последна бройка, липсва код', 'продажба на цялото количество, липсва код',
  'има още количество, липсва код', 'реална продажба, чака вход от ЛСТ'].map((l, i) => ({ id: i + 1, label: l, active: true, sort: i + 1 }));
const THR = [{ uom: 'M2', min_qty: 0.01 }, { uom: 'ЛМ', min_qty: 0.01 }];

const ADMIN = { email: 'm.pavlova@temax.bg', display_name: 'Миглена', role: 'admin', store_name: 'Централен офис' };
const GD = { email: 'managergdelchev@temax.bg', display_name: 'Управител ГД', role: 'manager', store_name: 'Гоце Делчев' };
const GD_SKLAD = { email: 'sklad.gdelchev@temax.bg', display_name: 'Склад ГД', role: 'sklad', store_name: 'Гоце Делчев' };
const SHUMEN = { email: 'shumen@temax.bg', display_name: 'Управител Шумен', role: 'manager', store_name: 'Шумен' };

function fakeDb(o) {
  o = o || {};
  return {
    settings: o.settings != null ? o.settings : 'Гоце Делчев',
    thr: o.thr || THR,
    movs: o.movs || [], uploads: [], log: [], seq: 0
  };
}
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
    db.log.push({ m, tbl, url: u, q, body, prefer: init && init.headers && init.headers.Prefer });
    if (m === 'GET') {
      if (tbl === 'app_settings') return resp(200, db.settings == null ? [] : [{ key: 'minus_stores', value: db.settings }]);
      if (tbl === 'minus_plants') return resp(200, PLANTS);
      if (tbl === 'minus_reasons') return resp(200, REASONS);
      if (tbl === 'minus_uom_thresholds') return resp(200, db.thr);
      if (tbl === 'minus_uploads') return resp(200, db.uploads.slice(-1));
      if (tbl === 'minus_movements') {
        if (/offset=[1-9]/.test(q)) return resp(200, []);
        const st = (q.match(/store_name=eq\.([^&]+)/) || [])[1];
        return resp(200, db.movs.filter(x => !st || x.store_name === st).map(x => Object.assign({}, x)));
      }
      return resp(200, []);
    }
    if (m === 'POST' && tbl === 'minus_uploads') {
      const row = Object.assign({ id: 'up-' + (++db.seq), uploaded_at: new Date().toISOString() }, body);
      db.uploads.push(row);
      return resp(201, [row]);
    }
    if (m === 'POST' && tbl === 'minus_movements') {
      const ins = [];
      body.forEach(r => {
        if (db.movs.some(x => x.mat_doc === r.mat_doc && x.doc_item === r.doc_item && x.doc_year === r.doc_year)) return;
        const row = Object.assign({ id: 'mv-' + (++db.seq), real_code: null, reason_id: null, employee_name: null, note: null, filled_by: null, filled_at: null }, r);
        db.movs.push(row); ins.push({ id: row.id });
      });
      return resp(201, ins);
    }
    if (m === 'PATCH') {
      const id = (q.match(/id=eq\.([^&]+)/) || [])[1];
      const arr = tbl === 'minus_movements' ? db.movs : tbl === 'minus_uploads' ? db.uploads : [];
      arr.filter(x => x.id === id).forEach(x => Object.assign(x, body));
      return resp(204, null);
    }
    return resp(405, { message: 'not in fake' });
  };
}
function env(user, db) {
  const h = boot({ modules: ['revaluation.js', 'revisions.js', 'minusi.js'], user, data: {} });
  install(h, db);
  return h;
}
const mod = h => h.doc.getElementById('mod-minusi');
async function open(h) { await h.w.loadMinusi(); await ticks(6); }
const dailyRows = h => Array.from(h.doc.querySelectorAll('#mn-daily tbody tr'));
const cellTxt = tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
const movPosts = db => db.log.filter(x => x.m === 'POST' && x.tbl === 'minus_movements');
function noAmountInDom(name, h) {
  const t = mod(h).textContent;
  const hit = AMOUNTS.filter(a => t.indexOf(a) >= 0);
  ok(name, hit.length === 0, hit.join(' '));
}

(async function run() {

  section('1. Контролинг качва файла — без суми, отчет на качването');
  const db = fakeDb();
  {
    const h = env(ADMIN, db); await open(h);
    ok('контролингът вижда бутон „📤 Качи файл“', !!h.doc.getElementById('mn-file'));
    let rep = null, err = null;
    try { rep = await h.w.mnImportAoa(AOA, 'Гоце Делчев 15.10.xlsx'); await ticks(6); } catch (e) { err = e; }
    if (ok('mnImportAoa не хвърля', !err, err && err.message)) {
      const posts = movPosts(db);
      const all = [].concat.apply([], posts.map(p => p.body));
      ok('записани са всичките 17 реда', all.length === 17, all.length);
      ok('няма поле за сума в payload-а', all.every(r => Object.keys(r).every(k => !/amount|сума|sum|value/i.test(k))), Object.keys(all[0] || {}).join(','));
      const blob = JSON.stringify(all);
      ok('няма стойност 3.7 / 13.97 / -1.96 в payload-а', !/(^|[^\d.])(3\.7|13\.97|-1\.96)([^\d]|$)/.test(blob));
      ok('полетата на payload-а — точният списък', Object.keys(all[0] || {}).sort().join(',') ===
        ['upload_id', 'plant', 'store_name', 'material', 'material_desc', 'mvt_type', 'qty', 'uom', 'mat_doc', 'doc_item', 'doc_year', 'posting_date', 'header_text'].sort().join(','), Object.keys(all[0] || {}).sort().join(','));
      ok('POST-ът е с on_conflict по документ+позиция+година', posts.every(p => /on_conflict=mat_doc,doc_item,doc_year/.test(p.url)));
      ok('… и ignore-duplicates', posts.every(p => /resolution=ignore-duplicates/.test(p.prefer || '')));
      ok('обектът е по завода: 5519 и 7519 → Гоце Делчев', all.every(r => r.store_name === 'Гоце Делчев'));
      const r1 = all.find(r => r.mat_doc === '4903352250' && r.doc_item === '3');
      ok('ред 17273: дата, година, знак', r1 && r1.posting_date === '2026-10-14' && r1.doc_year === 2026 && r1.qty === 1 && r1.mvt_type === '955');
      ok('956 е със знак минус', all.filter(r => r.mvt_type === '956').every(r => r.qty < 0));
      ok('rows_new = 17', rep && rep.inserted === 17, rep && rep.inserted);
      const up = db.uploads[0];
      ok('minus_uploads: rows_total 17, rows_new 17 (PATCH), период 07.10–14.10', up && up.rows_total === 17 && up.rows_new === 17 && up.date_from === '2026-10-07' && up.date_to === '2026-10-14');
      ok('отчетът: общо 17 / нови 17 / вече качени 0',
        h.doc.getElementById('mn-rep-total').textContent === '17' && h.doc.getElementById('mn-rep-new').textContent === '17' && h.doc.getElementById('mn-rep-already').textContent === '0');
    }

    section('2. Изгледите на контролинга (Гоце Делчев по подразбиране)');
    const rows = dailyRows(h);
    ok('Дневният изглед: ТОЧНО 3 реда', rows.length === 3, rows.map(r => cellTxt(r)[0]).join(','));
    const by = {}; rows.forEach(r => { by[cellTxt(r)[0]] = cellTxt(r); });
    ok('17273: 14.10.2026, 1 БР', by['17273'] && by['17273'][2] === '14.10.2026' && by['17273'][3] === '1' && by['17273'][4] === 'БР');
    ok('40243 — само редът от 14.10 (11.10 е закрит от 956 на 12.10)', by['40243'] && by['40243'][2] === '14.10.2026' && by['40243'][3] === '1', by['40243'] && by['40243'][2]);
    ok('98275: 07.10.2026, 2,88 M2', by['98275'] && by['98275'][2] === '07.10.2026' && by['98275'][3] === '2,88' && by['98275'][4] === 'M2');
    ok('23030, 52215, 95498 — закрити, 48349 — скрит от прага', ['23030', '52215', '95498', '48349'].every(m => !by[m]));
    ok('контролингът не попълва: няма бутон „Запази“', !btn(mod(h), 'Запази'));
    ok('филтър „само непопълнени“ (3)', !!h.doc.getElementById('mn-unfilled') && h.doc.getElementById('mn-unfilled').parentNode.textContent.indexOf('(3)') >= 0);
    noAmountInDom('DOM на контролинга без суми (дневен)', h);
    realClick(h.w, h.doc.getElementById('mn-v-bymat'));
    const mats = Array.from(h.doc.querySelectorAll('#mn-bymat tbody tr')).map(cellTxt);
    ok('„Незакрити по артикул“: 3 материала', mats.length === 3, mats.map(r => r[0]).join(','));
    const bm = {}; mats.forEach(r => { bm[r[0]] = r; });
    ok('17273 → 1 | 0 | 1', bm['17273'] && bm['17273'].slice(2, 5).join('|') === '1|0|1', bm['17273'] && bm['17273'].join('|'));
    ok('40243 → 2 | -1 | 1', bm['40243'] && bm['40243'].slice(2, 5).join('|') === '2|-1|1', bm['40243'] && bm['40243'].join('|'));
    ok('98275 → 2,88 | 0 | 2,88', bm['98275'] && bm['98275'].slice(2, 5).join('|') === '2,88|0|2,88', bm['98275'] && bm['98275'].join('|'));
    noAmountInDom('DOM на контролинга без суми (по артикул)', h);
    realClick(h.w, h.doc.getElementById('mn-v-daily'));
    ok('обратно към Дневен', dailyRows(h).length === 3);
  }

  section('3. Обектът попълва — реален клик „Запази“, PATCH само на шестте полета');
  let fillId;
  {
    const h = env(GD, db); await open(h);
    ok('обектът няма качване', !h.doc.getElementById('mn-file') && !h.doc.getElementById('mn-upload'));
    ok('обектът няма селектор на обект', !h.doc.getElementById('mn-store'));
    const rows = dailyRows(h);
    ok('Дневен на обекта: 3 реда', rows.length === 3);
    noAmountInDom('DOM на обекта без суми', h);
    const tr = rows.find(r => cellTxt(r)[0] === '40243');
    fillId = tr && tr.getAttribute('data-mn-id');
    const want = db.movs.find(x => x.material === '40243' && x.posting_date === '2026-10-14');
    ok('редът е точно 955 от 14.10', want && fillId === want.id);
    const sel = h.doc.getElementById('mn-reason-' + fillId);
    ok('причината е падащо меню само от minus_reasons', sel && sel.tagName === 'SELECT' && sel.options.length === REASONS.length + 1);
    ok('без свободен текст за причина (няма input за причина)', !h.doc.querySelector('input[id^="mn-reason-"]'));
    /* без причина → не записва */
    const n0 = db.log.filter(x => x.m === 'PATCH').length;
    realClick(h.w, btn(tr, 'Запази')); await ticks(4);
    ok('без причина → toast, без PATCH', db.log.filter(x => x.m === 'PATCH').length === n0 && h.calls.toast.some(t => /причина/.test(t)));
    /* попълване на друг ред — черновата трябва да оцелее при запис на първия */
    const other = rows.find(r => cellTxt(r)[0] === '17273').getAttribute('data-mn-id');
    h.doc.getElementById('mn-emp-' + other).value = 'Чернова';
    h.doc.getElementById('mn-code-' + fillId).value = '40244';
    sel.value = '5';
    h.doc.getElementById('mn-emp-' + fillId).value = 'Иван Иванов';
    h.doc.getElementById('mn-note-' + fillId).value = 'КЗ 123 / 13.10';
    realClick(h.w, btn(h.doc.getElementById('mn-row-' + fillId), 'Запази')); await ticks(4);
    const p = db.log.filter(x => x.m === 'PATCH' && x.tbl === 'minus_movements');
    ok('един PATCH към minus_movements', p.length === 1, p.length);
    if (p[0]) {
      ok('PATCH на точния ред (id=eq.)', p[0].q === 'id=eq.' + fillId, p[0].q);
      ok('само real_code/reason_id/employee_name/note/filled_by/filled_at', Object.keys(p[0].body).sort().join(',') === 'employee_name,filled_at,filled_by,note,real_code,reason_id', Object.keys(p[0].body).join(','));
      ok('стойностите', p[0].body.real_code === '40244' && p[0].body.reason_id === 5 && p[0].body.employee_name === 'Иван Иванов' && p[0].body.note === 'КЗ 123 / 13.10' && p[0].body.filled_by === 'Управител ГД');
    }
    const tr2 = h.doc.getElementById('mn-row-' + fillId);
    ok('попълненият ред остава видим, с отметка ✅', tr2 && !!tr2.querySelector('.mn-done'));
    ok('черновата на другия ред оцелява при прерисуване', h.doc.getElementById('mn-emp-' + other).value === 'Чернова');
  }
  {
    const h = env(GD_SKLAD, db); await open(h);
    ok('роля sklad също попълва (има „Запази“)', !!btn(mod(h), 'Запази'));
    ok('sklad вижда попълненото: причината е избрана', h.doc.getElementById('mn-reason-' + fillId).value === '5');
  }

  section('3б. „Причина“ — фиксирана ширина 180px, целият текст в title');
  {
    const h = env(GD, db); await open(h);
    const sels = Array.from(h.doc.querySelectorAll('select[id^="mn-reason-"]'));
    ok('менютата „Причина“ са 3', sels.length === 3, sels.length);
    ok('всяко е с width:180px и max-width:180px', sels.every(s => s.style.width === '180px' && s.style.maxWidth === '180px'), sels.map(s => s.getAttribute('style')).join(' | '));
    const done = h.doc.getElementById('mn-reason-' + fillId);
    ok('ред със записана причина → title = текстът ѝ', done && done.title === 'реална продажба, чака вход от ЛСТ', done && done.title);
    const empty = sels.find(s => s.id !== 'mn-reason-' + fillId);
    ok('ред без причина → празен title', empty && empty.title === '' && empty.value === '', empty && JSON.stringify(empty.title));
    empty.value = '3';
    fire(h.w, empty, 'change');
    ok('смяна на избора (change) → title = новата причина', empty.title === 'продажба на цялото количество, липсва код', empty.title);
    empty.value = '';
    fire(h.w, empty, 'change');
    ok('обратно на „— избери —“ → празен title', empty.title === '', JSON.stringify(empty.title));
  }

  section('3в. „Запази“ и „📤 Качи файл“ — класът btn-green, не btn-primary');
  {
    /* .btn-primary няма правило никъде, а .btn (border:none) върху .btn-sm
       оставяше „Запази“ сив текст без фон и рамка (на живо, 21.10.2026). */
    const h = env(GD, db); await open(h);
    const saves = Array.from(mod(h).querySelectorAll('button')).filter(b => b.textContent.trim() === 'Запази');
    ok('3 бутона „Запази“', saves.length === 3, saves.length);
    ok('„Запази“: btn + btn-green, без btn-primary и btn-sm', saves.every(b => b.classList.contains('btn') && b.classList.contains('btn-green') && !b.classList.contains('btn-primary') && !b.classList.contains('btn-sm')), saves.map(b => b.className).join(' | '));
    const ha = env(ADMIN, db); await open(ha);
    const lbl = ha.doc.getElementById('mn-file') && ha.doc.getElementById('mn-file').parentNode;
    ok('„📤 Качи файл“ (admin): label с btn + btn-green, без btn-primary', !!lbl && lbl.tagName === 'LABEL' && lbl.textContent.indexOf('📤 Качи файл') >= 0 && lbl.classList.contains('btn') && lbl.classList.contains('btn-green') && !lbl.classList.contains('btn-primary'), lbl && lbl.className);
  }

  section('4. Повторно качване на същия файл — нищо ново, попълненото непокътнато');
  {
    const h = env(ADMIN, db); await open(h);
    const before = db.movs.length;
    const rep = await h.w.mnImportAoa(AOA, 'Гоце Делчев 16.10.xlsx'); await ticks(6);
    ok('rows_new = 0', rep && rep.inserted === 0 && db.uploads[1] && db.uploads[1].rows_new === 0, rep && rep.inserted);
    ok('вече качени = 17', h.doc.getElementById('mn-rep-already').textContent === '17');
    ok('в базата пак 17 реда', db.movs.length === before && before === 17);
    const r = db.movs.find(x => x.id === fillId);
    ok('причина / служител / код — непроменени', r.reason_id === 5 && r.employee_name === 'Иван Иванов' && r.real_code === '40244');
    ok('контролингът вижда попълнения ред с причината', h.doc.getElementById('mn-row-' + fillId).textContent.indexOf('реална продажба, чака вход от ЛСТ') >= 0);
  }

  section('5. Непознат завод, други видове, липсваща колона');
  {
    const db2 = fakeDb();
    const h = env(ADMIN, db2); await open(h);
    const extra = [
      ['9999', 'Онлайн', '1000', 11111, 'ХЕЛ', '955', 'Недостиг AUTO', 1, 'БР', 5, 4909999999, 1, '14.10.2026', '', '', '', ''],
      ['9999', 'Онлайн', '1000', 11112, 'ХЕЛ', '955', 'Недостиг AUTO', 1, 'БР', 5, 4909999999, 2, '14.10.2026', '', '', '', ''],
      ['5519', 'ТМ Гоце Делчев', '1000', 11113, 'ДРУГО', '101', 'Приемане', 4, 'БР', 5, 4909999998, 1, '14.10.2026', '', '', '', '']
    ];
    const rep = await h.w.mnImportAoa(AOA.concat(extra), 'x.xlsx'); await ticks(6);
    const all = [].concat.apply([], movPosts(db2).map(p => p.body));
    ok('завод 9999 не е записан', all.every(r => r.plant !== '9999') && all.length === 17);
    const unk = h.doc.getElementById('mn-rep-unknown');
    ok('отчетът показва завод 9999 × 2 реда', unk && /завод 9999 × 2 реда/.test(unk.textContent), unk && unk.textContent);
    ok('… в червено', unk && /#b91c1c|rgb\(185, 28, 28\)/.test(unk.getAttribute('style')));
    ok('други видове движение: 101 × 1', /101 × 1/.test((h.doc.getElementById('mn-rep-other') || {}).textContent || ''));
    ok('общо редове 20', h.doc.getElementById('mn-rep-total').textContent === '20');
    ok('rows_total в minus_uploads = 17 (само 955/956 с познат завод)', db2.uploads[0].rows_total === 17);

    const db3 = fakeDb();
    const h3 = env(ADMIN, db3); await open(h3);
    const ci = HEADER.indexOf('Документ за материал');
    const noDoc = AOA.map(r => r.filter((_, i) => i !== ci));
    const r3 = await h3.w.mnImportAoa(noDoc, 'bad.xlsx'); await ticks(4);
    ok('без „Документ за материал“ → отказ', r3 && /Документ за материал/.test(r3.error || ''));
    ok('… червен toast', h3.calls.toast.some(t => /Липсва колона: „Документ за материал"/.test(t)) && h3.doc.getElementById('toast').style.background.indexOf('220, 38, 38') >= 0, h3.calls.toast.join(' | '));
    ok('… нищо не е записано (нито upload, нито движение)', db3.log.filter(x => x.m !== 'GET').length === 0);
  }

  section('6. Обект извън minus_stores');
  {
    const db4 = fakeDb({ movs: db.movs.map(x => Object.assign({}, x, { store_name: 'Шумен' })) });
    const h = env(SHUMEN, db4);
    guard('setupTabsForRole', () => h.w.setupTabsForRole());
    const sb = h.doc.getElementById('rvs-minusi');
    ok('под-бутонът „➖ Минуси“ е видим', sb && sb.style.display !== 'none');
    realClick(h.w, sb); await ticks(6);
    ok('модулът е показан', mod(h).style.display === 'block');
    ok('под-бутонът е активен, главният таб също', sb.classList.contains('active') && h.doc.getElementById('tab-revaluation').classList.contains('active'));
    const off = h.doc.getElementById('mn-off');
    ok('„Модулът още не е включен за вашия обект“', off && off.textContent.indexOf('Модулът още не е включен за вашия обект') >= 0);
    ok('движенията не се теглят', !db4.log.some(x => x.tbl === 'minus_movements'));
    ok('нищо от данните не се показва', !h.doc.getElementById('mn-daily'));
  }
  {
    const h = env({ email: 's@temax.bg', role: 'supply', store_name: 'Централен офис' }, fakeDb());
    h.w.setupTabsForRole();
    ok('supply няма под-бутон „Минуси“', h.doc.getElementById('rvs-minusi').style.display === 'none');
  }

  section('7. Прагът по мерна единица — граничните случаи');
  {
    const mk = (id, mat, t, q, u, d, doc) => ({ id, store_name: 'Гоце Делчев', plant: '7519', material: mat, material_desc: 'X', mvt_type: t, qty: q, uom: u, mat_doc: doc, doc_item: '1', doc_year: 2026, posting_date: d });
    const movs = [
      mk('a1', '70001', '955', 1.01, 'M2', '2026-10-10', 'D1'), mk('a2', '70001', '956', -1, 'M2', '2026-10-11', 'D2'),
      mk('b1', '70002', '955', 1.009, 'M2', '2026-10-10', 'D3'), mk('b2', '70002', '956', -1, 'M2', '2026-10-11', 'D4'),
      mk('c1', '70003', '955', 0.003, 'бр.', '2026-10-10', 'D5'),
      mk('d1', '70004', '955', 0.009, 'лм.', '2026-10-10', 'D6'),
      mk('e1', '70005', '955', 0.01, ' лм ', '2026-10-10', 'D7')
    ];
    const r = new Set(H.boot({ modules: ['minusi.js'], user: ADMIN, data: {} }).w.mnCompute(movs, { 'M2': 0.01, 'ЛМ': 0.01 }).open.map(x => x.material));
    const w0 = H.boot({ modules: ['minusi.js'], user: ADMIN, data: {} }).w;
    const thr = {}; THR.forEach(t => { thr[w0.mnNormUom(t.uom)] = t.min_qty; });
    const res = new Set(w0.mnCompute(movs, thr).open.map(x => x.material));
    ok('остатък точно 0.01 M2 → показва се', res.has('70001'));
    ok('остатък 0.009 M2 → не', !res.has('70002'));
    ok('единица без праг („бр.“) → всеки остатък ≠ 0', res.has('70003'));
    ok('„лм.“ = „ЛМ“: 0.009 → не, 0.01 → да', !res.has('70004') && res.has('70005'));
    ok('(същото с ръчно подаден праг)', r.has('70001') && !r.has('70002'));

    const h = env(GD, fakeDb({ movs: db.movs.map(x => Object.assign({}, x)), thr: [{ uom: 'M2', min_qty: 0 }] })); await open(h);
    ok('при min_qty за M2 = 0 → 48349 (0,003 M2) се показва', dailyRows(h).some(tr => cellTxt(tr)[0] === '48349' && cellTxt(tr)[3] === '0,003'));
  }

  section('8. Нетиране по обект, не по завод; свръхсторно — само на контролинга');
  {
    const w0 = H.boot({ modules: ['minusi.js'], user: ADMIN, data: {} }).w;
    const base = { store_name: 'Гоце Делчев', material_desc: 'S', uom: 'БР', doc_year: 2026 };
    const movs = [
      Object.assign({ id: 's1', plant: '5519', material: '99001', mvt_type: '955', qty: 1, mat_doc: 'X1', doc_item: '1', posting_date: '2026-10-10' }, base),
      Object.assign({ id: 's2', plant: '7519', material: '99001', mvt_type: '956', qty: -1, mat_doc: 'X2', doc_item: '1', posting_date: '2026-10-11' }, base),
      Object.assign({ id: 's3', plant: '7519', material: '99002', mvt_type: '955', qty: 1, mat_doc: 'X3', doc_item: '1', posting_date: '2026-10-10' }, base),
      Object.assign({ id: 's4', plant: '7519', material: '99002', mvt_type: '956', qty: -3, mat_doc: 'X4', doc_item: '1', posting_date: '2026-10-11' }, base)
    ];
    const c = w0.mnCompute(movs, {});
    ok('синтетичен 99001: 955 на 5519, 956 на 7519 → закрит', !c.open.some(x => x.material === '99001') && !c.byMat.some(x => x.material === '99001'));
    ok('99002: 956 над 955 → нищо отворено, в свръхсторно', !c.open.some(x => x.material === '99002') && c.over.length === 1 && c.over[0].material === '99002');

    const dbo = fakeDb({ movs: movs.map(x => Object.assign({}, x)) });
    const hc = env(ADMIN, dbo); await open(hc);
    ok('контролингът вижда „Свръхсторно“ с 99002', !!hc.doc.getElementById('mn-over') && hc.doc.getElementById('mn-over').textContent.indexOf('99002') >= 0);
    const hs = env(GD, dbo); await open(hs);
    ok('обектът НЕ вижда свръхсторно', !hs.doc.getElementById('mn-over') && mod(hs).textContent.indexOf('99002') < 0);
  }

  section('9. Файлът минава през input-а (FileReader + SheetJS стъб), серийна дата');
  {
    const db5 = fakeDb();
    const h = env(ADMIN, db5); await open(h);
    const serial = AOA.map((r, i) => i === 1 ? r.map((c, j) => j === 12 ? 46309 : c) : r); /* 46309 = 14.10.2026 */
    h.w.XLSX = { read: () => ({ SheetNames: ['от САП'], Sheets: { 'от САП': {} } }), utils: { sheet_to_json: () => serial } };
    h.w.FileReader = function () { const self = this; this.readAsArrayBuffer = () => setTimeout(() => self.onload({ target: { result: new ArrayBuffer(1) } }), 0); };
    const inp = h.doc.getElementById('mn-file');
    Object.defineProperty(inp, 'files', { value: [{ name: 'Гоце Делчев 17.10.xlsx' }], configurable: true });
    fire(h.w, inp, 'change'); await ticks(12);
    const all = [].concat.apply([], movPosts(db5).map(p => p.body));
    ok('качени 17 реда през input-а', all.length === 17, all.length);
    ok('сериен номер 46309 → 2026-10-14', all.some(r => r.mat_doc === '4903352250' && r.doc_item === '3' && r.posting_date === '2026-10-14'));
    ok('името на файла е в minus_uploads', db5.uploads[0] && db5.uploads[0].file_name === 'Гоце Делчев 17.10.xlsx');
  }

  section('10. Навигация: под-лентата, зареждане през showModule');
  {
    const h = env(ADMIN, db);
    h.w.setupTabsForRole();
    ok('контролингът вижда под-бутона', h.doc.getElementById('rvs-minusi').style.display !== 'none');
    realClick(h.w, h.doc.getElementById('rvs-minusi')); await ticks(6);
    ok('под-лентата е видима', h.doc.getElementById('rev-subnav').style.display === 'block');
    ok('заредено: Дневен с 3 реда', dailyRows(h).length === 3);
    realClick(h.w, h.doc.getElementById('rvs-schedule')); await ticks(3);
    ok('към графика: Минуси се скрива, бутонът не е активен', mod(h).style.display === 'none' && !h.doc.getElementById('rvs-minusi').classList.contains('active'));
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
