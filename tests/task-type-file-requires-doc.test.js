/* Задача от вид „документ" не минава без документ.

   ДЕФЕКТЪТ. Двете функции, които маршрутизират чекбокса, питаха само за две
   от трите изисквания:

     if (!tt || (!tt.needsPhoto && !tt.needsComment)) { toggleTask(...); return; }

   TASK_TYPES.file е needsPhoto:false, needsComment:false, needsFile:true —
   тоест „Потвърждение с документ" падаше в клона „отмятай направо" и
   чекбоксът записваше изпълнение, без изобщо да отвори модала. Проверката в
   submitTaskCompletion („Добави поне 1 документ") си беше на място и вярна,
   но до нея не се стигаше. Вид file_comment минаваше само защото носи и
   needsComment.

   Цената: постоянната задача „ЗАРЕЖДАНЕ КОЛОРАНТИ и АРТИКУЛИ на Л.М." (вид
   file) е отметната 50 пъти (17 обекта на 31.08, 17 на 24.08, 16 на 17.08)
   при ЕДИН качен документ.

   ⚠️ ЗАЩО ТЕСТЪТ КЛИКА, А НЕ ЧЕТЕ MARKUP. Точно тук четенето на кода лъже:
   модалът е написан правилно (openTaskCompletionModal рисува „Документ *"
   при needsFile) и валидацията е написана правилно. Счупен беше само пътят
   между тях. Тест, който вика openTaskCompletionModal() директно — какъвто е
   task-completion-files.test.js — минава и срещу счупения портал. Затова тук
   се стига до модала САМО през истински click() по чекбокса в рендирания
   DOM: jsdom сам обръща .checked и сам разнася събитието change, а
   обработчикът от onchange атрибута е закачен като истински слушател.

   Пускане: node tests/task-type-file-requires-doc.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, ticks } = H;

/* ── Днешният ден: само тогава чекбоксът е отключен ──────────────────────── */
const TODAY = (function () {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
})();
/* 0=Пон..6=Нед — индексът, който due_weekdays ползва. */
const IDX_TODAY = (new Date().getDay() + 6) % 7;

const STORE = 'Троян';

function task(id, type) {
  return {
    id: id, title: 'Задача ' + id, description: '', department: 'trade',
    task_type: type, due_dates: [TODAY], target_stores: [STORE], linked_module: null
  };
}
function rec(id, type) {
  return {
    id: id, title: 'Постоянна ' + id, description: '', department: 'trade',
    task_type: type, due_weekdays: [IDX_TODAY], due_time: '09:00',
    target_stores: [STORE], linked_module: null, active: true
  };
}

function env() {
  const h = boot({
    modules: ['bulletin.js'],
    user: { email: 'm@temax.bg', display_name: 'Управител', role: 'manager', store_name: STORE },
    data: { users: [{ store_name: STORE }], stores: [{ name: STORE }] }
  });
  const w = h.w;
  const cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });
  w.curBul = {
    id: 'b-1', week_number: w.weekNum(new Date()), year: new Date().getFullYear(),
    status: 'published',
    content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } }
  };
  w.bulListCache = [];
  w.bulComps = [];
  w.recurringComps = [];
  w.allStoresCache = [STORE];
  w.bulTasks = [
    task('t-file', 'file'),
    task('t-info', 'info'),
    task('t-fc', 'file_comment'),
    task('t-photo', 'photo')
  ];
  w.recurringTasks = [
    rec('r-file', 'file'),
    rec('r-info', 'info')
  ];
  return h;
}

/* ── ИСТИНСКИ клик по чекбокс ────────────────────────────────────────────
   harness-ът зарежда портала с runScripts:'outside-only', затова jsdom НЕ
   изпълнява inline onchange сам по себе си. Закачаме атрибута като истински
   слушател и после кликаме — така .checked се обръща от самия DOM, точно
   както при мишка, а обработчикът вижда състоянието, което браузърът би му
   подал. Разликата с `cb.checked=true; fire(...)` не е козметична: тя
   доказва и че обработчикът ВРЪЩА чекбокса назад. */
function clickCb(w, cb) {
  if (!cb) throw new Error('чекбоксът не съществува');
  const code = cb.getAttribute('onchange');
  if (!code) throw new Error('чекбоксът няма onchange: ' + cb.outerHTML.slice(0, 160));
  const handler = w.eval('(function(el){ (function(){' + code + '}).call(el); })');
  const listener = function () { handler(cb); };
  cb.addEventListener('change', listener);
  try { cb.click(); } finally { cb.removeEventListener('change', listener); }
}

function cbFor(doc, attr, id) {
  return Array.prototype.slice.call(
    doc.querySelectorAll('input[type=checkbox][' + attr + '="' + id + '"]')
  ).filter(c => c.disabled === false)[0] || null;
}
function modal(doc) { return doc.getElementById('tc-modal-ov'); }
function comps(calls) {
  return calls.post.filter(p => p.table === 'task_completions')
    .concat(calls.patch.filter(p => p.table === 'task_completions'));
}

(async function run() {

  /* ═══ 0. Котвата на дефекта ═══════════════════════════════════════════ */
  section('0. Видът file изисква документ и нищо друго');
  {
    const { w } = env();
    const T = w.TASK_TYPES.file;
    ok('file: needsFile е true', T.needsFile === true);
    ok('file: needsPhoto и needsComment са false',
      T.needsPhoto === false && T.needsComment === false);
    /* Именно тази комбинация правеше стария израз „нищо не се иска". */
    ok('старият израз (!needsPhoto && !needsComment) би дал ИСТИНА за file',
      (!T.needsPhoto && !T.needsComment) === true);
  }

  /* ═══ 1. Постоянна задача (случаят от живо) ═══════════════════════════ */
  section('1. ПОСТОЯННА задача file: кликът отваря модала, не записва');
  {
    const h = env();
    const { w, doc, calls } = h;
    if (guard('renderBulView() не хвърля', () => w.renderBulView())) {
      const cb = cbFor(doc, 'data-rtid', 'r-file');
      if (ok('чекбоксът на постоянната задача е рендиран и отключен', !!cb)) {
        ok('преди клика е незачекнат', cb.checked === false);
        guard('кликът не хвърля', () => clickCb(w, cb));
        await ticks();
        ok('модалът СЕ ОТВАРЯ', !!modal(doc));
        ok('чекбоксът се връща в незачекнато състояние', cb.checked === false);
        ok('НЕ се записва изпълнение', comps(calls).length === 0,
          JSON.stringify(calls.post.map(p => p.table)));
        if (modal(doc)) {
          ok('модалът иска ДОКУМЕНТ',
            !!modal(doc).querySelector('input[type=file][accept*=".pdf"]'));
          ok('и не иска снимка',
            !modal(doc).querySelector('input[type=file][accept*=".jpg"]'));
        }
      }
    }
  }

  /* ═══ 2. Еднократна задача ═══════════════════════════════════════════ */
  section('2. ЕДНОКРАТНА задача file: същото');
  {
    const h = env();
    const { w, doc, calls } = h;
    if (guard('renderBulView() не хвърля', () => w.renderBulView())) {
      const cb = cbFor(doc, 'data-tid', 't-file');
      if (ok('чекбоксът на еднократната задача е рендиран и отключен', !!cb)) {
        guard('кликът не хвърля', () => clickCb(w, cb));
        await ticks();
        ok('модалът СЕ ОТВАРЯ', !!modal(doc));
        ok('чекбоксът се връща в незачекнато състояние', cb.checked === false);
        ok('НЕ се записва изпълнение', comps(calls).length === 0,
          JSON.stringify(calls.post.map(p => p.table)));
      }
    }
  }

  /* ═══ 3. Потвърди без документ ═══════════════════════════════════════ */
  section('3. „Потвърди" без качен документ не записва нищо');
  {
    const h = env();
    const { w, doc, calls } = h;
    w.renderBulView();
    const cb = cbFor(doc, 'data-rtid', 'r-file');
    if (ok('чекбоксът е намерен', !!cb)) {
      clickCb(w, cb);
      await ticks();
      const ov = modal(doc);
      if (ok('модалът е отворен', !!ov)) {
        const potv = btn(ov, 'Потвърди');
        if (ok('бутонът „Потвърди" съществува', !!potv)) {
          guard('кликът по „Потвърди" не хвърля', () => realClick(w, potv));
          await ticks();
          ok('казва какво липсва',
            calls.toast.some(t => /Добави поне 1 документ/.test(t)),
            calls.toast.join(' | '));
          ok('модалът ОСТАВА отворен', !!modal(doc));
          ok('изпълнение НЕ се записва', comps(calls).length === 0,
            JSON.stringify(calls.post.map(p => p.table)));
        }
      }
    }
  }

  /* ═══ 4. КОНТРОЛА: info се отмята направо ════════════════════════════ */
  section('4. КОНТРОЛА: info продължава да се отмята без модал');
  {
    const h = env();
    const { w, doc, calls } = h;
    w.renderBulView();
    const cb = cbFor(doc, 'data-tid', 't-info');
    if (ok('чекбоксът на info е намерен', !!cb)) {
      guard('кликът не хвърля', () => clickCb(w, cb));
      await ticks();
      ok('модал НЕ се отваря', !modal(doc));
      ok('чекбоксът остава зачекнат', cb.checked === true);
      const p = comps(calls)[0];
      if (ok('изпълнението СЕ записва', !!p, JSON.stringify(calls.post.map(x => x.table)))) {
        ok('без документ и без снимка', p.body.files === null && p.body.photos === null,
          JSON.stringify([p.body.files, p.body.photos]));
      }
    }
  }
  {
    const h = env();
    const { w, doc, calls } = h;
    w.renderBulView();
    const cb = cbFor(doc, 'data-rtid', 'r-info');
    if (ok('постоянна info: чекбоксът е намерен', !!cb)) {
      guard('кликът не хвърля', () => clickCb(w, cb));
      await ticks();
      ok('постоянна info: модал НЕ се отваря', !modal(doc));
      /* Постоянните задачи пишат в СЪЩАТА таблица task_completions — само че
         с recurring_task_id вместо task_id. */
      const rp = comps(calls)[0];
      if (ok('постоянна info: изпълнението се записва', !!rp,
        JSON.stringify(calls.post.map(p => p.table)))) {
        ok('постоянна info: записът е по recurring_task_id',
          rp.body.recurring_task_id === 'r-info', JSON.stringify(rp.body));
      }
    }
  }

  /* ═══ 5. КОНТРОЛА: видовете, които и преди отваряха модала ═══════════ */
  section('5. КОНТРОЛА: file_comment и photo не са променени');
  {
    const h = env();
    const { w, doc, calls } = h;
    w.renderBulView();
    const cb = cbFor(doc, 'data-tid', 't-fc');
    if (ok('чекбоксът на file_comment е намерен', !!cb)) {
      guard('кликът не хвърля', () => clickCb(w, cb));
      await ticks();
      ok('file_comment: модалът се отваря', !!modal(doc));
      ok('file_comment: чекбоксът се връща назад', cb.checked === false);
      ok('file_comment: няма запис', comps(calls).length === 0);
      if (modal(doc)) {
        ok('file_comment: иска и документ, и коментар',
          !!modal(doc).querySelector('input[type=file][accept*=".pdf"]') &&
          !!doc.getElementById('tc-comment'));
      }
    }
  }
  {
    const h = env();
    const { w, doc, calls } = h;
    w.renderBulView();
    const cb = cbFor(doc, 'data-tid', 't-photo');
    if (ok('чекбоксът на photo е намерен', !!cb)) {
      guard('кликът не хвърля', () => clickCb(w, cb));
      await ticks();
      ok('photo: модалът се отваря', !!modal(doc));
      ok('photo: няма запис', comps(calls).length === 0);
    }
  }

  /* ═══ 6. Разотмятането си остава директно ════════════════════════════ */
  section('6. Разотмятане на задача file НЕ пита повторно за документ');
  {
    const h = env();
    const { w, doc, calls } = h;
    w.bulComps = [{
      task_id: 't-file', store_name: STORE, status: 'done',
      completed_by: 'Управител', completion_date: TODAY,
      files: [{ url: 'http://x/1.pdf', filename: 'справка.pdf' }]
    }];
    w.renderBulView();
    const cb = cbFor(doc, 'data-tid', 't-file');
    if (ok('отметнатият чекбокс е намерен', !!cb)) {
      ok('и е зачекнат', cb.checked === true);
      guard('кликът не хвърля', () => clickCb(w, cb));
      await ticks();
      ok('модал НЕ се отваря', !modal(doc));
      ok('изтриването тръгва',
        calls.del.some(u => u.indexOf('task_completions') >= 0), calls.del.join(' | '));
    }
  }

  report();
})();
