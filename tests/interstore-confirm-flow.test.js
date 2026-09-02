/* Междускладов трансфер: потвърждение от отсрещната страна и край на бланката.

   Потокът нямаше край. reviewed=true се пише САМО в resolveDiffLine() -
   решението на Цвети, което за посока "междускладов" не съществува и никога
   няма да дойде. Затова към 02.09.2026 всичките 24 междускладови бланки бяха
   reviewed=false и всичките 53 реда status='new', въпреки че складът беше
   отговорил по 16 от тях.

   Сега потвърждава страната, при която стоката ОТИВА:
     - "📤 Изпратено"        -> магазинът получател;
     - "↩️ Обратно движение" -> складът, който я приема обратно;
     - "⏳ Ще се изпрати"    -> още никой, няма какво да се потвърждава.
   Последният потвърден ред затваря бланката (differences_reports.reviewed).

   Пускане:  node tests/interstore-confirm-flow.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, allBtns, ticks } = H;

const REP_INT = {
  id: 'rep-int', direction: 'interstore', store_name: 'Петрич',
  counterpart: 'Логистичен склад Търговище', document_number: '180491138',
  doc_date: '2026-08-30', submitted_by: 'Управител Петрич', general_comment: '',
  photos: [], reviewed: false, created_at: '2026-08-30T09:00:00.000Z'
};
const REP_SUP = {
  id: 'rep-sup', direction: 'supplier', store_name: 'Петрич',
  counterpart: 'ТЕСИ ООД', document_number: '180489966', doc_date: '2026-08-29',
  submitted_by: 'Управител Петрич', general_comment: '', photos: [],
  reviewed: false, created_at: '2026-08-29T09:00:00.000Z'
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
    store_corrected_at: null, warehouse_response: null, warehouse_comment: null
  }, o);
}

/* Складът влиза с обичаен профил, но store_name е ТОЧНО името на склада -
   така го разпознава isLogisticsWarehouseUser(). */
const WAREHOUSE = {
  email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
  role: 'sklad', store_name: 'Логистичен склад Търговище', assigned_stores: []
};
const STORE = {
  email: 'petrich@temax.bg', display_name: 'Управител Петрич',
  role: 'manager', store_name: 'Петрич', assigned_stores: []
};

function env(user, lines, opts) {
  opts = opts || {};
  const h = boot({
    /* transport.js преди stock-differences.js - редът от index.html. */
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user,
    confirm: true,
    data: {
      stock_differences: lines, differences_reports: opts.reports || [REP_INT, REP_SUP],
      stock_returns: [], transport_orders: [], users: [],
      stores: [{ name: 'Петрич' }, { name: 'Логистичен склад Търговище' }],
      contacts: [{ name: 'ТЕСИ ООД' }]
    }
  });
  h.w.sdData = JSON.parse(JSON.stringify(lines));
  h.w.diffReports = JSON.parse(JSON.stringify(opts.reports || [REP_INT, REP_SUP]));
  h.w.transportOrders = [];
  h.w.sdFilter = opts.filter || 'pending';
  h.w.sdTypeFilter = 'all';
  h.w.sdStoreFilter = '';
  h.w.sdSearch = '';
  h.w.sdDirTab = opts.dirTab || 'interstore';
  h.w.invalidateStoreCaches();
  h.w.invalidateSuppliersCache();
  return h;
}

const card = (doc, id) => doc.getElementById('diff-rep-' + id);

/* Главната таблица се разпознава по заглавието "Кредитно" - само нейно е. */
function mainTable(doc) {
  const tables = doc.querySelectorAll('#mod-stock-diff table');
  for (let i = 0; i < tables.length; i++) {
    const head = tables[i].querySelector('thead');
    if (head && head.textContent.indexOf('Кредитно') >= 0) return tables[i];
  }
  return null;
}
const CONFIRM = '✅ Получено';
const BACK = '📬 Прието обратно';

(async function () {

  section('a) Складът, ред без отговор — нито един от двата бутона');
  {
    const h = env(WAREHOUSE, [line({ id: 'l-1' })]);
    h.w.renderStockDiff();
    const c = card(h.doc, 'rep-int');
    if (ok('картата на бланката се рендира', !!c)) {
      /* Проверката е САМО по <button> - текстът може да стои и в span. */
      ok('няма бутон "' + CONFIRM + '"', !btn(c, CONFIRM), c.textContent.slice(0, 200));
      ok('няма бутон "' + BACK + '"', !btn(c, BACK));
      ok('складът все пак вижда собствените си бутони за отговор',
        !!btn(c, '📤 Изпратено') && !!btn(c, '↩️ Обратно'));
      ok('sdInterstoreConfirmButton() връща празно',
        h.w.sdInterstoreConfirmButton(h.w.sdData[0], h.w.diffReports[0]) === '',
        JSON.stringify(h.w.sdInterstoreConfirmButton(h.w.sdData[0], h.w.diffReports[0])));
    }
  }

  section('b) Магазинът потвърждава ред "Изпратено" — бланката ОЩЕ не се затваря');
  {
    const h = env(STORE, [
      line({ id: 'l-1', warehouse_response: 'sent' }),
      line({ id: 'l-2', material_name: 'КРАН СФЕРИЧЕН', warehouse_response: 'sent' })
    ]);
    h.w.renderStockDiff();
    const c = card(h.doc, 'rep-int');
    const b = btn(c, CONFIRM);
    if (ok('магазинът вижда бутон "' + CONFIRM + '"', !!b, c && c.textContent.slice(0, 200))) {
      ok('бутоните са два — по един на ред', allBtns(c, CONFIRM).length === 2,
        String(allBtns(c, CONFIRM).length));
      realClick(h.w, b);
      await ticks(); await ticks();

      const lp = h.calls.patch.filter(p => p.table === 'stock_differences');
      if (ok('редът е patch-нат', lp.length === 1, JSON.stringify(h.calls.patch.map(p => p.table)))) {
        ok('status е "received"', lp[0].body.status === 'received', JSON.stringify(lp[0].body.status));
        ok('completed_by е потребителят', lp[0].body.completed_by === 'Управител Петрич',
          JSON.stringify(lp[0].body.completed_by));
        ok('completed_at е попълнено', !!lp[0].body.completed_at, JSON.stringify(lp[0].body.completed_at));
        ok('URL сочи точния ред', /id=eq\.l-1/.test(lp[0].url), lp[0].url);
      }
      ok('бланката НЕ е patch-ната (вторият ред още не е потвърден)',
        !h.calls.patch.some(p => p.table === 'differences_reports'),
        JSON.stringify(h.calls.patch.map(p => p.table)));
      ok('съобщението е "✅ Записано"',
        h.calls.toast.some(t => String(t.msg || t) === '✅ Записано'), JSON.stringify(h.calls.toast));
      ok('и НЕ е "приключена"',
        !h.calls.toast.some(t => /приключена/.test(String(t.msg || t))), JSON.stringify(h.calls.toast));
    }
  }

  section('c) Последният ред затваря бланката (reviewed=true)');
  {
    const h = env(STORE, [
      line({ id: 'l-1', status: 'received', completed_by: 'Управител Петрич',
             completed_at: '2026-09-01T10:00:00.000Z', warehouse_response: 'sent' }),
      line({ id: 'l-2', material_name: 'КРАН СФЕРИЧЕН', warehouse_response: 'sent' })
    ]);
    h.w.renderStockDiff();
    const c = card(h.doc, 'rep-int');
    ok('вече потвърденият ред е само текст, без бутон',
      allBtns(c, CONFIRM).length === 1, String(allBtns(c, CONFIRM).length));
    ok('и показва кой и кога', c.textContent.indexOf('📬 Получено · Управител Петрич') >= 0,
      c.textContent.slice(0, 300));
    ok('заглавието брои потвърдените, не "недокосната"',
      c.textContent.indexOf('📬 1/2 потвърдени') >= 0 &&
      c.textContent.indexOf('недокосната') < 0, c.textContent.slice(0, 200));

    realClick(h.w, btn(c, CONFIRM));
    await ticks(); await ticks(); await ticks();

    const rp = h.calls.patch.filter(p => p.table === 'differences_reports');
    if (ok('бланката е patch-ната', rp.length === 1, JSON.stringify(h.calls.patch.map(p => p.table)))) {
      ok('reviewed:true', rp[0].body.reviewed === true, JSON.stringify(rp[0].body));
      ok('URL сочи точната бланка', /id=eq\.rep-int/.test(rp[0].url), rp[0].url);
    }
    ok('съобщението е "✅ Бланката е приключена"',
      h.calls.toast.some(t => /Бланката е приключена/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
  }

  section('d) Обратно движение — потвърждава СКЛАДЪТ, не магазинът');
  {
    const wh = env(WAREHOUSE, [line({ id: 'l-1', warehouse_response: 'return' })]);
    wh.w.renderStockDiff();
    const cw = card(wh.doc, 'rep-int');
    ok('складът вижда "' + BACK + '"', !!btn(cw, BACK), cw && cw.textContent.slice(0, 200));
    ok('и НЕ вижда "' + CONFIRM + '"', !btn(cw, CONFIRM));

    realClick(wh.w, btn(cw, BACK));
    await ticks(); await ticks();
    const lp = wh.calls.patch.filter(p => p.table === 'stock_differences');
    if (ok('редът е patch-нат', lp.length === 1, JSON.stringify(wh.calls.patch.map(p => p.table)))) {
      ok('status е "received"', lp[0].body.status === 'received', JSON.stringify(lp[0].body.status));
      ok('completed_by е складът', lp[0].body.completed_by === 'Склад Търговище',
        JSON.stringify(lp[0].body.completed_by));
    }
    ok('бланката се затваря (единствен ред)',
      wh.calls.patch.some(p => p.table === 'differences_reports' && p.body.reviewed === true),
      JSON.stringify(wh.calls.patch.map(p => p.table)));

    const st = env(STORE, [line({ id: 'l-1', warehouse_response: 'return' })]);
    st.w.renderStockDiff();
    const cs = card(st.doc, 'rep-int');
    ok('магазинът НЕ вижда "' + BACK + '"', !btn(cs, BACK), cs && cs.textContent.slice(0, 200));
    ok('и НЕ вижда "' + CONFIRM + '" при обратно движение', !btn(cs, CONFIRM));
  }

  section('e) "Ще се изпрати" — никакъв бутон, само текст "чака изпращане"');
  {
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'will_send' })]);
    h.w.renderStockDiff();
    const c = card(h.doc, 'rep-int');
    ok('няма бутон "' + CONFIRM + '"', !btn(c, CONFIRM), c && c.textContent.slice(0, 200));
    ok('няма бутон "' + BACK + '"', !btn(c, BACK));
    ok('пише "чака изпращане"', c.textContent.indexOf('чака изпращане') >= 0,
      c.textContent.slice(0, 300));
  }

  section('f) Потвърден ред БЕЗ тип влиза в главната таблица и не гърми');
  {
    const rec = line({ id: 'l-1', status: 'received', type: null,
      completed_by: 'Управител Петрич', completed_at: '2026-09-01T10:00:00.000Z',
      warehouse_response: 'sent' });
    const h = env(STORE, [rec], { filter: 'all' });
    ok('sdTableRows() го включва', h.w.sdTableRows().length === 1,
      String(h.w.sdTableRows().length));
    /* Старият предикат беше само !r.type - точно него сменяме. */
    ok('старият предикат (!r.type) би го изхвърлил', !rec.type);

    if (guard('renderStockDiff() не хвърля при type=null', () => h.w.renderStockDiff())) {
      const t = mainTable(h.doc);
      if (ok('главната таблица съществува', !!t)) {
        const rows = t.querySelectorAll('tbody tr');
        ok('редът е вътре', rows.length === 1, String(rows.length));
        ok('колоната "Тип" показва тире, не "undefined"',
          rows[0].textContent.indexOf('undefined') < 0 &&
          rows[0].cells[0].textContent.trim() === '—', rows[0].cells[0].textContent);
        ok('статусът е "📬 ПРИЕТА"', rows[0].textContent.indexOf('📬 ПРИЕТА') >= 0,
          rows[0].textContent.slice(0, 200));
        /* Тук беше вторият капан: type=null праща етикета на бутона в
           fallback-а "✅ Приета", а клик по него би записал status='taken'
           върху потвърждението и би върнал реда в "чакащи". */
        ok('НЯМА бутон, който да презапише потвърждението',
          !btn(rows[0], 'Приета') && !btn(rows[0], 'Заприходена') && !btn(rows[0], 'Върната'),
          Array.prototype.map.call(rows[0].querySelectorAll('button'), b => b.textContent).join(' | '));
      }
      ok('sdRowStatusBadge() не гърми при type=null',
        h.w.sdRowStatusBadge(rec).indexOf('ПРИЕТА') >= 0, h.w.sdRowStatusBadge(rec));
      ok('sdStatusWords(null) връща употребими думи',
        !!h.w.sdStatusWords(null).pending && !!h.w.sdStatusWords(null).taken,
        JSON.stringify(h.w.sdStatusWords(null)));
    }
  }

  section('g) Доставкова бланка — нито един от новите бутони');
  {
    const h = env(STORE, [
      line({ id: 'l-9', report_id: 'rep-sup', supplier: 'ТЕСИ ООД', warehouse_response: 'sent' })
    ], { dirTab: 'supplier' });
    h.w.renderStockDiff();
    const c = card(h.doc, 'rep-sup');
    if (ok('картата на доставковата бланка се рендира', !!c)) {
      ok('няма "' + CONFIRM + '"', !btn(c, CONFIRM), c.textContent.slice(0, 200));
      ok('няма "' + BACK + '"', !btn(c, BACK));
    }
    ok('sdInterstoreConfirmButton() връща празно за supplier',
      h.w.sdInterstoreConfirmButton(h.w.sdData[0], h.w.diffReports[1]) === '',
      JSON.stringify(h.w.sdInterstoreConfirmButton(h.w.sdData[0], h.w.diffReports[1])));
    ok('заглавието на доставковата карта НЕ е сменено',
      c.textContent.indexOf('⬜ 0/1 — недокосната') >= 0 &&
      c.textContent.indexOf('потвърдени') < 0, c.textContent.slice(0, 220));
  }

  section('h) Отказ на confirm() — нищо не се записва');
  {
    const h = env(STORE, [line({ id: 'l-1', warehouse_response: 'sent' })]);
    h.w.confirm = () => false;
    h.w.renderStockDiff();
    realClick(h.w, btn(card(h.doc, 'rep-int'), CONFIRM));
    await ticks();
    ok('нула PATCH', h.calls.patch.length === 0, JSON.stringify(h.calls.patch.map(p => p.table)));
  }

  section('i) Провалена заявка — червен toast и нищо повече');
  {
    const h = boot({
      modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
      user: STORE, confirm: true,
      fail: { PATCH: /stock_differences/ },
      data: { stock_differences: [], differences_reports: [REP_INT], stock_returns: [],
              transport_orders: [], users: [], stores: [], contacts: [] }
    });
    h.w.sdData = [line({ id: 'l-1', warehouse_response: 'sent' })];
    h.w.diffReports = [JSON.parse(JSON.stringify(REP_INT))];
    h.w.sdDirTab = 'interstore'; h.w.sdFilter = 'pending';
    h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
    h.w.renderStockDiff();
    realClick(h.w, btn(card(h.doc, 'rep-int'), CONFIRM));
    await ticks(); await ticks();
    ok('червен toast за грешка',
      h.calls.toast.some(t => /Грешка при запис/.test(String(t.msg || t))),
      JSON.stringify(h.calls.toast));
    ok('бланката НЕ се затваря при провалил се ред',
      !h.calls.patch.some(p => p.table === 'differences_reports'),
      JSON.stringify(h.calls.patch.map(p => p.table)));
    ok('локалният ред остава непроменен', h.w.sdData[0].status === 'new',
      h.w.sdData[0].status);
  }

  report();
})();
