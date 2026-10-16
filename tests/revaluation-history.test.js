/* Преоценка — изгледът „📁 История" за ЦО (16.10.2026): дърво
   Година → Кампания → Обект; клик на обект отваря СЪЩИЯ лист като от обзора.
   Интеграционно: shared.js + admin.js + stock-returns.js + push.js + email.js
   + revaluation.js, в реда от index.html.

   Мутационна проверка (16.10.2026) — всеки вариант е пуснат и е паднал:
     H1 без филтъра по година (всяка година показва всички кампании)
        → пада „2026 съдържа само своите 2 кампании";
     H2 броят редове по грешен ключ (id на реда вместо submission_id)
        → пада „Кърджали · 2 реда";
     H3 бутонът „📁 История" видим и за обекта
        → пада „обект: няма бутон „История"".
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, ticks } = H;

const C26a = { id: 'c-26a', title: 'Октомври 2026', kind: 'mandatory', starts_on: '2026-10-13', ends_on: '2026-10-15', default_pct: 50, status: 'open' };
const C26b = { id: 'c-26b', title: 'Пожелателна 2026', kind: 'optional', starts_on: '2026-09-28', ends_on: '2026-09-29', default_pct: 30, status: 'closed' };
const C25a = { id: 'c-25a', title: 'Декември 2025', kind: 'mandatory', starts_on: '2025-12-01', ends_on: '2025-12-03', default_pct: 50, status: 'closed' };
const C25b = { id: 'c-25b', title: 'Септември 2025', kind: 'optional', starts_on: '2025-09-08', ends_on: '2025-09-09', default_pct: 30, status: 'closed' };
const SUBS = [
  { id: 's-1', campaign_id: 'c-26a', store_name: 'Кърджали', status: 'processed', no_items: false, submitted_at: '2026-10-14T08:00:00Z', processed_at: '2026-10-15T09:00:00Z', processed_by: 'Елица Гюрова' },
  { id: 's-2', campaign_id: 'c-26a', store_name: 'Шумен', status: 'submitted', no_items: false, submitted_at: '2026-10-14T10:00:00Z' },
  { id: 's-3', campaign_id: 'c-26a', store_name: 'Добрич', status: 'draft', no_items: false },
  { id: 's-4', campaign_id: 'c-25a', store_name: 'Габрово', status: 'processed', no_items: true, submitted_at: '2025-12-02T08:00:00Z', processed_at: '2025-12-04T08:00:00Z' }
];
const ITEMS = [
  { id: 'i-1', submission_id: 's-1', campaign_id: 'c-26a', store_name: 'Кърджали', sap_code: '14557', product_name: 'ЛАМПА', qty: 2, std_price: 10, proposed_price: 5, sort_order: 1, new_sap_code: '8014557', sale_price: 5 },
  { id: 'i-2', submission_id: 's-1', campaign_id: 'c-26a', store_name: 'Кърджали', sap_code: '82216', product_name: 'КОФА', qty: 1, std_price: 4, proposed_price: 2, sort_order: 2 },
  { id: 'i-3', submission_id: 's-2', campaign_id: 'c-26a', store_name: 'Шумен', sap_code: '53531', product_name: 'АРКА', qty: 1, std_price: 17.79, proposed_price: 8.9, sort_order: 1 }
];
const ADMIN = { email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', role: 'admin', store_name: 'Централен офис' };
const STORE = { email: 'managerkardjali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };

function filt(rows, url) {
  const q = decodeURIComponent(String(url).split('?')[1] || '');
  let out = rows.slice();
  q.split('&').forEach(p => {
    const m = /^([a-z_]+)=eq\.(.*)$/.exec(p);
    if (m && m[1] !== 'select') out = out.filter(r => String(r[m[1]]) === m[2]);
  });
  return out;
}
function env(o) {
  o = o || {};
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'push.js', 'email.js', 'revaluation.js'],
    user: o.user || ADMIN,
    fail: o.fail,
    data: {
      revaluation_campaigns: [C26a, C26b, C25a, C25b],
      revaluation_submissions: url => filt(SUBS, url),
      revaluation_items: url => filt(ITEMS, url),
      revaluation_codes: [],
      stores: [{ name: 'Кърджали' }, { name: 'Шумен' }, { name: 'Добрич' }, { name: 'Габрово' }],
      users: url => filt([{ email: 'e.gurova@temax.bg', is_regional: false, assigned_stores: [] }, { email: 'managerkardjali@temax.bg', is_regional: false, assigned_stores: [] }], url),
      app_settings: []
    }
  });
  h.w.rvStoresOn = true;
  return h;
}
const mod = h => h.doc.getElementById('mod-revaluation');
async function open(h) { await h.w.loadRevaluation(); await ticks(6); }

(async function run() {

  section('1. Бутонът и дървото по години');
  {
    const h = env(); await open(h);
    const b = btn(mod(h), '📁 История');
    ok('admin: бутон „📁 История" в реда с кампанията', !!b);
    realClick(h.w, b); await ticks(8);
    ok('дървото е на мястото на обзора', !!h.doc.getElementById('rv-hist') && !h.doc.getElementById('rv-co-rows'));
    ok('2 години: 2026 отгоре, после 2025', !!h.doc.getElementById('rv-hist-y-2026') && !!h.doc.getElementById('rv-hist-y-2025') &&
      h.doc.getElementById('rv-hist').innerHTML.indexOf('rv-hist-y-2026') < h.doc.getElementById('rv-hist').innerHTML.indexOf('rv-hist-y-2025'));
    ok('2026 е разгъната по подразбиране — кампаниите ѝ са вътре', !!h.doc.getElementById('rv-hist-c-c-26a') && !!h.doc.getElementById('rv-hist-c-c-26b'));
    ok('2026 съдържа само своите 2 кампании', h.doc.querySelectorAll('[id^="rv-hist-c-"]').length === 2);
    ok('2025 е свита', !h.doc.getElementById('rv-hist-c-c-25a'));
    const c1 = h.doc.getElementById('rv-hist-c-c-26a').textContent;
    ok('ред на кампанията: заглавие, дати, вид, бадж „3 обекта · 1 обработени"', c1.indexOf('Октомври 2026') >= 0 && c1.indexOf('13.10–15.10.2026') >= 0 && c1.indexOf('задължителна') >= 0 && c1.indexOf('3 обекта · 1 обработени') >= 0, c1);
    ok('кампания без бланки → „(няма подадени)"', h.doc.getElementById('rv-hist-c-c-26b').textContent.indexOf('(няма подадени)') >= 0);
    ok('„← Към кампанията" вместо „История"', !!btn(mod(h), '← Към кампанията') && !btn(mod(h), '📁 История'));
    ok('само ЕДНА заявка за бланките и ЕДНА за редовете', h.calls.get.filter(u => u.indexOf('/revaluation_submissions?select=id,campaign_id,store_name') >= 0).length === 1 &&
      h.calls.get.filter(u => u.indexOf('/revaluation_items?select=id,submission_id') >= 0).length === 1);
  }

  section('2. Разгъване на папките');
  {
    const h = env(); await open(h);
    realClick(h.w, btn(mod(h), '📁 История')); await ticks(8);
    realClick(h.w, h.doc.getElementById('rv-hist-c-c-26a'));
    const rows = Array.from(h.doc.querySelectorAll('.rv-hist-s'));
    ok('кампанията се разгъва: 3 обекта', rows.length === 3, rows.length);
    const t = id => (h.doc.getElementById('rv-hist-s-' + id) || {}).textContent || '';
    ok('Кърджали · обработена · 2 реда · обработена 15.10.2026 от Елица Гюрова', t('s-1').indexOf('обработена') >= 0 && t('s-1').indexOf('2 реда') >= 0 && t('s-1').indexOf('15.10.2026 от Елица Гюрова') >= 0, t('s-1'));
    ok('Шумен · подадена · 1 ред', t('s-2').indexOf('подадена') >= 0 && t('s-2').indexOf('1 ред') >= 0, t('s-2'));
    ok('Добрич · бадж „чернова" (не е скрита) · 0 реда', t('s-3').indexOf('чернова') >= 0 && t('s-3').indexOf('0 реда') >= 0, t('s-3'));
    realClick(h.w, h.doc.getElementById('rv-hist-c-c-26a'));
    ok('втори клик свива', !h.doc.querySelector('.rv-hist-s'));
    realClick(h.w, h.doc.getElementById('rv-hist-y-2025'));
    ok('клик на 2025 я разгъва', !!h.doc.getElementById('rv-hist-c-c-25a'));
    realClick(h.w, h.doc.getElementById('rv-hist-c-c-25a'));
    ok('„нямат" → „нямаме за преоценка"', (h.doc.getElementById('rv-hist-s-s-4') || {}).textContent.indexOf('нямаме за преоценка') >= 0);
    ok('клик по папка не отваря лист', !h.doc.getElementById('rv-rows'));
  }

  section('3. Клик на обект → същият лист като от обзора');
  {
    const h = env(); await open(h);
    realClick(h.w, btn(mod(h), '📁 История')); await ticks(8);
    realClick(h.w, h.doc.getElementById('rv-hist-c-c-26a'));
    let called = null;
    const orig = h.w.rvCoOpenStore;
    h.w.rvCoOpenStore = function (s) { called = s; return orig(s); };
    realClick(h.w, h.doc.getElementById('rv-hist-s-s-1')); await ticks(10);
    ok('викнат rvCoOpenStore("Кърджали")', called === 'Кърджали');
    ok('кампанията е сменена на c-26a', h.w.rvCampaignId === 'c-26a');
    ok('листът е рендиран (редове, статус)', !!h.doc.getElementById('rv-row-i-1') && h.doc.getElementById('rv-status').textContent.indexOf('Обработена') === 0);
    ok('„← Към списъка на обектите" и „📁 История" са там', !!btn(mod(h), 'Към списъка на обектите') && !!btn(mod(h), '📁 История'));
    const viaHist = mod(h).innerHTML;
    const g = env(); await open(g);
    await g.w.rvPickCampaign('c-26a'); await ticks(6);
    await g.w.rvCoOpenStore('Кърджали'); await ticks(6);
    ok('същият DOM като при отваряне от обзора', g.doc.getElementById('mod-revaluation').innerHTML === viaHist);
    realClick(h.w, btn(mod(h), 'Към списъка на обектите')); await ticks(8);
    ok('„← Към списъка на обектите" продължава да работи', !!h.doc.getElementById('rv-co-rows'));
  }

  section('4. Затваряне, непълни данни, обект');
  {
    const h = env(); await open(h);
    realClick(h.w, btn(mod(h), '📁 История')); await ticks(8);
    realClick(h.w, btn(mod(h), '← Към кампанията')); await ticks(8);
    ok('„← Към кампанията" → обзорът на обектите', !h.doc.getElementById('rv-hist') && !!h.doc.getElementById('rv-co-rows'));
    const f = env({ fail: { GET: /revaluation_items\?select=id,submission_id/ } }); await open(f);
    realClick(f.w, btn(f.doc.getElementById('mod-revaluation'), '📁 История')); await ticks(8);
    ok('паднали редове → червен toast, дървото не е показано', f.calls.toast.some(t => t.indexOf('Историята не се зареди') >= 0) && !f.doc.getElementById('rv-hist-y-2026'));
    const s = env({ user: STORE }); await open(s);
    ok('обект: няма бутон „История"', !btn(s.doc.getElementById('mod-revaluation'), 'История'));
    s.w.rvHistOpenView(); await ticks(4);
    ok('обект: rvHistOpenView отвън не прави нищо', !s.doc.getElementById('rv-hist'));
    const sup = env({ user: { email: 'sn@temax.bg', display_name: 'Снаб', role: 'supply', store_name: 'Централен офис' } }); await open(sup);
    ok('supply: бутонът го има', !!btn(sup.doc.getElementById('mod-revaluation'), '📁 История'));
  }

  report();
})();
