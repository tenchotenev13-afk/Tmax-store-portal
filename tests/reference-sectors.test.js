/* Рекламации → Гаранционен справочник: ред „Гаранционни карти по сектори:“
   (24.11.2026, решение на Тенчо; няколко сектора на бланка — 25.11.2026).
   8 сектора в фиксиран ред; клик показва бланките на сектора
   (warranty_templates.sectors — text[]; бланка в два сектора излиза и в двата),
   втори клик затваря. Сектор без бланка е СИВ <button> с „няма бланка“ — не
   се скрива. Общото меню „🖨 Гаранционна карта ▾“ е МАХНАТО (Теодор,
   27.11.2026): бланка без сектор (null или []) не се вижда никъде, а в
   „Управление“ под нея стои жълто „⚠️ Без сектор …“, което следва
   отметките веднага. Редът със секторите е 15px (надпис, бутони, линкове),
   бутоните — padding 8px 14px.
   „⚙️ Управление на записи“: 8 отметки на бланка → PATCH {sectors:[…]} в реда
   на REF_SECTORS; без нито една отметка → {sectors:null}, не []; грешка →
   червен toast и отметката се връща.

   Мутационна проверка (25.11.2026, всяка върната след пуска):
   М1 refSectorTemplates гледа само първия сектор от масива
      (refTplSectors(t)[0] === name)
      → пада „hobby е и в Градина“ и броят „Градина (2)“.
   М2 refTemplateToggleSector пише [] вместо null (val = next)
      → пада „последната отметка → PATCH {sectors:null}“.
   М3 без връщане на отметката при грешка (махнат cb.checked = !on)
      → пада „отметката се връща“.
   Резултат: и трите — exit 1. Чистият код: exit 0.

   Мутационна проверка (27.11.2026, махнато меню / предупреждение / размер):
   М4 менюто остава — renderReference пак слага <button>„🖨 Гаранционна карта ▾“
   М5 предупреждението не излиза — refTplNoSectorHtml връща винаги ''
   М6 стар размер — бутоните на секторите пак с font-size:12px
   Резултат: и трите — exit 1 (М4: 2 паднали, М5: 8, М6: 1). Чистият код: exit 0.

   Пускане: node tests/reference-sectors.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, ok, guard, section, report, ticks } = H;

const SECTORS = ['Машини','Градина','Осветление','Бои','Строителство','Баня',
  'Дом. потреби и текстил','Интериор и декорация'];

function templates() {
  return [
    { id: 't1', filename: 'hobby.pdf', label: 'Hobby', sort_order: 1, sectors: ['Машини', 'Градина'] },
    { id: 't2', filename: 'heatmann.pdf', label: 'Heatmann', sort_order: 2, sectors: null },
    { id: 't3', filename: 'tayfun.pdf', label: 'Тайфун', sort_order: 3, sectors: ['Машини'] },
    { id: 't4', filename: 'mehanik.pdf', label: 'Механик', sort_order: 4, sectors: ['Машини'] },
    { id: 't5', filename: 'oranzherii.pdf', label: 'Оранжерии', sort_order: 5, sectors: ['Градина'] },
    { id: 't6', filename: 'smesiteli.pdf', label: 'Смесители', sort_order: 6, sectors: ['Баня'] },
    { id: 't9', filename: 'monoblok.pdf', label: 'Моноблокове', sort_order: 9, sectors: ['Баня'] },
    { id: 't11', filename: 'agromashini.pdf', label: 'Агро машини', sort_order: 11, sectors: [] },
    { id: 't12', filename: 'vrati.pdf', label: 'Метални входни врати', sort_order: 12, sectors: null }
  ];
}
const N_TPL = 9;

const STORE_USER = { email: 'tr@temax.bg', display_name: 'Троян', role: 'store', store_name: 'Троян' };
const ADMIN_USER = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function env(user, extra) {
  const h = boot(Object.assign({
    modules: ['reference.js'],
    user: user,
    data: {
      warranty_subcategories: [], warranty_brands: [], warranty_entries: [],
      warranty_templates: templates(), warranty_service_locations: []
    }
  }, extra || {}));
  /* цветът на toast-а — харнесът пази само текста */
  h.toastColors = [];
  const t = h.w.toast;
  h.w.toast = (m, c) => { h.toastColors.push([m, c]); return t(m, c); };
  return h;
}

/* само <button> — „няма такъв бутон“ не бива да се заблуди от друг елемент */
function sectorBtns(doc) {
  return Array.prototype.slice.call(doc.querySelectorAll('#ref-sector-wrap button'));
}
function sectorBtn(doc, name) {
  return sectorBtns(doc).find(b => b.textContent.trim().indexOf(name) === 0);
}
function listHrefs(doc) {
  const l = doc.getElementById('ref-sector-list');
  return l ? Array.prototype.map.call(l.querySelectorAll('a'), a => a.getAttribute('href')) : null;
}
/* отметките на бланка в „Управление на записи“, в реда на показване */
function checks(doc, id) {
  const box = doc.querySelector('#ref-admin-ov [data-tpl-sectors="' + id + '"]');
  return box ? Array.prototype.slice.call(box.querySelectorAll('input[type="checkbox"]')) : [];
}
/* жълтото „Без сектор“ под бланката в „Управление на записи“ */
function noSector(doc, id) {
  const el = doc.querySelector('#ref-admin-ov [data-tpl-nosector="' + id + '"]');
  return !!el && el.textContent.indexOf('⚠️ Без сектор — тази бланка не се вижда никъде в справочника.') >= 0;
}
/* истински клик по отметка: браузърът обръща checked, после пуска onchange */
function clickCheck(w, cb) {
  cb.checked = !cb.checked;
  fire(w, cb, 'change');
}

(async function run() {

  for (const [who, user] of [['обект', STORE_USER], ['админ', ADMIN_USER]]) {
    section('1. Редът със секторите — ' + who + ', без избрана марка');
    const { w, doc } = env(user);
    guard('loadReference() не хвърля', () => w.loadReference());
    await ticks();
    const wrap = doc.getElementById('ref-sector-wrap');
    ok('има ред „Гаранционни карти по сектори:“', wrap && wrap.textContent.indexOf('Гаранционни карти по сектори:') >= 0);
    ok('няма избрана марка', !w.refSelBrand);
    const btns = sectorBtns(doc);
    ok('8 бутона в реда', btns.length === 8, 'намерени: ' + btns.length);
    ok('в зададения ред', btns.map(b => b.textContent.trim()).every((t, i) => t.indexOf(SECTORS[i]) === 0),
      btns.map(b => b.textContent.trim()).join(' | '));

    ok('Машини (3)', sectorBtn(doc, 'Машини').textContent.indexOf('(3)') >= 0, sectorBtn(doc, 'Машини').textContent);
    ok('Градина (2) — hobby се брои и там', sectorBtn(doc, 'Градина').textContent.indexOf('(2)') >= 0, sectorBtn(doc, 'Градина').textContent);
    const os = sectorBtn(doc, 'Осветление');
    ok('Осветление е <button> с „няма бланка“', !!os && os.tagName === 'BUTTON' && os.textContent.indexOf('няма бланка') >= 0);
    ok('Осветление е сив и неактивен', os && os.disabled && /#94a3b8/.test(os.getAttribute('style')));
    ok('празните сектори са точно 5', btns.filter(b => b.textContent.indexOf('няма бланка') >= 0).length === 5,
      btns.filter(b => b.textContent.indexOf('няма бланка') >= 0).map(b => b.textContent.trim()).join(' | '));

    ok('преди клик няма списък', listHrefs(doc) === null);
    realClick(w, sectorBtn(doc, 'Машини'), 'Машини');
    const m = listHrefs(doc);
    ok('Машини показва точно своите 3', m && m.length === 3 &&
      ['hobby.pdf', 'tayfun.pdf', 'mehanik.pdf'].every(f => m.indexOf('warranty-templates/' + f) >= 0), String(m));
    ok('линковете се отварят в нов таб', Array.prototype.every.call(
      doc.querySelectorAll('#ref-sector-list a'), a => a.getAttribute('target') === '_blank'));
    realClick(w, sectorBtn(doc, 'Градина'), 'Градина');
    const g = listHrefs(doc);
    ok('hobby е и в Градина (бланка в два сектора)', g && g.length === 2 &&
      g.indexOf('warranty-templates/hobby.pdf') >= 0 && g.indexOf('warranty-templates/oranzherii.pdf') >= 0, String(g));
    realClick(w, sectorBtn(doc, 'Баня'), 'Баня');
    const b = listHrefs(doc);
    ok('клик на Баня сменя на смесители + моноблокове', b && b.length === 2 &&
      b.indexOf('warranty-templates/smesiteli.pdf') >= 0 && b.indexOf('warranty-templates/monoblok.pdf') >= 0, String(b));
    realClick(w, sectorBtn(doc, 'Баня'), 'Баня');
    ok('втори клик затваря списъка', listHrefs(doc) === null);
    /* празният бутон няма onclick (realClick би хвърлил) — истински DOM клик */
    ok('празният сектор няма onclick', !sectorBtn(doc, 'Осветление').getAttribute('onclick'));
    sectorBtn(doc, 'Осветление').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('клик на празен сектор не отваря нищо', listHrefs(doc) === null);

    /* бланка без сектор (null или []) — само в общото меню */
    let all = [];
    sectorBtns(doc).filter(x => !x.disabled).forEach(x => {
      realClick(w, x, x.textContent);
      all = all.concat(listHrefs(doc) || []);
      realClick(w, x, x.textContent);
    });
    ok('vrati.pdf (null) не е в нито един сектор', all.indexOf('warranty-templates/vrati.pdf') < 0);
    ok('agromashini.pdf ([]) не е в нито един сектор', all.indexOf('warranty-templates/agromashini.pdf') < 0);
    /* общото меню е махнато (27.11.2026) */
    ok('няма <button> с „Гаранционна карта“', !Array.prototype.some.call(doc.querySelectorAll('button'),
      x => x.textContent.indexOf('Гаранционна карта') >= 0));
    ok('няма #ref-tpl-menu', !doc.getElementById('ref-tpl-menu'));
    ok('vrati.pdf не е никъде на страницата', !doc.querySelector('a[href="warranty-templates/vrati.pdf"]'));
  }

  section('2. Управление на записи — отметки правят PATCH {sectors}');
  {
    const h = env(ADMIN_USER);
    const { w, doc, calls } = h;
    w.loadReference();
    await ticks();
    guard('openRefAdminList() не хвърля', () => w.openRefAdminList());
    const ov = doc.getElementById('ref-admin-ov');
    ok('няма старото падащо меню „Сектор“', ov && ov.querySelectorAll('select[title="Сектор"]').length === 0);
    ok('по 8 отметки на всяка от ' + N_TPL + ' бланки',
      templates().every(t => checks(doc, t.id).length === 8));
    const labels = checks(doc, 't1').map(c => c.parentNode.textContent.trim());
    ok('отметките са в реда на REF_SECTORS', SECTORS.every((s, i) => labels[i] === s), labels.join('|'));
    const hb = checks(doc, 't1');
    ok('hobby: отметнати Машини и Градина, само те',
      hb.map((c, i) => c.checked ? SECTORS[i] : null).filter(Boolean).join('|') === 'Машини|Градина');
    ok('vrati: нищо отметнато', checks(doc, 't12').every(c => !c.checked));
    ok('текстът не говори за менюто „Гаранционна карта“', ov.textContent.indexOf('Гаранционна карта') < 0);
    ok('текстът казва, че бланката излиза под отметнатите сектори',
      ov.textContent.indexOf('под всеки отметнат сектор') >= 0);
    ok('жълто „Без сектор“ под vrati (null)', noSector(doc, 't12'));
    ok('жълто „Без сектор“ под agromashini ([])', noSector(doc, 't11'));
    ok('жълто „Без сектор“ под heatmann (null)', noSector(doc, 't2'));
    ok('hobby (със сектор) — без предупреждение', !noSector(doc, 't1'));
    ok('предупрежденията са точно 3', ov.textContent.split('Без сектор').length - 1 === 3);
    const warnEl = doc.querySelector('[data-tpl-nosector="t12"] div');
    ok('предупреждението е жълто', warnEl && /background:#fef9c3/.test(warnEl.getAttribute('style')));

    /* vrati: отмятане в обратен ред — масивът пак е в реда на REF_SECTORS */
    const vr = checks(doc, 't12');
    clickCheck(w, vr[5]); /* Баня */
    ok('отметка → предупреждението изчезва веднага (преди отговора)', !noSector(doc, 't12'));
    await ticks();
    ok('след записа предупреждението го няма', !noSector(doc, 't12'));
    let p = calls.patch[calls.patch.length - 1];
    ok('PATCH към warranty_templates за vrati', p && p.table === 'warranty_templates' && /id=eq\.t12/.test(p.url), p && p.url);
    ok('тяло {sectors:["Баня"]}', p && JSON.stringify(p.body) === '{"sectors":["Баня"]}', p && JSON.stringify(p.body));
    clickCheck(w, vr[4]); /* Строителство */
    await ticks();
    p = calls.patch[calls.patch.length - 1];
    ok('Строителство + Баня → в реда на REF_SECTORS', p && JSON.stringify(p.body) === '{"sectors":["Строителство","Баня"]}', p && JSON.stringify(p.body));
    ok('тялото няма старото поле sector', p && !('sector' in p.body));
    const st = sectorBtn(doc, 'Строителство');
    ok('Строителство вече не е празен', st && !st.disabled && st.textContent.indexOf('няма бланка') < 0);
    ok('Баня (3)', sectorBtn(doc, 'Баня').textContent.indexOf('(3)') >= 0, sectorBtn(doc, 'Баня').textContent);
    ok('зелен toast', h.toastColors.some(t => t[0].indexOf('Секторът е записан') >= 0));

    clickCheck(w, vr[5]); /* маха Баня */
    await ticks();
    p = calls.patch[calls.patch.length - 1];
    ok('махане на Баня → {sectors:["Строителство"]}', p && JSON.stringify(p.body) === '{"sectors":["Строителство"]}', p && JSON.stringify(p.body));
    ok('една отметка остава → без предупреждение', !noSector(doc, 't12'));
    clickCheck(w, vr[4]); /* маха последната */
    ok('махане на последната → предупреждението се появява веднага', noSector(doc, 't12'));
    await ticks();
    p = calls.patch[calls.patch.length - 1];
    ok('последната отметка → PATCH {sectors:null}, не []', p && JSON.stringify(p.body) === '{"sectors":null}', p && JSON.stringify(p.body));
    ok('Строителство пак е празен', sectorBtn(doc, 'Строителство').disabled);
    ok('след записа предупреждението стои', noSector(doc, 't12'));

    /* hobby: махане на Машини оставя Градина */
    clickCheck(w, checks(doc, 't1')[0]);
    await ticks();
    p = calls.patch[calls.patch.length - 1];
    ok('hobby без Машини → {sectors:["Градина"]}', p && /id=eq\.t1$/.test(p.url) && JSON.stringify(p.body) === '{"sectors":["Градина"]}', p && (p.url + ' ' + JSON.stringify(p.body)));
    ok('Машини (2)', sectorBtn(doc, 'Машини').textContent.indexOf('(2)') >= 0, sectorBtn(doc, 'Машини').textContent);
    /* agromashini: [] от базата се третира като празно */
    clickCheck(w, checks(doc, 't11')[1]);
    await ticks();
    p = calls.patch[calls.patch.length - 1];
    ok('agromashini ([]) + Градина → {sectors:["Градина"]}', p && JSON.stringify(p.body) === '{"sectors":["Градина"]}', p && JSON.stringify(p.body));
    ok('agromashini — предупреждението изчезна', !noSector(doc, 't11'));
  }

  section('3. Грешка при запис — червен toast, отметката се връща');
  {
    const h = env(ADMIN_USER, { fail: { PATCH: { status: 400, body: { message: 'column "sectors" does not exist' } } } });
    const { w, doc, calls } = h;
    w.loadReference();
    await ticks();
    w.openRefAdminList();
    const cb = checks(doc, 't12')[3]; /* Бои */
    clickCheck(w, cb);
    ok('при отметка предупреждението изчезва веднага', !noSector(doc, 't12'));
    await ticks();
    ok('PATCH е опитан', calls.patch.length === 1);
    ok('грешка → отметката се връща и предупреждението пак стои', noSector(doc, 't12'));
    const red = h.toastColors.find(t => t[1] === '#dc2626');
    ok('червен toast', !!red, JSON.stringify(h.toastColors));
    ok('с причината от базата', red && red[0].indexOf('sectors') >= 0);
    ok('няма зелен toast', !h.toastColors.some(t => t[0].indexOf('Секторът е записан') >= 0));
    ok('отметката се връща (неотметната)', cb.checked === false);
    ok('Бои остава празен', sectorBtn(doc, 'Бои').disabled);
    /* обратната посока: махане при грешка → отметката се връща отметната */
    const hm = checks(doc, 't1')[0]; /* hobby, Машини */
    clickCheck(w, hm);
    await ticks();
    ok('махане при грешка → отметката пак е отметната', hm.checked === true);
    ok('Машини остава (3)', sectorBtn(doc, 'Машини').textContent.indexOf('(3)') >= 0);
  }

  section('4. vrati.pdf през сектор „Строителство“ — обект, без избрана марка');
  {
    const tpls = templates().map(t => t.id === 't12' ? Object.assign({}, t, { sectors: ['Строителство'] }) : t);
    const { w, doc } = env(STORE_USER, { data: {
      warranty_subcategories: [], warranty_brands: [], warranty_entries: [],
      warranty_templates: tpls, warranty_service_locations: [] } });
    w.loadReference();
    await ticks();
    ok('няма избрана марка', !w.refSelBrand);
    ok('преди клик vrati.pdf го няма', !doc.querySelector('a[href="warranty-templates/vrati.pdf"]'));
    const st = sectorBtn(doc, 'Строителство');
    ok('Строителство (1), активен', st && !st.disabled && st.textContent.indexOf('(1)') >= 0, st && st.textContent);
    realClick(w, st, 'Строителство');
    const a = doc.querySelector('#ref-sector-list a[href="warranty-templates/vrati.pdf"]');
    ok('Строителство → линк към vrati.pdf', !!a);
    ok('в нов таб, с името „Метални входни врати“', a && a.getAttribute('target') === '_blank' &&
      a.textContent.indexOf('Метални входни врати') >= 0);
  }

  section('5. Размери на реда със секторите (Теодор, 27.11.2026)');
  {
    const { w, doc } = env(STORE_USER);
    w.loadReference();
    await ticks();
    const label = Array.prototype.find.call(doc.querySelectorAll('#ref-sector-wrap span'),
      x => x.textContent.indexOf('Гаранционни карти по сектори:') === 0);
    ok('надписът е 15px', label && /font-size:15px/.test(label.getAttribute('style')), label && label.getAttribute('style'));
    const active = sectorBtns(doc).filter(b => !b.disabled);
    const grey = sectorBtns(doc).filter(b => b.disabled);
    ok('активните бутони — 15px, padding 8px 14px', active.length === 3 && active.every(b =>
      /font-size:15px/.test(b.getAttribute('style')) && /padding:8px 14px/.test(b.getAttribute('style'))),
      active.map(b => b.getAttribute('style')).join(' || '));
    ok('сивите — 15px, padding 8px 14px, пак сиви и неактивни', grey.length === 5 && grey.every(b =>
      /font-size:15px/.test(b.getAttribute('style')) && /padding:8px 14px/.test(b.getAttribute('style')) &&
      /color:#94a3b8/.test(b.getAttribute('style')) && /background:#f1f5f9/.test(b.getAttribute('style')) &&
      b.disabled && !b.getAttribute('onclick')));
    ok('редът се пренася (flex-wrap:wrap)', label && /flex-wrap:wrap/.test(label.parentNode.getAttribute('style')));
    realClick(w, sectorBtn(doc, 'Машини'), 'Машини');
    const links = Array.prototype.slice.call(doc.querySelectorAll('#ref-sector-list a'));
    ok('линковете към бланките — 15px', links.length === 3 && links.every(a => /font-size:15px/.test(a.getAttribute('style'))),
      links.map(a => a.getAttribute('style')).join(' || '));
    const ls = doc.getElementById('ref-sector-list').getAttribute('style');
    ok('списъкът е с max-width, без фиксирана ширина', /max-width:520px/.test(ls) && !/(^|;)width:/.test(ls));
  }

  section('6. Обектът не вижда „Управление на записи“');
  {
    const { w, doc } = env(STORE_USER);
    w.loadReference();
    await ticks();
    ok('няма бутон „Управление на записи“', !Array.prototype.some.call(doc.querySelectorAll('button'),
      x => x.textContent.indexOf('Управление на записи') >= 0));
  }

  report();
})();
