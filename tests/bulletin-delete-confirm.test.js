/* БЮЛЕТИН: ПОТВЪРЖДЕНИЕ ПРЕДИ ИЗТРИВАНЕ НА ФАЙЛ / СЪБИТИЕ + „ДО 5 ДНИ".

   Осем ✕ бутона трият с едно натискане: файл и снимка в блок (bulRemoveBlockFile, bulClearImg, bulClearFile), файл на събитие,
   файл на постоянна задача, на задача, на под-задача и самото събитие.
   Всички питат с confirm(), който назовава файла / заглавието.
   Отказ → нищо не се променя, няма PATCH/POST/DELETE.

   Текстът за изтичащи промоции казва „до 5 дни" — колкото е прагът в
   promoStatus() (≤5). Прагът не е пипан.

   Часовникът: петък 18.09.2026 12:00 (С38).
   Пускане:  node tests/bulletin-delete-confirm.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const NOW = new Date(2026, 8, 18, 12, 0).getTime();
function freezeAt(w, ms) {
  const Real = w.Date;
  w.Date = class extends Real {
    constructor(...a) { if (a.length === 0) super(ms); else super(...a); }
    static now() { return ms; }
  };
}

const ATT = [{ type: 'file', url: 'http://x/a.pdf', filename: 'Договор.pdf' },
             { type: 'file', url: 'http://x/b.pdf', filename: 'Анекс.pdf' }];
const copyAtt = () => ATT.map(a => Object.assign({}, a));
const KEY = '2026-09-18';

function env(confirmFn, promos) {
  const h = boot({ modules: ['bulletin.js', 'push.js'], user: ADMIN, data: {}, confirm: confirmFn });
  const w = h.w;
  freezeAt(w, NOW);
  const b = { id: 'b-38', week_number: 38, year: 2026, status: 'draft', created_at: '2026-09-10T08:00:00Z',
    content: { calendar: {}, columns: { trade: [{ id: 'blk1', type: 'file', file_url: 'http://x/f.xlsx', file_name: 'Цени.xlsx' }, { id: 'blk2', type: 'image', url: 'http://x/i.png', filename: 'Витрина.png' }, { id: 'blk3', type: 'file', url: 'http://x/g.pdf', filename: 'Наредба.pdf' }], warehouse: [], admin: [] } } };
  w.DKEYS.forEach(k => { b.content.calendar[k] = []; });
  b.content.calendar[KEY] = [{ title: 'Инвентаризация Троян', dept: 'trade', attachments: copyAtt() }];
  ['bulletin_tasks', 'recurring_tasks', 'recurring_task_periods', 'recurring_task_skips', 'task_completions',
   'task_subtasks', 'subtask_completions', 'notification_schedules', 'users'].forEach(t => h.setData(t, []));
  h.setData('bulletins', [b]);
  h.setData('bulletin_promotions', promos || []);
  w.bulPromotions = promos || [];
  w.curBul = b;
  w.bulTasks = [{ id: 't1', title: 'Задача', department: 'trade', attachments: copyAtt() }];
  w.recurringTasks = [{ id: 'r1', title: 'Постоянна', department: 'trade', attachments: copyAtt() }];
  return { h, w, doc: h.doc, b, calls: h.calls };
}
const writes = E => E.calls.patch.length + E.calls.post.length + E.calls.del.length;

/* Клик по ИСТИНСКИ бутон от рендера, ако го има; иначе — бутон с точно онзи
   onclick, който кодът генерира (същият низ като в изходния файл). */
function clickBtn(E, c) {
  let el = Array.from(E.doc.querySelectorAll('button[onclick]')).find(x => x.getAttribute('onclick').indexOf(c.needle) === 0);
  const real = !!el;
  if (!el) {
    el = E.doc.createElement('button');
    Object.keys(c.attrs).forEach(k => el.setAttribute(k, c.attrs[k]));
    E.doc.body.appendChild(el);
  }
  realClick(E.w, el, c.needle);
  return real;
}

const CASES = [
  { name: 'файл в блок', needle: 'bulRemoveBlockFile', file: 'Цени.xlsx',
    attrs: { 'data-col': 'trade', 'data-id': 'blk1', onclick: 'bulRemoveBlockFile(this.dataset.col,this.dataset.id)' },
    changed: E => E.b.content.columns.trade[0].file_url !== 'http://x/f.xlsx' },
  { name: 'снимка в блок', needle: 'bulClearImg', file: 'Витрина.png',
    attrs: { 'data-col': 'trade', 'data-id': 'blk2', onclick: 'bulClearImg(this)' },
    changed: E => E.b.content.columns.trade[1].url !== 'http://x/i.png' },
  { name: 'файл (url) в блок', needle: 'bulClearFile', file: 'Наредба.pdf',
    attrs: { 'data-col': 'trade', 'data-id': 'blk3', onclick: 'bulClearFile(this)' },
    changed: E => E.b.content.columns.trade[2].url !== 'http://x/g.pdf' },
  { name: 'файл на събитие', needle: 'calRemoveAttachment', file: 'Договор.pdf',
    attrs: { 'data-key': KEY, 'data-idx': '0', 'data-aidx': '0', onclick: 'calRemoveAttachment(this)' },
    changed: E => E.b.content.calendar[KEY][0].attachments.length !== 2 },
  { name: 'файл на постоянна задача', needle: 'recurringRemoveAttachment', file: 'Договор.pdf',
    attrs: { onclick: "recurringRemoveAttachment('r1','0')" },
    changed: E => E.w.recurringTasks[0].attachments.length !== 2 },
  { name: 'файл на задача', needle: 'taskRemoveAttachment', file: 'Договор.pdf',
    attrs: { onclick: "taskRemoveAttachment('t1','0')" },
    changed: E => E.w.bulTasks[0].attachments.length !== 2 },
  { name: 'файл на под-задача', needle: 'subtaskRemoveAttachment', file: 'Договор.pdf',
    attrs: { onclick: "subtaskRemoveAttachment('s1','0','t1')" },
    prep: E => { E.h.setData('task_subtasks', [{ id: 's1', task_id: 't1', attachments: copyAtt() }]); },
    changed: () => false, patchOnly: true },
  { name: 'самото събитие', needle: 'bulRmCal', file: 'Инвентаризация Троян',
    attrs: { 'data-key': KEY, 'data-idx': '0', onclick: 'bulRmCal(this)' },
    changed: E => E.b.content.calendar[KEY].length !== 1 }
];

(async function run() {
  for (const c of CASES) {
    section(c.name + ': отказ → нищо; потвърждение → изтрито');
    {
      const E = env(() => false);
      if (c.prep) c.prep(E);
      guard('renderBulletin()', () => E.w.renderBulletin());
      const real = clickBtn(E, c);
      await ticks(); await ticks();
      ok('питаше точно веднъж', E.calls.confirm.length === 1, JSON.stringify(E.calls.confirm));
      ok('въпросът назовава „' + c.file + '"', (E.calls.confirm[0] || '').indexOf(c.file) >= 0, E.calls.confirm[0]);
      ok('отказ: нищо не е променено в паметта', !c.changed(E));
      ok('отказ: няма заявка към базата', writes(E) === 0, JSON.stringify(E.calls.patch));
      console.log('   (бутон от реален рендер: ' + real + ')');
    }
    {
      const E = env(() => true);
      if (c.prep) c.prep(E);
      guard('renderBulletin()', () => E.w.renderBulletin());
      clickBtn(E, c);
      await ticks(); await ticks();
      ok('потвърждение: питаше веднъж', E.calls.confirm.length === 1);
      if (c.patchOnly) {
        const body = JSON.stringify(E.calls.patch);
        ok('потвърждение: PATCH с останал само втория файл',
          E.calls.patch.length === 1 && body.indexOf('Анекс.pdf') >= 0 && body.indexOf('Договор.pdf') < 0, body);
      } else ok('потвърждение: изтрито както преди', c.changed(E));
    }
  }

  section('Файл с индекс 1: въпросът назовава втория');
  {
    const E = env(() => false);
    E.w.taskRemoveAttachment('t1', '1');
    ok('Анекс.pdf', (E.calls.confirm[0] || '').indexOf('Анекс.pdf') >= 0, E.calls.confirm[0]);
  }

  section('Промоции: „до 5 дни" при 1 и при няколко');
  {
    const day = n => { const d = new Date(NOW); d.setDate(d.getDate() + n);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const P = (id, t, e) => ({ id, title: t, start_date: day(-10), end_date: e, active: true });
    const one = env(() => true, [P('p1', 'Боя', day(1)), P('p2', 'Далечна', day(30))]);
    guard('renderBulletin()', () => one.w.renderBulletin());
    const sec1 = one.doc.getElementById('sec-promo');
    const t1 = sec1 ? sec1.textContent : '';
    ok('банер: 1 промоция изтича до 5 дни', /1 промоция изтича до 5 дни/.test(t1), t1.slice(0, 200));
    ok('банерът не казва „3 дни"', t1.indexOf('3 дни') < 0);
    const m1 = one.w.composePromoExpiringMessage();
    ok('push текст (1): „Боя изтича до 5 дни."', !!m1 && m1.msg === 'Боя изтича до 5 дни.', m1 && m1.msg);

    const many = env(() => true, [P('p1', 'Боя', day(1)), P('p2', 'Плочки', day(0)), P('p3', 'Далечна', day(30))]);
    guard('renderBulletin()', () => many.w.renderBulletin());
    const sec2 = many.doc.getElementById('sec-promo');
    const t2 = sec2 ? sec2.textContent : '';
    ok('банер: 2 промоции изтичат до 5 дни', /2 промоции изтичат до 5 дни/.test(t2), t2.slice(0, 200));
    const m2 = many.w.composePromoExpiringMessage();
    ok('push текст (2): „2 промоции изтичат до 5 дни: …"', !!m2 && /^2 промоции изтичат до 5 дни: /.test(m2.msg), m2 && m2.msg);
    /* банерът смята от понеделника на бюлетина (14.09), текстът за push — от днес */
    ok('прагът е ≤5: ден +5 е „изтича“, ден +6 не е',
      many.w.promoStatus(P('x', 'x', day(5)), new Date(NOW)) === 'expiring' && many.w.promoStatus(P('y', 'y', day(6)), new Date(NOW)) === 'active');
  }

  report();
})();
