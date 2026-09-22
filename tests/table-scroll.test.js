/* Таблиците в Транспорт и Клиентски заявки: видим хоризонтален скрол,
   закачени колони, влачене с мишка (enableDragScroll в shared.js).

   jsdom не смята лейаут: CSS-ът се проверява като ТЕКСТ (закотвени
   регекси срещу <style> на index.html), а визуалното — залепване, ширини,
   hover върху закачените клетки, истинско влачене с мишка — е измерено в
   Chrome при разработката (22.09.2026). Тук се заковава поведението:
   - scrollLeft на обвивката е подменен с обикновено поле (jsdom го държи 0);
   - събитията са истински DOM събития (pointerdown/move/up, click), така
     че capture listener-ът на enableDragScroll наистина ги вижда;
   - inline onclick-ите не се компилират от jsdom (runScripts:'outside-only'),
     затова всеки елемент с onclick в реда получава bubble listener, който
     изпълнява кода с ИСТИНСКОТО събитие (this = елемента) — точно както
     браузърът вика inline handler-а. Така event.stopPropagation() в
     клетката с бутоните наистина спира DOM събитието.

   Пускане: node tests/table-scroll.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, dayOffset, tsOffset, ticks } = H;

const TR = [
  { id: 't-1', store_name: 'Троян', date: dayOffset(-1), hour: '10:00', bon: 'Б-1', customer_name: 'Иван Петров',
    phone: '0888', address: 'ул. 1', product: 'ПАРКЕТ', color: '', sap: '1', qty: 1, unit: 'бр.',
    delivery: dayOffset(3), status: 'pending', client_order_id: null, client_order_num: null, awaiting_stock: false,
    created_at: tsOffset(-1) }
];
const CO = [
  { id: 'c-1', in_num: 'Троян-0001', store_name: 'Троян', fulfiller: 'Габрово', status: 'pending',
    date: dayOffset(-1), hour: '10:00', customer_name: 'Мария Иванова', phone: '0899', bon: 'Б-2',
    product: 'МИВКА', color: '', sap: '2', qty: 1, unit: 'бр.', items: null, delivery: dayOffset(4),
    note: '', created_at: tsOffset(-1), co_eta: null, co_note: null, paid_transport: false, transport_id: null, group_id: null }
];
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

async function env() {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: ADMIN,
    data: { transport_orders: TR, client_orders: CO, stores: [] }
  });
  const w = h.w;
  guard('loadTransport()', () => w.loadTransport());
  guard('loadClientOrders()', () => w.loadClientOrders());
  await ticks(5);
  return h;
}

/* Обвивката на таблицата и подменен scrollLeft */
function wrapOf(doc, bodyId) {
  const b = doc.getElementById(bodyId);
  const el = b && b.closest('.tbl-wrap');
  if (el) Object.defineProperty(el, 'scrollLeft', { value: 100, writable: true, configurable: true });
  return el;
}
function pe(w, target, type, x, over) {
  const ev = new w.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, clientX: x, clientY: 10, button: 0 }, over || {}));
  Object.defineProperty(ev, 'pointerType', { value: (over && over.pointerType) || 'mouse' });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  target.dispatchEvent(ev);
  return ev;
}
function drag(w, from, to, dx, over) {
  pe(w, from, 'pointerdown', 200, over);
  pe(w, from, 'pointermove', 200 + Math.round(dx / 2), over);
  pe(w, from, 'pointermove', 200 + dx, over);
  pe(w, to || from, 'pointerup', 200 + dx, over);
}
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
/* Всеки inline onclick в реда (и на самия <tr>) става истински listener
   с истинското event — както в браузъра. */
function wireRow(w, tr) {
  const els = [tr].concat(Array.prototype.slice.call(tr.querySelectorAll('[onclick]')));
  els.forEach(el => {
    const code = el.getAttribute('onclick');
    const fn = w.eval('(function(event){' + code + '})');
    el.addEventListener('click', e => fn.call(el, e));
  });
}

(async function run() {

  section('1. CSS: двете таблици — скрол в обвивката, sticky thead, закачени колони');
  {
    const { doc } = await env();
    const css = Array.prototype.map.call(doc.querySelectorAll('style'), s => s.textContent).join('\n');
    const has = (label, re) => ok(label, re.test(css), String(re));
    ok('Транспорт: обвивката е .tbl-wrap.co-sticky-actions.tbl-tr',
      !!doc.querySelector('.tbl-wrap.co-sticky-actions.tbl-tr #tr-body'));
    ok('Клиентски: обвивката е .tbl-wrap.co-sticky-actions.tbl-co',
      !!doc.querySelector('.tbl-wrap.co-sticky-actions.tbl-co #co-body'));
    has('max-height:calc(100vh - 140px) + overflow:auto', /\.tbl-wrap\.co-sticky-actions\{max-height:calc\(100vh - 140px\);overflow:auto;cursor:grab;\}/);
    has('min-width:1100px само в .co-sticky-actions', /\.co-sticky-actions table\{min-width:1100px;\}/);
    ok('няма глобално table{min-width', !/(^|\})\s*table\{[^}]*min-width/m.test(css));
    has('sticky thead: top:0, z-index:2', /\.co-sticky-actions thead th\{position:sticky;top:0;z-index:2;background:var\(--surf\);\}/);
    has('бутоните: th:last-child z-index:4 (над останалите th)', /\.co-sticky-actions table th:last-child\{z-index:4;\}/);
    has('Клиент закачен: td Транспорт 2-ра / Клиентски 3-та',
      /\.tbl-tr td:nth-child\(2\),\.tbl-co td:nth-child\(3\)\{position:sticky;left:0;z-index:1;background:inherit;box-shadow:6px 0 6px -6px/);
    has('Клиент закачен: th със z-index:3', /\.tbl-tr th:nth-child\(2\),\.tbl-co th:nth-child\(3\)\{position:sticky;left:0;z-index:3;/);
    has('№ фиксиран на 90px', /\.tbl-co th:nth-child\(1\),\.tbl-co td:nth-child\(1\)\{box-sizing:border-box;width:90px;min-width:90px;max-width:90px;\}/);
    has('Дата фиксирана на 80px', /\.tbl-co th:nth-child\(2\),\.tbl-co td:nth-child\(2\)\{box-sizing:border-box;width:80px;min-width:80px;max-width:80px;/);
    has('десктоп: Дата на left:90px', /@media\(min-width:768px\)\{[\s\S]*?\.tbl-co th:nth-child\(2\),\.tbl-co td:nth-child\(2\)\{position:sticky;left:90px;\}/);
    has('десктоп: Клиент на left:170px', /@media\(min-width:768px\)\{[\s\S]*?\.tbl-co th:nth-child\(3\),\.tbl-co td:nth-child\(3\)\{left:170px;\}/);
    has('nowrap: Дата/Телефон/Доставка/Статус/Магазин в двете',
      /\.tbl-tr td:nth-child\(1\),\.tbl-tr td:nth-child\(4\),\.tbl-tr td:nth-child\(8\),\.tbl-tr td:nth-child\(9\),\.tbl-tr td:nth-child\(10\),\s*\.tbl-co td:nth-child\(2\),\.tbl-co td:nth-child\(4\),\.tbl-co td:nth-child\(9\),\.tbl-co td:nth-child\(11\),\.tbl-co td:nth-child\(12\)\{white-space:nowrap;\}/);
    has('Продукт/Адрес: пренасят се, 160–260px (width нужен, за да държи max-width)',
      /\.tbl-tr td:nth-child\(5\),\.tbl-tr td:nth-child\(6\),\.tbl-co td:nth-child\(6\)\{width:260px;min-width:160px;max-width:260px;white-space:normal;\}/);
    /* Фонът идва от реда: закачените td наследяват <tr> (подсветка, мигане,
       hover), а самият ред е винаги плътен — иначе под закачените прозира. */
    has('редът е плътно бял по подразбиране', /\.co-sticky-actions tbody tr\{background:#fff;\}/);
    has('бутоните вдясно: td:last-child наследява фона на реда',
      /\.co-sticky-actions table td:last-child\{z-index:1;background:inherit;\}/);
    has('десктоп: № и Дата наследяват фона на реда',
      /@media\(min-width:768px\)\{[\s\S]*?\.tbl-co td:nth-child\(1\),\.tbl-co td:nth-child\(2\)\{position:sticky;z-index:1;background:inherit;\}/);
    /* Правило по правило, без коментари. Изключение: общото правило за
       td:last-child + th:last-child (заглавието иска бял фон) — за td то се
       бие от по-късното td:last-child{…background:inherit}, проверено отгоре. */
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+\{[^{}]*\}/g) || [];
    const stickyTd = /(\.co-sticky-actions table td:last-child|\.tbl-tr td:nth-child\(2\)|\.tbl-co td:nth-child\([123]\))(?![\d])/;
    const hardWhite = rules.filter(r => {
      const sel = r.slice(0, r.indexOf('{')), body = r.slice(r.indexOf('{'));
      return stickyTd.test(sel) && /background:#fff/.test(body) && !/th:last-child/.test(sel);
    }).map(r => r.trim());
    ok('никоя закачена td не е с твърд background:#fff', hardWhite.length === 0, JSON.stringify(hardWhite));
    has('hover на ниво <tr>: #fafafa', /\.co-sticky-actions tbody tr:hover\{background:#fafafa;\}/);
    has('hover на ниво <tr>: row-click #eef2ff, бие подсветката и спира мигането',
      /\.co-sticky-actions tbody tr\.row-click:hover\{background:#eef2ff!important;animation:none!important;\}/);
    has('глобалните td hover правила са неутрализирани с inherit',
      /\.co-sticky-actions tbody tr:hover td\{background:inherit;\}/);
    ok('старите td hover правила за двете таблици са махнати',
      !/\.co-sticky-actions tr:hover td:last-child\{/.test(css) && !/\.co-sticky-actions tr\.row-click:hover td,/.test(css));
    has('плътно мигане: rowPulseOpaque = rgba(220,38,38,.07) върху бяло',
      /@keyframes rowPulseOpaque\{0%,100%\{background:#fff;\}50%\{background:#fdf0f0;\}\}/);
    has('плътно мигане: rowPulseSoftOpaque = rgba(217,119,6,.06) върху бяло',
      /@keyframes rowPulseSoftOpaque\{0%,100%\{background:#fff;\}50%\{background:#fdf7f0;\}\}/);
    has('глобалният rowPulse е непипнат (календар, бадж „N дни!")',
      /@keyframes rowPulse\{0%,100%\{background:transparent;\}50%\{background:rgba\(220,38,38,\.07\);\}\}/);
    /* Заглавията по номер — ако колона се премести, nth-child-овете лъжат */
    const heads = id => Array.prototype.map.call(doc.getElementById(id).closest('table').querySelectorAll('thead th'), t => t.textContent.trim());
    const trH = heads('tr-body'), coH = heads('co-body');
    ok('Транспорт: колоните са на местата от CSS-а',
      trH[0] === 'Дата / Час' && trH[1] === 'Клиент' && trH[3] === 'Телефон' && trH[4] === 'Адрес' && trH[5] === 'Продукт' &&
      trH[7] === 'Доставка' && trH[8] === 'Статус' && trH[9] === 'Магазин', JSON.stringify(trH));
    ok('Клиентски: колоните са на местата от CSS-а',
      coH[0] === '№' && coH[1] === 'Дата / Час' && coH[2] === 'Клиент' && coH[3] === 'Телефон' && coH[5] === 'Продукт' &&
      coH[8] === 'Доставка' && coH[10] === 'Статус' && coH[11] === 'Магазин', JSON.stringify(coH));
  }

  section('2. enableDragScroll се закача при зареждане, веднъж');
  {
    const { w, doc } = await env();
    ok('функцията е в shared.js', typeof w.enableDragScroll === 'function');
    const trW = doc.getElementById('tr-body').closest('.tbl-wrap');
    const coW = doc.getElementById('co-body').closest('.tbl-wrap');
    ok('Транспорт: закачена от loadTransport()', trW._dragScroll === true);
    ok('Клиентски: закачена от loadClientOrders()', coW._dragScroll === true);
    guard('второ зареждане', () => { w.loadTransport(); w.enableDragScroll(trW); });
    Object.defineProperty(trW, 'scrollLeft', { value: 100, writable: true, configurable: true });
    drag(w, trW.querySelector('td'), null, -40);
    ok('двойното закачане не удвоява влаченето (100 − (−40) = 140)', trW.scrollLeft === 140, trW.scrollLeft);
  }

  for (const [name, bodyId, rowId, ovId] of [
    ['Транспорт', 'tr-body', 'tr-row-t-1', 'trd-ov'],
    ['Клиентски', 'co-body', 'co-row-c-1', 'cod-ov']
  ]) {
    section('3. ' + name + ': влачене 40px мести scrollLeft и спира click-а');
    {
      const { w, doc } = await env();
      const el = wrapOf(doc, bodyId);
      const tr = doc.getElementById(rowId);
      wireRow(w, tr);
      const cell = tr.querySelectorAll('td')[4];
      drag(w, cell, null, -40);
      ok('scrollLeft: 100 → 140', el.scrollLeft === 140, el.scrollLeft);
      ok('класът dragging е махнат след pointerup', !el.classList.contains('dragging'));
      click(w, cell);
      ok('click-ът след влачене НЕ отваря #' + ovId, !doc.getElementById(ovId));
      await ticks();
      click(w, cell);
      ok('следващ, истински click отваря #' + ovId + ' (флагът не виси)', !!doc.getElementById(ovId));
    }

    section('4. ' + name + ': движение 3px е клик — детайлът се отваря');
    {
      const { w, doc } = await env();
      const el = wrapOf(doc, bodyId);
      const tr = doc.getElementById(rowId);
      wireRow(w, tr);
      const cell = tr.querySelectorAll('td')[4];
      drag(w, cell, null, 3);
      ok('scrollLeft не мърда', el.scrollLeft === 100, el.scrollLeft);
      click(w, cell);
      ok('#' + ovId + ' се отваря', !!doc.getElementById(ovId));
    }

    section('5. ' + name + ': натискане върху <button> не влачи');
    {
      const { w, doc } = await env();
      const el = wrapOf(doc, bodyId);
      const tr = doc.getElementById(rowId);
      wireRow(w, tr);
      const b = Array.prototype.find.call(tr.querySelectorAll('button'), x => x.textContent.trim() === 'Статус');
      ok('бутон „Статус" в реда', !!b);
      const seen = [];
      w.openStatus = id => seen.push(id);
      if (b) {
        drag(w, b, tr.querySelectorAll('td')[4], -40);
        ok('scrollLeft не мърда', el.scrollLeft === 100, el.scrollLeft);
        /* Chrome праща click-а на общия родител — реда (измерено на живо) */
        click(w, tr);
        ok('пуснат върху друга клетка: #' + ovId + ' НЕ се отваря', !doc.getElementById(ovId));
        ok('и „Статус" не се задейства', seen.length === 0, JSON.stringify(seen));
        await ticks();
        drag(w, b, b, 8);
        click(w, b);
        ok('трепване 8px, пуснат върху същия бутон: „Статус" работи', seen.length === 1, JSON.stringify(seen));
        ok('и детайлът не се отваря (бутонът спира bubbling-а)', !doc.getElementById(ovId));
      }
    }

    section('6. ' + name + ': пръст (touch) не се пипа');
    {
      const { w, doc } = await env();
      const el = wrapOf(doc, bodyId);
      const tr = doc.getElementById(rowId);
      wireRow(w, tr);
      const cell = tr.querySelectorAll('td')[4];
      drag(w, cell, null, -40, { pointerType: 'touch' });
      ok('touch: scrollLeft не мърда (скролът е на браузъра)', el.scrollLeft === 100, el.scrollLeft);
      click(w, cell);
      ok('touch: тапът отваря #' + ovId, !!doc.getElementById(ovId));
    }
  }

  section('7. Мигане и подсветка идват от реда — с плътни анимации');
  {
    const OVER = { delivery: dayOffset(-3) };      /* просрочен → мига */
    const SOON = { delivery: dayOffset(1) };       /* утре → Транспорт мига меко */
    const trData = [Object.assign({}, TR[0], { id: 't-a' }, OVER), Object.assign({}, TR[0], { id: 't-b' }, SOON),
      Object.assign({}, TR[0], { id: 't-h' }, OVER)];
    const coData = [Object.assign({}, CO[0], { id: 'c-a' }, OVER), Object.assign({}, CO[0], { id: 'c-h' }, OVER)];
    const h = boot({ modules: ['transport.js', 'client-orders.js', 'notifications.js'], user: ADMIN,
      data: { transport_orders: trData, client_orders: coData, stores: [] } });
    const w = h.w, doc = h.doc;
    w._trHighlightId = 't-h';
    w._coHighlightId = 'c-h';
    guard('loadTransport()', () => w.loadTransport());
    guard('loadClientOrders()', () => w.loadClientOrders());
    await ticks(5);
    const st = id => ((doc.getElementById(id) || { getAttribute: () => '' }).getAttribute('style') || '');
    ok('Транспорт просрочен: animation:rowPulseOpaque', /animation:rowPulseOpaque 1\.8s/.test(st('tr-row-t-a')), st('tr-row-t-a'));
    ok('Транспорт утре: animation:rowPulseSoftOpaque', /animation:rowPulseSoftOpaque 2\.5s/.test(st('tr-row-t-b')), st('tr-row-t-b'));
    ok('Клиентски просрочен: animation:rowPulseOpaque', /animation:rowPulseOpaque 2s/.test(st('co-row-c-a')), st('co-row-c-a'));
    ok('никой ред в двете таблици не ползва полупрозрачния rowPulse/rowPulseSoft',
      !/animation:rowPulse(Soft)? /.test(doc.getElementById('tr-body').innerHTML + doc.getElementById('co-body').innerHTML));
    ok('Транспорт подсветен просрочен: жълт и НЕ мига (анимацията би скрила жълтото)',
      /background:#fef9c3/.test(st('tr-row-t-h')) && !/animation/.test(st('tr-row-t-h')), st('tr-row-t-h'));
    ok('Клиентски подсветен просрочен: жълт и НЕ мига',
      /background:#fef9c3/.test(st('co-row-c-h')) && !/animation/.test(st('co-row-c-h')), st('co-row-c-h'));
    ok('подсветката е еднократна — идентификаторите са изчистени след рендера',
      !w._trHighlightId && !w._coHighlightId);
    guard('втори рендер', () => { w.renderTransport(); w.renderClientOrders(); });
    ok('при следващия рендер подсветеният ред пак мига (Транспорт)', /animation:rowPulseOpaque/.test(st('tr-row-t-h')), st('tr-row-t-h'));
    ok('при следващия рендер подсветеният ред пак мига (Клиентски)', /animation:rowPulseOpaque/.test(st('co-row-c-h')), st('co-row-c-h'));
  }

  report();
})();
