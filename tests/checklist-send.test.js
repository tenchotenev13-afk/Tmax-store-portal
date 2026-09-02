/* Чек лист — изпращането.

   ВСИЧКИ кликове са ИСТИНСКИ (element.click()). Затова бутонът и контролите
   в прозорчето се закачат със слушатели: inline onclick не се изпълнява при
   element.click() под jsdom с runScripts:'outside-only'.

   Три неща, всяко от които е било грешка някъде другаде в портала:

   1. ПО ЕДНО ПИСМО НА ПОЛУЧАТЕЛ. Едно писмо с осемнайсет адреса в „До" е
      една заявка вместо осемнайсет — и всеки обект вижда адресите на
      останалите. Тестът брои повикванията и проверява, че всяко носи ТОЧНО
      един адрес.

   2. recipients = САМО УСПЕЛИТЕ. Записът е „кой Е получил", не „кой беше
      избран". Запишат ли се всички независимо от изхода, дневникът твърди,
      че писмо е стигнало до обект, който никога не го е видял — и никой
      няма как да разбере, защото редът изглежда наред.

   3. НУЛА УСПЕЛИ → НУЛА РЕДОВЕ. Изпращане, което не е станало, не бива да
      заема номер на версия.

   Пускане:  node tests/checklist-send.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const METRICS = [
  { key:'revizia_953', label:'ревизия', sublabel:'953', value_type:'yes_no', sort_order:1, active:true, source:'manual' },
  { key:'preocenka',   label:'преоценка', sublabel:'', value_type:'yes_no_none', sort_order:2, active:true, source:'manual' }
];

/* Пет обекта, всеки с управител и склад — точно както е в базата. Взима се
   управителят. Кърджали има ДВА управителски акаунта, единият личен gmail:
   служебният трябва да победи. */
const USERS = [
  { store_name:'Враца',    email:'sklad.vratsa@temax.bg',   role:'sklad',   active:true },
  { store_name:'Враца',    email:'managervraca@temax.bg',   role:'manager', active:true },
  { store_name:'Габрово',  email:'managergabrovo@temax.bg', role:'manager', active:true },
  { store_name:'Добрич',   email:'managerdobrich@temax.bg', role:'manager', active:true },
  { store_name:'Кърджали', email:'tencho.tenev13@gmail.com', role:'manager', active:true },
  { store_name:'Кърджали', email:'managerkardjali@temax.bg', role:'manager', active:true },
  { store_name:'Шумен',    email:'managershumen@temax.bg',  role:'manager', active:true },
  /* Не отчетни — не бива да влизат. */
  { store_name:'Централен офис', email:'co@temax.bg', role:'admin', active:true },
  { store_name:'Логистичен склад Добрич', email:'ls@temax.bg', role:'sklad', active:true }
];

const STORE_NAMES = ['Враца', 'Габрово', 'Добрич', 'Кърджали', 'Шумен'];

const ADMIN   = { id:'u-1', email:'c.teneva@temax.bg', display_name:'Ц. Тенева', role:'admin',   store_name:'Централен офис' };
const MANAGER = { id:'u-2', email:'managershumen@temax.bg', display_name:'Шумен', role:'manager', store_name:'Шумен' };

function env(opts) {
  opts = opts || {};
  return boot({
    modules: ['bulletin.js', 'checklist.js'],
    user: opts.user || ADMIN,
    data: {
      users: USERS,
      weekly_checklist_metrics: METRICS,
      weekly_checklist: opts.rows || [],
      weekly_checklist_sends: opts.sends || [],
      recurring_tasks: [], task_completions: []
    }
  });
}

/* Подменя sendEmail с наблюдател. failFor е списък адреси, чиито писма
   падат — така се симулира „две от пет". */
function stubSend(h, failFor) {
  const calls = [];
  h.w.sendEmail = function (to, subject, html) {
    calls.push({ to: to, subject: subject, html: html });
    const addr = Array.isArray(to) ? to[0] : to;
    const bad = !!(failFor && failFor.indexOf(addr) >= 0);
    return Promise.resolve({ ok: !bad, status: bad ? 500 : 200, data: {} });
  };
  return calls;
}

function sendBtn(h) { return h.doc.getElementById('cl-send-btn'); }
function sendRows(h) {
  return h.calls.post.filter(function (p) {
    return (p.url || '').indexOf('/weekly_checklist_sends') >= 0;
  });
}
function checkboxes(h) {
  return Array.prototype.slice.call(h.doc.querySelectorAll('.cl-send-cb'));
}
async function openModal(h) {
  sendBtn(h).click();
  await ticks(); await ticks();
}
async function doSend(h) {
  h.doc.getElementById('cl-send-go').click();
  await ticks(); await ticks(); await ticks();
}

(async function () {

  /* ── 1. Първо изпращане ──────────────────────────────────────────────── */
  section('1. Първо изпращане: версия 1, без бележка, без „последно"');
  {
    const h = env();
    h.w.loadChecklist(); await ticks();
    const mails = stubSend(h);

    if (ok('бутонът съществува', !!sendBtn(h))) {
      ok('надписът е „Изпрати", не „Изпрати поправка"',
         sendBtn(h).textContent.indexOf('Изпрати поправка') < 0 &&
         sendBtn(h).textContent.indexOf('Изпрати') >= 0,
         sendBtn(h).textContent);

      await openModal(h);
      ok('прозорчето се отвори', !!h.doc.getElementById('cl-send-go'));
      ok('НЯМА поле за бележка при първо изпращане',
         !h.doc.getElementById('cl-send-note'));
      ok('НЯМА ред „Последно изпратено"',
         !h.doc.getElementById('cl-send-last'));
      ok('петте обекта са в списъка', checkboxes(h).length === 5,
         'реално: ' + checkboxes(h).length);
      ok('всички са отметнати по подразбиране',
         checkboxes(h).every(function (c) { return c.checked; }));

      await doSend(h);

      const rows = sendRows(h);
      if (ok('записан е ЕДИН ред', rows.length === 1, 'реално: ' + rows.length)) {
        const b = rows[0].body;
        ok('версия 1', b.version === 1, JSON.stringify(b.version));
        ok('sent_by е името на изпращача', b.sent_by === 'Ц. Тенева', b.sent_by);
        ok('recipients са петте адреса', (b.recipients || []).length === 5,
           JSON.stringify(b.recipients));
        ok('note е null при първо изпращане', b.note === null, JSON.stringify(b.note));
        ok('year и week са на показаната седмица',
           b.year === h.w.checklistYear && b.week_number === h.w.checklistWeek,
           b.year + '/' + b.week_number);
      }
    }
    h.close();
  }

  /* ── 2. Кой получава ─────────────────────────────────────────────────── */
  section('2. По ЕДНО писмо на получател, правилният адрес');
  {
    const h = env();
    h.w.loadChecklist(); await ticks();
    const mails = stubSend(h);
    await openModal(h);
    await doSend(h);

    ok('пет повиквания на sendEmail, не едно', mails.length === 5,
       'реално: ' + mails.length);
    ok('всяко носи ТОЧНО един адрес',
       mails.every(function (m) { return Array.isArray(m.to) && m.to.length === 1; }),
       JSON.stringify(mails.map(function (m) { return m.to; })));

    const addrs = mails.map(function (m) { return m.to[0]; }).sort();
    ok('взима се управителят, не складът',
       addrs.indexOf('managervraca@temax.bg') >= 0 && addrs.indexOf('sklad.vratsa@temax.bg') < 0,
       addrs.join(', '));
    ok('при два управителя печели служебният адрес',
       addrs.indexOf('managerkardjali@temax.bg') >= 0 &&
       addrs.indexOf('tencho.tenev13@gmail.com') < 0, addrs.join(', '));
    ok('ЦО и складът не получават',
       addrs.indexOf('co@temax.bg') < 0 && addrs.indexOf('ls@temax.bg') < 0,
       addrs.join(', '));
    ok('темата носи седмицата',
       (mails[0].subject || '').indexOf('Седмица ' + h.w.checklistWeek) >= 0, mails[0].subject);
    ok('тялото е готовото писмо', (mails[0].html || '').indexOf('<!DOCTYPE html>') === 0);
    h.close();
  }

  /* ── 3. Поправка ─────────────────────────────────────────────────────── */
  section('3. Второ изпращане: версия 2, бележка, предишното се показва');
  {
    const h = env({ sends: [
      { id:'s-1', year:2026, week_number:35, version:1,
        sent_at:'2026-08-28T09:15:00Z', sent_by:'М. Павлова', recipients:['a@b.bg'], note:null }
    ]});
    h.w.loadChecklist(); await ticks();
    const mails = stubSend(h);

    ok('надписът става „Изпрати поправка"',
       sendBtn(h).textContent.indexOf('Изпрати поправка') >= 0, sendBtn(h).textContent);

    await openModal(h);
    const lastLine = h.doc.getElementById('cl-send-last');
    if (ok('редът „Последно изпратено" го има', !!lastLine)) {
      ok('носи датата', lastLine.textContent.indexOf('28.08.2026') >= 0, lastLine.textContent);
      ok('носи версията', lastLine.textContent.indexOf('версия 1') >= 0, lastLine.textContent);
      ok('носи името на изпращача', lastLine.textContent.indexOf('М. Павлова') >= 0, lastLine.textContent);
    }
    const note = h.doc.getElementById('cl-send-note');
    if (ok('полето за бележка го има', !!note)) {
      note.value = 'поправена Враца';
    }

    await doSend(h);
    const rows = sendRows(h);
    if (ok('записан е ред', rows.length === 1, 'реално: ' + rows.length)) {
      ok('версия 2', rows[0].body.version === 2, JSON.stringify(rows[0].body.version));
      ok('бележката е записана', rows[0].body.note === 'поправена Враца',
         JSON.stringify(rows[0].body.note));
    }
    ok('темата казва, че е поправка',
       (mails[0].subject || '').indexOf('поправка 2') >= 0, mails[0].subject);
    h.close();
  }

  /* ── 4. Махнат обект ─────────────────────────────────────────────────── */
  section('4. Махнат от списъка: без писмо и без ред в recipients');
  {
    const h = env();
    h.w.loadChecklist(); await ticks();
    const mails = stubSend(h);
    await openModal(h);

    /* Маха се Габрово — истински клик по отметката. */
    const cbs = checkboxes(h);
    const idx = cbs.map(function (c) {
      return c.parentNode.textContent.indexOf('Габрово') >= 0;
    }).indexOf(true);
    if (ok('отметката на Габрово е намерена', idx >= 0)) {
      cbs[idx].checked = false;
      cbs[idx].dispatchEvent(new h.w.Event('change'));
      await ticks();
    }
    await doSend(h);

    const addrs = mails.map(function (m) { return m.to[0]; });
    ok('четири писма, не пет', mails.length === 4, 'реално: ' + mails.length);
    ok('Габрово НЕ получава писмо',
       addrs.indexOf('managergabrovo@temax.bg') < 0, addrs.join(', '));
    const rows = sendRows(h);
    if (ok('записан е ред', rows.length === 1)) {
      ok('recipients са четири', (rows[0].body.recipients || []).length === 4,
         JSON.stringify(rows[0].body.recipients));
      ok('Габрово не е в recipients',
         (rows[0].body.recipients || []).indexOf('managergabrovo@temax.bg') < 0,
         JSON.stringify(rows[0].body.recipients));
    }
    h.close();
  }

  /* ── 5. Частичен провал ──────────────────────────────────────────────── */
  section('5. Две от пет падат: записват се ТРИТЕ успели');
  {
    const h = env();
    h.w.loadChecklist(); await ticks();
    const mails = stubSend(h, ['managervraca@temax.bg', 'managershumen@temax.bg']);
    h.calls.toast.length = 0;
    await openModal(h);
    await doSend(h);

    ok('и петте са опитани', mails.length === 5, 'реално: ' + mails.length);
    const rows = sendRows(h);
    if (ok('записан е ред', rows.length === 1, 'реално: ' + rows.length)) {
      const rec = rows[0].body.recipients || [];
      ok('recipients са ТРИ, не пет', rec.length === 3, JSON.stringify(rec));
      ok('провалените НЕ са вътре',
         rec.indexOf('managervraca@temax.bg') < 0 && rec.indexOf('managershumen@temax.bg') < 0,
         JSON.stringify(rec));
      ok('успелите СА вътре',
         rec.indexOf('managergabrovo@temax.bg') >= 0 &&
         rec.indexOf('managerdobrich@temax.bg') >= 0 &&
         rec.indexOf('managerkardjali@temax.bg') >= 0, JSON.stringify(rec));
    }
    ok('излязъл е toast', h.calls.toast.length > 0, JSON.stringify(h.calls.toast));
    ok('toast-ът казва колко са минали и колко не',
       h.calls.toast.join(' ').indexOf('3') >= 0 && h.calls.toast.join(' ').indexOf('2') >= 0,
       JSON.stringify(h.calls.toast));
    h.close();
  }

  /* ── 6. Нула успели ──────────────────────────────────────────────────── */
  section('6. Нито едно писмо не тръгва: НЕ се записва ред');
  {
    const h = env();
    h.w.loadChecklist(); await ticks();
    const all = ['managervraca@temax.bg', 'managergabrovo@temax.bg', 'managerdobrich@temax.bg',
                 'managerkardjali@temax.bg', 'managershumen@temax.bg'];
    const mails = stubSend(h, all);
    h.calls.toast.length = 0;
    await openModal(h);
    await doSend(h);

    ok('и петте са опитани', mails.length === 5, 'реално: ' + mails.length);
    ok('НУЛА реда в weekly_checklist_sends', sendRows(h).length === 0,
       'реално: ' + sendRows(h).length + ' → ' +
       JSON.stringify(sendRows(h).map(function (r) { return r.body; })));
    ok('излязъл е toast', h.calls.toast.length > 0, JSON.stringify(h.calls.toast));
    ok('бутонът пак работи след провала',
       !!sendBtn(h) && !sendBtn(h).hasAttribute('disabled'),
       sendBtn(h) ? sendBtn(h).outerHTML.slice(0, 90) : 'няма бутон');
    h.close();
  }

  /* ── 7. Роля без права ───────────────────────────────────────────────── */
  section('7. manager: бутонът го няма');
  {
    /* Като manager табът изобщо не се рендира. */
    const h = env({ user: MANAGER });
    h.w.loadChecklist(); await ticks();
    ok('няма бутон при manager', !sendBtn(h));
    ok('няма и таблица (табът е без достъп)', !h.doc.getElementById('checklist-table'));
    h.close();

    /* И по-строгото: мрежата е рендирана като admin, после потребителят се
       сменя и се пререндира — бутонът трябва да изчезне. Иначе проверката
       минава заради липсващ таб, не заради правило. */
    const h2 = env();
    h2.w.loadChecklist(); await ticks();
    ok('като admin бутонът е тук', !!sendBtn(h2));
    h2.w.currentUser = MANAGER;
    h2.w.renderChecklist();
    ok('след смяна на потребителя бутонът изчезва', !sendBtn(h2));
    ok('canEditChecklist() = false', h2.w.canEditChecklist() === false);
    h2.close();
  }

  /* ── 8. Двоен клик ───────────────────────────────────────────────────── */
  section('8. Докато тече изпращане, бутонът мълчи');
  {
    const h = env();
    h.w.loadChecklist(); await ticks();
    const mails = stubSend(h);
    await openModal(h);

    /* Два клика по „Изпрати" в прозорчето, без изчакване между тях. */
    const go = h.doc.getElementById('cl-send-go');
    go.click();
    go.click();
    await ticks(); await ticks(); await ticks();

    ok('пет писма, не десет', mails.length === 5, 'реално: ' + mails.length);
    ok('ЕДИН ред, не два', sendRows(h).length === 1, 'реално: ' + sendRows(h).length);
    h.close();
  }

  report();
})();
