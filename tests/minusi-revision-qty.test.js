/* Минуси, темплейт за ревизия — количеството на минуса в „Преброено
   количество" (17.11.2026, сесия minusi-rev-qty; искане на Миглена, решения
   на Тенчо).

   Колона C на реда на МИНУСА = сборът от незакрития остатък (_rest от
   mnCompute) на минусите с този код, които влизат в темплейта; число,
   закръглено с mnRound. Заметнатите (без собствен минус) — празно. Код, който
   е и минус, и заметнат — само количеството на собствените му минуси.
   Прегледът: колона „Количество минус" (число + мерна единица) и жълто
   предупреждение над „📥 Свали Excel".

   Фикстура (Гоце Делчев, причина 2 = в ревизия, 1 = извън):
     40001  955 3 БР, 956 −1                → 2 (частично закрит)
     40002  955 1 БР + 955 4 БР              → 5 (два незакрити — сбор)
     40003  955 1 БР, заметнат 40004          → 40003 = 1, 40004 празно
     40005  955 2 БР, заметнат 40002          → 40005 = 2, 40002 остава 5
     40006  955 1,75 M2, 956 −0,5            → 1,25 (дробно, M2)
     40007  955 0,1 M2 + 955 0,2 M2           → 0,3 (не 0,30000000000000004)
     40008  955 6 БР причина 1, 956 −4        → не влиза (извън ревизия)

   Мутационна проверка (17.11.2026) — всеки вариант пуснат и паднал:
     Q1 r.qty вместо r._rest в mnRevAll               → падат 6
     Q2 количество и на заметнатите (e.qty без e.minus) в mnRevAoa → падат 2
     Q3 C като текст (String(mnRound(e.qty)))          → падат 8
     Q4 qty и от заметнатия ред (извън if(of == null)) → падат 3
   Пускане: node tests/minusi-revision-qty.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, section, report, ticks } = H;

const GD = 'Гоце Делчев';
let seq = 0;
function mv(material, type, date, o) {
  seq++;
  return Object.assign({ id: 'q' + String(seq).padStart(4, '0'), store_name: GD, plant: '5519', material: material,
    material_desc: 'ТЕСТ ' + material, mvt_type: type, qty: type === '956' ? -1 : 1, uom: 'БР', mat_doc: 'Q' + String(seq).padStart(4, '0'),
    doc_item: '1', doc_year: 2026, posting_date: date, real_code: null, reason_id: type === '955' ? 2 : null,
    employee_name: type === '955' ? 'Иван' : null, note: null, action: null, filled_by: null, filled_at: null }, o || {});
}
function base() {
  seq = 0;
  return [
    mv('40001', '955', '2026-11-01', { qty: 3 }), mv('40001', '956', '2026-11-05', { qty: -1 }),
    mv('40002', '955', '2026-10-01', { qty: 1 }), mv('40002', '955', '2026-11-02', { qty: 4 }),
    mv('40003', '955', '2026-11-03', { real_code: '40004' }),
    mv('40005', '955', '2026-11-04', { qty: 2, real_code: '40002' }),
    mv('40006', '955', '2026-11-05', { qty: 1.75, uom: 'M2' }), mv('40006', '956', '2026-11-06', { qty: -0.5, uom: 'M2' }),
    mv('40007', '955', '2026-10-02', { qty: 0.1, uom: 'M2' }), mv('40007', '955', '2026-11-07', { qty: 0.2, uom: 'M2' }),
    mv('40008', '955', '2026-11-08', { qty: 6, reason_id: 1, note: 'КЗ 1 / 08.11' }), mv('40008', '956', '2026-11-09', { qty: -4 })
  ];
}
const REASONS = [1, 2].map(id => ({ id, label: 'причина ' + id, active: true, sort: id, requires_note: id === 1, excluded_from_revision: id === 1 }));

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
    if (tbl === 'minus_reasons') {
      const sel = ((q.match(/select=([^&]+)/) || [])[1] || '').split(',');
      return resp(200, REASONS.map(r => { const o = {}; sel.forEach(k => { if (k in r) o[k] = r[k]; }); return o; }));
    }
    if (tbl === 'minus_uom_thresholds') return resp(200, [{ uom: 'M2', min_qty: 0.1 }]);
    if (tbl === 'minus_uploads') return resp(200, []);
    if (tbl === 'minus_movements') {
      if (/offset=[1-9]/.test(q)) return resp(200, []);
      return resp(200, db.movs.map(x => Object.assign({}, x)));
    }
    if (tbl === 'product_catalog') return resp(200, []);
    return resp(200, []);
  };
}
const GDU = { email: 'managergdelchev@temax.bg', display_name: 'Управител ГД', role: 'manager', store_name: GD };
const $ = (h, s) => h.w.document.querySelector(s);
const row = (h, c) => h.w.document.querySelector('#mn-rev-ov tr.mn-rev-row[data-code="' + c + '"]');
const qtyTxt = (h, c) => row(h, c).querySelector('.mn-rev-qty').textContent.replace(/ /g, ' ').trim();
function xlsxMock(w) {
  const cap = { aoa: null, ws: null, n: 0 };
  w.XLSX = {
    utils: {
      book_new: () => ({}),
      aoa_to_sheet: a => { cap.aoa = a; const ws = {}; a.forEach((r, i) => r.forEach((v, c) => { if (v != null) ws[String.fromCharCode(65 + c) + (i + 1)] = { t: typeof v === 'number' ? 'n' : 's', v }; })); cap.ws = ws; return ws; },
      book_append_sheet: () => {}
    },
    writeFile: () => { cap.n++; }
  };
  return cap;
}

(async () => {
  const db = { movs: base(), log: [] };
  const h = boot({ modules: ['revaluation.js', 'revisions.js', 'minusi.js'], user: GDU, data: {} });
  install(h, db);
  await h.w.loadMinusi(); await ticks(6);

  section('1. Преглед — истински клик по „📄 Темплейт за ревизия"');
  ok('бутонът е активен', $(h, '#mn-rev') && !$(h, '#mn-rev').disabled);
  realClick(h.w, $(h, '#mn-rev'), 'Темплейт за ревизия');
  await ticks(4);
  ok('прегледът е отворен', $(h, '#mn-rev-ov') && $(h, '#mn-rev-ov').classList.contains('open'));
  const ths = Array.from(h.w.document.querySelectorAll('#mn-rev-tbl thead th')).map(t => t.textContent);
  ok('колона „Количество минус"', ths[ths.length - 1] === 'Количество минус', ths.join('|'));
  const codes = Array.from(h.w.document.querySelectorAll('#mn-rev-ov tr.mn-rev-row')).map(tr => tr.getAttribute('data-code'));
  ok('40008 (извън ревизия) не влиза', codes.indexOf('40008') < 0);
  ok('частично закрит 3 − 1 → „2 БР"', qtyTxt(h, '40001') === '2 БР', qtyTxt(h, '40001'));
  ok('два незакрити 1 + 4 → „5 БР"', qtyTxt(h, '40002') === '5 БР', qtyTxt(h, '40002'));
  ok('заметнат 40004 → празно', qtyTxt(h, '40004') === '');
  ok('40003 (минус със заметнат) → „1 БР"', qtyTxt(h, '40003') === '1 БР');
  ok('40002 е и заметнат към 40005, но остава „5 БР"', /заметнат към 40005/.test(row(h, '40002').querySelector('.mn-rev-origin').textContent) && qtyTxt(h, '40002') === '5 БР');
  ok('дробно M2: 1,75 − 0,5 → „1,25 M2"', qtyTxt(h, '40006') === '1,25 M2', qtyTxt(h, '40006'));
  ok('0,1 + 0,2 M2 → „0,3 M2"', qtyTxt(h, '40007') === '0,3 M2', qtyTxt(h, '40007'));
  const warn = $(h, '#mn-rev-qtywarn');
  ok('предупреждението е там', !!warn);
  ok('текстът на предупреждението', warn && warn.textContent.indexOf('В колона „Преброено количество“ е попълнено количеството на минуса. Сменете го с реално преброеното, преди да качите файла в ZINVCOUNT.') >= 0);
  ok('видимо — жълт/оранжев цвят', warn && /color:#b45309/.test(warn.getAttribute('style')) && /background:#fef3c7/.test(warn.getAttribute('style')));
  const btn = $(h, '#mn-rev-xlsx');
  ok('над „📥 Свали Excel"', warn && btn && (warn.compareDocumentPosition(btn) & h.w.Node.DOCUMENT_POSITION_FOLLOWING) !== 0);

  section('2. Excel — истински клик по „📥 Свали Excel"');
  const cap = xlsxMock(h.w);
  realClick(h.w, btn, 'Свали Excel');
  await ticks(4);
  ok('файлът е записан веднъж', cap.n === 1);
  ok('заглавията — без промяна', JSON.stringify(cap.aoa[0]) === JSON.stringify(['Референция', 'SAP код', 'Преброено количество']));
  ok('точно 3 колони, без празни редове', cap.aoa.every(r => r.length === 3) && cap.aoa.slice(1).every(r => r[0] === 'ref' && r[1]));
  ok('кодовете = прегледа', JSON.stringify(cap.aoa.slice(1).map(r => r[1])) === JSON.stringify(codes));
  const C = c => cap.aoa.find(r => r[1] === c)[2];
  const cell = c => cap.ws['C' + (cap.aoa.findIndex(r => r[1] === c) + 1)];
  ok('40001 → 2 (число, не qty 3)', C('40001') === 2, C('40001'));
  ok('40002 → 5 (сбор; заметнатият 40005 не добавя)', C('40002') === 5, C('40002'));
  ok('40003 → 1; 40005 → 2', C('40003') === 1 && C('40005') === 2);
  ok('40004 (заметнат) → празно, клетка няма', C('40004') == null && !cell('40004'));
  ok('40006 → 1.25', C('40006') === 1.25, C('40006'));
  ok('40007 → 0.3 (mnRound)', C('40007') === 0.3, C('40007'));
  ok('C на минусите е числова клетка', ['40001', '40002', '40003', '40005', '40006', '40007'].every(c => typeof C(c) === 'number' && cell(c).t === 'n'));

  section('2б. Истинският SheetJS — запис и обратно четене');
  {
    const X = require('xlsx');
    let buf = null;
    h.w.XLSX = Object.assign({}, X, { writeFile: wb => { buf = X.write(wb, { type: 'buffer', bookType: 'xlsx' }); } });
    realClick(h.w, $(h, '#mn-rev-xlsx'), 'Свали Excel');
    await ticks(4);
    const ws = X.read(buf, { type: 'buffer' }).Sheets.Ревизия;
    ok('обхватът е A1:C' + (codes.length + 1), ws['!ref'] === 'A1:C' + (codes.length + 1), ws['!ref']);
    const back = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const B = c => back.find(r => r[1] === c);
    ok('обратно: 40001 = 2, числова клетка', B('40001')[2] === 2 && ws['C' + (back.indexOf(B('40001')) + 1)].t === 'n');
    ok('обратно: 40006 = 1.25, 40007 = 0.3', B('40006')[2] === 1.25 && B('40007')[2] === 0.3);
    ok('обратно: 40004 празно', B('40004')[2] === null);
    ok('кодът остава текст', ws['B2'].t === 's');
  }
  ok('нищо не се записва в базата', db.log.filter(x => x.m !== 'GET').length === 0);
  report();
})().catch(e => { console.error(e); process.exit(1); });
