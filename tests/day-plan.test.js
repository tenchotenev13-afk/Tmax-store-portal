/* „📋 План за деня" в Бюлетина (27.09.2026).
   Седмичният календар е обзор; планът е работен списък за ЕДИН ден, в реда, в
   който се върши — без разделяне по отдели.

   Подборът е bulDayItems() — СЪЩИЯТ, който храни календара и печата. Тук се
   заковава само подредбата и поведението на реда.

   Какво заковава тестът (РЕАЛНИ кликове):
     1. подредба: с час по часа (най-ранният горе), после без час по отдел →
        обикновени преди постоянни → sort_order;
     2. „Само за информация" е най-отдолу, в своя блок, без чекбокс;
     3. изключена за обекта („не за тази седмица") НЕ влиза;
     4. пренесена се явява на НОВИЯ ден, с „⏱ Пренесена от";
     5. отметка в плана се вижда и в календара (един рендер, две места);
     6. офисът без избран обект вижда подсказка; с избран — плана на този обект;
     7. превключвателят ◀ ▶ не излиза от седмицата;
     8. прозоречна постоянна задача: всеки ден до отмятането, после само в деня
        на изпълнението;
     9. многоседмичната в сила със срок по-нататък е в „🗓 Текущи, срок по-късно".

   Пускане: node tests/day-plan.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, ok, guard, section, report, ticks } = H;

/* ── котва: СРЯДА 12:00 от текущата реална седмица ───────────────────────── */
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
const MON = isoOf(shifted(-2));   /* понеделник */
const TUE = isoOf(shifted(-1));
const WED = isoOf(ANCHOR);        /* „днес" */
const THU = isoOf(shifted(1));
const FRI = isoOf(shifted(2));
const SUN = isoOf(shifted(4));
const NEXT_THU = isoOf(shifted(8));

const STORE = { email: 't@temax.bg', display_name: 'Троян', role: 'manager', store_name: 'Троян' };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const STORES = ['Троян', 'Ловеч'];

function task(id, over) {
  return Object.assign({
    id: id, bulletin_id: 'b-0', week_number: 0, year: 2026, department: 'trade',
    title: 'Задача ' + id, description: null, due_date: WED, due_dates: [WED],
    spans_from: null, starts_on: null, target_stores: null, task_type: 'info',
    report_groups: null, linked_module: null, auto_complete: false, attachments: null,
    sort_order: 1, created_by: 'Админ', created_at: MON
  }, over || {});
}
function rec(id, over) {
  return Object.assign({
    id: id, title: 'Постоянна ' + id, department: 'admin', task_type: 'info',
    description: null, target_stores: null, due_weekday: 2, due_weekdays: [2],
    due_time: null, due_window: false, linked_module: null, report_groups: null,
    attachments: null, active: true, sort_order: 1, created_at: MON
  }, over || {});
}
function freshDb() {
  return {
    seq: 0,
    tasks: [
      /* обикновена, търговска, sort_order 2 */
      task('t-b', { title: 'Провери етикетите', department: 'trade', sort_order: 2 }),
      /* обикновена, склад, sort_order 1 — по отдел трябва да е СЛЕД търговската */
      task('t-c', { title: 'Приеми доставката', department: 'warehouse', sort_order: 3 })
    ],
    recs: [
      /* с час 20:00 — в ПЪРВИЯ отдел (trade), за да не може подредбата по
         отдел да нареди правилно вместо подредбата по час */
      rec('r-late', { title: 'Вечерен оборот', due_time: '20:00', department: 'trade' }),
      /* с час 09:00 — в ПОСЛЕДНИЯ отдел (admin), но трябва да е ПЪРВА */
      rec('r-early', { title: 'Сутрешна проверка', due_time: '09:00', department: 'admin' }),
      /* без час, складова, с ПО-МАЛЪК sort_order от обикновената складова:
         така само рангът по вид може да задържи обикновената пред нея */
      rec('r-plain', { title: 'Подреди склада', department: 'warehouse', sort_order: 0 }),
      /* изключена за Троян */
      rec('r-skip', { title: 'Ревизия групи', department: 'admin' }),
      /* „Инфо" */
      rec('r-info', { title: 'Бележка за проверка', task_type: 'notice', department: 'admin' })
    ],
    comps: [],
    skips: [{ id: 'sk-1', recurring_task_id: 'r-skip', store_name: 'Троян',
              year: isoWeekYear(ANCHOR), week_number: 0 }]
  };
}
function wireDb(h, db) {
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    init = init || {};
    const m = (init.method || 'GET').toUpperCase();
    if (m === 'GET') return orig.call(this, url, init);
    const onComps = url.indexOf('/task_completions') >= 0;
    if (!onComps) return orig.call(this, url, init);
    const body = init.body ? JSON.parse(init.body) : null;
    orig.call(this, url, init);
    if (m === 'POST') {
      const row = Object.assign({ id: 'c-n' + (++db.seq) }, body);
      db.comps.push(row);
      return Promise.resolve({ ok: true, status: 201, headers: { get: () => null }, json: () => Promise.resolve([row]), text: () => Promise.resolve('') });
    }
    if (m === 'PATCH') {
      const idm = /[?&]id=eq\.([^&]+)/.exec(url);
      db.comps.forEach(c => { if (idm && c.id === idm[1]) Object.assign(c, body); });
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
function env(db, over) {
  over = over || {};
  const h = boot({
    modules: ['bulletin.js', 'today.js', 'report.js'],
    user: over.user || STORE,
    data: {
      users: STORES.map(s => ({ store_name: s })),
      stores: STORES.map(s => ({ name: s })),
      bulletins: () => h.buls,
      bulletin_tasks: url => {
        if (url.indexOf('spans_from=not.is.null') >= 0) {
          return db.tasks.filter(t => t.spans_from);
        }
        const byIds = /[?&]id=in\.\(([^)]*)\)/.exec(url);
        if (byIds) { const ids = byIds[1].split(','); return db.tasks.filter(t => ids.indexOf(t.id) >= 0); }
        return db.tasks;
      },
      recurring_tasks: () => db.recs,
      recurring_task_periods: () => db.recs.map(r => ({ recurring_task_id: r.id, from_monday: '2026-01-05', to_monday: null })),
      recurring_task_versions: [],
      recurring_task_skips: () => db.skips,
      task_completions: url => {
        let out = db.comps.slice();
        if (url.indexOf('postponed_to=') >= 0) return out.filter(c => !!c.postponed_to);
        if (url.indexOf('recurring_task_id=not.is.null') >= 0) return out.filter(c => !!c.recurring_task_id);
        const tin = /[?&]task_id=in\.\(([^)]*)\)/.exec(url);
        if (tin) { const ids = tin[1].split(','); out = out.filter(c => ids.indexOf(String(c.task_id)) >= 0); }
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
  h.w.reportableStoresCache = STORES.slice();
  h.w.allStoresCache = STORES.slice();
  try { h.w.localStorage.removeItem('bulPlanOpen'); } catch (e) {}
  wireDb(h, db);
  return h;
}
async function settle(cond, max) {
  for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const planOf = h => h.doc.getElementById('sec-dayplan');
const calOf = h => h.doc.getElementById('sec-calendar');
async function view(db, over) {
  const h = env(db, over);
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return h;
  await settle(() => !!planOf(h) && !!calOf(h));
  return h;
}
/* заглавията в реда, в който планът ги рисува */
function planTitles(h) {
  const pl = planOf(h);
  if (!pl) return [];
  return Array.prototype.map.call(pl.querySelectorAll('[data-plan-row]'),
    r => txt(r).replace(/^\d{2}:\d{2}|^—/, '').trim());
}
function planRow(h, part) {
  const pl = planOf(h);
  if (!pl) return null;
  return Array.prototype.find.call(pl.querySelectorAll('[data-plan-row]'), r => txt(r).indexOf(part) >= 0) || null;
}

(async function () {

  section('1. Подредбата: час, после без час по отдел и вид');
  {
    const db = freshDb();
    const h = await view(db);
    const pl = planOf(h);
    if (ok('планът се рендира', !!pl)) {
      ok('отворен е по подразбиране за магазина', txt(pl).indexOf('С краен час') >= 0, txt(pl).slice(0, 160));
      const titles = planTitles(h);
      ok('първа е задачата за 09:00', titles[0] && titles[0].indexOf('Сутрешна проверка') >= 0, JSON.stringify(titles));
      ok('втора е тази за 20:00', titles[1] && titles[1].indexOf('Вечерен оборот') >= 0, JSON.stringify(titles));
      /* след часовете: търговска обикновена → складова обикновена → складова постоянна */
      const iTrade = titles.findIndex(x => x.indexOf('Провери етикетите') >= 0);
      const iWh = titles.findIndex(x => x.indexOf('Приеми доставката') >= 0);
      const iWhRec = titles.findIndex(x => x.indexOf('Подреди склада') >= 0);
      ok('търговската е преди складовата (ред на отделите)', iTrade > 1 && iTrade < iWh, iTrade + ' < ' + iWh);
      ok('обикновената е преди постоянната в същия отдел', iWh < iWhRec, iWh + ' < ' + iWhRec);
      ok('часовете са ПРЕДИ всичко без час', iTrade > 1 && iWh > 1 && iWhRec > 1);
    }
  }

  section('2. „Само за информация" е най-отдолу и без отметка');
  {
    const db = freshDb();
    const h = await view(db);
    const titles = planTitles(h);
    const iInfo = titles.findIndex(x => x.indexOf('Бележка за проверка') >= 0);
    ok('notice е в плана', iInfo >= 0, JSON.stringify(titles));
    ok('и е ПОСЛЕДНА', iInfo === titles.length - 1, iInfo + ' от ' + titles.length);
    const row = planRow(h, 'Бележка за проверка');
    ok('редът ѝ е без чекбокс', !!row && !row.querySelector('input[type=checkbox]'));
    ok('има блок „Само за информация"', txt(planOf(h)).indexOf('Само за информация') >= 0);
  }

  section('3. Изключената за обекта НЕ влиза');
  {
    const db = freshDb();
    const h = await view(db);
    ok('„Ревизия групи" я няма в плана', planTitles(h).every(x => x.indexOf('Ревизия групи') < 0),
      JSON.stringify(planTitles(h)));
    ok('КОНТРОЛА: за ДРУГ обект влиза', (function () {
      const db2 = freshDb();
      db2.skips = [{ id: 'sk-1', recurring_task_id: 'r-skip', store_name: 'Ловеч',
                     year: isoWeekYear(ANCHOR), week_number: 0 }];
      return true;   /* проверката е по-долу, в отделен изглед */
    })());
    const db2 = freshDb();
    db2.skips = [{ id: 'sk-2', recurring_task_id: 'r-skip', store_name: 'Ловеч',
                   year: isoWeekYear(ANCHOR), week_number: 0 }];
    const h2 = await view(db2);
    ok('щом изключването е за Ловеч, Троян я вижда',
      planTitles(h2).some(x => x.indexOf('Ревизия групи') >= 0), JSON.stringify(planTitles(h2)));
  }

  section('4. Отметка в плана се вижда и в календара');
  {
    const db = freshDb();
    const h = await view(db);
    const row = planRow(h, 'Провери етикетите');
    const cb = row && row.querySelector('input[data-tid="t-b"]');
    if (ok('чекбоксът в плана е намерен', !!cb, txt(row || {}))) {
      ok('не е заключен (днешен ден)', !cb.disabled, cb.getAttribute('title'));
      cb.checked = true;
      fire(h.w, cb, 'change');
      await settle(() => db.comps.length > 0);
      ok('отмятането е записано', db.comps.length === 1 && db.comps[0].status === 'done',
        JSON.stringify(db.comps));
      ok('completion_date е денят на задачата', db.comps[0].completion_date === WED, String(db.comps[0].completion_date));
      await settle(() => {
        const c = calOf(h) && calOf(h).querySelector('input[data-tid="t-b"]');
        return c && c.checked;
      });
      const calCb = calOf(h).querySelector('input[data-tid="t-b"]');
      ok('СЪЩАТА задача излиза отметната и в календара', !!calCb && calCb.checked);
      const planCb = planOf(h).querySelector('input[data-tid="t-b"]');
      ok('и в плана остава отметната', !!planCb && planCb.checked);
    }
  }

  section('5. Пренесената се явява на НОВИЯ ден');
  {
    const db = freshDb();
    /* задача от вторник, пренесена за днес */
    db.tasks.push(task('t-pp', { title: 'Стара от вторник', due_date: TUE, due_dates: [TUE], sort_order: 9 }));
    db.comps.push({ id: 'c-pp', task_id: 't-pp', store_name: 'Троян', status: 'postponed',
                    completion_date: TUE, postponed_to: WED, comment: 'нямаше време' });
    const h = await view(db);
    const row = planRow(h, 'Стара от вторник');
    if (ok('пренесената е в плана за днес', !!row, JSON.stringify(planTitles(h)))) {
      ok('носи „Пренесена от"', txt(row).indexOf('Пренесена от') >= 0, txt(row));
      /* Пренесеното явяване се отмята през СВОЯ обработчик: data-cdate е НОВИЯТ
         ден (там стои редът), а data-orig — първоначалният, защото записът
         отива в него (completion_date не се мени, само статусът). */
      const ccb = row.querySelector('input[type=checkbox]');
      ok('чекбоксът сочи новия ден', !!ccb && ccb.getAttribute('data-cdate') === WED,
        ccb && ccb.getAttribute('data-cdate'));
      ok('и носи първоначалния ден в data-orig', !!ccb && ccb.getAttribute('data-orig') === TUE,
        ccb && ccb.getAttribute('data-orig'));
      ok('минава през обработчика за пренесени',
        !!ccb && /bulCarriedCheckboxChanged/.test(ccb.getAttribute('onchange') || ''),
        ccb && ccb.getAttribute('onchange'));
    }
    /* на вторник (предишен ден) НЕ се явява като пренесена */
    h.w.bulPlanDate = TUE;
    if (guard('renderBulletin() не хвърля', () => h.w.renderBulletin())) {
      await settle(() => txt(planOf(h)).indexOf('вторник') >= 0 || true);
      const r2 = planRow(h, 'Стара от вторник');
      ok('във вторник редът ѝ е собственият, не пренесен',
        !r2 || txt(r2).indexOf('Пренесена от') < 0, r2 ? txt(r2) : '(няма ред)');
    }
  }

  section('6. Офисът: без обект — подсказка; с обект — неговият план');
  {
    const db = freshDb();
    const h = await view(db, { user: ADMIN });
    const pl = planOf(h);
    ok('планът е СВИТ за офиса', txt(pl).indexOf('С краен час') < 0, txt(pl).slice(0, 160));
    const toggle = pl && pl.querySelector('button');
    if (ok('има бутон за разгъване', !!toggle)) {
      realClick(h.w, toggle, 'разгъни');
      await settle(() => txt(planOf(h)).indexOf('избери обект') >= 0);
      ok('без избран обект показва подсказка',
        txt(planOf(h)).indexOf('Избери обект') >= 0, txt(planOf(h)).slice(0, 220));
      const sel = planOf(h).querySelector('#plan-store');
      if (ok('има избор на обект', !!sel)) {
        sel.value = 'Троян';
        fire(h.w, sel, 'change');
        await settle(() => planTitles(h).length > 0);
        ok('с избран обект се показва планът му',
          planTitles(h).some(x => x.indexOf('Сутрешна проверка') >= 0), JSON.stringify(planTitles(h)));
      }
    }
  }

  section('7. Превключвателят не излиза от седмицата');
  {
    const db = freshDb();
    const h = await view(db);
    ok('по подразбиране е ДНЕС', txt(planOf(h)).indexOf('днес') >= 0, txt(planOf(h)).slice(0, 140));
    for (let i = 0; i < 6; i++) h.w.bulPlanShift(-1);
    await ticks();
    ok('след шест назад е понеделник', h.w.bulPlanDay() === MON, h.w.bulPlanDay());
    h.w.bulPlanShift(-1);
    await ticks();
    ok('още назад не мърда', h.w.bulPlanDay() === MON, h.w.bulPlanDay());
    for (let i = 0; i < 9; i++) h.w.bulPlanShift(1);
    await ticks();
    ok('напред стига до неделя и спира', h.w.bulPlanDay() === SUN, h.w.bulPlanDay());
  }

  section('8. Прозоречна задача: всеки ден до отмятането, после само в деня си');
  {
    const db = freshDb();
    db.recs.push(rec('r-win', { title: 'Прозорец пон-ср', due_weekdays: [0, 1, 2], due_weekday: 0,
                                due_window: true, department: 'trade', sort_order: 7 }));
    const h = await view(db);
    ok('в сряда (ден от прозореца) е в плана',
      planTitles(h).some(x => x.indexOf('Прозорец пон-ср') >= 0), JSON.stringify(planTitles(h)));
    const row = planRow(h, 'Прозорец пон-ср');
    ok('носи срока на прозореца', !!row && txt(row).indexOf('до ') >= 0, txt(row || {}));
    h.w.bulPlanDate = MON;
    h.w.renderBulletin();
    await ticks();
    ok('в понеделник също е в плана',
      planTitles(h).some(x => x.indexOf('Прозорец пон-ср') >= 0), JSON.stringify(planTitles(h)));

    /* отметната във ВТОРНИК → явява се само във вторник */
    const db2 = freshDb();
    db2.recs.push(rec('r-win', { title: 'Прозорец пон-ср', due_weekdays: [0, 1, 2], due_weekday: 0,
                                 due_window: true, department: 'trade', sort_order: 7 }));
    db2.comps.push({ id: 'c-w', task_id: null, recurring_task_id: 'r-win', store_name: 'Троян',
                     status: 'done', completion_date: TUE });
    const h2 = await view(db2);
    h2.w.bulPlanDate = TUE; h2.w.renderBulletin(); await ticks();
    ok('във вторник (деня на изпълнението) е в плана',
      planTitles(h2).some(x => x.indexOf('Прозорец пон-ср') >= 0), JSON.stringify(planTitles(h2)));
    h2.w.bulPlanDate = WED; h2.w.renderBulletin(); await ticks();
    ok('в сряда вече я НЯМА (свършена е)',
      planTitles(h2).every(x => x.indexOf('Прозорец пон-ср') < 0), JSON.stringify(planTitles(h2)));
  }

  section('9. Многоседмичната в сила със срок по-нататък е в своя блок');
  {
    const db = freshDb();
    db.tasks.push(task('t-span', { title: 'Клетка надувно', due_date: NEXT_THU, due_dates: [NEXT_THU],
                                   spans_from: MON, sort_order: 8 }));
    const h = await view(db);
    ok('има блок „Текущи, срок по-късно"', txt(planOf(h)).indexOf('срок по-късно') >= 0,
      txt(planOf(h)).slice(0, 260));
    ok('задачата е в плана', planTitles(h).some(x => x.indexOf('Клетка надувно') >= 0),
      JSON.stringify(planTitles(h)));
    const row = planRow(h, 'Клетка надувно');
    ok('носи срока си', !!row && txt(row).indexOf('Срок') >= 0, txt(row || {}));
    ok('но НЕ е в групата с час', (function () {
      const t = planTitles(h);
      return t.findIndex(x => x.indexOf('Клетка надувно') >= 0) > 1;
    })());
  }

  section('10. Печатът минава през същия подбор, но БЕЗ „Само за информация"');
  {
    /* bulDayItems({includeNotice:false}) е единствената разлика на хартията за
       notice. Печатът на цял бюлетин включва и календара — там е видима. */
    const db = freshDb();
    const h = await view(db);
    let printed = '';
    h.w.open = () => ({ document: { write(x) { printed += String(x); }, close() {} }, focus() {}, print() {}, close() {} });
    if (guard('printSection("all") не хвърля', () => h.w.printSection('all'))) {
      ok('печатът носи работните задачи', printed.indexOf('Сутрешна проверка') >= 0, printed.slice(0, 200));
      ok('печатът НЕ носи „Само за информация"',
        printed.indexOf('Бележка за проверка') < 0, printed.slice(0, 300));
    }
  }

  section('11. Обхватът по обект: чужда задача не влиза в плана');
  {
    const db = freshDb();
    db.tasks.push(task('t-other', { title: 'Само за Ловеч', target_stores: ['Ловеч'], sort_order: 4 }));
    db.recs.push(rec('r-other', { title: 'Постоянна само за Ловеч', target_stores: ['Ловеч'], sort_order: 4 }));
    const h = await view(db);
    ok('обикновената чужда задача я няма',
      planTitles(h).every(x => x.indexOf('Само за Ловеч') < 0), JSON.stringify(planTitles(h)));
    ok('постоянната чужда задача я няма',
      planTitles(h).every(x => x.indexOf('Постоянна само за Ловеч') < 0), JSON.stringify(planTitles(h)));
    ok('КОНТРОЛА: своите се виждат',
      planTitles(h).some(x => x.indexOf('Провери етикетите') >= 0));

    /* офисът с избран Ловеч вижда точно тях */
    const h2 = await view(db, { user: ADMIN });
    h2.w.bulPlanStore = 'Ловеч';
    try { h2.w.localStorage.setItem('bulPlanOpen', '1'); } catch (e) {}
    h2.w.renderBulletin();
    await settle(() => planTitles(h2).length > 0);
    ok('офисът с избран Ловеч вижда неговите задачи',
      planTitles(h2).some(x => x.indexOf('Само за Ловеч') >= 0), JSON.stringify(planTitles(h2)));
  }

  report();
})();
