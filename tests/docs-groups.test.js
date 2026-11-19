/* Инструкции → групиране по модул (docs.js, 18.11.2026).
   „Модул — част" (също „ – " и „ - ") → заглавен ред „📂 Модул (N)" през целия
   ред на грида, затворен по подразбиране, отваря/затваря се с клик. Модулът
   минава през data-mod + getAttribute, не през onclick низ. Групите са по
   азбучен ред (bg), вътре — по частта; после документите без разделител, в
   реда от базата. Групирането е СЛЕД филтъра: офисният документ не се брои
   за manager.

   Мутанти (18.11.2026, всеки събаря теста):
   М1. групата отворена по подразбиране (`open=!docsOpenGroups[…]`)   → секции 1, 2 падат.
   М2. групиране преди филтъра за офиса (брои офисния за manager)     → секция 4 пада.
   М3. модулът в onclick низ (`docsToggleGroup('…')`) вместо data-mod  → секция 3 пада
       (кавичката в „Каса „Нова"" чупи onclick-а).
   М4. картата в групата показва цялото заглавие, не частта            → секция 2 пада.
   М5. групите без сортиране (в реда на базата)                        → секция 1 пада.

   Пускане:  node tests/docs-groups.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report } = H;

const OFFICE = 'Само за офиса';
const QUOTE_MOD = 'Каса „Нова"';
/* В реда, в който ги връща базата (created_at desc) */
const DOCS = [
  { id: 'g1', title: 'Транспорт — за обектите', category: 'SAP', url: 'https://x/g1.pdf', description: 'Кратко', created_at: '2026-11-18T10:00:00Z' },
  { id: 'n1', title: 'СТОКА ЗА ВРЪЩАНЕ', category: 'SAP', url: 'https://x/n1.pdf', description: '', created_at: '2026-11-18T09:00:00Z' },
  { id: 'g2', title: 'Транспорт — пълна инструкция', category: OFFICE, url: 'https://x/g2.pdf', description: '', created_at: '2026-11-18T08:00:00Z' },
  { id: 'g3', title: 'Каса - за обектите', category: 'SAP', url: 'https://x/g3.pdf', description: '', created_at: '2026-11-18T07:00:00Z' },
  { id: 'n2', title: 'Обучение по ПБ', category: 'Процедури', url: 'https://x/n2.pdf', description: '', created_at: '2026-11-18T06:00:00Z' },
  { id: 'g4', title: 'Клиентски заявки – складове', category: 'SAP', url: 'https://x/g4.pdf', description: '', created_at: '2026-11-18T05:00:00Z' },
  { id: 'g5', title: QUOTE_MOD + ' — тест', category: 'Друго', url: 'https://x/g5.pdf', description: '', created_at: '2026-11-18T04:00:00Z' }
];
const USERS = {
  manager: { email: 'troyan@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: 'Троян' },
  admin:   { email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' }
};

function env(role) {
  const h = boot({ modules: ['docs.js'], user: USERS[role], data: { documents: DOCS } });
  h.w.docs = JSON.parse(JSON.stringify(DOCS));
  h.w.docFilter = 'all';
  /* Грешки от inline onclick-а излизат през window.onerror / console.error */
  h.errs = [];
  const oe = h.w.console.error;
  h.w.console.error = function () { h.errs.push(Array.from(arguments).join(' ')); return oe && oe.apply(this, arguments); };
  h.w.addEventListener('error', e => h.errs.push(String(e.message || e.error)));
  return h;
}
const heads = doc => Array.from(doc.querySelectorAll('#doc-grid .doc-group-hd'));
const head = (doc, mod) => heads(doc).find(x => x.getAttribute('data-mod') === mod) || null;
const cards = doc => Array.from(doc.querySelectorAll('#doc-grid [data-url]'));
const groupCards = (doc, mod) => cards(doc).filter(c => c.getAttribute('data-doc-group') === mod);
const looseCards = doc => cards(doc).filter(c => !c.hasAttribute('data-doc-group'));

(async function run() {

  section('1. admin, „Всички": 4 групи в азбучен ред, затворени, после 2 карти без група');
  {
    const { w, doc } = env('admin');
    if (guard('renderDocs() не хвърля', () => w.renderDocs())) {
      const hs = heads(doc);
      ok('4 заглавни реда', hs.length === 4, 'получени ' + hs.length);
      const exp = ['📂 Каса (1)', '📂 ' + QUOTE_MOD + ' (1)', '📂 Клиентски заявки (1)', '📂 Транспорт (2)'];
      const got = hs.map(x => x.textContent.replace(/^[▸▾]\s*/, '').trim());
      ok('групите и бройките са в азбучен ред', JSON.stringify(got) === JSON.stringify(exp), JSON.stringify(got));
      ok('всички са затворени (▸)', hs.every(x => x.textContent.trim().indexOf('▸') === 0));
      ok('заглавният ред заема целия ред (grid-column:1/-1)', hs.every(x => /grid-column:\s*1\s*\/\s*-1/.test(x.getAttribute('style') || '')));
      ok('0 карти в групите', cards(doc).filter(c => c.hasAttribute('data-doc-group')).length === 0);
      const lc = looseCards(doc);
      ok('2 карти без група', lc.length === 2, 'получени ' + lc.length);
      ok('картите без група са след групите, в реда от базата',
        lc.length === 2 && lc[0].textContent.indexOf('СТОКА ЗА ВРЪЩАНЕ') >= 0 && lc[1].textContent.indexOf('Обучение по ПБ') >= 0 &&
        (hs[3].compareDocumentPosition(lc[0]) & 4) !== 0);
      ok('без разделител — заглавието е цяло на картата', lc.length === 2 && lc[0].textContent.indexOf('СТОКА ЗА ВРЪЩАНЕ') >= 0);
    }
  }

  section('2. Реален клик по „📂 Транспорт" → 2 карти; втори клик → затваря');
  {
    const { w, doc } = env('admin');
    guard('рендер', () => w.renderDocs());
    if (ok('заглавието „Транспорт" съществува', !!head(doc, 'Транспорт'))) {
      guard('клик', () => realClick(w, head(doc, 'Транспорт'), '📂 Транспорт'));
      const gc = groupCards(doc, 'Транспорт');
      ok('2 карти в групата', gc.length === 2, 'получени ' + gc.length);
      const txt = gc.map(c => c.textContent);
      ok('картите са „за обектите" и „пълна инструкция" (по азбучен ред)',
        gc.length === 2 && txt[0].indexOf('за обектите') >= 0 && txt[1].indexOf('пълна инструкция') >= 0, JSON.stringify(txt));
      ok('картата показва частта, не цялото заглавие', gc.length === 2 && txt.every(t => t.indexOf('Транспорт') < 0));
      ok('картата пази описанието', gc.length === 2 && txt[0].indexOf('Кратко') >= 0);
      ok('стрелката е ▾', head(doc, 'Транспорт').textContent.trim().indexOf('▾') === 0);
      ok('другите групи остават затворени', heads(doc).filter(x => x.textContent.trim().indexOf('▾') === 0).length === 1);
      guard('втори клик', () => realClick(w, head(doc, 'Транспорт'), '📂 Транспорт'));
      ok('след втори клик — 0 карти в групата', groupCards(doc, 'Транспорт').length === 0);
      ok('стрелката е пак ▸', head(doc, 'Транспорт').textContent.trim().indexOf('▸') === 0);
      /* Отворена група оцелява при повторен рендер (смяна на филтър) */
      guard('отваряне', () => realClick(w, head(doc, 'Транспорт'), '📂 Транспорт'));
      guard('рендер наново', () => w.renderDocs());
      ok('отворената група се помни между рендерите', groupCards(doc, 'Транспорт').length === 2);
    }
  }

  section('3. Клик по групата с кавичка в модула');
  {
    const h = env('admin');
    const { w, doc } = h;
    guard('рендер', () => w.renderDocs());
    const hd = head(doc, QUOTE_MOD);
    if (ok('заглавието „' + QUOTE_MOD + '" съществува (data-mod чете се точно)', !!hd)) {
      ok('onclick-ът не съдържа името на модула', (hd.getAttribute('onclick') || '').indexOf('Нова') < 0);
      const threw = !guard('клик без изключение', () => realClick(w, hd, QUOTE_MOD));
      ok('клик без грешка в конзолата', !threw && h.errs.length === 0, h.errs.join(' | '));
      const gc = groupCards(doc, QUOTE_MOD);
      ok('групата се отваря с 1 карта „тест"', gc.length === 1 && gc[0].textContent.indexOf('тест') >= 0);
    }
  }

  section('4. manager: „Транспорт (1)", офисният документ го няма');
  {
    const { w, doc } = env('manager');
    guard('рендер', () => w.renderDocs());
    const hd = head(doc, 'Транспорт');
    ok('групата „Транспорт" е с брой 1', !!hd && hd.textContent.indexOf('(1)') >= 0, hd ? hd.textContent : 'няма');
    if (hd) guard('клик', () => realClick(w, hd, '📂 Транспорт'));
    const gc = groupCards(doc, 'Транспорт');
    ok('само 1 карта, „за обектите"', gc.length === 1 && gc[0].textContent.indexOf('за обектите') >= 0);
    ok('„пълна инструкция" не се вижда никъде', doc.getElementById('doc-grid').textContent.indexOf('пълна инструкция') < 0);
  }

  section('5. Разделителят — правилата');
  {
    const { w } = env('admin');
    const s = t => JSON.stringify(w.docsSplitTitle(t));
    ok('„ — "', s('А — б') === JSON.stringify({ mod: 'А', part: 'б' }));
    ok('„ – "', s('А – б') === JSON.stringify({ mod: 'А', part: 'б' }));
    ok('„ - "', s('А - б') === JSON.stringify({ mod: 'А', part: 'б' }));
    ok('първото срещане', s('А - б — в') === JSON.stringify({ mod: 'А', part: 'б — в' }));
    ok('тире без интервали не е разделител', w.docsSplitTitle('SAP-ръководство') === null);
    ok('без разделител → null', w.docsSplitTitle('Обучение по ПБ') === null);
    ok('празно заглавие → null', w.docsSplitTitle('') === null && w.docsSplitTitle(null) === null);
  }

  report();
})();
