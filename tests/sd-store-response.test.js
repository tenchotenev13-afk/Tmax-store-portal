/* Междускладов ред: отговор на МАГАЗИНА (store_response).

   До 15.09.2026 по междускладов ред отговаряше само складът
   (warehouse_response), а магазинът имаше единствено "Получено" при "Изпратено".
   При "Обратно движение" магазинът нямаше как да каже, че е пуснал движението
   в SAP - или че не може, защото в логистика няма наличност. Складът приемаше
   "обратно" на сляпо.

   Сега:
     sent      -> магазинът: "✅ ПРИЕТО" (status=received + store_response=accepted)
     will_send -> никой, "чака изпращане"
     return    -> магазинът: "📄 ПУСНАТО В SAP" / "⛔ НЯМА НАЛИЧНОСТ В ЛОГИСТИКА"
                  складът: "📬 Прието обратно" САМО при sap_done
     received  -> край за всички, независимо от store_response

   Проверките за бутони са САМО по <button> - етикетите стоят в div/span.

   Пускане:  node tests/sd-store-response.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, btnExact, ticks } = H;

const REP_INT = {
  id: 'rep-int', direction: 'interstore', store_name: 'Петрич',
  counterpart: 'Логистичен склад Търговище', document_number: '180491138',
  doc_date: '2026-09-10', submitted_by: 'Управител Петрич', general_comment: '',
  photos: [], reviewed: false, created_at: '2026-09-10T09:00:00.000Z'
};
const REP_SUP = {
  id: 'rep-sup', direction: 'supplier', store_name: 'Петрич',
  counterpart: 'ТЕСИ ООД', document_number: '180489966', doc_date: '2026-09-09',
  submitted_by: 'Управител Петрич', general_comment: '', photos: [],
  reviewed: false, created_at: '2026-09-09T09:00:00.000Z'
};

function line(o) {
  return Object.assign({
    store_name: 'Петрич', supplier: null, report_id: 'rep-int',
    material_code: '34989', material_name: 'ЩУЦЕР МЕТАЛЕН',
    quantity: 10, quantity_received: 8, quantity_supplier_doc: null,
    order_number: null, confirmed_date: null, comment: null,
    resolution_comment: null, attachments: [], credit_note_issued: false,
    difference_category: 'shortage', unit: 'бр.', status: 'new', type: null,
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null,
    store_corrected_at: null, warehouse_response: null, warehouse_comment: null,
    store_response: null, store_response_by: null, store_response_at: null,
    store_response_comment: null
  }, o);
}

const WAREHOUSE = {
  email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
  role: 'sklad', store_name: 'Логистичен склад Търговище', assigned_stores: []
};
const STORE = {
  email: 'petrich@temax.bg', display_name: 'Управител Петрич',
  role: 'manager', store_name: 'Петрич', assigned_stores: []
};
/* Цвети: admin без Петрич в assigned_stores - не е "магазинът". */
const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: []
};

function env(user, lines, opts) {
  opts = opts || {};
  const reports = opts.reports || [REP_INT, REP_SUP];
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user,
    confirm: true,
    data: {
      stock_differences: lines, differences_reports: reports,
      stock_returns: [], transport_orders: [], users: [],
      stores: [{ name: 'Петрич' }, { name: 'Логистичен склад Търговище' }],
      contacts: [{ name: 'ТЕСИ ООД' }]
    }
  });
  h.w.sdData = JSON.parse(JSON.stringify(lines));
  h.w.diffReports = JSON.parse(JSON.stringify(reports));
  h.w.transportOrders = [];
  h.w.sdFilter = 'pending';
  h.w.sdTypeFilter = 'all';
  h.w.sdStoreFilter = '';
  h.w.sdSearch = '';
  h.w.sdDirTab = opts.dirTab || 'interstore';
  h.w.invalidateStoreCaches();
  h.w.invalidateSuppliersCache();
  return h;
}

const card = (doc, id) => doc.getElementById('diff-rep-' + (id || 'rep-int'));
/* Редовете на картата: [0] е заглавието на таблицата. */
const lineRow = (c, i) => c.querySelectorAll('table tr')[1 + (i || 0)];
/* Последната клетка = "Отговор на склада" + потвърждението под него. */
const respCell = (c, i) => { const r = lineRow(c, i); return r.cells[r.cells.length - 1]; };
const btnTexts = el => Array.prototype.map.call(el.querySelectorAll('button'), b => b.textContent.trim());
const sdPatches = h => h.calls.patch.filter(p => p.table === 'stock_differences');
const ISO = /^\d{4}-\d{2}-\d{2}T/;

const ACCEPT = '✅ ПРИЕТО';
const SAP = '📄 ПУСНАТО В SAP';
const NOSTOCK = '⛔ НЯМА НАЛИЧНОСТ В ЛОГИСТИКА';
const BACK = '📬 Прието обратно';
const OLD = '✅ Получено';

(async function () {

  section('1. Магазин, sent — "ПРИЕТО" замества "Получено" и записва store_response');
  {
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'sent', warehouse_comment: 'тръгна с буса' })]);
    if (guard('renderStockDiff() не хвърля', () => h.w.renderStockDiff())) {
      const c = card(h.doc);
      if (ok('картата се рендира', !!c)) {
        const cell = respCell(c);
        ok('има бутон "' + ACCEPT + '"', !!btn(cell, ACCEPT), btnTexts(cell).join(' | '));
        ok('старият бутон "' + OLD + '" го няма', !btn(c, OLD), btnTexts(c).join(' | '));
        ok('няма "' + SAP + '"', !btn(c, SAP));
        ok('няма "' + NOSTOCK + '"', !btn(c, NOSTOCK));

        /* Коментарът на склада - 11px, тъмен, в рамка (не 10px сиво). */
        const cm = Array.prototype.find.call(cell.querySelectorAll('div'),
          d => d.textContent.indexOf('тръгна с буса') >= 0 && d.textContent.indexOf('💬') === 0);
        if (ok('коментарът на склада се вижда', !!cm, cell.innerHTML.slice(0, 300))) {
          const st = cm.getAttribute('style') || '';
          ok('коментар: font-size:11px', /font-size:11px/.test(st), st);
          ok('коментар: color:#1e293b', /color:#1e293b/.test(st), st);
          ok('коментар: в рамка', /border:1px solid/.test(st), st);
        }

        realClick(h.w, btn(cell, ACCEPT));
        await ticks(); await ticks();
        const p = sdPatches(h);
        if (ok('един PATCH към stock_differences', p.length === 1, JSON.stringify(h.calls.patch.map(x => x.table)))) {
          const b = p[0].body;
          ok('status=received', b.status === 'received', JSON.stringify(b.status));
          ok('completed_by е магазинът', b.completed_by === 'Управител Петрич', JSON.stringify(b.completed_by));
          ok('store_response=accepted', b.store_response === 'accepted', JSON.stringify(b.store_response));
          ok('store_response_by е магазинът', b.store_response_by === 'Управител Петрич', JSON.stringify(b.store_response_by));
          ok('store_response_at е ISO', ISO.test(b.store_response_at || ''), JSON.stringify(b.store_response_at));
          ok('store_response_at = completed_at (едно действие)', b.store_response_at === b.completed_at);
        }
        ok('единственият ред затваря бланката',
          h.calls.patch.some(x => x.table === 'differences_reports' && x.body.reviewed === true));
      }
    }
  }

  section('2. Магазин, return — два бутона, без "ПРИЕТО"; ПУСНАТО В SAP не пипа status');
  {
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'return' })]);
    h.w.renderStockDiff();
    const c = card(h.doc);
    const cell = respCell(c);
    const texts = btnTexts(cell);
    ok('точно 2 бутона в клетката', texts.length === 2, texts.join(' | '));
    ok('има "' + SAP + '"', !!btn(cell, SAP), texts.join(' | '));
    ok('има "' + NOSTOCK + '"', !!btn(cell, NOSTOCK), texts.join(' | '));
    ok('няма "' + ACCEPT + '"', !btn(c, ACCEPT));
    ok('няма "' + BACK + '"', !btn(c, BACK));
    ok('без избор - нито един не е откроен', texts.every(t => t.indexOf('✓') !== 0), texts.join(' | '));

    realClick(h.w, btn(cell, SAP));
    await ticks(); await ticks();
    const p = sdPatches(h);
    if (ok('един PATCH', p.length === 1, JSON.stringify(h.calls.patch.map(x => x.table)))) {
      const b = p[0].body;
      ok('store_response=sap_done', b.store_response === 'sap_done', JSON.stringify(b));
      ok('store_response_by', b.store_response_by === 'Управител Петрич', JSON.stringify(b.store_response_by));
      ok('store_response_at е ISO', ISO.test(b.store_response_at || ''), JSON.stringify(b.store_response_at));
      ok('status НЕ е в тялото (редът остава new)', !('status' in b), Object.keys(b).join(','));
      ok('completed_* НЕ са в тялото', !('completed_by' in b) && !('completed_at' in b), Object.keys(b).join(','));
      ok('коментарът не се трие при sap_done', !('store_response_comment' in b), Object.keys(b).join(','));
      ok('URL сочи реда', /id=eq\.l-1/.test(p[0].url), p[0].url);
    }
    ok('бланката НЕ се затваря', !h.calls.patch.some(x => x.table === 'differences_reports'));
    ok('без confirm() за SAP', h.calls.confirm.length === 0, JSON.stringify(h.calls.confirm));
  }

  section('2б. Магазин, return — НЯМА НАЛИЧНОСТ + коментар + Запази');
  {
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'return' })]);
    h.w.renderStockDiff();
    realClick(h.w, btn(respCell(card(h.doc)), NOSTOCK));
    await ticks();
    const ov = h.doc.getElementById('sdnostock-ov');
    if (ok('модалът е отворен', !!ov)) {
      ok('няма PATCH само от отварянето', sdPatches(h).length === 0);
      h.doc.getElementById('sdnostock-comment').value = '  SAP: 0 бр. в склада  ';
      realClick(h.w, btnExact(ov, '💾 Запази'));
      await ticks(); await ticks();
      const p = sdPatches(h);
      if (ok('един PATCH', p.length === 1, JSON.stringify(h.calls.patch.map(x => x.table)))) {
        const b = p[0].body;
        ok('store_response=no_stock', b.store_response === 'no_stock', JSON.stringify(b));
        ok('коментарът е записан (подрязан)', b.store_response_comment === 'SAP: 0 бр. в склада',
          JSON.stringify(b.store_response_comment));
        ok('store_response_by', b.store_response_by === 'Управител Петрич');
        ok('status НЕ е в тялото', !('status' in b), Object.keys(b).join(','));
      }
      ok('модалът е затворен след запис', !h.doc.getElementById('sdnostock-ov'));
    }
  }

  section('2в. ГРАНИЧНИ: празен коментар -> null; Откажи -> нищо');
  {
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'return' })]);
    h.w.renderStockDiff();
    realClick(h.w, btn(respCell(card(h.doc)), NOSTOCK));
    await ticks();
    realClick(h.w, btnExact(h.doc.getElementById('sdnostock-ov'), 'Откажи'));
    await ticks();
    ok('Откажи: модалът е затворен', !h.doc.getElementById('sdnostock-ov'));
    ok('Откажи: нула PATCH', sdPatches(h).length === 0);

    realClick(h.w, btn(respCell(card(h.doc)), NOSTOCK));
    await ticks();
    h.doc.getElementById('sdnostock-comment').value = '   ';
    realClick(h.w, btnExact(h.doc.getElementById('sdnostock-ov'), '💾 Запази'));
    await ticks(); await ticks();
    const p = sdPatches(h);
    if (ok('празен коментар: един PATCH', p.length === 1)) {
      ok('празен коментар -> null, не ""', p[0].body.store_response_comment === null,
        JSON.stringify(p[0].body.store_response_comment));
    }
  }

  section('2г. Магазин, no_stock -> ПУСНАТО В SAP (складът оправи наличността)');
  {
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'return',
      store_response: 'no_stock', store_response_by: 'Управител Петрич',
      store_response_at: '2026-09-14T08:00:00.000Z', store_response_comment: 'наличност 0' })]);
    h.w.renderStockDiff();
    const c = card(h.doc);
    const cell = respCell(c);
    const nb = btn(cell, NOSTOCK), sb = btn(cell, SAP);
    ok('"НЯМА НАЛИЧНОСТ" е откроен (✓)', !!nb && nb.textContent.trim().indexOf('✓') === 0, nb && nb.textContent);
    ok('"ПУСНАТО" не е откроен', !!sb && sb.textContent.trim().indexOf('✓') !== 0, sb && sb.textContent);
    ok('магазинът вижда собствения си коментар', cell.textContent.indexOf('наличност 0') >= 0);
    ok('редът е червен и за магазина', /#fef2f2/.test(lineRow(c).getAttribute('style') || ''),
      lineRow(c).getAttribute('style'));

    realClick(h.w, sb);
    await ticks(); await ticks();
    const p = sdPatches(h);
    if (ok('един PATCH', p.length === 1)) {
      ok('no_stock -> sap_done', p[0].body.store_response === 'sap_done', JSON.stringify(p[0].body));
      ok('status пак не е в тялото', !('status' in p[0].body));
    }
  }

  section('3. Магазин, will_send — 0 бутона, "чака изпращане"');
  {
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'will_send' })]);
    h.w.renderStockDiff();
    const cell = respCell(card(h.doc));
    ok('0 бутона в клетката', btnTexts(cell).length === 0, btnTexts(cell).join(' | '));
    ok('пише "чака изпращане"', cell.textContent.indexOf('чака изпращане') >= 0, cell.textContent);
  }

  section('4. Склад, return + store_response=null — без "Прието обратно"');
  {
    const h = env(WAREHOUSE, [line({ id: 'l-1', warehouse_response: 'return' })]);
    h.w.renderStockDiff();
    const c = card(h.doc);
    const cell = respCell(c);
    ok('няма "' + BACK + '"', !btn(c, BACK), btnTexts(cell).join(' | '));
    ok('няма бутоните на магазина', !btn(c, SAP) && !btn(c, NOSTOCK) && !btn(c, ACCEPT));
    ok('сив текст "чака магазина"', cell.textContent.indexOf('чака магазина') >= 0, cell.textContent);
    ok('складът пак вижда собствените си бутони', !!btn(cell, '📤 Изпратено') && !!btn(cell, '↩️ Обратно'));
    ok('редът НЕ е червен', !/#fef2f2/.test(lineRow(c).getAttribute('style') || ''));
  }

  section('5. Склад, return + sap_done — "Прието обратно" приключва реда');
  {
    const h = env(WAREHOUSE, [line({ id: 'l-1', warehouse_response: 'return',
      store_response: 'sap_done', store_response_by: 'Управител Петрич',
      store_response_at: '2026-09-14T08:00:00.000Z' })]);
    h.w.renderStockDiff();
    const c = card(h.doc);
    const cell = respCell(c);
    ok('има "' + BACK + '"', !!btn(cell, BACK), btnTexts(cell).join(' | '));
    ok('вижда "Пуснато в SAP" и кой', cell.textContent.indexOf('📄 Пуснато в SAP · Управител Петрич') >= 0, cell.textContent);

    realClick(h.w, btn(cell, BACK));
    await ticks(); await ticks();
    const p = sdPatches(h);
    if (ok('един PATCH', p.length === 1, JSON.stringify(h.calls.patch.map(x => x.table)))) {
      ok('status=received', p[0].body.status === 'received', JSON.stringify(p[0].body));
      ok('completed_by е складът', p[0].body.completed_by === 'Склад Търговище');
      ok('store_response НЕ се презаписва от склада', !('store_response' in p[0].body), Object.keys(p[0].body).join(','));
    }
  }

  section('6. Склад, return + no_stock — без бутон, червен ред, текст + коментар');
  {
    const h = env(WAREHOUSE, [line({ id: 'l-1', warehouse_response: 'return',
      store_response: 'no_stock', store_response_comment: 'SAP: 0 бр. в склада',
      store_corrected_at: '2026-09-13T08:00:00.000Z' })]);
    h.w.renderStockDiff();
    const c = card(h.doc);
    const cell = respCell(c);
    ok('няма "' + BACK + '"', !btn(c, BACK), btnTexts(cell).join(' | '));
    ok('червен текст "⛔ Няма наличност в логистика"',
      cell.textContent.indexOf('⛔ Няма наличност в логистика') >= 0, cell.textContent);
    ok('коментарът на магазина се вижда', cell.textContent.indexOf('SAP: 0 бр. в склада') >= 0);
    const st = lineRow(c).getAttribute('style') || '';
    ok('редът е #fef2f2', /#fef2f2/.test(st), st);
    ok('червено бие жълто (store_corrected_at)', !/#fffbeb/.test(st), st);
  }

  section('7. status=received + store_response=null (старите 25) — край за всички');
  {
    const rows = [
      line({ id: 'l-1', status: 'received', warehouse_response: 'sent',
        completed_by: 'Управител Петрич', completed_at: '2026-09-01T10:00:00.000Z' }),
      line({ id: 'l-2', material_name: 'КРАН', status: 'received', warehouse_response: 'return',
        completed_by: 'Склад Търговище', completed_at: '2026-09-02T10:00:00.000Z' }),
      /* граничен: приключен ред с no_stock - не е червен и няма бутони */
      line({ id: 'l-3', material_name: 'ВЕНТИЛ', status: 'received', warehouse_response: 'return',
        store_response: 'no_stock', completed_by: 'Склад Търговище', completed_at: '2026-09-03T10:00:00.000Z' })
    ];
    [['магазин', STORE], ['склад', WAREHOUSE], ['Цвети', CVETI]].forEach(function (pair) {
      const h = env(pair[1], rows);
      h.w.renderStockDiff();
      const c = card(h.doc);
      if (!ok(pair[0] + ': картата се рендира', !!c)) return;
      [0, 1, 2].forEach(function (i) {
        const cell = respCell(c, i);
        ok(pair[0] + ' ред ' + (i + 1) + ': нито един бутон на потока',
          !btn(cell, ACCEPT) && !btn(cell, SAP) && !btn(cell, NOSTOCK) && !btn(cell, BACK) && !btn(cell, OLD),
          btnTexts(cell).join(' | '));
        ok(pair[0] + ' ред ' + (i + 1) + ': вижда "📬 Получено"', cell.textContent.indexOf('📬 Получено') >= 0, cell.textContent);
      });
      ok(pair[0] + ': приключен no_stock НЕ е червен', !/#fef2f2/.test(lineRow(c, 2).getAttribute('style') || ''),
        lineRow(c, 2).getAttribute('style'));
    });
  }

  section('8. Друга роля (Цвети/admin) — 0 бутона на потока, вижда етикетите');
  {
    const h = env(CVETI, [
      line({ id: 'l-1', warehouse_response: 'sent' }),
      line({ id: 'l-2', material_name: 'КРАН', warehouse_response: 'return',
        store_response: 'sap_done', store_response_by: 'Управител Петрич' }),
      line({ id: 'l-3', material_name: 'ВЕНТИЛ', warehouse_response: 'return',
        store_response: 'no_stock', store_response_comment: 'няма в SAP' })
    ]);
    h.w.renderStockDiff();
    const c = card(h.doc);
    if (ok('картата се рендира', !!c)) {
      [0, 1, 2].forEach(function (i) {
        const cell = respCell(c, i);
        ok('ред ' + (i + 1) + ': 0 бутона в клетката', btnTexts(cell).length === 0, btnTexts(cell).join(' | '));
      });
      ok('sent: "чака магазина"', respCell(c, 0).textContent.indexOf('чака магазина') >= 0, respCell(c, 0).textContent);
      ok('sap_done: "📄 Пуснато в SAP"', respCell(c, 1).textContent.indexOf('📄 Пуснато в SAP') >= 0, respCell(c, 1).textContent);
      ok('no_stock: "⛔ Няма наличност в логистика" + коментар',
        respCell(c, 2).textContent.indexOf('⛔ Няма наличност в логистика') >= 0 &&
        respCell(c, 2).textContent.indexOf('няма в SAP') >= 0, respCell(c, 2).textContent);
      ok('no_stock редът е червен и за Цвети', /#fef2f2/.test(lineRow(c, 2).getAttribute('style') || ''));
    }
  }

  section('9. Колоната "Решение (Цвети)" за магазина: "—" при междускладов, "чака преглед" при доставчик');
  {
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'sent' })]);
    h.w.renderStockDiff();
    const r = lineRow(card(h.doc));
    /* колоните при междускладов: SAP, Артикул, Категория, Док, Реално, Коментар, Снимки, Коментар (Цвети), Решение (Цвети), Склад */
    const decision = r.cells[r.cells.length - 2];
    ok('междускладов: "—"', decision.textContent.trim().indexOf('—') === 0, decision.textContent);
    ok('междускладов: без "чака преглед"', decision.textContent.indexOf('чака преглед') < 0, decision.textContent);

    const hs = env(STORE, [line({ id: 'l-9', report_id: 'rep-sup', supplier: 'ТЕСИ ООД' })], { dirTab: 'supplier' });
    hs.w.renderStockDiff();
    const rs = lineRow(card(hs.doc, 'rep-sup'));
    ok('доставчик: "чака преглед" остава', rs.cells[rs.cells.length - 2].textContent.indexOf('чака преглед') >= 0,
      rs.cells[rs.cells.length - 2].textContent);
  }

  section('10. Бадж на склада');
  {
    const R = id => ({ id: id, store_name: 'Петрич', counterpart: 'Логистичен склад Търговище', reviewed: false });
    const reports = [R('A'), R('B'), R('C')];
    const lines = [
      { report_id: 'A', warehouse_response: null, store_response: null, status: 'new' },
      { report_id: 'B', warehouse_response: 'return', store_response: 'sap_done', status: 'new' },
      { report_id: 'C', warehouse_response: 'sent', store_response: 'accepted', status: 'received' },
      { report_id: 'C', warehouse_response: 'return', store_response: null, status: 'received' }
    ];
    const h = env(WAREHOUSE, []);
    ok('3 бланки (без отговор / sap_done / всичко received) -> 2',
      h.w.sdUnreviewedCountFor(reports, lines) === 2, String(h.w.sdUnreviewedCountFor(reports, lines)));

    const more = reports.concat([R('D'), R('E'), R('F')]);
    const moreLines = lines.concat([
      { report_id: 'D', warehouse_response: 'return', store_response: 'no_stock', status: 'new' },
      { report_id: 'E', warehouse_response: 'return', store_response: null, status: 'new' },
      { report_id: 'F', warehouse_response: 'will_send', store_response: null, status: 'new' }
    ]);
    ok('no_stock чака склада, return без отговор на магазина и will_send - не: 3',
      h.w.sdUnreviewedCountFor(more, moreLines) === 3, String(h.w.sdUnreviewedCountFor(more, moreLines)));

    /* Самостоятелната заявка трябва да чете и store_response, и status -
       иначе горното сравнение гледа undefined и винаги казва "не чака". */
    const hb = boot({
      modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
      user: WAREHOUSE,
      data: { differences_reports: reports, stock_differences: lines, stock_returns: [],
              transport_orders: [], users: [], stores: [], contacts: [] }
    });
    Object.defineProperty(hb.doc, 'hidden', { configurable: true, get: () => false });
    hb.calls.get.length = 0;
    hb.w.sdRefreshTabBadge();
    await ticks(); await ticks();
    const lg = hb.calls.get.filter(u => u.indexOf('/stock_differences') >= 0);
    if (ok('има заявка за редовете', lg.length === 1, hb.calls.get.join(' | '))) {
      const u = decodeURIComponent(lg[0]);
      ok('select съдържа store_response', /select=[^&]*store_response/.test(u), u);
      ok('select съдържа status', /select=[^&]*\bstatus\b/.test(u), u);
    }
    const be = hb.doc.getElementById('badge-stock-diff');
    if (ok('балончето съществува', !!be)) {
      ok('балончето показва 2', be.textContent === '2' && be.style.display !== 'none', be.textContent + ' / ' + be.style.display);
    }
  }

  section('11. Провалена заявка при ПУСНАТО В SAP — червен toast, локалният ред непроменен');
  {
    const h = boot({
      modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
      user: STORE, confirm: true,
      fail: { PATCH: /stock_differences/ },
      data: { stock_differences: [], differences_reports: [REP_INT], stock_returns: [],
              transport_orders: [], users: [], stores: [], contacts: [] }
    });
    h.w.sdData = [line({ id: 'l-1', warehouse_response: 'return' })];
    h.w.diffReports = [JSON.parse(JSON.stringify(REP_INT))];
    h.w.sdDirTab = 'interstore'; h.w.sdFilter = 'pending';
    h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
    h.w.renderStockDiff();
    realClick(h.w, btn(respCell(card(h.doc)), SAP));
    await ticks(); await ticks();
    ok('червен toast', h.calls.toast.some(t => /Грешка при запис/.test(String(t.msg || t))), JSON.stringify(h.calls.toast));
    ok('локалният store_response остава null', h.w.sdData[0].store_response === null, JSON.stringify(h.w.sdData[0].store_response));
  }

  report();
})();
