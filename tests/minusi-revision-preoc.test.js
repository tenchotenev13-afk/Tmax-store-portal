/* Минуси, темплейт за ревизия — без преоценените кодове (17.11.2026, сесия
   minusi-rev-no-preoc; сигнал от Миглена, решение на Тенчо).

   Преоценен код НЕ влиза — нито като минус, нито като заметнат. Преоценен е,
   ако: а) описанието в движенията започва с „ПРЕОЦ“ (главни/малки, с интервал
   или без); б) в product_catalog category = 'Преоценка' или product_name
   започва с „ПРЕОЦ“. Обикновеният код до него остава; заметнат, чийто минус е
   преоценен, става глава на групата. Прегледът показва сив блок „Не влизат
   (преоценени)“; броят в „📥 Свали Excel (N)“ е без тях; каталогът гърми →
   само а) + сив ред; не остане ли нищо → бутонът е неактивен.

   Секции:
     1. смесен обект — истински клик по „📄 Темплейт за ревизия“: кои кодове
        остават, групи, сив блок, брой в бутона;
     2. Excel — истински клик: без преоценените, 3 колони, ref;
     3. каталогът гърми — само по описание, сив ред, файлът пак се сваля;
     4. само преоценени по описание → бутонът неактивен, „няма минуси…“;
     5. само преоценени по каталог → след зареждането прегледът е празен,
        Excel неактивен, бутонът отвън — неактивен.

   Мутационна проверка (17.11.2026) — всеки вариант пуснат и паднал:
     P1 без а) (описанието не се гледа)                   → exit 1, 15 ❌
     P2 без б) (каталогът не се гледа)                     → exit 1, 14 ❌
     P3 преоценените влизат в Excel (mnRevWrite ← all)     → exit 1, 4 ❌
   Пускане: node tests/minusi-revision-preoc.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, section, report, ticks } = H;

const ST = 'Монтана';
let seq = 0;
function mv(material, desc, real) {
  seq++;
  return { id: 'p' + String(seq).padStart(4, '0'), store_name: ST, plant: '5540', material: material,
    material_desc: desc, mvt_type: '955', qty: 1, uom: 'БР', mat_doc: 'P' + String(seq).padStart(4, '0'),
    doc_item: '1', doc_year: 2026, posting_date: '2026-11-0' + Math.min(seq, 9), real_code: real || null, reason_id: 2,
    employee_name: 'Иван', note: null, action: null, filled_by: null, filled_at: null };
}
/* 8057488 ПРЕОЦ. минус без заметнат             — вън (а)
   55312 обикновен → заметнат 8055312 (кат. Преоценка) — 55312 остава, 8055312 вън (б, category)
   8090757 „Преоц. …“ (малки, интервал) → 90757   — 8090757 вън (а), 90757 глава
   70001 обикновено описание, кат. Преоценка       — вън само по каталога (category)
   70002 обикновен → 70003 (product_name „ПРЕОЦ.…“) — 70003 вън (б, име)
   70010 обикновен                                  — остава */
function mixed() {
  seq = 0;
  return [
    mv('8057488', 'ПРЕОЦ.ТЕСТ СТОКА'),
    mv('55312', 'ТЕСТ 55312', '8055312'),
    mv('8090757', 'Преоц. тест стока', '90757'),
    mv('70001', 'ТЕСТ 70001'),
    mv('70002', 'ТЕСТ 70002', '70003'),
    mv('70010', 'ТЕСТ 70010')
  ];
}
const CAT = [
  { sap_code: '8055312', product_name: 'ТЕСТ 8055312', category: 'Преоценка' },
  { sap_code: '70001', product_name: 'ТЕСТ 70001', category: 'Преоценка' },
  { sap_code: '70003', product_name: 'ПРЕОЦ.ТЕСТ 70003', category: 'Друга' },
  { sap_code: '90757', product_name: 'КАТАЛОГ 90757', category: 'Друга' },
  { sap_code: '55312', product_name: 'КАТАЛОГ 55312', category: 'Друга' }
];
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
    if (tbl === 'app_settings') return resp(200, [{ key: 'minus_stores', value: ST }]);
    if (tbl === 'minus_plants') return resp(200, [{ plant: '5540', store_name: ST }]);
    if (tbl === 'minus_reasons') return resp(200, REASONS);
    if (tbl === 'minus_uom_thresholds') return resp(200, []);
    if (tbl === 'minus_uploads') return resp(200, []);
    if (tbl === 'minus_movements') return resp(200, /offset=[1-9]/.test(q) ? [] : db.movs.map(x => Object.assign({}, x)));
    if (tbl === 'product_catalog') {
      if (db.cat === 'throw') return Promise.reject(new TypeError('Failed to fetch'));
      if (db.cat === '500') return resp(500, { message: 'boom' });
      const list = ((q.match(/sap_code=in\.\(([^)]*)\)/) || [])[1] || '').split(',').map(s => s.replace(/"/g, ''));
      return resp(200, CAT.filter(p => list.indexOf(p.sap_code) >= 0));
    }
    return resp(200, []);
  };
}
const MU = { email: 'managermontana@temax.bg', display_name: 'Управител Монтана', role: 'manager', store_name: ST };
const $ = (h, s) => h.w.document.querySelector(s);
const codesOf = h => Array.from(h.w.document.querySelectorAll('#mn-rev-ov tr.mn-rev-row')).map(tr => tr.getAttribute('data-code'));
const row = (h, c) => h.w.document.querySelector('#mn-rev-ov tr.mn-rev-row[data-code="' + c + '"]');
const preocOf = h => Array.from(h.w.document.querySelectorAll('#mn-rev-preoc .mn-rev-preoc-item')).map(s => s.getAttribute('data-code')).sort();
const J = x => JSON.stringify(x);
const KEEP = ['55312', '70002', '70010', '90757'];
const OUT = ['70001', '70003', '8055312', '8057488', '8090757'];

async function env(movs, cat) {
  const db = { movs: movs, cat: cat || 'ok', log: [] };
  const h = boot({ modules: ['revaluation.js', 'revisions.js', 'minusi.js'], user: MU, data: {} });
  install(h, db);
  await h.w.loadMinusi(); await ticks(6);
  return { h, db };
}
function xlsxMock(w) {
  const cap = { aoa: null, n: 0 };
  w.XLSX = {
    utils: { book_new: () => ({}), aoa_to_sheet: a => { cap.aoa = a; const ws = {}; a.forEach((r, i) => r.forEach((v, c) => { if (v != null) ws[String.fromCharCode(65 + c) + (i + 1)] = { t: 's', v }; })); return ws; }, book_append_sheet: () => {} },
    writeFile: () => { cap.n++; }
  };
  return cap;
}

(async function main() {
  section('1. Смесен обект — преглед');
  const { h, db } = await env(mixed());
  const b = $(h, '#mn-rev');
  ok('бутонът е активен', !!b && !b.disabled);
  realClick(h.w, b, 'Темплейт за ревизия');
  await ticks(6);
  ok('модалът е отворен', $(h, '#mn-rev-ov').classList.contains('open'));
  const codes = codesOf(h);
  ok('остават точно 55312, 70002, 70010, 90757 (в този ред)', J(codes) === J(KEEP), J(codes));
  ok('минус-преоценен без заметнат (8057488) → не влиза', codes.indexOf('8057488') < 0);
  ok('обикновен минус + преоценен заметнат: 55312 да, 8055312 не', codes.indexOf('55312') >= 0 && codes.indexOf('8055312') < 0);
  ok('преоценен минус + обикновен заметнат: 8090757 не, 90757 да', codes.indexOf('8090757') < 0 && codes.indexOf('90757') >= 0);
  ok('… 90757 е глава на своя група (не син)', !row(h, '90757').classList.contains('mn-rev-sub') && row(h, '90757').getAttribute('data-group') === '90757');
  ok('… „откъде е“: заметнат към 8090757', row(h, '90757').querySelector('.mn-rev-origin').textContent === 'заметнат към 8090757');
  ok('… описанието на 90757 — от каталога', row(h, '90757').querySelector('.mn-rev-desc').textContent === 'КАТАЛОГ 90757');
  ok('само по каталог (category): 70001 не влиза', codes.indexOf('70001') < 0);
  ok('само по каталог (product_name „ПРЕОЦ“): 70003 не влиза', codes.indexOf('70003') < 0);
  ok('само по описание (малки букви + интервал): 8090757 не влиза', codes.indexOf('8090757') < 0);
  const blk = $(h, '#mn-rev-preoc');
  ok('сив блок „Не влизат (преоценени)“ — видим', !!blk && /^Не влизат \(преоценени\): /.test(blk.textContent) && !/display:\s*none/.test(blk.getAttribute('style') || ''));
  ok('… в него точно преоценените', J(preocOf(h)) === J(OUT), J(preocOf(h)));
  ok('… „код — описание“', blk.textContent.indexOf('8057488 — ПРЕОЦ.ТЕСТ СТОКА') >= 0 && blk.textContent.indexOf('70003 — ПРЕОЦ.ТЕСТ 70003') >= 0 && blk.textContent.indexOf('8055312 — ТЕСТ 8055312') >= 0);
  ok('бутонът „📥 Свали Excel (4)“ — без преоценените', $(h, '#mn-rev-xlsx').textContent === '📥 Свали Excel (4)' && !$(h, '#mn-rev-xlsx').disabled, $(h, '#mn-rev-xlsx').textContent);
  ok('няма ред „каталогът не се зареди“', !$(h, '#mn-rev-catfail'));
  const cq = db.log.filter(x => x.tbl === 'product_catalog');
  ok('каталогът — една заявка с category за всички кодове', cq.length === 1 && /select=sap_code,product_name,category/.test(cq[0].q) &&
    KEEP.concat(OUT).every(c => cq[0].q.indexOf('"' + c + '"') >= 0), cq[0] && cq[0].q);

  section('2. Excel — истински клик');
  const cap = xlsxMock(h.w);
  realClick(h.w, $(h, '#mn-rev-xlsx'), 'Свали Excel');
  await ticks(4);
  ok('файлът е записан', cap.n === 1);
  ok('заглавен ред — 3 колони', J(cap.aoa[0]) === J(['Референция', 'SAP код', 'Преброено количество']));
  ok('всеки ред: ref | код | празно', cap.aoa.slice(1).every(r => r.length === 3 && r[0] === 'ref' && r[1] && r[2] == null));
  const xc = cap.aoa.slice(1).map(r => r[1]);
  ok('кодовете = прегледа, без преоценените', J(xc) === J(KEEP), J(xc));
  ok('нито един преоценен във файла', OUT.every(c => xc.indexOf(c) < 0));
  ok('каталогът не се пита втори път', db.log.filter(x => x.tbl === 'product_catalog').length === 1);
  ok('нищо не се записва в базата', db.log.filter(x => x.m !== 'GET').length === 0);

  section('3. Каталогът гърми — само по описание');
  for (const mode of ['throw', '500']) {
    const r = await env(mixed(), mode);
    realClick(r.h.w, $(r.h, '#mn-rev'), 'Темплейт за ревизия');
    await ticks(6);
    const c = codesOf(r.h);
    ok('„' + mode + '“: прегледът е отворен', $(r.h, '#mn-rev-ov').classList.contains('open'));
    ok('„' + mode + '“: по описание пак вън (8057488, 8090757)', c.indexOf('8057488') < 0 && c.indexOf('8090757') < 0 && J(preocOf(r.h)) === J(['8057488', '8090757']), J(preocOf(r.h)));
    ok('„' + mode + '“: по каталог не се разпознават (8055312, 70001, 70003 влизат)', ['8055312', '70001', '70003'].every(x => c.indexOf(x) >= 0), J(c));
    const cf = $(r.h, '#mn-rev-catfail');
    ok('„' + mode + '“: сив ред „Каталогът не се зареди — …само по описание“', !!cf && cf.textContent === 'Каталогът не се зареди — преоценените се разпознават само по описание');
    const cp = xlsxMock(r.h.w);
    realClick(r.h.w, $(r.h, '#mn-rev-xlsx'), 'Свали Excel');
    await ticks(6);
    ok('„' + mode + '“: Excel пак се сваля, = прегледа', cp.n === 1 && J(cp.aoa.slice(1).map(x => x[1])) === J(c));
  }

  section('4. Само преоценени по описание → бутонът е неактивен');
  seq = 0;
  const e4 = await env([mv('8057488', 'ПРЕОЦ.ТЕСТ'), mv('8092834', 'преоц.тест 2')]);
  const b4 = $(e4.h, '#mn-rev');
  ok('бутонът е неактивен', !!b4 && b4.disabled);
  ok('подсказка „няма минуси за ревизия“', $(e4.h, '#mn-rev-hint') && $(e4.h, '#mn-rev-hint').textContent === 'няма минуси за ревизия');
  ok('mnRevOpen не отваря', e4.h.w.mnRevOpen() === false && !$(e4.h, '#mn-rev-ov'));

  section('5. Само преоценени по каталог → празен преглед, неактивно');
  seq = 0;
  const e5 = await env([mv('70001', 'ТЕСТ 70001')]);
  ok('преди каталога бутонът е активен (описанието е обикновено)', !$(e5.h, '#mn-rev').disabled);
  realClick(e5.h.w, $(e5.h, '#mn-rev'), 'Темплейт за ревизия');
  await ticks(6);
  ok('след каталога — 0 реда, „няма минуси за ревизия“', codesOf(e5.h).length === 0 && !!$(e5.h, '#mn-rev-empty'));
  ok('70001 е в сивия блок', J(preocOf(e5.h)) === J(['70001']));
  ok('„📥 Свали Excel (0)“ е неактивен', $(e5.h, '#mn-rev-xlsx').disabled && $(e5.h, '#mn-rev-xlsx').textContent === '📥 Свали Excel (0)');
  ok('бутонът отвън вече е неактивен с подсказка', $(e5.h, '#mn-rev').disabled && $(e5.h, '#mn-rev-hint').textContent === 'няма минуси за ревизия' &&
    e5.h.w.document.querySelectorAll('#mn-rev').length === 1 && e5.h.w.document.querySelectorAll('#mn-rev-hint').length === 1);
  const c5 = xlsxMock(e5.h.w);
  await e5.h.w.mnRevDownload(); await ticks(2);
  ok('mnRevDownload не пише файл', c5.n === 0);

  report();
})().catch(e => { console.error(e); process.exit(1); });
