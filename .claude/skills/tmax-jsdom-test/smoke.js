/* Бърза проверка: всички модули се зареждат ЗАЕДНО, в реалния ред от index.html,
   без да гърмят, и никое име не се дефинира два пъти по невнимание.

   Пускане (от корена на репото):
     node .claude/skills/tmax-jsdom-test/smoke.js .

   Това НЕ е тест на функционалност — само че нищо не се чупи при зареждане и
   че няма нови колизии на глобални имена. Тече за секунди; струва си преди
   всяко предаване на файл.
*/
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { MODULE_ORDER, repoDir } = require('./harness');

const DIR = repoDir(process.argv[2]);

/* Известни и НАРОЧНИ предефиниции — не се докладват.
   Внимание: не всяка предефиниция е бъг. В проекта има легитимен модел
   "обвиване":
       var _orig = startApp;
       startApp = function(){ _orig(); ...моето... };
   Той е коректен, докато всяка обвивка вика _orig(). Bug е, когато второто
   определение просто ЗАМЕНИ първото, без да го вика.
   Ако тук изскочи ново име — провери кое от двете е. */
const KNOWN_COLLISIONS = {
  'fmtMoney': 'kasa.js / history.js — history.js печели по ред на зареждане (козметично, прието)',
  'startApp': 'нарочна верига обвивки: shared.js → stock-differences.js → notifications.js',
  'renderMetrics': 'нарочна обвивка в notifications.js (вика _origMetrics)'
};

const html = fs.readFileSync(DIR + 'index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.org/' });
const w = dom.window;
w.scrollTo = () => {};
w.alert = () => {}; w.confirm = () => true; w.print = () => {};
w.Element.prototype.scrollIntoView = function () {};
w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([]), text: () => Promise.resolve('') });

const owner = {};        /* име → файлът, който го е дефинирал пръв */
const collisions = [];
let loadErrors = 0;

MODULE_ORDER.forEach(f => {
  const full = DIR + f;
  if (!fs.existsSync(full)) { console.log('⚠️  липсва файл: ' + f); return; }

  /* Пази РЕФЕРЕНЦИИТЕ, не само имената — колизия е когато същото име сочи
     към ДРУГА функция след зареждането, не просто когато името вече е било там. */
  const before = new Map();
  Object.keys(w).forEach(k => { if (typeof w[k] === 'function') before.set(k, w[k]); });

  try {
    w.eval(fs.readFileSync(full, 'utf8'));
  } catch (e) {
    loadErrors++;
    console.log('❌ ' + f + ' гърми при зареждане: ' + e.message);
    return;
  }

  let added = 0;
  Object.keys(w).forEach(name => {
    if (typeof w[name] !== 'function') return;
    if (!before.has(name)) { owner[name] = f; added++; return; }
    if (before.get(name) !== w[name] && !KNOWN_COLLISIONS[name]) {
      collisions.push({ name, first: owner[name] || '(преди зареждането)', second: f });
      owner[name] = f;
    }
  });
  console.log('✅ ' + f.padEnd(24) + ' +' + added + ' функции');
});

console.log('\n─────────────────────────────');
console.log('общо глобални функции: ' + Object.keys(owner).length);

if (collisions.length) {
  console.log('\n⚠️  НЕОЧАКВАНИ предефиниции (второто определение печели):');
  collisions.forEach(c => console.log('   · ' + c.name + '  —  ' + c.first + ' → презаписана от ' + c.second));
  console.log('\n   Провери всяка: нарочно обвиване (вика оригинала) или тиха подмяна?');
  console.log('   Нарочните се добавят в KNOWN_COLLISIONS в smoke.js.');
} else {
  console.log('неочаквани предефиниции: няма');
}

console.log(loadErrors ? '\n❌ ' + loadErrors + ' файла гърмят при зареждане' : '\nвсички файлове се зареждат чисто');
process.exit(loadErrors || collisions.length ? 1 : 0);
