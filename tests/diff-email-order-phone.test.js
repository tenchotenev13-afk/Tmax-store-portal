/* Имейл до доставчик от Разлики: поръчката вместо входящата + телефон
   (Цветелина, 20.10.2026 т.3 и т.8; отговор 21.10).

   Доставчиците не познават номера на входящата доставка (180…), а само
   поръчката; всяка бланка е по една поръчка. Затова при посока доставчик:
     · тема „<поръчка> - РАЗЛИКИ (<обект>)", текст „…, поръчка №<поръчка>, …";
     · поръчката е от редовете — всички непразни еднакви и валидни
       (diffReportOrderNum); иначе остава входящата, както досега;
     · под подписа „Тел: +359 884733836" (DIFF_EMAIL_PHONE).
   Междускладовата — байт по байт както преди (снимката отдолу е генерирана
   от aea7f03; не се чете от git — CI е shallow).

   а) supplier, 2 реда 4100204934 → тема/текст с поръчката, без входящата, с телефон
   б) supplier с 43… (4300001221) → същото
   в) supplier без поръчка / с два различни номера → входящата, както днес
   г) interstore → тема и тяло = снимката отпреди (без телефон)
   д) прегледът в модала = изпратеното тяло
   е) „без документ" + поръчка → „документ: няма (стока без документ), поръчка №…";
      „без документ" без поръчка → както преди

   Мутационна проверка (21.10.2026, поотделно върху stock-differences.js; при
   всяка тестът пада с exit 1):
     1. темата пак с входящата (subjNum = rep.document_number)   → пада (а)
     2. телефонът и при interstore                              → пада (г)
     3. различни поръчки → взима първата (без every)            → пада (в)
     4. текстът пак с „документ №" при поръчка                   → пада (а)
     5. diffReportOrderNum и при interstore (без проверка посока) → пада (г)
     6. „без документ" без поръчката в текста                    → пада (е)

   Пускане:  node tests/diff-email-order-phone.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, ticks } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'accounting', store_name: 'Централен офис', assigned_stores: ['Шумен'] };

function line(o) {
  return Object.assign({ report_id: 'rep-1', store_name: 'Шумен', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'ПЛАНКА ЪГЛОВА', quantity: 5, quantity_supplier_doc: 3,
    quantity_received: 2, type: 'missing', status: 'pending', comment: 'Липсват 3 броя',
    resolution_comment: null, attachments: [], difference_category: 'undelivered', unit: 'бр.',
    order_number: null, warehouse_response: null, store_corrected_at: null }, o);
}
function rep(o) {
  return Object.assign({ id: 'rep-1', direction: 'supplier', store_name: 'Шумен',
    counterpart: 'ТЕСИ ООД', document_number: '180508904', doc_date: '2026-10-20',
    submitted_by: 'Склад Шумен', general_comment: '', created_at: '2026-10-20T08:00:00.000Z',
    photos: [], reviewed: false, no_document: false }, o);
}

function env(R, L) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'email.js'],
    user: CVETI,
    data: { stock_differences: L, differences_reports: [R], stock_returns: [], transport_orders: [],
      users: [], contacts: [], stores: [] }
  });
  h.w.sdData = JSON.parse(JSON.stringify(L));
  h.w.diffReports = [JSON.parse(JSON.stringify(R))];
  h.w.transportOrders = [];
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdDirTab = R.direction;
  const origFetch = h.w.fetch;
  h.mail = [];
  h.w.fetch = function (url, init) {
    if (String(url).indexOf('/functions/v1/resend-email') >= 0) {
      h.mail.push(JSON.parse(init.body));
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"ok":true}') });
    }
    return origFetch(url, init);
  };
  return h;
}

/* Отваря модала, пише получател и натиска истинския „✉️ Изпрати". */
async function sendVia(h) {
  h.w.openDiffEmailModal('rep-1');
  await ticks();
  const doc = h.w.document;
  const out = { subjectField: doc.getElementById('de-subject').value };
  const prev = doc.querySelector('#diff-email-ov div[style*="max-height:220px"]');
  out.preview = prev ? prev.innerHTML : null;
  doc.getElementById('de-to').value = 'orders@tesi.bg';
  const b = doc.getElementById('de-send-btn');
  if (!ok('бутонът „✉️ Изпрати" съществува', !!b)) return out;
  guard('клик по „Изпрати"', () => realClick(h.w, b, 'Изпрати'));
  for (let i = 0; i < 6; i++) await ticks();
  ok('тръгна точно едно писмо', h.mail.length === 1, 'писма: ' + h.mail.length);
  out.mail = h.mail[0] || {};
  return out;
}

/* Снимка от aea7f03 (преди промяната) на същия interstore fixture. */
const SNAP_SUBJ = "180491138 - РАЗЛИКИ (Шумен)";
const SNAP_BODY = "<div style=\"font-family:Arial,sans-serif;font-size:14px;color:#1f2937;\"><p>Здравейте,</p><p>Установени са разлики при междускладов трансфер — Логистичен склад Търговище, документ №180491138, дата 20.10.2026.</p><table style=\"width:100%;border-collapse:collapse;font-size:13px;margin:14px 0;\"><tr style=\"background:#f3f4f6;\"><th style=\"border:1px solid #ccc;padding:6px;text-align:left;\">SAP №</th><th style=\"border:1px solid #ccc;padding:6px;text-align:left;\">Артикул</th><th style=\"border:1px solid #ccc;padding:6px;text-align:left;\">Категория</th><th style=\"border:1px solid #ccc;padding:6px;text-align:right;\">Количество по входяща (бр.)</th><th style=\"border:1px solid #ccc;padding:6px;text-align:right;\">Реално</th><th style=\"border:1px solid #ccc;padding:6px;text-align:left;\">Коментар</th></tr><tr><td style=\"border:1px solid #ccc;padding:6px;\">111</td><td style=\"border:1px solid #ccc;padding:6px;\">ПЛАНКА ЪГЛОВА</td><td style=\"border:1px solid #ccc;padding:6px;\">📦 Недоставен артикул (липса)</td><td style=\"border:1px solid #ccc;padding:6px;text-align:right;\">5</td><td style=\"border:1px solid #ccc;padding:6px;text-align:right;\">2</td><td style=\"border:1px solid #ccc;padding:6px;\">Липсват 3 броя</td></tr></table><p>Поздрави,<br>Цветелина Тенева<br>ТеМАХ</p></div>";
const R_INT = rep({ direction: 'interstore', counterpart: 'Логистичен склад Търговище', document_number: '180491138' });
const L_INT = [line({ id: 'i-1', order_number: '4100204934' })];

(async function run() {

  section('а) доставчик, 2 реда с 4100204934');
  {
    const h = env(rep(), [line({ id: 'l-1', order_number: '4100204934' }), line({ id: 'l-2', order_number: '4100204934', material_name: 'ЩУЦЕР' })]);
    const r = await sendVia(h);
    ok('тема „4100204934 - РАЗЛИКИ (Шумен)"', r.mail.subject === '4100204934 - РАЗЛИКИ (Шумен)', r.mail.subject);
    ok('текстът има „поръчка №4100204934"', (r.mail.html || '').indexOf('поръчка №4100204934') >= 0);
    ok('входящата 180508904 я няма нито в темата, нито в текста',
      (r.mail.subject + r.mail.html).indexOf('180508904') < 0);
    ok('подписът има „Тел: +359 884733836"', /ТеМАХ<br>Тел: \+359 884733836<\/p>/.test(r.mail.html || ''), (r.mail.html || '').slice(-160));
    h.close();
  }

  section('б) доставчик с 43… (внос)');
  {
    const h = env(rep(), [line({ id: 'l-1', order_number: '4300001221' })]);
    const r = await sendVia(h);
    ok('тема „4300001221 - РАЗЛИКИ (Шумен)"', r.mail.subject === '4300001221 - РАЗЛИКИ (Шумен)', r.mail.subject);
    ok('текстът има „поръчка №4300001221"', (r.mail.html || '').indexOf('поръчка №4300001221') >= 0);
    ok('телефонът е там', (r.mail.html || '').indexOf('+359 884733836') >= 0);
    h.close();
  }

  section('в) без поръчка / с два различни номера → входящата, както досега');
  {
    for (const [name, L] of [
      ['без поръчка', [line({ id: 'l-1', order_number: null }), line({ id: 'l-2', order_number: '' })]],
      ['два различни', [line({ id: 'l-1', order_number: '4100204934' }), line({ id: 'l-2', order_number: '4100999999' })]],
      ['невалидна (42…)', [line({ id: 'l-1', order_number: '4200017648' })]]
    ]) {
      const h = env(rep(), L);
      const r = await sendVia(h);
      ok(name + ': тема „180508904 - РАЗЛИКИ (Шумен)"', r.mail.subject === '180508904 - РАЗЛИКИ (Шумен)', r.mail.subject);
      ok(name + ': текст „документ №180508904", без „поръчка №"',
        (r.mail.html || '').indexOf('документ №180508904') >= 0 && (r.mail.html || '').indexOf('поръчка №') < 0);
      ok(name + ': телефонът пак е там (посоката е доставчик)', (r.mail.html || '').indexOf('+359 884733836') >= 0);
      h.close();
    }
    /* един ред с поръчка, друг празен → поръчката (празните не се броят) */
    const h = env(rep(), [line({ id: 'l-1', order_number: '4100204934' }), line({ id: 'l-2', order_number: null })]);
    ok('празен ред не пречи: diffReportOrderNum = 4100204934',
      h.w.diffReportOrderNum(h.w.diffReports[0], h.w.sdData) === '4100204934');
    h.close();
  }

  section('г) междускладова — байт по байт както преди');
  {
    const h = env(R_INT, L_INT);
    const r = await sendVia(h);
    ok('темата е като преди', r.mail.subject === SNAP_SUBJ, r.mail.subject);
    ok('тялото е като преди', r.mail.html === SNAP_BODY, r.mail.html);
    ok('без телефон', (r.mail.html || '').indexOf('Тел:') < 0);
    h.close();
  }

  section('д) прегледът в модала = изпратеното тяло');
  {
    const h = env(rep(), [line({ id: 'l-1', order_number: '4100204934' })]);
    const r = await sendVia(h);
    ok('прегледът е намерен', r.preview !== null);
    /* Прегледът е парснат DOM — изпратеният низ се парсва по същия начин,
       иначе разликата е само в сериализацията (&amp;, кавички), не в текста. */
    const d = h.w.document.createElement('div');
    d.innerHTML = r.mail.html || '';
    ok('преглед = изпратено (след парсване)', r.preview === d.innerHTML);
    ok('прегледът има поръчката и телефона', /поръчка №4100204934/.test(r.preview || '') && /\+359 884733836/.test(r.preview || ''));
    ok('полето „Тема" = изпратената тема', r.subjectField === r.mail.subject, r.subjectField + ' / ' + r.mail.subject);
    h.close();
  }

  section('е) „без документ" + поръчка / без поръчка');
  {
    const h = env(rep({ no_document: true, document_number: null }), [line({ id: 'l-1', order_number: '4100204934' })]);
    const r = await sendVia(h);
    ok('текст „документ: няма (стока без документ), поръчка №4100204934"',
      (r.mail.html || '').indexOf('ТЕСИ ООД, документ: няма (стока без документ), поръчка №4100204934, дата') >= 0,
      (r.mail.html || '').slice(0, 260));
    ok('тема с поръчката', r.mail.subject === '4100204934 - РАЗЛИКИ (Шумен)', r.mail.subject);
    h.close();
    const h2 = env(rep({ no_document: true, document_number: null }), [line({ id: 'l-1', order_number: null })]);
    const r2 = await sendVia(h2);
    ok('без поръчка: „документ: няма (стока без документ), дата" — както преди',
      (r2.mail.html || '').indexOf('ТЕСИ ООД, документ: няма (стока без документ), дата') >= 0 && (r2.mail.html || '').indexOf('поръчка №') < 0);
    ok('без поръчка: тема „РАЗЛИКИ (Шумен)"', r2.mail.subject === 'РАЗЛИКИ (Шумен)', r2.mail.subject);
    h2.close();
  }

  report();
})();
