/* „Разлики": четвърто решение — „🧾 Не са фактурирани".

   Случай: в стоковата на доставчика има артикули, които нито са доставени,
   нито са фактурирани. Досега Цветелина го пишеше в коментар и нямаше какво
   да натисне.

   Новият тип е type='not_invoiced' (колоната е свободен text без check
   constraint — проверено със SQL на 13.09.2026). Две неща го отличават:
     · бутонът е САМО при посока доставчик — между складове и при сторна по
       грешен прием фактура няма;
     · редът се ПРИКЛЮЧВА с решението (status='taken', не 'pending'): няма
       стока за движение и никой не чака нищо.

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

  section('б) Клик → PATCH с not_invoiced и status taken; без връщане и без количество');
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
        ok('status е taken', p.body.status === 'taken', JSON.stringify(p.body.status));
        ok('status НЕ е pending', p.body.status !== 'pending', JSON.stringify(p.body.status));
        ok('resolved_by и resolved_at са записани',
          p.body.resolved_by === 'Цветелина Тенева' && /^\d{4}-\d{2}-\d{2}T/.test(p.body.resolved_at || ''),
          JSON.stringify([p.body.resolved_by, p.body.resolved_at]));
        ok('без quantity в payload-а', !('quantity' in p.body), Object.keys(p.body).join(','));
      }
      ok('НЯМА POST към stock_returns',
        !h.calls.post.some(x => x.table === 'stock_returns'), JSON.stringify(h.calls.post.map(x => x.table)));
      ok('няма предупредителен toast за количество',
        !h.calls.toast.some(t => String(t).indexOf('⚠️') >= 0), h.calls.toast.join(' | '));
    }
  }

  section('в) След клика редът е приключен: карта, филтър, бадж, чип');
  {
    const h = env([rep()], [line()], 'supplier');
    guard('рендер', () => h.w.renderStockDiff());
    realClick(h.w, notInvoicedBtn(h.doc));
    await ticks();
    if (guard('прилагане на PATCH-овете и пренарисуване', () => applyPatchesAndRender(h))) {
      const txt = mod(h.doc).textContent;
      /* Картата „Приключени" при „Всички типове" — думите за 'all' не се пипат. */
      ok('картата „Приключени" брои 1', /Приключени\s*1/.test(txt), txt.slice(0, 300));
      ok('картата „Чакащи" брои 0', /Чакащи\s*0/.test(txt), txt.slice(0, 300));

      const taken = chipByF(h.doc, 'taken', 'setSDFilter');
      if (ok('чипът за приключени е на екрана', !!taken)) {
        ok('чипът за приключени казва (1)', /\(1\)/.test(taken.textContent), taken.textContent);
        realClick(h.w, taken);
        ok('филтърът „приключени" показва реда', mainTableRows(h.doc).length === 1,
          'редове: ' + mainTableRows(h.doc).length);
      }
      const pending = chipByF(h.doc, 'pending', 'setSDFilter');
      if (ok('чипът за чакащи е на екрана', !!pending)) {
        realClick(h.w, pending);
        ok('филтърът „чакащи" НЕ показва реда', mainTableRows(h.doc).length === 0,
          'редове: ' + mainTableRows(h.doc).length);
      }

      realClick(h.w, chipByF(h.doc, 'all', 'setSDFilter'));
      const rowTxt = mainTableRows(h.doc).map(r => r.textContent).join(' | ');
      /* Баджовете в портала са с главни букви („📥 ЗАПРИХОДЕНА") — проверката е
         без значение на регистъра, за да мери думата, не конвенцията. */
      ok('баджът на реда е „🧾 Приключена"', /🧾\s*приключена/i.test(rowTxt), rowTxt);
      ok('етикетът на типа в таблицата е „🧾 Не са фактурирани"', rowTxt.indexOf('🧾 Не са фактурирани') >= 0, rowTxt);

      const chip = chipByF(h.doc, 'not_invoiced', 'setSDTypeFilter');
      if (ok('чипът по тип „не са фактурирани" съществува', !!chip)) {
        ok('чипът е „🧾 Не са фактурирани (1)"', chip.textContent.trim() === '🧾 Не са фактурирани (1)',
          JSON.stringify(chip.textContent.trim()));
        realClick(h.w, chip);
        const txt2 = mod(h.doc).textContent;
        ok('при филтър по типа картата казва „Приключена"', /Приключена\s*1/.test(txt2), txt2.slice(0, 300));
        ok('и „Отворена" за другата карта', /Отворена\s*0/.test(txt2), txt2.slice(0, 300));
      }
    }
  }

  section('г) Модалът за редакция показва типа избран');
  {
    const h = env([rep()], [line({ type: 'not_invoiced', status: 'taken' })], 'supplier');
    if (guard('openSDModal не хвърля', () => h.w.openSDModal('l-s'))) {
      const sel = h.doc.getElementById('sd-type');
      if (ok('<select id="sd-type"> съществува', !!sel && sel.tagName === 'SELECT')) {
        ok('има опция not_invoiced', !!sel.querySelector('option[value="not_invoiced"]'));
        ok('избрана е not_invoiced', sel.value === 'not_invoiced', JSON.stringify(sel.value));
        ok('текстът на опцията е „🧾 Не са фактурирани"',
          (sel.querySelector('option[value="not_invoiced"]') || {}).textContent === '🧾 Не са фактурирани');
      }
      const st = h.doc.getElementById('sd-status');
      ok('статусът в модала казва „Приключена"',
        !!st && /приключена/i.test((st.options[st.selectedIndex] || {}).textContent || ''),
        st ? (st.options[st.selectedIndex] || {}).textContent : 'няма select');
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

  section('е) PATCH-ът от бутона носи и кой/кога приключи реда');
  {
    const h = env([rep()], [line()], 'supplier');
    guard('рендер', () => h.w.renderStockDiff());
    realClick(h.w, notInvoicedBtn(h.doc));
    await ticks();
    const p = sdPatch(h.calls)[0];
    if (ok('има PATCH към stock_differences', !!p)) {
      ok('completed_by е записан', p.body.completed_by === 'Цветелина Тенева',
        JSON.stringify(p.body.completed_by));
      ok('completed_at е ISO timestamp', /^\d{4}-\d{2}-\d{2}T/.test(p.body.completed_at || ''),
        JSON.stringify(p.body.completed_at));
      /* Решението и приключването са едно действие — един и същ час. */
      ok('completed_at е същият час като resolved_at', p.body.completed_at === p.body.resolved_at,
        JSON.stringify([p.body.completed_at, p.body.resolved_at]));
    }
  }

  section('ж) Редакция през модала с избор „Не са фактурирани" → status taken');
  {
    /* Редът е решен като „Липса" и чака; Цвети сменя решението през модала. */
    const h = env([rep()], [line({ type: 'missing', status: 'pending',
      resolved_by: 'Цветелина Тенева', resolved_at: '2026-09-10T08:00:00.000Z' })], 'supplier');
    if (guard('openSDModal не хвърля', () => h.w.openSDModal('l-s'))) {
      h.doc.getElementById('sd-type').value = 'not_invoiced';
      realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'));
      await ticks();
      const p = sdPatch(h.calls)[0];
      if (ok('има PATCH към stock_differences', !!p, h.calls.toast.join(' | '))) {
        ok('type е not_invoiced', p.body.type === 'not_invoiced', JSON.stringify(p.body.type));
        ok('status е taken — в СЪЩИЯ PATCH', p.body.status === 'taken', JSON.stringify(p.body.status));
        ok('completed_by е записан', p.body.completed_by === 'Цветелина Тенева',
          JSON.stringify(p.body.completed_by));
        ok('completed_at е записан', /^\d{4}-\d{2}-\d{2}T/.test(p.body.completed_at || ''),
          JSON.stringify(p.body.completed_at));
      }
      ok('няма POST към stock_returns', !h.calls.post.some(x => x.table === 'stock_returns'));
    }
  }

  section('з) Редакция на вече приключен ред — не дублира; смяна на типа не връща статуса');
  {
    const DONE = { type: 'not_invoiced', status: 'taken',
      resolved_by: 'Първи човек', resolved_at: '2026-09-01T08:00:00.000Z',
      completed_by: 'Първи човек', completed_at: '2026-09-01T08:00:00.000Z' };

    /* з.1 — само коментар върху вече приключен ред: кой/кога не се презаписват. */
    const h = env([rep()], [line(DONE)], 'supplier');
    if (guard('openSDModal не хвърля', () => h.w.openSDModal('l-s'))) {
      h.doc.getElementById('sd-comment').value = 'допълнителна бележка';
      realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'));
      await ticks();
      const p = sdPatch(h.calls)[0];
      if (ok('има PATCH', !!p, h.calls.toast.join(' | '))) {
        ok('status остава taken', p.body.status === 'taken', JSON.stringify(p.body.status));
        ok('completed_by НЕ е в PATCH-а (не се презаписва)', !('completed_by' in p.body),
          Object.keys(p.body).join(','));
        ok('completed_at НЕ е в PATCH-а', !('completed_at' in p.body), Object.keys(p.body).join(','));
        ok('resolved_by не се презаписва (типът не е сменен)', !('resolved_by' in p.body),
          Object.keys(p.body).join(','));
      }
    }

    /* з.2 — смяна на типа обратно на друг: статусът НЕ се връща сам. */
    const h2 = env([rep()], [line(DONE)], 'supplier');
    if (guard('openSDModal не хвърля (смяна на тип)', () => h2.w.openSDModal('l-s'))) {
      h2.doc.getElementById('sd-type').value = 'missing';
      realClick(h2.w, btn(h2.doc.getElementById('sd-ov'), 'Запази'));
      await ticks();
      const p2 = sdPatch(h2.calls)[0];
      if (ok('има PATCH', !!p2, h2.calls.toast.join(' | '))) {
        ok('типът е сменен на missing', p2.body.type === 'missing', JSON.stringify(p2.body.type));
        ok('статусът остава taken — не се гадае обратно', p2.body.status === 'taken',
          JSON.stringify(p2.body.status));
        ok('кой/кога приключи не се трие', !('completed_by' in p2.body) || p2.body.completed_by !== null,
          JSON.stringify(p2.body.completed_by));
      }
    }
  }

  report();
})();
