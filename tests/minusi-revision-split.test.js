/* Минуси, темплейт за ревизия — заметнат код като свободен текст (02.11.2026,
   сесия minusi-revision-split; решение Б на Тенчо).

   Един код (латински букви, цифри, „.", „-", „_") влиза както е. Иначе всяко
   число от 4 до 7 цифри в полето е отделен код, на отделен ред; дедупликация
   както досега (всеки код веднъж, кодът на самия минус не се повтаря). Без
   нито едно такова число — нищо не влиза, прегледът предупреждава.

   Секции:
     1. mnRevRealCodes — чисто: реалният случай „38554 и 38619", разделители,
        3 и 8 цифри не влизат (и 8 цифри не се режат на 7), повторение,
        един код с букви, празно;
     2. обектът — истински клик: двата кода на отделни редове, „откъде е",
        дедупликация с друг минус и с кода на самия минус, предупреждението
        само при текст без число; Excel — „ref" и кодовете като текст.

   Мутационна проверка (02.11.2026) — всеки вариант пуснат и паднал
   (брой паднали проверки тук / в minusi-revision-template.test.js):
     S1 \d{4,7} → \d{4,8}                                  → 3 / 0
     S2 без (?!\d) (8 цифри се режат до 7)                  → 1 / 0
     S3 без out.indexOf (повторение в полето)                → 1 / 0
     S4 без c !== mat (кодът на минуса — и „заметнат“)        → 1 / 1
     S5 mnRevBad по стария знак (!mnRevIsCode)               → 1 / 0
     M8 mnRevBad никога не предупреждава                     → 1 / 1
   Пускане: node tests/minusi-revision-split.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, section, report, ticks } = H;

const GD = 'Гоце Делчев';
let seq = 0;
function mv(material, date, o) {
  seq++;
  return Object.assign({ id: 's' + String(seq).padStart(4, '0'), store_name: GD, plant: '5519', material: material,
    material_desc: 'ТЕСТ ' + material, mvt_type: '955', qty: 1, uom: 'БР', mat_doc: 'S' + String(seq).padStart(4, '0'),
    doc_item: '1', doc_year: 2026, posting_date: date, real_code: null, reason_id: 2, employee_name: 'Иван', note: null, action: null,
    filled_by: null, filled_at: null }, o || {});
}
/* 79416 „38554 и 38619"   — реалният случай от ГД → 38554, 38619
   50001 „38554, 38554"     — повторение в полето → 38554 (вече го има)
   50002 „50002 и 40001"    — кодът на самия минус → само 40001
   50003 „123 / 12345678 ; 1234 и 1234567" → 1234, 1234567
   50004 „нов етикет 12"    — без число → предупреждение
   50005 „AB-123"           — един код → както е */
function movs() {
  seq = 0;
  return [
    mv('79416', '2026-10-20', { real_code: '38554 и 38619' }),
    mv('50001', '2026-10-21', { real_code: '38554, 38554' }),
    mv('50002', '2026-10-21', { real_code: '50002 и 40001' }),
    mv('50003', '2026-10-21', { real_code: '123 / 12345678 ; 1234 и 1234567' }),
    mv('50004', '2026-10-21', { real_code: 'нов етикет 12' }),
    mv('50005', '2026-10-21', { real_code: 'AB-123' })
  ];
}
const REASONS = [{ id: 2, label: 'последна бройка', active: true, sort: 2, requires_note: false, excluded_from_revision: false }];

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
    if (tbl === 'app_settings') return resp(200, [{ key: 'minus_stores', value: GD }]);
    if (tbl === 'minus_plants') return resp(200, [{ plant: '5519', store_name: GD }]);
    if (tbl === 'minus_reasons') return resp(200, REASONS);
    if (tbl === 'minus_uom_thresholds') return resp(200, []);
    if (tbl === 'minus_uploads') return resp(200, []);
    if (tbl === 'minus_movements') return resp(200, /offset=[1-9]/.test(q) ? [] : db.movs.map(x => Object.assign({}, x)));
    return resp(200, []);
  };
}
const GDU = { email: 'managergdelchev@temax.bg', display_name: 'Управител ГД', role: 'manager', store_name: GD };
const $ = (h, s) => h.w.document.querySelector(s);
const modalCodes = h => Array.from(h.w.document.querySelectorAll('#mn-rev-ov tr.mn-rev-row')).map(tr => tr.getAttribute('data-code'));
const row = (h, c) => h.w.document.querySelector('#mn-rev-ov tr.mn-rev-row[data-code="' + c + '"]');
const J = x => JSON.stringify(x);

(async function main() {
  const db = { movs: movs(), log: [] };
  const h = boot({ modules: ['revaluation.js', 'revisions.js', 'minusi.js'], user: GDU, data: {} });
  install(h, db);
  const w = h.w;

  section('1. mnRevRealCodes');
  ok('„38554 и 38619" → 38554, 38619', J(w.mnRevRealCodes('38554 и 38619')) === J(['38554', '38619']));
  ok('разделители „/" „;" „," и без интервал', J(w.mnRevRealCodes('38554/38619;40001,4000002')) === J(['38554', '38619', '40001', '4000002']));
  ok('кирилица между числата', J(w.mnRevRealCodes('38554и38619')) === J(['38554', '38619']));
  ok('3 и 8 цифри не влизат; 8 цифри не се режат на 7', J(w.mnRevRealCodes('123 / 12345678 ; 1234 и 1234567')) === J(['1234', '1234567']));
  ok('повторение в полето → веднъж', J(w.mnRevRealCodes('38554, 38554')) === J(['38554']));
  ok('водещи нули се пазят (0012345)', J(w.mnRevRealCodes('код 0012345 и още')) === J(['0012345']));
  ok('без число → празно', J(w.mnRevRealCodes('нов етикет 12')) === J([]));
  ok('един код с букви → както е', J(w.mnRevRealCodes('AB-123')) === J(['AB-123']));
  ok('един числов код → както е (и 8 цифри)', J(w.mnRevRealCodes('00012345')) === J(['00012345']));
  ok('празно → нищо', J(w.mnRevRealCodes('')) === J([]));

  section('2. Обектът — преглед и Excel');
  await w.loadMinusi(); await ticks(6);
  realClick(w, $(h, '#mn-rev'), 'Темплейт за ревизия');
  const codes = modalCodes(h);
  ok('кодовете точно', J(codes) === J(['50001', '38554', '50002', '40001', '50003', '1234', '1234567', '50004', '50005', 'AB-123', '79416', '38619']), J(codes));
  ok('38554 и 38619 — на отделни редове', !!row(h, '38554') && !!row(h, '38619') && codes.indexOf('38554 и 38619') < 0);
  ok('38619 — „заметнат към 79416"', row(h, '38619').querySelector('.mn-rev-origin').textContent === 'заметнат към 79416');
  ok('38554 — веднъж, от два минуса (79416 и 50001)', codes.filter(c => c === '38554').length === 1 &&
    row(h, '38554').querySelector('.mn-rev-origin').textContent === 'заметнат към 50001, 79416' && row(h, '38554').querySelector('.mn-rev-n').textContent === '2');
  ok('кодът на самия минус в полето не става „заметнат"', row(h, '50002').querySelector('.mn-rev-origin').textContent === 'минус' && row(h, '50002').querySelector('.mn-rev-n').textContent === '1');
  ok('8 цифри не влизат, нито отрязани', codes.indexOf('12345678') < 0 && codes.indexOf('2345678') < 0 && codes.indexOf('1234567') >= 0);
  const bad = $(h, '#mn-rev-bad');
  ok('предупреждение — само за текста без число', !!bad && bad.textContent.indexOf('„нов етикет 12“ (към 50004)') >= 0 &&
    bad.textContent.indexOf('38554') < 0 && bad.textContent.indexOf('1234') < 0);
  const cap = { aoa: null, ws: null };
  w.XLSX = {
    utils: {
      book_new: () => ({}),
      aoa_to_sheet: a => { cap.aoa = a; const ws = {}; a.forEach((r, i) => r.forEach((v, c) => { if (v != null) ws[String.fromCharCode(65 + c) + (i + 1)] = { t: typeof v === 'number' ? 'n' : 's', v }; })); cap.ws = ws; return ws; },
      book_append_sheet: () => {}
    },
    writeFile: () => {}
  };
  realClick(w, $(h, '#mn-rev-xlsx'), 'Свали Excel');
  await ticks(2);
  ok('Excel: същите кодове, „ref", празна трета', J(cap.aoa.slice(1).map(r => r[1])) === J(codes) && cap.aoa.slice(1).every(r => r[0] === 'ref' && r[2] == null));
  ok('Excel: разделените кодове са текст', ['38554', '38619'].every(c => { const i = cap.aoa.findIndex(r => r[1] === c); return i > 0 && cap.ws['B' + (i + 1)].t === 's' && cap.ws['B' + (i + 1)].z === '@'; }));
  ok('нищо не се записва', db.log.filter(x => x.m !== 'GET').length === 0);

  report();
})().catch(e => { console.error(e); process.exit(1); });
