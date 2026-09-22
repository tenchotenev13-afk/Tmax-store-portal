/* Смяна на решение от "Връщане" синхронизира "За връщане".

   autoCreateReturnFromDiff създава stock_returns (source='diff', diff_line_id)
   при "Връщане", но смяна към Заприхождаване/Липса го оставяше да виси:
   магазинът виждаше "Взета" с товарителница за стока, която е заприходил.

   Сега (stock-differences.js):
     - невзето връщане (pending) → DELETE, СЛЕД успешния PATCH на решението;
     - взето/приключено → отказ ПРЕДИ PATCH-а, 0 записа;
     - DELETE пада → решението остава сменено, червен toast (последен), ⚠ на реда.
   И двата пътя: бутоните на реда (resolveDiffLine) и модалът (submitSD).

   В stock-returns.js: ред, чиято разлика вече НЕ е 'return', показва
   "⚠ решението е сменено" вместо "✅ Взета".

   Пускане:  node tests/sd-return-sync.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, btnExact, ticks } = H;

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: ['Раднево']
};
const clone = x => JSON.parse(JSON.stringify(x));

const REP = {
  id: 'rep-s', direction: 'supplier', store_name: 'Раднево', counterpart: 'ТЕСИ ООД',
  document_number: '180489966', doc_date: '2026-09-15', submitted_by: 'Склад Раднево',
  general_comment: '', photos: [], reviewed: false, created_at: '2026-09-15T09:00:00.000Z'
};
function line(o) {
  return Object.assign({
    id: 'l-1', report_id: 'rep-s', store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '47164', material_name: 'ЛАЙСНА АЛ. ВЪНШ.ЪГЪЛ 10ММ',
    quantity: 2, quantity_received: 4, order_number: null, confirmed_date: null,
    comment: null, resolution_comment: null, attachments: [], credit_note_issued: false,
    difference_category: 'excess', unit: 'бр.', type: 'return', status: 'pending',
    resolved_by: 'Цветелина Тенева', resolved_at: '2026-09-16T08:00:00.000Z',
    completed_by: null, completed_at: null
  }, o);
}
function ret(o) {
  return Object.assign({
    id: 'sr-1', store_name: 'Раднево', supplier: 'ТЕСИ ООД', product_name: 'ЛАЙСНА АЛ. ВЪНШ.ЪГЪЛ 10ММ',
    sap_code: '47164', quantity: 2, purchase_order: '', id_euro: '', plant: '', doc_date: '2026-09-16',
    status: 'pending', withdrawal_date: null, courier_info: '', control_comment: '',
    controller_comment: '', reason: 'Излишък от разлика', source: 'diff', diff_line_id: 'l-1', photos: []
  }, o);
}

/* opts: lines, returns, reports, fail, diffTypes (за stock-returns). */
function env(opts) {
  opts = opts || {};
  const lines = opts.lines || [line()];
  const reports = opts.reports || [REP];
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI, confirm: true, fail: opts.fail,
    data: {
      stock_differences: opts.diffTypes || lines, differences_reports: reports,
      stock_returns: opts.returns || [], stock_diff_swaps: [], users: []
    }
  });
  h.w.sdData = clone(lines);
  h.w.diffReports = clone(reports);
  h.w.sdFilter = opts.filter || 'all'; h.w.sdTypeFilter = 'all';
  h.w.sdDirTab = 'supplier'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  /* Редът на заявките - за "DELETE СЛЕД PATCH" и "0 записа при отказ". */
  h.seq = [];
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    h.seq.push(((init && init.method) || 'GET').toUpperCase() + ' ' + url);
    return orig(url, init);
  };
  return h;
}

const writes = h => h.seq.filter(s => !/^GET/.test(s));
const toasts = h => h.calls.toast.map(t => String(t.msg || t));
const lastToast = h => toasts(h)[toasts(h).length - 1];
const settle = async () => { await ticks(); await ticks(); await ticks(); await ticks(); };
const BLOCKED = 'Връщането вече е изпълнено — решението не може да се смени';
const idx = (h, re) => h.seq.findIndex(s => re.test(s));

/* Клик по "📥 Заприх." на реда в картата на бланката (разгънато решение). */
async function resolveToWritein(h) {
  h.w.sdExpandedResolve = { 'l-1': true };
  h.w.renderStockDiff();
  const card = h.doc.getElementById('diff-rep-rep-s');
  const b = card && btn(card, '📥 Заприх.');
  if (!b) return false;
  realClick(h.w, b);
  await settle();
  return true;
}
/* Модалът: ✏️ на реда в главната таблица → тип → Запази. */
async function modalToType(h, type) {
  h.w.renderStockDiff();
  const edit = btn(h.doc, '✏️');
  if (!edit) return false;
  realClick(h.w, edit);
  await ticks();
  const sel = h.doc.getElementById('sd-type');
  if (!sel) return false;
  sel.value = type;
  realClick(h.w, btnExact(h.doc, 'Запази'));
  await settle();
  return true;
}

(async function () {

  section('1. Бутон на реда: Връщане → Заприх. при НЕВЗЕТО връщане → DELETE след PATCH');
  {
    const h = env({ returns: [ret()] });
    if (ok('бутонът "📥 Заприх." е на екрана и е кликнат', await resolveToWritein(h))) {
      const iPatch = idx(h, /^PATCH .*stock_differences\?id=eq\.l-1/);
      const iDel = idx(h, /^DELETE .*stock_returns/);
      ok('PATCH на решението (type=writein)', iPatch >= 0 && h.calls.patch.some(p => /stock_differences/.test(p.url) && p.body.type === 'writein'),
        JSON.stringify(writes(h)));
      ok('DELETE на връщането', iDel >= 0, JSON.stringify(writes(h)));
      ok('DELETE е СЛЕД PATCH-а', iPatch >= 0 && iDel > iPatch, JSON.stringify(writes(h)));
      const del = h.seq[iDel] || '';
      ok('DELETE: точното id и само невзети (status=not.in.(taken,completed))',
        /id=in\.\(sr-1\)/.test(del) && /source=eq\.diff/.test(del) && /status=not\.in\.\(taken,completed\)/.test(del), del);
      ok('без червен toast', !toasts(h).some(t => /НЕ е изтрит|не може да се смени/.test(t)), JSON.stringify(toasts(h)));
    }
  }

  section('2. Бутон на реда: ВЗЕТО / ПРИКЛЮЧЕНО връщане → отказ, 0 записа');
  for (const st of ['taken', 'completed']) {
    const h = env({ returns: [ret({ status: st })] });
    if (ok(st + ': бутонът е кликнат', await resolveToWritein(h))) {
      ok(st + ': toast "' + BLOCKED + '"', toasts(h).indexOf(BLOCKED) >= 0, JSON.stringify(toasts(h)));
      ok(st + ': 0 PATCH, 0 DELETE, 0 POST', writes(h).length === 0, JSON.stringify(writes(h)));
      ok(st + ': локалният тип остава return', h.w.sdData[0].type === 'return', h.w.sdData[0].type);
    }
  }

  section('3. Бутон на реда: DELETE пада → типът остава сменен, червен toast, ⚠');
  {
    const h = env({ returns: [ret()], fail: { DELETE: /stock_returns/ } });
    if (ok('бутонът е кликнат', await resolveToWritein(h))) {
      ok('PATCH-ът на решението е минал', h.calls.patch.some(p => /stock_differences/.test(p.url) && p.body.type === 'writein'));
      ok('последният toast е червеното за "За връщане"', /НЕ е изтрит/.test(lastToast(h) || ''), JSON.stringify(toasts(h)));
      ok('маркер ⚠ на реда', !!h.doc.querySelector('[data-return-sync-fail]'),
        h.doc.getElementById('mod-stock-diff').textContent.slice(0, 200));
    }
  }

  section('4. ГРАНИЧЕН: ред, който вече НЕ е бил "Връщане", със заварено взето връщане');
  {
    /* Не бива да блокира всяка следваща редакция; взетото не се трие. */
    const h = env({ lines: [line({ type: 'missing' })], returns: [ret({ status: 'taken' })] });
    if (ok('бутонът е кликнат', await resolveToWritein(h))) {
      ok('НЕ е отказано', toasts(h).indexOf(BLOCKED) < 0, JSON.stringify(toasts(h)));
      ok('PATCH-ът минава', h.calls.patch.some(p => /stock_differences/.test(p.url) && p.body.type === 'writein'));
      ok('взетото връщане НЕ се трие (0 DELETE)', !h.seq.some(s => /^DELETE/.test(s)), JSON.stringify(writes(h)));
    }
  }

  section('5. Модал (submitSD): същите случаи');
  {
    const h = env({ lines: [line({ report_id: null })], reports: [], returns: [ret()] });
    if (ok('pending: модалът е записан', await modalToType(h, 'writein'))) {
      const iPatch = idx(h, /^PATCH .*stock_differences\?id=eq\.l-1/);
      const iDel = idx(h, /^DELETE .*stock_returns.*id=in\.\(sr-1\)/);
      ok('pending: PATCH, после DELETE', iPatch >= 0 && iDel > iPatch, JSON.stringify(writes(h)));
    }
  }
  for (const st of ['taken', 'completed']) {
    const h = env({ lines: [line({ report_id: null })], reports: [], returns: [ret({ status: st })] });
    if (ok(st + ': модалът е натиснат', await modalToType(h, 'missing'))) {
      ok(st + ': toast за отказ', toasts(h).indexOf(BLOCKED) >= 0, JSON.stringify(toasts(h)));
      ok(st + ': 0 записа', writes(h).length === 0, JSON.stringify(writes(h)));
      const ov = h.doc.getElementById('sd-ov');
      ok(st + ': модалът остава отворен', !!ov && ov.classList.contains('open'));
    }
  }
  {
    const h = env({ lines: [line({ report_id: null })], reports: [], returns: [ret()], fail: { DELETE: /stock_returns/ } });
    if (ok('DELETE пада: модалът е записан', await modalToType(h, 'writein'))) {
      ok('DELETE пада: решението е записано', h.calls.patch.some(p => /stock_differences/.test(p.url) && p.body.type === 'writein'));
      ok('DELETE пада: червеното е ПОСЛЕДНИЯТ toast', /НЕ е изтрит/.test(lastToast(h) || ''), JSON.stringify(toasts(h)));
      ok('DELETE пада: ⚠ на реда', !!h.doc.querySelector('[data-return-sync-fail]'));
    }
  }
  {
    /* Връщане → Връщане (редакция на коментар): нищо не се трие. */
    const h = env({ lines: [line({ report_id: null })], reports: [], returns: [ret()] });
    if (ok('return → return: модалът е записан', await modalToType(h, 'return'))) {
      ok('return → return: 0 DELETE', !h.seq.some(s => /^DELETE/.test(s)), JSON.stringify(writes(h)));
    }
  }

  section('6. "За връщане": етикет при сменено решение');
  {
    const returns = [
      ret({ id: 'sr-1', diff_line_id: 'l-1', product_name: 'СМЕНЕНО РЕШЕНИЕ' }),
      ret({ id: 'sr-2', diff_line_id: 'l-2', product_name: 'ОЩЕ ВРЪЩАНЕ' }),
      ret({ id: 'sr-3', diff_line_id: 'l-3', product_name: 'ИЗТРИТА РАЗЛИКА' }),
      ret({ id: 'sr-4', diff_line_id: null, product_name: 'БЕЗ ВРЪЗКА' })
    ];
    /* l-3 липсва в отговора - изтрит ред (или провалена заявка): флаг НЕ се слага. */
    const h = env({ returns: returns, diffTypes: [{ id: 'l-1', type: 'writein' }, { id: 'l-2', type: 'return' }] });
    h.w.srTab = 'diff'; h.w.srFilter = 'all';
    h.seq.length = 0;
    guard('loadStockReturns() не хвърля', () => h.w.loadStockReturns());
    await settle();
    const g = h.seq.filter(s => /^GET .*stock_differences/.test(s));
    if (ok('една заявка за типовете, само по свързаните редове', g.length === 1, JSON.stringify(g))) {
      const u = decodeURIComponent(g[0]);
      ok('select=id,type&id=in.(l-1,l-2,l-3)', /select=id,type/.test(u) && /id=in\.\(l-1,l-2,l-3\)/.test(u), u);
    }
    const row = name => Array.prototype.find.call(h.doc.querySelectorAll('#mod-stock-returns tr'), tr => tr.textContent.indexOf(name) >= 0);
    const r1 = row('СМЕНЕНО РЕШЕНИЕ');
    if (ok('редът със сменено решение е на екрана', !!r1)) {
      ok('сменено: "⚠ решението е сменено"', !!r1.querySelector('[data-decision-changed]') && r1.textContent.indexOf('⚠ решението е сменено') >= 0);
      ok('сменено: БЕЗ бутон "Взета"', !btn(r1, 'Взета'));
    }
    ok('още "Връщане": бутон "Взета" има', !!row('ОЩЕ ВРЪЩАНЕ') && !!btn(row('ОЩЕ ВРЪЩАНЕ'), 'Взета'));
    ok('изтрита разлика: без флаг, "Взета" има', !!row('ИЗТРИТА РАЗЛИКА') && !row('ИЗТРИТА РАЗЛИКА').querySelector('[data-decision-changed]') && !!btn(row('ИЗТРИТА РАЗЛИКА'), 'Взета'));
    ok('без diff_line_id: "Взета" има', !!row('БЕЗ ВРЪЗКА') && !!btn(row('БЕЗ ВРЪЗКА'), 'Взета'));
  }
  {
    /* Нито един ред с diff_line_id → нула заявки към stock_differences. */
    const h = env({ returns: [ret({ diff_line_id: null })] });
    h.seq.length = 0;
    h.w.loadStockReturns();
    await settle();
    ok('без свързани редове → 0 заявки за типовете', !h.seq.some(s => /stock_differences/.test(s)), JSON.stringify(h.seq));
  }

  report();
})();
