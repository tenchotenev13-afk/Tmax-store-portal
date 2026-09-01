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

  /* ═══ 6. Изпълнено, не прочетено ═══════════════════════════════════
     Секции 1–5 четат ИЗХОДНИЯ КОД. Това хваща разминаване между копията, но
     не казва нищо за резултата: четирите могат да са байт в байт еднакви и
     четирите да рисуват грешен HTML. Затова тук всяко копие се ИЗПЪЛНЯВА
     наистина, със същия вход, и се гледа изходът.

     esc/escAttr идват от shared.js за всичките четири. Това е коректно,
     защото секция 5 отгоре заковава, че всеки файл има собствен escAttr, а
     report-edge-sync.test.js заковава, че копията съвпадат с оригинала —
     тоест подменям функция със сверено нейно копие, не с приблизително
     подобна. */
  section('6. Изпълнение: снимката се отваря, документът не се обвива два пъти');
  {
    const sharedSrc = fs.readFileSync(path.join(ROOT, 'shared.js'), 'utf8');
    const oneLiner = (name) => {
      const m = sharedSrc.split(/\r?\n/).find(l =>
        new RegExp('^function ' + name + '\\s*\\(').test(l));
      if (!m) throw new Error('няма ' + name + ' в shared.js');
      return m;
    };

    const SNIMKA = { url: 'https://cdn.test/vitrina.jpg', filename: 'vitrina.jpg' };
    const XLSX   = { url: 'https://cdn.test/otchet.xlsx', filename: 'otchet.xlsx' };
    const BEZIME = { url: 'https://cdn.test/staro-bez-ime' };
    /* Кавичка вътре в URL-а — точно това чупи атрибута, ако някъде е пропуснат
       escAttr. Проверява се и в href, и в src. */
    const KAVICHKA = { url: 'https://cdn.test/a"b.jpg', filename: 'a.jpg' };

    COPIES.forEach(function (c) {
      let fn = null;
      try {
        fn = new Function(oneLiner('esc') + '\n' + oneLiner('escAttr') + '\n' +
          found[c.label] + '\nreturn ' + c.fn + ';')();
      } catch (e) {
        ok(c.label + ': функцията се изпълнява', false, e.message);
        return;
      }
      ok(c.label + ': функцията се изпълнява', true);

      /* ── снимка → <img>, обвит във връзка ── */
      const foto = fn([SNIMKA], []);
      ok(c.label + ': снимката е обвита в <a href>',
        /<a href="[^"]+" target="_blank"><img src="[^"]+"[^>]*><\/a>/.test(foto), foto);
      const href = (foto.match(/<a href="([^"]*)"/) || [])[1];
      const src  = (foto.match(/<img src="([^"]*)"/) || [])[1];
      ok(c.label + ': href === src', !!href && href === src,
        'href=' + href + '  src=' + src);
      ok(c.label + ': и това е URL-ът на снимката', href === SNIMKA.url, href);
      ok(c.label + ': target="_blank" — отваря се, не заменя писмото',
        foto.indexOf('target="_blank"') >= 0, foto);
      /* Размерът НЕ се пипа: по-голяма миниатюра разваля подредбата. */
      ok(c.label + ': 44x44 остава', /width:44px;height:44px/.test(foto), foto);
      ok(c.label + ': рамката и полето остават',
        /border:1px solid #D8DEE9/.test(foto) && /margin-right:5px/.test(foto), foto);

      /* ── документ → връзка с 📄, и НЕ втора обвивка ── */
      const dok = fn([], [XLSX]);
      ok(c.label + ': документът е връзка с 📄',
        /<a href="[^"]*otchet\.xlsx"[^>]*>📄 otchet\.xlsx<\/a>/.test(dok), dok);
      ok(c.label + ': документът НЕ е обвит втори път',
        (dok.match(/<a /g) || []).length === 1, dok);
      ok(c.label + ': документът няма <img>', dok.indexOf('<img') < 0, dok);
      ok(c.label + ': документът няма target="_blank" (клонът не е пипан)',
        dok.indexOf('target="_blank"') < 0, dok);

      /* ── запис без име → третира се като снимка, и той с връзка ── */
      const bezime = fn([BEZIME], []);
      ok(c.label + ': записът без име е миниатюра (заварено поведение)',
        bezime.indexOf('<img') >= 0 && bezime.indexOf('📄') < 0, bezime);
      ok(c.label + ': и той е обвит във връзка',
        /<a href="[^"]+" target="_blank"><img/.test(bezime), bezime);
      const hrefB = (bezime.match(/<a href="([^"]*)"/) || [])[1];
      ok(c.label + ': с неговия URL', hrefB === BEZIME.url, hrefB);

      /* ── кавичка в URL-а не изпада от escAttr нито в href, нито в src ── */
      const kav = fn([KAVICHKA], []);
      ok(c.label + ': кавичката е екранирана и в двата атрибута',
        (kav.match(/&quot;/g) || []).length === 2 && kav.indexOf('a"b') < 0, kav);

      /* ── смесен вход: и снимка, и документ в един блок ── */
      const mix = fn([SNIMKA], [XLSX]);
      ok(c.label + ': смесеният блок носи и двете',
        (mix.match(/<a /g) || []).length === 2 && (mix.match(/<img /g) || []).length === 1, mix);
      ok(c.label + ': празен вход остава празен низ',
        fn([], []) === '' && fn(null, undefined) === '');
    });
  }

  report();
})();
