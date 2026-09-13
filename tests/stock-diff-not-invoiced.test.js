/* „Разлики": четвърто решение — „🧾 Не са фактурирани".

   Случай: в стоковата на доставчика има артикули, които нито са доставени,
   нито са фактурирани. Досега Цветелина го пишеше в коментар и нямаше какво
   да натисне.

   Новият тип е type='not_invoiced' (колоната е свободен text без check
   constraint — проверено със SQL на 13.09.2026). Две неща го отличават:
     · бутонът е САМО при посока доставчик — между складове и при сторна по
       грешен прием фактура няма;
     · решението е МЕЖДИННО, не приключване: status остава 'pending', без
       completed_*. Редът чака крайно решение и в долната таблица предлага
       „📥 Заприх." и „↩️ Връщане" — същият resolveDiffLine, който сменя типа.

   Пускане:  node tests/stock-diff-not-invoiced.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, ticks, btn } = H;

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: ['Раднево']
};

function rep(o) {
  return Object.assign({
    id: 'rep-s', direction: 'supplier', store_name: 'Раднево',
    counterpart: 'ТЕСИ ООД', document_number: '180489966',
    doc_date: '2026-09-10', submitted_by: 'Склад Раднево',
    general_comment: '', photos: [], reviewed: false
  }, o);
}
function line(o) {
  return Object.assign({
    id: 'l-s', report_id: 'rep-s', store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ БЕЗ ФАКТУРА', quantity: '5',
    quantity_supplier_doc: '5', quantity_received: '0',
    order_number: null, confirmed_date: null, comment: null,
    resolution_comment: null, attachments: [], credit_note_issued: false,
    type: null, status: 'new',
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null
  }, o);
}

/* „Сървърът" — масиви, върху които тестът прилага PATCH-овете, изпратени от
   кода. Стъбът на harness-а записва заявките, но не ги прилага; без това
   loadStockDiff() след клика би върнал реда в изходното му състояние. */
function env(reports, lines, dirTab) {
  const server = { reports: JSON.parse(JSON.stringify(reports)), lines: JSON.parse(JSON.stringify(lines)) };
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI, confirm: true,
    data: {
      stock_differences: () => JSON.parse(JSON.stringify(server.lines)),
      differences_reports: () => JSON.parse(JSON.stringify(server.reports)),
      stock_returns: [], users: []
    }
  });
  h.server = server;
  h.w.sdData = JSON.parse(JSON.stringify(lines));
  h.w.diffReports = JSON.parse(JSON.stringify(reports));
  h.w.sdFilter = 'all';
  h.w.sdTypeFilter = 'all';
  h.w.sdStoreFilter = '';
  h.w.sdSearch = '';
  h.w.sdDirTab = dirTab || 'supplier';
  return h;
}

/* Прилага изпратените PATCH-ове върху „сървъра" и пренарисува от него —
   точно каквото би направило презареждането с истинска база. */
function applyPatchesAndRender(h) {
  h.calls.patch.forEach(function (p) {
    const m = p.url.match(/id=eq\.([^&]+)/);
    if (!m) return;
    const id = decodeURIComponent(m[1]);
    const coll = /stock_differences/.test(p.url) ? h.server.lines
      : /differences_reports/.test(p.url) ? h.server.reports : null;
    const row = coll && coll.find(function (x) { return String(x.id) === id; });
    if (row) Object.assign(row, p.body);
  });
  h.w.sdData = JSON.parse(JSON.stringify(h.server.lines));
  h.w.diffReports = JSON.parse(JSON.stringify(h.server.reports));
  h.w.renderStockDiff();
}

const mod = doc => doc.getElementById('mod-stock-diff');
/* Бутонът за решението — само <button>, който наистина вика resolveDiffLine
   с 'not_invoiced'. Не span, не div: там думите може да стоят като етикет. */
function notInvoicedBtn(doc) {
  return Array.prototype.find.call(mod(doc).querySelectorAll('button'),
    b => /resolveDiffLine/.test(b.getAttribute('onclick') || '') &&
         /'not_invoiced'/.test(b.getAttribute('onclick') || ''));
}
function mainTableRows(doc) {
  const t = Array.prototype.find.call(mod(doc).querySelectorAll('table'),
    x => x.querySelector('thead') && x.querySelector('thead').textContent.indexOf('Кредитно') >= 0);
  return t ? Array.prototype.slice.call(t.querySelectorAll('tbody tr')) : [];
}
function chipByF(doc, f, fn) {
  return Array.prototype.find.call(mod(doc).querySelectorAll('button[data-f="' + f + '"]'),
    b => new RegExp(fn).test(b.getAttribute('onclick') || ''));
}
const sdPatch = calls => calls.patch.filter(p => /stock_differences/.test(p.url));

(async function run() {

  section('а) Бутонът е при доставчик, НЕ при междускладов ред');
  {
    const s = env([rep()], [line()], 'supplier');
    if (guard('рендер (доставчик) не хвърля', () => s.w.renderStockDiff())) {
      const b = notInvoicedBtn(s.doc);
      if (ok('в реда има <button> „Не са фактурирани"', !!b)) {
        ok('текстът му е „🧾 Не са фактурирани"', b.textContent.trim() === '🧾 Не са фактурирани',
          JSON.stringify(b.textContent.trim()));
        ok('цветът му е #64748b', /#64748b/.test(b.getAttribute('style') || ''), b.getAttribute('style'));
      }
      ok('трите стари бутона са на място',
        ['writein', 'return', 'missing'].every(t => Array.prototype.some.call(mod(s.doc).querySelectorAll('button'),
          x => new RegExp("resolveDiffLine\\(this\\.dataset\\.id,'" + t + "'\\)").test(x.getAttribute('onclick') || ''))));
    }

    const i = env([rep({ id: 'rep-i', direction: 'interstore', counterpart: 'Троян' })],
      [line({ id: 'l-i', report_id: 'rep-i' })], 'interstore');
    if (guard('рендер (междускладов) не хвърля', () => i.w.renderStockDiff())) {
      /* Контролна проверка, че междускладовият ред изобщо е нарисуван с бутони —
         иначе „няма бутон" би минало и срещу празен екран. */
      ok('междускладовият ред има бутони за решение',
        Array.prototype.some.call(mod(i.doc).querySelectorAll('button'),
          x => /resolveDiffLine\(this\.dataset\.id,'writein'\)/.test(x.getAttribute('onclick') || '')));
      ok('НЯМА <button> „Не са фактурирани" при междускладов ред', !notInvoicedBtn(i.doc));
    }
  }

  section('б) Клик → PATCH с not_invoiced и status PENDING; без completed_*, без връщане');
  {
    const h = env([rep()], [line()], 'supplier');
    guard('рендер', () => h.w.renderStockDiff());
    const b = notInvoicedBtn(h.doc);
    if (ok('бутонът е на екрана', !!b)) {
      realClick(h.w, b);
      await ticks();
      const p = sdPatch(h.calls)[0];
      if (ok('има PATCH към stock_differences', !!p, h.calls.toast.join(' | '))) {
        ok('type е not_invoiced', p.body.type === 'not_invoiced', JSON.stringify(p.body.type));
        ok('status е pending', p.body.status === 'pending', JSON.stringify(p.body.status));
        ok('status НЕ е taken', p.body.status !== 'taken', JSON.stringify(p.body.status));
        ok('БЕЗ completed_by', !('completed_by' in p.body), Object.keys(p.body).join(','));
        ok('БЕЗ completed_at', !('completed_at' in p.body), Object.keys(p.body).join(','));
        ok('resolved_by и resolved_at са записани',
          p.body.resolved_by === 'Цветелина Тенева' && /^\d{4}-\d{2}-\d{2}T/.test(p.body.resolved_at || ''),
          JSON.stringify([p.body.resolved_by, p.body.resolved_at]));
        ok('без quantity в payload-а', !('quantity' in p.body), Object.keys(p.body).join(','));
      }
      ok('НЯМА POST към stock_returns',
        !h.calls.post.some(x => x.table === 'stock_returns'), JSON.stringify(h.calls.post.map(x => x.table)));
    }
  }

  section('в) След клика редът ЧАКА: карта, филтър, бадж „ЧАКА РЕШЕНИЕ", чип');
  {
    const h = env([rep()], [line()], 'supplier');
    guard('рендер', () => h.w.renderStockDiff());
    realClick(h.w, notInvoicedBtn(h.doc));
    await ticks();
    if (guard('прилагане на PATCH-овете и пренарисуване', () => applyPatchesAndRender(h))) {
      const txt = mod(h.doc).textContent;
      /* Картите при „Всички типове" — думите за 'all' не се пипат. */
      ok('картата „Чакащи" брои 1', /Чакащи\s*1/.test(txt), txt.slice(0, 300));
      ok('картата „Приключени" брои 0', /Приключени\s*0/.test(txt), txt.slice(0, 300));

      const pending = chipByF(h.doc, 'pending', 'setSDFilter');
      if (ok('чипът за чакащи е на екрана', !!pending)) {
        ok('чипът за чакащи казва (1)', /\(1\)/.test(pending.textContent), pending.textContent);
        realClick(h.w, pending);
        ok('филтърът „чакащи" показва реда', mainTableRows(h.doc).length === 1,
          'редове: ' + mainTableRows(h.doc).length);
      }
      const taken = chipByF(h.doc, 'taken', 'setSDFilter');
      if (ok('чипът за приключени е на екрана', !!taken)) {
        realClick(h.w, taken);
        ok('филтърът „приключени" НЕ показва реда', mainTableRows(h.doc).length === 0,
          'редове: ' + mainTableRows(h.doc).length);
      }

      realClick(h.w, chipByF(h.doc, 'all', 'setSDFilter'));
      const rowTxt = mainTableRows(h.doc).map(r => r.textContent).join(' | ');
      ok('баджът на реда е „⏳ ЧАКА РЕШЕНИЕ"', rowTxt.indexOf('⏳ ЧАКА РЕШЕНИЕ') >= 0, rowTxt);
      ok('баджът НЕ е „Приключена"', !/приключена/i.test(rowTxt), rowTxt);
      ok('етикетът на типа в таблицата е „🧾 Не са фактурирани"', rowTxt.indexOf('🧾 Не са фактурирани') >= 0, rowTxt);

      const chip = chipByF(h.doc, 'not_invoiced', 'setSDTypeFilter');
      if (ok('чипът по тип „не са фактурирани" съществува', !!chip)) {
        ok('чипът е „🧾 Не са фактурирани (1)"', chip.textContent.trim() === '🧾 Не са фактурирани (1)',
          JSON.stringify(chip.textContent.trim()));
        realClick(h.w, chip);
        const txt2 = mod(h.doc).textContent;
        ok('при филтър по типа картата казва „Чака решение 1"', /Чака решение\s*1/.test(txt2), txt2.slice(0, 300));
        ok('и „Приключена 0"', /Приключена\s*0/.test(txt2), txt2.slice(0, 300));
      }
    }
  }

  section('г) Модалът за редакция показва типа избран');
  {
    const h = env([rep()], [line({ type: 'not_invoiced', status: 'pending' })], 'supplier');
    if (guard('openSDModal не хвърля', () => h.w.openSDModal('l-s'))) {
      const sel = h.doc.getElementById('sd-type');
      if (ok('<select id="sd-type"> съществува', !!sel && sel.tagName === 'SELECT')) {
        ok('има опция not_invoiced', !!sel.querySelector('option[value="not_invoiced"]'));
        ok('избрана е not_invoiced', sel.value === 'not_invoiced', JSON.stringify(sel.value));
        ok('текстът на опцията е „🧾 Не са фактурирани"',
          (sel.querySelector('option[value="not_invoiced"]') || {}).textContent === '🧾 Не са фактурирани');
      }
      const st = h.doc.getElementById('sd-status');
      ok('статусът в модала е pending', !!st && st.value === 'pending', st ? st.value : 'няма select');
    }
  }

  section('д) Бланка с един ред → reviewed:true се PATCH-ва');
  {
    const h = env([rep()], [line()], 'supplier');
    guard('рендер', () => h.w.renderStockDiff());
    realClick(h.w, notInvoicedBtn(h.doc));
    await ticks();
    const rp = h.calls.patch.find(p => /differences_reports/.test(p.url));
    if (ok('има PATCH към differences_reports', !!rp, h.calls.patch.map(p => p.url).join(' | '))) {
      ok('по id на бланката', rp.url.indexOf('id=eq.rep-s') >= 0, rp.url);
      ok('тялото е reviewed:true', rp.body.reviewed === true, JSON.stringify(rp.body));
    }
  }

  section('е) На чакащия ред в таблицата: „📥 Заприх." и „↩️ Връщане" довършват решението');
  {
    /* Бланката вече е прегледана, редът е „не са фактурирани" и чака — тоест е
       в долната таблица. Реално получено 7 срещу 5 по документ: при „Връщане"
       автоматичното количество е 2. */
    const REV = rep({ reviewed: true });
    const WAIT = line({ type: 'not_invoiced', status: 'pending', order_number: '4100135756',
      quantity_supplier_doc: '5', quantity_received: '7',
      resolved_by: 'Цветелина Тенева', resolved_at: '2026-09-12T08:00:00.000Z' });
    const finalBtn = (doc, t) => Array.prototype.find.call(
      mainTableRows(doc).reduce((a, r) => a.concat(Array.prototype.slice.call(r.querySelectorAll('button'))), []),
      b => new RegExp("resolveDiffLine\\(this\\.dataset\\.id,'" + t + "'\\)").test(b.getAttribute('onclick') || ''));
    const markTakenBtn = doc => mainTableRows(doc).some(r =>
      Array.prototype.some.call(r.querySelectorAll('button'), b => /sdMarkTaken/.test(b.getAttribute('onclick') || '')));

    const h = env([REV], [WAIT], 'supplier');
    if (guard('рендер', () => h.w.renderStockDiff())) {
      ok('редът е в долната таблица', mainTableRows(h.doc).length === 1, 'редове: ' + mainTableRows(h.doc).length);
      const bW = finalBtn(h.doc, 'writein'), bR = finalBtn(h.doc, 'return');
      ok('има бутон „📥 Заприх."', !!bW && bW.textContent.trim() === '📥 Заприх.', bW ? bW.textContent : 'няма');
      ok('има бутон „↩️ Връщане"', !!bR && bR.textContent.trim() === '↩️ Връщане', bR ? bR.textContent : 'няма');
      ok('НЯМА бутон за приключване (sdMarkTaken) — taken е недостижимо', !markTakenBtn(h.doc));

      if (bR) {
        realClick(h.w, bR);
        await ticks();
        const p = sdPatch(h.calls)[0];
        if (ok('„Връщане": има PATCH', !!p, h.calls.toast.join(' | '))) {
          ok('„Връщане": type става return', p.body.type === 'return', JSON.stringify(p.body.type));
          ok('„Връщане": status остава pending', p.body.status === 'pending', JSON.stringify(p.body.status));
          ok('„Връщане": автоматичното количество е 2', p.body.quantity === 2, JSON.stringify(p.body.quantity));
        }
        const post = h.calls.post.filter(x => x.table === 'stock_returns');
        if (ok('„Връщане": има POST към stock_returns', post.length === 1, 'брой: ' + post.length)) {
          ok('„Връщане": POST носи order_number', post[0].body.order_number === '4100135756',
            JSON.stringify(post[0].body.order_number));
          ok('„Връщане": POST носи diff_line_id на реда', post[0].body.diff_line_id === 'l-s',
            JSON.stringify(post[0].body.diff_line_id));
          ok('„Връщане": POST носи количество 2', post[0].body.quantity === 2, JSON.stringify(post[0].body.quantity));
        }
        if (guard('„Връщане": пренарисуване след PATCH-а', () => applyPatchesAndRender(h))) {
          const rowTxt = mainTableRows(h.doc).map(r => r.textContent).join(' | ');
          ok('„Връщане": редът вече е „↩️ Връщане"', rowTxt.indexOf('↩️ Връщане') >= 0, rowTxt);
          ok('„Връщане": двата бутона изчезват', !finalBtn(h.doc, 'writein') && !finalBtn(h.doc, 'return'));
        }
      }
    }

    const h2 = env([REV], [WAIT], 'supplier');
    guard('рендер (заприх.)', () => h2.w.renderStockDiff());
    const bW2 = finalBtn(h2.doc, 'writein');
    if (ok('„Заприх.": бутонът е на екрана', !!bW2)) {
      realClick(h2.w, bW2);
      await ticks();
      const p = sdPatch(h2.calls)[0];
      if (ok('„Заприх.": има PATCH', !!p, h2.calls.toast.join(' | '))) {
        ok('„Заприх.": type става writein', p.body.type === 'writein', JSON.stringify(p.body.type));
        ok('„Заприх.": status остава pending', p.body.status === 'pending', JSON.stringify(p.body.status));
      }
      ok('„Заприх.": НЯМА POST към stock_returns', !h2.calls.post.some(x => x.table === 'stock_returns'),
        JSON.stringify(h2.calls.post.map(x => x.table)));
    }

    /* Магазинът вижда реда, но не решава — бутоните са само за който има право. */
    const STORE = { email: 'radnevo@temax.bg', display_name: 'Управител Раднево',
                    role: 'manager', store_name: 'Раднево' };
    const hs = boot({
      modules: ['stock-returns.js', 'stock-differences.js'],
      user: STORE, confirm: true,
      data: { stock_differences: [WAIT], differences_reports: [REV], stock_returns: [], users: [] }
    });
    hs.w.sdData = [JSON.parse(JSON.stringify(WAIT))];
    hs.w.diffReports = [JSON.parse(JSON.stringify(REV))];
    hs.w.sdFilter = 'all'; hs.w.sdTypeFilter = 'all'; hs.w.sdStoreFilter = ''; hs.w.sdSearch = '';
    hs.w.sdDirTab = 'supplier';
    if (guard('рендер (магазин)', () => hs.w.renderStockDiff())) {
      ok('магазин: редът се вижда', mainTableRows(hs.doc).length === 1, 'редове: ' + mainTableRows(hs.doc).length);
      ok('магазин: НЯМА бутоните за крайно решение', !finalBtn(hs.doc, 'writein') && !finalBtn(hs.doc, 'return'));
    }
  }

  section('ж) Редакция през модала оставя статуса както е — не се форсира taken');
  {
    /* ж.1 — от „Липса" към „Не са фактурирани": статусът остава pending. */
    const h = env([rep()], [line({ type: 'missing', status: 'pending',
      resolved_by: 'Цветелина Тенева', resolved_at: '2026-09-10T08:00:00.000Z' })], 'supplier');
    if (guard('openSDModal не хвърля', () => h.w.openSDModal('l-s'))) {
      h.doc.getElementById('sd-type').value = 'not_invoiced';
      realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'));
      await ticks();
      const p = sdPatch(h.calls)[0];
      if (ok('има PATCH към stock_differences', !!p, h.calls.toast.join(' | '))) {
        ok('type е not_invoiced', p.body.type === 'not_invoiced', JSON.stringify(p.body.type));
        ok('status остава pending', p.body.status === 'pending', JSON.stringify(p.body.status));
        ok('БЕЗ completed_by', !('completed_by' in p.body), Object.keys(p.body).join(','));
      }
    }

    /* ж.2 — само коментар върху чакащ ред „не са фактурирани": статусът не се мести. */
    const h2 = env([rep()], [line({ type: 'not_invoiced', status: 'pending',
      resolved_by: 'Цветелина Тенева', resolved_at: '2026-09-10T08:00:00.000Z' })], 'supplier');
    if (guard('openSDModal не хвърля (коментар)', () => h2.w.openSDModal('l-s'))) {
      h2.doc.getElementById('sd-comment').value = 'чакаме фактура';
      realClick(h2.w, btn(h2.doc.getElementById('sd-ov'), 'Запази'));
      await ticks();
      const p2 = sdPatch(h2.calls)[0];
      if (ok('има PATCH', !!p2, h2.calls.toast.join(' | '))) {
        ok('status остава pending', p2.body.status === 'pending', JSON.stringify(p2.body.status));
        ok('БЕЗ completed_*', !('completed_by' in p2.body) && !('completed_at' in p2.body),
          Object.keys(p2.body).join(','));
      }
    }
  }

  report();
})();
