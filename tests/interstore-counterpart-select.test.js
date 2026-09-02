/* „Разлики" → нова бланка → посока „Междускладов трансфер":
   менюто „Обект изпращач" предлага САМО логистичните складове.

   Защо: менюто се пълнеше с fillStoreSelect() от allStoresCache, тоест с
   всичките 23 обекта. Управителят избираше „Търговище" (магазина), а не
   „Логистичен склад Търговище". Складът филтрира бланките си по
   counterpart === currentUser.store_name, значи такава бланка не стига до
   никого и мълчи. Реален случай: 2 бланки от Петрич от 30.08.2026.

   Второ: празен counterpart минаваше тихо през submitDiffReport() — и двата
   списъка (складове и доставчици) тръгват от празна опция, тоест „не съм
   избрал" е стойността по подразбиране, не изключение.

   Пускане:  node tests/interstore-counterpart-select.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, fire, ticks } = H;

/* Управител на магазин Петрич — точно човекът от реалния случай.
   assignedStores() връща ['Петрич'] (не е глобална роля), значи полето
   „Магазин" е заключен hidden input и не изисква избор. */
const PETRICH = {
  email: 'petrich@temax.bg', display_name: 'Управител Петрич',
  role: 'manager', store_name: 'Петрич', assigned_stores: []
};

/* Списъкът от таблицата stores — нарочно съдържа И „Търговище" (магазина),
   И „Логистичен склад Търговище" (склада). Точно тази двойка ражда бъга. */
const STORES = [
  { name: 'Гоце Делчев' }, { name: 'Логистичен склад Добрич' },
  { name: 'Логистичен склад Търговище' }, { name: 'Петрич' },
  { name: 'Търговище' }, { name: 'Централен офис' }
];
const SUPPLIERS = [{ name: 'ТЕСИ ООД' }, { name: 'ТАГЕМАЛ' }];

function env() {
  const h = boot({
    /* transport.js преди stock-differences.js — редът от index.html. */
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: PETRICH,
    confirm: true,
    data: {
      stock_differences: [], differences_reports: [], stock_returns: [],
      transport_orders: [], users: [], stores: STORES, contacts: SUPPLIERS
    }
  });
  h.w.sdData = []; h.w.diffReports = []; h.w.transportOrders = [];
  return h;
}

/* Текстовете на опциите — сравняваме ТОЧНО, не по съдържане: низът
   „Търговище" е подниз на „Логистичен склад Търговище" и проверка с
   indexOf би минавала и срещу непоправен код. */
function optTexts(sel) {
  return Array.prototype.map.call(sel.options, o => o.textContent.trim());
}
function cpSel(doc) { return doc.getElementById('diff-counterpart'); }

(async function () {

  section('1. Посока по подразбиране (междускладов) — само логистичните складове');
  {
    const h = env();
    h.w.openDiffSubmitModal();
    await ticks();

    const dir = h.doc.getElementById('diff-direction');
    ok('посоката по подразбиране е "interstore"', dir.value === 'interstore', dir.value);
    ok('етикетът е „Обект изпращач"',
      h.doc.getElementById('diff-counterpart-label').textContent === 'Обект изпращач',
      h.doc.getElementById('diff-counterpart-label').textContent);

    const sel = cpSel(h.doc);
    const WH = h.w.LOGISTICS_WAREHOUSES;
    const texts = optTexts(sel);
    ok('LOGISTICS_WAREHOUSES е достъпен глобално', Array.isArray(WH) && WH.length === 2,
      JSON.stringify(WH));
    ok('опциите са точно 1 (празна) + ' + WH.length + ' склада',
      sel.options.length === 1 + WH.length, 'реално: ' + sel.options.length + ' → ' + texts.join(' | '));
    ok('първата опция е празна („-- Избери склад --")',
      sel.options[0].value === '' && texts[0].indexOf('Избери склад') >= 0, texts[0]);
    ok('и двата склада са в списъка',
      WH.every(n => texts.indexOf(n) >= 0), texts.join(' | '));
    ok('НЯМА опция „Търговище" (магазина)', texts.indexOf('Търговище') < 0, texts.join(' | '));
    ok('НЯМА опция „Петрич" (собственият обект)', texts.indexOf('Петрич') < 0, texts.join(' | '));
    ok('нито един друг обект от stores не е попаднал вътре',
      texts.indexOf('Гоце Делчев') < 0 && texts.indexOf('Централен офис') < 0, texts.join(' | '));
    ok('стойността по подразбиране е празна (не първият склад)',
      sel.value === '', JSON.stringify(sel.value));
    ok('списъкът НЕ е дърпан със заявка към stores',
      !h.calls.get.some(u => /\/stores\b|rest\/v1\/stores/.test(u)),
      h.calls.get.join(' | '));
  }

  section('2. Смяна на посоката към „Доставчик" — списъкът идва от доставчиците');
  {
    const h = env();
    h.w.openDiffSubmitModal();
    await ticks();

    const dir = h.doc.getElementById('diff-direction');
    dir.value = 'supplier';
    fire(h.w, dir, 'change');           /* истински onchange, не пряко извикване */
    await ticks();

    const sel = cpSel(h.doc);
    const texts = optTexts(sel);
    ok('етикетът е „Доставчик"',
      h.doc.getElementById('diff-counterpart-label').textContent === 'Доставчик',
      h.doc.getElementById('diff-counterpart-label').textContent);
    ok('опциите са доставчиците',
      texts.indexOf('ТЕСИ ООД') >= 0 && texts.indexOf('ТАГЕМАЛ') >= 0, texts.join(' | '));
    ok('складовете НЕ се показват при посока „Доставчик"',
      h.w.LOGISTICS_WAREHOUSES.every(n => texts.indexOf(n) < 0), texts.join(' | '));

    /* Обратно към междускладов — списъкът се връща на складовете. */
    dir.value = 'interstore';
    fire(h.w, dir, 'change');
    await ticks();
    const back = optTexts(cpSel(h.doc));
    ok('връщането към „Междускладов" пак дава само складовете',
      cpSel(h.doc).options.length === 1 + h.w.LOGISTICS_WAREHOUSES.length &&
      back.indexOf('ТЕСИ ООД') < 0, back.join(' | '));
  }

  section('3. Празен изпращач при междускладов — подаването спира');
  {
    const h = env();
    h.w.openDiffSubmitModal();
    await ticks();
    h.doc.querySelector('#diff-items .di-name').value = 'ЩУЦЕР МЕТАЛЕН';
    h.doc.querySelector('#diff-items .di-qty').value = '10';
    h.doc.querySelector('#diff-items .di-qty-real').value = '8';
    ok('counterpart наистина е празен преди подаването', cpSel(h.doc).value === '');

    realClick(h.w, btn(h.doc.getElementById('diff-submit-ov'), 'Подай бланка'));
    await ticks();

    ok('съобщението е „Избери склад изпращач"',
      h.calls.toast.some(t => String(t.msg || t).indexOf('Избери склад изпращач') >= 0),
      JSON.stringify(h.calls.toast));
    ok('НЕ казва „Избери доставчик"',
      !h.calls.toast.some(t => String(t.msg || t).indexOf('Избери доставчик') >= 0),
      JSON.stringify(h.calls.toast));
    ok('НИКАКЪВ sbPost — нито бланка, нито редове',
      h.calls.post.length === 0, JSON.stringify(h.calls.post.map(p => p.table)));
  }

  section('4. Празен доставчик при посока „Доставчик" — другото съобщение');
  {
    const h = env();
    h.w.openDiffSubmitModal();
    await ticks();
    const dir = h.doc.getElementById('diff-direction');
    dir.value = 'supplier';
    fire(h.w, dir, 'change');
    await ticks();
    h.doc.querySelector('#diff-items .di-name').value = 'ПРОФИЛ ПВЦ';
    h.doc.querySelector('#diff-items .di-qty').value = '4';

    realClick(h.w, btn(h.doc.getElementById('diff-submit-ov'), 'Подай бланка'));
    await ticks();
    ok('съобщението е „Избери доставчик"',
      h.calls.toast.some(t => String(t.msg || t).indexOf('Избери доставчик') >= 0),
      JSON.stringify(h.calls.toast));
    ok('нищо не се записва', h.calls.post.length === 0,
      JSON.stringify(h.calls.post.map(p => p.table)));
  }

  section('5. Положителният път — избран склад стига до базата с ПЪЛНОТО име');
  {
    const h = env();
    h.w.openDiffSubmitModal();
    await ticks();
    cpSel(h.doc).value = 'Логистичен склад Търговище';
    ok('стойността се приема (опцията съществува)',
      cpSel(h.doc).value === 'Логистичен склад Търговище', cpSel(h.doc).value);
    h.doc.getElementById('diff-docnum').value = '180491138';
    h.doc.querySelector('#diff-items .di-name').value = 'БАТЕРИЯ DURACELL';
    h.doc.querySelector('#diff-items .di-qty').value = '10';
    h.doc.querySelector('#diff-items .di-qty-real').value = '8';

    realClick(h.w, btn(h.doc.getElementById('diff-submit-ov'), 'Подай бланка'));
    await ticks(); await ticks();

    const rep = h.calls.post.find(p => p.table === 'differences_reports');
    if (ok('бланката се записва', !!rep, JSON.stringify(h.calls.toast))) {
      const body = Array.isArray(rep.body) ? rep.body[0] : rep.body;
      ok('counterpart е „Логистичен склад Търговище", не „Търговище"',
        body.counterpart === 'Логистичен склад Търговище', JSON.stringify(body.counterpart));
      ok('store_name е подателят (Петрич)', body.store_name === 'Петрич',
        JSON.stringify(body.store_name));
      ok('direction е interstore', body.direction === 'interstore', body.direction);
    }
  }

  section('6. Анти-тавтология — старият код (fillStoreSelect) би паднал');
  {
    const h = env();
    h.w.openDiffSubmitModal();
    await ticks();
    const sel = cpSel(h.doc);
    const WH = h.w.LOGISTICS_WAREHOUSES;

    /* Възпроизвеждаме ТОЧНО стария клон: loadAllStores() → fillStoreSelect().
       Ако проверките горе минаваха и срещу него, те не проверяват нищо. */
    await h.w.loadAllStores();
    h.w.fillStoreSelect(sel, '');
    const texts = optTexts(sel);
    ok('старият клон връща „Търговище" в списъка', texts.indexOf('Търговище') >= 0,
      texts.join(' | '));
    ok('и броят опции е различен от 1 + брой складове',
      sel.options.length !== 1 + WH.length,
      'реално: ' + sel.options.length + ' срещу очаквани ' + (1 + WH.length));
    ok('тоест проверките от секция 1 биха паднали срещу непоправен код',
      texts.indexOf('Търговище') >= 0 && sel.options.length !== 1 + WH.length);
  }

  report();
})();
