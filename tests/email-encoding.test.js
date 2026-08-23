/* Кодирането на тялото в resend-email (supabase/functions/resend-email/send-email.ts).

   ЗАЩО СЪЩЕСТВУВА ТОЗИ ТЕСТ
   Кирилицата в писмата се чупеше на случайни места — по един-два символа в
   писмо. Причината се оказа в denomailer@1.6.0, не в нашия код, и я хванахме
   чак когато я репродуцирахме върху истинския HTML на вечерния оборот:

     1. Липсва SMTP dot-stuffing (RFC 5321 §4.5.2). quotedPrintableEncode()
        пренася на 74 символа; падне ли прекъсването точно преди точка, редът
        започва с '.' и приемащият сървър я маха мълчаливо.
        "Оборот 19.08.2026 (сряда)" -> "Оборот 1908.2026 (сряда)".
     2. Цикълът за пренасяне отрязва 1–2 символа, когато границата падне вътре
        в "=XX" escape, и ги връща през `offset` в началото на следващия ред.
        Но последното парче, `encodedData.slice(lines * 74)`, НЕ прилага offset
        и тези символи изчезват. "ТеМАХ Портал" -> "ТеМАХ Порта?b".

   Поправката от 17.08.2026 (content_encoding: 'base64' на SMTPClient) беше
   без ефект — такава опция в denomailer няма и resolveClientOptions() я
   изхвърля мълчаливо. Затова тялото вече се кодира при нас, в base64, и се
   подава през `mimeContent`, което библиотеката препредава дословно.

   КАКВО ЗАКОВАВА ТЕСТЪТ
     1. base64Part() от живия .ts файл, прекарана през симулация на целия
        SMTP път (сглобяване на DATA + dot-unstuffing от сървъра + MIME
        разбор), връща подаденото БАЙТ В БАЙТ — включително 10 KB чиста
        кирилица, емоджи и редове, започващи с точка;
     2. нито един ред от тялото не започва с '.', тоест дефект 1 е невъзможен
        по конструкция;
     3. РЕГРЕСИОНЕН ЯКОР: същите входове, прекарани през точния пренос на
        стария енкодер на denomailer, СЕ ЧУПЯТ. Ако някой ден върне стария
        път, този тест ще падне тук, а не в пощата на потребителя;
     4. изходният файл наистина ползва mimeContent и вече не подава
        content/html, нито мъртвата опция content_encoding.

   Пускане:  node tests/email-encoding.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const SRC = path.join(ROOT, 'supabase/functions/resend-email/send-email.ts');
const src = fs.readFileSync(SRC, 'utf8');

/* ── Изваждаме РЕАЛНИТЕ функции от .ts файла ──
   Нарочно не преписваме base64Part() тук: тестът трябва да проверява това,
   което ще се деплойва, а не втора нейна котия, която може да се разминат. */
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
  const body = src.slice(open, i + 1);
  /* Само анотациите, които реално се срещат в тези две функции. Ако някой
     добави нов тип, new Function() ще гръмне и тестът ще падне шумно. */
  const sig = src.slice(start, open)
    .replace(/:\s*string\b/g, '')
    .replace(/\)\s*$/, ')');
  const js = (sig + body).replace(/\bvar\s+(\w+)\s*:\s*string\[\]/g, 'var $1');
  if (/:\s*[A-Za-z]/.test(js.split('{')[0])) {
    throw new Error('останала TS анотация в сигнатурата на ' + name);
  }
  return js;
}

let base64Part, htmlToPlainText;
try {
  const factory = new Function(
    extractFn('base64Part') + '\n' + extractFn('htmlToPlainText') +
    '\nreturn { base64Part: base64Part, htmlToPlainText: htmlToPlainText };');
  const m = factory();
  base64Part = m.base64Part;
  htmlToPlainText = m.htmlToPlainText;
} catch (e) {
  console.error('❌ не мога да извадя функциите от ' + SRC + ': ' + e.message);
  process.exit(1);
}

/* ══════════ Симулация на пътя, по който писмото стига до пощата ══════════ */

/* Как denomailer@1.6.0 (client/basic/client.ts:204-223) записва частите на
   тялото в DATA. writeCmd(...args) слепва аргументите с интервал и добавя
   CRLF — затова "content" и "\r\n" излизат като `content + " \r\n" + "\r\n"`. */
function buildDataBody(parts, boundary) {
  let out = '';
  parts.forEach(function (p) {
    out += '--' + boundary + '\r\n';
    out += 'Content-Type: ' + p.mimeType + '\r\n';
    out += 'Content-Transfer-Encoding: ' + p.transferEncoding + '\r\n\r\n' + '\r\n';
    out += p.content + ' \r\n' + '\r\n';
  });
  out += '--' + boundary + '--\r\n' + '\r\n';
  return out;
}

/* Приемащият SMTP сървър маха водеща точка от всеки ред на DATA (RFC 5321
   §4.5.2). denomailer не прави dot-stuffing преди изпращане, тоест всяка
   такава точка се губи безвъзвратно. */
function smtpDotUnstuff(body) {
  return body.split('\r\n').map(function (l) {
    return l.charAt(0) === '.' ? l.slice(1) : l;
  }).join('\r\n');
}

/* Клиентът на получателя: намира частта, разкодира я. */
function readPart(wire, boundary, mimeStartsWith) {
  const blocks = wire.split('--' + boundary);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const head = b.indexOf('\r\n\r\n');
    if (head < 0) continue;
    const headers = b.slice(0, head);
    if (headers.indexOf('Content-Type: ' + mimeStartsWith) < 0) continue;
    const enc = /Content-Transfer-Encoding:\s*(\S+)/.exec(headers);
    const raw = b.slice(head + 4);
    if (!enc || enc[1] !== 'base64') return { encoding: enc ? enc[1] : null, text: null };
    return {
      encoding: 'base64',
      text: Buffer.from(raw.replace(/[^A-Za-z0-9+/=]/g, ''), 'base64').toString('utf8'),
    };
  }
  return null;
}

/* Пълна обиколка: кодиране -> DATA -> сървър -> поща. */
function roundTrip(html) {
  const parts = [
    base64Part('text/plain; charset="utf-8"', htmlToPlainText(html)),
    base64Part('text/html; charset="utf-8"', html),
  ];
  const boundary = 'message100';
  const wire = smtpDotUnstuff(buildDataBody(parts, boundary));
  return {
    parts: parts,
    wire: wire,
    html: readPart(wire, boundary, 'text/html'),
    plain: readPart(wire, boundary, 'text/plain'),
  };
}

/* ── Точен пренос на denomailer@1.6.0 config/mail/encoding.ts ──
   Ползва се САМО за регресионния якор: доказва, че тестът щеше да хване
   стария дефект, а не че поправката „изглежда наред". */
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
  ret += encodedData.slice(lines * 74); /* <- offset НЕ се прилага: дефект 2 */
  return ret;
}
function qpDecode(s) {
  s = s.split('=\r\n').join('');
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2;
    } else out.push(s.charCodeAt(i));
  }
  return Buffer.from(out).toString('utf8');
}
function oldPathResult(html) {
  return qpDecode(smtpDotUnstuff(denomailerQP(html)));
}

/* ══════════ Входните данни ══════════ */

/* 10 KB чиста кирилица — приемният критерий. Номерирани блокове по 100
   символа, за да се вижда на кой отстъп би паднала повреда. */
function cyrillic10k() {
  const az = 'абвгдежзийклмнопрстуфхцчшщъьюя';
  let s = '';
  for (let blok = 0; s.length < 10240; blok++) {
    let line = '[' + String(blok).padStart(4, '0') + '] ';
    while (line.length < 100) line += az[(line.length + blok) % az.length];
    s += line + '\n';
  }
  return s.slice(0, 10240);
}

/* Точните низове, които се счупиха на 23.08.2026, в документ със същата
   форма като истинския вечерен отчет: същите inline стилове (те носят
   десетичните точки в .4px и rgba(...,.12), заради които изобщо се появяват
   редове с водеща точка) и достатъчно редове, за да има смисъл пренасянето.
   Данните са измислени — тестът не носи оборот на реални обекти. */
function oborotShell(redove) {
  const style = 'padding:7px 8px;color:#1F2937;font-weight:600;';
  let t = '';
  for (let i = 0; i < redove; i++) {
    t += '<tr style="border-bottom:1px solid #eef1f6;">' +
      '<td style="' + style + '">Обект ' + (i + 1) + ' — Град ' + (i + 1) + '</td>' +
      '<td align="right" style="padding:7px 8px;color:#1F2937;font-weight:700;">' +
      (10 + i) + ' ' + (100 + i * 7) + ',' + (10 + i) + '</td>' +
      '<td align="right" style="padding:7px 8px;color:#4B5563;">' + (5 + i) + ' 200,00</td>' +
      '<td align="right" style="padding:7px 8px;color:#4B5563;">' + (40 + i) + '%</td>' +
      '<td align="right" style="padding:7px 8px;"><span style="color:#2F9E5C;font-weight:700;">+' +
      (i + 1) + ',' + i + '%</span></td></tr>';
  }
  return '<!DOCTYPE html><html lang="bg"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:20px;background:#e8ecf3;font-family:-apple-system,\'Segoe UI\',Arial,sans-serif;">' +
    '<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 18px rgba(30,39,97,.12);">' +
    '<div style="background:#1E2761;padding:24px;">' +
    '<p style="color:#CADCFC;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin:0 0 6px;">ТеМАХ Портал</p>' +
    '<h1 style="color:#fff;font-size:21px;margin:0 0 4px;font-weight:700;">💰 Оборот 19.08.2026 (сряда)</h1>' +
    '<p style="color:#9DB3E8;font-size:13px;margin:0;">Всички обекти</p>' +
    '</div><div style="padding:20px;">' +
    '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin:14px 0 8px;">По обекти</div>' +
    '<table role="presentation" style="width:100%;border-collapse:collapse;font-size:12px;">' + t + '</table>' +
    '<div style="background:#FDEEEA;border:1px solid #F3C6BA;border-radius:8px;padding:12px 14px;margin-bottom:14px;">' +
    '<div style="font-size:11px;font-weight:800;color:#B4442E;text-transform:uppercase;letter-spacing:.4px;">Изисква внимание</div>' +
    '<div style="font-size:13px;color:#B4442E;"><b>Не са подали оборот:</b> Търговище, Шумен, Разград</div></div>' +
    '<div style="margin-top:14px;font-size:11px;color:#94a3b8;font-style:italic;">Вечерната сводка е информативна. Счетоводните отчети се попълват на следващия ден и минават по своя ред.</div>' +
    '</div><div style="padding:18px 24px 24px;text-align:center;">' +
    '<div style="font-size:11px;color:#9aa4b2;margin-top:14px;">Автоматичен отчет · ТеМАХ Портал</div>' +
    '</div></div></body></html>';
}
const OBOROT_SHELL = oborotShell(18);

const CASES = [
  { name: '10 KB чиста кирилица (приемният критерий)', html: cyrillic10k() },
  { name: 'обвивката на вечерния оборот с двата счупени низа', html: OBOROT_SHELL },
  { name: 'емоджи и 4-байтови символи', html: '<p>💰📦✅ Оборот — 1 234,56 лв. ✓</p>' },
  { name: 'редове, започващи с точка', html: '<pre>.точка в началото\n.още една\n..две</pre>' },
  { name: 'много знаци за равно (QP escape-ове)', html: '<p>' + '=='.repeat(200) + ' край</p>' },
  { name: 'един кирилски символ', html: 'я' },
  { name: 'дълъг ред без нито един интервал', html: '<p>' + 'абвгдежзийклмнопрстуфхцчшщъ'.repeat(120) + '</p>' },
];

/* ══════════ Проверките ══════════ */
(function () {
  section('Байт в байт през симулиран SMTP път');
  CASES.forEach(function (c) {
    const r = roundTrip(c.html);
    ok(c.name + ' — HTML частта се връща непокътната',
      r.html && r.html.text === c.html,
      r.html ? 'дължина подадена ' + c.html.length + ', получена ' + r.html.text.length +
        '; първо разминаване на отстъп ' + firstDiff(c.html, r.html.text) : 'няма text/html част');
    const plainIn = htmlToPlainText(c.html);
    ok(c.name + ' — plain-text частта се връща непокътната',
      r.plain && r.plain.text === plainIn,
      r.plain ? 'първо разминаване на отстъп ' + firstDiff(plainIn, r.plain.text) : 'няма text/plain част');
    ok(c.name + ' — байтово равенство, не само низово',
      r.html && Buffer.from(r.html.text, 'utf8').equals(Buffer.from(c.html, 'utf8')));
  });

  section('Дефект 1: нито един ред не може да започне с точка');
  CASES.forEach(function (c) {
    const parts = [
      base64Part('text/plain; charset="utf-8"', htmlToPlainText(c.html)),
      base64Part('text/html; charset="utf-8"', c.html),
    ];
    const bad = parts.reduce(function (acc, p) {
      return acc.concat(p.content.split('\r\n').filter(function (l) { return l.charAt(0) === '.'; }));
    }, []);
    ok(c.name + ' — няма ред с водеща точка', bad.length === 0, bad.slice(0, 3).join(' | '));
  });

  section('Форма на base64 частите');
  {
    const p = base64Part('text/html; charset="utf-8"', cyrillic10k());
    const lines = p.content.split('\r\n');
    ok('transferEncoding е base64', p.transferEncoding === 'base64', String(p.transferEncoding));
    ok('нито един ред не надхвърля 76 символа (RFC 2045)',
      lines.every(function (l) { return l.length <= 76; }),
      'най-дълъг: ' + Math.max.apply(null, lines.map(function (l) { return l.length; })));
    ok('всички редове без последния са кратни на 4 — не се цепи base64 група',
      lines.slice(0, -1).every(function (l) { return l.length % 4 === 0; }));
    ok('само азбуката на base64', /^[A-Za-z0-9+/=\r\n]*$/.test(p.content));
    ok('няма точка в тялото изобщо', p.content.indexOf('.') < 0);
  }

  section('Изместване на границата — 200 варианта на едно и също писмо');
  {
    /* Старият дефект се проявяваше през един-два символа изместване. Караме
       границата да мине през всяка възможна позиция. */
    let lom = 0, primer = '';
    for (let pad = 0; pad < 200; pad++) {
      const h = OBOROT_SHELL.slice(0, 300) + ' '.repeat(pad) + OBOROT_SHELL.slice(300);
      const r = roundTrip(h);
      if (!r.html || r.html.text !== h) { lom++; if (!primer) primer = 'pad=' + pad; }
    }
    ok('всичките 200 варианта се връщат непокътнати', lom === 0,
      lom + ' счупени, първи: ' + primer);
  }

  section('Регресионен якор: старият път СЕ ЧУПИ на същите входове');
  {
    /* Ако това мине, значи симулацията не проверява нищо — точно затова е тук. */
    const dot = OBOROT_SHELL;
    let broken = 0;
    for (let pad = 0; pad < 200; pad++) {
      const h = dot.slice(0, 300) + ' '.repeat(pad) + dot.slice(300);
      if (oldPathResult(h) !== h) broken++;
    }
    ok('старият quoted-printable път чупи поне един от 200-те варианта',
      broken > 0, 'счупени: ' + broken + ' от 200');
    ok('и по-точно: чупи ги на десетки места, не веднъж случайно',
      broken > 20, 'счупени: ' + broken + ' от 200');

    /* Дефект 1 се проявява само когато границата на 74-я символ падне точно
       преди точка — затова го търсим из същите 200 варианта, а не в един. */
    let sTochka = 0;
    for (let pad = 0; pad < 200; pad++) {
      const h = dot.slice(0, 300) + ' '.repeat(pad) + dot.slice(300);
      if (denomailerQP(h).split('\r\n').some(function (l) { return l.charAt(0) === '.'; })) sTochka++;
    }
    ok('старият път произвежда редове с водеща точка (дефект 1)',
      sTochka > 0, 'варианти с такъв ред: ' + sTochka + ' от 200');
  }

  section('Изходният файл ползва новия път');
  {
    /* Регексът е закотвен в началото на реда: в коментара горе низът пак се
       среща, но там е зад "//" и не е код. */
    ok('мъртвата опция content_encoding вече не се подава на SMTPClient',
      !/^\s*content_encoding\s*:/m.test(src));
    ok('client.send получава mimeContent',
      /mimeContent:\s*\[/.test(src));
    ok('text/plain е ПРЕДИ text/html (multipart/alternative показва последната част)',
      src.indexOf("base64Part('text/plain") > 0 &&
      src.indexOf("base64Part('text/plain") < src.indexOf("base64Part('text/html"));
    ok('вече не се подава content: към client.send',
      !/\n\s+content:\s*htmlToPlainText/.test(src));
    ok('вече не се подава html: към client.send',
      !/\n\s+html:\s*html,/.test(src));
    ok('push частта е непокътната — OneSignal се вика както преди',
      src.indexOf('https://api.onesignal.com/notifications') > 0 &&
      /headings:\s*\{\s*bg:\s*body\.title/.test(src));
    /* Кодирането на ТЕМАТА се смени на 23.08.2026 (encodeSubject, RFC 2047) и
       се покрива от tests/email-subject-rfc2047.test.js. Тук проверяваме само
       това, което засяга ТЯЛОТО: че двата пътя не са се слели — темата има
       свои правила (75 символа на encoded word) и base64Part(), която реже на
       76, би дала невалидно заглавие. */
    ok('темата НЕ се строи с помощниците на тялото',
      !/subject:\s*base64Part\(/.test(src));
    ok('темата минава през своята функция',
      /subject:\s*encodeSubject\(subject\)/.test(src));
    ok('прикачените файлове остават base64 с encoding: base64',
      /encoding:\s*'base64'/.test(src));
  }

  report();
})();

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return String(i) + ' (' + JSON.stringify(a.slice(i, i + 20)) + ' vs ' + JSON.stringify(b.slice(i, i + 20)) + ')';
  return a.length === b.length ? 'няма' : String(n) + ' (различна дължина)';
}
