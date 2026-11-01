/* users.password (чист текст) — никой код не я чете и не я пише.

   Етап 5б от затварянето на users (01.11.2026, users-drop-password-schema.sql)
   маха колоната. Този тест пази да не се върне: статично сканира всеки .js в
   корена и всеки .ts/.js в supabase/functions/ за думата `password` като
   отделен идентификатор — не `password_hash`, не `new_password`, не
   `auth-set-password`. Всяко попадение трябва да е ТОЧНО (по съдържание на
   реда, без отстъпа) в белия списък долу: поле type="password", тялото към
   auth-login, SMTP паролата в resend-email, коментари. Промени ли се ред от
   белия списък — дори само да се допише нещо в него — тестът пада и редът
   трябва да се прегледа на ръка.

   Извън сканирането: supabase/functions/resend-email/vendor/ (чужд код —
   denomailer, SMTP), README.md (документация).

   Мутационна проверка (01.11.2026), всеки мутант пуснат срещу този тест:
     - admin.js: 'password' в select-а на users в loadUsers      — СЪБОРЕН (1 ❌)
     - admin-users/handler.ts: "password" в CREATE_FIELDS        — СЪБОРЕН (1 ❌)
     - auth-login: .select("id,email,password,password_hash,…")  — СЪБОРЕН (1 ❌)
     - auth-set-password: .update({ password_hash: hash, password: null }) — СЪБОРЕН (1 ❌)
     - ред от белия списък махнат от кода (застарял списък)      — СЪБОРЕН (1 ❌)
   Неубити мутанти: няма. Базата преди кръга: exit 0.

   Пускане:  node tests/users-no-plain-password.test.js .
*/
const fs = require('fs');
const path = require('path');
const { ok, section, report } = require('../.claude/skills/tmax-jsdom-test/harness');

const ROOT = path.resolve(process.argv[2] || '.');
const WORD = /(?<![A-Za-z0-9_-])password(?![A-Za-z0-9_-])/;

// файл (спрямо корена, с /) → редове без отстъпа, допустими като попадение
const ALLOWED = {
  'admin.js': [
    `'<input class="fi" id="um-pass" type="password" placeholder="'+(isEdit?'••••••••':'минимум 4 символа')+'" style="padding-right:40px;">'+`,
    `inp.type=inp.type==='password'?'text':'password';`,
    `if(eye)eye.textContent=inp.type==='password'?'👁':'🙈';`,
  ],
  'shared.js': [
    // тялото към auth-login, не колона
    `body:JSON.stringify({email:email,password:pass})`,
  ],
  'supabase/functions/admin-users/handler.ts': [
    `// Бели списъци. Нищо извън тях не стига до базата — нито password,`,
  ],
  'supabase/functions/admin-users/handler.test.ts': [
    // списъкът на ЗАБРАНЕНИТЕ полета в теста на функцията
    `const FORBIDDEN_ALWAYS = ["password", "password_hash", "history_pin_hash", "id", "created_at"];`,
  ],
  'supabase/functions/auth-login/index.ts': [
    // паролата от тялото на заявката, сравнява се само с password_hash
    `const password = (body?.password || "").toString();`,
    `if (!email || !password) {`,
    `// Само bcrypt. Колоната password (чист текст) не се чете — от 30.09.2026`,
    `const valid = user.password_hash ? bcrypt.compareSync(password, user.password_hash) : false;`,
  ],
  'supabase/functions/auth-set-password/index.ts': [
    `// Само bcrypt — колоната password (чист текст) не се чете.`,
  ],
  'supabase/functions/resend-email/send-email.ts': [
    // SMTP акаунтът, не users
    `auth: { username: SMTP_USER, password: SMTP_PASSWORD },`,
  ],
};

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'vendor' || e.name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.(ts|js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = fs.readdirSync(ROOT).filter(f => /\.js$/.test(f)).map(f => path.join(ROOT, f))
  .concat(walk(path.join(ROOT, 'supabase', 'functions'), []));

section('Сканирани файлове');
ok('има .js в корена (shared.js)', files.some(f => path.basename(f) === 'shared.js'));
ok('има supabase/functions/auth-login/index.ts', files.some(f => /auth-login[\\/]index\.ts$/.test(f)));
ok('има supabase/functions/admin-users/handler.ts', files.some(f => /admin-users[\\/]handler\.ts$/.test(f)));

section('Всяко попадение на `password` е в белия списък');
const seen = {};
const bad = [];
for (const f of files) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!WORD.test(line)) return;
    const t = line.trim();
    if ((ALLOWED[rel] || []).indexOf(t) >= 0) { seen[rel + '\n' + t] = true; return; }
    bad.push(rel + ':' + (i + 1) + '  ' + t.slice(0, 160));
  });
}
ok('нула попадения извън белия списък', bad.length === 0, '\n      ' + bad.join('\n      '));

section('Белият списък не е застарял');
const stale = [];
Object.keys(ALLOWED).forEach(rel => ALLOWED[rel].forEach(t => {
  if (!seen[rel + '\n' + t]) stale.push(rel + '  ' + t.slice(0, 120));
}));
ok('всеки ред от белия списък още съществува', stale.length === 0,
   'махни го от ALLOWED:\n      ' + stale.join('\n      '));

section('Регекс-проверка на самия детектор');
ok('хваща select=id,password', WORD.test("sbGet('users','select=id,password,email')"));
ok('хваща "password" в масив', WORD.test('["email", "password"]'));
ok('хваща password: в обект', WORD.test('.update({ password: null })'));
ok('не хваща password_hash', !WORD.test('select("id,password_hash")'));
ok('не хваща new_password', !WORD.test('{new_password:newPass}'));
ok('не хваща auth-set-password', !WORD.test("'/functions/v1/auth-set-password'"));

report();
