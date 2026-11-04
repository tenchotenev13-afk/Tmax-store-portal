/* „Стока на път", етап 2 (03.11.2026): табовете „📥 Получавам" / „📤 Изпращам"
   по РОЛЯТА на гледната точка в реда, не по direction; посоката при импорта
   от логистичен склад.

   Гледна точка (transitViewpoint): обект → самият той; склад (logistics със
   store_name) → складът; офис → обектът в падащото меню. „Получавам" =
   store_name = гледната точка, „Изпращам" = supplier = гледната точка.

   Проверки:
     а) обект: реален клик на „Получавам" — редовете към него от склад И от
        магазин; „Изпращам" — редовете от него, вкл. към склад;
     б) склад: „Изпращам" = към магазините; „Получавам" = връщанията към него;
     в) офис: без избран обект двата таба са <button>, клик → съобщение и
        празна таблица; с избран обект — както (а);
     г) броячите под табовете = редовете след клик;
     д) импорт: склад с „изпращащ" код на завода (2522) → 'incoming';
        магазин → магазин остава 'transfer'; сверката праща новия direction
        за съществуващ ред;
     е) transitApplyOpenFocus → „Получавам" + „Чакат мен";
     ж) баджът на реда и колоната „Посока" в Excel;
     з) (04.11.2026) складът вижда изпратените връщания, които чакат НЕГО:
        „Получавам (N чакат)" ги брои, чипът „📥 Чакат мен", банерът и скокът
        при влизане важат и за склада; офис с обект — чипът спрямо обекта,
        без банер и скок; обектът — без промяна.

   Мутационна проверка (03.11.2026, върху чист transit.js; чистият — exit 0):
     M1 „Изпращам" по direction='transfer' вместо по supplier   → ❌ а), б), в), г)
     M2 без правилото за логистичния склад при импорта          → ❌ д)
     M3 офис без гледна точка показва всичко                    → ❌ в)
     M4 сверката не праща direction                             → ❌ д)
     M5 transitApplyOpenFocus пак към 'transfer'                → ❌ е)
   04.11.2026 (складът и „чака гледната точка"):
     W1 „Получавам (N чакат)" без изпратените към гледната точка → ❌ з)
     W2 банерът само за обекта (isGlobal)                        → ❌ з)
     W3 скокът при влизане само за обекта                         → ❌ з)
     W4 чипът „Чакат мен" само за обекта                          → ❌ з)

   Пускане:  node tests/transit-tabs-role.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const STORE = { email: 'radnevo@temax.bg', display_name: 'Раднево', role: 'manager', store_name: 'Раднево' };
const WAREHOUSE = { email: 'sklad.t@temax.bg', display_name: 'Склад Т', role: 'logistics', store_name: WH };
const OFFICE = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис' };

const row = (id, store, supplier, direction, status) => ({
  id, store_name: store, supplier, direction, status, purchase_doc: 'D-' + id,
  material_code: 'M-' + id, material_name: 'ART-' + id, doc_date: '2026-11-01', unit: 'БР', ordered_qty: 1
});
/* Раднево получава: r1 (от склад), r2 (от магазин Добрич), r7 (от склад, приет).
   Раднево изпраща: r3 (към Шумен), r4 (към склада — връщане). */
const DATA = [
  row('r1', 'Раднево', WH, 'incoming', 'pending'),
  row('r2', 'Раднево', 'Добрич', 'transfer', 'pending'),
  row('r3', 'Шумен', 'Раднево', 'transfer', 'pending'),
  row('r4', WH, 'Раднево', 'transfer', 'pending'),
  row('r5', 'Силистра', WH, 'incoming', 'received'),
  row('r6', 'Добрич', 'Логистичен склад Добрич', 'incoming', 'pending'),
  row('r7', 'Раднево', WH, 'incoming', 'received')
];

function env(user, data) {
  const h = boot({ modules: ['transport.js', 'client-orders.js', 'transit.js'], user, data: { goods_transit: [], stores: [], users: [] } });
  h.w.loadTransit = () => {};
  h.w.transitData = JSON.parse(JSON.stringify(data || DATA));
  h.w.transitDir = 'all'; h.w.transitFilter = 'all'; h.w.transitStore = '';
  h.w.renderTransit();
  return h;
}
const mod = h => h.doc.getElementById('mod-transit');
const tabBtn = (h, key) => Array.from(mod(h).querySelectorAll('button'))
  .find(b => (b.getAttribute('onclick') || '').indexOf("transitDir='" + key + "'") === 0) || null;
const shown = h => h.w._transitVisible.map(r => r.id).sort().join(',');
const click = (h, key) => { const b = tabBtn(h, key); if (b) realClick(h.w, b, key); return b; };
const tabNum = (h, key) => { const b = tabBtn(h, key); const m = b && /\((\d+) /.exec(b.textContent); return m ? +m[1] : null; };

(async function run() {

  section('а) обект: „Получавам" = към него (склад И магазин); „Изпращам" = от него (вкл. към склад)');
  {
    const h = env(STORE);
    ok('табовете: Всички / 📥 Получавам / 📤 Изпращам', !!tabBtn(h, 'all') && /📥 Получавам/.test((tabBtn(h, 'in') || {}).textContent || '') &&
      /📤 Изпращам/.test((tabBtn(h, 'out') || {}).textContent || ''));
    ok('таб „Трансфери" го няма', !Array.from(mod(h).querySelectorAll('button')).some(b => /🔄 Трансфери/.test(b.textContent)));
    click(h, 'in');
    ok('„Получавам" → r1, r2, r7', shown(h) === 'r1,r2,r7', shown(h));
    ok('табът е активен', h.w.transitDir === 'in');
    click(h, 'out');
    ok('„Изпращам" → r3, r4 (вкл. към склада)', shown(h) === 'r3,r4', shown(h));
  }

  section('б) склад: „Изпращам" = към магазините; „Получавам" = връщанията към него');
  {
    const h = env(WAREHOUSE);
    click(h, 'out');
    ok('„Изпращам" → r1, r5, r7', shown(h) === 'r1,r5,r7', shown(h));
    click(h, 'in');
    ok('„Получавам" → r4 (връщането от Раднево)', shown(h) === 'r4', shown(h));
    /* Падащото меню за склада в таба е ДРУГАТА страна. */
    h.w.transitStore = 'Силистра'; h.w.transitDir = 'out'; h.w.renderTransit();
    ok('„Изпращам" + меню Силистра → r5', shown(h) === 'r5', shown(h));
  }

  section('в) офис: без избран обект — съобщение и празна таблица; с обект — както обекта');
  {
    const h = env(OFFICE);
    const bi = tabBtn(h, 'in'), bo = tabBtn(h, 'out');
    ok('двата таба са <button>', !!bi && bi.tagName === 'BUTTON' && !!bo && bo.tagName === 'BUTTON');
    ok('без гледна точка — без числа под табовете', tabNum(h, 'in') === null && tabNum(h, 'out') === null,
      (bi || {}).textContent + ' | ' + (bo || {}).textContent);
    click(h, 'in');
    const note = h.doc.getElementById('t-vp-note');
    ok('„Получавам" → съобщението', !!note && /Изберете обект от падащото меню — табът показва какво получава той/.test(note.textContent), note && note.textContent);
    ok('… и празна таблица', shown(h) === '' && /Няма записи/.test(mod(h).textContent));
    click(h, 'out');
    const note2 = h.doc.getElementById('t-vp-note');
    ok('„Изпращам" → съобщението „изпраща"', !!note2 && /какво изпраща той/.test(note2.textContent));
    ok('… и празна таблица', shown(h) === '');
    click(h, 'all');
    ok('„Всички" работи както досега (7 реда)', shown(h).split(',').length === 7, shown(h));
    h.w.transitStore = 'Раднево'; h.w.transitDir = 'in'; h.w.renderTransit();
    ok('с избран Раднево „Получавам" → r1, r2, r7', shown(h) === 'r1,r2,r7', shown(h));
    ok('без съобщение', !h.doc.getElementById('t-vp-note'));
    click(h, 'out');
    ok('с избран Раднево „Изпращам" → r3, r4', shown(h) === 'r3,r4', shown(h));
  }

  section('г) броячите под табовете = редовете след клик');
  {
    const h = env(STORE);
    const nin = tabNum(h, 'in'), nout = tabNum(h, 'out');
    h.w.transitFilter = 'pending'; click(h, 'in');
    ok('„Получавам (N чакат)" = редовете след клик + „Не доставени" (2)', nin === 2 && h.w._transitVisible.length === nin, nin + ' / ' + h.w._transitVisible.length);
    click(h, 'out');
    const tr = h.w._transitVisible.filter(r => r.direction === 'transfer').length;
    ok('„Изпращам (N за изпр.)" = трансферите за изпращане след клик (2)', nout === 2 && tr === nout, nout + ' / ' + tr);
  }

  section('д) импорт: доставка от склад е incoming; магазин → магазин — transfer; сверката обновява direction');
  {
    const HEAD1 = ['Завод', 'Склад', 'Доставчик/доставящ завод', 'Документ за покупка', 'Позиция',
      'Вид документ закуп.', 'Търг. организация', 'Снабдителска група', 'Инд. за изтриване',
      'История ПД/документация деблокиране', 'Дата на документ', 'Материал', 'Кратък текст',
      'Група материали', 'Категория контировка', 'Количество поръчка', 'МЕ поръчка', 'Все още недоставено (колич.)'];
    const HEAD2 = ['Доставка', 'Позиция', 'Материал', 'Описание на позиция', 'К-во по доставка',
      'Ед. за измерв. прод.', 'СтатусДвижениеСтоки', 'Пункт експ./пункт получав.', 'Доставчик',
      'Име на доставчик', 'Документ за покупка', 'Външен идентиф. на доставка', 'Дата на дос. (от/к.)'];
    const r1 = (plant, sup, doc, mat) => [plant, '1000', sup, doc, '10', 'ZUB', '5500', '112', '', '', '14.10.2026', mat, 'Материал ' + mat, 'G', '', 2, 'БР', 2];
    const r2 = (vd, mat, doc) => [vd, '10', mat, '', 2, 'БР', 'A', '', '', '', doc, '0080000001', ''];
    const F1 = [HEAD1,
      r1('2522', '5505 5005 Логистичен склад Търговищ', '4600192031', '91967'),  /* склад → Дупница с „изпращащ" код */
      r1('2520', '2518 Логистичен склад Добрич', '4600191999', '91868'),        /* склад Добрич, също „изпращащ" */
      r1('5522', '6516 Добрич', '4600200001', 'M-T')                             /* магазин → магазин */
    ];
    const F2 = [HEAD2, r2('180512962', '91967', '4600192031'), r2('180514939', '91868', '4600191999'), r2('180600001', 'M-T', '4600200001')];
    const parsed = (function () { const h = env(OFFICE); return h.w.parseTransitRows(F1); })();
    const by = m => parsed.filter(r => r.material_code === m)[0] || {};
    ok('2522 ← склад Търговище → incoming', by('91967').direction === 'incoming', by('91967').direction);
    ok('2520 ← склад Добрич (2518) → incoming', by('91868').direction === 'incoming', by('91868').direction);
    ok('магазин ← магазин Добрич → transfer (правилото за магазин остава първо)', by('M-T').direction === 'transfer', by('M-T').direction);

    /* Сверка: редът е в базата като 'outgoing' (импортът от 03.11) — новият
       импорт трябва да прати direction 'incoming' за него. */
    const existing = [{ id: 'x-dup', inbound_delivery: '180512962', delivery_position: '10', archived_at: null,
      direction: 'outgoing', status: 'pending', store_name: 'Дупница' }];
    const h = boot({ modules: ['transport.js', 'client-orders.js', 'transit.js'], user: OFFICE, data: { goods_transit: existing, stores: [], users: [] } });
    h.w.loadTransit = () => {};
    h.w.openTransitImportModal();
    h.w.transitImportSetFile('f1.xlsx', F1);
    h.w.transitImportSetFile('f2.xlsx', F2);
    await h.w.transitImportPrepare();
    await ticks(3);
    const ov = h.doc.getElementById('transit-import-ov');
    const b = btn(ov, 'Импортирай');
    if (ok('прегледът и бутонът „Импортирай"', !!b)) {
      realClick(h.w, b, 'Импортирай');
      for (let i = 0; i < 40; i++) await ticks(3);
      const bodies = [].concat.apply([], h.calls.post.filter(p => /goods_transit\?on_conflict/.test(p.url)).map(p => p.body));
      const upd = bodies.filter(x => x.inbound_delivery === '180512962')[0] || {};
      ok('съществуващият ред се обновява (без status)', !!upd.inbound_delivery && !('status' in upd), JSON.stringify(upd));
      ok('… и праща direction = incoming', upd.direction === 'incoming', upd.direction);
    }
  }

  section('е) влизане: transitApplyOpenFocus → „Получавам" + „Чакат мен"');
  {
    const data = DATA.concat([row('r8', 'Раднево', 'Добрич', 'transfer', 'sent')]);
    const h = env(STORE, data);
    h.w.transitOpenFocus(); h.w.renderTransit();
    ok('табът е „Получавам"', h.w.transitDir === 'in', h.w.transitDir);
    ok('филтърът е „Чакат мен"', h.w.transitFilter === 'mine', h.w.transitFilter);
    ok('показан е r8', shown(h) === 'r8', shown(h));
  }

  section('ж) баджът на реда и „Посока" в Excel');
  {
    /* Обектът тегли само своите редове (филтър на сървъра в loadTransit) —
       r5 и r6 при него не идват. */
    const h = env(STORE, DATA.filter(r => r.store_name === 'Раднево' || r.supplier === 'Раднево'));
    const badges = () => Array.from(mod(h).querySelectorAll('.t-badge')).map(s => s.textContent.trim());
    click(h, 'all');
    const bs = badges();
    ok('обект: само „📥 Получавам" / „📤 Изпращам"', bs.length > 0 && bs.every(t => t === '📥 Получавам' || t === '📤 Изпращам'), bs.join(' | '));
    const ho = env(OFFICE);
    const bo = Array.from(mod(ho).querySelectorAll('.t-badge')).map(s => s.textContent.trim());
    ok('офис без обект: „🏭 От склад" / „🏬 От магазин"', bo.length === 7 && bo.every(t => t === '🏭 От склад' || t === '🏬 От магазин') &&
      bo.filter(t => t === '🏬 От магазин').length === 3, bo.join(' | '));
    let aoa = null;
    ho.w.XLSX = { utils: { book_new: () => ({}), aoa_to_sheet: a => { aoa = a; return {}; }, book_append_sheet: () => {} }, writeFile: () => {} };
    ho.w.exportTransitExcel();
    const col = aoa ? aoa[0].indexOf('Посока') : -1;
    const vals = aoa ? aoa.slice(1).map(r => r[col]) : [];
    ok('Excel „Посока" = „От склад" / „От магазин" (по изпращача)', col === 0 && vals.filter(v => v === 'От магазин').length === 3 &&
      vals.filter(v => v === 'От склад').length === 4, JSON.stringify(vals));
  }

  section('з) складът вижда изпратените връщания, които чакат НЕГО (04.11.2026)');
  {
    /* Като на живо 04.11: магазин Търговище връща към склада, статус sent. */
    const data = [
      row('w1', WH, 'Търговище', 'transfer', 'sent'),
      row('w2', WH, 'Търговище', 'transfer', 'sent'),
      row('w3', WH, 'Търговище', 'transfer', 'pending'),
      row('w4', 'Раднево', WH, 'incoming', 'pending'),
      row('w5', 'Силистра', WH, 'incoming', 'received')
    ];
    const h = env(WAREHOUSE, data);
    ok('„Получавам (3 чакат)" = 1 pending + 2 sent към склада', tabNum(h, 'in') === 3, tabNum(h, 'in'));
    const chip = mod(h).querySelector('[data-tt-f="mine"]');
    ok('чипът „📥 Чакат мен" е там и казва 2', !!chip && /Чакат мен\s*2/.test(chip.textContent), chip && chip.textContent);
    const ban = h.doc.getElementById('t-recv-note');
    ok('банерът „2 трансфера чакат да ги приемете"', !!ban && /2 трансфера чакат да ги приемете/.test(ban.textContent), ban && ban.textContent);
    /* Влизане: скок към „Получавам" + „Чакат мен". */
    const h2 = env(WAREHOUSE, data);
    h2.w.transitFilter = 'pending'; h2.w.transitOpenFocus(); h2.w.renderTransit();
    ok('при влизане — „Получавам" + „Чакат мен"', h2.w.transitDir === 'in' && h2.w.transitFilter === 'mine', h2.w.transitDir + '/' + h2.w.transitFilter);
    ok('… точно w1 и w2', shown(h2) === 'w1,w2', shown(h2));

    /* Офис с избран обект: чипът спрямо избрания, без банер и без скок. */
    const ho = env(OFFICE, DATA.concat([row('o1', 'Раднево', 'Добрич', 'transfer', 'sent')]));
    ho.w.transitStore = 'Раднево'; ho.w.transitFilter = 'pending'; ho.w.transitOpenFocus(); ho.w.renderTransit();
    const oc = mod(ho).querySelector('[data-tt-f="mine"]');
    ok('офис + Раднево: чипът казва 1 (за Раднево)', !!oc && /Чакат мен\s*1/.test(oc.textContent), oc && oc.textContent);
    ok('офис: без банер и без скок', !ho.doc.getElementById('t-recv-note') && ho.w.transitDir === 'all' && ho.w.transitFilter === 'pending',
      ho.w.transitDir + '/' + ho.w.transitFilter);
    const hz = env(OFFICE);
    ok('офис без обект: без чип „Чакат мен"', !mod(hz).querySelector('[data-tt-f="mine"]'));

    /* Обектът — без промяна: числата са като преди. */
    const hs = env(STORE);
    ok('обект Раднево: „Получавам (2 чакат)" и „Изпращам (2 за изпр.)" както преди', tabNum(hs, 'in') === 2 && tabNum(hs, 'out') === 2,
      tabNum(hs, 'in') + ' / ' + tabNum(hs, 'out'));
  }

  report();
})();
