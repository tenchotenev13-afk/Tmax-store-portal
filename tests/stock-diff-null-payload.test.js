/* Празни стойности в модала "Разлики" не трябва да стигат до Supabase като "—".

   Бъгът: esc() в shared.js връща '—' за всяка празна стойност (нарочно, за
   показване в таблици). Ползван в value="..." на input, той слага тирето
   в самото поле, то се изпраща в PATCH-а и PostgREST връща 400:
   invalid input syntax for type date: "—".
   Затова полетата ползват escVal(), а payload-ът минава през sdCleanPayload().

   Пускане:  node tests/stock-diff-null-payload.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

/* Ред БЕЗ дата, БЕЗ количество, БЕЗ доставчик/код/коментар — точно случаят,
   при който Цвети натиска "Заприхождаване" върху непопълнен запис. */
const EMPTY = {
  id: 'l-empty', report_id: null, store_name: 'Враца', supplier: null,
  material_code: null, material_name: 'ПРОФИЛ ПВЦ', quantity: null,
  confirmed_date: null, order_number: null, type: null, status: 'pending',
  comment: null, resolution_comment: null
};
/* Същият ред, но вече решен от Цвети -> за магазина полетата са заключени
   (само за четене + hidden input). Другият път през coreField(). */
const LOCKED = Object.assign({}, EMPTY, { id: 'l-locked', type: 'writein' });

const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin',
                store_name: 'Централен офис', assigned_stores: ['Враца'] };
const STORE = { email: 'vraca@temax.bg', display_name: 'Управител Враца',
                role: 'manager', store_name: 'Враца' };

function env(user, line) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: user,
    data: { stock_differences: [line], differences_reports: [], stock_returns: [] }
  });
  h.w.sdData = JSON.parse(JSON.stringify([line]));
  h.w.diffReports = [];
  return h;
}

/* Полетата, които PostgREST типизира като date/numeric — точно те чупят PATCH-а */
const TYPED = ['confirmed_date', 'withdrawal_date', 'quantity', 'quantity_received', 'quantity_supplier_doc'];
function assertNoDash(body) {
  const dashed = Object.keys(body).filter(k => body[k] === '—');
  ok('нито едно поле не носи "—"', dashed.length === 0, dashed.join(', '));
  const bad = TYPED.filter(k => body.hasOwnProperty(k) && body[k] !== null && String(body[k]).trim() === '');
  ok('date/number полетата са null, не празен низ', bad.length === 0, bad.join(', '));
}

(async function () {

  section('1. Цвети — редакция на непопълнен ред, тип "Заприхождаване"');
  {
    const { w, doc, calls } = env(ADMIN, EMPTY);
    if (guard('модалът се отваря', () => w.openSDModal('l-empty'))) {
      const cdate = doc.getElementById('sd-cdate');
      const qty = doc.getElementById('sd-qty');
      ok('sd-cdate е input[type=date]', !!cdate && cdate.getAttribute('type') === 'date');
      ok('празна дата -> value="" (не "—")', !!cdate && cdate.value === '',
        'value=' + JSON.stringify(cdate && cdate.value));
      ok('празно количество -> value="" (не "—")', !!qty && qty.value === '',
        'value=' + JSON.stringify(qty && qty.value));
      ok('тирето се вижда само като плейсхолдър в текста',
        doc.getElementById('sd-ov').innerHTML.indexOf('—') >= 0);

      doc.getElementById('sd-type').value = 'writein';
      doc.getElementById('sd-status').value = 'capitalized';
      realClick(w, btn(doc.getElementById('sd-ov'), 'Запази'));
      await ticks();
      const p = calls.patch[0];
      if (ok('PATCH е изпратен', !!p, calls.toast.join(' | '))) {
        ok('confirmed_date === null', p.body.confirmed_date === null,
          JSON.stringify(p.body.confirmed_date));
        ok('quantity === null', p.body.quantity === null, JSON.stringify(p.body.quantity));
        ok('type стига до базата', p.body.type === 'writein');
        assertNoDash(p.body);
      }
    }
  }

  section('2. Магазин — вече решен ред (заключени полета, hidden inputs)');
  {
    const { w, doc, calls } = env(STORE, LOCKED);
    if (guard('модалът се отваря', () => w.openSDModal('l-locked'))) {
      ok('hidden sd-cdate е празен, не "—"', doc.getElementById('sd-cdate').value === '',
        JSON.stringify(doc.getElementById('sd-cdate').value));
      ok('hidden sd-qty е празен, не "—"', doc.getElementById('sd-qty').value === '',
        JSON.stringify(doc.getElementById('sd-qty').value));
      ok('визуалното "—" остава в div.fi',
        doc.getElementById('sd-ov').innerHTML.indexOf('—</div>') >= 0);

      realClick(w, btn(doc.getElementById('sd-ov'), 'Запази'));
      await ticks();
      const p = calls.patch[0];
      if (ok('PATCH е изпратен', !!p, calls.toast.join(' | '))) {
        ok('confirmed_date === null', p.body.confirmed_date === null,
          JSON.stringify(p.body.confirmed_date));
        ok('supplier не е "—"', p.body.supplier !== '—', JSON.stringify(p.body.supplier));
        ok('material_code не е "—"', p.body.material_code !== '—', JSON.stringify(p.body.material_code));
        assertNoDash(p.body);
      }
    }
  }

  section('3. Попълнените стойности се запазват (не се нулират)');
  {
    const FULL = Object.assign({}, EMPTY, {
      id: 'l-full', supplier: 'ТЕСИ ООД', material_code: '111',
      quantity: 3, confirmed_date: '2026-08-14', comment: 'ЧАКАМЕ'
    });
    const { w, doc, calls } = env(ADMIN, FULL);
    if (guard('модалът се отваря', () => w.openSDModal('l-full'))) {
      ok('датата се зарежда в полето', doc.getElementById('sd-cdate').value === '2026-08-14',
        doc.getElementById('sd-cdate').value);
      ok('количеството се зарежда', doc.getElementById('sd-qty').value === '3',
        doc.getElementById('sd-qty').value);
      realClick(w, btn(doc.getElementById('sd-ov'), 'Запази'));
      await ticks();
      const p = calls.patch[0];
      if (ok('PATCH е изпратен', !!p, calls.toast.join(' | '))) {
        ok('confirmed_date се запазва', p.body.confirmed_date === '2026-08-14',
          JSON.stringify(p.body.confirmed_date));
        ok('quantity се запазва като число', p.body.quantity === 3,
          JSON.stringify(p.body.quantity));
        ok('supplier се запазва', p.body.supplier === 'ТЕСИ ООД');
      }
    }
  }

  section('4. Граничен случай: количество 0 не става null');
  {
    const ZERO = Object.assign({}, EMPTY, { id: 'l-zero', quantity: 0 });
    const { w, doc, calls } = env(ADMIN, ZERO);
    if (guard('модалът се отваря', () => w.openSDModal('l-zero'))) {
      ok('нулата се вижда в полето', doc.getElementById('sd-qty').value === '0',
        JSON.stringify(doc.getElementById('sd-qty').value));
      realClick(w, btn(doc.getElementById('sd-ov'), 'Запази'));
      await ticks();
      const p = calls.patch[0];
      if (ok('PATCH е изпратен', !!p, calls.toast.join(' | '))) {
        ok('quantity === 0 (а не null)', p.body.quantity === 0, JSON.stringify(p.body.quantity));
      }
    }
  }

  section('5. Нов запис (POST), а не редакция');
  {
    const { w, doc, calls } = env(STORE, EMPTY);
    if (guard('модалът се отваря празен', () => w.openSDModal(null))) {
      doc.getElementById('sd-name').value = 'НОВ АРТИКУЛ';
      realClick(w, btn(doc.getElementById('sd-ov'), 'Добави'));
      await ticks();
      const p = calls.post[0];
      if (ok('POST е изпратен', !!p, calls.toast.join(' | '))) {
        ok('confirmed_date === null', p.body.confirmed_date === null,
          JSON.stringify(p.body.confirmed_date));
        ok('quantity === null', p.body.quantity === null, JSON.stringify(p.body.quantity));
        assertNoDash(p.body);
      }
    }
  }

  section('6. Корекция на ред от бланка (submitSDCorrection)');
  {
    const { w, doc, calls } = env(STORE, EMPTY);
    if (guard('модалът за корекция се отваря', () => w.openSDCorrectModal('l-empty'))) {
      ok('sdc-sap е празен, не "—"', doc.getElementById('sdc-sap').value === '',
        JSON.stringify(doc.getElementById('sdc-sap').value));
      ok('sdc-qty е празен, не "—"', doc.getElementById('sdc-qty').value === '',
        JSON.stringify(doc.getElementById('sdc-qty').value));
      realClick(w, btn(doc.getElementById('sdc-ov'), 'Запази корекцията'));
      await ticks();
      const p = calls.patch[0];
      if (ok('PATCH е изпратен', !!p, calls.toast.join(' | '))) {
        ok('quantity === null', p.body.quantity === null, JSON.stringify(p.body.quantity));
        ok('quantity_received === null', p.body.quantity_received === null,
          JSON.stringify(p.body.quantity_received));
        assertNoDash(p.body);
      }
    }
  }

  section('7. sdCleanPayload() пряко — вкл. полетата от другите потоци');
  {
    const { w } = env(ADMIN, EMPTY);
    const out = w.sdCleanPayload({
      confirmed_date: '—', withdrawal_date: '', quantity: '—',
      quantity_received: '  ', quantity_supplier_doc: '4.5',
      comment: '—'
    });
    ok('confirmed_date "—" -> null', out.confirmed_date === null);
    ok('withdrawal_date "" -> null', out.withdrawal_date === null);
    ok('quantity "—" -> null', out.quantity === null);
    ok('quantity_received "  " -> null', out.quantity_received === null);
    ok('quantity_supplier_doc "4.5" -> 4.5 (число)', out.quantity_supplier_doc === 4.5,
      JSON.stringify(out.quantity_supplier_doc));
    ok('текстовите полета не се пипат', out.comment === '—');
    ok('липсващ ключ не се добавя', !out.hasOwnProperty('some_other_date'));
  }

  report();
})();
