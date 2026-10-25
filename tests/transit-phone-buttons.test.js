/* „Стока на път": на тесен екран бутоните за действие се виждат без
   хоризонтално плъзгане (24.10.2026, Монтана, ~375px).

   ПОВОД. Таблицата е min-width 1060px и колоната „Действия" (✅ Прието /
   ✕ Неприето / ↩ Върни / ✏️ Редакция …) остава вдясно извън екрана.

   ИЗБОР. На тесен екран (matchMedia '(max-width:600px)' — прагът на бутоните
   в Товарни листи) колоната отпада, а бутоните отиват в пълноширок под-ред
   (tr.tt-act-row) веднага под реда, залепен вляво. Бутоните се сглобяват
   ВЕДНЪЖ — същият низ отива или в колоната, или в под-реда. Широк екран —
   същият markup като преди.

   jsdom не смята ширина и не изпълнява media queries — режимът се задава със
   stub на window.matchMedia, преди модулът да се отвори.

   ТВЪРДЕНИЯТА:
   · тесен: няма колона „Действия"; редът е с 5 клетки и без бутони; под него
     е tr.tt-act-row с ВСИЧКИ бутони на реда (трансфер, входящ, изходящ);
     onclick-ът на всеки бутон е същият като в широкия режим;
   · тесен: истински клик на „✅ Прието" в под-реда → PATCH status=received,
     „за получ." 2 → 1;
   · широк: колоната „Действия" е там, под-редове няма — както днес.

   МУТАЦИИ (пускани ръчно на 24.10.2026, всяка пада):
   M1 тесният режим не мести бутоните (transitNarrow() винаги false);
   M2 „✅ Прието" в под-реда вика друга функция.

   Пускане: node tests/transit-phone-buttons.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick } = H;

const STORE = 'Монтана';
const USER = { email: 'montana@temax.bg', display_name: 'Склад Монтана', role: 'manager', store_name: STORE, assigned_stores: [] };

function row(id, over) {
  return Object.assign({ id: id, purchase_doc: 'D-' + id, position: 10, doc_date: '2026-10-20', direction: 'transfer',
    supplier: 'Козлодуй', store_name: STORE, material_code: 'M' + id, material_name: 'АРТИКУЛ ' + id,
    ordered_qty: 1, unit: 'бр.', remaining_qty: null, status: 'sent', comment: null, transfer_date: null,
    reviewed_at: null, reviewed_by: null, created_at: '2026-10-20T08:00:00.000Z' }, over || {});
}
const ROWS = [
  row('in1', { supplier: 'Козлодуй' }),
  row('in2', { supplier: 'Търговище' }),
  row('out1', { supplier: STORE, store_name: 'Враца' }),
  row('inc1', { direction: 'incoming', supplier: 'ТЕСИ ООД', status: 'pending' })
];

function stubFetch(w, rows) {
  const db = rows.map(r => Object.assign({}, r));
  const patches = [];
  w.fetch = function (url, opts) {
    url = String(url);
    const method = (opts && opts.method) || 'GET';
    if (method === 'PATCH' && /goods_transit/.test(url)) {
      const m = url.match(/id=eq\.([^&]+)/);
      const body = JSON.parse(opts.body);
      patches.push({ id: m && decodeURIComponent(m[1]), body: body });
      db.forEach(r => { if (m && String(r.id) === decodeURIComponent(m[1])) Object.assign(r, body); });
      return Promise.resolve({ ok: true, status: 204, headers: { get: () => null },
        json: () => Promise.resolve(null), text: () => Promise.resolve('') });
    }
    const data = /goods_transit/.test(url) ? db.map(r => Object.assign({}, r)) : [];
    return Promise.resolve({ ok: true, status: 206,
      headers: { get: k => /content-range/i.test(k) ? ('0-' + Math.max(data.length - 1, 0) + '/' + data.length) : null },
      json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) });
  };
  return { db, patches };
}
async function open(narrow) {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'transit.js'],
    user: USER, confirm: true,
    data: { goods_transit: [], stores: [], users: [] }
  });
  h.stub = stubFetch(h.w, ROWS);
  h.w.requestAnimationFrame = function () { return 0; };
  h.w.scrollTo = function () {};
  h.w.matchMedia = q => ({ matches: !!narrow && /max-width:\s*600px/.test(q), media: q, addListener() {}, removeListener() {} });
  /* Всички редове — „Всички" / „Всички", без скока при влизане. */
  h.w.transitOpenFocusSkip = true;
  h.w.transitDir = 'all'; h.w.transitFilter = 'all';
  if (!guard('showModule(transit) не хвърля', () => h.w.showModule('transit'))) return null;
  for (let i = 0; i < 30; i++) await ticks();
  return h;
}
const mod = h => h.doc.getElementById('mod-transit');
const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
const ths = h => Array.from(mod(h).querySelectorAll('thead th')).map(txt);
const dataRow = (h, id) => Array.from(mod(h).querySelectorAll('tbody tr')).find(tr => !tr.classList.contains('tt-act-row') && txt(tr).indexOf('АРТИКУЛ ' + id + ' ') >= 0 || (!tr.classList.contains('tt-act-row') && txt(tr).indexOf('АРТИКУЛ ' + id + 'M') >= 0));
const btnsIn = el => el ? Array.from(el.querySelectorAll('button')) : [];
const sig = el => btnsIn(el).map(b => txt(b) + '|' + b.getAttribute('onclick') + '|' + (b.dataset.id || '')).join(' ; ');
const recvCount = h => { const b = Array.from(mod(h).querySelectorAll('button')).find(x => txt(x).indexOf('🔄 Трансфери') === 0); const m = b && txt(b).match(/\/ (\d+) за получ\./); return m ? +m[1] : -1; };

(async function () {

  /* Еталон — широкият режим: бутоните на всеки ред, както днес. */
  const wide = await open(false);
  const wideSig = {};
  section('1. Широк екран — както днес');
  if (wide) {
    ok('колоната „Действия" е там', ths(wide).join(',') === 'Документ · Дата,От → Към,Описание,Количество,Статус,Действия', ths(wide).join(','));
    ok('под-редове няма', !mod(wide).querySelector('tr.tt-act-row'));
    for (const id of ['in1', 'in2', 'out1', 'inc1']) {
      const tr = dataRow(wide, id);
      ok(id + ': 6 клетки, бутоните в шестата', !!tr && tr.cells.length === 6 && btnsIn(tr.cells[5]).length > 0, tr && tr.cells.length);
      wideSig[id] = tr ? sig(tr.cells[5]) : '';
    }
    ok('in1 има „✅ Прието" и „✕ Неприето"', /✅ Прието\|tMarkStatus\(this\.dataset\.id,'received'\)/.test(wideSig.in1) && /✕ Неприето/.test(wideSig.in1), wideSig.in1);
    ok('out1 има „↩ Върни"', /↩ Върни/.test(wideSig.out1), wideSig.out1);
    ok('inc1 има „👁 Проверено…" и „✏️ Редакция"', /👁 Проверено/.test(wideSig.inc1) && /✏️ Редакция/.test(wideSig.inc1), wideSig.inc1);
    wide.close();
  }

  section('2. Тесен екран — бутоните в под-реда, видими без плъзгане');
  const h = await open(true);
  if (h) {
    ok('колоната „Действия" я няма', ths(h).join(',') === 'Документ · Дата,От → Към,Описание,Количество,Статус', ths(h).join(','));
    for (const id of ['in1', 'in2', 'out1', 'inc1']) {
      const tr = dataRow(h, id);
      if (!ok(id + ': редът е там', !!tr)) continue;
      ok(id + ': 5 клетки и нито един бутон в реда', tr.cells.length === 5 && btnsIn(tr).length === 0, tr.cells.length + ' / ' + btnsIn(tr).length);
      const sub = tr.nextElementSibling;
      ok(id + ': веднага под него е tr.tt-act-row', !!sub && sub.classList.contains('tt-act-row'));
      ok(id + ': под-редът е на цялата ширина (colspan 5)', !!sub && sub.cells.length === 1 && sub.cells[0].colSpan === 5);
      const box = sub && sub.querySelector('.tt-act-phone');
      ok(id + ': бутоните са в залепената вляво кутия', !!box && /position:sticky/.test(box.getAttribute('style')) && /left:6px/.test(box.getAttribute('style')));
      ok(id + ': същите бутони, същите onclick и id като в широкия режим', !!box && sig(box) === wideSig[id], (box && sig(box)) + '  ≠  ' + wideSig[id]);
    }

    section('3. Истински клик на „✅ Прието" в под-реда');
    ok('преди клика „за получ." = 2', recvCount(h) === 2, recvCount(h));
    const sub = dataRow(h, 'in1').nextElementSibling;
    const b = btnsIn(sub).find(x => txt(x) === '✅ Прието');
    if (ok('бутонът „✅ Прието" на in1 е в под-реда', !!b)) {
      realClick(h.w, b);
      for (let i = 0; i < 30; i++) await ticks();
      ok('PATCH status=received за in1', h.stub.patches.length === 1 && h.stub.patches[0].id === 'in1' && h.stub.patches[0].body.status === 'received',
        JSON.stringify(h.stub.patches));
      ok('„за получ." = 1', recvCount(h) === 1, recvCount(h));
      ok('след презареждането пак е тесен изглед', !!mod(h).querySelector('tr.tt-act-row') && ths(h).indexOf('Действия') < 0);
    }
    h.close();
  }

  report();
})();
