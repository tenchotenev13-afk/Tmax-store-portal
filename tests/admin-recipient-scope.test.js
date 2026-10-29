/* Администрация → Известия → „📧 Общи отчети": обхватът на получателя
   (report_recipients.scope_stores) — вижда се и се сменя (29.10.2026, сесия
   admin-recipient-scope).

   Какво заковава файлът (реален клик):
   1. на реда, след иконите: „обекти: всички" при NULL, имената при масив
      (до 3, после „…" и title с пълния списък);
   2. admin — текстът е <button>, кликът отваря модал: „Всички обекти (без
      ограничение)" + отметки по обект от stores + бележката за отчетите;
      accounting не вижда картата (notifCanSee — само admin от 18.10.2026), а
      директното отваряне / запис не правят нищо;
   3. запис: 2 обекта → PATCH { scope_stores: [..] }; „Всички" → PATCH
      { scope_stores: null }; 0 отметнати → бутонът е неактивен и няма PATCH;
      същото → само затваряне, без PATCH; грешка → червен toast и старата
      стойност на екрана; успех → редът се обновява без нова заявка към
      report_recipients.
   Проверките „няма бутон" гледат само <button>.

   Мутационна проверка (29.10.2026) — всеки вариант пуснат и паднал:
     A1 „Всички" записва [] вместо null                         → пада 3
     A2 accounting може да отвори / запише (без notifIsAdmin)    → пада 2
     A3 без проверката за 0 отметнати (записва {})               → пада 3
     A4 без проверката „същото" (PATCH при непроменен обхват)     → пада 3
     A5 при грешка редът пак се обновява                          → пада 3
     A6 редът без flex-wrap:wrap (29.10, тесен екран)            → пада 1б
     A7 името обратно на flex:1;min-width:0 (свива се до 0 px)   → пада 1б
   Пускане:  node tests/admin-recipient-scope.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, fire } = H;

const ADMIN = { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const ACC = { id: 'u-acc', email: 'acc@temax.bg', display_name: 'Счетоводител', role: 'accounting', store_name: 'Централен офис' };
const R = (id, name, email, scope) => ({ id, name, email, active: true, daily: false, weekly: false, pallets: false, warehouse: false, co_overdue: false, minus_multi: true, scope_stores: scope });
const RECIPIENTS = [
  R('r-t', 'Теодор Тенев', 't.tenev@temax.bg', null),
  R('r-k', 'Надя Колева', 'n.koleva@temax.bg', ['Гоце Делчев', 'Дупница', 'Петрич']),
  R('r-s', 'Станислава Стефанова', 's.stefanova@temax.bg', ['Враца', 'Козлодуй', 'Монтана', 'Троян'])
];
const STORES = ['Враца', 'Гоце Делчев', 'Дупница', 'Козлодуй', 'Монтана', 'Петрич', 'Троян', 'Централен офис'].map(n => ({ name: n }));

const wait = ms => new Promise(r => setTimeout(r, ms));
async function settle(ms) { await wait(ms || 60); for (let i = 0; i < 4; i++) await ticks(); }
async function env(user, fail) {
  const o = {
    modules: ['bulletin.js', 'email.js', 'admin.js', 'report.js'],
    user: user,
    data: { report_recipients: JSON.parse(JSON.stringify(RECIPIENTS)), users: [], notification_topics: [], notification_matrix: [],
            notification_overrides: [], notification_schedules: [], stores: STORES }
  };
  if (fail) o.fail = fail;
  const h = boot(o);
  h.w.loadNotificationsAdmin(); await settle();
  return h;
}
const body = h => h.doc.getElementById('notif-reports-body');
const rowOf = (h, email) => Array.prototype.find.call(body(h).querySelectorAll('.report-recipient'), x => x.textContent.indexOf(email) >= 0);
const scopeEl = (h, email) => { const r = rowOf(h, email); return r ? r.querySelector('.rcpt-scope') : null; };
const ov = h => h.doc.getElementById('rcpt-scope-ov');
const isOpen = h => !!ov(h) && ov(h).classList.contains('open');
const box = (h, name) => Array.prototype.find.call(h.doc.querySelectorAll('#rcpt-scope-list .rcpt-scope-store'), b => b.value === name);
const patches = h => h.calls.patch.filter(p => (p.url || '').indexOf('/report_recipients') >= 0);
const recGets = h => h.calls.get.filter(u => u.indexOf('/report_recipients') >= 0).length;
const save = h => h.doc.getElementById('rcpt-scope-save');
async function openFor(h, email) { realClick(h.w, scopeEl(h, email)); await settle(); }
async function clickSave(h) { realClick(h.w, save(h)); await settle(); }
function setBox(h, name, on) { const b = box(h, name); b.checked = on; fire(h.w, b, 'change'); }
function setAll(h, on) { const a = h.doc.getElementById('rcpt-scope-all'); a.checked = on; fire(h.w, a, 'change'); }

(async function () {
  section('1. Текстът на реда');
  {
    const h = await env(ADMIN);
    ok('NULL → „обекти: всички"', scopeEl(h, 't.tenev@temax.bg') && scopeEl(h, 't.tenev@temax.bg').textContent === 'обекти: всички', scopeEl(h, 't.tenev@temax.bg') && scopeEl(h, 't.tenev@temax.bg').textContent);
    ok('3 обекта → имената', scopeEl(h, 'n.koleva@temax.bg').textContent === 'обекти: Гоце Делчев, Дупница, Петрич', scopeEl(h, 'n.koleva@temax.bg').textContent);
    const s = scopeEl(h, 's.stefanova@temax.bg');
    ok('4 обекта → първите 3 и „…"', s.textContent === 'обекти: Враца, Козлодуй, Монтана, …', s.textContent);
    ok('… title с пълния списък', s.getAttribute('title').indexOf('Враца, Козлодуй, Монтана, Троян') === 0, s.getAttribute('title'));
    ok('текстът е след иконите (след 🔁) и преди ✕', (function () {
      const r = rowOf(h, 'n.koleva@temax.bg'); const kids = Array.prototype.slice.call(r.querySelectorAll('button'));
      const iS = kids.indexOf(scopeEl(h, 'n.koleva@temax.bg')), iF = kids.indexOf(r.querySelector('button.rcpt-flag[data-flag="minus_multi"]'));
      return iS > iF && kids[kids.length - 1].textContent === '✕';
    })());
    ok('за admin — <button>', scopeEl(h, 't.tenev@temax.bg').tagName === 'BUTTON');
    h.close();
  }

  section('1б. Тесен екран — стилът на реда (29.10.2026)');
  {
    /* На 323 px името падаше до 0 px и редът беше само икони. jsdom не смята
       лейаут — проверката е по inline стила. */
    const h = await env(ADMIN);
    const r = rowOf(h, 'n.koleva@temax.bg');
    const st = r.getAttribute('style') || '';
    ok('редът .report-recipient има flex-wrap:wrap', /(^|;)\s*flex-wrap:\s*wrap\s*(;|$)/.test(st), st);
    const nameSpan = r.firstElementChild;
    const ns = (nameSpan && nameSpan.getAttribute('style')) || '';
    ok('първият елемент е името (Надя Колева)', nameSpan && nameSpan.tagName === 'SPAN' && nameSpan.textContent.indexOf('Надя Колева') === 0);
    const mw = (ns.match(/(?:^|;)\s*min-width:\s*(\d+)px/) || [])[1];
    ok('името има min-width > 0 (140px)', Number(mw) > 0 && Number(mw) >= 100, ns);
    ok('… и flex-basis, не flex:1 с нулева основа', /(?:^|;)\s*flex:\s*1 1 \d+px/.test(ns), ns);
    h.close();
  }

  section('2. Кой може да сменя');
  {
    const h = await env(ADMIN);
    await openFor(h, 'n.koleva@temax.bg');
    ok('admin клик → модалът е отворен', isOpen(h));
    ok('… „Всички обекти (без ограничение)"', ov(h).textContent.indexOf('Всички обекти (без ограничение)') >= 0);
    ok('… отметки по обект от stores (8)', h.doc.querySelectorAll('#rcpt-scope-list .rcpt-scope-store').length === 8, h.doc.querySelectorAll('#rcpt-scope-list .rcpt-scope-store').length);
    ok('… отметнати са текущите (Гоце Делчев, Дупница, Петрич)', ['Гоце Делчев', 'Дупница', 'Петрич'].every(n => box(h, n).checked) && !box(h, 'Враца').checked);
    ok('… бележката', h.doc.getElementById('rcpt-scope-note').textContent === 'Обхватът важи за дневния отчет, „Палети“ и „Минуси — повтарящи се“; седмичният го пренебрегва.');
    h.close();
    const a = await env(ACC);
    ok('accounting — картата „Общи отчети" е празна/скрита (notifCanSee само admin)', !body(a) || body(a).style.display === 'none' || !body(a).querySelector('.report-recipient'));
    ok('accounting — няма <button class="rcpt-scope">', !a.doc.querySelector('button.rcpt-scope'));
    a.w.adminReportRecipients = JSON.parse(JSON.stringify(RECIPIENTS));
    a.w.adminOpenRecipientScope('r-k'); await settle();
    ok('accounting — директно отваряне → нищо', !isOpen(a));
    a.w.adminScopeEditId = 'r-k';
    a.w.adminSaveRecipientScope(); await settle();
    ok('accounting — директен запис → 0 PATCH', patches(a).length === 0);
    ok('accounting — текстът без бутон (adminRecipientScopeHtml с admin=false)', !/<button/.test(a.w.adminRecipientScopeHtml(RECIPIENTS[1], false)) && /обекти: Гоце Делчев/.test(a.w.adminRecipientScopeHtml(RECIPIENTS[1], false)));
    a.close();
  }

  section('3. Запис');
  {
    const h = await env(ADMIN);
    const gets0 = recGets(h);
    /* 2 обекта: Колева → Гоце Делчев, Петрич. */
    await openFor(h, 'n.koleva@temax.bg');
    setBox(h, 'Дупница', false);
    await clickSave(h);
    let p = patches(h);
    ok('2 обекта → 1 PATCH с масив', p.length === 1 && JSON.stringify(p[0].body) === JSON.stringify({ scope_stores: ['Гоце Делчев', 'Петрич'] }) && /id=eq\.r-k/.test(p[0].url), p.map(x => JSON.stringify(x.body)).join(' '));
    ok('… модалът е затворен', !isOpen(h));
    ok('… редът е обновен', scopeEl(h, 'n.koleva@temax.bg').textContent === 'обекти: Гоце Делчев, Петрич', scopeEl(h, 'n.koleva@temax.bg').textContent);
    ok('… без нова заявка към report_recipients', recGets(h) === gets0, recGets(h) + ' срещу ' + gets0);
    /* „Всички" → null. */
    await openFor(h, 's.stefanova@temax.bg');
    setAll(h, true);
    ok('„Всички" → отметките по обект са неактивни', Array.prototype.every.call(h.doc.querySelectorAll('#rcpt-scope-list .rcpt-scope-store'), b => b.disabled));
    await clickSave(h);
    p = patches(h);
    ok('„Всички" → PATCH { scope_stores: null }', p.length === 2 && JSON.stringify(p[1].body) === '{"scope_stores":null}' && /id=eq\.r-s/.test(p[1].url), p.length && JSON.stringify(p[p.length - 1].body));
    ok('… редът — „обекти: всички"', scopeEl(h, 's.stefanova@temax.bg').textContent === 'обекти: всички');
    /* 0 отметнати при махнато „Всички". */
    await openFor(h, 't.tenev@temax.bg');
    setAll(h, false);
    ok('0 отметнати → „Запази" е неактивен', save(h).disabled === true);
    ok('… с подсказка', save(h).getAttribute('title') === 'Избери поне един обект или „Всички обекти“', save(h).getAttribute('title'));
    h.w.adminSaveRecipientScope(); await settle();   /* дори в обход на неактивния бутон */
    ok('… и няма PATCH (нито {})', patches(h).length === 2, patches(h).length);
    setBox(h, 'Троян', true);
    ok('една отметка → „Запази" е активен', save(h).disabled === false);
    setBox(h, 'Троян', false); setAll(h, true);
    /* Същото → само затваряне. */
    await clickSave(h);
    ok('„Всички" при NULL (същото) → без PATCH', patches(h).length === 2, patches(h).length);
    ok('… модалът е затворен', !isOpen(h));
    await openFor(h, 'n.koleva@temax.bg');
    await clickSave(h);
    ok('непроменен масив → без PATCH', patches(h).length === 2 && !isOpen(h));
    h.close();
  }
  {
    const h = await env(ADMIN, { PATCH: /report_recipients/ });
    await openFor(h, 'n.koleva@temax.bg');
    setBox(h, 'Враца', true);
    await clickSave(h);
    ok('грешка → червен toast', h.calls.toast.some(t => String(t).indexOf('Обхватът не е записан') >= 0), JSON.stringify(h.calls.toast));
    ok('… старата стойност остава на екрана', scopeEl(h, 'n.koleva@temax.bg').textContent === 'обекти: Гоце Делчев, Дупница, Петрич', scopeEl(h, 'n.koleva@temax.bg').textContent);
    ok('… и в паметта', JSON.stringify(h.w.adminReportRecipients.filter(r => r.id === 'r-k')[0].scope_stores) === JSON.stringify(['Гоце Делчев', 'Дупница', 'Петрич']));
    ok('… бутонът „Запази" отново е активен', save(h) && save(h).disabled === false);
    h.close();
  }
  {
    const h = await env(ADMIN);
    let got = null;
    h.w.setReportRecipientScope('r-k', [], ok2 => { got = ok2; }); await settle();
    ok('setReportRecipientScope([]) → отказ без заявка', got === false && patches(h).length === 0);
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
