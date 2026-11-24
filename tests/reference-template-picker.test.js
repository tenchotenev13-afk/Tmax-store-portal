/* Рекламации → Гаранционен справочник: бутонът „🖨 Гаранционна карта ▾“
   стои горе до заглавието и се вижда БЕЗ избрана марка (предложение на
   Теодор, 24.11.2026). Бланката за метални входни врати (vrati.pdf) е в
   менюто. Бутонът е един — не се повтаря в картата на марката (id-то на
   менюто е едно).

   Пускане: node tests/reference-template-picker.test.js .
*/
'use strict';

const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

const TEMPLATES = [
  { id: 't1', filename: 'hobby.pdf', label: 'Hobby', sort_order: 1 },
  { id: 't2', filename: 'smesiteli.pdf', label: 'Смесители', sort_order: 6 },
  { id: 't12', filename: 'vrati.pdf', label: 'Метални входни врати', sort_order: 12 }
];
const BRANDS = [{ id: 'b1', name: 'BILKA STEEL SRL / БИЛКА' }];
const SUBCATS = [{ id: 's1', name: 'Некатегоризирано' }];
const ENTRY = { id: 'e1', brand_id: 'b1', subcategory_id: 's1', warranty_period: '24 м.', claim_deadline: '30 календарни дни' };

const STORE_USER = { email: 'tr@temax.bg', display_name: 'Троян', role: 'store', store_name: 'Троян' };
const ADMIN_USER = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function env(user, templates) {
  return boot({
    modules: ['reference.js'],
    user: user,
    data: {
      warranty_subcategories: SUBCATS,
      warranty_brands: BRANDS,
      warranty_entries: [ENTRY],
      warranty_templates: templates,
      warranty_service_locations: []
    }
  });
}

function pickerBtns(root) {
  return Array.prototype.filter.call(root.querySelectorAll('button'),
    b => b.textContent.indexOf('Гаранционна карта') >= 0);
}

(async function run() {

  for (const [who, user] of [['обект', STORE_USER], ['админ', ADMIN_USER]]) {
    section('1. Без избрана марка бутонът е горе и работи — ' + who);
    const { w, doc } = env(user, TEMPLATES);
    guard('loadReference() не хвърля', () => w.loadReference());
    await ticks();
    const mod = doc.getElementById('mod-reference');
    const card = doc.getElementById('ref-card');
    ok('няма избрана марка', !w.refSelBrand);
    ok('картата показва „Изберете марка“', card && card.textContent.indexOf('Изберете марка') >= 0);
    const btns = pickerBtns(mod);
    ok('точно един бутон „Гаранционна карта“', btns.length === 1, 'намерени: ' + btns.length);
    ok('бутонът е извън картата на марката', btns[0] && !card.contains(btns[0]));
    const menu = doc.getElementById('ref-tpl-menu');
    ok('менюто е скрито преди клик', menu && menu.style.display === 'none');
    if (btns[0]) {
      realClick(w, btns[0], 'Гаранционна карта');
      ok('кликът отваря менюто', menu.style.display === 'block');
      const a = menu.querySelector('a[href="warranty-templates/vrati.pdf"]');
      ok('в менюто има vrati.pdf', !!a);
      ok('с името от базата „Метални входни врати“', a && a.textContent === 'Метални входни врати');
      ok('отваря се в нов таб', a && a.getAttribute('target') === '_blank');
      ok('всички 3 бланки от базата са в менюто', menu.querySelectorAll('a').length === 3);
      /* клик извън менюто го затваря (document listener в reference.js) */
      const title = Array.prototype.find.call(mod.querySelectorAll('div'),
        d => d.textContent === '📘 Гаранционен справочник');
      title.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      ok('клик извън менюто го затваря', menu.style.display === 'none');
    }
  }

  section('2. С избрана марка — бутонът е пак един, горе, а не в картата');
  {
    const { w, doc } = env(STORE_USER, TEMPLATES);
    w.loadReference();
    await ticks();
    w.refSelectBrandSuggestion('b1');
    await ticks(); await ticks();
    const card = doc.getElementById('ref-card');
    ok('картата на марката е заредена', card.textContent.indexOf('BILKA STEEL') >= 0 &&
      card.textContent.indexOf('30 календарни дни') >= 0);
    const btns = pickerBtns(doc.getElementById('mod-reference'));
    ok('точно един бутон в модула', btns.length === 1, 'намерени: ' + btns.length);
    ok('картата не съдържа бутона', pickerBtns(card).length === 0);
    ok('точно едно меню #ref-tpl-menu', doc.querySelectorAll('#ref-tpl-menu').length === 1);
  }

  section('3. Празна таблица → резервният списък съдържа и вратите');
  {
    const { w, doc } = env(STORE_USER, []);
    w.loadReference();
    await ticks();
    const menu = doc.getElementById('ref-tpl-menu');
    ok('менюто съществува', !!menu);
    ok('резервният списък е 12 бланки', menu && menu.querySelectorAll('a').length === 12);
    ok('vrati.pdf е в резервния списък', menu && !!menu.querySelector('a[href="warranty-templates/vrati.pdf"]'));
  }

  section('4. Всяка бланка от резервния списък съществува като файл');
  {
    const { w, doc } = env(STORE_USER, []);
    w.loadReference();
    await ticks();
    const dir = path.resolve(process.argv[2] || '.', 'warranty-templates');
    const links = Array.prototype.map.call(doc.querySelectorAll('#ref-tpl-menu a'),
      a => decodeURIComponent(a.getAttribute('href').replace('warranty-templates/', '')));
    links.forEach(f => {
      const p = path.join(dir, f);
      const exists = fs.existsSync(p);
      ok('файлът ' + f + ' съществува', exists);
      if (exists && f === 'vrati.pdf') {
        const head = fs.readFileSync(p).slice(0, 5).toString('latin1');
        ok('vrati.pdf е PDF (%PDF-)', head === '%PDF-');
      }
    });
  }

  report();
})();
