/* „Стока на път" — ускоряване (04.11.2026): действие на ред без пълно
   презареждане, таблица на порции по 200, под-ред само на тесен екран,
   страници 0 и 1 едновременно. Кой какво вижда и правилата за статус — без
   промяна.

   Проверки:
     а) „✅ Прието" (реален клик) → 1 PATCH, 0 GET към goods_transit; редът
        показва новия статус; броячите се сменят;
     б) PATCH с грешка → червен toast, редът е непроменен, 0 GET;
     в) 450 реда → 200 <tr> с данни + „Покажи още 200"; клик → 400; още → 450 и
        бутонът изчезва; броячите през цялото време са за 450;
     г) смяна на чип → пак 200; действие на ред при показани 400 → остават 400;
     д) търсене по ред на позиция 300 → намира го;
     е) „Провери всички чакащи" хваща всички чакащи (450), не само показаните;
     ж) широк екран → без под-ред; тесен → с под-ред;
     з) loadTransit: страница 0 и 1 тръгват преди някоя да е върнала; редът в
        transitData е по страници, не по реда на пристигане; провалена
        страница 1 при пълна страница 0 → грешка, без непълна таблица.

   Мутационна проверка (04.11.2026, върху чист transit.js; чистият — exit 0):
     S1 loadTransit след PATCH в tMarkStatus             → ❌ а), г)
     S2 локално обновяване и при грешка                   → ❌ б)
     S3 броячите (чиповете) от показаните 200              → ❌ в)
     S4 под-редът винаги                                  → ❌ ж)
     S5 страниците последователно                          → ❌ з)
     S6 „Провери всички" само върху показаните 200         → ❌ е), е2)
   И шестте падат (exit 1) точно в секциите отдясно.

   Пускане:  node tests/transit-speed.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, ticks } = H;

const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис' };
const STORE = { email: 'radnevo@temax.bg', display_name: 'Раднево', role: 'manager', store_name: 'Раднево' };

function mkRows(n, over) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push(Object.assign({ id: 'g' + i, store_name: 'Раднево', supplier: 'Логистичен склад Търговище',
      direction: 'incoming', status: 'pending', purchase_doc: 'D' + i, position: '10', doc_date: '2026-10-20',
      material_code: 'M' + i, material_name: 'АРТ-' + String(i).padStart(4, '0'), ordered_qty: 1, unit: 'БР',
      reviewed_at: null, reviewed_by: null }, over || {}));
  }
  return out;
}
function env(user, rows, opts) {
  opts = opts || {};
  const h = boot({ modules: ['transport.js', 'client-orders.js', 'transit.js'], user, confirm: true,
    data: { goods_transit: [], stores: [], users: [] }, fail: opts.fail });
  if (opts.narrow) h.w.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {} });
  h.toasts = [];
  const t0 = h.w.toast;
  h.w.toast = (m, c) => { h.toasts.push({ m: String(m), c }); t0(m, c); };
  h.reloads = 0;
  const lt = h.w.loadTransit;
  h.w.loadTransit = function () { h.reloads++; };   /* пълното презареждане се брои, не се пуска */
  h.w.transitData = JSON.parse(JSON.stringify(rows));
  h.w.transitArchive = [];
  h.w.transitDir = 'all'; h.w.transitFilter = 'all'; h.w.transitStore = ''; h.w.transitSearch = '';
  h.w.renderTransit();
  h.realLoad = lt;
  return h;
}
const mod = h => h.doc.getElementById('mod-transit');
const dataRows = h => Array.from(mod(h).querySelectorAll('tbody tr')).filter(tr => !tr.classList.contains('tt-act-row'));
const chipN = (h, f) => { const c = mod(h).querySelector('[data-tt-f="' + f + '"] .chips-n'); return c ? +c.textContent : NaN; };
const gets = h => h.calls.get.filter(u => /goods_transit/.test(u));
const patches = h => h.calls.patch.filter(p => p.table === 'goods_transit');
const moreBtn = h => h.doc.getElementById('t-more');
/* Бутонът на ред по data-id — в реда (широк) или в под-реда (тесен). */
const rowBtn = (h, id, label) => Array.from(mod(h).querySelectorAll('button[data-id="' + id + '"]')).find(x => x.textContent.trim() === label) || null;
const settle = async () => { for (let i = 0; i < 20; i++) await ticks(3); };

(async function run() {

  section('а) „✅ Прието" → 1 PATCH, 0 GET; редът и броячите се сменят');
  {
    const h = env(ADMIN, mkRows(5));
    const pend0 = chipN(h, 'pending'), rec0 = chipN(h, 'received');
    const b = rowBtn(h, 'g2', '✅ Прието');
    if (ok('бутонът „✅ Прието" на ред 2', !!b)) {
      const g0 = gets(h).length;
      realClick(h.w, b, 'Прието');
      await settle();
      ok('точно 1 PATCH към goods_transit', patches(h).length === 1 && /id=eq\.g2/.test(patches(h)[0].url), JSON.stringify(patches(h).map(p => p.url)));
      ok('0 GET към goods_transit (без loadTransit)', gets(h).length === g0 && h.reloads === 0, gets(h).length + ' / reloads ' + h.reloads);
      const row = h.w.transitData.find(r => r.id === 'g2');
      ok('в transitData статусът е received', row.status === 'received', row.status);
      const tr2 = dataRows(h).find(x => /АРТ-0002/.test(x.textContent));
      ok('редът показва „✅ Прието"', !!tr2 && /✅ Прието/.test(tr2.querySelector('td:nth-child(5)').textContent), tr2 && tr2.textContent.slice(0, 160));
      ok('броячите: „Не доставени" −1, „Прието" +1', chipN(h, 'pending') === pend0 - 1 && chipN(h, 'received') === rec0 + 1,
        pend0 + '→' + chipN(h, 'pending') + ' / ' + rec0 + '→' + chipN(h, 'received'));
    }
  }

  section('б) PATCH с грешка → червен toast, редът непроменен, 0 GET');
  {
    const h = env(ADMIN, mkRows(5), { fail: { PATCH: /goods_transit/ } });
    const b = rowBtn(h, 'g3', '✅ Прието');
    if (ok('бутонът го има', !!b)) {
      realClick(h.w, b, 'Прието');
      await settle();
      const t = h.toasts.find(x => /НЕ е записан/.test(x.m));
      ok('червен toast', !!t && t.c === '#dc2626', h.toasts.map(x => x.m).join(' | '));
      ok('редът остава pending', h.w.transitData.find(r => r.id === 'g3').status === 'pending');
      ok('на екрана пак е „Не доставена" с бутона', /Не доставена/.test(dataRows(h).find(x => /АРТ-0003/.test(x.textContent)).textContent));
      ok('0 GET и без презареждане', gets(h).length === 0 && h.reloads === 0, gets(h).length + ' / ' + h.reloads);
    }
  }

  section('в) 450 реда: 200 → 400 → 450; броячите — за 450');
  {
    const h = env(ADMIN, mkRows(450));
    ok('200 <tr> с данни', dataRows(h).length === 200, dataRows(h).length);
    ok('бутон „Покажи още 200"', !!moreBtn(h) && /Покажи още 200/.test(moreBtn(h).textContent));
    ok('„Показани 200 от 450"', /Показани 200 от 450/.test(mod(h).textContent));
    ok('чип „Всички" = 450', chipN(h, 'all') === 450, chipN(h, 'all'));
    ok('чип „Не доставени" = 450', chipN(h, 'pending') === 450, chipN(h, 'pending'));
    realClick(h.w, moreBtn(h), 'още');
    ok('след клик — 400', dataRows(h).length === 400, dataRows(h).length);
    ok('бутонът казва „Покажи още 50"', !!moreBtn(h) && /Покажи още 50/.test(moreBtn(h).textContent), moreBtn(h) && moreBtn(h).textContent);
    ok('чиповете пак 450', chipN(h, 'all') === 450 && chipN(h, 'pending') === 450);
    realClick(h.w, moreBtn(h), 'още');
    ok('след втори клик — 450', dataRows(h).length === 450, dataRows(h).length);
    ok('бутонът изчезва', !moreBtn(h));
    ok('чиповете пак 450', chipN(h, 'all') === 450);
  }

  section('г) смяна на чип → пак 200; действие на ред при 400 → остават 400');
  {
    const h = env(ADMIN, mkRows(450));
    realClick(h.w, moreBtn(h), 'още');
    ok('400 показани', dataRows(h).length === 400);
    const chip = mod(h).querySelector('[data-tt-f="pending"]');
    realClick(h.w, chip, 'Не доставени');
    ok('след смяна на чипа — пак 200', dataRows(h).length === 200, dataRows(h).length);
    realClick(h.w, mod(h).querySelector('[data-tt-f="all"]'), 'Всички');
    realClick(h.w, moreBtn(h), 'още');
    ok('пак 400', dataRows(h).length === 400);
    const b = rowBtn(h, 'g351', '✅ Прието');
    if (ok('бутонът на ред 351 е на екрана', !!b)) realClick(h.w, b, 'Прието');
    await settle();
    ok('след „Прието" на ред 351 — остават 400', dataRows(h).length === 400, dataRows(h).length);
    ok('и без презареждане', h.reloads === 0);
  }

  section('д) търсене по ред на позиция 300 → намира го');
  {
    const h = env(ADMIN, mkRows(450));
    ok('АРТ-0300 не е на екрана в началото', !dataRows(h).some(x => /АРТ-0300/.test(x.textContent)));
    h.w.transitSearch = 'АРТ-0300'; h.w.renderTransit();
    ok('търсенето го намира', dataRows(h).length === 1 && /АРТ-0300/.test(dataRows(h)[0].textContent), dataRows(h).length);
  }

  section('е) „Провери всички чакащи" хваща всички 450, не само показаните');
  {
    const h = env(STORE, mkRows(450));
    const b = h.doc.getElementById('t-review-all');
    ok('бутонът казва 450', !!b && /\(450\)/.test(b.textContent), b && b.textContent);
    realClick(h.w, b, 'Провери всички');
    await settle();
    const ids = patches(h).map(p => (decodeURIComponent(p.url).match(/id=in\.\(([^)]*)\)/) || [])[1] || '').join(',').split(',').filter(Boolean);
    ok('5 пакета по ≤100', patches(h).length === 5, patches(h).length);
    ok('PATCH-ът покрива всички 450', ids.length === 450 && new Set(ids).size === 450, ids.length);
    ok('локално всичките 450 са проверени', h.w.transitData.every(r => !!r.reviewed_at));
    ok('0 GET и без презареждане', gets(h).length === 0 && h.reloads === 0);
  }

  section('е2) частична грешка: обновяват се само успешните пакети, червен toast с броя');
  {
    let k = 0;
    const h = env(STORE, mkRows(250), { fail: { PATCH: () => (++k === 2) } });   /* вторият пакет пада */
    realClick(h.w, h.doc.getElementById('t-review-all'), 'Провери всички');
    await settle();
    const done = h.w.transitData.filter(r => !!r.reviewed_at).length;
    ok('проверени са 150 (пакети 1 и 3)', done === 150, done);
    const t = h.toasts.find(x => /не се записаха/.test(x.m));
    ok('червен toast с броя (100 реда, 1 от 3 пакета)', !!t && t.c === '#dc2626' && /100 реда в 1 от 3 пакета/.test(t.m), t && t.m);
  }

  section('ж) широк екран → без под-ред; тесен → с под-ред');
  {
    const w = env(ADMIN, mkRows(10));
    ok('широк: няма tr.tt-act-row', w.doc.querySelectorAll('#mod-transit tr.tt-act-row').length === 0);
    const n = env(ADMIN, mkRows(10), { narrow: true });
    ok('тесен: по един под-ред на ред (10)', n.doc.querySelectorAll('#mod-transit tr.tt-act-row').length === 10,
      n.doc.querySelectorAll('#mod-transit tr.tt-act-row').length);
  }

  section('з) loadTransit: страници 0 и 1 едновременно, ред по страници');
  {
    const h = env(ADMIN, []);
    h.w.loadTransit = h.realLoad;
    const pending = [];
    const P0 = mkRows(1000).map(r => Object.assign(r, { id: 'p0-' + r.id }));
    const P1 = mkRows(300).map(r => Object.assign(r, { id: 'p1-' + r.id }));
    h.w.fetch = function (url, init) {
      const range = (init && init.headers && init.headers.Range) || '';
      return new Promise(res => pending.push({ range, res }));
    };
    const resp = (rows, total) => ({ ok: true, status: 206, headers: { get: k => /content-range/i.test(k) ? '0-0/' + total : null },
      json: () => Promise.resolve(rows) });
    h.w.loadTransit();
    await ticks(3);
    ok('и двете страници са поискани преди отговор', pending.length === 2 && pending.map(p => p.range).join(',') === '0-999,1000-1999',
      pending.map(p => p.range).join(','));
    /* Страница 1 отговаря ПЪРВА. */
    pending[1].res(resp(P1, 1300));
    await ticks(3);
    pending[0].res(resp(P0, 1300));
    await settle();
    ok('1300 реда', h.w.transitData.length === 1300, h.w.transitData.length);
    ok('първо страница 0, после 1', h.w.transitData[0].id === 'p0-g1' && h.w.transitData[999].id === 'p0-g1000' && h.w.transitData[1000].id === 'p1-g1',
      h.w.transitData[0] && h.w.transitData[0].id + ' / ' + (h.w.transitData[1000] && h.w.transitData[1000].id));
    ok('таблицата е нарисувана (200)', dataRows(h).length === 200, dataRows(h).length);

    /* Провалена страница 1 при пълна страница 0 → грешка, без непълна таблица. */
    const h2 = env(ADMIN, []);
    h2.w.loadTransit = h2.realLoad;
    const pend2 = [];
    h2.w.fetch = function (url, init) { return new Promise(res => pend2.push({ range: init.headers.Range, res })); };
    h2.w.loadTransit();
    await ticks(3);
    pend2[0].res(resp(P0, 1300));
    pend2[1].res({ ok: false, status: 500, headers: { get: () => null }, json: () => Promise.resolve({ message: 'boom' }) });
    await settle();
    ok('грешка вместо таблица', /Грешка/.test(mod(h2).textContent) && dataRows(h2).length === 0, mod(h2).textContent.slice(0, 80));

    /* Малък обект: страница 1 е извън данните (416) — НЕ е грешка. */
    const h3 = env(STORE, []);
    h3.w.loadTransit = h3.realLoad;
    const pend3 = [];
    h3.w.fetch = function (url, init) { return new Promise(res => pend3.push({ range: init.headers.Range, res })); };
    h3.w.loadTransit();
    await ticks(3);
    pend3[0].res(resp(mkRows(98), 98));
    pend3[1].res({ ok: false, status: 416, headers: { get: () => null }, json: () => Promise.resolve({ message: 'range' }) });
    await settle();
    ok('98 реда, без грешка', h3.w.transitData.length === 98 && !/Грешка/.test(mod(h3).textContent), h3.w.transitData.length);
  }

  report();
})();
