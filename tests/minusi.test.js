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

   Мутационна проверка (20.10.2026) — всеки вариант е пуснат и е паднал
   (M1 и M2 — пуснати наново на 22.10 срещу историята в Дневен):
     M1 FIFO от най-новия (редовете 955 обърнати)
        → падат „40243 от 14.10 → незакрит“, „40243 от 11.10 → закрит 12.10“,
        „52215 / 95498 от … → закрит 12.10“;
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
   История в „Дневен" (22.10.2026, решения на Миглена от 21.10) — всеки
   вариант пуснат и паднал:
     M12 Дневен пак само с незакритите → пада „всичките 11 реда 955“ (+14);
     M13 датата на закриване — от първия 956, докоснал реда → пада само
        синтетичното „закрит от два 956 → закрит 15.10“: във фикстурата
        всеки ред се закрива от ЕДИН 956, затова случаят е добавен нарочно;
     M14 датата — от първия 956 на артикула → падат „95498 от 13.10“ и
        „52215 — двата реда от 13.10 → закрит 14.10“;
     M15 свръхсторното пак само за контролинга → падат трите проверки на
        обекта (99002, заглавието, 956 без 955 като 17279);
     M16 „под прага“ броено като незакрит → падат „48349 → остатък под
        прага“, „незакритите са точно 3“ и бутонът „общо 11 · незакрити 3“;
     M17 „Количество“ показва остатъка, не SAP → пада „95498 от 08.10 → 3“;
     M18 „само незакрити“ не филтрира → падат „точно 3 реда“ и комбинацията.
   Ширината на „Дневен“ с колоната „Състояние“ (22.10.2026; Playwright от
   чата, фикстура, manager): с отделна „Мерна ед.“ таблицата беше 1342 px
   срещу карта 1246 (1280) / 1266 (1366) — „Запази“ навън. Сега единицата е в
   „Количество“, „Състояние“ — th 90px и се пренася, служител / бележка —
   110px: 1280 → 1206 / 1246, „Запази“ дясно 1233 / 1264; 1366 → 1226 / 1266,
   1286 / 1317. Пуснати и паднали:
     M19 колоната „Мерна ед.“ върната → падат 22 проверки (вкл. „няма th
        „Мерна ед.““ и всички по индекс на колоните);
     M20 „Състояние“ пак с nowrap → пада „td „Състояние“ се пренася…“;
     M21 служител пак 120px → пада „… width:110px (22 полета)“.
   Търсене, „Всички обекти“, Excel и печат (секция 11, 22.10.2026) — пуснати:
     M22 търсенето не гледа заметнатия код → падат „по заметнат код „40244““
        и „главни/малки и trim“;
     M23 менюто „Обект“ (с „Всички обекти“) и за обекта → падат проверките
        за manager и sklad;
     M24 mnIsAll() без проверка на роля → пада „mnIsAll() е false дори при
        mnStore = „Всички““. Махнатата проверка в mnSetStore САМА не пада —
        loadMinusi и без нея връща обекта към своя (еквивалентен мутант);
     M25 Excel пренебрегва филтрите → падат „3 реда“ и „следва търсенето“;
     M26 печатът съдържа input → пада „няма input, select и button“;
     M27 търсенето прерисува целия модул → пада „полето НЕ се прерисува“;
     M28 печатът без white-space:normal → пада проверката по т.12;
     M29 печатът пренебрегва филтрите → пада „редовете на текущия изглед“.
   Заглавие „Кол-во“ в печата (22.10.2026, Тенчо: „Количест / во“ в PDF):
     M30 печатът пак с „Количество“ → пада „печат: заглавието … „Кол-во““.
   Етап 2 — повторения и „сторно преди минуса“ (секция 12, 22.10.2026):
     M31 повторението по завод вместо по обект → падат значките 05.10 / 20.10
        и броячите (05.10 е в 5519, другите в 7519), плюс „Действие“ в секция 3;
     M32 < вместо ≤ N → пада „точно 10 дни е повторение“ (77002);
     M33 действието не е задължително → падат „без действие → toast“ (секции
        3 и 12) и броят PATCH;
     M34 значката спрямо следващия минус → падат 13 проверки в секция 12;
     M35 „сторно преди минуса“ с ≤ → пада „17280 (един ден) → без ⚠“ и
        втората таблица (2 реда вместо 1);
     M36 „само непопълнени“ без повторенията → пада „включва r2“;
     M37 картата само при свръхсторно → пада втората таблица за 17279;
     M38 броячът за 30 дни брои и бъдещите → падат „×2 / ×3“ и Excel.
     M39 обвивката на значката пак nowrap → пада „обвивката НЕ е nowrap“.
   Задължителна бележка при причина с requires_note (секция 13, 22.10.2026):
     M40 проверката при запис махната → падат „toast, 0 PATCH“ и следващите;
     M41 „само непопълнени“ без липсващата бележка → пада „включва n3“;
     M42 надписът „попълни номер/дата“ не се показва → падат обект и контролинг;
     M43 loadMinusi не иска requires_note → падат 8. Оцеляваше, докато
        фалшивата база пренебрегваше select= — сега minus_reasons връща само
        поисканите колони, като PostgREST.
   Брояч и „Днес“ (секция 14, 23.10.2026):
     P1 броячът брои и закритите → падат „(3)“ и редът в „Днес“;
     P2 „Днес“ без регионалния обхват → пада „само своя (Шумен)“;
     P3 невключен обект също → пада „Шумен без брояч“;
     P4 showModule не вика брояча → падат „(3)“ и „N = 0“;
     P5 mnRender не обновява брояча → пада „след Запази (2)“.
   Сверката портал ↔ bulletin-notify е в tests/minusi-notify-sync.test.js.
   Секция 3 пише в „Действие“ само ако полето го има (if (act)) — иначе при
   M31/M34 тестът гърмеше там и секция 12 не се стигаше: мутантът падаше от
   TypeError, не от проверка.
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
  'има още количество, липсва код', 'реална продажба, чака вход от ЛСТ'].map((l, i) => ({ id: i + 1, label: l, active: true, sort: i + 1, requires_note: i === 0 }));
const THR = [{ uom: 'M2', min_qty: 0.01 }, { uom: 'ЛМ', min_qty: 0.01 }];

const ADMIN = { email: 'm.pavlova@temax.bg', display_name: 'Миглена', role: 'admin', store_name: 'Централен офис' };
const GD = { email: 'managergdelchev@temax.bg', display_name: 'Управител ГД', role: 'manager', store_name: 'Гоце Делчев' };
const GD_SKLAD = { email: 'sklad.gdelchev@temax.bg', display_name: 'Склад ГД', role: 'sklad', store_name: 'Гоце Делчев' };
const SHUMEN = { email: 'shumen@temax.bg', display_name: 'Управител Шумен', role: 'manager', store_name: 'Шумен' };

function fakeDb(o) {
  o = o || {};
  return {
    settings: o.settings != null ? o.settings : 'Гоце Делчев',
    repeatDays: o.repeatDays,   /* undefined → ключът minus_repeat_days липсва */
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
      if (tbl === 'app_settings') return resp(200, (db.settings == null ? [] : [{ key: 'minus_stores', value: db.settings }]).concat(db.repeatDays === undefined ? [] : [{ key: 'minus_repeat_days', value: db.repeatDays }]));
      if (tbl === 'minus_plants') return resp(200, PLANTS);
      /* Като PostgREST: само колоните от select= — иначе тестът не би видял
         заявка, която забравя колона (requires_note, 22.10.2026). */
      if (tbl === 'minus_reasons') { const cols = ((q.match(/select=([^&]+)/) || [])[1] || '*').split(','); return resp(200, REASONS.map(r => cols[0] === '*' ? r : cols.reduce((o, c) => (c in r ? (o[c] = r[c], o) : o), {}))); }
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
    /* От 22.10.2026 (Миглена, 21.10): „Дневен" показва ВСИЧКИ 955 — история.
       Колони: 0 материал, 1 описание, 2 дата, 3 количество от SAP + мерна
       единица („2,88 M2“), 4 състояние (отделна колона „Мерна ед.“ няма —
       таблицата не се побираше в картата, 22.10). Очакваното е сверено на ръка с FIFO върху фикстурата. */
    const rows = dailyRows(h);
    ok('Дневният изглед: всичките 11 реда 955', rows.length === 11, rows.map(r => cellTxt(r)[0]).join(','));
    const st = {}; rows.forEach(r => { const c = cellTxt(r); st[c[0] + '@' + c[2].slice(0, 5)] = (st[c[0] + '@' + c[2].slice(0, 5)] || []).concat([c]); });
    const one = k => (st[k] || [])[0];
    const STATES = {
      '17273@14.10': 'незакрит', '40243@14.10': 'незакрит', '98275@07.10': 'незакрит',
      '40243@11.10': 'закрит 12.10', '23030@12.10': 'закрит 14.10',
      '52215@11.10': 'закрит 12.10', '95498@08.10': 'закрит 12.10', '95498@13.10': 'закрит 14.10',
      '48349@07.10': 'остатък под прага'
    };
    Object.keys(STATES).forEach(k => ok(k.replace('@', ' от ') + ' → „' + STATES[k] + '“', one(k) && one(k)[4] === STATES[k], one(k) && one(k)[4]));
    ok('52215 — двата реда от 13.10 → „закрит 14.10“', (st['52215@13.10'] || []).length === 2 && st['52215@13.10'].every(c => c[4] === 'закрит 14.10'), JSON.stringify((st['52215@13.10'] || []).map(c => c[4])));
    ok('незакритите са точно 3', rows.filter(r => cellTxt(r)[4].indexOf('незакрит') === 0).length === 3);
    ok('17273: „Количество“ = „1 БР“', one('17273@14.10') && one('17273@14.10')[3] === '1 БР', one('17273@14.10') && one('17273@14.10')[3]);
    ok('98275: „Количество“ = „2,88 M2“ (мерната единица е вътре)', one('98275@07.10') && one('98275@07.10')[3] === '2,88 M2', one('98275@07.10') && one('98275@07.10')[3]);
    ok('„Количество“ е от SAP и при закрит ред (95498 от 08.10 → 3 БР)', one('95498@08.10') && one('95498@08.10')[3] === '3 БР');
    ok('48349 — „0,003 M2“', one('48349@07.10') && one('48349@07.10')[3] === '0,003 M2');
    const ths = Array.from(h.doc.querySelectorAll('#mn-daily thead th')).map(x => x.textContent.trim());
    ok('в #mn-daily няма th „Мерна ед.“; „Състояние“ е веднага след „Количество“', ths.indexOf('Мерна ед.') < 0 && ths.indexOf('Състояние') === ths.indexOf('Количество') + 1, ths.join(' | '));
    const thSt = Array.from(h.doc.querySelectorAll('#mn-daily thead th')).find(x => x.textContent.trim() === 'Състояние');
    ok('th „Състояние“ — width:90px', thSt && thSt.style.width === '90px', thSt && thSt.getAttribute('style'));
    ok('td „Състояние“ се пренася (без nowrap), „Количество“ — nowrap', rows.every(r => r.querySelector('.mn-state').style.whiteSpace !== 'nowrap' && r.querySelector('.mn-qty').style.whiteSpace === 'nowrap'));
    ok('закритите и под прага — сив текст; незакритите — не', rows.every(r => (cellTxt(r)[4].indexOf('незакрит') === 0) === !/148, 163, 184/.test(r.style.color)), rows.map(r => r.style.color).join('|'));
    ok('най-новите отгоре', rows.map(r => cellTxt(r)[2].split('.').reverse().join('')).every((d, i, a) => !i || a[i - 1] >= d));
    ok('бутонът: „Дневен (общо 11 · незакрити 3)“', h.doc.getElementById('mn-v-daily').textContent.indexOf('общо 11 · незакрити 3') >= 0, h.doc.getElementById('mn-v-daily').textContent);
    ok('контролингът не попълва: няма бутон „Запази“', !btn(mod(h), 'Запази'));
    ok('филтър „само непопълнени“ (11)', !!h.doc.getElementById('mn-unfilled') && h.doc.getElementById('mn-unfilled').parentNode.textContent.indexOf('(11)') >= 0);
    const oo = h.doc.getElementById('mn-onlyopen');
    ok('отметка „само незакрити“ — и за контролинга, изключена', !!oo && !oo.checked);
    oo.checked = true; fire(h.w, oo, 'change');
    ok('„само незакрити“ → точно 3 реда', dailyRows(h).length === 3 && dailyRows(h).every(r => cellTxt(r)[4] === 'незакрит'), dailyRows(h).map(r => cellTxt(r)[0]).join(','));
    ok('… отметката остава включена след прерисуването', h.doc.getElementById('mn-onlyopen').checked);
    ok('… „само непопълнени“ брои вече 3', h.doc.getElementById('mn-unfilled').parentNode.textContent.indexOf('(3)') >= 0);
    const uf = h.doc.getElementById('mn-unfilled'); uf.checked = true; fire(h.w, uf, 'change');
    ok('„само незакрити“ И „само непопълнени“ → 3 (нищо не е попълнено)', dailyRows(h).length === 3);
    const ooOff = h.doc.getElementById('mn-onlyopen'); ooOff.checked = false; fire(h.w, ooOff, 'change');
    ok('само „само непопълнени“ → 11', dailyRows(h).length === 11);
    const ufOff = h.doc.getElementById('mn-unfilled'); ufOff.checked = false; fire(h.w, ufOff, 'change');
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
    ok('обратно към Дневен', dailyRows(h).length === 11);
  }

  section('3. Обектът попълва — реален клик „Запази“, PATCH само на шестте полета');
  let fillId;
  {
    const h = env(GD, db); await open(h);
    ok('обектът няма качване', !h.doc.getElementById('mn-file') && !h.doc.getElementById('mn-upload'));
    ok('обектът няма селектор на обект', !h.doc.getElementById('mn-store'));
    const rows = dailyRows(h);
    ok('Дневен на обекта: 11 реда', rows.length === 11);
    noAmountInDom('DOM на обекта без суми', h);
    ok('отметка „само незакрити“ — и за обекта; „само непопълнени“ — не', !!h.doc.getElementById('mn-onlyopen') && !h.doc.getElementById('mn-unfilled'));
    const tr = rows.find(r => cellTxt(r)[0] === '40243' && cellTxt(r)[2] === '14.10.2026');
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
    /* 40243 от 14.10 е повторение (предишен 11.10, 3 дни ≤ 10) — без действие не записва. */
    const act = h.doc.getElementById('mn-action-' + fillId);
    ok('повторение → поле „Действие“ под „Бележка“, в същата клетка', !!act && act.getAttribute('placeholder') === 'Действие срещу повторение' && act.parentNode === h.doc.getElementById('mn-note-' + fillId).parentNode && act.style.width === '110px');
    const nP = db.log.filter(x => x.m === 'PATCH').length;
    realClick(h.w, btn(h.doc.getElementById('mn-row-' + fillId), 'Запази')); await ticks(4);
    ok('повторение без действие → червен toast и нула PATCH', db.log.filter(x => x.m === 'PATCH').length === nP && h.calls.toast[h.calls.toast.length - 1] === 'Повторен минус до 10 дни — попълни действие' && h.doc.getElementById('toast').style.background.indexOf('220, 38, 38') >= 0, h.calls.toast.slice(-1)[0]);
    if (act) act.value = 'ще преетикираме';
    realClick(h.w, btn(h.doc.getElementById('mn-row-' + fillId), 'Запази')); await ticks(4);
    const p = db.log.filter(x => x.m === 'PATCH' && x.tbl === 'minus_movements');
    ok('един PATCH към minus_movements', p.length === 1, p.length);
    if (p[0]) {
      ok('PATCH на точния ред (id=eq.)', p[0].q === 'id=eq.' + fillId, p[0].q);
      ok('повторение: полетата за попълване + action', Object.keys(p[0].body).sort().join(',') === 'action,employee_name,filled_at,filled_by,note,real_code,reason_id', Object.keys(p[0].body).join(','));
      ok('стойностите', p[0].body.action === 'ще преетикираме' && p[0].body.real_code === '40244' && p[0].body.reason_id === 5 && p[0].body.employee_name === 'Иван Иванов' && p[0].body.note === 'КЗ 123 / 13.10' && p[0].body.filled_by === 'Управител ГД');
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
  {
    /* Попълването работи и на ЗАКРИТ ред (история). Отделно копие на базата,
       за да не пипа реда, на който стъпват 3б и 4. */
    const dbc = fakeDb({ movs: db.movs.map(x => Object.assign({}, x)) });
    const h = env(GD, dbc); await open(h);
    const closed = dailyRows(h).find(r => cellTxt(r)[0] === '23030');
    const cid = closed && closed.getAttribute('data-mn-id');
    ok('23030 е закрит ред с жълти полета и „Запази“', closed && cellTxt(closed)[4] === 'закрит 14.10' && !!h.doc.getElementById('mn-reason-' + cid) && !!btn(closed, 'Запази'));
    ok('… жълтите колони остават жълти и при закрит ред', closed && closed.querySelector('#mn-code-' + cid).parentNode.style.background.indexOf('254, 249, 195') >= 0, closed && closed.querySelector('#mn-code-' + cid).parentNode.getAttribute('style'));
    h.doc.getElementById('mn-reason-' + cid).value = '4';
    h.doc.getElementById('mn-emp-' + cid).value = 'Здравка';
    realClick(h.w, btn(closed, 'Запази')); await ticks(4);
    const pc = dbc.log.filter(x => x.m === 'PATCH' && x.tbl === 'minus_movements');
    ok('закрит ред: един PATCH, на точния ред', pc.length === 1 && pc[0].q === 'id=eq.' + cid, pc.map(x => x.q).join(','));
    ok('закрит ред: само полетата за попълване', pc[0] && Object.keys(pc[0].body).sort().join(',') === 'employee_name,filled_at,filled_by,note,real_code,reason_id', pc[0] && Object.keys(pc[0].body).join(','));
    const after = h.doc.getElementById('mn-row-' + cid);
    ok('закритият ред остава в Дневен, с ✅ и „закрит 14.10“', after && !!after.querySelector('.mn-done') && cellTxt(after)[4] === 'закрит 14.10');
  }

  section('3б. „Причина“ — фиксирана ширина 180px, целият текст в title');
  {
    const h = env(GD, db); await open(h);
    const sels = Array.from(h.doc.querySelectorAll('select[id^="mn-reason-"]'));
    ok('менютата „Причина“ са 11 (всички редове 955)', sels.length === 11, sels.length);
    ok('всяко е с width:180px и max-width:180px', sels.every(s => s.style.width === '180px' && s.style.maxWidth === '180px'), sels.map(s => s.getAttribute('style')).join(' | '));
    const ins = Array.from(h.doc.querySelectorAll('input[id^="mn-emp-"], input[id^="mn-note-"]'));
    ok('„Име на служител“ и „Бележка“ — width:110px (22 полета)', ins.length === 22 && ins.every(x => x.style.width === '110px'), ins.map(x => x.style.width).join(','));
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
    ok('11 бутона „Запази“ (и на закритите)', saves.length === 11, saves.length);
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
    await ticks(4);
    const sb = h.doc.getElementById('rvs-minusi');
    /* От 25.10.2026 (пилот) обект извън minus_stores няма под-бутон; пазачът
       вътре остава за пътя без бутона (дълбока връзка, стар линк). */
    ok('под-бутонът „➖ Минуси“ е СКРИТ (пилот, 25.10.2026)', sb && sb.style.display === 'none');
    h.w.showModule('minusi'); await ticks(6);
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
    ok('при min_qty за M2 = 0 → 48349 (0,003 M2) е „незакрит“', dailyRows(h).some(tr => cellTxt(tr)[0] === '48349' && cellTxt(tr)[3] === '0,003 M2' && cellTxt(tr)[4] === 'незакрит'));
    ok('… и бутонът брои 4 незакрити', h.doc.getElementById('mn-v-daily').textContent.indexOf('общо 11 · незакрити 4') >= 0, h.doc.getElementById('mn-v-daily').textContent);
  }
  {
    /* Частично закриване: 955 × 5, 956 × −2 → „незакрит 3 от 5“; 956 на
       две части — датата е от ВТОРИЯ 956 (който го закрива докрай). */
    const w0 = H.boot({ modules: ['minusi.js'], user: ADMIN, data: {} }).w;
    const b = { store_name: 'Гоце Делчев', plant: '7519', material_desc: 'P', uom: 'БР', doc_year: 2026, doc_item: '1' };
    const c = w0.mnCompute([
      Object.assign({ id: 'p1', material: '80001', mvt_type: '955', qty: 5, mat_doc: 'P1', posting_date: '2026-10-10' }, b),
      Object.assign({ id: 'p2', material: '80001', mvt_type: '956', qty: -2, mat_doc: 'P2', posting_date: '2026-10-11' }, b),
      Object.assign({ id: 'q1', material: '80002', mvt_type: '955', qty: 3, mat_doc: 'Q1', posting_date: '2026-10-10' }, b),
      Object.assign({ id: 'q2', material: '80002', mvt_type: '956', qty: -1, mat_doc: 'Q2', posting_date: '2026-10-11' }, b),
      Object.assign({ id: 'q3', material: '80002', mvt_type: '956', qty: -2, mat_doc: 'Q3', posting_date: '2026-10-15' }, b)
    ], {});
    const p = c.all.find(x => x.id === 'p1'), q = c.all.find(x => x.id === 'q1');
    ok('частично закрит → „незакрит 3 от 5“', p && w0.mnStateText(p) === 'незакрит 3 от 5', p && w0.mnStateText(p));
    ok('закрит от два 956 → „закрит 15.10“ (вторият)', q && w0.mnStateText(q) === 'закрит 15.10', q && w0.mnStateText(q));
  }

  section('8. Нетиране по обект, не по завод; свръхсторно — и на обекта');
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
    /* Миглена, 21.10.2026: свръхсторното е грешка на магазина — вижда го и обектът. */
    const ov = hs.doc.getElementById('mn-over');
    ok('обектът (manager) вижда „Свръхсторно“ с 99002', !!ov && ov.textContent.indexOf('99002') >= 0);
    ok('заглавието: „⚠ Свръхсторно — 956 над 955“, без „вижда само контролингът“', !!ov && ov.querySelector('b').textContent.trim() === '⚠ Свръхсторно — 956 над 955' && ov.textContent.indexOf('само контролингът') < 0, ov && ov.querySelector('b').textContent);
    const r99 = dailyRows(hs).find(r => cellTxt(r)[0] === '99002');
    ok('955 на свръхсторния артикул в Дневен — „закрит 11.10“', r99 && cellTxt(r99)[4] === 'закрит 11.10', r99 && cellTxt(r99)[4]);
    const only956 = [Object.assign({ id: 'o1', plant: '7519', material: '17279', mvt_type: '956', qty: -1, mat_doc: 'Y1', doc_item: '1', posting_date: '2026-10-20' }, base)];
    const hs2 = env(GD, fakeDb({ movs: only956 })); await open(hs2);
    ok('956 без 955 (като 17279) → обектът вижда картата', !!hs2.doc.getElementById('mn-over') && hs2.doc.getElementById('mn-over').textContent.indexOf('17279') >= 0);
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
    ok('заредено: Дневен с 11 реда', dailyRows(h).length === 11);
    realClick(h.w, h.doc.getElementById('rvs-schedule')); await ticks(3);
    ok('към графика: Минуси се скрива, бутонът не е активен', mod(h).style.display === 'none' && !h.doc.getElementById('rvs-minusi').classList.contains('active'));
  }

  section('11. Търсене по код, „Всички обекти“, Excel и печат (22.10.2026)');
  {
    /* Копие на базата след секции 1–4: 40243 от 14.10 е попълнен с
       real_code '40244'. Добавяме заметнат код с букви (главни/малки) и втори
       обект (Шумен) — същите движения с други документи. */
    const base = db.movs.map(x => Object.assign({}, x));
    const r17273 = base.find(x => x.material === '17273' && x.mvt_type === '955');
    r17273.real_code = 'Ab-77';
    const shumen = base.map(x => Object.assign({}, x, { id: 'sh-' + x.id, store_name: 'Шумен', plant: '5514', mat_doc: 'SH' + x.mat_doc, real_code: null, reason_id: null }));
    const dbs = fakeDb({ movs: base.concat(shumen), settings: 'Гоце Делчев, Шумен' });
    const today = H.boot({ modules: ['minusi.js'], user: ADMIN, data: {} }).w;
    const TODAY = today.fmtDate(today.today());
    const searchBox = h => h.doc.getElementById('mn-search');
    const type = (h, v) => { const el = searchBox(h); el.value = v; fire(h.w, el, 'input'); };

    /* ── търсене, обект ── */
    const h = env(GD, dbs); await open(h);
    const box = searchBox(h);
    ok('поле „🔍 Код“ — и за обекта', !!box && box.getAttribute('placeholder') === '🔍 Код');
    type(h, '40243');
    let rs = dailyRows(h).map(cellTxt);
    ok('търсене по материал „40243“ → двата реда 40243', rs.length === 2 && rs.every(c => c[0] === '40243'), rs.map(c => c[0]).join(','));
    ok('полето НЕ се прерисува при писане (същият елемент — не губи фокуса)', searchBox(h) === box);
    ok('броячите в бутоните остават общите', h.doc.getElementById('mn-v-daily').textContent.indexOf('общо 11 · незакрити 3') >= 0, h.doc.getElementById('mn-v-daily').textContent);
    type(h, '40244');
    rs = dailyRows(h).map(cellTxt);
    ok('търсене по заметнат код „40244“ → редът 40243 от 14.10', rs.length === 1 && rs[0][0] === '40243' && rs[0][2] === '14.10.2026', rs.map(c => c[0] + '@' + c[2]).join(','));
    type(h, '  aB-7 ');
    rs = dailyRows(h).map(cellTxt);
    ok('заметнат код без значение главни/малки и с trim („  aB-7 “ → 17273)', rs.length === 1 && rs[0][0] === '17273', rs.map(c => c[0]).join(','));
    type(h, '40243');
    const oo = h.doc.getElementById('mn-onlyopen'); oo.checked = true; fire(h.w, oo, 'change');
    rs = dailyRows(h).map(cellTxt);
    ok('търсене И „само незакрити“ → 1 ред (40243 от 14.10)', rs.length === 1 && rs[0][2] === '14.10.2026', rs.map(c => c[2]).join(','));
    ok('… търсенето се пази при прерисуване от отметката', searchBox(h).value === '40243');
    type(h, 'няма-такъв');
    ok('няма съвпадение → „Няма редове за „…““', !!h.doc.getElementById('mn-empty') && h.doc.getElementById('mn-empty').textContent.indexOf('няма-такъв') >= 0);
    type(h, '');
    realClick(h.w, h.doc.getElementById('mn-v-bymat'));
    type(h, '982');
    const bm = Array.from(h.doc.querySelectorAll('#mn-bymat tbody tr')).map(cellTxt);
    ok('„Незакрити по артикул“: търсене „982“ → 98275', bm.length === 1 && bm[0][0] === '98275', bm.map(c => c[0]).join(','));
    type(h, '40244');
    ok('„Незакрити по артикул“ НЕ търси по заметнат код („40244“ → нищо)', !h.doc.querySelector('#mn-bymat tbody tr'));

    /* ── обект: няма „Всички обекти“ ── */
    for (const u of [GD, GD_SKLAD]) {
      const hs = env(u, dbs); await open(hs);
      ok(u.role + ': няма меню „Обект“ и опция „Всички обекти“', !hs.doc.getElementById('mn-store') && mod(hs).innerHTML.indexOf('Всички обекти') < 0 && mod(hs).innerHTML.indexOf('__all__') < 0);
      const n0 = dbs.log.length;
      hs.w.mnSetStore('__all__'); await ticks(6);
      ok(u.role + ': mnSetStore(„Всички“) отвън не тегли чужди обекти', !dbs.log.slice(n0).some(x => x.tbl === 'minus_movements' && !/store_name=eq\./.test(x.q)) && dailyRows(hs).every(r => !r.querySelector('.mn-store')));
      /* Пряко, без loadMinusi (който и без това връща обекта към своя):
         mnIsAll() е по роля, не само по стойността на mnStore. */
      hs.w.mnStore = '__all__'; hs.w.mnStoresOn = ['__all__'];
      ok(u.role + ': mnIsAll() е false дори при mnStore = „Всички“', hs.w.mnIsAll() === false);
      hs.w.mnStore = u.store_name; hs.w.mnStoresOn = ['Гоце Делчев', 'Шумен'];
    }

    /* ── контролинг: „Всички обекти“ ── */
    const ha = env(ADMIN, dbs); await open(ha);
    const sel = ha.doc.getElementById('mn-store');
    ok('контролинг: „Всички обекти“ е първата опция', sel && sel.options[0].value === '__all__' && sel.options[0].textContent === 'Всички обекти');
    const n1 = dbs.log.length;
    sel.value = '__all__'; fire(ha.w, sel, 'change'); await ticks(8);
    ok('„Всички обекти“ тегли движенията без филтър по обект', dbs.log.slice(n1).some(x => x.tbl === 'minus_movements' && !/store_name=eq\./.test(x.q)));
    rs = dailyRows(ha).map(cellTxt);
    const ths = Array.from(ha.doc.querySelectorAll('#mn-daily thead th')).map(x => x.textContent.trim());
    ok('Дневен: първа колона „Обект“, 22 реда от два обекта', ths[0] === 'Обект' && rs.length === 22 && rs.some(c => c[0] === 'Гоце Делчев') && rs.some(c => c[0] === 'Шумен'), ths[0] + ' / ' + rs.length);
    ok('… бутонът: „общо 22 · незакрити 6“', ha.doc.getElementById('mn-v-daily').textContent.indexOf('общо 22 · незакрити 6') >= 0, ha.doc.getElementById('mn-v-daily').textContent);
    type(ha, '17273');
    rs = dailyRows(ha).map(cellTxt);
    ok('„Всички“ + търсене „17273“ → по един ред от всеки обект', rs.length === 2 && rs.map(c => c[0]).sort().join(',') === 'Гоце Делчев,Шумен', rs.map(c => c[0]).join(','));
    type(ha, '');
    realClick(ha.w, ha.doc.getElementById('mn-v-bymat'));
    const bmA = Array.from(ha.doc.querySelectorAll('#mn-bymat tbody tr')).map(cellTxt);
    ok('по артикул при „Всички“: колона „Обект“, 6 реда', ha.doc.querySelector('#mn-bymat thead th').textContent === 'Обект' && bmA.length === 6, bmA.length);

    /* ── Excel ── */
    const xl = w => { const cap = { aoa: null, name: null, sheet: null }; w.XLSX = { utils: { book_new: () => ({}), aoa_to_sheet: a => { cap.aoa = a; return {}; }, book_append_sheet: (wb, ws, n) => { cap.sheet = n; } }, writeFile: (wb, n) => { cap.name = n; } }; return cap; };
    const he = env(GD, dbs); await open(he);
    let cap = xl(he.w);
    const ooE = he.doc.getElementById('mn-onlyopen'); ooE.checked = true; fire(he.w, ooE, 'change');
    realClick(he.w, he.doc.getElementById('mn-excel'));
    ok('Excel (Дневен, само незакрити): заглавията', cap.aoa && cap.aoa[0].join('|') === 'Материал|Описание|Дата|Количество|Мерна ед.|Състояние|Заметнат код|Причина|Име на служител|Бележка|Предишен минус|Брой за 30 дни|Действие|КЗ|Незаприходена?', cap.aoa && cap.aoa[0].join('|'));
    ok('… 3 реда (филтърът е приложен)', cap.aoa && cap.aoa.length === 4, cap.aoa && cap.aoa.length);
    const r98 = cap.aoa && cap.aoa.find(r => r[0] === '98275');
    ok('… количеството е число, мерната единица — отделна колона', r98 && r98[3] === 2.88 && r98[4] === 'M2' && r98[2] === '07.10.2026', JSON.stringify(r98));
    const r40 = cap.aoa && cap.aoa.find(r => r[0] === '40243');
    ok('… заметнат код и причината като текст', r40 && r40[6] === '40244' && r40[7] === 'реална продажба, чака вход от ЛСТ' && r40[8] === 'Иван Иванов', JSON.stringify(r40));
    ok('… без колона и стойност за сума', cap.aoa && !cap.aoa[0].some(x => /сума|amount/i.test(x)) && !/(^|[^\d.])(3\.7|13\.97|-1\.96)([^\d]|$)/.test(JSON.stringify(cap.aoa)));
    ok('… име: Минуси_Гоце Делчев_Дневен_' + TODAY + '.xlsx', cap.name === 'Минуси_Гоце Делчев_Дневен_' + TODAY + '.xlsx', cap.name);
    type(he, '40243');
    cap = xl(he.w);
    realClick(he.w, he.doc.getElementById('mn-excel'));
    ok('Excel следва и търсенето („40243“ + само незакрити → 1 ред)', cap.aoa && cap.aoa.length === 2 && cap.aoa[1][0] === '40243', cap.aoa && cap.aoa.length);
    type(he, '');
    realClick(he.w, he.doc.getElementById('mn-v-bymat'));
    cap = xl(he.w);
    realClick(he.w, he.doc.getElementById('mn-excel'));
    ok('Excel (по артикул): заглавията и 3 реда', cap.aoa && cap.aoa[0].join('|') === 'Материал|Описание|955|956|Остатък|Мерна ед.' && cap.aoa.length === 4, cap.aoa && cap.aoa[0].join('|'));
    ok('… име: Минуси_Гоце Делчев_Незакрити_' + TODAY + '.xlsx', cap.name === 'Минуси_Гоце Делчев_Незакрити_' + TODAY + '.xlsx', cap.name);
    cap = xl(ha.w);
    realClick(ha.w, ha.doc.getElementById('mn-excel'));
    ok('Excel при „Всички обекти“ (по артикул): „Обект“ първа, 6 реда, име „Минуси_Всички_Незакрити_…“', cap.aoa && cap.aoa[0][0] === 'Обект' && cap.aoa.length === 7 && cap.name === 'Минуси_Всички_Незакрити_' + TODAY + '.xlsx', cap.name);

    /* ── печат ── */
    const hp = env(GD, dbs); await open(hp);
    const ooP = hp.doc.getElementById('mn-onlyopen'); ooP.checked = true; fire(hp.w, ooP, 'change');
    type(hp, '40243');
    realClick(hp.w, hp.doc.getElementById('mn-print'));
    const pw = hp.doc.getElementById('mn-print-wrap');
    ok('печат: #mod-print е показан', hp.doc.getElementById('mod-print').style.display === 'block' && !!pw);
    ok('печат: заглавие „Минуси — Гоце Делчев — Дневен — ' + TODAY + '“', pw && hp.doc.getElementById('mn-print-title').textContent === 'Минуси — Гоце Делчев — Дневен — ' + TODAY, pw && hp.doc.getElementById('mn-print-title').textContent);
    ok('печат: редът с филтрите и търсенето', pw && /само незакрити/.test(hp.doc.getElementById('mn-print-filters').textContent) && /търсене „40243“/.test(hp.doc.getElementById('mn-print-filters').textContent), pw && hp.doc.getElementById('mn-print-filters').textContent);
    const prow = pw ? Array.from(pw.querySelectorAll('table.mn-ptbl tr')).slice(1).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())) : [];
    ok('печат: редовете на текущия изглед (1 ред, 40243 от 14.10, причината като текст)', prow.length === 1 && prow[0][0] === '40243' && prow[0][2] === '14.10.2026' && prow[0][3] === '1 БР' && prow[0][6] === 'реална продажба, чака вход от ЛСТ', JSON.stringify(prow));
    /* 22.10.2026: в 16 mm „Количество“ се пречупваше по средата на думата
       (Chrome → PDF) — в печата е „Кол-во“; екранът и Excel са непроменени. */
    const pth = pw ? Array.from(pw.querySelectorAll('table.mn-ptbl th')).map(x => x.textContent.trim()) : [];
    ok('печат: заглавието на колоната е „Кол-во“, не „Количество“', pth[3] === 'Кол-во' && pth.indexOf('Количество') < 0, pth.join(' | '));
    ok('екран: заглавието си остава „Количество“', Array.from(hp.doc.querySelectorAll('#mn-daily thead th')).some(x => x.textContent.trim() === 'Количество'));
    ok('печат: в съдържанието няма input, select и button', pw && pw.querySelectorAll('input, select, button').length === 0);
    ok('печат: бутоните „Принтирай“ / „Назад“ са само в лентата .no-print', Array.from(hp.doc.querySelectorAll('#mod-print button')).every(b => !!b.closest('.no-print')));
    const css = hp.doc.querySelector('#mod-print style').textContent;
    ok('печат: т.12 — th white-space:normal, border-box, рамка на последния ред', /\.mn-ptbl th,\.mn-ptbl td\{[^}]*box-sizing:border-box[^}]*white-space:normal/.test(css) && /\.mn-ptbl tr:last-child td\{border-bottom:1px solid #333;\}/.test(css));
    ok('печат: колоните се събират в 190 mm', Array.from(pw.querySelectorAll('col')).reduce((a, c) => a + parseFloat(c.style.width), 0) === 190);
    realClick(hp.w, hp.doc.getElementById('mod-print').querySelector('button[onclick*="minusi"]')); await ticks(6);
    type(hp, '');
    const ooP2 = hp.doc.getElementById('mn-onlyopen'); ooP2.checked = false; fire(hp.w, ooP2, 'change');
    realClick(hp.w, hp.doc.getElementById('mn-print'));
    const grays = Array.from(hp.doc.querySelectorAll('#mn-print-wrap table.mn-ptbl tr')).slice(1);
    ok('печат без филтри: 11 реда, закритите и под прага — сиви (8)', grays.length === 11 && grays.filter(tr => tr.classList.contains('mn-p-gray')).length === 8, grays.length + ' / ' + grays.filter(tr => tr.classList.contains('mn-p-gray')).length);
    ok('печат без суми', !/(^|[^\d,.])(3[.,]7|13[.,]97|1[.,]96)([^\d]|$)/.test(hp.doc.getElementById('mn-print-wrap').textContent));
    realClick(ha.w, ha.doc.getElementById('mn-print'));
    ok('печат при „Всички обекти“: заглавие „… Всички обекти — Незакрити по артикул …“, колона „Обект“', ha.doc.getElementById('mn-print-title').textContent === 'Минуси — Всички обекти — Незакрити по артикул — ' + TODAY && ha.doc.querySelector('#mn-print-wrap th').textContent === 'Обект');
  }

  section('12. Повторения, давност, „Действие“, „сторно преди минуса“ (етап 2, 22.10.2026)');
  {
    /* Синтетичен обект + материал 77001: 955 на 01.10, 05.10, 20.10, 30.11 —
       05.10 е в завод 5519, останалите в 7519 (повторението е по ОБЕКТ).
       По определението:
         01.10 — без предишен; 30 дни [02.09–01.10] → 1;
         05.10 — предишен 01.10 (4 дни, червено); [06.09–05.10] → 2 (×2);
         20.10 — предишен 05.10 (15 дни, оранжево); [21.09–20.10] → 3 (×3);
         30.11 — предишен 20.10 (41 дни, жълто); [01.11–30.11] → 1.
       77002: 10.10 и 20.10 — точно 10 дни. */
    const b = { store_name: 'Гоце Делчев', material_desc: 'ТЕСТ ПОВТОРЕНИЕ', uom: 'БР', doc_year: 2026, doc_item: '1', mvt_type: '955', qty: 1 };
    const REP = [
      Object.assign({ id: 'r1', plant: '7519', material: '77001', mat_doc: 'R1', posting_date: '2026-10-01' }, b),
      Object.assign({ id: 'r2', plant: '5519', material: '77001', mat_doc: 'R2', posting_date: '2026-10-05' }, b),
      Object.assign({ id: 'r3', plant: '7519', material: '77001', mat_doc: 'R3', posting_date: '2026-10-20' }, b),
      Object.assign({ id: 'r4', plant: '7519', material: '77001', mat_doc: 'R4', posting_date: '2026-11-30' }, b),
      Object.assign({ id: 'e1', plant: '7519', material: '77002', mat_doc: 'E1', posting_date: '2026-10-10' }, b),
      Object.assign({ id: 'e2', plant: '7519', material: '77002', mat_doc: 'E2', posting_date: '2026-10-20' }, b)
    ];
    const copy = a => a.map(x => Object.assign({}, x));
    const rowOf = (h, id) => h.doc.getElementById('mn-row-' + id);
    const badge = (h, id) => { const tr = rowOf(h, id); return tr && tr.querySelector('.mn-prev'); };
    const cnt = (h, id) => { const tr = rowOf(h, id); const c = tr && tr.querySelector('.mn-cnt30'); return c ? c.textContent : null; };

    const h = env(GD, fakeDb({ movs: copy(REP) })); await open(h);
    ok('01.10 — без значка', rowOf(h, 'r1') && !rowOf(h, 'r1').querySelector('.mn-badges'));
    ok('05.10 — „↻ предишен 01.10“, червена', badge(h, 'r2') && badge(h, 'r2').textContent === '↻ предишен 01.10' && badge(h, 'r2').classList.contains('mn-age-red'), badge(h, 'r2') && badge(h, 'r2').className);
    ok('20.10 — „↻ предишен 05.10“, оранжева (15 дни)', badge(h, 'r3') && badge(h, 'r3').textContent === '↻ предишен 05.10' && badge(h, 'r3').classList.contains('mn-age-orange'), badge(h, 'r3') && badge(h, 'r3').className);
    ok('30.11 — „↻ предишен 20.10“, жълта (41 дни)', badge(h, 'r4') && badge(h, 'r4').textContent === '↻ предишен 20.10' && badge(h, 'r4').classList.contains('mn-age-yellow'), badge(h, 'r4') && badge(h, 'r4').className);
    ok('броячи: 05.10 „×2 за 30 дни“, 20.10 „×3 за 30 дни“, 01.10 и 30.11 — без', cnt(h, 'r2') === '×2 за 30 дни' && cnt(h, 'r3') === '×3 за 30 дни' && cnt(h, 'r1') === null && cnt(h, 'r4') === null, [cnt(h, 'r1'), cnt(h, 'r2'), cnt(h, 'r3'), cnt(h, 'r4')].join(' / '));
    ok('значката е в клетката с описанието', badge(h, 'r2').closest('td').textContent.indexOf('ТЕСТ ПОВТОРЕНИЕ') === 0);
    /* Две части, всяка nowrap, с интервал между тях — броячът може да мине
       на втори ред, без да разширява „Описание“. */
    const bw = rowOf(h, 'r3').querySelector('.mn-badges');
    const p3 = bw && bw.querySelector('.mn-prev'), c3 = bw && bw.querySelector('.mn-cnt30');
    ok('значката: „↻ предишен“ и „×N“ са два отделни елемента, всеки с nowrap', !!p3 && !!c3 && p3 !== c3 && p3.style.whiteSpace === 'nowrap' && c3.style.whiteSpace === 'nowrap', p3 && p3.getAttribute('style'));
    ok('… обвивката НЕ е nowrap (броячът може да пренесе)', bw && bw.style.whiteSpace !== 'nowrap', bw && bw.getAttribute('style'));
    ok('… между двете части има обикновен интервал', !!p3 && !!p3.nextSibling && p3.nextSibling.nodeType === 3 && p3.nextSibling.textContent === ' ' && p3.nextSibling.nextSibling === c3, p3 && p3.nextSibling && JSON.stringify(p3.nextSibling.textContent));
    ok('броят th в #mn-daily е непроменен (10)', h.doc.querySelectorAll('#mn-daily thead th').length === 10, h.doc.querySelectorAll('#mn-daily thead th').length);
    const hasAct = (hh, id) => !!hh.doc.getElementById('mn-action-' + id);
    ok('N = 10 (ключът липсва): „Действие“ на 05.10 (4 дни) и на 77002 от 20.10 (точно 10 дни); не на 01.10, 20.10 (15), 30.11', hasAct(h, 'r2') && hasAct(h, 'e2') && !hasAct(h, 'r1') && !hasAct(h, 'r3') && !hasAct(h, 'r4') && !hasAct(h, 'e1'));
    const h20 = env(GD, fakeDb({ movs: copy(REP), repeatDays: '20' })); await open(h20);
    ok('minus_repeat_days = „20“ → и 20.10 е повторение; 30.11 (41) — не', hasAct(h20, 'r3') && hasAct(h20, 'r2') && !hasAct(h20, 'r4'));
    const hBad = env(GD, fakeDb({ movs: copy(REP), repeatDays: 'abc' })); await open(hBad);
    ok('невалидна стойност („abc“) → 10', hasAct(hBad, 'r2') && !hasAct(hBad, 'r3') && hBad.w.mnRepeatDays === 10);

    /* Запис: ред без повторение → без action; повторение без действие → toast, с действие → action. */
    const dbS = fakeDb({ movs: copy(REP) });
    const hs = env(GD, dbS); await open(hs);
    const fillRow = (id, act) => {
      hs.doc.getElementById('mn-reason-' + id).value = '2';
      hs.doc.getElementById('mn-emp-' + id).value = 'Здравка';
      if (act != null) hs.doc.getElementById('mn-action-' + id).value = act;
    };
    fillRow('r1');
    realClick(hs.w, btn(rowOf(hs, 'r1'), 'Запази')); await ticks(4);
    let pp = dbS.log.filter(x => x.m === 'PATCH');
    ok('ред без повторение → PATCH без action', pp.length === 1 && pp[0].q === 'id=eq.r1' && !('action' in pp[0].body) && Object.keys(pp[0].body).length === 6, pp[0] && Object.keys(pp[0].body).join(','));
    fillRow('r2', '');
    realClick(hs.w, btn(rowOf(hs, 'r2'), 'Запази')); await ticks(4);
    ok('повторение без действие (05.10) → toast, нула нови PATCH', dbS.log.filter(x => x.m === 'PATCH').length === 1 && hs.calls.toast.slice(-1)[0] === 'Повторен минус до 10 дни — попълни действие');
    hs.doc.getElementById('mn-action-r2').value = '  грешен етикет — ще преетикираме ';
    realClick(hs.w, btn(rowOf(hs, 'r2'), 'Запази')); await ticks(4);
    pp = dbS.log.filter(x => x.m === 'PATCH');
    ok('с действие → PATCH с action (trim)', pp.length === 2 && pp[1].q === 'id=eq.r2' && pp[1].body.action === 'грешен етикет — ще преетикираме', pp[1] && JSON.stringify(pp[1].body.action));

    /* „само непопълнени“: 05.10 с причина, но без действие — вътре; 01.10 с
       причина (не е повторение) — вън. */
    const unf = copy(REP);
    unf.find(x => x.id === 'r1').reason_id = 2;
    unf.find(x => x.id === 'r2').reason_id = 2;
    const hc = env(ADMIN, fakeDb({ movs: unf })); await open(hc);
    const u = hc.doc.getElementById('mn-unfilled'); u.checked = true; fire(hc.w, u, 'change');
    const ids = Array.from(hc.doc.querySelectorAll('#mn-daily tbody tr')).map(tr => tr.getAttribute('data-mn-id')).sort();
    ok('„само непопълнени“ включва повторение с причина без действие (r2), без r1', ids.indexOf('r2') >= 0 && ids.indexOf('r1') < 0 && ids.length === 5, ids.join(','));
    const withAct = copy(unf); withAct.find(x => x.id === 'r2').action = 'ще преетикираме';
    const hc2 = env(ADMIN, fakeDb({ movs: withAct })); await open(hc2);
    ok('контролингът вижда действието като текст под бележката', rowOf(hc2, 'r2') && rowOf(hc2, 'r2').querySelector('.mn-action-txt') && rowOf(hc2, 'r2').querySelector('.mn-action-txt').textContent === 'Действие: ще преетикираме');
    const u2 = hc2.doc.getElementById('mn-unfilled'); u2.checked = true; fire(hc2.w, u2, 'change');
    ok('… и с действие r2 вече не е „непопълнен“', !rowOf(hc2, 'r2'));

    /* Excel и печат за синтетичните. */
    const cap = { aoa: null }; hc2.w.XLSX = { utils: { book_new: () => ({}), aoa_to_sheet: a => { cap.aoa = a; return {}; }, book_append_sheet: () => {} }, writeFile: () => {} };
    const u3 = hc2.doc.getElementById('mn-unfilled'); u3.checked = false; fire(hc2.w, u3, 'change');
    realClick(hc2.w, hc2.doc.getElementById('mn-excel'));
    const xr = id => cap.aoa && cap.aoa.find(r => r[0] === '77001' && r[2] === ({ r1: '01.10.2026', r2: '05.10.2026', r3: '20.10.2026', r4: '30.11.2026' })[id]);
    /* След „Действие“ идват „КЗ“ (етап 4а) и „Незаприходена?“ (етап 4б,
       27.10.2026) — проверките са спрямо мястото на „Предишен минус“. */
    const ip = cap.aoa ? cap.aoa[0].indexOf('Предишен минус') : -1;
    ok('Excel: „Предишен минус“, „Брой за 30 дни“, „Действие“, „КЗ“, „Незаприходена?“ накрая', cap.aoa && ip >= 0 && cap.aoa[0].slice(ip).join('|') === 'Предишен минус|Брой за 30 дни|Действие|КЗ|Незаприходена?');
    ok('Excel 05.10: 01.10.2026 | 2 | действието', xr('r2') && xr('r2').slice(ip, ip + 3).join('|') === '01.10.2026|2|ще преетикираме', xr('r2') && JSON.stringify(xr('r2').slice(ip, ip + 3)));
    ok('Excel 01.10: празно | 1 | празно', xr('r1') && xr('r1')[ip] === '' && xr('r1')[ip + 1] === 1 && xr('r1')[ip + 2] === '', xr('r1') && JSON.stringify(xr('r1').slice(ip, ip + 3)));
    ok('Excel без суми', !/(^|[^\d.])(3\.7|13\.97|-1\.96)([^\d]|$)/.test(JSON.stringify(cap.aoa)));
    realClick(hc2.w, hc2.doc.getElementById('mn-print'));
    const pw = hc2.doc.getElementById('mn-print-wrap');
    const pths = Array.from(pw.querySelectorAll('table.mn-ptbl th')).map(x => x.textContent.trim());
    ok('печат: без нови колони (9 th, 190 mm)', pths.length === 9 && Array.from(pw.querySelectorAll('col')).reduce((a, c) => a + parseFloat(c.style.width), 0) === 190, pths.join('|'));
    const prow2 = Array.from(pw.querySelectorAll('table.mn-ptbl tr')).slice(1).find(tr => tr.textContent.indexOf('05.10.2026') >= 0);
    const pc = prow2 ? Array.from(prow2.querySelectorAll('td')) : [];
    ok('печат: „↻ 01.10 ×2“ под описанието', pc[1] && pc[1].querySelector('.mn-p-prev') && pc[1].querySelector('.mn-p-prev').textContent === '↻ 01.10 ×2', pc[1] && pc[1].textContent);
    ok('печат: „Действие: …“ в клетката „Бележка“', pc[8] && pc[8].textContent.indexOf('Действие: ще преетикираме') >= 0, pc[8] && pc[8].textContent);

    /* „Сторно преди минуса“ — реалният 17279 (Гоце Делчев, 5519) + същата дата (не е грешка). */
    const S = { store_name: 'Гоце Делчев', plant: '5519', uom: 'БР', doc_year: 2026 };
    const EARLY = [
      Object.assign({ id: 'k956', material: '17279', material_desc: 'ПЯНА WHITETEQ МОНТАЖНА РЪЧНА 750МЛ/12', mvt_type: '956', qty: -1, mat_doc: '4903360010', doc_item: '6', posting_date: '2026-10-20' }, S),
      Object.assign({ id: 'k955', material: '17279', material_desc: 'ПЯНА WHITETEQ МОНТАЖНА РЪЧНА 750МЛ/12', mvt_type: '955', qty: 1, mat_doc: '4903361772', doc_item: '1', posting_date: '2026-10-21' }, S),
      Object.assign({ id: 's956', material: '17280', material_desc: 'СЪЩИЯ ДЕН', mvt_type: '956', qty: -1, mat_doc: 'SD6', doc_item: '1', posting_date: '2026-10-21' }, S),
      Object.assign({ id: 's955', material: '17280', material_desc: 'СЪЩИЯ ДЕН', mvt_type: '955', qty: 1, mat_doc: 'SD5', doc_item: '1', posting_date: '2026-10-21' }, S)
    ];
    for (const usr of [GD, ADMIN]) {
      const he = env(usr, fakeDb({ movs: copy(EARLY) })); await open(he);
      const stCell = rowOf(he, 'k955') && rowOf(he, 'k955').querySelector('.mn-state');
      ok(usr.role + ': 17279 → „закрит 20.10 ⚠ сторно преди минуса“, червено', stCell && stCell.textContent === 'закрит 20.10 ⚠ сторно преди минуса' && /185, 28, 28/.test(stCell.style.color), stCell && stCell.textContent);
      ok(usr.role + ': 17280 (956 и 955 в един ден) → „закрит 21.10“, без ⚠', rowOf(he, 's955') && rowOf(he, 's955').querySelector('.mn-state').textContent === 'закрит 21.10');
      const er = Array.from(he.doc.querySelectorAll('#mn-early tbody tr')).map(cellTxt);
      ok(usr.role + ': картата — „⚠ Сторно преди минуса“, 1 ред: 17279 · 21.10.2026 · 20.10.2026 · 4903360010', er.length === 1 && er[0].join('|') === '17279|ПЯНА WHITETEQ МОНТАЖНА РЪЧНА 750МЛ/12|21.10.2026|20.10.2026|4903360010', JSON.stringify(er));
      ok(usr.role + ': без свръхсторно — няма таблицата „956 над 955“, картата е само за сторното', !!he.doc.getElementById('mn-over') && he.doc.getElementById('mn-over').textContent.indexOf('956 над 955') < 0);
      ok(usr.role + ': редът със сторно преди минуса остава попълваем само за обекта', usr === GD ? !!he.doc.getElementById('mn-reason-k955') : !he.doc.getElementById('mn-reason-k955'));
    }
    const hep = env(GD, fakeDb({ movs: copy(EARLY) })); await open(hep);
    realClick(hep.w, hep.doc.getElementById('mn-print'));
    ok('печат: „⚠ сторно преди минуса“ в клетката „Състояние“', Array.from(hep.doc.querySelectorAll('#mn-print-wrap td')).some(td => td.textContent === 'закрит 20.10 ⚠ сторно преди минуса'));
  }

  section('13. Задължителна бележка при „клиентска поръчка (номер/дата)“ (22.10.2026)');
  {
    /* Четири отделни материала (без повторения): n1, n2 — непопълнени;
       n3 — записан с причина 1 и празна бележка (като 98275 и 32033 в
       базата на 22.10); n4 — причина 1 с бележка. */
    const b = { store_name: 'Гоце Делчев', plant: '5519', material_desc: 'ТЕСТ БЕЛЕЖКА', uom: 'БР', doc_year: 2026, doc_item: '1', mvt_type: '955', qty: 1, posting_date: '2026-10-15' };
    const NOTE = [
      Object.assign({ id: 'n1', material: '81001', mat_doc: 'N1' }, b),
      Object.assign({ id: 'n2', material: '81002', mat_doc: 'N2' }, b),
      Object.assign({ id: 'n3', material: '81003', mat_doc: 'N3', reason_id: 1, employee_name: 'Арза', note: '', filled_by: 'Управител ГД' }, b),
      Object.assign({ id: 'n4', material: '81004', mat_doc: 'N4', reason_id: 1, employee_name: 'Арза', note: 'КЗ 5 / 10.10', filled_by: 'Управител ГД' }, b)
    ];
    const cp = () => NOTE.map(x => Object.assign({}, x));
    const rowOf = (h, id) => h.doc.getElementById('mn-row-' + id);
    const miss = (h, id) => { const tr = rowOf(h, id); const m = tr && tr.querySelector('.mn-note-missing'); return m ? m.textContent : null; };

    const dbN = fakeDb({ movs: cp() });
    const h = env(GD, dbN); await open(h);
    ok('обект: записан ред с причина 1 и празна бележка → „попълни номер/дата“ под бележката', miss(h, 'n3') === 'попълни номер/дата' && rowOf(h, 'n3').querySelector('.mn-note-missing').parentNode === h.doc.getElementById('mn-note-n3').parentNode);
    ok('… с бележка (n4) и непопълнените (n1, n2) — без надпис', miss(h, 'n4') === null && miss(h, 'n1') === null && miss(h, 'n2') === null);
    ok('броят th в #mn-daily е непроменен (10)', h.doc.querySelectorAll('#mn-daily thead th').length === 10);
    h.doc.getElementById('mn-reason-n1').value = '1';
    h.doc.getElementById('mn-emp-n1').value = 'Здравка';
    realClick(h.w, btn(rowOf(h, 'n1'), 'Запази')); await ticks(4);
    ok('причина 1 + празна бележка → червен toast, 0 PATCH', dbN.log.filter(x => x.m === 'PATCH').length === 0 && h.calls.toast.slice(-1)[0] === 'За тази причина попълни номер и дата на поръчката в „Бележка"' && h.doc.getElementById('toast').style.background.indexOf('220, 38, 38') >= 0, h.calls.toast.slice(-1)[0]);
    h.doc.getElementById('mn-note-n1').value = '   ';
    realClick(h.w, btn(rowOf(h, 'n1'), 'Запази')); await ticks(4);
    ok('… бележка само от интервали → пак отказ', dbN.log.filter(x => x.m === 'PATCH').length === 0);
    h.doc.getElementById('mn-note-n1').value = 'КЗ Гоце Делчев-0006 / 11.10';
    realClick(h.w, btn(rowOf(h, 'n1'), 'Запази')); await ticks(4);
    let pp = dbN.log.filter(x => x.m === 'PATCH');
    ok('с бележка → PATCH с note', pp.length === 1 && pp[0].q === 'id=eq.n1' && pp[0].body.note === 'КЗ Гоце Делчев-0006 / 11.10' && pp[0].body.reason_id === 1, pp[0] && JSON.stringify(pp[0].body));
    h.doc.getElementById('mn-reason-n2').value = '2';
    h.doc.getElementById('mn-emp-n2').value = 'Здравка';
    realClick(h.w, btn(rowOf(h, 'n2'), 'Запази')); await ticks(4);
    pp = dbN.log.filter(x => x.m === 'PATCH');
    ok('причина без requires_note + празна бележка → записва (note null)', pp.length === 2 && pp[1].q === 'id=eq.n2' && pp[1].body.note === null, pp[1] && JSON.stringify(pp[1].body));
    h.doc.getElementById('mn-note-n3').value = 'КЗ Гоце Делчев-0007 / 07.10';
    realClick(h.w, btn(rowOf(h, 'n3'), 'Запази')); await ticks(4);
    ok('допълване на записания n3 с бележка → записва и надписът изчезва', dbN.log.filter(x => x.m === 'PATCH').length === 3 && miss(h, 'n3') === null);

    const hc = env(ADMIN, fakeDb({ movs: cp() })); await open(hc);
    ok('контролинг: „попълни номер/дата“ под бележката на n3', miss(hc, 'n3') === 'попълни номер/дата' && miss(hc, 'n4') === null);
    const u = hc.doc.getElementById('mn-unfilled'); u.checked = true; fire(hc.w, u, 'change');
    const ids = Array.from(hc.doc.querySelectorAll('#mn-daily tbody tr')).map(tr => tr.getAttribute('data-mn-id')).sort();
    ok('„само непопълнени“ включва n3 (причина 1 без бележка), не и n4', ids.join(',') === 'n1,n2,n3', ids.join(','));
  }

  section('14. Брояч „➖ Минуси (N)“ за обекта и картата в „Днес“ (23.10.2026)');
  {
    /* „Непопълнен“ = НЕЗАКРИТ и mnUnfilled. Гоце Делчев: b1, b2 — незакрити без
       причина; b3 — незакрит с причина 1 без бележка; b4 — ЗАКРИТ без причина
       (не се брои); b5 — незакрит и попълнен. → N = 3. Шумен: s1 — незакрит
       без причина, плюс свръхсторно s2. */
    const b = { plant: '5519', material_desc: 'ТЕСТ БРОЯЧ', uom: 'БР', doc_year: 2026, doc_item: '1', mvt_type: '955', qty: 1, posting_date: '2026-10-15' };
    const BADGE = [
      Object.assign({}, b, { id: 'b1', store_name: 'Гоце Делчев', material: '83001', mat_doc: 'B1' }),
      Object.assign({}, b, { id: 'b2', store_name: 'Гоце Делчев', material: '83002', mat_doc: 'B2' }),
      Object.assign({}, b, { id: 'b3', store_name: 'Гоце Делчев', material: '83003', mat_doc: 'B3', reason_id: 1, note: '' }),
      Object.assign({}, b, { id: 'b4', store_name: 'Гоце Делчев', material: '83004', mat_doc: 'B4' }),
      Object.assign({}, b, { id: 'b4c', store_name: 'Гоце Делчев', material: '83004', mat_doc: 'B4C', mvt_type: '956', qty: -1, posting_date: '2026-10-16' }),
      Object.assign({}, b, { id: 'b5', store_name: 'Гоце Делчев', material: '83005', mat_doc: 'B5', reason_id: 2, employee_name: 'Здравка' }),
      Object.assign({}, b, { id: 's1', store_name: 'Шумен', plant: '5514', material: '84001', mat_doc: 'S1' }),
      Object.assign({}, b, { id: 's2', store_name: 'Шумен', plant: '5514', material: '84002', mat_doc: 'S2', mvt_type: '956', qty: -2 })
    ];
    const cpB = () => BADGE.map(x => Object.assign({}, x));
    const env2 = (user, db) => { const h = boot({ modules: ['today.js', 'revaluation.js', 'revisions.js', 'minusi.js'], user, data: {} }); install(h, db); return h; };
    const subBtn = h => h.doc.getElementById('rvs-minusi');

    const h = env2(GD, fakeDb({ movs: cpB() }));
    h.w.setupTabsForRole();
    ok('преди отварянето: „➖ Минуси“ без брояч', subBtn(h).textContent === '➖ Минуси');
    realClick(h.w, h.doc.getElementById('tab-revaluation')); await ticks(8);
    ok('клик по „Ревизии и преоценка“ → „➖ Минуси (3)“ (закритият b4 не се брои)', subBtn(h).textContent === '➖ Минуси (3)', subBtn(h).textContent);
    realClick(h.w, subBtn(h)); await ticks(8);
    ok('в самия модул броячът е същият (mnRender)', subBtn(h).textContent === '➖ Минуси (3)', subBtn(h).textContent);
    h.doc.getElementById('mn-reason-b1').value = '2';
    h.doc.getElementById('mn-emp-b1').value = 'Здравка';
    realClick(h.w, btn(h.doc.getElementById('mn-row-b1'), 'Запази')); await ticks(6);
    ok('след „Запази“ на b1 → „➖ Минуси (2)“', subBtn(h).textContent === '➖ Минуси (2)', subBtn(h).textContent);

    const filled = cpB().map(x => (x.store_name === 'Гоце Делчев' && x.mvt_type === '955') ? Object.assign(x, { reason_id: 2, note: 'х' }) : x);
    const h0 = env2(GD, fakeDb({ movs: filled }));
    h0.w.setupTabsForRole();
    realClick(h0.w, h0.doc.getElementById('tab-revaluation')); await ticks(8);
    ok('N = 0 → без брояч', subBtn(h0).textContent === '➖ Минуси' && subBtn(h0).getAttribute('data-mn-n') === '0', subBtn(h0).textContent);

    const hs = env2(SHUMEN, fakeDb({ movs: cpB() }));  /* minus_stores = „Гоце Делчев“ */
    hs.w.setupTabsForRole();
    realClick(hs.w, hs.doc.getElementById('tab-revaluation')); await ticks(8);
    ok('невключен обект (Шумен) → без брояч, макар да има незакрит', subBtn(hs).textContent === '➖ Минуси', subBtn(hs).textContent);

    const hDeep = env2(GD, fakeDb({ movs: cpB() }));
    hDeep.w.setupTabsForRole();
    ok('#mn → mnDeepLinkBoot отваря под-таба', hDeep.w.mnDeepLinkBoot('#mn') === true && mod(hDeep).style.display === 'block');
    ok('друг хеш (#pk=…) не е негов', hDeep.w.mnDeepLinkBoot('#pk=abc') === false);

    /* „Днес“ — admin вижда двата включени обекта, регионалният — само своя. */
    const todayCard = async (user, db) => {
      const ht = env2(user, db);
      ht.w.todayFilterStore = 'all';
      ht.w.todayMinusiHtml(); await ticks(10);
      const div = ht.doc.createElement('div'); div.innerHTML = ht.w.todayMinusiHtml();
      return div;
    };
    const both = fakeDb({ movs: cpB(), settings: 'Гоце Делчев, Шумен' });
    const dA = await todayCard(ADMIN, both);
    const rowsA = Array.from(dA.querySelectorAll('.td-mn-row')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent).join('|'));
    ok('„Днес“, admin: Гоце Делчев 4 · 3 · 0 и Шумен 1 · 1 · 1', rowsA.join(' / ') === 'Гоце Делчев|4|3|0 / Шумен|1|1|1', rowsA.join(' / '));
    const REG = { email: 'reg@temax.bg', display_name: 'Регионален', role: 'accounting', store_name: 'Централен офис', is_regional: true, assigned_stores: ['Шумен', 'Севлиево'] };
    const dR = await todayCard(REG, fakeDb({ movs: cpB(), settings: 'Гоце Делчев, Шумен' }));
    const rowsR = Array.from(dR.querySelectorAll('.td-mn-row')).map(tr => tr.getAttribute('data-store'));
    ok('„Днес“, регионален accounting: само своя (Шумен)', rowsR.join(',') === 'Шумен', rowsR.join(','));
    const dNone = await todayCard(ADMIN, fakeDb({ movs: cpB(), settings: '' }));
    ok('без включени обекти → картата я няма', dNone.innerHTML === '');
    const dbErr = fakeDb({ movs: cpB(), settings: 'Гоце Делчев' });
    const hE = env2(ADMIN, dbErr);
    const of = hE.w.fetch;
    hE.w.fetch = (url, init) => /minus_movements/.test(String(url)) ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }), text: () => Promise.resolve('') }) : of(url, init);
    hE.w.todayFilterStore = 'all';
    hE.w.todayMinusiHtml(); await ticks(10);
    const dE = hE.doc.createElement('div'); dE.innerHTML = hE.w.todayMinusiHtml();
    ok('грешка при четене → червен ред „Непълни данни“, не празна карта', !!dE.querySelector('#td-minusi-err') && /Непълни данни/.test(dE.textContent) && !dE.querySelector('.td-mn-row'), dE.textContent);
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
