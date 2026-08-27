/* Камбанката 🔔 по редовете в Бюлетина + новата секция „Насрочени напомняния"
   в Администрация.

   Два дефекта, които този тест заковава:

   1) Модалът нямаше избор на обект. target_store оставаше null, а
      dynamic-responder при празно поле праща БЕЗ филтър — тоест до цялата
      верига, включително ЦО. Напомняне за задача на един магазин звънеше
      навсякъде. Затова тук се проверява не само че изборът се записва, а и че
      празният избор СЕ ВИЖДА като „до всички" ПРЕДИ натискане на бутона:
      разликата между „не съм избрал" и „избрах всички" е цялата разлика.

   2) Модалът предлагаше дневно и седмично. Това са правила, а правилата се
      задават централно в Администрация → Известия. Оттам идват шестте
      заварени реда от 10.08.2026, за които никой не помни защо съществуват.
      Създаването пада до еднократно; ПОКАЗВАНЕТО на заварените остава —
      затова има изрична проверка, че weekly ред се рендира без да гърми.

   Датата по подразбиране е locale-чувствителна: today() е toISOString(),
   тоест UTC, и в ранните часове по българско време дава вчера. Проверката е
   закована с ФИКСИРАН момент (27.08.2026, 00:30 българско), не с текущия —
   иначе минава вечер и пада сутрин.

   Анти-тавтологичен контрол за точки 2, 4 и 6.

   Пускане: node tests/notify-schedule-stores.test.js . */
'use strict';

/* Часовата зона се заковава ПРЕДИ първото докосване на Date. Без нея тестът
   за локалната дата е безсмислен в UTC машина: там local и UTC съвпадат и
   проверката минава срещу непоправен код. Че е приложена, се доказва изрично
   в секция 4 — не се приема наум. */
process.env.TZ = 'Europe/Sofia';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, ok, guard, section, report, ticks } = H;

const ADMIN = { id: 'u-adm', email: 'admin@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

/* Уникалните store_name от users — точно това чете loadReportableStores().
   ЦО и складовете отпадат сами (REPORT_EXCLUDED_STORES). */
const USERS = [
  { store_name: 'Троян' },
  { store_name: 'Ловеч' },
  { store_name: 'Плевен' },
  { store_name: 'Централен офис' }
];

/* Заварен ред от 10.08.2026: седмичен, без обекти. Не се пипа — само се
   показва. */
const LEGACY_WEEKLY = {
  id: 'sch-legacy', entity_type: 'recurring_task', entity_id: 'rec-1',
  schedule_type: 'weekly', scheduled_date: null, day_of_week: 'fri',
  scheduled_time: '14:30:00', message: null, target_store: null,
  target_stores: null, active: false, created_by: 'Юлиана Койчева',
  last_sent_at: null, created_at: '2026-08-10T10:47:04Z'
};

function bulEnv(over) {
  over = over || {};
  return boot({
    modules: ['bulletin.js'],
    user: over.user || ADMIN,
    data: Object.assign({
      users: USERS,
      notification_schedules: over.schedules !== undefined ? over.schedules : [],
      stores: []
    }, over.data || {}),
    confirm: over.confirm
  });
}

/* Отваря камбанката и изчаква и списъка, и попълването на обектите. */
async function openBell(over) {
  const h = bulEnv(over);
  h.w.openNotifyScheduleModal('task', 't-1', 'Смяна на ценови етикети');
  await ticks();
  return h;
}

const modal    = doc => doc.getElementById('notify-modal-ov');
const storeSel = doc => doc.getElementById('ns-stores');
const hint     = doc => doc.getElementById('ns-stores-hint');
const schedPosts = h => h.calls.post.filter(p => p.table === 'notification_schedules');

/* Избира опции по име и подава change — както прави човек с Ctrl. */
function pickStores(h, names) {
  const sel = storeSel(h.doc);
  Array.prototype.slice.call(sel.options).forEach(o => { o.selected = names.indexOf(o.value) >= 0; });
  fire(h.w, sel, 'change');
}

/* ── Заковаване на часовника вътре в jsdom прозореца ───────────────────────
   bulTodayISO() вика new Date() в scope-а на window, затова се подменя
   w.Date, не глобалният Node Date. */
function pinClock(w, iso) {
  const Real = w.Date;
  const FIXED = Real.parse(iso);
  function Fake(...a) {
    if (!(this instanceof Fake)) return new Real(FIXED).toString();
    return a.length ? new Real(...a) : new Real(FIXED);
  }
  Fake.prototype = Real.prototype;
  Fake.now = () => FIXED;
  Fake.parse = Real.parse;
  Fake.UTC = Real.UTC;
  w.Date = Fake;
  return () => { w.Date = Real; };
}

/* ══ Администрация ═══════════════════════════════════════════════════════ */

const ADM_TOPICS = [
  { key: 'overdue_tasks', label: 'Просрочени задачи', description: null,
    schedule_type: 'daily', weekdays: [1,2,3,4,5], day_of_week: null,
    scheduled_time: '08:15:00', active: true, test_email: null,
    last_run_at: null, last_recipients: null, last_status: null, sort_order: 10 }
];

/* Три реда: жив запис, ИЗТРИТ запис (id, за който няма ред в таблицата) и
   заварения weekly. */
const ADM_SCHEDULES = [
  { id: 'sch-live', entity_type: 'task', entity_id: 't-1', schedule_type: 'once',
    scheduled_date: '2026-09-01', day_of_week: null, scheduled_time: '09:00:00',
    message: null, target_store: null, target_stores: ['Троян', 'Ловеч'],
    active: true, created_by: 'Тен Тенев', last_sent_at: null, created_at: '2026-08-27T10:00:00Z' },
  { id: 'sch-gone', entity_type: 'task', entity_id: 't-НЯМА', schedule_type: 'once',
    scheduled_date: '2026-09-02', day_of_week: null, scheduled_time: '10:00:00',
    message: null, target_store: null, target_stores: null,
    active: true, created_by: 'Юлиана Койчева', last_sent_at: null, created_at: '2026-08-27T09:00:00Z' },
  LEGACY_WEEKLY
];

const ADM_TASKS = [{ id: 't-1', title: 'Смяна на ценови етикети' }];
const ADM_RECUR = [{ id: 'rec-1', title: 'СПРАВКА МИНУСИ' }];

function idInFixture(list) {
  return function (url) {
    const m = String(url).match(/id=in\.\(([^)]*)\)/);
    if (!m) return list;
    const ids = m[1].split(',').map(x => decodeURIComponent(x));
    return list.filter(r => ids.indexOf(String(r.id)) >= 0);
  };
}

async function admLoaded(over) {
  over = over || {};
  const h = boot({
    modules: ['admin.js'],
    user: ADMIN,
    data: Object.assign({
      notification_topics: ADM_TOPICS,
      notification_matrix: [],
      notification_overrides: [],
      users: [],
      stores: [],
      notification_schedules: over.schedules !== undefined ? over.schedules : ADM_SCHEDULES,
      bulletin_tasks: idInFixture(over.tasks !== undefined ? over.tasks : ADM_TASKS),
      recurring_tasks: idInFixture(ADM_RECUR),
      bulletin_promotions: idInFixture([]),
      task_subtasks: idInFixture([])
    }, over.data || {}),
    confirm: over.confirm
  });
  h.w.loadNotificationsAdmin();
  await ticks();
  await ticks();
  return h;
}

const schedRows = doc => Array.prototype.slice.call(
  doc.querySelectorAll('#notif-schedules-body tbody tr'));
function schedRowByCreator(doc, who) {
  return schedRows(doc).find(tr => (tr.textContent || '').indexOf(who) >= 0) || null;
}

(async function run() {

  /* ═══ 1. Само еднократно ═════════════════════════════════════════════ */
  section('1. Модалът предлага САМО еднократно');
  {
    const h = await openBell();
    const mod = modal(h.doc);
    if (ok('модалът се отвори', !!mod)) {
      ok('няма падащо меню за вид разписание', !h.doc.getElementById('ns-type'));
      ok('няма поле за ден от седмицата', !h.doc.getElementById('ns-dow'));
      ok('updateNotifyTypeFields() вече не съществува',
        typeof h.w.updateNotifyTypeFields === 'undefined');

      const txt = mod.textContent || '';
      ok('нито „Всеки ден", нито „Всяка седмица" се предлагат за създаване',
        txt.indexOf('Всеки ден') < 0 && txt.indexOf('Всяка седмица') < 0, txt.slice(0, 400));
      ok('казва къде се задават повтарящите се',
        txt.indexOf('Администрация') >= 0 && txt.indexOf('Известия') >= 0);

      ok('остават дата, час и текст',
        !!h.doc.getElementById('ns-date') && !!h.doc.getElementById('ns-time') &&
        !!h.doc.getElementById('ns-message'));
    }
    h.close();
  }

  /* ═══ 2. Празен избор → „до всички", видимо ПРЕДИ бутона ═════════════ */
  section('2. Празен избор се показва изрично като „до всички"');
  {
    const h = await openBell();
    const hn = hint(h.doc);
    let hintBefore = '';
    if (ok('има ред под списъка с обекти', !!hn)) {
      hintBefore = hn.textContent || '';
      ok('при празен избор пише „до ВСИЧКИ"', hintBefore.indexOf('ВСИЧКИ') >= 0, hintBefore);
      ok('и казва, че нищо не е избрано', hintBefore.indexOf('нищо не е избрано') >= 0, hintBefore);
    }

    /* И чак СЕГА бутонът. Редът има значение: текстът трябва да е бил там
       преди записа, не да се появи след него. */
    if (guard('бутонът „Насрочи напомняне" се натиска',
      () => realClick(h.w, btn(modal(h.doc), 'Насрочи напомняне')))) {
      await ticks();
      const posts = schedPosts(h);
      if (ok('има точно един POST', posts.length === 1, JSON.stringify(posts.map(p => p.body)))) {
        const b = posts[0].body;
        const empty = b.target_stores === null || (Array.isArray(b.target_stores) && !b.target_stores.length);
        ok('target_stores е празен (null или [])', empty, JSON.stringify(b.target_stores));
        ok('видът е еднократно', b.schedule_type === 'once', b.schedule_type);
      }
    }
    h.close();
  }

  /* — анти-тавтология за 2: същата проверка НЕ минава при избрани обекти — */
  section('2к. Контрол: при избрани обекти текстът НЕ казва „до всички"');
  {
    const h = await openBell();
    pickStores(h, ['Троян', 'Ловеч']);
    const t = (hint(h.doc).textContent || '');
    ok('текстът се смени', t.indexOf('ВСИЧКИ') < 0, t);
    ok('и изброява избраните', t.indexOf('Троян') >= 0 && t.indexOf('Ловеч') >= 0, t);
    h.close();
  }

  /* ═══ 3. Два обекта стигат до заявката ═══════════════════════════════ */
  section('3. Избор на два обекта → POST носи и двата');
  {
    const h = await openBell();
    const sel = storeSel(h.doc);
    if (ok('списъкът с обекти е попълнен', !!sel && sel.options.length > 0,
      sel ? sel.options.length + ' опции' : 'няма select')) {
      const names = Array.prototype.slice.call(sel.options).map(o => o.value);
      ok('е многоредов', sel.multiple === true);
      /* Източникът е loadReportableStores(), не таблицата stores: ЦО не бива
         да е сред опциите. */
      ok('ЦО не е сред обектите', names.indexOf('Централен офис') < 0, names.join(', '));
      ok('магазините са там', names.indexOf('Троян') >= 0 && names.indexOf('Ловеч') >= 0, names.join(', '));
    }

    pickStores(h, ['Троян', 'Плевен']);
    if (guard('записва се', () => realClick(h.w, btn(modal(h.doc), 'Насрочи напомняне')))) {
      await ticks();
      const posts = schedPosts(h);
      if (ok('има POST', posts.length === 1)) {
        const ts = posts[0].body.target_stores;
        ok('target_stores е масив с ДВА обекта',
          Array.isArray(ts) && ts.length === 2, JSON.stringify(ts));
        ok('и това са точно избраните',
          Array.isArray(ts) && ts.indexOf('Троян') >= 0 && ts.indexOf('Плевен') >= 0,
          JSON.stringify(ts));
        ok('старата единична колона не се пипа', !('target_store' in posts[0].body));
      }
    }
    h.close();
  }

  /* ═══ 4. Датата по подразбиране е локалната, не UTC ══════════════════ */
  section('4. Дата по подразбиране: локална, не UTC');
  {
    /* 27.08.2026, 00:30 българско лятно (UTC+3) = 26.08.2026, 21:30 UTC.
       Локалната дата е 27-и, UTC датата е 26-и — точно прозорецът, в който
       today() лъже. */
    const h = bulEnv();
    const restore = pinClock(h.w, '2026-08-26T21:30:00Z');

    /* Доказваме, че TZ наистина е приложена. Без това проверката долу би
       минала и в UTC машина, където няма какво да се различи. */
    const probe = new h.w.Date('2026-08-26T21:30:00Z');
    ok('часовата зона на теста е българска (UTC+3 през август)',
      probe.getHours() === 0 && probe.getDate() === 27,
      'getHours=' + probe.getHours() + ' getDate=' + probe.getDate() + ' TZ=' + process.env.TZ);

    const utcDate = h.w.today();
    ok('today() (UTC) в този момент дава ВЧЕРАШНА дата',
      utcDate === '2026-08-26', utcDate);

    h.w.openNotifyScheduleModal('task', 't-1', 'Задача');
    await ticks();
    const fld = h.doc.getElementById('ns-date');
    if (ok('полето за дата съществува', !!fld)) {
      ok('стойността му е ЛОКАЛНАТА дата', fld.value === '2026-08-27', fld.value);
      /* Анти-тавтология: същата проверка пада срещу старото поведение. */
      ok('КОНТРОЛ: не е това, което today() би дал', fld.value !== utcDate,
        'поле=' + fld.value + '  today()=' + utcDate);
    }
    restore();
    h.close();
  }

  /* ═══ 5. Заварен weekly ред се показва, без да гърми ═════════════════ */
  section('5. Списъкът в модала показва заварените редове');
  {
    const h = await openBell({ schedules: [LEGACY_WEEKLY] });
    const wrap = h.doc.getElementById('notify-list-wrap');
    if (ok('списъкът се рендира', !!wrap)) {
      const t = wrap.textContent || '';
      ok('седмичният ред се вижда с истинското си разписание',
        t.indexOf('Всяка седмица') >= 0, t.slice(0, 300));
      ok('и с деня си', t.indexOf('Петък') >= 0, t.slice(0, 300));
      ok('часът е там', t.indexOf('14:30') >= 0, t.slice(0, 300));
      /* 1г: обектите се показват; ред без обекти е „до всички". */
      ok('ред без обекти пише „до всички"', t.indexOf('до всички') >= 0, t.slice(0, 300));
      ok('нищо не е гръмнало по пътя', h.calls.notOk.length === 0,
        JSON.stringify(h.calls.notOk));
    }

    /* И ред С обекти показва имената им. */
    const h2 = await openBell({
      schedules: [Object.assign({}, LEGACY_WEEKLY, {
        id: 'sch-2', schedule_type: 'once', scheduled_date: '2026-09-01',
        day_of_week: null, target_stores: ['Троян', 'Ловеч']
      })]
    });
    const t2 = (h2.doc.getElementById('notify-list-wrap').textContent || '');
    ok('ред с обекти ги изброява', t2.indexOf('Троян') >= 0 && t2.indexOf('Ловеч') >= 0, t2.slice(0, 300));
    ok('и НЕ казва „до всички"', t2.indexOf('до всички') < 0, t2.slice(0, 300));
    h.close(); h2.close();
  }

  /* ═══ 6. Администрация: изтрит запис се ВИЖДА ════════════════════════ */
  section('6. Секцията в Администрация показва изтрит запис');
  {
    const h = await admLoaded();
    const rows = schedRows(h.doc);
    if (ok('секцията се рендира с три реда', rows.length === 3, rows.length + ' реда')) {
      const gone = schedRowByCreator(h.doc, 'Юлиана Койчева');
      /* Именно този ред е най-важно да не се скрие. */
      if (ok('редът за изтрития запис е там', !!gone)) {
        ok('пише „(изтрит запис)"', (gone.textContent || '').indexOf('(изтрит запис)') >= 0,
          gone.textContent);
        ok('и не е скрит', !!gone.querySelector('.ntf-sched-gone'));
      }

      const live = schedRowByCreator(h.doc, 'Тен Тенев');
      if (ok('живият ред е там', !!live)) {
        const t = live.textContent || '';
        /* Анти-тавтология за 6: същата проверка НЕ пали срещу жив запис. */
        ok('КОНТРОЛ: живият ред НЕ пише „(изтрит запис)"', t.indexOf('(изтрит запис)') < 0, t);
        ok('показва заглавието на записа', t.indexOf('Смяна на ценови етикети') >= 0, t);
        ok('показва обектите', t.indexOf('Троян') >= 0 && t.indexOf('Ловеч') >= 0, t);
        ok('показва кой го е създал', t.indexOf('Тен Тенев') >= 0, t);
        ok('и че още не е тръгвало', t.indexOf('никога') >= 0, t);
      }

      /* Заварените дневни/седмични се ПОКАЗВАТ и тук — иначе шестте реда пак
         биха били невидими. */
      const wk = schedRows(h.doc).find(tr => (tr.textContent || '').indexOf('СПРАВКА МИНУСИ') >= 0);
      if (ok('заварената седмична е в списъка', !!wk)) {
        const t = wk.textContent || '';
        ok('с вида си', t.indexOf('Всяка седмица') >= 0, t);
        ok('и с деня си', t.indexOf('петък') >= 0, t);
        ok('ред без обекти пише „до всички"', t.indexOf('до всички') >= 0, t);
      }
    }
    ok('няма провалена заявка', h.calls.notOk.length === 0, JSON.stringify(h.calls.notOk));
    h.close();
  }

  /* ═══ 7. Администрация: спиране/пускане и триене, без създаване ══════ */
  section('7. Действия: спиране, пускане, триене — създаване НЯМА');
  {
    const h = await admLoaded();
    const body = h.doc.getElementById('notif-schedules-body');
    ok('няма бутон за създаване', !btn(body, '+ Ново') && !btn(body, 'Насрочи'),
      (body.textContent || '').slice(0, 200));

    const live = schedRowByCreator(h.doc, 'Тен Тенев');
    const cb = live.querySelector('input.ntf-sched-cb');
    if (ok('има превключвател', !!cb)) {
      cb.checked = false;
      fire(h.w, cb, 'change');
      await ticks();
      const pat = h.calls.patch.filter(p => p.table === 'notification_schedules');
      if (ok('спирането праща PATCH', pat.length === 1, JSON.stringify(pat))) {
        ok('active:false', pat[0].body.active === false, JSON.stringify(pat[0].body));
        ok('по id на реда', pat[0].url.indexOf('sch-live') >= 0, pat[0].url);
      }
    }
    h.close();
  }
  {
    /* Триене с отказано потвърждение — нищо не заминава. */
    const h = await admLoaded({ confirm: false });
    const live = schedRowByCreator(h.doc, 'Тен Тенев');
    if (guard('бутонът за триене се натиска', () => realClick(h.w, btn(live, '✕')))) {
      await ticks();
      ok('потвърждение се иска', h.calls.confirm.length === 1, JSON.stringify(h.calls.confirm));
      ok('при отказ НИЩО не се трие',
        h.calls.del.filter(u => u.indexOf('notification_schedules') >= 0).length === 0,
        JSON.stringify(h.calls.del));
    }
    h.close();
  }
  {
    const h = await admLoaded({ confirm: true });
    const live = schedRowByCreator(h.doc, 'Тен Тенев');
    if (guard('бутонът за триене се натиска', () => realClick(h.w, btn(live, '✕')))) {
      await ticks();
      const dels = h.calls.del.filter(u => u.indexOf('notification_schedules') >= 0);
      if (ok('при потвърждение се трие', dels.length === 1, JSON.stringify(h.calls.del))) {
        ok('точно този ред', dels[0].indexOf('sch-live') >= 0, dels[0]);
      }
    }
    h.close();
  }

  /* ═══ 8. Празен списък — без гърмеж ══════════════════════════════════ */
  section('8. Празни/липсващи данни');
  {
    const h = await admLoaded({ schedules: [] });
    const body = h.doc.getElementById('notif-schedules-body');
    ok('казва, че няма насрочени', (body.textContent || '').indexOf('Няма насрочени') >= 0,
      (body.textContent || '').slice(0, 200));
    ok('без провалени заявки', h.calls.notOk.length === 0, JSON.stringify(h.calls.notOk));
    h.close();
  }
  {
    /* Камбанка на обект без нито един насрочен ред. */
    const h = await openBell({ schedules: [] });
    const t = (h.doc.getElementById('notify-list-wrap').textContent || '');
    ok('модалът казва, че няма графици', t.indexOf('Няма зададени графици') >= 0, t);
    h.close();
  }

  /* ═══ 9. Едж функцията строи OR-верига по новата колона ══════════════ */
  section('9. dynamic-responder чете target_stores');
  {
    const fs = require('fs');
    const path = require('path');
    const ROOT = process.argv[2] || '.';
    const src = fs.readFileSync(
      path.join(ROOT, 'supabase/functions/dynamic-responder/index.ts'), 'utf8');

    ok('чете новата колона', /s\.target_stores/.test(src));
    ok('пада към старата, ако новата е празна',
      /if \(!stores\.length && s\.target_store\) stores = \[s\.target_store\];/.test(src));
    ok('строи OR-верига', /filters\.push\(\{ operator: 'OR' \}\)/.test(src));
    ok('филтърът е по таг store_name',
      /key: 'store_name', relation: '=', value: name/.test(src));
    /* Празно и в двете → БЕЗ филтър. Заварените шест реда са точно такива и
       поведението им не се променя. */
    ok('филтър се слага само при непразен списък', /if \(stores\.length\) \{/.test(src));
    ok('коментарът обяснява защо колоните са две',
      src.indexOf('target_stores (text[]) — НОВАТА') >= 0);
    ok('старият едноредов филтър го няма',
      !/pushBody\.filters = \[\{ field: 'tag'/.test(src));
  }

  report();
})();
