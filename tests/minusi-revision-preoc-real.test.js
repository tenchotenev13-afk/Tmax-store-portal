/* Минуси, темплейт за ревизия — обикновен минус, заметнат с ПРЕОЦЕНЕН код
   (17.11.2026, сесия minusi-rev-preoc-real; Миглена, решение на Тенчо).

   Ред минус, чийто заметнат код съдържа поне един преоценен (mnRevIsPreoc),
   НЕ влиза — нито материалът, нито заметнатите му, нито количеството. Същият
   код от друг, незасегнат ред влиза нормално (количеството — само от него).
   Преоценен минус + обикновен заметнат (8090757 / 90757) — както досега.
   Сивият блок: отделен ред „код — описание (заметнат с преоценен …)“. Каталогът
   гърми → заметнат код без описание не се познава → редът влиза, а сивият ред
   за каталога го казва.

   Фикстура (Монтана; каталог: 8055312 category 'Преоценка'):
     A 55312 → 8055312                 — засегнат, вън (1 БР)
     B 55312 без заметнат, 2 БР         — незасегнат → 55312 влиза с 2, брой 1
     C 55400 → „55312 и 8055312“        — засегнат: 55400 вън, 55312 НЕ става
                                          „заметнат към 55400“
     D 8090757 ПРЕОЦ. → 90757           — обратният: 8090757 вън, 90757 глава
     E 70010 обикновен                  — влиза

   Секции:
     1. преглед — истински клик: редове, количество, сив блок, брой в бутона;
     2. Excel — истински клик: 3 колони, ref, C;
     3. каталогът гърми — засегнатите влизат, сивият ред казва кои кодове;
     4. само засегнат ред → след каталога всичко неактивно.

   Мутационна проверка (17.11.2026) — всеки вариант пуснат и паднал:
     R1 засегнатият минус влиза (skip не се гледа)          → падат 10
     R2 влиза само заметнатият (материалът вън, заметнатите — не) → падат 2
     R3 количеството брои и засегнатия ред                  → падат 2
   Пускане: node tests/minusi-revision-preoc-real.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, section, report, ticks } = H;

const ST = 'Монтана';
let seq = 0;
function mv(material, desc, real, qty) {
  seq++;
  return { id: 'r' + String(seq).padStart(4, '0'), store_name: ST, plant: '5540', material: material,
    material_desc: desc, mvt_type: '955', qty: qty || 1, uom: 'БР', mat_doc: 'R' + String(seq).padStart(4, '0'),
    doc_item: '1', doc_year: 2026, posting_date: '2026-11-0' + Math.min(seq, 9), real_code: real || null, reason_id: 2,
    employee_name: 'Иван', note: null, action: null, filled_by: null, filled_at: null };
}
function base() {
  seq = 0;
  return [
    mv('55312', 'ТЕСТ 55312', '8055312'),
    Object.assign(mv('55312', 'ТЕСТ 55312', null, 2), { action: 'преброено' }),
    mv('55400', 'ТЕСТ 55400', '55312 и 8055312'),
    mv('8090757', 'ПРЕОЦ. ТЕСТ 8090757', '90757'),
    mv('70010', 'ТЕСТ 70010')
  ];
}
const CAT = [
  { sap_code: '8055312', product_name: 'ТЕСТ 8055312', category: 'Преоценка' },
  { sap_code: '90757', product_name: 'КАТАЛОГ 90757', category: 'Друга' }
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
const J = x => JSON.stringify(x);
const codesOf = h => Array.from(h.w.document.querySelectorAll('#mn-rev-ov tr.mn-rev-row')).map(tr => tr.getAttribute('data-code'));
const row = (h, c) => h.w.document.querySelector('#mn-rev-ov tr.mn-rev-row[data-code="' + c + '"]');
const cellOf = (h, c, cls) => row(h, c).querySelector('.' + cls).textContent.trim();
const hitOf = h => Array.from(h.w.document.querySelectorAll('#mn-rev-hit .mn-rev-hit-item')).map(s => s.getAttribute('data-code'));
const preocOf = h => Array.from(h.w.document.querySelectorAll('#mn-rev-preoc .mn-rev-preoc-item')).map(s => s.getAttribute('data-code')).sort();
async function env(movs, cat) {
  const db = { movs: movs, cat: cat || 'ok', log: [] };
  const h = boot({ modules: ['revaluation.js', 'revisions.js', 'minusi.js'], user: MU, data: {} });
  install(h, db);
  await h.w.loadMinusi(); await ticks(6);
  return { h, db };
}
function xlsxMock(w) {
  const cap = { aoa: null, ws: null, n: 0 };
  w.XLSX = {
    utils: { book_new: () => ({}), aoa_to_sheet: a => { cap.aoa = a; const ws = {}; a.forEach((r, i) => r.forEach((v, c) => { if (v != null) ws[String.fromCharCode(65 + c) + (i + 1)] = { t: typeof v === 'number' ? 'n' : 's', v }; })); cap.ws = ws; return ws; }, book_append_sheet: () => {} },
    writeFile: () => { cap.n++; }
  };
  return cap;
}

(async function main() {
  section('1. Преглед — истински клик');
  const { h, db } = await env(base());
  realClick(h.w, $(h, '#mn-rev'), 'Темплейт за ревизия');
  await ticks(6);
  ok('модалът е отворен', $(h, '#mn-rev-ov').classList.contains('open'));
  const codes = codesOf(h);
  ok('остават точно 55312, 70010, 90757', J(codes) === J(['55312', '70010', '90757']), J(codes));
  ok('засегнатият 55400 не влиза', codes.indexOf('55400') < 0);
  ok('преоцененият 8055312 не влиза', codes.indexOf('8055312') < 0);
  ok('55312 — само от незасегнатия ред: брой 1, „2 БР“', cellOf(h, '55312', 'mn-rev-n') === '1' && cellOf(h, '55312', 'mn-rev-qty') === '2 БР', cellOf(h, '55312', 'mn-rev-n') + ' / ' + cellOf(h, '55312', 'mn-rev-qty'));
  ok('55312 не е „заметнат към 55400“ (редът на 55400 е вън)', cellOf(h, '55312', 'mn-rev-origin') === 'минус', cellOf(h, '55312', 'mn-rev-origin'));
  ok('обратният случай: 90757 глава, „заметнат към 8090757“', !row(h, '90757').classList.contains('mn-rev-sub') && cellOf(h, '90757', 'mn-rev-origin') === 'заметнат към 8090757');
  const hb = $(h, '#mn-rev-hit');
  ok('сив ред „заметнат с преоценен“ — отделен от преоценените', !!hb && !!$(h, '#mn-rev-preoc') && hb !== $(h, '#mn-rev-preoc') && !$(h, '#mn-rev-preoc').contains(hb));
  ok('… в него 55312 и 55400', J(hitOf(h)) === J(['55312', '55400']), J(hitOf(h)));
  ok('… „55312 — ТЕСТ 55312 (заметнат с преоценен 8055312)“', hb && hb.textContent.indexOf('55312 — ТЕСТ 55312 (заметнат с преоценен 8055312)') >= 0, hb && hb.textContent);
  ok('… „55400 — ТЕСТ 55400 (заметнат с преоценен 8055312)“', hb && hb.textContent.indexOf('55400 — ТЕСТ 55400 (заметнат с преоценен 8055312)') >= 0);
  ok('преоценените — както досега (8055312, 8090757)', J(preocOf(h)) === J(['8055312', '8090757']), J(preocOf(h)));
  ok('„📥 Свали Excel (3)“', $(h, '#mn-rev-xlsx').textContent === '📥 Свали Excel (3)' && !$(h, '#mn-rev-xlsx').disabled, $(h, '#mn-rev-xlsx').textContent);
  const cq = db.log.filter(x => x.tbl === 'product_catalog');
  ok('каталогът пита и за кодовете на засегнатите редове', cq.length === 1 && ['55312', '55400', '8055312'].every(c => cq[0].q.indexOf('"' + c + '"') >= 0));

  section('2. Excel — истински клик');
  const cap = xlsxMock(h.w);
  realClick(h.w, $(h, '#mn-rev-xlsx'), 'Свали Excel');
  await ticks(4);
  ok('файлът е записан', cap.n === 1);
  ok('3 колони, ref', cap.aoa.every(r => r.length === 3) && cap.aoa.slice(1).every(r => r[0] === 'ref'));
  ok('редове: 55312 | 2, 70010 | 1, 90757 | празно', J(cap.aoa.slice(1)) === J([['ref', '55312', 2], ['ref', '70010', 1], ['ref', '90757', null]]), J(cap.aoa.slice(1)));
  ok('нищо не се записва в базата', db.log.filter(x => x.m !== 'GET').length === 0);

  section('3. Каталогът гърми — засегнатите не се познават');
  for (const mode of ['throw', '500']) {
    const r = await env(base(), mode);
    realClick(r.h.w, $(r.h, '#mn-rev'), 'Темплейт за ревизия');
    await ticks(6);
    const c = codesOf(r.h);
    ok('„' + mode + '“: 55312, 55400, 8055312 влизат', ['55312', '55400', '8055312'].every(x => c.indexOf(x) >= 0), J(c));
    ok('„' + mode + '“: 55312 = 3 БР от двата реда', cellOf(r.h, '55312', 'mn-rev-qty') === '3 БР');
    ok('„' + mode + '“: няма ред „заметнат с преоценен“', !$(r.h, '#mn-rev-hit'));
    const cf = $(r.h, '#mn-rev-catfail');
    ok('„' + mode + '“: сивият ред казва кой заметнат не се проверява', !!cf && cf.textContent.indexOf('Каталогът не се зареди') === 0 &&
      cf.textContent.indexOf('без описание в движенията (8055312) не могат да се проверят — редовете им влизат') > 0, cf && cf.textContent);
    ok('„' + mode + '“: 90757 (обикновен) не е в списъка', cf && cf.textContent.indexOf('90757') < 0);
  }

  section('4. Само засегнат ред → неактивно след каталога');
  seq = 0;
  const e4 = await env([mv('55312', 'ТЕСТ 55312', '8055312')]);
  ok('преди каталога бутонът е активен', !$(e4.h, '#mn-rev').disabled);
  realClick(e4.h.w, $(e4.h, '#mn-rev'), 'Темплейт за ревизия');
  await ticks(6);
  ok('0 реда, „няма минуси за ревизия“', codesOf(e4.h).length === 0 && !!$(e4.h, '#mn-rev-empty'));
  ok('55312 е в сивия ред', J(hitOf(e4.h)) === J(['55312']));
  ok('„📥 Свали Excel (0)“ неактивен', $(e4.h, '#mn-rev-xlsx').disabled && $(e4.h, '#mn-rev-xlsx').textContent === '📥 Свали Excel (0)');
  ok('бутонът отвън — неактивен', $(e4.h, '#mn-rev').disabled);
  const c4 = xlsxMock(e4.h.w);
  await e4.h.w.mnRevDownload(); await ticks(2);
  ok('mnRevDownload не пише файл', c4.n === 0);

  report();
})().catch(e => { console.error(e); process.exit(1); });
