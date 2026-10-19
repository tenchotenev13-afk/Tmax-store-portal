/* „От" в писмата до доставчик от Разлики — име на изпращача (19.10.2026).

   ЗАЩО СЪЩЕСТВУВА ТОЗИ ТЕСТ
   От 19.10.2026 всички писма излизат от portal@temax.bg (дотогава от
   c.teneva@temax.bg). Доставчикът вече не вижда КОЙ му пише, затова
   sendDiffEmail() подава from_name = „<display_name> · ТеМАХ", а едж
   функцията resend-email го слага в From. Всички останали писма (отчети,
   оборот, известия, чеклист, товарни листи, преоценка) остават „TeMAX".

   Капанът в denomailer@1.6.0 (проверен с реалната библиотека срещу фалшив
   SMTP сървър, 19.10.2026): низ „Име <адрес>" минава през name.trim() и
   вграденото Q-кодиране, което оставя ЛИТЕРАЛНИ интервали вътре в encoded
   word — „Цветелина Тенева · ТеМАХ" излиза нечетимо. Затова buildFrom()
   връща ОБЕКТ {mail, name} с готови base64 encoded words от encodeSubject().

   КАКВО ЗАКОВАВА
     1. sendDiffEmail (реален клик) праща from_name на влезлия; при липсващо
        display_name — имейла; Reply-To и CC — непроменени;
     2. sendEmail без from_name НЕ слага полето (отчетите остават „TeMAX");
     3. cleanFromName/buildFrom от живия .ts: кирилица → encoded word, който
        минава дословно през пренесения parseSingleEmail/обектния клон и се
        декодира обратно; \r\n, <, > — махнати; празно → SMTP_FROM_NAME
        буквално както преди; 100 знака → 64;
     4. Deno.serve наистина вика buildFrom(body.from_name, …, SMTP_USER) —
        адресът не идва от клиента.

   МУТАЦИИ (пуснати ръчно на 19.10.2026, всяка пада):
     M1 — махнат from_name от sendEmail(...) в sendDiffEmail
          → секция 1 пада („from_name е …");
     M2 — без почистване на \r\n (в cleanFromName `c < 32` → `c < 0`)
          → секция 4 пада („CR/LF махнати");
     M3 — без fallback при празно (`if (!name)` → `if (false)`)
          → секция 5 пада („празно → SMTP_FROM_NAME").

   Пускане:  node tests/mail-from-name.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, ticks } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');

const LINE = {
  id: 'l-1', report_id: 'rep-1',
  store_name: 'Раднево', supplier: 'ТЕСИ ООД',
  material_code: '111', material_name: 'ПЛАНКА ЪГЛОВА',
  quantity: 5, quantity_supplier_doc: 3, quantity_received: 2,
  type: 'return', status: 'pending',
  comment: 'Липсват 3 броя', resolution_comment: null, attachments: [],
  credit_note_issued: false, difference_category: 'undelivered', unit: 'бр.',
  order_number: null, confirmed_date: null,
  resolved_by: null, resolved_at: null, completed_by: null, completed_at: null,
  warehouse_response: null, warehouse_comment: null, store_corrected_at: null
};
const REP = {
  id: 'rep-1', direction: 'supplier', store_name: 'Раднево',
  counterpart: 'ТЕСИ ООД', document_number: '180489966',
  doc_date: '2026-08-17', submitted_by: 'Склад Раднево',
  general_comment: '', created_at: '2026-08-17T08:14:18.000Z',
  photos: [], reviewed: false
};
const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'accounting', store_name: 'Централен офис', assigned_stores: ['Раднево']
};
const ADMIN = {
  email: 't.tenev@temax.bg', display_name: 'Тенчо Тенев',
  role: 'admin', store_name: 'Централен офис'
};

function env(user) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'email.js'],
    user: user,
    data: {
      stock_differences: [LINE], differences_reports: [REP],
      stock_returns: [], transport_orders: [], users: [], contacts: [], stores: []
    }
  });
  h.w.sdData = [JSON.parse(JSON.stringify(LINE))];
  h.w.diffReports = [JSON.parse(JSON.stringify(REP))];
  h.w.transportOrders = [];
  h.w.sdFilter = 'all';
  h.w.sdTypeFilter = 'all';
  h.w.sdDirTab = 'supplier';
  const origFetch = h.w.fetch;
  h.mail = [];
  h.w.fetch = function (url, init) {
    if (String(url).indexOf('/functions/v1/resend-email') >= 0) {
      let body = null;
      try { body = JSON.parse(init.body); } catch (e) { body = init.body; }
      h.mail.push(body);
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"ok":true}') });
    }
    return origFetch(url, init);
  };
  return h;
}

/* Отваря модала, попълва полетата и натиска истинския бутон „Изпрати". */
async function sendVia(h, fields) {
  h.w.openDiffEmailModal('rep-1');
  await ticks();
  const doc = h.w.document;
  Object.keys(fields).forEach(id => {
    const el = doc.getElementById(id);
    if (ok('полето #' + id + ' съществува', !!el)) el.value = fields[id];
  });
  const b = doc.getElementById('de-send-btn');
  if (!ok('бутонът #de-send-btn съществува', !!b)) return null;
  if (!guard('клик по „Изпрати" не хвърля', () => realClick(h.w, b))) return null;
  await ticks(); await ticks();
  ok('тръгна точно едно писмо', h.mail.length === 1, 'заявки: ' + h.mail.length);
  return h.mail[0] || null;
}

/* ── Едж функцията: вадим РЕАЛНИТЕ функции от .ts ── */
const SRC = path.join(ROOT, 'supabase/functions/resend-email/send-email.ts');
const src = fs.readFileSync(SRC, 'utf8');
function extractFn(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('няма function ' + name + '() в ' + SRC);
  let depth = 0, i = src.indexOf('{', src.indexOf(')', start));
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  if (depth !== 0) throw new Error('несбалансирани скоби в ' + name + '()');
  /* Само сигнатурата носи анотации, които тялото няма — режем ги там. */
  const body = src.slice(start, i + 1);
  const brace = body.indexOf('{', body.indexOf(')'));
  const sig = body.slice(0, brace)
    .replace(/\)\s*:[^{]*$/, ') ')
    .replace(/:\s*(unknown|string|boolean|number)\b/g, '');
  const rest = body.slice(brace)
    .replace(/:\s*(string|number)\[\]/g, '');
  return sig + rest;
}
let E = null;
try {
  E = new Function(
    ['hasNonAscii', 'encodeSubject', 'cleanFromName', 'buildFrom'].map(extractFn).join('\n') +
    '\nreturn { encodeSubject: encodeSubject, cleanFromName: cleanFromName, buildFrom: buildFrom };')();
} catch (e) {
  console.log('⚠️ извличането от .ts гръмна: ' + e.message);
}

/* Пренос на denomailer@1.6.0 config/mail/encoding.ts — само проверката дали
   quotedPrintableEncodeInline() пипа низа, и обектния клон на
   parseSingleEmail() (config/mail/email.ts): name БЕЗ trim. */
function qpInlineTouches(s) {
  return /[^\x00-\x7f]/.test(s) || s.startsWith('=?');
}
function decodeName(name) {
  return name.trim().replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?UTF-8\?B\?([^?]*)\?=/gi, (_, b) => Buffer.from(b, 'base64').toString('utf8'));
}

(async function run() {

  section('1. Разлики: Цветелина праща → from_name „Цветелина Тенева · ТеМАХ"');
  {
    const h = env(CVETI);
    const p = await sendVia(h, {
      'de-to': 'dostavchik@tesi.bg', 'de-cc': 'kopie@temax.bg',
      'de-reply': 'c.teneva@temax.bg'
    });
    if (p) {
      ok('from_name е „Цветелина Тенева · ТеМАХ"', p.from_name === 'Цветелина Тенева · ТеМАХ',
        JSON.stringify(p.from_name));
      ok('Reply-To е непроменен', p.reply_to === 'c.teneva@temax.bg', JSON.stringify(p.reply_to));
      ok('CC е непроменен', JSON.stringify(p.cc) === '["kopie@temax.bg"]', JSON.stringify(p.cc));
      ok('to е доставчикът', JSON.stringify(p.to) === '["dostavchik@tesi.bg"]');
      ok('няма поле за адрес на подателя (from) от клиента', !('from' in p));
    }
    h.close();
  }

  section('2. Разлики: admin праща → неговото име; без Reply-To/CC полетата липсват');
  {
    const h = env(ADMIN);
    const p = await sendVia(h, { 'de-to': 'dostavchik@tesi.bg', 'de-cc': '', 'de-reply': '' });
    if (p) {
      ok('from_name е „Тенчо Тенев · ТеМАХ"', p.from_name === 'Тенчо Тенев · ТеМАХ', JSON.stringify(p.from_name));
      ok('без cc при празно', !('cc' in p), JSON.stringify(p.cc));
      ok('без reply_to при празно', !('reply_to' in p), JSON.stringify(p.reply_to));
    }
    h.close();
  }

  section('3. Без display_name → имейлът; sendEmail без from_name не слага полето');
  {
    const h = env({ email: 'admin2@temax.bg', display_name: '', role: 'admin', store_name: 'Централен офис' });
    const p = await sendVia(h, { 'de-to': 'dostavchik@tesi.bg', 'de-cc': '', 'de-reply': '' });
    if (p) {
      ok('from_name е имейлът + „ · ТеМАХ"', p.from_name === 'admin2@temax.bg · ТеМАХ', JSON.stringify(p.from_name));
    }
    h.mail.length = 0;
    await h.w.sendEmail(['a@temax.bg'], 'ТеМАХ — Оборот', '<p>x</p>');
    ok('отчет без from_name: полето го няма', h.mail.length === 1 && !('from_name' in h.mail[0]),
      JSON.stringify(h.mail[0]));
    h.mail.length = 0;
    await h.w.sendEmail(['a@temax.bg'], 'x', '<p>x</p>', { from_name: '' });
    ok('празен from_name: полето го няма', h.mail.length === 1 && !('from_name' in h.mail[0]));
    h.mail.length = 0;
    await h.w.sendEmail(['a@temax.bg'], 'x', '<p>x</p>', { from_name: 'Иван · ТеМАХ' });
    ok('extra.from_name → payload.from_name', h.mail.length === 1 && h.mail[0].from_name === 'Иван · ТеМАХ');
    ok('RESEND_KEY вече го няма в глобалния обхват', typeof h.w.RESEND_KEY === 'undefined');
    ok('EMAIL_FROM вече го няма в глобалния обхват', typeof h.w.EMAIL_FROM === 'undefined');
    h.close();
  }

  const FALLBACK = 'TeMAX <portal@temax.bg>';
  const bf = v => E.buildFrom(v, 'TeMAX', 'portal@temax.bg');

  section('4. Едж: cleanFromName — почистване');
  if (ok('функциите са извлечени от .ts', !!E)) {
    ok('CR/LF махнати', E.cleanFromName('Зло\r\nBcc: a@b.c') === 'ЗлоBcc: a@b.c',
      JSON.stringify(E.cleanFromName('Зло\r\nBcc: a@b.c')));
    ok('< и > махнати', E.cleanFromName('Иван <x@y.bg>') === 'Иван x@y.bg',
      JSON.stringify(E.cleanFromName('Иван <x@y.bg>')));
    ok('" махнати', E.cleanFromName('"Иван"') === 'Иван');
    ok('табулация и NUL махнати', E.cleanFromName('А' + String.fromCharCode(9) + 'Б' + String.fromCharCode(0)) === 'АБ');
    ok('trim', E.cleanFromName('   Иван   ') === 'Иван');
    const long = 'Я'.repeat(100);
    ok('100 знака → 64', Array.from(E.cleanFromName(long)).length === 64,
      String(Array.from(E.cleanFromName(long)).length));
    ok('точно 64 → без промяна', E.cleanFromName('Я'.repeat(64)) === 'Я'.repeat(64));
    ok('емоджи не се цепи при рязане', Array.from(E.cleanFromName('😀'.repeat(70))).every(c => c === '😀'));
  }

  section('5. Едж: buildFrom — fallback буквално както преди');
  if (E) {
    ok('празно → SMTP_FROM_NAME', bf('') === FALLBACK, JSON.stringify(bf('')));
    ok('undefined → SMTP_FROM_NAME', bf(undefined) === FALLBACK);
    ok('null → SMTP_FROM_NAME', bf(null) === FALLBACK);
    ok('само интервали и \\r\\n → SMTP_FROM_NAME', bf('  \r\n ') === FALLBACK);
    ok('само <> → SMTP_FROM_NAME', bf('<>') === FALLBACK);
  }

  section('6. Едж: кирилица → RFC 2047 encoded words, минава дословно през denomailer');
  if (E) {
    const r = bf('Цветелина Тенева · ТеМАХ');
    if (ok('връща обект {mail, name}', r && typeof r === 'object', JSON.stringify(r))) {
      ok('адресът е SMTP_USER', r.mail === 'portal@temax.bg');
      ok('name е encoded word(s)', /^ =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=(\r\n =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=)*$/.test(r.name),
        JSON.stringify(r.name));
      ok('denomailer НЕ го пипа (ASCII, не започва с =?)', !qpInlineTouches(r.name));
      ok('декодира се обратно дословно', decodeName(r.name) === 'Цветелина Тенева · ТеМАХ', decodeName(r.name));
      ok('всяка дума <= 75 знака', r.name.trim().split(/\r\n /).every(w => w.length <= 75));
      const firstLine = ('From: ' + ' ' + r.name + ' <' + r.mail + '>').split('\r\n')[0];
      ok('първият ред на заглавието <= 78', firstLine.length <= 78, String(firstLine.length));
    }
    const inj = bf('Зло\r\nBcc: a@b.c');
    ok('инжекция: в name няма CR/LF извън сгъването', inj && typeof inj === 'object' &&
      !/[\r\n](?! =\?)/.test(inj.name) && decodeName(inj.name).indexOf('\n') < 0, JSON.stringify(inj));
    const asc = bf('ivan@temax.bg');
    ok('ASCII име → quoted-string', asc && asc.name === '"ivan@temax.bg"', JSON.stringify(asc));
    ok('quoted-string не се пипа от denomailer', asc && !qpInlineTouches(asc.name));
    const lng = bf('Я'.repeat(100));
    ok('100 знака кирилица → декодира се до 64', lng && Array.from(decodeName(lng.name)).length === 64);
  }

  section('7. Deno.serve: адресът е SMTP_USER, името е body.from_name');
  {
    ok('client.send вика buildFrom(body.from_name, SMTP_FROM_NAME, SMTP_USER)',
      /from:\s*buildFrom\(body\.from_name,\s*SMTP_FROM_NAME,\s*SMTP_USER\)/.test(src));
    ok('старият низов From го няма в send()', src.indexOf("from: SMTP_FROM_NAME + ' <'") < 0);
    ok('няма body.from (адрес от клиента)', !/body\.from\b(?!_name)/.test(src));
  }

  report();
})();
