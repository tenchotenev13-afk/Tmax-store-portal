/* lookupCatalogBySap() е споделена: ползват я Клиентски заявки, Транспорт
   (.item-row) и Разлики (.diff-item-row). Затова трите модула се зареждат
   ЗАЕДНО, в реалния ред от index.html.

   Покрива: търсене по sap_code, резервно търсене по ean_code (баркод в полето
   SAP при нов артикул), замяната на баркода с истинския SAP код, двусмислен
   баркод (ean_code не е уникален) и пълна несполука.

   Пускане:  node tests/catalog-lookup.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, fire, ticks } = H;

const STORE = { email: 'vraca@temax.bg', display_name: 'Управител Враца',
                role: 'manager', store_name: 'Враца' };

/* Каталогът отговаря според query string-а, както прави PostgREST. */
function catalog(url) {
  const m = decodeURIComponent(url);
  if (/sap_code=eq\.34989/.test(m)) return [{ sap_code: '34989', product_name: 'ЩУЦЕР МЕТАЛЕН', default_unit: 'бр.', ean_code: '3800111222333' }];
  if (/sap_code=eq\./.test(m)) return [];                     /* всеки друг SAP - няма го */
  if (/ean_code=eq\.3800111222333/.test(m)) return [{ sap_code: '34989', product_name: 'ЩУЦЕР МЕТАЛЕН', default_unit: 'бр.' }];
  if (/ean_code=eq\.3800999888777/.test(m)) return [           /* един артикул, дублиран ред */
    { sap_code: '55501', product_name: 'КРАН СПИРАТЕЛЕН', default_unit: 'бр.' },
    { sap_code: '55501', product_name: 'КРАН СПИРАТЕЛЕН', default_unit: 'бр.' }];
  if (/ean_code=eq\.3800000000001/.test(m)) return [           /* ДВА различни артикула */
    { sap_code: '11111', product_name: 'ЛАМПА LED', default_unit: 'бр.' },
    { sap_code: '22222', product_name: 'ЛАМПА ХАЛОГЕН', default_unit: 'бр.' }];
  if (/ean_code=eq\.3800000000002/.test(m)) return [{ sap_code: null, product_name: 'БЕЗ SAP В КАТАЛОГА' }];
  return [];
}

function env() {
  const h = boot({
    modules: ['client-orders.js', 'transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: STORE,
    data: {
      stock_differences: [], differences_reports: [], stock_returns: [],
      client_orders: [], transport_orders: [], product_catalog: catalog
    }
  });
  h.w.sdData = []; h.w.diffReports = [];
  return h;
}

/* Ред от формата за разлики + въведен код в полето SAP */
async function diffLookup(h, code) {
  const { w, doc } = h;
  if (!doc.getElementById('diff-submit-ov')) w.openDiffSubmitModal();
  const sapEl = doc.querySelector('.di-sap');
  sapEl.value = code;
  fire(w, sapEl, 'blur');
  await ticks(); await ticks();
  const row = sapEl.closest('.diff-item-row');
  return { sapEl, row, nameEl: row.querySelector('.di-name'),
           hint: row.querySelector('.di-lookup-hint') };
}

(async function () {

  section('1. Трите модула заредени заедно — функцията е една и съща');
  {
    const { w, doc } = env();
    ok('lookupCatalogBySap съществува', typeof w.lookupCatalogBySap === 'function');
    ok('setCatalogHint съществува', typeof w.setCatalogHint === 'function');
    ok('itemRowHtml (клиентски/транспорт) съществува', typeof w.itemRowHtml === 'function');
    ok('diffItemRowHtml (разлики) съществува', typeof w.diffItemRowHtml === 'function');
    ok('редът за разлики има място за бележка',
      w.diffItemRowHtml({}, 'supplier').indexOf('di-lookup-hint') >= 0);
    ok('редът за клиентски/транспорт НЯМА такова място',
      w.itemRowHtml({}).indexOf('di-lookup-hint') < 0);
  }

  section('2. Валиден SAP код — както досега, без бележка');
  {
    const h = env();
    const r = await diffLookup(h, '34989');
    ok('името се попълва', r.nameEl.value === 'ЩУЦЕР МЕТАЛЕН', r.nameEl.value);
    ok('полето SAP не се пипа', r.sapEl.value === '34989');
    ok('няма бележка', r.hint.innerHTML === '', r.hint.innerHTML);
  }

  section('3. Баркод в полето SAP — намира се по ean_code');
  {
    const h = env();
    const r = await diffLookup(h, '3800111222333');
    ok('името се попълва', r.nameEl.value === 'ЩУЦЕР МЕТАЛЕН', r.nameEl.value);
    ok('баркодът е заменен с истинския SAP', r.sapEl.value === '34989', r.sapEl.value);
    ok('има бележка какво е станало', r.hint.innerHTML.indexOf('Разпознат по баркод') >= 0);
    ok('бележката показва новия SAP', r.hint.innerHTML.indexOf('34989') >= 0);
    ok('бележката показва и въведения баркод', r.hint.innerHTML.indexOf('3800111222333') >= 0);
  }

  section('4. Един артикул, дублиран ред в каталога — пак се попълва');
  {
    const h = env();
    const r = await diffLookup(h, '3800999888777');
    ok('името се попълва', r.nameEl.value === 'КРАН СПИРАТЕЛЕН', r.nameEl.value);
    ok('SAP е заменен', r.sapEl.value === '55501', r.sapEl.value);
  }

  section('5. Двусмислен баркод (2 различни SAP) — нищо не се гадае');
  {
    const h = env();
    const r = await diffLookup(h, '3800000000001');
    ok('името ОСТАВА празно', r.nameEl.value === '', r.nameEl.value);
    ok('полето SAP остава както е въведено', r.sapEl.value === '3800000000001', r.sapEl.value);
    ok('бележката предупреждава', r.hint.innerHTML.indexOf('различни артикула') >= 0, r.hint.innerHTML);
    ok('бележката изброява двата SAP кода',
      r.hint.innerHTML.indexOf('11111') >= 0 && r.hint.innerHTML.indexOf('22222') >= 0);
  }

  section('6. Артикулът изобщо го няма — случаят на магазина');
  {
    const h = env();
    const r = await diffLookup(h, '3800123456789');
    ok('името остава празно (не се измисля)', r.nameEl.value === '');
    ok('кодът остава както е въведен', r.sapEl.value === '3800123456789');
    ok('има бележка "не е в каталога"', r.hint.innerHTML.indexOf('не е в каталога') >= 0, r.hint.innerHTML);
    ok('бележката казва да се впише ръчно', r.hint.innerHTML.indexOf('ръчно') >= 0);
    ok('фокусът отива в полето за наименование',
      h.doc.activeElement === r.nameEl, h.doc.activeElement && h.doc.activeElement.className);
  }

  section('7. Намерен по баркод, но без SAP в каталога');
  {
    const h = env();
    const r = await diffLookup(h, '3800000000002');
    ok('името се попълва', r.nameEl.value === 'БЕЗ SAP В КАТАЛОГА', r.nameEl.value);
    ok('кодът остава баркодът', r.sapEl.value === '3800000000002');
    ok('бележката предупреждава да се провери', r.hint.innerHTML.indexOf('няма SAP код') >= 0, r.hint.innerHTML);
  }

  section('8. Вече въведено име не се презаписва');
  {
    const h = env();
    h.w.openDiffSubmitModal();
    const nameEl = h.doc.querySelector('.di-name');
    nameEl.value = 'МОЕТО ИМЕ';
    const r = await diffLookup(h, '34989');
    ok('ръчното име остава', r.nameEl.value === 'МОЕТО ИМЕ', r.nameEl.value);
  }

  section('9. Клиентски заявки / Транспорт — редът работи без бележка');
  {
    const { w, doc } = env();
    const host = doc.createElement('div');
    host.innerHTML = w.itemRowHtml({});
    doc.body.appendChild(host);
    const sapEl = host.querySelector('.item-sap');
    const prodEl = host.querySelector('.item-product');
    ok('полето вика lookupCatalogBySap',
      (sapEl.getAttribute('onblur') || '').indexOf('lookupCatalogBySap') >= 0);

    sapEl.value = '34989';
    if (guard('onblur не хвърля без .di-lookup-hint', () => fire(w, sapEl, 'blur'))) {
      await ticks(); await ticks();
      ok('продуктът се попълва', prodEl.value === 'ЩУЦЕР МЕТАЛЕН', prodEl.value);
      ok('мерната единица се избира', host.querySelector('.item-unit').value === 'бр.');
    }

    /* баркод в клиентска заявка - същата полза, без бележка */
    const host2 = doc.createElement('div');
    host2.innerHTML = w.itemRowHtml({});
    doc.body.appendChild(host2);
    const sap2 = host2.querySelector('.item-sap');
    sap2.value = '3800111222333';
    if (guard('баркод в .item-row не хвърля', () => fire(w, sap2, 'blur'))) {
      await ticks(); await ticks();
      ok('продуктът се попълва и по баркод',
        host2.querySelector('.item-product').value === 'ЩУЦЕР МЕТАЛЕН');
      ok('SAP се заменя и тук', sap2.value === '34989', sap2.value);
    }

    /* несполука в .item-row - без бележка, без фокус кражба, без гърмеж */
    const host3 = doc.createElement('div');
    host3.innerHTML = w.itemRowHtml({});
    doc.body.appendChild(host3);
    const sap3 = host3.querySelector('.item-sap');
    sap3.value = '9999999999999';
    if (guard('несполука в .item-row не хвърля', () => fire(w, sap3, 'blur'))) {
      await ticks(); await ticks();
      ok('продуктът остава празен', host3.querySelector('.item-product').value === '');
      ok('кодът остава както е въведен', sap3.value === '9999999999999');
    }
  }

  section('10. Празно поле и грешка от сървъра');
  {
    const { w, doc } = env();
    w.openDiffSubmitModal();
    const sapEl = doc.querySelector('.di-sap');
    sapEl.value = '';
    if (guard('празно поле не праща заявка', () => fire(w, sapEl, 'blur'))) {
      await ticks();
      ok('няма заявка към каталога',
        env().calls.get.filter(u => /product_catalog/.test(u)).length === 0);
    }
  }
  {
    const h = boot({
      modules: ['stock-returns.js', 'stock-differences.js'],
      user: STORE,
      data: { stock_differences: [], differences_reports: [], stock_returns: [], product_catalog: [] },
      fail: { GET: { status: 500, url: /product_catalog/, body: { message: 'boom' } } }
    });
    h.w.sdData = []; h.w.diffReports = [];
    h.w.openDiffSubmitModal();
    const sapEl = h.doc.querySelector('.di-sap');
    sapEl.value = '34989';
    if (guard('HTTP грешка не хвърля', () => fire(h.w, sapEl, 'blur'))) {
      await ticks(); await ticks();
      const row = sapEl.closest('.diff-item-row');
      ok('няма подвеждаща бележка при сървърна грешка',
        row.querySelector('.di-lookup-hint').innerHTML === '',
        row.querySelector('.di-lookup-hint').innerHTML);
      ok('полето остава непроменено', sapEl.value === '34989');
    }
  }

  report();
})();
