/* Пилотни под-табове на „Ревизии и преоценка" (25.10.2026):
   „🏷️ Преоценка" → Кърджали, „➖ Минуси" → Гоце Делчев; офисът вижда и двата.
   И връзката от Бюлетина към тях (LINKED_MODULES 'revaluation' / 'minusi').

   Интеграционно: shared.js + bulletin.js + revaluation.js + revisions.js +
   minusi.js в реда от index.html. Флаговете (app_settings.revaluation_stores /
   minus_stores) се четат асинхронно при вход — §3 държи отговора, докато
   Бюлетинът вече е нарисуван, и проверява, че бутонът се появява след него.

   ТВЪРДЕНИЯТА:
   1. Под-бутоните по обект: списък / 'on' / 'off' / празно / паднала заявка;
      скрити ДО отговора (не мигат); офисът — винаги.
   2. Преоценка по обекта на бланката: rvCanEdit / rvCoCanUnlock за ЦО и
      регионален; списъкът на ЦО брои само включените („не са подали").
   3. Бюлетин: „🏷️ Преоценка →" за Кърджали (истински клик → mod-revaluation),
      не за Гоце Делчев; „➖ Минуси →" обратно; admin — и двата; паднала заявка
      за флага → без бутон. Без auto_complete за двата.

   МУТАЦИИ (пуснати на 25.10.2026, всяка е паднала, exit 1):
   M1 rvCanSee() пак гледа само rvStoresOn (без списъка)
      → падат „Кърджали вижда rvs-revaluation", „склад Кърджали…",
        „списък с интервали…", „Кърджали: бланката се рендира" и
        „след отговора: „🏷️ Преоценка →" се появява";
   M2a първото показване на rvs-minusi пак по mnCanSee()
      → пада „… и двата скрити ДО отговора (не мигат)";
   M2b показването след отговора пак по mnCanSee()
      → падат „Кърджали НЕ вижда rvs-minusi", „Шумен … нито един",
        „липсващ ключ…" и „паднала заявка → Минуси скрит";
   M3 loadBulletin без пререндер след флага (pilotWait.then махнат)
      → падат „след отговора: „🏷️ Преоценка →" се появява" и
        „Гоце Делчев: „➖ Минуси →"";
   M4 rvCoCanUnlock() пак по rvStoresOn === true
      → пада „ЦО, бланка на Кърджали → може да отключи";
   M5 списъкът на ЦО без филтъра по пилота
      → падат „само Кърджали", „не са подали 0" и „обект с бланка остава".

   Пускане: node tests/pilot-tabs.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick, dayOffset } = H;

const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
  return d;
})();
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
function isoWeekYear(d) { const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); return t.getFullYear(); }
function freezeDate(w) {
  const Real = w.Date, ms = ANCHOR.getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}
const WED = isoOf(ANCHOR);

const KARDZHALI = { email: 'managerkardjali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали', assigned_stores: [] };
const KARDZHALI_SKLAD = { email: 'sklad.kardjali@temax.bg', display_name: 'Склад Кърджали', role: 'sklad', store_name: 'Кърджали', assigned_stores: [] };
const GOTSE = { email: 'gotsedelchev@temax.bg', display_name: 'Управител Гоце Делчев', role: 'manager', store_name: 'Гоце Делчев', assigned_stores: [] };
const SHUMEN = { email: 'shumen@temax.bg', display_name: 'Управител Шумен', role: 'manager', store_name: 'Шумен', assigned_stores: [] };
const ADMIN = { email: 'ten.tenev@temax.bg', display_name: 'Тен Тенев', role: 'admin', store_name: 'Централен офис' };
const CONTROLLING = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'controlling', store_name: 'Централен офис' };
const REGIONAL = { email: 'reg@temax.bg', display_name: 'Регионален', role: 'accounting', store_name: 'Централен офис', is_regional: true, assigned_stores: ['Кърджали', 'Шумен'] };
const PILOT = { revaluation_stores: 'Кърджали', minus_stores: 'Гоце Делчев' };

const OPEN = { id: 'c-1', title: 'Преоценка 10.2026', kind: 'mandatory', starts_on: dayOffset(-10), ends_on: dayOffset(10), default_pct: 50, status: 'open' };  /* ±10: датата е замразена в сряда */
const TASK_RV = { id: 'r-rv', title: 'ПРЕОЦЕНКА — ПОДАЙ БЛАНКАТА', department: 'admin', task_type: 'info', active: true,
  sort_order: 1, due_weekday: 2, due_weekdays: [2], due_time: '20:00', due_window: false,
  target_stores: null, report_groups: null, linked_module: 'revaluation' };
const TASK_MN = Object.assign({}, TASK_RV, { id: 'r-mn', title: 'МИНУСИ — ПОПЪЛНИ ПРИЧИНИТЕ', sort_order: 2, linked_module: 'minusi' });

/* settings: { ключ: стойност } — mock-ът връща само поисканите ключове
   (key=eq.X / key=in.(a,b)), както PostgREST. */
function settingsRows(settings) {
  return url => {
    const u = decodeURIComponent(url);
    const m = /key=eq\.([^&]+)/.exec(u) || /key=in\.\(([^)]*)\)/.exec(u);
    const keys = m ? m[1].split(',') : Object.keys(settings);
    return keys.filter(k => settings[k] !== undefined).map(k => ({ key: k, value: settings[k] }));
  };
}
function env(user, o) {
  o = o || {};
  const settings = o.settings || PILOT;
  const h = boot({
    modules: ['bulletin.js', 'revaluation.js', 'revisions.js', 'minusi.js'],
    user: user, confirm: true, fail: o.fail,
    data: {
      app_settings: settingsRows(settings),
      users: [user], stores: (o.stores || ['Кърджали', 'Гоце Делчев', 'Шумен']).map(n => ({ name: n })),
      recurring_tasks: o.tasks || [TASK_RV, TASK_MN], recurring_task_periods: [], recurring_task_skips: [], recurring_task_versions: [],
      bulletins: () => [{
        id: 'b-1', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published', created_at: WED,
        content: { calendar: (function () { const c = {}; h.w.DKEYS.forEach(k => { c[k] = []; }); return c; })(),
                   columns: { trade: [], warehouse: [], admin: [] } }
      }],
      bulletin_tasks: [], task_completions: [], bulletin_promotions: [], task_subtasks: [], subtask_completions: [],
      notification_schedules: [], report_snapshots: [],
      revaluation_campaigns: [o.campaign || OPEN], revaluation_submissions: o.subs || [], revaluation_items: [], revaluation_codes: [],
      revision_schedule: [], minus_plants: [], minus_reasons: [], minus_uom_thresholds: [], minus_movements: [], minus_uploads: []
    }
  });
  /* Задържане на флаговете на пилота — §3 рисува Бюлетина ПРЕДИ отговора. */
  h.gate = null;
  if (o.hold) {
    let release;
    const gate = new Promise(r => { release = r; });
    h.release = release;
    const real = h.w.fetch;
    h.w.fetch = function (url, init) {
      const u = decodeURIComponent(String(url));
      if (/app_settings/.test(u) && /(revaluation_stores|minus_stores)/.test(u)) return gate.then(() => real(url, init));
      return real(url, init);
    };
  }
  freezeDate(h.w);
  h.w.bulSelectedId = 'b-1';
  h.w.bulActiveDept = 'admin';
  h.w.reportableStoresCache = [user.store_name];
  h.w.allStoresCache = [user.store_name];
  return h;
}
async function settle(n) { for (let i = 0; i < (n || 40); i++) await ticks(); }
const shown = (h, id) => { const b = h.doc.getElementById(id); return !!b && b.style.display !== 'none'; };
async function login(user, o) {
  const h = env(user, o);
  guard('setupTabsForRole', () => h.w.setupTabsForRole());
  h.before = { rv: shown(h, 'rvs-revaluation'), mn: shown(h, 'rvs-minusi') };
  await settle(10);
  return h;
}
const linkedBtns = (h, mod) => Array.from(h.doc.querySelectorAll('#mod-bulletin button[data-mod="' + mod + '"]'));

(async function run() {

  section('1. Под-бутоните по обект');
  {
    let h = await login(KARDZHALI);
    ok('Кърджали вижда rvs-revaluation', shown(h, 'rvs-revaluation'));
    ok('Кърджали НЕ вижда rvs-minusi', !shown(h, 'rvs-minusi'));
    ok('… и двата скрити ДО отговора (не мигат)', h.before.rv === false && h.before.mn === false);
    ok('заявката за Минуси е точно за ключа', h.calls.get.some(u => decodeURIComponent(u).indexOf('/app_settings?key=eq.minus_stores&') >= 0));

    h = await login(KARDZHALI_SKLAD);
    ok('склад Кърджали — същото (Преоценка да, Минуси не)', shown(h, 'rvs-revaluation') && !shown(h, 'rvs-minusi'));

    h = await login(GOTSE);
    ok('Гоце Делчев НЕ вижда rvs-revaluation', !shown(h, 'rvs-revaluation'));
    ok('Гоце Делчев вижда rvs-minusi', shown(h, 'rvs-minusi'));

    h = await login(SHUMEN);
    ok('Шумен (извън двата пилота) — нито един', !shown(h, 'rvs-revaluation') && !shown(h, 'rvs-minusi'));

    h = await login(ADMIN);
    ok('admin вижда и двата', shown(h, 'rvs-revaluation') && shown(h, 'rvs-minusi'));
    h = await login(CONTROLLING);
    ok('controlling вижда и двата', shown(h, 'rvs-revaluation') && shown(h, 'rvs-minusi'));
    h = await login(ADMIN, { settings: { revaluation_stores: 'off' } });
    ok('admin при „off“ и без minus_stores — пак вижда и двата', shown(h, 'rvs-revaluation') && shown(h, 'rvs-minusi'));

    h = await login(SHUMEN, { settings: { revaluation_stores: 'on', minus_stores: 'Гоце Делчев' } });
    ok('„on“ пуска всички (Шумен)', shown(h, 'rvs-revaluation'));
    h = await login(GOTSE, { settings: { revaluation_stores: ' ON ' } });
    ok('„ ON “ (главни, интервал) пуска всички (Гоце Делчев)', shown(h, 'rvs-revaluation'));
    h = await login(KARDZHALI, { settings: { revaluation_stores: 'off' } });
    ok('„off“ — никой обект (Кърджали)', !shown(h, 'rvs-revaluation'));
    h = await login(KARDZHALI, { settings: { revaluation_stores: '' } });
    ok('празно — никой обект', !shown(h, 'rvs-revaluation'));
    h = await login(KARDZHALI, { settings: {} });
    ok('липсващ ключ — никой обект, и без Минуси', !shown(h, 'rvs-revaluation') && !shown(h, 'rvs-minusi'));
    h = await login(SHUMEN, { settings: { revaluation_stores: ' Кърджали ,Шумен ', minus_stores: 'Гоце Делчев, Шумен' } });
    ok('списък с интервали → Шумен вижда и двата', shown(h, 'rvs-revaluation') && shown(h, 'rvs-minusi'));
    h = await login(KARDZHALI, { settings: { revaluation_stores: 'Кърджалии' } });
    ok('сходно, но различно име — не е включен', !shown(h, 'rvs-revaluation'));

    h = await login(KARDZHALI, { fail: { GET: /app_settings/ } });
    ok('паднала заявка → Преоценка скрита', !shown(h, 'rvs-revaluation'));
    h = await login(GOTSE, { fail: { GET: /app_settings/ } });
    ok('паднала заявка → Минуси скрит', !shown(h, 'rvs-minusi'));
    ok('… без червен toast при вход', !h.calls.toast.some(t => /Грешка/.test(t)));
    h = await login(ADMIN, { fail: { GET: /app_settings/ } });
    ok('паднала заявка — admin пак вижда и двата', shown(h, 'rvs-revaluation') && shown(h, 'rvs-minusi'));

    /* Пазачът вътре в Минуси остава: обект без бутона, отворил модула отвън. */
    h = await login(KARDZHALI);
    h.w.showModule('minusi'); await settle(10);
    const off = h.doc.getElementById('mn-off');
    ok('Кърджали през showModule(minusi) → „още не е включен“, без движения',
      !!off && !h.calls.get.some(u => u.indexOf('minus_movements') >= 0));
  }

  section('2. Преоценка — по обекта на бланката');
  {
    let h = await login(ADMIN, { subs: [{ id: 's-k', campaign_id: 'c-1', store_name: 'Кърджали', status: 'processed', no_items: false }] });
    guard('showModule(revaluation)', () => h.w.showModule('revaluation')); await settle(10);
    const rows = Array.from(h.doc.querySelectorAll('#rv-co-rows tr')).map(tr => tr.id);
    ok('списъкът на ЦО при пилот — само Кърджали', rows.join(',') === 'rv-co-Кърджали', rows.join(','));
    const tally = h.doc.getElementById('rv-co-tally');
    ok('„не са подали 0“ — Шумен и Гоце Делчев не се броят', !!tally && /не са подали 0/.test(tally.textContent), tally && tally.textContent);
    await h.w.rvCoOpenStore('Кърджали'); await settle(10);
    ok('ЦО, бланка на Кърджали → може да отключи', h.w.rvCoCanUnlock() === true);
    h.w.rvStore = 'Шумен';
    ok('ЦО, бланка на Шумен → не може (Шумен не е включен)', h.w.rvCoCanUnlock() === false);

    h = await login(ADMIN, { settings: { revaluation_stores: 'on' } });
    h.w.showModule('revaluation'); await settle(10);
    ok('при „on“ — списъкът на ЦО е с всички обекти', h.doc.querySelectorAll('#rv-co-rows tr[id^="rv-co-"]').length === 3);

    h = await login(ADMIN, { settings: { revaluation_stores: 'Шумен' }, subs: [{ id: 's-k', campaign_id: 'c-1', store_name: 'Кърджали', status: 'submitted', no_items: false }] });
    h.w.showModule('revaluation'); await settle(10);
    const rows2 = Array.from(h.doc.querySelectorAll('#rv-co-rows tr')).map(tr => tr.id).sort();
    ok('обект с бланка остава в списъка, макар да не е включен', rows2.join(',') === 'rv-co-Кърджали,rv-co-Шумен', rows2.join(','));

    h = await login(REGIONAL);
    h.w.showModule('revaluation'); await settle(10);
    await h.w.rvCoOpenStore('Кърджали'); await settle(10);
    ok('регионален: пише в бланката на Кърджали (включен)', h.w.rvCanEdit() === true);
    await h.w.rvCoOpenStore('Шумен'); await settle(10);
    ok('регионален: НЕ пише в бланката на Шумен (свой, но не е включен)', h.w.rvCanEdit() === false);

    h = await login(KARDZHALI);
    h.w.showModule('revaluation'); await settle(10);
    ok('Кърджали: бланката се рендира („Качи файл“)', Array.from(h.doc.querySelectorAll('#mod-revaluation button')).some(b => /Качи файл/.test(b.textContent)));
    h = await login(GOTSE);
    h.w.showModule('revaluation'); await settle(10);
    ok('Гоце Делчев през showModule(revaluation) → „Нямаш достъп“', /Нямаш достъп/.test(h.doc.getElementById('mod-revaluation').textContent));
  }

  section('3. Бюлетин — бутоните към под-табовете');
  {
    const opts = h => Array.from(h.doc.createRange().createContextualFragment('<select>' + h.w.linkedModuleOptsHtml('') + '</select>').querySelectorAll('option')).map(o => o.value + '=' + o.textContent);
    let h = await login(ADMIN);
    ok('LINKED_MODULES: „🏷️ Преоценка“ и „➖ Минуси“ в менюто на формата',
      opts(h).indexOf('revaluation=🏷️ Преоценка') >= 0 && opts(h).indexOf('minusi=➖ Минуси') >= 0, opts(h).join(' | '));
    const autoWrap = v => /display:none/.test(h.w.bulAutoCompleteFieldHtml('x', false, v));
    ok('без auto_complete за двата (полето е скрито)', autoWrap('revaluation') && autoWrap('minusi') && !autoWrap('transit'));

    /* Кърджали: Бюлетинът се рисува, ДОКАТО флагът още не е дошъл. */
    h = env(KARDZHALI, { hold: true });
    guard('setupTabsForRole', () => h.w.setupTabsForRole());
    guard('loadBulletin() не хвърля', () => h.w.loadBulletin());
    await settle(60);
    ok('Бюлетинът е нарисуван преди отговора (задачата е там)', /ПРЕОЦЕНКА — ПОДАЙ БЛАНКАТА/.test(h.doc.getElementById('mod-bulletin').textContent));
    ok('преди отговора: без бутон „🏷️ Преоценка →“', linkedBtns(h, 'revaluation').length === 0);
    h.release(); await settle(60);
    const rvB = linkedBtns(h, 'revaluation');
    ok('след отговора: „🏷️ Преоценка →“ се появява', rvB.length > 0 && rvB[0].textContent === '🏷️ Преоценка →', rvB.map(b => b.textContent).join('|'));
    ok('Кърджали: без „➖ Минуси →“', linkedBtns(h, 'minusi').length === 0);
    if (rvB.length) {
      realClick(h.w, rvB[0]); await settle(30);
      ok('клик → mod-revaluation е показан', h.doc.getElementById('mod-revaluation').style.display === 'block');
      ok('… и под-бутонът „🏷️ Преоценка“ е активен', h.doc.getElementById('rvs-revaluation').classList.contains('active'));
      ok('… бланката е на Кърджали (не „Нямаш достъп“)', !/Нямаш достъп/.test(h.doc.getElementById('mod-revaluation').textContent));
    }

    h = env(GOTSE, { hold: true });
    h.w.setupTabsForRole(); h.w.loadBulletin(); await settle(60);
    h.release(); await settle(60);
    ok('Гоце Делчев: без „🏷️ Преоценка →“', linkedBtns(h, 'revaluation').length === 0);
    const mnB = linkedBtns(h, 'minusi');
    ok('Гоце Делчев: „➖ Минуси →“', mnB.length > 0 && mnB[0].textContent === '➖ Минуси →');
    if (mnB.length) {
      realClick(h.w, mnB[0]); await settle(30);
      ok('клик → mod-minusi е показан', h.doc.getElementById('mod-minusi').style.display === 'block');
      ok('… и под-бутонът „➖ Минуси“ е активен', h.doc.getElementById('rvs-minusi').classList.contains('active'));
    }

    h = await login(ADMIN); h.w.loadBulletin(); await settle(60);
    ok('admin: и двата бутона', linkedBtns(h, 'revaluation').length > 0 && linkedBtns(h, 'minusi').length > 0);

    h = await login(SHUMEN); h.w.loadBulletin(); await settle(60);
    ok('Шумен: нито един от двата', linkedBtns(h, 'revaluation').length === 0 && linkedBtns(h, 'minusi').length === 0);

    h = await login(KARDZHALI, { fail: { GET: /app_settings/ } }); h.w.loadBulletin(); await settle(60);
    ok('паднала заявка за флага → без бутон (Кърджали)', linkedBtns(h, 'revaluation').length === 0);
    ok('… а задачата си е там', /ПРЕОЦЕНКА — ПОДАЙ БЛАНКАТА/.test(h.doc.getElementById('mod-bulletin').textContent));

    /* Флагът вече е дошъл → няма какво да се чака, без втори рендер. */
    h = await login(KARDZHALI);
    ok('след отговора bulPilotFlagsWait() → null', h.w.bulPilotFlagsWait() === null);
  }

  report();
})();
