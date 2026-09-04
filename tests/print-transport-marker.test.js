/* Бланки за печат: визуален маркер „ТРАНСПОРТ" + четим SAP номер.

   Три места, една цел — бланката да се разпознава от пръв поглед и SAP-ът
   да се чете на хартия:
     transport.js  renderTransportPrint() → икона на бус + ред ТРАНСПОРТ
     shared.js     itemsPrintLine()       → SAP в monospace 11pt bold
     shared.js     itemsPrintBlock()      → SAP от 9px #aaa на 12px #111 bold

   itemsPrintBlock() се вика САМО от client-orders.js (renderPrint), затова
   клиентската бланка се проверява през нея, а не през самия client-orders.js.

   Пускане от корена на репото:
     node tests/print-transport-marker.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, dayOffset, tsOffset } = H;

/* ── Данни ───────────────────────────────────────────────────────────────── */
const ITEM_SAP   = { product: 'БОЙЛЕР 80Л', color: 'бял', sap: '10012345', qty: 2, unit: 'бр.' };
const ITEM_NOSAP = { product: 'МОНТАЖ',     color: '',    sap: '',         qty: 1, unit: 'бр.' };

const CLIENT_ORDERS = [
  { id: 'co-1', in_num: '0001', store_name: 'Враца', date: dayOffset(-3), hour: '10:00', bon: '000111',
    customer_name: 'Иван Петров', phone: '0888111222', address: 'ул. Христо Ботев 5',
    product: ITEM_SAP.product, sap: ITEM_SAP.sap, qty: ITEM_SAP.qty, unit: ITEM_SAP.unit,
    items: [ITEM_SAP, ITEM_NOSAP],
    from_store: 'Враца', fulfiller: 'Логистичен склад Добрич', agent: 'Управител Враца',
    delivery: dayOffset(6), status: 'pending', note: '', created_at: tsOffset(-3),
    paid_transport: false, transport_id: null }
];

const TRANSPORT_ORDERS = [
  { id: 'tr-1', in_num: '5001', store_name: 'Враца', date: dayOffset(-2), hour: '14:00', bon: '000999',
    customer_name: 'Мария Георгиева', phone: '0888333444', address: 'ул. Кирил и Методий 12',
    product: ITEM_SAP.product, sap: ITEM_SAP.sap, qty: ITEM_SAP.qty, unit: ITEM_SAP.unit,
    items: [ITEM_SAP],
    delivery: dayOffset(5), status: 'pending', notes: '', created_at: tsOffset(-2),
    client_order_num: null, paid_transport: false }
];

const USER = { email: 'vr@temax.bg', display_name: 'Управител Враца', role: 'manager', store_name: 'Враца' };

function env() {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: USER,
    data: { client_orders: CLIENT_ORDERS, transport_orders: TRANSPORT_ORDERS, stores: [] }
  });
  h.w.transportOrders = JSON.parse(JSON.stringify(TRANSPORT_ORDERS));
  h.w.clientOrders    = JSON.parse(JSON.stringify(CLIENT_ORDERS));
  return h;
}

/* Изважда style атрибута на реда, който носи "SAP: " — за да не се проверява
   целият HTML на бланката. #aaa стои и на други места (напр. .p-cut), тоест
   търсене в целия HTML щеше да е червено независимо от поправката. */
function sapRowStyle(html) {
  const m = html.match(/<div style="([^"]*)">SAP: /);
  return m ? m[1] : null;
}

/* ══════════ 1. Транспортна бланка — маркер „ТРАНСПОРТ" + икона ══════════ */
section('1. Транспортна бланка: визуален маркер');
{
  const { w, doc } = env();
  if (guard('renderTransportPrint() не хвърля', () => w.renderTransportPrint(w.transportOrders[0]))) {
    const html = doc.getElementById('mod-print').innerHTML;

    ok('бланката носи надпис ТРАНСПОРТ', html.indexOf('ТРАНСПОРТ') >= 0);
    ok('надписът е в .p-title, не случаен текст', /class="p-title"[^>]*>ТРАНСПОРТ</.test(html));
    ok('има inline SVG икона', html.indexOf('<svg') >= 0);
    ok('иконата е класът .p-van', /<svg[^>]*class="p-van"/.test(html));

    /* Бланката се печата два пъти на лист (откъсва се по пунктира) — маркерът
       трябва да е и в двете половини, иначе долната пак не се разпознава. */
    ok('маркерът е в ДВЕТЕ половини', (html.match(/class="p-title"/g) || []).length === 2);
    ok('иконата е в ДВЕТЕ половини', (html.match(/class="p-van"/g) || []).length === 2);

    ok('CSS-ът дефинира .p-van', /\.p-van\{[^}]*width:14mm/.test(html));
    ok('CSS-ът дефинира .p-title', /\.p-title\{[^}]*font-size:16pt/.test(html));

    /* Главата е ДВЕ деца: ляв блок (бус + текст) и логото. При три деца
       space-between разпъваше текста в средата вместо да го държи вляво. */
    const root  = doc.getElementById('mod-print');
    const heads = root.querySelectorAll('.p-head');
    const lefts = root.querySelectorAll('.p-head-left');
    const all   = function (list, fn) { return Array.prototype.every.call(list, fn); };

    /* ⚠ Два капана, хванати при обратната проверка срещу d20b312:
       - every() върху ПРАЗЕН NodeList връща true, тоест проверка без
         `.length === 2` минава и когато елементът изобщо го няма;
       - `className` на SVG елемент е SVGAnimatedString, НЕ низ, тоест
         `svg.className === 'p-van'` е винаги false и такова твърдение не
         може да падне. Затова навсякъде долу е getAttribute('class'). */
    const cls = function (el) { return el.getAttribute('class'); };

    ok('има две глави (по една на половина)', heads.length === 2);
    ok('.p-head има точно 2 деца', heads.length === 2 && all(heads, function (h) { return h.children.length === 2; }),
      Array.prototype.map.call(heads, function (h) { return h.children.length; }).join(','));
    ok('първото дете е .p-head-left', heads.length === 2 && all(heads, function (h) { return cls(h.children[0]) === 'p-head-left'; }));
    ok('второто дете е логото', heads.length === 2 && all(heads, function (h) { return cls(h.children[1]) === 'p-logo'; }));

    ok('.p-head-left е в двете половини', lefts.length === 2);
    ok('бусът е ВЪТРЕ в .p-head-left', lefts.length === 2 && all(lefts, function (l) { return !!l.querySelector('svg.p-van'); }));
    ok('.p-title е ВЪТРЕ в .p-head-left', lefts.length === 2 && all(lefts, function (l) { return !!l.querySelector('.p-title'); }));
    ok('бусът вече НЕ е пряко дете на .p-head',
      heads.length === 2 && all(heads, function (h) { return !Array.prototype.some.call(h.children, function (c) { return cls(c) === 'p-van'; }); }));

    /* gap-ът слезе от .p-head в .p-head-left — там дели буса от текста.
       Регексът иска литерална скоба след p-head, за да не хване p-head-left. */
    ok('.p-head-left е flex ред', /\.p-head-left\{[^}]*display:flex/.test(html));
    ok('.p-head-left има gap:5mm', /\.p-head-left\{[^}]*gap:5mm/.test(html));
    ok('.p-head вече НЯМА gap', !/\.p-head\{[^}]*gap:/.test(html));

    /* Иконата е редом с текста във flex ред, не под него — иначе височината
       на половината расте и двете спират да се събират на един лист. */
    ok('.p-head е още flex ред', /\.p-head\{[^}]*display:flex/.test(html));
    ok('.p-van не се свива', /\.p-van\{[^}]*flex-shrink:0/.test(html));

    /* А4 бюджетът: 190mm ширина / 10mm поле. CLAUDE.md т.12 — не се пипа. */
    ok('ширината 190mm е непроменена', /\.p-wrap\{[^}]*width:190mm/.test(html));
    ok('полето 10mm е непроменено', html.indexOf('@page{size:A4 portrait;margin:10mm;}') >= 0);

    /* Обвивката около .p-wrap е max-width:680px + padding:16px и НЕ е
       .no-print, тоест в печата свиваше съдържанието до 171.46mm, а
       .p-wrap е твърдо 190mm — листът тръгваше от 9.27mm и свършваше на
       199.27mm, значи логото вдясно падаше ИЗЦЯЛО извън печатната площ.
       Мерено в браузър, jsdom не смята лейаут. Решението е по модела на
       .cp-wrap в client-orders.js. */
    const wrapper = root.querySelector('div.tp-wrap');
    if (ok('обвивката има клас tp-wrap', !!wrapper)) {
      ok('inline стилът за екрана е запазен', /max-width:680px/.test(wrapper.getAttribute('style')));
      ok('.p-wrap е вътре в обвивката', !!wrapper.querySelector('.p-wrap'));
    }

    /* Правилото ТРЯБВА да е вътре в @media print — вън от него би разпънало
       и екранния преглед. Срезът свършва на .p-wrap{, първото правило
       СЛЕД затварянето на медия блока. */
    const printBlock = html.slice(html.indexOf('@media print{'), html.indexOf('.p-wrap{'));
    ok('.tp-wrap правилото е ВЪТРЕ в @media print',
      printBlock.indexOf('.tp-wrap{max-width:none!important;padding:0!important;}') >= 0, printBlock);

    ok('логото TeMAX е останало', /class="p-logo"/.test(html));
    ok('името на магазина е останало', html.indexOf('Враца') >= 0);
  }
}

/* ══════════ 2. Транспортна бланка — SAP на реда с продуктите ══════════ */
section('2. itemsPrintLine: SAP се чете на хартия');
{
  const { w, doc } = env();
  const line = w.itemsPrintLine({ items: [ITEM_SAP] });

  ok('SAP-ът е удебелен monospace', /<b style="font-family:monospace;font-size:11pt;">10012345<\/b>/.test(line));
  ok('форматът "SAP - продукт (цвят) — qty ед." е запазен',
    line.replace(/<[^>]*>/g, '') === '10012345 - БОЙЛЕР 80Л (бял) — 2 бр.',
    line.replace(/<[^>]*>/g, ''));

  /* Артикул без SAP не бива да получи празен <b> */
  const noSap = w.itemsPrintLine({ items: [ITEM_NOSAP] });
  ok('без SAP няма празен <b>', noSap.indexOf('<b') < 0, noSap);
  ok('без SAP продуктът пак се вижда', noSap.indexOf('МОНТАЖ') >= 0);

  /* И през реалния рендер, не само през помощника */
  w.renderTransportPrint(w.transportOrders[0]);
  const html = doc.getElementById('mod-print').innerHTML;
  ok('и в самата бланка SAP-ът е monospace', /font-family:monospace;font-size:11pt;">10012345</.test(html));
}

/* ══════════ 3. Клиентска бланка — SAP от 9px #aaa на 12px #111 ══════════ */
section('3. itemsPrintBlock: SAP не е вече сив 9px');
{
  const { w, doc } = env();
  const block = w.itemsPrintBlock({ items: [ITEM_SAP] });
  const style = sapRowStyle(block);

  if (ok('SAP редът съществува', !!style, block.slice(0, 200))) {
    ok('SAP редът НЕ е сив #aaa', style.indexOf('#aaa') < 0, style);
    ok('SAP редът НЕ е 9px', style.indexOf('font-size:9px') < 0, style);
    ok('SAP редът е 12px', style.indexOf('font-size:12px') >= 0, style);
    ok('SAP редът е удебелен', style.indexOf('font-weight:700') >= 0, style);
    ok('SAP редът е monospace', style.indexOf('font-family:monospace') >= 0, style);
    ok('SAP редът е черен #111', style.indexOf('color:#111') >= 0, style);
  }
  ok('текстът "SAP: " е останал', block.indexOf('SAP: ') >= 0);
  ok('номерът се вижда', block.indexOf('10012345') >= 0);

  /* Нищо друго в блока не се променя */
  ok('името на продукта е непипнато', /<div style="font-size:12px;font-weight:700;">БОЙЛЕР 80Л<\/div>/.test(block));
  ok('цветът е непипнат', /<div style="font-size:10px;color:#888;">бял<\/div>/.test(block));
  ok('количеството е непипнато', block.indexOf('2 бр.') >= 0);
  ok('заглавието "Артикули" е останало', block.indexOf('Артикули') >= 0);

  /* Артикул без SAP → редът изобщо липсва, не празен ред */
  const noSap = w.itemsPrintBlock({ items: [ITEM_NOSAP] });
  ok('без SAP редът липсва напълно', noSap.indexOf('SAP: ') < 0, noSap);

  /* И през реалния рендер на клиентската бланка */
  if (guard('renderPrint() не хвърля', () => w.renderPrint(w.clientOrders[0]))) {
    const html = doc.getElementById('mod-print').innerHTML;
    const s = sapRowStyle(html);
    if (ok('SAP редът е в клиентската бланка', !!s, html.slice(0, 200))) {
      ok('и там НЕ съдържа #aaa', s.indexOf('#aaa') < 0, s);
      ok('и там е 12px monospace bold',
        s.indexOf('font-size:12px') >= 0 && s.indexOf('font-family:monospace') >= 0 && s.indexOf('font-weight:700') >= 0, s);
    }
    ok('клиентската бланка НЕ носи маркера ТРАНСПОРТ', html.indexOf('ТРАНСПОРТ') < 0);
  }
}

report();
