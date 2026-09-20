/* Размяна между магазини, стъпка 3: бутоните НА МАГАЗИНИТЕ в панела.

   Досега размяната се движеше само от склада — свързва, развързва, приключва.
   Средата ѝ („изпратено" → „прието") нямаше кой да я запише. Сега я записват
   двата магазина, и то по РАЗЛИЧЕН път според вида:

     kind='doc'      стоката НЕ пътува — трансфер магазин→магазин в SAP:
                     изпращачът пуска трансфера („📄 ПУСНАТО В SAP", само SAP
                     номер), получателят го приема („📄 ПРИЕТО В SAP");
     kind='physical' стоката пътува: изпращачът казва С КАКВО, на коя дата и
                     с кой документ („🚚 ИЗПРАТЕНО КЪМ X"), получателят
                     потвърждава, че я е получил („📬 ПРИЕТО ОТ X").

   НАЙ-ВАЖНАТА проверка тук е отрицателна: при doc в PATCH-а НЕ бива да има
   ключ transport_mode. Не „да е null" — да ГО НЯМА. Стоката не пътува, превоз
   няма, а null в колоната изглежда като „още не е попълнено".

   Втората е за закъснението: размяна, изпратена преди повече от 5 дни и още
   неприета, светва в червено за ВСИЧКИ роли — това е сигнал, не бутон, и го
   вижда и този, който не може да го оправи.

   Пускане:  node tests/sd-swap-store.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, allBtns, btnExact, ticks } = H;

const WH = 'Логистичен склад Търговище';
const clone = x => JSON.parse(JSON.stringify(x));
const iso = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString(); };

function rep(o) {
  return Object.assign({
    id: 'rep-x', direction: 'interstore', store_name: 'Петрич', counterpart: WH,
    document_number: '4600', doc_date: '2026-09-10', submitted_by: 'Управител',
    general_comment: '', photos: [], reviewed: false, created_at: '2026-09-10T09:00:00.000Z'
  }, o);
}
function line(o) {
  return Object.assign({
    id: 'l-x', report_id: 'rep-x', store_name: 'Петрич', supplier: null,
    material_code: '000123', material_name: 'ЩУЦЕР МЕТАЛЕН',
    quantity: 20, quantity_received: 0, quantity_supplier_doc: null,
    order_number: null, confirmed_date: null, comment: null,
    resolution_comment: null, attachments: [], credit_note_issued: false,
    difference_category: 'undelivered', unit: 'бр.', status: 'new', type: null,
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null,
    store_corrected_at: null, warehouse_response: null, warehouse_comment: null,
    store_response: null, store_response_by: null, store_response_at: null,
    store_response_comment: null, swap_id: null, created_at: '2026-09-10T09:00:00.000Z'
  }, o);
}
function swap(o) {
  return Object.assign({
    id: 'sw-1', from_line_id: 'l-ex', to_line_id: 'l-sh',
    from_store: 'Гоце Делчев', to_store: 'Петрич', warehouse: WH,
    material_code: '123', material_name: 'ЩУЦЕР МЕТАЛЕН', qty: 20,
    status: 'linked', kind: 'doc', transport_mode: null, sap_doc_num: null,
    note: null, created_by: 'Склад Търговище', created_at: '2026-09-12T09:00:00.000Z',
    sent_by: null, sent_at: null, received_by: null, received_at: null,
    closed_by: null, closed_at: null
  }, o);
}

const REP_EX = rep({ id: 'rep-ex', store_name: 'Гоце Делчев', created_at: '2026-09-11T09:00:00.000Z' });
const REP_SH = rep({ id: 'rep-sh', store_name: 'Петрич' });
const L_EX = line({ id: 'l-ex', report_id: 'rep-ex', store_name: 'Гоце Делчев', material_code: '123',
  difference_category: 'excess', quantity: 10, quantity_received: 50,
  created_at: '2026-09-11T09:00:00.000Z' });
const L_SH = line({ id: 'l-sh', report_id: 'rep-sh', store_name: 'Петрич', swap_id: 'sw-1' });
const L_EX2 = line({ id: 'l-ex2', report_id: 'rep-ex', store_name: 'Гоце Делчев', material_code: '999', material_name: 'ДРУГ' });
const L_SH2 = line({ id: 'l-sh2', report_id: 'rep-sh', store_name: 'Петрич', material_code: '888', material_name: 'ТРЕТИ' });

const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище', role: 'sklad', store_name: WH, assigned_stores: [] };
const PETRICH  = { email: 'petrich@temax.bg', display_name: 'Управител Петрич', role: 'manager', store_name: 'Петрич', assigned_stores: [] };
const GOTSE    = { email: 'gd@temax.bg', display_name: 'Управител ГД', role: 'manager', store_name: 'Гоце Делчев', assigned_stores: [] };
const CVETI    = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

function env(user, opts) {
  opts = opts || {};
  const lines = opts.lines || [L_EX, L_SH, L_EX2, L_SH2];
  const reports = opts.reports || [REP_EX, REP_SH];
  const swaps = opts.swaps || [swap()];
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user, confirm: opts.confirm === undefined ? true : opts.confirm, fail: opts.fail,
    data: {
      stock_differences: lines, differences_reports: reports, stock_diff_swaps: swaps,
      stock_returns: [], transport_orders: [], users: [],
      stores: [{ name: 'Петрич' }, { name: 'Гоце Делчев' }], contacts: []
    }
  });
  h.w.sdData = clone(lines);
  h.w.diffReports = clone(reports);
  h.w.sdSwaps = clone(swaps);
  h.w.transportOrders = [];
  h.w.sdFilter = opts.filter || 'pending'; h.w.sdTypeFilter = 'all';
  h.w.sdStoreFilter = ''; h.w.sdSearch = ''; h.w.sdDirTab = 'interstore';
  /* Свиването на приключените редове е друга функционалност — тук всичко е
     разгънато, за да не изчезне ред под нея. */
  h.w.sdShowDone = {}; reports.forEach(r => { h.w.sdShowDone[r.id] = true; });
  h.w.invalidateStoreCaches(); h.w.invalidateSuppliersCache();
  return h;
}

const rowOf = (h, lineId) => {
  const cardId = (lineId === 'l-ex' || lineId === 'l-ex2') ? 'diff-rep-rep-ex' : 'diff-rep-rep-sh';
  const card = h.doc.getElementById(cardId);
  if (!card) return null;
  const name = { 'l-ex': 'ЩУЦЕР', 'l-sh': 'ЩУЦЕР', 'l-ex2': 'ДРУГ', 'l-sh2': 'ТРЕТИ' }[lineId];
  return Array.prototype.find.call(card.querySelectorAll('tr'), tr => tr.textContent.indexOf(name) >= 0) || null;
};
const panelOf = (h, lineId) => { const tr = rowOf(h, lineId); return tr && tr.querySelector('[data-sdswap]'); };
const toasts = h => h.calls.toast.map(t => String(t.msg || t));
const patches = h => h.calls.patch.filter(p => /stock_diff_swaps/.test(p.url));
const settle = async () => { await ticks(); await ticks(); await ticks(); };
/* Всяка заявка към мрежата, не само пишещата — „0 fetch" значи точно това. */
const netCount = h => h.calls.get.length + h.calls.post.length + h.calls.patch.length + h.calls.del.length;

/* Клик, който при ЛИПСВАЩ бутон дава ❌, вместо да убие процеса. Важи
   най-вече за анти-тавтологичния пуск срещу стария код: там бутоните ги няма
   и без този гард тестът умира преди report(), с нула ❌ в изхода. */
const clickOr = (h, el, label) => {
  if (!ok(label, !!el)) return false;
  realClick(h.w, el);
  return true;
};

const SAP_BTN = '📄 ПУСНАТО В SAP';
const PHYS_BTN = '🚚 ИЗПРАТЕНО КЪМ ГОЦЕ ДЕЛЧЕВ';

(async function run() {

  /* ── 1. doc / linked: бутонът е САМО на изпращача ───────────────────────── */
  section('1. doc, linked — „📄 ПУСНАТО В SAP" вижда само изпращачът');
  {
    const cases = [
      ['Гоце Делчев (from)', GOTSE, 'l-ex', true],
      ['Петрич (to)', PETRICH, 'l-sh', false],
      ['складът', WAREHOUSE, 'l-sh', false],
      ['Цвети', CVETI, 'l-sh', false]
    ];
    cases.forEach(function (c) {
      const h = env(c[1]);
      h.w.renderStockDiff();
      const pn = panelOf(h, c[2]);
      if (ok(c[0] + ': панелът е на реда', !!pn)) {
        ok(c[0] + (c[3] ? ': ВИЖДА бутона' : ': НЕ вижда бутона'),
          !!btn(pn, SAP_BTN) === c[3], pn.textContent);
      }
      h.close();
    });
  }
  {
    /* Складът си запазва своите два бутона — стъпка 3 не му ги взима. */
    const h = env(WAREHOUSE);
    h.w.renderStockDiff();
    ok('складът пак има „✖ Развържи" при linked', !!btn(panelOf(h, 'l-sh'), 'Развържи'));
    h.close();
  }

  /* ── 2. doc модал: SAP номерът е задължителен, transport_mode не се праща ── */
  section('2. doc модал — без SAP номер нищо не тръгва; с номер → PATCH БЕЗ transport_mode');
  {
    const h = env(GOTSE);
    h.w.renderStockDiff();
    clickOr(h, btn(panelOf(h, 'l-ex'), SAP_BTN), 'бутонът „' + SAP_BTN + '" е на екрана');
    const m = h.doc.getElementById('sdsent-ov');
    if (ok('модалът е отворен', !!m)) {
      ok('при doc НЯМА избор за превоз', !m.querySelector('input[name="sdsent-mode"]'));
      ok('при doc НЯМА поле за дата', !h.doc.getElementById('sdsent-date'));
      ok('има поле за SAP номер', !!h.doc.getElementById('sdsent-sap'));

      const before = netCount(h);
      realClick(h.w, btnExact(m, '📄 Пуснато в SAP'));
      await settle();
      ok('празен SAP номер → червен toast', toasts(h).some(t => /SAP номер/.test(t)), JSON.stringify(toasts(h)));
      ok('и нула заявки', netCount(h) === before, 'реално: ' + (netCount(h) - before));

      /* Само интервали не е номер — затова trim, не „непразен низ". */
      h.doc.getElementById('sdsent-sap').value = '   ';
      realClick(h.w, btnExact(m, '📄 Пуснато в SAP'));
      await settle();
      ok('само интервали → пак нула заявки', netCount(h) === before, 'реално: ' + (netCount(h) - before));

      h.doc.getElementById('sdsent-sap').value = ' 4900777 ';
      h.doc.getElementById('sdsent-note').value = 'трансферът е пуснат';
      realClick(h.w, btnExact(m, '📄 Пуснато в SAP'));
      await settle();
      const pt = patches(h);
      if (ok('един PATCH към размяната', pt.length === 1, 'реално: ' + pt.length)) {
        const b = pt[0].body;
        ok('URL сочи точната размяна', /id=eq\.sw-1/.test(pt[0].url), pt[0].url);
        ok('status → sent', b.status === 'sent', JSON.stringify(b));
        ok('SAP номерът е trim-нат', b.sap_doc_num === '4900777', JSON.stringify(b.sap_doc_num));
        ok('sent_by = действащият', b.sent_by === 'Управител ГД', JSON.stringify(b.sent_by));
        ok('sent_at е попълнено', !!b.sent_at, JSON.stringify(b.sent_at));
        /* ЯДРОТО: ключът да ГО НЯМА, не да е null. */
        ok('в тялото НЯМА ключ transport_mode', !('transport_mode' in b), JSON.stringify(Object.keys(b)));
      }
      ok('модалът е затворен', !h.doc.getElementById('sdsent-ov'));
      h.close();
    }
  }
  {
    /* Бележката се ДОПИСВА към тази от свързването, не я заменя. */
    const h = env(GOTSE, { swaps: [swap({ note: 'от склада: спешно' })] });
    h.w.renderStockDiff();
    if (clickOr(h, btn(panelOf(h, 'l-ex'), SAP_BTN), 'бутонът за пускане в SAP е на екрана (бележка)')) {
      h.doc.getElementById('sdsent-sap').value = '4900888';
      h.doc.getElementById('sdsent-note').value = 'пуснах го днес';
      realClick(h.w, btnExact(h.doc.getElementById('sdsent-ov'), '📄 Пуснато в SAP'));
    }
    await settle();
    ok('бележката се дописва с „ · "',
      patches(h)[0] && patches(h)[0].body.note === 'от склада: спешно · пуснах го днес',
      JSON.stringify(patches(h)[0] && patches(h)[0].body.note));
    h.close();
  }
  {
    /* Празна бележка не пипа колоната изобщо — иначе би изтрила чуждата. */
    const h = env(GOTSE, { swaps: [swap({ note: 'от склада: спешно' })] });
    h.w.renderStockDiff();
    if (clickOr(h, btn(panelOf(h, 'l-ex'), SAP_BTN), 'бутонът за пускане в SAP е на екрана (празна бележка)')) {
      h.doc.getElementById('sdsent-sap').value = '4900888';
      realClick(h.w, btnExact(h.doc.getElementById('sdsent-ov'), '📄 Пуснато в SAP'));
    }
    await settle();
    ok('празна бележка → ключът note изобщо не влиза в тялото',
      patches(h)[0] && !('note' in patches(h)[0].body),
      JSON.stringify(patches(h)[0] && Object.keys(patches(h)[0].body)));
    h.close();
  }

  /* ── 3. physical: превозът е задължителен, датата влиза в sent_at ───────── */
  section('3. physical, linked — превоз задължителен; PATCH с transport_mode и избраната дата');
  {
    const PH = swap({ kind: 'physical' });
    const h = env(GOTSE, { swaps: [PH] });
    h.w.renderStockDiff();
    const b = btn(panelOf(h, 'l-ex'), PHYS_BTN.replace('ГОЦЕ ДЕЛЧЕВ', 'ПЕТРИЧ'));
    if (ok('изпращачът вижда „🚚 ИЗПРАТЕНО КЪМ ПЕТРИЧ"', !!b, panelOf(h, 'l-ex').textContent)) {
      realClick(h.w, b);
      const m = h.doc.getElementById('sdsent-ov');
      if (ok('модалът е отворен', !!m)) {
        const radios = m.querySelectorAll('input[name="sdsent-mode"]');
        ok('два избора за превоз', radios.length === 2, 'реално: ' + radios.length);
        ok('стойностите са van и truck', radios.length === 2 && radios[0].value === 'van' && radios[1].value === 'truck');
        ok('НИТО ЕДИН не е отметнат предварително',
          radios.length === 2 && !radios[0].checked && !radios[1].checked);
        const dEl = h.doc.getElementById('sdsent-date');
        ok('има поле за дата с днешна стойност по подразбиране',
          !!dEl && dEl.value === h.w.today(), dEl && dEl.value);

        const before = netCount(h);
        h.doc.getElementById('sdsent-sap').value = '4900111';
        realClick(h.w, btnExact(m, '🚚 Изпратено'));
        await settle();
        ok('без избран превоз → червен toast', toasts(h).some(t => /превоз/.test(t)), JSON.stringify(toasts(h)));
        ok('и нула заявки', netCount(h) === before, 'реално: ' + (netCount(h) - before));

        radios[1].checked = true;             /* камион */
        dEl.value = '2026-09-18';
        realClick(h.w, btnExact(m, '🚚 Изпратено'));
        await settle();
        const pt = patches(h);
        if (ok('един PATCH към размяната', pt.length === 1, 'реално: ' + pt.length)) {
          const bd = pt[0].body;
          ok('status → sent', bd.status === 'sent', JSON.stringify(bd));
          ok('transport_mode = truck', bd.transport_mode === 'truck', JSON.stringify(bd.transport_mode));
          ok('sent_at е ИЗБРАНАТА дата, не днешната',
            String(bd.sent_at).slice(0, 10) === '2026-09-18', JSON.stringify(bd.sent_at));
          ok('SAP номерът влиза', bd.sap_doc_num === '4900111', JSON.stringify(bd.sap_doc_num));
        }
      }
    }
    h.close();
  }
  {
    /* Обратната посока на проверката за „липсващ ключ": при physical той Е тук. */
    const h = env(GOTSE, { swaps: [swap({ kind: 'physical' })] });
    h.w.renderStockDiff();
    if (clickOr(h, btn(panelOf(h, 'l-ex'), PHYS_BTN.replace('ГОЦЕ ДЕЛЧЕВ', 'ПЕТРИЧ')), 'бутонът за изпращане е на екрана')) {
      h.doc.querySelectorAll('input[name="sdsent-mode"]')[0].checked = true; /* бус */
      h.doc.getElementById('sdsent-sap').value = '4900222';
      realClick(h.w, btnExact(h.doc.getElementById('sdsent-ov'), '🚚 Изпратено'));
    }
    await settle();
    ok('при physical ключът transport_mode Е в тялото',
      patches(h)[0] && patches(h)[0].body.transport_mode === 'van',
      JSON.stringify(patches(h)[0] && patches(h)[0].body));
    h.close();
  }

  /* ── 4. sent: приема ПОЛУЧАТЕЛЯТ ────────────────────────────────────────── */
  section('4. sent — „ПРИЕТО" вижда получателят; етикетът е по вида');
  {
    const cases = [
      ['doc', 'doc', '📄 ПРИЕТО В SAP'],
      ['physical', 'physical', '📬 ПРИЕТО ОТ ГОЦЕ ДЕЛЧЕВ']
    ];
    cases.forEach(function (c) {
      const sw = swap({ status: 'sent', kind: c[1], sent_at: iso(-1), sap_doc_num: '4900333',
                        transport_mode: c[1] === 'physical' ? 'van' : null });
      const hTo = env(PETRICH, { swaps: [sw] });
      hTo.w.renderStockDiff();
      ok(c[0] + ': получателят вижда „' + c[2] + '"', !!btn(panelOf(hTo, 'l-sh'), c[2]),
        panelOf(hTo, 'l-sh') && panelOf(hTo, 'l-sh').textContent);
      hTo.close();

      const hFrom = env(GOTSE, { swaps: [sw] });
      hFrom.w.renderStockDiff();
      const pf = panelOf(hFrom, 'l-ex');
      ok(c[0] + ': изпращачът НЯМА бутон', allBtns(pf, 'ПРИЕТО').length === 0 && pf.querySelectorAll('button').length === 0,
        'реално: ' + pf.querySelectorAll('button').length);
      /* Третият ред е САМО „чака X" (20.09.2026): документът, датата и
         превозът вече са на ред 2 и не се повтарят.
         Мери се САМИЯТ ред, не целият панел — „панелът съдържа чака Петрич"
         беше вярно и за стария текст „пуснато в SAP (дата, док. N) · чака
         Петрич", тоест минаваше и срещу непоправен код. */
      const lastLine = pf.children[pf.children.length - 1];
      ok(c[0] + ': последният ред е ТОЧНО „чака Петрич"',
        !!lastLine && lastLine.textContent === 'чака Петрич',
        JSON.stringify(lastLine && lastLine.textContent));
      ok(c[0] + ': третият ред не повтаря документа',
        !!lastLine && lastLine.textContent.indexOf('4900333') < 0,
        JSON.stringify(lastLine && lastLine.textContent));
      hFrom.close();
    });
  }
  {
    const sw = swap({ status: 'sent', kind: 'doc', sent_at: iso(-1), sap_doc_num: '4900333' });
    const h = env(PETRICH, { swaps: [sw] });
    h.w.renderStockDiff();
    clickOr(h, btn(panelOf(h, 'l-sh'), '📄 ПРИЕТО В SAP'), 'бутонът „📄 ПРИЕТО В SAP" е на екрана');
    await settle();
    const pt = patches(h);
    if (ok('един PATCH', pt.length === 1, 'реално: ' + pt.length)) {
      ok('status → received', pt[0].body.status === 'received', JSON.stringify(pt[0].body));
      ok('received_by = действащият', pt[0].body.received_by === 'Управител Петрич', JSON.stringify(pt[0].body.received_by));
      ok('received_at е попълнено', !!pt[0].body.received_at, JSON.stringify(pt[0].body.received_at));
    }
    h.close();
  }
  {
    const sw = swap({ status: 'sent', kind: 'physical', transport_mode: 'van', sent_at: iso(-1), sap_doc_num: '4900333' });
    const h = env(PETRICH, { swaps: [sw], confirm: false });
    h.w.renderStockDiff();
    const before = netCount(h);
    clickOr(h, btn(panelOf(h, 'l-sh'), '📬 ПРИЕТО ОТ ГОЦЕ ДЕЛЧЕВ'), 'бутонът „📬 ПРИЕТО ОТ …" е на екрана');
    await settle();
    ok('отказан confirm → нула заявки', netCount(h) === before, 'реално: ' + (netCount(h) - before));
    h.close();
  }

  /* ── 5. received: магазините са наблюдатели, складът приключва ──────────── */
  section('5. received — магазините без бутон, складът има „🏁 Приключи"');
  {
    const sw = swap({ status: 'received', kind: 'doc', sent_at: iso(-3), sap_doc_num: '4900444',
                      received_at: iso(-1), received_by: 'Управител Петрич' });
    [['Петрич', PETRICH, 'l-sh'], ['Гоце Делчев', GOTSE, 'l-ex']].forEach(function (c) {
      const h = env(c[1], { swaps: [sw] });
      h.w.renderStockDiff();
      const pn = panelOf(h, c[2]);
      ok(c[0] + ': нула бутона', pn.querySelectorAll('button').length === 0,
        'реално: ' + pn.querySelectorAll('button').length);
      ok(c[0] + ': чете „чака приключване от склада"',
        pn.textContent.indexOf('чака приключване от склада') >= 0, pn.textContent);
      h.close();
    });
    const hw = env(WAREHOUSE, { swaps: [sw] });
    hw.w.renderStockDiff();
    ok('складът има „🏁 Приключи размяната"', !!btn(panelOf(hw, 'l-sh'), 'Приключи размяната'));
    hw.close();
  }

  /* ── 6. Закъснение ──────────────────────────────────────────────────────── */
  section('6. Закъснение — sent над 5 дни светва в червено за всички роли');
  {
    const late = swap({ status: 'sent', kind: 'doc', sent_at: iso(-6), sap_doc_num: '4900555' });
    [['Петрич', PETRICH, 'l-sh'], ['Гоце Делчев', GOTSE, 'l-ex'], ['складът', WAREHOUSE, 'l-sh'], ['Цвети', CVETI, 'l-sh']]
      .forEach(function (c) {
        const h = env(c[1], { swaps: [late] });
        h.w.renderStockDiff();
        const pn = panelOf(h, c[2]);
        ok(c[0] + ': панелът е маркиран като закъснял', !!pn && pn.getAttribute('data-sdswap-late') === '1',
          pn && pn.getAttribute('style'));
        ok(c[0] + ': червената рамка и фон', !!pn && /#fca5a5/.test(pn.getAttribute('style')) && /#fef2f2/.test(pn.getAttribute('style')),
          pn && pn.getAttribute('style'));
        ok(c[0] + ': казва от колко дни', !!pn && /⚠ изпратено преди 6 дни, не е прието/.test(pn.textContent), pn && pn.textContent);
        h.close();
      });
  }
  {
    const fresh = swap({ status: 'sent', kind: 'doc', sent_at: iso(-4), sap_doc_num: '4900666' });
    const h = env(PETRICH, { swaps: [fresh] });
    h.w.renderStockDiff();
    ok('4 дни НЕ е закъснение', panelOf(h, 'l-sh').getAttribute('data-sdswap-late') === null,
      panelOf(h, 'l-sh').getAttribute('style'));
    ok('и няма предупреждение', panelOf(h, 'l-sh').textContent.indexOf('не е прието') < 0);
    h.close();
  }
  {
    /* Приетата размяна не закъснява, колкото и стара да е — чака САМО склада. */
    const old = swap({ status: 'received', kind: 'doc', sent_at: iso(-10), received_at: iso(-9) });
    const h = env(PETRICH, { swaps: [old] });
    h.w.renderStockDiff();
    ok('received отпреди 10 дни НЕ е закъснение', panelOf(h, 'l-sh').getAttribute('data-sdswap-late') === null);
    h.close();
  }
  {
    const h = env(PETRICH);
    /* Гард: срещу стария код функцията изобщо я няма и без него секцията
       умира с изключение, вместо да даде ❌. */
    if (ok('sdSwapIsLate съществува', typeof h.w.sdSwapIsLate === 'function')) {
      ok('sdSwapIsLate: linked не закъснява', h.w.sdSwapIsLate(swap({ sent_at: iso(-10) })) === false);
      ok('sdSwapIsLate: sent без sent_at не закъснява', h.w.sdSwapIsLate(swap({ status: 'sent', sent_at: null })) === false);
      ok('sdSwapIsLate: точно на границата (5 дни) още не закъснява',
        h.w.sdSwapIsLate(swap({ status: 'sent', sent_at: iso(-5) })) === false);
      ok('SD_SWAP_LATE_DAYS е 5', h.w.SD_SWAP_LATE_DAYS === 5, String(h.w.SD_SWAP_LATE_DAYS));
    }
    h.close();
  }

  /* ── 7. Баджът на склада ────────────────────────────────────────────────── */
  section('7. Бадж на склада — закъсняла размяна брои бланка, чиито редове са отговорени');
  {
    /* Всички редове са отговорени от склада и приключени → по старото правило
       бланката НЕ чака никого. Закъснялата размяна по неин ред я връща. */
    const answered = [
      line({ id: 'l-sh', report_id: 'rep-sh', warehouse_response: 'sent', status: 'received', swap_id: 'sw-1' }),
      line({ id: 'l-sh2', report_id: 'rep-sh', warehouse_response: 'sent', status: 'received' })
    ];
    const h = env(WAREHOUSE, { lines: answered, reports: [REP_SH], swaps: [] });
    ok('без размени бланката не се брои',
      h.w.sdUnreviewedCountFor([REP_SH], answered, []) === 0,
      String(h.w.sdUnreviewedCountFor([REP_SH], answered, [])));
    ok('НЕзакъсняла размяна също не я брои',
      h.w.sdUnreviewedCountFor([REP_SH], answered, [{ status: 'sent', to_line_id: 'l-sh', sent_at: iso(-2) }]) === 0);
    ok('закъсняла размяна по неин ред я БРОИ',
      h.w.sdUnreviewedCountFor([REP_SH], answered, [{ status: 'sent', to_line_id: 'l-sh', sent_at: iso(-6) }]) === 1);
    ok('закъсняла размяна по ЧУЖД ред не я брои',
      h.w.sdUnreviewedCountFor([REP_SH], answered, [{ status: 'sent', to_line_id: 'l-друг', sent_at: iso(-6) }]) === 0);
    h.close();
  }
  {
    /* Магазинът не брои по размени — правилото е само за склада. */
    const answered = [line({ id: 'l-sh', report_id: 'rep-sh', warehouse_response: 'sent', status: 'received', swap_id: 'sw-1' })];
    const h = env(PETRICH, { lines: answered, reports: [REP_SH], swaps: [] });
    ok('магазинът: закъсняла размяна не вдига баджа',
      h.w.sdUnreviewedCountFor([REP_SH], answered, [{ status: 'sent', to_line_id: 'l-sh', sent_at: iso(-6) }]) === 0);
    h.close();
  }
  {
    /* Пулсът на баджа НЕ бива да подменя глобалния sdSwaps с осакатения си
       срез — следващият рендер би останал без размени. */
    const h = env(WAREHOUSE);
    const before = JSON.stringify(h.w.sdSwaps);
    h.w.sdUnreviewedCountFor([REP_SH], [], [{ status: 'sent', to_line_id: 'l-sh', sent_at: iso(-6) }]);
    ok('sdUnreviewedCountFor не пипа глобалния sdSwaps', JSON.stringify(h.w.sdSwaps) === before);
    h.close();
  }

  report();
})();
