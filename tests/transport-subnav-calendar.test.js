/* Транспорт — под-лента и заглавия (13.11.2026, сесия kozmetika-transport).
   Договорено с Теодор (имейли 30.10 и 02.11.2026): в бутона — кратко име,
   пълното — в заглавието на страницата.

   1. Ред в под-лентата: Заявки, Календар, Зареждане, Товарни листи,
      Трансфери, Пикинг, Палети — Палети последен.
   2. Календар вече НЕ е горен таб (#tab-calendar го няма); бутонът
      tps-calendar е скрит до setupTabsForRole() и видим за всички роли след
      вход — същото като стария таб (shared.js показваше tab-calendar с '').
   3. Реален клик на „🚐 Календар" → mod-calendar видим, под-лентата видима,
      бутонът е active, горният „Транспорт" остава active.
   4. Заглавия: „Заявки за транспорт", „Налични палети за извозване",
      „Товарни листи от логистични складове", „Междускладови трансфери",
      „Клиентски заявки по поръчка" — с иконите.

   Пускане: node tests/transport-subnav-calendar.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, section, report, ticks } = H;

const MODULES = ['transport.js', 'client-orders.js', 'notifications.js', 'calendar.js',
  'pallets.js', 'supply.js', 'stock-differences.js', 'loading.js', 'transfers.js', 'picking.js'];

const ROLES = ['admin', 'accounting', 'controlling', 'supply', 'logistics', 'manager', 'sklad'];

function env(role) {
  const h = boot({
    modules: MODULES,
    user: { email: 'x-' + role + '@temax.bg', display_name: 'Тест ' + role, role: role,
      store_name: (role === 'manager' || role === 'sklad') ? 'Троян' : 'Централен офис' },
    data: {}
  });
  return h;
}

function title(h, mod) {
  const el = h.doc.querySelector('#mod-' + mod + ' .pg-title');
  return el ? el.textContent.trim() : null;
}

(async function run() {
  section('1. Ред на бутоните в под-лентата');
  const h = env('admin');
  {
    const sub = h.doc.getElementById('transport-pallets-subnav');
    const ids = Array.from(sub.querySelectorAll('button')).map(b => b.id);
    const want = ['tps-transport', 'tps-calendar', 'tps-supply', 'tps-loading', 'tps-transfers', 'tps-picking', 'tps-pallets'];
    ok('редът е ' + want.join(', '), JSON.stringify(ids) === JSON.stringify(want), ids.join(','));
    ok('Палети е последен', ids[ids.length - 1] === 'tps-pallets', ids[ids.length - 1]);
    ok('бутоните пазят кратките имена',
      h.doc.getElementById('tps-calendar').textContent.trim() === '🚐 Календар' &&
      h.doc.getElementById('tps-pallets').textContent.trim() === '📦 Палети' &&
      h.doc.getElementById('tps-loading').textContent.trim() === '🚛 Товарни листи' &&
      h.doc.getElementById('tps-transfers').textContent.trim() === '🔁 Трансфери' &&
      h.doc.getElementById('tps-transport').textContent.trim() === '🚚 Заявки');
  }

  section('2. Календар го няма в горната навигация');
  ok('#tab-calendar не съществува', !h.doc.getElementById('tab-calendar'));
  ok('никой .nav-tab не отваря calendar',
    !Array.from(h.doc.querySelectorAll('.nav-tab')).some(t => /showModule\('calendar'\)/.test(t.getAttribute('onclick') || '')));

  section('3. Видимост по роли — като стария таб');
  {
    const h0 = env('manager');
    ok('преди вход (без setupTabsForRole) бутонът е скрит',
      h0.doc.getElementById('tps-calendar').style.display === 'none');
    for (const r of ROLES) {
      const hr = env(r);
      let threw = null;
      try { hr.w.setupTabsForRole(); } catch (e) { threw = e; }
      await ticks(4);
      ok('роля ' + r + ': setupTabsForRole не хвърля', !threw, threw && threw.message);
      ok('роля ' + r + ': „🚐 Календар" се вижда', hr.doc.getElementById('tps-calendar').style.display === '');
    }
  }

  section('4. Реален клик на „🚐 Календар"');
  {
    h.w.setupTabsForRole();
    await ticks(4);
    h.w.showModule('transport');
    await ticks(4);
    const b = h.doc.getElementById('tps-calendar');
    realClick(h.w, b, '🚐 Календар');
    await ticks(8);
    ok('mod-calendar е видим', h.doc.getElementById('mod-calendar').style.display === 'block');
    ok('mod-transport е скрит', h.doc.getElementById('mod-transport').style.display === 'none');
    ok('под-лентата е видима', h.doc.getElementById('transport-pallets-subnav').style.display === 'block');
    ok('бутонът „🚐 Календар" е active', b.classList.contains('active'));
    ok('само той е active в лентата',
      Array.from(h.doc.querySelectorAll('#transport-pallets-subnav button.active')).map(x => x.id).join(',') === 'tps-calendar');
    ok('горният „Транспорт" остава active', h.doc.getElementById('tab-transport').classList.contains('active'));
    ok('mod-calendar е зареден (заглавието на календара)', /Транспортен Календар/.test(h.doc.getElementById('mod-calendar').textContent));
    realClick(h.w, h.doc.getElementById('tps-pallets'), '📦 Палети');
    await ticks(8);
    ok('после Палети: Календар вече не е active', !b.classList.contains('active') && h.doc.getElementById('tps-pallets').classList.contains('active'));
    h.w.showModule('bulletin');
    await ticks(4);
    ok('извън Транспорт под-лентата се крие', h.doc.getElementById('transport-pallets-subnav').style.display === 'none');
  }

  section('5. Заглавия на страниците');
  {
    ok('Заявки → „🚚 Заявки за транспорт"', title(h, 'transport') === '🚚 Заявки за транспорт', title(h, 'transport'));
    ok('Клиентски → „📋 Клиентски заявки по поръчка"', title(h, 'client') === '📋 Клиентски заявки по поръчка', title(h, 'client'));
    ok('горният таб „Клиентски" не е пипан', h.doc.querySelector('#tab-client .tl').textContent === 'Клиентски');
    h.w.showModule('pallets'); await ticks(8);
    ok('Палети → „📦 Налични палети за извозване"', title(h, 'pallets') === '📦 Налични палети за извозване', title(h, 'pallets'));
    h.w.showModule('loading'); await ticks(8);
    ok('Товарни листи → „🚛 Товарни листи от логистични складове"', title(h, 'loading') === '🚛 Товарни листи от логистични складове', title(h, 'loading'));
    h.w.showModule('transfers'); await ticks(8);
    ok('Трансфери → „🔁 Междускладови трансфери"', title(h, 'transfers') === '🔁 Междускладови трансфери', title(h, 'transfers'));
    /* Обектът вижда другите варианти на Палети и Товарни листи (pallets.js:166, llStoreHtml). */
    const hs = env('manager');
    hs.w.setupTabsForRole(); await ticks(4);
    hs.w.showModule('pallets'); await ticks(8);
    ok('обект: Палети → „📦 Налични палети за извозване"', title(hs, 'pallets') === '📦 Налични палети за извозване', title(hs, 'pallets'));
    ok('обект: llStoreHtml носи новото заглавие', /🚛 Товарни листи от логистични складове/.test(hs.w.llStoreHtml()));
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
