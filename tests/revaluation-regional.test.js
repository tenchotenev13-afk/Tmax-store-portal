/* Преоценка за регионален accounting (18.10.2026): вижда и обработва САМО
   зачислените си обекти — обзор, избор, дърво „История", лист и „Excel —
   този обект"; бутоните на ниво кампания (Excel — кампания, MM41, „Кодовете
   са създадени", График на кампаниите, Затвори) ги няма и не работят и при
   извикване отвън. admin с is_regional (В. Филев) — всичко (admin е admin).
   is_regional / assigned_stores идват от currentUser (rolesLoadRegional в
   shared.js), без собствена заявка към users.

   Мутационна проверка (18.10.2026) — всеки вариант е пуснат и е паднал:
     G1 обзорът не се филтрира по региона → пада „обзор: само Кърджали и Шумен";
     G2 кампанийните бутони видими за регионалния → пада „без бутоните на ниво кампания";
     G3 rvCoOpenStore без проверката за регион → пада „чужд обект → отказ, без лист".
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, ticks, dayOffset } = H;

const CAMP = { id: 'c-1', title: 'Октомври', kind: 'mandatory', starts_on: dayOffset(-2), ends_on: dayOffset(2), default_pct: 50, status: 'open' };
const SUBS = [
  { id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', status: 'submitted', no_items: false, submitted_at: new Date().toISOString() },
  { id: 's-2', campaign_id: 'c-1', store_name: 'Шумен', status: 'processed', no_items: false, submitted_at: new Date().toISOString(), processed_at: new Date().toISOString() },
  { id: 's-3', campaign_id: 'c-1', store_name: 'Добрич', status: 'submitted', no_items: false, submitted_at: new Date().toISOString() }
];
const ITEMS = [
  { id: 'i-1', submission_id: 's-1', campaign_id: 'c-1', store_name: 'Кърджали', sap_code: '14557', product_name: 'ЛАМПА', qty: 1, std_price: 10, proposed_price: 5, sort_order: 1 },
  { id: 'i-3', submission_id: 's-3', campaign_id: 'c-1', store_name: 'Добрич', sap_code: '33333', product_name: 'КОФА', qty: 1, std_price: 4, proposed_price: 2, sort_order: 1 }
];
const REG = { id: 'u-r', email: 'reg@temax.bg', display_name: 'Регионален', role: 'accounting', store_name: 'Централен офис', is_regional: true, assigned_stores: ['Кърджали', 'Шумен'] };
const FILEV = { id: 'u-f', email: 'filev@temax.bg', display_name: 'В. Филев', role: 'admin', store_name: 'Централен офис', is_regional: true, assigned_stores: ['Кърджали'] };
const ACC = { id: 'u-a', email: 'acc@temax.bg', display_name: 'Счетоводство', role: 'accounting', store_name: 'Централен офис', is_regional: false, assigned_stores: [] };

function filt(rows, url) {
  const q = decodeURIComponent(String(url).split('?')[1] || '');
  let out = rows.slice();
  q.split('&').forEach(p => {
    const m = /^([a-z_]+)=eq\.(.*)$/.exec(p);
    if (m && m[1] !== 'select') out = out.filter(r => String(r[m[1]]) === m[2]);
  });
  return out;
}
function env(user) {
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'push.js', 'email.js', 'revaluation.js'],
    user: Object.assign({}, user),
    data: {
      revaluation_campaigns: [CAMP],
      revaluation_submissions: url => filt(SUBS, url),
      revaluation_items: url => filt(ITEMS, url),
      revaluation_codes: [],
      stores: [{ name: 'Кърджали' }, { name: 'Шумен' }, { name: 'Добрич' }, { name: 'Троян' }],
      users: [], app_settings: []
    }
  });
  h.w.rvStoresOn = true;
  return h;
}
const mod = h => h.doc.getElementById('mod-revaluation');
const CAMP_BTNS = ['Excel — кампания', 'MM41', 'Кодовете са създадени', 'График на кампаниите', 'Затвори кампанията'];
async function open(h) { await h.w.loadRevaluation(); await ticks(8); }

(async function run() {

  section('1. Регионален accounting — обзор и бутони');
  {
    const h = env(REG); await open(h);
    const rows = Array.from(h.doc.querySelectorAll('#rv-co-rows tr[id^="rv-co-"]')).map(r => r.id.slice(6));
    ok('обзор: само Кърджали и Шумен', rows.join(',') === 'Кърджали,Шумен', rows.join(','));
    const present = CAMP_BTNS.filter(t => !!btn(mod(h), t));
    ok('без бутоните на ниво кампания', present.length === 0, present.join(' | '));
    ok('„📁 История" остава (само своите)', !!btn(mod(h), '📁 История'));
    ok('без собствена заявка към users (is_regional е от currentUser)', !h.calls.get.some(u => u.indexOf('/users?') >= 0), h.calls.get.filter(u => u.indexOf('/users') >= 0).join('\n'));
    ok('опциите за обект = регионът', h.w.rvStoreOptions().join(',') === 'Кърджали,Шумен', h.w.rvStoreOptions().join(','));
  }

  section('2. Лист: свой — да, чужд — не');
  {
    const h = env(REG); await open(h);
    realClick(h.w, btn(h.doc.getElementById('rv-co-Кърджали'), 'Отвори')); await ticks(8);
    ok('свой обект → листът е отворен', !!h.doc.getElementById('rv-row-i-1'));
    ok('„Excel — този обект" е там', !!btn(mod(h), 'Excel — този обект'));
    ok('и „Готово за обект" (обработва своя)', !!btn(mod(h), 'Готово за обект'));
    const g = env(REG); await open(g);
    await g.w.rvCoOpenStore('Добрич'); await ticks(6);
    ok('чужд обект → отказ, без лист', !g.doc.getElementById('rv-row-i-3') && g.calls.toast.some(t => t.indexOf('не е в твоя регион') >= 0));
  }

  section('3. Регионален accounting — „История" и извикване отвън');
  {
    const h = env(REG); await open(h);
    realClick(h.w, btn(mod(h), '📁 История')); await ticks(8);
    const y = h.doc.querySelector('[id^="rv-hist-y-"]');
    if (y && !h.doc.querySelector('[id^="rv-hist-c-"]')) realClick(h.w, y);
    realClick(h.w, h.doc.getElementById('rv-hist-c-c-1'));
    const st = Array.from(h.doc.querySelectorAll('.rv-hist-s')).map(e => e.getAttribute('data-s'));
    ok('дървото: само Кърджали и Шумен', st.sort().join(',') === 'Кърджали,Шумен', st.join(','));
    const f = env(REG); await open(f);
    await f.w.rvExportCampaign(); await f.w.rvMm41(); await f.w.rvMm41Done(); await f.w.rvToggleSchedule(); await f.w.rvCloseCampaign(); await ticks(4);
    ok('кампанийните действия отвън → нищо (без заявки за запис)', !f.calls.post.length && !f.calls.patch.length && !f.doc.getElementById('rv-schedule'));
  }

  section('4. admin с is_regional (В. Филев) и нерегионален accounting — всичко');
  {
    const h = env(FILEV); await open(h);
    const rows = Array.from(h.doc.querySelectorAll('#rv-co-rows tr[id^="rv-co-"]')).map(r => r.id.slice(6));
    ok('В. Филев: всички обекти в обзора', ['Добрич', 'Кърджали', 'Шумен'].every(s => rows.indexOf(s) >= 0), rows.join(','));
    const missing = CAMP_BTNS.filter(t => !btn(mod(h), t));
    ok('В. Филев: всички кампанийни бутони', missing.length === 0, missing.join(' | '));
    const a = env(ACC); await open(a);
    const rowsA = Array.from(a.doc.querySelectorAll('#rv-co-rows tr[id^="rv-co-"]')).map(r => r.id.slice(6));
    ok('нерегионален accounting: всички обекти', ['Добрич', 'Кърджали', 'Шумен'].every(s => rowsA.indexOf(s) >= 0));
    ok('нерегионален accounting: кампанийните бутони', CAMP_BTNS.every(t => !!btn(a.doc.getElementById('mod-revaluation'), t)));
  }

  report();
})();
