/* Разлики: писмо до доставчика и СЛЕД „✓ Без имейл" (20.10.2026).

   ЗАЩО СЪЩЕСТВУВА ТОЗИ ТЕСТ
   20.10.2026 Цветелина натисна „✓ Без имейл" за бланка Раднево 180508904.
   Бланката слезе долу, а единственият бутон „✉️ Изпрати имейл" е в горната
   карта — писмото вече не можеше да се прати. Тенчо я върна със SQL.
   Решение: „✓ Без имейл" не е окончателно. Долната таблица носи „✉️" до
   „🖨" по report_id (същият openDiffEmailModal), а успешно пращане нулира
   email_skipped_at.

   КАКВО ЗАКОВАВА
     1. бланка с email_pending=false и email_skipped_at → долу има „✉️";
        реален клик отваря модала за ТАЗИ бланка (втора бланка до нея);
     2. успешно пращане → patch с email_sent_at, email_pending:false,
        email_skipped_at:null;
     3. потребител без canSendDiffEmail → няма такъв <button>;
     4. бланка с email_sent_at → бутонът е там, title „Вече изпратен на
        дд.мм чч:мм — изпрати отново";
     5. горната карта — бутоните както преди.

   МУТАЦИИ (пуснати ръчно на 20.10.2026, всяка пада):
     M1 — без canSendDiffEmail() в условието на бутона долу
          → секция 3 пада („няма ✉️ в долната таблица");
     M2 — patch без email_skipped_at:null
          → секция 2 пада („email_skipped_at:null");
     M3 — бутонът скрит при email_sent_at (`if (emRep && !emRep.email_sent_at)`)
          → секция 4 пада („бутонът е там").

   Пускане:  node tests/diff-email-after-skip.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'accounting', store_name: 'Централен офис', assigned_stores: [] };
const ACCOUNTING = { email: 'drug@temax.bg', display_name: 'Друг Счетоводител',
  role: 'accounting', store_name: 'Централен офис', assigned_stores: [] };

function rep(o) {
  return Object.assign({ id: 'rep-1', direction: 'supplier', store_name: 'Раднево',
    counterpart: 'ТЕСИ ООД', document_number: '180508904', doc_date: '2026-10-19',
    submitted_by: 'Склад Раднево', general_comment: '', photos: [],
    created_at: '2026-10-19T08:00:00Z', reviewed: true, email_sent_at: null,
    email_pending: false, email_skipped_at: '2026-10-20T07:30:00Z', no_document: false }, o);
}
function line(o) {
  return Object.assign({ id: 'l-1', report_id: 'rep-1', store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ', quantity: 2, quantity_supplier_doc: '5',
    quantity_received: '3', type: 'missing', status: 'pending', comment: null, resolution_comment: null,
    attachments: [], credit_note_issued: false, difference_category: 'undelivered', unit: 'бр.',
    order_number: null, confirmed_date: null, resolved_by: null, resolved_at: null,
    completed_by: null, completed_at: null, warehouse_response: null, store_corrected_at: null }, o);
}

function env(reports, lines, user, view) {
  const DB = { reps: JSON.parse(JSON.stringify(reports)), lines: JSON.parse(JSON.stringify(lines)) };
  let h;
  const apply = () => {
    (h ? h.calls.patch : []).forEach(p => {
      if (p.__applied) return;
      p.__applied = true;
      const m = /id=eq\.([^&]+)/.exec(p.url);
      if (!m) return;
      const id = decodeURIComponent(m[1]);
      const tbl = /differences_reports/.test(p.url) ? DB.reps : /stock_differences/.test(p.url) ? DB.lines : null;
      const r = tbl && tbl.find(x => String(x.id) === id);
      if (r) Object.assign(r, p.body);
    });
  };
  h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'email.js'],
    user: user || CVETI, confirm: true,
    data: {
      differences_reports: () => { apply(); return JSON.parse(JSON.stringify(DB.reps)); },
      stock_differences: () => { apply(); return JSON.parse(JSON.stringify(DB.lines)); },
      stock_returns: [], transport_orders: [], users: [], contacts: [], stores: [], stock_diff_swaps: []
    }
  });
  h.DB = DB;
  h.w.sdData = JSON.parse(JSON.stringify(lines));
  h.w.diffReports = JSON.parse(JSON.stringify(reports));
  h.w.transportOrders = [];
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = 'supplier';
  /* „Долу" = изгледът „Решени редове" (#sd-rows), там е и „🖨". */
  h.w.sdView = view || 'rows';
  const origFetch = h.w.fetch;
  h.mail = [];
  h.w.fetch = function (url, init) {
    if (String(url).indexOf('/functions/v1/resend-email') >= 0) {
      h.mail.push(JSON.parse(init.body));
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"id":"mail-1"}') });
    }
    return origFetch(url, init);
  };
  h.w.renderStockDiff();
  return h;
}
const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };
const inTop = (h, id) => !!h.doc.getElementById('diff-rep-' + id);
/* Бутонът „✉️" в долната таблица (#sd-rows) за дадена бланка. */
function bottomMailBtns(h, rid) {
  const rows = h.doc.getElementById('sd-rows');
  if (!rows) return [];
  return Array.prototype.filter.call(rows.querySelectorAll('button'),
    b => /openDiffEmailModal/.test(b.getAttribute('onclick') || '') && (!rid || b.getAttribute('data-rid') === rid));
}
const repPatches = h => h.calls.patch.filter(p => /differences_reports/.test(p.url));

(async function run() {

  section('1) След „✓ Без имейл": долу има „✉️", кликът отваря модала за ТАЗИ бланка');
  {
    const h = env([rep(), rep({ id: 'rep-2', counterpart: 'ДРУГ ДОСТАВЧИК ООД', document_number: '999000111' })],
      [line(), line({ id: 'l-2', report_id: 'rep-2', supplier: 'ДРУГ ДОСТАВЧИК ООД' })]);
    h.w.sdView = 'reports'; h.w.renderStockDiff();
    ok('бланката НЕ е в „Бланки за преглед" (слязла е)', !inTop(h, 'rep-1'));
    h.w.sdView = 'rows'; h.w.renderStockDiff();
    const b = bottomMailBtns(h, 'rep-1');
    if (ok('долу има точно един „✉️" за rep-1', b.length === 1, String(b.length))) {
      ok('това е <button>', b[0].tagName === 'BUTTON');
      ok('title „Изпрати имейл до …"', /^Изпрати имейл до /.test(b[0].getAttribute('title') || ''), b[0].getAttribute('title'));
      realClick(h.w, b[0]);
      await settle();
      const ov = h.doc.getElementById('diff-email-ov');
      ok('модалът е отворен', !!ov && ov.classList.contains('open'));
      const send = h.doc.getElementById('de-send-btn');
      ok('модалът е за rep-1 (data-rid на „Изпрати")', !!send && send.getAttribute('data-rid') === 'rep-1',
        send && send.getAttribute('data-rid'));
      ok('модалът показва документа на rep-1, не на rep-2', !!ov && ov.textContent.indexOf('180508904') >= 0 &&
        ov.textContent.indexOf('999000111') < 0);
    }
    h.close();
  }

  section('2) Успешно пращане от долу → email_sent_at + email_pending:false + email_skipped_at:null');
  {
    const h = env([rep()], [line()]);
    realClick(h.w, bottomMailBtns(h, 'rep-1')[0]);
    await settle();
    h.doc.getElementById('de-to').value = 'dostavchik@tesi.bg';
    realClick(h.w, h.doc.getElementById('de-send-btn'));
    await settle();
    ok('имейлът е тръгнал', h.mail.length === 1, String(h.mail.length));
    const p = repPatches(h).find(x => 'email_sent_at' in x.body);
    if (ok('patch с email_sent_at', !!p, JSON.stringify(repPatches(h).map(x => x.body)))) {
      ok('email_sent_at е дата', !isNaN(Date.parse(p.body.email_sent_at)));
      ok('email_pending:false', p.body.email_pending === false, JSON.stringify(p.body));
      ok('email_skipped_at:null', 'email_skipped_at' in p.body && p.body.email_skipped_at === null, JSON.stringify(p.body));
      ok('patch-ът е по id на rep-1', /id=eq\.rep-1/.test(p.url), p.url);
    }
    ok('модалът е затворен', !h.doc.getElementById('diff-email-ov'));
    h.close();
  }

  section('3) Без canSendDiffEmail → няма бутон „✉️" долу');
  {
    const h = env([rep()], [line()], ACCOUNTING);
    ok('потребителят наистина няма право', h.w.canSendDiffEmail() === false);
    ok('редът е в долната таблица', !!h.doc.querySelector('#sd-rows tr'));
    ok('няма ✉️ в долната таблица', bottomMailBtns(h).length === 0, String(bottomMailBtns(h).length));
    ok('„🖨" си е там', !!h.doc.querySelector('#sd-rows button[onclick^="loadDiffPrint"]'));
    h.close();
  }

  section('4) Вече изпратен → бутонът е там, title „Вече изпратен на дд.мм чч:мм — изпрати отново"');
  {
    const sent = '2026-10-20T09:05:00Z';
    const h = env([rep({ email_sent_at: sent, email_skipped_at: null })], [line()]);
    const b = bottomMailBtns(h, 'rep-1');
    if (ok('бутонът е там', b.length === 1, String(b.length))) {
      const d = new Date(sent), p = n => (n < 10 ? '0' : '') + n;
      const want = 'Вече изпратен на ' + p(d.getDate()) + '.' + p(d.getMonth() + 1) + ' ' +
        p(d.getHours()) + ':' + p(d.getMinutes()) + ' — изпрати отново';
      ok('title-ът е точно „' + want + '"', b[0].getAttribute('title') === want, b[0].getAttribute('title'));
      ok('формат дд.мм чч:мм', /^Вече изпратен на \d\d\.\d\d \d\d:\d\d — изпрати отново$/.test(b[0].getAttribute('title')));
    }
    h.close();
  }

  section('5) Горната карта — бутоните както преди');
  {
    const h = env([rep({ reviewed: true, email_pending: true, email_skipped_at: null })], [line()], undefined, 'reports');
    const c = h.doc.getElementById('diff-rep-rep-1');
    if (ok('бланката е горе', !!c)) {
      ok('„🖨 Печат"', !!btn(c, '🖨 Печат'));
      ok('„✉️ Изпрати имейл"', !!btn(c, '✉️ Изпрати имейл'));
      ok('„✓ Без имейл"', !!btn(c, '✓ Без имейл'));
      const em = btn(c, '✉️ Изпрати имейл');
      ok('„✉️ Изпрати имейл" без title (както преди)', !!em && !em.hasAttribute('title'));
    }
    /* Без право — горе няма имейл бутони, както преди. */
    const h2 = env([rep({ reviewed: true, email_pending: true, email_skipped_at: null })], [line()], ACCOUNTING, 'reports');
    const c2 = h2.doc.getElementById('diff-rep-rep-1');
    ok('без право: горе няма „✉️ Изпрати имейл" и „✓ Без имейл"',
      !c2 || (!btn(c2, '✉️ Изпрати имейл') && !btn(c2, '✓ Без имейл')));
    h.close(); h2.close();
  }

  report();
})();
