/* БЮЛЕТИН: ОПИСАНИЕТО НА СЪБИТИЕ (calendar[ден][i].desc) СЕ ПОКАЗВА.

   Формата го записваше (cal-desc), но нито седмичният календар, нито печатът го
   четяха — 72 от 131 събития за 2026 имаха описание, което обектите не видяха.
   Рисува се на три места: колона по отдел, блок „общо" (без отдел) и печат.
   Празно описание → никакъв празен ред. Свободен текст → esc()/linkify.

   Часовникът: петък 18.09.2026 12:00 (С38).
   Пускане:  node tests/bulletin-event-desc.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const NOW = new Date(2026, 8, 18, 12, 0).getTime();
function freezeAt(w, ms) {
  const Real = w.Date;
  w.Date = class extends Real {
    constructor(...a) { if (a.length === 0) super(ms); else super(...a); }
    static now() { return ms; }
  };
}
const KEY = 'fri';
const LONG = 'https://example.com/' + 'a'.repeat(300);
const EVENTS = [
  { title: 'СЪБ-ОТДЕЛ', desc: 'Срок до петък\nвторият ред', dept: 'trade', attachments: [] },
  { title: 'СЪБ-БЕЗ', dept: 'trade', attachments: [] },
  { title: 'СЪБ-ПРАЗНО', desc: '   ', dept: 'warehouse', attachments: [] },
  { title: 'СЪБ-ОБЩО', desc: 'Виж https://example.com/pravila днес', dept: 'general', attachments: [] },
  { title: 'СЪБ-ЛИНК', desc: 'Дълъг: ' + LONG, dept: 'admin', attachments: [] },
  { title: 'СЪБ-XSS', desc: '<script>window.__x=1</script> "кавички" \'апостроф\' & <b>b</b>', dept: 'trade', attachments: [] }
];

function env() {
  const h = boot({ modules: ['bulletin.js', 'push.js'], user: ADMIN, data: {} });
  const w = h.w;
  freezeAt(w, NOW);
  const b = { id: 'b-38', week_number: 38, year: 2026, status: 'draft', created_at: '2026-09-10T08:00:00Z',
    content: { calendar: {}, columns: { trade: [], warehouse: [], admin: [] } } };
  w.DKEYS.forEach(k => { b.content.calendar[k] = []; });
  b.content.calendar[KEY] = JSON.parse(JSON.stringify(EVENTS));
  ['bulletin_tasks', 'recurring_tasks', 'recurring_task_periods', 'recurring_task_skips', 'task_completions',
   'task_subtasks', 'subtask_completions', 'notification_schedules', 'users', 'bulletin_promotions'].forEach(t => h.setData(t, []));
  h.setData('bulletins', [b]);
  w.bulPromotions = []; w.bulTasks = []; w.recurringTasks = [];
  w.curBul = b;
  return { h, w, doc: h.doc };
}
/* Редът на събитието по заглавие: най-близкият обвиващ блок с padding:3px 0 */
function evBlock(root, title) {
  const spans = Array.from(root.querySelectorAll('span')).filter(s => s.textContent === title);
  return spans.length ? spans[0].parentNode.parentNode : null;
}
const descOf = blk => blk ? Array.from(blk.querySelectorAll('.bul-desc')) : [];

(async function run() {
  section('Седмичен календар — колона по отдел и блок „общо"');
  const E = env();
  guard('renderBulletin()', () => E.w.renderBulletin());
  const root = E.doc.getElementById('sec-calendar');
  ok('календарът е нарисуван', !!root);

  const dept = evBlock(root, 'СЪБ-ОТДЕЛ');
  ok('събитие с отдел и описание: .bul-desc под заглавието', descOf(dept).length === 1 && /Срок до петък/.test(descOf(dept)[0].textContent), dept && dept.innerHTML.slice(0, 300));
  ok('описанието е след реда със заглавието', dept && dept.children[0].textContent.indexOf('СЪБ-ОТДЕЛ') >= 0 && dept.children[1].className === 'bul-desc');
  ok('новият ред се запазва (в текста; pre-line е в .bul-desc)', /петък\nвторият/.test(descOf(dept)[0].textContent));

  const none = evBlock(root, 'СЪБ-БЕЗ');
  ok('без desc: няма .bul-desc', none && descOf(none).length === 0);
  ok('без desc: няма празен ред (никой празен div след заглавието)', none && Array.from(none.children).every(c => c.textContent.trim() !== '' || c.querySelector('input,label')), none && none.innerHTML);
  const blank = evBlock(root, 'СЪБ-ПРАЗНО');
  ok('desc само от интервали: няма .bul-desc', blank && descOf(blank).length === 0);

  const gen = evBlock(root, 'СЪБ-ОБЩО');
  ok('блок „общо": .bul-desc с линк', descOf(gen).length === 1 && !!descOf(gen)[0].querySelector('a[href="https://example.com/pravila"]'), gen && gen.innerHTML);

  const lnk = evBlock(root, 'СЪБ-ЛИНК');
  const a = lnk && lnk.querySelector('.bul-desc a');
  ok('дълъг линк: става <a> с пълния адрес', !!a && a.getAttribute('href') === LONG);

  const x = evBlock(root, 'СЪБ-XSS');
  const xd = descOf(x)[0];
  ok('XSS: няма <script> в DOM', !root.querySelector('script') && !E.w.__x);
  ok('XSS: няма <b> от свободния текст', xd && !xd.querySelector('b'));
  ok('XSS: текстът е видим буквално, с кавички и &', xd && xd.textContent.indexOf('<script>window.__x=1</script>') >= 0 && xd.textContent.indexOf('"кавички"') >= 0 && xd.textContent.indexOf("'апостроф'") >= 0 && xd.textContent.indexOf('& <b>b</b>') >= 0, xd && xd.textContent);

  section('Печат на седмичния календар (window.open → document.write)');
  const P = env();
  let printed = '';
  P.w.open = () => ({ document: { write(x) { printed += String(x); }, close() {} }, focus() {}, print() {}, close() {} });
  guard('printSection("cal")', () => P.w.printSection('cal'));
  const box = P.doc.createElement('div');
  box.innerHTML = printed.split('</style>').slice(1).join('</style>');
  const html = box.innerHTML;
  ok('печатът е нарисуван', printed.indexOf('СЪБ-ОТДЕЛ') >= 0);
  const at = t => { const k = html.indexOf(t); return html.slice(k, k + 400); };
  ok('печат: описанието е под заглавието',
    new RegExp('СЪБ-ОТДЕЛ</span></div><div[^>]*white-space:pre-line[^>]*>Срок до петък').test(html), at('СЪБ-ОТДЕЛ'));
  ok('печат: адресът се чете в текста', html.indexOf('https://example.com/pravila') >= 0);
  ok('печат: дългият адрес е цял', html.indexOf(LONG) >= 0);
  ok('печат: без desc няма празен ред след заглавието',
    html.indexOf('СЪБ-БЕЗ</span></div><div class="cal-entry"')>=0 || html.indexOf('СЪБ-БЕЗ</span></div></div>')>=0, at('СЪБ-БЕЗ'));
  ok('печат: desc само от интервали — без ред', html.indexOf('СЪБ-ПРАЗНО</span></div><div class="cal-entry"')>=0 || html.indexOf('СЪБ-ПРАЗНО</span></div></div>')>=0, at('СЪБ-ПРАЗНО'));
  ok('печат XSS: няма жив <script>/<b> от описанието',
    !box.querySelector('script') && html.indexOf('<b>b</b>') < 0 && html.indexOf('&lt;script&gt;') >= 0, at('СЪБ-XSS'));

  section('Хелперите директно');
  ok('празно/undefined → празен низ', E.w.calEventDescHtml({}) === '' && E.w.calEventDescHtml(null) === '' && E.w.calEventDescPrintHtml({ desc: '' }) === '');

  report();
})();
