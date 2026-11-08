/* Администрация → „SAP каталог“ → „💶 Цени (VKP2)“ (06.11.2026, сесия
   sap-prices-vkp2). Истински .xlsx през SheetJS (node_modules/xlsx, същият dist
   като в портала), истински клик по бутона и change на файловото поле.

   Заковано:
     1. колоните — по име (разбъркан ред); VKP0 срещу VKA0;
     2. няколко периода → валидният днес с най-късно „Валиден от“; точно днес
        (от / до) — да; бъдещ / изтекъл → не (брои се „без валидна цена днес“);
     3. цена = Сума / Ценова единица (≠ 1); дати като Excel дати, вкл. 31.12.9999,
        и като текст;
     4. запис само през rpc/catalog_set_sale_prices, по порции; непознат
        материал → пропуснат и броен (НЕ се създава); нито един POST/PATCH към
        product_catalog;
     5. липсваща колона → грешка, нула заявки;
     6. паднала порция → червено и брой незаписани, НЕ „Готово“;
     7. бутонът — само за admin; редът „Цени: обновени …“.

   Мутационна проверка (06.11.2026) — всеки вариант пуснат и паднал:
     P1 без филтъра VKP0 (и VKA0 влиза)                 → пада
     P2 при няколко периода — първият, не най-късният    → пада
     P3 без проверката „до ≥ днес“ (изтеклият влиза)     → пада
     P4 цена = Сума (без делене на Ценова единица)       → пада
     P5 паднала порция се брои като успех                → пада
     P6 липсваща колона не спира импорта                  → пада
   Пускане:  node tests/sap-prices-vkp2.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, ok, section, report, ticks } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const XLSX_SRC = fs.readFileSync(path.join(ROOT, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'), 'utf8');
const NX = require(path.resolve(ROOT, 'node_modules', 'xlsx'));
const TODAY = '2026-11-06';
const ADMIN = { id: 'u-a', email: 'ten.tenev@temax.bg', display_name: 'Тенчо Тенев', role: 'admin', store_name: 'Централен офис' };
const ACC = { id: 'u-c', email: 'acc@temax.bg', display_name: 'Счетоводство', role: 'accounting', store_name: 'Централен офис' };
const CATALOG = ['10001', '10002', '10003', '10004', '10005', '10006', '10007', '10008', '10009'];

/* Заглавията — в разбъркан ред спрямо истинския VKP2 (колоните са по име). */
const HEAD = ['Описание на материал', 'Вид условие', 'Ед. за измерв. прод.', 'Сума', 'Търг. организация', 'Канал за дистрибуция',
  'Завод', 'Вид ценоразпис', 'Валута на документ', 'Валидна до', 'Валиден от', 'Валута', 'Единица на условие', 'Ценова единица',
  'Материал', 'Таблица', 'Ниво на калкулация', 'Източн', 'Промоция', 'Индекс'];
const D = (y, m, d) => new Date(y, m - 1, d);
const END = D(9999, 12, 31);
function row(mat, kind, sum, per, unit, from, to) {
  const o = { 'Материал': mat, 'Описание на материал': 'АРТ ' + mat, 'Ед. за измерв. прод.': unit, 'Сума': sum, 'Търг. организация': 5500,
    'Канал за дистрибуция': 10, 'Завод': 5502, 'Вид ценоразпис': '', 'Валута на документ': 'EUR', 'Валиден от': from, 'Валидна до': to,
    'Валута': 'EUR', 'Ценова единица': per, 'Единица на условие': unit, 'Вид условие': kind, 'Таблица': 'A073',
    'Ниво на калкулация': '', 'Източн': '', 'Промоция': '', 'Индекс': '' };
  return HEAD.map(h => o[h]);
}
const ROWS = [
  row(10001, 'VKP0', 12.5, 1, 'ST', D(2026, 1, 1), END),          /* → 12.5 */
  row(10001, 'VKA0', 99, 1, 'ST', D(2026, 1, 1), END),            /* VKA0 — не */
  row(10002, 'VKP0', 9, 1, 'ST', D(2025, 1, 1), D(2025, 12, 31)), /* изтекъл */
  row(10002, 'VKP0', 10, 1, 'ST', D(2026, 1, 1), END),            /* по-ранен валиден — не (стои ПРЕДИ) */
  row(10002, 'VKP0', 11, 1, 'ST', D(2026, 10, 1), END),           /* най-късен валиден → 11 */
  row(10002, 'VKP0', 10.5, 1, 'ST', D(2026, 3, 1), END),          /* по-ранен, но по-долу — не */
  row(10003, 'VKP0', 5, 1, 'ST', D(2026, 12, 1), END),            /* само бъдещ → без цена */
  row(10004, 'VKP0', 5, 1, 'ST', D(2024, 1, 1), D(2026, 11, 5)),  /* изтекъл вчера → без цена */
  row(10005, 'VKP0', 250, 100, 'M', D(2026, 1, 1), END),          /* 250 / 100 → 2.5 */
  row(10006, 'VKA0', 7, 1, 'ST', D(2026, 1, 1), END),             /* само VKA0 → нищо */
  row(99999, 'VKP0', 3, 1, 'ST', D(2026, 1, 1), END),             /* непознат */
  row('10007', 'VKP0', '4,75', 1, 'ST', '01.03.2026', '31.12.9999'), /* текстови дати и запетая */
  row(10008, 'VKP0', 8, 1, 'ST', D(2026, 11, 6), END),            /* от = днес → да */
  row(10009, 'VKP0', 9, 1, 'ST', D(2026, 1, 1), D(2026, 11, 6))   /* до = днес → да */
];
function xlsxBuf(head, rows) {
  const ws = NX.utils.aoa_to_sheet([head].concat(rows), { cellDates: true });
  const wb = NX.utils.book_new(); NX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return NX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function install(h, db) {
  h.w.fetch = function (url, init) {
    const m = ((init && init.method) || 'GET').toUpperCase();
    const u = String(url);
    const q = decodeURIComponent(u.split('?')[1] || '');
    const body = init && init.body ? JSON.parse(init.body) : null;
    db.log.push({ m, u, q, body });
    const resp = (status, b, hdr) => {
      const t = b == null ? '' : JSON.stringify(b);
      return Promise.resolve({ ok: status < 300, status, headers: { get: k => (hdr || {})[String(k).toLowerCase()] || null },
        json: () => t ? Promise.resolve(JSON.parse(t)) : Promise.reject(new SyntaxError('empty')), text: () => Promise.resolve(t) });
    };
    if (/\/rpc\/catalog_set_sale_prices/.test(u)) {
      db.rpc++;
      if (db.failCall && db.rpc === db.failCall) return resp(500, { message: 'порция падна' });
      const rows = body.p_rows || [];
      const known = rows.filter(r => CATALOG.indexOf(r.sap_code) >= 0);
      known.forEach(r => { db.prices[r.sap_code] = r; });
      return resp(200, { updated: known.length, unknown: rows.filter(r => CATALOG.indexOf(r.sap_code) < 0).map(r => r.sap_code) });
    }
    if (/\/product_catalog/.test(u)) {
      if (m === 'HEAD') return resp(200, null, { 'content-range': /sale_price_uploaded_at=eq/.test(q) ? '0-0/' + Object.keys(db.prices).length : '0-0/107213' });
      if (m === 'GET' && /sale_price_uploaded_at=not\.is\.null/.test(q)) return resp(200, db.statAt ? [{ sale_price_uploaded_at: db.statAt }] : []);
      if (m === 'GET') return resp(200, [{ sap_code: '10001' }]);
      return resp(405, { message: 'product_catalog се пише само през rpc' });
    }
    return resp(200, []);
  };
}
function env(user, o) {
  o = o || {};
  const h = boot({ modules: ['admin.js'], user, data: {} });
  h.w.eval(XLSX_SRC);
  h.w.today = () => TODAY;
  const db = { log: [], rpc: 0, prices: {}, failCall: o.failCall || 0, statAt: o.statAt || null };
  install(h, db);
  if (o.batch) h.w.VKP_BATCH = o.batch;
  return { h, db };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function settle(h) { for (let i = 0; i < 6; i++) { await wait(20); await ticks(); } }
async function upload(h, buf, name) {
  const btn = h.doc.getElementById('vkp-btn');
  realClick(h.w, btn, '💶 Цени (VKP2)');
  const inp = h.doc.getElementById('vkp-file');
  const file = new h.w.File([new Uint8Array(buf)], name || 'VKP2.XLSX');
  Object.defineProperty(inp, 'files', { value: [file], configurable: true });
  fire(h.w, inp, 'change');
  for (let i = 0; i < 200; i++) { await wait(15); if (h.w.vkpLastReport && !h.w.vkpBusy) break; if (h.doc.getElementById('vkp-error')) break; }
  await settle(h);
}
const txt = (h, id) => { const e = h.doc.getElementById(id); return e ? e.textContent : null; };
const catWrites = db => db.log.filter(x => /\/product_catalog/.test(x.u) && x.m !== 'GET' && x.m !== 'HEAD');

(async function run() {
  section('1. Пълен импорт — admin, истински файл и клик');
  {
    const { h, db } = env(ADMIN, { batch: 3 });
    h.w.loadCatalogAdmin(); await settle(h);
    ok('бутонът „💶 Цени (VKP2)“ е в картата', !!h.doc.getElementById('vkp-btn') && txt(h, 'vkp-btn') === '💶 Цени (VKP2)');
    await upload(h, xlsxBuf(HEAD, ROWS));
    const p = db.prices;
    ok('VKP0, не VKA0: 10001 → 12.5', p['10001'] && p['10001'].price === 12.5, JSON.stringify(p['10001']));
    ok('10006 (само VKA0) — не е пипнат', !p['10006']);
    ok('няколко периода → валидният днес с най-късно „Валиден от“: 10002 → 11 от 2026-10-01', p['10002'] && p['10002'].price === 11 && p['10002'].valid_from === '2026-10-01', JSON.stringify(p['10002']));
    ok('само бъдещ (10003) → не', !p['10003']);
    ok('изтекъл вчера (10004) → не', !p['10004']);
    ok('Ценова единица 100: 250 / 100 → 2.5, единица M', p['10005'] && p['10005'].price === 2.5 && p['10005'].unit === 'M', JSON.stringify(p['10005']));
    ok('текстови дати и „4,75“ → 4.75 от 2026-03-01', p['10007'] && p['10007'].price === 4.75 && p['10007'].valid_from === '2026-03-01', JSON.stringify(p['10007']));
    ok('„Валиден от“ = днес → да', !!p['10008']);
    ok('„Валидна до“ = днес → да', !!p['10009']);
    ok('31.12.9999 като Excel дата се чете (10001 е валиден)', !!p['10001']);
    const sent = db.log.filter(x => /rpc\/catalog_set_sale_prices/.test(x.u));
    ok('запис само през rpc, по порции (7 реда по 3 → 3 заявки)', sent.length === 3 && sent.every(x => x.m === 'POST'), sent.length);
    ok('всяка порция носи едно и също p_uploaded_at', new Set(sent.map(x => x.body.p_uploaded_at)).size === 1);
    ok('редът към rpc: sap_code, price, unit, valid_from', sent[0] && Object.keys(sent[0].body.p_rows[0]).sort().join(',') === 'price,sap_code,unit,valid_from');
    ok('нито един POST / PATCH към product_catalog', catWrites(db).length === 0, JSON.stringify(catWrites(db).map(x => x.m)));
    ok('прочетени редове 14', txt(h, 'vkp-r-read') === 'Прочетени редове: 14', txt(h, 'vkp-r-read'));
    ok('VKP0 — 12', txt(h, 'vkp-r-vkp0') === 'VKP0: 12', txt(h, 'vkp-r-vkp0'));
    ok('обновени цени — 6 (7 избрани минус непознатия)', txt(h, 'vkp-r-updated') === 'Обновени цени: 6', txt(h, 'vkp-r-updated'));
    ok('без валидна цена днес — 2 (10003, 10004)', txt(h, 'vkp-r-novalid') === 'Без валидна цена днес: 2', txt(h, 'vkp-r-novalid'));
    ok('непознати — 1, с кода 99999', /Непознати материали \(няма ги в каталога\): 1 — 99999/.test(txt(h, 'vkp-r-unknown') || ''), txt(h, 'vkp-r-unknown'));
    ok('грешки — 0', txt(h, 'vkp-r-errors') === 'Грешки: 0', txt(h, 'vkp-r-errors'));
    ok('„✅ Готово“, без червено', !!h.doc.getElementById('vkp-done') && !h.doc.getElementById('vkp-error'));
    h.close();
  }

  section('2. Липсваща колона → грешка, нищо не се пише');
  {
    const { h, db } = env(ADMIN);
    h.w.loadCatalogAdmin(); await settle(h);
    const cut = HEAD.indexOf('Ценова единица');
    await upload(h, xlsxBuf(HEAD.filter((_, i) => i !== cut), ROWS.map(r => r.filter((_, i) => i !== cut))));
    ok('червена грешка „Липсва колона: Ценова единица“', (txt(h, 'vkp-error') || '').indexOf('Липсва колона: Ценова единица') >= 0, txt(h, 'vkp-error'));
    ok('нула заявки към rpc', db.rpc === 0);
    ok('нито „Готово“', !h.doc.getElementById('vkp-done'));
    h.close();
  }

  section('3. Паднала порция → червено и брой незаписани');
  {
    const { h, db } = env(ADMIN, { batch: 3, failCall: 2 });
    h.w.loadCatalogAdmin(); await settle(h);
    await upload(h, xlsxBuf(HEAD, ROWS));
    ok('трите порции са опитани', db.rpc === 3, db.rpc);
    ok('червено „Незаписани 3 цени (1 порции с грешка)“', (txt(h, 'vkp-error') || '').indexOf('Незаписани 3 цени (1 порции с грешка)') >= 0, txt(h, 'vkp-error'));
    ok('НЕ „Готово“', !h.doc.getElementById('vkp-done'));
    ok('в отчета грешките са червени и с текста', /3 незаписани \(порция падна\)/.test(txt(h, 'vkp-r-errors') || '') && /dc2626/.test(h.doc.getElementById('vkp-r-errors').getAttribute('style') || ''), txt(h, 'vkp-r-errors'));
    ok('обновени — само от минаналите порции (4 от познатите)', txt(h, 'vkp-r-updated') === 'Обновени цени: 4', txt(h, 'vkp-r-updated'));
    ok('червен тоаст', h.calls.toast.some(t => /частично/.test(t)));
    h.close();
  }

  section('4. Кой вижда бутона; редът „Цени: обновени …“');
  {
    const at = '2026-11-06T13:05:00.000Z';
    const { h, db } = env(ADMIN, { statAt: at });
    db.prices = { a: 1, b: 1, c: 1 };
    h.w.loadCatalogAdmin(); await settle(h);
    const d = new Date(at), pad = n => String(n).padStart(2, '0');
    const want = 'Цени: обновени ' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ', 3 артикула';
    ok('admin: „' + want + '“', txt(h, 'vkp-stat') === want, txt(h, 'vkp-stat'));
    h.close();
    const e2 = env(ACC);
    e2.h.w.loadCatalogAdmin(); await settle(e2.h);
    ok('accounting: без бутон', !e2.h.doc.getElementById('vkp-btn'));
    const r = await e2.h.w.vkpImportAoa([HEAD].concat(ROWS), 'x');
    ok('accounting: пряко извикване → нищо, нула заявки', r === null && e2.db.rpc === 0);
    e2.h.close();
  }

  report();
})();
