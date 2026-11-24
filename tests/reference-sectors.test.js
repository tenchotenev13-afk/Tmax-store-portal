/* Рекламации → Гаранционен справочник: ред „Гаранционни карти по сектори:“
   (24.11.2026, решение на Тенчо). 8 сектора в фиксиран ред; клик показва
   бланките на сектора (warranty_templates.sector), втори клик затваря.
   Сектор без бланка е СИВ <button> с „няма бланка“ — не се скрива. Бланка без
   сектор е само в общото меню „🖨 Гаранционна карта ▾“, което остава с всички.
   „⚙️ Управление на записи“: падащо меню „Сектор“ → PATCH {sector}; грешка →
   червен toast и изборът се връща.

   Мутационна проверка (24.11.2026, всяка върната след пуска):
   М1 refSectorTemplates сравнява без сектор (filter → всички бланки)
      → пада „Машини показва точно своите 3“ и „празните сектори са точно 6“.
   М2 refToggleSector без затваряне (refOpenSector = idx винаги)
      → пада „втори клик затваря списъка“.
   М3 сектор без бланка се пропуска (return вместо сив бутон)
      → пада „8 бутона в реда“ и „Градина е <button> с „няма бланка““.
   Резултат: и четирите — exit 1.
   М4 refTemplateSetSector праща sel.value без || null
      → пада „празно → PATCH {sector:null}“.
   Чистият код: exit 0.

   Пускане: node tests/reference-sectors.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, ok, guard, section, report, ticks } = H;

const SECTORS = ['Машини','Градина','Осветление','Бои','Строителство','Баня',
  'Дом. потреби и текстил','Интериор и декорация'];

function templates() {
  return [
    { id: 't1', filename: 'hobby.pdf', label: 'Hobby', sort_order: 1, sector: 'Машини' },
    { id: 't2', filename: 'heatmann.pdf', label: 'Heatmann', sort_order: 2, sector: null },
    { id: 't3', filename: 'tayfun.pdf', label: 'Тайфун', sort_order: 3, sector: 'Машини' },
    { id: 't4', filename: 'mehanik.pdf', label: 'Механик', sort_order: 4, sector: 'Машини' },
    { id: 't6', filename: 'smesiteli.pdf', label: 'Смесители', sort_order: 6, sector: 'Баня' },
    { id: 't9', filename: 'monoblok.pdf', label: 'Моноблокове', sort_order: 9, sector: 'Баня' },
    { id: 't12', filename: 'vrati.pdf', label: 'Метални входни врати', sort_order: 12, sector: null }
  ];
}

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

    const gr = sectorBtn(doc, 'Градина');
    ok('Градина е <button> с „няма бланка“', !!gr && gr.tagName === 'BUTTON' && gr.textContent.indexOf('няма бланка') >= 0);
    ok('Градина е сив и неактивен', gr && gr.disabled && /#94a3b8/.test(gr.getAttribute('style')));
    ok('Машини няма „няма бланка“', sectorBtn(doc, 'Машини').textContent.indexOf('няма бланка') < 0);
    ok('празните сектори са точно 6', btns.filter(b => b.textContent.indexOf('няма бланка') >= 0).length === 6);

    ok('преди клик няма списък', listHrefs(doc) === null);
    realClick(w, sectorBtn(doc, 'Машини'), 'Машини');
    const m = listHrefs(doc);
    ok('Машини показва точно своите 3', m && m.length === 3 &&
      ['hobby.pdf', 'tayfun.pdf', 'mehanik.pdf'].every(f => m.indexOf('warranty-templates/' + f) >= 0), String(m));
    ok('линковете се отварят в нов таб', Array.prototype.every.call(
      doc.querySelectorAll('#ref-sector-list a'), a => a.getAttribute('target') === '_blank'));
    realClick(w, sectorBtn(doc, 'Баня'), 'Баня');
    const b = listHrefs(doc);
    ok('клик на Баня сменя на смесители + моноблокове', b && b.length === 2 &&
      b.indexOf('warranty-templates/smesiteli.pdf') >= 0 && b.indexOf('warranty-templates/monoblok.pdf') >= 0, String(b));
    realClick(w, sectorBtn(doc, 'Баня'), 'Баня');
    ok('втори клик затваря списъка', listHrefs(doc) === null);
    /* празният бутон няма onclick (realClick би хвърлил) — истински DOM клик */
    ok('празният сектор няма onclick', !sectorBtn(doc, 'Градина').getAttribute('onclick'));
    sectorBtn(doc, 'Градина').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('клик на празен сектор не отваря нищо', listHrefs(doc) === null);

    /* бланка без сектор — само в общото меню */
    let all = [];
    sectorBtns(doc).filter(x => !x.disabled).forEach(x => {
      realClick(w, x, x.textContent);
      all = all.concat(listHrefs(doc) || []);
      realClick(w, x, x.textContent);
    });
    ok('vrati.pdf не е в нито един сектор', all.indexOf('warranty-templates/vrati.pdf') < 0);
    ok('heatmann.pdf не е в нито един сектор', all.indexOf('warranty-templates/heatmann.pdf') < 0);
    const menu = doc.getElementById('ref-tpl-menu');
    const pick = Array.prototype.find.call(doc.querySelectorAll('#mod-reference button'),
      x => x.textContent.indexOf('Гаранционна карта') >= 0);
    realClick(w, pick, 'Гаранционна карта');
    ok('„Гаранционна карта“ отваря менюто', menu.style.display === 'block');
    ok('общото меню е с всички 7 бланки', menu.querySelectorAll('a').length === 7);
    ok('общото меню има vrati.pdf', !!menu.querySelector('a[href="warranty-templates/vrati.pdf"]'));
  }

  section('2. Управление на записи — избор на сектор прави PATCH');
  {
    const h = env(ADMIN_USER);
    const { w, doc, calls } = h;
    w.loadReference();
    await ticks();
    guard('openRefAdminList() не хвърля', () => w.openRefAdminList());
    const ov = doc.getElementById('ref-admin-ov');
    const sels = ov ? ov.querySelectorAll('select[title="Сектор"]') : [];
    ok('по едно меню „Сектор“ на бланка', sels.length === 7, 'намерени: ' + sels.length);
    const opts = sels[0] ? Array.prototype.map.call(sels[0].options, o => o.value) : [];
    ok('празно + 8-те сектора', opts.length === 9 && opts[0] === '' && SECTORS.every((s, i) => opts[i + 1] === s), opts.join('|'));
    ok('hobby е с избран „Машини“', sels[0] && sels[0].value === 'Машини');
    const vr = sels[6];
    ok('vrati е „без сектор“', vr && vr.value === '');
    vr.value = 'Строителство';
    fire(w, vr, 'change');
    await ticks();
    const p = calls.patch[calls.patch.length - 1];
    ok('PATCH към warranty_templates за vrati', p && p.table === 'warranty_templates' && /id=eq\.t12/.test(p.url), p && p.url);
    ok('тяло {sector:"Строителство"}', p && JSON.stringify(p.body) === '{"sector":"Строителство"}', p && JSON.stringify(p.body));
    const st = sectorBtn(doc, 'Строителство');
    ok('Строителство вече не е празен', st && !st.disabled && st.textContent.indexOf('няма бланка') < 0);
    ok('зелен toast', h.toastColors.some(t => t[0].indexOf('Секторът е записан') >= 0));
    vr.value = '';
    fire(w, vr, 'change');
    await ticks();
    const p2 = calls.patch[calls.patch.length - 1];
    ok('празно → PATCH {sector:null}', p2 && JSON.stringify(p2.body) === '{"sector":null}', p2 && JSON.stringify(p2.body));
    ok('Строителство пак е празен', sectorBtn(doc, 'Строителство').disabled);
  }

  section('3. Грешка при запис — червен toast, изборът се връща');
  {
    const h = env(ADMIN_USER, { fail: { PATCH: { status: 400, body: { message: 'column "sector" does not exist' } } } });
    const { w, doc, calls } = h;
    w.loadReference();
    await ticks();
    w.openRefAdminList();
    const sel = doc.querySelectorAll('#ref-admin-ov select[title="Сектор"]')[6];
    sel.value = 'Бои';
    fire(w, sel, 'change');
    await ticks();
    ok('PATCH е опитан', calls.patch.length === 1);
    const red = h.toastColors.find(t => t[1] === '#dc2626');
    ok('червен toast', !!red, JSON.stringify(h.toastColors));
    ok('с причината от базата', red && red[0].indexOf('sector') >= 0);
    ok('няма зелен toast', !h.toastColors.some(t => t[0].indexOf('Секторът е записан') >= 0));
    ok('изборът се връща на „без сектор“', sel.value === '');
    ok('Бои остава празен', sectorBtn(doc, 'Бои').disabled);
  }

  section('4. Обектът не вижда „Управление на записи“');
  {
    const { w, doc } = env(STORE_USER);
    w.loadReference();
    await ticks();
    ok('няма бутон „Управление на записи“', !Array.prototype.some.call(doc.querySelectorAll('button'),
      x => x.textContent.indexOf('Управление на записи') >= 0));
  }

  report();
})();
