/* Изключената за седмицата постоянна задача НЕ се показва на обекта (15.10.2026).

   Сигнал: Миглена изключи „ПРИСЪСТВЕН ГРАФИК" (Инфо) за С42 за всички обекти,
   а Петрич я виждаше в календара за деня като жива Инфо задача. Две причини:
     1) в календара и в „План за деня" клонът taskIsNotice() стоеше ПРЕДИ
        проверката за изключване — Инфо задачите никога не стигаха до нея;
     2) изключените по принцип се показваха на обекта като сив ред с бадж
        „⏸ Не се изисква тази седмица" — Тенчо реши, че това подвежда.
   Ново правило (bulSkipHidden в bulletin.js): за НЕглобален потребител
   изключената за седмицата (глобално или за неговия обект) не се рендира
   никъде — главен списък („Постоянни задачи"), календар, „План за деня" —
   включително Инфо. Глобалните роли: без промяна — сив ред, бадж, „Върни".

   Сценарии (всеки за обикновена И за Инфо задача):
     1. обект, глобално изключване → няма ред в нито един от трите изгледа;
     2. обект, изключване само за ДРУГ обект → вижда се нормално;
     3. обект, без изключване → вижда се нормално;
     4. admin, глобално изключване → в списъка сив ред с бадж и „↩ Върни";
        в календара обикновената е сив ред (.rec-skip-row) ×7, а Инфо — както
        и досега, Инфо ред (за глобалния изглед нищо не е пипано).

   Мутации (15.10.2026, всяка срещу bulletin.js, после върнат):
     (а) махнат `&&!bulSkipHidden(t)` от recItems в календара (старото
         поведение „Инфо преди изключване")       → сц.1 пада (календар, и Инфо) ✔
     (б) bulSkipHidden без условието за обект (`vs&&` махнато) → крие и за
         admin                                    → сц.4 пада ✔
     (в) bulSkipHidden третира чуждо магазинно изключване като свое
         (`||recurringSkipStores(t.id,bulSkips).length`) → сц.2 пада ✔
     (г) махнат `if(bulSkipHidden(t)) return;` в bulPlanGroups → Инфо отново
         в „План за деня"                         → сц.1 i-g (план) пада ✔
     Срещу origin/main (5411b96) тестът е червен: i-g е в календара и в плана,
     r-g/i-g са сив ред в списъка — точно сигналът от Петрич.

   Пускане: node tests/skip-hide.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

/* Котва: четвъртъкът от текущата реална седмица (модел от
   recurring-task-skips.test.js). Ключът за седмицата се смята независимо. */
const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (4 - ((d.getDay() + 6) % 7)));
  return d;
})();
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

const KA = 'Кърджали', RA = 'Раднево';

/* „Всеки ден" — явява се в календара седем пъти и днес в плана. */
function rec(id, type) {
  return { id: id, title: 'Постоянна ' + id, department: 'trade', task_type: type,
    target_stores: null, due_weekday: null, due_weekdays: null, due_time: '20:00',
    linked_module: null, active: true, sort_order: 0 };
}
/* g = глобално изключена, o = изключена само за Раднево, n = без изключване;
   r- = обикновена, i- = Инфо (notice). */
const RECS = [
  rec('r-g', 'info'), rec('i-g', 'notice'),
  rec('r-o', 'info'), rec('i-o', 'notice'),
  rec('r-n', 'info'), rec('i-n', 'notice')
];
function skipRows(w) {
  const wk = { year: isoWeekYear(ANCHOR), week: w.weekNum(ANCHOR) };
  const row = (id, sid, store) => ({ id: sid, recurring_task_id: id, year: wk.year, week_number: wk.week,
    store_name: store, reason: 'присъствен график', created_by: 'Миглена' });
  return [row('r-g', 's1', null), row('i-g', 's2', null), row('r-o', 's3', RA), row('i-o', 's4', RA)];
}

function env(user) {
  let bul = null, rows = [];
  const h = boot({
    modules: ['bulletin.js'],
    user: Object.assign({ email: 'u@temax.bg', display_name: 'Тест' }, user),
    data: {
      users: [{ store_name: KA }, { store_name: RA }],
      recurring_tasks: RECS,
      recurring_task_skips: () => rows,
      bulletins: () => [bul],
      bulletin_tasks: [],
      task_completions: []
    }
  });
  freezeDate(h.w);
  try { h.w.localStorage.removeItem('bulPlanOpen'); } catch (e) {}
  rows = skipRows(h.w);
  const cal = {};
  h.w.DKEYS.forEach(k => { cal[k] = []; });
  bul = { id: 'b-1', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published',
    content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
  return h;
}
async function settle(cond, max) {
  for (let i = 0; i < (max || 40); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
function txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
function count(hay, needle) { return hay.split(needle).length - 1; }

async function load(user) {
  const h = env(user);
  h.w.bulActiveDept = 'trade';
  h.w.reportableStoresCache = [KA, RA];
  if (user.role === 'admin') h.w.bulPlanStore = KA;
  guard('loadBulletin() не хвърля (' + (user.store_name || user.role) + ')', () => h.w.loadBulletin());
  await settle(() => !!h.doc.getElementById('sec-calendar') && !!h.doc.getElementById('sec-dayplan') &&
    Array.isArray(h.w.bulSkips) && h.w.bulSkips.length === 4);
  return h;
}

/* Трите изгледа — всеки в СВОЯ контейнер. Главният списък е редовете с
   data-rec-row (те съществуват само там); календарът и планът се търсят по
   заглавие вътре в #sec-calendar / #sec-dayplan. */
function views(h, id) {
  const doc = h.doc;
  const calEl = doc.getElementById('sec-calendar'), planEl = doc.getElementById('sec-dayplan');
  return {
    list: doc.querySelector('[data-rec-row="' + id + '"]'),
    cal: count(txt(calEl), 'Постоянна ' + id),
    plan: count(txt(planEl), 'Постоянна ' + id),
    calSkip: Array.prototype.filter.call(doc.querySelectorAll('#sec-calendar .rec-skip-row'),
      r => txt(r).indexOf('Постоянна ' + id) >= 0).length
  };
}

(async function () {

  const hk = await load({ role: 'manager', store_name: KA });
  {
    const doc = hk.doc;
    ok('контейнерите са отделни: календарът не съдържа главния списък',
      !doc.querySelector('#sec-calendar [data-rec-row]') && !doc.querySelector('#sec-dayplan [data-rec-row]'));
    ok('bulSkipViewStore() на обекта = Кърджали', hk.w.bulSkipViewStore() === KA);
  }

  section('1. Обект, глобално изключване → няма ред никъде (и за Инфо)');
  ['r-g', 'i-g'].forEach(id => {
    const v = views(hk, id);
    ok(id + ': няма ред в главния списък', !v.list);
    ok(id + ': няма ред в календара за деня', v.cal === 0, 'срещания: ' + v.cal);
    ok(id + ': няма ред в „План за деня"', v.plan === 0, 'срещания: ' + v.plan);
  });
  ok('бадж „Не се изисква" няма никъде на обекта', !hk.doc.querySelector('.rec-skip-badge') && !hk.doc.querySelector('.rec-skip-row'));

  section('2. Обект, изключване само за ДРУГ обект → вижда се нормално');
  ['r-o', 'i-o'].forEach(id => {
    const v = views(hk, id);
    ok(id + ': редът е в главния списък', !!v.list);
    ok(id + ': в календара — всеки от 7-те дни', v.cal === 7, 'срещания: ' + v.cal);
    ok(id + ': в „План за деня"', v.plan === 1, 'срещания: ' + v.plan);
    ok(id + ': без сив ред в календара', v.calSkip === 0);
  });
  ok('r-o: в календара има чекбокс (7)', hk.doc.querySelectorAll('#sec-calendar input[data-rtid="r-o"]').length === 7);
  ok('r-o: в списъка — чекбокс, без ⏸', (() => { const r = views(hk, 'r-o').list; return r && !!r.querySelector('input[type=checkbox]') && !r.querySelector('.rec-skip-badge'); })());

  section('3. Обект, без изключване → вижда се нормално');
  ['r-n', 'i-n'].forEach(id => {
    const v = views(hk, id);
    ok(id + ': редът е в главния списък', !!v.list);
    ok(id + ': в календара — всеки от 7-те дни', v.cal === 7, 'срещания: ' + v.cal);
    ok(id + ': в „План за деня"', v.plan === 1, 'срещания: ' + v.plan);
  });

  /* Обратната страна на 2: Раднево Е изключеният обект за r-o / i-o. */
  section('2б. Раднево — собственото изключване го крие, глобалното също');
  {
    hk.w.currentUser = Object.assign({}, hk.w.currentUser, { store_name: RA });
    if (guard('renderBulView() като Раднево', () => hk.w.renderBulView())) {
      ['r-o', 'i-o', 'r-g', 'i-g'].forEach(id => {
        const v = views(hk, id);
        ok(id + ': Раднево не го вижда никъде', !v.list && v.cal === 0 && v.plan === 0, JSON.stringify({ list: !!v.list, cal: v.cal, plan: v.plan }));
      });
      ok('r-n: Раднево си я вижда', !!views(hk, 'r-n').list && views(hk, 'r-n').cal === 7);
    }
  }

  section('4. Admin, глобално изключване → сив ред, бадж, „↩ Върни" (без промяна)');
  {
    const ha = await load({ role: 'admin', store_name: 'Централен офис' });
    ok('bulSkipViewStore() на admin = null', ha.w.bulSkipViewStore() === null);
    ['r-g', 'i-g'].forEach(id => {
      const v = views(ha, id);
      if (ok(id + ': редът е в главния списък', !!v.list)) {
        const b = v.list.querySelector('.rec-skip-badge');
        ok(id + ': бадж „⏸ Не се изисква тази седмица"', b && txt(b) === '⏸ Не се изисква тази седмица', txt(b));
        ok(id + ': бутон „↩ Върни"', !!v.list.querySelector('.rec-unskip-all') && /Върни/.test(txt(v.list.querySelector('.rec-unskip-all'))));
        /* Отметките за настройка на офиса (.bul-allow-cb, 28.10.2026 — „обектът може да
           отлага“) са общи за всички седмици и стоят и тук; проверката е за отмятане. */
        ok(id + ': без чекбокс', !v.list.querySelector('input[type=checkbox]:not(.bul-allow-cb)'));
      }
    });
    const vr = views(ha, 'r-g');
    ok('r-g: сив ред в календара, 7 дни', vr.calSkip === 7, 'редове: ' + vr.calSkip);
    const vi = views(ha, 'i-g');
    ok('i-g: в календара остава Инфо редът, както преди (7 дни)', vi.cal === 7, 'срещания: ' + vi.cal);
    const vo = views(ha, 'r-o');
    ok('r-o: магазинното изключване — бадж „Не се изисква: Раднево" с ✕', vo.list && !!vo.list.querySelector('.rec-unskip-store'));
  }

  report();
})().catch(e => {
  /* Хвърляне извън guard() не бива да умре мълчаливо преди report(). */
  ok('тестът стига до края без необработено изключение', false, e && e.stack);
  report();
});
