/* Заглавката на писмата от портала (emailWrap в email.js), 27.10.2026.
   До тогава всяко писмо излизаше с „Т-Бюлетин ТеМАХ" — и Товарни листи, и
   Пикинг, и „✍️ Счетоводител" (claude/open/23-10-email-header).
     а) emailWrap без заглавие → „ТеМАХ · Вътрешна платформа" / „temax.bg",
        без „Т-Бюлетин"; изрично заглавие се escape-ва;
     б) писмата на Бюлетина по истинския път — sendWeeklyDigest (дайджестът)
        и bulSendTest (тестовото писмо от менюто на Бюлетина) → заглавката е
        байт по байт старата;
     в) известие от „✍️ Счетоводител" (клик „Запиши", мокнат sendEmail) →
        новото заглавие;
     г) заварените тестове за писма — отделно в пакета; снимката на Товарни
        листи (loading-ui.expected.json) е обновена само по заглавката.

   Мутационна проверка (27.10.2026) — и петте падат с exit 1:
     E1 дайджестът губи заглавието на Бюлетина                 → 2 ❌
     E2 тестовото писмо губи заглавието на Бюлетина             → 1 ❌
     E3 по подразбиране — старото „Т-Бюлетин ТеМАХ"             → 4 ❌
     E4 подзаглавие по подразбиране — старото                   → 4 ❌
     E5 заглавието без esc                                      → 1 ❌

   Пускане:  node tests/email-header.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const OLD_HDR = '<div class="hdr"><div class="hdr-title">Т-Бюлетин ТеМАХ</div><div class="hdr-sub">Вътрешна платформа · temax.bg</div></div>';
const NEW_HDR = '<div class="hdr"><div class="hdr-title">ТеМАХ · Вътрешна платформа</div><div class="hdr-sub">temax.bg</div></div>';
const settle = async () => { for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 15)); await ticks(); } };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

function mockMail(h) {
  h.mails = [];
  h.w.sendEmail = (to, subject, html, extra) => { h.mails.push({ to, subject, html, extra }); return Promise.resolve({ ok: true, status: 200, data: {} }); };
}

(async function run() {

  section('а) emailWrap по подразбиране — общото заглавие');
  {
    const h = boot({ modules: ['push.js', 'email.js'], user: ADMIN, data: {} });
    const html = h.w.emailWrap('<p>X</p>');
    ok('новата заглавка', html.indexOf(NEW_HDR) >= 0, html.slice(html.indexOf('<div class="hdr"'), html.indexOf('<div class="body"')));
    ok('без „Т-Бюлетин"', html.indexOf('Т-Бюлетин') < 0);
    ok('подзаглавието не повтаря „Вътрешна платформа"', html.indexOf('Вътрешна платформа · temax.bg') < 0);
    ok('footer по подразбиране — непроменен', html.indexOf('<div class="footer">ТеМАХ Вътрешна платформа · Автоматично съобщение</div>') >= 0);
    const t = h.w.emailWrap('<p>X</p>', 'F', { title: 'A <b>' });
    ok('изрично заглавие, escape-нато; подзаглавие по подразбиране', t.indexOf('<div class="hdr-title">A &lt;b&gt;</div><div class="hdr-sub">temax.bg</div>') >= 0);
    h.close();
  }

  section('б) писмата на Бюлетина — заглавката байт по байт старата');
  {
    const h = boot({
      modules: ['bulletin.js', 'push.js', 'email.js'], user: ADMIN,
      data: { users: [{ email: 'troyan@temax.bg', display_name: 'Управител Троян', store_name: 'Троян', role: 'manager', active: true }], bulletins: [] }
    });
    mockMail(h);
    h.w.sendWeeklyDigest({ id: 'b1', week_number: 44, year: 2026 }, [
      { id: 't1', title: 'ЗАДАЧА ЗА ТРОЯН', department: 'trade', due_date: '2026-10-28', target_stores: [] }
    ]);
    await settle();
    const m = h.mails[0];
    if (ok('дайджестът е пратен', !!m, h.calls.toast.join(' | '))) {
      ok('дайджест: старата заглавка', m.html.indexOf(OLD_HDR) >= 0, m.html.slice(m.html.indexOf('<div class="hdr"'), m.html.indexOf('<div class="body"')));
      ok('дайджест: без новото заглавие', m.html.indexOf('ТеМАХ · Вътрешна платформа') < 0);
      ok('дайджест: footer „Изпратено от … Понеделник"', /<div class="footer">Изпратено от ТеМАХ Вътрешна платформа · Понеделник /.test(m.html));
    }
    /* Тестовото писмо — от менюто на Бюлетина (bulSendTest чете полето). */
    h.doc.body.insertAdjacentHTML('beforeend', '<input id="test-email-inp" value="me@temax.bg">');
    h.w.bulSendTest(); await settle();
    const t = h.mails[1];
    if (ok('тестовото писмо е пратено', !!t && t.to === 'me@temax.bg')) {
      ok('тестово: старата заглавка', t.html.indexOf(OLD_HDR) >= 0);
      ok('тестово: footer по подразбиране', t.html.indexOf('<div class="footer">ТеМАХ Вътрешна платформа · Автоматично съобщение</div>') >= 0);
    }
    h.close();
  }

  section('в) „✍️ Счетоводител" → известие с новото заглавие');
  {
    const ACC = { email: 'acc.kj@temax.bg', display_name: 'Счетоводител Кърджали', role: 'accounting', store_name: 'Централен офис', assigned_stores: ['Кърджали'] };
    const USERS = [{ email: 'kardzhali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали', active: true }];
    const h = boot({
      modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'push.js', 'email.js'], user: ACC,
      data: { storno_notes: [], storno_note_replies: [], differences_reports: [], stock_differences: [], stock_returns: [],
        transport_orders: [], stock_diff_swaps: [], users: USERS, app_settings: [], contacts: [], stores: [] }
    });
    mockMail(h);
    h.w.pushToPeople = () => Promise.resolve({ ok: true, status: 200, data: {} });
    const orig = h.w.sbPostReturn;
    h.w.sbPostReturn = (t, d) => orig(t, d).then(r => { if (r && r.ok) r.row = Object.assign({ id: 'n-new' }, r.row || {}); return r; });
    h.w.transportOrders = []; h.w.sdView = 'reports'; h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all';
    h.w.sdStoreFilter = ''; h.w.sdSearch = ''; h.w.sdDirTab = 'wrong_receipt';
    h.w.loadAllSuppliers = () => Promise.resolve([]);
    h.w.loadStockDiff(); await settle();
    realClick(h.w, btn(h.doc.getElementById('mod-stock-diff'), '✍️ Счетоводител')); await settle();
    h.doc.getElementById('sd-note-body').value = 'Проверете ФК-1';
    realClick(h.w, btn(h.doc.getElementById('sd-note-ov'), 'Запиши')); await settle();
    const m = h.mails[0];
    if (ok('известието е пратено', !!m, h.calls.toast.join(' | '))) {
      ok('новата заглавка', m.html.indexOf(NEW_HDR) >= 0, m.html.slice(m.html.indexOf('<div class="hdr"'), m.html.indexOf('<div class="body"')));
      ok('без „Т-Бюлетин"', m.html.indexOf('Т-Бюлетин') < 0);
      ok('footer „Разлики · …" — непроменен', m.html.indexOf('<div class="footer">Разлики · ТеМАХ Вътрешна платформа</div>') >= 0);
    }
    h.close();
  }

  report();
})();
