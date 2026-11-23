/* Импорт на SAP каталога (admin.js → batchUpsertCatalog / startCatalogImport).
   23.11.2026 при ~108 хил. реда една порция от 500 падна с 57014 (statement
   timeout — anon е с 3s). Порция с 57014 или мрежова грешка се праща още
   веднъж на две половини (по 250); едва ако половинка падне, редовете ѝ се
   броят като незаписани. Друга HTTP грешка (напр. 409) — без повторен опит.
   Съобщението показва точния брой НЕзаписани редове, не „партиди от ~N".

   Fetch е мокнат: всяка POST заявка към product_catalog се записва с
   размера и SAP кодовете си; сценарият решава кои заявки падат.

   Пускане:  node tests/catalog-import-retry.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, section, report, ticks } = H;

const ADMIN = { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function rowsOf(n) {
  const out = [];
  for (let k = 0; k < n; k++) out.push({ sap_code: String(100000 + k), product_name: 'АРТ ' + k, default_unit: 'бр.' });
  return out;
}

/* decide(req) → 'ok' | '57014' | '409' | 'net'. req = {n, first, idx} */
function env(decide) {
  const h = boot({ modules: ['admin.js'], user: ADMIN, data: {} });
  const sent = [];
  h.w.fetch = function (url, init) {
    const body = JSON.parse(init.body);
    const req = { n: body.length, first: body[0].sap_code, codes: body.map(r => r.sap_code), idx: sent.length };
    const res = decide(req);
    req.res = res;
    sent.push(req);
    if (res === 'net') return Promise.reject(new TypeError('Failed to fetch'));
    if (res === 'ok') return Promise.resolve({ ok: true, status: 201, text: () => Promise.resolve('') });
    const err = res === '57014'
      ? { code: '57014', message: 'canceling statement due to statement timeout' }
      : { code: '23505', message: 'duplicate key value' };
    return Promise.resolve({ ok: false, status: res === '57014' ? 500 : 409, text: () => Promise.resolve(JSON.stringify(err)) });
  };
  h.w.console.error = () => {}; h.w.console.warn = () => {};
  h.sent = sent;
  return h;
}

function runUpsert(h, rows) {
  return new Promise(resolve => {
    const progress = [];
    h.w.batchUpsertCatalog(rows, (d, t, e) => progress.push([d, t, e]),
      (errorCount, firstError, failedRows) => resolve({ errorCount, firstError, failedRows, progress }));
  });
}

/* Колко пъти всеки SAP код е стигнал успешно до базата */
function okCount(sent) {
  const m = {};
  sent.filter(r => r.res === 'ok').forEach(r => r.codes.forEach(c => { m[c] = (m[c] || 0) + 1; }));
  return m;
}

(async function () {

  section('а) всичко OK → 0 грешки, порции по 500');
  {
    const h = env(() => 'ok');
    const r = await runUpsert(h, rowsOf(1234));
    ok('0 грешки', r.errorCount === 0, r.errorCount);
    ok('0 незаписани реда', r.failedRows === 0, r.failedRows);
    ok('3 заявки: 500 / 500 / 234', h.sent.map(x => x.n).join('/') === '500/500/234', h.sent.map(x => x.n).join('/'));
    ok('прогресът стига до 1234 / 1234', JSON.stringify(r.progress[r.progress.length - 1]) === '[1234,1234,0]');
  }

  section('б) порция 2 връща 57014, половинките минават → 0 грешки, всеки ред веднъж');
  {
    const h = env(req => (req.n === 500 && req.first === '100500') ? '57014' : 'ok');
    const rows = rowsOf(1234);
    const r = await runUpsert(h, rows);
    ok('0 грешки', r.errorCount === 0, r.errorCount);
    ok('0 незаписани реда', r.failedRows === 0, r.failedRows);
    ok('заявки: 500 / 500(57014) / 250 / 250 / 234',
      h.sent.map(x => x.n + (x.res === 'ok' ? '' : '!')).join('/') === '500/500!/250/250/234',
      h.sent.map(x => x.n + (x.res === 'ok' ? '' : '!')).join('/'));
    ok('първата половинка започва от реда на падналата порция', h.sent[2].first === '100500', h.sent[2].first);
    ok('втората половинка започва от средата', h.sent[3].first === '100750', h.sent[3].first);
    const m = okCount(h.sent);
    const all = rows.every(x => m[x.sap_code] === 1);
    ok('всичките 1234 реда са изпратени успешно ТОЧНО веднъж', all && Object.keys(m).length === 1234);
  }

  section('б2) нечетна последна порция (7 реда) с 57014 → 4 + 3');
  {
    const h = env(req => req.n === 7 ? '57014' : 'ok');
    const r = await runUpsert(h, rowsOf(507));
    ok('половинки 4 и 3', h.sent.slice(2).map(x => x.n).join('/') === '4/3', h.sent.map(x => x.n).join('/'));
    ok('0 незаписани', r.failedRows === 0 && r.errorCount === 0);
  }

  section('в) порцията и едната половинка падат → точният брой незаписани в съобщението');
  {
    /* Порция 1 (100000…) пада, втората ѝ половинка (100250…) също. */
    const h = env(req => (req.first === '100000' && req.n === 500) || req.first === '100250' ? '57014' : 'ok');
    const r = await runUpsert(h, rowsOf(1234));
    ok('1 грешка (по порция)', r.errorCount === 1, r.errorCount);
    ok('250 незаписани реда', r.failedRows === 250, r.failedRows);
    ok('първата грешка носи 57014', String(r.firstError).indexOf('57014') >= 0);
  }

  section('в2) цял импорт през бутона: порцията и първата половинка падат');
  {
    const h = env(req => req.first === '100500' ? '57014' : 'ok');
    const { w, doc } = h;
    let loaded = 0;
    w.loadCatalogAdmin = () => { loaded++; };
    w.openCatalogImportModal();
    const csv = 'Материал;Описание на Материал;БМЕ\n' +
      rowsOf(1234).map(x => x.sap_code + ';' + x.product_name + ';БР').join('\n');
    const file = new w.File([csv], 'ZMATERIALS.csv', { type: 'text/csv' });
    Object.defineProperty(doc.getElementById('catalog-file-inp'), 'files', { value: [file] });
    realClick(w, [...doc.querySelectorAll('#catalog-import-ov button')].find(b => /Започни импорт/.test(b.textContent)), 'Започни импорт');
    for (let k = 0; k < 60 && !loaded; k++) { await new Promise(r => setTimeout(r, 10)); await ticks(); }
    const txt = doc.getElementById('catalog-import-progress').textContent;
    ok('импортът стигна до края (loadCatalogAdmin)', loaded === 1, loaded);
    ok('CSV-то е разпознато (1234 реда в заявките)', h.sent.filter(x => x.res === 'ok').reduce((s, x) => s + x.n, 0) === 984, h.sent.map(x => x.n).join('/'));
    ok('съобщението: „250 от 1234 реда не са записани"', txt.indexOf('250 от 1234 реда не са записани') >= 0, txt);
    ok('съобщението казва, че повторното пускане само обновява', txt.indexOf('повторното пускане само обновява') >= 0, txt);
    ok('без старото „партиди от общо ~"', txt.indexOf('партиди от общо') < 0, txt);
  }

  section('г) мрежова грешка → повторен опит на половинки');
  {
    const h = env(req => (req.n === 500 && req.first === '100000') ? 'net' : 'ok');
    const r = await runUpsert(h, rowsOf(1000));
    ok('0 грешки след половинките', r.errorCount === 0 && r.failedRows === 0, r.errorCount + '/' + r.failedRows);
    ok('заявки: 500(net) / 250 / 250 / 500', h.sent.map(x => x.n + (x.res === 'ok' ? '' : '!')).join('/') === '500!/250/250/500',
      h.sent.map(x => x.n + (x.res === 'ok' ? '' : '!')).join('/'));
  }

  section('г2) мрежова грешка и на двете половинки → 500 незаписани');
  {
    const h = env(req => req.first === '100000' || req.first === '100250' ? 'net' : 'ok');
    const r = await runUpsert(h, rowsOf(1000));
    ok('1 грешка, 500 незаписани', r.errorCount === 1 && r.failedRows === 500, r.errorCount + '/' + r.failedRows);
    ok('firstError е мрежовата', /Failed to fetch/.test(String(r.firstError)), r.firstError);
  }

  section('д) друга HTTP грешка (409) → БЕЗ повторен опит');
  {
    const h = env(req => req.first === '100000' ? '409' : 'ok');
    const r = await runUpsert(h, rowsOf(1000));
    ok('само 2 заявки (без половинки)', h.sent.length === 2, h.sent.map(x => x.n).join('/'));
    ok('1 грешка, 500 незаписани', r.errorCount === 1 && r.failedRows === 500, r.errorCount + '/' + r.failedRows);
  }

  report();
})();
