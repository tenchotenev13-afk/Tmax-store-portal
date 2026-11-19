/* Синхронът на правилото за сторно между kasa.js и едж функцията kasa-api
   (решение 13, 19.11.2026). kasa-api брои „сторна с по-малка сума“ за банера
   при вход на сървъра, с копие на STORNO_EXEMPT_CODES / stornoIsExempt /
   stornoIndicator в supabase/functions/kasa-api/storno-rule.js.

   Какво заковава:
     1. трите блока ги има и в двата файла;
     2. ТЕКСТЪТ им е един и същ (до интервалите в края на реда);
     3. копието наистина се изпълнява като същото правило — зарежда се като
        модул и се сверява с kasa.js на гранични случаи (капаро, ваучер,
        разлика под стотинка, равни, по-голяма нова сума);
     4. handler.ts ползва копието, а не собствено сравнение.

   Пускане:  node tests/kasa-api-storno-sync.test.js .
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { section, report } = H;
/* harness: check(име, условие). Тук условието е първо — затова обвивка. */
function check(cond, name) { H.ok(name, !!cond); }

const ROOT = process.argv[2] || path.join(__dirname, '..');
const KASA = fs.readFileSync(path.join(ROOT, 'kasa.js'), 'utf8');
const RULE_PATH = path.join(ROOT, 'supabase/functions/kasa-api/storno-rule.js');
const RULE = fs.readFileSync(RULE_PATH, 'utf8');
const HANDLER = fs.readFileSync(path.join(ROOT, 'supabase/functions/kasa-api/handler.ts'), 'utf8');

/* Блокът на функция: от „function ИМЕ(“ до първия ред, който е само „}“. */
function fnBlock(src, name) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const i = lines.findIndex((l) => l.indexOf('function ' + name + '(') === 0);
  if (i < 0) return null;
  const j = lines.findIndex((l, k) => k > i && l === '}');
  if (j < 0) return null;
  return lines.slice(i, j + 1).map((l) => l.replace(/\s+$/, '')).join('\n');
}
function varLine(src, name) {
  const m = src.replace(/\r\n/g, '\n').split('\n').find((l) => l.indexOf('var ' + name + ' ') === 0);
  return m ? m.replace(/\s+$/, '') : null;
}

section('1–2. Трите блока — текст в текст');
check(!!varLine(KASA, 'STORNO_EXEMPT_CODES'), 'kasa.js има STORNO_EXEMPT_CODES');
check(varLine(KASA, 'STORNO_EXEMPT_CODES') === varLine(RULE, 'STORNO_EXEMPT_CODES'), 'STORNO_EXEMPT_CODES — еднакви');
['stornoIsExempt', 'stornoIndicator'].forEach(function (fn) {
  const a = fnBlock(KASA, fn), b = fnBlock(RULE, fn);
  check(!!a, 'kasa.js има ' + fn);
  check(!!b, 'storno-rule.js има ' + fn);
  check(a === b, fn + ' — еднакъв текст' + (a !== b ? '\n--- kasa.js\n' + a + '\n--- storno-rule.js\n' + b : ''));
});

section('3. Копието се изпълнява като kasa.js');
function load(src) {
  const sb = {};
  vm.runInNewContext(src.replace(/^export\s*\{[^}]*\};?\s*$/m, '') + '\nthis.f=stornoIndicator;', sb);
  return sb.f;
}
const fromKasa = load(['STORNO_EXEMPT_CODES', 'stornoIsExempt', 'stornoIndicator'].map(function (n) {
  return n === 'STORNO_EXEMPT_CODES' ? varLine(KASA, n) : fnBlock(KASA, n);
}).join('\n'));
const fromRule = load(RULE);
check(/^export\s*\{\s*STORNO_EXEMPT_CODES,\s*stornoIsExempt,\s*stornoIndicator\s*\};?\s*$/m.test(RULE), 'storno-rule.js изнася трите');
const CASES = [
  [100, 50, '123456'], [100, 0, '900001'], [100, 0, '123 / 900009'], [100, 99.996, '1'],
  [100, 99.99, '1'], [100, 100, '1'], [100, 120, '1'], ['abc', null, null], [0, 0, ''], [10.005, 10, '7'],
];
CASES.forEach(function (c) {
  const a = fromKasa(c[0], c[1], c[2]), b = fromRule(c[0], c[1], c[2]);
  check(JSON.stringify(a) === JSON.stringify(b), 'stornoIndicator(' + c.join(', ') + ') → ' + JSON.stringify({ flagged: b.flagged, diff: b.diff }));
});
check(fromRule(100, 0, '900001').flagged === false, 'капарото не се брои');
check(fromRule(100, 50, '1').flagged === true, 'по-малка сума се брои');

section('4. handler.ts ползва копието');
check(/import\s*\{\s*stornoIndicator\s*\}\s*from\s*"\.\/storno-rule\.js"/.test(HANDLER), 'import { stornoIndicator } from "./storno-rule.js"');
check(/stornoIndicator\(r\.returned_sum,\s*r\.new_sum,\s*r\.articles\)\.flagged/.test(HANDLER), 'банерът брои през stornoIndicator(...).flagged');
check(!/new_sum\s*<\s*|returned_sum\s*>/.test(HANDLER), 'без собствено сравнение на сумите');

report();
