/* Разлики: решената бланка остава горе, докато не тръгне имейл или „✓ Без имейл".
   (Точка 3 от Цвети, 28.09.2026.)

   Досега последното решение пишеше reviewed=true и бланката излизаше от
   горната секция — заедно с единствения бутон „✉️ Изпрати имейл". Сега:
     · при посока, по която решава Цвети (не междускладова), СЪЩИЯТ patch
       пише и email_pending=true → бланката остава горе с етикет
       „✅ Решена — чака имейл" и бутони „✉️ Изпрати имейл" / „✓ Без имейл";
     · имейл вече пратен ПРЕДИ последното решение → само reviewed, слиза направо;
     · изпратен имейл → email_sent_at + email_pending=false → слиза долу;
     · „✓ Без имейл" → email_pending=false + email_skipped_at → слиза долу;
     · заварените прегледани (email_pending=false) НЕ се връщат горе;
     · броячите за „непрегледани" не виждат email_pending.

   Базата е стъб, който ПРИЛАГА patch-овете — презареждането след всяко
   действие вижда новото състояние, както на живо.

   Пускане:  node tests/diff-email-pending.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

function rep(o) {
  return Object.assign({ id: 'rep-1', direction: 'supplier', store_name: 'Раднево',
    counterpart: 'ТЕСИ ООД', document_number: '180489966', doc_date: '2026-09-20',
    submitted_by: 'Склад Раднево', general_comment: '', photos: [],
    created_at: '2026-09-20T08:00:00Z', reviewed: false, email_sent_at: null,
    email_pending: false, email_skipped_at: null, no_document: false }, o);
}
function line(o) {
  return Object.assign({ id: 'l-1', report_id: 'rep-1', store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ', quantity: 2, quantity_supplier_doc: '5',
    quantity_received: '3', type: null, status: 'new', comment: null, resolution_comment: null,
    attachments: [], credit_note_issued: false, difference_category: 'undelivered', unit: 'бр.',
    order_number: null, confirmed_date: null, resolved_by: null, resolved_at: null,
    completed_by: null, completed_at: null, warehouse_response: null, store_corrected_at: null }, o);
}

function env(reports, lines, opts) {
  opts = opts || {};
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
      if (r && !(h.calls.notOk || []).some(n => n.url === p.url && n.method === 'PATCH')) Object.assign(r, p.body);
    });
  };
  h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'email.js'],
    user: CVETI, confirm: true,
    data: {
      differences_reports: () => { apply(); return JSON.parse(JSON.stringify(DB.reps)); },
      stock_differences: () => { apply(); return JSON.parse(JSON.stringify(DB.lines)); },
      stock_returns: [], transport_orders: [], users: [], contacts: [], stores: [], stock_diff_swaps: []
    },
    fail: opts.fail
  });
  h.DB = DB;
  h.w.sdData = JSON.parse(JSON.stringify(lines));
  h.w.diffReports = JSON.parse(JSON.stringify(reports));
  h.w.transportOrders = [];
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = opts.tab || 'supplier';
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
const card = (h, id) => h.doc.getElementById('diff-rep-' + id);
const repPatches = h => h.calls.patch.filter(p => /differences_reports/.test(p.url));
function resolveBtn(h, lineId, label) {
  return Array.prototype.find.call(h.doc.querySelectorAll('button[data-id="' + lineId + '"]'),
    b => /resolveDiffLine/.test(b.getAttribute('onclick') || '') && b.textContent.indexOf(label) >= 0) || null;
}
const cardBtn = (h, id, label) => card(h, id) ? btn(card(h, id), label) : null;

(async function run() {

  section('а) Доставчик: последно решение → reviewed + email_pending в ЕДИН patch; остава горе');
  {
    const h = env([rep()], [line({ id: 'l-1', type: 'missing', status: 'pending' }), line({ id: 'l-2' })]);
    ok('бланката е горе (непрегледана)', inTop(h, 'rep-1'));
    const b = resolveBtn(h, 'l-2', 'Липса');
    if (ok('бутонът „Липса" на последния ред е на екрана', !!b)) {
      realClick(h.w, b);
      await settle();
      const rp = repPatches(h);
      if (ok('точно един patch към differences_reports', rp.length === 1, JSON.stringify(rp.map(p => p.body)))) {
        ok('носи reviewed:true И email_pending:true', rp[0].body.reviewed === true && rp[0].body.email_pending === true,
          JSON.stringify(rp[0].body));
      }
      ok('бланката е още горе', inTop(h, 'rep-1'));
      const c = card(h, 'rep-1');
      ok('с етикет „✅ Решена — чака имейл"', !!c && c.textContent.indexOf('✅ Решена — чака имейл') >= 0);
      ok('с бутон „✉️ Изпрати имейл"', !!cardBtn(h, 'rep-1', '✉️ Изпрати имейл'));
      ok('с бутон „✓ Без имейл"', !!cardBtn(h, 'rep-1', '✓ Без имейл'));
    }
    h.close();
  }

  section('а2) Имейл вече пратен ПРЕДИ последното решение → само reviewed, слиза направо');
  {
    const h = env([rep({ email_sent_at: '2026-09-21T09:00:00Z' })],
      [line({ id: 'l-1', type: 'missing', status: 'pending' }), line({ id: 'l-2' })]);
    ok('преди решението е горе (непрегледана)', inTop(h, 'rep-1'));
    const b = resolveBtn(h, 'l-2', 'Липса');
    if (ok('бутонът „Липса" на последния ред е на екрана', !!b)) {
      realClick(h.w, b);
      await settle();
      const rp = repPatches(h);
      ok('един patch, и той е само {reviewed:true} — без email_pending',
        rp.length === 1 && JSON.stringify(rp[0].body) === '{"reviewed":true}', JSON.stringify(rp.map(p => p.body)));
      ok('бланката слезе направо долу', !inTop(h, 'rep-1'));
      ok('няма бутон „✓ Без имейл"', !btn(h.doc, '✓ Без имейл'));
    }
    ok('sdReviewedPatch при email_sent_at и сторна = само reviewed', (() => {
      h.w.diffReports[0].direction = 'wrong_receipt';
      return JSON.stringify(h.w.sdReviewedPatch('rep-1')) === '{"reviewed":true}';
    })());
    h.close();
  }

  section('б) „Изпрати имейл" → email_sent_at + email_pending=false → слиза долу');
  {
    const h = env([rep({ reviewed: true, email_pending: true })], [line({ type: 'missing', status: 'pending' })]);
    ok('горе е, с етикета', inTop(h, 'rep-1') && card(h, 'rep-1').textContent.indexOf('чака имейл') >= 0);
    realClick(h.w, cardBtn(h, 'rep-1', '✉️ Изпрати имейл'));
    await settle();
    h.doc.getElementById('de-to').value = 'dostavchik@tesi.bg';
    realClick(h.w, h.doc.getElementById('de-send-btn'));
    await settle();
    ok('имейлът е тръгнал', h.mail.length === 1, String(h.mail.length));
    const p = repPatches(h).find(x => 'email_sent_at' in x.body);
    if (ok('patch с email_sent_at', !!p, JSON.stringify(repPatches(h).map(x => x.body)))) {
      ok('в същия patch email_pending:false', p.body.email_pending === false, JSON.stringify(p.body));
    }
    ok('бланката слезе долу (няма я в горната секция)', !inTop(h, 'rep-1'));
    h.close();
  }

  section('в) „✓ Без имейл" → email_pending=false + email_skipped_at → слиза долу');
  {
    const h = env([rep({ reviewed: true, email_pending: true })], [line({ type: 'missing', status: 'pending' })]);
    const b = cardBtn(h, 'rep-1', '✓ Без имейл');
    if (ok('бутонът е на екрана', !!b)) {
      realClick(h.w, b);
      await settle();
      const p = repPatches(h)[0];
      ok('patch: email_pending:false + email_skipped_at', !!p && p.body.email_pending === false &&
        typeof p.body.email_skipped_at === 'string' && !isNaN(Date.parse(p.body.email_skipped_at)),
        JSON.stringify(p && p.body));
      ok('НЕ пише reviewed и email_sent_at', !!p && !('reviewed' in p.body) && !('email_sent_at' in p.body));
      ok('не е пратен имейл', h.mail.length === 0);
      ok('бланката слезе долу', !inTop(h, 'rep-1'));
      ok('toast „без имейл"', h.calls.toast.some(t => String(t).indexOf('без имейл') >= 0), h.calls.toast.join(' | '));
    }
    h.close();
  }

  section('г) Междускладова: email_pending НЕ се пише, поведението както досега');
  {
    const R = rep({ direction: 'interstore', counterpart: 'Логистичен склад Търговище' });
    const h = env([R], [line({ id: 'l-9', status: 'pending', warehouse_response: 'sent' })], { tab: 'interstore' });
    ok('sdReviewedPatch за междускладова = само reviewed',
      JSON.stringify(h.w.sdReviewedPatch('rep-1')) === '{"reviewed":true}', JSON.stringify(h.w.sdReviewedPatch('rep-1')));
    ok('за доставчик = reviewed + email_pending',
      (() => { h.w.diffReports[0].direction = 'supplier'; const s = JSON.stringify(h.w.sdReviewedPatch('rep-1'));
        h.w.diffReports[0].direction = 'interstore'; return s === '{"reviewed":true,"email_pending":true}'; })());
    ok('за сторна по грешен прием = reviewed + email_pending',
      (() => { h.w.diffReports[0].direction = 'wrong_receipt'; const s = JSON.stringify(h.w.sdReviewedPatch('rep-1'));
        h.w.diffReports[0].direction = 'interstore'; return s === '{"reviewed":true,"email_pending":true}'; })());
    ok('непозната бланка = само reviewed', JSON.stringify(h.w.sdReviewedPatch('няма')) === '{"reviewed":true}');
    /* Истинският път на междускладовия поток: магазинът потвърждава
       „Прието" по последния ред (sdConfirmInterstore) — оттам идва reviewed. */
    const h2 = env([R], [line({ id: 'l-9', status: 'pending', warehouse_response: 'sent' })],
      { tab: 'interstore' });
    h2.w.sdConfirmInterstore('l-9', 'store');
    await settle();
    const rp = repPatches(h2);
    ok('„Прието" по последния ред пише patch към бланката', rp.length === 1,
      JSON.stringify(rp.map(p => p.body)) + ' | ' + h2.calls.toast.join(' | '));
    ok('и той е само {reviewed:true} — без email_pending',
      rp.length === 1 && JSON.stringify(rp[0].body) === '{"reviewed":true}', JSON.stringify(rp.map(p => p.body)));
    ok('междускладовата слиза долу, както досега', !inTop(h2, 'rep-1'));
    h.close(); h2.close();
  }

  section('д) Заварена прегледана бланка без имейл и email_pending=false → НЕ е горе');
  {
    const h = env([rep({ reviewed: true, email_sent_at: null, email_pending: false })],
      [line({ type: 'missing', status: 'pending' })]);
    ok('не е в горната секция', !inTop(h, 'rep-1'));
    ok('няма бутон „✓ Без имейл" никъде', !btn(h.doc, '✓ Без имейл'));
    /* И липсваща колона (преди SQL-а) се държи като false. */
    const R = rep({ reviewed: true }); delete R.email_pending;
    const h2 = env([R], [line({ type: 'missing', status: 'pending' })]);
    ok('без поле email_pending също не е горе', !inTop(h2, 'rep-1'));
    h.close(); h2.close();
  }

  section('е) Броячите за „непрегледани" не се променят от email_pending');
  {
    const reports = [rep({ id: 'rep-1' }), rep({ id: 'rep-2', reviewed: true, email_pending: true })];
    const h = env(reports, [line({ report_id: 'rep-1' }), line({ id: 'l-2', report_id: 'rep-2', type: 'missing', status: 'pending' })]);
    ok('sdVisibleUnreviewedReports() = 1 (само rep-1)', h.w.sdVisibleUnreviewedReports().length === 1,
      String(h.w.sdVisibleUnreviewedReports().length));
    ok('sdUnreviewedCountFor() = 1', h.w.sdUnreviewedCountFor(h.w.diffReports, h.w.sdData, []) === 1,
      String(h.w.sdUnreviewedCountFor(h.w.diffReports, h.w.sdData, [])));
    const tab = h.doc.querySelector('button[data-dir="supplier"]');
    ok('подтабът „Доставчик" брои „🆕 1", не 2', !!tab && /🆕 1$/.test(tab.textContent.trim()),
      tab && tab.textContent);
    ok('и двете са горе', inTop(h, 'rep-1') && inTop(h, 'rep-2'));
    const ids = Array.prototype.map.call(h.doc.querySelectorAll('[id^="diff-rep-"]'), e => e.id);
    ok('чакащата имейл е СЛЕД непрегледаната', ids.join('|') === 'diff-rep-rep-1|diff-rep-rep-2', ids.join('|'));
    h.close();
  }

  section('ж) Провален patch → червен toast, бланката остава горе');
  {
    const fail = { PATCH: { status: 400, body: { message: 'column "email_pending" does not exist' }, url: /differences_reports/ } };
    const h = env([rep({ reviewed: true, email_pending: true })], [line({ type: 'missing', status: 'pending' })], { fail });
    realClick(h.w, cardBtn(h, 'rep-1', '✓ Без имейл'));
    await settle();
    ok('червен toast с грешката', h.calls.toast.some(t => String(t).indexOf('Грешка при запис') >= 0), h.calls.toast.join(' | '));
    ok('бланката остава горе', inTop(h, 'rep-1'));
    ok('местното състояние не е обърнато', h.w.diffReports[0].email_pending === true);

    /* Същото при имейла: тръгнал е, но бланката не е отбелязана. */
    const h2 = env([rep({ reviewed: true, email_pending: true })], [line({ type: 'missing', status: 'pending' })], { fail });
    realClick(h2.w, cardBtn(h2, 'rep-1', '✉️ Изпрати имейл'));
    await settle();
    h2.doc.getElementById('de-to').value = 'dostavchik@tesi.bg';
    realClick(h2.w, h2.doc.getElementById('de-send-btn'));
    await settle();
    ok('имейл: червен toast „НЕ е отбелязана"', h2.calls.toast.some(t => String(t).indexOf('НЕ е отбелязана') >= 0),
      h2.calls.toast.join(' | '));
    ok('имейл: бланката остава горе', inTop(h2, 'rep-1'));

    /* И при последното решение: колоната липсва → бланката не се затваря, казва се. */
    const h3 = env([rep()], [line({ id: 'l-2' })], { fail });
    realClick(h3.w, resolveBtn(h3, 'l-2', 'Липса'));
    await settle();
    ok('решение: червен toast „НЕ е отбелязана"', h3.calls.toast.some(t => String(t).indexOf('НЕ е отбелязана') >= 0),
      h3.calls.toast.join(' | '));
    ok('решение: бланката остава горе', inTop(h3, 'rep-1'));
    h.close(); h2.close(); h3.close();
  }

  report();
})();
