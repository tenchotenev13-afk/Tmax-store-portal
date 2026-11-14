/* Преоценка — одобрение от регионалния на обекта (13.11.2026, revaluation.js).
   draft → submitted (= чака регионалния) → approved → processed; обект без
   регионален: draft → approved с approved_by 'без регионален'. Контролинг
   обработва САМО approved. Регионалният: „✅ Одобри" (по всяко време) или
   „↩ Върни на обекта" (само в дните на кампанията, задължителен коментар).
   Интеграционно: shared.js + admin.js + stock-returns.js + push.js + email.js
   + revaluation.js в реда от index.html; push и имейл са стъбнати.

   Мутационна проверка (13.11.2026) — всеки вариант е пуснат и е паднал:
     A1 rvSubmitPatch винаги 'approved' (без регионалния)
        → пада „обект с регионален → PATCH status submitted";
     A2 rvRecipients винаги групата
        → пада „push само до регионалния";
     A3 rvCoCanEdit пак пуска 'submitted'
        → пада „Елица: без розови полета при чакаща";
     A4 rvRegReturn без проверката за празен коментар
        → пада „празен коментар → нищо не е върнато";
     A5 rvRegCanReturn без rvCampaignOpenNow
        → пада „извън дните: „Върни" е disabled" и „…rvRegReturn() → отказ";
     A6 rvRegCanAct без rvIsRegionalFor
        → пада „Елица (admin, не регионален): без „Одобри"";
     A7 rvStoreStaff без 'sklad'
        → пада „върната → push до управителя и склада";
     A8 rvSubmitRoute продължава при паднала заявка за потребителите
        → пада „паднали потребители → бланката НЕ е подадена";
     A9 rvCoStatus брои „нямат" + submitted като „нямат"
        → пада „„нямат" + submitted → „чакат регионален 1"…";
     B1 rvIsApproverFor без списъка → пада „одобряващ от списъка … „Одобри" за Кърджали";
     B2 rvIsApproverFor без обекта (имейлът от всеки обект) → пада „…а за Шумен — без „Одобри"";
     B3 rvRegionalsOf без одобряващите → пада „„Подай" в Кърджали → известие и до одобряващия";
     B4 rvParseApprovers без try/catch → пада „счупен JSON → без одобряващи";
     B5 rvSubmitRoute продължава при паднал ключ → пада „паднал ключ при „Подай" …";
     B6 имейлите без малки букви → пада „одобряващ от списъка … Кърджали" (Approver@ в ключа).
   B4 гърми със SyntaxError преди report() → изход 1 („тестът гръмна").
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, section, report, dayOffset, ticks } = H;

const CAMP = { id: 'c-1', title: 'Пожелателна преоценка 11.2026', kind: 'optional', starts_on: dayOffset(-1), ends_on: dayOffset(1), default_pct: 50, status: 'open' };
const PAST = Object.assign({}, CAMP, { starts_on: dayOffset(-5), ends_on: dayOffset(-2) });
const NOW = new Date().toISOString();
const ITEM = (sub, store) => ({ id: 'i-' + sub, submission_id: sub, campaign_id: 'c-1', store_name: store, sort_order: 1, sap_code: '14557',
  product_name: 'ЛАМПА', unit: 'бр.', qty: 2, std_price: 120, discount_pct: 50, proposed_price: 60, store_comment: 'стар модел' });
const SUB_K = st => ({ id: 's-k', campaign_id: 'c-1', store_name: 'Кърджали', status: st, no_items: false, submitted_at: st === 'draft' ? null : NOW, default_pct: null });
const SUB_SH = { id: 's-sh', campaign_id: 'c-1', store_name: 'Шумен', status: 'draft', no_items: false, default_pct: null };

const ELITSA = { email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', role: 'admin', store_name: 'Централен офис' };
const MGR_K = { email: 'managerkardjali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };
const MGR_SH = { email: 'manager.shumen@temax.bg', display_name: 'Управител Шумен', role: 'manager', store_name: 'Шумен' };
const REG_K = { email: 'reg.kardzhali@temax.bg', display_name: 'Регионален Кърджали', role: 'accounting', store_name: 'Централен офис' };
const USERS = [
  { email: 'managerkardjali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали', active: true, is_regional: false, assigned_stores: [] },
  { email: 'sklad.kardjali@temax.bg', display_name: 'Склад Кърджали', role: 'sklad', store_name: 'Кърджали', active: true, is_regional: false, assigned_stores: [] },
  { email: 'kasa.kardjali@temax.bg', display_name: 'Каса Кърджали', role: 'kasa', store_name: 'Кърджали', active: true, is_regional: false, assigned_stores: [] },
  { email: 'manager.shumen@temax.bg', display_name: 'Управител Шумен', role: 'manager', store_name: 'Шумен', active: true, is_regional: false, assigned_stores: [] },
  { email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', role: 'admin', store_name: 'Централен офис', active: true, is_regional: false, assigned_stores: [], notify_groups: ['controlling', 'revaluation'] },
  { email: 'reg.kardzhali@temax.bg', display_name: 'Регионален Кърджали', role: 'accounting', store_name: 'Централен офис', active: true, is_regional: true, assigned_stores: ['Кърджали'] },
  /* одобряващ от app_settings.revaluation_approvers — admin, НЕ регионален, без assigned_stores */
  { email: 'approver@temax.bg', display_name: 'Одобряващ ЦО', role: 'admin', store_name: 'Централен офис', active: true, is_regional: false, assigned_stores: [] },
  /* неактивен „регионален" на Шумен — не се брои: Шумен е БЕЗ регионален */
  { email: 'old.reg@temax.bg', display_name: 'Бивш регионален', role: 'accounting', store_name: 'Централен офис', active: false, is_regional: true, assigned_stores: ['Шумен'] }
];

function env(o) {
  o = o || {};
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'push.js', 'email.js', 'revaluation.js'],
    user: o.user || ELITSA,
    confirm: o.confirm,
    fail: o.fail,
    data: {
      revaluation_campaigns: o.campaigns || [CAMP],
      revaluation_submissions: () => o.subs || [SUB_K('submitted')],
      revaluation_items: url => (o.items || [ITEM('s-k', 'Кърджали'), ITEM('s-sh', 'Шумен')]).filter(it => url.indexOf('submission_id=eq.') < 0 || url.indexOf('submission_id=eq.' + it.submission_id) >= 0),
      stores: [{ name: 'Кърджали' }, { name: 'Шумен' }, { name: 'Централен офис' }],
      users: url => url.indexOf('email=eq.') >= 0 ? USERS.filter(u => url.indexOf(encodeURIComponent(u.email)) >= 0) : USERS,
      product_catalog: [],
      app_settings: [{ key: 'revaluation_done_cc', value: 'cc@temax.bg' }].concat(o.settings || [])
    },
    globals: {
      pushToPeople: (names, title, msg) => { h.push.push({ names, title, msg }); return Promise.resolve({ ok: true }); },
      sendEmail: (to, subj, html, extra) => { h.mail.push({ to, subj, html }); return Promise.resolve({ ok: true }); }
    }
  });
  h.push = []; h.mail = []; h.files = [];
  h.w.rvStoresOn = true;
  h.w.XLSX = { utils: { book_new: () => ({ SheetNames: [], Sheets: {} }), aoa_to_sheet: a => ({ a }), book_append_sheet: (wb, ws, n) => { wb.SheetNames.push(n); } },
    write: () => 'QQ==', writeFile: (wb, f) => { h.files.push(f); } };
  return h;
}
const mod = h => h.doc.getElementById('mod-revaluation');
const subPatches = h => h.calls.patch.filter(x => x.table === 'revaluation_submissions');
const toasted = (h, s) => h.calls.toast.some(t => t.indexOf(s) >= 0);
async function openStore(h) { await h.w.loadRevaluation(); await ticks(6); }
async function openCo(h, store) { await h.w.loadRevaluation(); await ticks(6); await h.w.rvCoOpenStore(store); await ticks(6); }

(async function run() {
  section('1. Обект с регионален: „Подай" → чака регионалния, известие само до него');
  {
    const h = env({ user: MGR_K, subs: [SUB_K('draft')] });
    await openStore(h);
    realClick(h.w, btn(mod(h), 'Подай')); await ticks(10);
    const p = subPatches(h)[0];
    ok('обект с регионален → PATCH status submitted', p && p.body.status === 'submitted' && p.body.approved_at === null && p.body.approved_by === null, p && JSON.stringify(p.body));
    ok('push само до регионалния', h.push.length === 1 && JSON.stringify(h.push[0].names) === JSON.stringify(['Регионален Кърджали']), h.push[0] && h.push[0].names.join(','));
    ok('Елица (групата) НЕ получава при подаване', h.push.every(x => x.names.indexOf('Елица Гюрова') < 0));
    ok('имейл само до регионалния', h.mail.length === 1 && h.mail[0].to.join(',') === 'reg.kardzhali@temax.bg', h.mail[0] && h.mail[0].to.join(','));
    ok('текстът казва „чака одобрение"', h.push[0] && /: подадени 1 ред(а)? — чака одобрение$/.test(h.push[0].msg), h.push[0] && h.push[0].msg);
    ok('статус „Подадена … чака регионалния"', h.doc.getElementById('rv-status').textContent.indexOf('чака регионалния') >= 0);
    ok('лента „Чака одобрение от регионалния"', !!h.doc.getElementById('rv-wait-reg'));
    ok('обектът: без „Одобри"', !btn(mod(h), 'Одобри'));
    ok('rvRegApprove() от обекта → отказ, без запис', (await h.w.rvRegApprove()) === false && subPatches(h).length === 1);
  }

  section('2. Обект без регионален: „Подай" → направо одобрена, известие до групата');
  {
    const h = env({ user: MGR_SH, subs: [SUB_SH] });
    await openStore(h);
    realClick(h.w, btn(mod(h), 'Подай')); await ticks(10);
    const p = subPatches(h)[0];
    ok('PATCH status approved, approved_by „без регионален"', p && p.body.status === 'approved' && p.body.approved_by === 'без регионален' && p.body.approved_at === p.body.submitted_at, p && JSON.stringify(p.body));
    ok('неактивният „регионален" не се брои', p && p.body.status === 'approved');
    ok('push до групата „Преоценка" (Елица)', h.push.length === 1 && h.push[0].names.join(',') === 'Елица Гюрова', h.push[0] && h.push[0].names.join(','));
    ok('без „чака одобрение" в текста', h.push[0] && h.push[0].msg.indexOf('чака') < 0);
    ok('без лентата за чакане', !h.doc.getElementById('rv-wait-reg'));
  }

  section('3. „Нямаме за преоценка" минава по същия път');
  {
    const h = env({ user: MGR_K, subs: [SUB_K('draft')], items: [] });
    await openStore(h);
    realClick(h.w, btn(mod(h), 'Нямаме за преоценка')); await ticks(10);
    const p = subPatches(h)[0];
    ok('Кърджали: no_items → status submitted', p && p.body.no_items === true && p.body.status === 'submitted', p && JSON.stringify(p.body));
    ok('известие до регионалния', h.push[0] && h.push[0].names.join(',') === 'Регионален Кърджали');
  }

  section('4. Паднала заявка за потребителите → бланката НЕ е подадена');
  {
    const h = env({ user: MGR_K, subs: [SUB_K('draft')], fail: { GET: /\/users\?active=eq\.true/ } });
    await openStore(h);
    realClick(h.w, btn(mod(h), 'Подай')); await ticks(10);
    ok('паднали потребители → бланката НЕ е подадена', subPatches(h).length === 0);
    ok('червен toast „… не се прочетоха — бланката НЕ е подадена"', toasted(h, 'не се прочетоха — бланката НЕ е подадена'));
    ok('без известия', h.push.length === 0 && h.mail.length === 0);
  }

  section('5. Контролинг при чакаща бланка — само четене');
  {
    const h = env({ user: ELITSA });
    await h.w.loadRevaluation(); await ticks(6);
    const row = h.doc.getElementById('rv-co-Кърджали');
    ok('списък: „чака регионален"', !!row && row.textContent.indexOf('чака регионален') >= 0, row && row.textContent);
    ok('обобщение: „чакат регионален 1"', h.doc.getElementById('rv-co-tally').textContent.indexOf('чакат регионален 1') >= 0);
    realClick(h.w, row.querySelector('button')); await ticks(8);
    ok('„Отвори" отваря бланката', h.w.rvCoOpen === true && h.w.rvStore === 'Кърджали');
    ok('Елица: без розови полета при чакаща', h.doc.querySelectorAll('#rv-rows input').length === 0 && h.doc.querySelector('#rv-rows .rv-code-badge') === null);
    const none = ['Приеми предложените', 'MM41', 'Кодовете са създадени', 'VK11', 'Прехвърляне', 'Готово за обект'].filter(t => btn(mod(h), t));
    ok('без „Приеми", MM41, VK11, Прехвърляне, „Готово"', none.length === 0, none.join(' | '));
    ok('„Отключи бланката" остава', !!btn(mod(h), 'Отключи бланката'));
    ok('Елица (admin, не регионален): без „Одобри"', !btn(mod(h), 'Одобри') && !btn(mod(h), 'Върни на обекта'));
    ok('rvCoDone() → отказ', (await h.w.rvCoDone()) === false && subPatches(h).length === 0);
    ok('rvCoEdit() → отказ', (await h.w.rvCoEdit('i-s-k', 'new_sap_code', '8014557')) === false && !h.calls.patch.some(x => x.table === 'revaluation_items'));
    ok('rvVk11() / rvTransfer() → отказ', h.w.rvVk11() === false && (await h.w.rvTransfer()) === false && h.files.length === 0);
    const mm = await h.w.rvMm41Collect();
    ok('rvMm41Collect → без редове', mm.ok && mm.rows.length === 0);
    await h.w.rvExportCampaign(); await ticks(4);
    ok('„Excel — кампания" не включва чакащата', h.files.length === 0 && toasted(h, 'чака регионалния — не са включени'), h.calls.toast.join(' | '));
  }

  section('6. Регионалният връща — празен коментар → отказ; с коментар → чернова');
  {
    const h = env({ user: REG_K });
    await openCo(h, 'Кърджали');
    ok('регионалният вижда „Одобри" и „Върни"', !!btn(mod(h), 'Одобри') && !!btn(mod(h), 'Върни на обекта') && !btn(mod(h), 'Върни на обекта').disabled);
    realClick(h.w, btn(mod(h), 'Върни на обекта')); await ticks(6);
    ok('празен коментар → нищо не е върнато', subPatches(h).length === 0 && toasted(h, 'коментарът е задължителен'));
    h.doc.getElementById('rv-return-note').value = '   ';
    realClick(h.w, btn(mod(h), 'Върни на обекта')); await ticks(6);
    ok('само интервали → пак отказ', subPatches(h).length === 0);
    h.doc.getElementById('rv-return-note').value = 'липсва коментар на ред 3';
    realClick(h.w, btn(mod(h), 'Върни на обекта')); await ticks(10);
    const p = subPatches(h)[0];
    ok('с коментар → PATCH draft + return_note', p && p.body.status === 'draft' && p.body.return_note === 'липсва коментар на ред 3' && p.body.returned_by === 'Регионален Кърджали' && !!p.body.returned_at, p && JSON.stringify(p.body));
    const names = h.push[0] ? h.push[0].names.slice().sort().join(',') : '';
    ok('върната → push до управителя и склада', names === 'Склад Кърджали,Управител Кърджали', names);
    ok('каса и Елица — не', names.indexOf('Каса') < 0 && names.indexOf('Елица') < 0);
    ok('имейлът носи коментара', h.mail.length === 1 && h.mail[0].html.indexOf('липсва коментар на ред 3') >= 0 && h.mail[0].to.length === 2);
    /* обектът отваря върнатата бланка */
    const s = env({ user: MGR_K, subs: [Object.assign(SUB_K('draft'), { return_note: 'липсва коментар на ред 3', returned_at: NOW, returned_by: 'Регионален Кърджали' })] });
    await openStore(s);
    const shown = s.doc.getElementById('rv-return-shown');
    ok('обектът вижда коментара над таблицата', !!shown && shown.textContent.indexOf('липсва коментар на ред 3') >= 0 && shown.textContent.indexOf('Регионален Кърджали') >= 0);
    ok('статус „Върната — чернова"', s.doc.getElementById('rv-status').textContent.indexOf('Върната') === 0);
    ok('обектът пак може да подаде', !!btn(mod(s), 'Подай'));
    const r = env({ user: MGR_K, subs: [Object.assign(SUB_K('draft'), { return_note: 'стара', returned_at: '2026-11-10T08:00:00Z', reopened_at: '2026-11-11T08:00:00Z' })] });
    await openStore(r);
    ok('след „Отключи" (по-късно) старият коментар не се показва', !r.doc.getElementById('rv-return-shown'));
  }

  section('7. Регионалният одобрява → Контролинг обработва');
  {
    const h = env({ user: REG_K });
    await openCo(h, 'Кърджали');
    realClick(h.w, btn(mod(h), 'Одобри')); await ticks(10);
    const p = subPatches(h)[0];
    ok('PATCH approved + approved_by', p && p.body.status === 'approved' && p.body.approved_by === 'Регионален Кърджали' && !!p.body.approved_at);
    ok('одобрено → push до групата (Елица)', h.push.length === 1 && h.push[0].names.join(',') === 'Елица Гюрова' && /одобрена от регионалния$/.test(h.push[0].msg), h.push[0] && h.push[0].msg);
    ok('имейл до групата', h.mail.length === 1 && h.mail[0].to.join(',') === 'e.gurova@temax.bg');
    ok('след одобрението — без „Одобри"', !btn(mod(h), 'Одобри'));
    const e = env({ user: ELITSA, subs: [Object.assign(SUB_K('approved'), { approved_at: NOW, approved_by: 'Регионален Кърджали' })] });
    await e.w.loadRevaluation(); await ticks(6);
    ok('списък: „одобрена"', e.doc.getElementById('rv-co-Кърджали').textContent.indexOf('одобрена') >= 0);
    await e.w.rvCoOpenStore('Кърджали'); await ticks(6);
    ok('Елица: розовите полета са там', e.doc.querySelectorAll('#rv-rows input[data-f="new_sap_code"]').length === 1);
    const has = ['Приеми предложените', 'MM41', 'VK11', 'Прехвърляне', 'Готово за обект', 'Отключи бланката'].filter(t => !btn(mod(e), t));
    ok('и бутоните на Контролинг', has.length === 0, has.join(' | '));
    ok('статус „Одобрена … Регионален Кърджали"', e.doc.getElementById('rv-status').textContent.indexOf('Регионален Кърджали') >= 0);
    realClick(e.w, btn(mod(e), 'Отключи бланката')); await ticks(8);
    const u = subPatches(e)[0];
    ok('„Отключи" работи и за одобрена — чисти approved_*', u && u.body.status === 'draft' && u.body.approved_at === null && u.body.approved_by === null);
  }

  section('8. Извън дните на кампанията: „Върни" — не; „Одобри" — да');
  {
    const h = env({ user: REG_K, campaigns: [PAST] });
    await openCo(h, 'Кърджали');
    const b = btn(mod(h), 'Върни на обекта');
    ok('извън дните: „Върни" е disabled', !!b && b.disabled === true && !h.doc.getElementById('rv-return-note'));
    ok('…rvRegReturn() → отказ, без запис', (await h.w.rvRegReturn()) === false && subPatches(h).length === 0 && toasted(h, 'само в дните на кампанията'));
    realClick(h.w, btn(mod(h), 'Одобри')); await ticks(10);
    ok('„Одобри" работи и след края', subPatches(h)[0] && subPatches(h)[0].body.status === 'approved');
  }

  section('8б. „Нямат", чакаща регионалния — в брояча „чакат регионален"');
  {
    const h = env({ user: ELITSA, subs: [Object.assign(SUB_K('submitted'), { no_items: true })] });
    await h.w.loadRevaluation(); await ticks(6);
    const t = h.doc.getElementById('rv-co-tally').textContent;
    ok('„нямат" + submitted → „чакат регионален 1", „нямат 0"', t.indexOf('чакат регионален 1') >= 0 && t.indexOf('нямат 0') >= 0, t);
  }

  section('10. Одобряващи от app_settings.revaluation_approvers');
  {
    const APPROVER = { email: 'approver@temax.bg', display_name: 'Одобряващ ЦО', role: 'admin', store_name: 'Централен офис' };
    const AP_K = [{ key: 'revaluation_approvers', value: '{"Кърджали":["Approver@temax.bg"],"Раднево":["approver@temax.bg"]}' }];
    const SUB_SH_SUB = Object.assign({}, SUB_SH, { status: 'submitted', submitted_at: NOW });
    /* бутоните */
    let h = env({ user: APPROVER, settings: AP_K });
    await openCo(h, 'Кърджали');
    ok('одобряващ от списъка (не регионален): „Одобри\" за Кърджали', !!btn(mod(h), 'Одобри') && !!btn(mod(h), 'Върни на обекта'));
    ok('…но без право да пише в бланката', !btn(mod(h), 'Изтрий ред'));
    realClick(h.w, btn(mod(h), 'Одобри')); await ticks(10);
    ok('…и одобрява (approved_by = името му)', subPatches(h)[0] && subPatches(h)[0].body.status === 'approved' && subPatches(h)[0].body.approved_by === 'Одобряващ ЦО');
    h = env({ user: APPROVER, settings: AP_K, subs: [SUB_SH_SUB] });
    await openCo(h, 'Шумен');
    ok('…а за Шумен — без „Одобри\"', !btn(mod(h), 'Одобри') && !btn(mod(h), 'Върни на обекта'));
    ok('rvRegApprove() за Шумен → отказ', (await h.w.rvRegApprove()) === false && subPatches(h).length === 0);
    /* „Подай" в Кърджали → и до него */
    h = env({ user: MGR_K, subs: [SUB_K('draft')], settings: AP_K });
    await openStore(h);
    realClick(h.w, btn(mod(h), 'Подай')); await ticks(10);
    const names = h.push[0] ? h.push[0].names.slice().sort().join(',') : '';
    ok('„Подай\" в Кърджали → известие и до одобряващия', names === 'Одобряващ ЦО,Регионален Кърджали', names);
    ok('имейл и до него', h.mail[0] && h.mail[0].to.slice().sort().join(',') === 'approver@temax.bg,reg.kardzhali@temax.bg', h.mail[0] && h.mail[0].to.join(','));
    /* обект без регионален, но в списъка → чака одобряващия */
    h = env({ user: MGR_SH, subs: [SUB_SH], settings: [{ key: 'revaluation_approvers', value: '{"Шумен":["approver@temax.bg"]}' }] });
    await openStore(h);
    realClick(h.w, btn(mod(h), 'Подай')); await ticks(10);
    ok('Шумен в списъка (без регионален) → submitted', subPatches(h)[0] && subPatches(h)[0].body.status === 'submitted');
    ok('…известие само до одобряващия', h.push[0] && h.push[0].names.join(',') === 'Одобряващ ЦО', h.push[0] && h.push[0].names.join(','));
    /* обект извън списъка и без регионален → направо одобрена */
    h = env({ user: MGR_SH, subs: [SUB_SH], settings: AP_K });
    await openStore(h);
    realClick(h.w, btn(mod(h), 'Подай')); await ticks(10);
    ok('обект извън списъка и без регионален → направо одобрена', subPatches(h)[0] && subPatches(h)[0].body.status === 'approved' && subPatches(h)[0].body.approved_by === 'без регионален');
    /* счупен JSON → без одобряващи */
    const BAD = [{ key: 'revaluation_approvers', value: '{"Кърджали":["approver@temax.bg"' }];
    h = env({ user: APPROVER, settings: BAD });
    await openCo(h, 'Кърджали');
    ok('счупен JSON → без одобряващи (няма „Одобри\")', !btn(mod(h), 'Одобри'));
    h = env({ user: MGR_SH, subs: [SUB_SH], settings: [{ key: 'revaluation_approvers', value: '{"Шумен":"approver@temax.bg"' }] });
    await openStore(h);
    realClick(h.w, btn(mod(h), 'Подай')); await ticks(10);
    ok('счупен JSON при „Подай\" → като без одобряващи (направо одобрена, без грешка)', subPatches(h)[0] && subPatches(h)[0].body.status === 'approved' && !toasted(h, 'НЕ е подадена'));
    ok('rvParseApprovers: масив, не-масив, празно → {}', JSON.stringify(h.w.rvParseApprovers('["x"]')) === '{}' && JSON.stringify(h.w.rvParseApprovers('{"A":"x"}')) === '{}' && JSON.stringify(h.w.rvParseApprovers('')) === '{}' && JSON.stringify(h.w.rvParseApprovers(null)) === '{}');
    /* паднало четене на ключа при „Подай" → НЕ се подава */
    h = env({ user: MGR_SH, subs: [SUB_SH], settings: AP_K, fail: { GET: /app_settings\?key=eq\.revaluation_approvers/ } });
    await openStore(h);
    realClick(h.w, btn(mod(h), 'Подай')); await ticks(10);
    ok('паднал ключ при „Подай\" → бланката НЕ е подадена', subPatches(h).length === 0 && toasted(h, 'НЕ е подадена'));
  }

  section('9. Обектът вижда кампанията и с одобрена бланка');
  {
    const h = env({ user: MGR_K, campaigns: [PAST], subs: [SUB_K('approved')] });
    await openStore(h);
    ok('заявката за своите бланки включва approved', h.calls.get.some(u => u.indexOf('status=in.(submitted,approved,processed)') >= 0));
  }

  report();
})().catch(e => {
  /* Хвърлена грешка преди report() = провал с код 1, не увисване. */
  console.log('  ❌ тестът гръмна: ' + ((e && e.stack) || e));
  process.exit(1);
});
