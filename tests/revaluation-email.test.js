/* Преоценка — писмото до регионалния при „✅ Подай" / „🚫 Нямаме за преоценка"
   (28.11.2026, етап 1 — само съдържанието; revaluation.js rvSubmitEmailHtml).
   Регионалният решава от писмото, без да отваря портала: заглавен блок, каре за
   всеки ред (снимки вляво, данни вдясно), сборове по стара / предложена цена и
   разлика; ред без цена не влиза в сбора и това се казва.
   Интеграционно: shared.js + admin.js + stock-returns.js + push.js + email.js +
   revaluation.js в реда от index.html; sendEmail / pushToPeople са стъбнати.
   Ред БЕЗ снимка не минава „Подай" (rvRowProblems) — проверява се през самата
   функция. Ред без ст. цена минава „Подай" — проверява се с истински клик.

   Мутационна проверка (28.11.2026) — всеки вариант е пуснат и е паднал (изход 1):
     (а) esc() махнат от описанието (it.product_name)
         → падат „escaping: описанието е текст …" и „… без <b> в описанието";
     (б) сборът брои и редовете без цена (без `noPrice++; return;`)
         → падат „сбор по предложена цена 127,00", „разлика 123,00",
           „същото съдържание: 3 карета …" и „ред без предложение не е в сбора";
     (в) снимките не влизат (left винаги „без снимка")
         → падат „<img> с адреса на снимката", „връзка към пълния размер",
           „адрес с " → цял src" и „19 реда → 19 снимки".
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, section, report, dayOffset, ticks } = H;

const CAMP = { id: 'c-1', title: 'Пожелателна преоценка 11.2026', kind: 'optional', starts_on: dayOffset(-1), ends_on: dayOffset(1), default_pct: 50, status: 'open' };
const EVIL_NAME = 'ЧАША <b>"\'& СТЪКЛО';
const EVIL_URL = 'https://x/evil"onerror="alert(1).jpg';
const IT = (sub, store, o) => Object.assign({ id: 'i-' + Math.random().toString(36).slice(2, 8), submission_id: sub, campaign_id: 'c-1', store_name: store, sort_order: 1,
  sap_code: '14557', product_name: 'ЛАМПА НАСТОЛНА', unit: 'бр.', qty: 2, std_price: 120, discount_pct: 50, proposed_price: 60, store_comment: 'стар модел',
  photos: ['https://x/p1.jpg'] }, o || {});
const ITEMS = (sub, store) => [
  IT(sub, store, { id: 'a', sort_order: 1 }),
  IT(sub, store, { id: 'b', sort_order: 2, sap_code: '8014557', product_name: EVIL_NAME, qty: 1, std_price: 10, discount_pct: 30, proposed_price: 7, store_comment: 'счупен капак', photos: [EVIL_URL] }),
  IT(sub, store, { id: 'c', sort_order: 3, sap_code: '20001', product_name: 'КОШ ЗА ПРАНЕ', unit: 'Бр', qty: 3, std_price: null, discount_pct: null, proposed_price: 10, store_comment: 'няма цена в SAP', photos: ['https://x/p3.jpg'] })
];
const SUB = (id, store) => ({ id, campaign_id: 'c-1', store_name: store, status: 'draft', no_items: false, submitted_at: null, default_pct: 40, store_note: 'Бележка на обекта за бланката' });

const MGR_K = { email: 'managerkardjali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };
const MGR_SH = { email: 'manager.shumen@temax.bg', display_name: 'Управител Шумен', role: 'manager', store_name: 'Шумен' };
const USERS = [
  { email: 'managerkardjali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали', active: true, is_regional: false, assigned_stores: [] },
  { email: 'manager.shumen@temax.bg', display_name: 'Управител Шумен', role: 'manager', store_name: 'Шумен', active: true, is_regional: false, assigned_stores: [] },
  { email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', role: 'admin', store_name: 'Централен офис', active: true, is_regional: false, assigned_stores: [], notify_groups: ['revaluation'] },
  { email: 'reg.kardzhali@temax.bg', display_name: 'Регионален Кърджали', role: 'accounting', store_name: 'Централен офис', active: true, is_regional: true, assigned_stores: ['Кърджали'] }
];

function env(o) {
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'push.js', 'email.js', 'revaluation.js'],
    user: o.user,
    data: {
      revaluation_campaigns: [CAMP],
      revaluation_submissions: () => o.subs,
      revaluation_items: url => o.items.filter(it => url.indexOf('submission_id=eq.') < 0 || url.indexOf('submission_id=eq.' + it.submission_id) >= 0),
      stores: [{ name: 'Кърджали' }, { name: 'Шумен' }, { name: 'Централен офис' }],
      users: USERS,
      product_catalog: [],
      app_settings: []
    },
    globals: {
      pushToPeople: (names, title, msg) => { h.push.push({ names, title, msg }); return Promise.resolve({ ok: true }); },
      sendEmail: (to, subj, html) => { h.mail.push({ to, subj, html }); return Promise.resolve({ ok: true }); }
    }
  });
  h.push = []; h.mail = [];
  h.w.rvStoresOn = true;
  return h;
}
const mod = h => h.doc.getElementById('mod-revaluation');
const parse = (h, html) => { const d = h.doc.createElement('div'); d.innerHTML = html; return d; };
const cards = d => d.querySelectorAll('td[width="100"]');
const has = (s, x) => String(s).indexOf(x) >= 0;

(async function run() {
  section('1. Обект с регионален: истински клик „✅ Подай" → пълно писмо до регионалния');
  {
    const h = env({ user: MGR_K, subs: [SUB('s-k', 'Кърджали')], items: ITEMS('s-k', 'Кърджали') });
    await h.w.loadRevaluation(); await ticks(6);
    realClick(h.w, btn(mod(h), 'Подай')); await ticks(10);
    const m = h.mail[0];
    ok('едно писмо, получател — регионалният', h.mail.length === 1 && m.to.join(',') === 'reg.kardzhali@temax.bg', m && m.to.join(','));
    ok('темата е непроменена', m && /^Преоценка · Кърджали · Пожелателна преоценка 11\.2026: подадени 3 реда — чака одобрение$/.test(m.subj), m && m.subj);
    ok('push текстът е непроменен', h.push[0] && h.push[0].msg === m.subj);
    const d = parse(h, m.html), t = d.textContent;
    ok('заглавие: обект + № 8', has(t, 'Преоценка — Кърджали') && has(t, '№ 8'), t.slice(0, 80));
    ok('кампания с периода', has(t, 'Пожелателна преоценка 11.2026 · ' + h.w.fmtDate(CAMP.starts_on) + ' – ' + h.w.fmtDate(CAMP.ends_on)));
    ok('подал', has(t, 'Подаде') && has(t, 'Управител Кърджали'));
    ok('% за бланката 40 %', has(t, '% за бланката') && has(t, '40 %'));
    ok('коментарът на обекта към бланката', has(t, 'Бележка на обекта за бланката'));
    ok('3 карета', cards(d).length === 3, cards(d).length);
    ok('всеки код', ['14557', '8014557', '20001'].every(c => has(t, c)));
    ok('„вече преоценен" само при 8014557', (t.match(/вече преоценен/g) || []).length === 1);
    ok('всяко описание', has(t, 'ЛАМПА НАСТОЛНА') && has(t, 'КОШ ЗА ПРАНЕ'));
    ok('количество + МЕ по SAP („Бр" / „бр." → „БР")', has(t, '3 БР') && has(t, '2 БР'), t);
    ok('предложените цени', has(t, '60,00') && has(t, '7,00') && has(t, '10,00'));
    ok('стара цена и %', has(t, '120,00') && has(t, '50 %') && has(t, '30 %'));
    ok('коментарите на обекта по редове', has(t, 'стар модел') && has(t, 'счупен капак') && has(t, 'няма цена в SAP'));
    const img = d.querySelector('img[src="https://x/p1.jpg"]');
    ok('<img> с адреса на снимката', !!img);
    ok('връзка към пълния размер', !!img && img.parentNode.tagName === 'A' && img.parentNode.getAttribute('href') === 'https://x/p1.jpg');
    ok('редове 3', /Редове\s*3/.test(t));
    ok('сбор по стара цена 250,00 (без реда без цена)', /Сбор по стара цена\s*250,00/.test(t), t);
    ok('сбор по предложена цена 127,00', /Сбор по предложена цена\s*127,00/.test(t), t);
    ok('разлика 123,00', /Разлика\s*123,00/.test(t), t);
    ok('бележка „1 ред без цена не е в сбора"', has(t, '1 ред без цена не е в сбора'));
    ok('текстът „Одобри или върни …" + връзка към портала', has(t, 'Одобри или върни бланката в портала: Ревизии и преоценка → Преоценка') &&
      !!d.querySelector('a[href="https://tenchotenev13-afk.github.io/Tmax-store-portal/"]'));
    ok('без <style> и без class', !/<style|class=/i.test(m.html));
    ok('ширина до 640 px', has(m.html, 'max-width:640px'));
    /* escaping */
    ok('escaping: описанието е текст (<b>"\'&)', has(t, EVIL_NAME));
    const names = Array.from(d.querySelectorAll('div')).filter(x => x.textContent === EVIL_NAME);
    ok('escaping: без <b> в описанието', names.length === 1 && names[0].children.length === 0);
    const ev = d.querySelector('img[src="' + EVIL_URL.replace(/"/g, '\\"') + '"]');
    ok('адрес с " → цял src, без onerror', !!ev && !d.querySelector('[onerror]'));
  }

  section('2. Обект без регионален → същото съдържание до групата, без „Одобри или върни"');
  {
    const h = env({ user: MGR_SH, subs: [SUB('s-sh', 'Шумен')], items: ITEMS('s-sh', 'Шумен') });
    await h.w.loadRevaluation(); await ticks(6);
    realClick(h.w, btn(mod(h), 'Подай')); await ticks(10);
    const m = h.mail[0];
    ok('получател — групата „revaluation"', h.mail.length === 1 && m.to.join(',') === 'e.gurova@temax.bg', m && m.to.join(','));
    const d = parse(h, m.html), t = d.textContent;
    ok('същото съдържание: 3 карета, кодове, сборове', cards(d).length === 3 && has(t, '8014557') && /Сбор по предложена цена\s*127,00/.test(t));
    ok('№ 14 на Шумен', has(t, '№ 14'));
    ok('БЕЗ „Одобри или върни"', !has(t, 'Одобри или върни'));
  }

  section('3. „🚫 Нямаме за преоценка" → без карета и сборове');
  {
    const h = env({ user: MGR_K, subs: [SUB('s-k', 'Кърджали')], items: [] });
    await h.w.loadRevaluation(); await ticks(6);
    realClick(h.w, btn(mod(h), 'Нямаме за преоценка')); await ticks(10);
    const m = h.mail[0];
    ok('писмо до регионалния', h.mail.length === 1 && m.to.join(',') === 'reg.kardzhali@temax.bg');
    const d = parse(h, m.html), t = d.textContent;
    ok('„Обектът няма артикули за преоценка"', has(t, 'Обектът няма артикули за преоценка'));
    ok('без карета', cards(d).length === 0);
    ok('без сборове', !has(t, 'Сбор по'));
    ok('заглавният блок е там', has(t, 'Кърджали') && has(t, 'Пожелателна преоценка 11.2026'));
    ok('при регионален — текстът за одобрение', has(t, 'Одобри или върни'));
  }

  section('4. Функцията направо: ред без снимка, ред без предложение, празен контекст');
  {
    const h = env({ user: MGR_K, subs: [], items: [] });
    const html = h.w.rvSubmitEmailHtml({ store: 'Кърджали', storeNo: '8', campaign: CAMP, by: 'X', at: '2026-11-28T08:00:00Z', sub: { no_items: false }, regs: [],
      items: [IT('s', 'К', { photos: [] }), IT('s', 'К', { photos: null, proposed_price: null, discount_pct: null }), IT('s', 'К', { photos: ['javascript:alert(1)'] })] });
    const d = parse(h, html), t = d.textContent;
    ok('ред без снимка → „без снимка"', (t.match(/без снимка/g) || []).length === 3, t);
    ok('адрес извън http(s) не става <img>/<a>', !d.querySelector('img') && !d.querySelector('a[href^="javascript"]'));
    ok('ред без предложение не е в сбора', /Сбор по стара цена\s*480,00/.test(t) && /Сбор по предложена цена\s*240,00/.test(t), t);
    ok('„1 ред без цена не е в сбора"', has(t, '1 ред без цена не е в сбора'));
    const two = h.w.rvSubmitEmailHtml({ store: 'К', sub: {}, items: [IT('s', 'К', { std_price: null }), IT('s', 'К', { std_price: '' })] });
    ok('2 реда → „2 реда без цена не са в сбора"', has(parse(h, two).textContent, '2 реда без цена не са в сбора'));
    const none = h.w.rvSubmitEmailHtml({ store: 'К', sub: {}, items: [IT('s', 'К')] });
    ok('без редове без цена → без бележка', !has(none, 'без цена'));
    let threw = null; try { h.w.rvSubmitEmailHtml(); } catch (e) { threw = e; }
    ok('без контекст не гърми', threw === null, threw && threw.message);
  }

  section('5. Граница: бланка с 19 реда (най-голямата в базата към 28.11) → 19 карета');
  {
    const many = [];
    for (let i = 0; i < 19; i++) many.push(IT('s-k', 'Кърджали', { id: 'r' + i, sort_order: i + 1, sap_code: String(30000 + i), photos: ['https://x/r' + i + '.jpg'] }));
    const h = env({ user: MGR_K, subs: [SUB('s-k', 'Кърджали')], items: many });
    await h.w.loadRevaluation(); await ticks(6);
    realClick(h.w, btn(mod(h), 'Подай')); await ticks(10);
    const d = parse(h, h.mail[0] ? h.mail[0].html : ''), t = d.textContent;
    ok('19 карета', cards(d).length === 19, cards(d).length);
    ok('19 реда → 19 снимки', d.querySelectorAll('img').length === 19);
    ok('всички 19 кода', many.every(it => has(t, it.sap_code)));
    ok('сбор 19 × 2 × 120 = 4560,00', /Сбор по стара цена\s*4560,00/.test(t), t);
  }

  report();
})().catch(e => {
  /* Хвърлена грешка преди report() = провал с код 1, не увисване. */
  console.log('  ❌ тестът гръмна: ' + ((e && e.stack) || e));
  process.exit(1);
});
