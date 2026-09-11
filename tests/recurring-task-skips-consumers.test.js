/* Постоянна задача, изключена за седмица — извън Бюлетина.

   Бюлетинът е в recurring-task-skips.test.js. Тук са останалите три места,
   които четат recurring_task_skips в браузъра:

     A. таб „Днес" (today.js) — глобалното изключване маха задачата от
        таблото; магазинното вади САМО този обект от знаменателя му и от
        разгънатия списък; „Текущи / без срок" също уважава обекта;
     B. банерът при вход (notifications.js) — изключената за обекта не се
        предлага като нова чакаща задача; без нова задача изключванията
        изобщо не се теглят;
     C. чек листът (checklist.js) — изключен обект/седмица → portal_value
        се ИЗЧИСТВА (null, празна клетка), не „не"/„0/5"; вече записано „не"
        отпреди изключването изчезва; липсващ ред не се създава празен.

   Отчетите (report.js и едж функциите) са етап 2 и имат собствен тест.

   ⚠️ Дати: котвата е петъкът от текущата реална седмица, замразена на
   w.Date. Ключът за седмицата в данните се смята независимо от кода под
   тест (годината на четвъртъка + weekNum()).

   Пускане: node tests/recurring-task-skips-consumers.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (4 - ((d.getDay() + 6) % 7)));
  return d;
})();
function isoOf(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function shifted(days) { const d = new Date(ANCHOR.getTime()); d.setDate(d.getDate() + days); return d; }
const TODAY = isoOf(ANCHOR);
function isoWeekYear(d) {
  const t = new Date(d.getTime());
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  return t.getFullYear();
}
function freezeDate(w) {
  const Real = w.Date, fixedMs = ANCHOR.getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  }
  w.Date = Frozen;
}
function keyOf(w, d) { return { year: isoWeekYear(d), week: w.weekNum(d) }; }
function skipRow(id, taskId, k, store) {
  return { id: id, recurring_task_id: taskId, year: k.year, week_number: k.week, store_name: store || null, reason: null, created_by: null };
}
function skipsRoute(rowsRef) {
  return function (url) {
    const y = /[?&]year=eq\.(\d+)/.exec(url), wk = /[?&]week_number=eq\.(\d+)/.exec(url);
    return rowsRef.rows.filter(r => (!y || r.year === +y[1]) && (!wk || r.week_number === +wk[1]));
  };
}
async function settle(cond, max) {
  for (let i = 0; i < (max || 40); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
function txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
const skipGets = h => h.calls.get.filter(u => u.indexOf('/recurring_task_skips') >= 0);

function rec(id, over) {
  return Object.assign({
    id: id, title: 'Постоянна ' + id, department: 'trade', task_type: 'info',
    target_stores: null, due_weekday: null, due_weekdays: null, due_time: '20:00',
    linked_module: null, active: true, sort_order: 0, due_window: false,
    created_at: shifted(-1).toISOString()
  }, over || {});
}

(async function () {

  /* ═══════════════════════ A. ТАБ „ДНЕС" ═══════════════════════════════ */
  const TR = 'Троян', LO = 'Ловеч', SE = 'Севлиево';
  const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

  function todayEnv() {
    const db = { rows: [] };
    const h = boot({ modules: ['bulletin.js', 'today.js', 'report.js'], user: ADMIN, data: {} });
    freezeDate(h.w);
    const w = h.w, k = keyOf(w, ANCHOR), kn = keyOf(w, shifted(7));
    db.rows = [
      skipRow('s1', 'r-a', k),          /* глобално тази седмица */
      skipRow('s2', 'r-b', k, TR),      /* само Троян тази седмица */
      skipRow('s3', 'r-c', kn),         /* глобално СЛЕДВАЩАТА седмица */
      skipRow('s4', 'r-n', k, LO)       /* „без срок" — само Ловеч */
    ];
    const bul = { id: 'b-1', week_number: k.week, year: k.year, status: 'published', created_at: TODAY,
                  content: { calendar: {}, columns: { trade: [], warehouse: [], admin: [] } } };
    w.DKEYS.forEach(x => { bul.content.calendar[x] = []; });
    h.setData('bulletins', [bul]);
    h.setData('recurring_tasks', [rec('r-a'), rec('r-b'), rec('r-c'),
      rec('r-n', { due_time: null })]); /* без ден и без час → „Текущи / без срок" */
    h.setData('recurring_task_skips', skipsRoute(db));
    h.setData('bulletin_tasks', []);
    h.setData('task_completions', [
      /* Троян е отметнал r-b днес — изключен е, не бива да се брои. */
      { recurring_task_id: 'r-b', store_name: TR, status: 'done', completion_date: TODAY },
      { recurring_task_id: 'r-b', store_name: LO, status: 'done', completion_date: TODAY }
    ]);
    h.setData('users', [TR, LO, SE].map(s => ({ store_name: s })));
    h.setData('report_snapshots', []);
    ['differences_reports', 'stock_returns', 'kasa_storno', 'kasa_zoborot', 'goods_transit',
      'transport_pallets', 'stock_differences', 'client_orders', 'transport_orders',
      'daily_turnover', 'report_recipients', 'kasa_reports'].forEach(t => h.setData(t, []));
    h.k = k;
    return h;
  }

  section('A1. „Днес": глобалното маха задачата, магазинното е по обект');
  {
    const h = todayEnv(), w = h.w;
    if (guard('loadTodayDashboard() не хвърля', () => w.loadTodayDashboard())) {
      await settle(() => !!w.todayCache);
      const c = w.todayCache || { items: [], noDueItems: [] };
      const titles = c.items.map(i => i.title);
      const q = skipGets(h);
      ok('една заявка за ДНЕШНАТА седмица', q.length === 1 && q[0].indexOf('year=eq.' + h.k.year) >= 0 &&
        q[0].indexOf('week_number=eq.' + h.k.week + '&') >= 0, q.join(' | '));
      ok('r-a (глобално) я няма на таблото', titles.indexOf('Постоянна r-a') < 0, titles.join(', '));
      ok('r-b е на таблото (магазинно — само за Троян)', titles.indexOf('Постоянна r-b') >= 0);
      ok('r-c (изключена СЛЕДВАЩАТА седмица) е на таблото', titles.indexOf('Постоянна r-c') >= 0);
      const rb = c.items.find(i => i.id === 'r-b');
      ok('r-b носи skip_stores = [Троян]', rb && JSON.stringify(rb.skip_stores) === JSON.stringify([TR]), rb && JSON.stringify(rb.skip_stores));
      const st = s => w.todayStoreStats(s, c.items, c.comps);
      ok('Троян: 0/1 — само r-c; отметката му по r-b не се брои', st(TR).done === 0 && st(TR).total === 1, JSON.stringify(st(TR)));
      ok('Ловеч: 1/2 — r-b и r-c; отметката по r-b се брои', st(LO).done === 1 && st(LO).total === 2, JSON.stringify(st(LO)));
      ok('Севлиево: 0/2', st(SE).done === 0 && st(SE).total === 2, JSON.stringify(st(SE)));
      ok('„без срок" r-n е в noDueItems със skip_stores = [Ловеч]',
        c.noDueItems.some(i => i.id === 'r-n' && JSON.stringify(i.skip_stores) === JSON.stringify([LO])));
    }
  }

  section('A2. „Днес": разгънатият обект не показва изключеното за него');
  {
    const h = todayEnv(), w = h.w, doc = h.doc;
    w.loadTodayDashboard();
    await settle(() => !!w.todayCache);
    const wrap = doc.getElementById('mod-today');
    const expand = s => { w.todayExpandedStore = s; w.renderTodayDashboard(wrap, w.todayCache.items, w.todayCache.noDueItems, w.todayCache.comps, w.todayCache.stores); return txt(wrap); };
    const trText = expand(TR);
    ok('Троян: r-c е в списъка', trText.indexOf('Постоянна r-c') >= 0);
    ok('Троян: r-b НЕ е в списъка', trText.indexOf('Постоянна r-b') < 0);
    ok('Троян: „без срок" r-n е там (изключена е за Ловеч)', trText.indexOf('Постоянна r-n') >= 0);
    const loText = expand(LO);
    ok('Ловеч: r-b е в списъка', loText.indexOf('Постоянна r-b') >= 0);
    ok('Ловеч: „без срок" r-n я няма', loText.indexOf('Постоянна r-n') < 0);
  }

  /* ═══════════════════════ B. БАНЕРЪТ ПРИ ВХОД ═════════════════════════ */
  function bannerEnv(store, recs) {
    const db = { rows: [] };
    const h = boot({
      modules: ['bulletin.js', 'notifications.js'],
      user: { email: 'm@temax.bg', display_name: 'Управител', role: 'manager', store_name: store },
      data: { bulletins: [], recurring_tasks: recs, recurring_task_skips: skipsRoute(db), task_completions: [] }
    });
    freezeDate(h.w);
    const k = keyOf(h.w, ANCHOR), kn = keyOf(h.w, shifted(7));
    db.rows = [skipRow('s1', 'r-a', k), skipRow('s2', 'r-b', k, TR), skipRow('s3', 'r-c', kn, TR)];
    h.k = k;
    return h;
  }
  const bannerText = h => txt(h.doc.getElementById('notif-banner'));

  section('B1. Банер: изключената за обекта не е „нова задача"');
  {
    const h = bannerEnv(TR, [rec('r-a'), rec('r-b'), rec('r-c'), rec('r-d')]);
    if (guard('checkNewBulletinTasksBanner() не хвърля', () => h.w.checkNewBulletinTasksBanner())) {
      await settle(() => bannerText(h).indexOf('от Бюлетин') >= 0);
      const t = bannerText(h);
      ok('банерът е показан', t.indexOf('от Бюлетин') >= 0, t);
      ok('2 нови задачи — r-c и r-d', t.indexOf('2 нови задачи') >= 0, t);
      ok('r-a (глобално) я няма', t.indexOf('Постоянна r-a') < 0);
      ok('r-b (изключена за Троян) я няма', t.indexOf('Постоянна r-b') < 0);
      ok('r-c (изключена СЛЕДВАЩАТА седмица) е там', t.indexOf('Постоянна r-c') >= 0);
      const q = skipGets(h);
      ok('заявката е за ДНЕШНАТА седмица', q.length === 1 && q[0].indexOf('year=eq.' + h.k.year) >= 0 &&
        q[0].indexOf('week_number=eq.' + h.k.week + '&') >= 0, q.join(' | '));
    }
  }

  section('B2. Банер: Ловеч вижда r-b (изключена е само за Троян)');
  {
    const h = bannerEnv(LO, [rec('r-b')]);
    h.w.checkNewBulletinTasksBanner();
    await settle(() => bannerText(h).indexOf('от Бюлетин') >= 0);
    ok('r-b е в банера на Ловеч', bannerText(h).indexOf('Постоянна r-b') >= 0, bannerText(h));
  }

  section('B3. Банер: всичко изключено → банер няма; без нови задачи → без заявка');
  {
    const h = bannerEnv(TR, [rec('r-a'), rec('r-b')]);
    h.w.checkNewBulletinTasksBanner();
    await settle(() => skipGets(h).length > 0);
    for (let i = 0; i < 5; i++) await ticks();
    ok('няма карта „нови задачи"', bannerText(h).indexOf('от Бюлетин') < 0, bannerText(h));
    const h2 = bannerEnv(TR, []);
    h2.w.checkNewBulletinTasksBanner();
    for (let i = 0; i < 8; i++) await ticks();
    ok('без нова постоянна задача recurring_task_skips НЕ се тегли', skipGets(h2).length === 0, skipGets(h2).join(' | '));
  }

  /* ═══════════════════════ C. ЧЕК ЛИСТЪТ ═══════════════════════════════ */
  const REV = '74da41e4-494f-48cc-a434-79bfc04fc243', MIN = '03c44560-9572-4274-ad53-5228d61b4de7';
  const VR = 'Враца', GA = 'Габрово', DO = 'Добрич';
  const METRICS = [
    { key: 'revizia_953', label: 'ревизия', sublabel: '953', value_type: 'yes_no', sort_order: 1, active: true, source: 'recurring:' + REV },
    { key: 'spravka_minusi', label: 'справка минуси', sublabel: '', value_type: 'yes_no', sort_order: 2, active: true, source: 'recurring:' + MIN }
  ];
  function checklistEnv(rows) {
    const db = { rows: [] };
    const h = boot({
      modules: ['bulletin.js', 'checklist.js'],
      user: { id: 'u-1', email: 'c@temax.bg', display_name: 'Контрол', role: 'admin', store_name: 'Централен офис' },
      data: {
        users: [VR, GA, DO].map(s => ({ store_name: s })),
        weekly_checklist_metrics: METRICS,
        weekly_checklist: rows || [],
        recurring_tasks: [{ id: REV, due_weekdays: [0, 1, 2] }, { id: MIN, due_weekdays: [0, 1, 2, 3, 4] }],
        task_completions: [],
        recurring_task_skips: skipsRoute(db)
      }
    });
    const def = h.w.checklistDefaultWeek();
    const wk = h.w.weekDays(def.week, def.year);
    /* Ключът на показаната седмица — независимо: от понеделника ѝ. */
    const k = keyOf(h.w, wk[0]);
    const kOther = keyOf(h.w, new Date(wk[0].getTime() + 7 * 86400000));
    db.rows = [
      skipRow('s1', REV, k, GA),         /* ревизия — само Габрово */
      skipRow('s2', MIN, k),             /* справка — глобално */
      skipRow('s3', REV, kOther, VR)     /* ДРУГА седмица — не бива да пипа Враца */
    ];
    h.setData('task_completions', [
      { recurring_task_id: REV, store_name: VR, status: 'done', completion_date: h.w.toLocalISO(wk[1]) },
      { recurring_task_id: REV, store_name: GA, status: 'done', completion_date: h.w.toLocalISO(wk[1]) }
    ]);
    h.k = k; h.def = def;
    return h;
  }
  const writes = h => h.calls.post.filter(p => (p.url || '').indexOf('/weekly_checklist?') >= 0);
  function written(h, store, key) {
    let out;
    writes(h).forEach(p => [].concat(p.body).forEach(r => { if (r.store_name === store && r.metric_key === key) out = r; }));
    return out;
  }
  function cellVal(h, store, key) {
    const t = h.doc.getElementById('checklist-table');
    if (!t) return null;
    const tr = Array.prototype.find.call(t.querySelectorAll('tbody tr'), x => { const f = x.querySelector('td'); return f && f.textContent.trim() === store; });
    if (!tr) return null;
    const td = tr.querySelectorAll('td')[METRICS.map(m => m.key).indexOf(key) + 1];
    const v = td && td.querySelector('.cl-val');
    return v ? v.textContent.trim() : '';
  }

  section('C1. Чек лист: изключен обект → празна клетка, записаното „не" се чисти');
  {
    const h = checklistEnv([]);
    /* Записано ПРЕДИ изключването, за показаната седмица. */
    const rowsNow = h.w.checklistDefaultWeek();
    h.setData('weekly_checklist', [
      { year: rowsNow.year, week_number: rowsNow.week, store_name: GA, metric_key: 'revizia_953', portal_value: 'ne', control_value: null, control_num: null, comment: 'от контрола' },
      { year: rowsNow.year, week_number: rowsNow.week, store_name: DO, metric_key: 'spravka_minusi', portal_value: '2/5', control_value: null, control_num: null, comment: null }
    ]);
    if (guard('loadChecklist() не хвърля', () => h.w.loadChecklist())) {
      await settle(() => !!h.doc.getElementById('checklist-table'));
      const q = skipGets(h);
      ok('една заявка за ПОКАЗАНАТА седмица', q.length === 1 && q[0].indexOf('year=eq.' + h.k.year) >= 0 &&
        q[0].indexOf('week_number=eq.' + h.k.week + '&') >= 0, q.join(' | '));
      ok('Враца: ревизия → da (изключването за ДРУГА седмица не я пипа)', (written(h, VR, 'revizia_953') || {}).portal_value === 'da',
        JSON.stringify(written(h, VR, 'revizia_953')));
      const ga = written(h, GA, 'revizia_953');
      ok('Габрово: записаното „ne" се ИЗЧИСТВА — portal_value: null в тялото',
        !!ga && Object.prototype.hasOwnProperty.call(ga, 'portal_value') && ga.portal_value === null, JSON.stringify(ga));
      ok('Габрово: отметката му не превръща клетката в „da"', !ga || ga.portal_value !== 'da');
      ok('тялото на записа не носи control_value/comment (ръчната работа не се пипа)',
        !!ga && !('control_value' in ga) && !('comment' in ga));
      ok('Добрич: ревизия → ne (не е изключен)', (written(h, DO, 'revizia_953') || {}).portal_value === 'ne');
      ok('Добрич: справката (глобално изключена) „2/5" се изчиства',
        (written(h, DO, 'spravka_minusi') || {}).portal_value === null, JSON.stringify(written(h, DO, 'spravka_minusi')));
      ok('Враца/Габрово: справката без ред → НЕ се създава празен ред',
        written(h, VR, 'spravka_minusi') === undefined && written(h, GA, 'spravka_minusi') === undefined);
      ok('клетката Габрово/ревизия е празна', cellVal(h, GA, 'revizia_953') === '', cellVal(h, GA, 'revizia_953'));
      ok('клетката Враца/ревизия е „да"', cellVal(h, VR, 'revizia_953') === 'да', cellVal(h, VR, 'revizia_953'));
      ok('клетката Добрич/справка е празна', cellVal(h, DO, 'spravka_minusi') === '', cellVal(h, DO, 'spravka_minusi'));
    }
  }

  section('C2. Чек лист: второ отваряне — нищо ново за писане');
  {
    const h = checklistEnv([]);
    const d = h.w.checklistDefaultWeek();
    h.setData('weekly_checklist', [
      /* Вече изчистено от предишното отваряне. */
      { year: d.year, week_number: d.week, store_name: GA, metric_key: 'revizia_953', portal_value: null, control_value: null, control_num: null, comment: null },
      { year: d.year, week_number: d.week, store_name: VR, metric_key: 'revizia_953', portal_value: 'da', control_value: null, control_num: null, comment: null },
      { year: d.year, week_number: d.week, store_name: DO, metric_key: 'revizia_953', portal_value: 'ne', control_value: null, control_num: null, comment: null }
    ]);
    h.w.loadChecklist();
    await settle(() => !!h.doc.getElementById('checklist-table'));
    ok('нула записа в weekly_checklist', writes(h).length === 0, JSON.stringify(writes(h).map(p => p.body)));
  }

  report();
})().catch(function (e) {
  ok('тестът стига до края без необработено изключение', false, e && e.stack);
  report();
});
