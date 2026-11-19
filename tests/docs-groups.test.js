/* Инструкции → папки в ДВЕ нива (docs.js; 18.11.2026 едно ниво, 19.11.2026 две).
   „Таб — Подтаб — име" → папка 📂 Таб, в нея подпапка 📁 Подтаб, в нея карта
   „име"; „Таб — име" → картата е направо в папката; трето и следващо тире
   остава в името; без тире — карта извън папките, в реда от базата, както
   преди. Папките са по реда на горната лента на портала (docsPortalTabs() —
   от DOM-а), непознатите след тях по азбучен ред; подпапките — по реда на
   подтабовете, непознатите след тях. Картите — по азбучен ред, „пълна справка"
   последна в своето начало. Групирането е СЛЕД филтъра за „Само за офиса":
   обект (manager) не вижда нито папка, нито брой от офисните документи.
   Отваряне/затваряне — с истински клик, по ниво, в паметта (docsOpenGroups).

   Мутанти (19.11.2026, пуснати поотделно; exit кодът на този тест е ≠ 0 при всеки):
   М1. едно ниво — docsSplitTitle не реже второ тире (sub винаги null)
   М2. папките по азбучен ред (mods.sort с localeCompare)
   М3. офисен документ влиза в броя за не-admin (махнат филтърът за офиса)
   М4. картите по чист азбучен ред (без правилото за „пълна справка")
   М5. затворена папка рисува подпапките си (`if(!open)` → `if(false)`)
   М6. подпапките по азбучен ред, не по подтабовете
   М7. модулът в onclick низ вместо data-mod
   Оцелели мутанти: няма.

   Пускане:  node tests/docs-groups.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report } = H;

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const OFFICE = 'Само за офиса';
const QUOTE_MOD = 'Каса „Нова"';
const TL = 'Транспорт — Товарни листи — ';
/* Старите 10 реда от documents (19.11.2026) — без разделител, в реда от базата */
const OLD = ['РЕКЛАМАЦИИ ИНТЕКС', 'РАЗЛИКИ ПО ПРИЕМ ОТ ДОСТАВЧИЦИ', 'РАЗЛИКИ ПО ПРИЕМ ПРИ ТРАНСФЕРИ', 'ИЗПИСВАНЕ',
  'КЛИЕНТСКИ ПОРЪЧКИ', 'МАТЕРИАЛНИ ДВИЖЕНИЯ', 'ПРИЕМ', 'СТОКА ЗА ВРЪЩАНЕ', 'ИНВЕНТАРИЗАЦИИ', 'Обучение по ПБ']
  .map((t, i) => ({ id: 'old' + i, title: t, category: i === 0 ? 'Друго' : (i === 9 ? 'Процедури' : 'SAP'), url: 'https://x/old' + i + '.docx', description: '' }));
const NEW = [
  { id: 'o1', title: TL + 'складове', category: OFFICE },
  { id: 'o2', title: TL + 'обекти', category: OFFICE },
  { id: 'o3', title: TL + 'пълна справка', category: OFFICE },
  { id: 'o4', title: TL + 'Клиентски заявки: складове', category: OFFICE },
  { id: 'o5', title: TL + 'Клиентски заявки: обекти', category: OFFICE },
  { id: 'o6', title: TL + 'Клиентски заявки: пълна справка', category: OFFICE },
  { id: 'o7', title: 'Транспорт — Трансфери — обекти', category: OFFICE },
  { id: 'o8', title: 'Транспорт — Трансфери — пълна справка', category: OFFICE },
  { id: 'o9', title: 'Стока на път — пълна справка', category: OFFICE },
  { id: 'o10', title: 'Стока на път — складове', category: OFFICE },
  { id: 'o11', title: 'Стока на път — магазини', category: OFFICE },
  { id: 'g1', title: 'Транспорт — за обектите', category: 'SAP', description: 'Кратко' },
  { id: 'g2', title: 'Транспорт – Трансфери – кратко – вариант 2', category: 'SAP' },
  { id: 'g3', title: 'Транспорт — Палети — етикети', category: 'SAP' },
  { id: 'g4', title: 'Транспорт — Архив — стари', category: 'Друго' },
  { id: 'g5', title: 'Каса - за обектите', category: 'SAP' },
  { id: 'g6', title: QUOTE_MOD + ' — тест', category: 'Друго' },
  { id: 'g7', title: 'Абв — нещо', category: 'Друго' }
].map(d => Object.assign({ url: 'https://x/' + d.id + '.pdf', description: '' }, d));
/* Новите първо (created_at desc), после старите — както ги връща базата */
const DOCS = NEW.concat(OLD);
const USERS = {
  manager: { email: 'troyan@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: 'Троян' },
  admin:   { email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' }
};
const OLD_CARD_STYLE = 'border:1px solid #e2e8f0;border-radius:10px;padding:14px;cursor:pointer;display:flex;flex-direction:column;gap:6px;position:relative;';

function env(role, docs) {
  const h = boot({ modules: ['docs.js'], user: USERS[role], data: { documents: docs || DOCS } });
  h.w.docs = JSON.parse(JSON.stringify(docs || DOCS));
  h.w.docFilter = 'all';
  h.opened = [];
  h.w.open = u => { h.opened.push(u); return null; };
  h.errs = [];
  const oe = h.w.console.error;
  h.w.console.error = function () { h.errs.push(Array.from(arguments).join(' ')); return oe && oe.apply(this, arguments); };
  h.w.addEventListener('error', e => h.errs.push(String(e.message || e.error)));
  return h;
}
const heads = doc => Array.from(doc.querySelectorAll('#doc-grid .doc-group-hd'));
const head = (doc, mod) => heads(doc).find(x => x.getAttribute('data-mod') === mod) || null;
const subs = (doc, mod) => Array.from(doc.querySelectorAll('#doc-grid .doc-sub-hd')).filter(x => x.getAttribute('data-mod') === mod);
const sub = (doc, mod, s) => subs(doc, mod).find(x => x.getAttribute('data-sub') === s) || null;
const cards = doc => Array.from(doc.querySelectorAll('#doc-grid [data-url]'));
const groupCards = (doc, mod) => cards(doc).filter(c => c.getAttribute('data-doc-group') === mod);
const directCards = (doc, mod) => groupCards(doc, mod).filter(c => !c.hasAttribute('data-doc-sub'));
const subCards = (doc, mod, s) => groupCards(doc, mod).filter(c => c.getAttribute('data-doc-sub') === s);
const looseCards = doc => cards(doc).filter(c => !c.hasAttribute('data-doc-group'));
const label = el => el.textContent.replace(/^[▸▾]\s*/, '').trim();
const cardName = c => { const e = c.querySelector('div[style*="font-weight:500"]'); return e ? e.textContent : ''; };

(async function run() {

  section('1. admin: папките по реда на лентата, затворени, после старите 10 както преди');
  {
    const { w, doc } = env('admin');
    if (guard('renderDocs() не хвърля', () => w.renderDocs())) {
      const got = heads(doc).map(label);
      const exp = ['📂 Транспорт (12)', '📂 Стока на път (3)', '📂 Каса (1)', '📂 Абв (1)', '📂 ' + QUOTE_MOD + ' (1)'];
      ok('папки и бройки: Транспорт преди Стока на път (лентата, не азбуката), непознатите след табовете по азбучен ред',
        JSON.stringify(got) === JSON.stringify(exp), JSON.stringify(got));
      ok('всички затворени (▸)', heads(doc).every(x => x.textContent.trim().indexOf('▸') === 0));
      ok('затворена папка: 0 подпапки и 0 карти в DOM-а', doc.querySelectorAll('#doc-grid .doc-sub-hd').length === 0 &&
        cards(doc).filter(c => c.hasAttribute('data-doc-group')).length === 0);
      ok('папката заема целия ред', heads(doc).every(x => /grid-column:\s*1\s*\/\s*-1/.test(x.getAttribute('style') || '')));
      const lc = looseCards(doc);
      ok('10 карти без папка', lc.length === 10, 'получени ' + lc.length);
      ok('старите — в реда от базата, с цялото заглавие', JSON.stringify(lc.map(cardName)) === JSON.stringify(OLD.map(d => d.title)), JSON.stringify(lc.map(cardName)));
      ok('старите — след всички папки', lc.length > 0 && (heads(doc).pop().compareDocumentPosition(lc[0]) & 4) !== 0);
      ok('старите — същият вид карта (style, onclick, без data-doc-*)', lc.every(c =>
        c.getAttribute('style') === OLD_CARD_STYLE && c.getAttribute('onclick') === 'docsOpen(this)' &&
        !c.hasAttribute('data-doc-group') && !c.hasAttribute('data-doc-sub')));
      ok('категорията под името (SAP / Друго / Процедури)', lc[0].textContent.indexOf('Друго') >= 0 && lc[9].textContent.indexOf('Процедури') >= 0);
    }
  }

  section('2. Клик „📂 Транспорт" → подпапки по реда на подтабовете + карта направо в папката');
  {
    const { w, doc } = env('admin');
    guard('рендер', () => w.renderDocs());
    if (ok('папка „Транспорт"', !!head(doc, 'Транспорт'))) {
      guard('клик', () => realClick(w, head(doc, 'Транспорт'), '📂 Транспорт'));
      ok('стрелката е ▾', head(doc, 'Транспорт').textContent.trim().indexOf('▾') === 0);
      const sl = subs(doc, 'Транспорт').map(label);
      ok('подпапки: Товарни листи, Трансфери, Палети (подтабовете), после Архив (непознат)',
        JSON.stringify(sl) === JSON.stringify(['📁 Товарни листи (6)', '📁 Трансфери (3)', '📁 Палети (1)', '📁 Архив (1)']), JSON.stringify(sl));
      ok('подпапките са затворени — 0 карти в тях', groupCards(doc, 'Транспорт').filter(c => c.hasAttribute('data-doc-sub')).length === 0);
      const dc = directCards(doc, 'Транспорт');
      ok('1 карта направо в папката: „за обектите"', dc.length === 1 && cardName(dc[0]) === 'за обектите' && dc[0].textContent.indexOf('Кратко') >= 0);
      const s0 = sub(doc, 'Транспорт', 'Товарни листи');
      ok('подпапката е вложена (в .doc-sub с отстъп) и с 📁, папката — с 📂',
        !!s0 && /margin-left:\s*16px/.test(s0.parentNode.getAttribute('style') || '') && s0.parentNode.classList.contains('doc-sub') &&
        s0.textContent.indexOf('📁') >= 0 && head(doc, 'Транспорт').textContent.indexOf('📂') >= 0);
      ok('другите папки остават затворени', subs(doc, 'Стока на път').length === 0 && directCards(doc, 'Стока на път').length === 0);
      guard('втори клик', () => realClick(w, head(doc, 'Транспорт'), '📂 Транспорт'));
      ok('след втори клик — 0 подпапки и 0 карти', subs(doc, 'Транспорт').length === 0 && groupCards(doc, 'Транспорт').length === 0);
    }
  }

  section('3. Клик „📁 Товарни листи" → 6 карти, „пълна справка" последна; втори клик ги скрива; клик на карта → docsOpen');
  {
    const h = env('admin');
    const { w, doc } = h;
    guard('рендер', () => w.renderDocs());
    guard('клик папка', () => realClick(w, head(doc, 'Транспорт'), '📂 Транспорт'));
    const s0 = sub(doc, 'Транспорт', 'Товарни листи');
    if (ok('подпапка „Товарни листи"', !!s0)) {
      guard('клик подпапка', () => realClick(w, s0, '📁 Товарни листи'));
      const names = subCards(doc, 'Транспорт', 'Товарни листи').map(cardName);
      /* Без начало („X: ") е първо — празното начало е преди „Клиентски заявки: " */
      ok('картите: обекти, складове, пълна справка, после КЗ обекти, КЗ складове, КЗ пълна справка',
        JSON.stringify(names) === JSON.stringify(['обекти', 'складове', 'пълна справка', 'Клиентски заявки: обекти', 'Клиентски заявки: складове', 'Клиентски заявки: пълна справка']),
        JSON.stringify(names));
      ok('стрелката на подпапката е ▾', sub(doc, 'Транспорт', 'Товарни листи').textContent.trim().indexOf('▾') === 0);
      ok('„Трансфери" остава затворена (отделно състояние)', subCards(doc, 'Транспорт', 'Трансфери').length === 0);
      ok('картите са вътре в подпапката', subCards(doc, 'Транспорт', 'Товарни листи').every(c => c.closest('.doc-sub') === sub(doc, 'Транспорт', 'Товарни листи').parentNode));
      const c0 = subCards(doc, 'Транспорт', 'Товарни листи')[0];
      guard('клик на карта', () => realClick(w, c0, 'обекти'));
      ok('docsOpen отваря същия url', h.opened.length === 1 && h.opened[0] === 'https://x/o2.pdf', JSON.stringify(h.opened));
      /* затваряне и отваряне на папката пази отворената подпапка */
      guard('затвори папката', () => realClick(w, head(doc, 'Транспорт'), '📂 Транспорт'));
      ok('затворена папка — 0 карти от подпапката в DOM-а', subCards(doc, 'Транспорт', 'Товарни листи').length === 0);
      guard('отвори папката', () => realClick(w, head(doc, 'Транспорт'), '📂 Транспорт'));
      ok('подпапката се помни отворена', subCards(doc, 'Транспорт', 'Товарни листи').length === 6);
      guard('втори клик подпапка', () => realClick(w, sub(doc, 'Транспорт', 'Товарни листи'), '📁 Товарни листи'));
      ok('след втори клик — 0 карти в подпапката', subCards(doc, 'Транспорт', 'Товарни листи').length === 0);
      ok('без грешки в конзолата', h.errs.length === 0, h.errs.join(' | '));
    }
  }

  section('4. Три тирета: третото остава в името; подпапка „Трансфери" (3)');
  {
    const { w, doc } = env('admin');
    guard('рендер', () => w.renderDocs());
    guard('клик папка', () => realClick(w, head(doc, 'Транспорт'), '📂 Транспорт'));
    guard('клик подпапка', () => realClick(w, sub(doc, 'Транспорт', 'Трансфери'), '📁 Трансфери'));
    const names = subCards(doc, 'Транспорт', 'Трансфери').map(cardName);
    ok('картите: „кратко – вариант 2", „обекти", „пълна справка"',
      JSON.stringify(names) === JSON.stringify(['кратко – вариант 2', 'обекти', 'пълна справка']), JSON.stringify(names));
  }

  section('5. „Стока на път" (без подтабове): 3 карти направо в папката, „пълна справка" последна');
  {
    const { w, doc } = env('admin');
    guard('рендер', () => w.renderDocs());
    guard('клик', () => realClick(w, head(doc, 'Стока на път'), '📂 Стока на път'));
    ok('0 подпапки', subs(doc, 'Стока на път').length === 0);
    const names = directCards(doc, 'Стока на път').map(cardName);
    ok('магазини, складове, пълна справка', JSON.stringify(names) === JSON.stringify(['магазини', 'складове', 'пълна справка']), JSON.stringify(names));
  }

  section('6. manager: нищо от „Само за офиса" — нито папка, нито подпапка, нито брой');
  {
    const { w, doc } = env('manager');
    guard('рендер', () => w.renderDocs());
    const got = heads(doc).map(label);
    ok('папки: Транспорт (4), Каса, Абв, Каса „Нова" — без „Стока на път"',
      JSON.stringify(got) === JSON.stringify(['📂 Транспорт (4)', '📂 Каса (1)', '📂 Абв (1)', '📂 ' + QUOTE_MOD + ' (1)']), JSON.stringify(got));
    guard('клик', () => realClick(w, head(doc, 'Транспорт'), '📂 Транспорт'));
    const sl = subs(doc, 'Транспорт').map(label);
    ok('подпапки: Трансфери (1), Палети (1), Архив (1) — без „Товарни листи"',
      JSON.stringify(sl) === JSON.stringify(['📁 Трансфери (1)', '📁 Палети (1)', '📁 Архив (1)']), JSON.stringify(sl));
    guard('клик Трансфери', () => realClick(w, sub(doc, 'Транспорт', 'Трансфери'), '📁 Трансфери'));
    ok('в Трансфери само несофисната карта', JSON.stringify(subCards(doc, 'Транспорт', 'Трансфери').map(cardName)) === JSON.stringify(['кратко – вариант 2']));
    ok('„пълна справка" и „Клиентски заявки" не се виждат никъде',
      doc.getElementById('doc-grid').textContent.indexOf('пълна справка') < 0 && doc.getElementById('doc-grid').textContent.indexOf('Клиентски заявки') < 0);
    ok('старите 10 — както при admin', looseCards(doc).length === 10);
  }

  section('7. Кавичка в името на папката — data-mod, не onclick низ');
  {
    const h = env('admin');
    const { w, doc } = h;
    guard('рендер', () => w.renderDocs());
    const hd = head(doc, QUOTE_MOD);
    if (ok('папка „' + QUOTE_MOD + '"', !!hd)) {
      ok('onclick-ът не съдържа името', (hd.getAttribute('onclick') || '').indexOf('Нова') < 0);
      guard('клик', () => realClick(w, hd, QUOTE_MOD));
      ok('отваря се с 1 карта „тест", без грешки', directCards(doc, QUOTE_MOD).length === 1 && h.errs.length === 0, h.errs.join(' | '));
    }
  }

  section('8. Разделителят — 0, 1, 2 и 3 тирета');
  {
    const { w } = env('admin');
    const s = t => JSON.stringify(w.docsSplitTitle(t));
    const J = o => JSON.stringify(o);
    ok('0 тирета → null', w.docsSplitTitle('Обучение по ПБ') === null);
    ok('1 тире „ — "', s('А — б') === J({ mod: 'А', sub: null, part: 'б' }), s('А — б'));
    ok('1 тире „ – "', s('А – б') === J({ mod: 'А', sub: null, part: 'б' }));
    ok('1 тире „ - "', s('А - б') === J({ mod: 'А', sub: null, part: 'б' }));
    ok('2 тирета → подпапка', s('А — Б — в') === J({ mod: 'А', sub: 'Б', part: 'в' }), s('А — Б — в'));
    ok('2 тирета, смесени', s('А - Б – в') === J({ mod: 'А', sub: 'Б', part: 'в' }));
    ok('3 тирета → третото в името', s('А — Б — в — г') === J({ mod: 'А', sub: 'Б', part: 'в — г' }), s('А — Б — в — г'));
    ok('тире без интервали не е разделител', w.docsSplitTitle('SAP-ръководство') === null && s('А — Б-в') === J({ mod: 'А', sub: null, part: 'Б-в' }));
    ok('празно заглавие → null', w.docsSplitTitle('') === null && w.docsSplitTitle(null) === null);
  }

  section('9. Редът на табовете идва от лентата; скриптът чете index.html по същия начин');
  {
    const { w } = env('admin');
    const dom = w.docsPortalTabs();
    const P = require(path.join(ROOT, 'tools', 'publish-instrukcii.js'));
    const file = P.portalTabs(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
    ok('DOM-ът и index.html дават същото', JSON.stringify(dom) === JSON.stringify(file), JSON.stringify(dom).slice(0, 300));
    const names = dom.map(t => t.name);
    ok('първите табове: Транспорт, Клиентски, Бюлетин, Стока на път', JSON.stringify(names.slice(0, 4)) === JSON.stringify(['Транспорт', 'Клиентски', 'Бюлетин', 'Стока на път']), JSON.stringify(names));
    ok('бутоните на лентата — същият брой', names.length === w.document.querySelectorAll('#nav-tabs-container button.nav-tab').length);
    const tr = dom[0];
    ok('подтабовете на Транспорт започват със Заявки, Календар, Товарни листи, Трансфери',
      JSON.stringify(tr.subs.slice(0, 4)) === JSON.stringify(['Заявки', 'Календар', 'Товарни листи', 'Трансфери']), JSON.stringify(tr.subs));
  }

  report();
})();
