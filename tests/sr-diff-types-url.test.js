/* srLoadDiffTypes(): порции вместо един списък с id + грешката не се гълта.

   Класът на грешката е същият като при sdLoadSwaps (поправен с c8d0cd0):
   PostgREST филтър id=in.(id1,id2,…) расте с данните по ~37 знака на uuid,
   гейтуеят отсича дълъг адрес с 400 ПРЕДИ Postgres, а sbGet() връща [] и при
   грешка — тоест етикетът „⚠ решението е сменено" просто изчезва за всички
   редове и никой не разбира.

   Тук се заковават:
     - 1500 връзки → порции, всяка под 8000 знака, и НИТО едно id не се губи;
     - етикетът стига до екрана за реда със сменено решение;
     - провалена заявка → червен toast + console.error, нула етикети,
       но таблицата пак се рендира.

   Пускане:  node tests/sr-diff-types-url.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, btn, ticks } = H;

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: []
};

/* 1500 връщания от разлики, всяко със своя разлика. Първите две са специални:
   l-0 е със сменено решение (writein), l-1 още е „Връщане". */
const N = 1500;
const RETURNS = [];
const LINES = [];
for (let i = 0; i < N; i++) {
  const lineId = 'aaaaaaaa-bbbb-cccc-dddd-' + String(100000000000 + i);
  RETURNS.push({
    id: 'sr-' + i, store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    product_name: i === 0 ? 'СМЕНЕНО РЕШЕНИЕ' : (i === 1 ? 'ОЩЕ ВРЪЩАНЕ' : 'АРТИКУЛ ' + i),
    sap_code: '4716' + i, quantity: 2, purchase_order: '', id_euro: '', plant: '',
    doc_date: '2026-09-20', status: 'pending', withdrawal_date: null, courier_info: '',
    control_comment: '', controller_comment: '', reason: 'Излишък от разлика',
    source: 'diff', diff_line_id: lineId, photos: []
  });
  LINES.push({ id: lineId, type: i === 0 ? 'writein' : 'return' });
}

/* Отговорът съдържа САМО поисканите id-та — harness-ът иначе връща целия масив
   за таблицата независимо от филтъра, а тогава една успешна порция „запълва"
   картата и проверките за порциите мерят harness-а, не кода. */
const byUrl = (lines) => (url) => {
  const m = decodeURIComponent(String(url)).match(/id=in\.\(([^)]*)\)/);
  if (!m) return lines;
  const want = {};
  m[1].split(',').forEach(id => { want[id.trim()] = true; });
  return lines.filter(l => want[l.id]);
};

function env(opts) {
  opts = opts || {};
  const lines = opts.lines || LINES;
  const h = boot({
    modules: ['stock-returns.js'],
    user: CVETI, confirm: true, fail: opts.fail,
    data: {
      stock_returns: opts.returns || RETURNS,
      stock_differences: byUrl(lines),
      users: [], stores: [{ name: 'Раднево' }], contacts: []
    }
  });
  h.w.srTab = 'diff'; h.w.srFilter = 'all';
  return h;
}
const diffGets = h => h.calls.get.filter(u => /\/stock_differences\?/.test(u));
const toasts = h => h.calls.toast.map(t => String(t.msg || t));
const rowOf = (h, name) => Array.prototype.find.call(
  h.doc.querySelectorAll('#mod-stock-returns tr'), tr => tr.textContent.indexOf(name) >= 0);
const settle = async () => { for (let i = 0; i < 12; i++) await ticks(); };

(async function () {

  section('1. 1500 връзки → порции под 8000 знака, нито едно id не се губи');
  {
    const h = env();
    h.calls.get.length = 0;
    if (guard('loadStockReturns() не хвърля', () => h.w.loadStockReturns())) {
      await settle();
      const g = diffGets(h);
      if (ok('има заявки за типовете', g.length > 0, String(g.length))) {
        ok('повече от една порция (1500 id не се побират в една)', g.length > 1, 'порции: ' + g.length);
        const longest = g.reduce((m, u) => Math.max(m, u.length), 0);
        ok('най-дългият URL е под 8000 знака', longest < 8000, 'най-дълъг: ' + longest + ' знака, порции: ' + g.length);
        /* Нито едно id не бива да падне между порциите. */
        const seen = {};
        g.forEach(u => {
          const m = decodeURIComponent(u).match(/id=in\.\(([^)]*)\)/);
          if (m) m[1].split(',').forEach(id => { seen[id] = true; });
        });
        ok('всичките 1500 id-та са поискани', Object.keys(seen).length === N, String(Object.keys(seen).length));
        ok('всяка порция е най-много 100 id', g.every(u => {
          const m = decodeURIComponent(u).match(/id=in\.\(([^)]*)\)/);
          return m && m[1].split(',').length <= 100;
        }), 'порции: ' + g.length);
        ok('картата е пълна (1500 решения)', Object.keys(h.w.srDiffTypes).length === N, String(Object.keys(h.w.srDiffTypes).length));
      }
      ok('без червен toast', !toasts(h).some(t => /не се заредиха/.test(t)), JSON.stringify(toasts(h)));
    }
  }

  section('2. Етикетът стига до екрана');
  {
    const h = env();
    h.w.loadStockReturns();
    await settle();
    const r0 = rowOf(h, 'СМЕНЕНО РЕШЕНИЕ');
    if (ok('редът със сменено решение е на екрана', !!r0)) {
      ok('показва "⚠ решението е сменено"', !!r0.querySelector('[data-decision-changed]'), r0.textContent.slice(0, 120));
      ok('и НЕ показва бутон "Взета"', !btn(r0, 'Взета'));
    }
    const r1 = rowOf(h, 'ОЩЕ ВРЪЩАНЕ');
    if (ok('редът, който още е „Връщане", е на екрана', !!r1)) {
      ok('без флаг', !r1.querySelector('[data-decision-changed]'));
      ok('с бутон "Взета"', !!btn(r1, 'Взета'));
    }
  }

  section('3. Провалена заявка → червен toast, console.error, нула етикети');
  {
    const h = env({ fail: { GET: { status: 400, url: /stock_differences/, body: { message: 'URI too long' } } } });
    const errs = [];
    h.w.console.error = (m) => { errs.push(String(m)); };
    if (guard('loadStockReturns() не хвърля при 400', () => h.w.loadStockReturns())) {
      await settle();
      ok('червен toast за решенията', toasts(h).some(t => /Решенията по разликите не се заредиха/.test(t)), JSON.stringify(toasts(h).slice(-3)));
      ok('toast-ът казва колко порции са паднали', toasts(h).some(t => /пакета\)/.test(t)), JSON.stringify(toasts(h).slice(-3)));
      ok('console.error с URL и причина', errs.some(m => /srLoadDiffTypes/.test(m) && /400|URI too long/.test(m)), JSON.stringify(errs.slice(0, 2)));
      ok('картата е празна', Object.keys(h.w.srDiffTypes).length === 0);
      ok('нула етикети (по-добре без флаг, отколкото фалшив)',
        h.doc.querySelectorAll('[data-decision-changed]').length === 0);
      const r0 = rowOf(h, 'СМЕНЕНО РЕШЕНИЕ');
      ok('таблицата пак се рендира', !!r0 && !!btn(r0, 'Взета'), r0 ? r0.textContent.slice(0, 80) : 'няма ред');
    }
  }
  {
    /* Частичен провал: само първата порция пада. Останалите решения се пазят. */
    let n = 0;
    const h = env({ fail: { GET: (url) => /stock_differences/.test(url) && (n++ === 0) } });
    h.w.console.error = () => {};
    h.w.loadStockReturns();
    await settle();
    ok('частичен провал: червен toast', toasts(h).some(t => /Решенията по разликите не се заредиха/.test(t)), JSON.stringify(toasts(h).slice(-2)));
    ok('частичен провал: останалите порции са в картата',
      Object.keys(h.w.srDiffTypes).length > 0 && Object.keys(h.w.srDiffTypes).length < N,
      String(Object.keys(h.w.srDiffTypes).length));
  }
  {
    /* Нула връзки → нула заявки (и нула toast-ове). */
    const h = env({ returns: [Object.assign({}, RETURNS[0], { diff_line_id: null })] });
    h.calls.get.length = 0;
    h.w.loadStockReturns();
    await settle();
    ok('без diff_line_id → нула заявки за типовете', diffGets(h).length === 0, h.calls.get.join(' | '));
    ok('и нула toast-ове', !toasts(h).some(t => /не се заредиха/.test(t)));
  }

  report();
})();
