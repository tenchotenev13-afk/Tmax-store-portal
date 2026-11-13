/* Минуси, темплейт за ревизия — групи (13.11.2026, сесия minusi-rev-groups;
   искане на Теодор, решение на Тенчо).

   Прегледът: групи по кода на минуса (числово); в група — минусът, под него
   заметнатите му кодове (числово), в син цвят; между групите дебела линия.
   Описанието на заметнатите — от product_catalog.product_name при отваряне;
   липса / грешка → „—“, прегледът не спира. Excel — само новият ред: 3 колони,
   без празни редове, без цвят, без описание.

   Секции:
     1. ред на групите (минус с 2 заметнати; код, който е и минус, и заметнат;
        заметнат към два минуса), син цвят, разделител — истински клик;
     2. описанието от каталога; без име → „—“; заявката е само за липсващите;
     3. Excel — истински клик: 3 колони, без празни редове, всеки код веднъж,
        групиран ред;
     4. каталогът гърми (мрежа / 500) → прегледът се отваря, „—“.

   Мутационна проверка (13.11.2026) — всеки вариант пуснат и паднал:
     G1 старата подредба по код (sort на всички)            → пада 1, 3
     G2 без каталога (mnRevLoadDescs не пита)                → пада 2
     G3 празен ред между групите в mnRevAoa                  → пада 3
   Пускане: node tests/minusi-revision-groups.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, section, report, ticks } = H;

const GB = 'Габрово';
let seq = 0;
function mv(material, real, o) {
  seq++;
  return Object.assign({ id: 'g' + String(seq).padStart(4, '0'), store_name: GB, plant: '5530', material: material,
    material_desc: 'ТЕСТ ' + material, mvt_type: '955', qty: 1, uom: 'БР', mat_doc: 'G' + String(seq).padStart(4, '0'),
    doc_item: '1', doc_year: 2026, posting_date: '2026-11-0' + Math.min(seq, 9), real_code: real, reason_id: 2, employee_name: 'Иван',
    note: null, action: null, filled_by: null, filled_at: null }, o || {});
}
/* 60010 „60030 и 60020"  — минус с 2 заметнати
   60005 → 60010           — 60010 е и минус, и заметнат: глава на своя група
   60050 → 60040, 60001 → 60040 — заметнат към два минуса: под 60001
   Каталог: 60020, 60040 с име; 60030 — няма. */
function movs() {
  seq = 0;
  return [
    mv('60050', '60040'),
    mv('60010', '60030 и 60020'),
    mv('60005', '60010'),
    mv('60001', '60040')
  ];
}
const CAT = [{ sap_code: '60020', product_name: 'КАТАЛОГ 60020' }, { sap_code: '60040', product_name: 'КАТАЛОГ 60040' }];
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
    if (tbl === 'app_settings') return resp(200, [{ key: 'minus_stores', value: GB }]);
    if (tbl === 'minus_plants') return resp(200, [{ plant: '5530', store_name: GB }]);
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
const GBU = { email: 'managergabrovo@temax.bg', display_name: 'Управител Габрово', role: 'manager', store_name: GB };
const $ = (h, s) => h.w.document.querySelector(s);
const rowsOf = h => Array.from(h.w.document.querySelectorAll('#mn-rev-ov tr.mn-rev-row'));
const codesOf = h => rowsOf(h).map(tr => tr.getAttribute('data-code'));
const row = (h, c) => h.w.document.querySelector('#mn-rev-ov tr.mn-rev-row[data-code="' + c + '"]');
const desc = (h, c) => row(h, c).querySelector('.mn-rev-desc').textContent;
const origin = (h, c) => row(h, c).querySelector('.mn-rev-origin').textContent;
const J = x => JSON.stringify(x);
const ORDER = ['60001', '60040', '60005', '60010', '60020', '60030', '60050'];

async function env(cat) {
  const db = { movs: movs(), cat: cat || 'ok', log: [] };
  const h = boot({ modules: ['revaluation.js', 'revisions.js', 'minusi.js'], user: GBU, data: {} });
  install(h, db);
  await h.w.loadMinusi(); await ticks(6);
  realClick(h.w, $(h, '#mn-rev'), 'Темплейт за ревизия');
  await ticks(4);
  return { h, db };
}

(async function main() {
  section('1. Групи — ред, цвят, разделител');
  const { h, db } = await env();
  const codes = codesOf(h);
  ok('модалът е отворен', $(h, '#mn-rev-ov').classList.contains('open'));
  ok('ред: 60001, 60040 | 60005 | 60010, 60020, 60030 | 60050', J(codes) === J(ORDER), J(codes));
  ok('минус с 2 заметнати: 60010, под него 60020 и 60030 (числово)', codes.indexOf('60020') === codes.indexOf('60010') + 1 && codes.indexOf('60030') === codes.indexOf('60010') + 2);
  ok('60010 (и минус, и заметнат) — глава, веднъж', codes.filter(c => c === '60010').length === 1 && !row(h, '60010').classList.contains('mn-rev-sub') && row(h, '60010').getAttribute('data-group') === '60010');
  ok('… „откъде е": минус · заметнат към 60005', origin(h, '60010') === 'минус · заметнат към 60005', origin(h, '60010'));
  ok('60005 е сам в групата си', codes[codes.indexOf('60005') + 1] === '60010');
  ok('заметнат към два минуса → веднъж, под първия (60001)', codes.filter(c => c === '60040').length === 1 && codes.indexOf('60040') === codes.indexOf('60001') + 1 && row(h, '60040').getAttribute('data-group') === '60001');
  ok('… „заметнат към" и двата (60001, 60050)', /^заметнат към (60001, 60050|60050, 60001)$/.test(origin(h, '60040')), origin(h, '60040'));
  const subs = rowsOf(h).filter(tr => tr.classList.contains('mn-rev-sub')).map(tr => tr.getAttribute('data-code'));
  ok('сини са точно заметнатите', J(subs) === J(['60040', '60020', '60030']), J(subs));
  ok('синият цвят е на всяка клетка', ['60040', '60020', '60030'].every(c => Array.from(row(h, c).children).every(td => /color:#1d4ed8/.test(td.getAttribute('style') || ''))));
  ok('минусите не са сини', ['60001', '60005', '60010', '60050'].every(c => Array.from(row(h, c).children).every(td => !/#1d4ed8/.test(td.getAttribute('style') || ''))));
  const gs = rowsOf(h).filter(tr => tr.classList.contains('mn-rev-gstart')).map(tr => tr.getAttribute('data-code'));
  ok('разделител пред всяка група без първата', J(gs) === J(['60005', '60010', '60050']), J(gs));
  ok('… дебела линия на клетките', Array.from(row(h, '60010').children).every(td => /border-top:2px solid/.test(td.getAttribute('style') || '')));
  ok('колоните са същите 4', J(Array.from(h.w.document.querySelectorAll('#mn-rev-tbl th')).map(th => th.textContent)) === J(['Код', 'Описание', 'Откъде е', 'Брой минуси']));

  section('2. Описание от каталога');
  ok('минусът — от реда', desc(h, '60010') === 'ТЕСТ 60010');
  ok('заметнат с име в каталога → името', desc(h, '60020') === 'КАТАЛОГ 60020' && desc(h, '60040') === 'КАТАЛОГ 60040');
  ok('заметнат без име в каталога → „—“', desc(h, '60030') === '—');
  const cq = db.log.filter(x => x.tbl === 'product_catalog');
  ok('една заявка към каталога, само за липсващите', cq.length === 1 && /sap_code=in\.\(/.test(cq[0].q) &&
    ['60020', '60030', '60040'].every(c => cq[0].q.indexOf('"' + c + '"') >= 0) && ['60001', '60005', '60010', '60050'].every(c => cq[0].q.indexOf('"' + c + '"') < 0), cq[0] && cq[0].q);

  section('3. Excel');
  const cap = { aoa: null, ws: null, n: 0 };
  h.w.XLSX = {
    utils: {
      book_new: () => ({}),
      aoa_to_sheet: a => { cap.aoa = a; const ws = {}; a.forEach((r, i) => r.forEach((v, c) => { if (v != null) ws[String.fromCharCode(65 + c) + (i + 1)] = { t: typeof v === 'number' ? 'n' : 's', v }; })); cap.ws = ws; return ws; },
      book_append_sheet: () => {}
    },
    writeFile: () => { cap.n++; }
  };
  realClick(h.w, $(h, '#mn-rev-xlsx'), 'Свали Excel');
  await ticks(2);
  ok('файлът е записан', cap.n === 1);
  ok('заглавният ред както досега', J(cap.aoa[0]) === J(['Референция', 'SAP код', 'Преброено количество']));
  ok('точно 3 колони на всеки ред', cap.aoa.every(r => r.length === 3));
  ok('без празни редове', cap.aoa.slice(1).every(r => r[0] === 'ref' && typeof r[1] === 'string' && r[1] !== '' && r[2] == null));
  const xc = cap.aoa.slice(1).map(r => r[1]);
  ok('групиран ред = прегледа', J(xc) === J(ORDER), J(xc));
  ok('всеки код веднъж', new Set(xc).size === xc.length);
  ok('без описание в Excel', !J(cap.aoa).includes('КАТАЛОГ') && !J(cap.aoa).includes('ТЕСТ') && !J(cap.aoa).includes('—'));
  ok('нищо не се записва', db.log.filter(x => x.m !== 'GET').length === 0);

  section('4. Каталогът гърми');
  for (const mode of ['throw', '500']) {
    const r = await env(mode);
    ok('каталог „' + mode + '" → прегледът е отворен с всички кодове', $(r.h, '#mn-rev-ov').classList.contains('open') && J(codesOf(r.h)) === J(ORDER));
    ok('каталог „' + mode + '" → заметнатите са „—“', ['60020', '60030', '60040'].every(c => desc(r.h, c) === '—'));
    ok('каталог „' + mode + '" → бутонът за Excel е там', !!$(r.h, '#mn-rev-xlsx'));
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
