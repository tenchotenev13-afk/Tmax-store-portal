/* Копията на рендирането на прикачените файлове.

   Една и съща преценка по разширение — снимка става миниатюра <img 44x44>,
   всичко останало става връзка „📄 име" — живее на ЧЕТИРИ места:

     · report.js                                   reportAttachmentsHtml
     · supabase/functions/send-scheduled-report    reportAttachmentsHtml
     · supabase/functions/bulletin-notify          attachmentsHtml
     · supabase/functions/send-routed-report       reportAttachmentsHtml

   Копията не са небрежност, а следствие: Deno не може да import-не браузърен
   файл, а едж функциите не се виждат една друга. Копие обаче се разминава
   мълчаливо — при второто вече имаше повод (трите заварени .xlsx в колоната
   photos, които излизаха като счупени картинки), а при следващите никой няма
   да забележи, докато едно от писмата не се счупи.

   ЧЕТВЪРТОТО влезе с send-routed-report (личният седмичен отчет по задачи) и
   е добавено тук СЪС самия файл. Точно това е капанът, който този тест пази:
   списъкът е изричен, тоест ново копие не се хваща само — влезе ли файл, без
   да влезе и ред тук, тестът минава и продължава да твърди, че всичко е
   сверено. Добавяш ли пето копие, добави и ред.

   Затова: кодът на всичките се сравнява НОРМАЛИЗИРАН — коментарите нарочно се
   различават (едж файловете носят собствени бележки), TS анотациите също,
   а името в bulletin-notify е друго. Всичко останало трябва да съвпада.

   Оригиналът е в report.js. Разминат ли се, поправя се КОПИЕТО, в посока
   към оригинала — не обратното.

   Пускане: node tests/attachments-html-sync.test.js . */
'use strict';

const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');

/* Източниците. `fn` е името в съответния файл — то е единственото, което
   СМЕЕ да се различава. */
const COPIES = [
  { label: 'report.js (оригинал)', file: 'report.js', fn: 'reportAttachmentsHtml' },
  { label: 'send-scheduled-report', file: 'supabase/functions/send-scheduled-report/index.ts', fn: 'reportAttachmentsHtml' },
  { label: 'bulletin-notify', file: 'supabase/functions/bulletin-notify/index.ts', fn: 'attachmentsHtml' },
  { label: 'send-routed-report', file: 'supabase/functions/send-routed-report/index.ts', fn: 'reportAttachmentsHtml' },
];

/* ── Разбор ──
   Функцията се затваря по БРОЯЧ на скоби, не по „ред, който е точно }" —
   същата причина като в report-edge-sync.test.js. Литералите се празнят,
   за да не се броят скоби вътре в тях. */
function stripLiterals(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

function extract(file, fn) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/);
  const head = new RegExp('^function ' + fn + '\\s*\\(');
  const i = lines.findIndex(l => head.test(l));
  if (i < 0) return null;
  const body = [];
  let depth = 0, started = false;
  for (let j = i; j < lines.length; j++) {
    body.push(lines[j]);
    const bare = stripLiterals(lines[j]);
    for (const ch of bare) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') depth--;
    }
    if (started && depth <= 0) break;
  }
  return body.join('\n');
}

/* Само кодът, без коментари, без TS анотации, без името на функцията и без
   козметика по интервалите. Стринговете се пазят непокътнати — интервал
   вътре в HTML низ Е значещ и разлика там трябва да пада.

   Маркерът на извадения литерал е БУКВЕН (LIT<n>LIT), а не от интервали:
   стъпката по-долу маха интервалите около пунктуацията, тоест маркер от
   интервали се изяжда точно когато литералът стои до + или ( — и тогава
   низовете не се връщат обратно, а сравнението мълчаливо мери осакатен
   текст. Буквите преживяват и двете стъпки. */
function normalize(src, fn) {
  const lits = [];
  let t = src
    .replace(new RegExp('^function ' + fn + '\\s*\\('), 'function __FN__(')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, function (m) {
      lits.push(m); return 'LIT' + (lits.length - 1) + 'LIT';
    });
  t = t
    .replace(/([A-Za-z0-9_$]+)\s*\?\s*:\s*[A-Za-z0-9_$<>\[\]|]+/g, '$1')
    .replace(/([A-Za-z0-9_$]+)\s*:\s*(string|number|boolean|any|unknown|Date)\b/g, '$1')
    .replace(/\)\s*:\s*(string|number|boolean|any|unknown)\b/g, ')')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(){}\[\],;:?<>=!+\-*/%&|]+)\s*/g, '$1')
    .trim();
  return t.replace(/LIT(\d+)LIT/g, (_, i) => lits[+i]);
}

(function run() {

  /* ═══ 1. Всички съществуват ════════════════════════════════════════ */
  section('1. Копията ги има');
  const found = {};
  COPIES.forEach(function (c) {
    const src = extract(c.file, c.fn);
    found[c.label] = src;
    ok(c.label + ': ' + c.fn + '() се намира', !!src, c.file);
  });

  const all = COPIES.filter(c => found[c.label]);
  if (all.length !== COPIES.length) { report(); return; }

  /* ═══ 2. Ядрото: кодът е един и същ ════════════════════════════════ */
  section('2. Нормализираният код на копията съвпада');
  {
    const base = COPIES[0];
    const baseN = normalize(found[base.label], base.fn);
    ok('оригиналът изобщо се нормализира до нещо', baseN.length > 100, String(baseN.length));

    COPIES.slice(1).forEach(function (c) {
      const n = normalize(found[c.label], c.fn);
      const same = n === baseN;
      if (!same) {
        /* Първата разлика — иначе съобщението е два еднакви на вид низа. */
        let i = 0;
        while (i < Math.min(n.length, baseN.length) && n[i] === baseN[i]) i++;
        ok(c.label + ' === оригинала', false,
          'разминава се от знак ' + i + ':\n  оригинал: …' + baseN.slice(Math.max(0, i - 40), i + 60) +
          '\n  копие:    …' + n.slice(Math.max(0, i - 40), i + 60));
      } else {
        ok(c.label + ' === оригинала', true);
      }
    });
  }

  /* ═══ 3. Същината, изрично ═════════════════════════════════════════ */
  section('3. Правилото за разширението е във всяко копие');
  {
    COPIES.forEach(function (c) {
      const s = found[c.label];
      ok(c.label + ': снимката става <img>', /<img src="/.test(s));
      ok(c.label + ': документът става връзка с 📄', /📄/.test(s) && /<a href="/.test(s));
      ok(c.label + ': списъкът с разширения е същият',
        /'jpg','jpeg','png','gif','webp','heic','heif'/.test(s), s.slice(0, 0));
      /* Без име не се съди — заварените записи без filename остават миниатюри. */
      ok(c.label + ': липсващото име пада към миниатюра', /if \(!nm \|\|/.test(s));
      /* URL-ът минава през escAttr, не гол — кавичка вътре чупи атрибута. */
      ok(c.label + ': URL-ът минава през escAttr', /escAttr\(ph\.url\)/.test(s));
    });
  }

  /* ═══ 4. Копието не е мъртво ═══════════════════════════════════════ */
  section('4. Всеки файл наистина я вика');
  {
    const calls = [
      { file: 'report.js', fn: 'reportAttachmentsHtml', min: 2 },
      { file: 'supabase/functions/send-scheduled-report/index.ts', fn: 'reportAttachmentsHtml', min: 1 },
      { file: 'supabase/functions/bulletin-notify/index.ts', fn: 'attachmentsHtml', min: 1 },
      /* Тук е ЕДНО: маршрутизираният файл носи само личната картичка,
         не и коментарите по обекти от общия отчет. */
      { file: 'supabase/functions/send-routed-report/index.ts', fn: 'reportAttachmentsHtml', min: 1 },
    ];
    calls.forEach(function (c) {
      const src = fs.readFileSync(path.join(ROOT, c.file), 'utf8');
      /* Викания, не дефиницията: `h += име(` */
      const n = (src.match(new RegExp('\\+=\\s*' + c.fn + '\\(', 'g')) || []).length;
      ok(c.file + ': вика се поне ' + c.min + ' път(и)', n >= c.min, 'намерени: ' + n);
    });
  }

  /* ═══ 5. escAttr съществува навсякъде, където се вика ══════════════ */
  section('5. escAttr е налична във всеки от файловете');
  {
    [
      { file: 'shared.js', why: 'оригиналът, ползван от report.js' },
      { file: 'supabase/functions/send-scheduled-report/index.ts', why: 'копие' },
      { file: 'supabase/functions/bulletin-notify/index.ts', why: 'копие' },
      { file: 'supabase/functions/send-routed-report/index.ts', why: 'копие' },
    ].forEach(function (c) {
      const src = fs.readFileSync(path.join(ROOT, c.file), 'utf8');
      ok(c.file + ': function escAttr(…) е дефинирана (' + c.why + ')',
        /function escAttr\s*\(/.test(src));
    });
  }

  report();
})();
