/* Темата на писмата в resend-email — RFC 2047 кодиране на кирилица.

   ЗАЩО СЪЩЕСТВУВА ТОЗИ ТЕСТ
   До 23.08.2026 всяка тема минаваше през transliterate() и излизаше на
   латиница („ТеМАХ" -> „TeMAH"), защото вградената в denomailer
   quotedPrintableEncodeInline() дава негоден encoded word. Причината НЕ е
   „неотстраним бъг", както се твърдеше — тя е, че библиотеката ползва
   енкодера за ТЯЛО на място, където правилата са други, и се чупи по три
   независими начина едновременно:
     1. литерален интервал ВЪТРЕ в encoded word (код 32 минава непокътнат),
        а по RFC 2047 интервалът прекратява encoded word-а — това само по
        себе си чупи дори „ТеМАХ — Оборот", преди дължината да е проблем;
     2. меко пренасяне „=\r\n" вътре в encoded word — също забранено;
     3. дължина 92 и 141 символа при допустими 75.

   Заобикалянето: encodeSubject() строи encoded words сама, в base64, и ги
   подава с ВОДЕЩ ИНТЕРВАЛ. quotedPrintableEncodeInline() пуска низа дословно
   само ако е чист ASCII И не започва с „=?"; интервалът отпред изпълнява
   второто условие, а после се отхвърля като folding whitespace.

   КАКВО ЗАКОВАВА ТЕСТЪТ
     1. encodeSubject() от живия .ts файл, прекарана през точния пренос на
        quotedPrintableEncodeInline(), излиза НЕПОКЪТНАТА — ако това падне,
        значи заобикалянето вече не работи и темите пак ще са боклук;
     2. сглобеното заглавие, разгънато и декодирано както го прави пощенският
        клиент, връща подадената тема БАЙТ В БАЙТ;
     3. многобайтов символ никога не се цепи между две encoded words —
        проверено чрез изместване през всяка възможна позиция на границата;
     4. границите на RFC: encoded word <= 75 символа, ред <= 78;
     5. РЕГРЕСИОНЕН ЯКОР: старият път (transliterate и вградената
        quotedPrintableEncodeInline) СЕ ЧУПИ на същите теми;
     6. transliterate() още стои във файла, но вече не се вика за темата.

   Пускане:  node tests/email-subject-rfc2047.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const SRC = path.join(ROOT, 'supabase/functions/resend-email/send-email.ts');
const src = fs.readFileSync(SRC, 'utf8');

/* ── Вадим РЕАЛНАТА функция от .ts файла ──
   Не я преписваме тук: тестът трябва да мери това, което ще се деплойва. */
function extractFn(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('няма function ' + name + '() в ' + SRC);
  let depth = 0, i = src.indexOf('{', start);
  const open = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  if (depth !== 0) throw new Error('несбалансирани скоби в ' + name + '()');
  /* Редът е важен: първо съставните типове, после скаларите. Обратното
     превръща "var words: string[]" в "var words[]" и гърми. */
  const js = src.slice(start, i + 1)
    .replace(/:\s*Record<[^>]*>/g, '')
    .replace(/:\s*(string|number)\[\]/g, '')
    .replace(/:\s*(string|boolean)\b/g, '');
  if (/:\s*[A-Za-z]/.test(js.split('{')[0])) {
    throw new Error('останала TS анотация в сигнатурата на ' + name);
  }
  return js;
}

let encodeSubject, transliterate;
try {
  /* hasNonAscii() е нужна, защото encodeSubject() я вика. Нарочно е отделна
     функция с цикъл вместо регекс с \u escape-и — деплойът минава през JSON,
     където "\u0000" става СУРОВ NUL байт в изходния файл. */
  const factory = new Function(
    extractFn('hasNonAscii') + '\n' + extractFn('encodeSubject') + '\n' +
    extractFn('transliterate') +
    '\nreturn { encodeSubject: encodeSubject, transliterate: transliterate };');
  const m = factory();
  encodeSubject = m.encodeSubject;
  transliterate = m.transliterate;
} catch (e) {
  console.error('❌ не мога да извадя функциите от ' + SRC + ': ' + e.message);
  process.exit(1);
}

/* ══════════ Пътят, по който темата стига до пощата ══════════ */

/* Точен пренос на denomailer@1.6.0 config/mail/encoding.ts —
   quotedPrintableEncode + quotedPrintableEncodeInline. Всяка тема минава
   през второто (config/mail/mod.ts:94), без изключение. */
const denoEncoder = new TextEncoder();
function denomailerQP(data) {
  data = data.split(' \r\n').join('=20\r\n').split(' \n').join('=20\n');
  const encodedData = Array.from(data).map(function (ch) {
    const e = denoEncoder.encode(ch);
    if (e.length === 1) {
      const c = e[0];
      if (c >= 32 && c <= 126 && c !== 61) return ch;
      if (c === 10 || c === 13 || c === 9) return ch;
    }
    let s = '';
    e.forEach(function (i) { let c = i.toString(16); if (c.length === 1) c = '0' + c; s += '=' + c; });
    return s;
  }).join('');
  let ret = '';
  const lines = Math.ceil(encodedData.length / 74) - 1;
  let offset = 0;
  for (let i = 0; i < lines; i++) {
    let old = encodedData.slice(i * 74 + offset, (i + 1) * 74);
    offset = 0;
    if (old.slice(-1) === '=') { old = old.slice(0, old.length - 1); offset = -1; }
    if (old.slice(-2, -1) === '=') { old = old.slice(0, old.length - 2); offset = -2; }
    ret += (old.slice(-1) === '\r' || old.slice(-1) === '\n') ? old : old + '=\r\n';
  }
  ret += encodedData.slice(lines * 74);
  return ret;
}
function inlineQP(data) {
  if (/[^\u0000-\u007f]/.test(data) || data.indexOf('=?') === 0) {
    return '=?utf-8?Q?' + denomailerQP(data) + '?=';
  }
  return data;
}

/* client/basic/client.ts:99 -> connection.ts:114: writeCmd слепва
   аргументите с ИНТЕРВАЛ и добавя CRLF. */
function wireHeader(subjectValue) {
  return ['Subject: ', inlineQP(subjectValue)].join(' ') + '\r\n';
}

/* Пощенският клиент: разгъва сгънатото заглавие, маха whitespace между
   съседни encoded words (RFC 2047 §6.2) и декодира. */
function decodeHeader(wire) {
  let v = wire.replace(/\r\n$/, '').replace(/^Subject:/, '');
  v = v.replace(/\r\n[ \t]+/g, ' ');
  v = v.replace(/(\?=)[ \t]+(?==\?)/g, '$1');
  v = v.replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]*)\?=/gi, function (_, p) {
    return Buffer.from(p, 'base64').toString('utf8');
  });
  return v.replace(/^[ \t]+/, '');
}

function roundTrip(subject) {
  const value = encodeSubject(subject);
  const wire = wireHeader(value);
  return {
    value: value,
    wire: wire,
    dumi: value.match(/=\?UTF-8\?B\?[A-Za-z0-9+/=]*\?=/g) || [],
    nepokatnata: inlineQP(value) === value,
    nazad: decodeHeader(wire),
  };
}

/* ══════════ Темите ══════════ */

/* Случай 4 от задачата: тема, при която многобайтов символ пада точно на
   границата между две encoded words. Таванът е 39 байта на дума, кирилицата
   е по 2 байта — тоест при нечетен брой ASCII символи отпред границата
   попада В СРЕДАТА на кирилска буква. Строим и двата варианта, плюс емоджи
   (4 байта), което може да се разцепи на четири различни места. */
function granichna(asciiOtpred, opashka) {
  return 'X'.repeat(asciiOtpred) + opashka;
}

const TEMI = [
  { ime: '1. кратка кирилица', s: 'ТеМАХ — Оборот' },
  {
    ime: '2. дълга кирилица (над 75 симв. в едно encoded word)',
    s: 'ТеМАХ — Седмичен репорт за периода 17.08–23.08.2026 по всички обекти на веригата',
  },
  { ime: '3. смесена с цифри и точки', s: 'ТеМАХ Оборот 19.08.2026 — 194 022 лв.' },
  { ime: '4а. кирилица точно на границата (нечетен ASCII отпред)', s: granichna(39, 'ъглов случай') },
  { ime: '4б. кирилица точно на границата (четен ASCII отпред)', s: granichna(38, 'ъглов случай') },
  { ime: '4в. емоджи точно на границата', s: granichna(37, '💰 лв.') },
  { ime: '4г. емоджи на границата, друг отстъп', s: granichna(36, '💰 лв.') },
  { ime: 'чист ASCII (темата на send-oborot-report)', s: 'TeMAX Oborot 19.08 - 194 022 lv.' },
  { ime: 'една кирилска буква', s: 'я' },
  { ime: 'много дълга тема (200 кирилски символа)', s: 'абвгдежзийклмнопрстуфхцчшщъюя '.repeat(7) },
];

/* ══════════ Проверките ══════════ */
(function () {
  section('denomailer не пипа подаденото');
  TEMI.forEach(function (t) {
    const r = roundTrip(t.s);
    ok(t.ime + ' — quotedPrintableEncodeInline я връща дословно', r.nepokatnata,
      JSON.stringify(inlineQP(r.value)).slice(0, 90));
  });

  section('Байт в байт през сглобяване и разбор на заглавието');
  TEMI.forEach(function (t) {
    const r = roundTrip(t.s);
    ok(t.ime + ' — декодираната тема е подадената', r.nazad === t.s,
      JSON.stringify(t.s) + '  ->  ' + JSON.stringify(r.nazad));
    ok(t.ime + ' — байтово равенство',
      Buffer.from(r.nazad, 'utf8').equals(Buffer.from(t.s, 'utf8')));
  });

  section('Многобайтов символ никога не се цепи между думи');
  TEMI.forEach(function (t) {
    const r = roundTrip(t.s);
    /* Всяка дума поотделно трябва да е валиден UTF-8 без заместващи символи.
       Разцепен символ дава U+FFFD точно тук. */
    const lоши = r.dumi.filter(function (d) {
      const b64 = d.slice(10, -2);
      return Buffer.from(b64, 'base64').toString('utf8').indexOf('�') >= 0;
    });
    ok(t.ime + ' — всяка дума се декодира сама по себе си чисто', lоши.length === 0,
      lоши.join(' | '));
  });

  section('Изместване през всяка позиция на границата');
  {
    /* Границата пада на всеки 39 байта. Прекарваме многобайтов символ през
       всяка възможна позиция спрямо нея, вместо да гадаем кои са опасните. */
    let lom = 0, prav = '';
    for (let n = 0; n < 130; n++) {
      const s = 'X'.repeat(n) + 'ъ💰я лв. ТеМАХ';
      const r = roundTrip(s);
      if (r.nazad !== s || !r.nepokatnata) { lom++; if (!prav) prav = 'n=' + n; }
    }
    ok('всичките 130 измествания се връщат непокътнати', lom === 0,
      lom + ' счупени, първо: ' + prav);
  }

  section('Границите на RFC');
  TEMI.forEach(function (t) {
    const r = roundTrip(t.s);
    const najdylga = r.dumi.length ? Math.max.apply(null, r.dumi.map(function (d) { return d.length; })) : 0;
    ok(t.ime + ' — encoded word <= 75 символа (RFC 2047)', najdylga <= 75, 'най-дълга: ' + najdylga);
    const redove = r.wire.replace(/\r\n$/, '').split('\r\n');
    const najdylygRed = Math.max.apply(null, redove.map(function (l) { return l.length; }));
    ok(t.ime + ' — ред <= 78 символа (препоръката на RFC 5322)', najdylygRed <= 78,
      'най-дълъг ред: ' + najdylygRed);
    ok(t.ime + ' — всеки ред след първия започва с интервал (валидно сгъване)',
      redove.slice(1).every(function (l) { return l.charAt(0) === ' '; }));
    ok(t.ime + ' — няма интервал ВЪТРЕ в encoded word',
      r.dumi.every(function (d) { return d.indexOf(' ') < 0; }));
  });

  section('Регресионен якор: старият път се чупи');
  {
    const kiril = TEMI.filter(function (t) { return /[а-яА-Я]/.test(t.s); });
    const translit = kiril.filter(function (t) { return transliterate(t.s) !== t.s; });
    ok('transliterate() наистина би променила всяка кирилска тема',
      translit.length === kiril.length, 'непроменени: ' + (kiril.length - translit.length));
    ok('и по-точно: „ТеМАХ" ставаше „TeMAH"', transliterate('ТеМАХ') === 'TeMAH',
      transliterate('ТеМАХ'));

    /* Вградената, приложена върху СУРОВАТА тема, както беше преди. */
    const surovi = kiril.map(function (t) { return { t: t, out: inlineQP(t.s) }; });
    ok('вградената слага литерален интервал вътре в encoded word',
      surovi.some(function (x) { return / /.test(x.out.slice(10, -2)); }));
    ok('вградената слага меко пренасяне вътре в encoded word',
      surovi.some(function (x) { return /=\r\n/.test(x.out); }));
    ok('вградената надхвърля 75 символа',
      surovi.some(function (x) { return x.out.replace(/=\r\n/g, '').length > 75; }));
    ok('нито една кирилска тема не оцелява по стария път',
      surovi.every(function (x) { return decodeHeader(wireHeader(x.t.s)) !== x.t.s; }));
  }

  section('Изходният файл');
  {
    ok('encodeSubject() се подава на client.send', /subject:\s*encodeSubject\(subject\)/.test(src));
    ok('transliterate() вече НЕ се вика за темата', !/subject:\s*transliterate\(/.test(src));
    ok('transliterate() обаче стои във файла (връщането е един ред)',
      /function transliterate\(/.test(src));
    ok('коментарът обяснява защо стои', /НЕ СЕ ВИКА от 23\.08\.2026/.test(src));
    ok('тялото не е пипано — base64Part и mimeContent са на място',
      /function base64Part\(/.test(src) && /mimeContent:\s*\[/.test(src));
    /* Деплойът минава през JSON. Напише ли някой "\u0000" в регекс тук,
       живият файл получава СУРОВ NUL байт и се разминава с репото. Случи се
       веднъж, на 23.08.2026 — затова се заковава. */
    ok('няма сурови контролни байтове в изходния файл', (function () {
      for (var i = 0; i < src.length; i++) {
        var c = src.charCodeAt(i);
        if (c < 9 || (c > 13 && c < 32) || c === 127) { return false; }
      }
      return true;
    })());
    ok('проверката за ASCII е с цикъл, не с регекс с escape-и',
      /function hasNonAscii\(/.test(src) && /charCodeAt\(i\) > 127/.test(src));

    ok('push частта е непокътната',
      src.indexOf('https://api.onesignal.com/notifications') > 0 &&
      /headings:\s*\{\s*bg:\s*body\.title/.test(src));
  }

  report();
})();
