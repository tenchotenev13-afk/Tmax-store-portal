/* Пренесена задача с изискване (снимка / документ / коментар) — отмята се САМО
   през модала (27.09.2026).

   Дотук bulCarriedCheckboxChanged() отиваше право в bulCarriedPatch() и
   затваряше реда БЕЗ доказателство, докато същият клик върху обикновен или
   постоянен ред минава през openTaskCompletionModal(). Реален случай от базата
   на 27.09.2026: Монтана, „Излагане на палето зона" (photo_comment), пренесена
   26.09 → 27.09, status='done' с НУЛА снимки — а коментарът в реда е от
   ОТЛАГАНЕТО и казва обратното („утре рано, това ще е първата задача").

   Записът пак отива в ПЪРВОНАЧАЛНИЯ ред (completion_date е ключът на отчетите),
   само че вече носи и снимката/коментара.

   Какво заковава тестът (РЕАЛНИ кликове):
     1. пренесена photo_comment задача → клик → модалът се отваря, нищо не се
        записва; чекбоксът се връща неотметнат;
     2. без снимка „Потвърди" не записва и обяснява;
     3. със снимка и коментар → PATCH по ПЪРВОНАЧАЛНИЯ ден, status='done',
        снимката и коментарът влизат в СЪЩИЯ ред, нов ред НЕ се създава;
     4. пренесена задача БЕЗ изискване (info) си остава един клик;
     5. „План за деня" ползва същия обработчик и пренесената ПОСТОЯННА задача
        минава по пътя на пренесените (data-kind='recurring'), не по този на
        постоянните;
     6. разотмятане (uncheck) не отваря модал.

   Пускане: node tests/carried-completion-modal.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, ok, guard, section, report, ticks } = H;

const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
  return d;
})();
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const shifted = n => { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() + n); return d; };
function isoWeekYear(d) {
  const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  return t.getFullYear();
}
function freezeDate(w) {
  const Real = w.Date, ms = ANCHOR.getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = Frozen;
}
const MON = isoOf(shifted(-2));
const TUE = isoOf(shifted(-1));   /* първоначалният ден */
const WED = isoOf(ANCHOR);        /* „днес" = денят, за който е пренесена */

const STORE = { email: 't@temax.bg', display_name: 'Троян', role: 'manager', store_name: 'Троян' };

function task(id, over) {
  return Object.assign({
    id: id, bulletin_id: 'b-0', week_number: 0, year: 2026, department: 'trade',
    title: 'Задача ' + id, description: null, due_date: TUE, due_dates: [TUE],
    spans_from: null, starts_on: null, target_stores: null, task_type: 'info',
    report_groups: null, linked_module: null, auto_complete: false, attachments: null,
    sort_order: 1, created_by: 'Админ', created_at: MON
  }, over || {});
}
function rec(id, over) {
  return Object.assign({
    id: id, title: 'Постоянна ' + id, department: 'admin', task_type: 'info',
    description: null, target_stores: null, due_weekday: 1, due_weekdays: [1],
    due_time: null, due_window: false, linked_module: null, report_groups: null,
    attachments: null, active: true, sort_order: 1, created_at: MON
  }, over || {});
}
function freshDb() {
  return {
    seq: 0,
    tasks: [
      /* пренесена ОТ вторник ЗА днес, с изискване за снимка и коментар */
      task('t-pc', { title: 'Излагане на палето зона', task_type: 'photo_comment' }),
      /* пренесена, но без изискване */
      task('t-info', { title: 'Провери етикетите', task_type: 'info', sort_order: 2 })
    ],
    recs: [
      /* пренесена ПОСТОЯННА (дължима в понеделник, пренесена за днес) */
      rec('r-pc', { title: 'Ревизия групи', task_type: 'photo_comment' })
    ],
    comps: [
      { id: 'c-pc', task_id: 't-pc', recurring_task_id: null, store_name: 'Троян',
        status: 'postponed', completion_date: TUE, postponed_to: WED,
        comment: 'утре рано, това ще е първата задача', photos: null, files: null },
      { id: 'c-info', task_id: 't-info', recurring_task_id: null, store_name: 'Троян',
        status: 'postponed', completion_date: TUE, postponed_to: WED,
        comment: 'нямаше време', photos: null, files: null },
      { id: 'c-rpc', task_id: null, recurring_task_id: 'r-pc', store_name: 'Троян',
        status: 'postponed', completion_date: MON, postponed_to: WED,
        comment: 'отложена', photos: null, files: null }
    ]
  };
}
function wireDb(h, db) {
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const m = (init.method || 'GET').toUpperCase();
    if (m === 'GET' || url.indexOf('/task_completions') < 0) return orig.call(this, url, init);
    const body = init.body ? JSON.parse(init.body) : null;
    orig.call(this, url, init);
    if (m === 'POST') {
      const row = Object.assign({ id: 'c-n' + (++db.seq) }, body);
      db.comps.push(row);
      return Promise.resolve({ ok: true, status: 201, headers: { get: () => null }, json: () => Promise.resolve([row]), text: () => Promise.resolve('') });
    }
    if (m === 'PATCH') {
      /* филтърът е по (task_id|recurring_task_id, store_name, completion_date) */
      const idm = /[?&](task_id|recurring_task_id)=eq\.([^&]+)/.exec(url);
      const cdm = /[?&]completion_date=eq\.([0-9-]+)/.exec(url);
      db.comps.forEach(c => {
        if (!idm || String(c[idm[1]]) !== idm[2]) return;
        if (cdm && (c.completion_date || null) !== cdm[1]) return;
        Object.assign(c, body);
      });
      return Promise.resolve({ ok: true, status: 204, headers: { get: () => null }, json: () => Promise.resolve(null), text: () => Promise.resolve('') });
    }
    return orig.call(this, url, init);
  };
}
function bulOf(w) {
  const cal = {}; w.DKEYS.forEach(k => { cal[k] = []; });
  return {
    id: 'b-0', week_number: w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published',
    created_at: MON, content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } }
  };
}
function env(db) {
  const h = boot({
    modules: ['bulletin.js', 'today.js', 'report.js'],
    user: STORE,
    data: {
      users: [{ store_name: 'Троян' }], stores: [{ name: 'Троян' }],
      bulletins: () => h.buls,
      bulletin_tasks: url => {
        if (url.indexOf('spans_from=not.is.null') >= 0) return [];
        const byIds = /[?&]id=in\.\(([^)]*)\)/.exec(url);
        if (byIds) { const ids = byIds[1].split(','); return db.tasks.filter(t => ids.indexOf(t.id) >= 0); }
        /* bulletin_id се УВАЖАВА: задача от чужд бюлетин НЕ влиза в bulTasks и се
           дотегля отделно (bulFetchCarriedTasks) — само така се проверява, че
           модалът я намира в bulCarriedTasks. */
        const byBul = /[?&]bulletin_id=eq\.([^&]+)/.exec(url);
        if (byBul) return db.tasks.filter(t => t.bulletin_id === byBul[1]);
        return db.tasks;
      },
      recurring_tasks: () => db.recs,
      recurring_task_periods: () => db.recs.map(r => ({ recurring_task_id: r.id, from_monday: '2026-01-05', to_monday: null })),
      recurring_task_versions: [], recurring_task_skips: [],
      task_completions: url => {
        let out = db.comps.slice();
        if (url.indexOf('postponed_to=') >= 0) return out.filter(c => !!c.postponed_to);
        if (url.indexOf('recurring_task_id=not.is.null') >= 0) return out.filter(c => !!c.recurring_task_id);
        return out;
      },
      bulletin_promotions: [], task_subtasks: [], subtask_completions: [],
      notification_schedules: [], report_snapshots: [], goods_transit: []
    }
  });
  h.buls = [bulOf(h.w)];
  freezeDate(h.w);
  h.w.bulSelectedId = 'b-0';
  h.w.bulActiveDept = 'trade';
  h.w.reportableStoresCache = ['Троян'];
  h.w.allStoresCache = ['Троян'];
  wireDb(h, db);
  return h;
}
async function settle(cond, max) {
  for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
async function view(db) {
  const h = env(db);
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return h;
  await settle(() => !!h.doc.getElementById('sec-calendar') && !!h.doc.getElementById('sec-dayplan'));
  return h;
}
/* чекбоксът на пренесения ред в КАЛЕНДАРА (data-orig го отличава от собствения) */
function carriedCb(h, tid) {
  const cal = h.doc.getElementById('sec-calendar');
  if (!cal) return null;
  return Array.prototype.find.call(cal.querySelectorAll('input[data-tid="' + tid + '"]'),
    c => !!c.getAttribute('data-orig')) || null;
}
const writes = h => h.calls.post.length + h.calls.patch.length;

(async function () {

  section('1. Пренесена photo_comment задача отваря МОДАЛА, не записва');
  {
    const db = freshDb();
    const h = await view(db);
    const cb = carriedCb(h, 't-pc');
    if (ok('пренесеният чекбокс е намерен', !!cb, txt(h.doc.getElementById('sec-calendar')).slice(0, 200))) {
      ok('носи първоначалния ден в data-orig', cb.getAttribute('data-orig') === TUE, cb.getAttribute('data-orig'));
      const w0 = writes(h);
      cb.checked = true;
      fire(h.w, cb, 'change');
      await settle(() => !!h.doc.getElementById('tc-modal-ov'));
      ok('модалът се отвори', !!h.doc.getElementById('tc-modal-ov'));
      ok('НИЩО не е записано', writes(h) === w0, String(writes(h) - w0));
      ok('чекбоксът е върнат неотметнат', cb.checked === false);
      ok('редът в базата е още отложен',
        db.comps.find(c => c.id === 'c-pc').status === 'postponed',
        db.comps.find(c => c.id === 'c-pc').status);
      ok('модалът иска и снимка, и коментар',
        !!h.doc.getElementById('tc-comment') && txt(h.doc.getElementById('tc-modal-ov')).indexOf('Снимка') >= 0);
    }
  }

  section('2. Без снимка „Потвърди" не записва');
  {
    const db = freshDb();
    const h = await view(db);
    const cb = carriedCb(h, 't-pc');
    cb.checked = true; fire(h.w, cb, 'change');
    await settle(() => !!h.doc.getElementById('tc-modal-ov'));
    const ov = h.doc.getElementById('tc-modal-ov');
    h.doc.getElementById('tc-comment').value = 'Готово, ето я зоната';
    const w0 = writes(h);
    realClick(h.w, H.btn(ov, '✓ Потвърди'), '✓ Потвърди');
    await ticks();
    ok('нула записа без снимка', writes(h) === w0, String(writes(h) - w0));
    ok('обяснява защо', h.calls.toast.some(t => String(t).indexOf('снимка') >= 0),
      JSON.stringify(h.calls.toast));
    ok('модалът остава отворен', !!h.doc.getElementById('tc-modal-ov'));
  }

  section('3. Със снимка и коментар → ПЪРВОНАЧАЛНИЯТ ред се дописва');
  {
    const db = freshDb();
    const h = await view(db);
    const cb = carriedCb(h, 't-pc');
    cb.checked = true; fire(h.w, cb, 'change');
    await settle(() => !!h.doc.getElementById('tc-modal-ov'));
    const ov = h.doc.getElementById('tc-modal-ov');
    h.doc.getElementById('tc-comment').value = 'Готово, ето я зоната';
    /* качването минава през Storage — подменя се само то, останалото е реално */
    h.w.tcPendingPhotos = ['https://example.invalid/palet.jpg'];
    const before = db.comps.length;
    realClick(h.w, H.btn(ov, '✓ Потвърди'), '✓ Потвърди');
    await settle(() => db.comps.find(c => c.id === 'c-pc').status === 'done');
    const row = db.comps.find(c => c.id === 'c-pc');
    ok('първоначалният ред е done', row.status === 'done', row.status);
    ok('completion_date НЕ се мени (ключът на отчетите)', row.completion_date === TUE, String(row.completion_date));
    ok('снимката е в СЪЩИЯ ред', Array.isArray(row.photos) && row.photos.length === 1, JSON.stringify(row.photos));
    ok('коментарът е презаписан с този от модала',
      row.comment === 'Готово, ето я зоната', String(row.comment));
    ok('НЕ е създаден нов ред', db.comps.length === before, (db.comps.length - before) + ' нови');
    ok('модалът е затворен', !h.doc.getElementById('tc-modal-ov'));
  }

  section('4. Пренесена задача БЕЗ изискване си остава един клик');
  {
    const db = freshDb();
    const h = await view(db);
    const cb = carriedCb(h, 't-info');
    if (ok('чекбоксът е намерен', !!cb)) {
      cb.checked = true; fire(h.w, cb, 'change');
      await settle(() => db.comps.find(c => c.id === 'c-info').status === 'done');
      ok('модал НЕ се отваря', !h.doc.getElementById('tc-modal-ov'));
      ok('редът е отметнат направо', db.comps.find(c => c.id === 'c-info').status === 'done');
    }
  }

  section('5. „План за деня": пренесената ПОСТОЯННА минава по пътя на пренесените');
  {
    const db = freshDb();
    const h = await view(db);
    const pl = h.doc.getElementById('sec-dayplan');
    const row = pl && Array.prototype.find.call(pl.querySelectorAll('[data-plan-row]'),
      r => txt(r).indexOf('Ревизия групи') >= 0);
    if (ok('пренесената постоянна е в плана', !!row, txt(pl).slice(0, 220))) {
      const cb = row.querySelector('input[type=checkbox]');
      ok('обработчикът е за пренесени',
        !!cb && /bulCarriedCheckboxChanged/.test(cb.getAttribute('onchange') || ''),
        cb && cb.getAttribute('onchange'));
      ok('data-kind казва „recurring"', !!cb && cb.getAttribute('data-kind') === 'recurring',
        cb && cb.getAttribute('data-kind'));
      ok('data-orig е първоначалният ѝ ден', !!cb && cb.getAttribute('data-orig') === MON,
        cb && cb.getAttribute('data-orig'));
      /* и тя иска модал */
      cb.checked = true; fire(h.w, cb, 'change');
      await settle(() => !!h.doc.getElementById('tc-modal-ov'));
      ok('модалът се отваря и от плана', !!h.doc.getElementById('tc-modal-ov'));
      h.doc.getElementById('tc-comment').value = 'Направено';
      h.w.tcPendingPhotos = ['https://example.invalid/rev.jpg'];
      realClick(h.w, H.btn(h.doc.getElementById('tc-modal-ov'), '✓ Потвърди'), '✓ Потвърди');
      await settle(() => db.comps.find(c => c.id === 'c-rpc').status === 'done');
      const r = db.comps.find(c => c.id === 'c-rpc');
      ok('записът е в реда на ПОСТОЯННАТА, по първоначалния ден',
        r.status === 'done' && r.completion_date === MON, r.status + ' / ' + r.completion_date);
      ok('със снимката', Array.isArray(r.photos) && r.photos.length === 1, JSON.stringify(r.photos));
    }
  }

  section('6. Разотмятането не отваря модал');
  {
    const db = freshDb();
    db.comps.find(c => c.id === 'c-pc').status = 'done';
    db.comps.find(c => c.id === 'c-pc').photos = ['https://example.invalid/old.jpg'];
    const h = await view(db);
    const cb = carriedCb(h, 't-pc');
    if (ok('чекбоксът е отметнат', !!cb && cb.checked)) {
      cb.checked = false;
      fire(h.w, cb, 'change');
      await settle(() => db.comps.find(c => c.id === 'c-pc').status === 'postponed');
      ok('модал НЕ се отваря', !h.doc.getElementById('tc-modal-ov'));
      ok('редът се връща в отложен', db.comps.find(c => c.id === 'c-pc').status === 'postponed');
    }
  }

  section('7. Пренесена задача от ЧУЖД бюлетин: модалът пак я намира');
  {
    /* Обикновена задача, отложена от по-стар бюлетин, не е в bulTasks — идва през
       bulFetchCarriedTasks() в bulCarriedTasks. Ако модалът търси само в
       bulTasks, кликът не прави НИЩО (мълчалив отказ). */
    const db = freshDb();
    db.tasks.push(task('t-old', { title: 'Стара от миналия бюлетин', bulletin_id: 'b-old',
      task_type: 'photo_comment', due_date: MON, due_dates: [MON], sort_order: 5 }));
    db.comps.push({ id: 'c-old', task_id: 't-old', recurring_task_id: null, store_name: 'Троян',
      status: 'postponed', completion_date: MON, postponed_to: WED,
      comment: 'от миналата седмица', photos: null, files: null });
    const h = await view(db);
    ok('задачата НЕ е в bulTasks (чужд бюлетин)',
      h.w.bulTasks.every(t => t.id !== 't-old'), JSON.stringify(h.w.bulTasks.map(t => t.id)));
    ok('дотеглена е в bulCarriedTasks',
      (h.w.bulCarriedTasks || []).some(t => t.id === 't-old'),
      JSON.stringify((h.w.bulCarriedTasks || []).map(t => t.id)));
    const cb = carriedCb(h, 't-old');
    if (ok('пренесеният ѝ ред е в календара', !!cb, txt(h.doc.getElementById('sec-calendar')).slice(0, 220))) {
      cb.checked = true; fire(h.w, cb, 'change');
      await settle(() => !!h.doc.getElementById('tc-modal-ov'));
      const ov = h.doc.getElementById('tc-modal-ov');
      if (ok('модалът се отвори и за нея', !!ov)) {
        ok('носи ПРАВИЛНОТО заглавие', txt(ov).indexOf('Стара от миналия бюлетин') >= 0, txt(ov).slice(0, 160));
        h.doc.getElementById('tc-comment').value = 'Свършено днес';
        h.w.tcPendingPhotos = ['https://example.invalid/old.jpg'];
        realClick(h.w, H.btn(ov, '✓ Потвърди'), '✓ Потвърди');
        await settle(() => db.comps.find(c => c.id === 'c-old').status === 'done');
        const r = db.comps.find(c => c.id === 'c-old');
        ok('записът е в ПЪРВОНАЧАЛНИЯ ѝ ред', r.status === 'done' && r.completion_date === MON,
          r.status + ' / ' + r.completion_date);
        ok('със снимката и коментара',
          Array.isArray(r.photos) && r.photos.length === 1 && r.comment === 'Свършено днес',
          JSON.stringify([r.photos, r.comment]));
      }
    }
  }

  report();
})();
