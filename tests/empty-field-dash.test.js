/* „—" в празни полета за редакция (15.10.2026).
   esc() връща „—" за празно, тоест value="'+esc(x||'')+'" (и съдържание на
   <textarea>) предпопълваше празно поле с тире — човекът пишеше след него и
   тирето влизаше в базата (1160 касиери „—Име", 365 коментара в За връщане…).
   Поправено с escAttrVal() (shared.js) в 43 полета в admin, bulletin,
   handbook, kasa, reference, stock-returns; rvVal / rsVal (revaluation.js,
   revisions.js) минаха на него.

   Всяка форма се отваря през РЕАЛНАТА функция на модула, веднъж с празни
   стойности (value === '') и веднъж с попълнени (value === стойността,
   включително 0 → „0", кавичка и многоредов текст в textarea).

   Мутационна проверка (15.10.2026) — всеки вариант е пуснат и е паднал:
     E1 escAttrVal връща escAttr(x) (старото поведение) → падат всички „празно → ''";
     E2 escAttrVal дава '' за 0 (като escVal) → пада „0 остава „0"";
     E3 kasa.js:417 обратно на esc( → пада „kf-cashier празно → ''";
     E4 stock-returns.js:697 обратно на esc( → пада „sr-store-cmt празно → ''";
     E5 reference.js:43 (taField) обратно на esc( → пада „textarea празно → ''".
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

const ADMIN = { email: 'ten.tenev@temax.bg', display_name: 'Тен Тенев', role: 'admin', store_name: 'Централен офис' };
const QUOTE = 'Ще "дойде" утре';
const MULTI = 'ред 1\nред 2\n\nред 4';

function env(modules, over) {
  const h = boot(Object.assign({ modules: modules, user: ADMIN, data: {} }, over || {}));
  return h;
}
/* HTML низ → контейнер в документа (за функциите, които връщат markup) */
function mount(h, html) {
  const d = h.doc.createElement('div');
  d.innerHTML = html;
  h.doc.body.appendChild(d);
  return d;
}
const val = (root, sel) => { const el = root.querySelector(sel); return el ? el.value : '(няма поле)'; };

(async function run() {

  section('0. escAttrVal — помощникът');
  {
    const { w } = env([]);
    ok('null / undefined / "" → ""', w.escAttrVal(null) === '' && w.escAttrVal(undefined) === '' && w.escAttrVal('') === '');
    ok('0 остава „0" (не празно, не „—")', w.escAttrVal(0) === '0');
    ok('false → „false" (не празно, не „—")', w.escAttrVal(false) === 'false');
    ok('кавички → &quot;, < → &lt;', w.escAttrVal('a"b<c') === 'a&quot;b&lt;c');
    ok('escVal не е пипан: 0 → "" (както преди)', w.escVal(0) === '');
    ok('esc не е пипан: "" → „—" (показване)', w.esc('') === '—');
  }

  section('1. admin.js — нов / съществуващ потребител');
  {
    const h = env(['admin.js'], { data: { users: [], stores: [] } });
    guard('_renderUserModal(празен)', () => h.w._renderUserModal({}, []));
    ok('um-email празно → ""', val(h.doc, '#um-email') === '');
    ok('um-name празно → ""', val(h.doc, '#um-name') === '');
    guard('_renderUserModal(попълнен)', () => h.w._renderUserModal({ email: 'a@temax.bg', display_name: QUOTE }, []));
    ok('um-email попълнено', val(h.doc, '#um-email') === 'a@temax.bg');
    ok('um-name с кавички → непроменено', val(h.doc, '#um-name') === QUOTE);
  }

  section('2. bulletin.js — промоция, блокове, задачи');
  {
    const h = env(['bulletin.js'], { data: { bulletin_promotions: [], users: [] } });
    h.w.bulPromotions = [{ id: 'p1', title: '', description: null }, { id: 'p2', title: QUOTE, description: 'линк' }];
    guard('openPromoModal(празна)', () => h.w.openPromoModal('p1'));
    ok('pm-title празно → ""', val(h.doc, '#pm-title') === '');
    ok('pm-desc празно → ""', val(h.doc, '#pm-desc') === '');
    guard('openPromoModal(нова)', () => h.w.openPromoModal(null));
    ok('нова промоция: pm-title / pm-desc → ""', val(h.doc, '#pm-title') === '' && val(h.doc, '#pm-desc') === '');
    guard('openPromoModal(попълнена)', () => h.w.openPromoModal('p2'));
    ok('pm-title попълнено (кавички)', val(h.doc, '#pm-title') === QUOTE && val(h.doc, '#pm-desc') === 'линк');

    h.w.bulMode = 'edit';
    const blk = (b) => mount(h, h.w.editBlock(b, 'mon', 0));
    let d = blk({ id: 'b1', type: 'text', content: '' });
    ok('блок текст: празно съдържание → ""', val(d, 'textarea[data-field="content"]') === '');
    d = blk({ id: 'b2', type: 'text', content: MULTI });
    ok('блок текст: многоредов текст → непроменен', val(d, 'textarea[data-field="content"]') === MULTI);
    d = blk({ id: 'b3', type: 'list', content: '' });
    ok('блок списък: празно → ""', val(d, 'textarea[data-field="content"]') === '');
    d = blk({ id: 'b4', type: 'alert', label: '', content: '' });
    ok('блок алерт: label и content празни → ""', val(d, 'input[data-field="label"]') === '' && val(d, 'textarea[data-field="content"]') === '');
    d = blk({ id: 'b5', type: 'alert', label: 'Внимание', content: 'x' });
    ok('блок алерт: попълнен', val(d, 'input[data-field="label"]') === 'Внимание' && val(d, 'textarea[data-field="content"]') === 'x');
    d = blk({ id: 'b6', type: 'important', title: '', sub: '' });
    ok('блок важно: title и sub празни → ""', val(d, 'input[data-field="title"]') === '' && val(d, 'input[data-field="sub"]') === '');
    d = blk({ id: 'b7', type: 'important', title: QUOTE, sub: 'под' });
    ok('блок важно: попълнен', val(d, 'input[data-field="title"]') === QUOTE && val(d, 'input[data-field="sub"]') === 'под');
    d = blk({ id: 'b8', type: 'image', url: 'https://x/y.png', caption: '' });
    ok('блок снимка: празен подпис → ""', val(d, 'input[data-field="caption"]') === '');
    d = blk({ id: 'b9', type: 'image', url: 'https://x/y.png', caption: 'подпис' });
    ok('блок снимка: подпис попълнен', val(d, 'input[data-field="caption"]') === 'подпис');

    h.w.bulTasks = [{ id: 't1', title: '', due_date: '2026-10-15', target_stores: [] }, { id: 't2', title: QUOTE, due_date: '2026-10-15', target_stores: [] }];
    if (typeof h.w.bulTaskIsForeign === 'function') h.w.bulTaskIsForeign = () => false;
    guard('openEditTaskModal(празна)', () => h.w.openEditTaskModal('t1'));
    ok('etk-title празно → ""', val(h.doc, '#etk-title') === '');
    guard('openEditTaskModal(попълнена)', () => h.w.openEditTaskModal('t2'));
    ok('etk-title попълнено', val(h.doc, '#etk-title') === QUOTE);

    h.w.recurringTasks = [{ id: 'r1', title: '', due_weekdays: [], target_stores: [] }, { id: 'r2', title: 'Вечерен оборот', due_weekdays: [], target_stores: [] }];
    guard('openEditRecurringModal(празна)', () => h.w.openEditRecurringModal('r1'));
    ok('erec-title празно → ""', val(h.doc, '#erec-title') === '');
    guard('openEditRecurringModal(попълнена)', () => h.w.openEditRecurringModal('r2'));
    ok('erec-title попълнено', val(h.doc, '#erec-title') === 'Вечерен оборот');
  }

  section('3. handbook.js — търсачката');
  {
    const h = env(['handbook.js']);
    h.w.hbState.search = '';
    guard('renderHandbook(празно търсене)', () => h.w.renderHandbook());
    ok('hb-search-input празно → ""', val(h.doc, '#hb-search-input') === '');
    h.w.hbState.search = 'ZINVCOUNT';
    guard('renderHandbook(търсене)', () => h.w.renderHandbook());
    ok('hb-search-input с текст', val(h.doc, '#hb-search-input') === 'ZINVCOUNT');
  }

  section('4. kasa.js — касиерът');
  {
    const h = env(['kasa.js'], { user: { email: 'k@temax.bg', display_name: 'Каса', role: 'kasa', store_name: 'Кърджали' }, data: { kasa_reports: [] } });
    guard('openKasaForm(нов)', () => h.w.openKasaForm(null));
    ok('kf-cashier празно → ""', val(h.doc, '#kf-cashier') === '');
    guard('openKasaForm(с касиер)', () => h.w.openKasaForm({ id: 'k1', date: '2026-10-15', store_name: 'Кърджали', cashier_name: 'Мария Иванова Петрова' }));
    ok('kf-cashier попълнено', val(h.doc, '#kf-cashier') === 'Мария Иванова Петрова');
  }

  section('5. reference.js — гаранционен запис, сервизни точки, textarea');
  {
    const h = env(['reference.js'], { data: { warranty_entries: [], warranty_service_locations: [] } });
    let d = mount(h, h.w.taField('Бележка', 'ta-x', '', 3));
    ok('textarea празно → ""', val(d, '#ta-x') === '');
    d = mount(h, h.w.taField('Бележка', 'ta-y', MULTI, 3));
    ok('textarea многоредово → непроменено', val(d, '#ta-y') === MULTI);
    h.w.refSubcats = [{ id: 1, name: 'Подкатегория' }];
    h.w.refBrands = [{ id: 1, name: 'Марка' }];
    const IDS = ['re-period', 're-deadline', 're-svcscope', 're-svcname', 're-svcaddr', 're-svcphone', 're-svcemail', 're-svcperson',
      're-covscope', 're-covregions', 're-hours', 're-svcloc', 're-replacenote', 're-handovermethod', 're-notify', 're-claimhandling'];
    h.w.refEntry = {};
    d = mount(h, h.w.refEntryModalHtml());
    const emptyBad = IDS.filter(id => val(d, '#' + id) !== '');
    ok('16 полета на записа: празни → ""', emptyBad.length === 0, emptyBad.map(id => id + '=' + JSON.stringify(val(d, '#' + id))).join(', '));
    h.w.refEntry = { warranty_period: '24 месеца', claim_deadline: '14 дни', service_scope_foreign: 'Национален', service_name: QUOTE,
      service_address: 'ул. „Шипка" 1', service_phone: '0888', service_email: 's@x.bg', service_contact_person: 'Иван', coverage_scope: 'цяла БГ',
      coverage_regions: 'всички', working_hours: '9–18', service_location: 'В сервиз', replacement_note: 'няма', handover_method: 'куриер',
      notification_method: 'имейл', claim_handling: 'до 30 дни' };
    d = mount(h, h.w.refEntryModalHtml());
    ok('попълнени — непроменени (вкл. кавички)', val(d, '#re-svcname') === QUOTE && val(d, '#re-svcaddr') === 'ул. „Шипка" 1' && val(d, '#re-period') === '24 месеца' && val(d, '#re-claimhandling') === 'до 30 дни');
    h.w.refLocations = [];
    d = mount(h, h.w.refLocationsModalHtml());
    const first = d.querySelector('tr[data-store]');
    ok('сервизна точка без данни: 4 полета → ""', !!first && ['.rl-name', '.rl-phone', '.rl-email', '.rl-person'].every(s => val(first, s) === ''));
    const st = h.w.REF_STORES[0];
    h.w.refLocations = [{ store_name: st, service_name: 'Сервиз', phone: '0', email: 'e@x', contact_person: 'Лице' }];
    d = mount(h, h.w.refLocationsModalHtml());
    const tr = d.querySelector('tr[data-store="' + st + '"]');
    ok('сервизна точка: попълнена; телефон „0" остава „0"', !!tr && val(tr, '.rl-name') === 'Сервиз' && val(tr, '.rl-phone') === '0' && val(tr, '.rl-person') === 'Лице');
  }

  section('6. stock-returns.js — формата за връщане');
  {
    const h = env(['stock-returns.js'], { data: { stock_returns: [], stores: [] } });
    const IDS = ['sr-product', 'sr-sap', 'sr-reason', 'sr-courier', 'sr-cc', 'sr-ctrl', 'sr-store-cmt'];
    const open = (row, tab) => {
      h.w.srData = row ? [row] : [];
      h.w.srEditId = row ? row.id : null;
      h.w.srTab = tab || 'complaint';
      return mount(h, h.w.srModalHtml());
    };
    let d = open(null, 'complaint');
    const present = IDS.filter(id => !!d.querySelector('#' + id));
    ok('нов запис: полетата са във формата', present.length >= 5, present.join(','));
    const bad = present.filter(id => val(d, '#' + id) !== '');
    ok('нов запис: празни → ""', bad.length === 0, bad.map(id => id + '=' + JSON.stringify(val(d, '#' + id))).join(', '));
    d = open({ id: 's1', source: 'diff', store_name: 'Шумен', product_name: '', sap_code: '', reason: '', courier_info: '', control_comment: '', controller_comment: '', store_comment: '' });
    const present2 = IDS.filter(id => !!d.querySelector('#' + id));
    const bad2 = present2.filter(id => val(d, '#' + id) !== '');
    ok('редакция с празни (по разлики): 6 полета → "" (sr-reason е само при рекламации)', present2.length === 6 && present2.indexOf('sr-reason') < 0 && bad2.length === 0, present2.length + ' / ' + bad2.join(','));
    d = open({ id: 's3', source: 'complaint', store_name: 'Шумен', product_name: '', sap_code: '', reason: '', courier_info: '', control_comment: '', controller_comment: '', store_comment: '' });
    const present3 = IDS.filter(id => !!d.querySelector('#' + id));
    const bad3 = present3.filter(id => val(d, '#' + id) !== '');
    ok('редакция с празни (рекламация): sr-reason също → ""', present3.indexOf('sr-reason') >= 0 && bad3.length === 0, present3.join(',') + ' / ' + bad3.join(','));
    d = open({ id: 's2', source: 'diff', store_name: 'Шумен', product_name: QUOTE, sap_code: '34989', reason: 'счупен', courier_info: 'Еконт', control_comment: 'ИЗД КИ', controller_comment: 'КЪМ ЛС', store_comment: 'взето' });
    ok('редакция с попълнени: непроменени', val(d, '#sr-product') === QUOTE && val(d, '#sr-sap') === '34989' && val(d, '#sr-store-cmt') === 'взето' && val(d, '#sr-courier') === 'Еконт');
  }

  section('7. revaluation.js / revisions.js — минаха на escAttrVal');
  {
    const h = env(['revaluation.js', 'revisions.js']);
    ok('rvVal и rsVal ги няма (без три копия)', typeof h.w.rvVal === 'undefined' && typeof h.w.rsVal === 'undefined');
    ok('escAttrVal е достъпен за тях', typeof h.w.escAttrVal === 'function');
  }

  report();
})();
