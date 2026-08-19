/* Разлики → За връщане: автоматично създаване на връщане + задължително доказателство.

   Три отделни дупки, покрити тук:

   1) submitSD() записваше type='return', но НЕ създаваше запис в stock_returns
      (само resolveDiffLine() го правеше). Резултат към 19.08.2026: 4 реда с
      type='return' срещу 3 връщания — осиротял ЛАЙСНА АЛ. ВЪНШ.ЪГЪЛ 10ММ,
      SAP 47164, Раднево, 05.08.2026. Стока, маркирана за връщане, така никога
      не стигаше до списъка на куриера.

   2) submitSR() пропускаше запис към "Взета" с 0 снимки, празна дата и куриер
      '—'. Доставчикът оспорва, че е получил стоката, и сумата по разликата не
      се възстановява. Проверката е вързана към ИЗЛИЗАНЕ ОТ "Невзета", не към
      конкретния статус — "Приключена" се задава директно и може да прескочи
      "Взета".

   3) Върнат артикул без товарителница изглеждаше напълно нормален в списъка.

   Пускане:  node tests/return-proof.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: ['Раднево']
};

function diffRow(o) {
  return Object.assign({
    id: 'd-1', report_id: null, store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '47164', material_name: 'ЛАЙСНА АЛ. ВЪНШ.ЪГЪЛ 10ММ', quantity: 2,
    order_number: null, confirmed_date: null, comment: null, type: null,
    status: 'pending', resolution_comment: null, attachments: [],
    credit_note_issued: false, difference_category: 'excess', unit: 'бр.'
  }, o);
}

function retRow(o) {
  return Object.assign({
    id: 'r-1', store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    product_name: 'ЛАЙСНА', sap_code: '47164', quantity: 2,
    purchase_order: '', id_euro: '', plant: '5521', doc_date: '2026-08-05',
    status: 'pending', withdrawal_date: null, courier_info: '',
    control_comment: '', controller_comment: '', reason: '',
    source: 'diff', diff_line_id: null, photos: []
  }, o);
}

/* Харнесът връща празно тяло {} за POST. sbPostReturn обаче иска реалния ред
   с id-то, раздадено от базата — иначе не може да се провери, че връщането се
   закача за правилния diff_line_id. Затова обвиваме fetch: заявката се записва
   както обикновено, но отговорът носи и подадените полета плюс генерирано id. */
function withPostIds(h, prefix) {
  const orig = h.w.fetch;
  let n = 0;
  h.w.fetch = function (url, init) {
    const p = orig(url, init);
    const method = ((init || {}).method || 'GET').toUpperCase();
    if (method !== 'POST') return p;
    let body = null;
    try { body = JSON.parse((init || {}).body); } catch (e) { body = null; }
    return p.then(function (res) {
      if (!res.ok) return res;
      const row = Object.assign({ id: prefix + (++n) }, Array.isArray(body) ? body[0] : body);
      return {
        ok: true, status: 201,
        json: () => Promise.resolve([row]),
        text: () => Promise.resolve(JSON.stringify([row]))
      };
    });
  };
}

function env(opts) {
  opts = opts || {};
  const diffs = opts.diffs || [];
  const returns = opts.returns || [];
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: opts.user || CVETI,
    confirm: true,
    data: { stock_differences: diffs, differences_reports: [], stock_returns: returns, users: [] }
  });
  h.w.sdData = JSON.parse(JSON.stringify(diffs));
  h.w.diffReports = [];
  h.w.sdFilter = 'all';
  h.w.sdTypeFilter = 'all';
  h.w.sdDirTab = 'supplier';
  h.w.srData = JSON.parse(JSON.stringify(returns));
  h.w.srFilter = 'all';
  h.w.srTab = opts.srTab || 'diff';
  h.w.srPendingPhotos = [];
  withPostIds(h, opts.idPrefix || 'new-');
  return h;
}

/* Записите в stock_returns, създадени по време на теста. */
function returnPosts(calls) {
  return calls.post.filter(p => /stock_returns/.test(p.url));
}
function srPatches(calls) {
  return calls.patch.filter(p => /stock_returns/.test(p.url));
}

/* Попълва полетата на модала за разлики и натиска бутона за запис. */
function fillAndSubmitSD(h, fields) {
  const doc = h.doc;
  Object.keys(fields).forEach(function (id) {
    const el = doc.getElementById(id);
    if (!el) throw new Error('липсва поле #' + id);
    el.value = fields[id];
  });
  const ov = doc.getElementById('sd-ov');
  const save = btn(ov, 'Запази') || btn(ov, 'Добави');
  if (!save) throw new Error('няма бутон за запис в модала за разлики');
  realClick(h.w, save, 'запис на разлика');
}

function fillAndSubmitSR(h, fields) {
  const doc = h.doc;
  Object.keys(fields).forEach(function (id) {
    const el = doc.getElementById(id);
    if (!el) throw new Error('липсва поле #' + id);
    el.value = fields[id];
  });
  const ov = doc.getElementById('sr-ov');
  const save = btn(ov, 'Запази') || btn(ov, 'Добави');
  if (!save) throw new Error('няма бутон за запис в модала за връщания');
  realClick(h.w, save, 'запис на връщане');
}

(async function () {

  /* ═══════════════════════════════════════════════════════════════════════
     ЧАСТ 1 — модалът за разлики поражда връщане
     ═══════════════════════════════════════════════════════════════════════ */
  section('1. Нов ред с "Връщане" през модала създава запис в "За връщане"');
  {
    const h = env({ idPrefix: 'diff-' });
    h.w.openSDModal(null);
    await ticks(3);
    fillAndSubmitSD(h, {
      'sd-store': 'Раднево', 'sd-name': 'ЛАЙСНА АЛ. ВЪНШ.ЪГЪЛ 10ММ',
      'sd-supplier': 'ТЕСИ ООД', 'sd-mat': '47164', 'sd-qty': '2',
      'sd-type': 'return', 'sd-status': 'pending'
    });
    await ticks(6);

    const posts = returnPosts(h.calls);
    if (ok('създаден е точно 1 запис в stock_returns', posts.length === 1,
           'брой: ' + posts.length)) {
      const b = posts[0].body;
      ok('diff_line_id сочи реалното id от sbPostReturn', b.diff_line_id === 'diff-1',
         'diff_line_id=' + b.diff_line_id);
      ok('source е "diff"', b.source === 'diff', 'source=' + b.source);
      ok('status е "pending"', b.status === 'pending', 'status=' + b.status);
      ok('пренесени са продукт/SAP/количество',
         b.product_name === 'ЛАЙСНА АЛ. ВЪНШ.ЪГЪЛ 10ММ' && b.sap_code === '47164' && b.quantity === 2,
         JSON.stringify({ p: b.product_name, s: b.sap_code, q: b.quantity }));
      ok('пренесени са магазин и доставчик',
         b.store_name === 'Раднево' && b.supplier === 'ТЕСИ ООД',
         JSON.stringify({ st: b.store_name, su: b.supplier }));
    }
    ok('заявката за самата разлика е минала през sbPostReturn (Prefer)',
       h.calls.post.some(p => /stock_differences/.test(p.url)));
    ok('модалът е затворен след записа',
       !h.doc.getElementById('sd-ov') || !h.doc.getElementById('sd-ov').classList.contains('open'));
    h.close();
  }

  section('2. Нов ред с "Липса" НЕ създава запис в "За връщане"');
  {
    const h = env({ idPrefix: 'diff-' });
    h.w.openSDModal(null);
    await ticks(3);
    fillAndSubmitSD(h, {
      'sd-store': 'Раднево', 'sd-name': 'АРТИКУЛ', 'sd-mat': '111',
      'sd-qty': '1', 'sd-type': 'missing', 'sd-status': 'pending'
    });
    await ticks(6);
    ok('няма запис в stock_returns', returnPosts(h.calls).length === 0,
       'брой: ' + returnPosts(h.calls).length);
    ok('разликата все пак е записана',
       h.calls.post.some(p => /stock_differences/.test(p.url)));
    h.close();
  }

  section('3. Редакция на ред, който ВЕЧЕ има връщане — без дубликат');
  {
    const existing = retRow({ id: 'r-1', diff_line_id: 'd-1' });
    const h = env({
      diffs: [diffRow({ id: 'd-1', type: 'return' })],
      returns: [existing]
    });
    h.w.openSDModal('d-1');
    await ticks(3);
    fillAndSubmitSD(h, { 'sd-type': 'return', 'sd-comment': 'нов коментар' });
    await ticks(6);
    ok('НЕ е създаден втори запис', returnPosts(h.calls).length === 0,
       'брой: ' + returnPosts(h.calls).length);
    ok('проверката е минала по diff_line_id',
       h.calls.get.some(u => /stock_returns.*diff_line_id=eq\.d-1/.test(u)));
    h.close();
  }

  section('4. Редакция на ОСИРОТЯЛ ред (type=return, без връщане) — самолекува се');
  {
    /* Точният сценарий на ЛАЙСНА 47164: типът вече е 'return', връщане няма. */
    const h = env({ diffs: [diffRow({ id: 'd-1', type: 'return' })], returns: [] });
    h.w.openSDModal('d-1');
    await ticks(3);
    fillAndSubmitSD(h, { 'sd-type': 'return' });
    await ticks(6);
    const posts = returnPosts(h.calls);
    if (ok('създадено е липсващото връщане', posts.length === 1, 'брой: ' + posts.length)) {
      ok('връзката е към същия ред', posts[0].body.diff_line_id === 'd-1',
         'diff_line_id=' + posts[0].body.diff_line_id);
    }
    h.close();
  }

  section('5. Редакция САМО на коментар при type=return — без дубликат');
  {
    const h = env({
      diffs: [diffRow({ id: 'd-1', type: 'return' })],
      returns: [retRow({ id: 'r-1', diff_line_id: 'd-1' })]
    });
    h.w.openSDModal('d-1');
    await ticks(3);
    fillAndSubmitSD(h, { 'sd-comment': 'само коментар, типът не е пипан' });
    await ticks(6);
    ok('няма нов запис в stock_returns', returnPosts(h.calls).length === 0,
       'брой: ' + returnPosts(h.calls).length);
    const patched = h.calls.patch.filter(p => /stock_differences/.test(p.url));
    ok('коментарът все пак е записан',
       patched.length === 1 && patched[0].body.comment === 'само коментар, типът не е пипан');
    h.close();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ЧАСТ 2 — доказателство при излизане от "Невзета"
     ═══════════════════════════════════════════════════════════════════════ */

  /* Отваря съществуващо връщане за редакция и връща харнеса. */
  async function openReturn(opts) {
    const h = env(opts);
    h.w.openSRModal(opts.returns[0].id);
    await ticks(3);
    return h;
  }

  section('6. pending → taken с 0 снимки — блокира се');
  {
    const h = await openReturn({ returns: [retRow({ status: 'pending' })] });
    h.w.srPendingPhotos = [];
    fillAndSubmitSR(h, {
      'sr-status': 'taken', 'sr-wdate': '2026-08-19', 'sr-courier': 'Еконт 5300123456'
    });
    await ticks(4);
    ok('sbPatch НЕ е викан', srPatches(h.calls).length === 0,
       'брой: ' + srPatches(h.calls).length);
    ok('съобщението казва точно какво липсва',
       h.calls.toast.some(t => /Липсва товарителница/.test(t) && /снимка/.test(t)),
       JSON.stringify(h.calls.toast));
    ok('не се оплаква от дата и куриер, които са попълнени',
       !h.calls.toast.some(t => /дата на изтегляне|изтеглена от/.test(t)),
       JSON.stringify(h.calls.toast));
    h.close();
  }

  section('7. pending → taken със снимка, но празна дата — блокира се');
  {
    const h = await openReturn({ returns: [retRow({ status: 'pending' })] });
    h.w.srPendingPhotos = [{ url: 'https://x/1.jpg', name: '1.jpg' }];
    fillAndSubmitSR(h, {
      'sr-status': 'taken', 'sr-wdate': '', 'sr-courier': 'Еконт 5300123456'
    });
    await ticks(4);
    ok('sbPatch НЕ е викан', srPatches(h.calls).length === 0);
    ok('съобщението сочи датата', h.calls.toast.some(t => /дата на изтегляне/.test(t)),
       JSON.stringify(h.calls.toast));
    h.close();
  }

  section('8. pending → taken със снимка и дата, но куриер "—" — блокира се');
  {
    const h = await openReturn({ returns: [retRow({ status: 'pending' })] });
    h.w.srPendingPhotos = [{ url: 'https://x/1.jpg', name: '1.jpg' }];
    fillAndSubmitSR(h, {
      'sr-status': 'taken', 'sr-wdate': '2026-08-19', 'sr-courier': '—'
    });
    await ticks(4);
    ok('sbPatch НЕ е викан', srPatches(h.calls).length === 0);
    ok('съобщението сочи куриера', h.calls.toast.some(t => /изтеглена от/.test(t)),
       JSON.stringify(h.calls.toast));
    h.close();
  }

  section('8б. Куриер само от тирета и интервали — също се блокира');
  {
    const h = await openReturn({ returns: [retRow({ status: 'pending' })] });
    h.w.srPendingPhotos = [{ url: 'https://x/1.jpg', name: '1.jpg' }];
    fillAndSubmitSR(h, {
      'sr-status': 'taken', 'sr-wdate': '2026-08-19', 'sr-courier': ' — - — '
    });
    await ticks(4);
    ok('sbPatch НЕ е викан', srPatches(h.calls).length === 0);
    h.close();
  }

  section('8в. Граница: куриер под 3 символа пада, точно 3 минава');
  {
    /* Минимумът е 3 символа. "АБ" е 2 - твърде малко, за да е номер на
       товарителница или име на куриер, и не бива да минава само защото
       полето не е празно. Проверява се и точно на границата, не само
       типичният случай. */
    const h = await openReturn({ returns: [retRow({ status: 'pending' })] });
    h.w.srPendingPhotos = [{ url: 'https://x/1.jpg', name: '1.jpg' }];

    fillAndSubmitSR(h, {
      'sr-status': 'taken', 'sr-wdate': '2026-08-19', 'sr-courier': 'АБ'
    });
    await ticks(4);
    ok('2 символа ("АБ") се блокират', srPatches(h.calls).length === 0,
       'брой: ' + srPatches(h.calls).length);
    ok('съобщението сочи куриера', h.calls.toast.some(t => /изтеглена от/.test(t)),
       JSON.stringify(h.calls.toast));

    fillAndSubmitSR(h, {
      'sr-status': 'taken', 'sr-wdate': '2026-08-19', 'sr-courier': '  АБ  '
    });
    await ticks(4);
    ok('2 символа с интервали наоколо също се блокират (trim преди броенето)',
       srPatches(h.calls).length === 0, 'брой: ' + srPatches(h.calls).length);

    fillAndSubmitSR(h, {
      'sr-status': 'taken', 'sr-wdate': '2026-08-19', 'sr-courier': 'ЕКО'
    });
    await ticks(4);
    const p = srPatches(h.calls);
    if (ok('точно 3 символа ("ЕКО") минават', p.length === 1, 'брой: ' + p.length)) {
      ok('куриерът е записан', p[0].body.courier_info === 'ЕКО',
         'courier_info=' + p[0].body.courier_info);
    }
    h.close();
  }

  section('9. pending → taken с трите доказателства — минава');
  {
    const h = await openReturn({ returns: [retRow({ status: 'pending' })] });
    h.w.srPendingPhotos = [{ url: 'https://x/1.jpg', name: '1.jpg' }];
    fillAndSubmitSR(h, {
      'sr-status': 'taken', 'sr-wdate': '2026-08-19', 'sr-courier': 'Еконт 5300123456'
    });
    await ticks(4);
    const p = srPatches(h.calls);
    if (ok('sbPatch е викан веднъж', p.length === 1, 'брой: ' + p.length)) {
      ok('статусът е taken', p[0].body.status === 'taken', 'status=' + p[0].body.status);
      ok('снимката е записана', Array.isArray(p[0].body.photos) && p[0].body.photos.length === 1);
      ok('датата и куриерът са записани',
         p[0].body.withdrawal_date === '2026-08-19' && p[0].body.courier_info === 'Еконт 5300123456');
    }
    ok('няма съобщение за липса', !h.calls.toast.some(t => /Липсва товарителница/.test(t)));
    h.close();
  }

  section('10. Заварен taken → редакция на коментар без снимки — МИНАВА');
  {
    /* Регресия за 3-те съществуващи записа от 18.08 и за всеки бъдещ запис,
       взет преди тази промяна. Проверката хваща само прехода от "Невзета". */
    const h = await openReturn({
      returns: [retRow({ status: 'taken', photos: [], withdrawal_date: null, courier_info: '—' })]
    });
    h.w.srPendingPhotos = [];
    fillAndSubmitSR(h, { 'sr-status': 'taken', 'sr-cc': 'допълнен коментар' });
    await ticks(4);
    const p = srPatches(h.calls);
    if (ok('sbPatch е викан', p.length === 1, 'брой: ' + p.length)) {
      ok('коментарът е записан', p[0].body.control_comment === 'допълнен коментар');
    }
    ok('няма блокиращо съобщение', !h.calls.toast.some(t => /Липсва товарителница/.test(t)),
       JSON.stringify(h.calls.toast));
    h.close();
  }

  section('10б. Заварен completed → редакция без снимки — МИНАВА');
  {
    const h = await openReturn({
      returns: [retRow({ status: 'completed', photos: [], courier_info: '' })]
    });
    h.w.srPendingPhotos = [];
    fillAndSubmitSR(h, { 'sr-status': 'completed', 'sr-cc': 'бележка' });
    await ticks(4);
    ok('sbPatch е викан', srPatches(h.calls).length === 1);
    ok('няма блокиращо съобщение', !h.calls.toast.some(t => /Липсва товарителница/.test(t)));
    h.close();
  }

  section('11. pending → completed директно (както го прави Цвети) — иска същото');
  {
    const h = await openReturn({ returns: [retRow({ status: 'pending' })] });
    h.w.srPendingPhotos = [];
    fillAndSubmitSR(h, {
      'sr-status': 'completed', 'sr-wdate': '', 'sr-courier': ''
    });
    await ticks(4);
    ok('sbPatch НЕ е викан', srPatches(h.calls).length === 0,
       'брой: ' + srPatches(h.calls).length);
    ok('изброени са и трите липсващи неща',
       h.calls.toast.some(t => /снимка/.test(t) && /дата на изтегляне/.test(t) && /изтеглена от/.test(t)),
       JSON.stringify(h.calls.toast));

    /* Същият запис, но с пълно доказателство — минава. */
    h.w.srPendingPhotos = [{ url: 'https://x/1.jpg', name: '1.jpg' }];
    fillAndSubmitSR(h, {
      'sr-status': 'completed', 'sr-wdate': '2026-08-19', 'sr-courier': 'бус Кърджали → Сливен'
    });
    await ticks(4);
    const p = srPatches(h.calls);
    if (ok('с доказателство минава', p.length === 1, 'брой: ' + p.length)) {
      ok('статусът е completed', p[0].body.status === 'completed');
    }
    h.close();
  }

  section('12. Същите проверки в таб "По рекламации" (source=complaint)');
  {
    const h = await openReturn({
      srTab: 'complaint',
      returns: [retRow({ id: 'c-1', source: 'complaint', status: 'pending' })]
    });
    ok('модалът е в режим "рекламация"',
       (h.doc.getElementById('sr-source') || {}).value === 'complaint');
    h.w.srPendingPhotos = [];
    fillAndSubmitSR(h, {
      'sr-status': 'taken', 'sr-wdate': '2026-08-19', 'sr-courier': 'Еконт 5300123456'
    });
    await ticks(4);
    ok('без снимка се блокира и тук', srPatches(h.calls).length === 0,
       'брой: ' + srPatches(h.calls).length);
    ok('съобщението е същото', h.calls.toast.some(t => /Липсва товарителница/.test(t)));

    h.w.srPendingPhotos = [{ url: 'https://x/1.jpg', name: '1.jpg' }];
    fillAndSubmitSR(h, {
      'sr-status': 'taken', 'sr-wdate': '2026-08-19', 'sr-courier': 'Еконт 5300123456'
    });
    await ticks(4);
    ok('с доказателство минава и тук', srPatches(h.calls).length === 1);
    h.close();
  }

  section('12б. Изискването в модала се показва и за "Приключена"');
  {
    const h = await openReturn({ returns: [retRow({ status: 'pending' })] });
    const hint = h.doc.getElementById('sr-photo-hint');
    ok('подсказката съществува', !!hint);
    ok('при pending е скрита', hint && hint.style.display === 'none');
    h.doc.getElementById('sr-status').value = 'taken';
    h.w.updateSRPhotoHint();
    ok('при taken се показва', hint && hint.style.display === 'block');
    h.doc.getElementById('sr-status').value = 'completed';
    h.w.updateSRPhotoHint();
    ok('при completed също се показва', hint && hint.style.display === 'block',
       'display=' + (hint && hint.style.display));
    h.doc.getElementById('sr-status').value = 'pending';
    h.w.updateSRPhotoHint();
    ok('обратно при pending се скрива', hint && hint.style.display === 'none');
    ok('текстът е изискване, не подсказка',
       /Задължително/.test(hint.textContent), hint && hint.textContent);
    h.close();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ЧАСТ 3 — маркер "без документ"
     ═══════════════════════════════════════════════════════════════════════ */

  const MARK = '⚠️ без документ';

  /* Рендира списъка и връща HTML-а на модула. */
  function renderList(rows, tab) {
    const h = env({ returns: rows, srTab: tab || 'diff' });
    h.w.renderStockReturns();
    const wrap = h.doc.getElementById('mod-stock-returns');
    return { h: h, html: wrap ? wrap.innerHTML : '' };
  }

  section('13-16. Маркерът се появява точно където трябва (таб "По разлики")');
  {
    const cases = [
      ['13. taken с 0 снимки → маркер ИМА', { status: 'taken', photos: [] }, true],
      ['14. taken с 1 снимка → маркер НЯМА', { status: 'taken', photos: [{ url: 'https://x/1.jpg' }] }, false],
      ['15. pending с 0 снимки → маркер НЯМА', { status: 'pending', photos: [] }, false],
      ['16. completed с 0 снимки → маркер ИМА', { status: 'completed', photos: [] }, true],
      ['16б. completed с 1 снимка → маркер НЯМА', { status: 'completed', photos: [{ url: 'https://x/1.jpg' }] }, false],
      ['16в. taken с photos=null → маркер ИМА', { status: 'taken', photos: null }, true]
    ];
    cases.forEach(function (c) {
      const r = renderList([retRow(Object.assign({ id: 'x-1' }, c[1]))]);
      const has = r.html.indexOf(MARK) >= 0;
      ok(c[0], has === c[2], 'намерен: ' + has);
      r.h.close();
    });

    const r = renderList([retRow({ id: 'x-1', status: 'taken', photos: [] })]);
    ok('маркерът има обяснителен title',
       /title="Няма прикачена товарителница[^"]*нямаме доказателство"/.test(r.html));
    ok('маркерът е жълт', /background:#fffbeb;color:#92400e;padding:2px 6px/.test(r.html));
    ok('баджът "ВЗЕТА" не е изчезнал', r.html.indexOf('✅ ВЗЕТА') >= 0);
    r.h.close();
  }

  section('17. Същото в таб "По рекламации"');
  {
    const a = renderList([retRow({ id: 'c-1', source: 'complaint', status: 'taken', photos: [] })], 'complaint');
    ok('taken без снимки → маркер ИМА', a.html.indexOf(MARK) >= 0);
    ok('баджът "ВЗЕТА" пак е тук', a.html.indexOf('✅ ВЗЕТА') >= 0);
    a.h.close();

    const b = renderList([retRow({ id: 'c-2', source: 'complaint', status: 'taken', photos: [{ url: 'https://x/1.jpg' }] })], 'complaint');
    ok('taken със снимка → маркер НЯМА', b.html.indexOf(MARK) < 0);
    b.h.close();

    const c = renderList([retRow({ id: 'c-3', source: 'complaint', status: 'pending', photos: [] })], 'complaint');
    ok('pending → маркер НЯМА', c.html.indexOf(MARK) < 0);
    ok('баджът "НЕВЗЕТА" се рендира', c.html.indexOf('⏳ НЕВЗЕТА') >= 0);
    c.h.close();
  }

  section('18. Регресия: броячи и филтърни табове са непокътнати');
  {
    const rows = [
      retRow({ id: 'a', status: 'pending', photos: [] }),
      retRow({ id: 'b', status: 'pending', photos: [] }),
      retRow({ id: 'c', status: 'taken', photos: [] }),
      retRow({ id: 'd', status: 'taken', photos: [{ url: 'https://x/1.jpg' }] }),
      retRow({ id: 'e', status: 'completed', photos: [] })
    ];
    const r = renderList(rows);
    ok('филтърът "Невзета" брои 2', r.html.indexOf('⏳ Невзета (2)') >= 0);
    ok('филтърът "Взета" брои 2', r.html.indexOf('✅ Взета (2)') >= 0);
    ok('филтърът "Приключени" брои 1', r.html.indexOf('🏁 Приключени (1)') >= 0);
    ok('филтърът "Всички" брои 5', r.html.indexOf('Всички (5)') >= 0);

    /* Броячът и маркерът не се бъркат: 3 реда заслужават маркер (c, e и...
       не d), тоест точно 2. */
    const marks = r.html.split(MARK).length - 1;
    ok('маркери: точно 2 (taken без снимка + completed без снимка)', marks === 2,
       'брой: ' + marks);

    /* "Няма такъв бутон" гледа само <button> — иначе баджът на статуса лъже. */
    const wrap = r.h.doc.getElementById('mod-stock-returns');
    ok('маркерът НЕ е бутон', !btn(wrap, 'без документ'));
    ok('няма нов филтърен бутон "без документ"',
       !btn(wrap, 'без документ') && !btn(wrap, 'Без документ'));
    ok('филтърните бутони още работят', !!btn(wrap, '⏳ Невзета'));
    r.h.close();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ИНТЕГРАЦИОНЕН — трите части заедно, в реда от index.html
     ═══════════════════════════════════════════════════════════════════════ */
  section('19. Интеграция: решение "Връщане" → списък → "Взета" изисква документ');
  {
    const h = env({ idPrefix: 'diff-' });
    ok('shared.js, stock-returns.js и stock-differences.js са заредени заедно',
       typeof h.w.sbPostReturn === 'function' &&
       typeof h.w.srStatusBadge === 'function' &&
       typeof h.w.autoCreateReturnFromDiff === 'function');

    /* 1. Цвети решава разлика като "Връщане" през модала. */
    h.w.openSDModal(null);
    await ticks(3);
    fillAndSubmitSD(h, {
      'sd-store': 'Раднево', 'sd-name': 'ЛАЙСНА АЛ. ВЪНШ.ЪГЪЛ 10ММ',
      'sd-supplier': 'ТЕСИ ООД', 'sd-mat': '47164', 'sd-qty': '2',
      'sd-type': 'return', 'sd-status': 'pending'
    });
    await ticks(6);
    const created = returnPosts(h.calls);
    if (!ok('връщането е създадено', created.length === 1, 'брой: ' + created.length)) {
      h.close(); report();
    }

    /* 2. Появява се в списъка — без маркер, защото още е "Невзета". */
    const newRow = Object.assign({ id: 'r-new' }, retRow(), created[0].body);
    h.w.srData = [newRow];
    h.w.srTab = 'diff';
    h.w.srFilter = 'all';
    h.w.renderStockReturns();
    let html = h.doc.getElementById('mod-stock-returns').innerHTML;
    ok('редът е в списъка', html.indexOf('ЛАЙСНА АЛ. ВЪНШ.ЪГЪЛ 10ММ') >= 0);
    ok('лилавият фон показва произход от разлика', html.indexOf('background:#f5f3ff;') >= 0);
    ok('още няма маркер (стоката не е взета)', html.indexOf(MARK) < 0);

    /* 3. Бутонът "Взета" отваря модала; запис без документ се блокира. */
    const wrap = h.doc.getElementById('mod-stock-returns');
    /* Търсенето по текст "✅ Взета" хваща ФИЛТЪРНИЯ чип "✅ Взета (0)", който
       стои над таблицата и само пре-рендира. Затова бутонът на реда се търси
       по действието си, не по надписа. */
    const takeBtn = Array.from(wrap.querySelectorAll('button'))
      .find(b => /srMarkTaken/.test(b.getAttribute('onclick') || ''));
    if (ok('има бутон "Взета" на реда', !!takeBtn)) {
      realClick(h.w, takeBtn, 'маркиране като взета');
      await ticks(3);
      ok('модалът е отворен',
         h.doc.getElementById('sr-ov').classList.contains('open'));
      h.w.srPendingPhotos = [];
      fillAndSubmitSR(h, { 'sr-status': 'taken', 'sr-courier': '—' });
      await ticks(4);
      ok('без документ записът не минава', srPatches(h.calls).length === 0,
         'брой: ' + srPatches(h.calls).length);
      ok('казано е какво липсва', h.calls.toast.some(t => /Липсва товарителница/.test(t)));
    }

    /* 4. Заварен запис, взет без документ, светва с маркера в списъка. */
    h.w.srData = [Object.assign({}, newRow, { status: 'taken', photos: [] })];
    h.w.renderStockReturns();
    html = h.doc.getElementById('mod-stock-returns').innerHTML;
    ok('редът светва с "без документ"', html.indexOf(MARK) >= 0);
    ok('и си остава с бадж "ВЗЕТА"', html.indexOf('✅ ВЗЕТА') >= 0);
    h.close();
  }

  report();
})();
