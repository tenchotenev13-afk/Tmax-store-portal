/* Минуси, етап 3 — темплейт за ревизия (30.10.2026, сесия
   minusi-revision-template; решения на Тенчо и чата 27–30.10).

   „📄 Темплейт за ревизия" в „📋 Дневен" → преглед (код · описание · откъде е ·
   брой минуси) → Excel с ТОЧНО 3 колони „Референция | SAP код | Преброено
   количество", редове „ref | <код> | (празно)". Влиза минус: незакрит,
   попълнен (не mnUnfilled), причина с excluded_from_revision = false (от
   данните). Кодове: материалът + заметнатият (ако е различен), всеки веднъж.
   Нищо не се записва.

   Секции:
     1. обектът: кои минуси / кодове влизат (истински клик → модал);
     2. Excel: заглавия, „ref", празна трета, кодът текст, водещи нули, името;
        2б — истинският SheetJS: запис в буфер и обратно четене;
     3. бутонът неактивен — 0 минуси, „Всички обекти"; офис с един обект;
     4. флагът се чете от данните (обърнат флаг → редът изпада / влиза) и
        оцелява след mnLoadBadge (второто четене на причините);
     5. нищо не се записва (0 POST / PATCH).

   Мутационна проверка (30.10.2026) — всеки вариант пуснат и паднал:
     M1 mnRevReady без mnUnfilled(r)                      → пада 1 (10010)
     M2 mnRevReasonOk: !== true вместо === false           → пада 4
     M3 calc.all вместо calc.open (mnRevReady)             → пада 1
     M4 без проверката real !== mat                        → пада 1 (10006)
     M5 mnRevAoa: '' вместо 'ref'                          → пада 2
     M6 mnRevWhyOff без mnIsAll()                          → пада 3
     M7 mnLoadSummary със стария select без флага          → пада 4
     M8 без mnRevIsCode (свободният текст влиза като код)  → пада 1
     M9 без t=s / z=@ на клетката с кода                  → пада 2
   Пускане: node tests/minusi-revision-template.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, section, report, ticks } = H;

const GD = 'Гоце Делчев', SH = 'Шумен';
let seq = 0;
function mv(store, material, type, date, o) {
  seq++;
  return Object.assign({ id: 'm' + String(seq).padStart(4, '0'), store_name: store, plant: store === GD ? '5519' : '5520', material: material,
    material_desc: 'ТЕСТ ' + material, mvt_type: type, qty: type === '956' ? -1 : 1, uom: 'БР', mat_doc: 'D' + String(seq).padStart(4, '0'),
    doc_item: '1', doc_year: 2026, posting_date: date, real_code: null, reason_id: null, employee_name: null, note: null, action: null,
    filled_by: null, filled_at: null }, o || {});
}
const F = (rid, o) => Object.assign({ reason_id: rid, employee_name: 'Иван' }, o || {});

/* A 10001 причина 2, заметнат ' 20001 ' → 10001 и 20001
   B 10002 причина 1 (изключена) с бележка → не
   C 10003 непопълнен → не
   D 10004 закрит (956) → не
   E 10005 0,3 M2 под прага 0,5 → не
   G 10006 заметнат = същият код → един ред
   K 10007 два минуса (01.10 и 20.10) → един ред, брой 2
   L 10008 заметнат към 10001 (който е и минус-код) → 10001 един ред, брой 2
   Z 00012345 — водещи нули
   J 10009 причина 9 (изключена) → не; при флаг false → да
   R 10010 повторение (5 дни) с причина 2, без действие → непопълнен → не;
     първият 10010 е без причина
   T 10011 заметнат „38554 и 38619“ (свободен текст, реален случай ГД 30.10) →
     10011 влиза, текстът — не, а прегледът предупреждава */
function base() {
  seq = 0;
  return [
    mv(GD, '10001', '955', '2026-10-20', F(2, { real_code: ' 20001 ' })),
    mv(GD, '10002', '955', '2026-10-20', F(1, { note: 'КЗ 123 / 20.10' })),
    mv(GD, '10003', '955', '2026-10-20'),
    mv(GD, '10004', '955', '2026-10-10', F(2)), mv(GD, '10004', '956', '2026-10-12'),
    mv(GD, '10005', '955', '2026-10-20', F(2, { qty: 0.3, uom: 'M2' })),
    mv(GD, '10006', '955', '2026-10-20', F(2, { real_code: '10006' })),
    mv(GD, '10007', '955', '2026-10-01', F(2)), mv(GD, '10007', '955', '2026-10-20', F(2)),
    mv(GD, '10008', '955', '2026-10-21', F(2, { real_code: '10001' })),
    mv(GD, '00012345', '955', '2026-10-22', F(2)),
    mv(GD, '10009', '955', '2026-10-22', F(9)),
    mv(GD, '10010', '955', '2026-10-15'), mv(GD, '10010', '955', '2026-10-20', F(2)),
    mv(GD, '10011', '955', '2026-10-22', F(2, { real_code: '38554 и 38619' })),
    mv(SH, '30001', '955', '2026-10-22', F(2))
  ];
}
function reasons(flags) {
  flags = flags || {};
  const ex = id => flags[id] !== undefined ? flags[id] : (id === 1 || id === 5 || id === 9);
  return [1, 2, 5, 9].map(id => ({ id, label: 'причина ' + id, active: true, sort: id, requires_note: id === 1, excluded_from_revision: ex(id) }));
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
    db.log.push({ m, tbl, q });
    if (m !== 'GET') return resp(405, { message: 'not in fake' });
    if (tbl === 'app_settings') return resp(200, [{ key: 'minus_stores', value: GD + ',' + SH }]);
    if (tbl === 'minus_plants') return resp(200, [{ plant: '5519', store_name: GD }, { plant: '5520', store_name: SH }]);
    if (tbl === 'minus_reasons') {
      /* Като PostgREST: колона, която не е в select, не идва. */
      const sel = ((q.match(/select=([^&]+)/) || [])[1] || '').split(',');
      return resp(200, db.reasons.map(r => { const o = {}; sel.forEach(k => { if (k in r) o[k] = r[k]; }); return o; }));
    }
    if (tbl === 'minus_uom_thresholds') return resp(200, [{ uom: 'M2', min_qty: 0.5 }]);
    if (tbl === 'minus_uploads') return resp(200, []);
    if (tbl === 'minus_movements') {
      if (/offset=[1-9]/.test(q)) return resp(200, []);
      const st = (q.match(/store_name=eq\.([^&]+)/) || [])[1];
      const ins = (q.match(/store_name=in\.\(([^)]+)\)/) || [])[1];
      const list = ins ? ins.split(',').map(s => s.replace(/"/g, '')) : null;
      return resp(200, db.movs.filter(x => (!st || x.store_name === st) && (!list || list.indexOf(x.store_name) >= 0)).map(x => Object.assign({}, x)));
    }
    return resp(200, []);
  };
}
function env(user, db) {
  const h = boot({ modules: ['revaluation.js', 'revisions.js', 'minusi.js'], user, data: {} });
  install(h, db);
  return h;
}
function mkDb(o) { o = o || {}; return { movs: o.movs || base(), reasons: o.reasons || reasons(o.flags), log: [] }; }
async function open(h) { await h.w.loadMinusi(); await ticks(6); }
const ADMIN = { email: 'm.pavlova@temax.bg', display_name: 'Миглена', role: 'admin', store_name: 'Централен офис' };
const GDU = { email: 'managergdelchev@temax.bg', display_name: 'Управител ГД', role: 'manager', store_name: GD };
const SKL = { email: 'skladgd@temax.bg', display_name: 'Склад ГД', role: 'sklad', store_name: GD };

const $ = (h, s) => h.w.document.querySelector(s);
const modalCodes = h => Array.from(h.w.document.querySelectorAll('#mn-rev-ov tr.mn-rev-row')).map(tr => tr.getAttribute('data-code'));
const modalRow = (h, c) => h.w.document.querySelector('#mn-rev-ov tr.mn-rev-row[data-code="' + c + '"]');
function clickRev(h) { realClick(h.w, $(h, '#mn-rev'), 'Темплейт за ревизия'); }
function xlsxMock(w) {
  const cap = { aoa: null, ws: null, name: null, sheet: null, n: 0 };
  w.XLSX = {
    utils: {
      book_new: () => ({}),
      aoa_to_sheet: a => {
        cap.aoa = a; const ws = {};
        a.forEach((row, r) => row.forEach((v, c) => { if (v != null) ws[String.fromCharCode(65 + c) + (r + 1)] = { t: typeof v === 'number' ? 'n' : 's', v }; }));
        cap.ws = ws; return ws;
      },
      book_append_sheet: (wb, ws, n) => { cap.sheet = n; }
    },
    writeFile: (wb, n) => { cap.name = n; cap.n++; }
  };
  return cap;
}

(async function main() {
  section('1. Обектът — кои минуси и кодове влизат');
  const db = mkDb();
  const h = env(GDU, db);
  await open(h);
  const b = $(h, '#mn-rev');
  ok('бутонът „📄 Темплейт за ревизия" е в Дневен', !!b && b.textContent.indexOf('📄 Темплейт за ревизия') >= 0);
  ok('бутонът е активен', !!b && !b.disabled);
  clickRev(h);
  const ov = $(h, '#mn-rev-ov');
  ok('кликът отваря модала', !!ov && ov.classList.contains('open'));
  const codes = modalCodes(h);
  /* Ред по код, числово (00012345 = 12345). */
  ok('кодовете точно: 10001, 10006, 10007, 10008, 10011, 00012345, 20001', JSON.stringify(codes) === JSON.stringify(['10001', '10006', '10007', '10008', '10011', '00012345', '20001']),
    JSON.stringify(codes));
  ok('минусът с причина в ревизията + заметнатият (trim) влизат', codes.indexOf('10001') >= 0 && codes.indexOf('20001') >= 0);
  ok('изключена причина (1, 9) → не', codes.indexOf('10002') < 0 && codes.indexOf('10009') < 0);
  ok('непопълнен → не', codes.indexOf('10003') < 0);
  ok('непопълнен С причина (повторение без действие) → не', codes.indexOf('10010') < 0);
  ok('закрит → не', codes.indexOf('10004') < 0);
  ok('под прага → не', codes.indexOf('10005') < 0);
  ok('чужд обект → не', codes.indexOf('30001') < 0);
  ok('заметнат = същият код → един ред', codes.filter(c => c === '10006').length === 1);
  ok('… и е само „минус", брой 1', modalRow(h, '10006').querySelector('.mn-rev-origin').textContent === 'минус' && modalRow(h, '10006').querySelector('.mn-rev-n').textContent === '1');
  ok('един код в два минуса → един ред, брой 2', codes.filter(c => c === '10007').length === 1 && modalRow(h, '10007').querySelector('.mn-rev-n').textContent === '2');
  ok('заметнат код, който е и минус-код → един ред', codes.filter(c => c === '10001').length === 1);
  const o1 = modalRow(h, '10001').querySelector('.mn-rev-origin').textContent;
  ok('„откъде е" на 10001: минус · заметнат към 10008', o1 === 'минус · заметнат към 10008', o1);
  ok('брой минуси на 10001 = 2', modalRow(h, '10001').querySelector('.mn-rev-n').textContent === '2');
  ok('„откъде е" на 20001: заметнат към 10001', modalRow(h, '20001').querySelector('.mn-rev-origin').textContent === 'заметнат към 10001');
  ok('описанието на минус-кода идва от реда', modalRow(h, '10007').children[1].textContent === 'ТЕСТ 10007');
  ok('заметнат „38554 и 38619“ не е код → не влиза, 10011 влиза', codes.indexOf('10011') >= 0 && !codes.some(c => / /.test(c)));
  const bad = $(h, '#mn-rev-bad');
  ok('прегледът предупреждава за него', !!bad && bad.textContent.indexOf('„38554 и 38619“ (към 10011)') >= 0 && bad.textContent.indexOf('НЕ е във файла') >= 0);
  ok('10008 като минус-код', modalRow(h, '10008').querySelector('.mn-rev-origin').textContent === 'минус');

  section('2. Excel');
  const cap = xlsxMock(h.w);
  realClick(h.w, $(h, '#mn-rev-xlsx'), 'Свали Excel');
  await ticks(2);
  ok('файлът е записан веднъж', cap.n === 1);
  ok('заглавният ред — точно 3 колони', JSON.stringify(cap.aoa[0]) === JSON.stringify(['Референция', 'SAP код', 'Преброено количество']));
  ok('всеки ред е от 3 колони', cap.aoa.every(r => r.length === 3));
  ok('„ref" в първата колона на всеки ред', cap.aoa.slice(1).every(r => r[0] === 'ref'));
  ok('третата колона е празна (клетка няма)', cap.aoa.slice(1).every((r, i) => r[2] == null && !cap.ws['C' + (i + 2)]));
  ok('кодовете в Excel = кодовете в модала', JSON.stringify(cap.aoa.slice(1).map(r => r[1])) === JSON.stringify(codes));
  ok('кодът е текст (t=s, формат @)', cap.aoa.slice(1).every((r, i) => { const c = cap.ws['B' + (i + 2)]; return typeof r[1] === 'string' && c.t === 's' && c.z === '@'; }));
  const zi = cap.aoa.findIndex(r => r[1] === '00012345');
  ok('водещите нули остават', zi > 0 && cap.ws['B' + (zi + 1)].v === '00012345');
  const d = h.w.fmtDate(h.w.today());
  ok('името: „Ревизия минуси Гоце Делчев дд.мм.гггг.xlsx"', cap.name === 'Ревизия минуси ' + GD + ' ' + d + '.xlsx' && /\d{2}\.\d{2}\.\d{4}\.xlsx$/.test(cap.name), cap.name);
  ok('листът е един — „Ревизия"', cap.sheet === 'Ревизия');

  section('2б. Истинският SheetJS — запис и обратно четене');
  {
    const X = require('xlsx');
    let buf = null;
    h.w.XLSX = Object.assign({}, X, { writeFile: wb => { buf = X.write(wb, { type: 'buffer', bookType: 'xlsx' }); } });
    realClick(h.w, $(h, '#mn-rev-xlsx'), 'Свали Excel');
    await ticks(2);
    const wb = X.read(buf, { type: 'buffer' });
    ok('един лист', wb.SheetNames.length === 1 && wb.SheetNames[0] === 'Ревизия');
    const ws = wb.Sheets.Ревизия;
    ok('обхватът е точно A1:C' + (codes.length + 1), ws['!ref'] === 'A1:C' + (codes.length + 1), ws['!ref']);
    const back = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    ok('прочетено обратно: ref | код | празно', back.slice(1).every((r, i) => r[0] === 'ref' && r[1] === codes[i] && r[2] === null));
    const zr = back.findIndex(r => r[1] === '00012345');
    ok('00012345 е текстова клетка и след запис', zr > 0 && ws['B' + (zr + 1)].t === 's');
  }

  section('3. Неактивен бутон; офисът');
  const db0 = mkDb({ movs: base().filter(m => ['10002', '10003', '10004', '10005', '10009'].indexOf(m.material) >= 0) });
  const h0 = env(SKL, db0);
  await open(h0);
  const b0 = $(h0, '#mn-rev');
  ok('0 минуси (склад): бутонът е там, но неактивен', !!b0 && b0.disabled === true);
  ok('подсказка „няма минуси за ревизия"', !!$(h0, '#mn-rev-hint') && $(h0, '#mn-rev-hint').textContent === 'няма минуси за ревизия' && b0.title === 'няма минуси за ревизия');
  ok('mnRevOpen при 0 не отваря модал', h0.w.mnRevOpen() === false && !$(h0, '#mn-rev-ov'));

  const ha = env(ADMIN, mkDb());
  await open(ha);
  ok('офис, избран един обект (ГД) → активен', ha.w.mnStore === GD && $(ha, '#mn-rev') && !$(ha, '#mn-rev').disabled);
  clickRev(ha);
  ok('офис → модалът с кодовете на ГД', JSON.stringify(modalCodes(ha)) === JSON.stringify(codes));
  const capA = xlsxMock(ha.w);
  realClick(ha.w, $(ha, '#mn-rev-xlsx'), 'Свали Excel');
  await ticks(2);
  ok('офис → името носи избрания обект', capA.name === 'Ревизия минуси ' + GD + ' ' + d + '.xlsx');
  ha.w.closeModal('mn-rev-ov');
  const sel = $(ha, '#mn-store');
  sel.value = '__all__';
  H.fire(ha.w, sel, 'change');
  await ticks(6);
  const bA = $(ha, '#mn-rev');
  ok('„Всички обекти" → неактивен', !!bA && bA.disabled === true);
  ok('подсказка „избери обект"', !!$(ha, '#mn-rev-hint') && $(ha, '#mn-rev-hint').textContent === 'избери обект');
  ok('mnRevOpen при „Всички обекти" не отваря', ha.w.mnRevOpen() === false && !$(ha, '#mn-rev-ov').classList.contains('open'));
  sel.value = SH;
  H.fire(ha.w, sel, 'change');
  await ticks(6);
  ok('офис → Шумен → активен', $(ha, '#mn-rev') && !$(ha, '#mn-rev').disabled);
  clickRev(ha);
  ok('Шумен → само 30001', JSON.stringify(modalCodes(ha)) === JSON.stringify(['30001']));
  ha.w.mnSetView('bymat');
  ok('„📦 По артикул" — без бутона', !$(ha, '#mn-rev'));

  section('4. Флагът се чете от данните');
  const hf = env(GDU, mkDb({ flags: { 9: false } }));
  await open(hf);
  clickRev(hf);
  ok('причина 9 с флаг false → 10009 влиза', modalCodes(hf).indexOf('10009') >= 0);
  const hg = env(GDU, mkDb({ flags: { 2: true } }));
  await open(hg);
  ok('причина 2 с флаг true → нищо (бутонът неактивен)', $(hg, '#mn-rev').disabled === true);
  ok('без флаг в данните → не влиза (по-добре нищо, отколкото грешен код)', (function () {
    hg.w.mnReasons = hg.w.mnReasons.map(r => ({ id: r.id, label: r.label }));
    return hg.w.mnRevRows(hg.w.mnCompute(hg.w.mnMovs, hg.w.mnThresholds)).length === 0;
  })());
  /* Второто четене на причините (брояча) не бива да изтрие флага. */
  const hb = env(GDU, mkDb());
  await open(hb);
  await hb.w.mnLoadBadge(); await ticks(3);
  hb.w.mnRender();
  ok('след mnLoadBadge бутонът е още активен', !$(hb, '#mn-rev').disabled);
  const l2 = []; install(hb, { movs: base(), reasons: reasons(), log: l2 });
  await hb.w.mnLoadSummary([GD]); await hb.w.loadMinusi(); await ticks(4);
  const rq = l2.filter(x => x.tbl === 'minus_reasons');
  ok('mnLoadSummary и loadMinusi — и двете с excluded_from_revision', rq.length === 2 && rq.every(x => /excluded_from_revision/.test(x.q)));

  section('5. Нищо не се записва');
  ok('0 POST / PATCH / DELETE след преглед и Excel', db.log.filter(x => x.m !== 'GET').length === 0);

  report();
})().catch(e => { console.error(e); process.exit(1); });
