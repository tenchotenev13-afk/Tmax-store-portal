/* Триене на ЦЯЛА бланка за разлики — sdDeleteReport().

   Три неща, които прегледът на кода не хваща:
     · правото е ПО-ТЯСНО от isAdmin в renderStockDiff() (там влизат и
       accounting, и logistics) — само роля 'admin';
     · двете потвърждения трябва да спират ПРЕДИ първата мрежова заявка;
     · провален DELETE на редовете НЕ бива да пуска DELETE на бланката —
       иначе остават редове-сираци, сочещи към несъществуваща бланка.

   transport.js се зарежда заедно със stock-differences.js (редът от
   index.html) — шапката ползва getStoreInfo() оттам.

   Пускане:  node tests/diff-delete-report.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const SB   = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';
const PUB  = SB + '/storage/v1/object/public/bulletin-files/';
const JPG_URL = PUB + 'differences/1785914046488_0wo4k9.jpg';
const PDF_URL = PUB + 'differences/1786112461648_m8wisg.pdf';
const PNG_URL = PUB + 'differences/1786112461999_zzz111.png';

function row(o) {
  return Object.assign({
    store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ', quantity: 1,
    quantity_received: null, order_number: null, confirmed_date: null,
    comment: null, resolution_comment: null, attachments: [],
    credit_note_issued: false, difference_category: 'undelivered', unit: 'бр.',
    status: 'pending', type: null, report_id: null,
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null
  }, o);
}

/* Бланка, която НЕ е прегледана (дава картата горе), но първият ѝ ред вече е
   решен (значи се вижда И в главната таблица). Така един и същи фикстур
   покрива и двете места на бутона. */
const REP = {
  id: 'rep-a', direction: 'supplier', store_name: 'Раднево',
  counterpart: 'ТЕСИ ООД', document_number: '180489966', doc_date: '2026-08-17',
  submitted_by: 'Склад Раднево', general_comment: '',
  created_at: '2026-08-17T08:14:18.000Z', reviewed: false,
  /* PDF_URL стои и тук, и в attachments на реда — дедупликацията се проверява */
  photos: [{ url: JPG_URL, name: 'IMG_2202.jpeg' }, { url: PDF_URL, name: 'стокова.pdf' }]
};
const LINE_RESOLVED = row({
  id: 'l-a1', report_id: 'rep-a', type: 'return', status: 'pending',
  material_code: '900001', material_name: 'ПЛАНКА ЪГЛОВА',
  attachments: [{ url: PDF_URL, type: 'file', filename: 'стокова.pdf' }]
});
const LINE_OPEN = row({
  id: 'l-a2', report_id: 'rep-a', type: null, status: 'new',
  material_code: '900002', material_name: 'БАТЕРИЯ DURACELL',
  attachments: [{ url: PNG_URL, type: 'image' }]
});
/* Ръчно добавен ред — няма бланка зад него, значи няма какво да се трие. */
const LINE_MANUAL = row({
  id: 'l-m1', report_id: null, type: 'missing', status: 'pending',
  material_code: '900003', material_name: 'РЪЧНО ДОБАВЕН'
});

const ROWS = [LINE_RESOLVED, LINE_OPEN, LINE_MANUAL];

function user(role) {
  return {
    email: role + '@temax.bg', display_name: 'Потребител ' + role,
    role: role, store_name: 'Централен офис', assigned_stores: ['Раднево']
  };
}

function env(role, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user(role),
    confirm: opts.confirm === undefined ? true : opts.confirm,
    fail: opts.fail,
    data: {
      stock_differences: ROWS, differences_reports: [REP],
      stock_returns: [], transport_orders: [], users: []
    }
  });
  h.w.sdData = JSON.parse(JSON.stringify(ROWS));
  h.w.diffReports = JSON.parse(JSON.stringify([REP]));
  h.w.transportOrders = [];
  h.w.sdFilter = 'all';
  h.w.sdTypeFilter = 'all';
  h.w.sdDirTab = 'supplier';
  return h;
}

/* Само <button> с onclick към sdDeleteReport. Нарочно НЕ 'button, span':
   баджът на статуса е <span> и би замърсил проверката "няма такъв бутон". */
const delBtns = root => root ? Array.from(root.querySelectorAll('button[onclick*="sdDeleteReport"]')) : [];
const card    = doc => doc.getElementById('diff-rep-rep-a');
const trOf    = (doc, lineId) => {
  /* Само главната таблица: там ✏️ носи data-id, докато същият бутон в
     картата на бланката горе е с data-lid. Без това уточнение селекторът
     хващаше реда ВЪТРЕ в картата и проверките мълчаливо гледаха грешен <tr>. */
  const b = doc.querySelector('button[data-id="' + lineId + '"][onclick*="openSDModal"]');
  return b ? b.closest('tr') : null;
};
const netCount = c => c.get.length + c.post.length + c.patch.length + c.del.length;

/* ══════════════════════════════════════════════════════════════════════ */
section('1. admin вижда 🗑 и в картата, и на реда');
{
  const h = env('admin');
  if (guard('renderStockDiff() не хвърля', () => h.w.renderStockDiff())) {
    const c = card(h.doc);
    if (ok('картата на бланката е рендирана', !!c)) {
      const b = delBtns(c);
      if (ok('в картата има точно един 🗑 бутон', b.length === 1, 'намерени: ' + b.length)) {
        ok('бутонът носи data-rid на бланката', b[0].dataset.rid === 'rep-a', b[0].dataset.rid);
        ok('текстът съдържа 🗑', (b[0].textContent || '').indexOf('🗑') >= 0);
      }
      ok('в картата 🖨 Печат си стои', !!btn(c, '🖨'));
    }
    const tr = trOf(h.doc, 'l-a1');
    if (ok('редът от бланката е в главната таблица', !!tr)) {
      const b = delBtns(tr);
      if (ok('на реда има точно един 🗑 бутон', b.length === 1, 'намерени: ' + b.length)) {
        ok('🗑 на реда сочи към бланката, не към реда', b[0].dataset.rid === 'rep-a', b[0].dataset.rid);
      }
      ok('старият ✕ (триене на РЕД) си стои', !!btn(tr, '✕'));
    }
  }
  h.close();
}

section('2. ред без report_id (ръчно добавен) НЕ показва 🗑');
{
  const h = env('admin');
  guard('рендер', () => h.w.renderStockDiff());
  const tr = trOf(h.doc, 'l-m1');
  if (ok('ръчният ред е в таблицата', !!tr)) {
    ok('няма 🗑 на ръчния ред', delBtns(tr).length === 0);
    ok('но ✕ за самия ред го има', !!btn(tr, '✕'));
    ok('няма и 🖨 (няма бланка за печат)', !btn(tr, '🖨'));
  }
  h.close();
}

section('3. accounting НЕ вижда 🗑, но вижда стария ✕');
{
  const h = env('accounting');
  guard('рендер', () => h.w.renderStockDiff());
  const wrap = h.doc.getElementById('mod-stock-diff');
  ok('никъде в модула няма 🗑 бутон', delBtns(wrap).length === 0,
     'намерени: ' + delBtns(wrap).length);
  const tr = trOf(h.doc, 'l-a1');
  if (ok('редът е видим за accounting', !!tr)) {
    ok('✕ за реда е наличен', !!btn(tr, '✕'));
  }
  ok('картата на бланката се вижда', !!card(h.doc));
  ok('в картата няма 🗑', delBtns(card(h.doc)).length === 0);
  ok('sdCanDeleteReport() е false за accounting', h.w.sdCanDeleteReport() === false);
  h.close();
}

section('4. logistics НЕ вижда 🗑');
{
  const h = env('logistics');
  guard('рендер', () => h.w.renderStockDiff());
  const wrap = h.doc.getElementById('mod-stock-diff');
  ok('никъде в модула няма 🗑 бутон', delBtns(wrap).length === 0,
     'намерени: ' + delBtns(wrap).length);
  ok('sdCanDeleteReport() е false за logistics', h.w.sdCanDeleteReport() === false);
  h.w.currentUser = user('admin');
  ok('sdCanDeleteReport() е true за admin', h.w.sdCanDeleteReport() === true);
  h.close();
}

section('5. отказ на confirm #1 → нула мрежови заявки');
(async () => {
  const h = env('admin', { confirm: () => false });
  guard('рендер', () => h.w.renderStockDiff());
  const before = netCount(h.calls);
  const b = delBtns(card(h.doc))[0];
  guard('кликът не хвърля', () => realClick(h.w, b));
  await ticks();
  ok('питано е точно веднъж', h.calls.confirm.length === 1, 'брой: ' + h.calls.confirm.length);
  const msg = h.calls.confirm[0] || '';
  ok('обобщението казва насрещната страна', msg.indexOf('ТЕСИ ООД') >= 0, msg);
  ok('обобщението казва документа', msg.indexOf('180489966') >= 0);
  ok('обобщението казва РЕАЛНИЯ брой редове (2)', /Редове:\s*2/.test(msg), msg);
  ok('обобщението казва РЕАЛНИЯ брой файлове (3, дедуплицирани)',
     /Файлове:\s*3/.test(msg), msg);
  ok('нула нови мрежови заявки', netCount(h.calls) === before,
     'преди ' + before + ', сега ' + netCount(h.calls));
  h.close();

  /* ══════════════════════════════════════════════════════════════════ */
  section('6. отказ на confirm #2 → нула мрежови заявки');
  {
    let n = 0;
    const h2 = env('admin', { confirm: () => { n++; return n === 1; } });
    guard('рендер', () => h2.w.renderStockDiff());
    const before2 = netCount(h2.calls);
    guard('клик', () => realClick(h2.w, delBtns(card(h2.doc))[0]));
    await ticks();
    ok('питано е два пъти', h2.calls.confirm.length === 2, 'брой: ' + h2.calls.confirm.length);
    ok('второто питане казва НЕОБРАТИМО',
       (h2.calls.confirm[1] || '').indexOf('НЕОБРАТИМО') >= 0, h2.calls.confirm[1]);
    ok('второто питане предупреждава за файловете',
       (h2.calls.confirm[1] || '').indexOf('Файловете също се изтриват') >= 0);
    ok('нула нови мрежови заявки', netCount(h2.calls) === before2,
       'преди ' + before2 + ', сега ' + netCount(h2.calls));
    h2.close();
  }

  /* ══════════════════════════════════════════════════════════════════ */
  section('7. пълен успех — файлове, после редове, после бланка');
  {
    const h3 = env('admin');
    guard('рендер', () => h3.w.renderStockDiff());
    h3.calls.del.length = 0;
    guard('клик', () => realClick(h3.w, delBtns(card(h3.doc))[0]));
    await ticks();
    const dels = h3.calls.del.slice();
    const storage = dels.filter(u => u.indexOf('/storage/v1/object/') >= 0);
    const lineDel = dels.findIndex(u => u.indexOf('stock_differences?report_id=eq.rep-a') >= 0);
    const repDel  = dels.findIndex(u => u.indexOf('differences_reports?id=eq.rep-a') >= 0);

    ok('изтрити са 3 файла (дедуплицирани, не 4)', storage.length === 3,
       storage.length + ' → ' + storage.join(' | '));
    ok('пътят е без /public/ и точно в bucket-а',
       storage.every(u => u.indexOf('/object/public/') < 0 &&
                          u.indexOf(SB + '/storage/v1/object/bulletin-files/differences/') === 0),
       storage.join(' | '));
    ok('изтрит е и файл от rep.photos', storage.some(u => u.indexOf('1785914046488_0wo4k9.jpg') >= 0));
    ok('изтрит е и файл от attachments на реда', storage.some(u => u.indexOf('1786112461999_zzz111.png') >= 0));
    ok('редовете са изтрити по report_id', lineDel >= 0, dels.join(' | '));
    ok('бланката е изтрита по id', repDel >= 0, dels.join(' | '));
    ok('редът на заявките е: файлове → редове → бланка',
       storage.length === 3 && lineDel === 3 && repDel === 4,
       'lineDel=' + lineDel + ' repDel=' + repDel);
    ok('зелен toast за успех',
       h3.calls.toast.some(t => t.indexOf('Бланката е изтрита') >= 0), h3.calls.toast.join(' | '));
    ok('няма съобщение за неизтрити файлове',
       !h3.calls.toast.some(t => t.indexOf('не бяха изтрити') >= 0));
    ok('списъкът е презареден', h3.calls.get.some(u => u.indexOf('differences_reports') >= 0));
    h3.close();
  }

  /* ══════════════════════════════════════════════════════════════════ */
  section('8. провален DELETE на редовете → бланката НЕ се пипа');
  {
    const h4 = env('admin', {
      fail: { DELETE: { status: 409, body: { message: 'нарушение на външен ключ' },
                        url: /rest\/v1\/stock_differences/ } }
    });
    guard('рендер', () => h4.w.renderStockDiff());
    h4.calls.del.length = 0;
    guard('клик', () => realClick(h4.w, delBtns(card(h4.doc))[0]));
    await ticks();
    const dels = h4.calls.del.slice();
    ok('DELETE на редовете е опитан',
       dels.some(u => u.indexOf('stock_differences?report_id=eq.rep-a') >= 0), dels.join(' | '));
    ok('DELETE на differences_reports НЕ е изпратен',
       !dels.some(u => u.indexOf('differences_reports') >= 0), dels.join(' | '));
    const t = h4.calls.toast.join(' | ');
    ok('червен toast за неизтритите редове', t.indexOf('Редовете НЕ бяха изтрити') >= 0, t);
    ok('toast-ът носи причината от PostgREST', t.indexOf('нарушение на външен ключ') >= 0, t);
    ok('няма фалшив toast за успех', t.indexOf('Бланката е изтрита') < 0, t);
    h4.close();
  }

  /* ══════════════════════════════════════════════════════════════════ */
  section('9. провален файл НЕ спира процеса, но се брои');
  {
    const h5 = env('admin', {
      fail: { DELETE: { status: 404, body: { message: 'not found' }, url: /\/storage\// } }
    });
    guard('рендер', () => h5.w.renderStockDiff());
    h5.calls.del.length = 0;
    guard('клик', () => realClick(h5.w, delBtns(card(h5.doc))[0]));
    await ticks();
    const dels = h5.calls.del.slice();
    ok('редовете пак са изтрити',
       dels.some(u => u.indexOf('stock_differences?report_id=eq.rep-a') >= 0), dels.join(' | '));
    ok('бланката пак е изтрита',
       dels.some(u => u.indexOf('differences_reports?id=eq.rep-a') >= 0), dels.join(' | '));
    const t = h5.calls.toast.join(' | ');
    ok('toast-ът съобщава колко файла са останали', t.indexOf('3 файла не бяха изтрити') >= 0, t);
    h5.close();
  }

  /* ══════════════════════════════════════════════════════════════════ */
  section('10. sdDeleteReport() не прави нищо, ако бъде извикана без право');
  {
    const h6 = env('accounting');
    guard('рендер', () => h6.w.renderStockDiff());
    const before6 = netCount(h6.calls);
    guard('директно извикване не хвърля', () => h6.w.sdDeleteReport('rep-a'));
    await ticks();
    ok('не е питано за потвърждение', h6.calls.confirm.length === 0);
    ok('нула мрежови заявки', netCount(h6.calls) === before6);
    ok('казано е защо', h6.calls.toast.some(t => t.indexOf('администратор') >= 0),
       h6.calls.toast.join(' | '));
    h6.close();
  }

  report();
})();
