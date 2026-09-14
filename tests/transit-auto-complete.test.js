/* „Стока на път": „проверено, не е пристигнало" + автоматично отмятане.

   Базата (transit-reviewed-schema.sql) решава кога задачата е изпълнена и
   сама пише реда в task_completions — там има отделен SQL тест. Тук е
   клиентът:

   A. transit.js
     1. броячът „Обработени X / проверени Y / необработени Z" — само входящите
        редове на обекта, без чужд обект и без трансфер;
     2. бутонът „👁 Проверено, не е пристигнало" само на чакащ входящ ред, на
        който обектът е получател; баджът „👁 проверено дд.мм" на проверения;
     3. истински клик → PATCH само с reviewed_at/reviewed_by, без status;
     4. „✅ Прието" / „✕ Неприето" чистят reviewed_at; „↩ Върни" не го пипа;
     5. „Провери всички чакащи" — confirm; „Откажи" не пише; пакети по 100;
     6. формата за редакция: статус ≠ pending чисти reviewed_at;
     7. офисът: без избран обект броячът го няма, с избран — има.
   B. bulletin.js (обект)
     8. автоматичната задача: чекбоксът е заключен с „Отмята се автоматично
        от Стока на път", data-linked='transit-auto'; ръчната 'transit' — не;
     9. надписът „⏳ N необработени реда" / „✓ от Стока на път"; служебното
        auto:transit не се показва като име;
    10. пряко извикване на обработчика и на модала се отхвърля;
    11. броят се тегли с точния филтър и само когато има смисъл.
   C. bulletin.js (офис) — формата за задача
    12. полето се показва само при Стока на път; повече от един ден → отказ,
        без запис; един ден → auto_complete:true; без Стока на път → false;
    13. редакция: полето носи стойността; махане на Стока на път → false.

   Мутации, с които тестът ТРЯБВА да падне — виж края на отчета за сесията.

   ⚠️ Дати: само относителни (dayOffset / Date от днес). Без литерали.

   Пускане: node tests/transit-auto-complete.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, ok, guard, section, report, dayOffset, ticks } = H;

const TR = 'Троян';
const MANAGER = { email: 'm@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: TR };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const TODAY = dayOffset(0);
const AUTO_LABEL = 'Отмята се автоматично от Стока на път';

const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const patchesTo = (h, t) => h.calls.patch.filter(p => p.table === t);
const postsTo = (h, t) => h.calls.post.filter(p => p.table === t);
async function settle(n) { for (let i = 0; i < (n || 6); i++) await ticks(); }

/* ═══ A. transit.js ═══════════════════════════════════════════════════════ */
function reviewedNoon() { const d = new Date(); d.setHours(12, 0, 0, 0); return d; }
function dm(d) { const p = n => String(n).padStart(2, '0'); return p(d.getDate()) + '.' + p(d.getMonth() + 1); }

function trow(id, over) {
  return Object.assign({
    id: id, store_name: TR, supplier: 'Логистичен склад Търговище', purchase_doc: '46' + id,
    position: 10, doc_date: dayOffset(-20), material_code: 'M' + id, material_name: 'Артикул ' + id,
    ordered_qty: 1, unit: 'БР', remaining_qty: 1, comment: '', transfer_date: null,
    status: 'pending', direction: 'incoming', reviewed_at: null, reviewed_by: null
  }, over || {});
}

function transitEnv(user, rows) {
  const h = boot({ modules: ['transport.js', 'client-orders.js', 'transit.js'], user: user,
                   data: { goods_transit: [], stores: [], users: [] } });
  /* loadTransit вика fetch направо (Range страници). Стъбът поема само ТЯХ —
     PATCH-овете минават през harness-а, за да се запишат в calls.patch. */
  const orig = h.w.fetch;
  h.w.fetch = function (url, opts) {
    const m = (opts && opts.method) || 'GET';
    if (/goods_transit/.test(String(url)) && m === 'GET') {
      return Promise.resolve({ ok: true, status: 206,
        headers: { get: n => (/content-range/i.test(n) ? '0-0/0' : null) },
        json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    }
    return orig.apply(this, arguments);
  };
  h.w.transitData = rows;
  h.w.transitFilter = 'all';
  h.w.transitDir = 'all';
  guard('renderTransit()', () => h.w.renderTransit());
  return h;
}
const rowBtn = (doc, id, needle) => Array.prototype.find.call(
  doc.querySelectorAll('button[data-id="' + id + '"]'), b => (b.getAttribute('onclick') || '').indexOf(needle) >= 0) || null;
const rowOf = (doc, id) => { const b = doc.querySelector('button[data-id="' + id + '"]'); return b ? b.closest('tr') : null; };

function baseRows() {
  return [
    trow('r1'),                                                              /* необработен */
    trow('r2', { reviewed_at: reviewedNoon().toISOString(), reviewed_by: 'Управител Троян' }), /* проверен */
    trow('r3', { status: 'received' }),                                      /* обработен */
    trow('r4', { store_name: 'Карлово' }),                                   /* чужд обект */
    trow('r5', { direction: 'transfer', supplier: 'Карлово' })               /* трансфер */
  ];
}

/* ═══ B/C. bulletin.js ════════════════════════════════════════════════════ */
function isoWeekYear(d) {
  const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); return t.getFullYear();
}
function btask(id, over) {
  return Object.assign({
    id: id, bulletin_id: 'b-1', title: 'Задача ' + id, department: 'warehouse', task_type: 'info',
    description: null, target_stores: null, due_date: TODAY, due_dates: [TODAY],
    linked_module: null, auto_complete: false, report_groups: null, attachments: null, sort_order: 1
  }, over || {});
}
function bulEnv(user, tasks, data) {
  const h = boot({ modules: ['bulletin.js'], user: user,
                   data: Object.assign({ users: [{ store_name: TR }], goods_transit: [], task_completions: [] }, data || {}) });
  const w = h.w, now = new Date(), cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });
  w.curBul = { id: 'b-1', week_number: w.weekNum(now), year: isoWeekYear(now), status: 'published',
               content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
  w.bulListCache = []; w.bulComps = []; w.recurringComps = []; w.recurringTasks = [];
  w.allStoresCache = [TR]; w.reportableStoresCache = [TR];
  w.bulTasks = tasks;
  /* Записите викат loadBulletin(); истинският тук няма бюлетин в данните и
     асинхронно нулира curBul. Проверява се заявката, не презареждането. */
  h.reloads = 0;
  w.loadBulletin = function () { h.reloads++; };
  return h;
}
const cbs = (doc, id) => Array.prototype.slice.call(doc.querySelectorAll('input[type=checkbox][data-tid="' + id + '"]'));
function fakeCb(doc, id, linked) {
  const cb = doc.createElement('input'); cb.type = 'checkbox';
  cb.setAttribute('data-tid', id); cb.setAttribute('data-cdate', TODAY); cb.setAttribute('data-linked', linked);
  cb.checked = true; return cb;
}

(async function () {

  /* ═══ A ═══════════════════════════════════════════════════════════════ */
  section('A1. Броячът за обекта: само входящи, само собствени');
  {
    const h = transitEnv(MANAGER, baseRows());
    const c = h.doc.getElementById('t-review-counter');
    if (ok('броячът е изрисуван', !!c)) {
      const t = txt(c);
      ok('Обработени 1', t.indexOf('Обработени 1') >= 0, t);
      ok('проверени 1', t.indexOf('проверени 1') >= 0, t);
      ok('необработени 1 (чуждият обект и трансферът не влизат)', t.indexOf('необработени 1') >= 0, t);
    }
  }

  section('A2. Бутонът и баджът по редове');
  {
    const h = transitEnv(MANAGER, baseRows());
    const d = h.doc;
    ok('r1 (чакащ, свой) има „👁 Проверено"', !!rowBtn(d, 'r1', 'tMarkReviewed'));
    ok('r2 (вече проверен) НЯМА бутона', !rowBtn(d, 'r2', 'tMarkReviewed'));
    const r2 = rowOf(d, 'r2'), badge = r2 && r2.querySelector('.t-reviewed');
    ok('r2 носи бадж „👁 проверено ' + dm(reviewedNoon()) + '"', !!badge && txt(badge) === '👁 проверено ' + dm(reviewedNoon()), txt(badge));
    ok('r3 (прието) НЯМА бутона', !rowBtn(d, 'r3', 'tMarkReviewed'));
    ok('r3 няма бадж', !(rowOf(d, 'r3') || d).querySelector('.t-reviewed'));
    ok('r4 (чужд обект) НЯМА бутона', !rowBtn(d, 'r4', 'tMarkReviewed'));
    ok('r5 (трансфер) НЯМА бутона', !rowBtn(d, 'r5', 'tMarkReviewed'));
  }

  section('A3. Истински клик „👁 Проверено" → PATCH само с проверката');
  {
    const h = transitEnv(MANAGER, baseRows());
    const b = rowBtn(h.doc, 'r1', 'tMarkReviewed');
    if (b && guard('клик', () => realClick(h.w, b, '👁 Проверено'))) {
      await settle();
      const p = patchesTo(h, 'goods_transit');
      if (ok('една заявка', p.length === 1, p.length)) {
        ok('към r1', /id=eq\.r1(&|$)/.test(p[0].url), p[0].url);
        ok('reviewed_at е ISO време', typeof p[0].body.reviewed_at === 'string' && !isNaN(Date.parse(p[0].body.reviewed_at)), JSON.stringify(p[0].body));
        ok('reviewed_by = името', p[0].body.reviewed_by === 'Управител Троян', p[0].body.reviewed_by);
        ok('status НЕ се пипа', !('status' in p[0].body), JSON.stringify(p[0].body));
      }
    }
  }

  section('A4. Прието/Неприето чистят проверката; „↩ Върни" не');
  {
    const h = transitEnv(MANAGER, baseRows());
    const acc = rowBtn(h.doc, 'r2', "'received'");
    if (ok('r2 има „✅ Прието"', !!acc)) {
      realClick(h.w, acc, 'Прието'); await settle();
      const p = patchesTo(h, 'goods_transit')[0];
      ok('status received', p && p.body.status === 'received');
      ok('reviewed_at → null', p && 'reviewed_at' in p.body && p.body.reviewed_at === null, p && JSON.stringify(p.body));
      ok('reviewed_by → null', p && 'reviewed_by' in p.body && p.body.reviewed_by === null);
    }
  }
  {
    const h = transitEnv(MANAGER, baseRows());
    const rej = rowBtn(h.doc, 'r2', "'rejected'");
    if (ok('r2 има „✕ Неприето"', !!rej)) {
      realClick(h.w, rej, 'Неприето'); await settle();
      const p = patchesTo(h, 'goods_transit')[0];
      ok('rejected → reviewed_at null', p && p.body.status === 'rejected' && p.body.reviewed_at === null, p && JSON.stringify(p.body));
    }
  }
  {
    const h = transitEnv(MANAGER, baseRows());
    const back = rowBtn(h.doc, 'r3', "'pending'");
    if (ok('r3 има „↩ Върни"', !!back)) {
      realClick(h.w, back, 'Върни'); await settle();
      const p = patchesTo(h, 'goods_transit')[0];
      ok('КОНТРОЛА: „↩ Върни" не пипа reviewed_at', p && p.body.status === 'pending' && !('reviewed_at' in p.body), p && JSON.stringify(p.body));
    }
  }

  section('A5. „Провери всички чакащи" — confirm и пакети');
  {
    const h = transitEnv(MANAGER, baseRows());
    const all = h.doc.getElementById('t-review-all');
    if (ok('бутонът е там и брои само проверимите (1)', !!all && txt(all).indexOf('(1)') >= 0, txt(all))) {
      h.w.confirm = () => false;
      realClick(h.w, all, 'Провери всички'); await settle();
      ok('„Откажи" → нищо не се пише', patchesTo(h, 'goods_transit').length === 0);
      h.w.confirm = () => true;
      realClick(h.w, h.doc.getElementById('t-review-all'), 'Провери всички'); await settle();
      const p = patchesTo(h, 'goods_transit');
      ok('„ОК" → една заявка за r1', p.length === 1 && /id=in\.\(r1\)/.test(p[0].url), p.map(x => x.url).join(' | '));
      ok('тялото е проверката, без status', p[0] && p[0].body.reviewed_by === 'Управител Троян' && !('status' in p[0].body));
    }
  }
  {
    const rows = [];
    for (let i = 0; i < 250; i++) rows.push(trow('x' + i));
    const h = transitEnv(MANAGER, rows);
    h.w.confirm = () => true;
    realClick(h.w, h.doc.getElementById('t-review-all'), 'Провери всички');
    await settle(30);
    const p = patchesTo(h, 'goods_transit');
    const sizes = p.map(x => (/id=in\.\(([^)]*)\)/.exec(x.url) || ['', ''])[1].split(',').length);
    ok('250 реда → 3 пакета (100, 100, 50)', sizes.join(',') === '100,100,50', sizes.join(','));
  }

  section('A6. Формата за редакция: затворен статус чисти проверката');
  {
    const h = transitEnv(MANAGER, baseRows());
    const ed = rowBtn(h.doc, 'r2', 'openTransitEdit');
    if (ok('r2 има ✏️ Редакция', !!ed)) {
      realClick(h.w, ed, 'Редакция');
      const st = h.doc.getElementById('tr-status');
      const save = Array.prototype.find.call(h.doc.querySelectorAll('#transit-modal button'), b => (b.getAttribute('onclick') || '').indexOf('submitTransit') >= 0);
      if (ok('формата е отворена', !!st && !!save)) {
        st.value = 'received';
        realClick(h.w, save, 'Запиши'); await settle();
        const p = patchesTo(h, 'goods_transit')[0];
        ok('PATCH с reviewed_at null', p && p.body.status === 'received' && p.body.reviewed_at === null, p && JSON.stringify(p.body));
      }
    }
  }

  section('A7. Офисът: броячът е за ИЗБРАН обект');
  {
    const h = transitEnv(ADMIN, baseRows());
    ok('без избран обект броячът го няма', !h.doc.getElementById('t-review-counter'));
    h.w.transitStore = TR; h.w.renderTransit();
    const c = h.doc.getElementById('t-review-counter');
    ok('с избран Троян — има, 1/1/1', !!c && txt(c).indexOf('Обработени 1') >= 0 && txt(c).indexOf('необработени 1') >= 0, txt(c));
  }

  section('A8. Excel износът: колона „Проверено"');
  {
    const rows = baseRows().concat([
      /* затворен ред със стара стойност — колоната е празна, като баджа */
      trow('r6', { status: 'received', reviewed_at: reviewedNoon().toISOString(), reviewed_by: 'Стар' })
    ]);
    const h = transitEnv(MANAGER, rows);
    let sheet = null, written = false;
    h.w.XLSX = { utils: { book_new: () => ({}), aoa_to_sheet: a => { sheet = a; return {}; }, book_append_sheet() {} },
                 writeFile() { written = true; } };
    if (guard('exportTransitExcel()', () => h.w.exportTransitExcel()) && ok('файлът е записан', written && !!sheet)) {
      const head = sheet[0], ci = head.indexOf('Проверено');
      ok('заглавие „Проверено" веднага след „Статус"', ci > 0 && head[ci - 1] === 'Статус', JSON.stringify(head));
      ok('всеки ред е с дължината на заглавието', sheet.every(r => r.length === head.length), sheet.map(r => r.length).join(','));
      const byMat = m => sheet.find(r => r.indexOf('Артикул ' + m) >= 0);
      const d = reviewedNoon(), p = n => String(n).padStart(2, '0');
      const exp = p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' 12:00 · Управител Троян';
      ok('r2 (проверен) → „' + exp + '"', byMat('r2') && byMat('r2')[ci] === exp, byMat('r2') && byMat('r2')[ci]);
      ok('r1 (непроверен) → празно', byMat('r1') && byMat('r1')[ci] === '');
      ok('r6 (прието, стара стойност) → празно', byMat('r6') && byMat('r6')[ci] === '', byMat('r6') && byMat('r6')[ci]);
    }
  }

  /* ═══ B ═══════════════════════════════════════════════════════════════ */
  const T_AUTO = () => btask('t-auto', { title: 'Стока на път авто', linked_module: 'transit', auto_complete: true, task_type: 'comment' });
  const T_MAN = () => btask('t-man', { title: 'Стока на път ръчна', linked_module: 'transit', auto_complete: false });

  section('B8. Заключеният чекбокс');
  {
    const h = bulEnv(MANAGER, [T_AUTO(), T_MAN()]);
    h.w.bulTransitPending = 3;
    guard('renderBulView()', () => h.w.renderBulView());
    const a = cbs(h.doc, 't-auto'), m = cbs(h.doc, 't-man');
    if (ok('автоматичната има чекбокси', a.length > 0, a.length)) {
      ok('всички са disabled — и за ДНЕС', a.every(c => c.disabled));
      ok('title: „' + AUTO_LABEL + '"', a.every(c => c.getAttribute('title') === AUTO_LABEL), a.map(c => c.getAttribute('title')).join(' | '));
      ok('data-linked = transit-auto', a.every(c => c.getAttribute('data-linked') === 'transit-auto'));
      ok('приглушени, не скрити', a.every(c => (c.getAttribute('style') || '').indexOf('cursor:not-allowed') >= 0));
    }
    if (ok('КОНТРОЛА: ръчната transit има чекбокси', m.length > 0)) {
      ok('КОНТРОЛА: ръчната е натискаема днес', m.every(c => !c.disabled));
      ok('КОНТРОЛА: data-linked = transit', m.every(c => c.getAttribute('data-linked') === 'transit'));
    }
    ok('oborot не е засегнат', h.w.bulLockLabel('auto') === 'Отмята се автоматично при запис на оборота' && h.w.bulTaskLinkKey({ linked_module: 'oborot' }) === 'oborot');
  }

  section('B9. Надписите');
  {
    const h = bulEnv(MANAGER, [T_AUTO(), T_MAN()]);
    h.w.bulTransitPending = 3;
    h.w.renderBulView();
    const notes = () => Array.prototype.map.call(h.doc.querySelectorAll('.bul-auto-transit'), txt);
    let n = notes();
    ok('„⏳ 3 необработени реда"', n.length > 0 && n.every(t => t === '⏳ 3 необработени реда'), n.join(' | '));
    h.w.bulTransitPending = 1; h.w.renderBulView(); n = notes();
    ok('1 → „⏳ 1 необработен ред"', n.length > 0 && n.every(t => t === '⏳ 1 необработен ред'), n.join(' | '));
    h.w.bulTransitPending = 0; h.w.renderBulView(); n = notes();
    ok('0 → без число: „⏳ отмята се от Стока на път"', n.length > 0 && n.every(t => t === '⏳ отмята се от Стока на път'), n.join(' | '));
    h.w.bulComps = [{ task_id: 't-auto', store_name: TR, status: 'done', completion_date: TODAY, completed_by: 'auto:transit', comment: 'всички редове обработени' }];
    h.w.renderBulView(); n = notes();
    ok('изпълнена → „✓ от Стока на път"', n.length > 0 && n.every(t => t === '✓ от Стока на път'), n.join(' | '));
    const page = txt(h.doc.getElementById('mod-bulletin'));
    ok('служебното „auto:transit" не се показва никъде', page.indexOf('auto:transit') < 0);
    ok('вместо него: „автоматично от Стока на път"', page.indexOf('автоматично от Стока на път') >= 0);
    ok('КОНТРОЛА: ръчната задача няма такъв надпис', cbs(h.doc, 't-man').every(c => !c.parentNode.querySelector('.bul-auto-transit')));
  }

  section('B10. Обработчикът и модалът отказват');
  {
    const h = bulEnv(MANAGER, [T_AUTO()]);
    const cb = fakeCb(h.doc, 't-auto', 'transit-auto');
    guard('bulCheckboxChanged()', () => h.w.bulCheckboxChanged(cb));
    await settle();
    ok('няма запис в task_completions', postsTo(h, 'task_completions').length === 0 && patchesTo(h, 'task_completions').length === 0);
    ok('чекбоксът се връща', cb.checked === false);
    ok('казва защо', h.calls.toast.indexOf(AUTO_LABEL) >= 0, JSON.stringify(h.calls.toast));
    guard('openTaskCompletionModal()', () => h.w.openTaskCompletionModal('t-auto', 'regular', TODAY));
    ok('модалът не се отваря', !h.doc.getElementById('tc-modal-ov'));
  }
  {
    const h = bulEnv(MANAGER, [T_MAN()]);
    guard('ръчна: openTaskCompletionModal()', () => h.w.openTaskCompletionModal('t-man', 'regular', TODAY));
    ok('КОНТРОЛА: за ръчната transit модалът се отваря', !!h.doc.getElementById('tc-modal-ov'));
  }

  section('B11. Броят се тегли точно и само когато има смисъл');
  {
    const h = bulEnv(MANAGER, [T_AUTO()], { goods_transit: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }] });
    h.w.renderBulletin = function () {};
    guard('bulLoadTransitPending()', () => h.w.bulLoadTransitPending());
    await settle();
    const u = h.calls.get.filter(x => /goods_transit/.test(x));
    if (ok('една заявка', u.length === 1, u.join(' | '))) {
      ok('store_name = обекта', u[0].indexOf('store_name=eq.' + encodeURIComponent(TR)) >= 0, u[0]);
      ok('само входящи, чакащи (и без статус), непроверени',
        /direction=eq\.incoming/.test(u[0]) && u[0].indexOf('or=(status.eq.pending,status.is.null)') >= 0 && /reviewed_at=is\.null/.test(u[0]), u[0]);
    }
    ok('bulTransitPending = 5', h.w.bulTransitPending === 5, h.w.bulTransitPending);
  }
  {
    const h = bulEnv(MANAGER, [T_MAN()]);
    h.w.bulLoadTransitPending(); await settle();
    ok('без автоматична задача → без заявка', !h.calls.get.some(x => /goods_transit/.test(x)));
  }
  {
    const h = bulEnv(ADMIN, [T_AUTO()]);
    h.w.bulLoadTransitPending(); await settle();
    ok('офис → без заявка', !h.calls.get.some(x => /goods_transit/.test(x)));
  }

  section('B12. „⏱ Отложи" го няма при задача, която се отмята сама');
  {
    const IDX = (new Date().getDay() + 6) % 7;
    const rec = (id, over) => Object.assign({ id: id, title: 'Постоянна ' + id, department: 'warehouse', task_type: 'info',
      description: null, target_stores: null, due_weekday: null, due_weekdays: [IDX], due_time: '20:00', due_window: false,
      linked_module: null, report_groups: null, attachments: null, active: true, sort_order: 1 }, over || {});
    const h = bulEnv(MANAGER, [T_AUTO(), T_MAN()]);
    h.w.recurringTasks = [rec('r-ob', { linked_module: 'oborot' }), rec('r-plain')];
    h.w.renderBulView();
    const pp = id => h.doc.querySelectorAll('button[data-task-id="' + id + '"][onclick^="openPostponeModal"]').length;
    ok('автоматична Стока на път: няма „Отложи"', pp('t-auto') === 0, pp('t-auto'));
    ok('постоянна oborot: няма „Отложи"', pp('r-ob') === 0, pp('r-ob'));
    ok('КОНТРОЛА: ръчна Стока на път има „Отложи"', pp('t-man') > 0, pp('t-man'));
    ok('КОНТРОЛА: обикновена постоянна има „Отложи"', pp('r-plain') > 0, pp('r-plain'));

    /* Вече отложената автоматична задача трябва да може да се върне. */
    h.w.bulComps = [{ task_id: 't-auto', store_name: TR, status: 'postponed', completion_date: TODAY,
                      postponed_to: dayOffset(1), comment: 'причина', completed_by: 'Управител Троян' }];
    h.w.renderBulView();
    const cancel = h.doc.querySelectorAll('button[data-task-id="t-auto"][onclick^="cancelPostpone"]').length;
    ok('отложена автоматична: „↩ Отмени" остава', cancel > 0, cancel);
  }

  /* ═══ C ═══════════════════════════════════════════════════════════════ */
  function dueBoxes(doc, wrapId) { return Array.prototype.slice.call(doc.querySelectorAll('#' + wrapId + ' input[type=checkbox]')); }
  function pickDays(doc, wrapId, n) {
    const boxes = dueBoxes(doc, wrapId);
    boxes.forEach(b => { b.checked = false; });
    const today = boxes.find(b => b.value === TODAY) || boxes[0];
    const chosen = [today].concat(boxes.filter(b => b !== today).slice(0, n - 1)).slice(0, n);
    chosen.forEach(b => { b.checked = true; });
    return chosen.map(b => b.value);
  }
  const addBtn = doc => Array.prototype.find.call(doc.querySelectorAll('#tk-ov button'), b => (b.getAttribute('onclick') || '') === 'submitTask()');

  section('C12. Нова задача: полето, отказът за няколко дни, записът');
  {
    const h = bulEnv(ADMIN, [btask('t-x')]);
    h.w.renderBulView();
    guard('openTaskModal()', () => h.w.openTaskModal());
    const d = h.doc, wrap = () => d.getElementById('tk-auto-wrap'), sel = d.getElementById('tk-linked-module');
    if (ok('полето съществува и е скрито без Стока на път', !!wrap() && wrap().style.display === 'none')) {
      sel.value = 'transit'; fire(h.w, sel, 'change');
      ok('при Стока на път се показва', wrap().style.display !== 'none');
      d.getElementById('tk-title').value = 'Авто стока на път';
      d.getElementById('tk-auto-complete').checked = true;

      pickDays(d, 'tk-due-dates', 2);
      realClick(h.w, addBtn(d), 'Добави задача'); await settle();
      ok('2 дни → НЯМА запис', postsTo(h, 'bulletin_tasks').length === 0);
      ok('2 дни → казва защо', h.calls.toast.some(t => /ЕДИН ден/.test(t)), JSON.stringify(h.calls.toast));

      dueBoxes(d, 'tk-due-dates').forEach(b => { b.checked = false; });
      realClick(h.w, addBtn(d), 'Добави задача'); await settle();
      ok('0 дни → НЯМА запис', postsTo(h, 'bulletin_tasks').length === 0);

      const one = pickDays(d, 'tk-due-dates', 1);
      realClick(h.w, addBtn(d), 'Добави задача'); await settle();
      const p = postsTo(h, 'bulletin_tasks');
      if (ok('1 ден → един запис', p.length === 1, p.length)) {
        ok('auto_complete: true', p[0].body.auto_complete === true, JSON.stringify(p[0].body));
        ok('linked_module: transit, срокът е един ден', p[0].body.linked_module === 'transit' && JSON.stringify(p[0].body.due_dates) === JSON.stringify(one));
      }
    }
  }
  {
    const h = bulEnv(ADMIN, [btask('t-x')]);
    h.w.renderBulView(); h.w.openTaskModal();
    const d = h.doc, sel = d.getElementById('tk-linked-module');
    sel.value = 'transit'; fire(h.w, sel, 'change');
    d.getElementById('tk-auto-complete').checked = true;
    sel.value = 'kasa'; fire(h.w, sel, 'change');
    d.getElementById('tk-title').value = 'Каса със стара отметка';
    pickDays(d, 'tk-due-dates', 3);
    realClick(h.w, addBtn(d), 'Добави задача'); await settle();
    const p = postsTo(h, 'bulletin_tasks');
    ok('КОНТРОЛА: друг таб + скрита отметка → записва с auto_complete:false и 3 дни', p.length === 1 && p[0].body.auto_complete === false, p[0] && JSON.stringify(p[0].body));
    /* Успешният запис вика loadBulletin(), който пренарисува страницата;
       в jsdom данните не идват, затова изгледът се рисува отново на ръка. */
    h.w.renderBulView();
    h.doc.getElementById('tk-auto-complete').checked = true;
    h.w.openTaskModal();
    ok('повторно отваряне нулира отметката', d.getElementById('tk-auto-complete').checked === false);
  }

  section('C13. Редакция');
  {
    const h = bulEnv(ADMIN, [T_AUTO(), btask('t-multi', { linked_module: 'transit', due_dates: [TODAY, dayOffset(1)] })]);
    h.w.renderBulView();
    guard('openEditTaskModal(t-auto)', () => h.w.openEditTaskModal('t-auto'));
    const d = h.doc, saveBtn = () => Array.prototype.find.call(d.querySelectorAll('#edit-tk-ov button'), b => (b.getAttribute('onclick') || '').indexOf('submitEditTask') >= 0);
    const ac = d.getElementById('etk-auto-complete');
    if (ok('полето носи стойността (отметнато, видимо)', !!ac && ac.checked && d.getElementById('etk-auto-wrap').style.display !== 'none')) {
      realClick(h.w, saveBtn(), 'Запази'); await settle();
      let p = patchesTo(h, 'bulletin_tasks');
      ok('запис с auto_complete:true', p.length === 1 && p[0].body.auto_complete === true, p[0] && JSON.stringify(p[0].body));

      h.w.openEditTaskModal('t-auto');
      const sel = d.getElementById('etk-linked-module');
      sel.value = ''; fire(h.w, sel, 'change');
      realClick(h.w, saveBtn(), 'Запази'); await settle();
      p = patchesTo(h, 'bulletin_tasks');
      ok('махната Стока на път → auto_complete:false', p.length === 2 && p[1].body.auto_complete === false && p[1].body.linked_module === null, p[1] && JSON.stringify(p[1].body));
    }
  }
  {
    const h = bulEnv(ADMIN, [btask('t-multi', { linked_module: 'transit', due_dates: [TODAY, dayOffset(1)] })]);
    h.w.renderBulView();
    h.w.openEditTaskModal('t-multi');
    const d = h.doc;
    d.getElementById('etk-auto-complete').checked = true;
    pickDays(d, 'etk-due-dates', 2);
    const save = Array.prototype.find.call(d.querySelectorAll('#edit-tk-ov button'), b => (b.getAttribute('onclick') || '').indexOf('submitEditTask') >= 0);
    realClick(h.w, save, 'Запази'); await settle();
    ok('многодневна + отметка → НЯМА запис', patchesTo(h, 'bulletin_tasks').length === 0);
    ok('и казва защо', h.calls.toast.some(t => /ЕДИН ден/.test(t)), JSON.stringify(h.calls.toast));
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
