/* Чек лист — режим на обекта и становище (етап 3А, 23.10.2026).

   Какво заковава файлът:
   1. MANAGER Шумен вижда таба: точно един ред (Шумен), без бутон
      „Изпрати", без 💬; реален клик по клетка не записва нищо.
   2. Седмица без изпращане → надпис „Седмица N още не е изпратена от
      контролинга" + празна мрежа; без блок „Становище".
   3. Изпратена седмица, 2× „не" + 1× „да" + числова колона 5 → точно 2 реда
      в блок „Становище"; коментарът на контролинга се вижда като текст.
   4. Реален клик „Запази" → POST към weekly_checklist_responses с
      on_conflict и текста; празен текст → 0 заявки; провал → toast и
      текстът остава.
   5. Срок: седмица 42/2026 → „до петък 23.10, 18:00"; след срока → бадж.
   6. Режимът на обекта не пише в weekly_checklist (portal_value не се пълни).

   Пускане:  node tests/checklist-store-view.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const YEAR = 2026, WEEK = 42;

const METRICS = [
  ['revizia_953',    'ревизия',                  'yes_no',      'recurring:74da41e4-494f-48cc-a434-79bfc04fc243'],
  ['spravka_minusi', 'справка минуси',           'yes_no',      'recurring:03c44560-9572-4274-ad53-5228d61b4de7'],
  ['razhodi',        'разходи',                  'yes_no',      'manual'],
  ['storna_priem',   'Сторна по грешни приеми',  'number',      'module:wrong_receipt'],
  ['preocenka',      'преоценка',                'yes_no_none', 'recurring:a5e1e6f8-5b47-43ce-bfa4-5ab3ee7f70a6']
].map(function (a, i) {
  return { key: a[0], label: a[1], sublabel: '', value_type: a[2], source: a[3],
           sort_order: i + 1, active: true, deadline_day: null };
});

const USERS = ['Враца', 'Габрово', 'Шумен', 'Централен офис']
  .map(function (s) { return { store_name: s }; });

const MANAGER = { id: 'u-2', email: 'managershumen@temax.bg', display_name: 'Шумен', role: 'manager', store_name: 'Шумен' };

function cl(store, key, f) {
  return Object.assign({ year: YEAR, week_number: WEEK, store_name: store, metric_key: key,
                         portal_value: null, control_value: null, control_num: null, comment: null }, f || {});
}
/* Шумен: 2× не (ревизия — ръчно, минуси — от портала), 1× да, сторна 5, преоценка нямат. */
const ROWS = [
  cl('Шумен', 'revizia_953', { portal_value: 'da', control_value: 'ne', comment: 'няма протокол' }),
  cl('Шумен', 'spravka_minusi', { portal_value: 'ne' }),
  cl('Шумен', 'razhodi', { control_value: 'da' }),
  cl('Шумен', 'storna_priem', { control_num: 5 }),
  cl('Шумен', 'preocenka', { control_value: 'nyamat' }),
  cl('Враца', 'revizia_953', { control_value: 'ne' })
];
const SENT = [{ id: 's-1', year: YEAR, week_number: WEEK, version: 1, sent_at: '2026-10-19T08:00:00Z',
                sent_by: 'М. Павлова', recipients: ['a@b.bg'], note: null }];

function freeze(h, y, mo, d, hh, mm) {
  const RealDate = h.w.Date;
  const fixed = new RealDate(y, mo - 1, d, hh, mm || 0, 0);
  function FakeDate() {
    if (arguments.length === 0) return new RealDate(fixed.getTime());
    return new RealDate(...arguments);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = function () { return fixed.getTime(); };
  FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
  h.w.Date = FakeDate;
}

function env(opts) {
  opts = opts || {};
  const b = {
    modules: ['bulletin.js', 'checklist.js'],
    user: opts.user || MANAGER,
    data: {
      users: USERS,
      weekly_checklist_metrics: METRICS,
      weekly_checklist: opts.rows || ROWS,
      weekly_checklist_sends: opts.sends === undefined ? SENT : opts.sends,
      weekly_checklist_responses: opts.responses || [],
      recurring_tasks: [], recurring_task_versions: [], recurring_task_periods: [],
      recurring_task_skips: [], task_completions: [], stock_returns: [], goods_transit: [],
      differences_reports: [], stock_differences: []
    }
  };
  if (opts.fail) b.fail = opts.fail;
  const h = boot(b);
  freeze(h, 2026, 10, opts.day || 22, 12, 0);
  return h;
}

async function open(h, week) {
  if (week) { h.w.checklistYear = YEAR; h.w.checklistWeek = week; }
  h.w.loadChecklist();
  await ticks(); await ticks();
}

function bodyRows(h) {
  return Array.prototype.slice.call(h.doc.querySelectorAll('#checklist-table tbody tr'));
}
function respRows(h) { return Array.prototype.slice.call(h.doc.querySelectorAll('#cl-responses .cl-resp-row')); }
function respPosts(h) {
  return h.calls.post.filter(function (p) { return (p.url || '').indexOf('/weekly_checklist_responses') >= 0; });
}
function clWrites(h) {
  return h.calls.post.filter(function (p) { return (p.url || '').indexOf('/weekly_checklist?') >= 0; });
}
function labelOf(row) { return row.querySelector('div').textContent.trim(); }

(async function () {

  /* ── 1. Само своят ред, само четене ─────────────────────────────────── */
  section('1. MANAGER Шумен — един ред, без „Изпрати", без 💬, клик не пише');
  {
    const h = env();
    await open(h);
    ok('седмицата по подразбиране е последната изпратена (42)', h.w.checklistWeek === WEEK && h.w.checklistYear === YEAR,
       h.w.checklistWeek + '/' + h.w.checklistYear);
    const rows = bodyRows(h);
    ok('точно 1 ред', rows.length === 1, String(rows.length));
    ok('редът е Шумен', rows[0] && rows[0].querySelector('td').textContent.trim() === 'Шумен');
    const buttons = Array.prototype.slice.call(h.doc.querySelectorAll('#mod-checklist button'))
      .map(function (b) { return b.textContent.trim(); });
    ok('няма бутон „Изпрати"', !buttons.some(function (t) { return /Изпрати/.test(t); }), JSON.stringify(buttons));
    ok('няма 💬 в мрежата', !h.doc.querySelector('#checklist-table .cl-cmt'));
    const q = h.calls.get.filter(function (u) { return u.indexOf('/weekly_checklist?') >= 0; })[0] || '';
    ok('заявката за клетките е само за Шумен', /store_name=eq\.%D0%A8%D1%83%D0%BC%D0%B5%D0%BD/.test(q), q);

    const before = h.calls.post.length + h.calls.patch.length;
    const td = rows[0].querySelectorAll('td')[1];
    td.click(); await ticks();
    ok('клик по клетка → нищо не се записва', h.calls.post.length + h.calls.patch.length === before);
    ok('клетката остава „не"', td.querySelector('.cl-val').textContent.trim() === 'не');
    ok('порталът не пише portal_value в режим на обекта', clWrites(h).length === 0, String(clWrites(h).length));
    h.close();
  }

  /* ── 2. Неизпратена седмица ─────────────────────────────────────────── */
  section('2. Седмица без изпращане → надпис + празна мрежа');
  {
    const h = env({ sends: [] });
    await open(h);
    ok('без изпращания → предходната седмица (42 при 22.10)', h.w.checklistWeek === 42, String(h.w.checklistWeek));
    const note = h.doc.getElementById('cl-not-sent');
    ok('надписът е там', !!note && /Седмица 42 още не е изпратена от контролинга/.test(note.textContent), note ? note.textContent : '—');
    const rows = bodyRows(h);
    ok('мрежата е тук, 1 ред', rows.length === 1, String(rows.length));
    ok('клетките са празни', !rows[0].querySelector('.cl-val'));
    ok('няма блок „Становище"', !h.doc.getElementById('cl-responses'));
    ok('няма „Коментар на контролинга"', !h.doc.getElementById('cl-store-comments'));
    h.close();
  }
  {
    /* Изпратена е 42, обектът отива на 43 — тя не е изпратена. */
    const h = env();
    await open(h);
    h.w.checklistShiftWeek(1); await ticks(); await ticks();
    const note = h.doc.getElementById('cl-not-sent');
    ok('стрелка → 43, надпис „Седмица 43 още не е изпратена"', !!note && /Седмица 43 /.test(note.textContent), note ? note.textContent : '—');
    ok('на 43 мрежата е празна', !h.doc.querySelector('#checklist-table .cl-val'));
    h.close();
  }

  /* ── 3. Становище — кои редове ──────────────────────────────────────── */
  section('3. 2× „не" + „да" + число 5 + „нямат" → точно 2 реда');
  {
    const h = env({ responses: [{ id: 'r-1', year: YEAR, week_number: WEEK, store_name: 'Шумен', metric_key: 'revizia_953',
                                  text: 'Протоколът е при РУ', created_by: 'Шумен', updated_at: '2026-10-21T07:05:00Z' }] });
    await open(h);
    const rr = respRows(h);
    ok('2 реда в блок „Становище"', rr.length === 2, String(rr.length));
    ok('редовете са ревизия и справка минуси', rr.length === 2 && labelOf(rr[0]) === 'ревизия' && labelOf(rr[1]) === 'справка минуси',
       JSON.stringify(rr.map(labelOf)));
    ok('предишният текст е в полето', rr[0] && rr[0].querySelector('textarea').value === 'Протоколът е при РУ');
    ok('„записано 21.10 10:05" (местно)', rr[0] && rr[0].querySelector('.cl-resp-saved').textContent === 'записано 21.10 10:05',
       rr[0] && rr[0].querySelector('.cl-resp-saved').textContent);
    ok('второто поле е празно', rr[1] && rr[1].querySelector('textarea').value === '');
    const cm = h.doc.getElementById('cl-store-comments');
    ok('коментарът на контролинга се вижда като текст', !!cm && /Коментар на контролинга/.test(cm.textContent) &&
       cm.textContent.indexOf('няма протокол') >= 0, cm ? cm.textContent : '—');
    ok('в мрежата 📝 няма за обекта', !h.doc.querySelector('#checklist-table .cl-resp'));
    h.close();
  }

  /* ── 4. Запази ──────────────────────────────────────────────────────── */
  section('4. „Запази" — upsert, празно, провал');
  {
    const h = env();
    await open(h);
    const rr = respRows(h);
    rr[1].querySelector('textarea').value = '  Справката е подадена в петък  ';
    rr[1].querySelector('.cl-resp-save').click(); await ticks(); await ticks();
    const p = respPosts(h);
    ok('1 POST към weekly_checklist_responses', p.length === 1, String(p.length));
    ok('on_conflict=year,week_number,store_name,metric_key', p[0] && /on_conflict=year,week_number,store_name,metric_key/.test(p[0].url), p[0] && p[0].url);
    const b = p[0] ? (Array.isArray(p[0].body) ? p[0].body[0] : p[0].body) : {};
    ok('тялото: Шумен / spravka_minusi / 42 / текстът без интервали', b.store_name === 'Шумен' && b.metric_key === 'spravka_minusi' &&
       b.year === YEAR && b.week_number === WEEK && b.text === 'Справката е подадена в петък', JSON.stringify(b));
    ok('created_by = display_name', b.created_by === 'Шумен', b.created_by);
    ok('updated_at се подава', typeof b.updated_at === 'string' && b.updated_at.length > 10, b.updated_at);
    ok('зелен toast „Становището е записано"', h.calls.toast.some(function (t) { return String(t) === 'Становището е записано'; }), JSON.stringify(h.calls.toast));
    ok('„записано ДД.ММ ЧЧ:ММ" се показва', /^записано \d\d\.\d\d \d\d:\d\d$/.test(rr[1].querySelector('.cl-resp-saved').textContent),
       rr[1].querySelector('.cl-resp-saved').textContent);
    ok('нищо в weekly_checklist', clWrites(h).length === 0);
    h.close();
  }
  {
    const h = env();
    await open(h);
    const rr = respRows(h);
    rr[0].querySelector('textarea').value = '   ';
    rr[0].querySelector('.cl-resp-save').click(); await ticks();
    ok('празен текст → 0 заявки', respPosts(h).length === 0, String(respPosts(h).length));
    ok('празен текст → toast', h.calls.toast.length > 0, JSON.stringify(h.calls.toast));
    h.close();
  }
  {
    const h = env({ fail: { POST: /weekly_checklist_responses/ } });
    await open(h);
    const rr = respRows(h);
    rr[0].querySelector('textarea').value = 'Ще се оправи до понеделник';
    rr[0].querySelector('.cl-resp-save').click(); await ticks(); await ticks();
    ok('провал → червен toast', h.calls.toast.some(function (t) { return /не е записано/.test(String(t)); }), JSON.stringify(h.calls.toast));
    const ta = respRows(h)[0].querySelector('textarea');
    ok('провал → текстът остава в полето', ta.value === 'Ще се оправи до понеделник', ta.value);
    ok('провал → няма „записано"', respRows(h)[0].querySelector('.cl-resp-saved').textContent === '');
    h.close();
  }

  /* ── 5. Срок ────────────────────────────────────────────────────────── */
  section('5. Срок: седмица 42 → „до петък 23.10, 18:00"; след срока — бадж');
  {
    const h = env({ day: 23 });
    await open(h);
    const dl = h.doc.querySelector('#cl-responses .cl-resp-deadline');
    ok('„до петък 23.10, 18:00"', !!dl && dl.textContent === 'до петък 23.10, 18:00', dl ? dl.textContent : '—');
    ok('в 12:00 на 23.10 — без бадж', !h.doc.querySelector('#cl-responses .cl-resp-late'));
    h.close();
  }
  {
    const h = env();
    h.w.checklistYear = YEAR; h.w.checklistWeek = WEEK;
    freeze(h, 2026, 10, 23, 18, 1);
    await open(h);
    ok('23.10 18:01 → „след срока"', !!h.doc.querySelector('#cl-responses .cl-resp-late'));
    ok('след срока пак може да се пише (бутонът е активен)', respRows(h)[0] && !respRows(h)[0].querySelector('.cl-resp-save').disabled);
    h.close();
  }
  {
    const h = env();
    const d = h.w.checklistResponseDeadline(2026, 42);
    ok('checklistResponseDeadline(2026,42) = пт 23.10.2026 18:00 местно',
       d.getFullYear() === 2026 && d.getMonth() === 9 && d.getDate() === 23 && d.getDay() === 5 && d.getHours() === 18 && d.getMinutes() === 0,
       String(d));
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
