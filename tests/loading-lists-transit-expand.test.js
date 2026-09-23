/* Товарни листи — документите от „Стока на път" в редактора: какво има в
   документа ПРЕДИ отмятане, копие на артикулите при отмятане, търсене.

   Складът искаше да види съдържанието на документа, преди да го отметне.
   Дотук то се виждаше чак след отмятане и отделен бутон на реда.

   Тихите грешки, които се пазят тук:
     · „10" преди „2" — position е ТЕКСТ в goods_transit;
     · повторно отмятане ДУБЛИРА артикулите вместо да ги вземе наново;
     · документ върху палети 1-3 копира стоката в ТРИТЕ реда — утроено
       количество в описите и в писмото до обекта;
     · търсенето пренарежда списъка, а чекбоксът отмята ДРУГ документ —
       индексът в показания списък не е индексът в llPendingDocs;
     · чиповете по обект изчезват при един обект (правило 11);
     · паднала ВТОРА страница изглежда като „край на данните" — документ с
       половин съдържание, без да личи.

   Пускане:  node tests/loading-lists-transit-expand.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, fire, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };

let rid = 0;
function tr(doc, store, pos, code, name, qty, unit, date) {
  return { id: 'gt-' + String(++rid).padStart(6, '0'), purchase_doc: doc, store_name: store,
           supplier: WH, status: 'pending', position: String(pos), material_code: code,
           material_name: name, ordered_qty: qty, unit: unit || 'бр.',
           doc_date: date || '2026-08-20', created_at: '2026-09-01T05:50:00.000Z' };
}
/* Документ 4600100 за Петрич — позициите нарочно разбъркани и с „10". */
const BASE = [
  tr('4600100', 'Петрич', 10, 'A10', 'ДЕСЕТИ', 10),
  tr('4600100', 'Петрич', 2,  'A2',  'ВТОРИ', 2),
  tr('4600100', 'Петрич', 1,  'A1',  'ПЪРВИ', 1.5, 'кв.м'),
  tr('4600200', 'Гоце Делчев', 1, 'B1', 'ГД ЕДНО', 7, 'бр.', '2026-08-24'),
  tr('4700300', 'Петрич', 1, 'C1', 'ТРЕТИ ДОКУМЕНТ', 3, 'бр.', '2026-08-10')
];

function env(opts) {
  opts = opts || {};
  const rows = opts.rows || BASE;
  const h = boot({
    modules: ['transport.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js', 'loading.js'],
    user: WAREHOUSE, confirm: opts.confirm !== undefined ? opts.confirm : true,
    fail: opts.fail,
    data: {
      /* Страниците са истински: limit/offset се спазват, иначе тестът за
         >1000 реда би минавал и без втората заявка. */
      /* Блокът „Документи от Стока на път" е зад app_settings
         'loading_transit_docs' (по подразбиране ИЗКЛЮЧЕН). Този тест описва
         включения блок, затова флагът е изричен. Изключеното състояние е
         в loading-transit-toggle.test.js. */
      app_settings: [{ key: 'loading_transit_docs', value: 'on' }],
      goods_transit: function (url) {
        const u = new URL(url);
        const sp = u.searchParams;
        let r = rows.slice();
        const sup = sp.get('supplier'); if (sup) r = r.filter(x => 'eq.' + x.supplier === sup);
        const st = sp.get('status'); if (st) r = r.filter(x => 'eq.' + x.status === st);
        if ((sp.get('order') || '') === 'id.asc') r.sort((a, b) => a.id < b.id ? -1 : 1);
        const off = parseInt(sp.get('offset') || '0', 10), lim = parseInt(sp.get('limit') || '100000', 10);
        return r.slice(off, off + lim);
      },
      users: [{ store_name: 'Петрич' }, { store_name: 'Гоце Делчев' }, { store_name: WH }],
      loading_lists: [], loading_list_items: [], loading_list_products: [],
      stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: m, col: c }); return orig(m, c); };
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
const docRow = (h, pd) => Array.from(mod(h).querySelectorAll('tr[data-ll-doc]'))
  .find(r => r.textContent.indexOf(pd) >= 0);
const idxOf = (h, pd, st) => h.w.llPendingDocs.findIndex(d => d.purchase_doc === pd && (!st || d.store_name === st));
/* llNewList() отваря с 10 празни реда (23.09.2026); тук се мерят редовете,
   които идват ОТ ДОКУМЕНТИТЕ, затова бланката се изчиства. Предварителните
   редове имат свой тест — loading-lists-blank-rows.test.js. */
async function openNew(h) {
  h.w.llNewList();
  await ticks(); await ticks(); await ticks();
  h.w.llDraft.items = [];
  h.w.renderLoadingLists();
}
const transitGets = h => h.calls.get.filter(u => /\/goods_transit\?/.test(u));

(async function () {

  section('а) Разгъване: съдържанието ПРЕДИ отмятане, по позиция като число');
  {
    const h = env();
    await openNew(h);
    const q = transitGets(h);
    if (ok('една заявка за снимката', q.length === 1, q.join(' | '))) {
      const dq = decodeURIComponent(q[0]);
      ok('с артикулите в select-а',
        /material_code/.test(dq) && /material_name/.test(dq) && /ordered_qty/.test(dq) && /unit/.test(dq) && /position/.test(dq), dq);
      ok('подредена по id за страниците', /order=id\.asc/.test(dq), dq);
      ok('limit=1000&offset=0', /limit=1000/.test(dq) && /offset=0/.test(dq), dq);
    }
    const row = docRow(h, '4600100');
    if (ok('редът на документа е на екрана', !!row)) {
      ok('свит по подразбиране — стрелка ▸', /▸/.test(row.textContent), row.textContent);
      ok('без подтаблица', !mod(h).querySelector('[data-ll-doc-prod]'));

      realClick(h.w, row);                     /* клик по реда */
      const sub = mod(h).querySelector('[data-ll-doc-prod]');
      if (ok('разгънат — подтаблица', !!sub)) {
        const codes = Array.from(sub.querySelectorAll('tr')).slice(1)
          .map(tr => tr.querySelector('td').textContent);
        ok('в ред по позиция: 1, 2, 10', codes.join(',') === 'A1,A2,A10', codes.join(','));
        ok('имената, количествата и мерките', /ПЪРВИ/.test(sub.textContent) && /1,5/.test(sub.textContent) &&
          /кв\.м/.test(sub.textContent) && /ДЕСЕТИ/.test(sub.textContent), sub.textContent);
        ok('само четене — без полета и бутони', sub.querySelectorAll('input,button').length === 0);
      }
      ok('стрелката е ▾', /▾/.test(docRow(h, '4600100').textContent));
      ok('нищо не е отметнато от разгъването', !h.w.llPendingDocs[idxOf(h, '4600100')].checked &&
        h.w.llDraft.items.length === 0);

      /* Пре-рендиране отвън — разгънатото остава. */
      h.w.llAddFreeRow();
      ok('разгъването оцелява пре-рендиране', !!mod(h).querySelector('[data-ll-doc-prod]'));

      realClick(h.w, docRow(h, '4600100'));
      ok('втори клик свива', !mod(h).querySelector('[data-ll-doc-prod]'));
    }
    /* Чекбоксът и „Палет №" спират клика — иначе отмятането би разгъвало. */
    const cbCell = docRow(h, '4600100').querySelector('input[type="checkbox"]');
    ok('чекбоксът спира клика', /stopPropagation/.test(cbCell.getAttribute('onclick') || ''));
    ok('и клетката му също', /stopPropagation/.test(cbCell.parentNode.getAttribute('onclick') || ''));
    const pal = docRow(h, '4600100').querySelector('input:not([type])');
    ok('„Палет №" спира клика', !!pal && /stopPropagation/.test(pal.getAttribute('onclick') || ''));
  }

  section('б) Отмятане: редът се създава КАКТО СЕГА, артикулите се копират сами');
  {
    const h = env();
    await openNew(h);
    const i = idxOf(h, '4600100');
    fire(h.w, docRow(h, '4600100').querySelector('input[type="checkbox"]'), 'change');
    await ticks();
    const items = h.w.llDraft.items;
    ok('един ред', items.length === 1, String(items.length));
    const it = items[0];
    ok('с документа и обекта', it.purchase_doc === '4600100' && it.store_name === 'Петрич' && it.kind === 'pallet');
    ok('палет 1', it.pallet_no === 1);
    const pr = it.products || [];
    ok('три артикула — копирани', pr.length === 3, JSON.stringify(pr));
    ok('в реда по позиция', pr.map(p => p.sap_code).join(',') === 'A1,A2,A10', pr.map(p => p.sap_code).join(','));
    ok('количествата са ЧИСЛА', pr[0].qty === 1.5 && pr[1].qty === 2 && pr[2].qty === 10, JSON.stringify(pr.map(p => p.qty)));
    ok('мярката', pr[0].unit === 'кв.м');
    ok('кашони — празно', pr.every(p => p.cartons === null));
    ok('отбелязани като от каталога', pr.every(p => p._inCat === true));
    ok('toast „Копирани 3 артикула"', h.toasts.some(t => /Копирани 3 артикула от 4600100/.test(t.msg)), JSON.stringify(h.toasts));
    /* КОПИЕ, не препратка: редакция на реда не пипа снимката. */
    pr[0].qty = 999;
    ok('снимката не е пипната', h.w.llPendingDocs[i].products[0].qty === 1.5,
      JSON.stringify(h.w.llPendingDocs[i].products[0]));
    ok('без нова заявка за артикулите', transitGets(h).length === 1, transitGets(h).join(' | '));
  }

  section('в) Повторно отмятане НЕ дублира — наново от снимката');
  {
    const h = env();
    await openNew(h);
    const cb = () => docRow(h, '4600100').querySelector('input[type="checkbox"]');
    fire(h.w, cb(), 'change'); await ticks();
    /* Складът маха един и променя друг. */
    h.w.llDraft.items[0].products.splice(1, 1);
    h.w.llDraft.items[0].products[0].qty = 77;
    fire(h.w, cb(), 'change'); await ticks();          /* махане на отметката */
    ok('без отметка — редът си отива', h.w.llDraft.items.length === 0, String(h.w.llDraft.items.length));
    fire(h.w, cb(), 'change'); await ticks();          /* отново */
    const pr = h.w.llDraft.items[0].products;
    ok('един ред, не два', h.w.llDraft.items.length === 1, String(h.w.llDraft.items.length));
    ok('трите артикула — не дубликат, не остатъкът', pr.length === 3, JSON.stringify(pr.map(p => p.sap_code)));
    ok('с количествата от снимката, не ръчните', pr[0].qty === 1.5, JSON.stringify(pr.map(p => p.qty)));
  }

  section('г) Документ върху палети 1-3 — артикулите САМО в първия ред');
  {
    const h = env();
    await openNew(h);
    const i = idxOf(h, '4600100');
    h.w.llSetDocPallet(i, '1-3');
    fire(h.w, docRow(h, '4600100').querySelector('input[type="checkbox"]'), 'change');
    await ticks();
    const items = h.w.llDraft.items;
    ok('три реда', items.length === 3, String(items.length));
    ok('артикулите са на първия', items[0].products.length === 3, JSON.stringify(items.map(x => x.products.length)));
    ok('останалите са празни — не утроени', items[1].products.length === 0 && items[2].products.length === 0,
      JSON.stringify(items.map(x => x.products.length)));
    ok('жълто предупреждение, че документът е на три палета',
      h.toasts.some(t => /документът е на 3 палета/.test(t.msg) && t.col === '#d97706'), JSON.stringify(h.toasts));
  }

  section('д) Търсене по номер и по обект; чиповете остават при един обект');
  {
    const h = env();
    await openNew(h);
    const q = () => h.doc.getElementById('ll-doc-q');
    ok('полето за търсене е над списъка', !!q());
    const chips = () => Array.from(mod(h).querySelectorAll('[data-ll-doc-chips] button'));
    ok('чипове: Всички + два обекта', chips().length === 3, chips().map(c => c.textContent).join(' | '));
    ok('„Всички (3)"', /Всички \(3\)/.test(chips()[0].textContent), chips()[0].textContent);

    /* По номер — „съдържа", не „започва с". */
    q().value = '00100'; fire(h.w, q(), 'input');
    const shown1 = Array.from(mod(h).querySelectorAll('tr[data-ll-doc]')).map(r => r.textContent);
    ok('по номер: един документ', shown1.length === 1 && /4600100/.test(shown1[0]), JSON.stringify(shown1));
    ok('броячът казва „1 от 3"', /\(1 от 3\)/.test(mod(h).textContent), mod(h).textContent.slice(0, 200));
    ok('фокусът остава в полето', h.doc.activeElement === q(), h.doc.activeElement && h.doc.activeElement.id);
    ok('написаното не се губи при пре-рендирането', q().value === '00100', q().value);

    /* По обект. */
    q().value = 'гоце'; fire(h.w, q(), 'input');
    const shown2 = Array.from(mod(h).querySelectorAll('tr[data-ll-doc]')).map(r => r.textContent);
    ok('по обект (без значение от регистъра)', shown2.length === 1 && /4600200/.test(shown2[0]), JSON.stringify(shown2));

    /* Правило 11: филтърът остави ЕДИН обект — чиповете пак са всички. */
    ok('чиповете НЕ се крият при един видим обект', chips().length === 3, chips().map(c => c.textContent).join(' | '));
    ok('и броят в тях следва текста', /Петрич \(0\)/.test(mod(h).textContent) && /Гоце Делчев \(1\)/.test(mod(h).textContent),
      chips().map(c => c.textContent).join(' | '));

    /* Отмятане при филтър — индексът е на ПЪЛНИЯ списък, не на показания. */
    fire(h.w, docRow(h, '4600200').querySelector('input[type="checkbox"]'), 'change');
    await ticks();
    ok('отметнат е ТОЧНО показаният документ', h.w.llDraft.items.length === 1 &&
      h.w.llDraft.items[0].purchase_doc === '4600200', JSON.stringify(h.w.llDraft.items.map(x => x.purchase_doc)));

    /* Чип + текст. */
    q().value = ''; fire(h.w, q(), 'input');
    realClick(h.w, chips().find(c => /Петрич/.test(c.textContent)));
    const shown3 = Array.from(mod(h).querySelectorAll('tr[data-ll-doc]')).map(r => r.textContent);
    ok('чип „Петрич": двата му документа', shown3.length === 2 && shown3.every(t => /Петрич/.test(t)), JSON.stringify(shown3));
    q().value = '4700'; fire(h.w, q(), 'input');
    ok('чип + текст се комбинират', mod(h).querySelectorAll('tr[data-ll-doc]').length === 1 &&
      /4700300/.test(mod(h).querySelector('tr[data-ll-doc]').textContent));
    realClick(h.w, chips().find(c => /Петрич/.test(c.textContent)));
    ok('втори клик по чипа го маха', h.w.llDocStore === '', JSON.stringify(h.w.llDocStore));

    q().value = 'няма-такъв'; fire(h.w, q(), 'input');
    ok('нищо не отговаря — казва го', /Нищо не отговаря на търсенето/.test(mod(h).textContent));
    ok('и чиповете пак са там', chips().length === 3);
  }

  section('д2) Чиповете при ЕДИН обект изобщо (правило 11)');
  {
    const h = env({ rows: [tr('4600100', 'Петрич', 1, 'A1', 'ПЪРВИ', 1)] });
    await openNew(h);
    const chips = Array.from(mod(h).querySelectorAll('[data-ll-doc-chips] button'));
    ok('„Всички" + „Петрич" — рендирани', chips.length === 2, chips.map(c => c.textContent).join(' | '));
  }

  section('е) „↺ Отново от Стока на път" — ЗАМЕНЯ, пита при непразен ред');
  {
    const h = env();
    await openNew(h);
    fire(h.w, docRow(h, '4600100').querySelector('input[type="checkbox"]'), 'change');
    await ticks();
    h.w.llDraft.items[0]._prodOpen = true;
    h.w.renderLoadingLists();
    const again = () => btn(mod(h), '↺ Отново от Стока на път');
    ok('бутонът с новия етикет', !!again());
    ok('старият „Вземи артикулите" го няма', !btn(mod(h), 'Вземи артикулите'));

    /* Всичко изтрито на ръка → отначало, без въпрос. */
    h.w.llDraft.items[0].products = [];
    h.w.renderLoadingLists();
    const confBefore = h.calls.confirm.length;
    realClick(h.w, again()); await ticks();
    ok('списъкът е върнат', h.w.llDraft.items[0].products.length === 3,
      JSON.stringify(h.w.llDraft.items[0].products.map(p => p.sap_code)));
    ok('без въпрос — нямаше какво да се загуби', h.calls.confirm.length === confBefore);

    /* С артикули — пита; ЗАМЕНЯ, не добавя. */
    h.w.llDraft.items[0].products.splice(0, 1);
    realClick(h.w, again()); await ticks();
    ok('пита преди да замени', h.calls.confirm.length === confBefore + 1 &&
      /Замени 2 артикула/.test(h.calls.confirm[h.calls.confirm.length - 1]), JSON.stringify(h.calls.confirm));
    ok('заменени — три, не пет', h.w.llDraft.items[0].products.length === 3,
      String(h.w.llDraft.items[0].products.length));
  }

  section('е2) Отказ на въпроса — редът остава, какъвто е');
  {
    const h = env({ confirm: false });
    await openNew(h);
    fire(h.w, docRow(h, '4600100').querySelector('input[type="checkbox"]'), 'change');
    await ticks();
    h.w.llDraft.items[0].products.splice(0, 2);
    h.w.llDraft.items[0]._prodOpen = true;
    h.w.renderLoadingLists();
    realClick(h.w, btn(mod(h), '↺ Отново от Стока на път')); await ticks();
    ok('отказ — остава единият ръчно оставен', h.w.llDraft.items[0].products.length === 1,
      String(h.w.llDraft.items[0].products.length));
  }

  section('ж) Над 1000 реда — втора страница, нищо не се губи');
  {
    /* 1500 реда в 300 документа по 5 артикула. */
    const rows = [];
    for (let d = 0; d < 300; d++) for (let p = 1; p <= 5; p++)
      rows.push(tr('BIG' + String(d).padStart(3, '0'), d % 2 ? 'Петрич' : 'Гоце Делчев', p, 'X' + d + '-' + p, 'АРТ', p));
    const h = env({ rows: rows });
    await openNew(h);
    const q = transitGets(h);
    ok('две заявки', q.length === 2, q.map(decodeURIComponent).join(' | '));
    ok('offset 0 и 1000', /offset=0/.test(q[0]) && /offset=1000/.test(q[1] || ''), q.join(' | '));
    ok('всичките 300 документа', h.w.llPendingDocs.length === 300, String(h.w.llPendingDocs.length));
    ok('всеки с петте си артикула', h.w.llPendingDocs.every(d => d.products.length === 5 && d.items === 5),
      JSON.stringify(h.w.llPendingDocs.filter(d => d.products.length !== 5).map(d => d.purchase_doc + ':' + d.products.length).slice(0, 5)));
  }

  section('ж2) Паднала ВТОРА страница — червено, а не „половин документ"');
  {
    const rows = [];
    for (let d = 0; d < 300; d++) for (let p = 1; p <= 5; p++)
      rows.push(tr('BIG' + String(d).padStart(3, '0'), 'Петрич', p, 'X' + d + '-' + p, 'АРТ', p));
    const h = env({ rows: rows, fail: { GET: /goods_transit.*offset=1000/ } });
    await openNew(h);
    ok('червен toast', h.toasts.some(t => /Стока на път не се зареди/.test(t.msg) && t.col === '#dc2626'),
      JSON.stringify(h.toasts));
    ok('нито един документ — не половината', h.w.llPendingDocs.length === 0, String(h.w.llPendingDocs.length));
    ok('в блока е казано, че не е заредено', !!mod(h).querySelector('[data-ll-transit-error]'));
    ok('а не „Няма чакащи документи"', mod(h).textContent.indexOf('Няма чакащи документи') < 0);
    ok('редакторът работи — може да се добави ред', !!btn(mod(h), 'Добави нов ред'));
  }

  section('и) Частично доставен документ — количеството е ОСТАВАЩОТО (remaining_qty)');
  {
    /* Три реда в един документ:
         R1 — поръчани 10, остават 4   → 4
         R2 — поръчани 6,  remaining null → 6 (няма данни, поръчаното)
         R3 — поръчани 5,  остават 0   → нищо не остава: показва 0, не се копира */
    const r1 = Object.assign(tr('4800500', 'Петрич', 1, 'R1', 'ЧАСТИЧЕН', 10), { remaining_qty: 4 });
    const r2 = Object.assign(tr('4800500', 'Петрич', 2, 'R2', 'БЕЗ ДАННИ', 6), { remaining_qty: null });
    const r3 = Object.assign(tr('4800500', 'Петрич', 3, 'R3', 'ИЗЧЕРПАН', 5), { remaining_qty: 0 });
    const h = env({ rows: [r1, r2, r3] });
    await openNew(h);
    const q = transitGets(h);
    ok('заявката иска remaining_qty', q.length === 1 && /remaining_qty/.test(decodeURIComponent(q[0])),
      q.map(decodeURIComponent).join(' | '));

    realClick(h.w, docRow(h, '4800500'));
    const sub = mod(h).querySelector('[data-ll-doc-prod]');
    const qtys = sub ? Array.from(sub.querySelectorAll('tr')).slice(1)
      .map(tr => tr.querySelectorAll('td')[2].textContent) : [];
    ok('разгънатото показва оставащото: 4, 6, 0', qtys.join(',') === '4,6,0', qtys.join(','));
    ok('а НЕ поръчаното 10', qtys.indexOf('10') < 0, qtys.join(','));

    fire(h.w, docRow(h, '4800500').querySelector('input[type="checkbox"]'), 'change');
    await ticks();
    const pr = h.w.llDraft.items[0].products;
    ok('копирани са двата с остатък', pr.length === 2, JSON.stringify(pr.map(p => p.sap_code + ':' + p.qty)));
    ok('R1 с 4, не с 10', pr[0] && pr[0].sap_code === 'R1' && pr[0].qty === 4, JSON.stringify(pr[0]));
    ok('R2 — null → поръчаното 6', pr[1] && pr[1].sap_code === 'R2' && pr[1].qty === 6, JSON.stringify(pr[1]));
    ok('R3 с остатък 0 не е копиран', !pr.some(p => p.sap_code === 'R3'));
    ok('и това е казано', h.toasts.some(t => /1 без количество — пропуснати/.test(t.msg)), JSON.stringify(h.toasts));

    /* „↺" по резервния път (документът го няма в снимката) — същото правило. */
    h.w.llPendingDocs = [];
    h.w.llDraft.items[0].products = [];
    h.w.llDraft.items[0]._prodOpen = true;
    h.w.renderLoadingLists();
    realClick(h.w, btn(mod(h), '↺ Отново от Стока на път'));
    await ticks(); await ticks();
    const fb = transitGets(h).filter(u => /purchase_doc=eq\./.test(u));
    ok('резервната заявка също иска remaining_qty', fb.length === 1 && /remaining_qty/.test(decodeURIComponent(fb[0])),
      fb.map(decodeURIComponent).join(' | '));
    const pr2 = h.w.llDraft.items[0].products;
    ok('и копира оставащото — 4 и 6', pr2.map(p => p.qty).join(',') === '4,6', JSON.stringify(pr2.map(p => p.qty)));
  }

  section('з) Подредба на документите — най-новите отгоре');
  {
    const h = env();
    await openNew(h);
    ok('по дата низходящо', h.w.llPendingDocs.map(d => d.purchase_doc).join(',') === '4600200,4600100,4700300',
      h.w.llPendingDocs.map(d => d.purchase_doc + '@' + d.doc_date).join(','));
  }

  report();
})();
