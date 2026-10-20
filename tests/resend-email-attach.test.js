/* resend-email: прикачени файлове без „CPU Time exceeded" (20.10.2026).

   ЗАЩО СЪЩЕСТВУВА ТОЗИ ТЕСТ
   20.10.2026, 09:29–09:31 — Цветелина пет пъти не успя да прати писмо до
   доставчик от Разлики (бланка Раднево 180508904, 4,7 MB прикачени PDF).
   resend-email v60 падаше с „CPU Time exceeded". Измерено с истинския
   denomailer 1.6.0 срещу фалшив SMTP: 4 000 ms CPU (лимит 2 000), от тях
   3 287 ms в QUE.next — всеки 75-знаков ред base64 отиваше като отделен
   запис през опашка със splice(0,1), тоест квадратично.

   Поправката: denomailer е локално копие (supabase/functions/resend-email/
   vendor/denomailer@1.6.0/) с ЕДНА промяна — готова MIME част (поле
   mimePart) се пише с един запис. Частта се сглобява в send-email.ts от
   чистата функция attachmentMimePart(): клиентският base64 се реже на редове
   по 76 знака, без разкодиране. Името на файла — RFC 2231 (filename*) +
   encoded word (name=); дотогава denomailer го пишеше суров UTF-8.

   КАКВО ЗАКОВАВА
     1. isCleanBase64 — чист base64 минава, всичко друго — не;
     2. attachmentMimePart върху синтетични PDF/JPEG/всички 256 байта и
        гранични дължини: байтовете след декодиране съвпадат; ред <= 76;
        никой ред не започва с точка; заглавията <= 78;
     3. имена: кирилица с интервали (истинското „про м с10102026.pdf"),
        дълго име на парчета, емоджи, ASCII с кавички, CR/LF инжекция,
        празно — декодират се обратно точно;
     4. истински PDF и JPEG от storage (бланка a6fe73f2 и снимка от
        differences/) — байт в байт; без мрежа секцията се прескача с ⚠️;
     5. копието на denomailer: всеки файл = upstream по SHA-256, а client.ts
        = upstream след махане на ЕДИНСТВЕНИЯ блок TEMAX-PATCH; README-то
        носи същия diff;
     6. Deno.serve: импортът е от vendor/, mimePart идва от
        attachmentMimePart, нечист base64 -> 400 преди SMTP; push частта е
        байт в байт като във v60;
     7. E2E (само ако има deno и git история): истинският handler срещу
        фалшив SMTP — без прикачени писмото е байт в байт като от v60;
        истинските файлове се декодират байт в байт; нечист base64 -> 400.

   МУТАЦИИ (пуснати ръчно на 20.10.2026, всяка пада):
     M1 — редове по 77 вместо 76 (`j += 76` -> `j += 77` в attachmentMimePart)
          -> секция 2 пада („ред <= 76").
     M2 — без почистване на CR/LF в cleanAttachmentName (`c < 32` -> `c < 0`)
          -> секция 3 пада („CR/LF махнати").
     M3 — RFC 2231 без %-кодиране (`if (plain)` -> `if (true)` в rfc2231Token)
          -> секция 3 пада („filename* е чист ASCII").
     M4 — isCleanBase64 без проверка за дължина (`s.length % 4 === 0 &&` махнато)
          -> секция 1 пада („дължина, некратна на 4").

   Пускане:  node tests/resend-email-attach.test.js .
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');
const { ok, section, report } = require('../.claude/skills/tmax-jsdom-test/harness');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const FN_DIR = path.join(ROOT, 'supabase/functions/resend-email');
const SRC = path.join(FN_DIR, 'send-email.ts');
const VENDOR = path.join(FN_DIR, 'vendor/denomailer@1.6.0');
const src = fs.readFileSync(SRC, 'utf8');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

/* Същият извличач като в mail-from-name.test.js: реалната функция от .ts,
   с махнати анотации на типовете. */
function extractFn(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('няма function ' + name + '() в ' + SRC);
  let depth = 0, i = src.indexOf('{', src.indexOf(')', start));
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  if (depth !== 0) throw new Error('несбалансирани скоби в ' + name + '()');
  const body = src.slice(start, i + 1);
  const brace = body.indexOf('{', body.indexOf(')'));
  const sig = body.slice(0, brace)
    .replace(/\)\s*:[^{]*$/, ') ')
    .replace(/:\s*(unknown|string|boolean|number)\b/g, '');
  const rest = body.slice(brace)
    .replace(/:\s*(string|number)\[\]/g, '')
    .replace(/:\s*Record<string, string>/g, '');
  return sig + rest;
}

let E = null;
try {
  const names = ['hasNonAscii', 'encodeSubject', 'isCleanBase64', 'cleanAttachmentName',
    'rfc2231Token', 'rfc2231Filename', 'attachmentMimePart', 'guessContentType'];
  E = new Function(names.map(extractFn).join('\n') +
    '\nreturn {' + names.map(n => n + ':' + n).join(',') + '};')();
} catch (e) {
  console.log('⚠️ извличането от .ts гръмна: ' + e.message);
}

/* ── Разбор на частта, независим от кода под тест ── */
function splitPart(part) {
  const sep = part.indexOf('\r\n\r\n');
  return { head: part.slice(0, sep), body: part.slice(sep + 4) };
}
function unfold(head) { return head.replace(/\r\n[ \t]/g, ' '); }
function decodeFilename(head) {
  const un = unfold(head);
  const segs = [];
  const re = /filename\*(\d+)?\*?=([^;\r\n]+)/g;
  let m;
  while ((m = re.exec(un))) segs.push([m[1] === undefined ? 0 : +m[1], m[2].trim()]);
  if (segs.length) {
    const joined = segs.sort((a, b) => a[0] - b[0]).map(s => s[1]).join('');
    if (!/^UTF-8''/i.test(joined)) return '<без charset>';
    return Buffer.from(joined.replace(/^UTF-8''/i, '').replace(/%([0-9A-F]{2})/gi,
      (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
  }
  const q = /filename="((?:[^"\\]|\\.)*)"/.exec(un);
  return q ? q[1].replace(/\\(.)/g, '$1') : null;
}
function decodeNameParam(head) {
  const un = unfold(head);
  const q = /name="((?:[^"\\]|\\.)*)"/.exec(un);
  if (!q) return null;
  const v = q[1];
  if (!/=\?UTF-8\?B\?/i.test(v)) return v.replace(/\\(.)/g, '$1');
  return v.replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?UTF-8\?B\?([^?]*)\?=/gi, (_, b) => Buffer.from(b, 'base64').toString('utf8'));
}
function checkPart(label, part, bytes, name) {
  const { head, body } = splitPart(part);
  const got = Buffer.from(body.replace(/\r\n/g, ''), 'base64');
  ok(label + ': байтовете след декодиране съвпадат', Buffer.compare(got, bytes) === 0,
    got.length + ' срещу ' + bytes.length);
  const bl = body.split('\r\n');
  ok(label + ': ред от тялото <= 76', bl.every(l => l.length <= 76),
    'най-дълъг ' + Math.max(...bl.map(l => l.length)));
  ok(label + ': всички редове освен последния са точно 76', bl.slice(0, -1).every(l => l.length === 76));
  ok(label + ': никой ред не започва с точка', part.split('\r\n').every(l => l.charAt(0) !== '.'));
  ok(label + ': само CRLF, без голи LF/CR', !/[^\r]\n|\r(?!\n)/.test(part));
  if (name !== undefined) {
    ok(label + ': filename се декодира точно', decodeFilename(head) === name, JSON.stringify(decodeFilename(head)));
    ok(label + ': name= се декодира точно', decodeNameParam(head) === name, JSON.stringify(decodeNameParam(head)));
  }
  return { head, body };
}

/* Синтетични файлове с истински сигнатури — PDF и JPEG. */
function bytesOf(n, seed, prefix) {
  const b = Buffer.alloc(n);
  let x = seed >>> 0;
  for (let i = 0; i < n; i++) { x = (x * 1664525 + 1013904223) >>> 0; b[i] = x >>> 24; }
  if (prefix) prefix.copy(b, 0, 0, Math.min(prefix.length, n));
  return b;
}
const PDF = bytesOf(100003, 7, Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1'));
const JPEG = bytesOf(54321, 9, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]));
const ALL = Buffer.from(Array.from({ length: 256 * 3 }, (_, i) => i % 256));

/* Истинските файлове в storage (публичен bucket). SHA-256 — свалени на
   20.10.2026; разминаване значи, че файлът е подменен, не че кодът е счупен. */
const STORAGE = 'https://xiwkdiqqplgdcrkewgtv.supabase.co/storage/v1/object/public/bulletin-files/differences/';
const REAL = [
  { file: '1791635987759_dgitr9.pdf', name: 'про м10102026.pdf', size: 1296289,
    sha: 'b6d33931d6c707977ff52ad48c8ff23d6f3ceb6ae83d8b62160f6150913d048c' },
  { file: '1792478437086_ube0wc.jpg', name: 'про м с10102026.jpg', size: 135676,
    sha: '59db875d7f12612f2ebdec517820650af6f816c3becdd1f76505240e94626954' },
];
const CACHE = path.join(os.tmpdir(), 'tmax-mail-attach');

async function fetchReal(r) {
  const p = path.join(CACHE, r.file);
  if (fs.existsSync(p) && sha(fs.readFileSync(p)) === r.sha) return p;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30000);
  try {
    const res = await fetch(STORAGE + r.file, { signal: ac.signal });
    if (!res.ok) return null;
    const b = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(p, b);
    return p;
  } catch (e) { return null; } finally { clearTimeout(t); }
}

/* Upstream denomailer@1.6.0 от deno.land, SHA-256 (20.10.2026). */
const UPSTREAM = {
  'client/basic/QUE.ts': '5af1dfcc5814bf4542f098908ac1fdd8a1a1c2b1597138a121c95eaa791315d0',
  'client/basic/client.ts': '462e4db45ae218647812ceae720d55ea33e0e928f9138fee9da5913cbb1e20f9',
  'client/basic/connection.ts': '68de68d7551d8303629905c2b7581cb09b45646e530ce93a5786ca1aba61055c',
  'client/basic/transforms.ts': 'e630a23d24e9b397e231ae8796c0a0080770ac6f5ab9bffc105d3717706e62c9',
  'client/mod.ts': '8ec4c25d9586f83f8629768311a077eaf03b1490dcb872030ba2e27fadb674d8',
  'client/pool.ts': '0466e69ca8959aa85501cc6b30d7f5fd8e43b0a6ac88ecc60dab71081e801bae',
  'client/worker/worker.ts': 'a4c3a3e2e1fde0967817ece7c345a565eb44a7312acf8d46ce620d4ff4443b31',
  'config/client.ts': '302f5c18fbb5531b5615613084b86d44120acc210e072f4135e431fa27fc4526',
  'config/mail/attachments.ts': '1f357bddc9d5e813c3f647498db81a165a1a8a7163116c58dc10cf01427fd81e',
  'config/mail/content.ts': '3925d4c3baaabed4e08933159d34b1450e6426b35a5bc323a0666780bef20192',
  'config/mail/email.ts': 'bb0ca104bf9cb54af6613a04b3f8cb05290f4fb012e7113f1d050cab10226a7c',
  'config/mail/encoding.ts': '0bc5983ada3b902333925cdca225f8ea5e28fffbc2f1bd2b0ccb9a423f6f7fcc',
  'config/mail/headers.ts': 'ce94874beb5a1a7248b5b91bf1ae3b3aed2d4c0541f3f448f2bbfad6c8f570ee',
  'config/mail/mod.ts': 'a7fafa3386a45a585d7983d816b09ddc28b2f2b84097a614f1e38685b1f62868',
  'deps.ts': '12bef188bb2a490fedc82ac1889f3d438e8a15887c423b045fee532b31a43102',
  'mod.ts': '71a197dff098194ab53691abd3c9d22a276ef04e1382eb85f5632dbcb5a83bf3',
};
/* Единствената промяна — дословно, с LF. */
const PATCH = [
  '        // TEMAX-PATCH: a ready MIME part goes out in ONE write (see ../../README.md)',
  '        const mimePart = (attachment as { mimePart?: string }).mimePart;',
  '        if (typeof mimePart === "string") {',
  '          this.#connection.writeCmd(mimePart);',
  '          continue;',
  '        }',
  ''
].join('\n');

/* push частта на v60 (7a48bd5), от "if (type === 'push') {" до коментара за
   имейла — SHA-256. Поправката не я пипа. */
const PUSH_SHA_V60 = '092586269cb8dbea510cf7a4ff4f202027536551f9c34f930e521c8b259729b2';

(async function run() {

  section('1. isCleanBase64');
  if (ok('функциите са извлечени от .ts', !!E)) {
    ok('чист base64 с == минава', E.isCleanBase64('QUJD' + 'QQ=='));
    ok('празен низ минава (празен файл)', E.isCleanBase64(''));
    ok('истински PDF в base64 минава', E.isCleanBase64(PDF.toString('base64')));
    ok('префикс data: е отказан', !E.isCleanBase64('data:application/pdf;base64,QUJD'));
    ok('нов ред вътре е отказан', !E.isCleanBase64('QUJD\r\nQUJD'));
    ok('интервал е отказан', !E.isCleanBase64('QUJD QUJD'));
    ok('= в средата е отказан', !E.isCleanBase64('QU=DQUJD'));
    ok('три = накрая са отказани', !E.isCleanBase64('Q===' ));
    ok('дължина, некратна на 4, е отказана', !E.isCleanBase64('QUJDQ'));
    ok('base64url (- и _) е отказан', !E.isCleanBase64('QU-_'));
    ok('не-низ е отказан', !E.isCleanBase64(undefined) && !E.isCleanBase64(null) && !E.isCleanBase64(1234));
  }

  section('2. attachmentMimePart — байт в байт, редове, точки');
  if (E) {
    checkPart('PDF 100 003 B', E.attachmentMimePart('бланка.pdf', 'application/pdf', PDF.toString('base64')), PDF);
    checkPart('JPEG 54 321 B', E.attachmentMimePart('снимка.jpg', 'image/jpeg', JPEG.toString('base64')), JPEG);
    checkPart('всички 256 байта', E.attachmentMimePart('a.bin', 'application/octet-stream', ALL.toString('base64')), ALL);
    [0, 1, 2, 3, 56, 57, 58, 114].forEach(n => {
      const b = bytesOf(n, n + 1);
      checkPart(n + ' байта', E.attachmentMimePart('x.bin', 'application/octet-stream', b.toString('base64')), b);
    });
    const p = E.attachmentMimePart('a.pdf', 'application/pdf', 'QUJD');
    ok('Content-Transfer-Encoding: base64', /\r\nContent-Transfer-Encoding: base64\r\n\r\n/.test(p));
    ok('Content-Disposition: attachment', /\r\nContent-Disposition: attachment;\r\n/.test(p));
    ok('Content-Type с правилния тип', p.indexOf('Content-Type: application/pdf;\r\n') === 0);
    ok('без завършващ CRLF (denomailer го добавя)', !/\r\n$/.test(p));
    ok('guessContentType: pdf/jpg/неизвестно', E.guessContentType('a.PDF') === 'application/pdf' &&
      E.guessContentType('b.jpeg') === 'image/jpeg' && E.guessContentType('c.xyz') === 'application/octet-stream');
  }

  section('3. Имена на файлове');
  if (E) {
    const one = n => E.attachmentMimePart(n, 'application/pdf', 'QUJD');
    const realName = 'про м с10102026.pdf';
    const r = checkPart('кирилица с интервали', one(realName), Buffer.from('ABC'), realName);
    ok('filename* е чист ASCII', /^[\x20-\x7e\r\n]*$/.test(r.head), r.head);
    ok('filename* с UTF-8\'\' и %20 за интервала', /filename\*=UTF-8''[^ ]*%20/.test(r.head), r.head);
    ok('без суров filename= при кирилица', !/[^*]filename=/.test(r.head));
    ok('заглавни редове <= 78', r.head.split('\r\n').every(l => l.length <= 78));

    const longName = 'Снимка на палет с много дълго кирилско име за проверка на пренасянето 2026 😀.jpg';
    const lr = checkPart('дълго име с емоджи', one(longName), Buffer.from('ABC'), longName);
    ok('дълго име: на парчета filename*0*, filename*1*…', /filename\*0\*=UTF-8''/.test(lr.head) && /filename\*1\*=/.test(lr.head));
    ok('дълго име: заглавни редове <= 78', lr.head.split('\r\n').every(l => l.length <= 78),
      String(Math.max(...lr.head.split('\r\n').map(l => l.length))));
    ok('дълго име: парче не цепи %XX', !/%[0-9A-F]?;\r\n|%[0-9A-F]?$/m.test(lr.head));

    const q = 'photo "x" \\ 1.jpg';
    checkPart('ASCII с кавички и обратна черта', one(q), Buffer.from('ABC'), q);
    const plain = checkPart('просто ASCII', one('report.pdf'), Buffer.from('ABC'), 'report.pdf');
    ok('просто ASCII: filename="report.pdf"', /\r\n filename="report\.pdf"/.test(plain.head));

    const inj = one('a\r\nBcc: x@y.bg\r\n.pdf');
    ok('CR/LF махнати (няма нов заглавен ред Bcc)', !/\r\nBcc:/.test(inj), JSON.stringify(inj.slice(0, 120)));
    ok('CR/LF махнати: името се слепва', decodeFilename(splitPart(inj).head) === 'aBcc: x@y.bg.pdf');
    ok('празно име -> attachment', decodeFilename(splitPart(one('')).head) === 'attachment');
    ok('undefined -> attachment', decodeFilename(splitPart(one(undefined)).head) === 'attachment');
    ok('само интервали -> attachment', E.cleanAttachmentName('   ') === 'attachment');
  }

  section('4. Истински PDF и JPEG от storage — байт в байт');
  const realPaths = [];
  for (const r of REAL) {
    const p = await fetchReal(r);
    if (!p) { console.log('⚠️ ' + r.file + ' не се свали (няма мрежа?) — секцията за него е прескочена'); continue; }
    const b = fs.readFileSync(p);
    if (!ok(r.file + ': SHA-256 съвпада с закотвения', sha(b) === r.sha && b.length === r.size, sha(b))) continue;
    realPaths.push({ p, name: r.name });
    if (E) checkPart(r.file, E.attachmentMimePart(r.name, E.guessContentType(r.name), b.toString('base64')), b, r.name);
  }

  section('5. Копието на denomailer = upstream + един блок');
  {
    const seen = [];
    (function walk(d, rel) {
      fs.readdirSync(d).forEach(n => {
        const full = path.join(d, n), rp = rel ? rel + '/' + n : n;
        if (fs.statSync(full).isDirectory()) walk(full, rp);
        else seen.push(rp);
      });
    })(VENDOR, '');
    const code = seen.filter(f => f.endsWith('.ts')).sort();
    ok('точно 16-те файла на upstream', JSON.stringify(code) === JSON.stringify(Object.keys(UPSTREAM).sort()), code.join(','));
    ok('README.md има', seen.indexOf('README.md') >= 0);
    Object.keys(UPSTREAM).forEach(f => {
      const full = path.join(VENDOR, f);
      if (!fs.existsSync(full)) { ok(f + ' съществува', false); return; }
      let txt = fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n'); /* работното дърво може да е CRLF */
      if (f === 'client/basic/client.ts') {
        ok('client.ts: блокът TEMAX-PATCH е точно веднъж', txt.split(PATCH).length === 2);
        txt = txt.split(PATCH).join('');
      }
      ok(f + ' = upstream (SHA-256)', sha(txt) === UPSTREAM[f], sha(txt));
    });
    const readme = fs.existsSync(path.join(VENDOR, 'README.md')) ? fs.readFileSync(path.join(VENDOR, 'README.md'), 'utf8').replace(/\r\n/g, '\n') : '';
    ok('README носи дословно добавените редове', PATCH.replace(/\n$/, '').split('\n').every(l => readme.indexOf('+' + l) >= 0));
    ok('README казва източника и версията', readme.indexOf('https://deno.land/x/denomailer@1.6.0/') >= 0);
  }

  section('6. Deno.serve — свързване');
  {
    ok('импортът е от локалното копие', /import \{ SMTPClient \} from "\.\/vendor\/denomailer@1\.6\.0\/mod\.ts";/.test(src));
    ok('няма импорт от deno.land/x/denomailer', !/from\s+"https:\/\/deno\.land\/x\/denomailer/.test(src));
    ok('mimePart: attachmentMimePart(a.filename, ct, a.content)', /mimePart:\s*attachmentMimePart\(a\.filename,\s*ct,\s*a\.content\)/.test(src));
    const iVal = src.indexOf('if (!isCleanBase64(att.content))');
    const iSmtp = src.indexOf('new SMTPClient(');
    ok('проверката за base64 е преди SMTP клиента', iVal > 0 && iSmtp > iVal);
    ok('нечист base64 -> 400', /isCleanBase64\(att\.content\)\) \{\s*return Response\.json\([^;]*status: 400/.test(src));
    const a = src.indexOf("if (type === 'push') {"), b = src.indexOf('// ── ИЗПРАЩАНЕ НА ИМЕЙЛ', a);
    ok('push частта е байт в байт като във v60', a > 0 && b > a && sha(src.slice(a, b).replace(/\r\n/g, '\n')) === PUSH_SHA_V60);
    ok('from е непроменен: buildFrom(body.from_name, SMTP_FROM_NAME, SMTP_USER)',
      /from:\s*buildFrom\(body\.from_name,\s*SMTP_FROM_NAME,\s*SMTP_USER\)/.test(src));
    ok('няма u-escape в send-email.ts', !/\\u[0-9a-fA-F]{4}/.test(src));
  }

  section('7. E2E с истинския denomailer (deno + фалшив SMTP)');
  {
    const deno = spawnSync('deno', ['--version'], { encoding: 'utf8' });
    let old = null;
    try { old = execFileSync('git', ['-C', ROOT, 'cat-file', 'blob', '7a48bd5:supabase/functions/resend-email/send-email.ts'], { encoding: 'utf8' }); } catch (e) { old = null; }
    if (deno.status !== 0) console.log('⚠️ няма deno — E2E прескочен (в CI това е очаквано)');
    else if (!old) console.log('⚠️ няма git история за 7a48bd5 (shallow?) — E2E прескочен');
    else {
      const dir = path.join(os.tmpdir(), 'tmax-mail-attach-e2e');
      fs.mkdirSync(dir, { recursive: true });
      const oldPath = path.join(dir, 'send-email-v60.ts');
      fs.writeFileSync(oldPath, old);
      const out = path.join(dir, 'out.json');
      try { fs.unlinkSync(out); } catch (e) { /* няма */ }
      /* --no-lock: в корена има package.json и deno иначе пише deno.lock в репото. */
      const args = ['run', '-A', '--no-lock', '--node-modules-dir=none', path.join(ROOT, 'tests/resend-email-attach-e2e.deno.ts'), oldPath, SRC, out]
        .concat(realPaths.map(r => r.p + '=' + r.name));
      const run = spawnSync('deno', args, { encoding: 'utf8', cwd: dir, timeout: 170000 });
      if (!ok('E2E скриптът мина (exit 0)', run.status === 0, (run.stderr || '').slice(-600))) { /* */ }
      else {
        const R = JSON.parse(fs.readFileSync(out, 'utf8'));
        ok('без прикачени: писмото е байт в байт като от v60', R.noAttach.plainSame, JSON.stringify(R.noAttach));
        ok('без прикачени, с from_name/cc/reply_to: байт в байт като от v60', R.noAttach.fromNameSame);
        ok('и четирите изпращания 200', R.noAttach.statuses.every(s => s === 200), JSON.stringify(R.noAttach.statuses));
        ok('истинските файлове минаха (' + R.files.length + ')', R.files.length === realPaths.length && (!R.files.length || R.attachStatus === 200));
        R.files.forEach(f => {
          ok('E2E ' + f.name + ': байт в байт', f.bytesSame, f.len);
          ok('E2E ' + f.name + ': името се декодира точно', f.decodedName === f.name, f.decodedName);
          ok('E2E ' + f.name + ': ред <= 76, без водеща точка', f.maxBodyLine <= 76 && f.dotLines === 0);
        });
        ok('нечист base64 -> 400 и нищо не тръгва', R.badB64.status === 400 && R.badB64.sent === 0, JSON.stringify(R.badB64));
        ok('съобщението назовава файла', /снимка\.jpg/.test(R.badB64.message || ''));
      }
    }
  }

  report();
})();
